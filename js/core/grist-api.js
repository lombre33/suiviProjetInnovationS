/**
 * 🔴 RÈGLE CRITIQUE D'INITIALISATION
 * 
 * L'app suit une chaîne stricte :
 *   1. HTML charge: utils.js → state.js → grist-api.js → app.js
 *   2. app.js appelle initializeApp() au DOMContentLoaded
 *   3. initializeApp() attend CoreGrist.ready()
 *   4. CoreGrist.ready() appelle window.grist.ready() UNE FOIS
 *   5. CoreState.loadTables() récupère les données
 *   6. renderUI() affiche l'interface
 * 
 * ⚠️ NE PAS:
 *   - Appeler window.grist.ready() ailleurs que dans CoreGrist.ready()
 *   - Charger un module avant ses dépendances dans HTML
 *   - Lancer du code métier avant initializeApp() soit complété
 *   - Créer des pollers/intervals pour attendre Grist
 */
/*
 * Grist adapter — single initialization owner.
 * Contract: app code must await CoreGrist.ready() before any docApi call.
 * The adapter calls the host handshake exactly once, even if callers race.
 */
(function (global) {
  'use strict';

  const TABLE_NAMES = ['Projets', 'Annuaire', 'Postes2', 'Structures',
    'Programmes', 'Etablissements', 'Suivi_Instance'];
  let gristInstance = null;
  let readyPromise = null;

  function waitForInjectedApi(timeoutMs) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const poll = () => {
        const candidate = global.grist;
        if (candidate && typeof candidate.ready === 'function' &&
            candidate.docApi && typeof candidate.docApi.fetchTable === 'function') {
          resolve(candidate); return;
        }
        if (Date.now() - started >= timeoutMs) {
          reject(new Error(`Grist API non injectée après ${timeoutMs} ms`)); return;
        }
        setTimeout(poll, 50);
      };
      poll();
    });
  }

  const CoreGrist = {
    get gristInstance() { return gristInstance; },

    ready(timeoutMs = 10000) {
      if (readyPromise) return readyPromise;
      readyPromise = waitForInjectedApi(timeoutMs).then(api => {
        // This is the v1.2 handshake. Do not replace it with a presence check.
        api.ready({ requiredAccess: 'full' });
        gristInstance = api;
        console.info('[Grist] host handshake sent');
        return api;
      }).catch(error => {
        readyPromise = null; // allow an explicit retry after a failed boot
        throw error;
      });
      return readyPromise;
    },

    async getTable(name) {
      const api = await this.ready();
      return api.docApi.fetchTable(name);
    },

    async refreshTable(name) {
      return this.getTable(name);
    },

    async loadAllTables() {
      const entries = await Promise.all(TABLE_NAMES.map(async name =>
        [name, await this.getTable(name)]));
      return Object.fromEntries(entries);
    }
  };

  global.CoreGrist = CoreGrist;
})(window);
