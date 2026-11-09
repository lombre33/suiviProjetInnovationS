/**
 * Table privée de la signature et règles d'accès qui la protègent.
 *
 * L'image de la signature vit dans une pièce jointe d'une table `Signature_VP`. Grist ne laisse lire
 * le contenu d'une pièce jointe qu'à qui peut lire une cellule qui la contient : une règle d'accès
 * qui refuse tout à qui n'est pas propriétaire du document protège donc aussi le fichier. Ce module
 * ne fait que calculer : les règles voulues, l'état de la protection d'après les tables de Grist, et
 * les actions qui posent les règles. Il ne touche ni au réseau ni au DOM.
 */
(function (global) {
  'use strict';

  const TABLE = 'Signature_VP';
  const COL = { image: 'Image', anchor: 'Repere' };
  const COLUMNS = [{ id: COL.image, type: 'Attachments' }, { id: COL.anchor, type: 'Text' }];
  const DEFAULT_ANCHOR = 'Le Vice-Président,';
  // Le mémo reconnaît la règle du widget : il ne touche jamais aux autres règles du document.
  const MEMO = 'Signature : table réservée au propriétaire';

  const isOwnRule = rule => rule && rule.memo === MEMO;

  // Règles voulues : [{ tableId, colIds, aclFormula, permissionsText, memo }]. Une seule suffit :
  // tout refuser sur la table à qui n'est pas propriétaire (lien public, lecteurs, éditeurs).
  const wantedRules = () => [
    { tableId: TABLE, colIds: '*', aclFormula: 'user.Access != OWNER', permissionsText: '-CRUD', memo: MEMO },
  ];

  const ruleText = ({ tableId, colIds, aclFormula, permissionsText, memo }) => `${tableId}|${colIds}|${aclFormula}|${permissionsText}|${memo || ''}`;

  // Règles du widget déjà posées, avec leur ressource, dans l'ordre de Grist.
  function currentRules(resources, rules) {
    return rules.filter(isOwnRule).sort((a, b) => (a.rulePos || 0) - (b.rulePos || 0))
      .map(rule => ({ ...(resources.find(res => res.id === rule.resource) || {}), ...rule }));
  }

  const rulesInPlace = (resources, rules) => currentRules(resources, rules).map(ruleText).join('\n') === wantedRules().map(ruleText).join('\n');

  // État de la protection :
  //  - 'no-table' : la table ou l'une de ses colonnes manque ;
  //  - 'no-rules' : la table est là mais la règle n'est pas (ou plus) posée ;
  //  - 'ok'       : table et règle en place.
  // `columns` : colonnes de la table lues (null si la table n'existe pas).
  function status({ columns, resources, rules }) {
    if (!columns || COLUMNS.some(col => !columns.includes(col.id))) return 'no-table';
    return rulesInPlace(resources, rules) ? 'ok' : 'no-rules';
  }

  // Actions qui créent la table (ou les colonnes qui manquent). `columns` : colonnes présentes, ou null.
  function tableActions(columns) {
    if (!columns) return [['AddTable', TABLE, COLUMNS.map(col => ({ id: col.id, type: col.type }))]];
    return COLUMNS.filter(col => !columns.includes(col.id)).map(col => ['AddColumn', TABLE, col.id, { type: col.type }]);
  }

  // Actions qui posent la règle avant toutes les autres : la première règle qui s'applique décide, une
  // règle plus permissive placée avant celle-ci la rendrait inutile. Rien si la règle est déjà là
  // (changer une règle fait recharger le document). Les règles partent en un seul BulkAddRecord :
  // Grist range chaque ajout avant la première position plus grande que la sienne, des ajouts
  // successifs à positions négatives s'inverseraient (constaté dans Sync+).
  function ruleActions(resources, rules) {
    if (rulesInPlace(resources, rules)) return [];
    const wanted = wantedRules();
    const mine = rules.filter(isOwnRule);
    const actions = mine.length ? [['BulkRemoveRecord', '_grist_ACLRules', mine.map(rule => rule.id)]] : [];
    let position = Math.min(0, ...rules.filter(rule => !isOwnRule(rule)).map(rule => rule.rulePos || 0)) - wanted.length - 1;
    const added = [];
    let newRef = 0;
    const resourceFor = ({ tableId, colIds }) => {
      const found = resources.find(res => res.tableId === tableId && res.colIds === colIds) || added.find(res => res.tableId === tableId && res.colIds === colIds);
      if (found) return found.id;
      added.push({ id: --newRef, tableId, colIds });
      actions.push(['AddRecord', '_grist_ACLResources', newRef, { tableId, colIds }]);
      return newRef;
    };
    const resource = wanted.map(resourceFor);
    actions.push(['BulkAddRecord', '_grist_ACLRules', wanted.map(() => null), {
      resource, aclFormula: wanted.map(w => w.aclFormula), permissionsText: wanted.map(w => w.permissionsText),
      rulePos: wanted.map(() => ++position), memo: wanted.map(w => w.memo),
    }]);
    return actions;
  }

  // Les éditeurs peuvent-ils modifier la structure du document ? C'est le réglage par défaut de Grist.
  // Un éditeur pourrait alors ajouter une colonne formule qui lit la table (les formules lisent sans
  // les règles d'accès) : la protection tient, mais pas contre un éditeur malveillant. La case
  // « Permettre aux éditeurs de modifier la structure », décochée, ajoute à la ressource `*` une
  // règle `user.Access != OWNER` → `-S` ; seule la première règle qui parle du droit S et vise les
  // éditeurs décide.
  const EDITOR_FORMULAS = ['', 'user.Access != OWNER', 'user.Access == EDITOR', 'user.Access in [EDITOR]', 'user.Access in [EDITOR, OWNER]', 'user.Access in [OWNER, EDITOR]'];
  const structureSign = text => (text === 'all' ? '+' : text === 'none' ? '-' : (/([+-])[A-Z]*S/.exec(text || '') || [])[1]);
  function editorsEditStructure(resources, rules) {
    const defaults = new Set(resources.filter(res => res.tableId === '*' && res.colIds === '*').map(res => res.id));
    const decisive = rules.filter(rule => defaults.has(rule.resource) && structureSign(rule.permissionsText)
      && EDITOR_FORMULAS.includes(String(rule.aclFormula || '').replace(/\s+/g, ' ').trim()))
      .sort((a, b) => (a.rulePos || 0) - (b.rulePos || 0))[0];
    return !decisive || structureSign(decisive.permissionsText) === '+';
  }

  global.SigAcl = {
    TABLE, COL, COLUMNS, DEFAULT_ANCHOR, MEMO,
    wantedRules, ruleText, currentRules, rulesInPlace, status, tableActions, ruleActions, editorsEditStructure,
  };
})(window);
