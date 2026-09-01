/**
 * Grist API Module
 * Loads the real Grist tables and normalizes them for the UI.
 */
(function (global) {
  'use strict';

  const TABLE_NAMES = ['Projets', 'Annuaire', 'Postes2', 'Structures',
    'Programmes', 'Etablissements', 'Etablissement', 'Suivi_Instance', 'EcritureComptables'];

  // docApi.fetchTable returns column-oriented data; the UI consumes records.
  function toRecords(table) {
    if (!table || !Array.isArray(table.id)) return [];
    const columns = Object.keys(table).filter(key => key !== 'id');
    return table.id.map((id, index) => {
      const record = { id };
      columns.forEach(column => { record[column] = table[column]?.[index]; });
      return record;
    });
  }

  function mapProjects(rows, annuaire) {
    const people = new Map(annuaire.map(person => [person.id, person.nom_et_Prenom ||
      [person.Prenom, person.NOM].filter(Boolean).join(' ')]));
    return rows.map(project => ({
      ...project,
      // Display aliases keep the existing renderer independent from Grist names.
      Nom: project.Projet || project.Acronyme || '',
      Statut: project.Statut_Macro || project.Statut_operationnel_projet || '',
      Progression: Number(project.Progression ?? 0),
      Propriétaire: people.get(project.Porteur_1) || '',
      Budget: project.Total_2026 || project.Montant_annuel_charge_attribue || 0
    }));
  }

  let gristInstance = null;
  let readyPromise = null;
  const CoreGrist = {
    get gristInstance() { return gristInstance; },
    ready(timeoutMs = 10000) {
      if (readyPromise) return readyPromise;
      readyPromise = (async () => {
        const maxWait = Date.now() + timeoutMs;
        while (!window.grist && Date.now() < maxWait) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (!window.grist) throw new Error(`Grist API non disponible après ${timeoutMs} ms`);
        await window.grist.ready({ requiredAccess: 'full' });
        gristInstance = window.grist;
        return gristInstance;
      })();
      return readyPromise;
    },
    async getTable(name) {
      if (!gristInstance) throw new Error('CoreGrist not ready - call ready() first');
      const data = await gristInstance.docApi.fetchTable(name);
      return toRecords(data);
    },
    async loadAllTables() {
      const entries = await Promise.all(TABLE_NAMES.map(async name => {
        try { return [name, await this.getTable(name)]; }
        catch (err) { console.warn(`Table ${name} failed:`, err.message); return [name, []]; }
      }));
      const result = Object.fromEntries(entries);
      result.Projets = mapProjects(result.Projets || [], result.Annuaire || []);
      return result;
    }
  };
  global.CoreGrist = CoreGrist;
})(window);
