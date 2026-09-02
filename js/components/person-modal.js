(function (global) {
  'use strict';

  const text = value => value == null ? '' : String(value);
  const fieldValue = (row, names) => { for (const name of names) if (row && row[name] != null) return row[name]; return ''; };
  const tableRows = name => global.CoreState?.getTable ? (global.CoreState.getTable(name) || []) : [];
  const label = (row, fields) => fields.map(field => text(row?.[field])).filter(Boolean).join(' — ');
  const escapeHtml = value => text(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const personRefKeys = new Set(['Chef_de_projet', 'Responsable_scientifique', 'Porteur', 'Personne'] );

  function addRecord(fields) { const api = global.CoreGrist?.gristInstance; if (!api) throw new Error('API Grist indisponible. Rechargez la page puis réessayez.'); return api.docApi.applyUserActions([['AddRecord', 'Annuaire', null, fields]]); }
  function extractAddedRecordId(response) {
    const visit = (value, depth = 0) => {
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
    };
    return visit(response);
  }

  function updateRecord(id, fields) { const api = global.CoreGrist?.gristInstance; if (!api) throw new Error('API Grist indisponible. Rechargez la page puis réessayez.'); return api.docApi.applyUserActions([['UpdateRecord', 'Annuaire', Number(id), fields]]); }
  function searchableField(parent, id, labelText, rows, fields, initialValue, initialId, action = null) {
    const wrap = document.createElement('div');
    wrap.className = 'cp-field cp-ref';
    if (action) { wrap.classList.add('cp-poste-ref'); }
    wrap.innerHTML = `<label for="${id}">${escapeHtml(labelText)}</label><div class="cp-ref-control"><input id="${id}" autocomplete="off" placeholder="Rechercher…"><button type="button" class="cp-ref-add" aria-label="Créer un nouveau poste" title="Créer un nouveau poste">+</button></div><div class="cp-ref-list cp-hidden"></div>`;
    const input = wrap.querySelector('input'), list = wrap.querySelector('.cp-ref-list'), addButton = wrap.querySelector('.cp-ref-add');
    if (action) { const control = wrap.querySelector('.cp-ref-control'); control.style.display = 'flex'; control.style.alignItems = 'center'; control.style.gap = '8px'; input.style.flex = '1 1 auto'; addButton.style.flex = '0 0 42px'; addButton.style.width = '42px'; addButton.style.height = '42px'; addButton.style.padding = '0'; addButton.style.border = '1px solid #2563eb'; addButton.style.borderRadius = '10px'; addButton.style.background = '#2563eb'; addButton.style.color = '#fff'; addButton.style.font = '600 1.5rem/1 sans-serif'; addButton.style.cursor = 'pointer'; }
    if (!action) addButton.remove();
    else addButton.onclick = event => { event.preventDefault(); event.stopPropagation(); list.classList.add('cp-hidden'); action(input); };
    if (initialValue) input.value = initialValue;
    if (initialId != null && initialId !== '') input.dataset.id = String(initialId);
    const render = () => { const query = input.value.trim().toLowerCase(); const matches = rows().filter(row => label(row, fields).toLowerCase().includes(query)).slice(0, 30); list.innerHTML = matches.map(row => `<button type="button" data-id="${escapeHtml(row.id)}">${escapeHtml(label(row, fields))}</button>`).join(''); list.classList.toggle('cp-hidden', !list.innerHTML); list.querySelectorAll('button').forEach(button => button.onclick = () => { input.value = button.textContent; input.dataset.id = button.dataset.id; list.classList.add('cp-hidden'); }); };
    input.oninput = () => { delete input.dataset.id; render(); };
    input.onfocus = render;
    input.onclick = event => {
      if (action && input.dataset.id && typeof global.openEditPosteModal === 'function') {
        const selected = rows().find(row => String(row.id) === String(input.dataset.id));
        if (selected) { event.preventDefault(); event.stopPropagation(); list.classList.add('cp-hidden'); global.openEditPosteModal(selected, input); }
      }
    };
    input.onblur = () => setTimeout(() => list.classList.add('cp-hidden'), 150);
    parent.appendChild(wrap);
    return input;
  }

  function openPersonModal({ mode = 'create', person = null, originInput = null, initialName = '' } = {}) { const existing = document.getElementById('cp-person-modal'); if (existing) existing.remove(); const editing = mode === 'edit'; const modal = document.createElement('div'); modal.id = 'cp-person-modal'; modal.className = 'cp-modal cp-person-modal'; modal.innerHTML = `<div class="cp-box" role="dialog" aria-modal="true"><h2 id="cpp-title">${editing ? 'Modifier une personne' : 'Créer une personne'} <button type="button" data-cp-close>×</button></h2><div class="cp-grid" id="cpp-form"><div class="cp-field"><label for="cpp-nom">Nom *</label><input id="cpp-nom" type="text" required></div><div class="cp-field"><label for="cpp-prenom">Prénom *</label><input id="cpp-prenom" type="text" required></div><div class="cp-field"><label for="cpp-email">Email</label><input id="cpp-email" type="email"></div><div class="cp-field"><label for="cpp-tel">Tel</label><input id="cpp-tel" type="text"></div></div><div class="cp-grid" id="cpp-refs"></div><p class="cp-error" role="alert"></p><div class="cp-actions"><button type="button" data-cp-cancel>Annuler</button><button type="button" data-cp-save>${editing ? 'Enregistrer les modifications' : 'Créer la personne'}</button></div></div>`; document.body.appendChild(modal); const nom = modal.querySelector('#cpp-nom'), prenom = modal.querySelector('#cpp-prenom'); if (editing) { nom.value = text(fieldValue(person, ['NOM', 'Nom'])); prenom.value = text(fieldValue(person, ['Prenom', 'Prénom'])); } else { const parts = text(initialName).trim().split(/\s+/); if (parts.length > 1) { nom.value = parts.pop(); prenom.value = parts.join(' '); } else nom.value = text(initialName).trim(); } modal.querySelector('#cpp-email').value = text(fieldValue(person, ['Email'])); modal.querySelector('#cpp-tel').value = text(fieldValue(person, ['Telephone', 'Tel'])); const refs = modal.querySelector('#cpp-refs'); const structureValue = fieldValue(person, ['Structure']); const posteValue = fieldValue(person, ['Poste2', 'Poste']); const refLabel = (value, table, fields) => { const id = value && typeof value === 'object' ? value.id : value; const row = tableRows(table).find(item => String(item.id) === String(id)); return value && typeof value === 'object' ? label(value, fields) : (row ? label(row, fields) : ''); }; const refId = value => value && typeof value === 'object' ? value.id : value; const structure = searchableField(refs, 'cpp-structure', 'Structure (acronyme)', () => tableRows('Structures'), ['Acronyme'], refLabel(structureValue, 'Structures', ['Acronyme']), refId(structureValue)); const poste = searchableField(refs, 'cpp-poste', 'Poste (nom du poste)', () => tableRows('Postes2'), ['Nom_du_poste', 'Titre'], refLabel(posteValue, 'Postes2', ['Nom_du_poste', 'Titre']), refId(posteValue), input => { if (typeof global.openCreatePosteModal === 'function') global.openCreatePosteModal('', input); }); const close = () => modal.remove(); modal.querySelector('[data-cp-close]').onclick = close; modal.querySelector('[data-cp-cancel]').onclick = close; modal.querySelector('[data-cp-save]').onclick = async () => { const error = modal.querySelector('.cp-error'), n = nom.value.trim(), p = prenom.value.trim(); if (!n || !p) { error.textContent = 'Le nom et le prénom sont obligatoires.'; return; } const button = modal.querySelector('[data-cp-save]'); button.disabled = true; error.textContent = ''; const fields = { NOM: n, Prenom: p, Email: modal.querySelector('#cpp-email').value.trim(), Telephone: modal.querySelector('#cpp-tel').value.trim(), Poste2: Number(poste.dataset.id) || null }; try { let id; if (editing) { if (person?.id == null) throw new Error('Identifiant de la personne indisponible.'); await updateRecord(person.id, fields); id = person.id; } else { const result = await addRecord(fields); id = extractAddedRecordId(result); if (!id) { const found = tableRows('Annuaire').filter(row => row.NOM === n && row.Prenom === p).pop(); id = found?.id; } if (!id) throw new Error('La personne a été créée mais son identifiant n’a pas pu être retrouvé.'); } if (originInput) { originInput.value = `${p} ${n}`; originInput.dataset.id = String(id); } const annuaire = tableRows('Annuaire'); const updated = { ...(person || {}), ...fields, id: Number(id) }; if (global.CoreState?.setTable) global.CoreState.setTable('Annuaire', editing ? annuaire.map(row => Number(row.id) === Number(id) ? updated : row) : [...annuaire, updated]); close(); } catch (e) { button.disabled = false; error.textContent = `${editing ? 'Modification' : 'Création'} impossible : ${e?.message || 'erreur inconnue'}`; } }; modal.querySelector('#cpp-nom').focus(); return modal; }
  function openCreatePersonModal(initialName = '', originInput) { return openPersonModal({ mode: 'create', initialName, originInput }); }
  function openEditPersonModal(person, originInput) { return openPersonModal({ mode: 'edit', person, originInput }); }
  function ensureCreateAction(input) { if (!input || !personRefKeys.has(input.dataset.ref)) return; const list = input.parentElement?.querySelector('.cp-ref-list'); if (!list || list.querySelector('[data-create-person], [data-cp-create-person]') || list.querySelector('button[data-id]')) return; const button = document.createElement('button'); button.type = 'button'; button.dataset.cpCreatePerson = 'true'; button.textContent = `+ Créer "${input.value.trim()}"`; button.onclick = () => global.openCreatePersonModal(input.value.trim(), input); list.appendChild(button); list.classList.remove('cp-hidden'); }
  global.openPersonModal = openPersonModal;
  global.openCreatePersonModal = openCreatePersonModal;
  global.openEditPersonModal = openEditPersonModal;
  global.ensureCreatePersonAction = ensureCreateAction;
}(window));