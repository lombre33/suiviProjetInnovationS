/**
 * Mesure des colonnes d'une table (Projets) — demande d'Antoine du 24/11/2026 : « rationaliser toutes les colonnes de la table Projets,
 * celles qui ne servent plus du tout à lister ».
 *
 * Ce que le code seul ne peut pas savoir, le widget le lit dans le vrai document :
 *  - REMPLISSAGE : combien de projets ont une valeur dans la colonne ;
 *  - FORMULES : quelles colonnes du document (toutes tables, règles de couleur comprises) citent son nom ; une colonne citée par un
 *    « miroir » (Notifications…) n'est utile que si ce miroir l'est : on note si le miroir est lui-même utilisé (modèle, vue, autre formule) ;
 *  - MODÈLES PUBLIPOSTAGE+ : quels modèles écrivent son nom (le widget lit leurs textes, il n'en garde rien) ;
 *  - VUES GRIST : dans combien de pages Grist elle s'affiche (données brutes exclues) ;
 *  - RÈGLES D'ACCÈS : règles qui visent la colonne ou la citent ;
 *  - AFFICHAGE : colonne « à afficher » d'une référence, regroupement d'une table de synthèse.
 *
 * LECTURE SEULE : aucune écriture dans Grist, rien n'est supprimé. Aucune valeur de projet n'est gardée ni affichée : seulement des nombres
 * et des noms de colonnes, de tables, de vues et de modèles. Chargé à la demande par le panneau Alt+Maj+D (onglet « Colonnes »).
 *
 * `analyse(input)` est pure (testée sans Grist) ; `measure()` lit le document ; `reportLines()` met le résultat en forme.
 */
(function (global) {
  'use strict';

  const TEMPLATE_TABLES = ['Publipostage_Templates', 'Publipostage_Modeles'];
  const NAME_COLUMNS = ['Name', 'Nom', 'Title', 'Titre'];
  const escapeRegExp = text => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordRegExp = name => new RegExp('(?<![A-Za-z0-9_])' + escapeRegExp(name) + '(?![A-Za-z0-9_])');
  const count = list => (list ? list.length : 0);
  const unique = list => Array.from(new Set(list));
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  const isTechnical = colId => colId === 'manualSort' || colId.indexOf('gristHelper_') === 0;

  // Une cellule « vide » : rien saisi (0, faux, liste vide comptent comme vides, comme dans une vue Grist filtrée sur « vide »).
  function isEmptyValue(value) {
    if (value == null || value === '' || value === false || value === 0) return true;
    if (Array.isArray(value)) return value.length === 0 || (value.length === 1 && value[0] === 'L');
    return false;
  }

  // Table de métadonnées lue par fetchTable (colonnes → tableaux) en liste de lignes ; null/illisible → [].
  function rowsOf(table) {
    if (!table || !Array.isArray(table.id)) return [];
    const keys = Object.keys(table).filter(key => key !== 'id');
    return table.id.map((id, index) => { const row = { id }; keys.forEach(key => { row[key] = table[key] && table[key][index]; }); return row; });
  }

  /**
   * input : { tableId, data, meta: {tables, columns, views, sections, fields, aclResources, aclRules} (chacune au format fetchTable, ou null
   * quand illisible), templates: [{name, text}] | null }
   */
  function analyse(input) {
    const tableId = input.tableId || 'Projets';
    const meta = input.meta || {};
    const unavailable = { columns: !meta.columns, views: !meta.fields || !meta.sections, acl: !meta.aclRules || !meta.aclResources, templates: !input.templates };
    const tables = rowsOf(meta.tables), cols = rowsOf(meta.columns);
    const tableById = new Map(tables.map(t => [t.id, t]));
    const colById = new Map(cols.map(c => [c.id, c]));
    const target = tables.find(t => t.tableId === tableId);
    const data = input.data || { id: [] };
    const total = Array.isArray(data.id) ? data.id.length : 0;
    const tableName = col => { const t = tableById.get(col.parentId); return t ? t.tableId : '?'; };

    // --- colonnes de la table visée
    const own = cols.filter(c => target && c.parentId === target.id && !isTechnical(c.colId)).sort((a, b) => (a.parentPos || 0) - (b.parentPos || 0));

    // --- colonnes qui portent une formule (toutes tables), avec le libellé à afficher
    const labelOf = col => {
      const table = tableName(col);
      if (col.colId.indexOf('gristHelper_Display') === 0) {
        const reference = cols.find(c => c.displayCol === col.id);
        return reference ? { label: `${tableName(reference)}.${reference.colId}`, kind: 'display', of: reference } : null;
      }
      if (col.colId.indexOf('gristHelper_ConditionalRule') === 0) return { label: `${table} (règle de couleur)`, kind: 'rule', of: col };
      if (col.colId.indexOf('gristHelper_') === 0 || col.colId === 'manualSort') return null;
      return { label: `${table}.${col.colId}`, kind: 'formula', of: col };
    };
    const formulaCols = cols.filter(c => String(c.formula || '').trim());

    // --- vues Grist : sections hors données brutes / fiches
    const views = new Map(rowsOf(meta.views).map(v => [v.id, v.name]));
    const rawSections = new Set();
    tables.forEach(t => { if (t.rawViewSectionRef) rawSections.add(t.rawViewSectionRef); if (t.recordCardViewSectionRef) rawSections.add(t.recordCardViewSectionRef); });
    const sectionById = new Map(rowsOf(meta.sections).map(s => [s.id, s]));
    const fieldsByCol = new Map();
    rowsOf(meta.fields).forEach(field => {
      const section = sectionById.get(field.parentId);
      if (!section || rawSections.has(section.id)) return;
      if (!fieldsByCol.has(field.colRef)) fieldsByCol.set(field.colRef, new Set());
      fieldsByCol.get(field.colRef).add(section.id);
    });
    const viewsOf = col => {
      const sections = Array.from(fieldsByCol.get(col.id) || []);
      const names = unique(sections.map(id => views.get(sectionById.get(id).parentId)).filter(Boolean));
      return { sections: sections.length, names };
    };

    // --- règles d'accès
    const aclResource = new Map(rowsOf(meta.aclResources).map(r => [r.id, r]));
    const aclRules = rowsOf(meta.aclRules);
    const rulesOf = col => {
      const rx = wordRegExp(col.colId);
      const hits = [];
      aclRules.forEach(rule => {
        const resource = aclResource.get(rule.resource);
        const onColumn = resource && resource.tableId === tableId && resource.colIds && resource.colIds !== '*' && String(resource.colIds).split(',').map(s => s.trim()).indexOf(col.colId) !== -1;
        const inFormula = rule.aclFormula && rx.test(String(rule.aclFormula));
        if (onColumn || inFormula) hits.push(onColumn ? 'sur la colonne' : 'dans une condition');
      });
      return hits;
    };

    // --- modèles Publipostage+ : noms des modèles dont le texte cite un nom
    const templates = input.templates || [];
    const templatesCiting = name => { const rx = wordRegExp(name); return unique(templates.filter(t => rx.test(t.text)).map(t => t.name)); };

    // Une colonne citante est « utilisée » si un modèle, une vue ou une autre formule la reprend (un seul saut : suffisant pour les miroirs).
    const formulaTextCache = formulaCols.map(c => ({ col: c, text: String(c.formula) }));
    const citersOf = (col, selfCol) => {
      const rx = wordRegExp(col.colId);
      const out = [];
      formulaTextCache.forEach(({ col: citer, text }) => {
        if (selfCol && citer.id === selfCol.id) return;
        if (!rx.test(text)) return;
        const info = labelOf(citer);
        if (info) out.push({ col: citer, info });
      });
      // Colonne « à afficher » d'une référence (visibleCol), regroupement d'une table de synthèse (summarySourceCol)
      cols.forEach(c => {
        if (c.visibleCol === col.id) out.push({ col: c, info: { label: `${tableName(c)}.${c.colId}`, kind: 'visible' } });
        if (c.summarySourceCol === col.id) out.push({ col: c, info: { label: `${tableName(c)}.${c.colId}`, kind: 'summary' } });
      });
      return out;
    };
    const usedCache = new Map();
    const isUsed = col => {
      if (usedCache.has(col.id)) return usedCache.get(col.id);
      usedCache.set(col.id, false); // coupe les boucles
      const used = templatesCiting(col.colId).length > 0 || viewsOf(col).sections > 0 || citersOf(col, col).length > 0;
      usedCache.set(col.id, used);
      return used;
    };

    const columns = own.map(col => {
      const values = data[col.colId];
      const filled = Array.isArray(values) ? values.filter(v => !isEmptyValue(v)).length : null;
      const citers = citersOf(col, col);
      const formulas = citers.filter(c => c.info.kind === 'formula' || c.info.kind === 'rule');
      const display = citers.filter(c => c.info.kind === 'display' || c.info.kind === 'visible' || c.info.kind === 'summary');
      const usedFormulas = formulas.filter(c => c.info.kind === 'rule' || isUsed(c.col));
      const v = viewsOf(col);
      const kind = col.isFormula ? (String(col.formula || '').trim() ? 'formule' : 'vide') : (String(col.formula || '').trim() ? 'déclencheur' : 'donnée');
      return {
        colId: col.colId, type: col.type || '', kind, filled, total,
        formulas: unique(formulas.map(c => c.info.label)), usedFormulas: unique(usedFormulas.map(c => c.info.label)),
        display: unique(display.map(c => c.info.label)),
        templates: templatesCiting(col.colId), views: v.sections, viewNames: v.names,
        rules: rulesOf(col).length,
        described: !!String(col.description || '').trim()
      };
    });
    return { tableId, total, columns, unavailable, at: input.at || null };
  }

  // « Rien ne sert » : ni remplie, ni lue par une formule utilisée, un modèle, une vue, une règle d'accès, un affichage de référence.
  function isOrphan(c) { return !c.templates.length && !c.views && !c.rules && !c.display.length && !c.usedFormulas.length; }

  function reportLines(result) {
    if (!result) return ['Colonnes : rien de mesuré. Clique sur « Mesurer les colonnes de Projets » (lecture seule, quelques lectures Grist).'];
    const out = [];
    const cols = result.columns;
    const when = result.at ? new Date(result.at).toLocaleString('fr-FR') : '';
    out.push(`Colonnes de ${result.tableId} — mesure${when ? ' du ' + when : ''} (lecture seule : rien n'a été modifié)`);
    out.push(`${plural(result.total, 'ligne', 'lignes')} lues, ${plural(cols.length, 'colonne', 'colonnes')} (colonnes techniques exclues).`);
    const missing = [];
    if (result.unavailable.columns) missing.push('métadonnées des colonnes illisibles : formules, vues et affichages non vérifiés');
    if (result.unavailable.views) missing.push('vues Grist illisibles');
    if (result.unavailable.acl) missing.push('règles d\'accès illisibles (réservées aux propriétaires du document)');
    if (result.unavailable.templates) missing.push('modèles Publipostage+ introuvables ou illisibles');
    missing.forEach(text => out.push('  ⚠ ' + text));
    out.push('');
    out.push('Légende : remplie = lignes avec une valeur (0, faux et listes vides comptent pour vides) ; F = colonnes qui la citent dans une formule (entre parenthèses : celles que');
    out.push('un modèle, une vue ou une autre formule reprend) ; M = modèles Publipostage+ qui écrivent son nom ; V = vues Grist qui l\'affichent ; R = règles d\'accès ; A = affichage de référence.');
    out.push('');
    const line = c => {
      const fill = c.filled == null ? '?' : `${c.filled}/${c.total}`;
      const detail = [];
      if (c.formulas.length) detail.push(`F ${c.formulas.length} (${c.usedFormulas.length})`);
      if (c.templates.length) detail.push(`M ${c.templates.length}`);
      if (c.views) detail.push(`V ${c.views}`);
      if (c.rules) detail.push(`R ${c.rules}`);
      if (c.display.length) detail.push(`A ${c.display.length}`);
      return `${c.colId} | ${c.kind} | ${c.type} | remplie ${fill} | ${detail.join(' ') || 'rien ne la cite'}`;
    };
    const group = (title, list, extra) => {
      out.push(`${title} — ${list.length}`);
      if (!list.length) out.push('  aucune');
      list.forEach(c => { out.push('  ' + line(c)); if (extra) extra(c).forEach(text => out.push('      ' + text)); });
      out.push('');
    };
    const neverFilled = c => c.filled === 0 && c.kind !== 'formule';
    group('A. Jamais remplie et que rien ne cite', cols.filter(c => neverFilled(c) && isOrphan(c)));
    group('B. Remplie mais que rien ne cite (les données seraient perdues : à archiver d\'abord)', cols.filter(c => c.filled > 0 && c.kind !== 'formule' && isOrphan(c)));
    group('C. Formules que rien ne reprend', cols.filter(c => c.kind === 'formule' && isOrphan(c)));
    group('D. Jamais remplie mais citée (à lire avant de décider)', cols.filter(c => neverFilled(c) && !isOrphan(c)), c => {
      const lines = [];
      if (c.formulas.length) lines.push('formules : ' + c.formulas.slice(0, 4).join(', ') + (c.formulas.length > 4 ? ' …' : ''));
      if (c.templates.length) lines.push('modèles : ' + c.templates.slice(0, 3).join(', ') + (c.templates.length > 3 ? ' …' : ''));
      if (c.viewNames.length) lines.push('vues : ' + c.viewNames.slice(0, 3).join(', '));
      return lines;
    });
    out.push('Toutes les colonnes (ordre du document)');
    cols.forEach(c => out.push('  ' + line(c)));
    return out;
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Lecture du document
  // ------------------------------------------------------------------------------------------------------------------

  async function readRaw(docApi, name) { try { return await docApi.fetchTable(name); } catch (err) { return null; } }

  // Les modèles Publipostage+ : un texte par ligne (toutes les cellules texte réunies), jamais conservé après la mesure.
  async function readTemplates(docApi) {
    let found = false;
    const templates = [];
    for (const table of TEMPLATE_TABLES) {
      const data = await readRaw(docApi, table);
      if (!data || !Array.isArray(data.id)) continue;
      found = true;
      const keys = Object.keys(data).filter(key => key !== 'id');
      data.id.forEach((id, index) => {
        const nameKey = NAME_COLUMNS.find(key => keys.indexOf(key) !== -1 && data[key][index]);
        const text = keys.map(key => data[key][index]).filter(value => typeof value === 'string').join('\n');
        templates.push({ name: nameKey ? String(data[nameKey][index]) : `${table} #${id}`, text });
      });
    }
    return found ? templates : null;
  }

  let last = null;

  async function measure(tableId) {
    const grist = global.CoreGrist;
    if (!grist) throw new Error('CoreGrist indisponible');
    await grist.ready();
    const docApi = grist.gristInstance.docApi;
    const id = tableId || 'Projets';
    const names = ['_grist_Tables', '_grist_Tables_column', '_grist_Views', '_grist_Views_section', '_grist_Views_section_field', '_grist_ACLResources', '_grist_ACLRules'];
    const [data, ...metas] = await Promise.all([docApi.fetchTable(id), ...names.map(name => readRaw(docApi, name))]);
    const meta = {}; ['tables', 'columns', 'views', 'sections', 'fields', 'aclResources', 'aclRules'].forEach((key, index) => { meta[key] = metas[index]; });
    const templates = await readTemplates(docApi);
    last = analyse({ tableId: id, data, meta, templates, at: Date.now() });
    return last;
  }

  global.ColumnAudit = {
    analyse, measure, isEmptyValue, isOrphan,
    last: () => last,
    reportLines: result => reportLines(result === undefined ? last : result),
    _reset() { last = null; }
  };
})(window);
