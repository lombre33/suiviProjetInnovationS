/**
 * Non-regression suite: diagnostic d'accès Grist (js/core/access-diagnostic.js, js/core/access-expectations.js) — demande d'Antoine du 24/11/2026 :
 * des messages détaillés, partout, sur POURQUOI un élément ne s'affiche pas (table/colonne illisible, référence non résolue, écriture refusée
 * par une règle d'accès, colonne manquante, ligne filtrée, identité de l'utilisateur).
 *
 * Aucun accès à un vrai Grist : le mock refuse ce que le test lui dit de refuser, avec les messages réels de Grist (grist-core).
 */
(function () {
  'use strict';

  const A = () => window.CoreAccess;
  const api = () => window.grist.docApi;

  async function loadFixtureState() {
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    return tables;
  }

  // Remplace docApi.fetchTable / applyUserActions le temps d'un test (le refus est celui de Grist : même texte).
  async function withDenied({ read = {}, write = null }, run) {
    const docApi = api();
    const fetchOriginal = docApi.fetchTable, writeOriginal = docApi.applyUserActions;
    docApi.fetchTable = function (name, ...rest) {
      if (Object.prototype.hasOwnProperty.call(read, name)) return Promise.reject(new Error(read[name]));
      return fetchOriginal.call(docApi, name, ...rest);
    };
    if (write) docApi.applyUserActions = function (actions, ...rest) { return Promise.reject(new Error(typeof write === 'function' ? write(actions) : write)); };
    try { return await run(); } finally { docApi.fetchTable = fetchOriginal; docApi.applyUserActions = writeOriginal; }
  }

  const READ_DENIED = 'Blocked by table read access rules';
  const UPDATE_DENIED = 'Blocked by table update access rules';
  const COLUMN_UPDATE_DENIED = 'Blocked by column update access rules';

  describe('Accès Grist — classement des messages d\'erreur', function () {
    const cases = [
      [READ_DENIED, 'acl'],
      [UPDATE_DENIED, 'acl'],
      ['Blocked by table create access rules', 'acl'],
      ['Blocked by table delete access rules', 'acl'],
      [COLUMN_UPDATE_DENIED, 'acl'],
      ['Blocked by table structure access rules', 'acl'],
      ['[Sandbox] Blocked by access rules: \'AddTable\' actions need full access', 'acl-action'],
      ['Only owners can modify access rules', 'owners-only'],
      ['No write access, document is read-only', 'read-only'],
      ['document needs reload', 'reload'],
      ['Access not granted. Current access level read table', 'widget-level'],
      ['Cannot access cell: attachment', 'attachment'],
      ['Can\'t save value to formula column Total', 'formula-column'],
      ['Cannot modify locked table Projets', 'locked'],
      ['Table Projets has no column Statut_Macro', 'missing-column'],
      ['Mock Grist: unknown table Lignes_OPE', 'missing-table'],
      ['[Sandbox] KeyError \'Depenses_OPE\'', 'missing-table'],
      ['Invalid args: expected a number', 'invalid'],
      ['Accès refusé à Lignes_OPE', 'no-access'],
      ['Request failed with 403 Forbidden', 'no-access'],
      ['Failed to fetch', 'network'],
      ['boom', 'unknown']
    ];
    cases.forEach(([message, kind]) => {
      it(`« ${message} » → ${kind}`, function () {
        assertEqual(A().classify(new Error(message)).kind, kind);
        assertEqual(A().classify(message).kind, kind, 'une chaîne se classe comme une erreur');
      });
    });

    it('les refus de droits se distinguent des autres échecs', function () {
      ['acl', 'acl-action', 'owners-only', 'read-only', 'widget-level', 'no-access', 'attachment', 'locked'].forEach(kind => assertTrue(A().isDenial(kind), kind + ' est un refus'));
      ['missing-table', 'missing-column', 'invalid', 'network', 'unknown', 'reload'].forEach(kind => assertFalse(A().isDenial(kind), kind + ' n\'est pas un refus'));
    });

    it('une erreur du widget qui en enveloppe une de Grist (cause) est classée comme celle de Grist', function () {
      const wrapped = Object.assign(new Error('Préparation impossible'), { cause: new Error(READ_DENIED) });
      assertEqual(A().classify(wrapped).kind, 'acl');
      assertIncludes(A().reason(wrapped, { table: 'Projets' }), 'Préparation impossible');
      assertIncludes(A().reason(wrapped, { table: 'Projets' }), 'Lecture refusée');
    });
  });

  describe('Accès Grist — explication détaillée', function () {
    it('lecture refusée : où, pourquoi, conséquence sur les écrans, quoi vérifier, message de Grist', function () {
      const ex = A().explain(new Error(READ_DENIED), { op: 'read', table: 'Lignes_OPE' });
      assertIncludes(ex.headline, 'Lecture refusée');
      assertIncludes(ex.headline, 'Lignes_OPE');
      const labels = ex.lines.map(line => line.label);
      ['Où', 'Pourquoi', 'Conséquence dans le widget', 'À vérifier', 'Message de Grist'].forEach(label => assertTrue(labels.includes(label), `ligne « ${label} »`));
      assertIncludes(ex.text, 'Règles d\'accès');
      assertIncludes(ex.text, 'Voir en tant que');
      assertIncludes(ex.text, 'Installation des fonds', 'les écrans qui lisent cette table sont nommés');
      assertIncludes(ex.text, '« ' + READ_DENIED + ' »', 'le message de Grist est cité tel quel');
    });

    it('écriture refusée : la table, la ligne et les colonnes écrites sont citées', function () {
      const actions = [['UpdateRecord', 'Projets', 17, { Acronyme: 'X', Programme: 2 }]];
      const ex = A().explain(new Error(UPDATE_DENIED), { actions });
      assertIncludes(ex.headline, 'Modification refusée');
      assertIncludes(ex.headline, 'Projets');
      const where = ex.lines.find(line => line.label === 'Où').text;
      assertIncludes(where, 'modification d\'une ligne');
      assertIncludes(where, 'ligne 17');
      assertIncludes(where, 'Acronyme, Programme');
      assertEqual(ex.table, 'Projets');
      assertDeepEqual(ex.columns, ['Acronyme', 'Programme']);
    });

    it('règle par colonne : le texte dit qu\'une seule colonne en lecture seule suffit, et au-delà de 12 colonnes le rappelle', function () {
      const fields = {}; for (let i = 0; i < 15; i++) fields['C' + i] = i;
      const ex = A().explain(new Error(COLUMN_UPDATE_DENIED), { actions: [['UpdateRecord', 'Projets', 3, fields]] });
      assertIncludes(ex.text, 'règle posée sur une colonne');
      assertIncludes(ex.text, '15 colonnes d\'un coup');
    });

    it('création de structure refusée : le widget crée lui-même ses tables, donc le texte parle du droit « Modifier la structure »', function () {
      const ex = A().explain(new Error('Blocked by table structure access rules'), { actions: [['AddTable', 'Instance_Validations', [{ id: 'A' }]]] });
      assertIncludes(ex.text, 'Modifier la structure');
      assertIncludes(ex.text, 'Instance_Validations');
    });

    it('lecture seule, rechargement, niveau d\'accès du widget, colonne calculée : chacun a son titre et sa vérification', function () {
      assertIncludes(A().explain(new Error('No write access, document is read-only'), {}).headline, 'lecture seule');
      assertIncludes(A().explain({ message: 'x', code: 'NEED_RELOAD' }, {}).headline, 'recharger');
      assertIncludes(A().explain(new Error('Access not granted. Current access level read table'), {}).text, 'Accès complet au document');
      assertIncludes(A().explain(new Error('Can\'t save value to formula column Total_Personnel'), {}).headline, 'Total_Personnel');
    });

    it('erreur inconnue : titre neutre « Erreur inattendue », message d\'origine conservé, jamais attribué à Grist', function () {
      const ex = A().explain(new Error('boom'), {});
      assertEqual(ex.headline, 'Erreur inattendue : « boom »');
      assertEqual(A().reason(new Error('boom')), 'boom');
    });

    it('describeActions / summarizeTargets lisent les actions Grist (table, lignes, colonnes, structure)', function () {
      const targets = A().summarizeTargets([
        ['AddRecord', 'Projets', null, { A: 1, B: 2 }], ['UpdateRecord', 'Projets', 5, { C: 3 }],
        ['AddColumn', 'Projets', 'Ligne_OPE_2', { type: 'RefList:Lignes_OPE' }], ['RemoveRecord', 'Annuaire', 9]
      ]);
      const projets = targets.find(t => t.table === 'Projets'), annuaire = targets.find(t => t.table === 'Annuaire');
      assertDeepEqual(projets.columns, ['A', 'B', 'C', 'Ligne_OPE_2']);
      assertDeepEqual(projets.rowIds, [5]);
      assertTrue(projets.schema, 'AddColumn est une action de structure');
      assertDeepEqual(annuaire.rowIds, [9]);
    });

    it('les règles d\'accès lues dans Grist (propriétaires) complètent « À vérifier » avec la règle probable', async function () {
      window.__mockSetTable('_grist_ACLResources', { id: [1, 2], tableId: ['Projets', '*'], colIds: ['Statut_Macro', '*'] });
      window.__mockSetTable('_grist_ACLRules', {
        id: [1, 2], resource: [1, 2], rulePos: [1, 2], aclFormula: ['user.Access != OWNER', ''], permissionsText: ['-U', '+R'], permissions: [0, 0]
      });
      const rules = await A().loadAclRules(api());
      assertEqual(rules.count, 2);
      const ex = A().explain(new Error(COLUMN_UPDATE_DENIED), { actions: [['UpdateRecord', 'Projets', 3, { Statut_Macro: 'x' }]] });
      assertIncludes(ex.text, 'Règles lues dans Grist pour la table Projets');
      assertIncludes(ex.text, 'user.Access != OWNER');
      assertIncludes(ex.text, '-U');
    });

    it('règles d\'accès illisibles (compte non propriétaire) : aucune règle inventée, le texte reste valable', async function () {
      const rules = await A().loadAclRules(api());
      assertTrue(!!rules.error, 'erreur de lecture rapportée');
      const ex = A().explain(new Error(UPDATE_DENIED), { actions: [['UpdateRecord', 'Projets', 3, { A: 1 }]] });
      assertFalse(ex.text.includes('Règles lues dans Grist'), 'aucune règle citée');
      assertIncludes(ex.text, 'Règles d\'accès');
    });
  });

  describe('Accès Grist — instrumentation de docApi (aucun appel de plus, aucun tour de promesse de plus)', function () {
    function fake(impl) {
      const calls = [];
      const docApi = {
        fetchTable: function (name) { calls.push(['fetchTable', name]); return impl.fetchTable ? impl.fetchTable(name) : Promise.resolve({ id: [1] }); },
        applyUserActions: function (actions) { calls.push(['apply', actions]); return impl.apply ? impl.apply(actions) : Promise.resolve({ retValues: [] }); }
      };
      return { docApi, calls };
    }

    it('chaque appel est transmis une seule fois, et la promesse rendue est celle de Grist (même objet)', async function () {
      const promise = Promise.resolve({ id: [1, 2], A: [1, 2] });
      const { docApi, calls } = fake({ fetchTable: () => promise });
      assertTrue(A().instrument(docApi));
      assertTrue(docApi.fetchTable('Projets') === promise, 'même promesse : aucun tour de plus pour l\'appelant');
      await promise;
      assertEqual(calls.length, 1, 'un seul appel Grist');
      A().instrument(docApi);
      docApi.fetchTable('Annuaire');
      assertEqual(calls.length, 2, 'ré-instrumenter ne double pas l\'enveloppe');
    });

    it('une lecture réussie note les lignes et les colonnes reçues', async function () {
      const { docApi } = fake({ fetchTable: () => Promise.resolve({ id: [1, 2, 3], NOM: ['a', 'b', 'c'], Email: ['x', 'y', 'z'] }) });
      A().instrument(docApi);
      await docApi.fetchTable('Annuaire');
      const state = A().readState('Annuaire');
      assertTrue(state.ok);
      assertEqual(state.rows, 3);
      assertTrue(state.columns.includes('Email') && state.columns.includes('NOM'));
    });

    it('un refus rend la MÊME erreur, annotée (table, action, colonnes) sans que l\'annotation soit visible dans un JSON ni un message', async function () {
      const boom = new Error(UPDATE_DENIED);
      const { docApi } = fake({ apply: () => Promise.reject(boom) });
      A().instrument(docApi);
      let caught = null;
      try { await docApi.applyUserActions([['UpdateRecord', 'Projets', 4, { Acronyme: 'Z' }]]); } catch (err) { caught = err; }
      assertTrue(caught === boom, 'erreur identique');
      assertEqual(caught.gristAccess.op, 'write');
      assertEqual(caught.message, UPDATE_DENIED, 'message inchangé');
      assertEqual(JSON.stringify(Object.keys(caught)), '[]', 'propriété non énumérable');
      const event = A().events()[0];
      assertEqual(event.table, 'Projets');
      assertEqual(event.level, 'denied');
      assertDeepEqual(event.columns, ['Acronyme']);
    });

    it('un échec synchrone est relancé tel quel', function () {
      const { docApi } = fake({ apply: () => { throw new Error('sync'); } });
      A().instrument(docApi);
      let caught = null;
      try { docApi.applyUserActions([['AddRecord', 'Projets', null, {}]]); } catch (err) { caught = err; }
      assertTrue(!!caught && caught.message === 'sync');
      assertEqual(A().events().filter(e => e.table === 'Projets').length, 1, 'noté malgré tout');
    });

    it('le même refus répété n\'ajoute pas de ligne au journal : il compte (×N)', async function () {
      const { docApi } = fake({ apply: () => Promise.reject(new Error(UPDATE_DENIED)) });
      A().instrument(docApi);
      for (let i = 0; i < 3; i++) { try { await docApi.applyUserActions([['UpdateRecord', 'Projets', 4, { Acronyme: 'Z' }]]); } catch (err) { /* attendu */ } }
      const mine = A().events().filter(e => e.table === 'Projets');
      assertEqual(mine.length, 1);
      assertEqual(mine[0].count, 3);
    });

    it('une lecture réussie plus tard efface le refus de lecture noté plus tôt pour cette table', async function () {
      let denied = true;
      const { docApi } = fake({ fetchTable: () => denied ? Promise.reject(new Error(READ_DENIED)) : Promise.resolve({ id: [1] }) });
      A().instrument(docApi);
      try { await docApi.fetchTable('Programmes'); } catch (err) { /* attendu */ }
      assertFalse(A().readState('Programmes').ok);
      assertEqual(A().events().filter(e => e.table === 'Programmes').length, 1);
      denied = false;
      await docApi.fetchTable('Programmes');
      assertTrue(A().readState('Programmes').ok);
      assertEqual(A().events().filter(e => e.table === 'Programmes').length, 0, 'plus de refus affiché pour une table redevenue lisible');
    });

    it('le widget réel : docApi de Grist instrumenté au démarrage de CoreGrist (une seule enveloppe)', async function () {
      assertTrue(window.grist.docApi.fetchTable.__accessWrapped === true);
      assertTrue(window.grist.docApi.applyUserActions.__accessWrapped === true);
    });
  });

  describe('Accès Grist — tables illisibles et colonnes absentes', function () {
    it('table refusée : problème « table », écrans concernés nommés, message de Grist cité', async function () {
      await withDenied({ read: { Lignes_OPE: READ_DENIED } }, async () => { await window.CoreGrist.loadAllTables(); });
      const state = A().readState('Lignes_OPE');
      assertFalse(state.ok);
      assertEqual(state.kind, 'acl');
      const problem = A().problems().find(p => p.scope === 'table' && p.table === 'Lignes_OPE');
      assertTrue(!!problem, 'problème listé');
      assertEqual(problem.level, 'denied');
      assertTrue(problem.pages.includes('Installation des fonds') && problem.pages.includes('Dashboard'), 'écrans concernés : ' + problem.pages.join(', '));
      assertIncludes(problem.detail, READ_DENIED);
    });

    it('table absente du document : « n\'existe pas », sauf les tables que le widget crée lui-même (Preferences_Widget…) qui restent silencieuses', async function () {
      A().noteReadFailure('Structures', new Error('Mock Grist: unknown table Structures'));
      A().noteReadFailure('Instance_Validations', new Error('Mock Grist: unknown table Instance_Validations'));
      A().noteReadFailure('Preferences_Widget', new Error('Mock Grist: unknown table Preferences_Widget'));
      const tables = A().problems().filter(p => p.scope === 'table').map(p => p.table);
      assertTrue(tables.includes('Structures'));
      assertFalse(tables.includes('Instance_Validations'), 'table des instances créée au besoin');
      assertFalse(tables.includes('Preferences_Widget'), 'préférences créées au besoin');
    });

    it('colonne attendue absente de la lecture : écran et effet nommés ; colonne connue du schéma = « cachée par une règle par colonne »', async function () {
      await window.CoreGrist.loadAllTables();
      const projets = JSON.parse(JSON.stringify(await window.grist.docApi.fetchTable('Projets')));
      // Le schéma (métadonnées) connaît Statut_Macro, mais Grist ne l'a pas envoyée : règle d'accès par colonne.
      const allColumns = Object.keys(projets);
      const cols = { id: [], parentId: [], colId: [], type: [], isFormula: [], formula: [], widgetOptions: [], description: [] };
      allColumns.filter(col => col !== 'id').forEach((colId, i) => { cols.id.push(i + 1); cols.parentId.push(1); cols.colId.push(colId); cols.type.push('Text'); cols.isFormula.push(false); cols.formula.push(''); cols.widgetOptions.push(''); cols.description.push(''); });
      window.__mockSetTable('_grist_Tables', { id: [1], tableId: ['Projets'] });
      window.__mockSetTable('_grist_Tables_column', cols);
      await window.CoreGrist.loadColumnDescriptions();
      delete projets.Statut_Macro;
      A().noteRead('Projets', projets);
      const problem = A().problems().find(p => p.scope === 'columns' && p.table === 'Projets');
      assertTrue(!!problem, 'problème de colonnes');
      assertTrue(problem.columns.includes('Statut_Macro'));
      assertTrue(problem.pages.includes('Kanban'), 'le Kanban dépend de Statut_Macro');
      assertTrue(problem.effect.some(line => line.includes('Kanban') && line.includes('aucun projet n\'apparaît')), 'effet décrit');
      assertIncludes(problem.detail, 'existe dans le schéma mais Grist ne l\'envoie pas');
      assertIncludes(problem.detail, 'règle d\'accès par colonne');
    });

    it('colonne introuvable même dans le schéma : « renommée ou supprimée »', async function () {
      await window.CoreGrist.loadAllTables();
      const annuaire = JSON.parse(JSON.stringify(await window.grist.docApi.fetchTable('Annuaire')));
      delete annuaire.Email;
      window.__mockSetTable('_grist_Tables', { id: [1], tableId: ['Annuaire'] });
      window.__mockSetTable('_grist_Tables_column', { id: [1, 2], parentId: [1, 1], colId: ['NOM', 'Prenom'], type: ['Text', 'Text'], isFormula: [false, false], formula: ['', ''], widgetOptions: ['', ''], description: ['', ''] });
      await window.CoreGrist.loadColumnDescriptions();
      A().noteRead('Annuaire', annuaire);
      const problem = A().problems().find(p => p.scope === 'columns' && p.table === 'Annuaire');
      assertTrue(!!problem && problem.columns.includes('Email'));
      assertIncludes(problem.detail, 'introuvable dans le schéma');
    });

    it('toutes les colonnes attendues présentes : aucun problème de colonnes (pas de fausse alerte)', async function () {
      await window.CoreGrist.loadAllTables();
      assertTrue(A().readState('Programmes').ok, 'Programmes lue');
      assertEqual(A().problems().filter(p => p.scope === 'columns' && p.table === 'Programmes').length, 0);
    });

    it('table Projets lue mais vide : signalée (soit vide, soit toutes les lignes cachées par une règle par ligne)', function () {
      A().noteRead('Projets', { id: [], Acronyme: [] });
      const problem = A().problems().find(p => p.scope === 'rows' && p.table === 'Projets');
      assertTrue(!!problem);
      assertIncludes(problem.detail, 'règle d\'accès par ligne');
    });
  });

  describe('Accès Grist — références non résolues : jamais un numéro brut', function () {
    it('unresolvedRef : libellé « Personne (id 12) non lisible » et raison ; une valeur texte n\'est pas une référence', function () {
      const ref = A().unresolvedRef('Annuaire', 12, 'Personne');
      assertEqual(ref.label, 'Personne (id 12) non lisible');
      assertIncludes(ref.title, 'ne vous la montrent pas');
      assertEqual(A().unresolvedRef('Annuaire', 'Dupont'), null);
      assertEqual(A().unresolvedRef('Annuaire', 0), null);
      assertEqual(A().unreadableLabel('Lignes_OPE', 4), 'Ligne OPE (id 4) non lisible');
    });

    it('table entière refusée : la raison cite le message de Grist', function () {
      A().noteReadFailure('Annuaire', new Error(READ_DENIED));
      const ref = A().unresolvedRef('Annuaire', 3);
      assertIncludes(ref.title, 'n’a pas pu être lue');
      assertIncludes(ref.title, READ_DENIED);
      assertIncludes(ref.title, 'règle d\'accès');
    });

    it('références pendantes repérées dans les lignes lues (porteur absent de l\'Annuaire lu) : un seul problème par colonne, avec les numéros', async function () {
      const tables = await loadFixtureState();
      const projets = tables.Projets.map(p => p.id === 10 ? Object.assign({}, p, { Porteur_1: 99 }) : p);
      window.CoreState.setTable('Projets', projets);
      const typed = window.CoreGrist.columnTypes && window.CoreGrist.columnTypes('Projets');
      if (!typed || !typed.Porteur_1) {
        // Sans métadonnées de types dans le mock, on les installe : Porteur_1 est une référence vers Annuaire.
        window.__mockSetTable('_grist_Tables', { id: [1], tableId: ['Projets'] });
        window.__mockSetTable('_grist_Tables_column', { id: [1], parentId: [1], colId: ['Porteur_1'], type: ['Ref:Annuaire'], isFormula: [false], formula: [''], widgetOptions: [''], description: [''] });
        await window.CoreGrist.loadColumnDescriptions();
      }
      const dangling = A().danglingRefs().find(ref => ref.table === 'Projets' && ref.column === 'Porteur_1');
      assertTrue(!!dangling, 'référence pendante détectée');
      assertDeepEqual(dangling.missing, [99]);
      const problem = A().problems().find(p => p.id === 'ref:Projets.Porteur_1');
      assertIncludes(problem.headline, 'Projets.Porteur_1 → Annuaire');
      assertIncludes(problem.effect[0], 'Personne (id N) non lisible');
    });

    it('Kanban : un porteur illisible s\'affiche « Personne (id N) non lisible » avec la raison en infobulle (et plus le numéro seul)', async function () {
      const tables = await loadFixtureState();
      window.CoreState.setTable('Projets', tables.Projets.map(p => p.id === 10 ? Object.assign({}, p, { Porteur_1: 99, Accompagnateur: 98 }) : p));
      window.renderProjectsKanban();
      const card = Array.from(document.querySelectorAll('#projects-kanban .project-card')).find(c => c.querySelector('.project-acronym').textContent === 'INNOVX');
      const holders = card.querySelectorAll('.project-holder');
      assertIncludes(holders[0].textContent, 'Personne (id 99) non lisible');
      assertIncludes(holders[0].title, 'règle d’accès par ligne sur Annuaire');
      assertIncludes(holders[1].textContent, 'Personne (id 98) non lisible');
      const other = Array.from(document.querySelectorAll('#projects-kanban .project-card')).find(c => c.querySelector('.project-acronym').textContent === 'NOTIFY');
      assertEqual(other.querySelector('.project-holder').title, '', 'porteur lisible : aucune infobulle');
      assertIncludes(other.querySelector('.project-holder').textContent, 'Alice Martin');
    });

    it('Kanban : un programme illisible s\'affiche « Programme (id N) non lisible » sur la carte', async function () {
      const tables = await loadFixtureState();
      window.CoreState.setTable('Programmes', tables.Programmes.filter(p => p.id !== 2));
      window.renderProjectsKanban();
      const card = Array.from(document.querySelectorAll('#projects-kanban .project-card')).find(c => c.querySelector('.project-acronym').textContent === 'NOTIFY');
      const badge = card.querySelector('.programme-badge');
      assertEqual(badge.textContent, 'Programme (id 2) non lisible');
      assertIncludes(badge.title, 'Programmes');
    });

    it('Annuaire : un poste illisible s\'affiche « Poste (id N) non lisible » et n\'est pas confondu avec « Sans poste » (pas de fausse alerte « à vérifier »)', async function () {
      const tables = await loadFixtureState();
      window.CoreState.setTable('Postes2', tables.Postes2.filter(p => p.id !== 1));
      const dir = window.AnnuaireLogic.buildDirectory();
      const alice = dir.people.find(p => p.name === 'Alice Martin');
      assertEqual(alice.titre, 'Poste (id 1) non lisible');
      assertIncludes(alice.hiddenTip, 'Poste (id 1) non lisible');
      assertFalse(alice.issues.some(issue => issue.key === 'no-poste'), 'pas « personne sans poste » : le poste existe, il est caché');
      const bob = dir.people.find(p => p.name === 'Bob Durand');
      assertTrue(bob.issues.some(issue => issue.key === 'no-poste'), 'sans poste réel : alerte conservée');
    });

    it('Installation des fonds : une ligne OPE illisible n\'est ni « Aucune ligne OPE » ni une alerte « OPE à compléter », et l\'infobulle donne la raison', async function () {
      const tables = await loadFixtureState();
      window.CoreState.setTable('Lignes_OPE', tables.Lignes_OPE.filter(l => l.id !== 1));
      window.renderInstallation();
      const chip = Array.from(document.querySelectorAll('.install-card')).find(card => card.querySelector('.install-acronym').textContent === 'INNOVX').querySelector('.install-chip-ope');
      assertEqual(chip.textContent, 'Ligne OPE (id 1) non lisible');
      assertIncludes(chip.title, 'ne vous la montrent pas');
      assertFalse(chip.classList.contains('is-alert'), 'pas d\'alerte : on ne sait pas si la ligne est complète');
    });

    it('Administratif : un responsable absent de l\'Annuaire lu est « Personne (id N) non lisible » avec la raison en infobulle', async function () {
      const tables = await loadFixtureState();
      const projets = tables.Projets.map(p => p.id === 12 ? Object.assign({}, p, { next_step_responsable: ['L', 1, 77] }) : p);
      window.CoreState.setTable('Projets', projets);
      window.renderAdministratif();
      const tag = document.querySelector('#admin-col-conv [data-project-id="12"] .admin-tag[data-person="77"]');
      assertTrue(!!tag, 'pastille du responsable affichée');
      assertIncludes(tag.title, 'Personne (id 77) non lisible');
      assertIncludes(tag.title, 'ne vous la montrent pas');
    });

    it('Dashboard : lignes OPE ou programmes cachés → avertissement chiffré (consommé sous-estimé, « Sans programme »)', async function () {
      const tables = await loadFixtureState();
      window.CoreState.setTable('Lignes_OPE', tables.Lignes_OPE.filter(l => l.id !== 1));
      window.CoreState.setTable('Programmes', tables.Programmes.filter(p => p.id !== 2));
      const checks = A().problems().filter(p => p.scope === 'check' && p.pages.includes('Dashboard'));
      assertTrue(checks.length >= 2, 'deux avertissements : ' + checks.map(c => c.headline).join(' | '));
      const opeCheck = checks.find(c => c.table === 'Lignes_OPE');
      assertIncludes(opeCheck.headline, 'ligne OPE que votre compte ne peut pas lire');
      assertIncludes(opeCheck.effect.join(' '), 'sous-estimés');
      const progCheck = checks.find(c => c.table === 'Programmes');
      assertIncludes(progCheck.headline, '« Sans programme »');
    });

    it('Dashboard : tout se lit → aucun avertissement', async function () {
      await loadFixtureState();
      assertEqual(A().problems().filter(p => p.scope === 'check' && p.pages.includes('Dashboard')).length, 0);
    });
  });

  describe('Accès Grist — Kanban : projets qui n\'apparaissent dans aucune colonne', function () {
    it('statut inconnu : le projet est compté, le statut non reconnu cité (fixtures : « Statut totalement inconnu »)', async function () {
      await loadFixtureState();
      const check = A().problems().find(p => p.scope === 'check' && p.pages.includes('Kanban'));
      assertTrue(!!check, 'contrôle Kanban');
      assertIncludes(check.headline, '1 projet sur 7');
      assertIncludes(check.detail, 'Statut totalement inconnu');
    });

    it('colonne Statut_Macro non transmise (règle par colonne) : niveau « refusé », cause nommée', async function () {
      const tables = await loadFixtureState();
      const projets = tables.Projets.map(p => { const copy = Object.assign({}, p); delete copy.Statut_Macro; return copy; });
      window.CoreState.setTable('Projets', projets);
      const stripped = JSON.parse(JSON.stringify(await window.grist.docApi.fetchTable('Projets')));
      delete stripped.Statut_Macro;
      A().noteRead('Projets', stripped);
      const check = A().problems().find(p => p.scope === 'check' && p.pages.includes('Kanban'));
      assertEqual(check.level, 'denied');
      assertIncludes(check.detail, 'Statut_Macro n\'arrive pas au widget');
    });

    it('le contrôle compte dans la pastille de l\'en-tête', async function () {
      await loadFixtureState();
      assertTrue(A().countOf(A().problems()) >= 1);
    });
  });

  describe('Accès Grist — identité de l\'utilisateur (To Do, Preferences_Widget)', function () {
    async function openTodoAs(email, extra) {
      await loadFixtureState();
      window.__mockSetTable('Preferences_Widget', Object.assign({ id: [1], Email_utilisateur: [email] }, extra || {}));
      window.localStorage.setItem('suiviProjetInnovationS:prefsRowId', '1');
      await window.loadTodoUserPreferences();
      window.renderTodo();
      const select = document.getElementById('todo-view-select');
      select.value = 'me'; fire(select, 'change');
    }

    it('adresse connue mais absente de l\'Annuaire : le message dit laquelle (masquée), combien de fiches ont été lues et les deux causes possibles', async function () {
      await openTodoAs('inconnu.personne@example.org');
      assertFalse(document.getElementById('todo-identify-notice').hidden);
      const text = document.getElementById('todo-identify-text');
      assertIncludes(text.textContent, 'inconnu.personne@example.org', 'l\'avis lui-même (à l\'écran de la personne) garde son texte');
      assertIncludes(text.title, '2 fiches de l\'Annuaire lues');
      assertIncludes(text.title, 'règle d\'accès par ligne sur Annuaire');
      const identity = A().identity();
      assertFalse(identity.ok);
      assertIncludes(identity.headline, 'in***@example.org');
      assertFalse(identity.headline.includes('inconnu.personne'), 'adresse masquée dans le diagnostic');
      assertTrue(A().problems().some(p => p.scope === 'identity'), 'compté dans la pastille');
    });

    it('colonne Email absente de l\'Annuaire reçu : le message le dit (règle par colonne ou colonne renommée)', async function () {
      await openTodoAs('inconnu.personne@example.org');
      const annuaire = JSON.parse(JSON.stringify(await window.grist.docApi.fetchTable('Annuaire')));
      delete annuaire.Email;
      A().noteRead('Annuaire', annuaire);
      const select = document.getElementById('todo-view-select');
      select.value = 'me'; fire(select, 'change');
      window.renderTodo();
      assertIncludes(document.getElementById('todo-identify-text').title, 'La colonne Email de l\'Annuaire n\'arrive pas au widget');
    });

    it('adresse illisible (ligne-sonde sans résultat) : le message explique la cause et n\'accuse pas Grist à tort', async function () {
      await openTodoAs('');
      assertFalse(document.getElementById('todo-identify-notice').hidden);
      const title = document.getElementById('todo-identify-text').title;
      assertIncludes(title, 'Email_utilisateur est vide');
      assertIncludes(title, 'user.Email');
      assertEqual(A().identity().headline, 'Votre adresse Grist n\'a pas pu être lue');
    });

    it('préférences refusées en écriture (règle d\'accès sur Preferences_Widget) : la cause est rapportée avec le message de Grist', async function () {
      await loadFixtureState();
      window.__mockSetTable('Preferences_Widget', { id: [1], Email_utilisateur: [''] });
      window.localStorage.setItem('suiviProjetInnovationS:prefsRowId', '1');
      await withDenied({ write: 'Blocked by table create access rules' }, async () => { await window.loadTodoUserPreferences(); });
      window.renderTodo();
      const select = document.getElementById('todo-view-select');
      select.value = 'me'; fire(select, 'change');
      const title = document.getElementById('todo-identify-text').title;
      assertIncludes(title, 'Preferences_Widget');
      assertIncludes(title, 'Blocked by table create access rules');
    });

    it('personne identifiée : aucun avertissement d\'identité, l\'adresse apparaît masquée dans le rapport', async function () {
      await openTodoAs('alice.martin@example.org');
      assertTrue(document.getElementById('todo-identify-notice').hidden);
      assertTrue(A().identity().ok);
      assertFalse(A().problems().some(p => p.scope === 'identity'));
      const report = A().reportLines().join('\n');
      assertIncludes(report, 'al***@example.org');
      assertFalse(report.includes('alice.martin'), 'jamais l\'adresse complète dans le rapport à copier');
    });

    it('maskEmail : deux premiers caractères, domaine conservé', function () {
      assertEqual(A().maskEmail('alice.martin@example.org'), 'al***@example.org');
      assertEqual(A().maskEmail('a@x.fr'), 'a***@x.fr');
      assertEqual(A().maskEmail(''), '');
    });
  });

  describe('Accès Grist — messages affichés (toasts, bandeaux de modale)', function () {
    it('toast : titre court, détail au clic, durée allongée, ouvre le panneau « Accès »', function () {
      let opened = false;
      const originalOpen = window.PerfTrace.open;
      window.PerfTrace.open = options => { opened = options && options.tab === 'access'; };
      try {
        A().toast(new Error(READ_DENIED), { lead: 'Échec de l\'ouverture', table: 'Lignes_OPE', op: 'read' });
        const toast = document.getElementById('toast');
        assertIncludes(toast.textContent, 'Échec de l\'ouverture : Lecture refusée');
        assertIncludes(toast.textContent, 'Cliquez pour le détail');
        assertTrue(toast.classList.contains('error') && toast.classList.contains('has-detail'));
        assertIncludes(toast.title, 'Pourquoi');
        toast.onclick();
        assertTrue(opened, 'le clic ouvre l\'onglet Accès du diagnostic');
        assertTrue(toast.classList.contains('hidden'), 'le toast se referme');
      } finally { window.PerfTrace.open = originalOpen; }
    });

    it('toast ordinaire : inchangé (pas de détail, pas de curseur « cliquable »)', function () {
      window.CoreUtils.showToast('Enregistré', false);
      const toast = document.getElementById('toast');
      assertFalse(toast.classList.contains('has-detail'));
      assertEqual(toast.title, '');
      assertEqual(toast.onclick, null);
    });

    it('toastFailure : même rendu, et note l\'échec dans le journal (même sans annotation de docApi)', function () {
      window.CoreUtils.toastFailure(new Error(UPDATE_DENIED), 'Échec de l\'écriture', { actions: [['UpdateRecord', 'Notifications', 5, { notifications_Statut: 'x' }]] });
      assertIncludes(document.getElementById('toast').textContent, 'Modification refusée');
      assertEqual(A().events()[0].table, 'Notifications');
    });

    it('showErrorBox : titre + détail repliable (Où, Pourquoi, À vérifier) dans le bandeau de la modale', function () {
      const box = document.createElement('div');
      window.CoreUtils.showErrorBox(box, new Error(COLUMN_UPDATE_DENIED), 'Modification impossible', { actions: [['UpdateRecord', 'Projets', 3, { Statut_Macro: 'x' }]] });
      assertIncludes(box.textContent, 'Modification impossible : Modification refusée');
      assertTrue(!!box.querySelector('details'), 'détail repliable');
      assertIncludes(box.querySelector('details').textContent, 'À vérifier');
      assertFalse(box.querySelector('details').open, 'replié par défaut : pas de place prise');
    });

    it('un message de Grist contenant du HTML est échappé dans le bandeau', function () {
      const box = document.createElement('div');
      window.CoreUtils.showErrorBox(box, new Error('<img src=x onerror=alert(1)>'), 'Échec', {});
      assertEqual(box.querySelector('img'), null);
      assertIncludes(box.textContent, '<img src=x');
    });

    it('sans le module de diagnostic, les anciens messages courts sont conservés', function () {
      const saved = window.CoreAccess;
      window.CoreAccess = undefined;
      try {
        const box = document.createElement('div');
        window.CoreUtils.showErrorBox(box, new Error('boum'), 'Échec', {});
        assertEqual(box.textContent, 'Échec : boum');
        assertEqual(window.CoreUtils.failureReason(new Error('boum')), 'boum');
      } finally { window.CoreAccess = saved; }
    });

    it('modale projet : un enregistrement refusé par une règle d\'accès explique la table, les colonnes et ce qu\'il faut vérifier', async function () {
      await loadFixtureState();
      const project = window.CoreState.getTable('Projets').find(p => p.id === 11);
      window.ProjectModal.open(project);
      const modal = document.getElementById('cp-project-modal');
      await withDenied({ write: UPDATE_DENIED }, async () => {
        const save = modal.querySelector('#cp-project-save, [data-cp-save], .cp-save');
        assertTrue(!!save, 'bouton d\'enregistrement');
        await (save.onclick ? save.onclick() : save.click());
        await wait(30);
      });
      const error = modal.querySelector('#cp-project-error');
      assertIncludes(error.textContent, 'Modification impossible');
      assertIncludes(error.textContent, 'Modification refusée');
      assertIncludes(error.textContent, 'Projets');
      assertIncludes(error.textContent, 'Voir en tant que');
    });

    it('page Administratif : changement d\'étape refusé → toast détaillé avec la table Notifications', async function () {
      await loadFixtureState();
      window.renderAdministratif();
      const button = document.querySelector('[data-advance-notif]');
      assertTrue(!!button, 'bouton « Suivant »');
      await withDenied({ write: UPDATE_DENIED }, async () => { fireMouse(button, 'click'); await wait(60); });
      const toast = document.getElementById('toast');
      assertIncludes(toast.textContent, 'Modification refusée');
      assertIncludes(toast.textContent, 'Cliquez pour le détail');
    });
  });

  describe('Accès Grist — panneau Alt+Maj+D, onglet « Accès »', function () {
    function closePanel() { document.querySelectorAll('.perf-panel').forEach(el => el.remove()); }

    it('l\'onglet Accès affiche le rapport « Permissions et accès » (tables lues, refus, références, identité)', async function () {
      await withDenied({ read: { Lignes_OPE: READ_DENIED } }, async () => { await window.CoreGrist.loadAllTables(); });
      closePanel();
      window.PerfTrace.open({ tab: 'access' });
      const area = document.querySelector('.perf-panel textarea');
      assertTrue(!!area, 'panneau ouvert');
      assertIncludes(area.value, 'Permissions et accès');
      assertIncludes(area.value, 'REFUSÉE Lignes_OPE');
      assertIncludes(area.value, 'Installation des fonds');
      assertIncludes(area.value, READ_DENIED);
      assertIncludes(area.value, 'Voir en tant que');
      closePanel();
    });

    it('le panneau garde son onglet Chargement par défaut (Alt+Maj+D inchangé) et « Copier » copie les deux rapports', function () {
      closePanel();
      window.PerfTrace.open();
      assertIncludes(document.querySelector('.perf-panel textarea').value, 'Diagnostic de chargement');
      const full = window.PerfTrace.report();
      assertIncludes(full, 'Diagnostic de chargement');
      assertIncludes(full, 'Permissions et accès');
      assertIncludes(window.PerfTrace.report('access'), 'Permissions et accès');
      assertFalse(window.PerfTrace.report('load').includes('Permissions et accès'));
      closePanel();
    });

    it('« Tester les accès » relit chaque table à la demande (jamais au démarrage), lit les règles et rapporte le résultat table par table', async function () {
      closePanel();
      window.PerfTrace.open({ tab: 'access' });
      const button = Array.from(document.querySelectorAll('.perf-panel button')).find(b => /Tester les accès/.test(b.textContent));
      assertTrue(!!button, 'bouton présent');
      window.__TEST_CALLS__.length = 0;
      await withDenied({ read: { Structures: READ_DENIED } }, async () => { await A().probe(); });
      const report = A().reportLines().join('\n');
      assertIncludes(report, 'Test des accès du');
      assertTrue(/ERREUR\s+Structures/.test(report), 'la table refusée est listée en erreur');
      assertTrue(/OK\s+Projets/.test(report), 'les tables lisibles sont listées OK');
      assertIncludes(report, 'Règles d\'accès : non lues', 'sans droit de propriétaire : le dit');
      closePanel();
    });

    it('aucune donnée de projet dans le rapport (noms de projets, personnes, adresses)', async function () {
      await loadFixtureState();
      A().noteReadFailure('Lignes_OPE', new Error(READ_DENIED));
      const report = A().reportLines().join('\n');
      ['INNOVX', 'NOTIFY', 'SIGNEX', 'CONVENTIX', 'Alice', 'Martin', 'Durand', 'example.org'].forEach(word => assertFalse(report.includes(word), `« ${word} » ne doit pas figurer dans le rapport`));
    });

    it('rapport sans problème : le résumé le dit et la méthode de vérification reste affichée', async function () {
      A()._reset();
      const report = A().reportLines().join('\n');
      assertIncludes(report, 'aucun problème d\'accès détecté');
      assertIncludes(report, 'Comment vérifier dans Grist');
    });
  });

  describe('Accès Grist — pastille ⚠ (aucune nouvelle ligne : dans l\'en-tête et la barre de filtres existante)', function () {
    const PAGES = { 'access-t-kanban': { label: 'Kanban', bar: '.project-filters' }, 'access-t-dashboard': { label: 'Dashboard', bar: '.project-filters' } };
    function skeleton() {
      const host = document.createElement('div');
      host.id = 'access-test-host';
      host.innerHTML = '<div class="header"><h1>Suivi</h1></div><section id="access-t-kanban"><div class="project-filters"><button id="x">x</button></div></section>' +
        '<section id="access-t-dashboard"><div class="project-filters"></div></section>';
      document.body.appendChild(host);
      const stale = document.getElementById('access-badge');
      if (stale) stale.remove();
      A()._reset();
      A().mountUi({ pages: PAGES });
      return host;
    }
    const cleanup = host => { host.remove(); const b = document.getElementById('access-badge'); if (b) b.remove(); A()._reset(); };

    it('masquée sans problème ; une table refusée l\'allume avec le nombre et le détail en infobulle ; elle se range dans h1 sans déplacer la navigation', function () {
      const host = skeleton();
      try {
        const badge = document.getElementById('access-badge');
        assertTrue(!!badge && badge.hidden, 'masquée sans problème');
        assertTrue(badge.parentElement.matches('h1'), 'dans le titre : la navigation garde sa place à droite');
        A().noteReadFailure('Lignes_OPE', new Error(READ_DENIED));
        A().flush();
        assertFalse(badge.hidden);
        assertTrue(Number(badge.querySelector('.access-count').textContent) >= 1);
        assertIncludes(badge.title, 'Lignes_OPE');
        assertIncludes(badge.title, 'Cliquez pour le détail');
        const dashboardFlag = host.querySelector('#access-t-dashboard .access-flag');
        assertTrue(!!dashboardFlag && !dashboardFlag.hidden, 'le Dashboard lit Lignes_OPE : sa pastille s\'allume');
        assertIncludes(dashboardFlag.title, 'Lignes_OPE');
        assertTrue(host.querySelector('#access-t-kanban .access-flag').hidden, 'le Kanban ne lit pas Lignes_OPE directement : pastille éteinte');
        assertEqual(host.querySelector('#access-t-dashboard .project-filters').children.length, 1, 'une seule pastille ajoutée, aucune ligne en plus');
      } finally { cleanup(host); }
    });

    it('une table qui redevient lisible éteint la pastille', function () {
      const host = skeleton();
      try {
        A().noteReadFailure('Lignes_OPE', new Error(READ_DENIED));
        A().flush();
        assertFalse(document.getElementById('access-badge').hidden);
        A().noteRead('Lignes_OPE', { id: [1], N_OPE: ['x'], installe_chez: [1], totalCPConsomme: [0] });
        A().flush();
        assertTrue(document.getElementById('access-badge').hidden);
      } finally { cleanup(host); }
    });

    it('le clic sur la pastille ouvre le panneau Alt+Maj+D sur l\'onglet Accès', function () {
      const host = skeleton();
      const originalOpen = window.PerfTrace.open;
      let tab = null;
      window.PerfTrace.open = options => { tab = options && options.tab; };
      try {
        A().noteReadFailure('Lignes_OPE', new Error(READ_DENIED));
        A().flush();
        document.getElementById('access-badge').click();
        assertEqual(tab, 'access');
        host.querySelector('#access-t-dashboard .access-flag').click();
        assertEqual(tab, 'access');
      } finally { window.PerfTrace.open = originalOpen; cleanup(host); }
    });
  });

  describe('Accès Grist — performance (pas d\'appel Grist de plus au démarrage)', function () {
    it('charger toutes les tables ne produit aucune lecture en plus de celles du widget, et aucune lecture des règles d\'accès', async function () {
      const reads = [];
      const docApi = api();
      const original = docApi.fetchTable;
      docApi.fetchTable = function (name, ...rest) { reads.push(name); return original.call(docApi, name, ...rest); };
      try { await window.CoreGrist.loadAllTables(); } finally { docApi.fetchTable = original; }
      assertFalse(reads.some(name => name.indexOf('_grist_ACL') === 0), 'les règles d\'accès ne sont lues que par « Tester les accès »');
      assertEqual(new Set(reads).size, reads.length, 'aucune table lue deux fois');
    });

    it('calculer les problèmes (pastille) ne fait aucun appel Grist', async function () {
      await loadFixtureState();
      window.__TEST_CALLS__.length = 0;
      let reads = 0;
      const docApi = api();
      const original = docApi.fetchTable;
      docApi.fetchTable = function (...args) { reads += 1; return original.apply(docApi, args); };
      try { A().problems(); A().reportLines(); } finally { docApi.fetchTable = original; }
      assertEqual(reads, 0);
      assertEqual(window.__TEST_CALLS__.length, 0);
    });
  });

  describe('Accès Grist — attentes déclarées (access-expectations.js)', function () {
    const SOURCES = {
      Kanban: ['../js/pages/page-projets.js'],
      Administratif: ['../js/pages/page-administratif.js'],
      'Installation des fonds': ['../js/pages/page-installation.js'],
      'To Do': ['../js/pages/page-todo.js', '../js/pages/page-installation.js', '../js/pages/installation-logic.js'],
      Dashboard: ['../js/pages/page-dashboard.js', '../js/pages/dashboard-logic.js', '../js/core/project-opes.js'],
      Annuaire: ['../js/pages/page-annuaire.js'],
      Instances: ['../js/pages/instances-data.js', '../js/pages/page-instances.js', '../js/pages/instances-logic.js'],
      'Modale projet': ['../js/components/project-modal.js', '../js/components/ope-modal.js', '../js/core/project-opes.js']
    };

    it('chaque colonne déclarée figure dans le code de l\'écran qui la lit (sinon l\'attente est périmée)', async function () {
      const cache = {};
      const read = async url => { if (!(url in cache)) { try { const res = await fetch(url, { cache: 'no-store' }); cache[url] = res.ok ? await res.text() : ''; } catch (err) { cache[url] = ''; } } return cache[url]; };
      const stale = [];
      for (const exp of A()._expectations()) {
        const urls = SOURCES[exp.label];
        if (!urls) { stale.push(`écran inconnu « ${exp.label} »`); continue; }
        const code = (await Promise.all(urls.map(read))).join('\n');
        assertTrue(code.length > 0, `sources de « ${exp.label} » lisibles`);
        exp.columns.forEach(col => { if (!code.includes(col) && !code.includes(col.replace(/_\d$/, ''))) stale.push(`${exp.table}.${col} (${exp.label})`); });
      }
      assertEqual(stale.join(', '), '', 'colonnes déclarées mais introuvables dans le code de leur écran');
    });

    it('chaque écran déclaré (libellé) a une pastille prévue dans la barre de filtres, ou est un écran sans barre assumé', function () {
      const withBar = new Set(Object.values(A()._pages).map(page => page.label));
      const labels = new Set(A()._expectations().map(exp => exp.label));
      labels.forEach(label => assertTrue(withBar.has(label) || ['Instances', 'Modale projet'].includes(label), `libellé « ${label} » sans pastille d'écran`));
    });
  });
})();
