/**
 * Non-regression suite : graphiques Grist-BI du Dashboard — 24/11/2026.
 *  - core/virtual-doc.js : le document en mémoire que Grist-BI croit être son document Grist (il ne voit jamais le vrai) ;
 *  - DashboardLogic.biRows : la table plate Dashboard_Financier, avec les filtres de la page ;
 *  - pages/dashboard-bi.js : iframe + pont + document virtuel, avec un faux Grist-BI (tests/fake-grist-bi.html) qui charge le VRAI client
 *    grist-plugin-api et rejoue le démarrage du vrai Grist-BI ;
 *  - page-dashboard.js : moteur Grist-BI ou graphiques faits main, repli quand Grist-BI ne répond pas, préférence par utilisateur.
 * Le vrai Grist-BI (copie locale) a aussi été essayé à la main dans la même configuration : quatre tuiles affichées, voir docs/grist_usage.md.
 */
(function () {
  'use strict';

  const L = () => window.DashboardLogic;
  const V = () => window.VirtualDoc;
  const FAKE = () => `${location.origin}/tests/fake-grist-bi.html`;
  const money = '{"numMode":"currency","currency":"EUR","decimals":0}';
  const COLS = [{ id: 'Programme', type: 'Text' }, { id: 'Montant', type: 'Numeric', widgetOptions: money }, { id: 'Annee', type: 'Text' }];
  const settle = () => wait(10);
  async function rejects(promise, pattern, label) {
    try { await promise; } catch (err) { assertTrue(pattern.test(err.message), `${label} : message « ${err.message} »`); return; }
    throw new Error(`${label} : un refus était attendu`);
  }
  const newDoc = (options) => {
    const doc = V().create(options);
    doc.setReadOnlyTable('Dashboard_Financier', COLS, [{ Programme: 'P1', Montant: 100, Annee: '2025' }, { Programme: 'P2', Montant: 50, Annee: '2026' }]);
    return doc;
  };

  // ===========================================================================================================
  describe('Document virtuel de Grist-BI : ce que le widget imbriqué peut voir et faire', function () {
    it('listTables : la table de données d\'abord, puis les tables internes ; jamais les tables système', async function () {
      const doc = newDoc();
      doc.ensureTable('BI_Dashboard_Config', [{ id: 'TableId', type: 'Text' }], []);
      assertDeepEqual(await doc.docApi.listTables(), ['Dashboard_Financier', 'BI_Dashboard_Config']);
    });

    it('fetchTable rend des colonnes comme Grist (id, manualSort) et une copie : la modifier ne change rien', async function () {
      const doc = newDoc();
      const table = await doc.docApi.fetchTable('Dashboard_Financier');
      assertDeepEqual(table.id, [1, 2]);
      assertDeepEqual(table.Programme, ['P1', 'P2']);
      assertDeepEqual(table.manualSort, [1, 2]);
      table.Programme[0] = 'ALTÉRÉ';
      assertEqual((await doc.docApi.fetchTable('Dashboard_Financier')).Programme[0], 'P1');
      await rejects(doc.docApi.fetchTable('Projets'), /introuvable/, 'une table du vrai document n\'existe pas ici');
    });

    it('les tables système donnent à Grist-BI le type et le format des colonnes, et les réglages du document', async function () {
      const doc = newDoc({ docSettings: { locale: 'fr-FR', currency: 'EUR' } });
      const tables = await doc.docApi.fetchTable('_grist_Tables');
      const cols = await doc.docApi.fetchTable('_grist_Tables_column');
      const parent = tables.id[tables.tableId.indexOf('Dashboard_Financier')];
      const mine = cols.id.map((id, i) => i).filter(i => cols.parentId[i] === parent);
      assertDeepEqual(mine.map(i => cols.colId[i]), ['Programme', 'Montant', 'Annee', 'manualSort']);
      assertEqual(cols.type[mine[1]], 'Numeric');
      assertEqual(cols.widgetOptions[mine[1]], money);
      assertEqual(JSON.parse((await doc.docApi.fetchTable('_grist_DocInfo')).documentSettings[0]).locale, 'fr-FR');
      assertDeepEqual((await doc.docApi.fetchTable('_grist_Pages')).id, [], 'aucune page : rien à ranger');
      assertDeepEqual(await doc.docApi.fetchTable('_grist_Autre'), { id: [] });
    });

    it('la table de données est en lecture seule : toute écriture est refusée, et rien n\'est modifié', async function () {
      const doc = newDoc();
      for (const action of [['AddRecord', 'Dashboard_Financier', null, { Programme: 'X' }], ['UpdateRecord', 'Dashboard_Financier', 1, { Programme: 'X' }],
        ['RemoveRecord', 'Dashboard_Financier', 1], ['AddColumn', 'Dashboard_Financier', 'Autre', { type: 'Text' }], ['BulkUpdateRecord', 'Dashboard_Financier', [1], { Programme: ['X'] }]]) {
        await rejects(doc.docApi.applyUserActions([action]), /lecture seule/, action[0]);
      }
      assertDeepEqual((await doc.docApi.fetchTable('Dashboard_Financier')).Programme, ['P1', 'P2']);
    });

    it('seules les tables BI_* se créent ; un nom pris reçoit un numéro (comme Grist) ; une action inconnue échoue franchement', async function () {
      const doc = newDoc();
      await rejects(doc.docApi.applyUserActions([['AddTable', 'Donnees_importees', [{ id: 'A', type: 'Text' }]]]), /BI_\* peuvent être créées/, 'table de données refusée');
      const first = await doc.docApi.applyUserActions([['AddTable', 'BI_Dashboard_Comments', [{ id: 'Text', type: 'Text' }]]]);
      assertEqual(first.retValues[0].table_id, 'BI_Dashboard_Comments');
      assertDeepEqual(first.retValues[0].columns, ['Text']);
      const second = await doc.docApi.applyUserActions([['AddTable', 'BI_Dashboard_Comments', [{ id: 'Text', type: 'Text' }]]]);
      assertEqual(second.retValues[0].table_id, 'BI_Dashboard_Comments2', 'jamais d\'écrasement de la table existante');
      await rejects(doc.docApi.applyUserActions([['RemoveTable', 'BI_Dashboard_Comments']]), /non prise en charge/, 'action inconnue');
      await rejects(doc.docApi.applyUserActions([['AddTable', 'BI_Piege', [{ id: '__proto__', type: 'Text' }]]]), /refusé/, 'nom de colonne dangereux');
      await rejects(doc.docApi.getAccessToken(), /indisponible/, 'jamais de jeton d\'accès au vrai document');
    });

    it('lignes d\'une table BI_* : valeurs par défaut du type, AddRecord rend l\'id, mises à jour, suppressions, formule déclenchée user.Email', async function () {
      const doc = newDoc({ userEmail: () => 'moi@exemple.fr' });
      await doc.docApi.applyUserActions([['AddTable', 'BI_Dashboard_UserProbe', [
        { id: 'Texte', type: 'Text' }, { id: 'Nombre', type: 'Numeric' }, { id: 'Vrai', type: 'Bool' }, { id: 'Quand', type: 'DateTime' },
        { id: 'Email', type: 'Text', isFormula: false, formula: 'user.Email' }]]]);
      const added = await doc.docApi.applyUserActions([['AddRecord', 'BI_Dashboard_UserProbe', null, { Texte: 'a' }], ['AddRecord', 'BI_Dashboard_UserProbe', null, {}]]);
      assertDeepEqual(added.retValues, [1, 2]);
      let table = await doc.docApi.fetchTable('BI_Dashboard_UserProbe');
      assertDeepEqual(table.Nombre, [0, 0]);
      assertDeepEqual(table.Vrai, [false, false]);
      assertDeepEqual(table.Quand, [null, null]);
      assertDeepEqual(table.Email, ['moi@exemple.fr', 'moi@exemple.fr'], 'la formule déclenchée remplit l\'adresse de la personne');
      await doc.docApi.applyUserActions([['UpdateRecord', 'BI_Dashboard_UserProbe', 1, { Texte: 'b' }], ['BulkUpdateRecord', 'BI_Dashboard_UserProbe', [1, 2], { Nombre: [5, 6] }]]);
      table = await doc.docApi.fetchTable('BI_Dashboard_UserProbe');
      assertDeepEqual(table.Texte, ['b', '']);
      assertDeepEqual(table.Nombre, [5, 6]);
      await doc.docApi.applyUserActions([['RemoveRecord', 'BI_Dashboard_UserProbe', 1]]);
      assertDeepEqual((await doc.docApi.fetchTable('BI_Dashboard_UserProbe')).id, [2]);
      const next = await doc.docApi.applyUserActions([['AddRecord', 'BI_Dashboard_UserProbe', null, {}]]);
      assertEqual(next.retValues[0], 3, 'un identifiant supprimé n\'est pas réattribué');
      await rejects(doc.docApi.applyUserActions([['UpdateRecord', 'BI_Dashboard_UserProbe', 2, { Inconnue: 1 }]]), /inconnue/, 'colonne inconnue');
      const column = await doc.docApi.applyUserActions([['AddColumn', 'BI_Dashboard_UserProbe', 'Texte', { type: 'Text' }]]);
      assertEqual(column.retValues[0].colId, 'Texte2', 'colonne déjà prise : numérotée');
      assertDeepEqual((await doc.docApi.fetchTable('BI_Dashboard_UserProbe')).Texte2, ['', ''], 'une ligne par ligne existante, valeur par défaut');
    });

    it('les écritures dans les tables système sont acceptées et ignorées (Grist-BI y range ses pages)', async function () {
      const doc = newDoc();
      const result = await doc.docApi.applyUserActions([['BulkUpdateRecord', '_grist_Pages', [1], { pagePos: [3] }]]);
      assertDeepEqual(result.retValues, [null]);
    });

    it('l\'état des tables BI_* se restaure à l\'identique (lignes, colonnes, références, prochain id) ; un état illisible est ignoré', async function () {
      const states = [];
      const doc = newDoc({ onChange: state => states.push(state) });
      doc.ensureTable('BI_Dashboard_Config', [{ id: 'TableId', type: 'Text' }, { id: 'ConfigJSON', type: 'Text' }], [{ TableId: 'Dashboard_Financier', ConfigJSON: '{"a":1}' }]);
      await doc.docApi.applyUserActions([['AddRecord', 'BI_Dashboard_Config', null, { TableId: 'T2' }], ['RemoveRecord', 'BI_Dashboard_Config', 2]]);
      await settle();
      const saved = JSON.parse(JSON.stringify(states[states.length - 1]));
      const copy = newDoc();
      assertTrue(copy.importState(saved));
      assertDeepEqual(await copy.docApi.listTables(), ['Dashboard_Financier', 'BI_Dashboard_Config']);
      assertDeepEqual((await copy.docApi.fetchTable('BI_Dashboard_Config')).ConfigJSON, ['{"a":1}']);
      const added = await copy.docApi.applyUserActions([['AddRecord', 'BI_Dashboard_Config', null, {}]]);
      assertEqual(added.retValues[0], 3, 'le prochain identifiant continue après celui qui a été supprimé');
      assertEqual(copy.importState({ v: 99, tables: {} }), false, 'version inconnue');
      assertEqual(copy.importState({ v: 1, tables: { Piege: { columns: [], data: { id: [] } } } }), false, 'table hors BI_*');
      assertEqual(copy.importState({ v: 1, tables: { BI_X: { columns: [{ id: '__proto__', type: 'Text' }], data: { id: [] } } } }), false, 'colonne dangereuse');
      assertDeepEqual(await copy.docApi.listTables(), ['Dashboard_Financier', 'BI_Dashboard_Config'], 'un état refusé ne change rien');
    });

    it('onChange : une seule notification par rafale de changements, aucune quand seule la table de données change', async function () {
      const states = [];
      const doc = newDoc({ onChange: state => states.push(state) });
      doc.setReadOnlyTable('Dashboard_Financier', COLS, [{ Programme: 'P9', Montant: 1, Annee: '2025' }]);
      await settle();
      assertEqual(states.length, 0, 'la table de données n\'est jamais enregistrée');
      await doc.docApi.applyUserActions([['AddTable', 'BI_A', [{ id: 'X', type: 'Text' }]], ['AddRecord', 'BI_A', null, { X: '1' }], ['AddRecord', 'BI_A', null, { X: '2' }]]);
      await settle();
      assertEqual(states.length, 1);
      assertDeepEqual(Object.keys(states[0].tables), ['BI_A']);
      assertDeepEqual(states[0].tables.BI_A.data.X, ['1', '2']);
      assertTrue(!('Dashboard_Financier' in states[0].tables), 'aucune donnée du vrai document dans ce qui est enregistré');
    });
  });

  // ===========================================================================================================
  describe('Table plate Dashboard_Financier (DashboardLogic.biRows)', function () {
    const PROGRAMMES = [{ id: 1, Programme: 'P1' }, { id: 2, Programme: 'P2' }];
    const LIGNES = [{ id: 1, N_OPE: 'A-1', totalCPConsomme: 300 }, { id: 2, N_OPE: 'B-1', totalCPConsomme: 200 }];
    const PROJETS = [
      { id: 1, Acronyme: 'ALPHA', Projet: 'ALPHA', Programme: 1, Statut_operationnel_projet: 'en cours', Ligne_OPE: ['L', 1], c2026_M10_Fonctionnement: 1000 },
      { id: 2, Acronyme: 'BETA', Projet: 'BETA', Programme: 2, Statut_operationnel_projet: '', Ligne_OPE: ['L', 2], c2025_M10_Fonctionnement: 500, c2026_M10_Fonctionnement: 100 }
    ];
    const DEPENSES = [{ id: 1, Exercice: 2025, Code_operation: 'B-1', CP_consomme: 150, AE_consomme: 150 }];
    const dataset = () => L().buildDataset({ projets: PROJETS, programmes: PROGRAMMES, lignes: LIGNES, depenses: DEPENSES });
    const rowsFor = state => L().biRows(L().compute(dataset(), state || {}));

    it('une ligne « Attribué » et une ligne « Consommé » par projet et par année (Sans année comprise), les Attribué d\'abord', function () {
      const rows = rowsFor();
      assertEqual(rows.length, 10, '5 couples projet-année non vides × 2 mesures');
      assertDeepEqual(rows.slice(0, 5).map(row => row.Mesure), ['Attribué', 'Attribué', 'Attribué', 'Attribué', 'Attribué']);
      assertDeepEqual(rows.slice(5).map(row => row.Mesure), ['Consommé', 'Consommé', 'Consommé', 'Consommé', 'Consommé']);
      const beta2025 = rows.filter(row => row.Projet === 'BETA' && row.Annee === '2025');
      assertDeepEqual(beta2025.map(row => [row.Mesure, row.Montant, row.Attribue, row.Consomme, row.Reste]), [['Attribué', 500, 500, 0, 350], ['Consommé', 150, 0, 150, 0]]);
      const sans = rows.filter(row => row.Annee === 'Sans année' && row.Mesure === 'Consommé');
      assertDeepEqual(sans.map(row => [row.Projet, row.Montant]), [['ALPHA', 300], ['BETA', 50]], 'le reliquat des lignes OPE non détaillé');
      assertEqual(rows.find(row => row.Projet === 'BETA').Statut, 'Sans statut');
      assertEqual(rows.find(row => row.Projet === 'ALPHA').Programme, 'P1');
    });

    it('Reste est signé et s\'additionne : sa somme est le reste du total (attribué − consommé)', function () {
      const rows = rowsFor();
      const sum = key => rows.reduce((total, row) => total + row[key], 0);
      assertEqual(sum('Attribue'), 1600);
      assertEqual(sum('Consomme'), 500);
      assertEqual(sum('Reste'), 1100);
      assertEqual(rows.filter(row => row.Mesure === 'Attribué' && row.Reste < 0).length, 2, 'Sans année : consommé sans attribué = reste négatif');
    });

    it('suit les filtres de la page : années, programmes, statuts, mesure AE', function () {
      assertDeepEqual(Array.from(new Set(rowsFor({ years: [2025] }).map(row => row.Annee))), ['2025']);
      assertDeepEqual(Array.from(new Set(rowsFor({ programmes: ['P1'] }).map(row => row.Projet))), ['ALPHA']);
      assertDeepEqual(Array.from(new Set(rowsFor({ statuts: ['en cours'] }).map(row => row.Projet))), ['ALPHA']);
      const ae = rowsFor({ measure: 'AE' }).filter(row => row.Mesure === 'Consommé' && row.Projet === 'BETA');
      assertEqual(ae.find(row => row.Annee === '2025').Montant, 150);
      assertEqual(L().biRows({ rows: [] }).length, 0);
      assertEqual(L().biRows(null).length, 0);
    });

    it('les colonnes annoncées à Grist-BI sont celles des lignes ; les montants ont un format monétaire', function () {
      const ids = L().BI_COLUMNS.map(col => col.id);
      assertDeepEqual(Object.keys(rowsFor()[0]).sort(), ids.slice().sort());
      assertEqual(L().BI_COLUMNS.find(col => col.id === 'Reste').widgetOptions, money);
      assertEqual(L().BI_TABLE, 'Dashboard_Financier');
    });
  });

  // ===========================================================================================================
  describe('Grist-BI dans une iframe du Dashboard (pont + document virtuel)', function () {
    const ROWS = [
      { Programme: 'P1', Projet: 'ALPHA', Statut: 'en cours', Annee: '2026', Mesure: 'Attribué', Montant: 1000, Attribue: 1000, Consomme: 0, Reste: 700 },
      { Programme: 'P1', Projet: 'ALPHA', Statut: 'en cours', Annee: '2026', Mesure: 'Consommé', Montant: 300, Attribue: 0, Consomme: 300, Reste: 0 }
    ];
    const optionsKeys = () => Object.keys(window.__mockWidgetOptions() || {});

    async function withBi(search, fn, options) {
      window.__mockSetWidgetOptions(options && options.stored ? options.stored : null);
      const before = window.location.search;
      history.replaceState(null, '', `${location.pathname}${search}`);
      const host = document.createElement('div');
      document.body.appendChild(host);
      const statuses = [];
      let ctl = null;
      try {
        ctl = await DashboardBi.mount(host, Object.assign({ rows: ROWS, onStatus: status => statuses.push(status), readyTimeoutMs: 6000 }, options && options.mount));
        const nested = () => ctl.frame.contentWindow.__BI__;
        await fn({ ctl, host, statuses, nested });
      } finally {
        if (ctl) ctl.destroy();
        host.remove();
        history.replaceState(null, '', `${location.pathname}${before}`);
        window.__mockSetWidgetOptions(null);
      }
    }
    const url = silent => `?gristbi=${encodeURIComponent(FAKE() + (silent ? '?silent=1' : ''))}`; // ?silent=1 se lit dans l'adresse du faux Grist-BI
    const ready = async ctx => { await waitFor(() => ctx.nested() && ctx.nested().ready, 'Grist-BI prêt', 8000); };

    it('Grist-BI voit la table plate, ses colonnes typées et sa configuration d\'origine (quatre tuiles) ; rien d\'autre', async function () {
      await withBi(url(), async ctx => {
        await ready(ctx);
        const bi = ctx.nested();
        assertEqual(ctx.ctl.getStatus().phase, 'ready');
        assertEqual(bi.table, 'Dashboard_Financier', 'la première table qui n\'est pas interne');
        assertDeepEqual(bi.rows.Projet, ['ALPHA', 'ALPHA']);
        assertDeepEqual(bi.columns.map(col => col.colId), L().BI_COLUMNS.map(col => col.id).concat('manualSort'));
        assertEqual(bi.columns.find(col => col.colId === 'Montant').widgetOptions, money);
        assertEqual(JSON.parse(bi.docSettings).currency, 'EUR');
        const config = JSON.parse(bi.config.ConfigJSON[0]);
        assertEqual(bi.config.TableId[0], 'Dashboard_Financier');
        assertDeepEqual(config.pages[0].tiles.map(tile => tile.id), ['p_annee', 'p_prog', 'p_reste', 'p_tree']);
        assertDeepEqual(config.pages[0].tiles.map(tile => tile.measure), ['Montant', 'Montant', 'Reste', 'Reste']);
        const real = await bi.tryFetch('Projets');
        assertEqual(real.ok, false, 'les tables du vrai document sont invisibles pour Grist-BI');
      });
    });

    it('Grist-BI ne crée rien dans le vrai document : ses tables internes vivent dans le document virtuel, enregistrées dans les options du widget', async function () {
      const writes = () => window.__TEST_CALLS__.filter(call => /AddTable|AddRecord|UpdateRecord|AddColumn/.test(call.type));
      window.__TEST_CALLS__.length = 0;
      await withBi(url(), async ctx => {
        await ready(ctx);
        assertTrue(ctx.nested().comments && ctx.nested().comments.retValues[0].table_id === 'BI_Dashboard_Comments', 'table de commentaires créée');
        assertDeepEqual(await ctx.ctl.doc.docApi.listTables(), ['Dashboard_Financier', 'BI_Dashboard_Config', 'BI_Dashboard_Comments']);
        await wait(1100); // enregistrement différé (800 ms)
        assertTrue(optionsKeys().includes('dashboardBiDoc'), 'état enregistré dans les options du widget');
        const saved = window.__mockWidgetOptions().dashboardBiDoc;
        assertDeepEqual(Object.keys(saved.tables).sort(), ['BI_Dashboard_Comments', 'BI_Dashboard_Config']);
        assertTrue(!JSON.stringify(saved).includes('ALPHA'), 'aucune donnée du Dashboard dans ce qui est enregistré');
        assertEqual(writes().length, 0, 'aucune écriture dans le vrai document');
      });
    });

    it('une configuration modifiée dans Grist-BI est enregistrée puis retrouvée à la prochaine ouverture ; « Rétablir » remet les quatre graphiques', async function () {
      let stored = null;
      await withBi(url(), async ctx => {
        await ready(ctx);
        await ctx.nested().saveConfig('{"pages":[{"id":"page_default","name":"Page 1","tiles":[]}],"currentPageId":"page_default"}');
        await wait(1100);
        stored = JSON.parse(JSON.stringify(window.__mockWidgetOptions()));
        assertTrue(stored.dashboardBiDoc.tables.BI_Dashboard_Config.data.ConfigJSON[0].includes('"tiles":[]'));
      });
      await withBi(url(), async ctx => {
        await ready(ctx);
        assertEqual(JSON.parse(ctx.nested().config.ConfigJSON[0]).pages[0].tiles.length, 0, 'la configuration modifiée est retrouvée');
        await ctx.ctl.resetPreset();
        await waitFor(() => ctx.nested() && ctx.nested().ready && ctx.nested().config && JSON.parse(ctx.nested().config.ConfigJSON[0]).pages[0].tiles.length === 4, 'rechargé après le rétablissement', 8000);
      }, { stored });
    });

    it('update(rows) : même table = rien ; table différente = Grist-BI est rechargé et relit la nouvelle table', async function () {
      await withBi(url(), async ctx => {
        await ready(ctx);
        assertEqual(ctx.ctl.update(ROWS.slice()), false, 'mêmes lignes : pas de rechargement');
        assertEqual(ctx.ctl.update(ROWS.slice(0, 1)), true);
        await waitFor(() => ctx.nested() && ctx.nested().ready && ctx.nested().rows.id.length === 1, 'nouvelle table lue (page rechargée)', 8000);
        assertEqual(ctx.nested().rows.Montant[0], 1000);
      });
    });

    it('le pont reste étanche : une écriture dans la table de données, un jeton d\'accès, une table de données à créer sont refusés', async function () {
      await withBi(url(), async ctx => {
        await ready(ctx);
        const bi = ctx.nested();
        assertEqual((await bi.tryActions([['AddRecord', 'Dashboard_Financier', null, { Programme: 'X' }]])).ok, false);
        assertEqual((await bi.tryActions([['AddTable', 'Import_CSV', [{ id: 'A', type: 'Text' }]]])).ok, false);
        assertEqual((await bi.tryToken()).ok, false, 'aucun jeton d\'accès au vrai document');
        assertEqual((await bi.tryFetch('Dashboard_Financier')).ok, true);
        const log = ctx.ctl.getLog().map(entry => `${entry.kind} ${entry.text}`);
        assertTrue(log.some(line => line.startsWith('error') && /lecture seule/.test(line)), 'le refus est journalisé');
        assertEqual(JSON.stringify(window.__TEST_CALLS__.filter(call => call.table === 'Dashboard_Financier')), '[]', 'rien n\'est arrivé au vrai document');
      });
    });

    it('sans réponse de Grist-BI dans le délai : état « failed » (la page revient aux graphiques faits main)', async function () {
      await withBi(url(true), async ctx => {
        await waitFor(() => ctx.statuses.some(status => status.phase === 'failed'), 'échec signalé', 4000);
        assertEqual(ctx.statuses.find(status => status.phase === 'failed').reason, 'timeout');
      }, { mount: { readyTimeoutMs: 600 } });
    });

    it('?gristbi= n\'accepte que http(s) ; ?bridgeOrigin=* se limite à vérifier la fenêtre', function () {
      assertEqual(DashboardBi.resolveTarget('?gristbi=javascript:alert(1)').url, DashboardBi.GRIST_BI_URL);
      assertEqual(DashboardBi.resolveTarget('?gristbi=data:text/html,x').url, DashboardBi.GRIST_BI_URL);
      assertEqual(DashboardBi.resolveTarget('?gristbi=http://exemple.fr/x').url, DashboardBi.GRIST_BI_URL, 'http hors machine locale refusé');
      assertEqual(DashboardBi.resolveTarget('').origin, 'https://lombre33.github.io');
      assertEqual(DashboardBi.resolveTarget('?bridgeOrigin=*').origin, '*');
      assertEqual(DashboardBi.resolveTarget('?gristbi=http://localhost:9/x').origin, 'http://localhost:9');
    });
  });

  // ===========================================================================================================
  describe('Dashboard — page : Grist-BI par défaut, graphiques simples en repli', function () {
    const P = () => window.DashboardPage;
    const byId = id => document.getElementById(id);
    const view = () => byId('view-dashboard');
    const frame = () => byId('db-charts').querySelector('.db-bi-frame');
    const PROGRAMMES = [{ id: 1, Programme: 'P1' }, { id: 2, Programme: 'P2' }];
    const LIGNES = [{ id: 1, N_OPE: 'A-1', totalCPConsomme: 300 }, { id: 2, N_OPE: 'B-1', totalCPConsomme: 200 }];
    const PROJETS = [
      { id: 1, Acronyme: 'ALPHA', Projet: 'ALPHA', Programme: 1, Statut_operationnel_projet: 'en cours', Ligne_OPE: ['L', 1], c2026_M10_Fonctionnement: 1000 },
      { id: 2, Acronyme: 'BETA', Projet: 'BETA', Programme: 2, Statut_operationnel_projet: 'en cours', Ligne_OPE: ['L', 2], c2025_M10_Fonctionnement: 500 }
    ];
    const columnar = rows => {
      const keys = Array.from(new Set(rows.flatMap(row => Object.keys(row)).filter(key => key !== 'id')));
      const out = { id: rows.map(row => row.id) };
      keys.forEach(key => { out[key] = rows.map(row => (row[key] === undefined ? null : row[key])); });
      return out;
    };
    const previous = { search: '', timeout: 0 };

    async function load(silent) {
      previous.search = location.search;
      previous.timeout = DashboardBi.config.readyTimeoutMs;
      history.replaceState(null, '', `${location.pathname}?gristbi=${encodeURIComponent(FAKE() + (silent ? '?silent=1' : ''))}`);
      window.__mockSetWidgetOptions(null);
      window.__mockSetTable('Projets', columnar(PROJETS));
      window.__mockSetTable('Programmes', columnar(PROGRAMMES));
      window.__mockSetTable('Lignes_OPE', columnar(LIGNES));
      window.__mockSetTable('Depenses_OPE', columnar([{ id: 1, Exercice: 2025, Code_operation: 'B-1', CP_consomme: 150, AE_consomme: 150 }]));
      window.__mockSetTable('_grist_Tables', { id: [1], tableId: ['Projets'] });
      window.__mockSetTable('_grist_Tables_column', { id: [1], parentId: [1], colId: ['Statut_operationnel_projet'], type: ['Choice'], widgetOptions: [JSON.stringify({ choices: ['en cours'] })], description: [''] });
      await window.CoreGrist.loadColumnDescriptions();
      const tables = await window.CoreGrist.loadAllTables();
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      P().resetState(); P().resetPrefsRow();
      view().classList.remove('hidden');
      window.renderDashboard();
      await waitFor(() => P().state.expensesState === 'ready', 'dépenses lues');
    }
    function unload() {
      view().classList.add('hidden');
      P().resetState(); P().resetPrefsRow();
      DashboardBi.config.readyTimeoutMs = previous.timeout;
      history.replaceState(null, '', `${location.pathname}${previous.search}`);
      window.__mockSetWidgetOptions(null);
    }
    const openCharts = () => { if (byId('db-charts').hidden) fireMouse(byId('db-toggle-charts'), 'click'); };
    const nested = () => frame() && frame().contentWindow && frame().contentWindow.__BI__;
    const nestedReady = () => waitFor(() => nested() && nested().ready, 'Grist-BI prêt', 8000);

    it('les graphiques ouverts montent Grist-BI (l\'iframe remplace les graphiques faits main) ; il lit les lignes de la page', async function () {
      await load();
      assertEqual(P().state.engine, 'bi', 'Grist-BI par défaut');
      openCharts();
      await waitFor(() => !!frame(), 'iframe présente');
      assertEqual(byId('db-charts').querySelector('.db-charts-grid'), null, 'pas de graphiques faits main en même temps');
      await nestedReady();
      assertEqual(nested().table, 'Dashboard_Financier');
      assertEqual(nested().rows.Projet.filter(name => name === 'ALPHA').length, 4, 'ALPHA : 2026 et Sans année, une ligne Attribué et une ligne Consommé chacun');
      assertEqual(byId('db-engine').hidden, false);
      assertEqual(byId('db-engine').textContent, 'Graphiques simples');
      assertEqual(byId('db-bi-reset').hidden, false);
      unload();
    });

    it('un filtre de la page recalcule la table : la même iframe est rechargée, jamais recréée par le rendu de la page', async function () {
      await load();
      openCharts();
      await nestedReady();
      const first = frame();
      assertEqual(nested().rows.Programme.includes('P2'), true);
      P().state.programmes = ['P1'];
      window.renderDashboard();
      assertEqual(frame(), first, 'le rendu de la page ne détruit pas l\'iframe');
      await waitFor(() => nested() && nested().ready && !nested().rows.Programme.includes('P2'), 'table filtrée relue', 8000);
      assertTrue(nested().rows.Programme.includes('P1'));
      unload();
    });

    it('« Graphiques simples » revient aux graphiques faits main (iframe retirée) et le choix est enregistré par personne ; le bouton ramène Grist-BI', async function () {
      await load();
      await window.loadKanbanUserPreferences();
      await window.loadDashboardUserPreferences();
      openCharts();
      await nestedReady();
      window.__TEST_CALLS__.length = 0;
      fireMouse(byId('db-engine'), 'click');
      assertEqual(P().state.engine, 'maison');
      assertEqual(frame(), null, 'iframe retirée');
      assertTrue(!!byId('db-charts').querySelector('.db-charts-grid'), 'graphiques faits main');
      assertEqual(byId('db-engine').textContent, 'Grist-BI');
      assertEqual(byId('db-bi-reset').hidden, true, 'rien à rétablir hors Grist-BI');
      await P().savePreferences();
      const update = window.__TEST_CALLS__.filter(call => call.type === 'UpdateRecord' && call.table === 'Preferences_Widget').slice(-1)[0];
      assertEqual(update.fields.Dash_moteur, 'maison');
      fireMouse(byId('db-engine'), 'click');
      assertEqual(P().state.engine, 'bi');
      await waitFor(() => !!frame(), 'iframe remontée');
      await nestedReady();
      await P().savePreferences();
      assertEqual(window.__TEST_CALLS__.filter(call => call.type === 'UpdateRecord' && call.table === 'Preferences_Widget').slice(-1)[0].fields.Dash_moteur, '', 'Grist-BI est le défaut : rien d\'écrit');
      unload();
    });

    it('les préférences enregistrées « maison » sont réappliquées ; toute autre valeur donne Grist-BI', async function () {
      await load();
      await window.loadKanbanUserPreferences();
      const store = value => {
        window.__mockSetTable('Preferences_Widget', { id: [1], Email_utilisateur: [''], Dash_annees: [''], Dash_programmes: [''], Dash_statuts: [''], Dash_recherche: [''], Dash_mesure: ['CP'], Dash_graphiques: ['1'], Dash_moteur: [value] });
        try { localStorage.setItem('suiviProjetInnovationS:prefsRowId', '1'); } catch (err) { /* ignore */ }
        P().resetState(); P().resetPrefsRow();
        return window.loadDashboardUserPreferences();
      };
      await store('maison');
      assertEqual(P().state.engine, 'maison');
      await store('quelque chose');
      assertEqual(P().state.engine, 'bi');
      unload();
    });

    it('replier les graphiques retire l\'iframe ; les rouvrir la remonte', async function () {
      await load();
      openCharts();
      await nestedReady();
      fireMouse(byId('db-toggle-charts'), 'click');
      assertEqual(byId('db-charts').hidden, true);
      assertEqual(document.querySelector('#db-charts iframe'), null);
      assertEqual(byId('db-engine').hidden, true, 'le bouton n\'apparaît que graphiques ouverts');
      fireMouse(byId('db-toggle-charts'), 'click');
      await waitFor(() => !!frame(), 'iframe remontée');
      unload();
    });

    it('Grist-BI qui ne répond pas : retour aux graphiques faits main avec un message, puis « Réessayer »', async function () {
      await load(true);
      DashboardBi.config.readyTimeoutMs = 500;
      openCharts();
      await waitFor(() => byId('db-charts').querySelector('.db-bi-note'), 'message de repli', 6000);
      assertTrue(/n'a pas répondu/.test(byId('db-charts').querySelector('.db-bi-note').textContent));
      assertEqual(frame(), null, 'l\'iframe qui ne répond pas est retirée');
      assertTrue(!!byId('db-charts').querySelector('.db-charts-grid'), 'les graphiques faits main prennent le relais');
      fireMouse(byId('db-charts').querySelector('[data-db-bi-retry]'), 'click');
      await waitFor(() => !!frame(), 'nouvel essai : Grist-BI est remonté');
      assertEqual(byId('db-charts').querySelector('.db-bi-note'), null);
      unload();
    });
  });
})();
