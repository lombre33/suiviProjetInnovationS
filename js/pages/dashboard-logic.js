/**
 * Dashboard financier — règles de calcul (pures : aucun accès au DOM ni à Grist, testées dans tests/suite-dashboard.js).
 *
 * Maquette validée par Antoine le 10/11/2026 ; mise en œuvre le 18/11/2026. « Bilan » 2023-2026 pour l'instant.
 *
 * D'où viennent les chiffres (une seule fonction, buildDataset, lit Grist : changer de source ne touche que celle-là) :
 *  - Attribué, par année : Projets.cAAAA_M10_Fonctionnement + cAAAA_M20_Investissement + cAAAA_M30_Personnel (AAAA = 2023…2026),
 *    plus les mêmes colonnes suffixées _2/_3/_4 des OPE 2 à 4 d'un projet qui en porte plusieurs (js/core/project-opes.js).
 *    Ni Projets.Montant_attribue_Total (il ne somme que 2026-2028) ni Total_AAAA (formules qui renvoient "" à 0).
 *  - Consommé, par année : somme des lignes de la table Depenses_OPE (export FD02 « Consommation détaillée des AE ») dont
 *    Code_operation correspond à une ligne OPE du projet (Projets.Ligne_OPE, ou Ligne_OPE_2/_3/_4 → Lignes_OPE.N_OPE). CP = Total CP consommé,
 *    AE = Total AE consommé ; l'utilisateur choisit la mesure.
 *  - Reliquat « sans année » : Lignes_OPE.totalCPConsomme (un seul total par ligne OPE) moins les CP déjà détaillés dans
 *    Depenses_OPE, quand il est positif. Mesure CP seulement (il n'existe pas de total AE dans Lignes_OPE). Sans ce repli, un
 *    projet dont le détail n'a pas encore été importé afficherait 0 consommé.
 *  - Statut du projet : Projets.Statut_operationnel_projet (Choice ; Statut_Macro est une formule, donc non modifiable).
 *
 * Pastille « écart » (18/11/2026, avec le fil de fusion de l'historique) : sur un projet, elle signale que le consommé de ses lignes OPE
 *    (Lignes_OPE.totalCPConsomme, et Consomme_AE quand la colonne existe) ne correspond pas à la somme du détail Depenses_OPE de ces mêmes
 *    lignes, TOUS exercices confondus (donc indépendante des filtres de la page). Même règle que le contrôle des totaux de l'outil
 *    d'import historique (ImportHistoriqueLogic.checkTotals) : tolérance GAP_TOLERANCE, et un projet dont aucune ligne OPE n'a de détail
 *    est « sans détail » plutôt qu'en écart chiffré (sauf s'il n'a rien consommé : rien à signaler). Rien n'est signalé tant que
 *    Depenses_OPE est vide (détail pas encore importé : tous les projets seraient « sans détail »).
 *
 * Détail par OPE (24/11/2026, plusieurs OPE par projet) : project.opes = une entrée par OPE du projet (rang 1 toujours, rangs 2 à 4 quand ils portent
 *    des données) avec ses lignes OPE, son attribué par année (colonnes de CET OPE) et son consommé (dépenses de ses lignes + reliquat « sans année » ligne par
 *    ligne). Une ligne OPE posée sur deux rangs du même projet n'est comptée qu'au premier. Les totaux du projet restent la somme de toutes les OPE.
 *  - Bailleur de chaque OPE (26/11/2026) : Projets.Bailleur, Bailleur_2/_3/_4 (Choice InnovationS / Idex, vide = InnovationS ; toute autre valeur compte avec Idex). Le Dashboard ne compte
 *    qu'InnovationS par défaut ; la puce « Idex » du bandeau ajoute les OPE Idex. Le calcul est fait OPE par OPE : un projet n'est listé que si une de ses OPE est comptée, ses
 *    montants sont la somme des OPE comptées, et « + Idex » (idexHidden) marque un projet dont une OPE Idex n'est pas comptée. Un projet dont toutes les OPE sont comptées garde ses totaux d'origine.
 *  - Dépenses détaillées par OPE puis par grande masse (26/11/2026) : ope.expenses (dépenses des lignes de l'OPE, une ligne OPE posée sur deux rangs ne compte qu'au premier) classées en
 *    Fonctionnement / Investissement / Personnel d'après Depenses_OPE.Nature_depense (« M10 », « M20 », « M30 » ou le libellé de la masse) ; le reste va dans « Autres ».
 *  - Consommé CP d'une ligne OPE : Lignes_OPE.totalCPConsomme seule (l'import UB Invest y écrit le consommé CP ; la colonne Consomme_CP n'existera jamais, décision d'Antoine du 24/11).
 *
 * Choix de présentation : une dépense dont l'exercice sort de 2023-2026 n'est comptée nulle part (elle est signalée en bas de
 * page) ; une dépense dont le code opération ne correspond à aucune ligne OPE de projet va dans le volet « Sans projet
 * rattaché ». Quand une ligne OPE appartient à plusieurs projets, ses dépenses vont au premier (jamais comptées deux fois).
 */
(function (global) {
  'use strict';

  const YEARS = [2023, 2024, 2025, 2026];
  const NO_YEAR = 0;
  const NO_YEAR_LABEL = 'Sans année';
  const NO_PROGRAMME = 'Sans programme';
  const MEASURES = ['CP', 'AE'];
  // Écart toléré entre le consommé d'une ligne OPE et la somme de son détail (euros) : celui de ImportHistoriqueLogic.checkTotals.
  const GAP_TOLERANCE = 0.5;
  const MASSES = ['M10_Fonctionnement', 'M20_Investissement', 'M30_Personnel'];
  // Valeurs de Projets.Statut_operationnel_projet (Choice) : sert quand le schéma n'a pas pu être lu.
  const STATUS_FALLBACK = ['en cours', 'Brouillon', 'En retard', 'cloturé avec Reliquat à traiter', 'Cloturé et reliquat traités', 'En attente des dispo des fonds', 'Suposé cloturé sans information sur ...'];
  const STATUS_COLORS = {
    'en cours': { bg: '#e8f0fe', fg: '#1d4fb8', dot: '#2f6fed' },
    'Brouillon': { bg: '#eef1f6', fg: '#475467', dot: '#98a2b3' },
    'En retard': { bg: '#fbe9e9', fg: '#b42323', dot: '#d84343' },
    'cloturé avec Reliquat à traiter': { bg: '#fef3c7', fg: '#7c4a03', dot: '#d97706' },
    'Cloturé et reliquat traités': { bg: '#e5f6ee', fg: '#146c47', dot: '#1a8f5e' },
    'En attente des dispo des fonds': { bg: '#eceff7', fg: '#444f78', dot: '#7a86b6' },
    'Suposé cloturé sans information sur ...': { bg: '#f3f0fa', fg: '#5b4b8a', dot: '#8b7bc0' }
  };
  const STATUS_NEUTRAL = { bg: '#eef1f6', fg: '#475467', dot: '#98a2b3' };

  // --- Petits outils -----------------------------------------------------------------------------
  const text = value => (value == null ? '' : String(value).trim());
  const num = value => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
  const fold = value => text(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // Les codes opération s'écrivent avec ou sans espaces, en majuscules ou non selon l'export : on les compare sans.
  const opeKey = value => text(value).replace(/\s+/g, '').toUpperCase();
  function refId(value) {
    const raw = value && typeof value === 'object' ? (value.id ?? value.rowId) : value;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : 0;
  }
  // ReferenceList Grist : ['L', 3, 5] (le repère 'L' est réel) ; un identifiant seul est aussi accepté.
  function refIds(value) {
    if (Array.isArray(value)) return value.filter((item, i) => !(i === 0 && item === 'L')).map(refId).filter(Boolean);
    const id = refId(value);
    return id ? [id] : [];
  }
  // Date Grist : secondes depuis 1970 → AAAA-MM-JJ ('' quand vide).
  function isoDate(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return '';
    return new Date(value * 1000).toISOString().slice(0, 10);
  }
  // Bailleur d'une OPE : vide ou InnovationS → 'inn', tout le reste (Idex, autre bailleur) → 'idx'.
  const bailleurClass = value => { const f = fold(value); return !f || f === 'innovations' ? 'inn' : 'idx'; };
  const bailleurLabel = value => text(value) || 'InnovationS';
  // Grande masse d'une dépense FD02 d'après Nature_depense : « M10 »/« M20 »/« M30 » (avec ou sans suite) ou le libellé de la masse ; '' = non classée.
  const MASSE_LABELS = { M10_Fonctionnement: 'Fonctionnement', M20_Investissement: 'Investissement', M30_Personnel: 'Personnel' };
  function masseOf(nature) {
    const f = fold(nature).replace(/\s+/g, '');
    if (!f) return '';
    if (/^m?10(?!\d)/.test(f) || f.includes('fonctionnement')) return 'M10_Fonctionnement';
    if (/^m?20(?!\d)/.test(f) || f.includes('investissement')) return 'M20_Investissement';
    if (/^m?30(?!\d)/.test(f) || f.includes('personnel')) return 'M30_Personnel';
    return '';
  }
  const yearLabel = year => (year === NO_YEAR ? NO_YEAR_LABEL : String(year));
  // Consommé CP d'une ligne OPE : totalCPConsomme (l'import UB Invest y écrit le consommé CP, il n'y a pas de colonne Consomme_CP).
  const lineCP = line => num(line.totalCPConsomme);
  const BUDGET_YEARS = [2023, 2024, 2025, 2026, 2027, 2028, 2029];
  // Montant attribué d'une année sur l'OPE d'un rang (rang 1 = colonnes historiques, 2 à 4 = colonnes suffixées).
  function rankAmount(row, year, rank, opes) {
    if (opes) return opes.yearAmount(row, year, [rank]);
    return rank === 1 ? MASSES.reduce((sum, mass) => sum + num(row[`c${year}_${mass}`]), 0) : 0;
  }
  // Une entrée par OPE du projet : le rang 1 toujours, les rangs 2 à 4 seulement quand ils portent des données.
  function opeEntries(row, ligneById, opes) {
    const ranks = opes ? opes.ranks().filter(rank => rank === 1 || opes.hasData(opes.read(row, rank))) : [1];
    return ranks.map(rank => {
      const read = opes ? opes.read(row, rank) : null;
      const ids = read ? read.ligneIds : refIds(row.Ligne_OPE);
      const att = {};
      const attMasse = {};
      MASSES.forEach(mass => { attMasse[mass] = {}; });
      YEARS.forEach(year => {
        att[year] = rankAmount(row, year, rank, opes);
        MASSES.forEach(mass => { attMasse[mass][year] = num(row[`c${year}_${mass}${rank > 1 ? `_${rank}` : ''}`]); });
      });
      const lines = ids.map(id => ligneById.get(id)).filter(Boolean);
      return {
        rank, ligneIds: ids, att, attMasse, budget: BUDGET_YEARS.reduce((sum, year) => sum + rankAmount(row, year, rank, opes), 0),
        bailleur: bailleurLabel(read ? read.bailleur : ''),
        lines: lines.map(line => ({ id: line.id, key: opeKey(line.N_OPE), code: text(line.N_OPE), libelle: text(line.N_OPE_LibelleOperation), CP: lineCP(line), AE: num(line.Consomme_AE) })),
        cons: null, keys: new Set(), expenses: []
      };
    });
  }

  // Montants : « 1 240 000 € » (jamais de centimes), et « 1,2 M€ » / « 850 k€ » pour les graphiques.
  function eur(value) {
    const n = Math.round(num(value));
    return `${n < 0 ? '-' : ''}${String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`;
  }
  function compact(value) {
    const n = num(value);
    if (n >= 1e6) return `${String(Math.round(n / 1e5) / 10).replace('.', ',')} M€`;
    if (n >= 1000) return `${Math.round(n / 1e3)} k€`;
    return n > 0 ? `${Math.round(n)} €` : '0 €';
  }
  const pctN = (cons, att) => (att > 0 ? Math.round((cons / att) * 100) : 0);
  const pctText = (cons, att) => (att > 0 ? `${pctN(cons, att)} %` : (cons > 0 ? '—' : '0 %'));
  const statusColors = status => STATUS_COLORS[status] || STATUS_NEUTRAL;

  // --- Écart entre la ligne OPE et le détail des dépenses -------------------------------------------
  // Une ligne OPE n'est évaluée que par le projet à qui ses dépenses sont rattachées (le premier qui la porte).
  // Résultat : null (rien à signaler) ou { kind: 'gap' | 'nodetail', CP, detailCP, diffCP, AE, detailAE, diffAE, withAE, items }.
  function gapOf(project, opeOwner, withAE) {
    const lines = new Map();
    project.opeLines.forEach(line => {
      if (!line.key || opeOwner.get(line.key) !== project) return;
      const merged = lines.get(line.key) || { code: line.code, CP: 0, AE: 0 };
      merged.CP += line.CP; merged.AE += line.AE; lines.set(line.key, merged);
    });
    const differs = (cp, ae) => Math.abs(cp) > GAP_TOLERANCE || (withAE && Math.abs(ae) > GAP_TOLERANCE);
    const total = { CP: 0, AE: 0, detailCP: 0, detailAE: 0, withDetail: false };
    const items = [];
    lines.forEach((line, key) => {
      const detail = project.detailByKey.get(key);
      total.CP += line.CP; total.AE += line.AE;
      if (detail) { total.withDetail = true; total.detailCP += detail.CP; total.detailAE += detail.AE; }
      const diffCP = line.CP - (detail ? detail.CP : 0), diffAE = line.AE - (detail ? detail.AE : 0);
      if (differs(diffCP, diffAE)) items.push({ code: line.code, kind: detail ? 'gap' : 'nodetail', CP: line.CP, detailCP: detail ? detail.CP : 0, diffCP, AE: line.AE, detailAE: detail ? detail.AE : 0, diffAE });
    });
    const diffCP = total.CP - total.detailCP, diffAE = total.AE - total.detailAE;
    // Même règle que checkTotals : sans aucun détail, « sans détail » (mais pas quand rien n'a été consommé) ; sinon un écart chiffré
    // (aussi quand deux lignes OPE du projet se compensent : l'écart d'une ligne reste un écart).
    const kind = total.withDetail ? (items.length || differs(diffCP, diffAE) ? 'gap' : '') : (differs(total.CP, total.AE) ? 'nodetail' : '');
    return kind ? { kind, CP: total.CP, detailCP: total.detailCP, diffCP, AE: total.AE, detailAE: total.detailAE, diffAE, withAE, items } : null;
  }

  // --- Données -----------------------------------------------------------------------------------
  // projets : lignes de Projets ; programmes : Programmes ; lignes : Lignes_OPE ; depenses : Depenses_OPE (peut être vide).
  function buildDataset({ projets = [], programmes = [], lignes = [], depenses = [] } = {}) {
    const programmeLabel = new Map(programmes.map(row => [row.id, text(row.Programme)]));
    const ligneById = new Map(lignes.map(row => [row.id, row]));
    const opeOwner = new Map(); // code opération normalisé → projet (le premier qui le porte)
    const projects = projets.map(row => {
      // Plusieurs OPE par projet (24/11/2026) : les lignes et les montants des OPE 2 à 4 (colonnes Ligne_OPE_2…, cAAAA_*_2…) s'ajoutent à ceux de l'OPE 1.
      const opes = global.CoreOpes;
      const lines = (opes ? opes.ligneIds(row) : refIds(row.Ligne_OPE)).map(id => ligneById.get(id)).filter(Boolean);
      const ope = lines.map(line => text(line.N_OPE)).filter(Boolean);
      const att = {};
      YEARS.forEach(year => { att[year] = MASSES.reduce((sum, mass) => sum + num(row[`c${year}_${mass}`]), 0) + (opes ? opes.yearAmount(row, year, [2, 3, 4]) : 0); });
      const acronyme = text(row.Acronyme) || text(row.Projet) || `Projet ${row.id}`;
      const project = {
        id: row.id, row, acronyme, titre: text(row.Projet) && text(row.Projet) !== acronyme ? text(row.Projet) : '',
        programme: programmeLabel.get(refId(row.Programme)) || NO_PROGRAMME,
        statut: text(row.Statut_operationnel_projet),
        att, ope, totalCP: lines.reduce((sum, line) => sum + lineCP(line), 0),
        opeLines: lines.map(line => ({ key: opeKey(line.N_OPE), code: text(line.N_OPE), CP: lineCP(line), AE: num(line.Consomme_AE) })),
        opes: opeEntries(row, ligneById, opes),
        detailByKey: new Map(), gap: null,
        expenses: [], cons: { CP: {}, AE: {} }
      };
      ope.forEach(code => { if (!opeOwner.has(opeKey(code))) opeOwner.set(opeKey(code), project); });
      return project;
    });

    const withAE = lignes.some(line => Object.prototype.hasOwnProperty.call(line, 'Consomme_AE')); // colonne créée par le fil d'import
    const orphans = [];
    const outOfRange = { count: 0, CP: 0, AE: 0 };
    depenses.forEach(row => {
      const year = Number(row.Exercice);
      const expense = {
        id: row.id, year, code: text(row.Code_operation), key: opeKey(row.Code_operation),
        nature: text(row.Nature_depense), destination: text(row.Destination), destinationLibelle: text(row.Libelle_destination),
        ej: text(row.Num_EJ), typeObjet: text(row.Type_objet), libelle: text(row.Libelle_objet),
        date: isoDate(row.Date_creation), fournisseur: text(row.Fournisseur), etat: text(row.Etat),
        AE: num(row.AE_consomme), CP: num(row.CP_consomme), domaine: text(row.Domaine), masse: masseOf(row.Nature_depense)
      };
      const owner = opeOwner.get(opeKey(row.Code_operation));
      if (owner) { // détail par code opération, tous exercices (sert à la pastille « écart »)
        const key = opeKey(row.Code_operation), detail = owner.detailByKey.get(key) || { CP: 0, AE: 0 };
        detail.CP += expense.CP; detail.AE += expense.AE; owner.detailByKey.set(key, detail);
      }
      if (!YEARS.includes(year)) { // hors du bilan : ni compté ni rattaché, mais signalé
        outOfRange.count += 1; outOfRange.CP += expense.CP; outOfRange.AE += expense.AE;
        if (owner) owner.detailedCP = (owner.detailedCP || 0) + expense.CP;
        return;
      }
      if (owner) owner.expenses.push(expense); else orphans.push(expense);
    });

    projects.forEach(project => {
      MEASURES.forEach(measure => { YEARS.forEach(year => { project.cons[measure][year] = 0; }); project.cons[measure][NO_YEAR] = 0; });
      project.expenses.forEach(expense => MEASURES.forEach(measure => { project.cons[measure][expense.year] += expense[measure]; }));
      project.expenses.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.year - a.year || a.id - b.id);
      const detailedCP = project.expenses.reduce((sum, expense) => sum + expense.CP, 0) + (project.detailedCP || 0);
      project.undetailedCP = Math.max(0, project.totalCP - detailedCP);
      project.cons.CP[NO_YEAR] = project.undetailedCP;
      project.gap = depenses.length ? gapOf(project, opeOwner, withAE) : null;
      // Consommé de chaque OPE : ses dépenses par exercice, et le reliquat « sans année » ligne par ligne (une ligne posée sur deux rangs ne compte qu'une fois).
      const seenLines = new Set();
      project.opes.forEach(ope => {
        ope.cons = { CP: {}, AE: {} };
        MEASURES.forEach(measure => { YEARS.forEach(year => { ope.cons[measure][year] = 0; }); ope.cons[measure][NO_YEAR] = 0; });
        const keys = new Set();
        let undetailed = 0;
        ope.lines.forEach(line => {
          if (seenLines.has(line.id)) return;
          seenLines.add(line.id);
          if (line.key) { keys.add(line.key); ope.keys.add(line.key); }
          const detail = line.key ? project.detailByKey.get(line.key) : null;
          undetailed += Math.max(0, line.CP - (detail ? detail.CP : 0));
        });
        project.expenses.forEach(expense => {
          if (!keys.has(expense.key)) return;
          ope.expenses.push(expense);
          MEASURES.forEach(measure => { ope.cons[measure][expense.year] += expense[measure]; });
        });
        ope.cons.CP[NO_YEAR] = undetailed;
      });
    });
    orphans.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.year - a.year || a.id - b.id);
    return { projects, orphans, outOfRange, withAE };
  }

  // --- Filtres et calcul --------------------------------------------------------------------------
  // state : { years: null | [..] (null = toutes), programmes: [], statuts: [], search: '', measure: 'CP' | 'AE', innovations: true, idex: false (bailleurs comptés ; jamais aucun) }
  // Graphiques repliés par défaut (demande d'Antoine du 18/11/2026) ; les totaux restent visibles dans la ligne « Total » de la liste.
  function defaultState() { return { years: null, programmes: [], statuts: [], search: '', measure: 'CP', charts: false, engine: 'bi', innovations: true, idex: false }; } // engine : 'bi' (Grist-BI) ou 'maison'

  // `dated` = consommé rattaché à une année : le reliquat « Sans année » (total de la ligne OPE, cumulé depuis l'origine, donc pas
  // comparable à l'attribué 2023-2026) n'est jamais signalé comme un dépassement.
  const sumRows = rows => rows.reduce((total, row) => ({ att: total.att + row.att, cons: total.cons + row.cons, dated: total.dated + (row.year === NO_YEAR ? 0 : row.cons) }), { att: 0, cons: 0, dated: 0 });

  function compute(dataset, rawState, statusChoices) {
    const state = Object.assign(defaultState(), rawState || {});
    const measure = MEASURES.includes(state.measure) ? state.measure : 'CP';
    const hasNoYear = dataset.projects.some(project => project.cons[measure][NO_YEAR] > 0);
    const availableYears = hasNoYear ? YEARS.concat([NO_YEAR]) : YEARS.slice();
    const picked = Array.isArray(state.years) ? state.years.filter(year => availableYears.includes(year)) : [];
    const selYears = picked.length ? picked : availableYears;
    const allYears = selYears.length === availableYears.length;
    const query = fold(state.search);

    // Bailleurs comptés (OPE par OPE) : InnovationS par défaut, Idex à la demande ; jamais aucun (les deux décochés = InnovationS).
    const includeIdx = !!state.idex;
    const includeInn = state.innovations !== false || !includeIdx;
    const counted = ope => (bailleurClass(ope.bailleur) === 'inn' ? includeInn : includeIdx);
    // Ce que le projet montre : ses OPE comptées (montants, dépenses, lignes). Toutes comptées = totaux d'origine du projet ; aucune = projet absent (null).
    function viewOf(project) {
      const opes = project.opes.filter(counted);
      if (!opes.length) return null;
      const excluded = project.opes.length - opes.length;
      if (!excluded) return { att: project.att, cons: project.cons, expenses: project.expenses, undetailedCP: project.undetailedCP, opes, excluded: 0 };
      const att = {}, cons = { CP: {}, AE: {} };
      YEARS.forEach(year => { att[year] = opes.reduce((sum, ope) => sum + (ope.att[year] || 0), 0); });
      MEASURES.forEach(measure => YEARS.concat([NO_YEAR]).forEach(year => { cons[measure][year] = opes.reduce((sum, ope) => sum + (ope.cons[measure][year] || 0), 0); }));
      const keys = new Set();
      opes.forEach(ope => ope.keys.forEach(key => keys.add(key)));
      return { att, cons, expenses: project.expenses.filter(expense => keys.has(expense.key)), undetailedCP: cons.CP[NO_YEAR], opes, excluded };
    }

    const passes = project => (!state.programmes.length || state.programmes.includes(project.programme))
      && (!state.statuts.length || state.statuts.includes(project.statut))
      && (!query || fold(`${project.acronyme} ${project.titre}`).includes(query));

    // Une ligne par projet visible et par année choisie.
    const rows = [];
    const perProject = [];
    let hiddenByBailleur = 0;
    dataset.projects.filter(passes).forEach(project => {
      const view = viewOf(project);
      if (!view) { hiddenByBailleur += 1; return; }
      const mine = selYears.map(year => ({ project, programme: project.programme, year, att: view.att[year] || 0, cons: view.cons[measure][year] || 0 }));
      const total = sumRows(mine);
      // Quand toutes les années sont choisies, un projet sans montant reste listé (statut à renseigner) ; sinon il disparaît.
      if (!allYears && total.att + total.cons === 0) return;
      rows.push(...mine);
      perProject.push({ project, view, att: total.att, cons: total.cons, dated: total.dated });
    });

    // Graphiques : détail progressif année > programme > projet (graphique 1) et programme > année > projet (graphique 2).
    // Cliquer une barre filtre sur sa valeur ; le fil d'Ariane remonte (il retire le filtre du niveau).
    const isOne = dim => (dim === 'year' ? !!(Array.isArray(state.years) && picked.length === 1) : state.programmes.length === 1);
    const valueOf = dim => (dim === 'year' ? picked[0] : state.programmes[0]);
    const chart = (dims, rootLabel) => {
      const level = isOne(dims[0]) ? (isOne(dims[1]) ? 2 : 1) : 0;
      const groupBy = level === 2 ? 'project' : dims[level];
      const groups = new Map();
      rows.forEach(row => {
        const key = groupBy === 'year' ? row.year : (groupBy === 'programme' ? row.programme : row.project.id);
        const group = groups.get(key) || { key, label: groupBy === 'year' ? yearLabel(row.year) : (groupBy === 'programme' ? row.programme : row.project.acronyme), att: 0, cons: 0, dated: 0 };
        group.att += row.att; group.cons += row.cons; group.dated += row.year === NO_YEAR ? 0 : row.cons;
        groups.set(key, group);
      });
      const items = Array.from(groups.values()).filter(group => group.att + group.cons > 0);
      items.sort(groupBy === 'year' ? (a, b) => (a.key === NO_YEAR ? 1 : b.key === NO_YEAR ? -1 : a.key - b.key) : (a, b) => b.att - a.att || String(a.label).localeCompare(String(b.label), 'fr'));
      const max = Math.max(1, ...items.map(group => Math.max(group.att, group.cons)));
      const labelOf = (dim, value) => (dim === 'year' ? yearLabel(value) : String(value));
      const crumbs = [{ label: rootLabel, reset: dims.slice(), current: level === 0 }];
      if (level >= 1) crumbs.push({ label: labelOf(dims[0], valueOf(dims[0])), reset: [dims[1]], current: level === 1 });
      if (level === 2) crumbs.push({ label: labelOf(dims[1], valueOf(dims[1])), reset: [], current: true });
      return {
        level, dim: level < 2 ? dims[level] : '', crumbs,
        items: items.map(group => ({
          key: group.key, label: group.label, att: group.att, cons: group.cons, over: group.dated > group.att,
          pct: pctText(group.cons, group.att), ratio: { att: group.att / max, cons: group.cons / max }
        }))
      };
    };

    // Volets : un par programme, ses projets dessous.
    const byProgramme = new Map();
    perProject.forEach(entry => {
      const list = byProgramme.get(entry.project.programme) || [];
      list.push(entry); byProgramme.set(entry.project.programme, list);
    });
    const groups = Array.from(byProgramme.entries()).map(([programme, entries]) => {
      const total = sumRows(entries);
      const counts = new Map();
      entries.forEach(entry => counts.set(entry.project.statut, (counts.get(entry.project.statut) || 0) + 1));
      return {
        programme, count: entries.length, att: total.att, cons: total.cons, pct: pctText(total.cons, total.att), over: total.dated > total.att,
        statusCounts: Array.from(counts.entries()).map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'fr')),
        projects: entries.map(entry => {
          const expenses = entry.view.expenses.filter(expense => selYears.includes(expense.year));
          // Une ligne par OPE comptée (attribué et consommé sur les années choisies, dépenses détaillées, attribué par masse).
          const opeRows = entry.view.opes.map(ope => {
            const t = sumRows(selYears.map(year => ({ year, att: ope.att[year] || 0, cons: ope.cons[measure][year] || 0 })));
            const attMasse = {};
            MASSES.forEach(mass => { attMasse[mass] = selYears.reduce((sum, year) => sum + (ope.attMasse[mass][year] || 0), 0); });
            return {
              key: `${entry.project.id}:${ope.rank}`, rank: ope.rank, codes: ope.lines.map(line => line.code).filter(Boolean), libelle: ope.lines.map(line => line.libelle).filter(Boolean).join(' · '),
              withoutLine: ope.lines.length === 0, bailleur: ope.bailleur, att: t.att, cons: t.cons, over: t.dated > t.att, pct: pctText(t.cons, t.att),
              expenses: ope.expenses.filter(expense => selYears.includes(expense.year)), attMasse,
              undetailed: selYears.includes(NO_YEAR) && measure === 'CP' ? (ope.cons.CP[NO_YEAR] || 0) : 0
            };
          });
          return {
            project: entry.project, att: entry.att, cons: entry.cons, over: entry.dated > entry.att, pct: pctText(entry.cons, entry.att),
            expenses, undetailed: selYears.includes(NO_YEAR) && measure === 'CP' ? entry.view.undetailedCP : 0, opes: opeRows, excludedOpes: entry.view.excluded
          };
        }).sort((a, b) => a.project.acronyme.localeCompare(b.project.acronyme, 'fr'))
      };
    }).sort((a, b) => (a.programme === NO_PROGRAMME) - (b.programme === NO_PROGRAMME) || a.programme.localeCompare(b.programme, 'fr'));

    const total = sumRows(rows);
    const gapCount = { gap: 0, nodetail: 0 };
    perProject.forEach(entry => { if (entry.project.gap) gapCount[entry.project.gap.kind] += 1; });
    const statuses = (statusChoices && statusChoices.length ? statusChoices : STATUS_FALLBACK).slice();
    dataset.projects.forEach(project => { if (project.statut && !statuses.includes(project.statut)) statuses.push(project.statut); });
    const orphanExpenses = selYears.length ? dataset.orphans.filter(expense => selYears.includes(expense.year)) : [];
    const noProjectFilter = !state.programmes.length && !state.statuts.length && !query;

    return {
      measure, years: availableYears, selYears, allYears, rows,
      kpi: { att: total.att, cons: total.cons, pct: pctText(total.cons, total.att), pctN: pctN(total.cons, total.att), reste: Math.max(0, total.att - total.cons), over: total.dated > total.att },
      chartA: chart(['year', 'programme'], 'Années'), chartB: chart(['programme', 'year'], 'Programmes'),
      groups, count: perProject.length, gapCount,
      bailleur: { innovations: includeInn, idex: includeIdx, idexProjects: dataset.projects.filter(project => project.opes.some(ope => bailleurClass(ope.bailleur) === 'idx')).length, hidden: hiddenByBailleur },
      options: { programmes: Array.from(new Set(dataset.projects.map(project => project.programme))).sort((a, b) => (a === NO_PROGRAMME) - (b === NO_PROGRAMME) || a.localeCompare(b, 'fr')), statuses },
      orphans: noProjectFilter && orphanExpenses.length ? { expenses: orphanExpenses, AE: orphanExpenses.reduce((s, e) => s + e.AE, 0), CP: orphanExpenses.reduce((s, e) => s + e.CP, 0) } : null,
      outOfRange: dataset.outOfRange.count ? dataset.outOfRange : null
    };
  }

  // --- Table plate pour Grist-BI --------------------------------------------------------------------------------------------------
  // Une ligne « Attribué » et une ligne « Consommé » par projet et par année choisie (« Sans année » comprise) : les graphiques de
  // Grist-BI additionnent `Montant` par `Mesure`. `Reste` = attribué − consommé, SIGNÉ, porté par la ligne Attribué : sa somme sur
  // n'importe quel regroupement est le reste de ce regroupement (un projet en dépassement a un reste négatif). Les lignes Attribué
  // viennent d'abord (ordre de la légende). Même filtres que le reste de la page (années, programmes, statuts, recherche, CP/AE).
  const BI_TABLE = 'Dashboard_Financier';
  const BI_MONEY = '{"numMode":"currency","currency":"EUR","decimals":0}';
  const BI_COLUMNS = [
    { id: 'Programme', type: 'Text' }, { id: 'Projet', type: 'Text' }, { id: 'Statut', type: 'Text' },
    { id: 'Annee', type: 'Text' }, { id: 'Mesure', type: 'Text' },
    { id: 'Montant', type: 'Numeric', widgetOptions: BI_MONEY }, { id: 'Attribue', type: 'Numeric', widgetOptions: BI_MONEY },
    { id: 'Consomme', type: 'Numeric', widgetOptions: BI_MONEY }, { id: 'Reste', type: 'Numeric', widgetOptions: BI_MONEY }
  ];
  const BI_NO_STATUS = 'Sans statut';
  function biRows(result) {
    const kept = (result && result.rows || []).filter(row => row.att || row.cons);
    const base = row => ({ Programme: row.programme, Projet: row.project.acronyme, Statut: row.project.statut || BI_NO_STATUS, Annee: yearLabel(row.year) });
    const attribue = kept.map(row => Object.assign(base(row), { Mesure: 'Attribué', Montant: row.att, Attribue: row.att, Consomme: 0, Reste: row.att - row.cons }));
    const consomme = kept.map(row => Object.assign(base(row), { Mesure: 'Consommé', Montant: row.cons, Attribue: 0, Consomme: row.cons, Reste: 0 }));
    return attribue.concat(consomme);
  }

  // Applique le clic sur une barre ou un maillon du fil d'Ariane à l'état des filtres.
  function drillState(state, dim, value) {
    const next = Object.assign({}, state);
    if (dim === 'year') next.years = value == null ? null : [value];
    else next.programmes = value == null ? [] : [value];
    return next;
  }
  // Bascule d'une année dans le bandeau : null (= toutes) quand les cases sont à nouveau toutes cochées ; jamais « aucune ».
  function toggleYear(state, year, availableYears) {
    const current = Array.isArray(state.years) && state.years.length ? state.years.filter(y => availableYears.includes(y)) : availableYears.slice();
    const next = current.includes(year) ? current.filter(y => y !== year) : current.concat([year]).sort((a, b) => a - b);
    return next.length === 0 || next.length === availableYears.length ? null : next;
  }

  global.DashboardLogic = {
    YEARS, NO_YEAR, NO_YEAR_LABEL, NO_PROGRAMME, MEASURES, MASSES, GAP_TOLERANCE, STATUS_FALLBACK, STATUS_COLORS,
    buildDataset, compute, defaultState, drillState, toggleYear, statusColors, yearLabel,
    eur, compact, pctN, pctText, refIds, isoDate, opeKey, fold, bailleurClass, masseOf, MASSE_LABELS,
    BI_TABLE, BI_COLUMNS, biRows
  };
})(window);
