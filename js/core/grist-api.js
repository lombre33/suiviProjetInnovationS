/**
 * Grist API Module
 * Loads the real Grist tables and normalizes them for the UI.
 */
(function (global) {
  'use strict';

  const TABLE_NAMES = ['Projets', 'Annuaire', 'Postes2', 'Structures',
    'Programmes', 'Etablissements', 'Etablissement', 'Suivi_Instance', 'Lignes_OPE', 'Notifications'];

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

  // Pose la description (métadonnée _grist_Tables_column.description) des colonnes
  // qu'on vient de créer. Les références de ligne des métadonnées ne se connaissent
  // qu'après coup, d'où la relecture. Silencieux en cas d'échec (droits, schéma de
  // métadonnées inattendu) : la colonne existe, seule la bulle d'aide manquera.
  async function describeColumns(tableId, columns) {
    const wanted = columns.filter(col => col.description);
    if (!wanted.length) return;
    try {
      const [tables, cols] = await Promise.all([
        gristInstance.docApi.fetchTable('_grist_Tables'),
        gristInstance.docApi.fetchTable('_grist_Tables_column')
      ]);
      const tableRef = tables.id[tables.tableId.indexOf(tableId)];
      const actions = [];
      wanted.forEach(col => {
        const at = cols.id.findIndex((ref, i) => cols.parentId[i] === tableRef && cols.colId[i] === col.id);
        if (at !== -1) actions.push(['UpdateRecord', '_grist_Tables_column', cols.id[at], { description: col.description }]);
      });
      if (actions.length) await gristInstance.docApi.applyUserActions(actions);
    } catch (err) {
      console.warn(`Description des colonnes de ${tableId} non enregistrée :`, err.message);
    }
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
  // Types de colonnes ({tableId: {colId: 'Ref:Instances'…}}), lus avec les descriptions (mêmes métadonnées, aucun appel de plus).
  let columnTypeMap = null;
  // Schéma connu du document : {tableId: Set(colId)}, rempli par loadColumnDescriptions()
  // (mêmes métadonnées, une seule lecture) puis tenu à jour par ensureTable/ensureColumns.
  // Connaissance POSITIVE seulement : une table/colonne présente ici existe, l'absence ne
  // prouve rien (métadonnées illisibles, table créée par ailleurs) — on retombe alors sur
  // la vérification d'origine (listTables / fetchTable). Sert à ne plus relire des tables
  // entières ou refaire un aller-retour uniquement pour constater que tout existe déjà.
  const knownSchema = new Map();
  // Lectures partagées pendant le démarrage (voir openSharedWindow) : plusieurs pages
  // lisaient chacune la table Preferences_Widget en entier (9 lectures au total).
  const sharedFetches = new Map();
  let sharedWindowOpen = false;
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
    // `{ shared: true }` : tant que la fenêtre de démarrage est ouverte (openSharedWindow),
    // une seule lecture est faite puis partagée entre tous les appelants (lecture seule :
    // ne pas modifier les lignes renvoyées). Fenêtre fermée, c'est une lecture ordinaire.
    async getTable(name, options) {
      if (!gristInstance) throw new Error('CoreGrist not ready - call ready() first');
      if (options && options.shared && sharedWindowOpen) {
        let pending = sharedFetches.get(name);
        if (!pending) {
          pending = gristInstance.docApi.fetchTable(name).then(toRecords);
          sharedFetches.set(name, pending);
          // Un échec n'est pas mémorisé (ex. table pas encore créée) : l'appelant suivant relit.
          pending.catch(() => { if (sharedFetches.get(name) === pending) sharedFetches.delete(name); });
        }
        return pending;
      }
      const data = await gristInstance.docApi.fetchTable(name);
      return toRecords(data);
    },
    openSharedWindow() { sharedWindowOpen = true; },
    closeSharedWindow() { sharedWindowOpen = false; sharedFetches.clear(); },
    // À appeler après avoir écrit dans la table (ajout de ligne, de colonne) : la prochaine
    // lecture partagée doit la relire.
    invalidateTable(name) { sharedFetches.delete(name); },
    // Colonnes connues d'une table (Set) ou null si le schéma n'a pas pu être lu.
    knownColumns(tableId) { return knownSchema.get(tableId) || null; },
    // Identifiants des tables connues (vide si le schéma n'a pas pu être lu : l'appelant retombe sur docApi.listTables()).
    knownTableIds() { return Array.from(knownSchema.keys()); },
    async ensureTable(tableId, columns) {
      if (!gristInstance) throw new Error('CoreGrist not ready - call ready() first');
      if (knownSchema.has(tableId)) return false;
      const existing = await gristInstance.docApi.listTables();
      if (existing.includes(tableId)) return false;
      await gristInstance.docApi.applyUserActions([['AddTable', tableId, columns]]);
      knownSchema.set(tableId, new Set(['id', ...columns.map(col => col.id)]));
      sharedFetches.delete(tableId);
      return true;
    },
    // Ajoute les colonnes manquantes à une table déjà existante (ensureTable ne
    // crée la table QUE si elle est absente, et ignore les colonnes demandées
    // sinon — nécessaire pour qu'une table Grist partagée entre plusieurs pages,
    // comme Preferences_Widget, puisse grandir au fil des besoins de chacune).
    // Une colonne peut porter `description` : texte posé en métadonnée de la colonne
    // (il alimente les bulles d'aide, cf. HelpTooltip) — au mieux : un échec n'annule
    // jamais la création des colonnes.
    async ensureColumns(tableId, columns) {
      if (!gristInstance) throw new Error('CoreGrist not ready - call ready() first');
      const known = knownSchema.get(tableId);
      if (known && columns.every(col => known.has(col.id))) return false;
      const existing = await gristInstance.docApi.fetchTable(tableId);
      const existingIds = new Set(Object.keys(existing));
      const missing = columns.filter(col => !existingIds.has(col.id));
      if (!missing.length) { knownSchema.set(tableId, existingIds); return false; }
      await gristInstance.docApi.applyUserActions(missing.map(col => {
        const { id, description, ...colInfo } = col;
        return ['AddColumn', tableId, id, colInfo];
      }));
      missing.forEach(col => existingIds.add(col.id));
      knownSchema.set(tableId, existingIds);
      sharedFetches.delete(tableId);
      await describeColumns(tableId, missing);
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
        const typeMap = {};
        const schema = new Map();
        tableIdByRef.forEach(tableId => schema.set(tableId, new Set(['id'])));
        cols.id.forEach((ref, i) => {
          const tableId = tableIdByRef.get(cols.parentId[i]);
          if (tableId) {
            schema.get(tableId).add(cols.colId[i]);
            if (cols.type && cols.type[i]) (typeMap[tableId] = typeMap[tableId] || {})[cols.colId[i]] = String(cols.type[i]);
          }
          const description = cols.description ? cols.description[i] : '';
          if (!tableId || !description) return;
          if (!byTable[tableId]) byTable[tableId] = {};
          byTable[tableId][cols.colId[i]] = description;
        });
        columnDescriptions = byTable;
        columnTypeMap = typeMap;
        knownSchema.clear();
        schema.forEach((set, tableId) => knownSchema.set(tableId, set));
      } catch (err) {
        console.warn('Chargement des descriptions de colonnes a échoué :', err.message);
        columnDescriptions = {};
        columnTypeMap = null;
        knownSchema.clear();
      }
    },
    // '' quand le schéma n'a pas (encore) été chargé, que la table/colonne est
    // inconnue, ou que la colonne n'a aucune description dans Grist — jamais
    // d'exception : c'est ce qui décide d'afficher ou non l'icône d'aide.
    // Types des colonnes d'une table ({colId: 'Ref:Instances'…}) ou null quand les métadonnées n'ont pas pu être lues.
    columnTypes(tableId) { return (columnTypeMap && columnTypeMap[tableId]) || null; },
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
