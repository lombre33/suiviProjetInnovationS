/**
 * Non-regression suite : compléments du pont Grist (js/core/grist-bridge.js), utilisé par la page Rédaction
 * (publipostage+) et par la page Instances (GFS). Couvre ce que suite-bridge.js laissait de côté : les refus d'arguments
 * invalides, les erreurs de l'API Grist, les rappels (écriture, journal, sélection, curseur) qui échouent sans casser le
 * pont, le délai d'attente d'un widget imbriqué muet et ses options de départ illisibles.
 *
 * Même faux publipostage+ (tests/fake-publipostage.html) que suite-bridge.js : il charge le vrai client grist-plugin-api.
 */
(function () {
  'use strict';

  const NESTED_URL = 'fake-publipostage.html';
  const OPTIONS_KEY = 'publipostage';

  async function assertRejectsCode(promise, code, label) {
    try { await promise; } catch (err) { assertEqual(err && err.code, code, label); return err; }
    throw new Error(`${label || 'appel'} : rejet ${code} attendu, l'appel a réussi`);
  }

  async function withNested(config, fn) {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:320px;height:120px;border:0';
    document.body.appendChild(frame);
    const bridge = GristBridge.attach(frame, Object.assign({ origin: location.origin, tableId: 'Projets', rowId: 12, optionsKey: OPTIONS_KEY }, config));
    frame.src = NESTED_URL;
    const ctx = { frame, bridge, win: () => frame.contentWindow, nested: () => frame.contentWindow.__NESTED__, grist: () => frame.contentWindow.grist };
    try {
      await bridge.whenReady(8000);
      await fn(ctx);
    } finally {
      bridge.detach();
      frame.remove();
    }
  }
  const writes = () => window.__TEST_CALLS__.filter(c => ['AddRecord', 'UpdateRecord', 'RemoveRecord', 'AddTable', 'AddColumn'].includes(c.type));
  const logKinds = ctx => ctx.bridge.getLog().map(entry => entry.kind);

  describe('Pont Grist — arguments invalides refusés avec un code d\'erreur clair', function () {
    it('applyUserActions : seul un tableau d\'actions (elles-mêmes des tableaux) est accepté, rien n\'est écrit sinon', async function () {
      await withNested({}, async ctx => {
        const docApi = ctx.grist().docApi;
        await assertRejectsCode(docApi.applyUserActions('UpdateRecord'), 'RPC_INVALID_ARGS', 'texte à la place du tableau');
        await assertRejectsCode(docApi.applyUserActions({ 0: ['UpdateRecord'] }), 'RPC_INVALID_ARGS', 'objet à la place du tableau');
        await assertRejectsCode(docApi.applyUserActions([['UpdateRecord', 'Projets', 12, {}], 'RemoveRecord']), 'RPC_INVALID_ARGS', 'une action qui n\'est pas un tableau');
        assertEqual(writes().length, 0, 'aucune écriture n\'a atteint le document');
        assertTrue(logKinds(ctx).includes('error'), 'les refus sont consignés');
      });
    });

    it('fetchTable : un nom de table vide ou qui n\'est pas du texte est refusé avant tout appel à Grist', async function () {
      await withNested({}, async ctx => {
        const docApi = ctx.grist().docApi;
        await assertRejectsCode(docApi.fetchTable(''), 'RPC_INVALID_ARGS', 'nom vide');
        await assertRejectsCode(docApi.fetchTable(42), 'RPC_INVALID_ARGS', 'nombre');
        await assertRejectsCode(docApi.fetchTable(null), 'RPC_INVALID_ARGS', 'null');
      });
    });

    it('options : setOptions n\'accepte qu\'un objet simple ; setOption exige une clé non vide', async function () {
      await withNested({}, async ctx => {
        const grist = ctx.grist();
        await assertRejectsCode(grist.setOptions('texte'), 'RPC_INVALID_ARGS', 'texte');
        await assertRejectsCode(grist.setOptions(['a', 'b']), 'RPC_INVALID_ARGS', 'tableau');
        await assertRejectsCode(grist.setOptions(null), 'RPC_INVALID_ARGS', 'null');
        await assertRejectsCode(grist.setOption('', 1), 'RPC_INVALID_ARGS', 'clé vide');
        assertEqual(window.__mockWidgetOptions(), null, 'aucune option enregistrée par ces refus');
      });
    });

    it('sans table sélectionnée, lire la table ou la ligne liée donne l\'erreur NO_TABLE (et non une page blanche)', async function () {
      await withNested({ tableId: null, rowId: null }, async ctx => {
        const view = ctx.win().grist.rpc.getStub('GristView@grist');
        await assertRejectsCode(view.fetchSelectedTable(), 'NO_TABLE', 'table entière');
        await assertRejectsCode(view.fetchSelectedRecord(1), 'NO_TABLE', 'ligne');
      });
    });
  });

  describe('Pont Grist — rappels de la page et API Grist indisponible', function () {
    it('un rappel onWrite qui échoue n\'empêche pas l\'écriture : elle part, le résultat revient, l\'échec est consigné', async function () {
      await withNested({ onWrite: () => { throw new Error('affichage cassé'); } }, async ctx => {
        const result = await ctx.grist().docApi.applyUserActions([['UpdateRecord', 'Projets', 12, { Description_rapide_projet: 'Texte' }]]);
        assertTrue(!!result, 'le widget reçoit le résultat de Grist');
        assertTrue(window.__TEST_CALLS__.some(c => c.type === 'UpdateRecord' && c.table === 'Projets' && c.id === 12), 'l\'écriture a atteint le document');
        assertTrue(ctx.bridge.getLog().some(entry => entry.kind === 'error' && entry.text.includes('onWrite a échoué : affichage cassé')), 'échec consigné');
      });
    });

    it('un afficheur de journal (onLog) qui échoue ne casse jamais le pont', async function () {
      let seen = 0;
      await withNested({ onLog: () => { seen += 1; throw new Error('journal cassé'); } }, async ctx => {
        await waitFor(() => ctx.nested().options.length >= 1, 'le widget imbriqué reçoit ses options malgré tout');
        assertTrue(seen > 0, 'le rappel a bien été appelé');
        assertEqual(await ctx.grist().docApi.getDocName(), 'Document de test', 'les appels continuent de passer');
      });
    });

    it('curseur et sélection du widget imbriqué sont transmis à la page (onCursorPos, onSelectedRows)', async function () {
      const cursor = [], selected = [];
      await withNested({ onCursorPos: pos => cursor.push(pos), onSelectedRows: rows => selected.push(rows) }, async ctx => {
        await ctx.grist().setCursorPos({ rowId: 11 });
        await ctx.grist().setSelectedRows([10, 11]);
        assertDeepEqual(cursor, [{ rowId: 11 }]);
        assertDeepEqual(selected, [[10, 11]]);
      });
    });

    it('sans rappel onCursorPos / onSelectedRows, ces appels réussissent sans rien faire', async function () {
      await withNested({}, async ctx => {
        await ctx.grist().setCursorPos({ rowId: 11 });
        await ctx.grist().setSelectedRows([10]);
      });
    });

    it('un mappage de colonnes demandé par le widget imbriqué est ignoré, et le dit dans le journal', async function () {
      await withNested({}, async ctx => {
        await ctx.grist().sectionApi.configure({ columns: [{ name: 'Titre', type: 'Text' }] });
        assertTrue(ctx.bridge.getLog().some(entry => entry.kind === 'warn' && entry.text.includes('mappage de colonnes')), 'avertissement consigné');
      });
    });

    it('API Grist de ce widget indisponible : les appels document échouent en RPC_UNKNOWN_METHOD et les options de départ sont vides (consigné)', async function () {
      await withNested({ api: { /* ni docApi ni getOption */ } }, async ctx => {
        await assertRejectsCode(ctx.grist().docApi.listTables(), 'RPC_UNKNOWN_METHOD', 'listTables');
        await assertRejectsCode(ctx.grist().docApi.applyUserActions([['UpdateRecord', 'Projets', 12, {}]]), 'RPC_UNKNOWN_METHOD', 'applyUserActions');
        assertTrue(ctx.bridge.getLog().some(entry => entry.kind === 'warn' && entry.text.includes('Lecture des options impossible')), 'options illisibles : on démarre sans');
        assertDeepEqual(ctx.nested().options[0].options, null, 'le widget imbriqué reçoit « aucune option »');
      });
    });
  });

  describe('Pont Grist — attente d\'un widget imbriqué', function () {
    it('whenReady rend la main tout de suite quand le widget est déjà prêt', async function () {
      await withNested({}, async ctx => {
        const started = Date.now();
        assertEqual(await ctx.bridge.whenReady(5000), true);
        assertTrue(Date.now() - started < 200, 'immédiat');
        assertEqual(ctx.bridge.getState().ready, true);
        assertEqual(ctx.bridge.getState().phase, 'ready');
      });
    });

    it('un widget qui ne se déclare jamais prêt : whenReady échoue au bout du délai, et la page peut le dire', async function () {
      const frame = document.createElement('iframe');
      document.body.appendChild(frame);
      const bridge = GristBridge.attach(frame, { origin: location.origin, tableId: 'Projets', rowId: 12 });
      frame.src = 'about:blank'; // jamais de grist.ready()
      try {
        let message = '';
        try { await bridge.whenReady(150); } catch (err) { message = err.message; }
        assertIncludes(message, 'n\'a pas répondu');
        assertEqual(bridge.getState().ready, false);
        assertEqual(bridge.getState().phase, 'waiting');
      } finally { bridge.detach(); frame.remove(); }
    });
  });
})();
