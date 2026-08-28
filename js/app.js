/* =========================================================
   APPLICATION PRINCIPALE - Gestion des Projets & Personnes
   ========================================================= */

// ========== UTILITAIRES (déstructurés depuis CoreUtils) ==========
const { showToast, debugLog, debugError } = window.CoreUtils;
const state = window.CoreState;

// ========== RÉFÉRENCES DOM ==========
const viewList = document.getElementById('view-list');
const viewProject = document.getElementById('view-project');
const searchInput = document.getElementById('search-input');
const projectsList = document.getElementById('projects-list');
const projectDetailsContent = document.getElementById('project-details-content');

// ========== BOUTONS ==========
const btnBack = document.getElementById('btn-back');
const btnNewProject = document.getElementById('btn-new-project');
const btnSaveProject = document.getElementById('btn-save-project');
const btnCancelProject = document.getElementById('btn-cancel-project');
const btnSavePerson = document.getElementById('btn-save-person');
const btnCancelPerson = document.getElementById('btn-cancel-person');

// ========== MODALES ==========
const modalProject = document.getElementById('modal-project');
const modalPerson = document.getElementById('modal-person');

// ========== CHAMPS FORMULAIRE PROJET ==========
const FINANCIAL_FIELDS = {
  'npp-NomProjet': 'Nom',
  'npp-Description': 'Description',
  'npp-StatutOperationnel': 'Statut opérationnel projet',
  'npp-TypeProjet': 'Type projet',
  'npp-Porteur_1': 'Porteur 1',
  'npp-Porteur_2': 'Porteur 2',
  'npp-Accompagnateur': 'Accompagnateur',
  'npp-Instance': 'Instance rattachée',
  'npp-DateLimiteFinance': 'Date limite de financement',
  'npp-Programme': 'Programme',
};

// ========== INITIALISATION DE L'APP ==========
async function initializeApp() {
  try {
    debugLog('Initialisation de l\'app...');
    
    // Attendre que Grist soit prêt
    await window.CoreGrist.ready();
    
    // Charger toutes les tables
    const tables = await window.CoreGrist.loadAllTables();
    
    // Remplir state.tables
    Object.assign(state.tables, tables);
    
    debugLog('🎉 App initialisée, affichage de la liste...');
    renderProjectsList();
    attachEventListeners();
    
  } catch (err) {
    debugError('Initialisation app', err);
    showToast('Erreur d\'initialisation : ' + err.message, true);
  }
}

// ========== AFFICHAGE LISTE PROJETS ==========
function renderProjectsList() {
  const filter = (searchInput?.value || '').trim().toLowerCase();
  debugLog('renderProjectsList', { filterText: filter });
  
  let projets = state.tables.Projets || [];
  
  if (filter) {
    projets = projets.filter(p => 
      (p.Nom || '').toLowerCase().includes(filter) ||
      (p.Description || '').toLowerCase().includes(filter)
    );
  }
  
  debugLog(`${projets.length} projets à afficher`, filter);
  
  if (!projectsList) {
    console.warn('❌ projectsList introuvable');
    return;
  }
  
  projectsList.innerHTML = projets.map(p => `
    <div class="project-item" data-id="${p.id}">
      <h4>${p.Nom || 'Sans titre'}</h4>
      <p>${(p.Description || '').substring(0, 100)}...</p>
      <small>Statut: ${p.Statut_Operationnel || 'N/A'}</small>
    </div>
  `).join('');
  
  // Ajouter les listeners de click sur chaque projet
  document.querySelectorAll('.project-item').forEach(item => {
    item.addEventListener('click', () => {
      const projectId = parseInt(item.dataset.id);
      openProjectDetails(projectId);
    });
  });
}

// ========== AFFICHAGE DÉTAILS PROJET ==========
function openProjectDetails(projectId) {
  debugLog('openProjectDetails', { projectId });
  
  const project = state.tables.Projets.find(p => p.id === projectId);
  if (!project) {
    showToast('Projet non trouvé', true);
    return;
  }
  
  state.currentProjectId = projectId;
  
  // Masquer liste, afficher détails
  if (viewList) viewList.classList.add('hidden');
  if (viewProject) viewProject.classList.remove('hidden');
  
  // Remplir les détails
  const html = `
    <h2>${project.Nom || 'Sans titre'}</h2>
    <p>${project.Description || 'Pas de description'}</p>
    <p><strong>Statut:</strong> ${project.Statut_Operationnel || 'N/A'}</p>
    <p><strong>Type:</strong> ${project.Type_Projet || 'N/A'}</p>
    <p><strong>Programme:</strong> ${project.Programme || 'N/A'}</p>
    <hr>
    <h3>Personnes du projet</h3>
    <div id="persons-section"></div>
  `;
  
  if (projectDetailsContent) {
    projectDetailsContent.innerHTML = html;
  }
  
  // Charger les personnes associées
  loadProjectPersons(projectId);
}

// ========== CHARGER PERSONNES D'UN PROJET ==========
function loadProjectPersons(projectId) {
  debugLog('loadProjectPersons', { projectId });
  
  const project = state.tables.Projets.find(p => p.id === projectId);
  if (!project) return;
  
  const personsSection = document.getElementById('persons-section');
  if (!personsSection) return;
  
  const personFieldsMap = {
    'Porteur_1': 'Porteur 1',
    'Porteur_2': 'Porteur 2 (VP)',
    'Accompagnateur': 'Accompagnateur',
  };
  
  let html = '';
  
  Object.entries(personFieldsMap).forEach(([fieldName, label]) => {
    const personId = project[fieldName];
    const person = personId ? state.tables.Annuaire.find(a => a.id === personId) : null;
    
    html += `
      <div class="person-block">
        <strong>${label}:</strong>
        <span>${person ? `${person.Prenom} ${person.Nom}` : 'Non assigné'}</span>
        <button class="btn-edit-person" data-field="${fieldName}">Modifier</button>
      </div>
    `;
  });
  
  personsSection.innerHTML = html;
  
  // Ajouter listeners sur boutons Modifier
  personsSection.querySelectorAll('.btn-edit-person').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const fieldName = e.target.dataset.field;
      openPersonModal(fieldName);
    });
  });
}

// ========== OUVERTURE MODALE PERSONNE ==========
function openPersonModal(fieldName) {
  debugLog('openPersonModal', { fieldName });
  
  if (!modalPerson) {
    console.warn('❌ modalPerson introuvable');
    return;
  }
  
  state.personTargetField = fieldName;
  
  // Afficher la modale
  modalPerson.classList.remove('hidden');
  if (modalPerson.classList.contains('active') === false) {
    modalPerson.classList.add('active');
  }
  
  // Initialiser les champs de recherche
  initAllSearchSelects();
}

// ========== INITIALISER LES SEARCH-SELECT ==========
function initAllSearchSelects() {
  debugLog('initAllSearchSelects: recherche des .search-select...');
  
  const selects = document.querySelectorAll('.search-select');
  debugLog(`Trouvé ${selects.length} search-select`);
  
  selects.forEach(select => {
    initSearchSelect(select);
  });
}

// ========== INITIALISER UN SEARCH-SELECT ==========
function initSearchSelect(selectElement) {
  const fieldId = selectElement.id;
  const tableAttr = selectElement.getAttribute('data-table');
  
  debugLog('initSearchSelect', { fieldId, tableAttr });
  
  if (!tableAttr) return;
  
  const table = state.tables[tableAttr];
  if (!table) {
    console.warn(`❌ Table ${tableAttr} non trouvée`);
    return;
  }
  
  // Input de recherche
  const input = selectElement.querySelector('input[type="text"]');
  if (!input) return;
  
  // Dropdown de résultats
  let dropdown = selectElement.querySelector('.search-dropdown');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.className = 'search-dropdown';
    selectElement.appendChild(dropdown);
  }
  
  // Event: recherche au fur et à mesure
  input.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    
    if (!query) {
      dropdown.innerHTML = '';
      dropdown.style.display = 'none';
      return;
    }
    
    // Filtrer les résultats
    const results = table.filter(item => {
      const name = `${item.Prenom || ''} ${item.Nom || ''}`.toLowerCase();
      const label = item.Label || item.Nom || '';
      return name.includes(query) || label.toLowerCase().includes(query);
    });
    
    // Afficher le dropdown
    dropdown.innerHTML = results.slice(0, 10).map(item => {
      const displayText = item.Prenom && item.Nom 
        ? `${item.Prenom} ${item.Nom}` 
        : (item.Label || item.Nom || 'N/A');
      return `<div class="search-result" data-id="${item.id}">${displayText}</div>`;
    }).join('');
    
    dropdown.style.display = results.length > 0 ? 'block' : 'none';
    
    // Event: cliquer sur un résultat
    dropdown.querySelectorAll('.search-result').forEach(result => {
      result.addEventListener('click', () => {
        const selectedId = parseInt(result.dataset.id);
        input.value = result.textContent;
        input.dataset.selectedId = selectedId;
        dropdown.style.display = 'none';
      });
    });
  });
}

// ========== SAUVEGARDER PERSONNE ==========
async function savePerson() {
  debugLog('Sauvegarde personne...');
  
  const prenomField = document.getElementById('np-Prenom');
  const nomField = document.getElementById('np-NOM');
  const emailField = document.getElementById('np-Email');
  
  const prenom = (prenomField?.value || '').trim();
  const nom = (nomField?.value || '').trim();
  const email = (emailField?.value || '').trim();
  
  if (!prenom || !nom) {
    showToast('Le prénom et le nom sont obligatoires.', true);
    return;
  }
  
  try {
    // Créer ou mettre à jour l'entrée Annuaire
    const newPerson = {
      Prenom: prenom,
      Nom: nom,
      Email: email,
    };
    
    // Appel API Grist pour insérer/modifier
    const result = await window.CoreGrist.gristInstance.docApi.addOrUpdateRecords(
      'Annuaire',
      [newPerson]
    );
    
    debugLog('Personne sauvegardée', result);
    showToast('Personne enregistrée avec succès');
    
    // Fermer la modale
    closePersonModal();
    
    // Rafraîchir la liste des personnes du projet
    if (state.currentProjectId) {
      loadProjectPersons(state.currentProjectId);
    }
    
  } catch (err) {
    debugError('Erreur sauvegarde personne', err);
    showToast('Erreur lors de l\'enregistrement : ' + err.message, true);
  }
}

// ========== FERMER MODALE PERSONNE ==========
function closePersonModal() {
  if (modalPerson) {
    modalPerson.classList.add('hidden');
    modalPerson.classList.remove('active');
  }
  state.personTargetField = null;
}

// ========== SAUVEGARDER PROJET ==========
async function saveProject() {
  debugLog('Sauvegarde projet...');
  
  const nomField = document.getElementById('npp-NomProjet');
  const nom = (nomField?.value || '').trim();
  
  if (!nom) {
    showToast('Le nom du projet est obligatoire.', true);
    return;
  }
  
  try {
    const newProject = {
      Nom: nom,
      Description: document.getElementById('npp-Description')?.value || '',
      Statut_Operationnel: document.getElementById('npp-StatutOperationnel')?.value || '',
      Type_Projet: document.getElementById('npp-TypeProjet')?.value || '',
      Programme: document.getElementById('npp-Programme')?.value || '',
    };
    
    const result = await window.CoreGrist.gristInstance.docApi.addOrUpdateRecords(
      'Projets',
      [newProject]
    );
    
    debugLog('Projet sauvegardé', result);
    showToast('Projet enregistré avec succès');
    
    // Fermer modale
    closeProjectModal();
    
    // Rafraîchir la liste
    state.tables.Projets = await window.CoreGrist.refreshTable('Projets');
    renderProjectsList();
    
  } catch (err) {
    debugError('Erreur sauvegarde projet', err);
    showToast('Erreur lors de l\'enregistrement : ' + err.message, true);
  }
}

// ========== FERMER MODALE PROJET ==========
function closeProjectModal() {
  if (modalProject) {
    modalProject.classList.add('hidden');
    modalProject.classList.remove('active');
  }
}

// ========== OUVERTURE MODALE NOUVEAU PROJET ==========
function openNewProjectModal() {
  debugLog('Ouverture modale nouveau projet');
  
  if (modalProject) {
    // Vider les champs
    Object.keys(FINANCIAL_FIELDS).forEach(fieldId => {
      const field = document.getElementById(fieldId);
      if (field) field.value = '';
    });
    
    modalProject.classList.remove('hidden');
    if (modalProject.classList.contains('active') === false) {
      modalProject.classList.add('active');
    }
  }
}

// ========== ATTACHER LES EVENT LISTENERS ==========
function attachEventListeners() {
  // Navigation
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      debugLog('Retour à la liste');
      if (viewProject) viewProject.classList.add('hidden');
      if (viewList) viewList.classList.remove('hidden');
      state.currentProjectId = null;
    });
  }
  
  // Nouveau projet
  if (btnNewProject) {
    btnNewProject.addEventListener('click', openNewProjectModal);
  }
  
  // Sauvegarder projet
  if (btnSaveProject) {
    btnSaveProject.addEventListener('click', saveProject);
  }
  
  // Annuler projet
  if (btnCancelProject) {
    btnCancelProject.addEventListener('click', closeProjectModal);
  }
  
  // Sauvegarder personne
  if (btnSavePerson) {
    btnSavePerson.addEventListener('click', savePerson);
  }
  
  // Annuler personne
  if (btnCancelPerson) {
    btnCancelPerson.addEventListener('click', closePersonModal);
  }
  
  // Recherche
  if (searchInput) {
    searchInput.addEventListener('input', renderProjectsList);
  }
}

// ========== LANCER L'APP AU DÉMARRAGE ==========
initializeApp().catch(err => {
  debugError('App crash', err);
  showToast('Erreur critique : ' + err.message, true);
});
