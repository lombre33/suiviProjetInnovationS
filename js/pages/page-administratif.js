/** Page Administratif — deux colonnes Notifications / Conventions, volets par
 * étape de statut (repliables et masquables, même patron que le Kanban Projets,
 * cf. js/pages/page-projets.js). Maquette validée par Antoine le 18/09/2026
 * (https://claude.ai/artifact/MELwepYao8LfGeVgNKY18W).
 *
 * Libellés exacts de statut (Choice Grist, chaîne complète avec le préfixe
 * "N) " — confirmé par docs/grist_structure : Statut_Macro compare littéralement
 * à "5) Convention signée de toutes les parties" et "8) Archivee").
 */
(function () {
  'use strict';
  const NOTIF_STAGES = [
    '1) Information projet saisies',
    '2) Notification_relecture',
    '3) Prette pour CTO',
    '4) complète',
    '5) envoyée pour signature VP',
    '6) Signée',
    '7) Transmise au porteur',
    '8) Archivee'
  ];
  // Étapes Conventions_statut redéfinies par Antoine le 29/09/2026 (5 → 4 étapes).
  const CONV_STAGES = [
    '1) Convention en redaction',
    '2) Convention en relecture',
    '3) Convention en signature',
    '4) Convention signée de toutes les parties'
  ];
  // Anciennes valeurs Choice, tant que des lignes Grist n'ont pas été migrées :
  // sans ça, un projet portant encore l'ancien libellé disparaîtrait de tous les
  // volets. Lecture seule — toute écriture utilise les libellés ci-dessus.
  const CONV_LEGACY_STAGE_INDEX = {
    '2) Convention Relecture Partenaire(s)': 1,
    '3) Convention en signature UB': 2,
    '4) Convention en signature partenaire': 2,
    '5) Convention signée de toutes les parties': 3
  };
  // Colonnes ajoutées le 29/09/2026 (absentes de docs/grist_structure) ; la table
  // qui les porte (Projets ou Notifications) est déduite des colonnes chargées.
  const NEXT_STEP_FIELD = 'next_step';
  const TRANSMISE_FIELD = 'Transmise_signee_au_porteur_le';
  const LINK_FIELD = 'Lien_convention';
  // Date de début du projet (Projets.Date_debut_Projet, Date Grist = secondes
  // epoch à minuit UTC) affichée en lecture seule sur chaque carte, colorée selon
  // l'urgence (demande d'Antoine du 01/10/2026). Seuils en jours AVANT le début,
  // par onglet : en dessous de `red` rouge, jusqu'à `orange` orange, au-delà de
  // 60 jours vert, entre les deux neutre. Date passée = rouge. Inclusif côté
  // orange pour Notifications ("entre une et trois semaines"), strict pour
  // Conventions ("moins de 2 semaines", "moins d'un mois", mois = 30 jours).
  const START_DATE_FIELD = 'Date_debut_Projet';
  const URGENCY_GREEN_ABOVE_DAYS = 60;
  const URGENCY_RULES = {
    notif: { redBelow: 7, orangeUpTo: 21, orangeInclusive: true },
    conv: { redBelow: 14, orangeUpTo: 30, orangeInclusive: false }
  };
  const URGENCY_LABELS = { red: 'urgent', orange: 'à surveiller', green: 'pas d\'urgence', neutral: '' };
  const ICON_CALENDAR = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>';
  // 4 états (ajout de "Non relu" le 18/09/2026 — pas de puce remplie, état par
  // défaut avant toute relecture). Les 3 points de la bulle se remplissent un
  // par un jusqu'à l'étape atteinte (0, 1, 2 ou 3 points).
  const PARTNER_STATUSES = ['Non relu', 'Relu', 'en cours de signature', 'Signé'];
  const PARTNER_STATUS_STYLES = [
    { bg: '#eef1f6', text: '#98a2b3', border: '#dde2ea' },
    { bg: '#e8f0fe', text: '#2558c4', border: '#c7dbfd' },
    { bg: '#fef3e0', text: '#b45309', border: '#fbd9a5' },
    { bg: '#e5f6ee', text: '#1a8f5e', border: '#bfe6d3' }
  ];
  // Une icône par état (cercle vide / œil / crayon / coche), pour lire le statut
  // sans avoir à comparer un remplissage — barre de progression en complément
  // (maquette validée par Antoine le 19/09/2026, variante "Barres").
  const PARTNER_ICONS = [
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="8"></circle></svg>',
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7 21l-4 1 1-4z"></path></svg>',
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"></path></svg>'
  ];
  const ICON_CHEVRON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  const ICON_EYE_OFF = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.3 20.3 0 0 1-3.22 4.44M14.12 14.12a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
  // Icône "œil ouvert" — symétrique de ICON_EYE_OFF (même eye-off sans la barre),
  // utilisée pour restaurer un volet masqué (demande du 01/10/2026 : le "+"
  // précédent n'était pas assez clair).
  const ICON_EYE = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
  const ICON_VIEW_CARDS = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.3"></rect><rect x="14" y="3" width="7" height="7" rx="1.3"></rect><rect x="3" y="14" width="7" height="7" rx="1.3"></rect><rect x="14" y="14" width="7" height="7" rx="1.3"></rect></svg>';
  const ICON_GRIP = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.7"></circle><circle cx="15" cy="6" r="1.7"></circle><circle cx="9" cy="12" r="1.7"></circle><circle cx="15" cy="12" r="1.7"></circle><circle cx="9" cy="18" r="1.7"></circle><circle cx="15" cy="18" r="1.7"></circle></svg>';
  const ICON_EXTERNAL = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>';
  const ICON_LINK_EDIT = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.83 2.83 0 1 1 4 4L7 21l-4 1 1-4z"></path></svg>';
  const ICON_LINK_ADD = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>';
  const ICON_VIEW_ROWS ='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>';

  const text = value => value == null ? '' : String(value);
  const escape = CoreUtils.escapeHtml;
  const tableRows = name => (window.CoreState && CoreState.getTable(name)) || [];
  const rowById = (tableName, id) => tableRows(tableName).find(row => String(row.id) === String(id));
  const refId = value => (value && typeof value === 'object') ? (value.id ?? value) : value;
  const refLabel = (value, tableName, fields = []) => {
    if (Array.isArray(value)) return value.filter(item => item !== 'L').map(item => refLabel(item, tableName, fields)).filter(Boolean).join(', ');
    if (!value) return ''; // référence vide (0 côté Grist) — jamais afficher "0"
    const row = tableName ? rowById(tableName, refId(value)) : null;
    const candidate = row || (value && typeof value === 'object' ? value : null);
    if (candidate) {
      for (const name of fields) if (candidate[name] != null && candidate[name] !== '') return text(candidate[name]);
      return text(candidate.NOM || candidate.nom_et_Prenom || candidate.name || candidate.label || candidate.Acronyme || candidate.id);
    }
    return text(value);
  };
  const valueLabel = (value, tableName, fields) => Array.isArray(value) ? value.map(item => refLabel(item, tableName, fields)).filter(Boolean).join(', ') : refLabel(value, tableName, fields);
  const programmeLabel = value => valueLabel(value, 'Programmes', ['Programme']);
  const personLabel = value => {
    if (Array.isArray(value)) return value.map(personLabel).filter(Boolean).join(', ');
    if (!value) return ''; // référence vide (0 côté Grist) — jamais afficher "0"
    const row = rowById('Annuaire', refId(value));
    if (row) return text(row.nom_et_Prenom || [row.NOM, row.Prenom].filter(Boolean).join(' '));
    if (value && typeof value === 'object') return text(value.nom_et_Prenom || [value.NOM, value.Prenom].filter(Boolean).join(' ') || value.name || value.id);
    return text(value);
  };
  const instanceLabel = value => {
    if (Array.isArray(value)) return value.map(instanceLabel).filter(Boolean).join(', ');
    const suivi = rowById('Suivi_Instance', refId(value));
    if (suivi) return refLabel(suivi, null, ['Nom', 'name']) || valueLabel(suivi.Instance, 'Instances', ['Instances']);
    return valueLabel(value, 'Instances', ['Instances']);
  };
  const normalized = value => text(value).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const field = (project, names) => { for (const name of names) if (project[name] != null && project[name] !== '') return project[name]; return ''; };
  const stripOrdinal = label => text(label).replace(/^\d+\)\s*/, '');
  const referencedIds = value => Array.isArray(value) ? value.filter(item => item !== 'L' && item != null && item !== 0) : [];

  // CTO#xx : extrait du libellé complet de l'instance rattachée (même résolution
  // que page-projets.js/project-modal.js) — champ source exact encore à confirmer
  // par Antoine côté Grist (Instances.Instances), cf. mémoire d'équipe.
  function ctoRef(project) {
    const label = instanceLabel(field(project, ['Instance_ratachee', 'Instance', 'Instances']));
    const match = text(label).match(/CTO\s*#?\s*(\d+)/i);
    return match ? `CTO#${match[1]}` : '';
  }

  function getProjects() { return (window.CoreState && CoreState.getTable('Projets')) || []; }
  function projectById(id) { return getProjects().find(p => String(p.id) === String(id)); }
  function getNotifications() { return (window.CoreState && CoreState.getTable('Notifications')) || []; }
  function notifRowFor(projectId) { return getNotifications().find(row => String(refId(row.Projet)) === String(projectId)); }
  function notifStageIndex(projectId) {
    const row = notifRowFor(projectId);
    return row ? NOTIF_STAGES.indexOf(text(row.notifications_Statut)) : -1;
  }
  // Un projet n'entre dans l'onglet Conventions que si sa case « Convention de
  // reversement » est cochée : même règle que le Kanban Projets (classifyStatus) et
  // que la formule Statut_Macro de Grist. Sans ce filtre, TOUS les projets s'y
  // retrouvaient, car Conventions_statut vaut « Convention en redaction » par défaut
  // pour n'importe quelle ligne (signalé par Antoine le 01/10/2026).
  function needsConvention(project) {
    const value = project.Convention_de_reversement;
    return value === true || value === 1 || ['true', 'oui', 'cochee'].includes(normalized(value));
  }
  function convStageIndex(project) {
    const value = text(project.Conventions_statut);
    const idx = CONV_STAGES.indexOf(value);
    if (idx !== -1) return idx;
    if (Object.prototype.hasOwnProperty.call(CONV_LEGACY_STAGE_INDEX, value)) return CONV_LEGACY_STAGE_INDEX[value];
    // Libellé sans numéro d'étape (ex. valeur par défaut de la colonne dans Grist).
    const bare = normalized(stripOrdinal(value));
    return bare ? CONV_STAGES.findIndex(stage => normalized(stripOrdinal(stage)) === bare) : -1;
  }

  // next_step / date de transmission / lien : la table d'origine n'est pas
  // documentée, on l'infère des colonnes réellement chargées (Projets par
  // défaut, puis la fiche Notifications du projet).
  function homeRowFor(project, column) {
    if (!(column in project)) {
      const notifRow = notifRowFor(project.id);
      if (notifRow && column in notifRow) return { table: 'Notifications', row: notifRow };
    }
    return { table: 'Projets', row: project };
  }
  function readField(project, column) { return homeRowFor(project, column).row[column]; }
  // Valeur locale mise à jour AVANT l'écriture : un rendu déclenché pendant
  // l'aller-retour Grist (clic ailleurs) ne doit pas réafficher l'ancienne valeur
  // — un blur ultérieur l'écraserait alors dans Grist. Annulée si l'écriture échoue.
  async function writeProjectColumn(project, column, value) {
    const { table, row } = homeRowFor(project, column);
    const existed = column in row;
    const previous = row[column];
    row[column] = value;
    try {
      await writeFields(table, row.id, { [column]: value });
    } catch (err) {
      if (existed) row[column] = previous; else delete row[column];
      throw err;
    }
  }
  // Seuls http(s) sont ouvrables : une valeur saisie directement dans Grist
  // (ex. "javascript:...") ne doit jamais devenir un href cliquable.
  function normalizeLink(raw) {
    const value = text(raw).trim();
    if (!value) return { value: '' };
    // "monserveur:8080/doc" est un hôte:port, pas un schéma.
    const withScheme = /^[a-z][a-z0-9+.-]*:(?!\d+(?:[/?#]|$))/i.test(value) ? value : `https://${value}`;
    let url;
    try { url = new URL(withScheme); } catch (err) { return { error: 'Lien invalide' }; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { error: 'Seuls les liens http(s) sont acceptés' };
    return { value: url.href };
  }
  const safeLink = raw => normalizeLink(raw).value || '';
  function partnerStatusIndex(project, fieldName) {
    const idx = PARTNER_STATUSES.indexOf(text(project[fieldName]));
    return idx === -1 ? 0 : idx;
  }

  function partnersFor(project) {
    const etabs = referencedIds(project.Partenaire_s_convention_reversement).map(id => rowById('Etablissements', id)).filter(Boolean);
    const defs = [{ label: 'UB', field: 'convention_statut_UB' }];
    if (etabs[0]) defs.push({ label: text(etabs[0].Acronyme || etabs[0].Nom_complet), field: 'convention_statut_partenaire_1' });
    if (etabs[1]) defs.push({ label: text(etabs[1].Acronyme || etabs[1].Nom_complet), field: 'convention_statut_partenaire_2' });
    return defs.map(def => ({ ...def, statusIndex: partnerStatusIndex(project, def.field) }));
  }

  // Horloge remplaçable (tests). "Aujourd'hui" est une date CALENDAIRE locale, pas un
  // instant : la date de début est un jour (minuit UTC), l'écart en jours ne dépend
  // donc ni de l'heure de la journée ni des changements d'heure.
  let nowFn = () => new Date();
  function daysUntilStart(epochSeconds) {
    const now = nowFn();
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.floor((epochSeconds * 1000 - todayUtc) / 86400000);
  }
  function urgencyTone(side, days) {
    const rule = URGENCY_RULES[side];
    if (days < rule.redBelow) return 'red'; // inclut les dates passées
    if (rule.orangeInclusive ? days <= rule.orangeUpTo : days < rule.orangeUpTo) return 'orange';
    return days > URGENCY_GREEN_ABOVE_DAYS ? 'green' : 'neutral';
  }
  function relativeDays(days) {
    if (days === 0) return 'aujourd\'hui';
    if (days === 1) return 'demain';
    if (days === -1) return 'hier';
    return days > 0 ? `dans ${days} jours` : `il y a ${-days} jours`;
  }
  // null quand la colonne est vide ou illisible : alors rien ne s'affiche.
  // Étape terminée (isDone) : la date reste visible mais sans couleur d'alerte,
  // l'urgence ne s'applique plus.
  function startDateInfo(project, side, isDone) {
    const raw = project[START_DATE_FIELD];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
    const iso = CoreUtils.gristDateToInput(raw); // '' pour 0 / hors plage
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null; // années à 4 chiffres seulement
    const days = daysUntilStart(raw);
    const tone = isDone ? 'neutral' : urgencyTone(side, days);
    const [year, month, day] = iso.split('-');
    const sentence = [relativeDays(days), URGENCY_LABELS[tone]].filter(Boolean).join(', ');
    return { iso, tone, display: `${day}/${month}/${year}`, sentence };
  }
  // Pastille en lecture seule ; chaîne vide quand il n'y a pas de date : rien n'est affiché.
  function startDateChip(project, side, isDone) {
    const info = startDateInfo(project, side, isDone);
    if (!info) return '';
    return `<span class="admin-start is-${info.tone}" data-start-date="${escape(project.id)}" data-urgency="${info.tone}" title="${escape(`Début du projet le ${info.display} (${info.sentence})`)}">` +
      `${ICON_CALENDAR}<time datetime="${escape(info.iso)}">${escape(info.display)}</time>` +
      `<span class="visually-hidden"> — début du projet, ${escape(info.sentence)}</span></span>`;
  }

  // État d'affichage des volets (repliés / masqués) et du mode cartes/lignes —
  // purement local à la session, pas de persistance Grist (même choix que le
  // Kanban Projets).
  const panelState = {};
  function panelKey(side, idx) { return `${side}:${idx}`; }
  // Préférences chargées depuis Grist (voir loadAdministratifUserPreferences),
  // appliquées volet par volet au moment de sa toute première création dans
  // panelState — contrairement au Kanban Projets, panelState est peuplé
  // paresseusement (un volet n'existe qu'une fois rendu au moins une fois),
  // donc on ne peut pas écraser panelState directement au chargement.
  let pendingAdminPrefs = null;
  function ensurePanelState(side, idx, isInitiallyEmpty) {
    const key = panelKey(side, idx);
    if (!panelState[key]) {
      // Un volet sans aucun projet démarre replié — repli INITIAL uniquement,
      // un dépli/repli manuel de l'utilisateur n'est jamais écrasé ensuite —
      // sauf préférence sauvegardée, qui prime sur cette heuristique.
      const collapsed = pendingAdminPrefs
        ? (side === 'notif' ? pendingAdminPrefs.notifCollapsed : pendingAdminPrefs.convCollapsed).has(idx)
        : !!isInitiallyEmpty;
      const hidden = pendingAdminPrefs
        ? (side === 'notif' ? pendingAdminPrefs.notifHidden : pendingAdminPrefs.convHidden).has(idx)
        : false;
      panelState[key] = { collapsed, hidden };
    }
    return panelState[key];
  }
  let viewMode = 'rows';
  // Sous-onglet actif (le choix "2 colonnes côte à côte" a été abandonné le
  // 19/09/2026 : Antoine veut toute la largeur pour la vue lignes, et le
  // sélecteur logé dans le bandeau de filtre pour ne pas prendre de hauteur
  // en plus).
  let activeTab = 'notif';
  // Édition du lien de convention (un seul champ ouvert à la fois), carte glissée.
  let editingLinkId = null;
  let draggingCard = null;

  // Persistance des volets repliés/masqués (table Grist partagée avec le
  // Kanban Projets, cf. js/pages/page-projets.js — même id de ligne mis en
  // cache dans localStorage, une seule ligne de préférences par navigateur
  // pour toutes les pages). Signalé par Antoine le 19/09/2026 : ce choix
  // n'était pas du tout persisté sur cette page.
  const PREFS_TABLE = 'Preferences_Widget';
  const PREFS_ROWID_STORAGE_KEY = 'suiviProjetInnovationS:prefsRowId';
  // Colonne minimale si CETTE page doit créer la table elle-même — cas qui ne
  // devrait jamais se produire en pratique (js/app.js charge toujours les
  // préférences Kanban en premier, qui créent la table complète), gardé pour
  // ne pas dépendre de cet ordre.
  const EMAIL_TRIGGER_COLUMN = { id: 'Email_utilisateur', type: 'Text', isFormula: false, formula: 'user.Email if not $Email_utilisateur else $Email_utilisateur', recalcWhen: 0 };
  const ADMIN_PREFS_COLUMNS = [
    { id: 'Admin_notif_repliees', type: 'Text' },
    { id: 'Admin_notif_masquees', type: 'Text' },
    { id: 'Admin_conv_repliees', type: 'Text' },
    { id: 'Admin_conv_masquees', type: 'Text' }
  ];
  let prefsRowId = null;
  const encodeIdxList = indices => indices.join(',');
  const decodeIdxList = value => text(value).split(',').map(s => s.trim()).filter(Boolean).map(Number);
  function getCachedPrefsRowId() {
    try { const raw = localStorage.getItem(PREFS_ROWID_STORAGE_KEY); return raw ? Number(raw) : null; }
    catch (err) { return null; }
  }
  function setCachedPrefsRowId(id) {
    try { localStorage.setItem(PREFS_ROWID_STORAGE_KEY, String(id)); }
    catch (err) { /* navigation privée / stockage bloqué : tant pis, pas de persistance entre sessions */ }
  }

  function comboValue(id) {
    const input = document.getElementById(id);
    return input?.dataset.selectedValue || '';
  }
  function currentFilters() {
    return {
      programme: comboValue('admin-filter-programme'),
      instance: comboValue('admin-filter-instance'),
      search: normalized(document.getElementById('admin-filter-search')?.value)
    };
  }
  function filteredProjects() {
    const filters = currentFilters();
    return getProjects().filter(project => {
      const acronym = text(project.Acronyme);
      const programme = programmeLabel(field(project, ['Programme', 'Programme_Axe_InnovationS']));
      const instance = instanceLabel(field(project, ['Instance_ratachee', 'Instance', 'Instances']));
      return (!filters.programme || programme === filters.programme) &&
        (!filters.instance || instance === filters.instance) &&
        (!filters.search || normalized(acronym).includes(filters.search));
    });
  }
  function options(fieldNames, query = '') {
    const isInstance = fieldNames.some(name => ['Instance_ratachee', 'Instance', 'Instances'].includes(name));
    const wanted = normalized(query);
    return [...new Set(getProjects()
      .map(project => isInstance ? instanceLabel(field(project, fieldNames)) : programmeLabel(field(project, fieldNames)))
      .map(value => text(value).trim())
      .filter(value => value && normalized(value) !== '0' && (!wanted || normalized(value).includes(wanted)))
    )].sort((a, b) => a.localeCompare(b, 'fr'));
  }
  function renderCombo(id, values, placeholder) {
    const input = document.getElementById(id);
    const list = document.getElementById(`${id}-list`);
    if (!input || !list) return;
    list.innerHTML = `<button type="button" data-value="">${escape(placeholder)}</button>` +
      values.map(value => `<button type="button" data-value="${escape(value)}">${escape(value)}</button>`).join('');
    list.querySelectorAll('[data-value]').forEach(button => button.addEventListener('mousedown', event => {
      event.preventDefault();
      input.dataset.selectedValue = button.dataset.value;
      input.value = button.dataset.value;
      list.hidden = true;
      render();
    }));
  }
  function renderFilters() {
    renderCombo('admin-filter-programme', options(['Programme', 'Programme_Axe_InnovationS'],
      document.getElementById('admin-filter-programme')?.value), 'Tous les programmes');
    renderCombo('admin-filter-instance', options(['Instance_ratachee', 'Instance', 'Instances'],
      document.getElementById('admin-filter-instance')?.value), 'Toutes les instances');
  }
  function setupCombo(id, fieldNames, placeholder) {
    const input = document.getElementById(id);
    const list = document.getElementById(`${id}-list`);
    if (!input || !list) return;
    input.addEventListener('focus', () => { list.hidden = false; renderCombo(id, options(fieldNames, input.value), placeholder); });
    input.addEventListener('input', () => { input.dataset.selectedValue = ''; list.hidden = false; renderCombo(id, options(fieldNames, input.value), placeholder); render(); });
    input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; if (!input.dataset.selectedValue) input.value = ''; }, 150));
  }

  async function writeFields(table, id, fields) {
    const api = window.CoreGrist?.gristInstance;
    if (!api) throw new Error('API Grist indisponible');
    await api.docApi.applyUserActions([['UpdateRecord', table, Number(id), fields]]);
  }

  function setProjectField(projectId, fieldName, value) {
    const project = getProjects().find(p => String(p.id) === String(projectId));
    if (project) project[fieldName] = value;
  }

  async function advanceNotif(projectId, acronym) {
    const row = notifRowFor(projectId);
    if (!row) { CoreUtils.showToast(`Aucune fiche Notifications pour ${acronym}`, true); return; }
    const idx = NOTIF_STAGES.indexOf(text(row.notifications_Statut));
    if (idx === -1 || idx >= NOTIF_STAGES.length - 1) return;
    const nextValue = NOTIF_STAGES[idx + 1];
    try {
      await writeFields('Notifications', row.id, { notifications_Statut: nextValue });
      row.notifications_Statut = nextValue;
      CoreUtils.showToast(`${acronym} → ${stripOrdinal(nextValue)}`);
      render();
    } catch (err) { CoreUtils.showToast(`Échec de l'écriture (${err.message})`, true); }
  }

  // Glisser-déposer d'une carte vers un autre volet Conventions (remplace le
  // bouton "Suivant →", demande d'Antoine du 29/09/2026) : permet aussi de
  // revenir en arrière ou de sauter des étapes.
  async function moveConv(projectId, targetIdx) {
    const project = getProjects().find(p => String(p.id) === String(projectId));
    if (!project || !(targetIdx >= 0 && targetIdx < CONV_STAGES.length)) return;
    if (convStageIndex(project) === targetIdx) return;
    const nextValue = CONV_STAGES[targetIdx];
    try {
      await writeFields('Projets', project.id, { Conventions_statut: nextValue });
      setProjectField(project.id, 'Conventions_statut', nextValue);
      CoreUtils.showToast(`${project.Acronyme || project.Projet} → ${stripOrdinal(nextValue)}`);
      render();
    } catch (err) { CoreUtils.showToast(`Échec de l'écriture (${err.message})`, true); }
  }

  async function saveProjectColumn(project, column, value, errorLabel) {
    if (text(readField(project, column)) === text(value)) return true;
    try {
      await writeProjectColumn(project, column, value);
      return true;
    } catch (err) {
      CoreUtils.showToast(`Échec de l'enregistrement ${errorLabel} (${err.message})`, true);
      return false;
    }
  }
  const saveNextStep = (project, value) => saveProjectColumn(project, NEXT_STEP_FIELD, value, 'du next step');
  async function saveTransmissionDate(project, inputValue) {
    const epoch = inputValue ? Math.floor(new Date(`${inputValue}T00:00:00Z`).getTime() / 1000) : null;
    if (inputValue && Number.isNaN(epoch)) return;
    // Le champ date déclenche "change" à chaque frappe complète (0002, 0020, 0202… avant 2026) :
    // seules les années plausibles sont enregistrées.
    if (inputValue && !(Number(inputValue.split('-')[0]) >= 1900 && Number(inputValue.split('-')[0]) <= 2100)) return;
    if ((CoreUtils.gristDateToInput(readField(project, TRANSMISE_FIELD)) || '') === (inputValue || '')) return;
    try {
      await writeProjectColumn(project, TRANSMISE_FIELD, epoch);
    } catch (err) { CoreUtils.showToast(`Échec de l'enregistrement de la date (${err.message})`, true); }
  }
  // Seule la cellule du lien est réécrite (jamais tout l'arbre) : un rendu complet
  // déclenché par le blur détacherait la cible du clic suivant, qui serait perdu.
  const findLinkCell = projectId => Array.from(document.querySelectorAll('#admin-col-conv [data-link-cell]')).find(cell => cell.dataset.linkCell === String(projectId));
  function refreshLinkCell(project, focus) {
    const cell = findLinkCell(project.id);
    if (!cell) return;
    cell.outerHTML = linkCell(project);
    const fresh = findLinkCell(project.id);
    if (!fresh || !focus) return;
    const target = fresh.querySelector(focus === 'input' ? '[data-link-input]' : '[data-edit-link]');
    if (target) { target.focus(); if (focus === 'input') target.select(); }
  }
  function openLinkEditor(project) {
    editingLinkId = String(project.id);
    refreshLinkCell(project, 'input');
  }
  function cancelLinkEditor(project, focus) {
    if (editingLinkId !== String(project.id)) return;
    editingLinkId = null;
    refreshLinkCell(project, focus);
  }
  // keyboard : validation par Entrée (on garde la saisie si le lien est invalide et on
  // rend le focus au bouton après validation) ; sinon sortie du champ à la souris.
  async function commitLink(project, raw, keyboard) {
    if (editingLinkId !== String(project.id)) return; // déjà validé ou annulé (Entrée/Échap puis blur)
    const parsed = normalizeLink(raw);
    if (parsed.error) {
      CoreUtils.showToast(parsed.error, true);
      if (keyboard) return;
      cancelLinkEditor(project);
      return;
    }
    editingLinkId = null;
    const saving = saveProjectColumn(project, LINK_FIELD, parsed.value, 'du lien');
    refreshLinkCell(project, keyboard ? 'edit' : null);
    if (!(await saving)) refreshLinkCell(project);
  }

  async function cyclePartner(project, fieldName) {
    const idx = partnerStatusIndex(project, fieldName);
    const nextValue = PARTNER_STATUSES[(idx + 1) % PARTNER_STATUSES.length];
    try {
      await writeFields('Projets', project.id, { [fieldName]: nextValue });
      setProjectField(project.id, fieldName, nextValue);
      render();
    } catch (err) { CoreUtils.showToast(`Échec de l'écriture (${err.message})`, true); }
  }

  async function saveComment(projectId, value) {
    try {
      await writeFields('Projets', projectId, { comentaire_general_Suivi_projet: value });
      setProjectField(projectId, 'comentaire_general_Suivi_projet', value);
    } catch (err) { CoreUtils.showToast(`Échec de l'enregistrement du commentaire (${err.message})`, true); }
  }

  function partnerPill(project, partner) {
    const style = PARTNER_STATUS_STYLES[partner.statusIndex];
    const label = PARTNER_STATUSES[partner.statusIndex];
    const pct = Math.round((partner.statusIndex / (PARTNER_STATUSES.length - 1)) * 100);
    return `<button type="button" class="admin-partner-pill" data-cycle-partner="${escape(project.id)}:${escape(partner.field)}" title="${escape(partner.label)} — ${escape(label)}" aria-label="${escape(partner.label)} — ${escape(label)}, cliquer pour changer">` +
      `<span class="admin-partner-top"><span class="admin-partner-name">${escape(partner.label)}</span>` +
      `<span class="admin-partner-icon" style="color:${style.text};">${PARTNER_ICONS[partner.statusIndex]}</span></span>` +
      `<span class="admin-partner-track"><span class="admin-partner-fill" style="width:${pct}%;background:${style.text};"></span></span>` +
      `</button>`;
  }

  function commentBlock(project) {
    return `<label class="admin-comment"><span class="visually-hidden">Commentaire libre</span>` +
      `<textarea data-comment-project="${escape(project.id)}" rows="${viewMode === 'rows' ? 2 : 3}" placeholder="Commentaire libre…">${escape(project.comentaire_general_Suivi_projet)}</textarea></label>`;
  }

  // Bouton "Rédiger" : ouvre la page Rédaction (publipostage+ imbriqué). Le clic est géré par js/pages/page-redaction.js, par délégation.
  const redactButton = project => `<button type="button" class="admin-advance-btn admin-redact-btn" data-redact-notif="${escape(project.id)}" title="Rédiger la notification" aria-label="Rédiger la notification"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7 21l-4 1 1-4z"></path></svg>Rédiger</button>`;

  function notifCard(project) {
    const idx = notifStageIndex(project.id);
    const isLast = idx === NOTIF_STAGES.length - 1;
    const holder = personLabel(field(project, ['Porteur_1', 'Porteur', 'porteur_1'])) || 'Porteur non renseigné';
    const programme = programmeLabel(field(project, ['Programme', 'Programme_Axe_InnovationS']));
    const cto = ctoRef(project);
    return `<div class="admin-card" data-project-id="${escape(project.id)}">` +
      `<button type="button" class="admin-card-identity" data-open-project="${escape(project.id)}">` +
      `<span class="project-acronym">${escape(project.Acronyme || 'Sans acronyme')}</span>` +
      `<span class="admin-card-caption">${escape(holder)}</span></button>` +
      `<div class="admin-card-badges">${startDateChip(project, 'notif', isLast)}${programme ? `<span class="programme-badge">${escape(programme)}</span>` : ''}` +
      `${cto ? `<span class="admin-cto-badge">${escape(cto)}</span>` : ''}</div>` +
      commentBlock(project) + redactButton(project) +
      (isLast
        ? '<span class="admin-done-badge">Archivée</span>'
        : `<button type="button" class="admin-advance-btn" data-advance-notif="${escape(project.id)}" data-acronym="${escape(project.Acronyme || project.Projet || '')}" title="Étape suivante" aria-label="Étape suivante">Suivant →</button>`) +
      `</div>`;
  }

  function nextStepBlock(project) {
    const help = window.HelpTooltip?.markup(homeRowFor(project, NEXT_STEP_FIELD).table, NEXT_STEP_FIELD) || '';
    return `<label class="admin-comment admin-nextstep"><span class="admin-field-label">Next step${help}</span>` +
      `<textarea data-nextstep-project="${escape(project.id)}" rows="${viewMode === 'rows' ? 1 : 2}" placeholder="Prochaine étape à suivre…">${escape(readField(project, NEXT_STEP_FIELD))}</textarea></label>`;
  }

  function linkCell(project) {
    const id = escape(project.id);
    const stored = text(readField(project, LINK_FIELD));
    if (editingLinkId === String(project.id)) {
      return `<div class="admin-link-cell" data-link-cell="${id}"><input type="url" class="admin-link-input" data-link-input="${id}" value="${escape(stored)}" placeholder="https://…" aria-label="Lien de la convention"></div>`;
    }
    const href = safeLink(stored);
    const editLabel = href ? 'Modifier le lien de la convention' : 'Ajouter le lien de la convention';
    return `<div class="admin-link-cell" data-link-cell="${id}">` +
      (href ? `<a class="admin-icon-btn" href="${escape(href)}" target="_blank" rel="noopener noreferrer" title="Ouvrir la convention" aria-label="Ouvrir la convention">${ICON_EXTERNAL}</a>` : '') +
      `<button type="button" class="admin-icon-btn${href ? '' : ' is-empty'}" data-edit-link="${id}" title="${editLabel}" aria-label="${editLabel}">${href ? ICON_LINK_EDIT : ICON_LINK_ADD}</button></div>`;
  }

  // Dernière étape uniquement : badge + date d'envoi de la convention signée au porteur.
  function signedCell(project) {
    const help = window.HelpTooltip?.markup(homeRowFor(project, TRANSMISE_FIELD).table, TRANSMISE_FIELD) || '';
    return `<div class="admin-signed-cell"><span class="admin-done-badge">Signée</span>` +
      `<label class="admin-date"><span class="admin-field-label">Transmise au porteur le${help}</span>` +
      `<input type="date" data-transmise-project="${escape(project.id)}" value="${escape(CoreUtils.gristDateToInput(readField(project, TRANSMISE_FIELD)))}"></label></div>`;
  }

  function convCard(project) {
    const isLast = convStageIndex(project) === CONV_STAGES.length - 1;
    const partners = partnersFor(project);
    return `<div class="admin-card admin-card-conv" data-project-id="${escape(project.id)}">` +
      `<span class="admin-drag-handle" draggable="true" data-drag-project="${escape(project.id)}" title="Glisser vers une autre étape">${ICON_GRIP}</span>` +
      `<button type="button" class="admin-card-identity" data-open-project="${escape(project.id)}">` +
      `<span class="project-acronym">${escape(project.Acronyme || project.Projet || 'Sans acronyme')}</span>${startDateChip(project, 'conv', isLast)}</button>` +
      `<div class="admin-partners">${partners.map(p => partnerPill(project, p)).join('')}</div>` +
      `<div class="admin-notes">${commentBlock(project)}${nextStepBlock(project)}</div>` +
      linkCell(project) +
      (isLast ? signedCell(project) : '') +
      `</div>`;
  }

  // Colonne Grist dont ce volet affiche une étape : même statut pour tous les
  // volets d'un même côté (notifications_Statut sur Notifications, Conventions_statut
  // sur Projets), donc une bulle d'aide unique par en-tête de volet.
  const STAGE_COLUMN = { notif: { table: 'Notifications', col: 'notifications_Statut' }, conv: { table: 'Projets', col: 'Conventions_statut' } };
  function buildPanels(side, stages, projectsByStage, cardFn) {
    const stageHelp = window.HelpTooltip?.markup(STAGE_COLUMN[side].table, STAGE_COLUMN[side].col) || '';
    return stages.map((stageLabel, idx) => {
      const items = projectsByStage[idx] || [];
      const state = ensurePanelState(side, idx, items.length === 0);
      const key = panelKey(side, idx);
      const collapsedCls = state.collapsed ? ' is-collapsed' : '';
      const label = stripOrdinal(stageLabel);
      return { key, idx, label, collapsedCls, count: items.length, state,
        html: `<section class="admin-panel${collapsedCls}"${side === 'conv' ? ` data-drop-panel="${escape(key)}"` : ''} aria-labelledby="admin-panel-${escape(key)}">` +
          `<header class="admin-panel-header"><h4 id="admin-panel-${escape(key)}">${escape(label)}${stageHelp}</h4>` +
          `<span class="kanban-count">${items.length}</span><div class="kanban-column-actions">` +
          `<button type="button" class="kanban-icon-btn" data-toggle-panel="${escape(key)}" aria-expanded="${!state.collapsed}" aria-label="${state.collapsed ? 'Déplier' : 'Replier'} le volet ${escape(label)}">${ICON_CHEVRON}</button>` +
          `<button type="button" class="kanban-icon-btn" data-hide-panel="${escape(key)}" aria-label="Masquer le volet ${escape(label)}">${ICON_EYE_OFF}</button>` +
          `</div></header><div class="admin-panel-body mode-${viewMode}">${items.length ? items.map(cardFn).join('') : '<p class="kanban-empty">Aucun projet</p>'}</div></section>` };
    });
  }

  function render() {
    const notifRoot = document.getElementById('admin-col-notif');
    const convRoot = document.getElementById('admin-col-conv');
    if (!notifRoot || !convRoot) return;
    // Tables Grist pas encore chargées (premier rendu déclenché par le propre
    // DOMContentLoaded de ce module, avant que app.js n'ait appelé loadAllTables) :
    // ne rien construire, sinon chaque volet verrait 0 projet et démarrerait
    // replié par défaut à tort (cf. ensurePanelState). Le vrai rendu arrive via
    // window.renderAdministratif() une fois les données chargées.
    if (!window.CoreState || !CoreState.getTable('Projets')) return;
    const projects = filteredProjects();

    const notifByStage = NOTIF_STAGES.map((_, idx) => projects.filter(p => notifStageIndex(p.id) === idx));
    const convProjects = projects.filter(needsConvention);
    const convByStage = CONV_STAGES.map((_, idx) => convProjects.filter(p => convStageIndex(p) === idx));
    const notifPanels = buildPanels('notif', NOTIF_STAGES, notifByStage, notifCard);
    const convPanels = buildPanels('conv', CONV_STAGES, convByStage, convCard);

    notifRoot.innerHTML = notifPanels.filter(p => !p.state.hidden).map(p => p.html).join('');
    convRoot.innerHTML = convPanels.filter(p => !p.state.hidden).map(p => p.html).join('');

    updateTabUI();

    [notifRoot, convRoot].forEach(root => {
      root.querySelectorAll('[data-open-project]').forEach(btn => btn.addEventListener('click', () => {
        const project = getProjects().find(p => String(p.id) === String(btn.dataset.openProject));
        if (project && window.ProjectModal?.open) window.ProjectModal.open(project);
        else if (window.openProject) window.openProject(btn.dataset.openProject);
      }));
      root.querySelectorAll('[data-toggle-panel]').forEach(btn => btn.addEventListener('click', () => {
        const state = panelState[btn.dataset.togglePanel];
        if (state) state.collapsed = !state.collapsed;
        render();
        saveAdministratifUserPreferences();
      }));
      root.querySelectorAll('[data-hide-panel]').forEach(btn => btn.addEventListener('click', () => {
        const state = panelState[btn.dataset.hidePanel];
        if (state) state.hidden = true;
        render();
        saveAdministratifUserPreferences();
      }));
      root.querySelectorAll('[data-advance-notif]').forEach(btn => btn.addEventListener('click', () => advanceNotif(btn.dataset.advanceNotif, btn.dataset.acronym)));
      root.querySelectorAll('[data-nextstep-project]').forEach(textarea => textarea.addEventListener('blur', () => {
        // Non modifié depuis le rendu : rien à écrire (évite de réécrire une valeur
        // que le navigateur normalise à l'affichage, ex. CRLF ou saut de ligne initial).
        if (textarea.value === textarea.defaultValue) return;
        const project = projectById(textarea.dataset.nextstepProject);
        if (project) saveNextStep(project, textarea.value);
      }));
      root.querySelectorAll('[data-transmise-project]').forEach(input => input.addEventListener('change', () => {
        const project = projectById(input.dataset.transmiseProject);
        if (project) saveTransmissionDate(project, input.value);
      }));
      root.querySelectorAll('[data-cycle-partner]').forEach(btn => btn.addEventListener('click', () => {
        const [projectId, fieldName] = btn.dataset.cyclePartner.split(':');
        const project = getProjects().find(p => String(p.id) === String(projectId));
        if (project) cyclePartner(project, fieldName);
      }));
      root.querySelectorAll('[data-comment-project]').forEach(textarea => textarea.addEventListener('blur', () => saveComment(textarea.dataset.commentProject, textarea.value)));
    });

    renderHiddenPanels(activeTab === 'notif' ? notifPanels : convPanels);
  }

  function updateTabUI() {
    document.querySelectorAll('[data-admin-tab]').forEach(btn => {
      const isActive = btn.dataset.adminTab === activeTab;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });
    document.querySelectorAll('[data-admin-panel]').forEach(section => {
      section.classList.toggle('is-hidden', section.dataset.adminPanel !== activeTab);
    });
  }

  function renderHiddenPanels(panels) {
    const container = document.getElementById('admin-hidden-panels');
    if (!container) return;
    const hiddenPanels = panels.filter(p => p.state.hidden);
    container.hidden = hiddenPanels.length === 0;
    container.innerHTML = hiddenPanels.length
      ? `<span class="kanban-hidden-label">Masqués :</span>${hiddenPanels.map(p => `<button type="button" class="kanban-restore-chip" data-restore-panel="${escape(p.key)}" aria-label="Afficher le volet ${escape(p.label)}">${ICON_EYE}<span>${escape(p.label)}</span></button>`).join('')}`
      : '';
    container.querySelectorAll('[data-restore-panel]').forEach(btn => btn.addEventListener('click', () => {
      const state = panelState[btn.dataset.restorePanel];
      if (state) state.hidden = false;
      render();
      saveAdministratifUserPreferences();
    }));
  }

  async function loadAdministratifUserPreferences() {
    if (!window.CoreGrist || !CoreGrist.gristInstance) return;
    try {
      await CoreGrist.ensureTable(PREFS_TABLE, [EMAIL_TRIGGER_COLUMN, ...ADMIN_PREFS_COLUMNS]);
      await CoreGrist.ensureColumns(PREFS_TABLE, ADMIN_PREFS_COLUMNS);
      const rows = await CoreGrist.getTable(PREFS_TABLE);
      const cachedId = getCachedPrefsRowId();
      const row = cachedId != null ? rows.find(r => r.id === cachedId) : null;
      if (!row) {
        // Première utilisation dans ce navigateur (ou cache perdu) : nouvelle
        // ligne, partagée avec le Kanban Projets — normalement déjà créée par
        // loadKanbanUserPreferences(), appelé avant celui-ci dans js/app.js.
        const result = await CoreGrist.gristInstance.docApi.applyUserActions([['AddRecord', PREFS_TABLE, null, {}]]);
        prefsRowId = CoreUtils.extractAddedRecordId(result);
        setCachedPrefsRowId(prefsRowId);
        return;
      }
      prefsRowId = row.id;
      const hasSavedPreferences = !!(text(row.Admin_notif_repliees) || text(row.Admin_notif_masquees) ||
        text(row.Admin_conv_repliees) || text(row.Admin_conv_masquees));
      if (!hasSavedPreferences) return;
      pendingAdminPrefs = {
        notifCollapsed: new Set(decodeIdxList(row.Admin_notif_repliees)),
        notifHidden: new Set(decodeIdxList(row.Admin_notif_masquees)),
        convCollapsed: new Set(decodeIdxList(row.Admin_conv_repliees)),
        convHidden: new Set(decodeIdxList(row.Admin_conv_masquees))
      };
      applyAdminPrefsToPanelState();
    } catch (err) {
      console.warn('Chargement des préférences Administratif a échoué :', err.message);
    }
  }

  // Applique pendingAdminPrefs aux volets déjà créés dans panelState (au cas où
  // le chargement des préférences arrive APRÈS un premier rendu, au lieu
  // d'avant comme prévu dans js/app.js) — les volets pas encore créés seront
  // initialisés directement au bon état par ensurePanelState à la volée.
  function applyAdminPrefsToPanelState() {
    if (!pendingAdminPrefs) return;
    NOTIF_STAGES.forEach((_, idx) => {
      const state = panelState[panelKey('notif', idx)];
      if (state) { state.collapsed = pendingAdminPrefs.notifCollapsed.has(idx); state.hidden = pendingAdminPrefs.notifHidden.has(idx); }
    });
    CONV_STAGES.forEach((_, idx) => {
      const state = panelState[panelKey('conv', idx)];
      if (state) { state.collapsed = pendingAdminPrefs.convCollapsed.has(idx); state.hidden = pendingAdminPrefs.convHidden.has(idx); }
    });
  }

  async function saveAdministratifUserPreferences() {
    if (!prefsRowId || !window.CoreGrist?.gristInstance) return;
    const collect = (side, prop) => encodeIdxList(Object.keys(panelState)
      .filter(key => key.startsWith(`${side}:`) && panelState[key][prop])
      .map(key => Number(key.split(':')[1])));
    const fields = {
      Admin_notif_repliees: collect('notif', 'collapsed'),
      Admin_notif_masquees: collect('notif', 'hidden'),
      Admin_conv_repliees: collect('conv', 'collapsed'),
      Admin_conv_masquees: collect('conv', 'hidden')
    };
    try {
      await CoreGrist.gristInstance.docApi.applyUserActions([['UpdateRecord', PREFS_TABLE, prefsRowId, fields]]);
    } catch (err) {
      console.warn('Enregistrement des préférences Administratif a échoué :', err.message);
    }
  }

  function updateViewToggle() {
    const btn = document.getElementById('admin-toggle-view');
    if (!btn) return;
    const nextIsCards = viewMode === 'rows';
    btn.innerHTML = nextIsCards ? ICON_VIEW_CARDS : ICON_VIEW_ROWS;
    btn.setAttribute('aria-label', nextIsCards ? 'Afficher en cartes' : 'Afficher en tableau');
  }

  const DRAG_TYPE = 'application/x-suivi-convention';
  const carriesConvCard = event => !!(event.dataTransfer && Array.from(event.dataTransfer.types || []).includes(DRAG_TYPE));

  // Délégation sur la racine (persistante) : render() reconstruit tout son contenu,
  // et seule une carte portant DRAG_TYPE est acceptée (jamais un fichier ou un texte
  // glissé de l'extérieur). Édition du lien : mêmes délégations.
  function initConvDelegation() {
    const root = document.getElementById('admin-col-conv');
    if (!root) return;
    const closest = (event, selector) => (event.target && event.target.closest) ? event.target.closest(selector) : null;
    const clearDragFeedback = () => {
      draggingCard = null;
      root.querySelectorAll('.is-drop-target, .is-dragging').forEach(el => el.classList.remove('is-drop-target', 'is-dragging'));
    };
    root.addEventListener('dragstart', event => {
      const handle = closest(event, '[data-drag-project]');
      if (!handle || !event.dataTransfer) return;
      const dt = event.dataTransfer;
      dt.effectAllowed = 'move';
      dt.setData(DRAG_TYPE, handle.dataset.dragProject);
      dt.setData('text/plain', handle.dataset.dragProject); // Firefox exige au moins une donnée standard
      const card = handle.closest('.admin-card');
      if (card && dt.setDragImage) { try { dt.setDragImage(card, 14, 14); } catch (err) { /* aperçu par défaut */ } }
      draggingCard = card;
      // Après le retour du gestionnaire : l'aperçu de glisser est capturé avant l'estompage.
      if (card) setTimeout(() => { if (draggingCard === card) card.classList.add('is-dragging'); }, 0);
    });
    root.addEventListener('dragover', event => {
      const panel = closest(event, '[data-drop-panel]');
      if (!panel || !carriesConvCard(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (!panel.classList.contains('is-drop-target')) {
        root.querySelectorAll('.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
        panel.classList.add('is-drop-target');
      }
    });
    root.addEventListener('dragleave', event => {
      const panel = closest(event, '[data-drop-panel]');
      if (panel && !panel.contains(event.relatedTarget)) panel.classList.remove('is-drop-target');
    });
    root.addEventListener('drop', event => {
      const panel = closest(event, '[data-drop-panel]');
      if (!panel || !carriesConvCard(event)) return;
      event.preventDefault();
      const projectId = event.dataTransfer.getData(DRAG_TYPE);
      clearDragFeedback();
      if (projectId) moveConv(projectId, Number(panel.dataset.dropPanel.split(':')[1]));
    });
    root.addEventListener('dragend', clearDragFeedback);

    root.addEventListener('click', event => {
      const btn = closest(event, '[data-edit-link]');
      const project = btn && projectById(btn.dataset.editLink);
      if (project) openLinkEditor(project);
    });
    root.addEventListener('keydown', event => {
      const input = closest(event, '[data-link-input]');
      const project = input && projectById(input.dataset.linkInput);
      if (!project) return;
      if (event.key === 'Enter') { event.preventDefault(); commitLink(project, input.value, true); }
      else if (event.key === 'Escape') { event.preventDefault(); cancelLinkEditor(project, 'edit'); }
    });
    root.addEventListener('focusout', event => {
      const input = closest(event, '[data-link-input]');
      const project = input && projectById(input.dataset.linkInput);
      if (project) commitLink(project, input.value, false);
    });
  }

  function init() {
    initConvDelegation();
    renderFilters();
    setupCombo('admin-filter-programme', ['Programme', 'Programme_Axe_InnovationS'], 'Tous les programmes');
    setupCombo('admin-filter-instance', ['Instance_ratachee', 'Instance', 'Instances'], 'Toutes les instances');
    updateViewToggle();
    render();
    document.getElementById('admin-filter-search')?.addEventListener('input', render);
    document.getElementById('admin-clear-filters')?.addEventListener('click', () => {
      ['admin-filter-programme', 'admin-filter-instance'].forEach(id => {
        const input = document.getElementById(id);
        if (input) { input.value = ''; input.dataset.selectedValue = ''; }
      });
      const search = document.getElementById('admin-filter-search');
      if (search) search.value = '';
      renderFilters();
      render();
    });
    document.getElementById('admin-toggle-view')?.addEventListener('click', () => {
      viewMode = viewMode === 'rows' ? 'cards' : 'rows';
      updateViewToggle();
      render();
    });
    document.querySelectorAll('[data-admin-tab]').forEach(btn => btn.addEventListener('click', () => {
      activeTab = btn.dataset.adminTab;
      render();
    }));
  }

  window.renderAdministratif = function () { renderFilters(); render(); };
  // Logique d'urgence exposée pour les tests (seuils) ; setClock() fige "aujourd'hui".
  window.AdministratifUrgency = {
    toneFor: urgencyTone,
    daysUntil: daysUntilStart,
    setClock(fn) { nowFn = typeof fn === 'function' ? fn : () => new Date(); }
  };
  window.loadAdministratifUserPreferences = loadAdministratifUserPreferences;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
