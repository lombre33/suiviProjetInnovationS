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
  function build({ journal, projets = [], lignes = [], rankMode, decisions }) {
    const lines = L().latestVersions(withIds(journal)).lines, grouped = L().groupProjects(lines, L().checkLines(lines));
    const ctx = L().buildContext({ projets, lignes, programmes: PROGRAMMES, structures: STRUCTURES, rankMode });
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
  describe('Import — un projet et ses lignes de modification (prolongation, réattribution) comptent pour un seul projet', function () {
    // Dans le Grist d'Antoine, une prolongation ou une réattribution est une ligne de Projets de plus, reliée au projet d'origine par
    // Projet_Parent_le_cas_echeant_ et posée sur la même OPE. Sans cela, chaque projet à modifications sortait en « conflit » au one-shot.
    const PARENT = 'Projet_Parent_le_cas_echeant_';
    const LIGNES = [{ id: 1, N_OPE: 'OPE-R1' }, { id: 2, N_OPE: 'OPE-S1' }];
    const robo = [line('OPE-R1', 'InnovationS', 2023, 'Robotique agricole')];
    const family = () => [
      { id: 10, Projet: 'Robotique agricole', Acronyme: 'ROBO', Programme: 1, Ligne_OPE: ['L', 1] },
      { id: 11, Projet: 'Robotique agricole - réattribution', Programme: 1, Ligne_OPE: ['L', 1], [PARENT]: 10 },
      { id: 12, Projet: 'Robotique agricole - prolongation', Programme: 1, Ligne_OPE: ['L', 1], [PARENT]: 10 }
    ];
    const matchOf = (journal, projets, lignes = LIGNES) => { const b = build({ journal, projets, lignes }); return { b, match: b.matches.get(b.entries[0].key) }; };

    it('l\'OPE est sur le projet d\'origine et sur ses deux lignes de modification : sûr, rattaché à l\'origine, sans conflit', function () {
      const { b, match } = matchOf(robo, family());
      assertEqual(match.status, 'sure'); assertEqual(match.rung, 1); assertEqual(match.projectId, 10);
      assertDeepEqual(match.candidates.map(c => c.id), [10]);
      const row = b.table.rows[0], ligne = row.lines[0];
      assertEqual(ligne.conflict, null, 'plus de « déjà sur un autre projet »'); assertFalse(ligne.needsLink, 'la ligne est déjà dans la famille : rien à rattacher');
      assertTrue(row.state !== 'tbd', 'rien à trancher');
    });

    it('l\'OPE n\'est que sur une ligne de modification : le projet d\'origine est proposé, et la ligne n\'est pas rattachée une seconde fois', function () {
      const projets = [{ id: 10, Projet: 'Robotique agricole', Programme: 1 }, { id: 11, Projet: 'Robotique agricole - réattribution', Programme: 1, Ligne_OPE: ['L', 1], [PARENT]: 10 }];
      const { b, match } = matchOf(robo, projets);
      assertEqual(match.status, 'sure'); assertEqual(match.projectId, 10);
      assertFalse(b.table.rows[0].lines[0].needsLink); assertEqual(b.table.rows[0].lines[0].conflict, null);
    });

    it('le N° décision cité par le projet et par sa ligne de prolongation : un seul projet, l\'origine', function () {
      const projets = [
        { id: 10, Projet: 'Robotique agricole', numero_descisions_OLD: 'DEC-2023-0412' },
        { id: 11, Projet: 'Robotique agricole - prolongation', prolongation_numeroDecisionInitial: 'DEC-2023-0412', [PARENT]: 10 }
      ];
      const journal = [line('OPE-NOUVELLE', 'InnovationS', 2023, 'Un autre libellé', { N_decision: 'DEC-2023-0412' })];
      const { match } = matchOf(journal, projets, []);
      assertEqual(match.status, 'sure'); assertEqual(match.rung, 2); assertEqual(match.projectId, 10);
    });

    it('le même nom sur le projet et sur sa ligne de modification : à confirmer pour l\'origine (plus de « plusieurs projets portent ce nom »)', function () {
      const projets = [{ id: 10, Projet: 'Robotique agricole' }, { id: 11, Projet: 'Robotique agricole', [PARENT]: 10 }];
      const { match } = matchOf([line('OPE-NEUVE', 'InnovationS', 2023, 'Robotique agricole')], projets, []);
      assertEqual(match.status, 'maybe'); assertEqual(match.projectId, 10); assertDeepEqual(match.candidates.map(c => c.id), [10]);
    });

    it('deux projets d\'origine différents (chacun avec ses modifications) restent un vrai conflit, entre les deux origines', function () {
      const projets = [
        { id: 10, Projet: 'A', Ligne_OPE: ['L', 1] }, { id: 11, Projet: 'A - réattribution', Ligne_OPE: ['L', 1], [PARENT]: 10 },
        { id: 20, Projet: 'B', Ligne_OPE: ['L', 2] }, { id: 21, Projet: 'B - réattribution', Ligne_OPE: ['L', 2], [PARENT]: 20 }
      ];
      const journal = [line('OPE-R1', 'InnovationS', 2023, 'Mélange'), line('OPE-S1', 'InnovationS', 2023, 'Mélange')];
      const { match } = matchOf(journal, projets);
      assertEqual(match.status, 'conflict');
      assertDeepEqual(match.candidates.map(c => c.id).sort((a, b) => a - b), [10, 20], 'seules les origines sont proposées, pas les lignes de modification');
    });

    it('un projet d\'origine absent de la table ou une boucle de parents ne cassent rien : la ligne compte pour elle-même', function () {
      const orphan = [{ id: 11, Projet: 'Robotique agricole - réattribution', Ligne_OPE: ['L', 1], [PARENT]: 99 }];
      const { match } = matchOf(robo, orphan);
      assertEqual(match.status, 'sure'); assertEqual(match.projectId, 11);
      const loop = [{ id: 10, Projet: 'A', Ligne_OPE: ['L', 1], [PARENT]: 11 }, { id: 11, Projet: 'B', [PARENT]: 10 }];
      const looped = matchOf(robo, loop).match;
      assertEqual(looped.status, 'sure', 'la boucle s\'arrête'); assertEqual(looped.projectId, 10, 'chaque ligne de la boucle compte pour elle-même : l\'OPE est sur le projet 10');
    });

    it('le parent peut être lu comme un identifiant, un objet { id } ou 0 (aucun)', function () {
      const ctx = L().buildContext({ projets: [{ id: 10, Projet: 'A' }, { id: 11, Projet: 'B', [PARENT]: { id: 10 } }, { id: 12, Projet: 'C', [PARENT]: 0 }, { id: 13, Projet: 'D', [PARENT]: '10' }], lignes: [], programmes: [], structures: [] });
      assertDeepEqual([10, 11, 12, 13].map(id => ctx.rootById.get(id)), [10, 10, 12, 10]);
    });
  });
})();
