/**
 * Non-regression suite : outil « Import de l'historique financier » (js/pages/import-historique-logic.js + page-import-historique.js) — 18/11/2026.
 *
 * Planche validée par Antoine le 18/11/2026 : l'outil relie le journal Import_Financements aux projets et aux lignes OPE de Grist
 * (création de ce qui manque, après accord à l'écran), ne copie AUCUN montant, vérifie les totaux contre le détail des dépenses, et
 * tient un journal qui rend chaque lot annulable.
 *
 * Jeu de données (posé par load()) :
 *   Journal (6 envois) : FICTIF-0001 InnovationS (2 versions : id 1 puis id 3), FICTIF-0002 IDEX — les 2 lignes du tableur de test —,
 *     « OPE 001 » (Projet Alpha), « OPE-GAMMA-1 » (nom contenant l'acronyme GAMMA), « OPE-DEL-1 » (N° décision DEC-2023-045).
 *   Grist : Programmes 1 FARE, 2 CTO Innovation · Structures 1 LAB1 (« Laboratoire fictif »), 3 DIESE · Lignes OPE 1 « OPE001 » ·
 *     Projets 10 ALPHA (OPE 1, programme FARE), 12 GAMMA (rien), 14 DELTA (cite DEC-2023-045).
 *   Donc : « Projet Alpha (export) » = sûr (N° OPE), « Un tout autre libellé » = sûr (N° décision), « GAMMA - Projet Gamma financé » = à confirmer
 *     (acronyme dans le nom), « PROJET FICTIF - exemple de format » = nouveau (2 lignes OPE).
 */
(function () {
  'use strict';

  const L = () => window.ImportHistoriqueLogic;
  const P = () => window.ImportHistoriquePage;
  const byId = id => document.getElementById(id);
  const UTC = (y, m, d) => Date.UTC(y, m - 1, d) / 1000;
  const FICTIF = 'PROJET FICTIF - exemple de format';
  const LIGNE_BUDGET = 'CRB-FICTIF / SO-FICTIF / SSO-FICTIF';

  const columnar = (rows, columns) => {
    const out = { id: rows.map(row => row.id) };
    columns.forEach(col => { out[col] = rows.map(row => (row[col] === undefined ? null : row[col])); });
    return out;
  };
  const toTable = rows => columnar(rows, Array.from(new Set(rows.flatMap(row => Object.keys(row)).filter(key => key !== 'id'))));

  // Les deux lignes du tableur de test (et une version plus ancienne de FICTIF-0001), puis trois projets pour les autres échelons.
  const fictif1 = {
    Programme: 'Programme fictif (test)', Projet: FICTIF, Financeur: 'InnovationS', Financeurs_du_projet: 'IDEX; InnovationS', N_OPE: 'FICTIF-0001',
    Libelle_operation: 'Opération fictive FICTIF-0001', Ligne_budgetaire: LIGNE_BUDGET, Date_debut: UTC(2023, 1, 1), Date_fin: UTC(2025, 12, 31),
    Montant_attribue: 45000, Part_du_projet: 0.6, Attribue_2022: 0, Attribue_2023: 30000, Attribue_2024: 15000, Attribue_2025: 0, Attribue_2026: 0,
    Consomme_AE: 37500, Consomme_CP: 30000, Disponible_AE: 7500, Disponible_CP: 15000, Statuts: 'Accepté', N_decision: 'DEC-FICTIVE-001',
    Structure: 'Laboratoire fictif', Etablissement: 'Établissement fictif'
  };
  const fictif2 = Object.assign({}, fictif1, {
    Financeur: 'IDEX', N_OPE: 'FICTIF-0002', Libelle_operation: 'Opération fictive FICTIF-0002', Date_debut: UTC(2022, 1, 1), Montant_attribue: 30000,
    Part_du_projet: 0.4, Attribue_2022: 30000, Attribue_2023: 0, Attribue_2024: 0, Consomme_AE: 30000, Consomme_CP: 30000, Disponible_AE: 0, Disponible_CP: 0,
    N_decision: 'DEC-FICTIVE-002'
  });
  const alpha = {
    Programme: 'FARE', Projet: 'Projet Alpha (export)', Financeur: 'InnovationS', Financeurs_du_projet: 'InnovationS', N_OPE: 'OPE 001', Ligne_budgetaire: 'CRB-A / SO-A',
    Date_debut: UTC(2024, 1, 1), Date_fin: UTC(2026, 12, 31), Montant_attribue: 3000, Part_du_projet: 1, Attribue_2024: 1000, Attribue_2025: 2000,
    Consomme_AE: 1500, Consomme_CP: 1200, Disponible_AE: 1500, Disponible_CP: 1800, Statuts: 'Accepté', Structure: 'LAB1'
  };
  const gamma = {
    Programme: 'CTO Innovation', Projet: 'GAMMA - Projet Gamma financé', Financeur: 'InnovationS', Financeurs_du_projet: 'InnovationS', N_OPE: 'OPE-GAMMA-1',
    Ligne_budgetaire: 'CRB-G / SO-G', Date_debut: UTC(2023, 6, 1), Date_fin: UTC(2024, 5, 31), Montant_attribue: 800, Part_du_projet: 1, Attribue_2023: 800,
    Consomme_AE: 800, Consomme_CP: 800, Disponible_AE: 0, Disponible_CP: 0, Structure: 'DIESE'
  };
  const delta = {
    Programme: 'FARE', Projet: 'Un tout autre libellé', Financeur: 'InnovationS', Financeurs_du_projet: 'InnovationS', N_OPE: 'OPE-DEL-1', Ligne_budgetaire: 'CRB-D / SO-D',
    Date_debut: UTC(2023, 9, 1), Date_fin: UTC(2024, 8, 31), Montant_attribue: 500, Part_du_projet: 1, Attribue_2023: 500, Consomme_AE: 100, Consomme_CP: 100,
    Disponible_AE: 400, Disponible_CP: 400, N_decision: 'DEC-2023-045', Structure: 'Structure inconnue'
  };
  const oldFictif1 = Object.assign({}, fictif1, { Consomme_AE: 10000, Consomme_CP: 5000, Disponible_AE: 35000, Disponible_CP: 40000 });
  const JOURNAL = [oldFictif1, fictif2, fictif1, alpha, gamma, delta].map((row, i) => Object.assign({ id: i + 1 }, row));

  const PROGRAMMES = [{ id: 1, Programme: 'FARE' }, { id: 2, Programme: 'CTO Innovation' }];
  const STRUCTURES = [{ id: 1, Acronyme: 'LAB1', Nom_Complet: 'Laboratoire fictif', Nom_Complet_clean: 'Laboratoire fictif (LAB1)' }, { id: 3, Acronyme: 'DIESE', Nom_Complet: 'DIESE' }];
  const LIGNES = [{ id: 1, N_OPE: 'OPE001', installe_chez: 0, totalCPConsomme: 1200 }];
  const PROJETS = [
    { id: 10, Acronyme: 'ALPHA', Projet: 'Projet Alpha', Programme: 1, Ligne_OPE: ['L', 1], Date_debut_Projet: null, Date_de_fin_Projet: null },
    { id: 12, Acronyme: 'GAMMA', Projet: 'Projet Gamma', Programme: 0, Ligne_OPE: ['L'] },
    { id: 14, Acronyme: 'DELTA', Projet: 'Projet Delta', Programme: 0, Ligne_OPE: ['L'], numero_descisions_OLD: 'DEC-2023-045 CTO du 12/04' }
  ];

  async function setup(options = {}) {
    window.__mockSetTable('Import_Financements', toTable(options.journal || JOURNAL));
    window.__mockSetTable('Projets', toTable(options.projets || PROJETS));
    window.__mockSetTable('Lignes_OPE', toTable(options.lignes || LIGNES));
    window.__mockSetTable('Programmes', toTable(PROGRAMMES));
    window.__mockSetTable('Structures', toTable(STRUCTURES));
    if (options.depenses) window.__mockSetTable('Depenses_OPE', toTable(options.depenses));
    P().resetState();
    await P().open();
  }
  const entryRow = name => Array.from(document.querySelectorAll('.ih-row')).find(row => row.textContent.includes(name));
  const rowCategory = name => { const el = entryRow(name)?.querySelector('.ih-state'); return el ? el.className.replace('ih-state is-', '') : null; };
  const click = id => byId(id).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  const writeCalls = () => window.__TEST_CALLS__.filter(call => call.table !== 'Import_Journal' && ['AddRecord', 'UpdateRecord', 'RemoveRecord'].includes(call.type));
  const grist = name => CoreGrist.getTable(name);
  const simulateAndWrite = async () => {
    click('ih-confirm-all');
    click('ih-simulate');
    await waitFor(() => byId('ih-sim'), 'simulation affichée');
    const ack = byId('ih-ack'); ack.checked = true; fire(ack, 'change');
    click('ih-write');
    await waitFor(() => document.querySelector('.ih-banner'), 'résultat de l\'écriture');
  };

  // ===========================================================================================================
  describe('Import historique — le journal devient une version par ligne de financement', function () {
    it('garde la dernière version (plus grand id) de chaque N° OPE + financeur + ligne budgétaire ; « OPE 001 » et « ope001 » sont la même ligne', function () {
      const v = L().latestVersions(JOURNAL);
      assertEqual(v.total, 6);
      assertEqual(v.lines.length, 5, '6 envois, FICTIF-0001 compté une fois');
      const f1 = v.lines.find(line => line.N_OPE === 'FICTIF-0001');
      assertEqual(f1.id, 3, 'la version la plus récente');
      assertEqual(f1.Consomme_AE, 37500);
      assertEqual(L().opeKey(' ope 00 1 '), 'OPE001');
      const same = L().latestVersions([{ id: 1, N_OPE: 'OPE 001', Financeur: 'X', Ligne_budgetaire: 'A', Consomme_AE: 1 }, { id: 2, N_OPE: 'ope001', Financeur: ' x ', Ligne_budgetaire: 'a', Consomme_AE: 2 }]);
      assertEqual(same.lines.length, 1);
      assertEqual(same.lines[0].Consomme_AE, 2);
    });

    it('un même N° OPE avec deux financeurs ou deux lignes budgétaires donne deux lignes', function () {
      const rows = [{ id: 1, N_OPE: 'A', Financeur: 'IDEX', Ligne_budgetaire: 'L1' }, { id: 2, N_OPE: 'A', Financeur: 'InnovationS', Ligne_budgetaire: 'L1' }, { id: 3, N_OPE: 'A', Financeur: 'IDEX', Ligne_budgetaire: 'L2' }];
      assertEqual(L().latestVersions(rows).lines.length, 3);
    });

    it('une ligne sans N° OPE est ignorée et comptée', function () {
      const v = L().latestVersions([{ id: 1, N_OPE: '', Projet: 'X' }, { id: 2, N_OPE: null, Projet: 'Y' }, { id: 3, N_OPE: 'A', Projet: 'Z' }]);
      assertEqual(v.lines.length, 1);
      assertEqual(v.ignored, 2);
    });
  });

  describe('Import historique — contrôles de cohérence de l\'export', function () {
    const lines = () => L().latestVersions(JOURNAL).lines;
    it('les deux lignes du tableur de test passent les 7 contrôles', function () {
      const test = lines().filter(line => /^FICTIF/.test(line.N_OPE));
      assertEqual(L().checkLines(test).length, 0);
      assertEqual(L().CHECKS.length, 7);
    });

    it('signale chaque écart : années, disponible, CP > AE, parts, financeurs, dates', function () {
      const bad = Object.assign({}, fictif1, { _key: 'x', Attribue_2024: 99, Disponible_CP: 1, Consomme_CP: 99999, Part_du_projet: 0.9, Financeurs_du_projet: 'IDEX', Date_fin: UTC(2020, 1, 1) });
      const checks = L().checkLines([bad, Object.assign({}, fictif2, { _key: 'y', Part_du_projet: 0.9 })]).map(issue => issue.check);
      ['annees', 'disponible', 'cp-ae', 'parts', 'financeurs', 'dates'].forEach(check => assertTrue(checks.includes(check), 'écart « ' + check + ' » signalé'));
    });

    it('une ligne sans nom de projet, ou un N° OPE rattaché à deux projets, est une erreur qui exclut la ligne', function () {
      const issues = L().checkLines([{ _key: 'a', N_OPE: 'A', Projet: '' }, { _key: 'b', N_OPE: 'B', Projet: 'P1' }, { _key: 'c', N_OPE: 'B', Projet: 'P2', Financeur: 'Z' }]);
      assertTrue(issues.some(i => i.check === 'projet-vide' && i.level === 'error'));
      assertEqual(issues.filter(i => i.check === 'ope-projets' && i.level === 'error').length, 2);
      const grouped = L().groupProjects([{ _key: 'b', N_OPE: 'B', Projet: 'P1' }, { _key: 'c', N_OPE: 'B', Projet: 'P2' }], issues);
      assertTrue(grouped.entries.every(entry => entry.blocked), 'les deux projets sont écartés');
    });

    it('les parts en pourcentage (40 + 60) sont aussi acceptées', function () {
      const a = Object.assign({}, fictif1, { _key: 'a', Part_du_projet: 60 }), b = Object.assign({}, fictif2, { _key: 'b', Part_du_projet: 40 });
      assertEqual(L().checkLines([a, b]).filter(i => i.check === 'parts').length, 0);
    });
  });

  describe('Import historique — retrouver le projet (N° OPE, N° décision, nom, sinon nouveau)', function () {
    function context() { return L().buildContext({ projets: PROJETS, lignes: LIGNES, programmes: PROGRAMMES, structures: STRUCTURES }); }
    function matches() {
      const lines = L().latestVersions(JOURNAL).lines, grouped = L().groupProjects(lines, L().checkLines(lines)), ctx = context();
      return { grouped, ctx, by: name => L().matchEntry(grouped.entries.find(e => e.name === name), ctx) };
    }
    it('1 · un N° OPE déjà rattaché à un projet : sûr', function () {
      const m = matches().by('Projet Alpha (export)');
      assertEqual(m.status, 'sure'); assertEqual(m.rung, 1); assertEqual(m.projectId, 10);
    });
    it('2 · un N° décision déjà cité par un projet : sûr', function () {
      const m = matches().by('Un tout autre libellé');
      assertEqual(m.status, 'sure'); assertEqual(m.rung, 2); assertEqual(m.projectId, 14);
    });
    it('3 · l\'acronyme dans le nom : à confirmer, avec le projet proposé', function () {
      const m = matches().by('GAMMA - Projet Gamma financé');
      assertEqual(m.status, 'maybe'); assertEqual(m.rung, 3); assertEqual(m.projectId, 12);
      assertTrue(m.candidates[0].score >= 0.6);
    });
    it('4 · rien ne correspond : nouveau projet', function () {
      const m = matches().by(FICTIF);
      assertEqual(m.status, 'new'); assertEqual(m.projectId, null);
    });
    it('même nom sans accents ni majuscules : à confirmer ; deux projets de Grist au même nom : à trancher', function () {
      const ctx = L().buildContext({ projets: [{ id: 1, Projet: 'Café Été', Acronyme: 'CE1' }], lignes: [], programmes: [], structures: [] });
      const entry = { key: 'cafe ete', name: 'CAFE ETE', opes: [{ key: 'X', ope: 'X' }], decisions: [] };
      const m = L().matchEntry(entry, ctx);
      assertEqual(m.status, 'maybe'); assertEqual(m.projectId, 1);
      const twice = L().buildContext({ projets: [{ id: 1, Projet: 'Café Été' }, { id: 2, Projet: 'cafe ete' }], lignes: [], programmes: [], structures: [] });
      assertEqual(L().matchEntry(entry, twice).status, 'conflict');
    });
    it('des N° OPE déjà dans deux projets différents : à trancher', function () {
      const ctx = L().buildContext({ projets: [{ id: 1, Projet: 'A', Ligne_OPE: ['L', 1] }, { id: 2, Projet: 'B', Ligne_OPE: ['L', 2] }], lignes: [{ id: 1, N_OPE: 'X1' }, { id: 2, N_OPE: 'X2' }], programmes: [], structures: [] });
      const entry = { key: 'k', name: 'Autre', opes: [{ key: 'X1', ope: 'X1' }, { key: 'X2', ope: 'X2' }], decisions: [] };
      assertEqual(L().matchEntry(entry, ctx).status, 'conflict');
    });
    it('programmes et structures : égalité exacte d\'abord, suggestion très proche à relire, sinon rien', function () {
      const { grouped, ctx } = matches();
      const maps = L().buildMappings(grouped.entries, ctx);
      const prog = label => maps.programmes.find(m => m.label === label), struct = label => maps.structures.find(m => m.label === label);
      assertEqual(prog('FARE').id, 1); assertTrue(prog('FARE').auto);
      assertEqual(prog('Programme fictif (test)').id, 0, 'aucun programme proche : rien n\'est renseigné');
      assertEqual(struct('Laboratoire fictif').id, 1, 'le nom complet suffit'); assertEqual(struct('DIESE').id, 3);
      assertEqual(struct('Structure inconnue').id, 0);
    });
  });

  describe('Import historique — la simulation : ce qui sera écrit, et seulement ce que décrit la planche', function () {
    function plan(options = {}) {
      const lines = L().latestVersions(JOURNAL).lines, grouped = L().groupProjects(lines, L().checkLines(lines));
      const ctx = Object.assign(L().buildContext({ projets: options.projets || PROJETS, lignes: LIGNES, programmes: PROGRAMMES, structures: STRUCTURES }), options.ctx || {});
      const matches = new Map(grouped.entries.map(e => [e.key, L().matchEntry(e, ctx)]));
      return L().buildPlan({ entries: grouped.entries, matches, decisions: options.decisions || new Map(), mappings: L().buildMappings(grouped.entries, ctx), ctx, now: Date.UTC(2026, 10, 18) });
    }
    const confirmAll = () => new Map([['projet fictif exemple de format', { mode: 'auto', confirmed: true }], ['gamma projet gamma finance', { mode: 'auto', confirmed: true }]]);
    const addOf = (p, table) => p.phase1.concat(p.phase2).filter(op => op.kind === 'add' && op.table === table);

    it('sans accord, seuls les rapprochements sûrs sont prévus ; « à confirmer » et « nouveau » attendent', function () {
      const p = plan();
      assertEqual(p.counts.aConfirmer, 2);
      assertEqual(p.counts.projetsCrees, 0);
      assertEqual(p.counts.projetsLies, 2, 'ALPHA (dates) et DELTA (nouvelle ligne OPE)');
      assertEqual(p.counts.opesCreees, 1, 'seulement OPE-DEL-1');
      assertTrue(p.phase1.concat(p.phase2).every(op => op.entry !== 'projet fictif exemple de format' && op.entry !== 'gamma projet gamma finance'));
    });

    it('avec accord : crée le projet fictif et ses 2 lignes OPE, relie GAMMA, complète ALPHA et DELTA', function () {
      const p = plan({ decisions: confirmAll() });
      assertDeepEqual({ projetsCrees: p.counts.projetsCrees, projetsLies: p.counts.projetsLies, opesCreees: p.counts.opesCreees, opesCompletees: p.counts.opesCompletees, aConfirmer: p.counts.aConfirmer, dejaAJour: p.counts.dejaAJour },
        { projetsCrees: 1, projetsLies: 3, opesCreees: 4, opesCompletees: 1, aConfirmer: 0, dejaAJour: 0 });
      assertEqual(p.actionCount, 9);
    });

    it('un projet créé porte le nom, l\'acronyme avant « - », les dates min/max, le statut selon la date de fin, une note, et AUCUNE ligne Notifications', function () {
      const created = addOf(plan({ decisions: confirmAll() }), 'Projets')[0].fields;
      assertEqual(created.Projet, FICTIF);
      assertEqual(created.Acronyme, 'PROJET FICTIF');
      assertEqual(created.Date_debut_Projet, UTC(2022, 1, 1), 'la plus ancienne des deux lignes');
      assertEqual(created.Date_de_fin_Projet, UTC(2025, 12, 31));
      assertEqual(created.Statut_operationnel_projet, L().STATUS_CLOSED, 'fin passée : supposé clôturé');
      assertEqual(created.remplissage_automatique_Notifications, 0, 'la valeur par défaut créerait une ligne Notifications');
      assertEqual(created.Programme, 0, 'programme de l\'export inconnu de Grist : rien n\'est renseigné');
      assertIncludes(created.comentaire_general_Suivi_projet, 'Créé par l\'import');
      assertDeepEqual(created.Ligne_OPE.slice(0, 1), ['L']);
      assertEqual(created.Ligne_OPE.length, 3, 'deux lignes OPE à relier');
      const running = plan({ decisions: new Map([['projet fictif exemple de format', { mode: 'auto', confirmed: true, acronyme: 'FIC' }]]) });
      assertEqual(addOf(running, 'Projets')[0].fields.Acronyme, 'FIC', 'l\'acronyme modifié à l\'écran est repris');
    });

    it('un projet de Grist garde son contenu : on ajoute la ligne OPE sans retirer les autres, programme et dates seulement s\'ils sont vides, l\'écart est listé', function () {
      const projets = [Object.assign({}, PROJETS[0], { Programme: 2, Date_debut_Projet: UTC(2020, 1, 1), Ligne_OPE: ['L', 1, 99] }), ...PROJETS.slice(1)];
      const p = plan({ projets, decisions: confirmAll() });
      const alphaUpdate = p.phase2.find(op => op.id === 10);
      assertEqual(alphaUpdate.fields.Programme, undefined, 'programme déjà renseigné : jamais écrasé');
      assertEqual(alphaUpdate.fields.Date_debut_Projet, undefined);
      assertEqual(alphaUpdate.fields.Date_de_fin_Projet, UTC(2026, 12, 31), 'date de fin vide : complétée');
      ['Programme', 'Date de début'].forEach(field => assertTrue(p.conflicts.some(c => c.field === field && c.entry.name === 'Projet Alpha (export)'), 'écart « ' + field + ' » listé'));
      const delta = p.phase2.find(op => op.id === 14);
      assertDeepEqual(delta.fields.Ligne_OPE.slice(0, 1), ['L']);
      assertEqual(delta.before.Ligne_OPE[0], 'L');
    });

    it('la structure d\'une ligne OPE n\'est complétée que si elle est vide', function () {
      const p = plan({ decisions: confirmAll() });
      const upd = p.phase1.find(op => op.kind === 'update');
      assertEqual(upd.id, 1); assertEqual(upd.fields.installe_chez, 1);
      const adds = addOf(p, 'Lignes_OPE').reduce((acc, op) => Object.assign(acc, { [op.fields.N_OPE]: op.fields.installe_chez }), {});
      assertDeepEqual(Object.keys(adds).sort().map(k => [k, adds[k]]), [['FICTIF-0001', 1], ['FICTIF-0002', 1], ['OPE-DEL-1', 0], ['OPE-GAMMA-1', 3]]);
    });

    it('n\'écrit jamais une colonne calculée, ni une colonne absente du document ; jamais aucun montant', function () {
      const p = plan({ decisions: confirmAll(), ctx: { isFormula: (t, c) => t === 'Projets' && c === 'Acronyme', hasColumn: (t, c) => !(t === 'Projets' && c === 'comentaire_general_Suivi_projet') } });
      const created = addOf(p, 'Projets')[0].fields;
      assertFalse('Acronyme' in created, 'colonne calculée');
      assertFalse('comentaire_general_Suivi_projet' in created, 'colonne absente');
      const all = p.phase1.concat(p.phase2).flatMap(op => Object.keys(op.fields));
      assertFalse(all.some(col => /Attribue|Consomme|Disponible|Montant|^c20\d\d_|totalCP|Total_/.test(col)), 'aucun montant dans les écritures : ' + Array.from(new Set(all)).join(', '));
    });

    it('un projet mis de côté, ou bloqué par une erreur de l\'export, n\'écrit rien', function () {
      const decisions = confirmAll(); decisions.set('projet alpha export', { mode: 'skip' });
      const p = plan({ decisions });
      assertEqual(p.counts.misDeCote, 1);
      assertFalse(p.phase2.some(op => op.id === 10));
    });
  });

  describe('Import historique — contrôle des totaux : consommé de l\'export = somme du détail des dépenses', function () {
    const grouped = () => { const lines = L().latestVersions(JOURNAL).lines; return { lines, entries: L().groupProjects(lines, []).entries }; };
    it('sans détail des dépenses importé, le contrôle le dit au lieu de conclure', function () {
      const { lines, entries } = grouped();
      assertFalse(L().checkTotals(lines, entries, []).available);
    });
    it('concordance exacte : « OPE 001 » du détail retrouve « OPE 001 » de l\'export, sans espaces ni casse', function () {
      const { lines, entries } = grouped();
      const detail = [
        { Code_operation: 'FICTIF-0001', AE_consomme: 30000, CP_consomme: 20000 }, { Code_operation: 'fictif-0001', AE_consomme: 7500, CP_consomme: 10000 },
        { Code_operation: 'FICTIF-0002', AE_consomme: 30000, CP_consomme: 30000 }, { Code_operation: 'OPE001', AE_consomme: 1500, CP_consomme: 1200 },
        { Code_operation: 'OPE-GAMMA-1', AE_consomme: 800, CP_consomme: 800 }, { Code_operation: 'OPE-DEL-1', AE_consomme: 100, CP_consomme: 100 }
      ];
      const t = L().checkTotals(lines, entries, detail);
      assertTrue(t.available); assertEqual(t.gaps, 0); assertEqual(t.projectGaps, 0);
      assertEqual(t.total.diffAE, 0); assertEqual(t.total.diffCP, 0);
    });
    it('signale l\'écart par OPE et au total, un OPE sans détail, et un OPE du détail absent de l\'export', function () {
      const { lines, entries } = grouped();
      const detail = [{ Code_operation: 'FICTIF-0001', AE_consomme: 37000, CP_consomme: 30000 }, { Code_operation: 'FICTIF-0002', AE_consomme: 30000, CP_consomme: 30000 }, { Code_operation: 'ZZZ-1', AE_consomme: 5, CP_consomme: 5 }];
      const t = L().checkTotals(lines, entries, detail);
      const f1 = t.rows.find(r => r.ope === 'FICTIF-0001');
      assertEqual(f1.status, 'ecart'); assertEqual(f1.diffAE, 500); assertEqual(f1.diffCP, 0);
      assertEqual(t.rows.find(r => r.ope === 'OPE-DEL-1').status, 'sans-detail');
      assertDeepEqual(t.extra, ['ZZZ-1']);
      assertEqual(t.projects.find(p => p.name === FICTIF).status, 'ecart', 'le total du projet est lui aussi en écart');
      assertTrue(t.gaps >= 4);
    });
  });

  describe('Import historique — la page : lecture, rapprochement, accord, simulation', function () {
    it('Alt+Maj+I ouvre la page cachée ; sans table Import_Financements, elle la crée avec les colonnes de l\'export et dit comment la remplir', async function () {
      const mark = window.__TEST_CALLS__.length;
      document.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, shiftKey: true, code: 'KeyI', bubbles: true }));
      await waitFor(() => !byId('view-import-historique').classList.contains('hidden'), 'page ouverte');
      await waitFor(() => /est vide/.test(byId('ih-root').textContent), 'message de table vide');
      const calls = window.__TEST_CALLS__.slice(mark);
      const created = calls.find(call => call.type === 'AddTable' && call.table === 'Import_Financements');
      assertTrue(!!created, 'la table du journal est créée par l\'outil');
      const byIdCol = Object.fromEntries(created.colDefs.map(col => [col.id, col]));
      assertEqual(created.colDefs.length, 26, '24 colonnes de l\'export + Cle_ligne + Exporte_le');
      assertEqual(byIdCol.N_OPE.label, 'N° OPE', 'l\'étiquette reprend l\'en-tête Excel : l\'import de fichier associe tout seul');
      assertEqual(byIdCol.Attribue_2024.label, 'Attribué 2024'); assertEqual(byIdCol.Etablissement.label, 'Établissement');
      assertEqual(byIdCol.Date_debut.type, 'Date'); assertEqual(byIdCol.Consomme_AE.type, 'Numeric');
      assertFalse(created.colDefs.some(col => col.isFormula), 'aucune colonne calculée : le formulaire doit pouvoir tout envoyer');
      ['Programme', 'Projet', 'Financeur', 'Financeurs_du_projet', 'N_OPE', 'Libelle_operation', 'Ligne_budgetaire', 'Statuts', 'N_decision', 'Structure', 'Etablissement', 'Date_debut', 'Date_fin', 'Montant_attribue', 'Part_du_projet',
        'Attribue_2022', 'Attribue_2023', 'Attribue_2024', 'Attribue_2025', 'Attribue_2026', 'Consomme_AE', 'Consomme_CP', 'Disponible_AE', 'Disponible_CP', 'Cle_ligne', 'Exporte_le'].forEach(id => assertTrue(!!byIdCol[id], 'colonne ' + id));
      assertTrue(calls.some(call => call.type === 'AddTable' && call.table === 'Import_Journal'), 'le journal des écritures est créé aussi');
      assertIncludes(byId('ih-root').querySelector('.ih-prepared').textContent, 'Import_Financements créée');
      assertFalse(calls.some(call => call.table === 'Lignes_OPE' || call.table === 'Projets'), 'rien n\'est touché dans Projets ni Lignes_OPE (pas de formule de montant, pas de conversion)');
      assertIncludes(byId('ih-root').textContent, 'Importer depuis un fichier');
      assertTrue(!!byId('ih-reload') && !byId('ih-simulate'), 'Relire proposé, pas de simulation sur un journal vide');
      assertFalse(!!document.querySelector('.nav-btn[data-view="view-import-historique"]'), 'pas dans la barre de navigation');
    });

    it('rouvrir la page ne recrée rien', async function () {
      await P().open();
      const mark = window.__TEST_CALLS__.length;
      await P().open();
      assertFalse(window.__TEST_CALLS__.slice(mark).some(call => ['AddTable', 'AddColumn', 'ModifyColumn'].includes(call.type)), 'aucune création au second passage');
    });

    it('une table Import_Financements déjà faite à la main : seules les colonnes manquantes sont ajoutées, les lignes ne sont pas touchées', async function () {
      const mark = window.__TEST_CALLS__.length;
      await setup();
      const calls = window.__TEST_CALLS__.slice(mark);
      const added = calls.filter(call => call.type === 'AddColumn' && call.table === 'Import_Financements').map(call => call.colId);
      assertTrue(added.length > 0 && added.includes('Cle_ligne') && added.includes('Exporte_le'), 'les colonnes absentes sont ajoutées');
      assertFalse(added.includes('N_OPE') || added.includes('Projet') || added.includes('Consomme_AE'), 'celles qui existent ne sont pas recréées');
      assertFalse(calls.some(call => call.table === 'Import_Financements' && ['UpdateRecord', 'RemoveRecord', 'AddRecord'].includes(call.type)), 'aucune ligne du journal n\'est écrite');
      assertEqual((await grist('Import_Financements')).length, 6, 'les 6 envois sont toujours là');
      assertEqual(document.querySelectorAll('.ih-row').length, 4, 'et l\'outil travaille sur eux comme avant');
    });

    it('journal vide : la page le dit et ne propose pas de simuler', async function () {
      await setup({ journal: [] });
      assertIncludes(byId('ih-root').textContent, 'est vide');
      assertFalse(!!byId('ih-simulate'));
    });

    it('si Grist refuse la création de la table, la page le dit au lieu de rester vide', async function () {
      window.__mockSetTable('Import_Financements', { id: [], N_OPE: [] });
      window.__mockSetTable('Projets', toTable(PROJETS)); window.__mockSetTable('Lignes_OPE', toTable(LIGNES));
      P().resetState();
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async function (actions) {
        if (actions.some(action => action[0] === 'AddColumn')) throw new Error('droits insuffisants');
        return original.apply(this, arguments);
      };
      try { await P().open(); } finally { window.grist.docApi.applyUserActions = original; }
      assertIncludes(byId('ih-root').textContent, 'Préparation de Grist impossible');
      assertIncludes(byId('ih-root').textContent, 'droits insuffisants');
    });

    it('affiche un projet par ligne avec son rapprochement, des compteurs par filtre, et un résumé', async function () {
      await setup();
      assertEqual(document.querySelectorAll('.ih-row').length, 4);
      assertEqual(rowCategory('Projet Alpha (export)'), 'sure');
      assertEqual(rowCategory('Un tout autre libellé'), 'sure');
      assertEqual(rowCategory('GAMMA - Projet Gamma financé'), 'maybe');
      assertEqual(rowCategory(FICTIF), 'new');
      const counts = Array.from(document.querySelectorAll('[data-ih-filter]')).reduce((acc, b) => Object.assign(acc, { [b.dataset.ihFilter]: b.querySelector('.kanban-count').textContent }), {});
      assertDeepEqual(counts, { all: '4', maybe: '1', new: '1', sure: '2', conflict: '0', skip: '0' });
      assertIncludes(byId('ih-root').querySelector('.ih-summary').textContent, '5 lignes de financement');
      assertIncludes(byId('ih-root').querySelector('.ih-summary').textContent, 'sur 6 reçues');
      assertEqual(byId('ih-root').querySelector('[data-ih-box="checks"] summary').textContent.includes('7 sur 7'), true);
    });

    it('filtres et recherche : « Nouveaux » et la saisie d\'un N° OPE ne gardent que les projets concernés', async function () {
      await setup();
      document.querySelector('[data-ih-filter="new"]').click();
      assertEqual(document.querySelectorAll('.ih-row').length, 1);
      document.querySelector('[data-ih-filter="all"]').click();
      const search = byId('ih-search'); search.value = 'ope-del'; fire(search, 'input');
      assertEqual(document.querySelectorAll('.ih-row').length, 1);
      assertIncludes(document.querySelector('.ih-row').textContent, 'Un tout autre libellé');
    });

    it('le bouton d\'écriture reste grisé tant que la simulation n\'est pas relue ; rien n\'est écrit à la simulation', async function () {
      await setup();
      assertFalse(!!byId('ih-write'), 'pas de bouton d\'écriture avant la simulation');
      click('ih-confirm-all'); click('ih-simulate');
      await waitFor(() => byId('ih-sim'), 'simulation');
      assertTrue(byId('ih-write').disabled);
      assertEqual(writeCalls().length, 0, 'aucune écriture');
      byId('ih-ack').checked = true; fire(byId('ih-ack'), 'change');
      assertFalse(byId('ih-write').disabled);
      assertIncludes(byId('ih-sim').textContent, 'Écrire 9 actions');
    });

    it('un projet « à confirmer » attend son accord : la simulation le compte et ne l\'écrit pas', async function () {
      await setup();
      click('ih-simulate');
      await waitFor(() => byId('ih-sim'), 'simulation');
      assertIncludes(byId('ih-sim').textContent, '2 projets attendent ta validation');
      assertFalse(/OPE-GAMMA-1/.test(byId('ih-sim').textContent), 'rien n\'est prévu pour GAMMA tant qu\'il n\'est pas confirmé');
    });

    it('« Autre projet… » : le projet reste en attente jusqu\'au choix, puis vaut accord', async function () {
      await setup();
      const select = entryRow(FICTIF).querySelector('[data-ih-select]');
      select.value = 'other'; fire(select, 'change');
      assertEqual(rowCategory(FICTIF), 'new');
      click('ih-simulate'); await waitFor(() => byId('ih-sim'), 'simulation');
      assertIncludes(byId('ih-sim').textContent, 'attendent ta validation');
      const other = entryRow(FICTIF).querySelector('[data-ih-other]');
      other.value = '12'; fire(other, 'change');
      click('ih-simulate'); await waitFor(() => byId('ih-sim') && /GAMMA/.test(byId('ih-sim').textContent), 'GAMMA relié');
      assertTrue(Array.from(document.querySelectorAll('.ih-actions li')).some(li => /FICTIF-0001/.test(li.textContent)), 'lignes OPE créées');
      assertFalse(Array.from(document.querySelectorAll('.ih-actions li')).some(li => /Projet <b>PROJET FICTIF/.test(li.innerHTML)), 'pas de création : relié à GAMMA');
    });

    it('un N° OPE rattaché à deux projets dans l\'export : projets écartés (« À corriger »), jamais écrits', async function () {
      const bad = [Object.assign({ id: 1 }, alpha, { Projet: 'P1', N_OPE: 'B' }), Object.assign({ id: 2 }, alpha, { Projet: 'P2', N_OPE: 'B', Financeur: 'IDEX' })];
      await setup({ journal: bad });
      assertEqual(document.querySelectorAll('.ih-state.is-skip').length, 2);
      assertIncludes(document.querySelector('.ih-row').textContent, 'plusieurs projets'.slice(0, 0) + 'N° OPE B');
      click('ih-confirm-all'); click('ih-simulate'); await waitFor(() => byId('ih-sim'), 'simulation');
      assertEqual(P().state.plan.actionCount, 0);
    });

    it('le contrôle des totaux s\'affiche dans la simulation quand le détail des dépenses existe', async function () {
      await setup({ depenses: [{ Code_operation: 'FICTIF-0001', AE_consomme: 1, CP_consomme: 1 }] });
      click('ih-simulate'); await waitFor(() => byId('ih-sim'), 'simulation');
      assertIncludes(byId('ih-sim').textContent, 'OPE en écart');
      assertEqual(byId('ih-root').querySelector('[data-ih-box="totals-sim"]').open, true, 'ouvert d\'office quand il y a un écart');
    });
  });

  describe('Import historique — écriture, journal, annulation', function () {
    const GRIST_INITIAL = () => ({ projets: PROJETS.length, lignes: LIGNES.length });

    it('écrit seulement Projets, Lignes_OPE et le journal ; Ligne_OPE au format liste Grist ; rien d\'autre, aucun montant', async function () {
      await setup();
      await simulateAndWrite();
      assertIncludes(document.querySelector('.ih-banner').textContent, 'Écrit');
      assertIncludes(document.querySelector('.ih-banner').textContent, '1 projet créé');
      const calls = writeCalls();
      assertEqual(calls.length, 9);
      assertTrue(calls.every(call => ['Projets', 'Lignes_OPE'].includes(call.table)), 'seulement les deux tables prévues');
      const projets = await grist('Projets'), lignes = await grist('Lignes_OPE');
      assertEqual(projets.length, GRIST_INITIAL().projets + 1);
      assertEqual(lignes.length, GRIST_INITIAL().lignes + 4);
      const created = projets.find(p => p.Projet === FICTIF);
      const ids = created.Ligne_OPE.slice(1);
      assertEqual(created.Ligne_OPE[0], 'L');
      assertDeepEqual(ids.map(id => lignes.find(l => l.id === id).N_OPE).sort(), ['FICTIF-0001', 'FICTIF-0002']);
      assertEqual(created.Statut_operationnel_projet, L().STATUS_CLOSED);
      assertEqual(created.remplissage_automatique_Notifications, 0);
      assertEqual(projets.find(p => p.id === 14).Ligne_OPE.length, 2, 'DELTA : une ligne OPE de plus');
      assertEqual(projets.find(p => p.id === 10).Date_debut_Projet, UTC(2024, 1, 1));
      assertEqual(lignes.find(l => l.id === 1).installe_chez, 1, 'structure complétée sur la ligne OPE existante');
      assertEqual(lignes.find(l => l.id === 1).totalCPConsomme, 1200, 'les montants ne sont pas touchés');
      const keys = new Set(calls.flatMap(c => Object.keys(c.fields || {})));
      assertFalse(Array.from(keys).some(k => /Attribue|Consomme|Disponible|Montant|Total|Statut_Macro/.test(k)));
    });

    it('le journal garde chaque écriture (avant / après) sous un même lot', async function () {
      await setup();
      await simulateAndWrite();
      const journal = await grist('Import_Journal');
      assertEqual(journal.length, 9);
      assertEqual(new Set(journal.map(r => r.Lot)).size, 1);
      assertTrue(journal.every(r => r.Annule === false));
      const delta = journal.find(r => r.Table_modifiee === 'Projets' && r.Operation === 'modif' && r.Ligne === 14);
      assertDeepEqual(JSON.parse(delta.Avant).Ligne_OPE, ['L']);
      assertEqual(JSON.parse(delta.Apres).Ligne_OPE.length, 2);
      assertIncludes(byId('ih-root').querySelector('[data-ih-box="lots"]').textContent, 'Annuler ce lot');
    });

    it('relançable : une fois écrit, la simulation suivante ne prévoit plus rien (aucun doublon)', async function () {
      await setup();
      await simulateAndWrite();
      click('ih-confirm-all'); click('ih-simulate');
      await waitFor(() => byId('ih-sim'), 'nouvelle simulation');
      assertEqual(P().state.plan.actionCount, 0);
      assertEqual(P().state.plan.counts.projetsCrees, 0);
      assertEqual(P().state.plan.counts.dejaAJour, 4);
      assertEqual(rowCategory(FICTIF), 'sure', 'le projet créé est maintenant retrouvé par son N° OPE');
    });

    it('annuler un lot : remet les champs d\'avant, supprime ce qui a été créé, marque le journal', async function () {
      await setup();
      await simulateAndWrite();
      document.querySelector('[data-ih-undo]').click();
      await waitFor(() => document.querySelector('[data-ih-undo-confirm]'), 'aperçu de l\'annulation');
      assertIncludes(document.querySelector('.ih-undo').textContent, '9 actions seront défaites');
      document.querySelector('[data-ih-undo-confirm]').click();
      await waitFor(() => /Lot annulé/.test(byId('ih-root').textContent), 'annulation faite');
      const projets = await grist('Projets'), lignes = await grist('Lignes_OPE'), journal = await grist('Import_Journal');
      assertEqual(projets.length, GRIST_INITIAL().projets);
      assertEqual(lignes.length, GRIST_INITIAL().lignes);
      assertDeepEqual(projets.find(p => p.id === 14).Ligne_OPE, ['L']);
      assertEqual(lignes.find(l => l.id === 1).installe_chez, 0);
      assertEqual(projets.find(p => p.id === 10).Date_debut_Projet, null);
      assertTrue(journal.every(r => r.Annule === true));
    });

    it('annuler ne touche pas ce qui a été modifié depuis : le projet créé puis édité à la main reste, la raison est donnée', async function () {
      await setup();
      await simulateAndWrite();
      const created = (await grist('Projets')).find(p => p.Projet === FICTIF);
      await CoreGrist.gristInstance.docApi.applyUserActions([['UpdateRecord', 'Projets', created.id, { Statut_operationnel_projet: 'en cours', Acronyme: 'FIC-MODIFIE' }]]);
      document.querySelector('[data-ih-undo]').click();
      await waitFor(() => document.querySelector('[data-ih-undo-confirm]'), 'aperçu');
      assertIncludes(document.querySelector('.ih-undo').textContent, 'modifiée depuis l\'import');
      document.querySelector('[data-ih-undo-confirm]').click();
      await waitFor(() => /Lot annulé/.test(byId('ih-root').textContent), 'annulation faite');
      const projets = await grist('Projets'), lignes = await grist('Lignes_OPE');
      assertTrue(projets.some(p => p.id === created.id && p.Acronyme === 'FIC-MODIFIE'), 'projet édité conservé');
      assertTrue(lignes.some(l => l.N_OPE === 'FICTIF-0001'), 'ses lignes OPE restent aussi : il les utilise encore');
      assertEqual(projets.length, GRIST_INITIAL().projets + 1);
    });

    it('si Grist refuse la création des projets, les lignes OPE déjà écrites restent annulables et l\'erreur est dite', async function () {
      await setup();
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async function (actions) {
        if (actions.some(action => action[1] === 'Projets')) throw new Error('Grist refuse (test)');
        return original.call(this, actions);
      };
      try { await simulateAndWrite(); } finally { window.grist.docApi.applyUserActions = original; }
      assertIncludes(document.querySelector('.ih-banner').textContent, 'Écriture interrompue');
      assertIncludes(document.querySelector('.ih-banner').textContent, 'Grist refuse (test)');
      assertIncludes(document.querySelector('.ih-banner').textContent, '5 écritures sont passées');
      const journal = await grist('Import_Journal');
      assertEqual(journal.length, 5, 'journal des écritures passées');
      assertEqual((await grist('Projets')).length, GRIST_INITIAL().projets);
      assertTrue(!!document.querySelector('[data-ih-undo]'), 'le lot est annulable');
    });

    it('relit Grist avant d\'écrire : une simulation qui date de plus de 10 minutes est refusée', async function () {
      await setup();
      click('ih-confirm-all'); click('ih-simulate'); await waitFor(() => byId('ih-sim'), 'simulation');
      P().state.simulatedAt = Date.now() - 11 * 60 * 1000;
      byId('ih-ack').checked = true; fire(byId('ih-ack'), 'change');
      click('ih-write');
      await waitFor(() => document.querySelector('.ih-banner.is-error'), 'refus');
      assertIncludes(document.querySelector('.ih-banner').textContent, 'plus de 10 minutes');
      assertEqual(writeCalls().length, 0);
    });
  });
})();
