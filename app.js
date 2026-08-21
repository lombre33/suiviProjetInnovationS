/* =========================================================
   ETAT GLOBAL
   ========================================================= */
const state = {
  tables: {
    Projets: [],
    Annuaire: [],
    Postes2: [],
    Structures: [],
    Programmes: [],
    Etablissements: [],
  },
  currentProjectId: null,
  formValues: {},
  personTargetField: null,
};

/* =========================================================
   DEBUG HELPERS
   ========================================================= */
function debugLog(msg, data = null) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] ${msg}`, data || '');
}

function debugError(msg, err) {
  const timestamp = new Date().toLocaleTimeString();
  console.error(`[${timestamp}] ❌ ${msg}`, err);
}

/* =========================================================
   INITIALISATION GRIST
   ========================================================= */
debugLog('Script chargé, initialisation Grist...');

// ⭐ PAS de callback, pas d'objet complexe
grist.ready({
  requiredAccess: 'full',
});

debugLog('grist.ready() appelé');

async function loadAllTables() {
  try {
    debugLog('🔄 Début du chargement des tables...');
    
    state.tables.Projets = await grist.docApi.fetchTable('Projets');
    debugLog('✅ Projets chargés', { count: state.tables.Projets.id?.length || 0 });
    
    state.tables.Annuaire = await grist.docApi.fetchTable('Annuaire');
    debugLog('✅ Annuaire chargé', { count: state.tables.Annuaire.id?.length || 0 });
    
    state.tables.Postes2 = await grist.docApi.fetchTable('Postes2');
    debugLog('✅ Postes2 chargés', { count: state.tables.Postes2.id?.length || 0 });
    
    state.tables.Structures = await grist.docApi.fetchTable('Structures');
    debugLog('✅ Structures chargées', { count: state.tables.Structures.id?.length || 0 });
    
    state.tables.Programmes = await grist.docApi.fetchTable('Programmes');
    debugLog('✅ Programmes chargés', { count: state.tables.Programmes.id?.length || 0 });
    
    state.tables.Etablissements = await grist.docApi.fetchTable('Etablissements');
    debugLog('✅ Etablissements chargés', { count: state.tables.Etablissements.id?.length || 0 });
    
    debugLog('🎉 Tous les chargements terminés, rendu de la liste...');
    renderProjectsList();
    
  } catch (err) {
    debugError('Erreur de chargement des tables', err);
    showToast('Erreur de chargement des tables : ' + err.message, true);
  }
}

// ⭐ Appel direct, sans .then(), sans callback
debugLog('Appel de loadAllTables()...');
loadAllTables();

debugLog('Script initialisation terminé');

/* =========================================================
   HELPERS GENERIQUES
   ========================================================= */

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
  if (!columnarTable || !columnarTable.id) {
    return [];
  }
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
  const records = toRecords(state.tables[tableName]);
  const rec = records.find(r => r.id === id);
  if (!rec) return '';
  return rec[displayField] ?? '';
}

/* =========================================================
   CASCADE STRUCTURE → TUTELLE
   ========================================================= */

function updateCascadeTarget(targetField, sourceRecId) {
  debugLog('updateCascadeTarget', { targetField, sourceRecId });
  
  const targetContainer = document.querySelector(`.search-select[data-field="${targetField}"]`);
  if (!targetContainer) {
    debugLog(`updateCascadeTarget: container non trouvé pour ${targetField}`);
    return;
  }

  // Récupère la structure sélectionnée
  const sourceRecord = toRecords(state.tables.Structures).find(r => r.id === sourceRecId);
  if (!sourceRecord) {
    debugLog(`updateCascadeTarget: structure non trouvée`, { sourceRecId });
    return;
  }

  // ⭐ Récupère TOUS les IDs de tutelles de la structure
  const tutelleIds = [];
  const tutelleColumns = [
    'Etablissement_Tutuelle_gestionaire',
    'Co_tutuelle_1_Principale',
    'Co_tutuelle_2_Principale',
    'Tutuelle_Secondaire_1',
    'Tutuelle_Secondaire_2'
  ];

  tutelleColumns.forEach(col => {
    const id = sourceRecord[col];
    if (id && !tutelleIds.includes(id)) {
      tutelleIds.push(id);
    }
  });

  debugLog(`updateCascadeTarget: tutelles trouvées`, { tutelleIds, structureName: sourceRecord.Nom_Structure });

  // ⭐ Récupère les labels des tutelles
  const etablissements = toRecords(state.tables.Etablissements);
  const tutelleLabels = tutelleIds
    .map(id => {
      const etab = etablissements.find(e => e.id === id);
      if (!etab) return null;
      // Affiche Acronyme en priorité, repli sur Nom
      const label = etab.Acronyme || etab.Nom || `#${id}`;
      return { id, label };
    })
    .filter(t => t !== null);

  debugLog(`Tutelles résolues`, tutelleLabels);

  // ⭐ Réinitialise le champ
  targetContainer._setValue(null, '');
  state.formValues[targetField] = null;

  // ⭐ Si une seule tutelle, auto-sélectionne
  if (tutelleLabels.length === 1) {
    const single = tutelleLabels[0];
    targetContainer._setValue(single.id, single.label);
    state.formValues[targetField] = single.id;
    debugLog(`Auto-sélection tutelle unique`, { id: single.id, label: single.label });
  } else if (tutelleLabels.length > 1) {
    // Sinon, force le focus pour afficher le dropdown
    const input = targetContainer.querySelector('.ss-input');
    if (input) {
      input.value = '';
      input.focus();
    }
  }

  // ⭐ Stock les IDs autorisés pour filtrer les options
  targetContainer._allowedTutelleIds = tutelleIds;
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
    
    // ⭐ Si on a des tutelles filtrées, ne montrer que celles-ci
    const isTutelleField = field.includes('Tutuelle') || field.includes('Tutelle');
    if (isTutelleField && container._allowedTutelleIds && container._allowedTutelleIds.length > 0) {
      records = records.filter(r => container._allowedTutelleIds.includes(r.id));
      debugLog(`getOptions filtrées pour Tutelle`, { count: records.length, allowed: container._allowedTutelleIds });
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

          // ⭐ Si c'est le champ Structure, déclenche la cascade vers Tutelle
          if (field === 'npp-Structure2' || field.includes('Structure')) {
            debugLog(`Cascade triggered: ${field} → Tutelle`, { structureId: selectedId });
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

  // ⭐ Store les méthodes directement, pas dans state
  container._getValue = () => state.formValues[field];
  container._setValue = (id, label) => {
    selectedId = id;
    selectedLabel = label;
    input.value = label;
    input.classList.add('has-value');
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

  input.addEventListener('focus', () => renderDropdown(''));
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

function openPersonModal(targetField, prefillQuery) {
  debugLog(`openPersonModal: ${targetField}`, { prefillQuery });
  state.personTargetField = targetField;

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

  if (prefillQuery) {
    const parts = prefillQuery.trim().split(' ');
    if (parts.length >= 2) {
      const prenomEl = document.getElementById('np-Prenom');
      if (prenomEl) prenomEl.value = parts[0];
      const nomEl = document.getElementById('np-NOM');
      if (nomEl) nomEl.value = parts.slice(1).join(' ');
    } else {
      const nomEl = document.getElementById('np-NOM');
      if (nomEl) nomEl.value = prefillQuery;
    }
  }

  const existingRadio = document.querySelector('input[name="poste-mode"][value="existing"]');
  if (existingRadio) existingRadio.checked = true;
  
  const existingBlock = document.getElementById('poste-existing-block');
  const newBlock = document.getElementById('poste-new-block');
  if (existingBlock) existingBlock.classList.remove('hidden');
  if (newBlock) newBlock.classList.add('hidden');

  initAllSearchSelects(modal);
}

const btnCancelPerson = document.getElementById('btn-cancel-person');
if (btnCancelPerson) {
  btnCancelPerson.addEventListener('click', () => {
    debugLog('Fermeture modal personne');
    const modal = document.getElementById('modal-person');
    if (modal) modal.classList.add('hidden');
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
          posteFields.Etablissement_Tutuelle_gestionaire = tutelleId;
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

      debugLog('Création nouvelle personne', annuaireFields);
      const resultPerson = await grist.docApi.applyUserActions([
        ['AddRecord', 'Annuaire', null, annuaireFields]
      ]);
      const newPersonId = resultPerson.retValues[0];
      debugLog('✅ Personne créée', { newPersonId });

      state.tables.Annuaire = await grist.docApi.fetchTable('Annuaire');
      state.tables.Postes2 = await grist.docApi.fetchTable('Postes2');

      const label = `${prenom} ${nom.toUpperCase()}`;
      const targetContainer = document.querySelector(`.person-select[data-field="${state.personTargetField}"]`);
      if (targetContainer && targetContainer._setValue) {
        targetContainer._setValue(newPersonId, label);
      }

      const modal = document.getElementById('modal-person');
      if (modal) modal.classList.add('hidden');
      showToast(`${label} a été ajouté(e) à l'annuaire.`);
      checkEmployeurWarning();

    } catch (err) {
      debugError('Erreur sauvegarde personne', err);
      showToast('Erreur lors de la création : ' + err.message, true);
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

      state.tables.Projets = await grist.docApi.fetchTable('Projets');
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
