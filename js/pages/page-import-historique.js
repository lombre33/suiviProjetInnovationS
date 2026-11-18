/**
 * Page « Import de l'historique financier » (outil one-shot, V1 du 18/11/2026, d'après la planche validée par Antoine).
 *
 * Page cachée : pas dans la barre de navigation, on l'ouvre avec Alt+Maj+I (ou ImportHistoriquePage.open()). Les règles sont dans
 * import-historique-logic.js ; cette page lit, affiche, collecte les décisions et écrit.
 *
 * Parcours : lecture du journal Import_Financements (envoyé par le formulaire) -> rapprochement de chaque projet de l'export avec un
 * projet de Grist -> simulation (rien n'est écrit : tout ce qui va changer est listé, avec le contrôle des totaux) -> liaison (création
 * des projets et lignes OPE manquants, rattachement) avec un journal Import_Journal qui rend chaque lot annulable.
 *
 * Écrit dans Grist : Lignes_OPE, Projets (seulement ce que décrit import-historique-logic.js) et Import_Journal (créée à la première
 * écriture). Aucun montant. Les filtres ne sont pas retenus par utilisateur : l'outil sert une fois, puis se supprime.
 */
(function (global) {
  'use strict';

  const L = global.ImportHistoriqueLogic;
  const esc = value => CoreUtils.escapeHtml(value);
  const $ = id => document.getElementById(id);
  const FILTERS = [['all', 'Tous'], ['maybe', 'À confirmer'], ['new', 'Nouveaux'], ['sure', 'Sûrs'], ['conflict', 'À trancher'], ['skip', 'Écartés']];
  const STATUS_LABEL = { sure: 'Sûr', maybe: 'À confirmer', new: 'Nouveau', conflict: 'À trancher', blocked: 'À corriger' };
  const SIMULATION_MAX_AGE_MS = 10 * 60 * 1000;

  const state = freshState();
  function freshState() {
    return {
      phase: 'idle', error: '', rows: [], lines: [], ignored: 0, total: 0, issues: [], entries: [], orphans: [], ctx: null, matches: new Map(),
      mappings: { programmes: [], structures: [] }, mappingChoice: { programmes: new Map(), structures: new Map() }, decisions: new Map(),
      filter: 'all', search: '', detail: [], totals: null, journal: [], tables: {}, plan: null, simulatedAt: 0, writing: false,
      result: null, undo: null, openBoxes: new Set(), _refocus: null
    };
  }
  function resetState() { Object.assign(state, freshState()); }

  const money = n => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('fr-FR');
  const dateText = seconds => { if (seconds == null || seconds === '' || seconds === 0) return ''; const d = new Date(Number(seconds) * 1000); return d.toLocaleDateString('fr-FR', { timeZone: 'UTC' }); };
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

  // ----------------------------------------------------------------------------------------------------------
  // Lecture
  // ----------------------------------------------------------------------------------------------------------

  async function readTable(name) { try { return await CoreGrist.getTable(name); } catch (err) { return null; } }

  async function readGrist() {
    await CoreGrist.ready();
    const [projets, lignes, programmes, structures, detail, journal] = await Promise.all(
      ['Projets', 'Lignes_OPE', 'Programmes', 'Structures', L.DETAIL_TABLE, L.JOURNAL_TABLE].map(readTable));
    state.tables = { Projets: projets || [], Lignes_OPE: lignes || [] };
    state.detail = detail || [];
    state.journal = journal || [];
    state.ctx = L.buildContext({
      projets: projets || [], lignes: lignes || [], programmes: programmes || [], structures: structures || [],
      isFormula: (table, col) => CoreGrist.isFormulaColumn(table, col),
      hasColumn: (table, col) => { const known = CoreGrist.knownColumns(table); return !known || known.has(col); }
    });
  }

  function analyse() {
    const versions = L.latestVersions(state.rows);
    state.lines = versions.lines; state.ignored = versions.ignored; state.total = versions.total;
    state.issues = L.checkLines(state.lines);
    const grouped = L.groupProjects(state.lines, state.issues);
    state.entries = grouped.entries; state.orphans = grouped.orphans;
    state.matches = new Map(state.entries.map(entry => [entry.key, L.matchEntry(entry, state.ctx)]));
    const fresh = L.buildMappings(state.entries, state.ctx);
    // Les correspondances choisies à la main survivent à une relecture ; le reste repart des suggestions.
    ['programmes', 'structures'].forEach(kind => fresh[kind].forEach(item => {
      if (state.mappingChoice[kind].has(item.label)) { item.id = state.mappingChoice[kind].get(item.label); item.auto = false; item.suggested = false; }
    }));
    state.mappings = fresh;
    state.totals = L.checkTotals(state.lines, state.entries, state.detail);
  }

  async function load() {
    state.phase = 'loading'; state.error = ''; state.plan = null; render();
    try {
      let rows;
      try { rows = await CoreGrist.getTable(L.SOURCE_TABLE); }
      catch (err) { state.phase = 'missing'; render(); return; }
      state.rows = rows || [];
      await readGrist();
      analyse();
      state.phase = 'ready';
    } catch (err) {
      console.error('Import historique :', err);
      state.phase = 'error'; state.error = err.message || String(err);
    }
    render();
  }

  // ----------------------------------------------------------------------------------------------------------
  // Décisions
  // ----------------------------------------------------------------------------------------------------------

  const decisionOf = key => state.decisions.get(key) || { mode: 'auto' };
  function setDecision(key, patch) { state.decisions.set(key, Object.assign({}, decisionOf(key), patch)); state.plan = null; }
  const effective = entry => L.effectiveDecision(state.matches.get(entry.key), state.decisions.get(entry.key));

  // Catégorie d'affichage d'un projet de l'export (filtres et pastille).
  function categoryOf(entry) {
    const match = state.matches.get(entry.key), d = decisionOf(entry.key);
    if (match.status === 'blocked' || d.mode === 'skip') return 'skip';
    if (d.mode === 'new') return 'new';
    if (d.mode === 'project' && d.projectId) return 'maybe';
    return match.status;
  }
  const isReady = entry => { const e = effective(entry); return e.action === 'skip' || (e.action !== 'pending' && e.confirmed); };

  function visibleEntries() {
    const needle = L.normalize(state.search);
    return state.entries.filter(entry => {
      if (state.filter !== 'all' && categoryOf(entry) !== state.filter) return false;
      if (!needle) return true;
      const hay = L.normalize([entry.name, entry.programme, entry.financeurs.join(' '), entry.opes.map(o => o.ope).join(' ')].join(' '));
      return hay.includes(needle);
    });
  }

  // ----------------------------------------------------------------------------------------------------------
  // Rendu
  // ----------------------------------------------------------------------------------------------------------

  function counts() {
    const c = { all: state.entries.length, maybe: 0, new: 0, sure: 0, conflict: 0, skip: 0 };
    state.entries.forEach(entry => { c[categoryOf(entry)] = (c[categoryOf(entry)] || 0) + 1; });
    return c;
  }

  function barHtml(c) {
    const chips = FILTERS.map(([id, label]) => `<button type="button" class="ih-chip${state.filter === id ? ' is-on' : ''}" data-ih-filter="${id}" aria-pressed="${state.filter === id}">${label} <span class="kanban-count">${c[id] || 0}</span></button>`).join('');
    return `<div class="project-filters ih-bar" role="search" aria-label="Filtres de l'import">
      <button type="button" class="btn btn-secondary" id="ih-back">← Retour</button>
      <strong class="ih-title">Import de l'historique financier</strong>
      <div class="ih-chips" role="group" aria-label="Rapprochement">${chips}</div>
      <label class="filter-search"><span class="visually-hidden">Recherche</span><input id="ih-search" type="search" placeholder="Projet, N° OPE, financeur…" autocomplete="off" value="${esc(state.search)}"></label>
      <span class="ih-spacer"></span>
      <button type="button" class="btn btn-secondary" id="ih-confirm-all" title="Confirme les projets affichés qui sont « à confirmer » ou « nouveaux »">Tout confirmer</button>
      <button type="button" class="btn btn-primary" id="ih-simulate">Simuler</button>
    </div>`;
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

  function mappingSelect(kind, item, options) {
    const opts = ['<option value="0">Ne pas renseigner</option>'].concat(options.map(o => `<option value="${o.id}"${Number(item.id) === o.id ? ' selected' : ''}>${esc(o.label)}</option>`)).join('');
    const tag = item.auto ? '<span class="ih-tag is-ok">égalité</span>' : (item.suggested && Number(item.id) ? '<span class="ih-tag is-maybe">suggestion</span>' : (Number(item.id) ? '<span class="ih-tag is-ok">choisi</span>' : '<span class="ih-tag is-new">à choisir</span>'));
    return `<div class="ih-map-row"><span class="ih-map-label">${esc(item.label)} <span class="ih-muted">· ${item.count}</span></span><select data-ih-map="${kind}" data-ih-label="${esc(item.label)}" aria-label="${esc(item.label)}">${opts}</select>${tag}</div>`;
  }
  function mappingsHtml() {
    const p = state.mappings.programmes, s = state.mappings.structures;
    const block = (title, kind, items, options) => `<div class="ih-map"><h4>${title}</h4>${items.length ? items.map(item => mappingSelect(kind, item, options)).join('') : '<p class="ih-muted">Rien à relier.</p>'}</div>`;
    return `<div class="ih-maps">${block('Programmes', 'programmes', p, state.ctx.programmeList)}${block('Structures (où l\'OPE est ouverte)', 'structures', s, state.ctx.structureList)}</div>`;
  }
  const mappingNeedsAttention = () => state.mappings.programmes.concat(state.mappings.structures).some(item => !Number(item.id) || item.suggested);

  function chipHtml(entry) {
    const match = state.matches.get(entry.key), cat = categoryOf(entry), d = decisionOf(entry.key);
    const label = d.mode === 'skip' ? 'Écarté' : (d.mode === 'new' ? 'Nouveau' : (d.mode === 'project' ? 'Choisi' : STATUS_LABEL[match.status]));
    return `<span class="ih-state is-${cat}" title="${esc(match.reason)}">${label}</span>`;
  }

  function targetHtml(entry) {
    const match = state.matches.get(entry.key), d = decisionOf(entry.key), e = effective(entry);
    if (match.status === 'blocked') return `<span class="ih-muted">${esc(match.reason)}</span>`;
    const label = c => `${esc(c.label)}${c.score < 1 ? ` (${Math.round(c.score * 100)} %)` : ''}`;
    let current = 'auto';
    if (d.mode === 'skip') current = 'skip'; else if (d.mode === 'new') current = match.status === 'new' ? 'auto' : 'new'; else if (d.mode === 'other') current = 'other'; else if (d.mode === 'project' && d.projectId) current = 'p:' + d.projectId;
    const options = [];
    if (match.status === 'sure' || match.status === 'maybe') options.push(`<option value="auto">→ ${label(match.candidates.find(c => c.id === match.projectId) || { label: '', score: 1 })}</option>`);
    else if (match.status === 'new') options.push('<option value="auto">Créer un nouveau projet</option>');
    else options.push('<option value="auto" disabled>À trancher…</option>');
    match.candidates.filter(c => c.id !== match.projectId).forEach(c => options.push(`<option value="p:${c.id}">→ ${label(c)}</option>`));
    if (d.mode === 'project' && d.projectId && d.projectId !== match.projectId && !match.candidates.some(c => c.id === d.projectId)) {
      const picked = state.ctx.projects.find(p => p.id === d.projectId);
      options.push(`<option value="p:${d.projectId}">→ ${esc(picked ? picked.label : '#' + d.projectId)}</option>`);
    }
    if (match.status !== 'new') options.push('<option value="new">Créer un nouveau projet</option>');
    options.push('<option value="other">Autre projet…</option>', '<option value="skip">Mettre de côté</option>');
    const select = `<select data-ih-select="${esc(entry.key)}" aria-label="Projet de Grist pour ${esc(entry.name)}">${options.join('').replace(`value="${current}"`, `value="${current}" selected`)}</select>`;
    let extra = '';
    if (d.mode === 'other') extra = `<select data-ih-other="${esc(entry.key)}" aria-label="Autre projet"><option value="">Choisir…</option>${state.ctx.projects.slice().sort((a, b) => a.label.localeCompare(b.label, 'fr')).map(p => `<option value="${p.id}">${esc(p.label)}${p.name && p.name !== p.label ? ' — ' + esc(p.name) : ''}</option>`).join('')}</select>`;
    else if (e.action === 'create') extra = `<input type="text" class="ih-acr" data-ih-acr="${esc(entry.key)}" value="${esc(d.acronyme != null ? d.acronyme : L.defaultAcronyme(entry.name))}" aria-label="Acronyme du nouveau projet" title="Acronyme du nouveau projet">`;
    return `<div class="ih-target">${select}${extra}</div>`;
  }

  function confirmHtml(entry) {
    const match = state.matches.get(entry.key), e = effective(entry);
    if (match.status === 'blocked' || e.action === 'skip') return '<span class="ih-muted">—</span>';
    if (e.action === 'pending') return '<span class="ih-muted" title="Choisis un projet ou mets de côté">?</span>';
    if (match.status === 'sure' && decisionOf(entry.key).mode === 'auto') return '<span class="ih-ok" title="Rapprochement sûr : confirmé d\'office" aria-label="Confirmé d\'office">✓</span>';
    return `<label class="ih-confirm"><input type="checkbox" data-ih-confirm="${esc(entry.key)}"${e.confirmed ? ' checked' : ''}><span>OK</span></label>`;
  }

  function rowHtml(entry) {
    const opes = entry.opes.map(o => o.ope);
    const meta = [plural(opes.length, 'ligne OPE', 'lignes OPE') + ' · ' + esc(opes.slice(0, 3).join(', ')) + (opes.length > 3 ? '…' : ''), esc(entry.financeurs.join(', ')), entry.programme ? esc(entry.programme) : ''].filter(Boolean).join(' · ');
    return `<div class="ih-row" data-ih-entry="${esc(entry.key)}">
      <div class="ih-name"><b>${esc(entry.name)}</b><span class="ih-muted">${meta}</span></div>
      <div class="ih-st">${chipHtml(entry)}</div>
      <div class="ih-tg">${targetHtml(entry)}</div>
      <div class="ih-cf">${confirmHtml(entry)}</div>
    </div>`;
  }

  function planActionLabel(op) {
    const what = op.table === 'Projets' ? 'Projet' : 'Ligne OPE';
    if (op.kind === 'add') return `<span class="ih-plus">+</span> ${what} <b>${esc(op.label)}</b>${op.table === 'Projets' ? ` <span class="ih-muted">avec ${plural(op.fields.Ligne_OPE.length - 1, 'ligne OPE', 'lignes OPE')}</span>` : ''}`;
    const cols = Object.keys(op.fields).join(', ');
    return `<span class="ih-edit">~</span> ${what} <b>${esc(op.label)}</b> <span class="ih-muted">${esc(cols)}</span>`;
  }

  function totalsHtml(options) {
    const t = state.totals;
    if (!t || !t.available) return `<p class="ih-muted">Le détail des dépenses (table ${L.DETAIL_TABLE}, export FD02) n'est pas encore importé : le contrôle des totaux est impossible pour l'instant.</p>`;
    const gaps = t.rows.filter(r => r.status !== 'ok');
    const head = `<p class="${t.gaps ? 'ih-warn' : 'ih-okline'}"><strong>${t.gaps ? '⚠' : '✓'}</strong> Consommé de l'export, comparé à la somme du détail des dépenses : <strong>${t.gaps ? plural(t.gaps, 'OPE en écart', 'OPE en écart') : 'tous les OPE concordent'}</strong> sur ${t.rows.length}. Total AE ${money(t.total.export.ae)} / ${money(t.total.detail.ae)}, CP ${money(t.total.export.cp)} / ${money(t.total.detail.cp)} (export / détail).</p>`;
    const rows = gaps.slice(0, options && options.max || 30).map(r => `<tr><td class="ih-mono">${esc(r.ope)}</td><td>${esc(r.project)}</td><td class="ih-num">${money(r.exportAE)}</td><td class="ih-num">${r.status === 'sans-detail' ? '—' : money(r.detailAE)}</td><td class="ih-num">${money(r.exportCP)}</td><td class="ih-num">${r.status === 'sans-detail' ? '—' : money(r.detailCP)}</td><td>${r.status === 'sans-detail' ? 'Aucun détail' : 'Écart de ' + money(r.diffAE) + ' AE, ' + money(r.diffCP) + ' CP'}</td></tr>`).join('');
    const table = gaps.length ? `<table class="ih-table"><thead><tr><th>N° OPE</th><th>Projet</th><th>AE export</th><th>AE détail</th><th>CP export</th><th>CP détail</th><th></th></tr></thead><tbody>${rows}</tbody></table>${gaps.length > 30 ? `<p class="ih-muted">… et ${gaps.length - 30} autres.</p>` : ''}` : '';
    const extra = t.extra.length ? `<p class="ih-muted">${plural(t.extra.length, 'N° OPE présent', 'N° OPE présents')} dans le détail des dépenses mais pas dans l'export.</p>` : '';
    return head + table + extra;
  }

  function simulationHtml() {
    const plan = state.plan;
    if (!plan) return '';
    const c = plan.counts;
    const kpis = [['Projets créés', c.projetsCrees], ['Projets complétés', c.projetsLies], ['Lignes OPE créées', c.opesCreees], ['Lignes OPE complétées', c.opesCompletees], ['Déjà à jour', c.dejaAJour], ['Écartés', c.misDeCote]]
      .map(([label, n]) => `<div class="ih-kpi"><b>${n}</b><span>${label}</span></div>`).join('');
    const waiting = plan.notReady.length ? `<p class="ih-warn"><strong>⚠</strong> ${plural(plan.notReady.length, 'projet attend', 'projets attendent')} ta validation : ${plan.notReady.length > 1 ? 'ils ne seront' : 'il ne sera'} pas écrit${plan.notReady.length > 1 ? 's' : ''}. <button type="button" class="ih-link" data-ih-filter="maybe">Voir</button></p>` : '';
    const conflicts = plan.conflicts.length ? boxHtml('conflicts', 'Grist garde', `${plural(plan.conflicts.length, 'écart listé', 'écarts listés')}`, `<table class="ih-table"><thead><tr><th>Projet</th><th>Champ</th><th>Grist</th><th>Export</th></tr></thead><tbody>${plan.conflicts.map(x => `<tr><td>${esc(x.entry.name)}</td><td>${esc(x.field)}</td><td>${esc(conflictValue(x.field, x.grist))}</td><td>${esc(conflictValue(x.field, x.export))}</td></tr>`).join('')}</tbody></table>`) : '';
    const ops = plan.phase1.concat(plan.phase2);
    const list = boxHtml('actions', 'Écritures prévues', plural(ops.length, 'action', 'actions'), ops.length ? `<ul class="ih-actions">${ops.slice(0, 300).map(op => `<li>${planActionLabel(op)}</li>`).join('')}</ul>${ops.length > 300 ? `<p class="ih-muted">… et ${ops.length - 300} autres.</p>` : ''}` : '<p class="ih-muted">Rien à écrire.</p>');
    const totals = boxHtml('totals-sim', 'Contrôle des totaux', state.totals && state.totals.available ? (state.totals.gaps ? plural(state.totals.gaps, 'écart', 'écarts') : 'concordants') : 'détail absent', totalsHtml(), state.totals && state.totals.gaps > 0);
    const ready = ops.length > 0 && !state.writing;
    return `<section class="ih-sim" id="ih-sim" aria-label="Simulation">
      <h3>Simulation <span class="ih-muted">· rien n'est encore écrit</span></h3>
      <div class="ih-kpis">${kpis}</div>${waiting}${totals}${conflicts}${list}
      <div class="ih-write"><label class="ih-ack"><input type="checkbox" id="ih-ack"> J'ai relu la simulation</label>
        <button type="button" class="btn btn-primary" id="ih-write" disabled${ready ? '' : ' data-ih-empty="1"'}>Écrire ${plural(ops.length, 'action', 'actions')} dans Grist</button></div>
    </section>`;
  }
  function conflictValue(field, value) {
    if (/Date/.test(field)) return dateText(value);
    if (field === 'Programme' || /^Structure/.test(field)) {
      if (typeof value === 'number') { const list = field === 'Programme' ? state.ctx.programmeList : state.ctx.structureList; const found = list.find(item => item.id === value); return found ? found.label : '#' + value; }
    }
    return value == null || value === 0 ? '' : String(value);
  }

  function lotsHtml() {
    const lots = L.summarizeLots(state.journal);
    if (!lots.length) return '';
    const undo = state.undo;
    const rows = lots.map(lot => {
      const done = lot.annules === lot.total;
      let extra = '';
      if (undo && undo.lot === lot.lot) {
        extra = `<div class="ih-undo"><p>${plural(undo.plan.actions.length, 'action sera défaite', 'actions seront défaites')}${undo.plan.skipped.length ? `, ${plural(undo.plan.skipped.length, 'ligne laissée', 'lignes laissées')} (${esc(Array.from(new Set(undo.plan.skipped.map(s => s.why))).join(' ; '))})` : ''}.</p>
          <button type="button" class="btn btn-primary" data-ih-undo-confirm="${esc(lot.lot)}"${undo.plan.actions.length ? '' : ' disabled'}>Confirmer l'annulation</button> <button type="button" class="btn btn-secondary" data-ih-undo-cancel>Garder</button></div>`;
      }
      return `<li><span class="ih-mono">${esc(lot.lot)}</span> <span class="ih-muted">· ${plural(lot.ajouts, 'ajout', 'ajouts')}, ${plural(lot.modifs, 'modification', 'modifications')}${lot.annules ? `, ${lot.annules} annulé${lot.annules > 1 ? 's' : ''}` : ''}</span>
        ${done ? '<span class="ih-tag is-ok">annulé</span>' : `<button type="button" class="btn btn-secondary" data-ih-undo="${esc(lot.lot)}">Annuler ce lot</button>`}${extra}</li>`;
    }).join('');
    return boxHtml('lots', 'Lots écrits', plural(lots.length, 'lot', 'lots'), `<ul class="ih-lots">${rows}</ul>`, !!undo);
  }

  function resultHtml() {
    const r = state.result;
    if (!r) return '';
    if (r.kind === 'written') {
      const e = r.value;
      const n = e.ajouts.Projets.length + e.ajouts.Lignes_OPE.length + e.modifs.Projets.length + e.modifs.Lignes_OPE.length;
      if (e.error) return `<div class="ih-banner is-error" role="alert"><strong>Écriture interrompue.</strong> ${esc(e.error.message || String(e.error))} ${n ? `${plural(n, 'écriture est passée', 'écritures sont passées')} avant l'arrêt${e.journalError ? ', mais le journal n\'a pas pu être enregistré : le lot ne sera pas annulable' : ` (lot ${esc(e.lot)}, annulable ci-dessous)`}.` : 'Rien n\'a été écrit.'}</div>`;
      return `<div class="ih-banner is-ok" role="status"><strong>✓ Écrit.</strong> Lot ${esc(e.lot)} : ${plural(e.ajouts.Projets.length, 'projet créé', 'projets créés')}, ${plural(e.modifs.Projets.length, 'projet complété', 'projets complétés')}, ${plural(e.ajouts.Lignes_OPE.length, 'ligne OPE créée', 'lignes OPE créées')}, ${plural(e.modifs.Lignes_OPE.length, 'ligne OPE complétée', 'lignes OPE complétées')}. Journal enregistré.</div>`;
    }
    if (r.kind === 'undone') return `<div class="ih-banner is-ok" role="status"><strong>✓ Lot annulé.</strong> ${plural(r.done, 'action défaite', 'actions défaites')}${r.skipped ? `, ${plural(r.skipped, 'ligne laissée', 'lignes laissées')} car modifiée${r.skipped > 1 ? 's' : ''} depuis` : ''}.</div>`;
    return `<div class="ih-banner is-error" role="alert">${esc(r.message)}</div>`;
  }

  function summaryHtml() {
    const issues = state.issues.length;
    const d = state.totals && state.totals.available ? (state.totals.gaps ? `${plural(state.totals.gaps, 'écart', 'écarts')}` : 'totaux concordants') : 'détail des dépenses absent';
    return `<p class="ih-summary"><strong>${state.lines.length}</strong> lignes de financement (dernière version, sur ${state.total} reçues${state.ignored ? `, ${state.ignored} sans N° OPE ignorées` : ''}) · <strong>${state.entries.length}</strong> projets · <strong>${state.entries.reduce((n, e) => n + e.opes.length, 0)}</strong> N° OPE · ${issues ? `<span class="ih-warn-inline">${plural(issues, 'écart', 'écarts')} dans l'export</span>` : 'export cohérent'} · ${d}</p>`;
  }

  function render() {
    const root = $('ih-root');
    if (!root) return;
    if (state.phase === 'loading' || state.phase === 'idle') { root.innerHTML = '<p class="ih-empty" role="status">Lecture du journal et des projets…</p>'; return; }
    if (state.phase === 'missing') {
      root.innerHTML = `<div class="project-filters ih-bar"><button type="button" class="btn btn-secondary" id="ih-back">← Retour</button><strong class="ih-title">Import de l'historique financier</strong></div>
        <div class="ih-empty"><p><strong>La table ${L.SOURCE_TABLE} n'existe pas encore dans ce document.</strong></p><p class="ih-muted">Elle est créée une fois côté Grist (colonnes de l'export, puis un formulaire publié) : voir le dossier export-financier. Quand elle contient l'export, rouvre cette page.</p><button type="button" class="btn btn-secondary" id="ih-reload">Relire</button></div>`;
      return;
    }
    if (state.phase === 'error') {
      root.innerHTML = `<div class="project-filters ih-bar"><button type="button" class="btn btn-secondary" id="ih-back">← Retour</button><strong class="ih-title">Import de l'historique financier</strong></div><div class="ih-empty ih-banner is-error" role="alert">${esc(state.error)}</div>`;
      return;
    }
    const c = counts();
    const visible = visibleEntries();
    const blocked = state.entries.filter(e => state.matches.get(e.key).status === 'blocked').length;
    const body = state.entries.length
      ? `<div class="ih-head"><span>Projet de l'export</span><span>Rapprochement</span><span>Projet dans Grist</span><span>Accord</span></div>${visible.length ? visible.map(rowHtml).join('') : '<p class="ih-empty">Aucun projet ne correspond à ce filtre.</p>'}`
      : '<p class="ih-empty">Le journal ne contient aucune ligne rattachable (N° OPE manquant).</p>';
    root.innerHTML = barHtml(c) + resultHtml() + summaryHtml()
      + boxHtml('checks', 'Contrôles de l\'export', state.issues.length ? plural(state.issues.length, 'écart', 'écarts') + (blocked ? ` · ${plural(blocked, 'projet écarté', 'projets écartés')}` : '') : '7 sur 7 réussis', checksHtml(), false)
      + boxHtml('maps', 'Correspondances', `${plural(state.mappings.programmes.length, 'programme', 'programmes')}, ${plural(state.mappings.structures.length, 'structure', 'structures')}`, mappingsHtml(), mappingNeedsAttention())
      + `<div class="ih-list">${body}</div>` + simulationHtml() + lotsHtml();
    const active = document.activeElement;
    if (state._refocus) { const el = $(state._refocus); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (err) { /* champ sans sélection */ } } state._refocus = null; }
    else if (active && active.id === 'ih-search') $('ih-search')?.focus();
  }

  // ----------------------------------------------------------------------------------------------------------
  // Actions
  // ----------------------------------------------------------------------------------------------------------

  async function simulate() {
    state.result = null;
    try { state.rows = await CoreGrist.getTable(L.SOURCE_TABLE); await readGrist(); analyse(); } catch (err) { state.result = { kind: 'error', message: 'Relecture de Grist impossible : ' + (err.message || err) }; render(); return; }
    state.plan = L.buildPlan({ entries: state.entries, matches: state.matches, decisions: state.decisions, mappings: state.mappings, ctx: state.ctx, now: Date.now() });
    state.simulatedAt = Date.now();
    render();
    $('ih-sim')?.scrollIntoView?.({ block: 'start' });
  }

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

  async function write() {
    if (state.writing || !state.plan || !state.plan.actionCount) return;
    if (Date.now() - state.simulatedAt > SIMULATION_MAX_AGE_MS) { state.result = { kind: 'error', message: 'La simulation date de plus de 10 minutes : relance « Simuler » avant d\'écrire.' }; state.plan = null; render(); return; }
    state.writing = true;
    const writeBtn = $('ih-write'); if (writeBtn) { writeBtn.disabled = true; writeBtn.textContent = 'Écriture en cours…'; }
    try {
      await ensureJournal();
      const result = await L.execute(state.plan, io());
      state.result = { kind: 'written', value: result };
    } catch (err) { state.result = { kind: 'error', message: 'Écriture impossible : ' + (err.message || err) }; }
    state.writing = false; state.plan = null;
    CoreGrist.invalidateTable(L.JOURNAL_TABLE);
    await load();
    notifyChanged();
  }

  async function startUndo(lot) {
    await readGrist();
    state.undo = { lot, plan: L.planUndo(state.journal, lot, state.tables) };
    render();
  }
  async function confirmUndo(lot) {
    const undo = state.undo;
    if (!undo || undo.lot !== lot || !undo.plan.actions.length) return;
    try {
      const actions = undo.plan.actions.concat(undo.plan.done.map(id => ['UpdateRecord', L.JOURNAL_TABLE, Number(id), { Annule: true }]));
      for (let i = 0; i < actions.length; i += L.CHUNK) await CoreGrist.gristInstance.docApi.applyUserActions(actions.slice(i, i + L.CHUNK));
      state.result = { kind: 'undone', done: undo.plan.actions.length, skipped: undo.plan.skipped.length };
    } catch (err) { state.result = { kind: 'error', message: 'Annulation impossible : ' + (err.message || err) }; }
    state.undo = null;
    await load();
    notifyChanged();
  }

  function confirmVisible() {
    visibleEntries().forEach(entry => {
      const match = state.matches.get(entry.key), d = decisionOf(entry.key), e = effective(entry);
      if (match.status === 'blocked' || d.mode === 'skip' || e.action === 'pending' || e.confirmed) return;
      setDecision(entry.key, { confirmed: true });
    });
    render();
  }

  function onChange(event) {
    const target = event.target;
    if (target.matches('[data-ih-select]')) {
      const key = target.getAttribute('data-ih-select'), value = target.value;
      if (value === 'auto') setDecision(key, { mode: 'auto', projectId: null });
      else if (value === 'new') setDecision(key, { mode: 'new', projectId: null, confirmed: false });
      else if (value === 'skip') setDecision(key, { mode: 'skip' });
      else if (value === 'other') setDecision(key, { mode: 'other', projectId: null });
      else if (value.startsWith('p:')) setDecision(key, { mode: 'project', projectId: Number(value.slice(2)), confirmed: true });
      render();
    } else if (target.matches('[data-ih-other]')) {
      const key = target.getAttribute('data-ih-other');
      if (target.value) setDecision(key, { mode: 'project', projectId: Number(target.value), confirmed: true });
      render();
    } else if (target.matches('[data-ih-confirm]')) {
      setDecision(target.getAttribute('data-ih-confirm'), { confirmed: target.checked });
      render();
    } else if (target.matches('[data-ih-map]')) {
      const kind = target.getAttribute('data-ih-map'), label = target.getAttribute('data-ih-label');
      state.mappingChoice[kind].set(label, Number(target.value));
      const item = state.mappings[kind].find(m => m.label === label);
      if (item) { item.id = Number(target.value); item.auto = false; item.suggested = false; }
      state.plan = null; state.openBoxes.add('maps');
      render();
    } else if (target.id === 'ih-ack') {
      const btn = $('ih-write');
      if (btn && !btn.hasAttribute('data-ih-empty')) btn.disabled = !target.checked;
    }
  }

  function onInput(event) {
    const target = event.target;
    if (target.id === 'ih-search') { state.search = target.value; state._refocus = 'ih-search'; render(); }
    else if (target.matches('[data-ih-acr]')) setDecision(target.getAttribute('data-ih-acr'), { acronyme: target.value });
  }

  function onClick(event) {
    const button = event.target.closest('button, summary');
    if (!button) return;
    if (button.id === 'ih-back') { global.SuiviApp?.showView('view-projects'); $('btn-projects')?.classList.add('active'); }
    else if (button.id === 'ih-reload') load();
    else if (button.id === 'ih-simulate') simulate();
    else if (button.id === 'ih-confirm-all') confirmVisible();
    else if (button.id === 'ih-write') write();
    else if (button.hasAttribute('data-ih-filter')) { state.filter = button.getAttribute('data-ih-filter'); render(); }
    else if (button.hasAttribute('data-ih-undo')) startUndo(button.getAttribute('data-ih-undo'));
    else if (button.hasAttribute('data-ih-undo-confirm')) confirmUndo(button.getAttribute('data-ih-undo-confirm'));
    else if (button.hasAttribute('data-ih-undo-cancel')) { state.undo = null; render(); }
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
    root.addEventListener('toggle', onToggle, true);
  }

  async function open() {
    wire();
    if (global.SuiviApp && typeof global.SuiviApp.showView === 'function') global.SuiviApp.showView('view-import-historique');
    else { document.querySelectorAll('.view').forEach(view => view.classList.add('hidden')); $('view-import-historique')?.classList.remove('hidden'); }
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    await load();
  }

  // Alt+Maj+I : ouvre l'outil (page cachée, comme le diagnostic de chargement en Alt+Maj+D).
  document.addEventListener('keydown', event => {
    if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyI') { event.preventDefault(); open(); }
  });

  global.ImportHistoriquePage = { open, load, render, state, resetState, simulate, write, SOURCE_TABLE: L.SOURCE_TABLE };
})(window);
