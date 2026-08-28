/**
 * Main Application Module
 * Handles project display and navigation
 */

class AppInitializer {
  static async initialize() {
    console.log('🚀 [App] Initializing application...');
    
    try {
      // Step 1: Wait for Grist API
      console.log('⏳ [App] Waiting for Grist API...');
      const grist = await CoreGrist.ready();
      
      if (!grist) {
        throw new Error('Grist API not available');
      }
      console.log('✅ [App] Grist API ready');
      
      // Step 2: Load projects
      console.log('⏳ [App] Loading projects from Grist...');
      const projectsData = await CoreGrist.fetchProjects();
      
      if (!projectsData) {
        throw new Error('Failed to load projects');
      }
      
      console.log('✅ [App] Projects loaded successfully');
      console.log(`📊 Total projects: ${projectsData.records?.length || 0}`);
      
      // Step 3: Store in state
      StateManager.setProjects(projectsData.records || []);
      
      // Step 4: Render projects
      AppUI.renderProjects();
      
      console.log('✅ [App] Application initialized successfully');
      
      return true;
    } catch (error) {
      console.error('❌ [App] Initialization error:', error);
      AppUI.showError('Failed to initialize application: ' + error.message);
      return false;
    }
  }
}

class AppUI {
  static renderProjects() {
    console.log('🎨 [AppUI] Rendering projects...');
    
    const projects = StateManager.getProjects();
    const container = document.getElementById('projects-container');
    
    if (!container) {
      console.warn('⚠️ [AppUI] projects-container not found in DOM');
      return;
    }
    
    if (!projects || projects.length === 0) {
      console.warn('⚠️ [AppUI] No projects to display');
      container.innerHTML = '<p>No projects found</p>';
      return;
    }
    
    console.log(`🎨 [AppUI] Rendering ${projects.length} projects`);
    
    let html = '';
    projects.forEach(project => {
      const projectId = project.id || 'unknown';
      const projectName = project.fields?.name || 'Unnamed Project';
      const projectStatus = project.fields?.status || 'Unknown';
      const projectProgress = project.fields?.progress || 0;
      const projectDescription = project.fields?.description || '';
      
      console.log(`📌 Project: ${projectName} (${projectId}) - Status: ${projectStatus} - Progress: ${projectProgress}%`);
      
      html += `
        <div class="project-card" data-project-id="${projectId}">
          <div class="project-header">
            <h3>${projectName}</h3>
            <span class="project-status ${projectStatus.toLowerCase()}">${projectStatus}</span>
          </div>
          <p class="project-description">${projectDescription}</p>
          <div class="project-progress">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${projectProgress}%"></div>
            </div>
            <span class="progress-text">${projectProgress}%</span>
          </div>
          <button class="btn-view" onclick="App.viewProject('${projectId}')">View Details</button>
        </div>
      `;
    });
    
    container.innerHTML = html;
    console.log('✅ [AppUI] Projects rendered');
  }
  
  static showError(message) {
    console.error('🚨 [AppUI] Error message:', message);
    const container = document.getElementById('projects-container');
    if (container) {
      container.innerHTML = `<div class="error-message">${message}</div>`;
    }
  }
  
  static updateProjectStatus(projectId, status) {
    console.log(`📝 [AppUI] Updating project ${projectId} status to ${status}`);
    const card = document.querySelector(`[data-project-id="${projectId}"]`);
    if (card) {
      const statusSpan = card.querySelector('.project-status');
      if (statusSpan) {
        statusSpan.textContent = status;
        statusSpan.className = `project-status ${status.toLowerCase()}`;
      }
    }
  }
}

class App {
  static viewProject(projectId) {
    console.log(`👁️ [App] Viewing project: ${projectId}`);
    const project = StateManager.getProjectById(projectId);
    
    if (!project) {
      console.error('❌ [App] Project not found:', projectId);
      alert('Project not found');
      return;
    }
    
    console.log('📄 Project data:', project);
    // TODO: Implement project detail view
  }
  
  static createProject(data) {
    console.log('➕ [App] Creating new project:', data);
    // TODO: Implement project creation
  }
  
  static updateProject(projectId, data) {
    console.log(`✏️ [App] Updating project ${projectId}:`, data);
    // TODO: Implement project update
  }
  
  static deleteProject(projectId) {
    console.log(`🗑️ [App] Deleting project ${projectId}`);
    // TODO: Implement project deletion
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('📄 [App] DOM loaded, starting initialization...');
  AppInitializer.initialize();
});

console.log('✅ [App] Module loaded');