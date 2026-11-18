/**
 * Non-regression suite : lecteur de classeur Excel sans dépendance (js/core/xlsx-reader.js) — 18/11/2026.
 *
 * Utilisé par l'import de l'historique financier (page cachée Alt+Maj+I) pour lire l'export .xlsx dans le navigateur : le proxy bloque les CDN,
 * donc pas de bibliothèque tierce. Les classeurs d'essai (tests/fixtures-xlsx.js) ont été produits par openpyxl, comme l'export d'Antoine :
 * textes en chaînes partagées, dates au format JJ/MM/AAAA, archive compressée (deflate).
 */
(function () {
  'use strict';

  const bytesOf = key => Uint8Array.from(atob(window.__XLSX_FIXTURES__[key]), ch => ch.charCodeAt(0)).buffer;

  // Mini archive zip « stockée » (sans compression), pour fabriquer à la main des classeurs aux cas particuliers.
  function zip(files) {
    const enc = new TextEncoder();
    const locals = [], centrals = [];
    let offset = 0;
    files.forEach(({ name, text }) => {
      const nameBytes = enc.encode(name), data = enc.encode(text);
      const local = new Uint8Array(30 + nameBytes.length + data.length), lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(8, 0, true);
      lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30); local.set(data, 30 + nameBytes.length);
      const central = new Uint8Array(46 + nameBytes.length), cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(10, 0, true);
      cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, nameBytes.length, true); cv.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      locals.push(local); centrals.push(central); offset += local.length;
    });
    const centralSize = centrals.reduce((n, c) => n + c.length, 0);
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
    const out = new Uint8Array(offset + centralSize + 22);
    let at = 0;
    locals.concat(centrals, [end]).forEach(part => { out.set(part, at); at += part.length; });
    return out.buffer;
  }
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const workbook = names => `<?xml version="1.0"?><workbook ${NS}><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  const rels = count => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Array.from({ length: count }, (_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`;

  describe('Lecteur Excel — un classeur produit par Excel (openpyxl)', function () {
    it('lit les feuilles, les textes (chaînes partagées), les nombres, les dates et les cellules vides', async function () {
      const book = await XlsxReader.read(bytesOf('bon'));
      assertDeepEqual(book.sheetNames, ['Reporting', 'Notes']);
      assertEqual(book.sheetName, 'Reporting');
      const [head, first] = book.rows;
      assertEqual(head.length, 25); assertEqual(head[0], 'Programme'); assertEqual(head[4], 'N° OPE'); assertEqual(head[5], 'Libellé opération'); assertEqual(head[23], 'Établissement');
      assertEqual(first[4], 'FICTIF-0001'); assertEqual(first[9], 45000); assertEqual(first[10], 0.6);
      assertEqual(typeof first[7], 'object', 'une cellule au format date est reconnue comme telle');
      assertEqual(XlsxReader.excelDateToUnix(first[7].excelDate), Date.UTC(2023, 0, 1) / 1000);
      assertEqual(XlsxReader.excelDateToUnix(first[8].excelDate), Date.UTC(2025, 11, 31) / 1000);
      assertEqual(book.rows[3][4], null, 'cellule vide (ligne sans N° OPE)');
      assertEqual(book.rows[2][4], 'FICTIF-0002');
    });

    it('choisit la feuille demandée, sinon la première', async function () {
      assertEqual((await XlsxReader.read(bytesOf('bon'), 'Notes')).rows[0][0], 'sans intérêt');
      assertEqual((await XlsxReader.read(bytesOf('bon'), 'Inconnue')).sheetName, 'Reporting');
    });

    it('un fichier qui n\'est pas un classeur Excel donne un message clair', async function () {
      let message = '';
      try { await XlsxReader.read(new TextEncoder().encode('ceci est un texte').buffer); } catch (err) { message = err.message; }
      assertIncludes(message, 'n\'est pas un classeur Excel');
      message = '';
      try { await XlsxReader.read(zip([{ name: 'autre.txt', text: 'x' }])); } catch (err) { message = err.message; }
      assertIncludes(message, 'n\'est pas un classeur Excel');
    });
  });

  describe('Lecteur Excel — cas particuliers d\'un classeur fait à la main (archive non compressée)', function () {
    it('textes en ligne, texte calculé, booléen, cellules séparées par des vides, sans attribut r', async function () {
      const sheet = `<?xml version="1.0"?><worksheet ${NS}><sheetData>
        <row r="1"><c r="A1" t="inlineStr"><is><t>Titre</t></is></c><c r="C1" t="str"><v>calculé</v></c></row>
        <row r="3"><c t="b"><v>1</v></c><c><v>2.5</v></c><c t="e"><v>#DIV/0!</v></c></row>
      </sheetData></worksheet>`;
      const book = await XlsxReader.read(zip([{ name: 'xl/workbook.xml', text: workbook(['Données']) }, { name: 'xl/_rels/workbook.xml.rels', text: rels(1) }, { name: 'xl/worksheets/sheet1.xml', text: sheet }]));
      assertEqual(book.sheetName, 'Données');
      assertDeepEqual(book.rows[0], ['Titre', null, 'calculé']);
      assertDeepEqual(book.rows[1], [], 'ligne 2 absente du fichier : vide');
      assertDeepEqual(book.rows[2], [true, 2.5, null]);
    });

    it('un format de date personnalisé est reconnu ; un format monétaire ou « Standard » ne l\'est pas', async function () {
      const styles = `<?xml version="1.0"?><styleSheet ${NS}><numFmts count="2"><numFmt numFmtId="164" formatCode="[$-40C]d\\ mmmm\\ yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00\\ &quot;€&quot;"/></numFmts>
        <cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="165"/><xf numFmtId="14"/></cellXfs></styleSheet>`;
      const sheet = `<?xml version="1.0"?><worksheet ${NS}><sheetData><row r="1"><c r="A1"><v>45000</v></c><c r="B1" s="1"><v>45000</v></c><c r="C1" s="2"><v>45000</v></c><c r="D1" s="3"><v>45000</v></c></row></sheetData></worksheet>`;
      const book = await XlsxReader.read(zip([{ name: 'xl/workbook.xml', text: workbook(['S']) }, { name: 'xl/_rels/workbook.xml.rels', text: rels(1) }, { name: 'xl/styles.xml', text: styles }, { name: 'xl/worksheets/sheet1.xml', text: sheet }]));
      const [a, b, c, d] = book.rows[0];
      assertEqual(a, 45000); assertEqual(c, 45000);
      assertEqual(b.excelDate, 45000); assertEqual(d.excelDate, 45000);
    });
  });
})();
