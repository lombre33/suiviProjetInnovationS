/**
 * Non-regression suite: page Administratif (js/pages/page-administratif.js).
 * Fixtures (tests/fixtures.js): INNOVX/NOTIFY/SIGNEX have a Notifications row,
 * FINANCX/COURSIX/INCONNUX deliberately don't (must appear in no Notifications
 * panel). CONVENTIX has 2 partners (CNRS, INSERM) + UB; SIGNEX has 1 (UBX) + UB.
 */
(function () {
  'use strict';

  async function loadFixtureState() {
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    window.renderAdministratif();
  }

  function panelIn(colId, label) {
    return Array.from(document.querySelectorAll(`#${colId} .admin-panel`))
      .find(section => section.querySelector('.admin-panel-header h4')?.textContent === label);
  }

  function cardByAcronym(panel, acronym) {
    return panel && Array.from(panel.querySelectorAll('.admin-card'))
      .find(card => card.querySelector('.admin-card-identity .project-acronym')?.textContent === acronym);
  }

  // Doit rester le premier describe/it du fichier : c'est le tout premier rendu
  // de la page Administratif dans la suite, celui qui fixe le repli initial de
  // chaque volet (l'état persiste ensuite entre les tests, cf. page-administratif.js).
  describe('Administratif — un volet vide démarre replié', function () {
    it('un volet sans aucun projet est replié dès le premier rendu ; un volet non vide reste déplié', async function () {
      await loadFixtureState();
      const emptyPanel = panelIn('admin-col-notif', 'Prette pour CTO'); // aucune fiche Notifications ne pointe ici
      assertTrue(!!emptyPanel, 'le volet "Prette pour CTO" doit exister');
      assertTrue(emptyPanel.classList.contains('is-collapsed'), 'un volet vide doit démarrer replié');
      const filledPanel = panelIn('admin-col-notif', 'Information projet saisies');
      assertFalse(filledPanel.classList.contains('is-collapsed'), 'un volet avec des projets ne doit pas démarrer replié');
    });
  });

  describe('Administratif — classement par volet (Notifications)', function () {
    it('place chaque projet dans le volet correspondant à notifications_Statut', async function () {
      await loadFixtureState();
      assertTrue(!!cardByAcronym(panelIn('admin-col-notif', 'Information projet saisies'), 'INNOVX'),
        'INNOVX (1) Information projet saisies) doit être dans le volet correspondant');
      assertTrue(!!cardByAcronym(panelIn('admin-col-notif', 'envoyée pour signature VP'), 'NOTIFY'),
        'NOTIFY (5) envoyée pour signature VP) doit être dans le volet correspondant');
    });

    it('un projet sans fiche Notifications n\'apparaît dans aucun volet Notifications', async function () {
      await loadFixtureState();
      const acronyms = Array.from(document.querySelectorAll('#admin-col-notif .admin-card .project-acronym')).map(el => el.textContent);
      ['FINANCX', 'COURSIX', 'INCONNUX'].forEach(acr =>
        assertFalse(acronyms.includes(acr), `${acr} (pas de fiche Notifications) ne doit apparaître dans aucun volet`));
    });

    it('le dernier volet (Archivee) affiche un badge "Archivée" et aucun bouton étape suivante', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('admin-col-notif', 'Archivee'), 'SIGNEX');
      assertTrue(!!card, 'SIGNEX (8) Archivee) doit être dans le dernier volet');
      assertEqual(card.querySelector('.admin-done-badge')?.textContent, 'Archivée');
      assertFalse(!!card.querySelector('[data-advance-notif]'), 'pas de bouton étape suivante sur le dernier statut');
    });
  });

  describe('Administratif — classement par volet (Conventions)', function () {
    it('place chaque projet dans le volet correspondant à Conventions_statut', async function () {
      await loadFixtureState();
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX'),
        'INNOVX (1) Convention en redaction) doit être dans le volet correspondant');
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en signature UB'), 'CONVENTIX'),
        'CONVENTIX (3) Convention en signature UB) doit être dans le volet correspondant');
    });

    it('le dernier volet (signée) affiche un badge "Signée" et aucun bouton étape suivante', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('admin-col-conv', 'Convention signée de toutes les parties'), 'SIGNEX');
      assertTrue(!!card, 'SIGNEX (5) doit être dans le dernier volet');
      assertEqual(card.querySelector('.admin-done-badge')?.textContent, 'Signée');
      assertFalse(!!card.querySelector('[data-advance-conv]'), 'pas de bouton étape suivante sur le dernier statut');
    });

    it('n\'affiche que l\'acronyme en identité, pas le nom complet du projet', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('admin-col-conv', 'Convention en signature UB'), 'CONVENTIX');
      assertFalse(!!card.querySelector('.admin-card-title'), 'pas de titre "nom complet" sur la carte Conventions');
      assertFalse(card.textContent.includes('Projet Convention'), 'le nom complet du projet ne doit plus apparaître sur la carte');
    });
  });

  describe('Administratif — partenaires (barres de progression par statut)', function () {
    it('affiche l\'UB en premier puis un partenaire par référence Etablissement, pas de progression = "Non relu"', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('admin-col-conv', 'Convention en signature UB'), 'CONVENTIX');
      const pills = card.querySelectorAll('.admin-partner-pill');
      assertEqual(pills.length, 3, 'CONVENTIX doit avoir 3 pastilles : UB + CNRS + INSERM');
      assertEqual(pills[0].querySelector('.admin-partner-name').textContent, 'UB', 'UB doit être la première pastille');
      // partenaire_2 (INSERM) n'a pas de colonne renseignée → doit retomber sur
      // "Non relu" par défaut (barre à 0%), pas planter.
      assertTrue(pills[2].title.includes('Non relu'), 'INSERM sans statut renseigné doit afficher "Non relu"');
      assertEqual(pills[2].querySelector('.admin-partner-fill').style.width, '0%', 'barre de progression vide pour "Non relu"');
    });

    it('un clic sur une pastille fait avancer le statut du partenaire et écrit la colonne Grist exacte', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('admin-col-conv', 'Convention en signature UB'), 'CONVENTIX');
      const insermPill = card.querySelectorAll('.admin-partner-pill')[2];
      fireMouse(insermPill, 'click');
      await wait(0);
      const call = window.__TEST_CALLS__.find(c => c.type === 'UpdateRecord' && c.table === 'Projets' && c.fields.convention_statut_partenaire_2);
      assertTrue(!!call, 'doit écrire convention_statut_partenaire_2 dans Projets');
      assertEqual(call.fields.convention_statut_partenaire_2, 'Relu', 'Non relu → Relu au premier clic');
    });
  });

  describe('Administratif — écriture Grist (bouton "Étape suivante")', function () {
    it('avance notifications_Statut sur la table Notifications (pas sur Projets) avec la chaîne exacte', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('admin-col-notif', 'Information projet saisies'), 'INNOVX');
      fireMouse(card.querySelector('[data-advance-notif]'), 'click');
      await wait(0);
      const call = window.__TEST_CALLS__.find(c => c.type === 'UpdateRecord' && c.table === 'Notifications');
      assertTrue(!!call, 'doit écrire sur la table Notifications');
      assertEqual(call.fields.notifications_Statut, '2) Notification_relecture', 'valeur Grist exacte, avec le préfixe "2) "');
      assertTrue(!!cardByAcronym(panelIn('admin-col-notif', 'Notification_relecture'), 'INNOVX'), 'INNOVX doit être passé au volet suivant');
    });

    it('avance Conventions_statut sur Projets avec la chaîne exacte', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX');
      fireMouse(card.querySelector('[data-advance-conv]'), 'click');
      await wait(0);
      const call = window.__TEST_CALLS__.find(c => c.type === 'UpdateRecord' && c.table === 'Projets' && c.fields.Conventions_statut);
      assertTrue(!!call, 'doit écrire Conventions_statut sur Projets');
      assertEqual(call.fields.Conventions_statut, '2) Convention Relecture Partenaire(s)', 'valeur Grist exacte, avec le préfixe "2) "');
    });

    it('enregistre le commentaire libre partagé sur comentaire_general_Suivi_projet', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('admin-col-notif', 'Information projet saisies'), 'INNOVX');
      const textarea = card.querySelector('[data-comment-project]');
      setValue(textarea, 'Relance porteur le 20/09.');
      fire(textarea, 'blur');
      await wait(0);
      const call = window.__TEST_CALLS__.find(c => c.type === 'UpdateRecord' && c.table === 'Projets' && 'comentaire_general_Suivi_projet' in c.fields);
      assertTrue(!!call, 'doit écrire comentaire_general_Suivi_projet sur Projets');
      assertEqual(call.fields.comentaire_general_Suivi_projet, 'Relance porteur le 20/09.');
    });
  });

  describe('Administratif — volets repliables et masquables (même patron que le Kanban)', function () {
    it('un volet replié cache ses cartes, un volet masqué disparaît et réapparaît via la puce "+ Libellé"', async function () {
      await loadFixtureState();
      const panel = panelIn('admin-col-notif', 'Information projet saisies');
      panel.querySelector('[data-toggle-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const collapsedPanel = panelIn('admin-col-notif', 'Information projet saisies');
      assertTrue(collapsedPanel.classList.contains('is-collapsed'), 'le volet doit être replié');
      collapsedPanel.querySelector('[data-toggle-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true })); // reset

      panelIn('admin-col-notif', 'Information projet saisies').querySelector('[data-hide-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      assertFalse(!!panelIn('admin-col-notif', 'Information projet saisies'), 'le volet masqué ne doit plus être dans le DOM');
      const chip = document.getElementById('admin-hidden-panels').querySelector('[data-restore-panel]');
      assertTrue(!!chip && chip.textContent.includes('Information projet saisies'), 'une puce "+ Information projet saisies" doit apparaître');
      chip.dispatchEvent(new MouseEvent('click', { bubbles: true })); // restore, reset for other tests
      assertTrue(!!panelIn('admin-col-notif', 'Information projet saisies'), 'le volet doit réapparaître après restauration');
    });
  });

  describe('Administratif — bascule cartes / lignes', function () {
    it('la vue par défaut est "lignes", condensée sur une seule ligne par projet, et bascule vers "cartes" au clic', async function () {
      await loadFixtureState();
      const body = document.querySelector('#admin-col-notif .admin-panel-body');
      assertTrue(body.classList.contains('mode-rows'), 'le mode par défaut doit être "lignes"');
      const card = cardByAcronym(panelIn('admin-col-notif', 'Information projet saisies'), 'INNOVX');
      assertEqual(getComputedStyle(card).flexDirection, 'row', 'en mode lignes, une carte est une rangée horizontale (une seule ligne), pas empilée');
      document.getElementById('admin-toggle-view').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      assertTrue(document.querySelector('#admin-col-notif .admin-panel-body').classList.contains('mode-cards'), 'après bascule, mode "cartes"');
      document.getElementById('admin-toggle-view').dispatchEvent(new MouseEvent('click', { bubbles: true })); // reset pour les autres tests
    });
  });

  describe('Administratif — sous-onglets Notifications / Conventions (bandeau de filtre)', function () {
    it('Notifications est actif par défaut ; cliquer sur Conventions bascule l\'affichage sans repasser en 2 colonnes', async function () {
      await loadFixtureState();
      const notifTab = document.querySelector('[data-admin-tab="notif"]');
      const convTab = document.querySelector('[data-admin-tab="conv"]');
      const notifPanel = document.querySelector('[data-admin-panel="notif"]');
      const convPanel = document.querySelector('[data-admin-panel="conv"]');
      assertTrue(notifTab.classList.contains('is-active'), 'Notifications doit être l\'onglet actif par défaut');
      assertEqual(notifTab.getAttribute('aria-selected'), 'true');
      assertFalse(notifPanel.classList.contains('is-hidden'), 'le volet Notifications doit être visible par défaut');
      assertTrue(convPanel.classList.contains('is-hidden'), 'le volet Conventions doit être masqué par défaut');

      fireMouse(convTab, 'click');

      assertTrue(convTab.classList.contains('is-active'), 'Conventions doit devenir l\'onglet actif');
      assertEqual(convTab.getAttribute('aria-selected'), 'true');
      assertFalse(document.querySelector('[data-admin-panel="conv"]').classList.contains('is-hidden'), 'le volet Conventions doit devenir visible');
      assertTrue(document.querySelector('[data-admin-panel="notif"]').classList.contains('is-hidden'), 'le volet Notifications doit être masqué');
      assertFalse(document.querySelector('[data-admin-tab="notif"]').classList.contains('is-active'), 'Notifications ne doit plus être actif');

      fireMouse(document.querySelector('[data-admin-tab="notif"]'), 'click'); // reset pour les autres tests
    });
  });

  describe('Administratif — préférences utilisateur persistées (table Preferences_Widget, partagée avec le Kanban)', function () {
    it('ajoute ses colonnes Admin_* à la table Preferences_Widget si elle existe déjà (créée par le Kanban)', async function () {
      await loadFixtureState();
      await window.loadKanbanUserPreferences();
      const before = await window.CoreGrist.getTable('Preferences_Widget');
      assertFalse('Admin_notif_repliees' in before[0], 'la colonne Admin_notif_repliees ne doit pas exister avant le chargement Administratif');

      await window.loadAdministratifUserPreferences();

      const after = await window.CoreGrist.getTable('Preferences_Widget');
      assertTrue('Admin_notif_repliees' in after[0], 'la colonne Admin_notif_repliees doit avoir été ajoutée');
      const addColumnCalls = window.__TEST_CALLS__.filter(c => c.type === 'AddColumn' && c.table === 'Preferences_Widget');
      assertEqual(addColumnCalls.length, 4, 'les 4 colonnes Admin_notif/conv_repliees/masquees doivent être ajoutées');
      const addTableCalls = window.__TEST_CALLS__.filter(c => c.type === 'AddTable' && c.table === 'Preferences_Widget');
      assertEqual(addTableCalls.length, 1, 'la table ne doit pas être recréée, seulement complétée');
    });

    it('crée elle-même la table (avec ses colonnes) si le Kanban ne l\'a pas encore fait', async function () {
      await loadFixtureState();
      const before = await window.CoreGrist.gristInstance.docApi.listTables();
      assertFalse(before.includes('Preferences_Widget'), 'la table ne doit pas exister avant tout chargement de préférences');

      await window.loadAdministratifUserPreferences();

      const rows = await window.CoreGrist.getTable('Preferences_Widget');
      assertEqual(rows.length, 1, 'une ligne doit avoir été créée');
      assertTrue('Admin_notif_repliees' in rows[0], 'la table auto-créée doit inclure les colonnes Admin_*');
    });

    it('réutilise la même ligne que le Kanban (id de ligne partagé via localStorage), sans doublon d\'AddRecord', async function () {
      await loadFixtureState();
      await window.loadKanbanUserPreferences();
      await window.loadAdministratifUserPreferences();
      const addRecordCalls = window.__TEST_CALLS__.filter(c => c.type === 'AddRecord' && c.table === 'Preferences_Widget');
      assertEqual(addRecordCalls.length, 1, 'Kanban et Administratif doivent partager la même ligne, pas en créer une seconde');
    });

    it('encode les volets repliés/masqués en liste d\'index séparés par virgules et enregistre par UpdateRecord', async function () {
      await loadFixtureState();
      await window.loadKanbanUserPreferences();
      await window.loadAdministratifUserPreferences();

      panelIn('admin-col-notif', 'Information projet saisies').querySelector('[data-toggle-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(0);
      panelIn('admin-col-notif', 'envoyée pour signature VP').querySelector('[data-hide-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(0);

      const rows = await window.CoreGrist.getTable('Preferences_Widget');
      assertEqual(rows.length, 1, 'toujours une seule ligne de préférences');
      // Index 0 explicitement replié ci-dessus ; 1/2/3/6 sont repliés par défaut
      // dès le premier rendu de la suite car ces volets n'ont aucun projet
      // (cf. fixtures Notifications) — comportement attendu, pas une régression.
      const collapsedNotif = rows[0].Admin_notif_repliees.split(',').map(Number).sort((a, b) => a - b);
      assertDeepEqual(collapsedNotif, [0, 1, 2, 3, 6], 'les volets vides par défaut + celui explicitement replié doivent être encodés');
      assertEqual(rows[0].Admin_notif_masquees, '4', 'le volet "envoyée pour signature VP" (index 4) doit être encodé comme masqué');

      // Nettoyage : restaurer l'état par défaut pour ne pas polluer les tests suivants.
      panelIn('admin-col-notif', 'Information projet saisies').querySelector('[data-toggle-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.getElementById('admin-hidden-panels').querySelector('[data-restore-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(0);
    });

    it('restaure l\'état des volets (repliés/masqués) à un rechargement ultérieur, dans le même navigateur', async function () {
      await loadFixtureState();
      await window.loadKanbanUserPreferences();
      await window.loadAdministratifUserPreferences();

      panelIn('admin-col-notif', 'Information projet saisies').querySelector('[data-toggle-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(0);
      panelIn('admin-col-notif', 'envoyée pour signature VP').querySelector('[data-hide-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(0);

      // Simule un rechargement de page : l'id de ligne reste en cache
      // (localStorage), un second appel doit donc retrouver et réappliquer
      // exactement cet état, sans créer de nouvelle ligne.
      await window.loadAdministratifUserPreferences();
      window.renderAdministratif();

      assertTrue(panelIn('admin-col-notif', 'Information projet saisies').classList.contains('is-collapsed'), 'le volet doit rester replié après rechargement');
      assertFalse(!!panelIn('admin-col-notif', 'envoyée pour signature VP'), 'le volet doit rester masqué après rechargement');

      const addRecordCalls = window.__TEST_CALLS__.filter(c => c.type === 'AddRecord' && c.table === 'Preferences_Widget');
      assertEqual(addRecordCalls.length, 1, 'le rechargement ne doit pas créer de nouvelle ligne de préférences');

      // Nettoyage : restaurer l'état par défaut pour ne pas polluer les tests suivants.
      panelIn('admin-col-notif', 'Information projet saisies').querySelector('[data-toggle-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.getElementById('admin-hidden-panels').querySelector('[data-restore-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(0);
    });
  });

  describe('Administratif — échappement HTML des données Grist', function () {
    it('échappe l\'acronyme avant de l\'insérer dans le HTML', async function () {
      const tables = await window.CoreGrist.loadAllTables();
      tables.Projets[0].Acronyme = '<img src=x onerror=alert(1)>';
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      assertFalse(document.querySelector('#admin-col-notif').innerHTML.includes('<img src=x'), 'le HTML brut ne doit jamais être injecté');
    });
  });
})();
