/**
 * Non-regression suite : bailleur de chaque OPE (demande d'Antoine du 26/11/2026, onglet « Budget et OPE » de la modale projet).
 *
 * Un champ « Bailleur » dans chaque carte OPE : InnovationS (par défaut) ou Idex. Aucune colonne existante n'y convenait (`Financeur` n'existe que dans le
 * journal d'import UB Invest, `Part_Idex` est une case au niveau du projet) : colonne Choice `Bailleur` (OPE 1), `Bailleur_2/_3/_4`, créées par le widget
 * à l'enregistrement avec leur bulle d'aide. Le bailleur d'une colonne absente et impossible à créer n'est jamais écrit (Grist refuserait tout l'enregistrement).
 */
(function () {
  'use strict';

  const O = () => window.CoreOpes;
  const modalEl = () => document.getElementById('cp-project-modal');
  const card = rank => modalEl().querySelector(`.cp-ope[data-ope-rank="${rank}"]`);
  const refInput = key => modalEl().querySelector(`[data-ref="${key}"]`);
  const calls = type => window.__TEST_CALLS__.filter(call => call.type === type);
  const toastEl = () => document.getElementById('toast');
  const chips = rank => Array.from(card(rank).querySelectorAll('.cp-field:has(#cp-Bailleur' + (rank > 1 ? '_' + rank : '') + ') .cp-chip'));
  const activeChip = rank => (chips(rank).find(button => button.classList.contains('active')) || {}).textContent;
  const chip = (rank, value) => chips(rank).find(button => button.dataset.value === value);
  const select = rank => modalEl().querySelector('#cp-Bailleur' + (rank > 1 ? '_' + rank : ''));
  const projectRecord = id => window.CoreState.getTable('Projets').find(p => p.id === id);

  function pickRef(key, query, matchText) {
    const input = refInput(key);
    setValue(input, query);
    fire(input, 'input');
    const button = Array.from(input.parentElement.querySelector('.cp-ref-list').querySelectorAll('button')).find(b => b.textContent === matchText);
    assertTrue(!!button, `aucune option "${matchText}" pour ${key}`);
    button.click();
  }
  async function loadFixtureState() {
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    return tables;
  }
  const setFin = (column, value) => {
    const input = modalEl().querySelector(`[data-fin="${column}"]`);
    assertTrue(!!input, `champ de montant ${column} introuvable`);
    setValue(input, String(value));
    fire(input, 'input');
  };
  async function fillMinimalValidProject() {
    window.ProjectModal.open();
    pickRef('Programme', 'Programme A', 'Programme A');
    setValue(modalEl().querySelector('#cp-Projet'), 'Mon nouveau projet');
    setValue(modalEl().querySelector('#cp-Acronyme'), 'MNP');
    pickRef('Porteur_1', 'Alice', 'Alice Martin');
    pickRef('VP_porteur_signataire_notif', 'Bob', 'Bob Durand');
    pickRef('Accompagnateur', 'Bob', 'Bob Durand');
    pickRef('Instance_ratachee', 'Comité', 'Comité innovation#3 - 2026-03-15');
    setValue(modalEl().querySelector('#cp-Date_limite_financement'), '2027-01-15');
    card(1).querySelector('.cp-chip-row [data-value="Creation de ligne"]').click();
    setFin('c2026_M10_Fonctionnement', '1000');
  }
  // Retire une colonne de Projets du magasin du mock (un Grist où le widget ne l'a pas encore créée).
  async function dropColumns(...columns) {
    const table = await window.grist.docApi.fetchTable('Projets');
    columns.forEach(col => { delete table[col]; });
    window.__mockSetTable('Projets', table);
  }
  // Ajoute à Projets les colonnes des OPE 2 à `upTo` (comme après un premier enregistrement), sauf celles de `except`.
  async function giveProjectOpes(id, upTo, values, except) {
    const table = await window.grist.docApi.fetchTable('Projets');
    const at = table.id.indexOf(id);
    for (let rank = 2; rank <= upTo; rank += 1) {
      O().createdColumnsOf(rank).filter(col => !(except || []).includes(col)).forEach(col => { table[col] = table.id.map(() => (col.startsWith('Ligne_OPE') ? ['L'] : (/^c\d{4}_/.test(col) ? 0 : ''))); });
    }
    Object.entries(values || {}).forEach(([col, value]) => { table[col][at] = value; });
    window.__mockSetTable('Projets', table);
  }

  // ===========================================================================================================
  describe('Bailleur de l\'OPE — CoreOpes : colonnes Choice créées par le widget', function () {
    it('Bailleur (OPE 1), Bailleur_2 à _4 ; InnovationS par défaut, Idex en second', function () {
      assertDeepEqual([1, 2, 3, 4].map(rank => O().bailleurColumn(rank)), ['Bailleur', 'Bailleur_2', 'Bailleur_3', 'Bailleur_4']);
      assertDeepEqual(O().BAILLEURS.slice(), ['InnovationS', 'Idex']);
      assertEqual(O().DEFAULT_BAILLEUR, 'InnovationS');
      assertEqual(O().baseColumn('Bailleur_3'), 'Bailleur', 'la bulle d\'aide de l\'OPE 1 sert aux autres');
    });

    it('la colonne de l\'OPE 1 est de type Choice, avec la liste des bailleurs et une bulle d\'aide', function () {
      const def = O().bailleurDefinition();
      assertEqual(def.id, 'Bailleur');
      assertEqual(def.type, 'Choice');
      assertEqual(def.isFormula, false);
      assertDeepEqual(JSON.parse(def.widgetOptions).choices, ['InnovationS', 'Idex']);
      assertIncludes(def.description, 'InnovationS');
    });

    it('les colonnes des OPE 2 à 4 : Choice avec la même liste ; bulle reprise de l\'OPE 1, sinon celle du widget', function () {
      const fromOpe1 = O().columnDefinitions(2, col => (col === 'Bailleur' ? 'Qui finance l\'OPE ?' : '')).find(def => def.id === 'Bailleur_2');
      assertEqual(fromOpe1.type, 'Choice');
      assertDeepEqual(JSON.parse(fromOpe1.widgetOptions).choices, ['InnovationS', 'Idex']);
      assertEqual(fromOpe1.description, 'Qui finance l\'OPE ?');
      const fallback = O().columnDefinitions(4, () => '').find(def => def.id === 'Bailleur_4');
      assertIncludes(fallback.description, 'InnovationS');
    });

    it('missingBailleurColumn : la colonne de l\'OPE 1 seulement si elle manque ; les autres passent par missingColumns', function () {
      assertEqual(O().missingBailleurColumn(new Set()).length, 1);
      assertEqual(O().missingBailleurColumn(new Set(['Bailleur'])).length, 0);
      assertTrue(O().missingColumns(new Set(), 2).some(def => def.id === 'Bailleur_2'));
      assertTrue(!O().missingColumns(new Set(), 3).some(def => def.id === 'Bailleur'), 'jamais la colonne de l\'OPE 1');
    });

    it('read lit le bailleur de l\'OPE ; une colonne absente donne un texte vide (le défaut s\'applique à l\'affichage)', function () {
      assertEqual(O().read({ Bailleur: 'Idex', Bailleur_2: 'InnovationS' }, 1).bailleur, 'Idex');
      assertEqual(O().read({ Bailleur: 'Idex', Bailleur_2: 'InnovationS' }, 2).bailleur, 'InnovationS');
      assertEqual(O().read({}, 3).bailleur, '');
    });

    it('un bailleur seul ne fait pas une OPE : l\'OPE ajoutée et laissée vide n\'est toujours pas enregistrée', function () {
      assertEqual(O().hasData(O().read({ Bailleur_2: 'Idex' }, 2)), false);
    });
  });

  // ===========================================================================================================
  describe('Bailleur de l\'OPE — la modale projet', function () {
    it('chaque carte OPE a un champ Bailleur : puces InnovationS / Idex, InnovationS choisi par défaut', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      assertEqual(chips(1).length, 2);
      assertDeepEqual(chips(1).map(button => button.textContent), ['InnovationS', 'Idex']);
      assertEqual(activeChip(1), 'InnovationS');
      modalEl().querySelector('[data-ope-add]').click();
      assertEqual(activeChip(2), 'InnovationS', 'une OPE ajoutée repart de InnovationS');
    });

    it('le champ porte une bulle d\'aide, même avant que Grist décrive la colonne', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      const label = card(1).querySelector('label[for="cp-Bailleur"]');
      assertTrue(!!label, 'libellé Bailleur');
      const icon = label.nextElementSibling;
      assertTrue(icon && icon.classList.contains('help-icon'), 'bulle d\'aide');
      assertIncludes(icon.dataset.helpText, 'InnovationS');
    });

    it('un clic sur Idex le choisit, un clic sur InnovationS revient ; une valeur reste toujours choisie', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      chip(1, 'Idex').click();
      assertEqual(activeChip(1), 'Idex');
      assertEqual(select(1).value, 'Idex');
      chip(1, 'Idex').click();
      assertEqual(activeChip(1), 'Idex', 'recliquer ne vide pas le champ');
      chip(1, 'InnovationS').click();
      assertEqual(activeChip(1), 'InnovationS');
    });

    it('à l\'ouverture d\'un projet : le bailleur enregistré est choisi, une colonne vide donne InnovationS', async function () {
      const table = await window.grist.docApi.fetchTable('Projets');
      table.Bailleur[table.id.indexOf(11)] = 'Idex';
      window.__mockSetTable('Projets', table);
      await loadFixtureState();
      window.ProjectModal.open(projectRecord(11));
      assertEqual(activeChip(1), 'Idex');
      window.ProjectModal.open(projectRecord(10));
      assertEqual(activeChip(1), 'InnovationS', 'bailleur vide : InnovationS par défaut');
    });

    it('un bailleur hors de la liste (ex. « ANR ») est gardé : puce supplémentaire, réécrit tel quel', async function () {
      const table = await window.grist.docApi.fetchTable('Projets');
      table.Bailleur[table.id.indexOf(11)] = 'ANR';
      window.__mockSetTable('Projets', table);
      await loadFixtureState();
      window.ProjectModal.open(projectRecord(11));
      assertEqual(activeChip(1), 'ANR');
      assertDeepEqual(chips(1).map(button => button.textContent), ['InnovationS', 'Idex', 'ANR']);
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertEqual(calls('UpdateRecord').filter(call => call.table === 'Projets')[0].fields.Bailleur, 'ANR');
    });

    it('la création enregistre InnovationS par défaut, ou le bailleur choisi', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertEqual(calls('AddRecord').filter(call => call.table === 'Projets')[0].fields.Bailleur, 'InnovationS');
      window.__resetMockGrist();
      await loadFixtureState();
      await fillMinimalValidProject();
      chip(1, 'Idex').click();
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertEqual(calls('AddRecord').filter(call => call.table === 'Projets')[0].fields.Bailleur, 'Idex');
    });

    it('deux OPE : chacune son bailleur (Bailleur, Bailleur_2), colonne de l\'OPE 2 créée avec le bon type', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      modalEl().querySelector('[data-ope-add]').click();
      pickRef('Ligne_OPE_2', 'OPE-2026-002', 'OPE-2026-002');
      setFin('c2026_M10_Fonctionnement_2', 500);
      chip(2, 'Idex').click();
      await modalEl().querySelector('[data-cp-save]').onclick();
      const added = calls('AddColumn').find(call => call.colId === 'Bailleur_2');
      assertTrue(!!added, 'Bailleur_2 créée');
      assertEqual(added.colInfo.type, 'Choice');
      assertDeepEqual(JSON.parse(added.colInfo.widgetOptions).choices, ['InnovationS', 'Idex']);
      const fields = calls('AddRecord').filter(call => call.table === 'Projets')[0].fields;
      assertEqual(fields.Bailleur, 'InnovationS');
      assertEqual(fields.Bailleur_2, 'Idex');
    });

    it('un projet à deux OPE rouvert : chaque carte reprend son bailleur', async function () {
      await loadFixtureState();
      await giveProjectOpes(11, 2, { Bailleur: 'InnovationS', Bailleur_2: 'Idex', Ligne_OPE_2: ['L', 2] });
      await loadFixtureState();
      window.ProjectModal.open(projectRecord(11));
      assertEqual(activeChip(1), 'InnovationS');
      assertEqual(activeChip(2), 'Idex');
    });

    it('retirer l\'OPE 2 : l\'OPE 3 remonte avec SON bailleur', async function () {
      await loadFixtureState();
      await giveProjectOpes(11, 3, { Ligne_OPE_2: ['L', 2], Ligne_OPE_3: ['L', 3], Bailleur_2: 'InnovationS', Bailleur_3: 'Idex' });
      await loadFixtureState();
      window.ProjectModal.open(projectRecord(11));
      assertEqual(activeChip(3), 'Idex');
      card(2).querySelector('.cp-ope-del').click();
      card(2).querySelector('[data-ope-confirm-go]').click();
      assertEqual(card(3), null, 'il ne reste que deux cartes');
      assertEqual(activeChip(2), 'Idex', 'l\'ancienne OPE 3 est devenue l\'OPE 2');
    });

    it('OPE retirée : son bailleur est vidé dans Grist avec le reste de ses colonnes', async function () {
      await loadFixtureState();
      await giveProjectOpes(11, 2, { Ligne_OPE_2: ['L', 2], Bailleur_2: 'Idex' });
      await loadFixtureState();
      window.ProjectModal.open(projectRecord(11));
      card(2).querySelector('.cp-ope-del').click();
      card(2).querySelector('[data-ope-confirm-go]').click();
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertEqual(calls('UpdateRecord').filter(call => call.table === 'Projets')[0].fields.Bailleur_2, '');
    });

    it('colonnes de l\'OPE 2 créées avant le bailleur : seules « Ligne_OPE_installe_chez_2 » et « Bailleur_2 » s\'ajoutent', async function () {
      await loadFixtureState();
      await giveProjectOpes(11, 2, { Ligne_OPE_2: ['L', 2] }, ['Ligne_OPE_installe_chez_2', 'Bailleur_2']);
      await loadFixtureState();
      window.ProjectModal.open(projectRecord(11));
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertDeepEqual(calls('AddColumn').map(call => call.colId).sort(), ['Bailleur_2', 'Ligne_OPE_installe_chez_2']);
    });
  });

  // ===========================================================================================================
  describe('Bailleur de l\'OPE — la colonne de l\'OPE 1 créée à l\'enregistrement', function () {
    it('colonne absente : créée (Choice, liste, bulle) AVANT l\'écriture du projet, puis le bailleur est écrit', async function () {
      await dropColumns('Bailleur');
      await loadFixtureState();
      window.ProjectModal.open(projectRecord(11));
      chip(1, 'Idex').click();
      await modalEl().querySelector('[data-cp-save]').onclick();
      const order = window.__TEST_CALLS__.map(call => call.type);
      const added = calls('AddColumn').filter(call => call.colId === 'Bailleur');
      assertEqual(added.length, 1);
      assertEqual(added[0].table, 'Projets');
      assertEqual(added[0].colInfo.type, 'Choice');
      assertEqual(added[0].colInfo.isFormula, false);
      assertDeepEqual(JSON.parse(added[0].colInfo.widgetOptions).choices, ['InnovationS', 'Idex']);
      assertTrue(order.indexOf('AddColumn') < order.indexOf('UpdateRecord'), 'colonne créée avant l\'écriture');
      assertEqual(calls('UpdateRecord').filter(call => call.table === 'Projets')[0].fields.Bailleur, 'Idex');
    });

    it('jamais recréée : un second enregistrement ne crée plus rien', async function () {
      await dropColumns('Bailleur');
      await loadFixtureState();
      window.ProjectModal.open(projectRecord(11));
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertEqual(calls('AddColumn').filter(call => call.colId === 'Bailleur').length, 1);
      await loadFixtureState();
      window.ProjectModal.open(projectRecord(11));
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertEqual(calls('AddColumn').filter(call => call.colId === 'Bailleur').length, 1, 'une seule création');
    });

    it('colonne déjà là : aucune création', async function () {
      await loadFixtureState();
      window.ProjectModal.open(projectRecord(11));
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertEqual(calls('AddColumn').length, 0);
    });

    it('droit de structure refusé : le projet est quand même enregistré, sans bailleur, et l\'utilisateur est prévenu une seule fois', async function () {
      await dropColumns('Bailleur');
      await loadFixtureState();
      const original = window.CoreGrist.ensureColumns;
      window.CoreGrist.ensureColumns = async () => { throw new Error('droits insuffisants (test)'); };
      try {
        window.ProjectModal.open(projectRecord(11));
        await modalEl().querySelector('[data-cp-save]').onclick();
        const update = calls('UpdateRecord').filter(call => call.table === 'Projets')[0];
        assertTrue(!!update, 'le projet est enregistré');
        assertTrue(!('Bailleur' in update.fields), 'jamais écrit sans colonne : Grist refuserait tout l\'enregistrement');
        assertEqual(modalEl().querySelector('#cp-project-error').textContent, '', 'aucune erreur bloquante');
        assertIncludes(toastEl().textContent, 'Bailleur');
        toastEl().textContent = '';
        await loadFixtureState();
        window.ProjectModal.open(projectRecord(11));
        await modalEl().querySelector('[data-cp-save]').onclick();
        assertEqual(toastEl().textContent.indexOf('Colonne Bailleur'), -1, 'prévenu une seule fois par session');
      } finally { window.CoreGrist.ensureColumns = original; }
    });
  });
}());
