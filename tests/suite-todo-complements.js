/**
 * Non-regression suite : compléments de la page To Do (js/pages/page-todo.js) — les parties livrées le 03/11/2026
 * que la suite principale (suite-todo.js) ne couvrait pas : pastille d'urgence (date de début du projet), statuts de
 * convention historiques, case « Convention de reversement », volets repliables retenus par utilisateur, bouton
 * Réinitialiser, ouverture du projet, compteur de tâches.
 *
 * Fixtures (tests/fixtures.js) : Notifications → INNOVX « 1) Information projet saisies », NOTIFY « 5) envoyée pour
 * signature VP », CONVENTIX « 6) Signée », SIGNEX « 8) Archivee ». Conventions (toutes les cases cochées par
 * loadFixtureState) : INNOVX « 1) … redaction », CONVENTIX « 3) … en signature », SIGNEX « 4) … signée de toutes les
 * parties ». Installation (ancienne colonne Statut_installation_fonds, reprise) : INNOVX « 2) Ouverture demandée à la DF » (2e jalon), NOTIFY « 3) Installé » (3e).
 *
 * L'état de la page (onglet, vue, volets) vit dans la fermeture de page-todo.js et traverse les tests : chaque test
 * pose son onglet et sa vue, et window.TodoTesting.resetPanelState() repart de volets jamais construits.
 */
(function () {
  'use strict';

  async function loadFixtureState() {
    const tables = await window.CoreGrist.loadAllTables();
    tables.Projets.forEach(project => { project.Convention_de_reversement = true; });
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    window.renderTodo();
  }
  const project = id => window.CoreState.getTable('Projets').find(p => p.id === id);

  const panel = label => Array.from(document.querySelectorAll('#todo-panels .admin-panel'))
    .find(section => section.querySelector('.admin-panel-header h4')?.textContent === label);
  const cardByAcronym = (panelEl, acronym) => panelEl && Array.from(panelEl.querySelectorAll('.admin-card'))
    .find(card => card.querySelector('.admin-card-identity .project-acronym')?.textContent === acronym);
  const setTab = tabKey => fireMouse(document.querySelector(`[data-todo-tab="${tabKey}"]`), 'click');
  const setView = value => {
    const select = document.getElementById('todo-view-select');
    select.value = value;
    fire(select, 'change');
  };
  // La vue d'abord : les volets se construisent au premier affichage (vides = repliés), il faut donc que « toute l'équipe » soit déjà là.
  const showAll = tab => { setView('all'); setTab(tab); };
  const shownAcronyms = () => Array.from(document.querySelectorAll('#todo-panels .project-acronym')).map(el => el.textContent).sort();

  const prefsUpdates = () => window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && c.table === 'Preferences_Widget');
  const lastPrefsUpdate = () => prefsUpdates().slice(-1)[0];
  function cacheRowId(id) { try { localStorage.setItem('suiviProjetInnovationS:prefsRowId', String(id)); } catch (err) { /* ignore */ } }
  // Ligne de préférences déjà là (créée par le Kanban au premier lancement), avec les colonnes Todo_* éventuelles.
  async function openWithPrefsRow(extra) {
    const row = Object.assign({ id: [1], Email_utilisateur: [''] }, extra);
    window.__mockSetTable('Preferences_Widget', row);
    cacheRowId(1);
    await window.loadTodoUserPreferences();
  }
  const collapsedIndexes = prefix => Array.from(document.querySelectorAll(`#todo-panels [data-toggle-panel^="${prefix}:"]`))
    .filter(btn => btn.closest('.admin-panel').classList.contains('is-collapsed'))
    .map(btn => Number(btn.dataset.togglePanel.split(':')[1]));
  const toggleButton = key => document.querySelector(`#todo-panels [data-toggle-panel="${key}"]`);

  describe('To Do — pastille d\'urgence (date de début du projet) sur Notifications et Conventions', function () {
    // 1er octobre 2026 : « aujourd'hui » est figé, les dates de début sont données en nombre de jours.
    const TODAY = () => new Date(2026, 9, 1, 17, 45);
    const inDays = n => Math.floor(Date.UTC(2026, 9, 1 + n) / 1000);
    const URGENCY = () => window.TodoUrgency;
    const NOTIF_1 = 'Information projet saisies';
    const CONV_1 = 'Convention en redaction';
    // Pastille de INNOVX (projet 10) sur l'onglet et le volet demandés, vue « toute l'équipe ».
    function chipOf(tab, label, acronym) {
      showAll(tab);
      const card = cardByAcronym(panel(label), acronym);
      return card && card.querySelector('.admin-start');
    }
    async function startingIn(days, tab, label, acronym, id) {
      project(id).Date_debut_Projet = inDays(days);
      window.renderTodo();
      return chipOf(tab, label, acronym);
    }
    async function withClock(fn, clock) {
      URGENCY().setClock(clock || TODAY);
      try { await loadFixtureState(); return await fn(); } finally { URGENCY().setClock(); }
    }

    it('Notifications : rouge sous 7 jours (dates passées comprises), orange de 7 à 21 jours, neutre jusqu\'à 60 jours, vert au-delà', async function () {
      await withClock(async () => {
        for (const [days, expected] of [[-30, 'red'], [-1, 'red'], [0, 'red'], [6, 'red'], [7, 'orange'], [21, 'orange'], [22, 'neutral'], [60, 'neutral'], [61, 'green'], [400, 'green']]) {
          const chip = await startingIn(days, 'notif', NOTIF_1, 'INNOVX', 10);
          assertTrue(!!chip, `une pastille est attendue à ${days} j`);
          assertEqual(chip.dataset.urgency, expected, `notifications, ${days} j`);
          assertTrue(chip.classList.contains(`is-${expected}`), `classe is-${expected} à ${days} j`);
        }
      });
    });

    it('Conventions : rouge sous 14 jours, orange sous 30 jours, neutre jusqu\'à 60 jours, vert au-delà (seuils différents de Notifications)', async function () {
      await withClock(async () => {
        for (const [days, expected] of [[-30, 'red'], [0, 'red'], [13, 'red'], [14, 'orange'], [29, 'orange'], [30, 'neutral'], [60, 'neutral'], [61, 'green'], [400, 'green']]) {
          const chip = await startingIn(days, 'conv', CONV_1, 'INNOVX', 10);
          assertEqual(chip.dataset.urgency, expected, `conventions, ${days} j`);
        }
      });
    });

    it('le même projet n\'a pas la même couleur dans les deux onglets : début dans 10 jours = orange en Notifications, rouge en Conventions', async function () {
      await withClock(async () => {
        project(10).Date_debut_Projet = inDays(10);
        window.renderTodo();
        assertEqual(chipOf('notif', NOTIF_1, 'INNOVX').dataset.urgency, 'orange');
        assertEqual(chipOf('conv', CONV_1, 'INNOVX').dataset.urgency, 'red');
      });
    });

    it('pastille lisible : date jj/mm/aaaa, écart en jours dans l\'infobulle et pour les lecteurs d\'écran, aucun champ modifiable', async function () {
      await withClock(async () => {
        const chip = await startingIn(4, 'notif', NOTIF_1, 'INNOVX', 10);
        assertEqual(chip.querySelector('time').textContent, '05/10/2026');
        assertEqual(chip.querySelector('time').getAttribute('datetime'), '2026-10-05');
        assertIncludes(chip.title, 'Début du projet le 05/10/2026');
        assertIncludes(chip.title, 'dans 4 jours');
        assertIncludes(chip.title, 'urgent');
        assertIncludes(chip.querySelector('.visually-hidden').textContent, 'dans 4 jours', 'la couleur n\'est jamais seule à porter l\'information');
        assertEqual(chip.querySelectorAll('input, textarea, button, a').length, 0, 'lecture seule');
      });
    });

    it('formulation de l\'écart : aujourd\'hui, demain, hier, il y a N jours, dans N jours', async function () {
      await withClock(async () => {
        const said = async days => (await startingIn(days, 'notif', NOTIF_1, 'INNOVX', 10)).title;
        assertIncludes(await said(0), 'aujourd\'hui');
        assertIncludes(await said(1), 'demain');
        assertIncludes(await said(-1), 'hier');
        assertIncludes(await said(-3), 'il y a 3 jours');
        assertIncludes(await said(45), 'dans 45 jours');
        assertFalse((await said(45)).includes('urgent'), 'neutre : aucun qualificatif d\'urgence');
        assertIncludes(await said(90), 'pas d\'urgence');
        assertIncludes(await said(10), 'à surveiller');
      });
    });

    it('date vide ou illisible : aucune pastille (ni date, ni libellé « début du projet »)', async function () {
      await withClock(async () => {
        for (const value of [null, 0, 'bientôt', 8e12, NaN, undefined]) {
          project(10).Date_debut_Projet = value;
          window.renderTodo();
          showAll('notif');
          assertEqual(document.querySelectorAll('#todo-panels .admin-start, #todo-panels time').length, 0, `aucune pastille pour ${String(value)}`);
          assertFalse(/début du projet/i.test(document.getElementById('todo-panels').textContent), `aucun libellé pour ${String(value)}`);
        }
      });
    });

    it('étape terminée (dernier volet) : la date reste visible mais sans couleur d\'alerte, même passée de plusieurs mois', async function () {
      await withClock(async () => {
        project(16).Date_debut_Projet = inDays(-120);
        window.renderTodo();
        const notifChip = chipOf('notif', 'Archivee', 'SIGNEX');
        assertEqual(notifChip.dataset.urgency, 'neutral', 'Notifications : archivée = plus d\'urgence');
        assertEqual(notifChip.querySelector('time').textContent, '03/06/2026');
        assertEqual(chipOf('conv', 'Convention signée de toutes les parties', 'SIGNEX').dataset.urgency, 'neutral', 'Conventions : signée de toutes les parties = plus d\'urgence');
        // un projet à une étape intermédiaire, lui, reste en alerte
        project(10).Date_debut_Projet = inDays(-120);
        window.renderTodo();
        assertEqual(chipOf('notif', NOTIF_1, 'INNOVX').dataset.urgency, 'red');
      });
    });

    it('l\'onglet Installation n\'a jamais de pastille d\'urgence : aucune date butoir n\'y est définie', async function () {
      await withClock(async () => {
        project(10).Date_debut_Projet = inDays(2);
        project(11).Date_debut_Projet = inDays(2);
        window.renderTodo();
        showAll('install');
        assertTrue(!!cardByAcronym(panel('En attente DF (ou OPE sur UBInvest)'), 'INNOVX'), 'INNOVX est bien listé sur Installation');
        assertEqual(document.querySelectorAll('#todo-panels .admin-start').length, 0, 'aucune pastille sur Installation');
      });
    });

    it('« aujourd\'hui » est une date calendaire : même résultat à 00 h 01 et à 23 h 59, et à travers le passage à l\'heure d\'hiver', async function () {
      await withClock(async () => {
        project(10).Date_debut_Projet = inDays(14); // conventions : 14 jours = orange, 13 jours = rouge
        window.renderTodo();
        URGENCY().setClock(() => new Date(2026, 9, 1, 23, 59));
        window.renderTodo();
        assertEqual(chipOf('conv', CONV_1, 'INNOVX').dataset.urgency, 'orange', 'à 23 h 59 le même jour');
        URGENCY().setClock(() => new Date(2026, 9, 1, 0, 1));
        window.renderTodo();
        assertEqual(chipOf('conv', CONV_1, 'INNOVX').dataset.urgency, 'orange', 'à 00 h 01 le même jour');
        URGENCY().setClock(() => new Date(2026, 9, 2, 0, 1));
        window.renderTodo();
        assertEqual(chipOf('conv', CONV_1, 'INNOVX').dataset.urgency, 'red', 'le lendemain il ne reste que 13 jours');
        project(10).Date_debut_Projet = Math.floor(Date.UTC(2026, 9, 30) / 1000); // après le passage à l'heure d'hiver (25/10)
        URGENCY().setClock(() => new Date(2026, 9, 20, 12, 0));
        window.renderTodo();
        assertIncludes(chipOf('conv', CONV_1, 'INNOVX').title, 'dans 10 jours', 'le changement d\'heure ne décale pas l\'écart');
      });
    });

    it('sans horloge imposée, c\'est la vraie date du jour qui compte (setClock() sans argument rétablit l\'horloge)', async function () {
      await loadFixtureState();
      URGENCY().setClock(() => new Date(2001, 0, 1));
      URGENCY().setClock(); // rétablit l'horloge réelle
      const now = new Date();
      project(10).Date_debut_Projet = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 1000);
      window.renderTodo();
      assertIncludes(chipOf('notif', NOTIF_1, 'INNOVX').title, 'aujourd\'hui');
    });
  });

  describe('To Do — Conventions : statuts historiques et case « Convention de reversement »', function () {
    const CONV_LABELS = ['Convention en redaction', 'Convention en relecture', 'Convention en signature', 'Convention signée de toutes les parties'];
    function panelOf(acronym) {
      showAll('conv');
      return CONV_LABELS.find(label => cardByAcronym(panel(label), acronym)) || null;
    }

    it('les anciens statuts retombent sur la bonne étape (relecture partenaire → relecture, signature UB / partenaire → signature, « 5) … signée » → signée)', async function () {
      await loadFixtureState();
      project(10).Conventions_statut = '2) Convention Relecture Partenaire(s)';
      project(11).Conventions_statut = '3) Convention en signature UB';
      project(12).Conventions_statut = '4) Convention en signature partenaire';
      project(13).Conventions_statut = '5) Convention signée de toutes les parties';
      window.renderTodo();
      assertEqual(panelOf('INNOVX'), 'Convention en relecture');
      assertEqual(panelOf('NOTIFY'), 'Convention en signature');
      assertEqual(panelOf('CONVENTIX'), 'Convention en signature');
      assertEqual(panelOf('FINANCX'), 'Convention signée de toutes les parties');
    });

    it('un libellé sans numéro d\'étape, ou avec une autre casse, est reconnu ; une valeur inconnue ou vide n\'affiche rien et ne plante pas', async function () {
      await loadFixtureState();
      project(10).Conventions_statut = 'Convention en relecture';
      project(11).Conventions_statut = 'CONVENTION EN SIGNATURE';
      project(12).Conventions_statut = 'Convention perdue dans les limbes';
      project(13).Conventions_statut = '';
      project(14).Conventions_statut = null;
      window.renderTodo();
      assertEqual(panelOf('INNOVX'), 'Convention en relecture');
      assertEqual(panelOf('NOTIFY'), 'Convention en signature');
      ['CONVENTIX', 'FINANCX', 'COURSIX'].forEach(acronym => assertEqual(panelOf(acronym), null, `${acronym} : statut inconnu ou vide, aucune carte`));
    });

    it('seuls les projets dont la case « Convention de reversement » est cochée entrent dans Conventions (vrai, 1, « oui », « cochee »)', async function () {
      await loadFixtureState();
      project(10).Convention_de_reversement = true;
      project(11).Convention_de_reversement = 1;
      project(12).Convention_de_reversement = 'Oui';
      project(13).Convention_de_reversement = 'cochee';
      project(14).Convention_de_reversement = false;
      project(15).Convention_de_reversement = 0;
      project(16).Convention_de_reversement = 'non';
      window.renderTodo();
      showAll('conv');
      assertDeepEqual(shownAcronyms(), ['CONVENTIX', 'FINANCX', 'INNOVX', 'NOTIFY'], 'case cochée uniquement');
      project(10).Convention_de_reversement = null;
      project(11).Convention_de_reversement = '';
      window.renderTodo();
      assertDeepEqual(shownAcronyms(), ['CONVENTIX', 'FINANCX'], 'une case vide ou nulle ne compte pas');
    });
  });

  describe('To Do — compteur, ouverture du projet et bouton Réinitialiser', function () {
    it('le compteur dit le nombre de tâches visibles (« 1 tâche visible », sinon au pluriel)', async function () {
      await loadFixtureState();
      showAll('install');
      assertEqual(document.getElementById('todo-count').textContent, '2 tâches visibles', 'INNOVX et NOTIFY ont un statut d\'installation');
      project(11).Statut_installation_fonds = '';
      window.renderTodo();
      assertEqual(document.getElementById('todo-count').textContent, '1 tâche visible');
      project(10).Statut_installation_fonds = '';
      window.renderTodo();
      assertEqual(document.getElementById('todo-count').textContent, '0 tâches visibles', 'zéro : pluriel, comme dans le reste du widget');
    });

    it('un clic sur le nom du projet ouvre sa modale ; un projet disparu du tableau ne l\'ouvre pas', async function () {
      await loadFixtureState();
      showAll('notif');
      const opened = [];
      const original = window.ProjectModal.open;
      window.ProjectModal.open = arg => { opened.push(arg); };
      try {
        const button = cardByAcronym(panel('Information projet saisies'), 'INNOVX').querySelector('[data-open-project]');
        fireMouse(button, 'click');
        assertEqual(opened.length, 1, 'la modale s\'ouvre');
        assertEqual(opened[0].id, 10, 'sur le bon projet');
        assertEqual(opened[0].Acronyme, 'INNOVX');
        // le projet est retiré des données entre le rendu et le clic : rien ne s\'ouvre
        window.CoreState.setTable('Projets', window.CoreState.getTable('Projets').filter(p => p.id !== 10));
        fireMouse(button, 'click');
        assertEqual(opened.length, 1, 'projet introuvable : pas de modale');
      } finally { window.ProjectModal.open = original; }
    });

    it('Réinitialiser revient aux tâches de « moi » sur Notifications, et l\'enregistre', async function () {
      await loadFixtureState();
      await openWithPrefsRow({});
      setTab('install');
      setView('all');
      window.__TEST_CALLS__.length = 0;
      fireMouse(document.getElementById('todo-reset'), 'click');
      assertTrue(document.querySelector('[data-todo-tab="notif"]').classList.contains('is-active'), 'onglet Notifications');
      assertEqual(document.getElementById('todo-view-select').value, 'me', 'vue « Mes tâches »');
      await wait(30);
      const update = lastPrefsUpdate();
      assertTrue(!!update, 'la réinitialisation est enregistrée');
      assertEqual(update.fields.Todo_onglet_actif, 'notif');
      assertEqual(update.fields.Todo_vue, 'me');
    });
  });

  describe('To Do — volets repliables, retenus par utilisateur (Todo_*_repliees)', function () {
    it('replier / déplier un volet bascule la classe, aria-expanded et l\'étiquette du bouton, et n\'efface aucune carte', async function () {
      await loadFixtureState();
      window.TodoTesting.resetPanelState();
      showAll('notif');
      const key = 'notif:0';
      const section = () => toggleButton(key).closest('.admin-panel');
      assertFalse(section().classList.contains('is-collapsed'), 'le volet d\'INNOVX démarre déplié');
      assertEqual(toggleButton(key).getAttribute('aria-expanded'), 'true');
      assertIncludes(toggleButton(key).getAttribute('aria-label'), 'Replier le volet Information projet saisies');

      fireMouse(toggleButton(key), 'click');
      assertTrue(section().classList.contains('is-collapsed'), 'replié');
      assertEqual(toggleButton(key).getAttribute('aria-expanded'), 'false');
      assertIncludes(toggleButton(key).getAttribute('aria-label'), 'Déplier le volet Information projet saisies');
      assertTrue(!!cardByAcronym(panel('Information projet saisies'), 'INNOVX'), 'la carte reste dans le volet replié (compteur juste)');
      assertEqual(section().querySelector('.kanban-count').textContent, '1');

      fireMouse(toggleButton(key), 'click');
      assertFalse(section().classList.contains('is-collapsed'), 'déplié de nouveau');
    });

    it('chaque volet replié ou déplié est enregistré (indices par onglet) sur la ligne de préférences de la personne', async function () {
      await loadFixtureState();
      window.TodoTesting.resetPanelState();
      await openWithPrefsRow({});
      showAll('notif');
      window.__TEST_CALLS__.length = 0;

      fireMouse(toggleButton('notif:0'), 'click');
      await wait(30);
      let update = lastPrefsUpdate();
      assertTrue(!!update, 'UpdateRecord sur Preferences_Widget');
      assertEqual(update.id, 1, 'la ligne de cette personne');
      assertTrue(update.fields.Todo_notif_repliees.split(',').includes('0'), 'le volet 0 est dans la liste des volets repliés');
      assertDeepEqual(update.fields.Todo_notif_repliees.split(',').filter(Boolean).map(Number).sort(), collapsedIndexes('notif').sort((a, b) => a - b), 'la liste enregistrée = les volets repliés à l\'écran');
      assertEqual(update.fields.Todo_onglet_actif, 'notif');
      assertEqual(update.fields.Todo_vue, 'all');

      fireMouse(toggleButton('notif:0'), 'click');
      await wait(30);
      update = lastPrefsUpdate();
      assertFalse(update.fields.Todo_notif_repliees.split(',').includes('0'), 'redéplié : le volet 0 n\'est plus dans la liste');
    });

    it('à la réouverture, les volets repliés, l\'onglet actif et la vue enregistrés sont retrouvés', async function () {
      await loadFixtureState();
      window.TodoTesting.resetPanelState();
      await openWithPrefsRow({
        Todo_onglet_actif: ['conv'], Todo_vue: ['all'],
        Todo_notif_repliees: ['0,3'], Todo_conv_repliees: ['1'], Todo_install_repliees: [''],
        Todo_personne: [''], Todo_email: ['']
      });
      window.renderTodo();
      assertTrue(document.querySelector('[data-todo-tab="conv"]').classList.contains('is-active'), 'onglet Conventions rouvert');
      assertEqual(document.getElementById('todo-view-select').value, 'all', 'vue « Toute l\'équipe » retrouvée');
      assertDeepEqual(collapsedIndexes('conv'), [1], 'volet de relecture replié, les trois autres dépliés malgré leurs cartes ou non');
      setTab('notif');
      assertDeepEqual(collapsedIndexes('notif'), [0, 3], 'exactement les volets enregistrés, même vides ou pleins');
    });

    it('un onglet enregistré inconnu est ignoré (on reste sur Notifications)', async function () {
      await loadFixtureState();
      window.TodoTesting.resetPanelState();
      setTab('notif');
      await openWithPrefsRow({ Todo_onglet_actif: ['inexistant'], Todo_vue: ['all'] });
      window.renderTodo();
      assertTrue(document.querySelector('[data-todo-tab="notif"]').classList.contains('is-active'));
    });

    it('ligne de préférences déjà là mais sans préférence To Do : les volets vides démarrent repliés, les volets avec tâches dépliés (comme Administratif et Installation)', async function () {
      await loadFixtureState();
      window.TodoTesting.resetPanelState();
      await openWithPrefsRow({}); // cas réel : la ligne a été créée par le Kanban au tout premier lancement
      showAll('notif');
      assertFalse(panel('Information projet saisies').classList.contains('is-collapsed'), 'INNOVX : volet avec tâche déplié');
      assertTrue(panel('Transmise au porteur').classList.contains('is-collapsed'), 'volet sans aucune tâche replié');
      assertFalse(panel('Archivee').classList.contains('is-collapsed'), 'SIGNEX archivée : volet avec tâche déplié');
    });
  });
})();
