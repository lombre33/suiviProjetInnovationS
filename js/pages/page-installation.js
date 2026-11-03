/** Page Installation des fonds — 3 colonnes DIESE / Ailleurs / Sans ligne OPE,
 * chacune découpée en volets par étape (glisser-déposer, même patron que
 * l'onglet Conventions de js/pages/page-administratif.js). Maquette validée
 * par Antoine le 03/11/2026 (https://claude.ai/artifact/V2Y6KUVgYviy8A5umgzuWS).
 *
 * Colonne (DIESE/Ailleurs/Sans ligne OPE) déduite de Lignes_OPE.installe_chez
 * (Reference → Structures), jamais d'un choix manuel : un projet ne change
 * donc jamais de colonne par glisser-déposer, seulement d'étape.
 *
 * Statut_installation_fonds (Choice sur Projets) est une colonne CRÉÉE par ce
 * module au premier lancement après livraison (ensureColumns ci-dessous) :
 * elle n'existe pas dans docs/grist_structure. Valeur vide/inconnue = 1re
 * étape ("En attente ouverture"), pas de ligne masquée en attendant que
 * Statut_installation_fonds soit renseigné.
 */
(function () {
  'use strict';

  // Acronyme Grist de la structure DIESE — confirmé par Antoine le 03/11/2026
  // (sinon, seul changement nécessaire si Grist utilise un autre libellé).
  const DIESE_ACRONYM = 'DIESE';

  const STAGES = [
    '1) En attente ouverture',
    '2) Ouverture demandée à la DF',
    '3) Installé',
    '4) Reliquat à traiter',
    '5) Clôturer'
  ];
  const STATUT_COLUMN = { id: 'Statut_installation_fonds', type: 'Choice', widgetOptions: JSON.stringify({ choices: STAGES }) };

  const SIDE_DEFS = [
    { key: 'diese', title: 'Lignes installées DIESE' },
    { key: 'ailleurs', title: 'Lignes installées ailleurs' },
    { key: 'non_classe', title: 'Sans ligne OPE' }
  ];

  // Mêmes valeurs Choice que Action_Ligne_OPE_a_faire (project-modal.js,
  // OPE_OPTIONS) — dupliqué ici plutôt qu'importé, comme le reste des pages
  // (chacune porte ses propres libellés, cf. NOTIF_STAGES/CONV_STAGES).
  const ACTION_LABELS = {
    'Creation de ligne': 'Création de ligne',
    'Prolongation de ligne': 'Prolongation',
    're-Abondement de ligne': 'Ré-abondement',
    'à determiner': 'À déterminer'
  };

  const ICON_CHEVRON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  const ICON_EYE_OFF = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.3 20.3 0 0 1-3.22 4.44M14.12 14.12a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
  const ICON_EYE = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
  const ICON_GRIP = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.7"></circle><circle cx="15" cy="6" r="1.7"></circle><circle cx="9" cy="12" r="1.7"></circle><circle cx="15" cy="12" r="1.7"></circle><circle cx="9" cy="18" r="1.7"></circle><circle cx="15" cy="18" r="1.7"></circle></svg>';

  const text = value => value == null ? '' : String(value);
  const escape = CoreUtils.escapeHtml;
  const tableRows = name => (window.CoreState && CoreState.getTable(name)) || [];
  const rowById = (tableName, id) => tableRows(tableName).find(row => String(row.id) === String(id));
  const refId = value => (value && typeof value === 'object') ? (value.id ?? value) : value;
  const referencedIds = value => Array.isArray(value) ? value.filter(item => item !== 'L' && item != null && item !== 0) : [];
  const refLabel = (value, tableName, fields = []) => {
    if (Array.isArray(value)) return value.filter(item => item !== 'L').map(item => refLabel(item, tableName, fields)).filter(Boolean).join(', ');
    if (!value) return '';
    const row = tableName ? rowById(tableName, refId(value)) : null;
    const candidate = row || (value && typeof value === 'object' ? value : null);
    if (candidate) {
      for (const name of fields) if (candidate[name] != null && candidate[name] !== '') return text(candidate[name]);
      return text(candidate.NOM || candidate.nom_et_Prenom || candidate.name || candidate.label || candidate.Acronyme || candidate.id);
    }
    return text(value);
  };
  const valueLabel = (value, tableName, fields) => Array.isArray(value) ? value.map(item => refLabel(item, tableName, fields)).filter(Boolean).join(', ') : refLabel(value, tableName, fields);
  const programmeLabel = value => valueLabel(value, 'Programmes', ['Programme']);
  const instanceLabel = value => {
    if (Array.isArray(value)) return value.map(instanceLabel).filter(Boolean).join(', ');
    const suivi = rowById('Suivi_Instance', refId(value));
    if (suivi) return refLabel(suivi, null, ['Nom', 'name']) || valueLabel(suivi.Instance, 'Instances', ['Instances']);
    return valueLabel(value, 'Instances', ['Instances']);
  };
  const normalized = value => text(value).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const field = (project, names) => { for (const name of names) if (project[name] != null && project[name] !== '') return project[name]; return ''; };
  const stripOrdinal = label => text(label).replace(/^\d+\)\s*/, '');

  function getProjects() { return (window.CoreState && CoreState.getTable('Projets')) || []; }
  function projectById(id) { return getProjects().find(p => String(p.id) === String(id)); }

  // Une seule ligne OPE par projet en pratique, malgré le schéma ReferenceList
  // (même lecture que refreshInstalleChez() dans project-modal.js).
  function ligneOpeFor(project) {
    const ids = referencedIds(project.Ligne_OPE);
    return ids.length ? rowById('Lignes_OPE', ids[0]) : null;
  }
  function structureFor(ligne) {
    return ligne && ligne.installe_chez ? rowById('Structures', ligne.installe_chez) : null;
  }
  function sideForProject(project) {
    const ligne = ligneOpeFor(project);
    if (!ligne) return 'non_classe';
    const structure = structureFor(ligne);
    return text(structure && structure.Acronyme).trim() === DIESE_ACRONYM ? 'diese' : 'ailleurs';
  }
  // Vide ou valeur inconnue (colonne tout juste créée, aucune donnée migrée) =
  // 1re étape, jamais un projet invisible faute de statut encore renseigné.
  function stageIndex(project) {
    const idx = STAGES.indexOf(text(project.Statut_installation_fonds));
    return idx === -1 ? 0 : idx;
  }
  function actionInfo(project) {
    const value = text(project.Action_Ligne_OPE_a_faire);
    if (!value) return null;
    return { label: ACTION_LABELS[value] || value, warn: value === 'à determiner' };
  }
  function opeInfo(project) {
    const ligne = ligneOpeFor(project);
    if (!ligne) return { label: 'Aucune ligne OPE', muted: true };
    const structure = structureFor(ligne);
    const structureLabel = structure ? text(structure.Acronyme || structure.Nom_Complet) : '';
    return { label: `OPE n°${text(ligne.N_OPE)}${structureLabel ? ' — chez ' + structureLabel : ''}`, muted: false };
  }

  // État d'affichage des volets (repliés/masqués) — purement local à la
  // session tant que les préférences ne sont pas chargées, clé "side:idx".
  const panelState = {};
  function panelKey(side, idx) { return `${side}:${idx}`; }
  let pendingInstallPrefs = null;
  function ensurePanelState(key, isInitiallyEmpty) {
    if (!panelState[key]) {
      const collapsed = pendingInstallPrefs ? pendingInstallPrefs.collapsedKeys.has(key) : !!isInitiallyEmpty;
      const hidden = pendingInstallPrefs ? pendingInstallPrefs.hiddenKeys.has(key) : false;
      panelState[key] = { collapsed, hidden };
    }
    return panelState[key];
  }
  let viewMode = 'all'; // 'all' | 'diese' | 'ailleurs' | 'non_classe'

  // Préférences (table partagée Preferences_Widget, cf. page-administratif.js —
  // même ligne, mêmes clés de cache, colonnes propres à cette page).
  const PREFS_TABLE = 'Preferences_Widget';
  const PREFS_ROWID_STORAGE_KEY = 'suiviProjetInnovationS:prefsRowId';
  const EMAIL_TRIGGER_COLUMN = { id: 'Email_utilisateur', type: 'Text', isFormula: false, formula: 'user.Email if not $Email_utilisateur else $Email_utilisateur', recalcWhen: 0 };
  const INSTALL_PREFS_COLUMNS = [
    { id: 'Install_repliees', type: 'Text' },
    { id: 'Install_masquees', type: 'Text' },
    { id: 'Install_filtre_programme', type: 'Text' },
    { id: 'Install_filtre_instance', type: 'Text' },
    { id: 'Install_filtre_recherche', type: 'Text' },
    { id: 'Install_vue', type: 'Text' }
  ];
  let prefsRowId = null;
  const encodeList = values => values.join(',');
  const decodeList = value => text(value).split(',').map(s => s.trim()).filter(Boolean);
  function getCachedPrefsRowId() {
    try { const raw = localStorage.getItem(PREFS_ROWID_STORAGE_KEY); return raw ? Number(raw) : null; }
    catch (err) { return null; }
  }
  function setCachedPrefsRowId(id) {
    try { localStorage.setItem(PREFS_ROWID_STORAGE_KEY, String(id)); }
    catch (err) { /* navigation privée / stockage bloqué : tant pis, pas de persistance entre sessions */ }
  }

  function multiComboValues(id) {
    return decodeList(document.getElementById(id)?.dataset.selectedValues);
  }
  function multiSummary(values, label) {
    if (!values.length) return '';
    return values.length === 1 ? values[0] : `${values.length} ${label}`;
  }
  function currentFilters() {
    return {
      programmes: multiComboValues('install-filter-programme'),
      instances: multiComboValues('install-filter-instance'),
      search: normalized(document.getElementById('install-filter-search')?.value)
    };
  }
  function filteredProjects() {
    const filters = currentFilters();
    return getProjects().filter(project => {
      const acronym = text(project.Acronyme);
      const programme = programmeLabel(field(project, ['Programme', 'Programme_Axe_InnovationS']));
      const instance = instanceLabel(field(project, ['Instance_ratachee', 'Instance', 'Instances']));
      return (!filters.programmes.length || filters.programmes.includes(programme)) &&
        (!filters.instances.length || filters.instances.includes(instance)) &&
        (!filters.search || normalized(acronym).includes(filters.search));
    });
  }
  function options(fieldNames, query = '') {
    const isInstance = fieldNames.some(name => ['Instance_ratachee', 'Instance', 'Instances'].includes(name));
    const wanted = normalized(query);
    return [...new Set(getProjects()
      .map(project => isInstance ? instanceLabel(field(project, fieldNames)) : programmeLabel(field(project, fieldNames)))
      .map(value => text(value).trim())
      .filter(value => value && normalized(value) !== '0' && (!wanted || normalized(value).includes(wanted)))
    )].sort((a, b) => a.localeCompare(b, 'fr'));
  }
  function renderMultiCombo(id, values, placeholder, summaryLabel) {
    const input = document.getElementById(id);
    const list = document.getElementById(`${id}-list`);
    if (!input || !list) return;
    const selected = multiComboValues(id);
    input.value = multiSummary(selected, summaryLabel);
    const ordered = [...values].sort((a, b) => {
      const aSelected = selected.includes(a), bSelected = selected.includes(b);
      return aSelected === bSelected ? 0 : (aSelected ? -1 : 1);
    });
    list.innerHTML = `<button type="button" data-value="">${escape(placeholder)}</button>` +
      ordered.map(value => {
        const isSelected = selected.includes(value);
        return `<button type="button" class="${isSelected ? 'is-selected' : ''}" data-value="${escape(value)}" role="option" aria-selected="${isSelected}">${escape(value)}</button>`;
      }).join('');
    list.querySelectorAll('[data-value]').forEach(button => button.addEventListener('mousedown', event => {
      event.preventDefault();
      const value = button.dataset.value;
      const next = value === '' ? [] : (selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
      input.dataset.selectedValues = encodeList(next);
      renderMultiCombo(id, values, placeholder, summaryLabel);
      render();
      saveInstallationUserPreferences();
    }));
  }
  function renderFilters() {
    renderMultiCombo('install-filter-programme', options(['Programme', 'Programme_Axe_InnovationS']), 'Tous les programmes', 'programmes sélectionnés');
    renderMultiCombo('install-filter-instance', options(['Instance_ratachee', 'Instance', 'Instances']), 'Toutes les instances', 'instances sélectionnées');
  }
  function setupMultiCombo(id, fieldNames, placeholder, summaryLabel) {
    const input = document.getElementById(id);
    const list = document.getElementById(`${id}-list`);
    if (!input || !list) return;
    input.readOnly = true;
    input.addEventListener('focus', () => { list.hidden = false; renderMultiCombo(id, options(fieldNames), placeholder, summaryLabel); });
    input.addEventListener('blur', () => setTimeout(() => {
      list.hidden = true;
      input.value = multiSummary(multiComboValues(id), summaryLabel);
    }, 150));
  }

  async function writeFields(table, id, fields) {
    const api = window.CoreGrist?.gristInstance;
    if (!api) throw new Error('API Grist indisponible');
    await api.docApi.applyUserActions([['UpdateRecord', table, Number(id), fields]]);
  }

  async function saveComment(project, value) {
    try {
      await writeFields('Projets', project.id, { Commentaire_ligne_OPE: value });
      project.Commentaire_ligne_OPE = value;
    } catch (err) { CoreUtils.showToast(`Échec de l'enregistrement du commentaire (${err.message})`, true); }
  }

  // Glisser-déposer entre volets d'une MÊME colonne (jamais entre DIESE/Ailleurs/Sans
  // ligne OPE, qui ne sont jamais choisis à la main) : garde-fou dans moveInstall().
  async function moveInstall(projectId, targetSide, targetIdx) {
    const project = projectById(projectId);
    if (!project || !(targetIdx >= 0 && targetIdx < STAGES.length)) return;
    if (sideForProject(project) !== targetSide) return;
    if (stageIndex(project) === targetIdx) return;
    const nextValue = STAGES[targetIdx];
    try {
      await writeFields('Projets', project.id, { Statut_installation_fonds: nextValue });
      project.Statut_installation_fonds = nextValue;
      CoreUtils.showToast(`${project.Acronyme || project.Projet} → ${stripOrdinal(nextValue)}`);
      render();
    } catch (err) { CoreUtils.showToast(`Échec de l'écriture (${err.message})`, true); }
  }

  function installCard(project) {
    const action = actionInfo(project);
    const ope = opeInfo(project);
    const commentHelp = window.HelpTooltip?.markup('Projets', 'Commentaire_ligne_OPE') || '';
    return `<div class="install-card" data-project-id="${escape(project.id)}">` +
      `<span class="install-drag-handle" draggable="true" data-drag-project="${escape(project.id)}" title="Glisser vers une autre étape">${ICON_GRIP}</span>` +
      `<button type="button" class="install-card-identity" data-open-project="${escape(project.id)}"><span class="install-acronym">${escape(project.Acronyme || project.Projet || 'Sans acronyme')}</span></button>` +
      `<div class="install-badges">` +
      (action ? `<span class="install-chip install-chip-action${action.warn ? ' is-warn' : ''}">${escape(action.label)}</span>` : '') +
      `<span class="install-chip install-chip-ope${ope.muted ? ' is-muted' : ''}">${escape(ope.label)}</span>` +
      `</div>` +
      `<label class="install-comment"><span class="install-field-label">Commentaire OPE/installation${commentHelp}</span>` +
      `<textarea data-install-comment="${escape(project.id)}" rows="2" placeholder="Commentaire…">${escape(project.Commentaire_ligne_OPE)}</textarea></label>` +
      `<div class="install-amount-row"><span class="install-amount-label">Montant</span><span class="install-amount-value">${escape(CoreUtils.formatCurrency(project.Montant_attribue_Total))}</span></div>` +
      `<div class="install-budget-row">` +
      `<div class="install-budget-item"><span class="install-budget-label">Fonctionnement</span><span class="install-budget-value">${escape(CoreUtils.formatCurrency(project.Total_Fonctionnement))}</span></div>` +
      `<div class="install-budget-item"><span class="install-budget-label">Investissement</span><span class="install-budget-value">${escape(CoreUtils.formatCurrency(project.Total_investissement))}</span></div>` +
      `<div class="install-budget-item"><span class="install-budget-label">Personnel</span><span class="install-budget-value">${escape(CoreUtils.formatCurrency(project.Total_Personnel))}</span></div>` +
      `</div></div>`;
  }

  function buildColumnPanels(sideKey) {
    const stageHelp = window.HelpTooltip?.markup('Projets', 'Statut_installation_fonds') || '';
    const sideProjects = filteredProjects().filter(p => sideForProject(p) === sideKey);
    return STAGES.map((stageLabel, idx) => {
      const items = sideProjects.filter(p => stageIndex(p) === idx);
      const key = panelKey(sideKey, idx);
      const state = ensurePanelState(key, items.length === 0);
      const collapsedCls = state.collapsed ? ' is-collapsed' : '';
      const label = stripOrdinal(stageLabel);
      return {
        key, label, state, count: items.length,
        html: `<section class="install-panel${collapsedCls}" data-drop-panel="${escape(key)}" aria-labelledby="install-panel-${escape(key)}">` +
          `<header class="install-panel-header"><h4 id="install-panel-${escape(key)}">${escape(label)}${stageHelp}</h4>` +
          `<span class="kanban-count">${items.length}</span><div class="kanban-column-actions">` +
          `<button type="button" class="kanban-icon-btn" data-toggle-install-panel="${escape(key)}" aria-expanded="${!state.collapsed}" aria-label="${state.collapsed ? 'Déplier' : 'Replier'} le volet ${escape(label)}">${ICON_CHEVRON}</button>` +
          `<button type="button" class="kanban-icon-btn" data-hide-install-panel="${escape(key)}" aria-label="Masquer le volet ${escape(label)}">${ICON_EYE_OFF}</button>` +
          `</div></header><div class="install-panel-body">${items.length ? items.map(installCard).join('') : '<p class="kanban-empty">Aucun projet</p>'}</div></section>`
      };
    });
  }

  function wireRootEvents(root) {
    root.querySelectorAll('[data-open-project]').forEach(btn => btn.addEventListener('click', () => {
      const project = projectById(btn.dataset.openProject);
      if (project && window.ProjectModal?.open) window.ProjectModal.open(project);
      else if (window.openProject) window.openProject(btn.dataset.openProject);
    }));
    root.querySelectorAll('[data-toggle-install-panel]').forEach(btn => btn.addEventListener('click', () => {
      const state = panelState[btn.dataset.toggleInstallPanel];
      if (state) state.collapsed = !state.collapsed;
      render();
      saveInstallationUserPreferences();
    }));
    root.querySelectorAll('[data-hide-install-panel]').forEach(btn => btn.addEventListener('click', () => {
      const state = panelState[btn.dataset.hideInstallPanel];
      if (state) state.hidden = true;
      render();
      saveInstallationUserPreferences();
    }));
    root.querySelectorAll('[data-install-comment]').forEach(textarea => textarea.addEventListener('blur', () => {
      if (textarea.value === textarea.defaultValue) return;
      const project = projectById(textarea.dataset.installComment);
      if (project) saveComment(project, textarea.value);
    }));
  }

  function renderHiddenPanelsFor(sideKey, panels) {
    const container = document.getElementById(`install-hidden-${sideKey}`);
    if (!container) return;
    const hiddenPanels = panels.filter(p => p.state.hidden);
    container.hidden = hiddenPanels.length === 0;
    container.innerHTML = hiddenPanels.length
      ? `<span class="kanban-hidden-label">Masqués :</span>${hiddenPanels.map(p => `<button type="button" class="kanban-restore-chip" data-restore-install-panel="${escape(p.key)}" aria-label="Afficher le volet ${escape(p.label)}">${ICON_EYE}<span>${escape(p.label)}</span></button>`).join('')}`
      : '';
    container.querySelectorAll('[data-restore-install-panel]').forEach(btn => btn.addEventListener('click', () => {
      const state = panelState[btn.dataset.restoreInstallPanel];
      if (state) state.hidden = false;
      render();
      saveInstallationUserPreferences();
    }));
  }

  function updateViewTabsUI() {
    document.querySelectorAll('[data-install-tab]').forEach(btn => {
      const isActive = btn.dataset.installTab === viewMode;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });
  }
  function updateColumnVisibility() {
    document.querySelectorAll('[data-install-column]').forEach(section => {
      section.classList.toggle('is-hidden', viewMode !== 'all' && section.dataset.installColumn !== viewMode);
    });
    document.getElementById('install-panels-wrap')?.classList.toggle('is-single', viewMode !== 'all');
  }

  function render() {
    if (!window.CoreState || !CoreState.getTable('Projets')) return;
    SIDE_DEFS.forEach(def => {
      const root = document.getElementById(`install-col-${def.key}`);
      if (!root) return;
      const panels = buildColumnPanels(def.key);
      const total = panels.reduce((sum, p) => sum + p.count, 0);
      root.innerHTML = panels.filter(p => !p.state.hidden).map(p => p.html).join('');
      wireRootEvents(root);
      const countEl = document.getElementById(`install-count-${def.key}`);
      if (countEl) countEl.textContent = `${total} projet(s)`;
      renderHiddenPanelsFor(def.key, panels);
    });
    updateViewTabsUI();
    updateColumnVisibility();
  }

  // Délégation sur la racine persistante (les 3 colonnes sont toujours dans le
  // DOM, seulement masquées en CSS par le sélecteur de vue) — même patron que
  // initConvDelegation() dans page-administratif.js, type MIME propre à cette
  // page pour ne jamais accepter une carte glissée depuis Conventions.
  const DRAG_TYPE = 'application/x-suivi-installation';
  const carriesInstallCard = event => !!(event.dataTransfer && Array.from(event.dataTransfer.types || []).includes(DRAG_TYPE));
  function initInstallDelegation() {
    const root = document.getElementById('install-panels-wrap');
    if (!root) return;
    const closest = (event, selector) => (event.target && event.target.closest) ? event.target.closest(selector) : null;
    let draggingCard = null;
    const clearDragFeedback = () => {
      draggingCard = null;
      root.querySelectorAll('.is-drop-target, .is-dragging').forEach(el => el.classList.remove('is-drop-target', 'is-dragging'));
    };
    root.addEventListener('dragstart', event => {
      const handle = closest(event, '[data-drag-project]');
      if (!handle || !event.dataTransfer) return;
      const dt = event.dataTransfer;
      dt.effectAllowed = 'move';
      dt.setData(DRAG_TYPE, handle.dataset.dragProject);
      dt.setData('text/plain', handle.dataset.dragProject); // Firefox exige au moins une donnée standard
      const card = handle.closest('.install-card');
      if (card && dt.setDragImage) { try { dt.setDragImage(card, 14, 14); } catch (err) { /* aperçu par défaut */ } }
      draggingCard = card;
      if (card) setTimeout(() => { if (draggingCard === card) card.classList.add('is-dragging'); }, 0);
    });
    root.addEventListener('dragover', event => {
      const panel = closest(event, '[data-drop-panel]');
      if (!panel || !carriesInstallCard(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (!panel.classList.contains('is-drop-target')) {
        root.querySelectorAll('.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
        panel.classList.add('is-drop-target');
      }
    });
    root.addEventListener('dragleave', event => {
      const panel = closest(event, '[data-drop-panel]');
      if (panel && !panel.contains(event.relatedTarget)) panel.classList.remove('is-drop-target');
    });
    root.addEventListener('drop', event => {
      const panel = closest(event, '[data-drop-panel]');
      if (!panel || !carriesInstallCard(event)) return;
      event.preventDefault();
      const projectId = event.dataTransfer.getData(DRAG_TYPE);
      clearDragFeedback();
      if (projectId) {
        const [side, idxStr] = panel.dataset.dropPanel.split(':');
        moveInstall(projectId, side, Number(idxStr));
      }
    });
    root.addEventListener('dragend', clearDragFeedback);
  }

  function applyInstallPrefsToPanelState() {
    if (!pendingInstallPrefs) return;
    Object.keys(panelState).forEach(key => {
      panelState[key].collapsed = pendingInstallPrefs.collapsedKeys.has(key);
      panelState[key].hidden = pendingInstallPrefs.hiddenKeys.has(key);
    });
  }
  function applyStoredInstallFilters(row) {
    const programmeInput = document.getElementById('install-filter-programme');
    if (programmeInput && row.Install_filtre_programme) programmeInput.dataset.selectedValues = row.Install_filtre_programme;
    const instanceInput = document.getElementById('install-filter-instance');
    if (instanceInput && row.Install_filtre_instance) instanceInput.dataset.selectedValues = row.Install_filtre_instance;
    const search = document.getElementById('install-filter-search');
    if (search && row.Install_filtre_recherche) search.value = row.Install_filtre_recherche;
  }

  async function loadInstallationUserPreferences() {
    if (!window.CoreGrist || !CoreGrist.gristInstance) return;
    try {
      await CoreGrist.ensureColumns('Projets', [STATUT_COLUMN]);
      await CoreGrist.ensureTable(PREFS_TABLE, [EMAIL_TRIGGER_COLUMN, ...INSTALL_PREFS_COLUMNS]);
      await CoreGrist.ensureColumns(PREFS_TABLE, INSTALL_PREFS_COLUMNS);
      const rows = await CoreGrist.getTable(PREFS_TABLE);
      const cachedId = getCachedPrefsRowId();
      const row = cachedId != null ? rows.find(r => r.id === cachedId) : null;
      if (!row) {
        // Première utilisation dans ce navigateur : nouvelle ligne, partagée
        // avec les autres pages (normalement déjà créée avant celle-ci, cf. js/app.js).
        const result = await CoreGrist.gristInstance.docApi.applyUserActions([['AddRecord', PREFS_TABLE, null, {}]]);
        prefsRowId = CoreUtils.extractAddedRecordId(result);
        setCachedPrefsRowId(prefsRowId);
        return;
      }
      prefsRowId = row.id;
      const hasSavedPreferences = !!(text(row.Install_repliees) || text(row.Install_masquees) ||
        text(row.Install_filtre_programme) || text(row.Install_filtre_instance) ||
        text(row.Install_filtre_recherche) || text(row.Install_vue));
      if (!hasSavedPreferences) return;
      pendingInstallPrefs = {
        collapsedKeys: new Set(decodeList(row.Install_repliees)),
        hiddenKeys: new Set(decodeList(row.Install_masquees))
      };
      if (row.Install_vue) viewMode = row.Install_vue;
      applyInstallPrefsToPanelState();
      applyStoredInstallFilters(row);
    } catch (err) {
      console.warn("Chargement des préférences Installation a échoué :", err.message);
    }
  }

  async function saveInstallationUserPreferences() {
    if (!prefsRowId || !window.CoreGrist?.gristInstance) return;
    const collect = type => Object.entries(panelState).filter(([, state]) => state[type]).map(([key]) => key);
    const fields = {
      Install_repliees: encodeList(collect('collapsed')),
      Install_masquees: encodeList(collect('hidden')),
      Install_filtre_programme: encodeList(multiComboValues('install-filter-programme')),
      Install_filtre_instance: encodeList(multiComboValues('install-filter-instance')),
      Install_filtre_recherche: document.getElementById('install-filter-search')?.value || '',
      Install_vue: viewMode
    };
    try {
      await CoreGrist.gristInstance.docApi.applyUserActions([['UpdateRecord', PREFS_TABLE, prefsRowId, fields]]);
    } catch (err) {
      console.warn("Enregistrement des préférences Installation a échoué :", err.message);
    }
  }

  function init() {
    initInstallDelegation();
    renderFilters();
    setupMultiCombo('install-filter-programme', ['Programme', 'Programme_Axe_InnovationS'], 'Tous les programmes', 'programmes sélectionnés');
    setupMultiCombo('install-filter-instance', ['Instance_ratachee', 'Instance', 'Instances'], 'Toutes les instances', 'instances sélectionnées');
    render();
    document.getElementById('install-filter-search')?.addEventListener('input', () => { render(); saveInstallationUserPreferences(); });
    document.getElementById('install-clear-filters')?.addEventListener('click', () => {
      ['install-filter-programme', 'install-filter-instance'].forEach(id => {
        const input = document.getElementById(id);
        if (input) { input.value = ''; input.dataset.selectedValues = ''; }
      });
      const search = document.getElementById('install-filter-search');
      if (search) search.value = '';
      renderFilters();
      render();
      saveInstallationUserPreferences();
    });
    document.querySelectorAll('[data-install-tab]').forEach(btn => btn.addEventListener('click', () => {
      viewMode = btn.dataset.installTab;
      render();
      saveInstallationUserPreferences();
    }));
  }

  window.renderInstallation = function () { renderFilters(); render(); };
  window.loadInstallationUserPreferences = loadInstallationUserPreferences;
  // Exposé pour les tests (classement par colonne, sans dépendre du rendu DOM).
  window.InstallationLogic = { sideForProject, stageIndex, STAGES };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
