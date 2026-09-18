/**
 * Non-regression suite: modale "Nouveau projet" / édition (js/components/project-modal.js).
 *
 * DOM convention: refField() inputs carry data-ref="<Key>" exactly matching the Grist
 * field name passed to refField() in project-modal.js (e.g. data-ref="Porteur_1",
 * data-ref="Programme", data-ref="Instance_ratachee") — see project_app_overview memory.
 */
(function () {
  'use strict';

  function modalEl() { return document.getElementById('cp-project-modal'); }
  function refInput(key) { return modalEl().querySelector(`[data-ref="${key}"]`); }

  function pickRef(key, query, matchText) {
    const input = refInput(key);
    setValue(input, query);
    fire(input, 'input');
    const list = input.parentElement.querySelector('.cp-ref-list');
    const button = Array.from(list.querySelectorAll('button')).find(b => b.textContent === matchText);
    assertTrue(!!button, `aucune option "${matchText}" pour ${key} (recherche "${query}") — options: ${Array.from(list.querySelectorAll('button')).map(b => b.textContent).join(', ')}`);
    button.click();
  }

  async function loadFixtureState() {
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    return tables;
  }

  async function fillMinimalValidProject() {
    window.ProjectModal.open();
    pickRef('Programme', 'Programme A', 'Programme A');
    setValue(modalEl().querySelector('#cp-Projet'), 'Mon nouveau projet');
    setValue(modalEl().querySelector('#cp-Acronyme'), 'MNP');
    pickRef('Porteur_1', 'Alice', 'Alice Martin');
  }

  describe('Modale Projet — validation des champs obligatoires', function () {
    it('refuse la création sans Programme/Projet/Acronyme/Porteur 1 et n\'appelle pas Grist', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertIncludes(modalEl().querySelector('#cp-project-error').textContent, 'obligatoires');
      assertEqual(window.__TEST_CALLS__.length, 0, 'aucun appel Grist ne doit partir tant que les champs obligatoires manquent');
    });
  });

  describe('Modale Projet — création', function () {
    it('crée un projet avec les valeurs par défaut (Type_projet, Statut opérationnel)', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      await modalEl().querySelector('[data-cp-save]').onclick();

      assertEqual(window.__TEST_CALLS__.length, 1, 'un seul appel Grist attendu');
      const call = window.__TEST_CALLS__[0];
      assertEqual(call.type, 'AddRecord');
      assertEqual(call.table, 'Projets');
      assertEqual(call.fields.Programme, 1);
      assertEqual(call.fields.Projet, 'Mon nouveau projet');
      assertEqual(call.fields.Acronyme, 'MNP');
      assertEqual(call.fields.Porteur_1, 1);
      assertEqual(call.fields.Type_projet, 'Projet', 'valeur par défaut de Type_projet');
      assertEqual(call.fields.Statut_operationnel_projet, 'En attente des dispo des fonds', 'valeur par défaut du statut opérationnel');
      assertTrue(modalEl().classList.contains('cp-hidden'), 'la modale doit se refermer après création');
    });

    it('déclenche l\'évènement project-created pour rafraîchir le Kanban', async function () {
      await loadFixtureState();
      let fired = false;
      const onCreated = () => { fired = true; };
      window.addEventListener('project-created', onCreated);
      try {
        await fillMinimalValidProject();
        await modalEl().querySelector('[data-cp-save]').onclick();
        assertTrue(fired, 'l\'évènement project-created doit être émis après une création réussie');
      } finally {
        window.removeEventListener('project-created', onCreated);
      }
    });

    it('propose "+ Créer" dans un champ Annuaire sans résultat et ouvre la fiche personne', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      const input = refInput('Porteur_1');
      setValue(input, 'Personne Inexistante');
      fire(input, 'input');
      const list = input.parentElement.querySelector('.cp-ref-list');
      const createBtn = list.querySelector('[data-create-person]');
      assertTrue(!!createBtn, 'un bouton "+ Créer" doit apparaître quand aucune personne ne correspond');
      const original = window.openCreatePersonModal;
      let calledWith = null;
      window.openCreatePersonModal = (name) => { calledWith = name; };
      try {
        createBtn.click();
        assertEqual(calledWith, 'Personne Inexistante');
      } finally {
        window.openCreatePersonModal = original;
      }
    });
  });

  describe('Modale Projet — édition', function () {
    it('pré-remplit les champs texte, référence et budget depuis l\'enregistrement Grist', async function () {
      const tables = await loadFixtureState();
      const record = tables.Projets.find(p => p.Acronyme === 'INNOVX');
      window.ProjectModal.open(record);

      assertEqual(modalEl().querySelector('#cp-Projet').value, 'Projet Instruction');
      assertEqual(modalEl().querySelector('#cp-Acronyme').value, 'INNOVX');
      assertEqual(refInput('Programme').value, 'Programme A');
      assertEqual(refInput('Porteur_1').value, 'Alice Martin');
      assertEqual(refInput('Instance_ratachee').value, 'Comité innovation#3 - 2026-03-15');
      assertEqual(modalEl().querySelector('[data-fin="c2026_M10_Fonctionnement"]').value, '1000');
      // Ligne_OPE est une ReferenceList (['L', 1]) : la modale n'en affiche qu'une
      // valeur, elle doit déballer le tableau plutôt que d'afficher un champ vide.
      assertEqual(refInput('Ligne_OPE').value, 'OPE-2026-001', 'Ligne_OPE (ReferenceList) doit être déballée pour l\'affichage');
    });

    it('envoie UpdateRecord (pas AddRecord) avec l\'id existant lors de l\'enregistrement', async function () {
      const tables = await loadFixtureState();
      const record = tables.Projets.find(p => p.Acronyme === 'INNOVX');
      window.ProjectModal.open(record);
      setValue(modalEl().querySelector('#cp-Acronyme'), 'INNOVX2');
      await modalEl().querySelector('[data-cp-save]').onclick();

      assertEqual(window.__TEST_CALLS__.length, 1);
      const call = window.__TEST_CALLS__[0];
      assertEqual(call.type, 'UpdateRecord');
      assertEqual(call.table, 'Projets');
      assertEqual(call.id, 10);
      assertEqual(call.fields.Acronyme, 'INNOVX2');
    });
  });

  describe('Modale Projet — champs référence (Ligne_OPE, texte libre)', function () {
    it('pousse Ligne_OPE au format ReferenceList (["L", id]), jamais un id nu', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      pickRef('Ligne_OPE', 'OPE', 'OPE-2026-001');
      await modalEl().querySelector('[data-cp-save]').onclick();

      const call = window.__TEST_CALLS__[0];
      assertDeepEqual(call.fields.Ligne_OPE, ['L', 1]);
    });

    it('pousse Ligne_OPE=["L"] (jamais 0 ni null) quand aucune ligne OPE n\'est sélectionnée', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      await modalEl().querySelector('[data-cp-save]').onclick();

      const call = window.__TEST_CALLS__[0];
      assertDeepEqual(call.fields.Ligne_OPE, ['L']);
    });

    it('efface le texte tapé dans un champ référence si aucune suggestion n\'est cliquée', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      const input = refInput('Porteur_2');
      setValue(input, 'Alice');
      fire(input, 'input');
      assertEqual(input.value, 'Alice', 'le texte tapé reste affiché pendant la recherche');
      fire(input, 'blur');
      await wait(200);
      assertEqual(input.value, '', 'sans clic sur une suggestion, le texte libre ne doit pas rester affiché');
      assertEqual(input.dataset.id, '', 'aucun id ne doit être retenu');
    });

    it('ne pousse jamais un Porteur_2 texte-libre : seule une personne cliquée dans la liste est enregistrée', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      const input = refInput('Porteur_2');
      setValue(input, 'Personne qui n\'existe pas');
      fire(input, 'input');
      fire(input, 'blur');
      await wait(200);
      await modalEl().querySelector('[data-cp-save]').onclick();

      const call = window.__TEST_CALLS__[0];
      assertEqual(call.fields.Porteur_2, null, 'un texte non sélectionné ne doit jamais être poussé comme porteur');
    });
  });

  describe('Modale Projet — prévisionnel financier et conventions', function () {
    it('calcule les totaux par année, par ligne et le total général', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      const table = modalEl().querySelector('.cp-fin');
      setValue(table.querySelector('[data-fin="c2026_M10_Fonctionnement"]'), '100');
      fire(table.querySelector('[data-fin="c2026_M10_Fonctionnement"]'), 'input');
      setValue(table.querySelector('[data-fin="c2026_M20_Investissement"]'), '50');
      fire(table.querySelector('[data-fin="c2026_M20_Investissement"]'), 'input');
      setValue(table.querySelector('[data-fin="c2027_M10_Fonctionnement"]'), '30');
      fire(table.querySelector('[data-fin="c2027_M10_Fonctionnement"]'), 'input');

      assertEqual(table.querySelector('[data-total="2026"]').textContent, '150');
      assertEqual(table.querySelector('[data-total="2027"]').textContent, '30');
      assertEqual(table.querySelector('[data-row-total="Details_depense_s_Fonctionnement"]').textContent, '130');
      assertEqual(table.querySelector('[data-grand-total]').textContent, '180');
    });

    it('synchronise les montants partenaires sur le total tant qu\'ils ne sont pas modifiés à la main', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      const table = modalEl().querySelector('.cp-fin');
      const fin = table.querySelector('[data-fin="c2026_M10_Fonctionnement"]');
      setValue(fin, '180');
      fire(fin, 'input');

      const p1 = modalEl().querySelector('#cp-Convention_montant_partenaire_1');
      const p2 = modalEl().querySelector('#cp-Convention_montant_partenaire_2');
      assertEqual(p1.value, '180', 'partenaire 1 doit suivre le total tant qu\'il n\'est pas modifié');
      assertEqual(p2.value, '0');

      setValue(p1, '50');
      fire(p1, 'input');
      assertEqual(p2.value, '130', 'partenaire 2 = total - partenaire 1');

      setValue(fin, '200');
      fire(fin, 'input');
      assertEqual(p1.value, '50', 'partenaire 1 modifié manuellement ne doit plus suivre le total');
      assertEqual(p2.value, '150', 'partenaire 2 continue de suivre (total - partenaire 1 manuel)');
    });
  });

  describe('Modale Projet — stabilité visuelle entre onglets', function () {
    // Ce runner de tests ne charge aucune feuille de style (cf. tests/index.html :
    // "ces tests valident les données/le DOM, pas la mise en page visuelle"), donc
    // une hauteur mesurée via getBoundingClientRect() serait ininterprétable ici
    // (sans CSS, .cp-hidden ne masque rien : tous les panneaux restent empilés,
    // quel que soit l'onglet "actif"). On vérifie donc directement, dans la feuille
    // de style réelle, la règle qui fixe la hauteur de la boîte — sans elle, la
    // boîte reprend sa hauteur au contenu et se redimensionne à chaque onglet.
    it('la feuille de style fixe une hauteur (pas seulement max-height) pour la boîte de la modale Projet', async function () {
      const res = await fetch('../css/creation-projet.css', { cache: 'no-store' });
      const css = await res.text();
      assertTrue(
        /#cp-project-modal\s+\.cp-box\s*\{[^}]*\bheight\s*:/i.test(css),
        'attendu une règle "#cp-project-modal .cp-box { height: ... }" pour empêcher le redimensionnement de la boîte au changement d\'onglet'
      );
    });

    it('rejoue l\'animation d\'entrée sur le panneau qui devient actif', function () {
      window.ProjectModal.open();
      modalEl().querySelector('[data-cp-tab="budget"]').click();
      const panel = modalEl().querySelector('[data-cp-panel="budget"]');
      assertTrue(panel.classList.contains('cp-panel-enter'), 'le panneau nouvellement actif doit recevoir la classe d\'animation d\'entrée');
    });

    it('ne redéclenche pas l\'animation en re-cliquant sur l\'onglet déjà actif', function () {
      window.ProjectModal.open();
      const panel = modalEl().querySelector('[data-cp-panel="general"]');
      panel.classList.remove('cp-panel-enter');
      modalEl().querySelector('[data-cp-tab="general"]').click();
      assertFalse(panel.classList.contains('cp-panel-enter'), 'cliquer sur l\'onglet déjà actif ne doit pas rejouer l\'animation');
    });
  });

  describe('Modale Projet — onglet Budget : saisie numérique stricte', function () {
    it('n\'est plus un <input type="number"> (supprime les flèches natives +/-)', function () {
      window.ProjectModal.open();
      const input = modalEl().querySelector('[data-fin="c2026_M10_Fonctionnement"]');
      assertEqual(input.type, 'text', 'les champs du prévisionnel budgétaire ne doivent plus être type="number"');
    });

    it('filtre la saisie pour ne garder que des chiffres et un seul point décimal', function () {
      window.ProjectModal.open();
      const input = modalEl().querySelector('[data-fin="c2026_M10_Fonctionnement"]');
      setValue(input, '12a3b.4.5xyz');
      fire(input, 'input');
      assertEqual(input.value, '123.45', 'les lettres doivent être retirées et un seul point décimal conservé');
    });
  });

  describe('Modale Projet — champ Instance rattachée dans Dates & OPE', function () {
    it('se trouve dans le panneau Dates & OPE, plus dans Porteurs', function () {
      window.ProjectModal.open();
      assertTrue(!!modalEl().querySelector('[data-cp-panel="dates"] [data-ref="Instance_ratachee"]'), 'Instance_ratachee doit être dans le panneau Dates & OPE');
      assertTrue(!modalEl().querySelector('[data-cp-panel="porteurs"] [data-ref="Instance_ratachee"]'), 'Instance_ratachee ne doit plus être dans le panneau Porteurs');
    });
  });
})();
