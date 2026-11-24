/**
 * Non-regression suite: création d'une ligne OPE à la volée (js/components/ope-modal.js),
 * depuis le champ "Ligne OPE" de l'onglet Budget et OPE de la modale Projet (carte de chaque OPE) — même patron
 * que le "+ Créer" du champ Porteur (person-modal.js), mais table Lignes_OPE.
 */
(function () {
  'use strict';

  async function loadFixtureState() {
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    return tables;
  }

  function projectModalEl() { return document.getElementById('cp-project-modal'); }
  function ligneOpeInput() { return projectModalEl().querySelector('[data-ref="Ligne_OPE"]'); }
  function opeModalEl() { return document.getElementById('cp-ope-modal'); }

  describe('Modale Projet — champ Ligne OPE : création à la volée d\'une ligne OPE', function () {
    it('propose "+ Créer la ligne OPE" quand aucune ligne existante ne correspond', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      const input = ligneOpeInput();
      setValue(input, 'OPE-2026-999');
      fire(input, 'input');
      const list = input.parentElement.querySelector('.cp-ref-list');
      const createBtn = list.querySelector('[data-create-ope]');
      assertTrue(!!createBtn, 'un bouton "+ Créer la ligne OPE" doit apparaître quand aucune ligne OPE ne correspond');
      assertEqual(createBtn.dataset.createOpe, 'OPE-2026-999');
    });

    it('n\'empêche pas de choisir une ligne OPE existante (pas de bouton de création si ça matche)', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      const input = ligneOpeInput();
      setValue(input, 'OPE-2026-001');
      fire(input, 'input');
      const list = input.parentElement.querySelector('.cp-ref-list');
      assertTrue(!list.querySelector('[data-create-ope]'), 'pas de bouton de création quand une ligne OPE correspond déjà');
      assertTrue(!!list.querySelector('button[data-id]'), 'la ligne existante doit rester proposée');
    });

    it('crée la ligne OPE (N_OPE + installé chez) et renseigne le champ Ligne OPE d\'origine', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      const input = ligneOpeInput();
      setValue(input, 'OPE-2027-010');
      fire(input, 'input');
      const list = input.parentElement.querySelector('.cp-ref-list');
      list.querySelector('[data-create-ope]').click();

      assertTrue(!!opeModalEl(), 'la modale de création de ligne OPE doit s\'ouvrir');
      assertEqual(opeModalEl().querySelector('#cpo-nope').value, 'OPE-2027-010', 'le texte tapé doit préremplir le numéro de ligne');
      const structureSelect = opeModalEl().querySelector('#cpo-structure');
      assertTrue(structureSelect.querySelector('option[value="1"]') !== null, 'les Structures existantes (par Acronyme) doivent être proposées');
      structureSelect.value = '1';

      await opeModalEl().querySelector('[data-cp-save]').onclick();

      assertEqual(window.__TEST_CALLS__.length, 1, 'un seul appel Grist attendu');
      const call = window.__TEST_CALLS__[0];
      assertEqual(call.type, 'AddRecord');
      assertEqual(call.table, 'Lignes_OPE');
      assertEqual(call.fields.N_OPE, 'OPE-2027-010');
      assertEqual(call.fields.installe_chez, 1, 'la Structure sélectionnée (par Acronyme) doit être poussée comme référence');

      assertEqual(opeModalEl(), null, 'la modale de création doit se fermer après succès');
      assertEqual(input.value, 'OPE-2027-010', 'le champ Ligne OPE d\'origine doit afficher le numéro créé');
      assertEqual(input.dataset.id, String(call.id), 'le champ Ligne OPE d\'origine doit porter l\'id Grist réellement créé');
      assertTrue(input.closest('.cp-ref').classList.contains('cp-ref-has-value'), 'le champ doit immédiatement passer en "bulle" remplie après création');
      // Bug signalé par Antoine le 22/10/2026 : "Installée chez (rapporté)" ne se
      // mettait pas à jour tout seul après la création d'une ligne OPE depuis la modale.
      assertEqual(projectModalEl().querySelector('#cp-Ligne_OPE_installe_chez').value, 'LAB1',
        '"Installée chez (rapporté)" doit refléter tout de suite la Structure de la ligne OPE qui vient d\'être créée, sans attendre un réenregistrement');

      const lignesOpe = window.CoreState.getTable('Lignes_OPE');
      assertTrue(lignesOpe.some(row => Number(row.id) === Number(call.id) && row.N_OPE === 'OPE-2027-010'), 'la nouvelle ligne OPE doit être ajoutée au cache CoreState pour rester sélectionnable sans recharger');
    });

    it('refuse la création sans numéro de ligne OPE', async function () {
      await loadFixtureState();
      window.openCreateOpeModal('   ');
      await opeModalEl().querySelector('[data-cp-save]').onclick();
      assertIncludes(opeModalEl().querySelector('.cp-error').textContent, 'obligatoire');
      assertEqual(window.__TEST_CALLS__.length, 0, 'aucun appel Grist ne doit partir sans numéro de ligne OPE');
    });
  });

  describe('Modale ligne OPE — ligne sans numéro, seulement la structure où elle sera ouverte (12/11/2026)', function () {
    it('le numéro n\'est plus marqué obligatoire et la structure est expliquée', async function () {
      await loadFixtureState();
      const modal = window.openCreateOpeModal('');
      assertEqual(modal.querySelector('label[for="cpo-nope"]').textContent, 'N° de ligne OPE');
      assertFalse(modal.querySelector('#cpo-nope').required, 'le champ numéro n\'est pas requis');
      assertEqual(modal.querySelector('#cpo-nope').placeholder, 'Pas encore attribué');
      assertIncludes(modal.textContent, 'ou sera ouverte');
    });

    it('crée une ligne sans numéro quand la structure est indiquée, et le champ Ligne OPE l\'affiche', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      const input = ligneOpeInput();
      const list = input.parentElement.querySelector('.cp-ref-list');
      fire(input, 'focus');
      const tbd = list.querySelector('[data-create-ope-tbd]');
      assertTrue(!!tbd, 'l\'entrée « Ligne OPE sans numéro » doit être proposée dans la liste');
      tbd.click();
      assertTrue(!!opeModalEl(), 'c\'est la même modale OPE qui s\'ouvre (pas de doublon)');
      assertEqual(opeModalEl().querySelector('#cpo-nope').value, '', 'numéro laissé vide');
      opeModalEl().querySelector('#cpo-structure').value = '3';
      await opeModalEl().querySelector('[data-cp-save]').onclick();

      assertEqual(window.__TEST_CALLS__.length, 1);
      const call = window.__TEST_CALLS__[0];
      assertEqual(call.type, 'AddRecord');
      assertEqual(call.table, 'Lignes_OPE');
      assertDeepEqual(call.fields, { N_OPE: '', installe_chez: 3 });
      assertEqual(opeModalEl(), null, 'la modale se ferme');
      assertEqual(input.value, 'N° à venir · DIESE', 'sans numéro, le champ montre « N° à venir » et la structure');
      assertEqual(input.dataset.id, String(call.id));
      assertEqual(projectModalEl().querySelector('#cp-Ligne_OPE_installe_chez').value, 'DIESE');
    });

    it('l\'entrée « sans numéro » reste proposée même quand une ligne correspond à la recherche', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      const input = ligneOpeInput();
      setValue(input, 'OPE-2026-001');
      fire(input, 'input');
      const list = input.parentElement.querySelector('.cp-ref-list');
      assertTrue(!!list.querySelector('button[data-id]'), 'la ligne existante reste proposée');
      assertTrue(!!list.querySelector('[data-create-ope-tbd]'));
      assertTrue(!list.querySelector('[data-create-ope]'), 'pas de création « avec numéro » quand ça matche');
    });

    it('un clic sur la ligne OPE déjà choisie ouvre la même modale, en modification', async function () {
      await loadFixtureState();
      const tables = window.CoreState;
      const record = tables.getTable('Projets').find(p => p.Acronyme === 'INNOVX');
      window.ProjectModal.open(record);
      const input = ligneOpeInput();
      assertEqual(input.value, 'OPE-2026-001');
      fire(input, 'click');
      assertTrue(!!opeModalEl(), 'la modale OPE doit s\'ouvrir au clic');
      assertEqual(opeModalEl().querySelector('h2').textContent, 'Modifier la ligne OPE');
      setValue(opeModalEl().querySelector('#cpo-nope'), '');
      opeModalEl().querySelector('#cpo-structure').value = '3';
      await opeModalEl().querySelector('[data-cp-save]').onclick();
      const call = window.__TEST_CALLS__[0];
      assertEqual(call.type, 'UpdateRecord');
      assertDeepEqual(call.fields, { N_OPE: '', installe_chez: 3 });
      assertEqual(input.value, 'N° à venir · DIESE', 'le champ reflète la modification');
      assertEqual(projectModalEl().querySelector('#cp-Ligne_OPE_installe_chez').value, 'DIESE');
    });

    it('rouvrir un projet dont la ligne n\'a pas de numéro l\'affiche « N° à venir · structure »', async function () {
      await loadFixtureState();
      const lignes = window.CoreState.getTable('Lignes_OPE').map(l => l.id === 1 ? { ...l, N_OPE: '' } : l);
      window.CoreState.setTable('Lignes_OPE', lignes);
      const record = window.CoreState.getTable('Projets').find(p => p.Acronyme === 'INNOVX');
      window.ProjectModal.open(record);
      assertEqual(ligneOpeInput().value, 'N° à venir · LAB1');
    });

    it('CoreUtils.opeLabel : numéro seul, ou « N° à venir » avec la structure, ou rien', async function () {
      await loadFixtureState();
      assertEqual(window.CoreUtils.opeLabel({ N_OPE: ' OPE-1 ', installe_chez: 1 }), 'OPE-1');
      assertEqual(window.CoreUtils.opeLabel({ N_OPE: '', installe_chez: 3 }), 'N° à venir · DIESE');
      assertEqual(window.CoreUtils.opeLabel({ N_OPE: null, installe_chez: 0 }), 'N° à venir');
      assertEqual(window.CoreUtils.opeLabel(null), '');
    });

    it('modification : on peut garder la ligne sans numéro si la structure est renseignée', async function () {
      await loadFixtureState();
      const modal = window.openEditOpeModal(1);
      setValue(modal.querySelector('#cpo-nope'), '');
      await modal.querySelector('[data-cp-save]').onclick();
      assertEqual(window.__TEST_CALLS__.length, 1, 'structure LAB1 conservée : l\'enregistrement part');
      assertDeepEqual(window.__TEST_CALLS__[0].fields, { N_OPE: '', installe_chez: 1 });
      assertEqual(opeModalEl(), null);
    });
  });

  describe('Modale ligne OPE — modification d\'une ligne existante (12/11/2026, page Installation des fonds)', function () {
    it('s\'ouvre pré-remplie (numéro, installée chez) avec « Enregistrer », sans rien écrire', async function () {
      await loadFixtureState();
      const modal = window.openEditOpeModal(2);
      assertTrue(!!opeModalEl() && opeModalEl() === modal, 'la modale doit s\'ouvrir');
      assertEqual(modal.querySelector('h2').textContent, 'Modifier la ligne OPE');
      assertEqual(modal.querySelector('[data-cp-save]').textContent, 'Enregistrer');
      assertEqual(modal.querySelector('#cpo-nope').value, 'OPE-2026-002');
      assertEqual(modal.querySelector('#cpo-structure').value, '2', 'installée chez DIR1 (id 2)');
      assertEqual(window.__TEST_CALLS__.length, 0);
    });

    it('enregistre par UpdateRecord (jamais AddRecord), met le cache à jour et prévient l\'appelant', async function () {
      await loadFixtureState();
      let saved = null;
      const modal = window.openEditOpeModal(2, row => { saved = row; });
      setValue(modal.querySelector('#cpo-nope'), '  OPE-2026-020  ');
      modal.querySelector('#cpo-structure').value = '1';
      await modal.querySelector('[data-cp-save]').onclick();

      assertEqual(window.__TEST_CALLS__.length, 1, 'un seul appel Grist');
      const call = window.__TEST_CALLS__[0];
      assertEqual(call.type, 'UpdateRecord');
      assertEqual(call.table, 'Lignes_OPE');
      assertEqual(call.id, 2);
      assertDeepEqual(call.fields, { N_OPE: 'OPE-2026-020', installe_chez: 1 });
      assertEqual(opeModalEl(), null, 'la modale se ferme après succès');
      const row = window.CoreState.getTable('Lignes_OPE').find(r => r.id === 2);
      assertEqual(row.N_OPE, 'OPE-2026-020', 'cache CoreState à jour');
      assertEqual(row.installe_chez, 1);
      assertEqual(window.CoreState.getTable('Lignes_OPE').length, 3, 'aucune ligne ajoutée');
      assertTrue(!!saved && saved.id === 2 && saved.N_OPE === 'OPE-2026-020', 'onSaved reçoit la ligne enregistrée');
    });

    it('permet de retirer la structure (installée chez vide) et refuse une ligne sans numéro ni structure', async function () {
      await loadFixtureState();
      const modal = window.openEditOpeModal(1);
      setValue(modal.querySelector('#cpo-nope'), '   ');
      modal.querySelector('#cpo-structure').value = '';
      await modal.querySelector('[data-cp-save]').onclick();
      assertIncludes(modal.querySelector('.cp-error').textContent, 'obligatoire');
      assertEqual(window.__TEST_CALLS__.length, 0, 'aucun appel Grist sans numéro ni structure');

      setValue(modal.querySelector('#cpo-nope'), 'OPE-2026-001');
      modal.querySelector('#cpo-structure').value = '';
      await modal.querySelector('[data-cp-save]').onclick();
      assertEqual(window.__TEST_CALLS__[0].fields.installe_chez, null);
    });

    it('un échec d\'écriture garde la modale ouverte, réactive le bouton et laisse le cache intact', async function () {
      await loadFixtureState();
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async () => { throw new Error('boom'); };
      let modal;
      try {
        modal = window.openEditOpeModal(1);
        setValue(modal.querySelector('#cpo-nope'), 'OPE-X');
        await modal.querySelector('[data-cp-save]').onclick();
      } finally { window.grist.docApi.applyUserActions = original; }
      assertTrue(!!opeModalEl(), 'la modale reste ouverte');
      assertIncludes(modal.querySelector('.cp-error').textContent, 'Enregistrement impossible');
      assertFalse(modal.querySelector('[data-cp-save]').disabled, 'le bouton est de nouveau utilisable');
      assertEqual(window.CoreState.getTable('Lignes_OPE').find(r => r.id === 1).N_OPE, 'OPE-2026-001');
    });

    it('une ligne inconnue n\'ouvre rien et le dit', async function () {
      await loadFixtureState();
      assertEqual(window.openEditOpeModal(999), null);
      assertEqual(opeModalEl(), null);
      assertIncludes(document.getElementById('toast').textContent, 'introuvable');
    });
  });

  // Demande d'Antoine du 24/11/2026 : « + Ligne OPE sans numéro » en tête de la liste, et, pour une ligne créée sans numéro, le lieu
  // d'installation proposé d'office = la structure du porteur 1 du projet (Annuaire.Poste2 → Postes2.Structure2).
  // Fixtures : Alice Martin (Poste 1, structure 1 = LAB1), Bob Durand (aucun poste).
  describe('Ligne OPE sans numéro — en tête de liste et structure du porteur 1 par défaut', function () {
    function pickPorteur1(query, text) {
      const input = projectModalEl().querySelector('[data-ref="Porteur_1"]');
      setValue(input, query);
      fire(input, 'input');
      const button = Array.from(input.parentElement.querySelector('.cp-ref-list').querySelectorAll('button')).find(b => b.textContent === text);
      assertTrue(!!button, `porteur ${text} introuvable`);
      button.click();
    }
    function openTbd(refKey) {
      const input = refKey ? projectModalEl().querySelector(`[data-ref="${refKey}"]`) : ligneOpeInput();
      fire(input, 'focus');
      input.parentElement.querySelector('[data-create-ope-tbd]').click();
      return opeModalEl();
    }

    it('le bouton « + Ligne OPE sans numéro » est le premier de la liste, avant les lignes existantes', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      const input = ligneOpeInput();
      fire(input, 'focus');
      const buttons = Array.from(input.parentElement.querySelector('.cp-ref-list').querySelectorAll('button'));
      assertTrue(buttons.length >= 4, 'le bouton et les trois lignes existantes');
      assertTrue(buttons[0].hasAttribute('data-create-ope-tbd'), 'premier bouton = sans numéro');
      assertTrue(buttons.slice(1).every(b => !b.hasAttribute('data-create-ope-tbd')), 'un seul bouton « sans numéro »');
      assertTrue(buttons.slice(1).some(b => b.textContent === 'OPE-2026-001'), 'les lignes existantes suivent');
    });

    it('il reste en tête quand la recherche ne trouve rien (avec « + Créer la ligne OPE … » après lui) et Entrée ne le choisit jamais sans flèche', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      const input = ligneOpeInput();
      setValue(input, 'OPE-2099-777');
      fire(input, 'input');
      const buttons = Array.from(input.parentElement.querySelector('.cp-ref-list').querySelectorAll('button'));
      assertTrue(buttons[0].hasAttribute('data-create-ope-tbd'));
      assertTrue(buttons[1].hasAttribute('data-create-ope'));
      fireKey(input, 'Enter');
      assertEqual(opeModalEl(), null, 'Entrée sans flèche n\'ouvre aucune modale');
    });

    it('porteur 1 choisi : la structure de son poste est préselectionnée pour une ligne sans numéro, avec une aide qui le dit', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      pickPorteur1('Alice', 'Alice Martin');
      const modal = openTbd();
      assertEqual(modal.querySelector('#cpo-nope').value, '');
      assertEqual(modal.querySelector('#cpo-structure').value, '1', 'LAB1 = structure du poste d\'Alice');
      assertIncludes(modal.querySelector('#cpo-structure').closest('.cp-field').querySelector('.cp-hint').textContent, 'porteur 1');
    });

    it('la structure proposée se change, et c\'est celle choisie qui est enregistrée', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      pickPorteur1('Alice', 'Alice Martin');
      let modal = openTbd();
      await modal.querySelector('[data-cp-save]').onclick();
      assertDeepEqual(window.__TEST_CALLS__[0].fields, { N_OPE: '', installe_chez: 1 }, 'enregistrer tel quel garde la structure du porteur 1');
      assertEqual(ligneOpeInput().value, 'N° à venir · LAB1');
      assertEqual(projectModalEl().querySelector('#cp-Ligne_OPE_installe_chez').value, 'LAB1');

      window.__TEST_CALLS__.length = 0;
      fireMouse(ligneOpeInput().parentElement.querySelector('.cp-ref-clear'), 'mousedown');
      modal = openTbd();
      modal.querySelector('#cpo-structure').value = '3';
      await modal.querySelector('[data-cp-save]').onclick();
      assertDeepEqual(window.__TEST_CALLS__[0].fields, { N_OPE: '', installe_chez: 3 });
    });

    it('aucune structure par défaut : pas de porteur 1, porteur sans poste, ou poste hors Structures', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      assertEqual(openTbd().querySelector('#cpo-structure').value, '', 'aucun porteur 1 choisi');
      opeModalEl().remove();
      pickPorteur1('Bob', 'Bob Durand');
      assertEqual(openTbd().querySelector('#cpo-structure').value, '', 'Bob n\'a pas de poste');
      assertEqual(opeModalEl().querySelector('#cpo-structure').closest('.cp-field').querySelector('.cp-hint').textContent.includes('porteur 1'), false, 'pas d\'aide « porteur 1 » sans valeur reprise');
      opeModalEl().remove();
      const postes = window.CoreState.getTable('Postes2').map(p => (p.id === 1 ? { ...p, Structure2: 99 } : p));
      window.CoreState.setTable('Postes2', postes);
      pickPorteur1('Alice', 'Alice Martin');
      assertEqual(openTbd().querySelector('#cpo-structure').value, '', 'structure inconnue : jamais une valeur hors liste');
    });

    it('un numéro tapé (« + Créer la ligne OPE … ») ne reçoit pas de structure par défaut : elle reste facultative', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      pickPorteur1('Alice', 'Alice Martin');
      const input = ligneOpeInput();
      setValue(input, 'OPE-2027-010');
      fire(input, 'input');
      input.parentElement.querySelector('[data-create-ope]').click();
      assertEqual(opeModalEl().querySelector('#cpo-nope').value, 'OPE-2027-010');
      assertEqual(opeModalEl().querySelector('#cpo-structure').value, '');
    });

    it('la modification d\'une ligne existante garde sa propre structure (jamais celle du porteur 1)', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      pickPorteur1('Alice', 'Alice Martin');
      const modal = window.openEditOpeModal(3);
      assertEqual(modal.querySelector('#cpo-structure').value, '3');
    });

    it('même comportement pour la ligne OPE d\'une OPE 2 (carte ajoutée) : structure du porteur 1 d\'office', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      pickPorteur1('Alice', 'Alice Martin');
      projectModalEl().querySelector('[data-ope-add]').click();
      const modal = openTbd('Ligne_OPE_2');
      assertEqual(modal.querySelector('#cpo-structure').value, '1');
      await modal.querySelector('[data-cp-save]').onclick();
      assertEqual(projectModalEl().querySelector('[data-ref="Ligne_OPE_2"]').value, 'N° à venir · LAB1');
      assertEqual(projectModalEl().querySelector('#cp-Ligne_OPE_installe_chez_2').value, 'LAB1');
      assertEqual(ligneOpeInput().value, '', 'l\'OPE 1 n\'est pas touchée');
    });

    it('ouverte sans projet (aucune option), la modale OPE n\'a pas de structure par défaut', async function () {
      await loadFixtureState();
      assertEqual(window.openCreateOpeModal('').querySelector('#cpo-structure').value, '');
      opeModalEl().remove();
      assertEqual(window.openCreateOpeModal('', null, { installeChez: 2 }).querySelector('#cpo-structure').value, '2', 'option explicite honorée');
      opeModalEl().remove();
      assertEqual(window.openCreateOpeModal('OPE-9', null, { installeChez: 2 }).querySelector('#cpo-structure').value, '', 'ignorée dès qu\'un numéro est donné');
    });
  });

  // Demande d'Antoine du 24/11/2026 : en « voir en tant que » un autre utilisateur Grist, le champ Ligne OPE d'une ligne sans numéro affichait
  // un ID (« 1 ») à la place de « N° à venir · structure ». Quand la ligne OPE n'est pas lisible par l'utilisateur (règle d'accès Grist sur
  // Lignes_OPE : ligne ou table cachée), le widget ne peut pas la résoudre ; il affichait alors le numéro de ligne brut, pris pour un numéro
  // d'OPE. Il écrit maintenant « Ligne OPE (id 1) non lisible », explique pourquoi en infobulle et garde la référence telle quelle.
  describe('Ligne OPE non lisible par l\'utilisateur (règle d\'accès Grist) — jamais un ID brut', function () {
    const innovx = () => window.CoreState.getTable('Projets').find(p => p.Acronyme === 'INNOVX');
    async function hideOpeRow(id) {
      await loadFixtureState();
      window.CoreState.setTable('Lignes_OPE', window.CoreState.getTable('Lignes_OPE').filter(l => l.id !== id));
    }

    it('ligne cachée : « Ligne OPE (id 1) non lisible » au lieu de « 1 », avec la raison en infobulle, et la référence est conservée', async function () {
      await hideOpeRow(1);
      window.ProjectModal.open(innovx());
      const input = ligneOpeInput();
      assertEqual(input.value, 'Ligne OPE (id 1) non lisible');
      assertEqual(input.dataset.id, '1', 'la valeur reste la ligne 1');
      assertIncludes(input.title, 'droits d’accès');
      assertEqual(projectModalEl().querySelector('[data-ope-name]').textContent, 'Ligne OPE (id 1) non lisible', 'même libellé dans l\'en-tête de la carte OPE');
      assertEqual(input.closest('.cp-ref').querySelector('.cp-ref-avatar'), null, 'une ligne OPE n\'a pas d\'initiales');
    });

    it('table Lignes_OPE entière illisible : l\'infobulle dit que la table n\'a pas pu être lue, avec le message de Grist', async function () {
      await loadFixtureState();
      const docApi = window.CoreGrist.gristInstance.docApi;
      const original = docApi.fetchTable;
      docApi.fetchTable = name => name === 'Lignes_OPE' ? Promise.reject(new Error('Accès refusé à Lignes_OPE')) : original.call(docApi, name);
      try {
        const tables = await window.CoreGrist.loadAllTables();
        assertEqual(window.CoreGrist.readFailure('Lignes_OPE'), 'Accès refusé à Lignes_OPE');
        assertEqual(window.CoreGrist.readFailure('Structures'), '', 'une table lue n\'a pas d\'échec');
        Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      } finally { docApi.fetchTable = original; }
      window.ProjectModal.open(innovx());
      assertEqual(ligneOpeInput().value, 'Ligne OPE (id 1) non lisible');
      assertIncludes(ligneOpeInput().title, 'La table Lignes_OPE n’a pas pu être lue');
      assertIncludes(ligneOpeInput().title, 'Accès refusé à Lignes_OPE');
      await window.CoreGrist.loadAllTables();
      assertEqual(window.CoreGrist.readFailure('Lignes_OPE'), '', 'le chargement suivant efface l\'échec');
    });

    it('ligne lisible : libellé normal (numéro ou « N° à venir · structure »), sans infobulle', async function () {
      await loadFixtureState();
      window.CoreState.setTable('Lignes_OPE', window.CoreState.getTable('Lignes_OPE').map(l => l.id === 1 ? { ...l, N_OPE: '' } : l));
      window.ProjectModal.open(innovx());
      assertEqual(ligneOpeInput().value, 'N° à venir · LAB1');
      assertEqual(ligneOpeInput().title, '');
      assertEqual(ligneOpeInput().dataset.unreadable, undefined);
    });

    it('au focus du champ : toute la liste est proposée, jamais « + Créer la ligne OPE "Ligne OPE (id 1) non lisible" »', async function () {
      await hideOpeRow(1);
      window.ProjectModal.open(innovx());
      const input = ligneOpeInput();
      fire(input, 'focus');
      const list = input.parentElement.querySelector('.cp-ref-list');
      assertEqual(list.querySelector('[data-create-ope]'), null, 'aucune création avec le libellé « non lisible »');
      assertTrue(list.querySelector('[data-create-ope-tbd]') !== null, 'le bouton « sans numéro » reste en tête');
      assertEqual(list.querySelectorAll('button[data-id]').length, 2, 'les deux lignes lisibles (2 et 3)');
      assertEqual(input.value, 'Ligne OPE (id 1) non lisible', 'le champ garde sa valeur tant qu\'on ne choisit rien');
    });

    it('choisir une autre ligne remplace le libellé « non lisible » : plus d\'infobulle, la nouvelle valeur est écrite', async function () {
      await hideOpeRow(1);
      window.ProjectModal.open(innovx());
      const input = ligneOpeInput();
      fire(input, 'focus');
      Array.from(input.parentElement.querySelectorAll('.cp-ref-list button[data-id]')).find(b => b.textContent === 'OPE-2026-002').click();
      assertEqual(input.value, 'OPE-2026-002');
      assertEqual(input.dataset.id, '2');
      assertEqual(input.title, '');
      assertEqual(input.dataset.unreadable, undefined);
    });

    it('enregistrer le projet sans toucher au champ garde la ligne OPE illisible (rien n\'est écrit à sa place)', async function () {
      await hideOpeRow(1);
      window.ProjectModal.open(innovx());
      await projectModalEl().querySelector('[data-cp-save]').onclick();
      const update = window.__TEST_CALLS__.filter(call => call.type === 'UpdateRecord')[0];
      assertTrue(!!update, 'l\'enregistrement part');
      assertDeepEqual(update.fields.Ligne_OPE, ['L', 1], 'la référence est réécrite telle quelle');
    });

    it('même règle pour les autres références : un porteur illisible s\'écrit « Personne (id N) non lisible » (sans initiales) ; un texte non numérique reste tel quel', async function () {
      await loadFixtureState();
      window.CoreState.setTable('Annuaire', window.CoreState.getTable('Annuaire').filter(p => p.id !== 1));
      window.ProjectModal.open({ ...innovx(), Porteur_1: 1, Programme: 'Texte libre hérité' });
      const porteur = projectModalEl().querySelector('[data-ref="Porteur_1"]');
      assertEqual(porteur.value, 'Personne (id 1) non lisible');
      assertEqual(porteur.closest('.cp-ref').querySelector('.cp-ref-avatar').textContent, '', 'pas d\'initiales « PE » pour une personne illisible');
      assertEqual(projectModalEl().querySelector('[data-ref="Programme"]').value, 'Texte libre hérité');
    });
  });
})();
