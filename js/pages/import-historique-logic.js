/**
 * Import de l'historique financier — règles (pures : aucun accès au DOM, ni à Grist sauf par l'objet `io` passé à execute/undo).
 * Testées dans tests/suite-import-historique.js. Planche validée par Antoine le 18/11/2026 ; tableau de contrôle (une ligne par projet,
 * cellules colorées, clic sur une valeur pour la changer) validé sur la maquette v6 le 18/11/2026.
 *
 * Ce que fait l'outil (one-shot) : relier les lignes du journal `Import_Financements` (export financier, une ligne par N° OPE +
 * financeur + ligne budgétaire) aux projets et aux lignes OPE de Grist, en créant ce qui manque. Il n'écrit AUCUN montant : les
 * montants (attribué par année, consommé AE/CP) arrivent par l'import régulier. Il écrit seulement :
 *  - Lignes_OPE : N_OPE et installe_chez (création), installe_chez (complétée si vide, ou remplacée si l'utilisateur prend la valeur de l'export) ;
 *  - Projets : Ligne_OPE (on ajoute, on ne retire jamais), et à la création Projet, Acronyme, Programme, dates, statut, commentaire ;
 *    sur un projet existant, une valeur de Grist déjà remplie est gardée (« écart ») sauf si l'utilisateur prend celle de l'export, cellule par cellule ;
 *  - Import_Journal : chaque écriture (avant / après), ce qui rend un lot annulable.
 *
 * Retrouver le projet, dans cet ordre, au premier succès : 1) un N° OPE déjà dans une ligne OPE rattachée à un projet ;
 * 2) un N° décision déjà cité par un projet ; 3) le nom (égal sans accents ni majuscules, ou très proche) : « à confirmer » ;
 * 4) rien : nouveau projet.
 */
(function (global) {
  'use strict';

  const SOURCE_TABLE = 'Import_Financements';
  const DETAIL_TABLE = 'Depenses_OPE';
  const JOURNAL_TABLE = 'Import_Journal';
  const JOURNAL_COLUMNS = [
    { id: 'Lot', type: 'Text' }, { id: 'Horodatage', type: 'Text' }, { id: 'Table_modifiee', type: 'Text' }, { id: 'Ligne', type: 'Int' },
    { id: 'Operation', type: 'Text' }, { id: 'Apres', type: 'Text' }, { id: 'Avant', type: 'Text' }, { id: 'Annule', type: 'Bool' }
  ];
  // Lots d'import (contrat avec les imports réguliers : /mnt/project-files/imports/import-lots-contrat.md) : un envoi = un lot, repéré par la
  // colonne Lot de Import_Financements. Les deux fils créent la table avec ces mêmes colonnes (ensureTable/ensureColumns, idempotent).
  const LOTS_TABLE = 'Import_Lots';
  const LOT_TYPE_ONESHOT = 'Reprise unique';
  const choiceCol = (id, choices) => ({ id, type: 'Choice', widgetOptions: JSON.stringify({ choices }) });
  const LOTS_COLUMNS = [
    { id: 'Lot', type: 'Text' }, choiceCol('Type', [LOT_TYPE_ONESHOT, 'Macro', 'Détail']), choiceCol('Source', ['Script', 'Fichier']),
    { id: 'Fichier', type: 'Text' }, { id: 'Donnees_au', type: 'Date' }, { id: 'Recu_le', type: 'DateTime:Europe/Paris' }, { id: 'Lignes', type: 'Int' },
    choiceCol('Statut', ['A valider', 'Valide', 'Refuse', 'Annule', 'Remplace']), { id: 'Compare_a', type: 'Text' },
    { id: 'Ajoutees', type: 'Int' }, { id: 'Modifiees', type: 'Int' }, { id: 'Absentes', type: 'Int' }, { id: 'Anomalies', type: 'Int' }, { id: 'Inchangees', type: 'Int' },
    { id: 'Valide_par', type: 'Text' }, { id: 'Valide_le', type: 'DateTime:Europe/Paris' }, { id: 'Lot_journal', type: 'Text' }, { id: 'Note', type: 'Text' }
  ];
  const YEAR_COLUMNS = ['Attribue_2022', 'Attribue_2023', 'Attribue_2024', 'Attribue_2025', 'Attribue_2026'];
  const STATUS_CLOSED = 'Suposé cloturé sans information sur ...'; // orthographe réelle du Choice dans Grist
  const STATUS_RUNNING = 'en cours';
  const CREATED_NOTE = 'Créé par l\'import de l\'historique financier (18/11/2026) : à compléter (porteur, instance…).';
  const MIN_SIMILARITY = 0.6;       // en dessous, le nom ne propose rien
  const MIN_CANDIDATE = 0.5;        // en dessous, un projet n'est même pas listé comme piste
  const MIN_LABEL_SIMILARITY = 0.75; // programmes et structures : une suggestion préremplie, à relire

  // Plusieurs OPE par projet (24/11/2026) : un projet porte jusqu'à quatre « rangs », chacun une liste de lignes OPE (Projets.Ligne_OPE, puis
  // Ligne_OPE_2, _3, _4, créées par le widget). L'import les lit tous pour retrouver un projet par son N° OPE, et range chaque N° OPE du projet
  // de l'export dans un rang. Ordre de rangement (réglable) : `innovations` = les OPE financées par InnovationS d'abord, puis par date de début ;
  // `date` = par date de début seulement ; `single` = tout dans l'OPE 1 (comportement d'avant les OPE multiples).
  const RANK_MODES = ['innovations', 'date', 'single'];
  const DEFAULT_RANK_MODE = 'innovations';
  const SLOT_MAX = () => (global.CoreOpes ? global.CoreOpes.MAX : 4);
  const slotColumn = rank => (global.CoreOpes ? global.CoreOpes.ligneColumn(rank) : (rank > 1 ? 'Ligne_OPE_' + rank : 'Ligne_OPE'));
  const slotRanks = () => Array.from({ length: SLOT_MAX() }, (_, i) => i + 1);

  // ---------------------------------------------------------------------------------------------------------------
  // Ce que l'outil crée lui-même dans Grist (dès l'ouverture de la page ; jamais ce qui existe déjà : ensureTable / ensureColumns
  // n'ajoutent que ce qui manque). Il ne crée AUCUNE formule de montant sur Lignes_OPE ni ne convertit totalCPConsomme : ces formules
  // relèvent de l'import régulier (fil « export financier → formulaire »), qui complète la même table Import_Financements.
  // ---------------------------------------------------------------------------------------------------------------

  const SOURCE_FIELDS = [
    ['Programme', 'Programme', 'Text'], ['Projet', 'Projet', 'Text'], ['Financeur', 'Financeur', 'Text'], ['Financeurs_du_projet', 'Financeurs du projet', 'Text'],
    ['N_OPE', 'N° OPE', 'Text'], ['Libelle_operation', 'Libellé opération', 'Text'], ['Ligne_budgetaire', 'Ligne budgétaire', 'Text'],
    ['Date_debut', 'Date début', 'Date'], ['Date_fin', 'Date fin', 'Date'], ['Montant_attribue', 'Montant attribué', 'Numeric'], ['Part_du_projet', 'Part du projet', 'Numeric'],
    ['Attribue_2022', 'Attribué 2022', 'Numeric'], ['Attribue_2023', 'Attribué 2023', 'Numeric'], ['Attribue_2024', 'Attribué 2024', 'Numeric'],
    ['Attribue_2025', 'Attribué 2025', 'Numeric'], ['Attribue_2026', 'Attribué 2026', 'Numeric'],
    ['Consomme_AE', 'Consommé AE', 'Numeric'], ['Consomme_CP', 'Consommé CP', 'Numeric'], ['Disponible_AE', 'Disponible AE', 'Numeric'], ['Disponible_CP', 'Disponible CP', 'Numeric'],
    ['Statuts', 'Statuts', 'Text'], ['N_decision', 'N° décision', 'Text'], ['Structure', 'Structure', 'Text'], ['Etablissement', 'Établissement', 'Text']
  ];
  // Journal d'import : les 24 colonnes de l'export, plus Cle_ligne et Exporte_le (colonnes de données : le script d'envoi ne les pousse pas,
  // l'import régulier leur ajoute une formule appliquée aux nouveaux enregistrements ; ici elles restent vides, l'outil lit la dernière
  // version de chaque ligne lui-même, par plus grand id).
  const SOURCE_COLUMNS = SOURCE_FIELDS.map(([id, label, type]) => ({ id, label, type }))
    .concat([{ id: 'Cle_ligne', type: 'Text' }, { id: 'Exporte_le', type: 'DateTime:Europe/Paris' }, { id: 'Lot', type: 'Text' },
      // Nombre de lignes de l'envoi du script (champ « Lignes du lot » du formulaire) : permet de repérer un envoi arrivé à moitié.
      { id: 'Lignes_du_lot', label: 'Lignes du lot', type: 'Int' },
      // Retrait d'une ligne reçue de la file d'attente (horodatage ; vide = dans la file) : le script ne la pousse pas, le widget la pose.
      { id: 'Retire_de_la_file', label: 'Retiré de la file', type: 'Text' }]);

  // ---------------------------------------------------------------------------------------------------------------
  // Montants UB Invest écrits sur Lignes_OPE (24/11/2026) : une ligne OPE = un N° OPE ; le widget crée les colonnes SIMPLES manquantes (aucune formule)
  // et les remplit à la validation d'un envoi, avec le journal (annulable). Le Consommé CP va dans `totalCPConsomme`, colonne déjà là (Numeric,
  // sans formule) : Antoine (24/11) : « total CP consommé ne peut venir que de l'import UB Invest ». Rien d'autre n'est créé : ni Financeur, ni
  // Ligne budgétaire (CRB / SO / sous-SO : clé commune avec le BO, à contrôler avec l'import BO), ni dates d'OPE, ni identifiant d'envoi (au journal).
  // Le consommé et le disponible valent pour tout le N° OPE (ils se répètent sur chacune de ses lignes d'export) : on prend celui de la version la
  // plus récente, on ne les additionne pas. L'attribué, lui, s'additionne d'une ligne de financement à l'autre.
  // ---------------------------------------------------------------------------------------------------------------
  const numColumn = (id, label) => ({ id, label, type: 'Numeric' });
  const CP_COLUMN = 'totalCPConsomme';   // colonne existante de Lignes_OPE qui reçoit le « Consommé CP » (Consomme_CP) de l'export UB Invest
  const AMOUNT_COLUMNS = [numColumn('Montant_attribue', 'Montant attribué')].concat(YEAR_COLUMNS.map(id => numColumn(id, 'Attribué ' + id.slice(-4))), [
    numColumn('Consomme_AE', 'Consommé AE'), numColumn(CP_COLUMN, 'Total CP consommé'), numColumn('Disponible_AE', 'Disponible AE'), numColumn('Disponible_CP', 'Disponible CP'),
    { id: 'Date_maj_conso', label: 'Données UB Invest au', type: 'Date' }]);
  const AMOUNT_META = ['Date_maj_conso'];   // suivi : posé seulement quand un montant change
  const AMOUNT_IDS = new Set(AMOUNT_COLUMNS.map(col => col.id));

  // ---------------------------------------------------------------------------------------------------------------
  // Lecture de l'export Excel (lignes déjà extraites du classeur par XlsxReader) -> lignes prêtes pour Import_Financements.
  // Mêmes règles que le script d'envoi : en-têtes reconnus sans accent ni casse, une ligne sans N° OPE est ignorée, une valeur illisible
  // arrête tout (rien n'est chargé à moitié).
  // ---------------------------------------------------------------------------------------------------------------

  const MAX_ERRORS_LISTED = 8;
  const isBlank = cell => cell == null || (typeof cell === 'string' && !cell.trim());
  const unixOf = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2200 && new Date(Date.UTC(y, m - 1, d)).getUTCDate() === d ? Date.UTC(y, m - 1, d) / 1000 : null);

  function convertCell(type, cell, excelDateToUnix) {
    if (isBlank(cell)) return { skip: true };
    if (type === 'Text') {
      if (typeof cell === 'string') return { value: cell.trim() };
      if (typeof cell === 'number') return { value: String(cell) };
      if (cell && typeof cell === 'object' && 'excelDate' in cell) return { value: new Date(excelDateToUnix(cell.excelDate) * 1000).toISOString().slice(0, 10) };
      return { value: String(cell) };
    }
    if (type === 'Numeric') {
      if (typeof cell === 'number') return { value: cell };
      if (typeof cell === 'string') {
        const percent = /%\s*$/.test(cell), cleaned = cell.replace(/%\s*$/, '').replace(/[\s ]/g, '').replace(',', '.');
        if (/^-?\d+(\.\d+)?$/.test(cleaned)) return { value: percent ? Number(cleaned) / 100 : Number(cleaned) };
      }
      return { error: true };
    }
    if (type === 'Date') {
      if (cell && typeof cell === 'object' && 'excelDate' in cell) return { value: excelDateToUnix(cell.excelDate) };
      if (typeof cell === 'number') return cell > 20000 ? { value: excelDateToUnix(cell) } : { error: true };
      if (typeof cell === 'string') {
        const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(cell.trim()), iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(cell.trim());
        const value = fr ? unixOf(Number(fr[3]), Number(fr[2]), Number(fr[1])) : iso ? unixOf(Number(iso[1]), Number(iso[2]), Number(iso[3])) : null;
        return value == null ? { error: true } : { value };
      }
    }
    return { error: true };
  }
  const shown = cell => (cell && typeof cell === 'object' && 'excelDate' in cell ? 'date ' + cell.excelDate : String(cell));

  function readExport(sheetRows, now, excelDateToUnix) {
    const rows = sheetRows || [];
    const headerAt = rows.findIndex(row => row.some(cell => !isBlank(cell)));
    const empty = { records: [], total: 0, ignored: 0, errors: [], errorCount: 0, missing: [], unknown: [], projets: 0, opes: 0, exporteLe: null, lot: '' };
    if (headerAt < 0) return Object.assign(empty, { missing: SOURCE_FIELDS.map(field => field[1]) });
    const headers = rows[headerAt].map(cell => normalize(cell));
    const columnOf = new Map();
    headers.forEach((header, i) => { if (header && !columnOf.has(header)) columnOf.set(header, i); });
    const missing = SOURCE_FIELDS.filter(field => !columnOf.has(normalize(field[1]))).map(field => field[1]);
    const known = new Set(SOURCE_FIELDS.map(field => normalize(field[1])));
    const unknown = rows[headerAt].filter((cell, i) => !isBlank(cell) && !known.has(headers[i]) && columnOf.get(headers[i]) === i).map(cell => String(cell).trim());
    if (missing.length) return Object.assign(empty, { missing, unknown });
    const exporteLe = now.getTime() / 1000;
    const lot = lotIdOf(now);
    const out = Object.assign(empty, { unknown, exporteLe, lot });
    const projets = new Set(), opes = new Set();
    for (let i = headerAt + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(isBlank)) continue;
      out.total++;
      const record = {};
      let bad = false;
      SOURCE_FIELDS.forEach(([id, label, type]) => {
        const cell = row[columnOf.get(normalize(label))];
        const converted = convertCell(type, cell, excelDateToUnix);
        if (converted.skip) return;
        if (converted.error) {
          bad = true; out.errorCount++;
          if (out.errors.length < MAX_ERRORS_LISTED) out.errors.push({ line: i + 1, column: label, value: shown(cell) });
        } else record[id] = converted.value;
      });
      if (bad) continue;
      if (!text(record.N_OPE)) { out.ignored++; continue; }
      record.Cle_ligne = [record.N_OPE, record.Financeur || '', record.Ligne_budgetaire || ''].join('|');
      record.Exporte_le = exporteLe;
      record.Lot = lot;
      out.records.push(record);
      if (text(record.Projet)) projets.add(normalize(record.Projet));
      opes.add(opeKey(record.N_OPE));
    }
    out.projets = projets.size; out.opes = opes.size;
    return out;
  }
  const MONEY_TOLERANCE = 0.01;
  const CHUNK = 100;                // actions Grist par appel

  const text = value => (value == null ? '' : String(value).trim());
  const toNumber = value => { if (value == null || value === '') return null; const n = Number(value); return Number.isFinite(n) ? n : null; };
  const normalize = value => text(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // Même règle que le Dashboard (DashboardLogic.opeKey) : « OPE 001 », « ope001 » et « OPE001 » désignent la même ligne.
  const opeKey = value => text(value).toUpperCase().replace(/\s+/g, '');
  const near = (a, b, tolerance = MONEY_TOLERANCE) => Math.abs(a - b) <= tolerance;
  const refListIds = value => (Array.isArray(value) ? value.filter(item => typeof item === 'number' || (typeof item === 'string' && item !== 'L' && item !== '')).map(Number) : []);
  const isEmptyRef = value => !value || value === 0 || (Array.isArray(value) && refListIds(value).length === 0);
  const isEmptyDate = value => value == null || value === '' || value === 0;
  const pushTo = (map, key, value) => { if (!map.has(key)) map.set(key, []); map.get(key).push(value); };
  const unique = list => Array.from(new Set(list));
  const sum = (list, pick) => list.reduce((total, item) => total + (toNumber(pick(item)) || 0), 0);

  function bigrams(value) {
    const padded = ' ' + value + ' ', grams = new Map();
    for (let i = 0; i < padded.length - 1; i++) { const gram = padded.slice(i, i + 2); grams.set(gram, (grams.get(gram) || 0) + 1); }
    return grams;
  }
  // Coefficient de Dice sur les bigrammes (0 à 1) ; les deux textes sont déjà normalisés.
  function dice(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const ga = bigrams(a), gb = bigrams(b);
    let common = 0, total = 0;
    ga.forEach((count, gram) => { total += count; if (gb.has(gram)) common += Math.min(count, gb.get(gram)); });
    gb.forEach(count => { total += count; });
    return total ? (2 * common) / total : 0;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 1. Journal d'envois -> une version par ligne de financement
  // ---------------------------------------------------------------------------------------------------------------

  // Clé d'une ligne : N° OPE + financeur + ligne budgétaire (à confirmer par Antoine sur le vrai export).
  // Une ligne = un projet sur une OPE pour un financeur et une ligne budgétaire. Le projet est dans la clé : une OPE RH est partagée par de nombreux
  // projets (Antoine, 26/11), qui ont le même financeur et la même ligne budgétaire ; sans lui, une seule de leurs lignes survivait (la dernière lue).
  const lineKeyOf = row => [opeKey(row.N_OPE), normalize(row.Projet), normalize(row.Financeur), normalize(row.Ligne_budgetaire)].join('|');

  // Le journal grossit à chaque envoi : on garde la dernière version de chaque ligne (plus grand id, comme la synthèse Grist).
  // Une ligne sans N° OPE n'est pas rattachable : elle est comptée à part.
  function latestVersions(rows) {
    const byKey = new Map();
    let ignored = 0;
    (rows || []).forEach(row => {
      if (!text(row.N_OPE)) { ignored++; return; }
      const key = lineKeyOf(row), previous = byKey.get(key);
      if (!previous || Number(row.id) > Number(previous.id)) byKey.set(key, row);
    });
    const lines = Array.from(byKey, ([key, row]) => Object.assign({}, row, { _key: key })).sort((a, b) => Number(a.id) - Number(b.id));
    return { lines, ignored, total: (rows || []).length };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 2. Contrôles de cohérence de l'export
  // ---------------------------------------------------------------------------------------------------------------

  const CHECKS = [
    { id: 'annees', label: 'Somme des années = montant attribué' },
    { id: 'disponible', label: 'Disponible = attribué − consommé (AE et CP)' },
    { id: 'cp-ae', label: 'Consommé CP ≤ consommé AE' },
    { id: 'parts', label: 'Parts d\'un projet = 100 %' },
    { id: 'financeurs', label: 'Financeurs du projet = financeurs de ses lignes' },
    { id: 'ope-projets', label: 'N° OPE partagé par plusieurs projets (information)' },
    { id: 'dates', label: 'Date fin ≥ date début' }
  ];

  const projectKey = row => normalize(row.Projet);
  const splitFinanceurs = value => unique(text(value).split(';').map(normalize).filter(Boolean)).sort();

  // Renvoie les écarts trouvés ({level: 'error'|'warn', check, ope, project, message}) ; 'error' exclut la ligne de l'import.
  function checkLines(lines) {
    const issues = [];
    const add = (level, check, line, message) => issues.push({ level, check, key: line && line._key, ope: line ? text(line.N_OPE) : '', project: line ? text(line.Projet) : '', message });
    const money = n => (Math.round(n * 100) / 100).toLocaleString('fr-FR');
    lines.forEach(line => {
      if (!text(line.Projet)) { add('error', 'projet-vide', line, 'Ligne sans nom de projet'); return; }
      const attribue = toNumber(line.Montant_attribue);
      const years = YEAR_COLUMNS.map(col => toNumber(line[col])).filter(v => v != null);
      if (attribue != null && years.length) {
        const total = years.reduce((a, b) => a + b, 0);
        if (!near(total, attribue)) add('warn', 'annees', line, `Somme des années ${money(total)} ≠ montant attribué ${money(attribue)}`);
      }
      [['AE', 'Consomme_AE', 'Disponible_AE'], ['CP', 'Consomme_CP', 'Disponible_CP']].forEach(([label, consumed, available]) => {
        const c = toNumber(line[consumed]), d = toNumber(line[available]);
        if (attribue != null && c != null && d != null && !near(attribue - c, d)) add('warn', 'disponible', line, `Disponible ${label} ${money(d)} ≠ attribué − consommé (${money(attribue - c)})`);
      });
      const ae = toNumber(line.Consomme_AE), cp = toNumber(line.Consomme_CP);
      if (ae != null && cp != null && cp > ae + MONEY_TOLERANCE) add('warn', 'cp-ae', line, `Consommé CP ${money(cp)} > consommé AE ${money(ae)}`);
      const start = toNumber(line.Date_debut), end = toNumber(line.Date_fin);
      if (start != null && end != null && end < start) add('warn', 'dates', line, 'Date de fin avant la date de début');
    });
    const byProject = new Map();
    lines.forEach(line => { if (text(line.Projet)) pushTo(byProject, projectKey(line), line); });
    byProject.forEach(group => {
      const first = group[0];
      const parts = group.map(line => toNumber(line.Part_du_projet));
      if (parts.every(p => p != null)) {
        const percent = parts.some(p => p > 1.5), total = parts.reduce((a, b) => a + b, 0);
        if (!near(total, percent ? 100 : 1, 0.011)) add('warn', 'parts', first, `Parts du projet : total ${money(total)} au lieu de ${percent ? 100 : 1}`);
      }
      const declared = splitFinanceurs(first.Financeurs_du_projet), actual = unique(group.map(line => normalize(line.Financeur)).filter(Boolean)).sort();
      if (declared.length && JSON.stringify(declared) !== JSON.stringify(actual)) add('warn', 'financeurs', first, `Financeurs du projet « ${text(first.Financeurs_du_projet)} » ≠ ceux de ses lignes (${unique(group.map(l => text(l.Financeur))).join(', ')})`);
    });
    const projectsOfOpe = new Map();
    lines.forEach(line => { if (text(line.Projet)) pushTo(projectsOfOpe, opeKey(line.N_OPE), line); });
    // Une OPE portée par plusieurs projets est normale (OPE RH : une par programme pour de nombreux projets, Antoine 26/11) : simple information,
    // les lignes restent dans l'import et chaque projet garde la sienne.
    projectsOfOpe.forEach(group => {
      const names = unique(group.map(projectKey));
      if (names.length > 1) add('warn', 'ope-projets', group[0], `Le N° OPE ${text(group[0].N_OPE)} est partagé par ${names.length} projets dans l'export (normal pour une OPE RH) : ${unique(group.map(l => text(l.Projet))).slice(0, 4).join(' / ')}${names.length > 4 ? '…' : ''}`);
    });
    return issues;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 3. Projets de l'export (regroupement des lignes par nom de projet)
  // ---------------------------------------------------------------------------------------------------------------

  function mostCommon(list) {
    const counts = new Map();
    list.forEach(item => counts.set(item, (counts.get(item) || 0) + 1));
    return Array.from(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }

  // Montants d'un N° OPE à partir de ses lignes d'export (dernières versions) : voir AMOUNT_COLUMNS. Une valeur absente de l'export n'est pas
  // renvoyée (rien à écrire). `conflict` signale des lignes qui ne donnent pas le même consommé ou disponible pour le même N° OPE.
  const SHARED_AMOUNTS = ['Consomme_AE', 'Consomme_CP', 'Disponible_AE', 'Disponible_CP'];
  function aggregateOpe(lines) {
    const rows = (lines || []).slice().sort((a, b) => Number(a.id) - Number(b.id));
    const out = { conflict: false };
    if (!rows.length) return out;
    const latest = rows[rows.length - 1];
    const total = id => { const values = rows.map(r => toNumber(r[id])).filter(v => v != null); return values.length ? values.reduce((a, b) => a + b, 0) : null; };
    const newest = id => { for (let i = rows.length - 1; i >= 0; i--) { const v = toNumber(rows[i][id]); if (v != null) return v; } return null; };
    const put = (id, value) => { if (value != null && value !== '') out[id] = value; };
    put('Montant_attribue', total('Montant_attribue'));
    YEAR_COLUMNS.forEach(id => put(id, total(id)));
    SHARED_AMOUNTS.forEach(id => {
      put(id === 'Consomme_CP' ? CP_COLUMN : id, newest(id));   // la source s'appelle Consomme_CP, la colonne de Lignes_OPE totalCPConsomme
      const values = rows.map(r => toNumber(r[id])).filter(v => v != null);
      if (values.length > 1 && values.some(v => !near(v, values[0]))) out.conflict = true;
    });
    const seconds = lotSeconds(latest.Lot) || toNumber(latest.Exporte_le);
    put('Date_maj_conso', seconds ? Math.floor(seconds / 86400) * 86400 : null);
    return out;
  }

  function groupProjects(lines, issues) {
    const blockedOpe = new Map();
    (issues || []).filter(issue => issue.level === 'error' && issue.check === 'ope-projets').forEach(issue => blockedOpe.set(opeKey(issue.ope), issue.message));
    const groups = new Map(), orphans = [];
    lines.forEach(line => { if (text(line.Projet)) pushTo(groups, projectKey(line), line); else orphans.push(line); });
    // Une OPE partagée par plusieurs projets : ses montants valent pour l'OPE entière (somme des lignes de tous les projets), pas pour un seul projet.
    const linesOfOpe = new Map();
    groups.forEach(group => group.forEach(line => pushTo(linesOfOpe, opeKey(line.N_OPE), line)));
    const sharedOpes = new Map();
    linesOfOpe.forEach((list, key) => { const n = unique(list.map(projectKey)).length; if (n > 1) sharedOpes.set(key, n); });
    const entries = Array.from(groups, ([key, group]) => {
      const opeMap = new Map();
      group.forEach(line => {
        const k = opeKey(line.N_OPE);
        if (!opeMap.has(k)) opeMap.set(k, { key: k, ope: text(line.N_OPE), structures: [], lines: [] });
        const ope = opeMap.get(k);
        ope.lines.push(line);
        if (text(line.Structure)) ope.structures.push(text(line.Structure));
      });
      const opes = Array.from(opeMap.values()).map(ope => {
        const starts = ope.lines.map(l => toNumber(l.Date_debut)).filter(v => v != null);
        return Object.assign(ope, {
          structure: mostCommon(ope.structures), structureCount: unique(ope.structures).length,
          financeur: mostCommon(ope.lines.map(l => text(l.Financeur)).filter(Boolean)), innovations: ope.lines.some(l => normalize(l.Financeur) === 'innovations'),
          dateDebut: starts.length ? Math.min(...starts) : null, shared: sharedOpes.has(ope.key), sharedBy: sharedOpes.get(ope.key) || 1,
          amounts: aggregateOpe(sharedOpes.has(ope.key) ? linesOfOpe.get(ope.key) : ope.lines)
        });
      });
      const starts = group.map(l => toNumber(l.Date_debut)).filter(v => v != null), ends = group.map(l => toNumber(l.Date_fin)).filter(v => v != null);
      const blocked = opes.map(o => blockedOpe.get(o.key)).find(Boolean) || '';
      return {
        key, name: mostCommon(group.map(l => text(l.Projet))), lines: group, opes,
        programme: mostCommon(group.map(l => text(l.Programme)).filter(Boolean)), programmes: unique(group.map(l => text(l.Programme)).filter(Boolean)),
        financeurs: unique(group.map(l => text(l.Financeur)).filter(Boolean)), decisions: unique(group.map(l => text(l.N_decision)).filter(Boolean)),
        dateDebut: starts.length ? Math.min(...starts) : null, dateFin: ends.length ? Math.max(...ends) : null,
        attribue: sum(group, l => l.Montant_attribue), consommeAE: sum(group, l => l.Consomme_AE), consommeCP: sum(group, l => l.Consomme_CP),
        blocked
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return { entries, orphans };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 4. Contexte Grist et rapprochement
  // ---------------------------------------------------------------------------------------------------------------

  function buildContext({ projets, lignes, programmes, structures, isFormula, hasColumn, statusChoices, rankMode, withAmounts }) {
    const ligneIdsByKey = new Map(), ligneById = new Map(), projectsByLigne = new Map(), slotsByProject = new Map();
    (lignes || []).forEach(ligne => { ligneById.set(Number(ligne.id), ligne); const k = opeKey(ligne.N_OPE); if (k) pushTo(ligneIdsByKey, k, Number(ligne.id)); });
    const projectById = new Map();
    const projects = (projets || []).map(project => {
      projectById.set(Number(project.id), project);
      // Les lignes OPE d'un projet sont dans ses quatre rangs, pas seulement dans Ligne_OPE (un N° OPE rangé en OPE 2 doit retrouver son projet).
      const slots = slotRanks().map(rank => ({ rank, column: slotColumn(rank), ids: refListIds(project[slotColumn(rank)]) }));
      slotsByProject.set(Number(project.id), slots);
      unique(slots.flatMap(slot => slot.ids)).forEach(id => pushTo(projectsByLigne, id, Number(project.id)));
      const acronyme = text(project.Acronyme), name = text(project.Projet);
      return {
        id: Number(project.id), name, acronyme, label: acronyme || name || `Projet #${project.id}`,
        nName: normalize(name), nAcr: normalize(acronyme),
        decisionText: opeKey(`${text(project.numero_descisions_OLD)} ${text(project.prolongation_numeroDecisionInitial)}`)
      };
    });
    const programmeList = (programmes || []).map(p => ({ id: Number(p.id), label: text(p.Programme), n: normalize(p.Programme) })).filter(p => p.label);
    const structureList = (structures || []).map(s => ({
      id: Number(s.id), label: text(s.Acronyme) || text(s.Nom_Complet),
      names: unique([s.Acronyme, s.Nom_Complet, s.Nom_Complet_clean].map(normalize).filter(Boolean))
    })).filter(s => s.label);
    return {
      withAmounts: !!withAmounts, ligneIdsByKey, ligneById, projectsByLigne, slotsByProject, rankMode: RANK_MODES.includes(rankMode) ? rankMode : DEFAULT_RANK_MODE, projects, projectById, programmeList, structureList,
      programmeById: new Map(programmeList.map(p => [p.id, p])), structureById: new Map(structureList.map(s => [s.id, s])),
      statusChoices: statusChoices || [], // liste de choix de Projets.Statut_operationnel_projet (vide = inconnue : aucun contrôle)
      isFormula: isFormula || (() => false), hasColumn: hasColumn || (() => true)
    };
  }

  // OPE partagée : portée par plusieurs projets dans l'export, ou déclarée « RH » dans Grist (Lignes_OPE.Type_ligne_OPE).
  const isSharedOpe = (ope, ctx) => !!ope.shared || (ctx.ligneIdsByKey.get(ope.key) || []).some(id => { const ligne = ctx.ligneById.get(id); return !!ligne && text(ligne.Type_ligne_OPE) === 'RH'; });
  const candidateOf = (project, score, why) => ({ id: project.id, label: project.label, name: project.name, score, why });

  // Résultat : { status: 'sure' | 'maybe' | 'new' | 'conflict', rung, projectId, candidates, reason }
  function matchEntry(entry, ctx) {
    if (entry.blocked) return { status: 'blocked', rung: 0, projectId: null, candidates: [], reason: entry.blocked };
    // 1. N° OPE déjà rattaché à un projet
    // Une OPE partagée par plusieurs projets (OPE RH) ne désigne aucun projet en particulier : elle ne sert pas à retrouver le projet.
    const byOpe = new Map();
    entry.opes.filter(ope => !isSharedOpe(ope, ctx)).forEach(ope => (ctx.ligneIdsByKey.get(ope.key) || []).forEach(ligneId => (ctx.projectsByLigne.get(ligneId) || []).forEach(projectId => pushTo(byOpe, projectId, ope.ope))));
    if (byOpe.size === 1) {
      const [projectId, opes] = Array.from(byOpe)[0], project = ctx.projectById.get(projectId);
      return { status: 'sure', rung: 1, projectId, candidates: [candidateOf(ctx.projects.find(p => p.id === projectId), 1, 'N° OPE')], reason: `N° OPE ${unique(opes).join(', ')} déjà dans ce projet`, project };
    }
    if (byOpe.size > 1) {
      const candidates = Array.from(byOpe.keys()).map(id => candidateOf(ctx.projects.find(p => p.id === id), 1, 'N° OPE'));
      return { status: 'conflict', rung: 1, projectId: null, candidates, reason: 'Les N° OPE de ce projet sont déjà dans plusieurs projets de Grist' };
    }
    // 2. N° décision déjà cité par un projet
    const decisions = entry.decisions.map(opeKey).filter(key => key.length >= 5);
    if (decisions.length) {
      const hits = ctx.projects.filter(project => project.decisionText && decisions.some(key => project.decisionText.includes(key)));
      if (hits.length === 1) return { status: 'sure', rung: 2, projectId: hits[0].id, candidates: [candidateOf(hits[0], 1, 'N° décision')], reason: `N° décision ${entry.decisions.join(', ')} déjà cité par ce projet` };
      if (hits.length > 1) return { status: 'conflict', rung: 2, projectId: null, candidates: hits.map(p => candidateOf(p, 1, 'N° décision')), reason: 'Ce N° décision est cité par plusieurs projets de Grist' };
    }
    // 3. nom
    const name = normalize(entry.name);
    const scored = ctx.projects.map(project => {
      let score = 0, why = '';
      if (project.nName) { const s = name === project.nName ? 1 : dice(name, project.nName); if (s > score) { score = s; why = s === 1 ? 'même nom' : 'nom proche'; } }
      if (project.nAcr) {
        const whole = (' ' + name + ' ').includes(' ' + project.nAcr + ' ') && project.nAcr.length >= 3;
        const s = name === project.nAcr ? 1 : (whole ? 0.9 : dice(name, project.nAcr));
        if (s > score) { score = s; why = name === project.nAcr ? 'même acronyme' : (whole ? 'acronyme dans le nom' : 'acronyme proche'); }
      }
      return { project, score, why };
    }).filter(item => item.score >= MIN_CANDIDATE).sort((a, b) => b.score - a.score);
    const candidates = scored.slice(0, 3).map(item => candidateOf(item.project, Math.round(item.score * 100) / 100, item.why));
    if (scored.length >= 2 && scored[0].score >= 0.99 && scored[1].score >= 0.99) return { status: 'conflict', rung: 3, projectId: null, candidates, reason: 'Plusieurs projets de Grist portent ce nom' };
    if (scored.length && scored[0].score >= MIN_SIMILARITY) return { status: 'maybe', rung: 3, projectId: scored[0].project.id, candidates, reason: `${scored[0].why} (${Math.round(scored[0].score * 100)} %)` };
    // 4. rien
    return { status: 'new', rung: 4, projectId: null, candidates, reason: 'Aucun projet de Grist ne correspond' };
  }

  // Un libellé de l'export (programme, structure) retrouvé dans une liste de Grist : `exact` quand l'égalité tient (sans accents ni
  // majuscules), sinon `suggestion` quand un libellé est très proche (à relire), sinon rien.
  function matchLabel(label, items, namesOf) {
    const n = normalize(label);
    if (!n) return { item: null, exact: false, suggestion: null };
    const exact = items.find(item => namesOf(item).includes(n));
    if (exact) return { item: exact, exact: true, suggestion: null };
    let best = null, bestScore = 0;
    items.forEach(item => namesOf(item).forEach(name => { const s = dice(n, name); if (s > bestScore) { bestScore = s; best = item; } }));
    return { item: null, exact: false, suggestion: best && bestScore >= MIN_LABEL_SIMILARITY ? best : null };
  }

  function defaultAcronyme(name) {
    const head = text(name).split(/\s+-\s+/)[0].trim() || text(name);
    return head.length > 40 ? head.slice(0, 40).trim() : head;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 5. Le tableau de contrôle : une ligne par projet de l'export, une cellule par valeur, et ce qui sera écrit
  // ---------------------------------------------------------------------------------------------------------------
  //
  // Une cellule compare ce que dit l'export (`e`) à ce qu'il y a dans Grist (`g`), et porte une couleur :
  //   add = valeur d'un projet ou d'une ligne OPE créés · fill = valeur posée dans une cellule vide, ou valeur de l'export prise à la place
  //   de celle de Grist · conf = écart : Grist est rempli et diffère, Grist garde sa valeur · same = identique · empty = rien des deux côtés ·
  //   bad = anomalie (valeur que Grist n'accepte pas : choix absent, référence inconnue, dates à l'envers…), à corriger avant d'écrire ·
  //   plain = ligne pas encore décidée ou écartée : valeurs montrées sans couleur.
  // L'utilisateur change une valeur d'un clic : `edits` (id de cellule -> valeur ; null = ne pas renseigner) l'emporte sur l'export.
  // Ce que le tableau montre est exactement ce qu'écrit buildPlan : le plan se déduit des cellules.

  const KIND_LABEL = { name: 'Projet', acr: 'Acronyme', prog: 'Programme', start: 'Début', end: 'Fin', stat: 'Statut du projet', s: 'Structure' };
  const APPLY_ALL_KINDS = ['prog', 'stat', 's'];
  const isoOfUnix = seconds => (seconds == null || seconds === '' || Number(seconds) === 0 ? null : new Date(Number(seconds) * 1000).toISOString().slice(0, 10));
  const unixOfIso = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(iso)); return m ? unixOf(Number(m[1]), Number(m[2]), Number(m[3])) : null; };
  const programmeLabelOf = (ctx, id) => { if (isEmptyRef(id)) return null; const p = ctx.programmeById.get(Number(id)); return p ? p.label : '#' + id; };
  const structureLabelOf = (ctx, id) => { if (isEmptyRef(id)) return null; const s = ctx.structureById.get(Number(id)); return s ? s.label : '#' + id; };

  function evalCell({ id, kind, g, e, neu, edits, check, same }) {
    const edited = edits.has(id), cur = edited ? edits.get(id) : e, base = neu ? null : (g == null || g === '' ? null : g);
    const cell = { id, kind, g: base, e: e == null ? null : e, v: null, state: 'empty', err: '', hint: '', raw: cur == null || cur === '' ? null : cur, alt: null, edited };
    if (cur == null || cur === '') { cell.v = base; cell.state = base == null ? 'empty' : 'same'; return cell; }
    cell.v = cur;
    const problem = check ? check(cur) : null;
    if (problem) { cell.state = 'bad'; cell.err = problem.err; cell.hint = problem.hint || ''; return cell; }
    if (neu) cell.state = 'add';
    else if (base == null) cell.state = 'fill';
    else if ((same || ((a, b) => a === b))(base, cur)) { cell.state = 'same'; cell.v = base; }
    else if (edited) cell.state = 'fill';
    else { cell.state = 'conf'; cell.v = base; cell.alt = cur; }
    return cell;
  }

  // Décision de l'utilisateur pour un projet de l'export : { mode: 'auto'|'project'|'new'|'skip'|'other', projectId, confirmed }.
  // Un rapprochement sûr (N° OPE, N° décision) vaut accord ; « nouveau » aussi (le projet créé se voit en vert dans le tableau) ;
  // « à confirmer » et « à trancher » attendent un choix.
  function effectiveDecision(match, decision) {
    const d = decision || { mode: 'auto' };
    if (match.status === 'blocked') return { action: 'skip', reason: 'blocked', confirmed: true };
    if (d.mode === 'skip') return { action: 'skip', reason: 'skipped', confirmed: true };
    if (d.mode === 'new') return { action: 'create', confirmed: true };
    if (d.mode === 'other' && !d.projectId) return { action: 'pending', confirmed: false }; // « Autre projet… » choisi, projet pas encore désigné
    if (d.mode === 'project' && d.projectId) return { action: 'link', projectId: Number(d.projectId), confirmed: d.confirmed !== false };
    if (match.status === 'sure') return { action: 'link', projectId: match.projectId, confirmed: true };
    if (match.status === 'maybe') return { action: 'link', projectId: match.projectId, confirmed: !!d.confirmed };
    if (match.status === 'new') return { action: 'create', confirmed: true };
    return { action: 'pending', confirmed: false }; // conflit : à trancher
  }

  function statusForDates(dateFin, nowSeconds) {
    return dateFin != null && dateFin < nowSeconds ? STATUS_CLOSED : STATUS_RUNNING;
  }

  const sameText = (a, b) => normalize(a) === normalize(b);

  // Ordre dans lequel les N° OPE d'un projet prennent leur rang (voir RANK_MODES) ; à égalité, le N° OPE.
  function orderOpes(opes, mode) {
    const startOf = ope => (ope.dateDebut == null ? Infinity : ope.dateDebut);
    return opes.slice().sort((a, b) => {
      if (mode === 'innovations' && !!a.innovations !== !!b.innovations) return a.innovations ? -1 : 1;
      const sa = startOf(a), sb = startOf(b);
      if (sa !== sb) return sa < sb ? -1 : 1;
      return String(a.key).localeCompare(String(b.key), 'fr', { numeric: true });
    });
  }

  // Rang (1 à 4) de chaque N° OPE du projet de l'export, par sa clé. `rankOfExisting(ope)` rend le rang où la ligne est déjà rangée dans le projet
  // de Grist (0 sinon) : elle le garde. Les autres prennent, dans l'ordre choisi, le premier rang libre (`occupied` : rangs de Grist qui ont déjà
  // une ligne, même absente de l'export) ; quand les quatre sont pris, le surplus rejoint la liste du dernier rang (c'est une liste de lignes).
  function placeOpes(opes, rankOfExisting, mode, occupied) {
    const ranks = new Map(), taken = new Set(occupied || []), max = SLOT_MAX(), todo = [];
    opes.forEach(ope => { const rank = rankOfExisting(ope); if (rank) { ranks.set(ope.key, rank); taken.add(rank); } else todo.push(ope); });
    orderOpes(todo, mode).forEach(ope => {
      if (mode === 'single') { ranks.set(ope.key, 1); return; }
      let rank = 1;
      while (rank <= max && taken.has(rank)) rank++;
      if (rank > max) rank = max;
      ranks.set(ope.key, rank); taken.add(rank);
    });
    return ranks;
  }

  function buildRow(entry, match, decisionRaw, edits, ctx, nowSeconds) {
    const decision = effectiveDecision(match, decisionRaw);
    const target = decision.action === 'link' ? ctx.projectById.get(decision.projectId) || null : null;
    const skip = decision.action === 'skip';
    const unresolved = !skip && (decision.action === 'pending' || !decision.confirmed || (decision.action === 'link' && !target));
    const neu = !target;
    const key = entry.key;
    const row = { key, entry, match, decision, target, state: 'same', reason: '', cells: {}, lines: [], anomalies: 0, plain: skip || (unresolved && !target) };
    if (skip) row.reason = decision.reason === 'blocked' ? match.reason : 'Mis de côté';
    // En attente d'un choix avec une piste (« à confirmer ») : les valeurs sont comparées à ce projet, sans rien écrire.
    const shownProject = target || (unresolved && match.projectId ? ctx.projectById.get(match.projectId) || null : null);
    const isNewHere = !shownProject;
    const g = shownProject ? {
      name: text(shownProject.Projet) || null, acr: text(shownProject.Acronyme) || null, prog: programmeLabelOf(ctx, shownProject.Programme),
      start: isoOfUnix(shownProject.Date_debut_Projet), end: isoOfUnix(shownProject.Date_de_fin_Projet), stat: text(shownProject.Statut_operationnel_projet) || null
    } : {};
    const canonProgramme = label => { const m = matchLabel(label, ctx.programmeList, p => [p.n]); return m.exact ? m.item.label : label; };
    const canonStructure = label => { const m = matchLabel(label, ctx.structureList, s => s.names); return m.exact ? m.item.label : label; };
    const programmeCheck = value => {
      if (!ctx.programmeList.length || ctx.programmeList.some(p => p.label === value)) return null;
      const near = matchLabel(value, ctx.programmeList, p => [p.n]).suggestion;
      return { err: 'Programme inconnu dans Grist', hint: near ? near.label : '' };
    };
    const structureCheck = value => {
      if (!ctx.structureList.length || ctx.structureList.some(s => s.label === value)) return null;
      const near = matchLabel(value, ctx.structureList, s => s.names).suggestion;
      return { err: 'Structure inconnue dans Grist', hint: near ? near.label : '' };
    };
    const cell = (kind, e, check, same) => (row.cells[kind] = evalCell({ id: key + '|' + kind, kind, g: g[kind], e, neu: isNewHere, edits, check, same }));
    cell('name', entry.name, null, sameText);
    cell('acr', isNewHere ? defaultAcronyme(entry.name) : null, null, sameText);
    cell('prog', entry.programme ? canonProgramme(entry.programme) : null, programmeCheck);
    cell('start', isoOfUnix(entry.dateDebut), null);
    cell('end', isoOfUnix(entry.dateFin), value => { const start = row.cells.start.v; return start && value < start ? { err: 'Fin avant le début' } : null; });
    const statusChoices = ctx.statusChoices || [];
    cell('stat', isNewHere ? statusForDates(unixOfIso(row.cells.end.v), nowSeconds) : null,
      value => (statusChoices.length && !statusChoices.includes(value) ? { err: 'Absent de la liste de choix' } : null));
    // Rang de chaque N° OPE (OPE 1 à 4) : celui où la ligne est déjà rangée dans le projet de Grist, sinon le premier rang libre.
    const slots = shownProject ? (ctx.slotsByProject.get(Number(shownProject.id)) || []) : [];
    const current = unique(slots.flatMap(slot => slot.ids));
    const ranks = placeOpes(entry.opes, ope => {
      const id = (ctx.ligneIdsByKey.get(ope.key) || [])[0] || 0, slot = id ? slots.find(item => item.ids.includes(id)) : null;
      return slot ? slot.rank : 0;
    }, ctx.rankMode || DEFAULT_RANK_MODE, slots.filter(slot => slot.ids.length).map(slot => slot.rank));
    entry.opes.forEach(ope => {
      const existingId = (ctx.ligneIdsByKey.get(ope.key) || [])[0] || 0, ligne = existingId ? ctx.ligneById.get(existingId) : null;
      const structure = evalCell({
        id: key + '|s|' + ope.key, kind: 's', g: ligne ? structureLabelOf(ctx, ligne.installe_chez) : null, e: ope.structure ? canonStructure(ope.structure) : null,
        neu: !existingId, edits, check: structureCheck
      });
      const sharedOpe = isSharedOpe(ope, ctx);
      const owners = existingId && !sharedOpe ? (ctx.projectsByLigne.get(existingId) || []).filter(pid => !shownProject || pid !== shownProject.id) : [];
      const conflictId = key + '|c|' + ope.key;
      const ownerProject = owners.length ? ctx.projects.find(p => p.id === owners[0]) : null;
      const conflict = owners.length ? { id: conflictId, owner: ownerProject ? ownerProject.label : '#' + owners[0], resolved: edits.get(conflictId) === 'keep' } : null;
      const inProject = !!existingId && current.includes(existingId);
      const needsLink = !inProject && !(conflict && !conflict.resolved);
      let state = structure.state;
      if (conflict && !conflict.resolved) state = 'bad';
      else if (!existingId && state !== 'bad') state = 'add';
      else if (existingId && state !== 'bad' && state !== 'fill' && state !== 'conf' && needsLink) state = 'fill';
      const rank = ranks.get(ope.key) || 1;
      row.lines.push({ key: ope.key, ope: ope.ope, amounts: ope.amounts, shared: sharedOpe, existingId, ligne, isNew: !existingId, cell: structure, conflict, needsLink, state, rank, column: slotColumn(rank), id: conflict && !conflict.resolved ? conflictId : structure.id });
    });
    // Pas encore décidé ou écarté : les valeurs restent visibles, sans couleur ni anomalie propre.
    if (row.plain) {
      Object.keys(row.cells).forEach(k => { const c = row.cells[k]; if (c.state !== 'bad') c.state = c.state === 'empty' ? 'empty' : 'plain'; });
      row.lines.forEach(line => { if (line.state !== 'bad') line.state = 'plain'; });
    }
    if (skip) {
      Object.keys(row.cells).forEach(k => { row.cells[k].state = row.cells[k].state === 'empty' ? 'empty' : 'plain'; row.cells[k].err = ''; });
      row.lines.forEach(line => { line.state = 'plain'; line.conflict = null; line.cell.err = ''; });
    }
    if (skip) row.state = 'skip';
    else if (unresolved) row.state = 'tbd';
    else if (neu) row.state = 'add';
    else {
      const changed = Object.keys(row.cells).some(k => row.cells[k].state === 'fill') || row.lines.some(line => line.isNew || line.needsLink || line.state === 'fill');
      row.state = changed ? 'mod' : 'same';
    }
    if (!skip) {
      row.anomalies = (unresolved ? 1 : 0) + Object.keys(row.cells).filter(k => row.cells[k].state === 'bad').length + row.lines.filter(line => line.state === 'bad').length;
    }
    return row;
  }

  function buildTable({ entries, matches, decisions, edits, ctx, now }) {
    const nowSeconds = Math.floor((now || Date.now()) / 1000), editMap = edits || new Map(), decisionMap = decisions || new Map();
    const rows = entries.map(entry => buildRow(entry, matches.get(entry.key), decisionMap.get(entry.key), editMap, ctx, nowSeconds));
    const count = { add: 0, mod: 0, same: 0, tbd: 0, skip: 0, todo: 0, left: 0, ecarts: 0 };
    const cellIndex = new Map(), lineIndex = new Map();
    rows.forEach(row => {
      count[row.state]++;
      if (row.anomalies) { count.todo++; count.left += row.anomalies; }
      Object.keys(row.cells).forEach(k => { const c = row.cells[k]; cellIndex.set(c.id, c); if (c.state === 'conf') count.ecarts++; });
      row.lines.forEach(line => {
        cellIndex.set(line.cell.id, line.cell); lineIndex.set(line.cell.id, { row, line });
        if (line.conflict) lineIndex.set(line.conflict.id, { row, line });
        if (line.cell.state === 'conf') count.ecarts++;
      });
    });
    const table = Object.assign({ rows, cellIndex, lineIndex, edits: editMap }, count);
    table.plan = planFromTable(table, ctx);
    return table;
  }

  // Les cellules en anomalie qui disent la même chose que celle-ci (« CTO Innov. 2024 » sur 12 projets) : une seule correction les règle.
  function similarBad(table, id) {
    const target = table.cellIndex.get(id);
    if (!target || target.state !== 'bad' || !APPLY_ALL_KINDS.includes(target.kind) || target.raw == null) return [];
    return Array.from(table.cellIndex.values()).filter(c => c.id !== id && c.state === 'bad' && c.kind === target.kind && c.raw === target.raw);
  }

  // Pose le choix de l'utilisateur sur une cellule (et sur celles qui disent la même chose, s'il le demande). `edits` est modifié.
  function applyChoice(table, edits, id, value, all) {
    const ids = [id];
    if (all) similarBad(table, id).forEach(c => ids.push(c.id));
    ids.forEach(cellId => edits.set(cellId, value === '__none' ? null : value));
    return ids.length;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 6. Plan d'écriture (déduit du tableau : rien n'est écrit tant que l'utilisateur n'a pas validé)
  // ---------------------------------------------------------------------------------------------------------------

  // Ne garde que les colonnes que Grist accepte d'écrire : inexistantes ou calculées, elles feraient refuser toute l'action.
  // Exception : les rangs OPE 2 à 4 de Projets (Ligne_OPE_2…) n'existent peut-être pas encore, la page les crée juste avant d'écrire (plan.neededRank).
  // Les colonnes de montants de Lignes_OPE (AMOUNT_COLUMNS) sont créées de même juste avant l'écriture (plan.neededAmounts).
  const isSlotColumn = (table, col) => (table === 'Projets' && slotRanks().some(rank => rank > 1 && slotColumn(rank) === col)) || (table === 'Lignes_OPE' && AMOUNT_IDS.has(col));
  function writable(ctx, table, fields) {
    const out = {};
    Object.keys(fields).forEach(col => { if ((isSlotColumn(table, col) || ctx.hasColumn(table, col)) && !ctx.isFormula(table, col)) out[col] = fields[col]; });
    return out;
  }

  // Montants à écrire sur une ligne OPE : seulement ce qui change par rapport à la ligne de Grist (`current`, null pour une ligne à créer). L'export
  // fait foi : une valeur différente de Grist la remplace (ces colonnes sont créées et remplies par l'import, personne ne les saisit). Les colonnes de
  // suivi (Montants au, Envoi des montants) suivent seulement quand un montant change, pour que deux envois identiques n'écrivent rien.
  function amountFields(amounts, current) {
    if (!amounts) return null;
    const fields = {}, before = {};
    AMOUNT_COLUMNS.forEach(col => {
      if (AMOUNT_META.includes(col.id) || !(col.id in amounts)) return;
      const value = amounts[col.id], was = current ? current[col.id] : null;
      const same = col.type === 'Numeric' ? toNumber(was) != null && near(toNumber(was), value)
        : col.type === 'Date' ? (toNumber(was) || 0) === value : text(was) === text(value);
      if (same) return;
      fields[col.id] = value; before[col.id] = was === undefined ? null : was;
    });
    if (!Object.keys(fields).length) return null;
    AMOUNT_META.forEach(id => {
      if (!(id in amounts)) return;
      fields[id] = amounts[id]; before[id] = current && current[id] !== undefined ? current[id] : null;
    });
    return { fields, before };
  }

  function planFromTable(table, ctx) {
    const phase1 = [], phase2 = [], skipped = [], notReady = [];
    let neededRank = 1; // plus haut rang OPE (1 à 4) écrit par ce plan : au-delà de 1, ses colonnes de Projets sont à créer avant l'écriture
    let neededAmounts = false; // le plan écrit des montants : leurs colonnes de Lignes_OPE sont à créer avant l'écriture
    const counts = { projetsCrees: 0, projetsLies: 0, opesCreees: 0, opesCompletees: 0, montantsEcrits: 0, dejaAJour: 0, misDeCote: 0, aConfirmer: 0, ecarts: table.ecarts };
    const opeRef = new Map(); // N° OPE (clé) -> id existant ou { tmp }
    const programmeId = label => { const p = ctx.programmeList.find(item => item.label === label); return p ? p.id : 0; };
    const structureId = label => { const s = ctx.structureList.find(item => item.label === label); return s ? s.id : 0; };
    table.rows.forEach(row => {
      const entry = row.entry;
      if (row.state === 'skip') { counts.misDeCote++; skipped.push({ entry, reason: row.decision.reason }); return; }
      if (row.state === 'tbd' || row.anomalies) { counts.aConfirmer++; notReady.push({ entry, status: row.match.status }); return; }
      let changed = false;
      const refs = [];
      row.lines.forEach(line => {
        const known = opeRef.get(line.key);
        if (known !== undefined) { refs.push(known); return; }
        const sid = line.cell.v ? structureId(line.cell.v) : 0;
        const amount = ctx.withAmounts ? amountFields(line.amounts, line.ligne) : null;
        if (line.existingId) {
          refs.push(line.existingId); opeRef.set(line.key, line.existingId);
          let op = null;
          if (line.cell.state === 'fill' && sid) {
            const fields = writable(ctx, 'Lignes_OPE', { installe_chez: sid });
            if (Object.keys(fields).length) {
              op = { table: 'Lignes_OPE', kind: 'update', id: line.existingId, fields, before: { installe_chez: isEmptyRef(line.ligne.installe_chez) ? 0 : line.ligne.installe_chez }, label: `OPE ${line.ope}`, entry: entry.key };
              counts.opesCompletees++; changed = true;
            }
          }
          if (amount) {
            const fields = writable(ctx, 'Lignes_OPE', amount.fields);
            if (Object.keys(fields).length) {
              if (!op) op = { table: 'Lignes_OPE', kind: 'update', id: line.existingId, fields: {}, before: {}, label: `OPE ${line.ope}`, entry: entry.key };
              Object.keys(fields).forEach(col => { op.fields[col] = fields[col]; op.before[col] = amount.before[col]; });
              counts.montantsEcrits++; changed = true; neededAmounts = true;
            }
          }
          if (op) phase1.push(op);
        } else {
          const tmp = 'ope:' + line.key;
          refs.push({ tmp }); opeRef.set(line.key, { tmp });
          const fields = writable(ctx, 'Lignes_OPE', Object.assign({ N_OPE: line.ope, installe_chez: sid }, amount ? amount.fields : {}));
          if (amount && Object.keys(amount.fields).some(col => col in fields)) { counts.montantsEcrits++; neededAmounts = true; }
          phase1.push({ table: 'Lignes_OPE', kind: 'add', tmp, fields, label: `OPE ${line.ope}`, entry: entry.key });
          counts.opesCreees++; changed = true;
        }
      });
      const c = row.cells;
      if (row.state === 'add') {
        const fields = { Projet: c.name.v, Acronyme: c.acr.v || defaultAcronyme(entry.name), Programme: c.prog.v ? programmeId(c.prog.v) : 0,
          Date_debut_Projet: unixOfIso(c.start.v), Date_de_fin_Projet: unixOfIso(c.end.v) };
        // Chaque N° OPE du projet dans son rang : Ligne_OPE (OPE 1), Ligne_OPE_2, _3, _4. Le rang 1 est toujours écrit (liste vide au besoin).
        fields.Ligne_OPE = ['L'];
        row.lines.forEach((line, i) => { neededRank = Math.max(neededRank, line.rank); if (!fields[line.column]) fields[line.column] = ['L']; fields[line.column].push(refs[i]); });
        if (c.stat.v) fields.Statut_operationnel_projet = c.stat.v;
        fields.comentaire_general_Suivi_projet = CREATED_NOTE;
        // Valeur par défaut de la colonne : créerait une ligne Notifications pour chaque projet importé. 0 = aucune.
        fields.remplissage_automatique_Notifications = 0;
        phase2.push({ table: 'Projets', kind: 'add', tmp: 'projet:' + entry.key, fields: writable(ctx, 'Projets', fields), label: entry.name, entry: entry.key });
        counts.projetsCrees++; changed = true;
      } else {
        const project = row.target, fields = {}, before = {};
        const put = (col, value, was) => { fields[col] = value; before[col] = was; };
        if (c.name.state === 'fill') put('Projet', c.name.v, project.Projet == null ? '' : project.Projet);
        if (c.acr.state === 'fill') put('Acronyme', c.acr.v, project.Acronyme == null ? '' : project.Acronyme);
        if (c.prog.state === 'fill') put('Programme', programmeId(c.prog.v), isEmptyRef(project.Programme) ? 0 : project.Programme);
        if (c.start.state === 'fill') put('Date_debut_Projet', unixOfIso(c.start.v), isEmptyDate(project.Date_debut_Projet) ? null : project.Date_debut_Projet);
        if (c.end.state === 'fill') put('Date_de_fin_Projet', unixOfIso(c.end.v), isEmptyDate(project.Date_de_fin_Projet) ? null : project.Date_de_fin_Projet);
        if (c.stat.state === 'fill') put('Statut_operationnel_projet', c.stat.v, project.Statut_operationnel_projet == null ? '' : project.Statut_operationnel_projet);
        // Les lignes à rattacher s'ajoutent à la liste de leur rang (jamais retirées, jamais déplacées d'un rang à l'autre).
        const toAddByColumn = new Map();
        row.lines.forEach((line, i) => {
          const ref = line.needsLink || line.isNew ? refs[i] : null;
          if (ref == null || (typeof ref !== 'object' && refListIds(project[line.column]).includes(ref))) return;
          neededRank = Math.max(neededRank, line.rank);
          pushTo(toAddByColumn, line.column, ref);
        });
        toAddByColumn.forEach((toAdd, column) => put(column, ['L', ...refListIds(project[column]), ...toAdd], project[column] == null ? ['L'] : project[column]));
        const safe = writable(ctx, 'Projets', fields);
        Object.keys(before).forEach(col => { if (!(col in safe)) delete before[col]; });
        if (Object.keys(safe).length) {
          phase2.push({ table: 'Projets', kind: 'update', id: project.id, fields: safe, before, label: ctx.projects.find(p => p.id === project.id).label, entry: entry.key });
          counts.projetsLies++; changed = true;
        }
      }
      if (!changed) counts.dejaAJour++;
    });
    return { phase1, phase2, skipped, notReady, counts, actionCount: phase1.length + phase2.length, neededRank, neededAmounts };
  }

  // Raccourci : le plan d'écriture directement depuis les entrées (sans tableau).
  const buildPlan = args => buildTable(args).plan;

  // ---------------------------------------------------------------------------------------------------------------
  // 7. Écriture par lots, journal, annulation
  // ---------------------------------------------------------------------------------------------------------------

  const stamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '');
  const resolveRefs = (fields, ids) => {
    const out = {};
    Object.keys(fields).forEach(col => {
      const value = fields[col];
      out[col] = Array.isArray(value) ? value.map(item => (item && typeof item === 'object' && item.tmp ? ids.get(item.tmp) : item)) : value;
    });
    return out;
  };
  const toAction = (op, ids) => {
    const fields = resolveRefs(op.fields, ids);
    return op.kind === 'add' ? ['AddRecord', op.table, null, fields] : ['UpdateRecord', op.table, op.id, fields];
  };

  // io = { apply(actions) -> Promise<retValues[]>, addJournal(rows) -> Promise, now() -> Date }
  async function execute(plan, io) {
    const when = io.now ? io.now() : new Date();
    const lot = 'LOT-' + stamp(when), horodatage = when.toISOString();
    const ids = new Map(), result = { lot, ajouts: { Lignes_OPE: [], Projets: [] }, modifs: { Lignes_OPE: [], Projets: [] }, journalise: 0, error: null };
    const listOf = (kind, table) => { if (!result[kind][table]) result[kind][table] = []; return result[kind][table]; }; // une autre table (Depenses_OPE : import du détail)
    const run = async ops => {
      for (let start = 0; start < ops.length; start += CHUNK) {
        const chunk = ops.slice(start, start + CHUNK);
        let returned;
        try { returned = await io.apply(chunk.map(op => toAction(op, ids))); }
        catch (error) { result.error = error; return false; }
        const rows = chunk.map((op, i) => {
          const id = op.kind === 'add' ? Number(returned[i]) : op.id;
          if (op.kind === 'add') { ids.set(op.tmp, id); listOf('ajouts', op.table).push(id); } else listOf('modifs', op.table).push(id);
          return { Lot: lot, Horodatage: horodatage, Table_modifiee: op.table, Ligne: id, Operation: op.kind === 'add' ? 'ajout' : 'modif', Apres: JSON.stringify(resolveRefs(op.fields, ids)), Avant: JSON.stringify(op.before || null), Annule: false };
        });
        try { await io.addJournal(rows); result.journalise += rows.length; }
        catch (error) { result.error = result.error || error; result.journalError = true; return false; }
      }
      return true;
    };
    if (await run(plan.phase1)) await run(plan.phase2);
    return result;
  }

  const sameValue = (a, b) => (a == null && b == null) || JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);
  const rowMatches = (row, expected) => Object.keys(expected).every(col => sameValue(row[col], expected[col]) || (isEmptyRef(row[col]) && isEmptyRef(expected[col]) && !Array.isArray(expected[col])));

  // Annule un lot : remet les champs d'avant sur ce que l'outil a modifié, supprime ce qu'il a créé. Rien n'est touché quand la ligne
  // a changé depuis (modifiée à la main, ou encore utilisée par un autre projet) : elle est rendue dans `skipped` avec la raison.
  function planUndo(journalRows, lot, tables) {
    const rows = journalRows.filter(row => row.Lot === lot && !row.Annule).sort((a, b) => Number(b.id) - Number(a.id));
    const find = (table, id) => (tables[table] || []).find(row => Number(row.id) === Number(id));
    const actions = [], skipped = [], done = [];
    const removeProjects = new Set();
    const restoredRefs = new Map(); // projet -> colonne de rang (Ligne_OPE, Ligne_OPE_2…) -> lignes OPE qu'elle aura une fois les modifications défaites
    rows.filter(r => r.Operation === 'modif').forEach(row => {
      const current = find(row.Table_modifiee, row.Ligne), after = JSON.parse(row.Apres || '{}'), before = JSON.parse(row.Avant || '{}');
      if (!current) { skipped.push({ row, why: 'ligne disparue' }); return; }
      if (!rowMatches(current, after)) { skipped.push({ row, why: 'modifiée depuis l\'import' }); return; }
      actions.push(['UpdateRecord', row.Table_modifiee, Number(row.Ligne), before]); done.push(row.id);
      if (row.Table_modifiee === 'Projets') slotRanks().forEach(rank => {
        const column = slotColumn(rank);
        if (!(column in before)) return;
        if (!restoredRefs.has(Number(row.Ligne))) restoredRefs.set(Number(row.Ligne), new Map());
        restoredRefs.get(Number(row.Ligne)).set(column, refListIds(before[column]));
      });
    });
    rows.filter(r => r.Operation === 'ajout' && r.Table_modifiee === 'Projets').forEach(row => {
      const current = find('Projets', row.Ligne);
      if (!current) { skipped.push({ row, why: 'ligne disparue' }); return; }
      if (!rowMatches(current, JSON.parse(row.Apres || '{}'))) { skipped.push({ row, why: 'modifiée depuis l\'import' }); return; }
      actions.push(['RemoveRecord', 'Projets', Number(row.Ligne)]); removeProjects.add(Number(row.Ligne)); done.push(row.id);
    });
    rows.filter(r => r.Operation === 'ajout' && r.Table_modifiee === 'Lignes_OPE').forEach(row => {
      const current = find('Lignes_OPE', row.Ligne);
      if (!current) { skipped.push({ row, why: 'ligne disparue' }); return; }
      if (!rowMatches(current, JSON.parse(row.Apres || '{}'))) { skipped.push({ row, why: 'modifiée depuis l\'import' }); return; }
      const stillUsed = (tables.Projets || []).some(project => !removeProjects.has(Number(project.id))
        && slotRanks().some(rank => {
          const column = slotColumn(rank), restored = restoredRefs.get(Number(project.id));
          return (restored && restored.has(column) ? restored.get(column) : refListIds(project[column])).includes(Number(row.Ligne));
        }));
      if (stillUsed) { skipped.push({ row, why: 'encore utilisée par un projet' }); return; }
      actions.push(['RemoveRecord', 'Lignes_OPE', Number(row.Ligne)]); done.push(row.id);
    });
    // Lignes ajoutées dans une autre table (détail des dépenses) : supprimées si personne n'y a touché depuis.
    rows.filter(r => r.Operation === 'ajout' && r.Table_modifiee === DETAIL_TABLE).forEach(row => {
      const current = find(DETAIL_TABLE, row.Ligne);
      if (!current) { skipped.push({ row, why: 'ligne disparue' }); return; }
      if (!rowMatches(current, JSON.parse(row.Apres || '{}'))) { skipped.push({ row, why: 'modifiée depuis l\'import' }); return; }
      actions.push(['RemoveRecord', DETAIL_TABLE, Number(row.Ligne)]); done.push(row.id);
    });
    return { actions, skipped, done };
  }

  // Annuler un chargement de fichier : retire les lignes de Import_Financements ajoutées par ce chargement (même Exporte_le).
  // Les projets déjà écrits à partir d'elles ne sont pas défaits : ils ont leur propre lot.
  function planUnload(journalRows, lot, sourceRows) {
    const row = (journalRows || []).find(r => r.Lot === lot && r.Operation === 'chargement' && !r.Annule);
    if (!row) return { actions: [], skipped: [], done: [] };
    let info = {};
    try { info = JSON.parse(row.Apres || '{}'); } catch (err) { info = {}; }
    const stamp = Number(info.exporte_le);
    const ids = stamp ? (sourceRows || []).filter(r => Number(r.Exporte_le) === stamp).map(r => Number(r.id)) : [];
    return { actions: ids.map(id => ['RemoveRecord', SOURCE_TABLE, id]), skipped: [], done: [row.id] };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Lots d'import (Import_Lots) : une ligne par envoi, A valider → Valide (puis Remplace) ou Annule. Fonctions pures : la page applique.
  // ---------------------------------------------------------------------------------------------------------------

  // Identifiant d'un lot : date et heure UTC, à la seconde (« 2026-11-18T12:45:30Z »), comme le script d'envoi.
  function lotIdOf(date) { return new Date(date).toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  // Date d'un identifiant de lot (secondes Unix) : « 2026-11-24T14:05:30Z », ou l'ancien format du script « 2026-11-24 14:05:30 » ; null sinon.
  function lotSeconds(lot) {
    const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})Z?$/.exec(text(lot));
    if (!match) return null;
    const [y, m, d, hh, mm, ss] = match.slice(1).map(Number), stamp = Date.UTC(y, m - 1, d, hh, mm, ss);
    return Number.isFinite(stamp) ? stamp / 1000 : null;
  }

  // Champs de la ligne Import_Lots d'un fichier chargé par le widget (statut « A valider » : rien n'est écrit ailleurs avant validation).
  function newLotFields({ lot, type, source, fichier, recuLe, lignes }) {
    return { Lot: lot, Type: type || LOT_TYPE_ONESHOT, Source: source || 'Fichier', Fichier: fichier || '', Recu_le: recuLe == null ? null : recuLe, Lignes: lignes || 0, Statut: 'A valider' };
  }

  // Lignes de Import_Financements sans Lot (chargements d'avant les lots) : rattachées à UN lot « Reprise unique » (Valide si des écritures
  // existent déjà au journal, sinon A valider). Renvoie null quand tout porte déjà un Lot. Idempotent : le lot existant n'est pas recréé.
  function planLegacyLot(sourceRows, lotRows, journalRows, now) {
    const legacy = (sourceRows || []).filter(row => !text(row.Lot));
    if (!legacy.length) return null;
    const stamps = legacy.map(row => Number(row.Exporte_le)).filter(n => n > 0);
    const lot = lotIdOf(stamps.length ? Math.min(...stamps) * 1000 : (now || new Date()));
    const written = (journalRows || []).some(row => (row.Operation === 'ajout' || row.Operation === 'modif') && !row.Annule);
    const exists = (lotRows || []).some(row => row.Lot === lot);
    return { lot, ids: legacy.map(row => Number(row.id)), create: exists ? null : Object.assign(newLotFields({ lot, recuLe: stamps.length ? Math.min(...stamps) : null, lignes: legacy.length }), { Statut: written ? 'Valide' : 'A valider', Note: 'Chargement antérieur aux lots' }) };
  }

  // Validation (après écriture réussie) des lots à valider dont des lignes sont dans le tableau (reprise unique ou envoi du script) : photo du
  // contrôle, lien vers le lot du journal, et les lots validés d'avant passent en Remplace. Un envoi plus ancien encore à valider, dont plus aucune
  // ligne ne compte (le plus récent remplace tout), passe en Remplace lui aussi : il n'y a plus rien à y relire.
  function planLotValidation(lotRows, { lots, counts, journalLot, now }) {
    const rows = lotRows || [], inTable = new Set(lots || []);
    const todo = rows.filter(row => inTable.has(row.Lot) && row.Statut === 'A valider');
    if (!todo.length) return [];
    const newest = todo.map(row => String(row.Lot)).sort().pop();
    const before = rows.filter(row => row.Statut === 'Valide' && !inTable.has(row.Lot)).sort((a, b) => String(b.Lot).localeCompare(String(a.Lot)));
    const previous = before.length ? before[0].Lot : '';
    const stale = rows.filter(row => row.Statut === 'A valider' && !inTable.has(row.Lot) && String(row.Lot) < newest);
    const seconds = Math.floor((now ? new Date(now) : new Date()).getTime() / 1000);
    const c = counts || {};
    return before.map(row => ['UpdateRecord', LOTS_TABLE, Number(row.id), { Statut: 'Remplace' }])
      .concat(stale.map(row => ['UpdateRecord', LOTS_TABLE, Number(row.id), { Statut: 'Remplace', Note: 'Remplacé par l\'envoi ' + newest + ' avant sa validation' }]))
      .concat(todo.map(row => ['UpdateRecord', LOTS_TABLE, Number(row.id), {
        Statut: 'Valide', Compare_a: previous, Ajoutees: c.add || 0, Modifiees: c.mod || 0, Inchangees: c.same || 0, Absentes: c.gone || 0, Anomalies: c.left || 0, Valide_le: seconds, Lot_journal: journalLot || ''
      }]));
  }

  // Annulation : le lot du fichier chargé (par son Lot) ou les lots écrits (par leur Lot_journal) passent en Annule, avec le motif.
  function planLotCancel(lotRows, { lot, journalLot, note }) {
    return (lotRows || []).filter(row => row.Statut !== 'Annule' && ((lot && row.Lot === lot) || (journalLot && row.Lot_journal === journalLot)))
      .map(row => ['UpdateRecord', LOTS_TABLE, Number(row.id), { Statut: 'Annule', Note: note || '' }]);
  }

  function summarizeLots(journalRows) {
    const lots = new Map();
    (journalRows || []).forEach(row => {
      if (!lots.has(row.Lot)) lots.set(row.Lot, { lot: row.Lot, horodatage: row.Horodatage, ajouts: 0, modifs: 0, annules: 0, total: 0, kind: 'ecriture', info: null });
      const lot = lots.get(row.Lot);
      lot.total++;
      if (row.Operation === 'chargement') { lot.kind = 'chargement'; try { lot.info = JSON.parse(row.Apres || '{}'); } catch (err) { lot.info = {}; } }
      if (row.Annule) lot.annules++;
      else if (row.Operation === 'chargement') { /* compté à part */ }
      else if (row.Operation === 'ajout') lot.ajouts++; else lot.modifs++;
    });
    return Array.from(lots.values()).sort((a, b) => String(b.horodatage).localeCompare(String(a.horodatage)));
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 8. Contrôle des totaux : consommé de l'export = somme du détail des dépenses (Depenses_OPE, export FD02)
  // ---------------------------------------------------------------------------------------------------------------

  function checkTotals(lines, entries, depenses) {
    if (!depenses || !depenses.length) return { available: false, rows: [], projects: [], gaps: 0, total: null };
    const detail = new Map();
    depenses.forEach(row => {
      const k = opeKey(row.Code_operation);
      if (!k) return;
      const d = detail.get(k) || { ae: 0, cp: 0, n: 0 };
      d.ae += toNumber(row.AE_consomme) || 0; d.cp += toNumber(row.CP_consomme) || 0; d.n++;
      detail.set(k, d);
    });
    const exported = new Map();
    lines.forEach(line => {
      const k = opeKey(line.N_OPE);
      const e = exported.get(k) || { ope: text(line.N_OPE), ae: 0, cp: 0, project: text(line.Projet) };
      e.ae += toNumber(line.Consomme_AE) || 0; e.cp += toNumber(line.Consomme_CP) || 0;
      exported.set(k, e);
    });
    const compare = (exportAE, exportCP, d) => {
      if (!d) return { status: 'sans-detail', diffAE: exportAE, diffCP: exportCP };
      const diffAE = exportAE - d.ae, diffCP = exportCP - d.cp;
      return { status: near(diffAE, 0, 0.5) && near(diffCP, 0, 0.5) ? 'ok' : 'ecart', diffAE, diffCP };
    };
    const rows = Array.from(exported, ([k, e]) => {
      const d = detail.get(k);
      return Object.assign({ ope: e.ope, project: e.project, exportAE: e.ae, exportCP: e.cp, detailAE: d ? d.ae : 0, detailCP: d ? d.cp : 0 }, compare(e.ae, e.cp, d));
    }).sort((a, b) => a.ope.localeCompare(b.ope, 'fr'));
    const projects = entries.map(entry => {
      const keys = entry.opes.map(o => o.key);
      const exportAE = sum(keys, k => exported.get(k)?.ae), exportCP = sum(keys, k => exported.get(k)?.cp);
      const detailAE = sum(keys, k => detail.get(k)?.ae), detailCP = sum(keys, k => detail.get(k)?.cp);
      const withDetail = keys.some(k => detail.has(k));
      return Object.assign({ key: entry.key, name: entry.name, exportAE, exportCP, detailAE, detailCP }, compare(exportAE, exportCP, withDetail ? { ae: detailAE, cp: detailCP } : null));
    });
    const extra = Array.from(detail.keys()).filter(k => !exported.has(k));
    const totalExport = { ae: sum(rows, r => r.exportAE), cp: sum(rows, r => r.exportCP) };
    const totalDetail = { ae: sum(rows, r => r.detailAE), cp: sum(rows, r => r.detailCP) };
    const gaps = rows.filter(r => r.status !== 'ok').length;
    return { available: true, rows, projects, extra, gaps, projectGaps: projects.filter(p => p.status !== 'ok').length, total: { export: totalExport, detail: totalDetail, diffAE: totalExport.ae - totalDetail.ae, diffCP: totalExport.cp - totalDetail.cp } };
  }

  global.ImportHistoriqueLogic = {
    SOURCE_TABLE, DETAIL_TABLE, JOURNAL_TABLE, JOURNAL_COLUMNS, SOURCE_COLUMNS, LOTS_TABLE, LOTS_COLUMNS, LOT_TYPE_ONESHOT, YEAR_COLUMNS, STATUS_CLOSED, STATUS_RUNNING, CREATED_NOTE, CHECKS, CHUNK,
    RANK_MODES, DEFAULT_RANK_MODE, slotColumn, placeOpes, orderOpes,
    KIND_LABEL, normalize, opeKey, dice, refListIds, defaultAcronyme, lineKeyOf, isoOfUnix, unixOfIso,
    latestVersions, checkLines, groupProjects, buildContext, matchEntry, matchLabel, effectiveDecision,
    buildTable, similarBad, applyChoice, planFromTable, buildPlan,
    AMOUNT_COLUMNS, AMOUNT_META, CP_COLUMN, aggregateOpe, lotSeconds, convertCell,
    execute, planUndo, planUnload, lotIdOf, newLotFields, planLegacyLot, planLotValidation, planLotCancel, summarizeLots, checkTotals, readExport
  };
})(window);
