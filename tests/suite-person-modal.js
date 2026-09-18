/**
 * Non-regression suite: fiche Annuaire (js/components/person-modal.js).
 *
 * The "création réussie" test asserts the CORRECT contract (Grist's real
 * applyUserActions() resolves to { actionNum, retValues: [newId] } — verified against
 * Grist's own docs/community examples). Run this suite against the pre-cleanup source
 * first: it is expected to FAIL there, which is exactly what surfaces the
 * id-extraction bug described in the audit (person-modal.js reads `result.id` /
 * `result[0]` instead of `result.retValues[0]`, so it can never find the id Grist
 * actually returns and always falls into its "identifiant introuvable" error path).
 */
(function () {
  'use strict';

  async function loadFixtureState() {
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    return tables;
  }

  function modalEl() { return document.getElementById('cp-person-modal'); }

  function pickPoste(query, matchText) {
    const input = modalEl().querySelector('#cpp-poste');
    setValue(input, query);
    fire(input, 'input');
    const list = input.parentElement.querySelector('.cp-ref-list');
    const button = Array.from(list.querySelectorAll('button')).find(b => b.textContent === matchText);
    assertTrue(!!button, `aucun poste "${matchText}" pour la recherche "${query}"`);
    button.click();
  }

  describe('Fiche Annuaire — validation', function () {
    it('refuse la création sans nom ni prénom', async function () {
      await loadFixtureState();
      window.openCreatePersonModal();
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertIncludes(modalEl().querySelector('.cp-error').textContent, 'obligatoires');
      assertEqual(window.__TEST_CALLS__.length, 0);
    });

    it('refuse la création sans poste (mais l\'édition d\'une fiche existante sans poste reste possible)', async function () {
      await loadFixtureState();
      window.openCreatePersonModal();
      setValue(modalEl().querySelector('#cpp-nom'), 'Dupont');
      setValue(modalEl().querySelector('#cpp-prenom'), 'Claire');
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertIncludes(modalEl().querySelector('.cp-error').textContent, 'poste');
      assertEqual(window.__TEST_CALLS__.length, 0, 'aucun appel Grist ne doit partir tant que le poste manque');
    });
  });

  describe('Fiche Annuaire — création', function () {
    it('crée la personne, récupère son id Grist et renseigne le champ d\'origine', async function () {
      await loadFixtureState();
      const originInput = document.createElement('input');
      window.openCreatePersonModal('Claire Dupont', originInput);
      assertEqual(modalEl().querySelector('#cpp-nom').value, 'Dupont', 'le nom de famille doit être déduit du texte tapé dans le champ Annuaire');
      assertEqual(modalEl().querySelector('#cpp-prenom').value, 'Claire');
      pickPoste('Responsable', 'Responsable innovation  Pôle valorisation - LAB1 - DIR1 - UBX 1');

      await modalEl().querySelector('[data-cp-save]').onclick();

      assertEqual(window.__TEST_CALLS__.length, 1, 'un seul appel Grist attendu');
      const call = window.__TEST_CALLS__[0];
      assertEqual(call.type, 'AddRecord');
      assertEqual(call.table, 'Annuaire');
      assertEqual(call.fields.NOM, 'Dupont');
      assertEqual(call.fields.Prenom, 'Claire');
      assertEqual(call.fields.Poste2, 1, 'le poste sélectionné doit être envoyé');

      assertEqual(modalEl(), null, 'la modale doit se fermer après une création réussie (pas de message d\'erreur bloquant)');
      assertEqual(originInput.value, 'Claire Dupont', 'le champ Annuaire d\'origine doit afficher "Prénom Nom"');
      assertEqual(originInput.dataset.id, String(call.id), 'le champ Annuaire d\'origine doit porter l\'id Grist réellement créé');

      const annuaire = window.CoreState.getTable('Annuaire');
      assertTrue(annuaire.some(row => Number(row.id) === call.id && row.NOM === 'Dupont'), 'la nouvelle personne doit apparaître dans CoreState.Annuaire sans recharger toute la table');
    });
  });

  describe('Fiche Annuaire — édition', function () {
    it('pré-remplit nom/prénom/poste depuis l\'enregistrement existant', async function () {
      const tables = await loadFixtureState();
      const person = tables.Annuaire.find(p => p.NOM === 'Martin');
      window.openEditPersonModal(person);
      assertEqual(modalEl().querySelector('#cpp-nom').value, 'Martin');
      assertEqual(modalEl().querySelector('#cpp-prenom').value, 'Alice');
      assertIncludes(modalEl().querySelector('#cpp-poste').value, 'Responsable innovation');
    });

    it('envoie UpdateRecord avec l\'id existant, sans créer de doublon', async function () {
      const tables = await loadFixtureState();
      const person = tables.Annuaire.find(p => p.NOM === 'Martin');
      window.openEditPersonModal(person);
      setValue(modalEl().querySelector('#cpp-email'), 'alice.martin+updated@example.org');
      await modalEl().querySelector('[data-cp-save]').onclick();

      assertEqual(window.__TEST_CALLS__.length, 1);
      const call = window.__TEST_CALLS__[0];
      assertEqual(call.type, 'UpdateRecord');
      assertEqual(call.table, 'Annuaire');
      assertEqual(call.id, 1);
      assertEqual(call.fields.Email, 'alice.martin+updated@example.org');
    });
  });
})();
