#!/usr/bin/env node
/**
 * Banc de mesure des performances du widget (chargement + interactions), sans accès à
 * un vrai Grist : charge le VRAI index.html dans Chromium (Playwright), mais remplace
 * l'API Grist (https://docs.getgrist.com/grist-plugin-api.js, interceptée) par
 * tests/mock-grist.js alimenté avec un jeu de données synthétique à l'échelle d'un
 * vrai document (tests/perf/synthetic-data.js : ~300 projets de ~230 colonnes,
 * 800 personnes…) et un temps de réponse artificiel par appel docApi.
 *
 * Ce que ça mesure :
 *  - le NOMBRE d'appels Grist au démarrage et leur enchaînement (indépendant de la
 *    machine : c'est le levier n°1, chaque aller-retour postMessage + serveur coûte
 *    ~50-200 ms dans le vrai Grist) ;
 *  - le temps jusqu'aux premières cartes Kanban, jusqu'à ce que la navigation réponde,
 *    et le temps de blocage du fil principal (longtasks) ;
 *  - le coût de chaque interaction (frappe dans la recherche, changement de page…).
 *
 * Usage : node tests/perf/bench.js [--rtt=80] [--label=nom] [--out=fichier.json] [--runs=3]
 * Non lancé par la CI (run-headless.js ne lit que tests/index.html). Playwright est
 * résolu comme dans tests/run-headless.js.
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { buildSyntheticFixtures } = require('./synthetic-data');

const ROOT = path.join(__dirname, '..', '..');
const arg = (name, fallback) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const PORT = Number(arg('port', 8533));
const RTT_MS = Number(arg('rtt', 80));
const MS_PER_1000_CELLS = Number(arg('cell-ms', 1));
const RUNS = Number(arg('runs', 3));
const LABEL = arg('label', 'bench');
const OUT = arg('out', '');

function resolvePlaywright() {
  for (const candidate of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try { return require(candidate); } catch (err) { /* suivant */ }
  }
  throw new Error('Playwright introuvable (voir tests/run-headless.js).');
}

// Script servi à la place de grist-plugin-api.js : fixtures synthétiques + mock + latence.
function buildMockScript(fixtures) {
  const mock = fs.readFileSync(path.join(ROOT, 'tests', 'mock-grist.js'), 'utf8');
  return `
window.__FIXTURES__ = ${JSON.stringify(fixtures)};
${mock}
(function () {
  var cfg = { rtt: ${RTT_MS}, perKCell: ${MS_PER_1000_CELLS} };
  var calls = window.__BENCH_CALLS__ = [];
  var api = window.grist.docApi;
  var cellsOf = function (t) { var n = 0; if (t) for (var k in t) n += t[k].length; return n; };
  ['fetchTable', 'listTables', 'applyUserActions', 'getAccessToken'].forEach(function (name) {
    var original = api[name];
    api[name] = async function () {
      var args = arguments;
      var entry = { m: name, arg: typeof args[0] === 'string' ? args[0] : (Array.isArray(args[0]) ? args[0].map(function (a) { return a[0] + ':' + a[1]; }).join(',') : ''), start: performance.now() };
      calls.push(entry);
      var result = await original.apply(api, args);
      var cells = name === 'fetchTable' ? cellsOf(result) : 0;
      entry.cells = cells;
      await new Promise(function (r) { setTimeout(r, cfg.rtt + cells / 1000 * cfg.perKCell); });
      entry.end = performance.now();
      return result;
    };
  });
})();
`;
}

const INIT_SCRIPT = `
(function () {
  var marks = window.__MARKS__ = { longTasks: [] };
  try {
    new PerformanceObserver(function (list) { list.getEntries().forEach(function (e) { marks.longTasks.push({ start: e.startTime, dur: e.duration }); }); }).observe({ entryTypes: ['longtask'] });
  } catch (err) { /* longtask non supporté */ }
  document.addEventListener('DOMContentLoaded', function () {
    var obs = new MutationObserver(function () {
      var cards = document.querySelectorAll('#projects-kanban .project-card');
      if (cards.length && !marks.firstCards) marks.firstCards = performance.now();
      var admin = document.querySelectorAll('#admin-col-notif .admin-card');
      if (admin.length && !marks.adminRendered) marks.adminRendered = performance.now();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    // La navigation répond-elle ? Sonde un clic sur l'onglet Administratif, puis revient.
    var probe = setInterval(function () {
      var btn = document.querySelector('.nav-btn[data-view="view-administratif"]');
      var back = document.getElementById('btn-projects');
      if (!btn || !back || marks.navReady) return clearInterval(probe);
      btn.click();
      if (!document.getElementById('view-administratif').classList.contains('hidden')) {
        marks.navReady = performance.now();
        back.click();
        clearInterval(probe);
      }
    }, 15);
  });
})();
`;

const median = values => { const s = [...values].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

async function measureRun(browser, mockScript, baseUrl, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  if (options.prefsRowId) {
    // Utilisateur qui revient : son identifiant de ligne de préférences est déjà en cache (localStorage).
    await context.addInitScript(id => { try { localStorage.setItem('suiviProjetInnovationS:prefsRowId', String(id)); } catch (err) { /* ignore */ } }, options.prefsRowId);
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error' && !/net::ERR_FAILED/.test(msg.text())) errors.push(msg.text()); });
  await page.route('https://docs.getgrist.com/grist-plugin-api.js', route => route.fulfill({ contentType: 'application/javascript', body: mockScript }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  await page.addInitScript(INIT_SCRIPT);
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => window.__MARKS__ && window.__MARKS__.navReady, null, { timeout: 45000, polling: 50 });
  } catch (err) {
    throw new Error(`La navigation ne répond jamais (init bloquée ?). Erreurs page : ${errors.join(' | ') || 'aucune'}`);
  }
  await page.waitForTimeout(2500); // laisse passer tout rendu différé (idle) et les écritures de démarrage
  if (options.warmup) {
    // Premier lancement : crée colonnes, tables et ligne de préférences ; on photographie le document obtenu.
    await page.evaluate(() => document.querySelector('.nav-btn[data-view="view-instances"]').click());
    await page.waitForTimeout(6000);
    const snapshot = await page.evaluate(async () => {
      const out = {};
      for (const name of await grist.docApi.listTables()) out[name] = await grist.docApi.fetchTable(name);
      return { tables: out, prefsRowId: localStorage.getItem('suiviProjetInnovationS:prefsRowId') };
    });
    await context.close();
    return { snapshot };
  }

  const startup = await page.evaluate(() => {
    const calls = window.__BENCH_CALLS__.map(c => ({ m: c.m, arg: c.arg, start: Math.round(c.start), end: Math.round(c.end || 0), cells: c.cells || 0 }));
    const marks = window.__MARKS__;
    const blocking = marks.longTasks.reduce((sum, t) => sum + Math.max(0, t.dur - 50), 0);
    return { calls, firstCards: marks.firstCards, navReady: marks.navReady, adminRendered: marks.adminRendered || null, longTasks: marks.longTasks.length, blockingMs: Math.round(blocking), maxLongTask: Math.round(Math.max(0, ...marks.longTasks.map(t => t.dur))) };
  });

  // Interactions : durée jusqu'à 2 frames après l'action (rendu + mise en page).
  const timed = async (name, fn, argument) => page.evaluate(async ([label, src, a]) => {
    const f = new Function('return (' + src + ')')();
    const t0 = performance.now();
    await f(a);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { name: label, ms: Math.round((performance.now() - t0) * 10) / 10 };
  }, [name, fn.toString(), argument]);

  const interactions = [];
  const typeSearch = async value => { const el = document.getElementById('filter-search'); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
  interactions.push(await timed('Kanban : frappe dans la recherche (1re lettre)', typeSearch, 'A'));
  interactions.push(await timed('Kanban : frappe dans la recherche (2e lettre)', typeSearch, 'AC'));
  interactions.push(await timed('Kanban : recherche vidée', typeSearch, ''));
  interactions.push(await timed('Kanban : déplier « Projet en cours »', async () => { document.querySelector('[data-toggle-collapse="Projet en cours"]').click(); }));
  interactions.push(await timed('Kanban : replier « Projet en cours »', async () => { document.querySelector('[data-toggle-collapse="Projet en cours"]').click(); }));
  interactions.push(await timed('Kanban : ouvrir la liste Programme', async () => { document.getElementById('filter-programme').dispatchEvent(new Event('focus')); }));
  interactions.push(await timed('Kanban : ouvrir une fiche projet', async () => { document.querySelector('#projects-kanban .project-card').click(); }));
  await page.evaluate(() => { document.querySelectorAll('.cp-modal').forEach(el => el.remove()); });
  // Coût du seul rendu JS (page masquée : pas de mise en page), appelé directement.
  const renderOnly = async name => { const f = window[name]; const t0 = performance.now(); f(f === window.renderProjectsKanban ? window.CoreState.getTable('Projets') : undefined); window.__lastRenderMs = performance.now() - t0; };
  for (const [label, fn] of [['Kanban', 'renderProjectsKanban'], ['Administratif', 'renderAdministratif'], ['Installation', 'renderInstallation'], ['To Do', 'renderTodo']]) {
    const r = await page.evaluate(async ([n, src]) => { const f = new Function('return (' + src + ')')(); await f(n); return window.__lastRenderMs; }, [fn, renderOnly.toString()]);
    interactions.push({ name: `Rendu JS seul : ${label} (appel direct)`, ms: Math.round(r * 10) / 10 });
  }
  const nav = async view => { document.querySelector(`.nav-btn[data-view="${view}"]`).click(); };
  interactions.push(await timed('Navigation → Administratif', nav, 'view-administratif'));
  interactions.push(await timed('Administratif : onglet Conventions', async () => { document.querySelector('[data-admin-tab="conv"]').click(); }));
  interactions.push(await timed('Administratif : onglet Notifications', async () => { document.querySelector('[data-admin-tab="notif"]').click(); }));
  interactions.push(await timed('Navigation → Installation des fonds', nav, 'view-installation-fonds'));
  interactions.push(await timed('Navigation → To Do', nav, 'view-todo'));
  interactions.push(await timed('To Do : onglet Conventions', async () => { document.querySelector('[data-todo-tab="conv"]').click(); }));
  interactions.push(await timed('Navigation → Projets', nav, 'view-projects'));
  // Ouverture de la page Instances (menu « Instances ») : vérification du schéma + lecture de ses tables.
  const instances = await page.evaluate(async () => {
    const t0 = performance.now(), c0 = window.__BENCH_CALLS__.length;
    document.getElementById('btn-instances').click();
    while (!(window.InstancesPage && window.InstancesPage.state.loaded) && performance.now() - t0 < 30000) await new Promise(r => setTimeout(r, 10));
    return { name: 'Instances : 1re ouverture (appels Grist inclus)', ms: Math.round(performance.now() - t0), calls: window.__BENCH_CALLS__.length - c0 };
  });
  interactions.push(instances);
  await page.waitForTimeout(300);
  const total = await page.evaluate(() => ({ calls: window.__BENCH_CALLS__.length }));
  await context.close();
  return { startup, interactions, totalCalls: total.calls, errors: [...new Set(errors)].slice(0, 6) };
}

// _grist_Tables / _grist_Tables_column complets, comme dans un vrai document.
function withMetadata(tables) {
  const meta = { _grist_Tables: { id: [], tableId: [] }, _grist_Tables_column: { id: [], parentId: [], colId: [], description: [] } };
  Object.keys(tables).filter(n => !n.startsWith('_grist_')).forEach((name, i) => {
    const ref = i + 1;
    meta._grist_Tables.id.push(ref); meta._grist_Tables.tableId.push(name);
    Object.keys(tables[name]).filter(c => c !== 'id').forEach(col => {
      meta._grist_Tables_column.id.push(meta._grist_Tables_column.id.length + 1);
      meta._grist_Tables_column.parentId.push(ref); meta._grist_Tables_column.colId.push(col);
      meta._grist_Tables_column.description.push(col === 'Acronyme' ? 'Acronyme du projet' : (col === 'Statut_Macro' ? 'Statut calculé' : ''));
    });
  });
  return Object.assign({}, tables, meta);
}

function summarize(runs) {
  const first = runs[0];
  const startupCalls = first.startup.calls;
  const fetchCount = {};
  startupCalls.forEach(c => { if (c.m === 'fetchTable') fetchCount[c.arg] = (fetchCount[c.arg] || 0) + 1; });
  const cellsFetched = startupCalls.reduce((sum, c) => sum + c.cells, 0);
  const lastEnd = Math.max(...startupCalls.map(c => c.end));
  return {
    label: LABEL, rttMs: RTT_MS, runs: runs.length,
    startupApiCalls: startupCalls.length,
    startupFetchTable: startupCalls.filter(c => c.m === 'fetchTable').length,
    startupListTables: startupCalls.filter(c => c.m === 'listTables').length,
    startupWrites: startupCalls.filter(c => c.m === 'applyUserActions').length,
    cellsFetchedAtStartup: cellsFetched,
    fetchesPerTable: fetchCount,
    lastStartupApiEndMs: lastEnd,
    firstKanbanCardsMs: Math.round(median(runs.map(r => r.startup.firstCards))),
    navigationReadyMs: Math.round(median(runs.map(r => r.startup.navReady))),
    adminRenderedMs: runs[0].startup.adminRendered ? Math.round(median(runs.map(r => r.startup.adminRendered || 0))) : null,
    longTasks: Math.round(median(runs.map(r => r.startup.longTasks))),
    blockingMs: Math.round(median(runs.map(r => r.startup.blockingMs))),
    maxLongTaskMs: Math.round(median(runs.map(r => r.startup.maxLongTask))),
    interactions: first.interactions.map((it, i) => Object.assign({ name: it.name, ms: Math.round(median(runs.map(r => r.interactions[i].ms)) * 10) / 10 }, it.calls != null ? { apiCalls: it.calls } : {})),
    pageErrors: first.errors
  };
}

async function main() {
  const { chromium } = resolvePlaywright();
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const stop = () => server.kill();
  process.on('exit', stop);
  await new Promise(resolve => setTimeout(resolve, 600));
  const baseUrl = `http://127.0.0.1:${PORT}`;
  try {
    const browser = await chromium.launch();
    // Échauffement : un 1er lancement crée ce que le widget crée tout seul (colonnes, tables, préférences),
    // puis on mesure l'état « régime de croisière » (document déjà préparé, utilisateur qui revient).
    const warm = await measureRun(browser, buildMockScript(buildSyntheticFixtures()), baseUrl, { warmup: true });
    const mockScript = buildMockScript(withMetadata(warm.snapshot.tables));
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(await measureRun(browser, mockScript, baseUrl, { prefsRowId: warm.snapshot.prefsRowId }));
    await browser.close();
    const summary = summarize(runs);
    if (OUT) fs.writeFileSync(OUT, JSON.stringify({ summary, firstRunCalls: runs[0].startup.calls }, null, 2));
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    stop();
  }
}

main().catch(err => { console.error(err && err.stack || err); process.exitCode = 1; });
