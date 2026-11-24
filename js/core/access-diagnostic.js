/**
 * Diagnostic des droits d'accès Grist (demande d'Antoine du 24/11/2026).
 *
 * Grist peut cacher ou interdire au compte qui ouvre le widget : une table entière, certaines colonnes, certaines lignes, l'écriture
 * (ou seulement celle de certaines colonnes), la création de tables et de colonnes… Le widget voit alors, au mieux, des listes vides, des
 * numéros de ligne à la place des noms, des projets absents du Kanban, au pire un « Échec de l'écriture (Blocked by table update access
 * rules) » qui ne dit ni quelle table, ni quelle règle, ni quoi vérifier. Ce module dit tout cela, partout où le widget s'affiche mal :
 *
 *  - classify(err)  : de quelle sorte d'erreur Grist s'agit-il ? (règle d'accès de table / de colonne, lecture seule, table ou colonne
 *    absente, colonne calculée, niveau d'accès du widget, réseau…). Les messages reconnus sont ceux du code source de Grist
 *    (GranularAccess.ts, ActiveDoc.ts, useractions.py, WidgetFrame.ts) ;
 *  - explain(err, ctx) : l'explication complète en français (où, pourquoi, que vérifier dans Grist, message brut) ;
 *  - instrument(docApi) : chaque lecture / écriture ratée est enregistrée avec son contexte (table, ligne, colonnes écrites) SANS appel
 *    Grist de plus : aucun des appels existants n'est modifié, seul leur échec est annoté ;
 *  - un journal des refus, l'état de lecture de chaque table (lignes, colonnes reçues), les colonnes attendues par les pages
 *    (js/core/access-expectations.js) et absentes, les références qui ne se résolvent plus (ligne cachée ou supprimée), l'identité ;
 *  - l'affichage : pastille ⚠ dans l'en-tête et dans la barre de filtres des pages concernées (rien tant que tout va bien : aucune ligne
 *    ajoutée), infobulles, message d'erreur détaillé (toast cliquable / bandeau des modales), section « Accès » du panneau Alt+Maj+D ;
 *  - probe() : relecture volontaire des tables (« Tester les accès ») et lecture, quand le compte est propriétaire, des règles d'accès
 *    elles-mêmes (_grist_ACLResources / _grist_ACLRules) pour nommer la règle probable.
 *
 * Aucune donnée de projet n'est lue ici : seulement des noms de tables et de colonnes, des nombres de lignes et des numéros de ligne.
 * Ce module ne doit jamais empêcher le widget de fonctionner : tout est dans des try/catch.
 */
(function (global) {
  'use strict';

  const MAX_EVENTS = 80;
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const text = value => value == null ? '' : String(value);
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  const list = items => items.join(', ');
  const unique = items => Array.from(new Set(items));
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const nowIso = () => new Date().toISOString();
  const clock = at => { try { return new Date(at).toLocaleTimeString('fr-FR'); } catch (err) { return at; } };

  // Tables dont l'absence n'est pas une anomalie : créées par le widget à la première utilisation (seul l'échec de leur création l'est),
  // ou facultatives (salles, fichiers de GFS : la page Instances s'en passe).
  const AUTO_TABLE = /^(Preferences_Widget|Instance_[A-Za-z0-9_]+|Export_VP|Import_[A-Za-z0-9_]+|Depenses_OPE|Lieux|GFS_Fichiers)$/;
  const isMetadata = table => table.indexOf('_grist_') === 0;

  // --- 1. Lecture des actions Grist --------------------------------------------------------------------------------------------------
  const ACTION_LABELS = {
    AddRecord: 'ajout d\'une ligne', BulkAddRecord: 'ajout de lignes', UpdateRecord: 'modification d\'une ligne', BulkUpdateRecord: 'modification de lignes',
    RemoveRecord: 'suppression d\'une ligne', BulkRemoveRecord: 'suppression de lignes', AddOrUpdateRecord: 'ajout ou mise à jour d\'une ligne',
    AddTable: 'création de la table', RemoveTable: 'suppression de la table', RenameTable: 'renommage de la table',
    AddColumn: 'création de la colonne', ModifyColumn: 'modification de la colonne', RemoveColumn: 'suppression de la colonne', RenameColumn: 'renommage de la colonne'
  };
  const SCHEMA_ACTIONS = new Set(['AddTable', 'RemoveTable', 'RenameTable', 'AddColumn', 'ModifyColumn', 'RemoveColumn', 'RenameColumn']);

  // Une action {type, label, table, rowIds, columns, schema, metadata} lue dans la liste brute de docApi.applyUserActions.
  function describeAction(action) {
    const out = { type: '?', label: 'action inconnue', table: '', rowIds: [], columns: [], schema: false, metadata: false };
    if (!Array.isArray(action)) return out;
    const type = text(action[0]);
    out.type = type; out.label = ACTION_LABELS[type] || type;
    out.table = typeof action[1] === 'string' ? action[1] : '';
    out.schema = SCHEMA_ACTIONS.has(type);
    out.metadata = isMetadata(out.table);
    if (/Record$/.test(type)) {
      const rows = action[2];
      if (Array.isArray(rows)) out.rowIds = rows.filter(n => typeof n === 'number' && n > 0);
      else if (typeof rows === 'number' && rows > 0) out.rowIds = [rows];
      const values = type === 'AddOrUpdateRecord' ? action[3] : action[3];
      if (values && typeof values === 'object' && !Array.isArray(values)) out.columns = Object.keys(values);
    } else if (type === 'AddTable') {
      out.columns = (Array.isArray(action[2]) ? action[2] : []).map(col => col && col.id).filter(Boolean);
    } else if (SCHEMA_ACTIONS.has(type) && typeof action[2] === 'string') {
      out.columns = [action[2]];
    }
    return out;
  }
  const describeActions = actions => (Array.isArray(actions) ? actions : []).map(describeAction);

  // Regroupe par table : {table, types, columns, rowIds, schema, metadata}.
  function summarizeTargets(actions) {
    const byTable = new Map();
    describeActions(actions).forEach(info => {
      if (!info.table) return;
      const slot = byTable.get(info.table) || { table: info.table, types: [], labels: [], columns: [], rowIds: [], schema: false, metadata: info.metadata };
      slot.types.push(info.type); slot.labels.push(info.label);
      slot.columns.push(...info.columns); slot.rowIds.push(...info.rowIds);
      slot.schema = slot.schema || info.schema;
      byTable.set(info.table, slot);
    });
    return Array.from(byTable.values()).map(slot => Object.assign(slot, { types: unique(slot.types), labels: unique(slot.labels), columns: unique(slot.columns), rowIds: unique(slot.rowIds) }));
  }

  // « modification d'une ligne de la table Projets (ligne 17 ; colonnes A, B) » — pour « Où ».
  function targetPhrase(target) {
    const what = target.labels.length ? list(target.labels) : 'accès';
    const rows = target.rowIds.length ? ` ; ${target.rowIds.length > 1 ? 'lignes' : 'ligne'} ${list(target.rowIds.slice(0, 8))}${target.rowIds.length > 8 ? '…' : ''}` : '';
    const cols = target.columns.length && !target.schema ? ` ; colonnes ${list(target.columns.slice(0, 12))}${target.columns.length > 12 ? '…' : ''}` : (target.schema && target.columns.length ? ` ${list(target.columns.slice(0, 12))}` : '');
    return `${what} — table ${target.table}${rows}${cols}`;
  }

  // --- 2. Classement des erreurs -----------------------------------------------------------------------------------------------------
  const messageOf = err => {
    if (err == null) return '';
    if (typeof err === 'string') return err;
    if (typeof err.message === 'string') return err.message;
    try { return JSON.stringify(err); } catch (e) { return String(err); }
  };

  /**
   * {kind, rule, level, special, table, column, msg, code} — `kind` vaut :
   *  acl (règle d'accès : rule.type table|column|row, rule.action read|update|create|delete|structure), acl-action, owners-only, read-only,
   *  reload, widget-level, no-access, attachment, formula-column, locked, missing-table, missing-column, invalid, network, unknown.
   */
  function classify(err) {
    // Une erreur du widget qui en enveloppe une de Grist (`cause`) : on classe celle de Grist.
    if (err && typeof err === 'object' && err.cause && typeof err.cause === 'object' && err.cause !== err && classify(err.cause).kind !== 'unknown') return classify(err.cause);
    const msg = messageOf(err);
    const code = text(err && err.code);
    const out = { kind: 'unknown', msg, code };
    let m;
    if ((m = msg.match(/Blocked by access rules: '([^']+)' actions need (\w+) access/i))) return Object.assign(out, { kind: 'acl-action', special: m[1], level: m[2] });
    if ((m = msg.match(/Blocked by (\w+) (read|update|create|delete|structure|schemaEdit) access rules/i))) {
      return Object.assign(out, { kind: 'acl', rule: { type: m[1].toLowerCase(), action: m[2] === 'schemaEdit' ? 'structure' : m[2].toLowerCase() } });
    }
    if (/Only owners can modify access rules/i.test(msg) || /Only owners or editors can modify documents/i.test(msg)) return Object.assign(out, { kind: 'owners-only', ownersOnly: /Only owners can/i.test(msg) });
    if (code === 'AUTH_NO_EDIT' || /No write access, document is read-only|read-only/i.test(msg)) return Object.assign(out, { kind: 'read-only' });
    if (code === 'NEED_RELOAD' || /document needs reload/i.test(msg)) return Object.assign(out, { kind: 'reload' });
    if ((m = msg.match(/Access not granted\. Current access level (\w[\w ]*)/i))) return Object.assign(out, { kind: 'widget-level', level: m[1].trim() });
    if (/Cannot access (cell|attachment)|not an attachment column|attachment not present in cell/i.test(msg)) return Object.assign(out, { kind: 'attachment' });
    if ((m = msg.match(/Can'?t save value to formula column (\S+)/i))) return Object.assign(out, { kind: 'formula-column', column: m[1].replace(/[.,;:]+$/, '') });
    if (/locked table/i.test(msg)) return Object.assign(out, { kind: 'locked' });
    if ((m = msg.match(/Table (\S+) has no column (\S+)/i))) return Object.assign(out, { kind: 'missing-column', table: m[1], column: m[2].replace(/[.,;:'"]+$/, '') });
    if (/Invalid column|no such column|unknown column|has no column/i.test(msg)) return Object.assign(out, { kind: 'missing-column' });
    if ((m = msg.match(/(?:no such table|unknown table|table) ['"]?([A-Za-z_][\w]*)['"]? (?:does not exist|not found|is unknown)|(?:no such table|unknown table):? ['"]?([A-Za-z_][\w]*)/i))) {
      return Object.assign(out, { kind: 'missing-table', table: m[1] || m[2] });
    }
    if ((m = msg.match(/KeyError:? ['"]?u?['"]?([A-Za-z_][\w]*)['"]?/))) return Object.assign(out, { kind: 'missing-table', table: m[1], ambiguous: true });
    if (/Invalid args|InvalidTypedValue|ValueError|TypeError|cannot be converted|invalid value/i.test(msg)) return Object.assign(out, { kind: 'invalid' });
    if (/\b40[13]\b|forbidden|access denied|acc[eè]s refus[eé]|not authori[sz]ed|unauthori[sz]ed|no view access|need (view|read|edit|owner)|permission denied|insufficient (access|permission)|ACL_DENY/i.test(msg) || code === 'ACL_DENY') return Object.assign(out, { kind: 'no-access' });
    if (/failed to fetch|networkerror|network error|timed? ?out|timeout|disconnected|connection (lost|closed|reset)|ECONN|net::|load failed/i.test(msg)) return Object.assign(out, { kind: 'network' });
    return out;
  }

  // Un refus de droits (par opposition à une table absente, une valeur invalide, le réseau…).
  const DENIAL_KINDS = new Set(['acl', 'acl-action', 'owners-only', 'read-only', 'widget-level', 'no-access', 'attachment', 'locked']);
  const isDenial = kind => DENIAL_KINDS.has(kind);

  // --- 3. État : lectures, journal, identité, attentes ----------------------------------------------------------------------------------
  const readStates = new Map(); // table → {ok, rows, columns:Set, at, error, kind}
  const events = [];
  const listeners = new Set();
  const expectations = []; // {table, columns, page, label, effect}
  const checks = [];       // {page, label, run:() => [{headline, effect, details}]}
  let identity = null;
  let probeResult = null;  // {at, tables:[{table, ok, rows, columns, error}], rules}
  let aclRules = null;     // {at, byTable:{table:[…]}, error}
  let refreshTimer = null;

  function notify() {
    if (refreshTimer != null) return;
    const fire = () => { refreshTimer = null; try { listeners.forEach(fn => { try { fn(); } catch (err) { /* un afficheur défaillant ne bloque rien */ } }); } catch (err) { /* sans objet */ } };
    refreshTimer = setTimeout(fire, 120);
  }

  function noteRead(table, data) {
    if (!table) return;
    let columns = null, rows = 0;
    try {
      if (data && typeof data === 'object' && !Array.isArray(data)) { columns = new Set(Object.keys(data)); rows = Array.isArray(data.id) ? data.id.length : 0; }
    } catch (err) { /* lecture illisible : on garde ce qu'on sait */ }
    readStates.set(table, { ok: true, rows, columns: columns || new Set(), at: nowIso(), error: '', kind: '' });
    // Une lecture réussie remplace le refus enregistré plus tôt pour cette table (rechargement après un changement de règles, par exemple).
    for (let i = events.length - 1; i >= 0; i--) if (events[i].op === 'read' && events[i].table === table) events.splice(i, 1);
    notify();
  }

  function noteReadFailure(table, err) {
    if (!table) return;
    const cls = classify(err);
    readStates.set(table, { ok: false, rows: 0, columns: new Set(), at: nowIso(), error: cls.msg || 'lecture refusée', kind: cls.kind });
    notify();
  }

  // Annote l'erreur (propriété non énumérable : jamais dans un JSON ni un message) et l'enregistre dans le journal.
  function annotate(err, ctx) {
    try {
      if (err && typeof err === 'object' && !hasOwn(err, 'gristAccess')) Object.defineProperty(err, 'gristAccess', { value: ctx, enumerable: false, configurable: true, writable: true });
    } catch (e) { /* objet figé : l'enregistrement dans le journal suffit */ }
  }

  function levelOf(cls, table) {
    if (isDenial(cls.kind)) return 'denied';
    if (cls.kind === 'missing-table' || cls.kind === 'missing-column') return table && AUTO_TABLE.test(table) ? 'info' : 'missing';
    if (cls.kind === 'network') return 'network';
    return 'error';
  }

  function record(entry) {
    try {
      const cls = classify(entry.error);
      const table = entry.table || cls.table || '';
      const event = {
        at: nowIso(), op: entry.op || '', table, columns: (entry.columns || []).slice(0, 30), rowIds: (entry.rowIds || []).slice(0, 30),
        kind: cls.kind, level: levelOf(cls, table), message: cls.msg, what: entry.what || '', actions: entry.actions || null, count: 1
      };
      const key = [event.op, event.table, event.kind, event.message, event.columns.join(',')].join('|');
      const same = events.find(e => e.key === key);
      if (same) { same.count += 1; same.at = event.at; same.rowIds = unique(same.rowIds.concat(event.rowIds)).slice(0, 30); if (event.what) same.what = event.what; }
      else { event.key = key; events.unshift(event); if (events.length > MAX_EVENTS) events.pop(); }
      notify();
      return same || event;
    } catch (err) { return null; }
  }

  // --- 4. Instrumentation de docApi (aucun appel de plus : seul l'échec est annoté) ---------------------------------------------------
  function instrument(docApi) {
    if (!docApi || typeof docApi !== 'object') return false;
    let touched = false;
    const wrap = (method, describe, onOk) => {
      const original = docApi[method];
      if (typeof original !== 'function' || original.__accessWrapped) return;
      const fail = (err, ctx) => {
        annotate(err, ctx);
        if (ctx.op === 'read') noteReadFailure(ctx.table, err);
        const targets = ctx.actions ? summarizeTargets(ctx.actions) : [];
        const first = targets[0];
        record({ op: ctx.op, table: ctx.table || (first && first.table) || '', columns: first ? first.columns : [], rowIds: first ? first.rowIds : [], error: err, actions: ctx.actions });
        return err;
      };
      const wrapped = function (...args) {
        let ctx;
        try { ctx = describe(args); } catch (e) { ctx = { op: method }; }
        let result;
        try { result = original.apply(this, args); } catch (err) { try { fail(err, ctx); } catch (e) { /* sans objet */ } throw err; }
        if (!result || typeof result.then !== 'function') return result;
        // La promesse d'origine est rendue telle quelle (aucun tour de plus pour l'appelant : l'ordre des continuations ne change pas) ;
        // l'enregistrement se fait sur une branche à part, inscrite avant celle de l'appelant, donc l'erreur est annotée avant qu'il la voie.
        result.then(data => { try { onOk(ctx, data); } catch (e) { /* sans objet */ } }, err => { try { fail(err, ctx); } catch (e) { /* sans objet */ } });
        return result;
      };
      wrapped.__accessWrapped = true;
      try { docApi[method] = wrapped; touched = true; } catch (err) { /* propriété non modifiable : pas d'annotation, les messages restent expliqués */ }
    };
    wrap('fetchTable', args => ({ op: 'read', table: text(args[0]) }), (ctx, data) => noteRead(ctx.table, data));
    wrap('applyUserActions', args => ({ op: 'write', actions: Array.isArray(args[0]) ? args[0] : [] }), () => {});
    return touched;
  }

  // --- 5. Attentes des pages (js/core/access-expectations.js) ------------------------------------------------------------------------
  function expect(table, columns, usage) {
    expectations.push({ table, columns: columns.slice(), page: (usage && usage.page) || '', label: (usage && usage.label) || '', effect: (usage && usage.effect) || '' });
  }
  const usagesOf = table => expectations.filter(e => e.table === table);
  const pagesOf = table => unique(usagesOf(table).map(e => e.label).filter(Boolean));
  function effectsOf(table) {
    const seen = new Set();
    const out = [];
    usagesOf(table).forEach(e => {
      const line = e.effect ? `${e.label} : ${e.effect}` : e.label;
      if (line && !seen.has(line)) { seen.add(line); out.push(line); }
    });
    return out;
  }

  // --- 6. Explication en français ---------------------------------------------------------------------------------------------------
  // « ma***@domaine.fr » : le rapport se copie et se colle (mail, ticket) ; l'adresse complète n'a pas à y figurer.
  function maskEmail(email) {
    const s = text(email).trim();
    const at = s.indexOf('@');
    if (at < 1) return s ? s.slice(0, 2) + '***' : '';
    return s.slice(0, Math.min(2, at)) + '***' + s.slice(at);
  }
  function identityLine() {
    return identity && identity.email ? `Compte détecté par le widget : ${maskEmail(identity.email)}.` : '';
  }

  const GRIST_RULES_PATH = 'Dans Grist, ouvrez « Règles d\'accès » (menu du document ; réservé aux propriétaires : sinon demandez-le à l\'un d\'eux).';
  const GRIST_VIEW_AS = 'Testez avec « Voir en tant que » (même écran) en choisissant l\'adresse concernée : le widget affiche alors exactement ce que Grist lui autorise.';
  const ACTION_NOUN = { read: 'lecture', update: 'modification', create: 'création de ligne', delete: 'suppression de ligne', structure: 'modification de la structure' };
  const RIGHT_LABEL = { read: 'Lecture', update: 'Modification', create: 'Création', delete: 'Suppression', structure: 'Modification de la structure' };

  function ruleHintFor(table, action, columns) {
    let rules = aclRules && aclRules.byTable && aclRules.byTable[table];
    if (rules && columns && columns.length) rules = rules.filter(rule => !rule.columns || rule.columns === '*' || rule.columns.split(',').some(col => columns.includes(col.trim())));
    if (!rules || !rules.length) return '';
    const bit = { read: 'R', update: 'U', create: 'C', delete: 'D', structure: 'S' }[action];
    const denying = rules.filter(rule => bit && new RegExp('-[RUCDS]*' + bit).test(rule.permissions) || /(^|\s)(none|-all)(\s|$)/.test(rule.permissions));
    const shown = (denying.length ? denying : rules).slice(0, 4);
    return `Règles lues dans Grist pour ${table === '*' ? 'toutes les tables' : 'la table ' + table} : ` + shown.map(rule => `« ${rule.condition || 'toujours'} » → ${rule.permissions}${rule.columns && rule.columns !== '*' ? ` (colonnes ${rule.columns})` : ''}`).join(' ; ') + (rules.length > shown.length ? ' …' : '') + '.';
  }

  /**
   * L'explication d'une erreur : { kind, denial, headline, hint, lines:[{label, text}], text, raw }.
   * ctx : {what (action de l'utilisateur), op ('read'|'write'), table, columns, rowIds, actions, page}.
   */
  function explain(err, ctx) {
    ctx = ctx || {};
    const cls = classify(err);
    const meta = (err && typeof err === 'object' && err.gristAccess) || {};
    const actions = ctx.actions || meta.actions || null;
    const targets = actions ? summarizeTargets(actions) : [];
    const op = ctx.op || meta.op || (targets.length ? 'write' : (ctx.table || meta.table) ? 'read' : '');
    const table = ctx.table || meta.table || cls.table || (targets[0] && targets[0].table) || '';
    const columns = ctx.columns || (targets[0] && targets[0].columns) || [];
    const rowIds = ctx.rowIds || (targets[0] && targets[0].rowIds) || [];
    const T = table ? `la table ${table}` : 'cette table';
    const isWrite = op === 'write';
    const acl = cls.rule || {};
    const where = [];
    if (ctx.what) where.push(ctx.what);
    if (targets.length) where.push(...targets.slice(0, 4).map(targetPhrase), ...(targets.length > 4 ? [`… et ${targets.length - 4} autre(s) table(s)`] : []));
    else if (table) where.push(`${isWrite ? 'écriture dans' : 'lecture de'} la table ${table}${columns.length ? ` (colonnes ${list(columns.slice(0, 12))})` : ''}${rowIds.length ? ` (ligne ${list(rowIds.slice(0, 8))})` : ''}`);
    if (ctx.page) where.push(`page ${ctx.page}`);

    let headline = '', why = [], check = [], effect = [];
    switch (cls.kind) {
      case 'acl': {
        const action = acl.action || (isWrite ? 'update' : 'read');
        const columnRule = acl.type === 'column';
        if (action === 'read') {
          headline = `Lecture refusée : une règle d'accès de Grist cache ${columnRule ? 'une colonne de ' : ''}${T} à votre compte`;
          why.push(`Votre compte (ou l'utilisateur choisi dans « Voir en tant que ») n'a pas le droit de lire ${T} : le widget la traite comme vide, donc tout ce qui en dépend s'affiche vide ou avec des éléments « non lisibles ».`);
        } else if (action === 'structure') {
          headline = `Modification de la structure refusée par une règle d'accès de Grist${table ? ` (${T})` : ''}`;
          why.push('Le widget crée lui-même les tables et colonnes dont il a besoin (préférences, tables des instances, colonnes des volets…) : cela demande le droit « Modifier la structure ». Sans ce droit, ces éléments ne sont pas créés et les écrans qui en dépendent restent vides ou sans mémoire de vos filtres.');
          why.push('Ce droit n\'est nécessaire qu\'une fois : un propriétaire qui ouvre le widget crée tout ce qui manque.');
        } else {
          const noun = action === 'update' ? 'Modification' : action === 'create' ? 'Création de ligne' : 'Suppression de ligne';
          headline = `${noun} refusée par une règle d'accès de Grist sur ${T}${columns.length && action === 'update' ? ` (colonnes : ${list(columns.slice(0, 6))}${columns.length > 6 ? '…' : ''})` : ''}`;
          why.push(columnRule
            ? `C'est une règle posée sur une colonne (pas sur toute la table) : l'une des colonnes écrites${columns.length ? ` (${list(columns.slice(0, 12))})` : ''} est en lecture seule pour votre rôle.`
            : `La règle de ${T} refuse « ${RIGHT_LABEL[action]} » à votre rôle : soit la table est en lecture seule pour vous (compte lecteur), soit la ligne visée ne remplit pas la condition de la règle (par exemple une condition sur votre adresse ou sur la valeur d'une colonne de la ligne).`);
          why.push('Le message de Grist ne dit pas quelle règle précise a refusé : elle se trouve dans les règles d\'accès de la table, du côté de la ligne ou de la colonne concernée.');
        }
        check.push(GRIST_RULES_PATH);
        check.push(table ? `Ouvrez la section de la table ${table} (et ses règles par colonne) : cherchez la règle qui s'applique à votre rôle et regardez si « ${RIGHT_LABEL[action]} » y est refusée.` : 'Ouvrez la section de la table concernée et cherchez la règle qui s\'applique à votre rôle.');
        check.push(GRIST_VIEW_AS);
        if (action === 'update' && columns.length > 12) why.push(`Cette écriture envoie ${columns.length} colonnes d'un coup : une seule colonne en lecture seule pour votre rôle suffit à refuser tout l'enregistrement (les ${columns.length} sont refusées ensemble).`);
        const hint = table ? ruleHintFor(table, action, columns) || ruleHintFor('*', action, columns) : '';
        if (hint) check.push(hint);
        break;
      }
      case 'acl-action':
        headline = `Grist refuse l'action « ${cls.special} » : elle demande un accès complet, sans règle d'accès nuancée`;
        why.push('Certaines actions (créer ou supprimer une table, renommer…) sont interdites dès que des règles d\'accès par table, colonne ou ligne s\'appliquent à votre compte.');
        check.push(GRIST_RULES_PATH, 'Faites créer la table ou la colonne par un propriétaire (ouvrir le widget une fois suffit), ou ajoutez-la à la main dans Grist avec le nom exact attendu.');
        break;
      case 'owners-only':
        headline = cls.ownersOnly ? 'Seuls les propriétaires du document peuvent modifier les règles d\'accès' : 'Seuls les propriétaires et éditeurs peuvent modifier ce document';
        why.push('Votre rôle sur le document (Partager) ne permet pas cette modification, ou vous utilisez « Voir en tant que » un utilisateur qui ne l\'a pas.');
        check.push('Dans Grist : Partager → vérifiez votre rôle (Propriétaire / Éditeur / Lecteur).', GRIST_VIEW_AS);
        break;
      case 'read-only':
        headline = 'Le document est en lecture seule pour votre compte : aucune écriture n\'est possible';
        why.push('Cas possibles : rôle « Lecteur » sur le document, « Voir en tant que » un lecteur, document verrouillé, ancienne version (snapshot) ou copie non modifiable.');
        check.push('Dans Grist : Partager → vérifiez votre rôle ; regardez si un bandeau « lecture seule » ou « Voir en tant que » est affiché en haut de la page.');
        break;
      case 'reload':
        headline = 'Les règles d\'accès ont changé : Grist demande de recharger la page';
        why.push('Un propriétaire a modifié les règles d\'accès (ou vos attributs d\'utilisateur) pendant que le widget était ouvert.');
        check.push('Rechargez la page (F5), puis recommencez.');
        break;
      case 'widget-level':
        headline = `Le widget n'a pas l'accès complet au document (niveau actuel : ${cls.level})`;
        why.push('Le widget lit et écrit plusieurs tables : il lui faut le niveau « Accès complet au document ». Avec un niveau plus bas, Grist refuse tout ce qui sort de la table liée au widget.');
        check.push('Dans Grist : sélectionnez le widget → panneau de droite → « Niveau d\'accès » → « Accès complet au document ».');
        break;
      case 'no-access':
        headline = 'Grist a refusé l\'accès (droits insuffisants ou session expirée)';
        why.push('Le refus ne vient pas d\'une règle précise nommée par Grist : session expirée, document retiré de votre espace, ou aucun droit sur ce document.');
        check.push('Rechargez la page ; reconnectez-vous à Grist si on vous le demande ; vérifiez dans Partager que votre compte a bien un rôle sur le document.', GRIST_VIEW_AS);
        break;
      case 'attachment':
        headline = 'Accès refusé à cette pièce jointe';
        why.push('Grist protège les pièces jointes par la même règle que la cellule qui les contient : si la ligne ou la colonne (par exemple « Convention_de_reversement_le_cas_echeant », « Notifications_Signees ») est cachée à votre compte, sa pièce l\'est aussi.');
        check.push(GRIST_RULES_PATH, 'Regardez la règle de lecture de la table et de la colonne qui porte la pièce jointe.');
        break;
      case 'formula-column':
        headline = `La colonne ${cls.column || (columns[0] || '')} est calculée (formule) : Grist refuse qu'on y écrive`;
        why.push('Le widget ne devrait jamais écrire dans une colonne calculée ; si cela arrive, la colonne a été convertie en formule dans Grist (ou l\'inverse) depuis la dernière version du widget.');
        check.push(`Dans Grist, ouvrez la colonne ${cls.column || ''} → « Actions sur la colonne » → « Convertir en colonne de données » si elle doit être saisie depuis le widget ; sinon ne la modifiez pas ici.`);
        break;
      case 'locked':
        headline = `${table ? `La table ${table}` : 'Cette table'} est verrouillée dans Grist`;
        why.push('Une table verrouillée refuse toute modification de structure (et certaines écritures) jusqu\'à son déverrouillage par un propriétaire.');
        check.push('Dans Grist : Données brutes → la table → retirer le verrouillage.');
        break;
      case 'missing-table': {
        const name = cls.table || table;
        const auto = AUTO_TABLE.test(name || '');
        headline = `La table ${name || 'demandée'} n'existe pas dans ce document${cls.ambiguous ? ' (ou une colonne portant ce nom)' : ''}`;
        why.push(`Le widget cherche une table nommée exactement « ${name || '…'} » : elle a été renommée ou supprimée, ou ce document n'est pas celui attendu (copie, document de démonstration…).`);
        if (auto) why.push('Cette table est normalement créée par le widget à la première utilisation (droit « Modifier la structure » requis) : si elle manque encore, la création a été refusée.');
        else why.push('Les écrans qui lisent cette table s\'affichent vides.');
        check.push('Dans Grist : Données brutes → comparez avec les noms de tables (respect des majuscules et des tirets bas).');
        break;
      }
      case 'missing-column':
        headline = `La colonne ${cls.column || (columns.length ? columns[0] : 'demandée')} n'existe pas${(cls.table || table) ? ` dans la table ${cls.table || table}` : ''}`;
        why.push('Le widget lit ou écrit une colonne qui n\'a pas exactement ce nom dans Grist (renommée, supprimée, faute de frappe), ou que votre rôle ne voit pas.');
        if (columns.length && table && readStates.get(table) && readStates.get(table).ok) {
          const known = readStates.get(table).columns;
          const absent = columns.filter(col => !known.has(col));
          if (absent.length) why.push(`Colonnes écrites mais absentes de la dernière lecture de ${table} : ${list(absent)}.`);
        }
        check.push('Dans Grist : ouvrez la table et comparez le nom exact de la colonne (identifiant, pas le libellé) avec celui ci-dessus ; si elle existe, regardez une règle d\'accès par colonne.');
        break;
      case 'invalid':
        headline = 'Grist refuse la valeur envoyée (type de colonne incompatible)';
        why.push('Ce n\'est pas un problème de droits : la valeur ne correspond pas au type de la colonne dans Grist.');
        check.push(`Vérifiez le type de la colonne${columns.length ? ` (${list(columns.slice(0, 12))})` : ''} dans Grist (Texte, Nombre, Date, Référence…).`);
        break;
      case 'network':
        headline = 'La connexion avec Grist a été interrompue';
        why.push('Réseau coupé, page Grist rechargée ou fermée, session expirée ou serveur indisponible ; l\'opération n\'a peut-être pas abouti.');
        check.push('Rechargez la page et vérifiez que l\'écriture est bien là avant de recommencer.');
        break;
      default:
        headline = cls.msg ? `Erreur inattendue : « ${cls.msg.length > 160 ? cls.msg.slice(0, 160) + '…' : cls.msg} »` : 'Opération impossible (aucun message d\'erreur)';
        why.push('Le widget ne sait pas rattacher cette erreur à un droit d\'accès précis. Si le message parle de droits, de règles ou de lecture seule, les vérifications ci-dessous s\'appliquent ; sinon il peut s\'agir d\'une donnée inattendue.');
        check.push(GRIST_RULES_PATH, GRIST_VIEW_AS);
    }
    if (op === 'read' && table && (isDenial(cls.kind) || cls.kind === 'missing-table')) {
      const effects = effectsOf(table);
      effect = effects.length ? effects : [];
    }
    const lines = [];
    if (where.length) lines.push({ label: 'Où', text: where.join(' — ') });
    if (why.length) lines.push({ label: 'Pourquoi', text: why.join(' ') });
    if (effect.length) lines.push({ label: 'Conséquence dans le widget', text: effect.join(' ; ') });
    if (check.length) lines.push({ label: 'À vérifier', text: check.map((step, i) => `${i + 1}. ${step}`).join('\n') });
    const who = identityLine();
    if (who) lines.push({ label: 'Compte', text: who });
    if (err && typeof err === 'object' && err.cause && messageOf(err) && messageOf(err) !== cls.msg) lines.push({ label: 'Détail', text: messageOf(err) });
    if (cls.msg) lines.push({ label: 'Message de Grist', text: `« ${cls.msg} »` });
    const body = lines.map(line => line.label + ' : ' + line.text.replace(/\n/g, '\n    ')).join('\n');
    return { kind: cls.kind, denial: isDenial(cls.kind), headline, lines, text: headline + '\n' + body, raw: cls.msg, table, columns, rowIds };
  }

  // --- 7. Éléments illisibles dans les écrans -------------------------------------------------------------------------------------------
  const REF_KINDS = { Lignes_OPE: 'Ligne OPE', Annuaire: 'Personne', Programmes: 'Programme', Structures: 'Structure', Suivi_Instance: 'Instance', Postes2: 'Poste', Etablissements: 'Établissement', Projets: 'Projet', Notifications: 'Notification' };
  const isRowId = id => /^\d+$/.test(String(id).trim()) && Number(id) > 0;
  const refKind = tableName => REF_KINDS[tableName] || 'Élément';

  // « Personne (id 12) non lisible » : ce que le widget écrit à la place d'un numéro de ligne qu'il ne sait pas résoudre.
  function unreadableLabel(tableName, id, kindLabel) {
    return `${kindLabel || refKind(tableName)} (id ${text(id).trim()}) non lisible`;
  }

  // La raison, pour l'infobulle : table refusée (avec le message de Grist) ou ligne cachée.
  function unreadableReason(tableName, id) {
    const state = readStates.get(tableName);
    const failure = state && !state.ok ? state.error : (global.CoreGrist && typeof global.CoreGrist.readFailure === 'function' ? global.CoreGrist.readFailure(tableName) : '');
    const kind = refKind(tableName).replace(/^./, c => c.toLowerCase());
    const row = id != null ? ` (ligne n° ${text(id).trim()})` : '';
    if (failure) {
      const cls = classify(failure);
      const why = isDenial(cls.kind) ? 'la table est refusée à votre compte par une règle d\'accès' : cls.kind === 'missing-table' ? 'la table n\'existe pas dans ce document' : 'la lecture de la table a échoué';
      return `La table ${tableName} n’a pas pu être lue : ${why} (${failure}). La valeur reste rattachée tant que vous ne la changez pas. Détail : Alt+Maj+D, onglet Accès.`;
    }
    const total = state && state.ok ? ` La table ${tableName} est lue (${plural(state.rows, 'ligne', 'lignes')}) mais ne contient pas cette ${kind}${row}.` : '';
    return `Cette fiche existe dans Grist mais vos droits d’accès ne vous la montrent pas (règle d’accès par ligne sur ${tableName}), ou elle a été supprimée.${total} La valeur reste rattachée tant que vous ne la changez pas. Détail : Alt+Maj+D, onglet Accès.`;
  }

  // {label, title} pour une référence non résolue ; null si l'identifiant n'est pas un numéro de ligne (valeur texte d'une liste de choix…).
  function unresolvedRef(tableName, id, kindLabel) {
    if (!isRowId(id)) return null;
    return { label: unreadableLabel(tableName, id, kindLabel), title: unreadableReason(tableName, id) };
  }

  // --- 8. Problèmes détectés (alimentent pastilles, infobulles et rapport) ------------------------------------------------------------
  const knownTable = name => (global.CoreState && typeof global.CoreState.getTable === 'function' ? global.CoreState.getTable(name) : null);
  const schemaColumns = table => (global.CoreGrist && typeof global.CoreGrist.knownColumns === 'function' ? global.CoreGrist.knownColumns(table) : null);
  const NEVER_EMPTY = new Set(['Projets', 'Annuaire']);

  function tableProblems() {
    const out = [];
    readStates.forEach((state, table) => {
      if (isMetadata(table) || state.ok) return;
      const cls = classify(state.error);
      const auto = AUTO_TABLE.test(table) && (cls.kind === 'missing-table');
      if (auto) return;
      const ex = explain(state.error, { op: 'read', table });
      out.push({ id: 'table:' + table, level: isDenial(cls.kind) ? 'denied' : 'missing', scope: 'table', table, pages: pagesOf(table), headline: ex.headline + ` — table ${table}`, effect: effectsOf(table), detail: ex.text });
    });
    return out;
  }

  function missingColumnProblems() {
    const out = [];
    const byTable = new Map();
    expectations.forEach(exp => {
      const state = readStates.get(exp.table);
      if (!state || !state.ok || !state.columns.size) return;
      const missing = exp.columns.filter(col => !state.columns.has(col));
      if (!missing.length) return;
      const slot = byTable.get(exp.table) || { missing: new Set(), usages: [] };
      missing.forEach(col => slot.missing.add(col));
      slot.usages.push({ label: exp.label, effect: exp.effect, columns: missing, page: exp.page });
      byTable.set(exp.table, slot);
    });
    byTable.forEach((slot, table) => {
      const schema = schemaColumns(table);
      const cols = Array.from(slot.missing);
      const hidden = schema ? cols.filter(col => schema.has(col)) : [];
      const absent = cols.filter(col => !hidden.includes(col));
      const lines = [];
      if (hidden.length) lines.push(`${list(hidden)} : la colonne existe dans le schéma mais Grist ne l'envoie pas à votre compte → règle d'accès par colonne (lecture refusée).`);
      if (absent.length) lines.push(`${list(absent)} : introuvable${schema ? ' dans le schéma' : ''} → colonne renommée ou supprimée, ou masquée par une règle d'accès par colonne.`);
      out.push({
        id: 'columns:' + table, level: 'missing', scope: 'columns', table, columns: cols, pages: unique(slot.usages.map(u => u.label)),
        headline: `Table ${table} : ${plural(cols.length, 'colonne attendue absente', 'colonnes attendues absentes')} (${list(cols.slice(0, 6))}${cols.length > 6 ? '…' : ''})`,
        effect: slot.usages.map(u => `${u.label} : ${u.effect || 'colonne(s) ' + list(u.columns)} [${list(u.columns)}]`),
        detail: lines.join('\n') + `\nVérifiez dans Grist : Règles d'accès → table ${table} → règles par colonne ; puis « Voir en tant que » votre compte.`
      });
    });
    return out;
  }

  function emptyTableProblems() {
    const out = [];
    NEVER_EMPTY.forEach(table => {
      const state = readStates.get(table);
      if (state && state.ok && state.rows === 0) {
        out.push({ id: 'empty:' + table, level: 'warn', scope: 'rows', table, pages: pagesOf(table), headline: `Table ${table} lue mais vide`,
          effect: effectsOf(table), detail: `La table ${table} est lue sans erreur mais ne contient aucune ligne : soit elle est vide dans Grist, soit toutes ses lignes sont cachées à votre compte par une règle d'accès par ligne. Comparez le nombre de lignes dans Grist (« Voir en tant que » vous-même).` });
      }
    });
    return out;
  }

  // Références dont la cible n'est pas dans la table lue : ligne cachée par une règle d'accès par ligne, ou supprimée.
  function danglingRefs() {
    const out = [];
    const typesOf = table => (global.CoreGrist && typeof global.CoreGrist.columnTypes === 'function' ? global.CoreGrist.columnTypes(table) : null);
    readStates.forEach((state, table) => {
      if (isMetadata(table) || !state.ok || state.rows === 0) return;
      const rows = knownTable(table);
      const types = typesOf(table);
      if (!Array.isArray(rows) || !rows.length || !types) return;
      Object.keys(types).forEach(col => {
        const m = /^(Ref|RefList):(\w+)$/.exec(types[col]);
        if (!m || !state.columns.has(col)) return;
        const target = m[2];
        const targetState = readStates.get(target);
        const targetRows = knownTable(target);
        if (!targetState || !targetState.ok || !Array.isArray(targetRows)) return;
        const ids = new Set(targetRows.map(r => r.id));
        const missing = new Set();
        let total = 0;
        rows.forEach(row => {
          const value = row[col];
          const refs = Array.isArray(value) ? value.filter(v => typeof v === 'number') : (typeof value === 'number' ? [value] : []);
          refs.forEach(ref => { if (ref > 0) { total += 1; if (!ids.has(ref)) missing.add(ref); } });
        });
        if (missing.size) out.push({ table, column: col, target, missing: Array.from(missing).sort((a, b) => a - b), total, rows: rows.length });
      });
    });
    return out;
  }

  function refProblems() {
    return danglingRefs().map(ref => ({
      id: `ref:${ref.table}.${ref.column}`, level: 'warn', scope: 'refs', table: ref.table, pages: pagesOf(ref.table),
      headline: `${ref.table}.${ref.column} → ${ref.target} : ${plural(ref.missing.length, 'fiche introuvable', 'fiches introuvables')}`,
      effect: [`Ces références s'affichent « ${refKind(ref.target)} (id N) non lisible » au lieu du nom.`],
      detail: `${plural(ref.missing.length, 'valeur pointe', 'valeurs différentes pointent')} vers ${ref.target} (ids ${list(ref.missing.slice(0, 10))}${ref.missing.length > 10 ? '…' : ''}) alors que ${ref.target} est lue sans erreur (${readStates.get(ref.target).rows} lignes) : ces lignes sont cachées par une règle d'accès par ligne de ${ref.target}, ou ont été supprimées.`
    }));
  }

  function eventProblems() {
    return events.filter(e => (e.level === 'denied' || e.level === 'missing' || e.level === 'network') && !(e.op === 'read' && readStates.get(e.table) && !readStates.get(e.table).ok))
      .map(e => {
        const ex = explain({ message: e.message }, { op: e.op, table: e.table, columns: e.columns, rowIds: e.rowIds, what: e.what, actions: e.actions });
        return { id: 'event:' + e.key, level: e.level, scope: 'event', table: e.table, pages: pagesOf(e.table), headline: ex.headline + (e.count > 1 ? ` (×${e.count})` : ''), effect: [], detail: ex.text, at: e.at };
      });
  }

  function identityProblems() {
    if (!identity || identity.ok) return [];
    return [{ id: 'identity', level: 'warn', scope: 'identity', table: 'Preferences_Widget', pages: ['To Do'], headline: identity.headline || 'Votre adresse Grist n\'a pas pu être lue', effect: ['To Do : « Mes tâches » ne peut pas désigner votre fiche.'], detail: identity.detail || '' }];
  }

  function checkProblems() {
    const out = [];
    checks.forEach(check => {
      try { (check.run() || []).forEach((issue, i) => out.push({ id: `check:${check.label}:${i}`, level: issue.level || 'warn', scope: 'check', table: issue.table || '', pages: [check.label], headline: issue.headline, effect: issue.effect || [], detail: issue.detail || '' })); } catch (err) { /* un contrôle défaillant ne bloque rien */ }
    });
    return out;
  }

  function metadataProblems() {
    const out = [];
    ['_grist_Tables', '_grist_Tables_column'].forEach(table => {
      const state = readStates.get(table);
      if (state && !state.ok) out.push({ id: 'meta:' + table, level: 'warn', scope: 'meta', table, pages: [], headline: `Métadonnées ${table} illisibles`, effect: ['Bulles d\'aide « ? » absentes ; types, listes de choix et colonnes calculées inconnus (vérifications de références impossibles).'], detail: explain(state.error, { op: 'read', table }).text });
    });
    return out;
  }

  function collectProblems() {
    return [].concat(tableProblems(), missingColumnProblems(), emptyTableProblems(), refProblems(), eventProblems(), identityProblems(), checkProblems(), metadataProblems());
  }
  const COUNTED = new Set(['denied', 'missing', 'network']);
  const isCounted = p => COUNTED.has(p.level) || p.scope === 'refs' || p.scope === 'identity' || p.scope === 'check';
  const countOf = problems => problems.filter(isCounted).length;

  // --- 9. Rapport texte (Alt+Maj+D, onglet Accès) -------------------------------------------------------------------------------------------
  function tableLines() {
    const names = Array.from(readStates.keys()).filter(t => !isMetadata(t)).sort();
    if (!names.length) return ['  (aucune lecture enregistrée)'];
    return names.map(table => {
      const state = readStates.get(table);
      if (state.ok) return `  OK      ${table.padEnd(26)} ${plural(state.rows, 'ligne', 'lignes')}, ${plural(state.columns.size, 'colonne reçue', 'colonnes reçues')}`;
      const cls = classify(state.error);
      const tag = isDenial(cls.kind) ? 'REFUSÉE' : cls.kind === 'missing-table' ? 'ABSENTE' : 'ERREUR';
      return `  ${tag.padEnd(7)} ${table.padEnd(26)} ${state.error}`;
    });
  }

  function reportLines() {
    const problems = collectProblems();
    const lines = [];
    const counted = countOf(problems);
    lines.push('Permissions et accès — pourquoi un élément peut s\'afficher vide, absent ou « non lisible »');
    lines.push(counted ? `Résumé : ${plural(counted, 'point à vérifier', 'points à vérifier')} (détail ci-dessous).` : 'Résumé : aucun problème d\'accès détecté pour l\'instant (voir aussi « Tester les accès »).');
    lines.push(identity && identity.email ? `Compte détecté : ${maskEmail(identity.email)}${identity.source ? ' (' + identity.source + ')' : ''}${identity.person ? ' — fiche Annuaire : ' + identity.person : (identity.matched === false ? ' — aucune fiche Annuaire à cette adresse' : '')}` : 'Compte détecté : aucun (adresse non lue : page To Do pas encore ouverte, ou lecture refusée)');
    lines.push('Accès demandé par le widget au démarrage : complet (« Accès complet au document »).');
    lines.push('');
    lines.push('Tables lues (dernière lecture) :');
    tableLines().forEach(line => lines.push(line));
    ['_grist_Tables', '_grist_Tables_column', '_grist_Attachments'].forEach(table => {
      const state = readStates.get(table);
      if (state) lines.push(`  ${state.ok ? 'OK     ' : 'ERREUR '} ${table.padEnd(26)} ${state.ok ? 'lisible' : state.error}`);
    });
    const groups = [['Tables illisibles', 'table'], ['Colonnes attendues absentes de la lecture', 'columns'], ['Tables vides', 'rows'], ['Références qui ne se résolvent pas (ligne cachée ou supprimée)', 'refs'], ['Contrôles des pages', 'check'], ['Identité', 'identity'], ['Métadonnées', 'meta']];
    groups.forEach(([title, scope]) => {
      const items = problems.filter(p => p.scope === scope);
      if (!items.length) return;
      lines.push('', `${title} :`);
      items.forEach(item => {
        lines.push(`  • ${item.headline}`);
        if (item.pages && item.pages.length) lines.push(`      Écrans concernés : ${list(item.pages)}`);
        (item.effect || []).slice(0, 8).forEach(e => lines.push(`      → ${e}`));
        if (item.detail) item.detail.split('\n').forEach(l => lines.push('      ' + l));
      });
    });
    const evs = problems.filter(p => p.scope === 'event');
    lines.push('', 'Derniers refus et erreurs d\'écriture / de lecture (le plus récent d\'abord) :');
    if (!evs.length) lines.push('  aucun');
    evs.forEach(item => {
      lines.push(`  • [${clock(item.at)}] ${item.headline}`);
      item.detail.split('\n').slice(1).forEach(l => lines.push('      ' + l));
    });
    const infos = events.filter(e => e.level === 'info' || e.level === 'error');
    if (infos.length) {
      lines.push('', 'Autres échecs (tables créées au besoin par le widget, valeurs refusées…) :');
      infos.forEach(e => lines.push(`  • [${clock(e.at)}] ${e.op === 'write' ? 'écriture' : 'lecture'} ${e.table || ''} : ${e.message}${e.count > 1 ? ' (×' + e.count + ')' : ''}`));
    }
    if (probeResult) {
      lines.push('', `Test des accès du ${clock(probeResult.at)} :`);
      probeResult.tables.forEach(t => lines.push(`  ${t.ok ? 'OK     ' : 'ERREUR '} ${t.table.padEnd(26)} ${t.ok ? `${plural(t.rows, 'ligne', 'lignes')}, ${plural(t.columns, 'colonne', 'colonnes')}` : t.error}`));
      if (probeResult.rulesError) lines.push(`  Règles d'accès : non lues (${probeResult.rulesError}) — seuls les propriétaires peuvent les lire.`);
      else if (probeResult.rulesCount != null) lines.push(`  Règles d'accès : ${plural(probeResult.rulesCount, 'règle lue', 'règles lues')} (voir « À vérifier » des erreurs concernées).`);
    }
    lines.push('', 'Comment vérifier dans Grist :');
    lines.push('  1. Menu du document → « Règles d\'accès » (propriétaires seulement) : une section par table, avec ses règles par colonne.');
    lines.push('  2. En bas de cet écran : « Voir en tant que » → choisissez l\'adresse concernée ; le widget affiche alors ce que Grist lui autorise.');
    lines.push('  3. Panneau du widget → « Niveau d\'accès » : doit être « Accès complet au document ».');
    lines.push('  4. Une table lue vide peut être vide, ou cachée ligne par ligne ; une colonne absente peut être renommée, supprimée ou cachée.');
    return lines;
  }

  // --- 10. Test des accès : relecture volontaire + règles d'accès (propriétaires) -----------------------------------------------------------------
  function parsePermissions(rule) {
    const t = text(rule.permissionsText).trim();
    return t || (rule.permissions != null ? `perm ${rule.permissions}` : '?');
  }

  async function loadAclRules(docApi) {
    try {
      const [resources, rules] = await Promise.all([docApi.fetchTable('_grist_ACLResources'), docApi.fetchTable('_grist_ACLRules')]);
      const resById = new Map();
      resources.id.forEach((id, i) => resById.set(id, { tableId: text(resources.tableId && resources.tableId[i]), colIds: text(resources.colIds && resources.colIds[i]) }));
      const byTable = {};
      const order = rules.id.map((id, i) => i).sort((a, b) => (Number(rules.rulePos && rules.rulePos[a]) || 0) - (Number(rules.rulePos && rules.rulePos[b]) || 0));
      order.forEach(i => {
        const res = resById.get(rules.resource && rules.resource[i]);
        if (!res) return;
        const key = res.tableId || '*';
        (byTable[key] = byTable[key] || []).push({ columns: res.colIds || '*', condition: text(rules.aclFormula && rules.aclFormula[i]).trim(), permissions: parsePermissions({ permissionsText: rules.permissionsText && rules.permissionsText[i], permissions: rules.permissions && rules.permissions[i] }), memo: text(rules.memo && rules.memo[i]) });
      });
      aclRules = { at: nowIso(), byTable, count: rules.id.length };
      return aclRules;
    } catch (err) {
      aclRules = null;
      return { error: classify(err).msg || 'illisible' };
    }
  }

  async function probe(tableNames) {
    const api = global.CoreGrist && global.CoreGrist.gristInstance;
    if (!api || !api.docApi) throw new Error('Grist n\'est pas prêt');
    const names = (tableNames && tableNames.length ? tableNames : (global.CoreGrist.tableNames ? global.CoreGrist.tableNames() : [])).slice();
    ['Preferences_Widget', '_grist_Tables', '_grist_Tables_column'].forEach(name => { if (!names.includes(name)) names.push(name); });
    const tables = await Promise.all(names.map(async table => {
      try { const data = await api.docApi.fetchTable(table); return { table, ok: true, rows: Array.isArray(data.id) ? data.id.length : 0, columns: Object.keys(data).length }; }
      catch (err) { return { table, ok: false, error: classify(err).msg || 'lecture refusée' }; }
    }));
    const rules = await loadAclRules(api.docApi);
    probeResult = { at: nowIso(), tables, rulesError: rules.error || '', rulesCount: rules.error ? null : rules.count };
    notify();
    return probeResult;
  }

  // --- 11. Affichage : pastille, drapeaux de page, message cliquable ---------------------------------------------------------------------------
  const ICON_WARN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>';
  let badge = null;
  const flags = new Map(); // viewId → bouton

  function openPanel() {
    if (global.PerfTrace && typeof global.PerfTrace.open === 'function') { try { return global.PerfTrace.open({ tab: 'access' }); } catch (err) { /* panneau indisponible */ } }
    return null;
  }

  function tooltipFor(problems) {
    const head = problems.slice(0, 6).map(p => `• ${p.headline}${p.effect && p.effect.length ? ' — ' + p.effect[0] : ''}`);
    if (problems.length > 6) head.push(`… et ${problems.length - 6} autre(s)`);
    return head.join('\n') + '\n\nCliquez pour le détail (diagnostic Alt+Maj+D, onglet Accès).';
  }

  function updateUi() {
    if (!global.document) return;
    const problems = collectProblems();
    const counted = problems.filter(isCounted);
    if (badge) {
      badge.hidden = counted.length === 0;
      if (counted.length) {
        const count = badge.querySelector('.access-count');
        if (count) count.textContent = String(counted.length);
        badge.title = tooltipFor(counted);
        badge.setAttribute('aria-label', `${plural(counted.length, 'point d\'accès à vérifier', 'points d\'accès à vérifier')} : cliquez pour le détail`);
      }
    }
    flags.forEach((button, viewId) => {
      const label = button.dataset.accessLabel;
      const mine = problems.filter(p => (COUNTED.has(p.level) || p.level === 'warn') && p.scope !== 'meta' && p.pages.includes(label));
      button.hidden = mine.length === 0;
      if (mine.length) { button.title = tooltipFor(mine); button.setAttribute('aria-label', `${plural(mine.length, 'point d\'accès à vérifier', 'points d\'accès à vérifier')} sur cet écran`); }
    });
  }

  // Pose, sans nouvelle ligne, une pastille ⚠ dans l'en-tête et au bout de la barre de filtres des écrans qui en ont une.
  function mountUi(options) {
    if (!global.document) return;
    const doc = global.document;
    // Dans le titre (à côté du nom du widget) : la navigation garde sa place à droite de l'en-tête.
    const header = doc.querySelector('.header h1') || doc.querySelector('.header');
    if (header && !doc.getElementById('access-badge')) {
      badge = doc.createElement('button');
      badge.type = 'button'; badge.id = 'access-badge'; badge.className = 'access-badge'; badge.hidden = true;
      badge.innerHTML = `${ICON_WARN}<span class="access-count"></span>`;
      badge.addEventListener('click', openPanel);
      header.appendChild(badge);
    } else if (!badge) badge = doc.getElementById('access-badge');
    const pages = (options && options.pages) || PAGES;
    Object.keys(pages).forEach(viewId => {
      if (flags.has(viewId) && flags.get(viewId).isConnected) return;
      const view = doc.getElementById(viewId);
      const bar = view && view.querySelector(pages[viewId].bar);
      if (!bar) return;
      const button = doc.createElement('button');
      button.type = 'button'; button.className = 'access-flag'; button.hidden = true;
      button.dataset.accessLabel = pages[viewId].label; button.dataset.accessView = viewId;
      button.innerHTML = ICON_WARN;
      button.addEventListener('click', openPanel);
      bar.appendChild(button);
      flags.set(viewId, button);
    });
    updateUi();
  }

  // Écran → libellé des attentes et barre qui porte la pastille.
  const PAGES = {
    'view-projects': { label: 'Kanban', bar: '.project-filters' },
    'view-administratif': { label: 'Administratif', bar: '.project-filters' },
    'view-installation-fonds': { label: 'Installation des fonds', bar: '.project-filters' },
    'view-todo': { label: 'To Do', bar: '.project-filters' },
    'view-dashboard': { label: 'Dashboard', bar: '.project-filters' },
    'view-annuaire': { label: 'Annuaire', bar: '.project-filters' }
  };

  /**
   * Message d'erreur détaillé : texte court (début habituel conservé) + détail complet au clic.
   * ctx.lead : début du message (« Échec de l'écriture »).
   */
  function toast(err, ctx) {
    ctx = ctx || {};
    const ex = explain(err, ctx);
    if (!hasAnnotation(err)) record({ op: ctx.op || (ctx.actions ? 'write' : ''), table: ex.table, columns: ex.columns, rowIds: ex.rowIds, error: err, actions: ctx.actions, what: ctx.what || ctx.lead || '' });
    const lead = ctx.lead || 'Échec';
    const message = `${lead} : ${ex.headline}. Cliquez pour le détail.`;
    if (global.CoreUtils && typeof global.CoreUtils.showToast === 'function') global.CoreUtils.showToast(message, true, { title: ex.text, duration: 14000, onClick: openPanel });
    return ex;
  }
  function hasAnnotation(err) { return !!(err && typeof err === 'object' && err.gristAccess); }

  // Une phrase pour les endroits où le widget affichait le message brut de Grist : la raison en clair, suivie du message d'origine.
  function reason(err, ctx) {
    // Erreur du widget qui enveloppe celle de Grist : « ce que le widget faisait : raison de l'erreur de Grist ».
    if (err && typeof err === 'object' && err.cause && messageOf(err) && messageOf(err) !== messageOf(err.cause)) return `${messageOf(err).replace(/[.:\s]+$/, '')} : ${reason(err.cause, ctx)}`;
    const ex = explain(err, ctx);
    if (ex.kind === 'unknown') return ex.raw || ex.headline;
    return ex.raw && ex.raw !== ex.headline ? `${ex.headline} (« ${ex.raw} »)` : ex.headline;
  }

  // Pourquoi une fiche attendue (celle d'un projet dans Notifications…) est introuvable : table illisible, ou ligne cachée / absente.
  function missingRowNote(table) {
    const state = readStates.get(table);
    if (state && !state.ok) return `la table ${table} n'a pas pu être lue avec vos droits (${state.error}) : ${explain(state.error, { op: 'read', table }).headline}`;
    if (state && state.ok) return `${plural(state.rows, 'ligne lue', 'lignes lues')} dans ${table} : la fiche n'existe pas encore, ou une règle d'accès par ligne la cache à votre compte (détail : Alt+Maj+D, onglet Accès)`;
    return `la table ${table} n'a pas encore été lue`;
  }

  // Bandeau d'erreur d'une modale : titre + détail repliable (HTML déjà échappé).
  function errorHtml(err, ctx, opts) {
    const ex = explain(err, ctx);
    if (!hasAnnotation(err)) record({ op: (ctx && ctx.op) || ((ctx && ctx.actions) ? 'write' : ''), table: ex.table, columns: ex.columns, rowIds: ex.rowIds, error: err, actions: ctx && ctx.actions, what: (ctx && ctx.what) || '' });
    const lead = ctx && ctx.lead ? `${esc(ctx.lead)} : ` : '';
    const body = ex.lines.map(line => `<div><strong>${esc(line.label)} :</strong> ${esc(line.text).replace(/\n/g, '<br>')}</div>`).join('');
    return `<span class="access-explain"><strong>${lead}${esc(ex.headline)}</strong><details${opts && opts.open ? ' open' : ''}><summary>Pourquoi, et que vérifier</summary>${body}</details></span>`;
  }

  // Pose l'explication dans un bandeau d'erreur existant (sans ce module : le texte court d'avant).
  function showErrorBox(el, err, ctx, opts) {
    if (!el) return;
    el.innerHTML = errorHtml(err, ctx, opts);
  }

  // --- Contrôles propres à un écran (ex. projets qui ne tombent dans aucune colonne du Kanban) -------------------------------------------
  // Renvoie une fonction qui retire le contrôle (les écrans enregistrent les leurs une fois pour toutes ; seuls les tests s'en servent).
  function addCheck(label, run) { const check = { label, run }; checks.push(check); return () => { const at = checks.indexOf(check); if (at >= 0) checks.splice(at, 1); }; }

  function setIdentity(info) { identity = info ? Object.assign({}, info) : null; notify(); }

  const api = {
    classify, explain, describeActions, summarizeTargets, isDenial,
    instrument, noteRead, noteReadFailure, record,
    expect, addCheck, setIdentity,
    identity: () => identity ? Object.assign({}, identity) : null, maskEmail,
    readState: table => { const s = readStates.get(table); return s ? { ok: s.ok, rows: s.rows, columns: Array.from(s.columns), error: s.error, kind: s.kind, at: s.at } : null; },
    events: () => events.map(e => Object.assign({}, e)),
    problems: collectProblems, danglingRefs, countOf,
    unresolvedRef, unreadableLabel, unreadableReason, isRowId,
    reportLines, probe, loadAclRules,
    toast, errorHtml, showErrorBox, missingRowNote, reason, mountUi, updateUi, openPanel,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    flush() { if (refreshTimer != null) { clearTimeout(refreshTimer); refreshTimer = null; } listeners.forEach(fn => { try { fn(); } catch (err) { /* sans objet */ } }); },
    clear() { events.length = 0; notify(); },
    // Pour les tests : repart d'un état vierge (les attentes déclarées par js/core/access-expectations.js et les contrôles des écrans sont conservés).
    _reset() { readStates.clear(); events.length = 0; identity = null; probeResult = null; aclRules = null; flags.clear(); badge = null; if (refreshTimer != null) { clearTimeout(refreshTimer); refreshTimer = null; } },
    _setAclRules(value) { aclRules = value; },
    _expectations: () => expectations.map(e => Object.assign({}, e)),
    _pages: PAGES
  };
  listeners.add(updateUi);
  global.CoreAccess = api;
})(window);
