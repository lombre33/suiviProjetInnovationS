/**
 * Suite de non-régression : mail « Demande de visa » (js/pages/visa-mail.js + enveloppe de la sous-étape Visa de l'UB dans
 * js/pages/page-administratif.js). Le modèle est une ligne de Publipostage_Modeles (type « email ») ; les métadonnées du document
 * (_grist_Tables, _grist_Tables_column) sont posées par chaque test, comme Grist les livre.
 */
(function () {
  'use strict';

  // ── Document simulé ──
  const SCHEMA = {
    Projets: {
      Acronyme: 'Text', Projet: 'Text', Porteur_1: 'Ref:Annuaire', Programme: 'Ref:Programmes', Date_debut_Projet: 'Date',
      Montant_attribue_Total: 'Numeric', Part_Idex: 'Bool', Partenaire_s_convention_reversement: 'RefList:Etablissements',
      convention_statut_UB: 'Choice', Description_rapide_projet: 'Text'
    },
    Annuaire: { NOM: 'Text', Prenom: 'Text', Email: 'Text', nom_et_Prenom: 'Text' },
    Programmes: { Programme: 'Text' },
    Etablissements: { Acronyme: 'Text', Nom_complet: 'Text' },
    Notifications: { Projet: 'Ref:Projets', notifications_Statut: 'Text' }
  };
  const CONVENTIX = 12; // ligne de Projets : UB « Relu », partenaires CNRS et INSERM, aucune fiche Notifications
  const NOTIFY = 11;    // ligne de Projets : a une fiche Notifications (« 5) envoyée pour signature VP »)
  const START_DATE = Date.UTC(2026, 11, 1) / 1000; // 1er décembre 2026

  // Métadonnées : une colonne « gristHelper_Display » dans Projets montre la Référence Porteur_1 (displayCol).
  function installSchema() {
    const tables = { id: [], tableId: [] };
    const cols = { id: [], parentId: [], colId: [], type: [], displayCol: [] };
    let nextCol = 1;
    Object.entries(SCHEMA).forEach(([tableId, columns], index) => {
      const tableRef = index + 1;
      tables.id.push(tableRef); tables.tableId.push(tableId);
      Object.entries(columns).forEach(([colId, type]) => {
        cols.id.push(nextCol++); cols.parentId.push(tableRef); cols.colId.push(colId); cols.type.push(type); cols.displayCol.push(0);
      });
    });
    const helperRef = nextCol++;
    cols.id.push(helperRef); cols.parentId.push(1); cols.colId.push('gristHelper_Display'); cols.type.push('Any'); cols.displayCol.push(0);
    cols.displayCol[cols.colId.indexOf('Porteur_1')] = helperRef;
    window.__mockSetTable('_grist_Tables', tables);
    window.__mockSetTable('_grist_Tables_column', cols);
  }
  async function mutate(name, change) {
    const table = await window.grist.docApi.fetchTable(name);
    change(table);
    window.__mockSetTable(name, table);
  }
  async function installProjects() {
    await mutate('Projets', table => {
      const at = table.id.indexOf(CONVENTIX);
      table.Date_debut_Projet[at] = START_DATE;
      table.Montant_attribue_Total[at] = 25000.5;
      // Ce que montre la Référence Porteur_1 : volontairement différent de Annuaire.nom_et_Prenom.
      table.gristHelper_Display = table.id.map(() => 'Alice M. (affichée)');
    });
    await mutate('Etablissements', table => { table.Acronyme = ['UBX', 'CNRS', 'INSERM']; });
  }

  const badge = (table, column, extra = '') =>
    `<span class="var-badge" contenteditable="false" data-table="${table}" data-column="${column}" data-key="${table}.${column}"${extra}>#${table}.${column}</span>`;
  const jsonAttr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;

  function installModels(models) {
    const rows = models.map((model, index) => Object.assign({ id: index + 1, TypeModele: 'email', Contenu: '', Objet: '', Destinataires: '', Cc: '', Cci: '' }, model));
    const table = { id: rows.map(row => row.id) };
    ['Nom', 'TypeModele', 'Contenu', 'Objet', 'Destinataires', 'Cc', 'Cci'].forEach(key => { table[key] = rows.map(row => row[key]); });
    window.__mockSetTable('Publipostage_Modeles', table);
  }
  const MODEL = 'Demande de visa';
  const parse = url => {
    const [head, query = ''] = url.replace(/^mailto:/, '').split('?');
    const params = {};
    query.split('&').filter(Boolean).forEach(pair => { const [key, ...rest] = pair.split('='); params[key] = decodeURIComponent(rest.join('=')).replace(/\r\n/g, '\n'); });
    return { to: decodeURIComponent(head), params };
  };
  const prepareFor = (id, extra = {}) => window.VisaMail.prepare(Object.assign({ project: { id }, modelName: MODEL }, extra));
  async function setup(models) {
    installSchema();
    await installProjects();
    installModels(models || [{ Nom: MODEL, Contenu: '<p>Bonjour</p>' }]);
  }

  describe('Mail de demande de visa — lien mailto: (texte brut, encodage, Zimbra)', function () {
    it('assemble À, Cc, Cci, objet et corps : virgule des adresses gardée, accents et espaces encodés, retours en CRLF', function () {
      const url = window.VisaMail.buildMailtoUrl({ to: 'a@b.fr; c@d.fr', cc: 'e@f.fr', bcc: 'g@h.fr', subject: 'Visa : Éole', bodyText: 'Bonjour\nMerci' });
      assertTrue(url.startsWith('mailto:a%40b.fr,c%40d.fr?'), 'les deux adresses sont séparées par la virgule littérale');
      assertIncludes(url, 'cc=e%40f.fr');
      assertIncludes(url, 'bcc=g%40h.fr');
      assertIncludes(url, 'subject=Visa%20%3A%20%C3%89ole');
      assertIncludes(url, 'body=Bonjour%0D%0AMerci');
      assertFalse(url.includes('+'), 'aucun « + » pour une espace');
    });

    it('un saut de ligne dans l\'objet ou dans une adresse n\'ajoute jamais d\'en-tête au lien', function () {
      const url = window.VisaMail.buildMailtoUrl({ to: 'a@b.fr\nBcc: pirate@x.fr', subject: 'Objet\r\nBcc: pirate@x.fr', bodyText: 'x' });
      const mail = parse(url);
      assertEqual(mail.to, 'a@b.fr,Bcc: pirate@x.fr', 'le saut de ligne sépare deux « adresses », il ne reste pas dans une');
      assertFalse('bcc' in mail.params, 'aucun champ Bcc ajouté');
      assertEqual(mail.params.subject, 'Objet Bcc: pirate@x.fr', 'le saut de ligne de l\'objet devient une espace');
    });

    it('Zimbra : « cc= » vide en tête, « & », « + », « < » et « > » écrits en forme large', function () {
      const url = window.VisaMail.buildMailtoUrl({ to: 'a@b.fr', subject: 'R&D + test', bodyText: '<ok>', client: 'zimbra' });
      assertTrue(url.startsWith('mailto:a%40b.fr?cc=&subject='), 'cc vide en premier');
      assertEqual(parse(url).params.subject, 'R＆D ＋ test');
      assertEqual(parse(url).params.body, '＜ok＞');
      assertFalse(window.VisaMail.buildMailtoUrl({ to: 'a@b.fr', subject: 'R&D' }).includes('cc='), 'hors Zimbra : aucun champ en plus');
    });

    it('la longueur du lien est comparée à la limite sûre de 2 000 caractères', function () {
      assertTrue(window.VisaMail.checkUrlLength('mailto:a@b.fr').safe);
      const check = window.VisaMail.checkUrlLength('x'.repeat(2001));
      assertFalse(check.safe);
      assertEqual(check.limit, 2000);
    });
  });

  describe('Mail de demande de visa — HTML du modèle en texte brut', function () {
    it('paragraphes, listes, citation et lien : une ligne par ligne de l\'éditeur, mise en forme ignorée', function () {
      const text = window.VisaMail.plainTextFromHtml(
        '<p>Bonjour <strong>Alice</strong>,</p><p></p><ul><li>un</li><li>deux</li></ul><ol><li>premier</li></ol>' +
        '<blockquote><p>cité</p></blockquote><p>Voir <a href="https://exemple.fr/doc">le dossier</a>.</p><h2>Titre</h2>');
      assertEqual(text, 'Bonjour Alice,\n\n• un\n• deux\n1. premier\n> cité\nVoir le dossier (https://exemple.fr/doc).\nTitre');
    });

    it('une image, un style et un script ne laissent rien ; un lien javascript: n\'est jamais écrit', function () {
      const text = window.VisaMail.plainTextFromHtml('<p>a<img src="x.png"><style>p{color:red}</style><script>alert(1)</script></p><p><a href="javascript:alert(1)">clic</a></p>');
      assertEqual(text, 'a\nclic');
    });
  });

  describe('Mail de demande de visa — résolution des variables du modèle', function () {
    it('objet, destinataire par chemin de références, valeurs d\'une Référence, date, nombre français et zéro masqué', async function () {
      await setup([{
        Nom: MODEL, Objet: 'Visa - #Projets.Acronyme', Destinataires: '#Projets.Porteur_1.Email', Cc: 'cc@example.org',
        Contenu: `<p>Projet ${badge('Projets', 'Projet')} porté par ${badge('Projets', 'Porteur_1')}.</p>` +
          `<p>Début : ${badge('Projets', 'Date_debut_Projet')} - montant : ${badge('Projets', 'Montant_attribue_Total')}</p>` +
          `<p>Programme : ${badge('Projets', 'Programme')}</p>`
      }]);
      const draft = await prepareFor(CONVENTIX);
      const mail = parse(draft.url);
      assertEqual(mail.to, 'alice.martin@example.org', 'Porteur_1.Email suit la référence jusqu\'à l\'Annuaire');
      assertEqual(mail.params.cc, 'cc@example.org');
      assertEqual(mail.params.subject, 'Visa - CONVENTIX');
      const lines = mail.params.body.split('\n');
      assertEqual(lines[0], 'Projet Projet Convention porté par Alice M. (affichée).', 'la Référence montre sa colonne d\'affichage Grist');
      assertEqual(lines[1], 'Début : 01/12/2026 - montant : 25 000,5', 'date jj/mm/aaaa, nombre à la française');
      assertEqual(lines[2], 'Programme : Programme A', 'sans colonne d\'affichage, le texte de la ligne référencée');
      assertEqual(draft.issues.length, 0, JSON.stringify(draft.issues));
    });

    it('un nombre nul s\'écrit vide, un Oui/Non en vrai / faux', async function () {
      await setup([{ Nom: MODEL, Contenu: `<p>[${badge('Projets', 'Montant_attribue_Total')}] [${badge('Projets', 'Part_Idex')}]</p>` }]);
      assertEqual(parse((await prepareFor(NOTIFY)).url).params.body, '[5 000] [vrai]');
      assertEqual(parse((await prepareFor(CONVENTIX + 1)).url).params.body, '[] [faux]');
    });

    it('format de la bulle : date en toutes lettres (1er du mois), nombre avec décimales et devise, texte avant / après seulement si la valeur existe', async function () {
      await setup([{
        Nom: MODEL,
        Contenu: `<p>${badge('Projets', 'Date_debut_Projet', jsonAttr('data-format', { type: 'date', preset: 'd_mmmm_yyyy' }))}</p>` +
          `<p>${badge('Projets', 'Montant_attribue_Total', jsonAttr('data-format', { type: 'number', decimals: 2, currency: '€' }))}</p>` +
          `<p>${badge('Projets', 'Description_rapide_projet', ' data-before="Note : " data-after="."')}|${badge('Projets', 'Acronyme', ' data-before="(" data-after=")"')}</p>`
      }]);
      await mutate('Projets', table => { table.Description_rapide_projet[table.id.indexOf(CONVENTIX)] = ''; });
      const lines = parse((await prepareFor(CONVENTIX)).url).params.body.split('\n');
      assertEqual(lines[0], '1er décembre 2026');
      assertEqual(lines[1], '25 000,50 €');
      assertEqual(lines[2], '|(CONVENTIX)', 'texte avant / après d\'une valeur vide : rien');
    });

    it('liste de références : les valeurs sont jointes par une virgule', async function () {
      await setup([{ Nom: MODEL, Contenu: `<p>${badge('Projets', 'Partenaire_s_convention_reversement')}</p><p>${badge('Projets', 'Partenaire_s_convention_reversement.Nom_complet')}</p>` }]);
      await mutate('Etablissements', table => { table.Nom_complet = ['Université', 'Centre', 'Institut']; });
      const lines = parse((await prepareFor(CONVENTIX)).url).params.body.split('\n');
      assertEqual(lines[0], 'CNRS, INSERM');
      assertEqual(lines[1], 'Centre, Institut');
    });

    it('la fiche Notifications du projet est lue en premier : #Notifications.colonne marche, et #Projets.colonne aussi', async function () {
      await setup([{ Nom: MODEL, Contenu: `<p>${badge('Notifications', 'notifications_Statut')} / ${badge('Projets', 'Acronyme')}</p>` }]);
      const draft = await prepareFor(NOTIFY);
      assertEqual(parse(draft.url).params.body, '5) envoyée pour signature VP / NOTIFY');
      assertEqual(draft.issues.length, 0);
    });

    it('une règle « Tables liées » (match, singleton) est suivie ; celle qui lit une colonne absente de la table de la fiche ne s\'applique pas', async function () {
      await setup([{ Nom: MODEL, Contenu: `<p>${badge('Programmes', 'Programme')} / ${badge('Etablissements', 'Acronyme')}</p>` }]);
      window.__mockSetTable('Publipostage_LiensTables', {
        id: [1, 2], TableCible: ['Programmes', 'Etablissements'], TableSource: ['', ''], Mode: ['match', 'singleton'],
        ColonneCible: ['id', ''], ColonneSource: ['Programme', '']
      });
      // CONVENTIX n'a pas de fiche Notifications : la règle lit Projets.Programme (Programme A, ligne 1).
      assertEqual(parse((await prepareFor(CONVENTIX)).url).params.body, 'Programme A / UBX');
      // NOTIFY a une fiche : « Programme » n'est pas une colonne de Notifications, la règle passe au projet (Programme B, ligne 2).
      assertEqual(parse((await prepareFor(NOTIFY)).url).params.body, 'Programme B / UBX');
    });

    it('un champ À à bulle réglée (HTML) et un champ Cc à variable en texte brut donnent les mêmes adresses', async function () {
      await setup([{ Nom: MODEL, Destinataires: `<p class="pp-field">${badge('Projets', 'Porteur_1.Email')}</p>`, Cc: '#Projets.Porteur_1.Email' }]);
      const draft = await prepareFor(CONVENTIX);
      assertEqual(draft.fields.to, 'alice.martin@example.org');
      assertEqual(draft.fields.cc, 'alice.martin@example.org');
    });
  });

  describe('Mail de demande de visa — ce qui est signalé avant d\'ouvrir le brouillon', function () {
    it('une variable sans valeur lisible : repère [?Table.Colonne] dans le texte et vérification listée', async function () {
      await setup([{ Nom: MODEL, Contenu: `<p>${badge('Projets', 'Inexistante')}</p>`, Destinataires: '#Projets.Acronyme' }]);
      const draft = await prepareFor(CONVENTIX);
      assertEqual(parse(draft.url).params.body, '[?Projets.Inexistante]');
      const unresolved = draft.issues.find(issue => issue.kind === 'unresolved');
      assertDeepEqual(unresolved.keys, ['Projets.Inexistante']);
      assertIncludes(window.VisaMail.issueText(unresolved), 'Projets.Inexistante');
      assertTrue(draft.issues.some(issue => issue.kind === 'badAddress'), 'CONVENTIX n\'a pas la forme d\'une adresse e-mail');
    });

    it('condition, boucle, calcul, bloc conditionnel : jamais évalués, toujours signalés', async function () {
      await setup([{
        Nom: MODEL,
        Contenu: `<p>${badge('Projets', 'Acronyme', jsonAttr('data-condition', { mode: 'all', rules: [] }))}</p>` +
          '<p><span class="calc-badge" data-formula="1+1">1+1</span></p><div class="conditional-text"><p>sous condition</p></div>'
      }]);
      const draft = await prepareFor(CONVENTIX);
      const unsupported = draft.issues.find(issue => issue.kind === 'unsupported');
      assertTrue(!!unsupported, 'une vérification « non évalué »');
      assertIncludes(window.VisaMail.issueText(unsupported), 'conditions');
      assertIncludes(window.VisaMail.issueText(unsupported), 'calculs');
      assertEqual(parse(draft.url).params.body.includes('1+1'), false, 'la formule d\'une bulle de calcul n\'est pas écrite dans le mail');
    });

    it('un destinataire prévu mais sans adresse pour ce projet, et un lien trop long, sont signalés', async function () {
      await setup([{ Nom: MODEL, Destinataires: '#Projets.Porteur_1.Email', Contenu: `<p>${'é'.repeat(900)}</p>` }]);
      await mutate('Annuaire', table => { table.Email = ['', '']; });
      const draft = await prepareFor(CONVENTIX);
      const kinds = draft.issues.map(issue => issue.kind);
      assertTrue(kinds.includes('noRecipient'), kinds.join());
      const tooLong = draft.issues.find(issue => issue.kind === 'tooLong');
      assertTrue(!!tooLong && tooLong.length > 2000, 'lien trop long signalé avec sa longueur');
      assertEqual(draft.length, tooLong.length);
    });

    it('un modèle sans destinataire du tout n\'est pas une anomalie (le mail s\'écrit à la main)', async function () {
      await setup([{ Nom: MODEL, Contenu: '<p>Bonjour</p>' }]);
      assertEqual((await prepareFor(CONVENTIX)).issues.length, 0);
    });

    it('modèle absent ou renommé : erreur « model-missing » ; table des modèles absente : « models-table-missing »', async function () {
      await setup([{ Nom: 'Autre modèle', Contenu: '<p>x</p>' }, { Nom: MODEL, TypeModele: 'document', Contenu: '<p>pas un e-mail</p>' }]);
      let code = '';
      try { await prepareFor(CONVENTIX); } catch (err) { code = err.code; }
      assertEqual(code, 'model-missing', 'un modèle de type document ne compte pas');
      code = '';
      // Table réellement absente du document.
      const original = window.grist.docApi.fetchTable;
      window.grist.docApi.fetchTable = async name => { if (name === 'Publipostage_Modeles') throw new Error('Mock Grist: unknown table'); return original(name); };
      try { await prepareFor(CONVENTIX); } catch (err) { code = err.code; } finally { window.grist.docApi.fetchTable = original; }
      assertEqual(code, 'models-table-missing');
    });

    it('la liste des modèles ne propose que les e-mails, sans doublon, par ordre alphabétique (ni documents ni réglages)', async function () {
      await setup([
        { Nom: 'Visa UB' }, { Nom: 'Accord' }, { Nom: 'Visa UB' }, { Nom: 'Courrier', TypeModele: 'document' }, { Nom: 'Réglages', TypeModele: 'reglages' }
      ]);
      assertDeepEqual((await window.VisaMail.listEmailModels()).map(model => model.name), ['Accord', 'Visa UB']);
    });
  });

  // Publipostage+ passe ses tables et ses colonnes à l'anglais (traducteur de l'app, nov. 2026) : un document porte les noms d'avant ou les nouveaux, colonne par colonne.
  describe('Mail et courrier — documents aux noms anglais de Publipostage+ (Publipostage_Templates, Name, Content, TemplateType…)', function () {
    const EN = 'Publipostage_Templates', LINKS_EN = 'Publipostage_TableLinks';
    function installEnglish(models) {
      const rows = models.map((model, index) => Object.assign({ id: index + 1, TemplateType: 'email', Content: '', Subject: '', To: '', Cc: '', Bcc: '' }, model));
      const table = { id: rows.map(row => row.id) };
      ['Name', 'TemplateType', 'Content', 'Subject', 'To', 'Cc', 'Bcc'].forEach(key => { table[key] = rows.map(row => row[key]); });
      window.__mockSetTable(EN, table);
    }
    async function setupEnglish(models) {
      installSchema();
      await installProjects();
      installEnglish(models);
    }

    it('le mail se prépare d\'après un modèle de Publipostage_Templates : objet, destinataire, copie cachée, corps', async function () {
      await setupEnglish([{ Name: MODEL, Subject: 'Visa - #Projets.Acronyme', To: '#Projets.Porteur_1.Email', Cc: 'cc@example.org', Bcc: 'cci@example.org', Content: `<p>Projet ${badge('Projets', 'Projet')}</p>` }]);
      const draft = await prepareFor(CONVENTIX);
      const mail = parse(draft.url);
      assertEqual(mail.to, 'alice.martin@example.org');
      assertEqual(mail.params.cc, 'cc@example.org');
      assertEqual(mail.params.bcc, 'cci@example.org');
      assertEqual(mail.params.subject, 'Visa - CONVENTIX');
      assertEqual(mail.params.body, 'Projet Projet Convention');
      assertEqual(draft.issues.length, 0, JSON.stringify(draft.issues));
    });

    it('les listes proposent les modèles anglais : e-mails, documents, réglages exclus ; le décompte par type est celui de TemplateType', async function () {
      await setupEnglish([
        { Name: 'Visa UB' }, { Name: 'Courrier', TemplateType: 'document' }, { Name: 'Réglages', TemplateType: 'reglages' }, { Name: 'Diapo', TemplateType: 'presentation' }, { Name: 'Accord' }
      ]);
      assertDeepEqual((await window.VisaMail.listEmailModels()).map(model => model.name), ['Accord', 'Visa UB']);
      assertDeepEqual((await window.VisaMail.listDocumentModels()).map(model => model.name), ['Courrier']);
      const overview = await window.VisaMail.modelOverview();
      assertDeepEqual(overview.mail, ['Accord', 'Visa UB']);
      assertDeepEqual(overview.letter, ['Courrier']);
      assertEqual(overview.total, 4);
      assertDeepEqual(overview.counts, { email: 2, document: 1, presentation: 1 });
    });

    it('un document qui porte les deux jeux de noms : les anglais l\'emportent (comme dans l\'app) ; les noms d\'avant servent s\'ils manquent', async function () {
      await setupEnglish([{ Name: 'Modèle anglais' }]);
      installModels([{ Nom: 'Modèle ancien', Contenu: '<p>x</p>' }]);
      assertDeepEqual((await window.VisaMail.listEmailModels()).map(model => model.name), ['Modèle anglais']);
      window.__mockSetTable(EN, { id: [], Name: [], TemplateType: [], Content: [], Subject: [], To: [], Cc: [], Bcc: [] });
      assertDeepEqual((await window.VisaMail.listEmailModels()).map(model => model.name), [], 'la table anglaise, même vide, fait foi');
    });

    it('colonnes mêlées (document en cours de renommage) : « Name » anglais avec « Contenu » et « Objet » d\'avant', async function () {
      installSchema();
      await installProjects();
      window.__mockSetTable(EN, { id: [1], Name: [MODEL], TypeModele: ['email'], Contenu: [`<p>${badge('Projets', 'Acronyme')}</p>`], Objet: ['Sujet #Projets.Acronyme'], Destinataires: ['a@example.org'], Cc: [''], Cci: [''] });
      const mail = parse((await prepareFor(CONVENTIX)).url);
      assertEqual(mail.params.subject, 'Sujet CONVENTIX');
      assertEqual(mail.params.body, 'CONVENTIX');
      assertEqual(mail.to, 'a@example.org');
    });

    it('les règles « Tables liées » se lisent aussi sous leurs noms anglais (Publipostage_TableLinks : TargetTable, SourceColumn…)', async function () {
      await setupEnglish([{ Name: MODEL, Content: `<p>${badge('Programmes', 'Programme')} / ${badge('Etablissements', 'Acronyme')}</p>` }]);
      window.__mockSetTable(LINKS_EN, {
        id: [1, 2], TargetTable: ['Programmes', 'Etablissements'], SourceTable: ['', ''], Mode: ['match', 'singleton'], TargetColumn: ['id', ''], SourceColumn: ['Programme', '']
      });
      assertEqual(parse((await prepareFor(CONVENTIX)).url).params.body, 'Programme A / UBX');
      assertEqual(parse((await prepareFor(NOTIFY)).url).params.body, 'Programme B / UBX');
    });

    it('aucune des deux tables ne se lit : « models-table-missing », avec le nom de chacune et la cause de chaque lecture', async function () {
      installSchema();
      const original = window.grist.docApi.fetchTable;
      window.grist.docApi.fetchTable = async name => { if (name === EN || name === 'Publipostage_Modeles') throw new Error('Table not found "' + name + '"'); return original(name); };
      let error = null;
      try { await window.VisaMail.modelOverview(); } catch (err) { error = err; } finally { window.grist.docApi.fetchTable = original; }
      assertEqual(error && error.code, 'models-table-missing');
      assertIncludes(error.detail, 'Publipostage_Templates : Table not found "Publipostage_Templates"');
      assertIncludes(error.detail, 'Publipostage_Modeles : Table not found "Publipostage_Modeles"');
    });
  });

  describe('Courrier (modèle « document » de Publipostage+) — aperçu en lecture pour la relecture des notifications', function () {
    const DOC = 'Courrier notification';
    const prepareDoc = (id, name) => window.VisaMail.prepareDocument({ project: { id }, modelName: name || DOC });

    it('liste seulement les modèles de type « document », sans doublon, par ordre alphabétique', async function () {
      await setup([
        { Nom: 'Courrier B', TypeModele: 'document' }, { Nom: 'Accord', TypeModele: 'document' }, { Nom: 'Courrier B', TypeModele: 'document' },
        { Nom: 'Un mail', TypeModele: 'email' }, { Nom: 'Réglages', TypeModele: 'reglages' }
      ]);
      assertDeepEqual((await window.VisaMail.listDocumentModels()).map(model => model.name), ['Accord', 'Courrier B']);
    });

    it('remplace les bulles de variables par les valeurs du projet, en gardant la mise en forme du modèle', async function () {
      await setup([{
        Nom: DOC, TypeModele: 'document',
        Contenu: `<h1>Notification</h1><p>Projet <strong>${badge('Projets', 'Acronyme')}</strong> porté par ${badge('Projets', 'Porteur_1')}.</p>` +
          `<p>Début : ${badge('Projets', 'Date_debut_Projet')} - montant : ${badge('Projets', 'Montant_attribue_Total')}</p>`
      }]);
      const res = await prepareDoc(CONVENTIX);
      const holder = document.createElement('div'); holder.innerHTML = res.html;
      assertEqual(holder.querySelector('h1').textContent, 'Notification');
      assertEqual(holder.querySelector('strong').textContent, 'CONVENTIX');
      const words = holder.textContent.replace(/[\u00a0\u202f]/g, ' '); // le nombre français s'écrit avec une espace insécable
      assertIncludes(words, 'porté par Alice M. (affichée).');
      assertIncludes(words, 'Début : 01/12/2026 - montant : 25 000,5');
      assertEqual(holder.querySelector('.var-badge'), null, 'plus aucune bulle de variable');
      assertEqual(res.modelName, DOC);
      assertEqual(res.issues.length, 0, JSON.stringify(res.issues));
    });

    it('les variables sans valeur et ce que le widget n\'évalue pas (conditions, calculs) sont signalés, jamais devinés', async function () {
      await setup([{
        Nom: DOC, TypeModele: 'document',
        Contenu: `<p>${badge('Projets', 'Inexistante')}</p><p>${badge('Projets', 'Acronyme', jsonAttr('data-condition', { mode: 'all', rules: [] }))}</p>` +
          '<p><span class="calc-badge" data-formula="1+1">1+1</span></p>'
      }]);
      const res = await prepareDoc(CONVENTIX);
      assertDeepEqual(res.issues.find(issue => issue.kind === 'unresolved').keys, ['Projets.Inexistante']);
      const unsupported = res.issues.find(issue => issue.kind === 'unsupported');
      assertTrue(!!unsupported);
      assertIncludes(window.VisaMail.issueText(unsupported), 'conditions');
      assertIncludes(window.VisaMail.issueText(unsupported), 'calculs');
    });

    it('lit aussi les colonnes de la fiche Notifications du projet (la table de la vue Publipostage+ habituelle)', async function () {
      await setup([{ Nom: DOC, TypeModele: 'document', Contenu: `<p>${badge('Notifications', 'notifications_Statut')}</p>` }]);
      assertIncludes((await prepareDoc(NOTIFY)).html, '5) envoyée pour signature VP');
    });

    it('modèle absent, ou de type e-mail : erreur « model-missing » ; projet inconnu : « project-missing »', async function () {
      await setup([{ Nom: 'Un mail', TypeModele: 'email', Contenu: '<p>x</p>' }, { Nom: DOC, TypeModele: 'document', Contenu: '<p>x</p>' }]);
      for (const name of ['Introuvable', 'Un mail']) {
        let error = null;
        try { await prepareDoc(CONVENTIX, name); } catch (err) { error = err; }
        assertEqual(error && error.code, 'model-missing', name);
      }
      let missing = null;
      try { await prepareDoc(9999); } catch (err) { missing = err; }
      assertEqual(missing && missing.code, 'project-missing');
    });

    it('le HTML du modèle est nettoyé avant d\'être affiché : ni script, ni cadre, ni gestionnaire d\'événement, ni lien javascript:', async function () {
      await setup([{
        Nom: DOC, TypeModele: 'document',
        Contenu: '<p onclick="alert(1)">Texte</p><script>alert(2)</script><iframe src="https://exemple.fr"></iframe><style>p{color:red}</style>' +
          '<a href="javascript:alert(3)">piège</a><a href=" JaVa\tScript:alert(4)">piège 2</a><img src="https://exemple.fr/a.png" onerror="alert(5)"><a href="https://exemple.fr">sûr</a>'
      }]);
      const holder = document.createElement('div'); holder.innerHTML = (await prepareDoc(CONVENTIX)).html;
      assertEqual(holder.querySelector('script, iframe, style'), null);
      assertFalse(holder.innerHTML.includes('onclick') || holder.innerHTML.includes('onerror'), holder.innerHTML);
      const hrefs = Array.from(holder.querySelectorAll('a')).map(a => a.getAttribute('href'));
      assertDeepEqual(hrefs, [null, null, 'https://exemple.fr']);
      assertEqual(holder.querySelector('img').getAttribute('src'), 'https://exemple.fr/a.png', 'une image normale reste');
      assertEqual(holder.querySelector('p').textContent, 'Texte');
    });

    it('sanitizeHtml : data:text/html retiré des liens et des sources, data:image conservé', function () {
      const root = document.createElement('div');
      root.innerHTML = '<a href="data:text/html;base64,AAAA">x</a><img src="data:image/png;base64,AAAA"><form action="javascript:x()"><input></form>';
      window.VisaMail.sanitizeHtml(root);
      assertEqual(root.querySelector('a').getAttribute('href'), null);
      assertEqual(root.querySelector('img').getAttribute('src'), 'data:image/png;base64,AAAA');
      assertEqual(root.querySelector('form'), null);
    });
  });

  describe('Courrier — macro-modèles de Publipostage+ (un document assemblé : positions fixes et conditionnelles)', function () {
    const MACRO = 'Dossier complet';
    const BREAK = 'page-break-marker';
    const slots = list => JSON.stringify({ slots: list });
    const fixed = modeleId => ({ type: 'fixed', modeleId });
    const rule = (column, operator, value, modeleId) => ({ column, operator, value, modeleId });
    // Les modèles portent les identifiants 1, 2, 3… dans l'ordre : 1 = « Lettre », 2 = « Annexe A », 3 = « Annexe B », 4 = le macro-modèle (ou plus).
    const BASE = [
      { Nom: 'Lettre', TypeModele: 'document', Contenu: `<p id="m1">Lettre ${badge('Projets', 'Acronyme')}</p>` },
      { Nom: 'Annexe A', TypeModele: 'document', Contenu: '<p id="m2">Annexe A</p>' },
      { Nom: 'Annexe B', TypeModele: 'document', Contenu: '<p id="m3">Annexe B</p>' }
    ];
    const withMacro = slotList => BASE.concat([{ Nom: MACRO, TypeModele: 'macro', Contenu: slots(slotList) }]);
    const prepareMacro = id => window.VisaMail.prepareDocument({ project: { id }, modelName: MACRO });
    const parts = html => { const holder = document.createElement('div'); holder.innerHTML = html; return { holder, ids: Array.from(holder.querySelectorAll('p[id]')).map(p => p.id), breaks: holder.querySelectorAll('.' + BREAK).length }; };

    it('le macro-modèle est proposé comme courrier : dans la liste des documents et dans l\'aperçu des modèles, nommé à part', async function () {
      await setup(withMacro([fixed(1)]).concat([{ Nom: 'Un mail', TypeModele: 'email' }]));
      assertDeepEqual((await window.VisaMail.listDocumentModels()).map(model => model.name), ['Annexe A', 'Annexe B', MACRO, 'Lettre']);
      const overview = await window.VisaMail.modelOverview();
      assertDeepEqual(overview.letter, ['Annexe A', 'Annexe B', MACRO, 'Lettre']);
      assertDeepEqual(overview.macros, [MACRO]);
      assertDeepEqual(overview.mail, ['Un mail']);
      assertDeepEqual(overview.counts, { document: 3, macro: 1, email: 1 });
    });

    it('positions fixes : les modèles sont mis l\'un après l\'autre, séparés par un saut de page, et leurs variables sont remplacées', async function () {
      await setup(withMacro([fixed(1), fixed(2)]));
      const res = await prepareMacro(CONVENTIX);
      const doc = parts(res.html);
      assertDeepEqual(doc.ids, ['m1', 'm2']);
      assertEqual(doc.breaks, 1, 'un seul saut entre deux annexes');
      assertEqual(doc.holder.querySelector('#m1').textContent, 'Lettre CONVENTIX');
      assertEqual(res.issues.length, 0, JSON.stringify(res.issues));
      assertTrue(res.macro);
    });

    it('position conditionnelle : la première règle qui convient donne le modèle ; sinon le modèle par défaut', async function () {
      await setup(withMacro([{ type: 'conditional', rules: [rule('Acronyme', '=', 'CONVENTIX', 2), rule('Acronyme', 'contient', 'CON', 3)], defaultModeleId: 1 }]));
      assertDeepEqual(parts((await prepareMacro(CONVENTIX)).html).ids, ['m2'], 'la 1re règle gagne');
      assertDeepEqual(parts((await prepareMacro(NOTIFY)).html).ids, ['m1'], 'aucune règle : le modèle par défaut');
    });

    it('sans modèle par défaut ni règle qui convient : la position est omise, sans saut de page orphelin', async function () {
      await setup(withMacro([fixed(1), { type: 'conditional', rules: [rule('Acronyme', '=', 'Autre', 2)] }, fixed(3)]));
      const doc = parts((await prepareMacro(CONVENTIX)).html);
      assertDeepEqual(doc.ids, ['m1', 'm3']);
      assertEqual(doc.breaks, 1);
    });

    it('les modèles masqués (hiddenModeleIds) sont écartés de la position', async function () {
      await setup(withMacro([{ type: 'conditional', rules: [rule('Acronyme', '=', 'CONVENTIX', 2)], defaultModeleId: 1, hiddenModeleIds: [2] }, fixed(3)]));
      assertDeepEqual(parts((await prepareMacro(CONVENTIX)).html).ids, ['m3']);
    });

    it('règles sur un nombre, une date, un booléen, une liste et une valeur vide : la position retient l\'annexe 2 seulement si la règle convient', async function () {
      await setup(withMacro([fixed(1)]));
      await mutate('Projets', table => { const at = table.id.indexOf(CONVENTIX); table.Part_Idex[at] = true; table.Description_rapide_projet[at] = ''; });
      const matches = async (column, operator, value) => {
        installModels(withMacro([{ type: 'conditional', rules: [rule(column, operator, value, 2)] }]));
        return parts((await prepareMacro(CONVENTIX)).html).ids.length === 1;
      };
      const cases = [
        ['Montant_attribue_Total', '>', '20000', true], ['Montant_attribue_Total', '>', '25000,5', false], ['Montant_attribue_Total', '≥', '25000,5', true],
        ['Montant_attribue_Total', '<', '30000', true], ['Montant_attribue_Total', '≤', '25000', false], ['Montant_attribue_Total', '=', '25000.5', true], ['Montant_attribue_Total', '≠', '25000.5', false],
        ['Date_debut_Projet', '=', '01/12/2026', true], ['Date_debut_Projet', '=', '2026-12-01', true], ['Date_debut_Projet', '<', '2026-12-01', false],
        ['Date_debut_Projet', '≥', '30/11/2026', true], ['Date_debut_Projet', '>', '31/12/2026', false],
        ['Part_Idex', '=', 'oui', true], ['Part_Idex', '=', 'non', false], ['Part_Idex', '≠', 'non', true],
        ['Partenaire_s_convention_reversement', '=', 'CNRS', true], ['Partenaire_s_convention_reversement', '=', 'UBX', false], ['Partenaire_s_convention_reversement', '≠', 'UBX', true],
        ['Acronyme', 'contient', 'vent', true], ['Acronyme', 'contient', 'zzz', false], ['Acronyme', '=', 'conventix', false], ['Acronyme', '≠', 'AUTRE', true],
        ['Description_rapide_projet', 'vide', '', true], ['Description_rapide_projet', 'non vide', '', false], ['Acronyme', 'non vide', '', true]
      ];
      for (const [column, operator, value, expected] of cases) assertEqual(await matches(column, operator, value), expected, `${column} ${operator} « ${value} »`);
    });

    it('une règle qui vise une colonne introuvable ne convient jamais et est signalée', async function () {
      await setup(withMacro([{ type: 'conditional', rules: [rule('Colonne_fantome', '=', 'x', 2)], defaultModeleId: 1 }]));
      const res = await prepareMacro(CONVENTIX);
      assertDeepEqual(parts(res.html).ids, ['m1']);
      assertDeepEqual(res.issues.find(issue => issue.kind === 'unresolved').keys, ['Colonne_fantome']);
    });

    it('une règle qualifiée « Table.Colonne » lit la fiche Notifications du projet', async function () {
      await setup(withMacro([{ type: 'conditional', rules: [rule('Notifications.notifications_Statut', 'contient', 'signature VP', 2)], defaultModeleId: 1 }]));
      assertDeepEqual(parts((await prepareMacro(NOTIFY)).html).ids, ['m2']);
      assertDeepEqual(parts((await prepareMacro(CONVENTIX)).html).ids, ['m1'], 'ce projet n\'a pas de fiche Notifications');
    });

    it('ce que le widget ne sait pas évaluer est signalé : comparaison à une autre colonne, annexe qui n\'est pas un document', async function () {
      // 1 Lettre, 2 Annexe A, 3 Annexe B, 4 le macro-modèle, 5 un e-mail : la position fixe 5 vise un modèle qui n'est pas un document.
      await setup(withMacro([{ type: 'conditional', rules: [{ column: 'Acronyme', operator: '=', valueColumn: 'Projet', modeleId: 2 }], defaultModeleId: 1 }, fixed(5)]).concat([{ Nom: 'Un mail', TypeModele: 'email' }]));
      const res = await prepareMacro(CONVENTIX);
      assertDeepEqual(parts(res.html).ids, ['m1'], 'ni l\'annexe de la règle comparée, ni le mail, ne sont devinés');
      const text = window.VisaMail.issueText(res.issues.find(issue => issue.kind === 'unsupported'));
      assertIncludes(text, 'comparent deux colonnes');
      assertIncludes(text, 'ne sont pas des documents');
    });

    it('une position qui vise un modèle supprimé : l\'annexe manque et c\'est dit', async function () {
      await setup(withMacro([fixed(1), fixed(99)]));
      const res = await prepareMacro(CONVENTIX);
      assertDeepEqual(parts(res.html).ids, ['m1']);
      const issue = res.issues.find(item => item.kind === 'macroModelMissing');
      assertDeepEqual(issue.ids, ['99']);
      assertIncludes(window.VisaMail.issueText(issue), '99');
    });

    it('un macro-modèle au JSON illisible ou sans position donne un courrier vide, sans erreur', async function () {
      await setup(BASE.concat([{ Nom: MACRO, TypeModele: 'macro', Contenu: '{pas du json' }]));
      assertEqual((await prepareMacro(CONVENTIX)).html, '');
      installModels(BASE.concat([{ Nom: MACRO, TypeModele: 'macro', Contenu: '' }]));
      assertEqual((await prepareMacro(CONVENTIX)).html, '');
    });

    it('le HTML des annexes est nettoyé comme celui d\'un document (aucun script)', async function () {
      await setup([{ Nom: 'Piège', TypeModele: 'document', Contenu: '<p>ok</p><script>alert(1)</script>' }, { Nom: MACRO, TypeModele: 'macro', Contenu: slots([fixed(1)]) }]);
      assertEqual(parts((await prepareMacro(CONVENTIX)).html).holder.querySelector('script'), null);
    });

    it('fonctionne aussi avec les noms anglais de Publipostage+ (Publipostage_Templates : Name, Content, TemplateType)', async function () {
      installSchema();
      await installProjects();
      const rows = [
        { id: 1, Name: 'Lettre', TemplateType: 'document', Content: `<p id="m1">Lettre ${badge('Projets', 'Acronyme')}</p>` },
        { id: 2, Name: MACRO, TemplateType: 'macro', Content: slots([fixed(1)]) }
      ];
      const table = { id: rows.map(row => row.id) };
      ['Name', 'TemplateType', 'Content'].forEach(key => { table[key] = rows.map(row => row[key]); });
      window.__mockSetTable('Publipostage_Templates', table);
      assertDeepEqual(parts((await prepareMacro(CONVENTIX)).html).ids, ['m1']);
    });
  });

  describe('Courrier et mail — page du modèle (Margins) et mémoire des lectures pour passer d\'un projet à l\'autre', function () {
    const DOC = 'Courrier notification';
    const withMargins = margins => setup([{ Nom: DOC, TypeModele: 'document', Contenu: '<p>Corps</p>' }]).then(() => {
      const table = { id: [1], Nom: [DOC], TypeModele: ['document'], Contenu: ['<p>Corps</p>'], Objet: [''], Destinataires: [''], Cc: [''], Cci: [''], Margins: [margins] };
      window.__mockSetTable('Publipostage_Modeles', table);
    });
    const pageOf = async margins => { await withMargins(margins); return (await window.VisaMail.prepareDocument({ project: { id: CONVENTIX }, modelName: DOC })).page; };
    const close = (a, b) => Math.abs(a - b) < 0.01;

    it('sans réglage de marges : A4 portrait, marge par défaut de 28 pt', async function () {
      const page = await pageOf('');
      assertEqual(page.widthMm, 210); assertEqual(page.heightMm, 297);
      ['top', 'right', 'bottom', 'left'].forEach(side => assertTrue(close(page.margins[side], 28 * 25.4 / 72), side));
    });

    it('marges en mm, format et sens du modèle (A5, paysage), valeurs aberrantes remplacées par la marge par défaut', async function () {
      const page = await pageOf(JSON.stringify({ top: 20, right: 15.5, bottom: '', left: -3, orientation: 'landscape', format: 'A5' }));
      assertEqual(page.widthMm, 210); assertEqual(page.heightMm, 148, 'A5 paysage');
      assertEqual(page.margins.top, 20); assertEqual(page.margins.right, 15.5);
      assertTrue(close(page.margins.bottom, 28 * 25.4 / 72), 'marge vide : défaut'); assertTrue(close(page.margins.left, 28 * 25.4 / 72), 'marge négative : défaut');
    });

    it('format libre « 190.5x338.7 », JSON illisible = A4, « selon chaque modèle » reste en portrait', async function () {
      const slide = await pageOf(JSON.stringify({ format: '190.5x338.7', orientation: 'landscape' }));
      assertEqual(slide.widthMm, 338.7); assertEqual(slide.heightMm, 190.5);
      const broken = await pageOf('{pas du json');
      assertEqual(broken.widthMm, 210);
      const auto = await pageOf(JSON.stringify({ orientation: 'landscape', orientationAuto: true }));
      assertEqual(auto.widthMm, 210, 'un macro-modèle « selon chaque modèle » : portrait');
    });

    it('un macro-modèle prend ses propres marges (elles priment sur celles des modèles assemblés)', async function () {
      installSchema(); await installProjects();
      window.__mockSetTable('Publipostage_Modeles', {
        id: [1, 2], Nom: ['Lettre', 'Dossier'], TypeModele: ['document', 'macro'], Contenu: ['<p>Lettre</p>', JSON.stringify({ slots: [{ type: 'fixed', modeleId: 1 }] })],
        Objet: ['', ''], Destinataires: ['', ''], Cc: ['', ''], Cci: ['', ''], Margins: [JSON.stringify({ top: 5 }), JSON.stringify({ top: 30, orientation: 'landscape' })]
      });
      const page = (await window.VisaMail.prepareDocument({ project: { id: CONVENTIX }, modelName: 'Dossier' })).page;
      assertEqual(page.margins.top, 30); assertEqual(page.widthMm, 297);
    });

    // Les lectures de Grist (docApi.fetchTable) comptées par table.
    function countReads() {
      const original = window.grist.docApi.fetchTable, reads = {};
      window.grist.docApi.fetchTable = async name => { reads[name] = (reads[name] || 0) + 1; return original(name); };
      return { reads, restore() { window.grist.docApi.fetchTable = original; } };
    }
    const prepareMail = (id, extra) => window.VisaMail.prepare(Object.assign({ project: { id }, modelName: MODEL }, extra));

    it('sans l\'option cache, chaque préparation relit les tables (comportement des autres pages)', async function () {
      await setup();
      window.VisaMail.clearCache();
      const counter = countReads();
      try {
        await prepareMail(CONVENTIX); await prepareMail(CONVENTIX);
        assertEqual(counter.reads.Projets, 2);
        assertEqual(window.VisaMail.peek('mail', { project: { id: CONVENTIX }, modelName: MODEL }), undefined, 'rien n\'est gardé');
      } finally { counter.restore(); }
    });

    it('avec cache : les tables ne sont lues qu\'une fois pour tous les projets, mail et courrier confondus', async function () {
      await setup([{ Nom: MODEL, Contenu: '<p>Bonjour</p>' }, { Nom: 'Courrier', TypeModele: 'document', Contenu: `<p>${badge('Projets', 'Acronyme')}</p>` }]);
      window.VisaMail.clearCache();
      const counter = countReads();
      try {
        await Promise.all([prepareMail(CONVENTIX, { cache: true }), window.VisaMail.prepareDocument({ project: { id: CONVENTIX }, modelName: 'Courrier', cache: true })]);
        await prepareMail(NOTIFY, { cache: true });
        await window.VisaMail.prepareDocument({ project: { id: NOTIFY }, modelName: 'Courrier', cache: true });
        ['Projets', '_grist_Tables', '_grist_Tables_column', 'Notifications'].forEach(name => assertEqual(counter.reads[name], 1, 'lecture de ' + name));
        assertEqual(counter.reads.Publipostage_Modeles, 1, 'la table des modèles');
      } finally { counter.restore(); window.VisaMail.clearCache(); }
    });

    it('peek rend un résultat déjà prêt, tout de suite ; clearCache l\'oublie et les tables se relisent', async function () {
      await setup();
      window.VisaMail.clearCache();
      const args = { project: { id: CONVENTIX }, modelName: MODEL, cache: true };
      assertEqual(window.VisaMail.peek('mail', args), undefined, 'rien avant la première lecture');
      const draft = await prepareMail(CONVENTIX, { cache: true });
      assertEqual(window.VisaMail.peek('mail', args), draft, 'le même résultat');
      assertEqual(window.VisaMail.peek('mail', Object.assign({}, args, { project: { id: NOTIFY } })), undefined, 'un autre projet n\'est pas prêt');
      assertEqual(window.VisaMail.peek('doc', args), undefined, 'ni un autre type');
      window.VisaMail.clearCache();
      assertEqual(window.VisaMail.peek('mail', args), undefined);
      const counter = countReads();
      try { await prepareMail(CONVENTIX, { cache: true }); assertEqual(counter.reads.Projets, 1, 'relue'); } finally { counter.restore(); window.VisaMail.clearCache(); }
    });

    it('une erreur n\'est jamais gardée : le modèle créé ensuite est trouvé à la lecture suivante', async function () {
      await setup([{ Nom: 'Autre', Contenu: '<p>x</p>' }]);
      window.VisaMail.clearCache();
      let error = null;
      try { await prepareMail(CONVENTIX, { cache: true }); } catch (err) { error = err; }
      assertEqual(error && error.code, 'model-missing');
      installModels([{ Nom: MODEL, Contenu: '<p>Bonjour</p>' }]);
      window.VisaMail.clearCache(); // les modèles viennent d'être écrits : le bouton « Relire » vide la mémoire
      assertEqual((await prepareMail(CONVENTIX, { cache: true })).modelName, MODEL);
      window.VisaMail.clearCache();
    });

    it('revenir sur la fenêtre du widget (focus) vide la mémoire : on revient peut-être d\'une modification dans Grist', async function () {
      await setup();
      window.VisaMail.clearCache();
      await prepareMail(CONVENTIX, { cache: true });
      assertTrue(!!window.VisaMail.peek('mail', { project: { id: CONVENTIX }, modelName: MODEL }));
      window.dispatchEvent(new Event('focus'));
      assertEqual(window.VisaMail.peek('mail', { project: { id: CONVENTIX }, modelName: MODEL }), undefined);
    });
  });

  describe('Mail de demande de visa — enveloppe de la sous-étape « Visa » (page Administratif)', function () {
    const anyCard = acronym => Array.from(document.querySelectorAll('#admin-col-conv .admin-card'))
      .find(card => card.querySelector('.admin-card-identity .project-acronym')?.textContent === acronym);
    async function showCard(acronym, changes) {
      const tables = await window.CoreGrist.loadAllTables();
      tables.Projets.forEach(project => { project.Convention_de_reversement = true; });
      Object.assign(tables.Projets.find(project => project.Acronyme === acronym), changes);
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      return anyCard(acronym);
    }
    // Les écritures du widget dans Preferences_Widget qui portent la colonne `key` (celles que le test fait lui-même pour préparer l'état sont écartées).
    const allPrefsWrites = () => window.__TEST_CALLS__.filter(call => call.type === 'UpdateRecord' && call.table === 'Preferences_Widget');
    const prefsWrites = (key = 'Mail_visa_modele') => allPrefsWrites().filter(call => key in call.fields);
    let setupWrites = 0;
    async function retainMailPrefs(fields) {
      const row = (await window.CoreGrist.getTable('Preferences_Widget'))[0];
      await window.grist.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', row.id, fields]]);
      setupWrites = allPrefsWrites().length;
      await window.loadAdministratifUserPreferences();
    }
    // Écritures faites par le widget lui-même, après la préparation de l'état par le test.
    const newPrefsWrites = (key) => allPrefsWrites().slice(setupWrites).filter(call => key in call.fields);
    const popoverOf = () => document.querySelector('.admin-popover');
    const clearToast = () => { document.getElementById('toast').textContent = ''; };
    async function withOpenLink(run) {
      const opened = [];
      const original = window.VisaMail.openLink;
      window.VisaMail.openLink = url => { opened.push(url); };
      try { await run(opened); } finally { window.VisaMail.openLink = original; }
    }
    const SIGNATURE = { convention_statut_UB: 'en cours de signature' };

    it('l\'enveloppe est sur la même ligne que la pastille « Visa » (pas de ligne en plus) et seulement à ce statut', async function () {
      await setup();
      const card = await showCard('CONVENTIX', SIGNATURE);
      const mail = card.querySelector('.admin-step-mail');
      assertTrue(!!mail, 'enveloppe présente');
      assertEqual(mail.parentElement.className, 'admin-step-row');
      assertTrue(mail.parentElement.contains(card.querySelector('[data-pop-anchor^="step-visa:"]')), 'dans la rangée de « Visa »');
      assertEqual(card.querySelectorAll('.admin-steps > *').length, 2, 'deux lignes : Visa (avec l\'enveloppe) et Parapheur');
      assertIncludes(mail.getAttribute('aria-label'), 'CONVENTIX');
      assertFalse(!!(await showCard('CONVENTIX', { convention_statut_UB: 'Relu' })).querySelector('.admin-step-mail'), 'Relu : pas d\'enveloppe');
      assertFalse(!!(await showCard('CONVENTIX', { convention_statut_UB: 'Signé' })).querySelector('.admin-step-mail'), 'Signé : pas d\'enveloppe');
    });

    it('sans modèle retenu : un clic ouvre le choix du modèle (e-mails seulement), le choix est enregistré par utilisateur, puis le mail s\'ouvre', async function () {
      await setup([{ Nom: MODEL, Contenu: '<p>Bonjour</p>', Destinataires: 'vp@example.org' }, { Nom: 'Courrier', TypeModele: 'document' }]);
      await window.loadAdministratifUserPreferences();
      const card = await showCard('CONVENTIX', SIGNATURE);
      await withOpenLink(async opened => {
        fireMouse(card.querySelector('.admin-step-mail'), 'click');
        await waitFor(() => popoverOf()?.querySelector('[data-visa-model]:not([disabled])'), 'liste des modèles');
        const select = popoverOf().querySelector('[data-visa-model]');
        assertDeepEqual(Array.from(select.options).map(option => option.value), ['', MODEL], 'le document « Courrier » n\'est pas proposé');
        assertTrue(popoverOf().querySelector('[data-visa-open]').disabled, 'rien à ouvrir tant qu\'aucun modèle n\'est choisi');
        select.value = MODEL;
        fire(select, 'change');
        await waitFor(() => prefsWrites().length === 1, 'préférence enregistrée');
        assertEqual(prefsWrites()[0].fields.Mail_visa_modele, MODEL);
        assertFalse(popoverOf().querySelector('[data-visa-open]').disabled);
        fireMouse(popoverOf().querySelector('[data-visa-open]'), 'click');
        await waitFor(() => opened.length === 1, 'brouillon ouvert');
        assertTrue(opened[0].startsWith('mailto:vp%40example.org?'), opened[0]);
        assertEqual(popoverOf(), null, 'le popover se ferme');
      });
    });

    it('le modèle est retenu : un clic suivant ouvre directement le brouillon, sans fenêtre, et le dit', async function () {
      await setup([{ Nom: MODEL, Contenu: '<p>Visa pour #</p>', Objet: 'Visa #Projets.Acronyme', Destinataires: 'vp@example.org' }]);
      await window.loadAdministratifUserPreferences();
      const row = (await window.CoreGrist.getTable('Preferences_Widget'))[0];
      await window.grist.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', row.id, { Mail_visa_modele: MODEL }]]);
      await window.loadAdministratifUserPreferences();
      const card = await showCard('CONVENTIX', SIGNATURE);
      clearToast();
      await withOpenLink(async opened => {
        fireMouse(card.querySelector('.admin-step-mail'), 'click');
        await waitFor(() => opened.length === 1, 'brouillon ouvert');
        assertEqual(parse(opened[0]).params.subject, 'Visa CONVENTIX');
        assertEqual(popoverOf(), null, 'aucune fenêtre quand tout est en ordre');
        assertIncludes(document.getElementById('toast').textContent, 'CONVENTIX');
      });
    });

    it('une vérification (variable sans valeur) ouvre une fenêtre qui la dit ; rien n\'est ouvert avant « Ouvrir quand même »', async function () {
      await setup([{ Nom: MODEL, Contenu: `<p>${badge('Projets', 'Inexistante')}</p>`, Destinataires: 'vp@example.org' }]);
      await window.loadAdministratifUserPreferences();
      const row = (await window.CoreGrist.getTable('Preferences_Widget'))[0];
      await window.grist.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', row.id, { Mail_visa_modele: MODEL }]]);
      await window.loadAdministratifUserPreferences();
      const card = await showCard('CONVENTIX', SIGNATURE);
      await withOpenLink(async opened => {
        fireMouse(card.querySelector('.admin-step-mail'), 'click');
        await waitFor(() => popoverOf()?.querySelector('.admin-pop-notice'), 'vérification affichée');
        assertIncludes(popoverOf().querySelector('.admin-pop-notice').textContent, 'Projets.Inexistante');
        assertEqual(opened.length, 0, 'rien d\'ouvert tant que la personne ne l\'a pas voulu');
        assertEqual(popoverOf().querySelector('[data-visa-open]').textContent, 'Ouvrir quand même');
        await waitFor(() => !popoverOf().querySelector('[data-visa-model]').disabled, 'liste des modèles');
        fireMouse(popoverOf().querySelector('[data-visa-open]'), 'click');
        await waitFor(() => opened.length === 1, 'brouillon ouvert malgré la vérification');
        assertIncludes(parse(opened[0]).params.body, '[?Projets.Inexistante]');
      });
    });

    it('un modèle retenu qui n\'existe plus : la fenêtre le dit et propose les modèles actuels', async function () {
      await setup([{ Nom: 'Autre modèle' }]);
      await window.loadAdministratifUserPreferences();
      const row = (await window.CoreGrist.getTable('Preferences_Widget'))[0];
      await window.grist.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', row.id, { Mail_visa_modele: 'Ancien nom' }]]);
      await window.loadAdministratifUserPreferences();
      const card = await showCard('CONVENTIX', SIGNATURE);
      await withOpenLink(async opened => {
        fireMouse(card.querySelector('.admin-step-mail'), 'click');
        await waitFor(() => popoverOf()?.querySelector('.admin-pop-notice'), 'fenêtre');
        assertIncludes(popoverOf().querySelector('.admin-pop-notice').textContent, 'Ancien nom');
        await waitFor(() => Array.from(popoverOf().querySelectorAll('[data-visa-model] option')).some(option => option.value === 'Autre modèle'), 'modèles actuels');
        assertEqual(opened.length, 0);
      });
    });

    it('« Ma messagerie est Zimbra » est enregistré par utilisateur et change le lien', async function () {
      await setup([{ Nom: MODEL, Contenu: '<p>Visa</p>', Destinataires: 'vp@example.org' }]);
      await window.loadAdministratifUserPreferences();
      await retainMailPrefs({ Mail_visa_modele: MODEL });
      const card = await showCard('CONVENTIX', SIGNATURE);
      // Le clic sur l'enveloppe ouvre directement le brouillon ; les réglages passent par la date de « Visa ».
      fireMouse(card.querySelector('[data-pop-anchor^="step-visa:"]'), 'click');
      await waitFor(() => popoverOf()?.querySelector('[data-pop-visa-settings]'), 'popover de la date');
      fireMouse(popoverOf().querySelector('[data-pop-visa-settings]'), 'click');
      await waitFor(() => popoverOf()?.querySelector('[data-visa-zimbra]'), 'réglages du mail');
      const checkbox = popoverOf().querySelector('[data-visa-zimbra]');
      checkbox.checked = true;
      fire(checkbox, 'change');
      await waitFor(() => newPrefsWrites('Mail_visa_client').length === 1, 'préférence enregistrée');
      assertEqual(newPrefsWrites('Mail_visa_client')[0].fields.Mail_visa_client, 'zimbra');
      assertTrue(!('Mail_visa_modele' in newPrefsWrites('Mail_visa_client')[0].fields) || newPrefsWrites('Mail_visa_client')[0].fields.Mail_visa_modele === MODEL, 'le modèle retenu n\'est pas effacé');
      await withOpenLink(async opened => {
        await waitFor(() => !popoverOf().querySelector('[data-visa-open]').disabled, 'bouton Ouvrir');
        fireMouse(popoverOf().querySelector('[data-visa-open]'), 'click');
        await waitFor(() => opened.length === 1, 'brouillon ouvert');
        assertTrue(opened[0].startsWith('mailto:vp%40example.org?cc=&'), opened[0]);
      });
    });

    it('les préférences enregistrées sont relues au démarrage (modèle et messagerie)', async function () {
      await setup([{ Nom: MODEL, Contenu: '<p>Visa</p>', Destinataires: 'vp@example.org' }]);
      await window.loadAdministratifUserPreferences();
      const row = (await window.CoreGrist.getTable('Preferences_Widget'))[0];
      await window.grist.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', row.id, { Mail_visa_modele: MODEL, Mail_visa_client: 'zimbra' }]]);
      await window.loadAdministratifUserPreferences();
      const card = await showCard('CONVENTIX', SIGNATURE);
      await withOpenLink(async opened => {
        fireMouse(card.querySelector('.admin-step-mail'), 'click');
        await waitFor(() => opened.length === 1, 'brouillon ouvert');
        assertTrue(opened[0].includes('?cc=&'), 'messagerie Zimbra relue');
      });
    });

    it('la date de « Visa » garde son fonctionnement : le lien « choisir le modèle » est à côté, la date s\'enregistre toujours', async function () {
      await setup();
      const card = await showCard('CONVENTIX', SIGNATURE);
      fireMouse(card.querySelector('[data-pop-anchor^="step-visa:"]'), 'click');
      await waitFor(() => popoverOf()?.querySelector('.admin-pop-date-input'), 'popover de la date');
      assertTrue(!!popoverOf().querySelector('[data-pop-visa-settings]'), 'lien vers les réglages du mail');
      fireMouse(popoverOf().querySelector('[data-pop-today]'), 'click');
      await waitFor(() => window.__TEST_CALLS__.some(call => call.type === 'UpdateRecord' && call.table === 'Projets' && 'convention_UB_visa_le' in call.fields), 'date écrite');
      // Les autres sous-étapes n'ont pas ce lien.
      fireMouse(anyCard('CONVENTIX').querySelector('[data-pop-anchor^="step-parapheur:"]'), 'click');
      await waitFor(() => popoverOf()?.querySelector('.admin-pop-date-input'), 'popover du parapheur');
      assertFalse(!!popoverOf().querySelector('[data-pop-visa-settings]'), 'seul « Visa » porte le lien');
    });
  });
}());
