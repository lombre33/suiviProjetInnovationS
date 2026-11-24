/**
 * Non-regression suite : saisie de date jj/mm/aaaa (js/components/date-input.js), demande d'Antoine du 19/11/2026.
 *
 * Le champ <input type="date"> natif suit la langue du navigateur : chez Antoine il s'affichait en mm/jj/aaaa
 * (« 11/19/2026 »). Le widget n'en utilise plus aucun : champ texte avec masque + calendrier français. Ces tests
 * couvrent l'analyse et l'affichage, le masque de frappe, le calendrier (souris et clavier), la modale projet
 * (saisie complète, saisie à moitié tapée) et un garde-fou sur le code source (plus de champ date natif).
 */
(function () {
  'use strict';

  const D = () => window.DateInput;
  let host = null;

  // Un champ réellement affiché (le squelette des tests est masqué, le focus n'y marche pas).
  function mount(iso, extra) {
    host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:20px;top:20px;width:260px;z-index:1';
    host.innerHTML = D().markup(Object.assign({ id: 'dp-test', aria: 'Date de test', iso }, extra || {}));
    document.body.appendChild(host);
    return host.querySelector('input');
  }
  function cleanup() {
    D().close();
    if (host) host.remove();
    host = null;
  }
  // Le squelette des tests ne charge pas les feuilles de style : celles du composant sont posées le temps d'un test de mise en page.
  async function withCss(fn) {
    const style = document.createElement('style');
    style.textContent = await (await fetch('../css/date-input.css', { cache: 'no-store' })).text();
    document.head.appendChild(style);
    try { return await fn(); } finally { style.remove(); }
  }
  const type = (input, text) => { input.value = text; fire(input, 'input'); };
  const calendar = () => document.querySelector('.dp-pop');
  const dayBtn = iso => calendar().querySelector(`[data-dp-day="${iso}"]`);
  const openCalendar = input => fireMouse(input.parentElement.querySelector('[data-dp-open]'), 'click');
  const key = (el, k, extra) => el.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, extra || {})));
  const focusedIso = () => document.activeElement && document.activeElement.getAttribute('data-dp-day');

  describe('Saisie de date jj/mm/aaaa — analyse et affichage', function () {
    it('affiche une date ISO en jj/mm/aaaa, jamais en mm/jj/aaaa', function () {
      assertEqual(D().toDisplay('2026-11-19'), '19/11/2026');
      assertEqual(D().toDisplay('2026-01-05'), '05/01/2026', 'le jour d\'abord, puis le mois');
      assertEqual(D().toDisplay(''), '');
      assertEqual(D().toDisplay(null), '');
      assertEqual(D().toDisplay('pas une date'), '');
    });

    it('lit jj/mm/aaaa (jour d\'abord) et reste tolérant sur les séparateurs et les zéros', function () {
      assertEqual(D().parse('19/11/2026'), '2026-11-19');
      assertEqual(D().parse('01/02/2026'), '2026-02-01', '01/02 = 1er février, pas le 2 janvier');
      assertEqual(D().parse('5/3/2026'), '2026-03-05');
      assertEqual(D().parse('19.11.2026'), '2026-11-19');
      assertEqual(D().parse('19-11-2026'), '2026-11-19');
      assertEqual(D().parse('19112026'), '2026-11-19');
      assertEqual(D().parse('19/11/26'), '2026-11-19', 'année sur deux chiffres : 20xx');
      assertEqual(D().parse('19/11/85'), '1985-11-19');
      assertEqual(D().parse('  19/11/2026 '), '2026-11-19');
    });

    it('distingue vide (\'\') et saisie fausse ou incomplète (null)', function () {
      assertEqual(D().parse(''), '');
      assertEqual(D().parse('   '), '');
      ['19', '19/11', '19/11/', '19/11/202', '11/19/2026', '31/02/2026', '00/05/2026', '15/00/2026', '15/13/2026', '19/11/0002', '19/11/1899', '19/11/2101', 'abc', '2026-11-19'].forEach(text => {
        assertEqual(D().parse(text), null, `« ${text} » n'est pas une date jj/mm/aaaa valide`);
      });
    });

    it('accepte le 29 février d\'une année bissextile seulement', function () {
      assertEqual(D().parse('29/02/2028'), '2028-02-29');
      assertEqual(D().parse('29/02/2027'), null);
    });

    it('le HTML produit n\'est pas un champ date natif : champ texte jj/mm/aaaa avec bouton calendrier', function () {
      const html = D().markup({ id: 'x', cls: 'dp', iso: '2026-11-19', aria: 'Date', attrs: 'data-chg="seance-date"' });
      assertFalse(/type="date"/.test(html), 'aucun <input type="date">');
      assertIncludes(html, 'type="text"');
      assertIncludes(html, 'placeholder="jj/mm/aaaa"');
      assertIncludes(html, 'value="19/11/2026"');
      assertIncludes(html, 'data-chg="seance-date"');
      assertIncludes(html, 'class="dp"');
      assertIncludes(html, 'data-dp-open');
    });

    it('échappe les valeurs d\'attribut (libellé, id)', function () {
      const html = D().markup({ id: 'a"b', aria: '<x>"' });
      assertFalse(html.includes('<x>'), 'le libellé ne doit pas injecter de balise');
      assertIncludes(html, 'id="a&quot;b"');
    });

    it('setIso / iso : aller-retour, champ vidé, saisie fausse', function () {
      const input = mount('');
      try {
        assertEqual(D().iso(input), '');
        D().setIso(input, '2026-11-19');
        assertEqual(input.value, '19/11/2026');
        assertEqual(D().iso(input), '2026-11-19');
        input.value = '19/11';
        assertEqual(D().iso(input), null);
        D().setIso(input, '');
        assertEqual(input.value, '');
        assertEqual(D().iso(input), '');
      } finally { cleanup(); }
    });
  });

  describe('Saisie de date jj/mm/aaaa — masque de frappe', function () {
    it('pose les barres obliques tout seul : 15112026 devient 15/11/2026', function () {
      const input = mount('');
      try {
        type(input, '1'); assertEqual(input.value, '1');
        type(input, '15'); assertEqual(input.value, '15');
        type(input, '151'); assertEqual(input.value, '15/1');
        type(input, '1511'); assertEqual(input.value, '15/11');
        type(input, '15112'); assertEqual(input.value, '15/11/2');
        type(input, '15112026'); assertEqual(input.value, '15/11/2026');
        assertEqual(D().iso(input), '2026-11-15');
      } finally { cleanup(); }
    });

    it('ne garde que les chiffres et jamais plus de 8 (jj mm aaaa)', function () {
      const input = mount('');
      try {
        type(input, '1a5b1c1d2e0f2g6'); assertEqual(input.value, '15/11/2026');
        type(input, '151120261234'); assertEqual(input.value, '15/11/2026');
      } finally { cleanup(); }
    });

    it('« 5/ » devient « 05/ » et « 5/3/ » devient « 05/03/ » (barre ou point tapé après un seul chiffre)', function () {
      const input = mount('');
      try {
        type(input, '5/'); assertEqual(input.value, '05/');
        type(input, '05/3/'); assertEqual(input.value, '05/03/');
        type(input, '5.'); assertEqual(input.value, '05/');
      } finally { cleanup(); }
    });

    it('une date collée avec ses séparateurs garde ses groupes : 5/3/2026, 19.11.2026, 1-2-27', function () {
      const input = mount('');
      try {
        type(input, '5/3/2026'); assertEqual(input.value, '05/03/2026');
        type(input, '19.11.2026'); assertEqual(input.value, '19/11/2026');
        type(input, '1-2-2027'); assertEqual(input.value, '01/02/2027');
        type(input, '15/112'); assertEqual(input.value, '15/11/2', 'trois chiffres dans le mois : retour au regroupement par chiffres');
        type(input, '/'); assertEqual(input.value, '', 'une barre seule ne donne rien');
      } finally { cleanup(); }
    });

    it('une date ISO collée (2026-11-19) est convertie en 19/11/2026', function () {
      const input = mount('');
      try {
        type(input, '2026-11-19');
        assertEqual(input.value, '19/11/2026');
      } finally { cleanup(); }
    });

    it('le masque garde le curseur à sa place quand on insère un chiffre au milieu', function () {
      const input = mount('15/1');
      try {
        input.focus();
        input.value = '150/1'; // un « 0 » tapé après le jour
        input.setSelectionRange(3, 3);
        fire(input, 'input');
        assertEqual(input.value, '15/01');
        assertEqual(input.selectionStart, 4, 'le curseur reste juste après le « 0 » tapé');
      } finally { cleanup(); }
    });

    it('effacer un chiffre ne remet pas le champ en forme : on peut corriger le mois au milieu d\'une date complète', function () {
      const input = mount('15/11/2026');
      try {
        input.focus();
        input.value = '15/1/2026'; // un « 1 » du mois effacé
        input.setSelectionRange(4, 4);
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
        assertEqual(input.value, '15/1/2026', 'le texte n\'est pas reformaté pendant l\'effacement');
        input.value = '15/12/2026'; // puis le « 2 » tapé à la place
        input.setSelectionRange(5, 5);
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '2' }));
        assertEqual(input.value, '15/12/2026');
        assertEqual(D().iso(input), '2026-12-15');
      } finally { cleanup(); }
    });

    it('à la sortie, une saisie lisible est remise au format complet ; une saisie fausse est signalée puis lavée dès qu\'on retape', function () {
      const input = mount('');
      try {
        input.value = '19/11/26';
        fire(input, 'focusout');
        assertEqual(input.value, '19/11/2026', 'année complétée');
        assertFalse(input.hasAttribute('aria-invalid'));
        input.value = '31/02/2026';
        fire(input, 'focusout');
        assertEqual(input.getAttribute('aria-invalid'), 'true', 'date impossible : signalée');
        assertTrue(input.hasAttribute('data-dp-bad'));
        assertIncludes(input.title, 'jj/mm/aaaa');
        type(input, '15');
        assertFalse(input.hasAttribute('aria-invalid'), 'le signalement disparaît dès qu\'on retape');
        input.value = '';
        fire(input, 'focusout');
        assertFalse(input.hasAttribute('aria-invalid'), 'un champ vide n\'est pas une erreur');
      } finally { cleanup(); }
    });

    it('l\'infobulle d\'origine du champ est rendue une fois la saisie corrigée', function () {
      const input = mount('', { attrs: 'title="Mise à jour automatiquement"' });
      try {
        input.value = '99/99/9999';
        fire(input, 'focusout');
        assertIncludes(input.title, 'Date non valide');
        input.value = '19/11/2026';
        fire(input, 'focusout');
        assertEqual(input.title, 'Mise à jour automatiquement');
      } finally { cleanup(); }
    });

    it('les champs réécrits par innerHTML fonctionnent sans rien rebrancher (écouteurs sur document)', function () {
      const input = mount('');
      try {
        host.innerHTML = D().markup({ id: 'dp-test2' });
        const fresh = host.querySelector('input');
        type(fresh, '01022027');
        assertEqual(fresh.value, '01/02/2027');
      } finally { cleanup(); }
    });
  });

  describe('Saisie de date jj/mm/aaaa — calendrier', function () {
    it('s\'ouvre sur le mois de la date saisie, en français, semaine commençant le lundi', function () {
      const input = mount('2026-11-19');
      try {
        openCalendar(input);
        assertTrue(!!calendar(), 'le calendrier s\'ouvre');
        assertEqual(calendar().querySelector('.dp-title').textContent, 'novembre 2026');
        const heads = Array.from(calendar().querySelectorAll('.dp-dow')).map(a => a.textContent).join('');
        assertEqual(heads, 'LMMJVSD', 'lundi en premier');
        assertEqual(calendar().querySelectorAll('.dp-day').length, 42, 'six semaines complètes');
        // 1er novembre 2026 = dimanche : la première ligne commence le lundi 26 octobre (jour hors mois)
        const first = calendar().querySelector('.dp-day');
        assertEqual(first.getAttribute('data-dp-day'), '2026-10-26');
        assertTrue(first.classList.contains('is-out'));
        assertTrue(dayBtn('2026-11-19').classList.contains('is-sel'), 'le jour saisi est sélectionné');
        assertEqual(dayBtn('2026-11-19').getAttribute('aria-label'), '19 novembre 2026');
      } finally { cleanup(); }
    });

    it('choisir un jour remplit le champ en jj/mm/aaaa, émet input puis change (picked) et se referme', function () {
      const input = mount('2026-11-19');
      const seen = [];
      input.addEventListener('input', () => seen.push('input'));
      input.addEventListener('change', e => seen.push('change:' + !!(e.detail && e.detail.picked)));
      try {
        openCalendar(input);
        fireMouse(dayBtn('2026-11-05'), 'click');
        assertEqual(input.value, '05/11/2026');
        assertEqual(D().iso(input), '2026-11-05');
        assertDeepEqual(seen, ['input', 'change:true']);
        assertFalse(!!calendar(), 'refermé après le choix');
      } finally { cleanup(); }
    });

    it('un jour du mois voisin est cliquable et change de mois', function () {
      const input = mount('2026-11-19');
      try {
        openCalendar(input);
        fireMouse(dayBtn('2026-10-28'), 'click');
        assertEqual(input.value, '28/10/2026');
      } finally { cleanup(); }
    });

    it('les flèches changent de mois ; le choix garde l\'année et le jour demandés', function () {
      const input = mount('2026-12-31');
      try {
        openCalendar(input);
        fireMouse(calendar().querySelector('[data-dp-nav="1"]'), 'click');
        assertEqual(calendar().querySelector('.dp-title').textContent, 'janvier 2027', 'décembre → janvier : l\'année change');
        fireMouse(calendar().querySelector('[data-dp-nav="-1"]'), 'click');
        fireMouse(calendar().querySelector('[data-dp-nav="-1"]'), 'click');
        assertEqual(calendar().querySelector('.dp-title').textContent, 'novembre 2026');
        fireMouse(dayBtn('2026-11-30'), 'click');
        assertEqual(input.value, '30/11/2026');
      } finally { cleanup(); }
    });

    it('sans date saisie, s\'ouvre sur le mois courant et marque aujourd\'hui ; « Aujourd\'hui » pose le jour local', function () {
      const input = mount('');
      try {
        openCalendar(input);
        const today = D().today();
        assertTrue(!!dayBtn(today), 'le jour courant est dans le mois affiché');
        assertTrue(dayBtn(today).classList.contains('is-today'));
        fireMouse(calendar().querySelector('[data-dp-today]'), 'click');
        assertEqual(D().iso(input), today);
        const now = new Date();
        assertEqual(input.value, `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`);
      } finally { cleanup(); }
    });

    it('« Effacer » vide le champ et émet change', function () {
      const input = mount('2026-11-19');
      let changes = 0;
      input.addEventListener('change', () => { changes++; });
      try {
        openCalendar(input);
        fireMouse(calendar().querySelector('[data-dp-clear]'), 'click');
        assertEqual(input.value, '');
        assertEqual(changes, 1);
      } finally { cleanup(); }
    });

    it('le bouton calendrier est un interrupteur ; Échap, un clic ailleurs et le défilement referment', function () {
      const input = mount('2026-11-19');
      try {
        openCalendar(input);
        assertTrue(!!calendar());
        openCalendar(input);
        assertFalse(!!calendar(), 'second clic sur le bouton : referme');
        openCalendar(input);
        key(calendar().querySelector('.dp-day'), 'Escape');
        assertFalse(!!calendar(), 'Échap');
        openCalendar(input);
        fireMouse(document.body, 'mousedown');
        assertFalse(!!calendar(), 'clic ailleurs');
        openCalendar(input);
        fireMouse(calendar().querySelector('.dp-title'), 'mousedown');
        assertTrue(!!calendar(), 'un clic dans le calendrier ne le ferme pas');
        document.dispatchEvent(new Event('scroll'));
        assertFalse(!!calendar(), 'défilement de la page');
      } finally { cleanup(); }
    });

    it('Échap dans le calendrier ne remonte pas (il ne ferme ni la page ni un popover) et rend le focus au champ', function () {
      const input = mount('2026-11-19');
      let reached = false;
      const spy = () => { reached = true; };
      try {
        openCalendar(input);
        document.addEventListener('keydown', spy);
        key(document.activeElement, 'Escape');
        assertFalse(reached, 'Échap consommé par le calendrier');
        assertTrue(document.activeElement === input, 'le focus revient au champ');
      } finally { document.removeEventListener('keydown', spy); cleanup(); }
    });

    it('au clavier : le jour du champ a le focus, les flèches se déplacent, Entrée choisit', function () {
      const input = mount('2026-11-19');
      try {
        openCalendar(input);
        assertEqual(focusedIso(), '2026-11-19', 'focus sur le jour saisi');
        key(document.activeElement, 'ArrowRight');
        assertEqual(focusedIso(), '2026-11-20');
        key(document.activeElement, 'ArrowDown');
        assertEqual(focusedIso(), '2026-11-27', 'une semaine plus bas');
        key(document.activeElement, 'ArrowUp');
        key(document.activeElement, 'ArrowLeft');
        assertEqual(focusedIso(), '2026-11-19');
        key(document.activeElement, 'PageDown');
        assertEqual(focusedIso(), '2026-12-19', 'mois suivant');
        assertEqual(calendar().querySelector('.dp-title').textContent, 'décembre 2026');
        key(document.activeElement, 'PageUp');
        key(document.activeElement, 'Home');
        assertEqual(focusedIso(), '2026-11-16', 'début de semaine : le lundi');
        key(document.activeElement, 'End');
        assertEqual(focusedIso(), '2026-11-22', 'fin de semaine : le dimanche');
        for (let i = 0; i < 9; i++) key(document.activeElement, 'ArrowRight'); // 22/11 + 9 = 1er décembre : mois suivant
        assertEqual(focusedIso(), '2026-12-01');
        assertEqual(calendar().querySelector('.dp-title').textContent, 'décembre 2026');
        document.activeElement.click(); // Entrée sur un bouton = clic natif
        assertEqual(input.value, '01/12/2026');
      } finally { cleanup(); }
    });

    it('Alt+↓ (ou F4) dans le champ ouvre le calendrier', function () {
      const input = mount('2026-11-19');
      try {
        key(input, 'ArrowDown');
        assertFalse(!!calendar(), 'la flèche seule n\'ouvre rien');
        key(input, 'ArrowDown', { altKey: true });
        assertTrue(!!calendar());
        D().close();
        key(input, 'F4');
        assertTrue(!!calendar());
      } finally { cleanup(); }
    });

    it('un seul calendrier à la fois ; owns() reconnaît ses éléments (pour les popovers qui se ferment au clic extérieur)', function () {
      const a = mount('2026-11-19');
      try {
        openCalendar(a);
        const second = document.createElement('div');
        second.innerHTML = D().markup({ id: 'dp-test-b', iso: '2026-05-01' });
        host.appendChild(second);
        openCalendar(second.querySelector('input'));
        assertEqual(document.querySelectorAll('.dp-pop').length, 1);
        assertEqual(calendar().querySelector('.dp-title').textContent, 'mai 2026');
        assertTrue(D().owns(calendar().querySelector('.dp-day')));
        assertFalse(D().owns(a));
      } finally { cleanup(); }
    });

    it('s\'ouvre à l\'intérieur de la fenêtre, y compris près du bord bas, et au-dessus des modales', async function () {
      await withCss(async () => {
        const input = mount('2026-11-19');
        try {
          host.style.top = (window.innerHeight - 60) + 'px';
          openCalendar(input);
          const box = calendar().getBoundingClientRect();
          assertTrue(box.width > 200, 'calendrier mis en page');
          assertTrue(box.top >= 0 && box.bottom <= window.innerHeight, 'calendrier dans la fenêtre');
          assertTrue(box.bottom <= input.getBoundingClientRect().top + 1, 'faute de place dessous, il s\'ouvre au-dessus du champ');
          assertTrue(Number(getComputedStyle(calendar()).zIndex) > 1010, 'au-dessus des modales projet et personne (1000 et 1010)');
        } finally { cleanup(); }
      });
    });

    it('le champ a la place du bouton calendrier à droite et le texte ne passe pas dessous', async function () {
      await withCss(async () => {
        const input = mount('2026-11-19');
        try {
          const button = input.parentElement.querySelector('[data-dp-open]');
          assertTrue(button.getBoundingClientRect().left >= input.getBoundingClientRect().left + input.getBoundingClientRect().width / 2, 'bouton dans la moitié droite du champ');
          assertTrue(parseFloat(getComputedStyle(input).paddingRight) >= 26, 'marge droite réservée au bouton');
        } finally { cleanup(); }
      });
    });
  });

  describe('Saisie de date jj/mm/aaaa — modale projet', function () {
    const modalEl = () => document.getElementById('cp-project-modal');
    const refInput = k => modalEl().querySelector(`[data-ref="${k}"]`);
    function pickRef(k, query, matchText) {
      const input = refInput(k);
      setValue(input, query);
      fire(input, 'input');
      const button = Array.from(input.parentElement.querySelector('.cp-ref-list').querySelectorAll('button')).find(b => b.textContent === matchText);
      assertTrue(!!button, `aucune option "${matchText}" pour ${k}`);
      button.click();
    }
    async function loadFixtureState() {
      const tables = await window.CoreGrist.loadAllTables();
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      return tables;
    }
    // Tout est rempli SAUF la date limite de financement, tapée ensuite à la main.
    async function fillAllButDate() {
      window.ProjectModal.open();
      pickRef('Programme', 'Programme A', 'Programme A');
      setValue(modalEl().querySelector('#cp-Projet'), 'Mon nouveau projet');
      setValue(modalEl().querySelector('#cp-Acronyme'), 'MNP');
      pickRef('Porteur_1', 'Alice', 'Alice Martin');
      pickRef('VP_porteur_signataire_notif', 'Bob', 'Bob Durand');
      pickRef('Accompagnateur', 'Bob', 'Bob Durand');
      pickRef('Instance_ratachee', 'Comité', 'Comité innovation#3 - 2026-03-15');
      modalEl().querySelector('.cp-chip-row [data-value="Creation de ligne"]').click();
      const fin = modalEl().querySelector('[data-fin="c2026_M10_Fonctionnement"]');
      setValue(fin, '1000'); fire(fin, 'input');
    }
    const field = k => modalEl().querySelector('#cp-' + k);
    const save = () => modalEl().querySelector('[data-cp-save]').onclick();
    const errorText = () => modalEl().querySelector('#cp-project-error').textContent;
    const epoch = iso => Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 1000);

    it('les trois champs date de l\'onglet Instance et dates sont des champs texte jj/mm/aaaa, pas des champs natifs', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      ['Date_limite_financement', 'Date_debut_Projet', 'Date_de_fin_Projet'].forEach(k => {
        assertEqual(field(k).type, 'text', k);
        assertEqual(field(k).placeholder, 'jj/mm/aaaa', k);
        assertTrue(field(k).hasAttribute('data-dp'), k);
        assertTrue(!!field(k).parentElement.querySelector('[data-dp-open]'), `bouton calendrier de ${k}`);
      });
      assertEqual(modalEl().querySelectorAll('input[type="date"]').length, 0, 'plus aucun champ date natif dans la modale');
    });

    it('une date tapée au clavier (15012027) s\'enregistre : jour 15, mois 1, minuit UTC', async function () {
      await loadFixtureState();
      await fillAllButDate();
      type(field('Date_limite_financement'), '15012027');
      assertEqual(field('Date_limite_financement').value, '15/01/2027');
      type(field('Date_debut_Projet'), '1/3/2027');
      await save();
      assertEqual(window.__TEST_CALLS__.length, 1);
      const fields = window.__TEST_CALLS__[0].fields;
      assertEqual(fields.Date_limite_financement, epoch('2027-01-15'), '15/01/2027 = 15 janvier, pas le 1er du 15e mois');
      assertEqual(fields.Date_debut_Projet, epoch('2027-03-01'), '1/3/2027 = 1er mars');
      assertEqual(fields.Date_de_fin_Projet, null, 'champ resté vide : null');
    });

    it('une date à moitié tapée n\'est jamais lue comme « vide » : l\'enregistrement est refusé, rien ne part', async function () {
      await loadFixtureState();
      await fillAllButDate();
      type(field('Date_limite_financement'), '15/01/2027');
      type(field('Date_debut_Projet'), '15/01');
      await save();
      assertEqual(window.__TEST_CALLS__.length, 0, 'aucun appel Grist');
      assertIncludes(errorText(), 'Date de début du projet');
      assertIncludes(errorText(), 'jj/mm/aaaa');
      assertFalse(errorText().includes('Date limite'), 'seule la date fausse est citée');
    });

    it('en édition aussi : une date à moitié tapée ne supprime pas la date déjà enregistrée', async function () {
      const tables = await loadFixtureState();
      const base = tables.Projets.find(p => p.Acronyme === 'INNOVX');
      window.ProjectModal.open({ ...base, Date_limite_financement: 1805500800 });
      assertEqual(field('Date_limite_financement').value, '20/03/2027');
      type(field('Date_limite_financement'), '20/03');
      await save();
      assertEqual(window.__TEST_CALLS__.length, 0, 'rien n\'est écrit (la date de la base n\'est pas effacée)');
      assertIncludes(errorText(), 'Date limite de financement');
    });

    it('à la création, une Date limite de financement à moitié tapée compte comme manquante', async function () {
      await loadFixtureState();
      await fillAllButDate();
      type(field('Date_limite_financement'), '15/01');
      await save();
      assertEqual(window.__TEST_CALLS__.length, 0);
      assertIncludes(errorText(), 'Date limite de financement');
    });

    it('le calendrier de la modale est posé sur la page (hors de la modale) et un choix remplit le champ', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      const input = field('Date_debut_Projet');
      setValue(input, '2026-11-19');
      fireMouse(input.parentElement.querySelector('[data-dp-open]'), 'click');
      try {
        assertTrue(!!calendar(), 'calendrier ouvert');
        assertTrue(!modalEl().contains(calendar()), 'posé sur <body> : jamais rogné par le défilement de la modale');
        fireMouse(dayBtn('2026-11-25'), 'click');
        assertEqual(input.value, '25/11/2026');
        assertTrue(!modalEl().classList.contains('cp-hidden'), 'choisir une date ne ferme pas la modale');
      } finally { D().close(); }
    });
  });

  describe('Saisie de date jj/mm/aaaa — garde-fou sur le code source', function () {
    // Le champ natif ne peut pas être forcé en jj/mm/aaaa : il ne doit réapparaître nulle part dans le widget.
    it('aucun fichier du widget ne crée un <input type="date"> natif ni ne formate une date avec la langue du navigateur', async function () {
      const page = await (await fetch('../index.html', { cache: 'no-store' })).text();
      const sources = Array.from(page.matchAll(/<script src="(js\/[^"]+)"/g)).map(m => m[1]);
      assertTrue(sources.length > 20, 'scripts du widget retrouvés dans index.html');
      assertTrue(sources.includes('js/components/date-input.js'), 'date-input.js est chargé par index.html');
      const offenders = [];
      for (const src of sources) {
        const code = await (await fetch('../' + src, { cache: 'no-store' })).text();
        code.split('\n').forEach((line, i) => {
          if (/type\s*=\s*["']?date["']?/.test(line) && !/^\s*(\/\/|\*)/.test(line)) offenders.push(`${src}:${i + 1} champ date natif`);
          if (/toLocaleDateString\(|dateStyle\s*:/.test(line)) offenders.push(`${src}:${i + 1} date formatée selon le navigateur`);
        });
      }
      assertDeepEqual(offenders, [], 'des champs date natifs (mm/jj/aaaa selon le navigateur) sont revenus : ' + offenders.join(' ; '));
    });

    it('index.html charge la feuille de style et le script du composant', async function () {
      const page = await (await fetch('../index.html', { cache: 'no-store' })).text();
      assertIncludes(page, 'css/date-input.css');
      assertIncludes(page, 'js/components/date-input.js');
    });
  });
})();
