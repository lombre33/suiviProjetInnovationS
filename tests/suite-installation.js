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
      const emptyPanel = panelIn('install-col-diese', 'En attente DR'); // aucun projet DIESE n'est à cette étape
      assertTrue(!!emptyPanel, 'le volet "En attente DR" doit exister côté DIESE');
      assertTrue(emptyPanel.classList.contains('is-collapsed'), 'un volet vide doit démarrer replié');
      const filledPanel = panelIn('install-col-non_classe', 'En attente DR');
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
        assertTrue(!!cardByAcronym(panelIn('install-col-non_classe', 'En attente DR'), acr),
          `${acr} (sans ligne OPE, Statut_installation_fonds vide) doit être dans "Sans ligne OPE" / "En attente DR"`);
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
        '1) En attente DR', '2) Ouverture demandée à la DF', '3) Installé', '4) Reliquat à traiter', '5) Clôturer'
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

    it('une ligne OPE sans numéro mais avec sa structure reste classée et s\'affiche « N° OPE à venir — chez … »', async function () {
      await loadFixtureState();
      const lignes = window.CoreState.getTable('Lignes_OPE').map(l => l.id === 3 ? { ...l, N_OPE: '' } : l);
      window.CoreState.setTable('Lignes_OPE', lignes);
      window.renderInstallation();
      const card = cardByAcronym(panelIn('install-col-diese', 'Installé'), 'NOTIFY');
      assertTrue(!!card, 'la structure suffit à classer la carte côté DIESE');
      assertEqual(card.querySelector('.install-chip-ope').textContent, 'N° OPE à venir — chez DIESE');
      assertTrue(!!card.querySelector('[data-open-ope]'), 'la pastille ouvre toujours la modale OPE, pour y renseigner le numéro');
    });

    it('sans action renseignée, aucune pastille action (même avec une ligne OPE, cf. INNOVX)', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'INNOVX');
      assertFalse(!!card.querySelector('.install-chip-action'), 'Action_Ligne_OPE_a_faire vide => pas de pastille action');
    });

    it('sans ligne OPE, pastille sobre "Aucune ligne OPE" (jamais aucune pastille)', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('install-col-non_classe', 'En attente DR'), 'CONVENTIX');
      assertFalse(!!card.querySelector('.install-chip-action'), 'Action_Ligne_OPE_a_faire vide => pas de pastille action');
      const opeChip = card.querySelector('.install-chip-ope');
      assertEqual(opeChip.textContent, 'Aucune ligne OPE');
      assertTrue(opeChip.classList.contains('is-muted'));
    });

    it('affiche en haut de la carte la bulle du programme, avant l\'acronyme', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'INNOVX');
      const bubble = card.querySelector('.install-card-top .install-chip-programme');
      assertTrue(!!bubble, 'la carte doit afficher une bulle avec le nom du programme');
      assertEqual(bubble.textContent, 'Programme A');
      const head = card.querySelector('.install-card-head');
      assertTrue(!!(bubble.compareDocumentPosition(head) & Node.DOCUMENT_POSITION_FOLLOWING), 'la bulle doit précéder la ligne acronyme/étape');
    });

    it('marque d\'une pastille "Convention" les seuls projets en convention de reversement', async function () {
      await loadFixtureState();
      const withConvention = cardByAcronym(panelIn('install-col-non_classe', 'En attente DR'), 'CONVENTIX');
      const mark = withConvention.querySelector('.install-card-top .install-chip-convention');
      assertTrue(!!mark, 'CONVENTIX (Convention_de_reversement cochée) doit porter la marque convention');
      assertEqual(mark.textContent, 'Convention');
      assertEqual(mark.getAttribute('title'), 'Convention de reversement');
      const without = cardByAcronym(panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'INNOVX');
      assertFalse(!!without.querySelector('.install-chip-convention'), 'INNOVX (sans convention) ne porte pas la marque');
    });

    it('sans programme ni convention, la carte n\'a pas de ligne de tête vide', async function () {
      await loadFixtureState();
      const projects = window.CoreState.getTable('Projets');
      const innovx = projects.find(p => p.Acronyme === 'INNOVX');
      innovx.Programme = 0;
      window.renderInstallation();
      const card = cardByAcronym(panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'INNOVX');
      assertFalse(!!card.querySelector('.install-card-top'), 'ni bulle ni marque => pas de ligne de tête');
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

    // Revue de bugs du 10/11/2026 : la garde « inchangé » comparait à la valeur du dernier RENDU, que l'écriture ne
    // refait pas : A → B (enregistré) puis B → A passait pour « inchangé » et B restait dans Grist.
    it('revenir à la valeur d\'origine après un premier enregistrement est bien enregistré (A → B → A)', async function () {
      await loadFixtureState();
      const textarea = cardByAcronym(panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'INNOVX').querySelector('[data-install-comment]');
      assertEqual(textarea.value, '', 'départ : commentaire vide');
      setValue(textarea, 'Relance DF');
      fire(textarea, 'blur');
      await wait(0);
      setValue(textarea, '');
      fire(textarea, 'blur');
      await wait(0);
      const writes = window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && c.table === 'Projets' && 'Commentaire_ligne_OPE' in c.fields);
      assertDeepEqual(writes.map(c => c.fields.Commentaire_ligne_OPE), ['Relance DF', ''], 'le retour à vide doit s\'écrire aussi');
    });

    it('un simple passage dans le champ sans modification n\'écrit rien', async function () {
      await loadFixtureState();
      const textarea = cardByAcronym(panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'INNOVX').querySelector('[data-install-comment]');
      fire(textarea, 'blur');
      await wait(0);
      assertEqual(window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && 'Commentaire_ligne_OPE' in c.fields).length, 0);
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
      const chip = document.querySelector('#install-hidden-panels [data-restore-install-panel="ailleurs:1"]');
      assertTrue(!!chip && chip.textContent.includes('Ouverture demandée à la DF'), 'une puce "Ouverture demandée à la DF" doit apparaître');
      assertTrue(!!chip.querySelector('svg'), 'la puce de restauration doit afficher une icône (œil ouvert), pas un "+" textuel');
      chip.dispatchEvent(new MouseEvent('click', { bubbles: true })); // restore, reset pour les autres tests
      assertTrue(!!panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'le volet doit réapparaître après restauration');
    });
  });

  describe('Installation des fonds — volets masqués : puces de restauration dans le bandeau de filtres (12/11/2026)', function () {
    const chipLabels = () => Array.from(document.querySelectorAll('#install-hidden-panels [data-restore-install-panel]')).map(btn => btn.textContent);
    const hide = (colId, label) => panelIn(colId, label).querySelector('[data-hide-install-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    it('une seule rangée de puces, dans le bandeau de filtres, pour les 3 colonnes ; plus aucune rangée par colonne', async function () {
      await loadFixtureState();
      const container = document.getElementById('install-hidden-panels');
      assertTrue(!!container.closest('.install-filters'), 'les puces doivent se loger dans le bandeau de filtres existant, pas dans une nouvelle ligne');
      assertTrue(container.hidden, 'sans volet masqué, la rangée est cachée');
      ['diese', 'ailleurs', 'non_classe'].forEach(side =>
        assertEqual(document.getElementById(`install-hidden-${side}`), null, `plus de rangée de puces dans la colonne ${side}`));
    });

    it('vue « Toutes » : la puce précise la colonne (« Ailleurs · Installé ») ; une colonne seule : l\'étape seule', async function () {
      await loadFixtureState();
      hide('install-col-diese', 'Installé');
      hide('install-col-ailleurs', 'Ouverture demandée à la DF');
      assertFalse(document.getElementById('install-hidden-panels').hidden, 'la rangée apparaît dès qu\'un volet est masqué');
      assertDeepEqual(chipLabels(), ['DIESE · Installé', 'Ailleurs · Ouverture demandée à la DF'], 'colonnes dans l\'ordre de la page, avec leur nom');

      fireMouse(document.querySelector('[data-install-tab="ailleurs"]'), 'click');
      assertDeepEqual(chipLabels(), ['Ouverture demandée à la DF'], 'une seule colonne en vue : seules ses puces, sans préfixe');

      // Nettoyage : tout réafficher pour ne pas polluer les tests suivants.
      fireMouse(document.querySelector('[data-install-tab="all"]'), 'click');
      document.querySelector('#install-hidden-panels [data-restore-install-panel="ailleurs:1"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      assertTrue(!!panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'la puce restaure le volet');
      document.querySelector('#install-hidden-panels [data-restore-install-panel="diese:2"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      assertTrue(document.getElementById('install-hidden-panels').hidden, 'plus aucun volet masqué : la rangée se cache de nouveau');
    });
  });

  describe('Installation des fonds — menu d\'étape sur la carte (12/11/2026, en plus du glisser-déposer)', function () {
    const statusSelect = (colId, label, acronym) => cardByAcronym(panelIn(colId, label), acronym).querySelector('[data-install-status]');

    it('chaque carte a un menu des 5 étapes, sur l\'étape actuelle (statut vide = 1re étape)', async function () {
      await loadFixtureState();
      const innovx = statusSelect('install-col-ailleurs', 'Ouverture demandée à la DF', 'INNOVX');
      assertDeepEqual(Array.from(innovx.options).map(option => option.textContent),
        ['En attente DR', 'Ouverture demandée à la DF', 'Installé', 'Reliquat à traiter', 'Clôturer']);
      assertEqual(innovx.value, '1');
      assertEqual(statusSelect('install-col-non_classe', 'En attente DR', 'CONVENTIX').value, '0');
    });

    it('choisir une autre étape écrit le libellé Grist exact et déplace la carte aussitôt', async function () {
      await loadFixtureState();
      const select = statusSelect('install-col-ailleurs', 'Ouverture demandée à la DF', 'INNOVX');
      select.value = '3';
      fire(select, 'change');
      await wait(0);
      const writes = installWrites();
      assertEqual(writes.length, 1, 'une seule écriture');
      assertEqual(writes[0].fields.Statut_installation_fonds, '4) Reliquat à traiter', 'valeur Grist exacte, avec le préfixe "4) "');
      assertTrue(!!cardByAcronym(panelIn('install-col-ailleurs', 'Reliquat à traiter'), 'INNOVX'), 'INNOVX doit être dans le nouveau volet');
      assertFalse(!!cardByAcronym(panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'INNOVX'), 'INNOVX ne doit plus être dans l\'ancien volet');
      assertEqual(statusSelect('install-col-ailleurs', 'Reliquat à traiter', 'INNOVX').value, '3', 'le menu de la carte déplacée montre la nouvelle étape');
    });

    it('un projet sans ligne OPE change d\'étape par le menu, dans sa propre colonne', async function () {
      await loadFixtureState();
      const select = statusSelect('install-col-non_classe', 'En attente DR', 'CONVENTIX');
      select.value = '2';
      fire(select, 'change');
      await wait(0);
      assertEqual(installWrites()[0].fields.Statut_installation_fonds, '3) Installé');
      assertEqual(installWrites()[0].id, 12, 'CONVENTIX (id 12)');
      assertTrue(!!cardByAcronym(panelIn('install-col-non_classe', 'Installé'), 'CONVENTIX'));
    });

    it('rechoisir l\'étape en cours n\'écrit rien', async function () {
      await loadFixtureState();
      const select = statusSelect('install-col-ailleurs', 'Ouverture demandée à la DF', 'INNOVX');
      select.value = '1';
      fire(select, 'change');
      await wait(0);
      assertEqual(installWrites().length, 0);
    });

    it('un échec d\'écriture ramène la carte et son menu à l\'étape enregistrée, et le dit', async function () {
      await loadFixtureState();
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async () => { throw new Error('boom'); };
      try {
        const select = statusSelect('install-col-ailleurs', 'Ouverture demandée à la DF', 'INNOVX');
        select.value = '3';
        fire(select, 'change');
        await wait(0);
      } finally { window.grist.docApi.applyUserActions = original; }
      assertTrue(!!cardByAcronym(panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'INNOVX'), 'INNOVX doit rester à son étape');
      assertEqual(statusSelect('install-col-ailleurs', 'Ouverture demandée à la DF', 'INNOVX').value, '1', 'le menu ne doit pas afficher une étape non enregistrée');
      assertIncludes(document.getElementById('toast').textContent, 'boom');
    });
  });

  describe('Installation des fonds — clic sur le nom de l\'OPE : modale de la ligne OPE (12/11/2026)', function () {
    const opeModal = () => document.getElementById('cp-ope-modal');
    const innovxCard = () => cardByAcronym(panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'INNOVX');

    it('la pastille OPE est un bouton qui ouvre la modale de cette ligne, pré-remplie', async function () {
      await loadFixtureState();
      const chip = innovxCard().querySelector('[data-open-ope]');
      assertEqual(chip.tagName, 'BUTTON');
      assertEqual(chip.dataset.openOpe, '1', 'Lignes_OPE#1');
      fireMouse(chip, 'click');
      assertTrue(!!opeModal(), 'la modale OPE doit s\'ouvrir');
      assertEqual(opeModal().querySelector('h2').textContent, 'Modifier la ligne OPE');
      assertEqual(opeModal().querySelector('#cpo-nope').value, 'OPE-2026-001');
      assertEqual(opeModal().querySelector('#cpo-structure').value, '1', 'installée chez LAB1');
    });

    it('enregistrer met la carte à jour, et la change de colonne si la ligne est désormais installée chez DIESE', async function () {
      await loadFixtureState();
      fireMouse(innovxCard().querySelector('[data-open-ope]'), 'click');
      setValue(opeModal().querySelector('#cpo-nope'), 'OPE-2026-001-bis');
      opeModal().querySelector('#cpo-structure').value = '3';
      await opeModal().querySelector('[data-cp-save]').onclick();

      const call = window.__TEST_CALLS__.find(c => c.type === 'UpdateRecord' && c.table === 'Lignes_OPE');
      assertTrue(!!call, 'doit écrire sur Lignes_OPE');
      assertEqual(call.id, 1);
      assertDeepEqual(call.fields, { N_OPE: 'OPE-2026-001-bis', installe_chez: 3 });
      assertFalse(!!opeModal(), 'la modale se ferme');
      assertFalse(!!cardByAcronym(panelIn('install-col-ailleurs', 'Ouverture demandée à la DF'), 'INNOVX'), 'INNOVX quitte la colonne Ailleurs');
      const moved = cardByAcronym(panelIn('install-col-diese', 'Ouverture demandée à la DF'), 'INNOVX');
      assertTrue(!!moved, 'INNOVX passe dans la colonne DIESE, à la même étape');
      assertEqual(moved.querySelector('.install-chip-ope').textContent, 'OPE n°OPE-2026-001-bis — chez DIESE');
    });

    it('annuler ne change rien', async function () {
      await loadFixtureState();
      fireMouse(innovxCard().querySelector('[data-open-ope]'), 'click');
      setValue(opeModal().querySelector('#cpo-nope'), 'AUTRE');
      opeModal().querySelector('[data-cp-cancel]').onclick();
      assertFalse(!!opeModal());
      assertEqual(window.__TEST_CALLS__.length, 0, 'aucun appel Grist');
      assertEqual(innovxCard().querySelector('.install-chip-ope').textContent, 'OPE n°OPE-2026-001 — chez LAB1');
    });

    it('un projet sans ligne OPE n\'a pas de pastille à ouvrir', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('install-col-non_classe', 'En attente DR'), 'CONVENTIX');
      assertFalse(!!card.querySelector('[data-open-ope]'), 'rien à ouvrir sans ligne OPE');
      assertEqual(card.querySelector('.install-chip-ope').tagName, 'SPAN');
    });
  });

  describe('Installation des fonds — 1re étape renommée « En attente DR » (12/11/2026)', function () {
    const OLD_CHOICES = ['1) En attente ouverture', '2) Ouverture demandée à la DF', '3) Installé', '4) Reliquat à traiter', '5) Clôturer'];

    it('un projet resté sous l\'ancien libellé reste à la 1re étape, puis est réécrit dans Grist (une seule fois)', async function () {
      await loadFixtureState();
      const innovx = window.CoreState.getTable('Projets').find(p => p.Acronyme === 'INNOVX');
      innovx.Statut_installation_fonds = '1) En attente ouverture';
      window.renderInstallation();
      assertTrue(!!cardByAcronym(panelIn('install-col-ailleurs', 'En attente DR'), 'INNOVX'), 'même sans réécriture, INNOVX est rangé à la 1re étape');

      await window.loadInstallationUserPreferences();

      assertEqual(installWrites().length, 1, 'une seule écriture, pour ce seul projet');
      assertEqual(installWrites()[0].id, 10);
      assertEqual(installWrites()[0].fields.Statut_installation_fonds, '1) En attente DR');
      assertEqual(innovx.Statut_installation_fonds, '1) En attente DR', 'données chargées à jour');

      await window.loadInstallationUserPreferences();
      assertEqual(installWrites().length, 1, 'plus rien à reprendre au chargement suivant');
    });

    it('la liste de choix de la colonne dans Grist est mise à jour (couleurs conservées), une seule fois', async function () {
      window.__mockSetTable('_grist_Tables', { id: [1], tableId: ['Projets'] });
      window.__mockSetTable('_grist_Tables_column', {
        id: [5], parentId: [1], colId: ['Statut_installation_fonds'], type: ['Choice'], description: [''],
        widgetOptions: [JSON.stringify({ choices: OLD_CHOICES, choiceOptions: { '3) Installé': { fillColor: '#00FF00' } } })]
      });
      await window.CoreGrist.loadColumnDescriptions();
      await loadFixtureState();

      await window.loadInstallationUserPreferences();

      const metaWrites = () => window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && c.table === '_grist_Tables_column');
      assertEqual(metaWrites().length, 1, 'une écriture sur la métadonnée de la colonne');
      assertEqual(metaWrites()[0].id, 5);
      const options = JSON.parse(metaWrites()[0].fields.widgetOptions);
      assertDeepEqual(options.choices, ['1) En attente DR', '2) Ouverture demandée à la DF', '3) Installé', '4) Reliquat à traiter', '5) Clôturer']);
      assertEqual(options.choiceOptions['3) Installé'].fillColor, '#00FF00', 'les couleurs déjà choisies sont conservées');

      await window.loadInstallationUserPreferences();
      assertEqual(metaWrites().length, 1, 'liste déjà à jour : pas de nouvelle écriture');
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
      fireMouse(document.querySelector('[data-install-tab="all"]'), 'click'); // en vue « Ailleurs », la puce DIESE n'est pas affichée
      document.querySelector('#install-hidden-panels [data-restore-install-panel="diese:2"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
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
