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
 * Mail d'invitation : le MÊME GFS (une seule iframe, jamais rechargée en passant d'une étape à l'autre) sous la carte de la date
 * d'envoi, pour rédiger et envoyer le mail avec le modèle Publipostage+ de l'instance (Instances.Modele_invitation).
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
  // Vue d'ensemble : le rail complet (variante C : les étapes 1 à 6 dans le fil) est la vue par défaut (Antoine, 12/11/2026). Le choix est retenu
  // dans Inst_vue_ensemble (l'ancienne colonne Inst_vue gardait « A » par simple défaut : elle n'est plus lue).
  const DEFAULT_VUE = 'C';
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
  // Étape Notifications : « Suivi » (le tableau d'avancement) ou « Relecture & envoi » (liste, mail et courrier côte à côte). Retenu par utilisateur
  // dans Inst_notif_vue ; la messagerie de la personne (Zimbra ou standard) dans Inst_messagerie.
  const NOTIF_VUES = ['suivi', 'relecture'];
  // Volet agrandi (retenu par utilisateur, Inst_notif_large) : '' (trois volets), 'mail' ou 'doc' (le courrier) ; l'autre volet se masque, la liste reste.
  const NOTIF_LARGE = ['', 'mail', 'doc'];
  let warmEnabled = true; // préparation des autres projets en arrière-plan (désactivée par les tests qui comptent les lectures)
  const NOTIF_SIGNEES = { tableId: 'Projets', colId: 'Notifications_Signees' };
  // Session de la vue « Relecture & envoi » : projet affiché, projets cochés, mail lu depuis le modèle Publipostage+ (une lecture par projet et par
  // modèle), nœud du courrier (PDF signé ou aperçu) conservé d'un rendu à l'autre, noms des modèles proposés dans le paramétrage.
  const newInvKind = () => ({ reader: null, readerNonce: -1, dock: null, ready: false, last: '' });
  // Session de l'étape « Mail d'invitation » : l'élément affiché ('usual' = les invités habituels, sinon l'identifiant d'un invité spécifique), le mail lu pour la
  // ligne affichée, le nœud d'état du volet (conservé d'un rendu à l'autre) et un lecteur Publipostage+ par table (séance, invité).
  const newInv = () => ({ sel: 'usual', nonce: 0, editing: false, mail: { key: '', status: '', draft: null, error: null }, node: null, watch: null, poll: null, key: '', active: '', fb: null, kinds: { usual: newInvKind(), guest: newInvKind() } });
  const newRev = () => ({ active: 0, checked: {}, busy: false, models: undefined, mail: { key: '', status: '', draft: null, error: null, nonce: 0 }, doc: { key: '', node: null, handle: null, nonce: 0, watch: null, reader: null, readerNonce: -1, ctx: null, want: false, dock: false, busy: false, poll: null, last: '' } });

  let todayOverride = null;
  const todayIso = () => todayOverride || (L.parisParts(Date.now() / 1000) || {}).date || new Date().toISOString().slice(0, 10);

  const S = {
    loaded: false, loading: null, error: '', errorHtml: '', raw: {}, store: null, model: null, defer: false, drag: null,
    prefs: { instanceId: null, seances: {}, etape: 'macro', vue: DEFAULT_VUE, odjVue: 'timing', cadre: defaultCadre(), invTri: '', notifVue: 'suivi', messagerie: '', notifLarge: '', notifProgs: [] }, prefsRowId: null, personId: 0,
    ui: { menu: null, settings: false, subs: {}, repShown: false, rev: newRev(), inv: newInv() }
  };

  // ---------------------------------------------------------------------------------------------
  // Icônes et petits utilitaires de rendu
  // ---------------------------------------------------------------------------------------------
  const SVG = {
    expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>', shrink: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>', vexpand: '<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>',
    more: '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>', chevron: '<path d="M6 9l6 6 6-6"/>', up: '<path d="M6 15l6-6 6 6"/>', plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M5 12l5 5L20 7"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', pin: '<path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    macro: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    funnel: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.8a3.5 3.5 0 010 6.4M18 14.3c2.2.6 3.5 2.4 3.5 5.7"/>',
    peopleAdd: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M19 8v6M16 11h6"/>',
    project: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M8 7v6M12 7v10M16 7v4"/>',
    clip: '<path d="M21 11l-9 9a5 5 0 01-7-7l9-9a3.5 3.5 0 015 5l-9 9a2 2 0 01-3-3l8-8"/>',
    refresh: '<path d="M20 12a8 8 0 11-2.3-5.7M20 4v5h-5"/>', copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>',
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
    download: '<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14"/>', upload: '<path d="M12 16V5M7.5 9L12 4.5 16.5 9M5 20h14"/>', pushpin: '<path d="M9 3.5h6l-1 6 3 3.5v2H7v-2l3-3.5zM12 15v5.5"/>', tick: '<circle cx="12" cy="12" r="9"/><path class="ck" d="M8 12l3 3 5-6"/>'
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
    S.model = D.buildModel(S.raw, { annuaire: tableOf('Annuaire'), postes: tableOf('Postes2'), projets: tableOf('Projets'), notifications: tableOf('Notifications'), programmes: tableOf('Programmes') });
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
      failed: err => { if (global.CoreUtils) global.CoreUtils.toastFailure(err, 'Enregistrement impossible', { what: 'modification dans la page Instances', page: 'Instances' }); reloadFromGrist(); }
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
        if (S.raw.Instances__error) throw Object.assign(new Error('table Instances introuvable (' + S.raw.Instances__error + ')'), { cause: S.raw.Instances__errorObj, gristAccess: { op: 'read', table: 'Instances' } });
        rebuild();
        S.loaded = true; S.error = ''; S.errorHtml = '';
      } catch (err) {
        S.error = "Page Instances indisponible : " + err.message + '. Il faut un droit d\'édition sur le document pour créer les tables de la page.';
        // Quelle table, quelle colonne, quel droit : l'explication complète remplace le texte générique (aucun appel Grist de plus).
        S.errorHtml = global.CoreAccess ? global.CoreAccess.errorHtml(err, { lead: 'Page Instances indisponible', what: 'ouverture de la page Instances (lecture, et création des tables Instance_*, Export_VP et des colonnes de Instances / Suivi_Instance)', page: 'Instances' }, { open: true }) : '';
        console.error('Page Instances :', err);
      } finally {
        S.loading = null;
        render();
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
      if (VARIANTS.indexOf(text(row.Inst_vue_ensemble)) >= 0) S.prefs.vue = text(row.Inst_vue_ensemble);
      if (ODJ_VUES.indexOf(text(row.Inst_odj_vue)) >= 0) S.prefs.odjVue = text(row.Inst_odj_vue);
      S.prefs.cadre = parseCadre(text(row.Inst_cadre));
      S.prefs.invTri = L.GUEST_TRI.test(text(row.Inst_tri_invites)) ? text(row.Inst_tri_invites) : '';
      S.prefs.notifVue = NOTIF_VUES.indexOf(text(row.Inst_notif_vue)) >= 0 ? text(row.Inst_notif_vue) : 'suivi';
      S.prefs.messagerie = text(row.Inst_messagerie) === 'zimbra' ? 'zimbra' : '';
      S.prefs.notifLarge = NOTIF_LARGE.indexOf(text(row.Inst_notif_large)) >= 0 ? text(row.Inst_notif_large) : '';
      try { const list = JSON.parse(text(row.Inst_notif_programmes) || '[]'); S.prefs.notifProgs = Array.isArray(list) ? list.filter(x => typeof x === 'string' && x) : []; } catch (err) { S.prefs.notifProgs = []; }
    } catch (err) {
      console.warn('Chargement des préférences Instances a échoué :', err.message);
    }
  }
  async function savePrefs() {
    if (!S.prefsRowId || !global.CoreGrist || !global.CoreGrist.gristInstance) return;
    try {
      await global.CoreGrist.gristInstance.docApi.applyUserActions([['UpdateRecord', PREFS_TABLE, S.prefsRowId, {
        Inst_instance: S.prefs.instanceId ? String(S.prefs.instanceId) : '', Inst_seances: JSON.stringify(S.prefs.seances),
        Inst_etape: S.prefs.etape, Inst_vue_ensemble: S.prefs.vue, Inst_odj_vue: S.prefs.odjVue, Inst_cadre: JSON.stringify(S.prefs.cadre), Inst_tri_invites: S.prefs.invTri,
        Inst_notif_vue: S.prefs.notifVue, Inst_messagerie: S.prefs.messagerie, Inst_notif_large: S.prefs.notifLarge, Inst_notif_programmes: JSON.stringify(S.prefs.notifProgs)
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
    V.rep = L.repVisibility(s.guests, S.ui.repShown); // colonne « Réponse » : masquée quand l'appel est fait pour tous (un tri par réponse ne s'applique alors pas, la colonne étant invisible)
    V.guestOrder = L.sortGuests(s.guests, !V.rep.column && /^reponse:/.test(S.prefs.invTri) ? '' : S.prefs.invTri, g => personOf(m, g.personneId).name, g => personOf(m, g.personneId).gradeKind);
    V.firstStart = g => L.firstStartOf(V.schedAll, g.id);
    V.rev = V.view === 'notifs' && S.prefs.notifVue === 'relecture' ? reviewModel(V) : null;
    return V;
  }
  // Vue « Relecture & envoi » : les projets reliés à la séance, avec l'état de leur notification (voir L.notifReviewState), et celui qui est affiché.
  function reviewModel(V) {
    const m = V.m;
    const items = V.ctx.projectIds.map(id => {
      const pr = projectOf(m, id), first = V.schedAll.find(r => r.p.projets.indexOf(id) >= 0);
      return { id, acro: pr.acro, titre: pr.titre, programme: pr.programme || '', state: L.notifReviewState(pr), signees: pr.signees || [], fileId: (pr.signees || [])[(pr.signees || []).length - 1] || 0, porteur: pr.porteurId ? personOf(m, pr.porteurId).name : '', when: first ? L.hhmm(first.start) : '' };
    });
    // Filtre par programme (demande d'Antoine du 27/11/2026) : les programmes présents dans la séance, et la sélection retenue par utilisateur (libellés). Sans programme : « Sans programme ».
    const programmes = Array.from(new Set(items.map(i => i.programme || NO_PROGRAMME))).sort((a, b) => (a === NO_PROGRAMME) - (b === NO_PROGRAMME) || a.localeCompare(b, 'fr'));
    const chosen = S.prefs.notifProgs, shown = chosen.length ? items.filter(i => chosen.indexOf(i.programme || NO_PROGRAMME) >= 0) : items;
    return { all: items, items: shown, programmes, chosen, cur: L.pickReviewItem(shown, S.ui.rev.active), drafts: shown.filter(i => i.state === 'draft') };
  }
  const NO_PROGRAMME = 'Sans programme';
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
  // Choix de l'instance dans le bandeau (Antoine, 16/11/2026) : un bouton par instance principale (CTO Innovation, Comité innovation), l'instance
  // choisie en bleu, et une icône « Autres instances » (COPIL, COT, plus tard) ; une autre instance choisie prend la place d'un bouton. Même ligne
  // que l'ancien badge : aucune place verticale de plus. Groupe de boutons radio : flèches gauche/droite pour passer de l'un à l'autre.
  function instSwitchHtml(V) {
    const { m, inst } = V;
    const shown = m.instancesMain.concat(m.instancesOthers.indexOf(inst) >= 0 ? [inst] : []);
    let h = '<div class="instsw" role="radiogroup" aria-label="Instance">' + shown.map(i => i.id === inst.id
      ? '<button type="button" role="radio" aria-checked="true" class="inst-badge" data-instopt tabindex="0" title="Instance affichée">' + esc(i.nom) + '</button>'
      : '<button type="button" role="radio" aria-checked="false" class="inst-opt" data-instopt tabindex="-1" ' + da('inst-pick', { id: i.id }) + '>' + esc(i.nom) + '</button>').join('');
    h += '<div class="rel"><button type="button" class="ibtn instmore' + (isOpen('inst') ? ' on' : '') + '" title="Autres instances" aria-label="Autres instances" aria-haspopup="menu" aria-expanded="' + (isOpen('inst') ? 'true' : 'false') + '" ' + da('menu', { v: 'inst' }) + '>' + ic('more') + '</button>';
    if (isOpen('inst')) {
      h += '<div class="menu" data-inst-menu style="min-width:230px">' + (m.instancesOthers.length
        ? m.instancesOthers.map(i => '<button type="button" class="mi ' + (i.id === inst.id ? 'on' : '') + '" ' + da('inst-pick', { id: i.id }) + '><span>' + esc(i.nom) + '</span><span class="mi-sub">' + i.cfg.steps.length + ' étapes</span></button>').join('')
        : '<div class="mh" style="text-transform:none;letter-spacing:0;font-weight:600;line-height:1.4;padding:8px 11px">Pas d\'autre instance pour l\'instant : COPIL et COT viendront plus tard</div>') + '</div>';
    }
    return h + '</div></div>';
  }
  function bandHtml(V) {
    const { m, inst, s } = V;
    const fold = !!(s && S.prefs.cadre.bandeau);
    let h = '<section class="band' + (fold ? ' fold' : '') + '" aria-label="Séance et étapes">' + instSwitchHtml(V);
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
      h += timeMenu('heure', s.heure, 'heure', '', 6 * 60, 20 * 60, false, '<div class="mform" style="grid-column:1/-1">' + DateInput.markup({ cls: 'dp', iso: s.date, aria: 'Date de la séance', attrs: 'data-chg="seance-date"' }) + '</div>');
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
    const nUnconf = s.guests.filter(g => !L.hasAnswered(g)).length; // ni réponse à l'invitation ni appel : présence encore inconnue
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
      // Jalons nommés par ce qu'ils attestent (Antoine, 12/11/2026) : « ODJ validé », « Présence invités confirmée », « Timing envoyé aux invités » ;
      // le numéro et l'ouverture au clic restent ceux de l'étape (ordre du jour, invités, mail d'invitation).
      if (x.key === 'odj') return thr('odj', num, 'ODJ validé', plural(s.points.length, 'point', 'points') + ' · ' + spanTxt, '', nConf ? plural(nConf, 'conflit de disponibilité', 'conflits de disponibilité') : 'Aucun conflit', { warn: nConf > 0 || V.over });
      if (x.key === 'invites') return thr('invites', num, 'Présence invités confirmée', s.guests.length ? (s.guests.length - nUnconf) + '/' + s.guests.length + ' confirmés' : 'Aucun invité', s.guests.length ? '' : 'dim', s.guests.length ? plural(nYes, 'viendra', 'viendront') + ' · ' + plural(nNo, 'excusé', 'excusés') + (nUnconf ? ' · ' + nUnconf + ' à confirmer' : '') : '', { warn: nUnconf > 0 && s.guests.length > 0 });
      if (x.key === 'invitation') return thr('invitation', num, "Mail d'invitation", s.mailInvitationLe ? L.fmtDate(s.mailInvitationLe) : 'À envoyer', s.mailInvitationLe ? '' : 'dim', nWritten + '/' + s.guests.length + ' écrites', { pct: writtenPct });
      if (x.key === 'cr') return thr('cr', num, 'Compte rendu', s.v0 ? 'V0 rédigée' : 'V0 à rédiger', s.v0 ? '' : 'dim', s.crPdf.length ? 'PDF exporté' : 'PDF à exporter', { tags: cfg.relecteurs.map(pid => { const r = s.relectures[pid]; return { name: L.shortName(personOf(m, pid).name), cls: r ? (r.statut === 'valide' ? 'ok' : 'blue') : 'todo' }; }) });
      if (x.key === 'crmail') return thr('crmail', num, 'Envoi du CR', s.mailCrLe ? L.fmtDate(s.mailCrLe) : 'À envoyer', s.mailCrLe ? '' : 'dim', plural(s.guests.length, 'destinataire', 'destinataires'));
      return thr('notifs', num, 'Notifications', projIds.length ? toSend.length + ' à mettre à dispo' : 'Aucun projet', projIds.length ? '' : 'dim', nWait + ' en attente · ' + plural(nSigned, 'signée', 'signées'), projIds.length ? { pct: Math.round(100 * nSigned / projIds.length) + '%' } : {});
    });
    // « Timing envoyé aux invités » : jalon sans étape propre (les horaires de passage s'envoient dans l'étape Invités, colonne horloge) ;
    // placé juste après le mail d'invitation. Fait quand TOUS les horaires à envoyer l'ont été (et aucun n'est à renvoyer après un changement).
    const timingAt = all.findIndex(x => x.key === 'invitation');
    if (timingAt >= 0) {
      const nStale = s.guests.filter(g => L.horaireState(g, V.firstStart(g)) === 'stale').length;
      const timingDone = horTot > 0 && horOk === horTot;
      all.splice(timingAt + 1, 0, { key: 'timing', go: V.active.some(x => x.key === 'invites') ? 'invites' : 'invitation', num: '', icon: 'clock', title: 'Timing envoyé aux invités', done: timingDone, cls: timingDone ? 'done' : 'todo', warn: nStale > 0,
        value: horTot ? horOk + '/' + horTot + ' envoyés' : 'Aucun horaire', valueCls: horTot ? '' : 'dim', sub: nStale ? plural(nStale, 'à renvoyer (horaire modifié)', 'à renvoyer (horaire modifié)') : (horTot && timingDone ? 'Tous les horaires de passage' : 'Horaires de passage'), pct: horTot ? Math.round(100 * horOk / horTot) + '%' : '' });
    }
    const items = vue === 'C' ? all : all.filter(x => x.key !== 'odj' && x.key !== 'invites');
    if (items.length) {
      h += '<div class="thread" role="list" aria-label="Progression de la séance">' + items.map(mi => '<button type="button" role="listitem" class="ms ' + mi.cls + (mi.icon ? ' sub' : '') + '" ' + da('step', { v: mi.go || mi.key }) + '><span class="msn">' + (mi.done ? ic('check', 'xs') : (mi.icon ? ic(mi.icon, 'xs') : mi.num)) + '</span><span class="msb"><span class="msl">' + esc(mi.title) + (mi.warn ? '<span class="wdot"></span>' : '') + '</span><span class="msv ' + mi.valueCls + '">' + esc(mi.value) + '</span><span class="mss">' + esc(mi.sub) + '</span>'
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
    const defaultIds = defaultGuestIds(V.inst); // invités par défaut de l'instance : un présentateur qui n'en fait pas partie est aussi ajouté aux invités
    const lkHas = p.lienType === 'gfs' ? !!m.gfsByIdent[p.lien] : !!p.lien;
    const tone = 't-' + p.nature + (isSub ? ' sub' : ''); // couleur de mise en valeur : validation et discussion ; information = couleur par défaut
    const lockTip = 'Passez en vue Timing pour changer l\'ordre de passage';
    const subCount = isSub ? 0 : (row.subRows || []).length, subsOpen = !isSub && !!S.ui.subs[p.id];
    const foldTip = subCount ? (subsOpen ? 'Replier' : 'Déplier') + ' les sous-points (' + subCount + ')' + (row.subOver ? ' — ils durent ' + L.durTxt(row.subOver) + ' de plus que le point' : '') : 'Ajouter des sous-points à ce point';
    const fold = isSub ? '' : '<button type="button" class="subtog ' + (subsOpen ? 'on ' : '') + (row.subOver ? 'over' : '') + '" title="' + esc(foldTip) + '" aria-label="' + esc(foldTip) + '" aria-expanded="' + (subsOpen ? 'true' : 'false') + '" ' + da('sub-toggle', { id: p.id }) + '>' + ic('chevron', 'xs') + (subCount ? '<span class="subn">' + subCount + '</span>' : '') + '</button>';
    return '<div class="pt pc ' + tone + (msgs.length ? ' flag' : '') + '" data-pt="' + p.id + '"' + (isSub ? ' data-sub="' + par.p.id + '"' : '') + '><div class="grip">'
      + (locked ? '<span class="gripbtn locked" title="' + lockTip + '">' + ic('dots', '', 'dots') + '</span>'
        : (isSub ? '<span class="gripbtn nodrag" aria-hidden="true"></span>' : '<span class="gripbtn" draggable="true" data-drag="' + p.id + '" title="Glisser pour changer l\'ordre">' + ic('dots', '', 'dots') + '</span>'))
      + '<span style="display:inline-flex;flex-direction:column"><button type="button" class="ibtn" style="height:14px;width:16px" aria-label="Monter le ' + kind + '" ' + (locked ? 'title="' + lockTip + '" disabled ' : (i === 0 ? 'disabled ' : '')) + da('pt-up', { id: p.id }) + '>' + ic('up', 'xs') + '</button>'
      + '<button type="button" class="ibtn" style="height:14px;width:16px" aria-label="Descendre le ' + kind + '" ' + (locked ? 'title="' + lockTip + '" disabled ' : (i === n - 1 ? 'disabled ' : '')) + da('pt-down', { id: p.id }) + '>' + ic('chevron', 'xs') + '</button></span></div>'
      + '<div class="ptime' + (isSub && row.end === row.start ? ' pend' : '') + '"><b>' + L.hhmm(row.start) + '</b>' + (isSub && row.end === row.start ? '' : '<u>–</u><i>' + L.hhmm(row.end) + '</i>') + (msgs.length ? '<span style="color:var(--warn);display:inline-flex" title="' + esc(msgs.join(' · ')) + '">' + ic('warn', 's') + '</span>' : '') + '</div>'
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
      + (presOpen ? '<div class="menu" style="min-width:300px">' + filterInput('Rechercher une personne…') + m.people.map(pp => '<button type="button" class="mi ' + (p.presentateurs.indexOf(pp.id) >= 0 ? 'on' : '') + '" ' + da('pt-pres', { id: p.id, v: pp.id }) + ftAttr(pp.search) + '><span class="mi-main"><span>' + esc(pp.name) + '</span><span class="mi-sub">' + esc(L.cut(pp.poste, 44)) + '</span></span><span class="mi-sub">' + (p.presentateurs.indexOf(pp.id) >= 0 ? 'présente' : (defaultIds.indexOf(pp.id) < 0 && !s.guests.some(x => x.personneId === pp.id) ? 'ajout aux invités' : '')) + '</span></button>').join('') + (m.people.length ? '' : '<div class="mh">— Aucune personne —</div>') + '</div>' : '') + '</div></div>'
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
    // Bouton œil de l'en-tête « Appel du jour » : affiche les réponses à l'invitation même pour les personnes déjà appelées (utile seulement quand
    // au moins un appel est fait, c'est-à-dire quand quelque chose est masqué).
    const repToggle = (s.guests.some(g => g.appel) || S.ui.repShown)
      ? '<button type="button" class="ibtn hrep ' + (S.ui.repShown ? 'on' : '') + '" aria-pressed="' + (S.ui.repShown ? 'true' : 'false') + '" title="' + (S.ui.repShown ? 'Masquer les réponses des personnes déjà appelées' : 'Afficher les réponses à l\'invitation (masquées pour les personnes déjà appelées)') + '" aria-label="Réponses à l\'invitation" ' + da('rep-show') + '>' + ic('eye', 's') + '</button>' : '';
    h += '<div class="gwrap' + (V.rep.column ? '' : ' norep') + '"><div class="grow head"><div>' + sortHead('nom', 'Personne', 'A → Z', 'Z → A') + '</div><div>Sujets</div><div title="Invitation écrite">' + ic('mail', 's') + '</div><div title="Horaire de passage envoyé">' + ic('clock', 's') + '</div>' + (V.rep.column ? '<div>' + sortHead('reponse', 'Réponse', 'viendra d\'abord', 'excusés d\'abord') + '</div>' : '')
      + '<div>Créneau de présence<span class="help" tabindex="0">' + ic('ask', 's') + '<span class="bubble">Heure d\'arrivée et de départ. Vide : disponible toute la séance. Les boutons ronds posent en un clic le début ou la fin de l\'instance. Un point relié à la personne passe en orange s\'il sort du créneau.</span></span></div><div>Commentaire</div><div class="hcall">' + sortHead('appel', 'Appel du jour', 'présents d\'abord', 'absents d\'abord') + repToggle + '</div><div></div></div>';
    // Deux listes : les invités spécifiques (ajoutés sur un point, VP en premier) à part en tête, puis les invités habituels ; les titres de
    // section n'apparaissent que s'il y a des invités spécifiques (aucune place perdue sinon).
    let lastGroup = '';
    V.guestOrder.forEach(g => {
      const grp = g.origine === 'point' ? 'spec' : 'usual';
      if (nSpecial && grp !== lastGroup) {
        h += grp === 'spec'
          ? '<div class="gsec spec" title="Personnes ajoutées sur un point de l\'ordre du jour ; les VP d\'abord, puis les directeur.trice.s d\'établissement">' + ic('star', 's') + 'Invités spécifiques<span class="tag-soft">' + nSpecial + '</span></div>'
          : '<div class="gsec usual" title="Liste permanente de l\'instance et composition">Invités habituels<span class="tag-soft">' + (s.guests.length - nSpecial) + '</span></div>';
      }
      lastGroup = grp;
      const person = personOf(m, g.personneId);
      const sujets = V.schedAll.filter(row => row.p.invites.indexOf(g.id) >= 0).map(row => {
        const clash = L.guestClash(g, row.start, row.end, person.name);
        return { time: L.hhmm(row.start), label: L.cut(row.p.titre, 30), title: row.p.titre + (clash ? ' — ' + clash : ''), warn: !!clash };
      });
      const fs0 = V.firstStart(g), hs = L.horaireState(g, fs0);
      const horTip = hs === 'none' ? 'Aucun point : pas d\'horaire de passage' : (hs === 'stale' ? 'Horaire modifié depuis l\'envoi : ' + g.passageHeure + ' devient ' + fs0 + ' (cliquer pour marquer le nouvel horaire envoyé)' : (hs === 'sent' ? 'Horaire ' + g.passageHeure + ' envoyé le ' + L.fmtDate(g.passageLe) + ' (cliquer pour effacer)' : 'Horaire de passage ' + fs0 + ' pas encore envoyé (cliquer pour marquer envoyé)'));
      // Une fois l'appel fait, la réponse à l'invitation disparaît de la ligne : elle reste lisible au survol des boutons d'appel.
      const repWas = g.appel && !V.rep.cell(g) ? ' — avait répondu : ' + ({ viendra: 'viendra', excuse: 'excusé(e)', attente: 'à confirmer' }[g.reponse] || 'à confirmer') : '';
      const ecritTip = g.ecritLe ? 'Écrit le ' + L.fmtDate(g.ecritLe) + ' (cliquer pour effacer)' : 'Pas encore écrit (cliquer pour marquer écrit aujourd\'hui)';
      const tp = (field, scope, value) => {
        const key = 't:' + g.id + ':' + scope;
        return '<div class="rel"><button type="button" class="tp ' + (value ? '' : 'empty') + '" ' + da('menu', { v: key }) + ' aria-label="' + field + '">' + (value || '--:--') + '</button>' + (isOpen(key) ? timeMenu(key, value, 'g-' + scope, g.id, V.startMin, V.endMin, true) : '') + '</div>';
      };
      // Une ligne d'invité tient TOUJOURS sur une seule ligne : nom et poste côte à côte (le poste se tronque, texte complet au survol), sujets en rang.
      // la couleur de la ligne suit la présence prévue (réponse à l'invitation) : vert = viendra, rouge = excusé, blanc = à confirmer ; une fois l'appel fait,
      // elle suit la présence constatée (présent = vert, absent = rouge) ; un conflit de créneau = barre orange à gauche
      h += '<div class="grow ' + (sujets.some(x => x.warn) ? 'flag ' : '') + (g.appel ? (g.appel === 'present' ? 'rep-ok' : 'rep-no') : (g.reponse === 'viendra' ? 'rep-ok' : (g.reponse === 'excuse' ? 'rep-no' : ''))) + '"><div class="pcell" title="' + esc(person.name + (person.poste ? ' — ' + person.poste : '') + (person.gradeKind ? ' (' + gradeLabel(person) + ')' : '')) + '"><div class="pname">' + (g.origine === 'point' ? ic('star', 's') : '') + '<span class="pn">' + esc(person.name) + '</span>'
        + (person.gradeKind ? '<span class="gbadge ' + gradeClass(person) + '">' + (person.gradeKind === 'vp' ? 'VP' : 'Dir.') + '</span>' : '') + '</div><div class="psub">' + esc(person.poste) + '</div></div>'
        + '<div class="group sjrow" title="' + esc(sujets.map(sj => sj.time + ' · ' + sj.title).join('\n')) + '">' + sujets.map(sj => '<span class="tag plain sj ' + (sj.warn ? 'warn' : '') + '" title="' + esc(sj.title) + '">' + sj.time + ' · ' + esc(sj.label) + '</span>').join('') + '</div>'
        + '<div><button type="button" class="ib ' + (g.ecritLe ? 'on' : '') + '" title="' + esc(ecritTip) + '" aria-label="' + esc(ecritTip) + '" ' + da('g-ecrit', { id: g.id }) + '>' + ic('mail') + '</button></div>'
        + '<div><button type="button" class="ib ' + (hs === 'stale' ? 'warn' : (hs === 'sent' ? 'on' : '')) + '" title="' + esc(horTip) + '" aria-label="' + esc(horTip) + '" ' + (hs === 'none' ? 'disabled ' : '') + da('g-hor', { id: g.id }) + '>' + ic('clock') + '</button></div>'
        + (V.rep.column ? (V.rep.cell(g) ? '<div class="seg-i" role="group" aria-label="Réponse à l\'invitation">' + [['attente', 'ask', 'ask', 'À confirmer'], ['viendra', 'check', 'ok', 'Viendra'], ['excuse', 'no', 'no', 'Excusé(e)']].map(r => '<button type="button" class="' + (g.reponse === r[0] ? 'on ' + r[2] : '') + '" title="' + r[3] + '" aria-label="' + r[3] + '" ' + da('g-rep', { id: g.id, v: r[0] }) + '>' + ic(r[1], 's') + '</button>').join('') + '</div>' : '<div class="repgone"></div>') : '')
        + '<div class="dispo"><button type="button" class="ib ' + (g.dispoDe === s.heure ? 'on' : '') + '" title="Dès le début de l\'instance" aria-label="Dès le début de l\'instance" ' + da('g-start', { id: g.id }) + '>' + ic('start', 's') + '</button>'
        + tp('Arrivée', 'de', g.dispoDe) + '<span class="muted">–</span>' + tp('Départ', 'a', g.dispoA)
        + '<button type="button" class="ib ' + (g.dispoA === endTxt ? 'on' : '') + '" title="Jusqu\'à la fin de l\'instance" aria-label="Jusqu\'à la fin de l\'instance" ' + da('g-end', { id: g.id }) + '>' + ic('end', 's') + '</button></div>'
        + '<div><input type="text" class="inp ghost" style="width:100%" placeholder="Commentaire" aria-label="Commentaire" value="' + esc(g.commentaire) + '" data-chg="g-comm" data-id="' + g.id + '"></div>'
        + '<div class="seg-i" role="group" aria-label="Appel du jour">' + [['present', 'check', 'ok', 'Présent(e)'], ['absent', 'x', 'no', 'Absent(e)']].map(r => '<button type="button" class="' + (g.appel === r[0] ? 'on ' + r[2] : '') + '" title="' + esc(r[3] + repWas) + '" aria-label="' + r[3] + '" ' + da('g-appel', { id: g.id, v: r[0] }) + '>' + ic(r[1], 's') + '</button>').join('') + '</div>'
        // Corbeille pour TOUS les invités (un invité repris par erreur de la liste permanente ou de la composition doit pouvoir être retiré de la
        // séance) ; la liste permanente de l'instance (paramétrage) n'est pas touchée.
        + '<div><button type="button" class="ibtn" aria-label="' + (g.origine === 'point' ? 'Retirer de la liste' : 'Retirer de cette séance') + '" title="' + (g.origine === 'point' ? 'Retirer de la liste' : 'Retirer de cette séance (la liste permanente de l\'instance n\'est pas modifiée)') + '" ' + da('g-del', { id: g.id }) + '>' + ic('trash', 's') + '</button></div></div>';
    });
    return h + '</div>';
  }

  // Étape « Envoi du CR » : le modèle (rappel de ce que GFS doit ouvrir), la date d'envoi et « Envoyé aujourd'hui ». (L'étape Invitation a sa propre vue : invitationHtml.)
  function dateCard(V) {
    const s = V.s, model = V.cfg.modCr;
    return '<div class="card">' + ic('send') + '<span class="tag proj plain" title="Modèle Publipostage+ (GFS)">' + esc(model || '— Choisir —') + '</span><span class="sp"></span>'
      + DateInput.markup({ cls: 'dp', iso: s.mailCrLe, aria: "Date d'envoi du mail du compte rendu", attrs: 'data-chg="crm-date"' })
      + '<button type="button" class="rbtn" title="Envoyé aujourd\'hui" aria-label="Envoyé aujourd\'hui" ' + da('crm-today') + '>' + ic('calCheck') + '</button></div>';
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
    // Le PDF est exporté depuis GFS (une fois le compte rendu bien relu) puis déposé dans la vue « PDF exporté » ci-dessous (Suivi_Instance.CR_PDF).
    return h + '<span class="sp"></span><button type="button" class="pillbtn" ' + (hasPdf ? '' : 'disabled ') + 'title="' + esc(hasPdf ? 'Télécharger le PDF du compte rendu' : 'Pas encore de PDF : déposez-le dans la vue « PDF exporté » ci-dessous (ou exportez-le depuis GFS dans la colonne ' + CR_PDF_COLUMN + ' de Suivi_Instance)') + '" ' + da('cr-download') + '>' + ic('download', 's') + 'Télécharger le CR</button></div>';
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


  // ---------------------------------------------------------------------------------------------
  // Notifications : vue « Relecture & envoi » (Antoine, 23/11/2026) — liste à cocher | e-mail | courrier, côte à côte.
  //  - Le mail est lu dans le modèle e-mail de Publipostage+ de l'instance (VisaMail.prepare : texte brut, comme le mailto: l'impose), jamais deviné ;
  //    « Ouvrir dans ma messagerie » ouvre le brouillon, « Copier » copie l'objet et le corps. Aucune pièce jointe possible : le PDF se glisse à la main.
  //  - Le courrier est l'aperçu du modèle « document » de Publipostage+ tant que la colonne PJ « Notifications signées » du projet est vide ; dès qu'elle
  //    est remplie (le document signé que dépose Antoine), c'est cette pièce jointe qui s'ouvre (visionneuse PDF du widget), plus la version Publipostage+.
  //  - La page n'écrit rien dans Notifications : le statut « Transmise au porteur » reste posé à la main dans Grist.
  //  - « Tout générer (n) » : ouvre les courriers cochés (« À signer ») dans une page à imprimer ou à enregistrer en PDF, pour les faire signer.
  // ---------------------------------------------------------------------------------------------
  const reviewErrorText = err => (!err ? 'erreur inconnue'
    : err.code === 'models-table-missing' ? 'la table des modèles de Publipostage+ n\'a pas pu être lue (' + global.CoreUtils.failureReason(err.detail || err.message, { op: 'read', table: 'Publipostage_Templates' }) + ')'
      : err.code === 'model-missing' ? err.message + ' : choisissez-en un autre dans le paramétrage de l\'instance'
        : global.CoreUtils.failureReason(err, { what: 'lecture du mail du projet' }) || 'erreur inconnue');
  const vemptyHtml = (title, detail, extra) => '<div class="vempty"><span>' + esc(title) + '</span>' + (detail ? '<span class="muted">' + esc(detail) + '</span>' : '') + (extra || '') + '</div>';

  // Lit le mail du projet affiché dans son modèle ; une lecture par (projet, modèle, messagerie), relancée par le bouton « Relire ».
  function ensureMail(V) {
    const R = S.ui.rev.mail, cur = V.rev && V.rev.cur, model = V.cfg.modNotif;
    if (!cur || !model || !global.VisaMail) return;
    const key = [cur.id, model, S.prefs.messagerie, R.nonce].join('|');
    if (R.key === key) return;
    R.key = key; R.status = 'loading'; R.draft = null; R.error = null;
    // `cache` : les lectures de Grist et les résultats déjà prêts sont gardés (Publipostage+ n'est relu qu'au bouton « Relire » ou quand les données changent).
    const args = { project: { id: cur.id }, modelName: model, client: S.prefs.messagerie, now: () => new Date(), cache: true };
    const ready = global.VisaMail.peek && global.VisaMail.peek('mail', args);
    if (ready) { R.status = 'ok'; R.draft = ready; return; } // déjà lu : rien à attendre entre deux projets
    global.VisaMail.prepare(args).then(draft => {
      if (R.key !== key) return;
      R.status = 'ok'; R.draft = draft; render();
    }).catch(err => {
      if (R.key !== key) return;
      R.status = 'error'; R.error = err; render();
    });
  }
  function ensureModelNames() {
    const R = S.ui.rev;
    if (R.models !== undefined || !global.VisaMail) return;
    R.models = null; // lecture en cours
    global.VisaMail.modelOverview()
      .then(o => { R.models = o; if (S.ui.settings) render(); })
      .catch(err => { R.models = { mail: [], letter: [], macros: [], total: 0, counts: {}, error: err }; if (S.ui.settings) render(); });
  }

  function notifVueSeg(V) {
    const n = V.ctx.projectIds.filter(id => L.notifReviewState(projectOf(V.m, id)) !== 'sent').length, on = S.prefs.notifVue;
    const btn = (key, inner) => '<button type="button" class="' + (on === key ? 'on' : '') + '" aria-pressed="' + (on === key ? 'true' : 'false') + '" ' + da('notif-vue', { v: key }) + '>' + inner + '</button>';
    return '<div class="seg" role="group" aria-label="Affichage des notifications">' + btn('suivi', 'Suivi') + btn('relecture', 'Relecture &amp; envoi' + (n ? '<span class="nbadge">' + n + '</span>' : '')) + '</div>';
  }

  // Filtre par programme de la vue « Relecture & envoi » : dans l'en-tête de l'étape, à côté de « Suivi | Relecture & envoi » (aucune ligne de plus), seulement quand la séance
  // compte plusieurs programmes ou qu'un filtre est actif. Multi-sélection, retenue par utilisateur (Preferences_Widget.Inst_notif_programmes) ; vide = tous.
  function notifProgHtml(V) {
    const rv = V.rev; if (!rv || (rv.programmes.length < 2 && !rv.chosen.length)) return '';
    const key = 'revprog', open = isOpen(key), n = rv.chosen.length;
    const label = !n ? 'Programmes' : (n === 1 ? rv.chosen[0] : n + ' programmes'), count = name => rv.all.filter(i => (i.programme || NO_PROGRAMME) === name).length;
    const shown = rv.programmes.concat(rv.chosen.filter(x => rv.programmes.indexOf(x) < 0)); // un programme retenu qui n'est plus dans cette séance reste décochable
    return '<div class="rel"><button type="button" class="pillbtn ghost progbtn ' + (n ? 'on' : '') + '" aria-haspopup="true" aria-expanded="' + (open ? 'true' : 'false') + '" title="' + esc(n ? 'Programmes affichés : ' + rv.chosen.join(', ') : 'Filtrer les notifications par programme') + '" ' + da('menu', { v: key }) + '>'
      + ic('funnel', 's') + '<span class="plabel">' + esc(label) + '</span>' + (n ? '<span class="nbadge">' + rv.items.length + '/' + rv.all.length + '</span>' : '') + '</button>'
      + (open ? '<div class="menu" role="listbox" aria-multiselectable="true"><button type="button" class="mi ' + (n ? '' : 'on') + '" role="option" aria-selected="' + (n ? 'false' : 'true') + '" ' + da('rev-prog-all') + '><span>Tous les programmes</span><span class="mi-sub">' + rv.all.length + '</span></button>'
        + shown.map(name => { const on = rv.chosen.indexOf(name) >= 0; return '<button type="button" class="mi ' + (on ? 'on' : '') + '" role="option" aria-selected="' + (on ? 'true' : 'false') + '" ' + da('rev-prog', { v: name }) + '><span>' + esc(name) + '</span><span class="mi-sub">' + count(name) + '</span></button>'; }).join('') + '</div>' : '') + '</div>';
  }
  function reviewListPane(V) {
    const R = S.ui.rev, rv = V.rev, cur = rv.cur;
    const nChecked = rv.drafts.filter(i => R.checked[i.id]).length, all = rv.drafts.length > 0 && nChecked === rv.drafts.length;
    let h = '<div class="rpane rlist"><div class="rhead"><input type="checkbox" class="rcb" ' + (all ? 'checked ' : '') + (rv.drafts.length ? '' : 'disabled ') + 'data-chg="rev-all" aria-label="Cocher toutes les notifications à signer"><strong>Notifications de la séance</strong></div><ul class="rrows">';
    rv.items.forEach(i => {
      const lab = L.NOTIF_REVIEW_LABEL[i.state], on = i.id === cur.id;
      const lead = i.state === 'draft'
        ? '<input type="checkbox" class="rcb" ' + (R.checked[i.id] ? 'checked ' : '') + 'data-chg="rev-check" data-id="' + i.id + '" aria-label="Cocher ' + esc(i.acro) + '">'
        : '<span class="rlead ' + (i.state === 'signed' ? 'ok' : '') + '" title="' + esc(lab.tip) + '">' + ic(i.state === 'signed' ? 'clip' : 'check', 's') + '</span>';
      h += '<li class="rrow' + (on ? ' on' : '') + '">' + lead + '<button type="button" class="rpick" aria-pressed="' + (on ? 'true' : 'false') + '" ' + da('rev-pick', { id: i.id }) + '><strong>' + esc(i.acro) + '</strong><span class="psub">' + esc([i.porteur, i.when].filter(Boolean).join(' · ')) + '</span></button>'
        + '<span class="nst ' + (i.state === 'signed' ? 'ok' : (i.state === 'draft' ? 'cur' : 'grey')) + '" title="' + esc(lab.tip) + '">' + lab.short + '</span></li>';
    });
    return h + '</ul><div class="rfoot"><span class="psub">' + (nChecked ? plural(nChecked, 'cochée', 'cochées') : 'Aucune cochée') + '</span><span class="sp"></span>'
      + '<button type="button" class="pillbtn ghost" ' + (nChecked && !R.busy ? '' : 'disabled ') + 'title="Ouvre les courriers cochés dans une page à imprimer ou à enregistrer en PDF, pour les faire signer" ' + da('rev-generate') + '>' + ic('fileLines', 's') + (R.busy ? 'Préparation…' : 'Tout générer (' + nChecked + ')') + '</button></div></div>';
  }

  function reviewMailPane(V) {
    const R = S.ui.rev, mail = R.mail, cur = V.rev.cur, model = V.cfg.modNotif, signed = cur.state !== 'draft';
    ensureMail(V);
    let h = '<div class="rpane rmail"><div class="rhead">' + ic('mail', 's') + '<strong>E-mail</strong><span class="rbadge viol" title="Aperçu du modèle Publipostage+ en lecture seule : le modèle se modifie dans GFS">' + ic('eye', 'xs') + 'Mode lecture</span>'
      + (model ? '<span class="psub rmodel" title="Modèle e-mail de Publipostage+">' + esc(model) + '</span>' : '') + '<span class="sp"></span>'
      + (model ? '<label class="rzim" title="Zimbra lit le lien du brouillon autrement : le widget l\'adapte"><input type="checkbox" ' + (S.prefs.messagerie === 'zimbra' ? 'checked ' : '') + 'data-chg="rev-zimbra">Zimbra</label>' : '')
      + '<button type="button" class="ibtn" title="Relire les données des projets et le modèle" aria-label="Relire les données" ' + da('rev-refresh') + '>' + ic('refresh', 's') + '</button>' + editModelButton('mail', model) + bigButton('mail') + '</div>';
    if (!model) return h + vemptyHtml('Aucun modèle de mail choisi', 'Choisissez-le dans le paramétrage de l\'instance : un modèle de type e-mail de Publipostage+.', '<button type="button" class="pillbtn" ' + da('settings-open') + '>' + ic('sliders', 's') + 'Paramétrage</button>') + '</div>';
    if (mail.status === 'loading' || !mail.status) return h + vemptyHtml('Lecture du modèle…') + '</div>';
    if (mail.status === 'error') return h + vemptyHtml('Mail indisponible', reviewErrorText(mail.error)) + '</div>';
    const d = mail.draft, f = d.fields;
    const row = (k, v) => '<span class="k">' + k + '</span><span class="v">' + v + '</span>';
    h += '<div class="rfields">' + row('À', f.to ? esc(f.to) : '<span class="muted">—</span>') + (f.cc ? row('Cc', esc(f.cc)) : '') + (f.bcc ? row('Cci', esc(f.bcc)) : '') + row('Objet', '<strong>' + esc(f.subject) + '</strong>')
      + row('Pièce jointe', '<span class="rpj">' + ic('clip', 's') + 'À glisser manuellement dans l\'email depuis Zimbra</span>') + '</div>';
    if (d.issues.length) h += '<ul class="rissues" role="status">' + d.issues.map(x => '<li>' + esc(global.VisaMail.issueText(x)) + '</li>').join('') + '</ul>';
    h += '<pre class="rbody">' + esc(d.bodyText) + '</pre><div class="rfoot"><button type="button" class="pillbtn" ' + (signed ? '' : 'disabled ') + 'title="' + (signed ? 'Ouvre le brouillon dans votre messagerie' : 'Disponible une fois la notification signée') + '" ' + da('rev-open') + '>' + ic('mail', 's') + 'Ouvrir dans ma messagerie</button>'
      + '<button type="button" class="pillbtn ghost" ' + (signed ? '' : 'disabled ') + 'title="' + (signed ? 'Copie l\'objet et le corps du mail' : 'Disponible une fois la notification signée') + '" ' + da('rev-copy') + '>' + ic('copy', 's') + 'Copier</button>'
      + (signed ? '' : '<span class="psub">Disponible une fois la notification signée</span>') + '</div></div>';
    return h;
  }

  function reviewDocPane(V) {
    const cur = V.rev.cur, signed = cur.state !== 'draft';
    let fileName = '';
    if (signed && cur.fileId && global.CoreAttachments) {
      fileName = global.CoreAttachments.nameOf(cur.fileId);
      if (!fileName) global.CoreAttachments.ensureNames([cur.fileId]).then(changed => { if (changed) render(); });
    }
    return '<div class="rpane rdoc"><div class="rhead">' + ic('fileLines', 's') + '<strong>' + (signed ? 'Notification signée' : 'Courrier de notification') + '</strong>'
      + (signed ? '<span class="rbadge ok">' + ic('clip', 'xs') + 'PJ signée</span>' : '<span class="rbadge viol" title="Aperçu du modèle Publipostage+ en lecture seule, jusqu\'au dépôt de la notification signée">' + ic('eye', 'xs') + 'Publipostage+ · lecture</span>') + '<span class="sp"></span>'
      + (signed && cur.fileId ? '<button type="button" class="ibtn" title="Télécharger la notification signée" aria-label="Télécharger la notification signée" ' + da('rev-download') + '>' + ic('download', 's') + '</button>' : '') + (signed ? '' : editModelButton('doc', V.cfg.modCourrier)) + bigButton('doc') + '</div>'
      + '<div class="rdocbody" data-slot="rev-doc"></div>'
      + '<div class="rfoot"><span class="psub">' + (signed ? 'PJ de la colonne « Notifications signées »' : 'Aperçu Publipostage+ · à faire signer') + '</span><span class="sp"></span><span class="psub rfile">' + esc(fileName) + '</span></div></div>';
  }

  // « Modifier le modèle » (maquette validée) : ouvre le modèle de ce volet dans Publipostage+ (page Rédaction, en Édition) pour le projet affiché ; « Retour » ramène ici.
  const editModelButton = (kind, model) => '<button type="button" class="pillbtn ghost editbtn" ' + (model ? '' : 'disabled ') + 'title="' + (model ? 'Ouvrir le modèle « ' + esc(model) + ' » dans Publipostage+ pour le modifier' : 'Aucun modèle choisi : voir le paramétrage de l\'instance') + '" aria-label="Modifier le modèle" ' + da('rev-edit-model', { v: kind }) + '>' + ic('pencil', 's') + '<span class="elabel">Modifier le modèle</span></button>';
  // Agrandir le mail ou le courrier : les deux icônes sont dans le bouton et la classe du conteneur (.in-big-mail / .in-big-doc) montre la bonne, si bien que le
  // bouton bascule sans nouveau rendu (rien ne se relit, le courrier garde son nœud) : seul le CSS change.
  const BIG_LABEL = { mail: 'le mail', doc: 'le courrier' };
  const bigButton = kind => '<button type="button" class="ibtn bigbtn" title="' + (S.prefs.notifLarge === kind ? 'Réduire ' : 'Agrandir ') + BIG_LABEL[kind] + '" aria-label="' + (S.prefs.notifLarge === kind ? 'Réduire ' : 'Agrandir ') + BIG_LABEL[kind] + '" aria-pressed="' + (S.prefs.notifLarge === kind ? 'true' : 'false') + '" '
    + da('rev-big', { v: kind }) + '><span class="bigon">' + ic('shrink', 's') + '</span><span class="bigoff">' + ic('expand', 's') + '</span></button>';
  function reviewHtml(V) {
    if (!V.rev.all.length) return vemptyHtml('Aucun projet relié', 'Reliez les projets à notifier aux points de l\'ordre du jour : ils apparaissent ici.');
    if (!V.rev.items.length) return vemptyHtml('Aucune notification pour ce programme', 'Le filtre par programme masque les ' + plural(V.rev.all.length, 'notification', 'notifications') + ' de la séance.', '<button type="button" class="pillbtn" ' + da('rev-prog-all') + '>Tout afficher</button>');
    return '<div class="rev' + (S.prefs.notifLarge ? ' big-' + S.prefs.notifLarge : '') + '">' + reviewListPane(V) + reviewMailPane(V) + reviewDocPane(V) + '</div>';
  }

  // Le volet « courrier » vit hors du rendu (le PDF ne se relit pas à chaque clic) : son nœud est remis dans le nouvel emplacement après chaque rendu.
  // La feuille garde la forme de la page de Publipostage+ (A4 par défaut, ses marges, son sens : js/pages/visa-mail.js `page`) à sa taille réelle ; c'est le
  // zoom du conteneur qui l'ajuste à la largeur du volet (fitSheet), donc élargir ou agrandir le volet ne relit ni ne recompose rien.
  const MM = 96 / 25.4;
  const DEFAULT_PAGE = { widthMm: 210, heightMm: 297, margins: { top: 9.9, right: 9.9, bottom: 9.9, left: 9.9 } };
  const sheetCss = page => {
    const px = mm => Math.round(mm * MM * 10) / 10, m = page.margins;
    return ':host{display:block}.sheet{position:relative;isolation:isolate;overflow:hidden;box-sizing:border-box;width:' + px(page.widthMm) + 'px;min-height:' + px(page.heightMm) + 'px;margin:0 auto;padding:' + [m.top, m.right, m.bottom, m.left].map(px).join('px ') + 'px;background:#fff;color:#1b2430;font:11pt/1.45 Georgia,"Times New Roman",serif;box-shadow:0 1px 3px rgba(9,16,35,.18),0 6px 16px -8px rgba(9,16,35,.25)}.sheet p{margin:0 0 .7em}.sheet table{border-collapse:collapse;width:100%}.sheet td,.sheet th{border:1px solid #c9d0db;padding:4px 6px}.sheet img{max-width:100%}.page-break-marker{margin:18px -' + px(m.right) + 'px 18px -' + px(m.left) + 'px;padding:3px 0;border-top:1px dashed #98a2b3;color:#98a2b3;font:10px/1.2 system-ui,sans-serif;text-align:center;text-transform:uppercase;letter-spacing:.08em}';
  };
  // Zoom de la feuille : la largeur utile du volet divisée par celle de la page (jamais plus de 1,5 fois sa taille réelle).
  function fitSheet(node) {
    const wrap = node && node.querySelector(':scope > .in-sheetwrap'), host = wrap && wrap.firstElementChild, width = host && Number(host.dataset.w);
    if (!width) return;
    const avail = wrap.clientWidth - 24;
    if (avail > 0) host.style.zoom = String(Math.max(0.2, Math.min(1.5, avail / width)));
  }
  function releaseDoc(full) {
    const d = S.ui && S.ui.rev && S.ui.rev.doc; if (!d) return;
    if (d.handle) { d.handle.destroy(); d.handle = null; }
    if (d.watch) { d.watch.disconnect(); d.watch = null; }
    if (d.node && d.node.parentNode) d.node.remove();
    d.node = null; d.key = ''; d.want = false; d.dock = false; d.ctx = null;
    if (full) { if (d.reader) { d.reader.destroy(); d.reader = null; } clearInterval(d.poll); d.poll = null; }
    placeDock();
  }
  function showDoc(node, res, notice) {
    node.replaceChildren();
    if (res.issues.length || notice) {
      const warn = document.createElement('ul'); warn.className = 'in-rissues'; warn.setAttribute('role', 'status');
      if (notice) { const li = document.createElement('li'); li.textContent = notice; warn.appendChild(li); }
      res.issues.forEach(x => { const li = document.createElement('li'); li.textContent = global.VisaMail.issueText(x); warn.appendChild(li); });
      node.appendChild(warn);
    }
    const page = res.page || DEFAULT_PAGE;
    const wrap = document.createElement('div'); wrap.className = 'in-sheetwrap';
    const host = document.createElement('div'); host.dataset.w = String(Math.round(page.widthMm * MM));
    const shadow = host.attachShadow({ mode: 'open' }); // les styles du modèle ne sortent pas, ceux de la page n'y entrent pas
    shadow.innerHTML = '<style>' + sheetCss(page) + '</style><div class="sheet">' + res.html + '</div>';
    wrap.appendChild(host); node.appendChild(wrap);
    fitSheet(node);
  }
  const sayIn = (node, title, detail, extra) => { node.innerHTML = withPrefix(vemptyHtml(title, detail, extra)); };

  // --- Le courrier lu par Publipostage+ lui-même (demande d'Antoine du 23/11/2026 : « pourquoi ne pas juste inclure le mode lecture épurée de PP ? ») ---
  // L'iframe de Publipostage+ (js/components/pp-reader.js : même pont que la page Rédaction, mode Lecture épurée) vit dans un « dock » hors du rendu, posé par-dessus
  // le volet du courrier : un nœud qu'on déplace recharge son iframe, or le rendu de la page recrée tout. Changer de projet n'envoie à Publipostage+ que la ligne à
  // présenter (select by) : rien ne se recharge. Si la lecture épurée échoue (page d'une autre origine, modèle absent de sa liste, délai), le volet se rabat sur
  // l'aperçu simplifié du widget (VisaMail.prepareDocument), avec la raison.
  const reader = { on: true, target: null, opts: {} };
  const readerReady = () => !!(reader.on && global.PpReader && global.GristBridge && global.PageRedaction && global.PageRedaction.resolveLinked && global.VisaMail && global.VisaMail.findModel);
  const dockEl = () => { const root = rootEl(); return root && root.querySelector('[data-region="dock"]'); };
  // Cale le dock sur le volet du courrier (ou le masque : autre étape, notification signée, lecture pas prête, page masquée).
  function placeDock() {
    const dock = dockEl(), root = rootEl(), wrap = root && root.querySelector('.in-wrap'), d = S && S.ui && S.ui.rev && S.ui.rev.doc;
    if (!dock) return;
    const slot = d && d.node && d.node.parentNode, rect = d && d.dock && slot && slot.isConnected ? slot.getBoundingClientRect() : null;
    if (!rect || rect.width < 2 || rect.height < 2 || !wrap) { if (dock.classList.contains('on')) dock.classList.remove('on'); return; }
    const base = wrap.getBoundingClientRect();
    const box = [Math.round(rect.left - base.left - wrap.clientLeft), Math.round(rect.top - base.top - wrap.clientTop), Math.round(rect.width), Math.round(rect.height)];
    const sig = box.join('/');
    if (d.last !== sig) { d.last = sig; dock.style.left = box[0] + 'px'; dock.style.top = box[1] + 'px'; dock.style.width = box[2] + 'px'; dock.style.height = box[3] + 'px'; }
    if (!dock.classList.contains('on')) dock.classList.add('on');
    dock.classList.toggle('busy', !!d.busy);
  }
  function onReaderChange(phase, note) {
    const d = S.ui.rev.doc, c = d.ctx;
    if (!d.want || !c || d.node !== c.node) return; // ce n'est plus le courrier affiché (autre étape, notification signée)
    if (phase === 'ready') { d.dock = true; c.node.replaceChildren(); placeDock(); }
    else if (phase === 'loading') { d.dock = false; placeDock(); sayIn(c.node, 'Ouverture de Publipostage+ en lecture…', note); }
    else if (phase === 'failed') { d.dock = false; placeDock(); ownPreview(c, note); }
  }
  function ensureReader(d) {
    if (d.reader) return d.reader;
    d.readerNonce = d.nonce;
    d.reader = global.PpReader.create(Object.assign({}, reader.opts, {
      container: dockEl(), target: reader.target || (() => global.PageRedaction.resolveTarget()), onChange: onReaderChange
    }));
    if (!d.poll) d.poll = setInterval(placeDock, 500); // un décalage de mise en page sans redimensionnement du volet (bandeau replié, défilement) est rattrapé
    return d.reader;
  }
  function openReader(c) {
    const d = S.ui.rev.doc;
    if (d.reader && d.readerNonce !== d.nonce) { d.reader.destroy(); d.reader = null; d.dock = false; } // « Relire » : on repart d'une iframe neuve
    if (d.reader && d.reader.phase === 'failed') { ownPreview(c, d.reader.note); return; } // le repli reste en place jusqu'au prochain « Relire »
    d.dock = !!(d.reader && d.reader.phase === 'ready'); // déjà ouverte : le courrier reste affiché pendant que la nouvelle ligne est envoyée
    d.busy = d.dock;
    if (!d.dock) sayIn(c.node, 'Ouverture de Publipostage+ en lecture…');
    placeDock();
    const stale = () => d.ctx !== c;
    Promise.all([global.VisaMail.findModel(c.model, { cache: true }), global.PageRedaction.resolveLinked({ id: c.cur.id })]).then(([found, linked]) => {
      if (stale()) return;
      d.busy = false;
      if (!found) { d.dock = false; placeDock(); ownPreview(c, 'modèle introuvable'); return; }
      ensureReader(d).show({ table: linked.table, rowId: linked.rowId, modelId: found.id });
      placeDock();
    }).catch(err => {
      if (stale()) return;
      d.busy = false; d.dock = false; placeDock();
      ownPreview(c, err && err.message ? global.CoreUtils.failureReason(err, { what: 'lecture du courrier par Publipostage+' }) : 'lecture impossible');
    });
  }
  // L'aperçu du widget : seul courrier affiché sans Publipostage+ (pas de lecteur, ou lecture épurée en échec : `why` dit pourquoi).
  function ownPreview(c, why) {
    const d = S.ui.rev.doc, { node, key, cur, model } = c;
    const notice = why ? 'La lecture épurée de Publipostage+ est indisponible (' + why + ') : aperçu simplifié du courrier.' : '';
    if (!global.VisaMail || !global.VisaMail.prepareDocument) { sayIn(node, 'Aperçu indisponible', 'Le module de lecture des modèles n\'est pas chargé.'); return; }
    const args = { project: { id: cur.id }, modelName: model, now: () => new Date(), cache: true };
    const ready = global.VisaMail.peek && global.VisaMail.peek('doc', args);
    if (ready) { showDoc(node, ready, notice); return; } // déjà préparé : le courrier s'affiche sur-le-champ, sans « Lecture du modèle… »
    sayIn(node, 'Lecture du modèle…');
    global.VisaMail.prepareDocument(args).then(res => {
      if (d.key !== key || d.node !== node) return;
      showDoc(node, res, notice);
    }).catch(err => { if (d.key === key && d.node === node) sayIn(node, 'Courrier indisponible', reviewErrorText(err)); });
  }
  function syncReviewDoc() {
    const root = rootEl(), V = S.view, d = S.ui.rev.doc;
    const slot = root && root.querySelector('[data-slot="rev-doc"]');
    if (!slot || !V || !V.rev || !V.rev.cur) { releaseDoc(); return; }
    const cur = V.rev.cur, signed = cur.state !== 'draft', model = V.cfg.modCourrier;
    if (!d.node) { d.node = document.createElement('div'); d.node.className = 'in-rdocview'; } // (≠ du volet, de classe in-rdoc : même nom = même style)
    if (d.node.parentNode !== slot) slot.appendChild(d.node);
    if (!d.watch && typeof ResizeObserver === 'function') { // volet élargi, agrandi, fenêtre redimensionnée ou page décalée : la feuille se re-zoome, le dock se recale
      d.watch = new ResizeObserver(() => { fitSheet(d.node); placeDock(); });
      d.watch.observe(d.node);
      const main = root.querySelector('[data-region="main"]'); if (main) d.watch.observe(main);
    }
    warmReview(V);
    const key = signed ? 'pdf:' + cur.id + ':' + cur.fileId + ':' + d.nonce : 'pp:' + cur.id + ':' + model + ':' + d.nonce;
    if (d.key === key) { placeDock(); return; }
    if (d.handle) { d.handle.destroy(); d.handle = null; }
    d.key = key;
    const node = d.node;
    node.replaceChildren();
    d.want = false; d.dock = false; d.busy = false; d.ctx = null; placeDock();
    if (signed) {
      if (!cur.fileId) { sayIn(node, 'Pas de notification signée', 'La colonne « Notifications signées » du projet est vide.'); return; }
      if (!global.PdfViewer || !global.PdfViewer.mount || !global.CoreAttachments) { sayIn(node, 'Visionneuse indisponible', 'Le bouton de téléchargement ouvre le fichier.'); return; }
      const cell = { tableId: NOTIF_SIGNEES.tableId, colId: NOTIF_SIGNEES.colId, rowId: cur.id };
      d.handle = global.PdfViewer.mount(node, { load: () => global.CoreAttachments.fetchBytes(cur.fileId, cell) });
      return;
    }
    if (!model) { sayIn(node, 'Aucun modèle de courrier choisi', 'Choisissez-le dans le paramétrage de l\'instance : un modèle de type document de Publipostage+.', '<button type="button" class="pillbtn" ' + da('settings-open') + '>' + ic('sliders', 's') + 'Paramétrage</button>'); return; }
    const c = d.ctx = { node, key, cur, model };
    if (readerReady()) { d.want = true; openReader(c); return; }
    ownPreview(c, '');
  }
  // Les autres notifications de la séance se préparent en arrière-plan, une à la fois et en laissant la main à la page : passer d'un projet à l'autre est alors
  // immédiat (les lectures de Grist sont déjà en mémoire, il ne reste que le remplissage des variables). Relancé quand le mail, le courrier ou les données changent.
  function warmReview(V) {
    const R = S.ui.rev, VM = global.VisaMail;
    if (!warmEnabled || !VM || !VM.peek || !V.rev || !V.rev.cur || R.warmKey === warmKeyOf(V)) return;
    const key = R.warmKey = warmKeyOf(V), queue = V.rev.items.filter(i => i.id !== V.rev.cur.id);
    const mailModel = V.cfg.modNotif, docModel = V.cfg.modCourrier, client = S.prefs.messagerie;
    const step = () => {
      if (S.ui.rev !== R || R.warmKey !== key) return;
      const item = queue.shift(); if (!item) return;
      const quiet = () => {};
      const jobs = [];
      if (mailModel) jobs.push(VM.prepare({ project: { id: item.id }, modelName: mailModel, client, now: () => new Date(), cache: true }).catch(quiet));
      if (docModel && item.state === 'draft') jobs.push(VM.prepareDocument({ project: { id: item.id }, modelName: docModel, now: () => new Date(), cache: true }).catch(quiet));
      Promise.all(jobs).then(() => setTimeout(step, 20));
    };
    setTimeout(step, 600);
  }
  const warmKeyOf = V => [V.rev.items.map(i => i.id + i.state).join(','), V.cfg.modNotif, V.cfg.modCourrier, S.prefs.messagerie, S.ui.rev.mail.nonce].join('|');

  const copyText = value => {
    const fallback = () => {
      const area = document.createElement('textarea');
      area.value = value; area.setAttribute('readonly', ''); area.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(area); area.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      area.remove(); return ok;
    };
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) return global.navigator.clipboard.writeText(value).then(() => true, () => fallback());
    return Promise.resolve(fallback());
  };
  // Les courriers cochés (modèle « document ») dans une page à imprimer, un par feuille. La fenêtre s'ouvre tout de suite (geste de la personne) pour
  // que le navigateur ne la bloque pas ; elle se remplit une fois les courriers lus.
  const printPage = (docs, title) => '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>@page{size:A4;margin:20mm}body{margin:0;font:12pt/1.45 Georgia,"Times New Roman",serif;color:#000}.letter{break-after:page;page-break-after:always}.letter:last-child{break-after:auto;page-break-after:auto}.letter table{border-collapse:collapse;width:100%}.letter td,.letter th{border:1px solid #888;padding:3pt 5pt}.letter img{max-width:100%}.page-break-marker{break-after:page;page-break-after:always;height:0;overflow:hidden;font-size:0;line-height:0;color:transparent}</style></head><body>'
    + docs.map(x => '<section class="letter">' + x.html + '</section>').join('') + '</body></html>';
  async function generateLetters(V) {
    const R = S.ui.rev, rv = V.rev; if (!rv || R.busy) return;
    const items = rv.drafts.filter(i => R.checked[i.id]);
    if (!items.length) return;
    if (!V.cfg.modCourrier) { toast('Choisissez d\'abord le modèle du courrier dans le paramétrage de l\'instance.', true); return; }
    if (!global.VisaMail || !global.VisaMail.prepareDocument) return;
    const win = global.open('', '_blank');
    if (win) { try { win.opener = null; win.document.title = 'Courriers de notification'; win.document.body.textContent = 'Préparation des courriers…'; } catch (err) { /* fenêtre d'une autre origine : sans importance */ } }
    R.busy = true; render();
    try {
      const docs = [];
      for (const item of items) docs.push(await global.VisaMail.prepareDocument({ project: { id: item.id }, modelName: V.cfg.modCourrier, now: () => new Date() }));
      if (!win) { toast('Le navigateur a bloqué la fenêtre des courriers : autorisez les fenêtres pour ce widget.', true); return; }
      win.document.open(); win.document.write(printPage(docs, V.inst.nom + ' n°' + V.s.num + ' — courriers de notification')); win.document.close();
      win.focus();
      setTimeout(() => { try { win.print(); } catch (err) { /* la personne imprime depuis l'onglet */ } }, 400);
      const flagged = docs.filter(x => x.issues.length).length;
      toast(plural(docs.length, 'courrier ouvert', 'courriers ouverts') + ' pour impression ou PDF' + (flagged ? ' (' + plural(flagged, 'à vérifier', 'à vérifier') + ' : variable sans valeur ou élément non évalué)' : '') + '.');
    } catch (err) {
      if (win) win.close();
      toast('Courriers impossibles : ' + reviewErrorText(err), true);
    } finally { R.busy = false; render(); }
  }
  // Relit Projets et Notifications (la notification signée vient peut-être d'être déposée dans Grist) et relance la lecture du mail et du courrier.
  async function refreshReview() {
    const R = S.ui.rev; R.mail.nonce++; R.doc.nonce++;
    if (global.VisaMail && global.VisaMail.clearCache) global.VisaMail.clearCache(); // les modèles et les projets sont relus
    try {
      for (const name of ['Projets', 'Notifications']) global.CoreState.setTable(name, await global.CoreGrist.getTable(name));
    } catch (err) { console.warn('Relecture des notifications :', err.message); }
    rebuild(); render();
  }

  // ---------------------------------------------------------------------------------------------
  // Étape 3 · Mail d'invitation : la même vue que la « Relecture & envoi » des notifications (demande d'Antoine du 27/11/2026)
  // ---------------------------------------------------------------------------------------------
  // Avant, l'étape portait GFS : le widget ne peut pas lui dire quel fichier ouvrir, il rouvrait le dernier (souvent le compte rendu) au lieu du modèle d'invitation.
  // Maintenant, à gauche, un bloc « Invités habituels » (UN mail pour toute la liste permanente) puis une ligne par invité spécifique (ajouté sur un point : son mail
  // et son horaire de passage) ; à droite, le mail lu par Publipostage+ lui-même (lecture épurée, même iframe pilotée que le courrier des notifications, modèle ouvert
  // PAR SON NOM : Instances.Modele_invitation pour la séance, Instances.Modele_invitation_specifique pour un invité). Les en-têtes (À, Objet) et le lien « Ouvrir dans
  // ma messagerie » viennent de VisaMail.prepareRow (la même résolution des variables que pour les notifications, mais à partir de la ligne affichée). Deux iframes
  // au plus : Publipostage+ ne connaît qu'une table par chargement (la séance pour le bloc, Instance_Invites pour un invité) ; passer d'un invité à l'autre n'envoie
  // que la ligne. Rien n'est écrit dans le document d'ici, sauf les pastilles « écrit » et « horaire envoyé » (colonnes déjà tenues par l'étape Invités).
  function invGroups(V) {
    const usual = V.guestOrder.filter(g => g.origine !== 'point'), spec = V.guestOrder.filter(g => g.origine === 'point');
    return { usual, spec };
  }
  function invCounts(V) {
    const s = V.s, { usual, spec } = invGroups(V), hasUsual = usual.length > 0;
    const usualDone = hasUsual && usual.every(g => g.ecritLe), usualSome = usual.some(g => g.ecritLe);
    const horTot = s.guests.filter(g => !!V.firstStart(g)).length;
    const horOk = s.guests.filter(g => { const f0 = V.firstStart(g); return !!f0 && !!g.passageLe && g.passageHeure === f0; }).length;
    return { usual, spec, hasUsual, usualDone, usualSome, nMails: (hasUsual ? 1 : 0) + spec.length, nWritten: (usualDone ? 1 : 0) + spec.filter(g => g.ecritLe).length, horTot, horOk };
  }
  // L'élément affiché : le bloc des habituels, ou un invité spécifique encore présent (sinon retour au bloc).
  function invSel(V) {
    const I = S.ui.inv, c = invGroups(V);
    if (I.sel !== 'usual' && !c.spec.some(g => g.id === I.sel)) I.sel = 'usual';
    if (I.sel === 'usual' && !c.usual.length && c.spec.length) I.sel = c.spec[0].id;
    return I.sel;
  }
  function invTarget(V) {
    const sel = invSel(V);
    return sel === 'usual'
      ? { kind: 'usual', sel, table: 'Suivi_Instance', rowId: V.s.id, model: V.cfg.modInvitation, what: 'invités habituels' }
      : { kind: 'guest', sel, table: 'Instance_Invites', rowId: sel, model: V.cfg.modInvitationSpec, what: 'invités spécifiques' };
  }
  // Les adresses de la liste habituelle : mises en copie cachée quand le modèle ne donne aucun destinataire (un mail pour toute la liste).
  const invUsualAddresses = V => Array.from(new Set(invGroups(V).usual.map(g => personOf(V.m, g.personneId).email).filter(Boolean)));
  const horaireTip = (g, hs, fs0) => (hs === 'none' ? 'Aucun point : pas d\'horaire de passage' : (hs === 'stale' ? 'Horaire modifié depuis l\'envoi : ' + g.passageHeure + ' devient ' + fs0 + ' (cliquer pour marquer le nouvel horaire envoyé)' : (hs === 'sent' ? 'Horaire ' + g.passageHeure + ' envoyé le ' + L.fmtDate(g.passageLe) + ' (cliquer pour effacer)' : 'Horaire de passage ' + fs0 + ' pas encore envoyé (cliquer pour marquer envoyé)')));

  // Lit le mail de la ligne affichée dans son modèle ; une lecture par (ligne, modèle, messagerie), relancée par le bouton « Relire ».
  function ensureInvMail(V, t) {
    const R = S.ui.inv.mail, I = S.ui.inv;
    if (!t.model || !global.VisaMail || !global.VisaMail.prepareRow) { R.key = ''; R.status = ''; R.draft = null; R.error = null; return; }
    const bcc = t.kind === 'usual' ? invUsualAddresses(V).join(', ') : '';
    const key = [t.table, t.rowId, t.model, S.prefs.messagerie, bcc, I.nonce].join('|');
    if (R.key === key) return;
    R.key = key; R.status = 'loading'; R.draft = null; R.error = null;
    const args = { row: { table: t.table, id: t.rowId }, modelName: t.model, client: S.prefs.messagerie, now: () => new Date(), cache: true, defaults: { bcc } };
    const ready = global.VisaMail.peek && global.VisaMail.peek('mailrow', args);
    if (ready) { R.status = 'ok'; R.draft = ready; return; }
    global.VisaMail.prepareRow(args).then(draft => {
      if (R.key !== key || S.ui.inv.mail !== R) return;
      R.status = 'ok'; R.draft = draft; render();
    }).catch(err => {
      if (R.key !== key || S.ui.inv.mail !== R) return;
      R.status = 'error'; R.error = err; render();
    });
  }

  function invBar(V, c) {
    const s = V.s;
    return '<div class="card">' + ic('mail')
      + '<span class="tag-soft rchip" title="Mails écrits : un pour les invités habituels, un par invité spécifique">' + ic('mail', 's') + c.nWritten + '/' + c.nMails + '</span>'
      + '<span class="tag-soft rchip" title="Horaires de passage envoyés aux invités (' + c.horOk + ' sur ' + c.horTot + ')">' + ic('clock', 's') + c.horOk + '/' + c.horTot + '</span><span class="sp"></span>'
      + DateInput.markup({ cls: 'dp', iso: s.mailInvitationLe, aria: "Date d'envoi du mail d'invitation", attrs: 'data-chg="inv-date"' })
      + '<button type="button" class="rbtn" title="Envoyé aujourd\'hui" aria-label="Envoyé aujourd\'hui" ' + da('inv-today') + '>' + ic('calCheck') + '</button></div>';
  }
  function invListPane(V, sel, c) {
    let h = '<div class="rpane rlist"><div class="rhead"><strong>Invitations de la séance</strong></div><ul class="rrows">';
    if (c.hasUsual) {
      const on = sel === 'usual', nWr = c.usual.filter(g => g.ecritLe).length, st = c.usualDone ? 'done' : (c.usualSome ? 'part' : 'todo');
      const tip = st === 'done' ? 'Invitation écrite pour tous (cliquer pour effacer)' : (st === 'part' ? nWr + ' sur ' + c.usual.length + ' marqués écrits (cliquer pour marquer tout le monde)' : 'Pas encore écrite (cliquer pour marquer écrite pour tous)');
      h += '<li class="rrow' + (on ? ' on' : '') + '" data-inv="usual"><span class="rlead">' + ic('people', 's') + '</span><button type="button" class="rpick" aria-pressed="' + (on ? 'true' : 'false') + '" ' + da('inv-pick', { v: 'usual' }) + '><strong>Invités habituels</strong>'
        + '<span class="psub">1 mail · ' + plural(c.usual.length, 'destinataire', 'destinataires') + '</span></button>'
        + '<button type="button" class="ib ' + (st === 'done' ? 'on' : (st === 'part' ? 'warn' : '')) + '" title="' + esc(tip) + '" aria-label="' + esc(tip) + '" ' + da('inv-usual-written') + '>' + ic('mail') + '</button></li>';
    }
    if (c.spec.length) {
      h += '<li class="rsec" title="Personnes ajoutées sur un point de l\'ordre du jour : un mail chacune, avec son horaire de passage">' + ic('star', 's') + 'Invités spécifiques<span class="tag-soft">' + c.spec.length + '</span></li>';
      c.spec.forEach(g => {
        const person = personOf(V.m, g.personneId), on = sel === g.id, fs0 = V.firstStart(g), hs = L.horaireState(g, fs0);
        const first = V.schedAll.find(row => row.p.invites.indexOf(g.id) >= 0);
        const ecritTip = g.ecritLe ? 'Écrit le ' + L.fmtDate(g.ecritLe) + ' (cliquer pour effacer)' : 'Pas encore écrit (cliquer pour marquer écrit aujourd\'hui)', horTip = horaireTip(g, hs, fs0);
        h += '<li class="rrow' + (on ? ' on' : '') + '" data-inv="' + g.id + '"><button type="button" class="rpick" aria-pressed="' + (on ? 'true' : 'false') + '" ' + da('inv-pick', { v: g.id }) + '><span class="rname"><strong>' + esc(person.name) + '</strong>'
          + (person.gradeKind ? '<span class="gbadge ' + gradeClass(person) + '">' + (person.gradeKind === 'vp' ? 'VP' : 'Dir.') + '</span>' : '') + '</span>'
          + '<span class="psub">' + (first ? esc(L.hhmm(first.start) + ' · ' + L.cut(first.p.titre, 30)) : 'Aucun point') + '</span></button>'
          + '<button type="button" class="ib ' + (g.ecritLe ? 'on' : '') + '" title="' + esc(ecritTip) + '" aria-label="' + esc(ecritTip) + '" ' + da('g-ecrit', { id: g.id }) + '>' + ic('mail') + '</button>'
          + '<button type="button" class="ib ' + (hs === 'stale' ? 'warn' : (hs === 'sent' ? 'on' : '')) + '" title="' + esc(horTip) + '" aria-label="' + esc(horTip) + '" ' + (hs === 'none' ? 'disabled ' : '') + da('g-hor', { id: g.id }) + '>' + ic('clock') + '</button></li>';
      });
    }
    return h + '</ul></div>';
  }
  function invMailPane(V, t, c) {
    const I = S.ui.inv, R = I.mail, g = t.kind === 'guest' ? guestOf(V, t.sel) : null, model = t.model;
    ensureInvMail(V, t);
    let h = '<div class="rpane rmail"><div class="rhead">' + ic('mail', 's') + '<strong>E-mail</strong><span class="rbadge viol" title="Le mail tel que Publipostage+ le compose, en lecture">' + ic('eye', 'xs') + 'Mode lecture</span>'
      + (model ? '<span class="psub rmodel" title="Modèle e-mail de Publipostage+ (' + esc(t.what) + ')">' + esc(model) + '</span>' : '') + '<span class="sp"></span>'
      + (model ? '<label class="rzim" title="Zimbra lit le lien du brouillon autrement : le widget l\'adapte"><input type="checkbox" ' + (S.prefs.messagerie === 'zimbra' ? 'checked ' : '') + 'data-chg="rev-zimbra">Zimbra</label>' : '')
      + '<button type="button" class="ibtn" title="Relire les données et le modèle" aria-label="Relire les données" ' + da('inv-refresh') + '>' + ic('refresh', 's') + '</button>'
      + '<button type="button" class="pillbtn ghost editbtn' + (I.editing ? ' on' : '') + '" ' + (model ? '' : 'disabled ') + 'title="' + (model ? (I.editing ? 'Revenir à la lecture du mail' : 'Modifier le modèle « ' + esc(model) + ' » dans Publipostage+ (ici même)') : 'Aucun modèle choisi : voir le paramétrage de l\'instance') + '" aria-label="' + (I.editing ? 'Revenir à la lecture' : 'Modifier le modèle') + '" aria-pressed="' + (I.editing ? 'true' : 'false') + '" ' + da('inv-edit') + '>'
      + ic(I.editing ? 'eye' : 'pencil', 's') + '<span class="elabel">' + (I.editing ? 'Revenir à la lecture' : 'Modifier le modèle') + '</span></button></div>';
    if (!model) {
      return h + vemptyHtml(t.kind === 'usual' ? 'Aucun modèle d\'invitation choisi' : 'Aucun modèle choisi pour les invités spécifiques',
        'Choisissez-le dans le paramétrage de l\'instance : un modèle de type e-mail de Publipostage+' + (t.kind === 'guest' ? ', dont les variables partent de la ligne de l\'invité (table Instance_Invites).' : '.'),
        '<button type="button" class="pillbtn" ' + da('settings-open') + '>' + ic('sliders', 's') + 'Paramétrage</button>') + '</div>';
    }
    const row = (k, v) => '<span class="k">' + k + '</span><span class="v">' + v + '</span>';
    if (R.status === 'ok' && R.draft) {
      const f = R.draft.fields;
      h += '<div class="rfields">' + row('À', f.to ? esc(f.to) : '<span class="muted">—</span>') + (f.cc ? row('Cc', esc(f.cc)) : '')
        + (f.bcc ? row('Cci', '<span title="' + esc(f.bcc) + '">' + plural(global.VisaMail.addressesOf(f.bcc).length, 'destinataire', 'destinataires') + ' en copie cachée</span>') : '') + row('Objet', '<strong>' + esc(f.subject) + '</strong>') + '</div>';
      if (R.draft.issues.length) h += '<ul class="rissues" role="status">' + R.draft.issues.map(x => '<li>' + esc(global.VisaMail.issueText(x)) + '</li>').join('') + '</ul>';
    } else if (R.status === 'error') h += '<div class="rfields">' + row('Mail', '<span class="muted">indisponible : ' + esc(reviewErrorText(R.error)) + '</span>') + '</div>';
    else h += '<div class="rfields">' + row('Mail', '<span class="muted">lecture du modèle…</span>') + '</div>';
    const ok = R.status === 'ok' && !!R.draft, who = t.kind === 'usual' ? 'les invités habituels' : (g ? personOf(V.m, g.personneId).name : '');
    const written = t.kind === 'usual' ? c.usualDone : !!(g && g.ecritLe);
    h += '<div class="rdocbody' + (I.editing ? ' tall' : '') + '" data-slot="inv-mail"></div><div class="rfoot">'
      + '<button type="button" class="pillbtn" ' + (ok ? '' : 'disabled ') + 'title="Ouvre le brouillon dans votre messagerie' + (t.kind === 'usual' ? ' (la liste habituelle en copie cachée)' : '') + '" ' + da('inv-open') + '>' + ic('mail', 's') + 'Ouvrir dans ma messagerie</button>'
      + '<button type="button" class="pillbtn ghost" ' + (ok ? '' : 'disabled ') + 'title="Copie l\'objet et le corps du mail" ' + da('inv-copy') + '>' + ic('copy', 's') + 'Copier</button><span class="sp"></span>'
      + '<button type="button" class="pillbtn ghost' + (written ? ' okon' : '') + '" aria-pressed="' + (written ? 'true' : 'false') + '" title="' + (written ? 'Invitation écrite (cliquer pour effacer)' : 'Marquer l\'invitation écrite pour ' + esc(who)) + '" ' + (t.kind === 'usual' ? da('inv-usual-written') : da('g-ecrit', { id: t.sel })) + '>' + ic('check', 's') + (written ? 'Invitation écrite' : 'Marquer écrite') + '</button>';
    if (g) {
      const fs0 = V.firstStart(g), hs = L.horaireState(g, fs0);
      h += '<button type="button" class="pillbtn ghost' + (hs === 'sent' ? ' okon' : (hs === 'stale' ? ' warnon' : '')) + '" ' + (hs === 'none' ? 'disabled ' : '') + 'title="' + esc(horaireTip(g, hs, fs0)) + '" ' + da('g-hor', { id: g.id }) + '>' + ic('clock', 's')
        + (hs === 'sent' ? 'Horaire envoyé' : (hs === 'stale' ? 'Horaire à renvoyer' : 'Marquer l\'horaire envoyé')) + '</button>';
    }
    return h + '</div></div>';
  }
  function invitationHtml(V) {
    const c = invCounts(V), sel = invSel(V), t = invTarget(V);
    if (!c.nMails) return invBar(V, c) + vemptyHtml('Aucun invité', 'Ajoutez des invités dans l\'étape Invités : la liste permanente de l\'instance et les personnes ajoutées sur un point apparaissent ici.');
    return invBar(V, c) + '<div class="rev inv">' + invListPane(V, sel, c) + invMailPane(V, t, c) + '</div>';
  }

  // Les iframes de Publipostage+ vivent dans des « docks » hors du rendu (un nœud qu'on déplace recharge son iframe, or le rendu de la page recrée tout), posés par-dessus le
  // volet du mail : un dock par table (séance, invité). Même principe que le courrier des notifications (placeDock) ; si la lecture échoue (page d'une autre origine, modèle
  // absent de la liste, délai), le volet se rabat sur le texte du mail lu par le widget, avec la raison.
  function invDock(kind) {
    const K = S.ui.inv.kinds[kind], root = rootEl();
    if (K.dock && K.dock.isConnected) return K.dock;
    const wrap = root && root.querySelector('.in-wrap'); if (!wrap) return null;
    const el = document.createElement('div'); el.className = 'in-ppdock'; el.dataset.dock = 'inv-' + kind; el.setAttribute('aria-label', 'Mail lu par Publipostage+');
    wrap.appendChild(el); K.dock = el;
    return el;
  }
  function placeInvDock() {
    const I = S.ui.inv, root = rootEl(), wrap = root && root.querySelector('.in-wrap');
    const slot = I.node && I.node.parentNode && I.node.parentNode.isConnected ? I.node.parentNode : null, rect = slot ? slot.getBoundingClientRect() : null;
    Object.keys(I.kinds).forEach(kind => {
      const K = I.kinds[kind], dock = K.dock; if (!dock) return;
      const show = !!(wrap && rect && rect.width >= 2 && rect.height >= 2 && I.active === kind && K.ready);
      if (!show) { if (dock.classList.contains('on')) dock.classList.remove('on'); return; }
      const base = wrap.getBoundingClientRect();
      const box = [Math.round(rect.left - base.left - wrap.clientLeft), Math.round(rect.top - base.top - wrap.clientTop), Math.round(rect.width), Math.round(rect.height)], sig = box.join('/');
      if (K.last !== sig) { K.last = sig; dock.style.left = box[0] + 'px'; dock.style.top = box[1] + 'px'; dock.style.width = box[2] + 'px'; dock.style.height = box[3] + 'px'; }
      if (!dock.classList.contains('on')) dock.classList.add('on');
    });
  }
  function paintInvFallback() {
    const I = S.ui.inv, R = I.mail, node = I.node; if (!node || !I.fb) return;
    const notice = I.fb.why ? 'La lecture de Publipostage+ est indisponible (' + I.fb.why + ') : aperçu simplifié du mail.' : '';
    if (R.status === 'ok' && R.draft) node.innerHTML = withPrefix((notice ? '<ul class="rissues" role="status"><li>' + esc(notice) + '</li></ul>' : '') + '<pre class="rbody">' + esc(R.draft.bodyText) + '</pre>');
    else if (R.status === 'error') sayIn(node, 'Mail indisponible', reviewErrorText(R.error));
    else sayIn(node, 'Lecture du modèle…');
  }
  function onInvReaderChange(kind, phase, note) {
    const I = S.ui.inv, K = I.kinds[kind];
    if (I.active !== kind || !I.node) return; // ce n'est plus le mail affiché (autre élément, autre étape)
    if (phase === 'ready') { K.ready = true; I.fb = null; I.node.replaceChildren(); placeInvDock(); }
    else if (phase === 'loading') { K.ready = false; placeInvDock(); sayIn(I.node, 'Ouverture de Publipostage+ en lecture…', note); }
    else if (phase === 'failed') { K.ready = false; I.active = ''; placeInvDock(); I.fb = { why: note }; paintInvFallback(); }
  }
  function ensureInvReader(kind) {
    const I = S.ui.inv, K = I.kinds[kind];
    if (K.reader) return K.reader;
    K.readerNonce = I.nonce;
    K.reader = global.PpReader.create(Object.assign({}, reader.opts, {
      container: invDock(kind), target: reader.target || (() => global.PageRedaction.resolveTarget()), onChange: (phase, note) => onInvReaderChange(kind, phase, note)
    }));
    if (!I.poll) I.poll = setInterval(placeInvDock, 500); // un décalage de mise en page sans redimensionnement du volet est rattrapé
    return K.reader;
  }
  function openInvReader(t, key) {
    const I = S.ui.inv; let K = I.kinds[t.kind];
    if (K.reader && K.readerNonce !== I.nonce) { K.reader.destroy(); K.reader = null; K.ready = false; } // « Relire » : on repart d'une iframe neuve
    if (K.reader && K.reader.phase === 'failed') { I.active = ''; placeInvDock(); I.fb = { why: K.reader.note }; paintInvFallback(); return; }
    I.active = t.kind; I.fb = null; K.ready = !!(K.reader && K.reader.phase === 'ready');
    if (!K.ready) sayIn(I.node, 'Ouverture de Publipostage+ en lecture…');
    placeInvDock();
    const stale = () => I.key !== key;
    global.VisaMail.findModel(t.model, { cache: true }).then(found => {
      if (stale()) return;
      if (!found) { I.active = ''; placeInvDock(); I.fb = { why: 'modèle introuvable' }; paintInvFallback(); return; }
      ensureInvReader(t.kind).show({ table: t.table, rowId: t.rowId, modelId: found.id });
      placeInvDock();
    }).catch(err => {
      if (stale()) return;
      I.active = ''; placeInvDock(); I.fb = { why: err && err.message ? global.CoreUtils.failureReason(err, { what: 'lecture du mail par Publipostage+' }) : 'lecture impossible' }; paintInvFallback();
    });
  }
  // Appelée à chaque rendu : pose le nœud du mail dans le nouveau volet et n'envoie une ligne à Publipostage+ que lorsque la ligne ou le modèle change.
  function syncInvitation() {
    const root = rootEl(), V = S.view, I = S.ui.inv;
    const slot = root && root.querySelector('[data-slot="inv-mail"]');
    if (!slot || !V || !V.s || V.stepKey !== 'invitation') { I.active = ''; I.key = ''; placeInvDock(); if (I.watch) { I.watch.disconnect(); I.watch = null; } return; }
    const t = invTarget(V);
    if (!I.node) { I.node = document.createElement('div'); I.node.className = 'in-rdocview'; }
    if (I.node.parentNode !== slot) slot.appendChild(I.node);
    if (!I.watch && typeof ResizeObserver === 'function') { I.watch = new ResizeObserver(() => placeInvDock()); I.watch.observe(I.node); const main = root.querySelector('[data-region="main"]'); if (main) I.watch.observe(main); }
    const key = [t.kind, t.table, t.rowId, t.model, I.nonce].join('|');
    if (I.key === key) { placeInvDock(); if (I.fb) paintInvFallback(); return; }
    I.key = key; I.fb = null; I.node.replaceChildren(); I.active = ''; placeInvDock();
    if (!t.model) return; // le volet dit déjà qu'aucun modèle n'est choisi
    if (readerReady()) { openInvReader(t, key); return; }
    I.fb = { why: '' }; paintInvFallback();
  }
  function leaveInvEdit() {
    const I = S.ui.inv, K = I.kinds[I.active];
    if (I.editing && K && K.reader) K.reader.read();
    I.editing = false;
  }
  function releaseInv(full) {
    const I = S.ui.inv; if (!I) return;
    if (I.watch) { I.watch.disconnect(); I.watch = null; }
    if (I.node && I.node.parentNode) I.node.remove();
    I.node = null; I.key = ''; I.active = ''; I.fb = null;
    if (full) {
      clearInterval(I.poll); I.poll = null;
      Object.keys(I.kinds).forEach(kind => { const K = I.kinds[kind]; if (K.reader) K.reader.destroy(); K.reader = null; K.ready = false; if (K.dock) K.dock.remove(); K.dock = null; });
    } else placeInvDock();
  }

  function panelHtml(V) {
    const stepKey = V.stepKey;
    const statusText = V.curDone ? (L.validatedInfo(stepKey, V.ctx, V.nameOf) || 'Validé') : (stepKey === V.firstOpen ? 'En cours' : 'À venir');
    const canValidate = V.missing.length === 0;
    let h = '<section class="panel" aria-live="polite"><div class="ph"><h2>' + (V.stepIdx + 1) + ' · ' + esc(V.curStep.label) + '</h2><span class="stt ' + (V.curDone ? 'ok' : (stepKey === V.firstOpen ? 'cur' : '')) + '">' + (V.curDone ? ic('check', 's') : '') + esc(statusText) + '</span>'
      + (stepKey === 'cr' ? crFoldHtml(V) : '') + (stepKey === 'notifs' ? notifVueSeg(V) + notifProgHtml(V) : '') + '<span class="sp"></span>'
      + (V.alerts.length ? '<span class="alert-pill" title="' + esc(V.alerts.join(' · ')) + '">' + ic('warn', 's') + V.alerts.length + '</span>' : '')
      + (!V.curDone && !V.dateStep ? '<button type="button" class="rbtn primary" title="' + esc(canValidate ? "Valider l'étape" : 'À compléter : ' + V.missing.join(', ')) + '" aria-label="Valider l\'étape" ' + (canValidate ? '' : 'disabled ') + da('validate') + '>' + ic('check') + '</button>' : '')
      + (V.curDone ? '<button type="button" class="rbtn" title="' + (V.dateStep ? 'Effacer la date' : "Rouvrir l'étape") + '" aria-label="' + (V.dateStep ? 'Effacer la date' : "Rouvrir l'étape") + '" ' + da('reopen') + '>' + ic('reopen') + '</button>' : '') + '</div>';
    if (stepKey === 'odj') h += odjHtml(V);
    else if (stepKey === 'invites') h += invitesHtml(V);
    else if (stepKey === 'invitation') h += invitationHtml(V);
    else if (stepKey === 'cr') h += crHtml(V);
    else if (stepKey === 'crmail') h += dateCard(V);
    else h += V.rev ? reviewHtml(V) : notifsHtml(V);
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
      + (isOpen('dur') ? '<div class="menu tgrid">' + L.DUREES.concat(L.DUREES.indexOf(cfg.duree) < 0 ? [cfg.duree] : []).sort((a, b) => a - b).map(n => '<button type="button" class="mi ' + (cfg.duree === n ? 'on' : '') + '" ' + da('cfg-dur', { v: n }) + '><span>' + L.durTxt(n) + '</span></button>').join('') + '</div>' : '')
      + '</div><span class="muted">fin ' + L.hhmm((L.toMin(cfg.heureDebut) || 0) + cfg.duree) + '</span></div></div>';
    h += '<div class="fgrp">' + lbl('Étapes de cette instance', 'Etapes_actives') + L.STEPS.map(x => { const on = cfg.steps.indexOf(x.key) >= 0, locked = x.key === 'odj'; return '<button type="button" class="togg ' + (on ? 'on' : '') + (locked ? ' locked' : '') + '" ' + da('cfg-step', { v: x.key }) + '><span class="box">' + ic('check', 'xs') + '</span><span class="pname">' + esc(x.label) + '</span></button>'; }).join('') + '</div>';
    h += '<div class="fgrp">' + lbl('Relecteurs du compte rendu', 'Relecteurs_CR') + '<div class="group">' + cfg.relecteurs.map(id => tag(personOf(m, id).name, 'cfg-rel-del', id)).join('')
      + '<div class="rel"><button type="button" class="addb" title="Ajouter un relecteur" aria-label="Ajouter un relecteur" ' + da('menu', { v: 'relpick' }) + '>' + ic('plus', 'xs') + '</button>'
      + (isOpen('relpick') ? '<div class="menu">' + filterInput('Rechercher une personne…') + pick(m.people.filter(pp => cfg.relecteurs.indexOf(pp.id) < 0), 'cfg-rel-add') + '</div>' : '') + '</div></div></div>';
    h += '<div class="fgrp">' + lbl('Invités permanents', 'Invites_permanents') + '<div class="group">' + cfg.permanents.map(id => tag(personOf(m, id).name, 'cfg-perm-del', id)).join('')
      + '<div class="rel"><button type="button" class="addb" title="Ajouter un invité permanent" aria-label="Ajouter un invité permanent" ' + da('menu', { v: 'permpick' }) + '>' + ic('plus', 'xs') + '</button>'
      + (isOpen('permpick') ? '<div class="menu">' + filterInput('Rechercher une personne…') + pick(m.people.filter(pp => cfg.permanents.indexOf(pp.id) < 0), 'cfg-perm-add') + '</div>' : '') + '</div></div></div>';
    h += compositionSettingsHtml(V);
    // Modèles Publipostage+ (table Publipostage_Modeles) : une liste déroulante quand le widget les a lus ; sinon un champ libre, et ce que le
    // widget a vu est dit sous le champ (table absente, aucun modèle de ce type…).
    const mods = S.ui.rev.models;
    const modelField = (f, value, ph, kind) => {
      const list = mods && !mods.error ? mods[kind] : [];
      if (!list.length) return '<input type="text" class="inp mfield" placeholder="' + esc(ph) + '" aria-label="' + esc(ph) + '" value="' + esc(value) + '" data-chg="cfg-mod" data-f="' + f + '">';
      const opt = n => '<option value="' + esc(n) + '"' + (n === value ? ' selected' : '') + '>' + esc(n) + '</option>';
      // Un courrier est un document ou un macro-modèle (un document assemblé de plusieurs) : rangés à part dès qu'il y en a.
      const macros = kind === 'letter' ? (mods.macros || []).filter(n => list.indexOf(n) >= 0) : [];
      const body = macros.length
        ? '<optgroup label="Documents">' + list.filter(n => macros.indexOf(n) < 0).map(opt).join('') + '</optgroup><optgroup label="Macro-modèles">' + macros.map(opt).join('') + '</optgroup>'
        : list.map(opt).join('');
      return '<select class="inp mfield" aria-label="' + esc(ph) + '" data-chg="cfg-mod" data-f="' + f + '"><option value="">— ' + esc(ph) + ' —</option>'
        + (!value || list.indexOf(value) >= 0 ? '' : '<option value="' + esc(value) + '" selected>' + esc(value) + ' (introuvable dans Publipostage+)</option>')
        + body + '</select>';
    };
    const modelsNotice = kinds => {
      if (!mods) return '<div class="psub rnote">Lecture des modèles de Publipostage+…</div>';
      if (mods.error) return '<div class="psub rnote warn" role="status">Modèles de Publipostage+ illisibles : ' + esc(reviewErrorText(mods.error)) + '. Tapez le nom du modèle.</div>';
      const KIND = { mail: 'e-mail', letter: 'document ni macro-modèle' };
      const empty = kinds.filter(k => !mods[k].length).map(k => KIND[k]);
      if (!empty.length) return '';
      const counts = Object.keys(mods.counts).map(t => t + ' ' + mods.counts[t]).join(', ');
      return '<div class="psub rnote warn" role="status">Aucun modèle de type ' + empty.join(' ni ') + ' trouvé dans Publipostage+ (' + (mods.total ? mods.total + ' modèle' + (mods.total > 1 ? 's' : '') + ' lu' + (mods.total > 1 ? 's' : '') + ' : ' + esc(counts) : 'table vide') + '). Tapez le nom du modèle.</div>';
    };
    h += '<div class="fgrp">' + lbl('Modèles de mail', 'Modele_invitation', 'Modele_invitation_specifique', 'Modele_CR') + '<div class="rowf">' + ic('mail')
      + modelField('Modele_invitation', cfg.modInvitation, 'Modèle d\'invitation des invités habituels', 'mail')
      + ic('star') + modelField('Modele_invitation_specifique', cfg.modInvitationSpec, 'Modèle d\'invitation des invités spécifiques', 'mail')
      + ic('send') + modelField('Modele_CR', cfg.modCr, 'Modèle d\'envoi du compte rendu', 'mail') + '</div>' + modelsNotice(['mail']) + '</div>';
    // Notifications : le mail (modèle e-mail de Publipostage+) et le courrier (modèle document) lus par la vue « Relecture & envoi ».
    if (cfg.steps.indexOf('notifs') >= 0) {
      h += '<div class="fgrp">' + lbl('Modèles des notifications', 'Modele_notification', 'Modele_courrier_notification') + '<div class="rowf">' + ic('mail')
        + modelField('Modele_notification', cfg.modNotif, 'Modèle du mail de notification', 'mail')
        + ic('fileLines') + modelField('Modele_courrier_notification', cfg.modCourrier, 'Modèle du courrier de notification', 'letter') + '</div>' + modelsNotice(['mail', 'letter']) + '</div>';
    }
    return h + '</div></div></div>';
  }

  // ---------------------------------------------------------------------------------------------
  // Rendu — page
  // ---------------------------------------------------------------------------------------------
  const rootEl = () => document.getElementById('instances-root');
  function ensureSkeleton(root) {
    if (root.querySelector('[data-region="main"]')) return;
    root.className = 'in-root';
    root.innerHTML = '<div class="in-wrap"><div data-region="main"></div><div data-region="viewer"></div><div class="in-ppdock" data-region="dock" aria-label="Courrier lu par Publipostage+"></div></div>';
  }
  function buildMain() {
    if (!S.loaded) return withPrefix('<div class="loading">' + (S.errorHtml || esc(S.error || 'Chargement…')) + '</div>');
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
  // Sélecteur du contrôle de la vue « Relecture & envoi » (ou de son sélecteur) qui a le focus, pour le lui rendre après un rendu.
  function reviewFocusSel(el) {
    if (!el || !el.closest || !el.closest('.in-rev, .in-seg[aria-label="Affichage des notifications"], .in-ph .in-menu')) return '';
    const d = el.dataset || {}, kind = d.act ? 'act' : (d.chg ? 'chg' : '');
    if (!kind) return '';
    const val = v => String(v).replace(/["\\]/g, '\\$&'); // un libellé de programme peut contenir des guillemets
    return '[data-' + kind + '="' + d[kind] + '"]' + (d.id ? '[data-id="' + val(d.id) + '"]' : '') + (d.v ? '[data-v="' + val(d.v) + '"]' : '');
  }
  function render() {
    const root = rootEl(); if (!root) return;
    clearTimeout(renderTimer); renderTimer = null;
    ensureSkeleton(root);
    const main = root.querySelector('[data-region="main"]');
    const active = document.activeElement;
    // Case ou bouton de la relecture des notifications : le rendu les recrée (aussi quand le mail finit de se lire), le focus clavier revient dessus.
    const back = S.ui.rev.focusSel || reviewFocusSel(active); S.ui.rev.focusSel = '';
    main.innerHTML = buildMain();
    const focus = main.querySelector('[data-autofocus]');
    if (focus && active && !main.contains(active)) focus.focus();
    const again = back && main.querySelector(back); if (again) again.focus();
    autosizeTitles();
    renderViewer();
    syncReviewDoc();
    syncInvitation();
    syncCadre();
  }

  // « Plein cadre » : seulement sur les étapes Compte rendu et Envoi du CR (celles qui portent GFS) et tant que la page Instances est affichée. La classe de la page masque le
  // bandeau et les panneaux ; celle de <body> masque l'en-tête de l'appli (marque + onglets) et ses marges (voir css/instances.css).
  // Étapes qui portent GFS : le compte rendu et l'envoi du CR (même iframe, même « plein cadre »). Le mail d'invitation n'en fait plus partie (27/11/2026) : GFS gardait le dernier
  // fichier ouvert et le widget ne peut pas lui dire quel modèle ouvrir ; l'invitation se lit désormais dans Publipostage+ lui-même (voir invitationHtml).
  const GFS_STEPS = ['cr', 'crmail'];
  const viewerStepOf = V => (V && V.s && GFS_STEPS.indexOf(V.view) >= 0 ? V.view : '');
  function pleinActive() {
    const V = S.view, view = document.getElementById('view-instances');
    return !!(S.prefs.cadre.plein && S.loaded && viewerStepOf(V) && view && !view.classList.contains('hidden'));
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
    token: null, tokenAt: 0, mode: 'edit', pdfKey: '', pdfHandle: null, uploading: new Set(), targetOverride: null,
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
      .catch(err => { if (win) win.close(); if (global.CoreUtils) global.CoreUtils.toastFailure(err, 'Lecture impossible', { what: 'ouverture d\'une pièce jointe', table: cell && cell.tableId }); });
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
  // GFS (ou publipostage+ dedans) a écrit dans le document : la page ne relit QUE les colonnes qui l'intéressent (CR_PDF : le PDF exporté ;
  // Mail_invitation_le / Mail_CR_le : la date d'envoi d'un mail, que publipostage+ peut renseigner après l'envoi), et seulement la table
  // Suivi_Instance, avec un délai pour regrouper les écritures rapprochées. Avant, la moindre écriture de GFS dans Suivi_Instance
  // (enregistrement automatique pendant la frappe, par exemple) relisait toutes les tables de la page.
  const GFS_WATCHED_COLUMNS = [CR_PDF_COLUMN, 'Mail_invitation_le', 'Mail_CR_le'];
  const touchesWatched = actions => actions.some(a => {
    if (!Array.isArray(a) || a[1] !== 'Suivi_Instance') return false;
    const fields = a[0] === 'AddRecord' ? a[3] : (a[0] === 'UpdateRecord' || a[0] === 'BulkUpdateRecord' || a[0] === 'BulkAddRecord' ? a[3] : null);
    return !fields || typeof fields !== 'object' || GFS_WATCHED_COLUMNS.some(col => Object.prototype.hasOwnProperty.call(fields, col)); // forme inconnue : on relit par prudence
  });
  async function reloadSeancesFromGrist() {
    try { S.raw.Suivi_Instance = await global.CoreGrist.getTable('Suivi_Instance'); rebuild(); render(); } catch (err) { console.warn('Rechargement des séances :', err.message); }
  }
  function onGfsWrite(actions) {
    if (!Array.isArray(actions) || !touchesWatched(actions)) return;
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

  // Le PDF du compte rendu (Suivi_Instance.CR_PDF, la dernière pièce jointe) : déposé ici (bouton ou glisser-déposer), puis lu dans la visionneuse du widget
  // (pdf.js, PdfViewer.mount : comme les conventions et les notifications signées ; le lecteur PDF du navigateur ou une règle du poste téléchargerait le fichier).
  function releasePdf() {
    if (viewer.pdfHandle) { viewer.pdfHandle.destroy(); viewer.pdfHandle = null; }
  }
  function renderPdfPane(V, pane) {
    const pdf = crPdfOf(V.s), busy = viewer.uploading.has(V.s.id);
    const key = busy ? 'busy:' + V.s.id : (pdf.id ? 'pdf:' + V.s.id + ':' + pdf.id : 'none:' + V.s.id);
    if (key === viewer.pdfKey) return;
    viewer.pdfKey = key;
    releasePdf();
    pane.classList.remove('in-dropon');
    if (busy) { pane.innerHTML = withPrefix('<div class="vempty"><span class="muted">Envoi du PDF dans le document…</span></div>'); return; }
    if (!pdf.id) {
      pane.innerHTML = withPrefix('<div class="vempty vdrop" data-drop="cr">' + ic('upload')
        + '<span>Pas encore de PDF du compte rendu</span><span class="muted">Déposez-le ici (glisser-déposer) ou choisissez le fichier : exportez-le depuis GFS une fois le texte relu. Il s\'affiche ensuite dans cette page, et le bouton « Télécharger le CR » s\'active.</span>'
        + '<button type="button" class="pillbtn" ' + da('cr-upload') + '>' + ic('upload', 's') + 'Choisir le PDF</button></div>');
      return;
    }
    if (!global.PdfViewer || !global.PdfViewer.mount || !global.CoreAttachments) {
      pane.innerHTML = withPrefix('<div class="vempty"><span>Visionneuse indisponible</span><span class="muted">Le bouton d\'ouverture affiche le fichier dans un nouvel onglet.</span></div>');
      return;
    }
    viewer.pdfHandle = global.PdfViewer.mount(pane, { load: () => global.CoreAttachments.fetchBytes(pdf.id, pdf.cell) });
  }

  // Dépôt du PDF : le fichier est envoyé dans le document (pièce jointe), PUIS ajouté à la cellule CR_PDF de la séance (liste relue après l'envoi : un export de GFS
  // arrivé entre-temps n'est pas écrasé). La dernière pièce jointe est celle qu'on lit : une nouvelle version s'ajoute, les précédentes restent dans la cellule.
  const isPdfFile = file => !!file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));
  async function uploadCr(file) {
    const V = S.view; if (!V || !V.s) return;
    if (!isPdfFile(file)) { toast('Seuls les fichiers PDF sont acceptés', true); return; }
    const id = V.s.id;
    if (viewer.uploading.has(id)) return;
    if (!global.CoreAttachments || !global.CoreAttachments.upload) { toast('Dépôt de fichier indisponible', true); return; }
    viewer.uploading.add(id); render();
    let created = null;
    try {
      created = await global.CoreAttachments.upload(file);
      global.CoreAttachments.rememberName(created[0], file.name);
    } catch (err) {
      if (global.CoreUtils) global.CoreUtils.toastFailure(err, 'Échec du dépôt du compte rendu', { what: 'envoi du PDF du compte rendu dans le document', table: 'Suivi_Instance', columns: [CR_PDF_COLUMN] });
    }
    let done = false;
    if (created) {
      const current = S.model && S.model.seanceById[id] ? S.model.seanceById[id].crPdf : V.s.crPdf; // lue après l'envoi
      ensureStore();
      // Un échec d'écriture est signalé (et la page rechargée) par le store lui-même.
      done = await S.store.commit([upd('Suivi_Instance', id, { [CR_PDF_COLUMN]: D.toList(current.concat(created)) })]).then(() => true, () => false);
    }
    viewer.uploading.delete(id); viewer.pdfKey = ''; render();
    if (done) toast('Compte rendu « ' + file.name + ' » déposé');
  }
  function pickCrFile() {
    const V = S.view; if (!V || !V.s || viewer.uploading.has(V.s.id)) return;
    let input = document.querySelector('input[data-in-cr-file]');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file'; input.accept = '.pdf,application/pdf'; input.hidden = true; input.setAttribute('data-in-cr-file', '');
      input.addEventListener('change', () => { const file = input.files && input.files[0]; input.value = ''; if (file) uploadCr(file); }); // value vidée : le même fichier peut être rechoisi
      document.body.appendChild(input);
    }
    input.click();
  }
  // Glisser-déposer d'un fichier sur le volet du PDF (les glissements de points de l'ordre du jour ne passent pas par ici : S.drag).
  const crDropPane = e => (S.drag == null && e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0 && e.target.closest ? e.target.closest('[data-pane="pdf"]') : null);
  function onFileDragOver(e) {
    const pane = crDropPane(e); if (!pane || pane.hidden) return;
    e.preventDefault(); pane.classList.add('in-dropon');
  }
  function onFileDragLeave(e) {
    const pane = crDropPane(e); if (pane && !pane.contains(e.relatedTarget)) pane.classList.remove('in-dropon');
  }
  function onFileDrop(e) {
    const pane = crDropPane(e); if (!pane || pane.hidden) return;
    e.preventDefault(); pane.classList.remove('in-dropon');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) uploadCr(file);
  }
  function renderViewer() {
    const root = rootEl(); if (!root) return;
    const host = root.querySelector('[data-region="viewer"]'); if (!host) return;
    const V = S.view;
    const vstep = viewerStepOf(V), crm = vstep === 'crmail', mailStep = crm;
    const show = !!(S.loaded && vstep);
    host.hidden = !show; // masquée (pas détruite) hors de l'étape : GFS garde son état
    if (!show) {
      if (viewer.pdfKey) { viewer.pdfKey = ''; releasePdf(); const pane = host.querySelector('[data-pane="pdf"]'); if (pane) pane.innerHTML = ''; }
      return;
    }
    if (!host.firstChild) host.innerHTML = withPrefix('<div class="viewer"><div class="vbar"></div><div class="vbody"><div data-pane="gfs"></div><div data-pane="pdf" hidden></div></div></div>');
    // Envoi du CR : toujours GFS (pas de PDF à afficher) ; Compte rendu : GFS ou PDF exporté selon le choix de la barre.
    const edit = mailStep || viewer.mode === 'edit', hasPdf = V.s.crPdf.length > 0, cadre = S.prefs.cadre, plein = pleinActive();
    host.firstChild.dataset.h = cadre.hauteur;
    const hLabel = { 'ajustee': '1×', 'haute': '1,5×', 'tres-haute': '2,5×' }[cadre.hauteur];
    const c = crSummary(V), sub = plein ? '<span class="vname vsub"><strong>' + esc(V.inst.nom) + '</strong> · n°' + esc(V.s.num || '?') + ' · ' + esc(L.fmtDate(V.s.date) || 'sans date') + '</span>' : '';
    const status = '<span class="tag-soft ' + (viewer.gfs.phase === 'ready' ? 'ok' : '') + '" data-gfs-status>' + esc(gfsStatusLabel()) + '</span>';
    // Barre du mail d'envoi du compte rendu (étape 5) : même GFS que l'invitation (la ligne de la séance, le modèle d'envoi du CR de l'instance), et le PDF du CR à
    // portée pour le glisser dans le mail (le mailto: ne joint rien) ; sans PDF, le bouton mène à l'étape CR où on le dépose.
    const crmModel = V.cfg.modCr;
    const crmBar = sub + '<span class="vname">' + ic('send', 's') + 'Mail du compte rendu dans GFS</span>'
      + '<span class="tag-soft" data-crm-model title="' + esc(crmModel ? 'Modèle à ouvrir dans l\'explorateur de GFS (Publipostage+, type e-mail)' : 'Choisissez le modèle dans le paramétrage de l\'instance') + '">' + esc(crmModel ? 'Modèle : ' + crmModel : 'Aucun modèle choisi') + '</span>' + status
      + (hasPdf
        ? '<button type="button" class="pillbtn ghost" title="Ouvre le PDF du compte rendu : à glisser dans le mail" ' + da('cr-download') + '>' + ic('fileLines', 's') + 'PDF du CR</button>'
        : '<button type="button" class="pillbtn ghost" title="Pas encore de PDF : on le dépose dans l\'étape CR (PDF exporté)" ' + da('cr-pdf-go') + '>' + ic('upload', 's') + 'PDF du CR à déposer</button>')
      + '<span class="sp"></span>'
      + (plein ? DateInput.markup({ cls: 'dp', iso: V.s.mailCrLe, aria: "Date d'envoi du mail du compte rendu", attrs: 'data-chg="crm-date"' })
        + '<button type="button" class="rbtn" title="Envoyé aujourd\'hui" aria-label="Envoyé aujourd\'hui" ' + da('crm-today') + '>' + ic('calCheck') + '</button>' : '');
    const crBar = sub
      + '<div class="seg" role="group" aria-label="Affichage du compte rendu">'
      + '<button type="button" class="' + (edit ? 'on' : '') + '" ' + da('cr-mode', { v: 'edit' }) + '>' + ic('pencil', 's') + 'Rédiger dans GFS</button>'
      + '<button type="button" class="' + (edit ? '' : 'on') + '" ' + da('cr-mode', { v: 'pdf' }) + '>' + ic('fileLines', 's') + 'PDF exporté</button></div>'
      + (edit ? status : '<span class="vname">' + esc(hasPdf ? 'Compte rendu n°' + V.s.num + ' (PDF)' : 'Aucun PDF exporté') + '</span>')
      + (plein ? '<span class="tag-soft ' + (c.v0 ? 'ok' : '') + '">' + (c.v0 ? 'V0 rédigée' : 'V0 à rédiger') + (c.total ? ' · ' + c.valid + '/' + c.total + ' validé' : '') + '</span>' : '')
      + '<span class="sp"></span>';
    host.querySelector('.in-vbar').innerHTML = withPrefix(
      (crm ? crmBar : crBar)
      + (!mailStep && !edit ? '<button type="button" class="pillbtn ghost" ' + (viewer.uploading.has(V.s.id) ? 'disabled ' : '') + 'title="' + (hasPdf ? 'Déposer une nouvelle version : la dernière déposée s\'affiche, les précédentes restent dans la cellule' : 'Déposer le PDF du compte rendu') + '" ' + da('cr-upload') + '>' + ic('upload', 's') + (hasPdf ? 'Nouvelle version' : 'Déposer le PDF') + '</button>' : '')
      + (!mailStep && !edit && hasPdf ? '<button type="button" class="ibtn" title="Ouvrir le PDF dans un nouvel onglet" aria-label="Ouvrir le PDF dans un nouvel onglet" ' + da('cr-download') + '>' + ic('ext') + '</button>' : '')
      + (!mailStep && plein && hasPdf ? '<button type="button" class="ibtn" title="Télécharger le PDF du compte rendu" aria-label="Télécharger le CR" ' + da('cr-download') + '>' + ic('download', 's') + '</button>' : '')
      + (!plein && edit ? '<button type="button" class="pillbtn ghost" title="Hauteur de GFS : ' + HAUTEUR_LABEL[cadre.hauteur] + '. Cliquer pour l\'agrandir : le défilement de la page déplie alors GFS" aria-label="Hauteur de GFS" ' + da('cr-hauteur') + '>' + ic('vexpand', 's') + 'Hauteur ' + hLabel + '</button>' : '')
      + '<button type="button" class="pillbtn ghost" title="' + (plein ? 'Revenir à la page complète (touche Échap)' : 'Plein cadre : masque l\'en-tête et les panneaux, GFS prend toute la hauteur') + '" aria-label="' + (plein ? 'Quitter le plein cadre' : 'Plein cadre') + '" aria-pressed="' + (plein ? 'true' : 'false') + '" ' + da('cr-plein') + '>' + ic(plein ? 'shrink' : 'expand', 's') + (plein ? 'Quitter le plein cadre' : 'Plein cadre') + '</button>');
    host.querySelector('[data-pane="gfs"]').hidden = !edit;
    const pdfPane = host.querySelector('[data-pane="pdf"]');
    pdfPane.hidden = edit;
    if (edit) ensureGfs(V); else renderPdfPane(V, pdfPane);
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

  // Présentateur d'un point. Quelqu'un qui présente un point sans faire partie des invités par défaut de l'instance (liste permanente et
  // composition) est aussi invité, comme invité « spécifique » (ajouté sur un point), et relié à ce point : il y vient. Retirer le
  // présentateur ne retire jamais l'invité (il a pu être ajouté à la main, ou avoir déjà répondu) : la corbeille de la liste s'en charge.
  async function togglePresenter(V, pointId, personId) {
    const p = pointOf(V, pointId); if (!p) return;
    const on = p.presentateurs.indexOf(personId) >= 0;
    const list = on ? p.presentateurs.filter(x => x !== personId) : p.presentateurs.concat([personId]);
    write([upd('Instance_Points', p.id, { Presentateurs: D.toList(list) })]);
    if (on || defaultGuestIds(V.inst).indexOf(personId) >= 0) return;
    let g = V.s.guests.find(x => x.personneId === personId), gid = g && g.id;
    if (!g) {
      [gid] = await write([guestAdd(V.s.id, personId, C.origine.point)]);
      if (!gid) return;
    }
    if (p.invites.indexOf(gid) < 0) write([upd('Instance_Points', p.id, { Invites: D.toList(p.invites.concat([gid])) })]);
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
    'inst-pick': el => { const id = Number(el.dataset.id); S.ui.menu = null; if (S.prefs.instanceId !== id) { S.prefs.instanceId = id; render(); savePrefs(); } else render(); },
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
    'pt-pres': (el, V) => togglePresenter(V, el.dataset.id, Number(el.dataset.v)),
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
    'rep-show': () => { S.ui.repShown = !S.ui.repShown; render(); },
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
    'cr-upload': () => pickCrFile(),
    // Depuis l'étape « Envoi du CR » : va déposer le PDF (étape CR, vue PDF exporté).
    'cr-pdf-go': () => { viewer.mode = 'pdf'; setStep('cr'); },
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
    // notifications : vue « Relecture & envoi »
    'notif-vue': el => { if (NOTIF_VUES.indexOf(el.dataset.v) < 0) return; S.prefs.notifVue = el.dataset.v; S.ui.menu = null; S.ui.rev.focusSel = '[data-act="notif-vue"][data-v="' + el.dataset.v + '"]'; render(); savePrefs(); },
    // Filtre par programme (menu de l'en-tête, qui reste ouvert pour cocher plusieurs programmes) ; la sélection est retenue par utilisateur.
    'rev-prog': el => {
      const name = el.dataset.v, list = S.prefs.notifProgs, at = list.indexOf(name);
      if (at >= 0) list.splice(at, 1); else list.push(name);
      S.ui.rev.focusSel = '[data-act="rev-prog"][data-v="' + name.replace(/["\\]/g, '\\$&') + '"]'; // le rendu recrée le menu : le focus clavier revient sur la valeur cochée (reviewFocusSel pour les rendus suivants)
      render(); savePrefs();
    },
    'rev-prog-all': () => { S.prefs.notifProgs = []; S.ui.menu = null; render(); savePrefs(); },
    'rev-pick': el => { S.ui.rev.active = Number(el.dataset.id); S.ui.rev.focusSel = '[data-act="rev-pick"][data-id="' + Number(el.dataset.id) + '"]'; render(); },
    // Agrandir le mail ou le courrier : la classe du conteneur change, rien d'autre (pas de rendu, aucune relecture) ; le zoom de la feuille suit le volet (ResizeObserver).
    'rev-big': el => {
      const kind = el.dataset.v; if (kind !== 'mail' && kind !== 'doc') return;
      S.prefs.notifLarge = S.prefs.notifLarge === kind ? '' : kind;
      const rev = rootEl().querySelector('.in-rev');
      if (rev) { rev.classList.remove('in-big-mail', 'in-big-doc'); if (S.prefs.notifLarge) rev.classList.add('in-big-' + S.prefs.notifLarge); }
      rootEl().querySelectorAll('[data-act="rev-big"]').forEach(btn => {
        const on = btn.dataset.v === S.prefs.notifLarge, tip = (on ? 'Réduire ' : 'Agrandir ') + BIG_LABEL[btn.dataset.v];
        btn.setAttribute('aria-pressed', on ? 'true' : 'false'); btn.setAttribute('title', tip); btn.setAttribute('aria-label', tip);
      });
      savePrefs();
    },
    'rev-refresh': () => { S.ui.rev.focusSel = '[data-act="rev-refresh"]'; refreshReview(); },
    // « Modifier le modèle » : la page Rédaction (Publipostage+ en Édition) ouvre le modèle du volet pour le projet affiché ; « Retour » revient à la relecture.
    'rev-edit-model': (el, V) => {
      const kind = el.dataset.v, name = kind === 'mail' ? V.cfg.modNotif : (kind === 'doc' ? V.cfg.modCourrier : ''), cur = V.rev && V.rev.cur;
      if (!name || !cur || !global.PageRedaction || !global.PageRedaction.open || !global.VisaMail || !global.VisaMail.findModel) return;
      global.VisaMail.findModel(name, { cache: true }).then(found => {
        if (!found) { toast('Le modèle « ' + name + ' » n\'est plus dans Publipostage+.', true); return; }
        global.PageRedaction.open(cur.id, { modelId: found.id, from: 'view-instances', crumb: 'Instances · Relecture & envoi ·' });
      }).catch(err => toast('Modèles de Publipostage+ illisibles : ' + global.CoreUtils.failureReason(err, { op: 'read', table: 'Publipostage_Templates' }), true));
    },
    // étape Mail d'invitation (même vue que « Relecture & envoi » : liste à gauche, mail lu par Publipostage+ à droite)
    'inv-pick': el => {
      const v = el.dataset.v, I = S.ui.inv; if (!v) return;
      leaveInvEdit(); I.sel = v === 'usual' ? 'usual' : Number(v);
      S.ui.rev.focusSel = '[data-act="inv-pick"][data-v="' + v + '"]'; render();
    },
    // Une pastille pour toute la liste habituelle : « Ecrit_le » de chaque habitué (rien d'autre n'est écrit dans Grist d'ici).
    'inv-usual-written': (el, V) => {
      const usual = invGroups(V).usual; if (!usual.length) return;
      const done = usual.every(g => g.ecritLe), day = gristDay(V.today);
      write((done ? usual : usual.filter(g => !g.ecritLe)).map(g => upd('Instance_Invites', g.id, { Ecrit_le: done ? null : day })));
    },
    'inv-refresh': () => {
      const I = S.ui.inv; I.nonce++; leaveInvEdit();
      if (global.VisaMail && global.VisaMail.clearCache) global.VisaMail.clearCache(); // les modèles et les lignes sont relus
      S.ui.rev.focusSel = '[data-act="inv-refresh"]'; rebuild(); render();
    },
    // « Modifier le modèle » sur place : Publipostage+ sort de la lecture épurée et passe en Édition, sur le même modèle et la même ligne ; le même bouton revient à la lecture.
    'inv-edit': () => {
      const I = S.ui.inv, K = I.kinds[I.active];
      if (!K || !K.reader || !K.reader.frame || K.reader.phase === 'failed') { toast('Publipostage+ n\'est pas affiché ici : le modèle ne peut pas se modifier depuis cette vue pour le moment.', true); return; }
      if (I.editing) leaveInvEdit();
      else if (K.reader.edit()) I.editing = true;
      S.ui.rev.focusSel = '[data-act="inv-edit"]'; render();
    },
    'inv-open': () => {
      const R = S.ui.inv.mail; if (R.status !== 'ok' || !R.draft) return;
      global.VisaMail.openLink(R.draft.url);
      toast('Brouillon ouvert dans votre messagerie.');
    },
    'inv-copy': () => {
      const d = S.ui.inv.mail.draft; if (S.ui.inv.mail.status !== 'ok' || !d) return;
      copyText((d.fields.subject ? d.fields.subject + '\n\n' : '') + d.bodyText).then(ok => toast(ok ? 'Objet et corps du mail copiés.' : 'Copie impossible : sélectionnez le texte à la main.', !ok));
    },
    'rev-open': (el, V) => {
      const d = S.ui.rev.mail.draft, cur = V.rev && V.rev.cur;
      if (!cur || cur.state === 'draft' || S.ui.rev.mail.status !== 'ok' || !d) return;
      global.VisaMail.openLink(d.url);
      toast('Brouillon ouvert pour ' + cur.acro + ' : glissez la pièce jointe dans le mail.');
    },
    'rev-copy': (el, V) => {
      const d = S.ui.rev.mail.draft, cur = V.rev && V.rev.cur;
      if (!cur || cur.state === 'draft' || S.ui.rev.mail.status !== 'ok' || !d) return;
      copyText((d.fields.subject ? d.fields.subject + '\n\n' : '') + d.bodyText).then(ok => toast(ok ? 'Objet et corps du mail copiés.' : 'Copie impossible : sélectionnez le texte à la main.', !ok));
    },
    'rev-generate': (el, V) => generateLetters(V),
    'rev-download': (el, V) => { const cur = V.rev && V.rev.cur; if (cur && cur.fileId) global.CoreAttachments.open(cur.fileId, { tableId: NOTIF_SIGNEES.tableId, colId: NOTIF_SIGNEES.colId, rowId: cur.id }); },
    'vp-toggle': () => setMenu('vpconfirm'),
    'vp-cancel': () => { S.ui.menu = null; render(); },
    'vp-confirm': (el, V) => confirmVp(V),
    // paramétrage
    'settings-open': () => { S.ui.settings = true; S.ui.menu = null; ensureModelNames(); render(); },
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
    // Champs date jj/mm/aaaa (DateInput) : iso() vaut null pour une saisie incomplète ou fausse (champ signalé), alors rien n'est écrit.
    'inv-date': (el, V) => { const iso = DateInput.iso(el); if (iso !== null) write(setInvitationDate(V, iso), { defer: true }); },
    'crm-date': (el, V) => { const iso = DateInput.iso(el); if (iso !== null) write([upd('Suivi_Instance', V.s.id, { Mail_CR_le: gristDay(iso) })], { defer: true }); },
    'seance-date': (el, V) => {
      const iso = DateInput.iso(el);
      if (!iso) return;
      write([upd('Suivi_Instance', V.s.id, { date: gristDay(iso), Heure: L.parisToEpoch(iso, V.s.heure) })], { defer: true });
    },
    'cfg-mod': (el, V) => cfgWrite(V, { [el.dataset.f]: el.value.trim() }),
    'rev-check': el => { S.ui.rev.checked[Number(el.dataset.id)] = el.checked; S.ui.rev.focusSel = '[data-chg="rev-check"][data-id="' + Number(el.dataset.id) + '"]'; render(); },
    'rev-all': (el, V) => { if (!V.rev) return; V.rev.drafts.forEach(i => { S.ui.rev.checked[i.id] = el.checked; }); S.ui.rev.focusSel = '[data-chg="rev-all"]'; render(); },
    'rev-zimbra': el => { S.prefs.messagerie = el.checked ? 'zimbra' : ''; S.ui.rev.focusSel = '[data-chg="rev-zimbra"]'; render(); savePrefs(); }
  };

  function currentView() { return S.loaded && S.model && S.model.instances.length ? computeView() : null; }
  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || !rootEl().contains(el)) return;
    const handler = CLICK[el.dataset.act]; if (!handler) return;
    const V = currentView(); if (!V || !V.inst) return;
    if (el.disabled) return;
    if (V.s || el.dataset.act === 'inst-pick' || (el.dataset.act === 'menu' && el.dataset.v === 'inst') || el.dataset.act === 'seance-new' || el.dataset.act.indexOf('settings') === 0 || el.dataset.act.indexOf('cfg-') === 0 || el.dataset.act === 'menu-close') handler(el, V);
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
    } else if (e.target.matches && e.target.matches('[data-instopt]') && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) >= 0) {
      // groupe de boutons radio : les flèches choisissent l'instance voisine (en boucle) et gardent le focus sur le bouton choisi
      const radios = Array.from(e.target.closest('.in-instsw').querySelectorAll('[data-instopt]')), at = radios.indexOf(e.target);
      const next = radios[(at + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + radios.length) % radios.length];
      e.preventDefault();
      if (next && next !== e.target) { next.click(); const on = rootEl().querySelector('.in-instsw [aria-checked="true"]'); if (on) on.focus(); }
    } else if (e.target.matches && e.target.matches('input[data-filter]') && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
      menuKeyNav(e, e.target);
    } else if (e.key === 'Enter' && e.target.matches && e.target.matches('input[data-chg]:not([data-dp]), textarea[data-chg]')) {
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
    root.addEventListener('dragover', onFileDragOver);
    root.addEventListener('dragleave', onFileDragLeave);
    root.addEventListener('drop', onFileDrop);
    let resizeTimer = null;
    global.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(autosizeTitles, 120); });
    // L'entrée « Instances » de la barre de navigation n'a plus de menu (le choix d'instance est dans le bandeau de la page) : un clic
    // ouvre la page (js/app.js : data-view) et lance son chargement.
    const btn = document.getElementById('btn-instances');
    if (btn) btn.addEventListener('click', () => { ensureLoaded(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  global.loadInstancesUserPreferences = loadInstancesUserPreferences;
  // Appelée par js/app.js après un rechargement des tables du widget : recalcule seulement si la page est déjà chargée.
  global.renderInstances = function () { if (S.loaded) { S.ui.rev.mail.nonce++; S.ui.rev.doc.nonce++; if (global.VisaMail && global.VisaMail.clearCache) global.VisaMail.clearCache(); rebuild(); render(); } }; // données rechargées : le mail et le courrier se relisent
  global.InstancesPage = {
    open: ensureLoaded, render, state: S, _setToday: iso => { todayOverride = iso; }, _setWarm: on => { warmEnabled = !!on; }, _setReader: (on, opts) => { reader.on = !!on; reader.target = opts && opts.target || null; reader.opts = opts && opts.pace || {}; }, _reader: () => S.ui.rev.doc.reader, _setGfsTarget: target => { viewer.targetOverride = target; }, _gfs: viewer.gfs, _onGfsWrite: onGfsWrite, _init: init, _reset() {
      clearTimeout(renderTimer); renderTimer = null;
      S.loaded = false; S.loading = null; S.error = ''; S.errorHtml = ''; S.store = null; S.model = null; S.view = null; S.drag = null;
      S.prefs = { instanceId: null, seances: {}, etape: 'macro', vue: DEFAULT_VUE, odjVue: 'timing', cadre: defaultCadre(), invTri: '', notifVue: 'suivi', messagerie: '', notifLarge: '', notifProgs: [] }; S.prefsRowId = null; S.personId = 0;
      releaseDoc(true); releaseInv(true); S.ui = { menu: null, settings: false, subs: {}, repShown: false, rev: newRev(), inv: newInv() };
      setRaw({}); dropGfs(); releasePdf(); viewer.uploading.clear(); viewer.pdfKey = ''; viewer.token = null; viewer.mode = 'edit'; viewer.targetOverride = null;
      document.body.classList.remove('in-plein-body');
      const root = rootEl(); if (root) { root.classList.remove('in-plein'); root.innerHTML = ''; }
    }
  };
})(window);
