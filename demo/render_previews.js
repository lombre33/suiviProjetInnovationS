#!/usr/bin/env node
/**
 * Contrôle de rendu : ouvre le vrai widget (index.html du dépôt) dans Chromium avec le simulateur de Grist des tests
 * (tests/mock-grist.js) alimenté par les tables du document de démo, puis photographie chaque vue.
 *
 *   node demo/render_previews.js --tables mock-tables.json --out previews/ [--scale 2] [--width 1500] [--height 950]
 *
 * `mock-tables.json` vient de `python3 demo/check_demo_grist.py demo.grist --dump-mock mock-tables.json` : c'est la
 * relecture du fichier .grist lui-même, pas les données d'origine du générateur.
 * Rien n'est modifié dans le dépôt : le script de l'API Grist (bloqué dans ce bac à sable, et absent hors Grist) est
 * remplacé à la volée par le simulateur. Seul Playwright est nécessaire (déjà installé avec Claude Code).
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > -1 ? process.argv[i + 1] : def; };
const TABLES = arg('tables'), OUT = arg('out', 'previews'), SCALE = Number(arg('scale', 1)), WIDTH = Number(arg('width', 1500)), HEIGHT = Number(arg('height', 950));
const PORT = Number(arg('port', 8541));

function playwright() {
  for (const c of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(c); } catch (e) { /* suivant */ } }
  throw new Error('Playwright introuvable');
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  if (!TABLES) throw new Error('--tables mock-tables.json obligatoire');
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const base = `http://127.0.0.1:${PORT}`;
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/index.html'); break; } catch (e) { await sleep(100); } }
  const { chromium } = playwright();
  const browser = await chromium.launch();
  const logs = [];
  try {
    const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: SCALE, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
    const mock = fs.readFileSync(path.join(ROOT, 'tests', 'mock-grist.js'), 'utf8');
    const tables = fs.readFileSync(TABLES, 'utf8');
    await context.route(u => !u.href.startsWith(base), route => route.abort());
    await context.route('https://docs.getgrist.com/grist-plugin-api.js', route => route.fulfill({ contentType: 'application/javascript', body: `window.__FIXTURES__ = ${tables};\n${mock}` }));
    const page = await context.newPage();
    page.on('console', msg => { if (['error', 'warning'].includes(msg.type())) logs.push(`[console.${msg.type()}] ${msg.text()}`); });
    page.on('pageerror', err => logs.push(`[pageerror] ${err.message}`));
    await page.goto(base + '/index.html', { waitUntil: 'load' });
    await page.waitForSelector('#projects-kanban .kanban-card, #projects-kanban .kanban-column', { timeout: 20000 });
    await sleep(1200);

    const shot = async name => { await sleep(700); await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('  ·', name + '.png'); };
    const count = async sel => page.$$eval(sel, els => els.length);
    const info = {};

    // 1. Kanban
    info.kanbanCartes = await count('#projects-kanban .project-card');
    info.kanbanColonnes = await page.$$eval('#projects-kanban .kanban-column', cols => cols.map(c => (c.querySelector('h2,h3,.kanban-column-title') || c).textContent.trim().replace(/\s+/g, ' ').slice(0, 40) + ' · ' + c.querySelectorAll('.project-card').length));
    await shot('01-kanban');
    // la colonne « Projet en cours » est repliée par défaut : on la déplie pour la deuxième photo
    await page.click('[data-toggle-collapse="Projet en cours"]');
    await sleep(300);
    info.kanbanApresDepliage = await page.$$eval('#projects-kanban .kanban-column', cols => cols.map(c => c.querySelectorAll('.project-card').length));
    await shot('01b-kanban-projets-en-cours');
    await page.click('[data-toggle-collapse="Projet en cours"]');

    // 2. Administratif
    await page.click('button[data-view="view-administratif"]');
    await sleep(500);
    info.adminNotifCartes = await count('#admin-col-notif .admin-card');
    await shot('02-administratif-notifications');
    await page.click('[data-admin-tab="conv"]');
    await sleep(400);
    info.adminConvCartes = await count('#admin-col-conv .admin-card');
    await shot('03-administratif-conventions');

    // 3. Installation des fonds
    await page.click('button[data-view="view-installation-fonds"]');
    await sleep(500);
    info.installCartes = await count('#install-zones .install-card');
    info.installAlertes = await count('#install-zones .install-card.is-alert');
    await shot('04-installation-des-fonds');

    // 4. To Do (on se présente comme la gestionnaire des notifications, puis comme la gestionnaire financière)
    await page.click('button[data-view="view-todo"]');
    await sleep(500);
    const choose = async nom => {
      const visible = await page.$eval('#todo-me-select', el => !!el.offsetParent).catch(() => false);
      if (!visible) return false;
      const value = await page.$$eval('#todo-me-select option', (opts, n) => (opts.find(o => o.textContent.includes(n)) || {}).value, nom);
      if (!value) return false;
      await page.selectOption('#todo-me-select', value);
      await sleep(500);
      return true;
    };
    info.todoIdentification = await choose('FONTAINE');
    info.todoNotifCartes = await count('#todo-panels .todo-card');
    const expandPanels = async () => {
      for (const header of await page.$$('#todo-panels .admin-panel.is-collapsed .admin-panel-header')) { await header.click().catch(() => {}); }
      await sleep(300);
    };
    await expandPanels();
    await shot('05-todo-notifications');
    await page.click('[data-todo-tab="conv"]');
    await sleep(400);
    info.todoConvCartes = await count('#todo-panels .todo-card');
    await expandPanels();
    await shot('06-todo-conventions');
    await page.click('[data-todo-tab="install"]');
    // « Voir : Hugo DELMAS » : prévisualiser les tâches d'une personne qui a le rôle Installation
    const viewValue = await page.$$eval('#todo-view-select option', opts => (opts.find(o => o.textContent.includes('DELMAS')) || {}).value);
    if (viewValue) await page.selectOption('#todo-view-select', viewValue);
    await sleep(500);
    info.todoInstallCartes = await count('#todo-panels .todo-card');
    await expandPanels();
    await shot('06b-todo-installation');

    // 5. Instances : prochaine séance du CTO
    await page.click('#btn-instances');
    await sleep(500);
    info.instancesMenu = await page.$$eval('#instances-menu button, #instances-menu [role="menuitem"]', els => els.map(e => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 50)));
    await shot('07-instances-menu');
    const items = await page.$$('#instances-menu button, #instances-menu [role="menuitem"]');
    if (items.length) await items[0].click();
    await sleep(1500);
    info.instancesTexte = (await page.$eval('#instances-root', el => el.innerText)).replace(/\s+/g, ' ').slice(0, 260);
    await shot('08-instances');
    // étapes « Ordre du jour » puis « Invités » de la prochaine séance
    for (const [label, name] of [['ODJ', '09-instances-ordre-du-jour'], ['Invités', '10-instances-invites']]) {
      const tab = page.locator('#instances-root [role="tab"]', { hasText: label }).first();
      if (await tab.count()) { await tab.click(); await sleep(700); await shot(name); } else console.log('  ! onglet introuvable :', label);
    }
    // fiche d'un projet (modale) : les bulles d'aide « ? » viennent des descriptions de colonnes du document
    await page.click('#btn-projects');
    await sleep(500);
    const card = await page.$('.project-card');
    if (card) {
      await card.click();
      await sleep(900);
      info.modaleOuverte = !!(await page.$('.modal, [role="dialog"]'));
      info.bullesAide = await count('.help-tip, .help-tooltip, .help-icon, [data-help-col]');
      await shot('11-fiche-projet');
    }
    console.log(JSON.stringify(info, null, 2));
  } finally {
    await browser.close();
    server.kill();
  }
  const relevant = logs.filter(l => !/Failed to load resource|net::ERR|fonts\.g/.test(l));
  console.log(relevant.length ? '\nMessages du navigateur :\n' + relevant.join('\n') : '\nAucune erreur dans la console du navigateur.');
  process.exitCode = relevant.some(l => l.startsWith('[pageerror]') || l.startsWith('[console.error]')) ? 1 : 0;
}

main().catch(err => { console.error(err && err.stack || err); process.exitCode = 1; });
