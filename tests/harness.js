/**
 * Minimal zero-dependency test runner for the browser. No build step, no Node:
 * open tests/index.html in any browser (or the Claude Browser pane) to run.
 *
 * DOM/event conventions used by the suites (see docs/SPEC.mdd-adjacent audit notes):
 *  - Handlers assigned as properties (el.onclick = fn, el.oninput = fn) are called
 *    DIRECTLY (`await el.onclick()`), not dispatched — this is the only reliable way
 *    to await an async onclick handler's completion in a synchronous test script.
 *  - Handlers wired with addEventListener (select/input 'change'/'input', combobox
 *    'mousedown', kanban card 'click') are triggered with fire()/fireMouse() below.
 */
(function (global) {
  'use strict';

  const suites = [];
  let currentSuite = null;

  global.describe = function (name, fn) {
    currentSuite = { name, tests: [] };
    suites.push(currentSuite);
    fn();
    currentSuite = null;
  };

  global.it = function (name, fn) {
    if (!currentSuite) throw new Error(`it("${name}") called outside describe()`);
    currentSuite.tests.push({ name, fn });
  };

  global.assertEqual = function (actual, expected, msg) {
    if (actual !== expected) {
      throw new Error(`${msg ? msg + ' — ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  };

  global.assertTrue = function (value, msg) {
    if (!value) throw new Error(msg || `expected truthy value, got ${JSON.stringify(value)}`);
  };

  global.assertFalse = function (value, msg) {
    if (value) throw new Error(msg || `expected falsy value, got ${JSON.stringify(value)}`);
  };

  global.assertIncludes = function (haystack, needle, msg) {
    const text = String(haystack);
    if (!text.includes(needle)) throw new Error(`${msg ? msg + ' — ' : ''}"${text}" does not include "${needle}"`);
  };

  global.assertDeepEqual = function (actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${msg ? msg + ' — ' : ''}expected ${e}, got ${a}`);
  };

  // Triggers a listener attached with addEventListener(type, ...).
  global.fire = function (el, type) {
    el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
  };

  global.fireMouse = function (el, type) {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
  };

  // Simule une touche clavier (ArrowDown/ArrowUp/Enter/Escape…) sur un champ, pour les
  // tests de navigation clavier des dropdowns de recherche (CoreUtils.wireRefListKeyNav).
  global.fireKey = function (el, key) {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  };

  global.fakeEvent = function () {
    return { preventDefault() {}, stopPropagation() {} };
  };

  // Sets an <input>/<textarea> value the way a user typing would, for code that
  // reads .value directly (no framework binding involved in this app).
  global.setValue = function (el, value) {
    // Champ date jj/mm/aaaa (DateInput) : les suites écrivent la date en ISO, le champ l'affiche en jj/mm/aaaa.
    // La vraie frappe au clavier (masque, saisie à moitié tapée, calendrier) est couverte par suite-date-input.js.
    if (el && el.hasAttribute && el.hasAttribute('data-dp') && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) { window.DateInput.setIso(el, value); return; }
    el.value = value;
  };

  // Date ISO (AAAA-MM-JJ) d'un champ date jj/mm/aaaa : '' si vide, null si la saisie est fausse ou incomplète.
  global.dateIso = function (el) {
    return window.DateInput.iso(el);
  };

  // For blur handlers that defer their cleanup with setTimeout(fn, 150) (so a
  // suggestion's click has time to fire before the list hides) — await this after
  // fire(el, 'blur') to let that deferred work actually run before asserting on it.
  global.wait = function (ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  };

  // Attend qu'une condition devienne vraie (échanges asynchrones avec une iframe, minuteries...) ; rejette avec `label` au bout du délai.
  global.waitFor = async function (check, label, timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      let value = false;
      try { value = check(); } catch (err) { value = false; }
      if (value) return value;
      if (Date.now() > deadline) throw new Error(`Délai dépassé : ${label}`);
      await global.wait(20);
    }
  };

  global.runAllTests = async function () {
    const results = [];
    // ?only=<texte> : ne joue que les suites dont le nom contient ce texte (mise au point d'une suite sans rejouer les 60 s des autres ; `node tests/run-headless.js --only=<texte>`).
    const only = new URLSearchParams(location.search).get('only');
    for (const suite of suites) {
      if (only && !suite.name.includes(only)) continue;
      for (const test of suite.tests) {
        try {
          if (typeof global.__resetMockGrist === 'function') {
            const reset = global.__resetMockGrist();
            if (reset && typeof reset.then === 'function') await reset;
          }
          document.querySelectorAll('.cp-modal').forEach(el => el.remove());
          if (global.HelpTooltip && typeof global.HelpTooltip._resetForTests === 'function') global.HelpTooltip._resetForTests();
          // Le popover de la page Administratif vit sur <body> (hors du squelette de test) : on le ferme entre deux tests.
          if (global.AdministratifConv && typeof global.AdministratifConv.closePopover === 'function') global.AdministratifConv.closePopover();
          await test.fn();
          results.push({ suite: suite.name, test: test.name, pass: true });
        } catch (err) {
          results.push({ suite: suite.name, test: test.name, pass: false, error: (err && err.message) || String(err), stack: err && err.stack });
        }
      }
    }
    global.__TEST_RESULTS__ = results;
    render(results);
    return results;
  };

  function render(results) {
    let root = document.getElementById('test-results');
    if (!root) {
      root = document.createElement('div');
      root.id = 'test-results';
      document.body.appendChild(root);
    }
    const passed = results.filter(r => r.pass).length;
    const summary = `${passed}/${results.length} passed`;
    document.title = summary + ' — tests';
    root.innerHTML = `<h1 id="test-summary" data-passed="${passed}" data-total="${results.length}">${summary}</h1>` +
      results.map(r => `<div class="${r.pass ? 'pass' : 'fail'}">${r.pass ? '✓' : '✗'} [${escapeText(r.suite)}] ${escapeText(r.test)}` +
        (r.pass ? '' : `<pre>${escapeText(r.error)}</pre>`) + '</div>').join('');
  }

  function escapeText(value) {
    return String(value).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }
})(window);
