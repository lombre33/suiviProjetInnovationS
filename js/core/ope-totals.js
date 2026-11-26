/**
 * Totaux de Projets (formules Grist) : OPE 2 à 4 et année 2029 — demandes d'Antoine du 26/11/2026
 * (« il faut que les colonnes de totaux existantes restent les bonnes, donc adapter les formules » ; « il faut prévoir les totaux pour 2029,
 * projet classique et projet avec plusieurs OPE »).
 *
 * Les formules d'origine de Projets (Total_2026/27/28, Total_Fonctionnement/investissement/Personnel, Montant_attribue_Total) ne somment que
 * l'OPE 1 et que 2026-2028 ; Total_2029 vaut None. Dès qu'un projet porte une OPE 2 à 4 (colonnes suffixées _2/_3/_4 créées par le widget,
 * js/core/project-opes.js) ou un montant 2029, ces totaux seraient faux : la page Installation des fonds, les notifications, Export_VP...
 * les lisent. Le widget réécrit donc ces 8 formules pour y ajouter les OPE existantes ET 2029 (Total_2029 est calculée ; les cumuls
 * passent de 2026-2028 à 2026-2029). Garde-fous :
 *  - seules les formules RECONNUES sont réécrites : celles qui ne lisent que les colonnes d'OPE 1 attendues, avec le seul vocabulaire des
 *    formules d'origine (somme, « si 0 alors vide »), et `return None` pour Total_2029. Une formule personnalisée n'est jamais touchée
 *    (elle est signalée) ;
 *  - la formule d'origine est conservée telle quelle en commentaire (lignes « #| »), dans un bloc délimité : pour revenir en arrière,
 *    la remettre à la place du bloc ;
 *  - les réécritures partent dans un seul applyUserActions : tout ou rien, jamais des totaux à moitié adaptés ;
 *  - seules les OPE dont les colonnes (2026-2029) existent sont ajoutées, et 2029 n'est ajouté que si ses trois colonnes d'OPE 1 existent ;
 *  - rejouable : une formule déjà adaptée à ces OPE n'est pas réécrite ; un nouveau rang l'étend à partir de la formule d'origine
 *    gardée en commentaire (une formule adaptée avant l'ajout de 2029 reçoit 2029) ; une formule marquée puis modifiée à la main n'est
 *    plus touchée ;
 *  - au mieux : un refus (droits de structure) ne bloque jamais l'enregistrement, il est signalé une fois par session.
 */
(function (global) {
  'use strict';

  const TABLE = 'Projets';
  const YEARS = Object.freeze([2026, 2027, 2028]); // années des formules d'origine
  const YEAR_2029 = 2029;
  const HEAD = '# >>> Widget InnovationS : OPE 1 à ';
  const MARK_2029 = ', 2029 inclus';
  const TAIL = '# <<<';
  const ORIGINAL = '#| ';

  const opes = () => global.CoreOpes;
  const normalize = text => String(text == null ? '' : text).replace(/\r\n?/g, '\n').replace(/\s+$/, '');

  // Les 8 colonnes calculées : ce que l'OPE 1 somme à l'origine (`legacy`, année × nature), ce qu'elle somme avec 2029 (`specs`), et si elles
  // rendent "" à 0. Total_2029 n'a pas d'origine à sommer : sa formule d'origine est `return None`.
  function targets() {
    const natures = opes().NATURES;
    const perYear = year => natures.map(nature => ({ year, nature }));
    const target = (colId, legacy, extra, emptyIfZero) => ({ colId, legacy, specs: legacy.concat(extra), has2029: extra.length > 0, emptyIfZero });
    const result = YEARS.map(year => target(`Total_${year}`, perYear(year), [], true));
    result.push(target('Total_2029', [], perYear(YEAR_2029), true));
    const byNature = { F: 'Total_Fonctionnement', I: 'Total_investissement', P: 'Total_Personnel' };
    natures.forEach(nature => result.push(target(byNature[nature.key], YEARS.map(year => ({ year, nature })), [{ year: YEAR_2029, nature }], true)));
    result.push(target('Montant_attribue_Total', [].concat(...YEARS.map(perYear)), perYear(YEAR_2029), false));
    return result;
  }
  // Colonnes de l'OPE `rank` lues par la formule : celles d'origine, et avec 2029 si `with2029`.
  const specsOf = (target, with2029) => (with2029 ? target.specs : target.legacy);
  const columnsOf = (target, rank, with2029 = true) => specsOf(target, with2029).map(item => opes().amountColumn(rank, item.year, item.nature));

  // Colonnes de Projets lues par une formule : `rec.Col` ou `$Col`, commentaires exclus.
  function code(formula) {
    return normalize(formula).split('\n').map(line => (line.trim().charAt(0) === '#' ? '' : line.replace(/#.*$/, ''))).join('\n');
  }
  function referencedColumns(formula) {
    const found = new Set();
    code(formula).replace(/(?:rec\.|\$)([A-Za-z_]\w*)/g, (all, name) => { found.add(name); return all; });
    return found;
  }
  // Rien d'autre que le vocabulaire des formules d'origine : somme, comparaison à 0, « si … alors "" sinon valeur ».
  function onlySums(formula) {
    let rest = code(formula).replace(/(?:rec\.|\$)[A-Za-z_]\w*/g, 'X');
    const token = /^(?:\s+|X|if\b|else\b|return\b|value\b|None\b|==|=|\+|:|\(|\)|""|''|0(?![\w.]))/;
    while (rest.length) {
      const match = token.exec(rest);
      if (!match) return false;
      rest = rest.slice(match[0].length);
    }
    return true;
  }
  const sameSet = (found, wanted) => found.size === wanted.length && wanted.every(col => found.has(col));
  const isOriginal = (target, formula) => (target.legacy.length
    ? onlySums(formula) && sameSet(referencedColumns(formula), columnsOf(target, 1, false))
    : code(formula).trim() === 'return None');

  // Formule adaptée : bloc de tête (formule d'origine en commentaire) + somme des OPE 1 à `upTo` (avec 2029 si `with2029` et si la colonne en a un).
  function build(target, originalLines, upTo, with2029) {
    const year = !!with2029 && target.has2029;
    const parts = [];
    if (upTo > 1) parts.push(upTo > 2 ? `les OPE 2 à ${upTo} (colonnes suffixées _2 à _${upTo})` : 'l\'OPE 2 (colonnes suffixées _2)');
    if (year && target.legacy.length) parts.push('l\'année 2029');
    const lead = !target.legacy.length ? `Cette formule calcule l'année 2029${upTo > 1 ? ` de l'OPE 1 et ${upTo > 2 ? `des OPE 2 à ${upTo}` : 'de l\'OPE 2'}` : ''}`
      : (parts.length ? `Cette formule additionne aussi ${parts.join(' et ')}` : 'Cette formule est gérée par le widget');
    const lines = [HEAD + upTo + (year ? MARK_2029 : ''), `# ${lead} (ajouts du widget).`,
      '# Formule d\'origine conservée ci-dessous : pour revenir en arrière, la remettre à la place de ce bloc.'];
    originalLines.forEach(line => lines.push(line ? ORIGINAL + line : ORIGINAL.trim()));
    lines.push(TAIL);
    const legacy = columnsOf(target, 1, false).map(col => `rec.${col}`);
    const added = year ? target.specs.filter(item => item.year === YEAR_2029).map(item => `(rec.${opes().amountColumn(1, item.year, item.nature)} or 0)`) : [];
    lines.push(`total = (${legacy.concat(added).join(' + ')})  # OPE 1`);
    for (let rank = 2; rank <= upTo; rank++) lines.push(`total += ${columnsOf(target, rank, year).map(col => `(rec.${col} or 0)`).join(' + ')}  # OPE ${rank}`);
    if (target.emptyIfZero) lines.push('if total == 0:', '   return ""');
    lines.push('return total');
    return lines.join('\n');
  }

  // Formule déjà adaptée par le widget : {upTo, with2029, original: [lignes]} ; null sinon.
  function parseAdapted(formula) {
    const lines = normalize(formula).split('\n');
    const head = /^# >>> Widget InnovationS : OPE 1 à (\d)(, 2029 inclus)?$/.exec(lines[0] || '');
    const end = lines.indexOf(TAIL);
    if (!head || end < 0) return null;
    return { upTo: Number(head[1]), with2029: !!head[2], original: lines.slice(1, end).filter(line => line.indexOf('#|') === 0).map(line => line.slice(3)) };
  }

  // Que faire de cette formule pour couvrir les OPE 1 à `upTo` (et 2029 si `include2029`) ? {action: 'none' | 'adapt' | 'skip', reason, formula}
  function plan(target, formula, upTo, include2029) {
    const want2029 = !!include2029 && target.has2029;
    const text = normalize(formula);
    if (!text) return { action: 'skip', reason: 'formule absente' };
    // Total_2029 ne lit que 2029 : sans les colonnes de 2029 il n'y a rien à calculer (jamais une somme vide).
    if (!target.legacy.length && !want2029) return parseAdapted(text) ? { action: 'skip', reason: 'colonnes de 2029 absentes' } : { action: 'none' };
    const adapted = parseAdapted(text);
    if (adapted) {
      if (text !== build(target, adapted.original, adapted.upTo, adapted.with2029)) return { action: 'skip', reason: 'formule modifiée à la main depuis l\'adaptation' };
      if (adapted.upTo === upTo && adapted.with2029 === want2029) return { action: 'none' };
      return { action: 'adapt', formula: build(target, adapted.original, upTo, want2029) };
    }
    if (upTo < 2 && !want2029) return { action: 'none' };
    if (!isOriginal(target, text)) return { action: 'skip', reason: 'formule personnalisée' };
    return { action: 'adapt', formula: build(target, text.split('\n'), upTo, want2029) };
  }

  // 2029 ne s'ajoute que si les trois colonnes d'OPE 1 existent dans Projets (sinon la formule lirait une colonne absente).
  const has2029Columns = columnIds => opes().NATURES.every(nature => columnIds.has(opes().amountColumn(1, YEAR_2029, nature)));
  // Plus haut rang dont les colonnes de montants existent toutes dans Projets, de façon continue à partir de l'OPE 2.
  function completeRank(columnIds, with2029 = true) {
    const needed = rank => targets().every(target => columnsOf(target, rank, with2029).every(col => columnIds.has(col)));
    let upTo = 1;
    for (let rank = 2; rank <= opes().MAX && needed(rank); rank++) upTo = rank;
    return upTo;
  }

  let verifiedUpTo = 0;
  let failedUpTo = 0;
  const _reset = () => { verifiedUpTo = 0; failedUpTo = 0; };

  // Lit la formule des colonnes de Projets (métadonnées Grist, relues à chaque fois : elles ont pu être modifiées depuis le démarrage).
  async function readFormulas(docApi) {
    const [tables, columns] = await Promise.all([docApi.fetchTable('_grist_Tables'), docApi.fetchTable('_grist_Tables_column')]);
    const tableRef = tables.id[tables.tableId.indexOf(TABLE)];
    const ids = new Set(['id']);
    const formulas = {};
    columns.id.forEach((ref, i) => {
      if (columns.parentId[i] !== tableRef) return;
      ids.add(columns.colId[i]);
      formulas[columns.colId[i]] = { formula: columns.formula ? columns.formula[i] : '', isFormula: !!(columns.isFormula && columns.isFormula[i]) };
    });
    return { ids, formulas };
  }

  /**
   * Adapte les formules de totaux de Projets à 2029 et aux OPE 2 à 4 dont les colonnes existent. `upTo` = plus haut rang que l'appelant sait
   * exister (1 pour un projet classique) ; rien à faire quand il est déjà vérifié dans la session. Ne lève jamais :
   * rend {ok, upTo, with2029, adapted, untouched, error, repeated}.
   */
  async function adapt(upTo) {
    const wanted = Math.max(1, Number(upTo) || 1);
    if (wanted <= verifiedUpTo) return { ok: true, upTo: verifiedUpTo, adapted: [], untouched: [], checked: false };
    if (wanted <= failedUpTo) return { ok: false, repeated: true, adapted: [], untouched: [] };
    const grist = global.CoreGrist && global.CoreGrist.gristInstance;
    try {
      if (!grist) throw new Error('Grist n\'est pas prêt');
      const { ids, formulas } = await readFormulas(grist.docApi);
      const with2029 = has2029Columns(ids);
      const reach = completeRank(ids, with2029);
      // Colonnes de totaux PAR OPE (courrier de notification) : créées d'abord, en un seul envoi ; l'OPE 1 toujours, les autres quand leurs colonnes existent.
      const missingTotals = opes().missingTotalColumns(ids, reach, { with2029 });
      if (missingTotals.length) await global.CoreGrist.ensureColumns(TABLE, missingTotals);
      const actions = [];
      const adapted = [];
      const untouched = [];
      targets().forEach(target => {
        const current = formulas[target.colId];
        const step = !current ? { action: 'skip', reason: 'colonne absente' }
          : (!current.isFormula ? { action: 'skip', reason: 'colonne de données, pas une formule' } : plan(target, current.formula, reach, with2029));
        if (step.action === 'adapt') { actions.push(['ModifyColumn', TABLE, target.colId, { formula: step.formula }]); adapted.push(target.colId); }
        else if (step.action === 'skip') untouched.push({ colId: target.colId, reason: step.reason });
      });
      if (actions.length) await grist.docApi.applyUserActions(actions);
      if (actions.length && global.CoreGrist.invalidateTable) global.CoreGrist.invalidateTable(TABLE);
      verifiedUpTo = Math.max(verifiedUpTo, reach);
      return { ok: true, upTo: reach, with2029, adapted, untouched, created: missingTotals.map(def => def.id), checked: true };
    } catch (error) {
      failedUpTo = Math.max(failedUpTo, wanted);
      return { ok: false, error, adapted: [], untouched: [] };
    }
  }

  // « à l'OPE 2 » / « aux OPE 2 à 3 » et « à 2029 » : ce que les totaux additionnent en plus, pour le message.
  const scope = (upTo, with2029) => [upTo > 2 ? `aux OPE 2 à ${upTo}` : (upTo === 2 ? 'à l\'OPE 2' : ''), with2029 ? 'à l\'année 2029' : ''].filter(Boolean).join(' et ');
  // Prévient l'utilisateur (une fois) de ce que le widget a fait, ou n'a pas pu faire, sur les formules de totaux.
  async function adaptAndNotify(upTo) {
    const result = await adapt(upTo);
    const utils = global.CoreUtils;
    if (!utils) return result;
    if (!result.ok) {
      if (!result.repeated && result.error) utils.toastFailure(result.error, 'Totaux de Projets non adaptés', { what: 'adaptation des formules de totaux de Projets (OPE 2 à 4, année 2029)', table: 'Projets' });
      return result;
    }
    const custom = result.untouched.filter(item => item.reason !== 'colonne absente');
    const created = result.created || [];
    if (!result.adapted.length && !custom.length && !created.length) return result;
    const message = [];
    if (created.length) message.push(`${created.length} colonnes de totaux par OPE créées dans Projets (Total_OPE_1, Total_2026_OPE_1, Total_Fonctionnement_OPE_1…).`);
    if (result.adapted.length) message.push(`Totaux de Projets adaptés ${scope(result.upTo, result.with2029)} : ${result.adapted.join(', ')} (la formule d'origine reste en commentaire).`);
    if (custom.length) message.push(`Non modifiés : ${custom.map(item => `${item.colId} (${item.reason})`).join(', ')}.`);
    utils.showToast(message.join(' '), custom.length > 0, { duration: 12000 });
    return result;
  }

  global.CoreOpeTotals = { TABLE, YEARS, targets, columnsOf, referencedColumns, isOriginal, build, parseAdapted, plan, completeRank, has2029Columns, adapt, adaptAndNotify, _reset };
}(window));
