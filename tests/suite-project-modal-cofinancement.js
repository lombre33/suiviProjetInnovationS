/**
 * Non-regression suite : volet « Co-financements » de l'onglet Budget de la modale projet (demande d'Antoine du
 * 17/11/2026). Trois colonnes de Projets ajoutées à la main dans Grist, au type libre : Part_Idex et
 * Part_recette_RNA_PREMAT_MAT (projet (co)financé par Idex / par une recette RNA Premat-mat), Commentaire_budget (texte).
 * Le champ s'adapte au type lu dans les métadonnées (_grist_Tables_column), sinon aux valeurs ; une colonne absente,
 * calculée ou d'un type non géré n'est jamais écrite (Grist refuserait tout l'enregistrement).
 * Les fixtures portent les trois colonnes en drapeaux (Part_Idex vrai et un commentaire pour le projet 11 seulement) ;
 * les métadonnées ne sont installées que par les tests qui en ont besoin (absentes par défaut : le type est alors deviné).
 */
(function () {
  'use strict';

  const modalEl = () => document.getElementById('cp-project-modal');
  const refInput = key => modalEl().querySelector(`[data-ref="${key}"]`);
  const voletEl = () => modalEl().querySelector('details.cp-cofin');
  const fieldEl = col => modalEl().querySelector(`[data-cofin="${col}"]`);
  const control = col => fieldEl(col).querySelector('input, select, textarea');
  const save = () => modalEl().querySelector('[data-cp-save]').onclick();
  const projectWrites = () => window.__TEST_CALLS__.filter(c => c.table === 'Projets' && (c.type === 'AddRecord' || c.type === 'UpdateRecord'));
  const COLS = ['Part_Idex', 'Part_recette_RNA_PREMAT_MAT', 'Commentaire_budget'];
  // Types des fixtures (drapeaux Oui/Non + commentaire) quand un test n'en précise pas d'autre.
  const DEFAULT_TYPES = { Part_Idex: 'Bool', Part_recette_RNA_PREMAT_MAT: 'Bool', Commentaire_budget: 'Text' };

  async function loadFixtureState() {
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    return tables;
  }
  const projectRecord = id => window.CoreState.getTable('Projets').find(project => project.id === id);

  // Modifie la table Projets du magasin du mock (colonnes de données, une valeur par ligne).
  async function editProjectsTable(mutate) {
    const table = await window.grist.docApi.fetchTable('Projets');
    mutate(table);
    window.__mockSetTable('Projets', table);
  }

  // Métadonnées de Projets fidèles à la table du mock ; `overrides` : {colId: {type, isFormula, formula, widgetOptions, description}}.
  async function installProjectMeta(overrides) {
    const table = await window.grist.docApi.fetchTable('Projets');
    const cols = { id: [], parentId: [], colId: [], type: [], isFormula: [], formula: [], widgetOptions: [], description: [] };
    Object.keys(table).filter(key => key !== 'id').forEach(colId => {
      const o = (overrides || {})[colId] || {};
      cols.id.push(cols.id.length + 1); cols.parentId.push(1); cols.colId.push(colId);
      cols.type.push(o.type || DEFAULT_TYPES[colId] || 'Text'); cols.isFormula.push(!!o.isFormula); cols.formula.push(o.formula || '');
      cols.widgetOptions.push(o.widgetOptions || ''); cols.description.push(o.description || '');
    });
    window.__mockSetTable('_grist_Tables', { id: [1], tableId: ['Projets'] });
    window.__mockSetTable('_grist_Tables_column', cols);
    await window.CoreGrist.loadColumnDescriptions();
  }

  async function openProject(id) {
    await loadFixtureState();
    return window.ProjectModal.open(projectRecord(id));
  }
  const setChecked = (col, checked) => { const box = control(col); box.checked = checked; fire(box, 'change'); };
  const typeIn = (col, value) => { const input = control(col); setValue(input, value); fire(input, 'input'); };

  describe('Modale Projet — volet Co-financements : placement et ouverture', function () {
    it('un volet « Co-financements » replié par défaut, dans l\'onglet Budget, sous le tableau budgétaire', async function () {
      await openProject(10);
      const volet = voletEl();
      assertTrue(!!volet, 'le volet existe');
      assertEqual(volet.closest('[data-cp-panel]').dataset.cpPanel, 'budget', 'il est dans l\'onglet Budget');
      assertFalse(volet.open, 'replié à l\'ouverture');
      assertEqual(volet.querySelector('summary').textContent.trim(), 'Co-financements');
      const table = modalEl().querySelector('.cp-fin');
      assertTrue(!!(table.compareDocumentPosition(volet) & Node.DOCUMENT_POSITION_FOLLOWING), 'après le tableau');
      assertEqual(COLS.filter(col => !!fieldEl(col)).length, 3, 'les trois champs sont dans le volet');
    });

    it('rouvrir la modale (même sur un autre projet) replie à nouveau le volet', async function () {
      await openProject(11);
      voletEl().open = true;
      window.ProjectModal.open(projectRecord(10));
      assertFalse(voletEl().open, 'replié de nouveau');
      voletEl().open = true;
      window.ProjectModal.open();
      assertFalse(voletEl().open, 'replié aussi en création');
    });

    it('le volet n\'ajoute rien au total budgétaire ni aux champs [data-fin]', async function () {
      await openProject(11);
      const before = modalEl().querySelector('[data-grand-total]').textContent;
      const finInputs = modalEl().querySelectorAll('[data-fin]').length;
      setChecked('Part_Idex', false);
      typeIn('Commentaire_budget', '123456');
      assertEqual(modalEl().querySelector('[data-grand-total]').textContent, before, 'total inchangé');
      assertEqual(modalEl().querySelectorAll('[data-fin]').length, finInputs, 'aucun champ [data-fin] de plus');
      assertEqual(modalEl().querySelectorAll('[data-fin]').length, 12, 'les douze montants du budget restent seuls');
    });
  });

  describe('Modale Projet — volet Co-financements : bulles d\'aide', function () {
    it('chaque champ dont la colonne a une Description porte l\'icône « ? » ; aucune sans Description', async function () {
      await installProjectMeta({
        Part_Idex: { type: 'Bool', description: 'Projet (co)financé par Idex.' },
        Part_recette_RNA_PREMAT_MAT: { type: 'Bool', description: 'Projet (co)financé par une recette RNA Premat-mat.' },
        Commentaire_budget: { type: 'Text', description: 'Précisions sur le co-financement.' }
      });
      await openProject(10);
      COLS.forEach(col => {
        const icon = fieldEl(col).querySelector('.help-icon');
        assertTrue(!!icon, `icône d'aide attendue pour ${col}`);
      });
      assertEqual(fieldEl('Part_Idex').querySelector('.help-icon').dataset.helpText, 'Projet (co)financé par Idex.');
      assertEqual(fieldEl('Commentaire_budget').querySelector('.help-icon').dataset.helpText, 'Précisions sur le co-financement.');
    });

    it('sans Description dans Grist, aucune icône', async function () {
      await openProject(10);
      assertEqual(voletEl().querySelectorAll('.help-icon').length, 0);
    });
  });

  describe('Modale Projet — volet Co-financements : champ selon le type de la colonne', function () {
    it('colonne Bool : interrupteur Oui/Non reprenant la valeur de Grist, écrit tel quel à l\'enregistrement', async function () {
      await installProjectMeta({ Part_Idex: { type: 'Bool' }, Part_recette_RNA_PREMAT_MAT: { type: 'Bool' }, Commentaire_budget: { type: 'Text' } });
      await openProject(11);
      assertEqual(control('Part_Idex').type, 'checkbox');
      assertTrue(control('Part_Idex').checked, 'projet 11 : Idex coché');
      assertEqual(fieldEl('Part_Idex').querySelector('.cp-cofin-state').textContent, 'Oui');
      assertFalse(control('Part_recette_RNA_PREMAT_MAT').checked);
      assertEqual(fieldEl('Part_recette_RNA_PREMAT_MAT').querySelector('.cp-cofin-state').textContent, 'Non');
      setChecked('Part_recette_RNA_PREMAT_MAT', true);
      assertEqual(fieldEl('Part_recette_RNA_PREMAT_MAT').querySelector('.cp-cofin-state').textContent, 'Oui');
      await save();
      const fields = projectWrites()[0].fields;
      assertEqual(fields.Part_Idex, true);
      assertEqual(fields.Part_recette_RNA_PREMAT_MAT, true);
      assertEqual(fields.Commentaire_budget, 'Co-financé à 50 % par Idex');
    });

    it('colonne Numeric : montant saisi (chiffres et un point seulement), écrit en nombre ; vide = 0', async function () {
      await editProjectsTable(table => { table.Part_Idex = [0, 2500.5, 0, 0, 0, 0, 0]; table.Part_recette_RNA_PREMAT_MAT = [0, 0, 0, 0, 0, 0, 0]; });
      await installProjectMeta({ Part_Idex: { type: 'Numeric' }, Part_recette_RNA_PREMAT_MAT: { type: 'Numeric' } });
      await openProject(11);
      assertEqual(control('Part_Idex').type, 'text');
      assertEqual(control('Part_Idex').value, '2500.5');
      typeIn('Part_Idex', '12x5.5.5');
      assertEqual(control('Part_Idex').value, '125.55', 'lettres et second point retirés');
      typeIn('Part_recette_RNA_PREMAT_MAT', '');
      await save();
      const fields = projectWrites()[0].fields;
      assertEqual(fields.Part_Idex, 125.55);
      assertEqual(fields.Part_recette_RNA_PREMAT_MAT, 0);
    });

    it('colonne Choice : liste de choix de Grist, valeur déjà enregistrée hors liste conservée', async function () {
      await editProjectsTable(table => { table.Part_Idex = ['Oui', 'Ancienne valeur', '', '', '', '', '']; });
      await installProjectMeta({ Part_Idex: { type: 'Choice', widgetOptions: JSON.stringify({ choices: ['Oui', 'Non', 'Partiel'] }) } });
      await openProject(11);
      const select = control('Part_Idex');
      assertEqual(select.tagName, 'SELECT');
      assertDeepEqual(Array.from(select.options).map(o => o.value), ['', 'Oui', 'Non', 'Partiel', 'Ancienne valeur']);
      assertEqual(select.value, 'Ancienne valeur', 'la valeur hors liste reste sélectionnée');
      await save();
      assertEqual(projectWrites()[0].fields.Part_Idex, 'Ancienne valeur', 'elle n\'est pas effacée à l\'enregistrement');
    });

    it('colonne Text : champ texte (zone de texte pour le commentaire), valeur nettoyée des espaces en bout', async function () {
      await installProjectMeta({ Part_Idex: { type: 'Text' }, Commentaire_budget: { type: 'Text' } });
      await editProjectsTable(table => { table.Part_Idex = ['', 'Idex 50 %', '', '', '', '', '']; });
      await openProject(11);
      assertEqual(control('Part_Idex').tagName, 'INPUT');
      assertEqual(control('Part_Idex').value, 'Idex 50 %');
      assertEqual(control('Commentaire_budget').tagName, 'TEXTAREA');
      typeIn('Commentaire_budget', '  Voir convention Idex  ');
      await save();
      assertEqual(projectWrites()[0].fields.Commentaire_budget, 'Voir convention Idex');
    });

    it('sans métadonnées lisibles, le type est deviné d\'après les valeurs (drapeaux : interrupteur)', async function () {
      await openProject(11);
      assertEqual(window.CoreGrist.columnTypes('Projets'), null, 'aucune métadonnée dans ce test');
      assertEqual(control('Part_Idex').type, 'checkbox');
      assertTrue(control('Part_Idex').checked);
      assertEqual(control('Commentaire_budget').tagName, 'TEXTAREA');
      assertEqual(control('Commentaire_budget').value, 'Co-financé à 50 % par Idex');
      await save();
      assertEqual(projectWrites()[0].fields.Part_Idex, true);
    });

    it('sans métadonnées, des montants dans la colonne donnent un champ numérique', async function () {
      await editProjectsTable(table => { table.Part_Idex = [0, 4000, 0, 0, 0, 0, 0]; });
      await openProject(11);
      assertEqual(control('Part_Idex').type, 'text');
      assertEqual(control('Part_Idex').value, '4000');
      await save();
      assertEqual(projectWrites()[0].fields.Part_Idex, 4000);
    });
  });

  describe('Modale Projet — volet Co-financements : colonne absente, calculée, non gérée ou sans type fixé', function () {
    it('une colonne absente : le champ le dit, rien n\'est écrit pour elle, l\'enregistrement aboutit', async function () {
      await editProjectsTable(table => { delete table.Part_recette_RNA_PREMAT_MAT; });
      await installProjectMeta({ Part_Idex: { type: 'Bool' } });
      await openProject(11);
      assertFalse(voletEl().classList.contains('cp-hidden'), 'le volet reste (deux colonnes sur trois existent)');
      assertEqual(fieldEl('Part_recette_RNA_PREMAT_MAT').querySelectorAll('input, select, textarea').length, 0, 'aucune saisie possible');
      assertIncludes(fieldEl('Part_recette_RNA_PREMAT_MAT').textContent, 'absente de la table Projets');
      await save();
      const fields = projectWrites()[0].fields;
      assertFalse('Part_recette_RNA_PREMAT_MAT' in fields, 'colonne absente jamais écrite');
      assertEqual(fields.Part_Idex, true);
      assertEqual(modalEl().querySelector('#cp-project-error').textContent, '', 'aucune erreur');
      assertTrue(modalEl().classList.contains('cp-hidden'), 'la modale s\'est fermée après l\'enregistrement');
    });

    it('colonne absente repérée aussi sans métadonnées (d\'après les lignes de Projets)', async function () {
      await editProjectsTable(table => { delete table.Commentaire_budget; });
      await openProject(11);
      assertEqual(window.CoreGrist.knownColumns('Projets'), null, 'schéma illisible dans ce test');
      assertIncludes(fieldEl('Commentaire_budget').textContent, 'absente');
      await save();
      assertFalse('Commentaire_budget' in projectWrites()[0].fields);
    });

    it('aucune des trois colonnes : le volet disparaît, la modale s\'enregistre comme avant', async function () {
      await editProjectsTable(table => COLS.forEach(col => { delete table[col]; }));
      await installProjectMeta();
      await openProject(11);
      assertTrue(voletEl().classList.contains('cp-hidden'), 'volet masqué');
      await save();
      const fields = projectWrites()[0].fields;
      COLS.forEach(col => assertFalse(col in fields, `${col} jamais écrite`));
    });

    it('création sans les colonnes : rien d\'écrit pour elles non plus', async function () {
      await editProjectsTable(table => COLS.forEach(col => { delete table[col]; }));
      await installProjectMeta();
      await loadFixtureState();
      window.ProjectModal.open();
      assertTrue(voletEl().classList.contains('cp-hidden'), 'volet masqué en création aussi');
      assertEqual(voletEl().querySelectorAll('input, select, textarea').length, 0, 'aucune saisie');
    });

    it('colonne calculée (formule) : affichée en lecture seule, jamais écrite', async function () {
      await installProjectMeta({ Part_Idex: { type: 'Bool', isFormula: true, formula: '$Acronyme == "NOTIFY"' } });
      await openProject(11);
      const input = control('Part_Idex');
      assertTrue(input.readOnly, 'lecture seule');
      assertIncludes(fieldEl('Part_Idex').textContent, 'calculée');
      await save();
      assertFalse('Part_Idex' in projectWrites()[0].fields, 'colonne formule jamais écrite');
    });

    it('colonne « vide » d\'un Grist neuf (formule vide, type Any) : pas une colonne calculée', async function () {
      await installProjectMeta({ Part_Idex: { type: 'Any', isFormula: true, formula: '' } });
      assertFalse(window.CoreGrist.isFormulaColumn('Projets', 'Part_Idex'));
      await openProject(11);
      assertFalse(control('Part_Idex').readOnly);
    });

    it('type non géré (Date) : lecture seule, jamais écrite', async function () {
      await installProjectMeta({ Commentaire_budget: { type: 'Date' } });
      await openProject(11);
      assertTrue(control('Commentaire_budget').readOnly);
      assertIncludes(fieldEl('Commentaire_budget').textContent, 'non géré');
      await save();
      assertFalse('Commentaire_budget' in projectWrites()[0].fields);
    });

    it('type non fixé (colonne Any encore vide) : rien n\'est écrit tant que le champ n\'est pas touché, puis la saisie part', async function () {
      await editProjectsTable(table => { table.Part_Idex = new Array(7).fill(null); table.Commentaire_budget = new Array(7).fill(null); });
      await installProjectMeta({ Part_Idex: { type: 'Any', isFormula: true }, Commentaire_budget: { type: 'Any', isFormula: true } });
      await openProject(11);
      assertEqual(control('Part_Idex').type, 'checkbox', 'interrupteur par défaut');
      await save();
      let fields = projectWrites()[0].fields;
      assertFalse('Part_Idex' in fields, 'colonne encore vide laissée telle quelle');
      assertFalse('Commentaire_budget' in fields);

      window.__TEST_CALLS__.length = 0;
      await loadFixtureState();
      window.ProjectModal.open(projectRecord(11));
      setChecked('Part_Idex', true);
      typeIn('Commentaire_budget', 'Voir Idex');
      await save();
      fields = projectWrites()[0].fields;
      assertEqual(fields.Part_Idex, true, 'écrite une fois touchée');
      assertEqual(fields.Commentaire_budget, 'Voir Idex');
      assertEqual(fields.Part_recette_RNA_PREMAT_MAT, false, 'l\'autre drapeau (type connu) garde sa valeur');
    });

    it('valeur que le champ ne sait pas afficher (texte dans une colonne numérique) : conservée tant qu\'on n\'y touche pas', async function () {
      await editProjectsTable(table => { table.Part_Idex = [0, 'à confirmer', 0, 0, 0, 0, 0]; });
      await installProjectMeta({ Part_Idex: { type: 'Numeric' } });
      await openProject(11);
      assertEqual(control('Part_Idex').value, '', 'affichée vide');
      await save();
      assertFalse('Part_Idex' in projectWrites()[0].fields, 'non réécrite à 0');
      window.__TEST_CALLS__.length = 0;
      await loadFixtureState();
      window.ProjectModal.open(projectRecord(11));
      typeIn('Part_Idex', '300');
      await save();
      assertEqual(projectWrites()[0].fields.Part_Idex, 300);
    });
  });

  describe('Modale Projet — volet Co-financements : résumé du volet replié et création', function () {
    const summary = () => voletEl().querySelector('[data-cp-cofin-sum]').textContent;

    it('le résumé, visible volet replié, nomme les co-financements renseignés et suit les modifications', async function () {
      await openProject(11);
      assertEqual(summary(), 'Idex · commentaire');
      setChecked('Part_recette_RNA_PREMAT_MAT', true);
      assertEqual(summary(), 'Idex · Recette RNA Premat-mat · commentaire');
      setChecked('Part_Idex', false);
      typeIn('Commentaire_budget', '');
      assertEqual(summary(), 'Recette RNA Premat-mat');
    });

    it('un projet sans co-financement n\'affiche aucun résumé ; en montants, le résumé donne la somme en euros', async function () {
      await openProject(10);
      assertEqual(summary(), '');
      await editProjectsTable(table => { table.Part_Idex = [0, 4000, 0, 0, 0, 0, 0]; });
      await installProjectMeta({ Part_Idex: { type: 'Numeric' } });
      await openProject(11);
      assertIncludes(summary(), 'Idex');
      assertIncludes(summary().replace(/\s/g, ''), '4000');
    });

    it('création : les co-financements saisis partent dans l\'AddRecord', async function () {
      await installProjectMeta({ Part_Idex: { type: 'Bool' }, Part_recette_RNA_PREMAT_MAT: { type: 'Bool' }, Commentaire_budget: { type: 'Text' } });
      await loadFixtureState();
      window.ProjectModal.open();
      const pick = (key, query, matchText) => {
        const input = refInput(key);
        setValue(input, query); fire(input, 'input');
        const button = Array.from(input.parentElement.querySelector('.cp-ref-list').querySelectorAll('button')).find(b => b.textContent === matchText);
        assertTrue(!!button, `aucune option "${matchText}" pour ${key}`);
        button.click();
      };
      pick('Programme', 'Programme A', 'Programme A');
      setValue(modalEl().querySelector('#cp-Projet'), 'Projet co-financé');
      setValue(modalEl().querySelector('#cp-Acronyme'), 'COFIN');
      pick('Porteur_1', 'Alice', 'Alice Martin');
      pick('VP_porteur_signataire_notif', 'Bob', 'Bob Durand');
      pick('Accompagnateur', 'Bob', 'Bob Durand');
      pick('Instance_ratachee', 'Comité', 'Comité innovation#3 - 2026-03-15');
      setValue(modalEl().querySelector('#cp-Date_limite_financement'), '2027-01-15');
      modalEl().querySelector('.cp-chip-row [data-value="Creation de ligne"]').click();
      const fin = modalEl().querySelector('[data-fin="c2026_M10_Fonctionnement"]');
      setValue(fin, '1000'); fire(fin, 'input');
      setChecked('Part_Idex', true);
      typeIn('Commentaire_budget', 'Idex : 400 € sur 2026');
      await save();
      const add = projectWrites().find(c => c.type === 'AddRecord');
      assertTrue(!!add, 'le projet est créé');
      assertEqual(add.fields.Part_Idex, true);
      assertEqual(add.fields.Part_recette_RNA_PREMAT_MAT, false);
      assertEqual(add.fields.Commentaire_budget, 'Idex : 400 € sur 2026');
    });

    it('le volet ne bloque jamais la validation : un enregistrement refusé par Grist laisse la saisie intacte', async function () {
      await openProject(11);
      typeIn('Commentaire_budget', 'Note à garder');
      const api = window.grist.docApi, original = api.applyUserActions;
      api.applyUserActions = async () => { throw new Error('refusé par Grist'); };
      try { await save(); } finally { api.applyUserActions = original; }
      assertIncludes(modalEl().querySelector('#cp-project-error').textContent, 'refusé par Grist');
      assertEqual(control('Commentaire_budget').value, 'Note à garder');
    });
  });

  describe('CoreGrist — colonnes calculées et choix lus dans les métadonnées', function () {
    it('isFormulaColumn : vrai pour une formule, faux pour une colonne de données, une colonne vide ou sans métadonnées', async function () {
      assertFalse(window.CoreGrist.isFormulaColumn('Projets', 'Part_Idex'), 'sans métadonnées');
      await installProjectMeta({
        Part_Idex: { type: 'Bool', isFormula: true, formula: '$Acronyme' },
        Part_recette_RNA_PREMAT_MAT: { type: 'Any', isFormula: true, formula: '' },
        Commentaire_budget: { type: 'Text' }
      });
      assertTrue(window.CoreGrist.isFormulaColumn('Projets', 'Part_Idex'));
      assertFalse(window.CoreGrist.isFormulaColumn('Projets', 'Part_recette_RNA_PREMAT_MAT'));
      assertFalse(window.CoreGrist.isFormulaColumn('Projets', 'Commentaire_budget'));
      assertFalse(window.CoreGrist.isFormulaColumn('Table_inconnue', 'X'));
    });

    it('columnChoices : liste des choix d\'une colonne Choice, vide quand inconnue, sans choix ou illisible', async function () {
      assertDeepEqual(window.CoreGrist.columnChoices('Projets', 'Part_Idex'), [], 'sans métadonnées');
      await installProjectMeta({
        Part_Idex: { type: 'Choice', widgetOptions: JSON.stringify({ choices: ['Oui', 'Non'], choiceOptions: {} }) },
        Part_recette_RNA_PREMAT_MAT: { type: 'Choice', widgetOptions: '{pas du json' },
        Commentaire_budget: { type: 'Choice', widgetOptions: '' }
      });
      assertDeepEqual(window.CoreGrist.columnChoices('Projets', 'Part_Idex'), ['Oui', 'Non']);
      assertDeepEqual(window.CoreGrist.columnChoices('Projets', 'Part_recette_RNA_PREMAT_MAT'), []);
      assertDeepEqual(window.CoreGrist.columnChoices('Projets', 'Commentaire_budget'), []);
    });
  });
}());
