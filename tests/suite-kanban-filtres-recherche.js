/**
 * Non-regression suite : filtres Programme / Instance du Kanban Projets (js/pages/page-projets.js), demandes du 24/11/2026 :
 *  1) taper dans un filtre réduit la liste (avant : champ en lecture seule, la frappe ne faisait rien) ; ↑/↓/Entrée/Échap au clavier ;
 *  2) le filtre Instance place toujours en tête le prochain et le dernier CTO (CTO Innovation / CTO FARE), même sans projet rattaché.
 *
 * Fixtures (tests/fixtures.js) : Programme A = INNOVX, CONVENTIX, FINANCX, INCONNUX, SIGNEX ; Programme B = NOTIFY, COURSIX ;
 * Suivi_Instance #1 « Comité innovation#3 - 2026-03-15 » (sans date, pas un CTO) rattachée à INNOVX, CONVENTIX, COURSIX.
 */
(function () {
  'use strict';

  const L = () => window.InstancesLogic;
  const todayIso = () => L().parisParts(Date.now() / 1000).date;
  const gristDay = offset => L().isoToGristDate(L().addDaysIso(todayIso(), offset));
  const LAST = 'CTO Innovation#10 - dernier';
  const NEXT = 'CTO Innovation#11 - prochain';

  // `seances` : lignes ajoutées à Suivi_Instance ; `attach` : { acronyme: id de séance }.
  async function loadState(seances, attach) {
    const tables = await window.CoreGrist.loadAllTables();
    (seances || []).forEach(seance => tables.Suivi_Instance.push(seance));
    Object.entries(attach || {}).forEach(([acronym, id]) => { tables.Projets.find(p => p.Acronyme === acronym).Instance_ratachee = id; });
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    ['filter-programme', 'filter-instance'].forEach(id => { const input = document.getElementById(id); input.dataset.selectedValues = ''; input.value = ''; });
    document.getElementById('filter-search').value = '';
    window.renderProjectsKanban();
  }
  async function cleanUp() {
    document.getElementById('clear-filters').click();
    await wait(5);
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    window.renderProjectsKanban();
  }
  const listOf = id => document.getElementById(`${id}-list`);
  const values = id => Array.from(listOf(id).querySelectorAll('[data-value]')).map(b => b.dataset.value);
  const shown = () => Array.from(document.querySelectorAll('#projects-kanban .project-acronym')).map(el => el.textContent).sort();
  function typeIn(id, query) {
    const input = document.getElementById(id);
    fire(input, 'focus');
    input.value = query;
    fire(input, 'input');
    return input;
  }
  const CTO_SEANCES = [
    { id: 2, Nom: LAST, date: gristDay(-20) },
    { id: 3, Nom: NEXT, date: gristDay(15) }
  ];

  describe('Kanban Projets — taper dans un filtre réduit la liste', function () {
    it('Programme : la frappe ne garde que les libellés qui contiennent le texte, sans casse ni accents', async function () {
      await loadState();
      typeIn('filter-programme', 'PROGRAMME b');
      assertDeepEqual(values('filter-programme'), ['Programme B'], 'seul « Programme B » reste proposé (le bouton « Tous les programmes » est masqué pendant la recherche)');
      typeIn('filter-programme', 'programme');
      assertDeepEqual(values('filter-programme'), ['Programme A', 'Programme B']);
      await cleanUp();
    });

    it('Instance : la frappe réduit aussi la liste des instances', async function () {
      await loadState();
      typeIn('filter-instance', 'comite');
      assertDeepEqual(values('filter-instance'), ['Comité innovation#3 - 2026-03-15'], 'sans accent, « comite » retrouve « Comité »');
      typeIn('filter-instance', 'zzz');
      assertDeepEqual(values('filter-instance'), []);
      assertEqual(listOf('filter-instance').querySelector('.combo-empty').textContent, 'Aucun résultat');
      await cleanUp();
    });

    it('taper ne filtre pas encore le Kanban : seul un choix coché le fait', async function () {
      await loadState();
      const before = shown();
      typeIn('filter-programme', 'programme b');
      assertDeepEqual(shown(), before, 'la recherche dans la liste ne change pas les cartes');
      assertEqual(document.getElementById('filter-programme').dataset.selectedValues || '', '', 'rien n\'est coché');
      await cleanUp();
    });

    it('la frappe efface le résumé affiché : le champ contient la recherche, puis retrouve le résumé en quittant le champ', async function () {
      await loadState();
      const input = typeIn('filter-programme', 'x');
      assertEqual(input.value, 'x');
      input.value = 'programme b';
      fire(input, 'input');
      fireKey(input, 'Enter'); // coche « Programme B »
      assertEqual(input.value, 'programme b', 'la recherche reste affichée tant que le champ est actif (on peut cocher une autre proposition)');
      fire(input, 'blur');
      await wait(200);
      assertEqual(input.value, 'Programme B', 'au blur, le champ affiche de nouveau le résumé de la sélection');
      assertTrue(listOf('filter-programme').hidden, 'la liste se ferme au blur');
      fire(input, 'focus');
      assertDeepEqual(values('filter-programme'), ['', 'Programme B', 'Programme A'], 'à la réouverture : toute la liste, valeur cochée en tête');
      await cleanUp();
    });

    it('une mise à jour des données pendant la frappe ne vide pas la recherche', async function () {
      await loadState();
      const input = typeIn('filter-programme', 'programme b');
      window.renderProjectsKanban();
      assertEqual(input.value, 'programme b', 'le texte tapé est conservé');
      assertDeepEqual(values('filter-programme'), ['Programme B'], 'la liste reste réduite');
      await cleanUp();
    });
  });

  describe('Kanban Projets — filtres au clavier', function () {
    it('Entrée coche la première proposition d\'une recherche et filtre le Kanban', async function () {
      await loadState();
      const input = typeIn('filter-programme', 'programme b');
      const active = listOf('filter-programme').querySelector('.is-active');
      assertTrue(!!active && active.dataset.value === 'Programme B', 'la première proposition est surlignée pendant la frappe');
      fireKey(input, 'Enter');
      assertDeepEqual(shown(), ['COURSIX', 'NOTIFY'], 'seuls les projets du Programme B restent');
      assertFalse(listOf('filter-programme').hidden, 'la liste reste ouverte après Entrée, comme après un clic');
      await cleanUp();
    });

    it('↓ / ↑ déplacent la proposition surlignée, Entrée la coche, Entrée de nouveau la décoche', async function () {
      await loadState();
      const input = document.getElementById('filter-programme');
      const everyone = shown();
      fire(input, 'focus');
      fireKey(input, 'ArrowDown'); // « Tous les programmes »
      fireKey(input, 'ArrowDown'); // Programme A
      fireKey(input, 'ArrowDown'); // Programme B
      const active = listOf('filter-programme').querySelectorAll('.is-active');
      assertEqual(active.length, 1, 'une seule proposition surlignée');
      assertEqual(active[0].dataset.value, 'Programme B');
      fireKey(input, 'Enter');
      assertDeepEqual(shown(), ['COURSIX', 'NOTIFY']);
      assertTrue(listOf('filter-programme').querySelector('[data-value="Programme B"]').classList.contains('is-selected'));
      fireKey(input, 'Enter');
      assertDeepEqual(shown(), everyone, 'le second Entrée décoche : tous les projets reviennent');
      fireKey(input, 'ArrowUp');
      assertEqual(listOf('filter-programme').querySelector('.is-active').dataset.value, 'Programme A', '↑ remonte d\'une proposition');
      fireKey(input, 'ArrowUp');
      assertEqual(listOf('filter-programme').querySelector('.is-active').dataset.value, '', 'puis jusqu\'à « Tous les programmes »');
      await cleanUp();
    });

    it('Échap efface d\'abord la recherche, puis ferme la liste', async function () {
      await loadState();
      const input = typeIn('filter-programme', 'programme b');
      fireKey(input, 'Escape');
      assertEqual(input.value, '', 'la recherche est effacée (rien de coché : le résumé est vide)');
      assertFalse(listOf('filter-programme').hidden, 'la liste reste ouverte');
      assertDeepEqual(values('filter-programme'), ['', 'Programme A', 'Programme B'], 'toute la liste est revenue');
      fireKey(input, 'Escape');
      assertTrue(listOf('filter-programme').hidden, 'un second Échap ferme la liste');
      assertEqual(input.getAttribute('aria-expanded'), 'false');
      fire(input, 'click');
      assertFalse(listOf('filter-programme').hidden, 'un clic dans le champ la rouvre');
      assertEqual(input.getAttribute('aria-expanded'), 'true');
      await cleanUp();
    });
  });

  describe('Kanban Projets — filtres : instances par date, filtre actif visible, Réinitialiser, recherche par titre', function () {
    it('les instances qui suivent les épinglées vont de la plus récente à la plus ancienne, les séances sans date à la fin', async function () {
      await loadState([...CTO_SEANCES,
        { id: 4, Nom: 'CTO FARE#4 - plus tard', date: gristDay(40) },
        { id: 5, Nom: 'CTO Innovation#8 - avant', date: gristDay(-50) },
        { id: 6, Nom: 'CTO Innovation#9 - encore avant', date: gristDay(-60) },
        { id: 7, Nom: 'Comité innovation#2 - sans date' }
      ], { FINANCX: 4, NOTIFY: 5, SIGNEX: 6, COURSIX: 7, INNOVX: 1 });
      fire(document.getElementById('filter-instance'), 'focus');
      assertDeepEqual(values('filter-instance'), ['', NEXT, LAST, 'CTO FARE#4 - plus tard', 'CTO Innovation#8 - avant', 'CTO Innovation#9 - encore avant', 'Comité innovation#2 - sans date', 'Comité innovation#3 - 2026-03-15'],
        'épinglés, puis du plus récent au plus ancien, puis les sans date par ordre alphabétique (« #8 » avant « #9 », jamais « #10 » avant « #5 »)');
      await cleanUp();
    });

    it('un filtre coché surligne son champ et la liste complète se lit au survol ; décoché, plus rien', async function () {
      await loadState();
      const input = document.getElementById('filter-programme');
      assertFalse(input.classList.contains('is-active'), 'sans filtre : champ normal');
      fire(input, 'focus');
      fireMouse(listOf('filter-programme').querySelector('[data-value="Programme B"]'), 'mousedown');
      assertTrue(input.classList.contains('is-active'), 'un programme coché : champ surligné');
      assertEqual(input.title, 'Programme B');
      fireMouse(listOf('filter-programme').querySelector('[data-value="Programme A"]'), 'mousedown');
      assertEqual(input.value, '2 programmes sélectionnés');
      assertEqual(input.title, 'Programme B, Programme A', 'le résumé « 2 programmes » est détaillé au survol');
      fireMouse(listOf('filter-programme').querySelector('[data-value=""]'), 'mousedown');
      assertFalse(input.classList.contains('is-active'));
      assertEqual(input.title, '');
      await cleanUp();
    });

    it('la recherche saisie surligne aussi son champ', async function () {
      await loadState();
      const search = document.getElementById('filter-search');
      search.value = 'innov'; fire(search, 'input');
      assertTrue(search.classList.contains('is-active'));
      search.value = ''; fire(search, 'input');
      assertFalse(search.classList.contains('is-active'));
      await cleanUp();
    });

    it('Réinitialiser (icône) n\'apparaît que lorsqu\'un filtre est actif, et disparaît après usage', async function () {
      await loadState();
      const reset = document.getElementById('clear-filters');
      assertTrue(reset.hidden, 'aucun filtre : pas de bouton');
      assertEqual(reset.getAttribute('aria-label'), 'Réinitialiser les filtres', 'icône sans texte : le nom accessible reste dit');
      const input = document.getElementById('filter-programme');
      fire(input, 'focus');
      fireMouse(listOf('filter-programme').querySelector('[data-value="Programme B"]'), 'mousedown');
      assertFalse(reset.hidden, 'un programme coché : le bouton apparaît');
      reset.click();
      assertTrue(reset.hidden, 'après Réinitialiser : le bouton disparaît');
      assertEqual(shown().length, 6, 'tous les projets classés reviennent');
      const search = document.getElementById('filter-search');
      search.value = 'zzz'; fire(search, 'input');
      assertFalse(reset.hidden, 'une recherche saisie compte aussi comme filtre');
      reset.click();
      assertEqual(search.value, '');
      assertTrue(reset.hidden);
      await cleanUp();
    });

    it('une colonne vide à cause d\'un filtre le dit : « Aucun projet pour ces filtres »', async function () {
      await loadState();
      const search = document.getElementById('filter-search');
      search.value = 'innovx'; fire(search, 'input');
      const empties = Array.from(document.querySelectorAll('#projects-kanban .kanban-empty')).map(el => el.textContent);
      assertEqual(empties.length, 4, 'les quatre autres colonnes sont vides');
      empties.forEach(textValue => assertEqual(textValue, 'Aucun projet pour ces filtres'));
      await cleanUp();
    });

    it('la recherche porte sur l\'acronyme ET sur le titre du projet', async function () {
      await loadState();
      const search = document.getElementById('filter-search');
      assertEqual(search.placeholder, 'Acronyme, titre…');
      search.value = 'projet notif'; fire(search, 'input'); // titre « Projet Notif » (acronyme NOTIFY)
      assertDeepEqual(shown(), ['NOTIFY'], 'retrouvé par son titre');
      search.value = 'convent'; fire(search, 'input'); // acronyme CONVENTIX
      assertTrue(shown().includes('CONVENTIX'), 'toujours retrouvé par son acronyme');
      await cleanUp();
    });
  });

  describe('Kanban Projets — filtre Instance : prochain et dernier CTO toujours en tête', function () {
    it('le prochain puis le dernier CTO ouvrent la liste, avec leur pastille, même sans projet rattaché ; le reste suit', async function () {
      await loadState([...CTO_SEANCES, { id: 4, Nom: 'CTO Innovation#9 - ancien', date: gristDay(-60) }], { FINANCX: 4 });
      fire(document.getElementById('filter-instance'), 'focus');
      assertDeepEqual(values('filter-instance'), ['', NEXT, LAST, 'CTO Innovation#9 - ancien', 'Comité innovation#3 - 2026-03-15'], 'les deux CTO épinglés, puis le reste : les séances datées d\'abord, la séance sans date à la fin');
      const tags = Array.from(listOf('filter-instance').querySelectorAll('.is-pinned .combo-tag')).map(el => el.textContent);
      assertDeepEqual(tags, ['Prochain CTO', 'Dernier CTO']);
      assertEqual(listOf('filter-instance').querySelectorAll('.is-pinned').length, 2, 'seuls deux CTO sont épinglés');
      await cleanUp();
    });

    it('ni un comité d\'un autre type, ni un CTO plus lointain que le prochain ne prennent la place', async function () {
      await loadState([...CTO_SEANCES,
        { id: 4, Nom: 'Comité innovation#7 - très proche', date: gristDay(2) },
        { id: 5, Nom: 'CTO FARE#4 - plus tard', date: gristDay(40) },
        { id: 6, Nom: 'CTO Innovation#8 - avant le dernier', date: gristDay(-50) }
      ]);
      fire(document.getElementById('filter-instance'), 'focus');
      const pinned = Array.from(listOf('filter-instance').querySelectorAll('.is-pinned')).map(b => b.dataset.value);
      assertDeepEqual(pinned, [NEXT, LAST], 'le prochain CTO et le dernier CTO, rien d\'autre');
      await cleanUp();
    });

    it('un CTO FARE compte comme un CTO Innovation', async function () {
      await loadState([{ id: 2, Nom: 'CTO FARE#2 - dernier FARE', date: gristDay(-5) }, { id: 3, Nom: 'CTO FARE#3 - prochain FARE', date: gristDay(9) }]);
      fire(document.getElementById('filter-instance'), 'focus');
      assertDeepEqual(values('filter-instance').slice(1, 3), ['CTO FARE#3 - prochain FARE', 'CTO FARE#2 - dernier FARE']);
      await cleanUp();
    });

    it('un CTO daté d\'aujourd\'hui est le prochain (aujourd\'hui compris), celui d\'hier le dernier', async function () {
      await loadState([{ id: 2, Nom: 'CTO Innovation#1 - hier', date: gristDay(-1) }, { id: 3, Nom: 'CTO Innovation#2 - aujourd\'hui', date: gristDay(0) }]);
      fire(document.getElementById('filter-instance'), 'focus');
      assertDeepEqual(values('filter-instance').slice(1, 3), ['CTO Innovation#2 - aujourd\'hui', 'CTO Innovation#1 - hier']);
      await cleanUp();
    });

    it('un CTO déjà rattaché à des projets n\'apparaît qu\'une fois, et cocher la valeur épinglée filtre ses projets', async function () {
      await loadState(CTO_SEANCES, { COURSIX: 3 });
      const input = document.getElementById('filter-instance');
      fire(input, 'focus');
      assertEqual(values('filter-instance').filter(v => v === NEXT).length, 1, 'pas de doublon entre épinglé et reste de la liste');
      fireMouse(listOf('filter-instance').querySelector(`[data-value="${NEXT}"]`), 'mousedown');
      assertDeepEqual(shown(), ['COURSIX'], 'seuls les projets rattachés au prochain CTO restent');
      assertEqual(input.value, NEXT, 'le résumé du champ est le libellé de la séance');
      const afterCheck = values('filter-instance');
      assertEqual(afterCheck[1], NEXT, 'coché, le prochain CTO reste en tête (juste après « Toutes les instances »)');
      assertEqual(afterCheck[2], LAST, 'suivi du dernier CTO');
      assertTrue(listOf('filter-instance').querySelector(`[data-value="${NEXT}"]`).classList.contains('is-selected'));
      await cleanUp();
    });

    it('sans aucune séance CTO datée, rien n\'est épinglé et la liste reste celle des instances rattachées', async function () {
      await loadState([{ id: 2, Nom: 'CTO Innovation#1 - sans date' }]);
      fire(document.getElementById('filter-instance'), 'focus');
      assertEqual(listOf('filter-instance').querySelectorAll('.is-pinned').length, 0);
      assertDeepEqual(values('filter-instance'), ['', 'Comité innovation#3 - 2026-03-15']);
      await cleanUp();
    });

    it('le filtre Programme n\'épingle rien', async function () {
      await loadState(CTO_SEANCES);
      fire(document.getElementById('filter-programme'), 'focus');
      assertEqual(listOf('filter-programme').querySelectorAll('.is-pinned').length, 0);
      await cleanUp();
    });

    it('la recherche s\'applique aussi aux valeurs épinglées (par libellé ou par pastille), qui restent en tête des résultats', async function () {
      await loadState([...CTO_SEANCES, { id: 4, Nom: 'CTO Innovation#9 - ancien', date: gristDay(-60) }], { FINANCX: 4 });
      typeIn('filter-instance', 'cto');
      assertDeepEqual(values('filter-instance'), [NEXT, LAST, 'CTO Innovation#9 - ancien'], 'les deux CTO épinglés d\'abord, puis les autres résultats (« Comité » ne contient pas « cto »)');
      typeIn('filter-instance', 'prochain');
      assertDeepEqual(values('filter-instance'), [NEXT], '« prochain » retrouve le prochain CTO (pastille ou libellé)');
      typeIn('filter-instance', 'dernier cto');
      assertDeepEqual(values('filter-instance'), [LAST]);
      await cleanUp();
    });

    it('un libellé de séance contenant une virgule s\'épingle, se coche et se retient comme les autres', async function () {
      const comma = 'CTO Innovation#12, séance extra';
      await loadState([{ id: 2, Nom: comma, date: gristDay(3) }], { NOTIFY: 2 });
      const input = document.getElementById('filter-instance');
      fire(input, 'focus');
      fireMouse(listOf('filter-instance').querySelector(`[data-value="${comma}"]`), 'mousedown');
      assertDeepEqual(shown(), ['NOTIFY']);
      assertEqual(input.value, comma, 'le libellé entier, pas « CTO Innovation#12 »');
      assertEqual(window.CoreUtils.decodeList(input.dataset.selectedValues)[0], comma, 'relu tel quel par decodeList');
      await cleanUp();
    });
  });
}());
