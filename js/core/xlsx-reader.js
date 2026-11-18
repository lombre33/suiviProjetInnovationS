/**
 * Lecteur de classeur Excel (.xlsx) sans dépendance : un .xlsx est une archive zip de fichiers XML. On lit l'index du zip, on décompresse
 * chaque fichier utile avec DecompressionStream (« deflate-raw », intégré au navigateur), puis on lit le XML avec DOMParser.
 *
 * XlsxReader.read(arrayBuffer, preferredSheet) -> Promise<{ sheetNames, sheetName, rows }>
 *   rows : tableau de lignes, chaque ligne un tableau de cellules ; cellule = texte | nombre | booléen | null ;
 *   une cellule au format date est rendue sous la forme { excelDate: numéroDeSérie } (le lecteur ne convertit pas : voir excelDateToUnix).
 * Erreurs : Error au message en français (fichier illisible, pas un .xlsx, navigateur trop ancien).
 */
(function (global) {
  'use strict';

  const u16 = (view, at) => view.getUint16(at, true);
  const u32 = (view, at) => view.getUint32(at, true);

  // Index du zip : nom -> { method, size, offset } (lu dans le répertoire central, qui fait foi même quand les tailles sont en fin de fichier).
  function readZipIndex(buffer) {
    const view = new DataView(buffer);
    let end = -1;
    for (let at = buffer.byteLength - 22; at >= Math.max(0, buffer.byteLength - 22 - 65535); at--) {
      if (u32(view, at) === 0x06054b50) { end = at; break; }
    }
    if (end < 0) throw new Error('Ce fichier n\'est pas un classeur Excel (.xlsx).');
    const count = u16(view, end + 10);
    let at = u32(view, end + 16);
    const index = new Map();
    for (let i = 0; i < count; i++) {
      if (u32(view, at) !== 0x02014b50) throw new Error('Le classeur Excel est abîmé (index illisible).');
      const method = u16(view, at + 10), size = u32(view, at + 20), nameLength = u16(view, at + 28), extraLength = u16(view, at + 30), commentLength = u16(view, at + 32), offset = u32(view, at + 42);
      const name = new TextDecoder().decode(new Uint8Array(buffer, at + 46, nameLength));
      index.set(name, { method, size, offset });
      at += 46 + nameLength + extraLength + commentLength;
    }
    return index;
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') throw new Error('Ce navigateur ne sait pas ouvrir un classeur Excel (DecompressionStream absent). Utilise une version récente de Chrome, Edge ou Firefox.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function readEntry(buffer, index, name) {
    const entry = index.get(name);
    if (!entry) return null;
    const view = new DataView(buffer);
    if (u32(view, entry.offset) !== 0x04034b50) throw new Error('Le classeur Excel est abîmé (fichier « ' + name + ' » illisible).');
    const start = entry.offset + 30 + u16(view, entry.offset + 26) + u16(view, entry.offset + 28);
    const raw = new Uint8Array(buffer, start, entry.size);
    let bytes;
    if (entry.method === 0) bytes = raw;
    else if (entry.method === 8) bytes = await inflateRaw(raw);
    else throw new Error('Le classeur Excel utilise une compression inconnue.');
    return new TextDecoder('utf-8').decode(bytes);
  }

  const parseXml = text => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Le classeur Excel est abîmé (XML illisible).');
    return doc;
  };
  const all = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
  const firstChild = (node, name) => Array.from(node.children).find(child => child.localName === name) || null;

  // Les cellules au format date sont des nombres comme les autres : seul le format (styles.xml) les distingue.
  const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
  function isDateFormatCode(code) {
    const cleaned = String(code || '').replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[[^\]]*\]/g, '');
    return !/^general$/i.test(cleaned.trim()) && /[ymdhs]/i.test(cleaned);
  }
  function dateStyles(doc) {
    const custom = new Map();
    all(doc, 'numFmt').forEach(node => custom.set(Number(node.getAttribute('numFmtId')), node.getAttribute('formatCode')));
    const xfs = all(doc, 'cellXfs')[0];
    const out = [];
    if (xfs) Array.from(xfs.children).forEach(xf => {
      const id = Number(xf.getAttribute('numFmtId') || 0);
      out.push(BUILTIN_DATE_FORMATS.has(id) || (custom.has(id) && isDateFormatCode(custom.get(id))));
    });
    return out;
  }

  function sharedStrings(doc) {
    return all(doc, 'si').map(si => all(si, 't').filter(t => !t.parentElement || t.parentElement.localName !== 'rPh').map(t => t.textContent).join(''));
  }

  const columnIndex = ref => {
    const letters = /^[A-Z]+/i.exec(ref || '');
    if (!letters) return -1;
    return letters[0].toUpperCase().split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  };

  function cellValue(cell, strings, dates) {
    const type = cell.getAttribute('t');
    const v = firstChild(cell, 'v');
    if (type === 'inlineStr') { const is = firstChild(cell, 'is'); return is ? all(is, 't').map(t => t.textContent).join('') : ''; }
    if (!v) return null;
    const raw = v.textContent;
    if (type === 's') { const text = strings[Number(raw)]; return text === undefined ? null : text; }
    if (type === 'str') return raw;
    if (type === 'b') return raw === '1';
    if (type === 'e') return null;
    const n = Number(raw);
    if (raw === '' || Number.isNaN(n)) return raw === '' ? null : raw;
    return dates[Number(cell.getAttribute('s') || 0)] ? { excelDate: n } : n;
  }

  function sheetRows(doc, strings, dates) {
    const rows = [];
    all(doc, 'row').forEach(row => {
      const out = [];
      let next = 0;
      Array.from(row.children).filter(c => c.localName === 'c').forEach(cell => {
        const at = columnIndex(cell.getAttribute('r'));
        const col = at >= 0 ? at : next;
        out[col] = cellValue(cell, strings, dates);
        next = col + 1;
      });
      const number = Number(row.getAttribute('r'));
      rows[(number > 0 ? number : rows.length + 1) - 1] = Array.from(out, value => (value === undefined ? null : value));
    });
    return Array.from(rows, row => row || []);
  }

  async function read(buffer, preferredSheet) {
    const index = readZipIndex(buffer);
    if (!index.has('xl/workbook.xml')) throw new Error('Ce fichier n\'est pas un classeur Excel (.xlsx).');
    const workbook = parseXml(await readEntry(buffer, index, 'xl/workbook.xml'));
    const relationsText = await readEntry(buffer, index, 'xl/_rels/workbook.xml.rels');
    const targets = new Map();
    if (relationsText) all(parseXml(relationsText), 'Relationship').forEach(rel => targets.set(rel.getAttribute('Id'), rel.getAttribute('Target')));
    const sheets = all(workbook, 'sheet').map(node => ({ name: node.getAttribute('name'), rid: node.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || node.getAttribute('r:id') }));
    if (!sheets.length) throw new Error('Le classeur Excel ne contient aucune feuille.');
    const chosen = sheets.find(sheet => sheet.name === preferredSheet) || sheets[0];
    let target = targets.get(chosen.rid) || ('worksheets/sheet' + (sheets.indexOf(chosen) + 1) + '.xml');
    target = target.replace(/^\//, '');
    const path = target.startsWith('xl/') ? target : 'xl/' + target;
    const sheetText = await readEntry(buffer, index, path);
    if (!sheetText) throw new Error('La feuille « ' + chosen.name + ' » est introuvable dans le classeur.');
    const stringsText = await readEntry(buffer, index, 'xl/sharedStrings.xml');
    const stylesText = await readEntry(buffer, index, 'xl/styles.xml');
    const strings = stringsText ? sharedStrings(parseXml(stringsText)) : [];
    const dates = stylesText ? dateStyles(parseXml(stylesText)) : [];
    return { sheetNames: sheets.map(sheet => sheet.name), sheetName: chosen.name, rows: sheetRows(parseXml(sheetText), strings, dates) };
  }

  // Numéro de série Excel (jours depuis le 30/12/1899) -> secondes Unix à minuit UTC, comme les colonnes Date de Grist.
  const excelDateToUnix = serial => Math.round((serial - 25569) * 86400);

  global.XlsxReader = { read, excelDateToUnix };
})(window);
