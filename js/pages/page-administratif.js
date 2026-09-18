/** Page Administratif — deux colonnes Notifications / Conventions, volets par
 * étape de statut (repliables et masquables, même patron que le Kanban Projets,
 * cf. js/pages/page-projets.js). Maquette validée par Antoine le 18/09/2026
 * (https://claude.ai/artifact/MELwepYao8LfGeVgNKY18W).
 *
 * Libellés exacts de statut (Choice Grist, chaîne complète avec le préfixe
 * "N) " — confirmé par docs/grist_structure : Statut_Macro compare littéralement
 * à "5) Convention signée de toutes les parties" et "8) Archivee").
 */
(function () {
  'use strict';
  const NOTIF_STAGES = [
    '1) Information projet saisies',
    '2) Notification_relecture',
    '3) Prette pour CTO',
    '4) complète',
    '5) envoyée pour signature VP',
    '6) Signée',
    '7) Transmise au porteur',
    '8) Archivee'
  ];
  const CONV_STAGES = [
    '1) Convention en redaction',
    '2) Convention Relecture Partenaire(s)',
    '3) Convention en signature UB',
    '4) Convention en signature partenaire',
    '5) Convention signée de toutes les parties'
  ];
  // 4 états (ajout de "Non relu" le 18/09/2026 — pas de puce remplie, état par
  // défaut avant toute relecture). Les 3 points de la bulle se remplissent un
  // par un jusqu'à l'étape atteinte (0, 1, 2 ou 3 points).
  const PARTNER_STATUSES = ['Non relu', 'Relu', 'en cours de signature', 'Signé'];
  const PARTNER_STATUS_STYLES = [
    { bg: '#f4f6fa', text: '#98a2b3', border: '#dde2ea' },
    { bg: '#eef1f6', text: '#667085', border: '#dde2ea' },
    { bg: '#e8f0fe', text: '#2558c4', border: '#c7dbfd' },
    { bg: '#e5f6ee', text: '#1a8f5e', border: '#bfe6d3' }
  ];
  const ICON_CHEVRON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  const ICON_EYE_OFF = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.3 20.3 0 0 1-3.22 4.44M14.12 14.12a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
  const ICON_VIEW_CARDS = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.3"></rect><rect x="14" y="3" width="7" height="7" rx="1.3"></rect><rect x="3" y="14" width="7" height="7" rx="1.3"></rect><rect x="14" y="14" width="7" height="7" rx="1.3"></rect></svg>';
  const ICON_VIEW_ROWS = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>';

  const text = value => value == null ? '' : String(value);
  const escape = CoreUtils.escapeHtml;
  const tableRows = name => (window.CoreState && CoreState.getTable(name)) || [];
  const rowById = (tableName, id) => tableRows(tableName).find(row => String(row.id) === String(id));
  const refId = value => (value && typeof value === 'object') ? (value.id ?? value) : value;
  const refLabel = (value, tableName, fields = []) => {
    if (Array.isArray(value)) return value.filter(item => item !== 'L').map(item => refLabel(item, tableName, fields)).filter(Boolean).join(', ');
    if (!value) return ''; // référence vide (0 côté Grist) — jamais afficher "0"
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
  const personLabel = value => {
    if (Array.isArray(value)) return value.map(personLabel).filter(Boolean).join(', ');
    if (!value) return ''; // référence vide (0 côté Grist) — jamais afficher "0"
    const row = rowById('Annuaire', refId(value));
    if (row) return text(row.nom_et_Prenom || [row.NOM, row.Prenom].filter(Boolean).join(' '));
    if (value && typeof value === 'object') return text(value.nom_et_Prenom || [value.NOM, value.Prenom].filter(Boolean).join(' ') || value.name || value.id);
    return text(value);
  };
  const instanceLabel = value => {
    if (Array.isArray(value)) return value.map(instanceLabel).filter(Boolean).join(', ');
    const suivi = rowById('Suivi_Instance', refId(value));
    if (suivi) return refLabel(suivi, null, ['Nom', 'name']) || valueLabel(suivi.Instance, 'Instances', ['Instances']);
    return valueLabel(value, 'Instances', ['Instances']);
  };
  const normalized = value => text(value).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const field = (project, names) => { for (const name of names) if (project[name] != null && project[name] !== '') return project[name]; return ''; };
  const stripOrdinal = label => text(label).replace(/^\d+\)\s*/, '');
  const referencedIds = value => Array.isArray(value) ? value.filter(item => item !== 'L' && item != null && item !== 0) : [];

  // CTO#xx : extrait du libellé complet de l'instance rattachée (même résolution
  // que page-projets.js/project-modal.js) — champ source exact encore à confirmer
  // par Antoine côté Grist (Instances.Instances), cf. mémoire d'équipe.
  function ctoRef(project) {
    const label = instanceLabel(field(project, ['Instance_ratachee', 'Instance', 'Instances']));
    const match = text(label).match(/CTO\s*#?\s*(\d+)/i);
    return match ? `CTO#${match[1]}` : '';
  }

  function getProjects() { return (window.CoreState && CoreState.getTable('Projets')) || []; }
  function getNotifications() { return (window.CoreState && CoreState.getTable('Notifications')) || []; }
  function notifRowFor(projectId) { return getNotifications().find(row => String(refId(row.Projet)) === String(projectId)); }
  function notifStageIndex(projectId) {
    const row = notifRowFor(projectId);
    return row ? NOTIF_STAGES.indexOf(text(row.notifications_Statut)) : -1;
  }
  function convStageIndex(project) { return CONV_STAGES.indexOf(text(project.Conventions_statut)); }
  function partnerStatusIndex(project, fieldName) {
    const idx = PARTNER_STATUSES.indexOf(text(project[fieldName]));
    return idx === -1 ? 0 : idx;
  }

  function partnersFor(project) {
    const etabs = referencedIds(project.Partenaire_s_convention_reversement).map(id => rowById('Etablissements', id)).filter(Boolean);
    const defs = [{ label: 'UB', field: 'convention_statut_UB' }];
    if (etabs[0]) defs.push({ label: text(etabs[0].Acronyme || etabs[0].Nom_complet), field: 'convention_statut_partenaire_1' });
    if (etabs[1]) defs.push({ label: text(etabs[1].Acronyme || etabs[1].Nom_complet), field: 'convention_statut_partenaire_2' });
    return defs.map(def => ({ ...def, statusIndex: partnerStatusIndex(project, def.field) }));
  }

  // État d'affichage des volets (repliés / masqués) et du mode cartes/lignes —
  // purement local à la session, pas de persistance Grist (même choix que le
  // Kanban Projets).
  const panelState = {};
  function panelKey(side, idx) { return `${side}:${idx}`; }
  function ensurePanelState(side, idx, isInitiallyEmpty) {
    const key = panelKey(side, idx);
    // Un volet sans aucun projet démarre replié — repli INITIAL uniquement,
    // un dépli/repli manuel de l'utilisateur n'est jamais écrasé ensuite.
    if (!panelState[key]) panelState[key] = { collapsed: !!isInitiallyEmpty, hidden: false };
    return panelState[key];
  }
  let viewMode = 'rows';

  function comboValue(id) {
    const input = document.getElementById(id);
    return input?.dataset.selectedValue || '';
  }
  function currentFilters() {
    return {
      programme: comboValue('admin-filter-programme'),
      instance: comboValue('admin-filter-instance'),
      search: normalized(document.getElementById('admin-filter-search')?.value)
    };
  }
  function filteredProjects() {
    const filters = currentFilters();
    return getProjects().filter(project => {
      const acronym = text(project.Acronyme);
      const programme = programmeLabel(field(project, ['Programme', 'Programme_Axe_InnovationS']));
      const instance = instanceLabel(field(project, ['Instance_ratachee', 'Instance', 'Instances']));
      return (!filters.programme || programme === filters.programme) &&
        (!filters.instance || instance === filters.instance) &&
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
  function renderCombo(id, values, placeholder) {
    const input = document.getElementById(id);
    const list = document.getElementById(`${id}-list`);
    if (!input || !list) return;
    list.innerHTML = `<button type="button" data-value="">${escape(placeholder)}</button>` +
      values.map(value => `<button type="button" data-value="${escape(value)}">${escape(value)}</button>`).join('');
    list.querySelectorAll('[data-value]').forEach(button => button.addEventListener('mousedown', event => {
      event.preventDefault();
      input.dataset.selectedValue = button.dataset.value;
      input.value = button.dataset.value;
      list.hidden = true;
      render();
    }));
  }
  function renderFilters() {
    renderCombo('admin-filter-programme', options(['Programme', 'Programme_Axe_InnovationS'],
      document.getElementById('admin-filter-programme')?.value), 'Tous les programmes');
    renderCombo('admin-filter-instance', options(['Instance_ratachee', 'Instance', 'Instances'],
      document.getElementById('admin-filter-instance')?.value), 'Toutes les instances');
  }
  function setupCombo(id, fieldNames, placeholder) {
    const input = document.getElementById(id);
    const list = document.getElementById(`${id}-list`);
    if (!input || !list) return;
    input.addEventListener('focus', () => { list.hidden = false; renderCombo(id, options(fieldNames, input.value), placeholder); });
    input.addEventListener('input', () => { input.dataset.selectedValue = ''; list.hidden = false; renderCombo(id, options(fieldNames, input.value), placeholder); render(); });
    input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; if (!input.dataset.selectedValue) input.value = ''; }, 150));
  }

  async function writeFields(table, id, fields) {
    const api = window.CoreGrist?.gristInstance;
    if (!api) throw new Error('API Grist indisponible');
    await api.docApi.applyUserActions([['UpdateRecord', table, Number(id), fields]]);
  }

  function setProjectField(projectId, fieldName, value) {
    const project = getProjects().find(p => String(p.id) === String(projectId));
    if (project) project[fieldName] = value;
  }

  async function advanceNotif(projectId, acronym) {
    const row = notifRowFor(projectId);
    if (!row) { CoreUtils.showToast(`Aucune fiche Notifications pour ${acronym}`, true); return; }
    const idx = NOTIF_STAGES.indexOf(text(row.notifications_Statut));
    if (idx === -1 || idx >= NOTIF_STAGES.length - 1) return;
    const nextValue = NOTIF_STAGES[idx + 1];
    try {
      await writeFields('Notifications', row.id, { notifications_Statut: nextValue });
      row.notifications_Statut = nextValue;
      CoreUtils.showToast(`${acronym} → ${stripOrdinal(nextValue)}`);
      render();
    } catch (err) { CoreUtils.showToast(`Échec de l'écriture (${err.message})`, true); }
  }

  async function advanceConv(project) {
    const idx = convStageIndex(project);
    if (idx === -1 || idx >= CONV_STAGES.length - 1) return;
    const nextValue = CONV_STAGES[idx + 1];
    try {
      await writeFields('Projets', project.id, { Conventions_statut: nextValue });
      setProjectField(project.id, 'Conventions_statut', nextValue);
      CoreUtils.showToast(`${project.Acronyme || project.Projet} → ${stripOrdinal(nextValue)}`);
      render();
    } catch (err) { CoreUtils.showToast(`Échec de l'écriture (${err.message})`, true); }
  }

  async function cyclePartner(project, fieldName) {
    const idx = partnerStatusIndex(project, fieldName);
    const nextValue = PARTNER_STATUSES[(idx + 1) % PARTNER_STATUSES.length];
    try {
      await writeFields('Projets', project.id, { [fieldName]: nextValue });
      setProjectField(project.id, fieldName, nextValue);
      render();
    } catch (err) { CoreUtils.showToast(`Échec de l'écriture (${err.message})`, true); }
  }

  async function saveComment(projectId, value) {
    try {
      await writeFields('Projets', projectId, { comentaire_general_Suivi_projet: value });
      setProjectField(projectId, 'comentaire_general_Suivi_projet', value);
    } catch (err) { CoreUtils.showToast(`Échec de l'enregistrement du commentaire (${err.message})`, true); }
  }

  function partnerPill(project, partner) {
    const style = PARTNER_STATUS_STYLES[partner.statusIndex];
    const dots = [0, 1, 2].map(step => {
      const reached = step < partner.statusIndex;
      return `<span class="admin-partner-dot${reached ? ' is-filled' : ''}" style="${reached ? `background:${style.text};border-color:${style.text};` : ''}"></span>`;
    }).join('');
    const label = PARTNER_STATUSES[partner.statusIndex];
    return `<button type="button" class="admin-partner-pill" data-cycle-partner="${escape(project.id)}:${escape(partner.field)}" style="background:${style.bg};color:${style.text};border-color:${style.border};" title="${escape(partner.label)} — ${escape(label)}" aria-label="${escape(partner.label)} — ${escape(label)}, cliquer pour changer">` +
      `<span>${escape(partner.label)}</span><span class="admin-partner-dots">${dots}</span></button>`;
  }

  function commentBlock(project) {
    return `<label class="admin-comment"><span class="visually-hidden">Commentaire libre</span>` +
      `<textarea data-comment-project="${escape(project.id)}" rows="${viewMode === 'rows' ? 2 : 3}" placeholder="Commentaire libre…">${escape(project.comentaire_general_Suivi_projet)}</textarea></label>`;
  }

  function notifCard(project) {
    const idx = notifStageIndex(project.id);
    const isLast = idx === NOTIF_STAGES.length - 1;
    const holder = personLabel(field(project, ['Porteur_1', 'Porteur', 'porteur_1'])) || 'Porteur non renseigné';
    const programme = programmeLabel(field(project, ['Programme', 'Programme_Axe_InnovationS']));
    const cto = ctoRef(project);
    return `<div class="admin-card" data-project-id="${escape(project.id)}">` +
      `<button type="button" class="admin-card-identity" data-open-project="${escape(project.id)}">` +
      `<span class="project-acronym">${escape(project.Acronyme || 'Sans acronyme')}</span>` +
      `<span class="admin-card-caption">${escape(holder)}</span></button>` +
      `<div class="admin-card-badges">${programme ? `<span class="programme-badge">${escape(programme)}</span>` : ''}` +
      `${cto ? `<span class="admin-cto-badge">${escape(cto)}</span>` : ''}</div>` +
      commentBlock(project) +
      (isLast
        ? '<span class="admin-done-badge">Archivée</span>'
        : `<button type="button" class="admin-advance-btn" data-advance-notif="${escape(project.id)}" data-acronym="${escape(project.Acronyme || project.Projet || '')}" title="Étape suivante" aria-label="Étape suivante">Suivant →</button>`) +
      `</div>`;
  }

  function convCard(project) {
    const idx = convStageIndex(project);
    const isLast = idx === CONV_STAGES.length - 1;
    const partners = partnersFor(project);
    return `<div class="admin-card" data-project-id="${escape(project.id)}">` +
      `<button type="button" class="admin-card-identity" data-open-project="${escape(project.id)}">` +
      `<span class="project-acronym">${escape(project.Acronyme || project.Projet || 'Sans acronyme')}</span></button>` +
      `<div class="admin-partners">${partners.map(p => partnerPill(project, p)).join('')}</div>` +
      commentBlock(project) +
      (isLast
        ? '<span class="admin-done-badge">Signée</span>'
        : `<button type="button" class="admin-advance-btn" data-advance-conv="${escape(project.id)}" title="Étape suivante" aria-label="Étape suivante">Suivant →</button>`) +
      `</div>`;
  }

  function buildPanels(side, stages, projectsByStage, cardFn) {
    return stages.map((stageLabel, idx) => {
      const items = projectsByStage[idx] || [];
      const state = ensurePanelState(side, idx, items.length === 0);
      const key = panelKey(side, idx);
      const collapsedCls = state.collapsed ? ' is-collapsed' : '';
      const label = stripOrdinal(stageLabel);
      return { key, idx, label, collapsedCls, count: items.length, state,
        html: `<section class="admin-panel${collapsedCls}" aria-labelledby="admin-panel-${escape(key)}">` +
          `<header class="admin-panel-header"><h4 id="admin-panel-${escape(key)}">${escape(label)}</h4>` +
          `<span class="kanban-count">${items.length}</span><div class="kanban-column-actions">` +
          `<button type="button" class="kanban-icon-btn" data-toggle-panel="${escape(key)}" aria-expanded="${!state.collapsed}" aria-label="${state.collapsed ? 'Déplier' : 'Replier'} le volet ${escape(label)}">${ICON_CHEVRON}</button>` +
          `<button type="button" class="kanban-icon-btn" data-hide-panel="${escape(key)}" aria-label="Masquer le volet ${escape(label)}">${ICON_EYE_OFF}</button>` +
          `</div></header><div class="admin-panel-body mode-${viewMode}">${items.length ? items.map(cardFn).join('') : '<p class="kanban-empty">Aucun projet</p>'}</div></section>` };
    });
  }

  function render() {
    const notifRoot = document.getElementById('admin-col-notif');
    const convRoot = document.getElementById('admin-col-conv');
    if (!notifRoot || !convRoot) return;
    // Tables Grist pas encore chargées (premier rendu déclenché par le propre
    // DOMContentLoaded de ce module, avant que app.js n'ait appelé loadAllTables) :
    // ne rien construire, sinon chaque volet verrait 0 projet et démarrerait
    // replié par défaut à tort (cf. ensurePanelState). Le vrai rendu arrive via
    // window.renderAdministratif() une fois les données chargées.
    if (!window.CoreState || !CoreState.getTable('Projets')) return;
    const projects = filteredProjects();

    const notifByStage = NOTIF_STAGES.map((_, idx) => projects.filter(p => notifStageIndex(p.id) === idx));
    const convByStage = CONV_STAGES.map((_, idx) => projects.filter(p => convStageIndex(p) === idx));
    const notifPanels = buildPanels('notif', NOTIF_STAGES, notifByStage, notifCard);
    const convPanels = buildPanels('conv', CONV_STAGES, convByStage, convCard);

    notifRoot.innerHTML = notifPanels.filter(p => !p.state.hidden).map(p => p.html).join('');
    convRoot.innerHTML = convPanels.filter(p => !p.state.hidden).map(p => p.html).join('');

    [notifRoot, convRoot].forEach(root => {
      root.querySelectorAll('[data-open-project]').forEach(btn => btn.addEventListener('click', () => {
        const project = getProjects().find(p => String(p.id) === String(btn.dataset.openProject));
        if (project && window.ProjectModal?.open) window.ProjectModal.open(project);
        else if (window.openProject) window.openProject(btn.dataset.openProject);
      }));
      root.querySelectorAll('[data-toggle-panel]').forEach(btn => btn.addEventListener('click', () => {
        const state = panelState[btn.dataset.togglePanel];
        if (state) state.collapsed = !state.collapsed;
        render();
      }));
      root.querySelectorAll('[data-hide-panel]').forEach(btn => btn.addEventListener('click', () => {
        const state = panelState[btn.dataset.hidePanel];
        if (state) state.hidden = true;
        render();
      }));
      root.querySelectorAll('[data-advance-notif]').forEach(btn => btn.addEventListener('click', () => advanceNotif(btn.dataset.advanceNotif, btn.dataset.acronym)));
      root.querySelectorAll('[data-advance-conv]').forEach(btn => btn.addEventListener('click', () => {
        const project = getProjects().find(p => String(p.id) === String(btn.dataset.advanceConv));
        if (project) advanceConv(project);
      }));
      root.querySelectorAll('[data-cycle-partner]').forEach(btn => btn.addEventListener('click', () => {
        const [projectId, fieldName] = btn.dataset.cyclePartner.split(':');
        const project = getProjects().find(p => String(p.id) === String(projectId));
        if (project) cyclePartner(project, fieldName);
      }));
      root.querySelectorAll('[data-comment-project]').forEach(textarea => textarea.addEventListener('blur', () => saveComment(textarea.dataset.commentProject, textarea.value)));
    });

    renderHiddenPanels(notifPanels.concat(convPanels));
  }

  function renderHiddenPanels(panels) {
    const container = document.getElementById('admin-hidden-panels');
    if (!container) return;
    const hiddenPanels = panels.filter(p => p.state.hidden);
    container.hidden = hiddenPanels.length === 0;
    container.innerHTML = hiddenPanels.length
      ? `<span class="kanban-hidden-label">Masqués :</span>${hiddenPanels.map(p => `<button type="button" class="kanban-restore-chip" data-restore-panel="${escape(p.key)}">+ ${escape(p.label)}</button>`).join('')}`
      : '';
    container.querySelectorAll('[data-restore-panel]').forEach(btn => btn.addEventListener('click', () => {
      const state = panelState[btn.dataset.restorePanel];
      if (state) state.hidden = false;
      render();
    }));
  }

  function updateViewToggle() {
    const btn = document.getElementById('admin-toggle-view');
    if (!btn) return;
    const nextIsCards = viewMode === 'rows';
    btn.innerHTML = nextIsCards ? ICON_VIEW_CARDS : ICON_VIEW_ROWS;
    btn.setAttribute('aria-label', nextIsCards ? 'Afficher en cartes' : 'Afficher en tableau');
  }

  function init() {
    renderFilters();
    setupCombo('admin-filter-programme', ['Programme', 'Programme_Axe_InnovationS'], 'Tous les programmes');
    setupCombo('admin-filter-instance', ['Instance_ratachee', 'Instance', 'Instances'], 'Toutes les instances');
    updateViewToggle();
    render();
    document.getElementById('admin-filter-search')?.addEventListener('input', render);
    document.getElementById('admin-clear-filters')?.addEventListener('click', () => {
      ['admin-filter-programme', 'admin-filter-instance'].forEach(id => {
        const input = document.getElementById(id);
        if (input) { input.value = ''; input.dataset.selectedValue = ''; }
      });
      const search = document.getElementById('admin-filter-search');
      if (search) search.value = '';
      renderFilters();
      render();
    });
    document.getElementById('admin-toggle-view')?.addEventListener('click', () => {
      viewMode = viewMode === 'rows' ? 'cards' : 'rows';
      updateViewToggle();
      render();
    });
  }

  window.renderAdministratif = function () { renderFilters(); render(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
