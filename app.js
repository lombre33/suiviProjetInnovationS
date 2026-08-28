/* =========================================================
   LOGIQUE METIER DE L’APPLICATION
   ========================================================= */

const state = window.CoreState;
const { debugLog, debugError, showToast, toRecords, findLabelForRef, gristDateToInput, inputDateToGrist } = window.CoreUtils;
const { getTable, refreshTable } = window.CoreGrist;

CoreGrist.ready();

debugLog('Script chargé, initialisation Grist...');
debugLog('Appel de CoreGrist.loadAllTables()...');
CoreGrist.loadAllTables()
  .then(() => {
    debugLog('🎉 Tous les chargements terminés, rendu de la liste...');
    renderProjectsList();
  })
  .catch(err => {
    debugError('Erreur de chargement des tables', err);
    showToast('Erreur de chargement des tables : ' + err.message, true);
  });

/* =========================================================
   CASCADE STRUCTURE → TUTELLE (Utilise Toutes_les_tutelles)
   ========================================================= */

function getTutellesForStructure(structureId) {
  debugLog('=== DEBUG DEBUT getTutellesForStructure ===', { structureId });
  
  // ⭐ Debug 1: Vérifie que la table existe
  debugLog('state.tables.Structures existe ?', { 
    exists: !!state.tables.Structures,
    type: typeof state.tables.Structures,
    keys: state.tables.Structures ? Object.keys(state.tables.Structures).slice(0, 5) : 'N/A'
  });

  const records = toRecords(state.tables.Structures);
  
  // ⭐ Debug 2: Affiche tous les records
  debugLog('Toutes les Structures après toRecords()', { 
    count: records.length,
    allRecords: records.map(s => ({ 
      id: s.id, 
      Nom_Structure: s.Nom_Structure,
      Nom_Complet: s.Nom_Complet,
      Acronyme: s.Acronyme,
      keys: Object.keys(s).slice(0, 10)
    }))
  });

  // ⭐ Debug 3: Cherche la structure 78
  debugLog('Cherche structure ID 78...', {});
  const structure = records.find(s => {
    debugLog(`Compare: s.id=${s.id} vs structureId=${structureId}`, { match: s.id === structureId });
    return s.id === structureId;
  });

  debugLog('Résultat de la recherche', { found: !!structure, structure });

  if (!structure) {
    debugLog('❌ Structure non trouvée !', { structureId });
    return [];
  }

  // ⭐ Debug 4: Affiche TOUTES les colonnes de la structure
  debugLog('Colonnes de la structure trouvée', { 
    allKeys: Object.keys(structure),
    allValues: structure
  });

  // ⭐ Debug 5: Cherche la colonne tutelles
  const tutelleRefs = structure.Toutes_les_tutueles || structure.Toutes_les_tutelles || [];
  
  debugLog('Tutelles trouvées', { tutelleRefs, count: tutelleRefs.length });
  
  return tutelleRefs;
}
function updateCascadeTarget(targetField, sourceRecId) {
  // 1. Trouve la structure
  const structures = toRecords(state.tables.Structures);
  const structure = structures.find(s => s.id === sourceRecId);
  
  if (!structure) {
    debugLog('❌ Structure non trouvée', { sourceRecId });
    return;
  }

  debugLog('Structure trouvée', { 
    id: structure.id,
    name: structure.Nom_Structure,
    tutellesRaw: structure.Toutes_les_tutelles
  });

  // 2. Récupère les tutelles (peu importe le format)
  const tutelles = structure.Toutes_les_tutelles || [];
  
  debugLog('Tutelles à filtrer', { count: tutelles.length, tutelles });

  // 3. Stocke dans le container
  const tutelleContainer = document.querySelector(`.search-select[data-field="${targetField}"]`);
  if (tutelleContainer) {
    tutelleContainer._allowedTutelleIds = tutelles;
  }
}

/* =========================================================
   COMPOSANT GENERIQUE : SearchSelect
   ========================================================= */

function initSearchSelect(container) {
  if (!container) {
    console.warn('initSearchSelect: container est null');
    return;
  }

  const field = container.dataset.field;
  const tableName = container.dataset.table;
  const displayField = container.dataset.display;
  const isChoice = tableName === '__choice__';
  const choices = isChoice ? (container.dataset.choices || '').split(',') : null;
  const defaultVal = container.dataset.default || '';

  debugLog(`initSearchSelect: ${field} (table: ${tableName})`);

  container.innerHTML = `
    <input type="text" class="ss-input" placeholder="Rechercher ou sélectionner..." autocomplete="off">
    <div class="ss-dropdown hidden"></div>
  `;

  const input = container.querySelector('.ss-input');
  const dropdown = container.querySelector('.ss-dropdown');

  let selectedId = null;
  let selectedLabel = '';

  if (defaultVal) {
    selectedLabel = defaultVal;
    input.value = defaultVal;
    input.classList.add('has-value');
    state.formValues[field] = defaultVal;
  }

  function getOptions(query) {
    if (isChoice) {
      return choices
        .filter(c => c.toLowerCase().includes(query.toLowerCase()))
        .map(c => ({ id: c, label: c }));
    }
    
    let records = toRecords(state.tables[tableName] || {});
    
    // ⭐ Si c'est un champ Tutelle, filtrer par les tutelles autorisées
    const isTutelleField = field.includes('Tutuelle') || field.includes('Tutelle');
if (isTutelleField && container._allowedTutelleIds && container._allowedTutelleIds.length > 0) {
  // ⭐ Convertir les références en IDs si nécessaire
  const allowedIds = container._allowedTutelleIds.map(t => 
    typeof t === 'object' ? t.id : t
  );
  
  debugLog('Filtre Tutelle - IDs autorisés', { allowedIds, recordsCount: records.length });
  
  records = records.filter(r => allowedIds.includes(r.id));
  debugLog(`getOptions filtrées pour Tutelle`, { count: records.length, filtered: records.map(r => r.Acronyme) });
}
    
    return records
      .filter(r => (r[displayField] || '').toLowerCase().includes(query.toLowerCase()))
      .map(r => ({ id: r.id, label: r[displayField] || `#${r.id}` }));
  }

  function renderDropdown(query) {
    const options = getOptions(query);
    dropdown.innerHTML = '';

    if (options.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ss-empty';
      empty.textContent = 'Aucun résultat';
      dropdown.appendChild(empty);
    } else {
      options.slice(0, 30).forEach(opt => {
        const div = document.createElement('div');
        div.className = 'ss-option';
        div.textContent = opt.label;
        div.addEventListener('click', () => {
          selectedId = opt.id;
          selectedLabel = opt.label;
          input.value = opt.label;
          input.classList.add('has-value');
          state.formValues[field] = opt.id;
          dropdown.classList.add('hidden');

          // ⭐ Si c'est Structure, déclenche la cascade vers Tutelle
          if (field === 'npp-Structure2' || field.includes('Structure')) {
            debugLog(`Cascade triggered: ${field} → npp-Tutuelle`, { structureId: selectedId });
            updateCascadeTarget('npp-Tutuelle', selectedId);
          }
        });
        dropdown.appendChild(div);
      });
    }

    dropdown.classList.remove('hidden');
  }

  input.addEventListener('focus', () => renderDropdown(input.value === selectedLabel ? '' : input.value));
  input.addEventListener('input', () => {
    input.classList.remove('has-value');
    selectedId = null;
    state.formValues[field] = null;
    renderDropdown(input.value);
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });

  container._getValue = () => state.formValues[field];
  container._setValue = (id, label) => {
    selectedId = id;
    selectedLabel = label;
    input.value = label || '';
    if (label) {
      input.classList.add('has-value');
    } else {
      input.classList.remove('has-value');
    }
    state.formValues[field] = id;
  };
}

function initAllSearchSelects(root = document) {
  debugLog('initAllSearchSelects: recherche des .search-select...');
  const containers = root.querySelectorAll('.search-select');
  debugLog(`Trouvé ${containers.length} search-select`);
  containers.forEach(initSearchSelect);
}

/* =========================================================
   COMPOSANT : PersonSelect
   ========================================================= */

function initPersonSelect(container) {
  if (!container) {
    console.warn('initPersonSelect: container est null');
    return;
  }

  const field = container.dataset.field;

  container.innerHTML = `
    <input type="text" class="ss-input" placeholder="Rechercher une personne..." autocomplete="off">
    <div class="ss-dropdown hidden"></div>
  `;

  const input = container.querySelector('.ss-input');
  const dropdown = container.querySelector('.ss-dropdown');

  function renderDropdown(query) {
    const records = toRecords(state.tables.Annuaire);
    const filtered = records.filter(r =>
      (r.nom_et_Prenom || `${r.Prenom} ${r.NOM}`).toLowerCase().includes(query.toLowerCase())
    );

    dropdown.innerHTML = '';

    filtered.slice(0, 20).forEach(rec => {
      const div = document.createElement('div');
      div.className = 'ss-option';
      div.textContent = rec.nom_et_Prenom || `${rec.Prenom} ${rec.NOM}`;
      div.addEventListener('click', () => {
        input.value = div.textContent;
        input.classList.add('has-value');
        state.formValues[field] = rec.id;
        dropdown.classList.add('hidden');
      });
      dropdown.appendChild(div);
    });

    const createOpt = document.createElement('div');
    createOpt.className = 'ss-option ss-create';
    createOpt.textContent = `+ Créer une nouvelle personne${query ? ' "' + query + '"' : ''}`;
    createOpt.addEventListener('click', () => {
      dropdown.classList.add('hidden');
      openPersonModal(field, query);
    });
    dropdown.appendChild(createOpt);

    dropdown.classList.remove('hidden');
  }

  let openedEditOnFocus = false;
  const openSelectedPersonForEdit = (e) => {
    const personId = state.formValues[field];
    if (input.classList.contains('has-value') && personId) {
      e.preventDefault();
      e.stopPropagation();
      dropdown.classList.add('hidden');
      openPersonModal(field, null, personId);
      return true;
    }
    return false;
  };

  input.addEventListener('focus', (e) => {
    if (openSelectedPersonForEdit(e)) openedEditOnFocus = true;
    else renderDropdown('');
  });
  input.addEventListener('click', (e) => {
    if (openedEditOnFocus) {
      openedEditOnFocus = false;
      return;
    }
    openSelectedPersonForEdit(e);
  });
  input.addEventListener('input', () => {
    input.classList.remove('has-value');
    state.formValues[field] = null;
    renderDropdown(input.value);
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) dropdown.classList.add('hidden');
  });

  container._setValue = (id, label) => {
    input.value = label;
    input.classList.add('has-value');
    state.formValues[field] = id;
  };
}

function initAllPersonSelects(root = document) {
  debugLog('initAllPersonSelects: recherche des .person-select...');
  const containers = root.querySelectorAll('.person-select');
  debugLog(`Trouvé ${containers.length} person-select`);
  containers.forEach(initPersonSelect);
}

/* =========================================================
   MODALE : CREATION D'UNE PERSONNE
   ========================================================= */

function openPersonModal(targetField, prefillQuery, editPersonId = null) {
  debugLog(`openPersonModal: ${targetField}`, { prefillQuery, editPersonId });
  state.personTargetField = targetField;
  state.editingPersonId = editPersonId || null;

  const modal = document.getElementById('modal-person');
  if (!modal) {
    debugError('openPersonModal', 'modal-person introuvable');
    return;
  }
  modal.classList.remove('hidden');

  const fields = ['np-Prenom', 'np-NOM', 'np-Email', 'np-Telephone', 'npp-Titre', 'npp-Precisions_Poste', 'npp-Mission_Principale', 'npp-Date_de_fin'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const existingRadio = document.querySelector('input[name="poste-mode"][value="existing"]');
  if (existingRadio) existingRadio.checked = true;
  const existingBlock = document.getElementById('poste-existing-block');
  const newBlock = document.getElementById('poste-new-block');
  if (existingBlock) existingBlock.classList.remove('hidden');
  if (newBlock) newBlock.classList.add('hidden');

  initAllSearchSelects(modal);

  const modalTitle = document.getElementById('modal-person-title');
  const saveButton = document.getElementById('btn-save-person');
  if (editPersonId) {
    const person = toRecords(state.tables.Annuaire).find(r => r.id === editPersonId);
    if (person) {
      document.getElementById('np-Prenom').value = person.Prenom || '';
      document.getElementById('np-NOM').value = person.NOM || '';
      document.getElementById('np-Email').value = person.Email || '';
      document.getElementById('np-Telephone').value = person.Telephone || '';
      const poste = toRecords(state.tables.Postes2).find(r => r.id === person.Poste2);
      const posteContainer = document.querySelector('#poste-existing-block .search-select[data-field="np-Poste2"]');
      if (poste && posteContainer?._setValue) {
        posteContainer._setValue(poste.id, poste.Nom_du_poste || poste.Titre || `#${poste.id}`);
      }
    }
    if (modalTitle) modalTitle.textContent = 'Modifier la personne';
    if (saveButton) saveButton.textContent = 'Enregistrer les modifications';
  } else {
    if (prefillQuery) {
      const parts = prefillQuery.trim().split(' ');
      if (parts.length >= 2) {
        document.getElementById('np-Prenom').value = parts[0];
        document.getElementById('np-NOM').value = parts.slice(1).join(' ');
      } else {
        document.getElementById('np-NOM').value = prefillQuery;
      }
    }
    if (modalTitle) modalTitle.textContent = "Ajouter une personne";
    if (saveButton) saveButton.textContent = 'Créer la personne';
  }
}

const btnCancelPerson = document.getElementById('btn-cancel-person');
if (btnCancelPerson) {
  btnCancelPerson.addEventListener('click', () => {
    debugLog('Fermeture modal personne');
    const modal = document.getElementById('modal-person');
    if (modal) modal.classList.add('hidden');
    state.editingPersonId = null;
    state.personTargetField = null;
  });
}

document.querySelectorAll('input[name="poste-mode"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    debugLog('poste-mode changed', { value: e.target.value });
    const isNew = e.target.value === 'new';
    const existingBlock = document.getElementById('poste-existing-block');
    const newBlock = document.getElementById('poste-new-block');
    if (existingBlock) existingBlock.classList.toggle('hidden', isNew);
    if (newBlock) newBlock.classList.toggle('hidden', !isNew);
    
    // ⭐ Réinitialiser les search-selects du bloc new
    if (isNew) {
      initAllSearchSelects(newBlock);
    }
  });
});

const btnSavePerson = document.getElementById('btn-save-person');
if (btnSavePerson) {
  btnSavePerson.addEventListener('click', async () => {
    debugLog('Sauvegarde personne...');
    const prenom = (document.getElementById('np-Prenom')?.value || '').trim();
    const nom = (document.getElementById('np-NOM')?.value || '').trim();

    if (!prenom || !nom) {
      showToast('Le prénom et le nom sont obligatoires.', true);
      return;
    }

    const posteMode = document.querySelector('input[name="poste-mode"]:checked')?.value;
    let posteId = null;

    try {
      if (posteMode === 'new') {
        const titre = (document.getElementById('npp-Titre')?.value || '').trim();
        const structureContainer = document.querySelector('#poste-new-block .search-select[data-field="npp-Structure2"]');
        const structureId = structureContainer?._getValue?.();
        const tutelleContainer = document.querySelector('#poste-new-block .search-select[data-field="npp-Tutuelle"]');
        const tutelleId = tutelleContainer?._getValue?.();

        if (!titre || !structureId) {
          showToast('Titre du poste et Structure sont obligatoires pour créer un nouveau poste.', true);
          return;
        }

        const posteFields = {
          Titre: titre,
          Precisions_Poste: (document.getElementById('npp-Precisions_Poste')?.value || '').trim(),
          Structure2: structureId,
          Mission_Principale: (document.getElementById('npp-Mission_Principale')?.value || '').trim(),
        };

        // ⭐ Ajoute la tutelle si elle est sélectionnée
        if (tutelleId) {
          posteFields.Employeur_tutelle = tutelleId;
        }

        const dateFin = document.getElementById('npp-Date_de_fin')?.value;
        if (dateFin) {
          posteFields.Date_de_fin = Math.floor(new Date(dateFin).getTime() / 1000);
        }

        debugLog('Création nouveau poste', posteFields);
        const result = await grist.docApi.applyUserActions([
          ['AddRecord', 'Postes2', null, posteFields]
        ]);
        posteId = result.retValues[0];
        debugLog('✅ Poste créé', { posteId });

      } else {
        const existingContainer = document.querySelector('#poste-existing-block .search-select[data-field="np-Poste2"]');
        posteId = existingContainer?._getValue?.();
      }

      const annuaireFields = {
        Prenom: prenom,
        NOM: nom,
        Email: (document.getElementById('np-Email')?.value || '').trim(),
        Telephone: (document.getElementById('np-Telephone')?.value || '').trim(),
      };
      if (posteId) annuaireFields.Poste2 = posteId;

      const editingPersonId = state.editingPersonId;
      let savedPersonId;
      if (editingPersonId !== null) {
        debugLog('Mise à jour personne', { editingPersonId, annuaireFields });
        await grist.docApi.applyUserActions([
          ['UpdateRecord', 'Annuaire', editingPersonId, annuaireFields]
        ]);
        savedPersonId = editingPersonId;
      } else {
        debugLog('Création nouvelle personne', annuaireFields);
        const resultPerson = await grist.docApi.applyUserActions([
          ['AddRecord', 'Annuaire', null, annuaireFields]
        ]);
        savedPersonId = resultPerson.retValues[0];
      }
      debugLog(editingPersonId !== null ? '✅ Personne mise à jour' : '✅ Personne créée', { savedPersonId });

      await refreshTable('Annuaire');
      await refreshTable('Postes2');

      const label = `${prenom} ${nom.toUpperCase()}`;
      const targetContainer = document.querySelector(`.person-select[data-field="${state.personTargetField}"]`);
      if (targetContainer && targetContainer._setValue) {
        targetContainer._setValue(savedPersonId, label);
      }

      const modal = document.getElementById('modal-person');
      if (modal) modal.classList.add('hidden');
      showToast(editingPersonId !== null ? `${label} a été modifié(e).` : `${label} a été ajouté(e) à l'annuaire.`);
      state.editingPersonId = null;
      state.personTargetField = null;
      checkEmployeurWarning();

    } catch (err) {
      debugError('Erreur sauvegarde personne', err);
      showToast('Erreur lors de la sauvegarde : ' + err.message, true);
    }
  });
}

/* =========================================================
   VUE LISTE DES PROJETS
   ========================================================= */

function renderProjectsList(filterText = '') {
  debugLog('renderProjectsList', { filterText });
  
  const projects = toRecords(state.tables.Projets);
  debugLog(`${projects.length} projets à afficher`);
  
  const tbody = document.getElementById('projects-tbody');
  if (!tbody) {
    debugError('renderProjectsList', 'projects-tbody non trouvé');
    return;
  }
  tbody.innerHTML = '';

  const filtered = projects.filter(p => {
    const haystack = `${p.Acronyme || ''} ${p.Projet || ''}`.toLowerCase();
    return haystack.includes(filterText.toLowerCase());
  });

  if (filtered.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5" class="ss-empty">Aucun projet trouvé.</td>`;
    tbody.appendChild(tr);
    return;
  }

  filtered.forEach(p => {
    const tr = document.createElement('tr');
    tr.className = 'row-clickable';

    const programmeLabel = findLabelForRef('Programmes', p.Programme, 'Programme');
    const porteurLabel = findLabelForRef('Annuaire', p.Porteur_1, 'nom_et_Prenom')
      || findLabelForRef('Annuaire', p.Porteur_1, 'NOM');

    tr.innerHTML = `
      <td>${p.Acronyme || ''}</td>
      <td>${p.Projet || ''}</td>
      <td>${programmeLabel}</td>
      <td>${porteurLabel}</td>
      <td>${p.Statut_operationnel_projet || ''}</td>
    `;
    tr.addEventListener('click', () => openProjectView(p.id));
    tbody.appendChild(tr);
  });
}

const searchInput = document.getElementById('search-projects');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    renderProjectsList(e.target.value);
  });
}

const FINANCIAL_FIELDS = {
  2026: ['c2026_M10_Fonctionnement', 'c2026_M20_Investissement', 'c2026_M30_Personnel'],
  2027: ['c2027_M10_Fonctionnement', 'c2027_M20_Investissement', 'c2027_M30_Personnel'],
  2028: ['c2028_M10_Fonctionnement', 'c2028_M20_Investissement', 'c2028_M30_Personnel'],
};

function updateFinancialTotals() {
  Object.entries(FINANCIAL_FIELDS).forEach(([year, fields]) => {
    const total = fields.reduce((sum, field) => {
      const value = Number(document.getElementById(`f-${field}`)?.value);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
    const output = document.getElementById(`financial-total-${year}`);
    if (output) output.textContent = total.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  });
}

function resetProjectExtraFields() {
  ['f-Date_limite_financement', 'f-Date_debut_Projet', 'f-Date_de_fin_Projet'].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.value = '';
  });
  const defaults = {
    'f-Details_depense_s_Fonctionnement': 'Depenses de fonctionnement',
    'f-Details_depense_s_Investissement': "Dépenses d'investissement",
    'f-Details_depense_s_Personnel': 'Depenses de personnel',
  };
  Object.entries(defaults).forEach(([id, value]) => { const input = document.getElementById(id); if (input) input.value = value; });
  Object.values(FINANCIAL_FIELDS).flat().forEach(field => { const input = document.getElementById(`f-${field}`); if (input) input.value = ''; });
  updateFinancialTotals();
}

/* =========================================================
   VUE FICHE PROJET
   ========================================================= */

function openProjectView(projectId = null) {
  debugLog('openProjectView', { projectId });
  
  state.currentProjectId = projectId;
  state.formValues = {};

  const viewList = document.getElementById('view-list');
  const viewProject = document.getElementById('view-project');
  if (viewList) viewList.classList.add('hidden');
  if (viewProject) viewProject.classList.remove('hidden');

  const title = document.getElementById('project-title');
  if (!title) {
    debugError('openProjectView', 'project-title non trouvé');
    return;
  }

  const fProjet = document.getElementById('f-Projet');
  const fAcronyme = document.getElementById('f-Acronyme');
  const fCommentaire = document.getElementById('f-comentaire_general_Suivi_projet');
  if (fProjet) fProjet.value = '';
  if (fAcronyme) fAcronyme.value = '';
  if (fCommentaire) fCommentaire.value = '';
  resetProjectExtraFields();

  initAllSearchSelects(viewProject);
  initAllPersonSelects(viewProject);

  if (projectId) {
    title.textContent = 'Édition du projet';
    const rec = toRecords(state.tables.Projets).find(p => p.id === projectId);
    if (rec) fillProjectForm(rec);
  } else {
    title.textContent = 'Nouveau projet';
  }

  const warning = document.getElementById('employeur-warning');
  if (warning) warning.classList.add('hidden');
}

function fillProjectForm(rec) {
  debugLog('fillProjectForm', { recId: rec.id });
  
  const fProjet = document.getElementById('f-Projet');
  const fAcronyme = document.getElementById('f-Acronyme');
  const fCommentaire = document.getElementById('f-comentaire_general_Suivi_projet');
  if (fProjet) fProjet.value = rec.Projet || '';
  if (fAcronyme) fAcronyme.value = rec.Acronyme || '';
  if (fCommentaire) fCommentaire.value = rec.comentaire_general_Suivi_projet || '';
  document.getElementById('f-Date_limite_financement').value = gristDateToInput(rec.Date_limite_financement);
  document.getElementById('f-Date_debut_Projet').value = gristDateToInput(rec.Date_debut_Projet);
  document.getElementById('f-Date_de_fin_Projet').value = gristDateToInput(rec.Date_de_fin_Projet);
  ['Details_depense_s_Fonctionnement', 'Details_depense_s_Investissement', 'Details_depense_s_Personnel'].forEach(field => {
    const input = document.getElementById(`f-${field}`);
    if (input) input.value = rec[field] || input.value;
  });
  Object.values(FINANCIAL_FIELDS).flat().forEach(field => {
    const input = document.getElementById(`f-${field}`);
    if (input) input.value = rec[field] ?? '';
  });
  updateFinancialTotals();

  const setRef = (field, id, tableName, displayField) => {
    const container = document.querySelector(`.search-select[data-field="${field}"]`);
    if (!container) {
      debugLog(`setRef: container non trouvé pour ${field}`);
      return;
    }
    const label = findLabelForRef(tableName, id, displayField);
    if (container._setValue) container._setValue(id, label);
  };

  setRef('Programme', rec.Programme, 'Programmes', 'Programme');
  setRef('Instance_ratachee', rec.Instance_ratachee, 'Suivi_Instance', 'Nom');
  
  const containerType = document.querySelector('.search-select[data-field="Type_projet"]');
  if (containerType && containerType._setValue) containerType._setValue(rec.Type_projet, rec.Type_projet);
  
  const containerStatut = document.querySelector('.search-select[data-field="Statut_operationnel_projet"]');
  if (containerStatut && containerStatut._setValue) containerStatut._setValue(rec.Statut_operationnel_projet, rec.Statut_operationnel_projet);

  const setPerson = (field, id) => {
    const container = document.querySelector(`.person-select[data-field="${field}"]`);
    if (!container) {
      debugLog(`setPerson: container non trouvé pour ${field}`);
      return;
    }
    const label = findLabelForRef('Annuaire', id, 'nom_et_Prenom') || '';
    if (container._setValue) container._setValue(id, label);
  };

  setPerson('Porteur_1', rec.Porteur_1);
  setPerson('Porteur_2', rec.Porteur_2);
  setPerson('Porteur_3', rec.Porteur_3);
  setPerson('VP_porteur_2', rec.VP_porteur_2);
  setPerson('Accompagnateur', rec.Accompagnateur);

  checkEmployeurWarning();
}

const btnBack = document.getElementById('btn-back');
if (btnBack) {
  btnBack.addEventListener('click', () => {
    debugLog('Retour à la liste');
    const viewList = document.getElementById('view-list');
    const viewProject = document.getElementById('view-project');
    if (viewProject) viewProject.classList.add('hidden');
    if (viewList) viewList.classList.remove('hidden');
  });
}

const btnNewProject = document.getElementById('btn-new-project');
if (btnNewProject) {
  btnNewProject.addEventListener('click', () => {
    debugLog('Création nouveau projet');
    openProjectView(null);
  });
}

function checkEmployeurWarning() {
  const banner = document.getElementById('employeur-warning');
  if (!banner) return;
  
  const porteurFields = ['Porteur_1', 'Porteur_2', 'Porteur_3'];
  let hasExternal = false;

  for (const field of porteurFields) {
    const id = state.formValues[field];
    if (!id) continue;
    const personne = toRecords(state.tables.Annuaire).find(r => r.id === id);
    if (!personne || !personne.Poste2) continue;
    const poste = toRecords(state.tables.Postes2).find(p => p.id === personne.Poste2);
    if (!poste || !poste.Employeur_tutelle) continue;
    hasExternal = true;
  }

  banner.classList.toggle('hidden', !hasExternal);
}

/* =========================================================
   ENREGISTREMENT DU PROJET
   ========================================================= */

const btnSaveProject = document.getElementById('btn-save-project');
if (btnSaveProject) {
  btnSaveProject.addEventListener('click', async () => {
    debugLog('Sauvegarde projet...');
    
    const projetNom = (document.getElementById('f-Projet')?.value || '').trim();
    const acronyme = (document.getElementById('f-Acronyme')?.value || '').trim();
    const programmeContainer = document.querySelector('.search-select[data-field="Programme"]');
    const programmeId = programmeContainer?._getValue?.();
    const porteur1Id = state.formValues['Porteur_1'];

    if (!projetNom || !acronyme || !programmeId || !porteur1Id) {
      showToast('Merci de renseigner au minimum : Nom du projet, Acronyme, Programme et Porteur 1.', true);
      return;
    }

    const fields = {
      Projet: projetNom,
      Acronyme: acronyme,
      comentaire_general_Suivi_projet: (document.getElementById('f-comentaire_general_Suivi_projet')?.value || '').trim(),
      Programme: programmeId,
      Type_projet: state.formValues['Type_projet'] || '',
      Statut_operationnel_projet: state.formValues['Statut_operationnel_projet'] || 'En attente des dispo des fonds',
      Porteur_1: state.formValues['Porteur_1'] || null,
      Porteur_2: state.formValues['Porteur_2'] || null,
      Porteur_3: state.formValues['Porteur_3'] || null,
      VP_porteur_2: state.formValues['VP_porteur_2'] || null,
      Accompagnateur: state.formValues['Accompagnateur'] || null,
      Instance_ratachee: state.formValues['Instance_ratachee'] || null,
      Date_limite_financement: inputDateToGrist('f-Date_limite_financement'),
      Date_debut_Projet: inputDateToGrist('f-Date_debut_Projet'),
      Date_de_fin_Projet: inputDateToGrist('f-Date_de_fin_Projet'),
      Details_depense_s_Fonctionnement: document.getElementById('f-Details_depense_s_Fonctionnement')?.value || 'Depenses de fonctionnement',
      Details_depense_s_Investissement: document.getElementById('f-Details_depense_s_Investissement')?.value || "Dépenses d'investissement",
      Details_depense_s_Personnel: document.getElementById('f-Details_depense_s_Personnel')?.value || 'Depenses de personnel',
      ...Object.values(FINANCIAL_FIELDS).flat().reduce((result, field) => {
        const value = document.getElementById(`f-${field}`)?.value;
        result[field] = value === '' || value === undefined ? null : Number(value);
        return result;
      }, {}),
    };

    try {
      if (state.currentProjectId) {
        debugLog('UpdateRecord', { projectId: state.currentProjectId });
        await grist.docApi.applyUserActions([
          ['UpdateRecord', 'Projets', state.currentProjectId, fields]
        ]);
        showToast('Projet mis à jour.');
      } else {
        debugLog('AddRecord Projets', { fields });
        await grist.docApi.applyUserActions([
          ['AddRecord', 'Projets', null, fields]
        ]);
        showToast('Projet créé.');
      }

      await refreshTable('Projets');
      const viewList = document.getElementById('view-list');
      const viewProject = document.getElementById('view-project');
      if (viewProject) viewProject.classList.add('hidden');
      if (viewList) viewList.classList.remove('hidden');
      renderProjectsList();

    } catch (err) {
      debugError('Erreur sauvegarde projet', err);
      showToast('Erreur lors de l\'enregistrement : ' + err.message, true);
    }
  });
}

document.querySelectorAll('.financial-amount').forEach(input => input.addEventListener('input', updateFinancialTotals));
updateFinancialTotals();

/* =========================================================
   ONGLETS
   ========================================================= */

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    debugLog('Tab click', { tab: btn.dataset.tab });
    
    if (btn.classList.contains('disabled')) {
      showToast('Cet onglet sera disponible dans une prochaine version.');
      return;
    }
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const tabContent = document.getElementById('tab-' + btn.dataset.tab);
    if (tabContent) tabContent.classList.add('active');
  });
});

debugLog('🎊 Script entièrement initialisé');
