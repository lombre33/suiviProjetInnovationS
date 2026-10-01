/**
 * Non-regression suite: variables d'un modèle publipostage+ que la modale projet ne permet pas de modifier
 * (js/pages/redaction-variables.js : analyse pure ; le branchement sur la page est testé dans suite-redaction.js).
 * Les modèles de test reprennent le format réel de publipostage+ (js/editor-nodes.js, createVarBadgeNode).
 */
(function () {
  'use strict';

  const RV = () => window.RedactionVariables;
  // Une pastille de variable, telle que publipostage+ l'enregistre dans le HTML d'un modèle.
  const badge = (table, column, key = column) =>
    `<span class="var-badge" contenteditable="false" data-table="${table}" data-column="${column}" data-key="${key}">#${key}</span>`;
  const tableColumns = variables => variables.map(variable => `${variable.table}.${variable.column}`);

  describe('Variables du modèle — lecture des pastilles', function () {
    it('extrait table, colonne et clé de chaque pastille du contenu ; le texte « #Acronyme » écrit à la main n\'en est pas une', function () {
      const html = `<p>Bonjour ${badge('Projets', 'Porteur_1', 'Porteur 1')},</p><p>#Acronyme ${badge('Projets', 'Acronyme')} ${badge('Annuaire', 'Email')}</p>`;
      const { variables, skipped } = RV().fromTemplateRow({ Contenu: html, TypeModele: 'document' });
      assertEqual(skipped, null);
      assertDeepEqual(variables, [
        { table: 'Projets', column: 'Porteur_1', key: 'Porteur 1' },
        { table: 'Projets', column: 'Acronyme', key: 'Acronyme' },
        { table: 'Annuaire', column: 'Email', key: 'Email' }
      ]);
    });

    it('une même colonne utilisée plusieurs fois (corps, tableau, en-tête) n\'est comptée qu\'une fois, dans l\'ordre d\'apparition', function () {
      const html = `<p>${badge('Projets', 'Acronyme')}</p><table><tr><td>${badge('Projets', 'Acronyme')}</td><td>${badge('Projets', 'Projet')}</td></tr></table>`;
      assertDeepEqual(tableColumns(RV().fromTemplateRow({ Contenu: html }).variables), ['Projets.Acronyme', 'Projets.Projet']);
    });

    it('lit aussi l\'en-tête et le pied de page (HeaderFooter : JSON dont header/footer.default/first sont du HTML)', function () {
      const headerFooter = JSON.stringify({
        enabled: true, differentFirstPage: true,
        header: { default: `<p>${badge('Projets', 'Programme')}</p>`, first: `<p>${badge('Projets', 'Acronyme')}</p>` },
        footer: { default: `<p>${badge('Structures', 'Acronyme')}</p>`, first: '' }
      });
      const { variables } = RV().fromTemplateRow({ Contenu: `<p>${badge('Projets', 'Projet')}</p>`, HeaderFooter: headerFooter });
      assertDeepEqual(tableColumns(variables), ['Projets.Projet', 'Projets.Programme', 'Projets.Acronyme', 'Structures.Acronyme']);
    });

    it('un en-tête illisible (JSON cassé, valeur vide) ne fait rien perdre du contenu', function () {
      ['{pas du json', '', null, '"texte"', '{"header":null}'].forEach(headerFooter => {
        const { variables } = RV().fromTemplateRow({ Contenu: `<p>${badge('Projets', 'Projet')}</p>`, HeaderFooter: headerFooter });
        assertDeepEqual(tableColumns(variables), ['Projets.Projet'], `HeaderFooter = ${JSON.stringify(headerFooter)}`);
      });
    });

    it('une image liée à une variable (data-var-table / data-var-column) compte comme une variable', function () {
      const html = '<p><img class="editor-image" src="x.png" data-var-table="Projets" data-var-column="Logo" data-var-key="Logo"></p>';
      assertDeepEqual(RV().fromTemplateRow({ Contenu: html }).variables, [{ table: 'Projets', column: 'Logo', key: 'Logo' }]);
    });

    it('une pastille sans colonne est ignorée ; un contenu vide ou absent ne donne aucune variable', function () {
      assertDeepEqual(RV().fromTemplateRow({ Contenu: '<p><span class="var-badge" data-table="Projets"></span></p>' }).variables, []);
      assertDeepEqual(RV().fromTemplateRow({ Contenu: '' }).variables, []);
      assertDeepEqual(RV().fromTemplateRow({}).variables, []);
      assertDeepEqual(RV().fromTemplateRow(null).variables, []);
    });

    it('un modèle macro (Contenu = JSON de modules) n\'est pas analysé ; un modèle email l\'est comme un document', function () {
      const macro = RV().fromTemplateRow({ Contenu: '{"slots":[]}', TypeModele: 'macro' });
      assertEqual(macro.skipped, 'macro');
      assertDeepEqual(macro.variables, []);
      const email = RV().fromTemplateRow({ Contenu: `<p>${badge('Projets', 'Acronyme')}</p>`, TypeModele: 'email' });
      assertEqual(email.skipped, null);
      assertEqual(email.variables.length, 1);
    });
  });

  describe('Variables du modèle — celles que la modale projet ne permet pas de modifier', function () {
    const v = (table, column) => ({ table, column, key: column });

    it('une colonne de Projets que la modale écrit est « dans la modale » ; une autre colonne de Projets non', function () {
      const result = RV().analyse([v('Projets', 'Acronyme'), v('Projets', 'Date_debut_Projet'), v('Projets', 'c2027_M20_Investissement'), v('Projets', 'Description_rapide_projet')]);
      assertEqual(result.total, 4);
      assertEqual(result.covered, 3);
      assertDeepEqual(result.outside, [{ table: 'Projets', columns: [{ table: 'Projets', column: 'Description_rapide_projet', key: 'Description_rapide_projet' }] }]);
      assertEqual(RV().countOutside(result), 1);
    });

    it('la modale ne modifie que Projets : la colonne de même nom d\'une autre table n\'est pas couverte', function () {
      const result = RV().analyse([v('Notifications', 'Acronyme'), v('Structures', 'Acronyme')]);
      assertEqual(result.covered, 0);
      assertDeepEqual(result.outside.map(group => group.table), ['Notifications', 'Structures']);
    });

    it('les autres tables sont regroupées, Projets d\'abord puis par ordre alphabétique', function () {
      const result = RV().analyse([v('Structures', 'Nom'), v('Annuaire', 'Email'), v('Projets', 'Lien_convention'), v('Annuaire', 'Fonction')]);
      assertDeepEqual(result.outside.map(group => `${group.table}:${group.columns.map(c => c.column).join('+')}`),
        ['Projets:Lien_convention', 'Annuaire:Email+Fonction', 'Structures:Nom']);
      assertEqual(RV().countOutside(result), 4);
    });

    it('une colonne calculée par une formule est à part et n\'est pas comptée : rien ne permet de la modifier', function () {
      const result = RV().analyse([v('Projets', 'Statut_Macro'), v('Projets', 'Acronyme'), v('Projets', 'Description_rapide_projet')],
        { formulas: new Set(['Projets.Statut_Macro']) });
      assertDeepEqual(result.formulas.map(entry => entry.column), ['Statut_Macro']);
      assertDeepEqual(result.outside.map(group => group.columns.map(c => c.column)), [['Description_rapide_projet']]);
      assertEqual(RV().countOutside(result), 1);
      assertEqual(result.total, 3);
    });

    it('une formule dans une autre table n\'affecte pas la colonne de même nom de Projets', function () {
      const result = RV().analyse([v('Projets', 'Total'), v('Annuaire', 'Total')], { formulas: new Set(['Annuaire.Total']) });
      assertDeepEqual(result.outside.map(group => group.table), ['Projets']);
      assertDeepEqual(result.formulas.map(entry => entry.table), ['Annuaire']);
    });

    it('une pastille sans table (modèle ancien) est rapprochée de la table présentée à publipostage+', function () {
      const onNotifications = RV().analyse([{ table: null, column: 'Acronyme', key: 'Acronyme' }], { presentedTable: 'Notifications' });
      assertEqual(onNotifications.covered, 0, 'la colonne de la fiche Notifications n\'est pas dans la modale projet');
      assertEqual(onNotifications.outside[0].table, 'Notifications');
      const onProjets = RV().analyse([{ table: '', column: 'Acronyme', key: 'Acronyme' }], { presentedTable: 'Projets' });
      assertEqual(onProjets.covered, 1);
    });

    it('aucune variable, ou aucun résultat : rien d\'à signaler', function () {
      assertEqual(RV().countOutside(RV().analyse([])), 0);
      assertEqual(RV().countOutside(null), 0);
    });
  });

  describe('Variables du modèle — la liste des champs suit la vraie modale projet', function () {
    it('MODAL_FIELDS = les colonnes que la modale projet enregistre (collectFields), ni plus ni moins', async function () {
      const tables = await window.CoreGrist.loadAllTables();
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.ProjectModal.open(window.CoreState.getTable('Projets').find(project => project.id === 11));
      await document.getElementById('cp-project-modal').querySelector('[data-cp-save]').onclick();
      const update = window.__TEST_CALLS__.find(call => call.type === 'UpdateRecord' && call.table === 'Projets');
      assertTrue(!!update, 'la modale a enregistré le projet');
      const written = Object.keys(update.fields);
      const added = written.filter(field => !RV().MODAL_FIELDS.includes(field));
      const removed = RV().MODAL_FIELDS.filter(field => !written.includes(field));
      assertTrue(added.length === 0 && removed.length === 0,
        `La liste MODAL_FIELDS de js/pages/redaction-variables.js doit suivre collectFields() de js/components/project-modal.js — à ajouter : [${added}] ; à retirer : [${removed}]`);
    });
  });
}());
