/**
 * Main Application Module
 * Depends on: CoreUtils, CoreState, CoreGrist
 */
function checkDependencies() { const deps = ['CoreUtils', 'CoreState', 'CoreGrist']; const missing = deps.filter(dep => !window[dep]); if (missing.length) { console.error('Missing core dependencies:', missing); return false; } return true; }
function waitForDependencies(timeout = 5000) { return new Promise(resolve => { const start = Date.now(); const timer = setInterval(() => { if (checkDependencies()) { clearInterval(timer); resolve(true); } else if (Date.now() - start > timeout) { clearInterval(timer); resolve(false); } }, 100); }); }
async function initializeApp() {
  try {
    if (!await waitForDependencies()) throw new Error('Core dependencies not loaded');
    const grist = await CoreGrist.ready(); if (!grist) throw new Error('Grist API not available');
    const tables = await CoreGrist.loadAllTables(); Object.entries(tables).forEach(([name, data]) => CoreState.setTable(name, data));
    renderProjectsKanban(CoreState.getTable('Projets') || []); setupEventListeners();
  } catch (error) { console.error('Initialization error:', error); showError(`Échec de l'initialisation : ${error.message}`); }
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
function showView(viewId) { document.querySelectorAll('.view').forEach(view => view.classList.add('hidden')); document.getElementById(viewId)?.classList.remove('hidden'); }
function showError(message) { const container = document.getElementById('error-container'), errorText = document.getElementById('error-text'); if (container && errorText) { errorText.textContent = message; container.classList.remove('hidden'); setTimeout(() => container.classList.add('hidden'), 5000); } else console.error(message); }
function setupEventListeners() {
  document.querySelectorAll('.nav-btn[data-view]').forEach(button => button.addEventListener('click', () => { showView(button.dataset.view); document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active')); button.classList.add('active'); }));
  document.getElementById('btn-new-project')?.addEventListener('click', () => window.ProjectModal?.open());
  document.getElementById('btn-back')?.addEventListener('click', () => { showView('view-projects'); document.getElementById('btn-projects')?.classList.add('active'); });
  document.getElementById('error-close')?.addEventListener('click', () => document.getElementById('error-container')?.classList.add('hidden'));
  globalThis.addEventListener('project-created', async () => {
    try {
      const tables = await CoreGrist.loadAllTables();
      Object.entries(tables).forEach(([name, data]) => CoreState.setTable(name, data));
      renderProjectsKanban(CoreState.getTable('Projets') || []);
    } catch (error) {
      console.error('Project refresh error:', error);
    }
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeApp); else initializeApp();
