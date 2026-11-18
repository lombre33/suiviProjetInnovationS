/**
 * Page Dashboard — attribué et consommé du programme (18/11/2026, d'après la maquette validée le 10/11).
 *
 * En haut : deux graphiques à détail progressif (année > programme > projet, et l'inverse) qui se filtrent entre eux et filtrent la
 * liste ; en dessous, un volet par programme (attribué, consommé) qui contient ses projets (attribué, consommé, statut modifiable) ;
 * sous chaque projet, un volet « Dépenses » (lignes de l'export FD02). Les règles de calcul sont dans dashboard-logic.js.
 *
 * Écrit dans Grist : seulement Projets.Statut_operationnel_projet (liste déroulante d'un projet) et la ligne de préférences de
 * l'utilisateur (Preferences_Widget, colonnes Dash_*). La table Depenses_OPE est créée à la première ouverture si elle manque,
 * puis seulement lue (les dépenses y sont importées par ailleurs). Lue à l'ouverture de la page, pas au démarrage du widget.
 *
 * Préférences par utilisateur : années, programmes, statuts, recherche, mesure (CP/AE), graphiques masqués. Les volets ouverts
 * ne sont pas retenus : ils sont repliés à chaque ouverture (demande d'Antoine du 10/11).
 */
(function (global) {
  'use strict';

  const L = global.DashboardLogic;
  const PREFS_TABLE = 'Preferences_Widget';
  const PREFS_ROWID_STORAGE_KEY = 'suiviProjetInnovationS:prefsRowId';
  const EMAIL_TRIGGER_COLUMN = { id: 'Email_utilisateur', type: 'Text', isFormula: false, formula: 'user.Email', recalcWhen: 0 };
  const PREFS_COLUMNS = [
    { id: 'Dash_annees', type: 'Text' }, { id: 'Dash_programmes', type: 'Text' }, { id: 'Dash_statuts', type: 'Text' },
    { id: 'Dash_recherche', type: 'Text' }, { id: 'Dash_mesure', type: 'Text' }, { id: 'Dash_graphiques', type: 'Text' }
  ];
  const EXPENSES_TABLE = 'Depenses_OPE';
  // Export FD02 « Consommation détaillée des AE », une ligne par objet de gestion. Code_operation = Lignes_OPE.N_OPE.
  const EXPENSES_COLUMNS = [
    { id: 'Exercice', type: 'Int' }, { id: 'Code_operation', type: 'Text' }, { id: 'CRB', type: 'Text' }, { id: 'SO', type: 'Text' },
    { id: 'Sous_SO', type: 'Text' }, { id: 'Nature_depense', type: 'Text' }, { id: 'Code_analytique', type: 'Text' },
    { id: 'Reference_externe_operation', type: 'Text' }, { id: 'Destination', type: 'Text' }, { id: 'Libelle_destination', type: 'Text' },
    { id: 'Num_EJ', type: 'Text' }, { id: 'Type_objet', type: 'Text' }, { id: 'Libelle_objet', type: 'Text' },
    { id: 'Date_creation', type: 'Date' }, { id: 'Fournisseur', type: 'Text' }, { id: 'Etat', type: 'Text' }, { id: 'Date_validation', type: 'Date' },
    { id: 'EJ_montant_budgetaire', type: 'Numeric' }, { id: 'Montant_budgetaire_SF', type: 'Numeric' },
    { id: 'AE_consomme_hors_virement', type: 'Numeric' }, { id: 'AE_consomme_sur_virement', type: 'Numeric' },
    { id: 'AE_consomme', type: 'Numeric' }, { id: 'CP_consomme', type: 'Numeric' }, { id: 'Domaine', type: 'Text' }, { id: 'Donnees_au', type: 'Date' }
  ];
  const EXPENSES_STALE_MS = 60000; // une ouverture de la page relit les dépenses si la lecture a plus d'une minute
  const BAR_PX = 118;

  const esc = value => CoreUtils.escapeHtml(value);
  const encodeList = CoreUtils.encodeList;
  const decodeList = CoreUtils.decodeList;
  const text = value => (value == null ? '' : String(value).trim());
  const $ = id => document.getElementById(id);
  const table = name => (global.CoreState && CoreState.getTable(name)) || [];

  const state = Object.assign(L.defaultState(), {
    openProgrammes: new Set(), openExpenses: new Set(), orphansOpen: false, // jamais retenus : repliés à chaque ouverture
    expenses: [], expensesState: 'idle', expensesAt: 0, expensesError: ''
  });
  let model = null;
  let datasetCache = null;
  let statusRefresh = null;

  function resetState() {
    Object.assign(state, L.defaultState(), { openProgrammes: new Set(), openExpenses: new Set(), orphansOpen: false, expenses: [], expensesState: 'idle', expensesAt: 0, expensesError: '' });
    model = null; datasetCache = null;
    clearTimeout(statusRefresh); statusRefresh = null;
  }
  const isVisible = () => { const view = $('view-dashboard'); return !!view && !view.classList.contains('hidden'); };

  // --- Données ----------------------------------------------------------------------------------------
  function getDataset() {
    const source = { projets: table('Projets'), programmes: table('Programmes'), lignes: table('Lignes_OPE'), depenses: state.expenses };
    if (datasetCache && Object.keys(source).every(key => datasetCache.source[key] === source[key])) return datasetCache.dataset;
    const dataset = L.buildDataset(source);
    datasetCache = { source, dataset };
    return dataset;
  }
  const statusChoices = () => (global.CoreGrist && CoreGrist.columnChoices ? CoreGrist.columnChoices('Projets', 'Statut_operationnel_projet') : []);

  async function loadExpenses(force) {
    if (!global.CoreGrist || !CoreGrist.gristInstance) return;
    if (state.expensesState === 'loading') return;
    if (!force && state.expensesState === 'ready' && Date.now() - state.expensesAt < EXPENSES_STALE_MS) return;
    state.expensesState = 'loading';
    try {
      try { await CoreGrist.ensureTable(EXPENSES_TABLE, EXPENSES_COLUMNS); }
      catch (err) { console.warn(`Création de ${EXPENSES_TABLE} impossible (droits ?) :`, err.message); }
      state.expenses = await CoreGrist.getTable(EXPENSES_TABLE);
      state.expensesState = 'ready'; state.expensesAt = Date.now(); state.expensesError = '';
    } catch (err) {
      state.expensesState = 'error'; state.expensesError = err.message || String(err); state.expenses = [];
      console.warn(`Lecture de ${EXPENSES_TABLE} impossible :`, err.message);
    }
    render();
  }

  // --- Rendu -------------------------------------------------------------------------------------------
  const ICON_CHEVRON = '<svg class="db-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>';
  const ICON_CHECK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"></path></svg>';
  const pillStyle = status => { const c = L.statusColors(status); return `background:${c.bg};color:${c.fg}`; };

  function barsHtml(chartKey, chart) {
    const max = BAR_PX;
    return `<div class="db-cols">${chart.items.map((item, index) => {
      const hAtt = Math.max(item.att > 0 ? 3 : 0, Math.round(item.ratio.att * max)), hCons = Math.max(item.cons > 0 ? 3 : 0, Math.round(item.ratio.cons * max));
      const tag = chart.level < 2 ? 'button' : 'div';
      const attrs = chart.level < 2 ? ` type="button" data-db-bar="${chartKey}:${index}"` : '';
      return `<${tag} class="db-col${item.over ? ' is-over' : ''}${chart.level < 2 ? '' : ' is-static'}"${attrs} aria-label="${esc(`${item.label} : attribué ${L.eur(item.att)}, consommé ${L.eur(item.cons)}`)}">` +
        `<span class="db-tip"><span>Attribué ${esc(L.eur(item.att))}</span><span>Consommé ${esc(L.eur(item.cons))}</span></span>` +
        `<span class="db-pct">${esc(item.pct)}</span>` +
        `<span class="db-vbar" style="height:${Math.max(hAtt, hCons)}px"><span class="db-vfill" style="height:${hCons}px"></span></span>` +
        `<span class="db-lbl"><b>${esc(item.label)}</b><span>${esc(L.compact(item.att))}</span></span></${tag}>`;
    }).join('')}</div>`;
  }
  function rowsHtml(chartKey, chart) {
    return `<div class="db-hrows">${chart.items.map((item, index) => {
      const tag = chart.level < 2 ? 'button' : 'div';
      const attrs = chart.level < 2 ? ` type="button" data-db-bar="${chartKey}:${index}"` : '';
      return `<${tag} class="db-hrow${item.over ? ' is-over' : ''}${chart.level < 2 ? '' : ' is-static'}"${attrs} title="${esc(`Attribué ${L.eur(item.att)} · Consommé ${L.eur(item.cons)}`)}">` +
        `<span class="db-hname">${esc(item.label)}</span>` +
        `<span class="db-htrack"><span class="db-hatt" style="width:${(item.ratio.att * 100).toFixed(1)}%"></span><span class="db-hcons" style="width:${(item.ratio.cons * 100).toFixed(1)}%"></span></span>` +
        `<span class="db-hpct">${esc(item.pct)}</span><span class="db-hamt">${esc(L.compact(item.att))}</span></${tag}>`;
    }).join('')}</div>`;
  }
  function chartCard(chartKey, chart, vertical) {
    const crumbs = chart.crumbs.map((crumb, index) =>
      `<button type="button" class="db-crumb${crumb.current ? ' is-current' : ''}" data-db-crumb="${chartKey}:${index}"${crumb.current ? ' aria-current="true"' : ''}>${index ? '<span class="db-sep">›</span>' : ''}${esc(crumb.label)}</button>`).join('');
    const body = chart.items.length ? (vertical ? barsHtml(chartKey, chart) : rowsHtml(chartKey, chart)) : '<p class="db-chart-empty">Rien à afficher pour ces filtres.</p>';
    return `<div class="db-card"><div class="db-chead"><nav class="db-crumbs" aria-label="Niveau de détail">${crumbs}</nav>` +
      `<span class="db-hint">${chart.level < 2 ? 'Cliquer pour détailler' : ''}</span></div>${body}</div>`;
  }
  function chartsHtml(m) {
    const kpi = m.kpi;
    return `<div class="db-charts-grid"><div class="db-card db-kpis">` +
      `<div><span class="db-kl"><i class="db-sw db-sw-att"></i>Attribué</span><strong class="db-kv" id="db-kpi-att">${esc(L.eur(kpi.att))}</strong></div>` +
      `<div><span class="db-kl"><i class="db-sw db-sw-cons"></i>Consommé (${m.measure})</span><strong class="db-kv" id="db-kpi-cons">${esc(L.eur(kpi.cons))}</strong>` +
      `<div class="db-kbar"><div class="db-kfill${kpi.over ? ' is-over' : ''}" style="width:${Math.min(100, kpi.pctN)}%"></div></div>` +
      `<span class="db-kp">${esc(kpi.pct)} · reste ${esc(L.eur(kpi.reste))}</span></div></div>` +
      chartCard('A', m.chartA, true) + chartCard('B', m.chartB, false) + '</div>';
  }

  function expensesHtml(list, extra) {
    const note = amount => `<p class="db-exp-note">${esc(L.eur(amount))} consommés sur la ligne OPE sans détail de dépense (total de la ligne OPE, non ventilé par année).</p>`;
    if (!list.length) return extra ? note(extra) : '<p class="db-exp-empty">Aucune dépense détaillée pour ces années.</p>';
    const ae = list.reduce((sum, e) => sum + e.AE, 0), cp = list.reduce((sum, e) => sum + e.CP, 0);
    const rows = list.map(e => `<tr><td class="db-nowrap">${esc(e.date ? e.date.split('-').reverse().join('/') : '')}</td><td>${esc(e.fournisseur)}</td>` +
      `<td class="db-exp-obj" title="${esc(e.libelle)}">${esc(e.libelle)}</td><td class="db-nowrap">${esc(e.ej)}</td><td title="${esc(e.destinationLibelle)}">${esc(e.nature)}${e.destination ? ` · ${esc(e.destination)}` : ''}</td>` +
      `<td>${esc(e.etat)}</td><td class="db-num">${e.AE ? esc(L.eur(e.AE)) : ''}</td><td class="db-num">${e.CP ? esc(L.eur(e.CP)) : ''}</td></tr>`).join('');
    return `<div class="db-exp-scroll"><table class="db-exp-table"><thead><tr><th>Date</th><th>Fournisseur</th><th>Objet</th><th>N° EJ</th><th>Nature · destination</th><th>État</th><th class="db-num">AE</th><th class="db-num">CP</th></tr></thead>` +
      `<tbody>${rows}</tbody><tfoot><tr><td colspan="6">${list.length} dépense${list.length > 1 ? 's' : ''}</td><td class="db-num">${esc(L.eur(ae))}</td><td class="db-num">${esc(L.eur(cp))}</td></tr></tfoot></table></div>` +
      (extra ? note(extra) : '');
  }

  function projectRowHtml(entry, statuses, helpHtml) {
    const project = entry.project, open = state.openExpenses.has(project.id);
    const status = project.statut;
    const options = (status && !statuses.includes(status) ? [status].concat(statuses) : statuses);
    const select = `<select class="db-sel" data-db-status="${esc(project.id)}" aria-label="${esc(`Statut du projet ${project.acronyme}`)}">${status ? '' : '<option value="" selected>—</option>'}` +
      options.map(value => `<option value="${esc(value)}"${value === status ? ' selected' : ''}>${esc(value)}</option>`).join('') + '</select>';
    const dot = L.statusColors(status).dot;
    const n = entry.expenses.length;
    return `<div class="db-row db-prow${open ? ' is-open' : ''}" data-project-id="${esc(project.id)}">` +
      `<span class="db-name db-pj"><button type="button" class="db-exp-toggle" data-db-exp="${esc(project.id)}" aria-expanded="${open}" title="Dépenses détaillées" aria-label="${esc(`Dépenses de ${project.acronyme}`)}">${ICON_CHEVRON}<span class="db-n${n ? '' : ' is-zero'}">${n}</span></button>` +
      `<span class="db-who"><button type="button" class="db-acr" data-db-open-project="${esc(project.id)}" title="Ouvrir la fiche projet">${esc(project.acronyme)}</button>` +
      `${project.titre ? `<span class="db-cap" title="${esc(project.titre)}">${esc(project.titre)}</span>` : ''}</span></span>` +
      `<span class="db-st"><span class="db-stwrap" style="${pillStyle(status)}"><i class="db-dot" style="background:${dot}"></i>${select}<svg class="db-stchev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg></span><span class="db-saved" data-db-saved="${esc(project.id)}" hidden>${ICON_CHECK}Enregistré</span></span>` +
      `<span class="db-pr">${progressHtml(entry.cons, entry.att, entry.pct, entry.over)}</span>` +
      `<span class="db-att">${esc(L.eur(entry.att))}</span><span class="db-cons${entry.over ? ' is-over' : ''}">${esc(L.eur(entry.cons))}</span></div>` +
      (open ? `<div class="db-exp">${expensesHtml(entry.expenses, entry.undetailed)}</div>` : '');
  }
  function progressHtml(cons, att, pct, over) {
    const w = att > 0 ? Math.min(100, Math.round((cons / att) * 100)) : 0;
    return `<span class="db-mini"><span class="db-mf${over ? ' is-over' : ''}" style="width:${w}%"></span></span><b class="db-pp">${esc(pct)}</b>`;
  }
  function volHtml(group, m, statuses, helpHtml) {
    const open = state.openProgrammes.has(group.programme);
    const dots = group.statusCounts.map(s => `<span class="db-dotn" title="${esc(`${s.label || 'Sans statut'} : ${s.n}`)}"><i class="db-dot" style="background:${L.statusColors(s.label).dot}"></i>${s.n}</span>`).join('');
    return `<div class="db-vol${open ? ' is-open' : ''}" data-db-programme="${esc(group.programme)}">` +
      `<button type="button" class="db-row db-vhead" data-db-vol="${esc(group.programme)}" aria-expanded="${open}">` +
      `<span class="db-name">${ICON_CHEVRON}<span class="db-pn">${esc(group.programme)}</span><span class="db-tag">${group.count} projet${group.count > 1 ? 's' : ''}</span></span>` +
      `<span class="db-st db-dots">${dots}</span><span class="db-pr">${progressHtml(group.cons, group.att, group.pct, group.over)}</span>` +
      `<span class="db-att"><b>${esc(L.eur(group.att))}</b></span><span class="db-cons${group.over ? ' is-over' : ''}"><b>${esc(L.eur(group.cons))}</b></span></button>` +
      (open ? `<div class="db-vbody">${group.projects.map(entry => projectRowHtml(entry, statuses, helpHtml)).join('')}</div>` : '') + '</div>';
  }
  function orphansHtml(m) {
    const o = m.orphans;
    if (!o) return '';
    const open = state.orphansOpen;
    return `<div class="db-vol db-vol-orphans${open ? ' is-open' : ''}"><button type="button" class="db-row db-vhead" data-db-orphans aria-expanded="${open}">` +
      `<span class="db-name">${ICON_CHEVRON}<span class="db-pn">Sans projet rattaché</span><span class="db-tag" title="Dépenses dont le code opération ne correspond à aucune ligne OPE d'un projet">${o.expenses.length} dépense${o.expenses.length > 1 ? 's' : ''}</span></span>` +
      `<span class="db-st"></span><span class="db-pr"></span><span class="db-att"></span><span class="db-cons"><b>${esc(L.eur(o[m.measure]))}</b></span></button>` +
      (open ? `<div class="db-exp">${expensesHtml(o.expenses, 0)}</div>` : '') + '</div>';
  }
  function footnoteHtml(m) {
    const notes = [];
    if (state.expensesState === 'loading' || state.expensesState === 'idle') notes.push('Chargement des dépenses…');
    if (state.expensesState === 'error') notes.push(`Table ${EXPENSES_TABLE} illisible : ${esc(state.expensesError)}`);
    if (m.outOfRange) notes.push(`${m.outOfRange.count} dépense${m.outOfRange.count > 1 ? 's' : ''} d'un exercice hors 2023-2026 (${esc(L.eur(m.outOfRange[m.measure]))} ${m.measure}) non comptée${m.outOfRange.count > 1 ? 's' : ''}.`);
    return notes.length ? `<p class="db-foot">${notes.join(' ')}</p>` : '';
  }

  function listHtml(m) {
    const help = global.HelpTooltip ? HelpTooltip.markup('Projets', 'Statut_operationnel_projet') : '';
    const head = `<div class="db-row db-colhead" aria-hidden="true"><span>Programme · projet</span><span>Statut du projet${help}</span><span>Consommation</span><span class="db-r">Attribué</span><span class="db-r">Consommé</span></div>`;
    if (!m.groups.length && !m.orphans) return `${head}<div class="db-card db-empty"><span>Aucun projet ne correspond à ces filtres.</span><button type="button" class="btn btn-secondary" data-db-reset>Réinitialiser les filtres</button></div>${footnoteHtml(m)}`;
    return head + m.groups.map(group => volHtml(group, m, m.options.statuses, help)).join('') + orphansHtml(m) + footnoteHtml(m);
  }

  // Bandeau : années, listes à cases, mesure, bouton des graphiques.
  function renderBand(m) {
    const years = $('db-years');
    if (years) years.innerHTML = m.years.map(year => `<button type="button" class="db-year${m.selYears.includes(year) ? ' is-on' : ''}" data-db-year="${year}" aria-pressed="${m.selYears.includes(year)}">${esc(L.yearLabel(year))}</button>`).join('');
    document.querySelectorAll('[data-db-measure]').forEach(btn => { const on = btn.dataset.dbMeasure === m.measure; btn.classList.toggle('is-on', on); btn.setAttribute('aria-pressed', String(on)); });
    const toggle = $('db-toggle-charts');
    if (toggle) { toggle.setAttribute('aria-expanded', String(state.charts)); toggle.classList.toggle('is-collapsed', !state.charts); }
    syncCombo('db-filter-programme', state.programmes, 'programmes sélectionnés');
    syncCombo('db-filter-statut', state.statuts, 'statuts sélectionnés');
    const search = $('db-filter-search');
    if (search && search !== document.activeElement && search.value !== state.search) search.value = state.search;
    const reset = $('db-clear-filters'); // l'icône n'apparaît que lorsqu'un filtre est actif (place verticale économisée)
    if (reset) reset.hidden = !(Array.isArray(state.years) || state.programmes.length || state.statuts.length || text(state.search));
  }
  function multiSummary(values, label) { return values.length === 0 ? '' : (values.length === 1 ? values[0] : `${values.length} ${label}`); }
  function syncCombo(id, selected, label) {
    const input = $(id);
    if (input) { input.value = multiSummary(selected, label); input.classList.toggle('is-active', selected.length > 0); }
  }
  function comboValues(id) { return id === 'db-filter-programme' ? (model ? model.options.programmes : []) : (model ? model.options.statuses : []); }
  function renderComboList(id) {
    const list = $(`${id}-list`);
    if (!list) return;
    const isProg = id === 'db-filter-programme';
    const selected = isProg ? state.programmes : state.statuts;
    const ordered = comboValues(id).slice().sort((a, b) => (selected.includes(b) ? 1 : 0) - (selected.includes(a) ? 1 : 0));
    list.innerHTML = `<button type="button" data-value="">${isProg ? 'Tous les programmes' : 'Tous les statuts'}</button>` +
      ordered.map(value => `<button type="button" class="${selected.includes(value) ? 'is-selected' : ''}" data-value="${esc(value)}" role="option" aria-selected="${selected.includes(value)}">${esc(value)}</button>`).join('');
  }
  function setupCombo(id) {
    const input = $(id), list = $(`${id}-list`);
    if (!input || !list) return;
    input.readOnly = true;
    input.addEventListener('focus', () => { renderComboList(id); list.hidden = false; });
    input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 150));
    list.addEventListener('mousedown', event => {
      const button = event.target.closest && event.target.closest('[data-value]');
      if (!button) return;
      event.preventDefault();
      const key = id === 'db-filter-programme' ? 'programmes' : 'statuts', value = button.dataset.value;
      state[key] = value === '' ? [] : (state[key].includes(value) ? state[key].filter(v => v !== value) : state[key].concat([value]));
      if (state.programmes.length === 1) state.openProgrammes.add(state.programmes[0]); // un seul programme ciblé : son volet s'ouvre
      render(); renderComboList(id); persist();
    });
  }

  function render() {
    const view = $('view-dashboard');
    if (!view) return;
    model = L.compute(getDataset(), state, statusChoices());
    renderBand(model);
    const charts = $('db-charts');
    if (charts) { charts.hidden = !state.charts; if (state.charts) charts.innerHTML = chartsHtml(model); }
    const list = $('db-list');
    if (list) list.innerHTML = listHtml(model);
    if (isVisible() && state.expensesState === 'idle') loadExpenses(false);
  }

  // --- Interactions ------------------------------------------------------------------------------------
  function applyDrill(chartKey, index, crumb) {
    const chart = chartKey === 'A' ? model.chartA : model.chartB;
    if (crumb) {
      chart.crumbs[index].reset.forEach(dim => Object.assign(state, L.drillState(state, dim, null)));
    } else {
      const item = chart.items[index];
      if (!item || chart.level >= 2) return;
      Object.assign(state, L.drillState(state, chart.dim, item.key));
    }
    // Un seul programme ciblé : son volet s'ouvre tout seul ; on le retient comme ouvert pour qu'il reste repliable ensuite.
    if (state.programmes.length === 1) state.openProgrammes.add(state.programmes[0]);
    render(); persist();
  }
  function toggleSet(set, value) { if (set.has(value)) set.delete(value); else set.add(value); }
  function projectRow(id) { return table('Projets').find(row => String(row.id) === String(id)); }

  async function changeStatus(select) {
    const id = select.dataset.dbStatus, value = select.value, row = projectRow(id);
    if (!row || !global.CoreGrist || !CoreGrist.gristInstance) return;
    const before = text(row.Statut_operationnel_projet);
    if (value === before) return;
    row.Statut_operationnel_projet = value; // écriture optimiste : la ligne affichée suit tout de suite, rétablie en cas d'échec
    const wrap = select.closest('.db-stwrap');
    if (wrap) { wrap.setAttribute('style', pillStyle(value)); const dot = wrap.querySelector('.db-dot'); if (dot) dot.style.background = L.statusColors(value).dot; }
    try {
      await CoreGrist.gristInstance.docApi.applyUserActions([['UpdateRecord', 'Projets', Number(id), { Statut_operationnel_projet: value }]]);
      const mark = document.querySelector(`[data-db-saved="${CSS.escape(String(id))}"]`);
      if (mark) { mark.hidden = false; setTimeout(() => { mark.hidden = true; }, 1800); }
      datasetCache = null;
      scheduleStatusRefresh();
    } catch (err) {
      row.Statut_operationnel_projet = before;
      CoreUtils.showToast(`Échec de l'enregistrement du statut (${err.message})`, true);
      datasetCache = null; render();
    }
  }
  // Statut_Macro (formule) et les autres pages dépendent du statut : relecture groupée, une seule pour une série de changements.
  function scheduleStatusRefresh() {
    clearTimeout(statusRefresh);
    statusRefresh = setTimeout(() => { if (global.SuiviApp && SuiviApp.refreshAfterProjectSaved) SuiviApp.refreshAfterProjectSaved(); }, 2500);
  }

  function onClick(event) {
    const target = event.target.closest ? event.target.closest('[data-db-year],[data-db-measure],[data-db-bar],[data-db-crumb],[data-db-vol],[data-db-exp],[data-db-open-project],[data-db-orphans],[data-db-reset]') : null;
    if (!target) return;
    if (target.dataset.dbYear !== undefined) {
      state.years = L.toggleYear(state, Number(target.dataset.dbYear), model.years);
      render(); persist();
    } else if (target.dataset.dbMeasure !== undefined) {
      state.measure = target.dataset.dbMeasure; render(); persist();
    } else if (target.dataset.dbBar !== undefined) {
      const [chartKey, index] = target.dataset.dbBar.split(':'); applyDrill(chartKey, Number(index), false);
    } else if (target.dataset.dbCrumb !== undefined) {
      const [chartKey, index] = target.dataset.dbCrumb.split(':'); applyDrill(chartKey, Number(index), true);
    } else if (target.dataset.dbVol !== undefined) {
      toggleSet(state.openProgrammes, target.dataset.dbVol); render();
    } else if (target.dataset.dbExp !== undefined) {
      const id = Number(target.dataset.dbExp); toggleSet(state.openExpenses, id); render();
    } else if (target.dataset.dbOpenProject !== undefined) {
      const row = projectRow(target.dataset.dbOpenProject);
      if (row && global.ProjectModal && ProjectModal.open) ProjectModal.open(row);
      else if (global.openProject) global.openProject(target.dataset.dbOpenProject);
    } else if (target.dataset.dbOrphans !== undefined) {
      state.orphansOpen = !state.orphansOpen; render();
    } else if (target.dataset.dbReset !== undefined) {
      resetFilters();
    }
  }
  function resetFilters() {
    Object.assign(state, { years: null, programmes: [], statuts: [], search: '' });
    const search = $('db-filter-search'); if (search) search.value = '';
    render(); persist();
  }

  // --- Préférences (Preferences_Widget) -----------------------------------------------------------------
  let prefsRowId = null;
  function getCachedPrefsRowId() { try { const raw = localStorage.getItem(PREFS_ROWID_STORAGE_KEY); return raw ? Number(raw) : null; } catch (err) { return null; } }
  function setCachedPrefsRowId(id) { try { localStorage.setItem(PREFS_ROWID_STORAGE_KEY, String(id)); } catch (err) { /* stockage bloqué */ } }
  function applyStoredPreferences(row) {
    const years = decodeList(row.Dash_annees).map(Number).filter(year => L.YEARS.includes(year) || year === L.NO_YEAR);
    state.years = years.length ? years : null;
    state.programmes = decodeList(row.Dash_programmes);
    state.statuts = decodeList(row.Dash_statuts);
    state.search = text(row.Dash_recherche);
    if (L.MEASURES.includes(text(row.Dash_mesure))) state.measure = text(row.Dash_mesure);
    state.charts = text(row.Dash_graphiques) !== '0';
  }
  async function loadDashboardUserPreferences() {
    if (!global.CoreGrist || !CoreGrist.gristInstance) return;
    try {
      await CoreGrist.ensureTable(PREFS_TABLE, [EMAIL_TRIGGER_COLUMN, ...PREFS_COLUMNS]);
      await CoreGrist.ensureColumns(PREFS_TABLE, PREFS_COLUMNS);
      const rows = await CoreGrist.getTable(PREFS_TABLE, { shared: true });
      const cachedId = getCachedPrefsRowId();
      const row = cachedId != null ? rows.find(r => r.id === cachedId) : null;
      if (!row) {
        const result = await CoreGrist.gristInstance.docApi.applyUserActions([['AddRecord', PREFS_TABLE, null, {}]]);
        CoreGrist.invalidateTable(PREFS_TABLE);
        prefsRowId = CoreUtils.extractAddedRecordId(result);
        setCachedPrefsRowId(prefsRowId);
        return;
      }
      prefsRowId = row.id;
      if (PREFS_COLUMNS.some(column => text(row[column.id]))) applyStoredPreferences(row);
    } catch (err) { console.warn('Chargement des préférences Dashboard a échoué :', err.message); }
  }
  async function savePreferences() {
    saveSoon.cancel();
    if (!prefsRowId || !global.CoreGrist || !CoreGrist.gristInstance) return;
    const fields = {
      Dash_annees: Array.isArray(state.years) ? encodeList(state.years.map(String)) : '', Dash_programmes: encodeList(state.programmes), Dash_statuts: encodeList(state.statuts),
      Dash_recherche: state.search, Dash_mesure: state.measure, Dash_graphiques: state.charts ? '' : '0'
    };
    try { await CoreGrist.gristInstance.docApi.applyUserActions([['UpdateRecord', PREFS_TABLE, prefsRowId, fields]]); }
    catch (err) { console.warn('Enregistrement des préférences Dashboard a échoué :', err.message); }
  }
  const saveSoon = CoreUtils.debounce(() => savePreferences(), 600);
  const persist = () => saveSoon();
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveSoon.flush(); });

  // --- Démarrage ----------------------------------------------------------------------------------------
  function init() {
    const view = $('view-dashboard');
    if (!view) return;
    view.addEventListener('click', onClick);
    view.addEventListener('change', event => { const select = event.target.closest && event.target.closest('[data-db-status]'); if (select) changeStatus(select); });
    setupCombo('db-filter-programme'); setupCombo('db-filter-statut');
    const search = $('db-filter-search');
    if (search) search.addEventListener('input', () => { state.search = search.value; render(); persist(); });
    const toggle = $('db-toggle-charts');
    if (toggle) toggle.addEventListener('click', () => { state.charts = !state.charts; render(); persist(); });
    const clear = $('db-clear-filters');
    if (clear) clear.addEventListener('click', resetFilters);
    // La page relit les dépenses à chaque ouverture si la dernière lecture date : l'import des dépenses se fait ailleurs.
    const nav = document.querySelector('.nav-btn[data-view="view-dashboard"]');
    if (nav) nav.addEventListener('click', () => { if (state.expensesState === 'ready' || state.expensesState === 'error') loadExpenses(state.expensesState === 'error'); });
  }

  global.renderDashboard = render;
  global.loadDashboardUserPreferences = loadDashboardUserPreferences;
  global.DashboardPage = { state, render, loadExpenses, resetState, getModel: () => model, resetPrefsRow: () => { prefsRowId = null; }, EXPENSES_TABLE, EXPENSES_COLUMNS, savePreferences };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
