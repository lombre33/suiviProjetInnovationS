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

  global.grist = {
    ready: async function () { return undefined; },
    docApi: {
      fetchTable: async function (name) {
        const table = store[name];
        // Real Grist rejects/omits unknown tables; CoreGrist.loadAllTables() already
        // catches per-table errors and falls back to [], so throwing here is realistic.
        if (!table) throw new Error(`Mock Grist: unknown table ${name}`);
        return JSON.parse(JSON.stringify(table));
      },
      applyUserActions: async function (actions) {
        const retValues = actions.map(function (action) {
          const type = action[0], table = action[1], id = action[2], fields = action[3];
          if (type === 'AddRecord') return addRecord(table, fields);
          if (type === 'UpdateRecord') return updateRecord(table, id, fields);
          throw new Error(`Mock Grist: unsupported action type ${type}`);
        });
        return { actionNum: global.__TEST_CALLS__.length, retValues };
      }
    }
  };

  // Full reset between tests: fresh fixture data, cleared call log, cleared app state.
  global.__resetMockGrist = function () {
    store = cloneFixtures();
    global.__TEST_CALLS__.length = 0;
    if (global.CoreState && typeof global.CoreState.clearState === 'function') {
      global.CoreState.clearState();
    }
    // CoreGrist caches its ready() promise/instance module-privately; give tests a
    // fresh handshake each time by re-running ready() (idempotent: sets the same
    // window.grist as gristInstance again).
    if (global.CoreGrist) {
      global.CoreGrist.ready();
    }
  };
})(window);
