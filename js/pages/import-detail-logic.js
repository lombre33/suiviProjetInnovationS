/**
 * Import mensuel du détail des dépenses (export FD02 « Consommation détaillée des AE ») — règles pures (aucun accès au DOM ni à Grist).
 * Testées dans tests/suite-import-detail.js. Aucune donnée réelle : fichiers fictifs.
 *
 * Le fichier (une ligne par objet de gestion : engagement juridique, etc.) est lu dans le navigateur, comparé à la table `Depenses_OPE` que lit le
 * Dashboard, relu par la personne, puis écrit avec le journal d'import (annulable). Le fichier de Grist n'est jamais vidé : on ne sait pas encore si
 * chaque envoi du FD02 reprend tout l'exercice ou seulement le dernier mois (le seul exemple reçu n'a qu'une ligne). Une ligne de Grist se retrouve
 * donc par sa CLÉ (exercice, code opération, type d'objet, numéro d'engagement, nature, sous SO, code analytique, destination), pas par sa position :
 *  - dans le fichier et pas dans Grist : ajoutée ; dans les deux, avec des valeurs qui diffèrent : modifiée (seul ce qui change est écrit) ;
 *  - dans Grist et plus dans le fichier : gardée, comptée à part (jamais supprimée) ;
 *  - une clé répétée dans le fichier : les lignes sont numérotées dans l'ordre du fichier, et la personne en est avertie.
 * Colonnes écrites : celles de Depenses_OPE (créée par le Dashboard à sa première ouverture, ou ici si elle manque).
 */
(function (global) {
  'use strict';

  const L = () => global.ImportHistoriqueLogic;
  const text = value => (value == null ? '' : String(value).trim());
  const toNumber = value => { if (value == null || value === '') return null; const n = Number(value); return Number.isFinite(n) ? n : null; };
  const norm = value => L().normalize(value);
  const TABLE = 'Depenses_OPE';
  const MONEY_TOLERANCE = 0.005;
  const MAX_ERRORS_LISTED = 8;

  // [colonne de Depenses_OPE, en-tête du fichier, type, reconnaissance de l'en-tête (texte normalisé), obligatoire]
  const FIELDS = [
    ['Exercice', 'Exercice', 'Int', h => h === 'exercice', true],
    ['CRB', 'CRB', 'Text', h => h === 'crb'],
    ['SO', 'SO', 'Text', h => h === 'so'],
    ['Sous_SO', 'Sous SO', 'Text', h => h === 'sous so'],
    ['Nature_depense', 'Nature Dépenses', 'Text', h => h === 'nature depenses' || h === 'nature depense'],
    ['Code_operation', 'Code Opération', 'Text', h => h === 'code operation', true],
    ['Reference_externe_operation', 'Référence Externe Opération', 'Text', h => h === 'reference externe operation'],
    ['Code_analytique', 'Code Analytique', 'Text', h => h === 'code analytique'],
    ['Destination', 'Destination', 'Text', h => h === 'destination'],
    ['Libelle_destination', 'Libellé Destination', 'Text', h => h === 'libelle destination'],
    ['Num_EJ', 'N° EJ', 'Text', h => h.startsWith('n ej')],
    ['Type_objet', 'Type Objet', 'Text', h => h === 'type objet'],
    ['Libelle_objet', 'Libellé objet de gestion', 'Text', h => h === 'libelle objet de gestion' || h === 'libelle objet'],
    ['Date_creation', 'Date création Objet', 'Date', h => h.startsWith('date creation')],
    ['Fournisseur', 'Fournisseur', 'Text', h => h === 'fournisseur'],
    ['Etat', 'Etat', 'Text', h => h === 'etat'],
    ['Date_validation', 'Date validation', 'Date', h => h === 'date validation'],
    ['EJ_montant_budgetaire', 'EJ-Montant Budgétaire', 'Numeric', h => h === 'ej montant budgetaire'],
    ['Montant_budgetaire_SF', 'Montant Budgétaire SF', 'Numeric', h => h.startsWith('montant budgetaire')],
    ['AE_consomme_hors_virement', 'AE consommé hors virement', 'Numeric', h => h.startsWith('ae consomme hors')],
    ['AE_consomme_sur_virement', 'AE consommé sur virement', 'Numeric', h => h.startsWith('ae consomme sur')],
    ['AE_consomme', 'Total AE consommé', 'Numeric', h => h === 'total ae consomme', true],
    ['CP_consomme', 'Total CP consommé', 'Numeric', h => h === 'total cp consomme', true],
    ['Domaine', 'Domaine', 'Text', h => h === 'domaine']
  ];
  const typeOf = new Map(FIELDS.map(field => [field[0], field[2]]));
  // Les mêmes colonnes que celles que le Dashboard crée (page-dashboard.js, EXPENSES_COLUMNS) : si la table manque, l'import la crée à l'identique.
  const COLUMNS = FIELDS.map(field => ({ id: field[0], type: field[2] === 'Int' ? 'Int' : field[2] })).concat([{ id: 'Donnees_au', type: 'Date' }]);

  // Lecture du classeur (lignes déjà extraites par XlsxReader). En-têtes reconnus sans accent ni casse, quel que soit leur retour à la ligne ;
  // la date d'extraction vient du titre (« Données au 16/06/2026 11:08:42 »). Une valeur illisible arrête tout (rien n'est écrit à moitié).
  function readFd02(sheetRows, excelDateToUnix) {
    const rows = sheetRows || [];
    const out = { records: [], total: 0, ignored: 0, errors: [], errorCount: 0, missing: [], unknown: [], donneesAu: null, exercices: [], headerRow: 0 };
    const headerAt = rows.slice(0, 40).findIndex(row => row && row.some(cell => norm(cell) === 'exercice') && row.some(cell => norm(cell) === 'code operation'));
    if (headerAt < 0) { out.missing = FIELDS.filter(field => field[4]).map(field => field[1]); out.noHeader = true; return out; }
    out.headerRow = headerAt + 1;
    for (let i = 0; i < headerAt && !out.donneesAu; i++) {
      (rows[i] || []).forEach(cell => {
        const match = /donnees au (\d{1,2}) (\d{1,2}) (\d{4})/.exec(norm(cell));
        if (match && !out.donneesAu) {
          const day = Number(match[1]), month = Number(match[2]), year = Number(match[3]), stamp = Date.UTC(year, month - 1, day);
          if (new Date(stamp).getUTCDate() === day) out.donneesAu = stamp / 1000;
        }
      });
    }
    const header = rows[headerAt], columnOf = new Map(), known = new Set();
    header.forEach((cell, i) => {
      const h = norm(cell);
      if (!h) return;
      const field = FIELDS.find(item => !columnOf.has(item[0]) && item[3](h));
      if (field) { columnOf.set(field[0], i); known.add(i); }
    });
    out.unknown = header.filter((cell, i) => text(cell) && !known.has(i)).map(cell => text(cell).replace(/\s+/g, ' '));
    out.missing = FIELDS.filter(field => field[4] && !columnOf.has(field[0])).map(field => field[1]);
    if (out.missing.length) return out;
    const exercices = new Set();
    for (let i = headerAt + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(cell => cell == null || text(cell) === '')) continue;
      out.total++;
      const record = {};
      let bad = false;
      FIELDS.forEach(([id, label, type]) => {
        if (!columnOf.has(id)) return;
        const cell = row[columnOf.get(id)];
        const converted = L().convertCell(type === 'Int' ? 'Numeric' : type, cell, excelDateToUnix);
        if (converted.skip) return;
        if (converted.error) {
          bad = true; out.errorCount++;
          if (out.errors.length < MAX_ERRORS_LISTED) out.errors.push({ line: i + 1, column: label, value: cell && typeof cell === 'object' && 'excelDate' in cell ? 'date ' + cell.excelDate : String(cell) });
        } else record[id] = type === 'Int' ? Math.round(converted.value) : converted.value;
      });
      if (bad) continue;
      if (!text(record.Code_operation)) { out.ignored++; continue; }
      if (out.donneesAu) record.Donnees_au = out.donneesAu;
      if (record.Exercice != null) exercices.add(record.Exercice);
      out.records.push(record);
    }
    out.exercices = Array.from(exercices).sort((a, b) => a - b);
    return out;
  }

  // Clé d'une ligne de dépenses (voir l'en-tête) ; la 2e ligne, la 3e… qui porteraient la même clé reçoivent #2, #3… dans l'ordre où elles arrivent.
  const keyBase = record => [record.Exercice, L().opeKey(record.Code_operation), record.Type_objet, record.Num_EJ, record.Nature_depense, record.Sous_SO, record.Code_analytique, record.Destination].map(norm).join('|');
  function withKeys(records) {
    const seen = new Map();
    return (records || []).map(record => {
      const base = keyBase(record), n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      return Object.assign({}, record, { _key: n > 1 ? base + '#' + n : base, _dup: n > 1 });
    });
  }

  // Valeur comparable d'une colonne : vide = '' (texte), 0 (montant, entier, date).
  const comparable = (type, value) => (type === 'Text' ? text(value) : (toNumber(value) || 0));
  const same = (type, a, b) => (type === 'Numeric' ? Math.abs(comparable(type, a) - comparable(type, b)) <= MONEY_TOLERANCE : comparable(type, a) === comparable(type, b));
  const emptyValue = type => (type === 'Text' ? '' : type === 'Date' ? null : 0);

  // Plan d'écriture : `records` (fichier), `existing` (lignes de Depenses_OPE), `opeKeys` (clés des N° OPE de Lignes_OPE, pour signaler les dépenses sans ligne).
  // Renvoie les écritures (au format de ImportHistoriqueLogic.execute), les comptes et ce que la relecture doit montrer.
  function planDetail({ records, existing, opeKeys }) {
    const file = withKeys(records), have = withKeys(existing);
    const byKey = new Map(have.map(row => [row._key, row]));
    const ops = [], changes = [], seen = new Set();
    let unchanged = 0;
    file.forEach(record => {
      seen.add(record._key);
      const old = byKey.get(record._key);
      if (!old) {
        const fields = {};
        FIELDS.forEach(([id]) => { if (id in record) fields[id] = record[id]; });
        if (record.Donnees_au) fields.Donnees_au = record.Donnees_au;
        ops.push({ table: TABLE, kind: 'add', tmp: 'dep:' + record._key, fields, label: text(record.Code_operation) });
        changes.push({ kind: 'add', ope: text(record.Code_operation), object: text(record.Libelle_objet) || text(record.Num_EJ), diffs: [] });
        return;
      }
      const fields = {}, before = {}, diffs = [];
      FIELDS.forEach(([id, label, type]) => {
        if (!(id in record) && !(id in old)) return;
        if (same(type, record[id], old[id])) return;
        fields[id] = id in record ? record[id] : emptyValue(type); before[id] = old[id] == null ? emptyValue(type) : old[id];
        diffs.push({ id, label, type, before: old[id], after: fields[id] });
      });
      if (!diffs.length) { unchanged++; return; }
      if (record.Donnees_au) { fields.Donnees_au = record.Donnees_au; before.Donnees_au = old.Donnees_au == null ? null : old.Donnees_au; }
      ops.push({ table: TABLE, kind: 'update', id: Number(old.id), fields, before, label: text(record.Code_operation) });
      changes.push({ kind: 'mod', ope: text(record.Code_operation), object: text(record.Libelle_objet) || text(record.Num_EJ), diffs });
    });
    const exercices = new Set(file.map(record => record.Exercice));
    const absent = have.filter(row => !seen.has(row._key) && exercices.has(row.Exercice));
    const known = opeKeys || new Set();
    const noOpe = Array.from(new Set(file.map(record => L().opeKey(record.Code_operation)).filter(key => key && known.size && !known.has(key))));
    return {
      phase1: ops, phase2: [], changes,
      counts: { lignes: file.length, ajoutees: changes.filter(c => c.kind === 'add').length, modifiees: changes.filter(c => c.kind === 'mod').length, inchangees: unchanged, absentes: absent.length, sansOpe: noOpe.length, cles: file.filter(r => r._dup).length },
      noOpe, absent: absent.map(row => Number(row.id)), actionCount: ops.length
    };
  }

  global.ImportDetailLogic = { TABLE, FIELDS, COLUMNS, typeOf, readFd02, withKeys, keyBase, planDetail };
})(window);
