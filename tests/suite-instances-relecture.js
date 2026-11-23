/**
 * Non-regression suite : étape « Notifications » de la page « par instance » — vue « Relecture & envoi » (Antoine, 23/11/2026).
 * Liste à cocher | e-mail (modèle e-mail de Publipostage+, lu en lecture) | courrier (aperçu du modèle « document », puis la pièce jointe
 * signée dès que la colonne « Notifications signées » du projet est remplie). La page n'écrit RIEN dans Notifications ni dans Projets.
 *
 * Même jeu de données que suite-instances.js (window.__instancesTestSetup) : séance n°14 (id 2) reliée aux projets INNOVX (10, notification « 1) »,
 * donc « à signer »), NOTIFY (11, passée ici à « 7) Transmise au porteur », donc « transmise ») et CONVENTIX (12, colonne « Notifications signées »
 * remplie, donc « signée »). Les lectures de Publipostage+ (VisaMail) et l'API REST des pièces jointes sont simulées.
 */
(function () {
  'use strict';

  const L = window.InstancesLogic;
  const setup = opts => window.__instancesTestSetup(opts);
  const root = () => document.getElementById('instances-root');
  const q = sel => root().querySelector(sel);
  const qa = sel => Array.from(root().querySelectorAll(sel));
  const attrs = a => Object.keys(a || {}).map(k => `[data-${k}="${a[k]}"]`).join('');
  function click(act, a) {
    const el = q(`[data-act="${act}"]` + attrs(a));
    if (!el) throw new Error(`Bouton introuvable : ${act} ${JSON.stringify(a || {})}`);
    fireMouse(el, 'click');
  }
  function tick(sel, checked) {
    const el = q(sel);
    if (!el) throw new Error(`Case introuvable : ${sel}`);
    el.checked = checked;
    fire(el, 'change');
  }
  const text = sel => (q(sel) ? q(sel).textContent.replace(/\s+/g, ' ').trim() : '');
  const calls = (type, table) => window.__TEST_CALLS__.filter(c => c.type === type && c.table === table);
  const lastFields = (type, table, id) => { const list = calls(type, table).filter(c => id == null || c.id === id); return list.length ? list[list.length - 1].fields : null; };
  const toastText = () => document.getElementById('toast').textContent;
  const BASE = 'http://127.0.0.1/api/docs/test'; // baseUrl rendue par getAccessToken du mock

  // opts : { models: false → aucun modèle choisi } ; par défaut les deux modèles de l'instance CTO sont renseignés.
  function relectureOpts(opts) {
    opts = opts || {};
    return {
      tables: tables => {
        tables.Projets.find(p => p.id === 12).Notifications_Signees = ['L', 501];
        tables.Notifications.find(n => n.Projet === 11).notifications_Statut = '7) Transmise au porteur';
        if (opts.tables) opts.tables(tables);
      },
      rows: d => {
        if (opts.models !== false) { d.Instances[0].Modele_notification = 'Notification mail'; d.Instances[0].Modele_courrier_notification = 'Courrier notification'; }
        if (opts.rows) opts.rows(d);
      }
    };
  }
  // La page Instances est masquée dans la page de test : sans elle visible, le focus ne se pose pas et pdf.js (qui ne dessine que ce
  // qui est à l'écran) ne dessine rien. On l'affiche ; stubVisa().restore() (appelé par chaque test, en `finally`) la remasque.
  const openReview = async opts => {
    const host = document.getElementById('app-dom');
    host.style.cssText = 'display:block;position:absolute;left:0;top:0;width:2000px';
    document.getElementById('view-instances').classList.remove('hidden');
    await setup(relectureOpts(opts));
    click('step', { v: 'notifs' });
    click('notif-vue', { v: 'relecture' });
  };

  // Lectures Publipostage+ simulées : une réponse par projet, tout est consigné pour les vérifications.
  const DRAFT = id => ({
    url: 'mailto:porteur' + id + '@exemple.fr?subject=Notification', modelName: 'Notification mail', length: 40, issues: [],
    fields: { to: 'porteur' + id + '@exemple.fr', cc: 'direction@exemple.fr', bcc: '', subject: 'Notification de financement ' + id }, bodyText: 'Bonjour,\nVoici la notification du projet ' + id + '.'
  });
  function stubVisa(overrides) {
    const V = window.VisaMail, keys = ['prepare', 'prepareDocument', 'peek', 'openLink', 'listEmailModels', 'listDocumentModels', 'modelOverview']; // (peek : un test le simule, il ne doit pas fuir sur les suivants)
    const view = document.getElementById('view-instances'), wasHidden = view.classList.contains('hidden');
    const host = document.getElementById('app-dom'), hostStyle = host.getAttribute('style');
    const original = {}; keys.forEach(k => { original[k] = V[k]; });
    const log = { prepare: [], doc: [], links: [] };
    if (V.clearCache) V.clearCache(); // la mémoire de VisaMail (partagée par tout le module) ne doit rien garder d'un test précédent
    window.InstancesPage._setReader(false); // le courrier lu par Publipostage+ (iframe pilotée) est testé à part : ici, l'aperçu du widget
    window.InstancesPage._setWarm(false); // la préparation en arrière-plan des autres projets fausserait les décomptes de lectures (testée à part)
    Object.assign(V, {
      prepare: async args => { log.prepare.push(args); return DRAFT(args.project.id); },
      prepareDocument: async args => { log.doc.push(args); return { html: '<p>Madame, Monsieur, courrier du projet ' + args.project.id + '</p>', issues: [], modelName: args.modelName }; },
      openLink: url => { log.links.push(url); },
      listEmailModels: async () => [{ name: 'Notification mail' }, { name: 'Autre mail' }],
      listDocumentModels: async () => [{ name: 'Courrier notification' }],
      modelOverview: async () => ({ mail: ['Autre mail', 'Notification mail'], letter: ['Courrier notification'], macros: [], total: 3, counts: { email: 2, document: 1 } })
    }, overrides || {});
    return { log, restore() {
      window.InstancesPage._setWarm(true); window.InstancesPage._setReader(true); Object.assign(V, original); if (V.clearCache) V.clearCache(); view.classList.toggle('hidden', wasHidden);
      if (hostStyle == null) host.removeAttribute('style'); else host.setAttribute('style', hostStyle);
    } };
  }
  // Le CSS de la page n'est pas chargé par la page de test : les tests qui jugent de l'affichage réel (volet masqué, zoom) le posent le temps du test.
  async function useCss() {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '../css/instances.css';
    const loaded = new Promise((ok, ko) => { link.onload = ok; link.onerror = () => ko(new Error('css/instances.css introuvable')); });
    document.head.appendChild(link);
    await loaded;
    return () => link.remove();
  }
  const sheetHost = () => q('.in-rdoc .in-rdocview .in-sheetwrap > div');
  async function makePdf(pages) {
    const pdf = await window.PDFLib.PDFDocument.create();
    for (let i = 0; i < (pages || 1); i++) pdf.addPage([300, 400]);
    return pdf.save();
  }
  function stubOpen() {
    const original = window.open, opened = [];
    window.open = function (url) {
      const win = { url, written: '', printed: 0, closed: false, document: { title: '', body: { textContent: '' }, open() {}, write(html) { win.written += html; }, close() {} }, focus() {}, print() { win.printed += 1; }, close() { win.closed = true; } };
      opened.push(win);
      return win;
    };
    return { opened, restore() { window.open = original; } };
  }

  describe('Instances — Relecture & envoi des notifications : règles pures', function () {
    it('état d\'une notification : « transmise » (statut 7 ou plus), « signée » (la colonne PJ est remplie), sinon « à signer »', function () {
      assertEqual(L.notifReviewState({ notif: '1) Information projet saisies', signees: [] }), 'draft');
      assertEqual(L.notifReviewState({ notif: '1) Information projet saisies', signees: [501] }), 'signed');
      assertEqual(L.notifReviewState({ notif: '7) Transmise au porteur', signees: [] }), 'sent', 'transmise même sans pièce jointe');
      assertEqual(L.notifReviewState({ notif: '8) Archivee', signees: [501] }), 'sent');
      assertEqual(L.notifReviewState({ notif: '7) Transmise au porteur', signees: [501] }), 'sent', 'le statut transmise l\'emporte sur la pièce jointe');
    });

    it('le critère de « signée » est la colonne PJ, pas le statut : « 6) Signée » sans fichier reste « à signer »', function () {
      assertEqual(L.notifReviewState({ notif: '6) Signée', signees: [] }), 'draft');
      assertEqual(L.notifReviewState({ notif: '6) Signée' }), 'draft', 'projet sans colonne lue');
      assertEqual(L.notifReviewState(null), 'draft');
    });

    it('projet affiché : celui qui est demandé s\'il est dans la liste, sinon le premier ; rien si la liste est vide', function () {
      const items = [{ id: 10 }, { id: 11 }];
      assertEqual(L.pickReviewItem(items, 11).id, 11);
      assertEqual(L.pickReviewItem(items, 99).id, 10);
      assertEqual(L.pickReviewItem(items, 0).id, 10);
      assertEqual(L.pickReviewItem([], 10), null);
    });

    it('modèle de la page : les pièces jointes signées, le porteur et les deux modèles de l\'instance sont lus', async function () {
      await setup(relectureOpts());
      const m = window.InstancesPage.state.model;
      assertDeepEqual(m.projectsById[12].signees, [501]);
      assertDeepEqual(m.projectsById[10].signees, []);
      assertTrue(typeof m.projectsById[10].porteurId === 'number');
      const cto = m.instances.find(i => i.nom === 'CTO Innovation');
      assertEqual(cto.cfg.modNotif, 'Notification mail');
      assertEqual(cto.cfg.modCourrier, 'Courrier notification');
    });
  });

  describe('Instances — Relecture & envoi des notifications : la page', function () {
    it('le sélecteur « Suivi | Relecture & envoi » est dans l\'en-tête du panneau (pas de ligne en plus) ; le tableau de suivi reste la vue par défaut', async function () {
      await setup(relectureOpts());
      click('step', { v: 'notifs' });
      const seg = q('.in-ph .in-seg[aria-label="Affichage des notifications"]');
      assertTrue(!!seg, 'sélecteur dans la ligne du titre de l\'étape');
      assertEqual(seg.querySelector('button.in-on').textContent.trim(), 'Suivi');
      assertTrue(!!q('.in-nrow.in-head'), 'tableau de suivi');
      assertFalse(!!q('.in-rev'), 'pas de relecture tant qu\'on ne la choisit pas');
      assertEqual(text('.in-seg .in-nbadge'), '2', 'deux notifications pas encore transmises');
    });

    it('Relecture & envoi : trois volets (liste, e-mail, courrier) ; le choix est retenu pour la personne', async function () {
      const visa = stubVisa();
      try {
        await openReview();
        assertEqual(qa('.in-rev > .in-rpane').length, 3);
        assertTrue(!!q('.in-rlist') && !!q('.in-rmail') && !!q('.in-rdoc'));
        assertFalse(!!q('.in-nrow.in-head'), 'le tableau de suivi n\'est plus affiché');
        assertEqual(q('.in-seg button.in-on').textContent.replace(/\d+$/, '').trim(), 'Relecture & envoi');
        assertEqual(lastFields('UpdateRecord', 'Preferences_Widget').Inst_notif_vue, 'relecture');
        click('notif-vue', { v: 'suivi' });
        assertTrue(!!q('.in-nrow.in-head'));
        assertEqual(lastFields('UpdateRecord', 'Preferences_Widget').Inst_notif_vue, 'suivi');
      } finally { visa.restore(); }
    });

    it('au rechargement, la vue retenue s\'ouvre directement ; une valeur inconnue retombe sur « Suivi »', async function () {
      const visa = stubVisa();
      try {
        await setup(Object.assign(relectureOpts(), { noPrefs: true }));
        window.InstancesPage._reset();
        await setup(relectureOpts());
        await window.grist.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', 1, { Inst_notif_vue: 'relecture', Inst_etape: 'notifs' }]]);
        await window.loadInstancesUserPreferences();
        window.InstancesPage.render();
        assertTrue(!!q('.in-rev'), 'relecture rouverte');
        await window.grist.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', 1, { Inst_notif_vue: 'n\'importe quoi' }]]);
        await window.loadInstancesUserPreferences();
        window.InstancesPage.render();
        assertFalse(!!q('.in-rev'));
        assertTrue(!!q('.in-nrow.in-head'));
      } finally { visa.restore(); }
    });

    it('la liste montre l\'état de chaque notification : à signer (case à cocher), signée (trombone), transmise (coche) ', async function () {
      const visa = stubVisa();
      try {
        await openReview();
        const row = acro => qa('.in-rrow').find(r => r.querySelector('.in-rpick strong').textContent === acro);
        assertEqual(qa('.in-rrow').length, 3);
        assertEqual(row('INNOVX').querySelector('.in-nst').textContent, 'À signer');
        assertTrue(!!row('INNOVX').querySelector('input[data-chg="rev-check"]'), 'case à cocher pour une notification à signer');
        assertEqual(row('CONVENTIX').querySelector('.in-nst').textContent, 'Signée');
        assertFalse(!!row('CONVENTIX').querySelector('input[type="checkbox"]'), 'pas de case pour une notification déjà signée');
        assertTrue(!!row('CONVENTIX').querySelector('.in-rlead.in-ok'), 'trombone vert');
        assertEqual(row('NOTIFY').querySelector('.in-nst').textContent, 'Transmise');
        assertFalse(!!row('NOTIFY').querySelector('input[type="checkbox"]'));
      } finally { visa.restore(); }
    });

    it('le premier projet est affiché ; un clic sur un autre change le mail et le courrier, le clavier garde le focus', async function () {
      const visa = stubVisa();
      try {
        await openReview();
        await waitFor(() => text('.in-rbody').includes('projet 10'), 'mail du premier projet');
        assertEqual(qa('.in-rrow.in-on .in-rpick strong')[0].textContent, 'INNOVX');
        click('rev-pick', { id: 12 });
        await waitFor(() => text('.in-rbody').includes('projet 12'), 'mail du projet cliqué');
        assertEqual(qa('.in-rrow.in-on .in-rpick strong')[0].textContent, 'CONVENTIX');
        assertEqual(document.activeElement.dataset.id, '12', 'le focus revient sur la ligne choisie après le rendu');
        assertDeepEqual(visa.log.prepare.map(a => a.project.id), [10, 12], 'une lecture par projet affiché');
      } finally { visa.restore(); }
    });

    it('le mail est celui du modèle Publipostage+ : À, Cc, objet, corps, et « à glisser manuellement dans l\'email depuis Zimbra »', async function () {
      const visa = stubVisa();
      try {
        await openReview();
        await waitFor(() => text('.in-rbody').includes('Voici'), 'mail lu');
        assertEqual(visa.log.prepare[0].modelName, 'Notification mail');
        const fields = text('.in-rfields');
        assertIncludes(fields, 'porteur10@exemple.fr');
        assertIncludes(fields, 'direction@exemple.fr');
        assertIncludes(fields, 'Notification de financement 10');
        assertIncludes(fields, 'À glisser manuellement dans l\'email depuis Zimbra');
        assertEqual(q('.in-rbody').textContent, 'Bonjour,\nVoici la notification du projet 10.');
        assertTrue(!!q('.in-rmail .in-rbadge.in-viol'), 'badge Mode lecture');
        assertFalse(!!q('.in-rmail [draggable="true"]'), 'plus de pastille de pièce jointe à prévisualiser');
      } finally { visa.restore(); }
    });

    it('notification à signer : « Ouvrir dans ma messagerie » et « Copier » sont grisés avec l\'explication', async function () {
      const visa = stubVisa();
      try {
        await openReview();
        await waitFor(() => text('.in-rbody'), 'mail lu');
        assertTrue(q('[data-act="rev-open"]').disabled);
        assertTrue(q('[data-act="rev-copy"]').disabled);
        assertIncludes(q('[data-act="rev-open"]').title, 'une fois la notification signée');
        assertIncludes(text('.in-rmail .in-rfoot'), 'Disponible une fois la notification signée');
        click('rev-open');
        assertEqual(visa.log.links.length, 0, 'aucun brouillon ouvert');
      } finally { visa.restore(); }
    });

    it('notification signée : « Ouvrir dans ma messagerie » ouvre le brouillon du modèle, sans rien écrire dans Grist', async function () {
      const visa = stubVisa();
      try {
        await openReview();
        click('rev-pick', { id: 12 });
        await waitFor(() => text('.in-rbody').includes('projet 12'), 'mail lu');
        assertFalse(q('[data-act="rev-open"]').disabled);
        const before = window.__TEST_CALLS__.length;
        click('rev-open');
        assertDeepEqual(visa.log.links, [DRAFT(12).url]);
        assertIncludes(toastText(), 'CONVENTIX');
        assertIncludes(toastText(), 'glissez la pièce jointe');
        const writes = window.__TEST_CALLS__.slice(before).filter(c => c.type !== 'fetch' && /^(Update|Add|Remove|Bulk)/.test(c.type || ''));
        assertEqual(writes.filter(c => c.table === 'Notifications' || c.table === 'Projets').length, 0, 'Notifications et Projets ne sont jamais écrits');
      } finally { visa.restore(); }
    });

    it('« Copier » met l\'objet et le corps dans le presse-papiers', async function () {
      const visa = stubVisa();
      const copied = [];
      const original = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { copied.push(value); } } });
      try {
        await openReview();
        click('rev-pick', { id: 12 });
        await waitFor(() => text('.in-rbody').includes('projet 12'), 'mail lu');
        click('rev-copy');
        await waitFor(() => copied.length === 1, 'texte copié');
        assertEqual(copied[0], 'Notification de financement 12\n\nBonjour,\nVoici la notification du projet 12.');
        await waitFor(() => toastText().includes('copiés'), 'confirmation');
      } finally {
        visa.restore();
        delete navigator.clipboard;
        if (original) Object.defineProperty(Navigator.prototype, 'clipboard', original);
      }
    });

    it('case « Zimbra » : le mail est relu pour Zimbra et le choix est retenu pour la personne', async function () {
      const visa = stubVisa();
      try {
        await openReview();
        await waitFor(() => visa.log.prepare.length === 1, 'première lecture');
        assertEqual(visa.log.prepare[0].client, '');
        tick('input[data-chg="rev-zimbra"]', true);
        await waitFor(() => visa.log.prepare.length === 2, 'seconde lecture');
        assertEqual(visa.log.prepare[1].client, 'zimbra');
        assertEqual(lastFields('UpdateRecord', 'Preferences_Widget').Inst_messagerie, 'zimbra');
        assertTrue(q('input[data-chg="rev-zimbra"]').checked);
        assertEqual(document.activeElement.dataset.chg, 'rev-zimbra', document.activeElement.outerHTML.slice(0, 200));
      } finally { visa.restore(); }
    });

    it('sans modèle choisi : le mail et le courrier le disent et renvoient vers le paramétrage', async function () {
      const visa = stubVisa();
      try {
        await openReview({ models: false });
        assertIncludes(text('.in-rmail'), 'Aucun modèle de mail choisi');
        assertTrue(!!q('.in-rmail [data-act="settings-open"]'));
        assertIncludes(text('.in-rdoc'), 'Aucun modèle de courrier choisi');
        assertEqual(visa.log.prepare.length, 0, 'aucune lecture sans modèle');
        click('settings-open');
        assertTrue(!!q('input[data-f="Modele_notification"]') && !!q('input[data-f="Modele_courrier_notification"]'));
      } finally { visa.restore(); }
    });

    it('modèle disparu de Publipostage : message clair dans le volet, pas d\'erreur muette', async function () {
      const visa = stubVisa({ prepare: async () => { throw Object.assign(new Error('Modèle « Notification mail » introuvable parmi les modèles e-mail'), { code: 'model-missing' }); } });
      try {
        await openReview();
        await waitFor(() => text('.in-rmail').includes('Mail indisponible'), 'erreur affichée');
        assertIncludes(text('.in-rmail'), 'introuvable');
        assertIncludes(text('.in-rmail'), 'choisissez-en un autre dans le paramétrage');
        assertTrue(q('[data-act="rev-open"]') === null, 'pas de boutons d\'envoi sans mail');
      } finally { visa.restore(); }
    });

    it('les points à vérifier du modèle (variable sans valeur…) sont affichés avant l\'envoi', async function () {
      const visa = stubVisa({ prepare: async args => Object.assign(DRAFT(args.project.id), { issues: [{ kind: 'unresolved', keys: ['Projets.Montant'] }] }) });
      try {
        await openReview();
        await waitFor(() => q('.in-rmail .in-rissues'), 'avertissement');
        assertIncludes(text('.in-rmail .in-rissues'), 'Projets.Montant');
      } finally { visa.restore(); }
    });

    it('courrier à signer : aperçu du modèle « document » de Publipostage+, marqué « lecture »', async function () {
      const visa = stubVisa();
      try {
        await openReview();
        await waitFor(() => sheetHost() && sheetHost().shadowRoot, 'aperçu');
        const sheet = sheetHost().shadowRoot;
        assertIncludes(sheet.textContent, 'courrier du projet 10');
        assertEqual(visa.log.doc[0].modelName, 'Courrier notification');
        assertIncludes(text('.in-rdoc .in-rhead'), 'Courrier de notification');
        assertIncludes(text('.in-rdoc .in-rhead'), 'Publipostage+ · lecture');
        assertFalse(!!q('.in-rdoc [data-act="rev-download"]'), 'rien à télécharger : le PDF est celui que fera signer Antoine');
      } finally { visa.restore(); }
    });

    it('courrier à signer : la feuille garde la forme d\'une page A4 (794 px de large), ajustée au volet par un zoom et non recomposée', async function () {
      const visa = stubVisa(), dropCss = await useCss();
      try {
        await openReview();
        await waitFor(() => sheetHost() && sheetHost().shadowRoot, 'aperçu');
        const host = sheetHost();
        assertEqual(host.dataset.w, '794', 'A4 : 210 mm à 96 ppp');
        const css = host.shadowRoot.querySelector('style').textContent;
        assertIncludes(css, 'width:793.7px');
        assertIncludes(css, 'min-height:1122.5px');
        assertIncludes(css, 'position:relative'); // les images posées « en absolu » par le modèle restent dans la feuille
        const wrap = host.parentNode, zoom = Number(host.style.zoom);
        assertTrue(zoom > 0.2 && zoom <= 1.5, 'zoom posé : ' + host.style.zoom);
        assertTrue(Math.abs(zoom - (wrap.clientWidth - 24) / 794) < 0.02 || zoom === 1.5, 'la feuille occupe la largeur utile du volet : ' + zoom);
      } finally { dropCss(); visa.restore(); }
    });

    it('courrier : la page de Publipostage+ (format, sens et marges du modèle) est reprise', async function () {
      const page = { widthMm: 297, heightMm: 210, margins: { top: 20, right: 15, bottom: 20, left: 15 } };
      const visa = stubVisa({ prepareDocument: async args => ({ html: '<p>Paysage</p>', issues: [], modelName: args.modelName, page }) });
      try {
        await openReview();
        await waitFor(() => sheetHost() && sheetHost().shadowRoot, 'aperçu');
        assertEqual(sheetHost().dataset.w, '1123', 'A4 paysage : 297 mm');
        const css = sheetHost().shadowRoot.querySelector('style').textContent;
        assertIncludes(css, 'padding:75.6px 56.7px 75.6px 56.7px');
        assertIncludes(css, 'min-height:793.7px');
      } finally { visa.restore(); }
    });

    it('agrandir le courrier : un simple changement de classe, sans nouveau rendu ni relecture ; le bouton replie, le choix est retenu', async function () {
      const visa = stubVisa(), dropCss = await useCss();
      try {
        await openReview();
        await waitFor(() => sheetHost() && sheetHost().shadowRoot, 'aperçu');
        const rev = q('.in-rev'), mailPane = q('.in-rmail'), host = sheetHost(), reads = visa.log.doc.length + visa.log.prepare.length;
        assertEqual(host.parentNode.parentNode, q('.in-rdocview'));
        const before = host.style.zoom;
        click('rev-big', { v: 'doc' });
        assertTrue(rev.classList.contains('in-big-doc'), 'le conteneur porte la classe');
        assertEqual(q('.in-rev'), rev, 'même conteneur : aucun rendu');
        assertEqual(q('.in-rmail'), mailPane, 'le mail n\'a pas été recomposé');
        assertEqual(sheetHost(), host, 'le courrier garde son nœud');
        assertEqual(getComputedStyle(mailPane).display, 'none', 'le mail est masqué, la liste reste');
        assertTrue(getComputedStyle(q('.in-rlist')).display !== 'none');
        assertEqual(q('[data-act="rev-big"][data-v="doc"]').getAttribute('aria-pressed'), 'true');
        assertIncludes(q('[data-act="rev-big"][data-v="doc"]').title, 'Réduire');
        await waitFor(() => host.style.zoom !== before, 'zoom ajusté à la nouvelle largeur');
        assertEqual(visa.log.doc.length + visa.log.prepare.length, reads, 'aucune relecture');
        assertEqual(lastFields('UpdateRecord', 'Preferences_Widget').Inst_notif_large, 'doc', 'retenu par utilisateur');
        click('rev-big', { v: 'doc' });
        assertFalse(rev.classList.contains('in-big-doc'));
        assertTrue(getComputedStyle(mailPane).display !== 'none');
        assertEqual(lastFields('UpdateRecord', 'Preferences_Widget').Inst_notif_large, '');
      } finally { dropCss(); visa.restore(); }
    });

    it('agrandir le mail masque le courrier ; agrandir l\'un après l\'autre bascule de l\'un à l\'autre', async function () {
      const visa = stubVisa(), dropCss = await useCss();
      try {
        await openReview();
        await waitFor(() => q('.in-rmail .in-rfields'), 'mail lu');
        click('rev-big', { v: 'mail' });
        assertTrue(q('.in-rev').classList.contains('in-big-mail'));
        assertEqual(getComputedStyle(q('.in-rdoc')).display, 'none');
        click('rev-big', { v: 'doc' });
        assertTrue(q('.in-rev').classList.contains('in-big-doc') && !q('.in-rev').classList.contains('in-big-mail'));
        assertEqual(q('[data-act="rev-big"][data-v="mail"]').getAttribute('aria-pressed'), 'false');
      } finally { dropCss(); visa.restore(); }
    });

    it('le volet agrandi est retrouvé tel quel après un rendu (autre projet choisi)', async function () {
      const visa = stubVisa();
      try {
        await openReview();
        await waitFor(() => q('.in-rmail .in-rfields'), 'mail lu');
        click('rev-big', { v: 'mail' });
        click('rev-pick', { id: 11 });
        assertTrue(q('.in-rev').classList.contains('in-big-mail'), 'la classe est reposée par le rendu');
        assertEqual(q('[data-act="rev-big"][data-v="mail"]').getAttribute('aria-pressed'), 'true');
      } finally { visa.restore(); }
    });

    it('un projet déjà lu (mémoire de Publipostage+) s\'affiche sur-le-champ : ni « Lecture du modèle… », ni nouvelle lecture', async function () {
      const ready = { url: 'mailto:pret@exemple.fr', modelName: 'Notification mail', length: 20, issues: [], fields: { to: 'pret@exemple.fr', cc: '', bcc: '', subject: 'Déjà lu' }, bodyText: 'Corps en mémoire' };
      const doc = { html: '<p>Courrier en mémoire</p>', issues: [], modelName: 'Courrier notification' };
      const visa = stubVisa({ peek: (kind, args) => (args.project.id === 11 ? (kind === 'mail' ? ready : doc) : undefined) });
      try {
        await openReview();
        await waitFor(() => q('.in-rmail .in-rfields'), 'mail du premier projet');
        const reads = visa.log.prepare.length + visa.log.doc.length;
        click('rev-pick', { id: 11 });
        assertIncludes(text('.in-rmail'), 'Corps en mémoire', 'le mail est là dès le rendu');
        assertIncludes(text('.in-rmail'), 'Déjà lu');
        assertEqual(visa.log.prepare.length + visa.log.doc.length, reads, 'aucune lecture pour ce projet');
      } finally { visa.restore(); }
    });

    it('« Relire » vide la mémoire de Publipostage+ avant de relire', async function () {
      let cleared = 0;
      const visa = stubVisa({ clearCache: () => { cleared += 1; } });
      try {
        await openReview();
        await waitFor(() => q('.in-rmail .in-rfields'), 'mail lu');
        click('rev-refresh');
        assertEqual(cleared, 1);
      } finally { visa.restore(); }
    });

    it('les autres notifications de la séance se préparent en arrière-plan, une à la fois, pour passer de l\'une à l\'autre sans attendre', async function () {
      const visa = stubVisa();
      window.InstancesPage._setWarm(true);
      try {
        await openReview();
        await waitFor(() => q('.in-rmail .in-rfields'), 'mail lu');
        await waitFor(() => visa.log.prepare.some(call => call.project.id === 11) && visa.log.prepare.some(call => call.project.id === 12), 'les autres projets sont préparés', 5000);
        assertTrue(visa.log.prepare.filter(call => call.project.id !== 10).every(call => call.cache === true), 'avec la mémoire partagée');
        // Le courrier n'est préparé que pour les notifications encore « à signer » (10) : 11 est transmise, 12 est signée (sa pièce jointe remplace l'aperçu).
        assertTrue(visa.log.doc.every(call => call.project.id === 10), 'aperçu du courrier : seulement le projet à signer');
      } finally { visa.restore(); }
    });

    it('courrier signé : on n\'ouvre plus la version Publipostage+ mais la pièce jointe de la colonne « Notifications signées »', async function () {
      const visa = stubVisa();
      const original = window.fetch, urls = [];
      const pdf = await makePdf(1);
      window.fetch = async url => { urls.push(String(url)); return new Response(pdf); };
      try {
        await openReview();
        click('rev-pick', { id: 12 });
        await waitFor(() => q('.in-rdoc .pdfv-page canvas'), 'PDF dessiné dans le volet', 8000);
        assertEqual(urls.length, 1);
        assertEqual(urls[0], `${BASE}/attachments/501/download?auth=jeton-de-test&tableId=Projets&colId=Notifications_Signees&rowId=12`, 'lu avec la preuve d\'accès sur la cellule');
        assertEqual(visa.log.doc.length, 1, 'le modèle n\'a été lu que pour le projet à signer affiché avant');
        assertIncludes(text('.in-rdoc .in-rhead'), 'Notification signée');
        assertIncludes(text('.in-rdoc .in-rhead'), 'PJ signée');
        assertTrue(!!q('.in-rdoc [data-act="rev-download"]'));
      } finally { window.fetch = original; visa.restore(); }
    });

    it('un nouveau rendu (case cochée) ne relit pas le PDF : le volet courrier est conservé', async function () {
      const visa = stubVisa();
      const original = window.fetch, urls = [];
      const pdf = await makePdf(1);
      window.fetch = async url => { urls.push(String(url)); return new Response(pdf); };
      try {
        await openReview();
        click('rev-pick', { id: 12 });
        await waitFor(() => q('.in-rdoc .pdfv-page canvas'), 'PDF dessiné', 8000);
        tick('input[data-chg="rev-all"]', true);
        assertTrue(!!q('.in-rdoc .pdfv-page canvas'), 'même PDF, toujours dessiné');
        assertEqual(urls.length, 1, 'un seul téléchargement');
        click('rev-pick', { id: 10 });
        assertFalse(!!q('.in-rdoc .pdfv-page'), 'le PDF est retiré pour un projet à signer');
        click('rev-pick', { id: 12 });
        await waitFor(() => q('.in-rdoc .pdfv-page canvas'), 'PDF redessiné', 8000);
        assertEqual(urls.length, 2, 'rouvert après être passé par un autre projet');
      } finally { window.fetch = original; visa.restore(); }
    });

    it('notification déposée mais colonne vidée ensuite : « Pas de notification signée », pas de visionneuse vide', async function () {
      const visa = stubVisa();
      try {
        await openReview({ tables: tables => { tables.Notifications.find(n => n.Projet === 11).notifications_Statut = '7) Transmise au porteur'; } });
        click('rev-pick', { id: 11 });
        assertIncludes(text('.in-rdoc .in-rdocbody'), 'Pas de notification signée');
        assertFalse(!!q('.in-rdoc [data-act="rev-download"]'));
      } finally { visa.restore(); }
    });

    it('cases à cocher : seules les notifications « à signer » se cochent ; « tout cocher » les coche toutes', async function () {
      const visa = stubVisa();
      try {
        await openReview({ tables: tables => { tables.Notifications.find(n => n.Projet === 12).notifications_Statut = '1) Information projet saisies'; tables.Projets.find(p => p.id === 12).Notifications_Signees = null; } });
        assertEqual(qa('input[data-chg="rev-check"]').length, 2, 'INNOVX et CONVENTIX sont à signer');
        assertIncludes(text('.in-rlist .in-rfoot'), 'Aucune cochée');
        assertEqual(text('[data-act="rev-generate"]'), 'Tout générer (0)');
        assertTrue(q('[data-act="rev-generate"]').disabled);
        tick('input[data-chg="rev-all"]', true);
        assertIncludes(text('.in-rlist .in-rfoot'), '2 cochées');
        assertEqual(text('[data-act="rev-generate"]'), 'Tout générer (2)');
        assertTrue(qa('input[data-chg="rev-check"]').every(c => c.checked));
        tick('input[data-chg="rev-check"][data-id="10"]', false);
        assertIncludes(text('.in-rlist .in-rfoot'), '1 cochée');
        assertEqual(text('[data-act="rev-generate"]'), 'Tout générer (1)');
        assertFalse(q('input[data-chg="rev-all"]').checked);
      } finally { visa.restore(); }
    });

    it('« Tout générer » : les courriers cochés s\'ouvrent dans une page à imprimer, un par feuille, sans rien écrire dans Grist', async function () {
      const visa = stubVisa();
      const open = stubOpen();
      try {
        await openReview({ tables: tables => { tables.Notifications.find(n => n.Projet === 12).notifications_Statut = '1) Information projet saisies'; tables.Projets.find(p => p.id === 12).Notifications_Signees = null; } });
        tick('input[data-chg="rev-all"]', true);
        const before = window.__TEST_CALLS__.length;
        click('rev-generate');
        assertEqual(open.opened.length, 1, 'fenêtre ouverte tout de suite (geste de la personne)');
        await waitFor(() => open.opened[0].written.includes('courrier du projet 12'), 'courriers écrits');
        const page = open.opened[0].written;
        assertIncludes(page, 'courrier du projet 10');
        assertEqual((page.match(/<section class="letter">/g) || []).length, 2, 'un courrier par feuille');
        assertIncludes(page, 'page-break-after:always');
        assertDeepEqual(visa.log.doc.filter(a => a.modelName === 'Courrier notification').map(a => a.project.id).filter((v, i, all) => all.indexOf(v) === i).sort(), [10, 12]);
        await waitFor(() => open.opened[0].printed === 1, 'impression proposée');
        assertIncludes(toastText(), '2 courriers ouverts');
        assertEqual(window.__TEST_CALLS__.slice(before).filter(c => /^(Update|Add|Remove)/.test(c.type || '') && c.table !== 'Preferences_Widget').length, 0);
        assertFalse(q('[data-act="rev-generate"]').disabled === true && /Préparation/.test(text('[data-act="rev-generate"]')), 'bouton de nouveau disponible');
      } finally { open.restore(); visa.restore(); }
    });

    it('« Tout générer » sans modèle de courrier : message clair, aucune fenêtre ouverte', async function () {
      const visa = stubVisa();
      const open = stubOpen();
      try {
        await openReview({ models: false });
        tick('input[data-chg="rev-all"]', true);
        click('rev-generate');
        assertEqual(open.opened.length, 0);
        assertIncludes(toastText(), 'modèle du courrier');
      } finally { open.restore(); visa.restore(); }
    });

    it('un courrier qui ne se lit pas : la fenêtre ouverte est refermée et la cause est donnée', async function () {
      const visa = stubVisa({ prepareDocument: async () => { throw Object.assign(new Error('Modèle « X » introuvable'), { code: 'model-missing' }); } });
      const open = stubOpen();
      try {
        await openReview({ tables: tables => { tables.Projets.find(p => p.id === 12).Notifications_Signees = null; } });
        tick('input[data-chg="rev-all"]', true);
        click('rev-generate');
        await waitFor(() => open.opened[0] && open.opened[0].closed, 'fenêtre refermée');
        assertIncludes(toastText(), 'Courriers impossibles');
      } finally { open.restore(); visa.restore(); }
    });

    it('relire : la notification signée déposée entre-temps dans Grist fait passer le projet de « à signer » à « signée »', async function () {
      const visa = stubVisa();
      try {
        await openReview();
        assertEqual(qa('.in-rrow').find(r => r.textContent.includes('INNOVX')).querySelector('.in-nst').textContent, 'À signer');
        const projets = await window.grist.docApi.fetchTable('Projets');
        projets.Notifications_Signees = projets.id.map(id => (id === 12 ? ['L', 501] : (id === 10 ? ['L', 777] : null)));
        window.__mockSetTable('Projets', projets);
        click('rev-refresh');
        await waitFor(() => qa('.in-rrow').find(r => r.textContent.includes('INNOVX')).querySelector('.in-nst').textContent === 'Signée', 'état relu');
        await waitFor(() => visa.log.prepare.length >= 2, 'mail relu');
      } finally { visa.restore(); }
    });

    it('paramétrage : les quatre modèles (invitation, CR, mail et courrier de notification) se choisissent dans une liste lue dans Publipostage+', async function () {
      const visa = stubVisa();
      try {
        await setup(relectureOpts({ models: false, rows: d => { d.Instances[0].Modele_invitation = ''; } }));
        click('settings-open');
        await waitFor(() => q('select[data-f="Modele_notification"]'), 'listes de modèles');
        const options = f => qa('select[data-f="' + f + '"] option').map(o => o.value);
        assertDeepEqual(options('Modele_invitation'), ['', 'Autre mail', 'Notification mail'], 'invitation : les modèles e-mail');
        assertDeepEqual(options('Modele_CR'), ['', 'Autre mail', 'Notification mail'], 'envoi du CR : les modèles e-mail');
        assertDeepEqual(options('Modele_notification'), ['', 'Autre mail', 'Notification mail']);
        assertDeepEqual(options('Modele_courrier_notification'), ['', 'Courrier notification'], 'courrier : les modèles de type document');
        assertFalse(!!q('datalist'), 'plus de liste native, qui ne s\'ouvre pas au clic');
        assertEqual(text('.in-dlg .in-rnote') || '', '', 'aucun avertissement quand tout est lu');
        const choose = (f, value) => { const el = q('select[data-f="' + f + '"]'); el.value = value; fire(el, 'change'); };
        choose('Modele_notification', 'Autre mail');
        assertEqual(lastFields('UpdateRecord', 'Instances', 1).Modele_notification, 'Autre mail');
        choose('Modele_courrier_notification', 'Courrier notification');
        assertEqual(lastFields('UpdateRecord', 'Instances', 1).Modele_courrier_notification, 'Courrier notification');
        choose('Modele_invitation', 'Notification mail');
        assertEqual(lastFields('UpdateRecord', 'Instances', 1).Modele_invitation, 'Notification mail');
        choose('Modele_notification', '');
        assertEqual(lastFields('UpdateRecord', 'Instances', 1).Modele_notification, '', 'le choix se vide');
      } finally { visa.restore(); }
    });

    it('paramétrage : les macro-modèles de Publipostage+ sont proposés pour le courrier, rangés à part des documents', async function () {
      const visa = stubVisa({ modelOverview: async () => ({ mail: ['Notification mail'], letter: ['Courrier notification', 'Dossier complet'], macros: ['Dossier complet'], total: 4, counts: { email: 1, document: 2, macro: 1 } }) });
      try {
        await setup(relectureOpts({ models: false }));
        click('settings-open');
        await waitFor(() => q('select[data-f="Modele_courrier_notification"]'), 'listes de modèles');
        const groups = qa('select[data-f="Modele_courrier_notification"] optgroup').map(g => g.label + ' : ' + Array.from(g.querySelectorAll('option')).map(o => o.value).join(', '));
        assertDeepEqual(groups, ['Documents : Courrier notification', 'Macro-modèles : Dossier complet']);
        assertEqual(qa('select[data-f="Modele_notification"] optgroup').length, 0, 'le mail reste une simple liste');
        assertEqual(text('.in-dlg .in-rnote') || '', '', 'aucun avertissement');
        const el = q('select[data-f="Modele_courrier_notification"]'); el.value = 'Dossier complet'; fire(el, 'change');
        assertEqual(lastFields('UpdateRecord', 'Instances', 1).Modele_courrier_notification, 'Dossier complet');
      } finally { visa.restore(); }
    });

    it('paramétrage : un modèle déjà enregistré mais disparu de Publipostage+ reste visible, marqué « introuvable »', async function () {
      const visa = stubVisa();
      try {
        await setup(relectureOpts({ rows: d => { d.Instances[0].Modele_notification = 'Ancien modèle'; } }));
        click('settings-open');
        await waitFor(() => q('select[data-f="Modele_notification"]'), 'listes de modèles');
        const select = q('select[data-f="Modele_notification"]');
        assertEqual(select.value, 'Ancien modèle');
        assertIncludes(select.selectedOptions[0].textContent, 'introuvable dans Publipostage+');
      } finally { visa.restore(); }
    });

    it('paramétrage : table Publipostage_Modeles absente → champ libre et la cause est écrite sous les champs', async function () {
      const visa = stubVisa({ modelOverview: async () => { throw Object.assign(new Error('x'), { code: 'models-table-missing', detail: 'Publipostage_Templates : Table not found ; Publipostage_Modeles : Table not found' }); } });
      try {
        await setup(relectureOpts({ models: false }));
        click('settings-open');
        await waitFor(() => q('.in-rnote.in-warn'), 'avertissement');
        assertIncludes(text('.in-rnote.in-warn'), 'la table des modèles de Publipostage+ n\'a pas pu être lue (Publipostage_Templates : Table not found ; Publipostage_Modeles : Table not found)');
        assertEqual(qa('.in-rnote.in-warn').length, 2, 'sous chacun des deux groupes de modèles');
        ['Modele_invitation', 'Modele_CR', 'Modele_notification', 'Modele_courrier_notification'].forEach(f => assertTrue(!!q('input[type="text"][data-f="' + f + '"]'), f + ' : champ libre'));
        const input = q('input[data-f="Modele_notification"]');
        setValue(input, 'Mon modèle'); fire(input, 'change');
        assertEqual(lastFields('UpdateRecord', 'Instances', 1).Modele_notification, 'Mon modèle');
      } finally { visa.restore(); }
    });

    it('paramétrage : des modèles lus mais aucun de ce type → le nombre lu et leur répartition par type sont dits', async function () {
      const visa = stubVisa({ modelOverview: async () => ({ mail: [], letter: ['Courrier notification'], total: 4, counts: { document: 3, presentation: 1 } }) });
      try {
        await setup(relectureOpts({ models: false }));
        click('settings-open');
        await waitFor(() => q('.in-rnote.in-warn'), 'avertissement');
        assertIncludes(text('.in-rnote.in-warn'), 'Aucun modèle de type e-mail trouvé dans Publipostage+ (4 modèles lus : document 3, presentation 1)');
        assertTrue(!!q('select[data-f="Modele_courrier_notification"]'), 'le courrier a sa liste');
        assertTrue(!!q('input[type="text"][data-f="Modele_notification"]'), 'le mail garde un champ libre');
      } finally { visa.restore(); }
    });

    it('paramétrage, sans simulation : la liste vient de la vraie table Publipostage_Modeles du document (réglages exclus, types séparés)', async function () {
      await setup(relectureOpts({ models: false }));
      const rows = [
        { id: 1, Nom: 'Notification', TypeModele: 'email' }, { id: 2, Nom: 'Courrier', TypeModele: 'document' }, { id: 3, Nom: 'Réglages', TypeModele: 'reglages' },
        { id: 4, Nom: 'Diapo', TypeModele: 'presentation' }, { id: 5, Nom: 'Accord', TypeModele: 'email' }
      ];
      const table = { id: rows.map(r => r.id) };
      ['Nom', 'TypeModele', 'Contenu', 'Objet', 'Destinataires', 'Cc', 'Cci'].forEach(k => { table[k] = rows.map(r => r[k] || ''); });
      window.__mockSetTable('Publipostage_Modeles', table);
      click('settings-open');
      await waitFor(() => q('select[data-f="Modele_notification"]'), 'listes de modèles');
      assertDeepEqual(qa('select[data-f="Modele_notification"] option').map(o => o.value), ['', 'Accord', 'Notification']);
      assertDeepEqual(qa('select[data-f="Modele_courrier_notification"] option').map(o => o.value), ['', 'Courrier']);
    });

    it('un projet sans lien avec la séance : « Aucun projet relié » à la place des trois volets', async function () {
      const visa = stubVisa();
      try {
        await openReview({ rows: d => { d.Instance_Points.forEach(p => { p.Projets = ['L']; }); } });
        assertIncludes(text('.in-rdoc, .in-panel'), 'Aucun projet relié');
        assertFalse(!!q('.in-rev'));
      } finally { visa.restore(); }
    });
  });

  // Le courrier lu par Publipostage+ lui-même (demande d'Antoine du 23/11/2026) : l'iframe de Publipostage+ vit dans un « dock » hors du rendu, posé sur le volet du
  // courrier ; changer de projet n'envoie que la ligne. Le faux publipostage+ (tests/fake-publipostage.html) joue la lecture épurée ; VisaMail.findModel et
  // PageRedaction.resolveLinked sont simulés (le choix de la table est testé avec la page Rédaction).
  describe('Instances — Relecture : courrier lu par Publipostage+ (lecture épurée)', function () {
    const fakeUrl = query => ({ url: `${location.origin}/tests/fake-publipostage.html?templates=1&modeui=1&reading=1${query || ''}`, origin: location.origin });
    const PACE = { tickMs: 15, watchMs: 30, giveUpMs: 4000, absentTicks: 8 };
    const dock = () => q('[data-region="dock"]');
    const dockFrame = () => dock() && dock().querySelector('iframe');
    const nestedIn = () => dockFrame().contentWindow.__NESTED__;
    const slotText = () => text('.in-rdoc .in-rdocview');

    // `reader` : { query (du faux publipostage+), modelId (renvoyé par findModel ; null = modèle introuvable) }.
    function withReader(visa, reader) {
      reader = reader || {};
      const VM = window.VisaMail, PR = window.PageRedaction, saved = { findModel: VM.findModel, resolveLinked: PR.resolveLinked, open: PR.open };
      const opens = [], found = [];
      VM.findModel = async name => { found.push(name); return reader.modelId === null ? null : { id: reader.modelId || 7, name, type: 'document' }; };
      PR.resolveLinked = async project => ({ table: 'Projets', rowId: project.id, why: 'test', info: {} });
      PR.open = (id, opts) => { opens.push({ id, opts }); return Promise.resolve(); };
      window.InstancesPage._setReader(true, { target: () => fakeUrl(reader.query || '&models=7:Courrier,9:Autre&attachAfter=20&finalAfter=100'), pace: PACE });
      return { opens, found, restore() { Object.assign(VM, saved); PR.resolveLinked = saved.resolveLinked; PR.open = saved.open; visa.restore(); } };
    }
    // Deux notifications « à signer » (INNOVX 10 et NOTIFY 11) et une signée (CONVENTIX 12).
    const twoDrafts = { tables: tables => { tables.Notifications.find(n => n.Projet === 11).notifications_Statut = '1) Information projet saisies'; } };
    const ready = async label => {
      await waitFor(() => dock() && dock().classList.contains('on') && nestedIn().mode === 'read', label || 'courrier lu par publipostage+', 6000);
      await wait(150); // le switchMode final de démarrage est passé : la lecture épurée tient
    };

    it('le courrier est lu par Publipostage+ (lecture épurée) dans une iframe posée sur le volet ; l\'aperçu du widget ne sert pas', async function () {
      const visa = stubVisa(), r = withReader(visa), undoCss = await useCss();
      try {
        await openReview(twoDrafts);
        await ready();
        assertEqual(dock().querySelectorAll('iframe').length, 1);
        assertTrue(dockFrame().contentDocument.body.classList.contains('pp-clean-reading'), 'lecture épurée de Publipostage+');
        assertDeepEqual(nestedIn().opened, ['7']);
        assertDeepEqual(r.found, ['Courrier notification'], 'le modèle du courrier de l\'instance est cherché dans la liste de Publipostage+');
        assertTrue(nestedIn().normal.some(e => e.record.id === 10), 'le projet affiché est la ligne présentée à publipostage+');
        assertEqual(visa.log.doc.length, 0, 'aucun aperçu refait par le widget');
        assertFalse(!!sheetHost(), 'pas de feuille du widget sous l\'iframe');
        const slot = q('.in-rdoc .in-rdocbody').getBoundingClientRect(), d = dock().getBoundingClientRect();
        assertTrue(Math.abs(slot.left - d.left) <= 1 && Math.abs(slot.top - d.top) <= 1 && Math.abs(slot.width - d.width) <= 1 && Math.abs(slot.height - d.height) <= 1, 'le dock recouvre exactement le volet du courrier');
      } finally { r.restore(); undoCss(); }
    });

    it('changer de projet dans la colonne de gauche ne recharge pas le courrier : seule la ligne envoyée à Publipostage+ change', async function () {
      const visa = stubVisa(), r = withReader(visa), undoCss = await useCss();
      try {
        await openReview(twoDrafts);
        await ready();
        const frame = dockFrame(), doc = frame.contentDocument;
        click('rev-pick', { id: 11 });
        await waitFor(() => nestedIn().normal.some(e => e.record.id === 11), 'la ligne du projet cliqué arrive dans publipostage+');
        assertTrue(dockFrame() === frame && frame.contentDocument === doc, 'même iframe, pas de rechargement');
        assertEqual(dock().querySelectorAll('iframe').length, 1);
        assertDeepEqual(nestedIn().opened, ['7'], 'le modèle n\'est pas rouvert');
        assertTrue(frame.contentDocument.body.classList.contains('pp-clean-reading'), 'toujours en lecture épurée');
        assertTrue(dock().classList.contains('on'), 'le courrier reste affiché pendant le changement');
        assertEqual(visa.log.doc.length, 0);
        click('rev-pick', { id: 10 });
        await waitFor(() => nestedIn().normal.filter(e => e.record.id === 10).length >= 2, 'retour au premier projet');
        assertTrue(dockFrame() === frame, 'toujours la même iframe');
      } finally { r.restore(); undoCss(); }
    });

    it('notification signée : le dock se masque pour la visionneuse PDF ; revenir à une notification à signer le rend, sans recharger', async function () {
      const visa = stubVisa(), r = withReader(visa), undoCss = await useCss();
      try {
        await openReview(twoDrafts);
        await ready();
        const frame = dockFrame();
        click('rev-pick', { id: 12 });
        await waitFor(() => !dock().classList.contains('on'), 'dock masqué sur une notification signée');
        assertTrue(!!q('.in-rdoc .in-rdocview') && !sheetHost(), 'la pièce jointe signée a sa place dans le volet');
        click('rev-pick', { id: 11 });
        await waitFor(() => dock().classList.contains('on'), 'dock revenu');
        assertTrue(dockFrame() === frame, 'l\'iframe n\'a pas été recréée');
        await waitFor(() => nestedIn().normal.some(e => e.record.id === 11), 'ligne envoyée');
      } finally { r.restore(); undoCss(); }
    });

    it('agrandir le courrier : le dock suit le volet (même iframe), sans nouveau rendu', async function () {
      const visa = stubVisa(), r = withReader(visa), undoCss = await useCss();
      try {
        await openReview(twoDrafts);
        await ready();
        const frame = dockFrame(), before = dock().getBoundingClientRect().width;
        click('rev-big', { v: 'doc' });
        await waitFor(() => dock().getBoundingClientRect().width > before + 40, 'dock élargi avec le volet');
        const slot = q('.in-rdoc .in-rdocbody').getBoundingClientRect(), d = dock().getBoundingClientRect();
        assertTrue(Math.abs(slot.width - d.width) <= 1 && Math.abs(slot.left - d.left) <= 1, 'toujours calé sur le volet');
        assertTrue(dockFrame() === frame);
        click('rev-big', { v: 'doc' });
        await waitFor(() => Math.abs(dock().getBoundingClientRect().width - before) <= 1, 'dock revenu à sa taille');
      } finally { r.restore(); undoCss(); }
    });

    it('lecture épurée impossible (modèle absent de la liste de Publipostage+) : repli sur l\'aperçu du widget, avec la raison ; aucun nouvel essai à chaque projet', async function () {
      const visa = stubVisa(), r = withReader(visa, { modelId: 99 }), undoCss = await useCss();
      try {
        await openReview(twoDrafts);
        await waitFor(() => sheetHost() && sheetHost().shadowRoot, 'aperçu du widget en repli', 6000);
        assertIncludes(slotText(), 'lecture épurée de Publipostage+ est indisponible');
        assertIncludes(slotText(), 'pas dans la liste');
        assertIncludes(sheetHost().shadowRoot.textContent, 'courrier du projet 10');
        assertFalse(dock().classList.contains('on'), 'le dock est masqué');
        const frames = dock().querySelectorAll('iframe').length;
        click('rev-pick', { id: 11 });
        await waitFor(() => sheetHost() && sheetHost().shadowRoot.textContent.includes('projet 11'), 'aperçu du projet suivant');
        assertEqual(dock().querySelectorAll('iframe').length, frames, 'pas de nouvelle iframe tant qu\'on ne relit pas');
        // « Relire » : on réessaie avec une iframe neuve.
        window.VisaMail.findModel = async name => ({ id: 7, name, type: 'document' });
        click('rev-refresh');
        await ready('lecture épurée après « Relire »');
        assertEqual(dock().querySelectorAll('iframe').length, 1);
      } finally { r.restore(); undoCss(); }
    });

    it('publipostage+ introuvable (VisaMail.findModel absent) : l\'aperçu du widget sert, comme avant', async function () {
      const visa = stubVisa(), r = withReader(visa), undoCss = await useCss();
      try {
        window.VisaMail.findModel = undefined;
        await openReview(twoDrafts);
        await waitFor(() => sheetHost() && sheetHost().shadowRoot, 'aperçu du widget');
        assertFalse(slotText().includes('indisponible'), 'pas d\'avertissement : aucun lecteur n\'a été tenté');
        assertEqual(dock().querySelectorAll('iframe').length, 0);
      } finally { r.restore(); undoCss(); }
    });

    it('« Modifier le modèle » : sur le mail et sur le courrier, ouvre la page Rédaction sur ce modèle pour le projet affiché, « Retour » ramène ici', async function () {
      const visa = stubVisa(), r = withReader(visa, { query: '&models=7:Courrier' });
      try {
        await openReview(twoDrafts);
        await waitFor(() => q('.in-rmail [data-act="rev-edit-model"]') && q('.in-rdoc [data-act="rev-edit-model"]'), 'boutons');
        assertEqual(q('.in-rdoc [data-act="rev-edit-model"]').getAttribute('aria-label'), 'Modifier le modèle');
        assertIncludes(q('.in-rdoc [data-act="rev-edit-model"]').title, 'Courrier notification');
        assertIncludes(q('.in-rmail [data-act="rev-edit-model"]').title, 'Notification mail');
        click('rev-edit-model', { v: 'doc' });
        await waitFor(() => r.opens.length === 1, 'ouverture de la page Rédaction');
        assertEqual(r.opens[0].id, 10);
        assertEqual(r.opens[0].opts.modelId, 7);
        assertEqual(r.opens[0].opts.from, 'view-instances');
        assertIncludes(r.opens[0].opts.crumb, 'Instances');
        click('rev-edit-model', { v: 'mail' });
        await waitFor(() => r.opens.length === 2, 'seconde ouverture');
        assertEqual(r.found[r.found.length - 1], 'Notification mail', 'le modèle du mail est cherché, pas celui du courrier');
        click('rev-pick', { id: 11 });
        await waitFor(() => text('.in-rbody').includes('projet 11'), 'projet suivant');
        click('rev-edit-model', { v: 'doc' });
        await waitFor(() => r.opens.length === 3, 'ouverture pour l\'autre projet');
        assertEqual(r.opens[2].id, 11, 'le projet affiché est celui qui est ouvert');
      } finally { r.restore(); }
    });

    it('« Modifier le modèle » : grisé quand aucun modèle n\'est choisi ; absent du courrier d\'une notification signée (la PJ ne se modifie pas)', async function () {
      const visa = stubVisa(), r = withReader(visa);
      try {
        await openReview({ models: false });
        await waitFor(() => q('.in-rmail [data-act="rev-edit-model"]'), 'bouton du mail');
        assertTrue(q('.in-rmail [data-act="rev-edit-model"]').disabled && q('.in-rdoc [data-act="rev-edit-model"]').disabled, 'sans modèle, les deux sont grisés');
        click('rev-pick', { id: 12 });
        assertFalse(!!q('.in-rdoc [data-act="rev-edit-model"]'), 'notification signée : pas de bouton sur le courrier');
        assertEqual(r.opens.length, 0);
      } finally { r.restore(); }
    });
  });

  describe('Visionneuse PDF — affichage intégré (mount)', function () {
    it('un fichier illisible ou qui n\'est pas un PDF affiche son message dans l\'élément, sans fenêtre', async function () {
      const host = document.createElement('div');
      document.body.appendChild(host);
      try {
        const bad = window.PdfViewer.mount(host, { load: async () => new TextEncoder().encode('ce n\'est pas un PDF') });
        await waitFor(() => host.querySelector('.pdfv-error'), 'message');
        assertIncludes(host.textContent, 'n\'est pas un PDF');
        assertFalse(window.PdfViewer.isOpen(), 'aucune fenêtre');
        bad.destroy();
        assertEqual(host.children.length, 0, 'destroy vide l\'élément');
        const failing = window.PdfViewer.mount(host, { load: async () => { throw new Error('HTTP 404'); } });
        await waitFor(() => host.querySelector('.pdfv-error'), 'message');
        assertIncludes(host.textContent, 'n\'a pas pu être lu');
        assertIncludes(host.textContent, 'HTTP 404');
        failing.destroy();
      } finally { host.remove(); }
    });

    it('un vrai PDF se dessine dans l\'élément (une page par toile) ; destroy libère tout', async function () {
      const host = document.createElement('div');
      host.style.cssText = 'width:400px;height:300px;overflow:auto';
      document.body.appendChild(host);
      try {
        const pdf = await makePdf(2);
        const handle = window.PdfViewer.mount(host, { load: async () => pdf });
        await waitFor(() => host.querySelectorAll('.pdfv-page').length === 2, 'deux pages', 8000);
        await waitFor(() => host.querySelector('canvas'), 'page dessinée', 8000);
        handle.destroy();
        assertEqual(host.children.length, 0);
      } finally { host.remove(); }
    });
  });
})();
