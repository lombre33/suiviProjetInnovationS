/**
 * Non-regression suite : page Annuaire (js/pages/page-annuaire.js) — V1 du 17/11/2026 : onglets Personnes / Postes, filtres
 * retenus par utilisateur, trois présentations, fiche latérale, projets ouverts dans la modale projet, et branchement des
 * modales Personne / Poste existantes (évènement `directory-changed`).
 *
 * Jeu de données (posé par load()) — aujourd'hui = 17/11/2026 (horloge injectée) :
 *   Établissements UB, CNRS, Inserm. Structures DIESE (direction VP Innovation, tutelle UB), VP Innovation, LMTC (tutelle Inserm),
 *   « Plateau A, B » (une virgule dans le libellé, pour les filtres retenus).
 *   Postes 1 Responsable innovation (DIESE, employeur UB, CDI) · 2 Chargé de mission (DIESE, employeur CNRS, CDD fini dans 30 j) ·
 *   3 Directeur.trice de laboratoire (LMTC, Inserm) · 4 Gestionnaire vacant (VP Innovation, CDD fini il y a 10 j) · 5 Ingénieur plateau
 *   (« Plateau A, B », occupé par Éric en poste secondaire).
 *   Personnes 1 Alice MARTIN (poste 1, EC + C, accompagnatrice, assistante = Chloé) · 2 Bob DURAND (poste 2, BIATSS) · 3 Chloé PETIT
 *   (poste 3, Fonction, sans e-mail) · 4 Alice MARTIN bis (sans poste, e-mail ALICE@ub.fr : doublon de nom et d'e-mail) · 5 Éric LÉON
 *   (poste secondaire 5, Doctorant.e, matricule M123).
 *   Projets ALPHA (porteur Alice, VP Chloé, accompagnateur Bob), BETA (porteur Alice, 2e porteur Bob), GAMMA (porteur Alice,
 *   accompagnatrice Alice).
 *   Valeurs réelles de Grist (Antoine, 17/11/2026) : Type = BIATSS, C, EC, Doctorant.e, Fonction.
 */
(function () {
  'use strict';

  const TODAY = new Date(2026, 10, 17);
  const UTC_TODAY = Date.UTC(2026, 10, 17) / 1000;
  const DAY = 86400;
  const TYPE_CHOICES = ['BIATSS', 'C', 'EC', 'Doctorant.e', 'Fonction'];
  const PREFS_ROWID_KEY = 'suiviProjetInnovationS:prefsRowId';

  const L = () => window.AnnuaireLogic;
  const T = () => window.AnnuaireTesting;
  const byId = id => document.getElementById(id);
  const view = () => byId('view-annuaire');

  function installTables(overrides) {
    const tables = {
      Etablissements: { id: [1, 2, 3], Acronyme: ['UB', 'CNRS', 'Inserm'], Nom_complet: ['Université de Bordeaux', 'Centre national de la recherche scientifique', 'Institut national de la santé'] },
      Structures: {
        id: [1, 2, 3, 4], Acronyme: ['DIESE', 'VP Innovation', 'LMTC', 'Plateau A, B'],
        Nom_Complet: ['Direction de l\'innovation', 'Vice-présidence Innovation', 'Laboratoire LMTC', 'Plateau technique'],
        Directon_Structure_mere: [2, 0, 0, 0], Etablissement_Tutuelle_gestionaire: [1, 1, 3, 1]
      },
      Postes2: {
        id: [1, 2, 3, 4, 5],
        Titre: ['Responsable innovation', 'Chargé de mission', 'Directeur.trice de laboratoire', 'Gestionnaire (poste vacant)', 'Ingénieur plateau'],
        Precisions_Poste: ['Pôle valorisation', '', '', '', ''],
        Structure2: [1, 1, 3, 2, 4], Employeur_tutelle: [1, 2, 3, 1, 2],
        type_de_contrat: ['CDI', 'CDD', 'Titulaire', 'CDD', 'CDI'],
        Date_de_fin: [null, UTC_TODAY + 30 * DAY, null, UTC_TODAY - 10 * DAY, null],
        Type_de_poste: ['Administratif', 'Administratif', 'Recherche', 'Administratif', 'Technique'],
        grade: ['Agent', 'Agent', 'Directeur.trice etablissement', 'Agent', 'Agent'],
        Nom_du_poste: ['Responsable innovation 1', 'Chargé de mission 2', 'Directeur.trice 3', 'Gestionnaire 4', 'Ingénieur 5']
      },
      Annuaire: {
        id: [1, 2, 3, 4, 5],
        NOM: ['Martin', 'Durand', 'Petit', 'Martin', 'Léon'], Prenom: ['Alice', 'Bob', 'Chloé', 'Alice', 'Éric'],
        nom_et_Prenom: ['Alice MARTIN', 'Bob DURAND', 'Chloé PETIT', 'Alice MARTIN', 'Éric LÉON'],
        Email: ['alice@ub.fr', 'bob@cnrs.fr', '', 'ALICE@ub.fr', 'eric@x.fr'], Telephone: ['0600000001', '', '', '', ''],
        Poste2: [1, 2, 3, 0, 0], Poste_secondaire: [0, 0, 0, 0, 5],
        Type: [['L', 'EC', 'C'], ['L', 'BIATSS'], ['L', 'Fonction'], null, ['L', 'Doctorant.e']],
        Communaute_metier: [['L', 'Valorisation'], null, null, null, null],
        Accompagnateur_de_l_innovation_: [true, false, false, false, false],
        email_Assitant_e_le_cas_echeant: [3, 0, 0, 0, 0],
        Matricule_le_cas_echeant_: ['', '', '', '', 'M123']
      },
      Projets: {
        id: [10, 11, 12], Projet: ['Projet Alpha', 'Projet Beta', 'Projet Gamma'], Acronyme: ['ALPHA', 'BETA', 'GAMMA'],
        Porteur_1: [1, 1, 1], Porteur_2: [0, 2, 0], Porteur_3: [0, 0, 0], VP_porteur_signataire_notif: [3, 0, 0], Accompagnateur: [2, 0, 1]
      },
      ...(overrides || {})
    };
    Object.entries(tables).forEach(([name, table]) => window.__mockSetTable(name, table));
  }
  // Métadonnées Grist : choix de Annuaire.Type et descriptions éventuelles (bulles d'aide).
  function installMeta({ choices, descriptions } = {}) {
    const cols = [];
    if (choices) cols.push({ table: 'Annuaire', col: 'Type', type: 'ChoiceList', widgetOptions: JSON.stringify({ choices }) });
    (descriptions || []).forEach(d => cols.push({ table: d.table, col: d.col, type: 'Text', description: d.description }));
    const tableNames = [...new Set(cols.map(c => c.table))];
    window.__mockSetTable('_grist_Tables', { id: tableNames.map((_, i) => i + 1), tableId: tableNames });
    window.__mockSetTable('_grist_Tables_column', {
      id: cols.map((_, i) => i + 1), parentId: cols.map(c => tableNames.indexOf(c.table) + 1), colId: cols.map(c => c.col),
      type: cols.map(c => c.type), widgetOptions: cols.map(c => c.widgetOptions || ''), description: cols.map(c => c.description || '')
    });
    return window.CoreGrist.loadColumnDescriptions();
  }
  async function load(options = {}) {
    installTables(options.tables);
    if (options.meta !== false) await installMeta(options.meta || { choices: TYPE_CHOICES });
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    T().resetState();
    T().resetPrefsRow();
    L().setClock(() => TODAY);
    view().classList.remove('hidden');
    window.renderAnnuaire();
  }
  function unload() { view().classList.add('hidden'); L().setClock(); T().resetState(); }

  const rows = () => Array.from(view().querySelectorAll('#annu-content .annu-row'));
  const names = () => Array.from(view().querySelectorAll('#annu-content .annu-name')).map(el => el.textContent);
  const click = el => fireMouse(el, 'click');
  const tab = key => view().querySelector(`[data-annu-tab="${key}"]`);
  const setSearch = value => { const input = byId('annu-search'); input.value = value; fire(input, 'input'); };
  const listOf = id => byId(`${id}-list`);
  const optionLabels = id => Array.from(listOf(id).querySelectorAll('[data-value]')).map(btn => btn.textContent);
  function pick(id, label) {
    fire(byId(id), 'focus');
    fireMouse(Array.from(listOf(id).querySelectorAll('[data-value]')).find(btn => btn.textContent === label), 'mousedown');
  }
  const EMPLOYEUR = 'annu-filter-employeur', STRUCTURE = 'annu-filter-structure', TYPE = 'annu-filter-type';
  const drawer = () => byId('annu-drawer-root').querySelector('.annu-drawer');
  const openFiche = personId => click(view().querySelector(`#annu-content .annu-name[data-id="${personId}"]`));
  const prefsUpdates = () => window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && c.table === 'Preferences_Widget');
  const withHiddenDocument = fn => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    try { return fn(); } finally { delete document.hidden; }
  };
  async function loadPrefs() {
    await window.loadKanbanUserPreferences(); // crée la table et la ligne, comme au vrai démarrage (js/app.js)
    await window.loadAnnuaireUserPreferences();
  }
  // Remplace une fonction globale le temps d'un test.
  function stub(object, key, replacement) {
    const original = object[key];
    object[key] = replacement;
    return () => { object[key] = original; };
  }
  const person = id => L().buildDirectory().personById.get(id);
  const poste = id => L().buildDirectory().posteById.get(id);
  const issueKeys = id => person(id).issues.map(issue => issue.key);

  // ===========================================================================================================
  describe('Annuaire — personnes reconstruites depuis Grist', function () {
    it('chaque personne reçoit son poste, sa structure, sa direction, sa tutelle et son employeur', async function () {
      await load();
      const alice = person(1);
      assertEqual(alice.name, 'Alice MARTIN');
      assertEqual(alice.titre, 'Responsable innovation');
      assertEqual(alice.prec, 'Pôle valorisation');
      assertEqual(alice.structure, 'DIESE');
      assertEqual(alice.mere, 'VP Innovation', 'direction mère de la structure');
      assertEqual(alice.tutelle, 'UB', 'tutelle gestionnaire de la structure');
      assertEqual(alice.employeur, 'UB', 'employeur du poste');
      assertEqual(alice.initials, 'AM');
      unload();
    });

    it('l\'employeur du poste n\'est pas la tutelle de la structure (chercheur CNRS dans une structure UB)', async function () {
      await load();
      const bob = person(2);
      assertEqual(bob.employeur, 'CNRS');
      assertEqual(bob.tutelle, 'UB');
      unload();
    });

    it('Type et Communauté (ChoiceList Grist) sont décodés ; un texte simple et une cellule vide aussi', async function () {
      await load();
      assertDeepEqual(person(1).types, ['EC', 'C']);
      assertDeepEqual(person(1).comm, ['Valorisation']);
      assertDeepEqual(person(4).types, [], 'cellule vide');
      assertDeepEqual(L().listValues('EC, C'), ['EC', 'C']);
      assertDeepEqual(L().listValues(null), []);
      assertDeepEqual(L().listValues(['L']), []);
      unload();
    });

    it('les projets sont comptés une seule fois et rangés par rôle : porteur 1/2/3, VP porteur, accompagnateur', async function () {
      await load();
      const alice = person(1), bob = person(2), chloe = person(3);
      assertDeepEqual(alice.projects.porteur.map(p => p.Acronyme), ['ALPHA', 'BETA', 'GAMMA']);
      assertDeepEqual(alice.projects.accomp.map(p => p.Acronyme), ['GAMMA']);
      assertEqual(alice.nProj, 3, 'GAMMA (porteuse et accompagnatrice) ne compte qu\'une fois');
      assertDeepEqual(bob.projects.porteur.map(p => p.Acronyme), ['BETA'], 'Porteur_2');
      assertDeepEqual(bob.projects.accomp.map(p => p.Acronyme), ['ALPHA']);
      assertEqual(bob.nProj, 2);
      assertDeepEqual(chloe.projects.vp.map(p => p.Acronyme), ['ALPHA'], 'VP porteur');
      assertEqual(person(5).nProj, 0);
      unload();
    });

    it('À vérifier : doublon de nom (accents et casse ignorés), doublon d\'e-mail (casse ignorée), e-mail manquant, personne sans poste', async function () {
      await load();
      assertDeepEqual(issueKeys(1), ['dup-name', 'dup-email']);
      assertDeepEqual(issueKeys(4), ['dup-name', 'dup-email', 'no-poste']);
      assertDeepEqual(issueKeys(3), ['no-email']);
      assertDeepEqual(issueKeys(5), ['no-poste'], 'le poste secondaire ne remplace pas le poste principal');
      assertDeepEqual(issueKeys(2), [], 'Bob n\'a rien à signaler');
      assertEqual(person(1).issues[0].otherId, 4, 'le doublon pointe vers l\'autre fiche');
      assertEqual(person(4).issues[1].otherId, 1);
      unload();
    });

    it('les doublons de nom ignorent accents et majuscules (Éric / eric)', async function () {
      await load({ tables: { Annuaire: Object.assign(JSON.parse(JSON.stringify({
        id: [1, 2], NOM: ['Léon', 'LEON'], Prenom: ['Éric', 'eric'], nom_et_Prenom: ['Éric LÉON', 'Eric LEON'], Email: ['a@x.fr', 'b@x.fr'], Poste2: [1, 1]
      }))) } });
      assertDeepEqual(issueKeys(1), ['dup-name']);
      assertDeepEqual(issueKeys(2), ['dup-name']);
      unload();
    });

    it('un poste est vacant sans titulaire ; le poste secondaire compte comme titulaire', async function () {
      await load();
      assertTrue(poste(4).vacant, 'poste 4 : personne');
      assertFalse(poste(5).vacant, 'poste 5 : Éric en poste secondaire');
      assertDeepEqual(poste(5).titulaires.map(p => p.name), ['Éric LÉON']);
      assertFalse(poste(1).vacant);
      unload();
    });

    it('un contrat qui se termine dans 90 jours ou moins (ou déjà terminé) est à vérifier ; l\'horloge est celle du jour', async function () {
      await load();
      assertEqual(poste(2).finLeft, 30);
      assertTrue(poste(2).finSoon);
      assertEqual(poste(4).finLeft, -10, 'déjà terminé');
      assertTrue(poste(4).finSoon);
      assertEqual(poste(2).fin, '2026-12-17');
      assertFalse(poste(1).finSoon, 'CDI sans date de fin');
      assertFalse(poste(3).issue);
      assertTrue(poste(2).issue && poste(4).issue);
      L().setClock(() => new Date(2027, 5, 1));
      assertEqual(poste(2).finLeft, -166, '17/12/2026 → 01/06/2027 : le calcul suit l\'horloge, pas l\'ancienne photo du jour');
      assertTrue(poste(2).finSoon);
      unload();
    });

    it('les colonnes absentes du document (Type, grade, Date_de_fin…) ne cassent pas la page', async function () {
      installTables({
        Annuaire: { id: [1], NOM: ['Martin'], Prenom: ['Alice'], Email: ['alice@x.fr'], Poste2: [1], nom_et_Prenom: ['Alice MARTIN'] },
        Postes2: { id: [1], Titre: ['Responsable'], Precisions_Poste: [''], Structure2: [1], Employeur_tutelle: [1] }
      });
      const tables = await window.CoreGrist.loadAllTables();
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      T().resetState(); L().setClock(() => TODAY); view().classList.remove('hidden');
      window.renderAnnuaire();
      assertEqual(names().length, 1);
      assertDeepEqual(person(1).types, []);
      assertEqual(poste(1).fin, null);
      assertEqual(poste(1).grade, '');
      unload();
    });
  });

  describe('Annuaire — choix du filtre Type (lus dans Grist, jamais codés en dur)', function () {
    it('les choix de la colonne Type de Grist sont proposés dans l\'ordre de Grist', async function () {
      await load();
      assertDeepEqual(L().buildDirectory().options.types, ['BIATSS', 'C', 'EC', 'Doctorant.e', 'Fonction']);
      fire(byId(TYPE), 'focus');
      assertDeepEqual(optionLabels(TYPE), ['Tous les types', 'BIATSS', 'C', 'EC', 'Doctorant.e', 'Fonction']);
      unload();
    });

    it('une valeur présente dans les données mais absente de la liste Grist est ajoutée à la suite', async function () {
      await load({ meta: { choices: ['EC', 'C'] } });
      assertDeepEqual(L().buildDirectory().options.types, ['EC', 'C', 'BIATSS', 'Doctorant.e', 'Fonction']);
      unload();
    });

    it('sans métadonnées Grist lisibles, le filtre se rabat sur les valeurs des données (triées)', async function () {
      await load({ meta: false });
      // load() n'installe plus de métadonnées : on vide aussi celles d'un test précédent.
      window.__mockSetTable('_grist_Tables', { id: [], tableId: [] });
      window.__mockSetTable('_grist_Tables_column', { id: [], parentId: [], colId: [], type: [], widgetOptions: [], description: [] });
      await window.CoreGrist.loadColumnDescriptions();
      window.renderAnnuaire();
      L().setClock(() => TODAY); // vide le cache de l'annuaire
      assertDeepEqual(L().buildDirectory().options.types, ['BIATSS', 'C', 'Doctorant.e', 'EC', 'Fonction']);
      unload();
    });

    it('les employeurs et structures proposés sont ceux des postes, triés, une virgule dans un libellé comprise', async function () {
      await load();
      assertDeepEqual(L().buildDirectory().options.employeurs, ['CNRS', 'Inserm', 'UB']);
      assertDeepEqual(L().buildDirectory().options.structures, ['DIESE', 'LMTC', 'Plateau A, B', 'VP Innovation']);
      unload();
    });
  });

  describe('Annuaire — filtres, recherche et tri (fonctions pures)', function () {
    const base = () => ({ search: '', employeurs: [], structures: [], types: [], check: false });
    const idsOf = list => list.map(p => p.id);

    it('la recherche ignore accents et casse, et couvre nom, e-mail, poste, structure et employeur', async function () {
      await load();
      const dir = L().buildDirectory();
      assertDeepEqual(idsOf(L().filterPeople(dir, { ...base(), search: 'ERIC' })), [5], 'accents et casse');
      assertDeepEqual(idsOf(L().filterPeople(dir, { ...base(), search: 'bob@cnrs' })), [2], 'e-mail');
      assertDeepEqual(idsOf(L().filterPeople(dir, { ...base(), search: 'directeur' })), [3], 'titre du poste');
      assertDeepEqual(idsOf(L().filterPeople(dir, { ...base(), search: 'vp innovation' })), [1, 2], 'direction de la structure');
      assertDeepEqual(idsOf(L().filterPeople(dir, { ...base(), search: 'cnrs' })), [2], 'employeur');
      unload();
    });

    it('employeur, structure et type se cumulent (ET) ; plusieurs valeurs d\'un même filtre sont alternatives (OU)', async function () {
      await load();
      const dir = L().buildDirectory();
      assertDeepEqual(idsOf(L().filterPeople(dir, { ...base(), employeurs: ['UB', 'CNRS'] })), [1, 2]);
      assertDeepEqual(idsOf(L().filterPeople(dir, { ...base(), structures: ['DIESE'] })), [1, 2]);
      assertDeepEqual(idsOf(L().filterPeople(dir, { ...base(), structures: ['DIESE'], employeurs: ['CNRS'] })), [2]);
      assertDeepEqual(idsOf(L().filterPeople(dir, { ...base(), types: ['EC'] })), [1], 'Type EC (valeur réelle de Grist)');
      assertDeepEqual(idsOf(L().filterPeople(dir, { ...base(), types: ['BIATSS', 'Doctorant.e'] })), [2, 5]);
      unload();
    });

    it('À vérifier ne garde que les personnes avec une alerte, et les postes vacants ou à échéance proche', async function () {
      await load();
      const dir = L().buildDirectory();
      assertDeepEqual(idsOf(L().filterPeople(dir, { ...base(), check: true })), [1, 3, 4, 5]);
      assertDeepEqual(idsOf(L().filterPostes(dir, { ...base(), check: true })), [2, 4]);
      unload();
    });

    it('les postes se cherchent aussi par nom de titulaire', async function () {
      await load();
      assertDeepEqual(idsOf(L().filterPostes(L().buildDirectory(), { ...base(), search: 'bob' })), [2]);
      unload();
    });

    it('tri par nom (NOM puis prénom, accents respectés), par structure, par employeur, et sens inversé', async function () {
      await load();
      const dir = L().buildDirectory();
      const all = L().filterPeople(dir, base());
      assertDeepEqual(L().sortPeople(all, 'nom', 1).map(p => p.name), ['Bob DURAND', 'Éric LÉON', 'Alice MARTIN', 'Alice MARTIN', 'Chloé PETIT']);
      assertEqual(L().sortPeople(all, 'nom', -1)[0].name, 'Chloé PETIT', 'sens inversé');
      assertDeepEqual(L().sortPeople(all, 'structure', 1).map(p => p.structure), ['', '', 'DIESE', 'DIESE', 'LMTC']);
      assertDeepEqual(L().sortPeople(all, 'employeur', 1).map(p => p.employeur), ['', '', 'CNRS', 'Inserm', 'UB']);
      assertEqual(L().sortPeople(all, 'structure', 1)[2].name, 'Bob DURAND', 'à structure égale, l\'ordre du nom');
      unload();
    });
  });

  describe('Annuaire — page : onglets, liste et bandeau', function () {
    it('les onglets affichent le nombre de personnes et de postes ; la liste est triée par nom', async function () {
      await load();
      assertEqual(byId('annu-count-pers').textContent, '5');
      assertEqual(byId('annu-count-postes').textContent, '5');
      assertDeepEqual(names(), ['Bob DURAND', 'Éric LÉON', 'Alice MARTIN', 'Alice MARTIN', 'Chloé PETIT']);
      assertEqual(tab('pers').getAttribute('aria-selected'), 'true');
      assertEqual(byId('annu-new').textContent, '+ Nouvelle personne');
      unload();
    });

    it('une ligne montre le poste, la structure et sa direction, l\'employeur, les types, l\'e-mail et le nombre de projets', async function () {
      await load();
      const row = view().querySelector('[data-person="1"]');
      assertIncludes(row.querySelector('.c-poste').textContent, 'Responsable innovation');
      assertIncludes(row.querySelector('.c-poste').textContent, 'Pôle valorisation');
      assertIncludes(row.querySelector('.c-struct').textContent, 'DIESE');
      assertIncludes(row.querySelector('.c-struct').textContent, 'VP Innovation');
      assertEqual(row.querySelector('.c-etab').textContent.trim(), 'UB');
      assertDeepEqual(Array.from(row.querySelectorAll('.c-type .annu-pill')).map(el => el.textContent), ['EC', 'C']);
      assertIncludes(row.querySelector('.c-contact').textContent, 'alice@ub.fr');
      assertEqual(row.querySelector('.annu-nproj').textContent, '3');
      assertEqual(row.querySelector('.annu-nproj').title, 'Porteur 3 · VP 0 · Accompagnateur 1');
      assertTrue(!!row.querySelector('.annu-star'), 'étoile : accompagnateur de l\'innovation');
      assertFalse(!!view().querySelector('[data-person="2"] .annu-star'));
      unload();
    });

    it('sans poste : « Sans poste » ; sans e-mail : « E-mail manquant » en alerte, pas de bouton copier', async function () {
      await load();
      assertIncludes(view().querySelector('[data-person="4"] .c-poste').textContent, 'Sans poste');
      const chloe = view().querySelector('[data-person="3"]');
      assertIncludes(chloe.querySelector('.c-contact').textContent, 'E-mail manquant');
      assertEqual(chloe.querySelectorAll('[data-annu="copy"]').length, 0);
      assertEqual(chloe.querySelector('.annu-alert').title, 'E-mail manquant');
      assertEqual(view().querySelectorAll('[data-person="2"] .annu-alert').length, 0, 'Bob : aucune alerte');
      unload();
    });

    it('la recherche filtre la liste sans accents ni casse, et le compteur de l\'onglet passe à « filtrées/total »', async function () {
      await load();
      setSearch('eric');
      assertDeepEqual(names(), ['Éric LÉON']);
      assertEqual(byId('annu-count-pers').textContent, '1/5');
      assertEqual(byId('annu-reset').hidden, false, 'Réinitialiser apparaît dès qu\'un filtre est actif');
      setSearch('zzz');
      assertIncludes(view().querySelector('#annu-content').textContent, 'Aucune personne ne correspond');
      unload();
    });

    it('employeur, structure et type se choisissent dans des listes à sélection multiple qui disent leur état', async function () {
      await load();
      fire(byId(EMPLOYEUR), 'focus');
      assertFalse(listOf(EMPLOYEUR).hidden);
      assertDeepEqual(optionLabels(EMPLOYEUR), ['Tous les employeurs', 'CNRS', 'Inserm', 'UB']);
      pick(EMPLOYEUR, 'UB');
      assertDeepEqual(names(), ['Alice MARTIN'], 'seule Alice a un poste employé par l\'UB');
      assertEqual(byId(EMPLOYEUR).value, 'UB');
      assertTrue(byId(EMPLOYEUR).closest('.filter-combo').classList.contains('is-active'));
      pick(EMPLOYEUR, 'CNRS');
      assertEqual(byId(EMPLOYEUR).value, '2 employeurs sélectionnés');
      assertDeepEqual(names(), ['Bob DURAND', 'Alice MARTIN']);
      const selected = Array.from(listOf(EMPLOYEUR).querySelectorAll('.is-selected')).map(el => el.textContent);
      assertDeepEqual(selected, ['CNRS', 'UB'], 'les valeurs choisies montent en tête de liste');
      pick(EMPLOYEUR, 'Tous les employeurs');
      assertEqual(names().length, 5, '« Tous » vide le filtre');
      pick(STRUCTURE, 'LMTC');
      assertDeepEqual(names(), ['Chloé PETIT']);
      pick(TYPE, 'BIATSS');
      assertDeepEqual(names(), [], 'LMTC ET BIATSS : personne');
      assertIncludes(view().querySelector('#annu-content').textContent, 'Aucune personne ne correspond');
      unload();
    });

    it('taper dans employeur, structure ou type réduit la liste ; Entrée coche (24/11/2026)', async function () {
      await load();
      const input = byId(EMPLOYEUR);
      fire(input, 'focus');
      input.value = 'cn'; fire(input, 'input');
      assertDeepEqual(optionLabels(EMPLOYEUR), ['CNRS'], 'seule « CNRS » contient « cn »');
      fireKey(input, 'Enter');
      assertEqual(input.value, 'cn', 'la recherche reste affichée tant que le champ est actif');
      assertEqual(input.title, 'CNRS', 'la sélection se lit au survol');
      assertTrue(input.closest('.filter-combo').classList.contains('is-active'));
      assertDeepEqual(names(), ['Bob DURAND'], 'seule la personne employée par le CNRS reste');
      input.value = 'zzz'; fire(input, 'input');
      assertEqual(listOf(EMPLOYEUR).querySelector('.combo-empty').textContent, 'Aucun résultat');
      pick(EMPLOYEUR, 'Tous les employeurs');
      unload();
    });
    it('À vérifier ne garde que les fiches en alerte et affiche leur nombre ; Réinitialiser remet tout à zéro', async function () {
      await load();
      assertEqual(byId('annu-check-count').textContent, '4');
      click(byId('annu-check'));
      assertEqual(byId('annu-check').getAttribute('aria-pressed'), 'true');
      assertDeepEqual(names(), ['Éric LÉON', 'Alice MARTIN', 'Alice MARTIN', 'Chloé PETIT']);
      setSearch('chlo');
      pick(EMPLOYEUR, 'Inserm');
      assertDeepEqual(names(), ['Chloé PETIT']);
      click(byId('annu-reset'));
      assertEqual(names().length, 5);
      assertEqual(byId('annu-search').value, '');
      assertEqual(byId(EMPLOYEUR).value, '');
      assertEqual(byId('annu-check').getAttribute('aria-pressed'), 'false');
      assertEqual(byId('annu-reset').hidden, true, 'plus rien à réinitialiser');
      unload();
    });

    it('un en-tête de colonne trie : un premier clic en ordre croissant, un second dans l\'autre sens', async function () {
      await load();
      click(view().querySelector('[data-annu="sort"][data-value="nom"]'));
      assertEqual(names()[0], 'Chloé PETIT', 'le tri par nom était déjà croissant : le clic l\'inverse');
      click(view().querySelector('[data-annu="sort"][data-value="employeur"]'));
      assertEqual(names()[names().length - 1], 'Alice MARTIN', 'employeur croissant : sans employeur d\'abord, UB en dernier');
      click(view().querySelector('[data-annu="sort"][data-value="employeur"]'));
      assertEqual(names()[0], 'Alice MARTIN', 'employeur décroissant');
      unload();
    });
  });

  describe('Annuaire — trois présentations', function () {
    it('par structure : un groupe par structure (« Sans structure » en dernier), avec son nombre de personnes', async function () {
      await load();
      click(view().querySelector('[data-annu-view="structure"]'));
      const heads = Array.from(view().querySelectorAll('.annu-ghead'));
      assertDeepEqual(heads.map(h => h.querySelector('.annu-gn').textContent), ['DIESE', 'LMTC', 'Sans structure']);
      assertDeepEqual(heads.map(h => h.querySelector('.kanban-count').textContent), ['2', '1', '2']);
      assertEqual(heads[0].querySelector('.annu-gs').textContent, 'Direction de l\'innovation · VP Innovation');
      assertEqual(heads[2].querySelector('.annu-gs').textContent, 'Sans poste, ou poste sans structure');
      assertEqual(byId('view-annuaire').querySelectorAll('.annu-row').length, 5);
      assertEqual(view().querySelector('[data-annu-view="structure"]').getAttribute('aria-pressed'), 'true');
      unload();
    });

    it('un groupe se replie et se déplie ; l\'état est retenu même avec une virgule dans le libellé de la structure', async function () {
      await load();
      click(view().querySelector('[data-annu-view="structure"]'));
      click(view().querySelector('.annu-ghead[data-value="DIESE"]'));
      assertEqual(view().querySelectorAll('.annu-row').length, 3, 'DIESE replié : ses deux personnes disparaissent');
      assertEqual(view().querySelector('.annu-ghead[data-value="DIESE"]').getAttribute('aria-expanded'), 'false');
      assertDeepEqual(T().state.collapsed, ['DIESE']);
      click(view().querySelector('.annu-ghead[data-value="DIESE"]'));
      assertEqual(view().querySelectorAll('.annu-row').length, 5);
      unload();
    });

    it('en cartes : une carte par personne avec employeur, structure, types et e-mail', async function () {
      await load();
      click(view().querySelector('[data-annu-view="cartes"]'));
      const cards = Array.from(view().querySelectorAll('.annu-pc'));
      assertEqual(cards.length, 5);
      assertEqual(view().querySelectorAll('.annu-row').length, 0, 'plus de tableau');
      const alice = view().querySelector('.annu-pc[data-person="1"]');
      assertIncludes(alice.textContent, 'DIESE');
      assertIncludes(alice.textContent, 'alice@ub.fr');
      assertDeepEqual(Array.from(alice.querySelectorAll('.is-type')).map(el => el.textContent), ['EC', 'C']);
      assertEqual(view().querySelectorAll('.annu-pc[data-person="4"] .annu-pill:not(.is-type)').length, 0, 'sans poste : ni employeur ni structure, pas de pastille « — »');
      unload();
    });

    it('le choix de présentation n\'existe que pour les personnes', async function () {
      await load();
      assertFalse(byId('annu-views').hidden);
      click(tab('postes'));
      assertTrue(byId('annu-views').hidden);
      unload();
    });
  });

  describe('Annuaire — onglet Postes', function () {
    it('un poste montre sa structure, son employeur, son titulaire, son contrat et la fin de contrat', async function () {
      await load();
      click(tab('postes'));
      assertEqual(tab('postes').getAttribute('aria-selected'), 'true');
      assertEqual(byId('annu-new').textContent, '+ Nouveau poste');
      assertEqual(rows().length, 5);
      const resp = rows().find(r => r.textContent.includes('Responsable innovation')).textContent;
      assertIncludes(resp, 'DIESE');
      assertIncludes(resp, 'VP Innovation', 'direction de la structure');
      assertIncludes(resp, 'UB');
      assertIncludes(resp, 'Alice MARTIN');
      assertIncludes(resp, 'CDI');
      assertEqual(rows()[0].querySelector('.annu-t1').textContent, 'Chargé de mission', 'triés par structure puis titre');
      unload();
    });

    it('un poste sans personne est « Vacant » ; le titulaire d\'un poste ouvre sa fiche', async function () {
      await load();
      click(tab('postes'));
      const vacant = rows().find(r => r.textContent.includes('Gestionnaire (poste vacant)'));
      assertIncludes(vacant.textContent, 'Vacant');
      const link = rows().find(r => r.textContent.includes('Chargé de mission')).querySelector('[data-annu="open"]');
      assertEqual(link.textContent, 'Bob DURAND');
      click(link);
      assertTrue(!!drawer(), 'la fiche de Bob s\'ouvre');
      assertIncludes(drawer().querySelector('h2').textContent, 'Bob DURAND');
      unload();
    });

    it('la fin de contrat est datée, orange à moins de 90 jours, et dit « terminé » une fois passée', async function () {
      await load();
      click(tab('postes'));
      const soon = rows().find(r => r.textContent.includes('Chargé de mission'));
      assertIncludes(soon.textContent, 'fin le 17/12/2026 (30 j)');
      assertTrue(!!soon.querySelector('.annu-t2.is-warn'));
      const past = rows().find(r => r.textContent.includes('Gestionnaire (poste vacant)'));
      assertIncludes(past.textContent, 'fin le 07/11/2026 (terminé)');
      const cdi = rows().find(r => r.textContent.includes('Responsable innovation'));
      assertFalse(!!cdi.querySelector('.is-warn'));
      unload();
    });

    it('À vérifier ne garde que les postes vacants ou à échéance proche, et affiche leur nombre', async function () {
      await load();
      click(tab('postes'));
      assertEqual(byId('annu-check-count').textContent, '2');
      click(byId('annu-check'));
      assertDeepEqual(rows().map(r => r.querySelector('.annu-t1').textContent), ['Chargé de mission', 'Gestionnaire (poste vacant)']);
      assertEqual(byId('annu-count-postes').textContent, '2/5');
      unload();
    });

    it('le filtre Type (propre aux personnes) disparaît sur cet onglet et les filtres communs restent actifs', async function () {
      await load();
      pick(EMPLOYEUR, 'CNRS');
      assertFalse(byId(TYPE).closest('.filter-combo').hidden);
      click(tab('postes'));
      assertTrue(byId(TYPE).closest('.filter-combo').hidden);
      assertEqual(rows().length, 2, 'postes employés par le CNRS : Chargé de mission et Ingénieur plateau');
      unload();
    });

    it('modifier un poste ouvre la modale Poste existante avec la ligne de Grist', async function () {
      await load();
      click(tab('postes'));
      const calls = [];
      const restore = stub(window, 'openEditPosteModal', row => calls.push(row));
      try { click(rows().find(r => r.textContent.includes('Responsable innovation')).querySelector('[data-annu="edit-poste"]')); } finally { restore(); }
      assertEqual(calls.length, 1);
      assertEqual(calls[0].Titre, 'Responsable innovation');
      unload();
    });
  });

  describe('Annuaire — fiche latérale', function () {
    it('un clic sur le nom ouvre la fiche : identité, coordonnées, rattachement, projets, étiquettes', async function () {
      await load();
      openFiche(1);
      const d = drawer();
      assertTrue(!!d, 'fiche ouverte');
      assertEqual(d.querySelector('h2').textContent, 'Alice MARTIN');
      assertIncludes(d.querySelector('.annu-dtitle p').textContent, 'Responsable innovation · Pôle valorisation');
      assertIncludes(d.textContent, 'alice@ub.fr');
      assertIncludes(d.textContent, '0600000001');
      const tree = Array.from(d.querySelectorAll('.annu-lvl')).map(el => `${el.querySelector('.k').textContent}=${el.querySelector('.v').textContent}`);
      assertDeepEqual(tree, ['Tutelle=UB', 'Direction=VP Innovation', 'Structure=DIESE', 'Poste=Responsable innovation · Pôle valorisation']);
      assertIncludes(d.textContent, 'CDI · Administratif · Agent');
      assertEqual(d.querySelector('.annu-dbody').textContent.includes('Valorisation'), true, 'communauté métier');
      assertIncludes(d.textContent, 'Oui ★');
      assertTrue(view().querySelector('[data-person="1"]').classList.contains('is-sel'), 'la ligne ouverte est marquée');
      unload();
    });

    it('les projets sont rangés par rôle, avec leur nombre, et chaque puce est un bouton', async function () {
      await load();
      openFiche(1);
      const groups = Array.from(drawer().querySelectorAll('.annu-pg')).map(g => ({
        label: g.querySelector('.k').firstChild.textContent, n: g.querySelector('.k b').textContent,
        chips: Array.from(g.querySelectorAll('.annu-pj')).map(c => c.textContent)
      }));
      assertDeepEqual(groups, [
        { label: 'Porteur', n: '3', chips: ['ALPHA', 'BETA', 'GAMMA'] },
        { label: 'Accompagnateur', n: '1', chips: ['GAMMA'] }
      ]);
      closeAndOpen(5);
      assertIncludes(drawer().textContent, 'Aucun projet');
      unload();
    });
    function closeAndOpen(id) { click(drawer().querySelector('.annu-x')); openFiche(id); }

    it('un clic sur un projet de la fiche ouvre la modale projet avec la ligne du projet', async function () {
      await load();
      openFiche(1);
      const opened = [];
      const restore = stub(window.ProjectModal, 'open', arg => opened.push(arg));
      try { click(Array.from(drawer().querySelectorAll('.annu-pj')).find(c => c.textContent === 'BETA')); } finally { restore(); }
      assertEqual(opened.length, 1, 'la modale projet est ouverte une fois');
      assertEqual(opened[0].id, 11);
      assertEqual(opened[0].Acronyme, 'BETA');
      unload();
    });

    it('un projet introuvable (supprimé depuis) prévient au lieu de planter', async function () {
      await load();
      openFiche(1);
      window.CoreState.setTable('Projets', []);
      const opened = [];
      const restore = stub(window.ProjectModal, 'open', arg => opened.push(arg));
      try { click(drawer().querySelector('.annu-pj')); } finally { restore(); }
      assertEqual(opened.length, 0);
      assertIncludes(byId('toast').textContent, 'Projet introuvable');
      unload();
    });

    it('À vérifier dans la fiche : chaque alerte est dite, avec un lien vers la fiche en doublon', async function () {
      await load();
      openFiche(1);
      const lines = Array.from(drawer().querySelectorAll('.annu-iss')).map(el => el.querySelector('span').textContent);
      assertDeepEqual(lines, ['Nom en doublon', 'E-mail en doublon']);
      click(drawer().querySelector('.annu-iss .annu-link'));
      assertIncludes(drawer().querySelector('h2').textContent, 'Alice MARTIN');
      assertIncludes(drawer().textContent, 'Aucun poste rattaché', 'c\'est la fiche en doublon (id 4, sans poste)');
      unload();
    });

    it('l\'assistant·e est un lien vers sa fiche ; le matricule n\'apparaît que s\'il existe', async function () {
      await load();
      openFiche(1);
      assertFalse(drawer().textContent.includes('Matricule'));
      click(Array.from(drawer().querySelectorAll('.annu-link')).find(l => l.textContent === 'Chloé PETIT'));
      assertIncludes(drawer().querySelector('h2').textContent, 'Chloé PETIT');
      assertIncludes(drawer().textContent, 'Non renseigné', 'Chloé n\'a pas d\'e-mail');
      click(drawer().querySelector('.annu-x'));
      openFiche(5);
      assertIncludes(drawer().textContent, 'M123');
      assertIncludes(drawer().textContent, 'Ingénieur plateau — Plateau A, B', 'poste secondaire');
      unload();
    });

    it('« Écrire » ouvre le client de messagerie ; sans e-mail, le bouton n\'existe pas', async function () {
      await load();
      openFiche(2);
      assertEqual(drawer().querySelector('a.btn').getAttribute('href'), 'mailto:bob@cnrs.fr');
      click(drawer().querySelector('.annu-x'));
      openFiche(3);
      assertEqual(drawer().querySelectorAll('a.btn').length, 0);
      unload();
    });

    it('Modifier ouvre la modale Personne existante avec la ligne de Grist ; le lien du poste ouvre la modale Poste', async function () {
      await load();
      openFiche(1);
      const people = [], postes = [];
      const r1 = stub(window, 'openEditPersonModal', row => people.push(row));
      const r2 = stub(window, 'openEditPosteModal', row => postes.push(row));
      try {
        click(drawer().querySelector('[data-annu="edit"]'));
        click(drawer().querySelector('[data-annu="edit-poste"]'));
      } finally { r1(); r2(); }
      assertEqual(people.length, 1);
      assertEqual(people[0].id, 1);
      assertEqual(people[0].NOM, 'Martin');
      assertEqual(postes.length, 1);
      assertEqual(postes[0].id, 1);
      unload();
    });

    it('la fiche se ferme par la croix, par le voile et par Échap — sauf si une modale est ouverte par-dessus', async function () {
      await load();
      openFiche(1);
      click(drawer().querySelector('.annu-x'));
      assertEqual(drawer(), null, 'croix');
      openFiche(1);
      click(byId('annu-drawer-root').querySelector('.annu-scrim'));
      assertEqual(drawer(), null, 'voile');
      openFiche(1);
      const modal = document.createElement('div');
      modal.className = 'cp-modal';
      document.body.appendChild(modal);
      try {
        fireKey(document.body, 'Escape');
        assertTrue(!!drawer(), 'Échap sert d\'abord à la modale ouverte par-dessus');
      } finally { modal.remove(); }
      fireKey(document.body, 'Escape');
      assertEqual(drawer(), null, 'Échap');
      assertFalse(view().querySelector('[data-person="1"]').classList.contains('is-sel'));
      unload();
    });

    it('changer de page ferme la fiche (elle est hors de la vue)', async function () {
      await load();
      openFiche(1);
      click(document.querySelector('.nav-btn[data-view="view-todo"]'));
      assertEqual(drawer(), null);
      unload();
    });

    it('copier l\'e-mail passe par le presse-papiers et le dit', async function () {
      await load();
      const copied = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { copied.push(value); } } });
      try {
        click(view().querySelector('[data-person="2"] [data-annu="copy"]'));
        await wait(0);
      } finally { delete navigator.clipboard; }
      assertDeepEqual(copied, ['bob@cnrs.fr']);
      assertEqual(byId('toast').textContent, 'E-mail copié');
      unload();
    });

    it('un nom ou un e-mail avec du HTML s\'affiche tel quel, sans être interprété', async function () {
      await load({ tables: { Annuaire: {
        id: [1], NOM: ['<img src=x onerror=alert(1)>'], Prenom: ['Mal'], nom_et_Prenom: ['Mal <img src=x onerror=alert(1)>'], Email: ['a"><b>x@x.fr'], Poste2: [1]
      } } });
      assertEqual(view().querySelectorAll('#annu-content img, #annu-content b').length, 0, 'aucune balise injectée dans la liste');
      openFiche(1);
      assertEqual(byId('annu-drawer-root').querySelectorAll('img, b:not(.k b)').length, 0, 'ni dans la fiche');
      assertIncludes(drawer().querySelector('h2').textContent, '<img src=x');
      unload();
    });
  });

  describe('Annuaire — créer : modales Personne et Poste existantes', function () {
    it('« + Nouvelle personne » ouvre la modale Personne, « + Nouveau poste » (onglet Postes) la modale Poste', async function () {
      await load();
      const calls = [];
      const r1 = stub(window, 'openCreatePersonModal', name => calls.push(['personne', name]));
      const r2 = stub(window, 'openCreatePosteModal', name => calls.push(['poste', name]));
      try {
        click(byId('annu-new'));
        click(tab('postes'));
        click(byId('annu-new'));
      } finally { r1(); r2(); }
      assertDeepEqual(calls, [['personne', ''], ['poste', '']]);
      unload();
    });
  });

  describe('Annuaire — bulles d\'aide (descriptions des colonnes Grist)', function () {
    it('sans description Grist, aucune icône d\'aide ; avec une description, l\'icône suit son libellé', async function () {
      await load();
      assertEqual(view().querySelectorAll('.help-icon').length, 0, 'aucune description : aucune icône');
      openFiche(1);
      assertEqual(byId('annu-drawer-root').querySelectorAll('.help-icon').length, 0);
      await load({ meta: { choices: TYPE_CHOICES, descriptions: [
        { table: 'Annuaire', col: 'Type', description: 'Statut de la personne : BIATSS, C, EC…' },
        { table: 'Annuaire', col: 'Communaute_metier', description: 'Communauté professionnelle.' },
        { table: 'Postes2', col: 'Employeur_tutelle', description: 'Établissement employeur du poste.' }
      ] } });
      const head = view().querySelector('.annu-head .c-type .help-icon');
      assertTrue(!!head, 'icône dans l\'en-tête de colonne Type');
      assertEqual(head.dataset.helpText, 'Statut de la personne : BIATSS, C, EC…');
      assertTrue(!!view().querySelector('.annu-head .c-etab .help-icon'), 'colonne Employeur');
      assertFalse(!!view().querySelector('.annu-head .c-poste .help-icon'), 'Annuaire.Poste2 n\'a pas de description');
      openFiche(1);
      assertEqual(byId('annu-drawer-root').querySelectorAll('.help-icon').length > 0, true, 'et dans la fiche');
      unload();
    });
  });

  describe('Annuaire — filtres retenus par utilisateur (Preferences_Widget)', function () {
    it('les colonnes Annu_* sont créées dans Preferences_Widget au démarrage', async function () {
      await load();
      await loadPrefs();
      const added = window.__TEST_CALLS__.filter(c => c.type === 'AddColumn' && c.table === 'Preferences_Widget').map(c => c.colId);
      ['Annu_onglet', 'Annu_vue', 'Annu_recherche', 'Annu_filtre_employeur', 'Annu_filtre_structure', 'Annu_filtre_type', 'Annu_a_verifier', 'Annu_tri', 'Annu_repliees']
        .forEach(col => assertTrue(added.includes(col) || window.CoreGrist.knownColumns('Preferences_Widget').has(col), `colonne ${col}`));
      unload();
    });

    it('chaque choix est enregistré tout de suite sur la ligne de la personne, listes encodées avec encodeList', async function () {
      await load();
      await loadPrefs();
      window.__TEST_CALLS__.length = 0;
      pick(EMPLOYEUR, 'UB');
      pick(EMPLOYEUR, 'CNRS');
      pick(STRUCTURE, 'Plateau A, B');
      pick(TYPE, 'EC');
      click(byId('annu-check'));
      click(tab('postes'));
      click(tab('pers'));
      click(view().querySelector('[data-annu-view="cartes"]'));
      await wait(30);
      const update = prefsUpdates().slice(-1)[0];
      assertEqual(update.id, 1, 'la ligne partagée avec les autres pages');
      assertEqual(update.fields.Annu_onglet, 'pers');
      assertEqual(update.fields.Annu_vue, 'cartes');
      assertEqual(update.fields.Annu_filtre_employeur, 'UB,CNRS');
      assertEqual(update.fields.Annu_filtre_structure, '["Plateau A, B"]', 'un libellé avec virgule est écrit en JSON, jamais coupé');
      assertEqual(update.fields.Annu_filtre_type, 'EC');
      assertEqual(update.fields.Annu_a_verifier, '1');
      assertEqual(update.fields.Annu_tri, 'nom:1');
      unload();
    });

    it('la recherche est enregistrée une seule fois, après la frappe (ou tout de suite si la page est masquée)', async function () {
      await load();
      await loadPrefs();
      window.__TEST_CALLS__.length = 0;
      setSearch('a'); setSearch('al'); setSearch('ali');
      assertEqual(prefsUpdates().length, 0, 'rien n\'est écrit pendant la frappe');
      withHiddenDocument(() => document.dispatchEvent(new Event('visibilitychange')));
      await wait(30);
      assertEqual(prefsUpdates().length, 1, 'une seule écriture, déclenchée par le masquage de la page');
      assertEqual(prefsUpdates()[0].fields.Annu_recherche, 'ali');
      unload();
    });

    it('le tri et les groupes repliés sont retenus', async function () {
      await load();
      await loadPrefs();
      click(view().querySelector('[data-annu="sort"][data-value="structure"]'));
      click(view().querySelector('[data-annu="sort"][data-value="structure"]'));
      await wait(30);
      assertEqual(prefsUpdates().slice(-1)[0].fields.Annu_tri, 'structure:-1');
      click(view().querySelector('[data-annu-view="structure"]'));
      click(view().querySelector('.annu-ghead[data-value="Sans structure"]'));
      await wait(30);
      assertEqual(prefsUpdates().slice(-1)[0].fields.Annu_repliees, 'Sans structure');
      unload();
    });

    it('à la réouverture, les préférences enregistrées sont réappliquées : onglet, présentation, filtres, tri, groupes', async function () {
      await load();
      await window.loadKanbanUserPreferences();
      window.__mockSetTable('Preferences_Widget', {
        id: [1], Email_utilisateur: [''],
        Annu_onglet: ['pers'], Annu_vue: ['structure'], Annu_recherche: ['a'],
        Annu_filtre_employeur: ['UB,CNRS'], Annu_filtre_structure: ['["DIESE","Plateau A, B"]'], Annu_filtre_type: ['EC,BIATSS'],
        Annu_a_verifier: [''], Annu_tri: ['employeur:-1'], Annu_repliees: ['LMTC']
      });
      try { localStorage.setItem(PREFS_ROWID_KEY, '1'); } catch (err) { /* ignore */ }
      T().resetState();
      await window.loadAnnuaireUserPreferences();
      window.renderAnnuaire();
      assertEqual(T().state.view, 'structure');
      assertEqual(byId('annu-search').value, 'a');
      assertEqual(byId(EMPLOYEUR).value, '2 employeurs sélectionnés');
      assertDeepEqual(T().state.structures, ['DIESE', 'Plateau A, B'], 'la virgule du libellé est préservée');
      assertDeepEqual(T().state.types, ['EC', 'BIATSS']);
      assertEqual(T().state.sortKey, 'employeur');
      assertEqual(T().state.sortDir, -1);
      assertDeepEqual(T().state.collapsed, ['LMTC']);
      assertEqual(view().querySelector('[data-annu-view="structure"]').getAttribute('aria-pressed'), 'true');
      assertEqual(byId('annu-reset').hidden, false);
      assertDeepEqual(names(), ['Alice MARTIN', 'Bob DURAND'], 'liste filtrée comme à la fermeture, employeur décroissant (UB avant CNRS)');
      unload();
    });

    it('des préférences illisibles (onglet ou présentation inconnus) retombent sur les valeurs par défaut', async function () {
      await load();
      await window.loadKanbanUserPreferences();
      window.__mockSetTable('Preferences_Widget', {
        id: [1], Email_utilisateur: [''],
        Annu_onglet: ['archives'], Annu_vue: ['mosaique'], Annu_recherche: [''], Annu_filtre_employeur: [''], Annu_filtre_structure: [''], Annu_filtre_type: [''],
        Annu_a_verifier: [''], Annu_tri: ['couleur:7'], Annu_repliees: ['']
      });
      try { localStorage.setItem(PREFS_ROWID_KEY, '1'); } catch (err) { /* ignore */ }
      T().resetState();
      await window.loadAnnuaireUserPreferences();
      assertEqual(T().state.tab, 'pers');
      assertEqual(T().state.view, 'liste');
      assertEqual(T().state.sortKey, 'nom');
      unload();
    });

    it('une ligne de préférences sans aucune préférence Annuaire ne touche à rien', async function () {
      await load();
      await loadPrefs();
      window.renderAnnuaire();
      assertEqual(names().length, 5);
      assertEqual(T().state.view, 'liste');
      unload();
    });
  });

  describe('Annuaire — mise à jour après les modales Personne et Poste (directory-changed)', function () {
    it('enregistrer la modale Personne en modification relit l\'Annuaire dans Grist et redessine la page', async function () {
      await load();
      const modal = window.openEditPersonModal(person(2).row);
      modal.querySelector('#cpp-email').value = 'bob.durand@nouveau.fr';
      await modal.querySelector('[data-cp-save]').onclick();
      await waitFor(() => view().querySelector('[data-person="2"]').textContent.includes('bob.durand@nouveau.fr'), 'e-mail mis à jour dans la liste');
      assertEqual(person(2).email, 'bob.durand@nouveau.fr');
      unload();
    });

    it('le nom calculé par Grist (formule) remplace l\'ancien après une modification', async function () {
      await load();
      const modal = window.openEditPersonModal(person(2).row);
      modal.querySelector('#cpp-prenom').value = 'Robert';
      // Le mock ne recalcule pas les formules : on le fait comme Grist, côté document.
      await window.grist.docApi.applyUserActions([['UpdateRecord', 'Annuaire', 2, { nom_et_Prenom: 'Robert DURAND' }]]);
      await modal.querySelector('[data-cp-save]').onclick();
      await waitFor(() => names().includes('Robert DURAND'), 'nom relu depuis Grist');
      assertFalse(names().includes('Bob DURAND'));
      unload();
    });

    it('une personne créée depuis la page voit sa fiche s\'ouvrir', async function () {
      await load();
      const result = await window.grist.docApi.applyUserActions([['AddRecord', 'Annuaire', null, { NOM: 'Nouveau', Prenom: 'Noé', nom_et_Prenom: 'Noé NOUVEAU', Email: 'noe@x.fr', Poste2: 1 }]]);
      const id = window.CoreUtils.extractAddedRecordId(result);
      window.dispatchEvent(new CustomEvent('directory-changed', { detail: { table: 'Annuaire', id, created: true } }));
      await waitFor(() => drawer(), 'fiche ouverte');
      assertEqual(drawer().querySelector('h2').textContent, 'Noé NOUVEAU');
      assertEqual(names().length, 6);
      unload();
    });

    it('une personne créée ailleurs (modale projet) ne rouvre pas de fiche mais la page est à refaire', async function () {
      await load();
      view().classList.add('hidden');
      window.SuiviApp.staleViews.delete('view-annuaire');
      const result = await window.grist.docApi.applyUserActions([['AddRecord', 'Annuaire', null, { NOM: 'Ailleurs', Prenom: 'Alix', nom_et_Prenom: 'Alix AILLEURS', Poste2: 1 }]]);
      const id = window.CoreUtils.extractAddedRecordId(result);
      await T().onDirectoryChanged({ detail: { table: 'Annuaire', id, created: true } });
      assertEqual(T().state.selectedId, 0, 'aucune fiche');
      assertTrue(window.SuiviApp.staleViews.has('view-annuaire'), 'la page sera redessinée à son ouverture');
      assertTrue(window.CoreState.getTable('Annuaire').some(row => row.id === id), 'et les autres pages voient la personne');
      window.SuiviApp.staleViews.delete('view-annuaire');
      unload();
    });

    it('modifier un poste (modale Poste) met à jour l\'onglet Postes', async function () {
      await load();
      click(tab('postes'));
      await window.PosteModal.persist('edit', poste(1).row, { Structure2: 1, Employeur_tutelle: 1, Titre: 'Responsable innovation et partenariats', Precisions_Poste: 'Pôle valorisation' });
      await waitFor(() => rows().some(r => r.textContent.includes('Responsable innovation et partenariats')), 'titre mis à jour');
      assertEqual(rows().length, 5);
      unload();
    });

    it('plusieurs modifications d\'affilée donnent un état final juste (relectures regroupées)', async function () {
      await load();
      const events = [1, 2, 3].map(() => T().onDirectoryChanged({ detail: { table: 'Postes2', id: 1 } }));
      await Promise.all(events);
      assertEqual(names().length, 5);
      assertEqual(rows().length, 5);
      unload();
    });
  });

  describe('Annuaire — dans le widget (navigation et rendu à la demande)', function () {
    it('la page est branchée sur le rendu à la demande : une page « à refaire » se dessine à son ouverture', async function () {
      await load();
      assertEqual(typeof window.SuiviApp.VIEW_RENDERERS['view-annuaire'], 'function');
      view().classList.add('hidden');
      byId('annu-content').innerHTML = '';
      window.SuiviApp.staleViews.add('view-annuaire');
      window.SuiviApp.showView('view-annuaire');
      assertEqual(window.SuiviApp.staleViews.has('view-annuaire'), false);
      assertEqual(names().length, 5, 'le contenu est dessiné à l\'ouverture');
      view().classList.add('hidden');
      unload();
    });

    it('le bouton « Annuaire » de la barre est dans la page (donc retenu comme dernière page ouverte)', async function () {
      const button = document.querySelector('.nav-btn[data-view="view-annuaire"]');
      assertTrue(!!button, 'bouton de navigation');
      assertEqual(button.textContent, 'Annuaire');
      assertTrue(!!byId('view-annuaire'), 'section de la page');
    });

    it('la page tolère un démarrage sans aucune donnée (tables vides) et reste utilisable', async function () {
      installTables({ Annuaire: { id: [] }, Postes2: { id: [] }, Projets: { id: [] } });
      const tables = await window.CoreGrist.loadAllTables();
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      T().resetState(); L().setClock(() => TODAY); view().classList.remove('hidden');
      window.renderAnnuaire();
      assertEqual(byId('annu-count-pers').textContent, '0');
      assertIncludes(view().querySelector('#annu-content').textContent, 'Aucune personne ne correspond');
      click(tab('postes'));
      assertIncludes(view().querySelector('#annu-content').textContent, 'Aucun poste ne correspond');
      unload();
    });
  });
})();
