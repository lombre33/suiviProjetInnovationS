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
 * Préférences par utilisateur : années, programmes, statuts, recherche, mesure (CP/AE), graphiques ouverts (repliés par défaut). Les volets ouverts
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
    { id: 'Dash_recherche', type: 'Text' }, { id: 'Dash_mesure', type: 'Text' }, { id: 'Dash_graphiques', type: 'Text' }, { id: 'Dash_moteur', type: 'Text' }, { id: 'Dash_bailleurs', type: 'Text' }, { id: 'Dash_regroupement', type: 'Text' }, { id: 'Dash_reattributions', type: 'Text' }, { id: 'Dash_horizon', type: 'Text' }
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
  const VERTICAL_MAX = 6; // au-delà, les colonnes du graphique 1 se chevauchent : barres horizontales défilantes

  const esc = value => CoreUtils.escapeHtml(value);
  const encodeList = CoreUtils.encodeList;
  const decodeList = CoreUtils.decodeList;
  const text = value => (value == null ? '' : String(value).trim());
  const $ = id => document.getElementById(id);
  const table = name => (global.CoreState && CoreState.getTable(name)) || [];

  const state = Object.assign(L.defaultState(), {
    openProgrammes: new Set(), openExpenses: new Set(), openOpes: new Set(), opeFilters: new Map(), openKids: new Set(), orphansOpen: false, // jamais retenus : repliés à chaque ouverture
    expenses: [], expensesState: 'idle', expensesAt: 0, expensesError: '',
    alertsOpen: false, alertsTab: '', alertsMore: false, alertsHorizon: 6 // le tiroir se referme à chaque ouverture ; l'horizon est retenu par personne
  });
  let model = null;
  let alerts = null;
  let datasetCache = null;
  let statusRefresh = null;

  function resetState() {
    Object.assign(state, L.defaultState(), { openProgrammes: new Set(), openExpenses: new Set(), openOpes: new Set(), opeFilters: new Map(), openKids: new Set(), orphansOpen: false, expenses: [], expensesState: 'idle', expensesAt: 0, expensesError: '', alertsOpen: false, alertsTab: '', alertsMore: false, alertsHorizon: 6 });
    model = null; alerts = null; datasetCache = null;
    dropBi(); biFailure = null;
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
      chartCard('A', m.chartA, m.chartA.items.length <= VERTICAL_MAX) + chartCard('B', m.chartB, false) + '</div>';
  }

  // Explication de la pastille « écart » : ce que dit la ligne OPE, ce que dit le détail, et l'écart (ligne par ligne si plusieurs).
  function gapTitle(gap) {
    if (gap.kind === 'nodetail') return `Aucun détail de dépense pour ${gap.items.length > 1 ? 'ces lignes OPE' : 'cette ligne OPE'} (${L.eur(gap.CP)} consommés au total).`;
    return `Écart entre la ligne OPE (${L.eur(gap.CP)} CP) et le détail des dépenses (${L.eur(gap.detailCP)}) : ${gapSigned(gap.diffCP)}.`;
  }
  const gapSigned = value => `${value > 0 ? '+' : ''}${L.eur(value)}`;
  function gapNoteHtml(gap) {
    if (!gap) return '';
    const head = gap.kind === 'nodetail'
      ? `Aucun détail de dépense n'a été importé pour ${gap.items.length > 1 ? 'ces lignes OPE' : 'cette ligne OPE'} : ${esc(L.eur(gap.CP))} CP consommés au total sur la ligne.`
      : `Écart entre la ligne OPE et le détail des dépenses (tous exercices) : la ligne indique ${esc(L.eur(gap.CP))} CP, le détail en totalise ${esc(L.eur(gap.detailCP))}, soit ${esc(gapSigned(gap.diffCP))}.`;
    const ae = gap.withAE && gap.kind === 'gap' && Math.abs(gap.diffAE) > L.GAP_TOLERANCE ? ` En AE : ${esc(L.eur(gap.AE))} sur la ligne, ${esc(L.eur(gap.detailAE))} au détail (${esc(gapSigned(gap.diffAE))}).` : '';
    const lines = gap.items.length > 1 || gap.kind === 'gap' && gap.items.length === 1 && gap.items[0].kind === 'nodetail'
      ? `<ul class="db-gap-list">${gap.items.map(item => `<li><b>${esc(item.code)}</b> : ${item.kind === 'nodetail' ? `sans détail (${esc(L.eur(item.CP))} sur la ligne)` : `ligne ${esc(L.eur(item.CP))}, détail ${esc(L.eur(item.detailCP))} (${esc(gapSigned(item.diffCP))})`}</li>`).join('')}</ul>` : '';
    return `<div class="db-gap-note is-${gap.kind}"><p>${head}${ae}</p>${lines}</div>`;
  }
  function gapBadgeHtml(project) {
    const gap = project.gap;
    if (!gap) return '';
    return `<button type="button" class="db-gap is-${gap.kind}" data-db-exp="${esc(project.id)}" title="${esc(gapTitle(gap))}" aria-expanded="${state.openExpenses.has(project.id)}" aria-label="${esc(`${project.acronyme} : ${gapTitle(gap)}`)}">${gap.kind === 'nodetail' ? 'sans détail' : 'écart'}</button>`;
  }

  function expensesHtml(list, extra, gap) {
    const note = amount => `<p class="db-exp-note">${esc(L.eur(amount))} consommés sur la ligne OPE sans détail de dépense (total de la ligne OPE, non ventilé par année).</p>`;
    const gapNote = gapNoteHtml(gap);
    if (!list.length) return (extra ? note(extra) : '<p class="db-exp-empty">Aucune dépense détaillée pour ces années.</p>') + gapNote;
    const ae = list.reduce((sum, e) => sum + e.AE, 0), cp = list.reduce((sum, e) => sum + e.CP, 0);
    const rows = list.map(e => `<tr><td class="db-nowrap">${esc(e.date ? e.date.split('-').reverse().join('/') : '')}</td><td>${esc(e.fournisseur)}</td>` +
      `<td class="db-exp-obj" title="${esc(e.libelle)}">${esc(e.libelle)}</td><td class="db-nowrap">${esc(e.ej)}</td><td title="${esc(e.destinationLibelle)}">${esc(e.nature)}${e.destination ? ` · ${esc(e.destination)}` : ''}</td>` +
      `<td>${esc(e.etat)}</td><td class="db-num">${e.AE ? esc(L.eur(e.AE)) : ''}</td><td class="db-num">${e.CP ? esc(L.eur(e.CP)) : ''}</td></tr>`).join('');
    return `<div class="db-exp-scroll"><table class="db-exp-table"><thead><tr><th>Date</th><th>Fournisseur</th><th>Objet</th><th>N° EJ</th><th>Nature · destination</th><th>État</th><th class="db-num">AE</th><th class="db-num">CP</th></tr></thead>` +
      `<tbody>${rows}</tbody><tfoot><tr><td colspan="6">${list.length} dépense${list.length > 1 ? 's' : ''}</td><td class="db-num">${esc(L.eur(ae))}</td><td class="db-num">${esc(L.eur(cp))}</td></tr></tfoot></table></div>` +
      (extra ? note(extra) : '') + gapNote;
  }


  // « + Idex » (ou « + InnovationS » en mode Idex seul) : le projet a une OPE d'un autre bailleur, non comptée dans ses montants.
  function idexBadgeHtml(entry) {
    if (!entry.excludedOpes || !model) return '';
    const b = model.bailleur;
    const label = b.idex && !b.innovations ? '+ InnovationS' : '+ Idex';
    const which = b.idex && !b.innovations ? 'InnovationS' : 'Idex';
    const n = entry.excludedOpes;
    return `<span class="db-idex" title="${esc(`${n > 1 ? `${n} OPE de ce projet ont` : '1 OPE de ce projet a'} pour bailleur ${which} : non comptée${n > 1 ? 's' : ''} dans ces montants (puces du bandeau pour les ajouter).`)}">${label}</span>`;
  }

  // --- Détail d'un projet : une ligne par OPE, puis les dépenses de l'OPE en trois blocs par grande masse ---------------------
  const MASSE_BLOCKS = [['M10_Fonctionnement', 'Fonctionnement'], ['M20_Investissement', 'Investissement'], ['M30_Personnel', 'Personnel'], ['', 'Autres dépenses (masse non reconnue)']];
  const opeFilter = key => state.opeFilters.get(key) || { from: '', to: '', q: '', sort: 'date', dir: 'desc' };
  const opeFilterActive = f => !!(f.from || f.to || text(f.q));
  const dateIso = value => text(value);
  function opeVisibleExpenses(ope) {
    const f = opeFilter(ope.key), q = L.fold(f.q);
    const list = ope.expenses.filter(e => {
      if (f.from && (!e.date || e.date < f.from)) return false;
      if (f.to && (!e.date || e.date > f.to)) return false;
      if (q && !L.fold(`${e.fournisseur} ${e.libelle} ${e.ej} ${e.nature} ${e.destinationLibelle} ${e.etat}`).includes(q)) return false;
      return true;
    });
    const dir = f.dir === 'asc' ? 1 : -1;
    const by = { date: e => e.date || '', fournisseur: e => L.fold(e.fournisseur), libelle: e => L.fold(e.libelle), AE: e => e.AE, CP: e => e.CP, ej: e => e.ej }[f.sort] || (e => e.date || '');
    return list.slice().sort((a, b) => { const x = by(a), y = by(b); return (x < y ? -1 : x > y ? 1 : 0) * dir || a.id - b.id; });
  }
  function sortHead(key, label, ope, extraClass) {
    const f = opeFilter(ope.key), on = f.sort === key;
    return `<th${extraClass ? ` class="${extraClass}"` : ''} aria-sort="${on ? (f.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"><button type="button" class="db-sortbtn${on ? ' is-sorted' : ''}" data-db-opesort="${esc(ope.key)}:${key}" title="Trier par ${esc(label.toLowerCase())}">${esc(label)}${on ? (f.dir === 'asc' ? ' ▲' : ' ▼') : ''}</button></th>`;
  }
  function masseBlockHtml(ope, mass, label, list) {
    const m = model ? model.measure : 'CP';
    const rows = list.filter(e => e.masse === mass);
    const cons = rows.reduce((sum, e) => sum + e[m], 0);
    const att = mass ? ope.attMasse[mass] : 0;
    const fig = mass ? `<span>Attribué <b>${esc(L.eur(att))}</b></span><span>Consommé ${m} <b>${esc(L.eur(cons))}</b></span>` : `<span>Consommé ${m} <b>${esc(L.eur(cons))}</b></span>`;
    const head = `<div class="db-mhead"><b>${esc(label)}</b><span class="db-tag">${rows.length} dépense${rows.length > 1 ? 's' : ''}</span><span class="db-mfig">${fig}</span></div>`;
    if (!rows.length) return `<div class="db-mblock" data-db-masse="${esc(mass || 'autres')}">${head}<p class="db-exp-empty">Aucune dépense détaillée${opeFilterActive(opeFilter(ope.key)) ? ' pour ce filtre' : ' pour ces années'}.</p></div>`;
    const ae = rows.reduce((sum, e) => sum + e.AE, 0), cp = rows.reduce((sum, e) => sum + e.CP, 0);
    const body = rows.map(e => `<tr><td class="db-nowrap">${esc(e.date ? e.date.split('-').reverse().join('/') : '')}</td><td>${esc(e.fournisseur)}</td>` +
      `<td class="db-exp-obj" title="${esc(e.libelle)}">${esc(e.libelle)}</td><td class="db-nowrap">${esc(e.ej)}</td><td title="${esc(e.destinationLibelle)}">${esc(e.nature)}${e.destination ? ` · ${esc(e.destination)}` : ''}</td>` +
      `<td>${esc(e.etat)}</td><td class="db-num">${e.AE ? esc(L.eur(e.AE)) : ''}</td><td class="db-num">${e.CP ? esc(L.eur(e.CP)) : ''}</td></tr>`).join('');
    return `<div class="db-mblock" data-db-masse="${esc(mass || 'autres')}">${head}<div class="db-exp-scroll"><table class="db-exp-table"><thead><tr>` +
      `${sortHead('date', 'Date', ope)}${sortHead('fournisseur', 'Fournisseur', ope)}${sortHead('libelle', 'Objet', ope)}${sortHead('ej', 'N° EJ', ope)}<th>Nature · destination</th><th>État</th>${sortHead('AE', 'AE', ope, 'db-num')}${sortHead('CP', 'CP', ope, 'db-num')}</tr></thead>` +
      `<tbody>${body}</tbody><tfoot><tr><td colspan="6">${rows.length} dépense${rows.length > 1 ? 's' : ''}</td><td class="db-num">${esc(L.eur(ae))}</td><td class="db-num">${esc(L.eur(cp))}</td></tr></tfoot></table></div></div>`;
  }
  // Les trois blocs (et « Autres » seulement quand une dépense n'est pas classée), réécrits seuls pendant la frappe d'un filtre.
  function opeBlocksHtml(ope) {
    const list = opeVisibleExpenses(ope);
    const hasOther = list.some(e => !e.masse);
    return MASSE_BLOCKS.filter(([mass]) => mass || hasOther).map(([mass, label]) => masseBlockHtml(ope, mass, label, list)).join('');
  }
  function opePanelHtml(entry, ope) {
    const f = opeFilter(ope.key);
    const tools = `<div class="db-ope-tools"><label>Du ${DateInput.markup({ cls: 'db-dp', iso: f.from, aria: `Dépenses de ${ope.codes[0] || 'l\'OPE'} à partir du`, attrs: `data-db-opedate="from:${esc(ope.key)}"` })}</label>` +
      `<label>au ${DateInput.markup({ cls: 'db-dp', iso: f.to, aria: `Dépenses de ${ope.codes[0] || 'l\'OPE'} jusqu'au`, attrs: `data-db-opedate="to:${esc(ope.key)}"` })}</label>` +
      `<input type="search" placeholder="Fournisseur, objet, n° EJ…" value="${esc(f.q)}" data-db-opeq="${esc(ope.key)}" aria-label="Rechercher dans les dépenses de cette OPE">` +
      `<button type="button" class="db-linkbtn" data-db-opeclear="${esc(ope.key)}"${opeFilterActive(f) ? '' : ' hidden'}>Effacer les filtres</button></div>`;
    const noLine = ope.withoutLine ? '<p class="db-exp-empty">Aucune ligne OPE n\'est rattachée à cette OPE : pas de dépense détaillée possible.</p>' : '';
    const undetailed = ope.undetailed ? `<p class="db-exp-note">${esc(L.eur(ope.undetailed))} consommés sur la ligne OPE sans détail de dépense (total de la ligne OPE, non ventilé par année).</p>` : '';
    return `<div class="db-opep" data-db-opepanel="${esc(ope.key)}">${noLine}${ope.withoutLine ? '' : tools}<div data-db-blocks="${esc(ope.key)}">${ope.withoutLine ? '' : opeBlocksHtml(ope)}</div>${undetailed}</div>`;
  }
  function opeRowHtml(entry, ope, many) {
    const open = state.openOpes.has(ope.key);
    const bailleur = L.bailleurClass(ope.bailleur) === 'idx' ? `<span class="db-idex" title="Bailleur de cette OPE">${esc(ope.bailleur)}</span>` : '';
    const caption = [ope.libelle, ope.withoutLine ? 'aucune ligne OPE' : ''].filter(Boolean).join(' · ');
    return `<div class="db-row db-orow${open ? ' is-open' : ''}" data-db-orow="${esc(ope.key)}">` +
      `<span class="db-name"><button type="button" class="db-ope-toggle" data-db-ope="${esc(ope.key)}" aria-expanded="${open}" aria-label="${esc(`Dépenses de l'OPE ${ope.rank} de ${entry.project.acronyme}`)}">${ICON_CHEVRON}</button>` +
      `<span class="db-opn">OPE ${ope.rank}</span><span class="db-ocode">${esc(ope.codes.join(', ') || '(sans numéro)')}</span>${bailleur}${caption ? `<span class="db-cap" title="${esc(caption)}">${esc(caption)}</span>` : ''}</span>` +
      `<span class="db-st"></span><span class="db-pr">${progressHtml(ope.cons, ope.att, ope.pct, ope.over)}</span>` +
      `<span class="db-att">${esc(L.eur(ope.att))}</span><span class="db-cons${ope.over ? ' is-over' : ''}">${esc(L.eur(ope.cons))}</span></div>` +
      (open ? opePanelHtml(entry, ope) : '');
  }
  // Un projet à une seule OPE : les trois blocs directement sous le projet ; plusieurs OPE : une ligne par OPE, dépliable.
  function projectDetailHtml(entry) {
    const gap = gapNoteHtml(entry.project.gap);
    if (entry.opes.length === 1) return `<div class="db-exp db-exp-opes">${opePanelHtml(entry, entry.opes[0])}${gap ? `<div class="db-opep">${gap}</div>` : ''}</div>`;
    return `<div class="db-exp db-exp-opes">${entry.opes.map(ope => opeRowHtml(entry, ope, true)).join('')}${gap ? `<div class="db-opep">${gap}</div>` : ''}</div>`;
  }

  const frDate = iso => String(iso || '').split('-').reverse().join('/');
  const staticPill = status => `<span class="db-stwrap" style="${pillStyle(status)}"><i class="db-dot" style="background:${L.statusColors(status).dot}"></i><span class="db-stlabel">${esc(status || '—')}</span></span>`;
  // Repères d'une ligne projet : plusieurs actions (liste par action), « initial » / « réattribution » (mode À plat), « + N réattributions » (dépliable).
  function roleBadgesHtml(entry) {
    const project = entry.project;
    let html = '';
    if (entry.multi) html += `<span class="db-tag db-multi" title="Le programme de ce projet a plusieurs actions : il est compté dans chacune (la somme des actions peut dépasser l'axe)">${entry.multi} actions</span>`;
    if (entry.kids && entry.kids.length) {
      const open = state.openKids.has(project.id), n = entry.kids.length;
      html += `<button type="button" class="db-tag db-kidsbtn${open ? ' is-open' : ''}" data-db-kids="${esc(project.id)}" aria-expanded="${open}" title="Lignes de réattribution rattachées à ce projet (montants additionnés dans ce total)">+ ${n} réattribution${n > 1 ? 's' : ''}</button>`;
    } else if (entry.role === 'initial') html += '<span class="db-tag" title="Ce projet a des réattributions, affichées sur leur propre ligne (mode « À plat »)">initial</span>';
    else if (entry.role === 'reattrib') html += `<span class="db-tag db-reat" title="Réattribution : même OPE que son projet d'origine, le consommé est compté sur le projet d'origine">réattribution</span>`;
    return html;
  }
  function kidRowsHtml(entry) {
    const kids = entry.kids || [];
    if (!kids.length || !state.openKids.has(entry.project.id)) return '';
    return kids.map((kid, index) => {
      const p = kid.project;
      const label = kids.length > 1 ? `Réattribution ${index + 1}` : 'Réattribution';
      const when = p.decisionDate ? `le ${frDate(p.decisionDate)}` : '';
      const cons = kid.cons ? esc(L.eur(kid.cons)) : '—';
      return `<div class="db-row db-prow db-kid" data-project-id="${esc(p.id)}">` +
        `<span class="db-name db-pj"><span class="db-elb" aria-hidden="true">↳</span><span class="db-who"><span class="db-acrline"><button type="button" class="db-acr" data-db-open-project="${esc(p.id)}" title="Ouvrir la fiche de cette réattribution">${esc(label)}</button>${p.decision ? `<span class="db-tag">${esc(p.decision)}</span>` : ''}</span>${when ? `<span class="db-cap">${esc(when)}</span>` : ''}</span></span>` +
        `<span class="db-st">${staticPill(p.statut)}</span><span class="db-pr"></span>` +
        `<span class="db-att">${esc(L.eur(kid.att))}</span><span class="db-cons" title="${kid.cons ? '' : 'Même ligne OPE que le projet : le consommé est compté une seule fois, sur le projet d\'origine'}">${cons}</span></div>`;
    }).join('');
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
      `<span class="db-who"><span class="db-acrline"><button type="button" class="db-acr" data-db-open-project="${esc(project.id)}" title="Ouvrir la fiche projet">${esc(project.acronyme)}</button>${roleBadgesHtml(entry)}${idexBadgeHtml(entry)}${alertChipHtml(project)}${gapBadgeHtml(project)}</span>` +
      `${project.titre ? `<span class="db-cap" title="${esc(project.titre)}">${esc(project.titre)}</span>` : ''}</span></span>` +
      `<span class="db-st"><span class="db-stwrap" style="${pillStyle(status)}"><i class="db-dot" style="background:${dot}"></i>${select}<svg class="db-stchev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg></span><span class="db-saved" data-db-saved="${esc(project.id)}" hidden>${ICON_CHECK}Enregistré</span></span>` +
      `<span class="db-pr">${progressHtml(entry.cons, entry.att, entry.pct, entry.over)}</span>` +
      `<span class="db-att">${esc(L.eur(entry.att))}</span><span class="db-cons${entry.over ? ' is-over' : ''}"${entry.role === 'reattrib' && !entry.cons ? ' title="Même ligne OPE que le projet d\'origine : le consommé est compté sur celui-ci"' : ''}>${entry.role === 'reattrib' && !entry.cons ? '—' : esc(L.eur(entry.cons))}</span></div>` +
      kidRowsHtml(entry) + (open ? projectDetailHtml(entry) : '');
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
  // Volet par axe InnovationS (ses actions dedans) ou par action (ses projets dessous) ; mêmes têtes que les volets de programme.
  function groupVolHtml(group, m, statuses, helpHtml, sub) {
    const open = state.openProgrammes.has(group.key);
    const dots = group.statusCounts.map(s => `<span class="db-dotn" title="${esc(`${s.label || 'Sans statut'} : ${s.n}`)}"><i class="db-dot" style="background:${L.statusColors(s.label).dot}"></i>${s.n}</span>`).join('');
    const note = group.noAxe ? '<span class="db-tag db-reat" title="Ces projets appartiennent à un programme sans axe : à renseigner dans la colonne Axe_InnovationS de la table Programmes">à renseigner dans Grist</span>' : '';
    let body = '';
    if (open) body = `<div class="db-vbody">${(group.subs || []).map(subGroup => groupVolHtml(subGroup, m, statuses, helpHtml, true)).join('')}${group.projects.map(entry => projectRowHtml(entry, statuses, helpHtml)).join('')}</div>`;
    return `<div class="db-vol${sub ? ' db-sub' : ''}${open ? ' is-open' : ''}" data-db-group="${esc(group.key)}">` +
      `<button type="button" class="db-row db-vhead" data-db-vol="${esc(group.key)}" aria-expanded="${open}">` +
      `<span class="db-name">${ICON_CHEVRON}<span class="db-pn">${esc(group.label)}</span><span class="db-tag">${group.count} projet${group.count > 1 ? 's' : ''}</span>${note}</span>` +
      `<span class="db-st db-dots">${dots}</span><span class="db-pr">${progressHtml(group.cons, group.att, group.pct, group.over)}</span>` +
      `<span class="db-att"><b>${esc(L.eur(group.att))}</b></span><span class="db-cons${group.over ? ' is-over' : ''}"><b>${esc(L.eur(group.cons))}</b></span></button>${body}</div>`;
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
  // Pourquoi les dépenses manquent : la raison de Grist (règle d'accès, table absente…) en clair, le détail complet à l'infobulle.
  function expensesErrorNote() {
    const ex = global.CoreAccess ? global.CoreAccess.explain(state.expensesError, { op: 'read', table: EXPENSES_TABLE, page: 'Dashboard' }) : null;
    if (!ex) return `Table ${EXPENSES_TABLE} illisible : ${esc(state.expensesError)}`;
    return `<span title="${esc(ex.text)}">Table ${EXPENSES_TABLE} illisible : ${esc(ex.headline)}. Le consommé reste à 0 tant qu'elle n'est pas lisible (détail : survol, ou Alt+Maj+D).</span>`;
  }
  function footnoteHtml(m) {
    const notes = [];
    if (state.expensesState === 'loading' || state.expensesState === 'idle') notes.push('Chargement des dépenses…');
    if (state.expensesState === 'error') notes.push(expensesErrorNote());
    if (m.outOfRange) notes.push(`${m.outOfRange.count} dépense${m.outOfRange.count > 1 ? 's' : ''} d'un exercice hors 2023-2026 (${esc(L.eur(m.outOfRange[m.measure]))} ${m.measure}) non comptée${m.outOfRange.count > 1 ? 's' : ''}.`);
    if (m.bailleur.hidden && !m.bailleur.idex) notes.push(`${m.bailleur.hidden} projet${m.bailleur.hidden > 1 ? 's' : ''} dont toutes les OPE sont Idex ${m.bailleur.hidden > 1 ? 'ne sont pas comptés' : 'n\'est pas compté'} (puce « Idex » du bandeau pour ${m.bailleur.hidden > 1 ? 'les' : 'le'} voir).`);
    const gaps = m.gapCount;
    if (gaps && (gaps.gap || gaps.nodetail)) {
      const parts = [];
      if (gaps.gap) parts.push(`${gaps.gap} projet${gaps.gap > 1 ? 's' : ''} avec un écart entre la ligne OPE et le détail des dépenses`);
      if (gaps.nodetail) parts.push(`${gaps.nodetail} sans détail de dépense`);
      notes.push(`${parts.join(', ')}.`);
    }
    return notes.length ? `<p class="db-foot">${notes.join(' ')}</p>` : '';
  }

  // Ligne « Total » en tête de liste : les totaux restent visibles quand les graphiques sont repliés (c'est l'état par défaut).
  function totalHtml(m) {
    const k = m.kpi;
    return `<div class="db-row db-totalrow" title="${esc(`Reste à consommer : ${L.eur(k.reste)}`)}"><span class="db-name"><span class="db-pn">Total</span><span class="db-tag">${m.count} projet${m.count > 1 ? 's' : ''}</span></span>` +
      `<span class="db-st"></span><span class="db-pr">${progressHtml(k.cons, k.att, k.pct, k.over)}</span>` +
      `<span class="db-att"><b id="db-total-att">${esc(L.eur(k.att))}</b></span><span class="db-cons${k.over ? ' is-over' : ''}"><b id="db-total-cons">${esc(L.eur(k.cons))}</b></span></div>`;
  }
  function listHtml(m) {
    const help = global.HelpTooltip ? HelpTooltip.markup('Projets', 'Statut_operationnel_projet') : '';
    const seg = (label, attr, value, current, buttons) => `<span class="db-seg" role="group" aria-label="${esc(label)}">${buttons.map(([id, text, tip]) => `<button type="button" class="${current === id ? 'is-on' : ''}" ${attr}="${id}" aria-pressed="${current === id}" title="${esc(tip)}">${esc(text)}</button>`).join('')}</span>`;
    const groupSeg = m.axeAvailable ? seg('Regrouper par', 'data-db-groupby', '', m.groupBy, [['axe', 'Axe › Action › Projet', 'Un volet par axe InnovationS, puis par action (Programmes.Axe_InnovationS et Actions_InnovationS)'], ['programme', 'Programme › Projet', 'Un volet par programme']]) : '';
    const reatSeg = m.reattrib.available ? seg('Réattributions', 'data-db-reattrib', '', m.reattrib.group ? 'group' : 'flat', [['group', 'Réattributions sous leur projet', 'Une réattribution passe sous son projet, le total du projet est le projet initial plus ses réattributions'], ['flat', 'À plat', 'Une ligne par ligne de Projets, comme dans la table']]) : '';
    const first = groupSeg || reatSeg ? `<span class="db-lhs">${groupSeg}${reatSeg}</span>` : `<span class="db-lhs">${m.groupBy === 'axe' ? 'Axe · projet' : 'Programme · projet'}</span>`;
    const head = `<div class="db-row db-colhead">${first}<span aria-hidden="true">Statut du projet${help}</span><span aria-hidden="true">Consommation</span><span class="db-r" aria-hidden="true">Attribué</span><span class="db-r" aria-hidden="true">Consommé</span></div>`;
    const total = totalHtml(m);
    if (!m.groups.length && !m.orphans) return `${head}<div class="db-card db-empty"><span>Aucun projet ne correspond à ces filtres.</span><button type="button" class="btn btn-secondary" data-db-reset>Réinitialiser les filtres</button></div>${footnoteHtml(m)}`;
    const volets = m.groupBy === 'axe' ? m.axeGroups.map(group => groupVolHtml(group, m, m.options.statuses, help, false)) : m.groups.map(group => volHtml(group, m, m.options.statuses, help));
    return head + total + volets.join('') + orphansHtml(m) + footnoteHtml(m);
  }

  // Bandeau : années, listes à cases, mesure, bouton des graphiques.
  function renderBand(m) {
    const years = $('db-years');
    if (years) years.innerHTML = m.years.map(year => `<button type="button" class="db-year${m.selYears.includes(year) ? ' is-on' : ''}" data-db-year="${year}" aria-pressed="${m.selYears.includes(year)}">${esc(L.yearLabel(year))}</button>`).join('');
    const bailleurs = $('db-bailleurs');
    if (bailleurs) {
      const b = m.bailleur;
      const idexTip = `${b.idexProjects} projet${b.idexProjects > 1 ? 's ont' : ' a'} au moins une OPE Idex (ou d'un autre bailleur que InnovationS).${b.hidden && !b.idex ? ` ${b.hidden} projet${b.hidden > 1 ? 's' : ''} masqué${b.hidden > 1 ? 's' : ''} car ${b.hidden > 1 ? 'toutes leurs OPE sont' : 'toutes ses OPE sont'} Idex.` : ''} Idex n'est pas compté par défaut.`;
      bailleurs.hidden = !b.idexProjects && !b.idex;
      bailleurs.innerHTML = `<button type="button" class="db-year${b.innovations ? ' is-on' : ''}" data-db-bailleur="inn" aria-pressed="${b.innovations}" title="Compter les OPE dont le bailleur est InnovationS (valeur par défaut)">InnovationS</button>` +
        `<button type="button" class="db-year is-idex${b.idex ? ' is-on' : ''}" data-db-bailleur="idx" aria-pressed="${b.idex}" title="${esc(idexTip)}">Idex</button>`;
    }
    document.querySelectorAll('[data-db-measure]').forEach(btn => { const on = btn.dataset.dbMeasure === m.measure; btn.classList.toggle('is-on', on); btn.setAttribute('aria-pressed', String(on)); });
    const toggle = $('db-toggle-charts');
    if (toggle) { toggle.setAttribute('aria-expanded', String(state.charts)); toggle.classList.toggle('is-collapsed', !state.charts); }
    syncCombo('db-filter-programme');
    syncCombo('db-filter-statut');
    const search = $('db-filter-search');
    if (search && search !== document.activeElement && search.value !== state.search) search.value = state.search;
    const reset = $('db-clear-filters'); // l'icône n'apparaît que lorsqu'un filtre est actif (place verticale économisée)
    if (reset) reset.hidden = !(Array.isArray(state.years) || state.programmes.length || state.statuts.length || text(state.search));
  }
  // Les deux listes à cases du bandeau (js/components/filter-combo.js : recherche dans la liste, clavier, résumé au survol).
  function comboValues(id) { return id === 'db-filter-programme' ? (model ? model.options.programmes : []) : (model ? model.options.statuses : []); }
  const combos = {};
  function syncCombo(id) { if (combos[id]) combos[id].sync(); }
  function setupCombo(id) {
    const isProg = id === 'db-filter-programme', key = isProg ? 'programmes' : 'statuts';
    combos[id] = FilterCombo.attach({
      id, placeholder: isProg ? 'Tous les programmes' : 'Tous les statuts', summaryLabel: isProg ? 'programmes sélectionnés' : 'statuts sélectionnés',
      options: () => comboValues(id),
      getSelected: () => state[key],
      setSelected: next => {
        state[key] = next;
        if (state.programmes.length === 1) state.openProgrammes.add(state.programmes[0]); // un seul programme ciblé : son volet s'ouvre
        render(); persist();
      }
    });
  }

  // --- Graphiques : Grist-BI (par défaut) ou graphiques faits main ---------------------------------------------
  // Grist-BI vit dans une iframe qui doit survivre aux rendus de la page : la zone n'est jamais réécrite tant qu'il est monté ; un changement
  // de filtre recalcule sa table (DashboardBi.update). Replié : l'iframe est retirée. Sans réponse dans le délai (imbrication non vérifiée dans un
  // vrai Grist), la page revient aux graphiques faits main et le dit. La configuration des tuiles est enregistrée dans les options du widget.
  let bi = null;          // {host, ctl, rows} : Grist-BI monté (ctl absent tant que le document virtuel se prépare)
  let biFailure = null;   // texte affiché quand Grist-BI n'a pas répondu
  const biReady = () => !!(global.DashboardBi && global.VirtualDoc && global.GristBridge && gristApi());
  const gristApi = () => (global.CoreGrist && CoreGrist.gristInstance) || global.grist || null;
  function dropBi() {
    if (!bi) return;
    const entry = bi; bi = null;
    if (entry.ctl) entry.ctl.destroy();
    if (entry.host && entry.host.parentNode) entry.host.remove();
  }
  function onBiStatus(entry, status) {
    if (bi !== entry) return;
    if (status.phase === 'failed' || status.phase === 'rejected') {
      biFailure = status.phase === 'rejected'
        ? `Grist-BI répond depuis une autre adresse que celle attendue (${status.origin}).`
        : 'Grist-BI n\'a pas répondu.';
      setTimeout(render, 0); // hors du rappel : le rendu retire l'iframe
    }
  }
  function mountBi(zone, rows, mode) {
    dropBi();
    zone.innerHTML = '<div class="db-bi"><button type="button" class="db-bi-reset" title="Rétablir les quatre graphiques d\'origine de Grist-BI (annule vos changements dans Grist-BI)">Rétablir les 4 graphiques</button></div>';
    const entry = { host: zone.firstChild, ctl: null, rows, mode };
    entry.host.querySelector('.db-bi-reset').addEventListener('click', () => { if (entry.ctl) entry.ctl.resetPreset(); });
    bi = entry;
    global.DashboardBi.mount(entry.host, { grist: gristApi(), rows, mode, onStatus: status => onBiStatus(entry, status) })
      .then(ctl => {
        if (bi !== entry) { if (ctl) ctl.destroy(); return; }
        entry.ctl = ctl;
        if (ctl) ctl.update(entry.rows, entry.mode); // les filtres ont pu changer pendant la préparation
      })
      .catch(err => {
        console.warn('Grist-BI : montage impossible', err && err.message);
        if (bi === entry) { biFailure = 'Grist-BI n\'a pas pu démarrer.'; setTimeout(render, 0); }
      });
  }
  function renderCharts(m) {
    const zone = $('db-charts');
    if (!zone) return;
    zone.hidden = !state.charts;
    const wantBi = state.charts && state.engine === 'bi' && biReady() && !biFailure;
    const engine = $('db-engine');
    if (engine) {
      engine.hidden = !state.charts || !biReady();
      engine.querySelectorAll('[data-db-engine]').forEach(btn => { const on = btn.dataset.dbEngine === state.engine; btn.classList.toggle('is-on', on); btn.setAttribute('aria-pressed', String(on)); });
    }
    if (!state.charts) { dropBi(); zone.innerHTML = ''; return; } // repliés : rien n'est dessiné
    if (wantBi) {
      const rows = L.biRows(m);
      if (bi && zone.contains(bi.host)) { bi.rows = rows; bi.mode = m.groupBy; if (bi.ctl) bi.ctl.update(rows, m.groupBy); } else mountBi(zone, rows, m.groupBy);
      return;
    }
    dropBi();
    const note = state.engine === 'bi' && biFailure ? `<p class="db-bi-note" role="status">${esc(biFailure)} Graphiques simples affichés. <button type="button" class="db-linkbtn" data-db-bi-retry>Réessayer Grist-BI</button></p>` : '';
    zone.innerHTML = note + chartsHtml(m);
  }
  function setEngine(engine) {
    if (engine !== 'bi' && engine !== 'maison') return;
    if (engine === state.engine && !biFailure) return;
    state.engine = engine;
    biFailure = null;
    render(); persist();
  }

  function render() {
    const view = $('view-dashboard');
    if (!view) return;
    model = L.compute(getDataset(), state, statusChoices());
    renderBand(model);
    renderCharts(model);
    alerts = global.AlertsLogic ? global.AlertsLogic.compute(getDataset(), { today: new Date(), horizon: state.alertsHorizon, bailleur: { innovations: state.innovations !== false, idex: !!state.idex } }) : null;
    const list = $('db-list');
    if (list) list.innerHTML = listHtml(model);
    renderAlerts();
    if (isVisible() && state.expensesState === 'idle') loadExpenses(false);
  }


  // --- Alertes de dépense (tiroir à droite, maquette v3 validée le 26/11/2026) --------------------------------------
  // Trois onglets : À compléter (OPE non renseignée), Échéances (date limite proche et rythme d'engagement trop faible), Clôtures (reliquats et
  // supposés clos). Calcul : AlertsLogic.compute (mêmes bailleurs comptés que la liste). Aucun envoi, aucune écriture : on ouvre la fiche du projet.
  const RISK_LABELS = { late: 'Échue', high: 'Risque élevé', mid: 'Risque moyen', ok: 'Dans le rythme' };
  const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
  const pctOf = ratio => `${Math.round(ratio * 100)} %`;
  const barW = ratio => `${Math.max(0, Math.min(100, ratio * 100))}%`;
  function alertChipHtml(project) {
    const chip = alerts && global.AlertsLogic ? global.AlertsLogic.chipFor(alerts, project.id) : null;
    if (!chip) return '';
    const title = chip.tab === 'ope' ? 'OPE à renseigner : ouvrir les alertes' : (chip.kind === 'late' ? 'Date limite de financement dépassée : ouvrir les alertes' : `Date limite de financement dans ${chip.label} : ouvrir les alertes`);
    return `<button type="button" class="db-chip is-${esc(chip.kind)}" data-db-alert-tab="${esc(chip.tab)}" title="${esc(title)}">${esc(chip.label)}</button>`;
  }
  function porteurOf(project) {
    const ids = L.refIds(project.row.Porteur_1);
    const person = ids.length ? table('Annuaire').find(row => row.id === ids[0]) : null;
    return person ? text(person.nom_et_Prenom) : '';
  }
  const cardHead = (item, badge) => `<div class="db-acr-row"><span class="db-acp">${esc(item.project.programme)}</span><span class="db-acn"><button type="button" class="db-acr" data-db-open-project="${esc(item.project.id)}" title="Ouvrir la fiche projet">${esc(item.project.acronyme)}</button>${porteurOf(item.project) ? `<span class="db-acs"> · ${esc(porteurOf(item.project))}</span>` : ''}</span>${badge}</div>`;
  function opeSubText(item) {
    const issue = item.issues[0];
    if (issue.kind === 'none') return `Action prévue : ${item.action || 'à définir'} · sans ligne, aucune dépense ne peut être rattachée`;
    if (issue.kind === 'nonum') return 'Une ligne OPE est rattachée mais sans numéro : le consommé ne peut pas la retrouver';
    if (issue.kind === 'rank') return `${L.eur(issue.amount)} saisis sur l'OPE ${issue.rank} (Budget et OPE) sans ligne OPE reliée`;
    return `${issue.code} ne figure dans aucun envoi validé : faute de frappe ?`;
  }
  function alertsOpeTab(a) {
    const cards = a.ope.items.map(item => `<div class="db-acard">${cardHead(item, `<span class="db-rk is-ope">${esc(item.reasonLabel)}</span>`)}` +
      `<div class="db-acr-row"><div class="db-astack"><span class="db-al1">${esc(L.eur(item.amount))} ${item.issues[0].kind === 'rank' ? 'non suivis' : 'attribués'} · ${esc(item.project.statut || 'sans statut')}</span><span class="db-asub">${esc(opeSubText(item))}</span></div>` +
      `<button type="button" class="db-abtn is-main" data-db-alert-fix="${esc(item.project.id)}">Compléter la fiche</button></div></div>`).join('');
    return `<div class="db-asum is-ope"><div><div class="db-asl">Attribué sans suivi du consommé</div><div class="db-asv">${esc(L.eur(a.ope.amount))}</div></div><div class="db-asr"><span>Projets à compléter</span><b>${a.ope.items.length}</b></div></div>` +
      `<p class="db-aleg">Sans ligne OPE reliée à l'export, ni le consommé ni les alertes d'échéance ne se calculent. Projets en cours, en retard ou en attente des fonds ; l'alerte disparaît dès que la fiche est complétée.</p>` +
      (cards || '<div class="db-aempty">Toutes les OPE sont renseignées.</div>');
  }
  function alertsEchTab(a) {
    const items = a.ech.items, shown = state.alertsMore ? items : items.slice(0, 6);
    const horizons = a.horizons.map(h => `<button type="button" class="db-hzb${h === a.horizon ? ' is-on' : ''}" data-db-alert-horizon="${h}" aria-pressed="${h === a.horizon}">${h} mois</button>`).join('');
    const cards = shown.map(item => {
      const m = item.metrics, late = item.risk === 'late';
      const line1 = late ? `Échéance dépassée depuis ${plural(-m.days, 'jour')}` : `Échéance le ${frDate(m.deadline)} · dans ${plural(m.days, 'jour')}`;
      const sub = m.last30 !== null && m.last30 > 0 ? `Engagé ces 30 jours : ${L.eur(m.last30)}` : (m.sinceLast !== null ? `Aucun engagement depuis ${plural(m.sinceLast, 'jour')}` : 'Détail des dépenses non importé : engagé d\'après l\'export UB Invest');
      return `<div class="db-acard">${cardHead(item, `<span class="db-rk is-${item.risk}">${RISK_LABELS[item.risk]}</span>`)}` +
        `<div class="db-apb"><div class="db-ab"><i class="is-${item.risk}" style="width:${barW(m.aePct)}"></i><i class="db-tick" style="left:${barW(m.elapsed === null ? 0 : m.elapsed)}"></i></div><span class="db-an">${pctOf(m.aePct)}</span><span class="db-apj">${late ? 'échéance passée' : `temps écoulé : ${pctOf(m.elapsed || 0)}`}</span><span class="db-ak">${esc(L.compact(m.reste))}</span></div>` +
        `<div class="db-acr-row"><div class="db-astack"><span class="db-al1">${esc(line1)}</span><span class="db-asub">${esc(sub)}</span></div></div></div>`;
    }).join('');
    const more = items.length > 6 ? `<button type="button" class="db-linkbtn" data-db-alert-more>${state.alertsMore ? 'Voir moins' : `Voir les ${items.length - 6} autres`}</button>` : '';
    return `<div class="db-asum"><div><div class="db-asl">Reste à engager</div><div class="db-asv">${esc(L.eur(a.ech.reste))}</div></div><div class="db-asr"><span>Projets en alerte</span><b>${items.length}</b></div>` +
      `<div class="db-asr"><b>${a.ech.nextDays === null ? '—' : plural(a.ech.nextDays, 'jour')}</b><span>avant la 1re échéance</span></div></div>` +
      `<div class="db-hz" role="group" aria-label="Échéance dans"><span class="db-hzl">Échéance dans</span>${horizons}<span class="db-hzn">les échues restent affichées</span></div>` +
      `<p class="db-aleg">Rythme = part engagée (AE) de l'attribué comparée à la part du temps écoulé depuis le début du financement (repère noir). Risque élevé à ${Math.round(global.AlertsLogic.LAG_HIGH * 100)} points de retard ou plus, moyen à ${Math.round(global.AlertsLogic.LAG_MID * 100)} points ou plus (seuils à valider).</p>` +
      (cards || '<div class="db-aempty">Aucun financement à surveiller sur cet horizon.</div>') + more +
      (a.ech.noDate ? `<p class="db-aleg">${plural(a.ech.noDate, 'projet')} en cours sans date limite de financement : non suivi${a.ech.noDate > 1 ? 's' : ''}.</p>` : '');
  }
  function alertsCloTab(a) {
    const card = (item, rk, conf) => {
      const m = item.metrics, ratio = m.total > 0 ? m.cp / m.total : 0;
      const sub = conf && m.days !== null && m.days < 0 ? `Échéance dépassée depuis ${plural(-m.days, 'jour')} · sans information` : (m.deadline ? `Échéance ${frDate(m.deadline)}${conf ? '' : ' · clos'}` : (conf ? 'Sans information' : 'Clos'));
      return `<div class="db-acard">${cardHead(item, rk)}<div class="db-apb"><div class="db-ab"><i class="${conf ? 'is-mid' : 'is-blue'}" style="width:${barW(ratio)}"></i></div><span class="db-an">${pctOf(ratio)}</span><span class="db-apj">consommé (CP)</span><span class="db-ak">${esc(L.compact(item.reliquat))}</span></div>` +
        `<div class="db-acr-row"><span class="db-astack"><span class="db-asub">${esc(sub)}</span></span></div></div>`;
    };
    const rel = a.clo.rel.map(item => card(item, '<span class="db-rk is-rel">Reliquat à traiter</span>', false)).join('');
    const conf = a.clo.conf.map(item => card(item, '<span class="db-rk is-mid">Sans information</span>', true)).join('');
    return `<div class="db-asum is-rel"><div><div class="db-asl">Reliquats à traiter</div><div class="db-asv">${esc(L.eur(a.clo.reliquat))}</div></div><div class="db-asr"><span>Projets clos</span><b>${a.clo.rel.length}</b></div></div>` +
      `<p class="db-aleg">Projets au statut « cloturé avec Reliquat à traiter » : attribué − consommé (CP).</p>` + (rel || '<div class="db-aempty">Plus aucun reliquat à traiter.</div>') +
      (conf ? `<h3 class="db-agt">À CONFIRMER · SUPPOSÉS CLOS</h3>${conf}` : '');
  }
  function renderAlerts() {
    const view = $('view-dashboard');
    if (!view || !alerts) return;
    const total = alerts.counts.total;
    const btn = $('db-alerts-btn');
    if (btn) {
      btn.hidden = false;
      btn.setAttribute('aria-expanded', String(state.alertsOpen));
      btn.classList.toggle('is-on', state.alertsOpen);
      const badge = btn.querySelector('.db-alerts-n');
      if (badge) { badge.textContent = String(total); badge.hidden = !total; }
    }
    let drawer = $('db-alerts'), scrim = $('db-alerts-scrim');
    if (!drawer) {
      view.insertAdjacentHTML('beforeend', '<div id="db-alerts-scrim" class="db-scrim" data-db-alert-close hidden></div><aside id="db-alerts" class="db-drawer" role="dialog" aria-modal="true" aria-label="Alertes de dépense" hidden></aside>');
      drawer = $('db-alerts'); scrim = $('db-alerts-scrim');
    }
    drawer.hidden = scrim.hidden = !state.alertsOpen;
    if (!state.alertsOpen) return;
    const tab = ['ope', 'ech', 'clo'].includes(state.alertsTab) ? state.alertsTab : (alerts.counts.ech || !alerts.counts.ope ? 'ech' : 'ope');
    const tabs = [['ope', 'À compléter', alerts.counts.ope], ['ech', 'Échéances', alerts.counts.ech], ['clo', 'Clôtures', alerts.counts.clo]]
      .map(([key, label, n]) => `<button type="button" class="db-ptab${tab === key ? ' is-on' : ''}" role="tab" aria-selected="${tab === key}" data-db-alert-tab="${key}">${label}<span class="db-ptn">${n}</span></button>`).join('');
    const body = tab === 'ope' ? alertsOpeTab(alerts) : (tab === 'ech' ? alertsEchTab(alerts) : alertsCloTab(alerts));
    const scroll = drawer.querySelector('.db-drb') ? drawer.querySelector('.db-drb').scrollTop : 0;
    drawer.innerHTML = `<div class="db-drh"><div><h2><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 22V4"></path><path d="M4 4h13l-2 4 2 4H4"></path></svg>Alertes de dépense</h2>` +
      `<p>OPE à renseigner, engagements trop lents avant la date limite, puis clôtures</p></div><button type="button" class="db-dx" data-db-alert-close aria-label="Fermer le panneau">&times;</button></div>` +
      `<div class="db-ptabs" role="tablist">${tabs}</div><div class="db-drb">${body}</div>`;
    const bodyEl = drawer.querySelector('.db-drb');
    if (bodyEl) bodyEl.scrollTop = scroll;
  }
  function setAlertsOpen(open) {
    state.alertsOpen = !!open;
    if (open) state.alertsMore = false;
    renderAlerts();
    if (open) { const close = document.querySelector('#db-alerts .db-dx'); if (close) close.focus(); }
    else { const btn = $('db-alerts-btn'); if (btn) btn.focus(); }
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
      CoreUtils.toastFailure(err, 'Échec de l\'enregistrement du statut', { what: `changement du statut du projet ${row.Acronyme || row.Projet || id}`, columns: ['Statut_operationnel_projet'] });
      datasetCache = null; render();
    }
  }
  // Statut_Macro (formule) et les autres pages dépendent du statut : relecture groupée, une seule pour une série de changements.
  function scheduleStatusRefresh() {
    clearTimeout(statusRefresh);
    statusRefresh = setTimeout(() => { if (global.SuiviApp && SuiviApp.refreshAfterProjectSaved) SuiviApp.refreshAfterProjectSaved(); }, 2500);
  }

  function onClick(event) {
    const target = event.target.closest ? event.target.closest('[data-db-year],[data-db-measure],[data-db-bar],[data-db-crumb],[data-db-vol],[data-db-exp],[data-db-open-project],[data-db-orphans],[data-db-reset],[data-db-bi-retry],[data-db-engine],[data-db-bailleur],[data-db-ope],[data-db-opesort],[data-db-opeclear],[data-db-groupby],[data-db-reattrib],[data-db-kids],#db-alerts-btn,[data-db-alert-close],[data-db-alert-tab],[data-db-alert-horizon],[data-db-alert-more],[data-db-alert-fix]') : null;
    if (!target) return;
    if (target.id === 'db-alerts-btn') {
      setAlertsOpen(!state.alertsOpen);
    } else if (target.dataset.dbAlertClose !== undefined) {
      setAlertsOpen(false);
    } else if (target.dataset.dbAlertTab !== undefined) {
      state.alertsTab = target.dataset.dbAlertTab; state.alertsMore = false;
      if (!state.alertsOpen) setAlertsOpen(true); else renderAlerts();
    } else if (target.dataset.dbAlertHorizon !== undefined) {
      state.alertsHorizon = Number(target.dataset.dbAlertHorizon); state.alertsMore = false; render(); persist();
    } else if (target.dataset.dbAlertMore !== undefined) {
      state.alertsMore = !state.alertsMore; renderAlerts();
    } else if (target.dataset.dbAlertFix !== undefined) {
      const row = projectRow(target.dataset.dbAlertFix);
      setAlertsOpen(false);
      if (row && global.ProjectModal && ProjectModal.open) ProjectModal.open(row, { tab: 'budget' });
    } else if (target.dataset.dbYear !== undefined) {
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
      if (state.alertsOpen) setAlertsOpen(false);
      if (row && global.ProjectModal && ProjectModal.open) ProjectModal.open(row);
      else if (global.openProject) global.openProject(target.dataset.dbOpenProject);
    } else if (target.dataset.dbOrphans !== undefined) {
      state.orphansOpen = !state.orphansOpen; render();
    } else if (target.dataset.dbEngine !== undefined) {
      setEngine(target.dataset.dbEngine);
    } else if (target.dataset.dbBiRetry !== undefined) {
      biFailure = null; render();
    } else if (target.dataset.dbReset !== undefined) {
      resetFilters();
    } else if (target.dataset.dbGroupby !== undefined) {
      state.groupBy = target.dataset.dbGroupby === 'programme' ? 'programme' : 'axe'; render(); persist();
    } else if (target.dataset.dbReattrib !== undefined) {
      state.reattrib = target.dataset.dbReattrib === 'flat' ? 'flat' : 'group'; render(); persist();
    } else if (target.dataset.dbKids !== undefined) {
      toggleSet(state.openKids, Number(target.dataset.dbKids)); render();
    } else if (target.dataset.dbBailleur !== undefined) {
      toggleBailleur(target.dataset.dbBailleur);
    } else if (target.dataset.dbOpe !== undefined) {
      toggleSet(state.openOpes, target.dataset.dbOpe); render();
    } else if (target.dataset.dbOpesort !== undefined) {
      const cut = target.dataset.dbOpesort.lastIndexOf(':'), key = target.dataset.dbOpesort.slice(0, cut), column = target.dataset.dbOpesort.slice(cut + 1); // la clé d'OPE contient déjà un « : »
      const f = Object.assign({}, opeFilter(key));
      f.dir = f.sort === column ? (f.dir === 'asc' ? 'desc' : 'asc') : (column === 'date' || column === 'AE' || column === 'CP' ? 'desc' : 'asc');
      setOpeFilter(key, { sort: column, dir: f.dir }, true);
    } else if (target.dataset.dbOpeclear !== undefined) {
      setOpeFilter(target.dataset.dbOpeclear, { from: '', to: '', q: '' }, false);
    }
  }
  // Puces du bandeau : on ne peut jamais décocher la dernière (les deux décochées = InnovationS).
  function toggleBailleur(which) {
    const inn = state.innovations !== false, idx = !!state.idex;
    if (which === 'inn') { if (inn && !idx) return; state.innovations = !inn; }
    else { if (idx && !inn) return; state.idex = !idx; }
    render(); persist();
  }
  // Filtres d'une OPE : réécrit seulement les blocs (le champ reste actif pendant la frappe).
  function setOpeFilter(key, patch, blocksOnly) {
    state.opeFilters.set(key, Object.assign({}, opeFilter(key), patch));
    if (!blocksOnly) { render(); return; }
    const panel = document.querySelector(`[data-db-opepanel="${CSS.escape(key)}"]`);
    const clear = panel && panel.querySelector('[data-db-opeclear]');
    if (clear) clear.hidden = !opeFilterActive(opeFilter(key));
    const owner = (model && model.groups.flatMap(g => g.projects).flatMap(e => e.opes).find(o => o.key === key)) || null;
    const host = document.querySelector(`[data-db-blocks="${CSS.escape(key)}"]`);
    if (owner && host) host.innerHTML = opeBlocksHtml(owner); else render();
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
    state.charts = text(row.Dash_graphiques) === '1'; // replié par défaut : seul « 1 » (ouvert) est retenu
    state.engine = text(row.Dash_moteur) === 'maison' ? 'maison' : 'bi'; // Grist-BI par défaut ; seul « maison » est retenu
    const bailleurs = text(row.Dash_bailleurs); // vide = InnovationS seul ; « idex » = Idex seul ; « les-deux » = les deux
    state.innovations = bailleurs !== 'idex'; state.idex = bailleurs === 'idex' || bailleurs === 'les-deux';
    state.groupBy = text(row.Dash_regroupement) === 'programme' ? 'programme' : 'axe'; // axe › action › projet par défaut
    state.reattrib = text(row.Dash_reattributions) === 'flat' ? 'flat' : 'group';  // réattributions sous leur projet par défaut
    state.alertsHorizon = [3, 12].includes(Number(text(row.Dash_horizon))) ? Number(text(row.Dash_horizon)) : 6; // échéances : 6 mois par défaut
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
      Dash_recherche: state.search, Dash_mesure: state.measure, Dash_graphiques: state.charts ? '1' : '', Dash_moteur: state.engine === 'maison' ? 'maison' : '',
      Dash_bailleurs: state.idex ? (state.innovations !== false ? 'les-deux' : 'idex') : '',
      Dash_regroupement: state.groupBy === 'programme' ? 'programme' : '', Dash_reattributions: state.reattrib === 'flat' ? 'flat' : '',
      Dash_horizon: state.alertsHorizon === 6 ? '' : String(state.alertsHorizon)
    };
    try { await CoreGrist.gristInstance.docApi.applyUserActions([['UpdateRecord', PREFS_TABLE, prefsRowId, fields]]); }
    catch (err) { console.warn('Enregistrement des préférences Dashboard a échoué :', err.message); }
  }
  const saveSoon = CoreUtils.debounce(() => savePreferences(), 600);
  const persist = () => saveSoon();
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveSoon.flush(); });

  // --- Accès Grist (diagnostic Alt+Maj+D, onglet Accès) -----------------------------------------------
  // Les totaux se calculent sur ce que Grist montre à ce compte : une ligne OPE ou un programme caché par une règle d'accès par ligne ne produit
  // aucune erreur, le consommé est simplement plus bas et le projet passe « Sans programme ». Contrôle à la demande (aucun appel Grist).
  function accessCheck() {
    const A = global.CoreAccess;
    const readable = name => { const s = A.readState(name); return !!s && s.ok; };
    const refs = value => (Array.isArray(value) ? value : [value]).filter(v => typeof v === 'number' && v > 0);
    const many = (n, one, other) => `${n} ${n > 1 ? other : one}`;
    const out = [];
    const projets = table('Projets');
    if (!projets.length) return out;
    if (readable('Lignes_OPE')) {
      const known = new Set(table('Lignes_OPE').map(row => row.id));
      const hidden = new Set(); let projects = 0;
      projets.forEach(row => {
        const ids = global.CoreOpes ? CoreOpes.ligneIds(row) : refs(row.Ligne_OPE);
        const gone = ids.filter(id => !known.has(id));
        if (gone.length) { projects += 1; gone.forEach(id => hidden.add(id)); }
      });
      if (hidden.size) out.push({
        table: 'Lignes_OPE',
        headline: `Dashboard : ${many(projects, 'projet est rattaché', 'projets sont rattachés')} à ${many(hidden.size, 'ligne OPE que votre compte ne peut pas lire', 'lignes OPE que votre compte ne peut pas lire')}`,
        effect: ['Le consommé de ces lignes n\'est pas compté : les totaux « consommé » sont sous-estimés.', 'Leurs dépenses détaillées (Depenses_OPE) apparaissent comme dépenses sans projet.'],
        detail: `Lignes_OPE est lue (${table('Lignes_OPE').length} lignes) mais ne contient pas les lignes n° ${Array.from(hidden).sort((a, b) => a - b).slice(0, 12).join(', ')}${hidden.size > 12 ? '…' : ''} que les projets référencent : règle d'accès par ligne sur Lignes_OPE (dans Grist : Règles d'accès → Lignes_OPE), ou lignes supprimées. Comparez avec « Voir en tant que ».`
      });
    }
    if (readable('Programmes')) {
      const known = new Set(table('Programmes').map(row => row.id));
      const lost = projets.filter(row => refs(row.Programme).some(id => !known.has(id)));
      if (lost.length) out.push({
        table: 'Programmes',
        headline: `Dashboard : ${many(lost.length, 'projet est classé', 'projets sont classés')} « Sans programme » alors qu'un programme leur est rattaché`,
        effect: ['Ces projets sont regroupés sous « Sans programme » et échappent au filtre du programme concerné.'],
        detail: 'Le programme existe dans Grist mais Programmes ne le montre pas à votre compte (règle d\'accès par ligne sur Programmes), ou il a été supprimé.'
      });
    }
    return out;
  }

  // --- Démarrage ----------------------------------------------------------------------------------------
  function init() {
    if (global.CoreAccess && typeof global.CoreAccess.addCheck === 'function') global.CoreAccess.addCheck('Dashboard', accessCheck);
    const view = $('view-dashboard');
    if (!view) return;
    view.addEventListener('click', onClick);
    view.addEventListener('keydown', event => { if (event.key === 'Escape' && state.alertsOpen) { event.stopPropagation(); setAlertsOpen(false); } });
    view.addEventListener('change', event => { const select = event.target.closest && event.target.closest('[data-db-status]'); if (select) changeStatus(select); });
    // Dates et recherche des dépenses d'une OPE (DateInput : « input » à la frappe, ISO ou null tant que la saisie est incomplète).
    const onOpeField = event => {
      const t = event.target;
      if (t && t.dataset && t.dataset.dbOpeq !== undefined) setOpeFilter(t.dataset.dbOpeq, { q: t.value }, true);
      else if (t && t.dataset && t.dataset.dbOpedate !== undefined) {
        const [side, key] = t.dataset.dbOpedate.split(/:(.*)/s);
        const iso = DateInput.iso(t);
        if (iso !== null) setOpeFilter(key, { [side]: iso }, true);
      }
    };
    view.addEventListener('input', onOpeField);
    view.addEventListener('change', onOpeField);
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
