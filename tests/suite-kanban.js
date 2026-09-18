/**
 * Non-regression suite: Kanban "Projets" (js/pages/page-projets.js).
 * Fixture Projets (tests/fixtures.js) cover one project per kanban column plus two
 * edge cases: an unrecognised Statut_Macro (must render in no column) and a fully
 * signed convention (must NOT be pinned to the Conventions column).
 */
(function () {
  'use strict';

  async function loadFixtureState() {
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    window.renderProjectsKanban();
  }

  function columnSection(label) {
    return Array.from(document.querySelectorAll('#projects-kanban .kanban-column'))
      .find(section => section.querySelector('.kanban-column-header h3')?.textContent === label);
  }

  function cardIn(section, acronym) {
    return Array.from(section.querySelectorAll('.project-card'))
      .find(card => card.querySelector('.project-acronym')?.textContent === acronym);
  }

  describe('Kanban Projets — classement par colonne', function () {
    it('place chaque projet dans la colonne attendue par Statut_Macro', async function () {
      await loadFixtureState();
      assertTrue(!!cardIn(columnSection('Instruction'), 'INNOVX'), 'INNOVX (1) Information projet saisies) doit être en Instruction');
      assertTrue(!!cardIn(columnSection('Notifications'), 'NOTIFY'), 'NOTIFY (5) envoyée pour signature VP) doit être en Notifications');
      assertTrue(!!cardIn(columnSection('Installation des fonds'), 'FINANCX'), 'FINANCX (Finance_...) doit être en Installation des fonds');
      assertTrue(!!cardIn(columnSection('Projet en cours'), 'COURSIX'), 'COURSIX (En cours, sans convention) doit être en Projet en cours');
    });

    it('une convention non signée passe avant "Projet en cours" même si Statut_Macro=En cours', async function () {
      await loadFixtureState();
      assertTrue(!!cardIn(columnSection('Conventions'), 'CONVENTIX'), 'CONVENTIX doit être en Conventions (convention cochée, non signée)');
      assertFalse(!!cardIn(columnSection('Projet en cours'), 'CONVENTIX'), 'CONVENTIX ne doit pas apparaître en Projet en cours');
    });

    it('une convention signée de toutes les parties ne bloque plus le classement normal', async function () {
      await loadFixtureState();
      assertFalse(!!cardIn(columnSection('Conventions'), 'SIGNEX'), 'SIGNEX (convention signée) ne doit pas rester en Conventions');
      assertTrue(!!cardIn(columnSection('Projet en cours'), 'SIGNEX'), 'SIGNEX doit retomber en Projet en cours (Statut_Macro=En cours)');
    });

    it('un Statut_Macro non reconnu n\'apparaît dans aucune colonne (pas de colonne "autre")', async function () {
      await loadFixtureState();
      const allCards = document.querySelectorAll('#projects-kanban .project-card');
      const acronyms = Array.from(allCards).map(c => c.querySelector('.project-acronym')?.textContent);
      assertFalse(acronyms.includes('INCONNUX'), 'INCONNUX (Statut totalement inconnu) ne doit être affiché nulle part');
    });

    it('le compteur de la colonne reflète le nombre réel de cartes', async function () {
      await loadFixtureState();
      const section = columnSection('Instruction');
      const count = section.querySelector('.kanban-count').textContent;
      const cards = section.querySelectorAll('.project-card').length;
      assertEqual(count, String(cards), 'kanban-count doit correspondre au nombre de cartes rendues');
    });
  });

  describe('Kanban Projets — enrichissement des cartes (porteur, programme, accompagnateur)', function () {
    it('résout Porteur_1 et Accompagnateur en nom complet via Annuaire', async function () {
      await loadFixtureState();
      const card = cardIn(columnSection('Instruction'), 'INNOVX');
      const holderText = Array.from(card.querySelectorAll('.project-holder')).map(el => el.textContent).join(' | ');
      assertIncludes(holderText, 'Alice Martin', 'Porteur_1=1 doit afficher "Alice Martin"');
      assertIncludes(holderText, 'Bob Durand', 'Accompagnateur=2 doit afficher "Bob Durand"');
    });

    it('résout Programme en libellé via la table Programmes', async function () {
      await loadFixtureState();
      const card = cardIn(columnSection('Instruction'), 'INNOVX');
      assertIncludes(card.querySelector('.programme-badge').textContent, 'Programme A');
    });

    it('affiche le badge Convention seulement quand Convention_de_reversement est vrai', async function () {
      await loadFixtureState();
      assertTrue(!!cardIn(columnSection('Conventions'), 'CONVENTIX').querySelector('.convention-badge'));
      assertFalse(!!cardIn(columnSection('Instruction'), 'INNOVX').querySelector('.convention-badge'));
    });
  });

  describe('Kanban Projets — échappement HTML des données Grist', function () {
    it('échappe l\'acronyme et le porteur avant de les insérer dans le HTML', async function () {
      const tables = await window.CoreGrist.loadAllTables();
      // Simulate a record containing HTML-ish text, as a Grist editor could type it.
      tables.Projets[0].Acronyme = '<img src=x onerror=alert(1)>';
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderProjectsKanban();
      const board = document.getElementById('projects-kanban');
      assertEqual(board.querySelectorAll('img').length, 0, 'aucune balise <img> ne doit être créée depuis la donnée Grist');
      const acronymEl = Array.from(board.querySelectorAll('.project-acronym')).find(el => el.textContent.includes('onerror'));
      assertTrue(!!acronymEl, 'le texte doit apparaître échappé (en tant que texte) dans une carte');
    });
  });

  describe('Kanban Projets — filtres Programme / Instance / recherche', function () {
    function selectCombo(inputId, label) {
      const input = document.getElementById(inputId);
      fire(input, 'focus');
      const list = document.getElementById(`${inputId}-list`);
      const button = Array.from(list.querySelectorAll('[data-value]')).find(b => b.dataset.value === label);
      assertTrue(!!button, `option "${label}" introuvable dans ${inputId}`);
      fireMouse(button, 'mousedown');
    }

    it('le filtre Programme ne conserve que les projets du programme choisi', async function () {
      await loadFixtureState();
      selectCombo('filter-programme', 'Programme A');
      const visibleAcronyms = Array.from(document.querySelectorAll('#projects-kanban .project-acronym')).map(el => el.textContent);
      assertTrue(visibleAcronyms.includes('INNOVX'), 'INNOVX (Programme A) doit rester visible');
      assertFalse(visibleAcronyms.includes('NOTIFY'), 'NOTIFY (Programme B) doit être masqué');
    });

    it('"Réinitialiser" efface les filtres Programme/Instance/recherche', async function () {
      await loadFixtureState();
      selectCombo('filter-programme', 'Programme A');
      document.getElementById('clear-filters').click();
      const visibleAcronyms = Array.from(document.querySelectorAll('#projects-kanban .project-acronym')).map(el => el.textContent);
      assertTrue(visibleAcronyms.includes('NOTIFY'), 'après réinitialisation, NOTIFY doit redevenir visible');
    });

    it('la recherche filtre par acronyme, insensible aux accents/casse', async function () {
      await loadFixtureState();
      const search = document.getElementById('filter-search');
      setValue(search, 'innovx');
      fire(search, 'input');
      const visibleAcronyms = Array.from(document.querySelectorAll('#projects-kanban .project-acronym')).map(el => el.textContent);
      assertDeepEqual(visibleAcronyms.sort(), ['INNOVX'], 'seule la carte INNOVX doit rester visible pour la recherche "innovx"');
      setValue(search, '');
      fire(search, 'input');
    });
  });

  describe('Kanban Projets — ouverture de la fiche projet au clic', function () {
    it('un clic sur une carte appelle ProjectModal.open avec le bon enregistrement', async function () {
      await loadFixtureState();
      const original = window.ProjectModal.open;
      let received = null;
      window.ProjectModal.open = function (record) { received = record; };
      try {
        cardIn(columnSection('Instruction'), 'INNOVX').click();
        assertTrue(!!received, 'ProjectModal.open doit être appelé');
        assertEqual(received.Acronyme, 'INNOVX');
      } finally {
        window.ProjectModal.open = original;
      }
    });
  });

  describe('Kanban Projets — bandeau de filtres compact', function () {
    it('les légendes Programme/Instance/Recherche sont accessibles mais visuellement masquées, pas affichées sur leur propre ligne', function () {
      const combo = document.querySelector('.filter-combo');
      const hiddenLabel = combo.querySelector('.visually-hidden');
      assertTrue(!!hiddenLabel, 'la légende doit être dans un élément .visually-hidden plutôt qu\'affichée en clair au-dessus du champ (ce qui ajoutait une ligne, donc de la hauteur, au bandeau)');
      assertTrue(hiddenLabel.textContent.trim().length > 0, 'le texte accessible pour les lecteurs d\'écran ne doit pas être vide');
    });

    it('la feuille de style définit l\'utilitaire .visually-hidden utilisé par le bandeau de filtres', async function () {
      const res = await fetch('../style.css', { cache: 'no-store' });
      const css = await res.text();
      assertTrue(/\.visually-hidden\s*\{/.test(css), 'attendu une classe utilitaire .visually-hidden dans style.css');
    });
  });

  describe('Kanban Projets — colonnes repliables', function () {
    function collapseBtn(section) { return section.querySelector('[data-toggle-collapse]'); }

    it('"Projet en cours" est repliée par défaut, les autres colonnes ne le sont pas', async function () {
      await loadFixtureState();
      const enCours = columnSection('Projet en cours');
      assertTrue(enCours.classList.contains('is-collapsed'), '"Projet en cours" doit porter la classe is-collapsed par défaut');
      assertEqual(collapseBtn(enCours).getAttribute('aria-expanded'), 'false', 'le bouton de repli doit annoncer aria-expanded="false" par défaut');
      assertFalse(columnSection('Instruction').classList.contains('is-collapsed'), 'les autres colonnes ne doivent pas être repliées par défaut');
    });

    it('une colonne repliée garde ses cartes dans le DOM (repli = CSS, pas une suppression) pour ne pas casser le classement métier', async function () {
      await loadFixtureState();
      assertTrue(!!cardIn(columnSection('Projet en cours'), 'COURSIX'), 'COURSIX doit rester présente dans le DOM même colonne repliée par défaut');
    });

    it('cliquer sur le bouton de repli bascule aria-expanded et la classe is-collapsed', async function () {
      await loadFixtureState();
      const section = columnSection('Instruction');
      const btn = collapseBtn(section);
      btn.click();
      assertTrue(columnSection('Instruction').classList.contains('is-collapsed'), 'la colonne doit devenir repliée après le premier clic');
      assertEqual(collapseBtn(columnSection('Instruction')).getAttribute('aria-expanded'), 'false');
      collapseBtn(columnSection('Instruction')).click();
      assertFalse(columnSection('Instruction').classList.contains('is-collapsed'), 'un second clic doit la déplier à nouveau');
      assertEqual(collapseBtn(columnSection('Instruction')).getAttribute('aria-expanded'), 'true');
    });

    it('la feuille de style masque réellement .kanban-cards pour une colonne .is-collapsed', async function () {
      const res = await fetch('../kanban.css', { cache: 'no-store' });
      const css = await res.text();
      assertTrue(/\.kanban-column\.is-collapsed\s+\.kanban-cards\s*\{[^}]*\bdisplay\s*:\s*none\b/i.test(css), 'attendu une règle .kanban-column.is-collapsed .kanban-cards{display:none} dans kanban.css');
    });
  });

  describe('Kanban Projets — colonnes masquables, restaurables depuis le bandeau', function () {
    it('masquer une colonne la retire du tableau et fait apparaître une puce de restauration à côté de "Réinitialiser"', async function () {
      await loadFixtureState();
      const hiddenBar = document.getElementById('kanban-hidden-columns');
      assertTrue(hiddenBar.hidden, 'le bandeau des colonnes masquées doit rester caché tant qu\'aucune colonne n\'est masquée');

      columnSection('Notifications').querySelector('[data-hide-column]').click();

      assertTrue(!columnSection('Notifications'), 'la colonne masquée ne doit plus être rendue dans #projects-kanban');
      assertFalse(hiddenBar.hidden, 'le bandeau des colonnes masquées doit devenir visible');
      const restoreBtn = hiddenBar.querySelector('[data-restore-column="Notifications"]');
      assertTrue(!!restoreBtn, 'une puce de restauration pour "Notifications" doit apparaître dans le bandeau, à côté de Réinitialiser');
      assertTrue(restoreBtn.textContent.includes('Notifications'));

      // Nettoyage : on restaure la colonne pour ne pas polluer les tests suivants.
      restoreBtn.click();
      assertTrue(!!columnSection('Notifications'), 'la colonne doit réapparaître après restauration');
      assertTrue(document.getElementById('kanban-hidden-columns').hidden, 'le bandeau doit redevenir caché une fois toutes les colonnes restaurées');
    });

    it('le bandeau des colonnes masquées est un élément du bandeau de filtres, entre Réinitialiser et Nouveau Projet', function () {
      const clearBtn = document.getElementById('clear-filters');
      const hiddenBar = document.getElementById('kanban-hidden-columns');
      const newProjectBtn = document.getElementById('btn-new-project');
      assertTrue(clearBtn.parentElement === hiddenBar.parentElement && hiddenBar.parentElement === newProjectBtn.parentElement, 'les trois éléments doivent être dans le même bandeau .project-filters');
      const children = Array.from(clearBtn.parentElement.children);
      assertTrue(children.indexOf(clearBtn) < children.indexOf(hiddenBar) && children.indexOf(hiddenBar) < children.indexOf(newProjectBtn), 'le bandeau des colonnes masquées doit être placé juste après Réinitialiser, avant + Nouveau Projet');
    });
  });

  describe('Kanban Projets — préférences utilisateur persistées (table Preferences_Widget)', function () {
    function selectCombo(inputId, label) {
      const input = document.getElementById(inputId);
      fire(input, 'focus');
      const list = document.getElementById(`${inputId}-list`);
      const button = Array.from(list.querySelectorAll('[data-value]')).find(b => b.dataset.value === label);
      assertTrue(!!button, `option "${label}" introuvable dans ${inputId}`);
      fireMouse(button, 'mousedown');
    }

    it('crée automatiquement la table Preferences_Widget si elle n\'existe pas encore', async function () {
      await loadFixtureState();
      const before = await window.CoreGrist.gristInstance.docApi.listTables();
      assertFalse(before.includes('Preferences_Widget'), 'la table ne doit pas exister avant le premier chargement des préférences');
      await window.loadKanbanUserPreferences();
      const after = await window.CoreGrist.gristInstance.docApi.listTables();
      assertTrue(after.includes('Preferences_Widget'), 'la table doit être créée automatiquement au premier chargement des préférences');
    });

    it('ne recrée pas la table si elle existe déjà (pas de doublon d\'AddTable)', async function () {
      await loadFixtureState();
      await window.loadKanbanUserPreferences();
      await window.loadKanbanUserPreferences();
      const addTableCalls = window.__TEST_CALLS__.filter(c => c.type === 'AddTable' && c.table === 'Preferences_Widget');
      assertEqual(addTableCalls.length, 1, 'AddTable ne doit être déclenché qu\'une seule fois pour Preferences_Widget');
    });

    it('sans identité utilisateur disponible (SCIM indisponible), aucune table n\'est créée et rien ne plante', async function () {
      window.__setMockUserEmail('');
      await loadFixtureState();
      await window.loadKanbanUserPreferences();
      const tables = await window.CoreGrist.gristInstance.docApi.listTables();
      assertFalse(tables.includes('Preferences_Widget'), 'sans email utilisateur identifiable, la table ne doit pas être créée');
    });

    it('la première sauvegarde crée un enregistrement (AddRecord) encodé en liste séparée par virgules, les suivantes le mettent à jour (UpdateRecord)', async function () {
      await loadFixtureState();
      await window.loadKanbanUserPreferences();

      columnSection('Instruction').querySelector('[data-toggle-collapse]').click();
      await wait(0);
      let prefsCalls = window.__TEST_CALLS__.filter(c => c.table === 'Preferences_Widget');
      assertEqual(prefsCalls.filter(c => c.type === 'AddRecord').length, 1, 'le premier changement doit créer un enregistrement de préférences');
      assertEqual(prefsCalls.filter(c => c.type === 'UpdateRecord').length, 0, 'aucune mise à jour ne doit avoir lieu avant qu\'un enregistrement existe');

      const rows = await window.CoreGrist.getTable('Preferences_Widget');
      const row = rows.find(r => r.Email_utilisateur === 'alice.martin@example.org');
      assertTrue(!!row, 'la ligne doit être associée à l\'email de l\'utilisateur courant simulé');
      assertDeepEqual(row.Kanban_colonnes_repliees.split(',').sort(), ['Instruction', 'Projet en cours'].sort(),
        'les colonnes repliées doivent être encodées en liste séparée par des virgules');
      assertEqual(row.Kanban_colonnes_masquees, '', 'aucune colonne masquée à ce stade');

      columnSection('Notifications').querySelector('[data-hide-column]').click();
      await wait(0);
      prefsCalls = window.__TEST_CALLS__.filter(c => c.table === 'Preferences_Widget');
      assertEqual(prefsCalls.filter(c => c.type === 'AddRecord').length, 1, 'aucun second AddRecord ne doit être créé pour le même utilisateur');
      assertEqual(prefsCalls.filter(c => c.type === 'UpdateRecord').length, 1, 'le second changement doit mettre à jour le même enregistrement');

      // Nettoyage : restaurer l'état par défaut pour ne pas polluer les tests suivants.
      columnSection('Instruction').querySelector('[data-toggle-collapse]').click();
      document.getElementById('kanban-hidden-columns').querySelector('[data-restore-column="Notifications"]').click();
      await wait(0);
    });

    it('restaure l\'état des colonnes (repliées/masquées) et des filtres à partir d\'un enregistrement existant', async function () {
      await loadFixtureState();
      // Une ligne déjà présente simule une préférence enregistrée lors d'une session précédente,
      // indépendamment du chemin de sauvegarde du widget (testé séparément ci-dessus).
      await window.CoreGrist.gristInstance.docApi.applyUserActions([['AddRecord', 'Preferences_Widget', null, {
        Email_utilisateur: 'alice.martin@example.org',
        Kanban_colonnes_repliees: 'Instruction,Projet en cours',
        Kanban_colonnes_masquees: 'Notifications',
        Filtre_programme: 'Programme A',
        Filtre_instance: '',
        Filtre_recherche: ''
      }]]);

      await window.loadKanbanUserPreferences();
      window.renderProjectsKanban();

      assertTrue(columnSection('Instruction').classList.contains('is-collapsed'), 'Instruction doit être repliée d\'après la préférence enregistrée');
      assertFalse(!!columnSection('Notifications'), 'Notifications doit être masquée d\'après la préférence enregistrée');
      assertEqual(document.getElementById('filter-programme').value, 'Programme A', 'le filtre Programme doit être restauré d\'après la préférence enregistrée');
      const visibleAcronyms = Array.from(document.querySelectorAll('#projects-kanban .project-acronym')).map(el => el.textContent);
      assertFalse(visibleAcronyms.includes('NOTIFY'), 'le filtre Programme restauré doit effectivement s\'appliquer au rendu');

      // Nettoyage : restaurer l'état par défaut pour ne pas polluer les tests suivants.
      columnSection('Instruction').querySelector('[data-toggle-collapse]').click();
      document.getElementById('kanban-hidden-columns').querySelector('[data-restore-column="Notifications"]').click();
      document.getElementById('clear-filters').click();
      await wait(0);
    });
  });
})();
