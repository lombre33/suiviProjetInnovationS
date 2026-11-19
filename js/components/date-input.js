/* Saisie de date « jj/mm/aaaa » commune à tout le widget (demande d'Antoine du 19/11/2026).
 *
 * Pourquoi : un <input type="date"> natif suit la langue du navigateur (ou de l'application Grist), jamais celle de la
 * page — chez Antoine il s'affichait en mm/jj/aaaa. Le seul moyen de garantir jj/mm/aaaa partout est de ne pas utiliser
 * le champ natif : on pose un champ texte avec masque (les barres obliques viennent toutes seules) et un petit calendrier
 * français (semaine commençant le lundi). La valeur échangée avec le reste du code reste l'ISO « AAAA-MM-JJ » ; Grist
 * continue de recevoir des secondes epoch, rien ne change côté données.
 *
 * Utilisation :
 *   - markup({ id, cls, iso, aria, attrs }) : le HTML d'un champ (à mettre dans un innerHTML). Aucune classe n'est posée
 *     hors de `cls` : la page Instances préfixe toutes les classes, les accroches sont donc des attributs data-dp-*.
 *   - iso(champ) : '' si le champ est vide, 'AAAA-MM-JJ' si la date est valide, null si la saisie est incomplète ou fausse
 *     (le champ est alors signalé en rouge : l'appelant n'écrit rien dans ce cas).
 *   - setIso(champ, iso) : affiche une date ISO dans le champ.
 *   - toDisplay(iso) : 'AAAA-MM-JJ' → 'jj/mm/aaaa' (pour les affichages en lecture seule).
 * Le champ émet « input » à chaque frappe et « change » à la sortie ou au choix dans le calendrier (event.detail.picked).
 * Les écouteurs sont posés une fois sur document : les champs réécrits par innerHTML fonctionnent sans rien rebrancher.
 */
(function (global) {
  'use strict';

  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const JOURS = [['L', 'lundi'], ['M', 'mardi'], ['M', 'mercredi'], ['J', 'jeudi'], ['V', 'vendredi'], ['S', 'samedi'], ['D', 'dimanche']];
  const MIN_YEAR = 1900, MAX_YEAR = 2100;
  const SEPARATORS = '[\\/.\\- ]';
  const ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16.5" rx="2.5"></rect><path d="M3 9.5h18"></path><path d="M8 2.5v4"></path><path d="M16 2.5v4"></path></svg>';

  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pad = (n, size = 2) => String(n).padStart(size, '0');
  const isoOf = (y, m, d) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

  // Jour réel du calendrier ? (31/02 et années hors 1900-2100 refusés)
  function validParts(y, m, d) {
    if (!(y >= MIN_YEAR && y <= MAX_YEAR && m >= 1 && m <= 12 && d >= 1)) return false;
    return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  // 'AAAA-MM-JJ' → 'jj/mm/aaaa' ('' si ce n'est pas une date).
  function toDisplay(iso) {
    const found = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso == null ? '' : iso));
    return found ? `${found[3]}/${found[2]}/${found[1]}` : '';
  }

  // Saisie → ISO. '' : vide ; null : incomplet ou impossible. Accepte jj/mm/aaaa, j/m/aaaa, jj.mm.aaaa, jj-mm-aaaa,
  // jjmmaaaa et, par commodité, jj/mm/aa (00-69 → 20xx, 70-99 → 19xx).
  function parse(text) {
    const raw = String(text == null ? '' : text).trim();
    if (!raw) return '';
    let day, month, year;
    let found = new RegExp(`^(\\d{1,2})${SEPARATORS}(\\d{1,2})${SEPARATORS}(\\d{4}|\\d{2})$`).exec(raw);
    if (!found) found = /^(\d{2})(\d{2})(\d{4}|\d{2})$/.exec(raw);
    if (!found) return null;
    day = Number(found[1]); month = Number(found[2]); year = Number(found[3]);
    if (found[3].length === 2) year += year < 70 ? 2000 : 1900;
    return validParts(year, month, day) ? isoOf(year, month, day) : null;
  }

  const isDateField = el => !!(el && el.matches && el.matches('input[data-dp]'));
  const iso = el => (el ? parse(el.value) : '');
  function setIso(el, value) {
    if (!el) return;
    el.value = toDisplay(value);
    flag(el, false);
  }

  // `attrs` : attributs supplémentaires déjà échappés par l'appelant (data-chg="…", etc.).
  function markup(options) {
    const o = options || {};
    const id = o.id ? ` id="${esc(o.id)}"` : '';
    const cls = o.cls ? ` class="${esc(o.cls)}"` : '';
    const aria = o.aria ? ` aria-label="${esc(o.aria)}"` : '';
    return `<span data-dp-wrap><input type="text"${id}${cls}${aria} data-dp inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="10" placeholder="jj/mm/aaaa" value="${esc(toDisplay(o.iso))}"${o.attrs ? ' ' + o.attrs : ''}>` +
      `<button type="button" data-dp-open tabindex="-1" aria-label="Choisir dans le calendrier" title="Calendrier">${ICON}</button></span>`;
  }

  // ── Masque de saisie ──────────────────────────────────────────────────────────
  // Les chiffres tapés sont regroupés en jj/mm/aaaa. Quand des séparateurs sont tapés ou collés (5/3/2026, 19.11.2026),
  // les groupes sont respectés : « 5/ » devient « 05/ », « 5/3/2026 » devient « 05/03/2026 ».
  function formatDigits(digits) {
    return digits.length <= 2 ? digits : digits.length <= 4 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
  }
  function maskedText(raw) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return toDisplay(raw); // date ISO collée (AAAA-MM-JJ)
    const parts = raw.split(new RegExp(`${SEPARATORS}+`));
    const grouped = parts.length >= 2 && parts.length <= 3
      && parts.every((part, i) => /^\d*$/.test(part) && part.length <= (i === 2 ? 4 : 2) && (part !== '' || i === parts.length - 1) && (i > 0 || part !== ''));
    if (grouped) return parts.map((part, i) => (i < parts.length - 1 ? part.padStart(2, '0') : part)).join('/');
    return formatDigits(raw.replace(/\D/g, '').slice(0, 8));
  }
  function onInput(event) {
    const el = event.target;
    if (!isDateField(el) || el._dpComposing) return;
    flag(el, false);
    if (event.inputType && event.inputType.indexOf('delete') === 0) return; // effacer ne remet pas en forme : on peut corriger un chiffre au milieu
    const raw = el.value;
    const next = maskedText(raw);
    if (next === raw) return;
    const caret = el.selectionStart;
    const atEnd = caret == null || caret >= raw.length;
    const digitsBefore = atEnd ? 0 : raw.slice(0, caret).replace(/\D/g, '').length;
    el.value = next;
    if (atEnd) { try { el.setSelectionRange(next.length, next.length); } catch (err) { /* champ non focalisable */ } return; }
    let seen = 0, position = next.length;
    for (let i = 0; i < next.length; i++) {
      if (/\d/.test(next[i])) seen++;
      if (seen >= digitsBefore) { position = i + 1; break; }
    }
    try { el.setSelectionRange(position, position); } catch (err) { /* champ non focalisable */ }
  }

  // Signalement d'une saisie fausse : bordure rouge + infobulle (l'infobulle d'origine du champ est rendue ensuite).
  function flag(el, bad) {
    if (bad) {
      if (!('dpTitle' in el.dataset)) el.dataset.dpTitle = el.title || '';
      el.setAttribute('aria-invalid', 'true');
      el.setAttribute('data-dp-bad', '');
      el.title = 'Date non valide : saisir jj/mm/aaaa';
      return;
    }
    el.removeAttribute('aria-invalid');
    el.removeAttribute('data-dp-bad');
    if ('dpTitle' in el.dataset) { el.title = el.dataset.dpTitle; delete el.dataset.dpTitle; }
  }

  // À la sortie : une saisie lisible est remise au format complet (19/11/26 → 19/11/2026) ; sinon le champ est signalé.
  function onFocusOut(event) {
    const el = event.target;
    if (!isDateField(el)) return;
    const value = parse(el.value);
    if (value) el.value = toDisplay(value);
    flag(el, value === null);
  }

  // ── Calendrier ────────────────────────────────────────────────────────────────
  const state = { el: null, input: null, year: 0, month: 0, focus: '' };

  function today() {
    const now = new Date();
    return isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }
  const partsOf = value => { const a = value.split('-'); return { y: Number(a[0]), m: Number(a[1]), d: Number(a[2]) }; };
  function shiftDays(value, days) {
    const p = partsOf(value);
    const t = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
    return isoOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  function shiftMonths(value, months) {
    const p = partsOf(value);
    const first = new Date(Date.UTC(p.y, p.m - 1 + months, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return isoOf(first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(p.d, last));
  }
  const clampIso = value => { const p = partsOf(value); return p.y < MIN_YEAR ? isoOf(MIN_YEAR, 1, 1) : p.y > MAX_YEAR ? isoOf(MAX_YEAR, 12, 31) : value; };

  function renderCalendar() {
    const { el } = state;
    if (!el) return;
    const selected = iso(state.input) || '';
    const todayIso = today();
    const first = new Date(Date.UTC(state.year, state.month, 1));
    const offset = (first.getUTCDay() + 6) % 7; // lundi = 0
    let html = `<div class="dp-head"><button type="button" class="dp-nav" data-dp-nav="-1" aria-label="Mois précédent">‹</button>` +
      `<strong class="dp-title" aria-live="polite">${MOIS[state.month]} ${state.year}</strong>` +
      `<button type="button" class="dp-nav" data-dp-nav="1" aria-label="Mois suivant">›</button></div>` +
      `<div class="dp-grid" role="grid" aria-label="${MOIS[state.month]} ${state.year}">` +
      JOURS.map(([short, full]) => `<abbr class="dp-dow" title="${full}" role="columnheader">${short}</abbr>`).join('');
    for (let i = 0; i < 42; i++) {
      const day = shiftDays(isoOf(state.year, state.month + 1, 1), i - offset);
      const p = partsOf(day);
      const out = p.m !== state.month + 1;
      const isFocus = day === state.focus;
      html += `<button type="button" class="dp-day${out ? ' is-out' : ''}${day === todayIso ? ' is-today' : ''}${day === selected ? ' is-sel' : ''}" data-dp-day="${day}" tabindex="${isFocus ? 0 : -1}"` +
        ` aria-label="${p.d} ${MOIS[p.m - 1]} ${p.y}"${day === selected ? ' aria-pressed="true"' : ''}>${p.d}</button>`;
    }
    html += `</div><div class="dp-foot"><button type="button" class="dp-link" data-dp-today>Aujourd'hui</button><button type="button" class="dp-link" data-dp-clear>Effacer</button></div>`;
    el.innerHTML = html;
  }

  function placeCalendar() {
    const { el, input } = state;
    if (!el || !input || !input.isConnected) { closeCalendar(); return; }
    const anchor = input.getBoundingClientRect();
    const width = el.offsetWidth, height = el.offsetHeight, margin = 8, gap = 4;
    const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - width - margin));
    let top = anchor.bottom + gap;
    if (top + height > window.innerHeight - margin) {
      const above = anchor.top - height - gap;
      top = above >= margin ? above : window.innerHeight - height - margin;
    }
    el.style.left = `${left}px`;
    el.style.top = `${Math.max(margin, top)}px`;
  }

  function focusDay() {
    if (!state.el) return;
    const target = state.el.querySelector(`[data-dp-day="${state.focus}"]`);
    if (target) target.focus({ preventScroll: true });
  }

  // Place le jour « actif » (celui qui porte le focus clavier) et réaffiche le mois qui le contient.
  function moveFocus(value, keepFocus) {
    const next = clampIso(value);
    const p = partsOf(next);
    state.focus = next;
    state.year = p.y;
    state.month = p.m - 1;
    renderCalendar();
    if (keepFocus) focusDay();
    placeCalendar();
  }

  function openCalendar(input, options) {
    closeCalendar();
    const el = document.createElement('div');
    el.className = 'dp-pop';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Calendrier');
    document.body.appendChild(el);
    state.el = el;
    state.input = input;
    const start = iso(input) || today();
    const p = partsOf(clampIso(start));
    state.focus = clampIso(start);
    state.year = p.y;
    state.month = p.m - 1;
    renderCalendar();
    placeCalendar();
    if (options && options.focus === false) return;
    focusDay();
  }

  function closeCalendar(restoreFocus) {
    if (!state.el) return;
    const { input } = state;
    state.el.remove();
    state.el = state.input = null;
    if (restoreFocus && input && input.isConnected) input.focus({ preventScroll: true });
  }

  function pick(value) {
    const { input } = state;
    if (!input) return;
    if (!input.isConnected) { closeCalendar(); return; } // champ réécrit entre-temps (page redessinée)
    setIso(input, value);
    closeCalendar(true);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { picked: true } }));
  }

  function onCalendarClick(event) {
    const target = event.target.closest ? event.target.closest('button') : null;
    if (!target || !state.el || !state.el.contains(target)) return false;
    if (target.hasAttribute('data-dp-nav')) {
      moveFocus(shiftMonths(state.focus, Number(target.getAttribute('data-dp-nav'))), false);
    } else if (target.hasAttribute('data-dp-day')) {
      pick(target.getAttribute('data-dp-day'));
    } else if (target.hasAttribute('data-dp-today')) {
      pick(today());
    } else if (target.hasAttribute('data-dp-clear')) {
      pick('');
    }
    return true;
  }

  function onClick(event) {
    if (onCalendarClick(event)) return;
    const button = event.target.closest ? event.target.closest('[data-dp-open]') : null;
    if (!button) return;
    const input = button.parentElement && button.parentElement.querySelector('input[data-dp]');
    if (!input || input.disabled || input.readOnly) return;
    if (state.el && state.input === input) { closeCalendar(true); return; }
    openCalendar(input);
  }

  // Sous le champ : Alt+↓ (ou F4) ouvre le calendrier, comme sur un champ date natif.
  // Dans le calendrier : flèches = jour, PgPréc/PgSuiv = mois, Début/Fin = semaine, Échap ferme.
  function onKeyDown(event) {
    if (state.el && state.el.contains(event.target)) {
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeCalendar(true); return; }
      if (!event.target.hasAttribute || !event.target.hasAttribute('data-dp-day')) return;
      if (step) { event.preventDefault(); moveFocus(shiftDays(state.focus, step), true); return; }
      if (event.key === 'PageUp' || event.key === 'PageDown') { event.preventDefault(); moveFocus(shiftMonths(state.focus, event.key === 'PageUp' ? -1 : 1), true); return; }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        const f = partsOf(state.focus);
        const dow = (new Date(Date.UTC(f.y, f.m - 1, f.d)).getUTCDay() + 6) % 7;
        moveFocus(shiftDays(state.focus, event.key === 'Home' ? -dow : 6 - dow), true);
      }
      return;
    }
    if (isDateField(event.target) && ((event.altKey && event.key === 'ArrowDown') || event.key === 'F4')) {
      event.preventDefault();
      openCalendar(event.target);
    }
  }

  // Un clic ailleurs, un défilement ou un redimensionnement referment le calendrier ; cliquer dans le champ pour taper aussi.
  function onPointerDown(event) {
    if (!state.el) return;
    const target = event.target;
    if (state.el.contains(target)) return;
    const wrap = target && target.closest ? target.closest('[data-dp-wrap]') : null;
    if (wrap && state.input && wrap.contains(state.input) && target.closest('[data-dp-open]')) return; // le bouton fait l'aller-retour (onClick)
    closeCalendar();
  }
  function onFocusIn(event) {
    if (!state.el || state.el.contains(event.target) || event.target === state.input) return;
    closeCalendar();
  }
  function onScroll(event) {
    if (!state.el || state.el.contains(event.target)) return;
    closeCalendar();
  }

  function init() {
    document.addEventListener('input', onInput);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('compositionstart', event => { if (isDateField(event.target)) event.target._dpComposing = true; });
    document.addEventListener('compositionend', event => { if (isDateField(event.target)) { event.target._dpComposing = false; onInput(event); } });
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('scroll', onScroll, true);
    global.addEventListener('resize', () => closeCalendar());
  }
  init();

  global.DateInput = {
    markup, iso, setIso, toDisplay, parse, today,
    // Le calendrier posé sur <body> est « dans » la fenêtre qui l'a ouvert (popovers qui se ferment au clic extérieur).
    owns: target => !!(target && target.closest && target.closest('.dp-pop')),
    open: openCalendar, close: closeCalendar,
    isOpen: () => !!state.el
  };
})(typeof window !== 'undefined' ? window : globalThis);
