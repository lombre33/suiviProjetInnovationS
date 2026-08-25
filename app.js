let gristHelper;
let currentProjectId = null;
let currentPersonId = null;
let postsCache = {};

document.addEventListener('DOMContentLoaded', async function() {
  gristHelper = window.grist;
  
  if (!gristHelper) {
    console.error('Grist helper not available');
    return;
  }

  // Initialiser l'interface
  initializeUI();
  
  // Charger les données initiales
  await loadInitialData();
  
  // Configurer les event listeners
  setupEventListeners();
});

// ============ INITIALISATION UI ============

function initializeUI() {
  // Onglets
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', function() {
      const tabName = this.getAttribute('data-tab');
      
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      this.classList.add('active');
      document.getElementById(tabName).classList.add('active');
    });
  });

  // Boutons principaux
  document.getElementById('btn-create-project').addEventListener('click', openProjectForm);
  document.getElementById('btn-create-person').addEventListener('click', openPersonForm);
  document.getElementById('btn-save-project').addEventListener('click', saveProject);
  document.getElementById('btn-save-person').addEventListener('click', savePerson);
  document.getElementById('btn-cancel-project').addEventListener('click', closeProjectForm);
  document.getElementById('btn-cancel-person').addEventListener('click', closePersonForm);

  // Modales
  document.getElementById('modal-project-form').addEventListener('click', function(e) {
    if (e.target === this) closeProjectForm();
  });
  document.getElementById('modal-person-form').addEventListener('click', function(e) {
    if (e.target === this) closePersonForm();
  });
  document.getElementById('modal-post-form').addEventListener('click', function(e) {
    if (e.target === this) closePostForm();
  });

  // Fermer avec Échap
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeProjectForm();
      closePersonForm();
      closePostForm();
    }
  });
}

// ============ CHARGEMENT DONNÉES ============

async function loadInitialData() {
  try {
    // Charger tous les programmes
    const programmes = await gristHelper.api.fetchTable('Programmes');
    const programmeSelect = document.getElementById('project-programme');
    programmeSelect.innerHTML = '<option value="">Sélectionner un programme...</option>';
    programmes.records.forEach(prog => {
      const option = document.createElement('option');
      option.value = prog.id;
      option.textContent = prog.Programme || prog.id;
      programmeSelect.appendChild(option);
    });

    // Charger toutes les structures
    const structures = await gristHelper.api.fetchTable('Structures');
    window.structuresData = structures.records;

    // Charger tous les établissements
    const etablissements = await gristHelper.api.fetchTable('Etablissements');
    window.etablissementsData = etablissements.records;

    // Charger les instances
    const instances = await gristHelper.api.fetchTable('Suivi_Instance');
    window.instancesData = instances.records;

    // Charger les écritures comptables (OPE)
    const ecritures = await gristHelper.api.fetchTable('EcritureComptables');
    window.ecrituresData = ecritures.records;

    // Charger les annuaires
    const annuaires = await gristHelper.api.fetchTable('Annuaire');
    window.annuairesData = annuaires.records;

    // Charger les postes
    const postes = await gristHelper.api.fetchTable('Postes2');
    window.postesData = postes.records;
    postes.records.forEach(poste => {
      postsCache[poste.id] = poste;
    });

    // Initialiser les autocomplete pour les porteurs
    setupAutocompletFields();

    console.log('Données initiales chargées avec succès');
  } catch (error) {
    console.error('Erreur lors du chargement des données:', error);
    showError('Erreur lors du chargement des données initiales');
  }
}

function setupAutocompletFields() {
  const fields = [
    'project-porteur-1', 'project-porteur-2', 'project-porteur-3',
    'project-vp-porteur-2', 'project-accompagnateur', 'project-vp-porteur-signataire'
  ];

  fields.forEach(fieldId => {
    const element = document.getElementById(fieldId);
    if (element) {
      element.addEventListener('input', function() {
        handleAutocomplete(this, window.annuairesData, 'Nom');
      });
    }
  });
}

function handleAutocomplete(inputElement, data, displayField) {
  const value = inputElement.value.toLowerCase();
  const resultsContainer = inputElement.nextElementSibling;

  if (!resultsContainer || !resultsContainer.classList.contains('autocomplete-results')) {
    const container = document.createElement('div');
    container.className = 'autocomplete-results';
    inputElement.parentNode.insertBefore(container, inputElement.nextSibling);
  }

  const container = inputElement.nextElementSibling;
  container.innerHTML = '';

  if (value.length === 0) return;

  const filtered = data.filter(item => 
    (item[displayField] || '').toLowerCase().includes(value)
  );

  filtered.slice(0, 5).forEach(item => {
    const div = document.createElement('div');
    div.className = 'autocomplete-item';
    div.textContent = item[displayField] || item.id;
    div.addEventListener('click', function() {
      inputElement.value = item[displayField] || item.id;
      inputElement.dataset.id = item.id;
      container.innerHTML = '';
    });
    container.appendChild(div);
  });
}

// ============ FORMULAIRE PROJET ============

function openProjectForm(projectId = null) {
  currentProjectId = projectId;
  const modal = document.getElementById('modal-project-form');
  const form = document.getElementById('project-form');

  if (projectId) {
    // Mode édition
    loadProjectData(projectId);
  } else {
    // Mode création
    form.reset();
    document.getElementById('project-type').value = 'Projet';
    document.getElementById('project-statut').value = 'En attente des dispo des fonds';
  }

  modal.style.display = 'block';
}

function closeProjectForm() {
  document.getElementById('modal-project-form').style.display = 'none';
  currentProjectId = null;
}

async function loadProjectData(projectId) {
  try {
    const projects = await gristHelper.api.fetchTable('Projets');
    const project = projects.records.find(p => p.id === projectId);

    if (project) {
      document.getElementById('project-programme').value = project.Programme || '';
      document.getElementById('project-name').value = project.Projet || '';
      document.getElementById('project-acronyme').value = project.Acronyme || '';
      document.getElementById('project-commentaire').value = project.comentaire_general_Suivi_projet || '';
      document.getElementById('project-statut').value = project.Statut_operationnel_projet || 'En attente des dispo des fonds';
      document.getElementById('project-type').value = project.Type_projet || 'Projet';
      
      // Porteurs
      if (project.Porteur_1) {
        const porteur1 = window.annuairesData.find(a => a.id === project.Porteur_1);
        if (porteur1) {
          document.getElementById('project-porteur-1').value = porteur1.Nom;
          document.getElementById('project-porteur-1').dataset.id = porteur1.id;
        }
      }
      
      // Instance
      if (project.Instance_ratachee) {
        document.getElementById('project-instance').value = project.Instance_ratachee;
      }

      // Date limite financement
      if (project.Date_limite_financement) {
        document.getElementById('project-date-limite').value = formatDateInput(project.Date_limite_financement);
      }

      // OPE
      if (project.Ligne_OPE && Array.isArray(project.Ligne_OPE)) {
        document.getElementById('project-ope').value = project.Ligne_OPE.join(',');
      }

      // Convention
      document.getElementById('project-convention-bool').checked = project.Convention_de_reversement || false;
      if (project.Partenaire_s_convention_reversement && Array.isArray(project.Partenaire_s_convention_reversement)) {
        document.getElementById('project-convention-partenaires').value = project.Partenaire_s_convention_reversement.join(',');
      }

      // Commentaire OPE
      document.getElementById('project-commentaire-ope').value = project.Commentaire_ligne_OPE || '';

      // Action OPE
      document.getElementById('project-action-ope').value = project.Action_Ligne_OPE_a_faire || 'à determiner';
    }
  } catch (error) {
    console.error('Erreur lors du chargement du projet:', error);
    showError('Erreur lors du chargement du projet');
  }
}

async function saveProject() {
  try {
    const projectData = {
      Projet: document.getElementById('project-name').value,
      Acronyme: document.getElementById('project-acronyme').value,
      Programme: document.getElementById('project-programme').value || null,
      comentaire_general_Suivi_projet: document.getElementById('project-commentaire').value,
      Statut_operationnel_projet: document.getElementById('project-statut').value,
      Type_projet: document.getElementById('project-type').value,
      Instance_ratachee: document.getElementById('project-instance').value || null,
      Date_limite_financement: document.getElementById('project-date-limite').value || null,
      Ligne_OPE: document.getElementById('project-ope').value ? 
        document.getElementById('project-ope').value.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v)) : [],
      Commentaire_ligne_OPE: document.getElementById('project-commentaire-ope').value,
      Action_Ligne_OPE_a_faire: document.getElementById('project-action-ope').value,
      Convention_de_reversement: document.getElementById('project-convention-bool').checked,
      Partenaire_s_convention_reversement: document.getElementById('project-convention-partenaires').value ?
        document.getElementById('project-convention-partenaires').value.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v)) : []
    };

    // Porteur 1
    const porteur1Input = document.getElementById('project-porteur-1');
    if (porteur1Input.dataset.id) {
      projectData.Porteur_1 = parseInt(porteur1Input.dataset.id);
    }

    if (currentProjectId) {
      await gristHelper.api.applyUserActions([
        ['UpdateRecord', 'Projets', currentProjectId, projectData]
      ]);
    } else {
      await gristHelper.api.applyUserActions([
        ['AddRecord', 'Projets', -1, projectData]
      ]);
    }

    showSuccess('Projet sauvegardé avec succès');
    closeProjectForm();
    refreshProjectsList();
  } catch (error) {
    console.error('Erreur lors de la sauvegarde du projet:', error);
    showError('Erreur lors de la sauvegarde du projet');
  }
}

// ============ FORMULAIRE PERSONNE ============

function openPersonForm(personId = null) {
  currentPersonId = personId;
  const modal = document.getElementById('modal-person-form');
  const form = document.getElementById('person-form');

  if (personId) {
    loadPersonData(personId);
  } else {
    form.reset();
  }

  modal.style.display = 'block';
}

function closePersonForm() {
  document.getElementById('modal-person-form').style.display = 'none';
  currentPersonId = null;
}

async function loadPersonData(personId) {
  try {
    const annuaires = await gristHelper.api.fetchTable('Annuaire');
    const person = annuaires.records.find(a => a.id === personId);

    if (person) {
      document.getElementById('person-nom').value = person.Nom || '';
      document.getElementById('person-prenom').value = person.Prenom || '';
      document.getElementById('person-email').value = person.Email || '';
      document.getElementById('person-telephone').value = person.Telephone || '';

      if (person.Poste_Associe) {
        const poste = postesCache[person.Poste_Associe];
        if (poste) {
          document.getElementById('person-poste').innerHTML = `
            <span id="poste-display">${poste.Titre || 'Poste'}</span>
            <button type="button" id="btn-edit-poste" class="btn-edit-poste">✏️</button>
          `;
          document.getElementById('btn-edit-poste').addEventListener('click', function(e) {
            e.preventDefault();
            openPostForm(person.Poste_Associe);
          });
        }
      }
    }
  } catch (error) {
    console.error('Erreur lors du chargement de la personne:', error);
    showError('Erreur lors du chargement de la personne');
  }
}

async function savePerson() {
  try {
    const nom = document.getElementById('person-nom').value.trim();
    const prenom = document.getElementById('person-prenom').value.trim();

    if (!nom || !prenom) {
      showError('Le nom et le prénom sont obligatoires');
      return;
    }

    const personData = {
      Nom: nom,
      Prenom: prenom,
      Email: document.getElementById('person-email').value.trim(),
      Telephone: document.getElementById('person-telephone').value.trim()
    };

    if (currentPersonId) {
      await gristHelper.api.applyUserActions([
        ['UpdateRecord', 'Annuaire', currentPersonId, personData]
      ]);
    } else {
      await gristHelper.api.applyUserActions([
        ['AddRecord', 'Annuaire', -1, personData]
      ]);
    }

    showSuccess('Personne sauvegardée avec succès');
    closePersonForm();
    refreshPersonsList();
  } catch (error) {
    console.error('Erreur lors de la sauvegarde de la personne:', error);
    showError('Erreur lors de la sauvegarde de la personne');
  }
}

// ============ FORMULAIRE POSTE ============

function openPostForm(postId = null) {
  const modal = document.getElementById('modal-post-form');
  const form = document.getElementById('post-form');

  if (postId) {
    loadPostData(postId);
  } else {
    form.reset();
  }

  modal.style.display = 'block';
}

function closePostForm() {
  document.getElementById('modal-post-form').style.display = 'none';
}

async function loadPostData(postId) {
  try {
    const poste = postesCache[postId];
    
    if (poste) {
      document.getElementById('post-titre').value = poste.Titre || '';
      document.getElementById('post-precisions').value = poste.Precisions_Poste || '';
      document.getElementById('post-structure').value = poste.Structure2 || '';
      document.getElementById('post-mission').value = poste.Mission_Principale || '';
      document.getElementById('post-employeur').value = poste.Employeur_tutelle || '';
      document.getElementById('post-date-fin').value = poste.Date_de_fin ? formatDateInput(poste.Date_de_fin) : '';
      
      document.getElementById('post-form').dataset.postId = postId;
    }
  } catch (error) {
    console.error('Erreur lors du chargement du poste:', error);
    showError('Erreur lors du chargement du poste');
  }
}

async function savePost() {
  try {
    const titre = document.getElementById('post-titre').value.trim();
    const structure = document.getElementById('post-structure').value.trim();

    if (!titre || !structure) {
      showError('Le titre du poste et la structure sont obligatoires pour créer un nouveau poste.');
      return;
    }

    const postData = {
      Titre: titre,
      Precisions_Poste: document.getElementById('post-precisions').value.trim(),
      Structure2: structure,
      Mission_Principale: document.getElementById('post-mission').value.trim(),
      Employeur_tutelle: document.getElementById('post-employeur').value.trim() || null,
      Date_de_fin: document.getElementById('post-date-fin').value || null
    };

    const postId = document.getElementById('post-form').dataset.postId;

    if (postId) {
      // Édition
      await gristHelper.api.applyUserActions([
        ['UpdateRecord', 'Postes2', parseInt(postId), postData]
      ]);
      showSuccess('Poste modifié avec succès');
    } else {
      // Création
      await gristHelper.api.applyUserActions([
        ['AddRecord', 'Postes2', -1, postData]
      ]);
      showSuccess('Poste créé avec succès');
    }

    closePostForm();
    // Recharger les données
    const postes = await gristHelper.api.fetchTable('Postes2');
    window.postesData = postes.records;
    postes.records.forEach(poste => {
      postesCache[poste.id] = poste;
    });
  } catch (error) {
    console.error('Erreur lors de la sauvegarde du poste:', error);
    showError('Erreur lors de la sauvegarde du poste');
  }
}

// ============ AUTOCOMPLETE DROPDOWNS ============

function setupDropdownAutocomplete(inputId, dataArray, displayField) {
  const input = document.getElementById(inputId);
  if (!input) return;

  input.addEventListener('input', function() {
    const value = this.value.toLowerCase();
    const resultsContainer = this.parentNode.querySelector('.dropdown-results') || 
      (() => {
        const div = document.createElement('div');
        div.className = 'dropdown-results';
        this.parentNode.appendChild(div);
        return div;
      })();

    resultsContainer.innerHTML = '';

    if (value.length === 0) {
      resultsContainer.style.display = 'none';
      return;
    }

    const filtered = dataArray.filter(item => 
      (item[displayField] || '').toLowerCase().includes(value)
    );

    if (filtered.length === 0) {
      resultsContainer.style.display = 'none';
      return;
    }

    filtered.slice(0, 8).forEach(item => {
      const div = document.createElement('div');
      div.className = 'dropdown-item';
      div.textContent = item[displayField] || item.id;
      div.addEventListener('click', () => {
        input.value = item[displayField] || item.id;
        input.dataset.id = item.id;
        resultsContainer.innerHTML = '';
        resultsContainer.style.display = 'none';
      });
      resultsContainer.appendChild(div);
    });

    resultsContainer.style.display = 'block';
  });
}

// ============ UTILITAIRES ============

function formatDateInput(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function showError(message) {
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert alert-error';
  alertDiv.textContent = message;
  document.body.insertBefore(alertDiv, document.body.firstChild);
  setTimeout(() => alertDiv.remove(), 5000);
}

function showSuccess(message) {
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert alert-success';
  alertDiv.textContent = message;
  document.body.insertBefore(alertDiv, document.body.firstChild);
  setTimeout(() => alertDiv.remove(), 3000);
}

function setupEventListeners() {
  // À personnaliser selon les besoins
}

async function refreshProjectsList() {
  try {
    const projects = await gristHelper.api.fetchTable('Projets');
    // Mettre à jour la liste des projets si affichée
  } catch (error) {
    console.error('Erreur lors du rafraîchissement des projets:', error);
  }
}

async function refreshPersonsList() {
  try {
    const people = await gristHelper.api.fetchTable('Annuaire');
    // Mettre à jour la liste des personnes si affichée
  } catch (error) {
    console.error('Erreur lors du rafraîchissement des personnes:', error);
  }
}

// ============ GESTION OPE ============

function populateOPEStructure() {
  const opeSelect = document.getElementById('project-ope');
  const selectedIds = opeSelect.value ? opeSelect.value.split(',').map(v => parseInt(v.trim())) : [];
  const structureDisplay = document.getElementById('project-ope-structure-display');

  if (selectedIds.length === 0) {
    structureDisplay.innerHTML = '';
    return;
  }

  if (selectedIds.length > 1) {
    structureDisplay.innerHTML = '<span style="color: red;">⚠️ Impossible de sélectionner plusieurs OPE. Veuillez en choisir une seule.</span>';
    return;
  }

  const selectedOpe = window.ecrituresData.find(e => e.id === selectedIds[0]);
  if (selectedOpe && selectedOpe.installe_chez) {
    const structure = window.structuresData.find(s => s.id === selectedOpe.installe_chez);
    if (structure) {
      structureDisplay.innerHTML = `<strong>${structure.Nom || structure.Acronyme}</strong>`;
    }
  } else {
    structureDisplay.innerHTML = '';
  }
}

// ============ INITIALISATION FORMULAIRE POSTE ============

document.addEventListener('DOMContentLoaded', async function() {
  // Configurer les dropdowns avec autocomplete
  setupDropdownAutocomplete('project-ope', window.ecrituresData || [], 'N_OPE');
  setupDropdownAutocomplete('project-convention-partenaires', window.etablissementsData || [], 'Acronyme');
  
  // Event listener pour OPE
  const opeSelect = document.getElementById('project-ope');
  if (opeSelect) {
    opeSelect.addEventListener('change', populateOPEStructure);
  }

  // Event listener pour sauvegarder poste
  const savePostBtn = document.getElementById('btn-save-post');
  if (savePostBtn) {
    savePostBtn.addEventListener('click', savePost);
  }

  const cancelPostBtn = document.getElementById('btn-cancel-post');
  if (cancelPostBtn) {
    cancelPostBtn.addEventListener('click', closePostForm);
  }
});
