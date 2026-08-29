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
  const refLabel = value => {
    if (value && typeof value === 'object') return value.NOM || value.nom_et_Prenom || value.name || value.label || value.Acronyme || value.id || '';
    return text(value);
  };
  const valueLabel = value => Array.isArray(value) ? value.map(refLabel).filter(Boolean).join(', ') : refLabel(value);
  const normalized = value => text(value).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const field = (project, names) => { for (const name of names) if (project[name] != null && project[name] !== '') return project[name]; return ''; };
  function getProjects() { return (window.CoreState && CoreState.getTable('Projets')) || []; }
  function currentFilters() { return { programme: document.getElementById('filter-programme')?.value || '', instance: document.getElementById('filter-instance')?.value || '', search: normalized(document.getElementById('filter-search')?.value) }; }
  function filteredProjects() {
    const filters = currentFilters();
    return getProjects().filter(project => {
      const acronym = text(project.Acronyme);
      const programme = valueLabel(field(project, ['Programme', 'Programme_Axe_InnovationS']));
      const instance = valueLabel(field(project, ['Instance_ratachee', 'Instance', 'Instances']));
      return (!filters.programme || programme === filters.programme) && (!filters.instance || instance === filters.instance) && (!filters.search || normalized(acronym).includes(filters.search));
    });
  }
  function options(fieldNames) {
    return [...new Set(getProjects().map(p => valueLabel(field(p, fieldNames))).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'fr'));
  }
  function fillSelect(id, values, placeholder) {
    const select = document.getElementById(id); if (!select) return;
    const prior = select.value; select.innerHTML = `<option value="">${placeholder}</option>` + values.map(v => `<option value="${escape(v)}">${escape(v)}</option>`).join('');
    if (values.includes(prior)) select.value = prior;
  }
  function renderFilters() { fillSelect('filter-programme', options(['Programme', 'Programme_Axe_InnovationS']), 'Tous les programmes'); fillSelect('filter-instance', options(['Instance_ratachee', 'Instance', 'Instances']), 'Toutes les instances'); }
  function render() {
    const board = document.getElementById('projects-kanban'); if (!board) return;
    const projects = filteredProjects();
    board.innerHTML = COLUMNS.map(column => {
      const cards = projects.filter(p => normalized(p.Statut_Macro) === normalized(column.key));
      return `<section class="kanban-column" style="--column-accent:${column.color}" aria-labelledby="kanban-${normalized(column.key)}"><header class="kanban-column-header"><h3 id="kanban-${normalized(column.key)}">${column.label}</h3><span class="kanban-count">${cards.length}</span></header><div class="kanban-cards">${cards.length ? cards.map(card).join('') : '<p class="kanban-empty">Aucun projet</p>'}</div></section>`;
    }).join('');
    board.querySelectorAll('[data-project-id]').forEach(cardEl => cardEl.addEventListener('click', () => window.openProject ? window.openProject(cardEl.dataset.projectId) : (typeof viewProject === 'function' && viewProject(Number(cardEl.dataset.projectId)))));
  }
  function card(project) {
    const holder = valueLabel(field(project, ['Porteur_1', 'Porteur', 'porteur_1'])) || 'Porteur non renseigné';
    const substatus = valueLabel(field(project, ['Statut_operationnel_projet', 'Conventions_statut', 'Statut_Financier'])) || 'Sous-statut non renseigné';
    const convention = !!project.Convention_de_reversement || !!project.Convention_de_reversement_le_cas_echeant;
    return `<button type="button" class="project-card" data-project-id="${escape(project.id)}"><span class="project-acronym">${escape(project.Acronyme || 'Sans acronyme')}</span><span class="project-holder"><strong>Porteur :</strong> ${escape(holder)}</span><span class="project-substatus"><strong>Sous-statut :</strong> ${escape(substatus)}</span>${convention ? '<span class="convention-badge">Convention</span>' : ''}</button>`;
  }
  function init() { renderFilters(); render(); ['filter-programme','filter-instance','filter-search'].forEach(id => document.getElementById(id)?.addEventListener(id === 'filter-search' ? 'input' : 'change', render)); document.getElementById('clear-filters')?.addEventListener('click', () => { ['filter-programme','filter-instance','filter-search'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); render(); }); }
  window.renderProjectsKanban = function (projects) { renderFilters(); render(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
