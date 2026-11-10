/** Page To Do — vue agrégée des tâches en cours, par personne, répartie en 3
 * sous-onglets qui reprennent les pipelines existants (Notifications,
 * Conventions) et le futur statut Installation des fonds, plutôt que
 * d'inventer un 2e référentiel de statut par projet (rappel des statuts
 * existants, demande d'Antoine du 03/11/2026). Maquette validée le même jour
 * (https://claude.ai/artifact/CHavavrbxCiAnBwQ1ErQfJ) ; les 3 onglets ont été
 * renommés Notifications/Conventions/Installation sur retour d'Antoine
 * (harmoniser avec les noms déjà utilisés ailleurs dans le widget).
 *
 * Vue par défaut = mes tâches : un onglet entier est visible dès que le rôle
 * de la personne couvre cet onglet ; une tâche précise est visible en plus si
 * la personne est taguée sur son next_step_responsable (Projets, RefList →
 * Annuaire, créé par le fil Page Administratif — ne couvre que l'onglet
 * Conventions, aucun tag équivalent prévu pour Notifications/Installation à
 * ce jour).
 *
 * Rôle = déduit de la structure du poste (demande d'Antoine du 03/11/2026 :
 * pas de colonne à remplir à la main, pas d'ACL/groupe — uniquement pour
 * cette page, "pour le reste tout le monde voit tout"). Chemin :
 * Annuaire.Poste2 → Postes2.Structure2 → Structures, étiquette = Acronyme
 * (repli Nom_Complet), comparée aux préfixes de STRUCTURE_ROLE_RULES
 * ci-dessous. Règles confirmées le 03/11 : "Service Dev_*" et "Grands
 * Programmes*" → Notifications + Conventions ; "DR*" → Installation. Liste
 * donnée comme un premier jet par Antoine ("je vais te faire une liste des
 * valeurs et de leur rôle") : à compléter dans STRUCTURE_ROLE_RULES sans
 * toucher au reste du fichier.
 */
(function () {
  'use strict';
  const text = value => value == null ? '' : String(value);
  const escape = CoreUtils.escapeHtml;
  const normalized = value => text(value).trim().toLowerCase();
  const refId = value => (value && typeof value === 'object') ? (value.id ?? value) : value;
  const referencedIds = value => Array.isArray(value) ? value.filter(item => item !== 'L' && item != null && item !== 0) : [];
  const stripOrdinal = label => text(label).replace(/^\d+\)\s*/, '');

  // Mêmes libellés que NOTIF_STAGES/CONV_STAGES de page-administratif.js —
  // dupliqués plutôt qu'exportés, même convention que le reste du widget.
  const NOTIF_STAGES = [
    '1) Information projet saisies', '2) Notification_relecture', '3) Prette pour CTO',
    '4) complète', '5) envoyée pour signature VP', '6) Signée', '7) Transmise au porteur', '8) Archivee'
  ];
  const CONV_STAGES = [
    '1) Convention en redaction', '2) Convention en relecture',
    '3) Convention en signature', '4) Convention signée de toutes les parties'
  ];
  const CONV_LEGACY_STAGE_INDEX = {
    '2) Convention Relecture Partenaire(s)': 1,
    '3) Convention en signature UB': 2,
    '4) Convention en signature partenaire': 2,
    '5) Convention signée de toutes les parties': 3
  };
  // Statuts du fil "Refondre la page Installation des fonds" (livré 17da8be,
  // 03/11/2026) : Projets.Statut_installation_fonds (Choice), mêmes préfixes
  // ordinaux "N) " que NOTIF_STAGES/CONV_STAGES — lue défensivement malgré
  // tout (indexOf renvoie -1 sur une valeur imprévue), cet onglet reste vide
  // plutôt que de planter si la colonne venait à manquer.
  const INSTALL_STAGES = [
    '1) En attente ouverture', '2) Ouverture demandée à la DF', '3) Installé',
    '4) Reliquat à traiter', '5) Clôturer'
  ];
  const INSTALL_STATUS_FIELD = 'Statut_installation_fonds';
  // Tag "responsable" du next step (demande A.3 d'Antoine, posée sous
  // Conventions) : colonne confirmée le 03/11/2026 par le fil Page
  // Administratif — RefList → Annuaire, sur Projets uniquement (jamais sur
  // Notifications). Ne couvre donc que l'onglet Conventions.
  const NEXT_STEP_RESP_FIELD = 'next_step_responsable';
  // Préfixes sur l'étiquette de Structures (Acronyme, repli Nom_Complet) →
  // rôles To Do couverts. Comparaison exacte (sensible à la casse), comme
  // donnée par Antoine. Premier jet, à compléter à sa demande.
  const STRUCTURE_ROLE_RULES = [
    { startsWith: 'Service Dev_', roles: ['Notifications', 'Conventions'] },
    { startsWith: 'Grands Programmes', roles: ['Notifications', 'Conventions'] },
    { startsWith: 'DR', roles: ['Installation'] }
  ];

  const TAB_DEFS = {
    notif: { label: 'Notifications', stages: NOTIF_STAGES, stageColumn: { table: 'Notifications', col: 'notifications_Statut' } },
    conv: { label: 'Conventions', stages: CONV_STAGES, stageColumn: { table: 'Projets', col: 'Conventions_statut' } },
    install: { label: 'Installation', stages: INSTALL_STAGES, stageColumn: { table: 'Projets', col: INSTALL_STATUS_FIELD } }
  };

  function getProjects() { return (window.CoreState && CoreState.getTable('Projets')) || []; }
  function getNotifications() { return (window.CoreState && CoreState.getTable('Notifications')) || []; }
  function getAnnuaire() { return (window.CoreState && CoreState.getTable('Annuaire')) || []; }
  function getPostes() { return (window.CoreState && CoreState.getTable('Postes2')) || []; }
  function getStructures() { return (window.CoreState && CoreState.getTable('Structures')) || []; }
  function projectById(id) { return CoreUtils.findById(getProjects(), id); }
  function personById(id) { return CoreUtils.findById(getAnnuaire(), id); }
  function personName(person) {
    if (!person) return '';
    return text(person.nom_et_Prenom || [person.Prenom, person.NOM].filter(Boolean).join(' '));
  }
  function personNames(ids) { return ids.map(id => personName(personById(id))).filter(Boolean).join(', '); }
  function structureLabel(structure) { return text(structure && structure.Acronyme) || text(structure && structure.Nom_Complet); }
  // « Installé chez » d'un projet. Côté Grist, Ligne_OPE_installe_chez est une formule ReferenceList
  // vers Structures : la valeur reçue est ['L', id…], jamais un texte (le texte brut afficherait
  // « L,3 »). Un texte déjà prêt est gardé tel quel.
  function installedAtLabel(project) {
    const value = project.Ligne_OPE_installe_chez;
    if (value == null || value === '') return '';
    const ids = Array.isArray(value) ? referencedIds(value) : (typeof value === 'number' ? [value] : null);
    if (!ids) return text(value).trim();
    return ids.map(id => structureLabel(CoreUtils.findById(getStructures(), refId(id)))).filter(Boolean).join(', ');
  }
  // Rôle déduit de la structure du poste (voir l'en-tête du fichier) : aucune
  // saisie manuelle, aucune ACL — seulement un mode d'affichage par défaut.
  function personRoles(person) {
    if (!person) return [];
    const poste = CoreUtils.findById(getPostes(), refId(person.Poste2));
    const structure = poste && CoreUtils.findById(getStructures(), refId(poste.Structure2));
    const label = structureLabel(structure);
    if (!label) return [];
    const roles = new Set();
    STRUCTURE_ROLE_RULES.forEach(rule => { if (label.startsWith(rule.startsWith)) rule.roles.forEach(role => roles.add(role)); });
    return Array.from(roles);
  }

  // Même règle que page-administratif.js : un projet n'entre dans Conventions
  // que si sa case « Convention de reversement » est cochée.
  function needsConvention(project) {
    const value = project.Convention_de_reversement;
    return value === true || value === 1 || ['true', 'oui', 'cochee'].includes(normalized(value));
  }
  function convStageIndex(project) {
    const value = text(project.Conventions_statut);
    const idx = CONV_STAGES.indexOf(value);
    if (idx !== -1) return idx;
    if (Object.prototype.hasOwnProperty.call(CONV_LEGACY_STAGE_INDEX, value)) return CONV_LEGACY_STAGE_INDEX[value];
    const bare = normalized(stripOrdinal(value));
    return bare ? CONV_STAGES.findIndex(stage => normalized(stripOrdinal(stage)) === bare) : -1;
  }

  // Une tâche = { project, stageIdx, taggedIds, actionText }. taggedIds reste
  // vide pour Notifications et Installation : aucun tag "responsable" prévu
  // pour ces 2 domaines à ce jour.
  function tasksForTab(tabKey) {
    if (tabKey === 'notif') {
      return getNotifications().map(row => {
        const project = projectById(refId(row.Projet));
        if (!project) return null;
        const stageIdx = NOTIF_STAGES.indexOf(text(row.notifications_Statut));
        if (stageIdx === -1) return null;
        return { project, stageIdx, taggedIds: [], actionText: text(project.next_step || row.next_step) };
      }).filter(Boolean);
    }
    if (tabKey === 'conv') {
      return getProjects().filter(needsConvention).map(project => {
        const stageIdx = convStageIndex(project);
        if (stageIdx === -1) return null;
        return { project, stageIdx, taggedIds: referencedIds(project[NEXT_STEP_RESP_FIELD]), actionText: text(project.next_step) };
      }).filter(Boolean);
    }
    return getProjects().map(project => {
      const stageIdx = INSTALL_STAGES.indexOf(text(project[INSTALL_STATUS_FIELD]));
      if (stageIdx === -1) return null;
      const chezQui = installedAtLabel(project);
      const action = text(project.Action_Ligne_OPE_a_faire);
      return { project, stageIdx, taggedIds: [], actionText: chezQui ? `${action} — installé chez ${chezQui}` : action };
    }).filter(Boolean);
  }

  // --- Urgence (pastille de date de début) : dupliqué de page-administratif.js,
  // mêmes seuils pour Notifications/Conventions. Pas de pastille sur
  // Installation : aucune notion de date butoir définie pour ce domaine. ---
  const ICON_CALENDAR = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>';
  const ICON_CHEVRON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  const URGENCY_RULES = { notif: { redBelow: 7, orangeUpTo: 21, orangeInclusive: true }, conv: { redBelow: 14, orangeUpTo: 30, orangeInclusive: false } };
  const URGENCY_GREEN_ABOVE_DAYS = 60;
  const URGENCY_LABELS = { red: 'urgent', orange: 'à surveiller', green: 'pas d\'urgence', neutral: '' };
  let nowFn = () => new Date();
  function daysUntilStart(epochSeconds) {
    const now = nowFn();
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.floor((epochSeconds * 1000 - todayUtc) / 86400000);
  }
  function urgencyTone(side, days) {
    const rule = URGENCY_RULES[side];
    if (days < rule.redBelow) return 'red';
    if (rule.orangeInclusive ? days <= rule.orangeUpTo : days < rule.orangeUpTo) return 'orange';
    return days > URGENCY_GREEN_ABOVE_DAYS ? 'green' : 'neutral';
  }
  function relativeDays(days) {
    if (days === 0) return 'aujourd\'hui';
    if (days === 1) return 'demain';
    if (days === -1) return 'hier';
    return days > 0 ? `dans ${days} jours` : `il y a ${-days} jours`;
  }
  function startDateChip(project, side, isDone) {
    const raw = project.Date_debut_Projet;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return '';
    const iso = CoreUtils.gristDateToInput(raw);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    const days = daysUntilStart(raw);
    const tone = isDone ? 'neutral' : urgencyTone(side, days);
    const [year, month, day] = iso.split('-');
    const sentence = [relativeDays(days), URGENCY_LABELS[tone]].filter(Boolean).join(', ');
    return `<span class="admin-start is-${tone}" data-urgency="${tone}" title="${escape(`Début du projet le ${day}/${month}/${year} (${sentence})`)}">` +
      `${ICON_CALENDAR}<time datetime="${escape(iso)}">${escape(`${day}/${month}/${year}`)}</time>` +
      `<span class="visually-hidden"> — début du projet, ${escape(sentence)}</span></span>`;
  }

  // --- État de la page (session) ---
  let activeTab = 'notif';
  let viewMode = 'me'; // 'me' | 'all' | id Annuaire (string)
  let currentPersonId = null;
  let detectedEmail = '';
  let manualPersonId = '';
  const panelState = {};
  function panelKey(tab, idx) { return `${tab}:${idx}`; }
  let pendingTodoPrefs = null;
  function ensurePanelState(tab, idx, isInitiallyEmpty) {
    const key = panelKey(tab, idx);
    if (!panelState[key]) {
      const collapsed = (pendingTodoPrefs && pendingTodoPrefs.collapsed[tab])
        ? pendingTodoPrefs.collapsed[tab].has(idx)
        : !!isInitiallyEmpty;
      panelState[key] = { collapsed };
    }
    return panelState[key];
  }

  function resolveViewer() {
    if (viewMode === 'all') return null; // null = pas de filtre, tout est visible
    const personId = viewMode === 'me' ? currentPersonId : Number(viewMode);
    if (!personId) return { id: null, roles: [] };
    return { id: personId, roles: personRoles(personById(personId)) };
  }

  function annotate(task, tabLabel, viewer) {
    if (!viewer) return Object.assign({}, task, { visible: true });
    const roleMatch = viewer.roles.includes(tabLabel);
    const tagMatch = viewer.id != null && task.taggedIds.includes(viewer.id);
    return Object.assign({}, task, { visible: roleMatch || tagMatch });
  }

  function card(task, tabKey) {
    const project = task.project;
    const identity = `<button type="button" class="admin-card-identity" data-open-project="${escape(project.id)}">` +
      `<span class="project-acronym">${escape(text(project.Acronyme || project.Projet))}</span>` +
      `<span class="admin-card-caption">${escape(text(project.Projet))}</span></button>`;
    const who = task.taggedIds.length
      ? `<span class="todo-tag-pill"><span class="legend-dot legend-dot-tag"></span>${escape(personNames(task.taggedIds))}</span>`
      : `<span class="todo-role-pill"><span class="legend-dot legend-dot-role"></span>Rôle : ${escape(TAB_DEFS[tabKey].label)}</span>`;
    const actionText = text(task.actionText);
    const action = `<span class="todo-action-text">${actionText ? escape(actionText) : '—'}</span>`;
    const isDone = task.stageIdx === TAB_DEFS[tabKey].stages.length - 1;
    const urgency = tabKey === 'install' ? '' : startDateChip(project, tabKey, isDone);
    return `<div class="admin-card todo-card">${identity}<span class="todo-card-who">${who}</span><span class="todo-card-action">${action}</span>${urgency}</div>`;
  }

  function buildPanels(tabKey, viewer) {
    const def = TAB_DEFS[tabKey];
    const stageHelp = window.HelpTooltip?.markup(def.stageColumn.table, def.stageColumn.col) || '';
    const tasks = tasksForTab(tabKey).map(t => annotate(t, def.label, viewer));
    return def.stages.map((stageLabel, idx) => {
      const items = tasks.filter(t => t.stageIdx === idx && t.visible);
      const state = ensurePanelState(tabKey, idx, items.length === 0);
      const key = panelKey(tabKey, idx);
      const collapsedCls = state.collapsed ? ' is-collapsed' : '';
      const label = stripOrdinal(stageLabel);
      return {
        key, label, count: items.length, state,
        html: `<section class="admin-panel${collapsedCls}" aria-labelledby="todo-panel-${escape(key)}">` +
          `<header class="admin-panel-header"><h4 id="todo-panel-${escape(key)}">${escape(label)}${stageHelp}</h4>` +
          `<span class="kanban-count">${items.length}</span><div class="kanban-column-actions">` +
          `<button type="button" class="kanban-icon-btn" data-toggle-panel="${escape(key)}" aria-expanded="${!state.collapsed}" aria-label="${state.collapsed ? 'Déplier' : 'Replier'} le volet ${escape(label)}">${ICON_CHEVRON}</button>` +
          `</div></header><div class="admin-panel-body mode-rows">${items.length ? items.map(t => card(t, tabKey)).join('') : '<p class="kanban-empty">Aucune tâche</p>'}</div></section>`
      };
    });
  }

  function updateTabUI() {
    document.querySelectorAll('[data-todo-tab]').forEach(btn => {
      const isActive = btn.dataset.todoTab === activeTab;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });
  }

  function updateCount(panels) {
    const el = document.getElementById('todo-count');
    if (!el) return;
    const total = panels.reduce((sum, p) => sum + p.count, 0);
    el.textContent = `${total} tâche${total === 1 ? '' : 's'} visible${total === 1 ? '' : 's'}`;
  }

  // Non identifié(e) : l'email Grist ne correspond à aucune fiche de l'Annuaire (ou n'a pas pu
  // être lu) — la personne dit une fois qui elle est, le choix est retenu (Todo_personne).
  function updateIdentifyNotice() {
    const el = document.getElementById('todo-identify-notice');
    if (!el) return;
    const unidentified = viewMode === 'me' && !currentPersonId;
    el.hidden = !unidentified;
    if (!unidentified) return;
    const message = document.getElementById('todo-identify-text');
    if (message) message.textContent = detectedEmail
      ? `Votre adresse Grist (${detectedEmail}) ne correspond à aucune fiche de l'Annuaire.`
      : 'Votre adresse Grist n\'a pas pu être lue.';
    const select = document.getElementById('todo-me-select');
    if (select) {
      const people = getAnnuaire().map(p => ({ id: p.id, name: personName(p) })).filter(p => p.name)
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      select.innerHTML = '<option value="">Qui êtes-vous ?</option>' + people.map(p => `<option value="${escape(p.id)}">${escape(p.name)}</option>`).join('');
    }
  }

  // Personnes sélectionnables dans "voir les tâches de…" : celles qui ont un
  // rôle (couvrent un onglet entier) OU qui sont taguées sur au moins un
  // next_step_responsable (sinon un responsable jamais doté de rôle n'aurait
  // aucun moyen d'être prévisualisé).
  function taggedPersonIds() {
    const ids = new Set();
    getProjects().forEach(project => referencedIds(project[NEXT_STEP_RESP_FIELD]).forEach(id => ids.add(id)));
    return ids;
  }

  function updateViewSelect() {
    const select = document.getElementById('todo-view-select');
    if (!select) return;
    const tagged = taggedPersonIds();
    const people = getAnnuaire()
      .filter(p => personRoles(p).length > 0 || tagged.has(p.id))
      .map(p => ({ id: p.id, name: personName(p) }))
      .filter(p => p.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const options = [
      `<option value="me">Mes tâches${currentPersonId ? '' : ' (non identifié)'}</option>`,
      `<option value="all">Toute l'équipe</option>`
    ].concat(people.map(p => `<option value="${escape(p.id)}">Voir : ${escape(p.name)}</option>`));
    select.innerHTML = options.join('');
    select.value = viewMode;
  }

  function render() {
    const root = document.getElementById('todo-panels');
    if (!root) return;
    if (!window.CoreState || !CoreState.getTable('Projets')) return;
    const viewer = resolveViewer();
    const panels = buildPanels(activeTab, viewer);
    root.innerHTML = panels.map(p => p.html).join('');
    updateTabUI();
    updateCount(panels);
    updateIdentifyNotice();
    root.querySelectorAll('[data-open-project]').forEach(btn => btn.addEventListener('click', () => {
      const project = projectById(btn.dataset.openProject);
      if (project && window.ProjectModal?.open) window.ProjectModal.open(project);
      else if (window.openProject) window.openProject(btn.dataset.openProject);
    }));
    root.querySelectorAll('[data-toggle-panel]').forEach(btn => btn.addEventListener('click', () => {
      const state = panelState[btn.dataset.togglePanel];
      if (state) state.collapsed = !state.collapsed;
      render();
      saveTodoUserPreferences();
    }));
  }

  // --- Préférences utilisateur (table Grist partagée Preferences_Widget, même
  // mécanisme que le Kanban Projets / page Administratif) + identification de
  // "vous" via l'email déjà capturé par Email_utilisateur, mis en
  // correspondance avec Annuaire.Email. ---
  const PREFS_TABLE = 'Preferences_Widget';
  const PREFS_ROWID_STORAGE_KEY = 'suiviProjetInnovationS:prefsRowId';
  const EMAIL_TRIGGER_COLUMN = { id: 'Email_utilisateur', type: 'Text', isFormula: false, formula: 'user.Email', recalcWhen: 0 };
  const TODO_PREFS_COLUMNS = [
    { id: 'Todo_onglet_actif', type: 'Text' },
    { id: 'Todo_vue', type: 'Text' },
    { id: 'Todo_personne', type: 'Text' },
    { id: 'Todo_email', type: 'Text' },
    { id: 'Todo_notif_repliees', type: 'Text' },
    { id: 'Todo_conv_repliees', type: 'Text' },
    { id: 'Todo_install_repliees', type: 'Text' }
  ];
  let prefsRowId = null;
  const encodeIdxList = indices => indices.join(',');
  const decodeIdxList = value => text(value).split(',').map(s => s.trim()).filter(Boolean).map(Number);
  function getCachedPrefsRowId() {
    try { const raw = localStorage.getItem(PREFS_ROWID_STORAGE_KEY); return raw ? Number(raw) : null; }
    catch (err) { return null; }
  }
  function setCachedPrefsRowId(id) {
    try { localStorage.setItem(PREFS_ROWID_STORAGE_KEY, String(id)); }
    catch (err) { /* navigation privée / stockage bloqué : tant pis */ }
  }

  const emailsOf = value => text(value).split(/[;,\s]+/).map(normalized).filter(Boolean);
  // Email Grist d'abord (une fiche peut en porter plusieurs : « a@x ; b@y »), puis le choix
  // « C'est moi » retenu dans Todo_personne quand l'Annuaire n'a pas cette adresse.
  function resolveCurrentPerson(email, manualId) {
    detectedEmail = normalized(email);
    const byEmail = detectedEmail ? getAnnuaire().find(p => emailsOf(p.Email).includes(detectedEmail)) : null;
    const manual = !byEmail && manualId ? personById(manualId) : null;
    currentPersonId = byEmail ? byEmail.id : (manual ? manual.id : null);
  }

  // Grist ne remplit Email_utilisateur qu'à la CRÉATION d'une ligne. Deux cas où la ligne de la personne ne
  // l'a pas : elle date d'avant la colonne, ou la formule d'origine (qui se référençait elle-même) a stocké
  // une erreur « CircularRefError » à la place (cellule = tableau, jamais une adresse). On corrige la
  // formule (user.Email), on crée une ligne-sonde où Grist met l'email de qui la crée, on la lit, on la
  // supprime aussitôt, puis on réécrit l'email dans la ligne de la personne : les autres pages, qui lisent
  // Email_utilisateur, en profitent aussi. Une adresse valide contient « @ » ; tout le reste est ignoré.
  const validEmail = value => { const s = typeof value === 'string' ? value.trim() : ''; return s.includes('@') ? s : ''; };
  const unavailableMarker = () => `(indisponible) ${new Date().toISOString().slice(0, 10)}`; // réessayé le lendemain
  async function emailFormulaAlreadyFixed(docApi) {
    try {
      const [tables, cols] = await Promise.all([docApi.fetchTable('_grist_Tables'), docApi.fetchTable('_grist_Tables_column')]);
      const tableRef = tables.id[tables.tableId.indexOf(PREFS_TABLE)];
      for (let i = 0; i < cols.id.length; i++) {
        if (cols.parentId[i] === tableRef && cols.colId[i] === 'Email_utilisateur') return !cols.isFormula[i] && String(cols.formula[i] || '').trim() === EMAIL_TRIGGER_COLUMN.formula;
      }
    } catch (err) { /* métadonnées illisibles : la formule est corrigée comme avant */ }
    return false;
  }
  async function probeUserEmail() {
    const docApi = CoreGrist.gristInstance.docApi;
    try {
      // Modifier le SCHÉMA du document pendant qu'on l'utilise (formule d'une colonne partagée par tous les utilisateurs) n'est pas
      // anodin : on ne le fait que si la formule n'est pas déjà la bonne (métadonnées illisibles : on corrige, comme avant).
      if (!(await emailFormulaAlreadyFixed(docApi))) {
        try {
          await docApi.applyUserActions([['ModifyColumn', PREFS_TABLE, 'Email_utilisateur', { isFormula: false, formula: EMAIL_TRIGGER_COLUMN.formula, recalcWhen: 0 }]]);
        } catch (err) { console.warn('Correction de la formule Email_utilisateur impossible (droits ?) :', err.message); }
      }
      const result = await docApi.applyUserActions([['AddRecord', PREFS_TABLE, null, {}]]);
      const probeId = CoreUtils.extractAddedRecordId(result);
      let email = '';
      try {
        const probe = (await CoreGrist.getTable(PREFS_TABLE)).find(r => r.id === probeId);
        email = validEmail(probe && probe.Email_utilisateur);
      } finally {
        await docApi.applyUserActions([['RemoveRecord', PREFS_TABLE, probeId]]);
        CoreGrist.invalidateTable(PREFS_TABLE);
      }
      return email;
    } catch (err) {
      console.warn('Lecture de l\'email Grist (ligne-sonde) impossible :', err.message);
      return '';
    }
  }
  async function writeOwnPrefs(fields) {
    try {
      await CoreGrist.gristInstance.docApi.applyUserActions([['UpdateRecord', PREFS_TABLE, prefsRowId, fields]]);
      CoreGrist.invalidateTable(PREFS_TABLE); // les pages chargées ensuite (Instances) relisent la ligne à jour
    } catch (err) { console.warn('Enregistrement de l\'identité To Do a échoué :', err.message); }
  }

  async function chooseMe(personId) {
    manualPersonId = personId ? String(personId) : '';
    resolveCurrentPerson(detectedEmail, manualPersonId);
    window.renderTodo();
    if (prefsRowId) await writeOwnPrefs({ Todo_personne: manualPersonId });
  }

  async function loadTodoUserPreferences() {
    if (!window.CoreGrist || !CoreGrist.gristInstance) return;
    try {
      await CoreGrist.ensureTable(PREFS_TABLE, [EMAIL_TRIGGER_COLUMN, ...TODO_PREFS_COLUMNS]);
      // Email_utilisateur aussi : ensureTable ne crée que les tables absentes, une table de préférences
      // antérieure à cette colonne ne l'aurait jamais reçue.
      await CoreGrist.ensureColumns(PREFS_TABLE, [EMAIL_TRIGGER_COLUMN, ...TODO_PREFS_COLUMNS]);
      let rows = await CoreGrist.getTable(PREFS_TABLE, { shared: true }); // lecture partagée au démarrage (js/app.js)
      const cachedId = getCachedPrefsRowId();
      let row = cachedId != null ? rows.find(r => r.id === cachedId) : null;
      const createdNow = !row;
      if (!row) {
        // Première utilisation dans ce navigateur : nouvelle ligne, normalement
        // déjà créée par loadKanbanUserPreferences() avant celui-ci (js/app.js).
        const result = await CoreGrist.gristInstance.docApi.applyUserActions([['AddRecord', PREFS_TABLE, null, {}]]);
        CoreGrist.invalidateTable(PREFS_TABLE); // la ligne vient d'être ajoutée : la prochaine lecture partagée doit la contenir
        prefsRowId = CoreUtils.extractAddedRecordId(result);
        setCachedPrefsRowId(prefsRowId);
        // Relue pour y trouver l'email que Grist vient d'y poser (avant, cette 1re ouverture restait « non identifié »).
        rows = await CoreGrist.getTable(PREFS_TABLE);
        row = rows.find(r => r.id === prefsRowId);
        if (!row) return;
      }
      prefsRowId = row.id;
      const stored = text(row.Todo_email).trim();
      let email = validEmail(row.Email_utilisateur) || validEmail(row.Todo_email);
      if (!email && stored !== unavailableMarker()) {
        email = await probeUserEmail();
        await writeOwnPrefs(email ? { Email_utilisateur: email, Todo_email: email } : { Todo_email: unavailableMarker() });
      } else if (email && !validEmail(row.Email_utilisateur)) {
        await writeOwnPrefs({ Email_utilisateur: email });
      }
      manualPersonId = text(row.Todo_personne).trim();
      resolveCurrentPerson(email, manualPersonId);
      if (createdNow) return; // ligne neuve : aucune préférence enregistrée à appliquer
      // Ligne déjà là (créée par le Kanban au tout premier lancement) mais sans préférence To Do : même règle qu'Administratif
      // et Installation, les volets vides démarrent repliés. Sans ce garde-fou, des listes vides seraient lues comme
      // « aucun volet replié » et tous les volets, vides compris, s'afficheraient dépliés.
      const hasSavedPreferences = !!(text(row.Todo_onglet_actif) || text(row.Todo_vue) ||
        text(row.Todo_notif_repliees) || text(row.Todo_conv_repliees) || text(row.Todo_install_repliees));
      if (!hasSavedPreferences) return;
      if (text(row.Todo_onglet_actif) && TAB_DEFS[row.Todo_onglet_actif]) activeTab = row.Todo_onglet_actif;
      if (text(row.Todo_vue)) viewMode = row.Todo_vue;
      pendingTodoPrefs = {
        collapsed: {
          notif: new Set(decodeIdxList(row.Todo_notif_repliees)),
          conv: new Set(decodeIdxList(row.Todo_conv_repliees)),
          install: new Set(decodeIdxList(row.Todo_install_repliees))
        }
      };
    } catch (err) {
      console.warn('Chargement des préférences To Do a échoué :', err.message);
    }
  }

  async function saveTodoUserPreferences() {
    if (!prefsRowId || !window.CoreGrist?.gristInstance) return;
    const collect = tab => encodeIdxList(Object.keys(panelState)
      .filter(key => key.startsWith(`${tab}:`) && panelState[key].collapsed)
      .map(key => Number(key.split(':')[1])));
    const fields = {
      Todo_onglet_actif: activeTab,
      Todo_vue: viewMode,
      Todo_notif_repliees: collect('notif'),
      Todo_conv_repliees: collect('conv'),
      Todo_install_repliees: collect('install')
    };
    try {
      await CoreGrist.gristInstance.docApi.applyUserActions([['UpdateRecord', PREFS_TABLE, prefsRowId, fields]]);
    } catch (err) {
      console.warn('Enregistrement des préférences To Do a échoué :', err.message);
    }
  }

  function init() {
    document.querySelectorAll('[data-todo-tab]').forEach(btn => btn.addEventListener('click', () => {
      activeTab = btn.dataset.todoTab;
      render();
      saveTodoUserPreferences();
    }));
    document.getElementById('todo-view-select')?.addEventListener('change', event => {
      viewMode = event.target.value;
      render();
      updateIdentifyNotice();
      saveTodoUserPreferences();
    });
    document.getElementById('todo-me-select')?.addEventListener('change', event => { if (event.target.value) chooseMe(event.target.value); });
    document.getElementById('todo-reset')?.addEventListener('click', () => {
      activeTab = 'notif';
      viewMode = 'me';
      updateViewSelect();
      render();
      saveTodoUserPreferences();
    });
    updateViewSelect();
    render();
  }

  window.renderTodo = function () { updateViewSelect(); render(); };
  window.loadTodoUserPreferences = loadTodoUserPreferences;
  // Seuils d'urgence exposés pour les tests (même patron que window.AdministratifUrgency).
  window.TodoUrgency = { setClock(fn) { nowFn = typeof fn === 'function' ? fn : () => new Date(); } };
  // Pour les tests : l'état des volets vit dans cette fermeture et traverse les tests ; on repart de volets jamais construits.
  window.TodoTesting = { resetPanelState() { Object.keys(panelState).forEach(key => delete panelState[key]); pendingTodoPrefs = null; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
