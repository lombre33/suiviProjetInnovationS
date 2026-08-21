// ============================================================
// STATE MANAGEMENT
// ============================================================

const state = {
  tables: {},
  formValues: {},
  currentProjectId: null,
  personTargetField: null,
};

// ============================================================
// GRIST INIT
// ============================================================

async function loadAllTables() {
  try {
    console.log('Chargement des tables...');
    state.tables.Projets = await grist.docApi.fetchTable('Projets');
    state.tables.Annuaire = await grist.docApi.fetchTable('Annuaire');
    state.tables.Postes2 = await grist.docApi.fetchTable('Postes2');
    state.tables.Structures = await grist.docApi.fetchTable('Structures');
    state.tables.Programmes = await grist.docApi.fetchTable('Programmes');
    state.tables.Etablissements = await grist.docApi.fetchTable('Etablissements');
    console.log('Tables chargées :', state.tables);
    renderProjectsList();
  } catch (err) {
    console.error('Erreur de chargement des tables :', err);
    showToast('Erreur de chargement des tables : ' + err.message, true);
  }
}

grist.ready({
  requiredAccess: 'full',
  onRecord: (record) => {},
}).then(() => {
  console.log('Grist ready');
  loadAllTables();
});

// ============================================================
// UTILITIES
// ============================================================

function toRecords(table) {
  if (!table) return [];
  return Object.values(table).filter(row => row.id !== undefined);
}

function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = 'toast ' + (isError ? 'toast-error' : 'toast-success');
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function getTutelleOptionsForStructure(structureId) {
  if (!structureId) return [];

  const structures = toRecords(state.tables.Structures);
  const structure = structures.find(s => s.id === structureId);
  if (!structure) return [];

  const tutelleFields = [
    'Etablissement_Tutuelle_gestionaire',
    'Co_tutelle_1_Principale',
    'Co_tutelle_2_Principale',
    'Tutuelle_Secondaire_1',
    'Tutuelle_Secondaire_2',
  ];

  const etablissements = toRecords(state.tables.Etablissements || []);
  const seen = new Set();
  const options = [];

  tutelleFields.forEach(field => {
    const etabId = structure[field];
    if (!etabId || seen.has(etabId)) return;
    seen.add(etabId);

    const etab = etablissements.find(e => e.id === etabId);
    const label = etab ? (etab.Acronyme || etab.Nom || `#${etabId}`) : `#${etabId}`;
    options.push({ id: etabId, label });
  });

  return options;
}

function checkEmployeurWarning() {
  const warning = document.getElementById('warning-employeur');
  if (!warning) return;

  const porteurs = ['Porteur_1', 'Porteur_2', 'Porteur_3', 'VP_porteur_2'];
  let hasExternalEmployeur = false;

  porteurs.forEach(field => {
    const personId = state.formValues[field];
    if (!personId) return;

    const annuaire = toRecords(state.tables.Annuaire);
    const person = annuaire.find(p => p.id === personId);
    if (!person || !person.Poste2) return;

    const postes = toRecords(state.tables.Postes2);
    const poste = postes.find(po => po.id === person.Poste2);
    if (!poste || !poste.Employeur_tutelle) return;

    const etablissements = toRecords(state.tables.Etablissements);
    const etab = etablissements.find(e => e.id === poste.Employeur_tutelle);
    if (etab && etab.Acronyme && !etab.Acronyme.includes('UB')) {
      hasExternalEmployeur = true;
    }
  });

  if (hasExternalEmployeur) {
    warning.classList.remove('hidden');
  } else {
    warning.classList.add('hidden');
  }
}

// ============================================================
// SEARCH SELECT COMPONENT
// ============================================================

function initSearchSelect(container, dynamicOptions = null) {
  if (!container) return;
  
  const field = container.dataset.field;
  const tableName = container.dataset.table;
  const displayField = container.dataset.display;
  const isChoice = tableName === '__choice__';
  const isDynamic = tableName === '__dynamic__';
  const choices = isChoice ? (container.dataset.choices || '').split(',') : null;
  const defaultVal = container.dataset.default || '';

  container.innerHTML = `
    <input type="text" class="ss-input" placeholder="Rechercher ou sélectionner..." autocomplete="off">
    <div class="ss-dropdown hidden"></div>
  `;

  const input = container.querySelector('.ss-input');
  const dropdown = container.querySelector('.ss-dropdown');

  if (defaultVal) {
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
    if (isDynamic) {
      const opts = container._dynamicOptions || [];
      return opts.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));
    }
    const records = toRecords(state.tables[tableName] || {});
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
          input.value = opt.label;
          input.classList.add('has-value');
          state.formValues[field] = opt.id;
          dropdown.classList.add('hidden');
          if (container._onSelect) container._onSelect(opt.id, opt.label);
        });
        dropdown.appendChild(div);
      });
    }

    dropdown.classList.remove('hidden');
  }

  input.addEventListener('focus', () => renderDropdown(input.value));
  input.addEventListener('input', () => {
    input.classList.remove('has-value');
    state.formValues[field] = null;
    renderDropdown(input.value);
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) dropdown.classList.add('hidden');
  });

  container._getValue = () => state.formValues[field];
  container._setValue = (id, label) => {
    input.value = label || '';
    input.classList.toggle('has-value', !!label);
    state.formValues[field] = id;
  };
  container._setDynamicOptions = (opts) => {
    container._dynamicOptions = opts;
    input.value = '';
    input.classList.remove('has-value');
    state.formValues[field] = null;
  };
}

function initAllSearchSelects(parentEl) {
  if (!parentEl) return;
  const containers = parentEl.querySelectorAll('.search-select:not([data-table="__dynamic__"])');
  containers.forEach(container => {
    initSearchSelect(container);
  });
}

// ============================================================
// PERSON MODAL (Créer une personne + poste)
// ============================================================

function openPersonModal(targetField, prefillQuery) {
  state.personTargetField = targetField;

  const modal = document.getElementById('modal-person');
  if (!modal) {
    showToast('Modal non trouvée', true);
    return;
  }

  modal.classList.remove('hidden');

  // Reset champs
  const resetFields = [
    'np-Prenom', 'np-NOM', 'np-Email', 'np-Telephone',
    'npp-Titre', 'npp-Precisions_Poste', 'npp-Mission_Principale', 'npp-Date_de_fin'
  ];
  
  resetFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  if (prefillQuery) {
    const parts = prefillQuery.trim().split(' ');
    if (parts.length >= 2) {
      const prenomEl = document.getElementById('np-Prenom');
      const nomEl = document.getElementById('np-NOM');
      if (prenomEl) prenomEl.value = parts[0];
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

  // Initialise les search-select statiques
  initAllSearchSelects(modal);

  // Branchement dynamique structure -> tutelle
  const structureContainer = modal.querySelector('.search-select[data-field="npp-Structure2"]');
  const employeurContainer = document.getElementById('npp-employeur-container');
  const employeurPlaceholder = document.getElementById('npp-employeur-placeholder');

  if (structureContainer && employeurContainer && employeurPlaceholder) {
    initSearchSelect(employeurContainer);
    employeurContainer.classList.add('hidden');
    employeurPlaceholder.classList.remove('hidden');

    structureContainer._onSelect = (structureId) => {
      const options = getTutelleOptionsForStructure(structureId);

      if (options.length === 0) {
        employeurContainer.classList.add('hidden');
        employeurPlaceholder.textContent = "Aucune tutelle trouvée pour cette structure.";
        employeurPlaceholder.classList.remove('hidden');
        return;
      }

      employeurContainer._setDynamicOptions(options);
      employeurContainer.classList.remove('hidden');
      employeurPlaceholder.classList.add('hidden');

      if (options.length === 1) {
        employeurContainer._setValue(options[0].id, options[0].label);
      }
    };
  }
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
  btnSavePerson.addEventListener('click', async () => {
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
        const employeurContainer = document.getElementById('npp-employeur-container');

        const structureId = structureContainer?._getValue?.();
        const employeurId = employeurContainer?._getValue?.();

        if (!titre || !structureId) {
          showToast('Titre du poste et Structure sont obligatoires.', true);
          return;
        }
        if (!employeurId) {
          showToast('Merci de sélectionner l\'employeur / tutelle.', true);
          return;
        }

        const posteFields = {
          Titre: titre,
          Precisions_Poste: (document.getElementById('npp-Precisions_Poste')?.value || '').trim(),
          Structure2: structureId,
          Employeur_tutelle: employeurId,
          Mission_Principale: (document.getElementById('npp-Mission_Principale')?.value || '').trim(),
        };

        const dateFin = document.getElementById('npp-Date_de_fin')?.value;
        if (dateFin) {
          posteFields.Date_de_fin = Math.floor(new Date(dateFin).getTime() / 1000);
        }

        const result = await grist.docApi.applyUserActions([
          ['AddRecord', 'Postes2', null, posteFields]
        ]);
        posteId = result.retValues[0];

      } else {
        const existingContainer = document.querySelector('#poste-existing-block .search-select[data-field="np-Poste2"]');
        posteId = existingContainer?._getValue?.() ?? null;
      }

      const annuaireFields = {
        Prenom: prenom,
        NOM: nom,
        Email: (document.getElementById('np-Email')?.value || '').trim(),
        Telephone: (document.getElementById('np-Telephone')?.value || '').trim(),
      };
      if (posteId) annuaireFields.Poste2 = posteId;

      const resultPerson = await grist.docApi.applyUserActions([
        ['AddRecord', 'Annuaire', null, annuaireFields]
      ]);
      const newPersonId = resultPerson.retValues[0];

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
      showToast('Erreur lors de la création : ' + err.message, true);
    }
  });
}

// Radio toggle poste existing/new
document.querySelectorAll('input[name="poste-mode"]').forEach(radio => {
  radio.addEventListener('change', () => {
    if (radio.value === 'existing') {
      const existingBlock = document.getElementById('poste-existing-block');
      const newBlock = document.getElementById('poste-new-block');
      if (existingBlock) existingBlock.classList.remove('hidden');
      if (newBlock) newBlock.classList.add('hidden');
      initAllSearchSelects(existingBlock);
    } else {
      const existingBlock = document.getElementById('poste-existing-block');
      const newBlock = document.getElementById('poste-new-block');
      if (existingBlock) existingBlock.classList.add('hidden');
      if (newBlock) newBlock.classList.remove('hidden');
      initAllSearchSelects(newBlock);
    }
  });
});

// ============================================================
// PROJECT LIST VIEW
// ============================================================

function renderProjectsList() {
  const view = document.getElementById('view-list');
  if (!view) {
    console.error('view-list introuvable');
    return;
  }

  const projects = toRecords(state.tables.Projets || {});
  console.log('Projets à afficher :', projects.length, projects);

  const searchInput = document.getElementById('search-projects');
  const searchQuery = searchInput ? searchInput.value : '';

  const filtered = projects.filter(p => {
    const q = searchQuery.toLowerCase();
    return (p.Acronyme || '').toLowerCase().includes(q) ||
           (p.Projet || '').toLowerCase().includes(q);
  });

  const tbody = view.querySelector('tbody');
  if (!tbody) {
    console.error('tbody introuvable');
    return;
  }

  tbody.innerHTML = '';

  if (filtered.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="4" style="text-align: center; padding: 20px;">Aucun projet trouvé</td>';
    tbody.appendChild(tr);
    return;
  }

  filtered.forEach(project => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${project.Acronyme || '-'}</td>
      <td>${project.Projet || '-'}</td>
      <td>${project.Statut_operationnel_projet || '-'}</td>
      <td>
        <button class="btn-icon" title="Éditer">✎</button>
        <button class="btn-icon" title="Supprimer">🗑</button>
      </td>
    `;

    tr.querySelector('button:first-of-type').addEventListener('click', () => {
      openProjectForm(project.id);
    });

    tr.querySelector('button:last-of-type').addEventListener('click', async () => {
      if (confirm(`Supprimer le projet ${project.Acronyme} ?`)) {
        try {
          await grist.docApi.applyUserActions([
            ['RemoveRecord', 'Projets', project.id]
          ]);
          state.tables.Projets = await grist.docApi.fetchTable('Projets');
          renderProjectsList();
          showToast('Projet supprimé.');
        } catch (err) {
          showToast('Erreur : ' + err.message, true);
        }
      }
    });

    tbody.appendChild(tr);
  });
}

const searchInput = document.getElementById('search-projects');
if (searchInput) {
  searchInput.addEventListener('input', renderProjectsList);
}

const btnNewProject = document.getElementById('btn-new-project');
if (btnNewProject) {
  btnNewProject.addEventListener('click', () => {
    state.currentProjectId = null;
    state.formValues = {};
    const viewList = document.getElementById('view-list');
    const viewProject = document.getElementById('view-project');
    if (viewList) viewList.classList.add('hidden');
    if (viewProject) viewProject.classList.remove('hidden');
    renderProjectForm();
  });
}

// ============================================================
// PROJECT FORM VIEW
// ============================================================

function openProjectForm(projectId) {
  state.currentProjectId = projectId;
  const project = toRecords(state.tables.Projets || {}).find(p => p.id === projectId);

  if (project) {
    state.formValues = {
      Programme: project.Programme,
      Projet: project.Projet,
      Acronyme: project.Acronyme,
      comentaire_general_Suivi_projet: project.comentaire_general_Suivi_projet,
      Statut_operationnel_projet: project.Statut_operationnel_projet,
      Type_projet: project.Type_projet,
      Porteur_1: project.Porteur_1,
      Porteur_2: project.Porteur_2,
      Porteur_3: project.Porteur_3,
      VP_porteur_2: project.VP_porteur_2,
      Accompagnateur: project.Accompagnateur,
    };
  } else {
    state.formValues = {
      Statut_operationnel_projet: 'En attente des dispo des fonds',
      Type_projet: 'projet',
    };
  }

  const viewList = document.getElementById('view-list');
  const viewProject = document.getElementById('view-project');
  if (viewList) viewList.classList.add('hidden');
  if (viewProject) viewProject.classList.remove('hidden');
  renderProjectForm();
}

function renderProjectForm() {
  const form = document.getElementById('form-project');
  if (!form) {
    console.error('form-project introuvable');
    return;
  }

  form.innerHTML = `
    <div class="form-grid">
      <div class="form-group">
        <label>Programme *</label>
        <div class="search-select" data-field="Programme" data-table="Programmes" data-display="Programme"></div>
      </div>
      <div class="form-group">
        <label>Nom du projet *</label>
        <input type="text" id="Projet" placeholder="Ex: InnovationS 2024">
      </div>
      <div class="form-group">
        <label>Acronyme *</label>
        <input type="text" id="Acronyme" placeholder="Ex: INV24">
      </div>
      <div class="form-group full">
        <label>Commentaire général suivi</label>
        <textarea id="comentaire_general_Suivi_projet" placeholder="Notes générales..."></textarea>
      </div>
      <div class="form-group">
        <label>Statut opérationnel *</label>
        <div class="search-select"
             data-field="Statut_operationnel_projet"
             data-table="__choice__"
             data-choices="En attente des dispo des fonds,En cours,Terminé,Suspendu"
             data-default="En attente des dispo des fonds"></div>
      </div>
      <div class="form-group">
        <label>Type de projet *</label>
        <div class="search-select"
             data-field="Type_projet"
             data-table="__choice__"
             data-choices="projet,Ingenierie_creation,Ingenierie_renouvellement,reattribution,prolongation,myphd+"
             data-default="projet"></div>
      </div>
    </div>

    <div id="warning-employeur" class="warning-box hidden">
      ⚠️ Au moins un porteur a un employeur hors UB. Une convention sera probablement nécessaire.
    </div>

    <h3>Porteurs et accompagnateurs</h3>
    <div class="form-grid">
      <div class="form-group">
        <label>Porteur 1 *</label>
        <div class="person-select" data-field="Porteur_1"></div>
      </div>
      <div class="form-group">
        <label>Porteur 2</label>
        <div class="person-select" data-field="Porteur_2"></div>
      </div>
      <div class="form-group">
        <label>Porteur 3</label>
        <div class="person-select" data-field="Porteur_3"></div>
      </div>
      <div class="form-group">
        <label>VP Porteur 2</label>
        <div class="person-select" data-field="VP_porteur_2"></div>
      </div>
      <div class="form-group">
        <label>Accompagnateur</label>
        <div class="person-select" data-field="Accompagnateur"></div>
      </div>
    </div>

    <div class="form-actions">
      <button id="btn-cancel-project" class="btn btn-secondary">Annuler</button>
      <button id="btn-save-project" class="btn btn-primary">Enregistrer</button>
    </div>
  `;

  // Charge les valeurs du formulaire
  Object.keys(state.formValues).forEach(field => {
    const value = state.formValues[field];
    const input = document.getElementById(field);
    if (input && (typeof value === 'string' || typeof value === 'number')) {
      input.value = value || '';
    }
  });

  // Initialise les search-select classiques
  initAllSearchSelects(form);

  // Initialise les person-select
  form.querySelectorAll('.person-select').forEach(container => {
    const field = container.dataset.field;
    const personId = state.formValues[field];

    container.innerHTML = `
      <div class="person-input-wrapper">
        <input type="text" class="person-input" placeholder="Chercher une personne..." autocomplete="off">
        <button type="button" class="btn-person-add">+ Ajouter</button>
        <div class="person-dropdown hidden"></div>
      </div>
    `;

    const input = container.querySelector('.person-input');
    const dropdown = container.querySelector('.person-dropdown');
    const btnAdd = container.querySelector('.btn-person-add');

    // Affiche la personne sélectionnée
    if (personId) {
      const annuaire = toRecords(state.tables.Annuaire);
      const person = annuaire.find(p => p.id === personId);
      if (person) {
        input.value = `${person.Prenom} ${person.NOM}`;
        input.classList.add('has-value');
      }
    }

    input.addEventListener('focus', () => {
      const query = input.value.toLowerCase();
      const annuaire = toRecords(state.tables.Annuaire);
      const matches = annuaire
        .filter(p => {
          const fullName = `${p.Prenom || ''} ${p.NOM || ''}`.toLowerCase();
          return fullName.includes(query) || (p.Email || '').toLowerCase().includes(query);
        })
        .slice(0, 20);

      dropdown.innerHTML = '';
      if (matches.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'person-option empty';
        emptyDiv.textContent = 'Aucune correspondance';
        dropdown.appendChild(emptyDiv);
      } else {
        matches.forEach(person => {
          const div = document.createElement('div');
          div.className = 'person-option';
          div.textContent = `${person.Prenom} ${person.NOM}`;
          div.addEventListener('click', () => {
            input.value = `${person.Prenom} ${person.NOM}`;
            input.classList.add('has-value');
            state.formValues[field] = person.id;
            dropdown.classList.add('hidden');
            checkEmployeurWarning();
          });
          dropdown.appendChild(div);
        });
      }
      dropdown.classList.remove('hidden');
    });

    input.addEventListener('input', () => {
      input.classList.remove('has-value');
      state.formValues[field] = null;
      input.dispatchEvent(new Event('focus'));
    });

    btnAdd.addEventListener('click', (e) => {
      e.preventDefault();
      openPersonModal(field, input.value);
    });

    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });

    container._setValue = (id, label) => {
      input.value = label;
      input.classList.add('has-value');
      state.formValues[field] = id;
      dropdown.classList.add('hidden');
    };
  });

  // Event listeners
  const btnCancel = document.getElementById('btn-cancel-project');
  if (btnCancel) {
    btnCancel.addEventListener('click', () => {
      const viewList = document.getElementById('view-list');
      const viewProject = document.getElementById('view-project');
      if (viewProject) viewProject.classList.add('hidden');
      if (viewList) viewList.classList.remove('hidden');
      renderProjectsList();
    });
  }

  const btnSave = document.getElementById('btn-save-project');
  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const programmeId = state.formValues['Programme'];
      const projet = (document.getElementById('Projet')?.value || '').trim();
      const acronyme = (document.getElementById('Acronyme')?.value || '').trim();

      if (!programmeId || !projet || !acronyme) {
        showToast('Programme, Nom et Acronyme sont obligatoires.', true);
        return;
      }

      const fields = {
        Programme: programmeId,
        Projet: projet,
        Acronyme: acronyme,
        comentaire_general_Suivi_projet: (document.getElementById('comentaire_general_Suivi_projet')?.value || '').trim(),
        Statut_operationnel_projet: state.formValues['Statut_operationnel_projet'] || 'En attente des dispo des fonds',
        Type_projet: state.formValues['Type_projet'] || 'projet',
        Porteur_1: state.formValues['Porteur_1'] || null,
        Porteur_2: state.formValues['Porteur_2'] || null,
        Porteur_3: state.formValues['Porteur_3'] || null,
        VP_porteur_2: state.formValues['VP_porteur_2'] || null,
        Accompagnateur: state.formValues['Accompagnateur'] || null,
      };

      try {
        if (state.currentProjectId) {
          await grist.docApi.applyUserActions([
            ['UpdateRecord', 'Projets', state.currentProjectId, fields]
          ]);
          showToast('Projet mis à jour.');
        } else {
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
        showToast('Erreur lors de l\'enregistrement : ' + err.message, true);
      }
    });
  }
}

// ============================================================
// TABS
// ============================================================

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('disabled')) {
      showToast('Cet onglet sera disponible dans une prochaine version.');
      return;
    }
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const tabId = 'tab-' + btn.dataset.tab;
    const tabContent = document.getElementById(tabId);
    if (tabContent) tabContent.classList.add('active');
  });
});
