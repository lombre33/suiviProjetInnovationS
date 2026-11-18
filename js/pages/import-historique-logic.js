/**
 * Import de l'historique financier — règles (pures : aucun accès au DOM, ni à Grist sauf par l'objet `io` passé à execute/undo).
 * Testées dans tests/suite-import-historique.js. Planche validée par Antoine le 18/11/2026 (« la maquette est top »).
 *
 * Ce que fait l'outil (one-shot) : relier les lignes du journal `Import_Financements` (export financier, une ligne par N° OPE +
 * financeur + ligne budgétaire) aux projets et aux lignes OPE de Grist, en créant ce qui manque. Il n'écrit AUCUN montant : les
 * montants (attribué par année, consommé AE/CP) arrivent par des formules de Lignes_OPE qui lisent le journal (import régulier). Il écrit seulement :
 *  - Lignes_OPE : N_OPE et installe_chez (création), installe_chez (complétée si vide) ;
 *  - Projets : Ligne_OPE (on ajoute, on ne retire jamais), et à la création Projet, Acronyme, Programme, dates, statut, commentaire ;
 *    Programme et dates seulement s'ils sont vides (« Grist garde », l'écart est listé) ;
 *  - Import_Journal : chaque écriture (avant / après), ce qui rend un lot annulable.
 *
 * Retrouver le projet, dans cet ordre, au premier succès : 1) un N° OPE déjà dans une ligne OPE rattachée à un projet ;
 * 2) un N° décision déjà cité par un projet ; 3) le nom (égal sans accents ni majuscules, ou très proche) : « à confirmer » ;
 * 4) rien : nouveau projet, créé après accord à l'écran.
 */
(function (global) {
  'use strict';

  const SOURCE_TABLE = 'Import_Financements';
  const DETAIL_TABLE = 'Depenses_OPE';
  const JOURNAL_TABLE = 'Import_Journal';
  const JOURNAL_COLUMNS = [
    { id: 'Lot', type: 'Text' }, { id: 'Horodatage', type: 'Text' }, { id: 'Table_modifiee', type: 'Text' }, { id: 'Ligne', type: 'Int' },
    { id: 'Operation', type: 'Text' }, { id: 'Apres', type: 'Text' }, { id: 'Avant', type: 'Text' }, { id: 'Annule', type: 'Bool' }
  ];
  const YEAR_COLUMNS = ['Attribue_2022', 'Attribue_2023', 'Attribue_2024', 'Attribue_2025', 'Attribue_2026'];
  const STATUS_CLOSED = 'Suposé cloturé sans information sur ...'; // orthographe réelle du Choice dans Grist
  const STATUS_RUNNING = 'en cours';
  const CREATED_NOTE = 'Créé par l\'import de l\'historique financier (18/11/2026) : à compléter (porteur, instance…).';
  const MIN_SIMILARITY = 0.6;       // en dessous, le nom ne propose rien
  const MIN_CANDIDATE = 0.5;        // en dessous, un projet n'est même pas listé comme piste
  const MIN_LABEL_SIMILARITY = 0.75; // programmes et structures : une suggestion préremplie, à relire

  // ---------------------------------------------------------------------------------------------------------------
  // Ce que l'outil crée lui-même dans Grist (dès l'ouverture de la page ; jamais ce qui existe déjà : ensureTable / ensureColumns
  // n'ajoutent que ce qui manque). Il ne crée AUCUNE formule de montant sur Lignes_OPE ni ne convertit totalCPConsomme : ces formules
  // relèvent de l'import régulier (fil « export financier → formulaire »), qui complète la même table Import_Financements.
  // ---------------------------------------------------------------------------------------------------------------

  const SOURCE_FIELDS = [
    ['Programme', 'Programme', 'Text'], ['Projet', 'Projet', 'Text'], ['Financeur', 'Financeur', 'Text'], ['Financeurs_du_projet', 'Financeurs du projet', 'Text'],
    ['N_OPE', 'N° OPE', 'Text'], ['Libelle_operation', 'Libellé opération', 'Text'], ['Ligne_budgetaire', 'Ligne budgétaire', 'Text'],
    ['Date_debut', 'Date début', 'Date'], ['Date_fin', 'Date fin', 'Date'], ['Montant_attribue', 'Montant attribué', 'Numeric'], ['Part_du_projet', 'Part du projet', 'Numeric'],
    ['Attribue_2022', 'Attribué 2022', 'Numeric'], ['Attribue_2023', 'Attribué 2023', 'Numeric'], ['Attribue_2024', 'Attribué 2024', 'Numeric'],
    ['Attribue_2025', 'Attribué 2025', 'Numeric'], ['Attribue_2026', 'Attribué 2026', 'Numeric'],
    ['Consomme_AE', 'Consommé AE', 'Numeric'], ['Consomme_CP', 'Consommé CP', 'Numeric'], ['Disponible_AE', 'Disponible AE', 'Numeric'], ['Disponible_CP', 'Disponible CP', 'Numeric'],
    ['Statuts', 'Statuts', 'Text'], ['N_decision', 'N° décision', 'Text'], ['Structure', 'Structure', 'Text'], ['Etablissement', 'Établissement', 'Text']
  ];
  // Journal d'import : les 24 colonnes de l'export, plus Cle_ligne et Exporte_le (colonnes de données, remplies par le script d'envoi
  // quand il passe par le formulaire publié ; l'outil lit la dernière version de chaque ligne lui-même, par plus grand id).
  const SOURCE_COLUMNS = SOURCE_FIELDS.map(([id, label, type]) => ({ id, label, type }))
    .concat([{ id: 'Cle_ligne', type: 'Text' }, { id: 'Exporte_le', type: 'DateTime:Europe/Paris' }]);
  const MONEY_TOLERANCE = 0.01;
  const CHUNK = 100;                // actions Grist par appel

  const text = value => (value == null ? '' : String(value).trim());
  const toNumber = value => { if (value == null || value === '') return null; const n = Number(value); return Number.isFinite(n) ? n : null; };
  const normalize = value => text(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // Même règle que le Dashboard (DashboardLogic.opeKey) : « OPE 001 », « ope001 » et « OPE001 » désignent la même ligne.
  const opeKey = value => text(value).toUpperCase().replace(/\s+/g, '');
  const near = (a, b, tolerance = MONEY_TOLERANCE) => Math.abs(a - b) <= tolerance;
  const refListIds = value => (Array.isArray(value) ? value.filter(item => typeof item === 'number' || (typeof item === 'string' && item !== 'L' && item !== '')).map(Number) : []);
  const isEmptyRef = value => !value || value === 0 || (Array.isArray(value) && refListIds(value).length === 0);
  const isEmptyDate = value => value == null || value === '' || value === 0;
  const pushTo = (map, key, value) => { if (!map.has(key)) map.set(key, []); map.get(key).push(value); };
  const unique = list => Array.from(new Set(list));
  const sum = (list, pick) => list.reduce((total, item) => total + (toNumber(pick(item)) || 0), 0);

  function bigrams(value) {
    const padded = ' ' + value + ' ', grams = new Map();
    for (let i = 0; i < padded.length - 1; i++) { const gram = padded.slice(i, i + 2); grams.set(gram, (grams.get(gram) || 0) + 1); }
    return grams;
  }
  // Coefficient de Dice sur les bigrammes (0 à 1) ; les deux textes sont déjà normalisés.
  function dice(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const ga = bigrams(a), gb = bigrams(b);
    let common = 0, total = 0;
    ga.forEach((count, gram) => { total += count; if (gb.has(gram)) common += Math.min(count, gb.get(gram)); });
    gb.forEach(count => { total += count; });
    return total ? (2 * common) / total : 0;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 1. Journal d'envois -> une version par ligne de financement
  // ---------------------------------------------------------------------------------------------------------------

  // Clé d'une ligne : N° OPE + financeur + ligne budgétaire (à confirmer par Antoine sur le vrai export).
  const lineKeyOf = row => [opeKey(row.N_OPE), normalize(row.Financeur), normalize(row.Ligne_budgetaire)].join('|');

  // Le journal grossit à chaque envoi : on garde la dernière version de chaque ligne (plus grand id, comme la synthèse Grist).
  // Une ligne sans N° OPE n'est pas rattachable : elle est comptée à part.
  function latestVersions(rows) {
    const byKey = new Map();
    let ignored = 0;
    (rows || []).forEach(row => {
      if (!text(row.N_OPE)) { ignored++; return; }
      const key = lineKeyOf(row), previous = byKey.get(key);
      if (!previous || Number(row.id) > Number(previous.id)) byKey.set(key, row);
    });
    const lines = Array.from(byKey, ([key, row]) => Object.assign({}, row, { _key: key })).sort((a, b) => Number(a.id) - Number(b.id));
    return { lines, ignored, total: (rows || []).length };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 2. Contrôles de cohérence de l'export
  // ---------------------------------------------------------------------------------------------------------------

  const CHECKS = [
    { id: 'annees', label: 'Somme des années = montant attribué' },
    { id: 'disponible', label: 'Disponible = attribué − consommé (AE et CP)' },
    { id: 'cp-ae', label: 'Consommé CP ≤ consommé AE' },
    { id: 'parts', label: 'Parts d\'un projet = 100 %' },
    { id: 'financeurs', label: 'Financeurs du projet = financeurs de ses lignes' },
    { id: 'ope-projets', label: 'Un N° OPE appartient à un seul projet' },
    { id: 'dates', label: 'Date fin ≥ date début' }
  ];

  const projectKey = row => normalize(row.Projet);
  const splitFinanceurs = value => unique(text(value).split(';').map(normalize).filter(Boolean)).sort();

  // Renvoie les écarts trouvés ({level: 'error'|'warn', check, ope, project, message}) ; 'error' exclut la ligne de l'import.
  function checkLines(lines) {
    const issues = [];
    const add = (level, check, line, message) => issues.push({ level, check, key: line && line._key, ope: line ? text(line.N_OPE) : '', project: line ? text(line.Projet) : '', message });
    const money = n => (Math.round(n * 100) / 100).toLocaleString('fr-FR');
    lines.forEach(line => {
      if (!text(line.Projet)) { add('error', 'projet-vide', line, 'Ligne sans nom de projet'); return; }
      const attribue = toNumber(line.Montant_attribue);
      const years = YEAR_COLUMNS.map(col => toNumber(line[col])).filter(v => v != null);
      if (attribue != null && years.length) {
        const total = years.reduce((a, b) => a + b, 0);
        if (!near(total, attribue)) add('warn', 'annees', line, `Somme des années ${money(total)} ≠ montant attribué ${money(attribue)}`);
      }
      [['AE', 'Consomme_AE', 'Disponible_AE'], ['CP', 'Consomme_CP', 'Disponible_CP']].forEach(([label, consumed, available]) => {
        const c = toNumber(line[consumed]), d = toNumber(line[available]);
        if (attribue != null && c != null && d != null && !near(attribue - c, d)) add('warn', 'disponible', line, `Disponible ${label} ${money(d)} ≠ attribué − consommé (${money(attribue - c)})`);
      });
      const ae = toNumber(line.Consomme_AE), cp = toNumber(line.Consomme_CP);
      if (ae != null && cp != null && cp > ae + MONEY_TOLERANCE) add('warn', 'cp-ae', line, `Consommé CP ${money(cp)} > consommé AE ${money(ae)}`);
      const start = toNumber(line.Date_debut), end = toNumber(line.Date_fin);
      if (start != null && end != null && end < start) add('warn', 'dates', line, 'Date de fin avant la date de début');
    });
    const byProject = new Map();
    lines.forEach(line => { if (text(line.Projet)) pushTo(byProject, projectKey(line), line); });
    byProject.forEach(group => {
      const first = group[0];
      const parts = group.map(line => toNumber(line.Part_du_projet));
      if (parts.every(p => p != null)) {
        const percent = parts.some(p => p > 1.5), total = parts.reduce((a, b) => a + b, 0);
        if (!near(total, percent ? 100 : 1, 0.011)) add('warn', 'parts', first, `Parts du projet : total ${money(total)} au lieu de ${percent ? 100 : 1}`);
      }
      const declared = splitFinanceurs(first.Financeurs_du_projet), actual = unique(group.map(line => normalize(line.Financeur)).filter(Boolean)).sort();
      if (declared.length && JSON.stringify(declared) !== JSON.stringify(actual)) add('warn', 'financeurs', first, `Financeurs du projet « ${text(first.Financeurs_du_projet)} » ≠ ceux de ses lignes (${unique(group.map(l => text(l.Financeur))).join(', ')})`);
    });
    const projectsOfOpe = new Map();
    lines.forEach(line => { if (text(line.Projet)) pushTo(projectsOfOpe, opeKey(line.N_OPE), line); });
    projectsOfOpe.forEach(group => {
      const names = unique(group.map(projectKey));
      if (names.length > 1) group.forEach(line => add('error', 'ope-projets', line, `Le N° OPE ${text(line.N_OPE)} est rattaché à ${names.length} projets différents dans l'export : ${unique(group.map(l => text(l.Projet))).join(' / ')}`));
    });
    return issues;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 3. Projets de l'export (regroupement des lignes par nom de projet)
  // ---------------------------------------------------------------------------------------------------------------

  function mostCommon(list) {
    const counts = new Map();
    list.forEach(item => counts.set(item, (counts.get(item) || 0) + 1));
    return Array.from(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }

  function groupProjects(lines, issues) {
    const blockedOpe = new Map();
    (issues || []).filter(issue => issue.level === 'error' && issue.check === 'ope-projets').forEach(issue => blockedOpe.set(opeKey(issue.ope), issue.message));
    const groups = new Map(), orphans = [];
    lines.forEach(line => { if (text(line.Projet)) pushTo(groups, projectKey(line), line); else orphans.push(line); });
    const entries = Array.from(groups, ([key, group]) => {
      const opeMap = new Map();
      group.forEach(line => {
        const k = opeKey(line.N_OPE);
        if (!opeMap.has(k)) opeMap.set(k, { key: k, ope: text(line.N_OPE), structures: [], lines: [] });
        const ope = opeMap.get(k);
        ope.lines.push(line);
        if (text(line.Structure)) ope.structures.push(text(line.Structure));
      });
      const opes = Array.from(opeMap.values()).map(ope => Object.assign(ope, { structure: mostCommon(ope.structures), structureCount: unique(ope.structures).length }));
      const starts = group.map(l => toNumber(l.Date_debut)).filter(v => v != null), ends = group.map(l => toNumber(l.Date_fin)).filter(v => v != null);
      const blocked = opes.map(o => blockedOpe.get(o.key)).find(Boolean) || '';
      return {
        key, name: mostCommon(group.map(l => text(l.Projet))), lines: group, opes,
        programme: mostCommon(group.map(l => text(l.Programme)).filter(Boolean)), programmes: unique(group.map(l => text(l.Programme)).filter(Boolean)),
        financeurs: unique(group.map(l => text(l.Financeur)).filter(Boolean)), decisions: unique(group.map(l => text(l.N_decision)).filter(Boolean)),
        dateDebut: starts.length ? Math.min(...starts) : null, dateFin: ends.length ? Math.max(...ends) : null,
        attribue: sum(group, l => l.Montant_attribue), consommeAE: sum(group, l => l.Consomme_AE), consommeCP: sum(group, l => l.Consomme_CP),
        blocked
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return { entries, orphans };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 4. Contexte Grist et rapprochement
  // ---------------------------------------------------------------------------------------------------------------

  function buildContext({ projets, lignes, programmes, structures, isFormula, hasColumn }) {
    const ligneIdsByKey = new Map(), ligneById = new Map(), projectsByLigne = new Map();
    (lignes || []).forEach(ligne => { ligneById.set(Number(ligne.id), ligne); const k = opeKey(ligne.N_OPE); if (k) pushTo(ligneIdsByKey, k, Number(ligne.id)); });
    const projectById = new Map();
    const projects = (projets || []).map(project => {
      projectById.set(Number(project.id), project);
      refListIds(project.Ligne_OPE).forEach(id => pushTo(projectsByLigne, id, Number(project.id)));
      const acronyme = text(project.Acronyme), name = text(project.Projet);
      return {
        id: Number(project.id), name, acronyme, label: acronyme || name || `Projet #${project.id}`,
        nName: normalize(name), nAcr: normalize(acronyme),
        decisionText: opeKey(`${text(project.numero_descisions_OLD)} ${text(project.prolongation_numeroDecisionInitial)}`)
      };
    });
    const programmeList = (programmes || []).map(p => ({ id: Number(p.id), label: text(p.Programme), n: normalize(p.Programme) })).filter(p => p.label);
    const structureList = (structures || []).map(s => ({
      id: Number(s.id), label: text(s.Acronyme) || text(s.Nom_Complet),
      names: unique([s.Acronyme, s.Nom_Complet, s.Nom_Complet_clean].map(normalize).filter(Boolean))
    })).filter(s => s.label);
    return {
      ligneIdsByKey, ligneById, projectsByLigne, projects, projectById, programmeList, structureList,
      isFormula: isFormula || (() => false), hasColumn: hasColumn || (() => true)
    };
  }

  const candidateOf = (project, score, why) => ({ id: project.id, label: project.label, name: project.name, score, why });

  // Résultat : { status: 'sure' | 'maybe' | 'new' | 'conflict', rung, projectId, candidates, reason }
  function matchEntry(entry, ctx) {
    if (entry.blocked) return { status: 'blocked', rung: 0, projectId: null, candidates: [], reason: entry.blocked };
    // 1. N° OPE déjà rattaché à un projet
    const byOpe = new Map();
    entry.opes.forEach(ope => (ctx.ligneIdsByKey.get(ope.key) || []).forEach(ligneId => (ctx.projectsByLigne.get(ligneId) || []).forEach(projectId => pushTo(byOpe, projectId, ope.ope))));
    if (byOpe.size === 1) {
      const [projectId, opes] = Array.from(byOpe)[0], project = ctx.projectById.get(projectId);
      return { status: 'sure', rung: 1, projectId, candidates: [candidateOf(ctx.projects.find(p => p.id === projectId), 1, 'N° OPE')], reason: `N° OPE ${unique(opes).join(', ')} déjà dans ce projet`, project };
    }
    if (byOpe.size > 1) {
      const candidates = Array.from(byOpe.keys()).map(id => candidateOf(ctx.projects.find(p => p.id === id), 1, 'N° OPE'));
      return { status: 'conflict', rung: 1, projectId: null, candidates, reason: 'Les N° OPE de ce projet sont déjà dans plusieurs projets de Grist' };
    }
    // 2. N° décision déjà cité par un projet
    const decisions = entry.decisions.map(opeKey).filter(key => key.length >= 5);
    if (decisions.length) {
      const hits = ctx.projects.filter(project => project.decisionText && decisions.some(key => project.decisionText.includes(key)));
      if (hits.length === 1) return { status: 'sure', rung: 2, projectId: hits[0].id, candidates: [candidateOf(hits[0], 1, 'N° décision')], reason: `N° décision ${entry.decisions.join(', ')} déjà cité par ce projet` };
      if (hits.length > 1) return { status: 'conflict', rung: 2, projectId: null, candidates: hits.map(p => candidateOf(p, 1, 'N° décision')), reason: 'Ce N° décision est cité par plusieurs projets de Grist' };
    }
    // 3. nom
    const name = normalize(entry.name);
    const scored = ctx.projects.map(project => {
      let score = 0, why = '';
      if (project.nName) { const s = name === project.nName ? 1 : dice(name, project.nName); if (s > score) { score = s; why = s === 1 ? 'même nom' : 'nom proche'; } }
      if (project.nAcr) {
        const whole = (' ' + name + ' ').includes(' ' + project.nAcr + ' ') && project.nAcr.length >= 3;
        const s = name === project.nAcr ? 1 : (whole ? 0.9 : dice(name, project.nAcr));
        if (s > score) { score = s; why = name === project.nAcr ? 'même acronyme' : (whole ? 'acronyme dans le nom' : 'acronyme proche'); }
      }
      return { project, score, why };
    }).filter(item => item.score >= MIN_CANDIDATE).sort((a, b) => b.score - a.score);
    const candidates = scored.slice(0, 3).map(item => candidateOf(item.project, Math.round(item.score * 100) / 100, item.why));
    if (scored.length >= 2 && scored[0].score >= 0.99 && scored[1].score >= 0.99) return { status: 'conflict', rung: 3, projectId: null, candidates, reason: 'Plusieurs projets de Grist portent ce nom' };
    if (scored.length && scored[0].score >= MIN_SIMILARITY) return { status: 'maybe', rung: 3, projectId: scored[0].project.id, candidates, reason: `${scored[0].why} (${Math.round(scored[0].score * 100)} %)` };
    // 4. rien
    return { status: 'new', rung: 4, projectId: null, candidates, reason: 'Aucun projet de Grist ne correspond' };
  }

  // Correspondances à poser une fois : libellé de l'export -> ligne de Programmes / de Structures. `auto` : égalité exacte (sans accents
  // ni majuscules) ; `suggested` : très proche, à relire ; sinon id 0 (rien n'est renseigné, choix possible à l'écran).
  function buildMappings(entries, ctx) {
    const pick = (label, items, namesOf) => {
      const n = normalize(label);
      const exact = items.find(item => namesOf(item).includes(n));
      if (exact) return { id: exact.id, auto: true, suggested: false };
      let best = null, bestScore = 0;
      items.forEach(item => namesOf(item).forEach(name => { const s = dice(n, name); if (s > bestScore) { bestScore = s; best = item; } }));
      return best && bestScore >= MIN_LABEL_SIMILARITY ? { id: best.id, auto: false, suggested: true } : { id: 0, auto: false, suggested: false };
    };
    const count = new Map(), structureCount = new Map();
    entries.forEach(entry => {
      if (entry.programme) count.set(entry.programme, (count.get(entry.programme) || 0) + 1);
      entry.opes.forEach(ope => { if (ope.structure) structureCount.set(ope.structure, (structureCount.get(ope.structure) || 0) + 1); });
    });
    return {
      programmes: Array.from(count, ([label, n]) => Object.assign({ label, count: n }, pick(label, ctx.programmeList, item => [item.n]))).sort((a, b) => a.label.localeCompare(b.label, 'fr')),
      structures: Array.from(structureCount, ([label, n]) => Object.assign({ label, count: n }, pick(label, ctx.structureList, item => item.names))).sort((a, b) => a.label.localeCompare(b.label, 'fr'))
    };
  }

  function defaultAcronyme(name) {
    const head = text(name).split(/\s+-\s+/)[0].trim() || text(name);
    return head.length > 40 ? head.slice(0, 40).trim() : head;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 5. Plan d'écriture (la simulation : rien n'est écrit)
  // ---------------------------------------------------------------------------------------------------------------

  // Décision de l'utilisateur pour un projet de l'export : { mode: 'auto'|'project'|'new'|'skip', projectId, acronyme, confirmed }.
  // Un rapprochement sûr (N° OPE, N° décision) vaut confirmation ; le reste attend un clic.
  function effectiveDecision(match, decision) {
    const d = decision || { mode: 'auto' };
    if (match.status === 'blocked') return { action: 'skip', reason: 'blocked', confirmed: true };
    if (d.mode === 'skip') return { action: 'skip', reason: 'skipped', confirmed: true };
    if (d.mode === 'new') return { action: 'create', confirmed: !!d.confirmed, acronyme: d.acronyme };
    if (d.mode === 'other' && !d.projectId) return { action: 'pending', confirmed: false }; // « Autre projet… » choisi, projet pas encore désigné
    if (d.mode === 'project' && d.projectId) return { action: 'link', projectId: Number(d.projectId), confirmed: d.confirmed !== false };
    if (match.status === 'sure') return { action: 'link', projectId: match.projectId, confirmed: true };
    if (match.status === 'maybe') return { action: 'link', projectId: match.projectId, confirmed: !!d.confirmed };
    if (match.status === 'new') return { action: 'create', confirmed: !!d.confirmed, acronyme: d.acronyme };
    return { action: 'pending', confirmed: false }; // conflit : à trancher
  }

  function statusForDates(dateFin, nowSeconds) {
    return dateFin != null && dateFin < nowSeconds ? STATUS_CLOSED : STATUS_RUNNING;
  }

  // Ne garde que les colonnes que Grist accepte d'écrire : inexistantes ou calculées, elles feraient refuser toute l'action.
  function writable(ctx, table, fields) {
    const out = {};
    Object.keys(fields).forEach(col => { if (ctx.hasColumn(table, col) && !ctx.isFormula(table, col)) out[col] = fields[col]; });
    return out;
  }

  function buildPlan({ entries, matches, decisions, mappings, ctx, now }) {
    const nowSeconds = Math.floor((now || Date.now()) / 1000);
    const programmeId = new Map((mappings.programmes || []).map(m => [m.label, m.id]));
    const structureId = new Map((mappings.structures || []).map(m => [m.label, m.id]));
    const phase1 = [], phase2 = [], conflicts = [], skipped = [], notReady = [];
    const counts = { projetsCrees: 0, projetsLies: 0, opesCreees: 0, opesCompletees: 0, dejaAJour: 0, misDeCote: 0, aConfirmer: 0 };
    const opeRef = new Map(); // N° OPE (clé) -> id existant ou { tmp }
    entries.forEach(entry => {
      const match = matches.get(entry.key), decision = effectiveDecision(match, decisions.get(entry.key));
      if (decision.action === 'skip') { counts.misDeCote++; skipped.push({ entry, reason: decision.reason }); return; }
      if (decision.action === 'pending' || !decision.confirmed) { counts.aConfirmer++; notReady.push({ entry, status: match.status }); return; }
      let changed = false;
      const refs = [];
      entry.opes.forEach(ope => {
        const known = opeRef.get(ope.key);
        if (known !== undefined) { refs.push(known); return; }
        const sid = structureId.get(ope.structure) || 0, existingId = (ctx.ligneIdsByKey.get(ope.key) || [])[0];
        if (existingId) {
          refs.push(existingId); opeRef.set(ope.key, existingId);
          const ligne = ctx.ligneById.get(existingId);
          if (sid && isEmptyRef(ligne.installe_chez)) {
            const fields = writable(ctx, 'Lignes_OPE', { installe_chez: sid });
            if (Object.keys(fields).length) { phase1.push({ table: 'Lignes_OPE', kind: 'update', id: existingId, fields, before: { installe_chez: ligne.installe_chez == null ? 0 : ligne.installe_chez }, label: `OPE ${ope.ope}`, entry: entry.key }); counts.opesCompletees++; changed = true; }
          } else if (sid && !isEmptyRef(ligne.installe_chez) && Number(ligne.installe_chez) !== sid) {
            conflicts.push({ entry, field: `Structure de l'OPE ${ope.ope}`, grist: ligne.installe_chez, export: ope.structure });
          }
        } else {
          const tmp = 'ope:' + ope.key;
          refs.push({ tmp }); opeRef.set(ope.key, { tmp });
          phase1.push({ table: 'Lignes_OPE', kind: 'add', tmp, fields: writable(ctx, 'Lignes_OPE', { N_OPE: ope.ope, installe_chez: sid }), label: `OPE ${ope.ope}`, entry: entry.key });
          counts.opesCreees++; changed = true;
        }
      });
      const pid = programmeId.get(entry.programme) || 0;
      if (decision.action === 'link') {
        const project = ctx.projectById.get(decision.projectId);
        if (!project) { counts.aConfirmer++; notReady.push({ entry, status: 'conflict' }); return; }
        const current = refListIds(project.Ligne_OPE);
        const toAdd = refs.filter(ref => typeof ref === 'object' || !current.includes(ref));
        const fields = {}, before = {};
        if (toAdd.length) { fields.Ligne_OPE = ['L', ...current, ...toAdd]; before.Ligne_OPE = project.Ligne_OPE == null ? ['L'] : project.Ligne_OPE; }
        if (pid && isEmptyRef(project.Programme)) { fields.Programme = pid; before.Programme = project.Programme == null ? 0 : project.Programme; }
        else if (pid && !isEmptyRef(project.Programme) && Number(project.Programme) !== pid) conflicts.push({ entry, field: 'Programme', grist: project.Programme, export: entry.programme });
        if (entry.dateDebut != null) {
          if (isEmptyDate(project.Date_debut_Projet)) { fields.Date_debut_Projet = entry.dateDebut; before.Date_debut_Projet = project.Date_debut_Projet == null ? null : project.Date_debut_Projet; }
          else if (Number(project.Date_debut_Projet) !== entry.dateDebut) conflicts.push({ entry, field: 'Date de début', grist: project.Date_debut_Projet, export: entry.dateDebut });
        }
        if (entry.dateFin != null) {
          if (isEmptyDate(project.Date_de_fin_Projet)) { fields.Date_de_fin_Projet = entry.dateFin; before.Date_de_fin_Projet = project.Date_de_fin_Projet == null ? null : project.Date_de_fin_Projet; }
          else if (Number(project.Date_de_fin_Projet) !== entry.dateFin) conflicts.push({ entry, field: 'Date de fin', grist: project.Date_de_fin_Projet, export: entry.dateFin });
        }
        const safe = writable(ctx, 'Projets', fields);
        Object.keys(before).forEach(col => { if (!(col in safe)) delete before[col]; });
        if (Object.keys(safe).length) { phase2.push({ table: 'Projets', kind: 'update', id: project.id, fields: safe, before, label: ctx.projects.find(p => p.id === project.id).label, entry: entry.key }); counts.projetsLies++; changed = true; }
      } else {
        const fields = writable(ctx, 'Projets', {
          Projet: entry.name, Acronyme: text(decision.acronyme) || defaultAcronyme(entry.name), Programme: pid,
          Date_debut_Projet: entry.dateDebut, Date_de_fin_Projet: entry.dateFin, Ligne_OPE: ['L', ...refs],
          Statut_operationnel_projet: statusForDates(entry.dateFin, nowSeconds), comentaire_general_Suivi_projet: CREATED_NOTE,
          // Valeur par défaut de la colonne : créerait une ligne Notifications pour chaque projet importé. 0 = aucune.
          remplissage_automatique_Notifications: 0
        });
        phase2.push({ table: 'Projets', kind: 'add', tmp: 'projet:' + entry.key, fields, label: entry.name, entry: entry.key });
        counts.projetsCrees++; changed = true;
      }
      if (!changed) counts.dejaAJour++;
    });
    return { phase1, phase2, conflicts, skipped, notReady, counts, actionCount: phase1.length + phase2.length };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 6. Écriture par lots, journal, annulation
  // ---------------------------------------------------------------------------------------------------------------

  const stamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '');
  const resolveRefs = (fields, ids) => {
    const out = {};
    Object.keys(fields).forEach(col => {
      const value = fields[col];
      out[col] = Array.isArray(value) ? value.map(item => (item && typeof item === 'object' && item.tmp ? ids.get(item.tmp) : item)) : value;
    });
    return out;
  };
  const toAction = (op, ids) => {
    const fields = resolveRefs(op.fields, ids);
    return op.kind === 'add' ? ['AddRecord', op.table, null, fields] : ['UpdateRecord', op.table, op.id, fields];
  };

  // io = { apply(actions) -> Promise<retValues[]>, addJournal(rows) -> Promise, now() -> Date }
  async function execute(plan, io) {
    const when = io.now ? io.now() : new Date();
    const lot = 'LOT-' + stamp(when), horodatage = when.toISOString();
    const ids = new Map(), result = { lot, ajouts: { Lignes_OPE: [], Projets: [] }, modifs: { Lignes_OPE: [], Projets: [] }, journalise: 0, error: null };
    const run = async ops => {
      for (let start = 0; start < ops.length; start += CHUNK) {
        const chunk = ops.slice(start, start + CHUNK);
        let returned;
        try { returned = await io.apply(chunk.map(op => toAction(op, ids))); }
        catch (error) { result.error = error; return false; }
        const rows = chunk.map((op, i) => {
          const id = op.kind === 'add' ? Number(returned[i]) : op.id;
          if (op.kind === 'add') { ids.set(op.tmp, id); result.ajouts[op.table].push(id); } else result.modifs[op.table].push(id);
          return { Lot: lot, Horodatage: horodatage, Table_modifiee: op.table, Ligne: id, Operation: op.kind === 'add' ? 'ajout' : 'modif', Apres: JSON.stringify(resolveRefs(op.fields, ids)), Avant: JSON.stringify(op.before || null), Annule: false };
        });
        try { await io.addJournal(rows); result.journalise += rows.length; }
        catch (error) { result.error = result.error || error; result.journalError = true; return false; }
      }
      return true;
    };
    if (await run(plan.phase1)) await run(plan.phase2);
    return result;
  }

  const sameValue = (a, b) => (a == null && b == null) || JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);
  const rowMatches = (row, expected) => Object.keys(expected).every(col => sameValue(row[col], expected[col]) || (isEmptyRef(row[col]) && isEmptyRef(expected[col]) && !Array.isArray(expected[col])));

  // Annule un lot : remet les champs d'avant sur ce que l'outil a modifié, supprime ce qu'il a créé. Rien n'est touché quand la ligne
  // a changé depuis (modifiée à la main, ou encore utilisée par un autre projet) : elle est rendue dans `skipped` avec la raison.
  function planUndo(journalRows, lot, tables) {
    const rows = journalRows.filter(row => row.Lot === lot && !row.Annule).sort((a, b) => Number(b.id) - Number(a.id));
    const find = (table, id) => (tables[table] || []).find(row => Number(row.id) === Number(id));
    const actions = [], skipped = [], done = [];
    const removeProjects = new Set();
    const restoredRefs = new Map(); // projet -> lignes OPE qu'il aura une fois ses modifications défaites
    rows.filter(r => r.Operation === 'modif').forEach(row => {
      const current = find(row.Table_modifiee, row.Ligne), after = JSON.parse(row.Apres || '{}'), before = JSON.parse(row.Avant || '{}');
      if (!current) { skipped.push({ row, why: 'ligne disparue' }); return; }
      if (!rowMatches(current, after)) { skipped.push({ row, why: 'modifiée depuis l\'import' }); return; }
      actions.push(['UpdateRecord', row.Table_modifiee, Number(row.Ligne), before]); done.push(row.id);
      if (row.Table_modifiee === 'Projets' && 'Ligne_OPE' in before) restoredRefs.set(Number(row.Ligne), refListIds(before.Ligne_OPE));
    });
    rows.filter(r => r.Operation === 'ajout' && r.Table_modifiee === 'Projets').forEach(row => {
      const current = find('Projets', row.Ligne);
      if (!current) { skipped.push({ row, why: 'ligne disparue' }); return; }
      if (!rowMatches(current, JSON.parse(row.Apres || '{}'))) { skipped.push({ row, why: 'modifiée depuis l\'import' }); return; }
      actions.push(['RemoveRecord', 'Projets', Number(row.Ligne)]); removeProjects.add(Number(row.Ligne)); done.push(row.id);
    });
    rows.filter(r => r.Operation === 'ajout' && r.Table_modifiee === 'Lignes_OPE').forEach(row => {
      const current = find('Lignes_OPE', row.Ligne);
      if (!current) { skipped.push({ row, why: 'ligne disparue' }); return; }
      if (!rowMatches(current, JSON.parse(row.Apres || '{}'))) { skipped.push({ row, why: 'modifiée depuis l\'import' }); return; }
      const stillUsed = (tables.Projets || []).some(project => !removeProjects.has(Number(project.id))
        && (restoredRefs.has(Number(project.id)) ? restoredRefs.get(Number(project.id)) : refListIds(project.Ligne_OPE)).includes(Number(row.Ligne)));
      if (stillUsed) { skipped.push({ row, why: 'encore utilisée par un projet' }); return; }
      actions.push(['RemoveRecord', 'Lignes_OPE', Number(row.Ligne)]); done.push(row.id);
    });
    return { actions, skipped, done };
  }

  function summarizeLots(journalRows) {
    const lots = new Map();
    (journalRows || []).forEach(row => {
      if (!lots.has(row.Lot)) lots.set(row.Lot, { lot: row.Lot, horodatage: row.Horodatage, ajouts: 0, modifs: 0, annules: 0, total: 0 });
      const lot = lots.get(row.Lot);
      lot.total++;
      if (row.Annule) lot.annules++;
      else if (row.Operation === 'ajout') lot.ajouts++; else lot.modifs++;
    });
    return Array.from(lots.values()).sort((a, b) => String(b.horodatage).localeCompare(String(a.horodatage)));
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 7. Contrôle des totaux : consommé de l'export = somme du détail des dépenses (Depenses_OPE, export FD02)
  // ---------------------------------------------------------------------------------------------------------------

  function checkTotals(lines, entries, depenses) {
    if (!depenses || !depenses.length) return { available: false, rows: [], projects: [], gaps: 0, total: null };
    const detail = new Map();
    depenses.forEach(row => {
      const k = opeKey(row.Code_operation);
      if (!k) return;
      const d = detail.get(k) || { ae: 0, cp: 0, n: 0 };
      d.ae += toNumber(row.AE_consomme) || 0; d.cp += toNumber(row.CP_consomme) || 0; d.n++;
      detail.set(k, d);
    });
    const exported = new Map();
    lines.forEach(line => {
      const k = opeKey(line.N_OPE);
      const e = exported.get(k) || { ope: text(line.N_OPE), ae: 0, cp: 0, project: text(line.Projet) };
      e.ae += toNumber(line.Consomme_AE) || 0; e.cp += toNumber(line.Consomme_CP) || 0;
      exported.set(k, e);
    });
    const compare = (exportAE, exportCP, d) => {
      if (!d) return { status: 'sans-detail', diffAE: exportAE, diffCP: exportCP };
      const diffAE = exportAE - d.ae, diffCP = exportCP - d.cp;
      return { status: near(diffAE, 0, 0.5) && near(diffCP, 0, 0.5) ? 'ok' : 'ecart', diffAE, diffCP };
    };
    const rows = Array.from(exported, ([k, e]) => {
      const d = detail.get(k);
      return Object.assign({ ope: e.ope, project: e.project, exportAE: e.ae, exportCP: e.cp, detailAE: d ? d.ae : 0, detailCP: d ? d.cp : 0 }, compare(e.ae, e.cp, d));
    }).sort((a, b) => a.ope.localeCompare(b.ope, 'fr'));
    const projects = entries.map(entry => {
      const keys = entry.opes.map(o => o.key);
      const exportAE = sum(keys, k => exported.get(k)?.ae), exportCP = sum(keys, k => exported.get(k)?.cp);
      const detailAE = sum(keys, k => detail.get(k)?.ae), detailCP = sum(keys, k => detail.get(k)?.cp);
      const withDetail = keys.some(k => detail.has(k));
      return Object.assign({ key: entry.key, name: entry.name, exportAE, exportCP, detailAE, detailCP }, compare(exportAE, exportCP, withDetail ? { ae: detailAE, cp: detailCP } : null));
    });
    const extra = Array.from(detail.keys()).filter(k => !exported.has(k));
    const totalExport = { ae: sum(rows, r => r.exportAE), cp: sum(rows, r => r.exportCP) };
    const totalDetail = { ae: sum(rows, r => r.detailAE), cp: sum(rows, r => r.detailCP) };
    const gaps = rows.filter(r => r.status !== 'ok').length;
    return { available: true, rows, projects, extra, gaps, projectGaps: projects.filter(p => p.status !== 'ok').length, total: { export: totalExport, detail: totalDetail, diffAE: totalExport.ae - totalDetail.ae, diffCP: totalExport.cp - totalDetail.cp } };
  }

  global.ImportHistoriqueLogic = {
    SOURCE_TABLE, DETAIL_TABLE, JOURNAL_TABLE, JOURNAL_COLUMNS, SOURCE_COLUMNS, YEAR_COLUMNS, STATUS_CLOSED, STATUS_RUNNING, CREATED_NOTE, CHECKS, CHUNK,
    normalize, opeKey, dice, refListIds, defaultAcronyme, lineKeyOf,
    latestVersions, checkLines, groupProjects, buildContext, matchEntry, buildMappings, effectiveDecision, buildPlan,
    execute, planUndo, summarizeLots, checkTotals
  };
})(window);
