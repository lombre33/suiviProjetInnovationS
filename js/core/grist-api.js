/**
 * Grist API Module
 * Loads the real Grist tables and normalizes them for the UI.
 */
(function (global) {
  'use strict';

  // 'Etablissement' (singulier) n'existe pas dans le document et rien ne le lit : le demander coûtait une requête en erreur à chaque lecture.
  const TABLE_NAMES = ['Projets', 'Annuaire', 'Postes2', 'Structures',
    'Programmes', 'Etablissements', 'Suivi_Instance', 'Lignes_OPE', 'Notifications'];

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
    return rows.map(project => {
      // Plusieurs OPE par projet (24/11/2026) : le budget 2026 additionne les OPE 1 à 4. Lu dans les colonnes de montants plutôt que dans Total_2026 :
      // cette formule Grist ne couvre que l'OPE 1 tant que le widget ne l'a pas adaptée (js/core/ope-totals.js), puis couvre déjà les OPE 2 à 4.
      const all = global.CoreOpes ? global.CoreOpes.yearAmount(project, 2026) : 0;
      const budget = all || project.Total_2026 || project.Montant_annuel_charge_attribue || 0;
      return {
        ...project,
        // Display aliases keep the existing renderer independent from Grist names.
        Nom: project.Projet || project.Acronyme || '',
        Statut: project.Statut_Macro || project.Statut_operationnel_projet || '',
        Progression: Number(project.Progression ?? 0),
        Propriétaire: people.get(project.Porteur_1) || '',
        Budget: budget
      };
    });
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

  // Colonne affichée (« SHOW COLUMN ») d'une colonne référence. Une colonne Ref / RefList créée par l'API n'en a AUCUNE : Grist y montre le numéro de
  // ligne (« 3 ») au lieu de la valeur (Antoine, 26/11/2026, sur Ligne_OPE_installe_chez_2). Le réglage d'une colonne = visibleCol (la colonne de la table
  // cible à montrer) + displayCol (colonne d'aide gristHelper_Display, créée par l'action SetDisplayFormula) — ce que fait l'interface de Grist.
  // RÈGLE : toute colonne référence créée par le widget porte `display: { like?, column? }` (`like` : colonne de la même table dont on recopie le réglage,
  // `column` : colonne de la table cible à montrer sinon) ; à défaut, la première colonne « texte » de la table cible, comme le fait Grist.
  const isRefType = type => /^Ref(List)?:/.test(String(type || ''));
  const refTarget = type => String(type).split(':')[1];
  const IDENTIFYING_TYPES = ['Text', 'Any', 'Numeric', 'Int', 'Date', 'DateTime', 'Choice'];
  // Mémoire de la session : « table.colonne » dont l'affichage est déjà réglé ou vérifié (aucune relecture des métadonnées ensuite).
  const displayChecked = new Set();
  function pickDisplayColumn(cols, targetRef) {
    const candidates = [];
    cols.id.forEach((ref, i) => {
      const colId = String(cols.colId[i] || '');
      if (cols.parentId[i] !== targetRef || /^(gristHelper_|manualSort$)/.test(colId)) return;
      if (IDENTIFYING_TYPES.includes(String(cols.type ? cols.type[i] : '').split(':')[0])) candidates.push({ ref, pos: cols.parentPos ? Number(cols.parentPos[i]) || 0 : i });
    });
    candidates.sort((a, b) => a.pos - b.pos);
    return candidates.length ? candidates[0].ref : 0;
  }
  // Règle l'affichage des colonnes référence de `specs` ([{id, type, display?}]) qui n'en ont pas encore (jamais celle d'une colonne déjà réglée,
  // à la main ou par un passage précédent). Rend les colId réglés ; lève si Grist refuse (droits de structure) : l'appelant décide d'en tenir compte.
  async function applyReferenceDisplay(tableId, specs) {
    const refs = specs.filter(spec => isRefType(spec.type));
    if (!refs.length) return [];
    const [tables, cols] = await Promise.all([gristInstance.docApi.fetchTable('_grist_Tables'), gristInstance.docApi.fetchTable('_grist_Tables_column')]);
    const tableRefOf = id => tables.id[tables.tableId.indexOf(id)];
    const colAt = (parent, colId) => cols.id.findIndex((ref, i) => cols.parentId[i] === parent && cols.colId[i] === colId);
    const tableRef = tableRefOf(tableId);
    const actions = [], done = [];
    refs.forEach(spec => {
      const at = colAt(tableRef, spec.id);
      if (at === -1) return;
      const already = cols.visibleCol && cols.displayCol && cols.visibleCol[at] && cols.displayCol[at];
      if (already) { displayChecked.add(`${tableId}.${spec.id}`); return; }
      const targetRef = tableRefOf(refTarget(spec.type));
      if (!targetRef) return;
      const display = spec.display || {};
      let visible = 0;
      if (display.like && cols.visibleCol) { const base = colAt(tableRef, display.like); if (base !== -1) visible = cols.visibleCol[base] || 0; }
      if (!visible && display.column) { const target = colAt(targetRef, display.column); if (target !== -1) visible = cols.id[target]; }
      if (!visible) visible = pickDisplayColumn(cols, targetRef);
      if (!visible) return;
      actions.push(['UpdateRecord', '_grist_Tables_column', cols.id[at], { visibleCol: visible }]);
      actions.push(['SetDisplayFormula', tableId, null, cols.id[at], `$${spec.id}.${cols.colId[cols.id.indexOf(visible)]}`]);
      done.push(spec.id);
    });
    if (actions.length) await gristInstance.docApi.applyUserActions(actions);
    refs.forEach(spec => { if (done.includes(spec.id)) displayChecked.add(`${tableId}.${spec.id}`); });
    return done;
  }
  // Au mieux, comme describeColumns : la colonne existe, seul son affichage resterait un numéro.
  async function displayNewColumns(tableId, columns) {
    try { await applyReferenceDisplay(tableId, columns); }
    catch (err) { console.warn(`Colonne affichée des colonnes référence de ${tableId} non réglée :`, err.message); }
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
  // Options d'affichage brutes (widgetOptions, JSON) des colonnes Choice / ChoiceList, lues avec les descriptions :
  // ensureChoices() sait ainsi sans aller-retour si la liste de choix d'une colonne est à jour.
  let choiceOptionsMap = null;
  // Colonnes calculées (formule non vide, hors colonne « vide » d'un Grist neuf dont isFormula est vrai sans formule) :
  // {tableId: {colId: true}}, lues avec les descriptions. Le widget lit ces colonnes mais ne les écrit jamais.
  let formulaMap = null;
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
  // Toute lecture de table passe par là : durée de chaque lecture notée pour le panneau « Diagnostic de chargement » (js/core/perf-trace.js).
  function fetchRaw(name) {
    const read = () => gristInstance.docApi.fetchTable(name);
    const promise = global.PerfTrace ? global.PerfTrace.track('lecture : ' + name, read, global.PerfTrace.cellsOfTable) : read();
    // Une lecture en échec (table absente, refusée) efface ce qu'on croyait savoir ; le diagnostic d'accès note ce que chaque table a rendu
    // (lignes, colonnes reçues) ou la raison de son échec, sans aucun appel de plus (js/core/access-diagnostic.js).
    return promise.then(data => { learnColumns(name, data); if (global.CoreAccess) global.CoreAccess.noteRead(name, data); return data; },
      err => { seenColumns.delete(name); if (global.CoreAccess) global.CoreAccess.noteReadFailure(name, err); throw err; });
  }
  // Une table lue existe et a ces colonnes : connaissance positive, tenue À PART du schéma (knownSchema, que knownColumns() expose tel quel :
  // « null » quand les métadonnées sont illisibles). Sert seulement à ensureTable / ensureColumns : aucune requête pour une table déjà lue,
  // sans attendre la lecture (plus lourde) des métadonnées _grist_Tables_column.
  const seenColumns = new Map();
  // Tables que le dernier chargement n'a pas pu lire (droits d'accès de l'utilisateur, table absente) : {nom → message}. Le widget les traite
  // comme vides ; readFailure() permet à un champ de dire « illisible » au lieu d'afficher un numéro de ligne qu'il ne sait pas résoudre.
  const readFailures = new Map();
  function learnColumns(name, data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || name.indexOf('_grist_') === 0) return;
    const seen = seenColumns.get(name) || new Set(['id']);
    Object.keys(data).forEach(col => seen.add(col));
    seenColumns.set(name, seen);
  }
  const columnsOf = tableId => knownSchema.get(tableId) || seenColumns.get(tableId);
  const CoreGrist = {
    get gristInstance() { return gristInstance; },
    ready(timeoutMs = 10000) {
      if (readyPromise) return readyPromise;
      readyPromise = (async () => {
        const maxWait = Date.now() + timeoutMs;
        while (!window.grist && Date.now() < maxWait) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (!window.grist) throw new Error(`Grist API non disponible après ${timeoutMs} ms : le widget n'est pas ouvert dans Grist (ou le script grist-plugin-api.js est bloqué par le réseau ou le navigateur)`);
        await (global.PerfTrace ? global.PerfTrace.track('grist.ready (accès au document)', () => window.grist.ready({ requiredAccess: 'full' })) : window.grist.ready({ requiredAccess: 'full' }));
        gristInstance = window.grist;
        // Chaque lecture / écriture ratée est enregistrée avec son contexte (table, ligne, colonnes) pour expliquer le refus en clair.
        if (global.CoreAccess) global.CoreAccess.instrument(gristInstance.docApi);
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
          pending = fetchRaw(name).then(toRecords);
          sharedFetches.set(name, pending);
          // Un échec n'est pas mémorisé (ex. table pas encore créée) : l'appelant suivant relit.
          pending.catch(() => { if (sharedFetches.get(name) === pending) sharedFetches.delete(name); });
        }
        return pending;
      }
      const data = await fetchRaw(name);
      return toRecords(data);
    },
    // Message d'erreur de la dernière lecture ratée de cette table ('' si elle a été lue).
    readFailure(name) { return readFailures.get(name) || ''; },
    // Tables lues au démarrage (le « Tester les accès » du diagnostic les relit).
    tableNames() { return TABLE_NAMES.slice(); },
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
      if (columnsOf(tableId)) return false;
      const existing = await gristInstance.docApi.listTables();
      if (existing.includes(tableId)) return false;
      await gristInstance.docApi.applyUserActions([['AddTable', tableId, columns.map(({ display, ...col }) => col)]]);
      knownSchema.set(tableId, new Set(['id', ...columns.map(col => col.id)]));
      seenColumns.delete(tableId);
      sharedFetches.delete(tableId);
      await displayNewColumns(tableId, columns);
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
      const known = columnsOf(tableId);
      if (known && columns.every(col => known.has(col.id))) return false;
      const existing = await gristInstance.docApi.fetchTable(tableId);
      const existingIds = new Set(Object.keys(existing));
      const missing = columns.filter(col => !existingIds.has(col.id));
      if (!missing.length) { knownSchema.set(tableId, existingIds); seenColumns.delete(tableId); return false; }
      await gristInstance.docApi.applyUserActions(missing.map(col => {
        const { id, description, display, ...colInfo } = col;
        return ['AddColumn', tableId, id, colInfo];
      }));
      missing.forEach(col => existingIds.add(col.id));
      knownSchema.set(tableId, existingIds);
      seenColumns.delete(tableId);
      sharedFetches.delete(tableId);
      await describeColumns(tableId, missing);
      await displayNewColumns(tableId, missing);
      return true;
    },
    // Règle l'affichage des colonnes référence DÉJÀ créées qui n'en ont pas (créées avant la règle, ou à la main sans « colonne affichée »). Une fois par
    // session et par colonne ; rend les colId réglés ; lève si Grist refuse (l'appelant fait au mieux).
    async ensureReferenceDisplay(tableId, specs) {
      if (!gristInstance) throw new Error('CoreGrist not ready - call ready() first');
      const known = columnsOf(tableId);
      const pending = specs.filter(spec => isRefType(spec.type) && !displayChecked.has(`${tableId}.${spec.id}`) && (!known || known.has(spec.id)));
      if (!pending.length) return [];
      return applyReferenceDisplay(tableId, pending);
    },
    // À appeler une fois au démarrage (js/app.js) : peuple le cache lu par
    // getColumnDescription(). Ne renvoie rien et n'écrit jamais rien dans Grist ;
    // une erreur (droits, document non-Grist dans les tests) laisse juste le cache
    // vide, chaque bulle d'aide reste alors absente plutôt que de bloquer l'appli.
    async loadColumnDescriptions() {
      if (!gristInstance) throw new Error('CoreGrist not ready - call ready() first');
      try {
        const [tables, cols] = await Promise.all([fetchRaw('_grist_Tables'), fetchRaw('_grist_Tables_column')]);
        const tableIdByRef = new Map();
        tables.id.forEach((ref, i) => tableIdByRef.set(ref, tables.tableId[i]));
        const byTable = {};
        const typeMap = {};
        const choiceMap = {};
        const formulas = {};
        const schema = new Map();
        tableIdByRef.forEach(tableId => schema.set(tableId, new Set(['id'])));
        cols.id.forEach((ref, i) => {
          const tableId = tableIdByRef.get(cols.parentId[i]);
          if (tableId) {
            schema.get(tableId).add(cols.colId[i]);
            if (cols.type && cols.type[i]) (typeMap[tableId] = typeMap[tableId] || {})[cols.colId[i]] = String(cols.type[i]);
            if (cols.widgetOptions && /^Choice/.test(String(cols.type && cols.type[i]))) (choiceMap[tableId] = choiceMap[tableId] || {})[cols.colId[i]] = String(cols.widgetOptions[i] || '');
            if (cols.isFormula && cols.isFormula[i] && cols.formula && String(cols.formula[i] || '').trim()) (formulas[tableId] = formulas[tableId] || {})[cols.colId[i]] = true;
          }
          const description = cols.description ? cols.description[i] : '';
          if (!tableId || !description) return;
          if (!byTable[tableId]) byTable[tableId] = {};
          byTable[tableId][cols.colId[i]] = description;
        });
        columnDescriptions = byTable;
        columnTypeMap = typeMap;
        choiceOptionsMap = choiceMap;
        formulaMap = formulas;
        knownSchema.clear(); seenColumns.clear(); // le schéma lu fait foi
        displayChecked.clear();
        schema.forEach((set, tableId) => knownSchema.set(tableId, set));
      } catch (err) {
        console.warn('Chargement des descriptions de colonnes a échoué :', err.message);
        columnDescriptions = {};
        columnTypeMap = null;
        choiceOptionsMap = null;
        formulaMap = null;
        knownSchema.clear(); seenColumns.clear(); // schéma illisible : retour aux vérifications d'origine
      }
    },
    // Met la liste de choix d'une colonne Choice existante à jour (libellé d'étape renommé) : remplace `choices`
    // dans ses options d'affichage et garde le reste (couleurs…). Aucun appel quand la liste est déjà la bonne ou
    // que la colonne n'est pas connue du schéma lu au démarrage (illisible, ou créée depuis avec les bons choix).
    // Au mieux, comme la description des colonnes : un échec (droits) laisse la liste telle quelle.
    async ensureChoices(tableId, colId, choices) {
      if (!gristInstance) throw new Error('CoreGrist not ready - call ready() first');
      const raw = choiceOptionsMap && choiceOptionsMap[tableId] ? choiceOptionsMap[tableId][colId] : undefined;
      if (raw === undefined) return false;
      let options = {};
      try { options = raw ? JSON.parse(raw) : {}; } catch (err) { options = {}; }
      const current = Array.isArray(options.choices) ? options.choices : [];
      if (current.length === choices.length && current.every((choice, i) => choice === choices[i])) return false;
      try {
        const [tables, cols] = await Promise.all([
          gristInstance.docApi.fetchTable('_grist_Tables'),
          gristInstance.docApi.fetchTable('_grist_Tables_column')
        ]);
        const tableRef = tables.id[tables.tableId.indexOf(tableId)];
        const at = cols.id.findIndex((ref, i) => cols.parentId[i] === tableRef && cols.colId[i] === colId);
        if (at === -1) return false;
        const next = JSON.stringify({ ...options, choices: choices.slice() });
        await gristInstance.docApi.applyUserActions([['UpdateRecord', '_grist_Tables_column', cols.id[at], { widgetOptions: next }]]);
        choiceOptionsMap[tableId][colId] = next;
        return true;
      } catch (err) {
        console.warn(`Liste de choix de ${tableId}.${colId} non mise à jour :`, err.message);
        return false;
      }
    },
    // '' quand le schéma n'a pas (encore) été chargé, que la table/colonne est
    // inconnue, ou que la colonne n'a aucune description dans Grist — jamais
    // d'exception : c'est ce qui décide d'afficher ou non l'icône d'aide.
    // Types des colonnes d'une table ({colId: 'Ref:Instances'…}) ou null quand les métadonnées n'ont pas pu être lues.
    columnTypes(tableId) { return (columnTypeMap && columnTypeMap[tableId]) || null; },
    // true seulement quand la colonne est connue comme calculée (formule) ; false quand elle ne l'est pas ou que les métadonnées n'ont pas pu être lues.
    isFormulaColumn(tableId, colId) { return !!(formulaMap && formulaMap[tableId] && formulaMap[tableId][colId]); },
    // Choix proposés par une colonne Choice (liste vide quand elle est inconnue, illisible ou sans choix).
    columnChoices(tableId, colId) {
      const raw = choiceOptionsMap && choiceOptionsMap[tableId] ? choiceOptionsMap[tableId][colId] : '';
      try { const choices = raw ? JSON.parse(raw).choices : []; return Array.isArray(choices) ? choices.map(String) : []; } catch (err) { return []; }
    },
    getColumnDescription(tableId, colId) {
      return (columnDescriptions && columnDescriptions[tableId] && columnDescriptions[tableId][colId]) || '';
    },
    // Lit toutes les tables du widget en parallèle (une seule vague de requêtes) mais rend la main en deux temps :
    //  - `critical` : seulement les tables demandées (par défaut aucune), dès qu'elles sont lues ;
    //  - `all` : toutes, quand les autres le sont aussi.
    // `Projets` est complétée (alias d'affichage) une seule fois, avec `Annuaire` : lister les deux ensemble dans `critical`.
    loadAllTablesStaged(criticalNames) {
      const reads = {};
      readFailures.clear();
      TABLE_NAMES.forEach(name => {
        reads[name] = this.getTable(name).catch(err => { console.warn(`Table ${name} failed:`, err.message); readFailures.set(name, (err && err.message) || 'lecture refusée'); return []; });
      });
      const settle = async names => {
        const rows = await Promise.all(names.map(name => reads[name]));
        return Object.fromEntries(names.map((name, i) => [name, rows[i]]));
      };
      let projects = null;
      const complete = tables => {
        if (!tables.Projets) return tables;
        if (!projects) projects = mapProjects(tables.Projets, tables.Annuaire || []);
        return Object.assign({}, tables, { Projets: projects });
      };
      const first = (criticalNames || []).filter(name => TABLE_NAMES.includes(name));
      const critical = settle(first).then(complete);
      const all = Promise.all([critical, settle(TABLE_NAMES.filter(name => !first.includes(name)))]).then(([a, b]) => complete(Object.assign({}, a, b)));
      return { critical, all };
    },
    async loadAllTables() {
      return this.loadAllTablesStaged([]).all;
    }
  };
  global.CoreGrist = CoreGrist;
})(window);
