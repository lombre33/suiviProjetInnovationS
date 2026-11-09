/**
 * Pose la signature dans le PDF d'une notification.
 *
 * 1. pdf.js lit le texte du PDF et retrouve le repère du modèle (ex. « Le Vice-Président, ») : la
 *    signature se pose juste en dessous, jamais à une position fixe (un modèle qui change de mise en
 *    page garde sa signature au bon endroit). Repère introuvable : on refuse, on ne devine pas.
 * 2. pdf-lib incruste l'image et une ligne « Signé électroniquement le … ».
 *
 * Les calculs de position sont faits dans l'espace visuel de la page (origine en haut à gauche, y vers
 * le bas) puis ramenés dans l'espace du PDF : une page tournée (/Rotate) reçoit la signature à
 * l'endroit, sous le repère tel qu'on le voit. pdf.js n'est chargé qu'à la demande (module ES) ;
 * pdf-lib est un script classique de la page (`window.PDFLib`).
 */
(function (global) {
  'use strict';

  const { SigError, normalizeText, sniffImage, isPdf } = global.SigUtil;
  // Dossier de l'outil (signature/) : celui de la page, ou `window.SIG_ROOT` quand une page de test charge ces fichiers autrement.
  const ROOT = global.SIG_ROOT || (global.document && global.document.currentScript && new URL('../', global.document.currentScript.src).href) || new URL('./', global.location.href).href;

  // Gabarit de la signature, en points PDF (1 pt = 1/72 pouce ; une page A4 mesure 595 × 842).
  const LAYOUT = { maxWidth: 170, maxHeight: 64, gap: 6, labelSize: 7, labelHeight: 11, margin: 18 };

  let pdfjsPromise = null;
  function loadPdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import(new URL('vendor/pdfjs/pdf.min.mjs', ROOT).href).then(mod => {
        mod.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', ROOT).href;
        return mod;
      });
      pdfjsPromise.catch(() => { pdfjsPromise = null; });
    }
    return pdfjsPromise;
  }

  // Document pdf.js ouvert sur une COPIE des octets (pdf.js détache le tampon qu'on lui passe).
  // `isEvalSupported:false` : jamais d'évaluation dynamique de code venant d'un PDF.
  async function openPdf(bytes) {
    const pdfjs = await loadPdfjs();
    try {
      return await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, enableXfa: false }).promise;
    } catch (err) {
      throw new SigError(err && err.name === 'PasswordException' ? 'pdf-encrypted' : 'pdf-invalid', err && err.message);
    }
  }

  // Éléments de texte de `items` qui forment `needle` (texte normalisé). Le texte d'une page est mis
  // bout à bout après normalisation : le repère se retrouve même coupé en plusieurs morceaux, avec
  // d'autres accents, une autre casse ou une autre ponctuation. La DERNIÈRE occurrence l'emporte : le
  // bloc de signature est en bas du document, le même texte peut aussi figurer dans le corps.
  function matchItems(items, needle) {
    let flat = '';
    const owner = [];
    items.forEach((item, index) => {
      if (!item || typeof item.str !== 'string' || !item.str) return;
      const text = normalizeText(item.str);
      for (let i = 0; i < text.length; i += 1) owner.push(index);
      flat += text;
    });
    const at = flat.lastIndexOf(needle);
    if (at < 0) return null;
    return [...new Set(owner.slice(at, at + needle.length))].map(index => items[index]);
  }

  // Passage de l'espace du PDF à l'espace visuel : X = a·x + c·y + e, Y = b·x + d·y + f (matrice du
  // `viewport` de pdf.js, échelle 1), et son inverse.
  const toView = (t, x, y) => [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]];
  function toPdf(t, X, Y) {
    const det = t[0] * t[3] - t[1] * t[2];
    const dx = X - t[4];
    const dy = Y - t[5];
    return [(t[3] * dx - t[2] * dy) / det, (t[0] * dy - t[1] * dx) / det];
  }

  // Boîte visuelle { left, top, right, bottom } des éléments, descentes comprises.
  function visualBox(items, transform) {
    const xs = [];
    const ys = [];
    items.forEach(item => {
      const [a, b, c, d, e, f] = item.transform;
      const lenU = Math.hypot(a, b) || 1;
      const lenV = Math.hypot(c, d) || 1;
      const u = [(a / lenU) * item.width, (b / lenU) * item.width];
      const v = [(c / lenV) * item.height, (d / lenV) * item.height];
      [[0, -0.22], [1, -0.22], [0, 1], [1, 1]].forEach(([s, t]) => {
        const [X, Y] = toView(transform, e + u[0] * s + v[0] * t, f + u[1] * s + v[1] * t);
        xs.push(X);
        ys.push(Y);
      });
    });
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
  }

  // Retrouve le repère : { pageIndex, box, view } ou null. `view` garde ce qu'il faut pour revenir
  // dans l'espace du PDF (matrice de la page, sa taille visuelle, sa rotation).
  async function findAnchor(pdfBytes, anchorText) {
    const needle = normalizeText(anchorText);
    if (!needle) throw new SigError('anchor-empty', 'Repère de texte vide');
    const doc = await openPdf(pdfBytes);
    try {
      for (let number = doc.numPages; number >= 1; number -= 1) {
        const page = await doc.getPage(number);
        const items = matchItems((await page.getTextContent()).items, needle);
        if (!items) continue;
        const viewport = page.getViewport({ scale: 1 });
        const transform = Array.from(viewport.transform);
        return {
          pageIndex: number - 1,
          box: visualBox(items, transform),
          view: { width: viewport.width, height: viewport.height, rotation: viewport.rotation || 0, transform },
        };
      }
      return null;
    } finally {
      doc.destroy();
    }
  }

  // Où poser une image de `imageSize` ({ width, height } en points) sous le repère : rectangles
  // visuels de l'image et de la ligne de date, et coins bas-gauche dans l'espace du PDF. Refuse
  // (`no-room`) si la page n'a pas la place en dessous, plutôt que de recouvrir du texte ou de
  // sortir de la page.
  function place(anchor, imageSize) {
    const { view, box } = anchor;
    const { maxWidth, maxHeight, gap, labelSize, labelHeight, margin } = LAYOUT;
    const scale = Math.min(1, maxWidth / imageSize.width, maxHeight / imageSize.height, (view.width - 2 * margin) / imageSize.width);
    const width = imageSize.width * scale;
    const height = imageSize.height * scale;
    const left = Math.max(margin, Math.min(box.left, view.width - margin - width));
    const top = box.bottom + gap;
    const labelTop = top + height + 2;
    if (labelTop + labelHeight > view.height - margin) throw new SigError('no-room', 'Pas assez de place sous le repère');
    const baseline = labelTop + labelSize * 0.8;
    const [imageX, imageY] = toPdf(view.transform, left, top + height);
    const [labelX, labelY] = toPdf(view.transform, left, baseline);
    return {
      pageIndex: anchor.pageIndex, rotation: view.rotation,
      image: { left, top, width, height, x: imageX, y: imageY },
      label: { left, baseline, x: labelX, y: labelY },
    };
  }

  const pad = n => String(n).padStart(2, '0');
  // Date de la ligne sous la signature, en ASCII : la police standard d'un PDF n'encode pas tout.
  const stampLabel = when => `Signé électroniquement le ${pad(when.getDate())}/${pad(when.getMonth() + 1)}/${when.getFullYear()} à ${pad(when.getHours())}:${pad(when.getMinutes())}`;

  async function stamp({ pdfBytes, imageBytes, anchor, when = new Date() }) {
    const lib = global.PDFLib;
    if (!lib) throw new SigError('lib-missing', 'pdf-lib n’est pas chargé');
    const kind = sniffImage(imageBytes);
    if (!kind) throw new SigError('image-invalid', 'Image de signature illisible (PNG ou JPEG attendu)');
    let doc;
    try {
      doc = await lib.PDFDocument.load(pdfBytes, { ignoreEncryption: false, updateMetadata: false });
    } catch (err) {
      throw new SigError(/encrypt/i.test(err && err.message) ? 'pdf-encrypted' : 'pdf-invalid', err && err.message);
    }
    const image = kind === 'png' ? await doc.embedPng(imageBytes) : await doc.embedJpg(imageBytes);
    const where = place(anchor, { width: image.width, height: image.height });
    const page = doc.getPage(where.pageIndex);
    const rotate = lib.degrees(where.rotation);
    page.drawImage(image, { x: where.image.x, y: where.image.y, width: where.image.width, height: where.image.height, rotate });
    const font = await doc.embedFont(lib.StandardFonts.Helvetica);
    page.drawText(stampLabel(when), { x: where.label.x, y: where.label.y, size: LAYOUT.labelSize, font, color: lib.rgb(0.33, 0.35, 0.4), rotate });
    return doc.save();
  }

  // Signe un PDF : retrouve le repère, pose la signature, renvoie les octets du PDF signé.
  async function sign({ pdfBytes, imageBytes, anchorText, when }) {
    if (!isPdf(pdfBytes)) throw new SigError('pdf-invalid', 'Le fichier n’est pas un PDF');
    const anchor = await findAnchor(pdfBytes, anchorText);
    if (!anchor) throw new SigError('anchor-not-found', `Repère « ${anchorText} » introuvable`, { anchorText });
    return stamp({ pdfBytes, imageBytes, anchor, when });
  }

  global.SigPdf = { LAYOUT, loadPdfjs, openPdf, matchItems, visualBox, toView, toPdf, findAnchor, place, stampLabel, stamp, sign };
})(window);
