(function (global) {
  'use strict';

  const tableRows = name => {
    const tables = global.CoreState && typeof global.CoreState.getTable === 'function'
      ? global.CoreState.getTable(name) : undefined;
    return Array.isArray(tables) ? tables : [];
  };
  const text = value => value == null ? '' : String(value);
  const escapeHtml = value => text(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label = (row, fields) => { for (const field of fields) if (row && row[field] != null && text(row[field])) return text(row[field]); return row?.id == null ? '' : text(row.id); };

  function addRecord(fields) {
    const api = global.CoreGrist?.gristInstance;
    if (!api) throw new Error('API Grist indisponible. Rechargez la page puis réessayez.');
    return api.docApi.applyUserActions([['AddRecord', 'Annuaire', null, fields]]);
  }

  function searchableField(parent, id, labelText, rows, fields, initialValue) {
    const wrap = document.createElement('div');
    wrap.className = 'cp-field cp-ref';
    wrap.innerHTML = `<label for="${id}">${escapeHtml(labelText)}</label><input id="${id}" autocomplete="off" placeholder="Rechercher…"><div class="cp-ref-list cp-hidden"></div>`;
    const input = wrap.querySelector('input');
    const list = wrap.querySelector('.cp-ref-list');
    if (initialValue) input.value = initialValue;
    const render = () => {
      const query = input.value.trim().toLowerCase();
      const matches = rows().filter(row => label(row, fields).toLowerCase().includes(query)).slice(0, 30);
      list.innerHTML = matches.map(row => `<button type="button" data-id="${escapeHtml(row.id)}">${escapeHtml(label(row, fields))}</button>`).join('');
      list.classList.toggle('cp-hidden', !list.innerHTML);
      list.querySelectorAll('button').forEach(button => button.onclick = () => {
        input.value = button.textContent;
        input.dataset.id = button.dataset.id;
        list.classList.add('cp-hidden');
      });
    };
    input.oninput = () => { delete input.dataset.id; render(); };
    input.onfocus = render;
    input.onblur = () => setTimeout(() => list.classList.add('cp-hidden'), 150);
    parent.appendChild(wrap);
    return input;
  }

  function openCreatePersonModal(initialName = '', originInput) {
    const existing = document.getElementById('cp-person-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'cp-person-modal';
    modal.className = 'cp-modal cp-person-modal';
    modal.innerHTML = `<div class="cp-box" role="dialog" aria-modal="true" aria-labelledby="cpp-title">
      <h2 id="cpp-title">Créer une personne <button type="button" data-cp-close aria-label="Fermer">×</button></h2>
      <div class="cp-grid" id="cpp-form">
        <div class="cp-field"><label for="cpp-nom">Nom *</label><input id="cpp-nom" type="text" required></div>
        <div class="cp-field"><label for="cpp-prenom">Prénom *</label><input id="cpp-prenom" type="text" required></div>
        <div class="cp-field"><label for="cpp-email">Email</label><input id="cpp-email" type="email"></div>
        <div class="cp-field"><label for="cpp-tel">Tel</label><input id="cpp-tel" type="text"></div>
      </div>
      <p class="cp-muted cpp-structure-note">La structure est affichée à titre indicatif : dans Grist, elle est portée par le poste référencé.</p>
      <div class="cp-grid" id="cpp-refs"></div>
      <p class="cp-error" role="alert"></p>
      <div class="cp-actions"><button type="button" data-cp-cancel>Annuler</button><button type="button" data-cp-save>Créer la personne</button></div>
    </div>`;
    document.body.appendChild(modal);
    const nom = modal.querySelector('#cpp-nom');
    const prenom = modal.querySelector('#cpp-prenom');
    const parts = text(initialName).trim().split(/\s+/);
    if (parts.length > 1) { prenom.value = parts.shift(); nom.value = parts.join(' '); } else nom.value = text(initialName).trim();
    const refs = modal.querySelector('#cpp-refs');
    const structure = searchableField(refs, 'cpp-structure', 'Structure (acronyme)', () => tableRows('Structures'), ['Acronyme'], '');
    const poste = searchableField(refs, 'cpp-poste', 'Poste (nom du poste)', () => tableRows('Postes2'), ['Nom_du_poste', 'Titre'], '');
    const close = () => modal.remove();
    modal.querySelector('[data-cp-close]').onclick = close;
    modal.querySelector('[data-cp-cancel]').onclick = close;
    modal.querySelector('[data-cp-save]').onclick = async () => {
      const error = modal.querySelector('.cp-error');
      const n = nom.value.trim(), p = prenom.value.trim();
      if (!n || !p) { error.textContent = 'Le nom et le prénom sont obligatoires.'; return; }
      const button = modal.querySelector('[data-cp-save]');
      button.disabled = true; error.textContent = '';
      try {
        const result = await addRecord({ NOM: n, Prenom: p, Email: modal.querySelector('#cpp-email').value.trim(), Telephone: modal.querySelector('#cpp-tel').value.trim(), Poste2: Number(poste.dataset.id) || null });
        let id = Array.isArray(result) ? result[0] : result;
        if (id && typeof id === 'object') id = id.id;
        if (!id) {
          const fresh = await global.CoreGrist.getTable('Annuaire');
          const found = fresh.filter(row => row.NOM === n && row.Prenom === p).pop();
          id = found?.id;
        }
        if (!id) throw new Error('La personne a été créée mais son identifiant n’a pas pu être retrouvé.');
        const person = { id: Number(id), NOM: n, Prenom: p, Email: modal.querySelector('#cpp-email').value.trim(), Telephone: modal.querySelector('#cpp-tel').value.trim(), Poste2: Number(poste.dataset.id) || null };
        if (originInput) { originInput.value = `${p} ${n}`; originInput.dataset.id = String(id); }
        const annuaire = tableRows('Annuaire');
        if (global.CoreState?.setTable) global.CoreState.setTable('Annuaire', [...annuaire, person]);
        close();
      } catch (e) { button.disabled = false; error.textContent = `Création impossible : ${e?.message || 'erreur inconnue'}`; }
    };
    modal.querySelector('#cpp-nom').focus();
    return modal;
  }
  global.openCreatePersonModal = openCreatePersonModal;
}(window));
