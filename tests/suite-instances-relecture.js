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
    const V = window.VisaMail, keys = ['prepare', 'prepareDocument', 'openLink', 'listEmailModels', 'listDocumentModels'];
    const view = document.getElementById('view-instances'), wasHidden = view.classList.contains('hidden');
    const host = document.getElementById('app-dom'), hostStyle = host.getAttribute('style');
    const original = {}; keys.forEach(k => { original[k] = V[k]; });
    const log = { prepare: [], doc: [], links: [] };
    Object.assign(V, {
      prepare: async args => { log.prepare.push(args); return DRAFT(args.project.id); },
      prepareDocument: async args => { log.doc.push(args); return { html: '<p>Madame, Monsieur, courrier du projet ' + args.project.id + '</p>', issues: [], modelName: args.modelName }; },
      openLink: url => { log.links.push(url); },
      listEmailModels: async () => [{ name: 'Notification mail' }, { name: 'Autre mail' }],
      listDocumentModels: async () => [{ name: 'Courrier notification' }]
    }, overrides || {});
    return { log, restore() {
      Object.assign(V, original); view.classList.toggle('hidden', wasHidden);
      if (hostStyle == null) host.removeAttribute('style'); else host.setAttribute('style', hostStyle);
    } };
  }
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
        await waitFor(() => q('.in-rdoc .in-rdocview') && q('.in-rdoc .in-rdocview').lastElementChild && q('.in-rdoc .in-rdocview').lastElementChild.shadowRoot, 'aperçu');
        const sheet = q('.in-rdoc .in-rdocview').lastElementChild.shadowRoot;
        assertIncludes(sheet.textContent, 'courrier du projet 10');
        assertEqual(visa.log.doc[0].modelName, 'Courrier notification');
        assertIncludes(text('.in-rdoc .in-rhead'), 'Courrier de notification');
        assertIncludes(text('.in-rdoc .in-rhead'), 'Publipostage+ · lecture');
        assertFalse(!!q('.in-rdoc [data-act="rev-download"]'), 'rien à télécharger : le PDF est celui que fera signer Antoine');
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

    it('paramétrage : les deux modèles des notifications se proposent depuis Publipostage+ et s\'enregistrent dans Instances', async function () {
      const visa = stubVisa();
      try {
        await setup(relectureOpts({ models: false }));
        click('settings-open');
        await waitFor(() => qa('#in-modeles-notif-mail option').length === 2, 'modèles lus');
        assertDeepEqual(qa('#in-modeles-notif-mail option').map(o => o.value), ['Notification mail', 'Autre mail']);
        assertDeepEqual(qa('#in-modeles-notif-lettre option').map(o => o.value), ['Courrier notification']);
        const mailInput = q('input[data-f="Modele_notification"]');
        setValue(mailInput, 'Autre mail'); fire(mailInput, 'change');
        assertEqual(lastFields('UpdateRecord', 'Instances', 1).Modele_notification, 'Autre mail');
        const letterInput = q('input[data-f="Modele_courrier_notification"]');
        setValue(letterInput, 'Courrier notification'); fire(letterInput, 'change');
        assertEqual(lastFields('UpdateRecord', 'Instances', 1).Modele_courrier_notification, 'Courrier notification');
      } finally { visa.restore(); }
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
