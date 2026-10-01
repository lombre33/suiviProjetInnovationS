/**
 * Non-regression suite: page Administratif (js/pages/page-administratif.js).
 * Fixtures (tests/fixtures.js): INNOVX/NOTIFY/SIGNEX have a Notifications row,
 * FINANCX/COURSIX/INCONNUX deliberately don't (must appear in no Notifications
 * panel). CONVENTIX has 2 partners (CNRS, INSERM) + UB; SIGNEX has 1 (UBX) + UB.
 */
(function () {
  'use strict';

  async function loadFixtureState() {
    const tables = await window.CoreGrist.loadAllTables();
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
      const tables = await window.CoreGrist.loadAllTables();
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
      const tables = await window.CoreGrist.loadAllTables();
      tables.Projets.find(p => p.Acronyme === 'FINANCX').Conventions_statut = 'Convention en redaction';
      tables.Projets.find(p => p.Acronyme === 'COURSIX').Conventions_statut = 'convention EN RELECTURE';
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'FINANCX'));
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention en relecture'), 'COURSIX'));
    });

    it('une valeur inconnue ou vide n\'affiche le projet nulle part et ne provoque aucune erreur (dont les noms de propriété d\'objet)', async function () {
      const tables = await window.CoreGrist.loadAllTables();
      ['constructor', '__proto__', '', 'Autre chose'].forEach((value, i) => { tables.Projets[i].Conventions_statut = value; });
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      const acronyms = Array.from(document.querySelectorAll('#admin-col-conv .admin-card .project-acronym')).map(el => el.textContent);
      ['INNOVX', 'NOTIFY', 'CONVENTIX', 'FINANCX'].forEach(acr => assertFalse(acronyms.includes(acr), `${acr} (statut inconnu) ne doit apparaître dans aucun volet`));
    });
  });

  describe('Administratif — Conventions : champ "Next step"', function () {
    it('affiche, sous le commentaire, un second champ titré "Next step" alimenté par la colonne next_step', async function () {
      const tables = await window.CoreGrist.loadAllTables();
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

    it('n\'ajoute pas ce champ aux cartes Notifications', async function () {
      await loadFixtureState();
      assertEqual(document.querySelectorAll('#admin-col-notif [data-nextstep-project]').length, 0);
    });

    it('échappe le contenu de next_step (le texte reste du texte, aucune balise injectée)', async function () {
      const payload = '</textarea><img src=x onerror=alert(1)>';
      const tables = await window.CoreGrist.loadAllTables();
      tables.Projets.find(p => p.Acronyme === 'INNOVX').next_step = payload;
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      const card = cardByAcronym(panelIn('admin-col-conv', 'Convention en redaction'), 'INNOVX');
      assertEqual(document.querySelectorAll('#admin-col-conv img').length, 0, 'aucune balise <img> injectée');
      assertEqual(card.querySelector('[data-nextstep-project]').value, payload, 'le contenu s\'affiche tel quel, comme du texte');
    });

    it('ne réécrit pas next_step sur un simple passage dans le champ, même si le navigateur normalise sa valeur (CRLF, saut de ligne initial)', async function () {
      const tables = await window.CoreGrist.loadAllTables();
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

  describe('Administratif — Conventions : date de transmission au porteur (dernière étape uniquement)', function () {
    it('le champ date n\'apparaît que sur les cartes de la dernière étape', async function () {
      await loadFixtureState();
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention signée de toutes les parties'), 'SIGNEX').querySelector('input[type="date"][data-transmise-project]'), 'présent à la dernière étape');
      assertEqual(document.querySelectorAll('#admin-col-conv input[type="date"]').length, 1, 'absent de toutes les autres étapes');
      assertEqual(cardByAcronym(panelIn('admin-col-conv', 'Convention signée de toutes les parties'), 'SIGNEX').querySelector('.admin-done-badge').textContent, 'Signée');
    });

    it('enregistre la date (minuit UTC, format Grist) dans Transmise_signee_au_porteur_le, et null quand on l\'efface', async function () {
      await loadFixtureState();
      const input = () => cardByAcronym(panelIn('admin-col-conv', 'Convention signée de toutes les parties'), 'SIGNEX').querySelector('[data-transmise-project]');
      setValue(input(), '2026-10-05');
      fire(input(), 'change');
      await wait(0);
      const writes = () => window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && 'Transmise_signee_au_porteur_le' in c.fields);
      assertEqual(writes()[0].table, 'Projets');
      assertEqual(writes()[0].fields.Transmise_signee_au_porteur_le, epochOf('2026-10-05'));
      assertEqual(input().value, '2026-10-05', 'la valeur enregistrée est réaffichée telle quelle après rendu');
      setValue(input(), '');
      fire(input(), 'change');
      await wait(0);
      assertEqual(writes()[1].fields.Transmise_signee_au_porteur_le, null, 'effacer la date vide la colonne');
    });

    it('ne réécrit pas la colonne à chaque frappe partielle de l\'année (0002, 0020, 0202 avant 2026)', async function () {
      await loadFixtureState();
      const input = () => cardByAcronym(panelIn('admin-col-conv', 'Convention signée de toutes les parties'), 'SIGNEX').querySelector('[data-transmise-project]');
      for (const partial of ['0002-05-10', '0020-05-10', '0202-05-10']) { setValue(input(), partial); fire(input(), 'change'); }
      await wait(0);
      const writes = () => window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && 'Transmise_signee_au_porteur_le' in c.fields);
      assertEqual(writes().length, 0, 'aucune écriture pour des années implausibles');
      setValue(input(), '2026-05-10'); fire(input(), 'change');
      await wait(0);
      assertEqual(writes().length, 1);
      assertEqual(writes()[0].fields.Transmise_signee_au_porteur_le, epochOf('2026-05-10'));
    });

    it('affiche la date déjà enregistrée dans Grist', async function () {
      const tables = await window.CoreGrist.loadAllTables();
      tables.Projets.find(p => p.Acronyme === 'SIGNEX').Transmise_signee_au_porteur_le = epochOf('2026-09-30');
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      assertEqual(cardByAcronym(panelIn('admin-col-conv', 'Convention signée de toutes les parties'), 'SIGNEX').querySelector('[data-transmise-project]').value, '2026-09-30');
    });

    it('le champ date apparaît dès qu\'une carte est déposée dans la dernière étape', async function () {
      await loadFixtureState();
      await dragCardTo(cardByAcronym(panelIn('admin-col-conv', 'Convention en signature'), 'CONVENTIX'), panelIn('admin-col-conv', 'Convention signée de toutes les parties'));
      assertTrue(!!cardByAcronym(panelIn('admin-col-conv', 'Convention signée de toutes les parties'), 'CONVENTIX').querySelector('[data-transmise-project]'));
    });

    it('écrit sur la fiche Notifications si c\'est là que la colonne existe (table d\'origine non documentée)', async function () {
      const tables = await window.CoreGrist.loadAllTables();
      tables.Projets.forEach(p => { delete p.Transmise_signee_au_porteur_le; });
      tables.Notifications.forEach(n => { n.Transmise_signee_au_porteur_le = null; });
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      const input = cardByAcronym(panelIn('admin-col-conv', 'Convention signée de toutes les parties'), 'SIGNEX').querySelector('[data-transmise-project]');
      setValue(input, '2026-10-05');
      fire(input, 'change');
      await wait(0);
      const call = window.__TEST_CALLS__.find(c => c.type === 'UpdateRecord' && 'Transmise_signee_au_porteur_le' in c.fields);
      assertEqual(call.table, 'Notifications', 'la colonne vit dans Notifications → écriture sur Notifications');
      assertEqual(call.id, 4, 'fiche Notifications du projet SIGNEX (Projet = 16)');
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
      const tables = await window.CoreGrist.loadAllTables();
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
      const tables = await window.CoreGrist.loadAllTables();
      tables.Projets.find(p => p.Acronyme === 'INNOVX').Lien_convention = 'javascript:alert(1)';
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      assertEqual(document.querySelectorAll('#admin-col-conv a[href^="javascript"]').length, 0);
      assertEqual(convCard('INNOVX').querySelectorAll('a[href]').length, 0);
    });

    it('vider le champ supprime le lien', async function () {
      const tables = await window.CoreGrist.loadAllTables();
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
      const tables = await window.CoreGrist.loadAllTables();
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
      assertEqual(addColumnCalls.length, 4, 'les 4 colonnes Admin_notif/conv_repliees/masquees doivent être ajoutées');
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
  });

  describe('Administratif — échappement HTML des données Grist', function () {
    it('échappe l\'acronyme avant de l\'insérer dans le HTML', async function () {
      const tables = await window.CoreGrist.loadAllTables();
      tables.Projets[0].Acronyme = '<img src=x onerror=alert(1)>';
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      assertEqual(document.querySelectorAll('#admin-col-notif img').length, 0, 'aucune balise <img> injectée');
      assertTrue(Array.from(document.querySelectorAll('#admin-col-notif .project-acronym')).some(el => el.textContent === '<img src=x onerror=alert(1)>'), 'l\'acronyme s\'affiche tel quel, comme du texte');
    });
  });
})();
