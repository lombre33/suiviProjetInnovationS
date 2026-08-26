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
   UTILITIES & DEBUG
   ========================================================= */
function debugLog(...args) {
  const timestamp = new Date().toLocaleTimeString('fr-FR');
  console.log(`[${timestamp}]`, ...args);
}

function showToast(message, isError = false) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'error' : ''}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}

/* =========================================================
   GRIST API INTEGRATION
   ========================================================= */
async function loadAllTables() {
  try {
    debugLog('📋 Chargement de toutes les tables...');
    
    const tables = ['Projets', 'Annuaire', 'Postes2', 'Structures', 'Programmes', 'Etablissements', 'Suivi_Instance', 'OPE'];
    
    for (const tableName of tables) {
      try {
        const records = await grist.docApi.fetchTable(tableName);
        state.tables[tableName] = records.records || [];
        debugLog(`✅ ${tableName} chargés`, { count: records.records?.length || 0 });
      } catch (err) {
        debugLog(`⚠️ Erreur chargement ${tableName}:`, err.message);
        state.tables[tableName] = [];
      }
    }
    
    initializeUI();
  } catch (err) {
    debugLog('❌ Erreur générale chargement:', err);
    showToast('Erreur lors du chargement des données', true);
  }
}

/* =========================================================
   UI INITIALIZATION
   ========================================================= */
function initializeUI() {
  debugLog('🎨 Initialisation UI...');
  
  // Remplir la liste des projets
  populateProjectList();
  
  // Attacher les listeners
  attachEventListeners();
  
  debugLog('🎊 UI initialisée');
}

function populateProjectList() {
  const list = document.getElementById('project-list');
  if (!list) return;
  
  list.innerHTML = '';
  
  if (state.tables.Projets.length === 0) {
    list.innerHTML = '<p style="padding: 16px; color: #999;">Aucun projet trouvé</p>';
    return;
  }
  
  state.tables.Projets.forEach(projet => {
    const item = document.createElement('div');
    item.className = 'project-item';
    item.innerHTML = `
      <div class="project-item-header">
        <strong>${projet.fields.Titre || 'Sans titre'}</strong>
      </div>
      <div class="project-item-meta">
        <small>${projet.fields.Type_Projet || 'N/A'} • ${projet.fields.Etat || 'N/A'}</small>
      </div>
    `;
    item.addEventListener('click', () => openProject(projet.id, projet.fields));
    list.appendChild(item);
  });
}

/* =========================================================
   PROJECT MANAGEMENT
   ========================================================= */
function openProject(projectId, fields) {
  debugLog('Ouverture projet:', { projectId, titre: fields.Titre });
  
  state.currentProjectId = projectId;
  state.formValues = { ...fields };
  
  // Afficher la vue projet
  const viewList = document.getElementById('view-list');
  const viewProject = document.getElementById('view-project');
  
  if (viewList) viewList.classList.add('hidden');
  if (viewProject) viewProject.classList.remove('hidden');
  
  // Remplir les formulaires
  populateProjectForm(fields);
  populateAdminForm(fields);
  populateFinanceForm(fields);
  
  // Charger les postes liés
  loadProjectPostes(projectId);
}

function populateProjectForm(fields) {
  const form = document.getElementById('form-projet');
  if (!form) return;
  
  form.innerHTML = '';
  
  const fieldsToShow = [
    { key: 'Titre', label: 'Titre du projet', type: 'text' },
    { key: 'Type_Projet', label: 'Type de projet', type: 'choice', table: 'Projets', field: 'Type_Projet' },
    { key: 'Etat', label: 'État', type: 'choice', table: 'Projets', field: 'Etat' },
    { key: 'Description', label: 'Description', type: 'textarea' },
    { key: 'Porteur_principal', label: 'Porteur principal', type: 'reference', table: 'Annuaire' },
    { key: 'Porteurs_secondaires', label: 'Porteurs secondaires', type: 'text' },
    { key: 'Programme', label: 'Programme', type: 'reference', table: 'Programmes' },
    { key: 'Structure', label: 'Structure', type: 'reference', table: 'Structures' },
  ];
  
  fieldsToShow.forEach(fieldInfo => {
    const value = fields[fieldInfo.key] || '';
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'form-group';
    
    if (fieldInfo.type === 'textarea') {
      fieldDiv.innerHTML = `
        <label>${fieldInfo.label}</label>
        <textarea id="field-${fieldInfo.key}" placeholder="${fieldInfo.label}">${value}</textarea>
      `;
    } else if (fieldInfo.type === 'choice') {
      const choices = getChoicesForField(fieldInfo.table, fieldInfo.field);
      let optionsHtml = '<option value="">-- Sélectionner --</option>';
      choices.forEach(choice => {
        optionsHtml += `<option value="${choice}" ${choice === value ? 'selected' : ''}>${choice}</option>`;
      });
      fieldDiv.innerHTML = `
        <label>${fieldInfo.label}</label>
        <select id="field-${fieldInfo.key}">
          ${optionsHtml}
        </select>
      `;
    } else if (fieldInfo.type === 'reference') {
      const options = getTableOptions(fieldInfo.table);
      let optionsHtml = '<option value="">-- Sélectionner --</option>';
      options.forEach(opt => {
        const isSelected = value === opt.id || value === opt.name;
        optionsHtml += `<option value="${opt.id}" ${isSelected ? 'selected' : ''}>${opt.name}</option>`;
      });
      fieldDiv.innerHTML = `
        <label>${fieldInfo.label}</label>
        <select id="field-${fieldInfo.key}">
          ${optionsHtml}
        </select>
      `;
    } else {
      fieldDiv.innerHTML = `
        <label>${fieldInfo.label}</label>
        <input type="text" id="field-${fieldInfo.key}" placeholder="${fieldInfo.label}" value="${value}">
      `;
    }
    
    form.appendChild(fieldDiv);
  });
  
  const btnGroup = document.createElement('div');
  btnGroup.className = 'modal-actions';
  btnGroup.innerHTML = `
    <button id="btn-save-project" class="btn btn-primary">Enregistrer</button>
    <button id="btn-cancel-project" class="btn btn-secondary">Annuler</button>
  `;
  form.appendChild(btnGroup);
  
  document.getElementById('btn-save-project')?.addEventListener('click', saveProject);
  document.getElementById('btn-cancel-project')?.addEventListener('click', closeProject);
}

function populateAdminForm(fields) {
  const form = document.getElementById('form-admin');
  if (!form) return;
  
  form.innerHTML = '';
  
  const adminFields = [
    { key: 'Instance_rattachee', label: 'Instance rattachée', type: 'reference', table: 'Suivi_Instance' },
    { key: 'Date_limite_financement', label: 'Date limite de financement', type: 'date' },
  ];
  
  adminFields.forEach(fieldInfo => {
    const value = fields[fieldInfo.key] || '';
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'form-group';
    
    if (fieldInfo.type === 'date') {
      fieldDiv.innerHTML = `
        <label>${fieldInfo.label}</label>
        <input type="date" id="field-${fieldInfo.key}" value="${formatDateForInput(value)}">
      `;
    } else if (fieldInfo.type === 'reference') {
      const options = getTableOptions(fieldInfo.table);
      let optionsHtml = '<option value="">-- Sélectionner --</option>';
      options.forEach(opt => {
        const isSelected = value === opt.id || value === opt.name;
        optionsHtml += `<option value="${opt.id}" ${isSelected ? 'selected' : ''}>${opt.name}</option>`;
      });
      fieldDiv.innerHTML = `
        <label>${fieldInfo.label}</label>
        <select id="field-${fieldInfo.key}">
          ${optionsHtml}
        </select>
      `;
    }
    
    form.appendChild(fieldDiv);
  });
  
  const btnGroup = document.createElement('div');
  btnGroup.className = 'modal-actions';
  btnGroup.innerHTML = `
    <button id="btn-save-admin" class="btn btn-primary">Enregistrer</button>
  `;
  form.appendChild(btnGroup);
  
  document.getElementById('btn-save-admin')?.addEventListener('click', saveAdminForm);
}

function populateFinanceForm(fields) {
  const form = document.getElementById('form-finance');
  if (!form) return;
  
  form.innerHTML = '';
  
  const financeFields = [
    { key: 'Montant_total', label: 'Montant total (€)', type: 'number' },
    { key: 'Montant_finance', label: 'Montant financé (€)', type: 'number' },
    { key: 'Date_debut', label: 'Date de début', type: 'date' },
    { key: 'Date_fin', label: 'Date de fin', type: 'date' },
  ];
  
  financeFields.forEach(fieldInfo => {
    const value = fields[fieldInfo.key] || '';
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'form-group';
    
    if (fieldInfo.type === 'date') {
      fieldDiv.innerHTML = `
        <label>${fieldInfo.label}</label>
        <input type="date" id="field-${fieldInfo.key}" value="${formatDateForInput(value)}">
      `;
    } else if (fieldInfo.type === 'number') {
      fieldDiv.innerHTML = `
        <label>${fieldInfo.label}</label>
        <input type="number" id="field-${fieldInfo.key}" placeholder="${fieldInfo.label}" value="${value}">
      `;
    } else {
      fieldDiv.innerHTML = `
        <label>${fieldInfo.label}</label>
        <input type="text" id="field-${fieldInfo.key}" placeholder="${fieldInfo.label}" value="${value}">
      `;
    }
    
    form.appendChild(fieldDiv);
  });
  
  const btnGroup = document.createElement('div');
  btnGroup.className = 'modal-actions';
  btnGroup.innerHTML = `
    <button id="btn-save-finance" class="btn btn-primary">Enregistrer</button>
  `;
  form.appendChild(btnGroup);
  
  document.getElementById('btn-save-finance')?.addEventListener('click', saveFinanceForm);
}

function closeProject() {
  debugLog('Fermeture projet');
  state.currentProjectId = null;
  state.formValues = {};
  
  const viewList = document.getElementById('view-list');
  const viewProject = document.getElementById('view-project');
  
  if (viewProject) viewProject.classList.add('hidden');
  if (viewList) viewList.classList.remove('hidden');
  
  populateProjectList();
}

async function saveProject() {
  debugLog('Sauvegarde projet...');
  
  if (!state.currentProjectId) {
    showToast('Aucun projet sélectionné', true);
    return;
  }
  
  const titre = document.getElementById('field-Titre')?.value || '';
  if (!titre.trim()) {
    showToast('Le titre est obligatoire', true);
    return;
  }
  
  try {
    const updates = {};
    const fieldsToSave = ['Titre', 'Type_Projet', 'Etat', 'Description', 'Porteur_principal', 'Porteurs_secondaires', 'Programme', 'Structure'];
    
    fieldsToSave.forEach(key => {
      const input = document.getElementById(`field-${key}`);
      if (input) {
        updates[key] = input.value;
      }
    });
    
    await grist.docApi.addOrUpdateRecords('Projets', [{
      id: state.currentProjectId,
      fields: updates
    }]);
    
    showToast('Projet enregistré avec succès');
    await loadAllTables();
    closeProject();
  } catch (err) {
    debugLog('❌ Erreur sauvegarde:', err);
    showToast('Erreur lors de la sauvegarde: ' + err.message, true);
  }
}

async function saveAdminForm() {
  debugLog('Sauvegarde formulaire admin...');
  
  if (!state.currentProjectId) return;
  
  try {
    const updates = {};
    const instance = document.getElementById('field-Instance_rattachee')?.value;
    const dateFinancement = document.getElementById('field-Date_limite_financement')?.value;
    
    if (instance) updates.Instance_rattachee = instance;
    if (dateFinancement) updates.Date_limite_financement = dateFinancement;
    
    await grist.docApi.addOrUpdateRecords('Projets', [{
      id: state.currentProjectId,
      fields: updates
    }]);
    
    showToast('Données administratives mises à jour');
  } catch (err) {
    debugLog('❌ Erreur admin:', err);
    showToast('Erreur: ' + err.message, true);
  }
}

async function saveFinanceForm() {
  debugLog('Sauvegarde formulaire finance...');
  
  if (!state.currentProjectId) return;
  
  try {
    const updates = {};
    const fields = ['Montant_total', 'Montant_finance', 'Date_debut', 'Date_fin'];
    
    fields.forEach(key => {
      const input = document.getElementById(`field-${key}`);
      if (input?.value) {
        updates[key] = input.value;
      }
    });
    
    await grist.docApi.addOrUpdateRecords('Projets', [{
      id: state.currentProjectId,
      fields: updates
    }]);
    
    showToast('Données financières mises à jour');
  } catch (err) {
    debugLog('❌ Erreur finance:', err);
    showToast('Erreur: ' + err.message, true);
  }
}

/* =========================================================
   POSTES MANAGEMENT
   ========================================================= */
function loadProjectPostes(projectId) {
  debugLog('Chargement postes du projet:', projectId);
  
  const postes = state.tables.Postes2.filter(p => p.fields.Projet === projectId);
  const container = document.getElementById('postes-list');
  
  if (!container) return;
  
  container.innerHTML = '';
  
  if (postes.length === 0) {
    container.innerHTML = '<p style="padding: 12px; color: #999;">Aucun poste pour ce projet</p>';
  } else {
    postes.forEach(poste => {
      const item = document.createElement('div');
      item.className = 'poste-item';
      item.innerHTML = `
        <div class="poste-item-header">
          <strong>${poste.fields.Titre || 'Sans titre'}</strong>
        </div>
        <div class="poste-item-meta">
          <small>${poste.fields.Structure ? getStructureName(poste.fields.Structure) : 'Pas de structure'}</small>
        </div>
      `;
      item.addEventListener('click', () => openPosteEditor(poste.id, poste.fields));
      container.appendChild(item);
    });
  }
  
  const btnAdd = document.createElement('button');
  btnAdd.className = 'btn btn-secondary';
  btnAdd.textContent = '+ Ajouter un poste';
  btnAdd.addEventListener('click', openNewPosteForm);
  container.appendChild(btnAdd);
}

function openNewPosteForm() {
  debugLog('Ouverture formulaire nouveau poste');
  
  state.formValues = {
    Projet: state.currentProjectId,
    Titre: '',
    Structure: '',
    Type_contrat: '',
    Responsable: '',
    Profil_recherche: '',
  };
  
  openPosteModal();
}

function openPosteEditor(posteId, fields) {
  debugLog('Édition poste:', posteId);
  
  state.formValues = { ...fields, posteId };
  openPosteModal();
}

function openPosteModal() {
  const modal = document.getElementById('poste-modal');
  if (!modal) return;
  
  modal.classList.remove('hidden');
  
  // Déterminer le mode (nouveau ou édition)
  const isNew = !state.formValues.posteId;
  document.getElementById('poste-modal-title').textContent = isNew ? 'Nouveau poste' : 'Éditer le poste';
  
  // Remplir le formulaire
  populatePosteForm();
  
  // Attacher les listeners
  document.getElementById('btn-save-poste')?.addEventListener('click', savePoste);
  document.getElementById('btn-cancel-poste')?.addEventListener('click', closePosteModal);
}

function populatePosteForm() {
  const form = document.getElementById('poste-form');
  if (!form) return;
  
  form.innerHTML = '';
  
  const posteFields = [
    { key: 'Titre', label: 'Titre du poste', type: 'text', required: true },
    { key: 'Structure', label: 'Structure', type: 'reference', table: 'Structures', required: true },
    { key: 'Type_contrat', label: 'Type de contrat', type: 'choice', table: 'Postes2', field: 'Type_contrat' },
    { key: 'Responsable', label: 'Responsable', type: 'reference', table: 'Annuaire' },
    { key: 'Profil_recherche', label: 'Profil recherché', type: 'textarea' },
  ];
  
  posteFields.forEach(fieldInfo => {
    const value = state.formValues[fieldInfo.key] || '';
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'form-group';
    
    const label = `<label>${fieldInfo.label}${fieldInfo.required ? ' *' : ''}</label>`;
    
    if (fieldInfo.type === 'textarea') {
      fieldDiv.innerHTML = label + `<textarea id="poste-${fieldInfo.key}" placeholder="${fieldInfo.label}">${value}</textarea>`;
    } else if (fieldInfo.type === 'choice') {
      const choices = getChoicesForField(fieldInfo.table, fieldInfo.field);
      let optionsHtml = '<option value="">-- Sélectionner --</option>';
      choices.forEach(choice => {
        optionsHtml += `<option value="${choice}" ${choice === value ? 'selected' : ''}>${choice}</option>`;
      });
      fieldDiv.innerHTML = label + `<select id="poste-${fieldInfo.key}">${optionsHtml}</select>`;
    } else if (fieldInfo.type === 'reference') {
      const options = getTableOptions(fieldInfo.table);
      let optionsHtml = '<option value="">-- Sélectionner --</option>';
      options.forEach(opt => {
        const isSelected = value === opt.id || value === opt.name;
        optionsHtml += `<option value="${opt.id}" ${isSelected ? 'selected' : ''}>${opt.name}</option>`;
      });
      fieldDiv.innerHTML = label + `<select id="poste-${fieldInfo.key}">${optionsHtml}</select>`;
    } else {
      fieldDiv.innerHTML = label + `<input type="text" id="poste-${fieldInfo.key}" placeholder="${fieldInfo.label}" value="${value}">`;
    }
    
    form.appendChild(fieldDiv);
  });
}

async function savePoste() {
  debugLog('Sauvegarde poste...');
  
  const titre = document.getElementById('poste-Titre')?.value || '';
  const structure = document.getElementById('poste-Structure')?.value || '';
  
  if (!titre.trim() || !structure.trim()) {
    showToast('Titre du poste et Structure sont obligatoires', true);
    return;
  }
  
  try {
    const record = {
      fields: {
        Titre: titre,
        Projet: state.currentProjectId,
        Structure: structure,
        Type_contrat: document.getElementById('poste-Type_contrat')?.value || '',
        Responsable: document.getElementById('poste-Responsable')?.value || '',
        Profil_recherche: document.getElementById('poste-Profil_recherche')?.value || '',
      }
    };
    
    if (state.formValues.posteId) {
      record.id = state.formValues.posteId;
      await grist.docApi.addOrUpdateRecords('Postes2', [record]);
    } else {
      await grist.docApi.addRecords('Postes2', [record]);
    }
    
    showToast('Poste enregistré avec succès');
    closePosteModal();
    await loadAllTables();
    loadProjectPostes(state.currentProjectId);
  } catch (err) {
    debugLog('❌ Erreur sauvegarde poste:', err);
    showToast('Erreur: ' + err.message, true);
  }
}

function closePosteModal() {
  const modal = document.getElementById('poste-modal');
  if (modal) modal.classList.add('hidden');
  state.formValues = {};
}

/* =========================================================
   PERSONNES (ANNUAIRE)
   ========================================================= */
function loadPersons() {
  debugLog('Chargement personnes...');
  
  const container = document.getElementById('persons-list');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (state.tables.Annuaire.length === 0) {
    container.innerHTML = '<p style="padding: 16px; color: #999;">Aucune personne</p>';
    return;
  }
  
  state.tables.Annuaire.forEach(person => {
    const item = document.createElement('div');
    item.className = 'person-item';
    item.innerHTML = `
      <strong>${person.fields.Prenom || ''} ${person.fields.Nom || ''}</strong>
      <small>${person.fields.Email || 'N/A'}</small>
    `;
    item.addEventListener('click', () => openPersonEditor(person.id, person.fields));
    container.appendChild(item);
  });
}

function openPersonEditor(personId, fields) {
  debugLog('Édition personne:', personId);
  
  const modal = document.getElementById('person-modal');
  if (!modal) return;
  
  modal.classList.remove('hidden');
  
  const form = document.getElementById('person-form');
  form.innerHTML = `
    <div class="form-group">
      <label>Prénom</label>
      <input type="text" id="person-Prenom" value="${fields.Prenom || ''}">
    </div>
    <div class="form-group">
      <label>Nom</label>
      <input type="text" id="person-Nom" value="${fields.Nom || ''}">
    </div>
    <div class="form-group">
      <label>Email</label>
      <input type="email" id="person-Email" value="${fields.Email || ''}">
    </div>
    <div class="form-group">
      <label>Téléphone</label>
      <input type="tel" id="person-Telephone" value="${fields.Telephone || ''}">
    </div>
    <div class="form-group">
      <label>Organisme</label>
      <input type="text" id="person-Organisme" value="${fields.Organisme || ''}">
    </div>
    <div class="modal-actions">
      <button id="btn-save-person" class="btn btn-primary">Enregistrer</button>
      <button id="btn-cancel-person" class="btn btn-secondary">Annuler</button>
    </div>
  `;
  
  document.getElementById('btn-save-person')?.addEventListener('click', async () => {
    const prenom = document.getElementById('person-Prenom')?.value || '';
    const nom = document.getElementById('person-Nom')?.value || '';
    const email = document.getElementById('person-Email')?.value || '';
    
    if (!prenom.trim() || !nom.trim()) {
      showToast('Prénom et Nom sont obligatoires', true);
      return;
    }
    
    try {
      await grist.docApi.addOrUpdateRecords('Annuaire', [{
        id: personId,
        fields: {
          Prenom: prenom,
          Nom: nom,
          Email: email,
          Telephone: document.getElementById('person-Telephone')?.value || '',
          Organisme: document.getElementById('person-Organisme')?.value || '',
        }
      }]);
      
      showToast('Personne mise à jour');
      closePersonModal();
      await loadAllTables();
    } catch (err) {
      debugLog('❌ Erreur sauvegarde personne:', err);
      showToast('Erreur: ' + err.message, true);
    }
  });
  
  document.getElementById('btn-cancel-person')?.addEventListener('click', closePersonModal);
}

function closePersonModal() {
  const modal = document.getElementById('person-modal');
  if (modal) modal.classList.add('hidden');
}

/* =========================================================
   HELPER FUNCTIONS
   ========================================================= */
function getTableOptions(tableName) {
  const table = state.tables[tableName] || [];
  
  if (tableName === 'Annuaire') {
    return table.map(record => ({
      id: record.id,
      name: `${record.fields.Prenom || ''} ${record.fields.Nom || ''}`.trim()
    })).filter(opt => opt.name);
  }
  
  if (tableName === 'Structures') {
    return table.map(record => ({
      id: record.id,
      name: record.fields.Nom || record.fields.name || `Structure ${record.id}`
    }));
  }
  
  if (tableName === 'Programmes') {
    return table.map(record => ({
      id: record.id,
      name: record.fields.Titre || record.fields.name || `Programme ${record.id}`
    }));
  }
  
  if (tableName === 'Suivi_Instance') {
    return table.map(record => ({
      id: record.id,
      name: record.fields.Nom || record.fields.Titre || `Instance ${record.id}`
    }));
  }
  
  if (tableName === 'OPE') {
    return table.map(record => ({
      id: record.id,
      name: record.fields.Numero || record.fields.Nom || `OPE ${record.id}`
    }));
  }
  
  return table.map(record => ({
    id: record.id,
    name: record.fields.Titre || record.fields.Nom || `Item ${record.id}`
  }));
}

function getStructureName(structureId) {
  const structure = state.tables.Structures.find(s => s.id === structureId);
  return structure ? (structure.fields.Nom || structure.fields.name || `Structure ${structureId}`) : 'Inconnue';
}

function getChoicesForField(tableName, fieldName) {
  // Récupérer les choix uniques d'un champ dans une table
  const table = state.tables[tableName] || [];
  const choices = new Set();
  
  table.forEach(record => {
    const value = record.fields[fieldName];
    if (value) choices.add(value);
  });
  
  return Array.from(choices).sort();
}

function formatDateForInput(dateStr) {
  if (!dateStr) return '';
  // Convertir format français ou ISO en format input (YYYY-MM-DD)
  if (typeof dateStr === 'string' && dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  return dateStr;
}

/* =========================================================
   EVENT LISTENERS
   ========================================================= */
function attachEventListeners() {
  // Bouton retour
  const btnBack = document.getElementById('btn-back');
  if (btnBack) {
    btnBack.addEventListener('click', closeProject);
  }
  
  // Bouton nouveau projet
  const btnNewProject = document.getElementById('btn-new-project');
  if (btnNewProject) {
    btnNewProject.addEventListener('click', () => {
      debugLog('Création nouveau projet');
      // À implémenter selon vos besoins
      showToast('Création de projet: à implémenter', false);
    });
  }
  
  // Charger les personnes
  loadPersons();
}

/* =========================================================
   INITIALIZATION
   ========================================================= */
debugLog('🚀 Script en cours de chargement...');

grist.ready();
loadAllTables();

debugLog('✨ Script initialisé');
