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
  },
  currentProjectId: null,   // null => création
  formValues: {},           // valeurs du formulaire projet en cours
  personTargetField: null,  // quel champ (Porteur_1, etc.) est en cours de création
};

/* =========================================================
   INITIALISATION GRIST
   ========================================================= */
grist.ready({
  requiredAccess: 'full',
});

async function loadAllTables() {
  try {
    state.tables.Projets = await grist.docApi.fetchTable('Projets');
    state.tables.Annuaire = await grist.docApi.fetchTable('Annuaire');
    state.tables.Postes2 = await grist.docApi.fetchTable('Postes2');
    state.tables.Structures = await grist.docApi.fetchTable('Structures');
    state.tables.Programmes = await grist.docApi.fetchTable('Programmes');
    renderProjectsList();
  } catch (err) {
    showToast('Erreur de chargement des tables : ' + err.message, true);
  }
}

grist.onRecords(() => {}); // placeholder si vous voulez écouter les changements de vue liée
loadAllTables();

/* =========================================================
   HELPERS GENERIQUES
   ========================================================= */

function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  t.classList.toggle('error', isError);
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.add('hidden'), 4000);
}

/** Convertit une colonne fetchTable (columnar) en liste de records {id, ...cols} */
function toRecords(columnarTable) {
  if (!columnarTable || !columnarTable.id) return [];
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
   COMPOSANT GENERIQUE : SearchSelect (réf. Grist ou Choice)
   ========================================================= */

function initSearchSelect(container) {
  const field = container.dataset.field;
  const tableName = container.dataset.table;
  const displayField = container.dataset.display;
  const isChoice = tableName === '__choice__';
  const choices = isChoice ? container.dataset.choices.split(',') : null;
  const defaultVal = container.dataset.default || '';

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
    const records = toRecords(state.tables[tableName]);
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
          state.formValues[field] = isChoice ? opt.id : opt.id; // id Grist ou valeur choice
          dropdown.classList.add('hidden');
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
    input.value = label;
    input.classList.add('has-value');
    state.formValues[field] = id;
  };
}

function initAllSearchSelects(root = document) {
  root.querySelectorAll('.search-select').forEach(initSearchSelect);
}

/* =========================================================
   COMPOSANT : PersonSelect (Annuaire + création à la volée)
   ========================================================= */

function initPersonSelect(container) {
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

    // Option "créer une nouvelle personne"
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
  root.querySelectorAll('.person-select').forEach(initPersonSelect);
}

/* =========================================================
   MODALE : CREATION D'UNE PERSONNE (+ poste en cascade)
   ========================================================= */

function openPersonModal(targetField, prefillQuery) {
  state.personTargetField = targetField;

  const modal = document.getElementById('modal-person');
  modal.classList.remove('hidden');

  // reset champs
  document.getElementById('np-Prenom').value = '';
  document.getElementById('np-NOM').value = '';
  document.getElementById('np-Email').value = '';
  document.getElementById('np-Telephone').value = '';
  document.getElementById('npp-Titre').value = '';
  document.getElementById('npp-Precisions_Poste').value = '';
  document.getElementById('npp-Mission_Principale').value = '';
  document.getElementById('npp-Date_de_fin').value = '';

  // pré-remplissage grossier si l'utilisateur a tapé "Prenom Nom"
  if (prefillQuery) {
    const parts = prefillQuery.trim().split(' ');
    if (parts.length >= 2) {
      document.getElementById('np-Prenom').value = parts[0];
      document.getElementById('np-NOM').value = parts.slice(1).join(' ');
    } else {
      document.getElementById('np-NOM').value = prefillQuery;
    }
  }

  document.querySelector('input[name="poste-mode"][value="existing"]').checked = true;
  document.getElementById('poste-existing-block').classList.remove('hidden');
  document.getElementById('poste-new-block').classList.add('hidden');

  // (re)initialise les search-select internes à la modale
  initAllSearchSelects(modal);
}

document.querySelectorAll('input[name="poste-mode"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    const isNew = e.target.value === 'new';
    document.getElementById('poste-existing-block').classList.toggle('hidden', isNew);
    document.getElementById('poste-new-block').classList.toggle('hidden', !isNew);
  });
});

document.getElementById('btn-cancel-person').addEventListener('click', () => {
  document.getElementById('modal-person').classList.add('hidden');
});

document.getElementById('btn-save-person').addEventListener('click', async () => {
  const prenom = document.getElementById('np-Prenom').value.trim();
  const nom = document.getElementById('np-NOM').value.trim();

  if (!prenom || !nom) {
    showToast('Le prénom et le nom sont obligatoires.', true);
    return;
  }

  const posteMode = document.querySelector('input[name="poste-mode"]:checked').value;
  let posteId = null;

  try {
    if (posteMode === 'new') {
      const titre = document.getElementById('npp-Titre').value.trim();
      const structureContainer = document.querySelector('#poste-new-block .search-select[data-field="npp-Structure2"]');
      const structureId = structureContainer ? structureContainer._getValue?.() ?? state.formValues['npp-Structure2'] : null;

      if (!titre || !structureId) {
        showToast('Titre du poste et Structure sont obligatoires pour créer un nouveau poste.', true);
        return;
      }

      const posteFields = {
        Titre: titre,
        Precisions_Poste: document.getElementById('npp-Precisions_Poste').value.trim(),
        Structure2: structureId,
        Type_de_poste: state.formValues['npp-Type_de_poste'] || '',
        Categorie: state.formValues['npp-Categorie'] || '',
        type_de_contrat: state.formValues['npp-type_de_contrat'] || '',
        Mission_Principale: document.getElementById('npp-Mission_Principale').value.trim(),
      };

      const dateFin = document.getElementById('npp-Date_de_fin').value;
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

    // Création de la personne dans Annuaire
    const annuaireFields = {
      Prenom: prenom,
      NOM: nom,
      Email: document.getElementById('np-Email').value.trim(),
      Telephone: document.getElementById('np-Telephone').value.trim(),
    };
    if (posteId) annuaireFields.Poste2 = posteId;

    const resultPerson = await grist.docApi.applyUserActions([
      ['AddRecord', 'Annuaire', null, annuaireFields]
    ]);
    const newPersonId = resultPerson.retValues[0];

    // Rafraîchir la table Annuaire / Postes2 en mémoire
    state.tables.Annuaire = await grist.docApi.fetchTable('Annuaire');
    state.tables.Postes2 = await grist.docApi.fetchTable('Postes2');

    // Injecter la sélection dans le champ d'origine du formulaire projet
    const label = `${prenom} ${nom.toUpperCase()}`;
    const targetContainer = document.querySelector(`.person-select[data-field="${state.personTargetField}"]`);
    if (targetContainer && targetContainer._setValue) {
      targetContainer._setValue(newPersonId, label);
    }

    document.getElementById('modal-person').classList.add('hidden');
    showToast(`${label} a été ajouté(e) à l'annuaire.`);
    checkEmployeurWarning();

  } catch (err) {
    showToast('Erreur lors de la création : ' + err.message, true);
  }
});

/* =========================================================
   VUE LISTE DES PROJETS
   ========================================================= */

function renderProjectsList(filterText = '') {
  const projects = toRecords(state.tables.Projets);
  const tbody = document.getElementById('projects-tbody');
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

document.getElementById('search-projects').addEventListener('input', (e) => {
  renderProjectsList(e.target.value);
});

/* =========================================================
   VUE FICHE PROJET (création / édition)
   ========================================================= */

function openProjectView(projectId = null) {
  state.currentProjectId = projectId;
  state.formValues = {};

  document.getElementById('view-list').classList.add('hidden');
  document.getElementById('view-project').classList.remove('hidden');

  const title = document.getElementById('project-title');

  // reset champs texte simples
  document.getElementById('f-Projet').value = '';
  document.getElementById('f-Acronyme').value = '';
  document.getElementById('f-comentaire_general_Suivi_projet').value = '';

  // (ré)initialise tous les composants search-select / person-select
  initAllSearchSelects(document.getElementById('view-project'));
  initAllPersonSelects(document.getElementById('view-project'));

  if (projectId) {
    title.textContent = 'Édition du projet';
    const rec = toRecords(state.tables.Projets).find(p => p.id === projectId);
    if (rec) fillProjectForm(rec);
  } else {
    title.textContent = 'Nouveau projet';
  }

  document.getElementById('employeur-warning').classList.add('hidden');
}

function fillProjectForm(rec) {
  document.getElementById('f-Projet').value = rec.Projet || '';
  document.getElementById('f-Acronyme').value = rec.Acronyme || '';
  document.getElementById('f-comentaire_general_Suivi_projet').value = rec.comentaire_general_Suivi_projet || '';

  const setRef = (field, id, tableName, displayField) => {
    const container = document.querySelector(`.search-select[data-field="${field}"]`);
    if (!container) return;
    const label = findLabelForRef(tableName, id, displayField);
    if (container._setValue) container._setValue(id, label);
  };

  setRef('Programme', rec.Programme, 'Programmes', 'Programme');
  if (container_TypeProjet()) container_TypeProjet()._setValue(rec.Type_projet, rec.Type_projet);
  if (container_Statut()) container_Statut()._setValue(rec.Statut_operationnel_projet, rec.Statut_operationnel_projet);

  const setPerson = (field, id) => {
    const container = document.querySelector(`.person-select[data-field="${field}"]`);
    if (!container) return;
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

function container_TypeProjet() {
  return document.querySelector('.search-select[data-field="Type_projet"]');
}
function container_Statut() {
  return document.querySelector('.search-select[data-field="Statut_operationnel_projet"]');
}

document.getElementById('btn-back').addEventListener('click', () => {
  document.getElementById('view-project').classList.add('hidden');
  document.getElementById('view-list').classList.remove('hidden');
});

document.getElementById('btn-new-project').addEventListener('click', () => openProjectView(null));

/* Vérifie si un des porteurs a un employeur hors UB, affiche un bandeau non bloquant */
function checkEmployeurWarning() {
  const banner = document.getElementById('employeur-warning');
  const porteurFields = ['Porteur_1', 'Porteur_2', 'Porteur_3'];
  let hasExternal = false;

  for (const field of porteurFields) {
    const id = state.formValues[field];
    if (!id) continue;
    const personne = toRecords(state.tables.Annuaire).find(r => r.id === id);
    if (!personne || !personne.Poste2) continue;
    const poste = toRecords(state.tables.Postes2).find(p => p.id === personne.Poste2);
    if (!poste || !poste.Employeur_tutelle) continue;
    // Hypothèse: un id d'établissement != celui de l'UB (id à ajuster selon vos données réelles)
    // Pour la POC on considère juste "un employeur est renseigné et différent du 1er établissement de la table"
    hasExternal = true; // simplifié pour la POC — cf. note ci-dessous
  }

  banner.classList.toggle('hidden', !hasExternal);
}

/* =========================================================
   ENREGISTREMENT DU PROJET
   ========================================================= */

document.getElementById('btn-save-project').addEventListener('click', async () => {
  const projetNom = document.getElementById('f-Projet').value.trim();
  const acronyme = document.getElementById('f-Acronyme').value.trim();
  const programmeId = document.querySelector('.search-select[data-field="Programme"]')?._getValue?.();
  const porteur1Id = state.formValues['Porteur_1'];

  if (!projetNom || !acronyme || !programmeId || !porteur1Id) {
    showToast('Merci de renseigner au minimum : Nom du projet, Acronyme, Programme et Porteur 1.', true);
    return;
  }

  const fields = {
    Projet: projetNom,
    Acronyme: acronyme,
    comentaire_general_Suivi_projet: document.getElementById('f-comentaire_general_Suivi_projet').value.trim(),
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
    document.getElementById('view-project').classList.add('hidden');
    document.getElementById('view-list').classList.remove('hidden');
    renderProjectsList();

  } catch (err) {
    showToast('Erreur lors de l\'enregistrement : ' + err.message, true);
  }
});

/* =========================================================
   ONGLETS (les 3 autres sont désactivés dans cette POC)
   ========================================================= */

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('disabled')) {
      showToast('Cet onglet sera disponible dans une prochaine version.');
      return;
    }
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});