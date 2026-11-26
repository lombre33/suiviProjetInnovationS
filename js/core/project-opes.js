/* Plusieurs OPE par projet (demande d'Antoine du 24/11/2026) : noms des colonnes de Projets, lecture et totaux.
 *
 * Un projet a de une à quatre OPE. L'objet « ligne OPE » reste une ligne de Lignes_OPE ; c'est la table Projets qui porte l'affectation
 * (aucune nouvelle table, choix d'Antoine) :
 *  - OPE 1 : les colonnes historiques, inchangées (Ligne_OPE, Action_Ligne_OPE_a_faire, Commentaire_ligne_OPE, cAAAA_M10/M20/M30) ;
 *  - OPE 2, 3 et 4 : les mêmes colonnes suffixées _2, _3, _4 (Ligne_OPE_2, c2026_M10_Fonctionnement_2…), soit 15 colonnes saisies par OPE
 *    plus une colonne calculée « installée chez » (Ligne_OPE_installe_chez_2 = formule $Ligne_OPE_2.installe_chez, ReferenceList vers
 *    Structures, comme Ligne_OPE_installe_chez de l'OPE 1 ; demande d'Antoine du 26/11/2026 : les OPE d'un projet sont le plus souvent dans
 *    des structures différentes). Les 16 sont créées par le widget à l'enregistrement du premier projet qui en a besoin
 *    (CoreOpes.missingColumns + CoreGrist.ensureColumns). Le widget n'écrit JAMAIS la colonne calculée : columnsOf() ne la contient pas.
 *
 * Ce module ne fait que nommer, lire et additionner (aucun accès au document) : la modale projet, le Dashboard et le calcul des montants
 * l'utilisent pour ne jamais recopier le schéma des suffixes. Un montant de rang 2 à 4 absent (colonne pas encore créée) vaut 0.
 */
(function (global) {
  'use strict';

  const MAX = 4;
  const YEARS = Object.freeze([2026, 2027, 2028, 2029]);
  const NATURES = Object.freeze([
    Object.freeze({ key: 'F', mass: 'M10_Fonctionnement', label: 'Fonctionnement', detail: 'Details_depense_s_Fonctionnement' }),
    Object.freeze({ key: 'I', mass: 'M20_Investissement', label: 'Investissement', detail: 'Details_depense_s_Investissement' }),
    Object.freeze({ key: 'P', mass: 'M30_Personnel', label: 'Personnel', detail: 'Details_depense_s_Personnel' })
  ]);
  // Valeurs de la colonne Choice Action_Ligne_OPE_a_faire (les mêmes que OPE_OPTIONS dans la modale projet).
  const ACTION_CHOICES = Object.freeze(['Creation de ligne', 'Prolongation de ligne', 're-Abondement de ligne', 'à determiner']);
  const DEFAULT_ACTION = 'à determiner';
  const BASE = Object.freeze({ ligne: 'Ligne_OPE', action: 'Action_Ligne_OPE_a_faire', comment: 'Commentaire_ligne_OPE', installe: 'Ligne_OPE_installe_chez' });

  const num = value => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
  const text = value => (value == null ? '' : String(value));
  const ranks = () => Array.from({ length: MAX }, (_, i) => i + 1);
  const suffix = rank => (rank > 1 ? `_${rank}` : '');
  const natureOf = nature => (typeof nature === 'object' ? nature : NATURES.find(n => n.key === nature || n.mass === nature) || NATURES[nature]);

  const ligneColumn = rank => BASE.ligne + suffix(rank);
  const actionColumn = rank => BASE.action + suffix(rank);
  const commentColumn = rank => BASE.comment + suffix(rank);
  // nature : l'objet de NATURES, sa clé (F, I, P), sa masse (M10_Fonctionnement) ou son index.
  const amountColumn = (rank, year, nature) => `c${year}_${natureOf(nature).mass}${suffix(rank)}`;
  // Structures où la ligne OPE de ce rang est installée : colonne CALCULÉE de Projets (formule Grist), lue par le widget, jamais écrite.
  const installeColumn = rank => BASE.installe + suffix(rank);

  // Colonne d'une OPE 2 à 4 → colonne d'origine (Ligne_OPE_3 → Ligne_OPE) : les bulles d'aide, les types et les listes de choix de
  // l'OPE 1 servent à toutes. Une autre colonne est rendue telle quelle.
  function baseColumn(colId) {
    const match = /^(.*)_([2-4])$/.exec(text(colId));
    if (!match) return text(colId);
    const base = match[1];
    return (base === BASE.ligne || base === BASE.action || base === BASE.comment || base === BASE.installe || /^c\d{4}_M\d0_/.test(base)) ? base : text(colId);
  }

  // Colonnes SAISIES (dans l'ordre : ligne, action, commentaire, puis les montants année par année) d'une OPE : ce que la modale écrit.
  // La colonne calculée installeColumn(rank) n'y figure pas (jamais écrite) ; createdColumnsOf() la rajoute pour la création.
  function columnsOf(rank) {
    const list = [ligneColumn(rank), actionColumn(rank), commentColumn(rank)];
    YEARS.forEach(year => NATURES.forEach(nature => list.push(amountColumn(rank, year, nature))));
    return list;
  }
  // Toutes les colonnes que le widget crée pour une OPE de rang 2 à 4 (saisies + calculée « installée chez »).
  const createdColumnsOf = rank => columnsOf(rank).concat(installeColumn(rank));

  // Définitions à passer à CoreGrist.ensureColumns('Projets', …) pour créer les colonnes d'une OPE 2 à 4 (16 : 15 saisies + la calculée). `describe(colId)` rend la
  // description de la colonne d'origine (bulles d'aide), quand on la connaît.
  function columnDefinitions(rank, describe) {
    const withHelp = (id, def) => {
      const description = describe ? text(describe(baseColumn(id))) : '';
      return Object.assign({ id, isFormula: false }, def, description ? { description } : {});
    };
    const defs = [
      // `display` : sans colonne affichée Grist montrerait le numéro de ligne (voir CoreGrist, applyReferenceDisplay) ; on recopie le réglage de l'OPE 1.
      withHelp(ligneColumn(rank), { type: 'RefList:Lignes_OPE', display: { like: BASE.ligne, column: 'N_OPE' } }),
      // Juste après la ligne : la formule en dépend, et les actions partent dans cet ordre dans un seul applyUserActions groupé.
      withHelp(installeColumn(rank), { type: 'RefList:Structures', isFormula: true, formula: `$${ligneColumn(rank)}.installe_chez`, display: { like: BASE.installe, column: 'Acronyme' } }),
      withHelp(actionColumn(rank), { type: 'Choice', widgetOptions: JSON.stringify({ choices: ACTION_CHOICES.slice() }) }),
      withHelp(commentColumn(rank), { type: 'Text' })
    ];
    YEARS.forEach(year => NATURES.forEach(nature => defs.push(withHelp(amountColumn(rank, year, nature), { type: 'Numeric' }))));
    return defs;
  }

  // Identifiants d'une valeur ReferenceList de Grist (['L', 3, 5]), d'une référence simple (3) ou d'un objet {id}.
  function refIds(value) {
    const list = Array.isArray(value) ? value : (value == null || value === '' ? [] : [value]);
    return list.filter(v => v !== 'L' && v != null && v !== '' && v !== 0)
      .map(v => (typeof v === 'object' ? (v.id ?? v.rowId) : v)).map(Number).filter(n => Number.isFinite(n) && n > 0);
  }

  // Ce que Projets dit de l'OPE de ce rang : {rank, ligneIds, action, comment, amounts: {F: [4 années], I: […], P: […]}}.
  function read(project, rank) {
    const row = project || {};
    const amounts = {};
    NATURES.forEach(nature => { amounts[nature.key] = YEARS.map(year => num(row[amountColumn(rank, year, nature)])); });
    return {
      rank,
      ligneIds: refIds(row[ligneColumn(rank)]),
      action: text(row[actionColumn(rank)]),
      comment: text(row[commentColumn(rank)]),
      amounts
    };
  }

  const sum = list => list.reduce((total, value) => total + value, 0);
  const total = ope => sum(NATURES.map(nature => sum(ope.amounts[nature.key])));

  // L'OPE existe-t-elle vraiment ? Une action « à déterminer » seule ne compte pas : c'est la valeur d'une OPE tout juste ajoutée.
  function hasData(ope) {
    return ope.ligneIds.length > 0 || ope.comment.trim() !== '' || total(ope) !== 0 || (ope.action !== '' && ope.action !== DEFAULT_ACTION);
  }

  // Nombre d'OPE à afficher pour ce projet : le plus haut rang utilisé (au moins 1).
  function count(project) {
    let highest = 1;
    ranks().forEach(rank => { if (rank > 1 && hasData(read(project, rank))) highest = rank; });
    return highest;
  }

  // Toutes les lignes OPE du projet (OPE 1 à 4, sans doublon) : c'est elles que le Dashboard rattache aux dépenses.
  function ligneIds(project) {
    const seen = new Set();
    ranks().forEach(rank => read(project, rank).ligneIds.forEach(id => seen.add(id)));
    return Array.from(seen);
  }

  // Montant attribué d'une année (n'importe laquelle, y compris avant 2026) sur les OPE demandées (toutes par défaut).
  function yearAmount(project, year, onlyRanks) {
    const row = project || {};
    return sum((onlyRanks || ranks()).map(rank => sum(NATURES.map(nature => num(row[amountColumn(rank, year, nature)])))));
  }

  // Total croisé d'une liste d'OPE (forme de read()) : par nature × année, par année, par OPE et au global.
  function combine(opes) {
    const byNature = {};
    NATURES.forEach(nature => { byNature[nature.key] = YEARS.map((year, i) => sum(opes.map(ope => ope.amounts[nature.key][i]))); });
    const byYear = YEARS.map((year, i) => sum(NATURES.map(nature => byNature[nature.key][i])));
    return { opes, byNature, byYear, byRank: opes.map(total), grand: sum(byYear) };
  }

  // Total croisé du projet : les OPE 1 à `upTo` (toutes par défaut) lues dans la ligne de Projets.
  function totals(project, upTo) {
    return combine(ranks().filter(rank => rank <= (upTo || MAX)).map(rank => read(project, rank)));
  }

  // Colonnes à créer dans Projets pour les OPE de rang 2 à `upTo` : celles que `existing` (Set de colId connus) n'a pas encore.
  function missingColumns(existing, upTo, describe) {
    const known = existing || new Set();
    const defs = [];
    ranks().filter(rank => rank > 1 && rank <= (upTo || MAX)).forEach(rank => {
      columnDefinitions(rank, describe).forEach(def => { if (!known.has(def.id)) defs.push(def); });
    });
    return defs;
  }

  // Colonnes référence des OPE 2 à `upTo` avec leur colonne affichée : pour régler l'affichage de celles créées avant que le widget le fasse.
  const referenceDisplaySpecs = upTo => ranks().filter(rank => rank > 1 && rank <= (upTo || MAX)).flatMap(rank => columnDefinitions(rank).filter(def => def.display));
  // Au mieux : règle la colonne affichée de ces colonnes dans Grist (jamais bloquant pour l'enregistrement qui l'appelle).
  async function ensureDisplays(upTo) {
    if (!global.CoreGrist || typeof global.CoreGrist.ensureReferenceDisplay !== 'function') return [];
    try { return await global.CoreGrist.ensureReferenceDisplay('Projets', referenceDisplaySpecs(upTo)); }
    catch (error) { console.warn('Colonne affichée des colonnes d\'OPE non réglée :', error.message); return []; }
  }

  // Type d'une ligne OPE (demande d'Antoine du 24/11/2026) : colonne Choice de Lignes_OPE, créée par le widget au premier enregistrement qui en a besoin.
  const LINE_TYPE_COLUMN = 'Type_ligne_OPE';
  const LINE_TYPES = Object.freeze(['Reversement', 'RH', 'Projet']);
  const lineTypeColumn = () => ({
    id: LINE_TYPE_COLUMN, label: 'Type de ligne OPE', type: 'Choice', isFormula: false, widgetOptions: JSON.stringify({ choices: LINE_TYPES.slice() }),
    description: 'Nature de la ligne OPE : Reversement (convention de reversement à un partenaire), RH (personnel) ou Projet (dépenses du projet).'
  });

  global.CoreOpes = {
    MAX, YEARS, NATURES, ACTION_CHOICES, DEFAULT_ACTION, LINE_TYPE_COLUMN, LINE_TYPES, lineTypeColumn,
    ranks, ligneColumn, actionColumn, commentColumn, amountColumn, installeColumn, baseColumn, columnsOf, createdColumnsOf, columnDefinitions, missingColumns, referenceDisplaySpecs, ensureDisplays,
    refIds, read, total, hasData, count, ligneIds, yearAmount, combine, totals
  };
}(window));
