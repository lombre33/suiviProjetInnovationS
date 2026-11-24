/**
 * Non-regression suite: mesure des colonnes de Projets (js/core/column-audit.js, onglet « Colonnes » du panneau Alt+Maj+D) — demande d'Antoine
 * du 24/11/2026 : savoir quelles colonnes de Projets ne servent plus du tout, sur des faits lus dans le vrai document (remplissage, formules
 * des autres tables, modèles Publipostage+, vues Grist, règles d'accès) et sans jamais rien modifier ni afficher une valeur de projet.
 */
(function () {
  'use strict';

  const CA = () => window.ColumnAudit;
  const PT = () => window.PerfTrace;
  const keydown = (target, init) => target.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, init)));
  const panelText = () => { const el = document.querySelector('.perf-panel textarea'); return el ? el.value : null; };
  // Le module se charge à la demande (le widget ne le lit jamais au démarrage) : les tests le chargent comme le fait le panneau.
  async function ensure() {
    if (window.ColumnAudit) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '../js/core/column-audit.js';
      script.onload = resolve; script.onerror = () => reject(new Error('column-audit.js introuvable'));
      document.head.appendChild(script);
    });
  }

  // Métadonnées d'un mini-document, au format de docApi.fetchTable (colonnes → tableaux).
  const columnTable = rows => {
    const keys = ['id', 'parentId', 'parentPos', 'colId', 'type', 'isFormula', 'formula', 'visibleCol', 'displayCol', 'summarySourceCol', 'description'];
    const out = {}; keys.forEach(key => { out[key] = rows.map(row => (row[key] === undefined ? (key === 'formula' || key === 'description' ? '' : key === 'isFormula' ? false : 0) : row[key])); });
    return out;
  };
  const META = () => ({
    tables: { id: [1, 2], tableId: ['Projets', 'Notifications'], rawViewSectionRef: [100, 101], recordCardViewSectionRef: [0, 0] },
    columns: columnTable([
      { id: 11, parentId: 1, parentPos: 1, colId: 'Acronyme', type: 'Text' },
      { id: 12, parentId: 1, parentPos: 2, colId: 'Reattribution_montant', type: 'Numeric' },
      { id: 13, parentId: 1, parentPos: 3, colId: 'IMN', type: 'Numeric' },
      { id: 14, parentId: 1, parentPos: 4, colId: 'Devis', type: 'Attachments', description: 'Devis du projet' },
      { id: 15, parentId: 1, parentPos: 5, colId: 'consomme', type: 'Any', isFormula: true, formula: '' },
      { id: 16, parentId: 1, parentPos: 6, colId: 'Total_2027', type: 'Numeric', isFormula: true, formula: 'return $c2027_M10 + $c2027_M20' },
      { id: 17, parentId: 1, parentPos: 7, colId: 'Duplica_dans_Projet', type: 'Bool', isFormula: true, formula: 'return len(Projets.lookupRecords(Acronyme=$Acronyme)) > 1' },
      { id: 18, parentId: 1, parentPos: 8, colId: 'Lettre_de_missions', type: 'Attachments' },
      { id: 19, parentId: 1, parentPos: 9, colId: 'Programme', type: 'Text' },
      { id: 90, parentId: 1, parentPos: 10, colId: 'manualSort', type: 'ManualSortPos' },
      { id: 91, parentId: 1, parentPos: 11, colId: 'gristHelper_Display2', type: 'Any', isFormula: true, formula: '$Acronyme' },
      { id: 21, parentId: 2, parentPos: 1, colId: 'gristHelper_Display', type: 'Any', isFormula: true, formula: '$Projet.Acronyme' },
      { id: 22, parentId: 2, parentPos: 2, colId: 'Projet', type: 'Ref:Projets', displayCol: 21, visibleCol: 11 },
      { id: 23, parentId: 2, parentPos: 3, colId: 'Projet_Reattribution_montant', type: 'Numeric', isFormula: true, formula: 'return $Projet.Reattribution_montant' },
      { id: 24, parentId: 2, parentPos: 4, colId: 'Projet_Total_2027', type: 'Numeric', isFormula: true, formula: 'return $Projet.Total_2027' },
      { id: 25, parentId: 2, parentPos: 5, colId: 'Projet_Devis', type: 'Any', isFormula: true, formula: '# copie de l\'ancien Devis du projet : plus utilisée\nreturn None' }
    ]),
    views: { id: [1, 2], name: ['Données brutes', 'Suivi des projets'] },
    sections: { id: [100, 101, 102], tableRef: [1, 2, 1], parentId: [1, 1, 2] },
    fields: { id: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], parentId: [100, 100, 100, 100, 100, 100, 100, 100, 102, 102], colRef: [11, 12, 13, 14, 15, 16, 17, 18, 11, 14] },
    aclResources: { id: [1], tableId: ['Projets'], colIds: ['Lettre_de_missions'] },
    aclRules: { id: [1, 2], resource: [1, 1], aclFormula: ['', 'user.Access == "owners" and rec.Programme == "X"'], permissionsText: ['-R', '+R'] }
  });
  const DATA = () => ({
    id: [1, 2, 3],
    Acronyme: ['A', 'B', 'C'], Reattribution_montant: [0, 0, 0], IMN: [0, 0, 0], Devis: [['L', 5], null, ['L']],
    consomme: [null, null, null], Total_2027: [null, null, null], Duplica_dans_Projet: [false, false, false],
    Lettre_de_missions: [['L', 7], ['L', 8], null], Programme: ['', '', '']
  });
  const TEMPLATES = () => [{ name: 'Notification RH', text: 'Bonjour #Notifications.Projet_Reattribution_montant €' }, { name: 'Courrier', text: 'Objet : #Projets.Acronyme' }];
  const col = (result, id) => result.columns.find(c => c.colId === id);

  describe('Mesure des colonnes — analyse (sans Grist)', function () {
    it('ne liste ni la colonne de tri ni les colonnes techniques, dans l\'ordre du document', async function () {
      await ensure();
      const result = CA().analyse({ tableId: 'Projets', data: DATA(), meta: META(), templates: TEMPLATES() });
      assertEqual(result.columns.map(c => c.colId).join(','), 'Acronyme,Reattribution_montant,IMN,Devis,consomme,Total_2027,Duplica_dans_Projet,Lettre_de_missions,Programme');
      assertEqual(result.total, 3);
    });

    it('remplissage : 0, faux, liste vide et « [\'L\'] » comptent pour vides', function () {
      const result = CA().analyse({ tableId: 'Projets', data: DATA(), meta: META(), templates: TEMPLATES() });
      assertEqual(col(result, 'Acronyme').filled, 3);
      assertEqual(col(result, 'Reattribution_montant').filled, 0);
      assertEqual(col(result, 'Devis').filled, 1, 'une pièce jointe, un [\'L\'] vide, un null');
      assertEqual(col(result, 'Lettre_de_missions').filled, 2);
      assertEqual(col(result, 'Duplica_dans_Projet').filled, 0);
      assertTrue(CA().isEmptyValue(['L']) && CA().isEmptyValue([]) && CA().isEmptyValue(0) && CA().isEmptyValue('') && !CA().isEmptyValue(['L', 3]) && !CA().isEmptyValue('x'));
    });

    it('genre : donnée, formule, colonne vide', function () {
      const result = CA().analyse({ tableId: 'Projets', data: DATA(), meta: META(), templates: TEMPLATES() });
      assertEqual(col(result, 'IMN').kind, 'donnée');
      assertEqual(col(result, 'Total_2027').kind, 'formule');
      assertEqual(col(result, 'consomme').kind, 'vide');
    });

    it('formules : toute colonne du document qui cite le nom, la colonne elle-même exceptée ; l\'affichage d\'une référence est compté à part', function () {
      const result = CA().analyse({ tableId: 'Projets', data: DATA(), meta: META(), templates: TEMPLATES() });
      assertEqual(col(result, 'Reattribution_montant').formulas.join(','), 'Notifications.Projet_Reattribution_montant');
      assertEqual(col(result, 'Acronyme').formulas.join(','), 'Projets.Duplica_dans_Projet', 'la formule de Duplica_dans_Projet cite Acronyme');
      assertEqual(col(result, 'Acronyme').display.join(','), 'Notifications.Projet', 'Notifications.Projet affiche Acronyme (colonne « à afficher »)');
      assertEqual(col(result, 'Duplica_dans_Projet').formulas.length, 0, 'une formule qui se cite elle-même ne compte pas');
    });

    it('un miroir n\'est « utilisé » que si un modèle, une vue ou une autre formule le reprend', function () {
      const result = CA().analyse({ tableId: 'Projets', data: DATA(), meta: META(), templates: TEMPLATES() });
      assertEqual(col(result, 'Reattribution_montant').usedFormulas.join(','), 'Notifications.Projet_Reattribution_montant', 'le modèle « Notification RH » écrit ce miroir');
      assertEqual(col(result, 'Total_2027').formulas.join(','), 'Notifications.Projet_Total_2027');
      assertEqual(col(result, 'Total_2027').usedFormulas.length, 0, 'ce miroir-là n\'est repris par rien');
      assertTrue(CA().isOrphan(col(result, 'Total_2027')), 'formule que rien ne reprend');
      assertFalse(CA().isOrphan(col(result, 'Reattribution_montant')));
    });

    it('modèles Publipostage+ : les noms des modèles qui écrivent le nom de la colonne, jamais leur texte', function () {
      const result = CA().analyse({ tableId: 'Projets', data: DATA(), meta: META(), templates: TEMPLATES() });
      assertEqual(col(result, 'Acronyme').templates.join(','), 'Courrier');
      assertEqual(col(result, 'IMN').templates.length, 0);
      assertEqual(JSON.stringify(result).includes('Bonjour'), false, 'aucun texte de modèle dans le résultat');
    });

    it('un nom de colonne n\'est pas confondu avec un mot plus long (Devis / Devis_signe, IMN / IMNO)', function () {
      const templates = [{ name: 'Autre', text: 'Devis_signe IMNO xIMN' }];
      const result = CA().analyse({ tableId: 'Projets', data: DATA(), meta: META(), templates });
      assertEqual(col(result, 'Devis').templates.length, 0);
      assertEqual(col(result, 'IMN').templates.length, 0);
    });

    it('vues Grist : les données brutes ne comptent pas, les pages oui (avec leur nom)', function () {
      const result = CA().analyse({ tableId: 'Projets', data: DATA(), meta: META(), templates: TEMPLATES() });
      assertEqual(col(result, 'Devis').views, 1);
      assertEqual(col(result, 'Devis').viewNames.join(','), 'Suivi des projets');
      assertEqual(col(result, 'IMN').views, 0, 'présente seulement dans les données brutes');
    });

    it('règles d\'accès : une règle qui vise la colonne, ou une condition qui la cite', function () {
      const result = CA().analyse({ tableId: 'Projets', data: DATA(), meta: META(), templates: TEMPLATES() });
      assertEqual(col(result, 'Lettre_de_missions').rules, 2, 'deux règles sur cette colonne');
      assertEqual(col(result, 'Programme').rules, 1, 'citée par une condition');
      assertEqual(col(result, 'IMN').rules, 0);
    });

    it('ce qui est illisible est dit, pas deviné : règles d\'accès (non propriétaire) et modèles absents', function () {
      const meta = META(); meta.aclRules = null; meta.aclResources = null;
      const result = CA().analyse({ tableId: 'Projets', data: DATA(), meta, templates: null });
      assertTrue(result.unavailable.acl && result.unavailable.templates);
      const text = CA().reportLines(result).join('\n');
      assertTrue(text.includes('règles d\'accès illisibles') && text.includes('modèles Publipostage+ introuvables'), 'avertissements dans le rapport');
    });
  });

  describe('Mesure des colonnes — rapport', function () {
    it('le module est chargé', async function () { await ensure(); assertTrue(!!CA()); });
    const report = () => CA().reportLines(CA().analyse({ tableId: 'Projets', data: DATA(), meta: META(), templates: TEMPLATES(), at: Date.UTC(2026, 10, 24, 12) })).join('\n');

    it('range les colonnes en groupes de décision A, B, C, D', function () {
      const text = report();
      const section = letter => { const at = text.indexOf(`${letter}. `); const next = text.indexOf('\n\n', at); return text.slice(at, next); };
      assertTrue(section('A').includes('IMN |') && section('A').includes('consomme |'), 'A : jamais remplie, rien ne la cite');
      assertFalse(section('A').includes('Devis |'), 'une colonne affichée dans une vue n\'est pas orpheline');
      assertTrue(section('B').includes('Lettre_de_missions |') === false, 'Lettre_de_missions est visée par une règle d\'accès : pas orpheline');
      assertTrue(section('C').includes('Total_2027 |'), 'C : formule que rien ne reprend');
      assertTrue(section('D').includes('Reattribution_montant |') && section('D').includes('Notifications.Projet_Reattribution_montant'), 'D : jamais remplie mais citée, avec ce qui la cite');
    });

    it('B : une colonne remplie que rien ne cite est signalée (données à archiver avant suppression)', function () {
      const meta = META(); meta.aclRules = { id: [], resource: [], aclFormula: [], permissionsText: [] };
      const text = CA().reportLines(CA().analyse({ tableId: 'Projets', data: DATA(), meta, templates: TEMPLATES() })).join('\n');
      const at = text.indexOf('B. '); const block = text.slice(at, text.indexOf('\n\n', at));
      assertTrue(block.includes('Lettre_de_missions | donnée | Attachments | remplie 2/3'), `B : ${block}`);
    });

    it('aucune valeur de projet : seulement des noms et des nombres', function () {
      const text = report();
      ['A,B,C', '"B"', 'Bonjour'].forEach(word => assertFalse(text.includes(word), `« ${word} » ne doit pas apparaître`));
      assertTrue(text.includes('lecture seule'), 'dit que rien n\'est modifié');
    });
  });

  describe('Mesure des colonnes — lecture du document et panneau Alt+Maj+D', function () {
    function installDocument() {
      const meta = META();
      window.__mockSetTable('_grist_Tables', meta.tables);
      window.__mockSetTable('_grist_Tables_column', meta.columns);
      window.__mockSetTable('_grist_Views', meta.views);
      window.__mockSetTable('_grist_Views_section', meta.sections);
      window.__mockSetTable('_grist_Views_section_field', meta.fields);
      window.__mockSetTable('Projets', Object.assign({}, DATA()));
      window.__mockSetTable('Publipostage_Modeles', { id: [1, 2], Nom: ['Notification RH', 'Courrier'], Contenu: ['#Notifications.Projet_Reattribution_montant', '#Projets.Acronyme'], Type: ['document', 'document'] });
    }

    it('l\'onglet « Colonnes » du panneau charge le module à la demande, mesure, et n\'écrit rien dans Grist', async function () {
      installDocument();
      window.ColumnAudit = undefined; // le widget ne le charge jamais au démarrage : c'est le bouton qui va le chercher
      PT().columnAuditUrl = '../js/core/column-audit.js'; // la page de test est dans /tests : le code y est évalué, sans balise <script> pour deviner l'adresse
      try {
        window.__TEST_CALLS__.length = 0;
        PT().open({ tab: 'columns' });
        assertTrue(panelText().includes('Mesurer les colonnes de Projets'), 'invite à lancer la mesure avant toute lecture');
        const button = document.querySelector('[data-perf-columns]');
        assertTrue(!!button, 'bouton de mesure dans le panneau');
        button.click();
        try { await waitFor(() => /Colonnes de Projets — mesure/.test(panelText() || ''), 'rapport affiché'); }
        catch (err) { throw new Error(`${err.message} — état : « ${(document.querySelector('.perf-panel-status') || {}).textContent} »`); }
        const text = panelText();
        assertTrue(text.includes('9 colonnes'), text.slice(0, 300));
        assertTrue(/IMN \| donnée \| Numeric \| remplie 0\/3/.test(text), 'ligne de la colonne IMN');
        assertTrue(text.includes('règles d\'accès illisibles'), 'tables d\'accès absentes du mock : dit, pas deviné');
        assertTrue(!!window.ColumnAudit, 'module chargé par le bouton');
        const writes = window.__TEST_CALLS__.filter(call => /Update|Add|Remove|Rename|Modify|BulkAdd/.test(JSON.stringify(call)));
        assertEqual(writes.length, 0, 'lecture seule : aucune action d\'écriture');
      } finally { PT().close(); }
    });

    it('« Copier » met le rapport des colonnes dans le rapport complet une fois mesuré', async function () {
      installDocument();
      await CA().measure('Projets');
      const full = PT().report();
      assertTrue(full.includes('Colonnes de Projets — mesure'), 'le rapport complet reprend la mesure');
      assertTrue(PT().report('columns').includes('A. Jamais remplie'), 'section seule');
      CA()._reset();
      assertFalse(PT().report().includes('Colonnes de Projets — mesure'), 'rien tant que rien n\'est mesuré');
    });

    it('une table de métadonnées illisible n\'empêche pas la mesure : le rapport dit ce qui manque', async function () {
      installDocument();
      const docApi = window.grist.docApi, original = docApi.fetchTable;
      docApi.fetchTable = function (name, ...rest) { if (name === '_grist_Views_section_field') return Promise.reject(new Error('Blocked by table read access rules')); return original.call(docApi, name, ...rest); };
      try {
        const result = await CA().measure('Projets');
        assertTrue(result.unavailable.views, 'vues signalées illisibles');
        assertEqual(result.columns.length, 9, 'les colonnes sont quand même mesurées');
      } finally { docApi.fetchTable = original; }
    });
  });
})();
