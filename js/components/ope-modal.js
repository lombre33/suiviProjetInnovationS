/* Création d'une ligne OPE (table Lignes_OPE) à la volée, depuis le champ
   "Ligne OPE" de l'onglet Dates & OPE de la modale Projet — même patron que le
   "+ Créer" du champ Porteur (person-modal.js) : refField() (project-modal.js)
   propose ce bouton quand la recherche ne correspond à aucune ligne existante.
   Même modale pour modifier une ligne existante (openEditOpeModal) : la page
   Installation des fonds l'ouvre d'un clic sur le nom de l'OPE d'une carte. */
(function (global) {
  'use strict';

  const text = value => value == null ? '' : String(value);
  const rows = name => global.CoreState && typeof global.CoreState.getTable === 'function'
    ? (global.CoreState.getTable(name) || []) : [];
  const esc = value => global.CoreUtils.escapeHtml(value);
  const extractAddedRecordId = response => global.CoreUtils.extractAddedRecordId(response);
  // Bulle d'aide Grist (description de colonne) — toujours la table Lignes_OPE
  // ici, seule table que cette modale écrit (cf. js/components/help-tooltip.js).
  const withHelp = (labelEl, colId) => global.HelpTooltip?.attach(labelEl, 'Lignes_OPE', colId);

  const api = () => {
    const value = global.CoreGrist?.gristInstance;
    if (!value) throw new Error('API Grist indisponible. Rechargez la page puis réessayez.');
    return value;
  };

  function addRecord(fields) {
    return api().docApi.applyUserActions([['AddRecord', 'Lignes_OPE', null, fields]]);
  }

  function updateRecord(id, fields) {
    return api().docApi.applyUserActions([['UpdateRecord', 'Lignes_OPE', Number(id), fields]]);
  }

  // `existing` : ligne à modifier (mode modification) ; sinon création, avec le texte tapé pour numéro.
  function openOpeModal({ initialName = '', originInput, existing = null, onSaved } = {}) {
    const old = document.getElementById('cp-ope-modal');
    if (old) old.remove();
    const modal = document.createElement('div');
    modal.id = 'cp-ope-modal';
    modal.className = 'cp-modal cp-person-modal cp-poste-modal';
    modal.innerHTML = `<div class="cp-box" role="dialog" aria-modal="true">` +
      `<div class="cp-head"><h2>${existing ? 'Modifier la ligne OPE' : 'Créer une ligne OPE'}</h2><button type="button" data-cp-close aria-label="Fermer">×</button></div>` +
      `<div class="cp-body"><div class="cp-grid" id="cpo-form"></div></div>` +
      `<p class="cp-error" role="alert"></p>` +
      `<div class="cp-actions"><button type="button" data-cp-cancel>Annuler</button><button type="button" data-cp-save>${existing ? 'Enregistrer' : 'Créer la ligne'}</button></div>` +
      `</div>`;
    document.body.appendChild(modal);
    const form = modal.querySelector('#cpo-form');

    const opeWrap = document.createElement('div');
    opeWrap.className = 'cp-field cp-full';
    opeWrap.innerHTML = '<label for="cpo-nope">N° de ligne OPE</label><input id="cpo-nope" type="text" placeholder="Pas encore attribué"><small class="cp-hint">Facultatif tant que la ligne n\'est pas ouverte.</small>';
    withHelp(opeWrap.querySelector('label'), 'N_OPE');
    form.appendChild(opeWrap);
    const opeInput = opeWrap.querySelector('input');
    opeInput.value = existing ? text(existing.N_OPE) : text(initialName).trim();

    // "installé chez" : sélection parmi les Structures existantes seulement (jamais de
    // texte libre sur un champ référence, cf. memory grist-referenceList-vs-reference-fixe),
    // triée par Acronyme pour rester facilement repérable dans une liste potentiellement longue.
    const structures = rows('Structures').slice().sort((a, b) => text(a.Acronyme).localeCompare(text(b.Acronyme), 'fr'));
    const structureWrap = document.createElement('div');
    structureWrap.className = 'cp-field cp-full';
    structureWrap.innerHTML = `<label for="cpo-structure">Installée chez</label><select id="cpo-structure"><option value="">— Sélectionner —</option>${structures.map(s => `<option value="${esc(s.id)}">${esc(text(s.Acronyme))}</option>`).join('')}</select>`;
    structureWrap.insertAdjacentHTML('beforeend', '<small class="cp-hint">Structure où la ligne est ou sera ouverte.</small>');
    withHelp(structureWrap.querySelector('label'), 'installe_chez');
    form.appendChild(structureWrap);
    const structureSelect = structureWrap.querySelector('select');
    if (existing) {
      const chez = existing.installe_chez && typeof existing.installe_chez === 'object' ? existing.installe_chez.id : existing.installe_chez;
      structureSelect.value = chez ? String(chez) : '';
    }

    const close = () => modal.remove();
    modal.querySelector('[data-cp-close]').onclick = close;
    modal.querySelector('[data-cp-cancel]').onclick = close;

    modal.querySelector('[data-cp-save]').onclick = async () => {
      const error = modal.querySelector('.cp-error'), button = modal.querySelector('[data-cp-save]');
      const nOpe = opeInput.value.trim();
      const installeChez = Number(structureSelect.value) || null;
      // Le numéro peut manquer tant que la ligne n'est pas ouverte, à condition de savoir où elle le sera.
      if (!nOpe && !installeChez) {
        error.textContent = 'Renseignez le numéro de la ligne OPE ou, à défaut, la structure où elle sera ouverte (l\'un des deux est obligatoire).';
        return;
      }
      button.disabled = true;
      error.textContent = '';
      try {
        const fields = { N_OPE: nOpe, installe_chez: installeChez };
        if (existing) {
          await updateRecord(existing.id, fields);
          const saved = { ...existing, N_OPE: nOpe, installe_chez: installeChez };
          if (global.CoreState?.setTable) {
            global.CoreState.setTable('Lignes_OPE', rows('Lignes_OPE').map(row => String(row.id) === String(existing.id) ? saved : row));
          }
          close();
          if (typeof onSaved === 'function') onSaved(saved);
          return;
        }
        const result = await addRecord(fields);
        const current = rows('Lignes_OPE');
        let id = extractAddedRecordId(result);
        if (!id && nOpe) {
          const found = current.filter(row => row.N_OPE === nOpe).pop();
          id = found?.id;
        }
        if (!id) throw new Error('La ligne OPE a été créée mais son identifiant n’a pas pu être retrouvé.');

        const updated = { N_OPE: nOpe, installe_chez: installeChez, id: Number(id) };
        if (global.CoreState?.setTable) {
          global.CoreState.setTable('Lignes_OPE', [...current, updated]);
        }
        if (originInput) {
          originInput.value = global.CoreUtils.opeLabel(updated);
          originInput.dataset.id = String(id);
          originInput._cpRefSync?.();
        }
        close();
      } catch (e) {
        button.disabled = false;
        error.textContent = `${existing ? 'Enregistrement' : 'Création'} impossible : ${e?.message || 'erreur inconnue'}`;
      }
    };

    opeInput.focus();
    return modal;
  }

  function openCreateOpeModal(initialName = '', originInput) {
    return openOpeModal({ initialName, originInput });
  }

  // Ouvre la ligne OPE `ligneId` en modification ; `onSaved(ligne)` est appelé une fois enregistrée.
  function openEditOpeModal(ligneId, onSaved) {
    const existing = global.CoreUtils.findById(rows('Lignes_OPE'), ligneId);
    if (!existing) {
      global.CoreUtils.showToast('Ligne OPE introuvable', true);
      return null;
    }
    return openOpeModal({ existing, onSaved });
  }

  global.openCreateOpeModal = openCreateOpeModal;
  global.openEditOpeModal = openEditOpeModal;
}(window));
