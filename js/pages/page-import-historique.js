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
      result: null, undo: null, openBoxes: new Set(), _refocus: null,
      prepared: [], upload: null
    };
  }
  function resetState() { Object.assign(state, freshState()); }

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
    state.tables = { Projets: projets || [], Lignes_OPE: lignes || [] };
    state.detail = detail || [];
    state.journal = journal || [];
    state.lots = lots || [];
    state.ctx = L.buildContext({
      projets: projets || [], lignes: lignes || [], programmes: programmes || [], structures: structures || [],
      isFormula: (table, col) => CoreGrist.isFormulaColumn(table, col),
      hasColumn: (table, col) => { const known = CoreGrist.knownColumns(table); return !known || known.has(col); },
      statusChoices: CoreGrist.columnChoices('Projets', 'Statut_operationnel_projet')
    });
    state.readAt = Date.now();
  }

  // Le tableau se déduit de ce qui est lu, des décisions de rapprochement et des valeurs corrigées : recalculé à chaque correction.
  function recompute() {
    state.table = L.buildTable({ entries: state.entries, matches: state.matches, decisions: state.decisions, edits: state.edits, ctx: state.ctx, now: Date.now() });
  }

  function analyse() {
    const versions = L.latestVersions(state.rows);
    state.lines = versions.lines; state.ignored = versions.ignored; state.total = versions.total;
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

  async function load() {
    state.phase = 'loading'; state.error = ''; state.editing = null; render();
    try {
      try { await prepare(); }
      catch (err) { throw new Error('Préparation de Grist impossible (création de ' + L.SOURCE_TABLE + ' et de ses colonnes) : ' + (err.message || err)); }
      let rows;
      try { rows = await CoreGrist.getTable(L.SOURCE_TABLE); }
      catch (err) { state.phase = 'missing'; render(); return; }
      state.rows = rows || [];
      await readGrist();
      await adoptLegacyRows();
      analyse();
      state.phase = 'ready';
    } catch (err) {
      console.error('Import historique :', err);
      state.phase = 'error'; state.error = err.message || String(err);
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

  function barHtml() {
    const t = state.table;
    const counts = { all: t.rows.length, add: t.add, mod: t.mod, same: t.same, todo: t.todo, skip: t.skip };
    const chips = FILTERS.map(([id, label]) => `<button type="button" class="ih-chip${state.filter === id ? ' is-on' : ''}" data-ih-filter="${id}" aria-pressed="${state.filter === id}">${label} <span class="kanban-count">${counts[id] || 0}</span></button>`).join('');
    return `<div class="project-filters ih-bar" role="search" aria-label="Filtres de l'import">
      <button type="button" class="btn btn-secondary" id="ih-back">← Retour</button>
      <strong class="ih-title">Import de l'historique financier</strong>
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
    if (!t || !t.available) return `<p class="ih-muted">Le détail des dépenses (table ${L.DETAIL_TABLE}, export FD02) n'est pas encore importé : le contrôle des totaux est impossible pour l'instant.</p>`;
    const gaps = t.rows.filter(r => r.status !== 'ok');
    const head = `<p class="${t.gaps ? 'ih-warn' : 'ih-okline'}"><strong>${t.gaps ? '⚠' : '✓'}</strong> Consommé de l'export, comparé à la somme du détail des dépenses : <strong>${t.gaps ? plural(t.gaps, 'OPE en écart', 'OPE en écart') : 'tous les OPE concordent'}</strong> sur ${t.rows.length}. Total AE ${money(t.total.export.ae)} / ${money(t.total.detail.ae)}, CP ${money(t.total.export.cp)} / ${money(t.total.detail.cp)} (export / détail).</p>`;
    const rows = gaps.slice(0, options && options.max || 30).map(r => `<tr><td class="ih-mono">${esc(r.ope)}</td><td>${esc(r.project)}</td><td class="ih-num">${money(r.exportAE)}</td><td class="ih-num">${r.status === 'sans-detail' ? '—' : money(r.detailAE)}</td><td class="ih-num">${money(r.exportCP)}</td><td class="ih-num">${r.status === 'sans-detail' ? '—' : money(r.detailCP)}</td><td>${r.status === 'sans-detail' ? 'Aucun détail' : 'Écart de ' + money(r.diffAE) + ' AE, ' + money(r.diffCP) + ' CP'}</td></tr>`).join('');
    const table = gaps.length ? `<table class="ih-table"><thead><tr><th>N° OPE</th><th>Projet</th><th>AE export</th><th>AE détail</th><th>CP export</th><th>CP détail</th><th></th></tr></thead><tbody>${rows}</tbody></table>${gaps.length > 30 ? `<p class="ih-muted">… et ${gaps.length - 30} autres.</p>` : ''}` : '';
    const extra = t.extra.length ? `<p class="ih-muted">${plural(t.extra.length, 'N° OPE présent', 'N° OPE présents')} dans le détail des dépenses mais pas dans l'export.</p>` : '';
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
      control = `<input type="date" ${attrs} value="${esc(cell.v || '')}">`;
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
        inner = `<span class="ih-mono">${esc(line.ope)}</span> · <span>${esc(c.v || c.raw || '—')}</span>`
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
    else note = `<b>Prêt à écrire :</b> ${plural(c.projetsCrees, 'projet créé', 'projets créés')}, ${plural(c.projetsLies, 'projet complété', 'projets complétés')}, ${plural(c.opesCreees, 'ligne OPE créée', 'lignes OPE créées')}, ${plural(c.opesCompletees, 'ligne OPE complétée', 'lignes OPE complétées')}. Rien n'est écrit avant ton clic.`;
    const blocked = !!t.left || !plan.actionCount;
    return `<div class="ih-actions-bar"><span class="ih-note">${note}</span>
      <button type="button" class="btn btn-secondary" id="ih-next"${t.left ? '' : ' disabled'}>Prochaine anomalie ↓</button>
      <label class="ih-ack"><input type="checkbox" id="ih-ack"${state.ack ? ' checked' : ''}${blocked ? ' disabled' : ''}> J'ai relu le tableau</label>
      <button type="button" class="btn btn-primary" id="ih-write"${blocked || !state.ack || state.writing ? ' disabled' : ''}>Écrire ${plural(plan.actionCount, 'action', 'actions')} dans Grist</button></div>`;
  }

  function lotsHtml() {
    const lots = L.summarizeLots(state.journal);
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
    return boxHtml('lots', 'Lots écrits et fichiers chargés', plural(lots.length, 'lot', 'lots'), `<ul class="ih-lots">${rows}</ul>`, !!undo);
  }

  function resultHtml() {
    const r = state.result;
    if (!r) return '';
    if (r.kind === 'written') {
      const e = r.value;
      const n = e.ajouts.Projets.length + e.ajouts.Lignes_OPE.length + e.modifs.Projets.length + e.modifs.Lignes_OPE.length;
      if (e.error) return `<div class="ih-banner is-error" role="alert"><strong>Écriture interrompue.</strong> ${esc(e.error.message || String(e.error))} ${n ? `${plural(n, 'écriture est passée', 'écritures sont passées')} avant l'arrêt${e.journalError ? ', mais le journal n\'a pas pu être enregistré : le lot ne sera pas annulable' : ` (lot ${esc(e.lot)}, annulable ci-dessous)`}.` : 'Rien n\'a été écrit.'}</div>`;
      return `<div class="ih-banner is-ok" role="status"><strong>✓ Écrit.</strong> Lot ${esc(e.lot)} : ${plural(e.ajouts.Projets.length, 'projet créé', 'projets créés')}, ${plural(e.modifs.Projets.length, 'projet complété', 'projets complétés')}, ${plural(e.ajouts.Lignes_OPE.length, 'ligne OPE créée', 'lignes OPE créées')}, ${plural(e.modifs.Lignes_OPE.length, 'ligne OPE complétée', 'lignes OPE complétées')}. Journal enregistré.${e.lotError ? ` <b>Le lot n'a pas pu être marqué « Valide » dans ${L.LOTS_TABLE} :</b> ${esc(e.lotError)}.` : ''}</div>`;
    }
    if (r.kind === 'loaded') return `<div class="ih-banner is-ok" role="status"><strong>✓ Fichier chargé.</strong> ${plural(r.count, 'ligne ajoutée', 'lignes ajoutées')} à ${L.SOURCE_TABLE} (lot ${esc(r.lotId)} « A valider », annulable plus bas).${r.lotError ? ` <b>Le lot n'a pas pu être enregistré dans ${L.LOTS_TABLE} :</b> ${esc(r.lotError)}.` : ''} Relis le tableau, corrige les anomalies, puis écris.</div>`;
    if (r.kind === 'undone') return `<div class="ih-banner is-ok" role="status"><strong>${r.unit ? '✓ Chargement annulé.' : '✓ Lot annulé.'}</strong> ${r.unit ? plural(r.done, 'ligne retirée', 'lignes retirées') : plural(r.done, 'action défaite', 'actions défaites')}${r.skipped ? `, ${plural(r.skipped, 'ligne laissée', 'lignes laissées')} car modifiée${r.skipped > 1 ? 's' : ''} depuis` : ''}.</div>`;
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
        throw new Error(`${added ? plural(added, 'ligne est passée', 'lignes sont passées') + ' avant l\'arrêt (chargement annulable plus bas) : ' : ''}${err.message || err}`);
      }
      let lotError = '';
      try { await docApi.applyUserActions([['AddRecord', L.LOTS_TABLE, null, L.newLotFields({ lot: u.lot, type: L.LOT_TYPE_ONESHOT, source: 'Fichier', fichier: u.name, recuLe: u.exporteLe, lignes: u.records.length })]]); }
      catch (err) { lotError = err.message || String(err); }
      state.result = { kind: 'loaded', count: added, lot, lotId: u.lot, lotError };
      state.upload = null;
    } catch (err) {
      state.result = { kind: 'error', message: 'Chargement impossible : ' + (err.message || err) };
      state.upload = null;
    }
    CoreGrist.invalidateTable(L.SOURCE_TABLE); CoreGrist.invalidateTable(L.JOURNAL_TABLE); CoreGrist.invalidateTable(L.LOTS_TABLE);
    await load();
  }

  function summaryHtml() {
    const issues = state.issues.length;
    const d = state.totals && state.totals.available ? (state.totals.gaps ? `${plural(state.totals.gaps, 'écart', 'écarts')}` : 'totaux concordants') : 'détail des dépenses absent';
    return `<div class="ih-info"><p class="ih-summary"><strong>${state.lines.length}</strong> lignes de financement (dernière version, sur ${state.total} reçues${state.ignored ? `, ${state.ignored} sans N° OPE ignorées` : ''}) · <strong>${state.entries.length}</strong> ${state.entries.length > 1 ? 'projets' : 'projet'} · <strong>${state.entries.reduce((n, e) => n + e.opes.length, 0)}</strong> N° OPE · ${issues ? `<span class="ih-warn-inline">${plural(issues, 'écart', 'écarts')} dans l'export</span>` : 'export cohérent'} · ${d} · <button type="button" class="ih-link" id="ih-pick">Charger un autre fichier</button></p>${legendHtml()}</div>`;
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
    if (!state.total) {
      const busy = state.upload && state.upload.phase !== 'error';
      root.innerHTML = `<div class="project-filters ih-bar"><button type="button" class="btn btn-secondary" id="ih-back">← Retour</button><strong class="ih-title">Import de l'historique financier</strong></div>${preparedHtml()}${resultHtml()}${uploadHtml()}
        ${busy ? '' : `<div class="ih-empty"><p><strong>Charge l'export Excel</strong></p><p class="ih-muted">Choisis le fichier d'export de tous les projets. Il est lu ici, dans ton navigateur, et ses lignes sont ajoutées à Grist. Tu verras ensuite un tableau, une ligne par projet, pour tout vérifier avant d'écrire.</p><button type="button" class="btn btn-primary" id="ih-pick">Choisir le fichier Excel</button><p class="ih-muted">Les lignes arrivent autrement (formulaire) ? <button type="button" class="ih-link" id="ih-reload">Relire</button></p></div>`}`;
      return;
    }
    const t = state.table;
    const grid = root.querySelector('.ih-grid'), scrollLeft = grid ? grid.scrollLeft : 0, scrollTop = grid ? grid.scrollTop : 0;
    const blocked = t.rows.filter(r => r.match.status === 'blocked').length;
    root.innerHTML = barHtml() + preparedHtml() + uploadHtml() + resultHtml() + summaryHtml()
      + boxHtml('checks', 'Contrôles de l\'export', state.issues.length ? plural(state.issues.length, 'écart', 'écarts') + (blocked ? ` · ${plural(blocked, 'projet écarté', 'projets écartés')}` : '') : '7 sur 7 réussis', checksHtml(), false)
      + boxHtml('totals', 'Contrôle des totaux', state.totals && state.totals.available ? (state.totals.gaps ? plural(state.totals.gaps, 'écart', 'écarts') : 'concordants') : 'détail absent', totalsHtml(), state.totals && state.totals.gaps > 0)
      + tableHtml() + actionsHtml() + lotsHtml();
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
    const actions = L.planLotValidation(state.lots, { lots, counts: { add: table.add, mod: table.mod, same: table.same, left: table.left }, journalLot: result.lot, now: new Date() });
    if (actions.length) await CoreGrist.gristInstance.docApi.applyUserActions(actions);
    CoreGrist.invalidateTable(L.LOTS_TABLE);
  }

  async function write() {
    const t = state.table;
    if (state.writing || !t || t.left || !t.plan.actionCount) return;
    if (Date.now() - state.readAt > TABLE_MAX_AGE_MS) {
      // Grist a pu changer depuis la lecture : on relit, on garde les corrections, et on demande une nouvelle relecture avant d'écrire.
      try { state.rows = await CoreGrist.getTable(L.SOURCE_TABLE); await readGrist(); analyse(); state.result = { kind: 'error', message: 'Le tableau datait de plus de 10 minutes : il vient d\'être relu depuis Grist. Vérifie-le, puis écris.' }; }
      catch (err) { state.result = { kind: 'error', message: 'Relecture de Grist impossible : ' + (err.message || err) }; }
      state.ack = false; render();
      return;
    }
    state.writing = true;
    const writeBtn = $('ih-write'); if (writeBtn) { writeBtn.disabled = true; writeBtn.textContent = 'Écriture en cours…'; }
    let written = false;
    try {
      await ensureJournal();
      const result = await L.execute(t.plan, io());
      state.result = { kind: 'written', value: result };
      written = !result.error;
      if (written) {
        try { await validateLots(t, result); }
        catch (err) { result.lotError = err.message || String(err); }
      }
    } catch (err) { state.result = { kind: 'error', message: 'Écriture impossible : ' + (err.message || err) }; }
    state.writing = false; state.ack = false;
    // Tout est écrit : un « nouveau projet » forcé ferait un doublon, on l'oublie. Les autres choix et les corrections restent,
    // sinon le tableau relu re-signalerait les mêmes anomalies sur des projets déjà traités.
    if (written) state.decisions = new Map(Array.from(state.decisions).filter(([, d]) => d.mode !== 'new'));
    CoreGrist.invalidateTable(L.JOURNAL_TABLE);
    await load();
    notifyChanged();
  }

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
      state.result = { kind: 'undone', done: undo.plan.actions.length, skipped: undo.plan.skipped.length, unit: undo.kind === 'chargement' };
    } catch (err) { state.result = { kind: 'error', message: 'Annulation impossible : ' + (err.message || err) }; }
    state.undo = null;
    await load();
    notifyChanged();
  }

  // Une valeur choisie ou saisie dans l'éditeur ouvert. Renvoie false quand le choix n'est pas fini (l'éditeur reste ouvert).
  function commit(editor) {
    const type = editor.getAttribute('data-ih-type'), id = editor.getAttribute('data-ih-in'), value = editor.value;
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
      if (commit(target)) state.editing = null;
      recompute(); render();
    } else if (target.matches('[data-ih-all]')) {
      state.applyAll = target.checked;
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
    if (target.closest('select, input, label')) return;
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
    else if (button.id === 'ih-upload-confirm') loadFile();
    else if (button.id === 'ih-upload-cancel') { state.upload = null; render(); }
    else if (button.id === 'ih-next') goToNextAnomaly();
    else if (button.id === 'ih-write') write();
    else if (button.hasAttribute('data-ih-filter')) { const f = button.getAttribute('data-ih-filter'); state.filter = state.filter === f ? 'all' : f; state.editing = null; render(); }
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
    wire(); ensureFileInput();
    if (global.SuiviApp && typeof global.SuiviApp.showView === 'function') global.SuiviApp.showView('view-import-historique');
    else { document.querySelectorAll('.view').forEach(view => view.classList.add('hidden')); $('view-import-historique')?.classList.remove('hidden'); }
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    await load();
  }

  // Alt+Maj+I : ouvre l'outil (page cachée, comme le diagnostic de chargement en Alt+Maj+D).
  document.addEventListener('keydown', event => {
    if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyI') { event.preventDefault(); open(); }
  });

  global.ImportHistoriquePage = { open, load, render, state, resetState, write, SOURCE_TABLE: L.SOURCE_TABLE };
})(window);
