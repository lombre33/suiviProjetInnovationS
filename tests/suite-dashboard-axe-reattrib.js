/**
 * Non-regression suite : Dashboard regroupé par axe InnovationS › action › projet, et réattributions sous leur projet (26/11/2026).
 *
 * Maquettes validées par Antoine le 26/11/2026 (planches « Focus » et « Réattributions »). Programmes.Axe_InnovationS (Choice) et
 * Actions_InnovationS (ChoiceList) ; réattribution = ligne de Projets reliée à sa mère par Projet_Parent_le_cas_echeant_, montants = complément.
 * Données fictives uniquement.
 */
(function () {
  'use strict';

  const L = () => window.DashboardLogic;
  const UTC = (y, m, d) => Date.UTC(y, m - 1, d) / 1000;
  const PROGRAMMES = [
    { id: 1, Programme: 'Prog 1', Axe_InnovationS: 'Axe A', Actions_InnovationS: ['L', 'Action A1'] },
    { id: 2, Programme: 'Prog 2', Axe_InnovationS: 'Axe A', Actions_InnovationS: ['L', 'Action A1', 'Action A2'] },
    { id: 3, Programme: 'Prog 3', Axe_InnovationS: 'Axe B', Actions_InnovationS: ['L', 'Action B1'] },
    { id: 4, Programme: 'Prog 4' },
    { id: 5, Programme: 'Prog 5', Axe_InnovationS: 'Axe B' }
  ];
  const p = (id, acr, programme, att, extra) => Object.assign({ id, Acronyme: acr, Projet: acr, Programme: programme, Statut_operationnel_projet: 'en cours', c2026_M10_Fonctionnement: att }, extra);
  const PROJETS = [p(1, 'UN', 1, 100), p(2, 'DEUX', 2, 200), p(3, 'TROIS', 3, 300), p(4, 'QUATRE', 4, 400), p(5, 'CINQ', 5, 50)];
  const build = (overrides = {}) => L().buildDataset(Object.assign({ projets: PROJETS, programmes: PROGRAMMES, lignes: [], depenses: [] }, overrides));
  const run = (state, overrides) => L().compute(build(overrides), Object.assign({ years: [2026] }, state));
  const labels = list => list.map(item => item.label);
  const acrs = list => list.map(entry => entry.project.acronyme);

  describe('Dashboard — regroupement Axe › Action › Projet', function () {
    it('un volet par axe (« Sans axe renseigné » en dernier), les actions dedans, les projets dessous', function () {
      const model = run();
      assertEqual(model.axeAvailable, true);
      assertEqual(model.groupBy, 'axe');
      assertDeepEqual(labels(model.axeGroups), ['Axe A', 'Axe B', 'Sans axe renseigné']);
      const axeA = model.axeGroups[0];
      assertDeepEqual(labels(axeA.subs), ['Action A1', 'Action A2']);
      assertDeepEqual(acrs(axeA.subs[0].projects), ['DEUX', 'UN']);
      assertDeepEqual(acrs(axeA.subs[1].projects), ['DEUX']);
      assertEqual(axeA.projects.length, 0, 'un axe nommé range ses projets sous ses actions');
      const none = model.axeGroups[2];
      assertEqual(none.noAxe, true);
      assertDeepEqual(acrs(none.projects), ['QUATRE'], 'un programme sans axe : projets directement dans le groupe');
    });

    it('un projet est compté une fois dans son axe et dans chaque action de son programme (la somme des actions dépasse l\'axe)', function () {
      const axeA = run().axeGroups[0];
      assertEqual(axeA.att, 300, 'UN 100 + DEUX 200, une seule fois');
      assertEqual(axeA.count, 2);
      assertEqual(axeA.subs[0].att, 300);
      assertEqual(axeA.subs[1].att, 200);
      assertEqual(axeA.subs[0].att + axeA.subs[1].att, 500);
      assertEqual(axeA.subs[0].projects.find(entry => entry.project.acronyme === 'DEUX').multi, 2, 'repère « 2 actions »');
      assertEqual(axeA.subs[0].projects.find(entry => entry.project.acronyme === 'UN').multi, undefined);
    });

    it('un axe dont le programme n\'a pas d\'action range ses projets sous « Sans action renseignée »', function () {
      const axeB = run().axeGroups[1];
      assertDeepEqual(labels(axeB.subs), ['Action B1', 'Sans action renseignée']);
      assertDeepEqual(acrs(axeB.subs[1].projects), ['CINQ']);
      assertEqual(axeB.subs[1].noAction, true);
    });

    it('le total de l\'ensemble ne change pas : chaque projet est compté une fois dans les axes', function () {
      const model = run();
      assertEqual(model.axeGroups.reduce((sum, group) => sum + group.att, 0), model.kpi.att);
      assertEqual(model.groups.reduce((sum, group) => sum + group.att, 0), model.kpi.att);
    });

    it('sans axe ni action dans Grist, le regroupement par programme reste seul ; le choix « Programme › Projet » est respecté', function () {
      const plain = run({}, { programmes: PROGRAMMES.map(row => ({ id: row.id, Programme: row.Programme })) });
      assertEqual(plain.axeAvailable, false);
      assertEqual(plain.groupBy, 'programme');
      assertEqual(plain.axeGroups.length, 0);
      assertEqual(run({ groupBy: 'programme' }).groupBy, 'programme');
      assertEqual(run({ groupBy: 'programme' }).axeGroups.length, 3, 'les volets par axe restent calculés, la page choisit');
    });

    it('les listes à valeurs multiples de Grist sont lues : [\'L\', …], tableau simple, texte à virgules', function () {
      const model = run({}, { programmes: [
        { id: 1, Programme: 'A', Axe_InnovationS: 'X', Actions_InnovationS: ['L', 'a1', 'a2'] },
        { id: 2, Programme: 'B', Axe_InnovationS: 'X', Actions_InnovationS: ['b1'] },
        { id: 3, Programme: 'C', Axe_InnovationS: 'X', Actions_InnovationS: 'c1, c2' }] });
      assertDeepEqual(labels(model.axeGroups[0].subs), ['a1', 'a2', 'b1', 'c1', 'c2']);
    });

    it('la table plate de Grist-BI porte l\'axe et les actions (réunies pour un projet à plusieurs actions)', function () {
      const rows = L().biRows(run());
      const deux = rows.find(row => row.Projet === 'DEUX'), quatre = rows.find(row => row.Projet === 'QUATRE'), cinq = rows.find(row => row.Projet === 'CINQ');
      assertEqual(deux.Axe, 'Axe A'); assertEqual(deux.Action, 'Action A1 + Action A2');
      assertEqual(quatre.Axe, 'Sans axe renseigné'); assertEqual(quatre.Action, 'Sans action renseignée');
      assertEqual(cinq.Axe, 'Axe B'); assertEqual(cinq.Action, 'Sans action renseignée');
      assertTrue(L().BI_COLUMNS.some(c => c.id === 'Axe') && L().BI_COLUMNS.some(c => c.id === 'Action'));
    });
  });

  describe('Dashboard — réattributions sous leur projet', function () {
    const PROG = [{ id: 1, Programme: 'P' }, { id: 2, Programme: 'Q' }];
    const LIGNES = [{ id: 1, N_OPE: 'OPE-R', totalCPConsomme: 200 }];
    const mother = (extra) => p(1, 'MERE', 1, 100, Object.assign({ Ligne_OPE: ['L', 1] }, extra));
    const kid = (id, acr, att, parent, date, extra) => p(id, acr, 1, att, Object.assign({ Ligne_OPE: ['L', 1], Projet_Parent_le_cas_echeant_: parent, prolongation_DateCTOInitial: date, prolongation_numeroDecisionInitial: `DEC-${id}` }, extra));
    const DEPENSES = [{ id: 1, Exercice: 2026, Code_operation: 'OPE-R', Nature_depense: 'M10', CP_consomme: 60, AE_consomme: 60, Fournisseur: 'ACME', Date_creation: UTC(2026, 2, 1) }];
    const family = () => [mother(), kid(2, 'FILLE1', 40, 1, UTC(2026, 9, 2)), kid(3, 'FILLE2', 30, 1, UTC(2026, 5, 18))];
    const go = (state, projets, extra) => L().compute(L().buildDataset({ projets: projets || family(), programmes: PROG, lignes: LIGNES, depenses: DEPENSES }), Object.assign({ years: [2026] }, state), extra);

    it('sous leur projet : la mère porte mère + réattributions, les filles passent dessous dans l\'ordre de leur date', function () {
      const group = go().groups[0];
      assertEqual(group.count, 1, 'une ligne de projet, les réattributions sont dessous');
      const mere = group.projects[0];
      assertEqual(mere.project.acronyme, 'MERE');
      assertEqual(mere.att, 170, '100 + 40 + 30 (montants des lignes filles = complément)');
      assertEqual(mere.ownAtt, 100);
      assertDeepEqual(acrs(mere.kids), ['FILLE2', 'FILLE1'], 'triées par date de décision');
      assertEqual(mere.kids[0].project.decision, 'DEC-3');
      assertEqual(mere.kids[0].project.decisionDate, '2026-05-18');
      assertEqual(mere.pct, '35 %', 'le pourcentage se calcule sur le total du groupe : 60 / 170');
    });

    it('le consommé reste sur la mère et le cumul de la ligne OPE n\'est compté qu\'une fois (jamais re-compté par les filles)', function () {
      const model = go({ years: null });
      const mere = model.groups[0].projects[0];
      assertEqual(mere.cons, 200, '60 détaillés + 140 sans année, une seule fois');
      assertEqual(mere.kids[0].cons, 0);
      assertEqual(mere.kids[1].cons, 0);
      assertEqual(model.kpi.cons, 200);
      assertEqual(model.kpi.att, 170);
    });

    it('la mère porte le consommé même quand une fille est écrite avant elle dans Projets', function () {
      const model = go({ years: null }, [kid(2, 'FILLE1', 40, 1, UTC(2026, 9, 2)), mother()]);
      const mere = model.groups[0].projects[0];
      assertEqual(mere.project.acronyme, 'MERE');
      assertEqual(mere.cons, 200);
      assertEqual(model.kpi.cons, 200);
      assertEqual(mere.opes[0].expenses.length, 1, 'les dépenses détaillées vont à la mère');
    });

    it('à plat : mêmes totaux, une ligne par projet ; la mère est « initial », les filles « reattrib » sans consommé', function () {
      const flat = go({ reattrib: 'flat' }), group = go();
      assertEqual(flat.groups[0].count, 3);
      assertDeepEqual(acrs(flat.groups[0].projects), ['FILLE1', 'FILLE2', 'MERE']);
      const byAcr = Object.fromEntries(flat.groups[0].projects.map(entry => [entry.project.acronyme, entry]));
      assertEqual(byAcr.MERE.role, 'initial'); assertEqual(byAcr.MERE.att, 100, 'à plat, la mère ne montre que son montant initial');
      assertEqual(byAcr.FILLE1.role, 'reattrib'); assertEqual(byAcr.FILLE1.cons, 0);
      assertEqual(flat.groups[0].att, group.groups[0].att, 'totaux du programme inchangés');
      assertEqual(flat.groups[0].cons, group.groups[0].cons);
      assertEqual(flat.kpi.att, group.kpi.att);
      assertEqual(flat.count, 3); assertEqual(group.count, 1);
    });

    it('une réattribution dont la mère n\'est pas dans la liste (autre programme, filtrée) reste seule, marquée « reattrib »', function () {
      const other = go({}, [mother(), kid(2, 'FILLE1', 40, 1, UTC(2026, 9, 2), { Programme: 2 })]);
      assertEqual(other.groups.length, 2);
      const q = other.groups.find(group => group.programme === 'Q');
      assertDeepEqual(acrs(q.projects), ['FILLE1']);
      assertEqual(q.projects[0].role, 'reattrib');
      const filtered = go({ search: 'fille' });
      assertDeepEqual(acrs(filtered.groups[0].projects), ['FILLE1', 'FILLE2'], 'mère filtrée : les filles restent des lignes');
    });

    it('le statut et les années choisis s\'appliquent à chaque ligne ; une fille masquée par ses montants sort du total de la mère', function () {
      const model = go({ years: [2025] }, [mother({ c2025_M10_Fonctionnement: 10 }), kid(2, 'FILLE1', 40, 1, UTC(2026, 9, 2), { c2025_M10_Fonctionnement: 0, c2026_M10_Fonctionnement: 40 })]);
      const mere = model.groups[0].projects[0];
      assertEqual(mere.att, 10);
      assertEqual(mere.kids.length, 0, 'sans montant sur 2025 la fille n\'est pas listée');
    });

    it('chaînes et cycles : une fille de fille remonte à la mère ; un cycle ne plante pas et laisse deux lignes', function () {
      const chain = go({}, [mother(), kid(2, 'FILLE1', 40, 1, UTC(2026, 9, 2)), kid(3, 'PETITE', 30, 2, UTC(2026, 10, 2))]);
      assertDeepEqual(acrs(chain.groups[0].projects[0].kids), ['FILLE1', 'PETITE']);
      assertEqual(chain.groups[0].projects[0].att, 170);
      const cycle = go({}, [p(1, 'A', 1, 10, { Projet_Parent_le_cas_echeant_: 2 }), p(2, 'B', 1, 20, { Projet_Parent_le_cas_echeant_: 1 })]);
      assertDeepEqual(acrs(cycle.groups[0].projects), ['A', 'B']);
      assertEqual(go({}, [p(1, 'SOI', 1, 10, { Projet_Parent_le_cas_echeant_: 1 })]).groups[0].projects.length, 1);
    });

    it('le choix de la page : réattributions disponibles seulement quand un projet a un parent', function () {
      assertEqual(go().reattrib.available, true);
      assertEqual(go().reattrib.group, true);
      assertEqual(go({ reattrib: 'flat' }).reattrib.group, false);
      assertEqual(go({}, [mother()]).reattrib.available, false);
    });

    it('sans réattribution, rien ne change : le consommé d\'une ligne OPE partagée par deux projets indépendants n\'est compté que sur le premier', function () {
      const model = go({ years: null }, [p(1, 'PREMIER', 1, 100, { Ligne_OPE: ['L', 1] }), p(2, 'SECOND', 1, 100, { Ligne_OPE: ['L', 1] })]);
      assertEqual(model.kpi.cons, 200, 'et non 340');
      assertEqual(model.groups[0].projects.find(entry => entry.project.acronyme === 'SECOND').cons, 0);
    });
  });

  // ===========================================================================================================
  // Page
  const P = () => window.DashboardPage;
  const byId = id => document.getElementById(id);
  const view = () => byId('view-dashboard');
  const list = () => byId('db-list');
  const click = el => fireMouse(el, 'click');
  const norm = text => String(text).replace(/ | /g, ' ');
  const columnar = rows => {
    const columns = Array.from(new Set(rows.flatMap(row => Object.keys(row)).filter(key => key !== 'id')));
    const out = { id: rows.map(row => row.id) };
    columns.forEach(col => { out[col] = rows.map(row => (row[col] === undefined ? null : row[col])); });
    return out;
  };
  async function loadPage(programmes, projets, lignes, depenses) {
    window.__mockSetTable('Projets', columnar(projets));
    window.__mockSetTable('Programmes', columnar(programmes));
    window.__mockSetTable('Lignes_OPE', columnar(lignes && lignes.length ? lignes : [{ id: 1, N_OPE: 'OPE-R', totalCPConsomme: 0 }]));
    window.__mockSetTable('Depenses_OPE', columnar(depenses || []));
    window.__mockSetTable('_grist_Tables', { id: [1], tableId: ['Projets'] });
    window.__mockSetTable('_grist_Tables_column', { id: [], parentId: [], colId: [], type: [], widgetOptions: [], description: [] });
    await window.CoreGrist.loadColumnDescriptions();
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    P().resetState(); P().resetPrefsRow();
    P().state.engine = 'maison';
    P().state.years = [2026];
    view().classList.remove('hidden');
    window.renderDashboard();
    await waitFor(() => P().state.expensesState === 'ready', 'dépenses lues');
  }
  function unload() { view().classList.add('hidden'); P().resetState(); P().resetPrefsRow(); }
  const group = key => list().querySelector(`[data-db-group="${key}"]`);
  const head = key => group(key).querySelector(':scope > .db-vhead');
  const groupNames = () => Array.from(list().querySelectorAll(':scope > .db-vol > .db-vhead .db-pn')).map(el => el.textContent);
  const prow = acr => Array.from(list().querySelectorAll('.db-prow:not(.db-kid)')).find(row => row.querySelector('.db-acr').textContent === acr);
  const prefUpdates = () => window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && c.table === 'Preferences_Widget');

  describe('Dashboard — page : regroupement par axe', function () {
    it('par défaut un volet par axe (« Sans axe renseigné » en dernier) ; un axe s\'ouvre sur ses actions, une action sur ses projets', async function () {
      await loadPage(PROGRAMMES, PROJETS);
      assertDeepEqual(groupNames(), ['Axe A', 'Axe B', 'Sans axe renseigné']);
      assertEqual(list().querySelectorAll('.db-vbody').length, 0, 'tout est replié');
      click(head('axe|Axe A'));
      assertDeepEqual(Array.from(group('axe|Axe A').querySelectorAll('.db-sub > .db-vhead .db-pn')).map(el => el.textContent), ['Action A1', 'Action A2']);
      click(head('act|Axe A|Action A1'));
      assertDeepEqual(Array.from(group('act|Axe A|Action A1').querySelectorAll('.db-acr')).map(el => el.textContent), ['DEUX', 'UN']);
      assertEqual(norm(prow('DEUX').querySelector('.db-multi').textContent), '2 actions', 'repère « 2 actions » dans les listes par action');
      click(head('axe|Axe A')); // le volet de l'axe se replie
      assertEqual(group('axe|Axe A').querySelectorAll('.db-vbody').length, 0);
      unload();
    });

    it('le total de la liste est celui des projets, une seule fois ; le volet d\'un axe additionne ses projets', async function () {
      await loadPage(PROGRAMMES, PROJETS);
      assertEqual(norm(byId('db-total-att').textContent), '1 050 €');
      assertEqual(norm(group('axe|Axe A').querySelector(':scope > .db-vhead .db-att').textContent), '300 €');
      assertIncludes(group('axe|').textContent, 'à renseigner dans Grist');
      unload();
    });

    it('le choix « Programme › Projet » revient aux volets de programme et est retenu par personne (Dash_regroupement)', async function () {
      await loadPage(PROGRAMMES, PROJETS);
      await window.loadKanbanUserPreferences();
      await window.loadDashboardUserPreferences();
      window.__TEST_CALLS__.length = 0;
      click(list().querySelector('[data-db-groupby="programme"]'));
      assertDeepEqual(groupNames(), ['Prog 1', 'Prog 2', 'Prog 3', 'Prog 4', 'Prog 5']);
      await P().savePreferences();
      assertEqual(prefUpdates().slice(-1)[0].fields.Dash_regroupement, 'programme');
      click(list().querySelector('[data-db-groupby="axe"]'));
      await P().savePreferences();
      assertEqual(prefUpdates().slice(-1)[0].fields.Dash_regroupement, '');
      unload();
    });

    it('sans axe ni action dans Grist : volets de programme, pas de choix de regroupement', async function () {
      await loadPage(PROGRAMMES.map(row => ({ id: row.id, Programme: row.Programme })), PROJETS);
      assertEqual(list().querySelectorAll('[data-db-groupby]').length, 0);
      assertDeepEqual(groupNames(), ['Prog 1', 'Prog 2', 'Prog 3', 'Prog 4', 'Prog 5']);
      unload();
    });

    it('les graphiques Grist-BI suivent le regroupement : l\'axe et l\'action remplacent le programme', function () {
      const axe = window.DashboardBi.presetConfig('axe').pages[0].tiles, prog = window.DashboardBi.presetConfig().pages[0].tiles;
      assertEqual(prog.find(t => t.id === 'p_prog').dimension, 'Programme');
      assertEqual(axe.find(t => t.id === 'p_prog').dimension, 'Axe');
      assertEqual(axe.find(t => t.id === 'p_reste').dimension, 'Action');
      assertEqual(axe.length, 4);
      assertEqual(window.DashboardBi.presetRow('T', 1, 'axe').ConfigJSON, JSON.stringify(window.DashboardBi.presetConfig('axe')));
    });
  });

  describe('Dashboard — page : réattributions sous leur projet', function () {
    const PROG = [{ id: 1, Programme: 'P' }];
    const LIGNES = [{ id: 1, N_OPE: 'OPE-R', totalCPConsomme: 200 }];
    const FAMILY = [
      p(1, 'MERE', 1, 100, { Ligne_OPE: ['L', 1] }),
      p(2, 'FILLE1', 1, 40, { Ligne_OPE: ['L', 1], Projet_Parent_le_cas_echeant_: 1, prolongation_DateCTOInitial: UTC(2026, 9, 2), prolongation_numeroDecisionInitial: 'DEC-52' }),
      p(3, 'FILLE2', 1, 30, { Ligne_OPE: ['L', 1], Projet_Parent_le_cas_echeant_: 1, prolongation_DateCTOInitial: UTC(2026, 5, 18), prolongation_numeroDecisionInitial: 'DEC-31' })
    ];
    const DEP = [{ id: 1, Exercice: 2026, Code_operation: 'OPE-R', Nature_depense: 'M10', CP_consomme: 60, AE_consomme: 60, Fournisseur: 'ACME', Date_creation: UTC(2026, 2, 1) }];
    const open = () => click(list().querySelector('.db-vhead'));

    it('une seule ligne pour le projet et ses réattributions : total additionné, repère « + 2 réattributions », filles repliées', async function () {
      await loadPage(PROG, FAMILY, LIGNES, DEP);
      open();
      assertEqual(list().querySelectorAll('.db-prow').length, 1);
      assertEqual(norm(prow('MERE').querySelector('.db-att').textContent), '170 €');
      assertEqual(norm(prow('MERE').querySelector('[data-db-kids]').textContent), '+ 2 réattributions');
      assertEqual(norm(byId('db-total-att').textContent), '170 €');
      unload();
    });

    it('le repère déplie les réattributions dans l\'ordre de leur date, avec décision et date ; consommé « — » (compté sur la mère)', async function () {
      await loadPage(PROG, FAMILY, LIGNES, DEP);
      open();
      click(prow('MERE').querySelector('[data-db-kids]'));
      const kids = Array.from(list().querySelectorAll('.db-kid'));
      assertEqual(kids.length, 2);
      assertIncludes(norm(kids[0].textContent), 'Réattribution 1'); assertIncludes(kids[0].textContent, 'DEC-31'); assertIncludes(kids[0].textContent, 'le 18/05/2026');
      assertIncludes(kids[1].textContent, 'DEC-52'); assertIncludes(kids[1].textContent, 'le 02/09/2026');
      assertEqual(norm(kids[0].querySelector('.db-att').textContent), '30 €');
      assertEqual(kids[0].querySelector('.db-cons').textContent, '—');
      click(prow('MERE').querySelector('[data-db-kids]'));
      assertEqual(list().querySelectorAll('.db-kid').length, 0, 'se replie');
      unload();
    });

    it('« À plat » : une ligne par projet, la mère « initial », les filles « réattribution » ; le choix est retenu par personne (Dash_reattributions)', async function () {
      await loadPage(PROG, FAMILY, LIGNES, DEP);
      await window.loadKanbanUserPreferences();
      await window.loadDashboardUserPreferences();
      window.__TEST_CALLS__.length = 0;
      open();
      click(list().querySelector('[data-db-reattrib="flat"]'));
      assertEqual(list().querySelectorAll('.db-prow').length, 3);
      assertEqual(norm(prow('MERE').querySelector('.db-att').textContent), '100 €');
      assertIncludes(prow('MERE').textContent, 'initial');
      assertIncludes(prow('FILLE1').textContent, 'réattribution');
      assertEqual(prow('FILLE1').querySelector('.db-cons').textContent, '—');
      assertEqual(norm(byId('db-total-att').textContent), '170 €', 'même total dans les deux modes');
      await P().savePreferences();
      assertEqual(prefUpdates().slice(-1)[0].fields.Dash_reattributions, 'flat');
      click(list().querySelector('[data-db-reattrib="group"]'));
      await P().savePreferences();
      assertEqual(prefUpdates().slice(-1)[0].fields.Dash_reattributions, '');
      unload();
    });

    it('le choix des réattributions n\'apparaît que s\'il existe des réattributions', async function () {
      await loadPage(PROG, [FAMILY[0]], LIGNES, DEP);
      assertEqual(list().querySelectorAll('[data-db-reattrib]').length, 0);
      unload();
    });
  });
})();
