(function (global) {
  'use strict';
  const text = value => value == null ? '' : String(value);
  const rows = name => global.CoreState?.getTable ? (global.CoreState.getTable(name) || []) : [];
  const esc = value => text(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const refId = value => { if (value && typeof value === 'object') return value.id ?? value.rowId; return value; };
  const ids = value => Array.isArray(value) ? value.flatMap(item => { const id = refId(item); return Array.isArray(id) ? id : (id == null ? [] : [id]); }) : (value == null || value === '' ? [] : [refId(value)]);
  const label = (row, fields) => { for (const field of fields) if (row?.[field] != null && text(row[field])) return text(row[field]); return row?.id == null ? '' : text(row.id); };
  const api = () => { const value = global.CoreGrist?.gristInstance; if (!value) throw new Error('API Grist indisponible. Rechargez la page puis réessayez.'); return value; };
  const fieldValue = (row, names) => { for (const name of names) if (row?.[name] != null) return row[name]; return ''; };
  const recordFromTable = (table, id) => { if (!table?.id) return null; const i = table.id.findIndex(value => Number(value) === Number(id)); if (i < 0) return null; const record = { id: table.id[i] }; Object.keys(table).filter(k => k !== 'id').forEach(k => { record[k] = table[k]?.[i]; }); return record; };
  function extractAddedRecordId(response) {
    const visit = (value, depth = 0) => {
      if (depth > 8 || value == null) return null;
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
      if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) && Number(value) > 0) return Number(value);
      if (Array.isArray(value)) {
        for (const item of value) { const id = visit(item, depth + 1); if (id != null) return id; }
        return null;
      }
      if (typeof value !== 'object') return null;
      for (const key of ['id', 'rowId', 'rowID']) { const id = visit(value[key], depth + 1); if (id != null) return id; }
      for (const key of ['ids', 'retValues', 'result', 'results']) { const id = visit(value[key], depth + 1); if (id != null) return id; }
      return null;
    };
    return visit(response);
  }
  const acronym = (row) => text(row?.Acronyme);
  function calculatedPosteName({ titre, precisions, structureRow, employeurRow, id }) {
    const directionRow = structureRow ? rows('Structures').find(row => Number(row.id) === Number(structureRow.Directon_Structure_mere)) : null;
    return `${text(titre)}  ${text(precisions)} - ${acronym(structureRow)} - ${acronym(directionRow)} - ${acronym(employeurRow)} ${id == null || id === '' ? '(nouveau)' : text(id)}`;
  }
  function refSelect(parent, id, labelText, table, fields, value) {
    const wrap = document.createElement('div'); wrap.className = 'cp-field';
    wrap.innerHTML = `<label for="${id}">${esc(labelText)}</label><select id="${id}"><option value="">— Sélectionner —</option></select>`;
    const select = wrap.querySelector('select'); parent.appendChild(wrap);
    const render = (items, selected) => { select.innerHTML = '<option value="">— Sélectionner —</option>' + items.map(row => `<option value="${esc(row.id)}">${esc(label(row, fields))}</option>`).join(''); if (selected != null && selected !== '') select.value = String(refId(selected)); };
    render(rows(table), value); return { wrap, select, render };
  }
  async function save(mode, poste, fields) {
    const action = mode === 'edit' ? ['UpdateRecord', 'Postes2', Number(poste.id), fields] : ['AddRecord', 'Postes2', null, fields];
    return api().docApi.applyUserActions([action]);
  }
  function openPosteModal({ mode = 'create', poste = null, initialName = '', originInput = null } = {}) {
    const old = document.getElementById('cp-poste-modal'); if (old) old.remove();
    const editing = mode === 'edit', modal = document.createElement('div'); modal.id = 'cp-poste-modal'; modal.className = 'cp-modal cp-person-modal';
    modal.innerHTML = `<div class="cp-box" role="dialog" aria-modal="true"><h2>${editing ? 'Modifier un poste' : 'Créer un poste'} <button type="button" data-cp-close>×</button></h2><div class="cp-grid" id="cpp-poste-form"></div><p class="cp-error" role="alert"></p><div class="cp-actions"><button type="button" data-cp-cancel>Annuler</button><button type="button" data-cp-save>${editing ? 'Enregistrer les modifications' : 'Créer le poste'}</button></div></div>`;
    document.body.appendChild(modal); const form = modal.querySelector('#cpp-poste-form');
    const structure = refSelect(form, 'cpp-structure', 'Structure *', 'Structures', ['Acronyme', 'Nom_Complet'], fieldValue(poste, ['Structure2']));
    const employeur = refSelect(form, 'cpp-employeur', 'Tutelle / Employeur *', 'Etablissements', ['Acronyme', 'Nom_complet'], fieldValue(poste, ['Employeur_tutelle']));
    const titreWrap = document.createElement('div'); titreWrap.className = 'cp-field'; titreWrap.innerHTML = '<label for="cpp-titre">Titre du poste *</label><input id="cpp-titre" type="text" required>'; form.appendChild(titreWrap);
    const precisionWrap = document.createElement('div'); precisionWrap.className = 'cp-field'; precisionWrap.innerHTML = '<label for="cpp-precisions">Précisions du poste</label><textarea id="cpp-precisions" rows="3"></textarea>'; form.appendChild(precisionWrap);
    const nameWrap = document.createElement('div'); nameWrap.className = 'cp-field'; nameWrap.innerHTML = '<label for="cpp-nom-poste">Nom du poste (calculé)</label><input id="cpp-nom-poste" type="text" readonly aria-readonly="true" class="cp-readonly">'; form.appendChild(nameWrap);
    modal.querySelector('#cpp-titre').value = text(fieldValue(poste, ['Titre'])); modal.querySelector('#cpp-precisions').value = text(fieldValue(poste, ['Precisions_Poste'])); modal.querySelector('#cpp-nom-poste').value = text(fieldValue(poste, ['Nom_du_poste'])) || text(initialName);
    const preview = modal.querySelector('#cpp-nom-poste');
    const refreshPreview = () => {
      const structureRow = rows('Structures').find(row => Number(row.id) === Number(structure.select.value));
      const employeurRow = rows('Etablissements').find(row => Number(row.id) === Number(employeur.select.value));
      preview.value = calculatedPosteName({ titre: modal.querySelector('#cpp-titre').value, precisions: modal.querySelector('#cpp-precisions').value, structureRow, employeurRow, id: editing ? poste?.id : null });
    };
    const refreshEmployeurs = () => { const structureRow = rows('Structures').find(row => Number(row.id) === Number(structure.select.value)); const allowed = ids(structureRow?.Toutes_les_tutelles); const all = rows('Etablissements'); const filtered = allowed.length ? all.filter(row => allowed.some(id => Number(id) === Number(row.id))) : []; employeur.render(filtered, structureRow?.Etablissement_Tutelle_gestionaire); refreshPreview(); };
    structure.select.addEventListener('change', refreshEmployeurs); employeur.select.addEventListener('change', refreshPreview); modal.querySelector('#cpp-titre').addEventListener('input', refreshPreview); modal.querySelector('#cpp-precisions').addEventListener('input', refreshPreview); refreshEmployeurs();
    const close = () => modal.remove(); modal.querySelector('[data-cp-close]').onclick = close; modal.querySelector('[data-cp-cancel]').onclick = close;
    modal.querySelector('[data-cp-save]').onclick = async () => { const error = modal.querySelector('.cp-error'), button = modal.querySelector('[data-cp-save]'); const fields = { Structure2: Number(structure.select.value) || null, Employeur_tutelle: Number(employeur.select.value) || null, Titre: modal.querySelector('#cpp-titre').value.trim(), Precisions_Poste: modal.querySelector('#cpp-precisions').value.trim() }; if (!fields.Structure2 || !fields.Employeur_tutelle || !fields.Titre) { error.textContent = 'Structure, tutelle/employeur et titre sont obligatoires.'; return; } button.disabled = true; error.textContent = ''; try { const result = await save(mode, poste, fields); let id = editing ? poste.id : extractAddedRecordId(result); if (!id && !editing) { const found = rows('Postes2').filter(row => row.Titre === fields.Titre && row.Precisions_Poste === fields.Precisions_Poste).pop(); id = found?.id; } if (!id) throw new Error('Le poste a été enregistré mais son identifiant n’a pas pu être retrouvé.'); let calculated = ''; try { calculated = text(recordFromTable(await api().docApi.fetchTable('Postes2'), id)?.Nom_du_poste); } catch (_) {} if (!calculated) { const structureRow = rows('Structures').find(row => Number(row.id) === Number(fields.Structure2)); const employeurRow = rows('Etablissements').find(row => Number(row.id) === Number(fields.Employeur_tutelle)); calculated = calculatedPosteName({ titre: fields.Titre, precisions: fields.Precisions_Poste, structureRow, employeurRow, id }); } const updated = { ...(poste || {}), ...fields, id: Number(id), ...(calculated ? { Nom_du_poste: calculated } : {}) }; if (originInput) { originInput.value = calculated || text(poste?.Nom_du_poste) || ''; originInput.dataset.id = String(id); } const current = rows('Postes2'); if (global.CoreState?.setTable) global.CoreState.setTable('Postes2', editing ? current.map(row => Number(row.id) === Number(id) ? updated : row) : [...current, updated]); close(); } catch (e) { button.disabled = false; error.textContent = `${editing ? 'Modification' : 'Création'} impossible : ${e?.message || 'erreur inconnue'}`; } };
    modal.querySelector('#cpp-structure').focus(); return modal;
  }
  global.openPosteModal = openPosteModal; global.openCreatePosteModal = (initialName = '', originInput) => openPosteModal({ mode: 'create', initialName, originInput }); global.openEditPosteModal = (poste, originInput) => openPosteModal({ mode: 'edit', poste, originInput });
}(window));
