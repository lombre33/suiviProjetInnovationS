/**
 * Non-regression suite : colonne affichée des colonnes référence créées par le widget — signalé par Antoine le 26/11/2026
 * (« la colonne est mal typée, j'ai un ID qui s'affiche et pas la bonne valeur »).
 *
 * Une colonne Ref / RefList créée par l'API n'a aucune « colonne affichée » : Grist y montre le numéro de ligne. Le réglage est visibleCol
 * (colonne de la table cible) + displayCol (colonne d'aide, créée par l'action SetDisplayFormula). Règle (Antoine : « être vigilant là-dessus
 * pour la suite ») : toute colonne référence créée par le widget est réglée à la création ; celles déjà créées sont réparées au prochain
 * enregistrement d'un projet à plusieurs OPE ou import ; une colonne déjà réglée n'est jamais touchée.
 */
(function () {
  'use strict';

  const O = () => window.CoreOpes;
  const calls = type => window.__TEST_CALLS__.filter(call => call.type === type);
  const displays = () => calls('SetDisplayFormula').filter(call => call.table === 'Projets');

  // Métadonnées Grist d'un petit document : Projets (OPE 1 réglée sur Structures.<opeColumn>), Structures, Lignes_OPE, Annuaire.
  function installMeta({ opeInstalle = 20, opeLigne = 30, extraProjectColumns = [] } = {}) {
    const rows = [];
    const add = (id, parentId, colId, type, extra) => rows.push(Object.assign({ id, parentId, colId, type, parentPos: id, isFormula: false, formula: '', description: '', widgetOptions: '', visibleCol: 0, displayCol: 0 }, extra));
    add(20, 2, 'Nom_Complet', 'Text'); add(21, 2, 'Acronyme', 'Text'); add(22, 2, 'Service', 'Ref:Structures');
    add(30, 3, 'N_OPE', 'Text'); add(31, 3, 'installe_chez', 'Ref:Structures');
    add(40, 4, 'nom_et_Prenom', 'Text'); add(41, 4, 'Email', 'Text');
    add(10, 1, 'Ligne_OPE', 'RefList:Lignes_OPE', { visibleCol: opeLigne, displayCol: opeLigne ? 900 : 0 });
    add(11, 1, 'Ligne_OPE_installe_chez', 'RefList:Structures', { isFormula: true, formula: '$Ligne_OPE.installe_chez', visibleCol: opeInstalle, displayCol: opeInstalle ? 901 : 0 });
    extraProjectColumns.forEach((col, i) => {
      const extra = {};
      ['isFormula', 'formula', 'visibleCol', 'displayCol'].forEach(key => { if (col[key] !== undefined) extra[key] = col[key]; });
      add(100 + i, 1, col.id, col.type, extra);
    });
    const meta = {};
    Object.keys(rows[0]).forEach(key => { meta[key] = rows.map(row => row[key]); });
    window.__mockSetTable('_grist_Tables', { id: [1, 2, 3, 4], tableId: ['Projets', 'Structures', 'Lignes_OPE', 'Annuaire'] });
    window.__mockSetTable('_grist_Tables_column', meta);
  }
  async function metaRow(colId, table = 1) {
    const meta = await window.grist.docApi.fetchTable('_grist_Tables_column');
    const at = meta.id.findIndex((id, i) => meta.parentId[i] === table && meta.colId[i] === colId);
    return at === -1 ? null : { id: meta.id[at], visibleCol: meta.visibleCol[at], displayCol: meta.displayCol[at] };
  }
  const createOpe = (upTo = 2) => window.CoreGrist.ensureColumns('Projets', O().missingColumns(window.CoreGrist.knownColumns('Projets') || new Set(), upTo));

  async function loadFixtureState() {
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    return tables;
  }
  const projectRecord = id => window.CoreState.getTable('Projets').find(p => p.id === id);
  const modalEl = () => document.getElementById('cp-project-modal');

  // ===========================================================================================================
  describe('Colonnes référence créées par le widget — la colonne affichée est réglée (jamais un numéro de ligne)', function () {
    it('les colonnes référence des OPE 2 à 4 déclarent leur colonne affichée, recopiée de l\'OPE 1 (liste de lignes OPE → N_OPE, installée chez → Acronyme)', function () {
      const defs = O().columnDefinitions(2);
      const withDisplay = defs.filter(def => def.display);
      assertDeepEqual(withDisplay.map(def => def.id), ['Ligne_OPE_2', 'Ligne_OPE_installe_chez_2']);
      assertDeepEqual(withDisplay[0].display, { like: 'Ligne_OPE', column: 'N_OPE' });
      assertDeepEqual(withDisplay[1].display, { like: 'Ligne_OPE_installe_chez', column: 'Acronyme' });
      assertEqual(O().referenceDisplaySpecs(4).length, 6, 'deux colonnes référence par OPE, OPE 2 à 4');
      assertEqual(O().referenceDisplaySpecs(1).length, 0);
    });

    it('à la création de l\'OPE 2 : même colonne affichée que l\'OPE 1, réglée dans Grist (visibleCol puis SetDisplayFormula)', async function () {
      installMeta({ opeInstalle: 20 }); // l'OPE 1 montre Structures.Nom_Complet
      await createOpe(2);
      const installe = await metaRow('Ligne_OPE_installe_chez_2'), ligne = await metaRow('Ligne_OPE_2');
      const set = displays();
      assertEqual(set.length, 2);
      const forInstalle = set.find(call => call.colRef === installe.id), forLigne = set.find(call => call.colRef === ligne.id);
      assertEqual(forInstalle.formula, '$Ligne_OPE_installe_chez_2.Nom_Complet', 'recopié de Ligne_OPE_installe_chez');
      assertEqual(forLigne.formula, '$Ligne_OPE_2.N_OPE');
      assertEqual(forInstalle.fieldRef, null, 'réglage de la colonne, pas d\'un champ de vue');
      const visibleUpdates = calls('UpdateRecord').filter(call => call.table === '_grist_Tables_column' && call.fields.visibleCol);
      assertDeepEqual(visibleUpdates.map(call => call.fields.visibleCol).sort(), [20, 30]);
      assertEqual(installe.visibleCol, 20); assertTrue(installe.displayCol > 0, 'displayCol posée');
    });

    it('l\'OPE 1 n\'a pas de réglage : le repli est Acronyme pour les structures et N_OPE pour les lignes OPE', async function () {
      installMeta({ opeInstalle: 0, opeLigne: 0 });
      await createOpe(2);
      assertDeepEqual(displays().map(call => call.formula).sort(), ['$Ligne_OPE_2.N_OPE', '$Ligne_OPE_installe_chez_2.Acronyme']);
    });

    it('jamais de clé « display » envoyée à Grist : colInfo des AddColumn inchangée', async function () {
      installMeta();
      await createOpe(2);
      assertTrue(calls('AddColumn').length > 0);
      assertTrue(calls('AddColumn').every(call => !('display' in call.colInfo)));
    });

    it('une colonne référence sans réglage demandé : la première colonne de texte de la table cible, comme Grist (aucun numéro de ligne)', async function () {
      installMeta();
      await window.CoreGrist.ensureColumns('Projets', [{ id: 'Relu_par', label: 'Relu par', type: 'RefList:Annuaire', isFormula: false }]);
      assertEqual(displays().length, 1);
      assertEqual(displays()[0].formula, '$Relu_par.nom_et_Prenom');
    });

    it('les colonnes qui ne sont pas des références (montants, texte) ne reçoivent aucun réglage', async function () {
      installMeta();
      await window.CoreGrist.ensureColumns('Projets', [{ id: 'Note', type: 'Text', isFormula: false }, { id: 'Montant_x', type: 'Numeric', isFormula: false }]);
      assertEqual(displays().length, 0);
    });

    it('table créée par le widget : la création réussit et aucune clé « display » n\'est envoyée à Grist', async function () {
      installMeta();
      const created = await window.CoreGrist.ensureTable('Table_neuve', [{ id: 'Projet', type: 'Ref:Projets', display: { column: 'Acronyme' } }, { id: 'Libelle', type: 'Text' }]);
      assertTrue(created);
      assertEqual(calls('AddTable').length, 1);
      assertTrue(calls('AddTable')[0].colDefs.every(col => !('display' in col)));
    });
  });

  // ===========================================================================================================
  describe('Colonnes référence — réparation de celles déjà créées sans colonne affichée', function () {
    const created = [{ id: 'Ligne_OPE_2', type: 'RefList:Lignes_OPE' }, { id: 'Ligne_OPE_installe_chez_2', type: 'RefList:Structures', isFormula: true, formula: '$Ligne_OPE_2.installe_chez' }];

    async function withExistingOpe2() {
      const table = await window.grist.docApi.fetchTable('Projets');
      O().createdColumnsOf(2).forEach(col => { table[col] = table.id.map(() => (col.startsWith('Ligne_OPE') ? ['L'] : (/^c\d{4}_/.test(col) ? 0 : ''))); });
      window.__mockSetTable('Projets', table);
      installMeta({ extraProjectColumns: created });
      await window.CoreGrist.loadColumnDescriptions();
    }

    it('une colonne créée sans réglage est réparée, avec la colonne affichée de l\'OPE 1', async function () {
      await withExistingOpe2();
      const fixed = await window.CoreGrist.ensureReferenceDisplay('Projets', O().referenceDisplaySpecs(2));
      assertDeepEqual(fixed.sort(), ['Ligne_OPE_2', 'Ligne_OPE_installe_chez_2']);
      assertEqual(displays().length, 2);
      assertEqual(displays().find(call => call.formula.startsWith('$Ligne_OPE_installe_chez_2.')).formula, '$Ligne_OPE_installe_chez_2.Nom_Complet');
    });

    it('rejouable : une fois réglées, plus aucune action ni relecture dans la session ; après relecture du schéma, rien à refaire non plus', async function () {
      await withExistingOpe2();
      await window.CoreGrist.ensureReferenceDisplay('Projets', O().referenceDisplaySpecs(2));
      const before = window.__TEST_CALLS__.length;
      assertDeepEqual(await window.CoreGrist.ensureReferenceDisplay('Projets', O().referenceDisplaySpecs(2)), []);
      assertEqual(window.__TEST_CALLS__.length, before);
      await window.CoreGrist.loadColumnDescriptions(); // nouvelle session : la mémoire est vidée, les métadonnées montrent le réglage
      assertDeepEqual(await window.CoreGrist.ensureReferenceDisplay('Projets', O().referenceDisplaySpecs(2)), []);
      assertEqual(displays().length, 2, 'aucun SetDisplayFormula de plus');
    });

    it('une colonne déjà réglée (à la main, avec une autre colonne affichée) n\'est jamais touchée', async function () {
      const table = await window.grist.docApi.fetchTable('Projets');
      O().createdColumnsOf(2).forEach(col => { table[col] = table.id.map(() => ['L']); });
      window.__mockSetTable('Projets', table);
      installMeta({ extraProjectColumns: [
        Object.assign({}, created[0], { visibleCol: 31, displayCol: 777 }),
        Object.assign({}, created[1], { visibleCol: 21, displayCol: 778 })
      ] });
      await window.CoreGrist.loadColumnDescriptions();
      assertDeepEqual(await window.CoreGrist.ensureReferenceDisplay('Projets', O().referenceDisplaySpecs(2)), []);
      assertEqual(displays().length, 0);
      assertEqual((await metaRow('Ligne_OPE_installe_chez_2')).visibleCol, 21, 'son réglage d\'origine');
    });

    // Vérification du 26/11/2026 (bug « Programme (id 1) non lisible » sur le Kanban) : la réparation des colonnes affichées ne doit rien changer
    // aux colonnes référence d'Antoine (Programme, Porteur_1, Instance_ratachee…), même sans colonne affichée réglée (cas le plus exposé).
    it('ne touche aucune colonne qui n\'est pas au widget : Programme, Porteur_1, Instance_ratachee (références sans réglage) restent telles quelles', async function () {
      const theirs = [
        { id: 'Programme', type: 'Ref:Programmes' },
        { id: 'Porteur_1', type: 'Ref:Annuaire' },
        { id: 'Instance_ratachee', type: 'RefList:Suivi_Instance' },
        { id: 'Programme_Axe_InnovationS', type: 'Any', isFormula: true, formula: 'rec.Programme.Axe_InnovationS' }
      ];
      const table = await window.grist.docApi.fetchTable('Projets');
      O().createdColumnsOf(2).forEach(col => { table[col] = table.id.map(() => (col.startsWith('Ligne_OPE') ? ['L'] : (/^c\d{4}_/.test(col) ? 0 : ''))); });
      theirs.forEach(col => { table[col.id] = table.id.map(() => 1); });
      window.__mockSetTable('Projets', table);
      installMeta({ extraProjectColumns: created.concat(theirs) });
      await window.CoreGrist.loadColumnDescriptions();
      const before = {};
      for (const col of theirs) before[col.id] = await metaRow(col.id);
      // Tout ce que le widget fait pour les colonnes d'OPE : créer l'OPE 3 et 4 (avec colonne affichée), puis réparer les OPE 2 à 4 (à l'enregistrement et à l'import).
      await createOpe(4);
      await O().ensureDisplays(4);
      await O().ensureDisplays(4);
      // Colonnes visées par une écriture dans les métadonnées (UpdateRecord sur _grist_Tables_column) ou par un SetDisplayFormula.
      const meta = await window.grist.docApi.fetchTable('_grist_Tables_column');
      const colIdOf = ref => meta.colId[meta.id.indexOf(Number(ref))];
      const touched = new Set([
        ...calls('UpdateRecord').filter(call => call.table === '_grist_Tables_column').map(call => colIdOf(call.id)),
        ...calls('SetDisplayFormula').filter(call => call.table === 'Projets').map(call => colIdOf(call.colRef))
      ]);
      const mine = new Set([2, 3, 4].flatMap(rank => O().createdColumnsOf(rank)));
      const foreign = [...touched].filter(colId => !mine.has(colId));
      assertDeepEqual(foreign, [], `colonnes modifiées sans être celles du widget : ${foreign.join(', ')}`);
      assertTrue(touched.size > 0, 'le widget règle bien ses propres colonnes (OPE 2 à 4)');
      for (const col of theirs) assertDeepEqual(await metaRow(col.id), before[col.id], `${col.id} : réglage inchangé`);
      assertEqual(calls('ModifyColumn').filter(call => theirs.some(col => col.id === call.colId)).length, 0, 'aucune colonne d\'Antoine n\'est retypée');
    });

    it('une colonne qui n\'existe pas encore (OPE 3 jamais créée) est ignorée', async function () {
      await withExistingOpe2();
      const fixed = await window.CoreGrist.ensureReferenceDisplay('Projets', O().referenceDisplaySpecs(4));
      assertTrue(!fixed.some(col => /_[34]$/.test(col)));
    });

    it('Grist refuse (droits de structure) : ensureDisplays ne lève jamais et rien n\'est réglé', async function () {
      await withExistingOpe2();
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async function (actions) {
        if (actions.some(action => action[0] === 'SetDisplayFormula')) throw new Error('Grist refuse (test)');
        return original.call(this, actions);
      };
      try { assertDeepEqual(await O().ensureDisplays(2), []); }
      finally { window.grist.docApi.applyUserActions = original; }
      assertEqual(displays().length, 0);
    });

    it('à la création des colonnes, un refus pour la colonne affichée n\'empêche pas la création : les colonnes existent', async function () {
      installMeta();
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async function (actions) {
        if (actions.some(action => action[0] === 'SetDisplayFormula')) throw new Error('Grist refuse (test)');
        return original.call(this, actions);
      };
      try { assertTrue(await createOpe(2)); }
      finally { window.grist.docApi.applyUserActions = original; }
      assertEqual(calls('AddColumn').length, 16);
    });
  });

  // ===========================================================================================================
  describe('Colonnes référence — à l\'enregistrement d\'un projet à plusieurs OPE', function () {
    async function projectWithOpe2Unset() {
      await loadFixtureState();
      const table = await window.grist.docApi.fetchTable('Projets');
      O().createdColumnsOf(2).forEach(col => { table[col] = table.id.map(() => (col.startsWith('Ligne_OPE') ? ['L'] : (/^c\d{4}_/.test(col) ? 0 : ''))); });
      table.Ligne_OPE_2[table.id.indexOf(11)] = ['L', 2];
      window.__mockSetTable('Projets', table);
      installMeta({ extraProjectColumns: [{ id: 'Ligne_OPE_2', type: 'RefList:Lignes_OPE' }, { id: 'Ligne_OPE_installe_chez_2', type: 'RefList:Structures', isFormula: true }] });
      await window.CoreGrist.loadColumnDescriptions();
      await loadFixtureState();
      window.__TEST_CALLS__.length = 0;
    }

    it('l\'enregistrement répare la colonne affichée des colonnes d\'OPE déjà créées, avant d\'écrire le projet', async function () {
      await projectWithOpe2Unset();
      window.ProjectModal.open(projectRecord(11));
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertEqual(displays().length, 2);
      const first = window.__TEST_CALLS__.findIndex(call => call.type === 'SetDisplayFormula');
      const write = window.__TEST_CALLS__.findIndex(call => call.type === 'UpdateRecord' && call.table === 'Projets');
      assertTrue(first !== -1 && write !== -1 && first < write, 'réglé avant l\'écriture du projet');
      assertTrue(modalEl().classList.contains('cp-hidden'), 'projet enregistré');
    });

    it('un projet à une seule OPE ne touche pas aux métadonnées', async function () {
      await projectWithOpe2Unset();
      window.ProjectModal.open(projectRecord(10));
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertEqual(calls('SetDisplayFormula').length, 0);
    });

    it('Grist refuse de régler la colonne affichée : le projet est quand même enregistré', async function () {
      await projectWithOpe2Unset();
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async function (actions) {
        if (actions.some(action => action[0] === 'SetDisplayFormula')) throw new Error('Grist refuse (test)');
        return original.call(this, actions);
      };
      try {
        window.ProjectModal.open(projectRecord(11));
        await modalEl().querySelector('[data-cp-save]').onclick();
      } finally { window.grist.docApi.applyUserActions = original; }
      assertEqual(calls('UpdateRecord').filter(call => call.table === 'Projets').length, 1);
      assertTrue(modalEl().classList.contains('cp-hidden'));
    });
  });
})();
