/**
 * Non-regression suite: fiche Poste (js/components/poste-modal.js).
 * Fixture Structures (tests/fixtures.js): LAB1 (id 1) has deux tutelles (UBX + CNRS,
 * gestionnaire UBX) ; DIR1 (id 2) n'en a qu'une (UBX). Utilisé pour vérifier le
 * filtrage dynamique de la liste Tutelle/Employeur.
 */
(function () {
  'use strict';

  function nextTick() { return new Promise(resolve => setTimeout(resolve, 0)); }

  async function loadFixtureState() {
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    return tables;
  }

  function modalEl() { return document.getElementById('cp-poste-modal'); }
  function optionLabels(select) { return Array.from(select.options).filter(o => o.value !== '').map(o => o.textContent); }

  function selectStructure(id) {
    const select = modalEl().querySelector('#cpp-structure');
    select.value = String(id);
    fire(select, 'change');
  }

  describe('Fiche Poste — validation', function () {
    it('refuse la création sans structure/tutelle/titre', async function () {
      await loadFixtureState();
      window.openCreatePosteModal();
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertIncludes(modalEl().querySelector('.cp-error').textContent, 'obligatoires');
      assertEqual(window.__TEST_CALLS__.length, 0);
    });
  });

  describe('Fiche Poste — filtrage dynamique Tutelle/Employeur', function () {
    it('ne propose que les tutelles de la structure choisie, en présélectionnant la gestionnaire', async function () {
      await loadFixtureState();
      window.openCreatePosteModal();
      selectStructure(1); // LAB1 -> tutelles UBX + CNRS, gestionnaire UBX
      const employeur = modalEl().querySelector('#cpp-employeur');
      assertDeepEqual(optionLabels(employeur).sort(), ['CNRS', 'UBX'], 'LAB1 doit proposer exactement UBX et CNRS');
      assertEqual(employeur.value, '1', 'la tutelle gestionnaire (UBX) doit être présélectionnée');
    });

    it('met à jour la liste des tutelles quand on change de structure', async function () {
      await loadFixtureState();
      window.openCreatePosteModal();
      selectStructure(1);
      selectStructure(2); // DIR1 -> une seule tutelle, UBX
      const employeur = modalEl().querySelector('#cpp-employeur');
      assertDeepEqual(optionLabels(employeur), ['UBX'], 'DIR1 ne doit proposer que UBX');
      assertEqual(employeur.value, '1');
    });
  });

  describe('Fiche Poste — aperçu du nom calculé', function () {
    it('recalcule "Nom du poste" en direct et estime le prochain ID2', async function () {
      await loadFixtureState();
      window.openCreatePosteModal();
      selectStructure(1);
      setValue(modalEl().querySelector('#cpp-titre'), 'Nouveau Titre');
      fire(modalEl().querySelector('#cpp-titre'), 'input');
      setValue(modalEl().querySelector('#cpp-precisions'), 'Detail X');
      fire(modalEl().querySelector('#cpp-precisions'), 'input');
      await nextTick(); // laisse nextPosteId() (async) résoudre l'ID2 estimé

      assertEqual(modalEl().querySelector('#cpp-nom-poste').value, 'Nouveau Titre  Detail X - LAB1 - DIR1 - UBX 3',
        'le prochain ID2 estimé doit être max(ID2 existants) + 1 = 3 (fixtures: ID2 1 et 2)');
    });
  });

  describe('Fiche Poste — création', function () {
    it('envoie AddRecord avec les bons champs et calcule le nom du poste côté client', async function () {
      await loadFixtureState();
      window.openCreatePosteModal();
      selectStructure(1);
      setValue(modalEl().querySelector('#cpp-titre'), 'Nouveau Titre');
      setValue(modalEl().querySelector('#cpp-precisions'), 'Detail X');
      await modalEl().querySelector('[data-cp-save]').onclick();

      assertEqual(window.__TEST_CALLS__.length, 1);
      const call = window.__TEST_CALLS__[0];
      assertEqual(call.type, 'AddRecord');
      assertEqual(call.table, 'Postes2');
      assertEqual(call.fields.Structure2, 1);
      assertEqual(call.fields.Employeur_tutelle, 1);
      assertEqual(call.fields.Titre, 'Nouveau Titre');
      assertEqual(call.fields.Precisions_Poste, 'Detail X');

      const postes = window.CoreState.getTable('Postes2');
      const created = postes.find(p => Number(p.id) === call.id);
      assertTrue(!!created, 'le nouveau poste doit apparaître dans CoreState.Postes2 sans recharger toute la table');
      assertEqual(created.Nom_du_poste, `Nouveau Titre  Detail X - LAB1 - DIR1 - UBX ${call.id}`,
        'à défaut de formule Grist recalculée, le nom du poste doit être calculé côté client de façon identique');
    });
  });

  describe('Fiche Poste — édition', function () {
    it('pré-remplit structure/tutelle/titre/précisions depuis l\'enregistrement existant', async function () {
      const tables = await loadFixtureState();
      const poste = tables.Postes2.find(p => p.Titre === 'Responsable innovation');
      window.openPosteModal({ mode: 'edit', poste });
      assertEqual(modalEl().querySelector('#cpp-structure').value, '1');
      assertEqual(modalEl().querySelector('#cpp-employeur').value, '1');
      assertEqual(modalEl().querySelector('#cpp-titre').value, 'Responsable innovation');
      assertEqual(modalEl().querySelector('#cpp-precisions').value, 'Pôle valorisation');
    });

    it('envoie UpdateRecord avec l\'id existant, sans créer de doublon', async function () {
      const tables = await loadFixtureState();
      const poste = tables.Postes2.find(p => p.Titre === 'Responsable innovation');
      window.openPosteModal({ mode: 'edit', poste });
      setValue(modalEl().querySelector('#cpp-titre'), 'Titre modifié');
      await modalEl().querySelector('[data-cp-save]').onclick();

      assertEqual(window.__TEST_CALLS__.length, 1);
      const call = window.__TEST_CALLS__[0];
      assertEqual(call.type, 'UpdateRecord');
      assertEqual(call.table, 'Postes2');
      assertEqual(call.id, poste.id);
      assertEqual(call.fields.Titre, 'Titre modifié');
    });
  });
})();
