/**
 * Non-regression suite : page Administratif, cartes Conventions et Notifications — « Dernière action » automatique.
 * Demande d'Antoine du 17/11/2026 : toute modification faite depuis une carte Conventions (puis Notifications) pose la date du
 * jour dans Projets.convention_Date_derniere_modification (dans la MÊME UpdateRecord), le champ restant
 * modifiable à la main. Fixtures (tests/fixtures.js) : INNOVX/NOTIFY en « redaction », CONVENTIX en
 * « signature » (UB « Relu », 2 partenaires), SIGNEX « signée de toutes les parties » ; la colonne vaut
 * null partout au départ. « Aujourd'hui » est figé au 17/11/2026 (AdministratifUrgency.setClock).
 */
(function () {
  'use strict';

  const STAMP = 'convention_Date_derniere_modification';
  const NOW = new Date(2026, 10, 17, 9, 30);
  const TODAY = '2026-11-17';
  const epochOf = iso => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 1000);

  // `dates` : { ACRONYME: 'AAAA-MM-JJ' } = « Dernière action » déjà renseignée ; `mutate(tables)` : autre mise en place.
  async function load({ dates = {}, mutate } = {}) {
    const tables = await window.CoreGrist.loadAllTables();
    tables.Projets.forEach(project => {
      project.Convention_de_reversement = true;
      if (dates[project.Acronyme]) project[STAMP] = epochOf(dates[project.Acronyme]);
    });
    if (mutate) mutate(tables);
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    window.renderAdministratif();
  }

  const panelIn = (colId, label) => Array.from(document.querySelectorAll(`#${colId} .admin-panel`))
    .find(section => section.querySelector('.admin-panel-header h4')?.textContent === label);
  const cardIn = (root, acronym) => Array.from(document.querySelectorAll(`#${root} .admin-card`))
    .find(card => card.querySelector('.admin-card-identity .project-acronym')?.textContent === acronym);
  const convCard = acronym => cardIn('admin-col-conv', acronym);
  const notifCard = acronym => cardIn('admin-col-notif', acronym);
  const stampInput = acronym => convCard(acronym).querySelector('[data-lastaction-project]');
  const projectRow = acronym => window.CoreState.getTable('Projets').find(p => p.Acronyme === acronym);
  const updates = () => window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && c.table === 'Projets');
  const writesOf = column => updates().filter(c => column in c.fields);
  const popoverEl = () => document.querySelector('.admin-popover');

  async function withClock(fn) {
    window.AdministratifUrgency.setClock(() => NOW);
    try { return await fn(); } finally { window.AdministratifUrgency.setClock(); window.AdministratifConv.closePopover(); }
  }
  async function pickDate(iso) {
    const input = popoverEl().querySelector('.admin-pop-date-input');
    setValue(input, iso);
    fire(input, 'change');
    await wait(0);
  }
  async function dragCardTo(card, panel) {
    const handle = card.querySelector('[data-drag-project]');
    const dt = new DataTransfer();
    const event = type => new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
    handle.dispatchEvent(event('dragstart'));
    panel.dispatchEvent(event('dragover'));
    panel.dispatchEvent(event('drop'));
    handle.dispatchEvent(event('dragend'));
    await wait(0);
  }
  async function editText(textarea, value) {
    setValue(textarea, value);
    fire(textarea, 'blur');
    await wait(0);
  }

  // Une action de carte par colonne écrite : { column, acronym, act }.
  const ACTIONS = {
    'glisser la carte vers un autre volet (étape)': {
      column: 'Conventions_statut', acronym: 'INNOVX',
      act: () => dragCardTo(convCard('INNOVX'), panelIn('admin-col-conv', 'Convention en relecture'))
    },
    'cliquer sur la pastille de statut d\'un signataire': {
      column: 'convention_statut_UB', acronym: 'INNOVX',
      act: async () => { fireMouse(convCard('INNOVX').querySelectorAll('.admin-partner-pill')[0], 'click'); await wait(0); }
    },
    'modifier le next step': {
      column: 'next_step', acronym: 'INNOVX',
      act: () => editText(convCard('INNOVX').querySelector('[data-nextstep-project]'), 'Relancer le juridique')
    },
    'modifier le commentaire libre': {
      column: 'comentaire_general_Suivi_projet', acronym: 'INNOVX',
      act: () => editText(convCard('INNOVX').querySelector('[data-comment-project]'), 'Relance faite')
    },
    'désigner un responsable du next step': {
      column: 'next_step_responsable', acronym: 'INNOVX',
      act: async () => {
        fireMouse(convCard('INNOVX').querySelector('[data-pop-anchor^="people:"]'), 'click');
        fireMouse(popoverEl().querySelector('[data-toggle-person="1"]'), 'click');
        await wait(0);
      }
    },
    'enregistrer le lien de la convention': {
      column: 'Lien_convention', acronym: 'INNOVX',
      act: async () => {
        convCard('INNOVX').querySelector('[data-edit-link]').click();
        const input = convCard('INNOVX').querySelector('[data-link-input]');
        setValue(input, 'https://exemple.org/convention.pdf');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await wait(0);
      }
    },
    'dater la transmission au porteur': {
      column: 'Transmise_signee_au_porteur_le', acronym: 'SIGNEX',
      act: async () => {
        fireMouse(convCard('SIGNEX').querySelector('[data-pop-anchor^="mail:"]'), 'click');
        await pickDate('2026-11-05');
      }
    },
    'dater une sous-étape de l\'UB': {
      column: 'convention_UB_v1_le', acronym: 'CONVENTIX',
      act: async () => {
        fireMouse(convCard('CONVENTIX').querySelector('[data-pop-anchor^="step-v1:"]'), 'click');
        await pickDate('2026-11-05');
      }
    }
  };

  describe('Administratif — Conventions : « Dernière action » mise à jour automatiquement', function () {
    Object.entries(ACTIONS).forEach(([label, { column, acronym, act }]) => {
      it(`${label} : la date du jour part dans la même écriture et le champ l'affiche`, async function () {
        await load();
        assertEqual(stampInput(acronym).value, '', 'prérequis : jamais renseignée');
        await withClock(act);
        const writes = writesOf(column);
        assertEqual(writes.length, 1, 'la colonne modifiée est écrite une seule fois');
        assertEqual(writes[0].fields[STAMP], epochOf(TODAY), 'la date du jour (minuit UTC) part avec la modification');
        assertEqual(writesOf(STAMP).length, 1, 'jamais d\'écriture séparée de la date');
        assertEqual(stampInput(acronym).value, TODAY, 'le champ de la carte affiche la date du jour');
        assertEqual(projectRow(acronym)[STAMP], epochOf(TODAY), 'et la valeur locale est à jour');
      });
    });

    it('le champ annonce qu\'il se met à jour tout seul et qu\'il reste modifiable', async function () {
      await load();
      const title = stampInput('INNOVX').title;
      assertIncludes(title, 'automatiquement');
      assertIncludes(title, 'à la main');
    });

    it('une modification qui ne change rien (champ quitté sans saisie) n\'écrit rien, date comprise', async function () {
      await load();
      await withClock(async () => { fire(convCard('INNOVX').querySelector('[data-nextstep-project]'), 'blur'); await wait(0); });
      assertEqual(updates().length, 0, 'aucune écriture');
      assertEqual(stampInput('INNOVX').value, '', 'la date n\'a pas bougé');
    });

    it('une date plus ancienne (saisie à la main ou précédente) est remise à la date du jour par la modification suivante', async function () {
      await load({ dates: { INNOVX: '2026-10-05' } });
      assertEqual(stampInput('INNOVX').value, '2026-10-05');
      await withClock(() => editText(convCard('INNOVX').querySelector('[data-nextstep-project]'), 'Nouvelle étape'));
      assertEqual(writesOf('next_step')[0].fields[STAMP], epochOf(TODAY));
      assertEqual(stampInput('INNOVX').value, TODAY);
    });

    it('déjà à la date du jour : la modification ne réécrit pas la date', async function () {
      await load({ dates: { INNOVX: TODAY } });
      await withClock(() => editText(convCard('INNOVX').querySelector('[data-nextstep-project]'), 'Nouvelle étape'));
      const writes = writesOf('next_step');
      assertEqual(writes.length, 1);
      assertFalse(STAMP in writes[0].fields, 'la colonne date n\'est pas dans l\'écriture');
    });

    it('seule la carte modifiée est datée : les autres projets gardent leur date', async function () {
      await load({ dates: { NOTIFY: '2026-10-05' } });
      await withClock(() => editText(convCard('INNOVX').querySelector('[data-nextstep-project]'), 'Nouvelle étape'));
      assertEqual(writesOf(STAMP).map(c => c.id).join(','), String(projectRow('INNOVX').id), 'une seule ligne écrite : INNOVX');
      assertEqual(stampInput('NOTIFY').value, '2026-10-05');
    });
  });

  describe('Administratif — Conventions : « Dernière action » modifiable à la main (forcer une date)', function () {
    const changeStamp = async (acronym, value) => {
      setValue(stampInput(acronym), value);
      fire(stampInput(acronym), 'change');
      await wait(0);
    };

    it('une date saisie à la main s\'écrit seule, telle quelle, sans être remplacée par la date du jour', async function () {
      await load();
      await withClock(() => changeStamp('INNOVX', '2026-11-10'));
      const writes = writesOf(STAMP);
      assertEqual(writes.length, 1, 'une seule écriture');
      assertDeepEqual(writes[0].fields, { [STAMP]: epochOf('2026-11-10') }, 'la date saisie, et rien d\'autre');
      assertEqual(stampInput('INNOVX').value, '2026-11-10');
    });

    it('vider la date à la main l\'efface (null) sans qu\'elle soit reposée aussitôt', async function () {
      await load({ dates: { INNOVX: '2026-10-05' } });
      await withClock(() => changeStamp('INNOVX', ''));
      const writes = writesOf(STAMP);
      assertEqual(writes.length, 1);
      assertEqual(writes[0].fields[STAMP], null);
      assertEqual(stampInput('INNOVX').value, '');
    });

    it('une saisie manuelle juste après un commentaire l\'emporte (même si l\'écriture du commentaire n\'a pas encore reçu de réponse)', async function () {
      await load();
      const api = window.grist.docApi, original = api.applyUserActions;
      const releases = [];
      api.applyUserActions = actions => new Promise(resolve => releases.push(() => resolve(original.call(api, actions))));
      try {
        await withClock(async () => {
          const comment = convCard('INNOVX').querySelector('[data-comment-project]');
          setValue(comment, 'Relance faite');
          fire(comment, 'blur'); // clic sur le champ voisin « Dernière action » : le commentaire part, daté d'aujourd'hui
          assertEqual(stampInput('INNOVX').value, TODAY, 'la date du jour est déjà affichée');
          await changeStamp('INNOVX', '2026-11-10'); // saisie manuelle avant la réponse de Grist
          releases.forEach(release => release());
          await wait(10);
        });
      } finally { api.applyUserActions = original; }
      const stored = await api.fetchTable('Projets');
      const at = stored.id.indexOf(projectRow('INNOVX').id);
      assertEqual(stored[STAMP][at], epochOf('2026-11-10'), 'la dernière écriture, celle de la saisie manuelle, fait foi dans Grist');
      assertEqual(stored.comentaire_general_Suivi_projet[at], 'Relance faite', 'le commentaire est bien enregistré aussi');
      assertEqual(projectRow('INNOVX')[STAMP], epochOf('2026-11-10'), 'valeur locale identique');
      assertEqual(stampInput('INNOVX').value, '2026-11-10');
    });
  });

  describe('Administratif — Notifications : « Dernière action » aussi sur les cartes Notifications (même colonne, même date)', function () {
    const notifInput = acronym => notifCard(acronym).querySelector('[data-lastaction-project]');
    const advanceCalls = async fn => {
      const api = window.grist.docApi, original = api.applyUserActions, batches = [];
      api.applyUserActions = actions => { batches.push(actions); return original.call(api, actions); };
      try { await fn(); } finally { api.applyUserActions = original; }
      return batches;
    };

    it('la carte Notifications affiche le champ « Dernière action », avec la date enregistrée et son infobulle', async function () {
      await load({ dates: { INNOVX: '2026-10-05' } });
      assertEqual(notifInput('INNOVX').value, '2026-10-05');
      assertIncludes(notifInput('INNOVX').title, 'automatiquement');
      assertEqual(notifCard('INNOVX').querySelector('.admin-lastaction .admin-field-label').textContent.trim(), 'Dernière action');
    });

    it('un commentaire modifié depuis une carte Notifications date la dernière action, dans la même écriture, et les deux cartes du projet affichent la date', async function () {
      await load();
      await withClock(() => editText(notifCard('INNOVX').querySelector('[data-comment-project]'), 'Relance porteur'));
      const writes = writesOf('comentaire_general_Suivi_projet');
      assertEqual(writes.length, 1);
      assertEqual(writes[0].fields[STAMP], epochOf(TODAY), 'la date du jour part avec le commentaire');
      assertEqual(writesOf(STAMP).length, 1, 'jamais d\'écriture séparée');
      assertEqual(notifInput('INNOVX').value, TODAY, 'la carte Notifications affiche la date');
      assertEqual(stampInput('INNOVX').value, TODAY, 'et la carte Conventions du même projet aussi');
    });

    it('faire avancer une notification (Suivant →) date la dernière action dans le MÊME appel Grist que le changement d\'étape', async function () {
      await load();
      let batches;
      await withClock(async () => {
        batches = await advanceCalls(async () => { fireMouse(notifCard('INNOVX').querySelector('[data-advance-notif]'), 'click'); await wait(0); });
      });
      assertEqual(batches.length, 1, 'un seul appel à Grist');
      assertDeepEqual(batches[0].map(a => [a[0], a[1]]), [['UpdateRecord', 'Notifications'], ['UpdateRecord', 'Projets']], 'la notification avance, le projet est daté');
      assertDeepEqual(batches[0][1][3], { [STAMP]: epochOf(TODAY) }, 'seule la date est écrite sur Projets');
      assertEqual(notifInput('INNOVX')?.value ?? stampInput('INNOVX').value, TODAY, 'la date est affichée après le rendu');
      assertEqual(projectRow('INNOVX')[STAMP], epochOf(TODAY), 'valeur locale à jour');
    });

    it('déjà daté d\'aujourd\'hui : « Suivant → » n\'écrit que la notification', async function () {
      await load({ dates: { INNOVX: TODAY } });
      let batches;
      await withClock(async () => {
        batches = await advanceCalls(async () => { fireMouse(notifCard('INNOVX').querySelector('[data-advance-notif]'), 'click'); await wait(0); });
      });
      assertEqual(batches.length, 1);
      assertEqual(batches[0].length, 1, 'une seule action : la notification');
      assertEqual(batches[0][0][1], 'Notifications');
    });

    it('« Suivant → » refusé par Grist : ni l\'étape ni la date ne bougent', async function () {
      await load({ dates: { INNOVX: '2026-10-05' } });
      const api = window.grist.docApi, original = api.applyUserActions;
      api.applyUserActions = async () => { throw new Error('boom'); };
      try {
        await withClock(async () => { fireMouse(notifCard('INNOVX').querySelector('[data-advance-notif]'), 'click'); await wait(0); });
      } finally { api.applyUserActions = original; }
      assertEqual(notifInput('INNOVX').value, '2026-10-05');
      assertEqual(projectRow('INNOVX')[STAMP], epochOf('2026-10-05'));
      assertTrue(!!cardIn('admin-col-notif', 'INNOVX').querySelector('[data-advance-notif]'), 'la carte est toujours là');
    });

    it('une date saisie à la main sur une carte Notifications s\'écrit seule, sans être remplacée, et la carte Conventions la reprend', async function () {
      await load();
      await withClock(async () => { setValue(notifInput('INNOVX'), '2026-11-10'); fire(notifInput('INNOVX'), 'change'); await wait(0); });
      const writes = writesOf(STAMP);
      assertEqual(writes.length, 1);
      assertDeepEqual(writes[0].fields, { [STAMP]: epochOf('2026-11-10') }, 'la date saisie, et rien d\'autre');
      assertEqual(projectRow('INNOVX')[STAMP], epochOf('2026-11-10'));
    });

    it('le bouton « Rédiger » (qui ouvre la page Rédaction) ne date rien : ce n\'est pas une modification de carte', async function () {
      await load();
      await withClock(async () => { notifCard('INNOVX').querySelector('[data-redact-notif]').dispatchEvent(new MouseEvent('click', { bubbles: true })); await wait(0); });
      assertEqual(writesOf(STAMP).length, 0);
    });
  });

  describe('Administratif — Conventions : « Dernière action » — colonne formule, absente ou écriture refusée', function () {
    async function markAsFormula() {
      window.__mockSetTable('_grist_Tables', { id: [1], tableId: ['Projets'] });
      window.__mockSetTable('_grist_Tables_column', { id: [1], parentId: [1], colId: [STAMP], type: ['Date'], isFormula: [true], formula: ['TODAY()'], widgetOptions: [''], description: [''] });
      await window.CoreGrist.loadColumnDescriptions();
      assertTrue(window.CoreGrist.isFormulaColumn('Projets', STAMP), 'prérequis : colonne calculée');
    }

    it('colonne formule : le widget ne l\'écrit jamais (la modification, elle, est enregistrée)', async function () {
      await markAsFormula();
      await load();
      await withClock(() => editText(convCard('INNOVX').querySelector('[data-nextstep-project]'), 'Nouvelle étape'));
      const writes = writesOf('next_step');
      assertEqual(writes.length, 1, 'la modification est enregistrée');
      assertFalse(STAMP in writes[0].fields, 'la colonne calculée n\'est pas dans l\'écriture');
      await withClock(() => dragCardTo(convCard('INNOVX'), panelIn('admin-col-conv', 'Convention en relecture')));
      assertEqual(writesOf(STAMP).length, 0, 'ni sur un changement d\'étape');
    });

    it('colonne absente de Projets : la modification est enregistrée normalement, sans erreur', async function () {
      await load({ mutate: tables => tables.Projets.forEach(project => { delete project[STAMP]; }) });
      await withClock(() => editText(convCard('INNOVX').querySelector('[data-nextstep-project]'), 'Nouvelle étape'));
      const writes = writesOf('next_step');
      assertEqual(writes.length, 1);
      assertFalse(STAMP in writes[0].fields, 'on n\'écrit pas une colonne qui n\'existe pas');
    });

    it('écriture refusée : la date affichée revient à la précédente (la modification et sa date partent ensemble, échouent ensemble)', async function () {
      await load({ dates: { INNOVX: '2026-10-05' } });
      const api = window.grist.docApi, original = api.applyUserActions;
      api.applyUserActions = async () => { throw new Error('boom'); };
      try {
        await withClock(() => editText(convCard('INNOVX').querySelector('[data-nextstep-project]'), 'Nouvelle étape'));
      } finally { api.applyUserActions = original; }
      assertEqual(stampInput('INNOVX').value, '2026-10-05', 'l\'ancienne date réapparaît');
      assertEqual(projectRow('INNOVX')[STAMP], epochOf('2026-10-05'), 'valeur locale restaurée');
      assertEqual(window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord').length, 0, 'rien n\'a atteint Grist');
    });

    it('statut de signature refusé par Grist : la date reste celle d\'avant, comme le statut', async function () {
      await load({ dates: { INNOVX: '2026-10-05' } });
      const api = window.grist.docApi, original = api.applyUserActions;
      api.applyUserActions = async () => { throw new Error('boom'); };
      try {
        await withClock(async () => { fireMouse(convCard('INNOVX').querySelectorAll('.admin-partner-pill')[0], 'click'); await wait(0); });
      } finally { api.applyUserActions = original; }
      assertEqual(stampInput('INNOVX').value, '2026-10-05');
      assertEqual(projectRow('INNOVX')[STAMP], epochOf('2026-10-05'));
    });
  });
}());
