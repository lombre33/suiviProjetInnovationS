/**
 * Bulle d'aide réutilisable : une icône "?" accolée à un libellé de champ lié à
 * une colonne Grist, qui affiche la description de cette colonne (au survol, et
 * épinglée au clic) — jamais d'icône quand la colonne n'a pas de description.
 *
 * Deux façons de poser l'icône, pour couvrir les deux styles de rendu du widget :
 *   - markup(tableId, colId)  : fragment HTML à concaténer dans un template (pages
 *                               qui regénèrent leur DOM via innerHTML, ex. page-administratif.js).
 *   - attach(labelEl, tableId, colId) : pose l'icône juste après un élément <label>
 *                               construit via le DOM (ex. project-modal.js).
 *
 * Un seul jeu d'écouteurs, posé une fois sur document (délégation), gère toutes
 * les icônes présentes à un instant donné : inutile de ré-attacher quoi que ce
 * soit après qu'une page a remplacé son innerHTML.
 */
(function (global) {
  'use strict';

  const ICON_HELP = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M9.2 9.3a2.8 2.8 0 1 1 3.8 2.6c-.9.35-1.5.95-1.5 2.1"></path><line x1="12" y1="17.2" x2="12" y2="17.3"></line></svg>';

  const bubble = { el: null, pinned: false, anchor: null };

  function ensureBubble() {
    if (bubble.el) return bubble.el;
    const el = document.createElement('div');
    el.className = 'help-tooltip-bubble';
    el.setAttribute('role', 'tooltip');
    el.hidden = true;
    document.body.appendChild(el);
    bubble.el = el;
    return el;
  }

  function position(anchor) {
    const el = ensureBubble();
    const margin = 8;
    el.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const bw = el.offsetWidth, bh = el.offsetHeight;
    let left = rect.left + rect.width / 2 - bw / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - bw - margin));
    let top = rect.top - bh - margin;
    let below = false;
    if (top < margin) { top = rect.bottom + margin; below = true; }
    el.style.left = `${left + window.scrollX}px`;
    el.style.top = `${top + window.scrollY}px`;
    el.classList.toggle('is-below', below);
  }

  function show(anchor, text) {
    const el = ensureBubble();
    el.textContent = text;
    bubble.anchor = anchor;
    position(anchor);
  }

  function hide(force) {
    if (!force && bubble.pinned) return;
    if (bubble.el) bubble.el.hidden = true;
    bubble.anchor = null;
  }

  function closePinned() {
    bubble.pinned = false;
    hide(true);
  }

  function closestIcon(target) {
    return target && target.closest ? target.closest('.help-icon') : null;
  }

  document.addEventListener('mouseover', event => {
    if (bubble.pinned) return;
    const icon = closestIcon(event.target);
    if (icon) show(icon, icon.dataset.helpText || '');
  });
  document.addEventListener('mouseout', event => {
    if (bubble.pinned) return;
    const icon = closestIcon(event.target);
    if (icon && !icon.contains(event.relatedTarget)) hide();
  });
  document.addEventListener('click', event => {
    const icon = closestIcon(event.target);
    if (icon) {
      // preventDefault empêche aussi l'activation du <label> englobant éventuel
      // (ex. un champ interrupteur) : sans ça, cliquer l'icône d'aide d'un champ
      // coché/décoché basculerait ce champ au passage.
      event.preventDefault();
      event.stopPropagation();
      if (bubble.pinned && bubble.anchor === icon) { closePinned(); return; }
      bubble.pinned = true;
      show(icon, icon.dataset.helpText || '');
      return;
    }
    if (bubble.pinned && bubble.el && !bubble.el.contains(event.target)) closePinned();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && bubble.pinned) closePinned();
  });
  document.addEventListener('scroll', () => {
    if (bubble.anchor && bubble.el && !bubble.el.hidden) position(bubble.anchor);
  }, true);
  global.addEventListener('resize', () => {
    if (bubble.anchor && bubble.el && !bubble.el.hidden) position(bubble.anchor);
  });

  function description(tableId, colId) {
    return global.CoreGrist && typeof global.CoreGrist.getColumnDescription === 'function'
      ? global.CoreGrist.getColumnDescription(tableId, colId)
      : '';
  }

  global.HelpTooltip = {
    // Réservé aux tests (tests/harness.js, entre deux tests) : la bulle est un
    // singleton partagé par toute la page, jamais recréé — sans ce reset, une
    // bulle épinglée par un test resterait visible/épinglée pour les suivants.
    _resetForTests() {
      bubble.pinned = false;
      bubble.anchor = null;
      if (bubble.el) { bubble.el.remove(); bubble.el = null; }
    },
    markup(tableId, colId) {
      const desc = description(tableId, colId);
      if (!desc) return '';
      const escaped = global.CoreUtils.escapeHtml(desc);
      return ` <button type="button" class="help-icon" data-help-text="${escaped}" aria-label="Aide : ${escaped}">${ICON_HELP}</button>`;
    },
    attach(labelEl, tableId, colId) {
      const desc = description(tableId, colId);
      if (!desc || !labelEl || !labelEl.parentNode) return;
      const icon = document.createElement('button');
      icon.type = 'button';
      icon.className = 'help-icon';
      icon.dataset.helpText = desc;
      icon.setAttribute('aria-label', `Aide : ${desc}`);
      icon.innerHTML = ICON_HELP;
      labelEl.parentNode.insertBefore(icon, labelEl.nextSibling);
    }
  };
})(window);
