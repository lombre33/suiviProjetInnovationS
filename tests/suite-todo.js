/**
 * Non-regression suite: page To Do (js/pages/page-todo.js).
 * Réutilise les fixtures de la page Administratif (tests/fixtures.js) :
 * INNOVX (10) a une fiche Notifications "Information projet saisies",
 * NOTIFY (11) "envoyée pour signature VP", SIGNEX (16) "Archivee" + convention
 * signée. CONVENTIX (12) a une convention "en signature". Annuaire : Alice
 * Martin (1), Bob Durand (2), sans Role_ToDo ni next_step_responsable par
 * défaut (colonnes ajoutées par cette page).
 */
(function () {
  'use strict';

  async function loadFixtureState() {
    const tables = await window.CoreGrist.loadAllTables();
    tables.Projets.forEach(project => { project.Convention_de_reversement = true; });
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    window.renderTodo();
  }

  function panel(label) {
    return Array.from(document.querySelectorAll('#todo-panels .admin-panel'))
      .find(section => section.querySelector('.admin-panel-header h4')?.textContent === label);
  }
  function cardByAcronym(panelEl, acronym) {
    return panelEl && Array.from(panelEl.querySelectorAll('.admin-card'))
      .find(card => card.querySelector('.admin-card-identity .project-acronym')?.textContent === acronym);
  }
  function setTab(tabKey) { fireMouse(document.querySelector(`[data-todo-tab="${tabKey}"]`), 'click'); }
  function setView(value) {
    const select = document.getElementById('todo-view-select');
    select.value = value;
    fire(select, 'change');
  }
  function annuairePerson(id) { return window.CoreState.getTable('Annuaire').find(p => p.id === id); }
  function project(id) { return window.CoreState.getTable('Projets').find(p => p.id === id); }

  describe('To Do — rôle : un onglet entier est visible sans tag', function () {
    it('Alice (rôle Notifications) voit INNOVX sur Notifications, mais rien sur Conventions', async function () {
      await loadFixtureState();
      annuairePerson(1).Role_ToDo = ['L', 'Notifications'];
      window.renderTodo(); // reconstruit le sélecteur "voir les tâches de…" avec Alice

      setTab('notif');
      setView('1');
      assertTrue(!!cardByAcronym(panel('Information projet saisies'), 'INNOVX'), 'INNOVX doit apparaître (rôle Notifications)');

      setTab('conv');
      assertFalse(!!cardByAcronym(panel('Convention en signature'), 'CONVENTIX'), 'Alice n\'a pas le rôle Conventions et n\'est pas taguée : rien ne doit apparaître');
    });
  });

  describe('To Do — tag next_step_responsable : une tâche précise, même hors du rôle', function () {
    it('Bob (tagué sur CONVENTIX, aucun rôle) la voit sur Conventions mais rien sur Notifications', async function () {
      await loadFixtureState();
      project(12).next_step_responsable = ['L', 2]; // CONVENTIX taguée à Bob
      window.renderTodo();

      setView('2');
      setTab('conv');
      assertTrue(!!cardByAcronym(panel('Convention en signature'), 'CONVENTIX'), 'CONVENTIX doit apparaître (tag next_step_responsable)');
      const tagPill = cardByAcronym(panel('Convention en signature'), 'CONVENTIX').querySelector('.todo-tag-pill');
      assertTrue(!!tagPill, 'la carte doit afficher le tag plutôt qu\'un rôle générique');
      assertIncludes(tagPill.textContent, 'Bob Durand');

      setTab('notif');
      assertFalse(!!cardByAcronym(panel('Information projet saisies'), 'INNOVX'), 'Bob n\'a pas de rôle Notifications : rien ne doit apparaître pour lui');
    });

    it('CONVENTIX tagué à Bob apparaît dans le sélecteur même sans Role_ToDo', async function () {
      await loadFixtureState();
      project(12).next_step_responsable = ['L', 2];
      window.renderTodo();
      const select = document.getElementById('todo-view-select');
      const labels = Array.from(select.options).map(o => o.textContent);
      assertTrue(labels.some(l => l.includes('Bob Durand')), 'Bob doit être sélectionnable (tagué) même sans rôle');
    });
  });

  describe('To Do — vue "Toute l\'équipe" ignore rôle et tag', function () {
    it('affiche un projet même sans rôle ni tag pour personne', async function () {
      await loadFixtureState();
      setTab('conv');
      setView('all');
      assertTrue(!!cardByAcronym(panel('Convention en signature'), 'CONVENTIX'), 'vue "Toute l\'équipe" : CONVENTIX doit apparaître sans filtre');
    });
  });

  describe('To Do — onglet Installation, dégradation sans la colonne de statut', function () {
    it('les 5 volets existent et restent vides tant que Statut_installation_fonds n\'existe pas', async function () {
      await loadFixtureState();
      setTab('install');
      setView('all');
      ['En attente ouverture', 'Ouverture demandée à la DF', 'Installé', 'Reliquat à traiter', 'Clôturer'].forEach(label => {
        const el = panel(label);
        assertTrue(!!el, `le volet "${label}" doit exister`);
        assertTrue(!!el.querySelector('.kanban-empty'), `le volet "${label}" doit être vide tant que la colonne n'existe pas`);
      });
    });

    it('un projet avec Statut_installation_fonds renseigné apparaît dans le bon volet', async function () {
      await loadFixtureState();
      project(10).Statut_installation_fonds = 'Installé'; // INNOVX
      project(10).Action_Ligne_OPE_a_faire = 'Vérifier le virement';
      project(10).Ligne_OPE_installe_chez = 'DIESE';
      window.renderTodo();
      setTab('install');
      setView('all');
      const card = cardByAcronym(panel('Installé'), 'INNOVX');
      assertTrue(!!card, 'INNOVX doit apparaître dans le volet Installé');
      assertIncludes(card.querySelector('.todo-action-text').textContent, 'Vérifier le virement');
      assertIncludes(card.querySelector('.todo-action-text').textContent, 'DIESE');
    });
  });

  describe('To Do — bascule d\'onglet', function () {
    it('met à jour la classe is-active et aria-selected', async function () {
      await loadFixtureState();
      const notifTab = document.querySelector('[data-todo-tab="notif"]');
      const convTab = document.querySelector('[data-todo-tab="conv"]');
      setTab('notif'); // état de départ connu, indépendant de l'ordre des tests précédents
      assertTrue(notifTab.classList.contains('is-active'));
      assertFalse(convTab.classList.contains('is-active'));

      setTab('conv');

      assertTrue(convTab.classList.contains('is-active'));
      assertEqual(convTab.getAttribute('aria-selected'), 'true');
      assertFalse(notifTab.classList.contains('is-active'));

      setTab('notif'); // reset pour les autres tests
    });
  });

  describe('To Do — préférences utilisateur (Preferences_Widget partagée)', function () {
    it('ajoute Role_ToDo à Annuaire et ses propres colonnes Todo_* à Preferences_Widget', async function () {
      await loadFixtureState();
      const beforeAnnuaire = await window.CoreGrist.getTable('Annuaire');
      assertFalse('Role_ToDo' in beforeAnnuaire[0], 'Role_ToDo ne doit pas exister avant le chargement');

      await window.loadTodoUserPreferences();

      const afterAnnuaire = await window.CoreGrist.getTable('Annuaire');
      assertTrue('Role_ToDo' in afterAnnuaire[0], 'Role_ToDo doit avoir été ajoutée à Annuaire');
      const afterPrefs = await window.CoreGrist.getTable('Preferences_Widget');
      assertTrue('Todo_onglet_actif' in afterPrefs[0], 'Todo_onglet_actif doit avoir été ajoutée à Preferences_Widget');
      const addColumnOnAnnuaire = window.__TEST_CALLS__.filter(c => c.type === 'AddColumn' && c.table === 'Annuaire');
      assertEqual(addColumnOnAnnuaire.length, 1, 'une seule colonne doit être ajoutée à Annuaire');
      assertEqual(addColumnOnAnnuaire[0].colId, 'Role_ToDo');
    });

    it('identifie "vous" via Email_utilisateur mis en correspondance avec Annuaire.Email', async function () {
      await loadFixtureState();
      annuairePerson(1).Role_ToDo = ['L', 'Notifications'];
      window.__mockSetTable('Preferences_Widget', { id: [1], Email_utilisateur: ['alice.martin@example.org'] });
      try { localStorage.setItem('suiviProjetInnovationS:prefsRowId', '1'); } catch (err) { /* ignore */ }

      await window.loadTodoUserPreferences();
      window.renderTodo();

      setTab('notif');
      setView('me');
      assertTrue(!!cardByAcronym(panel('Information projet saisies'), 'INNOVX'), '"Mes tâches" doit retrouver Alice via son email et appliquer son rôle');
      assertTrue(document.getElementById('todo-identify-notice').hidden, 'le message d\'identification manquante doit être caché une fois Alice reconnue');
    });

    it('sans correspondance d\'email, affiche le message d\'identification manquante plutôt que de deviner', async function () {
      await loadFixtureState();
      window.__mockSetTable('Preferences_Widget', { id: [1], Email_utilisateur: ['inconnu@example.org'] });
      try { localStorage.setItem('suiviProjetInnovationS:prefsRowId', '1'); } catch (err) { /* ignore */ }

      await window.loadTodoUserPreferences();
      window.renderTodo();
      setView('me');

      assertFalse(document.getElementById('todo-identify-notice').hidden, 'le message doit être visible sans correspondance');
    });
  });
})();
