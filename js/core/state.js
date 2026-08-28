/**
 * State Manager Module
 * Centralized application state management
 */

class StateManager {
  static #state = {
    projects: [],
    tasks: [],
    teamMembers: [],
    timeline: [],
    currentProject: null,
    filters: {
      status: null,
      owner: null,
      dateRange: null
    }
  };

  // Projects management
  static setProjects(projects) {
    console.log(`📦 [StateManager] Setting ${projects.length} projects`);
    this.#state.projects = projects;
  }

  static getProjects() {
    return this.#state.projects;
  }

  static getProjectById(projectId) {
    const project = this.#state.projects.find(p => p.id === projectId);
    if (!project) {
      console.warn(`⚠️ [StateManager] Project not found: ${projectId}`);
    }
    return project;
  }

  static getProjectsByStatus(status) {
    return this.#state.projects.filter(p => p.fields?.status === status);
  }

  // Tasks management
  static setTasks(tasks) {
    console.log(`📦 [StateManager] Setting ${tasks.length} tasks`);
    this.#state.tasks = tasks;
  }

  static getTasks() {
    return this.#state.tasks;
  }

  static getTasksByProject(projectId) {
    return this.#state.tasks.filter(t => t.fields?.projectId === projectId);
  }

  static getTasksByStatus(status) {
    return this.#state.tasks.filter(t => t.fields?.status === status);
  }

  // Team members management
  static setTeamMembers(members) {
    console.log(`📦 [StateManager] Setting ${members.length} team members`);
    this.#state.teamMembers = members;
  }

  static getTeamMembers() {
    return this.#state.teamMembers;
  }

  // Timeline management
  static setTimeline(timeline) {
    console.log(`📦 [StateManager] Setting ${timeline.length} timeline entries`);
    this.#state.timeline = timeline;
  }

  static getTimeline() {
    return this.#state.timeline;
  }

  // Current project
  static setCurrentProject(projectId) {
    console.log(`🔍 [StateManager] Setting current project: ${projectId}`);
    this.#state.currentProject = projectId;
  }

  static getCurrentProject() {
    if (!this.#state.currentProject) {
      return null;
    }
    return this.getProjectById(this.#state.currentProject);
  }

  // Filters
  static setFilter(filterName, value) {
    console.log(`🔎 [StateManager] Setting filter ${filterName} = ${value}`);
    this.#state.filters[filterName] = value;
  }

  static getFilter(filterName) {
    return this.#state.filters[filterName];
  }

  static clearFilters() {
    console.log('🧹 [StateManager] Clearing all filters');
    this.#state.filters = {
      status: null,
      owner: null,
      dateRange: null
    };
  }

  // Debug
  static logState() {
    console.log('📊 [StateManager] Current state:', this.#state);
  }

  static clearState() {
    console.log('🧹 [StateManager] Clearing all state');
    this.#state = {
      projects: [],
      tasks: [],
      teamMembers: [],
      timeline: [],
      currentProject: null,
      filters: {
        status: null,
        owner: null,
        dateRange: null
      }
    };
  }
}

window.CoreState = StateManager;
console.log('✅ [StateManager] Module loaded');
