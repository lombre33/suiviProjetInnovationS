/**
 * Mail « Demande de visa » (page Administratif, onglet Conventions, sous-étape « Visa » de l'UB).
 *
 * Un clic sur l'enveloppe ouvre, dans la messagerie de la personne, un brouillon déjà rempli (destinataires, copie,
 * objet, corps) à partir d'un modèle de type « e-mail » de Publipostage+ (le modèle que GFS range). GFS n'est pas
 * ouvert : un modèle n'est qu'une ligne de la table `Publipostage_Modeles` du document, que le widget lit lui-même.
 *
 * Ce que le lien mailto: impose (pas une limite du widget) :
 *  - le corps est du TEXTE BRUT : ni gras, ni couleur, ni image, aucune pièce jointe ;
 *  - l'URL entière (champs encodés compris) ne doit pas dépasser ~2 000 caractères (Outlook bureau est le plus strict) ;
 *  - Zimbra (webmail) lit le lien autrement : voir `forZimbra`.
 *
 * Les variables (#Table.Colonne) sont remplacées par les données du projet, comme le fait Publipostage+ pour ce
 * qu'un lien mailto: peut porter : colonne simple, chemin de références (Porteur_1.Email), table liée par une règle
 * « Tables liées » (Publipostage_LiensTables), format date et nombre, texte avant / après. Ce que le widget ne sait
 * PAS évaluer (conditions, boucles, calculs, certaines puces) n'est jamais deviné : il est signalé à la personne
 * avant l'ouverture du brouillon (`issues`).
 *
 * Module sans état : le modèle choisi et la messagerie (Standard / Zimbra) sont des préférences de la page
 * Administratif, passées à `prepare()`.
 *
 * Port volontairement réduit de Publipostage+ (lombre33/publipostageGrist : js/mailto-export.js, js/variables.js,
 * js/variable-format.js) : si leur comportement change, ce fichier ne suit pas tout seul.
 */
(function (global) {
  'use strict';

  const MODELS_TABLE = 'Publipostage_Modeles';
  const LINKS_TABLE = 'Publipostage_LiensTables';
  const MAIL_TYPE = 'email';
  const SAFE_URL_LENGTH = 2000;
  const TRIGGER = '#';
  const CLIENTS = ['standard', 'zimbra'];

  const text = value => (value == null ? '' : String(value));
  const codedError = (code, message) => Object.assign(new Error(message), { code });

  // ───────────────────────── Adresses et lien mailto: ─────────────────────────

  // Les adresses d'un champ À / Cc / Cci, une à une : séparées par virgule, point-virgule ou saut de ligne. Un saut de
  // ligne ne reste jamais dans une adresse (sinon « Bcc: … » collé à la suite serait une injection d'en-tête).
  const addressesOf = value => (!value ? [] : String(value).split(/[,;\r\n\u2028\u2029]/).map(address => address.trim()).filter(Boolean));
  // Contrôle de FORME (« nom@domaine.xx » ou « Nom <nom@domaine.xx> »), jamais de l'existence de la boîte.
  function looksLikeAddress(address) {
    const bare = String(address).replace(/^.*<([^<>]+)>\s*$/, '$1').trim();
    return /^[^\s@<>,;()"]+@[^\s@<>,;()"]+\.[^\s@<>,;()"]+$/.test(bare);
  }
  const encodeAddressList = value => addressesOf(value).map(address => encodeURIComponent(address)).join(',');
  const oneLine = value => String(value).replace(/[\r\n\u2028\u2029]+/g, ' ');
  // Zimbra décode tout le lien avant de le lire : il coupe chaque champ au premier « & », encode « < » et « > » en HTML et
  // transforme « + » en espace. Leur forme large (U+FF06, U+FF1C, U+FF1E, U+FF0B) passe telle quelle et se lit pareil.
  const ZIMBRA_WIDE_FORMS = { '&': 0xFF06, '<': 0xFF1C, '>': 0xFF1E, '+': 0xFF0B };
  const forZimbra = value => value.replace(/[&<>+]/g, sign => String.fromCharCode(ZIMBRA_WIDE_FORMS[sign]));

  function buildMailtoUrl({ to, cc, bcc, subject, bodyText, client }) {
    const zimbra = client === 'zimbra';
    const params = [];
    if (cc) params.push('cc=' + encodeAddressList(cc));
    if (bcc) params.push('bcc=' + encodeAddressList(bcc));
    const subjectLine = subject ? oneLine(subject) : '';
    if (subjectLine) params.push('subject=' + encodeURIComponent(zimbra ? forZimbra(subjectLine) : subjectLine));
    // CRLF exigé par le protocole (RFC 6068) : Outlook bureau y est strict.
    if (bodyText) params.push('body=' + encodeURIComponent((zimbra ? forZimbra(bodyText) : bodyText).replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')));
    // Zimbra relit le premier paramètre une seconde fois : un « cc » vide en tête reçoit cette seconde lecture.
    if (zimbra && params.length) params.unshift('cc=');
    return 'mailto:' + encodeAddressList(to) + (params.length ? '?' + params.join('&') : '');
  }
  const checkUrlLength = url => ({ length: url.length, safe: url.length <= SAFE_URL_LENGTH, limit: SAFE_URL_LENGTH });

  // Ouvre le lien par un <a> synthétique (plus prévisible que window.location dans l'iframe d'un widget Grist).
  function openLink(url) {
    const link = document.createElement('a');
    link.href = url;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // ───────────────────────── HTML d'un modèle → texte brut ─────────────────────────

  const IGNORED_TAGS = new Set(['IMG', 'STYLE', 'SCRIPT']);
  const BULLET_MARKERS = { disc: '• ', circle: '° ', square: '* ' };
  const isLineBlock = node => node.nodeType === 1 && /^(P|DIV|H[1-6]|PRE)$/.test(node.tagName);
  const endLine = out => (out === '' || out.endsWith('\n') ? out : out + '\n');
  const alphaOf = n => (n >= 1 && n <= 26 ? String.fromCharCode(96 + n) : String(n));
  function romanOf(n) {
    const table = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
    let rest = n, out = '';
    table.forEach(([value, sign]) => { while (n > 0 && rest >= value) { out += sign; rest -= value; } });
    return out || String(n);
  }

  function listMarker(listEl, li, position) {
    if (listEl.getAttribute('data-type') === 'taskList') return li.getAttribute('data-checked') === 'true' ? '[x] ' : '[ ] ';
    if (listEl.tagName === 'OL') {
      const number = (parseInt(listEl.getAttribute('start') || '1', 10) || 1) + position;
      const style = listEl.getAttribute('data-number-style');
      if (style === 'alpha') return alphaOf(number) + '. ';
      if (style === 'roman') return romanOf(number) + '. ';
      return number + '. ';
    }
    return BULLET_MARKERS[listEl.getAttribute('data-bullet-style')] || BULLET_MARKERS.disc;
  }

  // Un lien : l'adresse s'écrit à la suite du texte, entre parenthèses (sauf si le texte est déjà l'adresse).
  function linkAsText(label, href) {
    const target = href.replace(/^(?:mailto|tel):/i, '');
    const shown = label.trim();
    if (!shown) return target;
    const bare = value => value.replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase();
    return bare(shown) === bare(target) ? label : `${label} (${target})`;
  }
  // Seuls http(s), mailto et tel : sortent en texte ; tout autre schéma (javascript:, data:…) n'est jamais écrit.
  const safeHref = href => (/^(?:https?:|mailto:|tel:)/i.test(String(href || '').trim()) ? String(href).trim() : '');

  function listOrQuoteText(el) {
    if (el.tagName === 'UL' || el.tagName === 'OL') return listLines(el).join('\n');
    if (el.tagName === 'BLOCKQUOTE') return quoteText(el);
    return null;
  }
  function specialInlineText(child) {
    if (child.tagName === 'A') {
      const href = safeHref(child.getAttribute('href'));
      if (href) return linkAsText(inlineText(child), href);
    }
    if (child.classList && child.classList.contains('footnote-ref-marker')) {
      const note = (child.getAttribute('data-note-text') || '').trim();
      return note ? ` (${note})` : '';
    }
    return null;
  }
  function appendInlineChild(acc, child) {
    if (child.nodeType === 3) { acc.out += child.textContent; return; }
    if (child.nodeType !== 1) return;
    if (isLineBlock(child)) { if (acc.sawLineBlock) acc.out += '\n'; acc.sawLineBlock = true; }
    if (child.tagName === 'BR') { if (!child.classList.contains('pp-blank-line')) acc.out += '\n'; return; }
    const nested = listOrQuoteText(child);
    if (nested !== null) {
      if (nested) { acc.out = endLine(acc.out) + nested + '\n'; acc.sawLineBlock = false; }
      return;
    }
    const special = specialInlineText(child);
    if (special !== null) { acc.out += special; return; }
    if (IGNORED_TAGS.has(child.tagName)) return;
    acc.out += inlineText(child);
  }
  function inlineText(node) {
    const acc = { out: '', sawLineBlock: false };
    node.childNodes.forEach(child => appendInlineChild(acc, child));
    return acc.out;
  }
  function listLines(listEl) {
    const lines = [];
    let position = 0;
    Array.from(listEl.children).forEach(li => {
      if (li.tagName !== 'LI') return;
      const marker = listMarker(listEl, li, position++);
      const pad = ' '.repeat(marker.length);
      inlineText(li).trim().split('\n').forEach((line, index) => lines.push(((index === 0 ? marker : pad) + line).replace(/[ \t]+$/, '')));
    });
    return lines;
  }
  function quoteText(node) {
    const inner = inlineText(node).trim();
    if (!inner) return '';
    return inner.split('\n').map(line => (line.trim() === '' ? '>' : (line.startsWith('>') ? '>' : '> ') + line)).join('\n');
  }
  const pushLines = (lines, value) => value.split('\n').forEach(line => lines.push(line));

  function collectBlocks(container, lines) {
    container.childNodes.forEach(node => {
      if (node.nodeType === 3) {
        const value = node.textContent.trim();
        if (value) pushLines(lines, value);
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName;
      const nested = listOrQuoteText(node);
      if (nested !== null) { if (nested) pushLines(lines, nested); return; }
      if (/^H[1-6]$/.test(tag) || tag === 'P') { pushLines(lines, inlineText(node)); return; }
      if (tag === 'PRE') {
        const code = (node.textContent || '').replace(/^\n+|\s+$/g, '');
        if (code) pushLines(lines, code);
        return;
      }
      if (node.classList.contains('callout')) { collectBlocks(node, lines); return; }
      if (tag === 'HR') { lines.push('---'); return; }
      if (IGNORED_TAGS.has(tag)) return;
      if (tag === 'TABLE') {
        const rows = Array.from(node.querySelectorAll('tr')).map(tr => Array.from(tr.querySelectorAll('td, th')).map(cell => inlineText(cell).trim()).join(' | '));
        if (rows.length) pushLines(lines, rows.join('\n'));
        return;
      }
      const fallback = inlineText(node).trim();
      if (fallback) pushLines(lines, fallback);
    });
  }
  // Une ligne du texte = une ligne de l'éditeur de Publipostage+ (un paragraphe vide est une ligne vide) ; les espaces de fin
  // de ligne et les lignes vides de fin de texte ne sont pas écrits.
  function plainTextFromNode(root) {
    const lines = [];
    collectBlocks(root, lines);
    return lines.map(line => line.replace(/[ \t]+$/, '')).join('\n').replace(/\n+$/, '');
  }
  // Le HTML est lu dans un <template> : inerte, rien ne se charge ni ne s'exécute.
  function parseHtml(html) {
    const holder = document.createElement('template');
    holder.innerHTML = html || '';
    return holder.content;
  }
  const plainTextFromHtml = html => plainTextFromNode(parseHtml(html));

  // ───────────────────────── Schéma, règles, lecture des tables ─────────────────────────

  const referenceOf = type => {
    const found = /^(Ref|RefList):(.+)$/.exec(String(type || ''));
    return found ? { table: found[2], list: found[1] === 'RefList' } : null;
  };
  const isCellError = value => Array.isArray(value) && value[0] === 'E';
  const unwrapRef = value => (Array.isArray(value) ? value[1] : value);
  const isInternalTable = tableId => /^_grist_/.test(tableId) || /_summary_/.test(tableId);
  const isHelperColumn = colId => /^gristHelper_/.test(colId) || colId === 'manualSort';

  // { tableId → Map(colId → { type, display }) } d'après les métadonnées du document ; `display` : la colonne « gristHelper_Display »
  // qui porte ce que montre une Référence.
  function buildSchema(tables, columns) {
    const tableIdByRef = new Map(tables.map(row => [row.id, row.tableId]));
    const colIdByRef = new Map(columns.map(row => [row.id, row.colId]));
    const schema = new Map();
    tables.forEach(row => { if (!isInternalTable(row.tableId)) schema.set(row.tableId, new Map()); });
    columns.forEach(row => {
      const table = schema.get(tableIdByRef.get(row.parentId));
      if (!table || isHelperColumn(row.colId)) return;
      table.set(row.colId, { type: text(row.type) || 'Any', display: row.displayCol ? (colIdByRef.get(row.displayCol) || null) : null });
    });
    return schema;
  }
  // Métadonnées illisibles : types connus du démarrage du widget, sans colonne d'affichage (le texte d'une Référence se
  // déduit alors de la ligne référencée).
  function schemaFromStartup() {
    const schema = new Map();
    const ids = (global.CoreGrist && CoreGrist.knownTableIds && CoreGrist.knownTableIds()) || [];
    ids.forEach(tableId => {
      if (isInternalTable(tableId)) return;
      const types = (CoreGrist.columnTypes && CoreGrist.columnTypes(tableId)) || {};
      const columns = new Map();
      (CoreGrist.knownColumns(tableId) || []).forEach(colId => {
        if (colId !== 'id' && !isHelperColumn(colId)) columns.set(colId, { type: types[colId] || 'Any', display: null });
      });
      schema.set(tableId, columns);
    });
    return schema;
  }

  // Règles « Tables liées » : { 'Cible|Source' → règle }. `TableSource` vide : le lien commun à toutes les tables.
  const pairKey = (target, source) => `${target}|${source || ''}`;
  function buildRules(rows) {
    const rules = new Map();
    rows.forEach(row => {
      rules.set(pairKey(row.TableCible, row.TableSource), {
        mode: row.Mode, colonneCible: text(row.ColonneCible), colonneSource: text(row.ColonneSource)
      });
    });
    return rules;
  }

  // Environnement d'une préparation : lectures mémorisées pour toute la durée du clic (une table n'est lue qu'une fois).
  async function createEnv(options) {
    const reads = new Map();
    const rows = name => {
      if (!reads.has(name)) reads.set(name, CoreGrist.getTable(name));
      return reads.get(name);
    };
    let schema;
    try { schema = buildSchema(await rows('_grist_Tables'), await rows('_grist_Tables_column')); }
    catch (err) { schema = schemaFromStartup(); }
    let rules = new Map();
    try { rules = buildRules(await rows(LINKS_TABLE)); } catch (err) { /* aucune règle : colonnes Référence seulement */ }
    return { rows, schema, rules, now: (options && options.now) || (() => new Date()) };
  }
  const columnInfo = (env, table, column) => (env.schema.get(table) && env.schema.get(table).get(column)) || null;

  // ───────────────────────── Valeurs des cellules ─────────────────────────

  // Une date que montre une Référence arrive sous la forme ['d', secondes] ou ['D', secondes, fuseau] ; une liste, ['L', …].
  function decodeShown(value) {
    if (!Array.isArray(value)) return value;
    if (value[0] === 'L') return value.slice(1).map(decodeShown);
    if ((value[0] === 'd' || value[0] === 'D') && typeof value[1] === 'number' && isFinite(value[1])) {
      const date = new Date(value[1] * 1000);
      if (value[0] === 'D' && value[2]) date.timezone = value[2];
      return date;
    }
    return value;
  }
  const LABEL_COLUMNS = ['nom_et_Prenom', 'Acronyme', 'Nom', 'NOM', 'Name', 'Titre', 'Libelle', 'Intitule', 'Projet'];
  function labelOfRow(row) {
    const found = LABEL_COLUMNS.find(colId => typeof row[colId] === 'string' && row[colId].trim());
    if (found) return row[found];
    const other = Object.keys(row).find(key => key !== 'id' && !isHelperColumn(key) && typeof row[key] === 'string' && row[key].trim());
    return other ? row[other] : '';
  }
  // La valeur d'une cellule telle que Grist la montre : une Référence prend sa colonne d'affichage, une liste devient un tableau.
  async function cellValue(env, table, column, row) {
    if (!row) return null;
    const value = row[column];
    if (isCellError(value)) return value;
    const info = columnInfo(env, table, column);
    const reference = referenceOf(info && info.type);
    if (!reference) return decodeShown(value);
    const ids = reference.list ? (Array.isArray(value) && value[0] === 'L' ? value.slice(1) : []) : (value ? [value] : []);
    if (!ids.length) return reference.list ? [] : null;
    if (info.display && info.display in row) return decodeShown(row[info.display]);
    // Pas de colonne d'affichage lisible : le texte de la ligne référencée.
    const target = new Map((await env.rows(reference.table)).map(r => [r.id, r]));
    const labels = ids.map(id => (target.has(id) ? labelOfRow(target.get(id)) : ''));
    return reference.list ? labels : labels[0];
  }

  // ───────────────────────── Lignes visées par une variable ─────────────────────────

  const lowestRow = rows => rows.reduce((min, row) => (!min || row.id < min.id ? row : min), null);
  const ruleFor = (env, target, page) => {
    const own = env.rules.get(pairKey(target, page));
    const rule = own || env.rules.get(pairKey(target, ''));
    return rule && ruleApplies(env, rule, page) ? rule : null;
  };
  // Une règle « match » lit la colonne source dans la ligne de la page : sans cette colonne, elle ne s'applique pas à cette page.
  function ruleApplies(env, rule, page) {
    if (rule.mode !== 'match' || rule.colonneSource === 'id') return true;
    const first = rule.colonneSource.split('.')[0];
    return !!columnInfo(env, page, first);
  }
  async function ruleSourceValue(env, rule, page, row) {
    const source = rule.colonneSource;
    if (source === 'id') return row.id;
    if (source.indexOf('.') !== -1) {
      const hops = source.split('.');
      const column = hops.pop();
      const found = await followHops(env, page, hops, [row]);
      if (found.error) return null;
      const target = found.rows.find(Boolean);
      if (!target) return null;
      return rule.colonneCible === 'id' ? unwrapRef(target[column]) : cellValue(env, found.table, column, target);
    }
    return rule.colonneCible === 'id' ? unwrapRef(row[source]) : cellValue(env, page, source, row);
  }
  async function matchingRows(env, target, rule, wanted) {
    const expected = String(wanted).trim();
    const is = value => String(value).trim() === expected;
    const rows = await env.rows(target);
    if (rule.colonneCible === 'id') return rows.filter(row => is(row.id));
    const reference = referenceOf((columnInfo(env, target, rule.colonneCible) || {}).type);
    if (!reference) return rows.filter(row => is(unwrapRef(row[rule.colonneCible])));
    const matches = [];
    for (const row of rows) {
      const numbers = reference.list ? (Array.isArray(row[rule.colonneCible]) ? row[rule.colonneCible].slice(1) : []) : [unwrapRef(row[rule.colonneCible])];
      if (numbers.some(is)) { matches.push(row); continue; }
      if (rule.colonneSource !== 'id' && expected !== '') {
        const shown = await cellValue(env, target, rule.colonneCible, row);
        if ((Array.isArray(shown) ? shown : [shown]).some(item => item != null && is(item))) matches.push(row);
      }
    }
    return matches;
  }
  // Les colonnes de `from` qui désignent `to` (Référence simple).
  const referenceColumns = (env, from, to) => Array.from((env.schema.get(from) || new Map()).entries())
    .filter(([, info]) => { const ref = referenceOf(info.type); return ref && !ref.list && ref.table === to; }).map(([colId]) => colId);

  async function baseRows(env, varTable, context) {
    if (varTable === context.table) return { rows: [context.row] };
    const rule = ruleFor(env, varTable, context.table);
    if (rule) {
      if (rule.mode === 'singleton') {
        const first = lowestRow(await env.rows(varTable));
        return { rows: first ? [first] : [] };
      }
      const wanted = await ruleSourceValue(env, rule, context.table, context.row);
      if (wanted === undefined || wanted === null) return { rows: [], multi: true };
      return { rows: await matchingRows(env, varTable, rule, wanted), multi: true };
    }
    const [refColumn] = referenceColumns(env, context.table, varTable);
    if (!refColumn) return { error: `aucune liaison de ${context.table} vers ${varTable}` };
    const id = unwrapRef(context.row[refColumn]);
    if (!id) return { rows: [] };
    const linked = (await env.rows(varTable)).find(row => row.id === id);
    return linked ? { rows: [linked] } : { error: `ligne introuvable dans ${varTable}` };
  }
  async function followReference(env, table, column, rows) {
    const reference = referenceOf((columnInfo(env, table, column) || {}).type);
    if (!reference) return { error: `${table}.${column} n'est pas une référence` };
    const byId = new Map((await env.rows(reference.table)).map(row => [row.id, row]));
    if (reference.list) {
      const listed = [];
      rows.forEach(row => { if (row && Array.isArray(row[column])) row[column].slice(1).forEach(id => { if (byId.has(id)) listed.push(byId.get(id)); }); });
      return { table: reference.table, rows: listed, many: true };
    }
    return { table: reference.table, rows: rows.map(row => (row && byId.get(unwrapRef(row[column]))) || null), many: false };
  }
  async function followHops(env, startTable, hops, startRows) {
    let table = startTable, rows = startRows, multi = false;
    for (const hop of hops) {
      const step = await followReference(env, table, hop, rows);
      if (step.error) return step;
      ({ table, rows } = step);
      multi = multi || step.many;
    }
    return { table, rows, multi };
  }

  // La valeur brute d'une variable (avant mise en forme) pour UN contexte : { value, type, multi } ou { error }.
  async function resolveIn(env, varTable, varColumn, context) {
    const hops = String(varColumn).split('.');
    const column = hops.pop();
    if (!env.schema.has(varTable)) return { error: `table ${varTable} introuvable` };
    const base = await baseRows(env, varTable, context);
    if (base.error) return { error: base.error };
    const path = await followHops(env, varTable, hops, base.rows);
    if (path.error) return { error: path.error };
    const info = columnInfo(env, path.table, column);
    if (!info) return { error: `colonne ${path.table}.${column} introuvable` };
    const values = [];
    for (const row of path.rows) values.push(row ? await cellValue(env, path.table, column, row) : null);
    const multi = !!base.multi || path.multi;
    if (!multi) return { value: values.length ? values[0] : null, type: info.type };
    return { value: values.length ? values : null, type: info.type, multi: true };
  }
  // Le premier contexte qui sait lire la variable : la fiche Notifications du projet (la table de la vue Publipostage+ habituelle,
  // dont partent les règles « Tables liées »), sinon la ligne du projet.
  async function resolveRaw(env, varTable, varColumn, contexts) {
    let firstError = null;
    for (const context of contexts) {
      const result = await resolveIn(env, varTable, varColumn, context);
      if (!result.error) return result;
      firstError = firstError || result;
    }
    return firstError || { error: 'aucun contexte' };
  }

  // ───────────────────────── Mise en forme des valeurs ─────────────────────────

  const DATE_OPTIONS = {
    dmy_slash_full: { day: '2-digit', month: '2-digit', year: 'numeric' },
    d_mmm_yyyy: { day: 'numeric', month: 'short', year: 'numeric' },
    d_mmmm_yyyy: { day: 'numeric', month: 'long', year: 'numeric' },
    ddd_d_mmm_yyyy: { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' },
    dddd_d_mmmm_yyyy: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
  };
  const dateTimeZoneOf = type => { const found = /^DateTime:(.+)$/.exec(String(type || '')); return found ? found[1] : null; };
  function validZone(zone) {
    if (!zone) return 'UTC';
    try { new Intl.DateTimeFormat('fr-FR', { timeZone: zone }); return zone; } catch (err) { return 'UTC'; }
  }
  const two = n => String(n).padStart(2, '0');
  function formatDate(date, format, type) {
    const zone = validZone(dateTimeZoneOf(type) || date.timezone);
    const preset = (format && format.preset) || 'dmy_slash_full';
    const clock = {};
    new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
      .formatToParts(date).forEach(part => { clock[part.type] = Number(part.value); });
    let out;
    if (preset === 'iso') out = `${clock.year}-${two(clock.month)}-${two(clock.day)}`;
    else if (preset === 'dmy_slash_short') out = `${clock.day}/${clock.month}/${String(clock.year).slice(-2)}`;
    else {
      const options = DATE_OPTIONS[preset] || DATE_OPTIONS.dmy_slash_full;
      const parts = new Intl.DateTimeFormat('fr-FR', Object.assign({ timeZone: zone }, options)).formatToParts(date);
      const named = options.month === 'short' || options.month === 'long';
      out = parts.map(part => (part.type === 'day' && named && clock.day === 1 ? '1er' : part.value)).join('');
    }
    if (format && format.time && dateTimeZoneOf(type)) {
      out += format.time === 'natural' ? ` ${clock.hour} h ${two(clock.minute)}` : ` ${two(clock.hour)}:${two(clock.minute)}`;
    }
    return out;
  }
  function formatNumber(value, format) {
    format = format || {};
    const intl = {};
    if (format.decimals != null) {
      intl.minimumFractionDigits = format.decimals;
      intl.maximumFractionDigits = Math.max(format.decimals, format.maxDecimals != null ? format.maxDecimals : format.decimals);
    }
    if (format.percent) intl.style = 'percent';
    if (format.style === 'none') intl.useGrouping = false;
    const locale = format.style === 'us' ? 'en-US' : 'fr-FR';
    const grouped = new Intl.NumberFormat(locale, intl).format(value).replace(/ /g, ' ');
    if (format.currency && !format.percent) return locale === 'fr-FR' ? `${grouped} ${format.currency}` : `${format.currency}${grouped}`;
    return grouped;
  }
  const isZeroLike = value => (typeof value === 'number' ? value === 0 : typeof value === 'string' && /^\s*[-+]?0+(?:[.,]0*)?\s*$/.test(value));
  const isDateType = type => type === 'Date' || /^DateTime:/.test(String(type || ''));
  function toDate(value, type) {
    if (value instanceof Date) return value;
    if (typeof value === 'number' && isDateType(type)) return new Date(value * 1000);
    return null;
  }

  // Le texte d'une valeur. `opts.rawNumbers` : champs texte (Objet, À, Cc, Cci), nombre et booléen tels quels.
  function formatValue(value, format, type, opts) {
    opts = opts || {};
    if (value === null || value === undefined) return '';
    if (isCellError(value)) return '';
    if (Array.isArray(value)) {
      const flat = [];
      const walk = list => list.forEach(item => (Array.isArray(item) ? walk(item) : flat.push(item)));
      walk(value);
      return flat.map(item => formatValue(item, format, type, opts)).filter(Boolean).join(', ');
    }
    if (typeof value === 'boolean') return opts.rawNumbers ? String(value) : (value ? 'vrai' : 'faux');
    const date = toDate(value, type);
    if (date) return Number.isNaN(date.getTime()) ? '' : formatDate(date, format && format.type === 'date' ? format : null, type);
    if (typeof value === 'number') {
      if (opts.rawNumbers) return String(value);
      const numeric = type === 'Numeric' || type === 'Int' || (format && format.type === 'number');
      if (numeric && value === 0 && !(format && format.zero === 'show')) return '';
      if (format && format.type === 'number') return formatNumber(value, format);
      return numeric ? formatNumber(value, null) : String(value);
    }
    if (typeof value === 'object') return '';
    return String(value);
  }

  // ───────────────────────── Variables d'un texte ─────────────────────────

  // Toutes les clés « Table.Colonne » du document, de la plus longue à la plus courte.
  function variableKeys(env) {
    const keys = [];
    env.schema.forEach((columns, table) => columns.forEach((info, column) => keys.push({ table, column, key: `${table}.${column}` })));
    return keys.sort((a, b) => b.key.length - a.key.length);
  }
  // Après « #Table.Colonne », ajoute « .Colonne » tant que le texte suit un chemin de références (la colonne la plus longue l'emporte).
  function extendKeyPath(env, table, column, value, from) {
    let path = column, end = from;
    for (;;) {
      // La table où mène le chemin : chaque maillon doit être une colonne Référence.
      let reached = table;
      for (const hop of path.split('.')) {
        const ref = reached && referenceOf((columnInfo(env, reached, hop) || {}).type);
        reached = ref ? ref.table : null;
      }
      if (!reached) break;
      const next = Array.from((env.schema.get(reached) || new Map()).keys()).filter(colId => value.startsWith('.' + colId, end)).sort((a, b) => b.length - a.length)[0];
      if (!next) break;
      path += '.' + next;
      end += 1 + next.length;
    }
    return { column: path, end };
  }
  function findTextVariables(env, value) {
    const keys = variableKeys(env);
    const found = [];
    let at = value.indexOf(TRIGGER);
    while (at !== -1) {
      const keyAt = at + 1;
      const base = keys.find(item => value.startsWith(item.key, keyAt));
      if (base) {
        const path = extendKeyPath(env, base.table, base.column, value, keyAt + base.key.length);
        found.push({ start: at, end: path.end, table: base.table, column: path.column });
        at = value.indexOf(TRIGGER, path.end);
      } else {
        at = value.indexOf(TRIGGER, keyAt);
      }
    }
    return found;
  }

  // ───────────────────────── Résolution d'un texte ou d'un corps ─────────────────────────

  const FEATURE_LABELS = {
    condition: 'conditions', loop: 'boucles', calc: 'calculs', conditionalText: 'textes conditionnels',
    chip: 'puces (nom ou e-mail de l\'utilisateur, n° de ligne…)', words: 'nombres en toutes lettres'
  };
  const newReport = () => ({ unresolved: new Set(), unsupported: new Set() });
  const jsonAttr = (el, name) => { try { const raw = el.getAttribute(name); return raw ? JSON.parse(raw) : null; } catch (err) { return null; } };

  // La valeur d'une bulle (#Variable) en texte, avec « Avant » / « Après » ; un échec est noté dans le rapport.
  async function badgeText(env, contexts, report, badge, opts) {
    const table = badge.getAttribute('data-table'), column = badge.getAttribute('data-column');
    const format = jsonAttr(badge, 'data-format');
    if (jsonAttr(badge, 'data-condition')) report.unsupported.add('condition');
    if (jsonAttr(badge, 'data-loop')) report.unsupported.add('loop');
    if (format && format.words) report.unsupported.add('words');
    const resolved = await resolveRaw(env, table, column, contexts);
    if (resolved.error) {
      report.unresolved.add(`${table}.${column}`);
      return opts.silentErrors ? '' : `[?${table}.${column}]`;
    }
    const value = formatValue(resolved.value, format, resolved.type, opts);
    if (!value) return '';
    return text(badge.getAttribute('data-before')) + value + text(badge.getAttribute('data-after'));
  }
  // Une puce : date du jour, heure, smiley. Les autres ne se calculent pas ici.
  function chipText(env, report, chip) {
    const kind = chip.getAttribute('data-chip-kind') || 'date';
    const now = env.now();
    if (kind === 'date') return formatDate(now, null, 'DateTime:' + (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'));
    if (kind === 'time') return `${two(now.getHours())}:${two(now.getMinutes())}`;
    if (kind === 'emoji') return chip.getAttribute('data-chip-emoji') || chip.textContent;
    if (kind === 'footnote') return null;
    report.unsupported.add(/^(?:conditional|calc)/.test(kind) ? 'conditionalText' : 'chip');
    return '';
  }
  // Remplace, dans un fragment, chaque bulle et chaque puce par son texte. Ce qui dépend d'une évaluation (condition, boucle, calcul,
  // bloc conditionnel) n'est pas évalué : signalé.
  async function substituteIn(root, env, contexts, report, opts) {
    const badges = Array.from(root.querySelectorAll('span.var-badge'));
    const texts = await Promise.all(badges.map(badge => badgeText(env, contexts, report, badge, opts)));
    badges.forEach((badge, index) => badge.replaceWith(document.createTextNode(texts[index])));
    root.querySelectorAll('span.smart-chip').forEach(chip => {
      const value = chipText(env, report, chip);
      if (value !== null) chip.replaceWith(document.createTextNode(value));
    });
    if (root.querySelector('span.calc-badge')) report.unsupported.add('calc');
    root.querySelectorAll('span.calc-badge').forEach(el => el.remove());
    if (root.querySelector('div.conditional-text, span.conditional-value, [data-type="conditional-checkbox"], .conditional-checkbox')) report.unsupported.add('conditionalText');
    if (root.querySelector('[data-loop]')) report.unsupported.add('loop');
  }

  async function resolveBody(env, contexts, report, html) {
    const root = parseHtml(html);
    await substituteIn(root, env, contexts, report, {});
    return plainTextFromNode(root);
  }
  // Objet, À, Cc, Cci : du texte brut « #Table.Colonne », ou, dès qu'une bulle porte un réglage, un <p class="pp-field"> avec des bulles.
  const isRichField = value => typeof value === 'string' && value.startsWith('<p class="pp-field">') && value.endsWith('</p>');
  async function resolveField(env, contexts, report, raw, opts) {
    const value = text(raw);
    if (!value) return '';
    const options = Object.assign({ rawNumbers: true }, opts);
    if (isRichField(value)) {
      const root = parseHtml(value);
      await substituteIn(root, env, contexts, report, options);
      return root.textContent.trim();
    }
    const matches = findTextVariables(env, value);
    if (!matches.length) return value;
    const texts = await Promise.all(matches.map(async match => {
      const resolved = await resolveRaw(env, match.table, match.column, contexts);
      if (resolved.error) {
        report.unresolved.add(`${match.table}.${match.column}`);
        return options.silentErrors ? '' : `[?${match.table}.${match.column}]`;
      }
      return formatValue(resolved.value, null, resolved.type, options);
    }));
    let last = 0, out = '';
    matches.forEach((match, index) => { out += value.slice(last, match.start) + texts[index]; last = match.end; });
    return out + value.slice(last);
  }

  // ───────────────────────── API ─────────────────────────

  const modelOf = row => ({
    id: row.id, name: text(row.Nom), type: text(row.TypeModele) || 'document', content: text(row.Contenu),
    subject: text(row.Objet), to: text(row.Destinataires), cc: text(row.Cc), bcc: text(row.Cci)
  });
  async function loadModels(env) {
    let rows;
    try { rows = await env.rows(MODELS_TABLE); }
    catch (err) { throw codedError('models-table-missing', `Table ${MODELS_TABLE} introuvable dans le document`); }
    return rows.map(modelOf).filter(model => model.type !== 'reglages' && model.name.trim());
  }
  // Les noms des modèles de type « e-mail » (Publipostage+), par ordre alphabétique.
  async function listEmailModels() {
    const env = { rows: name => CoreGrist.getTable(name) };
    const models = (await loadModels(env)).filter(model => model.type === MAIL_TYPE);
    const names = Array.from(new Set(models.map(model => model.name)));
    return names.sort((a, b) => a.localeCompare(b, 'fr')).map(name => ({ name }));
  }

  // Les lignes d'où lire une variable : la fiche Notifications du projet d'abord (la table de la vue Publipostage+ habituelle), puis le projet.
  async function contextsFor(env, projectRow) {
    const contexts = [];
    if (env.schema.has('Notifications') && columnInfo(env, 'Notifications', 'Projet')) {
      try {
        const sheet = (await env.rows('Notifications')).find(row => unwrapRef(row.Projet) === projectRow.id);
        if (sheet) contexts.push({ table: 'Notifications', row: sheet });
      } catch (err) { /* pas de fiche Notifications : le projet seul */ }
    }
    contexts.push({ table: 'Projets', row: projectRow });
    return contexts;
  }

  const ISSUE_TEXT = {
    unresolved: issue => `${issue.keys.length} variable${issue.keys.length > 1 ? 's' : ''} sans valeur lisible : ${issue.keys.join(', ')}`,
    unsupported: issue => `Le modèle contient des ${issue.labels.join(', ')} que le widget n'évalue pas : relisez le mail`,
    badAddress: issue => `Adresse qui ne ressemble pas à une adresse e-mail : ${issue.address}`,
    noRecipient: () => 'Le destinataire du modèle n\'a donné aucune adresse pour ce projet',
    tooLong: issue => `Lien de ${issue.length} caractères (limite sûre : ${issue.limit}) : certaines messageries le tronqueront`
  };
  const issueText = issue => (ISSUE_TEXT[issue.kind] ? ISSUE_TEXT[issue.kind](issue) : issue.kind);

  // Prépare le brouillon d'un projet. Rend { url, fields, bodyText, length, issues, modelName }.
  // Erreurs (`error.code`) : 'models-table-missing', 'model-missing', 'project-missing'.
  async function prepare({ project, modelName, client, now }) {
    const env = await createEnv({ now });
    const model = (await loadModels(env)).find(item => item.type === MAIL_TYPE && item.name === modelName);
    if (!model) throw codedError('model-missing', `Modèle « ${modelName} » introuvable parmi les modèles e-mail`);
    const projectRow = (await env.rows('Projets')).find(row => row.id === Number(project.id));
    if (!projectRow) throw codedError('project-missing', 'Projet introuvable dans Grist');
    const contexts = await contextsFor(env, projectRow);
    const report = newReport();
    const [subject, to, cc, bcc] = await Promise.all([
      resolveField(env, contexts, report, model.subject, {}),
      resolveField(env, contexts, report, model.to, { silentErrors: true }),
      resolveField(env, contexts, report, model.cc, { silentErrors: true }),
      resolveField(env, contexts, report, model.bcc, { silentErrors: true })
    ]);
    const bodyText = await resolveBody(env, contexts, report, model.content);
    const url = buildMailtoUrl({ to, cc, bcc, subject, bodyText, client: CLIENTS.includes(client) ? client : 'standard' });
    const issues = [];
    if (report.unresolved.size) issues.push({ kind: 'unresolved', keys: Array.from(report.unresolved) });
    if (report.unsupported.size) issues.push({ kind: 'unsupported', labels: Array.from(report.unsupported).map(key => FEATURE_LABELS[key] || key) });
    const everyone = addressesOf(to).concat(addressesOf(cc), addressesOf(bcc));
    const bad = everyone.find(address => !looksLikeAddress(address));
    if (bad) issues.push({ kind: 'badAddress', address: bad });
    else if (!everyone.length && (model.to.trim() || model.cc.trim() || model.bcc.trim())) issues.push({ kind: 'noRecipient' });
    const check = checkUrlLength(url);
    if (!check.safe) issues.push({ kind: 'tooLong', length: check.length, limit: check.limit });
    return { url, fields: { to, cc, bcc, subject }, bodyText, length: check.length, issues, modelName: model.name };
  }

  global.VisaMail = {
    CLIENTS, MODELS_TABLE, SAFE_URL_LENGTH,
    prepare, listEmailModels, issueText, openLink,
    // Exposés pour les tests.
    buildMailtoUrl, plainTextFromHtml, checkUrlLength, addressesOf, looksLikeAddress, formatValue, formatDate
  };
}(window));
