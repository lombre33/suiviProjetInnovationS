/**
 * Non-regression suite : alertes financières (js/pages/alerts-logic.js) et détail par OPE du Dashboard (js/pages/dashboard-logic.js) — 24/11/2026.
 *
 * Règle d'Antoine (23/11) : crédits pluriannuels ; alerte = date limite de financement proche ET rythme d'engagement trop faible, puis clôtures et
 * reliquats ; s'y ajoute « OPE non renseignée » (maquette v3 du 24/11). Aujourd'hui des tests = 2026-11-24.
 *
 * Rythme = part engagée (AE) de l'attribué comparée à la part du temps écoulé ; retard ≥ 30 points = élevé, ≥ 15 = moyen (seuils à valider).
 */
(function () {
  'use strict';

  const A = () => window.AlertsLogic;
  const L = () => window.DashboardLogic;
  const TODAY = '2026-11-24';
  const UTC = (y, m, d) => Date.UTC(y, m - 1, d) / 1000;

  const PROGRAMMES = [{ id: 1, Programme: 'P1' }];
  // Lignes OPE : AE macro (Consomme_AE) et CP (totalCPConsomme). Ligne 4 sans N° OPE.
  const LIGNES = [
    { id: 1, N_OPE: 'OPE-SLOW', totalCPConsomme: 20000, Consomme_AE: 50000 },
    { id: 2, N_OPE: 'OPE-MID', totalCPConsomme: 20000, Consomme_AE: 50000 },
    { id: 3, N_OPE: 'OPE-FINE', totalCPConsomme: 60000, Consomme_AE: 80000 },
    { id: 4, N_OPE: '', totalCPConsomme: 0, Consomme_AE: 0 },
    { id: 5, N_OPE: 'OPE-ZZ', totalCPConsomme: 0, Consomme_AE: 0 },
    { id: 6, N_OPE: 'OPE-LATE', totalCPConsomme: 100000, Consomme_AE: 170000 },
    { id: 7, N_OPE: 'OPE-REL1', totalCPConsomme: 57600, Consomme_AE: 60000 },
    { id: 8, N_OPE: 'OPE-REL2', totalCPConsomme: 18000, Consomme_AE: 18000 },
    { id: 9, N_OPE: 'OPE-CONF', totalCPConsomme: 98000, Consomme_AE: 98000 },
    { id: 10, N_OPE: 'OPE-MULTI', totalCPConsomme: 0, Consomme_AE: 0 }
  ];
  const CONFIRM = 'Suposé cloturé sans information sur ...';
  const base = (id, acr, statut, extra) => Object.assign({ id, Acronyme: acr, Projet: acr, Programme: 1, Statut_operationnel_projet: statut }, extra);
  const PROJETS = [
    // Rythme : 25 % engagé pour 95 % du temps (début 01/01/2025, limite 01/01/2027, dans 38 jours) → élevé. Budget pluriannuel 2025-2027 = 200 000.
    base(1, 'SLOW', 'en cours', { Ligne_OPE: ['L', 1], c2025_M10_Fonctionnement: 60000, c2026_M10_Fonctionnement: 40000, c2027_M10_Fonctionnement: 100000, Date_debut_Projet: UTC(2025, 1, 1), Date_limite_financement: UTC(2027, 1, 1) }),
    // 50 % engagé pour 72 % du temps (22 points) → moyen.
    base(2, 'MID', 'en cours', { Ligne_OPE: ['L', 2], c2026_M10_Fonctionnement: 100000, Date_debut_Projet: UTC(2026, 1, 1), Date_limite_financement: UTC(2027, 3, 31) }),
    // 80 % engagé pour 72 % du temps : en avance → rien.
    base(3, 'FINE', 'en cours', { Ligne_OPE: ['L', 3], c2026_M10_Fonctionnement: 100000, Date_debut_Projet: UTC(2026, 1, 1), Date_limite_financement: UTC(2027, 3, 31) }),
    // Échéance dépassée : toujours dans l'alerte, quel que soit l'horizon.
    base(4, 'LATE', 'En retard', { Ligne_OPE: ['L', 6], c2025_M10_Fonctionnement: 200000, Date_debut_Projet: UTC(2025, 1, 1), Date_limite_financement: UTC(2026, 10, 31) }),
    // Loin dans le temps (310 jours) : seulement à l'horizon de 12 mois.
    base(5, 'FAR', 'en cours', { Ligne_OPE: ['L', 5], c2026_M10_Fonctionnement: 100000, Date_debut_Projet: UTC(2026, 1, 1), Date_limite_financement: UTC(2027, 9, 30) }),
    // Pas de date limite : non suivi, compté à part.
    base(6, 'NODATE', 'en cours', { Ligne_OPE: ['L', 1], c2026_M10_Fonctionnement: 1000 }),
    base(7, 'BROUILLON', 'Brouillon', { c2026_M10_Fonctionnement: 5000 }),
    // OPE non renseignée.
    base(8, 'NOLINE', 'en cours', { c2026_M10_Fonctionnement: 50000, Action_Ligne_OPE_a_faire: 'Creation de ligne' }),
    base(9, 'NONUM', 'en cours', { Ligne_OPE: ['L', 4], c2026_M10_Fonctionnement: 30000 }),
    base(10, 'RANK2', 'en cours', { Ligne_OPE: ['L', 8], c2026_M10_Fonctionnement: 20000, c2026_M10_Fonctionnement_2: 8000 }),
    base(11, 'WAIT0', 'En attente des dispo des fonds', {}),
    base(12, 'WAIT1', 'En attente des dispo des fonds', { c2026_M10_Fonctionnement: 1000 }),
    // Clôtures.
    base(13, 'REL1', 'cloturé avec Reliquat à traiter', { Ligne_OPE: ['L', 7], c2025_M10_Fonctionnement: 90000 }),
    base(14, 'REL2', 'cloturé avec Reliquat à traiter', { Ligne_OPE: ['L', 8], c2025_M10_Fonctionnement: 20000 }),
    base(15, 'CONF', CONFIRM, { Ligne_OPE: ['L', 9], c2024_M10_Fonctionnement: 150000, Date_limite_financement: UTC(2026, 6, 30) }),
    base(16, 'CLOS', 'Cloturé et reliquat traités', { c2025_M10_Fonctionnement: 1000 })
  ];

  const dataset = (overrides = {}) => L().buildDataset(Object.assign({ projets: PROJETS, programmes: PROGRAMMES, lignes: LIGNES, depenses: [] }, overrides));
  const run = (options, overrides) => A().compute(dataset(overrides), Object.assign({ today: TODAY }, options));
  const acrs = items => items.map(item => item.project.acronyme);
  const known = (...codes) => new Set(codes.map(code => L().opeKey(code)));

  // ===========================================================================================================
  describe('Alertes — échéances : date limite proche et rythme d\'engagement trop faible', function () {
    it('retard de rythme = temps écoulé − part engagée : ≥ 30 points élevé, ≥ 15 moyen, sinon rien', function () {
      const result = run({ horizon: 12 });
      const byAcr = Object.fromEntries(result.ech.items.map(item => [item.project.acronyme, item]));
      assertEqual(byAcr.SLOW.risk, 'high');
      assertEqual(byAcr.MID.risk, 'mid');
      assertTrue(!byAcr.FINE, 'FINE a de l\'avance : pas d\'alerte');
      assertEqual(Math.round(byAcr.SLOW.metrics.elapsed * 100), 95, '692 jours sur 730');
      assertEqual(byAcr.SLOW.metrics.aePct, 0.25, '50 000 engagés sur 200 000 d\'attribué pluriannuel (2025 + 2026 + 2027)');
      assertEqual(Math.round(byAcr.MID.metrics.lag * 100), 22);
    });

    it('un projet dont l\'échéance est dépassée reste dans l\'alerte, quel que soit l\'horizon ; les autres suivent l\'horizon', function () {
      assertDeepEqual(acrs(run({ horizon: 3 }).ech.items), ['LATE', 'SLOW'], 'à 3 mois : LATE (échue) reste, SLOW (38 jours) entre, MID (127 jours) sort');
    });

    it('l\'horizon filtre sur la date limite (3, 6 ou 12 mois) ; 12 mois ajoute FAR (dans 310 jours)', function () {
      assertDeepEqual(acrs(run({ horizon: 6 }).ech.items), ['LATE', 'SLOW', 'MID']);
      assertDeepEqual(acrs(run({ horizon: 12 }).ech.items), ['LATE', 'SLOW', 'FAR', 'MID'], 'FAR est à risque élevé : il passe avant MID');
      assertEqual(run({}).horizon, 6, 'horizon par défaut : 6 mois');
      assertEqual(run({ horizon: 7 }).horizon, 6, 'valeur inconnue : retour au défaut');
    });

    it('ordre : échues, puis risque élevé, puis moyen, chacun par date limite ; le reste à engager et la prochaine échéance se déduisent', function () {
      const result = run({ horizon: 6 });
      assertDeepEqual(result.ech.items.map(item => item.risk), ['late', 'high', 'mid']);
      assertEqual(result.ech.nextDays, 38, 'prochaine échéance : SLOW, dans 38 jours');
      assertEqual(result.ech.reste, result.ech.items.reduce((sum, item) => sum + item.metrics.reste, 0));
      assertEqual(result.ech.items[1].metrics.reste, 150000, '200 000 − 50 000 engagés');
    });

    it('les projets en cours sans date limite ne sont pas suivis, ils sont comptés ; les autres statuts sont ignorés', function () {
      const result = run({ horizon: 12 });
      assertEqual(result.ech.noDate, 4, 'NODATE, plus NOLINE, NONUM et RANK2 qui sont « en cours » sans date');
      assertTrue(!acrs(result.ech.items).includes('BROUILLON') && !acrs(result.ech.items).includes('CLOS'));
    });

    it('début du financement : Date_debut_Projet, sinon prolongation_DateCTOInitial, sinon Instance_ratache_date, sinon 1er janvier de la 1re année du budget', function () {
      const row = { id: 1, Acronyme: 'X', Statut_operationnel_projet: 'en cours', Ligne_OPE: ['L', 1], c2025_M10_Fonctionnement: 1000, Date_limite_financement: UTC(2027, 1, 1) };
      const start = extra => A().metrics(dataset({ projets: [Object.assign({}, row, extra)] }).projects[0], TODAY).start;
      assertEqual(start({}), '2025-01-01', '1re année du budget');
      assertEqual(start({ Instance_ratache_date: UTC(2025, 6, 1) }), '2025-06-01');
      assertEqual(start({ Instance_ratache_date: UTC(2025, 6, 1), prolongation_DateCTOInitial: UTC(2025, 9, 1) }), '2025-09-01');
      assertEqual(start({ Instance_ratache_date: UTC(2025, 6, 1), prolongation_DateCTOInitial: UTC(2025, 9, 1), Date_debut_Projet: UTC(2025, 3, 1) }), '2025-03-01');
    });

    it('l\'engagé d\'une ligne OPE est le plus élevé du macro (Consomme_AE) et du détail FD02 (Depenses_OPE), jamais les deux additionnés', function () {
      const depenses = [{ id: 1, Exercice: 2026, Code_operation: 'OPE-SLOW', AE_consomme: 70000, CP_consomme: 10000, Date_creation: UTC(2026, 11, 10) }];
      const project = dataset({ depenses }).projects.find(p => p.acronyme === 'SLOW');
      assertEqual(A().engaged(project), 70000, 'détail 70 000 > macro 50 000');
      const small = dataset({ depenses: [{ id: 1, Exercice: 2026, Code_operation: 'OPE-SLOW', AE_consomme: 30000, CP_consomme: 0 }] }).projects.find(p => p.acronyme === 'SLOW');
      assertEqual(A().engaged(small), 50000, 'macro 50 000 > détail 30 000');
    });

    it('dernier engagement et engagé des 30 derniers jours viennent du détail daté, vides tant que le détail manque', function () {
      const depenses = [
        { id: 1, Exercice: 2026, Code_operation: 'OPE-SLOW', AE_consomme: 4000, CP_consomme: 0, Date_creation: UTC(2026, 11, 10) },
        { id: 2, Exercice: 2026, Code_operation: 'OPE-SLOW', AE_consomme: 1000, CP_consomme: 0, Date_creation: UTC(2026, 8, 1) }
      ];
      const withDetail = run({ horizon: 6 }, { depenses }).ech.items.find(item => item.project.acronyme === 'SLOW').metrics;
      assertEqual(withDetail.lastIso, '2026-11-10');
      assertEqual(withDetail.sinceLast, 14);
      assertEqual(withDetail.last30, 4000);
      const without = run({ horizon: 6 }).ech.items.find(item => item.project.acronyme === 'SLOW').metrics;
      assertEqual(without.lastIso, '');
      assertEqual(without.last30, null);
    });

    it('chipFor : puce « échue » ou « N j » sur la liste du Dashboard, puce « OPE ? » pour une OPE à compléter, rien sinon', function () {
      const result = run({ horizon: 6 });
      const id = acr => dataset().projects.find(p => p.acronyme === acr).id;
      assertDeepEqual(A().chipFor(result, id('SLOW')), { tab: 'ech', kind: 'high', label: '38 j' });
      assertEqual(A().chipFor(result, id('LATE')).label, 'échue');
      assertEqual(A().chipFor(result, id('NOLINE')).label, 'OPE ?');
      assertEqual(A().chipFor(result, id('FINE')), null);
    });
  });

  // ===========================================================================================================
  describe('Alertes — à compléter : OPE non renseignée', function () {
    it('aucune ligne OPE, ligne sans N°, OPE 2 sans ligne : chaque cas a sa raison et son montant non suivi', function () {
      const items = Object.fromEntries(run({}).ope.items.map(item => [item.project.acronyme, item]));
      assertEqual(items.NOLINE.reason, 'none');
      assertEqual(items.NOLINE.amount, 50000);
      assertEqual(items.NOLINE.action, 'Creation de ligne', 'l\'action prévue sur la ligne est rappelée');
      assertEqual(items.NONUM.reason, 'nonum');
      assertEqual(items.NONUM.amount, 30000);
      assertEqual(items.RANK2.reason, 'rank');
      assertEqual(items.RANK2.issues[0].rank, 2);
      assertEqual(items.RANK2.amount, 8000, 'seulement les montants de l\'OPE 2, pas du projet');
    });

    it('seuls les projets en cours, en retard ou en attente des fonds sont concernés ; en attente, il faut au moins un montant', function () {
      const result = run({});
      const flagged = acrs(result.ope.items);
      assertTrue(flagged.includes('WAIT1'), 'en attente des fonds avec un budget : à compléter');
      assertTrue(!flagged.includes('WAIT0'), 'en attente des fonds sans aucun montant : rien à suivre');
      assertTrue(!flagged.includes('BROUILLON') && !flagged.includes('CLOS') && !flagged.includes('REL1'));
    });

    it('un projet « en cours » sans montant ni ligne est quand même à compléter', function () {
      const projets = [base(1, 'VIDE', 'en cours', {})];
      assertEqual(run({}, { projets }).ope.items.length, 1);
    });

    it('N° OPE inconnu de l\'export : seulement quand on connaît les codes reçus, comparaison sans espaces ni casse', function () {
      assertTrue(!acrs(run({}).ope.items).includes('FAR'), 'sans codes connus, aucun faux positif');
      const withCodes = run({ knownCodes: known('OPE-SLOW', 'ope-mid', 'OPE-FINE', 'OPE - LATE') });
      const far = withCodes.ope.items.find(item => item.project.acronyme === 'FAR');
      assertEqual(far.reason, 'unknown');
      assertEqual(far.issues[0].code, 'OPE-ZZ');
      assertTrue(!acrs(withCodes.ope.items).includes('MID'), '« ope-mid » retrouve OPE-MID (casse et espaces ignorés)');
    });

    it('ordre : le plus gros montant non suivi d\'abord ; le total des montants dédoublonne l\'OPE (un montant par rang)', function () {
      const result = run({});
      assertEqual(result.ope.items[0].project.acronyme, 'NOLINE');
      assertEqual(result.ope.amount, result.ope.items.reduce((sum, item) => sum + item.amount, 0));
      assertEqual(result.counts.ope, result.ope.items.length);
    });

    it('plusieurs raisons sur un même projet : la plus grave donne la puce, les autres restent listées', function () {
      const projets = [base(1, 'DOUBLE', 'en cours', { c2026_M10_Fonctionnement: 1000, c2026_M10_Fonctionnement_2: 500 })];
      const item = run({}, { projets }).ope.items[0];
      assertDeepEqual(item.issues.map(issue => issue.kind + issue.rank), ['none1', 'rank2']);
      assertEqual(item.reason, 'none');
      assertEqual(item.amount, 1500, 'OPE 1 (1 000) + OPE 2 (500)');
    });
  });

  // ===========================================================================================================
  describe('Alertes — clôtures : reliquats à traiter et projets supposés clos', function () {
    it('reliquat = attribué − consommé CP, le plus gros d\'abord ; les supposés clos sont à confirmer à part', function () {
      const clo = run({}).clo;
      assertDeepEqual(acrs(clo.rel), ['REL1', 'REL2']);
      assertEqual(clo.rel[0].reliquat, 32400, '90 000 − 57 600');
      assertEqual(clo.rel[1].reliquat, 2000);
      assertEqual(clo.reliquat, 34400);
      assertDeepEqual(acrs(clo.conf), ['CONF']);
      assertEqual(run({}).counts.clo, 3);
    });

    it('le statut « Suposé cloturé… » est reconnu avec ou sans la faute d\'orthographe de Grist', function () {
      const projets = [base(1, 'A', 'Suposé cloturé sans information sur ...', {}), base(2, 'B', 'Supposé clôturé, sans information', {}), base(3, 'C', 'Cloturé et reliquat traités', {})];
      assertEqual(run({}, { projets }).clo.conf.length, 2);
    });

    it('l\'attribué d\'un projet clos compte toutes les années 2023 à 2029 et toutes ses OPE', function () {
      const projets = [base(1, 'REL', 'cloturé avec Reliquat à traiter', { Ligne_OPE: ['L', 7], c2023_M10_Fonctionnement: 1, c2029_M30_Personnel: 2, c2026_M20_Investissement: 4, c2026_M10_Fonctionnement_2: 8 })];
      assertEqual(run({}, { projets }).clo.rel[0].metrics.total, 15);
    });
  });

  // ===========================================================================================================
  describe('Alertes — bailleurs comptés et réattributions (26/11/2026)', function () {
    const slow = extra => base(1, 'SLOW', 'en cours', Object.assign({ Ligne_OPE: ['L', 1], c2025_M10_Fonctionnement: 60000, c2026_M10_Fonctionnement: 40000, Date_debut_Projet: UTC(2025, 1, 1), Date_limite_financement: UTC(2027, 1, 1) }, extra));
    const only = projets => run({ horizon: 12 }, { projets });

    it('sans choix de bailleur tout est compté ; un projet tout Idex n\'alerte pas par défaut, avec la puce Idex il alerte', function () {
      const idex = [slow({ Bailleur: 'Idex' })];
      assertEqual(acrs(only(idex).ech.items).length, 1, 'sans choix : compté');
      const hidden = A().compute(dataset({ projets: idex }), { today: TODAY, horizon: 12, bailleur: { innovations: true, idex: false } });
      assertEqual(hidden.ech.items.length, 0);
      const shown = A().compute(dataset({ projets: idex }), { today: TODAY, horizon: 12, bailleur: { innovations: true, idex: true } });
      assertEqual(shown.ech.items.length, 1);
    });

    it('un projet mixte n\'alerte que sur l\'attribué de ses OPE comptées', function () {
      const mixte = [slow({ Ligne_OPE_2: ['L', 5], Bailleur: 'InnovationS', Bailleur_2: 'Idex', c2026_M10_Fonctionnement_2: 100000 })];
      const innOnly = A().compute(dataset({ projets: mixte }), { today: TODAY, horizon: 12, bailleur: { innovations: true, idex: false } });
      assertEqual(innOnly.ech.items[0].metrics.total, 100000, 'OPE 1 seule : 60 000 + 40 000');
      const both = A().compute(dataset({ projets: mixte }), { today: TODAY, horizon: 12, bailleur: { innovations: true, idex: true } });
      assertEqual(both.ech.items[0].metrics.total, 200000);
    });

    it('une réattribution n\'alerte pas seule : son attribué s\'ajoute à celui de son projet d\'origine', function () {
      const projets = [slow({}), base(2, 'FILLE', 'en cours', { Ligne_OPE: ['L', 1], Projet_Parent_le_cas_echeant_: 1, c2026_M10_Fonctionnement: 100000, Date_limite_financement: UTC(2027, 1, 1) })];
      const result = only(projets);
      assertDeepEqual(acrs(result.ech.items), ['SLOW']);
      assertEqual(result.ech.items[0].metrics.total, 200000, '100 000 + 100 000 de réattribution');
      assertEqual(result.ech.items[0].metrics.aePct, 0.25, '50 000 engagés sur 200 000');
    });

    it('une réattribution de statut « cloturé avec reliquat » ne crée pas un reliquat à part', function () {
      const projets = [base(1, 'MERE', 'cloturé avec Reliquat à traiter', { Ligne_OPE: ['L', 7], c2025_M10_Fonctionnement: 90000 }), base(2, 'FILLE', 'cloturé avec Reliquat à traiter', { Ligne_OPE: ['L', 7], Projet_Parent_le_cas_echeant_: 1, c2025_M10_Fonctionnement: 10000 })];
      const rel = only(projets).clo.rel;
      assertDeepEqual(acrs(rel), ['MERE']);
      assertEqual(rel[0].reliquat, 42400, '90 000 + 10 000 − 57 600');
    });
  });

  // ===========================================================================================================
  describe('Dashboard — détail par OPE et consommé CP d\'une ligne OPE', function () {
    const MULTI_LIGNES = [
      { id: 5, N_OPE: 'OPE-M1', totalCPConsomme: 400 },
      { id: 6, N_OPE: 'OPE-M2', totalCPConsomme: 300 }
    ];
    const MULTI = [{ id: 1, Acronyme: 'MULTI', Projet: 'MULTI', Programme: 1, Statut_operationnel_projet: 'en cours', Ligne_OPE: ['L', 5], Ligne_OPE_2: ['L', 6], c2025_M10_Fonctionnement: 1000, c2026_M10_Fonctionnement_2: 500 }];
    const MULTI_DEPENSES = [
      { id: 1, Exercice: 2025, Code_operation: 'OPE-M1', AE_consomme: 200, CP_consomme: 150 },
      { id: 2, Exercice: 2026, Code_operation: 'OPE-M2', AE_consomme: 100, CP_consomme: 100 },
      { id: 3, Exercice: 2026, Code_operation: 'OPE-M1', AE_consomme: 60, CP_consomme: 50 }
    ];
    const multi = () => L().buildDataset({ projets: MULTI, programmes: PROGRAMMES, lignes: MULTI_LIGNES, depenses: MULTI_DEPENSES }).projects[0];

    it('un projet à deux OPE a une entrée par OPE avec son attribué par année et ses lignes', function () {
      const project = multi();
      assertEqual(project.opes.length, 2);
      assertEqual(project.opes[0].rank, 1);
      assertEqual(project.opes[0].att[2025], 1000);
      assertEqual(project.opes[0].att[2026], 0);
      assertEqual(project.opes[1].rank, 2);
      assertEqual(project.opes[1].att[2026], 500, 'colonne c2026_M10_Fonctionnement_2');
      assertDeepEqual(project.opes.map(ope => ope.lines.map(line => line.code)), [['OPE-M1'], ['OPE-M2']]);
    });

    it('le consommé de chaque OPE vient des dépenses de ses lignes, par exercice, et la somme des OPE redonne le projet', function () {
      const project = multi();
      assertEqual(project.opes[0].cons.CP[2025], 150);
      assertEqual(project.opes[0].cons.CP[2026], 50);
      assertEqual(project.opes[1].cons.CP[2026], 100);
      assertEqual(project.opes[0].cons.AE[2025], 200);
      assertEqual(project.opes[0].cons.CP[L().NO_YEAR], 200, '400 sur la ligne − 200 détaillés');
      assertEqual(project.opes[1].cons.CP[L().NO_YEAR], 200, '300 − 100');
      [2025, 2026, L().NO_YEAR].forEach(year => {
        assertEqual(project.opes[0].cons.CP[year] + project.opes[1].cons.CP[year], project.cons.CP[year], `somme des OPE = projet (${year})`);
      });
    });

    it('compute() donne une ligne par OPE sur les années choisies ; le reliquat « Sans année » ne compte qu\'en CP', function () {
      const ds = L().buildDataset({ projets: MULTI, programmes: PROGRAMMES, lignes: MULTI_LIGNES, depenses: MULTI_DEPENSES });
      const entry = L().compute(ds, {}).groups[0].projects[0];
      assertEqual(entry.opes.length, 2);
      assertEqual(entry.opes[0].att, 1000);
      assertEqual(entry.opes[0].cons, 400, '150 + 50 + 200 sans année');
      assertEqual(entry.opes[1].att, 500);
      assertEqual(entry.opes[1].cons, 300);
      assertEqual(entry.opes[0].cons + entry.opes[1].cons, entry.cons, 'le total du projet est la somme des OPE');
      const only2025 = L().compute(ds, { years: [2025] }).groups[0].projects[0];
      assertDeepEqual(only2025.opes.map(ope => [ope.att, ope.cons]), [[1000, 150], [0, 0]]);
      const ae = L().compute(ds, { measure: 'AE' }).groups[0].projects[0];
      assertEqual(ae.opes[0].cons, 260, 'AE : 200 + 60, pas de reliquat sans année');
    });

    it('un projet à une seule OPE a une seule entrée ; une OPE 2 sans aucune donnée n\'en crée pas', function () {
      const single = L().buildDataset({ projets: [Object.assign({}, MULTI[0], { Ligne_OPE_2: null, c2026_M10_Fonctionnement_2: 0 })], programmes: PROGRAMMES, lignes: MULTI_LIGNES, depenses: [] }).projects[0];
      assertEqual(single.opes.length, 1);
    });

    it('une ligne OPE posée sur deux rangs du même projet n\'est comptée qu\'une fois', function () {
      const twice = [Object.assign({}, MULTI[0], { Ligne_OPE_2: ['L', 5] })];
      const project = L().buildDataset({ projets: twice, programmes: PROGRAMMES, lignes: MULTI_LIGNES, depenses: MULTI_DEPENSES }).projects[0];
      assertEqual(project.opes[0].cons.CP[2025], 150);
      assertEqual(project.opes[1].cons.CP[2025], 0, 'le doublon ne recompte pas les dépenses');
      assertEqual(project.opes[1].cons.CP[L().NO_YEAR], 0);
    });

    it('le consommé CP d\'une ligne OPE vient de totalCPConsomme seule (l\'import UB Invest y écrit ; pas de colonne Consomme_CP)', function () {
      const cp = line => L().buildDataset({ projets: MULTI, programmes: PROGRAMMES, lignes: [Object.assign({ id: 5, N_OPE: 'OPE-M1' }, line)], depenses: [] }).projects[0].totalCP;
      assertEqual(cp({ totalCPConsomme: 100 }), 100);
      assertEqual(cp({ totalCPConsomme: 100, Consomme_CP: 250 }), 100, 'une colonne Consomme_CP parasite est ignorée');
      assertEqual(cp({ totalCPConsomme: 0 }), 0, 'un 0 importé est une valeur');
      assertEqual(cp({ totalCPConsomme: null }), 0, 'colonne vide : 0');
    });
  });
})();
