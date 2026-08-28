/**
 * Grist API Module
 * Loads the tables used by the application through the Grist widget API.
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

  static async fetchTable(tableName) {
    const table = await this.getTable(tableName);
    if (!table) throw new Error(`Table not found: ${tableName}`);
    return table.fetchSelectedTable();
  }

  /** Fetch the application tables, retaining an empty array for unavailable optional tables. */
  static async loadAllTables() {
    const tables = {
      Projets: 'Projets',
      Taches: 'Tâches',
      Equipe: 'Annuaire',
      Timeline: 'Timeline'
    };
    const result = {};
    await Promise.all(Object.entries(tables).map(async ([key, name]) => {
      try {
        result[key] = await this.fetchTable(name);
      } catch (error) {
        console.warn(`⚠️ [CoreGrist] Table unavailable (${name}):`, error.message);
        result[key] = [];
      }
    }));
    return result;
  }

  static async fetchProjects() {
    try { return await this.fetchTable('Projets'); }
    catch (error) { console.error('❌ [CoreGrist] Error fetching projects:', error); return null; }
  }

  static async fetchTasks(projectId = null) {
    try { return await this.fetchTable('Tâches'); }
    catch (error) { console.error('❌ [CoreGrist] Error fetching tasks:', error); return null; }
  }

  static async fetchTeamMembers() {
    try { return await this.fetchTable('Annuaire'); }
    catch (error) { console.error('❌ [CoreGrist] Error fetching team members:', error); return null; }
  }

  static async fetchTimeline() {
    try { return await this.fetchTable('Timeline'); }
    catch (error) { console.error('❌ [CoreGrist] Error fetching timeline:', error); return null; }
  }
}

window.CoreGrist = CoreGrist;
console.log('✅ [CoreGrist] Module loaded');