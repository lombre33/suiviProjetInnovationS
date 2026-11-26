/**
 * Non-regression suite: performances de chargement (audit du 10/11/2026).
 *  - js/core/utils.js     : index par id (CoreUtils.indexBy / findById) ;
 *  - js/core/grist-api.js : schéma connu (ensureTable / ensureColumns sans aller-retour inutile),
 *                           lectures partagées pendant le démarrage ;
 *  - js/app.js            : démarrage en parallèle, une seule lecture de chaque table, pages
 *                           masquées rendues à la demande (SuiviApp).
 * Les appels Grist sont comptés en enveloppant window.grist.docApi (tests/mock-grist.js).
 */
(function () {
  'use strict';

  // --- Espion sur docApi : liste ordonnée des appels ("fetch:Projets", "listTables", "apply:AddColumn:Projets"…). ---
  function spyDocApi() {
    const api = window.grist.docApi;
    const original = { fetchTable: api.fetchTable, listTables: api.listTables, applyUserActions: api.applyUserActions };
    const calls = [];
    api.fetchTable = function (name) { calls.push('fetch:' + name); return original.fetchTable.call(api, name); };
    api.listTables = function () { calls.push('listTables'); return original.listTables.call(api); };
    api.applyUserActions = function (actions) { actions.forEach(a => calls.push(`apply:${a[0]}:${a[1]}`)); return original.applyUserActions.call(api, actions); };
    return {
      calls,
      count: pattern => calls.filter(call => call === pattern).length,
      restore() { Object.assign(api, original); }
    };
  }

  // Métadonnées _grist_Tables / _grist_Tables_column fidèles au contenu courant du magasin du mock : c'est ce que
  // Grist expose toujours et ce que le widget lit au démarrage pour connaître le schéma.
  async function installSchemaMetadata() {
    const api = window.grist.docApi;
    const names = await api.listTables();
    const tables = { id: [], tableId: [] };
    const columns = { id: [], parentId: [], colId: [], description: [] };
    for (let i = 0; i < names.length; i++) {
      const data = await api.fetchTable(names[i]);
      tables.id.push(i + 1); tables.tableId.push(names[i]);
      Object.keys(data).filter(key => key !== 'id').forEach(colId => {
        columns.id.push(columns.id.length + 1); columns.parentId.push(i + 1); columns.colId.push(colId); columns.description.push('');
      });
    }
    window.__mockSetTable('_grist_Tables', tables);
    window.__mockSetTable('_grist_Tables_column', columns);
    return window.CoreGrist.loadColumnDescriptions();
  }

  // Le squelette de test n'a pas de <main id="view-projects"> : on en pose un, seule vue visible au départ.
  function prepareViews() {
    const dom = document.getElementById('app-dom');
    const views = Array.from(document.querySelectorAll('.view'));
    const saved = views.map(view => view.className);
    let projects = document.getElementById('view-projects');
    const created = !projects;
    if (created) { projects = document.createElement('main'); projects.id = 'view-projects'; projects.className = 'view'; dom.insertBefore(projects, dom.firstChild); }
    views.forEach(view => view.classList.add('hidden'));
    projects.classList.remove('hidden');
    ['admin-col-notif', 'admin-col-conv', 'todo-panels', 'install-col-diese', 'install-col-ailleurs', 'install-col-non_classe', 'projects-kanban']
      .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
    window.SuiviApp.staleViews.clear();
    window.SuiviApp.cancelIdleRenders();
    return () => { if (created) projects.remove(); views.forEach((view, i) => { view.className = saved[i]; }); };
  }

  // requestIdleCallback figé : les rendus « en temps mort » ne partent que quand le test le décide.
  function holdIdleCallbacks() {
    const original = window.requestIdleCallback;
    const queue = [];
    window.requestIdleCallback = function (callback) { queue.push(callback); return queue.length; };
    return {
      queue,
      flush() { while (queue.length) queue.shift()(); },
      restore() { window.SuiviApp.cancelIdleRenders(); if (original) window.requestIdleCallback = original; else delete window.requestIdleCallback; }
    };
  }

  const cardCount = selector => document.querySelectorAll(selector).length;

  describe('Index par id (CoreUtils.indexBy / findById)', function () {
    it('retrouve une ligne par id (nombre ou texte), la première en cas de doublon, comme Array.find', function () {
      const rows = [{ id: 1, n: 'a' }, { id: 2, n: 'b' }, { id: 2, n: 'doublon' }];
      assertEqual(window.CoreUtils.findById(rows, 2).n, 'b', 'premier gagnant');
      assertEqual(window.CoreUtils.findById(rows, '1').n, 'a', 'id texte');
      assertEqual(window.CoreUtils.findById(rows, 9), undefined);
      assertEqual(window.CoreUtils.findById(null, 1), undefined, 'table absente');
      assertEqual(window.CoreUtils.findById([null, { id: 3 }], 3).id, 3, 'ligne nulle ignorée');
    });

    it('suit un tableau modifié sur place (ajout / retrait) et reste indépendant d\'un tableau à l\'autre', function () {
      const rows = [{ id: 1 }];
      assertEqual(window.CoreUtils.findById(rows, 2), undefined);
      rows.push({ id: 2 });
      assertEqual(window.CoreUtils.findById(rows, 2).id, 2, 'ligne ajoutée visible');
      rows.pop();
      assertEqual(window.CoreUtils.findById(rows, 2), undefined, 'ligne retirée oubliée');
      assertEqual(window.CoreUtils.findById([{ id: 2, other: true }], 2).other, true, 'autre tableau, autre index');
    });

    it('indexBy accepte plusieurs clés mémorisées séparément pour le même tableau', function () {
      const rows = [{ id: 1, Projet: 10 }, { id: 2, Projet: 11 }];
      assertEqual(window.CoreUtils.indexBy(rows, 'projet', r => r.Projet).get('11').id, 2);
      assertEqual(window.CoreUtils.findById(rows, 2).Projet, 11);
    });
  });

  describe('CoreGrist — schéma connu et lectures partagées', function () {
    it('ensureTable / ensureColumns ne font aucun appel quand le schéma lu au démarrage contient déjà tout', async function () {
      await installSchemaMetadata();
      const spy = spyDocApi();
      try {
        assertFalse(await window.CoreGrist.ensureTable('Programmes', [{ id: 'Programme', type: 'Text' }]), 'la table existe : rien à créer');
        assertFalse(await window.CoreGrist.ensureColumns('Programmes', [{ id: 'Programme', type: 'Text' }]), 'la colonne existe : rien à créer');
        assertEqual(spy.calls.length, 0, `aucun appel Grist attendu, vu : ${spy.calls.join(', ')}`);
      } finally { spy.restore(); }
    });

    it('une colonne absente du schéma est vérifiée puis créée, et n\'est plus revérifiée ensuite', async function () {
      await installSchemaMetadata();
      const spy = spyDocApi();
      try {
        const column = { id: 'Colonne_neuve', type: 'Text' };
        assertTrue(await window.CoreGrist.ensureColumns('Programmes', [column]), 'colonne créée');
        assertEqual(spy.count('apply:AddColumn:Programmes'), 1);
        const before = spy.calls.length;
        assertFalse(await window.CoreGrist.ensureColumns('Programmes', [column]), 'déjà créée');
        assertEqual(spy.calls.length, before, 'deuxième appel sans aucun échange avec Grist');
      } finally { spy.restore(); }
    });

    it('une table absente du schéma retombe sur listTables et est créée', async function () {
      await installSchemaMetadata();
      const spy = spyDocApi();
      try {
        assertTrue(await window.CoreGrist.ensureTable('Table_neuve', [{ id: 'A', type: 'Text' }]), 'table créée');
        assertEqual(spy.count('listTables'), 1, 'vérifiée une fois auprès de Grist');
        assertEqual(spy.count('apply:AddTable:Table_neuve'), 1);
        assertFalse(await window.CoreGrist.ensureTable('Table_neuve', [{ id: 'A', type: 'Text' }]), 'ensuite connue');
        assertEqual(spy.count('listTables'), 1, 'plus de vérification');
      } finally { spy.restore(); }
    });

    it('sans métadonnées lisibles, le comportement d\'origine est conservé (listTables / fetchTable)', async function () {
      // Le magasin du mock n'a pas de _grist_Tables : le schéma reste vide.
      await window.CoreGrist.loadColumnDescriptions();
      const spy = spyDocApi();
      try {
        assertFalse(await window.CoreGrist.ensureTable('Programmes', []), 'existe');
        assertFalse(await window.CoreGrist.ensureColumns('Programmes', [{ id: 'Programme', type: 'Text' }]), 'existe');
        assertEqual(spy.count('listTables'), 1);
        assertEqual(spy.count('fetch:Programmes'), 1);
      } finally { spy.restore(); }
    });

    it('lecture partagée : une seule lecture tant que la fenêtre de démarrage est ouverte, relue après invalidation', async function () {
      const spy = spyDocApi();
      try {
        window.CoreGrist.openSharedWindow();
        const [a, b] = await Promise.all([
          window.CoreGrist.getTable('Programmes', { shared: true }),
          window.CoreGrist.getTable('Programmes', { shared: true })
        ]);
        assertTrue(a === b, 'même résultat partagé');
        assertEqual(spy.count('fetch:Programmes'), 1);
        window.CoreGrist.invalidateTable('Programmes');
        await window.CoreGrist.getTable('Programmes', { shared: true });
        assertEqual(spy.count('fetch:Programmes'), 2, 'relue après invalidation');
        window.CoreGrist.closeSharedWindow();
        await window.CoreGrist.getTable('Programmes', { shared: true });
        await window.CoreGrist.getTable('Programmes', { shared: true });
        assertEqual(spy.count('fetch:Programmes'), 4, 'fenêtre fermée : lectures ordinaires, jamais de données périmées');
      } finally { window.CoreGrist.closeSharedWindow(); spy.restore(); }
    });

    it('lecture partagée : un échec (table absente) n\'est pas mémorisé', async function () {
      window.CoreGrist.openSharedWindow();
      try {
        let failed = false;
        try { await window.CoreGrist.getTable('Table_inexistante', { shared: true }); } catch (err) { failed = true; }
        assertTrue(failed, 'la première lecture échoue');
        window.__mockSetTable('Table_inexistante', { id: [1], A: ['x'] });
        const rows = await window.CoreGrist.getTable('Table_inexistante', { shared: true });
        assertEqual(rows.length, 1, 'la table existe maintenant : relue, pas l\'ancien échec');
      } finally { window.CoreGrist.closeSharedWindow(); }
    });

    it('ajouter une colonne à une table lue en partage force la relecture', async function () {
      await installSchemaMetadata();
      const spy = spyDocApi();
      try {
        window.CoreGrist.openSharedWindow();
        await window.CoreGrist.getTable('Programmes', { shared: true });
        await window.CoreGrist.ensureColumns('Programmes', [{ id: 'Colonne_ajoutee', type: 'Text' }]);
        const rows = await window.CoreGrist.getTable('Programmes', { shared: true });
        assertTrue('Colonne_ajoutee' in rows[0], 'la lecture suivante contient la colonne neuve');
      } finally { window.CoreGrist.closeSharedWindow(); spy.restore(); }
    });
  });

  describe('Démarrage du widget (js/app.js)', function () {
    it('premier lancement : colonnes Administratif manquantes créées, puis tables relues avec elles', async function () {
      const restore = prepareViews(), idle = holdIdleCallbacks();
      try {
        const copy = await window.grist.docApi.fetchTable('Projets');
        delete copy.next_step_responsable; delete copy.Transmise_signee_au_porteur_papier_le;
        window.__mockSetTable('Projets', copy);
        await window.SuiviApp.initializeApp();
        const added = window.__TEST_CALLS__.filter(call => call.type === 'AddColumn' && call.table === 'Projets').map(call => call.colId);
        assertTrue(added.includes('next_step_responsable') && added.includes('Transmise_signee_au_porteur_papier_le'), `colonnes créées : ${added.join(', ')}`);
        const project = window.CoreState.getTable('Projets')[0];
        assertTrue('next_step_responsable' in project, 'les tables ont été relues après la création des colonnes');
        assertTrue('Transmise_signee_au_porteur_papier_le' in project);
        assertTrue(cardCount('#projects-kanban .project-card') > 0, 'le Kanban est affiché');
      } finally { idle.restore(); restore(); }
    });

    it('lancement suivant : chaque table lue une fois, Preferences_Widget une fois, aucun listTables ni écriture', async function () {
      const restore = prepareViews(), idle = holdIdleCallbacks();
      try {
        await window.SuiviApp.initializeApp(); // 1er lancement : crée tables, colonnes, ligne de préférences
        await installSchemaMetadata();
        const writesBefore = window.__TEST_CALLS__.length;
        const spy = spyDocApi();
        try {
          await window.SuiviApp.initializeApp();
          ['Projets', 'Annuaire', 'Postes2', 'Structures', 'Programmes', 'Suivi_Instance', 'Lignes_OPE', 'Notifications', 'Preferences_Widget'].forEach(name => {
            assertEqual(spy.count('fetch:' + name), 1, `${name} lue exactement une fois`);
          });
          assertEqual(spy.count('listTables'), 0, 'aucun listTables');
          assertEqual(spy.calls.filter(call => call.startsWith('apply:')).length, 0, `aucune écriture : ${spy.calls.filter(c => c.startsWith('apply:')).join(', ')}`);
          assertEqual(window.__TEST_CALLS__.length, writesBefore, 'ni ligne ni colonne ajoutée');
        } finally { spy.restore(); }
      } finally { idle.restore(); restore(); }
    });

    it('les préférences enregistrées sont retrouvées malgré la lecture partagée (colonne repliée appliquée)', async function () {
      const restore = prepareViews(), idle = holdIdleCallbacks();
      try {
        await window.SuiviApp.initializeApp();
        const prefs = window.__TEST_CALLS__.find(call => call.type === 'AddRecord' && call.table === 'Preferences_Widget');
        assertTrue(!!prefs, 'ligne de préférences créée au premier lancement');
        await window.grist.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', prefs.id, { Kanban_colonnes_repliees: 'Instruction', Kanban_colonnes_masquees: 'Notifications' }]]);
        await window.SuiviApp.initializeApp();
        const instruction = Array.from(document.querySelectorAll('#projects-kanban .kanban-column')).find(s => s.querySelector('h3')?.textContent === 'Instruction');
        assertTrue(instruction.classList.contains('is-collapsed'), 'Instruction repliée comme enregistré');
        assertFalse(Array.from(document.querySelectorAll('#projects-kanban h3')).some(h => h.textContent === 'Notifications'), 'Notifications masquée comme enregistré');
        // Lignes restantes (et non appels) : le mock n'évalue pas la formule Email_utilisateur, la page To Do crée alors une
        // ligne-sonde qu'elle supprime aussitôt (js/pages/page-todo.js, probeUserEmail).
        assertEqual((await window.grist.docApi.fetchTable('Preferences_Widget')).id.length, 1, 'une seule ligne de préférences, jamais une par page');
      } finally {
        window.grist.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', 1, { Kanban_colonnes_repliees: '', Kanban_colonnes_masquees: '' }]]).catch(() => {});
        // L'état des colonnes vit aussi en mémoire dans la page Kanban : sans ce rétablissement, « Notifications » restait masquée
        // et « Instruction » repliée pour toutes les suites suivantes qui affichent le Kanban.
        document.querySelectorAll('#kanban-hidden-columns [data-restore-column]').forEach(btn => btn.click());
        const collapsed = document.querySelector('#projects-kanban .kanban-column.is-collapsed [data-toggle-collapse="Instruction"]');
        if (collapsed) collapsed.click();
        idle.restore(); restore();
      }
    });

    it('seule la page affichée est rendue au démarrage ; les autres le sont à leur ouverture', async function () {
      const restore = prepareViews(), idle = holdIdleCallbacks();
      try {
        await window.SuiviApp.initializeApp();
        assertTrue(cardCount('#projects-kanban .project-card') > 0, 'Kanban rendu');
        assertEqual(cardCount('#admin-col-notif .admin-card'), 0, 'Administratif pas encore rendu');
        assertEqual(cardCount('#todo-panels .admin-panel'), 0, 'To Do pas encore rendu');
        ['view-administratif', 'view-installation-fonds', 'view-todo', 'view-instances'].forEach(id => assertTrue(window.SuiviApp.staleViews.has(id), `${id} à refaire`));
        assertFalse(window.SuiviApp.staleViews.has('view-projects'));

        window.SuiviApp.showView('view-administratif');
        assertTrue(cardCount('#admin-col-notif .admin-card') > 0, 'Administratif rendu dès son ouverture');
        assertFalse(window.SuiviApp.staleViews.has('view-administratif'));
        window.SuiviApp.showView('view-todo');
        assertTrue(cardCount('#todo-panels .admin-panel') > 0, 'To Do rendu dès son ouverture');
      } finally { idle.restore(); restore(); }
    });

    it('les temps morts rendent les pages restantes, une par une', async function () {
      const restore = prepareViews(), idle = holdIdleCallbacks();
      try {
        await window.SuiviApp.initializeApp();
        assertTrue(idle.queue.length === 1, 'un seul rendu différé planifié à la fois');
        idle.flush();
        assertEqual(window.SuiviApp.staleViews.size, 0, 'toutes les pages ont fini par être rendues');
        assertTrue(cardCount('#admin-col-notif .admin-card') > 0 && cardCount('#todo-panels .admin-panel') > 0);
      } finally { idle.restore(); restore(); }
    });

    it('une vue qui devient visible autrement que par showView (ex. retour de la Rédaction) est rendue aussitôt', async function () {
      const restore = prepareViews(), idle = holdIdleCallbacks();
      try {
        await window.SuiviApp.initializeApp();
        document.getElementById('view-projects').classList.add('hidden');
        document.getElementById('view-administratif').classList.remove('hidden');
        await waitFor(() => cardCount('#admin-col-notif .admin-card') > 0, 'Administratif rendu à son apparition');
      } finally { idle.restore(); restore(); }
    });

    it('après l\'enregistrement d\'un projet : la page affichée est mise à jour tout de suite, les autres à leur ouverture', async function () {
      const restore = prepareViews(), idle = holdIdleCallbacks();
      try {
        await window.SuiviApp.initializeApp();
        window.SuiviApp.showView('view-administratif');
        await window.grist.docApi.applyUserActions([['UpdateRecord', 'Projets', 10, { Acronyme: 'RENOMME' }]]);
        await window.SuiviApp.refreshAfterProjectSaved();
        const adminNames = Array.from(document.querySelectorAll('#admin-col-notif .project-acronym')).map(el => el.textContent);
        assertTrue(adminNames.includes('RENOMME'), 'Administratif (visible) à jour');
        assertTrue(window.SuiviApp.staleViews.has('view-projects'), 'le Kanban masqué attend son ouverture');
        window.SuiviApp.showView('view-projects');
        const kanbanNames = Array.from(document.querySelectorAll('#projects-kanban .project-acronym')).map(el => el.textContent);
        assertTrue(kanbanNames.includes('RENOMME'), 'Kanban à jour à son ouverture');
      } finally { idle.restore(); restore(); }
    });
  });

  describe('Écriture différée de la recherche (CoreUtils.debounce)', function () {
    it('debounce : un seul appel avec les derniers arguments, annulable, exécutable tout de suite', async function () {
      const seen = [];
      const soon = window.CoreUtils.debounce(value => seen.push(value), 30);
      soon('a'); soon('ab'); soon('abc');
      assertEqual(seen.length, 0, 'rien pendant la frappe');
      await wait(80);
      assertDeepEqual(seen, ['abc'], 'un seul appel, dernière valeur');
      soon('x'); soon.cancel();
      await wait(80);
      assertDeepEqual(seen, ['abc'], 'annulé');
      soon('y'); soon.flush();
      assertDeepEqual(seen, ['abc', 'y'], 'exécuté tout de suite');
      soon.flush();
      assertDeepEqual(seen, ['abc', 'y'], 'rien à exécuter');
    });

    async function typeInKanbanSearch(values) {
      const search = document.getElementById('filter-search');
      values.forEach(value => { setValue(search, value); fire(search, 'input'); });
    }
    const prefsUpdates = () => window.__TEST_CALLS__.filter(call => call.type === 'UpdateRecord' && call.table === 'Preferences_Widget');

    it('Kanban : taper "innovx" lettre par lettre n\'écrit la préférence qu\'une fois, avec le texte complet', async function () {
      const tables = await window.CoreGrist.loadAllTables();
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      await window.loadKanbanUserPreferences();
      window.renderProjectsKanban();
      const before = prefsUpdates().length;
      await typeInKanbanSearch(['i', 'in', 'inn', 'inno', 'innov', 'innovx']);
      const filtered = Array.from(document.querySelectorAll('#projects-kanban .project-acronym')).map(el => el.textContent);
      assertDeepEqual(filtered, ['INNOVX'], 'le filtre s\'applique à chaque lettre, sans attendre l\'écriture');
      assertEqual(prefsUpdates().length, before, 'aucune écriture pendant la frappe');
      await wait(750);
      const written = prefsUpdates().slice(before);
      assertEqual(written.length, 1, 'une seule écriture après la dernière lettre');
      assertEqual(written[0].fields.Filtre_recherche, 'innovx');
      await typeInKanbanSearch(['']);
      await wait(750);
    });

    it('Kanban : un clic sur une colonne pendant la frappe enregistre tout de suite (recherche comprise) sans double écriture', async function () {
      const tables = await window.CoreGrist.loadAllTables();
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      await window.loadKanbanUserPreferences();
      window.renderProjectsKanban();
      const before = prefsUpdates().length;
      await typeInKanbanSearch(['inn']);
      document.querySelector('[data-toggle-collapse="Instruction"]').click();
      await wait(0);
      const immediate = prefsUpdates().slice(before);
      assertEqual(immediate.length, 1, 'écriture immédiate du repli');
      assertEqual(immediate[0].fields.Filtre_recherche, 'inn', 'elle embarque aussi la recherche en cours');
      await wait(750);
      assertEqual(prefsUpdates().length, before + 1, 'l\'écriture différée a été annulée');
      document.querySelector('[data-toggle-collapse="Instruction"]').click();
      await typeInKanbanSearch(['']);
      await wait(750);
    });
  });

  describe('Modale projet — pièces jointes : une seule lecture de _grist_Attachments par ouverture', function () {
    it('les champs Notification et Convention partagent la même lecture, la suivante relit (table toujours à jour)', async function () {
      const tables = await window.CoreGrist.loadAllTables();
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.__mockSetTable('_grist_Attachments', { id: [501, 502], fileName: ['Notification_signee.pdf', 'Avenant.pdf'] });
      const record = tables.Projets.find(p => p.Acronyme === 'CONVENTIX');
      record.Notifications_Signees = ['L', 501];
      record.Convention_de_reversement_le_cas_echeant = ['L', 501, 502];
      const spy = spyDocApi();
      try {
        window.ProjectModal.open(record);
        await wait(30);
        assertEqual(spy.count('fetch:_grist_Attachments'), 1, 'une seule lecture pour les deux champs');
        window.ProjectModal.open(record);
        await wait(30);
        assertEqual(spy.count('fetch:_grist_Attachments'), 2, 'ouverture suivante : relue');
      } finally { spy.restore(); document.querySelectorAll('.cp-modal').forEach(el => el.remove()); }
    });
  });

  describe('Administratif — changement d\'onglet sans reconstruction', function () {
    async function loadAdmin() {
      const tables = await window.CoreGrist.loadAllTables();
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
    }
    const section = tab => document.querySelector(`[data-admin-panel="${tab}"]`);

    it('les cartes déjà construites restent en place : seul l\'onglet affiché change', async function () {
      await loadAdmin();
      const convCard = document.querySelector('#admin-col-conv .admin-card');
      const notifCard = document.querySelector('#admin-col-notif .admin-card');
      assertTrue(!!convCard && !!notifCard, 'les deux onglets sont construits');
      document.querySelector('[data-admin-tab="conv"]').click();
      assertFalse(section('conv').classList.contains('is-hidden'), 'Conventions affiché');
      assertTrue(section('notif').classList.contains('is-hidden'), 'Notifications masqué');
      assertEqual(document.querySelector('[data-admin-tab="conv"]').getAttribute('aria-selected'), 'true');
      assertTrue(convCard.isConnected && convCard === document.querySelector('#admin-col-conv .admin-card'), 'carte Conventions non reconstruite');
      document.querySelector('[data-admin-tab="notif"]').click();
      assertFalse(section('notif').classList.contains('is-hidden'), 'Notifications de retour');
      assertTrue(notifCard.isConnected && notifCard === document.querySelector('#admin-col-notif .admin-card'), 'carte Notifications non reconstruite');
    });

    it('les volets masqués proposés à la restauration suivent l\'onglet affiché', async function () {
      await loadAdmin();
      document.querySelector('[data-admin-tab="conv"]').click();
      document.querySelector('#admin-col-conv [data-hide-panel]').click();
      const chips = () => document.querySelectorAll('#admin-hidden-panels [data-restore-panel]').length;
      assertEqual(chips(), 1, 'un volet Conventions masqué proposé à la restauration');
      document.querySelector('[data-admin-tab="notif"]').click();
      assertEqual(chips(), 0, 'rien à restaurer côté Notifications');
      assertTrue(document.getElementById('admin-hidden-panels').hidden, 'bandeau des volets masqués caché');
      document.querySelector('[data-admin-tab="conv"]').click();
      assertEqual(chips(), 1, 'de retour sur Conventions');
      document.querySelector('#admin-hidden-panels [data-restore-panel]').click();
      assertEqual(chips(), 0, 'volet restauré');
      document.querySelector('[data-admin-tab="notif"]').click();
    });
  });

  // ── Deuxième vague (17/11/2026) : ouverture et navigation ────────────────────────────────────────────────
  const readRepoFile = async path => (await fetch(path, { cache: 'no-store' })).text();

  describe('Ouverture — la police Google Fonts ne bloque plus l\'affichage ni les scripts', function () {
    it('style.css n\'importe plus la police (un @import bloque le rendu ET l\'exécution des scripts tant que Google n\'a pas répondu)', async function () {
      const css = await readRepoFile('../style.css');
      assertFalse(/@import/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'aucun @import dans style.css (hors commentaires)');
    });

    it('index.html demande la police sans bloquer (media="print" puis bascule au chargement), avec préconnexion', async function () {
      const doc = new DOMParser().parseFromString(await readRepoFile('../index.html'), 'text/html');
      const fonts = Array.from(doc.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis.com"]')).filter(link => !link.closest('noscript'));
      assertEqual(fonts.length, 1, 'une seule feuille de police');
      assertEqual(fonts[0].getAttribute('media'), 'print', 'chargée hors du chemin critique');
      assertTrue(/media\s*=\s*['"]all['"]/.test(fonts[0].getAttribute('onload') || ''), 'basculée en media=all une fois chargée');
      assertTrue(/display=swap/.test(fonts[0].getAttribute('href')), 'font-display: swap conservé (le texte s\'affiche tout de suite)');
      assertTrue(!!doc.querySelector('link[rel="preconnect"][href="https://fonts.googleapis.com"]') && !!doc.querySelector('link[rel="preconnect"][href="https://fonts.gstatic.com"]'), 'préconnexion aux deux domaines');
      assertTrue(!!doc.querySelector('noscript link[href*="fonts.googleapis.com"]'), 'repli sans JavaScript');
    });

    it('aucune autre feuille de style externe ne bloque le rendu (seules les feuilles du widget, même origine)', async function () {
      const doc = new DOMParser().parseFromString(await readRepoFile('../index.html'), 'text/html');
      const blocking = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).filter(link => !link.closest('noscript') && !link.hasAttribute('media') && /^https?:/.test(link.getAttribute('href')));
      assertEqual(blocking.length, 0, `feuilles externes bloquantes : ${blocking.map(l => l.getAttribute('href')).join(', ')}`);
    });
  });

  describe('Ouverture — indicateur « Chargement… » discret', function () {
    it('index.html contient l\'indicateur, fixe (aucune place prise) et retardé de 0,4 s : un démarrage rapide ne le montre jamais', async function () {
      const doc = new DOMParser().parseFromString(await readRepoFile('../index.html'), 'text/html');
      const pill = doc.getElementById('app-loading');
      assertTrue(!!pill, 'indicateur présent');
      assertEqual(pill.getAttribute('role'), 'status');
      const css = await readRepoFile('../style.css');
      const rule = (/\.app-loading\s*\{([^}]*)\}/.exec(css) || [])[1] || '';
      assertTrue(/position:\s*fixed/.test(rule), 'position fixe : pas de décalage de la mise en page quand il disparaît');
      assertTrue(/animation:[^;]*\.4s\s+both/.test(rule), 'apparition retardée de 0,4 s, invisible pendant le délai');
    });

    it('le démarrage le masque une fois la première page affichée', async function () {
      const restore = prepareViews(), idle = holdIdleCallbacks();
      const pill = document.createElement('div'); pill.id = 'app-loading'; document.body.appendChild(pill);
      try {
        await window.SuiviApp.initializeApp();
        assertTrue(pill.hidden, 'indicateur masqué');
      } finally { pill.remove(); idle.restore(); restore(); }
    });

    it('il est aussi masqué quand l\'initialisation échoue (sinon il resterait affiché à côté du message d\'erreur)', async function () {
      const restore = prepareViews(), idle = holdIdleCallbacks();
      const pill = document.createElement('div'); pill.id = 'app-loading'; document.body.appendChild(pill);
      const original = window.CoreGrist.loadAllTablesStaged;
      window.CoreGrist.loadAllTablesStaged = () => { throw new Error('panne simulée'); };
      try {
        await window.SuiviApp.initializeApp();
        assertTrue(pill.hidden, 'indicateur masqué malgré l\'échec');
      } finally { window.CoreGrist.loadAllTablesStaged = original; pill.remove(); idle.restore(); restore(); }
    });
  });

  describe('Navigation — fondu de page bref, cartes hors écran non mises en page', function () {
    it('le fondu d\'ouverture d\'une page dure moins de 0,15 s et sans glissement (à 0,2 s avec translateY, il ajoutait ~200 ms perçus à chaque changement de page)', async function () {
      const css = await readRepoFile('../style.css');
      const rule = /\.view\s*\{[^}]*animation:\s*fadeIn\s+([\d.]+)(m?s)/.exec(css);
      assertTrue(!!rule, 'règle .view avec animation fadeIn');
      const seconds = Number(rule[1]) / (rule[2] === 'ms' ? 1000 : 1);
      assertTrue(seconds > 0 && seconds <= 0.15, `durée du fondu : ${seconds} s`);
      const keyframes = (/@keyframes\s+fadeIn\s*\{([\s\S]*?\})\s*\}/.exec(css) || [])[1] || '';
      assertTrue(keyframes.length > 0, 'image-clé fadeIn trouvée');
      assertFalse(/transform/.test(keyframes), 'aucun glissement dans le fondu de page');
      assertTrue(/prefers-reduced-motion:\s*reduce\)\s*\{\s*\.view\s*\{\s*animation:\s*none/.test(css), 'aucune animation si le système demande de réduire les animations');
    });

    const CARD_RULES = [
      { file: '../css/administratif.css', selector: /\.mode-rows \.admin-card:not\(\.todo-card\)\s*\{[^}]*content-visibility:\s*auto[^}]*contain-intrinsic-size:\s*auto\s+\d+px/, label: 'cartes Administratif en lignes' },
      { file: '../css/administratif.css', selector: /\.mode-cards \.admin-card:not\(\.todo-card\)\s*\{[^}]*content-visibility:\s*auto[^}]*contain-intrinsic-size:\s*auto\s+\d+px/, label: 'cartes Administratif en cartes' },
      { file: '../css/installation.css', selector: /\.install-card\s*\{[^}]*content-visibility:\s*auto[^}]*contain-intrinsic-size:\s*auto\s+\d+px/, label: 'cartes Installation des fonds' },
      { file: '../kanban.css', selector: /\.project-card\s*\{[^}]*content-visibility:\s*auto[^}]*contain-intrinsic-size:\s*auto\s+\d+px/, label: 'cartes du Kanban' }
    ];
    CARD_RULES.forEach(({ file, selector, label }) => {
      it(`${label} : content-visibility:auto avec une hauteur de repli « auto »`, async function () {
        assertTrue(selector.test(await readRepoFile(file)), `règle attendue dans ${file}`);
      });
    });

    it('le rognage du contenu d\'une carte (paint containment) ne doit rien couper : le popover de date est posé dans <body>, jamais dans une carte', async function () {
      const tables = await window.CoreGrist.loadAllTables();
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      document.querySelector('[data-admin-tab="conv"]').click();
      const anchor = document.querySelector('#admin-col-conv [data-pop-anchor]');
      assertTrue(!!anchor, 'une pastille de date à ouvrir');
      anchor.click();
      const popover = document.querySelector('.admin-popover');
      try {
        assertTrue(!!popover, 'popover ouvert');
        assertEqual(popover.parentElement, document.body, 'popover enfant direct de <body>');
        assertEqual(popover.closest('.admin-card'), null, 'aucune carte ne contient le popover');
      } finally { window.AdministratifConv.closePopover(); document.querySelector('[data-admin-tab="notif"]').click(); }
    });
  });

  describe('Requêtes inutiles — table inexistante et lectures en série', function () {
    it('loadAllTables ne demande plus la table « Etablissement » (singulier), absente du document et lue par personne', async function () {
      const spy = spyDocApi();
      try {
        const tables = await window.CoreGrist.loadAllTables();
        assertEqual(spy.count('fetch:Etablissement'), 0, 'aucune lecture de la table inexistante');
        assertEqual(spy.count('fetch:Etablissements'), 1, 'la vraie table est lue');
        assertFalse('Etablissement' in tables, 'pas de clé fantôme dans les tables chargées');
      } finally { spy.restore(); }
    });

    it('page Instances : la composition des instances est lue en même temps que les autres tables (un seul aller-retour, pas deux ou trois en série)', async function () {
      const grist = window.CoreGrist, original = { getTable: grist.getTable, knownTableIds: grist.knownTableIds, columnTypes: grist.columnTypes };
      const events = [];
      grist.knownTableIds = () => ['Projets', 'Instances', 'Composition_instances', 'Lieux'];
      grist.columnTypes = id => (id === 'Composition_instances' ? { Instance: 'Ref:Instances', Personne: 'Ref:Annuaire', Lieu: 'Ref:Lieux' } : null);
      grist.getTable = function (name) {
        events.push('début:' + name);
        return new Promise(resolve => setTimeout(() => {
          events.push('fin:' + name);
          resolve(name === 'Composition_instances' ? [{ id: 1, Instance: 1, Personne: 2, Lieu: 7 }] : name === 'Lieux' ? [{ id: 7, Lieux: 'Salle A' }] : []);
        }, 25));
      };
      try {
        const raw = await window.InstancesData.fetchAll();
        const firstEnd = events.findIndex(event => event.startsWith('fin:'));
        const startsBeforeFirstEnd = events.slice(0, firstEnd).filter(event => event.startsWith('début:')).map(event => event.slice(6));
        ['Instances', 'Suivi_Instance', 'Export_VP', 'Composition_instances'].forEach(name => {
          assertTrue(startsBeforeFirstEnd.includes(name), `${name} est demandée avant que la première lecture soit terminée (en parallèle) ; démarrées d'abord : ${startsBeforeFirstEnd.join(', ')}`);
        });
        assertEqual(raw.Composition__id, 'Composition_instances');
        assertEqual(raw.Composition.length, 1, 'composition lue');
        assertEqual(raw.Composition__types.Lieu, 'Ref:Lieux', 'types de colonnes conservés');
        assertEqual(raw.Composition__refNames.Lieux[7], 'Salle A', 'libellés de la table liée lus aussi');
      } finally { Object.assign(grist, original); }
    });

    it('page Instances : une composition illisible n\'empêche pas le chargement des autres tables (erreur notée, rien de bloquant)', async function () {
      const grist = window.CoreGrist, original = { getTable: grist.getTable, knownTableIds: grist.knownTableIds };
      grist.knownTableIds = () => ['Composition_instances'];
      grist.getTable = async name => { if (name === 'Composition_instances') throw new Error('illisible'); return []; };
      try {
        const raw = await window.InstancesData.fetchAll();
        assertEqual(raw.Composition__error, 'illisible', 'erreur retenue');
        assertEqual(raw.Composition.length, 0, 'composition vide');
        assertTrue(Array.isArray(raw.Instances) && Array.isArray(raw.Suivi_Instance), 'les autres tables sont chargées');
      } finally { Object.assign(grist, original); }
    });
  });

  describe('Diagnostic de chargement — jalons du démarrage', function () {
    it('le démarrage note ses jalons dans l\'ordre, jusqu\'à « première page affichée », et écrit le rapport dans la console', async function () {
      const restore = prepareViews(), idle = holdIdleCallbacks();
      const infos = [], originalInfo = console.info;
      console.info = (...args) => { infos.push(args.join(' ')); };
      try {
        window.PerfTrace._reset();
        await window.SuiviApp.initializeApp();
        const names = window.PerfTrace.marks().map(m => m.name);
        const wanted = ['initialisation démarrée', 'grist.ready terminé', 'Tables du Kanban et préférences lues', 'Kanban affiché', 'toutes les tables et le schéma lus', 'colonnes Administratif vérifiées', 'préférences des pages chargées', 'première page affichée'];
        let last = -1;
        wanted.forEach(label => {
          const at = names.findIndex(name => name.startsWith(label));
          assertTrue(at > last, `jalon « ${label} » absent ou dans le désordre (vu : ${names.join(' | ')})`);
          last = at;
        });
        const labels = window.PerfTrace.calls().map(c => c.label);
        assertTrue(labels.includes('lecture : Projets') && labels.includes('lecture : Preferences_Widget'), `lectures notées : ${labels.join(', ')}`);
        assertTrue(infos.some(line => line.includes('Diagnostic de chargement')), 'rapport écrit dans la console');
      } finally { console.info = originalInfo; idle.restore(); restore(); }
    });
  });

  // ── Démarrage en deux temps : le Kanban s'affiche avant la lecture des autres tables ─────────────────────────
  describe('Démarrage en deux temps (js/app.js) — Kanban d\'abord, le reste ensuite', function () {
    // Le premier temps = les tables que l'application lit avant d'afficher le Kanban (EARLY_TABLES) + les préférences : seules les autres sont retardées.
    const CRITICAL = [...window.SuiviApp.EARLY_TABLES, 'Preferences_Widget'];
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitUntil = async (test, label) => { const end = Date.now() + 4000; while (!test()) { if (Date.now() > end) throw new Error('délai dépassé : ' + label); await wait(5); } };
    // Les tables autres que celles du Kanban arrivent en retard (150 ms) : le serveur les traite après les premières.
    function delayRest(delay) {
      const api = window.grist.docApi, original = api.fetchTable;
      api.fetchTable = function (name) {
        const result = original.call(api, name);
        return CRITICAL.includes(name) || name.startsWith('_grist_') ? result : result.then(data => wait(delay).then(() => data));
      };
      return () => { api.fetchTable = original; };
    }
    // Premier lancement fait une fois (création des tables, colonnes et ligne de préférences) ; chaque test repart ensuite d'un
    // écran vide et d'un état vide, comme à l'ouverture du widget.
    function emptyScreen() {
      ['admin-col-notif', 'admin-col-conv', 'todo-panels', 'install-col-diese', 'install-col-ailleurs', 'install-col-non_classe', 'projects-kanban']
        .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
      window.SuiviApp.staleViews.clear();
      window.SuiviApp.cancelIdleRenders();
      document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
      document.getElementById('view-projects').classList.remove('hidden');
      document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.id === 'btn-projects'));
      window.CoreState.clearState();
    }
    async function prepared(run) {
      const restore = prepareViews(), idle = holdIdleCallbacks();
      const pill = document.createElement('div'); pill.id = 'app-loading'; pill.textContent = 'Chargement des données…'; document.body.appendChild(pill);
      try {
        await window.SuiviApp.initializeApp();
        emptyScreen(); pill.hidden = false; pill.textContent = 'Chargement des données…';
        await run(pill);
      } finally { pill.remove(); idle.restore(); restore(); }
    }

    it('le Kanban est rendu dès que ses tables (Projets, Annuaire, Programmes, Suivi_Instance) et les préférences sont lus ; les autres tables arrivent après', async function () {
      await prepared(async pill => {
        const undelay = delayRest(150);
        try {
          const started = window.SuiviApp.initializeApp();
          await waitUntil(() => cardCount('#projects-kanban .project-card') > 0, 'cartes du Kanban');
          assertFalse(window.SuiviApp.isDataComplete(), 'le reste des tables est encore en cours de lecture');
          assertEqual((window.CoreState.getTable('Postes2') || []).length, 0, 'Postes2 pas encore appliquée');
          assertEqual((window.CoreState.getTable('Notifications') || []).length, 0, 'Notifications pas encore appliquée');
          assertFalse(pill.hidden, 'l\'indicateur reste affiché tant que tout n\'est pas lu');
          assertIncludes(pill.textContent, 'autres tables', 'il dit ce qui se charge encore');
          await started;
          assertTrue(window.SuiviApp.isDataComplete(), 'tout est lu');
          assertTrue(pill.hidden, 'indicateur masqué');
          assertTrue((window.CoreState.getTable('Postes2') || []).length > 0 && (window.CoreState.getTable('Notifications') || []).length > 0, 'toutes les tables appliquées');
        } finally { undelay(); }
      });
    });

    it('le Kanban affiché n\'est pas reconstruit une fois tout lu (mêmes cartes, mêmes données)', async function () {
      await prepared(async () => {
        const undelay = delayRest(80);
        try {
          const started = window.SuiviApp.initializeApp();
          await waitUntil(() => cardCount('#projects-kanban .project-card') > 0, 'cartes du Kanban');
          const card = document.querySelector('#projects-kanban .project-card');
          const projects = window.CoreState.getTable('Projets');
          await started;
          assertTrue(card.isConnected && card === document.querySelector('#projects-kanban .project-card'), 'carte non reconstruite');
          assertEqual(window.CoreState.getTable('Projets'), projects, 'mêmes projets (pas relus ni recopiés)');
        } finally { undelay(); }
      });
    });

    // Bug du 26/11/2026 : « Programme (id 1) non lisible » sur toutes les cartes. Le Kanban affiché au premier temps n'est pas reconstruit une fois
    // tout lu, mais Programmes (badge, filtre) et Suivi_Instance (filtre Instance, CTO épinglés) n'étaient lues qu'au second temps : leurs libellés
    // restaient « non lisibles » (avant le 24/11 : le numéro brut) jusqu'au prochain filtre ou enregistrement.
    it('le Kanban affiché au premier temps est identique à celui d\'une fois tout lu : badges Programme, filtres Programme et Instance — jamais « non lisible » ni un numéro', async function () {
      await prepared(async () => {
        const undelay = delayRest(80);
        try {
          const snapshot = () => ({
            cards: document.getElementById('projects-kanban').innerHTML,
            badges: Array.from(document.querySelectorAll('#projects-kanban .programme-badge')).map(badge => badge.textContent),
            programmes: document.getElementById('filter-programme-list').innerHTML,
            instances: document.getElementById('filter-instance-list').innerHTML
          });
          const started = window.SuiviApp.initializeApp();
          await waitUntil(() => cardCount('#projects-kanban .project-card') > 0, 'cartes du Kanban');
          assertFalse(window.SuiviApp.isDataComplete(), 'le reste des tables est encore en cours de lecture : c\'est bien l\'affichage du premier temps');
          const early = snapshot();
          await started;
          window.renderProjectsKanban(); // l'affichage complet, refait à partir de toutes les tables
          const full = snapshot();
          assertTrue(early.badges.length > 0, 'des badges Programme sont affichés');
          assertEqual(early.badges.filter(text => /non lisible/.test(text)).length, 0, `aucun programme « non lisible » (vu : ${early.badges.join(' | ')})`);
          assertTrue(early.badges.includes('Programme A') && early.badges.includes('Programme B'), `les noms des programmes, pas leurs numéros (vu : ${early.badges.join(' | ')})`);
          assertEqual(early.cards, full.cards, 'mêmes cartes qu\'une fois tout lu');
          assertEqual(early.programmes, full.programmes, 'même liste du filtre Programme');
          assertEqual(early.instances, full.instances, 'même liste du filtre Instance (CTO épinglés compris)');
        } finally { undelay(); }
      });
    });

    it('toute table que le Kanban lit et que le widget charge au démarrage fait partie du premier temps (EARLY_TABLES) : sinon ses libellés restent vides jusqu\'au prochain rendu', async function () {
      await prepared(async () => {
        const tables = await window.CoreGrist.loadAllTables(); // état rempli comme une fois tout lu : le Kanban résout alors tous ses libellés
        Object.entries(tables).forEach(([name, rows]) => window.CoreState.setTable(name, rows));
        const read = new Set(), original = window.CoreState.getTable;
        window.CoreState.getTable = function (name) { read.add(name); return original.call(window.CoreState, name); };
        try { window.renderProjectsKanban(); } finally { window.CoreState.getTable = original; }
        const startup = window.CoreGrist.tableNames();
        const missing = [...read].filter(name => startup.includes(name) && !window.SuiviApp.EARLY_TABLES.includes(name));
        assertDeepEqual(missing, [], `tables lues par le Kanban mais absentes du premier temps : ${missing.join(', ')}`);
        assertTrue(['Projets', 'Annuaire', 'Programmes', 'Suivi_Instance'].every(name => read.has(name)), `le Kanban lit bien : ${[...read].join(', ')}`);
      });
    });

    it('en attendant, les autres pages ne se construisent pas (elles seraient vides) : elles restent « à refaire » puis se rendent', async function () {
      await prepared(async () => {
        const undelay = delayRest(120);
        try {
          const started = window.SuiviApp.initializeApp();
          await waitUntil(() => cardCount('#projects-kanban .project-card') > 0, 'cartes du Kanban');
          window.SuiviApp.renderView('view-administratif');
          assertTrue(window.SuiviApp.staleViews.has('view-administratif'), 'Administratif reste à refaire');
          assertEqual(cardCount('#admin-col-notif .admin-card'), 0, 'rien de construit avec des tables absentes');
          await started;
          window.SuiviApp.renderView('view-administratif');
          assertTrue(cardCount('#admin-col-notif .admin-card') > 0, 'rendue normalement une fois tout lu');
        } finally { undelay(); }
      });
    });

    it('en attendant, la navigation et l\'ouverture d\'une fiche sont mises de côté puis rejouées ; les filtres restent utilisables', async function () {
      await prepared(async () => {
        const undelay = delayRest(120);
        const todoButton = document.querySelector('.nav-btn[data-view="view-todo"]');
        try {
          const started = window.SuiviApp.initializeApp();
          await waitUntil(() => cardCount('#projects-kanban .project-card') > 0, 'cartes du Kanban');
          todoButton.click();
          assertTrue(document.getElementById('view-todo').classList.contains('hidden'), 'la page To Do ne s\'ouvre pas encore');
          assertFalse(document.getElementById('view-projects').classList.contains('hidden'), 'le Kanban reste affiché');
          assertIncludes(document.getElementById('app-loading').textContent, 'votre clic', 'le message explique l\'attente');
          const filterClick = new MouseEvent('click', { bubbles: true, cancelable: true });
          document.getElementById('clear-filters').dispatchEvent(filterClick);
          assertFalse(filterClick.defaultPrevented, 'le bouton Réinitialiser des filtres n\'est pas bloqué');
          await started;
          assertFalse(document.getElementById('view-todo').classList.contains('hidden'), 'le clic mis de côté est rejoué : To Do s\'ouvre');
        } finally { undelay(); }
      });
    });

    it('en cas d\'échec du démarrage, plus rien n\'est bloqué : les clics repassent', async function () {
      await prepared(async () => {
        const original = window.loadTodoUserPreferences;
        window.loadTodoUserPreferences = async () => { throw new Error('panne simulée'); };
        try {
          await window.SuiviApp.initializeApp();
          assertTrue(window.SuiviApp.isDataComplete(), 'déverrouillé malgré l\'échec');
          const click = new MouseEvent('click', { bubbles: true, cancelable: true });
          document.querySelector('.nav-btn[data-view="view-projects"]').dispatchEvent(click);
          assertFalse(click.defaultPrevented, 'plus aucun clic retenu');
        } finally { window.loadTodoUserPreferences = original; }
      });
    });

    it('une page retrouvée au rechargement qui n\'est pas le Kanban attend toutes les tables avant de s\'afficher (comportement d\'origine)', async function () {
      await prepared(async () => {
        const undelay = delayRest(120);
        try {
          window.localStorage.setItem('suiviProjetInnovationS:lastView', JSON.stringify({ view: 'view-administratif', pending: true }));
          const started = window.SuiviApp.initializeApp();
          await wait(60);
          assertEqual(cardCount('#admin-col-notif .admin-card'), 0, 'rien tant que les tables ne sont pas toutes lues');
          assertTrue(window.SuiviApp.isDataComplete(), 'aucun verrouillage : on attend, comme avant');
          await started;
          assertTrue(cardCount('#admin-col-notif .admin-card') > 0, 'Administratif affiché une fois tout lu');
        } finally { undelay(); window.SuiviApp.resetLastView(); }
      });
    });
  });

  describe('CoreGrist — colonnes apprises des lectures (ensureTable / ensureColumns sans attendre le schéma)', function () {
    async function withoutSchema() {
      // Métadonnées illisibles dans le mock : le schéma connu est vide, seules les lectures renseignent ce qu'on sait.
      await window.CoreGrist.loadColumnDescriptions();
    }

    it('une table déjà lue n\'est plus vérifiée : ensureTable / ensureColumns ne font aucun appel', async function () {
      await withoutSchema();
      assertEqual(window.CoreGrist.knownColumns('Programmes'), null, 'schéma de métadonnées toujours inconnu');
      await window.CoreGrist.getTable('Programmes');
      const spy = spyDocApi();
      try {
        assertFalse(await window.CoreGrist.ensureTable('Programmes', [{ id: 'Programme', type: 'Text' }]), 'table connue');
        assertFalse(await window.CoreGrist.ensureColumns('Programmes', [{ id: 'Programme', type: 'Text' }]), 'colonne connue');
        assertEqual(spy.calls.length, 0, `aucun appel attendu, vu : ${spy.calls.join(', ')}`);
      } finally { spy.restore(); }
    });

    it('knownColumns reste null quand les métadonnées sont illisibles (les lectures n\'y changent rien)', async function () {
      await withoutSchema();
      await window.CoreGrist.getTable('Projets');
      assertEqual(window.CoreGrist.knownColumns('Projets'), null);
      assertEqual(window.CoreGrist.knownTableIds().length, 0);
    });

    it('une colonne absente de la table lue est bien créée (la connaissance est positive seulement)', async function () {
      await withoutSchema();
      await window.CoreGrist.getTable('Programmes');
      const spy = spyDocApi();
      try {
        assertTrue(await window.CoreGrist.ensureColumns('Programmes', [{ id: 'Colonne_jamais_vue', type: 'Text' }]), 'colonne créée');
        assertEqual(spy.count('apply:AddColumn:Programmes'), 1);
      } finally { spy.restore(); }
    });

    it('une lecture en échec (table disparue) efface ce qu\'on croyait savoir : on revérifie auprès de Grist au lieu de la croire présente', async function () {
      await withoutSchema();
      await window.CoreGrist.getTable('Programmes');
      const api = window.grist.docApi, original = api.fetchTable;
      api.fetchTable = name => name === 'Programmes' ? Promise.reject(new Error('table disparue')) : original.call(api, name);
      try { await window.CoreGrist.getTable('Programmes'); } catch (err) { /* attendu */ } finally { api.fetchTable = original; }
      const spy = spyDocApi();
      try {
        await window.CoreGrist.ensureTable('Programmes', [{ id: 'Programme', type: 'Text' }]);
        assertTrue(spy.count('listTables') >= 1, 'retour à la vérification auprès de Grist');
      } finally { spy.restore(); }
    });

    it('loadAllTablesStaged : `critical` arrive avant `all`, les mêmes projets complétés une seule fois', async function () {
      const staged = window.CoreGrist.loadAllTablesStaged(['Projets', 'Annuaire']);
      const critical = await staged.critical;
      assertTrue(Array.isArray(critical.Projets) && critical.Projets.length > 0 && critical.Projets[0].Nom !== undefined, 'projets complétés (alias d\'affichage)');
      assertTrue(Array.isArray(critical.Annuaire), 'annuaire');
      assertFalse('Postes2' in critical, 'les autres tables ne sont pas dans le premier temps');
      const all = await staged.all;
      assertEqual(all.Projets, critical.Projets, 'mêmes projets, pas recopiés');
      assertTrue(['Postes2', 'Structures', 'Programmes', 'Etablissements', 'Suivi_Instance', 'Lignes_OPE', 'Notifications'].every(name => name in all), 'toutes les tables');
    });

    it('loadAllTables garde son comportement : toutes les tables, projets complétés', async function () {
      const tables = await window.CoreGrist.loadAllTables();
      assertTrue(tables.Projets.length > 0 && tables.Projets[0].Nom !== undefined && tables.Projets[0].Statut !== undefined, 'alias d\'affichage');
      assertTrue('Notifications' in tables && 'Annuaire' in tables);
    });
  });
})();
