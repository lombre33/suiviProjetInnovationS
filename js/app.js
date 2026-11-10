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
    if (el.id && !el.classList.contains('hidden')) ensureViewRendered(el.id);
  }));
  document.querySelectorAll('.view').forEach(view => viewObserver.observe(view, { attributes: true, attributeFilter: ['class'] }));
}
function applyTables(tables) { Object.entries(tables).forEach(([name, data]) => CoreState.setTable(name, data)); }

async function initializeApp() {
  try {
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
    CoreGrist.closeSharedWindow();
    renderAllViews(); setupEventListeners(); observeViewVisibility();
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
window.SuiviApp = { initializeApp, renderAllViews, renderView, ensureViewRendered, showView, staleViews, cancelIdleRenders, VIEW_RENDERERS, refreshAfterProjectSaved };
if (!window.__SUIVI_SKIP_AUTOINIT__) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeApp); else initializeApp(); }
