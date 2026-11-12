
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

  // Libellé d'une ligne OPE (table Lignes_OPE) : son numéro ; tant qu'elle n'en a pas (ligne dont on sait seulement
  // où elle sera ouverte, demande d'Antoine du 12/11/2026), « N° à venir » suivi de la structure d'installation.
  function opeLabel(ligne) {
    if (!ligne) return '';
    const numero = ligne.N_OPE == null ? '' : String(ligne.N_OPE).trim();
    if (numero) return numero;
    const chez = ligne.installe_chez && typeof ligne.installe_chez === 'object' ? ligne.installe_chez.id : ligne.installe_chez;
    const structures = chez && global.CoreState && typeof global.CoreState.getTable === 'function' ? (global.CoreState.getTable('Structures') || []) : [];
    const structure = chez ? findById(structures, chez) : null;
    const nom = structure ? String(structure.Acronyme || structure.Nom_Complet || '').trim() : '';
    return nom ? 'N° à venir · ' + nom : 'N° à venir';
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

  // Branche Flèches/Entrée/Échap sur un champ de recherche + sa liste de suggestions
  // (le motif ".cp-ref" répété dans project-modal.js, poste-modal.js, person-modal.js).
  // `list` est le conteneur stable des boutons <button> ; son innerHTML est reconstruit
  // à chaque frappe par le render() de l'appelant, donc on relit toujours les boutons
  // au moment de la touche plutôt que de les mettre en cache.
  function wireRefListKeyNav(input, list) {
    const items = () => Array.from(list.querySelectorAll('button'));
    const setActive = index => {
      const all = items();
      all.forEach(b => b.classList.remove('is-active'));
      if (index >= 0 && index < all.length) {
        all[index].classList.add('is-active');
        all[index].scrollIntoView({ block: 'nearest' });
      }
    };
    input.addEventListener('keydown', event => {
      if (list.classList.contains('cp-hidden')) return;
      const all = items();
      if (!all.length) return;
      const activeIndex = all.findIndex(b => b.classList.contains('is-active'));
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((activeIndex + 1) % all.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((activeIndex - 1 + all.length) % all.length);
      } else if (event.key === 'Enter') {
        if (activeIndex >= 0) {
          event.preventDefault();
          all[activeIndex].click();
        }
      } else if (event.key === 'Escape') {
        list.classList.add('cp-hidden');
      }
    });
  }

  // Index « clé -> ligne » d'un tableau de lignes, mémorisé par tableau (WeakMap) : remplace les
  // `rows.find(row => String(row.id) === String(id))` des pages, qui parcouraient toute la table à
  // chaque étiquette d'une carte (O(projets x lignes) à chaque rendu). Premier gagnant en cas de
  // doublon, comme find(). Les tables du widget sont remplacées en bloc à chaque rechargement
  // (CoreState.setTable) : un nouveau tableau = un nouvel index ; la longueur et la dernière ligne
  // sont vérifiées au cas où un tableau serait modifié sur place (ajout, retrait).
  const rowIndexes = new WeakMap();
  const NO_ROWS = new Map();
  function indexBy(rows, name, keyOf) {
    if (!Array.isArray(rows)) return NO_ROWS;
    let byName = rowIndexes.get(rows);
    if (!byName) { byName = new Map(); rowIndexes.set(rows, byName); }
    const last = rows.length ? rows[rows.length - 1] : undefined;
    let entry = byName.get(name);
    if (!entry || entry.length !== rows.length || entry.last !== last) {
      const map = new Map();
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row == null) continue;
        const key = String(keyOf(row));
        if (!map.has(key)) map.set(key, row);
      }
      entry = { length: rows.length, last, map };
      byName.set(name, entry);
    }
    return entry.map;
  }
  const idKey = row => row.id;
  function findById(rows, id) { return indexBy(rows, 'id', idKey).get(String(id)); }

  // Liste de libellés rangée dans une cellule de texte (filtres Programme / Instance retenus par utilisateur, DOM compris) :
  // « A,B » — lisible dans Grist et compatible avec les préférences déjà enregistrées — tant qu'aucun libellé ne contient de
  // virgule, sinon un tableau JSON ["Programme B, volet 2","A"]. Avec une simple virgule comme séparateur, « Programme B, volet 2 »
  // se lisait comme deux choix (« Programme B » et « volet 2 ») : le filtre ne trouvait plus aucun projet. La lecture accepte les deux
  // formes ; un texte qui n'est pas un tableau JSON valide reste lu comme une liste séparée par des virgules.
  function encodeList(values) {
    const list = (values || []).map(value => String(value));
    return list.some(value => value.includes(',')) ? JSON.stringify(list) : list.join(',');
  }
  function decodeList(value) {
    const raw = value == null ? '' : String(value).trim();
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map(item => String(item).trim()).filter(Boolean);
      } catch (err) { /* pas du JSON : liste séparée par des virgules */ }
    }
    return raw.split(',').map(item => item.trim()).filter(Boolean);
  }

  // Appelle `fn` une fois que les appels se sont arrêtés pendant `delay` ms (derniers arguments).
  // cancel() abandonne l'appel en attente, flush() l'exécute tout de suite. Sert aux champs de
  // recherche : chaque frappe écrivait la préférence dans Grist (une action enregistrée et
  // diffusée à chaque lettre) ; seule la dernière valeur est utile.
  function debounce(fn, delay) {
    let timer = null, pendingArgs = null;
    const run = () => { timer = null; const args = pendingArgs; pendingArgs = null; if (args) fn(...args); };
    const debounced = (...args) => { pendingArgs = args; clearTimeout(timer); timer = setTimeout(run, delay); };
    debounced.cancel = () => { clearTimeout(timer); timer = null; pendingArgs = null; };
    debounced.flush = () => { if (timer !== null) { clearTimeout(timer); run(); } };
    return debounced;
  }

  global.CoreUtils = { indexBy, findById, debounce, encodeList, decodeList, debugLog, debugError, showToast, toRecords, findLabelForRef, gristDateToInput, inputDateToGrist, opeLabel, escapeHtml, formatCurrency, extractAddedRecordId, wireRefListKeyNav };
})(window);
