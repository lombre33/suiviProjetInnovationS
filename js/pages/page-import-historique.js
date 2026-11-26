/**
 * Page « Import de l'historique financier » (outil one-shot, 18/11/2026). Tableau de contrôle validé par Antoine sur la maquette v6 :
 * une ligne par projet de l'export, une colonne par champ, des cellules colorées (vert = ajouté, bleu = modifié, orange = écart où Grist
 * garde sa valeur, rouge = anomalie), un clic sur une valeur pour la changer.
 *
 * Page cachée : pas dans la barre de navigation, on l'ouvre avec Alt+Maj+I (ou ImportHistoriquePage.open()). Les règles sont dans
 * import-historique-logic.js ; cette page lit, affiche, collecte les corrections et écrit.
 *
 * Parcours : lecture du journal Import_Financements (fichier Excel chargé par la page, ou envoi par formulaire) -> rapprochement de chaque
 * projet de l'export avec un projet de Grist -> tableau (rien n'est écrit : chaque cellule montre ce qui sera ajouté ou modifié, et
 * l'écriture reste bloquée tant qu'il y a une anomalie) -> écriture (création des projets et lignes OPE manquants, rattachement) avec un
 * journal Import_Journal qui rend chaque lot annulable.
 *
 * Écrit dans Grist : Lignes_OPE, Projets (seulement ce que décrit import-historique-logic.js) et Import_Journal. Aucun montant.
 * Les filtres ne sont pas retenus par utilisateur : l'outil sert une fois, puis se supprime.
 */
(function (global) {
  'use strict';

  const L = global.ImportHistoriqueLogic;
  const K = global.ImportLotsLogic;
  const F = global.ImportForm;
  const D = global.ImportDetailLogic;
  const esc = value => CoreUtils.escapeHtml(value);
  const $ = id => document.getElementById(id);
  const FILTERS = [['all', 'Tous'], ['add', 'Ajouts'], ['mod', 'Modifications'], ['same', 'Inchangés'], ['todo', 'À régler'], ['skip', 'Écartés']];
  const ROW_LABEL = { add: 'Ajout', mod: 'Modification', same: 'Inchangé', tbd: 'À confirmer', skip: 'Écarté' };
  const ROW_CLASS = { add: 'is-add', mod: 'is-mod', same: 'is-same', tbd: 'is-bad', skip: 'is-skip' };
  const COLUMNS = [['name', 'Projet'], ['acr', 'Acronyme'], ['prog', 'Programme'], ['start', 'Début'], ['end', 'Fin'], ['stat', 'Statut du projet']];
  const TABLE_MAX_AGE_MS = 10 * 60 * 1000;

  const state = freshState();
  function freshState() {
    return {
      phase: 'idle', error: '', rows: [], lines: [], ignored: 0, total: 0, issues: [], entries: [], orphans: [], ctx: null, matches: new Map(),
      decisions: new Map(), edits: new Map(), table: null, editing: null, applyAll: true, ack: false, nextBad: 0,
      filter: 'all', search: '', detail: [], totals: null, journal: [], lots: [], tables: {}, readAt: 0, writing: false,
      result: null, undo: null, openBoxes: new Set(), _refocus: null, setAside: 0, discovered: [], form: null, formError: '', formAccept: false, formBusy: false, fd: null, fdAck: false,
      prepared: [], upload: null, tab: 'ubinvest', draft: { rowId: null, saved: '', timer: null, error: '', confirm: false }
    };
  }
  // Repart de zéro (utilisé par les tests ; l'application, elle, ne l'appelle jamais : un rechargement garde le brouillon).
  function resetState() {
    clearTimeout(state.draft && state.draft.timer);
    try { localStorage.removeItem('suiviProjetInnovationS:importBrouillon'); } catch (err) { /* stockage bloqué */ }
    Object.assign(state, freshState());
  }

  const money = n => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('fr-FR');
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  const dateFr = iso => String(iso).split('-').reverse().join('/');
  const shownValue = (kind, value) => ((kind === 'start' || kind === 'end') && value ? dateFr(value) : value);

  // ----------------------------------------------------------------------------------------------------------
  // Lecture
  // ----------------------------------------------------------------------------------------------------------

  async function readTable(name) { try { return await CoreGrist.getTable(name); } catch (err) { return null; } }

  async function readGrist() {
    await CoreGrist.ready();
    const [projets, lignes, programmes, structures, detail, journal, lots] = await Promise.all(
      ['Projets', 'Lignes_OPE', 'Programmes', 'Structures', L.DETAIL_TABLE, L.JOURNAL_TABLE, L.LOTS_TABLE].map(readTable));
    state.tables = { Projets: projets || [], Lignes_OPE: lignes || [], [L.DETAIL_TABLE]: detail || [] };
    state.detail = detail || [];
    state.journal = journal || [];
    state.lots = lots || [];
    state.ctx = L.buildContext({
      projets: projets || [], lignes: lignes || [], programmes: programmes || [], structures: structures || [],
      isFormula: (table, col) => CoreGrist.isFormulaColumn(table, col),
      hasColumn: (table, col) => { const known = CoreGrist.knownColumns(table); return !known || known.has(col); },
      statusChoices: CoreGrist.columnChoices('Projets', 'Statut_operationnel_projet'),
      withAmounts: true
    });
    state.readAt = Date.now();
  }

  // ----------------------------------------------------------------------------------------------------------
  // Brouillon de tri (24/11/2026, demande d'Antoine) : les choix et corrections faits dans le tableau (décisions de rapprochement, valeurs prises
  // ou corrigées) sont enregistrés automatiquement TANT QUE « Écrire » n'a pas été cliqué, pour trier 94 projets en plusieurs séances. Une seule ligne
  // de Import_Brouillon dans Grist (retrouvée d'un navigateur ou d'un poste à l'autre), plus une copie locale écrite aussitôt : un rechargement
  // lancé juste après un clic peut couper l'écriture dans Grist, la copie la plus récente fait alors foi. Rien d'autre n'est écrit tant que
  // tu n'as pas validé : le brouillon ne touche ni Projets, ni Lignes_OPE.
  // ----------------------------------------------------------------------------------------------------------
  const DRAFT_TABLE = 'Import_Brouillon';
  const DRAFT_COLUMNS = [{ id: 'Contenu', type: 'Text', label: 'Choix en cours' }, { id: 'Nb_choix', type: 'Int', label: 'Nombre de choix' }, { id: 'Modifie_le', type: 'DateTime:Europe/Paris', label: 'Modifié le' }];
  const DRAFT_STORAGE_KEY = 'suiviProjetInnovationS:importBrouillon';
  const DRAFT_DELAY_MS = 600;
  const draftCount = () => state.edits.size + state.decisions.size;
  const draftJson = () => (draftCount() ? JSON.stringify({ v: 1, edits: Array.from(state.edits), decisions: Array.from(state.decisions) }) : '');
  function readLocalDraft() {
    try { const raw = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || 'null'); if (raw && typeof raw.json === 'string') return { json: raw.json, at: Number(raw.at) || 0 }; }
    catch (err) { /* copie illisible ou stockage bloqué : comme s'il n'y en avait pas */ }
    return null;
  }
  function writeLocalDraft(json) {
    try { localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ json, at: Math.floor(Date.now() / 1000) })); }
    catch (err) { /* navigation privée / stockage bloqué : le brouillon ne sera que dans Grist */ }
  }
  // Écrit le brouillon dans Grist s'il a changé depuis la dernière écriture. Au mieux : un échec est dit dans la page, jamais bloquant.
  async function flushDraft() {
    const d = state.draft;
    clearTimeout(d.timer); d.timer = null;
    const json = draftJson();
    if (json === d.saved) return true;
    if (!CoreGrist.gristInstance) return false;
    try {
      const fields = { Contenu: json, Nb_choix: draftCount(), Modifie_le: Math.floor(Date.now() / 1000) };
      if (d.rowId) await CoreGrist.gristInstance.docApi.applyUserActions([['UpdateRecord', DRAFT_TABLE, d.rowId, fields]]);
      else {
        const result = await CoreGrist.gristInstance.docApi.applyUserActions([['AddRecord', DRAFT_TABLE, null, fields]]);
        d.rowId = Array.isArray(result && result.retValues) ? result.retValues[0] : null;
      }
      d.saved = json; d.error = '';
      return true;
    } catch (err) {
      d.error = CoreUtils.failureReason(err, { what: 'enregistrement du brouillon de tri', table: DRAFT_TABLE });
      console.warn('Import : brouillon non enregistré dans Grist :', err);
      return false;
    }
  }
  // Appelée à chaque changement du tableau : copie locale tout de suite, Grist après une courte pause (une rafale de clics = une écriture).
  function scheduleDraft() {
    const d = state.draft, json = draftJson();
    if (json === d.saved && !d.timer) return;
    writeLocalDraft(json);
    clearTimeout(d.timer);
    d.timer = setTimeout(() => { flushDraft().then(() => { if (!state.draft.timer) render(); }); }, DRAFT_DELAY_MS);
  }
  // Au chargement d'une séance neuve (rien en mémoire) : reprend le brouillon le plus récent, celui de Grist ou la copie locale.
  async function restoreDraft() {
    if (draftCount()) return;
    const d = state.draft;
    let remote = null;
    try {
      CoreGrist.invalidateTable(DRAFT_TABLE);
      const rows = (await readTable(DRAFT_TABLE)) || [];
      const row = rows[rows.length - 1];
      if (row) { d.rowId = row.id; remote = { json: String(row.Contenu || ''), at: Number(row.Modifie_le) || 0 }; d.saved = remote.json; }
    } catch (err) { console.warn('Import : brouillon de Grist illisible :', err); }
    const local = readLocalDraft();
    const chosen = local && (!remote || local.at >= remote.at) ? local : remote;   // à égalité à la seconde, la copie locale est au moins aussi récente (écrite à chaque changement, Grist après une pause)
    if (!chosen || !chosen.json) return;
    try {
      const data = JSON.parse(chosen.json);
      if (!data || !Array.isArray(data.edits) || !Array.isArray(data.decisions)) return;
      state.edits = new Map(data.edits); state.decisions = new Map(data.decisions);
      state.result = { kind: 'info', message: `Brouillon retrouvé : ${plural(draftCount(), 'choix ou correction', 'choix ou corrections')} de ta dernière séance. Rien n'est écrit dans Projets ni Lignes_OPE tant que tu n'as pas cliqué sur « Écrire ».` };
    } catch (err) { console.warn('Import : brouillon illisible, ignoré :', err); }
  }
  async function clearDraft() {
    state.edits = new Map(); state.decisions = new Map(); state.ack = false; state.draft.confirm = false;
    if (state.entries.length) recompute();
    writeLocalDraft('');
    await flushDraft();
    render();
  }
  function draftHtml() {
    const n = draftCount(), d = state.draft;
    if (!n && !d.error) return '';
    const warn = d.error ? ` <span class="ih-warn-inline" role="alert">⚠ non enregistré dans Grist : ${esc(d.error)} (copie gardée dans ce navigateur)</span>` : '';
    const clear = d.confirm
      ? `<button type="button" class="ih-link" id="ih-draft-clear-confirm">Oui, oublier ces ${n} choix</button> <button type="button" class="ih-link" id="ih-draft-clear-cancel">Garder</button>`
      : '<button type="button" class="ih-link" id="ih-draft-clear">Repartir de zéro</button>';
    return n ? ` · <span class="ih-muted" title="Enregistrés automatiquement dans Grist (table ${DRAFT_TABLE}) jusqu'à « Écrire »">${plural(n, 'choix enregistré', 'choix enregistrés')} automatiquement</span> ${clear}${warn}` : warn;
  }

  // Le tableau se déduit de ce qui est lu, des décisions de rapprochement et des valeurs corrigées : recalculé à chaque correction.
  function recompute() {
    state.table = L.buildTable({ entries: state.entries, matches: state.matches, decisions: state.decisions, edits: state.edits, ctx: state.ctx, now: Date.now() });
    scheduleDraft();
  }

  function analyse() {
    // Un envoi refusé ou annulé, l'essai et un envoi incomplet ne comptent pas (ImportLotsLogic.activeRows).
    const active = K.activeRows(state.rows, state.lots);
    const versions = L.latestVersions(active);
    state.lines = versions.lines; state.ignored = versions.ignored; state.total = state.rows.length; state.setAside = state.rows.length - active.length;
    state.issues = L.checkLines(state.lines);
    const grouped = L.groupProjects(state.lines, state.issues);
    state.entries = grouped.entries; state.orphans = grouped.orphans;
    state.matches = new Map(state.entries.map(entry => [entry.key, L.matchEntry(entry, state.ctx)]));
    state.totals = L.checkTotals(state.lines, state.entries, state.detail);
    recompute();
  }

  // Ce dont l'outil a besoin dans Grist, créé à l'ouverture : le journal Import_Financements (colonnes de l'export) et Import_Journal.
  // Seul ce qui manque est ajouté ; rien d'existant n'est modifié.
  async function prepare() {
    await CoreGrist.ready();
    const done = [];
    if (await CoreGrist.ensureTable(L.SOURCE_TABLE, L.SOURCE_COLUMNS)) done.push(`table ${L.SOURCE_TABLE} (${L.SOURCE_COLUMNS.length} colonnes)`);
    else if (await CoreGrist.ensureColumns(L.SOURCE_TABLE, L.SOURCE_COLUMNS)) done.push(`colonnes ajoutées à ${L.SOURCE_TABLE}`);
    if (await CoreGrist.ensureTable(L.JOURNAL_TABLE, L.JOURNAL_COLUMNS)) done.push(`table ${L.JOURNAL_TABLE}`);
    else await CoreGrist.ensureColumns(L.JOURNAL_TABLE, L.JOURNAL_COLUMNS);
    if (await CoreGrist.ensureTable(L.LOTS_TABLE, L.LOTS_COLUMNS)) done.push(`table ${L.LOTS_TABLE}`);
    else await CoreGrist.ensureColumns(L.LOTS_TABLE, L.LOTS_COLUMNS);
    if (await CoreGrist.ensureTable(DRAFT_TABLE, DRAFT_COLUMNS)) done.push(`table ${DRAFT_TABLE}`);
    else await CoreGrist.ensureColumns(DRAFT_TABLE, DRAFT_COLUMNS);
    if (done.length) state.prepared = state.prepared.concat(done);
  }

  // Lignes d'un chargement d'avant les lots (colonne Lot vide) : rattachées à un lot « Reprise unique » créé ici, une seule fois.
  // Au mieux : un échec laisse la page utilisable (les lignes restent sans lot, l'outil les traite quand même).
  async function adoptLegacyRows() {
    const plan = L.planLegacyLot(state.rows, state.lots, state.journal, new Date());
    if (!plan) return;
    try {
      const actions = [];
      if (plan.create) actions.push(['AddRecord', L.LOTS_TABLE, null, plan.create]);
      for (let i = 0; i < plan.ids.length; i += L.CHUNK) plan.ids.slice(i, i + L.CHUNK).forEach(id => actions.push(['UpdateRecord', L.SOURCE_TABLE, id, { Lot: plan.lot }]));
      for (let i = 0; i < actions.length; i += L.CHUNK) await CoreGrist.gristInstance.docApi.applyUserActions(actions.slice(i, i + L.CHUNK));
      CoreGrist.invalidateTable(L.SOURCE_TABLE); CoreGrist.invalidateTable(L.LOTS_TABLE);
      state.rows = await CoreGrist.getTable(L.SOURCE_TABLE);
      state.lots = (await readTable(L.LOTS_TABLE)) || [];
    } catch (err) { console.warn('Import historique : rattachement des anciennes lignes à un lot impossible :', err); }
  }

  // Formulaire du script (js/pages/import-form.js) : état lu dans les métadonnées de Grist. Au mieux : une lecture refusée est dite, jamais devinée
  // (créer un formulaire « à l'aveugle » en ferait un doublon).
  const metaIo = () => ({ fetch: name => CoreGrist.gristInstance.docApi.fetchTable(name), apply: async actions => (await CoreGrist.gristInstance.docApi.applyUserActions(actions)).retValues });
  async function readForm() {
    try { state.form = await F.read(metaIo(), L.SOURCE_TABLE); state.formError = ''; }
    catch (err) { state.form = null; state.formError = CoreUtils.failureReason(err, { what: 'lecture du formulaire du script', table: '_grist_Views_section' }); }
  }

  // Envois du script arrivés depuis la dernière ouverture : une ligne Import_Lots « A valider » chacun (rien d'autre n'est écrit). Au mieux :
  // un échec laisse la page utilisable, les envois comptent alors comme « à valider » (ImportLotsLogic.activeRows).
  async function discoverLots() {
    const plan = K.planDiscovery(state.rows, state.lots, new Date());
    state.discovered = plan.created;
    if (!plan.actions.length) return;
    try {
      await CoreGrist.gristInstance.docApi.applyUserActions(plan.actions);
      CoreGrist.invalidateTable(L.LOTS_TABLE);
      state.lots = (await readTable(L.LOTS_TABLE)) || [];
    } catch (err) { console.warn('Import historique : enregistrement des nouveaux envois impossible :', err); }
  }

  async function load() {
    state.phase = 'loading'; state.error = ''; state.editing = null; render();
    try {
      try { await prepare(); }
      catch (err) { throw Object.assign(new Error('Préparation de Grist impossible (création de ' + L.SOURCE_TABLE + ' et de ses colonnes)'), { cause: err }); }
      let rows;
      try { rows = await CoreGrist.getTable(L.SOURCE_TABLE); }
      catch (err) { state.phase = 'missing'; render(); return; }
      state.rows = rows || [];
      await readGrist();
      await adoptLegacyRows();
      await discoverLots();
      await readForm();
      await restoreDraft();
      analyse();
      state.phase = 'ready';
    } catch (err) {
      console.error('Import historique :', err);
      state.phase = 'error'; state.error = CoreUtils.failureReason(err, { what: 'ouverture de l\'import de l\'historique' });
    }
    render();
  }

  // ----------------------------------------------------------------------------------------------------------
  // Décisions et corrections
  // ----------------------------------------------------------------------------------------------------------

  const decisionOf = key => state.decisions.get(key) || { mode: 'auto' };
  function setDecision(key, patch) { state.decisions.set(key, Object.assign({}, decisionOf(key), patch)); state.ack = false; }

  function rowMatches(row) {
    const f = state.filter;
    if (f === 'add' && row.state !== 'add') return false;
    if (f === 'mod' && row.state !== 'mod') return false;
    if (f === 'same' && row.state !== 'same') return false;
    if (f === 'skip' && row.state !== 'skip') return false;
    if (f === 'todo' && !row.anomalies) return false;
    const needle = L.normalize(state.search);
    if (!needle) return true;
    const entry = row.entry;
    return L.normalize([entry.name, row.cells.acr.v, entry.programme, entry.financeurs.join(' '), entry.opes.map(o => o.ope).join(' ')].join(' ')).includes(needle);
  }

  // ----------------------------------------------------------------------------------------------------------
  // Rendu : tableau
  // ----------------------------------------------------------------------------------------------------------

  // Deux imports qui n'ont rien à voir, deux onglets dans le bandeau (même ligne, pas de place perdue) :
  //  - UB Invest : le script, totaux par OPE (attribué, consommé, disponible), une ligne par OPE et financeur, liés aux projets -> Lignes_OPE ;
  //  - BO : le fichier FD02, détail par OPE (une ligne par engagement) -> Depenses_OPE, jamais Lignes_OPE.
  const TABS = [['ubinvest', 'UB Invest', 'totaux par OPE'], ['bo', 'BO', 'détail par OPE']];
  function tabsHtml() {
    return `<div class="ih-tabs" role="tablist" aria-label="Quel import ?">${TABS.map(([id, name, hint]) => `<button type="button" role="tab" class="ih-tab${state.tab === id ? ' is-on' : ''}" data-ih-tab="${id}" aria-selected="${state.tab === id}"><strong>${name}</strong> <span class="ih-muted">${hint}</span></button>`).join('')}</div>`;
  }
  const backHtml = '<button type="button" class="btn btn-secondary" id="ih-back">← Retour</button>';
  const headerHtml = () => `<div class="project-filters ih-bar">${backHtml}${tabsHtml()}</div>`;
  const plainHeaderHtml = () => `<div class="project-filters ih-bar">${backHtml}<strong class="ih-title">Imports financiers</strong></div>`;

  function barHtml() {
    const t = state.table;
    const counts = { all: t.rows.length, add: t.add, mod: t.mod, same: t.same, todo: t.todo, skip: t.skip };
    const chips = FILTERS.map(([id, label]) => `<button type="button" class="ih-chip${state.filter === id ? ' is-on' : ''}" data-ih-filter="${id}" aria-pressed="${state.filter === id}">${label} <span class="kanban-count">${counts[id] || 0}</span></button>`).join('');
    return `<div class="project-filters ih-bar" role="search" aria-label="Filtres de l'import">
      ${backHtml}
      ${tabsHtml()}
      <div class="ih-chips" role="group" aria-label="Filtrer les projets">${chips}</div>
      <label class="filter-search"><span class="visually-hidden">Recherche</span><input id="ih-search" type="search" placeholder="Projet, N° OPE, financeur…" autocomplete="off" value="${esc(state.search)}"></label>
    </div>`;
  }

  function legendHtml() {
    const sw = (cls, label) => `<span><i class="ih-sw c-${cls}"></i>${label}</span>`;
    return `<div class="ih-legend" aria-label="Légende">${sw('add', 'Ajouté')}${sw('fill', 'Modifié')}${sw('conf', 'Écart : Grist garde sa valeur')}${sw('bad', 'Anomalie à régler')}<span class="ih-muted">Clique sur une valeur pour la changer.</span></div>`;
  }

  function boxHtml(id, title, summary, body, open) {
    const isOpen = open || state.openBoxes.has(id);
    return `<details class="ih-box" data-ih-box="${id}"${isOpen ? ' open' : ''}><summary><strong>${title}</strong>${summary ? ` <span class="ih-muted">${summary}</span>` : ''}</summary><div class="ih-box-body">${body}</div></details>`;
  }

  function checksHtml() {
    const byCheck = new Map();
    state.issues.forEach(issue => { if (!byCheck.has(issue.check)) byCheck.set(issue.check, []); byCheck.get(issue.check).push(issue); });
    const labels = [...L.CHECKS, { id: 'projet-vide', label: 'Chaque ligne a un nom de projet' }];
    const list = labels.map(check => {
      const found = byCheck.get(check.id) || [];
      return `<li class="${found.length ? 'is-warn' : 'is-ok'}"><span aria-hidden="true">${found.length ? '⚠' : '✓'}</span> ${esc(check.label)}${found.length ? ` <strong>${plural(found.length, 'écart', 'écarts')}</strong>` : ''}</li>`;
    }).join('');
    const details = state.issues.length
      ? `<table class="ih-table"><thead><tr><th>N° OPE</th><th>Projet</th><th>Écart</th></tr></thead><tbody>${state.issues.slice(0, 200).map(i => `<tr class="${i.level === 'error' ? 'is-error' : ''}"><td class="ih-mono">${esc(i.ope)}</td><td>${esc(i.project)}</td><td>${esc(i.message)}</td></tr>`).join('')}</tbody></table>${state.issues.length > 200 ? `<p class="ih-muted">… et ${state.issues.length - 200} autres.</p>` : ''}`
      : '<p class="ih-muted">Aucun écart.</p>';
    return `<ul class="ih-checks">${list}</ul>${details}`;
  }

  function totalsHtml(options) {
    const t = state.totals;
    if (!t || !t.available) return `<p class="ih-muted">Le détail BO (table ${L.DETAIL_TABLE}, export FD02) n'est pas encore importé : le contrôle des totaux UB Invest / BO est impossible pour l'instant.</p>`;
    const gaps = t.rows.filter(r => r.status !== 'ok');
    const head = `<p class="${t.gaps ? 'ih-warn' : 'ih-okline'}"><strong>${t.gaps ? '⚠' : '✓'}</strong> Consommé UB Invest, comparé à la somme du détail BO : <strong>${t.gaps ? plural(t.gaps, 'OPE en écart', 'OPE en écart') : 'tous les OPE concordent'}</strong> sur ${t.rows.length}. Total AE ${money(t.total.export.ae)} / ${money(t.total.detail.ae)}, CP ${money(t.total.export.cp)} / ${money(t.total.detail.cp)} (export / détail).</p>`;
    const rows = gaps.slice(0, options && options.max || 30).map(r => `<tr><td class="ih-mono">${esc(r.ope)}</td><td>${esc(r.project)}</td><td class="ih-num">${money(r.exportAE)}</td><td class="ih-num">${r.status === 'sans-detail' ? '—' : money(r.detailAE)}</td><td class="ih-num">${money(r.exportCP)}</td><td class="ih-num">${r.status === 'sans-detail' ? '—' : money(r.detailCP)}</td><td>${r.status === 'sans-detail' ? 'Aucun détail' : 'Écart de ' + money(r.diffAE) + ' AE, ' + money(r.diffCP) + ' CP'}</td></tr>`).join('');
    const table = gaps.length ? `<table class="ih-table"><thead><tr><th>N° OPE</th><th>Projet</th><th>AE export</th><th>AE détail</th><th>CP export</th><th>CP détail</th><th></th></tr></thead><tbody>${rows}</tbody></table>${gaps.length > 30 ? `<p class="ih-muted">… et ${gaps.length - 30} autres.</p>` : ''}` : '';
    const extra = t.extra.length ? `<p class="ih-muted">${plural(t.extra.length, 'N° OPE présent', 'N° OPE présents')} dans le détail BO mais pas dans l'export UB Invest.</p>` : '';
    return head + table + extra;
  }

  // Éditeur d'une cellule (un champ du projet, ou la structure d'une ligne OPE) : choix dans la liste de Grist, date, ou texte.
  function optionsOf(kind) {
    if (kind === 'prog') return state.ctx.programmeList.map(p => p.label);
    if (kind === 's') return state.ctx.structureList.map(s => s.label);
    if (kind === 'stat') return state.ctx.statusChoices || [];
    return null;
  }
  function editorHtml(cell) {
    const id = esc(cell.id), label = esc(L.KIND_LABEL[cell.kind]);
    const attrs = `class="ih-in" data-ih-in="${id}" data-ih-type="cell" aria-label="${label}"`;
    let control;
    const options = optionsOf(cell.kind);
    if (cell.state === 'conf') {
      control = `<select ${attrs}><option value="">Choisir…</option><option value="${esc(cell.g)}">Garder Grist : ${esc(shownValue(cell.kind, cell.g))}</option><option value="${esc(cell.alt)}">Prendre l'export : ${esc(shownValue(cell.kind, cell.alt))}</option></select>`;
    } else if (options && options.length) {
      control = `<select ${attrs}><option value="">Choisir…</option>${options.map(o => `<option value="${esc(o)}"${o === cell.v ? ' selected' : ''}>${esc(o)}${o === cell.hint ? ' · suggestion' : ''}</option>`).join('')}<option value="__none">Ne pas renseigner</option></select>`;
    } else if (cell.kind === 'start' || cell.kind === 'end') {
      control = DateInput.markup({ cls: 'ih-in', iso: cell.v || '', aria: L.KIND_LABEL[cell.kind], attrs: `data-ih-in="${id}" data-ih-type="cell"` });
    } else {
      control = `<input type="text" ${attrs} value="${esc(cell.v || '')}">`;
    }
    const others = L.similarBad(state.table, cell.id).length;
    if (others) control += `<label class="ih-all"><input type="checkbox" data-ih-all${state.applyAll ? ' checked' : ''}> Appliquer aussi ${others === 1 ? 'à l\'autre' : `aux ${others} autres`} « ${esc(cell.raw)} »</label>`;
    return control;
  }
  function cellInner(cell) {
    if (cell.v == null || cell.v === '') return '<span class="v ih-faint">—</span>';
    let html = `<span class="v">${esc(shownValue(cell.kind, cell.v))}</span>`;
    if (cell.state === 'conf') html += `<small class="alt">export : ${esc(shownValue(cell.kind, cell.alt))}</small>`;
    if (cell.state === 'bad') html += `<small class="err">${esc(cell.err)}</small>${cell.hint ? `<small class="hint">proche : ${esc(cell.hint)}</small>` : ''}`;
    return html;
  }
  const cellTitle = cell => `Grist : ${cell.g == null ? '(vide)' : shownValue(cell.kind, cell.g)} · Export : ${cell.e == null ? '(vide)' : shownValue(cell.kind, cell.e)}`;

  function cellTd(row, kind) {
    const cell = row.cells[kind], editing = state.editing === cell.id;
    return `<td class="c c-${cell.state}${editing ? ' editing' : ''}${kind === 'name' ? ' s2' : ''}" data-ih-cell="${esc(cell.id)}" tabindex="0" title="${esc(cellTitle(cell))}">${editing ? editorHtml(cell) : cellInner(cell)}</td>`;
  }

  function statusEditorHtml(row) {
    const match = row.match, d = decisionOf(row.key);
    let current = '';
    if (d.mode === 'skip') current = 'skip'; else if (d.mode === 'new') current = 'new'; else if (d.mode === 'other') current = 'other';
    else if (d.mode === 'project' && d.projectId) current = 'p:' + d.projectId;
    else if (match.status === 'sure') current = 'p:' + match.projectId; else if (match.status === 'new') current = 'new';
    const option = (value, label) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${label}</option>`;
    const options = ['<option value="">Choisir…</option>'];
    const candidates = match.candidates.slice();
    if (d.mode === 'project' && d.projectId && !candidates.some(c => c.id === d.projectId)) {
      const picked = state.ctx.projects.find(p => p.id === d.projectId);
      candidates.push({ id: d.projectId, label: picked ? picked.label : '#' + d.projectId, score: 1 });
    }
    candidates.forEach(c => options.push(option('p:' + c.id, `→ ${esc(c.label)}${c.score < 1 ? ` (${Math.round(c.score * 100)} %)` : ''}`)));
    options.push(option('new', 'Créer un nouveau projet'), option('other', 'Autre projet…'), option('skip', 'Écarter ce projet'));
    let html = `<select class="ih-in" data-ih-in="${esc(row.key)}|status" data-ih-type="status" data-ih-row="${esc(row.key)}" aria-label="Projet de Grist pour ${esc(row.entry.name)}">${options.join('')}</select>`;
    if (d.mode === 'other') {
      html += `<select class="ih-in" data-ih-in="${esc(row.key)}|other" data-ih-type="other" data-ih-row="${esc(row.key)}" aria-label="Autre projet"><option value="">Choisir…</option>${state.ctx.projects.slice().sort((a, b) => a.label.localeCompare(b.label, 'fr')).map(p => `<option value="${p.id}">${esc(p.label)}${p.name && p.name !== p.label ? ' — ' + esc(p.name) : ''}</option>`).join('')}</select>`;
    }
    return html;
  }
  function statusTd(row) {
    const id = row.key + '|status', editing = state.editing === id, blocked = row.match.status === 'blocked';
    let how;
    if (row.state === 'skip') how = row.reason;
    else if (row.state === 'add') how = 'absent de Grist';
    else if (row.state === 'tbd') how = row.match.reason;
    else how = 'trouvé par ' + (row.match.rung === 1 ? 'N° OPE' : row.match.rung === 2 ? 'N° décision' : row.match.reason);
    const inner = editing ? statusEditorHtml(row) : `<span class="ih-pill ${ROW_CLASS[row.state]}">${ROW_LABEL[row.state]}</span><small>${esc(how)}</small>`;
    return `<td class="s1 st${row.state === 'tbd' ? ' c-bad' : ''}${editing ? ' editing' : ''}"${blocked ? '' : ` data-ih-cell="${esc(id)}" tabindex="0" title="${esc(row.match.reason)} : cliquer pour changer"`}>${inner}</td>`;
  }

  function linesTd(row) {
    const chips = row.lines.map(line => {
      const editing = state.editing === line.id;
      let inner;
      if (editing && line.conflict && !line.conflict.resolved) {
        inner = `<span class="ih-mono">${esc(line.ope)}</span><select class="ih-in" data-ih-in="${esc(line.id)}" data-ih-type="conflict" data-ih-row="${esc(row.key)}" aria-label="Décision"><option value="">Choisir…</option><option value="keep">Rattacher aussi à ce projet</option><option value="skip">Écarter ce projet, garder Grist</option></select>`;
      } else if (editing) {
        inner = `<span class="ih-mono">${esc(line.ope)}</span>${editorHtml(line.cell)}`;
      } else {
        const c = line.cell, conflict = line.conflict && !line.conflict.resolved;
        inner = `${row.lines.length > 1 || line.rank > 1 ? `<small class="ih-rank" title="Rang de la ligne dans le projet">OPE ${line.rank}</small> ` : ''}<span class="ih-mono">${esc(line.ope)}</span> · <span>${esc(c.v || c.raw || '—')}</span>`
          + (line.state === 'bad' ? `<small class="err">${esc(conflict ? 'Déjà sur ' + line.conflict.owner : c.err)}</small>${!conflict && c.hint ? `<small class="hint">proche : ${esc(c.hint)}</small>` : ''}` : '')
          + (c.state === 'conf' ? `<small class="alt">export : ${esc(c.alt)}</small>` : '');
      }
      return `<span class="ih-ln c-${line.state}${editing ? ' editing' : ''}" data-ih-cell="${esc(line.id)}" tabindex="0" title="${esc(line.isNew ? 'Nouvelle ligne OPE' : 'Ligne OPE déjà dans Grist')}">${inner}</span>`;
    }).join('');
    return `<td class="lines"><div class="ih-lines">${chips}</div></td>`;
  }

  function rowHtml(row) {
    return `<tr class="ih-tr is-${row.state}" data-ih-entry="${esc(row.key)}">${statusTd(row)}${COLUMNS.map(([kind]) => cellTd(row, kind)).join('')}${linesTd(row)}</tr>`;
  }

  function tableHtml() {
    const visible = state.table.rows.filter(rowMatches);
    const head = `<th class="s1">Statut</th><th class="s2">Projet</th>${COLUMNS.slice(1).map(([, label]) => `<th>${label}</th>`).join('')}<th>Lignes OPE · structure</th>`;
    const body = visible.length ? visible.map(rowHtml).join('') : `<tr><td colspan="8" class="ih-empty">${state.table.rows.length ? 'Aucun projet ne correspond à ce filtre.' : 'Le journal ne contient aucune ligne rattachable (N° OPE manquant).'}</td></tr>`;
    return `<div class="ih-grid" aria-live="polite"><table class="ih-t"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function actionsHtml() {
    const t = state.table, plan = t.plan, c = plan.counts;
    let note;
    if (t.left) note = `<b>${plural(t.left, 'anomalie reste', 'anomalies restent')} à régler</b> avant d'écrire (cellules rouges).`;
    else if (!plan.actionCount) note = 'Rien à écrire : tout est déjà à jour dans Grist.';
    else note = `<b>Prêt à écrire :</b> ${plural(c.projetsCrees, 'projet créé', 'projets créés')}, ${plural(c.projetsLies, 'projet complété', 'projets complétés')}, ${plural(c.opesCreees, 'ligne OPE créée', 'lignes OPE créées')}, ${plural(c.opesCompletees, 'ligne OPE complétée', 'lignes OPE complétées')}${c.montantsEcrits ? `, ${plural(c.montantsEcrits, 'ligne OPE avec ses montants', 'lignes OPE avec leurs montants')}` : ''}. Rien n'est écrit avant ton clic.`;
    const blocked = !!t.left || !plan.actionCount;
    return `<div class="ih-actions-bar"><span class="ih-note">${note}</span>
      <button type="button" class="btn btn-secondary" id="ih-next"${t.left ? '' : ' disabled'}>Prochaine anomalie ↓</button>
      <label class="ih-ack"><input type="checkbox" id="ih-ack"${state.ack ? ' checked' : ''}${blocked ? ' disabled' : ''}> J'ai relu le tableau</label>
      <button type="button" class="btn btn-primary" id="ih-write"${blocked || !state.ack || state.writing ? ' disabled' : ''}>Écrire ${plural(plan.actionCount, 'action', 'actions')} dans Grist</button></div>`;
  }

  // ----------------------------------------------------------------------------------------------------------
  // Envois reçus (script UB Invest ou fichier) : un envoi n'écrit rien tant qu'il n'est pas validé ; « Écrire » valide ceux du tableau.
  // ----------------------------------------------------------------------------------------------------------

  const whenFr = seconds => (seconds ? new Date(seconds * 1000).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' à') : '—');
  const LOT_TAG = { 'A valider': ['is-maybe', 'À valider'], Valide: ['is-ok', 'Validé'], Refuse: ['is-bad', 'Refusé'], Annule: ['is-bad', 'Annulé'], Remplace: ['is-skip', 'Remplacé'] };

  function diffText(card) {
    const d = card.diff;
    if (!d) return '';
    if (d.first) return `première réception : ${plural(d.added, 'ligne', 'lignes')}`;
    const parts = [];
    if (d.added) parts.push(`<b class="ih-plus">+${d.added}</b> ${d.added > 1 ? 'nouvelles' : 'nouvelle'}`);
    if (d.changed) parts.push(`<b>${d.changed}</b> ${d.changed > 1 ? 'modifiées' : 'modifiée'}`);
    if (d.gone) parts.push(`<b class="ih-minus">${d.gone}</b> ${d.gone > 1 ? 'disparues' : 'disparue'} (gardées, à vérifier)`);
    parts.push(parts.length ? `${d.same} ${d.same > 1 ? 'inchangées' : 'inchangée'}` : 'identique à l\'envoi validé');
    return parts.join(' · ');
  }

  function envoisHtml() {
    const cards = K.lotCards(state.rows, state.lots);
    state.cards = cards;
    if (!cards.length) return '';
    const review = cards.filter(card => card.status === 'A valider' && !card.excluded).length;
    const items = cards.map(card => {
      const [cls, label] = LOT_TAG[card.status] || ['is-skip', card.status];
      const photo = card.photo ? [card.photo.added && plural(card.photo.added, 'projet ajouté', 'projets ajoutés'), card.photo.changed && plural(card.photo.changed, 'projet modifié', 'projets modifiés'), card.photo.gone && plural(card.photo.gone, 'ligne disparue', 'lignes disparues')].filter(Boolean).join(', ') : '';
      const source = card.source === 'Fichier' ? `fichier ${esc(card.file || '')}` : 'script';
      const action = card.status === 'A valider' ? `<button type="button" class="btn btn-secondary" data-ih-refuse="${esc(card.lot)}">Refuser</button>`
        : card.status === 'Refuse' ? `<button type="button" class="btn btn-secondary" data-ih-restore="${esc(card.lot)}">Rétablir</button>` : '';
      return `<li><span class="ih-mono">${esc(whenFr(card.time))}</span> <span class="ih-tag ${cls}">${label}</span>
        <span class="ih-muted">· ${source} · ${plural(card.count, 'ligne', 'lignes')}${diffText(card) ? ' · ' + diffText(card) : ''}${photo ? ' · ' + photo : ''}</span>
        ${card.excluded ? `<span class="ih-warn-inline">${esc(card.excluded)}</span>` : ''}${card.note && !card.excluded ? `<span class="ih-muted">· ${esc(card.note)}</span>` : ''} ${action}</li>`;
    }).join('');
    return boxHtml('envois', 'Envois reçus', review ? `<span class="ih-warn-inline">${plural(review, 'envoi à relire', 'envois à relire')}</span>` : plural(cards.length, 'envoi', 'envois'),
      `<ul class="ih-lots">${items}</ul><p class="ih-muted">Un envoi n'écrit rien dans Grist tant que tu ne l'as pas validé : relis le tableau et les montants ci-dessous, puis « Écrire ». Un envoi refusé ne compte plus.</p>`, review > 0);
  }

  // Valeur d'un montant ou d'une date pour la relecture (jamais de nombre brut, dates en jj/mm/aaaa).
  function formatAmount(type, value) {
    if (value == null || value === '') return '—';
    if (type === 'Date') return dateFr(new Date(value * 1000).toISOString().slice(0, 10));
    if (type === 'Numeric') return money(value) + ' €';
    return String(value);
  }

  const AMOUNT_MAIN = new Set(['Montant_attribue', 'Consomme_AE', L.CP_COLUMN, 'Disponible_AE', 'Disponible_CP']);
  function montantsHtml() {
    const t = state.table, changes = K.amountChanges(t.plan);
    const names = new Map(t.rows.map(row => [row.key, row.entry.name]));
    const conflicts = state.entries.flatMap(entry => entry.opes.filter(ope => ope.amounts && ope.amounts.conflict).map(ope => ({ ope: ope.ope, project: entry.name })));
    if (!changes.length && !conflicts.length) return '';
    const MAX = 150;
    const rows = changes.slice(0, MAX).map(item => {
      // Les cinq montants qui comptent s'affichent toujours ; le reste (attribué par année, dates, financeur, ligne budgétaire) seulement quand une valeur
      // déjà présente change : à la première écriture, il serait du bruit (une ligne par champ), il est résumé en une mention.
      const shownChanges = item.changes.filter(change => AMOUNT_MAIN.has(change.id) || (item.kind !== 'add' && change.before != null && change.before !== ''));
      const hidden = item.changes.length - shownChanges.length;
      const parts = shownChanges.map(change => `<span class="ih-chg"><b>${esc(change.label)}</b> ${item.kind === 'add' || change.before == null || change.before === '' ? '' : esc(formatAmount(change.type, change.before)) + ' → '}${esc(formatAmount(change.type, change.after))}</span>`)
        .concat(hidden ? [`<span class="ih-muted">+ ${plural(hidden, 'autre champ', 'autres champs')}</span>`] : []);
      return `<tr><td class="ih-mono">${esc(item.ope)}${item.kind === 'add' ? ' <span class="ih-tag is-ok">nouvelle ligne</span>' : ''}</td><td>${esc(names.get(item.entry) || '')}</td><td class="ih-chgs">${parts.join(' ')}</td></tr>`;
    }).join('');
    const warn = conflicts.length ? `<p class="ih-warn"><strong>⚠</strong> ${plural(conflicts.length, 'N° OPE donne', 'N° OPE donnent')} un consommé différent d'une ligne de l'export à l'autre (la version la plus récente est retenue) : ${conflicts.slice(0, 6).map(c => `<span class="ih-mono">${esc(c.ope)}</span>`).join(', ')}${conflicts.length > 6 ? ', …' : ''}.</p>` : '';
    const table = changes.length ? `<div class="ih-money"><table class="ih-table"><thead><tr><th>N° OPE</th><th>Projet</th><th>Ce qui change dans Lignes_OPE</th></tr></thead><tbody>${rows}</tbody></table></div>${changes.length > MAX ? `<p class="ih-muted">… et ${changes.length - MAX} autres.</p>` : ''}` : '<p class="ih-muted">Aucun montant ne change.</p>';
    const review = (state.cards || []).some(card => card.status === 'A valider' && !card.excluded);
    return boxHtml('montants', 'Montants à écrire dans Lignes_OPE', changes.length ? plural(changes.length, 'ligne OPE', 'lignes OPE') : 'aucun changement', warn + table
      + '<p class="ih-muted">L\'attribué s\'additionne d\'une ligne de financement à l\'autre ; le consommé et le disponible valent pour tout le N° OPE (une seule fois). Colonnes simples créées par l\'outil, défaites avec le lot.</p>', review && changes.length > 0);
  }

  function formHtml() {
    const f = state.form, table = L.SOURCE_TABLE;
    let summary, body;
    if (!f) {
      summary = 'état illisible';
      body = `<p class="ih-warn"><strong>⚠</strong> L'état du formulaire n'a pas pu être lu : ${esc(state.formError)}. Rien n'est créé tant qu'on ne sait pas s'il existe déjà.</p><p><button type="button" class="btn btn-secondary" id="ih-form-reload">Relire</button></p>`;
    } else if (!f.exists) {
      summary = 'à créer';
      body = `<p>Le script UB Invest envoie ses lignes par un formulaire Grist, qui ne sait qu'<strong>ajouter</strong> des lignes à ${table}. L'outil le crée <strong>sans le publier</strong> : tu décides ensuite.</p>
        <p><button type="button" class="btn btn-primary" id="ih-form-create"${state.formBusy ? ' disabled' : ''}>Créer le formulaire</button></p>`;
    } else if (!f.published) {
      summary = 'créé, pas publié';
      body = `<p>Formulaire créé sur la page « ${esc(f.pageName)} » de Grist : <strong>pas publié</strong>, le script ne peut pas encore envoyer.</p>
        <label class="ih-ack"><input type="checkbox" id="ih-form-accept"${state.formAccept ? ' checked' : ''}> Je comprends que le lien du formulaire permet à quiconque l'a d'ajouter des lignes à ${table} (rien d'autre : ni lire, ni modifier), et qu'aucun envoi ne compte avant ma validation.</label>
        <p><button type="button" class="btn btn-primary" id="ih-form-publish"${state.formAccept && !state.formBusy ? '' : ' disabled'}>Publier le formulaire</button></p>`;
    } else {
      summary = 'publié';
      body = `<p><span class="ih-tag is-ok">Publié</span> Le script peut envoyer. Il reste une seule chose à faire à la main, car seul Grist connaît le lien :</p>
        <ol class="ih-steps"><li>Dans Grist, ouvre la page « ${esc(f.pageName)} », puis <strong>Partager</strong> → <strong>Copier le lien</strong> du formulaire.</li>
        <li>Colle-le seul sur une ligne dans <span class="ih-mono">C:\Users\&lt;toi&gt;\.secrets\innovations\grist.txt</span> (jamais dans un message ni dans le code).</li>
        <li>Teste : <span class="ih-mono">py src\envoyer_grist.py --essai</span>, puis <span class="ih-mono">--envoyer</span>.</li></ol>
        <p><button type="button" class="btn btn-secondary" id="ih-form-unpublish"${state.formBusy ? ' disabled' : ''}>Dépublier le formulaire</button> <span class="ih-muted">Dépublié, le lien cesse de fonctionner ; rien ne se perd.</span></p>`;
    }
    return boxHtml('formulaire', 'Formulaire du script', summary, body, false);
  }

  async function formAction(run, message, what) {
    if (state.formBusy) return;
    state.formBusy = true; render();
    try { state.form = await run(); state.result = { kind: 'info', message: typeof message === 'function' ? message(state.form) : message }; }
    catch (err) { state.result = { kind: 'error', message: 'Formulaire du script : ' + CoreUtils.failureReason(err, { what, table: '_grist_Views_section' }) }; }
    state.formBusy = false; state.formAccept = false;
    await readForm(); render();
  }
  const createForm = () => formAction(() => F.create(metaIo(), L.SOURCE_TABLE),
    form => `Formulaire créé (pas publié) sur la page « ${form.pageName} » de Grist${form.renamed === false ? ' : Grist n\'a pas laissé renommer la page' : ''}.`, 'création du formulaire');
  const publishForm = () => { if (state.formAccept && state.form) formAction(() => F.publish(metaIo(), state.form), 'Formulaire publié. Copie son lien dans Grist (Partager) pour le script : voir les étapes dans « Formulaire du script ».', 'publication du formulaire'); };
  const unpublishForm = () => formAction(() => F.unpublish(metaIo(), state.form), 'Formulaire dépublié : son lien ne fonctionne plus.', 'dépublication du formulaire');

  // ----------------------------------------------------------------------------------------------------------
  // Détail des dépenses (export FD02, une fois par mois) : fichier Excel lu ici, comparé à Depenses_OPE, relu, puis écrit avec le journal.
  // ----------------------------------------------------------------------------------------------------------

  let detailInput = null;
  function ensureDetailInput() {
    if (detailInput && detailInput.isConnected) return detailInput;
    const host = $('view-import-historique') || document.body;
    detailInput = document.createElement('input');
    detailInput.type = 'file'; detailInput.id = 'ih-file-fd02'; detailInput.hidden = true;
    detailInput.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    detailInput.addEventListener('change', () => { const file = detailInput.files && detailInput.files[0]; if (file) readDetailFile(file); detailInput.value = ''; });
    host.appendChild(detailInput);
    return detailInput;
  }

  async function readDetailFile(file) {
    state.fd = { phase: 'reading', name: file.name }; state.fdAck = false; state.result = null; render();
    try {
      const book = await global.XlsxReader.read(await file.arrayBuffer());
      const parsed = D.readFd02(book.rows, global.XlsxReader.excelDateToUnix);
      if (parsed.missing.length || parsed.errorCount || !parsed.records.length) { state.fd = { phase: 'error', name: file.name, parsed }; render(); return; }
      // Lecture fraîche : Depenses_OPE a pu changer (import précédent, autre onglet).
      CoreGrist.invalidateTable(L.DETAIL_TABLE);
      const existing = (await readTable(L.DETAIL_TABLE)) || [];
      const opeKeys = new Set(state.ctx ? state.ctx.ligneIdsByKey.keys() : []);
      state.fd = { phase: 'ready', name: file.name, sheet: book.sheetName, parsed, plan: D.planDetail({ records: parsed.records, existing, opeKeys }), existing: existing.length };
    } catch (err) { state.fd = { phase: 'error', name: file.name, message: err.message || String(err) }; }
    render();
  }

  const FD_LIMIT = 150;
  function detailHtml() {
    const f = state.fd, inGrist = state.detail.length;
    const summary = f && f.phase === 'ready' ? `${plural(f.plan.counts.lignes, 'ligne', 'lignes')} à relire` : `${plural(inGrist, 'ligne', 'lignes')} dans ${L.DETAIL_TABLE}`;
    const pick = label => `<button type="button" class="btn ${f && f.phase === 'ready' ? 'btn-secondary' : 'btn-primary'}" id="ih-fd-pick">${label}</button>`;
    let body;
    if (!f) {
      body = `<p>Chaque mois, charge l'export BO FD02 « Consommation détaillée des AE » (fichier Excel). Il est lu ici, dans ton navigateur : rien n'est écrit avant ta relecture. Les lignes de ${L.DETAIL_TABLE} sont retrouvées par leur engagement (exercice, code opération, numéro d'EJ…), jamais supprimées.</p><p>${pick('Choisir le fichier FD02')}</p>`;
    } else if (f.phase === 'reading') body = `<p class="ih-muted" role="status">Lecture de ${esc(f.name)}…</p>`;
    else if (f.phase === 'writing') body = `<p class="ih-muted" role="status">Écriture dans ${L.DETAIL_TABLE}…</p>`;
    else if (f.phase === 'error') {
      const p = f.parsed;
      let why;
      if (f.message) why = esc(f.message);
      else if (p.noHeader) why = 'ce n\'est pas un export FD02 (aucune ligne d\'en-têtes avec « Exercice » et « Code Opération »).';
      else if (p.missing.length) why = `il manque ${plural(p.missing.length, 'colonne', 'colonnes')} : ${p.missing.map(m => '« ' + esc(m) + ' »').join(', ')}${p.unknown.length ? `. Colonnes non reconnues : ${p.unknown.map(esc).join(', ')}` : ''}.`;
      else if (p.errorCount) why = `${plural(p.errorCount, 'valeur illisible', 'valeurs illisibles')}. ${p.errors.map(e => `Ligne ${e.line}, « ${esc(e.column)} » : ${esc(e.value)}`).join(' ; ')}${p.errorCount > p.errors.length ? ' ; …' : ''}`;
      else why = 'aucune ligne avec un code opération.';
      body = `<div class="ih-banner is-error" role="alert"><strong>Fichier non chargé</strong> (${esc(f.name)}) : ${why}</div><p>${pick('Choisir un autre fichier')}</p>`;
    } else {
      const p = f.parsed, c = f.plan.counts;
      const notes = [];
      if (p.donneesAu) notes.push('données au ' + dateFr(new Date(p.donneesAu * 1000).toISOString().slice(0, 10)));
      if (p.exercices.length) notes.push((p.exercices.length > 1 ? 'exercices ' : 'exercice ') + p.exercices.join(', '));
      if (p.ignored) notes.push(plural(p.ignored, 'ligne sans code opération ignorée', 'lignes sans code opération ignorées'));
      if (p.unknown.length) notes.push('colonnes non utilisées : ' + p.unknown.map(esc).join(', '));
      const warnings = [];
      if (f.plan.noOpe.length) warnings.push(`${plural(f.plan.noOpe.length, 'N° OPE du fichier n\'est', 'N° OPE du fichier ne sont')} dans aucune ligne OPE de Grist (leurs dépenses apparaîtront « sans projet ») : ${f.plan.noOpe.slice(0, 6).map(k => `<span class="ih-mono">${esc(k)}</span>`).join(', ')}${f.plan.noOpe.length > 6 ? ', …' : ''}.`);
      if (c.cles) warnings.push(`${plural(c.cles, 'ligne a la même clé qu\'une autre', 'lignes ont la même clé qu\'une autre')} : numérotées dans l'ordre du fichier.`);
      if (c.absentes) warnings.push(`${plural(c.absentes, 'ligne de Grist n\'est plus dans ce fichier', 'lignes de Grist ne sont plus dans ce fichier')} (même exercice) : gardées telles quelles.`);
      const rows = f.plan.changes.slice(0, FD_LIMIT).map(ch => `<tr><td class="ih-mono">${esc(ch.ope)}</td><td>${esc(ch.object)}</td><td class="ih-chgs">${ch.kind === 'add' ? '<span class="ih-tag is-ok">nouvelle ligne</span>' : ch.diffs.map(d => `<span class="ih-chg"><b>${esc(d.label)}</b> ${esc(formatAmount(d.type, d.before))} → ${esc(formatAmount(d.type, d.after))}</span>`).join(' ')}</td></tr>`).join('');
      const table = f.plan.changes.length ? `<div class="ih-money"><table class="ih-table"><thead><tr><th>N° OPE</th><th>Objet de gestion</th><th>Ce qui change dans ${L.DETAIL_TABLE}</th></tr></thead><tbody>${rows}</tbody></table></div>${f.plan.changes.length > FD_LIMIT ? `<p class="ih-muted">… et ${f.plan.changes.length - FD_LIMIT} autres.</p>` : ''}` : '<p class="ih-okline"><strong>✓</strong> Rien à écrire : tout est déjà dans Grist.</p>';
      body = `<p><strong>${esc(f.name)}</strong> <span class="ih-muted">· feuille ${esc(f.sheet || '')}${notes.length ? ' · ' + notes.join(' · ') : ''}</span></p>
        <p>${plural(c.lignes, 'ligne', 'lignes')} : <b class="ih-plus">+${c.ajoutees}</b> ${c.ajoutees > 1 ? 'nouvelles' : 'nouvelle'} · <b>${c.modifiees}</b> ${c.modifiees > 1 ? 'modifiées' : 'modifiée'} · ${c.inchangees} ${c.inchangees > 1 ? 'inchangées' : 'inchangée'}</p>
        ${warnings.map(w => `<p class="ih-warn"><strong>⚠</strong> ${w}</p>`).join('')}${table}
        <div class="ih-actions-bar"><label class="ih-ack"><input type="checkbox" id="ih-fd-ack"${state.fdAck ? ' checked' : ''}${f.plan.actionCount ? '' : ' disabled'}> J'ai relu les changements</label>
        <button type="button" class="btn btn-primary" id="ih-fd-write"${f.plan.actionCount && state.fdAck ? '' : ' disabled'}>Écrire ${plural(f.plan.actionCount, 'ligne', 'lignes')} dans ${L.DETAIL_TABLE}</button>
        ${pick('Choisir un autre fichier')} <button type="button" class="btn btn-secondary" id="ih-fd-cancel">Annuler</button></div>`;
    }
    return boxHtml('detail', 'Import BO : détail des dépenses (export FD02)', summary, body, !!f && f.phase !== 'reading');
  }

  async function writeDetail() {
    const f = state.fd;
    if (!f || f.phase !== 'ready' || !state.fdAck || !f.plan.actionCount) return;
    f.phase = 'writing'; render();
    try {
      // Depenses_OPE est créée par le Dashboard à sa première ouverture : sinon, ici, à l'identique.
      if (!(await CoreGrist.ensureTable(L.DETAIL_TABLE, D.COLUMNS))) await CoreGrist.ensureColumns(L.DETAIL_TABLE, D.COLUMNS);
      await ensureJournal();
      const result = await L.execute(f.plan, io());
      state.result = { kind: 'detail', tab: 'bo', value: result, plan: f.plan, name: f.name };
      if (!result.error) {
        const seconds = Math.floor(Date.now() / 1000), c = f.plan.counts;
        const previous = state.lots.filter(row => row.Type === 'Détail' && row.Statut === 'Valide').map(row => row.Lot).sort().pop() || '';
        const fields = Object.assign(L.newLotFields({ lot: L.lotIdOf(new Date()), type: 'Détail', source: 'Fichier', fichier: f.name, recuLe: seconds, lignes: c.lignes }),
          { Statut: 'Valide', Donnees_au: f.parsed.donneesAu || null, Compare_a: previous, Ajoutees: c.ajoutees, Modifiees: c.modifiees, Inchangees: c.inchangees, Absentes: c.absentes, Anomalies: 0, Valide_le: seconds, Lot_journal: result.lot });
        try { await CoreGrist.gristInstance.docApi.applyUserActions([['AddRecord', L.LOTS_TABLE, null, fields]]); CoreGrist.invalidateTable(L.LOTS_TABLE); }
        catch (err) { result.lotError = CoreUtils.failureReason(err, { what: 'enregistrement du lot', table: L.LOTS_TABLE }); }
      }
    } catch (err) { state.result = { kind: 'error', tab: 'bo', message: 'Écriture du détail impossible : ' + CoreUtils.failureReason(err, { what: 'écriture dans ' + L.DETAIL_TABLE, table: L.DETAIL_TABLE }) }; }
    state.fd = null; state.fdAck = false;
    CoreGrist.invalidateTable(L.DETAIL_TABLE); CoreGrist.invalidateTable(L.JOURNAL_TABLE);
    await load();
    notifyChanged();
  }

  // Un lot est du BO quand sa ligne Import_Lots est de type « Détail » (fichier FD02) ; tout le reste est de l'import UB Invest.
  const boLotIds = () => new Set(state.lots.filter(row => row.Type === 'Détail').flatMap(row => [row.Lot_journal, row.Lot]).filter(Boolean));   // lot du journal (Lot_journal) ou du fichier
  function lotsHtml(tab) {
    const bo = boLotIds();
    const lots = L.summarizeLots(state.journal).filter(lot => bo.has(lot.lot) === (tab === 'bo'));
    if (!lots.length) return '';
    const undo = state.undo;
    const rows = lots.map(lot => {
      const done = lot.annules === lot.total;
      let extra = '';
      if (undo && undo.lot === lot.lot) {
        extra = `<div class="ih-undo"><p>${undo.kind === 'chargement' ? plural(undo.plan.actions.length, 'ligne sera retirée de ' + L.SOURCE_TABLE, 'lignes seront retirées de ' + L.SOURCE_TABLE) + '. Les projets déjà écrits à partir de ce fichier restent : annule d\'abord leur lot.' : plural(undo.plan.actions.length, 'action sera défaite', 'actions seront défaites')}${undo.plan.skipped.length ? `, ${plural(undo.plan.skipped.length, 'ligne laissée', 'lignes laissées')} (${esc(Array.from(new Set(undo.plan.skipped.map(s => s.why))).join(' ; '))})` : ''}.</p>
          <button type="button" class="btn btn-primary" data-ih-undo-confirm="${esc(lot.lot)}"${undo.plan.actions.length ? '' : ' disabled'}>Confirmer l'annulation</button> <button type="button" class="btn btn-secondary" data-ih-undo-cancel>Garder</button></div>`;
      }
      const label = lot.kind === 'chargement'
        ? `fichier ${esc((lot.info && lot.info.fichier) || '')}, ${plural((lot.info && lot.info.lignes) || 0, 'ligne', 'lignes')}`
        : `${plural(lot.ajouts, 'ajout', 'ajouts')}, ${plural(lot.modifs, 'modification', 'modifications')}${lot.annules ? `, ${lot.annules} annulé${lot.annules > 1 ? 's' : ''}` : ''}`;
      return `<li><span class="ih-mono">${esc(lot.lot)}</span> <span class="ih-muted">· ${label}</span>
        ${done ? '<span class="ih-tag is-ok">annulé</span>' : `<button type="button" class="btn btn-secondary" data-ih-undo="${esc(lot.lot)}">${lot.kind === 'chargement' ? 'Annuler ce chargement' : 'Annuler ce lot'}</button>`}${extra}</li>`;
    }).join('');
    return boxHtml('lots', tab === 'bo' ? 'Lots BO écrits' : 'Lots UB Invest écrits et fichiers chargés', plural(lots.length, 'lot', 'lots'), `<ul class="ih-lots">${rows}</ul>`, !!undo);
  }

  function resultHtml() {
    const r = state.result;
    if (!r || (r.tab || 'ubinvest') !== state.tab) return '';   // le résultat d'un import ne s'affiche pas dans l'onglet de l'autre
    if (r.kind === 'written') {
      const e = r.value;
      const n = e.ajouts.Projets.length + e.ajouts.Lignes_OPE.length + e.modifs.Projets.length + e.modifs.Lignes_OPE.length;
      if (e.error) return `<div class="ih-banner is-error" role="alert"><strong>Écriture interrompue.</strong> ${esc(CoreUtils.failureReason(e.error, { what: 'écriture dans ' + L.SOURCE_TABLE, table: L.SOURCE_TABLE }))} ${n ? `${plural(n, 'écriture est passée', 'écritures sont passées')} avant l'arrêt${e.journalError ? ', mais le journal n\'a pas pu être enregistré : le lot ne sera pas annulable' : ` (lot ${esc(e.lot)}, annulable ci-dessous)`}.` : 'Rien n\'a été écrit.'}</div>`;
      return `<div class="ih-banner is-ok" role="status"><strong>✓ Écrit.</strong> Lot ${esc(e.lot)} : ${plural(e.ajouts.Projets.length, 'projet créé', 'projets créés')}, ${plural(e.modifs.Projets.length, 'projet complété', 'projets complétés')}, ${plural(e.ajouts.Lignes_OPE.length, 'ligne OPE créée', 'lignes OPE créées')}, ${plural(e.modifs.Lignes_OPE.length, 'ligne OPE complétée', 'lignes OPE complétées')}. Journal enregistré.${e.colonnesCreees && e.colonnesCreees.length ? ` ${plural(e.colonnesCreees.length, 'colonne créée', 'colonnes créées')} dans Projets pour ${e.rangMax > 2 ? `les OPE 2 à ${e.rangMax}` : 'l\'OPE 2'}.` : ''}${e.colonnesMontants && e.colonnesMontants.length ? ` ${plural(e.colonnesMontants.length, 'colonne de montants créée', 'colonnes de montants créées')} dans Lignes_OPE.` : ''}${e.lotError ? ` <b>Le lot n'a pas pu être marqué « Valide » dans ${L.LOTS_TABLE} :</b> ${esc(e.lotError)}.` : ''}</div>`;
    }
    if (r.kind === 'detail') {
      const e = r.value, n = (e.ajouts[L.DETAIL_TABLE] || []).length, m = (e.modifs[L.DETAIL_TABLE] || []).length;
      if (e.error) return `<div class="ih-banner is-error" role="alert"><strong>Écriture interrompue.</strong> ${esc(CoreUtils.failureReason(e.error, { what: 'écriture dans ' + L.DETAIL_TABLE, table: L.DETAIL_TABLE }))} ${n + m ? `${plural(n + m, 'ligne est passée', 'lignes sont passées')} avant l'arrêt${e.journalError ? ', mais le journal n\'a pas pu être enregistré : le lot ne sera pas annulable' : ` (lot ${esc(e.lot)}, annulable ci-dessous)`}.` : 'Rien n\'a été écrit.'}</div>`;
      return `<div class="ih-banner is-ok" role="status"><strong>✓ Écrit.</strong> Lot ${esc(e.lot)} : ${plural(n, 'ligne ajoutée', 'lignes ajoutées')}, ${plural(m, 'ligne modifiée', 'lignes modifiées')} dans ${L.DETAIL_TABLE} (${esc(r.name)}). Journal enregistré, annulable ci-dessous.${e.lotError ? ` <b>Le lot n'a pas pu être enregistré dans ${L.LOTS_TABLE} :</b> ${esc(e.lotError)}.` : ''}</div>`;
    }
    if (r.kind === 'loaded') return `<div class="ih-banner is-ok" role="status"><strong>✓ Fichier chargé.</strong> ${plural(r.count, 'ligne ajoutée', 'lignes ajoutées')} à ${L.SOURCE_TABLE} (lot ${esc(r.lotId)} « A valider », annulable plus bas).${r.lotError ? ` <b>Le lot n'a pas pu être enregistré dans ${L.LOTS_TABLE} :</b> ${esc(r.lotError)}.` : ''} Relis le tableau, corrige les anomalies, puis écris.</div>`;
    if (r.kind === 'undone') return `<div class="ih-banner is-ok" role="status"><strong>${r.unit ? '✓ Chargement annulé.' : '✓ Lot annulé.'}</strong> ${r.unit ? plural(r.done, 'ligne retirée', 'lignes retirées') : plural(r.done, 'action défaite', 'actions défaites')}${r.skipped ? `, ${plural(r.skipped, 'ligne laissée', 'lignes laissées')} car modifiée${r.skipped > 1 ? 's' : ''} depuis` : ''}.</div>`;
    if (r.kind === 'info') return `<div class="ih-banner is-ok" role="status">${esc(r.message)}</div>`;
    return `<div class="ih-banner is-error" role="alert">${esc(r.message)}</div>`;
  }

  function preparedHtml() {
    return state.prepared.length ? `<div class="ih-prepared" role="status"><strong>Créé dans Grist :</strong> ${state.prepared.map(esc).join(', ')}.</div>` : '';
  }

  // ----------------------------------------------------------------------------------------------------------
  // Chargement du fichier Excel (lu dans le navigateur, ajouté à Import_Financements)
  // ----------------------------------------------------------------------------------------------------------

  function uploadHtml() {
    const u = state.upload;
    if (!u) return '';
    const again = '<button type="button" class="btn btn-secondary" id="ih-pick">Choisir un autre fichier</button>';
    if (u.phase === 'reading') return `<p class="ih-muted" role="status">Lecture de ${esc(u.name)}…</p>`;
    if (u.phase === 'writing') return `<p class="ih-muted" role="status">Chargement de ${esc(u.name)} dans Grist…</p>`;
    if (u.phase === 'error') {
      let why;
      if (u.message) why = esc(u.message);
      else if (u.missing && u.missing.length) why = `il manque ${plural(u.missing.length, 'colonne', 'colonnes')} : ${u.missing.map(m => '« ' + esc(m) + ' »').join(', ')}.`;
      else if (u.errorCount) why = `${plural(u.errorCount, 'valeur illisible', 'valeurs illisibles')}. ${u.errors.map(e => `Ligne ${e.line}, « ${esc(e.column)} » : ${esc(e.value)}`).join(' ; ')}${u.errorCount > u.errors.length ? ' ; …' : ''}`;
      else why = 'aucune ligne avec un N° OPE.';
      return `<div class="ih-banner is-error" role="alert"><strong>Fichier non chargé</strong> (${esc(u.name)}) : ${why}<p>${again}</p></div>`;
    }
    const notes = [];
    if (u.ignored) notes.push(`${plural(u.ignored, 'ligne sans N° OPE ignorée', 'lignes sans N° OPE ignorées')}`);
    if (u.unknown && u.unknown.length) notes.push(`colonnes non utilisées : ${u.unknown.map(esc).join(', ')}`);
    if (state.total) notes.push(`la table contient déjà ${plural(state.total, 'ligne', 'lignes')} : les nouvelles versions remplacent les anciennes`);
    return `<div class="ih-upload"><p><strong>${esc(u.name)}</strong> <span class="ih-muted">· feuille ${esc(u.sheet)}</span></p>
      <p>${plural(u.records.length, 'ligne', 'lignes')} · ${plural(u.projets, 'projet', 'projets')} · ${plural(u.opes, 'N° OPE', 'N° OPE')}${notes.length ? `<br><span class="ih-muted">${notes.join(' · ')}</span>` : ''}</p>
      <p><button type="button" class="btn btn-primary" id="ih-upload-confirm">Charger ces lignes dans Grist</button> <button type="button" class="btn btn-secondary" id="ih-upload-cancel">Annuler</button></p></div>`;
  }

  let fileInput = null;
  function ensureFileInput() {
    if (fileInput && fileInput.isConnected) return fileInput;
    const host = $('view-import-historique') || document.body;
    fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.id = 'ih-file'; fileInput.hidden = true;
    fileInput.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    fileInput.addEventListener('change', () => { const file = fileInput.files && fileInput.files[0]; if (file) readFile(file); fileInput.value = ''; });
    host.appendChild(fileInput);
    return fileInput;
  }

  async function readFile(file) {
    state.upload = { phase: 'reading', name: file.name }; state.result = null; render();
    try {
      const book = await global.XlsxReader.read(await file.arrayBuffer(), 'Reporting');
      const parsed = L.readExport(book.rows, new Date(), global.XlsxReader.excelDateToUnix);
      const failed = parsed.missing.length || parsed.errorCount || !parsed.records.length;
      state.upload = Object.assign({ phase: failed ? 'error' : 'ready', name: file.name, sheet: book.sheetName }, parsed);
    } catch (err) { state.upload = { phase: 'error', name: file.name, message: err.message || String(err) }; }
    render();
  }

  async function loadFile() {
    const u = state.upload;
    if (!u || u.phase !== 'ready') return;
    u.phase = 'writing'; render();
    const docApi = CoreGrist.gristInstance.docApi;
    let added = 0;
    try {
      await prepare();
      const when = new Date();
      const lot = 'CHARGEMENT-' + when.toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const journal = await docApi.applyUserActions([['AddRecord', L.JOURNAL_TABLE, null, { Lot: lot, Horodatage: when.toISOString(), Table_modifiee: L.SOURCE_TABLE, Ligne: 0, Operation: 'chargement', Avant: '', Annule: false,
        Apres: JSON.stringify({ exporte_le: u.exporteLe, fichier: u.name, feuille: u.sheet, lignes: u.records.length, lot: u.lot }) }]]);
      try {
        for (let i = 0; i < u.records.length; i += L.CHUNK) {
          await docApi.applyUserActions(u.records.slice(i, i + L.CHUNK).map(record => ['AddRecord', L.SOURCE_TABLE, null, record]));
          added += Math.min(L.CHUNK, u.records.length - i);
        }
      } catch (err) {
        if (!added) { try { await docApi.applyUserActions([['UpdateRecord', L.JOURNAL_TABLE, Number(journal.retValues[0]), { Annule: true }]]); } catch (ignored) { /* le lot reste listé, vide */ } }
        if (!added) throw err;
        throw new Error(`${plural(added, 'ligne est passée', 'lignes sont passées')} avant l\'arrêt (chargement annulable plus bas) : ${CoreUtils.failureReason(err, { what: 'chargement du fichier dans ' + L.SOURCE_TABLE, table: L.SOURCE_TABLE })}`);
      }
      let lotError = '';
      try { await docApi.applyUserActions([['AddRecord', L.LOTS_TABLE, null, L.newLotFields({ lot: u.lot, type: L.LOT_TYPE_ONESHOT, source: 'Fichier', fichier: u.name, recuLe: u.exporteLe, lignes: u.records.length })]]); }
      catch (err) { lotError = CoreUtils.failureReason(err, { what: 'enregistrement du lot', table: L.LOTS_TABLE }); }
      state.result = { kind: 'loaded', count: added, lot, lotId: u.lot, lotError };
      state.upload = null;
    } catch (err) {
      state.result = { kind: 'error', message: 'Chargement impossible : ' + (added ? err.message : CoreUtils.failureReason(err, { what: 'chargement du fichier dans ' + L.SOURCE_TABLE, table: L.SOURCE_TABLE })) };
      state.upload = null;
    }
    CoreGrist.invalidateTable(L.SOURCE_TABLE); CoreGrist.invalidateTable(L.JOURNAL_TABLE); CoreGrist.invalidateTable(L.LOTS_TABLE);
    await load();
  }

  function summaryHtml() {
    const issues = state.issues.length;
    const d = state.totals && state.totals.available ? (state.totals.gaps ? `${plural(state.totals.gaps, 'écart', 'écarts')}` : 'totaux concordants') : 'détail BO absent';
    return `<div class="ih-info"><p class="ih-summary"><strong>${state.lines.length}</strong> lignes de financement (dernière version, sur ${state.total} reçues${state.setAside ? `, ${state.setAside} d'envois mis de côté` : ''}${state.ignored ? `, ${state.ignored} sans N° OPE ignorées` : ''}) · <strong>${state.entries.length}</strong> ${state.entries.length > 1 ? 'projets' : 'projet'} · <strong>${state.entries.reduce((n, e) => n + e.opes.length, 0)}</strong> N° OPE · ${issues ? `<span class="ih-warn-inline">${plural(issues, 'écart', 'écarts')} dans l'export</span>` : 'export cohérent'} · ${d} · <button type="button" class="ih-link" id="ih-pick">Charger un autre fichier</button>${draftHtml()}</p>${legendHtml()}</div>`;
  }

  function render() {
    const root = $('ih-root');
    if (!root) return;
    if (state.phase === 'loading' || state.phase === 'idle') { root.innerHTML = '<p class="ih-empty" role="status">Lecture du journal et des projets…</p>'; return; }
    if (state.phase === 'missing') {
      root.innerHTML = `${plainHeaderHtml()}
        <div class="ih-empty"><p><strong>La table ${L.SOURCE_TABLE} n'existe pas encore dans ce document.</strong></p><p class="ih-muted">Elle est créée une fois côté Grist (colonnes de l'export, puis un formulaire publié) : voir le dossier export-financier. Quand elle contient l'export, rouvre cette page.</p><button type="button" class="btn btn-secondary" id="ih-reload">Relire</button></div>`;
      return;
    }
    if (state.phase === 'error') {
      root.innerHTML = `${plainHeaderHtml()}<div class="ih-empty ih-banner is-error" role="alert">${esc(state.error)}</div>`;
      return;
    }
    if (!state.total) {
      const busy = state.upload && state.upload.phase !== 'error';
      if (state.tab === 'bo') { root.innerHTML = headerHtml() + resultHtml() + detailHtml() + lotsHtml('bo'); return; }
      root.innerHTML = `${headerHtml()}${preparedHtml()}${resultHtml()}${uploadHtml()}${formHtml()}
        ${busy ? '' : `<div class="ih-empty"><p><strong>Charge l'export Excel</strong></p><p class="ih-muted">Choisis le fichier d'export de tous les projets. Il est lu ici, dans ton navigateur, et ses lignes sont ajoutées à Grist. Tu verras ensuite un tableau, une ligne par projet, pour tout vérifier avant d'écrire.</p><button type="button" class="btn btn-primary" id="ih-pick">Choisir le fichier Excel</button><p class="ih-muted">Les lignes arrivent autrement (formulaire) ? <button type="button" class="ih-link" id="ih-reload">Relire</button></p></div>`}${lotsHtml()}`;
      return;
    }
    if (state.tab === 'bo') { root.innerHTML = headerHtml() + resultHtml() + detailHtml() + lotsHtml('bo'); return; }
    const t = state.table;
    const grid = root.querySelector('.ih-grid'), scrollLeft = grid ? grid.scrollLeft : 0, scrollTop = grid ? grid.scrollTop : 0;
    const blocked = t.rows.filter(r => r.match.status === 'blocked').length;
    root.innerHTML = barHtml() + preparedHtml() + uploadHtml() + resultHtml() + summaryHtml() + envoisHtml() + montantsHtml()
      + boxHtml('checks', 'Contrôles de l\'export', state.issues.length ? plural(state.issues.length, 'écart', 'écarts') + (blocked ? ` · ${plural(blocked, 'projet écarté', 'projets écartés')}` : '') : '7 sur 7 réussis', checksHtml(), false)
      + boxHtml('totals', 'Contrôle des totaux : UB Invest / BO', state.totals && state.totals.available ? (state.totals.gaps ? plural(state.totals.gaps, 'écart', 'écarts') : 'concordants') : 'détail BO absent', totalsHtml(), state.totals && state.totals.gaps > 0)
      + formHtml() + tableHtml() + actionsHtml() + lotsHtml('ubinvest');
    const newGrid = root.querySelector('.ih-grid');
    if (newGrid) { newGrid.scrollLeft = scrollLeft; newGrid.scrollTop = scrollTop; }
    const editor = root.querySelector('.editing .ih-in');
    if (editor) {
      editor.focus();
      if (editor.tagName === 'SELECT' && typeof editor.showPicker === 'function') { try { editor.showPicker(); } catch (err) { /* le navigateur refuse sans geste de l'utilisateur */ } }
    } else if (state._refocus) { const el = $(state._refocus); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (err) { /* champ sans sélection */ } } }
    state._refocus = null;
  }

  // ----------------------------------------------------------------------------------------------------------
  // Actions
  // ----------------------------------------------------------------------------------------------------------

  async function ensureJournal() {
    await CoreGrist.ensureTable(L.JOURNAL_TABLE, L.JOURNAL_COLUMNS);
    await CoreGrist.ensureColumns(L.JOURNAL_TABLE, L.JOURNAL_COLUMNS);
  }
  const io = () => ({
    apply: async actions => (await CoreGrist.gristInstance.docApi.applyUserActions(actions)).retValues,
    addJournal: rows => CoreGrist.gristInstance.docApi.applyUserActions(rows.map(row => ['AddRecord', L.JOURNAL_TABLE, null, row])),
    now: () => new Date()
  });
  function notifyChanged() { try { global.dispatchEvent(new Event('project-created')); } catch (err) { /* aucun écouteur */ } }

  // Écriture réussie : les lots du tableau passent en « Valide » (photo du contrôle, lien vers le lot du journal annulable).
  async function validateLots(table, result) {
    const lots = Array.from(new Set(state.lines.map(line => line.Lot).filter(Boolean)));
    // Lignes disparues : dans le dernier envoi validé, pas dans le plus récent (elles restent comptées, avec leur ancienne version).
    const reference = K.referenceLot(state.lots), newest = lots.slice().sort().pop();
    const gone = reference && newest && !lots.includes(reference) ? K.compareLots(K.rowsOfLot(state.rows, newest), K.rowsOfLot(state.rows, reference)).gone.length : 0;
    const actions = L.planLotValidation(state.lots, { lots, counts: { add: table.add, mod: table.mod, same: table.same, left: table.left, gone }, journalLot: result.lot, now: new Date() });
    if (actions.length) await CoreGrist.gristInstance.docApi.applyUserActions(actions);
    CoreGrist.invalidateTable(L.LOTS_TABLE);
  }

  // OPE 2 à 4 (24/11/2026) : leurs colonnes de Projets sont créées par le widget, comme à l'enregistrement d'un projet à plusieurs OPE.
  // Rend la liste des colonnes créées (vide quand le plan n'écrit que l'OPE 1 ou que les colonnes existent déjà).
  async function ensureSlotColumns(plan) {
    if (!plan.neededRank || plan.neededRank < 2 || !global.CoreOpes) return [];
    const describe = col => (CoreGrist.getColumnDescription && CoreGrist.getColumnDescription('Projets', col)) || '';
    const missing = global.CoreOpes.missingColumns(CoreGrist.knownColumns('Projets'), plan.neededRank, describe);
    const which = plan.neededRank > 2 ? `des OPE 2 à ${plan.neededRank}` : 'de l\'OPE 2';
    if (missing.length) {
      try { await CoreGrist.ensureColumns('Projets', missing); }
      catch (error) {
        throw Object.assign(new Error(`les colonnes ${which} n'ont pas pu être créées dans la table Projets (${error.message}). Rien n'a été écrit.`),
          { cause: error, gristAccess: { op: 'write', table: 'Projets', columns: missing.map(col => col.id), what: `création des colonnes ${which} dans Projets` } });
      }
    }
    // Totaux de Projets (formules Grist) additionnés sur les OPE 2 à 4 existantes (js/core/ope-totals.js) ; au mieux, ne bloque jamais l'import.
    if (global.CoreOpeTotals) await global.CoreOpeTotals.adaptAndNotify(plan.neededRank);
    return missing.map(col => col.id);
  }

  // Montants (24/11/2026) : leurs colonnes de Lignes_OPE sont créées par le widget juste avant d'écrire (colonnes simples, aucune formule).
  async function ensureAmountColumns(plan) {
    if (!plan.neededAmounts) return [];
    const known = CoreGrist.knownColumns('Lignes_OPE');
    const missing = L.AMOUNT_COLUMNS.filter(col => !known || !known.has(col.id));
    if (!missing.length) return [];
    try { await CoreGrist.ensureColumns('Lignes_OPE', missing); }
    catch (error) {
      throw Object.assign(new Error(`les colonnes des montants n'ont pas pu être créées dans la table Lignes_OPE (${error.message}). Rien n'a été écrit.`),
        { cause: error, gristAccess: { op: 'write', table: 'Lignes_OPE', columns: missing.map(col => col.id), what: 'création des colonnes de montants dans Lignes_OPE' } });
    }
    return missing.map(col => col.id);
  }

  async function write() {
    const t = state.table;
    if (state.writing || !t || t.left || !t.plan.actionCount) return;
    if (Date.now() - state.readAt > TABLE_MAX_AGE_MS) {
      // Grist a pu changer depuis la lecture : on relit, on garde les corrections, et on demande une nouvelle relecture avant d'écrire.
      try { state.rows = await CoreGrist.getTable(L.SOURCE_TABLE); await readGrist(); analyse(); state.result = { kind: 'error', message: 'Le tableau datait de plus de 10 minutes : il vient d\'être relu depuis Grist. Vérifie-le, puis écris.' }; }
      catch (err) { state.result = { kind: 'error', message: 'Relecture de Grist impossible : ' + CoreUtils.failureReason(err, { op: 'read', table: L.SOURCE_TABLE }) }; }
      state.ack = false; render();
      return;
    }
    state.writing = true;
    const writeBtn = $('ih-write'); if (writeBtn) { writeBtn.disabled = true; writeBtn.textContent = 'Écriture en cours…'; }
    let written = false;
    try {
      await ensureJournal();
      const createdColumns = await ensureSlotColumns(t.plan);
      const amountColumns = await ensureAmountColumns(t.plan);
      const result = await L.execute(t.plan, io());
      result.colonnesCreees = createdColumns; result.rangMax = t.plan.neededRank; result.colonnesMontants = amountColumns;
      state.result = { kind: 'written', value: result };
      written = !result.error;
      if (written) {
        try { await validateLots(t, result); }
        catch (err) { result.lotError = CoreUtils.failureReason(err, { what: 'validation des lots', table: L.LOTS_TABLE }); }
      }
    } catch (err) { state.result = { kind: 'error', message: 'Écriture impossible : ' + CoreUtils.failureReason(err, { what: 'écriture des corrections dans ' + L.SOURCE_TABLE, table: L.SOURCE_TABLE }) }; }
    state.writing = false; state.ack = false;
    // Tout est écrit : un « nouveau projet » forcé ferait un doublon, on l'oublie. Les autres choix et les corrections restent,
    // sinon le tableau relu re-signalerait les mêmes anomalies sur des projets déjà traités.
    if (written) state.decisions = new Map(Array.from(state.decisions).filter(([, d]) => d.mode !== 'new'));
    CoreGrist.invalidateTable(L.JOURNAL_TABLE);
    await load();
    notifyChanged();
  }

  // Refuser un envoi (il ne compte plus ni pour le tableau ni pour le Dashboard) ou le rétablir : seul Import_Lots change.
  async function changeLotStatus(actions, message) {
    if (!actions.length) return;
    try {
      await CoreGrist.gristInstance.docApi.applyUserActions(actions);
      state.result = { kind: 'info', message };
    } catch (err) { state.result = { kind: 'error', message: 'Changement impossible : ' + CoreUtils.failureReason(err, { what: 'changement de statut d\'un envoi', table: L.LOTS_TABLE }) }; }
    CoreGrist.invalidateTable(L.LOTS_TABLE);
    state.ack = false;
    await load();
  }
  const refuseLot = lot => changeLotStatus(K.planRefusal(state.lots, lot), `Envoi du ${whenFr(K.lotTime(lot))} refusé : il ne compte plus. « Rétablir » le remet à valider.`);
  const restoreLot = lot => changeLotStatus(K.planRestore(state.lots, lot), `Envoi du ${whenFr(K.lotTime(lot))} rétabli : il est de nouveau à valider.`);

  async function startUndo(lot) {
    await readGrist();
    const isLoad = state.journal.some(row => row.Lot === lot && row.Operation === 'chargement');
    if (isLoad) { try { state.rows = await CoreGrist.getTable(L.SOURCE_TABLE); } catch (err) { /* lecture déjà faite plus haut */ } }
    state.undo = { lot, kind: isLoad ? 'chargement' : 'ecriture', plan: isLoad ? L.planUnload(state.journal, lot, state.rows) : L.planUndo(state.journal, lot, state.tables) };
    render();
  }
  // Le lot du fichier annulé (ou les lots dont l'écriture est annulée) passent en « Annule » dans Import_Lots. Au mieux : l'annulation reste faite.
  async function cancelLots(undo) {
    try {
      let args;
      if (undo.kind === 'chargement') {
        const row = state.journal.find(r => r.Lot === undo.lot && r.Operation === 'chargement');
        let info = {}; try { info = JSON.parse((row && row.Apres) || '{}'); } catch (err) { info = {}; }
        args = { lot: info.lot, note: 'Chargement annulé' };
      } else args = { journalLot: undo.lot, note: 'Écritures annulées' };
      const actions = L.planLotCancel(state.lots, args);
      if (actions.length) await CoreGrist.gristInstance.docApi.applyUserActions(actions);
      CoreGrist.invalidateTable(L.LOTS_TABLE);
    } catch (err) { console.warn('Import historique : lot non marqué annulé :', err); }
  }
  async function confirmUndo(lot) {
    const undo = state.undo;
    if (!undo || undo.lot !== lot || !undo.plan.actions.length) return;
    try {
      const actions = undo.plan.actions.concat(undo.plan.done.map(id => ['UpdateRecord', L.JOURNAL_TABLE, Number(id), { Annule: true }]));
      for (let i = 0; i < actions.length; i += L.CHUNK) await CoreGrist.gristInstance.docApi.applyUserActions(actions.slice(i, i + L.CHUNK));
      await cancelLots(undo);
      state.result = { kind: 'undone', tab: boLotIds().has(lot) ? 'bo' : 'ubinvest', done: undo.plan.actions.length, skipped: undo.plan.skipped.length, unit: undo.kind === 'chargement' };
    } catch (err) { state.result = { kind: 'error', message: 'Annulation impossible : ' + CoreUtils.failureReason(err, { what: 'annulation d\'un lot', table: L.SOURCE_TABLE }) }; }
    state.undo = null;
    await load();
    notifyChanged();
  }

  // Une valeur choisie ou saisie dans l'éditeur ouvert. Renvoie false quand le choix n'est pas fini (l'éditeur reste ouvert).
  function commit(editor) {
    // Champ date jj/mm/aaaa (DateInput) : la valeur échangée reste l'ISO ; une saisie fausse laisse l'éditeur ouvert.
    const isDate = editor.hasAttribute('data-dp');
    const type = editor.getAttribute('data-ih-type'), id = editor.getAttribute('data-ih-in'), value = isDate ? DateInput.iso(editor) : editor.value;
    if (value === null) return false;
    if (type === 'status') {
      const key = editor.getAttribute('data-ih-row');
      if (value === '') return false;
      if (value === 'new') setDecision(key, { mode: 'new', projectId: null });
      else if (value === 'skip') setDecision(key, { mode: 'skip' });
      else if (value === 'other') { setDecision(key, { mode: 'other', projectId: null }); return false; } // le choix du projet suit
      else if (value.startsWith('p:')) setDecision(key, { mode: 'project', projectId: Number(value.slice(2)), confirmed: true });
    } else if (type === 'other') {
      if (!value) return false;
      setDecision(editor.getAttribute('data-ih-row'), { mode: 'project', projectId: Number(value), confirmed: true });
    } else if (type === 'conflict') {
      if (value === '') return false;
      if (value === 'skip') setDecision(editor.getAttribute('data-ih-row'), { mode: 'skip' });
      else state.edits.set(id, 'keep'); // l'identifiant du conflit est <projet>|c|<N° OPE>
    } else {
      if (value === '' && editor.tagName === 'SELECT') return false;
      if (value === '') state.edits.delete(id); // champ vidé : retour à la valeur de l'export
      else L.applyChoice(state.table, state.edits, id, value, state.applyAll);
    }
    state.ack = false;
    return true;
  }

  function onChange(event) {
    const target = event.target;
    if (target.matches('[data-ih-in]')) {
      if (target.hasAttribute('data-dp') && DateInput.iso(target) === null) return; // saisie à moitié tapée : le champ est signalé, on ne le réaffiche pas
      if (commit(target)) state.editing = null;
      recompute(); render();
    } else if (target.matches('[data-ih-all]')) {
      state.applyAll = target.checked;
    } else if (target.id === 'ih-fd-ack') {
      state.fdAck = target.checked;
      const write = $('ih-fd-write'); if (write) write.disabled = !target.checked || !state.fd || !state.fd.plan.actionCount;
    } else if (target.id === 'ih-form-accept') {
      state.formAccept = target.checked;
      const publish = $('ih-form-publish'); if (publish) publish.disabled = !target.checked || state.formBusy;
    } else if (target.id === 'ih-ack') {
      state.ack = target.checked;
      const btn = $('ih-write');
      if (btn) btn.disabled = !target.checked || !!state.table.left || !state.table.plan.actionCount;
    }
  }

  function onInput(event) {
    if (event.target.id === 'ih-search') { state.search = event.target.value; state._refocus = 'ih-search'; render(); }
  }

  function goToNextAnomaly() {
    const root = $('ih-root');
    const bad = root ? Array.from(root.querySelectorAll('.ih-grid .c-bad')) : [];
    if (!bad.length) return;
    state.nextBad = state.nextBad % bad.length;
    const target = bad[state.nextBad++];
    if (target.scrollIntoView) target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    target.classList.add('flash'); setTimeout(() => target.classList.remove('flash'), 1400);
  }

  function onClick(event) {
    const target = event.target;
    if (target.closest('select, input, label, [data-dp-open]')) return;
    const cell = target.closest('[data-ih-cell]');
    if (cell) {
      const id = cell.getAttribute('data-ih-cell');
      state.editing = state.editing === id ? null : id;
      render();
      return;
    }
    const button = target.closest('button, summary');
    if (!button) return;
    if (button.id === 'ih-back') { global.SuiviApp?.showView('view-projects'); $('btn-projects')?.classList.add('active'); }
    else if (button.id === 'ih-reload') load();
    else if (button.id === 'ih-pick') ensureFileInput().click();
    else if (button.id === 'ih-draft-clear') { state.draft.confirm = true; render(); }
    else if (button.id === 'ih-draft-clear-cancel') { state.draft.confirm = false; render(); }
    else if (button.id === 'ih-draft-clear-confirm') clearDraft();
    else if (button.id === 'ih-upload-confirm') loadFile();
    else if (button.id === 'ih-upload-cancel') { state.upload = null; render(); }
    else if (button.id === 'ih-next') goToNextAnomaly();
    else if (button.id === 'ih-write') write();
    else if (button.hasAttribute('data-ih-tab')) { state.tab = button.getAttribute('data-ih-tab') === 'bo' ? 'bo' : 'ubinvest'; state.editing = null; state.undo = null; render(); }
    else if (button.hasAttribute('data-ih-filter')) { const f = button.getAttribute('data-ih-filter'); state.filter = state.filter === f ? 'all' : f; state.editing = null; render(); }
    else if (button.id === 'ih-fd-pick') ensureDetailInput().click();
    else if (button.id === 'ih-fd-write') writeDetail();
    else if (button.id === 'ih-fd-cancel') { state.fd = null; state.fdAck = false; render(); }
    else if (button.id === 'ih-form-create') createForm();
    else if (button.id === 'ih-form-publish') publishForm();
    else if (button.id === 'ih-form-unpublish') unpublishForm();
    else if (button.id === 'ih-form-reload') { readForm().then(render); }
    else if (button.hasAttribute('data-ih-refuse')) refuseLot(button.getAttribute('data-ih-refuse'));
    else if (button.hasAttribute('data-ih-restore')) restoreLot(button.getAttribute('data-ih-restore'));
    else if (button.hasAttribute('data-ih-undo')) startUndo(button.getAttribute('data-ih-undo'));
    else if (button.hasAttribute('data-ih-undo-confirm')) confirmUndo(button.getAttribute('data-ih-undo-confirm'));
    else if (button.hasAttribute('data-ih-undo-cancel')) { state.undo = null; render(); }
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && state.editing) { state.editing = null; render(); }
    else if (event.key === 'Enter' && event.target.matches && event.target.matches('[data-ih-cell]')) event.target.click();
  }

  function onToggle(event) {
    const box = event.target.closest && event.target.closest('[data-ih-box]');
    if (box) { const id = box.getAttribute('data-ih-box'); if (box.open) state.openBoxes.add(id); else state.openBoxes.delete(id); }
  }

  let wired = false;
  function wire() {
    const root = $('ih-root');
    if (!root || wired === root) return;
    wired = root;
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKeydown);
    root.addEventListener('toggle', onToggle, true);
  }

  async function open() {
    wire(); ensureFileInput(); ensureDetailInput();
    if (global.SuiviApp && typeof global.SuiviApp.showView === 'function') global.SuiviApp.showView('view-import-historique');
    else { document.querySelectorAll('.view').forEach(view => view.classList.add('hidden')); $('view-import-historique')?.classList.remove('hidden'); }
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    await load();
  }

  // Alt+Maj+I : ouvre l'outil (page cachée, comme le diagnostic de chargement en Alt+Maj+D).
  document.addEventListener('keydown', event => {
    if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyI') { event.preventDefault(); open(); }
  });

  // Dernière chance d'écrire le brouillon quand la page se ferme ou se cache (la copie locale est déjà écrite).
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushDraft(); });
  global.addEventListener('pagehide', () => { flushDraft(); });

  global.ImportHistoriquePage = { open, load, render, state, resetState, write, flushDraft, SOURCE_TABLE: L.SOURCE_TABLE, DRAFT_TABLE };
})(window);
