/**
 * Non-regression suite : formulaire Grist du script UB Invest, créé et publié par le widget (js/pages/import-form.js) — 24/11/2026.
 *
 * Un formulaire public ne sait qu'ajouter des lignes à sa table, et son lien donne ce droit à qui le possède. Donc :
 *  - le widget le crée SANS le publier (une page neuve, sans les champs techniques), une seule fois ;
 *  - il ne le publie que sur l'accord de la personne (case cochée) ; la publication fait les mêmes écritures que le bouton « Publier » de Grist ;
 *  - il peut le dépublier (le lien cesse de fonctionner, le formulaire reste) ;
 *  - il ne prétend jamais connaître le lien : seule la personne peut le copier dans Grist.
 * Les écritures sont jouées contre un faux Grist de métadonnées (_grist_*), sans aucune donnée réelle.
 */
(function () {
  'use strict';

  const F = () => window.ImportForm;
  const P = () => window.ImportHistoriquePage;
  const byId = id => document.getElementById(id);

  // Faux Grist de métadonnées : les tables _grist_* d'une table Import_Financements, avec CreateViewSection qui crée page, section et un champ par colonne.
  function fakeGrist(options = {}) {
    const db = {
      _grist_Tables: [{ id: 1, tableId: 'Import_Financements' }, { id: 2, tableId: 'Autre' }],
      _grist_Tables_column: [{ id: 1, parentId: 1, colId: 'N_OPE' }, { id: 2, parentId: 1, colId: 'Lot' }, { id: 3, parentId: 1, colId: 'Cle_ligne' }, { id: 4, parentId: 1, colId: 'Exporte_le' }, { id: 5, parentId: 1, colId: 'Lignes_du_lot' }],
      _grist_Views: [{ id: 5, name: 'Projets' }], _grist_Pages: [{ id: 1, viewRef: 5, shareRef: 0 }],
      _grist_Views_section: [], _grist_Views_section_field: [], _grist_Shares: []
    };
    let next = 100;
    const log = [];
    const find = (table, id) => db[table].find(row => row.id === id);
    const fake = {
      db, log,
      async fetch(name) {
        const rows = db[name];
        if (!rows) throw new Error('table inconnue ' + name);
        const keys = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
        const out = {}; keys.forEach(key => { out[key] = rows.map(row => (row[key] === undefined ? null : row[key])); });
        if (!rows.length) out.id = [];
        return out;
      },
      async apply(actions) {
        return actions.map(action => {
          log.push(action);
          const [type, table, id, values] = action;
          if (type === 'CreateViewSection') {
            const viewRef = next++, sectionRef = next++, pageId = next++;
            db._grist_Views.push({ id: viewRef, name: 'New page' });
            db._grist_Pages.push({ id: pageId, viewRef, shareRef: 0 });
            db._grist_Views_section.push({ id: sectionRef, tableRef: table, parentId: viewRef, parentKey: 'form', shareOptions: '' });
            db._grist_Tables_column.filter(col => col.parentId === table).forEach(col => db._grist_Views_section_field.push({ id: next++, parentId: sectionRef, colRef: col.id }));
            return { sectionRef, viewRef };
          }
          if (type === 'RemoveRecord') { db[table] = db[table].filter(row => row.id !== id); return null; }
          if (type === 'AddRecord') { const row = Object.assign({ id: next++ }, values); db[table].push(row); return row.id; }
          if (type === 'UpdateRecord') {
            if (table === '_grist_Views' && options.refuseRename) throw new Error('écriture refusée (test)');
            Object.assign(find(table, id), values); return null;
          }
          throw new Error('action inconnue ' + type);
        });
      }
    };
    return fake;
  }
  const sectionOf = fake => fake.db._grist_Views_section[0];

  // ===========================================================================================================
  describe('Formulaire du script — création, publication, dépublication', function () {
    it('sans formulaire : rien n\'existe ; table absente : le dit', async function () {
      const fake = fakeGrist();
      assertEqual((await F().read(fake, 'Import_Financements')).exists, false);
      assertTrue((await F().read(fake, 'Introuvable')).tableMissing);
    });

    it('créer : une page neuve, un formulaire NON publié sans les champs techniques (Cle_ligne, Exporte_le), page nommée', async function () {
      const fake = fakeGrist();
      const form = await F().create(fake, 'Import_Financements');
      assertTrue(form.created); assertFalse(form.published); assertEqual(form.removed, 2); assertEqual(form.pageName, F().PAGE_NAME);
      assertDeepEqual(fake.log[0], ['CreateViewSection', 1, 0, 'form', null, 'Import_Financements']);
      const kept = fake.db._grist_Views_section_field.map(field => fake.db._grist_Tables_column.find(col => col.id === field.colRef).colId);
      assertDeepEqual(kept.sort(), ['Lignes_du_lot', 'Lot', 'N_OPE']);
      assertEqual(fake.db._grist_Views.find(view => view.id === form.viewRef).name, F().PAGE_NAME);
      assertEqual(sectionOf(fake).shareOptions, '', 'jamais publié à la création');
      assertEqual(fake.db._grist_Shares.length, 0, 'aucun partage créé');
    });

    it('créer deux fois ne crée qu\'un formulaire', async function () {
      const fake = fakeGrist();
      await F().create(fake, 'Import_Financements');
      const again = await F().create(fake, 'Import_Financements');
      assertFalse(again.created); assertTrue(again.exists);
      assertEqual(fake.log.filter(action => action[0] === 'CreateViewSection').length, 1);
    });

    it('si Grist refuse de renommer la page, le formulaire est créé quand même et la page garde son nom d\'origine', async function () {
      const fake = fakeGrist({ refuseRename: true });
      const form = await F().create(fake, 'Import_Financements');
      assertTrue(form.created); assertFalse(form.renamed); assertEqual(form.pageName, 'New page');
    });

    it('la réponse de Grist sans identifiants n\'est pas ignorée', async function () {
      const fake = fakeGrist();
      fake.apply = async () => [null];
      let error = null;
      try { await F().create(fake, 'Import_Financements'); } catch (err) { error = err; }
      assertTrue(!!error); assertIncludes(error.message, 'identifiant');
    });

    it('lire un formulaire existant : page, publié ou non ; plusieurs formulaires : celui de la page du widget d\'abord', async function () {
      const fake = fakeGrist();
      await F().create(fake, 'Import_Financements');
      fake.db._grist_Views.push({ id: 90, name: 'Autre page' });
      fake.db._grist_Views_section.push({ id: 91, tableRef: 1, parentId: 90, parentKey: 'form', shareOptions: JSON.stringify({ publish: true, form: true }) });
      const form = await F().read(fake, 'Import_Financements');
      assertEqual(form.count, 2); assertEqual(form.pageName, F().PAGE_NAME); assertFalse(form.published);
      fake.db._grist_Views_section = fake.db._grist_Views_section.filter(section => section.id === 91);
      assertTrue((await F().read(fake, 'Import_Financements')).published);
    });

    it('publier : un partage créé et rattaché à la page, puis la section publiée (les écritures du bouton Publier de Grist), dans cet ordre', async function () {
      const fake = fakeGrist();
      const form = await F().create(fake, 'Import_Financements');
      fake.log.length = 0;
      const published = await F().publish(fake, form);
      assertTrue(published.published);
      assertDeepEqual(fake.log.map(action => action[0] + ':' + action[1]), ['AddRecord:_grist_Shares', 'UpdateRecord:_grist_Pages', 'UpdateRecord:_grist_Views_section']);
      assertEqual(JSON.parse(fake.db._grist_Shares[0].options).publish, true);
      const page = fake.db._grist_Pages.find(item => item.viewRef === form.viewRef);
      assertEqual(page.shareRef, fake.db._grist_Shares[0].id);
      assertDeepEqual(JSON.parse(sectionOf(fake).shareOptions), { publish: true, form: true });
      assertTrue((await F().read(fake, 'Import_Financements')).published);
    });

    it('publier de nouveau réutilise le partage de la page ; un partage utilisé par une autre page n\'est pas repris', async function () {
      const fake = fakeGrist();
      const form = await F().create(fake, 'Import_Financements');
      await F().publish(fake, form); await F().unpublish(fake, form);
      fake.log.length = 0;
      await F().publish(fake, form);
      assertEqual(fake.log.filter(action => action[0] === 'AddRecord').length, 0, 'pas de deuxième partage');
      // Une autre page (Projets) porte le même partage que la page du formulaire : le formulaire prend le sien.
      const shared = fake.db._grist_Pages.find(item => item.viewRef === form.viewRef).shareRef;
      fake.db._grist_Pages.find(item => item.viewRef === 5).shareRef = shared;
      fake.log.length = 0;
      await F().publish(fake, form);
      assertEqual(fake.log.filter(action => action[0] === 'AddRecord').length, 1, 'un partage à lui');
      assertTrue(fake.db._grist_Pages.find(item => item.viewRef === form.viewRef).shareRef !== shared);
    });

    it('publier sans formulaire est refusé', async function () {
      let error = null;
      try { await F().publish(fakeGrist(), { exists: false }); } catch (err) { error = err; }
      assertTrue(!!error); assertIncludes(error.message, 'crée-le d\'abord');
    });

    it('dépublier ferme le lien (les options de la section sont vidées) et garde le formulaire', async function () {
      const fake = fakeGrist();
      const form = await F().create(fake, 'Import_Financements');
      await F().publish(fake, form);
      const closed = await F().unpublish(fake, form);
      assertFalse(closed.published);
      assertEqual(sectionOf(fake).shareOptions, '{}');
      const read = await F().read(fake, 'Import_Financements');
      assertTrue(read.exists); assertFalse(read.published);
    });
  });

  // ===========================================================================================================
  describe('Formulaire du script — la page Import financier', function () {
    const columnar = rows => {
      const keys = Array.from(new Set(rows.flatMap(r => Object.keys(r)).filter(k => k !== 'id')));
      const out = { id: rows.map(r => r.id) };
      keys.forEach(k => { out[k] = rows.map(r => (r[k] === undefined ? null : r[k])); });
      return out;
    };
    const click = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    // La page lit les métadonnées par fetchTable et écrit par applyUserActions : le faux Grist prend ce qui le concerne, le mock le reste.
    async function open(fake) {
      const api = window.grist.docApi, fetchTable = api.fetchTable, applyUserActions = api.applyUserActions;
      api.fetchTable = async name => (name.startsWith('_grist_') ? fake.fetch(name) : fetchTable.call(api, name));
      api.applyUserActions = async actions => {
        const meta = actions.every(action => action[0] === 'CreateViewSection' || String(action[1]).startsWith('_grist_'));
        return meta ? { retValues: await fake.apply(actions) } : applyUserActions.call(api, actions);
      };
      window.__mockSetTable('Import_Financements', columnar([{ id: 1, N_OPE: 'X', Lot: '' }]));
      window.__mockSetTable('Projets', columnar([])); window.__mockSetTable('Lignes_OPE', columnar([]));
      P().resetState();
      await P().open();
      return () => { api.fetchTable = fetchTable; api.applyUserActions = applyUserActions; };
    }
    const box = () => document.querySelector('[data-ih-box="formulaire"]');

    it('sans formulaire : la page propose de le créer, sans rien créer toute seule', async function () {
      const fake = fakeGrist(); const restore = await open(fake);
      try {
        assertTrue(!!box()); assertIncludes(box().textContent, 'à créer');
        assertEqual(fake.log.length, 0, 'ouvrir la page ne crée aucun formulaire');
        assertTrue(!!byId('ih-form-create'));
        assertFalse(!!byId('ih-form-publish'));
      } finally { restore(); }
    });

    it('créer : formulaire non publié ; la page demande l\'accord avant de le publier', async function () {
      const fake = fakeGrist(); const restore = await open(fake);
      try {
        click(byId('ih-form-create'));
        await waitFor(() => byId('ih-form-publish'), 'formulaire créé');
        assertEqual(sectionOf(fake).shareOptions, '', 'pas publié');
        assertIncludes(box().textContent, 'pas publié');
        assertTrue(byId('ih-form-publish').disabled, 'le bouton attend la case d\'accord');
        click(byId('ih-form-publish'));
        assertEqual(fake.db._grist_Shares.length, 0, 'un clic sans accord ne publie rien');
      } finally { restore(); }
    });

    it('publier avec l\'accord : le formulaire est publié, la page dit où copier le lien (le widget ne le connaît pas)', async function () {
      const fake = fakeGrist(); const restore = await open(fake);
      try {
        click(byId('ih-form-create')); await waitFor(() => byId('ih-form-publish'), 'formulaire créé');
        const accord = byId('ih-form-accept'); accord.checked = true; fire(accord, 'change');
        assertFalse(byId('ih-form-publish').disabled);
        click(byId('ih-form-publish'));
        await waitFor(() => byId('ih-form-unpublish'), 'formulaire publié');
        assertDeepEqual(JSON.parse(sectionOf(fake).shareOptions), { publish: true, form: true });
        const text = box().textContent;
        assertIncludes(text, 'Partager'); assertIncludes(text, 'Copier le lien'); assertIncludes(text, 'grist.txt');
        assertFalse(/https?:\/\//.test(text), 'aucune adresse de formulaire n\'est affichée : le widget ne la connaît pas');
      } finally { restore(); }
    });

    it('dépublier : le lien est fermé et la page propose de republier (l\'accord est redemandé)', async function () {
      const fake = fakeGrist(); const restore = await open(fake);
      try {
        click(byId('ih-form-create')); await waitFor(() => byId('ih-form-publish'), 'créé');
        const accord = byId('ih-form-accept'); accord.checked = true; fire(accord, 'change'); click(byId('ih-form-publish'));
        await waitFor(() => byId('ih-form-unpublish'), 'publié');
        click(byId('ih-form-unpublish'));
        await waitFor(() => byId('ih-form-publish'), 'dépublié');
        assertEqual(sectionOf(fake).shareOptions, '{}');
        assertTrue(byId('ih-form-publish').disabled, 'l\'accord est redemandé');
      } finally { restore(); }
    });

    it('si Grist ne laisse pas lire ses métadonnées, la page le dit au lieu de créer un doublon', async function () {
      const restore = await open(fakeGrist());
      try {
        const api = window.grist.docApi, original = api.fetchTable;
        api.fetchTable = async name => { if (name.startsWith('_grist_')) throw new Error('accès refusé (test)'); return original.call(api, name); };
        await P().open();
        assertIncludes(box().textContent, 'n\'a pas pu être lu');
        assertFalse(!!byId('ih-form-create'), 'pas de création à l\'aveugle');
      } finally { restore(); }
    });
  });
})();
