/**
 * Non-regression suite : tiroir « Alertes de dépense » du Dashboard (26/11/2026, maquette v3 validée).
 * Les dates sont relatives à aujourd'hui : la page lit l'horloge. Données fictives uniquement.
 */
(function () {
  'use strict';

  const P = () => window.DashboardPage;
  const byId = id => document.getElementById(id);
  const view = () => byId('view-dashboard');
  const list = () => byId('db-list');
  const click = el => fireMouse(el, 'click');
  const norm = text => String(text).replace(/ | /g, ' ');
  const DAY = 86400;
  const inDays = n => Math.floor(Date.now() / 1000) + n * DAY;
  const columnar = rows => {
    const columns = Array.from(new Set(rows.flatMap(row => Object.keys(row)).filter(key => key !== 'id')));
    const out = { id: rows.map(row => row.id) };
    columns.forEach(col => { out[col] = rows.map(row => (row[col] === undefined ? null : row[col])); });
    return out;
  };
  const PROGRAMMES = [{ id: 1, Programme: 'Prog A' }];
  const LIGNES = [
    { id: 1, N_OPE: 'OPE-A', totalCPConsomme: 5000, Consomme_AE: 10000 },
    { id: 2, N_OPE: 'OPE-B', totalCPConsomme: 30000, Consomme_AE: 30000 },
    { id: 3, N_OPE: 'OPE-C', totalCPConsomme: 0, Consomme_AE: 0 }
  ];
  const p = (id, acr, statut, extra) => Object.assign({ id, Acronyme: acr, Projet: acr, Programme: 1, Statut_operationnel_projet: statut }, extra);
  const PROJETS = [
    p(1, 'LENT', 'en cours', { Ligne_OPE: ['L', 1], c2026_M10_Fonctionnement: 100000, Date_debut_Projet: inDays(-300), Date_limite_financement: inDays(30) }),
    p(2, 'SANSOPE', 'en cours', { c2026_M10_Fonctionnement: 50000 }),
    p(3, 'CLOS', 'cloturé avec Reliquat à traiter', { Ligne_OPE: ['L', 2], c2025_M10_Fonctionnement: 90000 }),
    p(4, 'LOIN', 'en cours', { Ligne_OPE: ['L', 3], c2026_M10_Fonctionnement: 100000, Date_debut_Projet: inDays(-100), Date_limite_financement: inDays(200) }),
    p(5, 'IDEXLENT', 'en cours', { Ligne_OPE: ['L', 3], Bailleur: 'Idex', c2026_M10_Fonctionnement: 100000, Date_debut_Projet: inDays(-300), Date_limite_financement: inDays(20) })
  ];
  async function load(projets) {
    window.__mockSetTable('Projets', columnar(projets || PROJETS));
    window.__mockSetTable('Programmes', columnar(PROGRAMMES));
    window.__mockSetTable('Lignes_OPE', columnar(LIGNES));
    window.__mockSetTable('Depenses_OPE', columnar([]));
    window.__mockSetTable('_grist_Tables', { id: [1], tableId: ['Projets'] });
    window.__mockSetTable('_grist_Tables_column', { id: [], parentId: [], colId: [], type: [], widgetOptions: [], description: [] });
    await window.CoreGrist.loadColumnDescriptions();
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    P().resetState(); P().resetPrefsRow();
    P().state.engine = 'maison';
    view().classList.remove('hidden');
    window.renderDashboard();
    await waitFor(() => P().state.expensesState === 'ready', 'dépenses lues');
  }
  function unload() { view().classList.add('hidden'); P().resetState(); P().resetPrefsRow(); }
  const btn = () => byId('db-alerts-btn');
  const drawer = () => byId('db-alerts');
  const tabOn = () => drawer().querySelector('.db-ptab.is-on').dataset.dbAlertTab;
  const tabBtn = key => drawer().querySelector(`[data-db-alert-tab="${key}"]`);
  const cards = () => Array.from(drawer().querySelectorAll('.db-acard'));
  const cardOf = acr => cards().find(card => card.querySelector('.db-acr').textContent === acr);
  const prefUpdates = () => window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && c.table === 'Preferences_Widget');

  describe('Dashboard — page : tiroir des alertes', function () {
    it('le bouton du bandeau porte le nombre d\'alertes (à compléter + échéances) ; le tiroir est fermé au départ', async function () {
      await load();
      assertEqual(btn().hidden, false);
      assertEqual(btn().querySelector('.db-alerts-n').textContent, '2', 'SANSOPE (OPE) + LENT (échéance) ; IDEXLENT n\'est pas compté, LOIN est hors horizon');
      assertEqual(btn().getAttribute('aria-expanded'), 'false');
      assertTrue(!drawer() || drawer().hidden);
      unload();
    });

    it('un clic ouvre le tiroir sur les échéances ; trois onglets avec leur nombre ; la fermeture se fait par ×, fond sombre ou Échap', async function () {
      await load();
      click(btn());
      assertEqual(drawer().hidden, false);
      assertEqual(btn().getAttribute('aria-expanded'), 'true');
      assertEqual(tabOn(), 'ech');
      assertDeepEqual(Array.from(drawer().querySelectorAll('.db-ptab')).map(el => norm(el.textContent)), ['À compléter1', 'Échéances1', 'Clôtures1']);
      click(drawer().querySelector('.db-dx'));
      assertEqual(drawer().hidden, true);
      click(btn()); click(byId('db-alerts-scrim'));
      assertEqual(drawer().hidden, true);
      click(btn());
      view().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assertEqual(drawer().hidden, true);
      assertEqual(btn().getAttribute('aria-expanded'), 'false');
      unload();
    });

    it('Échéances : risque, rythme engagé, échéance et reste à engager ; le projet Idex n\'y est pas par défaut', async function () {
      await load();
      click(btn());
      assertDeepEqual(cards().map(card => card.querySelector('.db-acr').textContent), ['LENT']);
      const card = cardOf('LENT');
      assertIncludes(card.textContent, 'Risque élevé');
      assertIncludes(norm(card.textContent), 'dans 30 jours');
      assertIncludes(norm(card.querySelector('.db-an').textContent), '10 %', '10 000 engagés sur 100 000');
      assertIncludes(norm(drawer().querySelector('.db-asv').textContent), '90 000 €', 'reste à engager');
      click(view().querySelector('[data-db-bailleur="idx"]'));
      click(btn());
      assertDeepEqual(cards().map(c => c.querySelector('.db-acr').textContent), ['IDEXLENT', 'LENT'], 'avec la puce Idex, le projet Idex entre dans les alertes, le plus proche d\'abord');
      unload();
    });

    it('l\'horizon (3, 6 ou 12 mois) change la liste et est retenu par personne ; 6 mois = valeur par défaut, rien d\'écrit', async function () {
      await load();
      await window.loadKanbanUserPreferences();
      await window.loadDashboardUserPreferences();
      window.__TEST_CALLS__.length = 0;
      click(btn());
      assertEqual(drawer().querySelector('.db-hzb.is-on').dataset.dbAlertHorizon, '6');
      assertEqual(cardOf('LOIN'), undefined, 'échéance dans 200 jours : au-delà de 6 mois');
      click(drawer().querySelector('[data-db-alert-horizon="12"]'));
      assertTrue(!!cardOf('LOIN'), 'à 12 mois LOIN apparaît : aucun engagement pour 33 % du temps écoulé');
      assertEqual(P().state.alertsHorizon, 12);
      await P().savePreferences();
      assertEqual(prefUpdates().slice(-1)[0].fields.Dash_horizon, '12');
      click(drawer().querySelector('[data-db-alert-horizon="6"]'));
      await P().savePreferences();
      assertEqual(prefUpdates().slice(-1)[0].fields.Dash_horizon, '');
      unload();
    });

    it('À compléter : la raison, le montant et « Compléter la fiche » (ouvre la fiche sur Budget et OPE)', async function () {
      await load();
      click(btn());
      click(tabBtn('ope'));
      assertEqual(tabOn(), 'ope');
      const card = cardOf('SANSOPE');
      assertIncludes(card.textContent, 'Aucune ligne OPE');
      assertIncludes(norm(card.textContent), '50 000 € attribués');
      assertIncludes(norm(drawer().querySelector('.db-asv').textContent), '50 000 €');
      const original = window.ProjectModal.open;
      let opened = null;
      window.ProjectModal.open = (row, options) => { opened = { id: row.id, tab: options && options.tab }; };
      try { click(card.querySelector('[data-db-alert-fix]')); } finally { window.ProjectModal.open = original; }
      assertDeepEqual(opened, { id: 2, tab: 'budget' });
      assertEqual(drawer().hidden, true, 'le tiroir se ferme pour laisser la fiche');
      unload();
    });

    it('Clôtures : reliquat = attribué − consommé CP, avec le total en tête', async function () {
      await load();
      click(btn());
      click(tabBtn('clo'));
      assertIncludes(norm(drawer().querySelector('.db-asv').textContent), '60 000 €');
      assertIncludes(cardOf('CLOS').textContent, 'Reliquat à traiter');
      assertIncludes(norm(cardOf('CLOS').querySelector('.db-ak').textContent), '60 k€');
      unload();
    });

    it('les projets en alerte portent un repère dans la liste ; un clic ouvre le tiroir sur le bon onglet', async function () {
      await load();
      click(list().querySelector('.db-vhead'));
      const row = acr => Array.from(list().querySelectorAll('.db-prow')).find(r => r.querySelector('.db-acr').textContent === acr);
      assertEqual(norm(row('LENT').querySelector('.db-chip').textContent), '30 j');
      assertEqual(row('SANSOPE').querySelector('.db-chip').textContent, 'OPE ?');
      assertEqual(row('CLOS').querySelector('.db-chip'), null);
      click(row('SANSOPE').querySelector('.db-chip'));
      assertEqual(drawer().hidden, false);
      assertEqual(tabOn(), 'ope');
      unload();
    });

    it('le tiroir ne se rouvre pas tout seul à l\'ouverture suivante de la page', async function () {
      await load();
      click(btn());
      unload();
      await load();
      assertTrue(!drawer() || drawer().hidden);
      unload();
    });
  });
})();
