/**
 * Totaux de Projets (formules Grist) et OPE 2 à 4 — demande d'Antoine du 26/11/2026 :
 * « il faut que les colonnes de totaux existantes restent les bonnes, donc adapter les formules ».
 *
 * Les formules d'origine de Projets (Total_2026/27/28, Total_Fonctionnement/investissement/Personnel, Montant_attribue_Total) ne
 * somment que les colonnes de l'OPE 1. Dès qu'un projet porte une OPE 2 à 4 (colonnes suffixées _2/_3/_4 créées par le widget,
 * js/core/project-opes.js), ces totaux seraient faux : la page Installation des fonds, les notifications, Export_VP... les lisent.
 * Le widget réécrit donc ces 7 formules pour y ajouter les OPE existantes. Garde-fous :
 *  - seules les formules RECONNUES sont réécrites : celles qui ne lisent que les colonnes d'OPE 1 attendues, avec le seul vocabulaire des
 *    formules d'origine (somme, « si 0 alors vide »). Une formule personnalisée n'est jamais touchée (elle est signalée) ;
 *  - la formule d'origine est conservée telle quelle en commentaire (lignes « #| »), dans un bloc délimité : pour revenir en arrière,
 *    la remettre à la place du bloc ;
 *  - les 7 réécritures partent dans un seul applyUserActions : tout ou rien, jamais des totaux à moitié adaptés ;
 *  - jamais d'effet quand aucune colonne d'OPE 2 à 4 n'existe ; seules les OPE dont les 9 colonnes (2026-2028) existent sont ajoutées ;
 *  - rejouable : une formule déjà adaptée à ces OPE n'est pas réécrite ; un nouveau rang l'étend à partir de la formule d'origine
 *    gardée en commentaire ; une formule marquée puis modifiée à la main n'est plus touchée ;
 *  - au mieux : un refus (droits de structure) ne bloque jamais l'enregistrement, il est signalé une fois par session.
 * Les 2029 ne sont pas additionnés : les formules d'origine s'arrêtent à 2028 (choix d'Antoine à confirmer, rien n'est changé là-dessus).
 */
(function (global) {
  'use strict';

  const TABLE = 'Projets';
  const YEARS = Object.freeze([2026, 2027, 2028]);
  const HEAD = '# >>> Widget InnovationS : OPE 1 à ';
  const TAIL = '# <<<';
  const ORIGINAL = '#| ';

  const opes = () => global.CoreOpes;
  const normalize = text => String(text == null ? '' : text).replace(/\r\n?/g, '\n').replace(/\s+$/, '');

  // Les 7 colonnes calculées : l'OPE 1 qu'elles somment (année × nature) et si elles rendent "" à 0.
  function targets() {
    const natures = opes().NATURES;
    const spec = (colId, list, emptyIfZero) => ({ colId, specs: list, emptyIfZero });
    const all = [];
    YEARS.forEach(year => natures.forEach(nature => all.push({ year, nature })));
    const result = YEARS.map(year => spec(`Total_${year}`, natures.map(nature => ({ year, nature })), true));
    const byNature = { F: 'Total_Fonctionnement', I: 'Total_investissement', P: 'Total_Personnel' };
    natures.forEach(nature => result.push(spec(byNature[nature.key], YEARS.map(year => ({ year, nature })), true)));
    result.push(spec('Montant_attribue_Total', all, false));
    return result;
  }
  const columnsOf = (target, rank) => target.specs.map(item => opes().amountColumn(rank, item.year, item.nature));

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
  const isOriginal = (target, formula) => onlySums(formula) && sameSet(referencedColumns(formula), columnsOf(target, 1));

  // Formule adaptée : bloc de tête (formule d'origine en commentaire) + somme des OPE 1 à `upTo`.
  function build(target, originalLines, upTo) {
    const lines = [HEAD + upTo,
      `# Cette formule additionne aussi ${upTo > 2 ? `les OPE 2 à ${upTo} (colonnes suffixées _2 à _${upTo})` : 'l\'OPE 2 (colonnes suffixées _2)'}, ajoutées par le widget.`,
      '# Formule d\'origine conservée ci-dessous : pour revenir en arrière, la remettre à la place de ce bloc.'];
    originalLines.forEach(line => lines.push(line ? ORIGINAL + line : ORIGINAL.trim()));
    lines.push(TAIL);
    lines.push(`total = (${columnsOf(target, 1).map(col => `rec.${col}`).join(' + ')})  # OPE 1`);
    for (let rank = 2; rank <= upTo; rank++) lines.push(`total += ${columnsOf(target, rank).map(col => `(rec.${col} or 0)`).join(' + ')}  # OPE ${rank}`);
    if (target.emptyIfZero) lines.push('if total == 0:', '   return ""');
    lines.push('return total');
    return lines.join('\n');
  }

  // Formule déjà adaptée par le widget : {upTo, original: [lignes]} ; null sinon.
  function parseAdapted(formula) {
    const lines = normalize(formula).split('\n');
    const head = /^# >>> Widget InnovationS : OPE 1 à (\d)$/.exec(lines[0] || '');
    const end = lines.indexOf(TAIL);
    if (!head || end < 0) return null;
    return { upTo: Number(head[1]), original: lines.slice(1, end).filter(line => line.indexOf('#|') === 0).map(line => line.slice(3)) };
  }

  // Que faire de cette formule pour couvrir les OPE 1 à `upTo` ? {action: 'none' | 'adapt' | 'skip', reason, formula}
  function plan(target, formula, upTo) {
    const text = normalize(formula);
    if (!text) return { action: 'skip', reason: 'formule absente' };
    const adapted = parseAdapted(text);
    if (adapted) {
      if (text !== build(target, adapted.original, adapted.upTo)) return { action: 'skip', reason: 'formule modifiée à la main depuis l\'adaptation' };
      if (adapted.upTo === upTo) return { action: 'none' };
      return { action: 'adapt', formula: build(target, adapted.original, upTo) };
    }
    if (upTo < 2) return { action: 'none' };
    if (!isOriginal(target, text)) return { action: 'skip', reason: 'formule personnalisée' };
    return { action: 'adapt', formula: build(target, text.split('\n'), upTo) };
  }

  // Plus haut rang dont les colonnes de montants existent toutes (2026-2028) dans Projets, de façon continue à partir de l'OPE 2.
  function completeRank(columnIds) {
    const needed = rank => targets().every(target => columnsOf(target, rank).every(col => columnIds.has(col)));
    let upTo = 1;
    for (let rank = 2; rank <= opes().MAX && needed(rank); rank++) upTo = rank;
    return upTo;
  }

  let verifiedUpTo = 1;
  let failedUpTo = 0;
  const _reset = () => { verifiedUpTo = 1; failedUpTo = 0; };

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
   * Adapte les formules de totaux de Projets aux OPE 2 à 4 dont les colonnes existent. `upTo` = plus haut rang que l'appelant sait exister
   * (rien à faire quand il est déjà vérifié dans la session). Ne lève jamais : rend {ok, upTo, adapted, untouched, error, repeated}.
   */
  async function adapt(upTo) {
    const wanted = Math.max(1, Number(upTo) || 1);
    if (wanted < 2 || wanted <= verifiedUpTo) return { ok: true, upTo: verifiedUpTo, adapted: [], untouched: [], checked: false };
    if (wanted <= failedUpTo) return { ok: false, repeated: true, adapted: [], untouched: [] };
    const grist = global.CoreGrist && global.CoreGrist.gristInstance;
    try {
      if (!grist) throw new Error('Grist n\'est pas prêt');
      const { ids, formulas } = await readFormulas(grist.docApi);
      const reach = completeRank(ids);
      const actions = [];
      const adapted = [];
      const untouched = [];
      targets().forEach(target => {
        const current = formulas[target.colId];
        const step = !current ? { action: 'skip', reason: 'colonne absente' }
          : (!current.isFormula ? { action: 'skip', reason: 'colonne de données, pas une formule' } : plan(target, current.formula, reach));
        if (step.action === 'adapt') { actions.push(['ModifyColumn', TABLE, target.colId, { formula: step.formula }]); adapted.push(target.colId); }
        else if (step.action === 'skip') untouched.push({ colId: target.colId, reason: step.reason });
      });
      if (actions.length) await grist.docApi.applyUserActions(actions);
      if (actions.length && global.CoreGrist.invalidateTable) global.CoreGrist.invalidateTable(TABLE);
      verifiedUpTo = Math.max(verifiedUpTo, reach);
      return { ok: true, upTo: reach, adapted, untouched, checked: true };
    } catch (error) {
      failedUpTo = Math.max(failedUpTo, wanted);
      return { ok: false, error, adapted: [], untouched: [] };
    }
  }

  const ope = upTo => (upTo > 2 ? `aux OPE 2 à ${upTo}` : 'à l\'OPE 2');
  // Prévient l'utilisateur (une fois) de ce que le widget a fait, ou n'a pas pu faire, sur les formules de totaux.
  async function adaptAndNotify(upTo) {
    const result = await adapt(upTo);
    const utils = global.CoreUtils;
    if (!utils) return result;
    if (!result.ok) {
      if (!result.repeated && result.error) utils.toastFailure(result.error, `Totaux de Projets non adaptés ${ope(upTo)}`, { what: 'adaptation des formules de totaux de Projets aux OPE 2 à 4', table: 'Projets' });
      return result;
    }
    const custom = result.untouched.filter(item => item.reason !== 'colonne absente');
    if (!result.adapted.length && !custom.length) return result;
    const message = [];
    if (result.adapted.length) message.push(`Totaux de Projets adaptés ${ope(result.upTo)} : ${result.adapted.join(', ')} (la formule d'origine reste en commentaire).`);
    if (custom.length) message.push(`Non modifiés : ${custom.map(item => `${item.colId} (${item.reason})`).join(', ')}.`);
    utils.showToast(message.join(' '), custom.length > 0, { duration: 12000 });
    return result;
  }

  global.CoreOpeTotals = { TABLE, YEARS, targets, columnsOf, referencedColumns, isOriginal, build, parseAdapted, plan, completeRank, adapt, adaptAndNotify, _reset };
}(window));
