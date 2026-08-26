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
    Suivi_Instance: [],
    OPE: [],
  },
  currentProjectId: null,
  formValues: {},
  personTargetField: null,
};

/* =========================================================
   DEBUG & UTILITIES
   ========================================================= */
function debugLog(...args) {
  const timestamp = new Date().toLocaleTimeString('fr-FR');
  console.log(`[${timestamp}]`, ...args);
}

function debugError(label, err) {
  console.error(`❌ ${label}:`, err);
}

function showToast(msg, isError = false) {
  const t = document.getElementById('toast') || createToastElement();
  t.textContent = msg;
  t.classList.remove('hidden');
  t.classList.toggle('error', isError);
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.add('hidden'), 4000);
}

function createToastElement() {
  const t = document.createElement('div');
  t.id = 'toast';
  t.className = 'toast hidden';
  document.body.appendChild(t);
  return t;
}

/* =========================================================
   CHARGEMENT TABLES GRIST
   ========================================================= */
async function loadAllTables() {
  try {
    debugLog('📋 Chargement de toutes les tables...');
    
    state.tables.Projets = await grist.docApi.fetchTable('Projets');
    debugLog('✅ Projets chargés', { count: state.tables.Projets.records?.length || 0 });
    
    state.tables.Annuaire = await grist.docApi.fetchTable('Annuaire');
    debugLog('✅ Annuaire chargés', { count: state.tables.Annuaire.records?.length || 0 });
    
    state.tables.Postes2 = await grist.docApi.fetchTable('Postes2');
    debugLog('✅ Postes2 chargés', { count: state.tables.Postes2.records?.length || 0 });
    
    state.tables.Structures = await grist.docApi.fetchTable('Structures');
    debugLog('✅ Structures chargés', { count: state.tables.Structures.records?.length || 0 });
    
    state.tables.Programmes = await grist.docApi.fetchTable('Programmes');
    debugLog('✅ Programmes chargés', { count: state.tables.Programmes.records?.length || 0 });
    
    state.tables.Etablissements = await grist.docApi.fetchTable('Etablissements');
    debugLog('✅ Etablissements chargés', { count: state.tables.Etablissements.records?.length || 0 });
    
    state.tables.Suivi_Instance = await grist.docApi.fetchTable('Suivi_Instance');
    debugLog('✅ Suivi_Instance chargés', { count: state.tables.Suivi_Instance.records?.length || 0 });
    
    state.tables.OPE = await grist.docApi.fetchTable('OPE');
    debugLog('✅ OPE chargés', { count: state.tables.OPE.records?.length || 0 });
    
    debugLog('🎉 Tous les chargements terminés');
    
  } catch (err) {
    debugError('loadAllTables', err);
    showToast('Erreur de chargement des tables : ' + err.message, true);
  }
}

/* =========================================================
   RENDU - LISTE PROJETS
   ========================================================= */
function renderProjectsList(filterText = '') {
  const container = document.getElementById('projects-list');
  if (!container) {
    debugLog('⚠️ #projects-list introuvable');
    return;
  }

  const filter = filterText.toLowerCase();
  const filtered = state.tables.Projets.records.filter(p => {
    const titre = (p.fields.Titre || '').toLowerCase();
    const acronyme = (p.fields.Acronyme || '').toLowerCase();
    return titre.includes(filter) || acronyme.includes(filter);
  });

  debugLog(`📊 ${filtered.length} projets à afficher`);

  if (filtered.length === 0) {
    container.innerHTML = '<p class="empty-state">Aucun projet trouvé</p>';
    return;
  }

  container.innerHTML = filtered.map(project => `
    <div class="project-card" data-project-id="${project.id}">
      <div class="project-header">
        <h3>${project.fields.Titre || 'Sans titre'}</h3>
        <span class="badge badge-${project.fields.Statut_operationnel_projet?.toLowerCase() || 'default'}">
          ${project.fields.Statut_operationnel_projet || 'Inconnu'}
        </span>
      </div>
      <div class="project-info">
        <p><strong>Acronyme:</strong> ${project.fields.Acronyme || '-'}</p>
        <p><strong>Type:</strong> ${project.fields.Type_projet || '-'}</p>
        <p><strong>Budget:</strong> ${project.fields.Budget_total || '-'} €</p>
      </div>
      <button class="btn btn-primary btn-view-project" data-project-id="${project.id}">
        Voir détails
      </button>
    </div>
  `).join('');

  document.querySelectorAll('.btn-view-project').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const projectId = parseInt(e.target.dataset.projectId);
      openProjectView(projectId);
    });
  });
}

/* =========================================================
   RENDU - DETAIL PROJET
   ========================================================= */
function openProjectView(projectId) {
  debugLog('openProjectView', { projectId });

  if (projectId === null) {
    // Mode création
    state.currentProjectId = null;
    const viewList = document.getElementById('view-list');
    const viewProject = document.getElementById('view-project');
    if (viewList) viewList.classList.add('hidden');
    if (viewProject) viewProject.classList.remove('hidden');
    
    // Reset form
    if (document.getElementById('proj-Titre')) document.getElementById('proj-Titre').value = '';
    if (document.getElementById('proj-Acronyme')) document.getElementById('proj-Acronyme').value = '';
    if (document.getElementById('proj-Description')) document.getElementById('proj-Description').value = '';
    
    showToast('Mode création de projet');
    return;
  }

  state.currentProjectId = projectId;
  const project = state.tables.Projets.records.find(p => p.id === projectId);

  if (!project) {
    showToast('Projet introuvable', true);
    return;
  }

  const viewList = document.getElementById('view-list');
  const viewProject = document.getElementById('view-project');

  if (viewList) viewList.classList.add('hidden');
  if (viewProject) viewProject.classList.remove('hidden');

  // Remplir le formulaire
  document.getElementById('proj-Titre').value = project.fields.Titre || '';
  document.getElementById('proj-Acronyme').value = project.fields.Acronyme || '';
  document.getElementById('proj-Description').value = project.fields.Description || '';
  document.getElementById('proj-Type_projet').value = project.fields.Type_projet || '';
  document.getElementById('proj-Statut_operationnel_projet').value = project.fields.Statut_operationnel_projet || '';
  document.getElementById('proj-Budget_total').value = project.fields.Budget_total || '';

  // Charger les postes du projet
  loadProjectPosts(projectId);
  
  // Charger l'historique
  loadProjectHistory(projectId);
}

function closeProject() {
  debugLog('closeProject');
  state.currentProjectId = null;
  const viewList = document.getElementById('view-list');
  const viewProject = document.getElementById('view-project');

  if (viewProject) viewProject.classList.add('hidden');
  if (viewList) viewList.classList.remove('hidden');

  renderProjectsList();
}

/* =========================================================
   GESTION POSTES
   ========================================================= */
function loadProjectPosts(projectId) {
  debugLog('loadProjectPosts', { projectId });

  const postesContainer = document.getElementById('project-posts');
  if (!postesContainer) return;

  const postes = state.tables.Postes2.records.filter(p => p.fields.Projet === projectId);
  debugLog(`📍 ${postes.length} postes trouvés`);

  if (postes.length === 0) {
    postesContainer.innerHTML = '<p class="empty-state">Aucun poste pour ce projet</p>';
    return;
  }

  postesContainer.innerHTML = postes.map(poste => `
    <div class="poste-card">
      <h4>${poste.fields.Intitule || 'Sans titre'}</h4>
      <p><strong>Type:</strong> ${poste.fields.Type_poste || '-'}</p>
      <p><strong>Statut:</strong> ${poste.fields.Statut || '-'}</p>
      <button class="btn btn-secondary btn-edit-poste" data-poste-id="${poste.id}">
        Éditer
      </button>
      <button class="btn btn-danger btn-delete-poste" data-poste-id="${poste.id}">
        Supprimer
      </button>
    </div>
  `).join('');

  document.querySelectorAll('.btn-edit-poste').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const posteId = parseInt(e.target.dataset.posteId);
      editPoste(posteId);
    });
  });

  document.querySelectorAll('.btn-delete-poste').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const posteId = parseInt(e.target.dataset.posteId);
      if (confirm('Êtes-vous sûr de vouloir supprimer ce poste ?')) {
        try {
          await grist.docApi.removeRecord('Postes2', [posteId]);
          state.tables.Postes2 = await grist.docApi.fetchTable('Postes2');
          loadProjectPosts(state.currentProjectId);
          showToast('Poste supprimé');
        } catch (err) {
          debugError('deletePoste', err);
          showToast('Erreur: ' + err.message, true);
        }
      }
    });
  });
}

function editPoste(posteId) {
  debugLog('editPoste', { posteId });
  const poste = state.tables.Postes2.records.find(p => p.id === posteId);
  if (!poste) {
    showToast('Poste introuvable', true);
    return;
  }

  // Ouvrir modal d'édition
  const modal = document.getElementById('modal-poste-edit');
  if (modal) {
    document.getElementById('edit-poste-intitule').value = poste.fields.Intitule || '';
    document.getElementById('edit-poste-type').value = poste.fields.Type_poste || '';
    document.getElementById('edit-poste-statut').value = poste.fields.Statut || '';
    
    const saveBtn = document.getElementById('btn-save-poste-edit');
    if (saveBtn) {
      saveBtn.onclick = () => savePosteEdit(posteId);
    }
    
    modal.classList.remove('hidden');
  }
}

async function savePosteEdit(posteId) {
  debugLog('savePosteEdit', { posteId });

  const intitule = document.getElementById('edit-poste-intitule').value;
  const type = document.getElementById('edit-poste-type').value;
  const statut = document.getElementById('edit-poste-statut').value;

  if (!intitule) {
    showToast('Intitulé obligatoire', true);
    return;
  }

  try {
    await grist.docApi.updateRecord('Postes2', [posteId], {
      Intitule: intitule,
      Type_poste: type,
      Statut: statut,
    });

    state.tables.Postes2 = await grist.docApi.fetchTable('Postes2');
    loadProjectPosts(state.currentProjectId);
    
    const modal = document.getElementById('modal-poste-edit');
    if (modal) modal.classList.add('hidden');
    
    showToast('Poste mis à jour');
  } catch (err) {
    debugError('savePosteEdit', err);
    showToast('Erreur: ' + err.message, true);
  }
}

/* =========================================================
   GESTION ANNUAIRE / PERSONNES
   ========================================================= */
function loadPersons() {
  debugLog('loadPersons');

  const container = document.getElementById('persons-list');
  if (!container) return;

  const filtered = state.tables.Annuaire.records;
  debugLog(`👥 ${filtered.length} personnes`);

  if (filtered.length === 0) {
    container.innerHTML = '<p class="empty-state">Aucune personne</p>';
    return;
  }

  container.innerHTML = filtered.map(person => `
    <div class="person-card">
      <h4>${person.fields.Prenom || ''} ${person.fields.Nom || ''}</h4>
      <p><strong>Email:</strong> ${person.fields.Email || '-'}</p>
      <p><strong>Structure:</strong> ${person.fields.Structure || '-'}</p>
      <button class="btn btn-secondary btn-edit-person" data-person-id="${person.id}">
        Éditer
      </button>
      <button class="btn btn-danger btn-delete-person" data-person-id="${person.id}">
        Supprimer
      </button>
    </div>
  `).join('');

  document.querySelectorAll('.btn-edit-person').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const personId = parseInt(e.target.dataset.personId);
      editPerson(personId);
    });
  });

  document.querySelectorAll('.btn-delete-person').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const personId = parseInt(e.target.dataset.personId);
      if (confirm('Êtes-vous sûr de vouloir supprimer cette personne ?')) {
        try {
          await grist.docApi.removeRecord('Annuaire', [personId]);
          state.tables.Annuaire = await grist.docApi.fetchTable('Annuaire');
          loadPersons();
          showToast('Personne supprimée');
        } catch (err) {
          debugError('deletePerson', err);
          showToast('Erreur: ' + err.message, true);
        }
      }
    });
  });
}

function initPersonModal() {
  debugLog('initPersonModal');

  const btnNewPerson = document.getElementById('btn-new-person');
  if (btnNewPerson) {
    btnNewPerson.addEventListener('click', () => {
      const modal = document.getElementById('modal-person');
      if (modal) {
        document.getElementById('np-Prenom').value = '';
        document.getElementById('np-NOM').value = '';
        document.getElementById('np-Email').value = '';
        document.getElementById('np-Structure').value = '';
        modal.classList.remove('hidden');
      }
    });
  }

  const btnCancelPerson = document.getElementById('btn-cancel-person');
  if (btnCancelPerson) {
    btnCancelPerson.addEventListener('click', () => {
      const modal = document.getElementById('modal-person');
      if (modal) modal.classList.add('hidden');
    });
  }

  const btnSavePerson = document.getElementById('btn-save-person');
  if (btnSavePerson) {
    btnSavePerson.addEventListener('click', savePerson);
  }
}

async function savePerson() {
  debugLog('savePerson');

  const prenom = (document.getElementById('np-Prenom')?.value || '').trim();
  const nom = (document.getElementById('np-NOM')?.value || '').trim();
  const email = (document.getElementById('np-Email')?.value || '').trim();
  const structure = (document.getElementById('np-Structure')?.value || '').trim();

  if (!prenom || !nom) {
    showToast('Prénom et nom obligatoires', true);
    return;
  }

  try {
    await grist.docApi.addRecord('Annuaire', {
      Prenom: prenom,
      Nom: nom,
      Email: email,
      Structure: structure,
    });

    state.tables.Annuaire = await grist.docApi.fetchTable('Annuaire');

    const modal = document.getElementById('modal-person');
    if (modal) modal.classList.add('hidden');

    loadPersons();
    showToast(`${prenom} ${nom} ajouté(e) à l'annuaire`);

  } catch (err) {
    debugError('savePerson', err);
    showToast('Erreur: ' + err.message, true);
  }
}

function editPerson(personId) {
  debugLog('editPerson', { personId });

  const person = state.tables.Annuaire.records.find(p => p.id === personId);
  if (!person) {
    showToast('Personne introuvable', true);
    return;
  }

  const modal = document.getElementById('modal-person-edit');
  if (modal) {
    document.getElementById('edit-person-prenom').value = person.fields.Prenom || '';
    document.getElementById('edit-person-nom').value = person.fields.Nom || '';
    document.getElementById('edit-person-email').value = person.fields.Email || '';
    document.getElementById('edit-person-structure').value = person.fields.Structure || '';

    const saveBtn = document.getElementById('btn-save-person-edit');
    if (saveBtn) {
      saveBtn.onclick = () => savePersonEdit(personId);
    }

    modal.classList.remove('hidden');
  }
}

async function savePersonEdit(personId) {
  debugLog('savePersonEdit', { personId });

  const prenom = document.getElementById('edit-person-prenom').value;
  const nom = document.getElementById('edit-person-nom').value;
  const email = document.getElementById('edit-person-email').value;
  const structure = document.getElementById('edit-person-structure').value;

  if (!prenom || !nom) {
    showToast('Prénom et nom obligatoires', true);
    return;
  }

  try {
    await grist.docApi.updateRecord('Annuaire', [personId], {
      Prenom: prenom,
      Nom: nom,
      Email: email,
      Structure: structure,
    });

    state.tables.Annuaire = await grist.docApi.fetchTable('Annuaire');
    loadPersons();

    const modal = document.getElementById('modal-person-edit');
    if (modal) modal.classList.add('hidden');

    showToast('Personne mise à jour');

  } catch (err) {
    debugError('savePersonEdit', err);
    showToast('Erreur: ' + err.message, true);
  }
}

/* =========================================================
   GESTION HISTORIQUE / SUIVI
   ========================================================= */
function loadProjectHistory(projectId) {
  debugLog('loadProjectHistory', { projectId });

  const container = document.getElementById('project-history');
  if (!container) return;

  const history = state.tables.Suivi_Instance.records.filter(h => h.fields.Projet === projectId);
  debugLog(`📜 ${history.length} événements`);

  if (history.length === 0) {
    container.innerHTML = '<p class="empty-state">Aucun historique</p>';
    return;
  }

  container.innerHTML = history.map(event => `
    <div class="history-item">
      <div class="history-date">${formatDate(event.fields.Date || new Date())}</div>
      <div class="history-content">
        <strong>${event.fields.Type_evenement || 'Événement'}</strong>
        <p>${event.fields.Description || '-'}</p>
        <small>Par: ${event.fields.Auteur || 'Inconnu'}</small>
      </div>
    </div>
  `).join('');
}

function formatDate(dateString) {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR');
  } catch {
    return dateString;
  }
}

/* =========================================================
   AUTOCOMPLETE STRUCTURES
   ========================================================= */
function initStructuresAutocomplete() {
  debugLog('initStructuresAutocomplete');

  const input = document.getElementById('filter-structures');
  const dropdown = document.getElementById('structures-dropdown');

  if (!input || !dropdown) return;

  input.addEventListener('input', (e) => {
    const filter = e.target.value.toLowerCase();

    if (filter.length === 0) {
      dropdown.innerHTML = '';
      dropdown.classList.add('hidden');
      return;
    }

    const filtered = state.tables.Structures.records.filter(s => {
      const name = (s.fields.name || '').toLowerCase();
      return name.includes(filter);
    });

    if (filtered.length === 0) {
      dropdown.innerHTML = '<div class="autocomplete-item">Aucune structure</div>';
    } else {
      dropdown.innerHTML = filtered.map(s => `
        <div class="autocomplete-item" data-structure-id="${s.id}">
          ${s.fields.name || 'Sans nom'}
        </div>
      `).join('');

      dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
          const structureId = item.dataset.structureId;
          input.value = item.textContent;
          dropdown.classList.add('hidden');
          debugLog('Structure sélectionnée', { structureId });
        });
      });
    }

    dropdown.classList.remove('hidden');
  });
}

/* =========================================================
   EVENT LISTENERS PRINCIPAUX
   ========================================================= */
function attachEventListeners() {
  debugLog('attachEventListeners');

  // Navigation
  const btnBack = document.getElementById('btn-back');
  if (btnBack) {
    btnBack.addEventListener('click', closeProject);
  }

  const btnNewProject = document.getElementById('btn-new-project');
  if (btnNewProject) {
    btnNewProject.addEventListener('click', () => openProjectView(null));
  }

  // Filtre projets
  const filterInput = document.getElementById('filter-projects');
  if (filterInput) {
    filterInput.addEventListener('input', (e) => {
      renderProjectsList(e.target.value);
    });
  }

  // Onglets
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (btn.classList.contains('disabled')) {
        showToast('Onglet non disponible');
        return;
      }

      // Active tab
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const tabId = 'tab-' + btn.dataset.tab;
      const tabContent = document.getElementById(tabId);
      if (tabContent) {
        tabContent.classList.add('active');
        
        // Load data when tab is opened
        if (btn.dataset.tab === 'personnes') {
          loadPersons();
        }
      }
    });
  });

  // Modals
  initPersonModal();
  initStructuresAutocomplete();

  // Fermeture modals au clic dehors
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  });
}

/* =========================================================
   🚀 INITIALIZATION AVEC ATTENTE DE GRIST
   ========================================================= */
async function initializeApp() {
  debugLog('🚀 Attente de l\'API Grist...');

  // Attendre que grist soit disponible
  let retries = 0;
  while (typeof grist === 'undefined' && retries < 50) {
    await new Promise(resolve => setTimeout(resolve, 100));
    retries++;
  }

  if (typeof grist === 'undefined') {
    debugError('initializeApp', 'Grist API non trouvée après 5 secondes');
    showToast('Erreur: API Grist non disponible', true);
    return;
  }

  debugLog('✅ Grist API disponible !');

  try {
    // Appeler grist.ready() une seule fois
    await grist.ready({
      requiredAccess: 'full',
    });

    debugLog('✅ grist.ready() complété');

    // Charger les tables
    await loadAllTables();

    // Initialiser UI
    renderProjectsList();
    attachEventListeners();

    debugLog('✨ Application initialisée avec succès');

  } catch (err) {
    debugError('Erreur initialisation', err);
    showToast('Erreur d\'initialisation: ' + err.message, true);
  }
}

// Lance l'initialisation
initializeApp();
