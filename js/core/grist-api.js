/**
 * Grist API Module
 * Simplified initialization - no polling needed since script is loaded before app.js
 */

class CoreGrist {
  static ready() {
    return Promise.resolve(window.grist);
  }

  static async getTable(tableName) {
    const grist = window.grist;
    if (!grist) {
      console.error('❌ Grist API not available');
      return null;
    }
    
    console.log(`📋 Getting table: ${tableName}`);
    return grist.getTable(tableName);
  }

  static async fetchProjects() {
    console.log('🔄 [CoreGrist] Fetching projects...');
    
    try {
      const projectsTable = await this.getTable('Projects');
      if (!projectsTable) {
        throw new Error('Projects table not found');
      }
      
      const data = await projectsTable.fetchSelectedTable();
      console.log('✅ [CoreGrist] Projects loaded:', data);
      
      return data;
    } catch (error) {
      console.error('❌ [CoreGrist] Error fetching projects:', error);
      return null;
    }
  }

  static async fetchTasks(projectId = null) {
    console.log(`🔄 [CoreGrist] Fetching tasks${projectId ? ` for project ${projectId}` : ''}...`);
    
    try {
      const tasksTable = await this.getTable('Tasks');
      if (!tasksTable) {
        throw new Error('Tasks table not found');
      }
      
      const data = await tasksTable.fetchSelectedTable();
      console.log('✅ [CoreGrist] Tasks loaded:', data);
      
      return data;
    } catch (error) {
      console.error('❌ [CoreGrist] Error fetching tasks:', error);
      return null;
    }
  }

  static async fetchTeamMembers() {
    console.log('🔄 [CoreGrist] Fetching team members...');
    
    try {
      const teamTable = await this.getTable('Team Members');
      if (!teamTable) {
        throw new Error('Team Members table not found');
      }
      
      const data = await teamTable.fetchSelectedTable();
      console.log('✅ [CoreGrist] Team members loaded:', data);
      
      return data;
    } catch (error) {
      console.error('❌ [CoreGrist] Error fetching team members:', error);
      return null;
    }
  }

  static async fetchTimeline() {
    console.log('🔄 [CoreGrist] Fetching timeline...');
    
    try {
      const timelineTable = await this.getTable('Timeline');
      if (!timelineTable) {
        throw new Error('Timeline table not found');
      }
      
      const data = await timelineTable.fetchSelectedTable();
      console.log('✅ [CoreGrist] Timeline loaded:', data);
      
      return data;
    } catch (error) {
      console.error('❌ [CoreGrist] Error fetching timeline:', error);
      return null;
    }
  }
}

console.log('✅ [CoreGrist] Module loaded');