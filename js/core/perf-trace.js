/**
 * Diagnostic de chargement.
 *
 * Mesure, dans le vrai Grist, où passe le temps entre l'ouverture du widget et l'affichage de la première page :
 *  - des jalons (HTML reçu, scripts exécutés, grist.ready terminé, tables lues, première page affichée…) ;
 *  - la durée de chaque lecture Grist (CoreGrist.getTable / loadColumnDescriptions passent par `track`) ;
 *  - le téléchargement des fichiers du widget et du script de l'API Grist (Resource Timing).
 *
 * Aucune donnée de projet n'est enregistrée : seulement des noms de tables, des durées et des tailles.
 * Ouverture du panneau : Alt+Maj+D (cliquer d'abord dans le widget) ou double-clic sur la pastille « S » du bandeau ;
 * le même texte est écrit dans la console du navigateur à la fin du démarrage. Le bouton « Copier » met le rapport
 * dans le presse-papiers pour le coller dans la conversation.
 *
 * Ce module ne dépend de rien et ne doit jamais empêcher le widget de démarrer : tout est dans des try/catch.
 */
(function (global) {
  'use strict';

  const MAX_CALLS = 200;
  // Adresse de ce fichier : le module « Colonnes » (column-audit.js) se charge à la demande, à côté, sans toucher à index.html.
  const SELF_SRC = global.document && global.document.currentScript ? global.document.currentScript.src : '';
  const now = () => (global.performance && typeof global.performance.now === 'function' ? global.performance.now() : Date.now());
  const marks = [];
  const calls = [];

  const round = value => Math.round(value);
  const pad = (text, size) => { text = String(text); return text.length >= size ? text : text + ' '.repeat(size - text.length); };
  const padLeft = (text, size) => { text = String(text); return text.length >= size ? text : ' '.repeat(size - text.length) + text; };

  function mark(name) {
    marks.push({ name, at: now() });
  }

  // Nombre de cellules d'une table lue par docApi.fetchTable (objet colonne → tableau) : de quoi comparer le poids des lectures.
  function cellsOfTable(table) {
    try {
      if (!table || !Array.isArray(table.id)) return 0;
      return (Object.keys(table).length) * table.id.length;
    } catch (err) { return 0; }
  }

  // Exécute `start()` (qui renvoie une promesse) en notant début, fin et éventuelle erreur ; renvoie la promesse d'origine.
  function track(label, start, cellsOf) {
    const entry = { label, start: now(), end: null };
    calls.push(entry);
    if (calls.length > MAX_CALLS) calls.shift();
    let promise;
    try { promise = Promise.resolve(start()); } catch (err) { promise = Promise.reject(err); }
    return promise.then(result => {
      entry.end = now();
      if (cellsOf) { try { entry.cells = cellsOf(result); } catch (err) { /* sans objet */ } }
      return result;
    }, err => {
      entry.end = now();
      entry.error = (err && err.message) || String(err);
      throw err;
    });
  }

  function navigationTimings() {
    try {
      const nav = global.performance.getEntriesByType('navigation')[0];
      if (!nav) return [];
      return [
        ['HTML reçu (fin de réponse)', nav.responseEnd],
        ['DOMContentLoaded (scripts exécutés)', nav.domContentLoadedEventEnd],
        ['load (tous les fichiers reçus)', nav.loadEventEnd]
      ].filter(([, at]) => at > 0);
    } catch (err) { return []; }
  }

  function resourceLines() {
    const lines = [];
    try {
      const entries = global.performance.getEntriesByType('resource');
      if (!entries.length) return lines;
      const own = entries.filter(e => e.name.indexOf(global.location.origin) === 0);
      const fromCache = e => e.transferSize === 0 && e.decodedBodySize > 0;
      const bytes = own.reduce((sum, e) => sum + (e.transferSize || 0), 0);
      const span = own.length ? Math.max(...own.map(e => e.responseEnd)) - Math.min(...own.map(e => e.startTime)) : 0;
      lines.push(`Fichiers du widget : ${own.length} (${own.filter(fromCache).length} servis par le cache du navigateur), ${round(bytes / 1024)} ko transférés,`);
      lines.push(`  du premier départ à la dernière réception : ${round(span)} ms`);
      const slow = entries.slice().sort((a, b) => b.duration - a.duration).slice(0, 8);
      lines.push('Les plus longs (durée, départ → fin, nom) :');
      slow.forEach(e => {
        const name = e.name.replace(global.location.origin + '/', '').replace(/^https?:\/\//, '');
        lines.push(`  ${padLeft(round(e.duration), 5)} ms  ${padLeft(round(e.startTime), 5)} → ${padLeft(round(e.responseEnd), 5)}  ${name}${fromCache(e) ? ' (cache)' : ''}`);
      });
    } catch (err) { /* Resource Timing indisponible */ }
    return lines;
  }

  // Section « Accès » (permissions Grist) : js/core/access-diagnostic.js, quand il est chargé.
  function accessLines() {
    try { return global.CoreAccess && typeof global.CoreAccess.reportLines === 'function' ? global.CoreAccess.reportLines() : []; }
    catch (err) { return ['Permissions et accès : rapport indisponible (' + ((err && err.message) || err) + ')']; }
  }

  // Section « Colonnes » (mesure des colonnes de Projets) : js/core/column-audit.js, chargé à la demande.
  function columnLines() {
    try { return global.ColumnAudit ? global.ColumnAudit.reportLines() : ['Colonnes : rien de mesuré. Clique sur « Mesurer les colonnes de Projets » (lecture seule, quelques lectures Grist).']; }
    catch (err) { return ['Colonnes : rapport indisponible (' + ((err && err.message) || err) + ')']; }
  }
  function loadColumnAudit() {
    if (global.ColumnAudit) return Promise.resolve(global.ColumnAudit);
    return new Promise((resolve, reject) => {
      const script = global.document.createElement('script');
      script.src = api.columnAuditUrl;
      script.onload = () => (global.ColumnAudit ? resolve(global.ColumnAudit) : reject(new Error('module des colonnes absent')));
      script.onerror = () => reject(new Error('module des colonnes introuvable'));
      global.document.head.appendChild(script);
    });
  }

  // `section` : 'load' (chargement seul), 'access' (permissions seules), 'columns' (mesure des colonnes) ; sans argument, le rapport complet.
  function report(section) {
    if (section === 'access') return accessLines().join('\n');
    if (section === 'columns') return columnLines().join('\n');
    const lines = [];
    lines.push('Diagnostic de chargement — widget Suivi Projet InnovationS');
    lines.push(`Date : ${new Date().toLocaleString('fr-FR')}`);
    lines.push(`Navigateur : ${(global.navigator && global.navigator.userAgent) || 'inconnu'}`);
    lines.push('');
    lines.push('Jalons (ms depuis le début du chargement de la page ; entre parenthèses, le temps depuis le jalon précédent)');
    const steps = navigationTimings().map(([name, at]) => ({ name, at })).concat(marks).sort((a, b) => a.at - b.at);
    let previous = 0;
    steps.forEach(step => {
      lines.push(`  ${padLeft(round(step.at), 6)}  (+${padLeft(round(step.at - previous), 5)})  ${step.name}`);
      previous = step.at;
    });
    lines.push('');
    lines.push('Lectures Grist (dans l\'ordre de départ ; départ et durée en ms)');
    if (!calls.length) lines.push('  aucune');
    calls.slice().sort((a, b) => a.start - b.start).forEach(call => {
      const duration = call.end == null ? 'en cours' : `${padLeft(round(call.end - call.start), 5)} ms`;
      const cells = call.cells != null ? `  ${call.cells} cellules` : '';
      lines.push(`  ${padLeft(round(call.start), 6)}  ${pad(duration, 9)}  ${call.label}${cells}${call.error ? '  ERREUR : ' + call.error : ''}`);
    });
    const finished = calls.filter(c => c.end != null);
    if (finished.length > 1) {
      const wall = Math.max(...finished.map(c => c.end)) - Math.min(...finished.map(c => c.start));
      const total = finished.reduce((sum, c) => sum + (c.end - c.start), 0);
      lines.push(`  → ${finished.length} lectures : ${round(wall)} ms du premier départ à la dernière fin, ${round(total)} ms cumulées`);
      lines.push(`    (cumulé ≈ durée réelle : le serveur les traite l'une après l'autre ; cumulé ≫ durée réelle : elles s'exécutent en parallèle)`);
    }
    lines.push('');
    resourceLines().forEach(line => lines.push(line));
    if (section !== 'load') {
      const access = accessLines();
      if (access.length) { lines.push(''); lines.push('='.repeat(78)); access.forEach(line => lines.push(line)); }
      if (global.ColumnAudit && global.ColumnAudit.last()) { lines.push(''); lines.push('='.repeat(78)); columnLines().forEach(line => lines.push(line)); }
    }
    return lines.join('\n');
  }

  // --- Panneau d'affichage -----------------------------------------------------------------------
  let panel = null;
  function close() {
    if (panel) { panel.remove(); panel = null; }
    global.document.removeEventListener('keydown', onPanelKey, true);
  }
  function onPanelKey(event) { if (event.key === 'Escape') { event.stopPropagation(); close(); } }
  function copyReport(textarea, status) {
    textarea.focus(); textarea.select();
    const done = ok => { status.textContent = ok ? 'Copié : colle-le dans la conversation.' : 'Copie impossible : le texte est sélectionné, fais Ctrl+C.'; };
    try {
      if (global.navigator && global.navigator.clipboard && typeof global.navigator.clipboard.writeText === 'function') {
        global.navigator.clipboard.writeText(textarea.value).then(() => done(true), () => done(global.document.execCommand('copy')));
        return;
      }
      done(global.document.execCommand('copy'));
    } catch (err) { done(false); }
  }
  // `options.tab` : 'load' (chargement, par défaut), 'access' (permissions : ouverte par la pastille ⚠ et par les messages d'erreur) ou 'columns'.
  function open(options) {
    if (!global.document || !global.document.body) return null;
    close();
    let tab = options && (options.tab === 'access' || options.tab === 'columns') ? options.tab : 'load';
    panel = global.document.createElement('div');
    panel.className = 'perf-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Diagnostic de chargement et d\'accès');
    panel.innerHTML = '<div class="perf-panel-head"><strong>Diagnostic</strong>' +
      '<span class="perf-panel-tabs" role="tablist"><button type="button" class="perf-tab" role="tab" data-perf-tab="load">Chargement</button>' +
      '<button type="button" class="perf-tab" role="tab" data-perf-tab="access">Accès</button>' +
      '<button type="button" class="perf-tab" role="tab" data-perf-tab="columns">Colonnes</button></span>' +
      '<span class="perf-panel-status" role="status"></span>' +
      '<button type="button" class="btn btn-secondary" data-perf-probe title="Relit les tables et cherche les règles d\'accès (propriétaires) : quelques appels Grist, uniquement à votre demande">Tester les accès</button>' +
      '<button type="button" class="btn btn-secondary" data-perf-columns title="Lit le document (remplissage, formules, modèles Publipostage+, vues, règles d\'accès) pour dire quelles colonnes de Projets ne servent plus : lecture seule, rien n\'est modifié">Mesurer les colonnes de Projets</button>' +
      '<button type="button" class="btn btn-secondary" data-perf-refresh>Actualiser</button>' +
      '<button type="button" class="btn btn-primary" data-perf-copy>Copier</button>' +
      '<button type="button" class="btn btn-secondary" data-perf-close aria-label="Fermer">Fermer</button></div>' +
      '<textarea class="perf-panel-text" readonly spellcheck="false" aria-label="Rapport de diagnostic"></textarea>';
    const textarea = panel.querySelector('textarea'), status = panel.querySelector('.perf-panel-status');
    const probeButton = panel.querySelector('[data-perf-probe]');
    probeButton.hidden = !(global.CoreAccess && typeof global.CoreAccess.probe === 'function');
    const columnsButton = panel.querySelector('[data-perf-columns]');
    const show = () => {
      textarea.value = report(tab);
      panel.querySelectorAll('[data-perf-tab]').forEach(button => { const on = button.dataset.perfTab === tab; button.classList.toggle('is-on', on); button.setAttribute('aria-selected', String(on)); });
      textarea.scrollTop = 0;
    };
    panel.querySelectorAll('[data-perf-tab]').forEach(button => button.addEventListener('click', () => { tab = button.dataset.perfTab; status.textContent = ''; show(); }));
    // « Copier » met toujours le rapport complet (chargement + accès) : c'est ce qu'on colle dans la conversation.
    panel.querySelector('[data-perf-copy]').addEventListener('click', () => { const view = textarea.value; textarea.value = report(); copyReport(textarea, status); textarea.value = view; });
    panel.querySelector('[data-perf-refresh]').addEventListener('click', () => { show(); status.textContent = ''; });
    probeButton.addEventListener('click', async () => {
      status.textContent = 'Test en cours…'; probeButton.disabled = true;
      try { await global.CoreAccess.probe(); tab = 'access'; status.textContent = 'Test terminé.'; }
      catch (err) { status.textContent = 'Test impossible : ' + ((err && err.message) || err); }
      probeButton.disabled = false; show();
    });
    columnsButton.addEventListener('click', async () => {
      status.textContent = 'Mesure en cours…'; columnsButton.disabled = true;
      try { const audit = await loadColumnAudit(); await audit.measure('Projets'); tab = 'columns'; status.textContent = 'Mesure terminée : « Copier » puis colle-la dans la conversation.'; }
      catch (err) { tab = 'columns'; status.textContent = 'Mesure impossible : ' + ((err && err.message) || err); }
      columnsButton.disabled = false; show();
    });
    panel.querySelector('[data-perf-close]').addEventListener('click', close);
    show();
    global.document.body.appendChild(panel);
    global.document.addEventListener('keydown', onPanelKey, true);
    return panel;
  }
  function toggle() { return panel ? (close(), null) : open(); }

  function logToConsole() {
    try { console.info('[Suivi] ' + report()); } catch (err) { /* console indisponible */ }
  }

  function wire() {
    try {
      global.document.addEventListener('keydown', event => {
        if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyD') { event.preventDefault(); toggle(); }
      });
      global.document.addEventListener('dblclick', event => {
        if (event.target && event.target.closest && event.target.closest('.brand-mark')) toggle();
      });
    } catch (err) { /* sans objet */ }
  }

  mark('perf-trace.js exécuté (début des scripts du widget)');
  if (global.document) {
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', wire); else wire();
  }

  const api = global.PerfTrace = {
    // Adresse du module « Colonnes » (à côté de ce fichier) ; les tests, qui évaluent le code sans balise <script>, la fixent eux-mêmes.
    columnAuditUrl: SELF_SRC ? SELF_SRC.replace(/perf-trace\.js(\?.*)?$/, 'column-audit.js$1') : 'js/core/column-audit.js',
    mark, track, cellsOfTable, report, open, close, toggle, logToConsole,
    calls: () => calls.slice(), marks: () => marks.slice(),
    _reset() { marks.length = 0; calls.length = 0; close(); }
  };
})(window);
