/**
 * Non-regression suite : étape « Mail d'invitation » de la page « par instance » (Antoine, 27/11/2026).
 *
 * Avant : l'étape portait GFS, qui garde le dernier fichier ouvert (souvent le compte rendu) : « ce n'est pas le bon modèle qui se lance ». Le widget ne peut pas dire à
 * GFS quel fichier ouvrir. Maintenant : la même vue que la « Relecture & envoi » des notifications — à gauche un bloc « Invités habituels » (un seul mail pour la liste
 * permanente) puis une ligne par invité spécifique ; à droite le mail lu par Publipostage+ lui-même (lecture épurée), le modèle étant ouvert PAR SON NOM :
 * Instances.Modele_invitation (séance) ou Instances.Modele_invitation_specifique (un invité).
 *
 * Mêmes données que suite-instances.js : séance n°14 (id 2), invités 1 (Alice) et 2 (Bob) de la liste permanente, 3 (Chloé) ajoutée sur un point.
 * Publipostage+ est le faux de tests/fake-publipostage.html ; VisaMail (lectures du mail) est simulé.
 */
(function () {
  'use strict';

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
  const step = key => click('step', { v: key });
  const text = sel => (q(sel) ? q(sel).textContent.replace(/\s+/g, ' ').trim() : '');
  const calls = (type, table) => window.__TEST_CALLS__.filter(c => c.type === type && c.table === table);
  const lastFields = (type, table, id) => { const list = calls(type, table).filter(c => id == null || c.id === id); return list.length ? list[list.length - 1].fields : null; };
  const gd = iso => Math.floor(Date.parse(iso + 'T00:00:00Z') / 1000);
  const TODAY_ISO = '2026-11-09'; // la date « d'aujourd'hui » des tests de la page Instances (voir suite-instances.js : TODAY)
  const fakeUrl = query => ({ url: `${location.origin}/tests/fake-publipostage.html?templates=1&modeui=1&reading=1${query || ''}`, origin: location.origin });
  const PACE = { tickMs: 15, watchMs: 30, giveUpMs: 4000, absentTicks: 8 };
  const MODELS = { 'Invitation CTO': 7, 'Invitation invité': 9 };

  // Rend la page visible (sans quoi les volets n'ont aucune taille et le dock ne se pose pas), pose le CSS et simule VisaMail ; `restore()` remet tout.
  async function stage(opts) {
    opts = opts || {};
    const V = window.VisaMail;
    const keys = ['prepareRow', 'peek', 'openLink', 'findModel', 'modelOverview', 'listEmailModels', 'listDocumentModels'];
    const saved = {}; keys.forEach(k => { saved[k] = V[k]; });
    const view = document.getElementById('view-instances'), wasHidden = view.classList.contains('hidden');
    const host = document.getElementById('app-dom'), hostStyle = host.getAttribute('style');
    const log = { rows: [], found: [], links: [] };
    if (V.clearCache) V.clearCache();
    window.InstancesPage._setWarm(false);
    Object.assign(V, {
      prepareRow: async args => {
        log.rows.push(args);
        if (opts.rowError) throw new Error(opts.rowError);
        return {
          url: 'mailto:x@exemple.fr?subject=' + args.row.table + args.row.id, modelName: args.modelName, length: 30, issues: [],
          fields: { to: args.row.table === 'Instance_Invites' ? 'chloe@example.org' : '', cc: '', bcc: (args.defaults && args.defaults.bcc) || '', subject: 'Invitation ' + args.row.table + ' ' + args.row.id },
          bodyText: 'Bonjour,\nVous êtes invité (' + args.modelName + ').'
        };
      },
      peek: () => undefined,
      openLink: url => { log.links.push(url); },
      findModel: async name => { log.found.push(name); return MODELS[name] && !opts.missing ? { id: MODELS[name], name, type: 'email' } : null; },
      modelOverview: async () => ({ mail: ['Invitation CTO', 'Invitation invité', 'Autre mail'], letter: [], macros: [], total: 3, counts: { email: 3 } }),
      listEmailModels: async () => [{ name: 'Invitation CTO' }, { name: 'Invitation invité' }],
      listDocumentModels: async () => []
    });
    window.InstancesPage._setReader(opts.reader !== false, { target: () => fakeUrl(opts.query || '&models=7:Invitation CTO,9:Invitation invité&attachAfter=20&finalAfter=100'), pace: PACE });
    host.style.cssText = 'display:block;position:absolute;left:0;top:0;width:2000px';
    view.classList.remove('hidden');
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '../css/instances.css';
    const loaded = new Promise((ok, ko) => { link.onload = ok; link.onerror = () => ko(new Error('css/instances.css introuvable')); });
    document.head.appendChild(link);
    await loaded;
    return { log, restore() {
      link.remove();
      window.InstancesPage._setWarm(true); window.InstancesPage._setReader(true);
      Object.assign(V, saved); if (V.clearCache) V.clearCache();
      view.classList.toggle('hidden', wasHidden);
      if (hostStyle == null) host.removeAttribute('style'); else host.setAttribute('style', hostStyle);
    } };
  }
  const withModels = extra => ({ rows: d => { d.Instances[0].Modele_invitation_specifique = 'Invitation invité'; if (extra) extra(d); } });
  const dock = kind => q(`[data-dock="inv-${kind}"]`);
  const frameOf = kind => dock(kind) && dock(kind).querySelector('iframe');
  const nestedOf = kind => frameOf(kind).contentWindow.__NESTED__;
  const ready = async (kind, label) => {
    await waitFor(() => dock(kind) && dock(kind).classList.contains('on') && frameOf(kind) && nestedOf(kind).mode === 'read', label || 'mail lu par publipostage+ (' + kind + ')', 6000);
    await wait(150); // le switchMode final de démarrage est passé : la lecture épurée tient
  };
  const rowOf = sel => q(`.in-rrow[data-inv="${sel}"]`);
  const settleSelect = async f => { await waitFor(() => { const el = q(`[data-chg="cfg-mod"][data-f="${f}"]`); return el && el.tagName === 'SELECT'; }, 'liste des modèles de ' + f); return q(`[data-chg="cfg-mod"][data-f="${f}"]`); };

  describe('Instances — étape Mail d\'invitation (27/11/2026) : la vue de la relecture des notifications', function () {
    it('à gauche un bloc « Invités habituels » (un mail) puis une ligne par invité spécifique ; GFS n\'est plus sur cette étape', async function () {
      const s = await stage({ reader: false });
      try {
        await setup(withModels());
        step('invitation');
        assertTrue(!!q('.in-rev.in-inv'), 'la vue à deux volets de la relecture des notifications');
        const rows = qa('.in-rev .in-rrow');
        assertDeepEqual(rows.map(r => r.dataset.inv), ['usual', '3'], 'le bloc des habituels d\'abord, puis un invité spécifique');
        assertIncludes(rowOf('usual').textContent, 'Invités habituels');
        assertIncludes(rowOf('usual').textContent, '1 mail · 2 destinataires');
        assertIncludes(rowOf('3').textContent, 'Chloé Petit');
        assertIncludes(text('.in-rev .in-rsec'), 'Invités spécifiques');
        assertTrue(rowOf('usual').classList.contains('in-on'), 'le bloc des habituels est affiché au départ');
        assertTrue(q('[data-region="viewer"]').hidden, 'pas de GFS sur l\'étape Invitation');
        assertEqual(qa('iframe.in-gframe').length, 0, 'aucune iframe GFS ouverte pour l\'invitation');
        assertTrue(!!q('.in-panel input[data-chg="inv-date"]') && !!q('.in-panel [data-act="inv-today"]'), 'date d\'envoi et « Envoyé aujourd\'hui » dans la carte du haut');
        assertIncludes(text('.in-panel > .in-card'), '0/2', 'mails écrits : ni le bloc des habituels (Bob n\'est pas écrit) ni Chloé');
      } finally { s.restore(); }
    });

    it('le mail des habituels vient du modèle Modele_invitation, celui d\'un invité spécifique de Modele_invitation_specifique ; jamais du modèle du CR (le bug du mauvais modèle)', async function () {
      const s = await stage({ reader: false });
      try {
        await setup(withModels(d => { d.Instances[0].Modele_CR = 'CR_Comité'; }));
        step('invitation');
        await waitFor(() => text('.in-rmail .in-rfields').includes('Objet'), 'mail des habituels');
        assertEqual(s.log.rows.length, 1);
        assertEqual(s.log.rows[0].modelName, 'Invitation CTO', 'le modèle d\'invitation de l\'instance');
        assertDeepEqual(s.log.rows[0].row, { table: 'Suivi_Instance', id: 2 }, 'la ligne de la séance');
        assertEqual(text('.in-rmail .in-rmodel'), 'Invitation CTO');
        assertIncludes(text('.in-rmail .in-rfields'), 'Invitation Suivi_Instance 2');
        assertIncludes(text('.in-rmail .in-rfields'), '2 destinataires en copie cachée', 'la liste habituelle part en copie cachée (le modèle ne donne aucun destinataire)');
        assertEqual(s.log.rows[0].defaults.bcc, 'alice.martin@example.org, bob.durand@example.org');
        click('inv-pick', { v: 3 });
        await waitFor(() => s.log.rows.length === 2, 'mail de l\'invité spécifique');
        assertEqual(s.log.rows[1].modelName, 'Invitation invité', 'le modèle des invités spécifiques');
        assertDeepEqual(s.log.rows[1].row, { table: 'Instance_Invites', id: 3 }, 'la ligne de l\'invité : ses variables partent d\'elle');
        assertEqual(s.log.rows[1].defaults.bcc, '', 'un invité spécifique : pas de liste en copie cachée');
        assertEqual(text('.in-rmail .in-rmodel'), 'Invitation invité');
        await waitFor(() => text('.in-rmail .in-rfields').includes('chloe@example.org'), 'destinataire de l\'invité');
        assertFalse(s.log.rows.some(r => r.modelName === 'CR_Comité'), 'le modèle du compte rendu n\'est jamais demandé');
      } finally { s.restore(); }
    });

    it('sans modèle pour les invités spécifiques : le volet le dit avec un accès au paramétrage ; le modèle se choisit dans le paramétrage de l\'instance', async function () {
      const s = await stage({ reader: false });
      try {
        await setup();
        step('invitation');
        await waitFor(() => text('.in-rmail .in-rfields').includes('Objet'), 'mail des habituels');
        click('inv-pick', { v: 3 });
        assertIncludes(text('.in-rmail'), 'Aucun modèle choisi pour les invités spécifiques');
        assertTrue(!!q('.in-rmail [data-act="settings-open"]'), 'bouton du paramétrage');
        assertTrue(q('.in-rmail [data-act="inv-edit"]').disabled, 'rien à modifier');
        assertEqual(s.log.rows.length, 1, 'aucun mail lu pour l\'invité sans modèle');
        click('settings-open');
        const field = await settleSelect('Modele_invitation_specifique');
        setValue(field, 'Invitation invité'); fire(field, 'change');
        await waitFor(() => lastFields('UpdateRecord', 'Instances', 1) && lastFields('UpdateRecord', 'Instances', 1).Modele_invitation_specifique === 'Invitation invité', 'modèle enregistré');
      } finally { s.restore(); }
    });

    it('les pastilles : « écrit » pour toute la liste habituelle d\'un clic, « écrit » et « horaire envoyé » par invité spécifique', async function () {
      const s = await stage({ reader: false });
      try {
        await setup(withModels());
        step('invitation');
        click('inv-usual-written');
        await waitFor(() => lastFields('UpdateRecord', 'Instance_Invites', 2), 'Bob marqué écrit');
        assertEqual(lastFields('UpdateRecord', 'Instance_Invites', 2).Ecrit_le, gd(TODAY_ISO));
        assertEqual(calls('UpdateRecord', 'Instance_Invites').filter(c => c.id === 1).length, 0, 'Alice était déjà écrite : rien n\'est réécrit');
        await waitFor(() => rowOf('usual').querySelector('.in-ib.in-on'), 'pastille verte quand toute la liste est écrite');
        click('inv-usual-written');
        await waitFor(() => lastFields('UpdateRecord', 'Instance_Invites', 1) && lastFields('UpdateRecord', 'Instance_Invites', 1).Ecrit_le === null, 'tout le monde est « non écrit »');
        assertEqual(lastFields('UpdateRecord', 'Instance_Invites', 2).Ecrit_le, null);
        // invité spécifique : la pastille de sa ligne et les boutons du volet du mail
        click('g-ecrit', { id: 3 });
        await waitFor(() => lastFields('UpdateRecord', 'Instance_Invites', 3) && 'Ecrit_le' in lastFields('UpdateRecord', 'Instance_Invites', 3), 'Chloé écrite');
        assertEqual(lastFields('UpdateRecord', 'Instance_Invites', 3).Ecrit_le, gd(TODAY_ISO));
        click('inv-pick', { v: 3 });
        assertTrue(!!q('.in-rmail .in-rfoot [data-act="g-ecrit"][data-id="3"]'), 'marquer écrite depuis le volet du mail');
        assertTrue(!!q('.in-rmail .in-rfoot [data-act="g-hor"][data-id="3"]'), 'marquer l\'horaire envoyé depuis le volet du mail');
      } finally { s.restore(); }
    });

    it('« Ouvrir dans ma messagerie » ouvre le brouillon du mail affiché', async function () {
      const s = await stage({ reader: false });
      try {
        await setup(withModels());
        step('invitation');
        await waitFor(() => !q('.in-rmail [data-act="inv-open"]').disabled, 'mail prêt');
        click('inv-open');
        assertEqual(s.log.links.length, 1);
        assertIncludes(s.log.links[0], 'mailto:');
        assertIncludes(s.log.links[0], 'Suivi_Instance2', 'le brouillon est celui de la séance');
        click('inv-pick', { v: 3 });
        await waitFor(() => !q('.in-rmail [data-act="inv-open"]').disabled && text('.in-rmail .in-rfields').includes('Instance_Invites 3'), 'mail de Chloé prêt');
        click('inv-open');
        assertIncludes(s.log.links[1], 'Instance_Invites3', 'le brouillon est celui de l\'invité affiché');
      } finally { s.restore(); }
    });

    it('mail illisible : la raison est dite dans le volet, rien n\'est cassé', async function () {
      const s = await stage({ reader: false, rowError: 'variable inconnue' });
      try {
        await setup(withModels());
        step('invitation');
        await waitFor(() => text('.in-rmail .in-rfields').includes('indisponible'), 'erreur affichée');
        assertTrue(q('.in-rmail [data-act="inv-open"]').disabled && q('.in-rmail [data-act="inv-copy"]').disabled, 'rien à ouvrir ni à copier');
        assertTrue(!!q('.in-rmail [data-act="inv-refresh"]'), '« Relire » reste là');
      } finally { s.restore(); }
    });
  });

  describe('Instances — étape Mail d\'invitation : lu par Publipostage+ lui-même (lecture épurée)', function () {
    it('le BON modèle est ouvert dans Publipostage+ : Modele_invitation sur la séance, jamais le dernier fichier de GFS ; l\'aperçu du widget ne sert pas', async function () {
      const s = await stage();
      try {
        await setup(withModels(d => { d.Instances[0].Modele_CR = 'CR_Comité'; }));
        step('invitation');
        await ready('usual');
        assertDeepEqual(s.log.found, ['Invitation CTO'], 'le modèle d\'invitation est cherché par son nom dans Publipostage+');
        assertDeepEqual(nestedOf('usual').opened, ['7'], 'et c\'est lui qui est ouvert');
        assertTrue(frameOf('usual').contentDocument.body.classList.contains('pp-clean-reading'), 'lecture épurée de Publipostage+');
        assertTrue(nestedOf('usual').normal.some(e => e.record.id === 2), 'la ligne présentée est la séance');
        assertEqual(frameOf('usual').closest('.in-ppdock').dataset.dock, 'inv-usual');
        const slot = q('.in-rmail .in-rdocbody').getBoundingClientRect(), d = dock('usual').getBoundingClientRect();
        assertTrue(Math.abs(slot.left - d.left) <= 1 && Math.abs(slot.top - d.top) <= 1 && Math.abs(slot.width - d.width) <= 1 && Math.abs(slot.height - d.height) <= 1, 'le dock recouvre exactement le volet du mail');
        assertEqual(qa('iframe.in-gframe').length, 0, 'GFS n\'est pas chargé');
      } finally { s.restore(); }
    });

    it('un invité spécifique s\'ouvre sur son modèle et sa ligne (autre table, autre iframe) ; passer d\'un invité à l\'autre n\'envoie que la ligne, revenir aux habituels ne recharge rien', async function () {
      const s = await stage();
      try {
        await setup(withModels(d => { d.Instance_Invites.push({ id: 5, Seance: 2, Personne: 4, Origine: 'Ajouté sur un point', Ecrit_le: null, Passage_envoye_le: null, Passage_envoye_heure: '', Reponse: 'À confirmer', Dispo_de: '', Dispo_a: '', Commentaire: '', Appel: '' }); }));
        step('invitation');
        await ready('usual');
        const usualFrame = frameOf('usual');
        click('inv-pick', { v: 3 });
        await ready('guest', 'mail de l\'invité spécifique');
        assertTrue(dock('guest').classList.contains('on') && !dock('usual').classList.contains('on'), 'un seul dock visible à la fois');
        assertDeepEqual(nestedOf('guest').opened, ['9'], 'le modèle des invités spécifiques est ouvert');
        assertTrue(nestedOf('guest').normal.some(e => e.record.id === 3), 'la ligne de l\'invité (Instance_Invites) est la ligne présentée');
        assertEqual(s.log.found[s.log.found.length - 1], 'Invitation invité');
        const guestFrame = frameOf('guest'), guestDoc = guestFrame.contentDocument;
        click('inv-pick', { v: 5 });
        await waitFor(() => nestedOf('guest').normal.some(e => e.record.id === 5), 'la ligne du second invité arrive dans publipostage+');
        assertTrue(frameOf('guest') === guestFrame && guestFrame.contentDocument === guestDoc, 'même iframe, aucun rechargement');
        assertDeepEqual(nestedOf('guest').opened, ['9'], 'le modèle n\'est pas rouvert');
        click('inv-pick', { v: 'usual' });
        await waitFor(() => dock('usual').classList.contains('on') && !dock('guest').classList.contains('on'), 'retour aux habituels');
        assertTrue(frameOf('usual') === usualFrame, 'l\'iframe des habituels n\'a pas été recréée');
        assertDeepEqual(nestedOf('usual').opened, ['7']);
      } finally { s.restore(); }
    });

    it('un autre rendu de la page (écriture d\'une pastille) ne recharge ni ne recrée l\'iframe ; elle se masque hors de l\'étape', async function () {
      const s = await stage();
      try {
        await setup(withModels());
        step('invitation');
        await ready('usual');
        const frame = frameOf('usual'), doc = frame.contentDocument;
        click('g-ecrit', { id: 3 });
        await waitFor(() => lastFields('UpdateRecord', 'Instance_Invites', 3), 'écriture');
        await wait(200);
        assertTrue(frameOf('usual') === frame && frame.contentDocument === doc, 'même iframe');
        assertEqual(dock('usual').querySelectorAll('iframe').length, 1);
        assertTrue(dock('usual').classList.contains('on'), 'le mail reste affiché');
        step('invites');
        assertFalse(dock('usual').classList.contains('on'), 'dock masqué hors de l\'étape');
        step('invitation');
        await waitFor(() => dock('usual').classList.contains('on'), 'dock revenu');
        assertTrue(frameOf('usual') === frame, 'même iframe au retour');
      } finally { s.restore(); }
    });

    it('lecture impossible (modèle absent de la liste de Publipostage+) : repli sur le texte du mail lu par le widget, avec la raison', async function () {
      const s = await stage({ query: '&models=9:Invitation invité' });
      try {
        await setup(withModels());
        step('invitation');
        await waitFor(() => text('.in-rmail .in-rdocview').includes('indisponible'), 'repli', 6000);
        assertIncludes(text('.in-rmail .in-rdocview'), 'aperçu simplifié');
        assertIncludes(text('.in-rmail .in-rdocview'), 'pas dans la liste');
        await waitFor(() => text('.in-rmail .in-rdocview').includes('Vous êtes invité (Invitation CTO)'), 'le corps du mail lu par le widget');
        assertFalse(dock('usual').classList.contains('on'), 'dock masqué');
      } finally { s.restore(); }
    });

    it('modèle introuvable dans Publipostage+ : repli avec la raison, aucune iframe', async function () {
      const s = await stage({ missing: true });
      try {
        await setup(withModels());
        step('invitation');
        await waitFor(() => text('.in-rmail .in-rdocview').includes('modèle introuvable'), 'repli');
        assertFalse(!!frameOf('usual'), 'aucune iframe');
      } finally { s.restore(); }
    });

    it('« Modifier le modèle » : Publipostage+ passe en Édition sur place (même modèle, même ligne), le même bouton revient à la lecture', async function () {
      const s = await stage();
      try {
        await setup(withModels());
        step('invitation');
        await ready('usual');
        const frame = frameOf('usual');
        assertEqual(q('.in-rmail [data-act="inv-edit"]').getAttribute('aria-pressed'), 'false');
        click('inv-edit');
        await waitFor(() => nestedOf('usual').mode === 'edit', 'Publipostage+ en Édition');
        assertEqual(q('.in-rmail [data-act="inv-edit"]').getAttribute('aria-pressed'), 'true');
        assertIncludes(q('.in-rmail [data-act="inv-edit"]').textContent, 'Revenir à la lecture');
        await wait(250);
        assertEqual(nestedOf('usual').mode, 'edit', 'rien ne le ramène en lecture pendant qu\'on édite');
        assertTrue(frameOf('usual') === frame, 'même iframe : le modèle ouvert est celui de la lecture');
        click('inv-edit');
        await waitFor(() => nestedOf('usual').mode === 'read' && frame.contentDocument.body.classList.contains('pp-clean-reading'), 'lecture épurée rétablie', 6000);
        assertEqual(q('.in-rmail [data-act="inv-edit"]').getAttribute('aria-pressed'), 'false');
        // changer d'élément pendant l'édition ramène la lecture
        click('inv-edit');
        await waitFor(() => nestedOf('usual').mode === 'edit', 'de nouveau en Édition');
        click('inv-pick', { v: 3 });
        await waitFor(() => nestedOf('usual').mode === 'read', 'la lecture revient en quittant l\'élément', 6000);
        assertEqual(q('.in-rmail [data-act="inv-edit"]').getAttribute('aria-pressed'), 'false');
      } finally { s.restore(); }
    });

    it('« Relire » : le mail et le modèle sont relus, avec une iframe neuve', async function () {
      const s = await stage();
      try {
        await setup(withModels());
        step('invitation');
        await ready('usual');
        const frame = frameOf('usual'), reads = s.log.rows.length;
        click('inv-refresh');
        await waitFor(() => s.log.rows.length === reads + 1, 'mail relu');
        await ready('usual', 'lecture après « Relire »');
        assertTrue(frameOf('usual') !== frame, 'iframe neuve');
        assertEqual(dock('usual').querySelectorAll('iframe').length, 1);
      } finally { s.restore(); }
    });
  });
})();
