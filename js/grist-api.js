/**
 * Grist API Module
 */
(function (global) {
  'use strict';
  const TABLE_NAMES = ['Projets', 'Annuaire', 'Postes2', 'Structures', 'Programmes', 'Etablissements', 'Suivi_Instance', 'EcritureComptables'];
  function toRecords(table) { if (!table || !Array.isArray(table.id)) return []; const columns = Object.keys(table).filter(key => key !== 'id'); return table.id.map((id, index) => { const record = { id }; columns.forEach(column => { record[column] = table[column]?.[index]; }); return record; }); }
  function normaliseProjectFields(fields) { const normalized = { ...fields }; Object.keys(normalized).filter(key => /^c202[678]_M(?:10|20|30)_/.test(key)).forEach(key => { const value = Number(normalized[key]); normalized[key] = Number.isFinite(value) ? value : 0; }); return normalized; }
  let gristInstance = null; let readyPromise = null;
  const CoreGrist = { get gristInstance() { return gristInstance; }, normaliseProjectFields,
    ready(timeoutMs = 10000) { if (readyPromise) return readyPromise; readyPromise = (async () => { const maxWait = Date.now() + timeoutMs; while (!window.grist && Date.now() < maxWait) await new Promise(resolve => setTimeout(resolve, 50)); if (!window.grist) throw new Error(`Grist API non disponible après ${timeoutMs} ms`); await window.grist.ready({ requiredAccess: 'full' }); gristInstance = window.grist; return gristInstance; })(); return readyPromise; },
    async getTable(name) { if (!gristInstance) throw new Error('CoreGrist not ready - call ready() first'); return toRecords(await gristInstance.docApi.fetchTable(name)); },
    async loadAllTables() { const entries = await Promise.all(TABLE_NAMES.map(async name => { try { return [name, await this.getTable(name)]; } catch (err) { console.warn(`Table ${name} failed:`, err.message); return [name, []]; } })); return Object.fromEntries(entries); }
  };
  global.CoreGrist = CoreGrist;
})(window);
