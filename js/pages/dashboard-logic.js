/**
 * Dashboard financier — règles de calcul (pures : aucun accès au DOM ni à Grist, testées dans tests/suite-dashboard.js).
 *
 * Maquette validée par Antoine le 10/11/2026 ; mise en œuvre le 18/11/2026. « Bilan » 2023-2026 pour l'instant.
 *
 * D'où viennent les chiffres (une seule fonction, buildDataset, lit Grist : changer de source ne touche que celle-là) :
 *  - Attribué, par année : Projets.cAAAA_M10_Fonctionnement + cAAAA_M20_Investissement + cAAAA_M30_Personnel (AAAA = 2023…2026).
 *    Ni Projets.Montant_attribue_Total (il ne somme que 2026-2028) ni Total_AAAA (formules qui renvoient "" à 0).
 *  - Consommé, par année : somme des lignes de la table Depenses_OPE (export FD02 « Consommation détaillée des AE ») dont
 *    Code_operation correspond à une ligne OPE du projet (Projets.Ligne_OPE → Lignes_OPE.N_OPE). CP = Total CP consommé,
 *    AE = Total AE consommé ; l'utilisateur choisit la mesure.
 *  - Reliquat « sans année » : Lignes_OPE.totalCPConsomme (un seul total par ligne OPE) moins les CP déjà détaillés dans
 *    Depenses_OPE, quand il est positif. Mesure CP seulement (il n'existe pas de total AE dans Lignes_OPE). Sans ce repli, un
 *    projet dont le détail n'a pas encore été importé afficherait 0 consommé.
 *  - Statut du projet : Projets.Statut_operationnel_projet (Choice ; Statut_Macro est une formule, donc non modifiable).
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
  const yearLabel = year => (year === NO_YEAR ? NO_YEAR_LABEL : String(year));

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

  // --- Données -----------------------------------------------------------------------------------
  // projets : lignes de Projets ; programmes : Programmes ; lignes : Lignes_OPE ; depenses : Depenses_OPE (peut être vide).
  function buildDataset({ projets = [], programmes = [], lignes = [], depenses = [] } = {}) {
    const programmeLabel = new Map(programmes.map(row => [row.id, text(row.Programme)]));
    const ligneById = new Map(lignes.map(row => [row.id, row]));
    const opeOwner = new Map(); // code opération normalisé → projet (le premier qui le porte)
    const projects = projets.map(row => {
      const lines = refIds(row.Ligne_OPE).map(id => ligneById.get(id)).filter(Boolean);
      const ope = lines.map(line => text(line.N_OPE)).filter(Boolean);
      const att = {};
      YEARS.forEach(year => { att[year] = MASSES.reduce((sum, mass) => sum + num(row[`c${year}_${mass}`]), 0); });
      const acronyme = text(row.Acronyme) || text(row.Projet) || `Projet ${row.id}`;
      const project = {
        id: row.id, row, acronyme, titre: text(row.Projet) && text(row.Projet) !== acronyme ? text(row.Projet) : '',
        programme: programmeLabel.get(refId(row.Programme)) || NO_PROGRAMME,
        statut: text(row.Statut_operationnel_projet),
        att, ope, totalCP: lines.reduce((sum, line) => sum + num(line.totalCPConsomme), 0),
        expenses: [], cons: { CP: {}, AE: {} }
      };
      ope.forEach(code => { if (!opeOwner.has(opeKey(code))) opeOwner.set(opeKey(code), project); });
      return project;
    });

    const orphans = [];
    const outOfRange = { count: 0, CP: 0, AE: 0 };
    depenses.forEach(row => {
      const year = Number(row.Exercice);
      const expense = {
        id: row.id, year, code: text(row.Code_operation),
        nature: text(row.Nature_depense), destination: text(row.Destination), destinationLibelle: text(row.Libelle_destination),
        ej: text(row.Num_EJ), typeObjet: text(row.Type_objet), libelle: text(row.Libelle_objet),
        date: isoDate(row.Date_creation), fournisseur: text(row.Fournisseur), etat: text(row.Etat),
        AE: num(row.AE_consomme), CP: num(row.CP_consomme), domaine: text(row.Domaine)
      };
      const owner = opeOwner.get(opeKey(row.Code_operation));
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
    });
    orphans.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.year - a.year || a.id - b.id);
    return { projects, orphans, outOfRange };
  }

  // --- Filtres et calcul --------------------------------------------------------------------------
  // state : { years: null | [..] (null = toutes), programmes: [], statuts: [], search: '', measure: 'CP' | 'AE' }
  function defaultState() { return { years: null, programmes: [], statuts: [], search: '', measure: 'CP', charts: true }; }

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

    const passes = project => (!state.programmes.length || state.programmes.includes(project.programme))
      && (!state.statuts.length || state.statuts.includes(project.statut))
      && (!query || fold(`${project.acronyme} ${project.titre}`).includes(query));

    // Une ligne par projet visible et par année choisie.
    const rows = [];
    const perProject = [];
    dataset.projects.filter(passes).forEach(project => {
      const mine = selYears.map(year => ({ project, programme: project.programme, year, att: project.att[year] || 0, cons: project.cons[measure][year] || 0 }));
      const total = sumRows(mine);
      // Quand toutes les années sont choisies, un projet sans montant reste listé (statut à renseigner) ; sinon il disparaît.
      if (!allYears && total.att + total.cons === 0) return;
      rows.push(...mine);
      perProject.push({ project, att: total.att, cons: total.cons, dated: total.dated });
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
          const expenses = entry.project.expenses.filter(expense => selYears.includes(expense.year));
          return {
            project: entry.project, att: entry.att, cons: entry.cons, over: entry.dated > entry.att, pct: pctText(entry.cons, entry.att),
            expenses, undetailed: selYears.includes(NO_YEAR) && measure === 'CP' ? entry.project.undetailedCP : 0
          };
        }).sort((a, b) => a.project.acronyme.localeCompare(b.project.acronyme, 'fr'))
      };
    }).sort((a, b) => (a.programme === NO_PROGRAMME) - (b.programme === NO_PROGRAMME) || a.programme.localeCompare(b.programme, 'fr'));

    const total = sumRows(rows);
    const statuses = (statusChoices && statusChoices.length ? statusChoices : STATUS_FALLBACK).slice();
    dataset.projects.forEach(project => { if (project.statut && !statuses.includes(project.statut)) statuses.push(project.statut); });
    const orphanExpenses = selYears.length ? dataset.orphans.filter(expense => selYears.includes(expense.year)) : [];
    const noProjectFilter = !state.programmes.length && !state.statuts.length && !query;

    return {
      measure, years: availableYears, selYears, allYears,
      kpi: { att: total.att, cons: total.cons, pct: pctText(total.cons, total.att), pctN: pctN(total.cons, total.att), reste: Math.max(0, total.att - total.cons), over: total.dated > total.att },
      chartA: chart(['year', 'programme'], 'Années'), chartB: chart(['programme', 'year'], 'Programmes'),
      groups, count: perProject.length,
      options: { programmes: Array.from(new Set(dataset.projects.map(project => project.programme))).sort((a, b) => (a === NO_PROGRAMME) - (b === NO_PROGRAMME) || a.localeCompare(b, 'fr')), statuses },
      orphans: noProjectFilter && orphanExpenses.length ? { expenses: orphanExpenses, AE: orphanExpenses.reduce((s, e) => s + e.AE, 0), CP: orphanExpenses.reduce((s, e) => s + e.CP, 0) } : null,
      outOfRange: dataset.outOfRange.count ? dataset.outOfRange : null
    };
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
    YEARS, NO_YEAR, NO_YEAR_LABEL, NO_PROGRAMME, MEASURES, MASSES, STATUS_FALLBACK, STATUS_COLORS,
    buildDataset, compute, defaultState, drillState, toggleYear, statusColors, yearLabel,
    eur, compact, pctN, pctText, refIds, isoDate, opeKey, fold
  };
})(window);
