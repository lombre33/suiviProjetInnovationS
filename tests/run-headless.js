#!/usr/bin/env node
/**
 * Lance la suite tests/index.html en headless (sans navigateur interactif) et
 * affiche le résultat en console avec un code de sortie 0/1.
 *
 * Usage : node tests/run-headless.js [--port 8532]
 *
 * Dépendance : Playwright, non incluse dans ce dépôt (le widget lui-même reste
 * zéro-dépendance). Ce script tente de le résoudre :
 *   1. comme dépendance locale/installée globalement (`require('playwright')`) ;
 *   2. sinon, à l'emplacement où il est déjà installé dans l'environnement
 *      Claude Code (`/opt/node22/lib/node_modules/playwright`).
 * Si aucun des deux n'est trouvé : `npm install -D playwright && npx
 * playwright install chromium`, ou ouvrez simplement tests/index.html dans un
 * navigateur.
 */
'use strict';

const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number((process.argv.find(a => a.startsWith('--port=')) || '').split('=')[1]) ||
  Number(process.env.PORT) || 8532;

function resolvePlaywright() {
  const candidates = ['playwright', '/opt/node22/lib/node_modules/playwright'];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (err) {
      // essaie le candidat suivant
    }
  }
  throw new Error(
    "Playwright introuvable. Installez-le avec 'npm install -D playwright && " +
    "npx playwright install chromium', ou ouvrez tests/index.html dans un navigateur."
  );
}

async function waitForServer(url, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch (err) {
      lastError = err;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Le serveur de test ne répond pas sur ${url} (${lastError && lastError.message})`);
}

async function main() {
  const { chromium } = resolvePlaywright();

  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  let serverStopped = false;
  const stopServer = () => {
    if (!serverStopped) {
      serverStopped = true;
      server.kill();
    }
  };
  process.on('exit', stopServer);

  const baseUrl = `http://127.0.0.1:${PORT}`;
  let exitCode = 1;
  try {
    await waitForServer(`${baseUrl}/tests/index.html`);

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const browserLogs = [];
      page.on('console', msg => browserLogs.push(`[console.${msg.type()}] ${msg.text()}`));
      page.on('pageerror', err => browserLogs.push(`[pageerror] ${err.message}`));

      await page.goto(`${baseUrl}/tests/index.html`, { waitUntil: 'load' });
      await page.waitForSelector('#test-summary', { timeout: 30000 });

      const summary = await page.$eval('#test-summary', el => ({
        passed: Number(el.dataset.passed),
        total: Number(el.dataset.total),
      }));
      const results = await page.evaluate(() => window.__TEST_RESULTS__);

      console.log(`\n${summary.passed}/${summary.total} tests passés\n`);
      for (const result of results) {
        console.log(`${result.pass ? '✓' : '✗'} [${result.suite}] ${result.test}`);
        if (!result.pass) console.log(`    ${result.error}`);
      }
      if (summary.passed !== summary.total && browserLogs.length) {
        console.log('\n--- logs navigateur ---');
        console.log(browserLogs.join('\n'));
      }
      exitCode = summary.passed === summary.total ? 0 : 1;
    } finally {
      await browser.close();
    }
  } finally {
    stopServer();
  }
  process.exitCode = exitCode;
}

main().catch(err => {
  console.error(err && err.message || err);
  process.exitCode = 1;
});
