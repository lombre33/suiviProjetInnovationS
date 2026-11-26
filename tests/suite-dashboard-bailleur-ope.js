/**
 * Non-regression suite : bailleur de chaque OPE dans le Dashboard et dépenses détaillées par OPE puis par grande masse (26/11/2026).
 *
 * Règle d'Antoine : Idex ne doit pas être dans le Dashboard par défaut ; le bailleur est lu OPE par OPE (Projets.Bailleur, Bailleur_2/_3/_4,
 * vide = InnovationS) ; les dépenses détaillées se regardent par OPE puis par masse (fonctionnement, investissement, personnel).
 * Données fictives uniquement.
 */
(function () {
  'use strict';

  const L = () => window.DashboardLogic;
  const PROGRAMMES = [{ id: 1, Programme: 'P1' }];
  const LIGNES = [
    { id: 1, N_OPE: 'OPE-A1', N_OPE_LibelleOperation: 'Libellé A1', totalCPConsomme: 1000 },
    { id: 2, N_OPE: 'OPE-D1', N_OPE_LibelleOperation: 'Libellé D1', totalCPConsomme: 0 },
    { id: 3, N_OPE: 'OPE-I1', totalCPConsomme: 300 },
    { id: 4, N_OPE: 'OPE-M1', totalCPConsomme: 0 },
    { id: 5, N_OPE: 'OPE-M2', totalCPConsomme: 0 },
    { id: 6, N_OPE: 'OPE-D2', totalCPConsomme: 0 }
  ];
  const p = (id, acr, extra) => Object.assign({ id, Acronyme: acr, Projet: acr, Programme: 1, Statut_operationnel_projet: 'en cours' }, extra);
  const PROJETS = [
    // Tout InnovationS (colonne Bailleur vide) : totaux d'origine.
    p(1, 'INNO', { Ligne_OPE: ['L', 1], c2026_M10_Fonctionnement: 800, c2026_M30_Personnel: 200 }),
    // Tout Idex : absent par défaut.
    p(2, 'IDEXONLY', { Ligne_OPE: ['L', 3], Bailleur: 'Idex', c2026_M20_Investissement: 600 }),
    // Deux OPE : OPE 1 InnovationS, OPE 2 Idex.
    p(3, 'MIXTE', { Ligne_OPE: ['L', 4], Ligne_OPE_2: ['L', 5], Bailleur: 'InnovationS', Bailleur_2: 'Idex', c2026_M10_Fonctionnement: 100, c2026_M10_Fonctionnement_2: 400, c2026_M20_Investissement_2: 50 }),
    // Un bailleur inattendu compte avec Idex.
    p(4, 'ANR', { Bailleur: 'ANR', c2026_M10_Fonctionnement: 70 }),
    // Deux OPE InnovationS.
    p(5, 'DUO', { Ligne_OPE: ['L', 2], Ligne_OPE_2: ['L', 6], c2026_M10_Fonctionnement: 300, c2026_M10_Fonctionnement_2: 200 })
  ];
  const DEPENSES = [
    { id: 1, Exercice: 2026, Code_operation: 'OPE-A1', Nature_depense: 'M10', CP_consomme: 100, AE_consomme: 150, Fournisseur: 'ACME', Date_creation: Date.UTC(2026, 2, 1) / 1000 },
    { id: 2, Exercice: 2026, Code_operation: 'OPE-A1', Nature_depense: 'M30 Personnel', CP_consomme: 400, AE_consomme: 400, Fournisseur: 'RH', Date_creation: Date.UTC(2026, 3, 1) / 1000 },
    { id: 3, Exercice: 2026, Code_operation: 'OPE-D2', Nature_depense: 'Divers', CP_consomme: 50, AE_consomme: 50, Fournisseur: 'ZED', Date_creation: Date.UTC(2026, 4, 1) / 1000 },
    { id: 7, Exercice: 2026, Code_operation: 'OPE-D1', Nature_depense: 'M10', CP_consomme: 10, AE_consomme: 10, Fournisseur: 'D1A', Date_creation: Date.UTC(2026, 1, 1) / 1000 },
    { id: 8, Exercice: 2026, Code_operation: 'OPE-D1', Nature_depense: 'M30', CP_consomme: 20, AE_consomme: 20, Fournisseur: 'D1B', Date_creation: Date.UTC(2026, 1, 2) / 1000 },
    { id: 4, Exercice: 2026, Code_operation: 'OPE-I1', Nature_depense: 'M20', CP_consomme: 200, AE_consomme: 200, Fournisseur: 'IDEX SA', Date_creation: Date.UTC(2026, 5, 1) / 1000 },
    { id: 5, Exercice: 2026, Code_operation: 'OPE-M1', Nature_depense: 'M10', CP_consomme: 30, AE_consomme: 30, Fournisseur: 'M1', Date_creation: Date.UTC(2026, 6, 1) / 1000 },
    { id: 6, Exercice: 2026, Code_operation: 'OPE-M2', Nature_depense: 'M20', CP_consomme: 90, AE_consomme: 90, Fournisseur: 'M2', Date_creation: Date.UTC(2026, 7, 1) / 1000 }
  ];
  const dataset = () => L().buildDataset({ projets: PROJETS, programmes: PROGRAMMES, lignes: LIGNES, depenses: DEPENSES });
  const run = state => L().compute(dataset(), Object.assign({ years: [2026] }, state));
  const entries = model => model.groups.flatMap(group => group.projects);
  const find = (model, acr) => entries(model).find(entry => entry.project.acronyme === acr);
  const acrs = model => entries(model).map(entry => entry.project.acronyme).sort();

  describe('Dashboard — bailleur de chaque OPE (Idex exclu par défaut)', function () {
    it('par défaut seul InnovationS est compté : un projet tout Idex disparaît, la valeur vide vaut InnovationS', function () {
      const model = run();
      assertDeepEqual(acrs(model), ['DUO', 'INNO', 'MIXTE']);
      assertEqual(model.bailleur.hidden, 2, 'IDEXONLY et ANR masqués');
      assertEqual(model.bailleur.idexProjects, 3, 'projets ayant au moins une OPE hors InnovationS : IDEXONLY, MIXTE, ANR');
      assertEqual(model.bailleur.innovations, true);
      assertEqual(model.bailleur.idex, false);
    });

    it('un projet à deux bailleurs ne montre que la part des OPE comptées, avec le repère « OPE exclue »', function () {
      const model = run();
      const mixte = find(model, 'MIXTE');
      assertEqual(mixte.att, 100, 'OPE 1 seule (InnovationS), pas les 450 de l\'OPE 2 Idex');
      assertEqual(mixte.cons, 30, 'dépenses de l\'OPE 1 seule');
      assertEqual(mixte.excludedOpes, 1);
      assertEqual(mixte.opes.length, 1);
      assertEqual(mixte.expenses.length, 1);
      assertEqual(find(model, 'INNO').excludedOpes, 0);
    });

    it('un projet entièrement InnovationS garde exactement ses totaux d\'origine (aucun changement quand rien n\'est exclu)', function () {
      const model = run();
      const inno = find(model, 'INNO');
      assertEqual(inno.att, 1000);
      assertEqual(inno.cons, 500, '100 + 400 de dépenses détaillées');
      const allYears = entries(L().compute(dataset(), {})).find(entry => entry.project.acronyme === 'INNO');
      assertEqual(allYears.undetailed, 500, 'reliquat sans année (toutes années choisies) : 1 000 sur la ligne − 500 détaillés');
    });

    it('avec la puce Idex en plus : tout est compté (les totaux incluent les OPE Idex et le bailleur inattendu)', function () {
      const model = run({ idex: true });
      assertDeepEqual(acrs(model), ['ANR', 'DUO', 'IDEXONLY', 'INNO', 'MIXTE']);
      assertEqual(find(model, 'MIXTE').att, 550);
      assertEqual(find(model, 'MIXTE').excludedOpes, 0);
      assertEqual(find(model, 'ANR').att, 70);
      assertEqual(model.kpi.att, 1000 + 600 + 550 + 70 + 500);
    });

    it('Idex seul : les projets InnovationS disparaissent, un projet mixte ne montre que son OPE Idex', function () {
      const model = run({ innovations: false, idex: true });
      assertDeepEqual(acrs(model), ['ANR', 'IDEXONLY', 'MIXTE']);
      assertEqual(find(model, 'MIXTE').att, 450);
      assertEqual(find(model, 'MIXTE').opes[0].rank, 2);
    });

    it('jamais aucun bailleur : les deux décochés valent InnovationS', function () {
      const model = run({ innovations: false, idex: false });
      assertDeepEqual(acrs(model), ['DUO', 'INNO', 'MIXTE']);
      assertEqual(model.bailleur.innovations, true);
    });

    it('les totaux du bandeau, les groupes et la table plate de Grist-BI suivent le choix des bailleurs', function () {
      const inn = run();
      assertEqual(inn.kpi.att, 1000 + 100 + 500, 'INNO + MIXTE (OPE 1) + DUO');
      assertEqual(inn.groups[0].att, inn.kpi.att);
      const bi = L().biRows(inn).filter(row => row.Mesure === 'Attribué').map(row => row.Projet).sort();
      assertDeepEqual(Array.from(new Set(bi)), ['DUO', 'INNO', 'MIXTE']);
      assertTrue(!L().biRows(inn).some(row => row.Projet === 'IDEXONLY'));
      const both = run({ idex: true });
      assertTrue(L().biRows(both).some(row => row.Projet === 'IDEXONLY'));
    });

    it('bailleurClass : vide et « InnovationS » (casse libre) = InnovationS ; tout le reste = Idex et autres', function () {
      assertEqual(L().bailleurClass(''), 'inn');
      assertEqual(L().bailleurClass(' innovationS '), 'inn');
      assertEqual(L().bailleurClass('Idex'), 'idx');
      assertEqual(L().bailleurClass('ANR'), 'idx');
    });
  });

  describe('Dashboard — dépenses détaillées par OPE puis par grande masse', function () {
    it('masseOf lit M10/M20/M30 (avec ou sans suite) ou le libellé de la masse, le reste n\'est pas classé', function () {
      const m = L().masseOf;
      assertEqual(m('M10'), 'M10_Fonctionnement');
      assertEqual(m('M20 - Investissement'), 'M20_Investissement');
      assertEqual(m('m30'), 'M30_Personnel');
      assertEqual(m('Dépenses de fonctionnement'), 'M10_Fonctionnement');
      assertEqual(m('Personnel'), 'M30_Personnel');
      assertEqual(m('Divers'), '');
      assertEqual(m('2031'), '', 'un code comptable qui commence par des chiffres voisins n\'est pas une masse');
      assertEqual(m(''), '');
    });

    it('chaque OPE porte ses dépenses (classées par masse), son bailleur, le libellé de sa ligne et son attribué par masse', function () {
      const duo = find(run(), 'DUO');
      assertEqual(duo.opes.length, 2);
      const [first, second] = duo.opes;
      assertEqual(first.codes[0], 'OPE-D1');
      assertEqual(first.libelle, 'Libellé D1');
      assertEqual(first.bailleur, 'InnovationS');
      assertDeepEqual(first.expenses.map(e => e.masse).sort(), ['M10_Fonctionnement', 'M30_Personnel']);
      assertEqual(first.attMasse.M10_Fonctionnement, 300);
      assertEqual(second.attMasse.M10_Fonctionnement, 200);
      assertDeepEqual(second.expenses.map(e => e.masse), [''], 'Nature « Divers » : non classée');
    });

    it('une ligne OPE posée sur deux rangs du même projet ne montre ses dépenses qu\'à la première OPE', function () {
      const projets = [p(1, 'TWICE', { Ligne_OPE: ['L', 1], Ligne_OPE_2: ['L', 1], c2026_M10_Fonctionnement: 10, c2026_M10_Fonctionnement_2: 10 })];
      const data = L().buildDataset({ projets, programmes: PROGRAMMES, lignes: LIGNES, depenses: DEPENSES });
      const entry = L().compute(data, { years: [2026] }).groups[0].projects[0];
      assertEqual(entry.opes[0].expenses.length, 2);
      assertEqual(entry.opes[1].expenses.length, 0);
    });

    it('les dépenses de l\'OPE suivent le filtre des années ; le reliquat sans année est porté par l\'OPE', function () {
      const model = run({ years: [2025] });
      assertEqual(find(model, 'INNO'), undefined, 'rien en 2025 : projet absent quand une seule année est choisie');
      const all = L().compute(dataset(), {});
      const inno = entries(all).find(entry => entry.project.acronyme === 'INNO');
      assertEqual(inno.opes[0].undetailed, 500);
    });

    it('un projet sans bailleur colonne (colonnes absentes de Grist) se comporte comme avant : tout est InnovationS', function () {
      const legacy = L().buildDataset({ projets: [{ id: 1, Acronyme: 'OLD', Programme: 1, Ligne_OPE: ['L', 1], c2026_M10_Fonctionnement: 5 }], programmes: PROGRAMMES, lignes: LIGNES, depenses: [] });
      const model = L().compute(legacy, { years: [2026] });
      assertEqual(model.count, 1);
      assertEqual(model.groups[0].projects[0].opes[0].bailleur, 'InnovationS');
    });
  });

  // ===========================================================================================================
  // Page : puces Bailleur du bandeau, « + Idex » sur le projet, volet de détail par OPE en blocs par grande masse
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
  async function load(extraDepenses) {
    window.__mockSetTable('Projets', columnar(PROJETS));
    window.__mockSetTable('Programmes', columnar(PROGRAMMES));
    window.__mockSetTable('Lignes_OPE', columnar(LIGNES));
    window.__mockSetTable('Depenses_OPE', columnar(DEPENSES.concat(extraDepenses || [])));
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
    Array.from(list().querySelectorAll('.db-vhead')).forEach(head => { if (head.getAttribute('aria-expanded') === 'false') click(head); });
  }
  function unload() { view().classList.add('hidden'); P().resetState(); P().resetPrefsRow(); }
  const prow = acr => Array.from(list().querySelectorAll('.db-prow')).find(row => row.querySelector('.db-acr').textContent === acr);
  const listed = () => Array.from(list().querySelectorAll('.db-prow .db-acr')).map(b => b.textContent).sort();
  const chip = which => view().querySelector(`[data-db-bailleur="${which}"]`);
  const openProject = acr => click(prow(acr).querySelector('[data-db-exp]'));
  const orow = key => list().querySelector(`[data-db-orow="${key}"]`);
  const panel = key => list().querySelector(`[data-db-opepanel="${key}"]`);
  const block = (scope, mass) => scope.querySelector(`[data-db-masse="${mass}"]`);
  const rowsOf = el => Array.from(el.querySelectorAll('tbody tr')).map(tr => tr.cells[1].textContent);

  describe('Dashboard — page : bailleur et détail par OPE', function () {
    it('à l\'ouverture seule la puce InnovationS est allumée ; Idex est proposé ; les projets tout Idex sont masqués', async function () {
      await load();
      assertEqual(chip('inn').getAttribute('aria-pressed'), 'true');
      assertEqual(chip('idx').getAttribute('aria-pressed'), 'false');
      assertEqual(byId('db-bailleurs').hidden, false);
      assertDeepEqual(listed(), ['DUO', 'INNO', 'MIXTE']);
      unload();
    });

    it('un projet dont une OPE Idex n\'est pas comptée porte « + Idex » ; les autres n\'ont rien', async function () {
      await load();
      assertEqual(prow('MIXTE').querySelectorAll('.db-idex').length, 1);
      assertEqual(norm(prow('MIXTE').querySelector('.db-idex').textContent), '+ Idex');
      assertEqual(prow('INNO').querySelectorAll('.db-idex').length, 0);
      assertEqual(prow('DUO').querySelectorAll('.db-idex').length, 0);
      unload();
    });

    it('allumer Idex ajoute les projets Idex, retire la mention « + Idex » ; éteindre InnovationS laisse Idex seul ; jamais aucune puce', async function () {
      await load();
      click(chip('idx'));
      assertDeepEqual(listed(), ['ANR', 'DUO', 'IDEXONLY', 'INNO', 'MIXTE']);
      assertEqual(prow('MIXTE').querySelectorAll('.db-idex').length, 0, 'plus rien d\'exclu');
      click(chip('inn'));
      assertDeepEqual(listed(), ['ANR', 'IDEXONLY', 'MIXTE']);
      assertEqual(norm(prow('MIXTE').querySelector('.db-idex').textContent), '+ InnovationS', 'la part InnovationS n\'est pas comptée');
      click(chip('idx'));
      assertEqual(chip('idx').getAttribute('aria-pressed'), 'true', 'la dernière puce ne s\'éteint pas');
      unload();
    });

    it('le choix des bailleurs est enregistré par personne et réappliqué (Dash_bailleurs)', async function () {
      await load();
      await window.loadKanbanUserPreferences();
      await window.loadDashboardUserPreferences();
      window.__TEST_CALLS__.length = 0;
      click(chip('idx'));
      await P().savePreferences();
      const update = window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && c.table === 'Preferences_Widget').slice(-1)[0];
      assertEqual(update.fields.Dash_bailleurs, 'les-deux');
      click(chip('inn'));
      await P().savePreferences();
      assertEqual(window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && c.table === 'Preferences_Widget').slice(-1)[0].fields.Dash_bailleurs, 'idex');
      click(chip('idx')); // impossible : seule puce restante
      click(chip('inn'));
      await P().savePreferences();
      assertEqual(window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && c.table === 'Preferences_Widget').slice(-1)[0].fields.Dash_bailleurs, 'les-deux');
      unload();
    });

    it('un projet à une seule OPE ouvre directement ses trois blocs par masse (fonctionnement, investissement, personnel)', async function () {
      await load();
      openProject('INNO');
      const exp = prow('INNO').nextElementSibling;
      assertTrue(exp && exp.classList.contains('db-exp'), 'le détail suit la ligne projet');
      assertEqual(exp.querySelectorAll('.db-orow').length, 0, 'une seule OPE : pas de ligne OPE intermédiaire');
      const masses = Array.from(exp.querySelectorAll('[data-db-masse]')).map(b => b.dataset.dbMasse);
      assertDeepEqual(masses, ['M10_Fonctionnement', 'M20_Investissement', 'M30_Personnel']);
      assertDeepEqual(rowsOf(block(exp, 'M10_Fonctionnement')), ['ACME']);
      assertDeepEqual(rowsOf(block(exp, 'M30_Personnel')), ['RH']);
      assertIncludes(block(exp, 'M20_Investissement').textContent, 'Aucune dépense détaillée');
      assertIncludes(norm(block(exp, 'M10_Fonctionnement').querySelector('.db-mhead').textContent), '800 €', 'attribué de la masse');
      unload();
    });

    it('un projet à plusieurs OPE : une ligne par OPE, repliée ; au clic, ses blocs par masse ; chaque OPE s\'ouvre seule', async function () {
      await load();
      openProject('DUO');
      const rows = Array.from(list().querySelectorAll('.db-orow'));
      assertEqual(rows.length, 2, 'une ligne par OPE');
      assertEqual(list().querySelectorAll('[data-db-opepanel]').length, 0, 'OPE repliées par défaut');
      assertIncludes(norm(rows[0].textContent), 'OPE-D1');
      assertIncludes(norm(rows[0].textContent), 'Libellé D1', 'le libellé de la ligne OPE accompagne le numéro');
      assertEqual(rows[0].querySelector('[data-db-ope]').getAttribute('aria-expanded'), 'false');
      click(rows[0].querySelector('[data-db-ope]'));
      assertEqual(list().querySelectorAll('[data-db-opepanel]').length, 1);
      assertDeepEqual(rowsOf(block(panel('5:1'), 'M10_Fonctionnement')), ['D1A']);
      assertDeepEqual(rowsOf(block(panel('5:1'), 'M30_Personnel')), ['D1B']);
      assertEqual(block(panel('5:1'), 'autres'), null, 'pas de bloc « Autres » quand tout est classé');
      click(orow('5:2').querySelector('[data-db-ope]'));
      assertEqual(list().querySelectorAll('[data-db-opepanel]').length, 2);
      assertDeepEqual(rowsOf(block(panel('5:2'), 'autres')), ['ZED'], 'une dépense sans masse reconnue va dans « Autres »');
      click(orow('5:1').querySelector('[data-db-ope]'));
      assertEqual(list().querySelectorAll('[data-db-opepanel]').length, 1, 'se replie seule');
      unload();
    });

    it('avec Idex en plus, la ligne d\'une OPE Idex porte la pastille de son bailleur', async function () {
      await load();
      click(chip('idx'));
      openProject('MIXTE');
      assertEqual(list().querySelectorAll('.db-orow').length, 2);
      assertEqual(orow('3:1').querySelectorAll('.db-idex').length, 0);
      assertEqual(norm(orow('3:2').querySelector('.db-idex').textContent), 'Idex');
      unload();
    });

    it('filtres d\'une OPE : recherche texte et dates réécrivent les blocs sans refermer le volet ; « Effacer les filtres » les remet', async function () {
      await load();
      openProject('INNO');
      const scope = () => panel('1:1');
      const q = scope().querySelector('[data-db-opeq]');
      assertEqual(scope().querySelector('[data-db-opeclear]').hidden, true, 'rien à effacer au départ');
      q.value = 'acme'; fire(q, 'input');
      assertDeepEqual(rowsOf(block(scope(), 'M10_Fonctionnement')), ['ACME']);
      assertIncludes(block(scope(), 'M30_Personnel').textContent, 'pour ce filtre', 'un bloc vidé par le filtre le dit');
      assertEqual(scope().querySelector('[data-db-opeq]'), q, 'le champ de recherche n\'est pas recréé pendant la frappe');
      assertEqual(scope().querySelector('[data-db-opeclear]').hidden, false);
      click(scope().querySelector('[data-db-opeclear]'));
      assertDeepEqual(rowsOf(block(scope(), 'M30_Personnel')), ['RH']);
      assertEqual(scope().querySelector('[data-db-opeq]').value, '');
      // Dates : à partir du 15/03/2026 le détail du 01/03 disparaît
      const from = scope().querySelector('[data-db-opedate^="from:"]');
      setValue(from, '2026-03-15'); fire(from, 'input');
      assertIncludes(block(scope(), 'M10_Fonctionnement').textContent, 'pour ce filtre');
      assertDeepEqual(rowsOf(block(scope(), 'M30_Personnel')), ['RH']);
      const to = scope().querySelector('[data-db-opedate^="to:"]');
      setValue(to, '2026-03-31'); fire(to, 'input');
      assertIncludes(block(scope(), 'M30_Personnel').textContent, 'pour ce filtre', 'borne haute : le détail du 01/04 sort');
      unload();
    });

    it('tri d\'un bloc : par défaut la dépense la plus récente d\'abord ; un clic sur une colonne trie, le second inverse', async function () {
      await load([{ id: 20, Exercice: 2026, Code_operation: 'OPE-A1', Nature_depense: 'M10', CP_consomme: 40, AE_consomme: 40, Fournisseur: 'BOLT', Date_creation: Date.UTC(2026, 4, 1) / 1000 }]);
      openProject('INNO');
      const m10 = () => block(panel('1:1'), 'M10_Fonctionnement');
      assertDeepEqual(rowsOf(m10()), ['BOLT', 'ACME'], 'date décroissante');
      click(m10().querySelector('[data-db-opesort$=":fournisseur"]'));
      assertDeepEqual(rowsOf(m10()), ['ACME', 'BOLT']);
      assertEqual(m10().querySelector('th[aria-sort="ascending"]').textContent.trim(), 'Fournisseur ▲');
      click(m10().querySelector('[data-db-opesort$=":fournisseur"]'));
      assertDeepEqual(rowsOf(m10()), ['BOLT', 'ACME'], 'second clic : ordre inversé');
      click(m10().querySelector('[data-db-opesort$=":CP"]'));
      assertDeepEqual(rowsOf(m10()), ['ACME', 'BOLT'], 'les montants se trient du plus grand au plus petit d\'abord');
      assertEqual(list().querySelectorAll('.db-exp').length, 1, 'le volet reste ouvert');
      unload();
    });

    it('le consommé affiché sur chaque ligne OPE et le total des blocs suivent la mesure AE / CP', async function () {
      await load();
      openProject('INNO');
      const m10 = () => block(panel('1:1'), 'M10_Fonctionnement');
      assertIncludes(norm(m10().querySelector('.db-mhead').textContent), 'Consommé CP 100 €');
      click(view().querySelector('[data-db-measure="AE"]'));
      assertIncludes(norm(m10().querySelector('.db-mhead').textContent), 'Consommé AE 150 €');
      unload();
    });
  });
})();
