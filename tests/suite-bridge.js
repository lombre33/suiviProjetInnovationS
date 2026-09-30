/**
 * Non-regression suite: pont Grist -> widget imbriqué (js/core/grist-bridge.js).
 *
 * Un faux publipostage+ (tests/fake-publipostage.html) charge le VRAI client grist-plugin-api de Grist (tests/vendor/,
 * compilé depuis grist-core) dans une iframe de la page de test, et s'abonne comme le fait publipostage+ (grist.ready,
 * deux onRecord 'shown'/'normal', onOptions, getTable().getTableId()). Le pont doit lui servir d'hôte Grist : API
 * document, enregistrement sélectionné (le "select by"), options — et rester étanche (origine, liste blanche).
 * La page de test elle-même joue le rôle de "ce widget" : window.grist y est le mock de tests/mock-grist.js.
 */
(function () {
  'use strict';

  const NESTED_URL = 'fake-publipostage.html'; // relatif à tests/index.html : même origine que la page de test
  const OPTIONS_KEY = 'publipostage';

  async function assertRejectsCode(promise, code, label) {
    try { await promise; } catch (err) { assertEqual(err && err.code, code, label); return; }
    throw new Error(`${label || 'appel'} : rejet ${code} attendu, l'appel a réussi`);
  }

  // Ouvre le faux widget dans une iframe reliée au pont ; ferme et nettoie quoi qu'il arrive.
  async function withNested(config, fn, options) {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:320px;height:120px;border:0';
    document.body.appendChild(frame);
    const bridge = GristBridge.attach(frame, Object.assign({ origin: location.origin, tableId: 'Projets', rowId: 12, optionsKey: OPTIONS_KEY }, config));
    frame.src = NESTED_URL;
    const ctx = { frame, bridge, win: () => frame.contentWindow, nested: () => frame.contentWindow.__NESTED__ };
    try {
      if (!options || options.waitReady !== false) await bridge.whenReady(8000);
      await fn(ctx);
    } finally {
      bridge.detach();
      frame.remove();
    }
  }

  // Métadonnées comme Grist les expose (_grist_Tables, _grist_Tables_column) + colonnes d'affichage des références
  // (gristHelper_DisplayN), ajoutées au magasin du mock pour CE test seulement : les autres suites n'en ont pas besoin.
  function installSchema() {
    const fixtures = window.__FIXTURES__;
    const projets = JSON.parse(JSON.stringify(fixtures.Projets));
    const shown = (table, col, id) => fixtures[table][col][fixtures[table].id.indexOf(id)];
    projets.gristHelper_Display2 = projets.Programme.map(id => shown('Programmes', 'Programme', id));
    projets.gristHelper_Display3 = projets.Porteur_1.map(id => shown('Annuaire', 'nom_et_Prenom', id));
    projets.gristHelper_Display4 = projets.Ligne_OPE.map(list => ['L', ...list.slice(1).map(id => shown('EcritureComptables', 'N_OPE', id))]);
    projets.gristHelper_Display5 = projets.Partenaire_s_convention_reversement.map(list => ['L', ...list.slice(1).map(id => shown('Etablissements', 'Acronyme', id))]);
    projets.manualSort = [7, 6, 5, 4, 3, 2, 1]; // ordre inverse des id : le tri de la vue par défaut de Grist
    projets.Date_debut_Projet[2] = 1790000000; // CONVENTIX (id 12)
    projets.Date_limite_financement[2] = 1790003600;
    window.__mockSetTable('Projets', projets);

    const types = {
      Projets: {
        Programme: 'Ref:Programmes', Porteur_1: 'Ref:Annuaire', Ligne_OPE: 'RefList:EcritureComptables',
        Partenaire_s_convention_reversement: 'RefList:Etablissements', Date_debut_Projet: 'Date',
        Date_limite_financement: 'DateTime:Europe/Paris', Convention_de_reversement: 'Bool',
        c2026_M10_Fonctionnement: 'Numeric', manualSort: 'ManualSortPos'
      }
    };
    const displayCols = {
      'Projets.Programme': 'gristHelper_Display2', 'Projets.Porteur_1': 'gristHelper_Display3', 'Projets.Ligne_OPE': 'gristHelper_Display4',
      'Projets.Partenaire_s_convention_reversement': 'gristHelper_Display5'
    };
    const store = Object.assign({}, fixtures, { Projets: projets });
    const tableNames = Object.keys(store);
    const metaTables = { id: tableNames.map((name, i) => i + 1), tableId: tableNames };
    const metaCols = { id: [], parentId: [], colId: [], type: [], displayCol: [], parentPos: [] };
    const refByKey = {};
    tableNames.forEach((tableId, t) => Object.keys(store[tableId]).filter(colId => colId !== 'id').forEach((colId, pos) => {
      const ref = metaCols.id.length + 1;
      refByKey[`${tableId}.${colId}`] = ref;
      metaCols.id.push(ref);
      metaCols.parentId.push(t + 1);
      metaCols.colId.push(colId);
      metaCols.type.push((types[tableId] && types[tableId][colId]) || (colId.startsWith('gristHelper_') ? 'Any' : 'Text'));
      metaCols.displayCol.push(0);
      metaCols.parentPos.push(pos + 1);
    }));
    Object.keys(displayCols).forEach(key => { metaCols.displayCol[refByKey[key] - 1] = refByKey[`Projets.${displayCols[key]}`]; });
    window.__mockSetTable('_grist_Tables', metaTables);
    window.__mockSetTable('_grist_Tables_column', metaCols);
  }

  describe('Pont Grist — connexion et enregistrement sélectionné ("select by")', function () {
    it('le widget imbriqué se connecte et reçoit la ligne sélectionnée, références sous leur valeur affichée', async function () {
      installSchema();
      await withNested({}, async ctx => {
        const nested = ctx.nested();
        await waitFor(() => nested.normal.length >= 1, 'onRecord (includeColumns normal)');
        const { record, mappings } = nested.normal[0];
        assertEqual(record.id, 12);
        assertEqual(record.Acronyme, 'CONVENTIX');
        assertEqual(record.Programme, 'Programme A', 'une Référence arrive sous sa valeur affichée, pas sous son numéro');
        assertEqual(record.Porteur_1, 'Alice Martin');
        assertEqual(mappings, null, 'aucun mappage de colonnes ici');
        assertFalse('gristHelper_Display2' in record, 'les colonnes d\'aide de Grist restent invisibles');
        assertFalse('manualSort' in record);
        assertDeepEqual(nested.unhandled, [], 'aucun appel RPC du widget imbriqué ne doit échouer');
      });
    });

    it("les deux abonnements de publipostage+ ('shown' repli et 'normal') reçoivent la ligne", async function () {
      installSchema();
      await withNested({}, async ctx => {
        const nested = ctx.nested();
        await waitFor(() => nested.shown.length >= 1 && nested.normal.length >= 1, 'les deux onRecord');
        assertEqual(nested.shown[0].record.id, 12);
        assertEqual(nested.normal[0].record.id, 12);
        assertEqual(nested.shown[0].record.Acronyme, 'CONVENTIX');
      });
    });

    it('le widget imbriqué connaît la table liée (grist.getTable().getTableId())', async function () {
      await withNested({}, async ctx => {
        await waitFor(() => ctx.nested().tableId, 'tableId');
        assertEqual(ctx.nested().tableId, 'Projets');
      });
    });

    it('select() change l\'enregistrement sélectionné : onRecord se redéclenche avec la nouvelle ligne', async function () {
      installSchema();
      await withNested({}, async ctx => {
        const nested = ctx.nested();
        await waitFor(() => nested.normal.length >= 1, 'première ligne');
        ctx.bridge.select(11);
        await waitFor(() => nested.normal.some(entry => entry.record.id === 11), 'ligne 11');
        const last = nested.normal[nested.normal.length - 1].record;
        assertEqual(last.Acronyme, 'NOTIFY');
        assertEqual(ctx.bridge.getState().rowId, 11);
      });
    });

    it('sans ligne sélectionnée au départ, le widget connaît la table mais ne reçoit aucun enregistrement', async function () {
      await withNested({ rowId: null }, async ctx => {
        await waitFor(() => ctx.nested().tableId, 'tableId');
        await wait(150);
        assertEqual(ctx.nested().normal.length, 0);
        ctx.bridge.select(10);
        await waitFor(() => ctx.nested().normal.length >= 1, 'ligne après select()');
        assertEqual(ctx.nested().normal[0].record.Acronyme, 'INNOVX');
      });
    });

    it('une ligne qui n\'existe plus donne un enregistrement vide (colonnes à null), sans planter le widget', async function () {
      installSchema();
      await withNested({ rowId: 999 }, async ctx => {
        await waitFor(() => ctx.nested().normal.length >= 1, 'onRecord');
        const { record } = ctx.nested().normal[0];
        assertEqual(record.id, 999);
        assertEqual(record.Acronyme, null);
        assertDeepEqual(ctx.nested().unhandled, []);
      });
    });
  });

  describe('Pont Grist — API document relayée à la vraie API de ce widget', function () {
    it('fetchTable, listTables, getDocName et getAccessToken passent par grist.docApi de ce widget', async function () {
      installSchema();
      await withNested({}, async ctx => {
        const api = ctx.win().grist.docApi;
        assertDeepEqual(await api.fetchTable('Notifications'), await window.grist.docApi.fetchTable('Notifications'));
        const tables = await api.listTables();
        assertTrue(tables.includes('Projets') && tables.includes('Notifications'));
        assertFalse(tables.some(name => name.startsWith('_grist_')), 'les tables de métadonnées ne sont pas listées, comme dans Grist');
        assertEqual(await api.getDocName(), 'Document de test');
        assertEqual((await api.getAccessToken({ readOnly: true })).token, 'jeton-de-test');
      });
    });

    it('applyUserActions écrit dans le document, prévient la page (onWrite) et rafraîchit la ligne sélectionnée', async function () {
      installSchema();
      const written = [];
      await withNested({ onWrite: actions => written.push(actions) }, async ctx => {
        const nested = ctx.nested();
        await waitFor(() => nested.normal.length >= 1, 'première ligne');
        const before = nested.normal.length;
        const result = await ctx.win().grist.docApi.applyUserActions([['UpdateRecord', 'Projets', 12, { Description_rapide_projet: 'Texte de test' }]]);
        assertTrue(!!result, 'le résultat de Grist est rendu au widget');
        assertTrue(window.__TEST_CALLS__.some(call => call.type === 'UpdateRecord' && call.table === 'Projets' && call.id === 12 &&
          call.fields.Description_rapide_projet === 'Texte de test'), 'l\'écriture doit atteindre le document');
        assertEqual(written.length, 1, 'la page est prévenue qu\'une écriture a eu lieu');
        await waitFor(() => nested.normal.length > before && nested.normal[nested.normal.length - 1].record.Description_rapide_projet === 'Texte de test',
          'onRecord rafraîchi après écriture');
      });
    });

    it('un appel dont l\'API Grist échoue renvoie l\'erreur au widget imbriqué', async function () {
      await withNested({}, async ctx => {
        let message = '';
        try { await ctx.win().grist.docApi.fetchTable('TableInexistante'); } catch (err) { message = err.message; }
        assertIncludes(message, 'TableInexistante');
        assertTrue(ctx.bridge.getLog().some(entry => entry.kind === 'error'), 'l\'échec est consigné dans le journal du pont');
      });
    });
  });

  // Le mappage de publipostage+ (« Tables liées ») vit dans une table DU DOCUMENT, Publipostage_LiensTables (une règle par table cible,
  // cf. js/grist-api.js de publipostage+ : ensureLinksTableExists / loadLinkRules / saveLinkRule / deleteLinkRule) : partagée par toutes
  // ses vues, donc aussi par l'instance imbriquée, pourvu que le pont relaie ces appels sans les filtrer ni les déformer.
  describe('Pont Grist — mappage de publipostage+ (Publipostage_LiensTables)', function () {
    const LINKS = 'Publipostage_LiensTables';
    const RULES = { id: [1, 2], TableCible: ['Projets', 'Structures'], Mode: ['match', 'singleton'], ColonneCible: ['id', ''], ColonneSource: ['Projet', ''] };

    it('publipostage+ retrouve les règles déjà faites depuis une autre vue : la table est listée (pas recréée) et lue telle quelle', async function () {
      window.__mockSetTable(LINKS, RULES);
      await withNested({}, async ctx => {
        const api = ctx.win().grist.docApi;
        assertTrue((await api.listTables()).includes(LINKS), 'listée : ensureLinksTableExists() ne la recrée pas');
        assertDeepEqual(await api.fetchTable(LINKS), RULES, 'les règles arrivent sans altération');
        assertFalse(window.__TEST_CALLS__.some(call => call.type === 'AddTable'), 'aucune écriture pour simplement lire le mappage');
      });
    });

    it('sans table de règles, publipostage+ la crée puis ajoute, modifie et retire une règle : chaque écriture atteint le document et se relit', async function () {
      const written = [];
      await withNested({ onWrite: actions => written.push(actions.map(action => action[0])) }, async ctx => {
        const api = ctx.win().grist.docApi;
        assertFalse((await api.listTables()).includes(LINKS));
        await api.applyUserActions([['AddTable', LINKS, [
          { id: 'TableCible', type: 'Text' }, { id: 'Mode', type: 'Text' }, { id: 'ColonneCible', type: 'Text' }, { id: 'ColonneSource', type: 'Text' }]]]);
        assertTrue((await api.listTables()).includes(LINKS));
        const added = await api.applyUserActions([['AddRecord', LINKS, null, { TableCible: 'Notifications', Mode: 'match', ColonneCible: 'Projet', ColonneSource: 'id' }]]);
        const ruleId = added.retValues[0];
        assertEqual(typeof ruleId, 'number', 'AddRecord rend l\'identifiant de la règle (retValues[0]), comme dans Grist');
        assertDeepEqual(await api.fetchTable(LINKS),
          { id: [ruleId], TableCible: ['Notifications'], Mode: ['match'], ColonneCible: ['Projet'], ColonneSource: ['id'] });
        await api.applyUserActions([['UpdateRecord', LINKS, ruleId, { Mode: 'singleton', ColonneCible: '', ColonneSource: '' }]]);
        assertEqual((await api.fetchTable(LINKS)).Mode[0], 'singleton');
        await api.applyUserActions([['RemoveRecord', LINKS, ruleId]]);
        assertDeepEqual((await api.fetchTable(LINKS)).id, [], 'la règle supprimée n\'est plus lue');
        assertDeepEqual(written, [['AddTable'], ['AddRecord'], ['UpdateRecord'], ['RemoveRecord']], 'la page est prévenue de chaque écriture');
      });
    });

    it('les règles et les métadonnées de colonnes (findReferenceColumns de publipostage+) se lisent par le même pont, sans invalider la ligne présentée', async function () {
      installSchema();
      window.__mockSetTable(LINKS, RULES);
      await withNested({}, async ctx => {
        const api = ctx.win().grist.docApi;
        const [tables, columns] = await Promise.all([api.fetchTable('_grist_Tables'), api.fetchTable('_grist_Tables_column')]);
        assertTrue(tables.tableId.includes('Projets') && columns.type.some(type => type === 'Ref:Programmes'), 'métadonnées relayées');
        await waitFor(() => ctx.nested().normal.length >= 1, 'onRecord');
        assertEqual(ctx.nested().normal[0].record.Acronyme, 'CONVENTIX');
        assertDeepEqual(ctx.nested().unhandled, []);
      });
    });
  });

  describe('Pont Grist — options du widget imbriqué', function () {
    it('à l\'ouverture, onOptions livre les options enregistrées SANS les autres options de ce widget, avec accessLevel full', async function () {
      window.__mockSetWidgetOptions({ [OPTIONS_KEY]: { gabarits: ['A', 'B'] }, autre: 'privé' });
      await withNested({}, async ctx => {
        await waitFor(() => ctx.nested().options.length >= 1, 'onOptions');
        const { options, settings } = ctx.nested().options[0];
        assertDeepEqual(options, { gabarits: ['A', 'B'] });
        assertEqual(settings.accessLevel, 'full');
        assertDeepEqual(settings.linking, { asTarget: null, asSource: false });
        assertDeepEqual(await ctx.win().grist.getOptions(), { gabarits: ['A', 'B'] }, 'getOptions() rend la même chose');
        assertEqual(await ctx.win().grist.getOption('gabarits').then(v => v.length), 2);
      });
    });

    it('setOption / setOptions / clearOptions sont persistés sous la clé dédiée, sans écraser les options de ce widget, puis notifiés', async function () {
      window.__mockSetWidgetOptions({ autre: 'privé' });
      await withNested({}, async ctx => {
        const grist = ctx.win().grist;
        await waitFor(() => ctx.nested().options.length >= 1, 'onOptions initial');
        await grist.setOption('modele', 'A');
        assertDeepEqual(window.__mockWidgetOptions(), { autre: 'privé', [OPTIONS_KEY]: { modele: 'A' } });
        await waitFor(() => ctx.nested().options.some(e => e.options && e.options.modele === 'A'), 'onOptions après setOption');
        await Promise.all([grist.setOption('a', 1), grist.setOption('b', 2)]);
        assertDeepEqual(window.__mockWidgetOptions()[OPTIONS_KEY], { modele: 'A', a: 1, b: 2 }, 'deux setOption simultanés ne s\'écrasent pas');
        await grist.setOptions({ seul: true });
        assertDeepEqual(await grist.getOptions(), { seul: true });
        await grist.clearOptions();
        assertEqual(await grist.getOptions(), null);
        assertEqual(window.__mockWidgetOptions().autre, 'privé', 'les options propres de ce widget ne sont jamais touchées');
      });
    });

    it('une clé dangereuse (__proto__) est refusée', async function () {
      await withNested({}, async ctx => {
        await assertRejectsCode(ctx.win().grist.setOption('__proto__', { polluted: true }), 'RPC_INVALID_ARGS');
        assertEqual(({}).polluted, undefined);
      });
    });
  });

  describe('Pont Grist — fidélité de GristView (mêmes formats que Grist)', function () {
    it('fetchSelectedRecord : valeurs affichées, dates et références ré-encodées comme GristViewImpl', async function () {
      installSchema();
      await withNested({}, async ctx => {
        const view = ctx.win().grist.viewApi; // stub brut : aucune décodation côté client
        const rec = await view.fetchSelectedRecord(12, { includeColumns: 'normal' });
        assertEqual(rec.id, 12);
        assertEqual(rec.Programme, 'Programme A');
        assertDeepEqual(rec.Date_debut_Projet, ['d', 1790000000]);
        assertDeepEqual(rec.Date_limite_financement, ['D', 1790003600, 'Europe/Paris']);
        assertDeepEqual(rec.Partenaire_s_convention_reversement, ['L', 'CNRS', 'INSERM'], 'RefList : valeurs affichées, liste brute (défaut connu de Grist)');
        assertEqual(rec.Convention_de_reversement, true);
        assertEqual(rec.c2026_M10_Fonctionnement, 0);

        const idOnly = await view.fetchSelectedRecord(12, { expandRefs: false });
        assertDeepEqual(idOnly.Programme, ['R', 'Programmes', 1], 'expandRefs:false : la référence reste un identifiant de ligne');
        assertDeepEqual(idOnly.Partenaire_s_convention_reversement, ['L', 2, 3]);

        const normal = await view.fetchSelectedRecord(12, { cellFormat: 'normal', expandRefs: false });
        assertEqual(normal.Programme, 1);
        assertEqual(normal.Date_debut_Projet, 1790000000, 'cellFormat normal : aucune ré-encodage');

        const typed = await view.fetchSelectedRecord(12, { cellFormat: 'typed' });
        assertDeepEqual(typed.Programme, ['R', 'Programmes', 1], 'cellFormat typed : expandRefs vaut false par défaut');
        assertDeepEqual(typed.Partenaire_s_convention_reversement, ['r', 'Etablissements', [2, 3]]);
      });
    });

    it("includeColumns : 'shown' et 'normal' masquent manualSort et les colonnes d'aide, 'all' les révèle", async function () {
      installSchema();
      await withNested({}, async ctx => {
        const view = ctx.win().grist.viewApi;
        for (const includeColumns of ['shown', 'normal']) {
          const rec = await view.fetchSelectedRecord(12, { includeColumns });
          assertTrue('Acronyme' in rec, includeColumns);
          assertFalse('manualSort' in rec, `${includeColumns} : manualSort`);
          assertFalse(Object.keys(rec).some(key => key.startsWith('gristHelper_')), `${includeColumns} : colonnes d'aide`);
        }
        const all = await view.fetchSelectedRecord(12, { includeColumns: 'all' });
        assertEqual(all.manualSort, 5);
        assertEqual(all.gristHelper_Display2, 'Programme A');
      });
    });

    it('fetchSelectedTable : toutes les lignes, dans l\'ordre de manualSort, en colonnes ou en lignes', async function () {
      installSchema();
      await withNested({}, async ctx => {
        const columns = await ctx.win().grist.viewApi.fetchSelectedTable({});
        assertDeepEqual(columns.id, [16, 15, 14, 13, 12, 11, 10]);
        assertEqual(columns.Acronyme[0], 'SIGNEX');
        assertEqual(columns.Programme[6], 'Programme A');
        const rows = await ctx.win().grist.fetchSelectedTable({ format: 'rows' });
        assertEqual(rows.length, 7);
        assertEqual(rows[0].Acronyme, 'SIGNEX');
      });
    });

    it('sans métadonnées lisibles, le pont se replie sur les colonnes des données (valeurs brutes) et le consigne', async function () {
      await withNested({}, async ctx => {
        const rec = await ctx.win().grist.viewApi.fetchSelectedRecord(12, {});
        assertEqual(rec.Acronyme, 'CONVENTIX');
        assertEqual(rec.Programme, 1, 'sans type ni colonne d\'affichage : valeur brute');
        assertTrue(ctx.bridge.getLog().some(entry => entry.kind === 'warn' && entry.text.includes('Métadonnées')));
      });
    });

    it('un changement de schéma relance la lecture des métadonnées ; l\'écriture de simples lignes non', async function () {
      installSchema();
      await withNested({}, async ctx => {
        const view = ctx.win().grist.viewApi;
        await view.fetchSelectedRecord(12, {}); // met les métadonnées en cache
        // Le mock n'émule pas la mise à jour de _grist_Tables_column par AddColumn : on la fait à la main (métadonnées d'abord).
        const meta = await window.grist.docApi.fetchTable('_grist_Tables_column');
        const tables = await window.grist.docApi.fetchTable('_grist_Tables');
        const projetsRef = tables.id[tables.tableId.indexOf('Projets')];
        meta.id.push(meta.id.length + 1); meta.parentId.push(projetsRef); meta.colId.push('Nouvelle'); meta.type.push('Text');
        meta.displayCol.push(0); meta.parentPos.push(999);
        window.__mockSetTable('_grist_Tables_column', meta);
        assertFalse('Nouvelle' in await view.fetchSelectedRecord(12, {}), 'métadonnées en cache : la colonne n\'apparaît pas encore');
        await ctx.win().grist.docApi.applyUserActions([['UpdateRecord', 'Projets', 12, { Acronyme: 'CONVENTIX' }]]);
        assertFalse('Nouvelle' in await view.fetchSelectedRecord(12, {}), 'écrire des lignes ne relit pas les métadonnées');
        await ctx.win().grist.docApi.applyUserActions([['AddColumn', 'Projets', 'Nouvelle', {}]]);
        assertTrue('Nouvelle' in await view.fetchSelectedRecord(12, {}), 'AddColumn invalide le cache : la colonne apparaît');
      });
    });

    it('fonctions de ré-encodage : mêmes résultats que grist-core (reencodeAsAny / reencodeAsTypedCellValue)', function () {
      const { reencodeAsAny, reencodeAsTyped, typeInfoFromColType, isHiddenCol } = GristBridge.encoding;
      assertDeepEqual(reencodeAsAny(5, { type: 'Date' }), ['d', 5]);
      assertDeepEqual(reencodeAsAny(5, { type: 'DateTime', timezone: 'UTC' }), ['D', 5, 'UTC']);
      assertDeepEqual(reencodeAsAny(5, { type: 'Ref', tableId: 'T' }), ['R', 'T', 5]);
      assertEqual(reencodeAsAny(5, { type: 'Numeric' }), 5);
      assertDeepEqual(reencodeAsAny(['L', 1, 2], { type: 'RefList', tableId: 'T' }), ['L', 1, 2], 'RefList reste brute avec le format par défaut');
      assertDeepEqual(reencodeAsTyped(['L', 1, 2], { type: 'RefList', tableId: 'T' }), ['r', 'T', [1, 2]]);
      assertDeepEqual(reencodeAsTyped(null, { type: 'RefList', tableId: 'T' }), ['r', 'T', []]);
      assertDeepEqual(reencodeAsTyped(['L', 'a'], { type: 'ChoiceList' }), ['L', 'a']);
      assertDeepEqual(typeInfoFromColType('Ref:Projets'), { type: 'Ref', tableId: 'Projets' });
      assertDeepEqual(typeInfoFromColType('DateTime:Europe/Paris'), { type: 'DateTime', timezone: 'Europe/Paris' });
      assertDeepEqual(typeInfoFromColType('Attachments'), { type: 'RefList', tableId: '_grist_Attachments' });
      assertTrue(isHiddenCol('gristHelper_Display3') && isHiddenCol('manualSort') && !isHiddenCol('Acronyme'));
    });
  });

  describe('Pont Grist — sécurité', function () {
    it('une interface ou une méthode absente de la liste blanche est refusée', async function () {
      await withNested({}, async ctx => {
        const rpc = ctx.win().grist.rpc;
        await assertRejectsCode(rpc.getStub('Evil').doIt(), 'RPC_UNKNOWN_INTERFACE', 'interface inconnue');
        await assertRejectsCode(rpc.getStub('__proto__').doIt(), 'RPC_UNKNOWN_INTERFACE', 'interface __proto__');
        await assertRejectsCode(rpc.getStub('GristDocAPI@grist').deleteEverything(), 'RPC_UNKNOWN_METHOD', 'méthode inconnue');
        await assertRejectsCode(rpc.getStub('GristDocAPI@grist').constructor(), 'RPC_UNKNOWN_METHOD', 'méthode constructor');
        await assertRejectsCode(ctx.win().grist.api.render('x.html', 'fullscreen'), 'RPC_UNKNOWN_INTERFACE', 'API des plugins de Grist (_grist_api)');
        await assertRejectsCode(rpc.getStubForward('autre', 'GristDocAPI').listTables(), 'RPC_UNKNOWN_FORWARD_DEST', 'destination de relais inconnue');
      });
    });

    it("un message qui ne vient pas de l'iframe est ignoré : jamais relayé, jamais répondu, et le client plugin de ce widget le voit", async function () {
      let listCalls = 0;
      const original = window.grist.docApi.listTables;
      window.grist.docApi.listTables = async function () { listCalls++; return original(); };
      const seen = [];
      const previous = window.onmessage;
      window.onmessage = event => seen.push(event.data && event.data.tag);
      try {
        await withNested({}, async () => {
          window.postMessage({ mtype: 1, reqId: 77, iface: 'GristDocAPI', meth: 'listTables', args: [], tag: 'soi-même' }, '*');
          await wait(120);
        });
        assertEqual(listCalls, 0, 'un appel venant d\'une autre fenêtre ne doit jamais atteindre l\'API Grist');
        assertDeepEqual(seen, ['soi-même'], 'les messages des autres fenêtres (dont Grist) continuent d\'aller au client plugin de ce widget');
      } finally {
        window.grist.docApi.listTables = original;
        window.onmessage = previous;
      }
    });

    it("les messages de l'iframe n'atteignent jamais le client plugin de ce widget (window.onmessage)", async function () {
      const seen = [];
      const previous = window.onmessage;
      window.onmessage = event => seen.push(event.source === window ? 'soi-même' : 'autre');
      try {
        await withNested({}, async ctx => {
          await waitFor(() => ctx.nested().normal.length >= 1, 'échanges avec le widget imbriqué');
          await ctx.win().grist.docApi.listTables();
        });
        assertDeepEqual(seen, [], 'sinon le client plugin de ce widget répondrait à Grist avec les reqId du widget imbriqué');
      } finally { window.onmessage = previous; }
    });

    it("les messages d'une origine inattendue sont ignorés, jamais répondus, et signalés", async function () {
      const statuses = [];
      const seen = [];
      const previous = window.onmessage;
      window.onmessage = event => seen.push(event.origin);
      try {
        await withNested({ origin: 'https://autre-origine.example', onStatus: status => statuses.push(status) }, async ctx => {
          await waitFor(() => ctx.bridge.getState().phase === 'rejected', 'origine refusée');
          await wait(150);
          assertEqual(ctx.bridge.getState().rejectedOrigin, location.origin);
          assertFalse(ctx.bridge.getState().ready, 'jamais prêt');
          assertEqual(ctx.nested().normal.length, 0, 'rien n\'est envoyé à une origine non attendue');
          assertEqual(ctx.nested().options.length, 0);
          assertEqual(statuses[statuses.length - 1].phase, 'rejected');
          assertEqual(statuses[statuses.length - 1].origin, location.origin);
          assertEqual(statuses[statuses.length - 1].expected, 'https://autre-origine.example');
        }, { waitReady: false });
        assertDeepEqual(seen, [], 'même refusés, ces messages ne vont pas au client plugin de ce widget');
      } finally { window.onmessage = previous; }
    });

    it("origine '*' : n'exige que la fenêtre de l'iframe (Grist qui sandboxe les widgets, origine \"null\")", async function () {
      await withNested({ origin: '*' }, async ctx => {
        await waitFor(() => ctx.nested().normal.length >= 1, 'onRecord');
        assertEqual(ctx.nested().normal[0].record.id, 12);
      });
    });

    it('detach() : le pont ne répond plus et libère l\'iframe', async function () {
      await withNested({}, async ctx => {
        assertTrue(ctx.frame.__gristBridge === ctx.bridge);
        ctx.bridge.detach();
        assertEqual(ctx.frame.__gristBridge, undefined);
        const outcome = await Promise.race([
          ctx.win().grist.docApi.listTables().then(() => 'répondu', () => 'erreur'),
          wait(300).then(() => 'silence')
        ]);
        assertEqual(outcome, 'silence');
      });
    });

    it('attacher un second pont à la même iframe remplace le premier (pas de double réponse)', async function () {
      await withNested({}, async ctx => {
        const first = ctx.bridge;
        const second = GristBridge.attach(ctx.frame, { origin: location.origin, tableId: 'Projets', rowId: 11, optionsKey: OPTIONS_KEY });
        assertTrue(ctx.frame.__gristBridge === second);
        let calls = 0;
        const original = window.grist.docApi.listTables;
        window.grist.docApi.listTables = async function () { calls++; return original(); };
        try { await ctx.win().grist.docApi.listTables(); await wait(100); } finally { window.grist.docApi.listTables = original; }
        assertEqual(calls, 1, 'un seul pont répond (le premier a été détaché)');
        assertEqual(first.getState().rowId, 12, 'le premier pont garde son état mais n\'écoute plus');
        second.detach();
      });
    });

    it('attach() refuse une entrée invalide (pas d\'origine par défaut : on ne fait pas confiance à tout le monde)', function () {
      const frame = document.createElement('iframe');
      let error = '';
      try { GristBridge.attach(frame, {}); } catch (err) { error = err.message; }
      assertIncludes(error, 'origin');
      error = '';
      try { GristBridge.attach(document.createElement('div'), { origin: location.origin }); } catch (err) { error = err.message; }
      assertIncludes(error, 'iframe');
    });

    it("le journal du pont ne contient jamais le contenu des lignes (données personnelles)", async function () {
      installSchema();
      await withNested({}, async ctx => {
        await waitFor(() => ctx.nested().normal.length >= 1, 'onRecord');
        await ctx.win().grist.docApi.applyUserActions([['UpdateRecord', 'Projets', 12, { Description_rapide_projet: 'SECRET-À-NE-PAS-LOGGER' }]]);
        const journal = ctx.bridge.getLog().map(entry => entry.text).join('\n');
        assertIncludes(journal, 'UpdateRecord Projets');
        assertFalse(journal.includes('SECRET-À-NE-PAS-LOGGER'), 'valeurs écrites');
        assertFalse(journal.includes('CONVENTIX'), 'valeurs lues');
      });
    });
  });
})();
