/**
 * Document Grist VIRTUEL pour un widget imbriqué (Grist-BI dans le Dashboard).
 *
 * Pourquoi : Grist-BI parle à « son » document Grist (listTables, fetchTable, applyUserActions) et y crée trois tables
 * internes (BI_Dashboard_Config, BI_Dashboard_Comments, BI_Dashboard_UserProbe). Plutôt que de lui donner un accès complet
 * au vrai document (le pont de grist-bridge.js relaierait tout), le Dashboard lui présente un document en mémoire, de la
 * forme exacte que Grist-BI attend :
 *  - une table de DONNÉES en lecture seule, calculée par le Dashboard avec ses filtres (Dashboard_Financier) ;
 *  - ses tables internes BI_*, créées ici, jamais dans le vrai document ; leur contenu (la configuration des tuiles)
 *    est rendu à l'appelant (onChange) pour qu'il le range dans les options de son widget ;
 *  - les tables système que Grist-BI lit pour connaître les colonnes (_grist_Tables, _grist_Tables_column, _grist_DocInfo...),
 *    reconstruites à chaque lecture. Rien d'autre n'existe : le widget imbriqué ne voit aucune donnée du vrai document.
 *
 * Formes reprises de l'API Grist réelle, telles que Grist-BI les emploie (cf. dev-tests/grist-stub.js de Grist-BI) :
 * fetchTable rend des colonnes ({id:[...], Col:[...]}), AddTable rend {id, table_id, columns, views}, AddColumn rend
 * {colRef, colId}, un nom de table ou de colonne déjà pris reçoit un numéro (jamais d'erreur ni d'écrasement).
 * Non vérifié sur un vrai document Grist : l'imbrication de deux iframes n'a pas été essayée dans Grist même.
 *
 * Garde-fous : seules les tables dont le nom commence par BI_ peuvent être créées ; la table de données et les tables
 * système sont en lecture seule (les écritures dans _grist_* sont acceptées et ignorées : Grist-BI y range des pages) ;
 * une action inconnue échoue franchement au lieu d'être ignorée.
 */
(function (global) {
  'use strict';

  const STATE_VERSION = 1;
  const WRITABLE_PREFIX = 'BI_';
  const RESERVED_COLUMNS = new Set(['id', '__proto__', 'constructor', 'prototype', 'manualSort']);
  const COLUMN_ID = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const isMeta = tableId => typeof tableId === 'string' && tableId.startsWith('_grist_');
  const isPlain = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const copy = value => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

  // Valeur d'une colonne que personne n'a renseignée (celle que Grist met dans une cellule neuve).
  function defaultFor(type) {
    const base = String(type || 'Any').split(':')[0];
    if (base === 'Text' || base === 'Choice') return '';
    if (base === 'Numeric' || base === 'Int' || base === 'Ref') return 0;
    if (base === 'Bool') return false;
    return null;
  }

  function error(message) { return new Error(message); }

  function uniqueName(wanted, taken) {
    if (!taken(wanted)) return wanted;
    let n = 2;
    while (taken(`${wanted}${n}`)) n += 1;
    return `${wanted}${n}`;
  }

  /**
   * options : {
   *   docName       : nom rendu par getDocName ;
   *   docSettings   : {locale, currency} rendus dans _grist_DocInfo (format des nombres de Grist-BI) ;
   *   userEmail     : () => adresse de la personne (remplit les formules déclenchées `user.Email`) ;
   *   onChange(state): appelé (une fois par rafale de changements) quand une table BI_* change : l'état est du JSON pur.
   * }
   */
  function create(options) {
    const opts = options || {};
    const readOnly = new Map();  // tableId → table de données (non enregistrée)
    const writable = new Map();  // tableId → table interne BI_* (enregistrée par l'appelant)
    let nextRef = 1;
    let notifyQueued = false;
    let revision = 0;

    const ref = () => nextRef++;
    const allTables = () => Array.from(readOnly.values()).concat(Array.from(writable.values()));
    const find = tableId => readOnly.get(tableId) || writable.get(tableId) || null;
    const tableTaken = tableId => readOnly.has(tableId) || writable.has(tableId) || isMeta(tableId);

    function makeTable(tableId, columns, extra) {
      const table = Object.assign({
        id: tableId, ref: ref(), viewRef: ref(), sortRef: ref(), columns: [], data: Object.create(null), nextRowId: 1, readOnly: false
      }, extra);
      table.data.id = [];
      table.data.manualSort = [];
      columns.forEach(col => addColumnTo(table, col, false));
      return table;
    }

    function addColumnTo(table, spec, fillRows) {
      const wanted = String(spec && spec.id);
      if (!COLUMN_ID.test(wanted) || RESERVED_COLUMNS.has(wanted)) throw error(`Nom de colonne refusé : « ${wanted} »`);
      const colId = uniqueName(wanted, name => table.columns.some(col => col.id === name) || RESERVED_COLUMNS.has(name));
      const col = {
        id: colId, ref: ref(), type: String(spec.type || 'Any'), widgetOptions: typeof spec.widgetOptions === 'string' ? spec.widgetOptions : '',
        isFormula: spec.isFormula === true, formula: typeof spec.formula === 'string' ? spec.formula : ''
      };
      table.columns.push(col);
      table.data[colId] = fillRows ? table.data.id.map(() => defaultFor(col.type)) : [];
      return col;
    }

    function touch(table) {
      revision += 1;
      if (table.readOnly || notifyQueued || typeof opts.onChange !== 'function') return;
      notifyQueued = true;
      Promise.resolve().then(() => {
        notifyQueued = false;
        try { opts.onChange(exportState()); } catch (err) { /* un enregistrement défaillant ne casse pas le widget imbriqué */ }
      });
    }

    // --- Table de données (lecture seule) -----------------------------------------------------------------------------------------
    // rows : tableau d'objets {colId: valeur}. Remplace tout le contenu ; les identifiants de colonnes restent ceux déjà connus.
    function setReadOnlyTable(tableId, columns, rows) {
      let table = readOnly.get(tableId);
      if (!table) {
        table = makeTable(tableId, columns, { readOnly: true });
        readOnly.set(tableId, table);
      }
      const list = Array.isArray(rows) ? rows : [];
      table.data = Object.create(null);
      table.data.id = list.map((row, index) => index + 1);
      table.data.manualSort = list.map((row, index) => index + 1);
      table.columns.forEach(col => { table.data[col.id] = list.map(row => (row[col.id] === undefined ? defaultFor(col.type) : row[col.id])); });
      revision += 1;
      return table.data.id.length;
    }

    // Table interne : créée avec ses lignes de départ seulement si elle n'existe pas déjà (état restauré ou créée par le widget).
    function ensureTable(tableId, columns, rows) {
      if (writable.has(tableId)) return false;
      if (!tableId.startsWith(WRITABLE_PREFIX)) throw error(`Seules les tables ${WRITABLE_PREFIX}* sont créées ici`);
      const table = makeTable(tableId, columns);
      writable.set(tableId, table);
      (rows || []).forEach(fields => addRow(table, null, fields));
      touch(table);
      return true;
    }

    // --- Lignes --------------------------------------------------------------------------------------------------------------------
    function applyTriggers(table, fields) {
      table.columns.forEach(col => {
        if (!col.isFormula && col.formula === 'user.Email' && fields[col.id] === undefined && typeof opts.userEmail === 'function') {
          fields[col.id] = opts.userEmail() || '';
        }
      });
    }

    function addRow(table, wantedId, fields) {
      const values = Object.create(null);
      Object.keys(fields || {}).forEach(key => { values[key] = fields[key]; });
      applyTriggers(table, values);
      const id = Number.isInteger(wantedId) && wantedId > 0 && !table.data.id.includes(wantedId) ? wantedId : table.nextRowId;
      table.nextRowId = Math.max(table.nextRowId, id + 1);
      table.data.id.push(id);
      table.data.manualSort.push(id);
      table.columns.forEach(col => { table.data[col.id].push(values[col.id] === undefined ? defaultFor(col.type) : copy(values[col.id])); });
      return id;
    }

    function writeRow(table, rowId, fields) {
      const index = table.data.id.indexOf(rowId);
      if (index === -1) throw error(`Ligne ${rowId} introuvable dans « ${table.id} »`);
      Object.keys(fields || {}).forEach(key => {
        if (key === 'manualSort') return; // l'ordre des lignes n'est pas géré ici
        if (!table.columns.some(col => col.id === key)) throw error(`Colonne « ${key} » inconnue dans « ${table.id} »`);
        table.data[key][index] = copy(fields[key]);
      });
    }

    function removeRow(table, rowId) {
      const index = table.data.id.indexOf(rowId);
      if (index === -1) return;
      Object.keys(table.data).forEach(key => table.data[key].splice(index, 1));
    }

    // --- Lecture -------------------------------------------------------------------------------------------------------------------
    const columnarCopy = table => {
      const out = {};
      Object.keys(table.data).forEach(key => { out[key] = copy(table.data[key]); });
      return out;
    };

    function metaTable(tableId) {
      const tables = allTables();
      if (tableId === '_grist_Tables') {
        return {
          id: tables.map(table => table.ref), tableId: tables.map(table => table.id), primaryViewId: tables.map(() => 0),
          summarySourceTable: tables.map(() => 0), onDemand: tables.map(() => false)
        };
      }
      if (tableId === '_grist_Tables_column') {
        const out = { id: [], parentId: [], parentPos: [], colId: [], type: [], widgetOptions: [], label: [], isFormula: [], formula: [], displayCol: [], visibleCol: [], description: [] };
        tables.forEach(table => {
          const columns = table.columns.concat([{ id: 'manualSort', ref: table.sortRef, type: 'ManualSortPos', widgetOptions: '', isFormula: false, formula: '' }]);
          columns.forEach((col, index) => {
            out.id.push(col.ref); out.parentId.push(table.ref); out.parentPos.push(index + 1); out.colId.push(col.id); out.type.push(col.type);
            out.widgetOptions.push(col.widgetOptions); out.label.push(col.id); out.isFormula.push(col.isFormula); out.formula.push(col.formula);
            out.displayCol.push(0); out.visibleCol.push(0); out.description.push('');
          });
        });
        return out;
      }
      if (tableId === '_grist_DocInfo') return { id: [1], documentSettings: [JSON.stringify(opts.docSettings || {})] };
      if (tableId === '_grist_Pages') return { id: [], viewRef: [], indentation: [], pagePos: [], shareRef: [], options: [] };
      if (tableId === '_grist_Views') return { id: [], name: [], type: [] };
      if (tableId === '_grist_Views_section') return { id: [], parentId: [], parentKey: [], tableRef: [], title: [], options: [] };
      return { id: [] }; // les autres tables système existent dans Grist ; ici elles sont vides
    }

    const docApi = {
      async getDocName() { return opts.docName || 'Dashboard financier'; },
      async listTables() {
        // Comme Grist : jamais les tables système ; la table de données d'abord (Grist-BI se connecte à la première).
        return allTables().map(table => table.id);
      },
      async fetchTable(tableId) {
        if (isMeta(tableId)) return metaTable(tableId);
        const table = find(tableId);
        if (!table) throw error(`Table « ${tableId} » introuvable`);
        return columnarCopy(table);
      },
      async getAccessToken() {
        throw error('getAccessToken : indisponible dans le document virtuel du Dashboard');
      },
      async applyUserActions(actions) {
        if (!Array.isArray(actions)) throw error('applyUserActions : liste d\'actions attendue');
        const retValues = actions.map(action => run(action));
        return { retValues };
      }
    };

    function writableTable(tableId, kind) {
      const table = find(tableId);
      if (!table) throw error(`${kind} : table « ${tableId} » introuvable`);
      if (table.readOnly) throw error(`${kind} : la table « ${tableId} » est en lecture seule`);
      return table;
    }

    function run(action) {
      if (!Array.isArray(action)) throw error('Action invalide');
      const kind = action[0];
      const tableId = action[1];
      if (isMeta(tableId)) return null; // Grist-BI y range des pages : sans objet ici
      if (kind === 'AddTable') {
        const wanted = String(tableId);
        if (!wanted.startsWith(WRITABLE_PREFIX)) throw error(`AddTable : seules les tables ${WRITABLE_PREFIX}* peuvent être créées dans le Dashboard (« ${wanted} » refusée)`);
        if (!Array.isArray(action[2])) throw error('AddTable : colonnes attendues');
        const actual = uniqueName(wanted, tableTaken);
        const table = makeTable(actual, action[2]);
        writable.set(actual, table);
        touch(table);
        return { id: table.ref, table_id: actual, columns: table.columns.map(col => col.id), views: [{ id: table.viewRef, sections: [] }] };
      }
      const table = writableTable(tableId, String(kind));
      if (kind === 'AddColumn') {
        const col = addColumnTo(table, Object.assign({}, action[3], { id: action[2] }), true);
        touch(table);
        return { colRef: col.ref, colId: col.id };
      }
      if (kind === 'ModifyColumn') {
        const col = table.columns.find(entry => entry.id === action[2]);
        if (!col) throw error(`ModifyColumn : colonne « ${action[2]} » introuvable`);
        const changes = action[3] || {};
        ['type', 'widgetOptions', 'formula'].forEach(key => { if (typeof changes[key] === 'string') col[key] = changes[key]; });
        if (typeof changes.isFormula === 'boolean') col.isFormula = changes.isFormula;
        touch(table);
        return null;
      }
      if (kind === 'RenameTable') {
        const next = uniqueName(String(action[2]), tableTaken);
        if (!next.startsWith(WRITABLE_PREFIX)) throw error('RenameTable : nom refusé');
        writable.delete(table.id);
        table.id = next;
        writable.set(next, table);
        touch(table);
        return null;
      }
      if (kind === 'AddRecord') { const id = addRow(table, action[2], action[3]); touch(table); return id; }
      if (kind === 'BulkAddRecord') {
        const ids = Array.isArray(action[2]) ? action[2] : [];
        const columns = action[3] || {};
        const result = ids.map((wanted, i) => {
          const fields = {};
          Object.keys(columns).forEach(key => { fields[key] = (columns[key] || [])[i]; });
          return addRow(table, wanted, fields);
        });
        touch(table);
        return result;
      }
      if (kind === 'UpdateRecord') { writeRow(table, action[2], action[3]); touch(table); return null; }
      if (kind === 'BulkUpdateRecord') {
        const columns = action[3] || {};
        (action[2] || []).forEach((rowId, i) => {
          const fields = {};
          Object.keys(columns).forEach(key => { fields[key] = (columns[key] || [])[i]; });
          writeRow(table, rowId, fields);
        });
        touch(table);
        return null;
      }
      if (kind === 'RemoveRecord') { removeRow(table, action[2]); touch(table); return null; }
      if (kind === 'BulkRemoveRecord') { (action[2] || []).forEach(rowId => removeRow(table, rowId)); touch(table); return null; }
      throw error(`Action non prise en charge dans le document virtuel : ${String(kind)}`);
    }

    // --- Enregistrement ------------------------------------------------------------------------------------------------------------
    function exportState() {
      const tables = {};
      writable.forEach((table, tableId) => {
        tables[tableId] = {
          ref: table.ref, viewRef: table.viewRef, sortRef: table.sortRef, nextRowId: table.nextRowId,
          columns: table.columns.map(col => ({ id: col.id, ref: col.ref, type: col.type, widgetOptions: col.widgetOptions, isFormula: col.isFormula, formula: col.formula })),
          data: columnarCopy(table)
        };
      });
      return { v: STATE_VERSION, nextRef, tables };
    }

    // Restaure l'état enregistré ; un état illisible est ignoré (le widget repart de ses tables de départ).
    function importState(state) {
      if (!isPlain(state) || state.v !== STATE_VERSION || !isPlain(state.tables)) return false;
      const restored = new Map();
      let top = Number(state.nextRef) > 0 ? Number(state.nextRef) : 1;
      for (const tableId of Object.keys(state.tables)) {
        const saved = state.tables[tableId];
        if (!tableId.startsWith(WRITABLE_PREFIX) || !isPlain(saved) || !Array.isArray(saved.columns) || !isPlain(saved.data) || !Array.isArray(saved.data.id)) return false;
        const table = { id: tableId, ref: Number(saved.ref) || top++, viewRef: Number(saved.viewRef) || top++, sortRef: Number(saved.sortRef) || top++, columns: [], data: Object.create(null), nextRowId: 1, readOnly: false };
        const size = saved.data.id.length;
        table.data.id = saved.data.id.map(Number);
        table.data.manualSort = Array.isArray(saved.data.manualSort) && saved.data.manualSort.length === size ? saved.data.manualSort.slice() : table.data.id.slice();
        for (const spec of saved.columns) {
          if (!isPlain(spec) || !COLUMN_ID.test(String(spec.id)) || RESERVED_COLUMNS.has(spec.id)) return false;
          const values = saved.data[spec.id];
          table.columns.push({ id: spec.id, ref: Number(spec.ref) || top++, type: String(spec.type || 'Any'), widgetOptions: String(spec.widgetOptions || ''), isFormula: spec.isFormula === true, formula: String(spec.formula || '') });
          table.data[spec.id] = Array.isArray(values) && values.length === size ? copy(values) : table.data.id.map(() => defaultFor(spec.type));
        }
        table.nextRowId = Math.max(Number(saved.nextRowId) || 1, ...table.data.id.map(id => id + 1), 1);
        restored.set(tableId, table);
      }
      writable.clear();
      restored.forEach((table, tableId) => writable.set(tableId, table));
      nextRef = Math.max(top, nextRef);
      revision += 1;
      return true;
    }

    return {
      docApi, setReadOnlyTable, ensureTable, exportState, importState,
      getTable(tableId) { const table = find(tableId); return table ? columnarCopy(table) : null; },
      getRevision() { return revision; }
    };
  }

  global.VirtualDoc = { create, STATE_VERSION, WRITABLE_PREFIX, defaultFor };
})(typeof window !== 'undefined' ? window : globalThis);
