/**
 * Non-regression suite : filtres de la page Installation des fonds (js/pages/page-installation.js) — Programme et
 * Instance en multi-sélection (livrés avec la page le 03/11/2026), recherche par acronyme, bouton Réinitialiser,
 * filtres retenus par utilisateur — plus les chemins d'erreur d'écriture et l'ouverture du projet.
 *
 * Fixtures (tests/fixtures.js) : Programme A = INNOVX, CONVENTIX, FINANCX, INCONNUX, SIGNEX ; Programme B = NOTIFY,
 * COURSIX. L'instance « Comité innovation#3 - 2026-03-15 » (Suivi_Instance#1) est rattachée à INNOVX, CONVENTIX et
 * COURSIX. Lieux (bascule DIESE / AUTRE) : NOTIFY « diese », tous les autres « autre » (INNOVX chez LAB1, les
 * autres sans ligne OPE). Jalons (Statut_installation_fonds repris) : INNOVX au 2e, NOTIFY au 3e, les autres au 1er.
 *
 * Les filtres vivent dans le DOM (dataset.selectedValues des champs) et traversent les tests : chaque test repart de
 * filtres vides (clearFilters) et les laisse vides.
 */
(function () {
  'use strict';

  const PROGRAMME = 'install-filter-programme';
  const INSTANCE = 'install-filter-instance';
  const INSTANCE_LABEL = 'Comité innovation#3 - 2026-03-15';

  async function loadFixtureState() {
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    clearFilters();
    window.renderInstallation();
  }
  // Sans passer par le bouton Réinitialiser (il enregistre) : remet les trois filtres à vide.
  function clearFilters() {
    [PROGRAMME, INSTANCE].forEach(id => { const input = document.getElementById(id); input.dataset.selectedValues = ''; input.value = ''; });
    document.getElementById('install-filter-search').value = '';
  }
  const project = id => window.CoreState.getTable('Projets').find(p => p.id === id);
  const shown = () => Array.from(document.querySelectorAll('#install-zones .install-acronym')).map(el => el.textContent).sort();
  // Compteur de la bascule DIESE / AUTRE : projets du lieu parmi ceux que les autres filtres laissent passer.
  const count = lieu => document.querySelector(`[data-install-lieu="${lieu}"] .install-lieu-count`).textContent;
  const listOf = id => document.getElementById(`${id}-list`);
  const optionLabels = id => Array.from(listOf(id).querySelectorAll('[data-value]')).map(btn => btn.textContent);
  const optionButton = (id, label) => Array.from(listOf(id).querySelectorAll('[data-value]')).find(btn => btn.textContent === label);
  // Ouvre la liste (focus) puis clique une option, comme un utilisateur : l'option réagit à mousedown.
  function pick(id, label) {
    fire(document.getElementById(id), 'focus');
    fireMouse(optionButton(id, label), 'mousedown');
  }
  const typeSearch = value => { const input = document.getElementById('install-filter-search'); input.value = value; fire(input, 'input'); };
  const msBody = (zone, idx) => document.querySelector(`[data-drop-ms="${zone}:${idx}"]`);
  const cardByAcronym = (container, acronym) => container && Array.from(container.querySelectorAll('.install-card'))
    .find(card => card.querySelector('.install-acronym')?.textContent === acronym);

  const prefsUpdates = () => window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && c.table === 'Preferences_Widget');
  async function loadPrefs() {
    await window.loadKanbanUserPreferences(); // crée la table et la ligne, comme au vrai démarrage (js/app.js)
    await window.loadInstallationUserPreferences();
  }
  const withHiddenDocument = fn => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    try { return fn(); } finally { delete document.hidden; }
  };

  describe('Installation des fonds — filtres Programme / Instance en multi-sélection', function () {
    it('la liste propose « Tous… » puis les valeurs présentes dans les projets, triées, sans doublon ni valeur vide', async function () {
      await loadFixtureState();
      fire(document.getElementById(PROGRAMME), 'focus');
      assertFalse(listOf(PROGRAMME).hidden, 'la liste s\'ouvre au focus');
      assertDeepEqual(optionLabels(PROGRAMME), ['Tous les programmes', 'Programme A', 'Programme B']);
      fire(document.getElementById(INSTANCE), 'focus');
      assertDeepEqual(optionLabels(INSTANCE), ['Toutes les instances', INSTANCE_LABEL], 'les projets sans instance ne créent pas d\'option vide');
    });

    it('choisir un programme ne laisse que ses projets, dans les deux lieux, et le champ le dit', async function () {
      await loadFixtureState();
      assertDeepEqual(shown().length, 7, 'sans filtre : les 7 projets');
      pick(PROGRAMME, 'Programme B');
      assertDeepEqual(shown(), ['COURSIX', 'NOTIFY']);
      assertEqual(count('diese'), '1', 'NOTIFY');
      assertEqual(count('autre'), '1', 'COURSIX seul : INNOVX est du programme A');
      assertEqual(document.getElementById(PROGRAMME).value, 'Programme B', 'un seul choix : son nom');
      const option = optionButton(PROGRAMME, 'Programme B');
      assertTrue(option.classList.contains('is-selected'));
      assertEqual(option.getAttribute('aria-selected'), 'true');
      assertEqual(optionButton(PROGRAMME, 'Programme A').getAttribute('aria-selected'), 'false');
    });

    it('plusieurs choix s\'additionnent (« 2 programmes sélectionnés »), les choisis remontent en tête, un second clic retire le choix', async function () {
      await loadFixtureState();
      pick(PROGRAMME, 'Programme B');
      pick(PROGRAMME, 'Programme A');
      assertEqual(document.getElementById(PROGRAMME).value, '2 programmes sélectionnés');
      assertEqual(shown().length, 7, 'les deux programmes : tout est de nouveau visible');
      assertDeepEqual(optionLabels(PROGRAMME).slice(1), ['Programme A', 'Programme B'], 'choisis en tête, dans l\'ordre alphabétique');

      pick(PROGRAMME, 'Programme A'); // retire A
      assertEqual(document.getElementById(PROGRAMME).value, 'Programme B');
      assertDeepEqual(shown(), ['COURSIX', 'NOTIFY']);
      assertEqual(optionLabels(PROGRAMME)[1], 'Programme B', 'B reste en tête, A redescend');
    });

    it('« Tous les programmes » efface tout le choix', async function () {
      await loadFixtureState();
      pick(PROGRAMME, 'Programme A');
      pick(PROGRAMME, 'Programme B');
      pick(PROGRAMME, 'Tous les programmes');
      assertEqual(document.getElementById(PROGRAMME).value, '');
      assertEqual(document.getElementById(PROGRAMME).dataset.selectedValues, '');
      assertEqual(shown().length, 7);
    });

    it('le filtre Instance garde les projets rattachés à l\'instance choisie (libellé de la séance), seuls ceux-là', async function () {
      await loadFixtureState();
      pick(INSTANCE, INSTANCE_LABEL);
      assertDeepEqual(shown(), ['CONVENTIX', 'COURSIX', 'INNOVX']);
      assertEqual(count('autre'), '3');
      assertEqual(count('diese'), '0');
      assertEqual(document.getElementById(INSTANCE).value, INSTANCE_LABEL);
    });

    it('Programme, Instance et recherche se cumulent (ET), la recherche ignore la casse et les accents', async function () {
      await loadFixtureState();
      pick(PROGRAMME, 'Programme A');
      pick(INSTANCE, INSTANCE_LABEL);
      assertDeepEqual(shown(), ['CONVENTIX', 'INNOVX'], 'programme A ET instance : COURSIX (programme B) sort');
      typeSearch('CONV');
      assertDeepEqual(shown(), ['CONVENTIX']);
      typeSearch('  cônv ');
      assertDeepEqual(shown(), ['CONVENTIX'], 'casse, accent et espaces autour ignorés');
      typeSearch('zzz');
      assertEqual(shown().length, 0, 'aucune carte');
      assertEqual(count('autre'), '0');
      assertEqual(count('diese'), '0');
      assertTrue(!!document.querySelector('#install-zones .install-empty'), 'la page dit qu\'aucun projet ne correspond');
      assertEqual(document.querySelectorAll('#install-zones .install-ms.is-done').length, 6, 'tous les jalons visibles sont vides (coche verte)');
    });

    it('la recherche seule filtre sur l\'acronyme, pas sur le nom du projet', async function () {
      await loadFixtureState();
      typeSearch('instruction'); // « Projet Instruction » est le nom d'INNOVX, pas son acronyme
      assertEqual(shown().length, 0);
      typeSearch('innov');
      assertDeepEqual(shown(), ['INNOVX']);
    });

    it('un filtre ne change pas le jalon d\'un projet : il reste à son jalon et dans sa zone', async function () {
      await loadFixtureState();
      pick(PROGRAMME, 'Programme A');
      assertTrue(!!cardByAcronym(msBody('creation', 1), 'INNOVX'));
      pick(PROGRAMME, 'Tous les programmes');
      assertTrue(!!cardByAcronym(msBody('creation', 2), 'NOTIFY'));
    });

    it('en quittant le champ, la liste se referme et le champ redit le choix', async function () {
      await loadFixtureState();
      pick(PROGRAMME, 'Programme A');
      const input = document.getElementById(PROGRAMME);
      input.value = 'texte parasite';
      fire(input, 'blur');
      await wait(200);
      assertTrue(listOf(PROGRAMME).hidden, 'liste refermée');
      assertEqual(input.value, 'Programme A', 'le champ reprend le résumé du choix');
    });

    it('un champ en lecture seule : on ne tape pas dans les listes, on choisit', async function () {
      await loadFixtureState();
      assertTrue(document.getElementById(PROGRAMME).readOnly);
      assertTrue(document.getElementById(INSTANCE).readOnly);
    });
  });

  describe('Installation des fonds — Réinitialiser et filtres retenus par utilisateur', function () {
    it('Réinitialiser vide Programme, Instance et recherche, remet toutes les cartes et l\'enregistre', async function () {
      await loadFixtureState();
      await loadPrefs();
      pick(PROGRAMME, 'Programme A');
      pick(INSTANCE, INSTANCE_LABEL);
      typeSearch('inn');
      assertDeepEqual(shown(), ['INNOVX']);
      window.__TEST_CALLS__.length = 0;

      fireMouse(document.getElementById('install-clear-filters'), 'click');
      assertEqual(shown().length, 7, 'toutes les cartes sont revenues');
      assertEqual(document.getElementById(PROGRAMME).value, '');
      assertEqual(document.getElementById(INSTANCE).dataset.selectedValues, '');
      assertEqual(document.getElementById('install-filter-search').value, '');
      await wait(30);
      const update = prefsUpdates().slice(-1)[0];
      assertTrue(!!update, 'la remise à zéro est enregistrée');
      assertEqual(update.fields.Install_filtre_programme, '');
      assertEqual(update.fields.Install_filtre_instance, '');
      assertEqual(update.fields.Install_filtre_recherche, '');
    });

    it('chaque choix de filtre est enregistré tout de suite sur la ligne de la personne', async function () {
      await loadFixtureState();
      await loadPrefs();
      window.__TEST_CALLS__.length = 0;
      pick(PROGRAMME, 'Programme A');
      pick(PROGRAMME, 'Programme B');
      pick(INSTANCE, INSTANCE_LABEL);
      await wait(30);
      const update = prefsUpdates().slice(-1)[0];
      assertEqual(update.id, 1, 'la ligne partagée avec les autres pages');
      assertEqual(update.fields.Install_filtre_programme, 'Programme A,Programme B');
      assertEqual(update.fields.Install_filtre_instance, INSTANCE_LABEL);
      assertEqual(update.fields.Install_filtre_recherche, '');
      assertEqual(update.fields.Install_lieux, 'diese,autre', 'la bascule DIESE / AUTRE est enregistrée avec les filtres');
    });

    it('la recherche est enregistrée une seule fois, après la frappe (ou tout de suite si la page est masquée)', async function () {
      await loadFixtureState();
      await loadPrefs();
      window.__TEST_CALLS__.length = 0;
      typeSearch('c');
      typeSearch('co');
      typeSearch('con');
      assertEqual(prefsUpdates().length, 0, 'rien n\'est écrit pendant la frappe');
      withHiddenDocument(() => document.dispatchEvent(new Event('visibilitychange')));
      await wait(30);
      assertEqual(prefsUpdates().length, 1, 'une seule écriture, déclenchée par le masquage de la page');
      assertEqual(prefsUpdates()[0].fields.Install_filtre_recherche, 'con', 'avec le texte complet');
    });

    it('à la réouverture, les filtres enregistrés sont réappliqués : cartes filtrées, champs et listes à jour', async function () {
      await loadFixtureState();
      await window.loadKanbanUserPreferences();
      window.__mockSetTable('Preferences_Widget', {
        id: [1], Email_utilisateur: [''],
        Install_lieux: [''], Install_plus: [''],
        Install_filtre_programme: ['Programme A,Programme B'], Install_filtre_instance: [INSTANCE_LABEL], Install_filtre_recherche: ['con']
      });
      try { localStorage.setItem('suiviProjetInnovationS:prefsRowId', '1'); } catch (err) { /* ignore */ }
      await window.loadInstallationUserPreferences();
      window.renderInstallation();

      assertDeepEqual(shown(), ['CONVENTIX'], 'deux programmes ET instance ET recherche « con »');
      assertEqual(document.getElementById(PROGRAMME).value, '2 programmes sélectionnés');
      assertEqual(document.getElementById(INSTANCE).value, INSTANCE_LABEL);
      assertEqual(document.getElementById('install-filter-search').value, 'con');
      fire(document.getElementById(PROGRAMME), 'focus');
      assertEqual(optionButton(PROGRAMME, 'Programme A').getAttribute('aria-selected'), 'true');
      assertEqual(optionButton(PROGRAMME, 'Programme B').getAttribute('aria-selected'), 'true');
    });

    it('une ligne de préférences sans aucune préférence enregistrée ne touche à aucun filtre', async function () {
      await loadFixtureState();
      await loadPrefs();
      window.renderInstallation();
      assertEqual(shown().length, 7);
      assertEqual(document.getElementById(PROGRAMME).dataset.selectedValues || '', '');
    });
  });

  describe('Installation des fonds — ouverture du projet et échecs d\'écriture', function () {
    it('un clic sur l\'acronyme ouvre la modale du projet', async function () {
      await loadFixtureState();
      const opened = [];
      const original = window.ProjectModal.open;
      window.ProjectModal.open = arg => { opened.push(arg); };
      try {
        fireMouse(cardByAcronym(msBody('creation', 1), 'INNOVX').querySelector('[data-open-project]'), 'click');
      } finally { window.ProjectModal.open = original; }
      assertEqual(opened.length, 1);
      assertEqual(opened[0].id, 10);
    });

    it('un commentaire laissé tel quel n\'écrit rien au blur', async function () {
      await loadFixtureState();
      const textarea = cardByAcronym(msBody('creation', 1), 'INNOVX').querySelector('[data-install-comment]');
      fire(textarea, 'blur');
      await wait(0);
      assertEqual(window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord').length, 0);
    });

    it('commentaire : si Grist refuse l\'écriture, un message d\'erreur s\'affiche et le projet garde son ancien commentaire', async function () {
      await loadFixtureState();
      const textarea = cardByAcronym(msBody('creation', 1), 'INNOVX').querySelector('[data-install-comment]');
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async () => { throw new Error('droits insuffisants'); };
      try {
        setValue(textarea, 'Nouveau commentaire');
        fire(textarea, 'blur');
        await wait(10);
      } finally { window.grist.docApi.applyUserActions = original; }
      const toast = document.getElementById('toast');
      assertIncludes(toast.textContent, 'Échec de l\'enregistrement du commentaire');
      assertIncludes(toast.textContent, 'droits insuffisants');
      assertTrue(toast.classList.contains('error'), 'toast d\'erreur');
      assertEqual(project(10).Commentaire_ligne_OPE, '', 'le projet n\'est pas modifié en mémoire');
    });

    it('glisser-déposer : si Grist refuse l\'écriture, un message d\'erreur s\'affiche et la carte reste à son jalon', async function () {
      await loadFixtureState();
      const card = cardByAcronym(msBody('creation', 1), 'INNOVX');
      const handle = card.querySelector('[data-drag-project]');
      const target = msBody('creation', 2);
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async () => { throw new Error('réseau coupé'); };
      try {
        const dt = new DataTransfer();
        handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
        target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
        target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        handle.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
        await wait(10);
      } finally { window.grist.docApi.applyUserActions = original; }
      assertIncludes(document.getElementById('toast').textContent, 'Échec de l\'écriture');
      assertEqual(project(10).Jalon_installation_fonds || '', '', 'jalon inchangé en mémoire');
      assertTrue(!!cardByAcronym(msBody('creation', 1), 'INNOVX'), 'la carte est toujours à son jalon');
    });
  });
})();
