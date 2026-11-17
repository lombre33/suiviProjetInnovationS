/**
 * Non-regression suite : page Administratif, onglet Conventions — la convention en PDF (pièce jointe).
 * Demande d'Antoine du 17/11/2026 : à partir de l'étape « en signature », la cellule du lien devient la
 * colonne pièce jointe (Projets.Convention_de_reversement_le_cas_echeant) — téléverser, afficher,
 * télécharger le PDF. Fixtures (tests/fixtures.js) : INNOVX en « redaction », CONVENTIX en « signature »
 * (id 12), SIGNEX « signée de toutes les parties » (id 16).
 * Aucun vrai Grist ici : l'API REST du document est simulée (window.fetch, window.open remplacés le temps d'un test).
 */
(function () {
  'use strict';

  const FILE_COLUMN = 'Convention_de_reversement_le_cas_echeant';
  const BASE = 'http://127.0.0.1/api/docs/test'; // baseUrl rendue par getAccessToken du mock

  async function loadState({ files = {}, links = {}, attachments } = {}) {
    const tables = await window.CoreGrist.loadAllTables();
    tables.Projets.forEach(project => {
      project.Convention_de_reversement = true;
      if (files[project.Acronyme]) project[FILE_COLUMN] = files[project.Acronyme];
      if (links[project.Acronyme]) project.Lien_convention = links[project.Acronyme];
    });
    if (attachments) window.__mockSetTable('_grist_Attachments', attachments);
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    window.renderAdministratif();
  }

  const card = acronym => Array.from(document.querySelectorAll('#admin-col-conv .admin-card'))
    .find(c => c.querySelector('.admin-card-identity .project-acronym')?.textContent === acronym);
  const fileCell = acronym => card(acronym).querySelector('[data-file-cell]');
  const project = acronym => window.CoreState.getTable('Projets').find(p => p.Acronyme === acronym);
  const names = acronym => Array.from(fileCell(acronym).querySelectorAll('.admin-file-name span')).map(el => el.textContent);
  const writes = () => window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && FILE_COLUMN in c.fields);
  const toastText = () => document.getElementById('toast').textContent;
  const clearToast = () => { document.getElementById('toast').textContent = ''; };
  const countReads = () => calls.filter(call => call === 'fetch:_grist_Attachments').length;
  let calls = [];

  // Espion sur docApi.fetchTable (lectures de _grist_Attachments) + getAccessToken (options passées).
  function spyDocApi() {
    const api = window.grist.docApi;
    const original = { fetchTable: api.fetchTable, getAccessToken: api.getAccessToken };
    calls = [];
    const tokenOptions = [];
    api.fetchTable = function (name) { calls.push('fetch:' + name); return original.fetchTable.call(api, name); };
    api.getAccessToken = function (options) { tokenOptions.push(options); return original.getAccessToken.call(api, options); };
    return { tokenOptions, restore() { Object.assign(api, original); } };
  }

  // API REST du document simulée : `handler(url, init)` répond à chaque appel de window.fetch.
  function stubFetch(handler) {
    const original = window.fetch;
    const log = [];
    window.fetch = async function (url, init) { log.push({ url: String(url), init }); return handler(String(url), init); };
    return { log, restore() { window.fetch = original; } };
  }
  const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  // window.open remplacé : chaque fenêtre ouverte garde l'adresse vers laquelle elle a été dirigée.
  function stubOpen() {
    const original = window.open;
    const opened = [];
    window.open = function (url) {
      const win = { location: { href: url || '' }, closed: false, close() { win.closed = true; } };
      opened.push(win);
      return win;
    };
    return { opened, restore() { window.open = original; } };
  }

  // URL.createObjectURL remplacé : garde chaque Blob créé et rend une adresse « blob:test/n » reconnaissable.
  function stubBlobs() {
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    const created = [];
    URL.createObjectURL = blob => { created.push(blob); return `blob:test/${created.length}`; };
    URL.revokeObjectURL = () => {};
    return { created, restore() { URL.createObjectURL = original.create; URL.revokeObjectURL = original.revoke; } };
  }
  const SERVER_URL = id => `${BASE}/attachments/${id}/download?auth=jeton-de-test&tableId=Projets&colId=${FILE_COLUMN}&rowId=12`;
  const openedAt = (open, index = 0) => open.opened[index] && open.opened[index].location.href;
  const viewerWindowReady = (open, index = 0) => waitFor(() => (openedAt(open, index) || '').length > 0 && openedAt(open, index) !== '', 'fenêtre dirigée');

  // Clic sur le trombone sans ouvrir la vraie boîte de dialogue du système.
  function clickAttach(acronym) {
    const original = HTMLInputElement.prototype.click;
    let pickerOpened = 0;
    HTMLInputElement.prototype.click = function () { if (this.type === 'file') pickerOpened += 1; else original.call(this); };
    try { fileCell(acronym).querySelector('[data-upload-file]').click(); } finally { HTMLInputElement.prototype.click = original; }
    return pickerOpened;
  }
  function chooseFile(name, { type = 'application/pdf', content = '%PDF-1.4 convention' } = {}) {
    const input = document.querySelector('[data-admin-file-input]');
    const transfer = new DataTransfer();
    transfer.items.add(new File([content], name, { type }));
    input.files = transfer.files;
    fire(input, 'change');
  }
  const uploadFinished = () => waitFor(() => !document.querySelector('.admin-file-busy'), 'envoi terminé');

  describe('Administratif — Conventions : la cellule du lien devient la pièce jointe à partir de « en signature »', function () {
    it('avant la signature (rédaction, relecture) : le lien, comme avant — pas de pièce jointe', async function () {
      await loadState();
      assertEqual(card('INNOVX').querySelectorAll('[data-edit-link]').length, 1, 'icône du lien');
      assertEqual(card('INNOVX').querySelectorAll('[data-file-cell]').length, 0, 'pas de cellule PDF');
      assertEqual(card('INNOVX').querySelectorAll('[data-upload-file]').length, 0);
    });

    it('en signature et après : la pièce jointe prend la place du lien (un trombone pour joindre, plus d\'icône de lien)', async function () {
      await loadState();
      ['CONVENTIX', 'SIGNEX'].forEach(acronym => {
        assertEqual(card(acronym).querySelectorAll('[data-file-cell]').length, 1, acronym + ' : cellule PDF');
        assertEqual(card(acronym).querySelectorAll('[data-link-cell]').length, 0, acronym + ' : plus de cellule lien');
        assertEqual(card(acronym).querySelectorAll('[data-upload-file]').length, 1, acronym + ' : un seul trombone');
        assertEqual(card(acronym).querySelectorAll('.admin-file').length, 0, acronym + ' : aucun fichier');
      });
    });

    it('un projet qui passe en signature change de cellule au rendu suivant, et reprend son lien s\'il revient en relecture', async function () {
      await loadState();
      assertEqual(card('INNOVX').querySelectorAll('[data-file-cell]').length, 0);
      project('INNOVX').Conventions_statut = '3) Convention en signature';
      window.renderAdministratif();
      assertEqual(card('INNOVX').querySelectorAll('[data-file-cell]').length, 1);
      project('INNOVX').Conventions_statut = '2) Convention en relecture';
      window.renderAdministratif();
      assertEqual(card('INNOVX').querySelectorAll('[data-file-cell]').length, 0);
      assertEqual(card('INNOVX').querySelectorAll('[data-link-cell]').length, 1);
    });

    it('l\'ancien libellé « 3) Convention en signature UB » est aussi reconnu comme étape de signature', async function () {
      await loadState();
      project('INNOVX').Conventions_statut = '3) Convention en signature UB';
      window.renderAdministratif();
      assertEqual(card('INNOVX').querySelectorAll('[data-file-cell]').length, 1);
    });

    it('un lien saisi avant le passage en signature reste ouvrable (icône d\'ouverture) à côté de la pièce jointe', async function () {
      await loadState({ links: { CONVENTIX: 'https://exemple.org/convention.docx' } });
      const link = fileCell('CONVENTIX').querySelector('a[href]');
      assertEqual(link.getAttribute('href'), 'https://exemple.org/convention.docx');
      assertEqual(link.getAttribute('target'), '_blank');
      assertTrue((link.getAttribute('rel') || '').includes('noopener'), 'rel="noopener"');
      assertEqual(fileCell('SIGNEX').querySelectorAll('a[href]').length, 0, 'aucun lien saisi : rien à ouvrir');
    });

    it('un lien « javascript: » saisi dans Grist ne devient jamais un href cliquable', async function () {
      await loadState({ links: { CONVENTIX: 'javascript:alert(1)' } });
      assertEqual(fileCell('CONVENTIX').querySelectorAll('a[href]').length, 0);
    });
  });

  describe('Administratif — Conventions : afficher et télécharger le PDF', function () {
    const attachments = { id: [501, 502], fileName: ['Convention_ACME.pdf', 'Convention_ACME_signee.pdf'] };

    it('liste un fichier par pièce jointe, avec son vrai nom lu dans _grist_Attachments', async function () {
      await loadState({ files: { CONVENTIX: ['L', 501, 502] }, attachments });
      await waitFor(() => names('CONVENTIX').join('|') === 'Convention_ACME.pdf|Convention_ACME_signee.pdf', 'noms de fichier');
      assertEqual(fileCell('CONVENTIX').querySelectorAll('[data-open-file]').length, 2);
      assertEqual(fileCell('CONVENTIX').querySelectorAll('[data-download-file]').length, 2);
    });

    it('une pièce jointe dont le nom est introuvable s\'affiche « Pièce jointe #n » sans planter', async function () {
      await loadState({ files: { CONVENTIX: ['L', 999] }, attachments });
      await wait(30);
      assertEqual(names('CONVENTIX')[0], 'Pièce jointe #999');
    });

    it('les noms ne sont lus qu\'une fois, pour toutes les cartes, et plus du tout aux rendus suivants', async function () {
      const spy = spyDocApi();
      try {
        await loadState({ files: { CONVENTIX: ['L', 501], SIGNEX: ['L', 502] }, attachments });
        await waitFor(() => names('SIGNEX').join('') === 'Convention_ACME_signee.pdf', 'noms de fichier');
        assertEqual(countReads(), 1, 'une seule lecture pour les deux cartes');
        window.renderAdministratif();
        window.renderAdministratif();
        await wait(30);
        assertEqual(countReads(), 1, 'rendus suivants : noms déjà connus');
      } finally { spy.restore(); }
    });

    it('aucune lecture de _grist_Attachments quand aucune convention n\'a de fichier', async function () {
      const spy = spyDocApi();
      try {
        await loadState({ attachments });
        await wait(30);
        assertEqual(countReads(), 0);
      } finally { spy.restore(); }
    });

    it('le nom du fichier AFFICHE le PDF : lu avec le jeton, ouvert depuis une adresse blob: de type application/pdf (Grist ne le laisse pas s\'afficher lui-même)', async function () {
      await loadState({ files: { CONVENTIX: ['L', 501] }, attachments });
      const open = stubOpen(), blobs = stubBlobs(), spy = spyDocApi();
      const rest = stubFetch(() => new Response('%PDF-1.7 contenu de la convention'));
      try {
        fileCell('CONVENTIX').querySelector('[data-open-file]').click();
        await waitFor(() => openedAt(open) === 'blob:test/1', 'fenêtre dirigée vers le PDF');
        assertEqual(open.opened.length, 1);
        assertEqual(rest.log.length, 1);
        assertEqual(rest.log[0].url, SERVER_URL(501), 'fichier lu avec la preuve d\'accès sur la cellule, sans « inline »');
        assertEqual(rest.log[0].init.credentials, 'omit', 'aucun cookie');
        assertEqual(blobs.created.length, 1);
        assertEqual(blobs.created[0].type, 'application/pdf');
        assertEqual(await blobs.created[0].text(), '%PDF-1.7 contenu de la convention');
        assertDeepEqual(spy.tokenOptions, [{ readOnly: false }], 'jeton non plafonné au rôle Lecteur');
      } finally { open.restore(); blobs.restore(); spy.restore(); rest.restore(); }
    });

    it('un second clic sur le même fichier réutilise la lecture déjà faite (une seule requête, deux fenêtres)', async function () {
      await loadState({ files: { CONVENTIX: ['L', 501] }, attachments });
      const open = stubOpen(), blobs = stubBlobs();
      const rest = stubFetch(() => new Response('%PDF-1.4 x'));
      try {
        fileCell('CONVENTIX').querySelector('[data-open-file]').click();
        await waitFor(() => openedAt(open) === 'blob:test/1', 'première fenêtre');
        fileCell('CONVENTIX').querySelector('[data-open-file]').click();
        await waitFor(() => openedAt(open, 1) === 'blob:test/1', 'seconde fenêtre');
        assertEqual(rest.log.length, 1, 'une seule lecture du fichier');
        assertEqual(blobs.created.length, 1);
      } finally { open.restore(); blobs.restore(); rest.restore(); }
    });

    it('un PDF précédé de quelques octets (espace, marque d\'ordre) est quand même reconnu', async function () {
      await loadState({ files: { CONVENTIX: ['L', 501] }, attachments });
      const open = stubOpen(), blobs = stubBlobs();
      const rest = stubFetch(() => new Response('﻿ \n%PDF-1.5 x'));
      try {
        fileCell('CONVENTIX').querySelector('[data-open-file]').click();
        await waitFor(() => openedAt(open) === 'blob:test/1', 'fenêtre dirigée vers le PDF');
      } finally { open.restore(); blobs.restore(); rest.restore(); }
    });

    it('un fichier qui n\'est pas un PDF n\'est JAMAIS ouvert depuis une adresse blob: de ce site : repli sur l\'adresse de Grist', async function () {
      await loadState({ files: { CONVENTIX: ['L', 501] }, attachments });
      const open = stubOpen(), blobs = stubBlobs();
      const rest = stubFetch(() => new Response('<html><script>alert(1)</script></html>'));
      try {
        fileCell('CONVENTIX').querySelector('[data-open-file]').click();
        await viewerWindowReady(open);
        assertEqual(blobs.created.length, 0, 'aucun blob créé');
        assertEqual(openedAt(open), SERVER_URL(501) + '&inline=1');
        assertFalse(open.opened[0].closed);
      } finally { open.restore(); blobs.restore(); rest.restore(); }
    });

    it('lecture impossible (réseau coupé, 403, 404) : repli sur l\'adresse de Grist, la fenêtre n\'est pas refermée', async function () {
      await loadState({ files: { CONVENTIX: ['L', 501] }, attachments });
      const answers = [() => { throw new TypeError('Failed to fetch'); }, () => new Response('no', { status: 403 }), () => new Response('no', { status: 404 })];
      for (const answer of answers) {
        const open = stubOpen(), blobs = stubBlobs();
        const rest = stubFetch(answer);
        try {
          fileCell('CONVENTIX').querySelector('[data-open-file]').click();
          await viewerWindowReady(open);
          assertEqual(blobs.created.length, 0);
          assertEqual(openedAt(open), SERVER_URL(501) + '&inline=1');
          assertFalse(open.opened[0].closed);
        } finally { open.restore(); blobs.restore(); rest.restore(); }
      }
    });

    it('la fenêtre ouverte tout de suite (geste de la personne) reçoit l\'adresse locale : aucune seconde fenêtre', async function () {
      await loadState({ files: { CONVENTIX: ['L', 501] }, attachments });
      const open = stubOpen(), blobs = stubBlobs();
      const rest = stubFetch(() => new Response('%PDF-1.4 x'));
      try {
        fileCell('CONVENTIX').querySelector('[data-open-file]').click();
        assertEqual(open.opened.length, 1, 'ouverte avant même la lecture du fichier');
        assertEqual(openedAt(open), '', 'encore vide');
        await waitFor(() => openedAt(open) === 'blob:test/1', 'adresse reçue');
        assertEqual(open.opened.length, 1);
      } finally { open.restore(); blobs.restore(); rest.restore(); }
    });

    it('l\'icône de téléchargement ouvre la même pièce jointe SANS « inline » (téléchargement forcé par Grist)', async function () {
      await loadState({ files: { CONVENTIX: ['L', 502] }, attachments });
      const open = stubOpen();
      const rest = stubFetch(() => new Response('%PDF-1.4 x'));
      try {
        fileCell('CONVENTIX').querySelector('[data-download-file]').click();
        await waitFor(() => open.opened[0] && open.opened[0].location.href.includes('/attachments/'), 'fenêtre dirigée vers le PDF');
        const url = open.opened[0].location.href;
        assertIncludes(url, '/attachments/502/download?auth=jeton-de-test');
        assertFalse(url.includes('inline'), 'pas d\'affichage en ligne');
        assertEqual(rest.log.length, 0, 'le fichier n\'est pas lu par le widget : c\'est le navigateur qui le télécharge, sous son vrai nom');
      } finally { open.restore(); rest.restore(); }
    });

    it('jeton impossible à obtenir : la fenêtre ouverte est refermée et une erreur est affichée', async function () {
      await loadState({ files: { CONVENTIX: ['L', 501] }, attachments });
      const open = stubOpen();
      const original = window.grist.docApi.getAccessToken;
      window.grist.docApi.getAccessToken = async () => { throw new Error('refusé'); };
      clearToast();
      try {
        fileCell('CONVENTIX').querySelector('[data-open-file]').click();
        await waitFor(() => open.opened[0] && open.opened[0].closed, 'fenêtre refermée');
        assertIncludes(toastText(), 'Ouverture impossible');
      } finally { window.grist.docApi.getAccessToken = original; open.restore(); }
    });

    it('le nom d\'un fichier est échappé (aucune balise injectée par un nom piégé)', async function () {
      const tricky = { id: [601], fileName: ['<img src=x onerror=alert(1)>.pdf'] };
      await loadState({ files: { CONVENTIX: ['L', 601] }, attachments: tricky });
      await waitFor(() => names('CONVENTIX')[0] === '<img src=x onerror=alert(1)>.pdf', 'nom de fichier');
      assertEqual(fileCell('CONVENTIX').querySelectorAll('img').length, 0, 'aucun <img> créé');
      assertEqual(fileCell('CONVENTIX').querySelector('[data-open-file]').getAttribute('onerror'), null);
    });

    it('une valeur de cellule invalide (0, texte) n\'affiche aucun fichier', async function () {
      await loadState({ files: { CONVENTIX: 0, SIGNEX: ['L', 'abc', -3, 0] } });
      assertEqual(fileCell('CONVENTIX').querySelectorAll('.admin-file').length, 0);
      assertEqual(fileCell('SIGNEX').querySelectorAll('.admin-file').length, 0);
    });
  });

  describe('Administratif — Conventions : téléverser le PDF', function () {
    it('le trombone ouvre le sélecteur de fichier (PDF seulement), un seul sélecteur pour toute la page', async function () {
      await loadState();
      assertEqual(clickAttach('CONVENTIX'), 1, 'sélecteur ouvert');
      assertEqual(clickAttach('SIGNEX'), 1);
      const inputs = document.querySelectorAll('[data-admin-file-input]');
      assertEqual(inputs.length, 1);
      assertIncludes(inputs[0].accept, 'pdf');
    });

    it('envoie le fichier à l\'API du document (jeton non plafonné), puis le range dans la cellule : écriture [\'L\', n°] sur Projets', async function () {
      await loadState();
      const spy = spyDocApi();
      const rest = stubFetch(() => jsonResponse([777]));
      clearToast();
      try {
        clickAttach('CONVENTIX');
        chooseFile('Convention_signee.pdf');
        assertEqual(fileCell('CONVENTIX').querySelectorAll('.admin-file-busy').length, 1, 'envoi en cours affiché');
        assertEqual(fileCell('CONVENTIX').querySelectorAll('[data-upload-file]').length, 0, 'pas de second envoi pendant le premier');
        await uploadFinished();
        assertEqual(rest.log.length, 1);
        assertEqual(rest.log[0].url, `${BASE}/attachments?auth=jeton-de-test`);
        assertEqual(rest.log[0].init.method, 'POST');
        assertEqual(rest.log[0].init.credentials, 'omit');
        assertEqual(rest.log[0].init.headers['X-Requested-With'], 'XMLHttpRequest');
        const sent = rest.log[0].init.body.get('upload');
        assertEqual(sent.name, 'Convention_signee.pdf');
        assertEqual(sent.size, '%PDF-1.4 convention'.length);
        assertDeepEqual(spy.tokenOptions, [{ readOnly: false }]);
        assertEqual(writes().length, 1);
        assertEqual(writes()[0].table, 'Projets');
        assertEqual(writes()[0].id, 12, 'ligne CONVENTIX');
        assertDeepEqual(writes()[0].fields[FILE_COLUMN], ['L', 777]);
        assertDeepEqual(project('CONVENTIX')[FILE_COLUMN], ['L', 777], 'valeur locale à jour');
        assertEqual(names('CONVENTIX')[0], 'Convention_signee.pdf', 'nom affiché sans relire _grist_Attachments');
        assertIncludes(toastText(), 'Convention_signee.pdf');
        assertEqual(fileCell('CONVENTIX').querySelectorAll('.admin-file-busy').length, 0);
      } finally { rest.restore(); spy.restore(); }
    });

    it('le nom du fichier envoyé est connu tout de suite : aucune lecture de _grist_Attachments', async function () {
      await loadState();
      const spy = spyDocApi();
      const rest = stubFetch(() => jsonResponse([778]));
      try {
        clickAttach('CONVENTIX');
        chooseFile('Convention.pdf');
        await uploadFinished();
        window.renderAdministratif();
        await wait(30);
        assertEqual(countReads(), 0);
        assertEqual(names('CONVENTIX')[0], 'Convention.pdf');
      } finally { rest.restore(); spy.restore(); }
    });

    it('ajoute aux fichiers déjà là, sans les remplacer', async function () {
      await loadState({ files: { CONVENTIX: ['L', 501] }, attachments: { id: [501], fileName: ['Convention_V1.pdf'] } });
      await waitFor(() => names('CONVENTIX')[0] === 'Convention_V1.pdf', 'nom du fichier existant');
      const rest = stubFetch(() => jsonResponse([779]));
      try {
        clickAttach('CONVENTIX');
        chooseFile('Convention_V2.pdf');
        await uploadFinished();
        assertDeepEqual(writes()[0].fields[FILE_COLUMN], ['L', 501, 779]);
        assertDeepEqual(names('CONVENTIX'), ['Convention_V1.pdf', 'Convention_V2.pdf']);
      } finally { rest.restore(); }
    });

    it('refuse un fichier qui n\'est pas un PDF : rien n\'est envoyé ni écrit, un message le dit', async function () {
      await loadState();
      const rest = stubFetch(() => jsonResponse([780]));
      clearToast();
      try {
        clickAttach('CONVENTIX');
        chooseFile('convention.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        await wait(30);
        assertEqual(rest.log.length, 0, 'aucun envoi');
        assertEqual(writes().length, 0, 'aucune écriture');
        assertIncludes(toastText(), 'PDF');
        assertEqual(fileCell('CONVENTIX').querySelectorAll('.admin-file-busy').length, 0);
      } finally { rest.restore(); }
    });

    it('accepte un PDF dont le navigateur ne donne pas le type (extension .pdf, majuscules comprises)', async function () {
      await loadState();
      const rest = stubFetch(() => jsonResponse([781]));
      try {
        clickAttach('CONVENTIX');
        chooseFile('CONVENTION.PDF', { type: '' });
        await uploadFinished();
        assertEqual(rest.log.length, 1);
        assertEqual(writes().length, 1);
      } finally { rest.restore(); }
    });

    it('droit d\'édition manquant (403) : message clair, aucune écriture, la cellule redevient utilisable', async function () {
      await loadState();
      const rest = stubFetch(() => new Response('forbidden', { status: 403 }));
      clearToast();
      try {
        clickAttach('CONVENTIX');
        chooseFile('Convention.pdf');
        await uploadFinished();
        assertEqual(writes().length, 0);
        assertIncludes(toastText(), 'droit d\'édition');
        assertEqual(fileCell('CONVENTIX').querySelectorAll('[data-upload-file]').length, 1, 'on peut réessayer');
        assertEqual(fileCell('CONVENTIX').querySelectorAll('.admin-file').length, 0);
      } finally { rest.restore(); }
    });

    it('fichier trop volumineux (413), réseau coupé, réponse inattendue : une erreur, jamais d\'écriture', async function () {
      await loadState();
      const answers = [
        () => new Response('', { status: 413 }),
        () => { throw new TypeError('Failed to fetch'); },
        () => jsonResponse({ error: 'autre chose' })
      ];
      const expected = ['trop volumineux', 'connexion', 'inattendue'];
      for (let i = 0; i < answers.length; i++) {
        const rest = stubFetch(answers[i]);
        clearToast();
        try {
          clickAttach('CONVENTIX');
          chooseFile('Convention.pdf');
          await uploadFinished();
          assertIncludes(toastText(), expected[i]);
        } finally { rest.restore(); }
      }
      assertEqual(writes().length, 0);
    });

    it('envoi réussi mais écriture de la cellule refusée : erreur affichée et la cellule garde son ancienne valeur', async function () {
      await loadState({ files: { CONVENTIX: ['L', 501] }, attachments: { id: [501], fileName: ['Convention_V1.pdf'] } });
      await waitFor(() => names('CONVENTIX')[0] === 'Convention_V1.pdf', 'nom du fichier existant');
      const rest = stubFetch(() => jsonResponse([782]));
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async () => { throw new Error('écriture refusée'); };
      clearToast();
      try {
        clickAttach('CONVENTIX');
        chooseFile('Convention_V2.pdf');
        await uploadFinished();
        assertIncludes(toastText(), 'écriture refusée');
        assertDeepEqual(project('CONVENTIX')[FILE_COLUMN], ['L', 501], 'valeur locale restaurée');
        assertDeepEqual(names('CONVENTIX'), ['Convention_V1.pdf']);
      } finally { window.grist.docApi.applyUserActions = original; rest.restore(); }
    });

    it('un second choix de fichier pendant l\'envoi du premier n\'envoie rien de plus (un seul envoi, une seule écriture)', async function () {
      await loadState();
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      const rest = stubFetch(async () => { await gate; return jsonResponse([783]); });
      try {
        clickAttach('CONVENTIX');
        chooseFile('Premier.pdf');
        assertEqual(fileCell('CONVENTIX').querySelectorAll('[data-upload-file]').length, 0, 'plus de trombone pendant l\'envoi');
        chooseFile('Second.pdf'); // « change » rejoué sur le même sélecteur, sans nouveau clic sur un trombone
        release();
        await uploadFinished();
        assertEqual(rest.log.length, 1, 'un seul envoi');
        assertEqual(rest.log[0].init.body.get('upload').name, 'Premier.pdf');
        assertEqual(writes().length, 1);
      } finally { release(); rest.restore(); }
    });

    it('annuler le sélecteur (aucun fichier choisi) n\'envoie ni n\'écrit rien', async function () {
      await loadState();
      const rest = stubFetch(() => jsonResponse([784]));
      try {
        clickAttach('CONVENTIX');
        fire(document.querySelector('[data-admin-file-input]'), 'change');
        await wait(30);
        assertEqual(rest.log.length, 0);
        assertEqual(writes().length, 0);
      } finally { rest.restore(); }
    });

    it('le fichier va au projet dont on a cliqué le trombone, pas à un autre', async function () {
      await loadState();
      const rest = stubFetch(() => jsonResponse([785]));
      try {
        clickAttach('SIGNEX');
        chooseFile('Signee.pdf');
        await uploadFinished();
        assertEqual(writes()[0].id, 16, 'ligne SIGNEX');
        assertEqual(fileCell('CONVENTIX').querySelectorAll('.admin-file').length, 0);
        assertEqual(names('SIGNEX')[0], 'Signee.pdf');
      } finally { rest.restore(); }
    });

    it('le sélecteur est unique et survit aux rendus : un choix fait après un rendu complet est quand même pris en compte', async function () {
      await loadState();
      const rest = stubFetch(() => jsonResponse([786]));
      try {
        clickAttach('CONVENTIX');
        window.renderAdministratif(); // la boîte de dialogue du système est ouverte, la page se redessine
        chooseFile('Convention.pdf');
        await uploadFinished();
        assertEqual(writes().length, 1);
        assertEqual(names('CONVENTIX')[0], 'Convention.pdf');
      } finally { rest.restore(); }
    });
  });

  describe('Administratif — Conventions : retirer le PDF de la cellule', function () {
    const attachments = { id: [501, 502], fileName: ['Convention_V1.pdf', 'Convention_V2.pdf'] };

    it('la croix retire seulement ce fichier : écriture de la liste restante, valeur locale à jour', async function () {
      await loadState({ files: { CONVENTIX: ['L', 501, 502] }, attachments });
      await waitFor(() => names('CONVENTIX').length === 2 && names('CONVENTIX')[1] === 'Convention_V2.pdf', 'noms de fichier');
      clearToast();
      fileCell('CONVENTIX').querySelectorAll('[data-detach-file]')[0].click();
      await wait(10);
      assertEqual(writes().length, 1);
      assertDeepEqual(writes()[0].fields[FILE_COLUMN], ['L', 502]);
      assertDeepEqual(project('CONVENTIX')[FILE_COLUMN], ['L', 502]);
      assertDeepEqual(names('CONVENTIX'), ['Convention_V2.pdf']);
      assertIncludes(toastText(), 'Convention_V1.pdf');
      assertIncludes(toastText(), 'le fichier reste dans le document', 'rien n\'est supprimé de Grist');
    });

    it('retirer le dernier fichier écrit une liste vide [\'L\'] et rend le trombone « joindre »', async function () {
      await loadState({ files: { CONVENTIX: ['L', 501] }, attachments });
      await waitFor(() => names('CONVENTIX')[0] === 'Convention_V1.pdf', 'nom du fichier');
      fileCell('CONVENTIX').querySelector('[data-detach-file]').click();
      await wait(10);
      assertDeepEqual(writes()[0].fields[FILE_COLUMN], ['L']);
      assertEqual(fileCell('CONVENTIX').querySelectorAll('.admin-file').length, 0);
      assertEqual(fileCell('CONVENTIX').querySelector('[data-upload-file]').getAttribute('aria-label'), 'Joindre la convention (PDF)');
    });

    it('écriture refusée : le fichier réapparaît et une erreur est affichée', async function () {
      await loadState({ files: { CONVENTIX: ['L', 501] }, attachments });
      await waitFor(() => names('CONVENTIX')[0] === 'Convention_V1.pdf', 'nom du fichier');
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async () => { throw new Error('écriture refusée'); };
      clearToast();
      try {
        fileCell('CONVENTIX').querySelector('[data-detach-file]').click();
        await wait(20);
        assertIncludes(toastText(), 'écriture refusée');
        assertDeepEqual(project('CONVENTIX')[FILE_COLUMN], ['L', 501]);
        assertDeepEqual(names('CONVENTIX'), ['Convention_V1.pdf']);
      } finally { window.grist.docApi.applyUserActions = original; }
    });

    it('un fichier déjà retiré (clic sur un ancien rendu) n\'écrit rien', async function () {
      await loadState({ files: { CONVENTIX: ['L', 501] }, attachments });
      const stale = fileCell('CONVENTIX').querySelector('[data-detach-file]');
      project('CONVENTIX')[FILE_COLUMN] = ['L'];
      stale.click();
      await wait(10);
      assertEqual(writes().length, 0);
    });
  });
}());
