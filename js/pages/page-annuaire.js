/**
 * Page Annuaire — personnes et postes du document (V1, 17/11/2026, maquette validée par Antoine).
 *
 * Lecture seule des tables Annuaire / Postes2 / Structures / Etablissements / Projets déjà chargées dans CoreState : aucun
 * champ n'est écrit ici. La création et la modification passent par les modales existantes (person-modal.js, poste-modal.js),
 * qui préviennent la page par l'évènement `directory-changed` ; les projets d'une personne s'ouvrent dans la modale projet.
 *
 * Colonnes lues en plus de celles des modales : Annuaire.Type (ChoiceList), Communaute_metier (ChoiceList),
 * Accompagnateur_de_l_innovation_ (Bool), email_Assitant_e_le_cas_echeant (→ Annuaire), Poste_secondaire (→ Postes2),
 * Matricule_le_cas_echeant_ ; Postes2.type_de_contrat, Date_de_fin, Type_de_poste, grade.
 *
 * Préférences par utilisateur (Preferences_Widget, colonnes Annu_*) : onglet, présentation, recherche, filtres, « À vérifier »,
 * tri et groupes repliés. Les listes passent par CoreUtils.encodeList/decodeList (un libellé peut contenir une virgule).
 */
(function () {
  'use strict';

  const PREFS_TABLE = 'Preferences_Widget';
  const PREFS_ROWID_STORAGE_KEY = 'suiviProjetInnovationS:prefsRowId';
  const EMAIL_TRIGGER_COLUMN = { id: 'Email_utilisateur', type: 'Text', isFormula: false, formula: 'user.Email', recalcWhen: 0 };
  const ANNU_PREFS_COLUMNS = [
    { id: 'Annu_onglet', type: 'Text' },
    { id: 'Annu_vue', type: 'Text' },
    { id: 'Annu_recherche', type: 'Text' },
    { id: 'Annu_filtre_employeur', type: 'Text' },
    { id: 'Annu_filtre_structure', type: 'Text' },
    { id: 'Annu_filtre_type', type: 'Text' },
    { id: 'Annu_a_verifier', type: 'Text' },
    { id: 'Annu_tri', type: 'Text' },
    { id: 'Annu_repliees', type: 'Text' }
  ];
  const TABS = ['pers', 'postes'];
  const VIEWS = ['liste', 'structure', 'cartes'];
  const SORT_KEYS = ['nom', 'structure', 'employeur'];
  const SOON_DAYS = 90; // contrat qui se termine dans moins de 90 jours : poste « à vérifier »
  const NO_STRUCTURE = 'Sans structure';
  const ISSUE_TEXT = { 'dup-name': 'Nom en doublon', 'dup-email': 'E-mail en doublon', 'no-email': 'E-mail manquant', 'no-poste': 'Aucun poste' };
  const encodeList = CoreUtils.encodeList;
  const decodeList = CoreUtils.decodeList;
  const esc = value => CoreUtils.escapeHtml(value);

  // --- Outils -------------------------------------------------------------------------------
  const text = value => (value == null ? '' : String(value).trim());
  // Recherche et doublons : sans accents ni casse.
  const fold = value => text(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function refId(value) {
    const raw = value && typeof value === 'object' ? (value.id ?? value.rowId) : value;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : 0;
  }
  // ChoiceList Grist : ['L', 'EC', 'C'] ; un texte simple (« EC, C ») est aussi accepté.
  function listValues(value) {
    if (Array.isArray(value)) return value.filter((item, i) => !(i === 0 && item === 'L')).map(text).filter(Boolean);
    const raw = text(value);
    return raw ? raw.split(',').map(text).filter(Boolean) : [];
  }
  function hueOf(label) {
    let hash = 0;
    for (const ch of String(label)) hash = (hash * 31 + ch.codePointAt(0)) % 3600;
    return Math.round(hash / 10);
  }
  const table = name => (window.CoreState && CoreState.getTable(name)) || [];
  const byId = (rows, id) => (id ? CoreUtils.findById(rows, id) : undefined);
  const structLabel = row => (row ? text(row.Acronyme) || text(row.Nom_Complet) : '');
  const etabLabel = row => (row ? text(row.Acronyme) || text(row.Nom_complet) : '');
  // Référence vers une fiche que Grist ne montre pas à ce compte (règle d'accès, table refusée, ligne supprimée) : {label, title} ou null
  // (diagnostic d'accès, 24/11/2026) — « Poste (id 4) non lisible » plutôt que « Sans poste », qui ferait croire à un oubli de saisie.
  const hiddenRef = (tableName, value, kind) => { const id = refId(value); return id && window.CoreAccess ? CoreAccess.unresolvedRef(tableName, id, kind) : null; };
  const tipOf = refs => refs.filter(Boolean).map(ref => `${ref.label} — ${ref.title}`).join('\n');
  const titleAttr = tip => tip ? ` title="${esc(tip)}"` : '';
  const help = (tableId, colId) => (window.HelpTooltip ? HelpTooltip.markup(tableId, colId) : '');
  const frDate = iso => { const [y, m, d] = String(iso).split('-'); return `${d}/${m}/${y}`; };

  // Horloge injectable (tests) : « aujourd'hui » sert à repérer les contrats qui se terminent bientôt.
  let clock = () => new Date();
  function setClock(fn) { clock = typeof fn === 'function' ? fn : () => new Date(); dirCache = null; }
  const dayNumber = date => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  const dayToIso = day => new Date(day * 86400000).toISOString().slice(0, 10);
  // Colonne Date de Grist : secondes depuis 1970 (vide = null).
  const dateDay = value => (typeof value === 'number' && Number.isFinite(value) && value !== 0 ? Math.floor(value / 86400) : null);

  // --- Données ------------------------------------------------------------------------------
  let dirCache = null;

  function buildDirectory() {
    const annuaire = table('Annuaire'), postesRows = table('Postes2'), structures = table('Structures');
    const etabs = table('Etablissements'), projets = table('Projets');
    const today = dayNumber(clock());
    const refs = [annuaire, postesRows, structures, etabs, projets];
    if (dirCache && dirCache.today === today && dirCache.refs.every((rows, i) => rows === refs[i])) return dirCache.dir;

    const postes = postesRows.map(row => {
      const structure = byId(structures, refId(row.Structure2));
      const mere = structure ? byId(structures, refId(structure.Directon_Structure_mere)) : null;
      const tutelle = structure ? byId(etabs, refId(structure.Etablissement_Tutuelle_gestionaire)) : null;
      const employeur = byId(etabs, refId(row.Employeur_tutelle));
      const structureHidden = !structure ? hiddenRef('Structures', row.Structure2, 'Structure') : null;
      const employeurHidden = !employeur ? hiddenRef('Etablissements', row.Employeur_tutelle, 'Établissement') : null;
      const finDay = dateDay(row.Date_de_fin);
      const finLeft = finDay == null ? null : finDay - today;
      return {
        id: row.id, row,
        titre: text(row.Titre) || text(row.Nom_du_poste), prec: text(row.Precisions_Poste),
        structure: structLabel(structure) || (structureHidden ? structureHidden.label : ''), structureNom: text(structure && structure.Nom_Complet), mere: structLabel(mere), tutelle: etabLabel(tutelle),
        employeur: etabLabel(employeur) || (employeurHidden ? employeurHidden.label : ''), hiddenTip: tipOf([structureHidden, employeurHidden]),
        contrat: text(row.type_de_contrat), typePoste: text(row.Type_de_poste), grade: text(row.grade),
        fin: finDay == null ? null : dayToIso(finDay), finLeft, finSoon: finLeft != null && finLeft <= SOON_DAYS,
        titulaires: [], vacant: true, issue: false
      };
    });
    const posteById = new Map(postes.map(poste => [poste.id, poste]));

    // Projets par personne et par rôle (porteur 1/2/3, VP porteur, accompagnateur).
    const roles = [['porteur', ['Porteur_1', 'Porteur_2', 'Porteur_3']], ['vp', ['VP_porteur_signataire_notif']], ['accomp', ['Accompagnateur']]];
    const projectsOf = new Map();
    projets.forEach(project => {
      roles.forEach(([role, columns]) => columns.forEach(column => {
        const personId = refId(project[column]);
        if (!personId) return;
        let entry = projectsOf.get(personId);
        if (!entry) { entry = { porteur: [], vp: [], accomp: [] }; projectsOf.set(personId, entry); }
        if (!entry[role].includes(project)) entry[role].push(project);
      }));
    });
    const projectLabel = project => text(project.Acronyme) || text(project.Projet) || `Projet ${project.id}`;

    const people = annuaire.map(row => {
      const prenom = text(row.Prenom), nom = text(row.NOM);
      const name = text(row.nom_et_Prenom) || `${prenom} ${nom}`.trim() || `Personne ${row.id}`;
      const poste = posteById.get(refId(row.Poste2)) || null;
      const secondary = posteById.get(refId(row.Poste_secondaire)) || null;
      const posteHidden = !poste ? hiddenRef('Postes2', row.Poste2, 'Poste') : null;
      const mine = projectsOf.get(row.id) || { porteur: [], vp: [], accomp: [] };
      const sortProjects = list => list.slice().sort((a, b) => projectLabel(a).localeCompare(projectLabel(b), 'fr'));
      const projects = { porteur: sortProjects(mine.porteur), vp: sortProjects(mine.vp), accomp: sortProjects(mine.accomp) };
      const email = text(row.Email);
      const initials = ((prenom || name).charAt(0) + (nom || name.split(/\s+/).pop() || '').charAt(0)).toUpperCase();
      return {
        id: row.id, row, name, initials, sortName: `${nom || name} ${prenom}`.trim(),
        nameKey: fold(`${prenom} ${nom}`.trim() || name), email, emailKey: email.toLowerCase(), tel: text(row.Telephone), matricule: text(row.Matricule_le_cas_echeant_),
        types: listValues(row.Type), comm: listValues(row.Communaute_metier), accomp: row.Accompagnateur_de_l_innovation_ === true,
        assistantId: refId(row.email_Assitant_e_le_cas_echeant),
        poste, secondary,
        posteHidden, hiddenTip: poste ? poste.hiddenTip : tipOf([posteHidden]),
        titre: poste ? poste.titre : (posteHidden ? posteHidden.label : ''), prec: poste ? poste.prec : '',
        structure: poste ? poste.structure : '', mere: poste ? poste.mere : '', tutelle: poste ? poste.tutelle : '', employeur: poste ? poste.employeur : '',
        projects, projectLabel,
        nProj: new Set([...projects.porteur, ...projects.vp, ...projects.accomp]).size,
        issues: []
      };
    });
    const personById = new Map(people.map(person => [person.id, person]));

    // Titulaires : poste principal ou secondaire ; un poste sans personne est « vacant ».
    people.forEach(person => [person.poste, person.secondary].forEach(poste => { if (poste && !poste.titulaires.includes(person)) poste.titulaires.push(person); }));
    postes.forEach(poste => {
      poste.vacant = poste.titulaires.length === 0;
      poste.issue = poste.vacant || poste.finSoon;
    });

    // À vérifier : doublons de nom et d'e-mail, e-mail manquant, personne sans poste.
    const byName = new Map(), byEmail = new Map();
    people.forEach(person => {
      if (!byName.has(person.nameKey)) byName.set(person.nameKey, []);
      byName.get(person.nameKey).push(person);
      if (person.emailKey) {
        if (!byEmail.has(person.emailKey)) byEmail.set(person.emailKey, []);
        byEmail.get(person.emailKey).push(person);
      }
    });
    const otherOf = (group, person) => (group.find(other => other !== person) || { id: 0 }).id;
    people.forEach(person => {
      const sameName = byName.get(person.nameKey), sameEmail = person.emailKey ? byEmail.get(person.emailKey) : null;
      if (sameName.length > 1) person.issues.push({ key: 'dup-name', text: ISSUE_TEXT['dup-name'], otherId: otherOf(sameName, person) });
      if (sameEmail && sameEmail.length > 1) person.issues.push({ key: 'dup-email', text: ISSUE_TEXT['dup-email'], otherId: otherOf(sameEmail, person) });
      if (!person.email) person.issues.push({ key: 'no-email', text: ISSUE_TEXT['no-email'], otherId: 0 });
      if (!person.poste && !person.posteHidden) person.issues.push({ key: 'no-poste', text: ISSUE_TEXT['no-poste'], otherId: 0 });
    });

    // Choix des filtres : les valeurs de Grist pour Type (jamais une liste en dur), puis celles que les données ajoutent.
    const sortFr = list => list.sort((a, b) => a.localeCompare(b, 'fr'));
    const distinct = list => sortFr([...new Set(list.filter(Boolean))]);
    const typeChoices = window.CoreGrist && CoreGrist.columnChoices ? CoreGrist.columnChoices('Annuaire', 'Type') : [];
    const dataTypes = distinct(people.flatMap(person => person.types)).filter(type => !typeChoices.includes(type));
    const options = {
      employeurs: distinct(postes.map(poste => poste.employeur)),
      structures: distinct(postes.map(poste => poste.structure)),
      types: [...typeChoices, ...dataTypes]
    };

    const dir = { people, postes, personById, posteById, options, today };
    dirCache = { refs, today, dir };
    return dir;
  }

  // --- Filtres et tri (fonctions pures : testées sans DOM) --------------------------------------
  function filterPeople(dir, filters) {
    const query = fold(filters.search);
    return dir.people.filter(person =>
      (!query || fold([person.name, person.email, person.titre, person.prec, person.structure, person.mere, person.employeur].join(' ')).includes(query)) &&
      (!filters.employeurs.length || filters.employeurs.includes(person.employeur)) &&
      (!filters.structures.length || filters.structures.includes(person.structure)) &&
      (!filters.types.length || person.types.some(type => filters.types.includes(type))) &&
      (!filters.check || person.issues.length > 0));
  }
  function filterPostes(dir, filters) {
    const query = fold(filters.search);
    return dir.postes.filter(poste =>
      (!query || fold([poste.titre, poste.prec, poste.structure, poste.mere, poste.employeur, ...poste.titulaires.map(t => t.name)].join(' ')).includes(query)) &&
      (!filters.employeurs.length || filters.employeurs.includes(poste.employeur)) &&
      (!filters.structures.length || filters.structures.includes(poste.structure)) &&
      (!filters.check || poste.issue));
  }
  function sortPeople(list, key, direction) {
    const byName = (a, b) => a.sortName.localeCompare(b.sortName, 'fr');
    return list.slice().sort((a, b) => {
      let result = 0;
      if (key === 'structure') result = a.structure.localeCompare(b.structure, 'fr');
      else if (key === 'employeur') result = a.employeur.localeCompare(b.employeur, 'fr');
      else result = byName(a, b);
      return result ? result * direction : byName(a, b);
    });
  }
  const sortPostes = list => list.slice().sort((a, b) => `${a.structure} ${a.titre}`.localeCompare(`${b.structure} ${b.titre}`, 'fr'));

  // --- État de la page -------------------------------------------------------------------------
  const state = { tab: 'pers', view: 'liste', search: '', employeurs: [], structures: [], types: [], check: false, sortKey: 'nom', sortDir: 1, collapsed: [], selectedId: 0 };
  function resetState() {
    Object.assign(state, { tab: 'pers', view: 'liste', search: '', employeurs: [], structures: [], types: [], check: false, sortKey: 'nom', sortDir: 1, collapsed: [], selectedId: 0 });
    dirCache = null;
  }
  const currentFilters = () => ({ search: state.search, employeurs: state.employeurs, structures: state.structures, types: state.tab === 'pers' ? state.types : [], check: state.check });
  const hasFilters = () => !!(fold(state.search) || state.employeurs.length || state.structures.length || (state.tab === 'pers' && state.types.length) || state.check);

  // --- Rendu : HTML -------------------------------------------------------------------------------
  const ICON_EDIT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"></path></svg>';
  const ICON_COPY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"></path></svg>';
  const ICON_CHEVRON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>';

  const hueStyle = label => (label ? ` style="--hue:${hueOf(label)}"` : '');
  const employeurPill = label => (label ? `<span class="annu-pill"${hueStyle(label)}>${esc(label)}</span>` : '<span class="annu-pill is-none">—</span>');
  const typePills = types => types.map(type => `<span class="annu-pill is-type">${esc(type)}</span>`).join('');
  const avatar = (person, large) => `<span class="annu-av${large ? ' is-lg' : ''}${person.employeur ? '' : ' is-none'}"${hueStyle(person.employeur)} aria-hidden="true">${esc(person.initials)}</span>`;
  const projectsTitle = person => `Porteur ${person.projects.porteur.length} · VP ${person.projects.vp.length} · Accompagnateur ${person.projects.accomp.length}`;
  const issueText = person => person.issues.map(issue => issue.text).join(' · ');
  const alertButton = person => (person.issues.length
    ? `<button type="button" class="annu-alert" data-annu="open" data-id="${person.id}" title="${esc(issueText(person))}" aria-label="À vérifier : ${esc(issueText(person))}">!</button>` : '');
  const editButton = person => `<button type="button" class="annu-icon" data-annu="edit" data-id="${person.id}" aria-label="Modifier ${esc(person.name)}" title="Modifier">${ICON_EDIT}</button>`;
  const copyButton = (person, small) => (person.email
    ? `<button type="button" class="annu-icon${small ? ' is-sm' : ''}" data-annu="copy" data-id="${person.id}" aria-label="Copier l'e-mail" title="Copier l'e-mail">${ICON_COPY}</button>` : '');
  const arrow = key => (state.sortKey === key ? (state.sortDir === 1 ? '▲' : '▼') : '');
  const sortButton = (key, label) => `<button type="button" class="annu-th" data-annu="sort" data-value="${key}">${label} <span aria-hidden="true">${arrow(key)}</span></button>`;

  function peopleHeader(flat) {
    return `<div class="annu-head${flat ? ' is-flat' : ''}">` +
      `<span class="c-nom">${sortButton('nom', 'Nom')}</span>` +
      `<span class="c-poste">Poste${help('Annuaire', 'Poste2')}</span>` +
      `<span class="c-struct">${sortButton('structure', 'Structure')}${help('Postes2', 'Structure2')}</span>` +
      `<span class="c-etab">${sortButton('employeur', 'Employeur')}${help('Postes2', 'Employeur_tutelle')}</span>` +
      `<span class="c-type">Type${help('Annuaire', 'Type')}</span>` +
      '<span class="c-contact">Contact</span><span class="c-proj">Projets</span><span></span></div>';
  }
  function personRow(person) {
    return `<div class="annu-row${state.selectedId === person.id ? ' is-sel' : ''}" data-person="${person.id}">` +
      `<div class="annu-who c-nom">${avatar(person)}<button type="button" class="annu-name" data-annu="open" data-id="${person.id}">${esc(person.name)}</button>` +
        (person.accomp ? '<span class="annu-star" title="Accompagnateur de l\'innovation" role="img" aria-label="Accompagnateur de l\'innovation">★</span>' : '') + '</div>' +
      `<div class="c-poste"><span class="annu-t1"${titleAttr(person.hiddenTip)}>${esc(person.titre || 'Sans poste')}</span><span class="annu-t2">${esc(person.prec)}</span></div>` +
      `<div class="c-struct"><span class="annu-t1">${esc(person.structure || '—')}</span><span class="annu-t2">${esc(person.mere)}</span></div>` +
      `<div class="c-etab">${employeurPill(person.employeur)}</div>` +
      `<div class="c-type annu-pills">${typePills(person.types)}</div>` +
      `<div class="c-contact annu-contact"><span class="annu-ell${person.email ? '' : ' annu-warn-t'}">${esc(person.email || 'E-mail manquant')}</span>${copyButton(person, true)}</div>` +
      `<div class="c-proj"><span class="annu-nproj" title="${esc(projectsTitle(person))}">${person.nProj}</span></div>` +
      `<div class="annu-acts">${alertButton(person)}${editButton(person)}</div></div>`;
  }
  function personCard(person) {
    return `<article class="annu-pc${state.selectedId === person.id ? ' is-sel' : ''}" data-person="${person.id}">` +
      `<div class="annu-pc-top">${avatar(person)}<div style="min-width:0;flex:1"><button type="button" class="annu-name" style="max-width:100%" data-annu="open" data-id="${person.id}">${esc(person.name)}</button>` +
        `<span class="annu-t2"${titleAttr(person.hiddenTip)}>${esc(person.titre || 'Sans poste')}</span></div>${alertButton(person)}</div>` +
      (person.employeur || person.structure
        ? `<div class="annu-pills">${person.employeur ? employeurPill(person.employeur) : ''}${person.structure ? `<span class="annu-pill is-plain">${esc(person.structure)}</span>` : ''}</div>` : '') +
      `<div class="annu-pills">${typePills(person.types)}</div>` +
      `<div class="annu-pc-foot"><span class="annu-ell annu-muted" style="flex:1">${esc(person.email || 'E-mail manquant')}</span>` +
        `<span class="annu-nproj" title="${esc(projectsTitle(person))}">${person.nProj}</span>${editButton(person)}</div></article>`;
  }
  function groupsOf(people) {
    const groups = new Map();
    people.forEach(person => {
      const key = person.structure || NO_STRUCTURE;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(person);
    });
    return [...groups.entries()].sort(([a], [b]) => (a === NO_STRUCTURE ? 1 : b === NO_STRUCTURE ? -1 : a.localeCompare(b, 'fr')));
  }
  function groupSub(key, members) {
    if (key === NO_STRUCTURE) return 'Sans poste, ou poste sans structure';
    const first = members.find(person => person.poste && person.poste.structure === key);
    if (!first) return '';
    const full = first.poste.structureNom && first.poste.structureNom !== key ? first.poste.structureNom : '';
    return [full, first.poste.mere].filter(Boolean).join(' · ');
  }
  function peopleHtml(people) {
    if (!people.length) return '<div class="annu-card"><div class="annu-empty">Aucune personne ne correspond. Modifie ou réinitialise les filtres.</div></div>';
    if (state.view === 'cartes') return `<div class="annu-cards">${people.map(personCard).join('')}</div>`;
    if (state.view === 'structure') {
      return peopleHeader(true) + groupsOf(people).map(([key, members]) => {
        const open = !state.collapsed.includes(key);
        return `<section class="annu-group"><button type="button" class="annu-ghead" data-annu="toggle" data-value="${esc(key)}" aria-expanded="${open}">` +
          `<span class="annu-chev${open ? ' is-open' : ''}" aria-hidden="true">${ICON_CHEVRON}</span><span class="annu-gn">${esc(key)}</span>` +
          `<span class="annu-gs">${esc(groupSub(key, members))}</span><span class="kanban-count">${members.length}</span></button>` +
          (open ? members.map(personRow).join('') : '') + '</section>';
      }).join('');
    }
    return `<div class="annu-card">${peopleHeader(false)}${people.map(personRow).join('')}</div>`;
  }

  function finInfo(poste) {
    if (!poste.fin) return { text: '', cls: 'annu-t2' };
    const left = poste.finLeft;
    const suffix = left < 0 ? ' (terminé)' : (poste.finSoon ? ` (${left} j)` : '');
    return { text: `fin le ${frDate(poste.fin)}${suffix}`, cls: poste.finSoon ? 'annu-t2 is-warn' : 'annu-t2' };
  }
  function postesHtml(postes) {
    const head = '<div class="annu-head is-postes"><span>Poste</span>' +
      `<span>Structure${help('Postes2', 'Structure2')}</span><span class="d-etab">Employeur${help('Postes2', 'Employeur_tutelle')}</span>` +
      `<span>Titulaire${help('Annuaire', 'Poste2')}</span><span class="d-contrat">Contrat${help('Postes2', 'type_de_contrat')}</span><span></span></div>`;
    const rows = postes.map(poste => {
      const fin = finInfo(poste);
      const holders = poste.titulaires.map(person => `<button type="button" class="annu-link" data-annu="open" data-id="${person.id}">${esc(person.name)}</button>`).join(', ');
      return '<div class="annu-row is-postes">' +
        `<div><span class="annu-t1">${esc(poste.titre)}</span><span class="annu-t2">${esc(poste.prec || '—')}</span></div>` +
        `<div><span class="annu-t1">${esc(poste.structure || '—')}</span><span class="annu-t2">${esc(poste.mere)}</span></div>` +
        `<div class="d-etab">${employeurPill(poste.employeur)}</div>` +
        `<div>${holders}${poste.vacant ? '<span class="annu-pill is-warn">Vacant</span>' : ''}</div>` +
        `<div class="d-contrat"><span class="annu-t1">${esc(poste.contrat || '—')}</span><span class="${fin.cls}">${esc(fin.text)}</span></div>` +
        `<div class="annu-acts"><button type="button" class="annu-icon" data-annu="edit-poste" data-id="${poste.id}" aria-label="Modifier le poste ${esc(poste.titre)}" title="Modifier le poste">${ICON_EDIT}</button></div></div>`;
    }).join('');
    return `<div class="annu-card">${head}${rows || '<div class="annu-empty">Aucun poste ne correspond. Modifie ou réinitialise les filtres.</div>'}</div>`;
  }

  // --- Fiche latérale ------------------------------------------------------------------------------
  const kv = (label, value, helpHtml) => `<div class="annu-kv"><span class="k">${label}${helpHtml || ''}</span><span class="v">${value}</span></div>`;
  function treeHtml(person) {
    const poste = person.poste;
    if (!poste && person.posteHidden) return `<div class="annu-lvl"><span class="annu-elb"></span><span class="k">Poste</span><span class="v annu-warn-t"${titleAttr(person.hiddenTip)}>${esc(person.posteHidden.label)}</span></div>`;
    if (!poste) return '<div class="annu-lvl"><span class="annu-elb"></span><span class="k">Poste</span><span class="v annu-warn-t">Aucun poste rattaché</span></div>';
    const levels = [];
    if (poste.tutelle) levels.push(['Tutelle', `<span class="annu-pill"${hueStyle(poste.tutelle)}>${esc(poste.tutelle)}</span>`]);
    if (poste.mere) levels.push(['Direction', esc(poste.mere)]);
    levels.push(['Structure', esc(poste.structure || '—')]);
    levels.push(['Poste', esc(poste.titre + (poste.prec ? ` · ${poste.prec}` : ''))]);
    return levels.map(([label, value], i) =>
      `<div class="annu-lvl" style="margin-left:${i * 14}px"><span class="annu-elb${i ? ' is-on' : ''}"></span><span class="k">${label}</span><span class="v">${value}</span></div>`).join('');
  }
  function projectGroupsHtml(person) {
    const groups = [['Porteur', person.projects.porteur], ['VP porteur', person.projects.vp], ['Accompagnateur', person.projects.accomp]].filter(([, list]) => list.length);
    if (!groups.length) return '<span class="annu-muted">Aucun projet</span>';
    return groups.map(([label, list]) => `<div class="annu-pg"><span class="k">${label}<b>${list.length}</b></span><div class="annu-chips">` +
      list.map(project => `<button type="button" class="annu-pj" data-annu="project" data-id="${project.id}" title="Ouvrir la fiche du projet">${esc(person.projectLabel(project))}</button>`).join('') +
      '</div></div>').join('');
  }
  function drawerHtml(person, dir) {
    const poste = person.poste;
    const assistant = person.assistantId ? dir.personById.get(person.assistantId) : null;
    const titleLine = poste ? person.titre + (person.prec ? ` · ${person.prec}` : '') : (person.posteHidden ? person.posteHidden.label : 'Sans poste');
    const secondary = person.secondary
      ? kv('Poste secondaire', esc(person.secondary.titre + (person.secondary.structure ? ` — ${person.secondary.structure}` : '')), help('Annuaire', 'Poste_secondaire')) : '';
    const contrat = poste
      ? kv('Contrat', esc([poste.contrat, poste.fin ? `fin le ${frDate(poste.fin)}` : '', poste.typePoste, poste.grade].filter(Boolean).join(' · ') || '—'), help('Postes2', 'type_de_contrat')) +
        kv('Employeur', employeurPill(poste.employeur), help('Postes2', 'Employeur_tutelle')) +
        `<div style="margin-top:8px"><button type="button" class="annu-link" data-annu="edit-poste" data-id="${poste.id}">Ouvrir la fiche du poste</button></div>` : '';
    const issues = person.issues.length
      ? '<section class="annu-sec annu-warnbox"><h3>À vérifier</h3>' + person.issues.map(issue =>
        `<div class="annu-iss"><span>${esc(issue.text)}</span>${issue.otherId ? `<button type="button" class="annu-link" data-annu="open" data-id="${issue.otherId}">Voir la fiche en doublon</button>` : ''}</div>`).join('') + '</section>' : '';
    return `<button type="button" class="annu-scrim" data-annu="close" aria-label="Fermer la fiche" tabindex="-1"></button>` +
      `<aside class="annu-drawer" role="dialog" aria-label="Fiche de ${esc(person.name)}">` +
      `<div class="annu-dhead">${avatar(person, true)}<div class="annu-dtitle"><h2>${esc(person.name)}</h2><p>${esc(titleLine)}</p></div>` +
        '<button type="button" class="annu-x" data-annu="close" aria-label="Fermer">×</button></div>' +
      `<div class="annu-dacts"><button type="button" class="btn btn-primary" data-annu="edit" data-id="${person.id}">Modifier</button>` +
        (person.email ? `<a class="btn" href="mailto:${esc(person.email)}">Écrire</a>` : '') + '</div>' +
      '<div class="annu-dbody">' +
        '<section class="annu-sec"><h3>Coordonnées</h3>' +
          kv('E-mail', person.email ? `<span class="annu-ell">${esc(person.email)}</span>${copyButton(person, true)}` : '<span class="annu-warn-t">Non renseigné</span>', help('Annuaire', 'Email')) +
          kv('Téléphone', `<span class="annu-ell">${esc(person.tel || '—')}</span>`, help('Annuaire', 'Telephone')) +
          kv('Assistant·e', assistant ? `<button type="button" class="annu-link" data-annu="open" data-id="${assistant.id}">${esc(assistant.name)}</button>` : '<span class="annu-muted">—</span>', help('Annuaire', 'email_Assitant_e_le_cas_echeant')) +
          (person.matricule ? kv('Matricule', esc(person.matricule), help('Annuaire', 'Matricule_le_cas_echeant_')) : '') +
        '</section>' +
        `<section class="annu-sec"><h3>Rattachement${help('Annuaire', 'Poste2')}</h3><div class="annu-tree">${treeHtml(person)}</div>${secondary}${contrat ? `<div style="margin-top:10px">${contrat}</div>` : ''}</section>` +
        `<section class="annu-sec"><h3>Dans le suivi</h3>${projectGroupsHtml(person)}</section>` +
        '<section class="annu-sec"><h3>Étiquettes</h3>' +
          kv('Type', person.types.length ? `<span class="annu-pills">${typePills(person.types)}</span>` : '<span class="annu-muted">—</span>', help('Annuaire', 'Type')) +
          kv('Communauté', person.comm.length ? `<span class="annu-pills">${person.comm.map(c => `<span class="annu-pill is-plain">${esc(c)}</span>`).join('')}</span>` : '<span class="annu-muted">—</span>', help('Annuaire', 'Communaute_metier')) +
          kv('Accompagnateur', person.accomp ? 'Oui ★' : 'Non', help('Annuaire', 'Accompagnateur_de_l_innovation_')) +
        '</section>' + issues +
      '</div></aside>';
  }

  // --- Rendu : DOM ---------------------------------------------------------------------------------
  const $ = id => document.getElementById(id);
  const isVisible = () => { const view = $('view-annuaire'); return !!view && !view.classList.contains('hidden'); };
  function summaryOf(values, many) { return !values.length ? '' : (values.length === 1 ? values[0] : `${values.length} ${many}`); }
  const COMBOS = [
    { key: 'employeurs', id: 'annu-filter-employeur', placeholder: 'Tous les employeurs', many: 'employeurs sélectionnés', only: '' },
    { key: 'structures', id: 'annu-filter-structure', placeholder: 'Toutes les structures', many: 'structures sélectionnées', only: '' },
    { key: 'types', id: 'annu-filter-type', placeholder: 'Tous les types', many: 'types sélectionnés', only: 'pers' }
  ];
  function renderCombo(combo, withList) {
    const input = $(combo.id), list = $(`${combo.id}-list`);
    if (!input || !list) return;
    const selected = state[combo.key];
    input.value = summaryOf(selected, combo.many);
    input.title = selected.join(', '); // le champ est étroit : la sélection complète se lit au survol
    input.closest('.filter-combo').classList.toggle('is-active', selected.length > 0);
    input.closest('.filter-combo').hidden = !!combo.only && state.tab !== combo.only;
    if (!withList) return;
    const available = buildDirectory().options[combo.key];
    const values = [...available, ...selected.filter(value => !available.includes(value))]; // une valeur retenue qui a disparu reste décochable
    const ordered = [...values.filter(v => selected.includes(v)), ...values.filter(v => !selected.includes(v))];
    list.innerHTML = `<button type="button" data-value="">${esc(combo.placeholder)}</button>` + ordered.map(value =>
      `<button type="button" class="${selected.includes(value) ? 'is-selected' : ''}" data-value="${esc(value)}" role="option" aria-selected="${selected.includes(value)}">${esc(value)}</button>`).join('');
  }
  function renderBand(dir) {
    const people = filterPeople(dir, { ...currentFilters(), types: state.types }), postes = filterPostes(dir, currentFilters());
    const personsFiltered = people.length !== dir.people.length, postesFiltered = postes.length !== dir.postes.length;
    if ($('annu-count-pers')) $('annu-count-pers').textContent = personsFiltered ? `${people.length}/${dir.people.length}` : String(dir.people.length);
    if ($('annu-count-postes')) $('annu-count-postes').textContent = postesFiltered ? `${postes.length}/${dir.postes.length}` : String(dir.postes.length);
    document.querySelectorAll('[data-annu-tab]').forEach(button => {
      const on = button.dataset.annuTab === state.tab;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-selected', String(on));
    });
    const search = $('annu-search');
    if (search) {
      if (search.value !== state.search) search.value = state.search;
      search.placeholder = state.tab === 'pers' ? 'Nom, e-mail, poste' : 'Poste, structure…';
    }
    COMBOS.forEach(combo => renderCombo(combo, false));
    const check = $('annu-check');
    if (check) {
      const count = state.tab === 'pers' ? dir.people.filter(person => person.issues.length).length : dir.postes.filter(poste => poste.issue).length;
      check.classList.toggle('is-on', state.check);
      check.setAttribute('aria-pressed', String(state.check));
      check.title = state.tab === 'pers'
        ? 'Fiches à contrôler : nom en doublon, e-mail en doublon, e-mail manquant, personne sans poste.'
        : 'Postes à contrôler : poste vacant, ou contrat qui se termine dans moins de 90 jours.';
      if ($('annu-check-count')) $('annu-check-count').textContent = String(count);
    }
    if ($('annu-reset')) $('annu-reset').hidden = !hasFilters();
    if ($('annu-views')) {
      $('annu-views').hidden = state.tab !== 'pers';
      document.querySelectorAll('[data-annu-view]').forEach(button => {
        const on = button.dataset.annuView === state.view;
        button.classList.toggle('is-on', on);
        button.setAttribute('aria-pressed', String(on));
      });
    }
    if ($('annu-new')) $('annu-new').textContent = state.tab === 'pers' ? '+ Nouvelle personne' : '+ Nouveau poste';
  }
  function renderContent(dir) {
    const root = $('annu-content');
    if (!root) return;
    root.innerHTML = state.tab === 'pers'
      ? peopleHtml(sortPeople(filterPeople(dir, currentFilters()), state.sortKey, state.sortDir))
      : postesHtml(sortPostes(filterPostes(dir, currentFilters())));
  }
  function renderDrawer(dir) {
    const root = $('annu-drawer-root');
    if (!root) return;
    const person = state.selectedId && dir.personById.get(state.selectedId);
    if (!person || !isVisible()) { root.innerHTML = ''; return; }
    root.innerHTML = drawerHtml(person, dir);
  }
  function render() {
    if (!$('view-annuaire')) return;
    const dir = buildDirectory();
    if (state.selectedId && !dir.personById.has(state.selectedId)) state.selectedId = 0; // personne disparue de l'Annuaire
    renderBand(dir);
    renderContent(dir);
    renderDrawer(dir);
  }

  // --- Actions ------------------------------------------------------------------------------------
  function persist() { saveAnnuaireUserPreferences(); }
  function openCard(id) {
    state.selectedId = Number(id) || 0;
    render();
    const close = document.querySelector('#annu-drawer-root .annu-x');
    if (close) close.focus();
  }
  function closeCard() {
    const id = state.selectedId;
    if (!id) return;
    state.selectedId = 0;
    render();
    const opener = document.querySelector(`#annu-content [data-annu="open"][data-id="${id}"]`);
    if (opener) opener.focus();
  }
  function copyEmail(person) {
    const done = () => CoreUtils.showToast('E-mail copié');
    const fallback = () => {
      const area = document.createElement('textarea');
      area.value = person.email; area.setAttribute('readonly', ''); area.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(area); area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      area.remove();
      if (ok) done(); else CoreUtils.showToast("Copie impossible : sélectionne l'e-mail à la main.", true);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(person.email).then(done, fallback); else fallback();
  }
  function openProject(id) {
    const project = CoreUtils.findById(table('Projets'), id);
    if (project && window.ProjectModal) window.ProjectModal.open(project);
    else CoreUtils.showToast('Projet introuvable : recharge la page.', true);
  }
  function toggleIn(list, value) { return list.includes(value) ? list.filter(item => item !== value) : [...list, value]; }

  function onClick(event) {
    const target = event.target.closest('[data-annu]');
    if (!target) return;
    const { annu: action, id, value } = target.dataset;
    const dir = buildDirectory();
    const person = id ? dir.personById.get(Number(id)) : null;
    switch (action) {
      case 'open': if (person) openCard(person.id); break;
      case 'close': closeCard(); break;
      case 'edit': if (person && window.openEditPersonModal) window.openEditPersonModal(person.row); break;
      case 'edit-poste': { const poste = dir.posteById.get(Number(id)); if (poste && window.openEditPosteModal) window.openEditPosteModal(poste.row); break; }
      case 'copy': if (person) copyEmail(person); break;
      case 'project': openProject(Number(id)); break;
      case 'sort':
        if (state.sortKey === value) state.sortDir = -state.sortDir; else { state.sortKey = value; state.sortDir = 1; }
        render(); persist(); break;
      case 'toggle':
        state.collapsed = toggleIn(state.collapsed, value);
        render(); persist(); break;
      default: break;
    }
  }
  function wireBand(root) {
    root.querySelectorAll('[data-annu-tab]').forEach(button => button.addEventListener('click', () => {
      state.tab = button.dataset.annuTab; render(); persist();
    }));
    root.querySelectorAll('[data-annu-view]').forEach(button => button.addEventListener('click', () => {
      state.view = button.dataset.annuView; render(); persist();
    }));
    const search = $('annu-search');
    if (search) search.addEventListener('input', () => { state.search = search.value; render(); saveSoon(); });
    const check = $('annu-check');
    if (check) check.addEventListener('click', () => { state.check = !state.check; render(); persist(); });
    const reset = $('annu-reset');
    if (reset) reset.addEventListener('click', () => {
      Object.assign(state, { search: '', employeurs: [], structures: [], types: [], check: false });
      render(); persist();
    });
    const create = $('annu-new');
    if (create) create.addEventListener('click', () => {
      if (state.tab === 'pers') { if (window.openCreatePersonModal) window.openCreatePersonModal(''); }
      else if (window.openCreatePosteModal) window.openCreatePosteModal('');
    });
    COMBOS.forEach(combo => {
      const input = $(combo.id), list = $(`${combo.id}-list`);
      if (!input || !list) return;
      input.readOnly = true;
      input.addEventListener('focus', () => { renderCombo(combo, true); list.hidden = false; });
      input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 150));
      list.addEventListener('mousedown', event => {
        const button = event.target.closest('[data-value]');
        if (!button) return;
        event.preventDefault();
        const value = button.dataset.value;
        state[combo.key] = value === '' ? [] : toggleIn(state[combo.key], value);
        render(); renderCombo(combo, true); persist();
      });
    });
  }

  // --- Mise à jour après une modale ------------------------------------------------------------------
  // Les modales Personne / Poste préviennent la page (`directory-changed`) : l'Annuaire et les Postes sont relus dans Grist
  // (le nom calculé nom_et_Prenom, la formule du nom de poste… ne sont connus que de lui), puis la page est redessinée.
  let refreshing = null, refreshAgain = false, pendingSelect = 0;
  async function reloadDirectoryTables() {
    if (!window.CoreGrist || !CoreGrist.gristInstance) return;
    const [annuaire, postes] = await Promise.all([CoreGrist.getTable('Annuaire'), CoreGrist.getTable('Postes2')]);
    CoreState.setTable('Annuaire', annuaire);
    CoreState.setTable('Postes2', postes);
  }
  async function refreshDirectory() {
    if (refreshing) { refreshAgain = true; return refreshing; }
    refreshing = (async () => {
      try { do { refreshAgain = false; await reloadDirectoryTables(); } while (refreshAgain); }
      catch (err) { console.warn("Relecture de l'Annuaire a échoué :", err.message); }
    })();
    try { await refreshing; } finally { refreshing = null; }
    if (pendingSelect) { state.selectedId = pendingSelect; pendingSelect = 0; }
    if (isVisible()) render(); else if (window.SuiviApp && SuiviApp.staleViews) SuiviApp.staleViews.add('view-annuaire');
  }
  function onDirectoryChanged(event) {
    const detail = (event && event.detail) || {};
    // La fiche de la personne créée s'ouvre — seulement depuis cette page (une personne créée depuis la modale projet n'ouvre rien).
    if (detail.table === 'Annuaire' && detail.created && detail.id && isVisible()) pendingSelect = Number(detail.id);
    return refreshDirectory();
  }

  // --- Préférences (Preferences_Widget) ---------------------------------------------------------------
  let prefsRowId = null;
  function getCachedPrefsRowId() {
    try { const raw = localStorage.getItem(PREFS_ROWID_STORAGE_KEY); return raw ? Number(raw) : null; }
    catch (err) { return null; }
  }
  function setCachedPrefsRowId(id) {
    try { localStorage.setItem(PREFS_ROWID_STORAGE_KEY, String(id)); }
    catch (err) { /* navigation privée / stockage bloqué : pas de persistance entre sessions */ }
  }
  function applyStoredPreferences(row) {
    if (TABS.includes(text(row.Annu_onglet))) state.tab = text(row.Annu_onglet);
    if (VIEWS.includes(text(row.Annu_vue))) state.view = text(row.Annu_vue);
    state.search = text(row.Annu_recherche);
    state.employeurs = decodeList(row.Annu_filtre_employeur);
    state.structures = decodeList(row.Annu_filtre_structure);
    state.types = decodeList(row.Annu_filtre_type);
    state.check = text(row.Annu_a_verifier) === '1';
    const [key, direction] = text(row.Annu_tri).split(':');
    if (SORT_KEYS.includes(key)) { state.sortKey = key; state.sortDir = direction === '-1' ? -1 : 1; }
    state.collapsed = decodeList(row.Annu_repliees);
  }
  async function loadAnnuaireUserPreferences() {
    if (!window.CoreGrist || !CoreGrist.gristInstance) return;
    try {
      await CoreGrist.ensureTable(PREFS_TABLE, [EMAIL_TRIGGER_COLUMN, ...ANNU_PREFS_COLUMNS]);
      await CoreGrist.ensureColumns(PREFS_TABLE, ANNU_PREFS_COLUMNS);
      const rows = await CoreGrist.getTable(PREFS_TABLE, { shared: true }); // lecture partagée au démarrage (js/app.js)
      const cachedId = getCachedPrefsRowId();
      const row = cachedId != null ? rows.find(r => r.id === cachedId) : null;
      if (!row) {
        // Première utilisation dans ce navigateur : nouvelle ligne, partagée avec les autres pages.
        const result = await CoreGrist.gristInstance.docApi.applyUserActions([['AddRecord', PREFS_TABLE, null, {}]]);
        CoreGrist.invalidateTable(PREFS_TABLE);
        prefsRowId = CoreUtils.extractAddedRecordId(result);
        setCachedPrefsRowId(prefsRowId);
        return;
      }
      prefsRowId = row.id;
      if (ANNU_PREFS_COLUMNS.some(column => text(row[column.id]))) applyStoredPreferences(row);
    } catch (err) {
      console.warn('Chargement des préférences Annuaire a échoué :', err.message);
    }
  }
  async function saveAnnuaireUserPreferences() {
    saveSoon.cancel();
    if (!prefsRowId || !window.CoreGrist || !CoreGrist.gristInstance) return;
    const fields = {
      Annu_onglet: state.tab,
      Annu_vue: state.view,
      Annu_recherche: state.search,
      Annu_filtre_employeur: encodeList(state.employeurs),
      Annu_filtre_structure: encodeList(state.structures),
      Annu_filtre_type: encodeList(state.types),
      Annu_a_verifier: state.check ? '1' : '',
      Annu_tri: `${state.sortKey}:${state.sortDir}`,
      Annu_repliees: encodeList(state.collapsed)
    };
    try {
      await CoreGrist.gristInstance.docApi.applyUserActions([['UpdateRecord', PREFS_TABLE, prefsRowId, fields]]);
    } catch (err) {
      console.warn('Enregistrement des préférences Annuaire a échoué :', err.message);
    }
  }
  // Frappe dans la recherche : une seule écriture, après la dernière lettre.
  const saveSoon = CoreUtils.debounce(() => saveAnnuaireUserPreferences(), 600);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveSoon.flush(); });

  // --- Démarrage ---------------------------------------------------------------------------------------
  function init() {
    const view = $('view-annuaire');
    if (!view) return;
    wireBand(view);
    view.addEventListener('click', onClick);
    const drawerRoot = $('annu-drawer-root');
    if (drawerRoot) drawerRoot.addEventListener('click', onClick);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !state.selectedId || document.querySelector('.cp-modal:not(.cp-hidden)')) return; // une modale ouverte par-dessus se ferme d'abord
      closeCard();
    });
    // Changer de page ferme la fiche (elle est hors de la vue : elle resterait affichée sur l'autre page).
    document.addEventListener('click', event => { if (state.selectedId && event.target.closest && event.target.closest('.nav-btn')) { state.selectedId = 0; const root = $('annu-drawer-root'); if (root) root.innerHTML = ''; } });
    window.addEventListener('directory-changed', onDirectoryChanged);
  }

  window.renderAnnuaire = render;
  window.loadAnnuaireUserPreferences = loadAnnuaireUserPreferences;
  // Exposé pour les tests.
  window.AnnuaireLogic = { buildDirectory, filterPeople, filterPostes, sortPeople, sortPostes, listValues, fold, setClock, SOON_DAYS };
  window.AnnuaireTesting = { state, resetState, onDirectoryChanged, resetPrefsRow: () => { prefsRowId = null; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
