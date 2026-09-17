
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

  function formatCurrency(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0 €';
    const [integer, decimals] = number.toFixed(2).split('.');
    const formattedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return `${formattedInteger}${decimals === '00' ? '' : `,${decimals}`} €`;
  }

  // applyUserActions() resolves to { actionNum, retValues: [...] }, one entry per
  // action; an AddRecord's retValue is the new row's plain numeric id. This walks a
  // response defensively (nested arrays/objects, alternate key names) so callers don't
  // have to assume one exact shape.
  function extractAddedRecordId(response) {
    function visit(value, depth) {
      if (depth > 8 || value == null) return null;
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
      if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) && Number(value) > 0) return Number(value);
      if (Array.isArray(value)) {
        for (const item of value) {
          const id = visit(item, depth + 1);
          if (id != null) return id;
        }
        return null;
      }
      if (typeof value !== 'object') return null;
      for (const key of ['id', 'rowId', 'rowID']) {
        const id = visit(value[key], depth + 1);
        if (id != null) return id;
      }
      for (const key of ['ids', 'retValues', 'result', 'results']) {
        const id = visit(value[key], depth + 1);
        if (id != null) return id;
      }
      return null;
    }
    return visit(response, 0);
  }

  global.CoreUtils = { debugLog, debugError, showToast, toRecords, findLabelForRef, gristDateToInput, inputDateToGrist, escapeHtml, formatCurrency, extractAddedRecordId };
})(window);
