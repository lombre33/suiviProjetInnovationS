/**
 * Non-regression suite : lecteur Publipostage+ (js/components/pp-reader.js) — la lecture épurée de Publipostage+ lui-même, dans une iframe pilotée
 * (demande d'Antoine du 23/11/2026 : ne pas refaire la lecture du courrier, inclure le mode lecture épurée de Publipostage+). Le widget imbriqué est le faux
 * publipostage+ (tests/fake-publipostage.html) : ?templates=1 (liste des modèles), ?modeui=1 (modes Édition/Lecture), ?reading=1 (menu de Lecture épurée
 * et classe `pp-clean-reading`), ?models=7:Courrier,9:Autre (options de la liste, ajoutées ?modelsAfter ms après le chargement).
 */
(function () {
  'use strict';

  const fake = (query) => ({ url: `${location.origin}/tests/fake-publipostage.html?templates=1&modeui=1&reading=1${query || ''}`, origin: location.origin });
  const FAST = { tickMs: 15, watchMs: 30, giveUpMs: 4000, absentTicks: 8 };

  async function loadFixtureState() {
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
  }

  // Un lecteur dans un conteneur jetable ; `phases` consigne les changements d'état.
  function makeReader(query, extra) {
    const container = document.createElement('div');
    container.style.cssText = 'position:absolute;left:0;top:0;width:600px;height:400px';
    document.body.appendChild(container);
    const phases = [];
    const reader = window.PpReader.create(Object.assign({ container, target: () => fake(query), onChange: (phase, note) => phases.push(phase + (note ? ':' + note : '')) }, FAST, extra || {}));
    return { reader, container, phases, done() { reader.destroy(); container.remove(); } };
  }
  const nestedOf = reader => reader.frame.contentWindow.__NESTED__;
  const bodyOf = reader => reader.frame.contentDocument.body;
  const WANT = { table: 'Projets', rowId: 10, modelId: 7 };

  describe('Lecteur Publipostage+ — pilotage de la lecture épurée', function () {
    it('selectModel : liste absente ou vide « waiting », autres modèles seulement « absent », modèle présent « set » (évènement change) puis « ok »', async function () {
      const frame = document.createElement('iframe');
      frame.src = fake('&models=7:Courrier,9:Autre').url;
      document.body.appendChild(frame);
      try {
        await waitFor(() => frame.contentDocument && frame.contentDocument.getElementById('template-select'), 'liste du faux publipostage+');
        const select = frame.contentDocument.getElementById('template-select');
        await waitFor(() => select.options.length === 3, 'options ajoutées');
        assertEqual(window.PpReader.selectModel(frame, 99), 'absent', 'des modèles sont listés, pas celui-ci');
        const events = []; select.addEventListener('change', () => events.push(select.value));
        assertEqual(window.PpReader.selectModel(frame, 7), 'set');
        assertDeepEqual(events, ['7'], 'l\'évènement change du chemin ordinaire de publipostage+');
        assertEqual(window.PpReader.selectModel(frame, 7), 'ok', 'déjà ouvert : rien de plus');
        assertDeepEqual(events, ['7']);
        frame.contentDocument.getElementById('template-select').innerHTML = '<option value="">— Nouveau modèle —</option>';
        assertEqual(window.PpReader.selectModel(frame, 7), 'waiting', 'liste encore vide');
      } finally { frame.remove(); }
    });

    it('ouvre le modèle puis la lecture épurée, malgré le démarrage de publipostage+ qui le ramène d\'abord en Édition', async function () {
      await loadFixtureState();
      const t = makeReader('&models=7:Courrier,9:Autre&modelsAfter=80&attachAfter=60&finalAfter=400');
      try {
        t.reader.show(WANT);
        assertEqual(t.reader.phase, 'loading');
        await waitFor(() => t.reader.phase === 'ready' && nestedOf(t.reader) && nestedOf(t.reader).mode === 'read' && nestedOf(t.reader).modeSwitches.includes('edit'), 'lecture épurée rétablie après le switchMode("edit") final', 6000);
        assertTrue(bodyOf(t.reader).classList.contains('pp-clean-reading'), 'classe de la lecture épurée sur <body>');
        assertDeepEqual(nestedOf(t.reader).opened, ['7'], 'le modèle demandé est ouvert une seule fois');
        assertTrue(t.phases[0].startsWith('loading') && t.phases[t.phases.length - 1] === 'ready', 'loading puis ready : ' + t.phases.join(' | '));
        await waitFor(() => nestedOf(t.reader).normal.some(e => e.record.id === 10), 'ligne présentée à publipostage+');
      } finally { t.done(); }
    });

    it('changer de projet n\'envoie que la ligne (select by) : même iframe, même modèle, aucun rechargement ni nouvelle ouverture', async function () {
      await loadFixtureState();
      const t = makeReader('&models=7:Courrier&attachAfter=30&finalAfter=150');
      try {
        t.reader.show(WANT);
        await waitFor(() => t.reader.phase === 'ready' && nestedOf(t.reader).mode === 'read', 'prêt', 6000);
        await wait(250);
        const frame = t.reader.frame, doc = frame.contentDocument, before = t.phases.length;
        t.reader.show(Object.assign({}, WANT, { rowId: 11 }));
        await waitFor(() => nestedOf(t.reader).normal.some(e => e.record.id === 11), 'la nouvelle ligne arrive dans publipostage+');
        assertTrue(t.reader.frame === frame && frame.contentDocument === doc, 'l\'iframe n\'a pas été rechargée');
        assertEqual(t.reader.phase, 'ready', 'pas de retour à « chargement » : le courrier reste affiché');
        assertEqual(t.phases.length, before, 'aucun changement de phase');
        assertDeepEqual(nestedOf(t.reader).opened, ['7'], 'le modèle n\'est pas rouvert');
        assertEqual(t.container.querySelectorAll('iframe').length, 1);
      } finally { t.done(); }
    });

    it('un autre modèle est ouvert dans la même iframe (phase « chargement » puis « prêt »)', async function () {
      await loadFixtureState();
      const t = makeReader('&models=7:Courrier,9:Autre&attachAfter=30&finalAfter=150');
      try {
        t.reader.show(WANT);
        await waitFor(() => t.reader.phase === 'ready' && nestedOf(t.reader).mode === 'read', 'prêt', 6000);
        await wait(250);
        const frame = t.reader.frame;
        t.reader.show(Object.assign({}, WANT, { modelId: 9 }));
        assertEqual(t.reader.phase, 'loading');
        await waitFor(() => t.reader.phase === 'ready' && nestedOf(t.reader).opened.length === 2, 'autre modèle ouvert');
        assertDeepEqual(nestedOf(t.reader).opened, ['7', '9']);
        assertTrue(t.reader.frame === frame);
      } finally { t.done(); }
    });

    it('un modèle absent de la liste de publipostage+ : échec rapide avec la raison, sans attendre le délai complet', async function () {
      await loadFixtureState();
      const t = makeReader('&models=7:Courrier');
      try {
        const t0 = Date.now();
        t.reader.show(Object.assign({}, WANT, { modelId: 99 }));
        await waitFor(() => t.reader.phase === 'failed', 'échec', 3000);
        assertIncludes(t.reader.note, 'pas dans la liste');
        assertTrue(Date.now() - t0 < 3000, 'bien avant giveUpMs');
        assertTrue(t.phases[t.phases.length - 1].startsWith('failed:'));
        // Un nouveau show() après l'échec ne relance rien : l'appelant a son repli, `retry()` réessaie.
        const frame = t.reader.frame;
        t.reader.show(WANT);
        assertEqual(t.reader.phase, 'failed');
        assertTrue(t.reader.frame === frame);
        t.reader.retry();
        assertEqual(t.reader.phase, 'loading');
        assertTrue(t.reader.frame !== frame, 'retry() recrée l\'iframe');
        assertEqual(t.container.querySelectorAll('iframe').length, 1);
        await waitFor(() => t.reader.phase === 'ready', 'modèle 7 enfin ouvert', 4000);
      } finally { t.done(); }
    });

    it('dès que la personne agit dans publipostage+, plus rien n\'est forcé (son Édition est respectée)', async function () {
      await loadFixtureState();
      const t = makeReader('&models=7:Courrier&attachAfter=30&finalAfter=500');
      try {
        t.reader.show(WANT);
        await waitFor(() => nestedOf(t.reader) && nestedOf(t.reader).mode === 'read', 'Lecture appliquée', 6000);
        t.reader.frame.contentDocument.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        await waitFor(() => nestedOf(t.reader).modeSwitches.includes('edit'), 'fin du démarrage de publipostage+', 6000);
        await wait(250);
        assertEqual(nestedOf(t.reader).mode, 'edit', 'le switchMode("edit") final n\'est pas contrarié');
        assertEqual(t.reader.phase, 'ready');
        assertIncludes(t.reader.note, 'repris la main');
      } finally { t.done(); }
    });

    it('destroy retire l\'iframe et le pont ; un lecteur détruit ne fait plus rien', async function () {
      await loadFixtureState();
      const t = makeReader('&models=7:Courrier');
      t.reader.show(WANT);
      assertEqual(t.container.querySelectorAll('iframe').length, 1);
      t.reader.destroy();
      assertEqual(t.container.querySelectorAll('iframe').length, 0);
      assertEqual(t.reader.phase, 'idle');
      t.reader.show(WANT);
      assertEqual(t.container.querySelectorAll('iframe').length, 0, 'plus rien après destroy');
      t.container.remove();
    });

    it('une page de publipostage+ qui ne répond pas : échec « connexion » au bout du délai, raison donnée', async function () {
      const t = makeReader('', { giveUpMs: 400, target: () => ({ url: `${location.origin}/tests/silent-widget.html`, origin: location.origin }) });
      try {
        t.reader.show(WANT);
        await waitFor(() => t.reader.phase === 'failed', 'échec', 3000);
        assertIncludes(t.reader.note, 'connexion');
      } finally { t.done(); }
    });
  });
})();
