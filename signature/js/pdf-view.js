/**
 * Affichage d'un PDF dans un conteneur : une toile par page, dessinée par pdf.js. Pas de couche de
 * texte, pas de lien actif, pas de formulaire : on regarde la notification, on n'interagit pas avec
 * elle (un PDF reçu d'ailleurs n'a aucune raison de pouvoir ouvrir un lien depuis cette page).
 */
(function (global) {
  'use strict';

  const MIN_SCALE = 0.5;
  const MAX_SCALE = 2;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function create(container) {
    let ticket = 0;
    let doc = null;
    let scale = 1;
    let task = null;

    function release() {
      ticket += 1;
      if (task) { try { task.cancel(); } catch (err) { /* déjà terminé */ } task = null; }
      if (doc) { doc.destroy(); doc = null; }
    }

    function note(text) {
      const el = global.document.createElement('p');
      el.className = 'pdf-note';
      el.textContent = text;
      return el;
    }

    async function renderAll(mine) {
      const dpr = global.devicePixelRatio || 1;
      const canvases = [];
      const holder = global.document.createElement('div');
      holder.className = 'pdf-pages';
      for (let number = 1; number <= doc.numPages; number += 1) {
        const page = await doc.getPage(number);
        if (mine !== ticket) return false;
        const viewport = page.getViewport({ scale: scale * dpr });
        const canvas = global.document.createElement('canvas');
        canvas.className = 'pdf-page';
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `Page ${number} sur ${doc.numPages}`);
        holder.append(canvas);
        canvases.push([page, canvas, viewport]);
      }
      container.replaceChildren(holder);
      for (const [page, canvas, viewport] of canvases) {
        task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
        try {
          await task.promise;
        } catch (err) {
          if (mine !== ticket) return false; // dessin annulé par un nouveau PDF ou un nouveau zoom
          throw err;
        }
        if (mine !== ticket) return false;
      }
      return true;
    }

    // Affiche `bytes` à la largeur du conteneur (entre 50 % et 130 %). Rend le nombre de pages.
    async function show(bytes) {
      release();
      const mine = ticket;
      container.replaceChildren(note('Chargement du PDF…'));
      try {
        doc = await global.SigPdf.openPdf(bytes);
        if (mine !== ticket) { doc.destroy(); doc = null; return 0; }
        const first = await doc.getPage(1);
        const width = first.getViewport({ scale: 1 }).width;
        const room = container.clientWidth ? container.clientWidth - 32 : 0;
        scale = room ? clamp(room / width, MIN_SCALE, 1.3) : 0.9;
        await renderAll(mine);
        return doc ? doc.numPages : 0;
      } catch (err) {
        if (mine === ticket) container.replaceChildren(note('Ce PDF ne peut pas être affiché.'));
        throw err;
      }
    }

    async function setScale(next) {
      scale = clamp(next, MIN_SCALE, MAX_SCALE);
      if (!doc) return scale;
      if (task) { try { task.cancel(); } catch (err) { /* déjà terminé */ } task = null; }
      const mine = ++ticket;
      await renderAll(mine);
      return scale;
    }

    function clear() {
      release();
      container.replaceChildren();
    }

    // Remplace l'affichage par un message (PDF introuvable, illisible…).
    function fail(text) {
      release();
      container.replaceChildren(note(text));
    }

    return { show, setScale, clear, fail, getScale: () => scale };
  }

  global.SigView = { create, MIN_SCALE, MAX_SCALE };
})(window);
