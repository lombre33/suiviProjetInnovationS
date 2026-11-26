/**
 * Non-regression suite : totaux de Projets (formules Grist) additionnés sur les OPE 2 à 4 — demande d'Antoine du 26/11/2026
 * (« il faut que les colonnes de totaux existantes restent les bonnes, donc adapter les formules »).
 *
 * Total_2026/27/28, Total_Fonctionnement/investissement/Personnel et Montant_attribue_Total ne somment, à l'origine, que l'OPE 1. Le widget
 * (js/core/ope-totals.js) les réécrit pour y ajouter les OPE 2 à 4 qui existent : formule d'origine gardée en commentaire, formules
 * personnalisées jamais touchées, tout ou rien dans un seul envoi à Grist, rejouable, et jamais bloquant pour l'enregistrement.
 *
 * Les formules d'origine ci-dessous sont celles de docs/grist_structure. Que les formules produites calculent la même chose que les
 * originales (et la somme des OPE) a été vérifié avec Python sur ces mêmes textes.
 */
(function () {
  'use strict';

  const O = () => window.CoreOpes;
  const T = () => window.CoreOpeTotals;
  const calls = type => window.__TEST_CALLS__.filter(call => call.type === type);
  const modalEl = () => document.getElementById('cp-project-modal');
  const toastEl = () => document.getElementById('toast');
  const flat = text => text.replace(/[\s  ]+/g, ' ').trim();

  // --- Formules d'origine (docs/grist_structure) ---------------------------------------------------------------
  const sum3 = year => `rec.c${year}_M10_Fonctionnement+rec.c${year}_M20_Investissement+rec.c${year}_M30_Personnel`;
  const byMass = mass => [2026, 2027, 2028].map(year => `rec.c${year}_${mass}`).join('+');
  const ORIGINALS = {
    Total_2026: `if ${sum3(2026)} == 0:\n   return ""\nelse:\n   return ${sum3(2026)}`,
    Total_2027: `if ${sum3(2027)} == 0:\n   return ""\nelse:\n   return ${sum3(2027)}`,
    Total_2028: `value = ${sum3(2028)}\nif value == 0:\n   return ""\nelse:\n   return value`,
    Total_2029: 'return None',
    Total_Fonctionnement: `value = ${byMass('M10_Fonctionnement')}\nif value == 0:\n   return ""\nelse:\n   return value`,
    Total_investissement: `value = ${byMass('M20_Investissement')}\nif value == 0:\n   return ""\nelse:\n   return value`,
    Total_Personnel: `value = ${byMass('M30_Personnel')}\nif value == 0:\n   return ""\nelse:\n   return value`,
    Montant_attribue_Total: `return ${[2026, 2027, 2028].map(sum3).join('+')}`
  };
  const COLUMNS = Object.keys(ORIGINALS);

  // Projets du mock : colonnes des OPE 2 à `upTo` ajoutées (comme après un premier enregistrement) et métadonnées Grist installées
  // (_grist_Tables, _grist_Tables_column) avec les formules données (`null` : la colonne n'existe pas).
  // Les colonnes d'OPE 1 de 2029 (c2029_*) existent par défaut ; `{ without2029: true }` : un document où elles n'existent pas.
  async function installMeta(upTo, formulas, options) {
    const table = await window.grist.docApi.fetchTable('Projets');
    if (!(options && options.without2029)) ['M10_Fonctionnement', 'M20_Investissement', 'M30_Personnel'].forEach(mass => { if (!table[`c2029_${mass}`]) table[`c2029_${mass}`] = table.id.map(() => 0); });
    for (let rank = 2; rank <= upTo; rank += 1) {
      O().createdColumnsOf(rank).forEach(col => { if (!table[col]) table[col] = table.id.map(() => (col.startsWith('Ligne_OPE') ? ['L'] : (/^c\d{4}_/.test(col) ? 0 : ''))); });
    }
    const wanted = Object.assign({}, ORIGINALS, formulas || {});
    // Les colonnes calculées existent aussi dans le magasin du mock (ModifyColumn exige que la colonne existe).
    COLUMNS.forEach(col => { if (wanted[col] !== null && !table[col]) table[col] = table.id.map(() => 0); });
    window.__mockSetTable('Projets', table);
    const names = Object.keys(table).filter(key => key !== 'id');
    const meta = { id: [], parentId: [], colId: [], type: [], isFormula: [], formula: [], description: [], widgetOptions: [] };
    names.filter(col => wanted[col] !== null).forEach((col, i) => {
      const isFormula = Object.prototype.hasOwnProperty.call(wanted, col);
      meta.id.push(i + 1); meta.parentId.push(1); meta.colId.push(col); meta.type.push('Any');
      meta.isFormula.push(isFormula); meta.formula.push(isFormula ? wanted[col] : ''); meta.description.push(''); meta.widgetOptions.push('');
    });
    window.__mockSetTable('_grist_Tables', { id: [1], tableId: ['Projets'] });
    window.__mockSetTable('_grist_Tables_column', meta);
  }
  async function formulaOf(colId) {
    const meta = await window.grist.docApi.fetchTable('_grist_Tables_column');
    return meta.formula[meta.colId.indexOf(colId)];
  }
  // Un seul envoi à Grist = un seul applyUserActions : on les compte.
  function spyBatches() {
    const original = window.grist.docApi.applyUserActions, batches = [];
    window.grist.docApi.applyUserActions = async function (actions) { batches.push(actions.map(action => action[0])); return original.call(this, actions); };
    return { batches, restore() { window.grist.docApi.applyUserActions = original; } };
  }
  const modifies = () => calls('ModifyColumn').filter(call => call.table === 'Projets');
  window.TestOpeTotals = { installMeta, formulaOf, ORIGINALS, COLUMNS };

  async function loadFixtureState() {
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    return tables;
  }
  const projectRecord = id => window.CoreState.getTable('Projets').find(p => p.id === id);
  async function withOpe2(id) {
    const table = await window.grist.docApi.fetchTable('Projets');
    O().createdColumnsOf(2).forEach(col => { table[col] = table.id.map(() => (col.startsWith('Ligne_OPE') ? ['L'] : (/^c\d{4}_/.test(col) ? 0 : ''))); });
    table.Ligne_OPE_2[table.id.indexOf(id)] = ['L', 2];
    window.__mockSetTable('Projets', table);
  }

  // ===========================================================================================================
  describe('Totaux de Projets — reconnaissance et construction des formules', function () {
    it('les huit colonnes calculées concernées : Total_2026/27/28/29, Total_Fonctionnement/investissement/Personnel et Montant_attribue_Total', function () {
      assertDeepEqual(T().targets().map(target => target.colId), COLUMNS);
    });

    it('chacune des huit formules d\'origine est reconnue (mêmes colonnes d\'OPE 1, rien d\'autre que des sommes ; `return None` pour Total_2029)', function () {
      T().targets().forEach(target => assertTrue(T().isOriginal(target, ORIGINALS[target.colId]), `${target.colId} reconnue`));
    });

    it('les colonnes lues par chaque formule : 3 par année, 4 années par masse (2026 à 2029), 12 pour le montant attribué ; 2029 en plus de l\'origine (2026-2028)', function () {
      const sizes = Object.fromEntries(T().targets().map(target => [target.colId, T().columnsOf(target, 1).length]));
      assertDeepEqual(sizes, { Total_2026: 3, Total_2027: 3, Total_2028: 3, Total_2029: 3, Total_Fonctionnement: 4, Total_investissement: 4, Total_Personnel: 4, Montant_attribue_Total: 12 });
      const legacy = Object.fromEntries(T().targets().map(target => [target.colId, T().columnsOf(target, 1, false).length]));
      assertDeepEqual(legacy, { Total_2026: 3, Total_2027: 3, Total_2028: 3, Total_2029: 0, Total_Fonctionnement: 3, Total_investissement: 3, Total_Personnel: 3, Montant_attribue_Total: 9 });
      assertEqual(T().columnsOf(T().targets()[0], 2).join(), 'c2026_M10_Fonctionnement_2,c2026_M20_Investissement_2,c2026_M30_Personnel_2');
      assertEqual(T().referencedColumns(ORIGINALS.Total_2026).size, 3);
    });

    it('une formule personnalisée n\'est pas reconnue : colonne en plus, 2029, produit, appel de fonction, autre colonne', function () {
      const target = T().targets().find(t => t.colId === 'Total_2026');
      const custom = {
        '2029 en plus': `${ORIGINALS.Total_2026}\n# fin`.replace(/rec\.c2026_M30_Personnel/g, 'rec.c2026_M30_Personnel+rec.c2029_M10_Fonctionnement'),
        'un produit': ORIGINALS.Total_2026.replace('rec.c2026_M10_Fonctionnement', 'rec.c2026_M10_Fonctionnement*2'),
        'une fonction': `return round(${sum3(2026)}, 2)`,
        'colonne manquante': `return rec.c2026_M10_Fonctionnement+rec.c2026_M20_Investissement`,
        'autre colonne': `return rec.c2026_M10_Fonctionnement+rec.c2026_M20_Investissement+rec.c2026_M30_Personnel+rec.Autre`,
        'condition ajoutée': `if rec.Statut_Macro:\n   return 0\nreturn ${sum3(2026)}`
      };
      Object.entries(custom).forEach(([label, formula]) => assertTrue(!T().isOriginal(target, formula), `${label} : non reconnue`));
    });

    it('un commentaire dans la formule d\'origine ne change pas sa reconnaissance', function () {
      const target = T().targets().find(t => t.colId === 'Montant_attribue_Total');
      assertTrue(T().isOriginal(target, `# somme des 9 montants\n${ORIGINALS.Montant_attribue_Total}  # 2026-2028`));
    });

    it('formule produite pour l\'OPE 2 : formule d\'origine en commentaire, OPE 1 gardée, OPE 2 ajoutée, « vide à 0 » conservé', function () {
      const target = T().targets().find(t => t.colId === 'Total_2026');
      const built = T().plan(target, ORIGINALS.Total_2026, 2).formula;
      const lines = built.split('\n');
      assertEqual(lines[0], '# >>> Widget InnovationS : OPE 1 à 2');
      assertIncludes(lines[1], 'l\'OPE 2 (colonnes suffixées _2)');
      assertTrue(lines.includes('# <<<'), 'bloc délimité');
      assertDeepEqual(lines.filter(line => line.indexOf('#| ') === 0).map(line => line.slice(3)), ORIGINALS.Total_2026.split('\n'), 'la formule d\'origine, ligne à ligne, en commentaire');
      assertIncludes(built, 'total = (rec.c2026_M10_Fonctionnement + rec.c2026_M20_Investissement + rec.c2026_M30_Personnel)  # OPE 1');
      assertIncludes(built, 'total += (rec.c2026_M10_Fonctionnement_2 or 0) + (rec.c2026_M20_Investissement_2 or 0) + (rec.c2026_M30_Personnel_2 or 0)  # OPE 2');
      assertTrue(!built.includes('_3'), 'pas d\'OPE 3');
      assertIncludes(built, 'if total == 0:\n   return ""\nreturn total');
    });

    it('les colonnes d\'une OPE vide (None) ne cassent pas la somme : chaque terme ajouté est « ou 0 »', function () {
      const target = T().targets().find(t => t.colId === 'Montant_attribue_Total');
      const built = T().plan(target, ORIGINALS.Montant_attribue_Total, 4).formula;
      const added = built.split('\n').filter(line => line.indexOf('total +=') === 0);
      assertEqual(added.length, 3);
      assertTrue(added.every(line => (line.match(/or 0\)/g) || []).length === 9), 'neuf termes « (… or 0) » par OPE');
      assertTrue(!built.includes('return ""'), 'Montant_attribue_Total ne renvoie jamais "" : comme avant');
      assertIncludes(built, 'OPE 1 à 4');
    });

    it('la formule produite se relit : rang atteint et formule d\'origine retrouvés', function () {
      const target = T().targets().find(t => t.colId === 'Total_2028');
      const parsed = T().parseAdapted(T().plan(target, ORIGINALS.Total_2028, 3).formula);
      assertEqual(parsed.upTo, 3);
      assertEqual(parsed.original.join('\n'), ORIGINALS.Total_2028);
      assertEqual(T().parseAdapted(ORIGINALS.Total_2028), null, 'une formule d\'origine n\'est pas « adaptée »');
    });

    it('sans OPE 2 à 4 (rang 1) : rien à faire, même pour une formule personnalisée', function () {
      const target = T().targets()[0];
      assertEqual(T().plan(target, ORIGINALS.Total_2026, 1).action, 'none');
      assertEqual(T().plan(target, 'return 42', 1).action, 'none');
    });

    it('formule déjà adaptée au même rang : rien à faire ; rang en plus : étendue à partir de la formule d\'origine gardée en commentaire', function () {
      const target = T().targets().find(t => t.colId === 'Total_Fonctionnement');
      const at2 = T().plan(target, ORIGINALS.Total_Fonctionnement, 2).formula;
      assertEqual(T().plan(target, at2, 2).action, 'none');
      const at3 = T().plan(target, at2, 3);
      assertEqual(at3.action, 'adapt');
      assertEqual(at3.formula, T().plan(target, ORIGINALS.Total_Fonctionnement, 3).formula, 'même résultat que depuis la formule d\'origine');
      assertIncludes(at3.formula, 'OPE 1 à 3');
    });

    it('formule marquée puis modifiée à la main : plus touchée, la raison est dite', function () {
      const target = T().targets()[0];
      const edited = T().plan(target, ORIGINALS.Total_2026, 2).formula.replace('return total', 'return total * 2');
      const step = T().plan(target, edited, 3);
      assertEqual(step.action, 'skip');
      assertIncludes(step.reason, 'modifiée à la main');
    });

    it('formule personnalisée : non touchée ; formule absente : non touchée', function () {
      const target = T().targets()[0];
      assertEqual(T().plan(target, `return ${sum3(2026)} * 1.1`, 2).action, 'skip');
      assertIncludes(T().plan(target, `return ${sum3(2026)} * 1.1`, 2).reason, 'personnalisée');
      assertEqual(T().plan(target, '', 2).action, 'skip');
    });

    it('rang atteint : seules les OPE dont les neuf colonnes 2026-2028 existent, de façon continue à partir de l\'OPE 2', function () {
      const nine = rank => T().targets().flatMap(target => T().columnsOf(target, rank));
      assertEqual(T().completeRank(new Set()), 1);
      assertEqual(T().completeRank(new Set(nine(2))), 2);
      assertEqual(T().completeRank(new Set(nine(2).concat(nine(3)))), 3);
      assertEqual(T().completeRank(new Set(nine(2).concat(nine(3), nine(4)))), 4);
      assertEqual(T().completeRank(new Set(nine(3))), 1, 'une OPE 3 sans OPE 2 ne compte pas : les formules ne citent que des colonnes qui existent');
      assertEqual(T().completeRank(new Set(nine(2).concat(nine(3)).filter(col => col !== 'c2026_M10_Fonctionnement_3'))), 2, 'une colonne de l\'OPE 3 manque : elle n\'est pas ajoutée');
    });
  });

  // ===========================================================================================================
  describe('Totaux de Projets — adaptation dans Grist', function () {
    it('OPE 2 existante : les huit formules sont réécrites en UN seul envoi à Grist (tout ou rien)', async function () {
      await installMeta(2);
      const spy = spyBatches();
      let result;
      try { result = await T().adapt(2); } finally { spy.restore(); }
      assertTrue(result.ok);
      assertDeepEqual(result.adapted, COLUMNS);
      const modifyBatches = spy.batches.filter(batch => batch.includes('ModifyColumn'));
      assertEqual(modifyBatches.length, 1, 'un seul applyUserActions pour les réécritures');
      assertDeepEqual(modifyBatches[0], COLUMNS.map(() => 'ModifyColumn'));
      assertDeepEqual(modifies().map(call => call.colId), COLUMNS);
      assertTrue(modifies().every(call => Object.keys(call.colInfo).join() === 'formula'), 'seule la formule change : ni type, ni nom, ni options d\'affichage');
      const total = await formulaOf('Montant_attribue_Total');
      assertIncludes(total, '(rec.c2028_M30_Personnel_2 or 0)');
      assertIncludes(total, '#| ' + ORIGINALS.Montant_attribue_Total);
    });

    it('colonnes existantes jamais renommées ni supprimées : des ModifyColumn de formule, et seulement des colonnes de totaux par OPE ajoutées', async function () {
      await installMeta(3);
      await T().adapt(3);
      assertEqual(window.__TEST_CALLS__.filter(call => ['RemoveColumn', 'RenameColumn', 'AddTable'].includes(call.type)).length, 0);
      assertTrue(calls('AddColumn').every(call => /^Total_(\w+_)?OPE_[1-3]$/.test(call.colId)), 'seulement Total_..._OPE_n');
      assertEqual(modifies().length, 8);
    });

    it('rejouable : une fois vérifiées, plus aucune lecture ni écriture dans la session ; après un redémarrage, rien n\'est réécrit', async function () {
      await installMeta(2);
      await T().adapt(2);
      const before = window.__TEST_CALLS__.length;
      const again = await T().adapt(2);
      assertEqual(again.checked, false, 'déjà vérifié dans la session : ni lecture ni écriture');
      assertEqual(window.__TEST_CALLS__.length, before);
      T()._reset(); // nouvelle session : les formules sont relues et reconnues comme déjà adaptées
      const restart = await T().adapt(2);
      assertTrue(restart.ok && restart.checked);
      assertDeepEqual(restart.adapted, []);
      assertEqual(modifies().length, 8, 'toujours les huit d\'origine, aucune de plus');
    });

    it('une OPE 3 ajoutée plus tard : les formules passent à « OPE 1 à 3 » sans perdre la formule d\'origine', async function () {
      await installMeta(2);
      await T().adapt(2);
      await installMeta(3, Object.fromEntries(await Promise.all(COLUMNS.map(async col => [col, await formulaOf(col)]))));
      window.__TEST_CALLS__.length = 0;
      const result = await T().adapt(3);
      assertDeepEqual(result.adapted, COLUMNS);
      assertEqual(modifies().length, 8);
      const total = await formulaOf('Total_2027');
      assertIncludes(total, 'OPE 1 à 3');
      assertIncludes(total, '(rec.c2027_M30_Personnel_3 or 0)');
      assertEqual(total.split('\n').filter(line => line.indexOf('#| ') === 0).map(line => line.slice(3)).join('\n'), ORIGINALS.Total_2027, 'la formule d\'origine n\'a pas bougé');
    });

    it('une formule personnalisée n\'est jamais touchée : les autres sont adaptées et celle-là est signalée', async function () {
      const custom = `return ${sum3(2027)} * 1.2`;
      await installMeta(2, { Total_2027: custom });
      const result = await T().adapt(2);
      assertTrue(result.ok);
      assertEqual(result.adapted.length, 7);
      assertTrue(!result.adapted.includes('Total_2027'));
      assertEqual(result.untouched.length, 1);
      assertEqual(result.untouched[0].colId, 'Total_2027');
      assertIncludes(result.untouched[0].reason, 'personnalisée');
      assertEqual(await formulaOf('Total_2027'), custom);
      assertTrue(!modifies().some(call => call.colId === 'Total_2027'));
    });

    it('une colonne qui n\'existe pas dans ce document est ignorée ; une colonne de données n\'est pas une formule', async function () {
      await installMeta(2, { Total_Personnel: null });
      const table = await window.grist.docApi.fetchTable('_grist_Tables_column');
      table.isFormula[table.colId.indexOf('Total_2026')] = false;
      window.__mockSetTable('_grist_Tables_column', table);
      const result = await T().adapt(2);
      assertEqual(result.adapted.length, 6);
      assertDeepEqual(result.untouched.map(item => item.colId).sort(), ['Total_2026', 'Total_Personnel']);
      assertIncludes(result.untouched.find(item => item.colId === 'Total_Personnel').reason, 'absente');
    });

    it('aucune colonne d\'OPE 2 à 4 : seul 2029 s\'ajoute (Total_2029 et les cumuls), Total_2026/27/28 ne bougent pas', async function () {
      await installMeta(1);
      const result = await T().adapt(2);
      assertTrue(result.ok);
      assertDeepEqual(result.adapted, ['Total_2029', 'Total_Fonctionnement', 'Total_investissement', 'Total_Personnel', 'Montant_attribue_Total']);
      assertEqual(await formulaOf('Total_2026'), ORIGINALS.Total_2026);
      assertIncludes(await formulaOf('Total_Fonctionnement'), 'OPE 1 à 1, 2029 inclus');
    });

    it('document sans les colonnes 2029 d\'OPE 1 (c2029_*) : rien n\'est modifié, une formule ne cite jamais une colonne absente', async function () {
      await installMeta(1, {}, { without2029: true });
      const result = await T().adapt(2);
      assertTrue(result.ok);
      assertEqual(result.adapted.length, 0);
      assertEqual(modifies().length, 0);
    });

    it('document sans c2029_* mais avec une OPE 2 : les OPE s\'ajoutent, sans 2029', async function () {
      await installMeta(2, {}, { without2029: true });
      const result = await T().adapt(2);
      assertDeepEqual(result.adapted, ['Total_2026', 'Total_2027', 'Total_2028', 'Total_Fonctionnement', 'Total_investissement', 'Total_Personnel', 'Montant_attribue_Total']);
      assertTrue(!(await formulaOf('Total_Fonctionnement')).includes('c2029'));
      assertEqual(await formulaOf('Total_2029'), 'return None', 'Total_2029 n\'a rien à calculer sans les colonnes de 2029 : jamais une somme vide');
    });

    it('seules les OPE existantes sont ajoutées : demandée jusqu\'à 4, trouvée jusqu\'à 2', async function () {
      await installMeta(2);
      await T().adapt(4);
      assertIncludes(await formulaOf('Total_2026'), 'OPE 1 à 2');
      assertTrue(!(await formulaOf('Total_2026')).includes('_3'));
    });

    it('projet classique (rang demandé : 1) : 2029 est ajouté aux totaux, même quand des colonnes d\'OPE 2 existent déjà ailleurs', async function () {
      await installMeta(2);
      const result = await T().adapt(1);
      assertEqual(result.checked, true);
      assertEqual(result.upTo, 2, 'les formules couvrent les OPE dont les colonnes existent, pas seulement celles de ce projet');
      assertEqual(modifies().length, 8);
    });

    it('Total_2029 : calculée (elle valait None), avec la formule d\'origine gardée en commentaire', async function () {
      await installMeta(1);
      await T().adapt(1);
      const formula = await formulaOf('Total_2029');
      assertIncludes(formula, '# >>> Widget InnovationS : OPE 1 à 1, 2029 inclus');
      assertIncludes(formula, '#| return None');
      assertIncludes(formula, 'total = ((rec.c2029_M10_Fonctionnement or 0) + (rec.c2029_M20_Investissement or 0) + (rec.c2029_M30_Personnel or 0))  # OPE 1');
      assertIncludes(formula, 'if total == 0:\n   return ""\nreturn total');
    });

    it('une formule déjà adaptée aux OPE avant l\'ajout de 2029 reçoit 2029, la formule d\'origine est conservée', async function () {
      const target = T().targets().find(t => t.colId === 'Montant_attribue_Total');
      const before = T().build(target, ORIGINALS.Montant_attribue_Total.split('\n'), 2, false);
      assertTrue(!before.includes('c2029') && before.indexOf('# >>> Widget InnovationS : OPE 1 à 2') === 0, 'texte tel que produit avant 2029');
      await installMeta(2, { Montant_attribue_Total: before });
      const result = await T().adapt(2);
      assertTrue(result.adapted.includes('Montant_attribue_Total'));
      const upgraded = await formulaOf('Montant_attribue_Total');
      assertIncludes(upgraded, 'OPE 1 à 2, 2029 inclus');
      assertIncludes(upgraded, '(rec.c2029_M30_Personnel_2 or 0)');
      assertIncludes(upgraded, '#| ' + ORIGINALS.Montant_attribue_Total);
    });

    it('Grist refuse la modification (droits de structure) : rien n\'est modifié, aucune exception, et pas de seconde tentative dans la session', async function () {
      await installMeta(2);
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async function (actions) {
        if (actions.some(action => action[0] === 'ModifyColumn')) throw new Error('Grist refuse (test)');
        return original.call(this, actions);
      };
      try {
        const result = await T().adapt(2);
        assertEqual(result.ok, false);
        assertIncludes(result.error.message, 'Grist refuse');
        assertEqual(modifies().length, 0);
        const second = await T().adapt(2);
        assertEqual(second.repeated, true, 'pas de nouvel essai (ni de nouveau message) dans la même session');
      } finally { window.grist.docApi.applyUserActions = original; }
    });

    it('métadonnées illisibles (droits d\'accès) : aucune exception, rien n\'est modifié', async function () {
      await installMeta(2);
      const original = window.grist.docApi.fetchTable;
      window.grist.docApi.fetchTable = async function (name) {
        if (name === '_grist_Tables_column') throw new Error('Accès refusé (test)');
        return original.call(this, name);
      };
      try {
        const result = await T().adapt(2);
        assertEqual(result.ok, false);
        assertEqual(modifies().length, 0);
      } finally { window.grist.docApi.fetchTable = original; }
    });
  });

  // ===========================================================================================================
  // Modèle de courrier de notification (Antoine, 26/11/2026) : un tableau par OPE — lignes Fonctionnement / Investissement / Personnel, colonnes 2026 à 2029,
  // « Total Projet » en bout de ligne, ligne « Total » en bas. Chaque case a sa colonne dédiée dans Projets.
  describe('Totaux par OPE — colonnes dédiées au courrier de notification', function () {
    const added = () => calls('AddColumn').map(call => call.colId);
    const OPE_COLUMNS = rank => ['Fonctionnement', 'Investissement', 'Personnel'].map(mass => `Total_${mass}_OPE_${rank}`)
      .concat([2026, 2027, 2028, 2029].map(year => `Total_${year}_OPE_${rank}`), [`Total_OPE_${rank}`]);

    it('huit colonnes par OPE : trois « Total Projet » par masse, quatre totaux par année, le total de l\'OPE', function () {
      assertDeepEqual(O().totalDefinitions(2).map(def => def.id), OPE_COLUMNS(2));
      assertDeepEqual(O().totalDefinitions(1).map(def => def.id), OPE_COLUMNS(1));
      assertEqual(O().totalMassColumn(3, 'F'), 'Total_Fonctionnement_OPE_3');
      assertEqual(O().totalYearColumn(4, 2028), 'Total_2028_OPE_4');
      assertEqual(O().totalOpeColumn(2), 'Total_OPE_2');
    });

    it('chacune est une formule numérique qui additionne les montants de CETTE OPE seulement (l\'OPE 1 : les colonnes d\'origine), avec une bulle d\'aide', function () {
      const byId = Object.fromEntries(O().totalDefinitions(2).map(def => [def.id, def]));
      assertTrue(Object.values(byId).every(def => def.type === 'Numeric' && def.isFormula === true && def.description), 'Numeric, formule, description');
      assertIncludes(byId.Total_Fonctionnement_OPE_2.formula, 'return (rec.c2026_M10_Fonctionnement_2 or 0) + (rec.c2027_M10_Fonctionnement_2 or 0) + (rec.c2028_M10_Fonctionnement_2 or 0) + (rec.c2029_M10_Fonctionnement_2 or 0)');
      assertIncludes(byId.Total_2027_OPE_2.formula, 'return (rec.c2027_M10_Fonctionnement_2 or 0) + (rec.c2027_M20_Investissement_2 or 0) + (rec.c2027_M30_Personnel_2 or 0)');
      assertEqual((byId.Total_OPE_2.formula.match(/or 0\)/g) || []).length, 12, 'toutes les masses, 2026 à 2029');
      const one = Object.fromEntries(O().totalDefinitions(1).map(def => [def.id, def]));
      assertIncludes(one.Total_Personnel_OPE_1.formula, '(rec.c2026_M30_Personnel or 0) + (rec.c2027_M30_Personnel or 0)');
      assertTrue(!one.Total_Personnel_OPE_1.formula.includes('_2 or'), 'l\'OPE 1 ne lit jamais les colonnes des autres OPE');
    });

    it('sans les colonnes 2029 d\'OPE 1 : sept colonnes, jamais une formule qui lit 2029', function () {
      const defs = O().totalDefinitions(1, { with2029: false });
      assertEqual(defs.length, 7);
      assertTrue(defs.every(def => !def.formula.includes('c2029') && !def.id.includes('2029')));
    });

    it('projet classique : les huit colonnes de l\'OPE 1 sont créées avant la réécriture des formules', async function () {
      await installMeta(1);
      const result = await T().adapt(1);
      assertDeepEqual(added(), OPE_COLUMNS(1));
      assertDeepEqual(result.created, OPE_COLUMNS(1));
      assertTrue(window.__TEST_CALLS__.map(call => call.type).lastIndexOf('AddColumn') < window.__TEST_CALLS__.findIndex(call => call.type === 'ModifyColumn'), 'créées avant');
      assertTrue(calls('AddColumn').every(call => call.colInfo.isFormula === true && call.colInfo.type === 'Numeric' && !('description' in call.colInfo)));
    });

    it('plusieurs OPE : les colonnes de chaque OPE existante (1 et 2), et seulement celles-là', async function () {
      await installMeta(2);
      await T().adapt(2);
      assertDeepEqual(added().slice().sort(), OPE_COLUMNS(1).concat(OPE_COLUMNS(2)).sort());
    });

    it('une OPE 3 ajoutée plus tard : seules les huit colonnes de l\'OPE 3 sont créées', async function () {
      await installMeta(2);
      await T().adapt(2);
      const formulas = Object.fromEntries(await Promise.all(COLUMNS.map(async col => [col, await formulaOf(col)])));
      window.__TEST_CALLS__.length = 0;
      await installMeta(3, formulas);
      // installMeta réinstalle les métadonnées : les totaux par OPE déjà créés y figurent comme colonnes de Projets du mock
      const table = await window.grist.docApi.fetchTable('Projets');
      assertTrue(OPE_COLUMNS(1).concat(OPE_COLUMNS(2)).every(col => col in table), 'créées par le premier passage');
      await T().adapt(3);
      assertDeepEqual(added().slice().sort(), OPE_COLUMNS(3).slice().sort());
    });

    it('rejouable : des colonnes déjà là ne sont jamais recréées (après un redémarrage non plus)', async function () {
      await installMeta(2);
      await T().adapt(2);
      T()._reset();
      window.__TEST_CALLS__.length = 0;
      const again = await T().adapt(2);
      assertEqual(again.created.length, 0);
      assertEqual(calls('AddColumn').length, 0);
    });

    it('jamais écrites par le widget : ni la modale ni un enregistrement n\'envoient ces colonnes à Grist', async function () {
      await loadFixtureState();
      await installMeta(1);
      await loadFixtureState();
      window.ProjectModal.open(projectRecord(11));
      await modalEl().querySelector('[data-cp-save]').onclick();
      const fields = calls('UpdateRecord').filter(call => call.table === 'Projets')[0].fields;
      assertEqual(Object.keys(fields).filter(field => /^Total_/.test(field)).length, 0);
    });

    it('Grist refuse de créer les colonnes (droits de structure) : aucune formule n\'est réécrite, aucune exception', async function () {
      await installMeta(1);
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async function (actions) {
        if (actions.some(action => action[0] === 'AddColumn')) throw new Error('Grist refuse (test)');
        return original.call(this, actions);
      };
      try {
        const result = await T().adapt(1);
        assertEqual(result.ok, false);
        assertEqual(modifies().length, 0, 'tout ou rien : ni colonnes, ni formules');
      } finally { window.grist.docApi.applyUserActions = original; }
    });

    it('le message dit combien de colonnes de totaux par OPE ont été créées', async function () {
      await installMeta(1);
      await T().adaptAndNotify(1);
      assertIncludes(flat(toastEl().textContent), '8 colonnes de totaux par OPE créées dans Projets');
    });
  });

  // ===========================================================================================================
  describe('Totaux de Projets — ce que l\'utilisateur est prévenu de faire ou de ne pas avoir pu faire', function () {
    it('adaptation faite : un message dit quelles colonnes et que la formule d\'origine reste en commentaire', async function () {
      await installMeta(3);
      await T().adaptAndNotify(3);
      const text = flat(toastEl().textContent);
      assertIncludes(text, 'Totaux de Projets adaptés aux OPE 2 à 3 et à l\'année 2029');
      assertIncludes(text, 'Total_2026'); assertIncludes(text, 'Montant_attribue_Total');
      assertIncludes(text, 'formule d\'origine reste en commentaire');
      assertTrue(!toastEl().classList.contains('error'), 'une bonne nouvelle n\'est pas affichée comme une erreur');
    });

    it('une seule OPE ajoutée : « à l\'OPE 2 »', async function () {
      await installMeta(2);
      await T().adaptAndNotify(2);
      assertIncludes(flat(toastEl().textContent), 'Totaux de Projets adaptés à l\'OPE 2 et à l\'année 2029');
    });

    it('formule personnalisée : le message la nomme et dit pourquoi elle n\'est pas modifiée (affiché comme un point d\'attention)', async function () {
      await installMeta(2, { Total_2028: `return ${sum3(2028)} + 1` });
      await T().adaptAndNotify(2);
      const text = flat(toastEl().textContent);
      assertIncludes(text, 'Non modifiés : Total_2028 (formule personnalisée)');
      assertTrue(toastEl().classList.contains('error'));
    });

    it('rien à faire (déjà adapté) : aucun message', async function () {
      await installMeta(2);
      await T().adapt(2);
      T()._reset();
      toastEl().classList.add('hidden'); toastEl().textContent = '';
      await T().adaptAndNotify(2);
      assertEqual(toastEl().textContent, '');
    });

    it('échec : un message d\'erreur dit que les totaux ne sont pas adaptés, une seule fois par session', async function () {
      await installMeta(2);
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async function (actions) {
        if (actions.some(action => action[0] === 'ModifyColumn')) throw new Error('Grist refuse (test)');
        return original.call(this, actions);
      };
      try {
        await T().adaptAndNotify(2);
        assertTrue(toastEl().classList.contains('error'));
        assertIncludes(flat(toastEl().textContent), 'Totaux de Projets non adaptés');
        toastEl().classList.add('hidden'); toastEl().textContent = '';
        await T().adaptAndNotify(2);
        assertEqual(toastEl().textContent, '', 'pas de second message pour le même refus');
      } finally { window.grist.docApi.applyUserActions = original; }
    });
  });

  // ===========================================================================================================
  describe('Totaux de Projets — à l\'enregistrement d\'un projet', function () {
    const addButton = () => modalEl().querySelector('[data-ope-add]');
    const saveButton = () => modalEl().querySelector('[data-cp-save]');
    const indexOf = (type, predicate) => window.__TEST_CALLS__.findIndex(call => call.type === type && (!predicate || predicate(call)));

    it('projet à plusieurs OPE : les formules sont adaptées avant d\'écrire le projet', async function () {
      await loadFixtureState();
      await withOpe2(11);
      await installMeta(2);
      await loadFixtureState();
      window.__TEST_CALLS__.length = 0;
      window.ProjectModal.open(projectRecord(11));
      await saveButton().onclick();
      assertEqual(modifies().length, 8);
      assertTrue(indexOf('ModifyColumn') !== -1 && indexOf('ModifyColumn') < indexOf('UpdateRecord', call => call.table === 'Projets'), 'les totaux sont adaptés avant l\'écriture du projet');
      assertTrue(modalEl().classList.contains('cp-hidden'), 'le projet est bien enregistré');
    });

    it('création des colonnes d\'une OPE 2 puis adaptation des totaux, puis écriture : dans cet ordre', async function () {
      await loadFixtureState();
      await installMeta(1);
      await loadFixtureState();
      window.__TEST_CALLS__.length = 0;
      window.ProjectModal.open(projectRecord(11));
      addButton().click();
      const note = modalEl().querySelector('.cp-ope[data-ope-rank="2"] textarea');
      setValue(note, 'Une deuxième OPE'); fire(note, 'input');
      await saveButton().onclick();
      const lastAdd = window.__TEST_CALLS__.map(call => call.type).lastIndexOf('AddColumn');
      assertTrue(lastAdd !== -1, 'colonnes de l\'OPE 2 créées');
      assertEqual(modifies().length, 8, 'puis les huit formules');
      assertTrue(indexOf('ModifyColumn') > lastAdd, 'après la création des colonnes');
      assertTrue(indexOf('ModifyColumn') < indexOf('UpdateRecord', call => call.table === 'Projets'), 'avant l\'écriture');
      assertIncludes(await formulaOf('Total_2026'), '(rec.c2026_M10_Fonctionnement_2 or 0)');
      assertIncludes(await formulaOf('Total_2026'), '#| if rec.c2026_M10_Fonctionnement');
    });

    it('projet classique (une seule OPE) : 2029 est ajouté aux totaux, Total_2026/27/28 ne bougent pas, et une seule vérification par session', async function () {
      await loadFixtureState();
      await installMeta(1);
      await loadFixtureState();
      window.__TEST_CALLS__.length = 0;
      window.ProjectModal.open(projectRecord(11));
      await saveButton().onclick();
      assertDeepEqual(modifies().map(call => call.colId), ['Total_2029', 'Total_Fonctionnement', 'Total_investissement', 'Total_Personnel', 'Montant_attribue_Total']);
      assertEqual(await formulaOf('Total_2026'), ORIGINALS.Total_2026);
      const original = window.grist.docApi.fetchTable;
      let metaReads = 0;
      window.grist.docApi.fetchTable = async function (name) { if (name === '_grist_Tables_column') metaReads += 1; return original.call(this, name); };
      try {
        window.ProjectModal.open(projectRecord(10));
        await saveButton().onclick();
      } finally { window.grist.docApi.fetchTable = original; }
      assertEqual(modifies().length, 5, 'rien de plus au second enregistrement');
      assertEqual(metaReads, 0, 'et aucune relecture des métadonnées : déjà vérifié dans cette session');
    });

    it('Grist refuse de modifier les formules : le projet est quand même enregistré et le refus est dit', async function () {
      await loadFixtureState();
      await withOpe2(11);
      await installMeta(2);
      await loadFixtureState();
      window.__TEST_CALLS__.length = 0;
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async function (actions) {
        if (actions.some(action => action[0] === 'ModifyColumn')) throw new Error('Grist refuse (test)');
        return original.call(this, actions);
      };
      try {
        window.ProjectModal.open(projectRecord(11));
        await saveButton().onclick();
      } finally { window.grist.docApi.applyUserActions = original; }
      assertEqual(calls('UpdateRecord').filter(call => call.table === 'Projets').length, 1, 'le projet est enregistré malgré tout');
      assertTrue(modalEl().classList.contains('cp-hidden'));
      assertTrue(toastEl().classList.contains('error'));
      assertIncludes(flat(toastEl().textContent), 'Totaux de Projets non adaptés');
    });

    it('projet à plusieurs OPE sans accès aux métadonnées : le projet est enregistré, rien n\'est modifié', async function () {
      await loadFixtureState();
      await withOpe2(11);
      await loadFixtureState();
      window.__TEST_CALLS__.length = 0;
      window.ProjectModal.open(projectRecord(11));
      await saveButton().onclick();
      assertEqual(modifies().length, 0);
      assertEqual(calls('UpdateRecord').filter(call => call.table === 'Projets').length, 1);
    });
  });
})();
