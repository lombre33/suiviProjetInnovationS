/**
 * In-browser mock of window.grist (the real docs.getgrist.com/grist-plugin-api.js
 * global), backed by tests/fixtures.js. Mirrors the REAL Grist plugin API contract:
 * applyUserActions() resolves to { actionNum, retValues: [...] }, one entry per
 * action, where an AddRecord's retValue is the new row's plain numeric id
 * (confirmed against Grist's own docs/community examples — NOT wrapped in
 * {id: ...}). Getting this shape right matters: it's what exposed the
 * person-modal.js id-extraction bug documented in the audit findings.
 *
 * Must be loaded AFTER tests/fixtures.js and BEFORE js/core/grist-api.js.
 */
(function (global) {
  'use strict';

  function cloneFixtures() {
    return JSON.parse(JSON.stringify(global.__FIXTURES__));
  }

  let store = cloneFixtures();
  global.__TEST_CALLS__ = [];

  function columnCount(table) {
    return table.id.length;
  }

  function ensureColumn(table, key) {
    if (!table[key]) table[key] = new Array(columnCount(table)).fill(null);
    return table[key];
  }

  function addRecord(tableName, fields) {
    const table = store[tableName] || (store[tableName] = { id: [] });
    const newId = (table.id.length ? Math.max(...table.id) : 0) + 1;
    table.id.push(newId);
    // Every existing column must grow by one slot (null unless provided).
    Object.keys(table).forEach(key => {
      if (key === 'id') return;
      ensureColumn(table, key);
    });
    Object.keys(fields || {}).forEach(key => ensureColumn(table, key));
    const rowIndex = table.id.length - 1;
    Object.keys(table).forEach(key => {
      if (key === 'id') return;
      table[key][rowIndex] = Object.prototype.hasOwnProperty.call(fields || {}, key) ? fields[key] : (table[key][rowIndex] ?? null);
    });
    global.__TEST_CALLS__.push({ type: 'AddRecord', table: tableName, fields, id: newId });
    return newId;
  }

  function updateRecord(tableName, id, fields) {
    const table = store[tableName];
    if (!table) throw new Error(`Mock Grist: table ${tableName} does not exist`);
    const rowIndex = table.id.indexOf(Number(id));
    if (rowIndex === -1) throw new Error(`Mock Grist: record ${id} not found in ${tableName}`);
    Object.keys(fields || {}).forEach(key => {
      ensureColumn(table, key);
      table[key][rowIndex] = fields[key];
    });
    global.__TEST_CALLS__.push({ type: 'UpdateRecord', table: tableName, id: Number(id), fields });
    return null;
  }

  function removeRecord(tableName, id) {
    const table = store[tableName];
    if (!table) throw new Error(`Mock Grist: table ${tableName} does not exist`);
    const rowIndex = table.id.indexOf(Number(id));
    if (rowIndex === -1) throw new Error(`Mock Grist: record ${id} not found in ${tableName}`);
    Object.keys(table).forEach(key => table[key].splice(rowIndex, 1));
    global.__TEST_CALLS__.push({ type: 'RemoveRecord', table: tableName, id: Number(id) });
    return null;
  }

  function addTable(tableId, colDefs) {
    if (store[tableId]) throw new Error(`Mock Grist: table ${tableId} already exists`);
    const table = { id: [] };
    (colDefs || []).forEach(col => { table[col.id] = []; });
    store[tableId] = table;
    global.__TEST_CALLS__.push({ type: 'AddTable', table: tableId, colDefs });
    return { id: tableId };
  }

  function addColumn(tableId, colId, colInfo) {
    const table = store[tableId];
    if (!table) throw new Error(`Mock Grist: table ${tableId} does not exist`);
    if (Object.prototype.hasOwnProperty.call(table, colId)) throw new Error(`Mock Grist: column ${colId} already exists in ${tableId}`);
    ensureColumn(table, colId);
    global.__TEST_CALLS__.push({ type: 'AddColumn', table: tableId, colId, colInfo });
    return { colId };
  }

  // Options du widget (WidgetAPI de Grist) : null = aucune, comme activeCustomOptions côté Grist. Le pont Grist -> widget
  // imbriqué (js/core/grist-bridge.js) y range celles de publipostage+ sous une clé dédiée.
  let widgetOptions = null;
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  global.grist = {
    ready: async function () { return undefined; },
    getOption: async function (key) { return widgetOptions && hasOwn(widgetOptions, key) ? widgetOptions[key] : undefined; },
    setOption: async function (key, value) { widgetOptions = Object.assign({}, widgetOptions, { [key]: value }); },
    getOptions: async function () { return widgetOptions; },
    setOptions: async function (options) { widgetOptions = Object.assign({}, options); },
    clearOptions: async function () { widgetOptions = null; },
    docApi: {
      getDocName: async function () { return 'Document de test'; },
      getAccessToken: async function () { return { token: 'jeton-de-test', baseUrl: 'http://127.0.0.1/api/docs/test', ttlMsecs: 60000 }; },
      fetchTable: async function (name) {
        const table = store[name];
        // Real Grist rejects/omits unknown tables; CoreGrist.loadAllTables() already
        // catches per-table errors and falls back to [], so throwing here is realistic.
        if (!table) throw new Error(`Mock Grist: unknown table ${name}`);
        return JSON.parse(JSON.stringify(table));
      },
      // Comme Grist : les tables de métadonnées (_grist_*) se lisent avec fetchTable mais ne sont pas listées.
      listTables: async function () { return Object.keys(store).filter(name => !name.startsWith('_grist_')); },
      applyUserActions: async function (actions) {
        const retValues = actions.map(function (action) {
          const type = action[0];
          if (type === 'AddRecord') return addRecord(action[1], action[3]);
          if (type === 'UpdateRecord') return updateRecord(action[1], action[2], action[3]);
          if (type === 'RemoveRecord') return removeRecord(action[1], action[2]);
          if (type === 'AddTable') return addTable(action[1], action[2]);
          if (type === 'AddColumn') return addColumn(action[1], action[2], action[3]);
          throw new Error(`Mock Grist: unsupported action type ${type}`);
        });
        return { actionNum: global.__TEST_CALLS__.length, retValues };
      }
    }
  };

  // Installe/remplace une table du magasin (ex. les métadonnées _grist_Tables* du test du pont Grist).
  global.__mockSetTable = function (name, table) { store[name] = JSON.parse(JSON.stringify(table)); };
  global.__mockWidgetOptions = function () { return widgetOptions; };
  global.__mockSetWidgetOptions = function (options) { widgetOptions = options; };

  // Full reset between tests: fresh fixture data, cleared call log, cleared app state.
  // Also clears the localStorage key page-projets.js uses to remember "my"
  // Preferences_Widget row id across page loads (see loadUserPreferences()) —
  // without this, a row created by one test would leak into the next.
  global.__resetMockGrist = function () {
    store = cloneFixtures();
    widgetOptions = null;
    global.__TEST_CALLS__.length = 0;
    try { localStorage.removeItem('suiviProjetInnovationS:prefsRowId'); } catch (err) { /* ignore */ }
    if (global.CoreState && typeof global.CoreState.clearState === 'function') {
      global.CoreState.clearState();
    }
    // CoreGrist caches its ready() promise/instance module-privately; give tests a
    // fresh handshake each time by re-running ready() (idempotent: sets the same
    // window.grist as gristInstance again).
    if (global.CoreGrist) {
      global.CoreGrist.ready();
      // Vide le cache des descriptions de colonnes (bulles d'aide, js/components/help-tooltip.js) :
      // interne à grist-api.js, jamais réinitialisé par le rechargement du magasin ci-dessus. Sans
      // cet appel, une description posée par un test (via __mockSetTable('_grist_Tables_column', ...))
      // resterait visible dans tous les tests suivants, y compris d'autres suites.
      return global.CoreGrist.loadColumnDescriptions();
    }
  };
})(window);
