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

  function clickRedact(acronym) {
    fireMouse(cardByAcronym(acronym).querySelector('[data-redact-notif]'), 'click');
  }

  // Le widget à imbriquer se choisit par ?publipostage=<url> sur l'URL du widget (cf. PageRedaction.resolveTarget).
  function useWidget(url) { history.replaceState(null, '', `?publipostage=${encodeURIComponent(url)}`); }

  function resetPage() {
    window.PageRedaction.reset();
    window.PageRedaction.readyTimeoutMs = 10000;
    history.replaceState(null, '', location.pathname);
    byId('view-administratif').classList.remove('hidden');
    byId('view-redaction').classList.add('hidden');
  }

  async function withPage(widgetUrl, fn) {
    resetPage();
    if (widgetUrl) useWidget(widgetUrl);
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
        clickRedact('NOTIFY');
        assertFalse(byId('view-redaction').classList.contains('hidden'));
        assertTrue(byId('view-administratif').classList.contains('hidden'));
        assertEqual(byId('redaction-project').textContent, 'NOTIFY');
      });
    });

    it('le widget imbriqué reçoit le projet cliqué comme enregistrement sélectionné ; l\'iframe est créée une seule fois', async function () {
      await withPage(fakeWidget(), async () => {
        clickRedact('NOTIFY');
        const frame = window.PageRedaction.frame;
        assertEqual(frame.src, fakeWidget());
        await window.PageRedaction.bridge.whenReady(8000);
        await waitFor(() => nested().normal.some(entry => entry.record.id === 11), 'ligne NOTIFY reçue');
        assertEqual(nested().normal[0].record.Acronyme, 'NOTIFY');

        await window.PageRedaction.close();
        clickRedact('INNOVX');
        assertTrue(window.PageRedaction.frame === frame, 'la même iframe est réutilisée : publipostage+ garde son état');
        await waitFor(() => nested().normal.some(entry => entry.record.id === 10 && entry.record.Acronyme === 'INNOVX'), 'ligne INNOVX reçue');
        assertEqual(document.querySelectorAll('#redaction-frame-wrap iframe').length, 1);
      });
    });

    it('le widget imbriqué connaît la table liée (Projets)', async function () {
      await withPage(fakeWidget(), async () => {
        clickRedact('INNOVX');
        await waitFor(() => nested() && nested().tableId, 'tableId');
        assertEqual(nested().tableId, 'Projets');
      });
    });

    it('la puce d\'état passe de "Connexion" à "connecté" quand publipostage+ répond', async function () {
      await withPage(fakeWidget(), async () => {
        clickRedact('INNOVX');
        assertTrue(byId('redaction-status').classList.contains('is-waiting'));
        await waitFor(() => byId('redaction-status').classList.contains('is-ready'), 'puce connecté');
        assertEqual(byId('redaction-status-text').textContent, 'publipostage+ connecté');
      });
    });

    it('sans réponse du widget (mauvaise URL, page non déployée), la puce passe en erreur et le journal l\'explique', async function () {
      await withPage(silentWidget(), async () => {
        window.PageRedaction.readyTimeoutMs = 200;
        clickRedact('INNOVX');
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
        clickRedact('NOTIFY');
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
        clickRedact('NOTIFY');
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
        clickRedact('NOTIFY');
        const first = window.PageRedaction.frame;
        await window.PageRedaction.bridge.whenReady(8000);
        fireMouse(byId('redaction-status'), 'click');
        fireMouse(byId('redaction-reload'), 'click');
        const second = window.PageRedaction.frame;
        assertTrue(!!second && second !== first, 'nouvelle iframe');
        assertFalse(document.body.contains(first), 'l\'ancienne est retirée');
        assertFalse(byId('view-redaction').classList.contains('hidden'), 'on reste sur la page Rédaction');
        await waitFor(() => nested() && nested().normal.some(entry => entry.record.id === 11), 'ligne NOTIFY après rechargement');
      });
    });

    it('"Retour" ramène sur Administratif', async function () {
      await withPage(fakeWidget(), async () => {
        clickRedact('INNOVX');
        fireMouse(byId('redaction-back'), 'click');
        assertFalse(byId('view-administratif').classList.contains('hidden'));
        assertTrue(byId('view-redaction').classList.contains('hidden'));
      });
    });

    it('ce que publipostage+ écrit dans le document est rechargé au retour (cartes à jour)', async function () {
      await withPage(fakeWidget(), async () => {
        clickRedact('INNOVX');
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
        clickRedact('INNOVX');
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
        clickRedact('INNOVX');
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
        clickRedact('INNOVX');
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
