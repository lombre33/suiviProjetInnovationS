/**
 * Champ de filtre à liste à cases (multi-sélection) — partagé par les bandeaux de filtres des pages Projets, Administratif,
 * Installation des fonds, Dashboard et Annuaire (avant le 24/11/2026 : cinq copies d'un champ en lecture seule).
 *
 * Comportement :
 *  - au focus, la liste s'ouvre et le résumé de la sélection est sélectionné : la première lettre tapée le remplace par la
 *    recherche, qui réduit la liste aux libellés qui contiennent le texte (sans casse ni accents) ;
 *  - un clic (ou Entrée) coche / décoche une valeur sans fermer la liste ; les valeurs cochées remontent en tête (fond bleu) ;
 *  - ↑/↓ choisissent une proposition, Entrée la coche (pendant la frappe, la première est déjà surlignée), Échap efface la
 *    recherche puis ferme la liste ; un clic dans le champ la rouvre ;
 *  - au blur, la liste se ferme et le champ retrouve le résumé (« Programme A », « 2 programmes sélectionnés ») ;
 *  - champ de la sélection : classe `is-active` (champ et .filter-combo) et résumé complet au survol (attribut title) ;
 *  - valeurs épinglées (facultatif) : toujours en tête de liste, avec une pastille, séparées du reste par un filet.
 *
 * Seule la sélection cochée est retenue par la page (setSelected), jamais le texte tapé.
 *
 * FilterCombo.attach({
 *   id,            id de l'<input> ; sa liste est `${id}-list`
 *   placeholder,   libellé du bouton qui efface la sélection (« Tous les programmes »)
 *   summaryLabel,  « programmes sélectionnés » (accord : « 3 programmes sélectionnés »)
 *   options,       () => string[] : valeurs proposées, dans l'ordre voulu
 *   pinned,        () => [{ label, tag }] : valeurs épinglées (facultatif)
 *   getSelected,   () => string[]
 *   setSelected,   next => void : la page applique le choix (état, rendu des cartes, préférences)
 *   eager          true : la liste est redessinée à chaque sync(), même fermée (Projets, Administratif, Installation)
 *   neutral        (facultatif) values => bool : vrai quand la sélection est l'état par défaut (ex. les deux bailleurs cochés) : le champ
 *                  montre alors son texte d'invite, sans surlignage, comme un filtre vide ; la liste, elle, garde les valeurs cochées
 * }) -> { sync() } : à rappeler quand la sélection ou les valeurs changent hors du champ (données rechargées, Réinitialiser).
 */
(function (global) {
  'use strict';

  const norm = value => (value == null ? '' : String(value)).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const esc = value => (global.CoreUtils && global.CoreUtils.escapeHtml ? global.CoreUtils.escapeHtml(value) : String(value));
  const summaryOf = (values, label) => (!values.length ? '' : (values.length === 1 ? values[0] : `${values.length} ${label}`));

  function optionHtml(value, chosen, tag) {
    const isSelected = chosen.includes(value);
    const classes = [isSelected ? 'is-selected' : '', tag ? 'is-pinned' : ''].filter(Boolean).join(' ');
    const body = tag ? `<span class="combo-name">${esc(value)}</span><span class="combo-tag">${esc(tag)}</span>` : esc(value);
    return `<button type="button" class="${classes}" data-value="${esc(value)}" role="option" aria-selected="${isSelected}">${body}</button>`;
  }

  function attach(config) {
    const input = document.getElementById(config.id);
    const list = document.getElementById(`${config.id}-list`);
    if (!input || !list) return { sync() {} };
    const label = input.closest ? input.closest('.filter-combo') : null;
    // typed : l'utilisateur a tapé, le champ contient sa recherche et non plus le résumé ; active : valeur surlignée au clavier ;
    // token : numéro du dernier focus (voir blur) ; justFocused : le prochain relâchement de souris ne doit pas désélectionner le résumé.
    const state = { typed: false, active: null, token: 0, justFocused: false };

    function renderList() {
      const chosen = config.getSelected();
      const wanted = norm(state.typed ? input.value : '');
      const pinned = (config.pinned ? config.pinned() : []).filter(item => !wanted || norm(`${item.label} ${item.tag}`).includes(wanted));
      const pinnedLabels = new Set(pinned.map(item => item.label));
      const base = config.options();
      // Une valeur retenue qui a disparu des données reste proposée (et décochable).
      const all = [...new Set([...base, ...chosen.filter(value => !base.includes(value))])]
        .filter(value => !pinnedLabels.has(value) && (!wanted || norm(value).includes(wanted)));
      const rest = [...all.filter(value => chosen.includes(value)), ...all.filter(value => !chosen.includes(value))];
      list.innerHTML =
        (wanted ? '' : `<button type="button" data-value="">${esc(config.placeholder)}</button>`) +
        pinned.map(item => optionHtml(item.label, chosen, item.tag)).join('') +
        (pinned.length && rest.length ? '<span class="combo-sep" role="separator"></span>' : '') +
        rest.map(value => optionHtml(value, chosen)).join('') +
        (!pinned.length && !rest.length ? '<span class="combo-empty">Aucun résultat</span>' : '');
      const buttons = Array.from(list.querySelectorAll('[data-value]'));
      // Pendant la frappe, la première proposition est surlignée : Entrée la coche.
      if (state.typed && wanted && !buttons.some(button => button.dataset.value === state.active)) {
        const first = buttons.find(button => button.dataset.value !== '');
        state.active = first ? first.dataset.value : null;
      }
      buttons.forEach(button => button.classList.toggle('is-active', state.active != null && button.dataset.value === state.active));
    }

    function sync() {
      const chosen = config.getSelected();
      const idle = !!config.neutral && config.neutral(chosen); // état par défaut : champ au repos
      if (!state.typed) input.value = idle ? '' : summaryOf(chosen, config.summaryLabel);
      input.title = idle ? '' : chosen.join(', '); // le champ est étroit : la sélection complète se lit au survol
      input.classList.toggle('is-active', chosen.length > 0 && !idle);
      if (label) label.classList.toggle('is-active', chosen.length > 0 && !idle);
      if (config.eager || !list.hidden) renderList();
    }

    function toggle(value) {
      const chosen = config.getSelected();
      config.setSelected(value === '' ? [] : (chosen.includes(value) ? chosen.filter(v => v !== value) : [...chosen, value]));
      sync();
    }

    const setOpen = open => { list.hidden = !open; input.setAttribute('aria-expanded', String(open)); };
    const open = () => { setOpen(true); renderList(); };
    list.setAttribute('aria-multiselectable', 'true');
    setOpen(false);

    input.addEventListener('focus', () => {
      state.token += 1; state.typed = false; state.active = null; state.justFocused = true;
      setOpen(true);
      sync(); // remet le résumé dans le champ (une recherche l'avait peut-être remplacé), dessine la liste ouverte, puis le sélectionne
      if (input.select) input.select();
    });
    // Le clic qui donne le focus ne doit pas désélectionner le résumé (Firefox/Safari placent le curseur au relâchement).
    input.addEventListener('mouseup', event => { if (state.justFocused) { state.justFocused = false; event.preventDefault(); } });
    input.addEventListener('click', () => { if (list.hidden) open(); }); // liste fermée par Échap, champ resté actif
    input.addEventListener('input', () => { state.typed = true; state.active = null; open(); });
    // Cliquer dans la liste, ou saisir sa barre de défilement, ne doit pas retirer le focus du champ ; un clic sur une valeur la coche.
    list.addEventListener('mousedown', event => {
      event.preventDefault();
      const button = event.target.closest ? event.target.closest('[data-value]') : null;
      if (button) toggle(button.dataset.value);
    });
    input.addEventListener('keydown', event => {
      const buttons = () => Array.from(list.querySelectorAll('[data-value]'));
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (list.hidden) open();
        const all = buttons();
        if (!all.length) return;
        const index = all.findIndex(button => button.dataset.value === state.active);
        const next = event.key === 'ArrowDown' ? (index + 1) % all.length : (index - 1 + all.length) % all.length;
        state.active = all[next].dataset.value;
        all.forEach((button, i) => button.classList.toggle('is-active', i === next));
        if (all[next].scrollIntoView) all[next].scrollIntoView({ block: 'nearest' });
      } else if (event.key === 'Enter') {
        if (!list.hidden && state.active != null) { event.preventDefault(); toggle(state.active); }
      } else if (event.key === 'Escape') {
        if (state.typed && input.value) { state.typed = false; state.active = null; sync(); renderList(); if (input.select) input.select(); }
        else setOpen(false);
      }
    });
    input.addEventListener('blur', () => {
      const token = state.token;
      setTimeout(() => {
        if (state.token !== token) return; // le champ a repris le focus entre-temps : ne pas fermer sous la main de l'utilisateur
        state.typed = false; state.active = null; state.justFocused = false;
        setOpen(false);
        sync();
      }, 150);
    });

    return { sync, reset() { state.typed = false; state.active = null; } };
  }

  global.FilterCombo = { attach };
}(window));
