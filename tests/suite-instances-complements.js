/**
 * Non-regression suite : compléments de la page « par instance » (js/pages/page-instances.js) — petits gestes que
 * suite-instances.js laissait de côté : ouvrir le dossier externe d'un point, créneau de fin d'un invité, heure sans
 * date de séance, date d'envoi du CR saisie à la main, rouvrir l'étape « Envoi du CR ».
 *
 * Même jeu de données que suite-instances.js (window.__instancesTestSetup) : séance n°14 (id 2, 23/11/2026 09:30),
 * points 1 à 3, invités Alice (id 1), Bob (id 2), Chloé (id 3).
 */
(function () {
  'use strict';

  const TODAY = '2026-11-09';
  const gd = iso => Math.floor(Date.parse(iso + 'T00:00:00Z') / 1000);
  const setup = opts => window.__instancesTestSetup(opts);
  const root = () => document.getElementById('instances-root');
  const q = sel => root().querySelector(sel);
  const attrs = a => Object.keys(a || {}).map(k => `[data-${k}="${a[k]}"]`).join('');
  function click(act, a) {
    const el = q(`[data-act="${act}"]` + attrs(a));
    if (!el) throw new Error(`Bouton introuvable : ${act} ${JSON.stringify(a || {})}`);
    fireMouse(el, 'click');
  }
  function change(chg, a, value) {
    const el = q(`[data-chg="${chg}"]` + attrs(a));
    if (!el) throw new Error(`Champ introuvable : ${chg}`);
    setValue(el, value); // champ date jj/mm/aaaa : setValue accepte l'ISO (la frappe réelle est couverte par suite-date-input.js)
    fire(el, 'change');
  }
  const step = key => click('step', { v: key });
  const calls = (type, table) => window.__TEST_CALLS__.filter(c => c.type === type && c.table === table);
  const lastFields = (type, table, id) => { const list = calls(type, table).filter(c => id == null || c.id === id); return list.length ? list[list.length - 1].fields : null; };
  const text = sel => (q(sel) ? q(sel).textContent.replace(/\s+/g, ' ').trim() : '');
  const waitCall = (type, table, id, label) => waitFor(() => lastFields(type, table, id), label || `écriture ${type} ${table}`);

  describe('Instances — gestes complémentaires', function () {
    it('dossier du point : « Ouvrir dans un nouvel onglet » ouvre le lien externe, sans transmettre la page d\'origine (noopener)', async function () {
      await setup({ rows: d => { const p = d.Instance_Points.find(x => x.id === 3); p.Lien_type = 'Lien externe'; p.Lien = 'https://exemple.fr/dossier'; } });
      step('odj');
      click('menu', { v: 'lien:3' });
      const opened = [];
      const original = window.open;
      window.open = (...args) => { opened.push(args); return null; };
      try {
        assertIncludes(text('.in-menu'), 'Ouvrir dans un nouvel onglet');
        click('pt-link-open', { id: 3 });
      } finally { window.open = original; }
      assertEqual(opened.length, 1, 'un seul onglet');
      assertEqual(opened[0][0], 'https://exemple.fr/dossier');
      assertEqual(opened[0][1], '_blank');
      assertIncludes(String(opened[0][2]), 'noopener');
    });

    it('créneau de présence : l\'heure de fin se choisit puis s\'efface, comme celle du début', async function () {
      await setup();
      step('invites');
      click('menu', { v: 't:2:a' });
      click('time-pick', { s: 'g-a', id: 2, v: '11:00' });
      assertEqual(lastFields('UpdateRecord', 'Instance_Invites', 2).Dispo_a, '11:00');
      click('menu', { v: 't:2:a' });
      click('time-clear', { s: 'g-a', id: 2 });
      assertEqual(lastFields('UpdateRecord', 'Instance_Invites', 2).Dispo_a, '');
    });

    it('heure de la séance choisie avant d\'en avoir fixé la date : message clair, rien n\'est écrit', async function () {
      await setup({ rows: d => { const s = d.Suivi_Instance.find(x => x.id === 2); s.date = null; s.Heure = null; } });
      click('menu', { v: 'seance' });
      click('seance-pick', { id: 2 }); // la séance sans date n'est pas celle affichée par défaut
      click('menu', { v: 'heure' });
      click('time-pick', { s: 'heure', v: '10:15' });
      assertIncludes(document.getElementById('toast').textContent, 'Renseignez d\'abord la date de la séance');
      assertTrue(document.getElementById('toast').classList.contains('error'), 'message d\'erreur');
      assertEqual(calls('UpdateRecord', 'Suivi_Instance').length, 0, 'aucune écriture');
    });

    it('mail du compte rendu : une date saisie à la main s\'enregistre, et « Rouvrir l\'étape » efface la date d\'envoi', async function () {
      await setup();
      step('crmail');
      change('crm-date', null, '2026-11-12');
      await waitFor(() => lastFields('UpdateRecord', 'Suivi_Instance', 2) && lastFields('UpdateRecord', 'Suivi_Instance', 2).Mail_CR_le === gd('2026-11-12'), 'date d\'envoi saisie');
      await waitFor(() => /Envoyé le 12\/11\/2026/.test(text('.in-panel .in-stt')), 'étape validée par la date saisie');
      click('reopen');
      assertEqual(lastFields('UpdateRecord', 'Suivi_Instance', 2).Mail_CR_le, null, 'la date d\'envoi est effacée');
      await waitFor(() => !/Envoyé le/.test(text('.in-panel .in-stt')), 'étape rouverte');
    });

    it('les dates des séances et des mails s\'affichent en jj/mm/aaaa ; une date à moitié tapée n\'écrit rien, une date complète tapée s\'écrit', async function () {
      await setup();
      click('menu', { v: 'heure' }); // la date de la séance se change dans le menu de l'heure
      const field = q('[data-chg="seance-date"]');
      assertEqual(field.value, '23/11/2026', 'la séance n°14 du 23 novembre s\'affiche jour d\'abord');
      assertEqual(field.type, 'text', 'plus de champ date natif (mm/jj/aaaa selon le navigateur)');
      const before = calls('UpdateRecord', 'Suivi_Instance').length;
      field.value = '24/11'; fire(field, 'input'); fire(field, 'change');
      await wait(30);
      assertEqual(calls('UpdateRecord', 'Suivi_Instance').length, before, 'saisie incomplète : rien n\'est écrit');
      field.value = '24112026'; fire(field, 'input'); fire(field, 'change');
      await waitFor(() => lastFields('UpdateRecord', 'Suivi_Instance', 2) && lastFields('UpdateRecord', 'Suivi_Instance', 2).date === gd('2026-11-24'), 'date de la séance tapée');
    });

    it('mail d\'invitation : rouvrir l\'étape efface la date d\'envoi mais laisse les invités déjà marqués « écrits »', async function () {
      await setup();
      step('invitation');
      click('inv-today');
      assertEqual(lastFields('UpdateRecord', 'Suivi_Instance', 2).Mail_invitation_le, gd(TODAY));
      click('reopen');
      assertEqual(lastFields('UpdateRecord', 'Suivi_Instance', 2).Mail_invitation_le, null);
      assertEqual(calls('UpdateRecord', 'Instance_Invites').filter(c => c.fields.Ecrit_le === null).length, 0, 'aucun invité n\'est « dé-écrit »');
    });
  });
  // PDF du compte rendu déposé depuis l'étape CR (Antoine, 24/11/2026) puis lu dans la visionneuse du widget ; étape « Envoi du CR » : GFS et le PDF à portée.
  describe('Instances — PDF du compte rendu : dépôt et lecture', function () {
    const gfsTarget = { url: 'about:blank#gfs-test', origin: '*' };
    const toastEl = () => document.getElementById('toast');
    const qa = sel => Array.from(root().querySelectorAll(sel));
    const pdfBytes = async () => { const pdf = await window.PDFLib.PDFDocument.create(); pdf.addPage([300, 400]); return pdf.save(); };
    const pdfFile = (name, type) => new File(['%PDF-1.4 test'], name || 'CR CTO n°14.pdf', { type: type === undefined ? 'application/pdf' : type });
    // Les appels réseau (lecture des pièces jointes) et l'envoi sont simulés ; `restore()` remet tout, y compris la séance affichée.
    function stubs(opts) {
      opts = opts || {};
      const CA = window.CoreAttachments, saved = { upload: CA.upload, fetch: window.fetch }, uploads = [], urls = [];
      CA.upload = async file => { uploads.push(file); if (opts.failUpload) throw new Error('droit d\'édition requis pour ajouter un fichier'); return [777]; };
      return pdfBytes().then(bytes => {
        window.fetch = async url => { urls.push(String(url)); return new Response(bytes); };
        return { uploads, urls, restore() { CA.upload = saved.upload; window.fetch = saved.fetch; document.querySelectorAll('input[data-in-cr-file]').forEach(el => el.remove()); } };
      });
    }
    const toPdfMode = async () => { window.InstancesPage._setGfsTarget(gfsTarget); step('cr'); await waitFor(() => q('iframe.in-gframe'), 'iframe GFS'); click('cr-mode', { v: 'pdf' }); };
    const chooseFile = file => {
      click('cr-upload');
      const input = document.querySelector('input[data-in-cr-file]');
      if (!input) throw new Error('champ fichier introuvable');
      const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    it('séance sans PDF : choisir le fichier l\'envoie dans le document puis l\'ajoute à la cellule CR_PDF de la séance, et le PDF se lit aussitôt', async function () {
      const st = await stubs();
      try {
        await setup();
        await toPdfMode();
        assertTrue(!!q('[data-pane="pdf"] [data-act="cr-upload"]'), 'bouton « Choisir le PDF » dans le volet');
        chooseFile(pdfFile());
        await waitCall('UpdateRecord', 'Suivi_Instance', 2);
        assertEqual(st.uploads.length, 1);
        assertEqual(st.uploads[0].name, 'CR CTO n°14.pdf');
        assertDeepEqual(lastFields('UpdateRecord', 'Suivi_Instance', 2).CR_PDF, ['L', 777], 'ajouté à la cellule CR_PDF de la séance');
        await waitFor(() => st.urls.length === 1, 'lecture du PDF déposé');
        assertEqual(st.urls[0], 'http://127.0.0.1/api/docs/test/attachments/777/download?auth=jeton-de-test&tableId=Suivi_Instance&colId=CR_PDF&rowId=2');
        await waitFor(() => q('[data-pane="pdf"] .pdfv-pages'), 'visionneuse du widget');
        assertFalse(q('[data-act="cr-download"]').disabled, 'le bouton « Télécharger le CR » s\'active');
        assertIncludes(toastEl().textContent, 'déposé');
        assertDeepEqual(window.InstancesPage.state.model.seanceById[2].crPdf, [777]);
      } finally { st.restore(); }
    });

    it('séance qui a déjà un PDF : il se lit tout de suite ; une nouvelle version s\'ajoute (les précédentes restent) et c\'est la dernière qui est lue', async function () {
      const st = await stubs();
      try {
        await setup({ rows: d => { d.Suivi_Instance[1].CR_PDF = ['L', 90]; } });
        await toPdfMode();
        await waitFor(() => st.urls.length === 1 && /attachments\/90\//.test(st.urls[0]), 'lecture du PDF déjà présent');
        assertFalse(!!q('[data-pane="pdf"] [data-act="cr-upload"]'), 'pas d\'invitation à déposer quand un PDF est là');
        const bar = q('.in-vbar [data-act="cr-upload"]');
        assertTrue(!!bar, 'bouton de dépôt dans la barre');
        assertIncludes(bar.textContent, 'Nouvelle version');
        chooseFile(pdfFile('CR v2.pdf'));
        await waitCall('UpdateRecord', 'Suivi_Instance', 2);
        assertDeepEqual(lastFields('UpdateRecord', 'Suivi_Instance', 2).CR_PDF, ['L', 90, 777], 'la version précédente reste dans la cellule');
        await waitFor(() => st.urls.length === 2 && /attachments\/777\//.test(st.urls[1]), 'lecture de la dernière version');
      } finally { st.restore(); }
    });

    it('seuls les PDF sont acceptés : un autre fichier est refusé avec un message, rien n\'est envoyé ni écrit', async function () {
      const st = await stubs();
      try {
        await setup();
        await toPdfMode();
        chooseFile(pdfFile('photo.png', 'image/png'));
        await wait(100);
        assertEqual(st.uploads.length, 0);
        assertEqual(calls('UpdateRecord', 'Suivi_Instance').length, 0);
        assertTrue(toastEl().classList.contains('error'));
        assertIncludes(toastEl().textContent, 'PDF');
        assertTrue(!!q('[data-pane="pdf"] [data-act="cr-upload"]'), 'le volet reste prêt à recevoir');
        // Un PDF dont le type n'est pas renseigné (certains navigateurs) est reconnu à son extension.
        chooseFile(pdfFile('CR.PDF', ''));
        await waitCall('UpdateRecord', 'Suivi_Instance', 2);
        assertEqual(st.uploads.length, 1);
      } finally { st.restore(); }
    });

    it('envoi refusé (droit d\'édition, réseau) : message clair, rien n\'est écrit dans la cellule, le volet redevient prêt à recevoir le fichier', async function () {
      const st = await stubs({ failUpload: true });
      try {
        await setup();
        await toPdfMode();
        chooseFile(pdfFile());
        await waitFor(() => toastEl().classList.contains('error'), 'message d\'erreur');
        assertIncludes(toastEl().textContent, 'compte rendu');
        assertEqual(calls('UpdateRecord', 'Suivi_Instance').length, 0, 'rien écrit dans CR_PDF');
        await waitFor(() => q('[data-pane="pdf"] [data-act="cr-upload"]'), 'volet prêt');
      } finally { st.restore(); }
    });

    it('glisser-déposer : un fichier lâché sur le volet du PDF est déposé ; le volet se surligne au survol ; un glissement de point de l\'ordre du jour n\'y touche pas', async function () {
      const st = await stubs();
      try {
        await setup();
        await toPdfMode();
        const pane = q('[data-pane="pdf"]');
        const dt = new DataTransfer(); dt.items.add(pdfFile());
        pane.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
        assertTrue(pane.classList.contains('in-dropon'), 'le volet se surligne');
        pane.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true, dataTransfer: dt, relatedTarget: document.body }));
        assertFalse(pane.classList.contains('in-dropon'));
        pane.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        await waitCall('UpdateRecord', 'Suivi_Instance', 2);
        assertEqual(st.uploads.length, 1);
        assertDeepEqual(lastFields('UpdateRecord', 'Suivi_Instance', 2).CR_PDF, ['L', 777]);
        // Une page qui n'est pas dans la vue PDF (GFS visible) ne reçoit rien.
        click('cr-mode', { v: 'edit' });
        const before = st.uploads.length;
        q('[data-pane="pdf"]').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        await wait(100);
        assertEqual(st.uploads.length, before, 'vue GFS : le dépôt est ignoré');
      } finally { st.restore(); }
    });

    it('étape « Envoi du CR » : le mail se rédige dans GFS (modèle de l\'instance dans la barre), le PDF du CR est à portée, la date d\'envoi reste dans le panneau', async function () {
      const st = await stubs();
      try {
        await setup({ rows: d => { d.Instances[0].Modele_CR = 'RDE_CTO_email'; d.Suivi_Instance[1].CR_PDF = ['L', 90]; } });
        window.InstancesPage._setGfsTarget(gfsTarget);
        step('crmail');
        await waitFor(() => q('iframe.in-gframe'), 'GFS dans l\'étape Envoi du CR');
        assertIncludes(text('.in-vbar'), 'Mail du compte rendu dans GFS');
        assertIncludes(text('.in-vbar [data-crm-model]'), 'RDE_CTO_email');
        assertEqual(qa('.in-vbar [data-act="cr-mode"]').length, 0, 'pas de bascule PDF : on est dans la rédaction du mail');
        const pdf = q('.in-vbar [data-act="cr-download"]');
        assertTrue(!!pdf && !pdf.disabled, 'PDF du CR à portée (à glisser dans le mail)');
        assertIncludes(pdf.textContent, 'PDF du CR');
        assertFalse(q('[data-pane="gfs"]').hidden);
        assertTrue(!!q('[data-act="crm-today"]'), 'la date d\'envoi reste dans le panneau');
        click('crm-today');
        assertEqual(lastFields('UpdateRecord', 'Suivi_Instance', 2).Mail_CR_le, gd(TODAY));
      } finally { st.restore(); }
    });

    it('étape « Envoi du CR » sans PDF : le bouton mène à l\'étape CR, vue PDF exporté, prête à recevoir le fichier', async function () {
      const st = await stubs();
      try {
        await setup();
        window.InstancesPage._setGfsTarget(gfsTarget);
        step('crmail');
        await waitFor(() => q('iframe.in-gframe'), 'GFS');
        assertFalse(!!q('.in-vbar [data-act="cr-download"]'), 'pas de PDF à ouvrir');
        click('cr-pdf-go');
        assertIncludes(text('.in-panel .in-ph h2'), 'Compte rendu');
        assertTrue(!q('[data-pane="pdf"]').hidden, 'vue PDF exporté');
        assertTrue(!!q('[data-pane="pdf"] [data-act="cr-upload"]'));
      } finally { st.restore(); }
    });
  });
})();
