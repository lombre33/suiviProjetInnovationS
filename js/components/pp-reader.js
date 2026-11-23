/**
 * Lecteur Publipostage+ : le mode « Lecture épurée » de Publipostage+ lui-même (le document seul, tel que l'app le compose : conditions, textes
 * conditionnels, valeurs calculées, macro-modèles, page, marges, logos), dans une iframe de ce widget, à la place d'une relecture refaite ici.
 *
 * Même machinerie que la page Rédaction (js/pages/page-redaction.js) : l'iframe est pontée par js/core/grist-bridge.js (le widget imbriqué croit parler à Grist,
 * une ligne lui est présentée comme enregistrement sélectionné), et, les deux pages étant de même origine, on pilote son interface comme le fait keepReadMode :
 *  - le modèle : sa liste <select id="template-select"> (« l'unique source de vérité » du modèle affiché) reçoit l'identifiant du modèle puis un évènement `change`,
 *    le chemin ordinaire de Publipostage+ pour ouvrir un modèle ;
 *  - la lecture épurée : la ligne « Lecture épurée » du menu du bouton Mode lecture est cochée, puis le bouton cliqué (js/clean-reading.js de Publipostage+ : cocher ne
 *    fait rien d'autre, c'est le bouton qui agit). Publipostage+ démarre toujours en Édition (son init() se termine par switchMode('edit')) : on reclique tant que
 *    ce n'est pas tenu, puis on surveille (un clic est parfois repris par un rechargement tardif) ;
 *  - passer d'un projet à l'autre : `bridge.select(ligne)`, Publipostage+ suit la ligne en lecture sans rien recharger.
 * Dès que la personne agit dans Publipostage+ (souris, clavier), son choix prime : plus rien n'est forcé (sauf un autre modèle demandé par la page).
 *
 * Phases : 'idle' (rien demandé), 'loading' (iframe, connexion, modèle ou lecture épurée pas encore là), 'ready' (la lecture épurée du bon modèle est à l'écran),
 * 'failed' (délai dépassé : la raison est dans `note`, l'appelant se rabat sur son propre aperçu). Rien n'est jamais écrit dans le document d'ici.
 */
(function (global) {
  'use strict';

  const READ_BUTTON_ID = 'btn-mode-read';
  const SELECT_ID = 'template-select';
  const CLEAN_ROW = '#v2-read-flyout .v2-hover-row[data-read-choice="clean"]';
  const CLEAN_CLASS = 'pp-clean-reading'; // la classe que Publipostage+ pose sur <body> en lecture épurée (js/clean-reading.js : BODY_CLASS)
  const OPTIONS_KEY = 'publipostage';     // même clé que la page Rédaction : les réglages de Publipostage+ restent communs
  const DEFAULTS = { tickMs: 150, watchMs: 1000, giveUpMs: 30000, stableTicks: 2, absentTicks: 12 };

  const docOf = frame => { try { return frame.contentDocument; } catch (err) { return null; } };

  // Ouvre ce modèle dans Publipostage+ : 'ok' (déjà ouvert), 'set' (demandé à l'instant), 'waiting' (liste pas encore là), 'absent' (la liste est là, avec d'autres
  // modèles, mais pas celui-ci : elle se remplit parfois en deux temps, d'où un délai de grâce chez l'appelant), 'foreign' (autre origine).
  function selectModel(frame, id) {
    const doc = docOf(frame), win = frame.contentWindow;
    if (!doc || !win) return 'foreign';
    const select = doc.getElementById(SELECT_ID);
    if (!select) return 'waiting';
    const wanted = String(id), options = Array.from(select.options);
    if (!options.some(option => option.value === wanted)) return options.some(option => option.value !== '') ? 'absent' : 'waiting';
    if (select.value === wanted) return 'ok';
    select.value = wanted;
    select.dispatchEvent(new win.Event('change', { bubbles: true })); // l'évènement du chemin ordinaire (js/main.js : onTemplateSelectChange)
    return 'set';
  }

  // La lecture épurée : 'ok', 'set' (cochée puis bouton cliqué à l'instant), 'waiting' (menu ou bouton pas encore branchés), 'foreign'.
  function enterCleanReading(frame) {
    const doc = docOf(frame);
    if (!doc || !doc.body) return 'foreign';
    if (doc.body.classList.contains(CLEAN_CLASS)) return 'ok';
    const row = doc.querySelector(CLEAN_ROW), button = doc.getElementById(READ_BUTTON_ID);
    if (!row || !button) return 'waiting';
    row.click();
    button.click();
    return 'set';
  }

  // options : { container (l'élément qui reçoit l'iframe), target () → { url, origin }, onChange (phase, note), tickMs, watchMs, giveUpMs, stableTicks }
  function create(options) {
    const opts = Object.assign({}, DEFAULTS, options);
    const me = { phase: 'idle', note: '', frame: null, bridge: null, want: null, timer: null, startedAt: 0, acted: false, stable: 0, absent: 0, listened: null, destroyed: false };

    const set = (phase, note) => {
      const changed = me.phase !== phase || me.note !== (note || '');
      me.phase = phase; me.note = note || '';
      if (changed && typeof opts.onChange === 'function') opts.onChange(phase, me.note);
    };
    const stop = () => { clearInterval(me.timer); me.timer = null; me.paceMs = 0; };
    const fail = note => { stop(); set('failed', note); };

    function drop() {
      stop();
      if (me.bridge) me.bridge.detach();
      if (me.frame) me.frame.remove();
      me.frame = null; me.bridge = null; me.listened = null; me.stable = 0; me.absent = 0;
    }

    function createFrame() {
      const target = opts.target();
      if (!target || !target.url) { fail('adresse de Publipostage+ illisible'); return; }
      const frame = document.createElement('iframe');
      frame.title = 'Publipostage+ (lecture)';
      frame.setAttribute('allow', 'clipboard-write; clipboard-read');
      frame.style.cssText = 'width:100%;height:100%;border:0;display:block';
      opts.container.appendChild(frame); // dans le document avant de lui donner son adresse : il lui faut une fenêtre
      me.frame = frame;
      // Le pont écoute AVANT le chargement de l'iframe : son « prêt » arrive dès l'exécution de son grist.ready().
      me.bridge = global.GristBridge.attach(frame, {
        origin: target.origin, tableId: me.want.table, rowId: Number(me.want.rowId), optionsKey: OPTIONS_KEY,
        onStatus: status => { if (status.phase === 'rejected') fail('origine de Publipostage+ refusée'); }, onLog: () => {}
      });
      frame.src = target.url;
    }

    const onAct = () => { me.acted = true; };
    function tick() {
      if (me.destroyed || !me.frame) return;
      if (!me.frame.isConnected) { drop(); set('idle', 'iframe retirée'); return; }
      const doc = docOf(me.frame);
      if (!doc) { fail('Publipostage+ est d\'une autre origine : son interface ne se pilote pas'); return; }
      if (doc !== me.listened) { // la première lecture est parfois l'about:blank d'avant la navigation
        me.listened = doc;
        ['pointerdown', 'keydown'].forEach(type => doc.addEventListener(type, onAct, true));
      }
      const waiting = why => {
        me.stable = 0;
        pace(opts.tickMs);
        set('loading', why);
        if (Date.now() - me.startedAt >= opts.giveUpMs) fail(why);
      };
      if (!me.bridge.getState().ready) { waiting('connexion à Publipostage+'); return; }
      // La personne a pris la main dans Publipostage+ : on ne force plus rien, la lecture reste ce qu'elle en a fait.
      if (me.acted) { me.stable = opts.stableTicks; pace(opts.watchMs); set('ready', 'la personne a repris la main dans Publipostage+'); return; }
      const model = selectModel(me.frame, me.want.modelId);
      if (model === 'foreign') { fail('Publipostage+ est d\'une autre origine : son interface ne se pilote pas'); return; }
      me.absent = model === 'absent' ? me.absent + 1 : 0;
      if (me.absent >= opts.absentTicks) { fail('ce modèle n\'est pas dans la liste de Publipostage+'); return; } // inutile d'attendre le délai complet : repli tout de suite
      if (model !== 'ok') { waiting(model === 'set' ? 'ouverture du modèle' : (model === 'absent' ? 'modèle pas encore dans la liste de Publipostage+' : 'liste des modèles de Publipostage+ pas encore chargée')); return; }
      const clean = enterCleanReading(me.frame);
      if (clean === 'foreign') { fail('Publipostage+ est d\'une autre origine : son interface ne se pilote pas'); return; }
      if (clean !== 'ok') { waiting(clean === 'set' ? 'passage en lecture épurée' : 'boutons de lecture de Publipostage+ pas encore branchés'); return; }
      me.stable += 1;
      if (me.stable >= opts.stableTicks) { pace(opts.watchMs); set('ready', ''); } // prêt : on ne fait plus que surveiller, au ralenti
    }

    // Le pas du pilotage : serré tant que la lecture n'est pas là, au ralenti ensuite (une reprise tardive de l'Édition est rattrapée).
    function pace(ms) {
      if (me.timer && me.paceMs === ms) return;
      clearInterval(me.timer);
      me.paceMs = ms;
      me.timer = setInterval(tick, ms);
    }
    function run() { if (!me.timer) pace(opts.tickMs); }

    return {
      // want : { table, rowId, modelId } : la ligne à présenter et l'identifiant (ligne de la table des modèles) du modèle à lire.
      show(want) {
        if (me.destroyed) return;
        if (me.phase === 'failed') { me.want = { table: want.table, rowId: want.rowId, modelId: want.modelId }; return; } // l'appelant a son repli ; `retry()` réessaie
        const modelChanged = !me.want || String(me.want.modelId) !== String(want.modelId);
        const tableChanged = !!me.bridge && me.bridge.getState().tableId !== want.table; // Publipostage+ ne connaît qu'une table par chargement
        me.want = { table: want.table, rowId: want.rowId, modelId: want.modelId };
        if (tableChanged) drop();
        if (!me.frame) { me.startedAt = Date.now(); me.acted = false; set('loading', 'ouverture de Publipostage+'); createFrame(); }
        else {
          me.bridge.select(want.rowId, want.table); // le « select by » : Publipostage+ reçoit cette ligne dans son onRecord et refait la lecture
          if (modelChanged) { me.startedAt = Date.now(); me.acted = false; me.stable = 0; me.absent = 0; set('loading', 'ouverture du modèle'); }
        }
        if (me.frame) run();
      },
      // Nouvelle tentative après un échec (bouton « Relire ») : l'iframe est recréée.
      retry() {
        if (me.destroyed || !me.want) return;
        drop();
        me.phase = 'idle'; me.startedAt = Date.now(); me.acted = false;
        set('loading', 'ouverture de Publipostage+');
        createFrame();
        if (me.frame) run();
      },
      destroy() { me.destroyed = true; drop(); set('idle', ''); },
      get phase() { return me.phase; },
      get note() { return me.note; },
      get frame() { return me.frame; },
      get bridge() { return me.bridge; },
      get want() { return me.want; }
    };
  }

  global.PpReader = { create, selectModel, enterCleanReading, SELECT_ID, READ_BUTTON_ID, CLEAN_CLASS, DEFAULTS };
})(window);
