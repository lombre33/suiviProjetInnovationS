/**
 * Graphiques du Dashboard avec Grist-BI (widget imbriqué, https://lombre33.github.io/Grist-BI/).
 *
 * Grist-BI est chargé dans une iframe de cette page et lui parle à travers le pont (core/grist-bridge.js), qui joue le rôle de
 * l'hôte Grist. Il ne voit PAS le vrai document : le pont lui présente un document virtuel (core/virtual-doc.js) qui contient
 *  - Dashboard_Financier : la table plate calculée par DashboardLogic.biRows() avec les filtres de la page (lecture seule) ;
 *  - ses tables internes BI_* (configuration des tuiles), enregistrées dans les OPTIONS de ce widget (pas dans une table
 *    du document : rien n'est créé dans le vrai document).
 * Au premier affichage, la configuration contient les quatre graphiques retenus par Antoine le 18/11/2026 : attribué et consommé
 * par année, attribué et consommé par programme, reste à consommer par programme, reste à consommer par projet (treemap).
 * Quand les filtres de la page changent, la table est recalculée et Grist-BI rechargé (il ne relit pas ses données seul).
 *
 * Non vérifié dans un vrai Grist (deux iframes imbriquées) : si Grist-BI ne répond pas dans le délai, la page revient aux
 * graphiques faits main (onStatus 'failed'). Contrat avec Grist-BI : noms de table et de colonnes de sa table de configuration
 * (BI_Dashboard_Config : TableId, ConfigJSON, Nom, TypeRapport, DateModif, ModifiePar), format de ses tuiles (aggFn, dimension,
 * drillDimensions, seriesColumn, measure...), lus dans lombre33/Grist-BI (js/grist-api.js) le 24/11/2026.
 */
(function (global) {
  'use strict';

  const GRIST_BI_URL = 'https://lombre33.github.io/Grist-BI/';
  const STATE_KEY = 'dashboardBiDoc';        // options du widget : état du document virtuel
  const OPTIONS_KEY = 'dashboardBiOptions';  // options du widget : ce que Grist-BI range lui-même via WidgetAPI
  const CONFIG_TABLE = 'BI_Dashboard_Config';
  const CONFIG_COLUMNS = [
    { id: 'TableId', type: 'Text' }, { id: 'ConfigJSON', type: 'Text' }, { id: 'Nom', type: 'Text' },
    { id: 'TypeRapport', type: 'Text' }, { id: 'DateModif', type: 'DateTime' }, { id: 'ModifiePar', type: 'Text' }
  ];
  const REPORT_NAME = 'Dashboard financier';
  const config = { readyTimeoutMs: 12000 }; // modifiable (essais) : délai sans réponse de Grist-BI avant le repli sur les graphiques faits main
  const RELOAD_DELAY_MS = 450;
  const PERSIST_DELAY_MS = 800;
  const MAX_STATE_CHARS = 300000; // au-delà, l'état n'est plus enregistré (les options d'un widget ne sont pas faites pour de gros volumes)

  // Les quatre graphiques retenus (18/11/2026, mix-retenu) ; `Mesure` sépare les deux séries, `Reste` est signé.
  const PRESET_TILES = [
    { id: 'p_annee', type: 'bar', aggFn: 'sum', dimension: 'Annee', drillDimensions: ['Programme', 'Projet'], seriesColumn: 'Mesure', measure: 'Montant', title: 'Attribué et consommé par année' },
    { id: 'p_prog', type: 'bar', aggFn: 'sum', horizontal: true, dimension: 'Programme', drillDimensions: ['Annee', 'Projet'], seriesColumn: 'Mesure', measure: 'Montant', sortMode: 'value-desc', title: 'Attribué et consommé par programme' },
    { id: 'p_reste', type: 'bar', aggFn: 'sum', horizontal: true, dimension: 'Programme', measure: 'Reste', sortMode: 'value-desc', title: 'Reste à consommer par programme' },
    { id: 'p_tree', type: 'treemap', aggFn: 'sum', dimension: 'Projet', measure: 'Reste', title: 'Reste à consommer par projet' }
  ];

  // Même quatre graphiques quand la liste est regroupée par axe InnovationS (26/11/2026) : l'attribué et le consommé par axe, le reste à
  // consommer par action. `Action` réunit les actions d'un projet qui en a plusieurs (« A1 + A2 ») : la table plate ne compte jamais un projet deux fois
  // (la liste, elle, le compte dans chaque action).
  const PRESET_TILES_AXE = [
    { id: 'p_annee', type: 'bar', aggFn: 'sum', dimension: 'Annee', drillDimensions: ['Axe', 'Action', 'Projet'], seriesColumn: 'Mesure', measure: 'Montant', title: 'Attribué et consommé par année' },
    { id: 'p_prog', type: 'bar', aggFn: 'sum', horizontal: true, dimension: 'Axe', drillDimensions: ['Action', 'Projet'], seriesColumn: 'Mesure', measure: 'Montant', sortMode: 'value-desc', title: 'Attribué et consommé par axe' },
    { id: 'p_reste', type: 'bar', aggFn: 'sum', horizontal: true, dimension: 'Action', measure: 'Reste', sortMode: 'value-desc', title: 'Reste à consommer par action' },
    { id: 'p_tree', type: 'treemap', aggFn: 'sum', dimension: 'Projet', measure: 'Reste', title: 'Reste à consommer par projet' }
  ];

  const clone = value => JSON.parse(JSON.stringify(value));

  // mode : 'programme' (défaut) ou 'axe' — les graphiques suivent le regroupement choisi dans la liste.
  function presetConfig(mode) {
    return { pages: [{ id: 'page_default', name: 'Page 1', tiles: clone(mode === 'axe' ? PRESET_TILES_AXE : PRESET_TILES) }], currentPageId: 'page_default', bookmarks: [], blend: null };
  }
  function presetRow(tableId, now, mode) {
    return { TableId: tableId, ConfigJSON: JSON.stringify(presetConfig(mode)), Nom: REPORT_NAME, TypeRapport: 'rapport', DateModif: Math.floor((now || Date.now()) / 1000), ModifiePar: '' };
  }

  // http(s) uniquement (jamais javascript: ni data:) : l'iframe obtient, via le pont, la table de données de cette page.
  function safeUrl(value) {
    try {
      const url = new URL(value);
      const local = ['localhost', '127.0.0.1'].includes(url.hostname);
      return url.protocol === 'https:' || (url.protocol === 'http:' && local) ? url : null;
    } catch (err) { return null; }
  }

  // ?gristbi=<adresse> remplace l'adresse de Grist-BI (essais, copie locale) ; ?bridgeOrigin=* quand Grist exécute les widgets en bac à sable.
  function resolveTarget(search) {
    const params = new URLSearchParams(search || '');
    const override = params.get('gristbi');
    const url = (override && safeUrl(override)) || safeUrl(GRIST_BI_URL);
    return { url: url.href, origin: params.get('bridgeOrigin') === '*' ? '*' : url.origin };
  }

  /**
   * Monte Grist-BI dans `host`. options : {
   *   grist        : API du widget (défaut window.grist : getOption/setOption, relayés pour l'état et les options imbriquées) ;
   *   rows         : lignes de Dashboard_Financier (DashboardLogic.biRows) ;
   *   search       : chaîne de requête de la page (défaut location.search) ;
   *   userEmail    : () => adresse de la personne (formules déclenchées user.Email de Grist-BI) ;
   *   onStatus     : ({phase: 'loading'|'ready'|'failed'|'rejected', ...}) ;
   *   readyTimeoutMs
   * }
   * Rend un contrôleur : update(rows), resetPreset(), destroy(), getStatus(), getLog(), doc.
   */
  async function mount(host, options) {
    const opts = options || {};
    const api = opts.grist || global.grist;
    const target = resolveTarget(opts.search !== undefined ? opts.search : global.location.search);
    const DL = global.DashboardLogic;
    let status = { phase: 'loading' };
    let destroyed = false;
    let persistTimer = null;
    let reloadTimer = null;
    let readyTimer = null;
    let signature = JSON.stringify(opts.rows || []);
    let mode = opts.mode === 'axe' ? 'axe' : 'programme';

    const setStatus = next => { status = next; if (typeof opts.onStatus === 'function') { try { opts.onStatus(next); } catch (err) { /* l'afficheur ne casse pas le widget */ } } };

    async function persist(state) {
      persistTimer = null;
      if (destroyed || !api || typeof api.setOption !== 'function') return;
      const size = JSON.stringify(state).length;
      if (size > MAX_STATE_CHARS) { console.warn(`Grist-BI : configuration trop volumineuse (${size} caractères), non enregistrée`); return; }
      try { await api.setOption(STATE_KEY, state); } catch (err) { console.warn('Grist-BI : configuration non enregistrée (droits en lecture seule ?)', err && err.message); }
    }
    let lastState = null;
    const doc = global.VirtualDoc.create({
      docName: REPORT_NAME, docSettings: { locale: 'fr-FR', currency: 'EUR' }, userEmail: opts.userEmail,
      onChange: state => { lastState = state; clearTimeout(persistTimer); persistTimer = setTimeout(() => persist(lastState), PERSIST_DELAY_MS); }
    });

    let saved = null;
    try { saved = api && typeof api.getOption === 'function' ? await api.getOption(STATE_KEY) : null; } catch (err) { saved = null; }
    if (destroyed) return null;
    if (saved) doc.importState(saved);
    doc.setReadOnlyTable(DL.BI_TABLE, DL.BI_COLUMNS, opts.rows || []);
    doc.ensureTable(CONFIG_TABLE, CONFIG_COLUMNS, [presetRow(DL.BI_TABLE, null, mode)]);

    const frame = document.createElement('iframe');
    frame.className = 'db-bi-frame';
    frame.title = 'Graphiques Grist-BI';
    host.appendChild(frame); // l'iframe doit être dans le document pour avoir une fenêtre
    const bridge = global.GristBridge.attach(frame, {
      origin: target.origin,
      optionsKey: OPTIONS_KEY,
      api: {
        docApi: doc.docApi,
        getOption: key => api.getOption(key),
        setOption: (key, value) => api.setOption(key, value)
      },
      onStatus: info => {
        if (destroyed) return;
        if (info.phase === 'ready') { clearTimeout(readyTimer); setStatus({ phase: 'ready' }); }
        else if (info.phase === 'rejected') { clearTimeout(readyTimer); setStatus({ phase: 'rejected', origin: info.origin, expected: info.expected }); }
      }
    });
    function load() {
      setStatus({ phase: 'loading' });
      clearTimeout(readyTimer);
      readyTimer = setTimeout(() => { if (!destroyed && status.phase === 'loading') setStatus({ phase: 'failed', reason: 'timeout' }); }, opts.readyTimeoutMs || config.readyTimeoutMs);
      frame.src = target.url;
    }
    load();

    return {
      doc, frame, bridge, target,
      getStatus: () => status,
      getLog: () => bridge.getLog(),
      // Nouvelle table (filtres de la page changés) : Grist-BI ne relit pas ses données seul, on le recharge.
      // `nextMode` : le regroupement de la liste a changé ; les graphiques d'origine de l'autre regroupement sont remplacés, une configuration
      // modifiée dans Grist-BI n'est jamais écrasée (« Rétablir les 4 graphiques » la remet).
      update(rows, nextMode) {
        if (destroyed) return false;
        const wanted = nextMode === undefined ? mode : (nextMode === 'axe' ? 'axe' : 'programme');
        const next = JSON.stringify(rows || []);
        if (next === signature && wanted === mode) return false;
        signature = next;
        if (wanted !== mode) {
          const config = doc.getTable(CONFIG_TABLE);
          const index = config ? config.TableId.indexOf(DL.BI_TABLE) : -1;
          const untouched = index === -1 || config.ConfigJSON[index] === JSON.stringify(presetConfig(mode));
          if (untouched) {
            const row = presetRow(DL.BI_TABLE, null, wanted);
            doc.docApi.applyUserActions(index === -1 ? [['AddRecord', CONFIG_TABLE, null, row]] : [['UpdateRecord', CONFIG_TABLE, config.id[index], { ConfigJSON: row.ConfigJSON, DateModif: row.DateModif }]]).catch(() => {});
          }
          mode = wanted;
        }
        doc.setReadOnlyTable(DL.BI_TABLE, DL.BI_COLUMNS, rows || []);
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => { if (!destroyed) load(); }, RELOAD_DELAY_MS);
        return true;
      },
      // Remet les quatre graphiques retenus (efface les changements faits dans Grist-BI) puis recharge.
      async resetPreset() {
        if (destroyed) return;
        const config = doc.getTable(CONFIG_TABLE);
        const index = config ? config.TableId.indexOf(DL.BI_TABLE) : -1;
        const row = presetRow(DL.BI_TABLE, null, mode);
        if (index === -1) await doc.docApi.applyUserActions([['AddRecord', CONFIG_TABLE, null, row]]);
        else await doc.docApi.applyUserActions([['UpdateRecord', CONFIG_TABLE, config.id[index], { ConfigJSON: row.ConfigJSON, DateModif: row.DateModif }]]);
        load();
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        clearTimeout(persistTimer); clearTimeout(reloadTimer); clearTimeout(readyTimer);
        bridge.detach();
        frame.remove();
      }
    };
  }

  global.DashboardBi = { config, GRIST_BI_URL, STATE_KEY, OPTIONS_KEY, CONFIG_TABLE, CONFIG_COLUMNS, PRESET_TILES, PRESET_TILES_AXE, presetConfig, presetRow, resolveTarget, safeUrl, mount };
})(window);
