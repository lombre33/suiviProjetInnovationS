/**
 * Non-regression suite : page Dashboard (js/pages/dashboard-logic.js + js/pages/page-dashboard.js) — 18/11/2026.
 *
 * Maquette validée par Antoine le 10/11/2026 : deux graphiques à détail progressif en haut, un volet par programme (replié par
 * défaut) qui contient ses projets (attribué, consommé, statut modifiable), un volet « Dépenses » sous chaque projet (export FD02).
 *
 * Jeu de données (posé par load()), bilan 2023-2026 :
 *   Programmes 1 FARE, 2 CTO Innovation.
 *   Lignes OPE 1 « OPE 001 » (CP total 1 200), 2 « OPE002 » (0), 3 « ope003 » (CP total 400).
 *   Projets 10 ALPHA (FARE, en cours, OPE 1 ; attribué 2024 = 1 000 + 500, 2025 = 2 000) · 11 BETA (FARE, Brouillon, OPE 2 ; attribué 2026 = 3 000)
 *           12 GAMMA (CTO Innovation, sans statut, OPE 3 ; attribué 2023 = 800) · 13 DELTA (sans programme, sans montant, sans OPE).
 *   Dépenses (Depenses_OPE) : 2024 « OPE001 » CP 300 / AE 500 (ALPHA) · 2025 « OPE 001 » CP 200 / AE 200 (ALPHA) · 2024 « OPE003 » CP 100 / AE 100 (GAMMA)
 *           2024 « XXXX99 » CP 50 / AE 60 (aucun projet) · 2027 « OPE001 » CP 70 / AE 70 (hors 2023-2026).
 *   Donc : ALPHA consomme 500 CP (300 en 2024 + 200 en 2025) et 630 CP « sans année » (1 200 − 500 − 70), GAMMA 100 CP + 300 « sans année ».
 */
(function () {
  'use strict';

  const L = () => window.DashboardLogic;
  const P = () => window.DashboardPage;
  const byId = id => document.getElementById(id);
  const view = () => byId('view-dashboard');
  const PREFS_ROWID_KEY = 'suiviProjetInnovationS:prefsRowId';
  const STATUS_CHOICES = ['en cours', 'Brouillon', 'En retard', 'Cloturé et reliquat traités'];
  const DAY = 86400;
  const UTC = (y, m, d) => Date.UTC(y, m - 1, d) / 1000;

  const PROGRAMMES = [{ id: 1, Programme: 'FARE' }, { id: 2, Programme: 'CTO Innovation' }];
  const LIGNES = [
    { id: 1, N_OPE: 'OPE 001', totalCPConsomme: 1200 },
    { id: 2, N_OPE: 'OPE002', totalCPConsomme: 0 },
    { id: 3, N_OPE: 'ope003', totalCPConsomme: 400 }
  ];
  const PROJETS = [
    { id: 10, Acronyme: 'ALPHA', Projet: 'Projet Alpha', Programme: 1, Statut_operationnel_projet: 'en cours', Ligne_OPE: ['L', 1], Montant_attribue_Total: 999999,
      c2024_M10_Fonctionnement: 1000, c2024_M30_Personnel: 500, c2025_M20_Investissement: 2000 },
    { id: 11, Acronyme: 'BETA', Projet: 'BETA', Programme: 1, Statut_operationnel_projet: 'Brouillon', Ligne_OPE: ['L', 2], c2026_M10_Fonctionnement: 3000 },
    { id: 12, Acronyme: 'GAMMA', Projet: 'Projet Gamma', Programme: 2, Statut_operationnel_projet: '', Ligne_OPE: ['L', 3], c2023_M30_Personnel: 800 },
    { id: 13, Acronyme: 'DELTA', Projet: 'Projet Delta', Programme: 0, Statut_operationnel_projet: 'Statut inattendu', Ligne_OPE: null }
  ];
  const DEPENSES = [
    { id: 1, Exercice: 2024, Code_operation: 'OPE001', Fournisseur: 'ACME', Libelle_objet: 'Achat de matériel', Num_EJ: '4500001', Nature_depense: 'M20', Destination: 'D1', Etat: 'Validé', Date_creation: UTC(2024, 5, 10), AE_consomme: 500, CP_consomme: 300 },
    { id: 2, Exercice: 2025, Code_operation: 'OPE 001', Fournisseur: 'ZETA', Libelle_objet: 'Prestation', Num_EJ: '4500002', Etat: 'Validé', Date_creation: UTC(2025, 2, 3), AE_consomme: 200, CP_consomme: 200 },
    { id: 3, Exercice: 2024, Code_operation: 'OPE003', Fournisseur: 'OMEGA', Libelle_objet: 'Mission', Date_creation: UTC(2024, 9, 1), AE_consomme: 100, CP_consomme: 100 },
    { id: 4, Exercice: 2024, Code_operation: 'XXXX99', Fournisseur: 'ORPHELIN', Libelle_objet: 'Dépense sans projet', Date_creation: UTC(2024, 1, 1), AE_consomme: 60, CP_consomme: 50 },
    { id: 5, Exercice: 2027, Code_operation: 'OPE001', Fournisseur: 'FUTUR', Libelle_objet: 'Hors bilan', Date_creation: UTC(2027, 1, 1), AE_consomme: 70, CP_consomme: 70 }
  ];

  const columnar = (rows, columns) => {
    const out = { id: rows.map(row => row.id) };
    columns.forEach(col => { out[col] = rows.map(row => (row[col] === undefined ? null : row[col])); });
    return out;
  };
  const allColumns = rows => Array.from(new Set(rows.flatMap(row => Object.keys(row)).filter(key => key !== 'id')));
  const toTable = rows => columnar(rows, allColumns(rows));
  const dataset = (overrides = {}) => L().buildDataset(Object.assign({ projets: PROJETS, programmes: PROGRAMMES, lignes: LIGNES, depenses: DEPENSES }, overrides));
  const project = (ds, acronyme) => ds.projects.find(p => p.acronyme === acronyme);

  // ===========================================================================================================
  describe('Dashboard — calculs : d\'où viennent l\'attribué et le consommé', function () {
    it('l\'attribué d\'une année est la somme des trois masses ; Montant_attribue_Total (2026-2028 seulement) n\'est jamais lu', function () {
      const alpha = project(dataset(), 'ALPHA');
      assertEqual(alpha.att[2023], 0);
      assertEqual(alpha.att[2024], 1500, 'M10 + M30');
      assertEqual(alpha.att[2025], 2000, 'M20');
      assertEqual(alpha.att[2026], 0);
      assertEqual(project(dataset(), 'BETA').att[2026], 3000);
    });

    it('le consommé par année vient de Depenses_OPE : CP et AE, codes opération comparés sans espaces ni casse', function () {
      const ds = dataset();
      const alpha = project(ds, 'ALPHA'), gamma = project(ds, 'GAMMA');
      assertEqual(alpha.cons.CP[2024], 300, '« OPE001 » retrouve la ligne OPE « OPE 001 »');
      assertEqual(alpha.cons.CP[2025], 200, '« OPE 001 » aussi');
      assertEqual(alpha.cons.AE[2024], 500);
      assertEqual(alpha.cons.AE[2025], 200);
      assertEqual(gamma.cons.CP[2024], 100, '« OPE003 » retrouve la ligne « ope003 »');
      assertEqual(gamma.cons.AE[2024], 100);
      assertEqual(L().opeKey(' ope 00 1 '), 'OPE001');
    });

    it('reliquat « Sans année » : total CP de la ligne OPE moins les CP détaillés (hors 2023-2026 compris), jamais négatif, CP seulement', function () {
      const ds = dataset();
      assertEqual(project(ds, 'ALPHA').undetailedCP, 630, '1 200 − 300 − 200 − 70 (exercice 2027)');
      assertEqual(project(ds, 'ALPHA').cons.CP[L().NO_YEAR], 630);
      assertEqual(project(ds, 'ALPHA').cons.AE[L().NO_YEAR], 0, 'il n\'existe pas de total AE dans Lignes_OPE');
      assertEqual(project(ds, 'GAMMA').undetailedCP, 300);
      assertEqual(project(ds, 'BETA').undetailedCP, 0);
      const small = L().buildDataset({ projets: PROJETS, programmes: PROGRAMMES, lignes: [{ id: 1, N_OPE: 'OPE 001', totalCPConsomme: 100 }], depenses: DEPENSES });
      assertEqual(project(small, 'ALPHA').undetailedCP, 0, 'le détail dépasse le total : pas de reliquat négatif');
    });

    it('une dépense sans ligne OPE de projet va dans « Sans projet rattaché » ; un exercice hors 2023-2026 n\'est compté nulle part mais signalé', function () {
      const ds = dataset();
      assertDeepEqual(ds.orphans.map(e => e.fournisseur), ['ORPHELIN']);
      assertEqual(ds.outOfRange.count, 1);
      assertEqual(ds.outOfRange.CP, 70);
      assertEqual(ds.outOfRange.AE, 70);
      assertEqual(project(ds, 'ALPHA').expenses.length, 2, 'la dépense de 2027 n\'est pas dans la liste du projet');
    });

    it('une ligne OPE partagée par deux projets : ses dépenses vont au premier, jamais comptées deux fois', function () {
      const shared = PROJETS.map(p => (p.id === 11 ? Object.assign({}, p, { Ligne_OPE: ['L', 1] }) : p));
      const ds = dataset({ projets: shared });
      assertEqual(project(ds, 'ALPHA').expenses.length, 2);
      assertEqual(project(ds, 'BETA').expenses.length, 0);
    });

    it('les dépenses d\'un projet sont triées de la plus récente à la plus ancienne ; les dates Grist (secondes) deviennent AAAA-MM-JJ', function () {
      const alpha = project(dataset(), 'ALPHA');
      assertDeepEqual(alpha.expenses.map(e => e.date), ['2025-02-03', '2024-05-10'], 'tri décroissant');
      assertEqual(L().isoDate(0), '');
      assertEqual(L().isoDate(null), '');
    });

    it('sans table de dépenses (pas encore importée), le consommé retombe sur le total de la ligne OPE : « Sans année »', function () {
      const ds = dataset({ depenses: [] });
      assertEqual(project(ds, 'ALPHA').undetailedCP, 1200);
      assertEqual(L().compute(ds, {}).kpi.cons, 1600, '1 200 + 400');
    });

    it('un projet sans Ligne_OPE ou avec un identifiant inconnu ne casse rien', function () {
      const odd = PROJETS.concat([{ id: 14, Acronyme: 'EPSILON', Programme: 1, Ligne_OPE: ['L', 99, 0] }, { id: 15, Acronyme: 'ZETA', Programme: 1, Ligne_OPE: 2 }]);
      const ds = dataset({ projets: odd });
      assertDeepEqual(project(ds, 'EPSILON').ope, []);
      assertDeepEqual(project(ds, 'ZETA').ope, ['OPE002'], 'un identifiant seul est accepté');
      assertDeepEqual(L().refIds(['L', 3, 5]), [3, 5]);
      assertDeepEqual(L().refIds(null), []);
    });
  });

  // ===========================================================================================================
  describe('Dashboard — calculs : filtres, totaux, graphiques', function () {
    it('par défaut : toutes les années 2023-2026 + « Sans année », mesure CP, totaux de tous les projets', function () {
      const m = L().compute(dataset(), {});
      assertDeepEqual(m.years, [2023, 2024, 2025, 2026, 0]);
      assertDeepEqual(m.selYears, [2023, 2024, 2025, 2026, 0]);
      assertTrue(m.allYears);
      assertEqual(m.measure, 'CP');
      assertEqual(m.kpi.att, 7300, '1 500 + 2 000 + 3 000 + 800');
      assertEqual(m.kpi.cons, 1530, 'ALPHA 300+200+630, GAMMA 100+300');
      assertEqual(m.kpi.reste, 5770);
      assertEqual(m.kpi.pct, '21 %');
      assertEqual(m.count, 4, 'DELTA (aucun montant) reste listé quand toutes les années sont choisies : son statut est à renseigner');
    });

    it('mesure AE : consommé = Total AE, et plus de « Sans année » (pas de reliquat AE)', function () {
      const m = L().compute(dataset(), { measure: 'AE' });
      assertDeepEqual(m.years, [2023, 2024, 2025, 2026]);
      assertEqual(m.kpi.cons, 800, 'ALPHA 500+200, GAMMA 100');
      assertEqual(L().compute(dataset(), { measure: 'inconnue' }).measure, 'CP', 'une mesure inconnue retombe sur CP');
    });

    it('années choisies : totaux de ces années, projets sans montant masqués, volets filtrés', function () {
      const m = L().compute(dataset(), { years: [2024] });
      assertFalse(m.allYears);
      assertEqual(m.kpi.att, 1500);
      assertEqual(m.kpi.cons, 400, 'ALPHA 300 + GAMMA 100');
      assertDeepEqual(m.groups.map(g => g.programme), ['CTO Innovation', 'FARE']);
      assertEqual(m.count, 2, 'ALPHA et GAMMA ; BETA, DELTA n\'ont rien en 2024');
      assertEqual(m.groups[0].projects[0].expenses.length, 1, 'GAMMA : sa dépense de 2024');
    });

    it('« Sans année » seule : le reliquat des lignes OPE sans détail', function () {
      const m = L().compute(dataset(), { years: [0] });
      assertEqual(m.kpi.att, 0);
      assertEqual(m.kpi.cons, 930);
      assertEqual(m.groups.find(g => g.programme === 'FARE').projects[0].undetailed, 630);
      assertEqual(L().compute(dataset(), { years: [2024] }).groups[1].projects[0].undetailed, 0, 'pas de reliquat quand « Sans année » n\'est pas choisie');
    });

    it('filtres : programme, statut, recherche (accents et casse ignorés) ; les trois se combinent', function () {
      const ds = dataset();
      assertDeepEqual(L().compute(ds, { programmes: ['FARE'] }).groups.map(g => g.programme), ['FARE']);
      assertEqual(L().compute(ds, { statuts: ['Brouillon'] }).count, 1);
      assertEqual(L().compute(ds, { statuts: ['en cours', 'Brouillon'] }).count, 2, 'multi-sélection');
      assertEqual(L().compute(ds, { search: 'gàmma' }).count, 1, 'accent ignoré');
      assertEqual(L().compute(ds, { search: 'projet alpha' }).count, 1, 'dans le titre aussi');
      assertEqual(L().compute(ds, { programmes: ['FARE'], statuts: ['Brouillon'], search: 'beta' }).count, 1);
      assertEqual(L().compute(ds, { programmes: ['CTO Innovation'], statuts: ['Brouillon'] }).count, 0);
    });

    it('les volets sont triés par programme, « Sans programme » en dernier', function () {
      assertDeepEqual(L().compute(dataset(), {}).groups.map(g => g.programme), ['CTO Innovation', 'FARE', 'Sans programme']);
    });

    it('options de filtre : programmes et statuts (liste Grist + statuts rencontrés hors liste)', function () {
      const m = L().compute(dataset(), {}, STATUS_CHOICES);
      assertDeepEqual(m.options.programmes, ['CTO Innovation', 'FARE', 'Sans programme']);
      assertDeepEqual(m.options.statuses, STATUS_CHOICES.concat(['Statut inattendu']));
      assertDeepEqual(L().compute(dataset(), {}).options.statuses.slice(0, 2), ['en cours', 'Brouillon'], 'liste de secours quand le schéma est illisible');
    });

    it('« Sans projet rattaché » : seulement sans filtre de projet, et selon les années choisies', function () {
      const ds = dataset();
      const all = L().compute(ds, {});
      assertEqual(all.orphans.expenses.length, 1);
      assertEqual(all.orphans.CP, 50);
      assertEqual(all.orphans.AE, 60);
      assertEqual(L().compute(ds, { programmes: ['FARE'] }).orphans, null, 'un filtre de projet masque le volet');
      assertEqual(L().compute(ds, { search: 'alpha' }).orphans, null);
      assertEqual(L().compute(ds, { years: [2025] }).orphans, null, 'la dépense orpheline est de 2024');
      assertEqual(L().compute(ds, { years: [2024] }).orphans.expenses.length, 1);
    });

    it('hors 2023-2026 : signalé avec son total dans la mesure choisie', function () {
      const m = L().compute(dataset(), {});
      assertEqual(m.outOfRange.count, 1);
      assertEqual(L().compute(dataset({ depenses: DEPENSES.slice(0, 4) }), {}).outOfRange, null);
    });

    it('graphique 1 (années > programmes > projets) : le détail progresse quand les filtres se précisent', function () {
      const ds = dataset();
      const a0 = L().compute(ds, {}).chartA;
      assertEqual(a0.level, 0);
      assertDeepEqual(a0.items.map(i => i.label), ['2023', '2024', '2025', '2026', 'Sans année']);
      assertDeepEqual(a0.crumbs.map(c => c.label), ['Années']);
      const a1 = L().compute(ds, { years: [2024] }).chartA;
      assertEqual(a1.level, 1);
      assertEqual(a1.dim, 'programme');
      assertDeepEqual(a1.items.map(i => i.label), ['FARE', 'CTO Innovation'], 'tri par attribué décroissant');
      assertDeepEqual(a1.crumbs.map(c => c.label), ['Années', '2024']);
      const a2 = L().compute(ds, { years: [2024], programmes: ['FARE'] }).chartA;
      assertEqual(a2.level, 2);
      assertDeepEqual(a2.items.map(i => i.label), ['ALPHA']);
      assertDeepEqual(a2.crumbs.map(c => c.label), ['Années', '2024', 'FARE']);
    });

    it('graphique 2 (programmes > années > projets) : l\'inverse', function () {
      const ds = dataset();
      const b0 = L().compute(ds, {}).chartB;
      assertEqual(b0.level, 0);
      assertDeepEqual(b0.items.map(i => i.label), ['FARE', 'CTO Innovation'], '« Sans programme » n\'a aucun montant : absent du graphique');
      const b1 = L().compute(ds, { programmes: ['FARE'] }).chartB;
      assertEqual(b1.level, 1);
      assertEqual(b1.dim, 'year');
      assertDeepEqual(b1.items.map(i => i.label), ['2024', '2025', '2026', 'Sans année']);
      assertDeepEqual(b1.crumbs.map(c => c.label), ['Programmes', 'FARE']);
    });

    it('chaque barre porte attribué, consommé, pourcentage ; seul un consommé daté au-dessus de l\'attribué est un dépassement (pas le reliquat « Sans année »)', function () {
      const reliquat = L().buildDataset({ projets: [PROJETS[0]], programmes: PROGRAMMES, lignes: [{ id: 1, N_OPE: 'OPE 001', totalCPConsomme: 5000 }], depenses: [] });
      const m = L().compute(reliquat, { years: [0, 2024] });
      const item = m.chartA.items.find(i => i.label === '2024');
      assertEqual(item.att, 1500);
      assertFalse(item.over, '2024 : rien consommé');
      const none = m.chartA.items.find(i => i.label === 'Sans année');
      assertEqual(none.cons, 5000);
      assertFalse(none.over, 'le reliquat n\'a pas d\'attribué à dépasser : barre non rouge');
      assertEqual(none.pct, '—', 'pas de pourcentage quand rien n\'est attribué');
      assertFalse(m.kpi.over);
      assertFalse(m.groups[0].projects[0].over);
      assertTrue(item.ratio.att <= 1 && item.ratio.cons <= 1);
      const depasse = L().buildDataset({ projets: [PROJETS[0]], programmes: PROGRAMMES, lignes: [{ id: 1, N_OPE: 'OPE 001', totalCPConsomme: 2000 }], depenses: [{ id: 1, Exercice: 2024, Code_operation: 'OPE001', CP_consomme: 2000 }] });
      const m2 = L().compute(depasse, { years: [2024] });
      assertTrue(m2.chartA.items[0].over, 'consommé 2024 (2 000) > attribué 2024 (1 500)');
      assertTrue(m2.kpi.over);
      assertTrue(m2.groups[0].over);
      assertTrue(m2.groups[0].projects[0].over);
    });

    it('drillState / toggleYear : cliquer une barre filtre sur sa valeur, le fil d\'Ariane retire le filtre, jamais « aucune année »', function () {
      const base = L().defaultState();
      assertDeepEqual(L().drillState(base, 'year', 2025).years, [2025]);
      assertDeepEqual(L().drillState(base, 'programme', 'FARE').programmes, ['FARE']);
      assertEqual(L().drillState(L().drillState(base, 'year', 2025), 'year', null).years, null);
      assertDeepEqual(L().toggleYear({ years: null }, 2024, [2023, 2024, 2025, 2026]), [2023, 2025, 2026]);
      assertEqual(L().toggleYear({ years: [2023, 2025, 2026] }, 2024, [2023, 2024, 2025, 2026]), null, 'toutes recochées : retour à « toutes »');
      assertEqual(L().toggleYear({ years: [2024] }, 2024, [2023, 2024, 2025, 2026]), null, 'la dernière ne se décoche pas : retour à « toutes »');
    });

    it('formats : montants en euros sans centimes, k€ / M€ pour les graphiques, pourcentages', function () {
      assertEqual(L().eur(1240000), '1 240 000 €');
      assertEqual(L().eur(0), '0 €');
      assertEqual(L().eur(-1500.4), '-1 500 €');
      assertEqual(L().eur('abc'), '0 €');
      assertEqual(L().compact(1240000), '1,2 M€');
      assertEqual(L().compact(850000), '850 k€');
      assertEqual(L().compact(0), '0 €');
      assertEqual(L().pctText(50, 200), '25 %');
      assertEqual(L().pctText(0, 0), '0 %');
      assertEqual(L().pctText(10, 0), '—');
    });
  });

  // ===========================================================================================================
  // Page
  const prefsUpdates = () => window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && c.table === 'Preferences_Widget');
  const projectUpdates = () => window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && c.table === 'Projets');
  const click = el => fireMouse(el, 'click');
  const list = () => byId('db-list');
  const vols = () => Array.from(list().querySelectorAll('.db-vol:not(.db-vol-orphans)'));
  const volNames = () => vols().map(vol => vol.querySelector('.db-pn').textContent);
  const vol = name => vols().find(v => v.dataset.dbProgramme === name);
  const head = name => vol(name).querySelector('.db-vhead');
  const prow = acronyme => Array.from(list().querySelectorAll('.db-prow')).find(row => row.querySelector('.db-acr').textContent === acronyme);
  const kpi = () => ({ att: byId('db-kpi-att') && byId('db-kpi-att').textContent, cons: byId('db-kpi-cons') && byId('db-kpi-cons').textContent });
  const yearBtn = year => view().querySelector(`[data-db-year="${year}"]`);
  const yearsOn = () => Array.from(view().querySelectorAll('[data-db-year].is-on')).map(btn => btn.dataset.dbYear);
  const norm = s => String(s).replace(/ | /g, ' ');

  function installMeta() {
    window.__mockSetTable('_grist_Tables', { id: [1], tableId: ['Projets'] });
    window.__mockSetTable('_grist_Tables_column', {
      id: [1], parentId: [1], colId: ['Statut_operationnel_projet'], type: ['Choice'],
      widgetOptions: [JSON.stringify({ choices: STATUS_CHOICES })], description: ['Avancement du projet']
    });
    return window.CoreGrist.loadColumnDescriptions();
  }
  async function load(options = {}) {
    const projets = options.projets || PROJETS;
    window.__mockSetTable('Projets', toTable(projets));
    window.__mockSetTable('Programmes', toTable(PROGRAMMES));
    window.__mockSetTable('Lignes_OPE', toTable(LIGNES));
    if (options.depenses !== false) window.__mockSetTable('Depenses_OPE', toTable(options.depenses || DEPENSES));
    await installMeta();
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    P().resetState(); P().resetPrefsRow();
    view().classList.remove('hidden');
    window.renderDashboard();
    await waitFor(() => P().state.expensesState === 'ready', 'dépenses lues');
  }
  function unload() { view().classList.add('hidden'); P().resetState(); P().resetPrefsRow(); }
  async function loadPrefs() {
    await window.loadKanbanUserPreferences(); // crée la table et la ligne, comme au vrai démarrage (js/app.js)
    await window.loadDashboardUserPreferences();
  }
  const withHiddenDocument = fn => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    try { return fn(); } finally { delete document.hidden; }
  };
  function stub(object, key, replacement) {
    const original = object[key];
    object[key] = replacement;
    return () => { object[key] = original; };
  }

  describe('Dashboard — page : ouverture, volets, dépenses', function () {
    it('à l\'ouverture : toutes les années actives, CP actif, volets replies, totaux affichés', async function () {
      await load();
      assertDeepEqual(yearsOn(), ['2023', '2024', '2025', '2026', '0']);
      assertEqual(view().querySelector('[data-db-measure="CP"]').getAttribute('aria-pressed'), 'true');
      assertEqual(view().querySelector('[data-db-measure="AE"]').getAttribute('aria-pressed'), 'false');
      assertDeepEqual(volNames(), ['CTO Innovation', 'FARE', 'Sans programme']);
      assertEqual(list().querySelectorAll('.db-vbody').length, 0, 'aucun volet ouvert');
      vols().forEach(v => assertEqual(v.querySelector('.db-vhead').getAttribute('aria-expanded'), 'false'));
      assertEqual(norm(kpi().att), '7 300 €');
      assertEqual(norm(kpi().cons), '1 530 €');
      unload();
    });

    it('un volet se déplie au clic et se replie au second clic', async function () {
      await load();
      click(head('FARE'));
      assertEqual(vol('FARE').querySelector('.db-vhead').getAttribute('aria-expanded'), 'true');
      assertDeepEqual(Array.from(vol('FARE').querySelectorAll('.db-acr')).map(b => b.textContent), ['ALPHA', 'BETA']);
      assertEqual(vol('CTO Innovation').querySelectorAll('.db-vbody').length, 0, 'les autres restent repliés');
      click(head('FARE'));
      assertEqual(vol('FARE').querySelectorAll('.db-vbody').length, 0, 'replié');
      assertEqual(vol('FARE').querySelector('.db-vhead').getAttribute('aria-expanded'), 'false');
      unload();
    });

    it('chaque projet affiche attribué, consommé et statut ; le volet du programme additionne ses projets', async function () {
      await load();
      click(head('FARE'));
      assertEqual(norm(vol('FARE').querySelector('.db-vhead .db-att').textContent), '6 500 €', 'ALPHA 3 500 + BETA 3 000');
      assertEqual(norm(vol('FARE').querySelector('.db-vhead .db-cons').textContent), '1 130 €');
      assertEqual(norm(prow('ALPHA').querySelector('.db-att').textContent), '3 500 €');
      assertEqual(norm(prow('ALPHA').querySelector('.db-cons').textContent), '1 130 €');
      assertEqual(prow('ALPHA').querySelector('.db-sel').value, 'en cours');
      assertEqual(prow('BETA').querySelector('.db-sel').value, 'Brouillon');
      unload();
    });

    it('sous chaque projet, un volet « Dépenses » (replié par défaut) liste les lignes de l\'export, la plus récente d\'abord', async function () {
      await load();
      click(head('FARE'));
      assertEqual(list().querySelectorAll('.db-exp').length, 0, 'replié par défaut');
      const toggle = prow('ALPHA').querySelector('[data-db-exp]');
      assertEqual(toggle.querySelector('.db-n').textContent, '2', 'nombre de dépenses sur la flèche');
      click(toggle);
      const rows = Array.from(list().querySelectorAll('.db-exp tbody tr'));
      assertEqual(rows.length, 2);
      assertIncludes(rows[0].textContent, 'ZETA');
      assertIncludes(rows[0].textContent, '03/02/2025', 'date au format français');
      assertIncludes(rows[1].textContent, 'ACME');
      assertIncludes(rows[1].textContent, 'Achat de matériel');
      assertIncludes(rows[1].textContent, '4500001');
      assertEqual(norm(list().querySelector('.db-exp tfoot').textContent), '2 dépenses700 €500 €', 'totaux AE puis CP');
      assertIncludes(list().querySelector('.db-exp').textContent, '630 €', 'le reliquat sans détail est signalé');
      click(prow('ALPHA').querySelector('[data-db-exp]'));
      assertEqual(list().querySelectorAll('.db-exp').length, 0, 'se replie');
      unload();
    });

    it('un projet sans dépense détaillée l\'indique ; le compteur est à zéro', async function () {
      await load();
      click(head('FARE'));
      assertEqual(prow('BETA').querySelector('.db-n').textContent, '0');
      click(prow('BETA').querySelector('[data-db-exp]'));
      assertIncludes(list().querySelector('.db-exp').textContent, 'Aucune dépense détaillée');
      unload();
    });

    it('les dépenses affichées suivent les années choisies', async function () {
      await load();
      click(yearBtn(2025));
      click(yearBtn(2023)); click(yearBtn(2026)); click(yearBtn(0));
      assertDeepEqual(yearsOn(), ['2024']);
      click(head('FARE'));
      assertEqual(prow('ALPHA').querySelector('.db-n').textContent, '1');
      unload();
    });

    it('« Sans projet rattaché » : volet à part, replié, avec la dépense de code inconnu', async function () {
      await load();
      const orphans = list().querySelector('.db-vol-orphans');
      assertTrue(!!orphans, 'volet présent');
      assertEqual(orphans.querySelector('.db-exp'), null);
      click(orphans.querySelector('.db-vhead'));
      assertIncludes(list().querySelector('.db-vol-orphans .db-exp').textContent, 'ORPHELIN');
      unload();
    });

    it('note de bas de page : exercice hors 2023-2026 non compté', async function () {
      await load();
      assertIncludes(norm(list().querySelector('.db-foot').textContent), '1 dépense d\'un exercice hors 2023-2026');
      assertIncludes(norm(list().querySelector('.db-foot').textContent), '70 € CP');
      unload();
    });

    it('la table Depenses_OPE est créée à la première ouverture si elle manque, avec les colonnes de l\'export FD02', async function () {
      await load({ depenses: false });
      const created = window.__TEST_CALLS__.find(c => c.type === 'AddTable' && c.table === 'Depenses_OPE');
      assertTrue(!!created, 'AddTable Depenses_OPE');
      const cols = created.colDefs.map(c => c.id);
      ['Exercice', 'Code_operation', 'Fournisseur', 'Libelle_objet', 'Num_EJ', 'Date_creation', 'AE_consomme', 'CP_consomme'].forEach(col => assertTrue(cols.includes(col), `colonne ${col}`));
      assertEqual(created.colDefs.find(c => c.id === 'Exercice').type, 'Int');
      assertEqual(created.colDefs.find(c => c.id === 'CP_consomme').type, 'Numeric');
      assertEqual(P().state.expensesState, 'ready');
      assertEqual(norm(kpi().cons), '1 600 €', 'sans détail, le total de la ligne OPE sert de repli');
      unload();
    });

    it('quand la table existe déjà, rien n\'est créé ; elle n\'est lue qu\'à l\'ouverture de la page, pas au démarrage', async function () {
      window.__mockSetTable('Depenses_OPE', toTable(DEPENSES));
      P().resetState();
      window.__TEST_CALLS__.length = 0;
      assertEqual(P().state.expensesState, 'idle', 'jamais lue avant l\'ouverture');
      await load();
      assertEqual(window.__TEST_CALLS__.filter(c => c.type === 'AddTable').length, 0);
      unload();
    });

    it('une table de dépenses illisible est signalée sans bloquer la page', async function () {
      await load();
      const restore = stub(window.CoreGrist, 'getTable', async name => { if (name === 'Depenses_OPE') throw new Error('refusé'); return []; });
      try {
        await P().loadExpenses(true);
        assertEqual(P().state.expensesState, 'error');
        assertIncludes(list().querySelector('.db-foot').textContent, 'illisible');
        assertEqual(volNames().length > 0, true, 'les programmes restent affichés');
      } finally { restore(); unload(); }
    });

    it('ouvrir la page relit les dépenses si la dernière lecture date (l\'import se fait ailleurs)', async function () {
      await load();
      assertEqual(norm(kpi().cons), '1 530 €');
      window.__mockSetTable('Depenses_OPE', toTable(DEPENSES.concat([{ id: 6, Exercice: 2026, Code_operation: 'OPE002', CP_consomme: 1000, AE_consomme: 1000, Fournisseur: 'NEW' }])));
      P().state.expensesAt = 0; // lecture « ancienne »
      fire(document.querySelector('.nav-btn[data-view="view-dashboard"]'), 'click');
      await waitFor(() => norm(kpi().cons) === '2 530 €', 'nouvelle dépense lue');
      unload();
    });
  });

  describe('Dashboard — page : filtres et graphiques', function () {
    it('désactiver une année met les totaux et la liste à jour ; recocher toutes les années revient à « toutes »', async function () {
      await load();
      click(yearBtn(2023)); click(yearBtn(0));
      assertDeepEqual(yearsOn(), ['2024', '2025', '2026']);
      assertEqual(norm(kpi().att), '6 500 €', 'sans les 800 € de 2023');
      assertEqual(norm(kpi().cons), '600 €');
      click(yearBtn(2023)); click(yearBtn(0));
      assertDeepEqual(yearsOn(), ['2023', '2024', '2025', '2026', '0']);
      assertEqual(P().state.years, null);
      unload();
    });

    it('la mesure AE remplace le consommé par le total AE ; « Sans année » disparaît', async function () {
      await load();
      click(view().querySelector('[data-db-measure="AE"]'));
      assertEqual(norm(kpi().cons), '800 €');
      assertIncludes(byId('db-charts').textContent, 'Consommé (AE)');
      assertEqual(yearBtn(0), null, 'pas de reliquat AE');
      assertEqual(view().querySelector('[data-db-measure="AE"]').getAttribute('aria-pressed'), 'true');
      unload();
    });

    it('cliquer une barre filtre sur sa valeur, le fil d\'Ariane remonte', async function () {
      await load();
      const bar = byId('db-charts').querySelector('[data-db-bar^="A:"]');
      assertTrue(!!bar, 'barres du graphique 1');
      click(byId('db-charts').querySelector('[data-db-bar="A:1"]')); // 2024
      assertDeepEqual(P().state.years, [2024]);
      assertDeepEqual(yearsOn(), ['2024']);
      assertEqual(norm(kpi().att), '1 500 €');
      const crumbs = Array.from(byId('db-charts').querySelectorAll('[data-db-crumb^="A:"]')).map(c => c.textContent.replace('›', '').trim());
      assertDeepEqual(crumbs, ['Années', '2024']);
      click(byId('db-charts').querySelector('[data-db-crumb="A:0"]'));
      assertEqual(P().state.years, null, 'le premier maillon retire les filtres des deux niveaux');
      unload();
    });

    it('le second graphique filtre par programme et ouvre son volet', async function () {
      await load();
      click(byId('db-charts').querySelector('[data-db-bar="B:0"]')); // FARE (le plus gros attribué)
      assertDeepEqual(P().state.programmes, ['FARE']);
      assertEqual(volNames().join('|'), 'FARE');
      assertEqual(vol('FARE').querySelectorAll('.db-vbody').length, 1, 'un seul programme ciblé : son volet s\'ouvre');
      click(head('FARE'));
      assertEqual(vol('FARE').querySelectorAll('.db-vbody').length, 0, 'et reste repliable');
      unload();
    });

    it('le filtre Programme (multi-sélection) et le filtre Statut s\'appliquent à la liste et aux totaux', async function () {
      await load();
      const input = byId('db-filter-programme');
      fire(input, 'focus');
      const options = Array.from(byId('db-filter-programme-list').querySelectorAll('[data-value]'));
      assertDeepEqual(options.map(o => o.textContent), ['Tous les programmes', 'CTO Innovation', 'FARE', 'Sans programme']);
      fireMouse(options.find(o => o.dataset.value === 'FARE'), 'mousedown');
      assertEqual(input.value, 'FARE');
      assertEqual(norm(kpi().att), '6 500 €');
      fireMouse(Array.from(byId('db-filter-programme-list').querySelectorAll('[data-value]')).find(o => o.dataset.value === 'CTO Innovation'), 'mousedown');
      assertEqual(input.value, '2 programmes sélectionnés');
      const statut = byId('db-filter-statut');
      fire(statut, 'focus');
      const statuts = Array.from(byId('db-filter-statut-list').querySelectorAll('[data-value]')).map(o => o.dataset.value);
      assertTrue(statuts.includes('Brouillon') && statuts.includes('Statut inattendu'), 'statuts Grist + statuts rencontrés');
      fireMouse(byId('db-filter-statut-list').querySelector('[data-value="Brouillon"]'), 'mousedown');
      assertEqual(P().getModel().count, 1, 'FARE + CTO Innovation, statut Brouillon : BETA seulement');
      assertEqual(volNames().join('|'), 'FARE');
      unload();
    });

    it('la recherche filtre les projets (acronyme ou titre) en direct', async function () {
      await load();
      const search = byId('db-filter-search');
      search.value = 'gamma'; fire(search, 'input');
      assertEqual(volNames().join('|'), 'CTO Innovation');
      assertEqual(P().state.search, 'gamma');
      search.value = 'zzz'; fire(search, 'input');
      assertIncludes(list().textContent, 'Aucun projet ne correspond');
      unload();
    });

    it('« Réinitialiser » (bandeau ou message vide) remet années, programmes, statuts et recherche à zéro', async function () {
      await load();
      click(yearBtn(2024)); click(yearBtn(2025));
      byId('db-filter-search').value = 'zzz'; fire(byId('db-filter-search'), 'input');
      click(list().querySelector('[data-db-reset]'));
      assertEqual(P().state.search, '');
      assertEqual(byId('db-filter-search').value, '');
      assertEqual(P().state.years, null);
      assertEqual(volNames().length, 3);
      click(yearBtn(2024));
      click(byId('db-clear-filters'));
      assertEqual(P().state.years, null);
      unload();
    });

    it('l\'icône « Réinitialiser » du bandeau n\'apparaît que lorsqu\'un filtre est actif (une seule ligne de bandeau)', async function () {
      await load();
      assertEqual(byId('db-clear-filters').hidden, true);
      click(yearBtn(2024));
      assertEqual(byId('db-clear-filters').hidden, false);
      click(byId('db-clear-filters'));
      assertEqual(byId('db-clear-filters').hidden, true);
      byId('db-filter-search').value = 'x'; fire(byId('db-filter-search'), 'input');
      assertEqual(byId('db-clear-filters').hidden, false);
      unload();
    });

    it('le bouton « Graphiques » replie la zone des graphiques (liste et totaux restent)', async function () {
      await load();
      assertEqual(byId('db-charts').hidden, false);
      click(byId('db-toggle-charts'));
      assertEqual(byId('db-charts').hidden, true);
      assertEqual(byId('db-toggle-charts').getAttribute('aria-expanded'), 'false');
      assertEqual(volNames().length, 3);
      click(byId('db-toggle-charts'));
      assertEqual(byId('db-charts').hidden, false);
      unload();
    });

    it('le nom d\'un projet ouvre sa fiche (modale projet)', async function () {
      await load();
      click(head('FARE'));
      let opened = null;
      const restore = stub(window.ProjectModal, 'open', row => { opened = row; });
      try {
        click(prow('ALPHA').querySelector('[data-db-open-project]'));
        assertEqual(opened && opened.id, 10);
      } finally { restore(); unload(); }
    });
  });

  describe('Dashboard — page : statut du projet modifiable', function () {
    it('changer le statut écrit Projets.Statut_operationnel_projet (seule colonne de Projets écrite) et affiche « Enregistré »', async function () {
      await load();
      click(head('FARE'));
      const select = prow('ALPHA').querySelector('.db-sel');
      assertDeepEqual(Array.from(select.options).map(o => o.value), STATUS_CHOICES.concat(['Statut inattendu']), 'liste de choix du schéma Grist, plus les statuts rencontrés hors liste');
      window.__TEST_CALLS__.length = 0;
      select.value = 'En retard'; fire(select, 'change');
      await wait(20);
      const updates = projectUpdates();
      assertEqual(updates.length, 1);
      assertEqual(updates[0].id, 10);
      assertDeepEqual(updates[0].fields, { Statut_operationnel_projet: 'En retard' });
      assertEqual(prow('ALPHA').querySelector('[data-db-saved]').hidden, false, 'accusé « Enregistré »');
      assertEqual(window.CoreState.getTable('Projets').find(r => r.id === 10).Statut_operationnel_projet, 'En retard', 'la ligne en mémoire suit');
      unload();
    });

    it('un échec d\'écriture rétablit l\'ancien statut et prévient (régression : l\'affichage ne doit pas mentir)', async function () {
      await load();
      click(head('FARE'));
      const restore = stub(window.grist.docApi, 'applyUserActions', async () => { throw new Error('droits insuffisants'); });
      try {
        const select = prow('ALPHA').querySelector('.db-sel');
        select.value = 'En retard'; fire(select, 'change');
        await wait(20);
        assertEqual(prow('ALPHA').querySelector('.db-sel').value, 'en cours', 'ancien statut réaffiché');
        assertEqual(window.CoreState.getTable('Projets').find(r => r.id === 10).Statut_operationnel_projet, 'en cours');
      } finally { restore(); unload(); }
    });

    it('un projet sans statut propose « — » ; un statut hors liste reste sélectionné', async function () {
      await load();
      click(head('CTO Innovation')); click(head('Sans programme'));
      assertEqual(prow('GAMMA').querySelector('.db-sel').value, '');
      assertEqual(prow('GAMMA').querySelector('.db-sel option').textContent, '—');
      assertEqual(prow('DELTA').querySelector('.db-sel').value, 'Statut inattendu');
      unload();
    });

    it('rechoisir le même statut n\'écrit rien', async function () {
      await load();
      click(head('FARE'));
      window.__TEST_CALLS__.length = 0;
      const select = prow('ALPHA').querySelector('.db-sel');
      fire(select, 'change');
      await wait(10);
      assertEqual(projectUpdates().length, 0);
      unload();
    });

    it('la bulle d\'aide « ? » de la colonne Statut apparaît quand Grist a une description', async function () {
      await load();
      assertTrue(list().querySelectorAll('.db-colhead .help-icon').length >= 1, 'icône d\'aide sur l\'en-tête Statut du projet');
      unload();
    });
  });

  describe('Dashboard — filtres retenus par utilisateur (Preferences_Widget)', function () {
    it('les colonnes Dash_* sont créées dans Preferences_Widget', async function () {
      await load();
      await loadPrefs();
      ['Dash_annees', 'Dash_programmes', 'Dash_statuts', 'Dash_recherche', 'Dash_mesure', 'Dash_graphiques'].forEach(col => {
        const added = window.__TEST_CALLS__.some(c => c.type === 'AddColumn' && c.table === 'Preferences_Widget' && c.colId === col) || window.CoreGrist.knownColumns('Preferences_Widget').has(col);
        assertTrue(added, `colonne ${col}`);
      });
      unload();
    });

    it('chaque choix est enregistré sur la ligne de la personne : années, programmes (virgule préservée), statuts, mesure, graphiques', async function () {
      await load();
      await loadPrefs();
      window.__TEST_CALLS__.length = 0;
      click(yearBtn(2023)); click(yearBtn(0));
      click(view().querySelector('[data-db-measure="AE"]'));
      click(byId('db-toggle-charts'));
      P().state.programmes = ['Plateau A, B', 'FARE'];
      P().state.statuts = ['en cours'];
      P().state.search = 'alpha';
      await P().savePreferences();
      const update = prefsUpdates().slice(-1)[0];
      assertEqual(update.id, 1, 'la ligne partagée avec les autres pages');
      assertEqual(update.fields.Dash_annees, '2024,2025,2026');
      assertEqual(update.fields.Dash_mesure, 'AE');
      assertEqual(update.fields.Dash_graphiques, '0');
      assertEqual(update.fields.Dash_programmes, '["Plateau A, B","FARE"]', 'un libellé avec virgule est écrit en JSON, jamais coupé');
      assertEqual(update.fields.Dash_statuts, 'en cours');
      assertEqual(update.fields.Dash_recherche, 'alpha');
      unload();
    });

    it('la recherche n\'est enregistrée qu\'une fois, après la frappe (ou tout de suite si la page est masquée)', async function () {
      await load();
      await loadPrefs();
      window.__TEST_CALLS__.length = 0;
      const search = byId('db-filter-search');
      ['a', 'al', 'alp'].forEach(value => { search.value = value; fire(search, 'input'); });
      assertEqual(prefsUpdates().length, 0, 'rien n\'est écrit pendant la frappe');
      withHiddenDocument(() => document.dispatchEvent(new Event('visibilitychange')));
      await wait(30);
      assertEqual(prefsUpdates().length, 1);
      assertEqual(prefsUpdates()[0].fields.Dash_recherche, 'alp');
      unload();
    });

    it('sans filtre, rien n\'est écrit à l\'ouverture ; les volets ouverts ne sont jamais retenus', async function () {
      await load();
      await loadPrefs();
      window.__TEST_CALLS__.length = 0;
      click(head('FARE'));
      await wait(30);
      assertEqual(prefsUpdates().length, 0, 'ouvrir un volet n\'écrit rien');
      unload();
    });

    it('à la réouverture, les préférences enregistrées sont réappliquées ; les volets restent repliés', async function () {
      await load();
      await window.loadKanbanUserPreferences();
      window.__mockSetTable('Preferences_Widget', {
        id: [1], Email_utilisateur: [''], Dash_annees: ['2024,2025'], Dash_programmes: ['["FARE"]'], Dash_statuts: ['en cours'],
        Dash_recherche: ['alp'], Dash_mesure: ['AE'], Dash_graphiques: ['0']
      });
      try { localStorage.setItem(PREFS_ROWID_KEY, '1'); } catch (err) { /* ignore */ }
      P().resetState(); P().resetPrefsRow();
      await window.loadDashboardUserPreferences();
      assertDeepEqual(P().state.years, [2024, 2025]);
      assertDeepEqual(P().state.programmes, ['FARE']);
      assertDeepEqual(P().state.statuts, ['en cours']);
      assertEqual(P().state.search, 'alp');
      assertEqual(P().state.measure, 'AE');
      assertEqual(P().state.charts, false);
      window.renderDashboard();
      await waitFor(() => P().state.expensesState === 'ready', 'dépenses lues');
      assertDeepEqual(yearsOn(), ['2024', '2025']);
      assertEqual(byId('db-filter-programme').value, 'FARE');
      assertEqual(byId('db-filter-search').value, 'alp');
      assertEqual(byId('db-charts').hidden, true);
      assertEqual(list().querySelectorAll('.db-vbody').length, 0, 'replié malgré le filtre');
      unload();
    });

    it('des préférences illisibles (mesure inconnue, années hors bilan) retombent sur les valeurs par défaut', async function () {
      await load();
      await window.loadKanbanUserPreferences();
      window.__mockSetTable('Preferences_Widget', {
        id: [1], Email_utilisateur: [''], Dash_annees: ['1999,2031'], Dash_programmes: [''], Dash_statuts: [''], Dash_recherche: [''], Dash_mesure: ['XYZ'], Dash_graphiques: ['']
      });
      try { localStorage.setItem(PREFS_ROWID_KEY, '1'); } catch (err) { /* ignore */ }
      P().resetState(); P().resetPrefsRow();
      await window.loadDashboardUserPreferences();
      assertEqual(P().state.years, null);
      assertEqual(P().state.measure, 'CP');
      assertEqual(P().state.charts, true);
      unload();
    });
  });

  describe('Dashboard — branchement dans l\'application', function () {
    it('le bouton « Dashboard » existe dans la barre de navigation et la page est rendue par la table des rendus (VIEW_RENDERERS)', function () {
      const btn = document.querySelector('.nav-btn[data-view="view-dashboard"]');
      assertTrue(!!btn, 'bouton');
      assertEqual(btn.textContent, 'Dashboard');
      assertTrue(!!view(), 'section');
      assertEqual(typeof window.renderDashboard, 'function');
      assertEqual(typeof window.loadDashboardUserPreferences, 'function');
    });
  });
})();
