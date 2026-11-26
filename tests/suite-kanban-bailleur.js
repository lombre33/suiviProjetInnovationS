/**
 * Non-regression suite : filtre Bailleur du Kanban Projets (js/pages/page-projets.js), demande d'Antoine du 26/11/2026 :
 * « pour le kanban pourquoi pas un filtre mais discret, et là par contre les deux financeurs par défaut de présent ».
 *
 *  - dans le bandeau de filtres existant (aucune nouvelle ligne), les deux bailleurs (InnovationS, Idex) cochés d'origine : le champ
 *    ressemble alors à un filtre vide et aucun projet n'est masqué ;
 *  - un projet reste visible dès qu'UNE de ses OPE est financée par un bailleur coché ; une OPE sans bailleur vaut InnovationS ;
 *  - tout décocher, ou tout recocher, revient au défaut ; Réinitialiser aussi ;
 *  - retenu par utilisateur (Preferences_Widget.Filtre_bailleur, colonne créée au mieux, jamais écrite tant que Grist ne la connaît pas).
 *
 * Fixtures : INNOVX, NOTIFY, CONVENTIX, FINANCX, COURSIX, INCONNUX, SIGNEX (tous sans bailleur, donc InnovationS).
 */
(function () {
  'use strict';

  const ID = 'filter-bailleur';
  const listOf = () => document.getElementById(`${ID}-list`);
  const input = () => document.getElementById(ID);
  const options = () => Array.from(listOf().querySelectorAll('[data-value]'));
  const optionValues = () => options().map(button => button.dataset.value);
  const checked = () => options().filter(button => button.getAttribute('aria-selected') === 'true').map(button => button.dataset.value);
  const shown = () => Array.from(document.querySelectorAll('#projects-kanban .project-acronym')).map(el => el.textContent).sort();
  const resetHidden = () => document.getElementById('clear-filters').hidden;
  const prefsWrites = () => window.__TEST_CALLS__.filter(c => c.table === 'Preferences_Widget' && c.type === 'UpdateRecord');

  // `edits` : { acronyme: { colonne: valeur } } appliqué aux lignes de Projets avant l'affichage.
  async function loadState(edits) {
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(edits || {}).forEach(([acronym, fields]) => Object.assign(tables.Projets.find(p => p.Acronyme === acronym), fields));
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    [ID, 'filter-programme', 'filter-instance'].forEach(id => { const el = document.getElementById(id); el.dataset.selectedValues = ''; el.value = ''; });
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
  // Coche / décoche une valeur de la liste comme un clic de l'utilisateur.
  function toggle(value) {
    fire(input(), 'focus');
    const button = options().find(item => item.dataset.value === value);
    assertTrue(!!button, `valeur « ${value} » absente de la liste du filtre Bailleur`);
    fireMouse(button, 'mousedown');
    fire(input(), 'blur');
  }

  // Idex seul sur INNOVX ; InnovationS puis Idex (OPE 2 réelle) sur CONVENTIX ; InnovationS explicite sur FINANCX ; NOTIFY sans bailleur.
  const MIXED = {
    INNOVX: { Bailleur: 'Idex' },
    CONVENTIX: { Bailleur: 'InnovationS', Bailleur_2: 'Idex', Commentaire_ligne_OPE_2: 'seconde OPE' },
    FINANCX: { Bailleur: 'InnovationS' }
  };

  describe('Kanban Projets — filtre Bailleur : état au repos', function () {
    it('est dans le bandeau de filtres existant, entre Instance et la recherche (aucune nouvelle ligne)', async function () {
      await loadState();
      const bar = input().closest('.project-filters');
      const children = Array.from(bar.children);
      const own = input().closest('.filter-combo');
      assertTrue(own.parentElement === bar, 'le champ est un enfant direct du bandeau');
      assertTrue(children.indexOf(document.getElementById('filter-instance').closest('.filter-combo')) < children.indexOf(own) && children.indexOf(own) < children.indexOf(document.getElementById('filter-search').closest('label')),
        'placé après Instance et avant la recherche');
      assertEqual(input().getAttribute('placeholder'), 'Tous les bailleurs');
    });

    it('les deux bailleurs sont cochés, le champ est au repos et aucun projet n\'est masqué', async function () {
      await loadState();
      const base = shown();
      assertEqual(base.length >= 5, true, 'le Kanban des fixtures affiche plusieurs projets');
      fire(input(), 'focus');
      assertDeepEqual(optionValues(), ['', 'InnovationS', 'Idex'], 'le bouton « Tous les bailleurs », puis InnovationS et Idex');
      assertDeepEqual(checked(), ['InnovationS', 'Idex'], 'les deux financeurs sont cochés d\'origine');
      fire(input(), 'blur');
      await wait(200);
      assertEqual(input().value, '', 'au repos le champ montre son texte d\'invite, pas « 2 bailleurs sélectionnés »');
      assertFalse(input().classList.contains('is-active'), 'pas de surlignage : c\'est le défaut, comme un filtre vide');
      assertTrue(resetHidden(), 'Réinitialiser n\'apparaît pas pour le simple défaut');
      assertEqual(input().dataset.selectedValues || '', '', 'rien n\'est retenu pour le défaut');
    });

    it('par défaut, des projets financés par Idex restent visibles (le Kanban n\'est pas modifié sans choix de l\'utilisateur)', async function () {
      await loadState();
      const base = shown();
      await loadState(MIXED);
      assertDeepEqual(shown(), base, 'les mêmes projets qu\'avant l\'ajout des bailleurs');
      await cleanUp();
    });
  });

  describe('Kanban Projets — filtre Bailleur : filtrer', function () {
    it('décocher InnovationS ne garde que les projets dont une OPE est financée par Idex (OPE 1 ou OPE suivante)', async function () {
      await loadState();
      const base = shown();
      await loadState(MIXED);
      toggle('InnovationS');
      await wait(5);
      assertDeepEqual(shown(), ['CONVENTIX', 'INNOVX'], 'INNOVX (Idex) et CONVENTIX (OPE 2 Idex) ; pas FINANCX ni NOTIFY');
      assertTrue(base.includes('INNOVX') && base.includes('CONVENTIX'), 'ces deux projets sont bien classés dans le Kanban');
      assertEqual(input().dataset.selectedValues, 'Idex', 'la sélection est enregistrée sur le champ');
      assertEqual(input().value, 'Idex', 'le champ résume la sélection');
      assertTrue(input().classList.contains('is-active'), 'surligné dès que le choix s\'écarte du défaut');
      assertFalse(resetHidden(), 'Réinitialiser apparaît');
      await cleanUp();
    });

    it('décocher Idex ne masque que les projets financés uniquement par Idex : un projet mixte, ou sans bailleur, reste', async function () {
      await loadState();
      const base = shown();
      await loadState(MIXED);
      toggle('Idex');
      await wait(5);
      assertDeepEqual(shown(), base.filter(acronym => acronym !== 'INNOVX'), 'seul INNOVX (Idex partout) disparaît');
      assertTrue(shown().includes('CONVENTIX'), 'CONVENTIX (InnovationS + Idex) reste');
      assertTrue(shown().includes('NOTIFY'), 'NOTIFY (sans bailleur = InnovationS) reste');
      await cleanUp();
    });

    it('une OPE supprimée (sans données) dont le bailleur est resté dans la ligne ne compte pas', async function () {
      await loadState();
      await loadState({ FINANCX: { Bailleur: 'InnovationS', Bailleur_2: 'Idex' } }); // OPE 2 vide : seule la valeur par défaut d'une OPE ajoutée
      toggle('InnovationS');
      await wait(5);
      assertFalse(shown().includes('FINANCX'), 'FINANCX n\'a pas d\'OPE 2 réelle : pas financé par Idex');
      await cleanUp();
    });

    it('un bailleur hors liste trouvé dans les données est proposé, décoché d\'origine, et filtre', async function () {
      await loadState();
      const base = shown();
      await loadState({ SIGNEX: { Bailleur: 'Région' } });
      assertTrue(base.includes('SIGNEX'), 'SIGNEX est classé dans le Kanban');
      fire(input(), 'focus');
      assertDeepEqual(optionValues(), ['', 'InnovationS', 'Idex', 'Région'], 'proposé après les deux bailleurs');
      assertDeepEqual(checked(), ['InnovationS', 'Idex', 'Région'], 'par défaut, tout est coché : rien n\'est masqué');
      fire(input(), 'blur');
      toggle('InnovationS');
      toggle('Idex');
      await wait(5);
      assertDeepEqual(shown(), ['SIGNEX'], 'seul le projet financé par la Région reste');
      await cleanUp();
    });
  });

  describe('Kanban Projets — filtre Bailleur : revenir au défaut', function () {
    it('« Tous les bailleurs » rétablit les deux cochés', async function () {
      await loadState(MIXED);
      toggle('InnovationS');
      assertEqual(input().dataset.selectedValues, 'Idex');
      toggle('');
      await wait(5);
      assertEqual(input().dataset.selectedValues || '', '', 'retour au défaut');
      assertDeepEqual(checked(), ['InnovationS', 'Idex']);
      assertTrue(resetHidden());
      await cleanUp();
    });

    it('décocher le dernier bailleur coché ne laisse pas un Kanban vide : retour aux deux', async function () {
      await loadState(MIXED);
      toggle('InnovationS'); // reste Idex
      toggle('Idex'); // plus rien : défaut
      await wait(5);
      assertEqual(input().dataset.selectedValues || '', '');
      assertDeepEqual(checked(), ['InnovationS', 'Idex']);
      assertTrue(shown().length >= 5, 'des projets sont affichés');
      await cleanUp();
    });

    it('recocher les deux revient exactement au défaut (rien d\'enregistré, champ au repos)', async function () {
      await loadState(MIXED);
      toggle('Idex'); // InnovationS seul
      assertEqual(input().dataset.selectedValues, 'InnovationS');
      toggle('Idex'); // les deux
      await wait(5);
      assertEqual(input().dataset.selectedValues || '', '');
      assertFalse(input().classList.contains('is-active'));
      await cleanUp();
    });

    it('Réinitialiser (icône du bandeau) rétablit les deux bailleurs et se masque', async function () {
      await loadState(MIXED);
      toggle('InnovationS');
      assertFalse(resetHidden());
      document.getElementById('clear-filters').click();
      await wait(5);
      assertEqual(input().dataset.selectedValues || '', '');
      assertEqual(input().value, '');
      assertTrue(resetHidden());
      await cleanUp();
    });
  });

  describe('Kanban Projets — filtre Bailleur : retenu par utilisateur (Preferences_Widget.Filtre_bailleur)', function () {
    it('crée la colonne Filtre_bailleur au chargement des préférences, une seule fois', async function () {
      await loadState();
      await window.loadKanbanUserPreferences();
      await window.loadKanbanUserPreferences();
      const added = window.__TEST_CALLS__.filter(c => c.type === 'AddColumn' && c.table === 'Preferences_Widget' && c.colId === 'Filtre_bailleur');
      assertEqual(added.length, 1, 'colonne ajoutée une seule fois (la table existait déjà ou venait d\'être créée sans elle)');
    });

    it('enregistre le choix dans la ligne de préférences et le retrouve au rechargement', async function () {
      await loadState(MIXED);
      await window.loadKanbanUserPreferences();
      toggle('InnovationS');
      await wait(10);
      const rows = await window.CoreGrist.getTable('Preferences_Widget');
      assertEqual(rows[0].Filtre_bailleur, 'Idex', 'Idex seul enregistré');

      // Rechargement dans le même navigateur : la ligne est retrouvée par son id en cache.
      input().dataset.selectedValues = ''; input().value = '';
      await window.loadKanbanUserPreferences();
      window.renderProjectsKanban();
      assertEqual(input().dataset.selectedValues, 'Idex', 'filtre restauré');
      assertEqual(input().value, 'Idex');
      assertDeepEqual(shown(), ['CONVENTIX', 'INNOVX'], 'et appliqué au rendu');

      toggle('');
      await wait(10);
      const after = await window.CoreGrist.getTable('Preferences_Widget');
      assertEqual(after[0].Filtre_bailleur, '', 'revenir au défaut efface ce qui était retenu');
      await cleanUp();
    });

    it('une préférence sans filtre Bailleur (colonne vide) laisse les deux cochés', async function () {
      await loadState(MIXED);
      await window.loadKanbanUserPreferences();
      toggle('Idex');
      toggle('Idex');
      await wait(10);
      await window.loadKanbanUserPreferences();
      window.renderProjectsKanban();
      assertEqual(input().dataset.selectedValues || '', '');
      assertDeepEqual(checked(), ['InnovationS', 'Idex']);
      await cleanUp();
    });

    it('sans droit pour créer la colonne, le filtre marche mais n\'est pas écrit (un champ inconnu ferait rejeter toute l\'écriture des préférences)', async function () {
      await loadState(MIXED);
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async function (actions) {
        if (actions.some(action => action[0] === 'AddColumn' && action[1] === 'Preferences_Widget' && action[2] === 'Filtre_bailleur')) throw new Error('Pas de droit de structure');
        return original.call(this, actions);
      };
      try {
        await window.CoreGrist.ensureTable('Preferences_Widget', [{ id: 'Email_utilisateur', type: 'Text' }]); // table existante sans la colonne
        await window.loadKanbanUserPreferences();
        window.__TEST_CALLS__.length = 0;
        toggle('InnovationS');
        await wait(10);
        assertDeepEqual(shown(), ['CONVENTIX', 'INNOVX'], 'le filtre s\'applique quand même');
        const writes = prefsWrites();
        assertTrue(writes.length > 0, 'les préférences sont enregistrées');
        assertFalse(writes.some(write => 'Filtre_bailleur' in (write.fields || write.colValues || {})), 'sans colonne connue, Filtre_bailleur n\'est jamais écrit');
      } finally {
        window.grist.docApi.applyUserActions = original;
      }
      await cleanUp();
    });
  });

  describe('CoreOpes.bailleurs — bailleurs d\'un projet (filtre du Kanban)', function () {
    const B = () => window.CoreOpes.bailleurs;
    it('une ligne sans bailleur vaut InnovationS', function () {
      assertDeepEqual(B()({ Bailleur: '' }), ['InnovationS']);
      assertDeepEqual(B()({}), ['InnovationS'], 'colonne absente (jamais créée)');
    });
    it('rend le bailleur de chaque OPE qui existe, sans doublon', function () {
      assertDeepEqual(B()({ Bailleur: 'Idex', Bailleur_2: 'Idex', Commentaire_ligne_OPE_2: 'x' }), ['Idex']);
      assertDeepEqual(B()({ Bailleur: 'InnovationS', Bailleur_2: 'Idex', Commentaire_ligne_OPE_2: 'x', Bailleur_3: 'Idex', Commentaire_ligne_OPE_3: 'y' }), ['InnovationS', 'Idex']);
    });
    it('ignore une OPE sans données (bailleur d\'une OPE ajoutée puis vidée)', function () {
      assertDeepEqual(B()({ Bailleur: 'InnovationS', Bailleur_2: 'Idex' }), ['InnovationS']);
    });
    it('une OPE suivante avec montant compte, même sans commentaire ni ligne', function () {
      assertDeepEqual(B()({ Bailleur: 'InnovationS', Bailleur_2: 'Idex', c2026_M10_Fonctionnement_2: 500 }), ['InnovationS', 'Idex']);
    });
  });
})();
