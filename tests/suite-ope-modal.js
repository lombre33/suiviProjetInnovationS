/**
 * Non-regression suite: création d'une ligne OPE à la volée (js/components/ope-modal.js),
 * depuis le champ "Ligne OPE" de l'onglet Dates & OPE de la modale Projet — même patron
 * que le "+ Créer" du champ Porteur (person-modal.js), mais table EcritureComptables.
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
      assertEqual(call.table, 'EcritureComptables');
      assertEqual(call.fields.N_OPE, 'OPE-2027-010');
      assertEqual(call.fields.installe_chez, 1, 'la Structure sélectionnée (par Acronyme) doit être poussée comme référence');

      assertEqual(opeModalEl(), null, 'la modale de création doit se fermer après succès');
      assertEqual(input.value, 'OPE-2027-010', 'le champ Ligne OPE d\'origine doit afficher le numéro créé');
      assertEqual(input.dataset.id, String(call.id), 'le champ Ligne OPE d\'origine doit porter l\'id Grist réellement créé');
      assertTrue(input.closest('.cp-ref').classList.contains('cp-ref-has-value'), 'le champ doit immédiatement passer en "bulle" remplie après création');

      const ecritures = window.CoreState.getTable('EcritureComptables');
      assertTrue(ecritures.some(row => Number(row.id) === Number(call.id) && row.N_OPE === 'OPE-2027-010'), 'la nouvelle ligne OPE doit être ajoutée au cache CoreState pour rester sélectionnable sans recharger');
    });

    it('refuse la création sans numéro de ligne OPE', async function () {
      await loadFixtureState();
      window.openCreateOpeModal('   ');
      await opeModalEl().querySelector('[data-cp-save]').onclick();
      assertIncludes(opeModalEl().querySelector('.cp-error').textContent, 'obligatoire');
      assertEqual(window.__TEST_CALLS__.length, 0, 'aucun appel Grist ne doit partir sans numéro de ligne OPE');
    });
  });
})();
