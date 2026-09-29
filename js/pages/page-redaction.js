/** Page Rédaction — publipostage+ imbriqué (iframe) dans ce widget, pour rédiger la notification d'un projet.
 * Maquette validée par Antoine le 29/09/2026 (https://claude.ai/artifact/6GJwuwYxh9w9FJr7xQCsrV) : bouton "Rédiger"
 * sur chaque carte Notifications (rendu par page-administratif.js, clic géré ici par délégation), puis une seule
 * rangée compacte (retour, fil d'ariane, état de la connexion) au-dessus de l'iframe qui prend toute la hauteur.
 *
 * Le widget imbriqué ne peut pas parler à Grist directement (Grist n'écoute que l'iframe de CE widget) : tout passe
 * par js/core/grist-bridge.js, qui lui relaie l'API document et lui présente la ligne du projet comme
 * enregistrement sélectionné (le "select by" d'un widget lié).
 */
(function () {
  'use strict';

  // URL publique (GitHub Pages) de publipostage+ — dépôt lombre33/publipostageGrist. Surchargeable par ?publipostage=<url>
  // sur l'URL de CE widget (essai d'une autre version sans republier) : https uniquement, http seulement vers localhost.
  const PUBLIPOSTAGE_URL = 'https://lombre33.github.io/publipostageGrist/';
  // Table dont la ligne est l'enregistrement sélectionné de publipostage+ : une notification = un projet.
  const LINKED_TABLE = 'Projets';
  // Clé, dans les options de CE widget, sous laquelle Grist persiste les options de publipostage+ (modèles, réglages...).
  const OPTIONS_KEY = 'publipostage';
  const ADMIN_VIEW_ID = 'view-administratif';
  const REDACTION_VIEW_ID = 'view-redaction';

  const PHASE_LABELS = { waiting: 'en attente du widget', ready: 'connecté', rejected: 'origine refusée' };

  const ui = { frame: null, bridge: null, target: null, readyTimer: null, timedOut: false, projectId: null, needsReload: false };

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

  // --- Puce d'état de la connexion (dans la rangée du haut) et journal de diagnostic ---
  function setChip(phase, label) {
    const chip = byId('redaction-status');
    if (!chip) return;
    chip.classList.remove('is-waiting', 'is-ready', 'is-error');
    chip.classList.add(`is-${phase}`);
    const text = byId('redaction-status-text');
    if (text) text.textContent = label;
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

  function diagText() {
    const state = ui.bridge && ui.bridge.getState();
    const hint = diagHint(state);
    const header = [
      `URL : ${ui.target ? ui.target.url : '—'}`,
      `Origine acceptée : ${ui.target ? ui.target.origin : '—'}`,
      `Enregistrement sélectionné : ${LINKED_TABLE} #${ui.projectId == null ? '—' : ui.projectId}`,
      `État : ${state ? (PHASE_LABELS[state.phase] || state.phase) : 'non démarré'}`,
      ...(hint ? [hint] : []),
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

  function toggleDiag() {
    const panel = byId('redaction-diag');
    if (!panel) return;
    panel.hidden = !panel.hidden;
    byId('redaction-status')?.setAttribute('aria-expanded', String(!panel.hidden));
    renderDiag();
  }

  function onBridgeStatus(status) {
    if (status.phase === 'ready') setChip('ready', 'publipostage+ connecté');
    else if (status.phase === 'rejected') setChip('error', 'Origine du widget refusée');
    else setChip('waiting', 'Connexion à publipostage+…');
    renderDiag();
  }

  // --- Iframe + pont (créés à la première ouverture puis conservés : publipostage+ garde son état d'une visite à l'autre) ---
  function ensureFrame() {
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
      tableId: LINKED_TABLE,
      rowId: Number(ui.projectId),
      optionsKey: OPTIONS_KEY,
      onStatus: onBridgeStatus,
      onLog: renderDiag,
      onWrite: () => { ui.needsReload = true; flushReload(); }
    });
    frame.src = ui.target.url;
    ui.readyTimer = setTimeout(() => {
      if (ui.bridge && !ui.bridge.getState().ready && ui.bridge.getState().phase !== 'rejected') {
        ui.timedOut = true;
        setChip('error', 'publipostage+ ne répond pas');
        renderDiag();
      }
    }, api.readyTimeoutMs);
  }

  function reset() {
    clearTimeout(ui.readyTimer);
    if (ui.bridge) ui.bridge.detach();
    if (ui.frame) ui.frame.remove();
    ui.frame = null;
    ui.bridge = null;
    ui.target = null;
    ui.timedOut = false;
    ui.needsReload = false;
    setChip('waiting', 'Connexion à publipostage+…');
    const panel = byId('redaction-diag');
    if (panel) panel.hidden = true;
  }

  function open(projectId) {
    const project = findProject(projectId);
    if (!project) { window.CoreUtils?.showToast('Projet introuvable', true); return; }
    ui.projectId = project.id;
    const crumb = byId('redaction-project');
    if (crumb) crumb.textContent = project.Acronyme || project.Projet || 'Sans acronyme';
    ensureFrame();
    ui.bridge.select(project.id, LINKED_TABLE); // le "select by" : publipostage+ reçoit cette ligne dans son onRecord
    showOnly(REDACTION_VIEW_ID);
    renderDiag();
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
    showOnly(ADMIN_VIEW_ID);
    return flushReload();
  }

  function init() {
    const view = byId(REDACTION_VIEW_ID);
    if (view && window.MutationObserver) new MutationObserver(flushReload).observe(view, { attributes: true, attributeFilter: ['class'] });
    byId('redaction-back')?.addEventListener('click', close);
    byId('redaction-status')?.addEventListener('click', toggleDiag);
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
    readyTimeoutMs: 10000, // délai avant d'afficher "ne répond pas" (modifiable, notamment par les tests)
    get frame() { return ui.frame; },
    get bridge() { return ui.bridge; }
  };
  window.PageRedaction = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
