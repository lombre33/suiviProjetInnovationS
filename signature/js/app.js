/**
 * Interface de l'outil de signature : trois colonnes côte à côte (instances, notifications de
 * l'instance, PDF), l'interrupteur de signature au bout de chaque ligne, et la fenêtre « Ma signature ».
 *
 * Tout texte venant du document passe par textContent (jamais innerHTML) : la page est sous une
 * politique de sécurité qui interdit aussi le style en ligne, d'où des classes et des affectations
 * de style par le DOM.
 */
(function (global) {
  'use strict';

  const U = global.SigUtil;
  const A = global.SigAcl;
  const { SigError } = U;

  // Colonnes que Grist fait associer au widget (noms libres côté document). Les noms ci-dessous
  // sont ceux de la table Export_VP prévue avec la page Instances.
  const COLUMNS = [
    { name: 'Instance', title: 'Instance', type: 'Text,Choice' },
    { name: 'Date_instance', title: 'Date de l’instance', type: 'Date,DateTime', optional: true },
    { name: 'Acronyme', title: 'Acronyme du projet', type: 'Text,Choice' },
    { name: 'Porteur', title: 'Porteur', type: 'Text,Choice', optional: true },
    { name: 'Labo_porteur', title: 'Laboratoire porteur', type: 'Text,Choice', optional: true },
    { name: 'Montant', title: 'Montant', type: 'Numeric,Int', optional: true },
    { name: 'PDF_notification', title: 'PDF de la notification (reçu)', type: 'Attachments' },
    { name: 'Signee', title: 'Signée', type: 'Bool' },
    { name: 'Signee_le', title: 'Signée le', type: 'Date,DateTime', optional: true },
    { name: 'PDF_signe', title: 'PDF signé (à renvoyer)', type: 'Attachments' },
  ];
  const REQUIRED = COLUMNS.filter(col => !col.optional).map(col => col.name);

  const MESSAGES = {
    'not-secured': 'La signature n’est pas encore protégée : ouvrez « Ma signature » pour la sécuriser.',
    'not-owner': 'Seul le propriétaire du document peut utiliser la signature.',
    'no-signature': 'Aucune signature enregistrée : importez votre image dans « Ma signature ».',
    'anchor-not-found': err => `Le repère « ${err.anchorText} » est introuvable dans ce PDF. Rien n’a été signé.`,
    'no-room': 'Pas assez de place sous le repère pour poser la signature. Rien n’a été signé.',
    'pdf-invalid': 'Ce fichier n’est pas un PDF lisible. Rien n’a été signé.',
    'pdf-encrypted': 'Ce PDF est protégé par un mot de passe : impossible de le signer.',
    'image-invalid': 'L’image de la signature est illisible (PNG ou JPEG attendu).',
    'image-too-big': 'Image trop volumineuse (2 Mo au maximum).',
    'no-pdf': 'Cette ligne n’a pas de PDF à signer.',
    'attachment-missing': 'Le fichier est introuvable dans le document.',
    denied: 'Le document refuse cet accès.',
    network: 'Connexion à Grist impossible : réessayez dans un instant.',
    'too-big': 'Ce fichier est trop volumineux.',
  };
  const messageFor = err => {
    const entry = MESSAGES[err && err.code];
    return typeof entry === 'function' ? entry(err) : (entry || 'L’opération a échoué : rien n’a été modifié.');
  };

  // ------------------------------------------------------------------ données

  const text = value => (value == null ? '' : String(value).trim());

  // Lignes du widget, avec les identifiants de colonnes choisis par le mappage de Grist.
  function normalizeRows(records, m) {
    return records.map(record => ({
      id: record.id,
      instance: text(record[m.Instance]) || 'Instance sans nom',
      date: m.Date_instance ? record[m.Date_instance] : null,
      acronyme: text(record[m.Acronyme]) || `#${record.id}`,
      porteur: m.Porteur ? text(record[m.Porteur]) : '',
      labo: m.Labo_porteur ? text(record[m.Labo_porteur]) : '',
      montant: m.Montant ? record[m.Montant] : null,
      notifIds: U.attachmentIds(record[m.PDF_notification]),
      signee: U.toBool(record[m.Signee]),
      signeeLe: m.Signee_le ? record[m.Signee_le] : null,
      signedIds: U.attachmentIds(record[m.PDF_signe]),
    }));
  }

  // Instances : celles qui ont des notifications à signer en tête, puis les autres, chacune par date
  // décroissante. `divider` marque la première instance « tout signé » qui suit des instances à signer.
  function groupInstances(rows) {
    const groups = new Map();
    rows.forEach(row => {
      const date = U.toDate(row.date);
      const day = date ? date.toISOString().slice(0, 10) : '';
      const key = `${row.instance}\u0000${day}`;
      if (!groups.has(key)) groups.set(key, { key, name: row.instance, date: row.date, time: date ? date.getTime() : -Infinity, rows: [] });
      groups.get(key).rows.push(row);
    });
    const list = [...groups.values()].map(group => ({
      ...group,
      rows: group.rows.sort((a, b) => a.acronyme.localeCompare(b.acronyme, 'fr')),
      total: group.rows.length,
      pending: group.rows.filter(row => !row.signee).length,
    }));
    list.sort((a, b) => (b.pending > 0) - (a.pending > 0) || b.time - a.time || a.name.localeCompare(b.name, 'fr'));
    list.forEach((group, index) => { group.divider = index > 0 && group.pending === 0 && list[index - 1].pending > 0; });
    return list;
  }

  // ------------------------------------------------------------------ DOM

  function h(tag, attrs, ...kids) {
    const el = global.document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value == null || value === false) return;
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value === true ? '' : value);
    });
    kids.flat().forEach(kid => {
      if (kid == null || kid === false) return;
      el.append(kid.nodeType ? kid : global.document.createTextNode(String(kid)));
    });
    return el;
  }

  // Icônes : balisage fixe écrit ici (aucune donnée du document n'y entre).
  const ICONS = {
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    shield: '<path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z"/><path d="m9 12 2 2 4-4"/>',
    warn: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    download: '<path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
  };
  function icon(name, size) {
    const svg = global.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', size || 16);
    svg.setAttribute('height', size || 16);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONS[name]; // eslint-disable-line no-unsanitized/property -- constante de ce fichier
    return svg;
  }

  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

  // ------------------------------------------------------------------ application

  function create({ grist, root, io, signer, now = () => new Date(), viewFactory = global.SigView.create }) {
    const state = {
      rows: [], cols: null,
      setup: null, signature: { hasImage: false, url: null },
      instKey: null, rowId: null,
      busy: new Set(), modal: null, toast: null,
      viewKey: null, viewBytes: null, viewName: '',
    };
    const cache = new Map();
    let viewSeq = 0;
    let queue = Promise.resolve();
    let toastTimer = null;

    // ---- squelette (créé une fois : le PDF et les défilements survivent aux rendus)
    const els = {
      sum: h('span', { class: 'sum' }),
      sigBtn: h('button', { type: 'button', class: 'btn sig-btn', onclick: () => openSigModal(null) }),
      instCount: h('span', { class: 'pane-meta' }),
      instList: h('div', { class: 'list' }),
      hint: h('div', { class: 'hint' }),
      projTitle: h('h2', { class: 'pane-name' }),
      projBar: h('span', { class: 'prog', 'aria-hidden': 'true' }, h('span', { class: 'prog-in' })),
      projMeta: h('span', { class: 'pane-meta' }),
      projList: h('div', { class: 'plist' }),
      pdfBar: h('div', { class: 'pdf-bar' }),
      pdfScroll: h('div', { class: 'pdf-scroll' }),
      modalHost: h('div'),
      toastHost: h('div'),
    };
    els.progIn = els.projBar.firstChild;
    els.instPane = h('section', { class: 'pane pane-insts', 'aria-label': 'Instances' },
      h('div', { class: 'pane-head' }, h('h2', { class: 'pane-title', text: 'Instances' }), h('span', { class: 'grow' }), els.instCount),
      h('div', { class: 'scroll' }, els.instList));
    els.projPane = h('section', { class: 'pane pane-projs', 'aria-label': 'Notifications de l’instance' },
      h('div', { class: 'pane-head' }, els.projTitle, h('span', { class: 'grow' }), els.projBar, els.projMeta),
      h('div', { class: 'phead' },
        h('div', { class: 'pgrid' }, h('span', { text: 'Projet' }), h('span', { text: 'Porteur' }), h('span', { class: 'col-labo', text: 'Labo porteur' }), h('span', { class: 'num', text: 'Montant' })),
        h('div', { class: 'phead-sign', text: 'Signature' })),
      h('div', { class: 'scroll' }, els.projList));
    els.pdfPane = h('section', { class: 'pane pane-pdf', 'aria-label': 'Aperçu de la notification' }, els.pdfBar, els.pdfScroll);
    els.work = h('main', { class: 'work' }, els.instPane, els.hint, els.projPane, els.pdfPane);
    const view = viewFactory(els.pdfScroll);

    root.replaceChildren(
      h('div', { class: 'sg' },
        h('header', { class: 'head' },
          h('h1', { class: 'brand' }, h('span', { class: 'mark' }, icon('pen', 17)), 'Signature des notifications'),
          els.sum, h('span', { class: 'grow' }), els.sigBtn),
        els.work, els.modalHost, els.toastHost));

    // ---- sélection
    const instances = () => groupInstances(state.rows);
    const currentInstance = () => instances().find(group => group.key === state.instKey) || null;
    const currentRow = () => {
      const inst = currentInstance();
      return inst ? inst.rows.find(row => row.id === state.rowId) || null : null;
    };

    // ---- rendu
    function render() {
      const focused = global.document.activeElement;
      const focusKey = focused && focused.dataset ? focused.dataset.fk : null;
      const groups = instances();
      if (state.instKey && !groups.some(group => group.key === state.instKey)) { state.instKey = null; state.rowId = null; }
      const inst = groups.find(group => group.key === state.instKey) || null;
      if (inst && !inst.rows.some(row => row.id === state.rowId)) state.rowId = null;
      const row = inst ? inst.rows.find(r => r.id === state.rowId) : null;

      renderHeader(groups);
      renderInstances(groups);
      const configured = !!state.cols;
      els.instPane.hidden = !configured;
      els.hint.hidden = !(!configured || !inst);
      els.projPane.hidden = !(configured && inst);
      els.pdfPane.hidden = !(configured && inst && row);
      if (!configured) fillSetupHint();
      else if (!inst) fillChooseHint(groups);
      if (configured && inst) renderProjects(inst);
      if (configured && inst && row) renderPdfBar(row);
      syncViewer();

      if (focusKey) {
        const again = root.querySelector(`[data-fk="${focusKey}"]`);
        if (again && again !== global.document.activeElement) again.focus();
      }
    }

    function renderHeader(groups) {
      const pending = groups.reduce((sum, group) => sum + group.pending, 0);
      els.sum.className = `sum${!state.rows.length ? ' is-idle' : pending ? '' : ' is-clear'}`;
      els.sum.textContent = !state.rows.length ? 'Aucune notification' : pending ? `${plural(pending, 'notification', 'notifications')} à signer` : 'Tout est signé';
      const ready = state.setup && state.setup.status === 'ok';
      els.sigBtn.className = `btn sig-btn${ready && state.signature.hasImage ? '' : ' is-missing'}`;
      const label = !ready ? [icon('warn'), 'Ma signature'] : state.signature.hasImage
        ? [h('span', { class: 'sig-thumb' }, state.signature.url ? h('img', { src: state.signature.url, alt: '' }) : null), 'Ma signature']
        : [icon('plus'), 'Ajouter ma signature'];
      els.sigBtn.replaceChildren(...label);
    }

    function renderInstances(groups) {
      els.instCount.textContent = plural(groups.length, 'instance', 'instances');
      els.instList.replaceChildren(...groups.map(group => h('div', null,
        group.divider ? h('div', { class: 'divider' }) : null,
        h('button', {
          type: 'button', 'data-fk': `inst:${encodeURIComponent(group.key)}`,
          class: `inst${group.pending ? ' is-pending' : ''}${group.key === state.instKey ? ' is-selected' : ''}`,
          onclick: () => { state.instKey = group.key; state.rowId = null; render(); },
        },
        h('span', { class: 'inst-main' }, h('span', { class: 'inst-name', text: group.name }), h('span', { class: 'inst-date', text: U.formatDate(group.date, { utc: true }) })),
        group.pending
          ? h('span', { class: 'badge badge-todo' }, h('span', { 'aria-hidden': 'true', text: String(group.pending) }), h('span', { class: 'vh', text: `${group.pending} à signer` }))
          : h('span', { class: 'badge badge-done' }, icon('check', 13), h('span', { class: 'vh', text: 'Tout signé' }))))));
      if (!groups.length && state.cols) els.instList.replaceChildren(h('p', { class: 'empty', text: 'Aucune notification reçue pour l’instant.' }));
    }

    function fillSetupHint() {
      els.hint.replaceChildren(icon('doc', 30), h('span', null, h('strong', { text: 'Associez les colonnes du widget' }), h('br'),
        `Dans le panneau de création du widget, choisissez les colonnes : ${REQUIRED.map(name => COLUMNS.find(col => col.name === name).title).join(', ')}.`));
    }

    function fillChooseHint(groups) {
      els.hint.replaceChildren(icon('doc', 30), h('span', null, h('strong', { text: groups.length ? 'Choisissez une instance' : 'Rien à signer pour l’instant' }), h('br'),
        groups.length ? 'Les notifications à signer s’affichent ici, projet par projet.' : 'Les notifications mises à disposition par la page Instances apparaîtront ici.'));
    }

    function switchFor(row) {
      const busy = state.busy.has(row.id);
      const noPdf = !row.notifIds.length && !row.signee;
      const label = busy ? 'Signature…' : row.signee ? 'Signée' : noPdf ? 'Pas de PDF' : 'À signer';
      return h('button', {
        type: 'button', role: 'switch', 'aria-checked': row.signee ? 'true' : 'false', 'aria-disabled': noPdf ? 'true' : null,
        'aria-label': `${row.signee ? 'Retirer la signature de' : 'Signer la notification'} ${row.acronyme}`,
        'data-fk': `sw:${row.id}`, title: noPdf ? 'Cette ligne n’a pas encore de PDF' : null,
        class: `sw${busy ? ' is-busy' : row.signee ? ' is-on' : ''}${noPdf ? ' is-off' : ''}`,
        onclick: () => toggle(row.id),
      }, h('span', { class: 'track' }, h('span', { class: 'knob' })), h('span', { class: 'sw-label', text: label }));
    }

    function renderProjects(inst) {
      const done = inst.total - inst.pending;
      els.projTitle.textContent = `${inst.name} · ${U.formatDate(inst.date, { utc: true })}`.replace(/ · $/, '');
      els.progIn.style.width = `${inst.total ? Math.round((done * 100) / inst.total) : 0}%`;
      els.projMeta.textContent = `${done} / ${inst.total} signées`;
      els.projList.replaceChildren(...inst.rows.map(row => h('div', { class: `prow${row.id === state.rowId ? ' is-selected' : ''}` },
        h('button', { type: 'button', class: 'pmain', 'data-fk': `row:${row.id}`, 'aria-label': `Lire la notification ${row.acronyme}`, onclick: () => { state.rowId = row.id; render(); } },
          h('span', { class: 'pgrid' },
            h('span', { class: 'cell acro', text: row.acronyme }),
            h('span', { class: 'cell', title: [row.porteur, row.labo].filter(Boolean).join(' — '), text: row.porteur }),
            h('span', { class: 'cell col-labo', title: row.labo, text: row.labo }),
            h('span', { class: 'cell num', text: U.formatMoney(row.montant) }))),
        h('div', { class: 'signcol' }, switchFor(row)))));
    }

    function renderPdfBar(row) {
      const signed = row.signee && row.signedIds.length;
      state.viewName = `Notification_${row.acronyme}${signed ? '_signe' : ''}.pdf`;
      els.pdfBar.replaceChildren(
        h('div', { class: 'pdf-name' }, icon('doc', 18), h('span', { title: state.viewName, text: state.viewName }),
          signed ? h('span', { class: 'pdf-tag', text: `Signée${row.signeeLe ? ` le ${U.formatDate(row.signeeLe, { time: true })}` : ''}` }) : null),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Réduire', onclick: () => zoom(-0.1) }, icon('minus', 18)),
        h('span', { class: 'zoom-val', id: 'zoom-val', text: `${Math.round(view.getScale() * 100)} %` }),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Agrandir', onclick: () => zoom(0.1) }, icon('plus', 18)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Télécharger le PDF', onclick: downloadView }, icon('download', 18)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fermer l’aperçu', onclick: () => { state.rowId = null; render(); } }, icon('close', 18)));
    }

    async function zoom(step) {
      await view.setScale(view.getScale() + step);
      const label = root.querySelector('#zoom-val');
      if (label) label.textContent = `${Math.round(view.getScale() * 100)} %`;
    }

    function downloadView() {
      if (!state.viewBytes) return;
      const url = URL.createObjectURL(new Blob([state.viewBytes], { type: 'application/pdf' }));
      const link = h('a', { href: url, download: state.viewName });
      global.document.body.append(link);
      link.click();
      link.remove();
      global.setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    // ---- PDF affiché : celui de la ligne choisie (signé s'il l'est, sinon l'original)
    function targetFor(row) {
      if (!row) return null;
      const signedId = row.signee ? row.signedIds[0] : null;
      const id = signedId || row.notifIds[0];
      if (!id) return null;
      return { key: `${row.id}:${id}`, id, cell: { tableId: null, colId: signedId ? state.cols.PDF_signe : state.cols.PDF_notification, rowId: row.id } };
    }

    async function fetchPdf(target) {
      if (cache.has(target.id)) return cache.get(target.id);
      const tableId = await io.mainTableId();
      const bytes = await io.download(target.id, { ...target.cell, tableId });
      cache.set(target.id, bytes);
      if (cache.size > 6) cache.delete(cache.keys().next().value);
      return bytes;
    }

    async function syncViewer() {
      const row = state.cols ? currentRow() : null;
      const target = targetFor(row);
      if (!target) {
        if (state.viewKey) { viewSeq += 1; view.clear(); state.viewKey = null; state.viewBytes = null; }
        if (row && !target) view.fail('Cette ligne n’a pas encore de PDF.');
        return;
      }
      if (target.key === state.viewKey) return;
      state.viewKey = target.key;
      const seq = ++viewSeq;
      try {
        view.fail('Chargement du PDF…');
        const bytes = await fetchPdf(target);
        if (seq !== viewSeq) return;
        state.viewBytes = bytes;
        await view.show(bytes);
        if (seq === viewSeq) { const label = root.querySelector('#zoom-val'); if (label) label.textContent = `${Math.round(view.getScale() * 100)} %`; }
      } catch (err) {
        if (seq === viewSeq) view.fail(err instanceof SigError ? messageFor(err) : 'Ce PDF ne peut pas être affiché.');
      }
    }

    // ---- signer / retirer la signature
    function patchRow(id, changes) {
      const row = state.rows.find(r => r.id === id);
      if (row) Object.assign(row, changes);
    }

    function toggle(rowId) {
      const row = state.rows.find(r => r.id === rowId);
      if (!row || state.busy.has(rowId)) return;
      state.rowId = rowId;
      if (row.signee) { openConfirmUnsign(row); render(); return; }
      if (!row.notifIds.length) { showToast({ text: messageFor({ code: 'no-pdf' }), kind: 'error' }); render(); return; }
      requestSign(row);
    }

    // Une signature à la fois : les demandes suivantes attendent (leur interrupteur indique « Signature… »).
    function requestSign(row) {
      if (!state.cols) return;
      const ready = state.setup && state.setup.status === 'ok' && state.signature.hasImage;
      if (!ready) { openSigModal(row.id); render(); return; }
      state.busy.add(row.id);
      render();
      queue = queue.then(() => doSign(row.id)).catch(() => {});
    }

    async function doSign(rowId) {
      const row = state.rows.find(r => r.id === rowId);
      try {
        if (!row || row.signee) return;
        const { attachmentId, when } = await signer.signRow(row, state.cols);
        patchRow(rowId, { signee: true, signedIds: [attachmentId], signeeLe: Math.floor(when.getTime() / 1000) });
        showToast({ text: `Notification ${row.acronyme} signée`, kind: 'ok', undo: () => undoSign(rowId) });
      } catch (err) {
        if (err && (err.code === 'not-secured' || err.code === 'no-signature' || err.code === 'not-owner')) {
          await refreshSetup();
          openSigModal(rowId);
        }
        showToast({ text: messageFor(err), kind: 'error' });
        if (!(err instanceof SigError)) global.console.error(err);
      } finally {
        state.busy.delete(rowId);
        render();
      }
    }

    async function unsign(row, text) {
      state.busy.add(row.id);
      render();
      try {
        await signer.unsignRow(row, state.cols);
        patchRow(row.id, { signee: false, signedIds: [], signeeLe: null });
        showToast({ text, kind: 'ok' });
      } catch (err) {
        showToast({ text: messageFor(err), kind: 'error' });
      } finally {
        state.busy.delete(row.id);
        render();
      }
    }

    function undoSign(rowId) {
      const row = state.rows.find(r => r.id === rowId);
      if (row && row.signee) unsign(row, `Signature retirée de ${row.acronyme}`);
    }

    // ---- fenêtres
    function closeModal() {
      const modal = state.modal;
      if (!modal) return;
      state.modal = null;
      els.modalHost.replaceChildren();
      if (modal.opener && modal.opener.isConnected) modal.opener.focus();
    }

    function mountModal(content, extra) {
      const opener = global.document.activeElement;
      const dialog = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title', tabindex: '-1' }, content);
      const scrim = h('div', { class: 'scrim', onmousedown: ev => { if (ev.target === scrim) closeModal(); } }, dialog);
      els.modalHost.replaceChildren(scrim);
      state.modal = { ...extra, opener, dialog };
      dialog.focus(); // la fenêtre elle-même : son titre est annoncé, Tab va ensuite au premier bouton
    }

    // Tab reste dans la fenêtre ouverte (le reste de la page est inerte tant qu'elle l'est).
    function trapFocus(ev) {
      const dialog = state.modal && state.modal.dialog;
      if (!dialog || ev.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll('button, input:not([type=file])')].filter(el => !el.disabled && !el.hidden);
      if (!focusable.length) { ev.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = global.document.activeElement;
      if (ev.shiftKey && (active === first || active === dialog)) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && active === last) { ev.preventDefault(); first.focus(); }
    }

    function openConfirmUnsign(row) {
      mountModal([
        h('h2', { id: 'modal-title', text: `Retirer la signature de ${row.acronyme} ?` }),
        h('p', { text: 'Le PDF signé de cette ligne sera retiré et la notification redeviendra « à signer ». Le PDF d’origine est conservé.' }),
        h('div', { class: 'modal-actions' },
          h('button', { type: 'button', class: 'btn', text: 'Annuler', onclick: closeModal }),
          h('button', { type: 'button', class: 'btn btn-danger', text: 'Retirer la signature', onclick: () => { closeModal(); unsign(row, `Signature retirée de ${row.acronyme}`); } })),
      ], { type: 'unsign' });
    }

    function openSigModal(pendingRowId) {
      const input = h('input', {
        type: 'text', class: 'input', id: 'anchor-input', maxlength: '120', value: (state.setup && state.setup.anchor) || A.DEFAULT_ANCHOR,
        'aria-describedby': 'anchor-help', onchange: () => saveAnchor(input.value),
      });
      const file = h('input', { type: 'file', accept: 'image/png,image/jpeg', hidden: true, 'aria-label': 'Image de la signature', onchange: () => importImage(file) });
      const preview = h('div');
      const status = h('div');
      const secureBtn = h('button', { type: 'button', class: 'btn btn-primary', text: 'Sécuriser maintenant', onclick: secureNow });
      const removeBtn = h('button', { type: 'button', class: 'btn btn-danger', text: 'Supprimer', onclick: removeImage });
      const importBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => file.click() });
      const actions = h('div', { class: 'modal-actions' });

      function update() {
        const setup = state.setup;
        const ok = !!setup && setup.status === 'ok';
        const has = ok && state.signature.hasImage;
        preview.className = `sig-box${has ? '' : ' is-empty'}`;
        preview.replaceChildren(...(has && state.signature.url
          ? [h('img', { src: state.signature.url, alt: 'Aperçu de votre signature' })]
          : [icon('pen', 26), h('span', { text: 'Aucune signature enregistrée' })]));
        const lines = [];
        const line = (kind, icn, message) => h('div', { class: `acl${kind ? ` is-${kind}` : ''}` }, icon(icn, 18), h('span', { text: message }));
        if (!setup) lines.push(line('wait', 'shield', 'Vérification de la protection…'));
        else if (ok) lines.push(line('', 'shield', `Table « ${A.TABLE} » : lecture réservée au propriétaire du document.`));
        else if (setup.status === 'not-owner') lines.push(line('bad', 'warn', 'Seul le propriétaire du document peut gérer la signature.'));
        else if (setup.status === 'error') lines.push(line('bad', 'warn', 'Impossible de vérifier la protection de la signature. Rechargez la page.'));
        else lines.push(line('warn', 'warn', 'La table de la signature n’est pas encore protégée. Tant qu’elle ne l’est pas, aucune image n’est importée ni lue.'));
        if (ok && setup.editorsEditStructure) lines.push(line('warn', 'warn', 'Les éditeurs du document peuvent encore modifier sa structure : décochez « Permettre aux éditeurs de modifier la structure » dans les règles d’accès.'));
        status.replaceChildren(...lines);
        input.disabled = !ok;
        importBtn.textContent = has ? 'Remplacer l’image…' : 'Importer une image…';
        importBtn.disabled = !ok;
        removeBtn.hidden = !has;
        const needSecure = !!setup && (setup.status === 'no-table' || setup.status === 'no-rules');
        actions.replaceChildren(...[removeBtn, needSecure ? secureBtn : null, h('button', { type: 'button', class: 'btn', text: 'Fermer', onclick: closeModal }), needSecure ? null : importBtn].filter(Boolean));
      }

      mountModal([
        h('h2', { id: 'modal-title', text: 'Ma signature' }),
        h('p', { text: 'Cette image est apposée sur chaque notification que vous signez. Elle est conservée dans une table que vous seul pouvez lire.' }),
        preview, status,
        h('div', { class: 'field' },
          h('label', { for: 'anchor-input', text: 'Repère de texte du modèle' }), input,
          h('p', { class: 'field-help', id: 'anchor-help', text: 'La signature est posée juste sous ce texte, qui doit figurer dans le PDF. Laissez de la place sous lui dans le modèle.' })),
        actions, file,
      ], { type: 'sig', pending: pendingRowId, update });
      update();
      if (!state.setup) refreshSetup();
    }

    const updateModal = () => { if (state.modal && state.modal.update) state.modal.update(); };

    // ---- état de la signature
    async function refreshSetup() {
      let setup;
      try {
        setup = await io.readSetup();
      } catch (err) {
        global.console.error(err);
        setup = { status: 'error' };
      }
      if (state.signature.url) URL.revokeObjectURL(state.signature.url);
      state.setup = setup;
      state.signature = { hasImage: false, url: null };
      if (setup.status === 'ok' && setup.row && setup.row.imageIds.length) {
        state.signature.hasImage = true;
        try {
          const signature = await io.loadSignature();
          if (signature.bytes) state.signature.url = URL.createObjectURL(new Blob([signature.bytes], { type: U.sniffImage(signature.bytes) === 'png' ? 'image/png' : 'image/jpeg' }));
        } catch (err) {
          global.console.error(err);
        }
      }
      render();
      updateModal();
    }

    async function guarded(task, failureText) {
      try {
        await task();
        return true;
      } catch (err) {
        showToast({ text: err instanceof SigError ? messageFor(err) : failureText, kind: 'error' });
        if (!(err instanceof SigError)) global.console.error(err);
        return false;
      }
    }

    async function secureNow() {
      if (await guarded(() => io.secure(), 'La protection n’a pas pu être posée.')) {
        await refreshSetup();
        if (state.setup && state.setup.status === 'ok') showToast({ text: 'Table de la signature protégée.', kind: 'ok' });
      }
    }

    async function importImage(input) {
      const picked = input.files && input.files[0];
      input.value = '';
      if (!picked) return;
      const pending = state.modal && state.modal.pending;
      const saved = await guarded(async () => {
        if (picked.size > global.SigIO.MAX_IMAGE) throw new SigError('image-too-big');
        await io.saveSignature(new Uint8Array(await picked.arrayBuffer()));
      }, 'L’image n’a pas pu être enregistrée.');
      if (!saved) return;
      await refreshSetup();
      showToast({ text: 'Signature enregistrée.', kind: 'ok' });
      if (pending) {
        const row = state.rows.find(r => r.id === pending);
        closeModal();
        if (row && !row.signee) requestSign(row);
      }
    }

    async function removeImage() {
      if (await guarded(() => io.removeSignature(), 'La signature n’a pas pu être supprimée.')) {
        await refreshSetup();
        showToast({ text: 'Signature supprimée.', kind: 'ok' });
      }
    }

    async function saveAnchor(value) {
      if (await guarded(() => io.saveAnchor(value), 'Le repère n’a pas pu être enregistré.')) await refreshSetup();
    }

    // ---- message temporaire
    function showToast({ text: message, kind, undo }) {
      global.clearTimeout(toastTimer);
      const close = () => { global.clearTimeout(toastTimer); els.toastHost.replaceChildren(); };
      els.toastHost.replaceChildren(h('div', { class: `toast${kind === 'error' ? ' is-error' : ''}`, role: kind === 'error' ? 'alert' : 'status' },
        h('span', { text: message }),
        undo ? h('button', { type: 'button', text: 'Annuler', onclick: () => { close(); undo(); } }) : null,
        h('button', { type: 'button', 'aria-label': 'Fermer', onclick: close }, icon('close'))));
      toastTimer = global.setTimeout(close, kind === 'error' ? 15000 : 8000);
    }

    // ---- Grist
    function setRecords(records, mappings) {
      const complete = mappings && REQUIRED.every(name => mappings[name]);
      state.cols = complete ? { ...mappings } : null;
      state.rows = complete ? normalizeRows(records || [], mappings) : [];
      render();
    }

    function start() {
      grist.ready({ requiredAccess: 'full', columns: COLUMNS });
      grist.onRecords((records, mappings) => setRecords(records, mappings));
      root.addEventListener('keydown', ev => { if (ev.key === 'Escape' && state.modal) closeModal(); else trapFocus(ev); });
      render();
      return refreshSetup();
    }

    return { start, setRecords, refreshSetup, render, state, els, view };
  }

  global.SigApp = { create, COLUMNS, REQUIRED, MESSAGES, messageFor, normalizeRows, groupInstances };
})(window);
