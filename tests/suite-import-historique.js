/**
 * Non-regression suite : outil « Import de l'historique financier » (js/pages/import-historique-logic.js + page-import-historique.js) — 18/11/2026.
 *
 * Planche validée par Antoine le 18/11/2026, puis tableau de contrôle (maquette v6) : une ligne par projet de l'export, des cellules
 * colorées (ajout, modification, écart où Grist garde sa valeur, anomalie), un clic sur une valeur pour la changer. L'outil relie le
 * journal Import_Financements aux projets et aux lignes OPE de Grist (création de ce qui manque), ne copie AUCUN montant, vérifie les
 * totaux contre le détail des dépenses, bloque l'écriture tant qu'il reste une anomalie, et tient un journal qui rend chaque lot annulable.
 *
 * Jeu de données (posé par load()) :
 *   Journal (6 envois) : FICTIF-0001 InnovationS (2 versions : id 1 puis id 3), FICTIF-0002 IDEX — les 2 lignes du tableur de test —,
 *     « OPE 001 » (Projet Alpha), « OPE-GAMMA-1 » (nom contenant l'acronyme GAMMA), « OPE-DEL-1 » (N° décision DEC-2023-045).
 *   Grist : Programmes 1 FARE, 2 CTO Innovation · Structures 1 LAB1 (« Laboratoire fictif »), 3 DIESE · Lignes OPE 1 « OPE001 » ·
 *     Projets 10 ALPHA (OPE 1, programme FARE), 12 GAMMA (rien), 14 DELTA (cite DEC-2023-045).
 *   Donc : « Projet Alpha (export) » = sûr (N° OPE), « Un tout autre libellé » = sûr (N° décision) mais sa structure « Structure inconnue » est
 *     une anomalie, « GAMMA - Projet Gamma financé » = à confirmer (acronyme dans le nom), « PROJET FICTIF - exemple de format » = nouveau
 *     (2 lignes OPE) mais son programme « Programme fictif (test) » est une anomalie. 3 anomalies au départ.
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
  const KEY = { fictif: 'projet fictif exemple de format', gamma: 'gamma projet gamma finance', alpha: 'projet alpha export', delta: 'un tout autre libelle' };
  const rowEl = key => document.querySelector(`tr[data-ih-entry="${key}"]`);
  const rowOfName = name => Array.from(document.querySelectorAll('.ih-tr')).find(row => row.textContent.includes(name));
  const rowState = name => { const el = rowOfName(name); return el ? el.className.replace(/.*is-(\w+).*/, '$1') : null; };
  const cellEl = id => document.querySelector(`[data-ih-cell="${id}"]`);
  const click = id => byId(id).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  const writeCalls = () => window.__TEST_CALLS__.filter(call => ['Projets', 'Lignes_OPE'].includes(call.table) && ['AddRecord', 'UpdateRecord', 'RemoveRecord'].includes(call.type));
  const grist = name => CoreGrist.getTable(name);
  // Ouvre une cellule du tableau, y choisit une valeur (ou en tape une) comme le ferait l'utilisateur.
  const openCell = id => { const el = cellEl(id); assertTrue(!!el, 'cellule ' + id); el.click(); };
  const inEl = id => document.querySelector(`[data-ih-in="${id}"]`);
  const pickIn = (id, value) => { const el = inEl(id); assertTrue(!!el, 'éditeur ' + id); setValue(el, value); fire(el, 'change'); };
  const fixCell = (id, value) => { openCell(id); pickIn(id, value); };
  // Règle les 3 anomalies de départ : GAMMA confirmé, programme fictif non renseigné, structure inconnue non renseignée.
  const fixAll = () => {
    fixCell(KEY.gamma + '|status', 'p:12');
    fixCell(KEY.fictif + '|prog', '__none');
    fixCell(KEY.delta + '|s|OPE-DEL-1', '__none');
  };
  const ackWrite = async () => {
    const ack = byId('ih-ack'); ack.checked = true; fire(ack, 'change');
    click('ih-write');
    await waitFor(() => document.querySelector('.ih-banner'), 'résultat de l\'écriture');
  };
  const fixAndWrite = async () => { fixAll(); await ackWrite(); };

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

    it('une ligne sans nom de projet est une erreur qui exclut la ligne ; un N° OPE partagé par deux projets est une simple information (OPE RH)', function () {
      const issues = L().checkLines([{ _key: 'a', N_OPE: 'A', Projet: '' }, { _key: 'b', N_OPE: 'B', Projet: 'P1' }, { _key: 'c', N_OPE: 'B', Projet: 'P2', Financeur: 'Z' }]);
      assertTrue(issues.some(i => i.check === 'projet-vide' && i.level === 'error'));
      assertEqual(issues.filter(i => i.check === 'ope-projets' && i.level === 'error').length, 0, 'plus d\'erreur : une OPE RH sert à de nombreux projets (Antoine 26/11)');
      assertEqual(issues.filter(i => i.check === 'ope-projets' && i.level === 'warn').length, 1);
      const grouped = L().groupProjects([{ _key: 'b', N_OPE: 'B', Projet: 'P1' }, { _key: 'c', N_OPE: 'B', Projet: 'P2' }], issues);
      assertTrue(grouped.entries.every(entry => !entry.blocked), 'les deux projets sont gardés');
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
      const { ctx } = matches();
      const prog = label => L().matchLabel(label, ctx.programmeList, p => [p.n]), struct = label => L().matchLabel(label, ctx.structureList, s => s.names);
      assertTrue(prog('FARE').exact); assertEqual(prog('fare').item.id, 1, 'sans accents ni majuscules');
      assertEqual(prog('Programme fictif (test)').item, null, 'aucun programme proche : rien n\'est renseigné'); assertEqual(prog('Programme fictif (test)').suggestion, null);
      assertEqual(struct('Laboratoire fictif').item.id, 1, 'le nom complet suffit'); assertEqual(struct('DIESE').item.id, 3);
      assertEqual(struct('Structure inconnue').item, null);
      const close = struct('Laboratoire fictiv');
      assertFalse(close.exact); assertEqual(close.suggestion.id, 1, 'un libellé très proche est suggéré, à relire');
    });
  });

  describe('Import historique — le tableau de contrôle : une cellule par valeur, une couleur par sens', function () {
    function build(options = {}) {
      const lines = L().latestVersions(options.journal || JOURNAL).lines, grouped = L().groupProjects(lines, L().checkLines(lines));
      const ctx = Object.assign(L().buildContext({ projets: options.projets || PROJETS, lignes: options.lignes || LIGNES, programmes: PROGRAMMES, structures: STRUCTURES, statusChoices: options.statusChoices }), options.ctx || {});
      const matches = new Map(grouped.entries.map(e => [e.key, L().matchEntry(e, ctx)]));
      return L().buildTable({ entries: grouped.entries, matches, decisions: options.decisions || new Map(), edits: options.edits || new Map(), ctx, now: Date.UTC(2026, 10, 18) });
    }
    const rowOf = (t, key) => t.rows.find(r => r.key === key);
    const states = row => Object.fromEntries(Object.keys(row.cells).map(k => [k, row.cells[k].state]));
    const resolved = () => ({ decisions: new Map([[KEY.gamma, { mode: 'project', projectId: 12, confirmed: true }]]), edits: new Map([[KEY.fictif + '|prog', null], [KEY.delta + '|s|OPE-DEL-1', null]]) });

    it('une ligne par projet, avec son état : ajout, modification, à confirmer', function () {
      const t = build();
      assertEqual(t.rows.length, 4);
      assertEqual(rowOf(t, KEY.fictif).state, 'add'); assertEqual(rowOf(t, KEY.alpha).state, 'mod'); assertEqual(rowOf(t, KEY.delta).state, 'mod');
      assertEqual(rowOf(t, KEY.gamma).state, 'tbd', 'nom proche : attend un choix');
      assertDeepEqual({ add: t.add, mod: t.mod, same: t.same, tbd: t.tbd, skip: t.skip, todo: t.todo, left: t.left }, { add: 1, mod: 2, same: 0, tbd: 1, skip: 0, todo: 3, left: 3 });
    });

    it('projet créé : tout est « ajouté », l\'acronyme vient du nom avant « - », les dates sont les plus larges, le statut suit la date de fin', function () {
      const row = rowOf(build(), KEY.fictif);
      assertEqual(row.cells.name.state, 'add'); assertEqual(row.cells.acr.v, 'PROJET FICTIF');
      assertEqual(row.cells.start.v, '2022-01-01', 'la plus ancienne des deux lignes'); assertEqual(row.cells.end.v, '2025-12-31');
      assertEqual(row.cells.stat.v, L().STATUS_CLOSED); assertEqual(row.cells.stat.state, 'add');
      assertDeepEqual(row.lines.map(l => [l.ope, l.state, l.cell.v]).sort(), [['FICTIF-0001', 'add', 'LAB1'], ['FICTIF-0002', 'add', 'LAB1']], 'le nom complet de la structure est reconnu : LAB1');
    });

    it('projet de Grist : vide = modifié (bleu), identique = inchangé, rempli et différent = écart, Grist garde sa valeur', function () {
      const alpha = rowOf(build(), KEY.alpha);
      assertDeepEqual(states(alpha), { name: 'conf', acr: 'same', prog: 'same', start: 'fill', end: 'fill', stat: 'empty' });
      assertEqual(alpha.cells.name.v, 'Projet Alpha', 'la valeur de Grist reste affichée'); assertEqual(alpha.cells.name.alt, 'Projet Alpha (export)', 'celle de l\'export est montrée à côté');
      assertEqual(alpha.lines[0].state, 'fill', 'la structure de la ligne OPE était vide dans Grist'); assertEqual(alpha.lines[0].cell.v, 'LAB1');
      const full = rowOf(build({ projets: [Object.assign({}, PROJETS[0], { Programme: 2, Date_debut_Projet: UTC(2020, 1, 1) }), ...PROJETS.slice(1)] }), KEY.alpha);
      assertEqual(full.cells.prog.state, 'conf'); assertEqual(full.cells.prog.v, 'CTO Innovation'); assertEqual(full.cells.prog.alt, 'FARE');
      assertEqual(full.cells.start.state, 'conf'); assertEqual(full.cells.start.v, '2020-01-01');
    });

    it('une valeur que Grist n\'accepte pas est une anomalie, avec sa raison et une suggestion quand un libellé est proche', function () {
      const t = build({ statusChoices: ['en cours', 'En retard'] });
      const fictif = rowOf(t, KEY.fictif);
      assertEqual(fictif.cells.prog.state, 'bad'); assertEqual(fictif.cells.prog.err, 'Programme inconnu dans Grist'); assertEqual(fictif.cells.prog.v, 'Programme fictif (test)');
      assertEqual(fictif.cells.stat.state, 'bad'); assertEqual(fictif.cells.stat.err, 'Absent de la liste de choix', 'le statut « supposé clôturé » n\'est pas dans les choix de la colonne');
      assertEqual(rowOf(t, KEY.delta).lines[0].state, 'bad'); assertEqual(rowOf(t, KEY.delta).lines[0].cell.err, 'Structure inconnue dans Grist');
      assertEqual(fictif.anomalies, 2);
      const near = build({ journal: JOURNAL.map(r => (r.N_OPE === 'OPE-DEL-1' ? Object.assign({}, r, { Structure: 'Laboratoire fictiv' }) : r)) });
      assertEqual(rowOf(near, KEY.delta).lines[0].cell.hint, 'LAB1');
      const reversed = build({ journal: JOURNAL.map(r => (r.N_OPE === 'OPE-GAMMA-1' ? Object.assign({}, r, { Date_fin: UTC(2020, 1, 1) }) : r)) });
      assertEqual(rowOf(reversed, KEY.gamma).cells.end.state, 'bad'); assertEqual(rowOf(reversed, KEY.gamma).cells.end.err, 'Fin avant le début');
    });

    it('une valeur choisie remplace celle de l\'export et lève l\'anomalie ; « ne pas renseigner » aussi', function () {
      const t = build({ edits: new Map([[KEY.fictif + '|prog', 'FARE'], [KEY.delta + '|s|OPE-DEL-1', 'DIESE']]) });
      assertEqual(rowOf(t, KEY.fictif).cells.prog.state, 'add'); assertEqual(rowOf(t, KEY.fictif).cells.prog.v, 'FARE');
      assertEqual(rowOf(t, KEY.delta).lines[0].cell.v, 'DIESE'); assertEqual(rowOf(t, KEY.delta).lines[0].state, 'add');
      assertEqual(t.left, 1, 'reste seulement GAMMA à confirmer');
      const none = build({ edits: new Map([[KEY.fictif + '|prog', null]]) });
      assertEqual(rowOf(none, KEY.fictif).cells.prog.state, 'empty'); assertEqual(rowOf(none, KEY.fictif).anomalies, 0);
    });

    it('la même valeur invalide sur plusieurs projets se règle d\'un coup, sur demande seulement', function () {
      const twin = (name, ope) => Object.assign({}, alpha, { Projet: name, N_OPE: ope, Programme: 'CTO Innov. 2024', Structure: 'LAB1' });
      const journal = [Object.assign({ id: 1 }, twin('Projet Un', 'N-1')), Object.assign({ id: 2 }, twin('Projet Deux', 'N-2')), Object.assign({ id: 3 }, twin('Projet Trois', 'N-3'))];
      const t = build({ journal, projets: [], lignes: [] });
      const ids = t.rows.map(r => r.cells.prog.id);
      assertEqual(t.rows.every(r => r.cells.prog.state === 'bad'), true);
      assertEqual(L().similarBad(t, ids[0]).length, 2, 'deux autres projets disent la même chose');
      const all = new Map(); L().applyChoice(t, all, ids[0], 'FARE', true);
      assertEqual(all.size, 3);
      assertEqual(build({ journal, projets: [], lignes: [], edits: all }).left, 0);
      const one = new Map(); L().applyChoice(t, one, ids[0], 'FARE', false);
      assertEqual(one.size, 1, 'sans la case, une seule cellule change');
    });

    it('un N° OPE déjà sur un autre projet : anomalie à trancher (rattacher aussi, ou écarter le projet)', function () {
      const decisions = new Map([[KEY.alpha, { mode: 'project', projectId: 12, confirmed: true }]]);
      const line = t => rowOf(t, KEY.alpha).lines[0];
      const t = build({ decisions });
      assertEqual(line(t).state, 'bad'); assertEqual(line(t).conflict.owner, 'ALPHA'); assertEqual(rowOf(t, KEY.alpha).anomalies, 1);
      const keep = build({ decisions, edits: new Map([[KEY.alpha + '|c|OPE001', 'keep']]) });
      assertEqual(line(keep).state, 'fill'); assertEqual(rowOf(keep, KEY.alpha).anomalies, 0);
      assertTrue(keep.plan.phase2.some(op => op.id === 12 && op.fields.Ligne_OPE.includes(1)), 'la ligne OPE est rattachée au projet choisi');
    });

    it('décisions : « autre projet » sans choix attend ; écarter met de côté ; un projet absent de Grist n\'attend plus d\'accord', function () {
      const E = L().effectiveDecision;
      assertEqual(E({ status: 'new' }, null).confirmed, true); assertEqual(E({ status: 'new' }, null).action, 'create');
      assertEqual(E({ status: 'maybe', projectId: 12 }, null).confirmed, false);
      assertEqual(E({ status: 'maybe', projectId: 12 }, { mode: 'project', projectId: 12 }).confirmed, true);
      assertEqual(E({ status: 'sure', projectId: 10 }, { mode: 'other' }).action, 'pending');
      assertEqual(E({ status: 'conflict' }, null).action, 'pending');
      assertEqual(E({ status: 'sure', projectId: 10 }, { mode: 'skip' }).action, 'skip');
      assertEqual(E({ status: 'blocked' }, { mode: 'project', projectId: 3 }).action, 'skip');
    });
  });

  describe('Import historique — la simulation : ce qui sera écrit, et seulement ce que décrit la planche', function () {
    function plan(options = {}) {
      const lines = L().latestVersions(JOURNAL).lines, grouped = L().groupProjects(lines, L().checkLines(lines));
      const ctx = Object.assign(L().buildContext({ projets: options.projets || PROJETS, lignes: LIGNES, programmes: PROGRAMMES, structures: STRUCTURES }), options.ctx || {});
      const matches = new Map(grouped.entries.map(e => [e.key, L().matchEntry(e, ctx)]));
      return L().buildPlan({ entries: grouped.entries, matches, decisions: options.decisions || new Map(), edits: options.edits || new Map(), ctx, now: Date.UTC(2026, 10, 18) });
    }
    const gammaOk = { mode: 'project', projectId: 12, confirmed: true };
    // Les trois anomalies de départ réglées : GAMMA confirmé, programme fictif et structure inconnue non renseignés.
    const settled = (extra = {}) => ({
      decisions: new Map([[KEY.gamma, gammaOk]].concat(extra.decisions || [])),
      edits: new Map([[KEY.fictif + '|prog', null], [KEY.delta + '|s|OPE-DEL-1', null]].concat(extra.edits || []))
    });
    const addOf = (p, table) => p.phase1.concat(p.phase2).filter(op => op.kind === 'add' && op.table === table);

    it('tant qu\'un projet porte une anomalie ou attend un choix, rien n\'est prévu pour lui : seul ALPHA est prêt', function () {
      const p = plan();
      assertEqual(p.counts.aConfirmer, 3);
      assertEqual(p.counts.projetsCrees, 0);
      assertEqual(p.counts.projetsLies, 1, 'ALPHA (dates)');
      assertEqual(p.counts.opesCompletees, 1, 'la structure de OPE001');
      assertEqual(p.counts.opesCreees, 0);
      assertTrue(p.phase1.concat(p.phase2).every(op => op.entry === KEY.alpha));
    });

    it('anomalies réglées : crée le projet fictif et ses 2 lignes OPE, relie GAMMA, complète ALPHA et DELTA', function () {
      const p = plan(settled());
      assertDeepEqual({ projetsCrees: p.counts.projetsCrees, projetsLies: p.counts.projetsLies, opesCreees: p.counts.opesCreees, opesCompletees: p.counts.opesCompletees, aConfirmer: p.counts.aConfirmer, dejaAJour: p.counts.dejaAJour },
        { projetsCrees: 1, projetsLies: 3, opesCreees: 4, opesCompletees: 1, aConfirmer: 0, dejaAJour: 0 });
      assertEqual(p.actionCount, 9);
    });

    it('un projet créé porte le nom, l\'acronyme avant « - », les dates min/max, le statut selon la date de fin, une note, et AUCUNE ligne Notifications', function () {
      const created = addOf(plan(settled()), 'Projets')[0].fields;
      assertEqual(created.Projet, FICTIF);
      assertEqual(created.Acronyme, 'PROJET FICTIF');
      assertEqual(created.Date_debut_Projet, UTC(2022, 1, 1), 'la plus ancienne des deux lignes');
      assertEqual(created.Date_de_fin_Projet, UTC(2025, 12, 31));
      assertEqual(created.Statut_operationnel_projet, L().STATUS_CLOSED, 'fin passée : supposé clôturé');
      assertEqual(created.remplissage_automatique_Notifications, 0, 'la valeur par défaut créerait une ligne Notifications');
      assertEqual(created.Programme, 0, 'programme de l\'export inconnu de Grist, non renseigné : rien n\'est écrit');
      assertIncludes(created.comentaire_general_Suivi_projet, 'Créé par l\'import');
      assertDeepEqual(created.Ligne_OPE.slice(0, 1), ['L']);
      assertEqual(created.Ligne_OPE.length, 2, 'OPE 1 : la ligne InnovationS');
      assertEqual(created.Ligne_OPE_2.length, 2, 'OPE 2 : la ligne IDEX (une ligne par rang, voir suite-import-historique-ope-multiples.js)');
      const edited = plan(settled({ edits: [[KEY.fictif + '|acr', 'FIC'], [KEY.fictif + '|prog', 'CTO Innovation'], [KEY.fictif + '|end', '2030-06-30']] }));
      const fields = addOf(edited, 'Projets')[0].fields;
      assertEqual(fields.Acronyme, 'FIC', 'l\'acronyme modifié à l\'écran est repris'); assertEqual(fields.Programme, 2, 'le programme choisi est écrit par son id');
      assertEqual(fields.Date_de_fin_Projet, UTC(2030, 6, 30)); assertEqual(fields.Statut_operationnel_projet, 'en cours', 'le statut suit la date de fin corrigée');
    });

    it('un projet de Grist garde son contenu : on ajoute la ligne OPE sans retirer les autres, programme et dates seulement s\'ils sont vides, l\'écart reste visible', function () {
      const projets = [Object.assign({}, PROJETS[0], { Programme: 2, Date_debut_Projet: UTC(2020, 1, 1), Ligne_OPE: ['L', 1, 99] }), ...PROJETS.slice(1)];
      const p = plan(Object.assign({ projets }, settled()));
      const alphaUpdate = p.phase2.find(op => op.id === 10);
      assertEqual(alphaUpdate.fields.Programme, undefined, 'programme déjà renseigné : jamais écrasé');
      assertEqual(alphaUpdate.fields.Date_debut_Projet, undefined);
      assertEqual(alphaUpdate.fields.Date_de_fin_Projet, UTC(2026, 12, 31), 'date de fin vide : complétée');
      assertEqual(p.counts.ecarts, 5, 'programme et date de début d\'ALPHA, et le nom des trois projets de Grist');
      const delta = p.phase2.find(op => op.id === 14);
      assertDeepEqual(delta.fields.Ligne_OPE.slice(0, 1), ['L']);
      assertEqual(delta.before.Ligne_OPE[0], 'L');
    });

    it('prendre la valeur de l\'export à la place de celle de Grist : cellule par cellule, l\'ancienne valeur est gardée pour l\'annulation', function () {
      const projets = [Object.assign({}, PROJETS[0], { Programme: 2 }), ...PROJETS.slice(1)];
      const p = plan(Object.assign({ projets }, settled({ edits: [[KEY.alpha + '|prog', 'FARE']] })));
      const alphaUpdate = p.phase2.find(op => op.id === 10);
      assertEqual(alphaUpdate.fields.Programme, 1); assertEqual(alphaUpdate.before.Programme, 2);
    });

    it('la structure d\'une ligne OPE n\'est complétée que si elle est vide', function () {
      const p = plan(settled());
      const upd = p.phase1.find(op => op.kind === 'update');
      assertEqual(upd.id, 1); assertEqual(upd.fields.installe_chez, 1);
      const adds = addOf(p, 'Lignes_OPE').reduce((acc, op) => Object.assign(acc, { [op.fields.N_OPE]: op.fields.installe_chez }), {});
      assertDeepEqual(Object.keys(adds).sort().map(k => [k, adds[k]]), [['FICTIF-0001', 1], ['FICTIF-0002', 1], ['OPE-DEL-1', 0], ['OPE-GAMMA-1', 3]]);
      const lignes = [{ id: 1, N_OPE: 'OPE001', installe_chez: 3 }];
      const lines = L().latestVersions(JOURNAL).lines, grouped = L().groupProjects(lines, L().checkLines(lines));
      const ctx = L().buildContext({ projets: PROJETS, lignes, programmes: PROGRAMMES, structures: STRUCTURES });
      const matches = new Map(grouped.entries.map(e => [e.key, L().matchEntry(e, ctx)]));
      const kept = L().buildTable({ entries: grouped.entries, matches, decisions: new Map(), edits: new Map(), ctx, now: Date.UTC(2026, 10, 18) });
      assertEqual(kept.rows.find(r => r.key === KEY.alpha).lines[0].state, 'conf', 'structure déjà renseignée et différente : Grist garde');
      assertFalse(kept.plan.phase1.some(op => op.kind === 'update'));
    });

    it('n\'écrit jamais une colonne calculée, ni une colonne absente du document ; jamais aucun montant', function () {
      const p = plan(Object.assign({ ctx: { isFormula: (t, c) => t === 'Projets' && c === 'Acronyme', hasColumn: (t, c) => !(t === 'Projets' && c === 'comentaire_general_Suivi_projet') } }, settled()));
      const created = addOf(p, 'Projets')[0].fields;
      assertFalse('Acronyme' in created, 'colonne calculée');
      assertFalse('comentaire_general_Suivi_projet' in created, 'colonne absente');
      const all = p.phase1.concat(p.phase2).flatMap(op => Object.keys(op.fields));
      assertFalse(all.some(col => /Attribue|Consomme|Disponible|Montant|^c20\d\d_|totalCP|Total_/.test(col)), 'aucun montant dans les écritures : ' + Array.from(new Set(all)).join(', '));
    });

    it('un projet mis de côté, ou bloqué par une erreur de l\'export, n\'écrit rien', function () {
      const s = settled({ decisions: [[KEY.alpha, { mode: 'skip' }]] });
      const p = plan(s);
      assertEqual(p.counts.misDeCote, 1);
      assertFalse(p.phase2.some(op => op.id === 10));
    });
  });

  describe('Import historique — les lots d\'import (Import_Lots, contrat avec les imports réguliers)', function () {
    const lot = (id, extra) => Object.assign({ id, Lot: '2026-11-18T10:00:00Z', Type: 'Reprise unique', Source: 'Fichier', Statut: 'A valider', Lot_journal: '' }, extra);

    it('un identifiant de lot est la date et l\'heure UTC à la seconde', function () {
      assertEqual(L().lotIdOf(Date.UTC(2026, 10, 18, 12, 45, 30, 987)), '2026-11-18T12:45:30Z');
    });

    it('la table Import_Lots a les colonnes du contrat, avec les listes de choix', function () {
      const cols = Object.fromEntries(L().LOTS_COLUMNS.map(c => [c.id, c]));
      assertDeepEqual(L().LOTS_COLUMNS.map(c => c.id), ['Lot', 'Type', 'Source', 'Fichier', 'Donnees_au', 'Recu_le', 'Lignes', 'Statut', 'Compare_a', 'Ajoutees', 'Modifiees', 'Absentes', 'Anomalies', 'Inchangees', 'Valide_par', 'Valide_le', 'Lot_journal', 'Note']);
      assertEqual(L().LOTS_TABLE, 'Import_Lots');
      assertDeepEqual(JSON.parse(cols.Type.widgetOptions).choices, ['Reprise unique', 'Macro', 'Détail']);
      assertDeepEqual(JSON.parse(cols.Source.widgetOptions).choices, ['Script', 'Fichier']);
      assertDeepEqual(JSON.parse(cols.Statut.widgetOptions).choices, ['A valider', 'Valide', 'Refuse', 'Annule', 'Remplace']);
      assertEqual(cols.Donnees_au.type, 'Date'); assertEqual(cols.Recu_le.type, 'DateTime:Europe/Paris'); assertEqual(cols.Lignes.type, 'Int');
      assertFalse(L().LOTS_COLUMNS.some(c => c.isFormula), 'aucune colonne calculée');
    });

    it('un fichier lu porte un même lot sur toutes ses lignes, et la ligne de lot naît « A valider »', function () {
      const headers = ['Programme', 'Projet', 'Financeur', 'Financeurs du projet', 'N° OPE', 'Libellé opération', 'Ligne budgétaire', 'Statuts', 'N° décision', 'Structure', 'Établissement', 'Date début', 'Date fin', 'Montant attribué', 'Part du projet',
        'Attribué 2022', 'Attribué 2023', 'Attribué 2024', 'Attribué 2025', 'Attribué 2026', 'Consommé AE', 'Consommé CP', 'Disponible AE', 'Disponible CP'];
      const row = n => headers.map(h => (h === 'N° OPE' ? n : (h === 'Projet' ? 'P' : (/Date/.test(h) ? '2024-01-01' : 0))));
      const parsed = L().readExport([headers, row('A-1'), row('A-2')], new Date(Date.UTC(2026, 10, 18, 12, 45, 30)), () => UTC(2024, 1, 1));
      assertEqual(parsed.records.length, 2);
      assertEqual(parsed.lot, '2026-11-18T12:45:30Z');
      assertTrue(parsed.records.every(r => r.Lot === '2026-11-18T12:45:30Z'), 'même Lot partout');
      const fields = L().newLotFields({ lot: parsed.lot, fichier: 'export.xlsx', recuLe: parsed.exporteLe, lignes: 2 });
      assertDeepEqual(fields, { Lot: '2026-11-18T12:45:30Z', Type: 'Reprise unique', Source: 'Fichier', Fichier: 'export.xlsx', Recu_le: parsed.exporteLe, Lignes: 2, Statut: 'A valider' });
    });

    it('les lignes sans lot (anciens chargements) sont rattachées à UN lot « Reprise unique », créé une seule fois', function () {
      const rows = [{ id: 1, Exporte_le: 1790000000, Lot: '' }, { id: 2, Exporte_le: 1790000100, Lot: null }, { id: 3, Exporte_le: 1790000200, Lot: '2026-11-01T00:00:00Z' }];
      const plan = L().planLegacyLot(rows, [], [], new Date(Date.UTC(2026, 10, 18)));
      assertEqual(plan.lot, L().lotIdOf(1790000000 * 1000), 'daté du plus ancien envoi');
      assertDeepEqual(plan.ids, [1, 2], 'seules les lignes sans lot');
      assertEqual(plan.create.Statut, 'A valider'); assertEqual(plan.create.Type, 'Reprise unique'); assertEqual(plan.create.Lignes, 2);
      const written = L().planLegacyLot(rows, [], [{ Operation: 'ajout', Annule: false }], new Date());
      assertEqual(written.create.Statut, 'Valide', 'des écritures existent déjà au journal : le lot est déjà validé');
      const undone = L().planLegacyLot(rows, [], [{ Operation: 'ajout', Annule: true }, { Operation: 'chargement', Annule: false }], new Date());
      assertEqual(undone.create.Statut, 'A valider', 'écritures annulées ou simple chargement : rien n\'est validé');
      assertEqual(L().planLegacyLot(rows, [lot(9, { Lot: plan.lot })], [], new Date()).create, null, 'le lot existe déjà : pas de doublon');
      assertEqual(L().planLegacyLot(rows.slice(2), [], [], new Date()), null, 'tout porte déjà un lot');
    });

    it('validation : le lot du tableau passe en Valide avec la photo du contrôle, le lot validé d\'avant en Remplace', function () {
      const lots = [lot(1, { Lot: '2026-10-01T08:00:00Z', Statut: 'Valide' }), lot(2, { Lot: '2026-11-18T10:00:00Z' }), lot(3, { Lot: '2026-11-18T11:00:00Z', Type: 'Macro' }), lot(4, { Lot: '2026-11-17T09:00:00Z', Statut: 'Refuse' })];
      const actions = L().planLotValidation(lots, { lots: ['2026-11-18T10:00:00Z', '2026-11-18T11:00:00Z'], counts: { add: 3, mod: 5, same: 7, left: 0 }, journalLot: 'LOT-20261118125000', now: Date.UTC(2026, 10, 18, 13, 0, 0) });
      assertEqual(actions.length, 3, 'le lot validé d\'avant en Remplace, puis les deux lots du tableau en Valide (reprise unique et envoi du script)');
      assertDeepEqual(actions[0], ['UpdateRecord', 'Import_Lots', 1, { Statut: 'Remplace' }]);
      assertDeepEqual(actions[1], ['UpdateRecord', 'Import_Lots', 2, { Statut: 'Valide', Compare_a: '2026-10-01T08:00:00Z', Ajoutees: 3, Modifiees: 5, Inchangees: 7, Absentes: 0, Anomalies: 0, Valide_le: Date.UTC(2026, 10, 18, 13) / 1000, Lot_journal: 'LOT-20261118125000' }]);
      assertEqual(actions[2][2], 3); assertEqual(actions[2][3].Statut, 'Valide');
      assertDeepEqual(L().planLotValidation(lots, { lots: ['2026-11-17T09:00:00Z'], counts: {}, journalLot: 'X', now: Date.now() }), [], 'un lot refusé n\'est pas validé par une écriture');
      assertDeepEqual(L().planLotValidation(lots, { lots: ['2026-10-01T08:00:00Z'], counts: {}, journalLot: 'X', now: Date.now() }), [], 'déjà validé : rien à faire');
    });

    it('annulation : le lot du fichier (par son Lot) ou les lots écrits (par leur Lot_journal) passent en Annule, avec le motif', function () {
      const lots = [lot(1, { Lot: 'A' }), lot(2, { Lot: 'B', Statut: 'Valide', Lot_journal: 'LOT-1' }), lot(3, { Lot: 'C', Statut: 'Annule', Lot_journal: 'LOT-1' })];
      assertDeepEqual(L().planLotCancel(lots, { lot: 'A', note: 'Chargement annulé' }), [['UpdateRecord', 'Import_Lots', 1, { Statut: 'Annule', Note: 'Chargement annulé' }]]);
      assertDeepEqual(L().planLotCancel(lots, { journalLot: 'LOT-1', note: 'Écritures annulées' }), [['UpdateRecord', 'Import_Lots', 2, { Statut: 'Annule', Note: 'Écritures annulées' }]], 'un lot déjà annulé n\'est pas retouché');
      assertDeepEqual(L().planLotCancel(lots, { lot: '', journalLot: '' }), [], 'sans identifiant, rien ne correspond');
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

  describe('Import historique — lecture de l\'export Excel (valeurs, dates, erreurs)', function () {
    const HEAD = ['Programme', 'Projet', 'Financeur', 'Financeurs du projet', 'N° OPE', 'Libellé opération', 'Ligne budgétaire', 'Date début', 'Date fin', 'Montant attribué', 'Part du projet', 'Attribué 2022', 'Attribué 2023', 'Attribué 2024', 'Attribué 2025', 'Attribué 2026', 'Consommé AE', 'Consommé CP', 'Disponible AE', 'Disponible CP', 'Statuts', 'N° décision', 'Structure', 'Établissement'];
    const row = (patch = {}) => HEAD.map(h => (h in patch ? patch[h] : null));
    const read = (rows, head = HEAD) => L().readExport([head].concat(rows), new Date('2026-11-18T13:00:00Z'), XlsxReader.excelDateToUnix);

    it('reconnaît les en-têtes sans accent ni casse, lit texte, nombres, pourcentages et dates (série Excel, JJ/MM/AAAA, AAAA-MM-JJ)', function () {
      const head = HEAD.map(h => h.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') + ' ');
      const out = read([row({ 'N° OPE': ' OPE 1 ', Projet: 'P', Financeur: 'InnovationS', 'Ligne budgétaire': 'L1', 'Date début': { excelDate: 44927 }, 'Date fin': '31/12/2025', 'Montant attribué': '1 234,5', 'Part du projet': '60 %', 'Consommé AE': 10, 'N° décision': 12345 }),
        row({ 'N° OPE': 'OPE 2', Projet: 'P', 'Date début': '2024-02-29' })], head);
      assertEqual(out.errorCount, 0); assertEqual(out.records.length, 2);
      const r = out.records[0];
      assertEqual(r.N_OPE, 'OPE 1'); assertEqual(r.Date_debut, Date.UTC(2023, 0, 1) / 1000); assertEqual(r.Date_fin, Date.UTC(2025, 11, 31) / 1000);
      assertEqual(r.Montant_attribue, 1234.5); assertEqual(r.Part_du_projet, 0.6); assertEqual(r.Consomme_AE, 10); assertEqual(r.N_decision, '12345', 'un numéro lu comme nombre reste un texte');
      assertEqual(out.records[1].Date_debut, Date.UTC(2024, 1, 29) / 1000);
      assertFalse('Consomme_CP' in r, 'une cellule vide n\'écrit rien');
    });

    it('ajoute la clé de ligne et l\'instant du chargement (le même pour toutes les lignes) ; ignore les lignes vides et sans N° OPE', function () {
      const out = read([row({ 'N° OPE': 'A1', Financeur: 'F', 'Ligne budgétaire': 'LB' }), row(), row({ Projet: 'sans numéro' }), row({ 'N° OPE': 'A2' })]);
      assertEqual(out.records.length, 2); assertEqual(out.total, 3, 'la ligne entièrement vide n\'est pas comptée'); assertEqual(out.ignored, 1);
      assertEqual(out.records[0].Cle_ligne, 'A1|F|LB'); assertEqual(out.records[1].Cle_ligne, 'A2||');
      assertEqual(out.records[0].Exporte_le, new Date('2026-11-18T13:00:00Z').getTime() / 1000);
      assertEqual(out.records[0].Exporte_le, out.records[1].Exporte_le);
      assertEqual(out.projets, 0); assertEqual(out.opes, 2);
    });

    it('colonnes absentes : rien n\'est chargé et elles sont nommées ; colonnes en plus : listées', function () {
      const out = read([row({ 'N° OPE': 'A1' })], HEAD.filter(h => h !== 'Consommé CP' && h !== 'Statuts').concat(['Commentaire']));
      assertDeepEqual(out.missing, ['Consommé CP', 'Statuts']); assertEqual(out.records.length, 0);
      assertDeepEqual(out.unknown, ['Commentaire']);
      assertEqual(L().readExport([], new Date(), XlsxReader.excelDateToUnix).missing.length, 24, 'feuille vide : tout manque');
    });

    it('une valeur illisible est signalée avec sa ligne et sa colonne, et la ligne n\'est pas retenue', function () {
      const out = read([row({ 'N° OPE': 'A1' }), row({ 'N° OPE': 'A2', 'Consommé AE': 'abc', 'Date début': 'pas une date', 'Date fin': '31/02/2025' })]);
      assertEqual(out.errorCount, 3); assertEqual(out.records.length, 1);
      assertDeepEqual(out.errors.map(e => [e.line, e.column, e.value]), [[3, 'Date début', 'pas une date'], [3, 'Date fin', '31/02/2025'], [3, 'Consommé AE', 'abc']].sort((a, b) => out.errors.findIndex(e => e.column === a[1]) - out.errors.findIndex(e => e.column === b[1])));
    });
  });

  describe('Import historique — annuler un chargement de fichier', function () {
    it('retire les lignes de ce chargement (même instant) et seulement elles ; le chargement est un lot à part dans la liste', function () {
      const journal = [{ id: 5, Lot: 'CHARGEMENT-1', Horodatage: '2026-11-18T13:00:00Z', Table_modifiee: 'Import_Financements', Ligne: 0, Operation: 'chargement', Apres: JSON.stringify({ exporte_le: 1000.5, fichier: 'export.xlsx', lignes: 2 }), Annule: false },
        { id: 6, Lot: 'LOT-1', Horodatage: '2026-11-18T14:00:00Z', Table_modifiee: 'Projets', Ligne: 10, Operation: 'modif', Apres: '{}', Avant: '{}', Annule: false }];
      const rows = [{ id: 1, Exporte_le: 1000.5 }, { id: 2, Exporte_le: 1000.5 }, { id: 3, Exporte_le: 2000 }, { id: 4, Exporte_le: null }];
      const plan = L().planUnload(journal, 'CHARGEMENT-1', rows);
      assertDeepEqual(plan.actions, [['RemoveRecord', 'Import_Financements', 1], ['RemoveRecord', 'Import_Financements', 2]]);
      assertDeepEqual(plan.done, [5]);
      assertEqual(L().planUnload(journal, 'LOT-1', rows).actions.length, 0, 'un lot d\'écriture n\'est pas un chargement');
      const lots = L().summarizeLots(journal);
      const load = lots.find(l => l.lot === 'CHARGEMENT-1');
      assertEqual(load.kind, 'chargement'); assertEqual(load.info.fichier, 'export.xlsx'); assertEqual(load.modifs, 0); assertEqual(lots.find(l => l.lot === 'LOT-1').kind, 'ecriture');
    });
  });

  describe('Import historique — la page : lecture, tableau de contrôle, corrections', function () {
    it('Alt+Maj+I ouvre la page cachée ; sans table Import_Financements, elle la crée avec les colonnes de l\'export et dit comment la remplir', async function () {
      const mark = window.__TEST_CALLS__.length;
      document.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, shiftKey: true, code: 'KeyI', bubbles: true }));
      await waitFor(() => !byId('view-import-historique').classList.contains('hidden'), 'page ouverte');
      await waitFor(() => /Choisir le fichier Excel/.test(byId('ih-root').textContent), 'invitation à choisir le fichier');
      const calls = window.__TEST_CALLS__.slice(mark);
      const created = calls.find(call => call.type === 'AddTable' && call.table === 'Import_Financements');
      assertTrue(!!created, 'la table du journal est créée par l\'outil');
      const byIdCol = Object.fromEntries(created.colDefs.map(col => [col.id, col]));
      assertEqual(created.colDefs.length, 30, '24 colonnes de l\'export + Détail des décisions, Cle_ligne, Exporte_le, Lot, Lignes du lot et Retire_de_la_file');
      assertEqual(byIdCol.N_OPE.label, 'N° OPE', 'l\'étiquette reprend l\'en-tête Excel : l\'import de fichier associe tout seul');
      assertEqual(byIdCol.Attribue_2024.label, 'Attribué 2024'); assertEqual(byIdCol.Etablissement.label, 'Établissement');
      assertEqual(byIdCol.Date_debut.type, 'Date'); assertEqual(byIdCol.Consomme_AE.type, 'Numeric');
      assertFalse(created.colDefs.some(col => col.isFormula), 'aucune colonne calculée : le formulaire doit pouvoir tout envoyer');
      ['Programme', 'Projet', 'Financeur', 'Financeurs_du_projet', 'N_OPE', 'Libelle_operation', 'Ligne_budgetaire', 'Statuts', 'N_decision', 'Structure', 'Etablissement', 'Date_debut', 'Date_fin', 'Montant_attribue', 'Part_du_projet',
        'Attribue_2022', 'Attribue_2023', 'Attribue_2024', 'Attribue_2025', 'Attribue_2026', 'Consomme_AE', 'Consomme_CP', 'Disponible_AE', 'Disponible_CP', 'Cle_ligne', 'Exporte_le', 'Lot', 'Lignes_du_lot', 'Retire_de_la_file', 'Detail_decisions'].forEach(id => assertTrue(!!byIdCol[id], 'colonne ' + id));
      assertTrue(calls.some(call => call.type === 'AddTable' && call.table === 'Import_Journal'), 'le journal des écritures est créé aussi');
      assertIncludes(byId('ih-root').querySelector('.ih-prepared').textContent, 'table Import_Financements (30 colonnes)');
      assertFalse(calls.some(call => call.table === 'Lignes_OPE' || call.table === 'Projets'), 'rien n\'est touché dans Projets ni Lignes_OPE (pas de formule de montant, pas de conversion)');
      assertTrue(!!byId('ih-pick') && !!byId('ih-file') && !byId('ih-write'), 'bouton pour choisir le fichier, pas de tableau sur un journal vide');
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
      assertFalse(calls.some(call => call.table === 'Import_Financements' && ['RemoveRecord', 'AddRecord'].includes(call.type)), 'aucune ligne du journal n\'est ajoutée ni retirée');
      assertTrue(calls.filter(call => call.table === 'Import_Financements' && call.type === 'UpdateRecord').every(call => Object.keys(call.fields).join() === 'Lot'), 'seule la colonne Lot est posée sur les lignes (rattachement à un lot)');
      assertEqual((await grist('Import_Financements')).length, 6, 'les 6 envois sont toujours là');
      assertEqual(document.querySelectorAll('.ih-tr').length, 4, 'et l\'outil travaille sur eux comme avant');
    });

    it('journal vide : la page le dit et ne propose pas d\'écrire', async function () {
      await setup({ journal: [] });
      assertIncludes(byId('ih-root').textContent, 'Charge l\'export Excel');
      assertFalse(!!byId('ih-write'));
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

    it('un tableau : une ligne par projet, ses états, ses couleurs, des compteurs par filtre, une légende et un résumé', async function () {
      await setup();
      assertEqual(document.querySelectorAll('.ih-tr').length, 4);
      assertEqual(rowState(FICTIF), 'add'); assertEqual(rowState('Projet Alpha (export)'), 'mod'); assertEqual(rowState('Un tout autre libellé'), 'mod'); assertEqual(rowState('GAMMA - Projet Gamma financé'), 'tbd', 'à confirmer');
      const head = Array.from(document.querySelectorAll('.ih-t th')).map(th => th.textContent);
      assertDeepEqual(head, ['Statut', 'Projet', 'Acronyme', 'Programme', 'Début', 'Fin', 'Statut du projet', 'Lignes OPE · structure']);
      assertTrue(!!cellEl(KEY.fictif + '|prog').classList.contains('c-bad'), 'programme inconnu : cellule rouge');
      assertTrue(cellEl(KEY.fictif + '|name').classList.contains('c-add'), 'projet créé : cellule verte');
      assertTrue(cellEl(KEY.alpha + '|start').classList.contains('c-fill'), 'date de début posée dans une cellule vide : cellule bleue');
      assertTrue(cellEl(KEY.alpha + '|name').classList.contains('c-conf'), 'nom différent de celui de Grist : cellule orange, Grist garde');
      assertIncludes(cellEl(KEY.alpha + '|name').textContent, 'export : Projet Alpha (export)');
      assertIncludes(cellEl(KEY.fictif + '|prog').textContent, 'Programme inconnu dans Grist');
      const counts = Array.from(document.querySelectorAll('[data-ih-filter]')).reduce((acc, b) => Object.assign(acc, { [b.dataset.ihFilter]: b.querySelector('.kanban-count').textContent }), {});
      assertDeepEqual(counts, { all: '4', add: '1', mod: '2', same: '0', todo: '3', skip: '0' });
      assertEqual(document.querySelectorAll('.ih-legend .ih-sw').length, 4, 'légende : ajouté, modifié, écart, anomalie');
      assertIncludes(byId('ih-root').querySelector('.ih-summary').textContent, '5 lignes de financement');
      assertIncludes(byId('ih-root').querySelector('.ih-summary').textContent, 'sur 6 reçues');
      assertEqual(byId('ih-root').querySelector('[data-ih-box="checks"] summary').textContent.includes('7 sur 7'), true);
    });

    it('filtres et recherche : « Ajouts » et la saisie d\'un N° OPE ne gardent que les projets concernés', async function () {
      await setup();
      document.querySelector('[data-ih-filter="add"]').click();
      assertEqual(document.querySelectorAll('.ih-tr').length, 1);
      document.querySelector('[data-ih-filter="todo"]').click();
      assertEqual(document.querySelectorAll('.ih-tr').length, 3, 'les projets à régler');
      document.querySelector('[data-ih-filter="todo"]').click();
      const search = byId('ih-search'); search.value = 'ope-del'; fire(search, 'input');
      assertEqual(document.querySelectorAll('.ih-tr').length, 1);
      assertIncludes(document.querySelector('.ih-tr').textContent, 'Un tout autre libellé');
    });

    it('cliquer une valeur l\'ouvre ; le choix la colore, enlève l\'anomalie et fait baisser le compteur ; Échap annule', async function () {
      await setup();
      assertIncludes(document.querySelector('.ih-actions-bar').textContent, '3 anomalies restent à régler');
      openCell(KEY.fictif + '|prog');
      const select = inEl(KEY.fictif + '|prog');
      assertEqual(select.tagName, 'SELECT');
      assertDeepEqual(Array.from(select.options).map(o => o.value), ['', 'FARE', 'CTO Innovation', '__none'], 'les programmes de Grist, et « ne pas renseigner »');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      byId('ih-root').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assertFalse(!!inEl(KEY.fictif + '|prog'), 'Échap referme sans rien changer');
      assertTrue(cellEl(KEY.fictif + '|prog').classList.contains('c-bad'));
      fixCell(KEY.fictif + '|prog', 'FARE');
      assertTrue(cellEl(KEY.fictif + '|prog').classList.contains('c-add'));
      assertEqual(cellEl(KEY.fictif + '|prog').textContent.trim(), 'FARE');
      assertIncludes(document.querySelector('.ih-actions-bar').textContent, '2 anomalies restent à régler');
      assertEqual(writeCalls().length, 0, 'une correction n\'écrit rien dans Grist');
    });

    it('une date ou un texte se change au clavier ; une cellule orange propose de garder Grist ou de prendre l\'export', async function () {
      await setup();
      fixCell(KEY.fictif + '|end', '2030-06-30');
      assertEqual(cellEl(KEY.fictif + '|end').textContent.trim(), '30/06/2030');
      assertEqual(cellEl(KEY.fictif + '|stat').textContent.trim(), 'en cours', 'le statut suit la date de fin corrigée');
      fixCell(KEY.fictif + '|acr', 'FIC');
      assertEqual(cellEl(KEY.fictif + '|acr').textContent.trim(), 'FIC');
      openCell(KEY.alpha + '|name');
      assertDeepEqual(Array.from(inEl(KEY.alpha + '|name').options).map(o => o.textContent), ['Choisir…', 'Garder Grist : Projet Alpha', 'Prendre l\'export : Projet Alpha (export)']);
      pickIn(KEY.alpha + '|name', 'Projet Alpha (export)');
      assertTrue(cellEl(KEY.alpha + '|name').classList.contains('c-fill'), 'valeur de l\'export prise : cellule bleue');
      assertEqual(cellEl(KEY.alpha + '|name').textContent.trim(), 'Projet Alpha (export)');
      openCell(KEY.alpha + '|name'); pickIn(KEY.alpha + '|name', 'Projet Alpha');
      assertTrue(cellEl(KEY.alpha + '|name').classList.contains('c-same'), 'Grist gardé : plus d\'écart');
    });

    it('l\'éditeur de date est un champ jj/mm/aaaa : une saisie à moitié tapée ne change rien, une date complète tapée est prise', async function () {
      await setup();
      openCell(KEY.fictif + '|end');
      const editor = inEl(KEY.fictif + '|end');
      assertEqual(editor.type, 'text', 'plus de champ date natif');
      assertEqual(editor.placeholder, 'jj/mm/aaaa');
      editor.value = '30/06'; fire(editor, 'input'); fire(editor, 'change');
      assertTrue(!!inEl(KEY.fictif + '|end'), 'l\'éditeur reste ouvert sur une saisie incomplète');
      assertEqual(inEl(KEY.fictif + '|end').value, '30/06', 'ce qui est tapé n\'est pas effacé');
      editor.value = '30062030'; fire(editor, 'input'); fire(editor, 'change');
      assertEqual(cellEl(KEY.fictif + '|end').textContent.trim(), '30/06/2030', 'date complète : jour 30, mois 06');
    });

    it('la même valeur invalide sur plusieurs projets : la case « appliquer aux autres » règle tout, ou une seule cellule', async function () {
      const twin = (name, ope, id) => Object.assign({ id }, alpha, { Projet: name, N_OPE: ope, Programme: 'CTO Innov. 2024', Structure: 'LAB1' });
      await setup({ journal: [twin('Projet Un', 'N-1', 1), twin('Projet Deux', 'N-2', 2), twin('Projet Trois', 'N-3', 3)], projets: [], lignes: [] });
      assertEqual(document.querySelectorAll('.ih-t td.c-bad').length, 3);
      openCell('projet un|prog');
      assertIncludes(document.querySelector('.ih-all').textContent, 'Appliquer aussi aux 2 autres « CTO Innov. 2024 »');
      pickIn('projet un|prog', 'FARE');
      assertEqual(document.querySelectorAll('.ih-t td.c-bad').length, 0, 'les trois sont réglées');
      assertIncludes(document.querySelector('.ih-actions-bar').textContent, 'Prêt à écrire');
      await setup({ journal: [twin('Projet Un', 'N-1', 1), twin('Projet Deux', 'N-2', 2)], projets: [], lignes: [] });
      openCell('projet un|prog');
      assertIncludes(document.querySelector('.ih-all').textContent, 'Appliquer aussi à l\'autre « CTO Innov. 2024 »', 'au singulier quand il n\'y en a qu\'un');
      const box = document.querySelector('[data-ih-all]'); box.checked = false; fire(box, 'change');
      pickIn('projet un|prog', 'FARE');
      assertEqual(document.querySelectorAll('.ih-t td.c-bad').length, 1, 'case décochée : une seule cellule change');
    });

    it('« Prochaine anomalie » mène à la prochaine cellule rouge, et se grise quand il n\'y en a plus', async function () {
      await setup();
      assertFalse(byId('ih-next').disabled);
      click('ih-next');
      assertTrue(document.querySelectorAll('.ih-t .flash').length === 1, 'la cellule visée clignote');
      fixAll();
      assertTrue(byId('ih-next').disabled);
    });

    it('le statut d\'un projet : choisir un projet de Grist, en créer un, ou l\'écarter ; « Autre projet… » attend le choix', async function () {
      await setup();
      openCell(KEY.gamma + '|status');
      assertDeepEqual(Array.from(inEl(KEY.gamma + '|status').options).map(o => o.textContent.replace(/\s+/g, ' ')), ['Choisir…', '→ GAMMA (90 %)', 'Créer un nouveau projet', 'Autre projet…', 'Écarter ce projet', 'Retirer de la file d\'attente…']);
      pickIn(KEY.gamma + '|status', 'p:12');
      assertEqual(rowState('GAMMA - Projet Gamma financé'), 'mod', 'confirmé : le projet est complété');
      openCell(KEY.fictif + '|status');
      pickIn(KEY.fictif + '|status', 'other');
      assertEqual(rowState(FICTIF), 'tbd', 'en attente tant que le projet n\'est pas choisi');
      assertTrue(!!inEl(KEY.fictif + '|other'), 'la liste de tous les projets de Grist apparaît');
      pickIn(KEY.fictif + '|other', '12');
      assertEqual(rowState(FICTIF), 'mod', 'relié à GAMMA');
      assertIncludes(rowOfName(FICTIF).querySelector('.s1').textContent, 'trouvé par');
      openCell(KEY.fictif + '|status'); pickIn(KEY.fictif + '|status', 'skip');
      assertEqual(rowState(FICTIF), 'skip');
      assertFalse(!!rowOfName(FICTIF).querySelector('.c-bad'), 'un projet écarté n\'a plus d\'anomalie');
    });

    it('le bouton d\'écriture reste grisé tant qu\'il reste une anomalie, puis tant que le tableau n\'est pas relu ; rien n\'est écrit avant le clic', async function () {
      await setup();
      assertTrue(byId('ih-write').disabled); assertTrue(byId('ih-ack').disabled, 'la case « relu » attend la fin des anomalies');
      fixAll();
      assertFalse(byId('ih-ack').disabled); assertTrue(byId('ih-write').disabled);
      assertIncludes(document.querySelector('.ih-actions-bar').textContent, 'Prêt à écrire');
      byId('ih-ack').checked = true; fire(byId('ih-ack'), 'change');
      assertFalse(byId('ih-write').disabled);
      assertIncludes(byId('ih-write').textContent, 'Écrire 9 actions');
      assertEqual(writeCalls().length, 0, 'aucune écriture');
      openCell(KEY.fictif + '|prog'); pickIn(KEY.fictif + '|prog', 'FARE');
      assertFalse(byId('ih-ack').checked, 'une correction demande de relire');
      assertTrue(byId('ih-write').disabled);
    });

    it('un N° OPE partagé par deux projets dans l\'export (OPE RH) : les deux projets sont gardés, la ligne OPE est créée une seule fois', async function () {
      const shared = [Object.assign({ id: 1 }, alpha, { Projet: 'P1', N_OPE: 'B' }), Object.assign({ id: 2 }, alpha, { Projet: 'P2', N_OPE: 'B', Financeur: 'IDEX' })];
      await setup({ journal: shared });
      assertEqual(document.querySelectorAll('.ih-tr.is-skip').length, 0, 'aucun projet écarté');
      assertEqual(P().state.table.rows.length, 2);
      assertIncludes(document.querySelector('.ih-tr').textContent, 'partagée');
      const opes = P().state.table.plan.phase1.filter(op => op.table === 'Lignes_OPE' && op.kind === 'add');
      assertEqual(opes.length, 1, 'une seule ligne OPE pour les deux projets');
    });

    it('le contrôle des totaux s\'affiche sous le bandeau quand le détail des dépenses existe', async function () {
      await setup({ depenses: [{ Code_operation: 'FICTIF-0001', AE_consomme: 1, CP_consomme: 1 }] });
      assertIncludes(byId('ih-root').querySelector('[data-ih-box="totals"]').textContent, 'OPE en écart');
      assertEqual(byId('ih-root').querySelector('[data-ih-box="totals"]').open, true, 'ouvert d\'office quand il y a un écart');
    });
  });

  describe('Import historique — écriture, journal, annulation', function () {
    const GRIST_INITIAL = () => ({ projets: PROJETS.length, lignes: LIGNES.length });

    it('écrit seulement Projets, Lignes_OPE et le journal ; Ligne_OPE au format liste Grist ; les montants seulement dans les colonnes simples de l\'outil', async function () {
      await setup();
      await fixAndWrite();
      assertIncludes(document.querySelector('.ih-banner').textContent, 'Écrit');
      assertIncludes(document.querySelector('.ih-banner').textContent, '1 projet créé');
      const calls = writeCalls();
      assertEqual(calls.length, 9);
      assertTrue(calls.every(call => ['Projets', 'Lignes_OPE'].includes(call.table)), 'seulement les deux tables prévues');
      const projets = await grist('Projets'), lignes = await grist('Lignes_OPE');
      assertEqual(projets.length, GRIST_INITIAL().projets + 1);
      assertEqual(lignes.length, GRIST_INITIAL().lignes + 4);
      const created = projets.find(p => p.Projet === FICTIF);
      const ids = created.Ligne_OPE.slice(1).concat(created.Ligne_OPE_2.slice(1));
      assertEqual(created.Ligne_OPE[0], 'L');
      assertDeepEqual(ids.map(id => lignes.find(l => l.id === id).N_OPE).sort(), ['FICTIF-0001', 'FICTIF-0002']);
      assertEqual(created.Statut_operationnel_projet, L().STATUS_CLOSED);
      assertEqual(created.remplissage_automatique_Notifications, 0);
      assertEqual(projets.find(p => p.id === 14).Ligne_OPE.length, 2, 'DELTA : une ligne OPE de plus');
      assertEqual(projets.find(p => p.id === 10).Date_debut_Projet, UTC(2024, 1, 1));
      assertEqual(lignes.find(l => l.id === 1).installe_chez, 1, 'structure complétée sur la ligne OPE existante');
      assertEqual(lignes.find(l => l.id === 1).totalCPConsomme, 1200, 'totalCPConsomme reçoit le Consommé CP de l\'export (ici déjà identique : inchangé)');
      const keys = new Set(calls.flatMap(c => Object.keys(c.fields || {})));
      assertFalse(Array.from(keys).some(k => /^Total_|Statut_Macro|^c20\d\d_/.test(k)), 'jamais une colonne de total de Projets ni de budget');
      assertTrue(Array.from(keys).filter(k => /Attribue|Consomme|Disponible|Montant/.test(k)).every(k => L().AMOUNT_COLUMNS.some(col => col.id === k)), 'les montants vont seulement dans les colonnes simples créées par l\'outil');
    });

    it('les corrections faites dans le tableau sont ce qui est écrit : programme choisi, valeur de l\'export prise à la place de celle de Grist', async function () {
      await setup({ projets: [Object.assign({}, PROJETS[0], { Programme: 2 }), ...PROJETS.slice(1)] });
      fixCell(KEY.gamma + '|status', 'p:12');
      fixCell(KEY.fictif + '|prog', 'CTO Innovation');
      fixCell(KEY.delta + '|s|OPE-DEL-1', 'DIESE');
      fixCell(KEY.alpha + '|prog', 'FARE');
      await ackWrite();
      const projets = await grist('Projets'), lignes = await grist('Lignes_OPE'), journal = await grist('Import_Journal');
      assertEqual(projets.find(p => p.Projet === FICTIF).Programme, 2, 'programme choisi à l\'écran');
      assertEqual(lignes.find(l => l.N_OPE === 'OPE-DEL-1').installe_chez, 3, 'structure choisie à l\'écran');
      assertEqual(projets.find(p => p.id === 10).Programme, 1, 'la valeur de l\'export remplace celle de Grist, parce que l\'utilisateur l\'a demandé');
      const alphaJournal = journal.find(r => r.Table_modifiee === 'Projets' && r.Ligne === 10);
      assertEqual(JSON.parse(alphaJournal.Avant).Programme, 2, 'l\'ancienne valeur est au journal : le lot reste annulable');
    });

    it('à l\'ouverture, les lignes sans lot reçoivent un lot « Reprise unique » (une fois), sans rien écrire d\'autre', async function () {
      await setup();
      const lots = await grist('Import_Lots'), rows = await grist('Import_Financements');
      assertEqual(lots.length, 1);
      assertDeepEqual({ Type: lots[0].Type, Source: lots[0].Source, Statut: lots[0].Statut, Lignes: lots[0].Lignes }, { Type: 'Reprise unique', Source: 'Fichier', Statut: 'A valider', Lignes: 6 });
      assertTrue(rows.every(r => r.Lot === lots[0].Lot), 'toutes les lignes portent le lot');
      const mark = window.__TEST_CALLS__.length;
      await P().open();
      assertFalse(window.__TEST_CALLS__.slice(mark).some(call => call.table === 'Import_Lots' || (call.table === 'Import_Financements' && call.type === 'UpdateRecord')), 'rouvrir ne recrée rien');
      assertEqual((await grist('Import_Lots')).length, 1);
    });

    it('l\'écriture valide le lot : statut, photo du contrôle, lien vers le lot du journal ; l\'annulation le passe en Annule', async function () {
      await setup();
      assertEqual((await grist('Import_Lots'))[0].Statut, 'A valider');
      await fixAndWrite();
      const journalLot = (await grist('Import_Journal'))[0].Lot;
      let lot = (await grist('Import_Lots'))[0];
      assertEqual(lot.Statut, 'Valide'); assertEqual(lot.Lot_journal, journalLot);
      assertDeepEqual({ Ajoutees: lot.Ajoutees, Modifiees: lot.Modifiees, Inchangees: lot.Inchangees, Anomalies: lot.Anomalies, Absentes: lot.Absentes, Compare_a: lot.Compare_a }, { Ajoutees: 1, Modifiees: 3, Inchangees: 0, Anomalies: 0, Absentes: 0, Compare_a: '' });
      assertTrue(lot.Valide_le > 0, 'date de validation');
      document.querySelector('[data-ih-undo]').click();
      await waitFor(() => document.querySelector('[data-ih-undo-confirm]'), 'aperçu de l\'annulation');
      document.querySelector('[data-ih-undo-confirm]').click();
      await waitFor(() => /Lot annulé/.test(byId('ih-root').textContent), 'annulation faite');
      lot = (await grist('Import_Lots'))[0];
      assertEqual(lot.Statut, 'Annule'); assertEqual(lot.Note, 'Écritures annulées');
    });

    it('une écriture interrompue ne valide pas le lot', async function () {
      await setup();
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async function (actions) {
        if (actions.some(action => action[1] === 'Projets')) throw new Error('Grist refuse (test)');
        return original.call(this, actions);
      };
      try { await fixAndWrite(); } finally { window.grist.docApi.applyUserActions = original; }
      assertEqual((await grist('Import_Lots'))[0].Statut, 'A valider');
    });

    it('si le lot ne peut pas être marqué Valide, l\'écriture reste faite et la raison est donnée', async function () {
      await setup();
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async function (actions) {
        if (actions.some(action => action[1] === 'Import_Lots')) throw new Error('Import_Lots verrouillée (test)');
        return original.call(this, actions);
      };
      try { await fixAndWrite(); } finally { window.grist.docApi.applyUserActions = original; }
      assertIncludes(document.querySelector('.ih-banner').textContent, 'Écrit');
      assertIncludes(document.querySelector('.ih-banner').textContent, 'Import_Lots verrouillée (test)');
      assertEqual((await grist('Projets')).length, GRIST_INITIAL().projets + 1, 'les projets sont bien écrits');
    });

    it('le journal garde chaque écriture (avant / après) sous un même lot', async function () {
      await setup();
      await fixAndWrite();
      const journal = await grist('Import_Journal');
      assertEqual(journal.length, 9);
      assertEqual(new Set(journal.map(r => r.Lot)).size, 1);
      assertTrue(journal.every(r => r.Annule === false));
      const delta = journal.find(r => r.Table_modifiee === 'Projets' && r.Operation === 'modif' && r.Ligne === 14);
      assertDeepEqual(JSON.parse(delta.Avant).Ligne_OPE, ['L']);
      assertEqual(JSON.parse(delta.Apres).Ligne_OPE.length, 2);
      assertIncludes(byId('ih-root').querySelector('[data-ih-box="lots"]').textContent, 'Annuler ce lot');
    });

    it('relançable : une fois écrit, le tableau ne prévoit plus rien (aucun doublon), les corrections restent', async function () {
      await setup();
      await fixAndWrite();
      assertEqual(P().state.table.plan.actionCount, 0);
      assertEqual(P().state.table.plan.counts.projetsCrees, 0);
      assertEqual(P().state.table.plan.counts.dejaAJour, 4);
      assertEqual(P().state.table.left, 0, 'les corrections de l\'utilisateur sont gardées : pas de nouvelle anomalie');
      assertEqual(rowState(FICTIF), 'same', 'le projet créé est maintenant retrouvé par son N° OPE');
      assertIncludes(document.querySelector('.ih-actions-bar').textContent, 'Rien à écrire');
    });

    it('annuler un lot : remet les champs d\'avant, supprime ce qui a été créé, marque le journal', async function () {
      await setup();
      await fixAndWrite();
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
      await fixAndWrite();
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
        if (actions.some(action => action[1] === 'Projets' && /Record$/.test(action[0]))) throw new Error('Grist refuse (test)'); // la création des colonnes OPE 2 passe
        return original.call(this, actions);
      };
      try { await fixAndWrite(); } finally { window.grist.docApi.applyUserActions = original; }
      assertIncludes(document.querySelector('.ih-banner').textContent, 'Écriture interrompue');
      assertIncludes(document.querySelector('.ih-banner').textContent, 'Grist refuse (test)');
      assertIncludes(document.querySelector('.ih-banner').textContent, '5 écritures sont passées');
      const journal = await grist('Import_Journal');
      assertEqual(journal.length, 5, 'journal des écritures passées');
      assertEqual((await grist('Projets')).length, GRIST_INITIAL().projets);
      assertTrue(!!document.querySelector('[data-ih-undo]'), 'le lot est annulable');
    });

    it('relit Grist avant d\'écrire : un tableau qui date de plus de 10 minutes est relu, et l\'écriture demande une nouvelle relecture', async function () {
      await setup();
      fixAll();
      P().state.readAt = Date.now() - 11 * 60 * 1000;
      byId('ih-ack').checked = true; fire(byId('ih-ack'), 'change');
      click('ih-write');
      await waitFor(() => document.querySelector('.ih-banner.is-error'), 'refus');
      assertIncludes(document.querySelector('.ih-banner').textContent, 'plus de 10 minutes');
      assertEqual(writeCalls().length, 0);
      assertFalse(byId('ih-ack').checked, 'à relire de nouveau');
      assertEqual(P().state.table.left, 0, 'les corrections de l\'utilisateur survivent à la relecture');
    });
  });

  describe('Import historique — choisir le fichier Excel dans la page', function () {
    const xlsxFile = (key, name) => new File([Uint8Array.from(atob(window.__XLSX_FIXTURES__[key]), ch => ch.charCodeAt(0))], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const pick = file => { const input = byId('ih-file'); const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); };
    const emptySetup = () => setup({ journal: [] });

    it('lit le classeur dans le navigateur et montre ce qu\'il contient avant de rien écrire', async function () {
      await emptySetup();
      const mark = window.__TEST_CALLS__.length;
      pick(xlsxFile('bon', 'financements_test.xlsx'));
      await waitFor(() => byId('ih-upload-confirm'), 'aperçu du fichier');
      const preview = document.querySelector('.ih-upload').textContent;
      assertIncludes(preview, 'financements_test.xlsx'); assertIncludes(preview, 'feuille Reporting');
      assertIncludes(preview, '2 lignes'); assertIncludes(preview, '1 projet'); assertIncludes(preview, '2 N° OPE');
      assertIncludes(preview, '1 ligne sans N° OPE ignorée'); assertIncludes(preview, 'colonnes non utilisées : Commentaire');
      assertFalse(window.__TEST_CALLS__.slice(mark).some(call => call.type === 'AddRecord'), 'rien n\'est écrit à la lecture');
    });

    it('« Charger » ajoute les lignes à Import_Financements (types Grist, clé de ligne, même instant) et tient un lot annulable', async function () {
      await emptySetup();
      pick(xlsxFile('bon', 'financements_test.xlsx'));
      await waitFor(() => byId('ih-upload-confirm'), 'aperçu du fichier');
      click('ih-upload-confirm');
      await waitFor(() => /Fichier chargé/.test(byId('ih-root').textContent), 'résultat du chargement');
      const rows = await grist('Import_Financements');
      assertEqual(rows.length, 2);
      const first = rows.find(r => r.N_OPE === 'FICTIF-0001'), second = rows.find(r => r.N_OPE === 'FICTIF-0002');
      assertEqual(first.Projet, FICTIF); assertEqual(first.Date_debut, UTC(2023, 1, 1)); assertEqual(first.Date_fin, UTC(2025, 12, 31)); assertEqual(first.Part_du_projet, 0.6);
      assertEqual(first.Consomme_AE, 37500); assertEqual(first.N_decision, 'DEC-FICTIVE-001'); assertEqual(first.Etablissement, 'Établissement fictif');
      assertEqual(first.Cle_ligne, 'FICTIF-0001|InnovationS|' + LIGNE_BUDGET); assertEqual(second.Financeur, 'IDEX');
      assertTrue(first.Exporte_le > 0 && first.Exporte_le === second.Exporte_le, 'toutes les lignes du fichier portent le même instant');
      const journal = await grist('Import_Journal');
      const load = journal.find(r => r.Operation === 'chargement');
      assertTrue(!!load && /^CHARGEMENT-/.test(load.Lot), 'le chargement est journalisé');
      assertEqual(JSON.parse(load.Apres).fichier, 'financements_test.xlsx'); assertEqual(JSON.parse(load.Apres).exporte_le, first.Exporte_le);
      assertTrue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(first.Lot) && first.Lot === second.Lot, 'toutes les lignes du fichier portent le même Lot (date UTC)');
      const lots = await grist('Import_Lots');
      assertEqual(lots.length, 1);
      assertDeepEqual({ Lot: lots[0].Lot, Type: lots[0].Type, Source: lots[0].Source, Fichier: lots[0].Fichier, Lignes: lots[0].Lignes, Statut: lots[0].Statut }, { Lot: first.Lot, Type: 'Reprise unique', Source: 'Fichier', Fichier: 'financements_test.xlsx', Lignes: 2, Statut: 'A valider' });
      assertEqual(lots[0].Recu_le, first.Exporte_le);
      assertEqual(JSON.parse(load.Apres).lot, first.Lot, 'le journal du chargement retrouve son lot');
      assertIncludes(document.querySelector('.ih-banner').textContent, 'lot ' + first.Lot);
      // La page enchaîne sur le rapprochement du journal chargé.
      await waitFor(() => document.querySelectorAll('.ih-tr').length === 1, 'le projet du fichier est rapproché');
      assertEqual(rowState(FICTIF), 'add');
      assertTrue(!!byId('ih-pick'), '« Charger un autre fichier » reste proposé');
    });

    it('annuler le chargement retire ses lignes et ramène la page à l\'invitation de départ', async function () {
      await emptySetup();
      pick(xlsxFile('bon', 'financements_test.xlsx'));
      await waitFor(() => byId('ih-upload-confirm'), 'aperçu');
      click('ih-upload-confirm');
      await waitFor(() => document.querySelectorAll('.ih-tr').length === 1, 'journal chargé');
      const lot = (await grist('Import_Journal')).find(r => r.Operation === 'chargement').Lot;
      document.querySelector('[data-ih-box="lots"] summary').click();
      document.querySelector(`[data-ih-undo="${lot}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await waitFor(() => document.querySelector(`[data-ih-undo-confirm="${lot}"]`), 'demande de confirmation');
      assertIncludes(document.querySelector('.ih-undo').textContent, '2 lignes seront retirées');
      document.querySelector(`[data-ih-undo-confirm="${lot}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await waitFor(() => byId('ih-pick') && !document.querySelector('.ih-tr'), 'page revenue à l\'invitation');
      assertEqual((await grist('Import_Financements')).length, 0);
      assertTrue((await grist('Import_Journal')).find(r => r.Operation === 'chargement').Annule === true, 'le journal marque le chargement annulé');
      const lots = await grist('Import_Lots');
      assertEqual(lots.length, 1); assertEqual(lots[0].Statut, 'Annule'); assertEqual(lots[0].Note, 'Chargement annulé');
    });

    it('colonne absente : le fichier n\'est pas chargé et la colonne est nommée', async function () {
      await emptySetup();
      const mark = window.__TEST_CALLS__.length;
      pick(xlsxFile('sans_colonne', 'incomplet.xlsx'));
      await waitFor(() => document.querySelector('.ih-banner.is-error'), 'erreur affichée');
      assertIncludes(document.querySelector('.ih-banner').textContent, 'il manque 1 colonne');
      assertIncludes(document.querySelector('.ih-banner').textContent, 'Consommé AE');
      assertFalse(!!byId('ih-upload-confirm')); assertFalse(window.__TEST_CALLS__.slice(mark).some(call => call.type === 'AddRecord'));
    });

    it('valeur illisible : ligne et colonne sont dites, rien n\'est chargé', async function () {
      await emptySetup();
      pick(xlsxFile('illisible', 'abime.xlsx'));
      await waitFor(() => document.querySelector('.ih-banner.is-error'), 'erreur affichée');
      const text = document.querySelector('.ih-banner').textContent;
      assertIncludes(text, '2 valeurs illisibles'); assertIncludes(text, 'Ligne 2'); assertIncludes(text, 'Consommé AE'); assertIncludes(text, 'abc');
      assertFalse(!!byId('ih-upload-confirm'));
    });

    it('un fichier qui n\'est pas un classeur Excel : message clair', async function () {
      await emptySetup();
      pick(new File(['pas un classeur'], 'notes.xlsx'));
      await waitFor(() => document.querySelector('.ih-banner.is-error'), 'erreur affichée');
      assertIncludes(document.querySelector('.ih-banner').textContent, 'n\'est pas un classeur Excel');
    });

    it('si Grist refuse l\'ajout des lignes, l\'erreur est dite et le chargement vide n\'encombre pas la liste des lots actifs', async function () {
      await emptySetup();
      pick(xlsxFile('bon', 'financements_test.xlsx'));
      await waitFor(() => byId('ih-upload-confirm'), 'aperçu');
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async function (actions) {
        if (actions.some(action => action[0] === 'AddRecord' && action[1] === 'Import_Financements')) throw new Error('droits insuffisants');
        return original.apply(this, arguments);
      };
      try { click('ih-upload-confirm'); await waitFor(() => /Chargement impossible/.test(byId('ih-root').textContent), 'erreur de chargement'); } finally { window.grist.docApi.applyUserActions = original; }
      assertIncludes(byId('ih-root').textContent, 'droits insuffisants');
      assertEqual((await grist('Import_Financements')).length, 0);
      assertTrue((await grist('Import_Journal')).filter(r => r.Operation === 'chargement').every(r => r.Annule === true), 'le lot sans ligne est marqué annulé');
    });
  });
  // ===========================================================================================================
  describe('Import historique — brouillon de tri : les choix sont enregistrés tant que « Écrire » n\'a pas été cliqué (24/11/2026)', function () {
    const LS = 'suiviProjetInnovationS:importBrouillon';
    const draftRows = () => grist('Import_Brouillon');
    const draftWrites = () => window.__TEST_CALLS__.filter(call => call.table === 'Import_Brouillon' && ['AddRecord', 'UpdateRecord'].includes(call.type));
    // Un rechargement du widget : la mémoire repart de zéro, la copie locale du navigateur reste (ou non).
    async function reload(keepLocal = true) {
      const kept = localStorage.getItem(LS);
      P().resetState();
      if (keepLocal && kept != null) localStorage.setItem(LS, kept);
      await P().open();
    }

    it('un choix est enregistré dans Grist (une seule ligne de Import_Brouillon, mise à jour ensuite) sans rien écrire dans Projets ni Lignes_OPE', async function () {
      await setup();
      window.__TEST_CALLS__.length = 0;
      fixCell(KEY.fictif + '|prog', 'FARE');
      await P().flushDraft();
      let rows = await draftRows();
      assertEqual(rows.length, 1);
      assertEqual(rows[0].Nb_choix, 1);
      assertEqual(JSON.parse(rows[0].Contenu).edits[0][0], KEY.fictif + '|prog');
      fixCell(KEY.fictif + '|end', '2030-06-30');
      await P().flushDraft();
      rows = await draftRows();
      assertEqual(rows.length, 1, 'toujours une seule ligne');
      assertEqual(rows[0].Nb_choix, 2);
      assertEqual(writeCalls().length, 0, 'rien dans Projets ni Lignes_OPE');
    });

    it('après un rechargement, les choix sont retrouvés d\'après Grist (copie locale absente : autre navigateur) et signalés ; rien n\'est réécrit', async function () {
      await setup();
      fixCell(KEY.fictif + '|prog', 'FARE');
      fixCell(KEY.gamma + '|status', 'p:12');
      await P().flushDraft();
      localStorage.removeItem(LS);
      window.__TEST_CALLS__.length = 0;
      await reload(false);
      assertEqual(P().state.edits.get(KEY.fictif + '|prog'), 'FARE');
      assertEqual(P().state.decisions.get(KEY.gamma).projectId, 12);
      assertIncludes(document.querySelector('.ih-banner').textContent, 'Brouillon retrouvé');
      assertIncludes(byId('ih-root').textContent, '2 choix enregistrés automatiquement');
      assertEqual(draftWrites().length, 0, 'le brouillon retrouvé n\'est pas réécrit à l\'identique');
    });

    it('un envoi coupé avant d\'atteindre Grist : la copie locale, plus récente, fait foi', async function () {
      await setup();
      fixCell(KEY.fictif + '|prog', 'FARE');
      await P().flushDraft();
      fixCell(KEY.fictif + '|end', '2030-06-30');   // copie locale écrite aussitôt, Grist jamais atteinte (rechargement avant la pause)
      await reload(true);
      assertEqual(P().state.edits.get(KEY.fictif + '|end'), '2030-06-30');
      assertEqual(P().state.edits.get(KEY.fictif + '|prog'), 'FARE');
      await P().flushDraft();
      assertEqual((await draftRows())[0].Nb_choix, 2, 'Grist rattrape la copie locale');
    });

    it('sans aucun choix : rien n\'est enregistré, pas de bandeau « retrouvé », pas de compteur', async function () {
      await setup();
      await P().flushDraft();
      assertEqual((await draftRows()).length, 0);
      assertFalse(!!document.querySelector('.ih-banner'));
      assertFalse(byId('ih-root').textContent.includes('automatiquement'));
    });

    it('« Repartir de zéro » demande confirmation, puis oublie les choix partout (Grist et copie locale)', async function () {
      await setup();
      fixCell(KEY.fictif + '|prog', 'FARE');
      await P().flushDraft();
      click('ih-draft-clear');
      assertTrue(!!byId('ih-draft-clear-confirm'), 'la confirmation apparaît');
      assertEqual(P().state.edits.size, 1, 'rien n\'est encore oublié');
      click('ih-draft-clear-cancel');
      assertTrue(!!byId('ih-draft-clear') && !byId('ih-draft-clear-confirm'));
      click('ih-draft-clear'); click('ih-draft-clear-confirm');
      await waitFor(() => P().state.edits.size === 0 && !byId('ih-draft-clear-confirm'), 'choix oubliés');
      assertEqual((await draftRows())[0].Contenu, '');
      await reload(true);
      assertEqual(P().state.edits.size, 0, 'rien ne revient au rechargement');
      assertFalse(!!document.querySelector('.ih-banner'));
    });

    it('un brouillon illisible est ignoré (aucune erreur, le tableau s\'ouvre normalement)', async function () {
      await setup();
      window.__mockSetTable('Import_Brouillon', { id: [1], Contenu: ['{pas du json'], Nb_choix: [3], Modifie_le: [1] });
      localStorage.setItem(LS, 'n\'importe quoi');
      P().resetState(); localStorage.setItem(LS, 'n\'importe quoi');
      await P().open();
      assertEqual(P().state.phase, 'ready');
      assertEqual(P().state.edits.size, 0);
    });

    it('après l\'écriture, le brouillon suit la mémoire (Grist = ce qui reste de choix), sans réécrire quoi que ce soit dans Projets ni Lignes_OPE de plus', async function () {
      await setup();
      fixAll();
      await P().flushDraft();
      assertEqual((await draftRows())[0].Nb_choix, 3, 'les trois corrections sont en brouillon avant l\'écriture');
      await ackWrite();
      await P().flushDraft();
      const state = P().state;
      assertEqual((await draftRows())[0].Nb_choix, state.edits.size + state.decisions.size, 'le brouillon reflète la mémoire après l\'écriture');
      assertEqual((await draftRows()).length, 1);
    });
  });
})();
