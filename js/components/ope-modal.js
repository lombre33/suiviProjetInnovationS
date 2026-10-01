/* Création d'une ligne OPE (table EcritureComptables) à la volée, depuis le champ
   "Ligne OPE" de l'onglet Dates & OPE de la modale Projet — même patron que le
   "+ Créer" du champ Porteur (person-modal.js) : refField() (project-modal.js)
   propose ce bouton quand la recherche ne correspond à aucune ligne existante. */
(function (global) {
  'use strict';

  const text = value => value == null ? '' : String(value);
  const rows = name => global.CoreState && typeof global.CoreState.getTable === 'function'
    ? (global.CoreState.getTable(name) || []) : [];
  const esc = value => global.CoreUtils.escapeHtml(value);
  const extractAddedRecordId = response => global.CoreUtils.extractAddedRecordId(response);

  const api = () => {
    const value = global.CoreGrist?.gristInstance;
    if (!value) throw new Error('API Grist indisponible. Rechargez la page puis réessayez.');
    return value;
  };

  function addRecord(fields) {
    return api().docApi.applyUserActions([['AddRecord', 'EcritureComptables', null, fields]]);
  }

  function openCreateOpeModal(initialName = '', originInput) {
    const old = document.getElementById('cp-ope-modal');
    if (old) old.remove();
    const modal = document.createElement('div');
    modal.id = 'cp-ope-modal';
    modal.className = 'cp-modal cp-person-modal cp-poste-modal';
    modal.innerHTML = `<div class="cp-box" role="dialog" aria-modal="true">` +
      `<div class="cp-head"><h2>Créer une ligne OPE</h2><button type="button" data-cp-close aria-label="Fermer">×</button></div>` +
      `<div class="cp-body"><div class="cp-grid" id="cpo-form"></div></div>` +
      `<p class="cp-error" role="alert"></p>` +
      `<div class="cp-actions"><button type="button" data-cp-cancel>Annuler</button><button type="button" data-cp-save>Créer la ligne</button></div>` +
      `</div>`;
    document.body.appendChild(modal);
    const form = modal.querySelector('#cpo-form');

    const opeWrap = document.createElement('div');
    opeWrap.className = 'cp-field cp-full';
    opeWrap.innerHTML = '<label for="cpo-nope">N° de ligne OPE *</label><input id="cpo-nope" type="text" required>';
    form.appendChild(opeWrap);
    const opeInput = opeWrap.querySelector('input');
    opeInput.value = text(initialName).trim();

    // "installé chez" : sélection parmi les Structures existantes seulement (jamais de
    // texte libre sur un champ référence, cf. memory grist-referenceList-vs-reference-fixe),
    // triée par Acronyme pour rester facilement repérable dans une liste potentiellement longue.
    const structures = rows('Structures').slice().sort((a, b) => text(a.Acronyme).localeCompare(text(b.Acronyme), 'fr'));
    const structureWrap = document.createElement('div');
    structureWrap.className = 'cp-field cp-full';
    structureWrap.innerHTML = `<label for="cpo-structure">Installée chez</label><select id="cpo-structure"><option value="">— Sélectionner —</option>${structures.map(s => `<option value="${esc(s.id)}">${esc(text(s.Acronyme))}</option>`).join('')}</select>`;
    form.appendChild(structureWrap);
    const structureSelect = structureWrap.querySelector('select');

    const close = () => modal.remove();
    modal.querySelector('[data-cp-close]').onclick = close;
    modal.querySelector('[data-cp-cancel]').onclick = close;

    modal.querySelector('[data-cp-save]').onclick = async () => {
      const error = modal.querySelector('.cp-error'), button = modal.querySelector('[data-cp-save]');
      const nOpe = opeInput.value.trim();
      if (!nOpe) {
        error.textContent = 'Le numéro de la ligne OPE est obligatoire.';
        return;
      }
      button.disabled = true;
      error.textContent = '';
      try {
        const installeChez = Number(structureSelect.value) || null;
        const fields = { N_OPE: nOpe, installe_chez: installeChez };
        const result = await addRecord(fields);
        const current = rows('EcritureComptables');
        let id = extractAddedRecordId(result);
        if (!id) {
          const found = current.filter(row => row.N_OPE === nOpe).pop();
          id = found?.id;
        }
        if (!id) throw new Error('La ligne OPE a été créée mais son identifiant n’a pas pu être retrouvé.');

        const updated = { N_OPE: nOpe, installe_chez: installeChez, id: Number(id) };
        if (global.CoreState?.setTable) {
          global.CoreState.setTable('EcritureComptables', [...current, updated]);
        }
        if (originInput) {
          originInput.value = nOpe;
          originInput.dataset.id = String(id);
          originInput._cpRefSync?.();
        }
        close();
      } catch (e) {
        button.disabled = false;
        error.textContent = `Création impossible : ${e?.message || 'erreur inconnue'}`;
      }
    };

    opeInput.focus();
    return modal;
  }

  global.openCreateOpeModal = openCreateOpeModal;
}(window));
