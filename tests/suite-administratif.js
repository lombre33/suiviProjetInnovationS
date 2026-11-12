/**
 * Non-regression suite: page Administratif (js/pages/page-administratif.js).
 * Fixtures (tests/fixtures.js): INNOVX/NOTIFY/SIGNEX have a Notifications row,
 * FINANCX/COURSIX/INCONNUX deliberately don't (must appear in no Notifications
 * panel). CONVENTIX has 2 partners (CNRS, INSERM) + UB; SIGNEX has 1 (UBX) + UB.
 */
(function () {
  'use strict';

  // L'onglet Conventions ne liste que les projets dont Convention_de_reversement est coché
  // (cf. needsConvention). La plupart des tests de cette suite manipulent des projets
  // quelconques des fixtures : on les coche tous, sauf demande contraire (`keepFlags`,
  // cases telles que dans les fixtures — seuls CONVENTIX et SIGNEX ont une convention).
  async function loadTables({ keepFlags } = {}) {
    const tables = await window.CoreGrist.loadAllTables();
    if (!keepFlags) tables.Projets.forEach(project => { project.Convention_de_reversement = true; });
    return tables;
  }

  async function loadFixtureState() {
    const tables = await loadTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    window.renderAdministratif();
  }

  function panelIn(colId, label) {
    return Array.from(document.querySelectorAll(`#${colId} .admin-panel`))
      .find(section => section.querySelector('.admin-panel-header h4')?.textContent === label);
  }

  function cardByAcronym(panel, acronym) {
    return panel && Array.from(panel.querySelectorAll('.admin-card'))
      .find(card => card.querySelector('.admin-card-identity .project-acronym')?.textContent === acronym);
  }

  // Doit rester le premier describe/it du fichier : c'est le tout premier rendu
  // de la page Administratif dans la suite, celui qui fixe le repli initial de
  // chaque volet (l'état persiste ensuite entre les tests, cf. page-administratif.js).
  describe('Administratif — un volet vide démarre replié', function () {
    it('un volet sans aucun projet est replié dès le premier rendu ; un volet non vide reste déplié', async function () {
      await loadFixtureState();
      const emptyPanel = panelIn('admin-col-notif', 'Prette pour CTO'); // aucune fiche Notifications ne pointe ici
      assertTrue(!!emptyPanel, 'le volet "Prette pour CTO" doit exister');
      assertTrue(emptyPanel.classList.contains('is-collapsed'), 'un volet vide doit démarrer replié');
      const filledPanel = panelIn('admin-col-notif', 'Information projet saisies');
      assertFalse(filledPanel.classList.contains('is-collapsed'), 'un volet avec des projets ne doit pas démarrer replié');
    });
  });

  describe('Administratif — classement par volet (Notifications)', function () {
    it('place chaque projet dans le volet correspondant à notifications_Statut', async function () {
      await loadFixtureState();
      assertTrue(!!cardByAcronym(panelIn('admin-col-notif', 'Information projet saisies'), 'INNOVX'),
        'INNOVX (1) Information projet saisies) doit être dans le volet correspondant');
      assertTrue(!!cardByAcronym(panelIn('admin-col-notif', 'envoyée pour signature VP'), 'NOTIFY'),
        'NOTIFY (5) envoyée pour signature VP) doit être dans le volet correspondant');
    });

    it('un projet sans fiche Notifications n\'apparaît dans aucun volet Notifications', async function () {
      await loadFixtureState();
      const acronyms = Array.from(document.querySelectorAll('#admin-col-notif .admin-card .project-acronym')).map(el => el.textContent);
      ['FINANCX', 'COURSIX', 'INCONNUX'].forEach(acr =>
        assertFalse(acronyms.includes(acr), `${acr} (pas de fiche Notifications) ne doit apparaître dans aucun volet`));
    });

    it('le dernier volet (Archivee) affiche un badge "Archivée" et aucun bouton étape suivante', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('admin-col-notif', 'Archivee'), 'SIGNEX');
      assertTrue(!!card, 'SIGNEX (8) Archivee) doit être dans le dernier volet');
      assertEqual(card.querySelector('.admin-done-badge')?.textContent, 'Archivée');
      assertFalse(!!card.querySelector('[data-advance-notif]'), 'pas de bouton étape suivante sur le dernier statut');
    });
  });

  describe('Administratif — classement par volet (Conventions)', function () {
    it('place chaque projet dans le volet correspondant à Conventions_statut', async function () {
      await loadFixtureState();
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX'),
        'INNOVX (1) Convention en redaction) doit être dans le volet correspondant');
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en signature'), 'CONVENTIX'),
        'CONVENTIX (3) Convention en signature) doit être dans le volet correspondant');
    });

    it('le dernier volet (signée) affiche un badge "Signée" et aucun bouton étape suivante', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('admin-col-conv', 'Convention signée de toutes les parties'), 'SIGNEX');
      assertTrue(!!card, 'SIGNEX (4) doit être dans le dernier volet');
      assertEqual(card.querySelector('.admin-done-badge')?.textContent, 'Signée');
      assertFalse(!!card.querySelector('.admin-advance-btn'), 'pas de bouton étape suivante sur le dernier statut');
    });

    it('n\'affiche que l\'acronyme en identité, pas le nom complet du projet', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('admin-col-conv', 'Convention en signature'), 'CONVENTIX');
      assertFalse(!!card.querySelector('.admin-card-title'), 'pas de titre "nom complet" sur la carte Conventions');
      assertFalse(card.textContent.includes('Projet Convention'), 'le nom complet du projet ne doit plus apparaître sur la carte');
    });
  });

  describe('Administratif — partenaires (barres de progression par statut)', function () {
    it('affiche l\'UB en premier puis un partenaire par référence Etablissement, pas de progression = "Non relu"', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('admin-col-conv', 'Convention en signature'), 'CONVENTIX');
      const pills = card.querySelectorAll('.admin-partner-pill');
      assertEqual(pills.length, 3, 'CONVENTIX doit avoir 3 pastilles : UB + CNRS + INSERM');
      assertEqual(pills[0].querySelector('.admin-partner-name').textContent, 'UB', 'UB doit être la première pastille');
      // partenaire_2 (INSERM) n'a pas de colonne renseignée → doit retomber sur
      // "Non relu" par défaut (barre à 0%), pas planter.
      assertTrue(pills[2].title.includes('Non relu'), 'INSERM sans statut renseigné doit afficher "Non relu"');
      assertEqual(pills[2].querySelector('.admin-partner-fill').style.width, '0%', 'barre de progression vide pour "Non relu"');
    });

    it('un clic sur une pastille fait avancer le statut du partenaire et écrit la colonne Grist exacte', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('admin-col-conv', 'Convention en signature'), 'CONVENTIX');
      const insermPill = card.querySelectorAll('.admin-partner-pill')[2];
      fireMouse(insermPill, 'click');
      await wait(0);
      const call = window.__TEST_CALLS__.find(c => c.type === 'UpdateRecord' && c.table === 'Projets' && c.fields.convention_statut_partenaire_2);
      assertTrue(!!call, 'doit écrire convention_statut_partenaire_2 dans Projets');
      assertEqual(call.fields.convention_statut_partenaire_2, 'Relu', 'Non relu → Relu au premier clic');
    });
  });

  describe('Administratif — écriture Grist (bouton "Étape suivante")', function () {
    it('avance notifications_Statut sur la table Notifications (pas sur Projets) avec la chaîne exacte', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('admin-col-notif', 'Information projet saisies'), 'INNOVX');
      fireMouse(card.querySelector('[data-advance-notif]'), 'click');
      await wait(0);
      const call = window.__TEST_CALLS__.find(c => c.type === 'UpdateRecord' && c.table === 'Notifications');
      assertTrue(!!call, 'doit écrire sur la table Notifications');
      assertEqual(call.fields.notifications_Statut, '2) Notification_relecture', 'valeur Grist exacte, avec le préfixe "2) "');
      assertTrue(!!cardByAcronym(panelIn('admin-col-notif', 'Notification_relecture'), 'INNOVX'), 'INNOVX doit être passé au volet suivant');
    });

    it('enregistre le commentaire libre partagé sur comentaire_general_Suivi_projet', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('admin-col-notif', 'Information projet saisies'), 'INNOVX');
      const textarea = card.querySelector('[data-comment-project]');
      setValue(textarea, 'Relance porteur le 20/09.');
      fire(textarea, 'blur');
      await wait(0);
      const call = window.__TEST_CALLS__.find(c => c.type === 'UpdateRecord' && c.table === 'Projets' && 'comentaire_general_Suivi_projet' in c.fields);
      assertTrue(!!call, 'doit écrire comentaire_general_Suivi_projet sur Projets');
      assertEqual(call.fields.comentaire_general_Suivi_projet, 'Relance porteur le 20/09.');
    });

    // Revue de bugs du 10/11/2026 : le commentaire était réécrit à chaque sortie du champ, même inchangé.
    it('ne réécrit pas le commentaire sur un simple passage dans le champ', async function () {
      await loadFixtureState();
      const textarea = cardByAcronym(panelIn('admin-col-notif', 'Information projet saisies'), 'INNOVX').querySelector('[data-comment-project]');
      fire(textarea, 'blur');
      await wait(0);
      assertEqual(window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && 'comentaire_general_Suivi_projet' in c.fields).length, 0, 'inchangé → aucune écriture');
    });

    it('revenir à la valeur d\'origine après un premier enregistrement est bien enregistré (A → B → A)', async function () {
      await loadFixtureState();
      const textarea = cardByAcronym(panelIn('admin-col-notif', 'Information projet saisies'), 'INNOVX').querySelector('[data-comment-project]');
      setValue(textarea, 'Relance porteur');
      fire(textarea, 'blur');
      await wait(0);
      setValue(textarea, '');
      fire(textarea, 'blur');
      await wait(0);
      const writes = window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && 'comentaire_general_Suivi_projet' in c.fields);
      assertDeepEqual(writes.map(c => c.fields.comentaire_general_Suivi_projet), ['Relance porteur', ''], 'le retour à vide doit s\'écrire aussi');
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
  const convWrites = () => window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && c.table === 'Projets' && 'Conventions_statut' in c.fields);
  const epochOf = iso => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 1000);

  describe('Administratif — Conventions : 4 étapes et glisser-déposer entre volets', function () {
    it('affiche les 4 nouvelles étapes, dans l\'ordre, sans bouton "Suivant" (Notifications garde le sien)', async function () {
      await loadFixtureState();
      const labels = Array.from(document.querySelectorAll('#admin-col-conv .admin-panel-header h4')).map(h => h.textContent);
      assertDeepEqual(labels, ['Convention en redaction', 'Convention en relecture', 'Convention en signature', 'Convention signée de toutes les parties']);
      assertEqual(document.querySelectorAll('#admin-col-conv .admin-advance-btn').length, 0, 'plus aucun bouton "Suivant" côté Conventions');
      assertTrue(document.querySelectorAll('#admin-col-notif .admin-advance-btn').length > 0, 'le bouton "Suivant" reste côté Notifications');
    });

    it('glisser une carte vers un autre volet écrit le libellé Grist exact sur Projets et déplace la carte', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX');
      await dragCardTo(card, panelIn('admin-col-conv', 'Convention en relecture'));
      const writes = convWrites();
      assertEqual(writes.length, 1, 'une seule écriture');
      assertEqual(writes[0].fields.Conventions_statut, '2) Convention en relecture', 'valeur Grist exacte, avec le préfixe "2) "');
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en relecture'), 'INNOVX'), 'INNOVX doit être dans le nouveau volet');
      assertFalse(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX'), 'INNOVX ne doit plus être dans l\'ancien volet');
    });

    it('permet de reculer ou de sauter des étapes (pas seulement l\'étape suivante)', async function () {
      await loadFixtureState();
      await dragCardTo(cardByAcronym(panelIn('admin-col-conv', 'Convention en signature'), 'CONVENTIX'), panelIn('admin-col-conv', 'Convention en redaction'));
      assertEqual(convWrites()[0].fields.Conventions_statut, '1) Convention en redaction', 'recul de 3) à 1)');
      await dragCardTo(cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'CONVENTIX'), panelIn('admin-col-conv', 'Convention signée de toutes les parties'));
      assertEqual(convWrites()[1].fields.Conventions_statut, '4) Convention signée de toutes les parties', 'saut de 1) à 4)');
    });

    it('déposer une carte sur son propre volet n\'écrit rien', async function () {
      await loadFixtureState();
      await dragCardTo(cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX'), panelIn('admin-col-conv', 'Convention en redaction'));
      assertEqual(convWrites().length, 0, 'aucune écriture');
      assertFalse(!!document.querySelector('#admin-col-conv .is-dragging, #admin-col-conv .is-drop-target'), 'aucun état de glisser résiduel');
    });

    it('autorise le dépôt sur un volet (dragover annulé) uniquement pendant le glisser d\'une carte, et signale le volet visé', async function () {
      await loadFixtureState();
      const panel = panelIn('admin-col-conv', 'Convention en relecture');
      const stray = dragEvent('dragover', new DataTransfer());
      panel.dispatchEvent(stray);
      assertFalse(stray.defaultPrevented, 'sans glisser de carte en cours, le dépôt ne doit pas être autorisé (ex. fichier externe)');

      const handle = cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX').querySelector('[data-drag-project]');
      const dt = new DataTransfer();
      handle.dispatchEvent(dragEvent('dragstart', dt));
      const over = dragEvent('dragover', dt);
      panel.dispatchEvent(over);
      assertTrue(over.defaultPrevented, 'pendant le glisser, dragover doit être annulé pour autoriser le dépôt');
      assertTrue(panel.classList.contains('is-drop-target'), 'le volet visé doit être mis en évidence');
      handle.dispatchEvent(dragEvent('dragend', dt));
      assertFalse(panel.classList.contains('is-drop-target'), 'la mise en évidence disparaît en fin de glisser');
    });

    it('un glisser qui ne vient pas d\'une carte Conventions (texte, fichier) n\'est jamais accepté, même après un glisser de carte interrompu', async function () {
      await loadFixtureState();
      const handle = cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX').querySelector('[data-drag-project]');
      handle.dispatchEvent(dragEvent('dragstart', new DataTransfer()));
      window.renderAdministratif(); // la source du glisser est détachée : son dragend n'atteindra jamais la racine
      const foreign = new DataTransfer();
      foreign.setData('text/plain', '11');
      const panel = panelIn('admin-col-conv', 'Convention en relecture');
      const over = dragEvent('dragover', foreign);
      panel.dispatchEvent(over);
      assertFalse(over.defaultPrevented, 'un glisser étranger ne doit pas être autorisé');
      panel.dispatchEvent(dragEvent('drop', foreign));
      await wait(0);
      assertEqual(convWrites().length, 0, 'et un dépôt étranger n\'écrit rien');
    });

    it('un volet replié reste une cible de dépôt valide', async function () {
      await loadFixtureState();
      const target = panelIn('admin-col-conv', 'Convention en relecture'); // vide → replié par défaut
      assertTrue(target.classList.contains('is-collapsed'), 'prérequis : volet vide replié');
      await dragCardTo(cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX'), target);
      assertEqual(convWrites().length, 1, 'le dépôt sur un volet replié doit fonctionner');
    });

    it('seuls les volets Conventions sont des cibles de dépôt, et seules les cartes Conventions ont une poignée', async function () {
      await loadFixtureState();
      assertEqual(document.querySelectorAll('#admin-col-notif [data-drop-panel]').length, 0);
      assertEqual(document.querySelectorAll('#admin-col-notif [data-drag-project]').length, 0);
      assertEqual(document.querySelectorAll('#admin-col-conv [data-drop-panel]').length, 4);
    });

    it('un échec d\'écriture Grist laisse la carte à sa place', async function () {
      await loadFixtureState();
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async () => { throw new Error('boom'); };
      try {
        await dragCardTo(cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX'), panelIn('admin-col-conv', 'Convention en relecture'));
      } finally { window.grist.docApi.applyUserActions = original; }
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX'), 'INNOVX doit rester dans l\'étape d\'origine');
    });

    it('reconnaît les anciens libellés Choice (lignes Grist pas encore migrées) au lieu de faire disparaître le projet', async function () {
      const tables = await loadTables();
      const byAcronym = acr => tables.Projets.find(p => p.Acronyme === acr);
      byAcronym('INNOVX').Conventions_statut = '2) Convention Relecture Partenaire(s)';
      byAcronym('NOTIFY').Conventions_statut = '4) Convention en signature partenaire';
      byAcronym('FINANCX').Conventions_statut = '3) Convention en signature UB';
      byAcronym('SIGNEX').Conventions_statut = '5) Convention signée de toutes les parties';
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en relecture'), 'INNOVX'));
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en signature'), 'NOTIFY'));
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en signature'), 'FINANCX'));
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention signée de toutes les parties'), 'SIGNEX'));
    });
  });

  describe('Administratif — Conventions : reconnaissance tolérante de l\'étape', function () {
    it('un libellé sans numéro d\'étape (valeur par défaut Grist) est rangé dans l\'étape correspondante', async function () {
      const tables = await loadTables();
      tables.Projets.find(p => p.Acronyme === 'FINANCX').Conventions_statut = 'Convention en redaction';
      tables.Projets.find(p => p.Acronyme === 'COURSIX').Conventions_statut = 'convention EN RELECTURE';
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'FINANCX'));
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en relecture'), 'COURSIX'));
    });

    it('une valeur inconnue ou vide n\'affiche le projet nulle part et ne provoque aucune erreur (dont les noms de propriété d\'objet)', async function () {
      const tables = await loadTables();
      ['constructor', '__proto__', '', 'Autre chose'].forEach((value, i) => { tables.Projets[i].Conventions_statut = value; });
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      const acronyms = Array.from(document.querySelectorAll('#admin-col-conv .admin-card .project-acronym')).map(el => el.textContent);
      ['INNOVX', 'NOTIFY', 'CONVENTIX', 'FINANCX'].forEach(acr => assertFalse(acronyms.includes(acr), `${acr} (statut inconnu) ne doit apparaître dans aucun volet`));
    });
  });

  describe('Administratif — Conventions : champ "Next step"', function () {
    it('affiche, sous le commentaire, un second champ titré "Next step" alimenté par la colonne next_step', async function () {
      const tables = await loadTables();
      tables.Projets.find(p => p.Acronyme === 'INNOVX').next_step = 'Relancer le juridique';
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      const card = cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX');
      const fields = card.querySelectorAll('.admin-notes textarea');
      assertEqual(fields.length, 2, 'deux champs texte');
      assertTrue(fields[0].hasAttribute('data-comment-project'), 'le commentaire général vient en premier');
      assertTrue(fields[1].hasAttribute('data-nextstep-project'), 'Next step vient en dessous');
      assertEqual(fields[1].value, 'Relancer le juridique');
      assertTrue(card.querySelector('.admin-nextstep .admin-field-label').textContent.trim() === 'Next step', 'le champ porte le titre "Next step"');
    });

    it('enregistre next_step sur Projets à la sortie du champ, et seulement s\'il a changé', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX');
      const field = card.querySelector('[data-nextstep-project]');
      fire(field, 'blur');
      await wait(0);
      assertEqual(window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && 'next_step' in c.fields).length, 0, 'inchangé → aucune écriture');
      setValue(field, 'Signature prévue le 12/10');
      fire(field, 'blur');
      await wait(0);
      const call = window.__TEST_CALLS__.find(c => c.type === 'UpdateRecord' && 'next_step' in c.fields);
      assertTrue(!!call && call.table === 'Projets', 'doit écrire next_step sur Projets');
      assertEqual(call.fields.next_step, 'Signature prévue le 12/10');
    });

    // Revue de bugs du 10/11/2026 : la garde « inchangé » comparait à la valeur du dernier RENDU. Le champ n'est pas
    // reconstruit après l'écriture : A → B (enregistré) puis B → A passait pour « inchangé » et B restait dans Grist.
    it('revenir à la valeur d\'origine après un premier enregistrement est bien enregistré (A → B → A)', async function () {
      await loadFixtureState();
      const field = cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX').querySelector('[data-nextstep-project]');
      assertEqual(field.value, '', 'départ : next step vide');
      setValue(field, 'Relancer le juridique');
      fire(field, 'blur');
      await wait(0);
      setValue(field, '');
      fire(field, 'blur');
      await wait(0);
      const writes = window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && 'next_step' in c.fields);
      assertDeepEqual(writes.map(c => c.fields.next_step), ['Relancer le juridique', ''], 'les deux écritures doivent partir, dont le retour à vide');
      assertEqual(window.CoreState.getTable('Projets').find(p => p.Acronyme === 'INNOVX').next_step, '', 'valeur locale à jour');
    });

    it('un enregistrement qui échoue laisse le champ « modifié » : la sortie suivante réessaie', async function () {
      await loadFixtureState();
      const field = cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX').querySelector('[data-nextstep-project]');
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async () => { throw new Error('boom'); };
      setValue(field, 'Relancer le juridique');
      try {
        fire(field, 'blur');
        await wait(0);
      } finally { window.grist.docApi.applyUserActions = original; }
      fire(field, 'blur');
      await wait(0);
      assertEqual(window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && 'next_step' in c.fields).length, 1, 'le second blur réécrit la valeur');
    });

    it('n\'ajoute pas ce champ aux cartes Notifications', async function () {
      await loadFixtureState();
      assertEqual(document.querySelectorAll('#admin-col-notif [data-nextstep-project]').length, 0);
    });

    it('échappe le contenu de next_step (le texte reste du texte, aucune balise injectée)', async function () {
      const payload = '</textarea><img src=x onerror=alert(1)>';
      const tables = await loadTables();
      tables.Projets.find(p => p.Acronyme === 'INNOVX').next_step = payload;
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      const card = cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX');
      assertEqual(document.querySelectorAll('#admin-col-conv img').length, 0, 'aucune balise <img> injectée');
      assertEqual(card.querySelector('[data-nextstep-project]').value, payload, 'le contenu s\'affiche tel quel, comme du texte');
    });

    it('ne réécrit pas next_step sur un simple passage dans le champ, même si le navigateur normalise sa valeur (CRLF, saut de ligne initial)', async function () {
      const tables = await loadTables();
      tables.Projets.find(p => p.Acronyme === 'INNOVX').next_step = 'a\r\nb';
      tables.Projets.find(p => p.Acronyme === 'NOTIFY').next_step = '\nfoo';
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      ['INNOVX', 'NOTIFY'].forEach(acr => fire(cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), acr).querySelector('[data-nextstep-project]'), 'blur'));
      await wait(0);
      assertEqual(window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && 'next_step' in c.fields).length, 0, 'aucune écriture sans modification');
    });

    it('une écriture en cours n\'est pas écrasée par un rendu intermédiaire (la valeur locale est mise à jour avant la réponse de Grist)', async function () {
      await loadFixtureState();
      const original = window.grist.docApi.applyUserActions;
      let release;
      window.grist.docApi.applyUserActions = (actions) => new Promise(resolve => { release = () => resolve(original(actions)); });
      try {
        const field = cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX').querySelector('[data-nextstep-project]');
        setValue(field, 'Relancer le juridique');
        fire(field, 'blur');
        await wait(0);
        window.renderAdministratif(); // rendu pendant l'aller-retour Grist
        assertEqual(cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX').querySelector('[data-nextstep-project]').value, 'Relancer le juridique', 'le texte saisi ne doit pas disparaître');
        release();
        await wait(0);
      } finally { window.grist.docApi.applyUserActions = original; }
    });

    it('si l\'écriture échoue, l\'ancienne valeur est restaurée', async function () {
      await loadFixtureState();
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async () => { throw new Error('boom'); };
      try {
        const field = cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX').querySelector('[data-nextstep-project]');
        setValue(field, 'perdu');
        fire(field, 'blur');
        await wait(0);
        window.renderAdministratif();
      } finally { window.grist.docApi.applyUserActions = original; }
      assertEqual(cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX').querySelector('[data-nextstep-project]').value, '', 'retour à la valeur enregistrée');
    });
  });

  // ── Popover (dates de transmission, responsables) : posé sur <body>, hors du squelette de test ──
  const popoverEl = () => document.querySelector('.admin-popover');
  // Le toast n'est jamais vidé entre deux tests : un message d'un test précédent ferait passer
  // une assertion sur « message d'erreur affiché » même sans le moindre toast.
  const clearToast = () => { document.getElementById('toast').textContent = ''; };
  const closePopover = () => window.AdministratifConv.closePopover();
  const lastStageCard = acronym => cardByAcronym(panelIn('admin-col-conv', 'Convention signée de toutes les parties'), acronym);
  const transmitBtn = (card, kind) => card.querySelector(`[data-pop-anchor^="${kind}:"]`);
  const projectWrites = column => window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && column in c.fields);
  // Fige « aujourd'hui » (jour calendaire local) le temps d'un test.
  async function withClock(date, fn) {
    window.AdministratifUrgency.setClock(() => date);
    try { return await fn(); } finally { window.AdministratifUrgency.setClock(); }
  }
  async function pickDate(iso) {
    const input = popoverEl().querySelector('.admin-pop-date-input');
    setValue(input, iso);
    fire(input, 'change');
    await wait(0);
  }

  describe('Administratif — Conventions : « Transmise au porteur le » (icônes e-mail et papier, dernière étape uniquement)', function () {
    it('une seule phrase « Transmise au porteur le » suivie de deux icônes (e-mail, papier), sur les cartes de la dernière étape uniquement', async function () {
      await loadFixtureState();
      const card = lastStageCard('SIGNEX');
      assertEqual(card.querySelectorAll('.admin-transmit .admin-field-label').length, 1, 'une seule phrase');
      assertEqual(card.querySelector('.admin-transmit .admin-field-label').textContent.trim(), 'Transmise au porteur le');
      assertEqual(card.querySelectorAll('.admin-transmit-btn').length, 2, 'deux icônes');
      assertTrue(!!transmitBtn(card, 'mail') && !!transmitBtn(card, 'paper'));
      assertEqual(card.querySelector('.admin-done-badge').textContent, 'Signée');
      assertEqual(document.querySelectorAll('#admin-col-conv .admin-transmit').length, 1, 'absent de toutes les autres étapes');
      assertEqual(document.querySelectorAll('#admin-col-conv input[type="date"][data-transmise-project]').length, 0, 'plus de champ date en clair');
    });

    it('icône grise sans date, bleue avec la date affichée à côté une fois renseignée (chaque canal indépendant)', async function () {
      const tables = await loadTables();
      tables.Projets.find(p => p.Acronyme === 'SIGNEX').Transmise_signee_au_porteur_le = epochOf('2026-09-30');
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      const card = lastStageCard('SIGNEX');
      assertTrue(transmitBtn(card, 'mail').classList.contains('is-set'), 'e-mail renseigné : bleue');
      assertEqual(transmitBtn(card, 'mail').querySelector('.admin-transmit-date').textContent, '30/09/2026');
      assertIncludes(transmitBtn(card, 'mail').title, 'par e-mail le 30/09/2026');
      assertFalse(transmitBtn(card, 'paper').classList.contains('is-set'), 'papier vide : grise');
      assertFalse(!!transmitBtn(card, 'paper').querySelector('.admin-transmit-date'), 'pas de date affichée sans date');
      assertIncludes(transmitBtn(card, 'paper').title, 'Pas encore transmise sur papier');
    });

    it('un clic sur l\'icône e-mail ouvre la saisie de date ; choisir une date l\'enregistre dans la colonne historique (minuit UTC) et bleuit l\'icône', async function () {
      await loadFixtureState();
      fireMouse(transmitBtn(lastStageCard('SIGNEX'), 'mail'), 'click');
      assertTrue(!!popoverEl(), 'le popover de date s\'ouvre');
      assertEqual(popoverEl().querySelector('.admin-field-label').textContent, 'Transmise par e-mail le');
      assertFalse(!!popoverEl().querySelector('[data-pop-clear]'), 'rien à effacer sans date');
      await pickDate('2026-10-05');
      const writes = projectWrites('Transmise_signee_au_porteur_le');
      assertEqual(writes.length, 1);
      assertEqual(writes[0].table, 'Projets');
      assertEqual(writes[0].fields.Transmise_signee_au_porteur_le, epochOf('2026-10-05'));
      assertFalse(!!popoverEl(), 'le popover se referme une fois la date enregistrée');
      const mail = transmitBtn(lastStageCard('SIGNEX'), 'mail');
      assertTrue(mail.classList.contains('is-set'));
      assertEqual(mail.querySelector('.admin-transmit-date').textContent, '05/10/2026');
    });

    it('l\'icône papier écrit sa propre colonne, sans toucher à la date e-mail', async function () {
      await loadFixtureState();
      fireMouse(transmitBtn(lastStageCard('SIGNEX'), 'paper'), 'click');
      assertEqual(popoverEl().querySelector('.admin-field-label').textContent, 'Transmise sur papier le');
      await pickDate('2026-10-07');
      assertEqual(projectWrites('Transmise_signee_au_porteur_papier_le')[0].fields.Transmise_signee_au_porteur_papier_le, epochOf('2026-10-07'));
      assertEqual(projectWrites('Transmise_signee_au_porteur_le').length, 0, 'la date e-mail n\'est pas écrite');
      const card = lastStageCard('SIGNEX');
      assertTrue(transmitBtn(card, 'paper').classList.contains('is-set'));
      assertFalse(transmitBtn(card, 'mail').classList.contains('is-set'));
    });

    it('« Aujourd\'hui » enregistre le jour calendaire local, « Effacer » (proposé seulement s\'il y a une date) vide la colonne et regrise l\'icône', async function () {
      await loadFixtureState();
      await withClock(new Date(2026, 10, 3, 23, 50), async () => {
        fireMouse(transmitBtn(lastStageCard('SIGNEX'), 'mail'), 'click');
        fireMouse(popoverEl().querySelector('[data-pop-today]'), 'click');
        await wait(0);
      });
      assertEqual(projectWrites('Transmise_signee_au_porteur_le')[0].fields.Transmise_signee_au_porteur_le, epochOf('2026-11-03'));
      fireMouse(transmitBtn(lastStageCard('SIGNEX'), 'mail'), 'click');
      fireMouse(popoverEl().querySelector('[data-pop-clear]'), 'click');
      await wait(0);
      assertEqual(projectWrites('Transmise_signee_au_porteur_le')[1].fields.Transmise_signee_au_porteur_le, null);
      assertFalse(transmitBtn(lastStageCard('SIGNEX'), 'mail').classList.contains('is-set'), 'icône de nouveau grise');
    });

    it('ne réécrit pas la colonne à chaque frappe partielle de l\'année (0002, 0020, 0202) et ne se referme pas tant que la saisie n\'est pas plausible', async function () {
      await loadFixtureState();
      fireMouse(transmitBtn(lastStageCard('SIGNEX'), 'mail'), 'click');
      for (const partial of ['0002-05-10', '0020-05-10', '0202-05-10']) await pickDate(partial);
      assertEqual(projectWrites('Transmise_signee_au_porteur_le').length, 0, 'aucune écriture pour des années implausibles');
      assertTrue(!!popoverEl(), 'on peut finir de taper');
      await pickDate('2026-05-10');
      assertEqual(projectWrites('Transmise_signee_au_porteur_le').length, 1);
    });

    it('vider un segment à la main (valeur vide le temps de la saisie) n\'efface rien et ne ferme pas le popover', async function () {
      const tables = await loadTables();
      tables.Projets.find(p => p.Acronyme === 'SIGNEX').Transmise_signee_au_porteur_le = epochOf('2026-09-30');
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      fireMouse(transmitBtn(lastStageCard('SIGNEX'), 'mail'), 'click');
      await pickDate('');
      assertEqual(projectWrites('Transmise_signee_au_porteur_le').length, 0);
      assertTrue(!!popoverEl());
    });

    it('le popover se referme au second clic sur l\'icône, à Échap, à un clic à l\'extérieur et au changement d\'onglet — jamais au clic dedans', async function () {
      await loadFixtureState();
      const open = () => fireMouse(transmitBtn(lastStageCard('SIGNEX'), 'mail'), 'click');
      open(); assertTrue(!!popoverEl());
      open(); assertFalse(!!popoverEl(), 'second clic : referme');
      open();
      fireMouse(popoverEl().querySelector('.admin-pop-date-input'), 'mousedown');
      assertTrue(!!popoverEl(), 'un clic dans le popover ne le ferme pas');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assertFalse(!!popoverEl(), 'Échap');
      open();
      fireMouse(document.body, 'mousedown');
      assertFalse(!!popoverEl(), 'clic à l\'extérieur');
      open();
      document.querySelector('[data-admin-tab="notif"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      assertFalse(!!popoverEl(), 'changement d\'onglet (Notifications : retour à l\'onglet par défaut)');
    });

    it('un rendu complet pendant que le popover est ouvert le conserve, ré-ancré sur la nouvelle icône ; si la carte disparaît, il se ferme', async function () {
      await loadFixtureState();
      fireMouse(transmitBtn(lastStageCard('SIGNEX'), 'mail'), 'click');
      window.renderAdministratif();
      assertTrue(!!popoverEl(), 'toujours ouvert après un rendu');
      const anchor = transmitBtn(lastStageCard('SIGNEX'), 'mail');
      assertTrue(anchor.isConnected);
      assertTrue(window.AdministratifConv.popoverState().anchor === anchor, 'ancre ré-attachée à la NOUVELLE icône (pas à l\'ancienne, détachée)');
      const search = document.getElementById('admin-filter-search');
      search.value = 'INNOVX';
      fire(search, 'input');
      assertFalse(!!popoverEl(), 'SIGNEX filtré : plus d\'ancre, popover fermé');
      search.value = '';
      fire(search, 'input');
    });

    it('les icônes apparaissent dès qu\'une carte arrive dans la dernière étape', async function () {
      await loadFixtureState();
      await dragCardTo(cardByAcronym(panelIn('admin-col-conv', 'Convention en signature'), 'CONVENTIX'), panelIn('admin-col-conv', 'Convention signée de toutes les parties'));
      assertTrue(!!transmitBtn(lastStageCard('CONVENTIX'), 'mail'));
    });

    it('écrit sur la fiche Notifications si c\'est là que la colonne existe (table d\'origine non documentée)', async function () {
      const tables = await loadTables();
      tables.Projets.forEach(p => { delete p.Transmise_signee_au_porteur_le; });
      tables.Notifications.forEach(n => { n.Transmise_signee_au_porteur_le = null; });
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      fireMouse(transmitBtn(lastStageCard('SIGNEX'), 'mail'), 'click');
      await pickDate('2026-10-05');
      const call = projectWrites('Transmise_signee_au_porteur_le')[0];
      assertEqual(call.table, 'Notifications', 'la colonne vit dans Notifications → écriture sur Notifications');
      assertEqual(call.id, 4, 'fiche Notifications du projet SIGNEX (Projet = 16)');
    });

    it('si l\'écriture échoue : message d\'erreur, icône inchangée', async function () {
      await loadFixtureState();
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async () => { throw new Error('boom'); };
      clearToast();
      try {
        fireMouse(transmitBtn(lastStageCard('SIGNEX'), 'paper'), 'click');
        await pickDate('2026-10-07');
      } finally { window.grist.docApi.applyUserActions = original; }
      assertFalse(transmitBtn(lastStageCard('SIGNEX'), 'paper').classList.contains('is-set'), 'toujours grise');
      assertIncludes(document.getElementById('toast').textContent, 'boom');
    });

    // Au clavier, <input type=date> déclenche « change » à chaque segment complet : taper 15
    // donne d'abord le 01. Le popover ne doit ni enregistrer ni se fermer à ce moment-là.
    const typeKey = (input, key) => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    const typeDate = (input, iso, key) => { typeKey(input, key); setValue(input, iso); fire(input, 'change'); };
    const mailWrites = () => projectWrites('Transmise_signee_au_porteur_le');

    it('au clavier : un segment tapé n\'enregistre rien et ne ferme pas ; Entrée enregistre la date COMPLÈTE', async function () {
      await loadFixtureState();
      fireMouse(transmitBtn(lastStageCard('SIGNEX'), 'mail'), 'click');
      const input = popoverEl().querySelector('.admin-pop-date-input');
      typeDate(input, '2026-11-01', '1'); // le jour est devenu « 01 » en attendant le « 5 »
      await wait(0);
      assertEqual(mailWrites().length, 0, 'la date intermédiaire n\'est pas écrite');
      assertTrue(!!popoverEl(), 'le popover reste ouvert pour finir de taper');
      typeDate(input, '2026-11-15', '5');
      await wait(0);
      assertEqual(mailWrites().length, 0);
      fireKey(input, 'Enter');
      await wait(0);
      assertEqual(mailWrites().length, 1, 'une seule écriture');
      assertEqual(mailWrites()[0].fields.Transmise_signee_au_porteur_le, epochOf('2026-11-15'));
      assertFalse(!!popoverEl(), 'refermé après validation');
      assertEqual(transmitBtn(lastStageCard('SIGNEX'), 'mail').querySelector('.admin-transmit-date').textContent, '15/11/2026');
    });

    it('au clavier : quitter le popover (clic à l\'extérieur) enregistre la date tapée ; Échap l\'abandonne', async function () {
      await loadFixtureState();
      fireMouse(transmitBtn(lastStageCard('SIGNEX'), 'mail'), 'click');
      typeDate(popoverEl().querySelector('.admin-pop-date-input'), '2026-12-02', '2');
      fireMouse(document.body, 'mousedown');
      await wait(0);
      assertFalse(!!popoverEl());
      assertEqual(mailWrites().length, 1, 'la saisie en attente est enregistrée à la fermeture');
      assertEqual(mailWrites()[0].fields.Transmise_signee_au_porteur_le, epochOf('2026-12-02'));
      fireMouse(transmitBtn(lastStageCard('SIGNEX'), 'paper'), 'click');
      typeDate(popoverEl().querySelector('.admin-pop-date-input'), '2026-12-09', '9');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(0);
      assertFalse(!!popoverEl());
      assertEqual(projectWrites('Transmise_signee_au_porteur_papier_le').length, 0, 'Échap abandonne la saisie');
    });

    it('un choix fait à la souris (calendrier) est enregistré tout de suite, même après avoir tapé au clavier', async function () {
      await loadFixtureState();
      fireMouse(transmitBtn(lastStageCard('SIGNEX'), 'mail'), 'click');
      const input = popoverEl().querySelector('.admin-pop-date-input');
      typeKey(input, '3');
      input.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      setValue(input, '2026-11-20');
      fire(input, 'change');
      await wait(0);
      assertEqual(mailWrites().length, 1);
      assertFalse(!!popoverEl());
    });

    it('une réponse tardive de Grist ne ferme pas le popover ouvert entre-temps', async function () {
      await loadFixtureState();
      const original = window.grist.docApi.applyUserActions;
      let release;
      window.grist.docApi.applyUserActions = actions => new Promise(resolve => { release = () => resolve(original(actions)); });
      try {
        fireMouse(transmitBtn(lastStageCard('SIGNEX'), 'mail'), 'click');
        fireMouse(popoverEl().querySelector('[data-pop-today]'), 'click'); // écriture e-mail en vol
        await wait(0);
        fireMouse(transmitBtn(lastStageCard('SIGNEX'), 'paper'), 'mousedown');
        fireMouse(transmitBtn(lastStageCard('SIGNEX'), 'paper'), 'click');
        assertEqual(popoverEl().querySelector('.admin-field-label').textContent, 'Transmise sur papier le', 'le popover papier est ouvert');
        release();
        await wait(10);
        assertTrue(!!popoverEl(), 'le popover papier est toujours là');
        assertEqual(popoverEl().querySelector('.admin-field-label').textContent, 'Transmise sur papier le');
      } finally { window.grist.docApi.applyUserActions = original; }
    });

    it('quitter le popover au clavier (le focus sort) le ferme ; le focus sur son ancre ou dedans non', async function () {
      await loadFixtureState();
      const focusIn = el => el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      fireMouse(transmitBtn(lastStageCard('SIGNEX'), 'mail'), 'click');
      focusIn(popoverEl().querySelector('.admin-pop-date-input'));
      assertTrue(!!popoverEl(), 'focus dans le popover');
      focusIn(transmitBtn(lastStageCard('SIGNEX'), 'mail'));
      assertTrue(!!popoverEl(), 'focus sur sa propre ancre');
      focusIn(document.querySelector('[data-admin-tab="notif"]'));
      assertFalse(!!popoverEl(), 'focus ailleurs : refermé');
    });

    it('placement : sous l\'ancre, sinon au-dessus, sinon calé contre le bord bas — jamais rogné en bas', function () {
      const place = window.AdministratifConv.placePopover;
      const viewport = { width: 800, height: 500 }, size = { width: 300, height: 300 };
      assertDeepEqual(place({ left: 100, top: 100, bottom: 130 }, size, viewport), { left: 100, top: 136 }, 'de la place dessous');
      assertDeepEqual(place({ left: 100, top: 420, bottom: 450 }, size, viewport), { left: 100, top: 114 }, 'plus de place dessous : au-dessus');
      assertDeepEqual(place({ left: 100, top: 200, bottom: 230 }, size, viewport), { left: 100, top: 192 }, 'ni dessus ni dessous : calé en bas de la fenêtre');
      assertDeepEqual(place({ left: 700, top: 100, bottom: 130 }, size, viewport), { left: 492, top: 136 }, 'ne déborde pas à droite');
      assertDeepEqual(place({ left: 100, top: 200, bottom: 230 }, { width: 300, height: 700 }, viewport), { left: 100, top: 8 }, 'plus haut que la fenêtre : en haut avec la marge');
    });
  });

  describe('Administratif — Conventions : « Dernière action » (colonne convention_Date_derniere_modification)', function () {
    it('un champ date « Dernière action » accompagne le commentaire (sur la même ligne), puis le Next step dessous ; absent des cartes Notifications', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX');
      const lines = card.querySelectorAll('.admin-notes-line');
      assertEqual(lines.length, 2);
      assertTrue(!!lines[0].querySelector('[data-comment-project]') && !!lines[0].querySelector('[data-lastaction-project]'), 'commentaire + dernière action sur la première ligne');
      assertTrue(!!lines[1].querySelector('[data-nextstep-project]'), 'Next step sur la seconde');
      assertEqual(lines[0].querySelector('.admin-lastaction .admin-field-label').textContent.trim(), 'Dernière action');
      assertEqual(document.querySelectorAll('#admin-col-notif [data-lastaction-project]').length, 0);
    });

    it('affiche la date enregistrée, l\'enregistre (minuit UTC) sur Projets et la vide en écrivant null', async function () {
      const tables = await loadTables();
      tables.Projets.find(p => p.Acronyme === 'INNOVX').convention_Date_derniere_modification = epochOf('2026-10-20');
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      const input = () => cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX').querySelector('[data-lastaction-project]');
      assertEqual(input().value, '2026-10-20');
      setValue(input(), '2026-11-02');
      fire(input(), 'change');
      await wait(0);
      const writes = projectWrites('convention_Date_derniere_modification');
      assertEqual(writes[0].table, 'Projets');
      assertEqual(writes[0].fields.convention_Date_derniere_modification, epochOf('2026-11-02'));
      setValue(input(), '');
      fire(input(), 'change');
      await wait(0);
      assertEqual(projectWrites('convention_Date_derniere_modification')[1].fields.convention_Date_derniere_modification, null);
    });

    it('ignore les frappes partielles de l\'année et n\'écrit rien si la date n\'a pas changé', async function () {
      const tables = await loadTables();
      tables.Projets.find(p => p.Acronyme === 'INNOVX').convention_Date_derniere_modification = epochOf('2026-10-20');
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      const input = () => cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX').querySelector('[data-lastaction-project]');
      for (const partial of ['0002-05-10', '0202-05-10']) { setValue(input(), partial); fire(input(), 'change'); }
      await wait(0);
      assertEqual(projectWrites('convention_Date_derniere_modification').length, 0, 'années implausibles ignorées');
      setValue(input(), '2026-10-20'); // exactement la date déjà enregistrée
      fire(input(), 'change');
      await wait(0);
      assertEqual(projectWrites('convention_Date_derniere_modification').length, 0, 'date inchangée : aucune écriture');
      setValue(input(), '2026-10-21');
      fire(input(), 'change');
      await wait(0);
      assertEqual(projectWrites('convention_Date_derniere_modification').length, 1, 'une vraie modification s\'écrit');
    });

    it('le champ de commentaire libre garde sa saisie et reste enregistré à la sortie (cellule voisine de la date)', async function () {
      await loadFixtureState();
      const field = cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX').querySelector('[data-comment-project]');
      setValue(field, 'Relance faite');
      fire(field, 'blur');
      await wait(0);
      assertEqual(projectWrites('comentaire_general_Suivi_projet')[0].fields.comentaire_general_Suivi_projet, 'Relance faite');
    });
  });

  describe('Administratif — Conventions : responsables du next step (tags depuis l\'Annuaire)', function () {
    const innovCard = () => cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX');
    const tagsOf = card => Array.from(card.querySelectorAll('.admin-tag')).map(tag => tag.dataset.person);
    const openPeople = () => fireMouse(innovCard().querySelector('[data-pop-anchor^="people:"]'), 'click');
    const personBtn = id => popoverEl().querySelector(`[data-toggle-person="${id}"]`);
    async function withTagged(ids, extraPeople) {
      const tables = await loadTables();
      tables.Projets.find(p => p.Acronyme === 'INNOVX').next_step_responsable = ['L', ...ids];
      if (extraPeople) tables.Annuaire.push(...extraPeople);
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
    }

    it('sans responsable : uniquement le bouton « désigner » ; avec des responsables : une pastille d\'initiales par personne, nom complet en infobulle et en texte masqué', async function () {
      await loadFixtureState();
      assertEqual(innovCard().querySelectorAll('.admin-tag').length, 0);
      assertTrue(!!innovCard().querySelector('.admin-avatar-add'), 'bouton pour désigner');
      await withTagged([1, 2]);
      const tags = innovCard().querySelectorAll('.admin-tag');
      assertEqual(tags.length, 2);
      assertEqual(tags[0].querySelector('.admin-avatar').textContent, 'AM', 'initiales Prénom + Nom');
      assertEqual(tags[0].title, 'Alice Martin');
      assertEqual(tags[0].querySelector('.visually-hidden').textContent, 'Alice Martin', 'lisible par un lecteur d\'écran');
      assertEqual(tags[1].querySelector('.admin-avatar').textContent, 'BD');
      assertIncludes(innovCard().querySelector('.admin-avatar-add').getAttribute('aria-label'), 'Modifier');
    });

    it('le bouton ouvre la liste de l\'Annuaire avec recherche ; cocher une personne écrit une ReferenceList [\'L\', id] sur Projets et affiche sa pastille sans refaire tout le rendu', async function () {
      await loadFixtureState();
      const textarea = innovCard().querySelector('[data-nextstep-project]');
      openPeople();
      assertTrue(!!popoverEl().querySelector('.admin-pop-search'));
      assertEqual(popoverEl().querySelectorAll('[data-toggle-person]').length, 2, 'toutes les personnes de l\'Annuaire');
      fireMouse(personBtn(1), 'click');
      await wait(0);
      const writes = projectWrites('next_step_responsable');
      assertEqual(writes[0].table, 'Projets');
      assertEqual(writes[0].id, 10);
      assertDeepEqual(writes[0].fields.next_step_responsable, ['L', 1], 'format ReferenceList de Grist');
      assertDeepEqual(tagsOf(innovCard()), ['1']);
      assertTrue(textarea.isConnected && textarea === innovCard().querySelector('[data-nextstep-project]'), 'le reste de la carte n\'est pas reconstruit (pas de perte de saisie)');
      assertTrue(personBtn(1).classList.contains('is-selected') && personBtn(1).getAttribute('aria-selected') === 'true', 'la ligne cochée est marquée');
      assertTrue(!!popoverEl(), 'la liste reste ouverte pour en cocher d\'autres');
    });

    it('cocher puis décocher, et cocher deux personnes d\'affilée sans attendre Grist : la dernière écriture porte la liste complète', async function () {
      await loadFixtureState();
      openPeople();
      fireMouse(personBtn(1), 'click');
      fireMouse(personBtn(2), 'click'); // avant que Grist ait répondu à la première
      await wait(0);
      const writes = projectWrites('next_step_responsable');
      assertDeepEqual(writes[writes.length - 1].fields.next_step_responsable, ['L', 1, 2]);
      assertDeepEqual(tagsOf(innovCard()), ['1', '2']);
      fireMouse(personBtn(1), 'click');
      await wait(0);
      assertDeepEqual(projectWrites('next_step_responsable').pop().fields.next_step_responsable, ['L', 2], 'décocher retire la personne');
      assertDeepEqual(tagsOf(innovCard()), ['2']);
    });

    it('la croix de la pastille retire la personne (sans ouvrir la liste)', async function () {
      await withTagged([1, 2]);
      fireMouse(innovCard().querySelector('[data-untag$=":1"]'), 'click');
      await wait(0);
      assertDeepEqual(projectWrites('next_step_responsable')[0].fields.next_step_responsable, ['L', 2]);
      assertDeepEqual(tagsOf(innovCard()), ['2']);
      assertFalse(!!popoverEl(), 'la liste ne s\'ouvre pas');
      fireMouse(innovCard().querySelector('[data-untag$=":2"]'), 'click');
      await wait(0);
      assertDeepEqual(projectWrites('next_step_responsable')[1].fields.next_step_responsable, ['L'], 'liste vide = [\'L\']');
      assertEqual(tagsOf(innovCard()).length, 0);
    });

    it('la recherche filtre par nom ou par e-mail et indique quand personne ne correspond', async function () {
      await loadFixtureState();
      openPeople();
      const search = popoverEl().querySelector('.admin-pop-search');
      setValue(search, 'dur');
      fire(search, 'input');
      assertDeepEqual(Array.from(popoverEl().querySelectorAll('[data-toggle-person]')).map(b => b.dataset.togglePerson), ['2']);
      setValue(search, 'ALICE.MARTIN@');
      fire(search, 'input');
      assertDeepEqual(Array.from(popoverEl().querySelectorAll('[data-toggle-person]')).map(b => b.dataset.togglePerson), ['1'], 'insensible à la casse, e-mail inclus');
      setValue(search, 'zzz');
      fire(search, 'input');
      assertEqual(popoverEl().querySelectorAll('[data-toggle-person]').length, 0);
      assertIncludes(popoverEl().textContent, 'Personne ne correspond');
    });

    it('au clavier : flèche bas puis Entrée coche la première personne ; Échap ferme et rend le focus au bouton', async function () {
      await loadFixtureState();
      openPeople();
      const search = popoverEl().querySelector('.admin-pop-search');
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await wait(0);
      assertDeepEqual(projectWrites('next_step_responsable')[0].fields.next_step_responsable, ['L', 1]);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assertFalse(!!popoverEl());
    });

    it('au-delà de 3 responsables, les suivants se replient en « +N » (même liste, nom des autres en infobulle)', async function () {
      const extra = [3, 4, 5].map(id => ({ id, NOM: `Nom${id}`, Prenom: `Prenom${id}`, Email: `p${id}@example.org`, Telephone: '', Poste2: 0, nom_et_Prenom: `Prenom${id} Nom${id}` }));
      await withTagged([1, 2, 3, 4, 5], extra);
      assertEqual(innovCard().querySelectorAll('.admin-tag').length, 3);
      const more = innovCard().querySelector('.admin-avatar-more');
      assertEqual(more.textContent, '+2');
      assertIncludes(more.title, 'Prenom4 Nom4');
      assertIncludes(more.title, 'Prenom5 Nom5');
      fireMouse(more, 'click');
      assertTrue(!!popoverEl(), 'ouvre la liste pour modifier');
    });

    it('un identifiant absent de l\'Annuaire ne casse rien (pastille « ? », libellé neutre)', async function () {
      await withTagged([99]);
      const tag = innovCard().querySelector('.admin-tag');
      assertEqual(tag.querySelector('.admin-avatar').textContent, '?', 'pastille neutre');
      assertIncludes(tag.title, '99');
    });

    it('échappe les noms de l\'Annuaire (pastille, infobulle et liste)', async function () {
      const payload = '<img src=x onerror=alert(1)> Zed';
      const tables = await loadTables();
      tables.Annuaire[0].nom_et_Prenom = payload; tables.Annuaire[0].Prenom = ''; tables.Annuaire[0].NOM = '';
      tables.Projets.find(p => p.Acronyme === 'INNOVX').next_step_responsable = ['L', 1];
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      openPeople();
      assertEqual(document.querySelectorAll('#admin-col-conv img, .admin-popover img').length, 0, 'aucune balise injectée');
      assertEqual(innovCard().querySelector('.admin-tag').title, payload);
      assertEqual(popoverEl().querySelector('[data-toggle-person="1"] .admin-pop-name').firstChild.textContent, payload, 'texte affiché tel quel');
    });

    it('si l\'écriture échoue : la pastille disparaît (retour à l\'état enregistré) et un message le dit', async function () {
      await loadFixtureState();
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async () => { throw new Error('boom'); };
      clearToast();
      try {
        openPeople();
        fireMouse(personBtn(1), 'click');
        await wait(0);
      } finally { window.grist.docApi.applyUserActions = original; }
      assertEqual(tagsOf(innovCard()).length, 0);
      assertFalse(personBtn(1).classList.contains('is-selected'), 'la ligne n\'est plus cochée');
      assertIncludes(document.getElementById('toast').textContent, 'boom');
    });

    it('cocher une personne réécrit la cellule des tags : le popover se ré-ancre sur la nouvelle icône au prochain défilement ou redimensionnement', async function () {
      await loadFixtureState();
      openPeople();
      const before = window.AdministratifConv.popoverState().anchor;
      fireMouse(personBtn(1), 'click');
      await wait(0);
      assertFalse(before.isConnected, 'l\'ancienne icône a bien été remplacée');
      window.dispatchEvent(new Event('resize'));
      const after = window.AdministratifConv.popoverState().anchor;
      assertTrue(after.isConnected, 'ancre toujours rattachée au document (sinon le popover filerait en haut à gauche)');
      assertTrue(after === innovCard().querySelector('[data-pop-anchor^="people:"]'), 'c\'est l\'icône actuelle de la carte');
      assertTrue(!!popoverEl());
    });

    it('deux écritures qui échouent d\'affilée : retour à l\'état réellement enregistré (aucune pastille fantôme)', async function () {
      await loadFixtureState();
      const original = window.grist.docApi.applyUserActions;
      const failures = [];
      window.grist.docApi.applyUserActions = () => new Promise((resolve, reject) => failures.push(() => reject(new Error('boom'))));
      try {
        openPeople();
        fireMouse(personBtn(1), 'click');
        fireMouse(personBtn(2), 'click'); // avant la réponse de Grist
        assertDeepEqual(tagsOf(innovCard()), ['1', '2'], 'affichage immédiat');
        failures.forEach(fail => fail());
        await wait(10);
      } finally { window.grist.docApi.applyUserActions = original; }
      assertEqual(tagsOf(innovCard()).length, 0, 'rien n\'a été enregistré : aucune pastille ne doit rester');
      fireMouse(personBtn(2), 'click');
      await wait(0);
      assertDeepEqual(projectWrites('next_step_responsable').pop().fields.next_step_responsable, ['L', 2], 'la personne 1 n\'est pas écrite par erreur');
    });

    it('si la première écriture aboutit et la seconde échoue : retour à la première, pas à l\'état initial', async function () {
      await loadFixtureState();
      const original = window.grist.docApi.applyUserActions;
      const settle = [];
      window.grist.docApi.applyUserActions = actions => new Promise((resolve, reject) => settle.push({ ok: () => resolve(original(actions)), fail: () => reject(new Error('boom')) }));
      try {
        openPeople();
        fireMouse(personBtn(1), 'click');
        fireMouse(personBtn(2), 'click');
        settle[0].ok();
        await wait(10);
        settle[1].fail();
        await wait(10);
      } finally { window.grist.docApi.applyUserActions = original; }
      assertDeepEqual(tagsOf(innovCard()), ['1'], 'la personne 1 est bien enregistrée, la 2 non');
    });

    it('si la première écriture échoue mais que la seconde (valeur complète) aboutit : la seconde fait foi, rien n\'est annulé', async function () {
      await loadFixtureState();
      const original = window.grist.docApi.applyUserActions;
      const settle = [];
      window.grist.docApi.applyUserActions = actions => new Promise((resolve, reject) => settle.push({ ok: () => resolve(original(actions)), fail: () => reject(new Error('boom')) }));
      try {
        openPeople();
        fireMouse(personBtn(1), 'click');
        fireMouse(personBtn(2), 'click');
        settle[0].fail();
        await wait(10);
        assertDeepEqual(tagsOf(innovCard()), ['1', '2'], 'la seconde écriture est encore en vol : son état reste affiché');
        settle[1].ok();
        await wait(10);
      } finally { window.grist.docApi.applyUserActions = original; }
      assertDeepEqual(tagsOf(innovCard()), ['1', '2']);
      assertDeepEqual(projectWrites('next_step_responsable').pop().fields.next_step_responsable, ['L', 1, 2]);
    });

    it('n\'apparaît pas sur les cartes Notifications', async function () {
      await loadFixtureState();
      assertEqual(document.querySelectorAll('#admin-col-notif .admin-tags').length, 0);
    });
  });

  describe('Administratif — Conventions : le volet suit les statuts de signature', function () {
    const pill = (card, index) => card.querySelectorAll('.admin-partner-pill')[index];
    const stageWrites = () => convWrites();
    async function withStatuses(acronym, { ub, p1, p2, stage }) {
      const tables = await loadTables();
      const project = tables.Projets.find(p => p.Acronyme === acronym);
      if (ub !== undefined) project.convention_statut_UB = ub;
      if (p1 !== undefined) project.convention_statut_partenaire_1 = p1;
      if (p2 !== undefined) project.convention_statut_partenaire_2 = p2;
      if (stage) project.Conventions_statut = stage;
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
    }

    it('règle : tous signés → signée ; sinon le signataire le plus avancé (relu → relecture, en cours de signature ou signé → signature) ; rien → rédaction', function () {
      const stage = window.AdministratifConv.stageFromStatuses;
      assertEqual(stage([0]), 0, 'UB seul, non relu');
      assertEqual(stage([0, 0, 0]), 0);
      assertEqual(stage([1, 0, 0]), 1, 'un relu');
      assertEqual(stage([1, 1, 1]), 1, 'tous relus, la signature n\'a pas commencé');
      assertEqual(stage([2, 0, 0]), 2, 'un en cours de signature');
      assertEqual(stage([3, 0, 0]), 2, 'un signé, les autres pas : signature');
      assertEqual(stage([3, 3, 2]), 2);
      assertEqual(stage([3]), 3, 'UB seul, signé : tous ont signé');
      assertEqual(stage([3, 3, 3]), 3);
    });

    it('faire passer un statut de « Non relu » à « Relu » déplace la carte en relecture, en une seule écriture qui porte les deux colonnes', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX');
      fireMouse(pill(card, 0), 'click');
      await wait(0);
      const writes = window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && 'convention_statut_UB' in c.fields);
      assertEqual(writes.length, 1, 'une seule écriture');
      assertEqual(writes[0].fields.convention_statut_UB, 'Relu');
      assertEqual(writes[0].fields.Conventions_statut, '2) Convention en relecture', 'étape écrite avec son libellé Grist exact');
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en relecture'), 'INNOVX'), 'la carte a changé de volet');
      assertFalse(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX'));
      assertIncludes(document.getElementById('toast').textContent, 'Convention en relecture');
    });

    it('« en cours de signature » place la carte en signature', async function () {
      await withStatuses('INNOVX', { ub: 'Relu', stage: '2) Convention en relecture' });
      const card = cardByAcronym(panelIn('admin-col-conv', 'Convention en relecture'), 'INNOVX');
      fireMouse(pill(card, 0), 'click'); // Relu → en cours de signature
      await wait(0);
      assertEqual(stageWrites()[0].fields.Conventions_statut, '3) Convention en signature');
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en signature'), 'INNOVX'));
    });

    it('dès que tous les signataires ont signé, la carte passe en « signée de toutes les parties » et les icônes de transmission apparaissent', async function () {
      await withStatuses('CONVENTIX', { ub: 'Signé', p1: 'Signé', p2: 'en cours de signature' });
      const card = cardByAcronym(panelIn('admin-col-conv', 'Convention en signature'), 'CONVENTIX');
      fireMouse(pill(card, 2), 'click'); // INSERM : en cours de signature → Signé
      await wait(0);
      assertEqual(stageWrites()[0].fields.Conventions_statut, '4) Convention signée de toutes les parties');
      assertTrue(!!transmitBtn(lastStageCard('CONVENTIX'), 'mail'));
    });

    it('défaire une signature fait revenir la carte d\'une étape (signée → signature)', async function () {
      await loadFixtureState();
      fireMouse(pill(lastStageCard('SIGNEX'), 1), 'click'); // UBX : Signé → Non relu (retour au début du cycle)
      await wait(0);
      assertEqual(stageWrites()[0].fields.Conventions_statut, '3) Convention en signature', 'l\'UB a encore signé : toujours en signature');
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en signature'), 'SIGNEX'));
    });

    it('un clic qui ne change pas l\'étape implicite n\'écrit que le statut (pas de Conventions_statut)', async function () {
      await loadFixtureState();
      const card = cardByAcronym(panelIn('admin-col-conv', 'Convention en signature'), 'CONVENTIX');
      fireMouse(pill(card, 2), 'click'); // INSERM : Non relu → Relu, l'UB / le CNRS sont déjà plus loin
      await wait(0);
      const write = window.__TEST_CALLS__.find(c => c.type === 'UpdateRecord' && 'convention_statut_partenaire_2' in c.fields);
      assertFalse('Conventions_statut' in write.fields, 'étape inchangée, rien d\'autre écrit');
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en signature'), 'CONVENTIX'));
    });

    it('une carte rangée plus loin à la main n\'est pas ramenée en arrière par un statut qui avance (statuts jamais renseignés)', async function () {
      await withStatuses('INNOVX', { stage: '3) Convention en signature' }); // glissée en signature, statuts tous « Non relu »
      const card = cardByAcronym(panelIn('admin-col-conv', 'Convention en signature'), 'INNOVX');
      fireMouse(pill(card, 0), 'click'); // UB : Non relu → Relu
      await wait(0);
      assertEqual(stageWrites().length, 0, 'l\'étape n\'est pas réécrite');
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en signature'), 'INNOVX'), 'la carte reste en signature');
    });

    it('le glisser-déposer manuel reste possible (étapes que les statuts ne peuvent pas deviner)', async function () {
      await loadFixtureState();
      await dragCardTo(cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX'), panelIn('admin-col-conv', 'Convention en relecture'));
      assertEqual(stageWrites()[0].fields.Conventions_statut, '2) Convention en relecture');
    });

    it('deux pastilles cliquées coup sur coup avant la réponse de Grist : le passage à « signée » n\'est pas manqué', async function () {
      await withStatuses('CONVENTIX', { ub: 'Signé', p1: 'en cours de signature', p2: 'en cours de signature', stage: '3) Convention en signature' });
      const original = window.grist.docApi.applyUserActions;
      const releases = [];
      window.grist.docApi.applyUserActions = actions => new Promise(resolve => releases.push(() => resolve(original(actions))));
      try {
        const card = () => cardByAcronym(panelIn('admin-col-conv', 'Convention en signature'), 'CONVENTIX');
        fireMouse(pill(card(), 1), 'click'); // CNRS → Signé
        fireMouse(pill(card(), 2), 'click'); // INSERM → Signé, avant que Grist ait répondu au premier clic
        releases.forEach(release => release());
        await wait(10);
      } finally { window.grist.docApi.applyUserActions = original; }
      assertEqual(stageWrites().length, 1, 'la transition « tous signés » est écrite une fois');
      assertEqual(stageWrites()[0].fields.Conventions_statut, '4) Convention signée de toutes les parties');
      assertTrue(!!lastStageCard('CONVENTIX'), 'la carte est dans le dernier volet');
      assertTrue(!!transmitBtn(lastStageCard('CONVENTIX'), 'mail'), 'les icônes de transmission apparaissent');
    });

    it('si l\'écriture échoue : ni le statut ni la carte ne bougent', async function () {
      await loadFixtureState();
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async () => { throw new Error('boom'); };
      clearToast();
      try {
        fireMouse(pill(cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX'), 0), 'click');
        await wait(0);
      } finally { window.grist.docApi.applyUserActions = original; }
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX'), 'toujours en rédaction');
      assertIncludes(document.getElementById('toast').textContent, 'boom');
    });
  });

  describe('Administratif — Conventions : colonnes créées par le widget au premier lancement', function () {
    const UB_COLUMNS = ['convention_UB_v1_le', 'convention_UB_relu_le', 'convention_UB_visa_le', 'convention_UB_parapheur_le'];
    const NEW = ['next_step_responsable', 'Transmise_signee_au_porteur_papier_le', ...UB_COLUMNS];
    const addColumns = () => window.__TEST_CALLS__.filter(c => c.type === 'AddColumn');
    async function withoutColumns(names, { inNotifications } = {}) {
      const projets = JSON.parse(JSON.stringify(window.__FIXTURES__.Projets));
      names.forEach(name => delete projets[name]);
      window.__mockSetTable('Projets', projets);
      if (inNotifications) {
        const notifs = JSON.parse(JSON.stringify(window.__FIXTURES__.Notifications));
        inNotifications.forEach(name => { notifs[name] = notifs.id.map(() => null); });
        window.__mockSetTable('Notifications', notifs);
      }
      await window.CoreGrist.ready();
    }

    it('crée les colonnes neuves dans Projets (responsables, date papier, 4 sous-étapes UB) : référence multiple vers Annuaire et dates, jamais des formules', async function () {
      await withoutColumns(NEW);
      assertTrue(await window.ensureAdministratifColumns(), 'a créé des colonnes');
      const added = addColumns();
      assertEqual(added.length, 6);
      assertTrue(added.every(c => c.table === 'Projets'));
      const byId = Object.fromEntries(added.map(c => [c.colId, c.colInfo]));
      assertEqual(byId.next_step_responsable.type, 'RefList:Annuaire');
      assertEqual(byId.Transmise_signee_au_porteur_papier_le.type, 'Date');
      UB_COLUMNS.forEach(name => assertEqual(byId[name].type, 'Date', `${name} : une date`));
      added.forEach(c => assertFalse(c.colInfo.isFormula, `${c.colId} : donnée, pas formule`));
      added.forEach(c => assertFalse('description' in c.colInfo, 'la description n\'est pas passée à AddColumn'));
    });

    it('ne crée rien quand les colonnes existent déjà, ni quand elles existent déjà côté Notifications (pas de doublon qui masquerait les valeurs)', async function () {
      assertFalse(await window.ensureAdministratifColumns(), 'fixtures complètes : rien à faire');
      assertEqual(addColumns().length, 0);
      await withoutColumns(NEW, { inNotifications: ['next_step_responsable'] });
      await window.ensureAdministratifColumns();
      assertEqual(addColumns().map(c => c.colId).join(), ['Transmise_signee_au_porteur_papier_le', ...UB_COLUMNS].join(), 'seules les colonnes vraiment absentes sont créées');
    });

    it('pose la description des colonnes créées dans les métadonnées Grist, pour alimenter les bulles d\'aide', async function () {
      await withoutColumns(NEW);
      window.__mockSetTable('_grist_Tables', { id: [1], tableId: ['Projets'] });
      window.__mockSetTable('_grist_Tables_column', { id: [1], parentId: [1], colId: ['Acronyme'], description: [''] });
      await window.ensureAdministratifColumns();
      const described = window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && c.table === '_grist_Tables_column');
      assertEqual(described.length, NEW.length, 'une description par colonne créée');
      assertTrue(described.every(c => c.fields.description.length > 30), 'descriptions explicites');
      await window.CoreGrist.loadColumnDescriptions();
      assertTrue(window.CoreGrist.getColumnDescription('Projets', 'next_step_responsable').length > 0, 'la bulle d\'aide peut la lire');
    });

    it('schéma non modifiable : pas d\'exception, un message liste les colonnes à créer à la main', async function () {
      await withoutColumns(NEW);
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async () => { throw new Error('droits insuffisants'); };
      let result;
      try { result = await window.ensureAdministratifColumns(); } finally { window.grist.docApi.applyUserActions = original; }
      assertFalse(result);
      const toast = document.getElementById('toast').textContent;
      NEW.forEach(name => assertIncludes(toast, name));
    });

    it('schéma de Projets illisible : ne devine rien et ne crée rien', async function () {
      const original = window.grist.docApi.fetchTable;
      window.grist.docApi.fetchTable = async () => { throw new Error('refusé'); };
      try { assertFalse(await window.ensureAdministratifColumns()); } finally { window.grist.docApi.fetchTable = original; }
      assertEqual(addColumns().length, 0);
    });
  });

  describe('Administratif — Conventions : bulles d\'aide des nouveaux champs', function () {
    it('« Dernière action » et « Transmise au porteur le » affichent l\'icône d\'aide quand la colonne Grist a une description', async function () {
      window.__mockSetTable('_grist_Tables', { id: [1], tableId: ['Projets'] });
      window.__mockSetTable('_grist_Tables_column', { id: [1, 2], parentId: [1, 1], colId: ['convention_Date_derniere_modification', 'Transmise_signee_au_porteur_le'], description: ['Date de la dernière action', 'Date d\'envoi par e-mail'] });
      await window.CoreGrist.loadColumnDescriptions();
      await loadFixtureState();
      const open = cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX');
      assertTrue(!!open.querySelector('.admin-lastaction .help-icon'), 'icône sur « Dernière action »');
      assertTrue(!!lastStageCard('SIGNEX').querySelector('.admin-transmit .help-icon'), 'icône sur « Transmise au porteur le »');
    });
  });

  // ── Sous-étapes du statut de l'UB (relecture : V1, relu ; signature : visa, parapheur) ──
  describe('Administratif — Conventions : sous-étapes du statut de l\'UB (pastilles datées sous la pastille UB)', function () {
    const STEP_COLUMNS = { v1: 'convention_UB_v1_le', relu: 'convention_UB_relu_le', visa: 'convention_UB_visa_le', parapheur: 'convention_UB_parapheur_le' };
    const anyCard = acronym => Array.from(document.querySelectorAll('#admin-col-conv .admin-card'))
      .find(card => card.querySelector('.admin-card-identity .project-acronym')?.textContent === acronym);
    const ubPill = card => card.querySelectorAll('.admin-partner-pill')[0];
    const stepBtn = (card, key) => card.querySelector(`[data-pop-anchor^="step-${key}:"]`);
    const stepKeys = card => Array.from(card.querySelectorAll('.admin-step')).map(btn => btn.dataset.popAnchor.split(':')[0].replace('step-', ''));
    const projectIdOf = btn => btn.dataset.popAnchor.split(':')[1];
    const stepWrites = key => projectWrites(STEP_COLUMNS[key]);
    async function withProject(acronym, changes, mutateTables) {
      const tables = await loadTables();
      Object.assign(tables.Projets.find(p => p.Acronyme === acronym), changes);
      if (mutateTables) mutateTables(tables);
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
    }
    const withUb = (acronym, ub, extra = {}) => withProject(acronym, { convention_statut_UB: ub, ...extra });
    const typeKey = (input, key) => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

    it('« Relu » affiche V1 disponible puis Relu par Hélène & Antoine, sous la pastille UB seulement (pas sous les partenaires)', async function () {
      await loadFixtureState(); // CONVENTIX : UB « Relu », deux partenaires
      const card = anyCard('CONVENTIX');
      assertEqual(card.querySelectorAll('.admin-steps').length, 1, 'un seul groupe de sous-étapes par projet');
      const columns = card.querySelectorAll('.admin-partner-col');
      assertEqual(columns.length, 3, 'UB + 2 partenaires');
      assertTrue(!!columns[0].querySelector('.admin-steps'), 'sous la pastille UB');
      assertFalse(!!columns[1].querySelector('.admin-steps'), 'rien sous le partenaire 1');
      assertFalse(!!columns[2].querySelector('.admin-steps'), 'rien sous le partenaire 2');
      assertTrue(columns[0].querySelector('.admin-steps').previousElementSibling === ubPill(card), 'juste sous la pastille de statut');
      assertDeepEqual(stepKeys(card), ['v1', 'relu']);
      assertEqual(stepBtn(card, 'v1').querySelector('.admin-step-label').textContent, 'V1');
      assertEqual(stepBtn(card, 'relu').querySelector('.admin-step-label').textContent, 'Relu H. & A.');
      assertIncludes(stepBtn(card, 'v1').title, 'V1 disponible');
      assertIncludes(stepBtn(card, 'relu').title, 'Relu par Hélène & Antoine');
      assertEqual(card.querySelector('.admin-steps').getAttribute('role'), 'group');
      assertIncludes(card.querySelector('.admin-steps').getAttribute('aria-label'), 'relecture');
    });

    it('« en cours de signature » affiche Demande de visa puis Parapheur envoyé ; « Non relu » et « Signé » n\'affichent rien', async function () {
      await withUb('INNOVX', 'en cours de signature');
      assertDeepEqual(stepKeys(anyCard('INNOVX')), ['visa', 'parapheur']);
      assertIncludes(stepBtn(anyCard('INNOVX'), 'visa').title, 'Demande de visa');
      assertIncludes(stepBtn(anyCard('INNOVX'), 'parapheur').title, 'Parapheur envoyé');
      assertIncludes(anyCard('INNOVX').querySelector('.admin-steps').getAttribute('aria-label'), 'signature');
      await withUb('INNOVX', 'Non relu');
      assertEqual(anyCard('INNOVX').querySelectorAll('.admin-step').length, 0, 'Non relu : aucune sous-étape');
      await withUb('INNOVX', null);
      assertEqual(anyCard('INNOVX').querySelectorAll('.admin-step').length, 0, 'statut vide (= Non relu) : aucune sous-étape');
      await withUb('INNOVX', 'Signé');
      assertEqual(anyCard('INNOVX').querySelectorAll('.admin-step').length, 0, 'Signé : aucune sous-étape');
      await withUb('INNOVX', 'Relu');
      assertDeepEqual(stepKeys(anyCard('INNOVX')), ['v1', 'relu']);
    });

    it('le statut d\'un partenaire ne fait jamais apparaître de sous-étape (seul l\'UB en a)', async function () {
      await withProject('CONVENTIX', { convention_statut_UB: 'Non relu', convention_statut_partenaire_1: 'Relu', convention_statut_partenaire_2: 'en cours de signature' });
      assertEqual(anyCard('CONVENTIX').querySelectorAll('.admin-steps, .admin-step').length, 0);
    });

    it('grise et pointillée sans date ; bleue avec la date « jj/mm » une fois faite, chaque sous-étape indépendante', async function () {
      await withUb('CONVENTIX', 'Relu', { convention_UB_v1_le: epochOf('2026-11-04') });
      const card = anyCard('CONVENTIX');
      assertTrue(stepBtn(card, 'v1').classList.contains('is-set'));
      assertEqual(stepBtn(card, 'v1').querySelector('.admin-step-date').textContent, '04/11');
      assertIncludes(stepBtn(card, 'v1').title, 'le 04/11/2026');
      assertIncludes(stepBtn(card, 'v1').getAttribute('aria-label'), '04/11/2026');
      assertFalse(stepBtn(card, 'relu').classList.contains('is-set'), 'l\'autre sous-étape reste grise');
      assertFalse(!!stepBtn(card, 'relu').querySelector('.admin-step-date'), 'pas de date affichée sans date');
      assertIncludes(stepBtn(card, 'relu').title, 'pas encore fait');
    });

    it('les dates des sous-étapes de l\'autre phase ne s\'affichent pas (visa/parapheur sous « Relu »)', async function () {
      await withUb('CONVENTIX', 'Relu', { convention_UB_visa_le: epochOf('2026-11-06'), convention_UB_parapheur_le: epochOf('2026-11-07') });
      assertDeepEqual(stepKeys(anyCard('CONVENTIX')), ['v1', 'relu']);
      assertEqual(anyCard('CONVENTIX').querySelectorAll('.admin-step.is-set').length, 0);
    });

    it('les sous-étapes sont aussi sous la pastille UB en vue « cartes »', async function () {
      await loadFixtureState();
      document.getElementById('admin-toggle-view').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      try {
        assertTrue(document.querySelector('#admin-col-conv .admin-panel-body').classList.contains('mode-cards'));
        assertDeepEqual(stepKeys(anyCard('CONVENTIX')), ['v1', 'relu']);
      } finally { document.getElementById('admin-toggle-view').dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    });

    it('un clic sur une sous-étape ouvre sa date (avec son libellé) ; choisir une date l\'écrit dans SA colonne de Projets, à minuit UTC, et bleuit la pastille sans toucher aux statuts', async function () {
      await withUb('CONVENTIX', 'Relu');
      const btn = stepBtn(anyCard('CONVENTIX'), 'v1');
      fireMouse(btn, 'click');
      assertTrue(!!popoverEl(), 'le popover de date s\'ouvre');
      assertIncludes(popoverEl().querySelector('.admin-field-label').textContent, 'V1 disponible');
      assertFalse(!!popoverEl().querySelector('[data-pop-clear]'), 'rien à effacer sans date');
      assertTrue(popoverEl().querySelector('.admin-pop-date-input').getAttribute('aria-label').includes('V1 disponible'));
      await pickDate('2026-11-05');
      const writes = stepWrites('v1');
      assertEqual(writes.length, 1);
      assertEqual(writes[0].table, 'Projets');
      assertEqual(String(writes[0].id), projectIdOf(btn));
      assertDeepEqual(writes[0].fields, { convention_UB_v1_le: epochOf('2026-11-05') }, 'seule la colonne de la sous-étape est écrite');
      assertEqual(window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && ('convention_statut_UB' in c.fields || 'Conventions_statut' in c.fields)).length, 0, 'le statut et l\'étape ne bougent pas');
      assertFalse(!!popoverEl(), 'le popover se referme une fois la date enregistrée');
      const after = stepBtn(anyCard('CONVENTIX'), 'v1');
      assertTrue(after.classList.contains('is-set'));
      assertEqual(after.querySelector('.admin-step-date').textContent, '05/11');
      assertFalse(stepBtn(anyCard('CONVENTIX'), 'relu').classList.contains('is-set'));
    });

    it('chacune des quatre sous-étapes écrit sa propre colonne', async function () {
      for (const [ub, key] of [['Relu', 'relu'], ['en cours de signature', 'visa'], ['en cours de signature', 'parapheur']]) {
        await withUb('INNOVX', ub);
        fireMouse(stepBtn(anyCard('INNOVX'), key), 'click');
        assertIncludes(popoverEl().querySelector('.admin-field-label').textContent, { relu: 'Relu par Hélène & Antoine', visa: 'Demande de visa', parapheur: 'Parapheur envoyé' }[key]);
        await pickDate('2026-11-09');
        assertEqual(stepWrites(key).length, 1, `${key} : une écriture`);
        assertEqual(stepWrites(key)[0].fields[STEP_COLUMNS[key]], epochOf('2026-11-09'));
        Object.keys(STEP_COLUMNS).filter(other => other !== key).forEach(other => assertEqual(stepWrites(other).length, 0, `${key} n'écrit pas ${other}`));
        window.__TEST_CALLS__.length = 0;
      }
    });

    it('« Aujourd\'hui » enregistre le jour local ; « Effacer » (proposé seulement s\'il y a une date) vide la colonne et regrise la pastille', async function () {
      await withUb('CONVENTIX', 'Relu');
      await withClock(new Date(2026, 10, 10, 23, 50), async () => {
        fireMouse(stepBtn(anyCard('CONVENTIX'), 'relu'), 'click');
        fireMouse(popoverEl().querySelector('[data-pop-today]'), 'click');
        await wait(0);
      });
      assertEqual(stepWrites('relu')[0].fields.convention_UB_relu_le, epochOf('2026-11-10'));
      assertEqual(stepBtn(anyCard('CONVENTIX'), 'relu').querySelector('.admin-step-date').textContent, '10/11');
      fireMouse(stepBtn(anyCard('CONVENTIX'), 'relu'), 'click');
      assertEqual(popoverEl().querySelector('.admin-pop-date-input').value, '2026-11-10', 'le popover reprend la date enregistrée');
      fireMouse(popoverEl().querySelector('[data-pop-clear]'), 'click');
      await wait(0);
      assertEqual(stepWrites('relu')[1].fields.convention_UB_relu_le, null);
      assertFalse(stepBtn(anyCard('CONVENTIX'), 'relu').classList.contains('is-set'), 'pastille de nouveau grise');
    });

    it('n\'enregistre rien tant que la saisie au clavier n\'est pas validée (Entrée) et n\'enregistre que la date complète ; Échap l\'abandonne', async function () {
      await withUb('CONVENTIX', 'Relu');
      fireMouse(stepBtn(anyCard('CONVENTIX'), 'v1'), 'click');
      const input = popoverEl().querySelector('.admin-pop-date-input');
      typeKey(input, '1'); setValue(input, '2026-11-01'); fire(input, 'change');
      await wait(0);
      assertEqual(stepWrites('v1').length, 0, 'segment intermédiaire non écrit');
      assertTrue(!!popoverEl());
      typeKey(input, '5'); setValue(input, '2026-11-15'); fire(input, 'change');
      fireKey(input, 'Enter');
      await wait(0);
      assertEqual(stepWrites('v1').length, 1);
      assertEqual(stepWrites('v1')[0].fields.convention_UB_v1_le, epochOf('2026-11-15'));
      fireMouse(stepBtn(anyCard('CONVENTIX'), 'relu'), 'click');
      typeKey(popoverEl().querySelector('.admin-pop-date-input'), '9');
      setValue(popoverEl().querySelector('.admin-pop-date-input'), '2026-11-19'); fire(popoverEl().querySelector('.admin-pop-date-input'), 'change');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(0);
      assertEqual(stepWrites('relu').length, 0, 'Échap abandonne la saisie');
    });

    it('n\'actualise que la zone des sous-étapes : ni la pastille UB, ni la carte, ni un brouillon de commentaire ne sont réécrits', async function () {
      await withUb('CONVENTIX', 'Relu');
      const card = anyCard('CONVENTIX'), pill = ubPill(card), steps = card.querySelector('.admin-steps');
      const draft = card.querySelector('[data-comment-project]');
      draft.value = 'brouillon pas encore enregistré';
      fireMouse(stepBtn(card, 'v1'), 'click');
      await pickDate('2026-11-05');
      assertTrue(anyCard('CONVENTIX') === card, 'la carte n\'est pas reconstruite');
      assertTrue(ubPill(anyCard('CONVENTIX')) === pill && pill.isConnected, 'la pastille UB est la même');
      assertTrue(card.querySelector('.admin-steps') !== steps, 'seule la zone des sous-étapes est remplacée');
      assertEqual(card.querySelector('[data-comment-project]').value, 'brouillon pas encore enregistré');
    });

    it('les bulles d\'aide : l\'icône « ? » du popover n\'apparaît que si la colonne a une description dans Grist', async function () {
      window.__mockSetTable('_grist_Tables', { id: [1], tableId: ['Projets'] });
      window.__mockSetTable('_grist_Tables_column', { id: [1], parentId: [1], colId: ['convention_UB_v1_le'], description: ['Date à laquelle la V1 a été mise à disposition'] });
      await window.CoreGrist.loadColumnDescriptions();
      await withUb('CONVENTIX', 'Relu');
      fireMouse(stepBtn(anyCard('CONVENTIX'), 'v1'), 'click');
      const icon = popoverEl().querySelector('.admin-field-label .help-icon');
      assertTrue(!!icon, 'icône d\'aide sur le libellé du popover');
      assertIncludes(icon.getAttribute('data-help-text'), 'V1 a été mise à disposition');
      closePopover();
      fireMouse(stepBtn(anyCard('CONVENTIX'), 'relu'), 'click');
      assertFalse(!!popoverEl().querySelector('.help-icon'), 'pas de description pour « Relu » : pas d\'icône');
      closePopover();
    });

    it('si l\'écriture échoue : message d\'erreur nommant la date, pastille inchangée', async function () {
      await withUb('CONVENTIX', 'Relu');
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async () => { throw new Error('boom'); };
      clearToast();
      try {
        fireMouse(stepBtn(anyCard('CONVENTIX'), 'v1'), 'click');
        await pickDate('2026-11-05');
      } finally { window.grist.docApi.applyUserActions = original; }
      const toast = document.getElementById('toast').textContent;
      assertIncludes(toast, 'boom');
      assertIncludes(toast, 'V1 disponible');
      assertFalse(stepBtn(anyCard('CONVENTIX'), 'v1').classList.contains('is-set'), 'toujours grise');
    });

    it('changer le statut de l\'UB avec la pastille remplace les sous-étapes (relecture → signature → plus rien) sans toucher aux dates déjà saisies', async function () {
      await withUb('INNOVX', 'Non relu', { convention_UB_v1_le: epochOf('2026-11-02'), convention_UB_relu_le: epochOf('2026-11-03') });
      assertEqual(anyCard('INNOVX').querySelectorAll('.admin-step').length, 0);
      fireMouse(ubPill(anyCard('INNOVX')), 'click'); // Non relu → Relu
      await wait(0);
      assertDeepEqual(stepKeys(anyCard('INNOVX')), ['v1', 'relu']);
      assertEqual(anyCard('INNOVX').querySelectorAll('.admin-step.is-set').length, 2, 'les dates déjà saisies sont reprises');
      fireMouse(ubPill(anyCard('INNOVX')), 'click'); // Relu → en cours de signature
      await wait(0);
      assertDeepEqual(stepKeys(anyCard('INNOVX')), ['visa', 'parapheur']);
      fireMouse(ubPill(anyCard('INNOVX')), 'click'); // → Signé
      await wait(0);
      assertEqual(anyCard('INNOVX').querySelectorAll('.admin-step').length, 0);
      const stepColumnWrites = window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && Object.keys(STEP_COLUMNS).some(key => STEP_COLUMNS[key] in c.fields));
      assertEqual(stepColumnWrites.length, 0, 'changer de statut n\'écrit aucune date de sous-étape');
    });

    it('un changement de statut qui fait disparaître la sous-étape ouverte referme son popover', async function () {
      await withUb('INNOVX', 'Relu');
      fireMouse(stepBtn(anyCard('INNOVX'), 'v1'), 'click');
      assertTrue(!!popoverEl());
      fireMouse(ubPill(anyCard('INNOVX')), 'click'); // Relu → en cours de signature : V1 n'existe plus
      await wait(0);
      assertFalse(!!popoverEl(), 'plus d\'ancre : popover refermé');
    });

    it('écrit sur la fiche Notifications si c\'est là que la colonne existe', async function () {
      await withProject('INNOVX', { convention_statut_UB: 'Relu' }, tables => {
        tables.Projets.forEach(p => { delete p.convention_UB_v1_le; });
        tables.Notifications.forEach(n => { n.convention_UB_v1_le = null; });
      });
      fireMouse(stepBtn(anyCard('INNOVX'), 'v1'), 'click');
      await pickDate('2026-11-05');
      const call = stepWrites('v1')[0];
      assertEqual(call.table, 'Notifications');
      assertEqual(call.id, 1, 'fiche Notifications du projet INNOVX (Projet = 10)');
    });

    it('colonnes absentes de Grist (schéma non modifiable) : les pastilles s\'affichent quand même, grises, sans planter', async function () {
      await withProject('CONVENTIX', { convention_statut_UB: 'Relu' }, tables => {
        tables.Projets.forEach(p => { Object.values(STEP_COLUMNS).forEach(column => { delete p[column]; }); });
      });
      assertDeepEqual(stepKeys(anyCard('CONVENTIX')), ['v1', 'relu']);
      assertEqual(anyCard('CONVENTIX').querySelectorAll('.admin-step.is-set').length, 0);
      fireMouse(stepBtn(anyCard('CONVENTIX'), 'v1'), 'click');
      assertTrue(!!popoverEl(), 'le popover s\'ouvre quand même');
      closePopover();
    });
  });

  describe('Administratif — Conventions : lien externe vers la convention', function () {
    const convCard = acr => cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), acr);
    const linkWrites = () => window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && 'Lien_convention' in c.fields);
    // Le squelette DOM des tests est en display:none : le focus réel (input.focus())
    // n'y est pas observable, il est vérifié dans un vrai navigateur (contrôle visuel).
    const openEditor = async acr => {
      const editBtn = convCard(acr).querySelector('[data-edit-link]');
      if (editBtn) editBtn.click();
      return convCard(acr).querySelector('[data-link-input]');
    };
    const press = (el, key) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    const leave = el => el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

    it('sans lien : seule une icône d\'ajout est proposée ; avec lien : icône d\'ouverture (nouvel onglet) + icône de modification', async function () {
      const tables = await loadTables();
      tables.Projets.find(p => p.Acronyme === 'NOTIFY').Lien_convention = 'https://exemple.org/convention.pdf';
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      assertEqual(convCard('INNOVX').querySelectorAll('a[href]').length, 0, 'aucun lien à ouvrir');
      assertEqual(convCard('INNOVX').querySelectorAll('[data-edit-link]').length, 1, 'une icône pour en ajouter un');
      const link = convCard('NOTIFY').querySelector('a[href]');
      assertEqual(link.getAttribute('href'), 'https://exemple.org/convention.pdf');
      assertEqual(link.getAttribute('target'), '_blank');
      assertTrue((link.getAttribute('rel') || '').includes('noopener'), 'rel="noopener" obligatoire avec target=_blank');
      assertEqual(convCard('NOTIFY').querySelectorAll('[data-edit-link]').length, 1, 'et une icône pour le modifier');
    });

    it('Entrée valide le lien : préfixe https:// ajouté si absent, écrit dans Lien_convention, puis icône d\'ouverture affichée', async function () {
      await loadFixtureState();
      const input = await openEditor('INNOVX');
      assertTrue(!!input, 'le champ de saisie apparaît');
      setValue(input, 'exemple.org/convention.pdf');
      press(input, 'Enter');
      await wait(0);
      assertEqual(linkWrites().length, 1);
      assertEqual(linkWrites()[0].table, 'Projets');
      assertEqual(linkWrites()[0].fields.Lien_convention, 'https://exemple.org/convention.pdf');
      assertEqual(convCard('INNOVX').querySelector('a[href]').getAttribute('href'), 'https://exemple.org/convention.pdf');
      assertFalse(!!convCard('INNOVX').querySelector('[data-link-input]'), 'le champ de saisie se referme');
    });

    it('la sortie du champ (blur) valide aussi, sans double écriture après Entrée', async function () {
      await loadFixtureState();
      let input = await openEditor('INNOVX');
      setValue(input, 'https://exemple.org/a');
      leave(input);
      await wait(0);
      assertEqual(linkWrites().length, 1, 'blur → une écriture');
      input = await openEditor('INNOVX');
      setValue(input, 'https://exemple.org/b');
      press(input, 'Enter');
      leave(input);
      await wait(0);
      assertEqual(linkWrites().length, 2, 'Entrée puis blur → une seule écriture de plus');
    });

    it('Échap annule sans rien écrire', async function () {
      await loadFixtureState();
      const input = await openEditor('INNOVX');
      setValue(input, 'https://exemple.org/annule');
      press(input, 'Escape');
      leave(input);
      await wait(0);
      assertEqual(linkWrites().length, 0);
      assertFalse(!!convCard('INNOVX').querySelector('[data-link-input]'));
    });

    it('refuse les schémas autres que http(s) (javascript:, file:, …) sans écrire', async function () {
      await loadFixtureState();
      for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,<script>alert(1)</script>']) {
        const input = await openEditor('INNOVX');
        setValue(input, bad);
        press(input, 'Enter');
        await wait(0);
      }
      assertEqual(linkWrites().length, 0, 'aucune écriture');
      assertEqual(convCard('INNOVX').querySelectorAll('a[href]').length, 0);
    });

    it('n\'affiche jamais comme lien cliquable une valeur non http(s) déjà présente dans Grist', async function () {
      const tables = await loadTables();
      tables.Projets.find(p => p.Acronyme === 'INNOVX').Lien_convention = 'javascript:alert(1)';
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      assertEqual(document.querySelectorAll('#admin-col-conv a[href^="javascript"]').length, 0);
      assertEqual(convCard('INNOVX').querySelectorAll('a[href]').length, 0);
    });

    it('vider le champ supprime le lien', async function () {
      const tables = await loadTables();
      tables.Projets.find(p => p.Acronyme === 'INNOVX').Lien_convention = 'https://exemple.org/x';
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      const input = await openEditor('INNOVX');
      assertEqual(input.value, 'https://exemple.org/x', 'le champ est prérempli avec le lien actuel');
      setValue(input, '');
      press(input, 'Enter');
      await wait(0);
      assertEqual(linkWrites()[0].fields.Lien_convention, '');
      assertEqual(convCard('INNOVX').querySelectorAll('a[href]').length, 0);
    });

    it('échappe l\'URL dans l\'attribut href', async function () {
      const tables = await loadTables();
      tables.Projets.find(p => p.Acronyme === 'INNOVX').Lien_convention = 'https://exemple.org/?q="><img src=x onerror=alert(1)>';
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      assertEqual(document.querySelectorAll('#admin-col-conv img').length, 0, 'aucune balise <img> injectée');
      const links = convCard('INNOVX').querySelectorAll('a[href]');
      assertEqual(links.length, 1);
      assertEqual(links[0].getAttribute('href'), new URL('https://exemple.org/?q="><img src=x onerror=alert(1)>').href, 'href = URL normalisée, sans attribut supplémentaire');
      assertFalse(links[0].hasAttribute('onerror'));
    });

    it('accepte hôte:port/chemin (pas confondu avec un schéma d\'URL)', async function () {
      await loadFixtureState();
      const input = await openEditor('INNOVX');
      setValue(input, 'monserveur:8080/convention.pdf');
      press(input, 'Enter');
      await wait(0);
      assertEqual(linkWrites()[0].fields.Lien_convention, 'https://monserveur:8080/convention.pdf');
    });

    it('un lien invalide saisi puis validé par Entrée laisse le champ ouvert avec la saisie, sans écrire', async function () {
      await loadFixtureState();
      const input = await openEditor('INNOVX');
      setValue(input, 'javascript:alert(1)');
      press(input, 'Enter');
      await wait(0);
      const still = convCard('INNOVX').querySelector('[data-link-input]');
      assertTrue(!!still, 'le champ reste ouvert');
      assertEqual(still.value, 'javascript:alert(1)', 'et la saisie est conservée pour être corrigée');
      assertEqual(linkWrites().length, 0);
      press(still, 'Escape'); // remise en état pour les autres tests
    });

    it('sortir du champ ne reconstruit que la cellule du lien : les autres cartes et champs restent en place (le clic suivant n\'est pas perdu)', async function () {
      await loadFixtureState();
      const otherField = convCard('NOTIFY').querySelector('[data-nextstep-project]');
      const partnerPill = convCard('NOTIFY').querySelector('[data-cycle-partner]');
      const input = await openEditor('INNOVX');
      leave(input);
      await wait(0);
      assertTrue(otherField.isConnected, 'le champ Next step d\'une autre carte ne doit pas être détaché');
      assertTrue(partnerPill.isConnected, 'ni la pastille partenaire');
      assertFalse(!!convCard('INNOVX').querySelector('[data-link-input]'), 'le champ de saisie se referme');
    });

    it('ouvrir l\'éditeur d\'un lien ne détache aucun autre élément de la page', async function () {
      await loadFixtureState();
      const otherField = convCard('NOTIFY').querySelector('[data-nextstep-project]');
      const otherEdit = convCard('NOTIFY').querySelector('[data-edit-link]');
      await openEditor('INNOVX');
      assertTrue(otherField.isConnected && otherEdit.isConnected, 'pas de rendu complet à l\'ouverture');
      const second = await openEditor('NOTIFY'); // ouvrir un second éditeur ferme (valide) le premier sans perdre le clic
      leave(convCard('INNOVX').querySelector('[data-link-input]'));
      assertTrue(!!second || !!convCard('NOTIFY').querySelector('[data-link-input]'));
      press(convCard('NOTIFY').querySelector('[data-link-input]'), 'Escape');
    });
  });

  describe('Administratif — volets repliables et masquables (même patron que le Kanban)', function () {
    it('un volet replié cache ses cartes, un volet masqué disparaît et réapparaît via la puce "œil"', async function () {
      await loadFixtureState();
      const panel = panelIn('admin-col-notif', 'Information projet saisies');
      panel.querySelector('[data-toggle-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const collapsedPanel = panelIn('admin-col-notif', 'Information projet saisies');
      assertTrue(collapsedPanel.classList.contains('is-collapsed'), 'le volet doit être replié');
      collapsedPanel.querySelector('[data-toggle-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true })); // reset

      panelIn('admin-col-notif', 'Information projet saisies').querySelector('[data-hide-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      assertFalse(!!panelIn('admin-col-notif', 'Information projet saisies'), 'le volet masqué ne doit plus être dans le DOM');
      const chip = document.getElementById('admin-hidden-panels').querySelector('[data-restore-panel]');
      assertTrue(!!chip && chip.textContent.includes('Information projet saisies'), 'une puce "Information projet saisies" doit apparaître');
      assertTrue(!!chip.querySelector('svg'), 'la puce de restauration doit afficher une icône (œil ouvert), pas un "+" textuel');
      chip.dispatchEvent(new MouseEvent('click', { bubbles: true })); // restore, reset for other tests
      assertTrue(!!panelIn('admin-col-notif', 'Information projet saisies'), 'le volet doit réapparaître après restauration');
    });
  });

  describe('Administratif — bascule cartes / lignes', function () {
    it('la vue par défaut est "lignes", condensée sur une seule ligne par projet, et bascule vers "cartes" au clic', async function () {
      await loadFixtureState();
      const body = document.querySelector('#admin-col-notif .admin-panel-body');
      assertTrue(body.classList.contains('mode-rows'), 'le mode par défaut doit être "lignes"');
      const card = cardByAcronym(panelIn('admin-col-notif', 'Information projet saisies'), 'INNOVX');
      assertEqual(getComputedStyle(card).flexDirection, 'row', 'en mode lignes, une carte est une rangée horizontale (une seule ligne), pas empilée');
      document.getElementById('admin-toggle-view').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      assertTrue(document.querySelector('#admin-col-notif .admin-panel-body').classList.contains('mode-cards'), 'après bascule, mode "cartes"');
      document.getElementById('admin-toggle-view').dispatchEvent(new MouseEvent('click', { bubbles: true })); // reset pour les autres tests
    });
  });

  describe('Administratif — sous-onglets Notifications / Conventions (bandeau de filtre)', function () {
    it('Notifications est actif par défaut ; cliquer sur Conventions bascule l\'affichage sans repasser en 2 colonnes', async function () {
      await loadFixtureState();
      const notifTab = document.querySelector('[data-admin-tab="notif"]');
      const convTab = document.querySelector('[data-admin-tab="conv"]');
      const notifPanel = document.querySelector('[data-admin-panel="notif"]');
      const convPanel = document.querySelector('[data-admin-panel="conv"]');
      assertTrue(notifTab.classList.contains('is-active'), 'Notifications doit être l\'onglet actif par défaut');
      assertEqual(notifTab.getAttribute('aria-selected'), 'true');
      assertFalse(notifPanel.classList.contains('is-hidden'), 'le volet Notifications doit être visible par défaut');
      assertTrue(convPanel.classList.contains('is-hidden'), 'le volet Conventions doit être masqué par défaut');

      fireMouse(convTab, 'click');

      assertTrue(convTab.classList.contains('is-active'), 'Conventions doit devenir l\'onglet actif');
      assertEqual(convTab.getAttribute('aria-selected'), 'true');
      assertFalse(document.querySelector('[data-admin-panel="conv"]').classList.contains('is-hidden'), 'le volet Conventions doit devenir visible');
      assertTrue(document.querySelector('[data-admin-panel="notif"]').classList.contains('is-hidden'), 'le volet Notifications doit être masqué');
      assertFalse(document.querySelector('[data-admin-tab="notif"]').classList.contains('is-active'), 'Notifications ne doit plus être actif');

      fireMouse(document.querySelector('[data-admin-tab="notif"]'), 'click'); // reset pour les autres tests
    });
  });

  describe('Administratif — préférences utilisateur persistées (table Preferences_Widget, partagée avec le Kanban)', function () {
    it('ajoute ses colonnes Admin_* à la table Preferences_Widget si elle existe déjà (créée par le Kanban)', async function () {
      await loadFixtureState();
      await window.loadKanbanUserPreferences();
      const before = await window.CoreGrist.getTable('Preferences_Widget');
      assertFalse('Admin_notif_repliees' in before[0], 'la colonne Admin_notif_repliees ne doit pas exister avant le chargement Administratif');

      await window.loadAdministratifUserPreferences();

      const after = await window.CoreGrist.getTable('Preferences_Widget');
      assertTrue('Admin_notif_repliees' in after[0], 'la colonne Admin_notif_repliees doit avoir été ajoutée');
      const addColumnCalls = window.__TEST_CALLS__.filter(c => c.type === 'AddColumn' && c.table === 'Preferences_Widget');
      assertEqual(addColumnCalls.length, 8, 'les 4 colonnes Admin_notif/conv_repliees/masquees, les 3 colonnes de filtres et l\'onglet actif doivent être ajoutés');
      assertTrue(addColumnCalls.some(c => c.colId === 'Admin_onglet_actif'), 'colonne Admin_onglet_actif créée');
      const addTableCalls = window.__TEST_CALLS__.filter(c => c.type === 'AddTable' && c.table === 'Preferences_Widget');
      assertEqual(addTableCalls.length, 1, 'la table ne doit pas être recréée, seulement complétée');
    });

    it('crée elle-même la table (avec ses colonnes) si le Kanban ne l\'a pas encore fait', async function () {
      await loadFixtureState();
      const before = await window.CoreGrist.gristInstance.docApi.listTables();
      assertFalse(before.includes('Preferences_Widget'), 'la table ne doit pas exister avant tout chargement de préférences');

      await window.loadAdministratifUserPreferences();

      const rows = await window.CoreGrist.getTable('Preferences_Widget');
      assertEqual(rows.length, 1, 'une ligne doit avoir été créée');
      assertTrue('Admin_notif_repliees' in rows[0], 'la table auto-créée doit inclure les colonnes Admin_*');
    });

    it('réutilise la même ligne que le Kanban (id de ligne partagé via localStorage), sans doublon d\'AddRecord', async function () {
      await loadFixtureState();
      await window.loadKanbanUserPreferences();
      await window.loadAdministratifUserPreferences();
      const addRecordCalls = window.__TEST_CALLS__.filter(c => c.type === 'AddRecord' && c.table === 'Preferences_Widget');
      assertEqual(addRecordCalls.length, 1, 'Kanban et Administratif doivent partager la même ligne, pas en créer une seconde');
    });

    it('encode les volets repliés/masqués en liste d\'index séparés par virgules et enregistre par UpdateRecord', async function () {
      await loadFixtureState();
      await window.loadKanbanUserPreferences();
      await window.loadAdministratifUserPreferences();

      panelIn('admin-col-notif', 'Information projet saisies').querySelector('[data-toggle-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(0);
      panelIn('admin-col-notif', 'envoyée pour signature VP').querySelector('[data-hide-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(0);

      const rows = await window.CoreGrist.getTable('Preferences_Widget');
      assertEqual(rows.length, 1, 'toujours une seule ligne de préférences');
      // Index 0 explicitement replié ci-dessus ; 1/2/3/6 sont repliés par défaut
      // dès le premier rendu de la suite car ces volets n'ont aucun projet
      // (cf. fixtures Notifications) — comportement attendu, pas une régression.
      const collapsedNotif = rows[0].Admin_notif_repliees.split(',').map(Number).sort((a, b) => a - b);
      assertDeepEqual(collapsedNotif, [0, 1, 2, 3, 6], 'les volets vides par défaut + celui explicitement replié doivent être encodés');
      assertEqual(rows[0].Admin_notif_masquees, '4', 'le volet "envoyée pour signature VP" (index 4) doit être encodé comme masqué');

      // Nettoyage : restaurer l'état par défaut pour ne pas polluer les tests suivants.
      panelIn('admin-col-notif', 'Information projet saisies').querySelector('[data-toggle-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.getElementById('admin-hidden-panels').querySelector('[data-restore-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(0);
    });

    it('restaure l\'état des volets (repliés/masqués) à un rechargement ultérieur, dans le même navigateur', async function () {
      await loadFixtureState();
      await window.loadKanbanUserPreferences();
      await window.loadAdministratifUserPreferences();

      panelIn('admin-col-notif', 'Information projet saisies').querySelector('[data-toggle-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(0);
      panelIn('admin-col-notif', 'envoyée pour signature VP').querySelector('[data-hide-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(0);

      // Simule un rechargement de page : l'id de ligne reste en cache
      // (localStorage), un second appel doit donc retrouver et réappliquer
      // exactement cet état, sans créer de nouvelle ligne.
      await window.loadAdministratifUserPreferences();
      window.renderAdministratif();

      assertTrue(panelIn('admin-col-notif', 'Information projet saisies').classList.contains('is-collapsed'), 'le volet doit rester replié après rechargement');
      assertFalse(!!panelIn('admin-col-notif', 'envoyée pour signature VP'), 'le volet doit rester masqué après rechargement');

      const addRecordCalls = window.__TEST_CALLS__.filter(c => c.type === 'AddRecord' && c.table === 'Preferences_Widget');
      assertEqual(addRecordCalls.length, 1, 'le rechargement ne doit pas créer de nouvelle ligne de préférences');

      // Nettoyage : restaurer l'état par défaut pour ne pas polluer les tests suivants.
      panelIn('admin-col-notif', 'Information projet saisies').querySelector('[data-toggle-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.getElementById('admin-hidden-panels').querySelector('[data-restore-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(0);
    });

    it('persiste les filtres (Programme multi-sélection, Instance, recherche) — absents avant le 02/11/2026', async function () {
      await loadFixtureState();
      await window.loadKanbanUserPreferences();
      await window.loadAdministratifUserPreferences();

      const programmeInput = document.getElementById('admin-filter-programme');
      fire(programmeInput, 'focus');
      const list = document.getElementById('admin-filter-programme-list');
      ['Programme A', 'Programme B'].forEach(label => {
        const button = Array.from(list.querySelectorAll('[data-value]')).find(b => b.dataset.value === label);
        assertTrue(!!button, `option "${label}" introuvable dans admin-filter-programme`);
        fireMouse(button, 'mousedown');
      });
      const search = document.getElementById('admin-filter-search');
      setValue(search, 'INNOVX');
      fire(search, 'input');
      await wait(750); // la frappe dans la recherche est enregistrée en différé (une écriture après la dernière lettre)

      const rows = await window.CoreGrist.getTable('Preferences_Widget');
      assertDeepEqual(rows[0].Admin_filtre_programme.split(',').sort(), ['Programme A', 'Programme B'].sort(),
        'les deux programmes cochés doivent être enregistrés en liste séparée par des virgules');
      assertEqual(rows[0].Admin_filtre_recherche, 'INNOVX', 'la recherche doit être enregistrée');

      // Simule un rechargement de page : un second chargement doit retrouver et
      // réappliquer le filtre Programme multi-sélectionné et la recherche, sans
      // créer de nouvelle ligne de préférences.
      await window.loadAdministratifUserPreferences();
      window.renderAdministratif();

      assertEqual(document.getElementById('admin-filter-programme').value, '2 programmes sélectionnés', 'le résumé doit être restauré après rechargement');
      assertEqual(document.getElementById('admin-filter-search').value, 'INNOVX', 'la recherche doit être restaurée après rechargement');
      const addRecordCalls = window.__TEST_CALLS__.filter(c => c.type === 'AddRecord' && c.table === 'Preferences_Widget');
      assertEqual(addRecordCalls.length, 1, 'le rechargement ne doit pas créer de nouvelle ligne de préférences');

      // Nettoyage : réinitialiser les filtres pour ne pas polluer les tests suivants.
      document.getElementById('admin-clear-filters').click();
      await wait(0);
    });

    it('le filtre Instance est lui aussi multi-sélection (harmonisé avec Programme), et persiste la liste cochée', async function () {
      const tables = await loadTables();
      tables.Suivi_Instance.push({ id: 2, Nom: 'Comité innovation#4 - 2026-06-01' });
      tables.Projets.find(p => p.Acronyme === 'CONVENTIX').Instance_ratachee = 2;
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      await window.loadKanbanUserPreferences();
      await window.loadAdministratifUserPreferences();

      const input = document.getElementById('admin-filter-instance');
      fire(input, 'focus');
      const list = document.getElementById('admin-filter-instance-list');
      ['Comité innovation#3 - 2026-03-15', 'Comité innovation#4 - 2026-06-01'].forEach(label => {
        const button = Array.from(list.querySelectorAll('[data-value]')).find(b => b.dataset.value === label);
        assertTrue(!!button, `option "${label}" introuvable dans admin-filter-instance`);
        fireMouse(button, 'mousedown');
      });
      await wait(0);

      assertEqual(document.getElementById('admin-filter-instance').value, '2 instances sélectionnées', 'le résumé doit être accordé au féminin ("instances sélectionnées")');
      const rows = await window.CoreGrist.getTable('Preferences_Widget');
      assertDeepEqual(rows[0].Admin_filtre_instance.split(',').sort(),
        ['Comité innovation#3 - 2026-03-15', 'Comité innovation#4 - 2026-06-01'].sort(),
        'les deux instances cochées doivent être enregistrées en liste séparée par des virgules');

      // Nettoyage.
      document.getElementById('admin-clear-filters').click();
      await wait(0);
      await loadFixtureState(); // restaure les fixtures d'origine pour les tests suivants
    });
  });

  describe('Administratif — date de début du projet et code d\'urgence (Notifications et Conventions)', function () {
    const URGENCY = () => window.AdministratifUrgency;
    // 1er octobre 2026, fin d'après-midi : "aujourd'hui" est figé, les dates sont données en offset de jours.
    const TODAY = () => new Date(2026, 9, 1, 17, 45);
    const inDays = n => Math.floor(Date.UTC(2026, 9, 1 + n) / 1000);

    async function loadWithStartDates(dates, clock) {
      URGENCY().setClock(clock || TODAY);
      const tables = await loadTables();
      Object.entries(dates).forEach(([acronym, epoch]) => { tables.Projets.find(p => p.Acronyme === acronym).Date_debut_Projet = epoch; });
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
    }
    const restoreClock = () => URGENCY().setClock();
    const chipOf = (colId, label, acronym) => cardByAcronym(panelIn(colId, label), acronym).querySelector('[data-start-date]');
    const NOTIF_1 = 'Information projet saisies';
    const CONV_1 = 'Convention en redaction';

    it('seuils Notifications : rouge < 7 j (dates passées incluses), orange de 7 à 21 j, neutre jusqu\'à 60 j, vert au-delà', function () {
      const tone = days => URGENCY().toneFor('notif', days);
      [[-30, 'red'], [-1, 'red'], [0, 'red'], [6, 'red'], [7, 'orange'], [21, 'orange'], [22, 'neutral'], [60, 'neutral'], [61, 'green'], [400, 'green']]
        .forEach(([days, expected]) => assertEqual(tone(days), expected, `notifications, ${days} j`));
    });

    it('seuils Conventions : rouge < 14 j (dates passées incluses), orange < 30 j, neutre jusqu\'à 60 j, vert au-delà', function () {
      const tone = days => URGENCY().toneFor('conv', days);
      [[-30, 'red'], [0, 'red'], [13, 'red'], [14, 'orange'], [29, 'orange'], [30, 'neutral'], [60, 'neutral'], [61, 'green'], [400, 'green']]
        .forEach(([days, expected]) => assertEqual(tone(days), expected, `conventions, ${days} j`));
    });

    it('le même projet n\'a pas la même couleur dans les deux onglets : début dans 10 j = orange en Notifications, rouge en Conventions', async function () {
      try {
        await loadWithStartDates({ INNOVX: inDays(10) });
        assertEqual(chipOf('admin-col-notif', NOTIF_1, 'INNOVX').dataset.urgency, 'orange');
        assertEqual(chipOf('admin-col-conv', CONV_1, 'INNOVX').dataset.urgency, 'red');
      } finally { restoreClock(); }
    });

    it('début dans 25 j : neutre en Notifications, orange en Conventions ; dans 90 j : vert partout', async function () {
      try {
        await loadWithStartDates({ INNOVX: inDays(25), NOTIFY: inDays(90) });
        assertEqual(chipOf('admin-col-notif', NOTIF_1, 'INNOVX').dataset.urgency, 'neutral');
        assertEqual(chipOf('admin-col-conv', CONV_1, 'INNOVX').dataset.urgency, 'orange');
        assertEqual(chipOf('admin-col-notif', 'envoyée pour signature VP', 'NOTIFY').dataset.urgency, 'green');
        assertEqual(chipOf('admin-col-conv', CONV_1, 'NOTIFY').dataset.urgency, 'green');
      } finally { restoreClock(); }
    });

    it('affiche la date jj/mm/aaaa en lecture seule, avec l\'écart en jours dans l\'infobulle', async function () {
      try {
        await loadWithStartDates({ INNOVX: inDays(4) });
        const chip = chipOf('admin-col-notif', NOTIF_1, 'INNOVX');
        assertEqual(chip.querySelector('time').textContent, '05/10/2026');
        assertEqual(chip.querySelector('time').getAttribute('datetime'), '2026-10-05');
        assertIncludes(chip.title, 'dans 4 jours');
        assertIncludes(chip.title, 'urgent');
        assertIncludes(chip.querySelector('.visually-hidden').textContent, 'dans 4 jours', 'texte pour lecteurs d\'écran : la couleur n\'est pas seule');
        assertEqual(chip.querySelectorAll('input, textarea, button, a').length, 0, 'lecture seule : aucun champ ni bouton');
      } finally { restoreClock(); }
    });

    it('date vide ou illisible : rien du tout n\'est affiché (ni pastille, ni libellé, ni emplacement)', async function () {
      try {
        await loadWithStartDates({ INNOVX: null, NOTIFY: 'bientôt', CONVENTIX: 0, FINANCX: 8e12, COURSIX: NaN });
        assertEqual(document.querySelectorAll('#admin-col-notif .admin-start, #admin-col-conv .admin-start').length, 0, 'aucune pastille');
        assertEqual(document.querySelectorAll('#admin-col-notif time, #admin-col-conv time').length, 0, 'aucune date');
        assertFalse(/début du projet/i.test(document.getElementById('admin-col-notif').textContent + document.getElementById('admin-col-conv').textContent), 'aucun libellé');
      } finally { restoreClock(); }
    });

    it('une date passée est rouge ("il y a N jours"), « demain » et « aujourd\'hui » sont reconnus', async function () {
      try {
        await loadWithStartDates({ INNOVX: inDays(-3), NOTIFY: inDays(1), CONVENTIX: inDays(0) });
        const past = chipOf('admin-col-notif', NOTIF_1, 'INNOVX');
        assertEqual(past.dataset.urgency, 'red');
        assertIncludes(past.title, 'il y a 3 jours');
        assertIncludes(chipOf('admin-col-notif', 'envoyée pour signature VP', 'NOTIFY').title, 'demain');
        assertIncludes(chipOf('admin-col-conv', 'Convention en signature', 'CONVENTIX').title, 'aujourd\'hui');
      } finally { restoreClock(); }
    });

    it('étape terminée (Archivée / Convention signée) : la date reste visible mais sans couleur d\'alerte', async function () {
      try {
        await loadWithStartDates({ SIGNEX: inDays(2) });
        const archived = chipOf('admin-col-notif', 'Archivee', 'SIGNEX');
        const signed = chipOf('admin-col-conv', 'Convention signée de toutes les parties', 'SIGNEX');
        assertEqual(archived.dataset.urgency, 'neutral', 'Archivée : plus d\'urgence');
        assertEqual(signed.dataset.urgency, 'neutral', 'Convention signée : plus d\'urgence');
        assertEqual(signed.querySelector('time').textContent, '03/10/2026');
        assertFalse(archived.title.includes('urgent'));
      } finally { restoreClock(); }
    });

    it('« aujourd\'hui » est le jour calendaire local : 23 h 59 et 0 h 01 donnent le même écart', async function () {
      try {
        const epoch = inDays(1);
        URGENCY().setClock(() => new Date(2026, 9, 1, 23, 59));
        assertEqual(URGENCY().daysUntil(epoch), 1);
        URGENCY().setClock(() => new Date(2026, 9, 1, 0, 1));
        assertEqual(URGENCY().daysUntil(epoch), 1);
        URGENCY().setClock(() => new Date(2026, 9, 20, 12, 0)); // avant le passage à l'heure d'hiver (25/10)
        assertEqual(URGENCY().daysUntil(Math.floor(Date.UTC(2026, 10, 2) / 1000)), 13, 'insensible au changement d\'heure');
      } finally { restoreClock(); }
    });

    it('la pastille suit aussi la vue cartes, et se met à jour si la date change dans les données', async function () {
      try {
        await loadWithStartDates({ INNOVX: inDays(100) });
        assertEqual(chipOf('admin-col-notif', NOTIF_1, 'INNOVX').dataset.urgency, 'green');
        document.getElementById('admin-toggle-view').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        assertTrue(document.querySelector('#admin-col-notif .admin-panel-body').classList.contains('mode-cards'));
        assertEqual(chipOf('admin-col-notif', NOTIF_1, 'INNOVX').dataset.urgency, 'green', 'visible en vue cartes');
        window.CoreState.getTable('Projets').find(p => p.Acronyme === 'INNOVX').Date_debut_Projet = inDays(3);
        window.renderAdministratif();
        assertEqual(chipOf('admin-col-notif', NOTIF_1, 'INNOVX').dataset.urgency, 'red', 'recalculé au rendu suivant');
      } finally {
        document.getElementById('admin-toggle-view').dispatchEvent(new MouseEvent('click', { bubbles: true })); // reset pour les autres tests
        restoreClock();
      }
    });
  });

  describe('Administratif — l\'onglet Conventions ne liste que les projets avec une convention (case « Convention de reversement »)', function () {
    const convAcronyms = () => Array.from(document.querySelectorAll('#admin-col-conv .admin-card .project-acronym')).map(el => el.textContent).sort();
    async function loadWithFlags(flags) {
      const tables = await loadTables({ keepFlags: true });
      Object.entries(flags).forEach(([acronym, value]) => { tables.Projets.find(p => p.Acronyme === acronym).Convention_de_reversement = value; });
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      return tables;
    }

    it('un projet sans convention n\'apparaît pas dans « Convention en redaction », même avec la valeur par défaut de Grist (libellé sans numéro)', async function () {
      // Grist donne « Convention en redaction » (sans « 1) ») à TOUTE ligne : c'est le cas signalé par Antoine.
      await loadWithFlags({ INNOVX: false, COURSIX: false, FINANCX: false });
      const tables = window.CoreState.getTable('Projets');
      ['INNOVX', 'COURSIX', 'FINANCX'].forEach(acronym => { tables.find(p => p.Acronyme === acronym).Conventions_statut = 'Convention en redaction'; });
      window.renderAdministratif();
      assertEqual(document.querySelectorAll('#admin-col-conv .admin-panel')[0].querySelectorAll('.admin-card').length, 0, 'volet « Convention en redaction » vide');
      assertDeepEqual(convAcronyms(), ['CONVENTIX', 'SIGNEX'], 'seuls les projets avec convention sont listés');
    });

    it('les fixtures telles quelles : seuls CONVENTIX (en signature) et SIGNEX (signée) ont une convention', async function () {
      await loadWithFlags({});
      assertDeepEqual(convAcronyms(), ['CONVENTIX', 'SIGNEX']);
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en signature'), 'CONVENTIX'));
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention signée de toutes les parties'), 'SIGNEX'));
    });

    it('cocher la case fait apparaître le projet dans son volet d\'étape, la décocher le retire', async function () {
      await loadWithFlags({ INNOVX: false });
      assertFalse(convAcronyms().includes('INNOVX'));
      window.CoreState.getTable('Projets').find(p => p.Acronyme === 'INNOVX').Convention_de_reversement = true;
      window.renderAdministratif();
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX'), 'coché : dans « Convention en redaction » (étape 1)');
      window.CoreState.getTable('Projets').find(p => p.Acronyme === 'INNOVX').Convention_de_reversement = false;
      window.renderAdministratif();
      assertFalse(convAcronyms().includes('INNOVX'), 'décoché : retiré de tous les volets');
    });

    it('même lecture de la case que le Kanban : true, 1, « oui » ou « cochée » comptent ; false, 0, vide, null non', async function () {
      await loadWithFlags({ INNOVX: 1, NOTIFY: 'oui', FINANCX: 'cochée', COURSIX: 'true', INCONNUX: 0, CONVENTIX: '', SIGNEX: null });
      assertDeepEqual(convAcronyms(), ['COURSIX', 'FINANCX', 'INNOVX', 'NOTIFY']);
    });

    it('l\'onglet Notifications n\'est pas filtré par cette case', async function () {
      await loadWithFlags({ INNOVX: false, NOTIFY: false });
      assertTrue(!!cardByAcronym(panelIn('admin-col-notif', 'Information projet saisies'), 'INNOVX'), 'INNOVX reste en Notifications');
      assertTrue(!!cardByAcronym(panelIn('admin-col-notif', 'envoyée pour signature VP'), 'NOTIFY'), 'NOTIFY reste en Notifications');
    });
  });

  describe('Administratif — échappement HTML des données Grist', function () {
    it('échappe l\'acronyme avant de l\'insérer dans le HTML', async function () {
      const tables = await loadTables();
      tables.Projets[0].Acronyme = '<img src=x onerror=alert(1)>';
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      assertEqual(document.querySelectorAll('#admin-col-notif img').length, 0, 'aucune balise <img> injectée');
      assertTrue(Array.from(document.querySelectorAll('#admin-col-notif .project-acronym')).some(el => el.textContent === '<img src=x onerror=alert(1)>'), 'l\'acronyme s\'affiche tel quel, comme du texte');
    });
  });
})();
