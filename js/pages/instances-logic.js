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

  // --- Ordre du jour : créneaux et conflits ---
  function schedule(points, startMin) {
    let t = startMin || 0;
    return points.map(p => {
      const start = t;
      t += Number(p.duree) || 0;
      return { p, start, end: t };
    });
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
  function firstStartOf(sched, guestId) {
    const row = sched.find(r => r.p.invites.indexOf(guestId) >= 0);
    return row ? hhmm(row.start) : '';
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
      return [
        { ok: seance.points.length > 0, text: 'Au moins un point' },
        { ok: seance.points.every(p => String(p.titre).trim() && Number(p.duree) > 0), text: 'Un titre et une durée pour chaque point' },
        { warn: true, chip: true, ok: nconf === 0, text: plural(nconf, 'point en conflit de disponibilité', 'points en conflit de disponibilité') },
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
      const pending = guests.filter(g => { const st = horaireState(g, firstStartOf(sched, g.id)); return st === 'todo' || st === 'stale'; }).length;
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
        { warn: true, ok: !!seance.crLien, text: 'Document du compte rendu non lié' }
      ];
    }
    if (key === 'crmail') return [{ ok: !!seance.mailCrLe, text: "Date d'envoi du mail" }];
    const unsigned = ctx.projectIds.filter(id => ctx.projectVp[id].key !== 'signed').length;
    return [{ warn: true, ok: unsigned === 0, text: plural(unsigned, 'notification pas encore signée', 'notifications pas encore signées') }];
  }

  const api = {
    STEPS, ALL_STEP_KEYS, DATE_STEPS, CHOICES, choiceKey,
    toMin, hhmm, durTxt, fmtDate, fmtShort, addDaysIso, gristDateToIso, isoToGristDate, parisParts, parisToEpoch,
    notifNum, stripOrdinal, shortName, cut,
    schedule, guestClash, computeConflicts, firstStartOf, horaireState, vpState,
    isValid, validatedInfo, stepConditions
  };
  root.InstancesLogic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
