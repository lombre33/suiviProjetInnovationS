/** Kanban Projets — étape 2. Uses the real Projets schema from docs/grist_structure. */
(function () {
  'use strict';
  const COLUMNS = [
    { key: 'Instruction', label: 'Instruction', color: '#6941c6' },
    { key: 'Notifications', label: 'Notifications', color: '#1570ef' },
    { key: 'Conventions', label: 'Conventions', color: '#c11574' },
    { key: 'Installation des fonds', label: 'Installation des fonds', color: '#dc6803' },
    { key: 'Projet en cours', label: 'Projet en cours', color: '#039855' }
  ];
  const text = value => value == null ? '' : String(value);
  const escape = value => window.CoreUtils && CoreUtils.escapeHtml ? CoreUtils.escapeHtml(text(value)) : text(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tableRows = name => (window.CoreState && CoreState.getTable(name)) || [];
  const rowById = (tableName, id) => tableRows(tableName).find(row => String(row.id) === String(id));
  const refId = value => {
    if (value && typeof value === 'object') return value.id ?? value;
    return value;
  };
  const refLabel = (value, tableName, fields = []) => {
    if (Array.isArray(value)) return value.filter(item => item !== 'L').map(item => refLabel(item, tableName, fields)).filter(Boolean).join(', ');
    const row = tableName && value != null && value !== '' ? rowById(tableName, refId(value)) : null;
    const candidate = row || (value && typeof value === 'object' ? value : null);
    if (candidate) {
      for (const name of fields) if (candidate[name] != null && candidate[name] !== '') return text(candidate[name]);
      return text(candidate.NOM || candidate.nom_et_Prenom || candidate.name || candidate.label || candidate.Acronyme || candidate.id);
    }
    return value == null ? '' : text(value);
  };
  const valueLabel = (value, tableName, fields) => Array.isArray(value) ? value.map(item => refLabel(item, tableName, fields)).filter(Boolean).join(', ') : refLabel(value, tableName, fields);
  const programmeLabel = value => valueLabel(value, 'Programmes', ['Programme']);
  const personLabel = value => {
    if (Array.isArray(value)) return value.map(personLabel).filter(Boolean).join(', ');
    const row = rowById('Annuaire', refId(value));
    if (row) return text(row.nom_et_Prenom || [row.NOM, row.Prenom].filter(Boolean).join(' '));
    if (value && typeof value === 'object') return text(value.nom_et_Prenom || [value.NOM, value.Prenom].filter(Boolean).join(' ') || value.name || value.id);
    return text(value);
  };
  const instanceLabel = value => {
    if (Array.isArray(value)) return value.map(instanceLabel).filter(Boolean).join(', ');
    const suivi = rowById('Suivi_Instance', refId(value));
    // Mirror project-modal resolution: prefer Suivi_Instance.Nom / .name, fall back to linked Instances.Instances.
    if (suivi) return refLabel(suivi, null, ['Nom', 'name']) || valueLabel(suivi.Instance, 'Instances', ['Instances']);
    return valueLabel(value, 'Instances', ['Instances']);
  };
  const normalized = value => text(value).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const field = (project, names) => { for (const name of names) if (project[name] != null && project[name] !== '') return project[name]; return ''; };
  // ─────────────────────────────────────────────────────────────────────────────
  // Kanban column classification — rules from docs/grist_structure (Projets).
  //
  // Columns referenced (Grist):
  //   • Statut_Macro              (Choice, computed server-side)
  //   • Convention_de_reversement (Bool — flag "Convention cochée")
  //   • Conventions_statut        (Choice — sub-status of the convention)
  //
  // Priority order (a project is placed in the first matching column):
  //   3) Conventions — PRIME over "Projet en cours" tant que la convention
  //       n'est pas signée par toutes les parties : c'est une étape bloquante
  //       avant l'installation des fonds. Cette règle est évaluée EN PREMIER
  //       afin qu'un projet Convention cochée + "En cours" reste affiché dans
  //       la colonne Conventions.
  //   1) Instruction   — Statut_Macro ∈ {1) Information projet saisies,
  //                                    2) Notification_relecture,
  //                                    3) Prette pour CTO}
  //   2) Notifications — Statut_Macro ∈ {4) complète,
  //                                    5) envoyée pour signature VP,
  //                                    6) Signée}
  //   4) Installation des fonds — Statut_Macro contient le mot "Finance"
  //       (recherche par sous-chaîne, insensible aux accents via normalized()).
  //   5) Projet en cours        — Statut_Macro ∈ {En cours, En retard}.
  //
  // Tout projet ne correspondant à AUCUNE règle n'apparaît dans aucune colonne
  // (pas de colonne "autre") — classifyStatus() renvoie alors null et le
  // filtre du render() l'écarte naturellement.
  // ─────────────────────────────────────────────────────────────────────────────
  function classifyStatus(project) {
    // 3) Conventions — règle prioritaire (cf. commentaire ci-dessus).
    const conventionSigned = normalized(text(field(project, ['Conventions_statut']))) === normalized('5) Convention signée de toutes les parties');
    const conventionValue = project.Convention_de_reversement;
    const hasConvention = conventionValue === true || conventionValue === 1 || normalized(conventionValue) === 'true' || normalized(conventionValue) === 'oui' || normalized(conventionValue) === 'cochée' || normalized(conventionValue) === 'cochee';
    if (hasConvention && !conventionSigned) return 'Conventions';

    const status = normalized(field(project, ['Statut_Macro', 'Statut']));
    if (!status) return null;

    // 1) Instruction
    if (status === normalized('1) Information projet saisies')
        || status === normalized('2) Notification_relecture')
        || status === normalized('3) Prette pour CTO')) {
      return 'Instruction';
    }

    // 2) Notifications
    if (status === normalized('4) complète')
        || status === normalized('5) envoyée pour signature VP')
        || status === normalized('6) Signée')) {
      return 'Notifications';
    }

    // 4) Installation des fonds — sous-chaîne "Finance" (Statut_Financier
    //    alimente Statut_Macro avec des libellés type "Finance_En Attente
    //    Gestionnaire" — matchés ici).
    if (status.includes('finance')) return 'Installation des fonds';

    // 5) Projet en cours
    if (status === normalized('En cours') || status === normalized('En retard')) {
      return 'Projet en cours';
    }

    // Hors règles : pas de colonne "autre".
    return null;
  }
  function getProjects() { return (window.CoreState && CoreState.getTable('Projets')) || []; }
  function comboValue(id) {
    const input = document.getElementById(id);
    return input?.dataset.selectedValue || '';
  }
  function currentFilters() {
    return {
      programme: comboValue('filter-programme'),
      instance: comboValue('filter-instance'),
      search: normalized(document.getElementById('filter-search')?.value)
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
      .map(project => isInstance
        ? instanceLabel(field(project, fieldNames))
        : programmeLabel(field(project, fieldNames)))
      .map(value => text(value).trim())
      .filter(value => value && normalized(value) !== '0' &&
        (!wanted || normalized(value).includes(wanted)))
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
    renderCombo('filter-programme', options(['Programme', 'Programme_Axe_InnovationS'],
      document.getElementById('filter-programme')?.value), 'Tous les programmes');
    renderCombo('filter-instance', options(['Instance_ratachee', 'Instance', 'Instances'],
      document.getElementById('filter-instance')?.value), 'Toutes les instances');
  }
  function render() {
    const board = document.getElementById('projects-kanban'); if (!board) return;
    const projects = filteredProjects();
    board.innerHTML = COLUMNS.map(column => {
      const cards = projects.filter(p => classifyStatus(p) === column.key);
      return `<section class="kanban-column" style="--column-accent:${column.color}" aria-labelledby="kanban-${normalized(column.key)}"><header class="kanban-column-header"><h3 id="kanban-${normalized(column.key)}">${column.label}</h3><span class="kanban-count">${cards.length}</span></header><div class="kanban-cards">${cards.length ? cards.map(card).join('') : '<p class="kanban-empty">Aucun projet</p>'}</div></section>`;
    }).join('');
    board.querySelectorAll('[data-project-id]').forEach(cardEl => cardEl.addEventListener('click', () => {
      const project = getProjects().find(item => String(item.id) === String(cardEl.dataset.projectId));
      if (project && window.ProjectModal?.open) window.ProjectModal.open(project);
      else if (window.openProject) window.openProject(cardEl.dataset.projectId);
      else if (typeof viewProject === 'function') viewProject(Number(cardEl.dataset.projectId));
    }));
  }
  function card(project) {
    const holder = personLabel(field(project, ['Porteur_1', 'Porteur', 'porteur_1'])) || 'Porteur non renseigné';
    const accompanist = personLabel(field(project, ['Accompagnateur'])) || 'Accompagnateur non renseigné';
    const programme = programmeLabel(field(project, ['Programme', 'Programme_Axe_InnovationS']));
    const substatus = valueLabel(field(project, ['Statut_operationnel_projet', 'Conventions_statut', 'Statut_Financier'])) || 'Statut macro non renseigné';
    const convention = !!project.Convention_de_reversement || !!project.Convention_de_reversement_le_cas_echeant;
    return `<button type="button" class="project-card" data-project-id="${escape(project.id)}"><span class="project-acronym">${escape(project.Acronyme || 'Sans acronyme')}</span>${programme ? `<span class="programme-badge">${escape(programme)}</span>` : ''}<span class="project-holder"><strong>Porteur :</strong> ${escape(holder)}</span><span class="project-holder"><strong>Accompagnateur :</strong> ${escape(accompanist)}</span><span class="project-substatus"><strong>Statut macro :</strong> ${escape(substatus)}</span>${convention ? '<span class="convention-badge">Convention</span>' : ''}</button>`;
  }
  function setupCombo(id, fieldNames, placeholder) {
    const input = document.getElementById(id);
    const list = document.getElementById(`${id}-list`);
    if (!input || !list) return;
    input.addEventListener('focus', () => {
      list.hidden = false;
      renderCombo(id, options(fieldNames, input.value), placeholder);
    });
    input.addEventListener('input', () => {
      input.dataset.selectedValue = '';
      list.hidden = false;
      renderCombo(id, options(fieldNames, input.value), placeholder);
      render();
    });
    input.addEventListener('blur', () => setTimeout(() => {
      list.hidden = true;
      if (!input.dataset.selectedValue) input.value = '';
    }, 150));
  }
  function init() {
    renderFilters();
    setupCombo('filter-programme', ['Programme', 'Programme_Axe_InnovationS'], 'Tous les programmes');
    setupCombo('filter-instance', ['Instance_ratachee', 'Instance', 'Instances'], 'Toutes les instances');
    render();
    document.getElementById('filter-search')?.addEventListener('input', render);
    document.getElementById('clear-filters')?.addEventListener('click', () => {
      ['filter-programme', 'filter-instance'].forEach(id => {
        const input = document.getElementById(id);
        if (input) { input.value = ''; input.dataset.selectedValue = ''; }
      });
      const search = document.getElementById('filter-search');
      if (search) search.value = '';
      renderFilters();
      render();
    });
  }
  window.renderProjectsKanban = function (projects) { renderFilters(); render(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
