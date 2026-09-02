(function (global) {
  'use strict';

  const text = value => value == null ? '' : String(value);
  const tableRows = name => global.CoreState?.getTable ? (global.CoreState.getTable(name) || []) : [];
  const escapeHtml = value => text(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const postLabel = row => text(row?.Nom_du_poste || row?.Titre || row?.id);
  const api = () => {
    const value = global.CoreGrist?.gristInstance;
    if (!value) throw new Error('API Grist indisponible. Rechargez la page puis réessayez.');
    return value;
  };
  const extractId = value => {
    if (value == null) return null;
    if (typeof value === 'number' && value > 0) return value;
    if (Array.isArray(value)) { for (const item of value) { const id = extractId(item); if (id != null) return id; } return null; }
    if (typeof value === 'object') { for (const key of ['id', 'rowId', 'rowID', 'ids', 'retValues', 'result', 'results']) { const id = extractId(value[key]); if (id != null) return id; } }
    return null;
  };
  async function savePoste(mode, poste, name) {
    const action = mode === 'edit'
      ? ['UpdateRecord', 'Postes2', Number(poste.id), { Nom_du_poste: name }]
      : ['AddRecord', 'Postes2', null, { Nom_du_poste: name }];
    return api().docApi.applyUserActions([action]);
  }

  function openPosteModal({ mode = 'create', poste = null, initialName = '', originInput = null } = {}) {
    const existing = document.getElementById('cp-poste-modal');
    if (existing) existing.remove();
    const editing = mode === 'edit';
    const modal = document.createElement('div');
    modal.id = 'cp-poste-modal';
    modal.className = 'cp-modal cp-person-modal';
    modal.innerHTML = `<div class="cp-box" role="dialog" aria-modal="true"><h2>${editing ? 'Modifier un poste' : 'Créer un poste'} <button type="button" data-cp-close>×</button></h2><div class="cp-grid"><div class="cp-field"><label for="cp-poste-name">Nom du poste *</label><input id="cp-poste-name" type="text" required></div></div><p class="cp-error" role="alert"></p><div class="cp-actions"><button type="button" data-cp-cancel>Annuler</button><button type="button" data-cp-save>${editing ? 'Enregistrer les modifications' : 'Créer le poste'}</button></div></div>`;
    document.body.appendChild(modal);
    const input = modal.querySelector('#cp-poste-name');
    input.value = editing ? postLabel(poste) : text(initialName).trim();
    const close = () => modal.remove();
    modal.querySelector('[data-cp-close]').onclick = close;
    modal.querySelector('[data-cp-cancel]').onclick = close;
    modal.querySelector('[data-cp-save]').onclick = async () => {
      const name = input.value.trim();
      const error = modal.querySelector('.cp-error');
      if (!name) { error.textContent = 'Le nom du poste est obligatoire.'; return; }
      const button = modal.querySelector('[data-cp-save]'); button.disabled = true; error.textContent = '';
      try {
        const result = await savePoste(mode, poste, name);
        const id = editing ? poste.id : extractId(result);
        if (!id) throw new Error('Le poste a été enregistré mais son identifiant n’a pas pu être retrouvé.');
        if (originInput) { originInput.value = name; originInput.dataset.id = String(id); }
        const rows = tableRows('Postes2');
        const updated = { ...(poste || {}), id: Number(id), Nom_du_poste: name };
        if (global.CoreState?.setTable) global.CoreState.setTable('Postes2', editing ? rows.map(row => Number(row.id) === Number(id) ? updated : row) : [...rows, updated]);
        close();
      } catch (e) { button.disabled = false; error.textContent = `${editing ? 'Modification' : 'Création'} impossible : ${e?.message || 'erreur inconnue'}`; }
    };
    input.focus();
    return modal;
  }
  global.openPosteModal = openPosteModal;
  global.openCreatePosteModal = (initialName = '', originInput) => openPosteModal({ mode: 'create', initialName, originInput });
  global.openEditPosteModal = (poste, originInput) => openPosteModal({ mode: 'edit', poste, originInput });
}(window));
