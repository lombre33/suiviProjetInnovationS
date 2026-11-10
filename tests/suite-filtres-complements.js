/**
 * Non-regression suite : filtres Programme / Instance en multi-sélection des trois pages qui en ont (Kanban Projets,
 * Administratif, Installation des fonds) — un libellé qui contient une virgule (« Programme B, volet 2 ») doit se
 * filtrer, se retenir et se restaurer comme les autres ; les anciennes préférences (liste « A,B » sans guillemets)
 * restent lues ; désélectionner, résumé du champ, restauration de l'instance et de la recherche.
 *
 * Fixtures (tests/fixtures.js) : Programme A = INNOVX, CONVENTIX, FINANCX, INCONNUX, SIGNEX ; Programme B = NOTIFY, COURSIX.
 * La fiche Programmes #2 est renommée « Programme B, volet 2 » dans l'état de la page, le temps du test.
 */
(function () {
  'use strict';

  const COMMA_LABEL = 'Programme B, volet 2';
  const INSTANCE_LABEL = 'Comité innovation#3 - 2026-03-15';

  // Chaque page : de quoi la rendre, lire ses cartes, piloter ses champs et ses préférences.
  const PAGES = [
    {
      name: 'Kanban Projets', programme: 'filter-programme', instance: 'filter-instance', search: 'filter-search', clear: 'clear-filters',
      render: () => window.renderProjectsKanban(), load: () => window.loadKanbanUserPreferences(),
      shown: () => Array.from(document.querySelectorAll('#projects-kanban .project-acronym')).map(el => el.textContent),
      cols: { programme: 'Filtre_programme', instance: 'Filtre_instance', search: 'Filtre_recherche' }, kanbanFirst: false
    },
    {
      name: 'Administratif', programme: 'admin-filter-programme', instance: 'admin-filter-instance', search: 'admin-filter-search', clear: 'admin-clear-filters',
      render: () => window.renderAdministratif(), load: () => window.loadAdministratifUserPreferences(),
      shown: () => Array.from(document.querySelectorAll('#admin-col-notif .project-acronym')).map(el => el.textContent),
      cols: { programme: 'Admin_filtre_programme', instance: 'Admin_filtre_instance', search: 'Admin_filtre_recherche' }, kanbanFirst: true
    },
    {
      name: 'Installation des fonds', programme: 'install-filter-programme', instance: 'install-filter-instance', search: 'install-filter-search', clear: 'install-clear-filters',
      render: () => window.renderInstallation(), load: () => window.loadInstallationUserPreferences(),
      shown: () => Array.from(document.querySelectorAll('#install-panels-wrap .install-acronym')).map(el => el.textContent),
      cols: { programme: 'Install_filtre_programme', instance: 'Install_filtre_instance', search: 'Install_filtre_recherche' }, kanbanFirst: true
    }
  ];

  async function loadState(page, opts) {
    const tables = await window.CoreGrist.loadAllTables();
    if (opts && opts.comma) tables.Programmes.find(p => p.id === 2).Programme = COMMA_LABEL;
    if (opts && opts.secondInstance) {
      tables.Suivi_Instance.push({ id: 2, Nom: 'Comité innovation#4, séance extra' });
      tables.Projets.find(p => p.Acronyme === 'NOTIFY').Instance_ratachee = 2;
    }
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    [page.programme, page.instance].forEach(id => { const input = document.getElementById(id); input.dataset.selectedValues = ''; input.value = ''; });
    document.getElementById(page.search).value = '';
    page.render();
  }
  function pick(id, label) {
    fire(document.getElementById(id), 'focus');
    const button = Array.from(document.getElementById(`${id}-list`).querySelectorAll('[data-value]')).find(b => b.dataset.value === label);
    assertTrue(!!button, `option « ${label} » introuvable dans ${id}`);
    fireMouse(button, 'mousedown');
  }
  async function prefsRow() { return (await window.CoreGrist.getTable('Preferences_Widget'))[0]; }
  // Comme au vrai démarrage : le Kanban crée la ligne de préférences, les autres pages la retrouvent.
  async function loadPrefs(page) {
    await window.loadKanbanUserPreferences();
    if (page.kanbanFirst) await page.load();
  }
  async function reopen(page) { await page.load(); page.render(); }

  PAGES.forEach(page => {
    describe(`${page.name} — filtres multi-sélection : libellés avec virgule, restauration, désélection`, function () {
      it('un programme dont le nom contient une virgule se filtre : ses projets restent, les autres sortent, le champ garde le nom entier', async function () {
        await loadState(page, { comma: true });
        pick(page.programme, COMMA_LABEL);
        const shown = page.shown();
        assertTrue(shown.includes('NOTIFY'), 'NOTIFY (« ' + COMMA_LABEL + ' ») reste visible');
        assertFalse(shown.includes('INNOVX'), 'INNOVX (programme A) sort');
        assertEqual(document.getElementById(page.programme).value, COMMA_LABEL, 'le nom entier, pas « Programme B »');
        const option = Array.from(document.getElementById(`${page.programme}-list`).querySelectorAll('[data-value]')).find(b => b.dataset.value === COMMA_LABEL);
        assertTrue(option.classList.contains('is-selected'), 'l\'option est marquée choisie');
        document.getElementById(page.clear).click();
      });

      it('on peut cumuler ce programme et un autre, puis retirer l\'un des deux (le résumé compte deux choix, pas trois)', async function () {
        await loadState(page, { comma: true });
        pick(page.programme, 'Programme A');
        pick(page.programme, COMMA_LABEL);
        assertEqual(document.getElementById(page.programme).value, '2 programmes sélectionnés');
        assertTrue(page.shown().includes('INNOVX') && page.shown().includes('NOTIFY'), 'les deux programmes');
        pick(page.programme, COMMA_LABEL); // retire le programme à virgule
        assertEqual(document.getElementById(page.programme).value, 'Programme A');
        assertFalse(page.shown().includes('NOTIFY'));
        document.getElementById(page.clear).click();
      });

      it('retenu puis restauré tel quel après rechargement, nom à virgule compris', async function () {
        await loadState(page, { comma: true });
        await loadPrefs(page);
        pick(page.programme, COMMA_LABEL);
        pick(page.programme, 'Programme A');
        await wait(30);
        await reopen(page);
        assertEqual(document.getElementById(page.programme).value, '2 programmes sélectionnés', 'deux choix restaurés');
        assertTrue(page.shown().includes('NOTIFY') && page.shown().includes('INNOVX'), 'les deux programmes sont toujours filtrés');
        pick(page.programme, 'Programme A');
        assertEqual(document.getElementById(page.programme).value, COMMA_LABEL, 'il ne reste que le programme à virgule');
        document.getElementById(page.clear).click();
      });

      it('sans virgule dans les noms, la préférence reste une simple liste « A,B » (lisible dans Grist)', async function () {
        await loadState(page);
        await loadPrefs(page);
        pick(page.programme, 'Programme A');
        pick(page.programme, 'Programme B');
        await wait(30);
        assertEqual((await prefsRow())[page.cols.programme], 'Programme A,Programme B');
        document.getElementById(page.clear).click();
      });

      it('les préférences déjà enregistrées (liste « A,B » sans guillemets) sont toujours lues', async function () {
        await loadState(page);
        await window.loadKanbanUserPreferences();
        const row = await prefsRow();
        await window.grist.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', row.id, { [page.cols.programme]: 'Programme A,Programme B' }]]);
        if (page.kanbanFirst) await page.load();
        else await window.loadKanbanUserPreferences();
        page.render();
        assertEqual(document.getElementById(page.programme).value, '2 programmes sélectionnés');
        document.getElementById(page.clear).click();
      });

      it('l\'instance et la recherche enregistrées sont restaurées (champ, cartes filtrées)', async function () {
        await loadState(page, { secondInstance: true });
        await loadPrefs(page);
        const row = await prefsRow();
        await window.grist.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', row.id, { [page.cols.instance]: INSTANCE_LABEL, [page.cols.search]: 'inn' }]]);
        await reopen(page);
        assertEqual(document.getElementById(page.instance).value, INSTANCE_LABEL, 'instance restaurée');
        assertEqual(document.getElementById(page.search).value, 'inn', 'recherche restaurée');
        assertDeepEqual(page.shown(), ['INNOVX'], 'INNOVX : bonne instance ET « inn »');
        document.getElementById(page.clear).click();
      });

      it('une instance dont le nom contient une virgule se filtre aussi', async function () {
        await loadState(page, { secondInstance: true });
        pick(page.instance, 'Comité innovation#4, séance extra');
        assertDeepEqual(page.shown(), ['NOTIFY'], 'seul NOTIFY est rattaché à cette instance');
        assertEqual(document.getElementById(page.instance).value, 'Comité innovation#4, séance extra');
        document.getElementById(page.clear).click();
      });
    });
  });
})();
