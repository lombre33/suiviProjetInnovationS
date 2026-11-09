/**
 * Non-regression suite : outil de signature du Vice-Président (dossier signature/, URL dédiée).
 *
 * Les tests de PDF utilisent les vraies bibliothèques embarquées (pdf-lib pour fabriquer et incruster,
 * pdf.js pour lire et dessiner) : la position de la signature se vérifie sur les pixels de la page
 * rendue, pas sur des nombres recalculés par le code testé.
 */
(function () {
  'use strict';

  const U = window.SigUtil;
  const A = window.SigAcl;
  const P = window.SigPdf;

  // ---------------------------------------------------------------- aides communes

  async function makePdf(pages) {
    const { PDFDocument, StandardFonts, degrees } = window.PDFLib;
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    pages.forEach(spec => {
      const page = doc.addPage([595, 842]);
      if (spec.rotate) page.setRotation(degrees(spec.rotate));
      (spec.texts || []).forEach(t => page.drawText(t.text, { x: t.x, y: t.y, size: t.size || 12, font }));
    });
    return new Uint8Array(await doc.save());
  }

  function canvasBytes(width, height, color, mime) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    return new Promise(resolve => canvas.toBlob(async blob => resolve(new Uint8Array(await blob.arrayBuffer())), mime || 'image/png'));
  }

  const isRed = (r, g, b) => r > 200 && g < 60 && b < 60;
  const isBlue = (r, g, b) => b > 200 && r < 60 && g < 60;

  // Rend la page `number` à l'échelle 1 et renvoie la boîte des pixels qui passent `test` (rouge par défaut : la signature de test).
  async function colorBox(pdfBytes, number, test) {
    const doc = await P.openPdf(pdfBytes);
    try {
      const page = await doc.getPage(number || 1);
      const viewport = page.getViewport({ scale: 1 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let left = width, top = height, right = -1, bottom = -1;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;
          if (test(data[i], data[i + 1], data[i + 2])) {
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
          }
        }
      }
      return right < 0 ? null : { left, top, right: right + 1, bottom: bottom + 1, width: right + 1 - left, height: bottom + 1 - top };
    } finally {
      doc.destroy();
    }
  }

  const redBox = (pdfBytes, number) => colorBox(pdfBytes, number, isRed);

  // Image asymétrique : moitié gauche rouge, moitié droite bleue (pour vérifier le sens de l'image posée).
  function halvesBytes(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, width / 2, height);
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(width / 2, 0, width / 2, height);
    return new Promise(resolve => canvas.toBlob(async blob => resolve(new Uint8Array(await blob.arrayBuffer())), 'image/png'));
  }

  async function pageText(pdfBytes, number) {
    const doc = await P.openPdf(pdfBytes);
    try {
      const page = await doc.getPage(number || 1);
      return (await page.getTextContent()).items.map(item => item.str).join('');
    } finally {
      doc.destroy();
    }
  }

  const near = (actual, expected, tolerance, label) => {
    if (Math.abs(actual - expected) > tolerance) throw new Error(`${label || 'valeur'} : attendu ≈ ${expected} (± ${tolerance}), obtenu ${actual}`);
  };

  async function rejects(promise, code) {
    try {
      await promise;
    } catch (err) {
      assertEqual(err && err.code, code, `code d'erreur (${err && err.message})`);
      return err;
    }
    throw new Error(`une erreur « ${code} » était attendue`);
  }

  window.__sigTestKit = { makePdf, canvasBytes, halvesBytes, colorBox, redBox, isRed, isBlue, pageText, near, rejects };

  // ---------------------------------------------------------------- util

  describe('Signature — outils communs (util.js)', function () {
    it('normalizeText : sans accents, casse ni ponctuation', function () {
      assertEqual(U.normalizeText('  Le  Vice-Président, '), 'levicepresident');
      assertEqual(U.normalizeText('ÉLÈVE – Œuvre'), 'eleveuvre');
      assertEqual(U.normalizeText(null), '');
    });

    it('toDate / formatDate : secondes Grist, millisecondes, texte ISO ; date seule en UTC', function () {
      const seconds = Date.UTC(2026, 9, 14) / 1000;
      assertEqual(U.formatDate(seconds, { utc: true }), '14/10/2026');
      assertEqual(U.formatDate(seconds * 1000, { utc: true }), '14/10/2026');
      assertEqual(U.formatDate('2026-10-14T00:00:00Z', { utc: true }), '14/10/2026');
      assertEqual(U.formatDate(null), '');
      assertEqual(U.formatDate('pas une date'), '');
      assertTrue(U.formatDate(seconds + 3600 * 10 + 60 * 5, { utc: true, time: true }).endsWith(' à 10:05'));
    });

    it('formatMoney : euros sans décimales, vide si ce n\'est pas un nombre', function () {
      assertEqual(U.formatMoney(185000), '185 000 €');
      assertEqual(U.formatMoney('96500'), '96 500 €');
      assertEqual(U.formatMoney(''), '');
      assertEqual(U.formatMoney('abc'), '');
      assertEqual(U.formatMoney(null), '');
    });

    it('attachmentIds / encodeAttachments : cellule Grist ["L", ...]', function () {
      assertDeepEqual(U.attachmentIds(['L', 3, 4]), [3, 4]);
      assertDeepEqual(U.attachmentIds([5]), [5]);
      assertDeepEqual(U.attachmentIds(7), [7]);
      assertDeepEqual(U.attachmentIds(null), []);
      assertDeepEqual(U.attachmentIds(['L']), []);
      assertDeepEqual(U.attachmentIds(['L', 'x', 0, -2]), []);
      assertDeepEqual(U.encodeAttachments([9]), ['L', 9]);
    });

    it('sniffImage / isPdf : le type se lit dans les octets, jamais dans le nom', async function () {
      assertEqual(U.sniffImage(await canvasBytes(4, 4, '#f00', 'image/png')), 'png');
      assertEqual(U.sniffImage(await canvasBytes(4, 4, '#f00', 'image/jpeg')), 'jpeg');
      assertEqual(U.sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
      assertEqual(U.sniffImage(null), null);
      assertTrue(U.isPdf(await makePdf([{}])));
      assertFalse(U.isPdf(new TextEncoder().encode('<html>pas un pdf</html>')));
    });

    it('signedName : suffixe _signe, sans doublon ni caractère de chemin', function () {
      assertEqual(U.signedName('Notification_AERIS.pdf'), 'Notification_AERIS_signe.pdf');
      assertEqual(U.signedName('Notification_AERIS_signe.pdf'), 'Notification_AERIS_signe.pdf');
      assertEqual(U.signedName('../a/b.pdf'), '.._a_b_signe.pdf');
      assertEqual(U.signedName(''), 'notification_signe.pdf');
    });

    it('tableRows : colonnes de fetchTable -> lignes ; table vide ou absente -> []', function () {
      assertDeepEqual(U.tableRows({ id: [1, 2], A: ['x', 'y'] }), [{ id: 1, A: 'x' }, { id: 2, A: 'y' }]);
      assertDeepEqual(U.tableRows({ id: [] }), []);
      assertDeepEqual(U.tableRows(null), []);
    });
  });

  // ---------------------------------------------------------------- acl

  describe('Signature — table privée et règles d\'accès (acl.js)', function () {
    const COLUMNS = ['id', 'manualSort', 'Image', 'Repere'];
    const ownRule = (id, resource, position) => ({ id, resource, aclFormula: 'user.Access != OWNER', permissionsText: '-CRUD', memo: A.MEMO, rulePos: position });
    const resource = { id: 5, tableId: 'Signature_VP', colIds: '*' };

    it('la règle voulue refuse tout (lecture comprise) à qui n\'est pas propriétaire, sur la seule table de la signature', function () {
      const rules = A.wantedRules();
      assertEqual(rules.length, 1);
      assertEqual(rules[0].tableId, 'Signature_VP');
      assertEqual(rules[0].colIds, '*');
      assertEqual(rules[0].aclFormula, 'user.Access != OWNER');
      assertEqual(rules[0].permissionsText, '-CRUD');
    });

    it('status : table absente, colonne manquante, règle absente, tout en place', function () {
      assertEqual(A.status({ columns: null, resources: [], rules: [] }), 'no-table');
      assertEqual(A.status({ columns: ['id', 'Image'], resources: [resource], rules: [ownRule(1, 5, -2)] }), 'no-table');
      assertEqual(A.status({ columns: COLUMNS, resources: [], rules: [] }), 'no-rules');
      assertEqual(A.status({ columns: COLUMNS, resources: [resource], rules: [ownRule(1, 5, -2)] }), 'ok');
    });

    it('status : une règle modifiée à la main (formule ou droits) ne compte plus comme protection', function () {
      const loosened = { ...ownRule(1, 5, -2), permissionsText: '-CUD' };
      assertEqual(A.status({ columns: COLUMNS, resources: [resource], rules: [loosened] }), 'no-rules');
      const otherFormula = { ...ownRule(1, 5, -2), aclFormula: 'user.Access == VIEWER' };
      assertEqual(A.status({ columns: COLUMNS, resources: [resource], rules: [otherFormula] }), 'no-rules');
    });

    it('tableActions : crée la table, ou seulement les colonnes qui manquent', function () {
      const create = A.tableActions(null);
      assertEqual(create.length, 1);
      assertEqual(create[0][0], 'AddTable');
      assertEqual(create[0][1], 'Signature_VP');
      assertDeepEqual(create[0][2].map(col => [col.id, col.type]), [['Image', 'Attachments'], ['Repere', 'Text']]);
      assertDeepEqual(A.tableActions(['id', 'Image']), [['AddColumn', 'Signature_VP', 'Repere', { type: 'Text' }]]);
      assertDeepEqual(A.tableActions(COLUMNS), []);
    });

    it('ruleActions : crée la ressource et la règle, placée AVANT toutes les autres', function () {
      const others = [{ id: 1, resource: 1, aclFormula: 'True', permissionsText: '+CRUDS', rulePos: 1 }, { id: 2, resource: 2, aclFormula: '', permissionsText: '-R', rulePos: -3 }];
      const actions = A.ruleActions([{ id: 1, tableId: '*', colIds: '*' }, { id: 2, tableId: 'Autre', colIds: '*' }], others);
      assertEqual(actions[0][0], 'AddRecord');
      assertEqual(actions[0][1], '_grist_ACLResources');
      assertDeepEqual(actions[0][3], { tableId: 'Signature_VP', colIds: '*' });
      const bulk = actions[1];
      assertEqual(bulk[0], 'BulkAddRecord');
      assertEqual(bulk[1], '_grist_ACLRules');
      assertDeepEqual(bulk[3].resource, [actions[0][2]]);
      assertTrue(bulk[3].rulePos[0] < -3, 'la règle doit précéder la plus prioritaire des règles existantes');
      assertDeepEqual(bulk[3].memo, [A.MEMO]);
    });

    it('ruleActions : rien à faire si la règle est déjà là (changer une règle recharge le document)', function () {
      assertDeepEqual(A.ruleActions([resource], [ownRule(1, 5, -2)]), []);
    });

    it('ruleActions : une règle périmée est retirée puis reposée ; les règles d\'autrui ne sont jamais touchées', function () {
      const stale = { ...ownRule(1, 5, -2), permissionsText: '-CUD' };
      const foreign = { id: 2, resource: 5, aclFormula: 'True', permissionsText: '+R', rulePos: 4, memo: 'Autre outil' };
      const actions = A.ruleActions([resource], [stale, foreign]);
      assertDeepEqual(actions[0], ['BulkRemoveRecord', '_grist_ACLRules', [1]]);
      assertTrue(actions.every(action => !JSON.stringify(action).includes('Autre outil')), 'la règle d\'un autre outil reste intacte');
      const bulk = actions.find(action => action[0] === 'BulkAddRecord');
      assertDeepEqual(bulk[3].resource, [5], 'la ressource existante est réutilisée');
    });

    it('editorsEditStructure : vrai par défaut, faux si la case « éditeurs et structure » est décochée', function () {
      const star = { id: 1, tableId: '*', colIds: '*' };
      assertTrue(A.editorsEditStructure([star], []));
      assertFalse(A.editorsEditStructure([star], [{ id: 1, resource: 1, aclFormula: 'user.Access != OWNER', permissionsText: '-S', rulePos: 1 }]));
    });
  });

  // ---------------------------------------------------------------- incrustation PDF

  describe('Signature — repère de texte et incrustation (pdf-stamp.js)', function () {
    const items = (...pieces) => pieces.map(str => ({ str }));

    it('matchItems : repère coupé en morceaux, autres accents, autre casse ; dernière occurrence retenue', function () {
      const needle = U.normalizeText('Le Vice-Président,');
      const split = P.matchItems(items('Le Vice-', 'Pr', 'ésident,'), needle);
      assertEqual(split.length, 3);
      assertEqual(P.matchItems(items('LE VICE PRESIDENT'), needle).length, 1);
      const twice = P.matchItems(items('Le Vice-Président, ouvre', 'puis', 'Le Vice-Président,'), needle);
      assertEqual(twice.length, 1);
      assertEqual(twice[0].str, 'Le Vice-Président,');
      assertEqual(P.matchItems(items('Le Président'), needle), null);
    });

    it('findAnchor : retrouve le repère coupé en deux morceaux, en coordonnées visuelles', async function () {
      const pdf = await makePdf([{ texts: [{ text: 'Le Vice-', x: 60, y: 200 }, { text: 'Président,', x: 112, y: 200 }] }]);
      const anchor = await P.findAnchor(pdf, 'Le Vice-Président,');
      assertTrue(!!anchor, 'repère trouvé');
      assertEqual(anchor.pageIndex, 0);
      near(anchor.box.left, 60, 1, 'bord gauche du repère');
      near(anchor.box.bottom, 842 - 200, 6, 'bas du repère (origine en haut)');
    });

    it('findAnchor : plusieurs pages, la dernière occurrence l\'emporte ; repère absent -> null ; repère vide refusé', async function () {
      const pdf = await makePdf([
        { texts: [{ text: 'Le Vice-Président,', x: 60, y: 300 }] },
        { texts: [{ text: 'Le Vice-Président,', x: 60, y: 400 }] },
        { texts: [{ text: 'Rien ici', x: 60, y: 400 }] },
      ]);
      assertEqual((await P.findAnchor(pdf, 'le vice president')).pageIndex, 1);
      assertEqual(await P.findAnchor(pdf, 'Le Secrétaire général'), null);
      await rejects(P.findAnchor(pdf, '  ,; '), 'anchor-empty');
    });

    it('sign : l\'image se pose JUSTE SOUS le repère, alignée à gauche, à la taille prévue', async function () {
      const pdf = await makePdf([{ texts: [{ text: 'Le Vice-Président,', x: 60, y: 200 }] }]);
      const image = await canvasBytes(200, 80, '#ff0000', 'image/png');
      const signed = await P.sign({ pdfBytes: pdf, imageBytes: image, anchorText: 'Le Vice-Président,', when: new Date(2026, 10, 9, 17, 42) });
      const box = await redBox(signed, 1);
      assertTrue(!!box, 'la signature rouge doit apparaître sur la page rendue');
      near(box.left, 60, 3, 'bord gauche');
      near(box.width, 160, 3, 'largeur (plafonnée par la hauteur maxi de 64 pt)');
      near(box.height, 64, 3, 'hauteur');
      near(box.top, 842 - 200 + 12 * 0.22 + P.LAYOUT.gap, 4, 'haut de la signature, sous le repère');
      assertTrue(box.top > 842 - 200, 'sous la ligne de base du repère, jamais dessus');
    });

    it('sign : ligne « Signé électroniquement le … » sous l\'image, le texte d\'origine intact', async function () {
      const pdf = await makePdf([{ texts: [{ text: 'Le Vice-Président,', x: 60, y: 200 }, { text: 'Corps de la notification', x: 60, y: 700 }] }]);
      const image = await canvasBytes(120, 40, '#ff0000', 'image/png');
      const signed = await P.sign({ pdfBytes: pdf, imageBytes: image, anchorText: 'Le Vice-Président,', when: new Date(2026, 10, 9, 17, 42) });
      const text = await pageText(signed, 1);
      assertIncludes(text, 'Signé électroniquement le 09/11/2026 à 17:42');
      assertIncludes(text, 'Corps de la notification');
      assertIncludes(text, 'Le Vice-Président,');
    });

    it('sign : un JPEG est accepté comme un PNG', async function () {
      const pdf = await makePdf([{ texts: [{ text: 'Le Vice-Président,', x: 60, y: 200 }] }]);
      const signed = await P.sign({ pdfBytes: pdf, imageBytes: await canvasBytes(100, 50, '#ff0000', 'image/jpeg'), anchorText: 'Le Vice-Président,' });
      assertTrue(!!(await redBox(signed, 1)), 'signature JPEG visible');
    });

    it('sign : seule la page du repère change (dernière page), les autres sont conservées', async function () {
      const pdf = await makePdf([{ texts: [{ text: 'Page 1', x: 60, y: 700 }] }, { texts: [{ text: 'Le Vice-Président,', x: 60, y: 300 }] }]);
      const signed = await P.sign({ pdfBytes: pdf, imageBytes: await canvasBytes(100, 50, '#ff0000'), anchorText: 'Le Vice-Président,' });
      assertEqual(await redBox(signed, 1), null, 'page 1 sans signature');
      assertTrue(!!(await redBox(signed, 2)), 'signature sur la page du repère');
    });

    it('sign : page tournée à 90° — la signature reste sous le repère tel qu\'on le voit, à l\'endroit', async function () {
      const pdf = await makePdf([{ rotate: 90, texts: [{ text: 'Le Vice-Président,', x: 100, y: 300 }] }]);
      const anchor = await P.findAnchor(pdf, 'Le Vice-Président,');
      assertEqual(anchor.view.rotation, 90);
      const signed = await P.sign({ pdfBytes: pdf, imageBytes: await canvasBytes(200, 80, '#ff0000'), anchorText: 'Le Vice-Président,' });
      const box = await redBox(signed, 1);
      assertTrue(!!box, 'signature visible sur la page tournée');
      near(box.width, 160, 3, 'largeur visuelle (non permutée)');
      near(box.height, 64, 3, 'hauteur visuelle (non permutée)');
      near(box.left, anchor.box.left, 3, 'alignée à gauche sur le repère');
      near(box.top, anchor.box.bottom + P.LAYOUT.gap, 3, 'sous le repère visuel');
    });

    it('sign : l\'image garde son sens (gauche/droite) sur une page droite comme sur une page tournée à 90° ou 180°', async function () {
      for (const rotate of [0, 90, 180, 270]) {
        // Repère près du centre de la page : de la place tout autour, quelle que soit la rotation.
        const pdf = await makePdf([{ rotate, texts: [{ text: 'Le Vice-Président,', x: 250, y: 410 }] }]);
        const signed = await P.sign({ pdfBytes: pdf, imageBytes: await halvesBytes(200, 80), anchorText: 'Le Vice-Président,' });
        const red = await colorBox(signed, 1, isRed);
        const blue = await colorBox(signed, 1, isBlue);
        assertTrue(!!red && !!blue, `rotation ${rotate} : les deux moitiés sont visibles`);
        assertTrue(red.right <= blue.left + 2, `rotation ${rotate} : rouge à gauche, bleu à droite (rouge ${red.left}-${red.right}, bleu ${blue.left}-${blue.right})`);
        near(red.top, blue.top, 2, `rotation ${rotate} : mêmes lignes`);
      }
    });

    it('sign : repère introuvable -> refus explicite (jamais de position devinée)', async function () {
      const pdf = await makePdf([{ texts: [{ text: 'Autre texte', x: 60, y: 200 }] }]);
      const err = await rejects(P.sign({ pdfBytes: pdf, imageBytes: await canvasBytes(100, 50, '#f00'), anchorText: 'Le Vice-Président,' }), 'anchor-not-found');
      assertEqual(err.anchorText, 'Le Vice-Président,');
    });

    it('sign : pas de place sous le repère (bas de page) -> refus, sans recouvrir ni sortir de la page', async function () {
      const pdf = await makePdf([{ texts: [{ text: 'Le Vice-Président,', x: 60, y: 40 }] }]);
      await rejects(P.sign({ pdfBytes: pdf, imageBytes: await canvasBytes(200, 80, '#f00'), anchorText: 'Le Vice-Président,' }), 'no-room');
    });

    it('sign : un repère près du bord droit ne fait pas sortir la signature de la page', async function () {
      const pdf = await makePdf([{ texts: [{ text: 'Le Vice-Président,', x: 500, y: 300 }] }]);
      const signed = await P.sign({ pdfBytes: pdf, imageBytes: await canvasBytes(200, 80, '#ff0000'), anchorText: 'Le Vice-Président,' });
      const box = await redBox(signed, 1);
      assertTrue(box.right <= 595 - P.LAYOUT.margin + 1, `bord droit ${box.right} dans la page`);
    });

    it('sign : fichier qui n\'est pas un PDF, image illisible (SVG) -> refus avec un code précis', async function () {
      const pdf = await makePdf([{ texts: [{ text: 'Le Vice-Président,', x: 60, y: 200 }] }]);
      await rejects(P.sign({ pdfBytes: new TextEncoder().encode('<html>pas un pdf du tout</html>'), imageBytes: await canvasBytes(10, 10, '#f00'), anchorText: 'x' }), 'pdf-invalid');
      await rejects(P.sign({ pdfBytes: pdf, imageBytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'), anchorText: 'Le Vice-Président,' }), 'image-invalid');
    });
  });

  // ---------------------------------------------------------------- faux document Grist

  const COLS = ['Instance', 'Date_instance', 'Acronyme', 'Porteur', 'Labo_porteur', 'Montant', 'PDF_notification', 'Signee', 'Signee_le', 'PDF_signe'];
  const day = iso => Date.UTC(...iso.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n)))) / 1000;

  // Un document Grist en mémoire : tables, règles d'accès, pièces jointes servies par une fausse API REST.
  // Il applique les actions comme Grist (AddTable, UpdateRecord, BulkAddRecord…) et renvoie les lignes de
  // la table des notifications au widget après chaque écriture, comme le fait Grist.
  async function makeWorld(opts) {
    const o = { owner: true, table: true, rules: true, image: true, names: {}, anchorText: 'Le Vice-Président,', ...opts };
    const db = {};
    const calls = { actions: [], fetches: [], tokens: [] };
    const attachments = new Map();
    let nextAttachment = 100;
    const addAttachment = (bytes, name) => { nextAttachment += 1; attachments.set(nextAttachment, { bytes, name }); return nextAttachment; };
    const table = (id, columns) => { db[id] = { columns: ['id', ...columns], rows: [] }; return db[id]; };
    const insert = (tableId, fields) => {
      const t = db[tableId];
      const id = fields.id || Math.max(0, ...t.rows.map(r => r.id)) + 1;
      t.rows.push({ ...fields, id });
      return id;
    };
    const col = name => o.names[name] || name;

    table('_grist_Tables', ['tableId']);
    table('_grist_ACLResources', ['tableId', 'colIds']);
    table('_grist_ACLRules', ['resource', 'aclFormula', 'permissionsText', 'memo', 'rulePos']);
    const exp = table('Export_VP', COLS.map(col));
    insert('_grist_Tables', { tableId: 'Export_VP' });
    insert('_grist_ACLResources', { tableId: '*', colIds: '*' });
    insert('_grist_ACLRules', { resource: 1, aclFormula: 'True', permissionsText: 'all', memo: '', rulePos: 1 });
    if (o.table) {
      table(A.TABLE, ['Image', 'Repere']);
      insert('_grist_Tables', { tableId: A.TABLE });
      const imageId = o.image ? addAttachment(await canvasBytes(200, 80, '#ff0000', 'image/png'), 'signature.png') : null;
      insert(A.TABLE, { Image: imageId ? ['L', imageId] : null, Repere: o.anchorText });
      if (o.rules) {
        const res = insert('_grist_ACLResources', { tableId: A.TABLE, colIds: '*' });
        insert('_grist_ACLRules', { resource: res, aclFormula: 'user.Access != OWNER', permissionsText: '-CRUD', memo: A.MEMO, rulePos: -1 });
      }
    }

    const withAnchor = text => makePdf([{ texts: [{ text, x: 60, y: 300 }, { text: 'Notification de décision', x: 60, y: 760 }] }]);
    const pdfs = {};
    for (const [acro, text] of [['AERIS', o.anchorText], ['NEUROSYN', o.noAnchorFor === 'NEUROSYN' ? 'Sans repère' : o.anchorText], ['TERRAFIX', o.anchorText]]) {
      pdfs[acro] = await withAnchor(text);
    }
    const addRow = (acro, instance, date, porteur, montant, extra) => {
      const notif = addAttachment(pdfs[acro] || pdfs.AERIS, `${acro}.pdf`);
      return insert('Export_VP', {
        [col('Instance')]: instance, [col('Date_instance')]: day(date), [col('Acronyme')]: acro, [col('Porteur')]: porteur, [col('Labo_porteur')]: `Labo ${acro}`,
        [col('Montant')]: montant, [col('PDF_notification')]: ['L', notif], [col('Signee')]: false, [col('Signee_le')]: null, [col('PDF_signe')]: null, ...extra,
      });
    };
    addRow('AERIS', 'CTO Innovation #12', '2026-10-14', 'Claire Vasseur', 185000);
    addRow('NEUROSYN', 'CTO Innovation #12', '2026-10-14', 'Hugo Delmas', 240000);
    addRow('TERRAFIX', 'CTO FARE #08', '2026-10-07', 'Inès Marchand', 96500);
    const signedBytes = pdfs.AERIS;
    const doneAttachment = addAttachment(signedBytes, 'FLUXO_signe.pdf');
    const doneOriginal = addAttachment(pdfs.AERIS, 'FLUXO.pdf');
    insert('Export_VP', {
      [col('Instance')]: 'CTO Innovation #11', [col('Date_instance')]: day('2026-09-23'), [col('Acronyme')]: 'FLUXO', [col('Porteur')]: 'Mathieu Roche', [col('Labo_porteur')]: 'Labo FLUXO',
      [col('Montant')]: 150000, [col('PDF_notification')]: ['L', doneOriginal], [col('Signee')]: true, [col('Signee_le')]: day('2026-09-23'), [col('PDF_signe')]: ['L', doneAttachment],
    });

    let pushed = null;
    const mappings = {};
    COLS.forEach(name => { mappings[name] = col(name); });
    const records = () => exp.rows.map(r => ({ ...r }));
    const push = () => { if (pushed) pushed(records(), mappings); };

    const columnar = id => {
      const t = db[id];
      if (!t) throw new Error(`Table ${id} introuvable`);
      const out = {};
      t.columns.forEach(c => { out[c] = t.rows.map(r => (r[c] === undefined ? null : r[c])); });
      return out;
    };

    const refMap = {};
    const grist = {
      ready() {},
      onRecords(cb) { pushed = cb; },
      selectedTable: { getTableId: async () => 'Export_VP' },
      docApi: {
        async getAccessToken(opts) { calls.tokens.push(opts); return { token: 'tok', baseUrl: 'https://grist.test/api/docs/DOC', ttlMsecs: 900000 }; },
        async fetchTable(id) {
          calls.fetches.push(id);
          // Comme Grist : les règles d'accès arrivent VIDES (sans erreur) chez qui n'est pas propriétaire, et la table
          // protégée est refusée par sa propre règle.
          if (!o.owner && id.startsWith('_grist_ACL')) return { id: [], tableId: [], colIds: [], resource: [], aclFormula: [], permissionsText: [], memo: [], rulePos: [] };
          if (!o.owner && id === A.TABLE && db._grist_ACLRules.rows.some(r => r.memo === A.MEMO)) throw new Error('Blocked by table read access rules');
          return columnar(id);
        },
        async applyUserActions(actions) {
          if (!o.owner && actions.some(a => String(a[1]).startsWith('_grist_ACL'))) throw new Error('Only owners can modify access rules');
          calls.actions.push(...actions);
          let touched = false;
          for (const action of actions) {
            const [kind, tableId, a, b] = action;
            if (kind === 'AddTable') {
              table(tableId, b ? [] : []);
              db[tableId].columns.push(...a.map(c => c.id));
              insert('_grist_Tables', { tableId });
            } else if (kind === 'AddColumn') {
              db[tableId].columns.push(a);
            } else if (kind === 'UpdateRecord') {
              Object.assign(db[tableId].rows.find(r => r.id === a), b);
              if (tableId === 'Export_VP') touched = true;
            } else if (kind === 'AddRecord') {
              const id = insert(tableId, { ...b });
              if (a != null && a < 0) refMap[a] = id;
            } else if (kind === 'BulkAddRecord') {
              a.forEach((_, i) => {
                const fields = {};
                Object.keys(b).forEach(c => { fields[c] = b[c][i]; });
                if (fields.resource < 0) fields.resource = refMap[fields.resource];
                insert(tableId, fields);
              });
            } else if (kind === 'BulkRemoveRecord') {
              db[tableId].rows = db[tableId].rows.filter(r => !a.includes(r.id));
            } else {
              throw new Error(`Action inconnue : ${kind}`);
            }
          }
          if (touched) Promise.resolve().then(push);
        },
      },
    };

    // Pièces jointes référencées par une cellule : seules celles-là sont servies (comme Grist, qui exige un accès à une cellule).
    const referenced = () => {
      const ids = new Set();
      Object.entries(db).forEach(([tableId, t]) => {
        if (tableId.startsWith('_grist')) return;
        t.rows.forEach(r => ['Image', col('PDF_notification'), col('PDF_signe')].forEach(c => { if (Array.isArray(r[c])) r[c].slice(1).forEach(id => ids.add(id)); }));
      });
      return ids;
    };
    const fetchImpl = async (url, init) => {
      const parsed = new URL(url);
      const path = parsed.pathname.replace('/api/docs/DOC', '');
      const method = (init && init.method) || 'GET';
      calls.fetches.push(`${method} ${path}${parsed.searchParams.get('colId') ? ` [${parsed.searchParams.get('tableId')}.${parsed.searchParams.get('colId')}]` : ''}`);
      if (parsed.searchParams.get('auth') !== 'tok') return new Response('no', { status: 401 });
      if (init && init.credentials !== 'omit') throw new Error('credentials:omit attendu');
      let m = /^\/attachments\/(\d+)\/download$/.exec(path);
      if (method === 'GET' && m) {
        const id = Number(m[1]);
        const isSignature = parsed.searchParams.get('tableId') === A.TABLE;
        if (!attachments.has(id) || !referenced().has(id) || (isSignature && !o.owner)) return new Response('nope', { status: 404 });
        return new Response(attachments.get(id).bytes);
      }
      if (method === 'POST' && path === '/attachments') {
        const file = init.body.get('upload');
        return new Response(JSON.stringify([addAttachment(new Uint8Array(await file.arrayBuffer()), file.name)]), { status: 200 });
      }
      if (method === 'POST' && path === '/attachments/removeUnused') {
        const used = referenced();
        [...attachments.keys()].forEach(id => { if (!used.has(id)) attachments.delete(id); });
        return new Response('null', { status: 200 });
      }
      return new Response('?', { status: 500 });
    };

    const root = document.createElement('div');
    document.body.append(root);
    const io = window.SigIO.create({ grist, fetchImpl });
    const signer = window.SigSigner.create({ io, now: () => new Date(2026, 10, 9, 17, 42) });
    const app = window.SigApp.create({ grist, root, io, signer });
    const world = { o, db, calls, attachments, grist, io, signer, app, root, push, records, mappings, col, exp, fetchImpl,
      cleanup() { root.remove(); }, };
    return world;
  }

  async function startWorld(opts) {
    const w = await makeWorld(opts);
    await w.app.start();
    w.push();
    return w;
  }

  const inst = (w, name) => [...w.root.querySelectorAll('.inst')].find(b => b.querySelector('.inst-name').textContent === name);
  const prow = (w, acro) => [...w.root.querySelectorAll('.prow')].find(r => r.querySelector('.acro').textContent === acro);
  const switchOf = (w, acro) => prow(w, acro).querySelector('.sw');
  const exportRow = (w, acro) => w.exp.rows.find(r => r[w.col('Acronyme')] === acro);
  const toastText = w => (w.root.querySelector('.toast') || {}).textContent || '';
  const modal = w => w.root.querySelector('.modal');

  async function withWorld(opts, fn) {
    const w = await startWorld(opts);
    try { await fn(w); } finally { w.cleanup(); }
  }

  // ---------------------------------------------------------------- interface

  describe('Signature — les trois colonnes (instances, notifications, PDF)', function () {
    it('colonnes non associées : message qui liste les colonnes à associer, aucune liste', async function () {
      const w = await makeWorld();
      try {
        await w.app.start();
        w.app.setRecords([], null);
        assertTrue(!w.root.querySelector('.hint').hidden, 'message d\'aide visible');
        assertIncludes(w.root.querySelector('.hint').textContent, 'Associez les colonnes');
        assertIncludes(w.root.querySelector('.hint').textContent, 'PDF de la notification');
        assertTrue(w.root.querySelector('.pane-insts').hidden, 'pas de liste d\'instances');
      } finally { w.cleanup(); }
    });

    it('instances : celles qui ont des notifications à signer en tête, surlignées avec leur compteur ; « tout signé » après un séparateur', async function () {
      await withWorld({}, async w => {
        const names = [...w.root.querySelectorAll('.inst .inst-name')].map(n => n.textContent);
        assertDeepEqual(names, ['CTO Innovation #12', 'CTO FARE #08', 'CTO Innovation #11'], 'ordre : à signer d\'abord (plus récente en premier), puis tout signé');
        const first = inst(w, 'CTO Innovation #12');
        assertTrue(first.classList.contains('is-pending'));
        assertEqual(first.querySelector('.badge-todo [aria-hidden]').textContent, '2');
        assertTrue(!!inst(w, 'CTO Innovation #11').querySelector('.badge-done'), 'coche « tout signé »');
        assertEqual(w.root.querySelectorAll('.divider').length, 1);
        assertTrue(!!inst(w, 'CTO Innovation #11').parentElement.querySelector('.divider'), 'le séparateur précède la première instance tout signé');
        assertEqual(inst(w, 'CTO Innovation #12').querySelector('.inst-date').textContent, '14/10/2026');
        assertEqual(w.root.querySelector('.sum').textContent, '3 notifications à signer');
      });
    });

    it('choisir une instance affiche ses projets : acronyme, porteur, labo, montant, interrupteur ; pas encore de PDF', async function () {
      await withWorld({}, async w => {
        assertTrue(w.root.querySelector('.pane-projs').hidden, 'aucune colonne projets avant le choix');
        inst(w, 'CTO Innovation #12').click();
        const row = prow(w, 'AERIS');
        const cells = [...row.querySelectorAll('.cell')].map(c => c.textContent);
        assertDeepEqual(cells, ['AERIS', 'Claire Vasseur', 'Labo AERIS', '185 000 €']);
        assertEqual(switchOf(w, 'AERIS').getAttribute('aria-checked'), 'false');
        assertEqual(switchOf(w, 'AERIS').querySelector('.sw-label').textContent, 'À signer');
        assertEqual(w.root.querySelector('.pane-projs .pane-meta').textContent, '0 / 2 signées');
        assertTrue(w.root.querySelector('.pane-pdf').hidden, 'le PDF n\'apparaît qu\'après le choix d\'un projet');
      });
    });

    it('choisir un projet affiche son PDF (page dessinée), avec zoom ; la barre porte le nom du fichier', async function () {
      await withWorld({}, async w => {
        inst(w, 'CTO Innovation #12').click();
        prow(w, 'AERIS').querySelector('.pmain').click();
        await waitFor(() => w.root.querySelector('.pdf-page'), 'page du PDF dessinée', 8000);
        assertEqual(w.root.querySelector('.pdf-name span').textContent, 'Notification_AERIS.pdf');
        const before = w.app.view.getScale();
        w.root.querySelector('[aria-label="Agrandir"]').click();
        await waitFor(() => Math.abs(w.app.view.getScale() - (before + 0.1)) < 1e-9, 'zoom appliqué');
        await waitFor(() => w.root.querySelector('#zoom-val').textContent === `${Math.round(w.app.view.getScale() * 100)} %`, 'pourcentage affiché mis à jour');
      });
    });

    it('une ligne sans PDF a un interrupteur désactivé et ne signe rien', async function () {
      await withWorld({}, async w => {
        const row = exportRow(w, 'AERIS');
        row[w.col('PDF_notification')] = null;
        w.push();
        inst(w, 'CTO Innovation #12').click();
        assertEqual(switchOf(w, 'AERIS').getAttribute('aria-disabled'), 'true');
        assertEqual(switchOf(w, 'AERIS').querySelector('.sw-label').textContent, 'Pas de PDF');
        switchOf(w, 'AERIS').click();
        assertIncludes(toastText(w), 'pas de PDF');
        assertEqual(w.calls.actions.length, 0, 'aucune écriture');
      });
    });

    it('colonnes mappées sous d\'autres noms : le widget lit et écrit les bonnes colonnes', async function () {
      await withWorld({ names: { Signee: 'Signe_par_VP', PDF_signe: 'PDF_retour', PDF_notification: 'PJ_recue' } }, async w => {
        inst(w, 'CTO Innovation #12').click();
        switchOf(w, 'AERIS').click();
        await waitFor(() => exportRow(w, 'AERIS').Signe_par_VP === true, 'ligne signée', 10000);
        assertEqual(exportRow(w, 'AERIS').PDF_retour[0], 'L');
        assertEqual(exportRow(w, 'AERIS').Signee, undefined, 'la colonne par défaut n\'est pas touchée');
      });
    });
  });

  describe('Signature — signer, annuler, retirer', function () {
    it('signer : le PDF signé est un nouveau fichier avec la signature sous le repère ; la ligne passe à « Signée » avec sa date ; l\'original est intact', async function () {
      await withWorld({}, async w => {
        inst(w, 'CTO Innovation #12').click();
        const originalId = exportRow(w, 'AERIS').PDF_notification[1];
        const originalBytes = w.attachments.get(originalId).bytes.slice();
        switchOf(w, 'AERIS').click();
        assertEqual(switchOf(w, 'AERIS').querySelector('.sw-label').textContent, 'Signature…', 'état occupé pendant la signature');
        await waitFor(() => exportRow(w, 'AERIS').Signee === true, 'ligne signée', 10000);
        const row = exportRow(w, 'AERIS');
        const signedId = row.PDF_signe[1];
        assertTrue(signedId !== originalId, 'nouveau fichier');
        assertDeepEqual(Array.from(w.attachments.get(originalId).bytes), Array.from(originalBytes), 'PDF d\'origine inchangé');
        assertEqual(w.attachments.get(signedId).name, 'Notification_AERIS_signe.pdf');
        const signed = w.attachments.get(signedId).bytes;
        const box = await redBox(signed, 1);
        assertTrue(!!box, 'la signature est dans le PDF');
        near(box.left, 60, 3, 'alignée sur le repère');
        assertTrue(box.top > 842 - 300, 'sous le repère');
        assertIncludes(await pageText(signed, 1), 'Signé électroniquement le 09/11/2026 à 17:42');
        assertEqual(row.Signee_le, Math.floor(new Date(2026, 10, 9, 17, 42).getTime() / 1000));
        await waitFor(() => switchOf(w, 'AERIS').getAttribute('aria-checked') === 'true', 'interrupteur sur « Signée »');
        assertEqual(switchOf(w, 'AERIS').querySelector('.sw-label').textContent, 'Signée');
        assertIncludes(toastText(w), 'Notification AERIS signée');
        assertEqual(w.root.querySelector('.sum').textContent, '2 notifications à signer');
        assertEqual(w.root.querySelector('.pane-projs .pane-meta').textContent, '1 / 2 signées');
      });
    });

    it('signer affiche ensuite le PDF signé (nom _signe, étiquette « Signée le … »)', async function () {
      await withWorld({}, async w => {
        inst(w, 'CTO Innovation #12').click();
        switchOf(w, 'AERIS').click();
        await waitFor(() => w.root.querySelector('.pdf-name span') && w.root.querySelector('.pdf-name span').textContent === 'Notification_AERIS_signe.pdf', 'PDF signé affiché', 10000);
        assertIncludes(w.root.querySelector('.pdf-tag').textContent, 'Signée le 09/11/2026');
        await waitFor(() => w.root.querySelector('.pdf-page'), 'page dessinée', 8000);
      });
    });

    it('« Annuler » dans le message : la ligne redevient à signer, le PDF d\'origine reste', async function () {
      await withWorld({}, async w => {
        inst(w, 'CTO Innovation #12').click();
        const original = exportRow(w, 'AERIS').PDF_notification;
        switchOf(w, 'AERIS').click();
        await waitFor(() => exportRow(w, 'AERIS').Signee === true && w.root.querySelector('.toast button'), 'signée', 10000);
        [...w.root.querySelectorAll('.toast button')].find(b => b.textContent === 'Annuler').click();
        await waitFor(() => exportRow(w, 'AERIS').Signee === false, 'signature retirée');
        assertDeepEqual(exportRow(w, 'AERIS').PDF_signe, ['L']);
        assertEqual(exportRow(w, 'AERIS').Signee_le, null);
        assertDeepEqual(exportRow(w, 'AERIS').PDF_notification, original);
        await waitFor(() => switchOf(w, 'AERIS').getAttribute('aria-checked') === 'false', 'interrupteur revenu');
      });
    });

    it('retirer une signature existante demande confirmation ; « Annuler » ne change rien, « Retirer » oui', async function () {
      await withWorld({}, async w => {
        inst(w, 'CTO Innovation #11').click();
        assertEqual(switchOf(w, 'FLUXO').getAttribute('aria-checked'), 'true');
        switchOf(w, 'FLUXO').click();
        assertIncludes(modal(w).textContent, 'Retirer la signature de FLUXO');
        [...modal(w).querySelectorAll('button')].find(b => b.textContent === 'Annuler').click();
        assertTrue(!modal(w), 'fenêtre fermée');
        assertEqual(exportRow(w, 'FLUXO').Signee, true, 'rien n\'a changé');
        switchOf(w, 'FLUXO').click();
        [...modal(w).querySelectorAll('button')].find(b => b.textContent === 'Retirer la signature').click();
        await waitFor(() => exportRow(w, 'FLUXO').Signee === false, 'signature retirée');
        assertDeepEqual(exportRow(w, 'FLUXO').PDF_signe, ['L']);
      });
    });

    it('deux interrupteurs cliqués d\'affilée : signés l\'un après l\'autre, chacun avec son propre PDF', async function () {
      await withWorld({}, async w => {
        inst(w, 'CTO Innovation #12').click();
        switchOf(w, 'AERIS').click();
        switchOf(w, 'NEUROSYN').click();
        assertEqual(switchOf(w, 'NEUROSYN').querySelector('.sw-label').textContent, 'Signature…', 'la seconde est en attente');
        await waitFor(() => exportRow(w, 'AERIS').Signee === true && exportRow(w, 'NEUROSYN').Signee === true, 'les deux signées', 20000);
        assertTrue(exportRow(w, 'AERIS').PDF_signe[1] !== exportRow(w, 'NEUROSYN').PDF_signe[1]);
      });
    });

    it('un double clic sur le même interrupteur ne signe qu\'une fois', async function () {
      await withWorld({}, async w => {
        inst(w, 'CTO Innovation #12').click();
        const button = switchOf(w, 'AERIS');
        button.click();
        switchOf(w, 'AERIS').click();
        await waitFor(() => exportRow(w, 'AERIS').Signee === true, 'signée', 10000);
        await wait(300);
        const uploads = w.calls.fetches.filter(f => f === 'POST /attachments');
        assertEqual(uploads.length, 1, 'un seul envoi');
      });
    });

    it('repère introuvable dans le PDF : message explicite, rien signé, rien envoyé, rien écrit', async function () {
      await withWorld({ noAnchorFor: 'NEUROSYN' }, async w => {
        inst(w, 'CTO Innovation #12').click();
        switchOf(w, 'NEUROSYN').click();
        await waitFor(() => toastText(w).includes('introuvable'), 'message d\'erreur', 10000);
        assertIncludes(toastText(w), 'Le Vice-Président,');
        assertIncludes(toastText(w), 'Rien n’a été signé');
        assertEqual(exportRow(w, 'NEUROSYN').Signee, false);
        assertEqual(w.calls.fetches.filter(f => f === 'POST /attachments').length, 0, 'aucun envoi');
        await waitFor(() => switchOf(w, 'NEUROSYN').querySelector('.sw-label').textContent === 'À signer', 'interrupteur revenu');
      });
    });
  });

  describe('Signature — « Ma signature » : image, repère, protection', function () {
    const importFile = (w, bytes, name, type) => {
      const input = modal(w).querySelector('input[type=file]');
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], name, { type }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    it('protégée et avec image : ligne verte « lecture réservée au propriétaire », aperçu, boutons Remplacer / Supprimer', async function () {
      await withWorld({}, async w => {
        await waitFor(() => w.app.state.signature.url, 'aperçu de la signature chargé');
        w.root.querySelector('.sig-btn').click();
        assertIncludes(modal(w).querySelector('.acl').textContent, 'Table « Signature_VP » : lecture réservée au propriétaire du document.');
        assertTrue(!!modal(w).querySelector('.sig-box img'), 'aperçu');
        const labels = [...modal(w).querySelectorAll('.modal-actions button')].filter(b => !b.hidden).map(b => b.textContent);
        assertDeepEqual(labels, ['Supprimer', 'Fermer', 'Remplacer l’image…']);
        assertEqual(modal(w).querySelector('#anchor-input').value, 'Le Vice-Président,');
        assertFalse(/null|undefined/.test(modal(w).textContent), `texte parasite dans la fenêtre : ${modal(w).textContent}`);
      });
    });

    it('fenêtre ouverte : le focus entre dans la fenêtre, Tab y reste (aller et retour), Échap la ferme', async function () {
      await withWorld({}, async w => {
        await waitFor(() => w.app.state.signature.url, 'aperçu');
        w.root.querySelector('.sig-btn').click();
        const dialog = modal(w);
        assertTrue(document.activeElement === dialog, 'focus sur la fenêtre');
        const tab = shift => dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true }));
        const focusable = [...dialog.querySelectorAll('button, input:not([type=file])')].filter(el => !el.disabled && !el.hidden);
        focusable[focusable.length - 1].focus();
        tab(false);
        assertTrue(document.activeElement === focusable[0], 'Tab sur le dernier élément revient au premier');
        tab(true);
        assertTrue(document.activeElement === focusable[focusable.length - 1], 'Maj+Tab sur le premier va au dernier');
      });
    });

    it('table absente : signer ouvre « Ma signature » avec l\'avertissement ; AUCUNE image lue, rien envoyé', async function () {
      await withWorld({ table: false }, async w => {
        inst(w, 'CTO Innovation #12').click();
        switchOf(w, 'AERIS').click();
        assertTrue(!!modal(w), 'fenêtre « Ma signature » ouverte');
        await waitFor(() => modal(w).querySelector('.acl.is-warn'), 'avertissement');
        assertIncludes(modal(w).querySelector('.acl.is-warn').textContent, 'pas encore protégée');
        assertEqual(modal(w).querySelector('#anchor-input').disabled, true, 'repère non modifiable tant que ce n\'est pas protégé');
        assertTrue(w.calls.fetches.every(f => !String(f).includes('Signature_VP.Image') && f !== 'POST /attachments'), `aucun accès à l'image : ${w.calls.fetches.join(' | ')}`);
        assertEqual(exportRow(w, 'AERIS').Signee, false);
      });
    });

    it('« Sécuriser maintenant » : crée la table, pose UNE règle placée avant les autres, puis tout est vert', async function () {
      await withWorld({ table: false }, async w => {
        w.root.querySelector('.sig-btn').click();
        await waitFor(() => [...modal(w).querySelectorAll('button')].some(b => b.textContent === 'Sécuriser maintenant'), 'bouton visible');
        [...modal(w).querySelectorAll('button')].find(b => b.textContent === 'Sécuriser maintenant').click();
        await waitFor(() => w.app.state.setup && w.app.state.setup.status === 'ok', 'protégée', 8000);
        assertTrue(!!w.db[A.TABLE], 'table créée');
        assertDeepEqual(w.db[A.TABLE].columns.slice(1), ['Image', 'Repere']);
        const own = w.db._grist_ACLRules.rows.filter(r => r.memo === A.MEMO);
        assertEqual(own.length, 1, 'une seule règle posée');
        assertEqual(own[0].permissionsText, '-CRUD');
        assertEqual(w.db._grist_ACLResources.rows.find(r => r.id === own[0].resource).tableId, A.TABLE);
        const others = w.db._grist_ACLRules.rows.filter(r => r.memo !== A.MEMO);
        assertTrue(own[0].rulePos < Math.min(...others.map(r => r.rulePos)), 'la règle précède toutes les autres');
        assertIncludes(modal(w).querySelector('.acl').textContent, 'lecture réservée au propriétaire');
        const tableCreation = w.calls.actions.findIndex(a => a[0] === 'AddTable');
        const ruleCreation = w.calls.actions.findIndex(a => a[0] === 'BulkAddRecord');
        assertTrue(tableCreation >= 0 && ruleCreation > tableCreation, 'la table existe avant la règle ; aucune image entre-temps');
      });
    });

    it('SÉCURITÉ — règle retirée entre-temps : signer est refusé et l\'image n\'est ni lue ni téléchargée', async function () {
      await withWorld({}, async w => {
        await waitFor(() => w.app.state.setup && w.app.state.setup.status === 'ok' && w.app.state.signature.url, 'protégée au départ');
        // Quelqu'un retire la règle dans Grist ; le widget garde son état en mémoire.
        w.db._grist_ACLRules.rows = w.db._grist_ACLRules.rows.filter(r => r.memo !== A.MEMO);
        w.calls.fetches.length = 0;
        inst(w, 'CTO Innovation #12').click();
        switchOf(w, 'AERIS').click();
        await waitFor(() => modal(w) && modal(w).querySelector('.acl.is-warn'), 'fenêtre d\'avertissement');
        assertEqual(exportRow(w, 'AERIS').Signee, false);
        assertTrue(w.calls.fetches.every(f => !String(f).includes('Signature_VP.Image') && f !== 'POST /attachments'), `l'image n'est pas lue, rien n'est envoyé : ${w.calls.fetches.join(' | ')}`);
      });
    });

    it('SÉCURITÉ — non propriétaire : message dédié, signature et import impossibles, aucune image lue', async function () {
      await withWorld({ owner: false }, async w => {
        inst(w, 'CTO Innovation #12').click();
        switchOf(w, 'AERIS').click();
        await waitFor(() => modal(w) && modal(w).querySelector('.acl.is-bad'), 'avertissement non-propriétaire');
        assertIncludes(modal(w).querySelector('.acl.is-bad').textContent, 'Seul le propriétaire');
        assertEqual([...modal(w).querySelectorAll('button')].some(b => b.textContent === 'Sécuriser maintenant'), false, 'pas de bouton de sécurisation');
        assertEqual(modal(w).querySelector('.modal-actions .btn-primary').disabled, true, 'import désactivé');
        assertEqual(exportRow(w, 'AERIS').Signee, false);
        assertTrue(w.calls.fetches.every(f => !String(f).includes('Signature_VP.Image') && f !== 'POST /attachments'), `aucune image lue : ${w.calls.fetches.join(' | ')}`);
        const err = await rejects(w.io.loadSignature(), 'not-owner');
        assertTrue(!!err);
        await rejects(w.io.saveSignature(await canvasBytes(10, 10, '#f00')), 'not-owner');
      });
    });

    it('SÉCURITÉ — éditeur (non propriétaire) alors que rien ne protège encore la table : « Sécuriser » est refusé par Grist, message clair, aucune image', async function () {
      await withWorld({ owner: false, rules: false }, async w => {
        w.root.querySelector('.sig-btn').click();
        await waitFor(() => modal(w) && modal(w).querySelector('.acl.is-warn') && [...modal(w).querySelectorAll('button')].some(b => b.textContent === 'Sécuriser maintenant'), 'bouton de sécurisation');
        [...modal(w).querySelectorAll('button')].find(b => b.textContent === 'Sécuriser maintenant').click();
        await waitFor(() => toastText(w).includes('propriétaire'), 'message : seul le propriétaire');
        assertEqual(w.db._grist_ACLRules.rows.filter(r => r.memo === A.MEMO).length, 0, 'aucune règle posée');
        await rejects(w.io.loadSignature(), 'not-secured');
        assertTrue(w.calls.fetches.every(f => !String(f).includes('Signature_VP.Image')), 'aucune image lue');
      });
    });

    it('SÉCURITÉ — les jetons d\'accès sont demandés avec readOnly:false (sinon la règle refuse l\'image au propriétaire lui-même) et jamais affichés', async function () {
      await withWorld({}, async w => {
        inst(w, 'CTO Innovation #12').click();
        switchOf(w, 'AERIS').click();
        await waitFor(() => exportRow(w, 'AERIS').Signee === true, 'signée', 10000);
        assertTrue(w.calls.tokens.length >= 1);
        assertTrue(w.calls.tokens.every(t => t.readOnly === false), 'jamais readOnly:true');
        assertFalse(w.root.textContent.includes('tok'.repeat(1) + '&') || w.root.innerHTML.includes('auth=tok'), 'le jeton n\'apparaît pas dans la page');
        const signatureDownload = w.calls.fetches.find(f => f.includes('Signature_VP.Image'));
        assertTrue(!!signatureDownload, `la signature est lue en indiquant sa cellule : ${w.calls.fetches.join(' | ')}`);
      });
    });

    it('sans image enregistrée : signer ouvre la fenêtre ; importer une image enregistre PUIS signe la ligne demandée', async function () {
      await withWorld({ image: false }, async w => {
        inst(w, 'CTO Innovation #12').click();
        switchOf(w, 'AERIS').click();
        await waitFor(() => modal(w) && modal(w).querySelector('.sig-box.is-empty') && !modal(w).querySelector('.modal-actions .btn-primary').disabled, 'fenêtre prête à importer');
        importFile(w, await canvasBytes(200, 80, '#ff0000', 'image/png'), 'ma-signature.png', 'image/png');
        await waitFor(() => exportRow(w, 'AERIS').Signee === true, 'importée puis signée', 12000);
        const saved = w.db[A.TABLE].rows[0].Image;
        assertEqual(saved[0], 'L');
        assertEqual(w.attachments.get(saved[1]).name, 'signature.png');
        assertTrue(!modal(w), 'fenêtre refermée');
      });
    });

    it('image refusée : un SVG déguisé en PNG n\'est pas enregistré (le type se lit dans les octets)', async function () {
      await withWorld({ image: false }, async w => {
        w.root.querySelector('.sig-btn').click();
        await waitFor(() => !modal(w).querySelector('.modal-actions .btn-primary').disabled, 'fenêtre prête');
        importFile(w, new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'), 'signature.png', 'image/png');
        await waitFor(() => toastText(w).includes('illisible'), 'refus affiché');
        assertEqual(w.db[A.TABLE].rows[0].Image, null);
        assertEqual(w.calls.fetches.filter(f => f === 'POST /attachments').length, 0, 'rien envoyé');
      });
    });

    it('image trop volumineuse : refusée avant tout envoi', async function () {
      await withWorld({ image: false }, async w => {
        w.root.querySelector('.sig-btn').click();
        await waitFor(() => !modal(w).querySelector('.modal-actions .btn-primary').disabled, 'fenêtre prête');
        const big = new Uint8Array(3 * 1024 * 1024);
        big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        importFile(w, big, 'grosse.png', 'image/png');
        await waitFor(() => toastText(w).includes('trop volumineuse'), 'refus affiché');
        assertEqual(w.calls.fetches.filter(f => f === 'POST /attachments').length, 0);
      });
    });

    it('remplacer ou supprimer la signature purge l\'ancien fichier du document (plus de copie orpheline)', async function () {
      await withWorld({}, async w => {
        await waitFor(() => w.app.state.signature.url, 'aperçu');
        const oldId = w.db[A.TABLE].rows[0].Image[1];
        w.root.querySelector('.sig-btn').click();
        importFile(w, await canvasBytes(100, 40, '#0000ff', 'image/png'), 'nouvelle.png', 'image/png');
        await waitFor(() => w.db[A.TABLE].rows[0].Image[1] !== oldId, 'image remplacée');
        await waitFor(() => !w.attachments.has(oldId), 'ancien fichier purgé');
        const newId = w.db[A.TABLE].rows[0].Image[1];
        [...modal(w).querySelectorAll('button')].find(b => b.textContent === 'Supprimer').click();
        await waitFor(() => !w.attachments.has(newId), 'fichier supprimé du document');
        assertDeepEqual(w.db[A.TABLE].rows[0].Image, ['L']);
        assertTrue(w.calls.fetches.filter(f => f === 'POST /attachments/removeUnused').length >= 2);
      });
    });

    it('le repère de texte se modifie dans la fenêtre et s\'enregistre dans la table privée ; vide -> valeur par défaut', async function () {
      await withWorld({}, async w => {
        w.root.querySelector('.sig-btn').click();
        await waitFor(() => !modal(w).querySelector('#anchor-input').disabled, 'champ actif');
        const input = modal(w).querySelector('#anchor-input');
        input.value = 'Le Secrétaire général,';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await waitFor(() => w.db[A.TABLE].rows[0].Repere === 'Le Secrétaire général,', 'repère enregistré');
        modal(w).querySelector('#anchor-input').value = '   ';
        modal(w).querySelector('#anchor-input').dispatchEvent(new Event('change', { bubbles: true }));
        await waitFor(() => w.db[A.TABLE].rows[0].Repere === 'Le Vice-Président,', 'valeur par défaut');
      });
    });

    it('un repère personnalisé est celui qui sert à signer', async function () {
      await withWorld({ anchorText: 'Pour le Président,' }, async w => {
        inst(w, 'CTO Innovation #12').click();
        switchOf(w, 'AERIS').click();
        await waitFor(() => exportRow(w, 'AERIS').Signee === true, 'signée', 10000);
        assertTrue(!!(await redBox(w.attachments.get(exportRow(w, 'AERIS').PDF_signe[1]).bytes, 1)));
      });
    });

    it('Échap ferme la fenêtre et le focus revient sur le bouton d\'origine', async function () {
      await withWorld({}, async w => {
        const button = w.root.querySelector('.sig-btn');
        button.focus();
        button.click();
        assertTrue(!!modal(w));
        modal(w).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assertTrue(!modal(w), 'fermée');
        assertTrue(document.activeElement === button, 'focus rendu');
      });
    });
  });

  // ---------------------------------------------------------------- sécurité de la page

  describe('Signature — politique de sécurité de la page et du code', function () {
    let html = '';
    const sources = {};
    async function load() {
      if (html) return;
      html = await (await fetch('/signature/index.html', { cache: 'no-store' })).text();
      for (const name of ['util', 'acl', 'pdf-stamp', 'grist-io', 'signer', 'pdf-view', 'app', 'boot']) {
        sources[name] = await (await fetch(`/signature/js/${name}.js`, { cache: 'no-store' })).text();
      }
    }
    const policy = () => /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
    const directive = name => (policy().split(';').map(d => d.trim()).find(d => d.startsWith(`${name} `)) || '').split(/\s+/).slice(1);

    it('CSP : ni script en ligne, ni eval, ni style en ligne ; scripts du dossier + API Grist seulement', async function () {
      await load();
      assertDeepEqual(directive('default-src'), ["'none'"]);
      assertDeepEqual(directive('script-src'), ["'self'", 'https://docs.getgrist.com']);
      assertDeepEqual(directive('style-src'), ["'self'"]);
      assertFalse(policy().includes('unsafe-inline') || policy().includes('unsafe-eval'), 'ni unsafe-inline ni unsafe-eval');
      assertDeepEqual(directive('frame-src'), ["'none'"]);
      assertDeepEqual(directive('object-src'), ["'none'"]);
      assertDeepEqual(directive('base-uri'), ["'none'"]);
      assertDeepEqual(directive('form-action'), ["'none'"]);
      assertTrue(directive('connect-src').every(source => source.startsWith('https:')), 'connexions en https seulement');
    });

    it('page : aucun script en ligne, aucun gestionnaire on…=, aucun style en ligne, aucune ressource d\'un autre site que l\'API Grist', async function () {
      await load();
      const body = html.replace(/<!--[\s\S]*?-->/g, '');
      assertFalse(/<script(?![^>]*\ssrc=)[^>]*>/i.test(body), 'script en ligne');
      assertFalse(/\son[a-z]+\s*=/i.test(body), 'gestionnaire en ligne');
      assertFalse(/\sstyle\s*=/i.test(body) || /<style[\s>]/i.test(body), 'style en ligne');
      const external = [...body.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map(m => m[1]);
      assertDeepEqual(external, ['https://docs.getgrist.com/grist-plugin-api.js']);
    });

    it('code : jamais innerHTML sur des données, ni eval, ni style en ligne, ni écriture directe dans le document', async function () {
      await load();
      Object.entries(sources).forEach(([name, code]) => {
        const stripped = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        assertFalse(/\beval\s*\(|new Function\s*\(|document\.write|outerHTML|insertAdjacentHTML|setAttribute\('style'|cssText|\.srcdoc/.test(stripped), `${name}.js : API interdite`);
        const inner = (stripped.match(/innerHTML/g) || []).length;
        assertEqual(inner, name === 'app' ? 1 : 0, `${name}.js : innerHTML (une seule fois, pour les icônes fixes)`);
      });
      assertTrue(/svg\.innerHTML = ICONS\[name\]/.test(sources.app), 'l\'unique innerHTML est celui des icônes constantes');
    });

    it('code : aucune requête vers un site autre que le document Grist (pas d\'URL en dur, pas de XMLHttpRequest, pas de sendBeacon)', async function () {
      await load();
      Object.entries(sources).forEach(([name, code]) => {
        const stripped = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        assertFalse(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/.test(stripped), `${name}.js : URL en dur`);
        assertFalse(/XMLHttpRequest\s*\(|sendBeacon|new WebSocket|new EventSource|localStorage|sessionStorage|indexedDB/.test(stripped.replace(/'X-Requested-With': 'XMLHttpRequest'/g, '')), `${name}.js : API réseau ou stockage navigateur`);
      });
    });

    it('bibliothèques : embarquées dans le dépôt et identiques à celles documentées (empreintes SHA-256)', async function () {
      const readme = await (await fetch('/signature/vendor/README.md', { cache: 'no-store' })).text();
      const files = { 'pdf-lib/pdf-lib.min.js': null, 'pdfjs/pdf.min.mjs': null, 'pdfjs/pdf.worker.min.mjs': null };
      for (const name of Object.keys(files)) {
        const bytes = new Uint8Array(await (await fetch(`/signature/vendor/${name}`, { cache: 'no-store' })).arrayBuffer());
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
        assertIncludes(readme, digest, `${name} : empreinte absente du README (fichier modifié ?)`);
      }
    });
  });
})();
