/**
 * Envois du script UB Invest (« lots ») — règles pures (aucun accès au DOM ni à Grist). Testées dans tests/suite-import-lots.js.
 *
 * Le script envoie TOUTES les lignes du reporting à chaque fois, par le formulaire public, avec le même `Lot` (date et heure UTC de l'envoi) et
 * `Lignes du lot` (leur nombre). Ces règles disent, pour la page Import financier (Alt+Maj+I) :
 *  - quels envois sont nouveaux (une ligne Import_Lots « A valider » est créée à leur première vue) ;
 *  - lesquels comptent dans le tableau de contrôle (ni un envoi refusé ou annulé, ni un envoi incomplet, ni l'essai) ;
 *  - ce qu'un envoi change par rapport au dernier envoi validé (nouvelles, modifiées, disparues, inchangées) ;
 *  - les écritures de montants qu'un plan s'apprête à faire sur Lignes_OPE, présentées une par une à la relecture.
 * Contrat de la table Import_Lots : /mnt/project-files/imports/import-lots-contrat.md.
 */
(function (global) {
  'use strict';

  const L = () => global.ImportHistoriqueLogic;
  const text = value => (value == null ? '' : String(value).trim());
  const toNumber = value => { if (value == null || value === '') return null; const n = Number(value); return Number.isFinite(n) ? n : null; };
  const near = (a, b, tolerance = 0.01) => Math.abs(a - b) <= tolerance;

  const TYPE_MACRO = 'Macro';
  const SOURCE_SCRIPT = 'Script';
  const COUNT_FIELD = 'Lignes_du_lot';
  const isTrial = lot => /^essai/i.test(text(lot));

  // « 2026-11-24T14:05:30Z » (format du script et du widget) -> secondes Unix ; « 2026-11-24 14:05:30 » (ancien format du script) lu tel quel.
  const lotTime = lot => L().lotSeconds(lot);

  // Un groupe par valeur de `Lot` de la table d'arrivée : ses lignes, leur nombre, le nombre annoncé par le script (« Lignes du lot »).
  function lotGroups(sourceRows) {
    const groups = new Map();
    (sourceRows || []).forEach(row => {
      const lot = text(row.Lot);
      if (!lot) return;
      if (!groups.has(lot)) groups.set(lot, { lot, ids: [], count: 0, expected: 0, exporteLe: null });
      const group = groups.get(lot);
      group.ids.push(Number(row.id)); group.count++;
      const announced = toNumber(row[COUNT_FIELD]);
      if (announced && announced > group.expected) group.expected = announced;
      const stamp = toNumber(row.Exporte_le);
      if (stamp && (group.exporteLe == null || stamp < group.exporteLe)) group.exporteLe = stamp;
    });
    groups.forEach(group => {
      group.trial = isTrial(group.lot);
      group.incomplete = group.expected > group.count;
      group.missing = group.incomplete ? group.expected - group.count : 0;
      group.time = lotTime(group.lot) || group.exporteLe;
    });
    return groups;
  }

  // Nouveaux envois : une ligne Import_Lots par valeur de Lot inconnue (« Macro », « Script », A valider) ; la ligne d'un envoi encore « A valider »
  // est tenue à jour (nombre de lignes, motif d'incomplétude) tant que le script finit d'envoyer. Rien pour l'essai ni pour les lignes sans Lot.
  function planDiscovery(sourceRows, lotRows, now) {
    const known = new Map((lotRows || []).map(row => [text(row.Lot), row]));
    const actions = [], created = [], updated = [];
    const seconds = Math.floor((now ? new Date(now) : new Date()).getTime() / 1000);
    const noteOf = group => (group.incomplete ? `Envoi incomplet : ${group.count} lignes reçues sur ${group.expected}` : '');
    Array.from(lotGroups(sourceRows).values()).filter(group => !group.trial).sort((a, b) => String(a.lot).localeCompare(String(b.lot))).forEach(group => {
      const row = known.get(group.lot);
      if (!row) {
        actions.push(['AddRecord', L().LOTS_TABLE, null, Object.assign(L().newLotFields({ lot: group.lot, type: TYPE_MACRO, source: SOURCE_SCRIPT, recuLe: group.time || seconds, lignes: group.count }), { Note: noteOf(group) })]);
        created.push(group.lot);
      } else if (row.Statut === 'A valider' && (Number(row.Lignes) !== group.count || text(row.Note) !== noteOf(group))) {
        actions.push(['UpdateRecord', L().LOTS_TABLE, Number(row.id), { Lignes: group.count, Note: noteOf(group) }]);
        updated.push(group.lot);
      }
    });
    return { actions, created, updated };
  }

  // Les lignes qui comptent pour le tableau de contrôle : celles d'un envoi refusé ou annulé, l'essai, et un envoi encore incomplet qui n'est pas
  // validé ne comptent pas (un export à moitié reçu ferait croire à des lignes disparues). Une ligne sans Lot (chargement d'avant les lots) compte.
  function activeRows(sourceRows, lotRows) {
    const status = new Map((lotRows || []).map(row => [text(row.Lot), row.Statut]));
    const groups = lotGroups(sourceRows);
    return (sourceRows || []).filter(row => {
      const lot = text(row.Lot);
      if (!lot) return true;
      const group = groups.get(lot), state = status.get(lot);
      if (group.trial || state === 'Refuse' || state === 'Annule') return false;
      return !(group.incomplete && state !== 'Valide');
    });
  }

  // Explication d'un envoi mis de côté, pour la liste des envois (« essai », « incomplet », …) ; chaîne vide quand il compte.
  function excludedReason(group, state) {
    if (group.trial) return 'essai : ignoré';
    if (state === 'Refuse') return 'refusé';
    if (state === 'Annule') return 'annulé';
    if (group.incomplete && state !== 'Valide') return `incomplet : ${group.count} lignes sur ${group.expected}, relance l'envoi en entier`;
    return '';
  }

  // Dernier envoi validé (le plus récent par son Lot) : l'envoi qu'un nouveau « remplace » et auquel on le compare.
  function referenceLot(lotRows) {
    const valid = (lotRows || []).filter(row => row.Statut === 'Valide').sort((a, b) => String(b.Lot).localeCompare(String(a.Lot)));
    return valid.length ? valid[0].Lot : '';
  }

  // Colonnes comparées d'un envoi à l'autre (les valeurs qui font bouger Grist ou le Dashboard).
  const COMPARED = [
    ['Montant_attribue', 'Montant attribué', 'n'], ['Attribue_2022', 'Attribué 2022', 'n'], ['Attribue_2023', 'Attribué 2023', 'n'], ['Attribue_2024', 'Attribué 2024', 'n'],
    ['Attribue_2025', 'Attribué 2025', 'n'], ['Attribue_2026', 'Attribué 2026', 'n'], ['Consomme_AE', 'Consommé AE', 'n'], ['Consomme_CP', 'Consommé CP', 'n'],
    ['Disponible_AE', 'Disponible AE', 'n'], ['Disponible_CP', 'Disponible CP', 'n'], ['Date_debut', 'Date début', 'd'], ['Date_fin', 'Date fin', 'd'],
    ['Statuts', 'Statuts', 't'], ['N_decision', 'N° décision', 't'], ['Libelle_operation', 'Libellé', 't']
  ];
  const sameCell = (kind, a, b) => {
    if (kind === 'n') { const x = toNumber(a), y = toNumber(b); return (x == null && y == null) || (x != null && y != null && near(x, y)); }
    if (kind === 'd') return (toNumber(a) || 0) === (toNumber(b) || 0);
    return text(a) === text(b);
  };

  // Un envoi contre un autre (lignes des deux envois, une version par ligne de financement) : nouvelles, modifiées (avec le détail avant / après),
  // disparues (dans l'ancien seulement), inchangées. `before` vide : première réception, tout est nouveau.
  function compareLots(afterRows, beforeRows) {
    const versions = rows => new Map(L().latestVersions(rows).lines.map(line => [line._key, line]));
    const after = versions(afterRows), before = versions(beforeRows);
    const out = { added: [], changed: [], gone: [], same: 0 };
    after.forEach((line, key) => {
      const old = before.get(key);
      if (!old) { out.added.push({ key, ope: line.N_OPE, project: line.Projet, financeur: line.Financeur }); return; }
      const diffs = COMPARED.filter(([id, , kind]) => !sameCell(kind, old[id], line[id])).map(([id, label, kind]) => ({ id, label, kind, before: old[id], after: line[id] }));
      if (diffs.length) out.changed.push({ key, ope: line.N_OPE, project: line.Projet, financeur: line.Financeur, diffs }); else out.same++;
    });
    before.forEach((line, key) => { if (!after.has(key)) out.gone.push({ key, ope: line.N_OPE, project: line.Projet, financeur: line.Financeur }); });
    return out;
  }

  const rowsOfLot = (sourceRows, lot) => (sourceRows || []).filter(row => text(row.Lot) === text(lot));

  // La liste des envois pour la page, du plus récent au plus ancien : statut, tailles, mise de côté, et pour chaque envoi à valider ses écarts
  // avec le dernier envoi validé (comptés seulement : le détail se lit dans la comparaison).
  function lotCards(sourceRows, lotRows, options) {
    const groups = lotGroups(sourceRows), reference = referenceLot(lotRows), referenceRows = reference ? rowsOfLot(sourceRows, reference) : [];
    const withDiff = !options || options.withDiff !== false;
    const known = new Map((lotRows || []).map(row => [text(row.Lot), row]));
    const lots = new Set([...groups.keys(), ...known.keys()]);
    return Array.from(lots).filter(lot => !isTrial(lot)).sort((a, b) => String(b).localeCompare(String(a))).map(lot => {
      const row = known.get(lot) || null, group = groups.get(lot) || { lot, count: 0, expected: 0, incomplete: false, trial: false, time: lotTime(lot) };
      const state = row ? row.Statut : 'A valider';
      const card = {
        lot, id: row ? Number(row.id) : null, status: state, type: row ? row.Type : TYPE_MACRO, source: row ? row.Source : SOURCE_SCRIPT, file: row ? text(row.Fichier) : '',
        count: group.count, time: group.time || (row && toNumber(row.Recu_le)) || null, note: row ? text(row.Note) : '', compareTo: row ? text(row.Compare_a) : '',
        excluded: excludedReason(group, state), incomplete: group.incomplete, inTable: !!row && !!group.count
      };
      if (withDiff && state === 'A valider' && !card.excluded && group.count) {
        const diff = compareLots(rowsOfLot(sourceRows, lot), referenceRows);
        card.diff = { added: diff.added.length, changed: diff.changed.length, gone: diff.gone.length, same: diff.same, first: !reference };
      }
      if (row && state !== 'A valider') card.photo = { added: row.Ajoutees || 0, changed: row.Modifiees || 0, gone: row.Absentes || 0, anomalies: row.Anomalies || 0, same: row.Inchangees || 0 };
      return card;
    });
  }

  // Refus d'un envoi : il ne compte plus (ni tableau ni Dashboard) ; le motif reste dans Import_Lots.
  function planRefusal(lotRows, lot, note) {
    return (lotRows || []).filter(row => text(row.Lot) === text(lot) && row.Statut === 'A valider')
      .map(row => ['UpdateRecord', L().LOTS_TABLE, Number(row.id), { Statut: 'Refuse', Note: note || 'Refusé à la relecture' }]);
  }
  // Un envoi refusé par erreur : il redevient « A valider ».
  function planRestore(lotRows, lot) {
    return (lotRows || []).filter(row => text(row.Lot) === text(lot) && row.Statut === 'Refuse')
      .map(row => ['UpdateRecord', L().LOTS_TABLE, Number(row.id), { Statut: 'A valider', Note: '' }]);
  }

  // Les écritures de montants du plan (une par ligne OPE) pour la relecture : ce qui change, valeur d'avant -> valeur d'après. Les colonnes de
  // suivi (date de mise à jour, lot) ne comptent pas comme un changement.
  function amountChanges(plan) {
    const columns = L().AMOUNT_COLUMNS, labels = new Map(columns.map(col => [col.id, col]));
    const meta = new Set(L().AMOUNT_META);
    const out = [];
    (plan.phase1 || []).filter(op => op.table === 'Lignes_OPE').forEach(op => {
      const changes = Object.keys(op.fields).filter(id => labels.has(id) && !meta.has(id)).map(id => ({
        id, label: labels.get(id).label || id, type: labels.get(id).type, before: op.kind === 'add' ? null : (op.before ? op.before[id] : null), after: op.fields[id]
      }));
      if (changes.length) out.push({ ope: op.label.replace(/^OPE /, ''), entry: op.entry, kind: op.kind, changes });
    });
    return out;
  }

  global.ImportLotsLogic = {
    TYPE_MACRO, SOURCE_SCRIPT, COUNT_FIELD, COMPARED, isTrial, lotTime, lotGroups, planDiscovery, activeRows, excludedReason, referenceLot, compareLots, rowsOfLot,
    lotCards, planRefusal, planRestore, amountChanges
  };
})(window);
