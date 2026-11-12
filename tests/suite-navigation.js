/**
 * Non-regression suite: retrouver la dernière page ouverte au rechargement (demande du 12/11/2026 : après Ctrl+Maj+R le
 * widget revenait toujours sur le Kanban).
 *  - js/app.js : la page affichée est retenue par utilisateur dans Preferences_Widget.Page_courante, avec une copie dans
 *    localStorage (suiviProjetInnovationS:lastView) écrite aussitôt ; au démarrage la page retenue est affichée avant même la
 *    lecture des tables, puis confirmée par Grist (ou par la copie, quand elle est « en attente »).
 * Un rechargement est simulé en remettant le DOM dans son état de départ (Kanban seul visible) et en vidant la mémoire de
 * l'appli, mais PAS la copie locale, ni Grist, ni l'id de la ligne de préférences — comme un vrai rechargement.
 */
(function () {
  'use strict';

  const MIRROR_KEY = 'suiviProjetInnovationS:lastView';
  const VIEWS = ['view-projects', 'view-administratif', 'view-installation-fonds', 'view-todo', 'view-instances'];
  const app = () => window.SuiviApp;
  const byId = id => document.getElementById(id);
  const isHidden = id => byId(id).classList.contains('hidden');
  const visibleIds = () => VIEWS.concat(['view-redaction']).filter(id => byId(id) && !isHidden(id));
  const activeNav = () => Array.from(document.querySelectorAll('.nav-btn.active')).map(btn => btn.dataset.view);
  const readMirror = () => { try { return JSON.parse(localStorage.getItem(MIRROR_KEY)); } catch (err) { return null; } };
  const writeMirror = (view, pending) => localStorage.setItem(MIRROR_KEY, JSON.stringify({ view, pending }));

  // Le squelette de test n'a pas de <main id="view-projects"> : on en pose un (retiré en fin de test) et on remet toutes les
  // pages dans l'état du HTML d'origine : le Kanban seul visible, son bouton actif.
  function prepare() {
    const dom = byId('app-dom');
    const views = Array.from(document.querySelectorAll('.view'));
    const saved = views.map(view => view.className);
    let projects = byId('view-projects');
    const created = !projects;
    if (created) { projects = document.createElement('main'); projects.id = 'view-projects'; projects.className = 'view'; dom.insertBefore(projects, dom.firstChild); }
    const activeBefore = Array.from(document.querySelectorAll('.nav-btn')).map(btn => btn.classList.contains('active'));
    showHome();
    app().staleViews.clear();
    app().cancelIdleRenders();
    const idle = holdIdleCallbacks();
    return () => {
      idle.restore();
      if (created) projects.remove();
      views.forEach((view, i) => { view.className = saved[i]; });
      document.querySelectorAll('.nav-btn').forEach((btn, i) => btn.classList.toggle('active', activeBefore[i]));
    };
  }
  function showHome() {
    VIEWS.concat(['view-redaction']).forEach(id => byId(id)?.classList.toggle('hidden', id !== 'view-projects'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === 'view-projects'));
  }
  // requestIdleCallback figé : aucun rendu en temps mort ne vient fausser les pages « à refaire ».
  function holdIdleCallbacks() {
    const original = window.requestIdleCallback;
    window.requestIdleCallback = function () { return 1; };
    return { restore() { app().cancelIdleRenders(); if (original) window.requestIdleCallback = original; else delete window.requestIdleCallback; } };
  }
  // Un rechargement : le HTML repart avec le Kanban, l'appli n'a plus rien en mémoire ; la copie locale, Grist et l'id de la
  // ligne de préférences (localStorage) survivent. L'observateur de pages retient « Projets » au passage : sans ligne de
  // préférences connue (mémoire vidée), il ne peut rien écrire dans Grist, et on remet la copie d'avant à la main.
  async function reload() {
    const mirror = localStorage.getItem(MIRROR_KEY);
    app().resetLastView();
    showHome();
    await wait(0);
    if (mirror === null) localStorage.removeItem(MIRROR_KEY); else localStorage.setItem(MIRROR_KEY, mirror);
    app().staleViews.clear();
  }
  async function gristPage() {
    const table = await window.grist.docApi.fetchTable('Preferences_Widget');
    const id = Number(localStorage.getItem('suiviProjetInnovationS:prefsRowId'));
    const index = table.id.indexOf(id);
    return index < 0 || !table.Page_courante ? null : table.Page_courante[index];
  }
  async function setGristPage(value) {
    const id = Number(localStorage.getItem('suiviProjetInnovationS:prefsRowId'));
    await window.grist.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', id, { Page_courante: value }]]);
  }
  const pageWrites = () => window.__TEST_CALLS__.filter(call => call.type === 'UpdateRecord' && call.table === 'Preferences_Widget' && call.fields && 'Page_courante' in call.fields);

  describe('Dernière page ouverte (js/app.js)', function () {
    it('premier lancement : rien n\'est retenu, le Kanban reste affiché et aucune page n\'est écrite dans Grist', async function () {
      const restore = prepare();
      try {
        await app().initializeApp();
        assertDeepEqual(visibleIds(), ['view-projects'], 'le Kanban reste la page d\'accueil');
        assertDeepEqual(activeNav(), ['view-projects']);
        assertEqual(pageWrites().length, 0, 'aucune écriture de page');
        assertEqual(readMirror(), null, 'rien dans la copie locale');
        const added = window.__TEST_CALLS__.filter(call => call.type === 'AddColumn' && call.table === 'Preferences_Widget').map(call => call.colId);
        assertTrue(added.includes('Page_courante'), `colonne Page_courante créée : ${added.join(', ')}`);
      } finally { restore(); }
    });

    it('ouvrir une page (clic sur la barre) la retient dans Preferences_Widget et dans la copie locale', async function () {
      const restore = prepare();
      try {
        await app().initializeApp();
        fire(document.querySelector('.nav-btn[data-view="view-todo"]'), 'click');
        await wait(0); // l'observateur de pages passe dans la foulée du clic, bien avant tout rechargement possible
        assertEqual(readMirror().view, 'view-todo', 'la copie locale est écrite aussitôt');
        await waitFor(() => readMirror().pending === false, 'écriture Grist confirmée');
        assertEqual(await gristPage(), 'view-todo', 'Preferences_Widget.Page_courante');
        assertDeepEqual(readMirror(), { view: 'view-todo', pending: false }, 'copie locale à jour, plus en attente');
        // Changer encore de page remplace la précédente (une seule page retenue par utilisateur).
        app().showView('view-administratif');
        await waitFor(() => readMirror().pending === false && readMirror().view === 'view-administratif', 'seconde page confirmée');
        assertEqual(await gristPage(), 'view-administratif');
      } finally { restore(); }
    });

    it('après un rechargement, la dernière page est réaffichée (bouton actif, page rendue) au lieu du Kanban', async function () {
      const restore = prepare();
      try {
        await app().initializeApp();
        app().showView('view-todo');
        await waitFor(() => readMirror().pending === false, 'page confirmée dans Grist');
        await reload();
        await app().initializeApp();
        assertDeepEqual(visibleIds(), ['view-todo'], 'To Do réaffichée');
        assertDeepEqual(activeNav(), ['view-todo'], 'le bouton To Do est actif, pas Projets');
        assertTrue(document.querySelectorAll('#todo-panels .admin-panel').length > 0, 'To Do rendue au démarrage');
        assertTrue(app().staleViews.has('view-projects'), 'le Kanban masqué n\'est pas reconstruit pour rien');
        assertFalse(app().staleViews.has('view-todo'));
        assertEqual(pageWrites().length, 1, 'le démarrage n\'écrit rien de plus : une seule écriture, celle du clic');
      } finally { restore(); }
    });

    it('la page retenue s\'affiche avant même la fin du chargement (pas d\'éclair du Kanban)', async function () {
      const restore = prepare();
      try {
        await app().initializeApp();
        app().showView('view-administratif');
        await waitFor(() => readMirror().pending === false, 'page confirmée dans Grist');
        await reload();
        const starting = app().initializeApp();
        assertDeepEqual(visibleIds(), ['view-administratif'], 'affichée tout de suite d\'après la copie locale');
        assertDeepEqual(activeNav(), ['view-administratif']);
        await starting;
        assertDeepEqual(visibleIds(), ['view-administratif']);
      } finally { restore(); }
    });

    it('sans copie locale (effacée), Grist suffit pour retrouver la page', async function () {
      const restore = prepare();
      try {
        await app().initializeApp();
        app().showView('view-installation-fonds');
        await waitFor(() => readMirror().pending === false, 'page confirmée dans Grist');
        await reload();
        localStorage.removeItem(MIRROR_KEY);
        await app().initializeApp();
        assertDeepEqual(visibleIds(), ['view-installation-fonds'], 'page lue dans Preferences_Widget');
        assertDeepEqual(activeNav(), ['view-installation-fonds']);
      } finally { restore(); }
    });

    it('copie locale « en attente » (Grist n\'a pas reçu la dernière navigation) : elle est plus récente et l\'emporte', async function () {
      const restore = prepare();
      try {
        await app().initializeApp();
        await setGristPage('view-administratif');
        await reload();
        writeMirror('view-todo', true);
        await app().initializeApp();
        assertDeepEqual(visibleIds(), ['view-todo']);
      } finally { restore(); }
    });

    it('copie locale à jour mais différente de Grist : Grist garde le dernier mot', async function () {
      const restore = prepare();
      try {
        await app().initializeApp();
        await setGristPage('view-administratif');
        await reload();
        writeMirror('view-todo', false);
        await app().initializeApp();
        assertDeepEqual(visibleIds(), ['view-administratif']);
      } finally { restore(); }
    });

    it('écriture Grist coupée (rechargement juste après le clic) : la copie reste en attente et la page est retrouvée', async function () {
      const restore = prepare();
      const api = window.grist.docApi;
      const original = api.applyUserActions;
      try {
        await app().initializeApp();
        api.applyUserActions = function (actions) {
          if (actions.some(a => a[0] === 'UpdateRecord' && a[3] && 'Page_courante' in a[3])) return Promise.reject(new Error('connexion coupée'));
          return original.call(api, actions);
        };
        app().showView('view-todo');
        await wait(30);
        assertDeepEqual(readMirror(), { view: 'view-todo', pending: true }, 'jamais confirmée par Grist : toujours en attente');
        assertEqual(await gristPage(), null, 'Grist n\'a rien reçu');
        api.applyUserActions = original;
        await reload();
        await app().initializeApp();
        assertDeepEqual(visibleIds(), ['view-todo'], 'retrouvée grâce à la copie locale');
      } finally { api.applyUserActions = original; restore(); }
    });

    it('deux navigations rapprochées : la plus récente reste retenue même si l\'écriture de la première finit après', async function () {
      const restore = prepare();
      try {
        await app().initializeApp();
        app().showView('view-todo');
        app().showView('view-installation-fonds');
        await waitFor(() => readMirror().pending === false, 'dernière page confirmée');
        assertEqual(readMirror().view, 'view-installation-fonds');
        assertEqual(await gristPage(), 'view-installation-fonds');
      } finally { restore(); }
    });

    it('une valeur inconnue ou un écran passager (Rédaction, fiche projet) n\'est jamais réaffiché : le Kanban reste la page d\'accueil', async function () {
      const restore = prepare();
      try {
        await app().initializeApp();
        for (const bad of ['view-redaction', 'view-project', 'view-inexistante', '"]; alert(1)', '']) {
          await setGristPage(bad);
          await reload();
          writeMirror(bad, false);
          await app().initializeApp();
          assertDeepEqual(visibleIds(), ['view-projects'], `« ${bad} » ignorée`);
        }
        await reload();
        localStorage.setItem(MIRROR_KEY, 'pas du json');
        await setGristPage('');
        await app().initializeApp();
        assertDeepEqual(visibleIds(), ['view-projects'], 'copie illisible ignorée');
      } finally { restore(); }
    });

    it('la Rédaction n\'écrase pas la page retenue : on retrouve Administratif, d\'où l\'on y est entré', async function () {
      const restore = prepare();
      try {
        await app().initializeApp();
        app().showView('view-administratif');
        await waitFor(() => readMirror().pending === false, 'Administratif confirmé');
        const writesBefore = pageWrites().length;
        // Ouverture de la Rédaction (js/pages/page-redaction.js, showOnly) : hors showView, un seul écran visible.
        byId('view-administratif').classList.add('hidden');
        byId('view-redaction').classList.remove('hidden');
        await wait(30);
        assertEqual(pageWrites().length, writesBefore, 'la Rédaction n\'est pas retenue');
        await reload();
        await app().initializeApp();
        assertDeepEqual(visibleIds(), ['view-administratif'], 'rechargement depuis la Rédaction : retour à Administratif');
        // Fermeture de la Rédaction (showOnly vers Administratif) : retenu comme toute page qui s'affiche.
        app().showView('view-todo');
        await waitFor(() => readMirror().view === 'view-todo' && readMirror().pending === false, 'To Do confirmée');
        byId('view-todo').classList.add('hidden');
        byId('view-redaction').classList.remove('hidden');
        await wait(10);
        byId('view-redaction').classList.add('hidden');
        byId('view-administratif').classList.remove('hidden');
        await waitFor(() => readMirror().view === 'view-administratif', 'retour d\'une page ouverte hors showView retenu');
      } finally { restore(); }
    });

    it('page Instances retrouvée : elle charge ses données elle-même (sinon elle restait vide jusqu\'à un clic sur la barre)', async function () {
      const restore = prepare();
      const original = window.InstancesPage.open;
      let opened = 0;
      try {
        await app().initializeApp();
        app().showView('view-instances');
        await waitFor(() => readMirror().pending === false, 'Instances confirmée');
        await reload();
        window.InstancesPage.open = function () { opened++; return Promise.resolve(); };
        await app().initializeApp();
        assertDeepEqual(visibleIds(), ['view-instances']);
        assertEqual(opened, 1, 'chargement de la page Instances demandé une fois');
        assertDeepEqual(activeNav(), ['view-instances']);
        // Une autre page retrouvée ne déclenche pas ce chargement.
        window.InstancesPage.open = original;
        window.InstancesPage.open = function () { opened++; return Promise.resolve(); };
        app().showView('view-todo');
        await waitFor(() => readMirror().view === 'view-todo' && readMirror().pending === false, 'To Do confirmée');
        await reload();
        await app().initializeApp();
        assertEqual(opened, 1, 'To Do retrouvée : Instances non chargée');
      } finally { window.InstancesPage.open = original; restore(); }
    });

    it('droits insuffisants pour créer la colonne : la copie locale suffit, aucune erreur au démarrage', async function () {
      const restore = prepare();
      const api = window.grist.docApi;
      const original = api.applyUserActions;
      try {
        await app().initializeApp(); // 1er lancement normal : table et ligne de préférences créées
        const table = await api.fetchTable('Preferences_Widget');
        const copy = JSON.parse(JSON.stringify(table));
        delete copy.Page_courante;
        window.__mockSetTable('Preferences_Widget', copy);
        api.applyUserActions = function (actions) {
          if (actions.some(a => a[0] === 'AddColumn' && a[2] === 'Page_courante')) return Promise.reject(new Error('droits insuffisants'));
          return original.call(api, actions);
        };
        await window.CoreGrist.loadColumnDescriptions();
        writeMirror('view-todo', true);
        await reload();
        await app().initializeApp();
        assertDeepEqual(visibleIds(), ['view-todo'], 'page retrouvée malgré l\'échec de la colonne');
        assertTrue(document.querySelectorAll('#todo-panels .admin-panel').length > 0, 'et l\'appli démarre normalement');
      } finally { api.applyUserActions = original; restore(); }
    });
  });
})();
