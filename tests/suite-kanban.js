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
})();
