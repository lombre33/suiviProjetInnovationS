/**
 * Grist API Module
 * Loads the real Grist tables and normalizes them for the UI.
 */
(function (global) {
  'use strict';

  const TABLE_NAMES = ['Projets', 'Annuaire', 'Postes2', 'Structures',
    'Programmes', 'Etablissements', 'Etablissement', 'Suivi_Instance', 'EcritureComptables', 'Notifications'];

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
  // Descriptions de colonnes (bulles d'aide) : {tableId: {colId: description}},
  // lues une seule fois depuis les métadonnées _grist_Tables / _grist_Tables_column
  // (même source que js/core/grist-bridge.js) et mises en cache pour le reste de la
  // session — le schéma du document ne change pas pendant que le widget tourne.
  // null tant que loadColumnDescriptions() n'a pas été appelée ou a échoué (droits
  // d'accès insuffisants, document hors Grist) : getColumnDescription() renvoie alors
  // '' partout, donc aucune icône d'aide nulle part plutôt qu'une erreur bloquante.
  let columnDescriptions = null;
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
    async ensureTable(tableId, columns) {
      if (!gristInstance) throw new Error('CoreGrist not ready - call ready() first');
      const existing = await gristInstance.docApi.listTables();
      if (existing.includes(tableId)) return false;
      await gristInstance.docApi.applyUserActions([['AddTable', tableId, columns]]);
      return true;
    },
    // Ajoute les colonnes manquantes à une table déjà existante (ensureTable ne
    // crée la table QUE si elle est absente, et ignore les colonnes demandées
    // sinon — nécessaire pour qu'une table Grist partagée entre plusieurs pages,
    // comme Preferences_Widget, puisse grandir au fil des besoins de chacune).
    async ensureColumns(tableId, columns) {
      if (!gristInstance) throw new Error('CoreGrist not ready - call ready() first');
      const existing = await gristInstance.docApi.fetchTable(tableId);
      const existingIds = new Set(Object.keys(existing));
      const missing = columns.filter(col => !existingIds.has(col.id));
      if (!missing.length) return false;
      await gristInstance.docApi.applyUserActions(missing.map(col => {
        const { id, ...colInfo } = col;
        return ['AddColumn', tableId, id, colInfo];
      }));
      return true;
    },
    // À appeler une fois au démarrage (js/app.js) : peuple le cache lu par
    // getColumnDescription(). Ne renvoie rien et n'écrit jamais rien dans Grist ;
    // une erreur (droits, document non-Grist dans les tests) laisse juste le cache
    // vide, chaque bulle d'aide reste alors absente plutôt que de bloquer l'appli.
    async loadColumnDescriptions() {
      if (!gristInstance) throw new Error('CoreGrist not ready - call ready() first');
      try {
        const [tables, cols] = await Promise.all([
          gristInstance.docApi.fetchTable('_grist_Tables'),
          gristInstance.docApi.fetchTable('_grist_Tables_column')
        ]);
        const tableIdByRef = new Map();
        tables.id.forEach((ref, i) => tableIdByRef.set(ref, tables.tableId[i]));
        const byTable = {};
        cols.id.forEach((ref, i) => {
          const tableId = tableIdByRef.get(cols.parentId[i]);
          const description = cols.description ? cols.description[i] : '';
          if (!tableId || !description) return;
          if (!byTable[tableId]) byTable[tableId] = {};
          byTable[tableId][cols.colId[i]] = description;
        });
        columnDescriptions = byTable;
      } catch (err) {
        console.warn('Chargement des descriptions de colonnes a échoué :', err.message);
        columnDescriptions = {};
      }
    },
    // '' quand le schéma n'a pas (encore) été chargé, que la table/colonne est
    // inconnue, ou que la colonne n'a aucune description dans Grist — jamais
    // d'exception : c'est ce qui décide d'afficher ou non l'icône d'aide.
    getColumnDescription(tableId, colId) {
      return (columnDescriptions && columnDescriptions[tableId] && columnDescriptions[tableId][colId]) || '';
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
