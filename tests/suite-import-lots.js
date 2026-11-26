/**
 * Non-regression suite : envois du script UB Invest (« lots ») et montants écrits sur Lignes_OPE — 24/11/2026.
 * Règles pures : js/pages/import-lots-logic.js et, pour les montants, js/pages/import-historique-logic.js. Aucune donnée réelle : montants fictifs.
 *
 *  - un envoi (même `Lot`) est repéré à sa première vue (ligne Import_Lots « A valider ») ; l'essai est ignoré ; un envoi incomplet ne compte pas ;
 *  - un envoi refusé ou annulé ne compte plus pour le tableau de contrôle ;
 *  - un envoi se compare au dernier envoi validé : nouvelles, modifiées, disparues, inchangées ;
 *  - les montants d'un N° OPE : l'attribué s'additionne, le consommé et le disponible ne se comptent qu'une fois ;
 *  - les montants s'écrivent sur Lignes_OPE (colonnes créées par le widget), seulement ce qui change, et se défont avec le journal.
 */
(function () {
  'use strict';

  const L = () => window.ImportHistoriqueLogic;
  const K = () => window.ImportLotsLogic;
  const UTC = (y, m, d) => Date.UTC(y, m - 1, d) / 1000;
  const T1 = '2026-11-24T10:00:00Z', T2 = '2026-11-24T14:05:30Z', T3 = '2026-11-25T09:00:00Z';

  let nextId = 1;
  const row = (lot, ope, extra) => Object.assign({
    id: nextId++, Lot: lot, Programme: 'FARE', Projet: 'Projet fictif', Financeur: 'InnovationS', N_OPE: ope, Ligne_budgetaire: 'CRB1 / SO1',
    Date_debut: UTC(2023, 1, 1), Date_fin: UTC(2026, 12, 31), Montant_attribue: 1000, Consomme_AE: 400, Consomme_CP: 300, Disponible_AE: 600, Disponible_CP: 700
  }, extra);
  const sent = (lot, opes, extra) => { const rows = opes.map(ope => row(lot, ope, extra)); rows.forEach(r => { r.Lignes_du_lot = rows.length; }); return rows; };
  const lotRow = (id, lot, statut, extra) => Object.assign({ id, Lot: lot, Type: 'Macro', Source: 'Script', Statut: statut || 'A valider', Lignes: 0, Note: '' }, extra);

  // ===========================================================================================================
  describe('Envois du script — repérer les nouveaux envois', function () {
    it('lit la date d\'un lot : format UTC du widget, ancien format du script, sinon rien', function () {
      assertEqual(K().lotTime('2026-11-24T14:05:30Z'), Date.UTC(2026, 10, 24, 14, 5, 30) / 1000);
      assertEqual(K().lotTime('2026-11-24 14:05:30'), Date.UTC(2026, 10, 24, 14, 5, 30) / 1000);
      assertEqual(K().lotTime('CHARGEMENT-20261124'), null);
      assertEqual(K().lotTime(''), null);
    });

    it('un groupe par Lot : lignes reçues, lignes annoncées, envoi incomplet, essai ; les lignes sans Lot ne forment pas d\'envoi', function () {
      const rows = sent(T1, ['A', 'B', 'C']).slice(0, 2).concat(sent(T2, ['A']), sent('essai', ['A']), [row('', 'Z')]);
      const groups = K().lotGroups(rows);
      assertEqual(groups.size, 3);
      assertEqual(groups.get(T1).count, 2); assertEqual(groups.get(T1).expected, 3);
      assertTrue(groups.get(T1).incomplete); assertEqual(groups.get(T1).missing, 1);
      assertFalse(groups.get(T2).incomplete);
      assertTrue(groups.get('essai').trial);
    });

    it('un nouvel envoi crée une ligne Import_Lots « A valider » (Macro, Script) datée de son envoi ; un envoi connu n\'est pas recréé', function () {
      const rows = sent(T1, ['A', 'B']).concat(sent(T2, ['A', 'B', 'C']));
      const plan = K().planDiscovery(rows, [lotRow(1, T1, 'Valide', { Lignes: 2 })], Date.UTC(2026, 10, 24, 15));
      assertEqual(plan.actions.length, 1);
      assertEqual(plan.actions[0][0], 'AddRecord'); assertEqual(plan.actions[0][1], 'Import_Lots');
      const fields = plan.actions[0][3];
      assertEqual(fields.Lot, T2); assertEqual(fields.Type, 'Macro'); assertEqual(fields.Source, 'Script'); assertEqual(fields.Statut, 'A valider');
      assertEqual(fields.Lignes, 3); assertEqual(fields.Recu_le, K().lotTime(T2));
      assertDeepEqual(plan.created, [T2]);
    });

    it('l\'envoi d\'essai n\'est jamais proposé', function () {
      assertEqual(K().planDiscovery(sent('essai', ['A']).concat(sent('essai 2026-11-24 10:00:00', ['A'])), [], Date.now()).actions.length, 0);
    });

    it('un envoi encore à valider suit son avancement : le nombre de lignes et le motif d\'incomplétude sont mis à jour', function () {
      const half = sent(T2, ['A', 'B', 'C']).slice(0, 2);
      const first = K().planDiscovery(half, [], Date.now());
      assertEqual(first.actions[0][3].Lignes, 2);
      assertIncludes(first.actions[0][3].Note, 'incomplet');
      assertIncludes(first.actions[0][3].Note, '2 lignes reçues sur 3');
      const later = K().planDiscovery(sent(T2, ['A', 'B', 'C']), [lotRow(4, T2, 'A valider', { Lignes: 2, Note: first.actions[0][3].Note })], Date.now());
      assertDeepEqual(later.actions, [['UpdateRecord', 'Import_Lots', 4, { Lignes: 3, Note: '' }]]);
      assertDeepEqual(later.updated, [T2]);
    });

    it('un envoi validé n\'est pas touché, même si des lignes ont été supprimées depuis', function () {
      const rows = sent(T1, ['A', 'B', 'C']).slice(0, 2);
      assertEqual(K().planDiscovery(rows, [lotRow(1, T1, 'Valide', { Lignes: 3 })], Date.now()).actions.length, 0);
    });
  });

  // ===========================================================================================================
  describe('Envois du script — ce qui compte pour le tableau de contrôle', function () {
    it('un envoi refusé ou annulé, l\'essai et un envoi incomplet ne comptent pas ; les lignes sans Lot comptent', function () {
      const rows = sent(T1, ['A']).concat(sent(T2, ['A', 'B']), sent(T3, ['A', 'B', 'C']).slice(0, 2), sent('essai', ['A']), [row('', 'OLD')]);
      const lots = [lotRow(1, T1, 'Refuse'), lotRow(2, T2, 'A valider'), lotRow(3, T3, 'A valider')];
      const kept = K().activeRows(rows, lots);
      assertDeepEqual(kept.map(r => r.Lot), [T2, T2, '']);
    });

    it('un envoi validé reste compté même s\'il paraît incomplet (déjà écrit dans Grist)', function () {
      const rows = sent(T1, ['A', 'B', 'C']).slice(0, 2);
      assertEqual(K().activeRows(rows, [lotRow(1, T1, 'Valide')]).length, 2);
    });

    it('un envoi sans ligne Import_Lots (création échouée) compte comme « à valider »', function () {
      assertEqual(K().activeRows(sent(T1, ['A', 'B']), []).length, 2);
    });

    it('un envoi refusé fait revenir le tableau aux versions de l\'envoi d\'avant', function () {
      const rows = sent(T1, ['A'], { Consomme_CP: 100 }).concat(sent(T2, ['A'], { Consomme_CP: 999 }));
      const lots = [lotRow(1, T1, 'Valide'), lotRow(2, T2, 'Refuse')];
      const lines = L().latestVersions(K().activeRows(rows, lots)).lines;
      assertEqual(lines.length, 1); assertEqual(lines[0].Consomme_CP, 100);
    });

    it('refuser un envoi : seulement s\'il est à valider, avec le motif ; le rétablir le remet à valider', function () {
      const lots = [lotRow(1, T1, 'Valide'), lotRow(2, T2, 'A valider')];
      assertDeepEqual(K().planRefusal(lots, T1, 'non'), []);
      assertDeepEqual(K().planRefusal(lots, T2, 'doublon'), [['UpdateRecord', 'Import_Lots', 2, { Statut: 'Refuse', Note: 'doublon' }]]);
      assertDeepEqual(K().planRestore([lotRow(2, T2, 'Refuse')], T2), [['UpdateRecord', 'Import_Lots', 2, { Statut: 'A valider', Note: '' }]]);
    });
  });

  // ===========================================================================================================
  describe('Envois du script — comparer à l\'envoi validé', function () {
    it('nouvelles, modifiées (avant / après), disparues, inchangées', function () {
      const before = sent(T1, ['A', 'B', 'C', 'D']);
      const after = [row(T2, 'A'), row(T2, 'B', { Consomme_CP: 350 }), row(T2, 'C', { Statuts: 'Terminé' }), row(T2, 'E')];
      const diff = K().compareLots(after, before);
      assertEqual(diff.same, 1);
      assertDeepEqual(diff.added.map(l => l.ope), ['E']);
      assertDeepEqual(diff.gone.map(l => l.ope), ['D']);
      assertEqual(diff.changed.length, 2);
      const b = diff.changed.find(l => l.ope === 'B');
      assertDeepEqual(b.diffs.map(d => [d.id, d.before, d.after]), [['Consomme_CP', 300, 350]]);
    });

    it('un centime d\'écart n\'est pas une modification', function () {
      const diff = K().compareLots([row(T2, 'A', { Consomme_CP: 300.004 })], [row(T1, 'A')]);
      assertEqual(diff.changed.length, 0); assertEqual(diff.same, 1);
    });

    it('première réception : tout est nouveau', function () {
      const diff = K().compareLots(sent(T1, ['A', 'B']), []);
      assertEqual(diff.added.length, 2); assertEqual(diff.gone.length, 0);
    });

    it('la liste des envois : du plus récent au plus ancien, avec les écarts de chaque envoi à valider et la photo de ceux qui sont validés', function () {
      nextId = 1;
      const rows = sent(T1, ['A', 'B']).concat(sent(T2, ['A', 'B', 'C']), sent('essai', ['A']));
      rows.filter(r => r.Lot === T2 && r.N_OPE === 'B').forEach(r => { r.Consomme_CP = 310; });
      const lots = [lotRow(1, T1, 'Valide', { Lignes: 2, Ajoutees: 2, Modifiees: 0, Inchangees: 0 }), lotRow(2, T2, 'A valider', { Lignes: 3 })];
      const cards = K().lotCards(rows, lots);
      assertDeepEqual(cards.map(c => c.lot), [T2, T1]);
      assertDeepEqual(cards[0].diff, { added: 1, changed: 1, gone: 0, same: 1, first: false });
      assertEqual(cards[0].count, 3);
      assertEqual(cards[1].photo.added, 2);
      assertEqual(cards[1].diff, undefined);
    });

    it('sans envoi validé, un envoi à valider se présente comme première réception', function () {
      const cards = K().lotCards(sent(T1, ['A']), [lotRow(1, T1, 'A valider', { Lignes: 1 })]);
      assertTrue(cards[0].diff.first); assertEqual(cards[0].diff.added, 1);
    });

    it('un envoi incomplet ou refusé est signalé et n\'est pas comparé', function () {
      const half = sent(T2, ['A', 'B', 'C']).slice(0, 2);
      const cards = K().lotCards(half.concat(sent(T1, ['A'])), [lotRow(1, T1, 'Refuse'), lotRow(2, T2, 'A valider')]);
      assertIncludes(cards[0].excluded, 'incomplet'); assertEqual(cards[0].diff, undefined);
      assertEqual(cards[1].excluded, 'refusé');
    });
  });

  // ===========================================================================================================
  describe('Montants d\'un N° OPE — agrégation sans double compte', function () {
    it('l\'attribué s\'additionne d\'une ligne de financement à l\'autre ; le consommé et le disponible ne se comptent qu\'une fois', function () {
      nextId = 1;
      const lines = [row(T1, 'OPE-1', { Ligne_budgetaire: 'L1', Montant_attribue: 1000, Attribue_2024: 600, Attribue_2025: 400 }),
        row(T1, 'OPE-1', { Ligne_budgetaire: 'L2', Montant_attribue: 500, Attribue_2025: 500 })];
      const a = L().aggregateOpe(lines);
      assertEqual(a.Montant_attribue, 1500); assertEqual(a.Attribue_2024, 600); assertEqual(a.Attribue_2025, 900);
      assertEqual(a.totalCPConsomme, 300); assertEqual(a.Consomme_AE, 400); assertEqual(a.Disponible_CP, 700);
      assertFalse(a.conflict);
    });

    it('deux lignes qui ne donnent pas le même consommé : la version la plus récente fait foi, le désaccord est signalé', function () {
      nextId = 1;
      const a = L().aggregateOpe([row(T1, 'OPE-1', { Ligne_budgetaire: 'L1', Consomme_CP: 100 }), row(T2, 'OPE-1', { Ligne_budgetaire: 'L2', Consomme_CP: 250 })]);
      assertEqual(a.totalCPConsomme, 250); assertTrue(a.conflict);
    });

    it('une valeur absente de l\'export n\'est pas renvoyée (rien à écrire) ; 0 est une vraie valeur', function () {
      nextId = 1;
      const a = L().aggregateOpe([row(T1, 'OPE-1', { Consomme_CP: 0, Consomme_AE: null, Date_debut: null })]);
      assertEqual(a.totalCPConsomme, 0);
      assertFalse('Consomme_AE' in a);
    });

    it('« Données UB Invest au » vient de la date de l\'envoi ; ni financeur, ni ligne budgétaire, ni dates d\'OPE, ni identifiant d\'envoi ne sont écrits sur Lignes_OPE', function () {
      nextId = 1;
      const a = L().aggregateOpe([row(T2, 'OPE-1', { Date_debut: UTC(2024, 3, 1), Date_fin: UTC(2025, 6, 30) }), row(T2, 'OPE-1', { Ligne_budgetaire: 'L2', Date_debut: UTC(2023, 9, 1), Date_fin: UTC(2026, 1, 31) })]);
      assertEqual(a.Date_maj_conso, UTC(2026, 11, 24));
      ['Financeur', 'Ligne_budgetaire', 'Date_debut_OPE', 'Date_fin_OPE', 'Lot_maj', 'Consomme_CP'].forEach(id => assertFalse(id in a, id + ' ne doit pas être écrit'));
    });

    it('les colonnes de Lignes_OPE que l\'import écrit : 5 montants dont le Total CP consommé (colonne déjà là), 5 années, une date ; rien d\'autre', function () {
      assertDeepEqual(L().AMOUNT_COLUMNS.map(col => col.id), ['Montant_attribue', 'Attribue_2022', 'Attribue_2023', 'Attribue_2024', 'Attribue_2025', 'Attribue_2026',
        'Consomme_AE', 'totalCPConsomme', 'Disponible_AE', 'Disponible_CP', 'Date_maj_conso']);
      assertEqual(L().CP_COLUMN, 'totalCPConsomme');
    });
  });

  // ===========================================================================================================
  describe('Montants écrits sur Lignes_OPE', function () {
    const PROGRAMMES = [{ id: 1, Programme: 'FARE' }];
    const STRUCTURES = [{ id: 1, Acronyme: 'LAB1', Nom_Complet: 'Laboratoire fictif' }];
    const NOW = Date.UTC(2026, 10, 24);

    function plan({ journal, projets = [], lignes = [], withAmounts = true, hasColumn, isFormula }) {
      const lines = L().latestVersions(journal).lines, grouped = L().groupProjects(lines, L().checkLines(lines));
      const ctx = L().buildContext({ projets, lignes, programmes: PROGRAMMES, structures: STRUCTURES, withAmounts, hasColumn, isFormula });
      const matches = new Map(grouped.entries.map(entry => [entry.key, L().matchEntry(entry, ctx)]));
      return L().buildTable({ entries: grouped.entries, matches, decisions: new Map(), edits: new Map(), ctx, now: NOW }).plan;
    }
    const known = columns => (table, col) => table !== 'Lignes_OPE' || columns.includes(col) || col === 'N_OPE' || col === 'installe_chez';

    it('une ligne OPE créée par l\'import reçoit ses montants dès sa création, et le plan demande la création des colonnes', function () {
      nextId = 1;
      const p = plan({ journal: [row(T1, 'OPE-1', { Attribue_2025: 1000 })] });
      const add = p.phase1.find(op => op.table === 'Lignes_OPE' && op.kind === 'add');
      assertEqual(add.fields.N_OPE, 'OPE-1');
      assertEqual(add.fields.totalCPConsomme, 300); assertEqual(add.fields.Attribue_2025, 1000); assertEqual(add.fields.Montant_attribue, 1000);
      assertTrue('Date_maj_conso' in add.fields); assertFalse('Lot_maj' in add.fields);
      assertTrue(p.neededAmounts); assertEqual(p.counts.montantsEcrits, 1);
    });

    it('sans l\'option montants (comportement d\'avant), aucun montant n\'est écrit', function () {
      nextId = 1;
      const p = plan({ journal: [row(T1, 'OPE-1')], withAmounts: false });
      assertEqual(Object.keys(p.phase1[0].fields).filter(col => col.startsWith('Consomme')).length, 0);
      assertFalse(p.neededAmounts); assertEqual(p.counts.montantsEcrits, 0);
    });

    it('une ligne OPE de Grist ne reçoit que ce qui change, avec la valeur d\'avant pour pouvoir annuler', function () {
      nextId = 1;
      const lignes = [{ id: 5, N_OPE: 'OPE-1', installe_chez: 1, totalCPConsomme: 250, Consomme_AE: 400, Disponible_AE: 600, Disponible_CP: 700, Montant_attribue: 1000 }];
      const projets = [{ id: 10, Projet: 'Projet fictif', Acronyme: 'PF', Programme: 1, Ligne_OPE: ['L', 5] }];
      const p = plan({ journal: [row(T2, 'OPE-1')], projets, lignes });
      const update = p.phase1.find(op => op.table === 'Lignes_OPE' && op.id === 5);
      assertEqual(update.fields.totalCPConsomme, 300); assertEqual(update.before.totalCPConsomme, 250);
      assertFalse('Consomme_AE' in update.fields, 'une valeur identique n\'est pas réécrite');
      assertEqual(update.fields.Date_maj_conso, UTC(2026, 11, 24)); assertEqual(update.before.Date_maj_conso, null);
    });

    it('un deuxième envoi identique n\'écrit plus rien (ni date ni lot)', function () {
      nextId = 1;
      const a = L().aggregateOpe([row(T1, 'OPE-1')]);
      const lignes = [Object.assign({ id: 5, N_OPE: 'OPE-1', installe_chez: 1 }, a)];
      const projets = [{ id: 10, Projet: 'Projet fictif', Acronyme: 'PF', Programme: 1, Ligne_OPE: ['L', 5] }];
      const p = plan({ journal: [row(T2, 'OPE-1')], projets, lignes });
      assertEqual(p.phase1.filter(op => op.table === 'Lignes_OPE').length, 0);
      assertEqual(p.counts.montantsEcrits, 0); assertFalse(p.neededAmounts);
    });

    it('le rattachement de la structure et les montants d\'une même ligne partent dans une seule écriture', function () {
      nextId = 1;
      const lignes = [{ id: 5, N_OPE: 'OPE-1', installe_chez: 0 }];
      const projets = [{ id: 10, Projet: 'Projet fictif', Acronyme: 'PF', Programme: 1, Ligne_OPE: ['L', 5] }];
      const p = plan({ journal: [row(T1, 'OPE-1', { Structure: 'LAB1' })], projets, lignes });
      const ops = p.phase1.filter(op => op.table === 'Lignes_OPE' && op.id === 5);
      assertEqual(ops.length, 1);
      assertEqual(ops[0].fields.installe_chez, 1); assertEqual(ops[0].fields.totalCPConsomme, 300);
      assertEqual(ops[0].before.installe_chez, 0);
    });

    it('une colonne de montant qui est une formule dans Grist n\'est jamais écrite', function () {
      nextId = 1;
      const p = plan({ journal: [row(T1, 'OPE-1')], isFormula: (table, col) => table === 'Lignes_OPE' && col === 'totalCPConsomme' });
      const add = p.phase1.find(op => op.kind === 'add' && op.table === 'Lignes_OPE');
      assertFalse('totalCPConsomme' in add.fields); assertEqual(add.fields.Consomme_AE, 400);
    });

    it('un projet mis de côté ou à confirmer n\'écrit aucun montant', function () {
      nextId = 1;
      const lines = L().latestVersions([row(T1, 'OPE-1')]).lines, grouped = L().groupProjects(lines, []);
      const ctx = L().buildContext({ projets: [], lignes: [], programmes: PROGRAMMES, structures: STRUCTURES, withAmounts: true });
      const matches = new Map(grouped.entries.map(entry => [entry.key, L().matchEntry(entry, ctx)]));
      const decisions = new Map(grouped.entries.map(entry => [entry.key, { mode: 'skip' }]));
      const p = L().buildTable({ entries: grouped.entries, matches, decisions, edits: new Map(), ctx, now: NOW }).plan;
      assertEqual(p.phase1.length, 0); assertEqual(p.counts.montantsEcrits, 0);
    });

    it('la relecture des montants liste, par N° OPE, chaque valeur d\'avant et d\'après ; les colonnes de suivi n\'y figurent pas', function () {
      nextId = 1;
      const lignes = [{ id: 5, N_OPE: 'OPE-1', installe_chez: 1, totalCPConsomme: 250 }];
      const projets = [{ id: 10, Projet: 'Projet fictif', Acronyme: 'PF', Programme: 1, Ligne_OPE: ['L', 5] }];
      const changes = K().amountChanges(plan({ journal: [row(T2, 'OPE-1')], projets, lignes }));
      assertEqual(changes.length, 1); assertEqual(changes[0].ope, 'OPE-1');
      const cp = changes[0].changes.find(c => c.id === 'totalCPConsomme');
      assertEqual(cp.before, 250); assertEqual(cp.after, 300); assertEqual(cp.label, 'Total CP consommé');
      assertFalse(changes[0].changes.some(c => c.id === 'Date_maj_conso'));
    });

    it('écrire puis annuler : les montants reviennent à leur valeur d\'avant, et rien n\'est défait si la ligne a changé entre-temps', async function () {
      nextId = 1;
      const lignes = [{ id: 5, N_OPE: 'OPE-1', installe_chez: 1, totalCPConsomme: 250 }];
      const projets = [{ id: 10, Projet: 'Projet fictif', Acronyme: 'PF', Programme: 1, Ligne_OPE: ['L', 5], Date_debut_Projet: UTC(2023, 1, 1), Date_de_fin_Projet: UTC(2026, 12, 31) }];
      const p = plan({ journal: [row(T2, 'OPE-1')], projets, lignes });
      const written = [], journal = [];
      const result = await L().execute(p, { apply: async actions => { written.push(...actions); return actions.map((a, i) => 100 + i); }, addJournal: async rows => { journal.push(...rows); }, now: () => new Date(Date.UTC(2026, 10, 24, 15)) });
      assertEqual(result.error, null);
      const update = written.find(a => a[0] === 'UpdateRecord' && a[1] === 'Lignes_OPE');
      assertEqual(update[3].totalCPConsomme, 300);
      const now = Object.assign({}, lignes[0], update[3]);
      const undo = L().planUndo(journal.map((r, i) => Object.assign({ id: i + 1 }, r)), result.lot, { Projets: projets, Lignes_OPE: [now] });
      assertEqual(undo.skipped.length, 0, JSON.stringify(undo.skipped));
      const back = undo.actions.find(a => a[1] === 'Lignes_OPE');
      assertEqual(back[3].totalCPConsomme, 250); assertEqual(back[3].Date_maj_conso, null);
      const edited = L().planUndo(journal.map((r, i) => Object.assign({ id: i + 1 }, r)), result.lot, { Projets: projets, Lignes_OPE: [Object.assign({}, now, { totalCPConsomme: 777 })] });
      assertEqual(edited.actions.filter(a => a[1] === 'Lignes_OPE').length, 0, JSON.stringify(edited));
      assertEqual(edited.skipped[0].why, 'modifiée depuis l\'import');
    });
  });

  // ===========================================================================================================
  describe('Validation d\'un envoi du script', function () {
    it('l\'envoi du tableau passe en Valide avec la photo du contrôle (lignes disparues comprises) ; l\'envoi validé d\'avant passe en Remplace', function () {
      const lots = [lotRow(1, T1, 'Valide'), lotRow(2, T2, 'A valider')];
      const actions = L().planLotValidation(lots, { lots: [T2], counts: { add: 1, mod: 4, same: 90, gone: 2, left: 0 }, journalLot: 'LOT-X', now: Date.UTC(2026, 10, 24, 15) });
      assertDeepEqual(actions[0], ['UpdateRecord', 'Import_Lots', 1, { Statut: 'Remplace' }]);
      assertEqual(actions[1][3].Statut, 'Valide'); assertEqual(actions[1][3].Compare_a, T1); assertEqual(actions[1][3].Absentes, 2);
      assertEqual(actions[1][3].Modifiees, 4); assertEqual(actions[1][3].Lot_journal, 'LOT-X');
    });

    it('un envoi plus ancien encore à valider passe en Remplace : le plus récent le remplace avant relecture', function () {
      const lots = [lotRow(1, T1, 'A valider'), lotRow(2, T2, 'A valider'), lotRow(3, T3, 'A valider')];
      const actions = L().planLotValidation(lots, { lots: [T2], counts: {}, journalLot: 'LOT-X', now: Date.now() });
      const stale = actions.filter(a => a[3].Statut === 'Remplace');
      assertEqual(stale.length, 1); assertEqual(stale[0][2], 1);
      assertIncludes(stale[0][3].Note, T2);
      assertFalse(actions.some(a => a[2] === 3), 'un envoi plus récent que celui du tableau reste à valider');
    });
  });

  // ===========================================================================================================
  describe('File d\'attente de l\'import — vider d\'un coup ou retirer un projet (rien n\'est supprimé)', function () {
    const two = lot => {
      const rows = [row(lot, 'A-1'), row(lot, 'A-2'), row(lot, 'B-1', { Projet: 'Autre projet' })];
      rows.forEach(r => { r.Lignes_du_lot = rows.length; });
      return rows;
    };

    it('les lignes d\'un projet dans les envois à valider sont celles qu\'on peut retirer ; un envoi déjà validé ne fait pas partie de la file', function () {
      nextId = 1;
      const rows = two(T1).concat(two(T2));
      const lots = [lotRow(1, T1, 'Valide'), lotRow(2, T2, 'A valider')];
      assertEqual(K().pendingRowsOf(rows, lots, 'Projet fictif').length, 2, 'seulement celles de l\'envoi à valider');
      assertEqual(K().pendingRowsOf(rows, lots, 'PROJET  Fictif').length, 2, 'le nom se compare sans casse ni espaces en trop');
      assertDeepEqual(K().queueSummary(rows, lots), { lots: 1, rows: 3, projects: 2 });
    });

    it('retirer un projet : une écriture par ligne reçue (horodatage), l\'envoi ne devient pas « incomplet », les autres projets restent', function () {
      nextId = 1;
      const rows = two(T2), lots = [lotRow(1, T2, 'A valider')];
      const actions = K().planRemoveProject(rows, lots, 'Projet fictif', Date.UTC(2026, 10, 26, 10, 0, 0));
      assertEqual(actions.length, 2);
      actions.forEach(action => { assertEqual(action[0], 'UpdateRecord'); assertEqual(action[1], 'Import_Financements'); assertEqual(action[3].Retire_de_la_file, '2026-11-26T10:00:00.000Z'); });
      const after = rows.map(r => Object.assign({}, r, actions.some(a => a[2] === r.id) ? { Retire_de_la_file: actions[0][3].Retire_de_la_file } : {}));
      const active = K().activeRows(after, lots);
      assertDeepEqual(active.map(r => r.Projet), ['Autre projet'], 'l\'envoi reste complet (3 lignes reçues sur 3) : seul le projet retiré disparaît');
      assertDeepEqual(K().removedProjects(after, lots), ['Projet fictif']);
      const back = K().planRestoreRemoved(after, lots);
      assertEqual(back.length, 2); back.forEach(action => assertEqual(action[3].Retire_de_la_file, ''));
    });

    it('vider la file : seuls les envois à valider passent en Refuse, avec leur motif ; un envoi validé ou déjà refusé n\'est pas touché', function () {
      const lots = [lotRow(1, T1, 'Valide'), lotRow(2, T2, 'A valider'), lotRow(3, T3, 'A valider'), lotRow(4, '2026-11-20T10:00:00Z', 'Refuse')];
      const actions = K().planClearQueue(lots);
      assertDeepEqual(actions.map(a => a[2]), [2, 3]);
      actions.forEach(a => { assertEqual(a[1], 'Import_Lots'); assertEqual(a[3].Statut, 'Refuse'); assertIncludes(a[3].Note, 'File'); });
    });
  });

  // ===========================================================================================================
  describe('Envois du script — la page Import financier', function () {
    const P = () => window.ImportHistoriquePage;
    const byId = id => document.getElementById(id);
    const columnar = rows => {
      const keys = Array.from(new Set(rows.flatMap(r => Object.keys(r)).filter(k => k !== 'id')));
      const out = { id: rows.map(r => r.id) };
      keys.forEach(k => { out[k] = rows.map(r => (r[k] === undefined ? null : r[k])); });
      return out;
    };
    const click = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const grist = name => CoreGrist.getTable(name);

    // Un envoi du script pour le projet fictif : deux N° OPE, dont un déjà dans Grist.
    const sendRows = (lot, extra, announced) => {
      const rows = ['OPE-A', 'OPE-B'].map(ope => row(lot, ope, Object.assign({ Structure: 'LAB1' }, extra)));
      rows.forEach(r => { r.Lignes_du_lot = announced || rows.length; });
      return rows;
    };
    async function setup(rows, options = {}) {
      nextId = 1;
      window.__mockSetTable('Import_Financements', columnar(rows));
      window.__mockSetTable('Projets', columnar([{ id: 10, Acronyme: 'FICT', Projet: 'Projet fictif', Programme: 1, Ligne_OPE: ['L', 1], Date_debut_Projet: UTC(2023, 1, 1), Date_de_fin_Projet: UTC(2026, 12, 31) }]));
      window.__mockSetTable('Lignes_OPE', columnar([{ id: 1, N_OPE: 'OPE-A', installe_chez: 1, totalCPConsomme: 100 }]));   // totalCPConsomme existe déjà dans Grist
      window.__mockSetTable('Programmes', columnar([{ id: 1, Programme: 'FARE' }]));
      window.__mockSetTable('Structures', columnar([{ id: 1, Acronyme: 'LAB1', Nom_Complet: 'Laboratoire fictif' }]));
      if (options.lots) window.__mockSetTable('Import_Lots', columnar(options.lots));
      P().resetState();
      await P().open();
    }
    const writeBox = () => document.querySelector('[data-ih-box="envois"]');

    it('à l\'ouverture, un nouvel envoi du script est enregistré « A valider » (une seule fois) et rien n\'est écrit dans Projets ni Lignes_OPE', async function () {
      await setup(sendRows(T2));
      const lots = await grist('Import_Lots');
      assertEqual(lots.length, 1);
      assertEqual(lots[0].Lot, T2); assertEqual(lots[0].Statut, 'A valider'); assertEqual(lots[0].Type, 'Macro'); assertEqual(lots[0].Source, 'Script'); assertEqual(lots[0].Lignes, 2);
      assertTrue(writeBox().open, 'la liste des envois s\'ouvre quand un envoi est à relire');
      assertIncludes(writeBox().textContent, '1 envoi à relire');
      assertIncludes(writeBox().textContent, 'première réception');
      const mark = window.__TEST_CALLS__.length;
      await P().open();
      assertEqual((await grist('Import_Lots')).length, 1, 'rouvrir ne recrée pas l\'envoi');
      assertFalse(window.__TEST_CALLS__.slice(mark).some(call => call.table === 'Import_Lots' && call.type === 'AddRecord'));
      assertFalse(window.__TEST_CALLS__.some(call => ['Projets', 'Lignes_OPE'].includes(call.table) && ['AddRecord', 'UpdateRecord'].includes(call.type)));
    });

    it('un envoi incomplet est signalé et ne remplit pas le tableau ; relancé en entier, le nouvel envoi compte', async function () {
      await setup(sendRows(T1, {}, 5));
      assertIncludes(writeBox().textContent, 'incomplet');
      assertEqual(P().state.entries.length, 0, 'aucun projet tiré d\'un envoi à moitié reçu');
      const complete = sendRows(T1, {}, 5).concat(sendRows(T2));
      await setup(complete);
      assertEqual(P().state.entries.length, 1);
      assertIncludes(writeBox().textContent, 'incomplet');
    });

    it('l\'envoi d\'essai n\'apparaît pas et ne compte pas', async function () {
      await setup(sendRows('essai'));
      assertEqual((await grist('Import_Lots')).length, 0);
      assertEqual(P().state.entries.length, 0);
    });

    it('refuser un envoi : il ne compte plus, le motif est dit ; le rétablir le remet à valider', async function () {
      await setup(sendRows(T2));
      click(document.querySelector('[data-ih-refuse]'));
      await waitFor(() => document.querySelector('[data-ih-restore]'), 'envoi refusé');
      assertEqual((await grist('Import_Lots'))[0].Statut, 'Refuse');
      assertEqual(P().state.entries.length, 0, 'un envoi refusé ne compte plus');
      assertIncludes(document.querySelector('.ih-banner').textContent, 'refusé');
      click(document.querySelector('[data-ih-restore]'));
      await waitFor(() => document.querySelector('[data-ih-refuse]'), 'envoi rétabli');
      assertEqual((await grist('Import_Lots'))[0].Statut, 'A valider');
      assertEqual(P().state.entries.length, 1);
    });

    // Deux projets reçus dans le même envoi (4 lignes) : « Projet fictif » (OPE-A, OPE-B) et « Autre projet » (OPE-C, OPE-D).
    const twoProjects = lot => {
      const rows = ['OPE-A', 'OPE-B'].map(ope => row(lot, ope, { Structure: 'LAB1' })).concat(['OPE-C', 'OPE-D'].map(ope => row(lot, ope, { Projet: 'Autre projet', Structure: 'LAB1' })));
      rows.forEach(r => { r.Lignes_du_lot = rows.length; });
      return rows;
    };
    const flagged = async () => (await grist('Import_Financements')).filter(r => r.Retire_de_la_file).map(r => r.Projet);

    it('vider la file d\'attente : une confirmation d\'abord, puis les envois à valider sont refusés (rien n\'est supprimé) et le tableau se vide ; « Garder » n\'écrit rien', async function () {
      await setup(twoProjects(T2));
      click(byId('ih-queue-clear'));
      assertTrue(!!byId('ih-queue-clear-confirm'), 'la confirmation s\'affiche');
      assertIncludes(byId('ih-root').textContent, '1 envoi, 2 projets');
      assertEqual((await grist('Import_Lots'))[0].Statut, 'A valider', 'rien n\'a changé avant la confirmation');
      click(byId('ih-queue-clear-cancel'));
      assertTrue(!byId('ih-queue-clear-confirm'));
      assertEqual((await grist('Import_Lots'))[0].Statut, 'A valider');
      click(byId('ih-queue-clear')); click(byId('ih-queue-clear-confirm'));
      await waitFor(() => document.querySelector('[data-ih-restore]'), 'file vidée');
      const lot = (await grist('Import_Lots'))[0];
      assertEqual(lot.Statut, 'Refuse'); assertIncludes(lot.Note, 'File d\'attente vidée');
      assertEqual(P().state.entries.length, 0);
      assertEqual((await grist('Import_Financements')).length, 4, 'les lignes reçues restent au journal');
      assertIncludes(document.querySelector('.ih-banner').textContent, 'File d\'attente vidée');
      click(document.querySelector('[data-ih-restore]'));
      await waitFor(() => document.querySelector('[data-ih-refuse]'), 'envoi rétabli');
      assertEqual(P().state.entries.length, 2, 'rétablir remet tout');
    });

    it('retirer un projet de la file : choisi dans la cellule de statut, confirmé, les autres projets restent ; « Les remettre » le rétablit', async function () {
      await setup(twoProjects(T2));
      assertEqual(P().state.entries.length, 2);
      click(document.querySelector('[data-ih-cell="autre projet|status"]'));
      const select = document.querySelector('[data-ih-in="autre projet|status"]');
      assertTrue(Array.from(select.options).some(o => o.value === 'remove'), 'l\'option de retrait est proposée');
      select.value = 'remove'; fire(select, 'change');
      assertTrue(!!document.querySelector('[data-ih-remove-yes="autre projet"]'), 'la confirmation remplace la cellule');
      assertEqual((await flagged()).length, 0, 'rien n\'est retiré avant la confirmation');
      click(document.querySelector('[data-ih-remove-no]'));
      assertTrue(!document.querySelector('[data-ih-remove-yes]'));
      assertEqual((await flagged()).length, 0);
      click(document.querySelector('[data-ih-cell="autre projet|status"]'));
      const again = document.querySelector('[data-ih-in="autre projet|status"]'); again.value = 'remove'; fire(again, 'change');
      click(document.querySelector('[data-ih-remove-yes="autre projet"]'));
      await waitFor(() => document.querySelector('.ih-banner'), 'projet retiré');
      assertIncludes(document.querySelector('.ih-banner').textContent, 'retiré de la file d\'attente');
      assertDeepEqual(await flagged(), ['Autre projet', 'Autre projet'], 'ses deux lignes reçues portent le retrait, pas celles de l\'autre projet');
      assertDeepEqual(P().state.entries.map(e => e.name), ['Projet fictif'], 'l\'envoi reste complet : l\'autre projet est toujours là');
      assertEqual((await grist('Import_Financements')).length, 4, 'aucune ligne supprimée');
      click(byId('ih-queue-unremove'));
      await waitFor(() => P().state.entries.length === 2, 'projet remis');
      assertEqual((await flagged()).length, 0);
    });

    it('le retrait d\'un projet fait oublier ses choix de tri, pas ceux des autres', async function () {
      await setup(twoProjects(T2));
      P().state.decisions.set('autre projet', { mode: 'new', projectId: null });
      P().state.decisions.set('projet fictif', { mode: 'new', projectId: null });
      click(document.querySelector('[data-ih-cell="autre projet|status"]'));
      const select = document.querySelector('[data-ih-in="autre projet|status"]'); select.value = 'remove'; fire(select, 'change');
      click(document.querySelector('[data-ih-remove-yes="autre projet"]'));
      await waitFor(() => document.querySelector('.ih-banner'), 'projet retiré');
      assertFalse(P().state.decisions.has('autre projet'));
      assertTrue(P().state.decisions.has('projet fictif'));
    });

    it('écrire : les colonnes de montants de Lignes_OPE sont créées avant, les montants écrits sur les deux lignes OPE, l\'envoi passe en Valide', async function () {
      await setup(sendRows(T2, { Attribue_2025: 1000 }));
      assertEqual(P().state.table.left, 0, 'aucune anomalie');
      assertIncludes(byId('ih-root').textContent, 'Montants à écrire dans Lignes_OPE');
      window.__TEST_CALLS__.length = 0;
      const box = byId('ih-ack'); box.checked = true; fire(box, 'change');
      click(byId('ih-write'));
      await waitFor(() => document.querySelector('.ih-banner'), 'résultat de l\'écriture');
      assertIncludes(document.querySelector('.ih-banner').textContent, 'Écrit');
      assertIncludes(document.querySelector('.ih-banner').textContent, 'colonnes de montants créées dans Lignes_OPE');
      const added = window.__TEST_CALLS__.filter(call => call.type === 'AddColumn' && call.table === 'Lignes_OPE').map(call => call.colId);
      assertDeepEqual(added, ['Montant_attribue', 'Attribue_2022', 'Attribue_2023', 'Attribue_2024', 'Attribue_2025', 'Attribue_2026', 'Consomme_AE', 'Disponible_AE', 'Disponible_CP', 'Date_maj_conso'],
        'seules les colonnes manquantes sont créées (pas totalCPConsomme, déjà là) : ' + added.join(', '));
      const firstWrite = window.__TEST_CALLS__.findIndex(call => ['AddRecord', 'UpdateRecord'].includes(call.type) && call.table === 'Lignes_OPE');
      assertTrue(window.__TEST_CALLS__.findIndex(call => call.colId === 'Consomme_AE') < firstWrite, 'les colonnes existent avant la première écriture');
      const lignes = await grist('Lignes_OPE');
      assertEqual(lignes.length, 2);
      lignes.forEach(ligne => { assertEqual(ligne.totalCPConsomme, 300); assertEqual(ligne.Attribue_2025, 1000); assertEqual(ligne.Montant_attribue, 1000); });
      assertIncludes(byId('ih-root').textContent, 'Écrit');
      const lots = await grist('Import_Lots');
      assertEqual(lots[0].Statut, 'Valide'); assertTrue(!!lots[0].Lot_journal);
    });

    it('un deuxième envoi identique, après validation, n\'a rien à écrire ; un consommé qui bouge n\'écrit que cette valeur', async function () {
      await setup(sendRows(T2));
      const ack = () => { const box = byId('ih-ack'); box.checked = true; fire(box, 'change'); };
      ack(); click(byId('ih-write'));
      await waitFor(() => document.querySelector('.ih-banner'), 'résultat de l\'écriture');
      // Nouvel envoi du script, identique.
      const same = (await grist('Import_Financements')).map(r => Object.assign({}, r)).concat(sendRows(T3).map(r => Object.assign({ id: 100 + r.id }, r)));
      window.__mockSetTable('Import_Financements', columnar(same));
      CoreGrist.invalidateTable('Import_Financements');
      await P().open();
      const lots = await grist('Import_Lots');
      assertEqual(lots.length, 2); assertEqual(lots.find(l => l.Lot === T3).Statut, 'A valider');
      assertEqual(P().state.table.plan.actionCount, 0, 'rien à écrire : même montants');
      assertFalse(!!document.querySelector('[data-ih-box="montants"]'), 'aucun montant à relire');
      assertIncludes(writeBox().textContent, 'identique à l\'envoi validé');
    });
  });
})();
