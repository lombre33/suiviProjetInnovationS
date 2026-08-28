
/* =========================================================
   CORE — UTILITAIRES GÉNÉRIQUES
   ========================================================= */
(function (global) {
  function debugLog(msg, data = null) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${msg}`, data || '');
  }

  function debugError(msg, err) {
    const timestamp = new Date().toLocaleTimeString();
    console.error(`[${timestamp}] ❌ ${msg}`, err);
  }

  function showToast(msg, isError = false) {
    debugLog(`Toast: ${msg}`, { isError });
    const t = document.getElementById('toast');
    if (!t) {
      console.warn('Element toast non trouvé');
      return;
    }
    t.textContent = msg;
    t.classList.remove('hidden');
    t.classList.toggle('error', isError);
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => t.classList.add('hidden'), 4000);
  }

  function toRecords(columnarTable) {
    if (!columnarTable || !columnarTable.id) return [];
    const ids = columnarTable.id;
    const records = [];
    for (let i = 0; i < ids.length; i++) {
      const rec = { id: ids[i] };
      for (const col of Object.keys(columnarTable)) {
        if (col === 'id') continue;
        rec[col] = columnarTable[col][i];
      }
      records.push(rec);
    }
    return records;
  }

  function findLabelForRef(tableName, id, displayField) {
    if (!id) return '';
    const rec = toRecords(global.CoreState.getTable(tableName)).find(r => r.id === id);
    return rec ? (rec[displayField] ?? '') : '';
  }

  function gristDateToInput(value) {
    if (!value) return '';
    const date = new Date(Number(value) * 1000);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  }

  function inputDateToGrist(id) {
    const value = document.getElementById(id)?.value;
    if (!value) return null;
    return Math.floor(new Date(`${value}T00:00:00Z`).getTime() / 1000);
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  global.CoreUtils = { debugLog, debugError, showToast, toRecords, findLabelForRef, gristDateToInput, inputDateToGrist, escapeHtml };
})(window);
