/** Page Rédaction — variables du modèle publipostage+ affiché que la modale projet ne permet pas de modifier.
 *
 * Demande d'Antoine du 01/10/2026 : « signaler en dehors de l'iframe les variables utilisées dans publipostage+ dans le modèle
 * affiché qui ne seraient pas intégrées dans la modale projet ». Ce module ne fait que l'analyse (aucun accès au document ni à
 * l'iframe, cf. page-redaction.js pour la lecture du modèle affiché) :
 *  - fromTemplateRow : les variables d'un modèle, lues dans la ligne de la table Publipostage_Modeles de publipostage+ ;
 *  - analyse : celles dont la colonne n'est pas un champ de la modale projet, par table.
 *
 * Format lu (js/editor-nodes.js de lombre33/publipostageGrist, createVarBadgeNode) : une variable est une pastille
 * <span class="var-badge" data-table data-column data-key> dans le HTML du modèle (colonne Contenu, et colonne HeaderFooter :
 * JSON dont header/footer.default/first sont du HTML) ; une image liée à une variable porte data-var-table / data-var-column /
 * data-var-key. Hors périmètre, faute de format stable à lire : les modèles « macro » (Contenu = JSON de modules), les variables
 * écrites en texte brut (#Variable dans Destinataires, Cc, Cci, Objet des modèles email), les conditions d'affichage et les boucles.
 */
(function (global) {
  'use strict';

  const PROJECT_TABLE = 'Projets';

  // Colonnes de Projets que la modale projet écrit : les clés de collectFields() (js/components/project-modal.js), budget compris.
  // À tenir à jour avec la modale : un test relit ce que la vraie modale enregistre et échoue si la liste ne suit plus.
  const MODAL_FIELDS = Object.freeze([
    'Programme', 'Projet', 'Acronyme', 'Type_projet', 'Statut_operationnel_projet', 'comentaire_general_Suivi_projet',
    'Porteur_1', 'Porteur_2', 'Porteur_3', 'VP_porteur_2', 'Accompagnateur', 'Instance_ratachee',
    'Date_limite_financement', 'Date_debut_Projet', 'Date_de_fin_Projet',
    'Ligne_OPE', 'Action_Ligne_OPE_a_faire', 'Commentaire_ligne_OPE',
    'Convention_de_reversement', 'Partenaire_s_convention_reversement', 'Convention_montant_partenaire_1', 'Convention_montant_partenaire_2',
    ...[2026, 2027, 2028, 2029].flatMap(year => ['M10_Fonctionnement', 'M20_Investissement', 'M30_Personnel'].map(line => `c${year}_${line}`)),
    'Details_depense_s_Fonctionnement', 'Details_depense_s_Investissement', 'Details_depense_s_Personnel'
  ]);

  const text = value => (value == null ? '' : String(value));

  // Les pastilles et images-variables d'un fragment HTML de modèle.
  function variablesIn(html) {
    if (!text(html).trim()) return [];
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const found = [];
    doc.querySelectorAll('span.var-badge').forEach(el => {
      found.push({ table: el.getAttribute('data-table'), column: el.getAttribute('data-column'), key: el.getAttribute('data-key') });
    });
    doc.querySelectorAll('img[data-var-table]').forEach(el => {
      found.push({ table: el.getAttribute('data-var-table'), column: el.getAttribute('data-var-column'), key: el.getAttribute('data-var-key') });
    });
    return found;
  }

  // Les fragments HTML de l'en-tête et du pied de page (colonne HeaderFooter : JSON, cf. Templates.safeParseHeaderFooter).
  function headerFooterParts(json) {
    if (!text(json).trim()) return [];
    try {
      const parsed = JSON.parse(json);
      return ['header', 'footer'].flatMap(zone => ['default', 'first'].map(variant => parsed && parsed[zone] && parsed[zone][variant]))
        .filter(part => typeof part === 'string');
    } catch (err) { return []; }
  }

  // row : {Contenu, HeaderFooter, TypeModele} de la table Publipostage_Modeles. Les variables, sans doublon (table + colonne) ; ou
  // {skipped: 'macro'} pour un type de modèle dont le contenu n'est pas du HTML.
  function fromTemplateRow(row) {
    const type = text(row && row.TypeModele) || 'document';
    if (type === 'macro') return { skipped: 'macro', variables: [] };
    const seen = new Set();
    const variables = [];
    [row && row.Contenu, ...headerFooterParts(row && row.HeaderFooter)].forEach(part => {
      variablesIn(part).forEach(variable => {
        if (!variable.column) return; // pastille sans colonne : rien à rapprocher d'un champ
        const id = `${variable.table || ''}|${variable.column}`;
        if (seen.has(id)) return;
        seen.add(id);
        variables.push(variable);
      });
    });
    return { skipped: null, variables };
  }

  // Une variable est « dans la modale » si c'est une colonne de Projets que la modale écrit. Les autres : par table (Projets d'abord),
  // et à part les colonnes calculées par Grist, que rien ne permet de modifier.
  //   formulas : Set de « Table.Colonne » calculées par une formule ; presentedTable : la table d'une pastille sans table (modèle ancien).
  function analyse(variables, { formulas = new Set(), presentedTable = PROJECT_TABLE } = {}) {
    const result = { total: variables.length, covered: 0, outside: [], formulas: [] };
    const byTable = new Map();
    variables.forEach(variable => {
      const table = variable.table || presentedTable;
      const entry = { table, column: variable.column, key: variable.key || variable.column };
      if (table === PROJECT_TABLE && MODAL_FIELDS.includes(variable.column)) { result.covered += 1; return; }
      if (formulas.has(`${table}.${variable.column}`)) { result.formulas.push(entry); return; }
      if (!byTable.has(table)) byTable.set(table, []);
      byTable.get(table).push(entry);
    });
    result.outside = Array.from(byTable.keys())
      .sort((a, b) => (a === PROJECT_TABLE ? -1 : b === PROJECT_TABLE ? 1 : a.localeCompare(b)))
      .map(table => ({ table, columns: byTable.get(table) }));
    return result;
  }

  const countOutside = result => (result ? result.outside.reduce((sum, group) => sum + group.columns.length, 0) : 0);

  global.RedactionVariables = { MODAL_FIELDS, fromTemplateRow, analyse, countOutside };
}(window));
