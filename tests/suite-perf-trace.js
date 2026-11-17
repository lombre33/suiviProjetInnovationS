/**
 * Non-regression suite: panneau « Diagnostic de chargement » (js/core/perf-trace.js) — durée de chaque lecture Grist,
 * jalons, fichiers du widget ; ouverture au clavier / double-clic, copie, aucune donnée de projet dans le rapport.
 */
(function () {
  'use strict';

  const PT = () => window.PerfTrace;
  const keydown = (target, init) => target.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, init)));
  const panelText = () => { const el = document.querySelector('.perf-panel textarea'); return el ? el.value : null; };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  describe('Diagnostic de chargement — mesure des lectures', function () {
    it('track note début, fin et nombre de cellules, et renvoie le résultat tel quel', async function () {
      PT()._reset();
      const table = { id: [1, 2, 3], A: [1, 2, 3], B: [4, 5, 6] };
      const result = await PT().track('lecture : Test', () => new Promise(resolve => setTimeout(() => resolve(table), 15)), PT().cellsOfTable);
      assertEqual(result, table, 'résultat inchangé');
      const call = PT().calls().find(c => c.label === 'lecture : Test');
      assertTrue(!!call, 'lecture notée');
      assertEqual(call.cells, 9, '3 colonnes × 3 lignes');
      assertTrue(call.end - call.start >= 10, `durée mesurée : ${call.end - call.start} ms`);
    });

    it('une lecture en échec est notée avec son message puis l\'erreur est relancée (le widget garde son comportement)', async function () {
      PT()._reset();
      let caught = null;
      try { await PT().track('lecture : Absente', () => Promise.reject(new Error('table inconnue'))); } catch (err) { caught = err; }
      assertTrue(!!caught && caught.message === 'table inconnue', 'erreur relancée');
      assertEqual(PT().calls()[0].error, 'table inconnue');
      let thrown = null;
      try { await PT().track('lecture : Sync', () => { throw new Error('échec synchrone'); }); } catch (err) { thrown = err; }
      assertTrue(!!thrown && thrown.message === 'échec synchrone', 'échec synchrone aussi relancé');
    });

    it('la liste des lectures reste bornée (une longue session ne grossit pas sans fin)', async function () {
      PT()._reset();
      for (let i = 0; i < 260; i++) await PT().track('lecture : n' + i, () => Promise.resolve({ id: [] }));
      assertTrue(PT().calls().length <= 200, `lectures conservées : ${PT().calls().length}`);
      assertEqual(PT().calls().slice(-1)[0].label, 'lecture : n259', 'les plus récentes sont gardées');
    });

    it('CoreGrist.getTable note chaque lecture (nom de table et cellules) et loadColumnDescriptions les deux tables de métadonnées', async function () {
      PT()._reset();
      await window.CoreGrist.getTable('Projets');
      await window.CoreGrist.loadColumnDescriptions();
      const labels = PT().calls().map(c => c.label);
      assertTrue(labels.includes('lecture : Projets'), `lectures notées : ${labels.join(' | ')}`);
      assertTrue(PT().calls().find(c => c.label === 'lecture : Projets').cells > 0, 'cellules comptées');
      assertTrue(labels.includes('lecture : _grist_Tables') && labels.includes('lecture : _grist_Tables_column'), 'schéma noté aussi');
    });
  });

  describe('Diagnostic de chargement — rapport', function () {
    it('le rapport donne les jalons, les lectures (départ, durée) et le total cumulé / réel', async function () {
      PT()._reset();
      PT().mark('jalon de test');
      await Promise.all([PT().track('lecture : A', () => wait(10)), PT().track('lecture : B', () => wait(10))]);
      const text = PT().report();
      assertTrue(text.includes('Diagnostic de chargement'), 'titre');
      assertTrue(text.includes('Jalons'), 'section jalons');
      assertTrue(text.includes('jalon de test'), 'jalon listé');
      assertTrue(text.includes('Lectures Grist') && text.includes('lecture : A') && text.includes('lecture : B'), 'lectures listées');
      assertTrue(/2 lectures : \d+ ms du premier départ à la dernière fin, \d+ ms cumulées/.test(text), 'total cumulé / réel pour dire si le serveur les traite en série');
      assertTrue(text.includes('Fichiers du widget'), 'téléchargement des fichiers du widget');
    });

    it('aucune donnée de projet dans le rapport : seulement des noms de tables, des durées et des tailles', async function () {
      PT()._reset();
      const tables = await window.CoreGrist.loadAllTables();
      window.CoreState.setTable('Projets', tables.Projets);
      const text = PT().report();
      ['INNOVX', 'NOTIFY', 'SIGNEX', 'Prenom', 'NOM'].forEach(word => assertFalse(text.includes(word), `« ${word} » ne doit pas apparaître dans le rapport`));
    });

    it('un navigateur sans Resource Timing ne casse pas le rapport', function () {
      const original = window.performance.getEntriesByType;
      window.performance.getEntriesByType = () => { throw new Error('indisponible'); };
      try {
        assertTrue(PT().report().includes('Diagnostic de chargement'), 'rapport quand même produit');
      } finally { window.performance.getEntriesByType = original; }
    });
  });

  describe('Diagnostic de chargement — panneau', function () {
    it('s\'ouvre avec Alt+Maj+D, affiche le rapport et se ferme avec Échap', function () {
      try {
        keydown(document, { altKey: true, shiftKey: true, code: 'KeyD', key: 'D' });
        assertTrue(!!document.querySelector('.perf-panel'), 'panneau ouvert');
        assertTrue(panelText().includes('Diagnostic de chargement'), 'rapport affiché');
        assertEqual(document.querySelector('.perf-panel').parentElement, document.body, 'posé dans <body>');
        keydown(document, { key: 'Escape' });
        assertEqual(document.querySelector('.perf-panel'), null, 'fermé par Échap');
      } finally { PT().close(); }
    });

    it('le raccourci rebascule (ouvre puis ferme) et une autre combinaison ne fait rien', function () {
      try {
        keydown(document, { altKey: true, shiftKey: true, code: 'KeyD' });
        keydown(document, { altKey: true, shiftKey: true, code: 'KeyD' });
        assertEqual(document.querySelector('.perf-panel'), null, 'refermé');
        keydown(document, { altKey: true, code: 'KeyD' });
        keydown(document, { shiftKey: true, code: 'KeyD' });
        keydown(document, { ctrlKey: true, altKey: true, shiftKey: true, code: 'KeyD' });
        assertEqual(document.querySelector('.perf-panel'), null, 'jamais ouvert par erreur en saisissant du texte');
      } finally { PT().close(); }
    });

    it('un double-clic sur la pastille « S » du bandeau l\'ouvre', function () {
      const mark = document.createElement('span'); mark.className = 'brand-mark'; document.body.appendChild(mark);
      try {
        mark.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        assertTrue(!!document.querySelector('.perf-panel'), 'panneau ouvert');
      } finally { mark.remove(); PT().close(); }
    });

    it('« Copier » envoie le rapport au presse-papiers ; si la copie est refusée, le texte reste sélectionné et le dit', async function () {
      const sent = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: text => { sent.push(text); return Promise.resolve(); } } });
      try {
        PT().open();
        document.querySelector('[data-perf-copy]').click();
        await wait(0);
        assertEqual(sent.length, 1, 'une copie');
        assertTrue(sent[0].includes('Diagnostic de chargement'), 'le rapport est copié');
        assertTrue(document.querySelector('.perf-panel-status').textContent.includes('Copié'), 'confirmation affichée');
        PT().close();
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('refusé')) } });
        const originalExec = document.execCommand;
        document.execCommand = () => false;
        PT().open();
        document.querySelector('[data-perf-copy]').click();
        await wait(0);
        assertTrue(document.querySelector('.perf-panel-status').textContent.includes('Ctrl+C'), 'repli expliqué');
        document.execCommand = originalExec;
      } finally { delete navigator.clipboard; PT().close(); }
    });

    it('« Actualiser » relit le rapport (utile quand une lecture était encore en cours)', async function () {
      PT()._reset();
      try {
        PT().open();
        assertFalse(panelText().includes('lecture : Plus tard'), 'pas encore de lecture');
        await PT().track('lecture : Plus tard', () => Promise.resolve({ id: [] }));
        document.querySelector('[data-perf-refresh]').click();
        assertTrue(panelText().includes('lecture : Plus tard'), 'lecture visible après actualisation');
      } finally { PT().close(); }
    });
  });
})();
