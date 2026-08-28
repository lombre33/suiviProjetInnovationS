/**
 * Main Application Module
 * Depends on: CoreUtils, CoreState, CoreGrist
 */

// Safety check: Verify all dependencies are loaded
function checkDependencies() {
    const deps = ['CoreUtils', 'CoreState', 'CoreGrist'];
    const missing = deps.filter(dep => !window[dep]);
    
    if (missing.length > 0) {
        console.error(`❌ [App] Missing core dependencies: ${missing.join(', ')}`);
        console.error(`❌ [App] Available globals:`, Object.keys(window).filter(k => k.startsWith('Core')));
        return false;
    }
    return true;
}

// Wait for dependencies if needed
function waitForDependencies(timeout = 5000) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
            if (checkDependencies()) {
                clearInterval(checkInterval);
                console.log('✅ [App] All dependencies loaded');
                resolve(true);
                return;
            }
            
            if (Date.now() - startTime > timeout) {
                clearInterval(checkInterval);
                console.error('⏱️ [App] Timeout waiting for dependencies');
                resolve(false);
            }
        }, 100);
    });
}

// ============================================
// APP INITIALIZATION
// ============================================

async function initializeApp() {
    try {
        console.log('🚀 [App] Initializing application...');
        
        // Wait for dependencies
        const depsLoaded = await waitForDependencies();
        if (!depsLoaded) {
            throw new Error('Core dependencies not loaded');
        }
        
        const { CoreUtils, CoreState, CoreGrist } = window;
        
        console.log('⏳ [App] Waiting for Grist API...');
        const grist = await CoreGrist.ready();
        if (!grist) {
            throw new Error('Grist API not available');
        }
        console.log('✅ [App] Grist API ready');
        
        console.log('📥 [App] Loading projects from Grist...');
        const tables = await CoreGrist.loadAllTables();
        console.log('✅ [App] Tables loaded:', Object.keys(tables));
        
        // Store in state
        for (const [tableName, tableData] of Object.entries(tables)) {
            CoreState.setTable(tableName, tableData);
            console.log(`[App] State updated with table: ${tableName}`);
        }
        
        console.log('✅ [App] Application initialized successfully');
        
        // Render projects
        renderProjectsList(CoreState.getTable('Projets') || []);
        
        // Setup event listeners
        setupEventListeners();
        
    } catch (error) {
        console.error('❌ [App] Initialization error:', error);
        showError(`Failed to initialize application: ${error.message}`);
    }
}

// ============================================
// UI RENDERING
// ============================================

function renderProjectsList(projects) {
    const tbody = document.getElementById('projects-tbody');
    if (!tbody) {
        console.error('❌ [App] projects-tbody not found in DOM');
        return;
    }
    
    console.log(`🎨 [AppUI] Rendering ${projects.length} projets`);
    
    tbody.innerHTML = '';
    
    if (!projects || projects.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Aucun projet</td></tr>';
        return;
    }
    
    projects.forEach(project => {
        const row = document.createElement('tr');
        row.className = 'project-row';
        row.innerHTML = `
            <td class="project-name">${CoreUtils.escapeHtml(project.Nom || '')}</td>
            <td class="project-status">
                <span class="badge badge-${(project.Statut || '').toLowerCase()}">
                    ${CoreUtils.escapeHtml(project.Statut || 'N/A')}
                </span>
            </td>
            <td class="project-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${project.Progression || 0}%"></div>
                </div>
                <span>${project.Progression || 0}%</span>
            </td>
            <td class="project-owner">${CoreUtils.escapeHtml(project.Propriétaire || '')}</td>
            <td class="project-budget">${CoreUtils.formatCurrency(project.Budget || 0)}</td>
            <td class="project-actions">
                <button class="btn-action btn-view" data-id="${project.id}">Voir</button>
                <button class="btn-action btn-edit" data-id="${project.id}">✏️</button>
                <button class="btn-action btn-delete" data-id="${project.id}">🗑️</button>
            </td>
        `;
        
        row.querySelector('.btn-view').addEventListener('click', () => viewProject(project.id));
        row.querySelector('.btn-edit').addEventListener('click', () => editProject(project.id));
        row.querySelector('.btn-delete').addEventListener('click', () => deleteProject(project.id));
        
        tbody.appendChild(row);
    });
}

// ============================================
// PROJECT ACTIONS
// ============================================

function viewProject(projectId) {
    const { CoreState } = window;
    const projects = CoreState.getTable('Projets') || [];
    const project = projects.find(p => p.id === projectId);
    
    if (!project) {
        showError('Projet non trouvé');
        return;
    }
    
    console.log(`📂 [App] Viewing project:`, projectId);
    CoreState.setCurrentProject(projectId);
    
    document.getElementById('project-title').textContent = project.Nom;
    document.getElementById('project-status').textContent = project.Statut || 'N/A';
    document.getElementById('project-progress').textContent = project.Progression || 0;
    document.getElementById('project-owner').textContent = project.Propriétaire || 'N/A';
    document.getElementById('project-budget').textContent = CoreUtils.formatCurrency(project.Budget || 0);
    document.getElementById('project-description').textContent = project.Description || 'Aucune description';
    
    showView('view-project');
}

function editProject(projectId) {
    console.log(`✏️ [App] Editing project:`, projectId);
    showError('Édition non disponible pour le moment');
}

function deleteProject(projectId) {
    console.log(`🗑️ [App] Deleting project:`, projectId);
    if (confirm('Êtes-vous sûr de vouloir supprimer ce projet ?')) {
        showError('Suppression non disponible pour le moment');
    }
}

function createProject() {
    console.log('➕ [App] Creating new project');
    showError('Création de projet non disponible pour le moment');
}

// ============================================
// VIEW MANAGEMENT
// ============================================

function showView(viewId) {
    // Hide all views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.add('hidden');
    });
    
    // Show selected view
    const view = document.getElementById(viewId);
    if (view) {
        view.classList.remove('hidden');
    }
}

// ============================================
// ERROR HANDLING
// ============================================

function showError(message) {
    const container = document.getElementById('error-container');
    const errorText = document.getElementById('error-text');
    
    if (container && errorText) {
        errorText.textContent = message;
        container.classList.remove('hidden');
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            container.classList.add('hidden');
        }, 5000);
    } else {
        console.error('❌ [AppUI] Error message:', message);
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // Nav buttons
    document.getElementById('btn-projects')?.addEventListener('click', () => {
        showView('view-list');
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('btn-projects').classList.add('active');
    });
    
    document.getElementById('btn-tasks')?.addEventListener('click', () => {
        showView('view-tasks');
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('btn-tasks').classList.add('active');
    });
    
    document.getElementById('btn-team')?.addEventListener('click', () => {
        showView('view-team');
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('btn-team').classList.add('active');
    });
    
    document.getElementById('btn-timeline')?.addEventListener('click', () => {
        showView('view-timeline');
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('btn-timeline').classList.add('active');
    });
    
    // Project actions
    document.getElementById('btn-create-project')?.addEventListener('click', createProject);
    document.getElementById('btn-back')?.addEventListener('click', () => {
        showView('view-list');
        document.getElementById('btn-projects').classList.add('active');
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('btn-projects').classList.add('active');
    });
    
    // Error close
    document.getElementById('error-close')?.addEventListener('click', () => {
        document.getElementById('error-container').classList.add('hidden');
    });
}

// ============================================
// STARTUP
// ============================================

console.log('📄 [App] Module loaded');

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    // DOM already loaded
    initializeApp();
}
