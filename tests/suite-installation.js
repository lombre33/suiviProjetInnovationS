/**
 * Non-regression suite: page Installation des fonds (js/pages/page-installation.js).
 * Fixtures (tests/fixtures.js) : INNOVX -> Lignes_OPE#1 (installée chez LAB1) => colonne
 * "ailleurs" ; NOTIFY -> Lignes_OPE#3 (installée chez DIESE) => colonne "diese" ;
 * CONVENTIX/FINANCX/COURSIX/INCONNUX/SIGNEX n'ont aucune ligne OPE => colonne "non_classe"
 * (3e zone, décision d'Antoine du 03/11/2026 : jamais exclus de la page).
 */
(function () {
  'use strict';

  async function loadFixtureState() {
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    window.renderInstallation();
  }

  function panelIn(colId, label) {
    return Array.from(document.querySelectorAll(`#${colId} .install-panel`))
      .find(section => section.querySelector('.install-panel-header h4')?.textContent === label);
  }

  function cardByAcronym(panel, acronym) {
    return panel && Array.from(panel.querySelectorAll('.install-card'))
      .find(card => card.querySelector('.install-acronym')?.textContent === acronym);
  }

  // Doit rester le premier describe/it du fichier : c'est le tout premier rendu
  // de la page Installation dans la suite, celui qui fixe le repli initial de
  // chaque volet (l'état persiste ensuite entre les tests, cf. page-installation.js).
  describe('Installation des fonds — un volet vide démarre replié', function () {
    it('un volet sans aucun projet est replié dès le premier rendu ; un volet non vide reste déplié', async function () {
      await loadFixtureState();
      const emptyPanel = panelIn('install-col-diese', 'En attente ouverture'); // aucun projet DIESE n'est à cette étape
      assertTrue(!!emptyPanel, 'le volet "En attente ouverture" doit exister côté DIESE');
      assertTrue(emptyPanel.classList.contains('is-collapsed'), 'un volet vide doit démarrer replié');
      const filledPanel = panelIn('install-col-non_classe', 'En attente ouverture');
      assertFalse(filledPanel.classList.contains('is-collapsed'), 'un volet avec des projets ne doit pas démarrer replié');
    });
  });

  describe('Installation des fonds — classement par colonne (DIESE / ailleurs / sans ligne OPE)', function () {
    it('place chaque projet dans la colonne correspondant à Lignes_OPE.installe_chez', async function () {
      await loadFixtureState();
      assertTrue(!!cardByAcronym(panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'INNOVX'),
        'INNOVX (ligne OPE installée chez LAB1) doit être dans la colonne "ailleurs"');
      assertTrue(!!cardByAcronym(panelIn('install-col-diese', 'Installé'), 'NOTIFY'),
        'NOTIFY (ligne OPE installée chez DIESE) doit être dans la colonne "diese"');
    });

    it('un projet sans ligne OPE apparaît dans la 3e colonne (jamais exclu), à la 1re étape par défaut', async function () {
      await loadFixtureState();
      ['CONVENTIX', 'FINANCX', 'COURSIX', 'INCONNUX', 'SIGNEX'].forEach(acr => {
        assertTrue(!!cardByAcronym(panelIn('install-col-non_classe', 'En attente ouverture'), acr),
          `${acr} (sans ligne OPE, Statut_installation_fonds vide) doit être dans "Sans ligne OPE" / "En attente ouverture"`);
      });
    });

    it('expose InstallationLogic.sideForProject/stageIndex/STAGES pour les autres pages (ex. To Do)', async function () {
      await loadFixtureState();
      const projects = window.CoreState.getTable('Projets');
      const innovx = projects.find(p => p.Acronyme === 'INNOVX');
      const notify = projects.find(p => p.Acronyme === 'NOTIFY');
      assertEqual(window.InstallationLogic.sideForProject(innovx), 'ailleurs');
      assertEqual(window.InstallationLogic.sideForProject(notify), 'diese');
      assertEqual(window.InstallationLogic.stageIndex(innovx), 1);
      assertDeepEqual(window.InstallationLogic.STAGES, [
        '1) En attente ouverture', '2) Ouverture demandée à la DF', '3) Installé', '4) Reliquat à traiter', '5) Clôturer'
      ]);
    });
  });

  describe('Installation des fonds — contenu de la carte (action OPE, ligne OPE/structure, commentaire, montant, budget par masse)', function () {
    it('affiche la pastille ligne OPE/structure, et signale par une alerte une action "à determiner"', async function () {
      await loadFixtureState();
      const innovxCard = cardByAcronym(panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'INNOVX');
      assertEqual(innovxCard.querySelector('.install-chip-ope').textContent, 'OPE n°OPE-2026-001 — chez LAB1');

      const notifyCard = cardByAcronym(panelIn('install-col-diese', 'Installé'), 'NOTIFY');
      const notifyAction = notifyCard.querySelector('.install-chip-action');
      assertEqual(notifyAction.textContent, 'À déterminer');
      assertTrue(notifyAction.classList.contains('is-warn'), 'action "à determiner" doit être signalée (is-warn)');
      assertEqual(notifyCard.querySelector('.install-chip-ope').textContent, 'OPE n°OPE-2026-003 — chez DIESE');
    });

    it('sans action renseignée, aucune pastille action (même avec une ligne OPE, cf. INNOVX)', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'INNOVX');
      assertFalse(!!card.querySelector('.install-chip-action'), 'Action_Ligne_OPE_a_faire vide => pas de pastille action');
    });

    it('sans ligne OPE, pastille sobre "Aucune ligne OPE" (jamais aucune pastille)', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('install-col-non_classe', 'En attente ouverture'), 'CONVENTIX');
      assertFalse(!!card.querySelector('.install-chip-action'), 'Action_Ligne_OPE_a_faire vide => pas de pastille action');
      const opeChip = card.querySelector('.install-chip-ope');
      assertEqual(opeChip.textContent, 'Aucune ligne OPE');
      assertTrue(opeChip.classList.contains('is-muted'));
    });

    it('affiche le montant total et le rappel budget par grande masse (Fonctionnement/Investissement/Personnel)', async function () {
      await loadFixtureState();
      const innovxCard = cardByAcronym(panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'INNOVX');
      assertEqual(innovxCard.querySelector('.install-amount-value').textContent, '1 000 €');
      assertDeepEqual(Array.from(innovxCard.querySelectorAll('.install-budget-value')).map(el => el.textContent), ['700 €', '200 €', '100 €']);

      const notifyCard = cardByAcronym(panelIn('install-col-diese', 'Installé'), 'NOTIFY');
      assertEqual(notifyCard.querySelector('.install-amount-value').textContent, '5 000 €');
      assertDeepEqual(Array.from(notifyCard.querySelectorAll('.install-budget-value')).map(el => el.textContent), ['3 000 €', '1 500 €', '500 €']);
    });

    it('enregistre le commentaire OPE/installation sur Commentaire_ligne_OPE (Projets) au blur', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'INNOVX');
      const textarea = card.querySelector('[data-install-comment]');
      setValue(textarea, 'Relance DF le 10/11.');
      fire(textarea, 'blur');
      await wait(0);
      const call = window.__TEST_CALLS__.find(c => c.type === 'UpdateRecord' && c.table === 'Projets' && 'Commentaire_ligne_OPE' in c.fields);
      assertTrue(!!call, 'doit écrire Commentaire_ligne_OPE sur Projets');
      assertEqual(call.fields.Commentaire_ligne_OPE, 'Relance DF le 10/11.');
    });
  });

  describe('Installation des fonds — sélecteur de vue (Toutes / DIESE / Ailleurs / Sans OPE)', function () {
    it('"Toutes" affiche les 3 colonnes côte à côte ; sélectionner une colonne masque les deux autres et l\'élargit', async function () {
      await loadFixtureState();
      const wrap = document.getElementById('install-panels-wrap');
      assertFalse(wrap.classList.contains('is-single'), '"Toutes" (par défaut) affiche les colonnes côte à côte');
      ['diese', 'ailleurs', 'non_classe'].forEach(key =>
        assertFalse(document.querySelector(`[data-install-column="${key}"]`).classList.contains('is-hidden')));

      fireMouse(document.querySelector('[data-install-tab="diese"]'), 'click');

      assertTrue(wrap.classList.contains('is-single'), 'une colonne seule doit passer en affichage "is-single"');
      assertFalse(document.querySelector('[data-install-column="diese"]').classList.contains('is-hidden'));
      assertTrue(document.querySelector('[data-install-column="ailleurs"]').classList.contains('is-hidden'));
      assertTrue(document.querySelector('[data-install-column="non_classe"]').classList.contains('is-hidden'));
      assertTrue(document.querySelector('[data-install-tab="diese"]').classList.contains('is-active'));
      assertFalse(document.querySelector('[data-install-tab="all"]').classList.contains('is-active'));

      fireMouse(document.querySelector('[data-install-tab="all"]'), 'click'); // reset pour les autres tests
    });
  });

  function dragEvent(type, dataTransfer) {
    return new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer });
  }
  // Simule un glisser-déposer complet : poignée de la carte → volet cible.
  async function dragCardTo(card, panel) {
    const handle = card.querySelector('[data-drag-project]');
    const dt = new DataTransfer();
    handle.dispatchEvent(dragEvent('dragstart', dt));
    panel.dispatchEvent(dragEvent('dragover', dt));
    panel.dispatchEvent(dragEvent('drop', dt));
    handle.dispatchEvent(dragEvent('dragend', dt));
    await wait(0);
  }
  const installWrites = () => window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && c.table === 'Projets' && 'Statut_installation_fonds' in c.fields);

  describe('Installation des fonds — glisser-déposer entre volets d\'une même colonne', function () {
    it('glisser une carte vers un autre volet de la même colonne écrit Statut_installation_fonds et déplace la carte', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'INNOVX');
      await dragCardTo(card, panelIn('install-col-ailleurs', 'Installé'));
      const writes = installWrites();
      assertEqual(writes.length, 1, 'une seule écriture');
      assertEqual(writes[0].fields.Statut_installation_fonds, '3) Installé', 'valeur Grist exacte, avec le préfixe "3) "');
      assertTrue(!!cardByAcronym(panelIn('install-col-ailleurs', 'Installé'), 'INNOVX'), 'INNOVX doit être dans le nouveau volet');
      assertFalse(!!cardByAcronym(panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'INNOVX'), 'INNOVX ne doit plus être dans l\'ancien volet');
    });

    it('un dépôt qui changerait de colonne (DIESE/ailleurs/sans ligne OPE) est ignoré : la colonne vient de Lignes_OPE, jamais d\'un choix manuel', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'INNOVX');
      // La racine de délégation (#install-panels-wrap) est partagée entre les 3
      // colonnes : on dépose explicitement sur un volet de la colonne "diese".
      await dragCardTo(card, panelIn('install-col-diese', 'Installé'));
      assertEqual(installWrites().length, 0, 'aucune écriture : le dépôt inter-colonnes doit être rejeté');
      assertTrue(!!cardByAcronym(panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'INNOVX'), 'INNOVX doit rester dans sa colonne/volet d\'origine');
    });

    it('déposer une carte sur son propre volet n\'écrit rien', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'INNOVX');
      await dragCardTo(card, panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'));
      assertEqual(installWrites().length, 0, 'aucune écriture');
      assertFalse(!!document.querySelector('#install-panels-wrap .is-dragging, #install-panels-wrap .is-drop-target'), 'aucun état de glisser résiduel');
    });

    it('un glisser étranger (sans le type MIME propre à cette page) n\'est jamais accepté', async function () {
      await loadFixtureState();
      const panel = panelIn('install-col-ailleurs', 'Installé');
      const foreign = new DataTransfer();
      foreign.setData('text/plain', '10');
      const over = dragEvent('dragover', foreign);
      panel.dispatchEvent(over);
      assertFalse(over.defaultPrevented, 'un glisser étranger ne doit pas être autorisé');
      panel.dispatchEvent(dragEvent('drop', foreign));
      await wait(0);
      assertEqual(installWrites().length, 0, 'et un dépôt étranger n\'écrit rien');
    });
  });

  describe('Installation des fonds — volets repliables et masquables (même patron qu\'Administratif)', function () {
    it('un volet replié cache ses cartes, un volet masqué disparaît et réapparaît via la puce "œil"', async function () {
      await loadFixtureState();
      const panel = panelIn('install-col-ailleurs', 'Ouverture demandée à la DF');
      panel.querySelector('[data-toggle-install-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const collapsedPanel = panelIn('install-col-ailleurs', 'Ouverture demandée à la DF');
      assertTrue(collapsedPanel.classList.contains('is-collapsed'), 'le volet doit être replié');
      collapsedPanel.querySelector('[data-toggle-install-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true })); // reset

      panelIn('install-col-ailleurs', 'Ouverture demandée à la DF').querySelector('[data-hide-install-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      assertFalse(!!panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'le volet masqué ne doit plus être dans le DOM');
      const chip = document.getElementById('install-hidden-ailleurs').querySelector('[data-restore-install-panel]');
      assertTrue(!!chip && chip.textContent.includes('Ouverture demandée à la DF'), 'une puce "Ouverture demandée à la DF" doit apparaître');
      assertTrue(!!chip.querySelector('svg'), 'la puce de restauration doit afficher une icône (œil ouvert), pas un "+" textuel');
      chip.dispatchEvent(new MouseEvent('click', { bubbles: true })); // restore, reset pour les autres tests
      assertTrue(!!panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'le volet doit réapparaître après restauration');
    });
  });

  describe('Installation des fonds — préférences utilisateur persistées (table Preferences_Widget, partagée)', function () {
    it('ajoute ses colonnes Install_* à la table Preferences_Widget si elle existe déjà (créée par une autre page)', async function () {
      await loadFixtureState();
      await window.loadKanbanUserPreferences();
      const before = await window.CoreGrist.getTable('Preferences_Widget');
      assertFalse('Install_repliees' in before[0], 'la colonne Install_repliees ne doit pas exister avant le chargement Installation');

      await window.loadInstallationUserPreferences();

      const after = await window.CoreGrist.getTable('Preferences_Widget');
      assertTrue('Install_repliees' in after[0], 'la colonne Install_repliees doit avoir été ajoutée');
      const addColumnCalls = window.__TEST_CALLS__.filter(c => c.type === 'AddColumn' && c.table === 'Preferences_Widget');
      assertEqual(addColumnCalls.length, 6, 'les 6 colonnes Install_* (volets repliés/masqués, 3 filtres, vue) doivent être ajoutées');
      const addTableCalls = window.__TEST_CALLS__.filter(c => c.type === 'AddTable' && c.table === 'Preferences_Widget');
      assertEqual(addTableCalls.length, 1, 'la table ne doit pas être recréée, seulement complétée');
    });

    it('crée elle-même la table (avec ses colonnes) si aucune autre page ne l\'a encore fait', async function () {
      await loadFixtureState();
      const before = await window.CoreGrist.gristInstance.docApi.listTables();
      assertFalse(before.includes('Preferences_Widget'), 'la table ne doit pas exister avant tout chargement de préférences');

      await window.loadInstallationUserPreferences();

      const rows = await window.CoreGrist.getTable('Preferences_Widget');
      assertEqual(rows.length, 1, 'une ligne doit avoir été créée');
      assertTrue('Install_repliees' in rows[0], 'la table auto-créée doit inclure les colonnes Install_*');
    });

    it('réutilise la même ligne que les autres pages (id de ligne partagé via localStorage), sans doublon d\'AddRecord', async function () {
      await loadFixtureState();
      await window.loadKanbanUserPreferences();
      await window.loadInstallationUserPreferences();
      const addRecordCalls = window.__TEST_CALLS__.filter(c => c.type === 'AddRecord' && c.table === 'Preferences_Widget');
      assertEqual(addRecordCalls.length, 1, 'Kanban et Installation doivent partager la même ligne, pas en créer une seconde');
    });

    it('encode les volets repliés/masqués ("side:idx") et la vue sélectionnée, enregistrés par UpdateRecord', async function () {
      await loadFixtureState();
      await window.loadKanbanUserPreferences();
      await window.loadInstallationUserPreferences();

      panelIn('install-col-ailleurs', 'Ouverture demandée à la DF').querySelector('[data-toggle-install-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(0);
      panelIn('install-col-diese', 'Installé').querySelector('[data-hide-install-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(0);
      fireMouse(document.querySelector('[data-install-tab="ailleurs"]'), 'click');
      await wait(0);

      const rows = await window.CoreGrist.getTable('Preferences_Widget');
      assertEqual(rows.length, 1, 'toujours une seule ligne de préférences');
      assertTrue(rows[0].Install_repliees.split(',').includes('ailleurs:1'), 'le volet explicitement replié doit être encodé ("side:idx")');
      assertEqual(rows[0].Install_masquees, 'diese:2', 'le volet "Installé" côté DIESE (masqué) doit être encodé');
      assertEqual(rows[0].Install_vue, 'ailleurs', 'la vue sélectionnée doit être enregistrée');

      // Nettoyage : restaurer l'état par défaut pour ne pas polluer les tests suivants.
      panelIn('install-col-ailleurs', 'Ouverture demandée à la DF').querySelector('[data-toggle-install-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.getElementById('install-hidden-diese').querySelector('[data-restore-install-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fireMouse(document.querySelector('[data-install-tab="all"]'), 'click');
      await wait(0);
    });

    it('restaure l\'état des volets et la vue à un rechargement ultérieur, dans le même navigateur', async function () {
      await loadFixtureState();
      await window.loadKanbanUserPreferences();
      await window.loadInstallationUserPreferences();

      panelIn('install-col-ailleurs', 'Ouverture demandée à la DF').querySelector('[data-toggle-install-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(0);
      fireMouse(document.querySelector('[data-install-tab="diese"]'), 'click');
      await wait(0);

      // Simule un rechargement de page : l'id de ligne reste en cache (localStorage).
      await window.loadInstallationUserPreferences();
      window.renderInstallation();

      assertTrue(panelIn('install-col-ailleurs', 'Ouverture demandée à la DF').classList.contains('is-collapsed'), 'le volet doit rester replié après rechargement');
      assertTrue(document.getElementById('install-panels-wrap').classList.contains('is-single'), 'la vue sélectionnée doit être restaurée après rechargement');
      assertTrue(document.querySelector('[data-install-tab="diese"]').classList.contains('is-active'));

      const addRecordCalls = window.__TEST_CALLS__.filter(c => c.type === 'AddRecord' && c.table === 'Preferences_Widget');
      assertEqual(addRecordCalls.length, 1, 'le rechargement ne doit pas créer de nouvelle ligne de préférences');

      // Nettoyage.
      panelIn('install-col-ailleurs', 'Ouverture demandée à la DF').querySelector('[data-toggle-install-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fireMouse(document.querySelector('[data-install-tab="all"]'), 'click');
      await wait(0);
    });
  });
})();
