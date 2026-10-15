/** Page Rédaction — publipostage+ imbriqué (iframe) dans ce widget, pour rédiger la notification d'un projet.
 * Maquette validée par Antoine le 29/09/2026 (https://claude.ai/artifact/6GJwuwYxh9w9FJr7xQCsrV) : bouton "Rédiger"
 * sur chaque carte Notifications (rendu par page-administratif.js, clic géré ici par délégation), puis une seule
 * rangée compacte (retour, fil d'ariane, état de la connexion) au-dessus de l'iframe qui prend toute la hauteur.
 *
 * Le widget imbriqué ne peut pas parler à Grist directement (Grist n'écoute que l'iframe de CE widget) : tout passe
 * par js/core/grist-bridge.js, qui lui relaie l'API document et lui présente une ligne liée au projet comme
 * enregistrement sélectionné (le "select by" d'un widget lié). publipostage+ s'ouvre en mode Lecture (cf. keepReadMode).
 * « Modifier le projet » ouvre la modale projet du widget (project-modal.js, que cette page ne modifie pas) par-dessus la page ;
 * à l'enregistrement, publipostage+ relit sa ligne (cf. onProjectSaved).
 *
 * Quelle ligne, de quelle table ? publipostage+ résout les #Variable d'une AUTRE table par une règle de liaison (« Tables
 * liées », rangée dans la table du document Publipostage_LiensTables, une règle par table cible) construite DEPUIS sa table
 * courante : la règle « Projets » d'une vue branchée sur Notifications n'existe pas pour une vue branchée sur Projets, et sans
 * règle la variable devient « [ERREUR: ligne introuvable dans … ] ». Pour retrouver le mappage déjà fait, la page présente
 * donc la même table que la vue publipostage+ existante du document (cf. loadInfo), au choix de la personne (sélecteur).
 */
(function () {
  'use strict';

  // URL publique (GitHub Pages) de publipostage+ — dépôt lombre33/publipostageGrist. Surchargeable par ?publipostage=<url>
  // sur l'URL de CE widget (essai d'une autre version sans republier) : https uniquement, http seulement vers localhost.
  const PUBLIPOSTAGE_URL = 'https://lombre33.github.io/publipostageGrist/';
  const PROJECT_TABLE = 'Projets';
  // Table présentée par défaut (ni choix enregistré ni vue publipostage+ trouvée) : la fiche de notification du projet, l'objet de
  // cette page. Sans ligne pour le projet cliqué, on retombe sur la ligne du projet lui-même.
  const DEFAULT_TABLE = 'Notifications';
  // Colonne Référence vers Projets de la table par défaut, si les métadonnées du document sont illisibles (cf. page-administratif.js).
  const DEFAULT_REF_COLUMN = 'Projet';
  // Table du document où publipostage+ range ses règles de liaison (js/grist-api.js de publipostage+ : LINKS_TABLE_NAME).
  const LINKS_TABLE = 'Publipostage_LiensTables';
  // Choix de la table présentée (sélecteur de la rangée du haut) : par navigateur, dans localStorage (peut être indisponible).
  const TABLE_CHOICE_KEY = 'suiviProjetInnovationS:redactionTable';
  // Clé, dans les options de CE widget, sous laquelle Grist persiste les options de publipostage+ (modèles, réglages...).
  const OPTIONS_KEY = 'publipostage';
  const ADMIN_VIEW_ID = 'view-administratif';
  const REDACTION_VIEW_ID = 'view-redaction';

  // Bouton « Mode lecture » de publipostage+ (index.html de lombre33/publipostageGrist), piloté pour l'ouvrir en Lecture (cf. keepReadMode).
  const READ_BUTTON_ID = 'btn-mode-read';

  const PHASE_LABELS = { waiting: 'en attente du widget', ready: 'connecté', rejected: 'origine refusée' };

  // Variables du modèle affiché que la modale projet ne permet pas de modifier (cf. watchTemplate, redaction-variables.js) :
  // templateId (valeur de #template-select de publipostage+), name, result (RedactionVariables.analyse) ou null, note (état au journal).
  const newVars = () => ({ templateId: null, name: '', result: null, note: 'non démarré', timer: null, scheduled: null, token: 0 });

  const ui = {
    frame: null, bridge: null, target: null, readyTimer: null, timedOut: false, projectId: null, needsReload: false,
    readModeTimer: null, readModeNote: null,
    vars: newVars(),
    linked: null,     // {table, rowId, why, missing} : la ligne présentée à publipostage+ (cf. resolveLinked)
    info: null,       // promesse de loadInfo() : lue une fois par ouverture de la page (« Recharger » la relit)
    openToken: 0,     // un clic plus récent, ou un reset, invalide une ouverture encore en cours
    opening: null
  };

  const byId = id => document.getElementById(id);
  const findProject = id => ((window.CoreState && CoreState.getTable('Projets')) || []).find(p => String(p.id) === String(id));

  // http(s) uniquement : jamais javascript:, data:... dans une iframe qui obtient un accès complet au document.
  function safeUrl(value) {
    try {
      const url = new URL(value);
      const local = ['localhost', '127.0.0.1'].includes(url.hostname);
      return url.protocol === 'https:' || (url.protocol === 'http:' && local) ? url : null;
    } catch (err) { return null; }
  }

  // URL de publipostage+ et origine que le pont acceptera. access/readonly sont transmis comme Grist le fait pour un widget.
  function resolveTarget() {
    const params = new URLSearchParams(location.search);
    const override = params.get('publipostage');
    const url = (override && safeUrl(override)) || safeUrl(PUBLIPOSTAGE_URL);
    if (override && !safeUrl(override)) console.warn('Paramètre ?publipostage= ignoré : URL http(s) attendue');
    ['access', 'readonly'].forEach(key => { if (params.has(key)) url.searchParams.set(key, params.get(key)); });
    // ?bridgeOrigin=* : à n'utiliser que si Grist exécute les widgets dans une iframe sandboxée (origine "null") — le pont
    // se contente alors de vérifier que le message vient bien de l'iframe.
    return { url: url.href, origin: params.get('bridgeOrigin') === '*' ? '*' : url.origin };
  }

  function showOnly(viewId) {
    document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
    byId(viewId)?.classList.remove('hidden');
  }

  // Fil d'ariane : l'acronyme du projet (ou son nom).
  function setCrumb(project) {
    const crumb = byId('redaction-project');
    if (crumb) crumb.textContent = project.Acronyme || project.Projet || 'Sans acronyme';
  }

  // --- Table présentée à publipostage+ (lue dans le document, jamais écrite d'ici) ---
  async function readTable(name) {
    const api = window.grist && window.grist.docApi;
    if (!api) throw new Error('API Grist indisponible');
    return api.fetchTable(name);
  }
  const readTableOrNull = name => readTable(name).catch(() => null);

  // Adresse du widget d'une section « personnalisée » : Grist range sa définition dans _grist_Views_section.options, un JSON
  // { customView: "<JSON sérialisé>" } dont l'url est celle du widget (grist-core, ViewSectionRec.ts : customDef ← options.customView).
  function customUrlOf(optionsText) {
    try {
      const options = JSON.parse(optionsText || '{}');
      const custom = typeof options.customView === 'string' ? JSON.parse(options.customView) : options.customView;
      return custom && typeof custom.url === 'string' ? custom.url : '';
    } catch (err) { return ''; }
  }
  // Même site, sans tenir compte de la requête ni d'un index.html final.
  const siteKey = value => {
    try { const url = new URL(value); return `${url.origin}${url.pathname.replace(/index\.html$/i, '').replace(/\/+$/, '')}`.toLowerCase(); } catch (err) { return ''; }
  };
  // Une section est celle de publipostage+ si elle charge la même adresse que cette page, ou une adresse qui le nomme (autre déploiement).
  const isPublipostageUrl = (url, targetKey) => !!url && (siteKey(url) === targetKey || /publipostage/i.test(url));

  const emptyInfo = () => ({ linkable: { [DEFAULT_TABLE]: DEFAULT_REF_COLUMN }, viewTables: [], sectionsReadable: false, rules: null, linksTable: 'unknown', formulas: new Set() });
  const listTablesOrNull = () => {
    const api = window.grist && window.grist.docApi;
    return api && api.listTables ? Promise.resolve(api.listTables()).catch(() => null) : Promise.resolve(null);
  };
  const rulesFrom = links => (links && Array.isArray(links.id)
    ? links.id.map((id, i) => ({ table: links.TableCible[i], mode: links.Mode[i], cible: links.ColonneCible[i], source: links.ColonneSource[i] }))
    : null);

  // Ce que le document dit de publipostage+ et des tables reliées aux projets. Chaque lecture est indépendante : une table de
  // métadonnées illisible (droits d'accès...) retire un signal mais ne bloque jamais l'ouverture.
  //  - linkable : {table: colonne Référence vers Projets} — les tables dont on sait présenter « la ligne du projet » ;
  //  - viewTables : les tables auxquelles sont branchées les vues publipostage+ EXISTANTES du document (leurs règles de liaison
  //    ont été faites depuis ces tables) ;
  //  - rules : le mappage de publipostage+ (Publipostage_LiensTables), pour le journal de diagnostic.
  async function loadInfo() {
    const [tables, columns, sections, links, listed] = await Promise.all(
      ['_grist_Tables', '_grist_Tables_column', '_grist_Views_section', LINKS_TABLE].map(readTableOrNull).concat(listTablesOrNull()));
    const info = emptyInfo();
    const targetKey = siteKey(resolveTarget().url);
    if (Array.isArray(listed)) info.linksTable = listed.includes(LINKS_TABLE) ? 'present' : 'absent';
    const tableIdByRef = new Map();
    const summaryRefs = new Set(); // tables de résumé : Grist les repère par summarySourceTable (leur colonne de regroupement est une copie)
    if (tables && Array.isArray(tables.id)) {
      tables.id.forEach((ref, i) => {
        tableIdByRef.set(ref, tables.tableId[i]);
        if (tables.summarySourceTable && tables.summarySourceTable[i]) summaryRefs.add(ref);
      });
    }
    if (tableIdByRef.size && columns && Array.isArray(columns.id)) {
      info.linkable = {};
      columns.id.forEach((ref, i) => {
        const tableId = tableIdByRef.get(columns.parentId[i]); // '' : table dont l'accès est refusé
        // Colonnes calculées par une formule (isFormula sans formule = colonne vide ; formule déclenchée = isFormula faux) : aucune
        // modale ne peut les modifier (cf. variables du modèle affiché).
        if (tableId && columns.isFormula && columns.isFormula[i] && columns.formula && columns.formula[i]) info.formulas.add(`${tableId}.${columns.colId[i]}`);
        if (!tableId || tableId === PROJECT_TABLE || summaryRefs.has(columns.parentId[i]) || /^(_grist_|GristHidden_)/.test(tableId)) return;
        if (columns.type[i] !== `Ref:${PROJECT_TABLE}`) return;
        if (!info.linkable[tableId] || columns.colId[i] === DEFAULT_REF_COLUMN) info.linkable[tableId] = columns.colId[i];
      });
    }
    if (tableIdByRef.size && sections && Array.isArray(sections.id)) {
      info.sectionsReadable = true;
      sections.id.forEach((ref, i) => {
        if (!isPublipostageUrl(customUrlOf(sections.options && sections.options[i]), targetKey)) return;
        const tableId = tableIdByRef.get(sections.tableRef && sections.tableRef[i]);
        if (tableId && !info.viewTables.includes(tableId)) info.viewTables.push(tableId);
      });
    }
    info.rules = rulesFrom(links);
    return info;
  }
  const getInfo = () => ui.info || (ui.info = loadInfo().catch(() => emptyInfo()));

  // Le mappage change pendant la session (publipostage+ l'écrit via le pont) : relu à l'ouverture du journal de diagnostic.
  async function refreshRules() {
    const info = ui.linked && ui.linked.info;
    if (!info) return;
    const rules = rulesFrom(await readTableOrNull(LINKS_TABLE));
    if (rules) info.rules = rules;
  }

  // Tables que la page sait présenter : les tables reliées aux projets, puis Projets lui-même.
  const tableOptions = info => [...Object.keys(info.linkable).sort(), PROJECT_TABLE];

  // Choix de la personne (sélecteur) : en mémoire pour la session, et dans localStorage quand le navigateur le permet.
  let sessionChoice = null;
  function readChoice() {
    if (sessionChoice) return sessionChoice;
    try { return localStorage.getItem(TABLE_CHOICE_KEY); } catch (err) { return null; }
  }
  function storeChoice(table) {
    sessionChoice = table;
    try { localStorage.setItem(TABLE_CHOICE_KEY, table); } catch (err) { /* sans stockage : vaut pour cette session */ }
  }
  function forgetChoice() {
    sessionChoice = null;
    try { localStorage.removeItem(TABLE_CHOICE_KEY); } catch (err) { /* idem */ }
  }

  // Priorité : choix de la personne, puis table de la vue publipostage+ existante (son mappage est fait depuis elle), puis défaut.
  function chooseTable(info) {
    const options = tableOptions(info);
    const chosen = readChoice();
    if (chosen && options.includes(chosen)) return { table: chosen, why: 'choix enregistré' };
    const existing = info.viewTables.filter(table => options.includes(table));
    if (existing.length === 1) return { table: existing[0], why: 'table de la vue publipostage+ existante du document' };
    const table = options.includes(DEFAULT_TABLE) ? DEFAULT_TABLE : PROJECT_TABLE;
    return { table, why: existing.length > 1 ? `par défaut : plusieurs vues publipostage+ (${existing.join(', ')})` : 'par défaut' };
  }

  // Id de la ligne de `table` à présenter pour ce projet : le projet lui-même, ou la première ligne dont la colonne Référence
  // pointe vers lui. null s'il n'y en a pas.
  async function rowFor(project, table, info) {
    if (table === PROJECT_TABLE) return project.id;
    const column = info.linkable[table];
    if (!column) return null;
    const data = await readTable(table);
    const index = ((data && data[column]) || []).findIndex(value => String(value) === String(project.id));
    return index === -1 ? null : data.id[index];
  }

  async function resolveLinked(project) {
    const info = await getInfo();
    const choice = chooseTable(info);
    let rowId = null;
    try { rowId = await rowFor(project, choice.table, info); } catch (err) { console.warn(`Ligne ${choice.table} du projet illisible :`, err.message); }
    if (rowId == null) {
      return { table: PROJECT_TABLE, rowId: project.id, why: `repli : aucune ligne ${choice.table} pour ce projet`, missing: choice.table, info };
    }
    return { table: choice.table, rowId, why: choice.why, info };
  }

  // Le sélecteur de la rangée du haut : seulement quand il y a un choix à faire.
  function refreshTableSelect(linked) {
    const select = byId('redaction-table');
    if (!select) return;
    const options = tableOptions(linked.info);
    select.textContent = '';
    options.forEach(table => select.appendChild(new Option(table, table)));
    select.value = linked.table;
    select.hidden = options.length < 2;
  }

  // --- Puce d'état de la connexion (dans la rangée du haut) et journal de diagnostic ---
  function setChip(phase, label) {
    const chip = byId('redaction-status');
    if (!chip) return;
    chip.classList.remove('is-waiting', 'is-ready', 'is-error');
    chip.classList.add(`is-${phase}`);
    const text = byId('redaction-status-text');
    if (text) text.textContent = label;
    chip.title = label; // sous 900 px, connectée, la puce n'affiche plus que son point (css/redaction.css)
  }

  // Piste à suivre selon l'état, pour diagnostiquer sans ouvrir la console du navigateur.
  function diagHint(state) {
    if (!state) return null;
    if (state.phase === 'rejected') {
      return 'Piste : la page répond depuis une autre origine que celle attendue. Si Grist exécute les widgets dans une iframe sandboxée (origine "null"), ajouter ?bridgeOrigin=* à l\'URL de ce widget.';
    }
    if (!state.ready && ui.timedOut) {
      return 'Piste : aucun "prêt" reçu de la page. Vérifier que l\'URL est publiée et s\'ouvre seule dans un onglet (URL erronée ou page qui interdit l\'affichage en iframe).';
    }
    return null;
  }

  // Le mappage de publipostage+ tel que le document le contient : noms de tables et de colonnes seulement, aucune donnée de ligne.
  function ruleLines(info) {
    const title = `Règles de liaison (${LINKS_TABLE})`;
    if (info.rules === null) return [`${title} : ${info.linksTable === 'absent' ? 'table absente (publipostage+ la crée au premier besoin)' : 'illisibles'}`];
    if (!info.rules.length) return [`${title} : aucune`];
    const describe = rule => (rule.mode === 'singleton'
      ? `  - ${rule.table} : une seule ligne`
      : `  - ${rule.table} : ${rule.cible} de ${rule.table} = ${rule.source} de la table présentée`);
    return [`${title} :`, ...info.rules.map(describe)];
  }

  // Les vues publipostage+ du document ; celles dont la table n'est pas reliée aux projets ne peuvent pas être présentées : signalées.
  function viewsText(info) {
    if (!info.viewTables.length) return info.sectionsReadable ? 'aucune trouvée' : 'illisibles';
    const options = tableOptions(info);
    return info.viewTables.map(table => (options.includes(table) ? table : `${table} (sans lien avec ${PROJECT_TABLE} : ignorée)`)).join(', ');
  }

  function diagText() {
    const state = ui.bridge && ui.bridge.getState();
    const hint = diagHint(state);
    const linked = ui.linked;
    const views = linked ? viewsText(linked.info) : null;
    const header = [
      `URL : ${ui.target ? ui.target.url : '—'}`,
      `Origine acceptée : ${ui.target ? ui.target.origin : '—'}`,
      `Enregistrement sélectionné : ${linked ? `${linked.table} #${linked.rowId}` : '—'}`,
      ...(linked ? [`Table présentée : ${linked.table} (${linked.why})`, `Vues publipostage+ du document : ${views}`, ...ruleLines(linked.info)] : []),
      ...varsLines(),
      `État : ${state ? (PHASE_LABELS[state.phase] || state.phase) : 'non démarré'}`,
      ...(hint ? [hint] : []),
      `Mode Lecture par défaut : ${ui.readModeNote || 'non démarré'}`,
      ''
    ];
    const entries = ui.bridge ? ui.bridge.getLog().slice(-60).map(e => `${e.at.slice(11, 19)} ${e.kind.padEnd(6)} ${e.text}`) : [];
    return header.concat(entries).join('\n');
  }

  function renderDiag() {
    const panel = byId('redaction-diag');
    const log = byId('redaction-log');
    if (panel && log && !panel.hidden) log.textContent = diagText();
  }

  function closeDiag() {
    const panel = byId('redaction-diag');
    if (panel) panel.hidden = true;
    byId('redaction-status')?.setAttribute('aria-expanded', 'false');
  }

  function toggleDiag() {
    const panel = byId('redaction-diag');
    if (!panel) return;
    panel.hidden = !panel.hidden;
    byId('redaction-status')?.setAttribute('aria-expanded', String(!panel.hidden));
    renderDiag();
    if (!panel.hidden) { closeVars(); refreshRules().then(renderDiag, () => {}); }
  }

  function onBridgeStatus(status) {
    if (status.phase === 'ready') setChip('ready', 'publipostage+ connecté');
    else if (status.phase === 'rejected') setChip('error', 'Origine du widget refusée');
    else setChip('waiting', 'Connexion à publipostage+…');
    renderDiag();
  }

  // --- Mode Lecture par défaut (demande d'Antoine du 29/09/2026) ---
  // publipostage+ démarre toujours en mode Édition : son init() (js/main.js) se termine par switchMode('edit') et il n'a aucun
  // paramètre de démarrage. Son site GitHub Pages étant de même origine que celui de ce widget (même compte), on pilote son
  // bouton « Mode lecture » : le clic ne prend effet qu'une fois le bouton branché (en cours de démarrage), et le switchMode('edit')
  // final le ramènerait en Édition ; on le reclique donc tant qu'il n'est pas actif, jusqu'à readModeGiveUpMs après l'ouverture
  // (aucun autre code de publipostage+ ne repasse seul en Édition). Dès que la personne agit dans publipostage+ (souris, clavier),
  // son choix prime et on ne touche plus à rien. Sans effet, et journalisé, si la page est d'une autre origine ou sans ce bouton.
  function frameDocument(frame) {
    try { return frame.contentDocument; } catch (err) { return null; }
  }

  function setReadModeNote(note) {
    if (ui.readModeNote === note) return;
    ui.readModeNote = note;
    renderDiag();
  }

  function keepReadMode(frame) {
    const startedAt = Date.now();
    let acted = false;
    let listenedDoc = null;
    const onAct = () => { acted = true; };
    const stop = note => { clearInterval(ui.readModeTimer); ui.readModeTimer = null; setReadModeNote(note); };
    const tick = () => {
      if (!frame.isConnected) { stop('arrêté : iframe retirée'); return; }
      const doc = frameDocument(frame);
      if (!doc) { stop('impossible : page imbriquée d\'une autre origine'); return; }
      if (doc !== listenedDoc) { // la première lecture est parfois l'about:blank d'avant la navigation
        listenedDoc = doc;
        ['pointerdown', 'keydown'].forEach(type => doc.addEventListener(type, onAct, true));
      }
      if (acted) { stop('arrêté : la personne agit dans publipostage+'); return; }
      const button = doc.getElementById(READ_BUTTON_ID);
      const active = !!button && button.classList.contains('active');
      if (button && !active) button.click(); // sans effet tant que publipostage+ n'a pas branché son bouton : prochain passage
      setReadModeNote(active ? 'appliqué' : 'en attente de publipostage+');
      if (Date.now() - startedAt >= api.readModeGiveUpMs) {
        stop(active ? 'appliqué' : (button ? 'non appliqué : délai dépassé' : 'bouton « Mode lecture » introuvable'));
      }
    };
    clearInterval(ui.readModeTimer);
    ui.readModeTimer = setInterval(tick, api.readModeTickMs);
  }

  // --- Variables du modèle affiché que la modale projet ne permet pas de modifier (demande d'Antoine du 01/10/2026) ---
  // Quel modèle publipostage+ affiche-t-il ? Son <select id="template-select"> en est « l'unique source de vérité » (js/template-tree-select.js :
  // l'arbre de choix n'est qu'une couche visuelle par-dessus), lisible comme pour keepReadMode parce que les deux pages sont de même origine.
  // Le modèle se lit ensuite dans la table Publipostage_Modeles du document, et redaction-variables.js en tire les variables. Sans l'un ou
  // l'autre : aucun signalement (jamais d'erreur), et le journal dit pourquoi. Seul ce qui est enregistré est analysé : l'auto-enregistrement
  // de publipostage+ passe par le pont (onWrite), qui relance l'analyse.
  const TEMPLATES_TABLE = 'Publipostage_Modeles';
  const TEMPLATE_SELECT_ID = 'template-select';

  function setVarsNote(note) {
    if (ui.vars.note === note) return;
    ui.vars.note = note;
    renderDiag();
  }

  function stopTemplateWatch(note) {
    clearInterval(ui.vars.timer);
    ui.vars.timer = null;
    setVarsNote(note);
  }

  function watchTemplate(frame) {
    clearInterval(ui.vars.timer);
    const tick = () => {
      if (!frame.isConnected) { stopTemplateWatch('arrêté : iframe retirée'); return; }
      if (!isVisible()) return; // page masquée : rien à lire ni à afficher, la lecture reprend à l'affichage
      const doc = frameDocument(frame);
      if (!doc) { stopTemplateWatch('impossible : page imbriquée d\'une autre origine'); return; }
      const select = doc.getElementById(TEMPLATE_SELECT_ID);
      if (!select) { setVarsNote('en attente de la liste des modèles de publipostage+'); return; }
      if (select.value === ui.vars.templateId) return;
      ui.vars.templateId = select.value;
      analyseTemplate(select.value);
    };
    ui.vars.timer = setInterval(tick, api.templateTickMs);
  }

  async function analyseTemplate(templateId) {
    const vars = ui.vars;
    const token = ++vars.token;
    const done = (result, name, note) => {
      if (vars !== ui.vars || token !== vars.token) return; // page réinitialisée, ou une analyse plus récente est passée devant
      Object.assign(vars, { result, name, note });
      renderVars();
      renderDiag();
    };
    if (!templateId) { done(null, '', 'aucun modèle ouvert (nouveau modèle)'); return; }
    try {
      const [data, info] = await Promise.all([readTable(TEMPLATES_TABLE), getInfo()]);
      const at = (data.id || []).findIndex(id => String(id) === String(templateId));
      if (at === -1) { done(null, '', `modèle #${templateId} introuvable dans ${TEMPLATES_TABLE}`); return; }
      const name = String((data.Nom && data.Nom[at]) || '');
      const extracted = RedactionVariables.fromTemplateRow({
        Contenu: data.Contenu && data.Contenu[at], HeaderFooter: data.HeaderFooter && data.HeaderFooter[at], TypeModele: data.TypeModele && data.TypeModele[at]
      });
      if (extracted.skipped) { done(null, name, `modèle ${extracted.skipped} : non analysé`); return; }
      const presentedTable = (ui.linked && ui.linked.table) || PROJECT_TABLE;
      done(RedactionVariables.analyse(extracted.variables, { formulas: info.formulas, presentedTable }), name, 'analysé');
    } catch (err) { done(null, '', `lecture impossible : ${err.message}`); }
  }

  // publipostage+ a écrit dans le document (auto-enregistrement du modèle, par exemple) : le modèle affiché a pu changer.
  function scheduleTemplateAnalysis() {
    const vars = ui.vars;
    if (vars.templateId == null) return; // aucun modèle repéré pour l'instant : le prochain passage de watchTemplate le lira
    clearTimeout(vars.scheduled);
    vars.scheduled = setTimeout(() => { vars.scheduled = null; if (vars === ui.vars) analyseTemplate(vars.templateId); }, api.templateTickMs);
  }

  function resetVars() {
    clearInterval(ui.vars.timer);
    clearTimeout(ui.vars.scheduled);
    ui.vars = newVars();
    renderVars();
  }

  // Le contenu du panneau : les colonnes que la modale ne permet pas de modifier, par table (Projets d'abord), puis les colonnes calculées.
  function fillVarsPanel() {
    const title = byId('redaction-vars-title');
    const list = byId('redaction-vars-list');
    if (!title || !list) return;
    const { result, name } = ui.vars;
    title.textContent = name ? `Modèle « ${name} »` : 'Modèle affiché';
    list.textContent = '';
    if (!result) return;
    const addGroup = (heading, entries, muted) => {
      const section = document.createElement('section');
      section.className = muted ? 'redaction-vars-group is-muted' : 'redaction-vars-group';
      const head = document.createElement('h5');
      head.textContent = heading;
      const items = document.createElement('ul');
      entries.forEach(entry => {
        const item = document.createElement('li');
        item.textContent = entry.column;
        items.appendChild(item);
      });
      section.append(head, items);
      list.appendChild(section);
    };
    result.outside.forEach(group => addGroup(group.table === PROJECT_TABLE ? 'Colonnes de Projets absentes de la modale' : `Table ${group.table} (hors modale projet)`, group.columns, false));
    if (result.formulas.length) addGroup('Calculées par Grist, non modifiables', result.formulas, true);
    const summary = document.createElement('p');
    summary.className = 'redaction-vars-summary';
    summary.textContent = `${result.covered} variable${result.covered > 1 ? 's' : ''} du modèle sur ${result.total} se modifie${result.covered > 1 ? 'nt' : ''} dans la modale.`;
    list.appendChild(summary);
  }

  // La pastille de la rangée du haut : seulement quand le modèle affiché utilise des colonnes que la modale ne permet pas de modifier.
  function renderVars() {
    const pill = byId('redaction-vars');
    if (!pill) return;
    const outside = RedactionVariables.countOutside(ui.vars.result);
    const words = `variable${outside > 1 ? 's' : ''} hors modale`;
    pill.hidden = outside === 0;
    const count = byId('redaction-vars-count');
    if (count) count.textContent = String(outside);
    const wordsEl = byId('redaction-vars-words');
    if (wordsEl) wordsEl.textContent = words;
    pill.title = `${outside} ${words} : le modèle affiché utilise ${outside > 1 ? 'des colonnes' : 'une colonne'} que la modale du projet ne permet pas de modifier`;
    pill.setAttribute('aria-label', pill.title);
    const panel = byId('redaction-vars-panel');
    if (outside === 0) closeVars();
    else if (panel && !panel.hidden) fillVarsPanel();
  }

  function closeVars() {
    const panel = byId('redaction-vars-panel');
    if (panel) panel.hidden = true;
    byId('redaction-vars')?.setAttribute('aria-expanded', 'false');
  }

  function toggleVars() {
    const panel = byId('redaction-vars-panel');
    if (!panel) return;
    panel.hidden = !panel.hidden;
    byId('redaction-vars')?.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) { fillVarsPanel(); closeDiag(); }
  }

  // Au journal de diagnostic : le modèle repéré et ce qu'on en a tiré (noms de tables et de colonnes seulement).
  function varsLines() {
    const { result, name, templateId, note } = ui.vars;
    if (!result) return [`Modèle affiché : ${note}`];
    const outside = RedactionVariables.countOutside(result);
    const lines = [`Modèle affiché : « ${name} » (#${templateId}) : ${result.total} variable${result.total > 1 ? 's' : ''}, ${outside} hors modale, ${result.formulas.length} calculée${result.formulas.length > 1 ? 's' : ''}`];
    result.outside.forEach(group => lines.push(`  - ${group.table} : ${group.columns.map(entry => entry.column).join(', ')}`));
    return lines;
  }

  // --- Iframe + pont (créés à la première ouverture puis conservés : publipostage+ garde son état d'une visite à l'autre) ---
  function ensureFrame(linked) {
    if (ui.frame) return;
    const wrap = byId('redaction-frame-wrap');
    if (!wrap) throw new Error('Zone Rédaction absente de la page');
    ui.target = resolveTarget();
    const frame = document.createElement('iframe');
    frame.id = 'redaction-frame';
    frame.title = 'publipostage+';
    frame.setAttribute('allow', 'clipboard-write; clipboard-read');
    wrap.appendChild(frame); // l'iframe doit être dans le document pour avoir une fenêtre
    ui.frame = frame;
    // Le pont écoute AVANT le chargement de l'iframe : son "prêt" arrive dès l'exécution de son grist.ready().
    ui.bridge = GristBridge.attach(frame, {
      origin: ui.target.origin,
      tableId: linked.table,
      rowId: Number(linked.rowId),
      optionsKey: OPTIONS_KEY,
      onStatus: onBridgeStatus,
      onLog: renderDiag,
      onWrite: () => { ui.needsReload = true; flushReload(); scheduleTemplateAnalysis(); }
    });
    frame.src = ui.target.url;
    keepReadMode(frame);
    watchTemplate(frame);
    ui.readyTimer = setTimeout(() => {
      if (ui.bridge && !ui.bridge.getState().ready && ui.bridge.getState().phase !== 'rejected') {
        ui.timedOut = true;
        setChip('error', 'publipostage+ ne répond pas');
        renderDiag();
      }
    }, api.readyTimeoutMs);
  }

  // Retire l'iframe et son pont ; la table choisie et les lectures du document (ui.info) sont conservées.
  function dropFrame() {
    clearTimeout(ui.readyTimer);
    clearInterval(ui.readModeTimer);
    ui.readModeTimer = null;
    ui.readModeNote = null;
    resetVars();
    if (ui.bridge) ui.bridge.detach();
    if (ui.frame) ui.frame.remove();
    ui.frame = null;
    ui.bridge = null;
    ui.target = null;
    ui.timedOut = false;
  }

  function reset() {
    ui.openToken += 1; // une ouverture encore en cours est abandonnée
    ui.opening = null;
    dropFrame();
    ui.info = null;
    ui.linked = null;
    ui.needsReload = false;
    setChip('waiting', 'Connexion à publipostage+…');
    const panel = byId('redaction-diag');
    if (panel) panel.hidden = true;
  }

  // Une ouverture = résoudre la ligne à présenter (asynchrone : lectures du document), puis créer l'iframe, ou lui renvoyer une
  // autre ligne. publipostage+ ne connaît qu'une table par chargement : si elle change, l'iframe est rechargée.
  async function present(project, token) {
    const linked = await resolveLinked(project);
    if (token !== ui.openToken) return; // un clic plus récent est passé devant, ou la page a été réinitialisée
    ui.linked = linked;
    if (ui.frame && ui.bridge.getState().tableId !== linked.table) dropFrame();
    if (ui.frame) ui.bridge.select(linked.rowId, linked.table); // le "select by" : publipostage+ reçoit cette ligne dans son onRecord
    else ensureFrame(linked);
    refreshTableSelect(linked);
    if (linked.missing) window.CoreUtils?.showToast(`Aucune ligne ${linked.missing} pour ce projet : publipostage+ affiche le projet (table ${PROJECT_TABLE})`);
    renderDiag();
  }

  // Retourne la promesse de l'ouverture (la vue, elle, s'affiche tout de suite).
  function open(projectId) {
    const project = findProject(projectId);
    if (!project) { window.CoreUtils?.showToast('Projet introuvable', true); return Promise.resolve(); }
    ui.projectId = project.id;
    setCrumb(project);
    showOnly(REDACTION_VIEW_ID);
    renderDiag();
    const token = ++ui.openToken;
    ui.opening = present(project, token).catch(err => {
      console.error('Ouverture de la page Rédaction échouée :', err);
      window.CoreUtils?.showToast(`Impossible d'ouvrir publipostage+ : ${err.message}`, true);
    });
    return ui.opening;
  }

  // Ce que publipostage+ a écrit dans le document (ses propres tables, voire des lignes de Projets) n'est pas dans le cache local :
  // rechargé au retour, comme après la création d'un projet (js/app.js).
  async function refreshTables() {
    try {
      const tables = await CoreGrist.loadAllTables();
      Object.entries(tables).forEach(([name, data]) => CoreState.setTable(name, data));
      window.renderProjectsKanban?.(CoreState.getTable('Projets') || []);
      window.renderAdministratif?.();
    } catch (err) { console.warn('Rechargement après la rédaction échoué :', err.message); }
  }

  const isVisible = () => { const view = byId(REDACTION_VIEW_ID); return !!view && !view.classList.contains('hidden'); };

  // Rechargement dès que la page n'est plus affichée : "Retour", mais aussi le menu du haut ; et sans attendre si publipostage+
  // écrit alors que la page est déjà masquée (son iframe reste en vie).
  function flushReload() {
    if (!ui.needsReload || isVisible()) return undefined;
    ui.needsReload = false;
    return refreshTables();
  }

  function close() {
    closeVars();
    showOnly(ADMIN_VIEW_ID);
    return flushReload();
  }

  // --- Modifier le projet : la modale projet du widget, ouverte PAR-DESSUS cette page (elle est fixe et plein écran) ---
  // publipostage+ reste en place dessous, avec son modèle et son mode : on ne change pas de vue.
  async function editProject() {
    const modal = window.ProjectModal;
    if (!modal || typeof modal.open !== 'function') { window.CoreUtils?.showToast('La fiche du projet est indisponible', true); return; }
    // publipostage+ a pu écrire dans le document depuis l'ouverture : la modale ne doit pas partir de valeurs périmées, qu'elle
    // réécrirait à l'enregistrement.
    if (ui.needsReload) { ui.needsReload = false; await refreshTables(); }
    const project = findProject(ui.projectId);
    if (!project) { window.CoreUtils?.showToast('Projet introuvable', true); return; }
    try {
      modal.open(project);
    } catch (err) {
      console.error('Ouverture de la fiche du projet échouée :', err);
      window.CoreUtils?.showToast(`Impossible d'ouvrir la fiche du projet : ${err.message}`, true);
    }
  }

  // La modale projet vient d'enregistrer (l'évènement garde son nom de création, il part aussi après une modification, cf.
  // project-modal.js : saveProject) : le document a changé. publipostage+ relit sa ligne (onRecord/onRecords) et le fil d'ariane
  // suit l'acronyme. Le cache local est rechargé par js/app.js sur ce même évènement ; la lecture ci-dessous n'en dépend pas.
  async function onProjectSaved() {
    if (ui.bridge) ui.bridge.refresh();
    if (ui.projectId == null) return;
    try {
      const data = await readTable(PROJECT_TABLE);
      const at = (data.id || []).findIndex(id => String(id) === String(ui.projectId));
      if (at !== -1) setCrumb({ Acronyme: (data.Acronyme || [])[at], Projet: (data.Projet || [])[at] });
    } catch (err) { console.warn('Fil d\'ariane non rafraîchi après l\'enregistrement du projet :', err.message); }
  }

  function init() {
    const view = byId(REDACTION_VIEW_ID);
    if (view && window.MutationObserver) new MutationObserver(flushReload).observe(view, { attributes: true, attributeFilter: ['class'] });
    byId('redaction-back')?.addEventListener('click', close);
    byId('redaction-edit')?.addEventListener('click', editProject);
    byId('redaction-vars')?.addEventListener('click', toggleVars);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeVars(); });
    window.addEventListener('project-created', onProjectSaved);
    byId('redaction-status')?.addEventListener('click', toggleDiag);
    byId('redaction-table')?.addEventListener('change', event => {
      storeChoice(event.target.value);
      if (ui.projectId != null) open(ui.projectId);
    });
    byId('redaction-reload')?.addEventListener('click', () => {
      const projectId = ui.projectId;
      reset();
      if (projectId != null) open(projectId);
    });
    // Le bouton "Rédiger" est rendu par page-administratif.js (data-redact-notif = id du projet) : clic géré ici, par délégation.
    document.addEventListener('click', event => {
      const button = event.target.closest && event.target.closest('[data-redact-notif]');
      if (button) open(button.dataset.redactNotif);
    });
  }

  const api = {
    open, close, reset, resolveTarget,
    setTable: storeChoice, forgetTable: forgetChoice, // le choix du sélecteur, sans passer par l'interface (tests)
    readyTimeoutMs: 10000, // délai avant d'afficher "ne répond pas" (modifiable, notamment par les tests)
    // Pas et durée du pilotage du mode Lecture (cf. keepReadMode) : le démarrage de publipostage+ charge TipTap depuis esm.sh puis
    // attend jusqu'à 5 s la lecture des droits d'accès avant son switchMode('edit') final.
    readModeTickMs: 150,
    readModeGiveUpMs: 40000,
    templateTickMs: 1000, // pas de la lecture du modèle affiché par publipostage+ (cf. watchTemplate)
    get frame() { return ui.frame; },
    get bridge() { return ui.bridge; },
    get linked() { return ui.linked; },
    get vars() { return ui.vars; },
    get opening() { return ui.opening; }
  };
  window.PageRedaction = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
