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
  // Le mock ne sait pas évaluer la formule déclenchée Email_utilisateur : on la mime (Grist pose l'email
  // de la personne qui crée la ligne de préférences, au moment de la création seulement).
  function emulateTriggerEmail(email) {
    const docApi = window.grist.docApi;
    const original = docApi.applyUserActions;
    docApi.applyUserActions = async function (actions) {
      const result = await original.call(docApi, actions);
      for (let i = 0; i < actions.length; i++) {
        if (actions[i][0] === 'AddRecord' && actions[i][1] === 'Preferences_Widget') {
          await original.call(docApi, [['UpdateRecord', 'Preferences_Widget', result.retValues[i], { Email_utilisateur: email }]]);
        }
      }
      return result;
    };
    return () => { docApi.applyUserActions = original; };
  }
  function cacheRowId(id) { try { localStorage.setItem('suiviProjetInnovationS:prefsRowId', String(id)); } catch (err) { /* ignore */ } }
  async function prefsRows() { return window.CoreGrist.getTable('Preferences_Widget'); }
  function addRecordCalls() { return window.__TEST_CALLS__.filter(c => c.type === 'AddRecord' && c.table === 'Preferences_Widget').length; }

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
      project(10).Statut_installation_fonds = '3) Installé';
      window.renderTodo();
      assertFalse(!!cardByAcronym(panel('Installé'), 'INNOVX'), 'Alice n\'a pas le rôle Installation ("Grands Programmes" ne le couvre pas) et n\'est pas taguée : rien ne doit apparaître');
    });

    it('Alice (structure "DR Sud") a le rôle Installation mais pas Notifications/Conventions', async function () {
      await loadFixtureState();
      setAliceStructureLabel('DR Sud');
      project(10).Statut_installation_fonds = '3) Installé';
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

  describe('To Do — onglet Installation (Statut_installation_fonds, fil "Installation des fonds")', function () {
    it('les 5 volets existent ; les fixtures par défaut placent INNOVX et NOTIFY dans les bons volets, les autres volets restent vides', async function () {
      await loadFixtureState(); // INNOVX = "2) Ouverture demandée à la DF", NOTIFY = "3) Installé" (fixtures.js)
      setTab('install');
      setView('all');
      ['En attente ouverture', 'Ouverture demandée à la DF', 'Installé', 'Reliquat à traiter', 'Clôturer'].forEach(label => {
        assertTrue(!!panel(label), `le volet "${label}" doit exister`);
      });
      assertTrue(!!cardByAcronym(panel('Ouverture demandée à la DF'), 'INNOVX'), 'INNOVX doit apparaître dans le volet Ouverture demandée à la DF');
      assertTrue(!!cardByAcronym(panel('Installé'), 'NOTIFY'), 'NOTIFY doit apparaître dans le volet Installé');
      assertTrue(!!panel('En attente ouverture').querySelector('.kanban-empty'), 'le volet En attente ouverture doit rester vide');
      assertTrue(!!panel('Clôturer').querySelector('.kanban-empty'), 'le volet Clôturer doit rester vide');
    });

    it('un projet avec Statut_installation_fonds renseigné affiche l\'action et "installé chez"', async function () {
      await loadFixtureState();
      project(10).Statut_installation_fonds = '3) Installé'; // INNOVX
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

    it('une valeur de statut imprévue (colonne absente ou vide) n\'affiche rien et ne plante pas', async function () {
      await loadFixtureState();
      project(10).Statut_installation_fonds = ''; // simule une colonne absente/vide
      project(11).Statut_installation_fonds = undefined;
      window.renderTodo();
      setTab('install');
      setView('all');
      assertFalse(!!cardByAcronym(panel('Ouverture demandée à la DF'), 'INNOVX'), 'INNOVX ne doit apparaître dans aucun volet sans statut reconnu');
      assertFalse(!!cardByAcronym(panel('Installé'), 'NOTIFY'), 'NOTIFY ne doit apparaître dans aucun volet sans statut reconnu');
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

      const createdTable = window.__TEST_CALLS__.find(c => c.type === 'AddTable' && c.table === 'Preferences_Widget');
      const emailColumn = createdTable && createdTable.colDefs.find(col => col.id === 'Email_utilisateur');
      assertEqual(emailColumn && emailColumn.formula, 'user.Email', 'la formule ne doit pas se référencer elle-même (CircularRefError dans Grist)');
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
  describe('To Do — identification de « moi » (correctif « non identifié » par défaut)', function () {
    it('1re ouverture dans ce navigateur : la ligne créée est relue, l\'email posé par Grist identifie la personne', async function () {
      await loadFixtureState();
      setAliceStructureLabel('Grands Programmes Innovation');
      window.__mockSetTable('Preferences_Widget', { id: [], Email_utilisateur: [] });
      const restore = emulateTriggerEmail('alice.martin@example.org');
      try {
        await window.loadTodoUserPreferences();
      } finally { restore(); }
      window.renderTodo();
      setTab('notif');
      setView('me');
      assertTrue(document.getElementById('todo-identify-notice').hidden, 'Alice doit être reconnue dès la 1re ouverture');
      assertTrue(!!cardByAcronym(panel('Information projet saisies'), 'INNOVX'), 'ses tâches doivent apparaître');
    });

    it('ligne de préférences antérieure à la colonne Email_utilisateur : colonne ajoutée, ligne-sonde créée puis supprimée, email retenu, sonde jamais répétée', async function () {
      await loadFixtureState();
      window.__mockSetTable('Preferences_Widget', { id: [1] }); // ni Email_utilisateur ni Todo_*
      cacheRowId(1);
      const restore = emulateTriggerEmail('alice.martin@example.org');
      try {
        await window.loadTodoUserPreferences();
        window.renderTodo();
        setView('me');
        assertTrue(document.getElementById('todo-identify-notice').hidden, 'Alice doit être reconnue grâce à la ligne-sonde');
        const rows = await prefsRows();
        assertEqual(rows.length, 1, 'la ligne-sonde doit avoir été supprimée');
        assertEqual(rows[0].Todo_email, 'alice.martin@example.org', 'l\'email doit être retenu sur la ligne de la personne');
        assertEqual(rows[0].Email_utilisateur, 'alice.martin@example.org', 'Email_utilisateur doit être renseigné sur la ligne de la personne (les autres pages le lisent)');
        assertTrue(window.__TEST_CALLS__.some(c => c.type === 'AddColumn' && c.table === 'Preferences_Widget' && c.colId === 'Email_utilisateur'), 'Email_utilisateur doit être ajoutée à la table de préférences');

        window.__TEST_CALLS__.length = 0;
        await window.loadTodoUserPreferences(); // 2e ouverture
        assertEqual(addRecordCalls(), 0, 'aucune nouvelle sonde : l\'email est déjà retenu');
        assertTrue(document.getElementById('todo-identify-notice').hidden);
      } finally { restore(); }
    });

    it('email illisible (la sonde ne reçoit rien) : message sans adresse, choix « Qui êtes-vous ? » retenu et rejoué, sans re-sonde', async function () {
      await loadFixtureState();
      setAliceStructureLabel('Grands Programmes Innovation');
      window.__mockSetTable('Preferences_Widget', { id: [1], Email_utilisateur: [''] });
      cacheRowId(1);
      await window.loadTodoUserPreferences();
      window.renderTodo();
      setView('me');
      const notice = document.getElementById('todo-identify-notice');
      assertFalse(notice.hidden, 'non identifié tant que la personne ne se désigne pas');
      assertIncludes(document.getElementById('todo-identify-text').textContent, 'n\'a pas pu être lue');
      assertEqual((await prefsRows()).length, 1, 'la ligne-sonde doit être supprimée même sans email');

      const me = document.getElementById('todo-me-select');
      assertTrue(Array.from(me.options).some(o => o.textContent === 'Alice Martin'), 'la liste doit proposer les personnes de l\'Annuaire');
      me.value = '1';
      fire(me, 'change');
      await new Promise(resolve => setTimeout(resolve, 0));
      assertTrue(notice.hidden, 'Alice est identifiée après son choix');
      setTab('notif');
      assertTrue(!!cardByAcronym(panel('Information projet saisies'), 'INNOVX'));
      assertEqual((await prefsRows())[0].Todo_personne, '1', 'le choix doit être retenu dans Preferences_Widget');

      window.__TEST_CALLS__.length = 0;
      await window.loadTodoUserPreferences(); // rechargement
      window.renderTodo();
      assertTrue(notice.hidden, 'le choix retenu doit être rejoué au rechargement');
      assertEqual(addRecordCalls(), 0, 'pas de nouvelle sonde : l\'indisponibilité est mémorisée');
    });

    it('ligne dont Email_utilisateur est une erreur Grist (CircularRefError) : formule corrigée, email réécrit, la valeur illisible n\'est plus prise pour une adresse', async function () {
      await loadFixtureState();
      setAliceStructureLabel('Grands Programmes Innovation');
      // État réel relevé chez Antoine : cellule d'erreur, et l'ancienne sonde en avait retenu le texte dans Todo_email.
      window.__mockSetTable('Preferences_Widget', {
        id: [1],
        Email_utilisateur: [['E', 'CircularRefError', 'Circular reference', null, { error: 'x' }]],
        Todo_email: ['E,CircularRefError,Circular reference,,[object Object]']
      });
      cacheRowId(1);
      const restore = emulateTriggerEmail('alice.martin@example.org');
      try {
        await window.loadTodoUserPreferences();
      } finally { restore(); }
      window.renderTodo();
      setView('me');
      assertTrue(document.getElementById('todo-identify-notice').hidden, 'Alice doit être reconnue');
      const fix = window.__TEST_CALLS__.find(c => c.type === 'ModifyColumn' && c.colId === 'Email_utilisateur');
      assertTrue(!!fix, 'la formule de Email_utilisateur doit être corrigée');
      assertEqual(fix.colInfo.formula, 'user.Email');
      const rows = await prefsRows();
      assertEqual(rows.length, 1, 'la ligne-sonde doit être supprimée');
      assertEqual(rows[0].Email_utilisateur, 'alice.martin@example.org', 'la cellule en erreur doit être réécrite avec l\'adresse');
      assertEqual(rows[0].Todo_email, 'alice.martin@example.org');
    });

    it('une valeur illisible n\'est jamais affichée comme adresse : message « n\'a pas pu être lue »', async function () {
      await loadFixtureState();
      window.__mockSetTable('Preferences_Widget', { id: [1], Email_utilisateur: [['E', 'CircularRefError', 'Circular reference']], Todo_email: ['E,CircularRefError'] });
      cacheRowId(1);
      await window.loadTodoUserPreferences(); // pas de formule déclenchée simulée : la sonde ne reçoit rien
      window.renderTodo();
      setView('me');
      const text = document.getElementById('todo-identify-text').textContent;
      assertIncludes(text, 'n\'a pas pu être lue');
      assertFalse(text.toLowerCase().includes('circular'), 'aucune trace de l\'erreur Grist dans le message');
    });

    it('email Grist sans fiche dans l\'Annuaire : le message cite l\'adresse ; une fiche avec plusieurs adresses est reconnue', async function () {
      await loadFixtureState();
      window.__mockSetTable('Preferences_Widget', { id: [1], Email_utilisateur: ['nouveau@example.org'] });
      cacheRowId(1);
      await window.loadTodoUserPreferences();
      window.renderTodo();
      setView('me');
      assertIncludes(document.getElementById('todo-identify-text').textContent, 'nouveau@example.org');

      window.CoreState.getTable('Annuaire').find(p => p.id === 1).Email = 'a.martin@univ.fr ; Nouveau@Example.org';
      await window.loadTodoUserPreferences();
      window.renderTodo();
      assertTrue(document.getElementById('todo-identify-notice').hidden, 'une des adresses de la fiche correspond (casse ignorée)');
    });
  });
})();
