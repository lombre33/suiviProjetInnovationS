/**
 * Non-regression suite: création d'une ligne OPE à la volée (js/components/ope-modal.js),
 * depuis le champ "Ligne OPE" de l'onglet Dates & OPE de la modale Projet — même patron
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

    it('permet de retirer la structure (installée chez vide) et refuse un numéro vide', async function () {
      await loadFixtureState();
      const modal = window.openEditOpeModal(1);
      setValue(modal.querySelector('#cpo-nope'), '   ');
      await modal.querySelector('[data-cp-save]').onclick();
      assertIncludes(modal.querySelector('.cp-error').textContent, 'obligatoire');
      assertEqual(window.__TEST_CALLS__.length, 0, 'aucun appel Grist sans numéro');

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
})();
