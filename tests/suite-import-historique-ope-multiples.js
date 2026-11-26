/**
 * Non-regression suite : plusieurs OPE par projet dans l'outil d'import financier (js/pages/import-historique-logic.js + page) — 24/11/2026.
 *
 * Un projet porte jusqu'à quatre « rangs » OPE (Projets.Ligne_OPE, Ligne_OPE_2, _3, _4, listes de lignes de Lignes_OPE). L'import :
 *  - retrouve un projet par un N° OPE rangé dans n'importe quel rang (sinon il serait recréé en doublon) ;
 *  - range chaque N° OPE du projet de l'export dans un rang (ordre réglable : InnovationS d'abord, puis par date de début) ;
 *  - ne déplace jamais une ligne déjà rangée, n'écrase jamais un rang, remplit le premier rang libre, et verse le surplus (au-delà de 4)
 *    dans la liste du dernier rang ;
 *  - crée lui-même les colonnes des rangs 2 à 4 avant d'écrire (rien n'est écrit si leur création échoue) ;
 *  - annule proprement (une ligne encore rangée dans l'OPE 2 d'un autre projet n'est jamais supprimée).
 */
(function () {
  'use strict';

  const L = () => window.ImportHistoriqueLogic;
  const P = () => window.ImportHistoriquePage;
  const byId = id => document.getElementById(id);
  const UTC = (y, m, d) => Date.UTC(y, m - 1, d) / 1000;

  const columnar = (rows, columns) => {
    const out = { id: rows.map(row => row.id) };
    columns.forEach(col => { out[col] = rows.map(row => (row[col] === undefined ? null : row[col])); });
    return out;
  };
  const toTable = rows => columnar(rows, Array.from(new Set(rows.flatMap(row => Object.keys(row)).filter(key => key !== 'id'))));

  // Une ligne d'export : N° OPE, financeur, date de début (le reste est sans importance ici).
  const line = (ope, financeur, start, project = 'Projet Multi', extra = {}) => Object.assign({
    Programme: 'FARE', Projet: project, Financeur: financeur, Financeurs_du_projet: 'InnovationS', N_OPE: ope, Ligne_budgetaire: 'CRB / SO', Date_debut: start == null ? null : UTC(start, 1, 1),
    Date_fin: UTC(2027, 12, 31), Structure: 'LAB1'
  }, extra);
  const withIds = rows => rows.map((row, i) => Object.assign({ id: i + 1 }, row));

  const PROGRAMMES = [{ id: 1, Programme: 'FARE' }];
  const STRUCTURES = [{ id: 1, Acronyme: 'LAB1', Nom_Complet: 'Laboratoire fictif' }];
  const NOW = Date.UTC(2026, 10, 24);

  // Contexte + tableau pour un journal (lignes d'export) et l'état de Grist.
  function build({ journal, projets = [], lignes = [], rankMode, decisions, withAmounts }) {
    const lines = L().latestVersions(withIds(journal)).lines, grouped = L().groupProjects(lines, L().checkLines(lines));
    const ctx = L().buildContext({ projets, lignes, programmes: PROGRAMMES, structures: STRUCTURES, rankMode, withAmounts });
    const matches = new Map(grouped.entries.map(entry => [entry.key, L().matchEntry(entry, ctx)]));
    return { ctx, matches, entries: grouped.entries, table: L().buildTable({ entries: grouped.entries, matches, decisions: decisions || new Map(), edits: new Map(), ctx, now: NOW }) };
  }
  const addOf = (plan, table) => plan.phase1.concat(plan.phase2).filter(op => op.table === table && op.kind === 'add');
  const updateOf = (plan, table) => plan.phase1.concat(plan.phase2).filter(op => op.table === table && op.kind === 'update');
  const refCount = list => list.length - 1; // ['L', a, b] -> 2

  // ===========================================================================================================
  describe('Import OPE multiples — rangement des N° OPE d\'un projet (OPE 1 à 4)', function () {
    const opeOf = (key, financeur, start) => ({ key, ope: key, financeur, innovations: financeur === 'InnovationS', dateDebut: start == null ? null : UTC(start, 1, 1), lines: [] });
    const none = () => 0;

    it('« InnovationS d\'abord » : l\'OPE InnovationS prend l\'OPE 1, puis les autres par date de début', function () {
      const opes = [opeOf('IDEX1', 'IDEX', 2022), opeOf('INNO2', 'InnovationS', 2024), opeOf('INNO1', 'InnovationS', 2023)];
      const ranks = L().placeOpes(opes, none, 'innovations');
      assertEqual(ranks.get('INNO1'), 1); assertEqual(ranks.get('INNO2'), 2); assertEqual(ranks.get('IDEX1'), 3);
    });

    it('les trois cas d\'Antoine (24/11) : deux InnovationS dans deux structures différentes (le plus ancien est l\'OPE 1, la structure ne compte pas), InnovationS + IDEX, deux InnovationS dans la même structure', function () {
      const inStructure = (ope, structure) => Object.assign(ope, { structure });
      const deux = L().placeOpes([inStructure(opeOf('B-2024', 'InnovationS', 2024), 'DIESE'), inStructure(opeOf('A-2023', 'InnovationS', 2023), 'LAB1')], none, 'innovations');
      assertEqual(deux.get('A-2023'), 1); assertEqual(deux.get('B-2024'), 2);
      const memes = L().placeOpes([inStructure(opeOf('Z', 'InnovationS', 2024), 'LAB1'), inStructure(opeOf('Y', 'InnovationS', 2022), 'LAB1')], none, 'innovations');
      assertEqual(memes.get('Y'), 1); assertEqual(memes.get('Z'), 2);
      const mixte = L().placeOpes([opeOf('IDEX-ANCIEN', 'IDEX', 2021), opeOf('INNO-RECENT', 'InnovationS', 2025)], none, 'innovations');
      assertEqual(mixte.get('INNO-RECENT'), 1, 'InnovationS passe avant IDEX même si IDEX est plus ancien'); assertEqual(mixte.get('IDEX-ANCIEN'), 2);
    });

    it('« du plus ancien au plus récent » : par date de début, le financeur ne compte pas ; une date inconnue passe en dernier', function () {
      const opes = [opeOf('B', 'InnovationS', 2024), opeOf('A', 'IDEX', 2022), opeOf('C', 'IDEX', null)];
      const ranks = L().placeOpes(opes, none, 'date');
      assertEqual(ranks.get('A'), 1); assertEqual(ranks.get('B'), 2); assertEqual(ranks.get('C'), 3);
    });

    it('à égalité, le N° OPE départage (ordre naturel : OPE-2 avant OPE-10)', function () {
      const opes = [opeOf('OPE-10', 'InnovationS', 2023), opeOf('OPE-2', 'InnovationS', 2023)];
      const ranks = L().placeOpes(opes, none, 'innovations');
      assertEqual(ranks.get('OPE-2'), 1); assertEqual(ranks.get('OPE-10'), 2);
    });

    it('« tout dans OPE 1 » : comportement d\'avant les OPE multiples', function () {
      const ranks = L().placeOpes([opeOf('A', 'InnovationS', 2022), opeOf('B', 'IDEX', 2023)], none, 'single');
      assertEqual(ranks.get('A'), 1); assertEqual(ranks.get('B'), 1);
    });

    it('au-delà de quatre, le surplus rejoint la liste du dernier rang', function () {
      const opes = ['A', 'B', 'C', 'D', 'E', 'F'].map((key, i) => opeOf(key, 'InnovationS', 2020 + i));
      const ranks = L().placeOpes(opes, none, 'innovations');
      assertDeepEqual(opes.map(ope => ranks.get(ope.key)), [1, 2, 3, 4, 4, 4]);
    });

    it('une ligne déjà rangée garde son rang ; les nouvelles prennent le premier rang libre, sans toucher aux rangs occupés par d\'autres lignes', function () {
      const opes = [opeOf('OLD', 'InnovationS', 2020), opeOf('NEW1', 'InnovationS', 2023), opeOf('NEW2', 'IDEX', 2024)];
      // OLD est déjà en OPE 2 ; l'OPE 1 porte une ligne qui n'est pas dans l'export (occupied) : les nouvelles vont en 3 puis 4.
      const ranks = L().placeOpes(opes, ope => (ope.key === 'OLD' ? 2 : 0), 'innovations', [1, 2]);
      assertEqual(ranks.get('OLD'), 2); assertEqual(ranks.get('NEW1'), 3); assertEqual(ranks.get('NEW2'), 4);
    });
  });

  // ===========================================================================================================
  describe('Import OPE multiples — retrouver le projet par un N° OPE rangé dans n\'importe quel OPE', function () {
    const LIGNES = [{ id: 1, N_OPE: 'OPE-A', installe_chez: 1 }, { id: 2, N_OPE: 'OPE-B', installe_chez: 1 }, { id: 3, N_OPE: 'OPE-C', installe_chez: 0 }];

    it('un N° OPE rangé en OPE 2 retrouve son projet (rapprochement sûr, pas de doublon)', function () {
      const projets = [{ id: 10, Acronyme: 'MULTI', Projet: 'Projet Multi', Programme: 1, Ligne_OPE: ['L', 1], Ligne_OPE_2: ['L', 2] }];
      const { matches, entries } = build({ journal: [line('OPE-B', 'InnovationS', 2023, 'Un libellé tout autre')], projets, lignes: LIGNES });
      const match = matches.get(entries[0].key);
      assertEqual(match.status, 'sure'); assertEqual(match.rung, 1); assertEqual(match.projectId, 10);
    });

    it('un projet dont les N° OPE sont dans des rangs différents est retrouvé sans conflit (c\'est le même projet)', function () {
      const projets = [{ id: 10, Acronyme: 'MULTI', Projet: 'Projet Multi', Programme: 1, Ligne_OPE: ['L', 1], Ligne_OPE_3: ['L', 2] }];
      const { matches, entries } = build({ journal: [line('OPE-A', 'InnovationS', 2023), line('OPE-B', 'IDEX', 2023)], projets, lignes: LIGNES });
      const match = matches.get(entries[0].key);
      assertEqual(match.status, 'sure'); assertEqual(match.projectId, 10);
    });

    it('deux projets de Grist qui se partagent les N° OPE d\'un même projet de l\'export : conflit (rien n\'est deviné)', function () {
      const projets = [{ id: 10, Acronyme: 'P1', Projet: 'P1', Ligne_OPE: ['L', 1] }, { id: 11, Acronyme: 'P2', Projet: 'P2', Ligne_OPE: ['L'], Ligne_OPE_2: ['L', 2] }];
      const { matches, entries } = build({ journal: [line('OPE-A', 'InnovationS', 2023), line('OPE-B', 'IDEX', 2023)], projets, lignes: LIGNES });
      assertEqual(matches.get(entries[0].key).status, 'conflict');
    });
  });

  // ===========================================================================================================
  describe('Import OPE multiples — ce qui est écrit : chaque N° OPE dans son rang', function () {
    const journal = [line('OPE-1', 'IDEX', 2022), line('OPE-2', 'InnovationS', 2024), line('OPE-3', 'InnovationS', 2023)];

    it('un projet créé : InnovationS par date en OPE 1 et 2, IDEX en OPE 3, une liste par colonne de rang', function () {
      const { table } = build({ journal });
      assertEqual(table.rows[0].state, 'add');
      assertDeepEqual(table.rows[0].lines.map(l => [l.ope, l.rank, l.column]), [['OPE-1', 3, 'Ligne_OPE_3'], ['OPE-2', 2, 'Ligne_OPE_2'], ['OPE-3', 1, 'Ligne_OPE']]);
      const projet = addOf(table.plan, 'Projets')[0].fields;
      assertEqual(refCount(projet.Ligne_OPE), 1); assertEqual(refCount(projet.Ligne_OPE_2), 1); assertEqual(refCount(projet.Ligne_OPE_3), 1);
      assertFalse('Ligne_OPE_4' in projet, 'aucun rang 4 sans quatrième OPE');
      assertEqual(table.plan.neededRank, 3, 'les colonnes des OPE 2 et 3 seront à créer avant l\'écriture');
      assertEqual(addOf(table.plan, 'Lignes_OPE').length, 3);
    });

    it('chaque ligne OPE créée est rangée sous la référence temporaire qui lui correspond (la bonne OPE dans le bon rang)', function () {
      const { table } = build({ journal });
      const projet = addOf(table.plan, 'Projets')[0].fields;
      assertEqual(projet.Ligne_OPE[1].tmp, 'ope:OPE-3', 'OPE-3 (InnovationS, 2023) est l\'OPE 1');
      assertEqual(projet.Ligne_OPE_2[1].tmp, 'ope:OPE-2');
      assertEqual(projet.Ligne_OPE_3[1].tmp, 'ope:OPE-1');
    });

    it('un seul N° OPE : rien à créer au-delà du rang 1 (neededRank = 1, aucune colonne de rang écrite)', function () {
      const { table } = build({ journal: [line('OPE-1', 'InnovationS', 2023)] });
      assertEqual(table.plan.neededRank, 1);
      const projet = addOf(table.plan, 'Projets')[0].fields;
      assertEqual(refCount(projet.Ligne_OPE), 1);
      assertFalse(Object.keys(projet).some(key => /^Ligne_OPE_\d$/.test(key)));
    });

    it('mode « tout dans OPE 1 » : une seule liste, comme avant', function () {
      const { table } = build({ journal, rankMode: 'single' });
      const projet = addOf(table.plan, 'Projets')[0].fields;
      assertEqual(refCount(projet.Ligne_OPE), 3);
      assertEqual(table.plan.neededRank, 1);
    });

    it('six N° OPE : quatre rangs, le surplus dans la liste du rang 4', function () {
      const six = ['A', 'B', 'C', 'D', 'E', 'F'].map((ope, i) => line('OPE-' + ope, 'InnovationS', 2020 + i));
      const { table } = build({ journal: six });
      const projet = addOf(table.plan, 'Projets')[0].fields;
      assertDeepEqual([projet.Ligne_OPE, projet.Ligne_OPE_2, projet.Ligne_OPE_3, projet.Ligne_OPE_4].map(refCount), [1, 1, 1, 3]);
      assertEqual(table.plan.neededRank, 4);
    });

    it('un projet existant : la nouvelle ligne prend le premier rang libre, le rang déjà rempli n\'est pas touché', function () {
      const projets = [{ id: 10, Acronyme: 'MULTI', Projet: 'Projet Multi', Programme: 1, Ligne_OPE: ['L', 1], Date_debut_Projet: UTC(2023, 1, 1), Date_de_fin_Projet: UTC(2027, 12, 31), Statut_operationnel_projet: 'en cours' }];
      const lignes = [{ id: 1, N_OPE: 'OPE-A', installe_chez: 1 }];
      const { table } = build({ journal: [line('OPE-A', 'InnovationS', 2023), line('OPE-B', 'IDEX', 2022)], projets, lignes });
      assertEqual(table.rows[0].state, 'mod');
      assertDeepEqual(table.rows[0].lines.map(l => [l.ope, l.rank]), [['OPE-A', 1], ['OPE-B', 2]]);
      const op = updateOf(table.plan, 'Projets')[0];
      assertDeepEqual(Object.keys(op.fields), ['Ligne_OPE_2'], 'seul le rang 2 est écrit : le rang 1 n\'est pas touché');
      assertEqual(op.fields.Ligne_OPE_2[1].tmp, 'ope:OPE-B');
      assertDeepEqual(op.before, { Ligne_OPE_2: ['L'] }, 'avant : un rang vide (la colonne est créée juste avant)');
      assertEqual(table.plan.neededRank, 2);
    });

    it('un projet existant dont l\'OPE 2 existe déjà : on ajoute à la liste du rang, sans retirer ce qui y est', function () {
      const projets = [{ id: 10, Acronyme: 'MULTI', Projet: 'Projet Multi', Programme: 1, Ligne_OPE: ['L', 1], Ligne_OPE_2: ['L', 2], Date_debut_Projet: UTC(2023, 1, 1), Date_de_fin_Projet: UTC(2027, 12, 31), Statut_operationnel_projet: 'en cours' }];
      const lignes = [{ id: 1, N_OPE: 'OPE-A', installe_chez: 1 }, { id: 2, N_OPE: 'OPE-B', installe_chez: 1 }];
      const { table } = build({ journal: [line('OPE-A', 'InnovationS', 2023), line('OPE-B', 'IDEX', 2022)], projets, lignes });
      assertEqual(table.rows[0].state, 'same', 'les deux N° OPE sont déjà dans le projet, chacun dans son rang : rien à écrire');
      assertEqual(table.plan.actionCount, 0);
      assertDeepEqual(table.rows[0].lines.map(l => [l.ope, l.rank]), [['OPE-A', 1], ['OPE-B', 2]], 'chaque ligne garde son rang de Grist, même contre l\'ordre « InnovationS d\'abord »');
    });

    it('les quatre rangs pleins : la ligne en plus rejoint la liste du rang 4', function () {
      const projets = [{ id: 10, Acronyme: 'MULTI', Projet: 'Projet Multi', Programme: 1, Ligne_OPE: ['L', 1], Ligne_OPE_2: ['L', 2], Ligne_OPE_3: ['L', 3], Ligne_OPE_4: ['L', 4], Date_debut_Projet: UTC(2023, 1, 1), Date_de_fin_Projet: UTC(2027, 12, 31), Statut_operationnel_projet: 'en cours' }];
      const lignes = [1, 2, 3, 4].map(id => ({ id, N_OPE: 'OPE-' + id, installe_chez: 1 }));
      const { table } = build({ journal: [line('OPE-1', 'InnovationS', 2023), line('OPE-9', 'IDEX', 2024)], projets, lignes });
      const op = updateOf(table.plan, 'Projets')[0];
      assertDeepEqual(Object.keys(op.fields), ['Ligne_OPE_4']);
      assertEqual(op.fields.Ligne_OPE_4[1], 4, 'la liste du rang 4 est conservée');
      assertEqual(op.fields.Ligne_OPE_4[2].tmp, 'ope:OPE-9');
    });
  });

  // ===========================================================================================================
  describe('Import OPE multiples — annuler un lot qui a rangé des lignes dans les OPE 2 à 4', function () {
    const journalRow = (id, table, line, operation, after, before) => ({ id, Lot: 'LOT-1', Annule: false, Table_modifiee: table, Ligne: line, Operation: operation, Apres: JSON.stringify(after), Avant: JSON.stringify(before || null) });

    it('rend le rang 2 à son état d\'avant et supprime la ligne OPE ajoutée', function () {
      const projets = [{ id: 10, Ligne_OPE: ['L', 1], Ligne_OPE_2: ['L', 5] }];
      const rows = [journalRow(1, 'Lignes_OPE', 5, 'ajout', { N_OPE: 'OPE-B', installe_chez: 1 }), journalRow(2, 'Projets', 10, 'modif', { Ligne_OPE_2: ['L', 5] }, { Ligne_OPE_2: ['L'] })];
      const tables = { Projets: projets, Lignes_OPE: [{ id: 1, N_OPE: 'OPE-A' }, { id: 5, N_OPE: 'OPE-B', installe_chez: 1 }] };
      const plan = L().planUndo(rows, 'LOT-1', tables);
      assertEqual(plan.skipped.length, 0);
      assertDeepEqual(plan.actions, [['UpdateRecord', 'Projets', 10, { Ligne_OPE_2: ['L'] }], ['RemoveRecord', 'Lignes_OPE', 5]]);
    });

    it('une ligne OPE créée par le lot qu\'un AUTRE projet range maintenant en OPE 2 n\'est pas supprimée', function () {
      const projets = [{ id: 10, Ligne_OPE: ['L', 1], Ligne_OPE_2: ['L', 5] }, { id: 11, Ligne_OPE: ['L'], Ligne_OPE_2: ['L', 5] }];
      const rows = [journalRow(1, 'Lignes_OPE', 5, 'ajout', { N_OPE: 'OPE-B' }), journalRow(2, 'Projets', 10, 'modif', { Ligne_OPE_2: ['L', 5] }, { Ligne_OPE_2: ['L'] })];
      const plan = L().planUndo(rows, 'LOT-1', { Projets: projets, Lignes_OPE: [{ id: 5, N_OPE: 'OPE-B' }] });
      assertEqual(plan.skipped.length, 1);
      assertEqual(plan.skipped[0].why, 'encore utilisée par un projet');
      assertFalse(plan.actions.some(action => action[0] === 'RemoveRecord'));
    });
  });

  // ===========================================================================================================
  describe('Import OPE multiples — la page : colonnes des OPE 2 à 4 créées avant d\'écrire', function () {
    const JOURNAL = withIds([line('OPE-1', 'InnovationS', 2023), line('OPE-2', 'IDEX', 2022)]);
    async function setup() {
      window.__mockSetTable('Import_Financements', toTable(JOURNAL));
      window.__mockSetTable('Projets', toTable([{ id: 10, Acronyme: 'ALPHA', Projet: 'Projet Alpha', Programme: 1, Ligne_OPE: ['L'] }]));
      window.__mockSetTable('Lignes_OPE', toTable([{ id: 1, N_OPE: 'OTHER', installe_chez: 0 }]));
      window.__mockSetTable('Programmes', toTable(PROGRAMMES));
      window.__mockSetTable('Structures', toTable(STRUCTURES));
      P().resetState();
      await P().open();
    }
    const click = id => byId(id).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const ack = () => { const box = byId('ih-ack'); box.checked = true; fire(box, 'change'); };

    it('le tableau montre le rang de chaque ligne OPE d\'un projet à plusieurs OPE', async function () {
      await setup();
      const text = document.querySelector('.ih-tr').textContent;
      assertIncludes(text, 'OPE 1'); assertIncludes(text, 'OPE 2');
    });

    it('écrire : les colonnes Ligne_OPE_2 sont créées (liste de lignes OPE) puis le projet est écrit avec ses deux rangs', async function () {
      await setup();
      assertEqual(P().state.table.left, 0, 'aucune anomalie : programme et structure connus');
      window.__TEST_CALLS__.length = 0;
      ack(); click('ih-write');
      await waitFor(() => document.querySelector('.ih-banner'), 'résultat de l\'écriture');
      assertIncludes(document.querySelector('.ih-banner').textContent, 'Écrit');
      const added = window.__TEST_CALLS__.filter(call => call.type === 'AddColumn' && call.table === 'Projets').map(call => call.colId);
      assertTrue(added.includes('Ligne_OPE_2'), 'Ligne_OPE_2 créée');
      assertTrue(!added.includes('Ligne_OPE_3'), 'pas de rang 3 sans troisième OPE');
      assertEqual(window.__TEST_CALLS__.find(call => call.colId === 'Ligne_OPE_2').colInfo.type, 'RefList:Lignes_OPE');
      const firstWrite = window.__TEST_CALLS__.findIndex(call => call.type === 'AddRecord' && call.table === 'Lignes_OPE');
      assertTrue(window.__TEST_CALLS__.findIndex(call => call.colId === 'Ligne_OPE_2') < firstWrite, 'les colonnes existent avant la première écriture');
      const projets = await CoreGrist.getTable('Projets'), created = projets.find(p => p.Projet === 'Projet Multi');
      assertEqual(refCount(created.Ligne_OPE), 1); assertEqual(refCount(created.Ligne_OPE_2), 1);
      assertIncludes(document.querySelector('.ih-banner').textContent, '16 colonnes créées dans Projets pour l\'OPE 2');
    });

    // 26/11/2026 : les totaux de Projets (formules Grist) additionnent les OPE 2 à 4 (js/core/ope-totals.js), comme à l'enregistrement d'une fiche.
    it('écrire : les formules de totaux de Projets sont adaptées aux OPE 2 à 4 après la création des colonnes et avant la première écriture', async function () {
      await setup();
      await window.TestOpeTotals.installMeta(1);
      window.__TEST_CALLS__.length = 0;
      ack(); click('ih-write');
      await waitFor(() => document.querySelector('.ih-banner'), 'résultat de l\'écriture');
      assertIncludes(document.querySelector('.ih-banner').textContent, 'Écrit');
      const types = window.__TEST_CALLS__.map(call => call.type + ':' + call.table);
      const modifies = window.__TEST_CALLS__.filter(call => call.type === 'ModifyColumn' && call.table === 'Projets');
      assertEqual(modifies.length, 8, 'les huit formules de totaux');
      assertTrue(window.__TEST_CALLS__.map(call => call.type).lastIndexOf('AddColumn') < types.findIndex(type => type === 'ModifyColumn:Projets'), 'les colonnes de l\'OPE 2 existent avant');
      assertTrue(types.findIndex(type => type === 'ModifyColumn:Projets') < types.findIndex(type => type === 'AddRecord:Lignes_OPE'), 'les totaux sont adaptés avant la première écriture');
      assertIncludes(await window.TestOpeTotals.formulaOf('Total_2026'), '(rec.c2026_M10_Fonctionnement_2 or 0)');
    });

    it('écrire : si Grist refuse de modifier les formules de totaux, l\'import est quand même écrit', async function () {
      await setup();
      await window.TestOpeTotals.installMeta(1);
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async function (actions) {
        if (actions.some(action => action[0] === 'ModifyColumn')) throw new Error('Grist refuse (test)');
        return original.call(this, actions);
      };
      window.__TEST_CALLS__.length = 0;
      try { ack(); click('ih-write'); await waitFor(() => document.querySelector('.ih-banner'), 'résultat de l\'écriture'); }
      finally { window.grist.docApi.applyUserActions = original; }
      assertIncludes(document.querySelector('.ih-banner').textContent, 'Écrit');
      assertEqual(window.__TEST_CALLS__.filter(call => call.type === 'ModifyColumn').length, 0);
      assertTrue(window.__TEST_CALLS__.some(call => call.type === 'AddRecord' && call.table === 'Lignes_OPE'), 'les lignes OPE sont bien écrites');
    });

    it('si la création des colonnes échoue, rien n\'est écrit et la raison est dite', async function () {
      await setup();
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async function (actions) {
        if (actions.some(action => action[0] === 'AddColumn' && action[1] === 'Projets')) throw new Error('Grist refuse (test)');
        return original.call(this, actions);
      };
      window.__TEST_CALLS__.length = 0;
      try { ack(); click('ih-write'); await waitFor(() => document.querySelector('.ih-banner'), 'résultat de l\'écriture'); }
      finally { window.grist.docApi.applyUserActions = original; }
      const banner = document.querySelector('.ih-banner').textContent;
      assertIncludes(banner, 'de l\'OPE 2'); assertIncludes(banner, 'Rien n\'a été écrit');
      assertEqual(window.__TEST_CALLS__.filter(call => ['AddRecord', 'UpdateRecord'].includes(call.type) && ['Projets', 'Lignes_OPE'].includes(call.table)).length, 0);
    });
  });
  // ===========================================================================================================
  describe('Import — une OPE partagée par plusieurs projets (OPE RH) : chaque projet garde sa ligne', function () {
    // Antoine (26/11) : une OPE RH sert à de nombreux projets (projets d'ingénierie) pendant tout le programme. Avant, la clé d'une ligne n'avait pas
    // le projet : trois projets sur la même OPE (même financeur, même ligne budgétaire) ne laissaient qu'une ligne, la dernière lue.
    const rh = (project, amount, extra = {}) => line('OPE-RH', 'InnovationS', 2022, project, Object.assign({ Montant_attribue: amount, Consomme_AE: 50, Consomme_CP: 40, Disponible_AE: 10, Disponible_CP: 20 }, extra));
    const THREE = () => withIds([rh('Encadrement doctoral', 100), rh('Plateforme de calcul', 200), rh('Veille réglementaire', 300)]);

    it('trois projets sur la même OPE : trois lignes gardées, une par projet (avant : une seule)', function () {
      const kept = L().latestVersions(THREE()).lines;
      assertEqual(kept.length, 3);
      assertDeepEqual(kept.map(l => l.Projet).sort(), ['Encadrement doctoral', 'Plateforme de calcul', 'Veille réglementaire']);
    });

    it('deux versions de la ligne d\'un même projet : la plus récente gagne, comme avant', function () {
      const kept = L().latestVersions(withIds([rh('Encadrement doctoral', 100), rh('Plateforme de calcul', 200), rh('Encadrement doctoral', 150)])).lines;
      assertEqual(kept.length, 2);
      assertEqual(kept.find(l => l.Projet === 'Encadrement doctoral').Montant_attribue, 150);
    });

    it('l\'OPE partagée est une information, pas une erreur : aucune ligne exclue, aucun projet bloqué', function () {
      const lines = L().latestVersions(THREE()).lines, issues = L().checkLines(lines);
      const shared = issues.filter(i => i.check === 'ope-projets');
      assertEqual(shared.length, 1, 'une seule information pour l\'OPE'); assertEqual(shared[0].level, 'warn');
      assertIncludes(shared[0].message, '3 projets');
      assertEqual(issues.filter(i => i.level === 'error').length, 0);
      assertTrue(L().groupProjects(lines, issues).entries.every(entry => !entry.blocked));
    });

    it('chaque projet sait que son OPE est partagée, et les montants de l\'OPE sont la somme des lignes de tous les projets', function () {
      const lines = L().latestVersions(THREE()).lines, grouped = L().groupProjects(lines, L().checkLines(lines));
      grouped.entries.forEach(entry => {
        assertTrue(entry.opes[0].shared); assertEqual(entry.opes[0].sharedBy, 3);
        assertEqual(entry.opes[0].amounts.Montant_attribue, 600, 'attribué de l\'OPE = 100 + 200 + 300');
        assertEqual(entry.opes[0].amounts.Consomme_AE, 50, 'le consommé vaut pour l\'OPE, il n\'est pas additionné');
      });
    });

    it('l\'OPE déjà rangée dans un projet de Grist ne fait pas retrouver ce projet à un autre projet qui la partage : nouveau, pas « sûr »', function () {
      const projets = [{ id: 10, Projet: 'Encadrement doctoral', Programme: 1, Ligne_OPE: ['L', 1] }];
      const b = build({ journal: THREE(), projets, lignes: [{ id: 1, N_OPE: 'OPE-RH' }] });
      const by = name => b.matches.get(b.entries.find(e => e.name === name).key);
      assertEqual(by('Plateforme de calcul').status, 'new', 'B n\'est pas fusionné dans A à cause de l\'OPE partagée');
      assertEqual(by('Veille réglementaire').status, 'new');
      assertEqual(by('Encadrement doctoral').status, 'maybe', 'A est retrouvé par son nom, à confirmer');
      assertEqual(by('Encadrement doctoral').projectId, 10);
    });

    it('la ligne partagée n\'est jamais « déjà sur un autre projet » : elle est rattachée à chaque projet, sans anomalie ni clic', function () {
      const projets = [{ id: 10, Projet: 'Encadrement doctoral', Programme: 1, Ligne_OPE: ['L', 1] }];
      const decisions = new Map(); // A est « à confirmer » : on le confirme comme le ferait Antoine
      const probe = build({ journal: THREE(), projets, lignes: [{ id: 1, N_OPE: 'OPE-RH' }] });
      probe.entries.filter(e => e.name === 'Encadrement doctoral').forEach(e => decisions.set(e.key, { mode: 'project', projectId: 10, confirmed: true }));
      const b = build({ journal: THREE(), projets, lignes: [{ id: 1, N_OPE: 'OPE-RH' }], decisions });
      b.table.rows.forEach(row => { row.lines.forEach(l => { assertEqual(l.conflict, null, row.entry.name + ' : pas de conflit'); assertTrue(l.shared); }); assertEqual(row.anomalies, 0, row.entry.name + ' : aucune anomalie'); });
      const nouveau = b.table.rows.find(r => r.entry.name === 'Plateforme de calcul');
      assertEqual(nouveau.state, 'add');
      assertEqual(nouveau.lines[0].existingId, 1, 'la ligne OPE existante est réutilisée, pas recréée');
    });

    it('une OPE déclarée « RH » dans Grist (Type_ligne_OPE) est partagée même quand un seul projet la porte dans l\'envoi', function () {
      const projets = [{ id: 10, Projet: 'Cartographie des sols', Programme: 1, Ligne_OPE: ['L', 1] }, { id: 11, Projet: 'Banc d essai moteur', Programme: 1, Ligne_OPE: ['L', 1] }];
      const journal = withIds([rh('Plateforme de calcul', 200)]);
      const b = build({ journal, projets, lignes: [{ id: 1, N_OPE: 'OPE-RH', Type_ligne_OPE: 'RH' }] });
      assertEqual(b.matches.get(b.entries[0].key).status, 'new', 'deux projets de Grist ont l\'OPE RH : aucun conflit, projet nouveau');
      assertEqual(b.table.rows[0].lines[0].conflict, null);
      const sans = build({ journal, projets, lignes: [{ id: 1, N_OPE: 'OPE-RH' }] });
      assertEqual(sans.matches.get(sans.entries[0].key).status, 'conflict', 'sans le type RH, l\'ambiguïté reste à trancher');
    });

    it('le plan écrit : une seule ligne OPE créée avec le montant de tout le monde, trois projets qui la référencent', function () {
      const projets = [], b = build({ journal: THREE(), projets, lignes: [], withAmounts: true });
      const plan = b.table.plan;
      const opes = plan.phase1.filter(op => op.table === 'Lignes_OPE' && op.kind === 'add');
      assertEqual(opes.length, 1, 'une seule ligne OPE pour trois projets');
      assertEqual(opes[0].fields.Montant_attribue, 600);
      const created = plan.phase2.filter(op => op.table === 'Projets' && op.kind === 'add');
      assertEqual(created.length, 3);
      created.forEach(op => assertDeepEqual(op.fields.Ligne_OPE, ['L', { tmp: opes[0].tmp }]));
    });
  });
})();
