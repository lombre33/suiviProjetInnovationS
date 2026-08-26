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
    
    debugLog('🎉 Tous les chargements terminés, rendu de la liste...');
    renderProjectsList();
    
  } catch (err) {
    debugError('loadAllTables', err);
    showToast('Erreur de chargement des tables : ' + err.message, true);
  }
}

/* =========================================================
   RENDU LISTE PROJETS
   ========================================================= */
function renderProjectsList(filterText = '') {
  debugLog('renderProjectsList', { filterText });
  
  const container = document.getElementById('projects-list');
  if (!container) return;
  
  const projects = state.tables.Projets.records || [];
  const filtered = projects.filter(p => {
    const titre = String(p.Titre || '').toLowerCase();
    const acronyme = String(p.Acronyme || '').toLowerCase();
    const search = filterText.toLowerCase();
    return titre.includes(search) || acronyme.includes(search);
  });
  
  debugLog(`${filtered.length} projets à afficher`, { filterText });
  
  if (filtered.length === 0) {
    container.innerHTML = '<p class="empty-state">Aucun projet ne correspond à votre recherche.</p>';
    return;
  }
  
  container.innerHTML = filtered.map(project => `
    <div class="project-card" data-id="${project.id}">
      <h3>${escapeHtml(project.Titre || 'Sans titre')}</h3>
      <p class="acronyme">${escapeHtml(project.Acronyme || '-')}</p>
      <p class="description">${escapeHtml((project.Description || '').substring(0, 100))}</p>
      <div class="project-meta">
        <span class="status">${escapeHtml(project.Statut_operationnel_projet || '-')}</span>
      </div>
    </div>
  `).join('');
  
  container.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', () => openProject(parseInt(card.dataset.id)));
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/* =========================================================
   OUVERTURE PROJET
   ========================================================= */
function openProject(projectId) {
  debugLog('openProject', { projectId });
  
  const project = state.tables.Projets.records.find(p => p.id === projectId);
  if (!project) {
    showToast('Projet non trouvé', true);
    return;
  }
  
  state.currentProjectId = projectId;
  
  // Mettre à jour le formulaire
  document.getElementById('proj-Titre').value = project.Titre || '';
  document.getElementById('proj-Acronyme').value = project.Acronyme || '';
  document.getElementById('proj-Description').value = project.Description || '';
  document.getElementById('proj-Type_projet').value = project.Type_projet || '';
  document.getElementById('proj-Statut_operationnel_projet').value = project.Statut_operationnel_projet || '';
  document.getElementById('proj-Budget_total').value = project.Budget_total || '';
  
  // Basculer les vues
  document.getElementById('view-list').classList.add('hidden');
  document.getElementById('view-project').classList.remove('hidden');
  
  // Charger les postes et l'historique
  loadProjectPosts(projectId);
  loadProjectHistory(projectId);
}

function loadProjectPosts(projectId) {
  debugLog('loadProjectPosts', { projectId });
  
  const container = document.getElementById('project-posts');
  const posts = (state.tables.Postes2.records || []).filter(p => p.Projet === projectId);
  
  if (posts.length === 0) {
    container.innerHTML = '<p class="empty-state">Aucun poste pour ce projet.</p>';
    return;
  }
  
  container.innerHTML = posts.map(post => `
    <div class="post-card" data-id="${post.id}">
      <h4>${escapeHtml(post.Intitule || 'Poste sans titre')}</h4>
      <p><strong>Type:</strong> ${escapeHtml(post.Type || '-')}</p>
      <p><strong>Statut:</strong> ${escapeHtml(post.Statut || '-')}</p>
      <div class="post-actions">
        <button class="btn btn-sm btn-edit" data-id="${post.id}">Éditer</button>
        <button class="btn btn-sm btn-danger" data-id="${post.id}">Supprimer</button>
      </div>
    </div>
  `).join('');
  
  // Événements
  container.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      editPoste(parseInt(btn.dataset.id));
    });
  });
  
  container.querySelectorAll('.btn-danger').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePoste(parseInt(btn.dataset.id));
    });
  });
}

function loadProjectHistory(projectId) {
  debugLog('loadProjectHistory', { projectId });
  
  const container = document.getElementById('project-history');
  const history = (state.tables.Suivi_Instance.records || []).filter(h => h.Projet === projectId);
  
  if (history.length === 0) {
    container.innerHTML = '<p class="empty-state">Aucun historique pour ce projet.</p>';
    return;
  }
  
  container.innerHTML = history.map(item => `
    <div class="history-item">
      <p><strong>${escapeHtml(item.Titre || '-')}</strong></p>
      <p>${escapeHtml(item.Description || '')}</p>
      <small>${item.Date || '-'}</small>
    </div>
  `).join('');
}

/* =========================================================
   GESTION POSTES
   ========================================================= */
function editPoste(posteId) {
  debugLog('editPoste', { posteId });
  
  const poste = state.tables.Postes2.records.find(p => p.id === posteId);
  if (!poste) return;
  
  document.getElementById('edit-poste-intitule').value = poste.Intitule || '';
  document.getElementById('edit-poste-type').value = poste.Type || '';
  document.getElementById('edit-poste-statut').value = poste.Statut || '';
  
  const modal = document.getElementById('modal-poste-edit');
  modal.classList.remove('hidden');
  
  const saveBtn = document.getElementById('btn-save-poste-edit');
  saveBtn.onclick = async () => {
    try {
      await grist.docApi.applyUserActions([
        ['UpdateRecord', 'Postes2', posteId, {
          Intitule: document.getElementById('edit-poste-intitule').value,
          Type: document.getElementById('edit-poste-type').value,
          Statut: document.getElementById('edit-poste-statut').value,
        }]
      ]);
      
      showToast('Poste mis à jour');
      modal.classList.add('hidden');
      loadProjectPosts(state.currentProjectId);
    } catch (err) {
      debugError('editPoste save', err);
      showToast('Erreur: ' + err.message, true);
    }
  };
}

function deletePoste(posteId) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer ce poste ?')) return;
  
  debugLog('deletePoste', { posteId });
  
  grist.docApi.applyUserActions([
    ['RemoveRecord', 'Postes2', posteId]
  ]).then(() => {
    showToast('Poste supprimé');
    loadProjectPosts(state.currentProjectId);
  }).catch(err => {
    debugError('deletePoste', err);
    showToast('Erreur: ' + err.message, true);
  });
}

/* =========================================================
   GESTION PERSONNES
   ========================================================= */
function openPersonModal() {
  debugLog('openPersonModal');
  
  document.getElementById('np-Prenom').value = '';
  document.getElementById('np-NOM').value = '';
  document.getElementById('np-Email').value = '';
  document.getElementById('np-Structure').value = '';
  
  document.getElementById('modal-person').classList.remove('hidden');
}

function loadPersons() {
  debugLog('loadPersons');
  
  const container = document.getElementById('persons-list');
  const persons = state.tables.Annuaire.records || [];
  
  if (persons.length === 0) {
    container.innerHTML = '<p class="empty-state">Aucune personne dans l\'annuaire.</p>';
    return;
  }
  
  container.innerHTML = persons.map(person => `
    <div class="person-card" data-id="${person.id}">
      <h4>${escapeHtml(person.Prenom || '')} ${escapeHtml(person.NOM || '')}</h4>
      <p><strong>Email:</strong> ${escapeHtml(person.Email || '-')}</p>
      <p><strong>Structure:</strong> ${escapeHtml(person.Structure || '-')}</p>
      <div class="person-actions">
        <button class="btn btn-sm btn-edit" data-id="${person.id}">Éditer</button>
        <button class="btn btn-sm btn-danger" data-id="${person.id}">Supprimer</button>
      </div>
    </div>
  `).join('');
  
  container.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      editPerson(parseInt(btn.dataset.id));
    });
  });
  
  container.querySelectorAll('.btn-danger').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePerson(parseInt(btn.dataset.id));
    });
  });
}

function editPerson(personId) {
  debugLog('editPerson', { personId });
  
  const person = state.tables.Annuaire.records.find(p => p.id === personId);
  if (!person) return;
  
  document.getElementById('edit-person-prenom').value = person.Prenom || '';
  document.getElementById('edit-person-nom').value = person.NOM || '';
  document.getElementById('edit-person-email').value = person.Email || '';
  document.getElementById('edit-person-structure').value = person.Structure || '';
  
  const modal = document.getElementById('modal-person-edit');
  modal.classList.remove('hidden');
  
  const saveBtn = document.getElementById('btn-save-person-edit');
  saveBtn.onclick = async () => {
    try {
      await grist.docApi.applyUserActions([
        ['UpdateRecord', 'Annuaire', personId, {
          Prenom: document.getElementById('edit-person-prenom').value,
          NOM: document.getElementById('edit-person-nom').value,
          Email: document.getElementById('edit-person-email').value,
          Structure: document.getElementById('edit-person-structure').value,
        }]
      ]);
      
      showToast('Personne mise à jour');
      modal.classList.add('hidden');
      loadPersons();
    } catch (err) {
      debugError('editPerson save', err);
      showToast('Erreur: ' + err.message, true);
    }
  };
}

function deletePerson(personId) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer cette personne ?')) return;
  
  debugLog('deletePerson', { personId });
  
  grist.docApi.applyUserActions([
    ['RemoveRecord', 'Annuaire', personId]
  ]).then(() => {
    showToast('Personne supprimée');
    loadPersons();
  }).catch(err => {
    debugError('deletePerson', err);
    showToast('Erreur: ' + err.message, true);
  });
}

/* =========================================================
   EVENT LISTENERS
   ========================================================= */
function attachEventListeners() {
  debugLog('attachEventListeners');
  
  // Retour liste
  const btnBack = document.getElementById('btn-back');
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      document.getElementById('view-project').classList.add('hidden');
      document.getElementById('view-list').classList.remove('hidden');
    });
  }
  
  // Recherche projets
  const filterInput = document.getElementById('filter-projects');
  if (filterInput) {
    filterInput.addEventListener('input', (e) => {
      renderProjectsList(e.target.value);
    });
  }
  
  // Nouveau projet
  const btnNewProject = document.getElementById('btn-new-project');
  if (btnNewProject) {
    btnNewProject.addEventListener('click', () => {
      showToast('Fonctionnalité à implémenter', false);
    });
  }
  
  // Ajouter personne
  const btnNewPerson = document.getElementById('btn-new-person');
  if (btnNewPerson) {
    btnNewPerson.addEventListener('click', openPersonModal);
  }
  
  // Sauvegarder personne
  const btnSavePerson = document.getElementById('btn-save-person');
  if (btnSavePerson) {
    btnSavePerson.addEventListener('click', async () => {
      const prenom = document.getElementById('np-Prenom')?.value.trim();
      const nom = document.getElementById('np-NOM')?.value.trim();
      const email = document.getElementById('np-Email')?.value.trim();
      const structure = document.getElementById('np-Structure')?.value.trim();
      
      if (!prenom || !nom) {
        showToast('Prénom et nom requis', true);
        return;
      }
      
      try {
        await grist.docApi.applyUserActions([
          ['AddRecord', 'Annuaire', null, {
            Prenom: prenom,
            NOM: nom,
            Email: email,
            Structure: structure,
          }]
        ]);
        
        showToast('Personne ajoutée');
        document.getElementById('modal-person').classList.add('hidden');
        
        state.tables.Annuaire = await grist.docApi.fetchTable('Annuaire');
        loadPersons();
      } catch (err) {
        debugError('savePerson', err);
        showToast('Erreur: ' + err.message, true);
      }
    });
  }
  
  // Fermer modals
  document.querySelectorAll('.btn-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.target.closest('.modal').classList.add('hidden');
    });
  });
  
  document.querySelectorAll('.btn-close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal').classList.add('hidden');
    });
  });
  
  // Onglets
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const tabId = 'tab-' + btn.dataset.tab;
      const tabContent = document.getElementById(tabId);
      if (tabContent) {
        tabContent.classList.add('active');
        
        if (btn.dataset.tab === 'personnes') {
          loadPersons();
        }
      }
    });
  });
  
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
    // Appeler grist.ready()
    await grist.ready({
      requiredAccess: 'full',
    });
    
    debugLog('✅ grist.ready() complété');
    
    // Charger les tables
    await loadAllTables();
    
    // Initialiser UI
    attachEventListeners();
    
    debugLog('✨ Application initialisée avec succès');
    
  } catch (err) {
    debugError('Erreur initialisation', err);
    showToast('Erreur d\'initialisation: ' + err.message, true);
  }
}

// Lance l'initialisation
initializeApp();
