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

  function cardByTitle(panel, title) {
    return panel && Array.from(panel.querySelectorAll('.admin-card'))
      .find(card => card.querySelector('.admin-card-title')?.textContent === title);
  }

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
      assertTrue(!!cardByTitle(panelIn('admin-col-conv', 'Convention en redaction'), 'Projet Instruction'),
        'Projet Instruction (1) Convention en redaction) doit être dans le volet correspondant');
      assertTrue(!!cardByTitle(panelIn('admin-col-conv', 'Convention en signature UB'), 'Projet Convention'),
        'Projet Convention (3) Convention en signature UB) doit être dans le volet correspondant');
    });

    it('le dernier volet (signée) affiche un badge "Signée" et aucun bouton étape suivante', async function () {
      await loadFixtureState();
      const card = cardByTitle(panelIn('admin-col-conv', 'Convention signée de toutes les parties'), 'Projet ConventionSignee');
      assertTrue(!!card, 'Projet ConventionSignee (5) doit être dans le dernier volet');
      assertEqual(card.querySelector('.admin-done-badge')?.textContent, 'Signée');
      assertFalse(!!card.querySelector('[data-advance-conv]'), 'pas de bouton étape suivante sur le dernier statut');
    });
  });

  describe('Administratif — partenaires (bulles + mini-stepper de 3 points)', function () {
    it('affiche l\'UB en premier puis un partenaire par référence Etablissement, pas de puce = "Non relu"', async function () {
      await loadFixtureState();
      const card = cardByTitle(panelIn('admin-col-conv', 'Convention en signature UB'), 'Projet Convention');
      const pills = card.querySelectorAll('.admin-partner-pill');
      assertEqual(pills.length, 3, 'CONVENTIX doit avoir 3 bulles : UB + CNRS + INSERM');
      assertEqual(pills[0].querySelector('span').textContent, 'UB', 'UB doit être la première bulle');
      // partenaire_2 (INSERM) n'a pas de colonne renseignée → doit retomber sur
      // "Non relu" par défaut (0 point rempli), pas planter.
      const insermDots = pills[2].querySelectorAll('.admin-partner-dot.is-filled');
      assertEqual(insermDots.length, 0, 'INSERM sans statut renseigné doit afficher "Non relu" (0 point)');
    });

    it('un clic sur une bulle fait avancer le statut du partenaire et écrit la colonne Grist exacte', async function () {
      await loadFixtureState();
      const card = cardByTitle(panelIn('admin-col-conv', 'Convention en signature UB'), 'Projet Convention');
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
      const card = cardByTitle(panelIn('admin-col-conv', 'Convention en redaction'), 'Projet Instruction');
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
    it('la vue par défaut est "lignes", et bascule vers "cartes" au clic', async function () {
      await loadFixtureState();
      const body = document.querySelector('#admin-col-notif .admin-panel-body');
      assertTrue(body.classList.contains('mode-rows'), 'le mode par défaut doit être "lignes"');
      document.getElementById('admin-toggle-view').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      assertTrue(document.querySelector('#admin-col-notif .admin-panel-body').classList.contains('mode-cards'), 'après bascule, mode "cartes"');
      document.getElementById('admin-toggle-view').dispatchEvent(new MouseEvent('click', { bubbles: true })); // reset pour les autres tests
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
