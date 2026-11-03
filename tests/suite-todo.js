/**
 * Non-regression suite: page To Do (js/pages/page-todo.js).
 * Réutilise les fixtures de la page Administratif (tests/fixtures.js) :
 * INNOVX (10) a une fiche Notifications "Information projet saisies",
 * NOTIFY (11) "envoyée pour signature VP", SIGNEX (16) "Archivee" + convention
 * signée. CONVENTIX (12) a une convention "en signature". Annuaire : Alice
 * Martin (1, Poste2→1→Structures#1 "LAB1"), Bob Durand (2, sans poste), sans
 * next_step_responsable par défaut. Le rôle To Do se déduit de
 * Structures.Acronyme (voir STRUCTURE_ROLE_RULES dans page-todo.js) : les
 * tests qui veulent un rôle renomment Structures#1 en conséquence.
 */
(function () {
  'use strict';

  async function loadFixtureState() {
    const tables = await window.CoreGrist.loadAllTables();
    tables.Projets.forEach(project => { project.Convention_de_reversement = true; });
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    window.renderTodo();
  }
  function setAliceStructureLabel(acronyme) {
    window.CoreState.getTable('Structures').find(s => s.id === 1).Acronyme = acronyme;
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
  function project(id) { return window.CoreState.getTable('Projets').find(p => p.id === id); }

  describe('To Do — rôle déduit de Structures (via Postes2.Structure2), un onglet entier sans tag', function () {
    it('Alice (structure "Grands Programmes Innovation") voit INNOVX sur Notifications et CONVENTIX sur Conventions, mais rien sur Installation', async function () {
      await loadFixtureState();
      setAliceStructureLabel('Grands Programmes Innovation');
      window.renderTodo(); // reconstruit le sélecteur "voir les tâches de…" avec Alice

      setTab('notif');
      setView('1');
      assertTrue(!!cardByAcronym(panel('Information projet saisies'), 'INNOVX'), 'INNOVX doit apparaître (rôle Notifications via "Grands Programmes")');

      setTab('conv');
      assertTrue(!!cardByAcronym(panel('Convention en signature'), 'CONVENTIX'), 'CONVENTIX doit apparaître (rôle Conventions via "Grands Programmes")');

      setTab('install');
      project(10).Statut_installation_fonds = 'Installé';
      window.renderTodo();
      assertFalse(!!cardByAcronym(panel('Installé'), 'INNOVX'), 'Alice n\'a pas le rôle Installation ("Grands Programmes" ne le couvre pas) et n\'est pas taguée : rien ne doit apparaître');
    });

    it('Alice (structure "DR Sud") a le rôle Installation mais pas Notifications/Conventions', async function () {
      await loadFixtureState();
      setAliceStructureLabel('DR Sud');
      project(10).Statut_installation_fonds = 'Installé';
      window.renderTodo();

      setView('1');
      setTab('install');
      assertTrue(!!cardByAcronym(panel('Installé'), 'INNOVX'), 'INNOVX doit apparaître (rôle Installation via "DR")');

      setTab('notif');
      assertFalse(!!cardByAcronym(panel('Information projet saisies'), 'INNOVX'), 'Alice n\'a pas le rôle Notifications ("DR" ne le couvre pas) et n\'est pas taguée : rien ne doit apparaître');
    });

    it('Alice (structure "LAB1", ne matche aucune règle) et Bob (sans poste, Poste2=0) n\'ont aucun rôle', async function () {
      await loadFixtureState(); // Structures#1.Acronyme = 'LAB1' par défaut (fixtures.js)
      window.renderTodo();

      setView('1');
      setTab('notif');
      assertFalse(!!cardByAcronym(panel('Information projet saisies'), 'INNOVX'), 'une structure non reconnue ne doit donner aucun rôle');

      setView('2');
      setTab('conv');
      assertFalse(!!cardByAcronym(panel('Convention en signature'), 'CONVENTIX'), 'une personne sans poste ne doit avoir aucun rôle');
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

    it('CONVENTIX tagué à Bob apparaît dans le sélecteur même sans rôle', async function () {
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
    it('ajoute ses propres colonnes Todo_* à Preferences_Widget, sans toucher à Annuaire (rôle déduit, pas stocké)', async function () {
      await loadFixtureState();
      const beforeAnnuaire = await window.CoreGrist.getTable('Annuaire');

      await window.loadTodoUserPreferences();

      const afterPrefs = await window.CoreGrist.getTable('Preferences_Widget');
      assertTrue('Todo_onglet_actif' in afterPrefs[0], 'Todo_onglet_actif doit avoir été ajoutée à Preferences_Widget');
      const addColumnOnAnnuaire = window.__TEST_CALLS__.filter(c => c.type === 'AddColumn' && c.table === 'Annuaire');
      assertEqual(addColumnOnAnnuaire.length, 0, 'le rôle est déduit de Structures : aucune colonne ne doit être ajoutée à Annuaire');
      const afterAnnuaire = await window.CoreGrist.getTable('Annuaire');
      assertEqual(Object.keys(afterAnnuaire[0]).length, Object.keys(beforeAnnuaire[0]).length, 'Annuaire ne doit pas gagner de colonne');
    });

    it('identifie "vous" via Email_utilisateur mis en correspondance avec Annuaire.Email', async function () {
      await loadFixtureState();
      setAliceStructureLabel('Grands Programmes Innovation');
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
