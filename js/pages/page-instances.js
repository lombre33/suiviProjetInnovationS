/** Page « par instance » (CTO, Comité innovation, COPIL, COT) — maquette V4 validée par Antoine le 09/11/2026,
 * https://claude.ai/artifact/TNA7aRTFGZcvV1858SGzPe. Une séance = une ligne de Suivi_Instance ; la page résume les
 * étapes de la séance (ordre du jour, invités, mail d'invitation, compte rendu, envoi du CR, notifications liées)
 * et leurs validations, en mode « Souple » : chaque étape se valide sur ses propres conditions, un avertissement
 * signale une étape précédente restée ouverte, aucun verrou.
 *
 * Fichiers : instances-logic.js (règles pures), instances-data.js (schéma Grist, lecture/écriture, normalisation),
 * ce fichier (état, rendu, actions), css/instances.css (classes préfixées « in- » : withPrefix() les ajoute au rendu).
 *
 * Tables Grist créées à la première ouverture (voir instances-data.js) : Instance_Invites, Instance_Points,
 * Instance_Relectures, Instance_Validations, Export_VP (lue par Sync+ vers l'outil de signature du VP) + colonnes
 * ajoutées à Instances et Suivi_Instance. Préférences par utilisateur (instance, séance, étape, variante de la vue
 * d'ensemble) dans Preferences_Widget (Inst_*).
 *
 * Instances présentées (10/11/2026) : seulement « CTO Innovation » et « Comité innovation » (INSTANCE_RULES dans
 * instances-logic.js) ; le Comité n'a ni envoi du CR ni notifications (étapes grisées dans la barre du haut, absentes
 * de la frise). Menu des séances : la prochaine et la dernière épinglées, puis « à venir » et « passées ».
 * Compte rendu : GFS intégré (pont Grist, comme publipostage+ dans la page Rédaction) pour le rédiger sur place ;
 * bouton « Télécharger le CR » sur Suivi_Instance.CR_PDF, le PDF exporté à la main depuis GFS une fois le texte relu.
 *
 * Bouton « Mettre à disposition du VP » : jamais automatique, avec confirmation ; ne modifie PAS
 * Notifications.notifications_Statut ; le widget n'ouvre jamais Export_VP.PDF_signe (sécurité de la pièce signée
 * traitée dans le fil « signature »).
 */
(function (global) {
  'use strict';
  const L = global.InstancesLogic, D = global.InstancesData;
  const C = L.CHOICES;
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const text = D.text;
  const PREFS_TABLE = 'Preferences_Widget';
  const PREFS_ROWID_STORAGE_KEY = 'suiviProjetInnovationS:prefsRowId';
  const EMAIL_TRIGGER_COLUMN = { id: 'Email_utilisateur', type: 'Text', isFormula: false, formula: 'user.Email', recalcWhen: 0 };
  const MODAL_MENUS = ['relpick', 'permpick', 'dur', 'cfgtime'];
  const VARIANTS = ['A', 'B', 'C'];
  // Gagner de la place pour GFS (étape Compte rendu) : bandeau replié, relecture repliée, « plein cadre » (en-tête de l'appli et
  // panneaux masqués, GFS sur toute la hauteur) et hauteur de GFS. Retenu par utilisateur (Preferences_Widget.Inst_cadre, JSON).
  const HAUTEURS = ['ajustee', 'haute', 'tres-haute'];
  const HAUTEUR_LABEL = { 'ajustee': 'à la hauteur de l\'écran', 'haute': 'une fois et demie l\'écran', 'tres-haute': 'deux fois et demie l\'écran' };
  function defaultCadre() { return { bandeau: false, cr: false, plein: false, hauteur: 'ajustee' }; }
  function parseCadre(raw) {
    const cadre = defaultCadre();
    try {
      const o = JSON.parse(raw || '{}');
      if (o && typeof o === 'object') {
        cadre.bandeau = o.bandeau === true; cadre.cr = o.cr === true; cadre.plein = o.plein === true;
        if (HAUTEURS.indexOf(o.hauteur) >= 0) cadre.hauteur = o.hauteur;
      }
    } catch (err) { /* valeur illisible : réglages par défaut */ }
    return cadre;
  }
  const ODJ_VUES = ['timing', 'type']; // vue de l'ordre du jour : ordre de passage (défaut) ou groupée par type de décision
  const CR_PDF_COLUMN = 'CR_PDF';

  let todayOverride = null;
  const todayIso = () => todayOverride || (L.parisParts(Date.now() / 1000) || {}).date || new Date().toISOString().slice(0, 10);

  const S = {
    loaded: false, loading: null, error: '', raw: {}, store: null, model: null, defer: false, drag: null,
    prefs: { instanceId: null, seances: {}, etape: 'macro', vue: 'A', odjVue: 'timing', cadre: defaultCadre(), invTri: '' }, prefsRowId: null, personId: 0,
    ui: { menu: null, settings: false, subs: {} }
  };

  // ---------------------------------------------------------------------------------------------
  // Icônes et petits utilitaires de rendu
  // ---------------------------------------------------------------------------------------------
  const SVG = {
    expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>', shrink: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>', vexpand: '<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>', up: '<path d="M6 15l6-6 6 6"/>', plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M5 12l5 5L20 7"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', pin: '<path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    macro: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.8a3.5 3.5 0 010 6.4M18 14.3c2.2.6 3.5 2.4 3.5 5.7"/>',
    peopleAdd: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M19 8v6M16 11h6"/>',
    project: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M8 7v6M12 7v10M16 7v4"/>',
    clip: '<path d="M21 11l-9 9a5 5 0 01-7-7l9-9a3.5 3.5 0 015 5l-9 9a2 2 0 01-3-3l8-8"/>',
    warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>', star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    ask: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1-1.5 2M12 17h.01"/>', no: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    dots: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>',
    validation: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>', discussion: '<path d="M4 5h16v11H9l-5 4z"/>', information: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
    file: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>', fileLines: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>', start: '<path d="M5 4v16M9 12h11M13 8l-4 4 4 4"/>', end: '<path d="M19 4v16M15 12H4M11 8l4 4-4 4"/>',
    calCheck: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M9 16l2 2 4-4"/>', send: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', idle: '<circle cx="12" cy="12" r="8"/>',
    pencil: '<path d="M4 20h4L19 9a2.1 2.1 0 00-3-3L5 17z"/><path d="M14 7l3 3"/>', reopen: '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/>',
    hourglass: '<path d="M7 3h10M7 21h10M8 3v4l4 5-4 5v4M16 3v4l-4 5 4 5v4"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21"/>',
    download: '<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14"/>', pushpin: '<path d="M9 3.5h6l-1 6 3 3.5v2H7v-2l3-3.5zM12 15v5.5"/>', tick: '<circle cx="12" cy="12" r="9"/><path class="ck" d="M8 12l3 3 5-6"/>'
  };
  const ic = (name, size, extra) => '<svg class="ic' + (size ? ' ' + size : '') + (extra ? ' ' + extra : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + SVG[name] + '</svg>';
  // Les classes de la maquette sont préfixées « in- » ici, au rendu, pour que le CSS reste isolé (voir css/instances.css).
  const withPrefix = html => html.replace(/class="([^"]*)"/g, (all, list) => 'class="' + list.split(/\s+/).filter(Boolean).map(c => 'in-' + c).join(' ') + '"');
  const da = (act, o) => 'data-act="' + act + '"' + Object.keys(o || {}).map(k => ' data-' + k + '="' + esc(o[k]) + '"').join('');
  const plural = (n, one, many) => n + ' ' + (n > 1 ? many : one);
  const helpToken = (table, colId) => '@@HELP:' + table + ':' + colId + '@@';
  const fillHelp = html => html.replace(/@@HELP:([A-Za-z_0-9]+):([A-Za-z_0-9]+)@@/g, (all, table, colId) => (global.HelpTooltip ? global.HelpTooltip.markup(table, colId) : ''));

  // ---------------------------------------------------------------------------------------------
  // Données : chargement, modèle, écritures
  // ---------------------------------------------------------------------------------------------
  const tableOf = name => (global.CoreState && global.CoreState.getTable(name)) || [];
  function rebuild() {
    S.model = D.buildModel(S.raw, { annuaire: tableOf('Annuaire'), postes: tableOf('Postes2'), projets: tableOf('Projets'), notifications: tableOf('Notifications') });
  }
  function setRaw(raw) {
    Object.keys(S.raw).forEach(k => { delete S.raw[k]; });
    Object.assign(S.raw, raw);
  }
  async function reloadFromGrist() {
    try { setRaw(await D.fetchAll()); rebuild(); render(); } catch (err) { console.warn('Rechargement Instances :', err.message); }
  }
  function ensureStore() {
    if (S.store) return;
    S.store = D.createStore(S.raw, {
      changed: () => { rebuild(); if (S.defer) scheduleRender(); else render(); },
      failed: err => { if (global.CoreUtils) global.CoreUtils.showToast('Enregistrement impossible : ' + err.message, true); reloadFromGrist(); }
    });
  }
  // Écrit des opérations ; `defer` : repousse le rendu (champs texte, pour ne pas perdre le clic qui a fait perdre le focus).
  function write(ops, opts) {
    ensureStore();
    S.defer = !!(opts && opts.defer);
    const promise = S.store.commit(ops).catch(() => []);
    S.defer = false;
    return promise;
  }
  let renderTimer = null;
  function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(() => { renderTimer = null; render(); }, 150); }

  async function ensureLoaded(force) {
    if (S.loaded && !force) return;
    if (S.loading) return S.loading;
    S.loading = (async () => {
      try {
        if (!global.CoreGrist || !global.CoreGrist.gristInstance) throw new Error('Grist non disponible');
        if (!S.loaded) await D.ensureSchema();
        setRaw(await D.fetchAll());
        if (S.raw.Instances__error) throw new Error('table Instances introuvable (' + S.raw.Instances__error + ')');
        rebuild();
        S.loaded = true; S.error = '';
      } catch (err) {
        S.error = "Page Instances indisponible : " + err.message + '. Il faut un droit d\'édition sur le document pour créer les tables de la page.';
        console.error('Page Instances :', err);
      } finally {
        S.loading = null;
        render(); renderNavMenu();
      }
    })();
    return S.loading;
  }

  // ---------------------------------------------------------------------------------------------
  // Préférences par utilisateur (Preferences_Widget) et identification de « moi » (Annuaire.Email)
  // ---------------------------------------------------------------------------------------------
  const getCachedPrefsRowId = () => { try { const raw = localStorage.getItem(PREFS_ROWID_STORAGE_KEY); return raw ? Number(raw) : null; } catch (err) { return null; } };
  const setCachedPrefsRowId = id => { try { localStorage.setItem(PREFS_ROWID_STORAGE_KEY, String(id)); } catch (err) { /* stockage bloqué : tant pis */ } };
  async function loadInstancesUserPreferences() {
    if (!global.CoreGrist || !global.CoreGrist.gristInstance) return;
    try {
      await global.CoreGrist.ensureTable(PREFS_TABLE, [EMAIL_TRIGGER_COLUMN, ...D.PREFS_COLUMNS]);
      await global.CoreGrist.ensureColumns(PREFS_TABLE, D.PREFS_COLUMNS);
      const rows = await global.CoreGrist.getTable(PREFS_TABLE, { shared: true }); // lecture partagée au démarrage (js/app.js)
      const cachedId = getCachedPrefsRowId();
      const row = cachedId != null ? rows.find(r => r.id === cachedId) : null;
      if (!row) {
        const result = await global.CoreGrist.gristInstance.docApi.applyUserActions([['AddRecord', PREFS_TABLE, null, {}]]);
        global.CoreGrist.invalidateTable(PREFS_TABLE); // la ligne vient d'être ajoutée : la prochaine lecture partagée doit la contenir
        S.prefsRowId = global.CoreUtils.extractAddedRecordId(result);
        setCachedPrefsRowId(S.prefsRowId);
        return;
      }
      S.prefsRowId = row.id;
      const email = text(row.Email_utilisateur).trim().toLowerCase();
      const me = email ? tableOf('Annuaire').find(p => text(p.Email).trim().toLowerCase() === email) : null;
      S.personId = me ? me.id : 0;
      S.prefs.instanceId = Number(row.Inst_instance) || null;
      try { const map = JSON.parse(text(row.Inst_seances) || '{}'); S.prefs.seances = map && typeof map === 'object' ? map : {}; } catch (err) { S.prefs.seances = {}; }
      if (text(row.Inst_etape)) S.prefs.etape = text(row.Inst_etape);
      if (VARIANTS.indexOf(text(row.Inst_vue)) >= 0) S.prefs.vue = text(row.Inst_vue);
      if (ODJ_VUES.indexOf(text(row.Inst_odj_vue)) >= 0) S.prefs.odjVue = text(row.Inst_odj_vue);
      S.prefs.cadre = parseCadre(text(row.Inst_cadre));
      S.prefs.invTri = L.GUEST_TRI.test(text(row.Inst_tri_invites)) ? text(row.Inst_tri_invites) : '';
    } catch (err) {
      console.warn('Chargement des préférences Instances a échoué :', err.message);
    }
  }
  async function savePrefs() {
    if (!S.prefsRowId || !global.CoreGrist || !global.CoreGrist.gristInstance) return;
    try {
      await global.CoreGrist.gristInstance.docApi.applyUserActions([['UpdateRecord', PREFS_TABLE, S.prefsRowId, {
        Inst_instance: S.prefs.instanceId ? String(S.prefs.instanceId) : '', Inst_seances: JSON.stringify(S.prefs.seances),
        Inst_etape: S.prefs.etape, Inst_vue: S.prefs.vue, Inst_odj_vue: S.prefs.odjVue, Inst_cadre: JSON.stringify(S.prefs.cadre), Inst_tri_invites: S.prefs.invTri
      }]]);
    } catch (err) { console.warn('Enregistrement des préférences Instances a échoué :', err.message); }
  }

  // ---------------------------------------------------------------------------------------------
  // Sélection : instance, séance
  // ---------------------------------------------------------------------------------------------
  function currentInstance() {
    const m = S.model; if (!m) return null;
    return m.instById[S.prefs.instanceId] || m.instances[0] || null;
  }
  function defaultSeance(inst) {
    const g = L.groupSeances(inst.seances, todayIso());
    return g.next || g.last || inst.seances[0] || null;
  }
  function currentSeance(inst) {
    if (!inst) return null;
    const id = S.prefs.seances[inst.id];
    return inst.seances.find(x => x.id === id) || defaultSeance(inst);
  }
  const personOf = (m, id) => m.peopleById[id] || { id, name: '?', poste: '' };
  const projectOf = (m, id) => m.projectsById[id] || { id, acro: '?', titre: '', notif: '' };

  // ---------------------------------------------------------------------------------------------
  // Modèle de vue : tout ce que le rendu affiche, calculé une fois par rendu
  // ---------------------------------------------------------------------------------------------
  function validationCtx(m, s, cfg) {
    const projectIds = [];
    L.allPoints(s).forEach(p => p.projets.forEach(id => { if (projectIds.indexOf(id) < 0) projectIds.push(id); }));
    const projectVp = {};
    projectIds.forEach(id => { projectVp[id] = L.vpState(s.exports[id], L.notifNum(projectOf(m, id).notif)); });
    // sched = les points de l'ordre du jour (chacun avec ses sous-points dans `subRows`) ; schedAll = tout à plat, sous-points compris
    const { top: sched, all: schedAll } = L.scheduleWithSubs(s.points, L.toMin(s.heure) || 0);
    const guestsById = {}; s.guests.forEach(g => { guestsById[g.id] = g; });
    const nameOf = pid => personOf(m, pid).name;
    const conflicts = L.computeConflicts(schedAll, guestsById, nameOf);
    return { seance: s, cfg, sched, schedAll, conflicts, guests: s.guests, relectures: s.relectures, validations: s.validations, endMin: (L.toMin(s.heure) || 0) + cfg.duree, personName: nameOf, projectIds, projectVp };
  }
  function computeView() {
    const m = S.model, inst = currentInstance();
    const V = { m, inst, cfg: inst && inst.cfg, s: null, today: todayIso() };
    if (!inst) return V;
    V.s = currentSeance(inst);
    V.active = L.STEPS.filter(x => inst.cfg.steps.indexOf(x.key) >= 0);
    if (!V.s) return V;
    const s = V.s, cfg = inst.cfg;
    const ctx = V.ctx = validationCtx(m, s, cfg);
    V.sched = ctx.sched; V.schedAll = ctx.schedAll; V.conf = ctx.conflicts; V.endMin = ctx.endMin; V.nameOf = ctx.personName;
    V.startMin = L.toMin(s.heure) || 0;
    V.lastEnd = V.sched.length ? V.sched[V.sched.length - 1].end : V.startMin;
    V.over = V.lastEnd > V.endMin;
    V.view = (S.prefs.etape !== 'macro' && V.active.some(x => x.key === S.prefs.etape)) ? S.prefs.etape : 'macro';
    V.isMacro = V.view === 'macro';
    V.stepKey = V.isMacro ? V.active[0].key : V.view;
    V.valid = key => L.isValid(key, ctx);
    V.firstOpen = (V.active.find(x => !V.valid(x.key)) || V.active[V.active.length - 1]).key;
    V.stepIdx = V.active.findIndex(x => x.key === V.stepKey);
    V.curStep = V.active[V.stepIdx];
    V.curDone = V.valid(V.stepKey);
    V.dateStep = L.DATE_STEPS.indexOf(V.stepKey) >= 0;
    V.conds = L.stepConditions(V.stepKey, ctx);
    V.missing = V.conds.filter(x => !x.warn && !x.ok).map(x => x.text);
    const prevOpen = V.active.slice(0, V.stepIdx).filter(x => !V.valid(x.key)).map(x => x.short);
    V.alerts = V.conds.filter(x => x.warn && !x.ok).map(x => x.text);
    if (!V.curDone && prevOpen.length) V.alerts.push('Étapes précédentes à valider : ' + prevOpen.join(', '));
    V.nDone = V.active.filter(x => V.valid(x.key)).length;
    V.guestOrder = L.sortGuests(s.guests, S.prefs.invTri, g => personOf(m, g.personneId).name, g => personOf(m, g.personneId).gradeKind);
    V.firstStart = g => L.firstStartOf(V.schedAll, g.id);
    return V;
  }
  const progressOf = (m, se, active) => active.filter(x => L.isValid(x.key, { seance: se, validations: se.validations })).length + '/' + active.length;
  const hasLink = (type, link) => !!(type && link);

  // ---------------------------------------------------------------------------------------------
  // Rendu — bandeau
  // ---------------------------------------------------------------------------------------------
  const isOpen = key => S.ui.menu === key;
  function timeMenu(key, value, scope, id, from, to, canClear, head) {
    let out = '<div class="menu tgrid">' + (head || '');
    for (let t = from; t <= to; t += 15) { const l = L.hhmm(t); out += '<button type="button" class="mi ' + (l === value ? 'on' : '') + '" ' + da('time-pick', { s: scope, id: id || '', v: l }) + '>' + l + '</button>'; }
    if (canClear && value) out += '<button type="button" class="mi wide" ' + da('time-clear', { s: scope, id: id || '' }) + '>Effacer</button>';
    return out + '</div>';
  }
  // Menu des séances : la prochaine et la dernière épinglées en haut, puis « à venir » (la plus proche d'abord) et « passées »
  // (la plus récente d'abord) — demande d'Antoine du 10/11/2026.
  function seanceMenu(V) {
    const { m, inst, s } = V;
    const g = L.groupSeances(inst.seances, V.today);
    const item = (se, pin) => '<button type="button" class="mi ' + (se.id === s.id ? 'on' : '') + '" ' + da('seance-pick', { id: se.id }) + '><span class="mi-main"><span>' + (pin ? ic('pushpin', 's') + ' ' : '') + 'n°' + esc(se.num || '?') + ' · ' + esc(L.fmtDate(se.date) || 'sans date') + '</span>'
      + (pin ? '<span class="mi-sub">' + pin + '</span>' : '') + '</span><span class="mi-sub">' + progressOf(m, se, V.active) + '</span></button>';
    let h = '<div class="menu" data-seance-menu>';
    if (g.next) h += item(g.next, 'Prochaine');
    if (g.last) h += item(g.last, 'Dernière');
    if (g.next || g.last) h += '<div class="mi-sep"></div>';
    if (g.upcoming.length) h += '<div class="mh">À venir</div>' + g.upcoming.map(se => item(se)).join('');
    if (g.past.length) h += '<div class="mh">Passées</div>' + g.past.map(se => item(se)).join('');
    return h + '<div class="mi-sep"></div><button type="button" class="mi" ' + da('seance-new') + '><span>Nouvelle séance</span>' + ic('plus', 's') + '</button></div>';
  }
  function bandHtml(V) {
    const { m, inst, s } = V;
    const fold = !!(s && S.prefs.cadre.bandeau);
    let h = '<section class="band' + (fold ? ' fold' : '') + '" aria-label="Séance et étapes"><span class="inst-badge">' + esc(inst.nom) + '</span>';
    if (!s) {
      return h + '<span class="muted">Aucune séance pour cette instance.</span><span class="sp"></span><button type="button" class="pillbtn" ' + da('seance-new') + '>' + ic('plus', 's') + 'Nouvelle séance</button>'
        + '<button type="button" class="rbtn ghost" title="Paramétrage de l\'instance" aria-label="Paramétrage de l\'instance" ' + da('settings-open') + '>' + ic('sliders') + '</button></section>';
    }
    const when = s.date && s.date < V.today ? 'passée' : 'à venir';
    h += '<div class="rel"><button type="button" class="sel" ' + da('menu', { v: 'seance' }) + '><span>n°' + esc(s.num || '?') + ' · ' + esc(L.fmtDate(s.date) || 'sans date') + '</span><span class="tag-soft">' + when + '</span>' + ic('chevron', 's') + '</button>';
    if (isOpen('seance')) h += seanceMenu(V);
    h += '</div>';
    // heure de début (+ date de la séance) ; heure et salle disparaissent quand le bandeau est replié
    h += '<div class="rel bhide"><button type="button" class="tp" title="Date et heure de début" aria-label="Heure de début" ' + da('menu', { v: 'heure' }) + '>' + ic('clock', 's') + esc(s.heure) + '<span class="muted">→ ' + L.hhmm(V.endMin) + '</span></button>';
    if (isOpen('heure')) {
      h += timeMenu('heure', s.heure, 'heure', '', 6 * 60, 20 * 60, false, '<div class="mform" style="grid-column:1/-1"><input type="date" class="dp" aria-label="Date de la séance" value="' + esc(s.date) + '" data-chg="seance-date"></div>');
    }
    h += '</div>';
    // heures de début proposées d'un clic (CTO : 9h00 ou 10h45) : écrites dans Suivi_Instance.Heure, comme le sélecteur d'heure
    // ci-dessus (qui reste pour une autre heure) ; mise en valeur seulement quand l'heure est enregistrée dans la séance
    if (inst.cfg.heuresChoix.length) {
      h += '<div class="seg bhide" role="group" aria-label="Heure de début de la séance">' + inst.cfg.heuresChoix.map(hh => '<button type="button" class="' + (s.heureSet && s.heure === hh ? 'on' : '') + '" title="Début de la séance à ' + hh.replace(':', 'h') + '" aria-pressed="' + (s.heureSet && s.heure === hh ? 'true' : 'false') + '" ' + da('time-pick', { s: 'heure', v: hh }) + '>' + hh.replace(/^0/, '').replace(':', 'h') + '</button>').join('') + '</div>';
    }
    // salle (table Lieux)
    const salle = m.lieuxById[s.salleId];
    h += '<div class="rel bhide"><button type="button" class="tp" title="Salle" aria-label="Salle" ' + da('menu', { v: 'salle' }) + '>' + ic('pin', 's') + esc(salle ? salle.nom : 'Salle ?') + ic('chevron', 'xs') + '</button>';
    if (isOpen('salle')) {
      h += '<div class="menu">' + (m.lieux.length ? m.lieux.map(l => '<button type="button" class="mi ' + (l.id === s.salleId ? 'on' : '') + '" ' + da('salle-pick', { id: l.id }) + '><span>' + esc(l.nom) + '</span><span class="mi-sub">' + esc(l.sub) + '</span></button>').join('') : '<div class="mh">— Aucun lieu —</div>') + '</div>';
    }
    h += '</div>';
    // étapes
    h += '<div class="stepper" role="tablist" aria-label="Vues de la séance"><button type="button" role="tab" class="chip macro ' + (V.isMacro ? 'sel-on' : '') + '" title="Vue d\'ensemble" ' + da('step', { v: 'macro' }) + '>' + ic('macro') + V.nDone + '/' + V.active.length + '</button>';
    // Toutes les étapes restent visibles : celles que l'instance ne suit pas sont grisées, sans action (ex. Comité innovation).
    L.STEPS.forEach(x => {
      const i = V.active.findIndex(a => a.key === x.key);
      if (i < 0) {
        h += '<span role="tab" aria-disabled="true" class="chip off" title="' + esc(x.label + ' — non suivie par cette instance') + '"><span class="chip-n">–</span>' + esc(x.chip) + '</span>';
        return;
      }
      const done = V.valid(x.key), warn = !done && L.stepConditions(x.key, V.ctx).some(z => z.chip && !z.ok);
      const cls = (done ? 'done' : (x.key === V.firstOpen ? 'current' : 'todo')) + (x.key === V.view ? ' sel-on' : '');
      h += '<button type="button" role="tab" class="chip ' + cls + '" title="' + esc(x.label + (done ? ' — ' + L.validatedInfo(x.key, V.ctx, V.nameOf) : '')) + '" ' + da('step', { v: x.key }) + '><span class="chip-n">' + (done ? ic('check', 'xs') : (i + 1)) + '</span>' + esc(x.chip) + (warn ? '<span class="dot"></span>' : '') + '</button>';
    });
    const foldTip = fold ? 'Déplier le bandeau (heure, salle)' : 'Replier le bandeau (heure, salle)';
    h += '</div><button type="button" class="rbtn ghost" title="' + foldTip + '" aria-label="' + foldTip + '" aria-expanded="' + (fold ? 'false' : 'true') + '" ' + da('fold', { v: 'bandeau' }) + '>' + ic(fold ? 'chevron' : 'up') + '</button>'
      + '<button type="button" class="rbtn ghost" title="Paramétrage de l\'instance" aria-label="Paramétrage de l\'instance" ' + da('settings-open') + '>' + ic('sliders') + '</button></section>';
    return h;
  }

  // ---------------------------------------------------------------------------------------------
  // Rendu — vue d'ensemble
  // ---------------------------------------------------------------------------------------------
  function macroHtml(V) {
    const { s, cfg, m } = V;
    const vue = S.prefs.vue;
    const nWritten = s.guests.filter(g => g.ecritLe).length;
    const nYes = s.guests.filter(g => g.reponse === 'viendra').length, nNo = s.guests.filter(g => g.reponse === 'excuse').length, nAsk = s.guests.length - nYes - nNo;
    const nAppel = s.guests.filter(g => g.appel === 'present').length;
    const horTot = s.guests.filter(g => !!V.firstStart(g)).length;
    const horOk = s.guests.filter(g => { const f0 = V.firstStart(g); return !!f0 && !!g.passageLe && g.passageHeure === f0; }).length;
    const nSpecial = s.guests.filter(g => g.origine === 'point').length;
    const writtenPct = s.guests.length ? Math.round(100 * nWritten / s.guests.length) + '%' : '0%';
    const nConf = Object.keys(V.conf).length;
    const projIds = V.ctx.projectIds;
    const nSigned = projIds.filter(id => V.ctx.projectVp[id].key === 'signed').length, nWait = projIds.filter(id => V.ctx.projectVp[id].key === 'wait').length;
    const toSend = projIds.filter(id => V.ctx.projectVp[id].key === 'none');
    const sdot = key => { const done = V.valid(key); return '<span class="sdot ' + (done ? 'done' : (key === V.firstOpen ? 'cur' : 'todo')) + '">' + (done ? ic('check', 'xs') : '') + '</span>'; };
    const spanTxt = L.durTxt(V.lastEnd - V.startMin);
    let h = '<div class="vswitch"><span>Proposition de vue</span><div class="seg" role="group" aria-label="Variante de la vue d\'ensemble">'
      + [['A', 'A · Fil horizontal'], ['B', 'B · Fil vertical'], ['C', 'C · Rail complet']].map(v => '<button type="button" class="' + (vue === v[0] ? 'on' : '') + '" ' + da('vue', { v: v[0] }) + '>' + v[1] + '</button>').join('') + '</div></div>';
    if (V.active.some(x => x.key === 'invites')) {
      h += '<div class="kpi4"><button type="button" class="ksq" ' + da('step', { v: 'invites' }) + '><span class="kv">' + s.guests.length + '</span><span class="kl">invités</span></button>'
        + '<button type="button" class="ksq" ' + da('step', { v: 'invites' }) + '><span class="kv ' + (nWritten < s.guests.length ? 'warn' : '') + '">' + nWritten + '/' + s.guests.length + '</span><span class="kl">invitations écrites</span><span class="kl">horaires de passage ' + horOk + '/' + horTot + '</span></button>'
        + '<button type="button" class="ksq" ' + da('step', { v: 'invites' }) + '><span class="kv"><span class="kmini">' + ic('check', 's') + nYes + '</span><span class="kmini">' + ic('ask', 's') + nAsk + '</span><span class="kmini">' + ic('x', 's') + nNo + '</span></span><span class="kl">réponses</span></button>'
        + '<button type="button" class="ksq" ' + da('step', { v: 'invites' }) + '><span class="kv">' + nAppel + '/' + s.guests.length + '</span><span class="kl">appel du jour</span></button></div>';
    }
    h += '<div class="dash v' + vue.toLowerCase() + '">';
    if (V.active.some(x => x.key === 'odj')) {
      h += '<button type="button" class="tile s2" ' + da('step', { v: 'odj' }) + '><span class="th2">' + ic('list') + 'Ordre du jour<span class="sp"></span>'
        + (nConf ? '<span class="alert-pill" title="' + esc(nConf + ' point(s) avec un invité indisponible') + '">' + ic('warn', 's') + nConf + '</span>' : '') + sdot('odj') + '</span>'
        + '<span class="meta ' + (V.over ? 'over' : '') + '">' + plural(s.points.length, 'point', 'points') + ' · ' + spanTxt + ' · ' + L.hhmm(V.startMin) + ' → ' + L.hhmm(V.lastEnd) + (V.over ? ' (dépasse ' + L.hhmm(V.endMin) + ')' : '') + '</span><span class="mlist">'
        + V.sched.slice(0, 9).map(r => '<span class="mrow ' + (V.conf[r.p.id] ? 'flag' : '') + '" title="' + esc((V.conf[r.p.id] || []).join(' · ')) + '"><span class="mt">' + L.hhmm(r.start) + '</span><span class="ndot ' + r.p.nature + '"></span><span class="mtitle">' + esc(r.p.titre || 'Sans titre') + '</span><span class="mic">'
          + (r.p.presentateurs.length ? '<span class="mpres" title="' + esc('Présenté par ' + r.p.presentateurs.map(pid => personOf(m, pid).name).join(', ')) + '">' + ic('mic', 's') + esc(L.cut(r.p.presentateurs.map(pid => L.shortName(personOf(m, pid).name)).join(', '), 24)) + '</span>' : '')
          + (r.p.projets.length ? '<span>' + ic('project', 's') + r.p.projets.length + '</span>' : '') + (r.p.invites.length ? '<span>' + ic('people', 's') + r.p.invites.length + '</span>' : '') + (hasLink(r.p.lienType, r.p.lien) ? '<span>' + ic('clip', 's') + '</span>' : '') + '</span></span>').join('')
        + (V.sched.length > 9 ? '<span class="mrow muted">+ ' + (V.sched.length - 9) + ' autres points</span>' : '') + (V.sched.length ? '' : '<span class="mrow muted">Aucun point</span>') + '</span></button>';
    }
    if (V.active.some(x => x.key === 'invites')) {
      h += '<button type="button" class="tile s2" ' + da('step', { v: 'invites' }) + '><span class="th2">' + ic('people') + 'Invités<span class="tag-soft">' + s.guests.length + '</span><span class="sp"></span>' + sdot('invites') + '</span><span class="glist">'
        + V.guestOrder.map(g => '<span class="gli">' + (g.origine === 'point' ? ic('star', 's', 'star') : '') + '<span class="gname">' + esc(personOf(m, g.personneId).name) + '</span><span class="gst">'
          + (g.reponse === 'viendra' ? ic('check', 's', 'ok') : (g.reponse === 'excuse' ? ic('x', 's', 'no') : ic('ask', 's', 'ask'))) + '</span></span>').join('') + '</span></button>';
    }
    // fil de jalons
    const thr = (key, num, title, value, valueCls, sub, extra) => {
      const done = V.valid(key);
      return Object.assign({ key, num, title, value, valueCls: valueCls || '', sub: sub || '', cls: done ? 'done' : (key === V.firstOpen ? 'cur' : 'todo'), done, warn: false }, extra || {});
    };
    const all = V.active.map((x, i) => {
      const num = i + 1;
      if (x.key === 'odj') return thr('odj', num, 'Ordre du jour', plural(s.points.length, 'point', 'points') + ' · ' + spanTxt, '', nConf ? plural(nConf, 'conflit de disponibilité', 'conflits de disponibilité') : 'Aucun conflit', { warn: nConf > 0 || V.over });
      if (x.key === 'invites') return thr('invites', num, 'Invités', plural(s.guests.length, 'invité', 'invités'), '', plural(nSpecial, 'spécifique', 'spécifiques') + (nNo ? ' · ' + plural(nNo, 'excusé', 'excusés') : ''));
      if (x.key === 'invitation') return thr('invitation', num, "Mail d'invitation", s.mailInvitationLe ? L.fmtDate(s.mailInvitationLe) : 'À envoyer', s.mailInvitationLe ? '' : 'dim', nWritten + '/' + s.guests.length + ' écrites · ' + horOk + '/' + horTot + ' horaires', { pct: writtenPct });
      if (x.key === 'cr') return thr('cr', num, 'Compte rendu', s.v0 ? 'V0 rédigée' : 'V0 à rédiger', s.v0 ? '' : 'dim', s.crPdf.length ? 'PDF exporté' : 'PDF à exporter', { tags: cfg.relecteurs.map(pid => { const r = s.relectures[pid]; return { name: L.shortName(personOf(m, pid).name), cls: r ? (r.statut === 'valide' ? 'ok' : 'blue') : 'todo' }; }) });
      if (x.key === 'crmail') return thr('crmail', num, 'Envoi du CR', s.mailCrLe ? L.fmtDate(s.mailCrLe) : 'À envoyer', s.mailCrLe ? '' : 'dim', plural(s.guests.length, 'destinataire', 'destinataires'));
      return thr('notifs', num, 'Notifications', projIds.length ? toSend.length + ' à mettre à dispo' : 'Aucun projet', projIds.length ? '' : 'dim', nWait + ' en attente · ' + plural(nSigned, 'signée', 'signées'), projIds.length ? { pct: Math.round(100 * nSigned / projIds.length) + '%' } : {});
    });
    const items = vue === 'C' ? all : all.filter(x => x.key !== 'odj' && x.key !== 'invites');
    if (items.length) {
      h += '<div class="thread" role="list" aria-label="Progression de la séance">' + items.map(mi => '<button type="button" role="listitem" class="ms ' + mi.cls + '" ' + da('step', { v: mi.key }) + '><span class="msn">' + (mi.done ? ic('check', 'xs') : mi.num) + '</span><span class="msb"><span class="msl">' + esc(mi.title) + (mi.warn ? '<span class="wdot"></span>' : '') + '</span><span class="msv ' + mi.valueCls + '">' + esc(mi.value) + '</span><span class="mss">' + esc(mi.sub) + '</span>'
        + (mi.pct ? '<span class="bar"><i style="width:' + mi.pct + '"></i></span>' : '') + (mi.tags && mi.tags.length ? '<span class="cols2">' + mi.tags.map(t => '<span class="tag plain ' + t.cls + '">' + esc(t.name) + '</span>').join('') + '</span>' : '') + '</span></button>').join('') + '</div>';
    }
    return h + '</div>';
  }

  // ---------------------------------------------------------------------------------------------
  // Rendu — panneau d'une étape
  // ---------------------------------------------------------------------------------------------
  const filterInput = (ph) => '<div class="mform"><input type="search" class="inp" placeholder="' + esc(ph) + '" aria-label="' + esc(ph) + '" data-filter data-autofocus></div>';
  // Texte cherché : sans accents ni ponctuation, en minuscules (voir onInput : tous les mots tapés doivent s'y trouver, dans n'importe quel ordre).
  const ftAttr = t => ' data-ft="' + esc(L.normName(t)) + '"';

  function linkMenu(V, key, target, id, type, link) {
    const file = type === 'gfs' ? V.m.gfsByIdent[link] : null;
    const has = type === 'gfs' ? !!file : !!link;
    const isGfs = type === 'gfs';
    let h = '<div class="menu" style="min-width:320px"><div class="mform"><div class="seg" role="group" aria-label="Type de lien"><button type="button" class="' + (isGfs ? '' : 'on') + '" ' + da(target + '-link-type', { id, v: 'externe' }) + '>' + ic('ext', 's') + 'Lien externe</button>'
      + '<button type="button" class="' + (isGfs ? 'on' : '') + '" ' + da(target + '-link-type', { id, v: 'gfs' }) + '>' + ic('file', 's') + 'PDF GFS</button></div>';
    if (isGfs) h += '<input type="search" class="inp" placeholder="Rechercher un PDF…" aria-label="Rechercher un fichier GFS" data-filter data-autofocus>';
    else h += '<input type="url" class="inp" placeholder="https://…" aria-label="Adresse du document" value="' + esc(type === 'externe' ? link : '') + '" data-chg="' + target + '-url" data-id="' + esc(id) + '">';
    h += '</div>';
    if (isGfs) {
      h += V.m.gfs.map(f => '<button type="button" class="mi ' + (f.ident === link ? 'on' : '') + '" ' + da(target + '-link-file', { id, v: f.ident }) + ftAttr(f.nom) + '><span>' + esc(f.nom) + '</span></button>').join('');
      if (!V.m.gfs.length) h += '<div class="mh">— Aucun fichier —</div>';
    }
    if (has) h += '<div class="mi-sep"></div><button type="button" class="mi" ' + da(target + '-link-open', { id }) + '><span>' + (isGfs ? 'Lire dans GFS' : 'Ouvrir dans un nouvel onglet') + '</span></button><button type="button" class="mi" ' + da(target + '-link-clear', { id }) + '><span>Retirer le lien</span></button>';
    return h + '</div>';
  }
  const linkLabel = (V, type, link) => type === 'gfs' ? (V.m.gfsByIdent[link] ? V.m.gfsByIdent[link].nom : '') : ((link || '').replace(/^https?:\/\//, '').split('/')[0]);

  // Étiquette de personne : le nom court quand la place le permet, les initiales quand la ligne est étroite (voir css/instances.css,
  // @container pts) — le nom complet reste toujours dans l'infobulle.
  // Classe de couleur d'une personne selon son grade (VP, directeur.trice d'établissement) : 'gvp' | 'gdir' | ''.
  const gradeClass = person => (person.gradeKind ? 'g' + person.gradeKind : '');
  const gradeLabel = person => (person.gradeKind === 'vp' ? 'VP' : (person.gradeKind === 'dir' ? 'Directeur.trice d\'établissement' : ''));
  const personTag = (m, pid, cls, titlePrefix, removeLabel, act, attrs) => {
    const person = personOf(m, pid), name = person.name;
    return '<span class="tag ' + cls + '" title="' + esc(titlePrefix + name + (person.gradeKind ? ' — ' + gradeLabel(person) : '')) + '"><span class="nm">' + esc(L.shortName(name)) + '</span><span class="ini" aria-hidden="true">' + esc(L.initials(name)) + '</span>'
      + '<button type="button" aria-label="' + esc(removeLabel) + '" ' + da(act, attrs) + '>' + ic('x', 'xs') + '</button></span>';
  };

  // Une ligne de l'ordre du jour. `i` = rang dans l'ordre de passage ; `typeView` : la liste est triée par type (ordre de passage
  // non modifiable ici), les contrôles de déplacement sont donc verrouillés.
  // Sous-point (`row.sub`) : même ligne, mêmes propriétés ; `par` = ligne du point parent, `n` = nombre de lignes sœurs.
  function pointRowHtml(V, row, i, typeView, n, par) {
    const { s, m } = V;
    const p = row.p, msgs = V.conf[p.id] || [], isSub = !!row.sub, locked = typeView && !isSub;
    const kind = isSub ? 'sous-point' : 'point';
    const guestChips = p.invites.map(gid => s.guests.find(x => x.id === gid)).filter(Boolean);
    const projOpen = isOpen('proj:' + p.id), invOpen = isOpen('inv:' + p.id), presOpen = isOpen('pres:' + p.id), lkOpen = isOpen('lien:' + p.id);
    const lkHas = p.lienType === 'gfs' ? !!m.gfsByIdent[p.lien] : !!p.lien;
    const tone = 't-' + p.nature + (isSub ? ' sub' : ''); // couleur de mise en valeur : validation et discussion ; information = couleur par défaut
    const lockTip = 'Passez en vue Timing pour changer l\'ordre de passage';
    const subCount = isSub ? 0 : (row.subRows || []).length, subsOpen = !isSub && !!S.ui.subs[p.id];
    const foldTip = subCount ? (subsOpen ? 'Replier' : 'Déplier') + ' les sous-points (' + subCount + ')' + (row.subOver ? ' — ils durent ' + L.durTxt(row.subOver) + ' de plus que le point' : '') : 'Ajouter des sous-points à ce point';
    const fold = isSub ? '' : '<button type="button" class="subtog ' + (subsOpen ? 'on ' : '') + (row.subOver ? 'over' : '') + '" title="' + esc(foldTip) + '" aria-label="' + esc(foldTip) + '" aria-expanded="' + (subsOpen ? 'true' : 'false') + '" ' + da('sub-toggle', { id: p.id }) + '>' + ic('chevron', 'xs') + (subCount ? '<span class="subn">' + subCount + '</span>' : '') + '</button>';
    return '<div class="pt pc ' + tone + (msgs.length ? ' flag' : '') + '" data-pt="' + p.id + '"' + (isSub ? ' data-sub="' + par.p.id + '"' : '') + '><div class="grip">'
      + (locked ? '<span class="gripbtn locked" title="' + lockTip + '">' + ic('dots', '', 'dots') + '</span>'
        : (isSub ? '<span class="gripbtn nodrag" aria-hidden="true"></span>' : '<span class="gripbtn" draggable="true" data-drag="' + p.id + '" title="Glisser pour changer l\'ordre">' + ic('dots', '', 'dots') + '</span>'))
      + '<span style="display:inline-flex;flex-direction:column"><button type="button" class="ibtn" style="height:14px;width:20px" aria-label="Monter le ' + kind + '" ' + (locked ? 'title="' + lockTip + '" disabled ' : (i === 0 ? 'disabled ' : '')) + da('pt-up', { id: p.id }) + '>' + ic('up', 'xs') + '</button>'
      + '<button type="button" class="ibtn" style="height:14px;width:20px" aria-label="Descendre le ' + kind + '" ' + (locked ? 'title="' + lockTip + '" disabled ' : (i === n - 1 ? 'disabled ' : '')) + da('pt-down', { id: p.id }) + '>' + ic('chevron', 'xs') + '</button></span></div>'
      + '<div class="ptime' + (isSub && row.end === row.start ? ' pend' : '') + '">' + L.hhmm(row.start) + (isSub && row.end === row.start ? '' : '–' + L.hhmm(row.end)) + (msgs.length ? '<span style="color:var(--warn);display:inline-flex" title="' + esc(msgs.join(' · ')) + '">' + ic('warn', 's') + '</span>' : '') + '</div>'
      // titre : toujours en entier (la zone grandit avec le texte, voir autosizeTitles)
      + '<div class="ttl">' + (isSub ? '<span class="subln" aria-hidden="true"></span>' : '')
      + '<textarea rows="1" class="inp ptitle" placeholder="Titre du ' + kind + '" aria-label="Titre du ' + kind + '" data-chg="pt-titre" data-id="' + p.id + '">' + esc(p.titre) + '</textarea>' + fold + '</div>'
      + '<div class="seg-i" role="group" aria-label="Nature du ' + kind + '">' + ['validation', 'discussion', 'information'].map(n => '<button type="button" class="' + (p.nature === n ? 'on ' + n : '') + '" title="' + C.nature[n] + '" aria-label="' + C.nature[n] + '" ' + da('pt-nat', { id: p.id, v: n }) + '>' + ic(n) + '</button>').join('') + '</div>'
      + '<label class="pdur"' + (row.subAll ? ' title="Total des sous-points : le point prend leur somme (la durée saisie revient si l\'un d\'eux est vidé)"' : '') + '><input type="number" min="' + (isSub ? 0 : 5) + '" step="5" class="inp' + (row.subAll ? ' derived' : '') + '" aria-label="Durée en minutes" ' + (isSub ? 'placeholder="–" value="' + (p.duree || '') : 'value="' + (row.subAll ? row.end - row.start : p.duree)) + '"' + (row.subAll ? ' disabled' : '') + ' data-chg="pt-duree" data-id="' + p.id + '">min</label>'
      // projets
      + '<div class="pgroups"><div class="group g-proj"><span class="gic" title="Projets">' + ic('project', 's') + '</span>'
      + p.projets.map(pid => '<span class="tag proj" title="' + esc(projectOf(m, pid).titre) + '">' + esc(projectOf(m, pid).acro) + '<button type="button" aria-label="Retirer le projet" ' + da('pt-proj', { id: p.id, v: pid }) + '>' + ic('x', 'xs') + '</button></span>').join('')
      + '<div class="rel"><button type="button" class="addb ' + (projOpen ? 'on' : '') + '" title="Relier un projet" aria-label="Relier un projet" ' + da('menu', { v: 'proj:' + p.id }) + '>' + ic('plus', 'xs') + '</button>'
      + (projOpen ? '<div class="menu">' + filterInput('Rechercher un projet…') + m.projects.map(pr => '<button type="button" class="mi ' + (p.projets.indexOf(pr.id) >= 0 ? 'on' : '') + '" ' + da('pt-proj', { id: p.id, v: pr.id }) + ftAttr(pr.acro + ' ' + pr.titre) + '><span class="mi-main"><span>' + esc(pr.acro) + '</span><span class="mi-sub">' + esc(L.cut(pr.titre, 40)) + '</span></span></button>').join('') + (m.projects.length ? '' : '<div class="mh">— Aucun projet —</div>') + '</div>' : '') + '</div></div>'
      // présenté par (une ou plusieurs personnes)
      + '<div class="group g-pres"><span class="gic" title="Présenté par">' + ic('mic', 's') + '</span>'
      + p.presentateurs.map(pid => personTag(m, pid, 'pres', 'Présenté par ', 'Retirer le présentateur', 'pt-pres', { id: p.id, v: pid })).join('')
      + '<div class="rel"><button type="button" class="addb ' + (presOpen ? 'on' : '') + '" title="Indiquer qui présente ce point" aria-label="Indiquer qui présente ce point" ' + da('menu', { v: 'pres:' + p.id }) + '>' + ic('plus', 'xs') + '</button>'
      + (presOpen ? '<div class="menu" style="min-width:300px">' + filterInput('Rechercher une personne…') + m.people.map(pp => '<button type="button" class="mi ' + (p.presentateurs.indexOf(pp.id) >= 0 ? 'on' : '') + '" ' + da('pt-pres', { id: p.id, v: pp.id }) + ftAttr(pp.search) + '><span class="mi-main"><span>' + esc(pp.name) + '</span><span class="mi-sub">' + esc(L.cut(pp.poste, 44)) + '</span></span><span class="mi-sub">' + (p.presentateurs.indexOf(pp.id) >= 0 ? 'présente' : '') + '</span></button>').join('') + (m.people.length ? '' : '<div class="mh">— Aucune personne —</div>') + '</div>' : '') + '</div></div>'
      // invités
      + '<div class="group g-inv"><span class="gic" title="Invités">' + ic('people', 's') + '</span>'
      + guestChips.map(g => personTag(m, g.personneId, gradeClass(personOf(m, g.personneId)), '', 'Retirer l\'invité du point', 'pt-inv', { id: p.id, v: g.personneId })).join('')
      + '<div class="rel"><button type="button" class="addb ' + (invOpen ? 'on' : '') + '" title="Inviter sur ce point" aria-label="Inviter sur ce point" ' + da('menu', { v: 'inv:' + p.id }) + '>' + ic('plus', 'xs') + '</button>'
      + (invOpen ? '<div class="menu" style="min-width:300px">' + filterInput('Rechercher une personne…') + m.people.map(pp => {
        const g = s.guests.find(x => x.personneId === pp.id), on = g && p.invites.indexOf(g.id) >= 0;
        return '<button type="button" class="mi ' + (on ? 'on' : '') + '" ' + da('pt-inv', { id: p.id, v: pp.id }) + ftAttr(pp.search) + '><span class="mi-main"><span>' + esc(pp.name) + '</span><span class="mi-sub">' + esc(L.cut(pp.poste, 44)) + '</span></span><span class="mi-sub">' + (on ? 'invité sur ce point' : (g ? 'déjà dans la liste' : 'ajout à la liste')) + '</span></button>';
      }).join('') + '</div>' : '') + '</div></div>'
      // dossier
      + '<div class="group g-doc"><div class="rel"><button type="button" class="addb ' + (lkHas ? 'on' : '') + '" title="' + esc(lkHas ? 'Dossier du point : ' + linkLabel(V, p.lienType, p.lien) : 'Dossier du point') + '" aria-label="' + esc(lkHas ? 'Dossier du point : ' + linkLabel(V, p.lienType, p.lien) : 'Dossier du point') + '" ' + da('menu', { v: 'lien:' + p.id }) + '>' + ic('clip', 's') + '</button>'
      + (lkOpen ? linkMenu(V, 'lien:' + p.id, 'pt', p.id, p.lienType, p.lien) : '') + '</div></div></div>'
      + '<button type="button" class="ibtn ptrash" aria-label="Supprimer le ' + kind + '" title="Supprimer le ' + kind + (subCount ? ' et ses ' + subCount + ' sous-point' + (subCount > 1 ? 's' : '') : '') + '" ' + da('pt-del', { id: p.id }) + '>' + ic('trash') + '</button></div>';
  }

  // Rappel sous les sous-points : leur durée se découpe dans celle du point tant que l'un d'eux reste vide ; tous renseignés, le point prend le total.
  function subInfoText(row) {
    const subs = row.subRows || [], dur = Number(row.p.duree) || 0, empty = subs.filter(r => !(Number(r.p.duree) > 0)).length;
    if (!subs.length) return 'Durée du point : ' + L.durTxt(dur) + '. Dès que tous les sous-points ont une durée, le point prend leur total.';
    if (row.subAll) return 'Le point prend le total des sous-points : ' + L.durTxt(row.subTotal) + '.';
    return L.durTxt(row.subTotal) + ' de sous-points sur ' + L.durTxt(dur) + ' du point · ' + empty + ' sans durée'
      + (row.subOver ? ' — dépasse de ' + L.durTxt(row.subOver) : '');
  }
  // Un point et, dessous, ses sous-points (repliés par défaut) : même ligne, mêmes propriétés. Sous le dernier sous-point, une ligne
  // pleine largeur pour en ajouter et rappeler le découpage de la durée du parent ; elle sert aussi à confirmer la suppression d'un
  // point qui porte des sous-points (ils partent avec lui).
  function pointBlockHtml(V, row, i, typeView) {
    let h = pointRowHtml(V, row, i, typeView, V.sched.length);
    const id = row.p.id, subs = row.subRows || [];
    if (isOpen('ptdel:' + id)) {
      h += '<div class="subbar del"><span class="subinfo">Supprimer ce point et ses ' + subs.length + ' sous-point' + (subs.length > 1 ? 's' : '') + ' ?</span>'
        + '<button type="button" class="pillbtn ghost" ' + da('menu-close') + '>Annuler</button><button type="button" class="pillbtn danger" ' + da('pt-del-ok', { id }) + '>Supprimer</button></div>';
    }
    if (!S.ui.subs[id]) return h;
    subs.forEach((sr, k) => { h += pointRowHtml(V, sr, k, typeView, subs.length, row); });
    h += '<div class="subbar"><button type="button" class="addb" ' + da('sub-add', { id }) + '>' + ic('plus', 'xs') + 'Sous-point</button>'
      + '<span class="subinfo ' + (row.subOver ? 'over' : '') + '">' + subInfoText(row) + '</span></div>';
    return h;
  }

  // Vue de l'ordre du jour : « timing » (par défaut : ordre de passage) ou « type » (tous les points,
  // groupés pour validation, puis discussion, puis information). Choix retenu par utilisateur (Preferences_Widget.Inst_odj_vue).
  const NATURE_GROUP_LABEL = { validation: 'Pour validation', discussion: 'Pour discussion', information: 'Pour information' };
  function odjHtml(V) {
    const { s } = V;
    const typeView = S.prefs.odjVue === 'type';
    let h = '<div class="toolbar"><span class="total ' + (V.over ? 'over' : '') + '">' + plural(s.points.length, 'point', 'points') + ' · ' + L.durTxt(V.lastEnd - V.startMin) + ' · fin ' + L.hhmm(V.lastEnd)
      + '</span><div class="seg" role="group" aria-label="Affichage de l\'ordre du jour">'
      + '<button type="button" class="' + (typeView ? '' : 'on') + '" title="Dans l\'ordre de passage" ' + da('odj-vue', { v: 'timing' }) + '>' + ic('clock', 's') + 'Timing</button>'
      + '<button type="button" class="' + (typeView ? 'on' : '') + '" title="Tous les points, d\'abord pour validation, puis discussion, puis information" ' + da('odj-vue', { v: 'type' }) + '>' + ic('list', 's') + 'Par type</button></div>'
      + '<span class="sp"></span><button type="button" class="rbtn primary" title="Ajouter un point" aria-label="Ajouter un point" ' + da('pt-add') + '>' + ic('plus') + '</button></div>';
    if (!s.points.length) h += '<div class="empty">Aucun point</div>';
    h += '<div class="pts">';
    if (typeView) {
      L.groupByNature(V.sched).forEach(g => {
        h += '<div class="grph t-' + g.nature + '"><span class="ndot ' + g.nature + '"></span>' + NATURE_GROUP_LABEL[g.nature] + '<span class="tag-soft">' + g.rows.length + '</span></div>';
        g.rows.forEach(row => { h += pointBlockHtml(V, row, V.sched.indexOf(row), true); });
      });
    } else {
      V.sched.forEach((row, i) => { h += pointBlockHtml(V, row, i, false); });
      if (V.sched.length > 1) h += '<div class="dropend" aria-hidden="true"></div>'; // zone de dépôt « tout en bas » (visible pendant un glissement)
    }
    return h + '</div>';
  }

  // En-tête triable : un clic trie (croissant, décroissant, puis ordre d'origine) ; le choix est retenu par utilisateur.
  function sortHead(key, label, ascTip, descTip) {
    const m = L.GUEST_TRI.exec(S.prefs.invTri || ''), on = !!m && m[1] === key, dir = on ? m[2] : '';
    const tip = 'Trier : ' + (on && dir === 'asc' ? descTip : (on ? 'ordre d\'origine' : ascTip));
    return '<button type="button" class="hsort ' + (on ? 'on' : '') + '" title="' + esc(tip) + '" aria-label="' + esc(label + ' — ' + tip) + '" ' + da('g-sort', { v: key }) + '>' + esc(label) + (on ? ic(dir === 'asc' ? 'up' : 'chevron', 'xs') : '') + '</button>';
  }

  function invitesHtml(V) {
    const { s, m } = V;
    const nSpecial = s.guests.filter(g => g.origine === 'point').length, nNo = s.guests.filter(g => g.reponse === 'excuse').length;
    const addable = m.people.filter(pp => !s.guests.some(g => g.personneId === pp.id));
    const endTxt = L.hhmm(V.endMin);
    let h = '<div class="toolbar"><span class="total">' + plural(s.guests.length, 'invité', 'invités') + ' · ' + plural(nSpecial, 'spécifique', 'spécifiques') + (nNo ? ' · ' + plural(nNo, 'excusé', 'excusés') : '') + '</span><span class="sp"></span>'
      + '<div class="rel"><button type="button" class="rbtn primary" title="Ajouter une personne" aria-label="Ajouter une personne" ' + da('menu', { v: 'addGuest' }) + '>' + ic('peopleAdd') + '</button>'
      + (isOpen('addGuest') ? '<div class="menu right" style="min-width:320px">' + filterInput('Rechercher une personne…') + addable.map(pp => '<button type="button" class="mi" ' + da('g-add', { v: pp.id }) + ftAttr(pp.search) + '><span class="mi-main"><span>' + esc(pp.name) + '</span><span class="mi-sub">' + esc(L.cut(pp.poste, 44)) + '</span></span></button>').join('') + (addable.length ? '' : '<div class="mh">— Tout l\'annuaire est invité —</div>') + '</div>' : '') + '</div></div>';
    // Membres de la composition de l'instance qui ne sont pas (encore) invités à cette séance : un bouton les ajoute.
    const compoMissing = V.cfg.composition.filter(pid => m.peopleById[pid] && !s.guests.some(g => g.personneId === pid));
    if (compoMissing.length) {
      h += '<div class="compo" role="status"><span class="gic">' + ic('people', 's') + '</span><span>' + plural(compoMissing.length, 'membre de la composition', 'membres de la composition') + ' ' + (compoMissing.length > 1 ? 'ne sont pas invités' : 'n\'est pas invité') + ' à cette séance : '
        + esc(compoMissing.slice(0, 6).map(pid => L.shortName(personOf(m, pid).name)).join(', ') + (compoMissing.length > 6 ? '…' : '')) + '</span><span class="sp"></span>'
        + '<button type="button" class="pillbtn" title="Ajouter ces personnes comme invités de la liste permanente" ' + da('g-compo-add') + '>' + ic('peopleAdd', 's') + 'Ajouter (' + compoMissing.length + ')</button></div>';
    }
    h += '<div class="gwrap"><div class="grow head"><div>' + sortHead('nom', 'Personne', 'A → Z', 'Z → A') + '</div><div>Sujets</div><div title="Invitation écrite">' + ic('mail', 's') + '</div><div title="Horaire de passage envoyé">' + ic('clock', 's') + '</div><div>' + sortHead('reponse', 'Réponse', 'viendra d\'abord', 'excusés d\'abord') + '</div>'
      + '<div>Créneau de présence<span class="help" tabindex="0">' + ic('ask', 's') + '<span class="bubble">Heure d\'arrivée et de départ. Vide : disponible toute la séance. Les boutons ronds posent en un clic le début ou la fin de l\'instance. Un point relié à la personne passe en orange s\'il sort du créneau.</span></span></div><div>Commentaire</div><div>' + sortHead('appel', 'Appel du jour', 'présents d\'abord', 'absents d\'abord') + '</div><div></div></div>';
    V.guestOrder.forEach(g => {
      const person = personOf(m, g.personneId);
      const sujets = V.schedAll.filter(row => row.p.invites.indexOf(g.id) >= 0).map(row => {
        const clash = L.guestClash(g, row.start, row.end, person.name);
        return { time: L.hhmm(row.start), label: L.cut(row.p.titre, 30), title: row.p.titre + (clash ? ' — ' + clash : ''), warn: !!clash };
      });
      const fs0 = V.firstStart(g), hs = L.horaireState(g, fs0);
      const horTip = hs === 'none' ? 'Aucun point : pas d\'horaire de passage' : (hs === 'stale' ? 'Horaire modifié depuis l\'envoi : ' + g.passageHeure + ' devient ' + fs0 + ' (cliquer pour marquer le nouvel horaire envoyé)' : (hs === 'sent' ? 'Horaire ' + g.passageHeure + ' envoyé le ' + L.fmtDate(g.passageLe) + ' (cliquer pour effacer)' : 'Horaire de passage ' + fs0 + ' pas encore envoyé (cliquer pour marquer envoyé)'));
      const ecritTip = g.ecritLe ? 'Écrit le ' + L.fmtDate(g.ecritLe) + ' (cliquer pour effacer)' : 'Pas encore écrit (cliquer pour marquer écrit aujourd\'hui)';
      const tp = (field, scope, value) => {
        const key = 't:' + g.id + ':' + scope;
        return '<div class="rel"><button type="button" class="tp ' + (value ? '' : 'empty') + '" ' + da('menu', { v: key }) + ' aria-label="' + field + '">' + (value || '--:--') + '</button>' + (isOpen(key) ? timeMenu(key, value, 'g-' + scope, g.id, V.startMin, V.endMin, true) : '') + '</div>';
      };
      // Une ligne d'invité tient TOUJOURS sur une seule ligne : nom et poste côte à côte (le poste se tronque, texte complet au survol), sujets en rang.
      h += '<div class="grow ' + (sujets.some(x => x.warn) ? 'flag ' : '') + gradeClass(person) + '"><div class="pcell" title="' + esc(person.name + (person.poste ? ' — ' + person.poste : '') + (person.gradeKind ? ' (' + gradeLabel(person) + ')' : '')) + '"><div class="pname">' + (g.origine === 'point' ? ic('star', 's') : '') + '<span class="pn">' + esc(person.name) + '</span>'
        + (person.gradeKind ? '<span class="gbadge ' + gradeClass(person) + '">' + (person.gradeKind === 'vp' ? 'VP' : 'Dir.') + '</span>' : '') + '</div><div class="psub">' + esc(person.poste) + '</div></div>'
        + '<div class="group sjrow" title="' + esc(sujets.map(sj => sj.time + ' · ' + sj.title).join('\n')) + '">' + sujets.map(sj => '<span class="tag plain sj ' + (sj.warn ? 'warn' : '') + '" title="' + esc(sj.title) + '">' + sj.time + ' · ' + esc(sj.label) + '</span>').join('') + '</div>'
        + '<div><button type="button" class="ib ' + (g.ecritLe ? 'on' : '') + '" title="' + esc(ecritTip) + '" aria-label="' + esc(ecritTip) + '" ' + da('g-ecrit', { id: g.id }) + '>' + ic('mail') + '</button></div>'
        + '<div><button type="button" class="ib ' + (hs === 'stale' ? 'warn' : (hs === 'sent' ? 'on' : '')) + '" title="' + esc(horTip) + '" aria-label="' + esc(horTip) + '" ' + (hs === 'none' ? 'disabled ' : '') + da('g-hor', { id: g.id }) + '>' + ic('clock') + '</button></div>'
        + '<div class="seg-i" role="group" aria-label="Réponse à l\'invitation">' + [['attente', 'ask', 'ask', 'À confirmer'], ['viendra', 'check', 'ok', 'Viendra'], ['excuse', 'no', 'no', 'Excusé(e)']].map(r => '<button type="button" class="' + (g.reponse === r[0] ? 'on ' + r[2] : '') + '" title="' + r[3] + '" aria-label="' + r[3] + '" ' + da('g-rep', { id: g.id, v: r[0] }) + '>' + ic(r[1], 's') + '</button>').join('') + '</div>'
        + '<div class="dispo"><button type="button" class="ib ' + (g.dispoDe === s.heure ? 'on' : '') + '" title="Dès le début de l\'instance" aria-label="Dès le début de l\'instance" ' + da('g-start', { id: g.id }) + '>' + ic('start', 's') + '</button>'
        + tp('Arrivée', 'de', g.dispoDe) + '<span class="muted">–</span>' + tp('Départ', 'a', g.dispoA)
        + '<button type="button" class="ib ' + (g.dispoA === endTxt ? 'on' : '') + '" title="Jusqu\'à la fin de l\'instance" aria-label="Jusqu\'à la fin de l\'instance" ' + da('g-end', { id: g.id }) + '>' + ic('end', 's') + '</button></div>'
        + '<div><input type="text" class="inp ghost" style="width:100%" placeholder="Commentaire" aria-label="Commentaire" value="' + esc(g.commentaire) + '" data-chg="g-comm" data-id="' + g.id + '"></div>'
        + '<div class="seg-i" role="group" aria-label="Appel du jour">' + [['present', 'check', 'ok', 'Présent(e)'], ['absent', 'x', 'no', 'Absent(e)']].map(r => '<button type="button" class="' + (g.appel === r[0] ? 'on ' + r[2] : '') + '" title="' + r[3] + '" aria-label="' + r[3] + '" ' + da('g-appel', { id: g.id, v: r[0] }) + '>' + ic(r[1], 's') + '</button>').join('') + '</div>'
        // Corbeille pour TOUS les invités (un invité repris par erreur de la liste permanente ou de la composition doit pouvoir être retiré de la
        // séance) ; la liste permanente de l'instance (paramétrage) n'est pas touchée.
        + '<div><button type="button" class="ibtn" aria-label="' + (g.origine === 'point' ? 'Retirer de la liste' : 'Retirer de cette séance') + '" title="' + (g.origine === 'point' ? 'Retirer de la liste' : 'Retirer de cette séance (la liste permanente de l\'instance n\'est pas modifiée)') + '" ' + da('g-del', { id: g.id }) + '>' + ic('trash', 's') + '</button></div></div>';
    });
    return h + '</div>';
  }

  function dateCard(V, kind) {
    const s = V.s, inv = kind === 'invitation';
    const date = inv ? s.mailInvitationLe : s.mailCrLe, model = inv ? V.cfg.modInvitation : V.cfg.modCr;
    let h = '<div class="card">' + ic(inv ? 'mail' : 'send') + '<span class="tag proj plain" title="Modèle Publipostage+ (GFS)">' + esc(model || '— Choisir —') + '</span><span class="sp"></span>'
      + '<input type="date" class="dp" aria-label="' + (inv ? "Date d'envoi du mail d'invitation" : "Date d'envoi du mail du compte rendu") + '" value="' + esc(date) + '" data-chg="' + (inv ? 'inv-date' : 'crm-date') + '">'
      + '<button type="button" class="rbtn" title="Envoyé aujourd\'hui" aria-label="Envoyé aujourd\'hui" ' + da(inv ? 'inv-today' : 'crm-today') + '>' + ic('calCheck') + '</button></div>';
    if (inv) {
      const nWritten = s.guests.filter(g => g.ecritLe).length;
      const horTot = s.guests.filter(g => !!V.firstStart(g)).length, horOk = s.guests.filter(g => { const f0 = V.firstStart(g); return !!f0 && !!g.passageLe && g.passageHeure === f0; }).length;
      h += '<div class="rowf"><span class="bar" title="Invités écrits"><i style="width:' + (s.guests.length ? Math.round(100 * nWritten / s.guests.length) : 0) + '%"></i></span><span class="meta">' + nWritten + '/' + s.guests.length + ' invités écrits</span><span class="meta">· ' + horOk + '/' + horTot + ' horaires de passage envoyés</span></div>';
    }
    return h;
  }

  // Relecture repliée : « V0 rédigée · 1/2 validé » et le téléchargement restent dans l'en-tête de l'étape.
  const crSummary = V => {
    const { s, cfg } = V;
    const valid = cfg.relecteurs.filter(pid => s.relectures[pid] && s.relectures[pid].statut === 'valide').length;
    return { v0: !!s.v0, valid, total: cfg.relecteurs.length };
  };
  function crFoldHtml(V) {
    const fold = S.prefs.cadre.cr, hasPdf = V.s.crPdf.length > 0;
    const tip = fold ? 'Déplier la relecture' : 'Replier la relecture';
    let h = '<button type="button" class="ibtn" title="' + tip + '" aria-label="' + tip + '" aria-expanded="' + (fold ? 'false' : 'true') + '" ' + da('fold', { v: 'cr' }) + '>' + ic(fold ? 'chevron' : 'up', 's') + '</button>';
    if (fold) {
      const c = crSummary(V);
      h += '<span class="tag-soft ' + (c.v0 ? 'ok' : '') + '" data-cr-summary>' + (c.v0 ? 'V0 rédigée' : 'V0 à rédiger') + (c.total ? ' · ' + c.valid + '/' + c.total + ' validé' : '') + '</span>'
        + '<button type="button" class="ibtn" ' + (hasPdf ? '' : 'disabled ') + 'title="' + (hasPdf ? 'Télécharger le PDF du compte rendu' : 'Pas encore de PDF exporté') + '" aria-label="Télécharger le CR" ' + da('cr-download') + '>' + ic('download', 's') + '</button>';
    }
    return h;
  }
  function crHtml(V) {
    const { s, cfg, m } = V;
    const hasPdf = s.crPdf.length > 0;
    if (S.prefs.cadre.cr) return '';
    let h = '<div class="card">'
      + '<button type="button" class="tchip ' + (s.v0 ? 'on' : '') + '" role="checkbox" aria-checked="' + (s.v0 ? 'true' : 'false') + '" ' + da('v0-toggle') + '>' + ic('tick') + 'V0 rédigée<small>' + (s.v0 ? esc(L.fmtShort(s.v0.le)) : '') + '</small></button>'
      + '<span class="gic" title="Relecteurs">' + ic('eye', 's') + '</span>';
    cfg.relecteurs.forEach(pid => {
      const r = s.relectures[pid], st = r ? r.statut : 'none', person = personOf(m, pid);
      h += '<div class="rvw ' + (st === 'none' ? '' : st) + '" title="' + esc(person.name) + '"><span>' + esc(L.shortName(person.name)) + '</span><span class="seg-i" role="group" aria-label="Relecture">'
        + '<button type="button" class="' + (st === 'none' ? 'on idle' : '') + '" title="À relire" aria-label="À relire" ' + da('rel-set', { id: pid, v: 'none' }) + '>' + ic('idle', 's') + '</button>'
        + '<button type="button" class="' + (st === 'modifs' ? 'on mod' : '') + '" title="Relu, demandes de modification" aria-label="Relu, demandes de modification" ' + da('rel-set', { id: pid, v: 'modifs' }) + '>' + ic('pencil', 's') + '</button>'
        + '<button type="button" class="' + (st === 'valide' ? 'on ok' : '') + '" title="Relu et validé" aria-label="Relu et validé" ' + da('rel-set', { id: pid, v: 'valide' }) + '>' + ic('check', 's') + '</button></span><small>' + (r ? esc(L.fmtShort(r.le)) : '') + '</small></div>';
    });
    if (!cfg.relecteurs.length) h += '<span class="muted">Aucun relecteur défini</span>';
    // Le PDF est exporté à la main depuis GFS (une fois le compte rendu bien relu) dans Suivi_Instance.CR_PDF.
    return h + '<span class="sp"></span><button type="button" class="pillbtn" ' + (hasPdf ? '' : 'disabled ') + 'title="' + esc(hasPdf ? 'Télécharger le PDF du compte rendu' : 'Pas encore de PDF : exportez le compte rendu depuis GFS dans la colonne ' + CR_PDF_COLUMN + ' de Suivi_Instance') + '" ' + da('cr-download') + '>' + ic('download', 's') + 'Télécharger le CR</button></div>';
  }

  function notifsHtml(V) {
    const { s, m } = V;
    const projIds = V.ctx.projectIds, vp = V.ctx.projectVp;
    const toSend = projIds.filter(id => vp[id].key === 'none');
    const nWait = projIds.filter(id => vp[id].key === 'wait').length, nSigned = projIds.filter(id => vp[id].key === 'signed').length;
    const incomplete = toSend.filter(id => L.notifNum(projectOf(m, id).notif) < 4).length;
    let h = '<div class="toolbar"><span class="total">' + plural(projIds.length, 'notification', 'notifications') + ' · ' + toSend.length + ' à mettre à dispo · ' + nWait + ' en attente · ' + plural(nSigned, 'signée', 'signées') + '</span><span class="sp"></span>'
      + '<div class="rel"><button type="button" class="pillbtn" ' + (toSend.length ? '' : 'disabled ') + da('vp-toggle') + '>' + ic('send', 's') + (toSend.length ? 'Mettre à disposition du VP (' + toSend.length + ')' : 'Tout est à disposition du VP') + '</button>';
    if (isOpen('vpconfirm')) {
      h += '<div class="menu right" style="min-width:340px"><div class="mform"><div class="flabel">Mettre à disposition ' + plural(toSend.length, 'notification', 'notifications') + ' du ' + esc(V.inst.nom) + ' n°' + esc(s.num) + ' ?</div><div class="psub">' + esc(toSend.map(id => projectOf(m, id).acro).join(', ')) + '</div>'
        + (incomplete ? '<div class="alert-pill" style="height:auto;padding:5px 9px;border-radius:10px;font-weight:700">' + incomplete + (incomplete > 1 ? ' ne sont pas encore au statut « complète ».' : ' n\'est pas encore au statut « complète ».') + '</div>' : '')
        + '<div class="rowf" style="justify-content:flex-end"><button type="button" class="pillbtn ghost" ' + da('vp-cancel') + '>Annuler</button><button type="button" class="pillbtn" ' + da('vp-confirm') + '>' + ic('check', 's') + 'Confirmer</button></div></div></div>';
    }
    h += '</div></div><div class="gwrap"><div class="nrow head"><div>Projet</div><div>Point(s)</div><div>Notification</div><div>Mise à disposition du VP</div></div>';
    projIds.forEach(id => {
      const pr = projectOf(m, id), n = L.notifNum(pr.notif), v = vp[id];
      h += '<div class="nrow"><div class="pname">' + esc(pr.acro) + '</div><div class="psub">' + esc(V.schedAll.filter(r => r.p.projets.indexOf(id) >= 0).map(r => L.hhmm(r.start) + ' ' + r.p.titre).join(' · ')) + '</div>'
        + '<div><span class="nst ' + (n >= 6 ? 'ok' : (n >= 3 ? 'cur' : 'todo')) + '">' + esc(L.stripOrdinal(pr.notif) || '—') + '</span></div><div><span class="nst ' + v.cls + '" title="' + esc(v.tip) + '">' + esc(v.label) + '</span></div></div>';
    });
    if (!projIds.length) h += '<div class="nrow"><div class="psub">Aucun projet relié</div></div>';
    return h + '</div>';
  }

  function panelHtml(V) {
    const stepKey = V.stepKey;
    const statusText = V.curDone ? (L.validatedInfo(stepKey, V.ctx, V.nameOf) || 'Validé') : (stepKey === V.firstOpen ? 'En cours' : 'À venir');
    const canValidate = V.missing.length === 0;
    let h = '<section class="panel" aria-live="polite"><div class="ph"><h2>' + (V.stepIdx + 1) + ' · ' + esc(V.curStep.label) + '</h2><span class="stt ' + (V.curDone ? 'ok' : (stepKey === V.firstOpen ? 'cur' : '')) + '">' + (V.curDone ? ic('check', 's') : '') + esc(statusText) + '</span>'
      + (stepKey === 'cr' ? crFoldHtml(V) : '') + '<span class="sp"></span>'
      + (V.alerts.length ? '<span class="alert-pill" title="' + esc(V.alerts.join(' · ')) + '">' + ic('warn', 's') + V.alerts.length + '</span>' : '')
      + (!V.curDone && !V.dateStep ? '<button type="button" class="rbtn primary" title="' + esc(canValidate ? "Valider l'étape" : 'À compléter : ' + V.missing.join(', ')) + '" aria-label="Valider l\'étape" ' + (canValidate ? '' : 'disabled ') + da('validate') + '>' + ic('check') + '</button>' : '')
      + (V.curDone ? '<button type="button" class="rbtn" title="' + (V.dateStep ? 'Effacer la date' : "Rouvrir l'étape") + '" aria-label="' + (V.dateStep ? 'Effacer la date' : "Rouvrir l'étape") + '" ' + da('reopen') + '>' + ic('reopen') + '</button>' : '') + '</div>';
    if (stepKey === 'odj') h += odjHtml(V);
    else if (stepKey === 'invites') h += invitesHtml(V);
    else if (stepKey === 'invitation') h += dateCard(V, 'invitation');
    else if (stepKey === 'cr') h += crHtml(V);
    else if (stepKey === 'crmail') h += dateCard(V, 'crmail');
    else h += notifsHtml(V);
    return h + '</section>';
  }

  // ---------------------------------------------------------------------------------------------
  // Rendu — paramétrage de l'instance (fenêtre)
  // ---------------------------------------------------------------------------------------------
  // Composition de l'instance (table « Composition instances ») : lecture seule, avec ce que la page a reconnu — pour vérifier d'un coup d'œil.
  function compositionSettingsHtml(V) {
    const { m, cfg } = V, c = m.composition;
    let h = '<div class="fgrp"><div class="flabel">Composition de l\'instance</div>';
    if (!c.tableId) h += '<div class="psub">Table « Composition instances » introuvable dans le document : les invités par défaut ne viennent que de la liste permanente ci-dessus.</div>';
    else if (!c.ok) h += '<div class="psub">Table « ' + esc(c.tableId) + ' » lue, mais ' + esc((c.reason || 'colonnes non reconnues.').replace(/\.$/, '')) + ' (colonnes : ' + esc(c.columns.join(', ') || '—') + ').</div>';
    else {
      h += '<div class="group">' + (cfg.composition.length ? cfg.composition.map(id => '<span class="tag plain" title="' + esc(personOf(m, id).name) + '">' + esc(L.shortName(personOf(m, id).name)) + '</span>').join('') : '<span class="muted">Aucune personne pour cette instance.</span>') + '</div>'
        + '<div class="psub">Table « ' + esc(c.tableId) + ' » : colonne instance « ' + esc(c.instanceCol) + ' »' + (c.instanceType ? ' (' + esc(c.instanceType) + ')' : '') + ', colonne personne « ' + esc(c.personCol) + ' »' + (c.personType ? ' (' + esc(c.personType) + ')' : '') + ' · ' + plural(c.resolved, 'ligne reconnue', 'lignes reconnues') + (c.unresolved ? ', ' + plural(c.unresolved, 'ligne ignorée', 'lignes ignorées') : '')
        + '. Ces personnes sont invitées d\'office à chaque nouvelle séance.</div>'
        + '<div class="psub">Personnes par instance : ' + esc(c.perInstance.map(x => x.nom + ' ' + x.n).join(' · ') || 'aucune') + '.</div>';
    }
    return h + '</div>';
  }
  function settingsHtml(V) {
    const { m, inst, cfg } = V;
    const modalMenu = MODAL_MENUS.indexOf(S.ui.menu) >= 0;
    const tag = (name, act, id) => '<span class="tag">' + esc(name) + '<button type="button" aria-label="Retirer" ' + da(act, { v: id }) + '>' + ic('x', 'xs') + '</button></span>';
    const pick = (list, act) => list.map(pp => '<button type="button" class="mi" ' + da(act, { v: pp.id }) + ftAttr(pp.search) + '><span class="mi-main"><span>' + esc(pp.name) + '</span><span class="mi-sub">' + esc(L.cut(pp.poste, 44)) + '</span></span></button>').join('');
    const lbl = (text0, ...cols) => '<div class="flabel">' + text0 + cols.map(c => helpToken('Instances', c)).join('') + '</div>';
    let h = '<div class="modal"><div class="dlg" role="dialog" aria-modal="true" aria-label="Paramétrage de l\'instance"><div class="dlg-h"><h3>Paramétrage · ' + esc(inst.nom) + '</h3><button type="button" class="rbtn ghost" aria-label="Fermer" title="Fermer" ' + da('settings-close') + '>' + ic('x') + '</button></div>'
      + (modalMenu ? '<div class="bd-in" ' + da('menu-close') + '></div>' : '') + '<div class="dlg-b">';
    h += '<div class="fgrp">' + lbl('Horaires habituels', 'Heure_debut', 'Duree_min') + '<div class="rowf"><div class="rel"><button type="button" class="tp" title="Heure de début habituelle" aria-label="Heure de début habituelle" ' + da('menu', { v: 'cfgtime' }) + '>' + ic('clock', 's') + esc(cfg.heureDebut) + '</button>'
      + (isOpen('cfgtime') ? timeMenu('cfgtime', cfg.heureDebut, 'cfg', '', 6 * 60, 20 * 60, false) : '') + '</div>'
      + '<div class="rel"><button type="button" class="tp" title="Durée de l\'instance" aria-label="Durée de l\'instance" ' + da('menu', { v: 'dur' }) + '>' + ic('hourglass', 's') + L.durTxt(cfg.duree) + '</button>'
      + (isOpen('dur') ? '<div class="menu">' + [60, 90, 120, 150, 180, 210, 240, 300, 360, 480].map(n => '<button type="button" class="mi ' + (cfg.duree === n ? 'on' : '') + '" ' + da('cfg-dur', { v: n }) + '><span>' + L.durTxt(n) + '</span></button>').join('') + '</div>' : '')
      + '</div><span class="muted">fin ' + L.hhmm((L.toMin(cfg.heureDebut) || 0) + cfg.duree) + '</span></div></div>';
    h += '<div class="fgrp">' + lbl('Étapes de cette instance', 'Etapes_actives') + L.STEPS.map(x => { const on = cfg.steps.indexOf(x.key) >= 0, locked = x.key === 'odj'; return '<button type="button" class="togg ' + (on ? 'on' : '') + (locked ? ' locked' : '') + '" ' + da('cfg-step', { v: x.key }) + '><span class="box">' + ic('check', 'xs') + '</span><span class="pname">' + esc(x.label) + '</span></button>'; }).join('') + '</div>';
    h += '<div class="fgrp">' + lbl('Relecteurs du compte rendu', 'Relecteurs_CR') + '<div class="group">' + cfg.relecteurs.map(id => tag(personOf(m, id).name, 'cfg-rel-del', id)).join('')
      + '<div class="rel"><button type="button" class="addb" title="Ajouter un relecteur" aria-label="Ajouter un relecteur" ' + da('menu', { v: 'relpick' }) + '>' + ic('plus', 'xs') + '</button>'
      + (isOpen('relpick') ? '<div class="menu">' + filterInput('Rechercher une personne…') + pick(m.people.filter(pp => cfg.relecteurs.indexOf(pp.id) < 0), 'cfg-rel-add') + '</div>' : '') + '</div></div></div>';
    h += '<div class="fgrp">' + lbl('Invités permanents', 'Invites_permanents') + '<div class="group">' + cfg.permanents.map(id => tag(personOf(m, id).name, 'cfg-perm-del', id)).join('')
      + '<div class="rel"><button type="button" class="addb" title="Ajouter un invité permanent" aria-label="Ajouter un invité permanent" ' + da('menu', { v: 'permpick' }) + '>' + ic('plus', 'xs') + '</button>'
      + (isOpen('permpick') ? '<div class="menu">' + filterInput('Rechercher une personne…') + pick(m.people.filter(pp => cfg.permanents.indexOf(pp.id) < 0), 'cfg-perm-add') + '</div>' : '') + '</div></div></div>';
    h += compositionSettingsHtml(V);
    h += '<div class="fgrp">' + lbl('Modèles de mail', 'Modele_invitation', 'Modele_CR') + '<div class="rowf">' + ic('mail')
      + '<input type="text" class="inp" list="in-modeles" placeholder="Modèle d\'invitation" aria-label="Modèle d\'invitation" value="' + esc(cfg.modInvitation) + '" data-chg="cfg-mod" data-f="Modele_invitation">'
      + ic('send') + '<input type="text" class="inp" list="in-modeles" placeholder="Modèle d\'envoi du compte rendu" aria-label="Modèle d\'envoi du compte rendu" value="' + esc(cfg.modCr) + '" data-chg="cfg-mod" data-f="Modele_CR">'
      + '<datalist id="in-modeles">' + m.gfs.map(f => '<option value="' + esc(f.nom) + '"></option>').join('') + '</datalist></div></div>';
    return h + '</div></div></div>';
  }

  // ---------------------------------------------------------------------------------------------
  // Rendu — page
  // ---------------------------------------------------------------------------------------------
  const rootEl = () => document.getElementById('instances-root');
  function ensureSkeleton(root) {
    if (root.querySelector('[data-region="main"]')) return;
    root.className = 'in-root';
    root.innerHTML = '<div class="in-wrap"><div data-region="main"></div><div data-region="viewer"></div></div>';
  }
  function buildMain() {
    if (!S.loaded) return withPrefix('<div class="loading">' + esc(S.error || 'Chargement…') + '</div>');
    if (!S.model.instances.length) return withPrefix('<div class="loading">Aucune instance dans la table Instances de Grist.</div>');
    const V = computeView();
    S.view = V;
    let h = '<div class="wrap" style="display:flex;flex-direction:column;gap:12px">' + bandHtml(V);
    if (V.s) {
      h += V.isMacro ? macroHtml(V) : panelHtml(V);
      if (S.ui.menu && MODAL_MENUS.indexOf(S.ui.menu) < 0) h += '<div class="backdrop" ' + da('menu-close') + '></div>';
      if (S.ui.settings) h += settingsHtml(V);
    } else if (S.ui.settings) h += settingsHtml(V);
    return fillHelp(withPrefix(h + '</div>'));
  }
  function render() {
    const root = rootEl(); if (!root) return;
    clearTimeout(renderTimer); renderTimer = null;
    ensureSkeleton(root);
    const main = root.querySelector('[data-region="main"]');
    const active = document.activeElement;
    main.innerHTML = buildMain();
    const focus = main.querySelector('[data-autofocus]');
    if (focus && active && !main.contains(active)) focus.focus();
    autosizeTitles();
    renderViewer();
    syncCadre();
  }

  // « Plein cadre » : seulement sur l'étape Compte rendu et tant que la page Instances est affichée. La classe de la page masque le
  // bandeau et les panneaux ; celle de <body> masque l'en-tête de l'appli (marque + onglets) et ses marges (voir css/instances.css).
  function pleinActive() {
    const V = S.view, view = document.getElementById('view-instances');
    return !!(S.prefs.cadre.plein && S.loaded && V && V.s && V.view === 'cr' && view && !view.classList.contains('hidden'));
  }
  function syncCadre() {
    const root = rootEl(); if (!root) return;
    const plein = pleinActive();
    root.classList.toggle('in-plein', plein);
    document.body.classList.toggle('in-plein-body', plein);
  }

  // Les titres des points ne sont jamais coupés : chaque zone de texte prend la hauteur de son contenu (et se recalcule quand
  // la largeur change, car la ligne se replie ou les noms passent en initiales — voir @container pts dans css/instances.css).
  function autosizeTitles() {
    const root = rootEl(); if (!root) return;
    root.querySelectorAll('textarea.in-ptitle').forEach(el => {
      el.style.height = 'auto';
      if (el.scrollHeight) el.style.height = el.scrollHeight + 2 + 'px'; // +2 : la bordure
    });
  }

  // --- Compte rendu : GFS intégré (le texte se rédige ici) et PDF exporté ---
  // Région hors du rendu principal : ni l'iframe de GFS (qui garde son état d'un clic à l'autre) ni celle du PDF ne doivent
  // être rechargées à chaque rendu. GFS est relié à Grist par le même pont que publipostage+ dans la page Rédaction
  // (js/core/grist-bridge.js) : il reçoit la ligne de la séance (Suivi_Instance) comme enregistrement sélectionné.
  const GFS_URL = 'https://lombre33.github.io/grist-widget-GFS/prototype/';
  const GFS_OPTIONS_KEY = 'gfs'; // clé, dans les options de CE widget, où Grist garde les réglages de GFS
  const GFS_READY_TIMEOUT_MS = 10000;
  const GFS_STATUS = { waiting: 'Connexion à GFS…', ready: 'GFS connecté', rejected: 'Origine de GFS refusée', timeout: 'GFS ne répond pas' };
  const viewer = {
    token: null, tokenAt: 0, mode: 'edit', pdfKey: '', targetOverride: null,
    gfs: { frame: null, bridge: null, timer: null, reloadTimer: null, phase: 'waiting', timedOut: false, opening: 0, rowId: 0, url: '' }
  };

  // http(s) uniquement (jamais javascript:, data:… dans une iframe qui reçoit l'accès complet au document), comme page-redaction.js.
  function safeUrl(value) {
    try {
      const url = new URL(value);
      const local = ['localhost', '127.0.0.1'].includes(url.hostname);
      return url.protocol === 'https:' || (url.protocol === 'http:' && local) ? url : null;
    } catch (err) { return null; }
  }
  // Adresse du widget d'une section « personnalisée » du document (_grist_Views_section.options.customView.url).
  function customUrlOf(optionsText) {
    try {
      const options = JSON.parse(optionsText || '{}');
      const custom = typeof options.customView === 'string' ? JSON.parse(options.customView) : options.customView;
      return custom && typeof custom.url === 'string' ? custom.url : '';
    } catch (err) { return ''; }
  }
  // Si le document a déjà une vue GFS, on reprend SON adresse (même version, mêmes paramètres) ; sinon l'adresse publique.
  async function findGfsSectionUrl() {
    try {
      const api = global.grist && global.grist.docApi;
      const sections = api ? await api.fetchTable('_grist_Views_section') : null;
      if (!sections || !Array.isArray(sections.id)) return null;
      for (let i = 0; i < sections.id.length; i++) {
        const raw = customUrlOf(sections.options && sections.options[i]);
        const url = raw && /gfs/i.test(raw) && !/suiviprojet/i.test(raw) ? safeUrl(raw) : null;
        if (url) return url;
      }
    } catch (err) { /* métadonnées illisibles (droits) : on retombe sur l'adresse publique */ }
    return null;
  }
  // ?gfs=<url> sur l'URL de CE widget : essai d'une autre version de GFS sans republier. ?bridgeOrigin=* seulement si Grist
  // exécute les widgets dans une iframe sandboxée (origine "null") : voir js/core/grist-bridge.js.
  async function resolveGfsTarget() {
    if (viewer.targetOverride) return viewer.targetOverride;
    const params = new URLSearchParams(global.location.search);
    const asked = params.get('gfs') ? safeUrl(params.get('gfs')) : null;
    const url = asked || await findGfsSectionUrl() || safeUrl(GFS_URL);
    return { url: url.href, origin: params.get('bridgeOrigin') === '*' ? '*' : url.origin };
  }

  async function attachmentUrl(attachmentId, cell) {
    const api = global.CoreGrist && global.CoreGrist.gristInstance;
    if (!api) throw new Error('Grist non disponible');
    if (!attachmentId) throw new Error('Ce fichier n\'a pas de contenu');
    // readOnly:false volontaire, comme dans project-modal.js : un jeton readOnly:true est plafonné au rôle Lecteur côté Grist.
    if (!viewer.token || Date.now() - viewer.tokenAt > 10 * 60 * 1000) { viewer.token = await api.docApi.getAccessToken({ readOnly: false }); viewer.tokenAt = Date.now(); }
    const t = viewer.token;
    return t.baseUrl + '/attachments/' + attachmentId + '/download?auth=' + encodeURIComponent(t.token)
      + '&tableId=' + encodeURIComponent(cell.tableId) + '&colId=' + encodeURIComponent(cell.colId) + '&rowId=' + encodeURIComponent(cell.rowId);
  }
  const gfsCell = file => ({ tableId: 'GFS_Fichiers', colId: 'Contenu', rowId: file.id });
  const crPdfOf = s => ({ id: s.crPdf[s.crPdf.length - 1] || 0, cell: { tableId: 'Suivi_Instance', colId: CR_PDF_COLUMN, rowId: s.id } });
  // Ouvre un fichier dans un nouvel onglet ; la fenêtre est ouverte tout de suite (geste de la personne) pour que le navigateur ne la bloque pas.
  function openAttachment(attachmentId, cell) {
    const win = global.open('', '_blank');
    attachmentUrl(attachmentId, cell).then(url => { if (win) win.location.href = url; else global.open(url, '_blank'); })
      .catch(err => { if (win) win.close(); if (global.CoreUtils) global.CoreUtils.showToast('Lecture impossible : ' + err.message, true); });
  }
  const openGfs = file => openAttachment(file.attachmentIds[0], gfsCell(file));
  function downloadCr(V) {
    const pdf = crPdfOf(V.s);
    if (pdf.id) openAttachment(pdf.id, pdf.cell);
  }

  const gfsStatusLabel = () => (viewer.gfs.timedOut && viewer.gfs.phase !== 'ready' ? GFS_STATUS.timeout : (GFS_STATUS[viewer.gfs.phase] || GFS_STATUS.waiting));
  function paintGfsStatus() {
    const root = rootEl(); const el = root && root.querySelector('[data-gfs-status]');
    if (!el) return;
    el.textContent = gfsStatusLabel();
    el.classList.toggle('in-ok', viewer.gfs.phase === 'ready');
  }
  // GFS (ou publipostage+ dedans) a écrit dans le document : la page ne relit QUE la colonne qui l'intéresse (CR_PDF : le PDF exporté),
  // et seulement la table Suivi_Instance, avec un délai pour regrouper les écritures rapprochées. Avant, la moindre écriture de GFS
  // dans Suivi_Instance (enregistrement automatique pendant la frappe, par exemple) relisait toutes les tables de la page.
  const touchesCrPdf = actions => actions.some(a => {
    if (!Array.isArray(a) || a[1] !== 'Suivi_Instance') return false;
    const fields = a[0] === 'AddRecord' ? a[3] : (a[0] === 'UpdateRecord' || a[0] === 'BulkUpdateRecord' || a[0] === 'BulkAddRecord' ? a[3] : null);
    return !fields || typeof fields !== 'object' || Object.prototype.hasOwnProperty.call(fields, CR_PDF_COLUMN); // forme inconnue : on relit par prudence
  });
  async function reloadSeancesFromGrist() {
    try { S.raw.Suivi_Instance = await global.CoreGrist.getTable('Suivi_Instance'); rebuild(); render(); } catch (err) { console.warn('Rechargement des séances :', err.message); }
  }
  function onGfsWrite(actions) {
    if (!Array.isArray(actions) || !touchesCrPdf(actions)) return;
    clearTimeout(viewer.gfs.reloadTimer);
    viewer.gfs.reloadTimer = setTimeout(() => { viewer.gfs.reloadTimer = null; reloadSeancesFromGrist(); }, 1200);
  }
  function dropGfs() {
    const g = viewer.gfs;
    clearTimeout(g.timer); clearTimeout(g.reloadTimer);
    if (g.bridge) g.bridge.detach();
    if (g.frame) g.frame.remove();
    g.frame = null; g.bridge = null; g.timer = null; g.reloadTimer = null; g.phase = 'waiting'; g.timedOut = false; g.opening = 0; g.rowId = 0; g.url = '';
  }
  function ensureGfs(V) {
    const g = viewer.gfs;
    if (g.frame) {
      // Le « select by » : GFS reçoit la ligne de la séance affichée (seulement quand elle change, pas à chaque rendu).
      if (g.bridge && g.rowId !== V.s.id) { g.rowId = V.s.id; g.bridge.select(V.s.id, 'Suivi_Instance'); }
      return;
    }
    if (g.opening || !global.GristBridge) return;
    const ticket = g.opening = Date.now() + Math.random();
    resolveGfsTarget().then(target => {
      if (g.opening !== ticket || g.frame) return;
      g.opening = 0;
      const root = rootEl(); const pane = root && root.querySelector('[data-pane="gfs"]');
      if (!pane) return;
      const cur = S.view && S.view.s ? S.view.s.id : V.s.id;
      const frame = document.createElement('iframe');
      frame.className = 'in-gframe'; frame.title = 'GFS'; frame.setAttribute('allow', 'clipboard-write; clipboard-read');
      pane.appendChild(frame); // l'iframe doit être dans le document pour avoir une fenêtre
      g.frame = frame; g.rowId = cur; g.url = target.url; g.phase = 'waiting'; g.timedOut = false;
      // Le pont écoute AVANT le chargement de l'iframe : son « prêt » arrive dès l'exécution de son grist.ready().
      g.bridge = global.GristBridge.attach(frame, {
        origin: target.origin, tableId: 'Suivi_Instance', rowId: cur, optionsKey: GFS_OPTIONS_KEY,
        onStatus: status => { g.phase = status.phase; paintGfsStatus(); }, onWrite: onGfsWrite
      });
      frame.src = target.url;
      g.timer = setTimeout(() => {
        if (g.bridge && !g.bridge.getState().ready && g.bridge.getState().phase !== 'rejected') { g.timedOut = true; paintGfsStatus(); }
      }, GFS_READY_TIMEOUT_MS);
    });
  }

  function renderPdfPane(V, pane) {
    const pdf = crPdfOf(V.s);
    const key = pdf.id ? 'pdf:' + V.s.id + ':' + pdf.id : 'none:' + V.s.id;
    if (key === viewer.pdfKey) return;
    viewer.pdfKey = key;
    if (!pdf.id) {
      pane.innerHTML = withPrefix('<div class="vempty"><span>Pas encore de PDF</span><span class="muted">Une fois le compte rendu relu, exportez-le en PDF depuis GFS dans la colonne ' + CR_PDF_COLUMN + ' de Suivi_Instance : il s\'affiche ici et le bouton « Télécharger le CR » s\'active.</span></div>');
      return;
    }
    pane.innerHTML = withPrefix('<div class="vempty"><span class="muted">Chargement du document…</span></div>');
    attachmentUrl(pdf.id, pdf.cell).then(url => {
      if (viewer.pdfKey !== key) return;
      pane.innerHTML = '';
      const frame = document.createElement('iframe');
      frame.className = 'in-vframe'; frame.title = 'Compte rendu (PDF)'; frame.src = url;
      pane.appendChild(frame);
    }).catch(err => {
      if (viewer.pdfKey !== key) return;
      pane.innerHTML = withPrefix('<div class="vempty"><span>Document indisponible</span><span class="muted">' + esc(err.message) + '</span></div>');
    });
  }
  function renderViewer() {
    const root = rootEl(); if (!root) return;
    const host = root.querySelector('[data-region="viewer"]'); if (!host) return;
    const V = S.view;
    const show = !!(S.loaded && V && V.s && V.view === 'cr');
    host.hidden = !show; // masquée (pas détruite) hors de l'étape : GFS garde son état
    if (!show) {
      if (viewer.pdfKey) { viewer.pdfKey = ''; const pane = host.querySelector('[data-pane="pdf"]'); if (pane) pane.innerHTML = ''; }
      return;
    }
    if (!host.firstChild) host.innerHTML = withPrefix('<div class="viewer"><div class="vbar"></div><div class="vbody"><div data-pane="gfs"></div><div data-pane="pdf" hidden></div></div></div>');
    const edit = viewer.mode === 'edit', hasPdf = V.s.crPdf.length > 0, cadre = S.prefs.cadre, plein = pleinActive();
    host.firstChild.dataset.h = cadre.hauteur;
    const hLabel = { 'ajustee': '1×', 'haute': '1,5×', 'tres-haute': '2,5×' }[cadre.hauteur];
    const c = crSummary(V);
    host.querySelector('.in-vbar').innerHTML = withPrefix(
      (plein ? '<span class="vname vsub"><strong>' + esc(V.inst.nom) + '</strong> · n°' + esc(V.s.num || '?') + ' · ' + esc(L.fmtDate(V.s.date) || 'sans date') + '</span>' : '')
      + '<div class="seg" role="group" aria-label="Affichage du compte rendu">'
      + '<button type="button" class="' + (edit ? 'on' : '') + '" ' + da('cr-mode', { v: 'edit' }) + '>' + ic('pencil', 's') + 'Rédiger dans GFS</button>'
      + '<button type="button" class="' + (edit ? '' : 'on') + '" ' + da('cr-mode', { v: 'pdf' }) + '>' + ic('fileLines', 's') + 'PDF exporté</button></div>'
      + (edit ? '<span class="tag-soft ' + (viewer.gfs.phase === 'ready' ? 'ok' : '') + '" data-gfs-status>' + esc(gfsStatusLabel()) + '</span>'
        : '<span class="vname">' + esc(hasPdf ? 'Compte rendu n°' + V.s.num + ' (PDF)' : 'Aucun PDF exporté') + '</span>')
      + (plein ? '<span class="tag-soft ' + (c.v0 ? 'ok' : '') + '">' + (c.v0 ? 'V0 rédigée' : 'V0 à rédiger') + (c.total ? ' · ' + c.valid + '/' + c.total + ' validé' : '') + '</span>' : '')
      + '<span class="sp"></span>'
      + (!edit && hasPdf ? '<button type="button" class="ibtn" title="Ouvrir le PDF dans un nouvel onglet" aria-label="Ouvrir le PDF dans un nouvel onglet" ' + da('cr-download') + '>' + ic('ext') + '</button>' : '')
      + (plein && hasPdf ? '<button type="button" class="ibtn" title="Télécharger le PDF du compte rendu" aria-label="Télécharger le CR" ' + da('cr-download') + '>' + ic('download', 's') + '</button>' : '')
      + (!plein && edit ? '<button type="button" class="pillbtn ghost" title="Hauteur de GFS : ' + HAUTEUR_LABEL[cadre.hauteur] + '. Cliquer pour l\'agrandir : le défilement de la page déplie alors GFS" aria-label="Hauteur de GFS" ' + da('cr-hauteur') + '>' + ic('vexpand', 's') + 'Hauteur ' + hLabel + '</button>' : '')
      + '<button type="button" class="pillbtn ghost" title="' + (plein ? 'Revenir à la page complète (touche Échap)' : 'Plein cadre : masque l\'en-tête et les panneaux, GFS prend toute la hauteur') + '" aria-label="' + (plein ? 'Quitter le plein cadre' : 'Plein cadre') + '" aria-pressed="' + (plein ? 'true' : 'false') + '" ' + da('cr-plein') + '>' + ic(plein ? 'shrink' : 'expand', 's') + (plein ? 'Quitter le plein cadre' : 'Plein cadre') + '</button>');
    host.querySelector('[data-pane="gfs"]').hidden = !edit;
    const pdfPane = host.querySelector('[data-pane="pdf"]');
    pdfPane.hidden = edit;
    if (edit) ensureGfs(V); else renderPdfPane(V, pdfPane);
  }

  // --- Menu « Instances » de la barre de navigation (une entrée par instance) ---
  function renderNavMenu() {
    const menu = document.getElementById('instances-menu'); if (!menu) return;
    if (!S.loaded) { menu.innerHTML = '<span class="in-navmsg">' + esc(S.error ? 'Indisponible' : 'Chargement…') + '</span>'; return; }
    const cur = currentInstance();
    menu.innerHTML = S.model.instances.map(i => '<button type="button" class="in-navitem' + (cur && cur.id === i.id ? ' is-on' : '') + '" data-inst="' + i.id + '"><span>' + esc(i.nom) + '</span><span class="in-navsub">' + i.cfg.steps.length + ' étapes</span></button>').join('')
      || '<span class="in-navmsg">Aucune instance</span>';
  }
  function showInstancesView() {
    if (typeof global.showView === 'function') global.showView('view-instances');
    else { document.querySelectorAll('.view').forEach(v => v.classList.add('hidden')); document.getElementById('view-instances')?.classList.remove('hidden'); }
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.id === 'btn-instances'));
  }

  // ---------------------------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------------------------
  const toast = (msg, isErr) => { if (global.CoreUtils) global.CoreUtils.showToast(msg, !!isErr); };
  const gristDay = iso => (iso ? L.isoToGristDate(iso) : null);
  const setMenu = key => { S.ui.menu = S.ui.menu === key ? null : key; render(); };
  function setStep(key) { S.prefs.etape = key; S.ui.menu = null; render(); savePrefs(); }
  const pointOf = (V, id) => L.allPoints(V.s).find(p => p.id === Number(id));
  // Sous-points : le parent d'un sous-point (undefined pour un point), et les « frères » à réordonner entre eux.
  const parentOf = (V, id) => V.s.points.find(p => (p.subs || []).some(q => q.id === Number(id)));
  const siblingsOf = (V, id) => { const par = parentOf(V, id); return par ? par.subs : V.s.points; };
  const guestOf = (V, id) => V.s.guests.find(g => g.id === Number(id));
  const upd = (table, id, fields) => ({ op: 'update', table, id: Number(id), fields });
  const addOp = (table, fields) => ({ op: 'add', table, fields });
  const delOp = (table, id) => ({ op: 'remove', table, id: Number(id) });

  function pointsOrderOps(V, ids) {
    const byId = {}; L.allPoints(V.s).forEach(p => { byId[p.id] = p; });
    return ids.map((id, i) => (byId[id].ordre !== i + 1 ? upd('Instance_Points', id, { Ordre: i + 1 }) : null)).filter(Boolean);
  }
  // Déplace un point (ou un sous-point parmi ses frères) avant / après `toId`, ou tout à la fin si `toId` est null.
  function movePoint(V, fromId, toId, after) {
    const ids = siblingsOf(V, fromId).map(p => p.id), from = Number(fromId);
    if (ids.indexOf(from) < 0) return;
    const next = ids.filter(id => id !== from);
    if (toId == null) next.push(from);
    else { const j = next.indexOf(Number(toId)); if (j < 0) return; next.splice(after ? j + 1 : j, 0, from); }
    if (next.every((id, k) => id === ids[k])) return;
    write(pointsOrderOps(V, next));
  }
  function shiftPoint(V, id, d) {
    const ids = siblingsOf(V, id).map(p => p.id);
    const i = ids.indexOf(Number(id)), j = i + d;
    if (i < 0 || j < 0 || j >= ids.length) return;
    ids.splice(j, 0, ids.splice(i, 1)[0]);
    write(pointsOrderOps(V, ids));
  }
  // Donne le focus à un champ qui n'est pas encore (re)dessiné : on attend son apparition quelques instants.
  function focusWhenThere(sel, tries) {
    const el = rootEl() && rootEl().querySelector(sel);
    if (el) { el.focus(); return; }
    if ((tries || 0) < 15) setTimeout(() => focusWhenThere(sel, (tries || 0) + 1), 60);
  }
  // Valeurs d'un point neuf ; un sous-point neuf a une durée vide (le point garde la sienne) et la nature de son point.
  const newPointFields = (V, par) => Object.assign({ Seance: V.s.id, Titre: '', Projets: ['L'], Invites: ['L'], Presentateurs: ['L'], Lien_type: '', Lien: '' },
    par ? { Parent: par.id, Nature: C.nature[par.nature] || C.nature.discussion, Duree_min: 0 } : { Nature: C.nature.discussion, Duree_min: 15 });
  // Ajoute un point (un sous-point sous `par`) : à la fin, ou juste après `afterId` (touche Entrée dans un titre) ; les rangs des frères
  // suivants sont décalés dans la même écriture. Le curseur arrive ensuite dans le titre du nouveau point. Une seule ajout à la fois.
  async function addPoint(V, par, afterId) {
    if (S.adding) return;
    S.adding = true;
    try {
      const sibs = par ? (par.subs || []) : V.s.points;
      const idx = afterId == null ? sibs.length - 1 : sibs.findIndex(q => q.id === Number(afterId));
      const ops = [];
      sibs.forEach((q, k) => { const want = k <= idx ? k + 1 : k + 2; if (q.ordre !== want) ops.push(upd('Instance_Points', q.id, { Ordre: want })); });
      ops.push(addOp('Instance_Points', Object.assign(newPointFields(V, par), { Ordre: idx + 2 })));
      const [newId] = await write(ops);
      if (newId) focusWhenThere('.in-pt[data-pt="' + newId + '"] .in-ptitle'); // saisie fluide
    } finally { S.adding = false; }
  }
  // Supprime un point ; ses sous-points partent avec lui (et les invités qui n'étaient là que pour eux).
  function deletePoint(V, p) {
    const ids = [p.id].concat((p.subs || []).map(q => q.id));
    delete S.ui.subs[p.id];
    write(ids.map(id => delOp('Instance_Points', id)).concat(orphanGuestOps(V, ids)));
  }
  // Invités « ajoutés sur un point » devenus orphelins (aucun point, jamais écrits) : retirés de la liste.
  const orphanGuestOps = (V, removedPointIds) => V.s.guests.filter(g => g.origine === 'point' && !g.ecritLe && !g.passageLe
    && !L.allPoints(V.s).some(p => removedPointIds.indexOf(p.id) < 0 && p.invites.indexOf(g.id) >= 0)).map(g => delOp('Instance_Invites', g.id));
  async function toggleGuestOnPoint(V, pointId, personId) {
    const p = pointOf(V, pointId); if (!p) return;
    let g = V.s.guests.find(x => x.personneId === Number(personId));
    let gid = g && g.id;
    if (!g) {
      [gid] = await write([addOp('Instance_Invites', { Seance: V.s.id, Personne: Number(personId), Origine: C.origine.point, Reponse: C.reponse.attente, Ecrit_le: null, Passage_envoye_le: null, Passage_envoye_heure: '', Dispo_de: '', Dispo_a: '', Commentaire: '', Appel: '' })]);
      if (!gid) return;
    }
    const on = p.invites.indexOf(gid) >= 0;
    const list = on ? p.invites.filter(x => x !== gid) : p.invites.concat([gid]);
    const ops = [upd('Instance_Points', p.id, { Invites: D.toList(list) })];
    if (on && g && g.origine === 'point' && !g.ecritLe && !g.passageLe && !L.allPoints(V.s).some(q => q.id !== p.id && q.invites.indexOf(gid) >= 0)) ops.push(delOp('Instance_Invites', gid));
    write(ops);
  }

  const guestAdd = (seanceId, pid, origine) => addOp('Instance_Invites', { Seance: seanceId, Personne: pid, Origine: origine, Reponse: C.reponse.attente, Ecrit_le: null, Passage_envoye_le: null, Passage_envoye_heure: '', Dispo_de: '', Dispo_a: '', Commentaire: '', Appel: '' });
  const defaultGuestIds = inst => inst.cfg.permanents.concat(inst.cfg.composition.filter(pid => inst.cfg.permanents.indexOf(pid) < 0));
  function newSeance(V) {
    const inst = V.inst, last = inst.seances[0];
    const date = last && last.date ? L.addDaysIso(last.date, 28) : V.today;
    const num = last ? String((parseInt(last.num, 10) || inst.seances.length) + 1) : '1';
    write([addOp('Suivi_Instance', { Instance: inst.id, Numero: num, date: gristDay(date), Heure: L.parisToEpoch(date, inst.cfg.heureDebut), Salle: last ? last.salleId : 0 })]).then(([id]) => {
      if (!id) return;
      // Invités par défaut : la liste permanente de l'instance + sa composition (table « Composition instances »), sans doublon.
      const ops = defaultGuestIds(inst).map(pid => guestAdd(id, pid, C.origine.permanent));
      const done = ops.length ? write(ops) : Promise.resolve();
      done.then(() => { S.prefs.seances[inst.id] = id; S.prefs.etape = 'odj'; S.ui.menu = null; render(); savePrefs(); toast('Nouvelle séance créée, invités par défaut repris.'); });
    });
  }

  function openLink(V, type, link) {
    if (type === 'gfs') { const file = V.m.gfsByIdent[link]; if (file) openGfs(file); }
    else if (link) global.open(link, '_blank', 'noopener');
  }
  const setLinkOps = (V, id, type, link) => [upd('Instance_Points', id, { Lien_type: type ? C.lien[type] : '', Lien: link })];
  const linkOf = (V, id) => { const p = pointOf(V, id); return { type: p.lienType, link: p.lien }; };

  function confirmVp(V) {
    const projIds = V.ctx.projectIds.filter(id => V.ctx.projectVp[id].key === 'none');
    if (!projIds.length) return;
    const ops = projIds.map(id => {
      const existing = V.s.exports[id];
      const fields = { A_envoyer: true, Mis_a_dispo_le: gristDay(V.today), Mis_a_dispo_par: S.personId || 0 };
      return existing ? upd('Export_VP', existing.id, fields) : addOp('Export_VP', Object.assign({ Seance: V.s.id, Projet: id }, fields));
    });
    S.ui.menu = null;
    write(ops).then(() => toast(plural(projIds.length, 'notification mise', 'notifications mises') + ' à disposition du VP. Elles partent à la prochaine synchronisation Sync+.'));
  }

  function validateStep(V) {
    if (V.missing.length) { toast('À compléter : ' + V.missing.join(', '), true); return; }
    const stored = L.STEPS.find(x => x.key === V.stepKey).stored;
    write([addOp('Instance_Validations', { Seance: V.s.id, Etape: stored, Date: gristDay(V.today), Par: S.personId || 0 })]);
  }
  // Validation AUTOMATIQUE du compte rendu : dès que la V0 est rédigée et que tous les relecteurs ont validé (pas avant, et jamais
  // sans relecteur défini). Déclenchée seulement par le geste qui complète la condition (V0 cochée, dernier relecteur validé) :
  // « Rouvrir l'étape » n'est donc jamais défait tout seul. `statutOf(pid)` = statut de relecture APRÈS le geste.
  function crAutoValidationOps(V, v0, statutOf) {
    const rel = V.cfg.relecteurs;
    if (!v0 || !rel.length || V.valid('cr') || !V.active.some(x => x.key === 'cr')) return [];
    if (!rel.every(pid => statutOf(pid) === 'valide')) return [];
    return [addOp('Instance_Validations', { Seance: V.s.id, Etape: L.STEPS.find(x => x.key === 'cr').stored, Date: gristDay(V.today), Par: S.personId || 0 })];
  }
  const writeCr = (ops, auto) => write(ops.concat(auto)).then(() => { if (auto.length) toast('Compte rendu validé automatiquement : V0 rédigée et relecture validée par tous.'); });
  function reopenStep(V) {
    if (V.stepKey === 'invitation') write([upd('Suivi_Instance', V.s.id, { Mail_invitation_le: null })]);
    else if (V.stepKey === 'crmail') write([upd('Suivi_Instance', V.s.id, { Mail_CR_le: null })]);
    else if (V.s.validations[V.stepKey]) write([delOp('Instance_Validations', V.s.validations[V.stepKey].id)]);
  }
  function setInvitationDate(V, iso) {
    const ops = [upd('Suivi_Instance', V.s.id, { Mail_invitation_le: gristDay(iso) })];
    if (iso) V.s.guests.filter(g => !g.ecritLe).forEach(g => ops.push(upd('Instance_Invites', g.id, { Ecrit_le: gristDay(iso) })));
    return ops;
  }
  function cfgWrite(V, fields) { return write([upd('Instances', V.inst.id, fields)]); }

  const CLICK = {
    'menu': (el) => setMenu(el.dataset.v),
    'menu-close': () => { S.ui.menu = null; render(); },
    'step': (el) => setStep(el.dataset.v),
    'vue': (el) => { S.prefs.vue = el.dataset.v; render(); savePrefs(); },
    'odj-vue': (el) => { if (ODJ_VUES.indexOf(el.dataset.v) < 0) return; S.prefs.odjVue = el.dataset.v; render(); savePrefs(); },
    'seance-pick': (el, V) => { S.prefs.seances[V.inst.id] = Number(el.dataset.id); S.prefs.etape = 'macro'; S.ui.menu = null; render(); savePrefs(); },
    'seance-new': (el, V) => newSeance(V),
    'time-pick': (el, V) => {
      const sc = el.dataset.s, v = el.dataset.v; S.ui.menu = null;
      if (sc === 'heure') { const e = L.parisToEpoch(V.s.date, v); if (e == null) { toast('Renseignez d\'abord la date de la séance.', true); render(); return; } write([upd('Suivi_Instance', V.s.id, { Heure: e })]); }
      else if (sc === 'g-de') write([upd('Instance_Invites', el.dataset.id, { Dispo_de: v })]);
      else if (sc === 'g-a') write([upd('Instance_Invites', el.dataset.id, { Dispo_a: v })]);
      else if (sc === 'cfg') cfgWrite(V, { Heure_debut: v });
    },
    'time-clear': (el, V) => { S.ui.menu = null; write([upd('Instance_Invites', el.dataset.id, el.dataset.s === 'g-de' ? { Dispo_de: '' } : { Dispo_a: '' })]); },
    'salle-pick': (el, V) => { S.ui.menu = null; write([upd('Suivi_Instance', V.s.id, { Salle: Number(el.dataset.id) })]); },
    'validate': (el, V) => validateStep(V),
    'reopen': (el, V) => reopenStep(V),
    // ordre du jour
    'pt-add': (el, V) => addPoint(V, null),
    'pt-del': (el, V) => {
      const p = pointOf(V, el.dataset.id); if (!p) return;
      if ((p.subs || []).length) { S.ui.menu = 'ptdel:' + p.id; S.ui.subs[p.id] = true; render(); return; } // confirmation : les sous-points partent avec lui
      deletePoint(V, p);
    },
    'pt-del-ok': (el, V) => { const p = pointOf(V, el.dataset.id); S.ui.menu = null; if (p) deletePoint(V, p); else render(); },
    // sous-points
    'sub-toggle': (el) => { const id = Number(el.dataset.id); S.ui.menu = null; S.ui.subs[id] = !S.ui.subs[id]; render(); },
    'sub-add': (el, V) => {
      const par = pointOf(V, el.dataset.id); if (!par || par.parent) return;
      S.ui.subs[par.id] = true;
      addPoint(V, par);
    },
    'pt-up': (el, V) => shiftPoint(V, el.dataset.id, -1),
    'pt-down': (el, V) => shiftPoint(V, el.dataset.id, 1),
    'pt-nat': (el, V) => write([upd('Instance_Points', el.dataset.id, { Nature: C.nature[el.dataset.v] })]),
    'pt-proj': (el, V) => { const p = pointOf(V, el.dataset.id), pid = Number(el.dataset.v); const list = p.projets.indexOf(pid) >= 0 ? p.projets.filter(x => x !== pid) : p.projets.concat([pid]); write([upd('Instance_Points', p.id, { Projets: D.toList(list) })]); },
    'pt-inv': (el, V) => toggleGuestOnPoint(V, el.dataset.id, el.dataset.v),
    'pt-pres': (el, V) => { const p = pointOf(V, el.dataset.id), pid = Number(el.dataset.v); const list = p.presentateurs.indexOf(pid) >= 0 ? p.presentateurs.filter(x => x !== pid) : p.presentateurs.concat([pid]); write([upd('Instance_Points', p.id, { Presentateurs: D.toList(list) })]); },
    // dossier du point
    'pt-link-type': (el, V) => write(setLinkOps(V, el.dataset.id, el.dataset.v, '')),
    'pt-link-file': (el, V) => { S.ui.menu = null; write(setLinkOps(V, el.dataset.id, 'gfs', el.dataset.v)); },
    'pt-link-clear': (el, V) => { S.ui.menu = null; write(setLinkOps(V, el.dataset.id, '', '')); },
    'pt-link-open': (el, V) => { const l = linkOf(V, el.dataset.id); openLink(V, l.type, l.link); },
    // invités
    'g-ecrit': (el, V) => { const g = guestOf(V, el.dataset.id); write([upd('Instance_Invites', g.id, { Ecrit_le: g.ecritLe ? null : gristDay(V.today) })]); },
    'g-hor': (el, V) => {
      const g = guestOf(V, el.dataset.id), fs0 = V.firstStart(g), st = L.horaireState(g, fs0);
      if (st === 'none') return;
      if (st === 'sent') write([upd('Instance_Invites', g.id, { Passage_envoye_le: null, Passage_envoye_heure: '' })]);
      else write([upd('Instance_Invites', g.id, { Passage_envoye_le: gristDay(V.today), Passage_envoye_heure: fs0 })]);
    },
    'g-sort': el => { S.prefs.invTri = L.nextGuestTri(S.prefs.invTri, el.dataset.v); render(); savePrefs(); },
    'g-rep': (el, V) => write([upd('Instance_Invites', el.dataset.id, { Reponse: C.reponse[el.dataset.v] })]),
    'g-start': (el, V) => write([upd('Instance_Invites', el.dataset.id, { Dispo_de: V.s.heure })]),
    'g-end': (el, V) => write([upd('Instance_Invites', el.dataset.id, { Dispo_a: L.hhmm(V.endMin) })]),
    'g-appel': (el, V) => { const g = guestOf(V, el.dataset.id); write([upd('Instance_Invites', g.id, { Appel: g.appel === el.dataset.v ? '' : C.appel[el.dataset.v] })]); },
    'g-del': (el, V) => { const id = Number(el.dataset.id); write([delOp('Instance_Invites', id)].concat(L.allPoints(V.s).filter(p => p.invites.indexOf(id) >= 0).map(p => upd('Instance_Points', p.id, { Invites: D.toList(p.invites.filter(x => x !== id)) })))); },
    'g-compo-add': (el, V) => {
      const missing = V.cfg.composition.filter(pid => V.m.peopleById[pid] && !V.s.guests.some(g => g.personneId === pid));
      if (!missing.length) return;
      write(missing.map(pid => guestAdd(V.s.id, pid, C.origine.permanent))).then(() => toast(plural(missing.length, 'invité ajouté', 'invités ajoutés') + ' depuis la composition de l\'instance.'));
    },
    'g-add': (el, V) => { S.ui.menu = null; write([addOp('Instance_Invites', { Seance: V.s.id, Personne: Number(el.dataset.v), Origine: C.origine.point, Reponse: C.reponse.attente, Ecrit_le: null, Passage_envoye_le: null, Passage_envoye_heure: '', Dispo_de: '', Dispo_a: '', Commentaire: '', Appel: '' })]); },
    // dates des mails
    'inv-today': (el, V) => write(setInvitationDate(V, V.today)),
    'crm-today': (el, V) => write([upd('Suivi_Instance', V.s.id, { Mail_CR_le: gristDay(V.today) })]),
    // compte rendu
    'cr-mode': el => { viewer.mode = el.dataset.v === 'pdf' ? 'pdf' : 'edit'; renderViewer(); },
    'cr-download': (el, V) => downloadCr(V),
    'fold': el => {
      if (el.dataset.v !== 'bandeau' && el.dataset.v !== 'cr') return;
      S.prefs.cadre[el.dataset.v] = !S.prefs.cadre[el.dataset.v]; S.ui.menu = null; render(); savePrefs();
    },
    'cr-plein': () => { S.prefs.cadre.plein = !S.prefs.cadre.plein; S.ui.menu = null; render(); savePrefs(); if (global.scrollTo) global.scrollTo(0, 0); },
    'cr-hauteur': () => { const i = HAUTEURS.indexOf(S.prefs.cadre.hauteur); S.prefs.cadre.hauteur = HAUTEURS[(i + 1) % HAUTEURS.length]; renderViewer(); savePrefs(); },
    'v0-toggle': (el, V) => writeCr([upd('Suivi_Instance', V.s.id, V.s.v0 ? { CR_V0_le: null, CR_V0_par: 0 } : { CR_V0_le: gristDay(V.today), CR_V0_par: S.personId || 0 })],
      V.s.v0 ? [] : crAutoValidationOps(V, true, pid => (V.s.relectures[pid] || {}).statut)),
    'rel-set': (el, V) => {
      const pid = Number(el.dataset.id), v = el.dataset.v, r = V.s.relectures[pid];
      if (v === 'none') { if (r) write([delOp('Instance_Relectures', r.id)]); return; }
      const fields = { Statut: C.relecture[v], Relu_le: gristDay(V.today) };
      writeCr([r ? upd('Instance_Relectures', r.id, fields) : addOp('Instance_Relectures', Object.assign({ Seance: V.s.id, Personne: pid }, fields))],
        crAutoValidationOps(V, !!V.s.v0, id => (id === pid ? v : (V.s.relectures[id] || {}).statut)));
    },
    // notifications
    'vp-toggle': () => setMenu('vpconfirm'),
    'vp-cancel': () => { S.ui.menu = null; render(); },
    'vp-confirm': (el, V) => confirmVp(V),
    // paramétrage
    'settings-open': () => { S.ui.settings = true; S.ui.menu = null; render(); },
    'settings-close': () => { S.ui.settings = false; S.ui.menu = null; render(); },
    'cfg-dur': (el, V) => { S.ui.menu = null; cfgWrite(V, { Duree_min: Number(el.dataset.v) }); },
    'cfg-step': (el, V) => {
      if (el.dataset.v === 'odj') return;
      const next = L.ALL_STEP_KEYS.filter(k => k === 'odj' || (k === el.dataset.v ? V.cfg.steps.indexOf(k) < 0 : V.cfg.steps.indexOf(k) >= 0));
      cfgWrite(V, { Etapes_actives: D.toList(next.map(k => L.STEPS.find(x => x.key === k).stored)) });
    },
    'cfg-rel-add': (el, V) => { S.ui.menu = null; cfgWrite(V, { Relecteurs_CR: D.toList(V.cfg.relecteurs.concat([Number(el.dataset.v)])) }); },
    'cfg-rel-del': (el, V) => cfgWrite(V, { Relecteurs_CR: D.toList(V.cfg.relecteurs.filter(x => x !== Number(el.dataset.v))) }),
    'cfg-perm-add': (el, V) => { S.ui.menu = null; cfgWrite(V, { Invites_permanents: D.toList(V.cfg.permanents.concat([Number(el.dataset.v)])) }); },
    'cfg-perm-del': (el, V) => cfgWrite(V, { Invites_permanents: D.toList(V.cfg.permanents.filter(x => x !== Number(el.dataset.v))) })
  };

  const CHANGE = {
    'pt-titre': (el, V) => write([upd('Instance_Points', el.dataset.id, { Titre: el.value })], { defer: true }),
    'pt-duree': (el, V) => write([upd('Instance_Points', el.dataset.id, { Duree_min: Math.max(0, Math.round(Number(el.value) || 0)) })], { defer: true }),
    'pt-url': (el, V) => write(setLinkOps(V, el.dataset.id, el.value.trim() ? 'externe' : '', el.value.trim()), { defer: true }),
    'g-comm': (el, V) => write([upd('Instance_Invites', el.dataset.id, { Commentaire: el.value })], { defer: true }),
    'inv-date': (el, V) => write(setInvitationDate(V, el.value), { defer: true }),
    'crm-date': (el, V) => write([upd('Suivi_Instance', V.s.id, { Mail_CR_le: gristDay(el.value) })], { defer: true }),
    'seance-date': (el, V) => {
      if (!el.value) return;
      write([upd('Suivi_Instance', V.s.id, { date: gristDay(el.value), Heure: L.parisToEpoch(el.value, V.s.heure) })], { defer: true });
    },
    'cfg-mod': (el, V) => cfgWrite(V, { [el.dataset.f]: el.value.trim() })
  };

  function currentView() { return S.loaded && S.model && S.model.instances.length ? computeView() : null; }
  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || !rootEl().contains(el)) return;
    const handler = CLICK[el.dataset.act]; if (!handler) return;
    const V = currentView(); if (!V || !V.inst) return;
    if (el.disabled) return;
    if (V.s || el.dataset.act === 'seance-new' || el.dataset.act.indexOf('settings') === 0 || el.dataset.act.indexOf('cfg-') === 0 || el.dataset.act === 'menu-close') handler(el, V);
  }
  function onChange(e) {
    const el = e.target.closest('[data-chg]');
    if (!el) return;
    const handler = CHANGE[el.dataset.chg]; if (!handler) return;
    const V = currentView(); if (!V || !V.inst) return;
    if (!V.s && el.dataset.chg !== 'cfg-mod') return;
    handler(el, V);
  }
  // Recherche dans un menu : on masque les lignes sans re-rendre (le champ garde le focus).
  function onInput(e) {
    if (e.target.matches && e.target.matches('textarea.in-ptitle')) { autosizeTitles(); return; }
    const el = e.target.closest('[data-filter]'); if (!el) return;
    const menu = el.closest('.in-menu'); if (!menu) return;
    // Recherche tolérante : sans casse ni accents ni ponctuation, et chaque mot tapé doit se trouver quelque part (« jean dupont » trouve « Dupont Jean »).
    const q = L.normName(el.value);
    menu.querySelectorAll('.in-mi[data-ft]').forEach(btn => { btn.style.display = L.matchesSearch(btn.dataset.ft, q) ? '' : 'none'; });
    // Au clavier : dès qu'on tape, le premier résultat est surligné (Entrée le choisit) ; sans recherche, rien n'est surligné.
    setMenuActive(menu, q ? 0 : -1);
  }
  // Navigation au clavier dans les menus à recherche (projets, présentateurs, invités, relecteurs…) : le champ garde le focus,
  // ↓ / ↑ déplacent la surbrillance parmi les lignes visibles (en boucle), Entrée choisit la ligne surlignée — ou, à défaut, le
  // premier résultat quand une recherche est saisie.
  const menuItems = menu => Array.from(menu.querySelectorAll('.in-mi')).filter(b => !b.disabled && b.style.display !== 'none');
  function setMenuActive(menu, index) {
    const items = menuItems(menu);
    menu.querySelectorAll('.in-mi.in-active').forEach(b => b.classList.remove('in-active'));
    if (index >= 0 && index < items.length) { items[index].classList.add('in-active'); items[index].scrollIntoView({ block: 'nearest' }); }
  }
  function menuKeyNav(e, input) {
    const menu = input.closest('.in-menu'); if (!menu) return false;
    const items = menuItems(menu); if (!items.length) return false;
    const at = items.findIndex(b => b.classList.contains('in-active'));
    if (e.key === 'ArrowDown') { e.preventDefault(); setMenuActive(menu, (at + 1) % items.length); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setMenuActive(menu, (at - 1 + items.length) % items.length); return true; }
    if (e.key === 'Enter') {
      const target = at >= 0 ? items[at] : (input.value.trim() ? items[0] : null);
      e.preventDefault();
      if (target) target.click();
      return true;
    }
    return false;
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      if (S.ui.menu) { S.ui.menu = null; render(); } else if (S.ui.settings) { S.ui.settings = false; render(); }
      else if (pleinActive()) { S.prefs.cadre.plein = false; render(); savePrefs(); }
    } else if (e.target.matches && e.target.matches('input[data-filter]') && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
      menuKeyNav(e, e.target);
    } else if (e.key === 'Enter' && e.target.matches && e.target.matches('input[data-chg]:not([type="date"]), textarea[data-chg]')) {
      onEnter(e);
    }
  }
  // Touche Entrée dans un champ de saisie. Zone de texte (titre d'un point) : Maj+Entrée ou Ctrl/Cmd+Entrée = retour à la ligne (comme dans
  // GFS et publipostage+) ; Entrée seule = enregistre le titre et ajoute un nouveau point juste après (un sous-point si on édite un
  // sous-point) avec le curseur dedans — rien si le titre est encore vide (pas de lignes vides en rafale). Autres champs : Entrée enregistre.
  function onEnter(e) {
    if (e.isComposing) return; // validation d'une saisie accentuée / IME : ce n'est pas un « Entrée »
    const t = e.target, isTitle = t.tagName === 'TEXTAREA' && t.dataset.chg === 'pt-titre';
    if (t.tagName === 'TEXTAREA' && (e.shiftKey || e.ctrlKey || e.metaKey)) {
      if (e.shiftKey) return; // natif : retour à la ligne
      e.preventDefault();
      t.setRangeText('\n', t.selectionStart, t.selectionEnd, 'end'); // Ctrl/Cmd+Entrée : pas natif, on l'insère
      t.dispatchEvent(new Event('input', { bubbles: true })); // la zone regrandit
      return;
    }
    e.preventDefault();
    if (!isTitle) { t.blur(); return; }
    if (!t.value.trim()) return;
    const V = currentView(), id = Number(t.dataset.id);
    t.blur(); // enregistre le titre (change)
    if (V && V.s && pointOf(V, id)) addPoint(V, parentOf(V, id) || null, id);
  }
  // Glisser-déposer des points : on ne re-rend qu'au dépôt (re-rendre pendant le glissement l'annule).
  function onDragStart(e) {
    const grip = e.target.closest && e.target.closest('[data-drag]'); if (!grip) return;
    S.drag = Number(grip.dataset.drag);
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(S.drag)); const row = grip.closest('.in-pt'); if (row) e.dataTransfer.setDragImage(row, 20, 20); } catch (err) { /* navigateur sans dataTransfer */ }
    const row = grip.closest('.in-pt'); if (row) row.classList.add('in-dragging');
    const list = rootEl().querySelector('.in-pts'); if (list) list.classList.add('in-dragon'); // la zone « tout en bas » apparaît
  }
  function clearDrag() { S.drag = null; rootEl().querySelectorAll('.in-dragging,.in-drop,.in-drop-after,.in-dragon').forEach(el => el.classList.remove('in-dragging', 'in-drop', 'in-drop-after', 'in-dragon')); }
  // Dernier élément du bloc d'un point : le point, puis ses sous-points et sa ligne d'ajout.
  const lastOfBlock = row => { let el = row; while (el.nextElementSibling && (el.nextElementSibling.classList.contains('in-sub') || el.nextElementSibling.classList.contains('in-subbar'))) el = el.nextElementSibling; return el; };
  // Où tomberait le point glissé : { id, after, el } (el = l'élément à surligner) ; id null = tout en bas. Moitié haute d'une ligne : avant ;
  // moitié basse : après (sous ses sous-points) ; sur un sous-point : après son point ; la zone du bas et le vide sous la dernière ligne : à la fin.
  function dropTarget(e) {
    const t = e.target; if (!t || !t.closest) return null;
    const row = t.closest('.in-pt[data-pt]');
    if (row) {
      if (row.dataset.sub) return { id: Number(row.dataset.sub), after: true, el: lastOfBlock(row.parentNode.querySelector('.in-pt[data-pt="' + row.dataset.sub + '"]') || row) };
      const r = row.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
      return { id: Number(row.dataset.pt), after, el: after ? lastOfBlock(row) : row };
    }
    const end = t.closest('.in-dropend');
    if (end) return { id: null, after: true, el: end };
    const pts = t.closest('.in-pts');
    if (pts && t === pts) { // le vide d'une marge de la liste : seulement sous la dernière ligne
      const zone = pts.querySelector('.in-dropend'), last = zone && zone.previousElementSibling;
      if (zone && last && e.clientY >= last.getBoundingClientRect().bottom) return { id: null, after: true, el: zone };
    }
    return null;
  }
  function onDragOver(e) {
    if (S.drag == null) return;
    const to = dropTarget(e); if (!to) return;
    e.preventDefault();
    rootEl().querySelectorAll('.in-drop,.in-drop-after').forEach(el => el.classList.remove('in-drop', 'in-drop-after'));
    if (to.id !== S.drag) to.el.classList.add(to.after ? 'in-drop-after' : 'in-drop');
  }
  function onDrop(e) {
    if (S.drag == null) return;
    const to = dropTarget(e); if (!to) return;
    e.preventDefault();
    const from = S.drag; clearDrag();
    const V = currentView(); if (V && V.s && from !== to.id) movePoint(V, from, to.id, to.after);
  }

  let wired = false;
  function init() {
    if (wired) return; wired = true;
    const root = rootEl(); if (!root) return;
    // « Plein cadre » ne doit jamais survivre à un changement d'onglet de l'appli : on resynchronise quand la page est affichée/masquée.
    const view = document.getElementById('view-instances');
    if (view && global.MutationObserver) new global.MutationObserver(syncCadre).observe(view, { attributes: true, attributeFilter: ['class'] });
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    root.addEventListener('keydown', onKey);
    root.addEventListener('dragstart', onDragStart);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('drop', onDrop);
    root.addEventListener('dragend', clearDrag);
    let resizeTimer = null;
    global.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(autosizeTitles, 120); });
    const btn = document.getElementById('btn-instances'), menu = document.getElementById('instances-menu');
    if (btn && menu) {
      btn.addEventListener('click', () => { menu.hidden = !menu.hidden; ensureLoaded(); renderNavMenu(); });
      menu.addEventListener('click', e => {
        const item = e.target.closest('[data-inst]'); if (!item) return;
        S.prefs.instanceId = Number(item.dataset.inst); S.ui.menu = null; menu.hidden = true;
        showInstancesView();
        ensureLoaded().then(() => { render(); renderNavMenu(); savePrefs(); });
      });
      document.addEventListener('click', e => { if (!menu.hidden && !e.target.closest('.in-navdd')) menu.hidden = true; });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  global.loadInstancesUserPreferences = loadInstancesUserPreferences;
  // Appelée par js/app.js après un rechargement des tables du widget : recalcule seulement si la page est déjà chargée.
  global.renderInstances = function () { if (S.loaded) { rebuild(); render(); renderNavMenu(); } };
  global.InstancesPage = {
    open: ensureLoaded, render, state: S, _setToday: iso => { todayOverride = iso; }, _setGfsTarget: target => { viewer.targetOverride = target; }, _gfs: viewer.gfs, _onGfsWrite: onGfsWrite, _init: init, _reset() {
      clearTimeout(renderTimer); renderTimer = null;
      S.loaded = false; S.loading = null; S.error = ''; S.store = null; S.model = null; S.view = null; S.drag = null;
      S.prefs = { instanceId: null, seances: {}, etape: 'macro', vue: 'A', odjVue: 'timing', cadre: defaultCadre(), invTri: '' }; S.prefsRowId = null; S.personId = 0; S.ui = { menu: null, settings: false, subs: {} };
      setRaw({}); dropGfs(); viewer.pdfKey = ''; viewer.token = null; viewer.mode = 'edit'; viewer.targetOverride = null;
      document.body.classList.remove('in-plein-body');
      const root = rootEl(); if (root) { root.classList.remove('in-plein'); root.innerHTML = ''; }
    }
  };
})(window);
