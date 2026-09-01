/**
 * 🔴 RÈGLE CRITIQUE D'INITIALISATION
 * 
 * L'app suit une chaîne stricte :
 *   1. HTML charge: grist-plugin-api.js PUIS utils.js → state.js → grist-api.js → app.js
 *   2. app.js appelle initializeApp() au DOMContentLoaded
 *   3. initializeApp() appelle CoreGrist.ready()
 *   4. CoreGrist.ready() retourne window.grist (déjà injecté par le HTML)
 *   5. CoreGrist.loadAllTables() récupère les données
 *   6. renderUI() affiche l'interface
 *
 * ⚠️ NE PAS:
 *   - Charger un module avant ses dépendances dans HTML
 *   - Lancer du code métier avant initializeApp() soit complété
 */
(function (global) {
  'use strict';

  const TABLE_NAMES = ['Projets', 'Annuaire', 'Postes2', 'Structures',
    'Programmes', 'Etablissements', 'Suivi_Instance', 'EcritureComptables'];

  let gristInstance = null;
  let readyPromise = null;

  const CoreGrist = {
    get gristInstance() { return gristInstance; },

    ready(timeoutMs = 10000) {
      if (readyPromise) return readyPromise;
      
      readyPromise = (async () => {
        // window.grist est déjà injecté par grist-plugin-api.js
        const maxWait = Date.now() + timeoutMs;
        while (!window.grist && Date.now() < maxWait) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        if (!window.grist) {
          throw new Error(`Grist API non disponible après ${timeoutMs} ms`);
        }

        await window.grist.ready({ requiredAccess: 'full' });
        gristInstance = window.grist;
        console.info('✅ [CoreGrist] Grist API ready');
        return gristInstance;
      })();

      return readyPromise;
    },

    async getTable(name) {
      if (!gristInstance) {
        throw new Error('CoreGrist not ready - call ready() first');
      }
      console.log(`📥 [CoreGrist] Fetching table: ${name}`);
      try {
        const data = await gristInstance.docApi.fetchTable(name);
        console.log(`✅ [CoreGrist] Table ${name} loaded:`, { recordCount: data.id?.length || 0 });
        return data;
      } catch (err) {
        console.error(`❌ [CoreGrist] Failed to fetch table ${name}:`, err);
        throw err;
      }
    },

    async loadAllTables() {
      console.log('⏳ [CoreGrist] Loading all tables...');
      try {
        const entries = await Promise.all(TABLE_NAMES.map(async name => {
          try {
            const data = await this.getTable(name);
            return [name, data];
          } catch (err) {
            console.warn(`⚠️ [CoreGrist] Table ${name} failed, returning empty:`, err.message);
            return [name, { id: [] }];
          }
        }));
        const result = Object.fromEntries(entries);
        console.log('✅ [CoreGrist] All tables loaded');
        return result;
      } catch (err) {
        console.error('❌ [CoreGrist] loadAllTables failed:', err);
        throw err;
      }
    }
  };

  global.CoreGrist = CoreGrist;
  console.log('✅ [CoreGrist] Module loaded');
})(window);