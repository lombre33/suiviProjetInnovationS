/** Page « par instance » — règles pures (sans DOM ni Grist), partagées par
 * js/pages/page-instances.js et testées dans tests/suite-instances.js.
 *
 * Maquette validée par Antoine le 09/11/2026 (V4, « tout est ok, go
 * implémenter une V1 »), https://claude.ai/artifact/TNA7aRTFGZcvV1858SGzPe.
 * Une séance = une ligne de Suivi_Instance ; ce fichier ne connaît que des
 * objets déjà normalisés (voir page-instances.js, section « Normalisation »).
 */
(function (root) {
  'use strict';

  // --- Étapes d'une séance (ordre fixe). `stored` = libellé gardé dans Grist
  // (Instances.Etapes_actives, Instance_Validations.Etape). ---
  const STEPS = [
    { key: 'odj', label: 'Ordre du jour', short: 'Ordre du jour', chip: 'ODJ', stored: 'Ordre du jour' },
    { key: 'invites', label: 'Invités', short: 'Invités', chip: 'Invités', stored: 'Invités' },
    { key: 'invitation', label: "Mail d'invitation", short: 'Invitation', chip: 'Invitation', stored: "Mail d'invitation" },
    { key: 'cr', label: 'Compte rendu', short: 'Compte rendu', chip: 'CR', stored: 'Compte rendu' },
    { key: 'crmail', label: 'Envoi du compte rendu', short: 'Envoi du CR', chip: 'Envoi CR', stored: 'Envoi du compte rendu' },
    { key: 'notifs', label: 'Notifications liées', short: 'Notifications', chip: 'Notifs', stored: 'Notifications liées' }
  ];
  const ALL_STEP_KEYS = STEPS.map(s => s.key);
  // Étapes qui se valident par une action propre (sans ligne Instance_Validations) : leur date vaut validation.
  const DATE_STEPS = ['invitation', 'crmail'];

  // --- Instances présentées par la page (demande d'Antoine du 10/11/2026 : seulement CTO Innovation et Comité innovation) ---
  // `match` : nom de l'instance, sans casse ni accents, comme mot entier(s) ; `steps` : étapes suivies tant que
  // Instances.Etapes_actives est vide (le Comité innovation n'a ni envoi du CR ni notifications). Le paramétrage de
  // l'instance reste prioritaire dès qu'il a été enregistré.
  const normName = value => String(value == null ? '' : value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const INSTANCE_RULES = [
    // heures : les deux heures de début proposées d'un clic pour les séances du CTO (Antoine 12/11/2026), écrites dans Suivi_Instance.Heure
    { match: 'cto innovation', steps: ALL_STEP_KEYS.slice(), heures: ['09:00', '10:45'] },
    { match: 'comite innovation', steps: ['odj', 'invites', 'invitation', 'cr'] }
  ];
  function instanceRule(name) {
    const padded = ' ' + normName(name) + ' ';
    return INSTANCE_RULES.find(rule => padded.indexOf(' ' + rule.match + ' ') >= 0) || null;
  }

  // --- Séances d'une instance : la prochaine et la dernière épinglées, puis « à venir » et « passées » ---
  // `today` : 'AAAA-MM-JJ'. next = la plus proche à partir d'aujourd'hui (aujourd'hui compris), last = la plus récente
  // avant aujourd'hui ; upcoming (sans next, date croissante, puis sans date) et past (sans last, la plus récente d'abord).
  function groupSeances(seances, today) {
    const dated = seances.filter(x => x.date);
    const upcomingAll = dated.filter(x => x.date >= today).sort((a, b) => (a.date < b.date ? -1 : (a.date > b.date ? 1 : a.id - b.id)));
    const pastAll = dated.filter(x => x.date < today).sort((a, b) => (a.date < b.date ? 1 : (a.date > b.date ? -1 : b.id - a.id)));
    const undated = seances.filter(x => !x.date).sort((a, b) => b.id - a.id);
    return { next: upcomingAll[0] || null, last: pastAll[0] || null, upcoming: upcomingAll.slice(1).concat(undated), past: pastAll.slice(1) };
  }

  // --- Valeurs de colonnes Choice (libellés Grist <-> clés internes) ---
  const CHOICES = {
    nature: { validation: 'Validation', discussion: 'Discussion', information: 'Information' },
    reponse: { attente: 'À confirmer', viendra: 'Viendra', excuse: 'Excusé(e)' },
    appel: { present: 'Présent(e)', absent: 'Absent(e)' },
    origine: { permanent: 'Liste permanente', point: 'Ajouté sur un point' },
    relecture: { modifs: 'Modifs demandées', valide: 'Validée' },
    lien: { gfs: 'Fichier GFS', externe: 'Lien externe' }
  };
  function choiceKey(map, label, fallback) {
    const text = label == null ? '' : String(label);
    const hit = Object.keys(map).find(key => map[key] === text);
    return hit || fallback;
  }

  // --- Temps ---
  function toMin(t) {
    if (t == null || t === '') return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(String(t));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }
  function hhmm(n) {
    const total = Math.max(0, Math.round(n));
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }
  function durTxt(n) {
    const h = Math.floor(n / 60), m = n % 60;
    if (!h) return m + ' min';
    return h + ' h' + (m ? ' ' + String(m).padStart(2, '0') : '');
  }
  function fmtDate(iso) {
    if (!iso) return '';
    const a = String(iso).slice(0, 10).split('-');
    return a.length === 3 ? a[2] + '/' + a[1] + '/' + a[0] : '';
  }
  function fmtShort(iso) {
    if (!iso) return '';
    const a = String(iso).slice(0, 10).split('-');
    return a.length === 3 ? a[2] + '/' + a[1] : '';
  }
  function addDaysIso(iso, n) {
    const t = new Date(iso + 'T00:00:00Z');
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  }
  // Date Grist (secondes depuis 1970, minuit UTC) <-> 'AAAA-MM-JJ'.
  function gristDateToIso(value) {
    if (value == null || value === '' || value === 0) return '';
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    const d = new Date(n * 1000);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  function isoToGristDate(iso) {
    if (!iso) return null;
    const ms = new Date(iso + 'T00:00:00Z').getTime();
    return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
  }
  // DateTime Grist (colonne Suivi_Instance.Heure, fuseau Europe/Paris) : lecture / écriture de l'heure locale.
  const PARIS = 'Europe/Paris';
  function parisParts(epochSec) {
    const n = Number(epochSec);
    if (!Number.isFinite(n) || n === 0) return null;
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: PARIS, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const parts = {};
    fmt.formatToParts(new Date(n * 1000)).forEach(p => { parts[p.type] = p.value; });
    return { date: parts.year + '-' + parts.month + '-' + parts.day, time: parts.hour + ':' + parts.minute };
  }
  function parisToEpoch(iso, time) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    const mins = toMin(time);
    if (!m || mins === null) return null;
    const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Math.floor(mins / 60), mins % 60);
    const offsetAt = ms => {
      const p = parisParts(ms / 1000);
      const asUtc = Date.UTC(Number(p.date.slice(0, 4)), Number(p.date.slice(5, 7)) - 1, Number(p.date.slice(8, 10)), Number(p.time.slice(0, 2)), Number(p.time.slice(3, 5)));
      return asUtc - ms;
    };
    let result = guess - offsetAt(guess);
    result = guess - offsetAt(result); // second passage : change d'heure à la frontière
    return Math.floor(result / 1000);
  }

  function notifNum(label) {
    const m = /^(\d+)\)/.exec(label == null ? '' : String(label));
    return m ? Number(m[1]) : 0;
  }
  function stripOrdinal(label) { return String(label == null ? '' : label).replace(/^\d+\)\s*/, ''); }
  function shortName(name) {
    const a = String(name || '').trim().split(/\s+/).filter(Boolean);
    return a.length > 1 ? a[0].charAt(0) + '. ' + a[a.length - 1] : (a[0] || '');
  }
  function cut(text, n) { return text.length > n ? text.slice(0, n - 1) + '…' : text; }
  // Initiales d'un nom : première lettre du premier et du dernier mot (« Jean-Pierre Martin » -> « JM »).
  function initials(name) {
    const a = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!a.length) return '';
    const first = Array.from(a[0])[0] || '', last = a.length > 1 ? (Array.from(a[a.length - 1])[0] || '') : '';
    return (first + last).toLocaleUpperCase('fr');
  }

  // --- Ordre du jour : créneaux et conflits ---
  // Durée « effective » d'un point : la sienne, SAUF quand il porte des sous-points et qu'ils ont tous une durée — alors il prend leur
  // total (demande d'Antoine du 10/11/2026). Tant qu'un sous-point reste vide (durée 0), le point garde sa durée et les sous-points
  // renseignés s'y découpent. Sa durée saisie n'est jamais écrasée : si un sous-point est vidé, le point retrouve sa durée.
  const subsTotal = p => (p.subs || []).reduce((t, q) => t + (Number(q.duree) || 0), 0);
  const subsAllFilled = p => (p.subs || []).length > 0 && p.subs.every(q => Number(q.duree) > 0);
  const dureeOf = p => (subsAllFilled(p) ? subsTotal(p) : Number(p.duree) || 0);
  function schedule(points, startMin) {
    let t = startMin || 0;
    return points.map(p => {
      const start = t;
      t += dureeOf(p);
      return { p, start, end: t };
    });
  }
  // Sous-points (11/2026) : un point peut porter des sous-points (même forme, `p.subs`), repliés par défaut dans la page. Le premier
  // sous-point commence avec le parent, chacun suit le précédent. `top` = les points de l'ordre du jour (comme `schedule`), chaque
  // ligne portant `subRows` (+ `subTotal`, `subAll` : tous renseignés → le point prend le total, `subOver` : minutes de dépassement
  // du point quand des sous-points restent vides) ; `all` = tout à plat dans l'ordre de lecture (parent, ses sous-points, point
  // suivant…), pour les invités, les conflits de disponibilité et les projets reliés.
  function scheduleWithSubs(points, startMin) {
    const top = schedule(points, startMin), all = [];
    top.forEach(row => {
      all.push(row);
      let t = row.start;
      row.subRows = (row.p.subs || []).map(sp => { const start = t; t += Number(sp.duree) || 0; return { p: sp, start, end: t, parentId: row.p.id, sub: true }; });
      row.subTotal = t - row.start;
      row.subAll = subsAllFilled(row.p);
      row.subOver = row.subRows.length && !row.subAll ? Math.max(0, row.subTotal - (Number(row.p.duree) || 0)) : 0;
      row.subRows.forEach(r => all.push(r));
    });
    return { top, all };
  }
  const allPoints = s => (s.points || []).reduce((list, p) => list.concat([p], p.subs || []), []);
  // Ordre du jour, vue « par type de décision » : tous les points, groupés d'abord pour validation, puis discussion, puis
  // information (l'ordre de passage est conservé dans chaque groupe). Jamais un filtre : un groupe vide n'est simplement pas listé.
  const NATURE_ORDER = ['validation', 'discussion', 'information'];
  function groupByNature(sched) {
    return NATURE_ORDER.map(nature => ({ nature, rows: sched.filter(r => r.p.nature === nature) })).filter(g => g.rows.length);
  }
  function guestClash(guest, start, end, name) {
    if (!guest) return '';
    if (guest.reponse === 'excuse') return name + ' : excusé(e)';
    const a = toMin(guest.dispoDe), b = toMin(guest.dispoA);
    if ((a !== null && start < a) || (b !== null && end > b)) {
      return name + ' : disponible ' + (guest.dispoDe || '…') + '–' + (guest.dispoA || '…') + ', point ' + hhmm(start) + '–' + hhmm(end);
    }
    return '';
  }
  // { idPoint: ['Nom : message', …] } — seulement les points en conflit.
  function computeConflicts(sched, guestsById, nameOf) {
    const out = {};
    sched.forEach(row => {
      row.p.invites.forEach(gid => {
        const guest = guestsById[gid];
        const msg = guestClash(guest, row.start, row.end, guest ? nameOf(guest.personneId) : '');
        if (msg) (out[row.p.id] = out[row.p.id] || []).push(msg);
      });
    });
    return out;
  }
  // Premier horaire où l'invité est attendu (le plus tôt, sous-points compris : `sched` peut être le tableau à plat de scheduleWithSubs).
  function firstStartOf(sched, guestId) {
    let best = null;
    sched.forEach(r => { if (r.p.invites.indexOf(guestId) >= 0 && (best === null || r.start < best)) best = r.start; });
    return best === null ? '' : hhmm(best);
  }
  // 'none' (aucun point : pas d'horaire) | 'todo' | 'sent' | 'stale' (l'horaire a bougé depuis l'envoi)
  function horaireState(guest, firstStart) {
    const sent = !!guest.passageLe;
    if (!firstStart) return sent ? 'sent' : 'none';
    if (!sent) return 'todo';
    return guest.passageHeure === firstStart ? 'sent' : 'stale';
  }

  // --- Notifications : statut de mise à disposition du VP (table Export_VP) ---
  // exportRow = { aEnvoyer, le, par, signee, signeeLe } ou undefined ; stage = numéro du statut Notifications.
  function vpState(exportRow, stage) {
    if (exportRow && exportRow.aEnvoyer) {
      if (exportRow.signee) {
        return { key: 'signed', cls: 'ok', short: 'Signée', label: exportRow.signeeLe ? 'Signée le ' + fmtShort(exportRow.signeeLe) : 'Signée', tip: exportRow.signeeLe ? 'Signée le ' + fmtDate(exportRow.signeeLe) + ' (retour de l\'outil du VP)' : 'Signée (retour de l\'outil du VP)' };
      }
      return { key: 'wait', cls: 'cur', short: 'Attente VP', label: 'En attente de signature', tip: 'Mise à disposition le ' + fmtDate(exportRow.le) };
    }
    if (stage >= 6) return { key: 'signed', cls: 'ok', short: 'Signée', label: 'Signée (statut Grist)', tip: 'Statut « 6) Signée » déjà renseigné dans Notifications' };
    return { key: 'none', cls: 'todo', short: 'À mettre à dispo', label: 'Non mise à disposition', tip: 'Pas encore mise à disposition du VP' };
  }

  // --- Validation des étapes ---
  // ctx : { seance, cfg, sched, conflicts, guests, relectures, validations, endMin, personName, projectVp }
  function isValid(key, ctx) {
    if (key === 'invitation') return !!ctx.seance.mailInvitationLe;
    if (key === 'crmail') return !!ctx.seance.mailCrLe;
    return !!(ctx.validations && ctx.validations[key]);
  }
  function validatedInfo(key, ctx, personName) {
    if (key === 'invitation') return ctx.seance.mailInvitationLe ? 'Envoyé le ' + fmtDate(ctx.seance.mailInvitationLe) : '';
    if (key === 'crmail') return ctx.seance.mailCrLe ? 'Envoyé le ' + fmtDate(ctx.seance.mailCrLe) : '';
    const v = ctx.validations && ctx.validations[key];
    if (!v) return '';
    const by = v.par && personName ? personName(v.par) : '';
    return 'Validé le ' + fmtDate(v.le) + (by ? ' par ' + by : '');
  }
  // Une condition : { ok, text, warn?, chip? }. `warn` = alerte non bloquante ; sans `warn`, la condition bloque la validation.
  function stepConditions(key, ctx) {
    const { seance, cfg, sched, conflicts, guests, relectures } = ctx;
    const nconf = Object.keys(conflicts).length;
    const plural = (n, one, many) => n + ' ' + (n > 1 ? many : one);
    if (key === 'odj') {
      const startMin = toMin(seance.heure) || 0;
      const end = sched.length ? sched[sched.length - 1].end : startMin;
      const lim = ctx.endMin;
      const nSubOver = sched.filter(r => r.subOver > 0).length;
      return [
        { ok: seance.points.length > 0, text: 'Au moins un point' },
        { ok: seance.points.every(p => String(p.titre).trim() && dureeOf(p) > 0), text: 'Un titre et une durée pour chaque point' },
        { warn: true, chip: true, ok: nconf === 0, text: plural(nconf, 'point en conflit de disponibilité', 'points en conflit de disponibilité') },
        { warn: true, ok: nSubOver === 0, text: plural(nSubOver, 'point dont les sous-points durent plus que lui', 'points dont les sous-points durent plus qu\'eux') },
        { warn: true, ok: end <= lim, text: 'Fin prévue ' + hhmm(end) + ', après la fin de l\'instance (' + hhmm(lim) + ')' }
      ];
    }
    if (key === 'invites') {
      return [
        { ok: guests.length > 0, text: 'Au moins un invité' },
        { warn: true, chip: true, ok: nconf === 0, text: plural(nconf, 'point où un invité est indisponible', 'points où un invité est indisponible') }
      ];
    }
    if (key === 'invitation') {
      const pending = guests.filter(g => { const st = horaireState(g, firstStartOf(ctx.schedAll || sched, g.id)); return st === 'todo' || st === 'stale'; }).length;
      return [
        { ok: !!seance.mailInvitationLe, text: "Date d'envoi du mail" },
        { warn: true, ok: pending === 0, text: plural(pending, 'horaire de passage à envoyer', 'horaires de passage à envoyer') }
      ];
    }
    if (key === 'cr') {
      const rel = cfg.relecteurs;
      const nModifs = rel.filter(id => relectures[id] && relectures[id].statut === 'modifs').length;
      return [
        { ok: !!seance.v0, text: 'V0 rédigée' },
        { ok: rel.every(id => relectures[id] && relectures[id].statut === 'valide'), text: 'Relecture validée par ' + (rel.map(id => shortName(ctx.personName(id))).join(' et ') || 'les relecteurs') },
        { warn: true, ok: nModifs === 0, text: nModifs + (nModifs > 1 ? ' relecteurs ont demandé des modifications' : ' relecteur a demandé des modifications') },
        { warn: true, ok: !!(seance.crPdf && seance.crPdf.length), text: 'PDF du compte rendu pas encore exporté depuis GFS' }
      ];
    }
    if (key === 'crmail') return [{ ok: !!seance.mailCrLe, text: "Date d'envoi du mail" }];
    const unsigned = ctx.projectIds.filter(id => ctx.projectVp[id].key !== 'signed').length;
    return [{ warn: true, ok: unsigned === 0, text: plural(unsigned, 'notification pas encore signée', 'notifications pas encore signées') }];
  }

  // --- Composition des instances : table « Composition instances » du document (demande d'Antoine du 10/11/2026) ---
  // Les invités par défaut d'une instance (CTO Innovation, Comité innovation) viennent de cette table. Sa structure exacte n'est pas
  // connue d'ici : on retrouve la table par son nom, puis ses colonnes « instance » et « personne » par leurs VALEURS (références
  // de ligne ou textes qui désignent une instance / une personne de l'Annuaire), le nom de la colonne départageant les cas ambigus.
  function findCompositionTable(ids) {
    const named = (ids || []).map(id => ({ id, n: normName(id) }));
    const hit = named.find(x => x.n === 'composition instances') || named.find(x => /composition/.test(x.n) && /instance/.test(x.n)) || named.find(x => /composition/.test(x.n));
    return hit ? hit.id : null;
  }
  const isListCell = v => Array.isArray(v) && v[0] === 'L';
  // ctx = { instances: [{id, nom}], people: [{id, name, email}], types?: {colId: 'Ref:Instances'…}, instancesTable?, peopleTable?, refNames?: {table: {id: libellé}} }.
  // `types` (métadonnées Grist) rend la lecture AUTORITAIRE : un identifiant numérique n'est lu comme une instance que si la colonne est
  // une référence vers la table des instances (jamais un nombre ordinaire, jamais une référence vers une autre table dont les numéros
  // coïncideraient par hasard : c'était la cause d'invités d'une instance donnés à une autre). Une référence vers une AUTRE table
  // (`refNames`) est lue par le libellé de la ligne. Sans `types` (document illisible), les valeurs seules servent, les numéros
  // n'étant admis que dans une colonne dont le nom évoque l'instance.
  function detectComposition(rows, ctx) {
    const result = { ok: false, instanceCol: '', personCol: '', instanceType: '', personType: '', byInstance: {}, perInstance: [], total: 0, resolved: 0, unresolved: 0, reason: '' };
    rows = rows || [];
    const instances = (ctx && ctx.instances) || [], people = (ctx && ctx.people) || [];
    const types = (ctx && ctx.types) || {}, instTable = (ctx && ctx.instancesTable) || 'Instances', peopleTable = (ctx && ctx.peopleTable) || 'Annuaire', refNames = (ctx && ctx.refNames) || {};
    result.total = rows.length; result.columns = [];
    if (!rows.length) { result.reason = 'La table est vide.'; return result; }
    const cols = Object.keys(rows.reduce((set, r) => Object.assign(set, r), {})).filter(k => k !== 'id' && k !== 'manualSort' && !/^gristHelper/.test(k));
    result.columns = cols;
    const instById = {}, instByName = {}, personById = {}, personByName = {}, personByEmail = {};
    instances.forEach(i => { instById[i.id] = i; instByName[normName(i.nom)] = i; });
    people.forEach(p => { personById[p.id] = p; personByName[normName(p.name)] = p; if (p.email) personByEmail[String(p.email).trim().toLowerCase()] = p; });
    const cells = v => (isListCell(v) ? v.slice(1) : [v]).filter(x => x !== null && x !== undefined && x !== '' && x !== 0);
    // Une instance désignée par un texte : nom exact ; sinon l'UNIQUE instance dont le nom figure en mots entiers dans le texte
    // (« CTO Innovation 2026 ») ; deux instances nommées dans le texte (« COPIL du comité innovation ») = ambigu, donc aucune.
    const instByLabel = v => {
      const n = normName(v); if (!n) return null;
      if (instByName[n]) return instByName[n];
      const inside = instances.filter(i => { const m = normName(i.nom); return m && (' ' + n + ' ').indexOf(' ' + m + ' ') >= 0; });
      if (inside.length === 1) return inside[0];
      if (inside.length > 1) return null;
      const rule = instanceRule(v);
      return rule && (n === rule.match || n.indexOf(rule.match + ' ') === 0) ? (instances.find(i => instanceRule(i.nom) === rule) || null) : null;
    };
    const personByText = v => personByEmail[String(v).trim().toLowerCase()] || personByName[normName(v)] || null;
    const typeOf = col => (types[col] && types[col] !== 'Any' ? String(types[col]) : ''); // « Any » (colonne formule) = type inconnu
    const refTarget = col => { const m = /^Ref(?:List)?:(.+)$/.exec(typeOf(col)); return m ? m[1] : ''; };
    const isTextType = col => /^(Text|Choice|ChoiceList)$/.test(typeOf(col));
    const instHint = /instance/i, personHint = /personne|membre|invit|particip|annuaire|agent|contact|nom|prenom|mail/i;
    // Lecteur d'une colonne : null = la colonne ne peut pas désigner (par ses métadonnées) ce qu'on cherche.
    const instReader = col => {
      const t = refTarget(col);
      if (t === instTable) return v => (typeof v === 'number' ? instById[v] || null : null);
      if (t) { const names = refNames[t]; return names ? (v => (typeof v === 'number' && names[v] ? instByLabel(names[v]) : null)) : null; }
      if (typeOf(col)) return isTextType(col) ? (v => (typeof v === 'number' ? null : instByLabel(v))) : null;
      return v => (typeof v === 'number' ? (instHint.test(col) ? instById[v] || null : null) : instByLabel(v));
    };
    const personReader = col => {
      const t = refTarget(col);
      if (t === peopleTable) return v => (typeof v === 'number' ? personById[v] || null : null);
      if (t) return null;
      if (typeOf(col)) return isTextType(col) ? (v => (typeof v === 'number' ? null : personByText(v))) : null;
      return v => (typeof v === 'number' ? personById[v] || null : personByText(v));
    };
    const score = (col, of) => {
      let total = 0, hit = 0;
      rows.forEach(r => cells(r[col]).forEach(v => { total++; if (of(v)) hit++; }));
      return total ? hit / total : 0;
    };
    const pick = (readerOf, hint, bonus, exclude, table) => cols.filter(c => c !== exclude).map(c => ({ c, of: readerOf(c) })).filter(x => x.of)
      .map(x => { const raw = score(x.c, x.of); return { c: x.c, of: x.of, raw, v: raw + (hint.test(x.c) ? bonus : 0) + (refTarget(x.c) === table ? 1 : 0) }; })
      .filter(x => x.raw >= 0.5).sort((a, b) => b.v - a.v)[0];
    const inst = pick(instReader, instHint, 0.5, null, instTable);
    if (!inst) { result.reason = 'Aucune colonne ne désigne une instance du document.'; return result; }
    const pers = pick(personReader, personHint, 0.3, inst.c, peopleTable);
    if (!pers) { result.reason = 'Aucune colonne ne désigne une personne de l\'Annuaire.'; return result; }
    result.ok = true; result.instanceCol = inst.c; result.personCol = pers.c; result.instanceType = typeOf(inst.c); result.personType = typeOf(pers.c);
    rows.forEach(r => {
      const is = cells(r[inst.c]).map(inst.of).filter(Boolean), ps = cells(r[pers.c]).map(pers.of).filter(Boolean);
      if (!is.length || !ps.length) { result.unresolved++; return; }
      result.resolved++;
      is.forEach(i => { const list = result.byInstance[i.id] = result.byInstance[i.id] || []; ps.forEach(p => { if (list.indexOf(p.id) < 0) list.push(p.id); }); });
    });
    // Combien de personnes par instance : permet de repérer d'un coup d'œil un mauvais rapprochement.
    result.perInstance = instances.map(i => ({ id: i.id, nom: i.nom, n: (result.byInstance[i.id] || []).length })).filter(x => x.n > 0);
    return result;
  }

  // --- Tri des invités (étape Invités) : clic sur l'en-tête Personne / Réponse / Appel du jour ---
  // `tri` = 'clé:sens' avec clé nom | reponse | appel et sens asc | desc ; vide = ordre d'origine (invités ajoutés sur un point d'abord).
  // Réponse en croissant : viendra, à confirmer, excusé ; appel en croissant : présent, pas encore appelé, absent (donc « présents d'abord »).
  // À égalité, nom de A à Z (quel que soit le sens).
  const GUEST_TRI = /^(nom|reponse|appel):(asc|desc)$/;
  const DEFAULT_REPONSE_RANK = { excuse: 0, viendra: 1, attente: 2 };
  const GUEST_RANK = { reponse: { viendra: 0, attente: 1, excuse: 2 }, appel: { present: 0, '': 1, absent: 2 } };
  // Grade du poste (Postes2.grade, saisi par Antoine le 12/11/2026 : VP, Directeur.trice etablissement, Agent, Direction service,
  // assitant.e) → 'vp' | 'dir' | '' : seuls les VP et les directeur.trice.s d'établissement sont mis en couleur dans les séances.
  function gradeKind(grade) {
    const n = normName(grade);
    if (!n) return '';
    if (/^vp\b|\bvice president\b/.test(n)) return 'vp';
    if (/^directeur\b.*\betablissement\b/.test(n)) return 'dir';
    return '';
  }
  // Invités : deux listes, d'abord ceux ajoutés sur un point (« spécifiques »), et parmi eux les VP, puis les directeur.trice.s
  // d'établissement ; `kindOf(guest)` donne 'vp' | 'dir' | ''. Un tri choisi par clic sur un en-tête s'applique ensuite dans chaque liste.
  function sortGuests(guests, tri, nameOf, kindOf) {
    const kindRank = g => { const k = kindOf ? kindOf(g) : ''; return k === 'vp' ? 0 : (k === 'dir' ? 1 : 2); };
    // Ordre par défaut de chaque liste (Antoine 12/11) : les VP puis directeur.trice.s d'abord (invités spécifiques seulement), puis les
    // excusés, ceux qui viennent, et enfin les « à confirmer » ; l'ordre d'origine départage.
    const repRank = g => { const r = DEFAULT_REPONSE_RANK[g.reponse]; return r === undefined ? 2 : r; };
    const base = guests.map((g, i) => ({ g, i })).sort((a, b) => {
      if (a.g.origine !== b.g.origine) return a.g.origine === 'point' ? -1 : 1;
      if (a.g.origine === 'point' && kindRank(a.g) !== kindRank(b.g)) return kindRank(a.g) - kindRank(b.g);
      return repRank(a.g) - repRank(b.g) || a.i - b.i;
    });
    const m = GUEST_TRI.exec(tri || '');
    if (!m) return base.map(x => x.g);
    const key = m[1], sign = m[2] === 'desc' ? -1 : 1;
    const byName = (x, y) => String(nameOf(x.g)).localeCompare(String(nameOf(y.g)), 'fr', { sensitivity: 'base' });
    const rank = x => { const r = GUEST_RANK[key][key === 'reponse' ? x.g.reponse : (x.g.appel || '')]; return r === undefined ? 1 : r; };
    // Les deux listes restent séparées (spécifiques d'abord) : le tri choisi s'applique DANS chacune.
    const grp = x => (x.g.origine === 'point' ? 0 : 1);
    return base.sort((x, y) => {
      if (grp(x) !== grp(y)) return grp(x) - grp(y);
      if (key === 'nom') return sign * byName(x, y) || x.i - y.i;
      return sign * (rank(x) - rank(y)) || (grp(x) === 0 ? kindRank(x.g) - kindRank(y.g) : 0) || byName(x, y) || x.i - y.i;
    }).map(x => x.g);
  }
  // Clic sur un en-tête : croissant, puis décroissant, puis retour à l'ordre d'origine ; un autre en-tête repart en croissant.
  function nextGuestTri(current, key) {
    const m = GUEST_TRI.exec(current || '');
    if (!m || m[1] !== key) return key + ':asc';
    return m[2] === 'asc' ? key + ':desc' : '';
  }

  // Recherche dans un menu : `hay` et `query` déjà passés par normName ; chaque mot de la recherche doit figurer dans le texte.
  const matchesSearch = (hay, query) => String(query || '').split(' ').every(word => !word || String(hay).indexOf(word) >= 0);

  const api = {
    findCompositionTable, detectComposition, matchesSearch, gradeKind, sortGuests, nextGuestTri, GUEST_TRI,
    STEPS, ALL_STEP_KEYS, DATE_STEPS, CHOICES, choiceKey, INSTANCE_RULES, normName, instanceRule, groupSeances,
    toMin, hhmm, durTxt, fmtDate, fmtShort, addDaysIso, gristDateToIso, isoToGristDate, parisParts, parisToEpoch,
    notifNum, stripOrdinal, shortName, initials, cut,
    schedule, scheduleWithSubs, allPoints, dureeOf, subsAllFilled, subsTotal, NATURE_ORDER, groupByNature, guestClash, computeConflicts, firstStartOf, horaireState, vpState,
    isValid, validatedInfo, stepConditions
  };
  root.InstancesLogic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
