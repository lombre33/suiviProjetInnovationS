/* =========================================================
   COMPOSANT — VISIONNEUSE DE PDF INTÉGRÉE AU WIDGET
   =========================================================
   Affiche un PDF dans une fenêtre du widget, sans dépendre de la visionneuse PDF du navigateur :
   une adresse de pièce jointe de Grist ne s'affiche pas (en-tête « Content-Security-Policy: sandbox »,
   téléchargement forcé selon la version) et un navigateur réglé — ou verrouillé par l'administration
   du poste — pour télécharger les PDF les télécharge même depuis une adresse locale « blob: ».
   Les pages sont dessinées par pdf.js, déjà embarqué pour l'outil de signature (signature/vendor/pdfjs,
   chargé seulement au premier affichage : aucun coût au démarrage). Rien ne sort du widget.

   PdfViewer.open({ title, load, onDownload, opener })
     title       nom du fichier affiché en tête
     load        () => Promise<Uint8Array|ArrayBuffer>, lecture du fichier (erreurs affichées dans la fenêtre)
     onDownload  () => void, bouton « Télécharger » (le fichier reste récupérable quoi qu'il arrive)
     opener      élément qui reprend le focus à la fermeture
   Pas de couche de texte, pas de lien actif : on regarde le document, on n'interagit pas avec lui. Les pages ne
   sont dessinées qu'à l'approche de l'écran (et libérées en s'éloignant) : un PDF de 60 pages ne garde pas 60
   toiles en mémoire. */
(function (global) {
  'use strict';

  const MIN_SCALE = 0.4;
  const MAX_SCALE = 3;
  const ZOOM_STEP = 1.25;
  const MAX_DPR = 2;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const doc = global.document;

  // Dossier du widget (index.html) : celui de ce fichier, ou `window.SUIVI_ROOT` quand une page de test charge les
  // fichiers autrement (comme `window.SIG_ROOT` pour l'outil de signature).
  const ROOT = global.SUIVI_ROOT
    || (doc.currentScript && doc.currentScript.src && new URL('../../', doc.currentScript.src).href)
    || new URL('./', doc.baseURI).href;

  let pdfjsPromise = null;
  function loadPdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import(new URL('signature/vendor/pdfjs/pdf.min.mjs', ROOT).href).then(mod => {
        mod.GlobalWorkerOptions.workerSrc = new URL('signature/vendor/pdfjs/pdf.worker.min.mjs', ROOT).href;
        return mod;
      });
      pdfjsPromise.catch(() => { pdfjsPromise = null; }); // un échec de chargement (réseau) se retente à l'ouverture suivante
    }
    return pdfjsPromise;
  }

  // Un PDF commence par « %PDF- » (tolérance : quelques octets avant, comme la spécification).
  function looksLikePdf(bytes) {
    const head = bytes.subarray(0, Math.min(1024, bytes.length));
    for (let i = 0; i + 4 < head.length; i++) {
      if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46 && head[i + 4] === 0x2d) return true;
    }
    return false;
  }

  const ICON_DOWNLOAD = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
  const ICON_CLOSE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>';
  const el = (tag, className, attrs) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  };

  let current = null; // une seule visionneuse à la fois

  // Libère tout ce qu'une session tient (rendus en cours, observateur, document pdf.js) ; sert à la fenêtre comme à l'affichage intégré.
  function release(session) {
    session.closed = true;
    session.observer?.disconnect();
    session.pages.forEach(page => { try { page.task?.cancel(); } catch (err) { /* déjà terminé */ } });
    try { session.pdf?.destroy(); } catch (err) { /* déjà détruit */ }
  }
  function close() {
    const session = current;
    if (!session) return;
    current = null;
    release(session);
    doc.removeEventListener('keydown', session.onKey, true);
    session.overlay.remove();
    if (session.opener && session.opener.isConnected && session.opener.focus) session.opener.focus({ preventScroll: true });
  }

  function showMessage(session, node) { session.body.replaceChildren(node); }
  function loadingNote() {
    const note = el('p', 'pdfv-note', { role: 'status' });
    note.textContent = 'Chargement du PDF…';
    return note;
  }
  // Message d'échec avec son détail technique (diagnostic) ; le bouton « Télécharger » reste le recours.
  function failure(session, headline, err) {
    const detail = err && err.message ? err.message : String(err || '');
    console.warn(`Visionneuse PDF — ${headline}`, err);
    const box = el('div', 'pdfv-error', { role: 'alert' });
    const strong = el('strong');
    strong.textContent = headline;
    const reason = el('p');
    reason.textContent = detail ? `Détail : ${detail}` : '';
    const hint = el('p');
    hint.textContent = 'Le bouton « Télécharger » enregistre le fichier pour l\'ouvrir avec le lecteur de votre ordinateur.';
    box.append(strong);
    if (detail) box.append(reason);
    box.append(hint);
    showMessage(session, box);
    session.count.textContent = '';
  }

  // ── Pages : un conteneur de la bonne taille par page, la toile n'existe que près de l'écran ──
  function sizeOf(entry, scale) {
    const base = entry.base;
    return { width: Math.floor(base.width * scale), height: Math.floor(base.height * scale) };
  }
  function layoutPage(entry, scale) {
    const size = sizeOf(entry, scale);
    entry.box.style.width = `${size.width}px`;
    entry.box.style.height = `${size.height}px`;
  }
  async function renderPage(session, entry) {
    if (entry.rendered || entry.task || entry.loading || session.closed) return;
    const ticket = ++entry.ticket;
    if (!entry.page) {
      // Les pages autres que la première ne sont demandées à pdf.js qu'à leur approche : ouverture immédiate même
      // pour un long document. Leur taille réelle remplace celle de la première si elle diffère.
      entry.loading = true;
      try { entry.page = await session.pdf.getPage(entry.number); } catch (err) { entry.loading = false; return; }
      entry.loading = false;
      if (session.closed || entry.ticket !== ticket) return;
      const real = entry.page.getViewport({ scale: 1 });
      if (real.width !== entry.base.width || real.height !== entry.base.height) { entry.base = real; layoutPage(entry, session.scale); }
    }
    const dpr = Math.min(MAX_DPR, global.devicePixelRatio || 1);
    const viewport = entry.page.getViewport({ scale: session.scale * dpr });
    const canvas = el('canvas', 'pdfv-canvas', { role: 'img', 'aria-label': `Page ${entry.number} sur ${session.pdf.numPages}` });
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
    canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
    const task = entry.page.render({ canvasContext: canvas.getContext('2d'), viewport });
    entry.task = task;
    try {
      await task.promise;
    } catch (err) {
      if (entry.ticket === ticket) entry.task = null;
      if (err && err.name === 'RenderingCancelledException') return; // zoom, page quittée ou fenêtre fermée
      if (!session.closed) console.warn(`Visionneuse PDF — page ${entry.number}`, err);
      return;
    }
    if (entry.ticket !== ticket || session.closed) return;
    entry.task = null;
    entry.box.replaceChildren(canvas);
    entry.box.dataset.rendered = '1';
    entry.rendered = true;
  }
  function releasePage(entry) {
    entry.ticket += 1;
    try { entry.task?.cancel(); } catch (err) { /* déjà terminé */ }
    entry.task = null;
    if (entry.rendered) { entry.box.replaceChildren(); delete entry.box.dataset.rendered; entry.rendered = false; }
  }
  // (Ré)observe toutes les pages : l'observateur renvoie alors l'état de chacune, donc les pages visibles se dessinent.
  function watchPages(session) {
    session.observer?.disconnect();
    session.observer = new IntersectionObserver(changes => {
      changes.forEach(change => {
        const entry = session.pages[Number(change.target.dataset.page) - 1];
        if (!entry) return;
        if (change.isIntersecting) renderPage(session, entry); else releasePage(entry);
      });
    }, { root: session.body, rootMargin: '900px 0px' });
    session.pages.forEach(entry => session.observer.observe(entry.box));
  }
  function setScale(session, next) {
    const scale = clamp(next, MIN_SCALE, MAX_SCALE);
    if (!session.pdf || scale === session.scale) return;
    const ratio = session.body.scrollHeight ? session.body.scrollTop / session.body.scrollHeight : 0;
    session.scale = scale;
    session.pages.forEach(entry => { releasePage(entry); layoutPage(entry, scale); });
    session.zoomLabel.textContent = `${Math.round(scale * 100)} %`;
    session.zoomOut.disabled = scale <= MIN_SCALE + 1e-6;
    session.zoomIn.disabled = scale >= MAX_SCALE - 1e-6;
    session.body.scrollTop = ratio * session.body.scrollHeight;
    watchPages(session);
  }

  async function run(session, load) {
    showMessage(session, loadingNote());
    // pdf.js se charge pendant la lecture du fichier (et déjà en mémoire dès la 2e ouverture).
    const engine = loadPdfjs();
    engine.catch(() => { /* l'échec est signalé plus bas, une fois le fichier lu */ });
    let bytes;
    try {
      const raw = await load();
      bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    } catch (err) {
      if (!session.closed) failure(session, 'Le fichier n\'a pas pu être lu.', err);
      return;
    }
    if (session.closed) return;
    if (!looksLikePdf(bytes)) { failure(session, 'Ce fichier n\'est pas un PDF.', null); return; }
    let pdfjs;
    try { pdfjs = await engine; } catch (err) {
      if (!session.closed) failure(session, 'La visionneuse n\'a pas pu démarrer.', err);
      return;
    }
    if (session.closed) return;
    try {
      // pdf.js détache le tampon qu'on lui passe : il travaille sur une copie. isEvalSupported:false : jamais
      // d'évaluation dynamique de code venant d'un PDF.
      session.pdf = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, enableXfa: false }).promise;
      if (session.closed) { session.pdf.destroy(); return; }
      const pdf = session.pdf;
      const first = await pdf.getPage(1);
      if (session.closed) return;
      const base = first.getViewport({ scale: 1 });
      const pages = Array.from({ length: pdf.numPages }, (_, index) => ({
        number: index + 1, page: index === 0 ? first : null, base, box: el('div', 'pdfv-page', { 'data-page': String(index + 1) }),
        task: null, ticket: 0, rendered: false, loading: false
      }));
      session.pages = pages;
      const room = session.body.clientWidth ? session.body.clientWidth - 32 : 0;
      session.scale = room ? clamp(room / pages[0].base.width, MIN_SCALE, 1.6) : 1;
      pages.forEach(entry => layoutPage(entry, session.scale));
      const holder = el('div', 'pdfv-pages');
      holder.append(...pages.map(entry => entry.box));
      showMessage(session, holder);
      session.count.textContent = pdf.numPages > 1 ? `${pdf.numPages} pages` : '1 page';
      session.zoomLabel.textContent = `${Math.round(session.scale * 100)} %`;
      session.zoomOut.disabled = session.scale <= MIN_SCALE + 1e-6;
      session.zoomIn.disabled = session.scale >= MAX_SCALE - 1e-6;
      watchPages(session);
    } catch (err) {
      if (!session.closed) failure(session, 'Ce PDF ne peut pas être affiché.', err);
    }
  }

  function open({ title, load, onDownload, opener } = {}) {
    close();
    const overlay = el('div', 'pdfv-overlay', { 'data-pdf-viewer': '' });
    const dialog = el('div', 'pdfv-dialog', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pdfv-title' });
    const bar = el('header', 'pdfv-bar');
    const heading = el('h2', 'pdfv-title', { id: 'pdfv-title', title: title || 'PDF' });
    heading.textContent = title || 'PDF';
    const count = el('span', 'pdfv-count');
    const zoom = el('div', 'pdfv-zoom', { role: 'group', 'aria-label': 'Zoom' });
    const zoomOut = el('button', 'pdfv-btn', { type: 'button', 'data-pdfv-zoom-out': '', 'aria-label': 'Réduire', title: 'Réduire' });
    zoomOut.textContent = '−';
    const zoomLabel = el('span', 'pdfv-zoom-label', { 'aria-live': 'polite' });
    const zoomIn = el('button', 'pdfv-btn', { type: 'button', 'data-pdfv-zoom-in': '', 'aria-label': 'Agrandir', title: 'Agrandir' });
    zoomIn.textContent = '+';
    zoomOut.disabled = zoomIn.disabled = true;
    zoom.append(zoomOut, zoomLabel, zoomIn);
    const download = el('button', 'pdfv-btn pdfv-download', { type: 'button', 'data-pdfv-download': '', title: 'Télécharger le fichier' });
    download.innerHTML = `${ICON_DOWNLOAD}<span>Télécharger</span>`;
    const closeBtn = el('button', 'pdfv-btn pdfv-close', { type: 'button', 'data-pdfv-close': '', 'aria-label': 'Fermer', title: 'Fermer (Échap)' });
    closeBtn.innerHTML = ICON_CLOSE;
    bar.append(heading, count, zoom, download, closeBtn);
    const body = el('div', 'pdfv-body', { tabindex: '0', 'data-pdfv-body': '' });
    dialog.append(bar, body);
    overlay.append(dialog);
    doc.body.append(overlay);

    const session = { overlay, body, count, zoomLabel, zoomOut, zoomIn, opener, pdf: null, pages: [], scale: 1, observer: null, closed: false, onKey: null };
    session.onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key !== 'Tab') return;
      // Le focus reste dans la fenêtre : Tab sur le dernier élément revient au premier, et inversement.
      const focusable = Array.from(dialog.querySelectorAll('button:not([disabled]), [tabindex="0"]'));
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!dialog.contains(doc.activeElement)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    doc.addEventListener('keydown', session.onKey, true);
    overlay.addEventListener('mousedown', event => { if (event.target === overlay) close(); });
    closeBtn.addEventListener('click', close);
    zoomOut.addEventListener('click', () => setScale(session, session.scale / ZOOM_STEP));
    zoomIn.addEventListener('click', () => setScale(session, session.scale * ZOOM_STEP));
    download.addEventListener('click', () => { if (typeof onDownload === 'function') onDownload(); });
    current = session;
    closeBtn.focus({ preventScroll: true });
    run(session, load);
    return session;
  }

  // Affichage INTÉGRÉ : le même rendu, sans fenêtre ni barre d'outils, dans un élément de la page (le volet « courrier » de la page
  // Instances). `host` est l'élément qui défile : les pages s'y rangent à sa largeur (le texte et le zoom de la fenêtre ne s'y affichent pas).
  // Rend { destroy() } : à appeler avant de vider ou de retirer l'élément, sinon les rendus en cours continuent en arrière-plan.
  // Plusieurs affichages intégrés peuvent coexister avec la fenêtre : chaque session est indépendante.
  function mount(host, { load } = {}) {
    const session = {
      overlay: null, body: host, count: el('span'), zoomLabel: el('span'), zoomOut: el('button'), zoomIn: el('button'),
      opener: null, pdf: null, pages: [], scale: 1, observer: null, closed: false, onKey: null
    };
    host.replaceChildren();
    run(session, load);
    return { destroy() { release(session); host.replaceChildren(); } };
  }

  // Chargement anticipé (à appeler au repos, quand un PDF a des chances d'être ouvert) : le module pdf.js est lu, et le
  // fichier du worker (1,4 Mo) est préchargé dans le cache du navigateur, sans le lancer. Le premier clic ouvre alors
  // aussi vite que les suivants. Sans effet si déjà fait.
  let preloaded = false;
  function preload() {
    if (preloaded) return;
    preloaded = true;
    loadPdfjs().catch(() => { preloaded = false; });
    try {
      const link = doc.createElement('link');
      link.rel = 'prefetch';
      link.href = new URL('signature/vendor/pdfjs/pdf.worker.min.mjs', ROOT).href;
      doc.head.appendChild(link);
    } catch (err) { /* sans importance : le worker se chargera à l'ouverture */ }
  }

  global.PdfViewer = { open, mount, close, preload, isOpen: () => !!current, looksLikePdf };
}(window));
