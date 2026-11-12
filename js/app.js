/**
 * Main Application Module
 * Depends on: CoreUtils, CoreState, CoreGrist
 */
function checkDependencies() { const deps = ['CoreUtils', 'CoreState', 'CoreGrist']; const missing = deps.filter(dep => !window[dep]); if (missing.length) { console.error('Missing core dependencies:', missing); return false; } return true; }
// Les scripts sont déjà chargés (fin de <body>) : test immédiat, la minuterie ne sert que si ce n'était pas le cas.
function waitForDependencies(timeout = 5000) { if (checkDependencies()) return Promise.resolve(true); return new Promise(resolve => { const start = Date.now(); const timer = setInterval(() => { if (checkDependencies()) { clearInterval(timer); resolve(true); } else if (Date.now() - start > timeout) { clearInterval(timer); resolve(false); } }, 100); }); }

// --- Rendu des pages ------------------------------------------------------------------------
// Seule la page affichée est rendue tout de suite ; les autres sont marquées « à refaire » et
// rendues à leur ouverture (showView / apparition de la vue), ou dès que le navigateur est
// inactif — avant, les cinq pages étaient reconstruites à chaque démarrage et à chaque
// enregistrement de projet, alors qu'une seule est visible.
const VIEW_RENDERERS = {
  'view-projects': () => renderProjectsKanban(CoreState.getTable('Projets') || []),
  'view-administratif': () => window.renderAdministratif?.(),
  'view-installation-fonds': () => window.renderInstallation?.(),
  'view-todo': () => window.renderTodo?.(),
  'view-instances': () => window.renderInstances?.()
};
const staleViews = new Set();
let idleRenderHandle = null;
function renderView(viewId) { staleViews.delete(viewId); VIEW_RENDERERS[viewId]?.(); }
function ensureViewRendered(viewId) { if (staleViews.has(viewId)) renderView(viewId); }
function visibleViewId() { const el = document.querySelector('.view:not(.hidden)'); return el ? el.id : null; }
// `idle: false` : pas de pré-rendu pendant les temps morts, les pages « à refaire » le sont à leur ouverture.
function renderAllViews({ idle = true } = {}) {
  const current = visibleViewId();
  Object.keys(VIEW_RENDERERS).forEach(viewId => {
    if (viewId === current || (!current && viewId === 'view-projects')) renderView(viewId); else staleViews.add(viewId);
  });
  if (idle) scheduleIdleRenders();
}
// Pré-rend les pages restées « à refaire » pendant les temps morts, une par une, pour que le
// premier changement de page soit instantané sans bloquer le démarrage ni la saisie.
function scheduleIdleRenders() {
  if (idleRenderHandle != null || !staleViews.size) return;
  const run = () => {
    idleRenderHandle = null;
    const next = staleViews.values().next().value;
    if (next !== undefined) renderView(next);
    scheduleIdleRenders();
  };
  idleRenderHandle = typeof requestIdleCallback === 'function' ? requestIdleCallback(run, { timeout: 4000 }) : setTimeout(run, 200);
}
let viewObserver = null;
function cancelIdleRenders() {
  if (idleRenderHandle == null) return;
  if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idleRenderHandle); else clearTimeout(idleRenderHandle);
  idleRenderHandle = null;
}
function observeViewVisibility() {
  if (viewObserver || typeof MutationObserver !== 'function') return;
  viewObserver = new MutationObserver(records => records.forEach(record => {
    const el = record.target;
    if (el.id && !el.classList.contains('hidden')) { ensureViewRendered(el.id); rememberView(el.id); } // aussi les retours « hors showView » (fermeture de la Rédaction)
  }));
  document.querySelectorAll('.view').forEach(view => viewObserver.observe(view, { attributes: true, attributeFilter: ['class'] }));
}
function applyTables(tables) { Object.entries(tables).forEach(([name, data]) => CoreState.setTable(name, data)); }

// --- Dernière page ouverte (retrouvée au rechargement) -----------------------------------------
// Chaque changement de page est retenu par utilisateur dans Preferences_Widget.Page_courante (colonne auto-créée), avec une
// copie dans localStorage écrite aussitôt. La copie sert de filet : un rechargement lancé juste après un clic (Ctrl+Maj+R) peut
// couper l'écriture dans Grist ; la copie reste alors « en attente » (pending) et fait foi à la place de Grist, qui n'a rien
// reçu. Au démarrage, la page retenue est affichée tout de suite d'après la copie (pas d'éclair du Kanban pendant la lecture des
// tables), puis confirmée une fois les préférences lues.
// Retenues : les pages de la barre de navigation (une page ajoutée à la barre l'est donc automatiquement). Les écrans passagers
// (fiche projet, Rédaction) ne le sont pas : après un rechargement, on retrouve la page d'où l'on y était entré (Administratif).
const NAV_PREFS_TABLE = 'Preferences_Widget';
const NAV_PREFS_COLUMNS = [{ id: 'Page_courante', type: 'Text', description: 'Dernière page ouverte dans le widget par cet utilisateur : il la retrouve au rechargement. Renseignée automatiquement par le widget.' }];
const PREFS_ROWID_STORAGE_KEY = 'suiviProjetInnovationS:prefsRowId'; // même clé que les pages (page-projets.js…) : la ligne de l'utilisateur
const LAST_VIEW_STORAGE_KEY = 'suiviProjetInnovationS:lastView';
let navPrefsRowId = null;
let rememberedView = null;
function isRestorableView(viewId) {
  return typeof viewId === 'string' && /^view-[\w-]+$/.test(viewId) && !!document.getElementById(viewId) && !!document.querySelector(`.nav-btn[data-view="${viewId}"]`);
}
function readStoredView() {
  try { const raw = JSON.parse(localStorage.getItem(LAST_VIEW_STORAGE_KEY) || 'null'); if (raw && typeof raw.view === 'string') return { view: raw.view, pending: !!raw.pending }; }
  catch (err) { /* valeur illisible : comme s'il n'y en avait pas */ }
  return { view: '', pending: false };
}
function writeStoredView(view, pending) {
  try { localStorage.setItem(LAST_VIEW_STORAGE_KEY, JSON.stringify({ view, pending })); }
  catch (err) { /* navigation privée / stockage bloqué : la page ne sera retenue que dans Grist */ }
}
function setActiveNav(viewId) { document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewId)); }
// Affiche la page retenue sans la « retenir » de nouveau : rien à écrire, c'est déjà elle.
function restoreView(viewId) {
  if (!isRestorableView(viewId)) return false;
  rememberedView = viewId;
  if (visibleViewId() !== viewId) showView(viewId);
  setActiveNav(viewId);
  return true;
}
function rememberView(viewId) {
  if (viewId === rememberedView || !isRestorableView(viewId)) return;
  rememberedView = viewId;
  writeStoredView(viewId, true);
  saveViewToGrist(viewId);
}
async function saveViewToGrist(viewId) {
  if (!navPrefsRowId || !CoreGrist.gristInstance) return; // ligne de préférences inconnue : la copie reste « en attente » et fait foi
  try {
    await CoreGrist.gristInstance.docApi.applyUserActions([['UpdateRecord', NAV_PREFS_TABLE, navPrefsRowId, { Page_courante: viewId }]]);
    if (rememberedView === viewId) writeStoredView(viewId, false); // sinon une navigation plus récente a pris le relais
  } catch (err) { console.warn('Enregistrement de la dernière page ouverte a échoué :', err.message); }
}
// Page à afficher d'après Grist (lue dans la lecture partagée des préférences : aucune lecture de plus) et la copie locale.
async function loadNavigationPreference() {
  let saved = '';
  try {
    if (CoreGrist.gristInstance) {
      await CoreGrist.ensureColumns(NAV_PREFS_TABLE, NAV_PREFS_COLUMNS); // aucun appel une fois la colonne connue
      const rows = await CoreGrist.getTable(NAV_PREFS_TABLE, { shared: true });
      let cachedId = null;
      try { cachedId = Number(localStorage.getItem(PREFS_ROWID_STORAGE_KEY)) || null; } catch (err) { /* stockage bloqué */ }
      const row = cachedId ? CoreUtils.findById(rows, cachedId) : null;
      if (row) { navPrefsRowId = row.id; saved = String(row.Page_courante || '').trim(); }
    }
  } catch (err) { console.warn('Chargement de la dernière page ouverte a échoué :', err.message); }
  const stored = readStoredView();
  return (stored.pending ? [stored.view, saved] : [saved, stored.view]).find(isRestorableView) || '';
}
// Pour les tests : repart d'un navigateur qui n'a encore rien retenu.
function resetLastView() {
  rememberedView = null; navPrefsRowId = null;
  try { localStorage.removeItem(LAST_VIEW_STORAGE_KEY); } catch (err) { /* ignore */ }
}

async function initializeApp() {
  try {
    restoreView(readStoredView().view); // la page retenue s'affiche tout de suite (copie locale), avant la lecture des tables
    if (!await waitForDependencies()) throw new Error('Core dependencies not loaded');
    const grist = await CoreGrist.ready(); if (!grist) throw new Error('Grist API not available');
    // Tout ce qui ne dépend de rien d'autre part en même temps : les tables, le schéma (descriptions des
    // colonnes + colonnes existantes) et la table de préférences, lue une seule fois pour toutes les pages.
    CoreGrist.openSharedWindow();
    const prefsPrefetch = CoreGrist.getTable('Preferences_Widget', { shared: true }).catch(() => null); // absente au 1er lancement : les chargeurs la créent
    let [tables] = await Promise.all([CoreGrist.loadAllTables(), CoreGrist.loadColumnDescriptions(), prefsPrefetch]);
    // Colonnes neuves de la page Administratif : créées si besoin (1er lancement seulement), puis les tables sont relues
    // pour que les données les contiennent.
    const createdColumns = window.ensureAdministratifColumns ? await window.ensureAdministratifColumns().catch(err => { console.warn('Colonnes Administratif :', err.message); return false; }) : false;
    // Les descriptions (bulles d'aide) sont relues aussi : les colonnes neuves portent la leur.
    if (createdColumns) [tables] = await Promise.all([CoreGrist.loadAllTables(), CoreGrist.loadColumnDescriptions()]);
    applyTables(tables);
    if (window.loadKanbanUserPreferences) await window.loadKanbanUserPreferences();
    if (window.loadAdministratifUserPreferences) await window.loadAdministratifUserPreferences();
    if (window.loadInstallationUserPreferences) await window.loadInstallationUserPreferences();
    if (window.loadTodoUserPreferences) await window.loadTodoUserPreferences();
    if (window.loadInstancesUserPreferences) await window.loadInstancesUserPreferences();
    restoreView(await loadNavigationPreference()); // Grist (ou la copie « en attente ») a le dernier mot
    CoreGrist.closeSharedWindow();
    renderAllViews(); setupEventListeners(); observeViewVisibility();
    // La page Instances ne charge ses données qu'à l'ouverture depuis la barre : retrouvée au rechargement, elle doit les charger elle-même.
    if (visibleViewId() === 'view-instances') Promise.resolve(window.InstancesPage?.open?.()).catch(() => {});
  } catch (error) { console.error('Initialization error:', error); showError(`Échec de l'initialisation : ${error.message}`); }
  finally { CoreGrist.closeSharedWindow?.(); }
}
function viewProject(projectId) {
  const projects = CoreState.getTable('Projets') || []; const project = projects.find(p => String(p.id) === String(projectId));
  if (!project) { showError('Projet non trouvé'); return; }
  CoreState.setCurrentProject(projectId);
  const holder = project.Porteur_1 && (project.Porteur_1.NOM || project.Porteur_1.nom_et_Prenom || project.Porteur_1.name) || project.Porteur_1 || 'N/A';
  document.getElementById('project-title').textContent = project.Acronyme || project.Projet || 'Projet';
  document.getElementById('project-status').textContent = project.Statut_Macro || 'N/A';
  document.getElementById('project-owner').textContent = holder;
  document.getElementById('project-description').textContent = project.Description_rapide_projet || 'Aucune description';
  showView('view-project');
}
window.openProject = viewProject;
function showView(viewId) { document.querySelectorAll('.view').forEach(view => view.classList.add('hidden')); document.getElementById(viewId)?.classList.remove('hidden'); ensureViewRendered(viewId); }
function showError(message) { const container = document.getElementById('error-container'), errorText = document.getElementById('error-text'); if (container && errorText) { errorText.textContent = message; container.classList.remove('hidden'); setTimeout(() => container.classList.add('hidden'), 5000); } else console.error(message); }
let eventsWired = false;
async function refreshAfterProjectSaved() {
  try {
    applyTables(await CoreGrist.loadAllTables());
    renderAllViews();
  } catch (error) {
    console.error('Project refresh error:', error);
  }
}
function setupEventListeners() {
  if (eventsWired) return; eventsWired = true;
  document.querySelectorAll('.nav-btn[data-view]').forEach(button => button.addEventListener('click', () => { showView(button.dataset.view); document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active')); button.classList.add('active'); }));
  document.getElementById('btn-new-project')?.addEventListener('click', () => window.ProjectModal?.open());
  document.getElementById('btn-back')?.addEventListener('click', () => { showView('view-projects'); document.getElementById('btn-projects')?.classList.add('active'); });
  document.getElementById('error-close')?.addEventListener('click', () => document.getElementById('error-container')?.classList.add('hidden'));
  globalThis.addEventListener('project-created', refreshAfterProjectSaved);
}
// Points d'entrée exposés pour les tests (tests/suite-app.js) ; tests/index.html pose
// __SUIVI_SKIP_AUTOINIT__ pour que le chargement de ce fichier ne lance pas l'application.
window.SuiviApp = { initializeApp, renderAllViews, renderView, ensureViewRendered, showView, staleViews, cancelIdleRenders, VIEW_RENDERERS, refreshAfterProjectSaved, resetLastView };
if (!window.__SUIVI_SKIP_AUTOINIT__) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeApp); else initializeApp(); }
