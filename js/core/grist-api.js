/* =========================================================
   GRIST API WRAPPER - Couche d'accès à l'API Grist
   ========================================================= */

// Création de l'objet CoreGrist qui sera utilisé par app.js
const CoreGrist = {
  gristInstance: null,
  
  /**
   * Initialise et attend la disponibilité de l'API Grist
   * @param {number} maxWaitTime - Temps max d'attente en ms (défaut 10000)
   * @returns {Promise<object>} L'instance grist
   */
  async ready(maxWaitTime = 10000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkGristInterval = setInterval(() => {
        if (window.grist) {
          clearInterval(checkGristInterval);
          this.gristInstance = window.grist;
          console.log('✅ Grist API trouvée');
          resolve(window.grist);
        } else if (Date.now() - startTime > maxWaitTime) {
          clearInterval(checkGristInterval);
          const err = new Error(`Grist API non trouvée après ${maxWaitTime}ms`);
          console.error('❌ ' + err.message);
          reject(err);
        }
      }, 100);
    });
  },

  /**
   * Récupère une table Grist par son nom
   * @param {string} tableName - Nom de la table
   * @returns {Promise<Array>} Contenu de la table
   */
  async getTable(tableName) {
    if (!this.gristInstance) {
      throw new Error('Grist non initialisé. Appelez ready() d\'abord.');
    }
    try {
      const data = await this.gristInstance.docApi.fetchTable(tableName);
      console.log(`✅ ${tableName} chargés (${data.count || data.length || 0} lignes)`);
      return data;
    } catch (err) {
      console.error(`❌ Erreur chargement ${tableName}:`, err);
      throw err;
    }
  },

  /**
   * Rafraîchit une table en la rechargeant depuis Grist
   * @param {string} tableName - Nom de la table
   * @returns {Promise<Array>} Contenu rafraîchi
   */
  async refreshTable(tableName) {
    return this.getTable(tableName);
  },

  /**
   * Charge toutes les tables nécessaires en parallèle
   * @returns {Promise<object>} Objet avec clé = nom table, valeur = contenu
   */
  async loadAllTables() {
    const tableNames = ['Projets', 'Annuaire', 'Postes2', 'Structures', 'Programmes', 'Etablissements', 'Suivi_Instance'];
    
    try {
      const results = await Promise.all(
        tableNames.map(name => this.getTable(name).then(data => ({ name, data })))
      );
      
      const tables = {};
      results.forEach(({ name, data }) => {
        tables[name] = data;
      });
      
      console.log('🎉 Tous les chargements terminés');
      return tables;
    } catch (err) {
      console.error('❌ Erreur chargement tables:', err);
      throw err;
    }
  }
};

// Exposer CoreGrist globalement pour que app.js puisse l'utiliser
window.CoreGrist = CoreGrist;
