/**
 * Pont Grist -> widget imbriqué (page Rédaction : publipostage+ dans une iframe).
 *
 * Problème : Grist charge CE widget dans une iframe et n'écoute que celle-là
 * (WidgetFrame._onMessage ne traite un message que si event.source ===
 * iframe.contentWindow). Un second widget chargé dans une iframe de ce widget
 * postMessage() vers window.parent (= ce widget, pas Grist) : sans relais, son
 * grist-plugin-api.js ne recevrait jamais aucune réponse, ni API document, ni
 * enregistrement sélectionné (le "select by").
 *
 * Solution : ce widget joue le rôle de l'hôte Grist pour l'iframe imbriquée. Le
 * pont parle le protocole grain-rpc du client plugin (mtype 1 appel, 2 réponse,
 * 3 erreur, 4 message personnalisé, 5 prêt) et répond à ses interfaces :
 *  - GristDocAPI (fetchTable, listTables, applyUserActions, getAccessToken...)
 *    -> relayé tel quel à la vraie API de CE widget (grist.docApi) ;
 *  - GristView (fetchSelectedRecord / fetchSelectedTable) -> reconstruit à partir
 *    de fetchTable + métadonnées (_grist_Tables, _grist_Tables_column), en
 *    reproduisant GristViewImpl (grist-core, app/client/components/WidgetFrame.ts,
 *    vérifié à la source le 2026-09-29, commit 2c46edd) : valeurs affichées des
 *    références (colonne displayCol), dates/références ré-encodées ['d',..] /
 *    ['R',..] ; les options includeColumns 'shown' et 'normal' renvoient toutes
 *    deux les colonnes normales de la table (aucune configuration "colonnes
 *    visibles" n'existe ici), 'all' ajoute manualSort et les colonnes d'aide ;
 *  - WidgetAPI (options du widget imbriqué) -> stockées SOUS UNE CLÉ dédiée des
 *    propres options de ce widget (persistées par Grist dans le document), pour
 *    ne jamais entrer en collision avec elles ;
 *  - CustomSectionAPI (configure / mappings) -> acquittées, aucun mappage.
 * Le "select by" est simulé par select(rowId) : le pont envoie au widget
 * imbriqué les mêmes messages qu'un widget Grist lié reçoit quand le curseur
 * de la table source bouge ({tableId, rowId, dataChange}).
 *
 * Sécurité : l'iframe reçoit un accès complet au document, donc
 *  - seuls les messages dont event.source est la fenêtre de l'iframe ET dont
 *    event.origin est l'origine attendue sont traités (les autres sont ignorés,
 *    jamais répondus) ; les envois utilisent postMessage(..., origine exacte) ;
 *  - seules les interfaces/méthodes de ALLOWED_METHODS sont exposées ;
 *  - le client plugin de CE widget (window.onmessage, posé au chargement de la page) ne
 *    doit jamais voir les messages de l'iframe : il répondrait "RPC_UNKNOWN_FORWARD_DEST"
 *    au vrai Grist, avec des reqId qui peuvent entrer en collision avec les siens. Sur une
 *    fenêtre, Chromium appelle les écouteurs dans l'ordre d'enregistrement (la phase de
 *    capture n'y donne aucune priorité — vérifié sur Chromium 141, 2026-09-29) : le pont
 *    enveloppe donc window.onmessage avec un filtre (shieldWindowHandler), en plus
 *    d'intercepter en capture + stopImmediatePropagation() pour les écouteurs venus après.
 */
(function (global) {
  'use strict';

  // Types de message de grain-rpc (lib/message.ts) : numéros figés par Grist ("Do NOT renumber enums").
  const MSG_CALL = 1;
  const MSG_RESP_DATA = 2;
  const MSG_RESP_ERR = 3;
  const MSG_CUSTOM = 4;
  const MSG_READY = 5;

  // Liste blanche : un iface/une méthode absent(e) ici n'est jamais relayé(e), même si le client plugin le connaît.
  const ALLOWED_METHODS = {
    GristDocAPI: ['getDocName', 'listTables', 'fetchTable', 'applyUserActions', 'getAccessToken'],
    GristView: ['fetchSelectedTable', 'fetchSelectedRecord', 'allowSelectBy', 'setSelectedRows', 'setCursorPos'],
    WidgetAPI: ['getOptions', 'setOptions', 'clearOptions', 'setOption', 'getOption'],
    CustomSectionAPI: ['configure', 'mappings'],
    CommandAPI: ['run']
  };

  const META_TTL_MS = 30000; // les colonnes d'une table changent rarement : 2 fetchTable de métadonnées par appel seraient du gaspillage.
  const LOG_LIMIT = 300;
  // Actions qui ne touchent que des lignes ; toute autre (AddColumn, RenameTable...) change le schéma et invalide le cache de métadonnées.
  const ROW_ACTIONS = new Set(['AddRecord', 'BulkAddRecord', 'UpdateRecord', 'BulkUpdateRecord', 'RemoveRecord',
    'BulkRemoveRecord', 'ReplaceTableData', 'AddOrUpdateRecord']);

  // Iframes reliées à un pont (même après detach : elles peuvent encore parler jusqu'à leur retrait du document).
  const bridgedFrames = new Set();
  function isBridgedSource(source) {
    for (const frame of bridgedFrames) {
      const win = frame.contentWindow;
      if (!win) { bridgedFrames.delete(frame); continue; } // iframe retirée du document
      if (win === source) return true;
    }
    return false;
  }
  // Enveloppe le gestionnaire window.onmessage existant (celui du client plugin de Grist) : il ignore les messages des iframes
  // pontées et reçoit tous les autres (dont ceux du vrai Grist) inchangés. Rappelé à chaque attach() : idempotent.
  function shieldWindowHandler() {
    const current = global.onmessage;
    if (typeof current !== 'function' || current.__gristBridgeShield) return;
    const shield = function (event) {
      if (isBridgedSource(event.source)) return undefined;
      return current.call(this, event);
    };
    shield.__gristBridgeShield = true;
    global.onmessage = shield;
  }

  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value);

  function codedError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
  }

  // --- Encodage des cellules (miroir de grist-core : gristTypes.ts / WidgetFrame.ts) -----------------------------------------------

  // Colonnes internes que Grist masque (gristTypes.isHiddenCol).
  function isHiddenCol(colId) { return colId.startsWith('gristHelper_') || colId === 'manualSort'; }

  // 'Ref:Projets' -> {type:'Ref', tableId:'Projets'}, 'DateTime:Europe/Paris' -> {type:'DateTime', timezone}, Attachments = RefList
  // vers _grist_Attachments (gristTypes.extractInfoFromColType).
  function typeInfoFromColType(colType) {
    const type = String(colType || 'Any');
    if (type === 'Attachments') return { type: 'RefList', tableId: '_grist_Attachments' };
    const colon = type.indexOf(':');
    const base = colon === -1 ? type : type.slice(0, colon);
    const arg = colon === -1 ? '' : type.slice(colon + 1);
    if (base === 'Ref' || base === 'RefList') return { type: base, tableId: arg };
    if (base === 'DateTime') return { type: base, timezone: arg };
    return { type: base };
  }

  // Format par défaut de l'API widget : un nombre de type Date/DateTime/Ref devient un objet auto-descriptif, mais RefList et
  // Attachments restent bruts (défaut connu de Grist, conservé pour la compatibilité des widgets existants).
  function reencodeAsAny(value, info) {
    if (typeof value === 'number') {
      if (info.type === 'Date') return ['d', value];
      if (info.type === 'DateTime') return ['D', value, info.timezone];
      if (info.type === 'Ref') return ['R', info.tableId, value];
    }
    return value;
  }

  // cellFormat: 'typed' : comme reencodeAsAny, plus les listes (ChoiceList, RefList, Attachments).
  function reencodeAsTyped(value, info) {
    if (typeof value === 'number') return reencodeAsAny(value, info);
    if ((Array.isArray(value) && value[0] === 'L') || value === null) {
      const items = value ? value.slice(1) : [];
      if (info.type === 'ChoiceList') return ['L', ...items];
      if (info.type === 'RefList') return ['r', info.tableId, items];
    }
    return value;
  }

  const identity = value => value;
  function pickReencode(cellFormat) {
    if (cellFormat === 'normal') return identity;
    return cellFormat === 'typed' ? reencodeAsTyped : reencodeAsAny;
  }

  // --- Métadonnées de colonnes ------------------------------------------------------------------------------------------------------

  // Colonnes d'une table déduites des seules données quand les métadonnées sont illisibles (droits d'accès) : plus de type ni de
  // colonne d'affichage, donc pas de ré-encodage ni de références développées, mais le widget reste utilisable.
  function columnsFromData(raw) {
    return Object.keys(raw).filter(key => key !== 'id').map((colId, pos) => ({
      colId, pos, type: 'Any', info: { type: 'Any' }, displayColId: null, hidden: isHiddenCol(colId)
    }));
  }

  // {tableId: [{colId, type, info, displayColId, hidden}]} à partir de _grist_Tables et _grist_Tables_column (displayCol : la colonne
  // dont Grist affiche la valeur, la colonne elle-même ou 0 quand rien de spécial - même lecture que le widget publipostage+).
  async function loadSchema(fetchTable) {
    const [tables, cols] = await Promise.all([fetchTable('_grist_Tables'), fetchTable('_grist_Tables_column')]);
    const tableIdByRef = new Map();
    tables.id.forEach((ref, i) => tableIdByRef.set(ref, tables.tableId[i]));
    const colIdByRef = new Map();
    cols.id.forEach((ref, i) => colIdByRef.set(ref, cols.colId[i]));
    const byTable = {};
    cols.id.forEach((ref, i) => {
      const tableId = tableIdByRef.get(cols.parentId[i]);
      if (!tableId) return;
      const colId = cols.colId[i];
      const displayRef = cols.displayCol ? cols.displayCol[i] : 0;
      const type = String(cols.type[i] || 'Any');
      if (!byTable[tableId]) byTable[tableId] = [];
      byTable[tableId].push({
        colId,
        type,
        info: typeInfoFromColType(type),
        displayColId: displayRef && displayRef !== ref ? (colIdByRef.get(displayRef) || null) : null,
        pos: cols.parentPos ? cols.parentPos[i] : i,
        hidden: isHiddenCol(colId)
      });
    });
    Object.keys(byTable).forEach(tableId => byTable[tableId].sort((a, b) => a.pos - b.pos));
    return byTable;
  }

  // --- Le pont ----------------------------------------------------------------------------------------------------------------------

  /**
   * Relie `iframe` (widget imbriqué) à l'API Grist de ce widget.
   * config : {
   *   origin        : origine attendue du widget imbriqué ('https://exemple.github.io'), ou '*' pour ne vérifier que la fenêtre ;
   *   tableId,rowId : table liée et enregistrement sélectionné au démarrage (le "select by") ;
   *   api           : objet grist à relayer (défaut window.grist) ;
   *   optionsKey    : clé, dans les options de ce widget, où ranger celles du widget imbriqué (défaut 'nestedWidget') ;
   *   accessLevel   : niveau d'accès annoncé au widget imbriqué (défaut 'full') ;
   *   onStatus({phase:'waiting'|'ready'|'rejected', ...}), onLog(entrée), onWrite(actions), onSelectedRows(ids), onCursorPos(pos)
   * }
   */
  function attach(iframe, config) {
    config = config || {};
    if (!iframe || iframe.nodeName !== 'IFRAME') throw new Error('GristBridge.attach : une <iframe> est requise');
    if (typeof config.origin !== 'string' || !config.origin) {
      throw new Error('GristBridge.attach : `origin` est requise (origine du widget imbriqué, ou "*")');
    }
    if (iframe.__gristBridge) iframe.__gristBridge.detach();
    bridgedFrames.add(iframe);
    shieldWindowHandler();

    const origin = config.origin;
    const optionsKey = config.optionsKey || 'nestedWidget';
    const accessLevel = config.accessLevel || 'full';
    const state = { tableId: config.tableId || null, rowId: config.rowId || null, ready: false, detached: false, phase: 'waiting', rejectedOrigin: null };
    const logEntries = [];
    const readyWaiters = [];
    let optionsMirror; // undefined = pas encore lu ; null = aucune option enregistrée
    let optionsQueue = Promise.resolve();
    let optionsPushTimer = null;
    let refreshTimer = null;
    let schemaCache = null;

    const getApi = () => config.api || global.grist;

    function log(kind, text) {
      const entry = { at: new Date().toISOString(), kind, text };
      logEntries.push(entry);
      if (logEntries.length > LOG_LIMIT) logEntries.shift();
      if (typeof config.onLog === 'function') {
        try { config.onLog(entry); } catch (err) { /* un afficheur de journal défaillant ne doit jamais casser le pont */ }
      }
    }

    function setStatus(phase, detail) {
      state.phase = phase;
      if (typeof config.onStatus === 'function') {
        try { config.onStatus(Object.assign({ phase }, detail)); } catch (err) { /* idem */ }
      }
    }

    // --- Envoi vers le widget imbriqué ---
    function rawPost(message) {
      const win = iframe.contentWindow;
      if (!win) throw new Error('iframe sans fenêtre (détachée du document ?)');
      win.postMessage(message, origin);
    }
    function post(message) {
      if (state.detached) return false;
      try { rawPost(message); return true; } catch (err) { log('error', `Envoi impossible vers le widget imbriqué : ${err.message}`); return false; }
    }
    const postCustom = data => post({ mtype: MSG_CUSTOM, data });
    function respondData(reqId, data) {
      if (reqId === undefined || state.detached) return;
      try { rawPost({ mtype: MSG_RESP_DATA, reqId, data }); }
      catch (err) { respondError(reqId, 'RPC_INVALID_RESULT', `Résultat non transmissible : ${err.message}`); }
    }
    function respondError(reqId, code, mesg) {
      if (reqId === undefined) return;
      post({ mtype: MSG_RESP_ERR, reqId, mesg: String(mesg), code });
    }

    // Messages "événement" que Grist envoie à un widget lié : curseur / données de la table source, puis options.
    function recordMessage(dataChange, mappingsChange) {
      const msg = { tableId: state.tableId, rowId: state.rowId || undefined, dataChange };
      if (mappingsChange !== undefined) msg.mappingsChange = mappingsChange;
      return msg;
    }
    function optionsMessage(fromReady) {
      const msg = {
        options: optionsMirror || null,
        settings: { accessLevel, linking: { asTarget: null, asSource: false } }
      };
      if (fromReady) msg.fromReady = true;
      return msg;
    }
    // Grist regroupe (debounce 0) les changements d'options avant de notifier le widget : même comportement ici.
    function scheduleOptionsPush() {
      if (optionsPushTimer !== null) return;
      optionsPushTimer = setTimeout(() => { optionsPushTimer = null; if (state.ready) postCustom(optionsMessage(false)); }, 0);
    }
    function scheduleRefresh() {
      if (refreshTimer !== null || !state.ready || !state.tableId) return;
      refreshTimer = setTimeout(() => { refreshTimer = null; if (state.ready && state.tableId) postCustom(recordMessage(true, false)); }, 50);
    }

    // --- API document (GristDocAPI) : relais vers la vraie API de ce widget ---
    function callDocApi(name, ...args) {
      const docApi = getApi() && getApi().docApi;
      if (!docApi || typeof docApi[name] !== 'function') throw codedError('RPC_UNKNOWN_METHOD', `API Grist indisponible : docApi.${name}`);
      return docApi[name](...args);
    }
    function requireString(value, label) {
      if (typeof value !== 'string' || !value) throw codedError('RPC_INVALID_ARGS', `Invalid args: ${label} doit être une chaîne non vide`);
    }
    function summarizeActions(actions) {
      return actions.map(action => Array.isArray(action) ? `${action[0]} ${typeof action[1] === 'string' ? action[1] : ''}`.trim() : '?').join(', ');
    }
    async function applyUserActions(actions, opts) {
      if (!Array.isArray(actions) || !actions.every(Array.isArray)) throw codedError('RPC_INVALID_ARGS', 'Invalid args: actions doit être un tableau d\'actions');
      const result = await callDocApi('applyUserActions', ...(opts === undefined ? [actions] : [actions, opts]));
      if (actions.some(action => !ROW_ACTIONS.has(action[0]) || String(action[1]).startsWith('_grist_'))) schemaCache = null;
      if (actions.some(action => action[1] === state.tableId)) scheduleRefresh(); // Grist notifie le widget quand SA table change
      if (typeof config.onWrite === 'function') {
        try { config.onWrite(actions); } catch (err) { log('error', `onWrite a échoué : ${err.message}`); }
      }
      return result;
    }

    // --- Vue sur la table liée (GristView) : reconstruite à partir de fetchTable + métadonnées ---
    async function getColumns(tableId, raw) {
      const now = Date.now();
      if (!schemaCache || now - schemaCache.at > META_TTL_MS) {
        const promise = loadSchema(name => callDocApi('fetchTable', name)).catch(err => {
          log('warn', `Métadonnées des colonnes illisibles (${err.message}) : types et références non développées`);
          return null;
        });
        schemaCache = { at: now, promise };
      }
      const byTable = await schemaCache.promise;
      return (byTable && byTable[tableId]) || columnsFromData(raw);
    }

    async function loadView(options) {
      const tableId = state.tableId;
      if (!tableId) throw codedError('NO_TABLE', 'Aucune table sélectionnée dans le pont Grist');
      const raw = await callDocApi('fetchTable', tableId);
      const columns = await getColumns(tableId, raw);
      const includeAll = options.includeColumns === 'all';
      const chosen = columns.filter(col => includeAll || !col.hidden);
      const expandRefs = options.expandRefs !== undefined ? options.expandRefs : options.cellFormat !== 'typed';
      const reencode = pickReencode(options.cellFormat);
      // Valeur d'une cellule : celle de la colonne d'affichage pour une référence développée, sinon la colonne elle-même.
      const cell = (col, index) => {
        const source = expandRefs && col.displayColId && raw[col.displayColId] ? raw[col.displayColId] : raw[col.colId];
        const value = source ? source[index] : null;
        return reencode(value === undefined ? null : value, col.info);
      };
      return { raw, chosen, cell };
    }

    async function fetchSelectedRecord(rowId, options) {
      const { raw, chosen, cell } = await loadView(options || {});
      const index = raw.id.indexOf(rowId);
      const record = { id: rowId };
      chosen.forEach(col => { record[col.colId] = index === -1 ? null : cell(col, index); });
      return record;
    }

    async function fetchSelectedTable(options) {
      const { raw, chosen, cell } = await loadView(options || {});
      // Ordre de la vue par défaut de Grist : manualSort (repli : ordre des id).
      const order = raw.id.map((id, index) => index);
      if (Array.isArray(raw.manualSort)) order.sort((a, b) => (raw.manualSort[a] - raw.manualSort[b]) || (a - b));
      const data = {};
      chosen.forEach(col => { data[col.colId] = order.map(index => cell(col, index)); });
      data.id = order.map(index => raw.id[index]);
      return data;
    }

    // --- Options du widget imbriqué (WidgetAPI) : rangées sous optionsKey dans les options de CE widget ---
    async function readOptions() {
      if (optionsMirror !== undefined) return optionsMirror;
      let stored = null;
      try { stored = await getApi().getOption(optionsKey); }
      catch (err) { log('warn', `Lecture des options impossible (${err.message}) : démarrage sans option enregistrée`); }
      if (optionsMirror === undefined) optionsMirror = isPlainObject(stored) ? stored : null;
      return optionsMirror;
    }
    // Écritures sérialisées (lecture-modification-écriture) : deux setOption() simultanés ne doivent pas s'écraser.
    function writeOptions(mutate) {
      const run = async () => {
        const next = mutate(await readOptions());
        optionsMirror = next;
        await getApi().setOption(optionsKey, next);
        scheduleOptionsPush();
      };
      optionsQueue = optionsQueue.then(run, run);
      return optionsQueue;
    }

    const impl = {
      GristDocAPI: {
        getDocName: () => callDocApi('getDocName'),
        listTables: () => callDocApi('listTables'),
        fetchTable: tableId => { requireString(tableId, 'tableId'); return callDocApi('fetchTable', tableId); },
        applyUserActions,
        getAccessToken: opts => callDocApi('getAccessToken', opts || {})
      },
      GristView: {
        fetchSelectedTable,
        fetchSelectedRecord: (rowId, options) => fetchSelectedRecord(rowId, options),
        allowSelectBy: async () => undefined,
        setSelectedRows: async rowIds => { if (typeof config.onSelectedRows === 'function') config.onSelectedRows(rowIds); },
        setCursorPos: async pos => { if (typeof config.onCursorPos === 'function') config.onCursorPos(pos); }
      },
      WidgetAPI: {
        getOptions: () => readOptions(),
        getOption: async key => { const current = await readOptions(); return current && hasOwn(current, key) ? current[key] : undefined; },
        setOptions: async options => {
          if (!isPlainObject(options)) throw codedError('RPC_INVALID_ARGS', 'options must be a valid JSON object');
          await writeOptions(() => Object.assign({}, options));
        },
        setOption: async (key, value) => {
          requireString(key, 'key');
          if (key === '__proto__') throw codedError('RPC_INVALID_ARGS', 'Invalid args: clé refusée');
          await writeOptions(current => Object.assign({}, current, { [key]: value }));
        },
        clearOptions: async () => { await writeOptions(() => null); }
      },
      CustomSectionAPI: {
        configure: async settings => {
          if (settings && settings.columns) log('warn', 'Le widget imbriqué demande un mappage de colonnes : non pris en charge ici, ignoré');
        },
        mappings: async () => null
      },
      CommandAPI: {
        run: async () => undefined // undo/redo : sans objet ici (Grist ignore de même les commandes inconnues)
      }
    };

    function describeCall(iface, meth, args) {
      if (iface === 'GristDocAPI' && meth === 'fetchTable') return `("${args[0]}")`;
      if (iface === 'GristDocAPI' && meth === 'applyUserActions' && Array.isArray(args[0])) return `(${summarizeActions(args[0].filter(Array.isArray))})`;
      if (iface === 'GristView' && meth === 'fetchSelectedRecord') return `(${args[0]})`;
      if (iface === 'WidgetAPI' && (meth === 'getOption' || meth === 'setOption')) return `("${args[0]}")`;
      return '';
    }

    async function handleCall(msg) {
      const { iface, meth, reqId } = msg;
      if (msg.mdest && msg.mdest !== 'grist') return respondError(reqId, 'RPC_UNKNOWN_FORWARD_DEST', 'Unknown forward destination');
      if (typeof iface !== 'string' || !hasOwn(ALLOWED_METHODS, iface)) {
        log('reject', `Interface refusée : ${String(iface)}.${String(meth)}`);
        return respondError(reqId, 'RPC_UNKNOWN_INTERFACE', 'Unknown interface');
      }
      if (typeof meth !== 'string' || !ALLOWED_METHODS[iface].includes(meth)) {
        log('reject', `Méthode refusée : ${iface}.${String(meth)}`);
        return respondError(reqId, 'RPC_UNKNOWN_METHOD', 'Unknown method');
      }
      const args = Array.isArray(msg.args) ? msg.args : [];
      log('call', `${iface}.${meth}${describeCall(iface, meth, args)}`);
      try {
        respondData(reqId, await impl[iface][meth](...args));
      } catch (err) {
        log('error', `${iface}.${meth} : ${err && err.message}`);
        respondError(reqId, err && err.code, (err && err.message) || String(err));
      }
    }

    async function handleReady() {
      state.ready = true;
      log('ready', 'Widget imbriqué prêt (grist.ready)');
      await readOptions();
      if (state.detached) return;
      // Même ordre que Grist à la réception du "prêt" : table/curseur, puis options (mesuré par publipostage+ : ligne, puis options).
      if (state.tableId) postCustom(recordMessage(true, true));
      postCustom(optionsMessage(true));
      setStatus('ready');
      readyWaiters.splice(0).forEach(waiter => waiter.resolve(true));
    }

    function onWindowMessage(event) {
      const win = iframe.contentWindow;
      if (!win || event.source !== win) return; // pas notre iframe : laissé au client plugin de CE widget (messages de Grist)
      // Message de l'iframe surveillée : les écouteurs enregistrés après celui-ci ne doivent pas le voir non plus (cf. shieldWindowHandler).
      event.stopImmediatePropagation();
      if (origin !== '*' && event.origin !== origin) {
        if (state.rejectedOrigin !== event.origin) {
          state.rejectedOrigin = event.origin;
          log('reject', `Message ignoré : origine "${event.origin}" au lieu de "${origin}"`);
          setStatus('rejected', { origin: event.origin, expected: origin });
        }
        return;
      }
      const msg = event.data;
      if (!isPlainObject(msg)) return;
      if (msg.mtype === MSG_READY) handleReady().catch(err => log('error', `Initialisation du widget imbriqué : ${err.message}`));
      else if (msg.mtype === MSG_CALL) handleCall(msg);
      // MSG_CUSTOM (ex. "themeInitialized") et réponses : sans objet, aucun appel n'est émis par le pont.
    }
    global.addEventListener('message', onWindowMessage, true);
    setStatus('waiting');

    const bridge = {
      // Le "select by" : change l'enregistrement que voit le widget imbriqué (déclenche son onRecord).
      select(rowId, tableId) {
        if (tableId) state.tableId = tableId;
        state.rowId = rowId == null ? null : Number(rowId);
        if (state.ready && state.tableId) postCustom(recordMessage(false));
      },
      // Redit au widget imbriqué que les données ont peut-être changé (onRecord et onRecords).
      refresh() { if (state.ready && state.tableId) postCustom(recordMessage(true, false)); },
      whenReady(timeoutMs) {
        if (state.ready) return Promise.resolve(true);
        return new Promise((resolve, reject) => {
          const waiter = { resolve };
          readyWaiters.push(waiter);
          setTimeout(() => {
            const at = readyWaiters.indexOf(waiter);
            if (at !== -1) { readyWaiters.splice(at, 1); reject(new Error('Le widget imbriqué n\'a pas répondu')); }
          }, timeoutMs || 10000);
        });
      },
      getState() { return { ready: state.ready, phase: state.phase, tableId: state.tableId, rowId: state.rowId, rejectedOrigin: state.rejectedOrigin }; },
      getLog() { return logEntries.slice(); },
      detach() {
        if (state.detached) return;
        state.detached = true;
        global.removeEventListener('message', onWindowMessage, true);
        clearTimeout(optionsPushTimer);
        clearTimeout(refreshTimer);
        if (iframe.__gristBridge === bridge) delete iframe.__gristBridge;
      }
    };
    iframe.__gristBridge = bridge;
    return bridge;
  }

  global.GristBridge = { attach, ALLOWED_METHODS, encoding: { isHiddenCol, typeInfoFromColType, reencodeAsAny, reencodeAsTyped } };
})(window);
