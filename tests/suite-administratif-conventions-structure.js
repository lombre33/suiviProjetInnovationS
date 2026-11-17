/**
 * Non-regression suite : page Administratif, onglet Conventions — structure STABLE des cartes en vue lignes.
 * Retour d'Antoine du 17/11/2026 (« assez déstructuré, les éléments ne sont pas alignés ») : variante B retenue —
 * grille CSS à colonnes de largeur fixe, titres des colonnes dans l'en-tête du volet, un PDF visible + « +N »,
 * 3 responsables (ou 2 + « +N »). Ici, le CSS RÉEL est injecté (les autres suites n'en chargent aucun) et on MESURE :
 * quel que soit le contenu d'une carte (lien, PDF, 3 PDF, 4 responsables, commentaire très long, convention signée…),
 * chaque colonne commence au même x et chaque carte a la même hauteur.
 * Fixtures (tests/fixtures.js) : INNOVX/NOTIFY en « redaction », CONVENTIX en « signature », SIGNEX « signée ».
 */
(function () {
  'use strict';

  const FILE_COLUMN = 'Convention_de_reversement_le_cas_echeant';
  const WIDE = 1200; // largeur de l'application pendant les mesures (> à la limite de compaction de 1248 px sur la fenêtre, voir plus bas)

  const collapsedByUs = []; // volets que le test a dû déplier (l'état replié est mémorisé par les tests précédents)

  // Injecte le CSS réel, affiche l'application et l'onglet Conventions le temps de `fn`, puis remet tout comme avant.
  async function withLayout(fn, { width = WIDE } = {}) {
    const styles = [];
    for (const href of ['../style.css', '../kanban.css', '../css/administratif.css']) {
      const style = document.createElement('style');
      style.textContent = await (await fetch(href, { cache: 'no-store' })).text();
      document.head.appendChild(style);
      styles.push(style);
    }
    const host = document.getElementById('app-dom'), before = host.getAttribute('style');
    host.style.cssText = `display:block;position:absolute;left:0;top:0;width:${width}px`;
    document.querySelectorAll('.view').forEach(view => { if (view.id !== 'view-administratif') view.classList.add('hidden'); });
    document.getElementById('view-administratif').classList.remove('hidden');
    try { await fn(); } finally {
      collapsedByUs.splice(0).forEach(key => document.querySelector(`[data-toggle-panel="${key}"]`)?.click()); // remet les volets comme avant
      document.querySelector('[data-admin-tab="notif"]')?.click();
      document.querySelectorAll('.view').forEach(view => { if (view.id !== 'view-administratif') view.classList.remove('hidden'); });
      if (before == null) host.removeAttribute('style'); else host.setAttribute('style', before);
      styles.forEach(style => style.remove());
    }
  }

  // Charge un état où les cartes ont des contenus très différents, puis ouvre l'onglet Conventions.
  async function load({ mutate } = {}) {
    const tables = await window.CoreGrist.loadAllTables();
    tables.Projets.forEach(project => { project.Convention_de_reversement = true; });
    const by = acronym => tables.Projets.find(p => p.Acronyme === acronym);
    // Contenus volontairement hétérogènes : sans rien / avec lien / avec PDF / 3 PDF / 4 responsables / long commentaire.
    tables.Projets.find(p => p.Acronyme === 'NOTIFY').Lien_convention = 'https://exemple.org/une/adresse/de/convention/tres/longue/qui/ne/doit/pas/pousser/les/colonnes';
    by('INNOVX').next_step_responsable = ['L', 1, 2, 3, 4];
    by('INNOVX').commentaire_general = 'Un commentaire très long '.repeat(30);
    by('CONVENTIX')[FILE_COLUMN] = ['L', 501, 502, 503];
    by('SIGNEX')[FILE_COLUMN] = ['L', 501];
    by('SIGNEX').Lien_convention = 'https://exemple.org/ancien-lien';
    tables.Annuaire.push(...[3, 4].map(id => ({ id, NOM: `Nom${id}`, Prenom: `Prenom${id}`, Email: `p${id}@example.org`, Telephone: '', Poste2: 0, nom_et_Prenom: `Prenom${id} Nom${id}` })));
    window.__mockSetTable('_grist_Attachments', { id: [501, 502, 503], fileName: ['Convention_avec_un_nom_de_fichier_vraiment_tres_long_et_encombrant.pdf', 'V2.pdf', 'V3.pdf'] });
    if (mutate) mutate(tables);
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    window.renderAdministratif();
    document.querySelector('[data-admin-tab="conv"]').click();
    document.querySelectorAll('#admin-col-conv .admin-panel.is-collapsed').forEach(panel => {
      const toggle = panel.querySelector('[data-toggle-panel]');
      if (panel.querySelector('.admin-card') && toggle) { collapsedByUs.push(toggle.dataset.togglePanel); toggle.click(); }
    });
    await wait(30); // noms des fichiers lus puis cellules réécrites
  }

  const allCards = () => Array.from(document.querySelectorAll('#admin-col-conv .admin-panel:not(.is-collapsed) .admin-card'));
  const cardOf = acronym => allCards().find(card => card.querySelector('.admin-card-identity .project-acronym')?.textContent === acronym);
  const panelOf = label => Array.from(document.querySelectorAll('#admin-col-conv .admin-panel')).find(section => section.querySelector('.admin-panel-header h4')?.textContent === label);
  const box = el => el.getBoundingClientRect();
  const round = n => Math.round(n * 2) / 2; // tolérance d'un demi-pixel
  // Pour chaque carte qui possède l'élément : sa coordonnée (`pick`) ; toutes doivent être identiques.
  function positions(selector, pick) {
    return allCards().map(card => ({ acronym: card.querySelector('.project-acronym').textContent, el: card.querySelector(selector) }))
      .filter(item => item.el).map(item => ({ acronym: item.acronym, value: round(pick(box(item.el))) }));
  }
  function assertSameEverywhere(selector, pick, label, minCards = 3) {
    const found = positions(selector, pick);
    assertTrue(found.length >= minCards, `${label} : au moins ${minCards} cartes à comparer (trouvé ${found.length})`);
    const first = found[0].value;
    found.forEach(item => assertEqual(item.value, first, `${label} : ${item.acronym} est à ${item.value}, la première carte à ${first}`));
  }

  describe('Administratif — Conventions (vue lignes) : structure stable, mesurée avec le CSS réel', function () {
    it('l\'état de test mélange bien les contenus (garde-fou : sinon les mesures ne prouveraient rien)', async function () {
      await withLayout(async () => {
        await load();
        assertTrue(allCards().length >= 4, 'au moins 4 cartes visibles');
        assertEqual(cardOf('CONVENTIX').querySelectorAll('[data-open-file]').length, 1, 'un PDF visible sur CONVENTIX');
        assertEqual(cardOf('CONVENTIX').querySelector('.admin-more').textContent, '+2', '+2 pour les deux autres PDF');
        assertTrue(!!cardOf('NOTIFY').querySelector('a[href^="https://exemple.org"]'), 'lien saisi sur NOTIFY');
        assertTrue(!!cardOf('SIGNEX').querySelector('.admin-signed-cell'), 'carte signée');
      });
    });

    it('chaque carte a la même hauteur et aucune ne déborde, quel que soit son contenu', async function () {
      await withLayout(async () => {
        await load();
        const heights = allCards().map(card => ({ a: card.querySelector('.project-acronym').textContent, h: round(box(card).height) }));
        heights.forEach(item => assertEqual(item.h, heights[0].h, `hauteur de ${item.a} (${item.h}) ≠ ${heights[0].h}`));
        allCards().forEach(card => assertTrue(card.scrollWidth <= card.clientWidth + 1, `${card.querySelector('.project-acronym').textContent} déborde en largeur (${card.scrollWidth} > ${card.clientWidth})`));
      });
    });

    it('chaque colonne commence au même x sur toutes les cartes : identité, statuts, commentaire, next step, dernière action, responsables, pièce/lien', async function () {
      await withLayout(async () => {
        await load();
        assertSameEverywhere('.admin-card-identity', r => r.left, 'identité');
        assertSameEverywhere('.admin-partners', r => r.left, 'statuts');
        assertSameEverywhere('[data-comment-project]', r => r.left, 'commentaire');
        assertSameEverywhere('[data-comment-project]', r => r.width, 'largeur du commentaire');
        assertSameEverywhere('[data-nextstep-project]', r => r.left, 'next step');
        assertSameEverywhere('[data-lastaction-project]', r => r.left, 'dernière action');
        assertSameEverywhere('[data-lastaction-project]', r => r.width, 'largeur de la dernière action');
        assertSameEverywhere('.admin-tags', r => r.left, 'responsables');
        // La cellule lien/PDF est collée au bord droit : même bord droit ET même largeur sur toutes les cartes.
        assertSameEverywhere('.admin-link-cell, .admin-file-cell', r => r.right, 'bord droit de la pièce / du lien');
        assertSameEverywhere('.admin-link-cell, .admin-file-cell', r => r.width, 'largeur de la pièce / du lien');
      });
    });

    it('un nom de fichier très long, un lien très long ou un commentaire très long ne déplacent rien (colonnes de largeur fixe)', async function () {
      await withLayout(async () => {
        await load();
        const file = cardOf('CONVENTIX').querySelector('.admin-file-name');
        assertTrue(box(file).right <= box(cardOf('CONVENTIX').querySelector('.admin-file-cell')).right + 1, 'le nom reste dans sa cellule');
        assertTrue(file.scrollWidth >= file.clientWidth, 'nom tronqué dans sa cellule plutôt que poussé');
        const comment = cardOf('INNOVX').querySelector('[data-comment-project]');
        assertEqual(round(box(comment).height), round(box(cardOf('NOTIFY').querySelector('[data-comment-project]')).height), 'le commentaire long ne grandit pas la carte');
      });
    });

    it('la convention signée (« Transmise au porteur le ») tient dans la même ligne et ne décale pas les colonnes de gauche', async function () {
      await withLayout(async () => {
        await load();
        const signed = cardOf('SIGNEX');
        assertEqual(round(box(signed).height), round(box(cardOf('NOTIFY')).height), 'même hauteur qu\'une carte ordinaire');
        const cell = signed.querySelector('.admin-signed-cell');
        assertTrue(box(cell).right <= box(signed).right + 1 && box(cell).left >= box(signed).left, 'dans la carte');
      });
    });

    it('les titres de colonnes sont dans l\'en-tête du volet, alignés sur les champs des cartes', async function () {
      await withLayout(async () => {
        await load();
        const panel = panelOf('Convention en redaction');
        const heads = panel.querySelector('.admin-panel-header');
        assertTrue(heads.classList.contains('has-colheads'), 'en-tête à colonnes');
        const text = heads.querySelector('.admin-colhead-text'), last = heads.querySelector('.admin-colhead-last');
        const sample = panel.querySelector('.admin-card');
        assertEqual(round(box(text).left), round(box(sample.querySelector('[data-comment-project]')).left), 'titre « Commentaire · Next step » au-dessus du commentaire');
        assertEqual(round(box(last).left), round(box(sample.querySelector('[data-lastaction-project]')).left), 'titre « Dernière action » au-dessus de la date');
        assertIncludes(text.textContent, 'Next step');
        assertIncludes(last.textContent, 'Dernière action');
      });
    });

    it('en-têtes de colonnes : seulement sur les volets Conventions qui ont des cartes, jamais en vue cartes ni sur Notifications', async function () {
      await withLayout(async () => {
        await load();
        const withCards = Array.from(document.querySelectorAll('#admin-col-conv .admin-panel')).filter(p => p.querySelector('.admin-card'));
        const empty = Array.from(document.querySelectorAll('#admin-col-conv .admin-panel')).filter(p => !p.querySelector('.admin-card'));
        assertTrue(withCards.length >= 2 && empty.length >= 1, 'des volets avec et sans cartes');
        withCards.forEach(p => assertTrue(!!p.querySelector('.admin-colhead'), 'titres sur un volet qui a des cartes'));
        empty.forEach(p => assertFalse(!!p.querySelector('.admin-colhead'), 'pas de titres sur un volet vide'));
        assertEqual(document.querySelectorAll('#admin-col-notif .admin-colhead').length, 0, 'Notifications : aucun titre de colonne');
        document.getElementById('admin-toggle-view').click();
        try { assertEqual(document.querySelectorAll('#admin-col-conv .admin-colhead').length, 0, 'vue cartes : aucun titre de colonne'); }
        finally { document.getElementById('admin-toggle-view').click(); }
      });
    });

    it('4 responsables : 2 pastilles + « +2 » sans élargir la colonne (même x que les cartes à 0 ou 1 responsable)', async function () {
      await withLayout(async () => {
        await load();
        const card = cardOf('INNOVX');
        assertEqual(card.querySelectorAll('.admin-tag').length, 2);
        assertEqual(card.querySelector('.admin-avatar-more').textContent, '+2');
        const tags = card.querySelector('.admin-tags');
        assertTrue(tags.scrollWidth <= tags.clientWidth + 1, 'pastilles + « +N » + « ajouter » tiennent dans la colonne');
      });
    });

    it('vue cartes : la mise en page historique est conservée (cartes empilées, pas de grille)', async function () {
      await withLayout(async () => {
        await load();
        document.getElementById('admin-toggle-view').click();
        try {
          const card = document.querySelector('#admin-col-conv .mode-cards .admin-card-conv');
          assertTrue(!!card, 'carte en vue cartes');
          assertFalse(getComputedStyle(card).display === 'grid', 'pas de grille en vue cartes');
        } finally { document.getElementById('admin-toggle-view').click(); }
      });
    });

    it('Notifications et To Do ne sont pas touchées : mêmes cartes en flex, sans grille', async function () {
      await withLayout(async () => {
        await load();
        document.querySelector('[data-admin-tab="notif"]').click();
        const notifCard = document.querySelector('#admin-col-notif .admin-card');
        assertTrue(!!notifCard);
        assertFalse(getComputedStyle(notifCard).display === 'grid', 'Notifications : pas de grille');
      });
    });

    it('les dimensions des colonnes sont des variables --cv-* en px, partagées par la grille des cartes et celle des en-têtes (largeurs compactes ≤ 1248 px vérifiées à la main dans le widget réel)', async function () {
      await withLayout(async () => {
        await load();
        const root = document.querySelector('#admin-col-conv');
        ['--cv-grip', '--cv-id', '--cv-st', '--cv-last', '--cv-doc', '--cv-gap'].forEach(name => {
          const value = getComputedStyle(root).getPropertyValue(name).trim();
          assertTrue(/^\d+px$/.test(value), `${name} définie en px (« ${value} »)`);
        });
        const card = allCards()[0], head = card.closest('.admin-panel').querySelector('.admin-panel-header');
        assertEqual(getComputedStyle(card).display, 'grid', 'carte en grille');
        assertEqual(getComputedStyle(head).display, 'grid', 'en-tête en grille');
      });
    });
  });
})();
