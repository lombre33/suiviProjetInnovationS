/**
 * Non-regression suite: page Rédaction (js/pages/page-redaction.js) et bouton "Rédiger" des cartes Notifications
 * (js/pages/page-administratif.js). Le widget imbriqué est un faux publipostage+ (tests/fake-publipostage.html) qui
 * charge le vrai client grist-plugin-api de Grist ; le détail du protocole est couvert par suite-bridge.js.
 * Fixtures : INNOVX (id 10), NOTIFY (11), CONVENTIX (12) et SIGNEX (16) ont une fiche Notifications.
 */
(function () {
  'use strict';

  const fakeWidget = () => `${location.origin}/tests/fake-publipostage.html`;
  const silentWidget = () => `${location.origin}/tests/silent-widget.html`;
  const byId = id => document.getElementById(id);

  async function loadFixtureState() {
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    window.renderAdministratif();
  }

  function panelIn(colId, label) {
    return Array.from(document.querySelectorAll(`#${colId} .admin-panel`))
      .find(section => section.querySelector('.admin-panel-header h4')?.textContent === label);
  }

  function cardByAcronym(acronym) {
    return Array.from(document.querySelectorAll('#admin-col-notif .admin-card'))
      .find(card => card.querySelector('.admin-card-identity .project-acronym')?.textContent === acronym);
  }

  // Clique « Rédiger » puis attend que la page ait résolu la ligne à présenter et créé l'iframe (open() est asynchrone).
  async function clickRedact(acronym) {
    fireMouse(cardByAcronym(acronym).querySelector('[data-redact-notif]'), 'click');
    await window.PageRedaction.opening;
  }

  // Le widget à imbriquer se choisit par ?publipostage=<url> sur l'URL du widget (cf. PageRedaction.resolveTarget).
  function useWidget(url) { history.replaceState(null, '', `?publipostage=${encodeURIComponent(url)}`); }

  function resetPage() {
    window.PageRedaction.reset();
    window.PageRedaction.forgetTable();
    window.PageRedaction.readyTimeoutMs = 10000;
    window.PageRedaction.readModeTickMs = 150;
    window.PageRedaction.readModeGiveUpMs = 40000;
    history.replaceState(null, '', location.pathname);
    byId('view-administratif').classList.remove('hidden');
    byId('view-redaction').classList.add('hidden');
  }

  // `table` : la table présentée à publipostage+ (le choix du sélecteur). Projets par défaut, pour que les tests de connexion et
  // de mode Lecture restent indépendants du choix de table ; null laisse la page choisir seule (cf. « table présentée » plus bas).
  async function withPage(widgetUrl, fn, table = 'Projets') {
    resetPage();
    if (widgetUrl) useWidget(widgetUrl);
    if (table) window.PageRedaction.setTable(table);
    try {
      await loadFixtureState();
      await fn();
    } finally { resetPage(); }
  }

  const nested = () => window.PageRedaction.frame.contentWindow.__NESTED__;

  describe('Rédaction — bouton "Rédiger" des cartes Notifications', function () {
    it('chaque carte Notifications propose "Rédiger" avec l\'id du projet ; les cartes Conventions non', async function () {
      await withPage(null, async () => {
        const cards = Array.from(document.querySelectorAll('#admin-col-notif .admin-card'));
        assertEqual(cards.length, 4, 'INNOVX, NOTIFY, CONVENTIX et SIGNEX ont une fiche Notifications');
        cards.forEach(card => {
          const button = card.querySelector('[data-redact-notif]');
          assertTrue(!!button, `bouton Rédiger sur ${card.querySelector('.project-acronym').textContent}`);
          assertEqual(button.dataset.redactNotif, card.dataset.projectId);
          assertEqual(button.textContent.trim(), 'Rédiger');
        });
        assertEqual(document.querySelectorAll('#admin-col-conv [data-redact-notif]').length, 0);
      });
    });

    it('le bouton "Suivant" et le badge "Archivée" restent en place à côté de "Rédiger"', async function () {
      await withPage(null, async () => {
        assertTrue(!!cardByAcronym('INNOVX').querySelector('[data-advance-notif]'));
        assertEqual(cardByAcronym('SIGNEX').querySelector('.admin-done-badge')?.textContent, 'Archivée');
        assertTrue(!!cardByAcronym('SIGNEX').querySelector('[data-redact-notif]'));
      });
    });
  });

  describe('Rédaction — page et widget imbriqué', function () {
    it('cliquer "Rédiger" ouvre la vue Rédaction (Administratif masqué) avec l\'acronyme du projet', async function () {
      await withPage(fakeWidget(), async () => {
        fireMouse(cardByAcronym('NOTIFY').querySelector('[data-redact-notif]'), 'click');
        // La vue s'affiche tout de suite ; l'iframe suit, une fois la ligne à présenter résolue (lectures du document).
        assertFalse(byId('view-redaction').classList.contains('hidden'));
        assertTrue(byId('view-administratif').classList.contains('hidden'));
        assertEqual(byId('redaction-project').textContent, 'NOTIFY');
        await window.PageRedaction.opening;
        assertTrue(!!window.PageRedaction.frame);
      });
    });

    it('le widget imbriqué reçoit le projet cliqué comme enregistrement sélectionné ; l\'iframe est créée une seule fois', async function () {
      await withPage(fakeWidget(), async () => {
        await clickRedact('NOTIFY');
        const frame = window.PageRedaction.frame;
        assertEqual(frame.src, fakeWidget());
        await window.PageRedaction.bridge.whenReady(8000);
        await waitFor(() => nested().normal.some(entry => entry.record.id === 11), 'ligne NOTIFY reçue');
        assertEqual(nested().normal[0].record.Acronyme, 'NOTIFY');

        await window.PageRedaction.close();
        await clickRedact('INNOVX');
        assertTrue(window.PageRedaction.frame === frame, 'la même iframe est réutilisée : publipostage+ garde son état');
        await waitFor(() => nested().normal.some(entry => entry.record.id === 10 && entry.record.Acronyme === 'INNOVX'), 'ligne INNOVX reçue');
        assertEqual(document.querySelectorAll('#redaction-frame-wrap iframe').length, 1);
      });
    });

    it('le widget imbriqué connaît la table liée (Projets)', async function () {
      await withPage(fakeWidget(), async () => {
        await clickRedact('INNOVX');
        await waitFor(() => nested() && nested().tableId, 'tableId');
        assertEqual(nested().tableId, 'Projets');
      });
    });

    it('la puce d\'état passe de "Connexion" à "connecté" quand publipostage+ répond', async function () {
      await withPage(fakeWidget(), async () => {
        await clickRedact('INNOVX');
        assertTrue(byId('redaction-status').classList.contains('is-waiting'));
        await waitFor(() => byId('redaction-status').classList.contains('is-ready'), 'puce connecté');
        assertEqual(byId('redaction-status-text').textContent, 'publipostage+ connecté');
      });
    });

    it('sans réponse du widget (mauvaise URL, page non déployée), la puce passe en erreur et le journal l\'explique', async function () {
      await withPage(silentWidget(), async () => {
        window.PageRedaction.readyTimeoutMs = 200;
        await clickRedact('INNOVX');
        await waitFor(() => byId('redaction-status').classList.contains('is-error'), 'puce en erreur');
        assertIncludes(byId('redaction-status-text').textContent, 'ne répond pas');
        fireMouse(byId('redaction-status'), 'click');
        assertFalse(byId('redaction-diag').hidden, 'cliquer la puce ouvre le journal de diagnostic');
        const text = byId('redaction-log').textContent;
        assertIncludes(text, silentWidget());
        assertIncludes(text, `Origine acceptée : ${location.origin}`);
        assertIncludes(text, 'Projets #10');
        assertIncludes(text, 'État : en attente du widget');
        assertIncludes(text, 'Piste : aucun "prêt" reçu', 'le journal propose une piste, pas seulement un état');
        fireMouse(byId('redaction-status'), 'click');
        assertTrue(byId('redaction-diag').hidden, 'un second clic referme le journal');
      });
    });

    // Si Grist exécute les widgets dans une iframe sandboxée sans allow-same-origin, l'iframe imbriquée en hérite : origine "null".
    // Simulé avec un vrai attribut sandbox posé après une première connexion normale, puis une nouvelle navigation.
    async function reloadSandboxed() {
      const frame = window.PageRedaction.frame;
      await window.PageRedaction.bridge.whenReady(8000);
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.src = `${fakeWidget()}?sandboxé`;
    }

    it('iframe sandboxée (origine "null") : refusée, signalée dans la puce, avec la piste ?bridgeOrigin=*', async function () {
      await withPage(fakeWidget(), async () => {
        await clickRedact('NOTIFY');
        await reloadSandboxed();
        await waitFor(() => window.PageRedaction.bridge.getState().phase === 'rejected', 'origine "null" refusée');
        assertTrue(byId('redaction-status').classList.contains('is-error'));
        assertEqual(byId('redaction-status-text').textContent, 'Origine du widget refusée');
        fireMouse(byId('redaction-status'), 'click');
        const text = byId('redaction-log').textContent;
        assertIncludes(text, 'origine "null"');
        assertIncludes(text, 'bridgeOrigin=*');
      });
    });

    it('iframe sandboxée avec ?bridgeOrigin=* : le widget imbriqué se connecte et reçoit le projet', async function () {
      await withPage(fakeWidget(), async () => {
        history.replaceState(null, '', `?publipostage=${encodeURIComponent(fakeWidget())}&bridgeOrigin=*`);
        await clickRedact('NOTIFY');
        await reloadSandboxed();
        const readyCount = () => window.PageRedaction.bridge.getLog().filter(entry => entry.kind === 'ready').length;
        await waitFor(() => readyCount() >= 2, 'nouvelle connexion depuis l\'iframe sandboxée');
        await waitFor(() => window.PageRedaction.bridge.getLog().filter(entry => entry.text === 'GristView.fetchSelectedRecord(11)').length >= 2,
          'le widget sandboxé lit la ligne du projet NOTIFY (#11)');
        assertEqual(window.PageRedaction.bridge.getState().phase, 'ready');
        assertTrue(byId('redaction-status').classList.contains('is-ready'));
      });
    });

    it('"Recharger" recrée l\'iframe et renvoie la même ligne au widget', async function () {
      await withPage(fakeWidget(), async () => {
        await clickRedact('NOTIFY');
        const first = window.PageRedaction.frame;
        await window.PageRedaction.bridge.whenReady(8000);
        fireMouse(byId('redaction-status'), 'click');
        fireMouse(byId('redaction-reload'), 'click');
        await window.PageRedaction.opening;
        const second = window.PageRedaction.frame;
        assertTrue(!!second && second !== first, 'nouvelle iframe');
        assertFalse(document.body.contains(first), 'l\'ancienne est retirée');
        assertFalse(byId('view-redaction').classList.contains('hidden'), 'on reste sur la page Rédaction');
        await waitFor(() => nested() && nested().normal.some(entry => entry.record.id === 11), 'ligne NOTIFY après rechargement');
      });
    });

    it('"Retour" ramène sur Administratif', async function () {
      await withPage(fakeWidget(), async () => {
        await clickRedact('INNOVX');
        fireMouse(byId('redaction-back'), 'click');
        assertFalse(byId('view-administratif').classList.contains('hidden'));
        assertTrue(byId('view-redaction').classList.contains('hidden'));
      });
    });

    it('ce que publipostage+ écrit dans le document est rechargé au retour (cartes à jour)', async function () {
      await withPage(fakeWidget(), async () => {
        await clickRedact('INNOVX');
        await window.PageRedaction.bridge.whenReady(8000);
        await waitFor(() => nested() && nested().normal.length >= 1, 'widget prêt');
        await window.PageRedaction.frame.contentWindow.grist.docApi.applyUserActions(
          [['UpdateRecord', 'Notifications', 1, { notifications_Statut: '2) Notification_relecture' }]]);
        assertEqual(window.CoreState.getTable('Notifications')[0].notifications_Statut, '1) Information projet saisies', 'cache local pas encore rechargé');
        await window.PageRedaction.close();
        assertEqual(window.CoreState.getTable('Notifications')[0].notifications_Statut, '2) Notification_relecture');
        const acronyms = Array.from(panelIn('admin-col-notif', 'Notification_relecture').querySelectorAll('.project-acronym')).map(el => el.textContent);
        assertTrue(acronyms.includes('INNOVX'), 'INNOVX est rangé dans le volet de son nouveau statut');
      });
    });

    it('quitter la page par le menu du haut (sans "Retour") recharge aussi ce que publipostage+ a écrit', async function () {
      await withPage(fakeWidget(), async () => {
        await clickRedact('INNOVX');
        await window.PageRedaction.bridge.whenReady(8000);
        await waitFor(() => nested() && nested().normal.length >= 1, 'widget prêt');
        await window.PageRedaction.frame.contentWindow.grist.docApi.applyUserActions(
          [['UpdateRecord', 'Notifications', 1, { notifications_Statut: '2) Notification_relecture' }]]);
        // Ce que fait showView() de js/app.js quand on clique un onglet du menu : masque toutes les vues, affiche celle demandée.
        document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
        byId('view-administratif').classList.remove('hidden');
        await waitFor(() => window.CoreState.getTable('Notifications')[0].notifications_Statut === '2) Notification_relecture', 'tables rechargées');
      });
    });

    it('une écriture de publipostage+ alors que la page est déjà masquée recharge tout de suite', async function () {
      await withPage(fakeWidget(), async () => {
        await clickRedact('INNOVX');
        await window.PageRedaction.bridge.whenReady(8000);
        await waitFor(() => nested() && nested().normal.length >= 1, 'widget prêt');
        byId('view-redaction').classList.add('hidden');
        byId('view-administratif').classList.remove('hidden');
        await window.PageRedaction.frame.contentWindow.grist.docApi.applyUserActions(
          [['UpdateRecord', 'Notifications', 1, { notifications_Statut: '2) Notification_relecture' }]]);
        await waitFor(() => window.CoreState.getTable('Notifications')[0].notifications_Statut === '2) Notification_relecture', 'tables rechargées');
      });
    });

    it('sans écriture du widget imbriqué, le retour ne recharge pas les tables', async function () {
      await withPage(fakeWidget(), async () => {
        await clickRedact('INNOVX');
        await window.PageRedaction.bridge.whenReady(8000);
        // Une modification faite hors du widget imbriqué n'est PAS relue : preuve qu'aucun rechargement n'a lieu.
        window.CoreState.getTable('Notifications')[0].notifications_Statut = 'valeur locale';
        await window.PageRedaction.close();
        assertEqual(window.CoreState.getTable('Notifications')[0].notifications_Statut, 'valeur locale');
      });
    });

    it('le fil d\'ariane affiche l\'acronyme comme du texte, jamais comme du HTML', async function () {
      await withPage(fakeWidget(), async () => {
        window.CoreState.getTable('Projets').find(project => project.id === 10).Acronyme = '<img src=x onerror=alert(1)>';
        window.PageRedaction.open(10);
        assertEqual(byId('redaction-project').textContent, '<img src=x onerror=alert(1)>');
        assertEqual(byId('redaction-project').children.length, 0);
      });
    });

    it('un projet introuvable n\'ouvre rien et ne crée pas d\'iframe', async function () {
      await withPage(fakeWidget(), async () => {
        window.PageRedaction.open(99999);
        assertEqual(window.PageRedaction.frame, null);
        assertTrue(byId('view-redaction').classList.contains('hidden'));
        assertFalse(byId('toast').classList.contains('hidden'), 'un message prévient l\'utilisateur');
      });
    });
  });

  // publipostage+ démarre toujours en Édition (js/main.js:init finit par switchMode('edit')) : la page pilote son bouton « Mode lecture ».
  // Le faux widget (?modeui=1) reproduit ce démarrage : bouton branché en cours de route (?attachAfter), switchMode('edit') final (?finalAfter).
  describe('Rédaction — mode Lecture par défaut', function () {
    const modeWidget = (query = '') => `${fakeWidget()}?modeui=1${query}`;
    const fastReadMode = () => { window.PageRedaction.readModeTickMs = 15; window.PageRedaction.readModeGiveUpMs = 4000; };
    const readAfterFinalEdit = () => nested() && nested().modeSwitches && nested().modeSwitches.includes('edit') && nested().mode === 'read';
    const personActsIn = frame => frame.contentDocument.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    it('publipostage+ s\'ouvre en mode Lecture, même quand la fin de son démarrage le ramène d\'abord en Édition', async function () {
      await withPage(modeWidget('&attachAfter=60&finalAfter=400'), async () => {
        fastReadMode();
        await clickRedact('NOTIFY');
        await waitFor(readAfterFinalEdit, 'Lecture rétablie après le switchMode("edit") final');
        await wait(200);
        assertEqual(nested().mode, 'read', 'reste en Lecture');
        fireMouse(byId('redaction-status'), 'click');
        assertIncludes(byId('redaction-log').textContent, 'Mode Lecture par défaut : appliqué');
      });
    });

    it('le clic est repris tant que publipostage+ n\'a pas branché son bouton', async function () {
      await withPage(modeWidget('&attachAfter=500&finalAfter=800'), async () => {
        fastReadMode();
        await clickRedact('NOTIFY');
        await waitFor(() => nested() && nested().modeSwitches, 'faux publipostage+ chargé');
        assertDeepEqual(nested().modeSwitches, [], 'avant le branchement du bouton, les clics ne font rien');
        await waitFor(readAfterFinalEdit, 'Lecture rétablie', 5000);
      });
    });

    it('dès que la personne agit dans publipostage+, on ne touche plus à son mode (même si le démarrage la ramène en Édition)', async function () {
      await withPage(modeWidget('&attachAfter=60&finalAfter=700'), async () => {
        fastReadMode();
        await clickRedact('NOTIFY');
        await waitFor(() => nested() && nested().mode === 'read', 'Lecture appliquée');
        personActsIn(window.PageRedaction.frame);
        await waitFor(() => nested().modeSwitches.includes('edit'), 'fin du démarrage de publipostage+', 5000);
        await wait(300);
        assertEqual(nested().mode, 'edit', 'le switchMode("edit") final n\'est pas contrarié');
        fireMouse(byId('redaction-status'), 'click');
        assertIncludes(byId('redaction-log').textContent, 'Mode Lecture par défaut : arrêté : la personne agit dans publipostage+');
      });
    });

    it('ce que la personne choisit ensuite (Édition) est respecté, y compris en changeant de projet', async function () {
      await withPage(modeWidget('&attachAfter=40&finalAfter=200'), async () => {
        fastReadMode();
        await clickRedact('NOTIFY');
        await waitFor(readAfterFinalEdit, 'Lecture appliquée');
        const frame = window.PageRedaction.frame;
        personActsIn(frame);
        frame.contentDocument.getElementById('btn-mode-edit').click();
        await window.PageRedaction.close();
        await clickRedact('INNOVX');
        await wait(300);
        assertEqual(nested().mode, 'edit');
      });
    });

    it('« Recharger » rouvre publipostage+ en mode Lecture', async function () {
      await withPage(modeWidget('&attachAfter=40&finalAfter=200'), async () => {
        fastReadMode();
        await clickRedact('NOTIFY');
        await waitFor(readAfterFinalEdit, 'Lecture appliquée');
        const first = window.PageRedaction.frame;
        fireMouse(byId('redaction-status'), 'click');
        fireMouse(byId('redaction-reload'), 'click');
        await window.PageRedaction.opening;
        assertTrue(window.PageRedaction.frame !== first, 'nouvelle iframe');
        await waitFor(readAfterFinalEdit, 'Lecture appliquée après rechargement');
      });
    });

    it('page imbriquée d\'une autre origine (sandbox) : aucun pilotage, aucune erreur, la raison est au journal', async function () {
      const query = '&attachAfter=30&finalAfter=100000';
      await withPage(modeWidget(query), async () => {
        fastReadMode();
        await clickRedact('NOTIFY');
        const frame = window.PageRedaction.frame;
        await waitFor(() => nested() && nested().mode === 'read', 'Lecture appliquée');
        fireMouse(byId('redaction-status'), 'click');
        frame.setAttribute('sandbox', 'allow-scripts'); // origine "null" : le document n'est plus lisible depuis ce widget
        frame.src = `${modeWidget(query)}&sandboxé=1`;
        await waitFor(() => byId('redaction-log').textContent.includes('Mode Lecture par défaut : impossible : page imbriquée d\'une autre origine'),
          'la raison est au journal');
      });
    });

    it('page sans bouton « Mode lecture » : rien ne casse, le journal le dit après le délai', async function () {
      await withPage(silentWidget(), async () => {
        window.PageRedaction.readModeTickMs = 15;
        window.PageRedaction.readModeGiveUpMs = 150;
        await clickRedact('INNOVX');
        fireMouse(byId('redaction-status'), 'click');
        await waitFor(() => byId('redaction-log').textContent.includes('bouton « Mode lecture » introuvable'), 'bouton introuvable au journal');
      });
    });
  });

  // publipostage+ résout les #Variable d'une autre table par une règle de liaison (Publipostage_LiensTables) faite DEPUIS sa table courante :
  // pour retrouver le mappage existant, la page présente la table de la vue publipostage+ déjà présente dans le document (cf. loadInfo).
  // Cause du retour d'Antoine du 30/09/2026 (« [ERREUR: ligne introuvable dans Notifications] ») : la page présentait toujours Projets.
  describe('Rédaction — table présentée à publipostage+ (retrouver le mappage existant)', function () {
    const LINKS = 'Publipostage_LiensTables';
    const STORAGE_KEY = 'suiviProjetInnovationS:redactionTable';
    const RULES = { id: [1, 2], TableCible: ['Projets', 'Structures'], Mode: ['match', 'singleton'], ColonneCible: ['id', ''], ColonneSource: ['Projet', ''] };
    const customView = url => JSON.stringify({ customView: JSON.stringify({ mode: 'url', url, access: 'full' }) });
    const logText = () => byId('redaction-log').textContent;
    const openLog = () => fireMouse(byId('redaction-status'), 'click');

    // Métadonnées du document comme Grist les expose : _grist_Tables, _grist_Tables_column (Notifications.Projet est une Référence
    // vers Projets sauf `linkNotifications: false`) et _grist_Views_section (les vues : {table, url | options}), plus le mappage de
    // publipostage+ si `rules`. Ajoutées au magasin du mock pour CE test seulement (le magasin est remis à zéro entre les tests).
    function installDocument({ views = [], rules = null, linkNotifications = true, summaryTables = false } = {}) {
      const fixtures = window.__FIXTURES__;
      // Tables de résumé (recopient la colonne de regroupement, donc une Référence vers Projets ; Grist les repère par summarySourceTable)
      // et tables cachées de Grist.
      const internal = summaryTables ? { Notifications_summary_Projet: { id: [1], Projet: [11], count: [1] }, GristHidden_import: { id: [1], Projet: [11] } } : {};
      const store = Object.assign({}, fixtures, internal, rules ? { [LINKS]: rules } : {});
      const names = Object.keys(store);
      if (rules) window.__mockSetTable(LINKS, rules);
      Object.keys(internal).forEach(name => window.__mockSetTable(name, internal[name]));
      const metaTables = { id: names.map((name, i) => i + 1), tableId: names,
        summarySourceTable: names.map(name => (name === 'Notifications_summary_Projet' ? names.indexOf('Notifications') + 1 : 0)) };
      const metaCols = { id: [], parentId: [], colId: [], type: [], displayCol: [], parentPos: [] };
      names.forEach((tableId, t) => Object.keys(store[tableId]).filter(colId => colId !== 'id').forEach((colId, pos) => {
        metaCols.id.push(metaCols.id.length + 1);
        metaCols.parentId.push(t + 1);
        metaCols.colId.push(colId);
        const refersToProjets = colId === 'Projet' && ((tableId === 'Notifications' && linkNotifications) || tableId in internal);
        metaCols.type.push(refersToProjets ? 'Ref:Projets' : 'Text');
        metaCols.displayCol.push(0);
        metaCols.parentPos.push(pos + 1);
      }));
      const sections = { id: [], tableRef: [], parentKey: [], options: [] };
      views.forEach((view, i) => {
        sections.id.push(i + 1);
        sections.tableRef.push(names.indexOf(view.table) + 1);
        sections.parentKey.push('custom');
        sections.options.push(view.options !== undefined ? view.options : customView(view.url || fakeWidget()));
      });
      window.__mockSetTable('_grist_Tables', metaTables);
      window.__mockSetTable('_grist_Tables_column', metaCols);
      window.__mockSetTable('_grist_Views_section', sections);
    }

    async function presented(acronym) {
      await clickRedact(acronym);
      await window.PageRedaction.bridge.whenReady(8000);
      await waitFor(() => nested().normal.length >= 1, 'ligne reçue par publipostage+');
      return { table: nested().tableId, record: nested().normal[0].record };
    }

    it('par défaut (aucune vue publipostage+ dans le document) : la fiche Notifications du projet est présentée', async function () {
      await withPage(fakeWidget(), async () => {
        installDocument();
        const { table, record } = await presented('NOTIFY');
        assertEqual(table, 'Notifications');
        assertEqual(record.id, 2, 'la fiche Notifications de NOTIFY (projet 11)');
        assertEqual(record.notifications_Statut, '5) envoyée pour signature VP');
        assertEqual(window.PageRedaction.linked.table, 'Notifications');
        assertEqual(window.PageRedaction.linked.rowId, 2);
        openLog();
        assertIncludes(logText(), 'Enregistrement sélectionné : Notifications #2');
        assertIncludes(logText(), 'Table présentée : Notifications (par défaut)');
        assertIncludes(logText(), 'Vues publipostage+ du document : aucune trouvée');
      }, null);
    });

    it('métadonnées et règles illisibles (droits d\'accès) : même défaut, sans erreur, et le journal le dit', async function () {
      await withPage(fakeWidget(), async () => {
        window.__mockSetTable(LINKS, RULES); // la table existe (listée) mais sa lecture est refusée, comme les métadonnées
        const fetchTable = window.grist.docApi.fetchTable;
        window.grist.docApi.fetchTable = async name => {
          if (name.startsWith('_grist_') || name === LINKS) throw new Error('accès refusé');
          return fetchTable(name);
        };
        try {
          const { table, record } = await presented('NOTIFY');
          assertEqual(table, 'Notifications');
          assertEqual(record.id, 2);
          openLog();
          assertIncludes(logText(), 'Vues publipostage+ du document : illisibles');
          assertIncludes(logText(), `Règles de liaison (${LINKS}) : illisibles`);
          assertFalse(byId('redaction-table').hidden, 'le choix reste possible : Notifications et Projets');
        } finally { window.grist.docApi.fetchTable = fetchTable; }
      }, null);
    });

    it('la table de la vue publipostage+ existante est reprise : ses règles de liaison ont été faites depuis elle', async function () {
      await withPage(fakeWidget(), async () => {
        installDocument({ views: [{ table: 'Projets' }] });
        const { table, record } = await presented('NOTIFY');
        assertEqual(table, 'Projets', 'la vue existante est branchée sur Projets, pas sur le défaut');
        assertEqual(record.id, 11);
        assertEqual(record.Acronyme, 'NOTIFY');
        openLog();
        assertIncludes(logText(), 'Table présentée : Projets (table de la vue publipostage+ existante du document)');
        assertIncludes(logText(), 'Vues publipostage+ du document : Projets');
      }, null);
    });

    it('une vue publipostage+ branchée sur Notifications : c\'est la fiche Notifications du projet qui est présentée', async function () {
      await withPage(fakeWidget(), async () => {
        installDocument({ views: [{ table: 'Notifications' }] });
        const { table, record } = await presented('CONVENTIX');
        assertEqual(table, 'Notifications');
        assertEqual(record.id, 3, 'la fiche Notifications de CONVENTIX (projet 12)');
        openLog();
        assertIncludes(logText(), 'Table présentée : Notifications (table de la vue publipostage+ existante du document)');
      }, null);
    });

    it('seules les sections qui chargent publipostage+ comptent : autre widget, section ordinaire, options illisibles sont ignorés', async function () {
      await withPage(fakeWidget(), async () => {
        installDocument({
          views: [
            { table: 'Projets', url: 'https://exemple.test/un-autre-widget/' },
            { table: 'Projets', options: '{}' },
            { table: 'Projets', options: 'pas du JSON' },
            { table: 'Projets', options: JSON.stringify({ customView: 'pas du JSON non plus' }) }
          ]
        });
        const { table } = await presented('NOTIFY');
        assertEqual(table, 'Notifications');
        openLog();
        assertIncludes(logText(), 'Vues publipostage+ du document : aucune trouvée');
      }, null);
    });

    it('l\'adresse de la vue se lit dans customView, sérialisé en JSON ou déjà en objet ; un autre déploiement nommé publipostage compte aussi', async function () {
      await withPage(fakeWidget(), async () => {
        installDocument({ views: [{ table: 'Projets', options: JSON.stringify({ customView: { mode: 'url', url: fakeWidget() } }) }] });
        assertEqual((await presented('NOTIFY')).table, 'Projets', 'customView déjà en objet');
      }, null);
      await withPage(fakeWidget(), async () => {
        installDocument({ views: [{ table: 'Projets', url: 'https://autre-compte.github.io/publipostageGrist-test/' }] });
        assertEqual((await presented('NOTIFY')).table, 'Projets', 'un autre déploiement de publipostage+');
      }, null);
    });

    it('plusieurs vues publipostage+ sur des tables différentes : on ne devine pas, défaut, et le journal les nomme', async function () {
      await withPage(fakeWidget(), async () => {
        installDocument({ views: [{ table: 'Projets' }, { table: 'Notifications' }, { table: 'Projets' }] });
        assertEqual((await presented('NOTIFY')).table, 'Notifications');
        openLog();
        assertIncludes(logText(), 'par défaut : plusieurs vues publipostage+ (Projets, Notifications)');
      }, null);
    });

    it('le sélecteur propose Notifications et Projets ; le changer recharge publipostage+ sur l\'autre table, et le choix est retenu', async function () {
      await withPage(fakeWidget(), async () => {
        installDocument();
        await presented('NOTIFY');
        const select = byId('redaction-table');
        assertFalse(select.hidden);
        assertDeepEqual(Array.from(select.options).map(option => option.value), ['Notifications', 'Projets']);
        assertEqual(select.value, 'Notifications');
        const first = window.PageRedaction.frame;

        select.value = 'Projets';
        fire(select, 'change');
        await window.PageRedaction.opening;
        const second = window.PageRedaction.frame;
        assertTrue(second !== first && !document.body.contains(first), 'publipostage+ ne connaît qu\'une table par chargement : iframe recréée');
        await window.PageRedaction.bridge.whenReady(8000);
        await waitFor(() => nested().normal.some(entry => entry.record.id === 11 && entry.record.Acronyme === 'NOTIFY'), 'le projet est présenté');
        assertEqual(nested().tableId, 'Projets');
        assertEqual(localStorage.getItem(STORAGE_KEY), 'Projets');

        // Retenu : le projet suivant reste sur Projets, dans la même iframe (même table : simple changement de ligne).
        await window.PageRedaction.close();
        await clickRedact('INNOVX');
        assertTrue(window.PageRedaction.frame === second);
        assertEqual(window.PageRedaction.linked.table, 'Projets');
        assertEqual(window.PageRedaction.linked.rowId, 10);
        await waitFor(() => nested().normal.some(entry => entry.record.id === 10 && entry.record.Acronyme === 'INNOVX'), 'INNOVX présenté');
        assertEqual(byId('redaction-table').value, 'Projets');
      }, null);
    });

    it('un choix enregistré prime sur la vue publipostage+ existante ; un choix devenu impossible est ignoré', async function () {
      await withPage(fakeWidget(), async () => {
        installDocument({ views: [{ table: 'Notifications' }] });
        window.PageRedaction.setTable('Projets');
        assertEqual((await presented('NOTIFY')).table, 'Projets');
        openLog();
        assertIncludes(logText(), 'Table présentée : Projets (choix enregistré)');
      }, null);
      await withPage(fakeWidget(), async () => {
        installDocument({ views: [{ table: 'Notifications' }] });
        window.PageRedaction.setTable('TableSupprimee');
        assertEqual((await presented('NOTIFY')).table, 'Notifications', 'la vue existante reprend la main');
        openLog();
        assertIncludes(logText(), 'Table présentée : Notifications (table de la vue publipostage+ existante du document)');
      }, null);
    });

    it('sans table reliée aux projets, il n\'y a rien à choisir : Projets, sélecteur masqué', async function () {
      await withPage(fakeWidget(), async () => {
        installDocument({ linkNotifications: false });
        const { table, record } = await presented('NOTIFY');
        assertEqual(table, 'Projets');
        assertEqual(record.id, 11);
        assertTrue(byId('redaction-table').hidden);
      }, null);
    });

    it('les tables de résumé (summarySourceTable) et les tables cachées de Grist ne sont pas proposées, même avec une Référence vers Projets', async function () {
      await withPage(fakeWidget(), async () => {
        installDocument({ summaryTables: true });
        await presented('NOTIFY');
        assertDeepEqual(Array.from(byId('redaction-table').options).map(option => option.value), ['Notifications', 'Projets']);
      }, null);
    });

    it('un projet sans fiche dans la table choisie : repli sur le projet, message, et le projet suivant retrouve la fiche', async function () {
      await withPage(fakeWidget(), async () => {
        installDocument();
        const notified = window.CoreState.getTable('Notifications').map(row => row.Projet);
        const withoutFiche = window.CoreState.getTable('Projets').find(project => !notified.includes(project.id));
        assertTrue(!!withoutFiche, 'les fixtures ont des projets sans fiche Notifications');
        window.PageRedaction.open(withoutFiche.id);
        await window.PageRedaction.opening;
        assertEqual(window.PageRedaction.linked.table, 'Projets');
        assertEqual(window.PageRedaction.linked.rowId, withoutFiche.id);
        assertEqual(byId('redaction-table').value, 'Projets', 'le sélecteur montre la table réellement présentée');
        assertIncludes(byId('toast').textContent, 'Aucune ligne Notifications pour ce projet');
        openLog();
        assertIncludes(logText(), 'repli : aucune ligne Notifications pour ce projet');
        await window.PageRedaction.bridge.whenReady(8000);
        await waitFor(() => nested() && nested().tableId === 'Projets', 'publipostage+ sur Projets');

        await window.PageRedaction.close();
        await clickRedact('INNOVX');
        assertEqual(window.PageRedaction.linked.table, 'Notifications', 'le choix (défaut) n\'a pas été modifié par le repli');
        assertEqual(window.PageRedaction.linked.rowId, 1);
        assertEqual(byId('redaction-table').value, 'Notifications');
      }, null);
    });

    it('deux ouvertures très rapprochées : seule la dernière compte, une seule iframe', async function () {
      await withPage(fakeWidget(), async () => {
        installDocument();
        window.PageRedaction.open(10);
        window.PageRedaction.open(11);
        await window.PageRedaction.opening;
        await window.PageRedaction.bridge.whenReady(8000);
        assertEqual(window.PageRedaction.bridge.getState().rowId, 2, 'fiche Notifications de NOTIFY (11), pas celle d\'INNOVX (10)');
        assertEqual(byId('redaction-project').textContent, 'NOTIFY');
        assertEqual(document.querySelectorAll('#redaction-frame-wrap iframe').length, 1);
      }, null);
    });

    it('une page réinitialisée pendant une ouverture ne voit pas d\'iframe apparaître après coup', async function () {
      await withPage(fakeWidget(), async () => {
        installDocument();
        const pending = window.PageRedaction.open(10);
        window.PageRedaction.reset(); // « Recharger », ou fin d'un test : l'ouverture en cours est abandonnée
        await pending;
        await wait(60);
        assertEqual(window.PageRedaction.frame, null);
        assertEqual(document.querySelectorAll('#redaction-frame-wrap iframe').length, 0);
      }, null);
    });

    it('lire le document pour choisir la table n\'écrit rien dedans', async function () {
      await withPage(fakeWidget(), async () => {
        installDocument({ views: [{ table: 'Notifications' }], rules: RULES });
        await presented('NOTIFY');
        assertDeepEqual(window.__TEST_CALLS__, [], 'aucune écriture (AddTable, AddRecord...) faite par la page');
      }, null);
    });

    it('le mappage de publipostage+ est affiché au journal (tables et colonnes seulement) et relu à chaque ouverture du journal', async function () {
      await withPage(fakeWidget(), async () => {
        installDocument({ rules: RULES });
        await presented('NOTIFY');
        openLog();
        await waitFor(() => logText().includes('Projets : id de Projets = Projet de la table présentée'), 'règle « match »');
        assertIncludes(logText(), 'Structures : une seule ligne');
        assertIncludes(logText(), `Règles de liaison (${LINKS}) :`);
        openLog(); // referme
        // publipostage+ ajoute une règle par le pont (bouton « Tables liées »), puis on rouvre le journal.
        await window.PageRedaction.frame.contentWindow.grist.docApi.applyUserActions(
          [['AddRecord', LINKS, null, { TableCible: 'Notifications', Mode: 'match', ColonneCible: 'Projet', ColonneSource: 'id' }]]);
        openLog();
        await waitFor(() => logText().includes('Notifications : Projet de Notifications = id de la table présentée'), 'règle ajoutée relue');
      }, null);
    });

    it('sans table de règles dans le document, le journal dit qu\'elle est absente (publipostage+ la crée au premier besoin) ; vide : « aucune »', async function () {
      await withPage(fakeWidget(), async () => {
        installDocument();
        await presented('NOTIFY');
        openLog();
        assertIncludes(logText(), `Règles de liaison (${LINKS}) : table absente (publipostage+ la crée au premier besoin)`);
      }, null);
      await withPage(fakeWidget(), async () => {
        installDocument({ rules: { id: [], TableCible: [], Mode: [], ColonneCible: [], ColonneSource: [] } });
        await presented('NOTIFY');
        openLog();
        assertIncludes(logText(), `Règles de liaison (${LINKS}) : aucune`);
      }, null);
    });

    it('une vue publipostage+ sur une table sans lien avec les projets ne peut pas être présentée : ignorée, et le journal le signale', async function () {
      await withPage(fakeWidget(), async () => {
        installDocument({ views: [{ table: 'Structures' }] });
        assertEqual((await presented('NOTIFY')).table, 'Notifications', 'défaut');
        openLog();
        assertIncludes(logText(), 'Vues publipostage+ du document : Structures (sans lien avec Projets : ignorée)');
      }, null);
    });
  });

  describe('Rédaction — URL du widget imbriqué', function () {
    it('par défaut : publipostage+ sur GitHub Pages, origine correspondante', function () {
      resetPage();
      const target = window.PageRedaction.resolveTarget();
      assertEqual(target.url, 'https://lombre33.github.io/publipostageGrist/');
      assertEqual(target.origin, 'https://lombre33.github.io');
    });

    it('?publipostage= surcharge l\'URL ; access et readonly de Grist sont transmis', function () {
      try {
        history.replaceState(null, '', `?publipostage=${encodeURIComponent('https://exemple.test/pp/')}&access=full&readonly=false&autre=1`);
        const target = window.PageRedaction.resolveTarget();
        const url = new URL(target.url);
        assertEqual(url.origin + url.pathname, 'https://exemple.test/pp/');
        assertEqual(url.searchParams.get('access'), 'full');
        assertEqual(url.searchParams.get('readonly'), 'false');
        assertEqual(url.searchParams.has('autre'), false, 'seuls access et readonly sont transmis');
        assertEqual(target.origin, 'https://exemple.test');
      } finally { resetPage(); }
    });

    it('une surcharge qui n\'est pas https (ou http vers localhost) est ignorée : javascript:, data:, http distant', function () {
      try {
        ['javascript:alert(1)', 'data:text/html,<p>x</p>', 'http://exemple.test/pp/', 'pas une url'].forEach(bad => {
          history.replaceState(null, '', `?publipostage=${encodeURIComponent(bad)}`);
          assertEqual(window.PageRedaction.resolveTarget().url, 'https://lombre33.github.io/publipostageGrist/', bad);
        });
        history.replaceState(null, '', `?publipostage=${encodeURIComponent('http://127.0.0.1:8532/tests/fake-publipostage.html')}`);
        assertEqual(window.PageRedaction.resolveTarget().origin, 'http://127.0.0.1:8532', 'http est accepté vers localhost (développement)');
      } finally { resetPage(); }
    });

    it('?bridgeOrigin=* : le pont n\'exige plus que la fenêtre de l\'iframe (Grist qui sandboxe les widgets)', function () {
      try {
        history.replaceState(null, '', '?bridgeOrigin=*');
        assertEqual(window.PageRedaction.resolveTarget().origin, '*');
        history.replaceState(null, '', '?bridgeOrigin=oui');
        assertEqual(window.PageRedaction.resolveTarget().origin, 'https://lombre33.github.io', 'toute autre valeur est ignorée');
      } finally { resetPage(); }
    });
  });
})();
