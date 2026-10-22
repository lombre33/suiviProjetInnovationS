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

  // Remplit tous les champs obligatoires à la création (cf. validateRequiredFields()
  // dans project-modal.js, demande d'Antoine du 13/10/2026) : Programme, Projet,
  // Acronyme, Type de projet (valeur par défaut déjà posée), Porteur 1, VP porteur,
  // Accompagnateur, Instance rattachée, Date limite de financement, Action ligne OPE,
  // et un budget total non nul.
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
    const opeChip = modalEl().querySelector('.cp-chip-row [data-value="Creation de ligne"]');
    opeChip.click();
    const fin = modalEl().querySelector('[data-fin="c2026_M10_Fonctionnement"]');
    setValue(fin, '1000');
    fire(fin, 'input');
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
      // Bug signalé par Antoine le 22/10/2026 : VP porteur doit être poussé dans
      // VP_porteur_signataire_notif, pas dans VP_porteur_2 (colonne Grist distincte).
      assertEqual(call.fields.VP_porteur_signataire_notif, 2, 'VP porteur doit être poussé dans VP_porteur_signataire_notif');
      assertEqual(call.fields.VP_porteur_2, undefined, 'VP_porteur_2 ne doit plus jamais être écrit par la modale');
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

    // Bug signalé par Antoine le 16/10/2026 : "Date limite de financement" (et les deux
    // autres champs date) n'affichait rien en édition. Cause : Grist stocke une colonne
    // Date() en timestamp Unix (secondes, un nombre), jamais en chaîne ISO — l'ancienne
    // fonction locale dateInputValue() se contentait de découper une chaîne, ce qui
    // laissait le <input type="date"> avec une valeur invalide (silencieusement vidée
    // par le navigateur). Les fixtures de ces 3 champs sont toujours à null, d'où le
    // test ici avec un enregistrement modifié plutôt que la fixture partagée.
    it('affiche la date dans les champs Date_limite_financement/Date_debut_Projet/Date_de_fin_Projet en édition', async function () {
      const tables = await loadFixtureState();
      const base = tables.Projets.find(p => p.Acronyme === 'INNOVX');
      const record = { ...base, Date_limite_financement: 1805500800, Date_debut_Projet: 1798675200, Date_de_fin_Projet: 1830297600 };
      window.ProjectModal.open(record);
      assertEqual(modalEl().querySelector('#cp-Date_limite_financement').value, '2027-03-20');
      assertEqual(modalEl().querySelector('#cp-Date_debut_Projet').value, '2026-12-31');
      assertEqual(modalEl().querySelector('#cp-Date_de_fin_Projet').value, '2028-01-01');
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

    // Bugs signalés par Antoine le 22/10/2026 (capture à l'appui) sur le champ rapporté
    // "Installée chez" : 1) affichait le brut Grist "L,43" (String(['L', 43])) au lieu du
    // nom de la structure, 2) ne se mettait pas à jour tant qu'on changeait la ligne OPE
    // dans la modale sans la réenregistrer. Cause commune : le champ lisait directement
    // la formule Ligne_OPE_installe_chez (ReferenceList, recalculée côté Grist seulement
    // après sauvegarde) au lieu de la recalculer lui-même depuis la ligne OPE réellement
    // sélectionnée.
    it('"Installée chez (rapporté)" affiche le nom de la structure en édition, jamais le brut Grist ("L,43")', async function () {
      const tables = await loadFixtureState();
      const record = tables.Projets.find(p => p.Acronyme === 'INNOVX');
      window.ProjectModal.open(record);
      assertEqual(modalEl().querySelector('#cp-Ligne_OPE_installe_chez').value, 'LAB1',
        'doit résoudre la Structure réelle de la ligne OPE, pas afficher ["L", id] tel quel');
    });

    it('"Installée chez (rapporté)" se met à jour sans réenregistrer quand on choisit une autre ligne OPE existante', async function () {
      const tables = await loadFixtureState();
      const record = tables.Projets.find(p => p.Acronyme === 'INNOVX');
      window.ProjectModal.open(record);
      assertEqual(modalEl().querySelector('#cp-Ligne_OPE_installe_chez').value, 'LAB1');
      pickRef('Ligne_OPE', 'OPE-2026-002', 'OPE-2026-002');
      assertEqual(modalEl().querySelector('#cp-Ligne_OPE_installe_chez').value, 'DIR1',
        'changer de ligne OPE dans la modale doit recalculer "Installée chez" tout de suite');
    });

    it('"Installée chez (rapporté)" se vide quand on retire la ligne OPE (croix de suppression)', async function () {
      const tables = await loadFixtureState();
      const record = tables.Projets.find(p => p.Acronyme === 'INNOVX');
      window.ProjectModal.open(record);
      assertEqual(modalEl().querySelector('#cp-Ligne_OPE_installe_chez').value, 'LAB1');
      fireMouse(refInput('Ligne_OPE').parentElement.querySelector('.cp-ref-clear'), 'mousedown');
      assertEqual(modalEl().querySelector('#cp-Ligne_OPE_installe_chez').value, '', 'retirer la ligne OPE doit aussi vider le champ rapporté');
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

  describe('Modale Projet — champs référence affichés "en bulle" avec croix de suppression', function () {
    it('passe en "bulle" (cp-ref-has-value) dès qu\'une valeur est sélectionnée, puis en sort si on retape', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      const input = refInput('Porteur_1');
      assertTrue(!input.closest('.cp-ref').classList.contains('cp-ref-has-value'), 'pas de bulle tant qu\'aucune valeur n\'est retenue');

      pickRef('Porteur_1', 'Alice', 'Alice Martin');
      assertTrue(input.closest('.cp-ref').classList.contains('cp-ref-has-value'), 'la bulle doit apparaître une fois une personne sélectionnée');

      fire(input, 'input');
      assertTrue(!input.closest('.cp-ref').classList.contains('cp-ref-has-value'), 'retaper doit faire sortir du mode bulle (la valeur n\'est plus retenue tant que rien n\'est recliqué)');
    });

    it('la croix de suppression retire la valeur retenue sans ouvrir la fiche personne', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      pickRef('Porteur_1', 'Alice', 'Alice Martin');
      const input = refInput('Porteur_1');
      assertEqual(input.dataset.id, '1');

      const original = window.openEditPersonModal;
      let editOpened = false;
      window.openEditPersonModal = () => { editOpened = true; };
      try {
        const clearBtn = input.closest('.cp-ref').querySelector('.cp-ref-clear');
        assertTrue(!!clearBtn, 'un bouton de suppression doit exister sur le champ référence');
        clearBtn.onmousedown(fakeEvent());
      } finally {
        window.openEditPersonModal = original;
      }

      assertEqual(input.value, '', 'la croix doit vider le champ');
      assertEqual(input.dataset.id, '', 'la croix doit retirer l\'id retenu');
      assertTrue(!input.closest('.cp-ref').classList.contains('cp-ref-has-value'), 'la bulle doit disparaître après suppression');
      assertFalse(editOpened, 'cliquer la croix ne doit pas ouvrir la fiche personne (contrairement à un clic sur la bulle elle-même)');
    });

    it('ne pousse plus le porteur retiré via la croix lors de l\'enregistrement', async function () {
      // Porteur_3 reste optionnel (contrairement à Accompagnateur, devenu obligatoire
      // le 13/10/2026) : on peut donc le vider puis enregistrer sans être bloqué par
      // validateRequiredFields().
      await loadFixtureState();
      await fillMinimalValidProject();
      pickRef('Porteur_3', 'Bob', 'Bob Durand');
      const input = refInput('Porteur_3');
      input.closest('.cp-ref').querySelector('.cp-ref-clear').onmousedown(fakeEvent());

      await modalEl().querySelector('[data-cp-save]').onclick();
      const call = window.__TEST_CALLS__[0];
      assertEqual(call.fields.Porteur_3, null, 'le champ vidé via la croix ne doit pas être enregistré');
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

  describe('Modale Projet — champs obligatoires à la création (13/10/2026)', function () {
    it('liste les champs manquants dans le message d\'erreur et bascule sur le premier onglet concerné (de gauche à droite)', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      pickRef('Programme', 'Programme A', 'Programme A');
      setValue(modalEl().querySelector('#cp-Projet'), 'Mon nouveau projet');
      setValue(modalEl().querySelector('#cp-Acronyme'), 'MNP');
      // Rien dans Porteurs/Dates/Budget : le premier onglet avec un champ manquant,
      // en partant de la gauche (Général, Porteurs, Dates & OPE, Budget, Convention),
      // est Porteurs.
      modalEl().querySelector('[data-cp-tab="budget"]').click();
      assertEqual(modalEl().dataset.activeTab, 'budget');

      await modalEl().querySelector('[data-cp-save]').onclick();

      const error = modalEl().querySelector('#cp-project-error').textContent;
      assertIncludes(error, 'Porteur 1');
      assertIncludes(error, 'VP porteur');
      assertIncludes(error, 'Accompagnateur');
      assertIncludes(error, 'Instance rattachée');
      assertIncludes(error, 'Date limite de financement');
      assertIncludes(error, 'Action ligne OPE');
      assertIncludes(error, 'Budget');
      assertTrue(!error.includes('Programme'), 'Programme est déjà rempli, il ne doit pas apparaître dans les champs manquants');
      assertTrue(!error.includes('Acronyme'), 'Acronyme est déjà rempli, il ne doit pas apparaître dans les champs manquants');
      assertEqual(modalEl().dataset.activeTab, 'porteurs', 'doit basculer sur le premier onglet incomplet en partant de la gauche (Porteurs), pas rester sur Budget');
      assertEqual(window.__TEST_CALLS__.length, 0, 'aucun appel Grist tant que des champs obligatoires manquent');
    });

    it('bascule sur Budget si seul le budget total est manquant (tous les autres champs remplis)', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      setValue(modalEl().querySelector('[data-fin="c2026_M10_Fonctionnement"]'), '0');
      fire(modalEl().querySelector('[data-fin="c2026_M10_Fonctionnement"]'), 'input');

      await modalEl().querySelector('[data-cp-save]').onclick();

      assertIncludes(modalEl().querySelector('#cp-project-error').textContent, 'Budget');
      assertEqual(modalEl().dataset.activeTab, 'budget');
      assertEqual(window.__TEST_CALLS__.length, 0);
    });

    it('Convention de reversement cochée : exige au moins un partenaire et un montant non nul', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      const checkbox = modalEl().querySelector('#cp-Convention_de_reversement');
      checkbox.checked = true;
      fire(checkbox, 'change');
      setValue(modalEl().querySelector('#cp-Convention_montant_partenaire_1'), '0');
      setValue(modalEl().querySelector('#cp-Convention_montant_partenaire_2'), '0');

      await modalEl().querySelector('[data-cp-save]').onclick();

      const error = modalEl().querySelector('#cp-project-error').textContent;
      assertIncludes(error, 'Partenaire');
      assertIncludes(error, 'Montant de convention');
      assertEqual(modalEl().dataset.activeTab, 'conventions');
      assertEqual(window.__TEST_CALLS__.length, 0);
    });

    it('Convention de reversement décochée : aucune exigence sur partenaires/montant', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      assertFalse(modalEl().querySelector('#cp-Convention_de_reversement').checked, 'décochée par défaut');

      await modalEl().querySelector('[data-cp-save]').onclick();

      assertEqual(window.__TEST_CALLS__.length, 1, 'la création doit réussir sans convention activée');
    });

    it('n\'applique aucune validation de champs obligatoires en édition (une fiche ancienne incomplète reste modifiable)', async function () {
      const tables = await loadFixtureState();
      // INNOVX (fixture) n'a ni VP_porteur_signataire_notif, ni Date_limite_financement, ni Action
      // ligne OPE renseignés — désormais tous obligatoires à la création, mais pas
      // en édition : la fiche doit rester enregistrable telle quelle.
      const record = tables.Projets.find(p => p.Acronyme === 'INNOVX');
      window.ProjectModal.open(record);
      assertEqual(refInput('VP_porteur_signataire_notif').dataset.id, '', 'VP porteur non renseigné dans la fixture');
      assertEqual(modalEl().querySelector('#cp-Date_limite_financement').value, '', 'Date limite de financement non renseignée dans la fixture');

      await modalEl().querySelector('[data-cp-save]').onclick();

      assertEqual(window.__TEST_CALLS__.length, 1, 'l\'édition doit réussir malgré les champs obligatoires manquants');
      assertEqual(window.__TEST_CALLS__[0].type, 'UpdateRecord');
      assertEqual(modalEl().querySelector('#cp-project-error').textContent, '');
    });

    // Demande d'Antoine du 22/10/2026 : en édition, ne jamais bloquer l'enregistrement
    // (déjà le cas ci-dessus), mais afficher un bandeau orange (non bloquant, distinct
    // du message d'erreur rouge) listant ce qui manque encore.
    it('affiche un bandeau orange listant les champs obligatoires manquants en édition, sans bloquer', async function () {
      const tables = await loadFixtureState();
      const record = tables.Projets.find(p => p.Acronyme === 'INNOVX');
      window.ProjectModal.open(record);
      const warning = modalEl().querySelector('#cp-project-warning');
      assertIncludes(warning.textContent, 'VP porteur');
      assertIncludes(warning.textContent, 'Date limite de financement');
      assertIncludes(warning.textContent, 'Action ligne OPE');

      await modalEl().querySelector('[data-cp-save]').onclick();
      assertEqual(window.__TEST_CALLS__.length, 1, 'le bandeau est informatif, il ne doit jamais bloquer l\'enregistrement');
    });

    it('n\'affiche aucun bandeau en édition quand tous les champs obligatoires sont déjà remplis', async function () {
      const tables = await loadFixtureState();
      // INNOVX (fixture) n'a que 3 champs manquants : VP porteur, Date limite de
      // financement et Action ligne OPE (Porteur_1/Accompagnateur/Instance_ratachee/
      // budget sont déjà renseignés) — on les complète pour obtenir un cas réellement
      // complet et vérifier que le bandeau se vide en conséquence.
      const record = tables.Projets.find(p => p.Acronyme === 'INNOVX');
      window.ProjectModal.open(record);
      pickRef('VP_porteur_signataire_notif', 'Bob', 'Bob Durand');
      setValue(modalEl().querySelector('#cp-Date_limite_financement'), '2027-01-15');
      const opeChip = modalEl().querySelector('.cp-chip-row [data-value="Creation de ligne"]');
      opeChip.click();
      // Le bandeau ne se recalcule qu'à l'ouverture et au clic sur Enregistrer (comme la
      // validation de création) : on déclenche donc l'enregistrement pour le rafraîchir.
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertEqual(modalEl().querySelector('#cp-project-warning').textContent, '', 'plus aucun champ manquant : le bandeau doit rester vide');
    });

    it('n\'affiche jamais le bandeau orange en création (le message rouge bloquant suffit)', function () {
      window.ProjectModal.open();
      assertEqual(modalEl().querySelector('#cp-project-warning').textContent, '', 'pas de bandeau orange en création');
    });
  });

  describe('Modale Projet — champ Instance rattachée dans Dates & OPE', function () {
    it('se trouve dans le panneau Dates & OPE, plus dans Porteurs', function () {
      window.ProjectModal.open();
      assertTrue(!!modalEl().querySelector('[data-cp-panel="dates"] [data-ref="Instance_ratachee"]'), 'Instance_ratachee doit être dans le panneau Dates & OPE');
      assertTrue(!modalEl().querySelector('[data-cp-panel="porteurs"] [data-ref="Instance_ratachee"]'), 'Instance_ratachee ne doit plus être dans le panneau Porteurs');
    });
  });

  // Pré-remplissages demandés le 15/10/2026 : uniquement à la création (jamais en
  // édition), le champ reste modifiable/effaçable ensuite. Les fixtures standards
  // (Annuaire sans "Etienne DUGUET", Suivi_Instance sans colonne `date`) ne
  // déclenchent aucun pré-remplissage : déjà couvert par les tests "champs
  // obligatoires" plus haut, qui s'appuient sur ces deux champs restant vides.
  describe('Modale Projet — pré-remplissage VP porteur (Etienne DUGUET) à la création (15/10/2026)', function () {
    function addAnnuaireRow(row) {
      const current = window.CoreState.getTable('Annuaire');
      window.CoreState.setTable('Annuaire', [...current, row]);
      return row.id;
    }

    it('pré-remplit VP porteur quand une seule fiche "Etienne DUGUET" existe (insensible aux accents)', async function () {
      const tables = await loadFixtureState();
      const id = Math.max(...tables.Annuaire.map(r => r.id)) + 1;
      addAnnuaireRow({ id, NOM: 'DUGUET', Prenom: 'Étienne', nom_et_Prenom: 'Étienne DUGUET' });
      window.ProjectModal.open();
      assertEqual(refInput('VP_porteur_signataire_notif').dataset.id, String(id), 'Étienne DUGUET doit être pré-rempli comme VP porteur à la création');
      assertEqual(refInput('VP_porteur_signataire_notif').value, 'Étienne DUGUET');
    });

    it('ne pré-remplit rien si plusieurs fiches "Etienne DUGUET" existent (ambigu)', async function () {
      const tables = await loadFixtureState();
      const base = Math.max(...tables.Annuaire.map(r => r.id));
      addAnnuaireRow({ id: base + 1, NOM: 'DUGUET', Prenom: 'Etienne', nom_et_Prenom: 'Etienne DUGUET' });
      addAnnuaireRow({ id: base + 2, NOM: 'DUGUET', Prenom: 'Etienne', nom_et_Prenom: 'Etienne DUGUET' });
      window.ProjectModal.open();
      assertEqual(refInput('VP_porteur_signataire_notif').dataset.id, '', 'deux fiches correspondantes : trop ambigu pour en présélectionner une');
    });

    it('la valeur pré-remplie reste modifiable et effaçable', async function () {
      const tables = await loadFixtureState();
      const id = Math.max(...tables.Annuaire.map(r => r.id)) + 1;
      addAnnuaireRow({ id, NOM: 'DUGUET', Prenom: 'Etienne', nom_et_Prenom: 'Etienne DUGUET' });
      window.ProjectModal.open();
      assertEqual(refInput('VP_porteur_signataire_notif').dataset.id, String(id));
      pickRef('VP_porteur_signataire_notif', 'Alice', 'Alice Martin');
      assertEqual(refInput('VP_porteur_signataire_notif').dataset.id, '1', 'doit pouvoir remplacer la valeur pré-remplie par un autre choix');
      refInput('VP_porteur_signataire_notif').closest('.cp-ref').querySelector('.cp-ref-clear').onmousedown(fakeEvent());
      assertEqual(refInput('VP_porteur_signataire_notif').dataset.id, '', 'doit pouvoir effacer la valeur pré-remplie via la croix');
    });

    it('ne s\'applique pas en édition, même si une fiche "Etienne DUGUET" correspond', async function () {
      const tables = await loadFixtureState();
      const id = Math.max(...tables.Annuaire.map(r => r.id)) + 1;
      addAnnuaireRow({ id, NOM: 'DUGUET', Prenom: 'Etienne', nom_et_Prenom: 'Etienne DUGUET' });
      const record = window.CoreState.getTable('Projets').find(p => p.Acronyme === 'INNOVX');
      window.ProjectModal.open(record);
      assertEqual(refInput('VP_porteur_signataire_notif').dataset.id, '', 'INNOVX n\'a pas de VP porteur dans la fixture : l\'édition ne doit pas en choisir un à sa place');
    });
  });

  describe('Modale Projet — pré-remplissage Instance rattachée (date la plus proche) à la création (15/10/2026)', function () {
    function daysFromNow(days) { return Math.floor(Date.now() / 1000) + days * 86400; }

    it('choisit la prochaine instance à venir plutôt qu\'une passée ou plus lointaine', async function () {
      await loadFixtureState();
      window.CoreState.setTable('Suivi_Instance', [
        { id: 1, Nom: 'Comité passé', date: daysFromNow(-30) },
        { id: 2, Nom: 'Comité prochain', date: daysFromNow(10) },
        { id: 3, Nom: 'Comité plus tard', date: daysFromNow(60) }
      ]);
      window.ProjectModal.open();
      assertEqual(refInput('Instance_ratachee').dataset.id, '2', 'doit choisir la plus proche instance à venir');
    });

    it('retombe sur l\'instance passée la plus récente si aucune n\'est à venir', async function () {
      await loadFixtureState();
      window.CoreState.setTable('Suivi_Instance', [
        { id: 1, Nom: 'Comité ancien', date: daysFromNow(-90) },
        { id: 2, Nom: 'Comité récent', date: daysFromNow(-5) }
      ]);
      window.ProjectModal.open();
      assertEqual(refInput('Instance_ratachee').dataset.id, '2', 'doit choisir la plus récente passée en l\'absence d\'instance à venir');
    });

    it('laisse le champ vide si aucune instance n\'a de date renseignée', async function () {
      await loadFixtureState();
      window.CoreState.setTable('Suivi_Instance', [{ id: 1, Nom: 'Comité sans date' }]);
      window.ProjectModal.open();
      assertEqual(refInput('Instance_ratachee').dataset.id, '', 'aucune date connue : ne doit rien présélectionner');
    });

    it('la valeur pré-remplie reste modifiable', async function () {
      await loadFixtureState();
      window.CoreState.setTable('Suivi_Instance', [
        { id: 1, Nom: 'Comité passé', date: daysFromNow(-30) },
        { id: 2, Nom: 'Comité prochain', date: daysFromNow(10) }
      ]);
      window.ProjectModal.open();
      assertEqual(refInput('Instance_ratachee').dataset.id, '2');
      pickRef('Instance_ratachee', 'Comité passé', 'Comité passé');
      assertEqual(refInput('Instance_ratachee').dataset.id, '1', 'doit pouvoir remplacer la valeur pré-remplie par un autre choix');
    });

    it('ne s\'applique pas en édition', async function () {
      await loadFixtureState();
      window.CoreState.setTable('Suivi_Instance', [{ id: 99, Nom: 'Comité prochain', date: daysFromNow(10) }]);
      const record = window.CoreState.getTable('Projets').find(p => p.Acronyme === 'NOTIFY');
      window.ProjectModal.open(record);
      assertEqual(refInput('Instance_ratachee').dataset.id, '', 'NOTIFY n\'a pas d\'instance rattachée dans la fixture : l\'édition ne doit pas en choisir une à sa place');
    });
  });

  // Demande d'Antoine du 22/10/2026 : « flèche du bas ne permet pas de naviguer dans
  // le dropdown » — CoreUtils.wireRefListKeyNav() (js/core/utils.js), branché sur
  // refField() ET multiRefField(). Ces tests vérifient le vrai déplacement (pas
  // seulement "une touche ne plante pas") en identifiant l'option surlignée par son
  // texte avant/après chaque touche.
  describe('Modale Projet — navigation clavier dans les dropdowns de recherche', function () {
    it('Programme (refField) : les flèches déplacent la surbrillance avec effet de boucle, Entrée valide l\'option surlignée', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      const input = refInput('Programme');
      setValue(input, 'Programme');
      fire(input, 'input');
      const list = input.parentElement.querySelector('.cp-ref-list');
      const buttons = () => Array.from(list.querySelectorAll('button'));
      assertEqual(buttons().length, 2, 'les fixtures proposent deux programmes (Programme A, Programme B)');

      fireKey(input, 'ArrowDown');
      assertTrue(buttons()[0].classList.contains('is-active'), 'la première flèche bas doit surligner la première option');
      fireKey(input, 'ArrowDown');
      assertFalse(buttons()[0].classList.contains('is-active'), 'la surbrillance doit quitter la première option');
      assertTrue(buttons()[1].classList.contains('is-active'), 'la deuxième flèche bas doit surligner la deuxième option');
      fireKey(input, 'ArrowDown');
      assertTrue(buttons()[0].classList.contains('is-active'), 'après la dernière option, la flèche bas doit boucler sur la première');
      fireKey(input, 'ArrowUp');
      assertTrue(buttons()[1].classList.contains('is-active'), 'depuis la première option, la flèche haut doit boucler sur la dernière');

      fireKey(input, 'Enter');
      assertEqual(input.value, 'Programme B', 'Entrée doit valider l\'option surlignée (la deuxième), pas la première');
      assertTrue(!!input.dataset.id, 'un id doit être retenu après une sélection au clavier');
      assertTrue(list.classList.contains('cp-hidden'), 'la liste doit se refermer après Entrée');
    });

    it('Programme (refField) : Échap referme la liste sans rien valider', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      const input = refInput('Programme');
      setValue(input, 'Programme A');
      fire(input, 'input');
      const list = input.parentElement.querySelector('.cp-ref-list');
      assertFalse(list.classList.contains('cp-hidden'), 'la liste doit être ouverte avant Échap');
      fireKey(input, 'Escape');
      assertTrue(list.classList.contains('cp-hidden'), 'Échap doit refermer la liste');
      assertEqual(input.dataset.id, '', 'Échap ne doit valider aucune option');
    });

    it('Partenaire(s) de convention (multiRefField) : les flèches déplacent la surbrillance, Entrée ajoute la bonne puce', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      const input = refInput('Partenaire_s_convention_reversement');
      fire(input, 'focus');
      const list = input.parentElement.querySelector('.cp-ref-list');
      const buttons = () => Array.from(list.querySelectorAll('button'));
      assertTrue(buttons().length >= 2, 'les fixtures Etablissements proposent plusieurs partenaires');
      const secondLabel = buttons()[1].textContent;

      fireKey(input, 'ArrowDown');
      fireKey(input, 'ArrowDown');
      assertTrue(buttons()[1].classList.contains('is-active'), 'la deuxième flèche bas doit surligner la deuxième option');

      fireKey(input, 'Enter');
      const chips = input.parentElement.querySelector('.cp-ref-chips');
      assertIncludes(chips.textContent, secondLabel, 'Entrée doit ajouter la puce de l\'option surlignée (la deuxième), pas la première');
      assertEqual(chips.children.length, 1, 'une seule puce ajoutée');
    });

    it('Partenaire(s) de convention (multiRefField) : Échap referme la liste sans ajouter de puce', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      const input = refInput('Partenaire_s_convention_reversement');
      fire(input, 'focus');
      const list = input.parentElement.querySelector('.cp-ref-list');
      assertFalse(list.classList.contains('cp-hidden'), 'la liste doit être ouverte avant Échap');
      fireKey(input, 'Escape');
      assertTrue(list.classList.contains('cp-hidden'), 'Échap doit refermer la liste');
      assertEqual(input.parentElement.querySelector('.cp-ref-chips').children.length, 0, 'Échap ne doit ajouter aucune puce');
    });
  });
})();
