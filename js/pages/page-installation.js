/** Page Installation des fonds — frise de jalons en deux zones empilées : « Création » et
 * « Prolongation/réabondement » (maquette validée par Antoine le 12/11/2026 :
 * https://claude.ai/artifact/82ve1pxXEhdzjJSnsR8cLQ ; première maquette du 03/11/2026 :
 * https://claude.ai/artifact/V2Y6KUVgYviy8A5umgzuWS).
 *
 * - Lieu (bascule DIESE / AUTRE du bandeau, « OU » non exclusif) : déduit de
 *   Lignes_OPE.installe_chez (Reference → Structures), jamais d'un choix manuel. DIESE = structure
 *   d'acronyme DIESE ; AUTRE = toute autre structure, et aussi les projets sans ligne OPE.
 * - Zone : déduite de Projets.Action_Ligne_OPE_a_faire (prolongation / ré-abondement → Prolongation/
 *   réabondement ; tout le reste → Création).
 * - Jalon : Projets.Jalon_installation_fonds (Choice), colonne CRÉÉE par ce module (ensureColumns ci-dessous),
 *   absente de docs/grist_structure. Valeur neutre (indépendante de la zone), libellés affichés propres à
 *   la zone. Vide/inconnue = 1er jalon. L'ancienne colonne Statut_installation_fonds (5 étapes, jusqu'au
 *   12/11/2026) est reprise au chargement, sans rien supprimer.
 * - Les jalons « Projet en cours », « Reliquats à traiter » et « Projet clôturé » sont derrière un petit « + ».
 */
(function () {
  'use strict';

  // Acronyme Grist de la structure DIESE — confirmé par Antoine le 03/11/2026
  // (sinon, seul changement nécessaire si Grist utilise un autre libellé).
  const DIESE_ACRONYM = 'DIESE';

  // Valeurs enregistrées dans Jalon_installation_fonds : les mêmes dans les deux zones, pour qu'un projet qui
  // change de zone (action OPE modifiée) garde son avancement. Les libellés de la 1re et de la 2e étape
  // diffèrent selon la zone, voir ZONES.
  const JALONS = [
    '1) Création / prolongation de ligne',
    '2) En attente DF (ou OPE sur UBInvest)',
    '3) OPE disponible UB Invest',
    '4) Projet en cours',
    '5) Reliquats à traiter',
    '6) Projet clôturé (reliquat inclus)'
  ];
  const JALON_COLUMN = { id: 'Jalon_installation_fonds', type: 'Choice', widgetOptions: JSON.stringify({ choices: JALONS }) };
  const OPE_DISPONIBLE_INDEX = 2; // un projet à ce jalon doit avoir une ligne OPE complète, sinon alerte rouge
  const FIRST_HIDDEN_INDEX = 3; // jalons derrière le « + » : Projet en cours, Reliquats, Clôturé

  // Ancienne colonne à 5 étapes (livrée le 03/11/2026) → jalon correspondant. « Installé » = ligne
  // installée et disponible = « OPE disponible UB Invest ».
  const LEGACY_COLUMN = 'Statut_installation_fonds';
  const LEGACY_JALON_INDEX = {
    '1) En attente ouverture': 0,
    '1) En attente DR': 0,
    '2) Ouverture demandée à la DF': 1,
    '3) Installé': 2,
    '4) Reliquat à traiter': 4,
    '5) Clôturer': 5
  };

  const ZONES = [
    {
      key: 'creation',
      title: 'Création',
      labels: ['Création de ligne', 'En attente DF ou OPE sur UBInvest', 'OPE disponible UB Invest', 'Projet en cours', 'Reliquats à traiter', 'Projet clôturé (reliquat inclus)']
    },
    {
      key: 'prolongation',
      title: 'Prolongation/réabondement',
      labels: ['Prolongation/réattribution', 'En attente DF', 'OPE disponible UB Invest', 'Projet en cours', 'Reliquats à traiter', 'Projet clôturé (reliquat inclus)']
    }
  ];
  const LIEUX = [
    { key: 'diese', label: 'DIESE' },
    { key: 'autre', label: 'AUTRE' }
  ];
  const PROLONGATION_ACTIONS = ['Prolongation de ligne', 're-Abondement de ligne'];

  // Mêmes valeurs Choice que Action_Ligne_OPE_a_faire (project-modal.js, OPE_OPTIONS) — dupliqué ici plutôt
  // qu'importé, comme le reste des pages. « Création de ligne » n'a pas de pastille : la zone le dit déjà.
  const ACTION_LABELS = {
    'Prolongation de ligne': 'Prolongation',
    're-Abondement de ligne': 'Ré-abondement',
    'à determiner': 'Action à déterminer'
  };

  const ICON_GRIP = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.7"></circle><circle cx="15" cy="6" r="1.7"></circle><circle cx="9" cy="12" r="1.7"></circle><circle cx="15" cy="12" r="1.7"></circle><circle cx="9" cy="18" r="1.7"></circle><circle cx="15" cy="18" r="1.7"></circle></svg>';
  const ICON_CONVENTION = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h13l-3-3"></path><path d="M20 16H7l3 3"></path></svg>';
  const ICON_CHECK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>';

  const text = value => value == null ? '' : String(value);
  const escape = CoreUtils.escapeHtml;
  const tableRows = name => (window.CoreState && CoreState.getTable(name)) || [];
  const rowById = (tableName, id) => CoreUtils.findById(tableRows(tableName), id);
  const refId = value => (value && typeof value === 'object') ? (value.id ?? value) : value;
  const referencedIds = value => Array.isArray(value) ? value.filter(item => item !== 'L' && item != null && item !== 0) : [];
  const refLabel = (value, tableName, fields = []) => {
    if (Array.isArray(value)) return value.filter(item => item !== 'L').map(item => refLabel(item, tableName, fields)).filter(Boolean).join(', ');
    if (!value) return '';
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
  const instanceLabel = value => {
    if (Array.isArray(value)) return value.map(instanceLabel).filter(Boolean).join(', ');
    const suivi = rowById('Suivi_Instance', refId(value));
    if (suivi) return refLabel(suivi, null, ['Nom', 'name']) || valueLabel(suivi.Instance, 'Instances', ['Instances']);
    return valueLabel(value, 'Instances', ['Instances']);
  };
  const normalized = value => text(value).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const field = (project, names) => { for (const name of names) if (project[name] != null && project[name] !== '') return project[name]; return ''; };
  const stripOrdinal = label => text(label).replace(/^\d+\)\s*/, '');
  const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  function getProjects() { return (window.CoreState && CoreState.getTable('Projets')) || []; }
  function projectById(id) { return CoreUtils.findById(getProjects(), id); }

  // Une seule ligne OPE par projet en pratique, malgré le schéma ReferenceList
  // (même lecture que refreshInstalleChez() dans project-modal.js).
  function ligneOpeFor(project) {
    const ids = referencedIds(project.Ligne_OPE);
    return ids.length ? rowById('Lignes_OPE', ids[0]) : null;
  }
  function structureFor(ligne) {
    return ligne && ligne.installe_chez ? rowById('Structures', ligne.installe_chez) : null;
  }
  // DIESE seulement si la ligne OPE est installée chez la structure DIESE ; sinon AUTRE (autre structure
  // ou pas encore de ligne OPE).
  function lieuForProject(project) {
    const structure = structureFor(ligneOpeFor(project));
    return text(structure && structure.Acronyme).trim() === DIESE_ACRONYM ? 'diese' : 'autre';
  }
  function zoneForProject(project) {
    return PROLONGATION_ACTIONS.includes(text(project.Action_Ligne_OPE_a_faire)) ? 'prolongation' : 'creation';
  }
  // -1 : aucun jalon renseigné (ni dans la nouvelle colonne, ni dans l'ancienne). La page range alors le projet
  // au 1er jalon (jalonIndex) ; la page To Do, elle, ne le montre pas (rien n'a encore été décidé pour lui).
  function rawJalonIndex(project) {
    const idx = JALONS.indexOf(text(project[JALON_COLUMN.id]));
    if (idx !== -1) return idx;
    const legacy = text(project[LEGACY_COLUMN]);
    return hasOwn(LEGACY_JALON_INDEX, legacy) ? LEGACY_JALON_INDEX[legacy] : -1;
  }
  function jalonIndex(project) { return Math.max(0, rawJalonIndex(project)); }
  function actionInfo(project) {
    const value = text(project.Action_Ligne_OPE_a_faire);
    if (!value || value === 'Creation de ligne') return null;
    return { label: ACTION_LABELS[value] || value };
  }
  function opeInfo(project) {
    const ligne = ligneOpeFor(project);
    if (!ligne) return { id: null, label: 'Aucune ligne OPE', muted: true, complete: false };
    const structure = structureFor(ligne);
    const structureLabel = structure ? text(structure.Acronyme || structure.Nom_Complet) : '';
    const numero = text(ligne.N_OPE).trim();
    // Ligne dont on sait seulement où elle sera ouverte : pas encore de numéro (12/11/2026).
    return { id: ligne.id, label: `${numero ? 'OPE n°' + numero : 'N° OPE à venir'}${structureLabel ? ' — chez ' + structureLabel : ''}`, muted: false, complete: !!numero && !!structureLabel };
  }
  // Alerte rouge (Antoine, 12/11/2026) : projet à « OPE disponible UB Invest » sans ligne OPE complète (numéro ET structure).
  function opeAlert(project, idx) { return idx === OPE_DISPONIBLE_INDEX && !opeInfo(project).complete; }

  // État d'affichage, purement local à la session tant que les préférences ne sont pas chargées.
  const selectedLieux = new Set(LIEUX.map(l => l.key)); // bascule DIESE / AUTRE : au moins un reste actif
  const expandedZones = new Set(); // zones dont la partie cachée (« + ») est dépliée

  // Préférences (table partagée Preferences_Widget, cf. page-administratif.js —
  // même ligne, mêmes clés de cache, colonnes propres à cette page).
  const PREFS_TABLE = 'Preferences_Widget';
  const PREFS_ROWID_STORAGE_KEY = 'suiviProjetInnovationS:prefsRowId';
  const EMAIL_TRIGGER_COLUMN = { id: 'Email_utilisateur', type: 'Text', isFormula: false, formula: 'user.Email', recalcWhen: 0 };
  // Install_repliees / Install_masquees / Install_vue (anciennes colonnes des volets, jusqu'au 12/11/2026) ne sont plus lues.
  const INSTALL_PREFS_COLUMNS = [
    { id: 'Install_lieux', type: 'Text' },
    { id: 'Install_plus', type: 'Text' },
    { id: 'Install_filtre_programme', type: 'Text' },
    { id: 'Install_filtre_instance', type: 'Text' },
    { id: 'Install_filtre_recherche', type: 'Text' }
  ];
  let prefsRowId = null;
  const encodeList = CoreUtils.encodeList; // zones dépliées, lieux, et libellés des filtres (qui peuvent contenir une virgule)
  const decodeList = CoreUtils.decodeList;
  function getCachedPrefsRowId() {
    try { const raw = localStorage.getItem(PREFS_ROWID_STORAGE_KEY); return raw ? Number(raw) : null; }
    catch (err) { return null; }
  }
  function setCachedPrefsRowId(id) {
    try { localStorage.setItem(PREFS_ROWID_STORAGE_KEY, String(id)); }
    catch (err) { /* navigation privée / stockage bloqué : tant pis, pas de persistance entre sessions */ }
  }

  function multiComboValues(id) {
    return decodeList(document.getElementById(id)?.dataset.selectedValues);
  }
  function multiSummary(values, label) {
    if (!values.length) return '';
    return values.length === 1 ? values[0] : `${values.length} ${label}`;
  }
  function currentFilters() {
    return {
      programmes: multiComboValues('install-filter-programme'),
      instances: multiComboValues('install-filter-instance'),
      search: normalized(document.getElementById('install-filter-search')?.value)
    };
  }
  // Filtres du bandeau hors bascule DIESE / AUTRE (dont les compteurs tiennent compte des autres filtres).
  function filteredProjects() {
    const filters = currentFilters();
    // Les étiquettes Programme/Instance ne sont résolues que si le filtre correspondant est actif.
    return getProjects().filter(project => {
      if (filters.programmes.length && !filters.programmes.includes(programmeLabel(field(project, ['Programme', 'Programme_Axe_InnovationS'])))) return false;
      if (filters.instances.length && !filters.instances.includes(instanceLabel(field(project, ['Instance_ratachee', 'Instance', 'Instances'])))) return false;
      return !filters.search || normalized(text(project.Acronyme)).includes(filters.search);
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
  function renderMultiCombo(id, values, placeholder, summaryLabel) {
    const input = document.getElementById(id);
    const list = document.getElementById(`${id}-list`);
    if (!input || !list) return;
    const selected = multiComboValues(id);
    input.value = multiSummary(selected, summaryLabel);
    const ordered = [...values].sort((a, b) => {
      const aSelected = selected.includes(a), bSelected = selected.includes(b);
      return aSelected === bSelected ? 0 : (aSelected ? -1 : 1);
    });
    list.innerHTML = `<button type="button" data-value="">${escape(placeholder)}</button>` +
      ordered.map(value => {
        const isSelected = selected.includes(value);
        return `<button type="button" class="${isSelected ? 'is-selected' : ''}" data-value="${escape(value)}" role="option" aria-selected="${isSelected}">${escape(value)}</button>`;
      }).join('');
    list.querySelectorAll('[data-value]').forEach(button => button.addEventListener('mousedown', event => {
      event.preventDefault();
      const value = button.dataset.value;
      const next = value === '' ? [] : (selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
      input.dataset.selectedValues = encodeList(next);
      renderMultiCombo(id, values, placeholder, summaryLabel);
      render();
      saveInstallationUserPreferences();
    }));
  }
  function renderFilters() {
    renderMultiCombo('install-filter-programme', options(['Programme', 'Programme_Axe_InnovationS']), 'Tous les programmes', 'programmes sélectionnés');
    renderMultiCombo('install-filter-instance', options(['Instance_ratachee', 'Instance', 'Instances']), 'Toutes les instances', 'instances sélectionnées');
  }
  function setupMultiCombo(id, fieldNames, placeholder, summaryLabel) {
    const input = document.getElementById(id);
    const list = document.getElementById(`${id}-list`);
    if (!input || !list) return;
    input.readOnly = true;
    input.addEventListener('focus', () => { list.hidden = false; renderMultiCombo(id, options(fieldNames), placeholder, summaryLabel); });
    input.addEventListener('blur', () => setTimeout(() => {
      list.hidden = true;
      input.value = multiSummary(multiComboValues(id), summaryLabel);
    }, 150));
  }

  async function writeFields(table, id, fields) {
    const api = window.CoreGrist?.gristInstance;
    if (!api) throw new Error('API Grist indisponible');
    await api.docApi.applyUserActions([['UpdateRecord', table, Number(id), fields]]);
  }

  // Renvoie true quand le commentaire est enregistré (le champ repart alors de cette valeur, voir
  // le gestionnaire de sortie de champ dans wireRootEvents).
  async function saveComment(project, value) {
    try {
      await writeFields('Projets', project.id, { Commentaire_ligne_OPE: value });
      project.Commentaire_ligne_OPE = value;
      return true;
    } catch (err) {
      CoreUtils.showToast(`Échec de l'enregistrement du commentaire (${err.message})`, true);
      return false;
    }
  }

  // Glisser-déposer ou menu de la carte : seulement entre jalons d'une MÊME zone (la zone vient de
  // l'action OPE, jamais d'un glisser). Un jalon caché (« + ») atteint par ce biais déplie la zone.
  async function moveJalon(projectId, zoneKey, targetIdx) {
    const project = projectById(projectId);
    if (!project || !(targetIdx >= 0 && targetIdx < JALONS.length)) return;
    if (zoneForProject(project) !== zoneKey) return;
    if (jalonIndex(project) === targetIdx) return;
    const nextValue = JALONS[targetIdx];
    const zone = ZONES.find(z => z.key === zoneKey);
    try {
      await writeFields('Projets', project.id, { [JALON_COLUMN.id]: nextValue });
      project[JALON_COLUMN.id] = nextValue;
      CoreUtils.showToast(`${project.Acronyme || project.Projet} → ${zone.labels[targetIdx]}`);
      if (targetIdx >= FIRST_HIDDEN_INDEX && !expandedZones.has(zoneKey)) {
        expandedZones.add(zoneKey);
        saveInstallationUserPreferences();
      }
      render();
    } catch (err) {
      CoreUtils.showToast(`Échec de l'écriture (${err.message})`, true);
      render(); // le menu de la carte revient au jalon réellement enregistré
    }
  }

  function jalonSelect(project, zone, current) {
    return `<select class="install-status-select" data-install-status="${escape(project.id)}" title="Changer l'étape" aria-label="Étape de ${escape(project.Acronyme || project.Projet || 'ce projet')}">` +
      zone.labels.map((label, idx) => `<option value="${idx}"${idx === current ? ' selected' : ''}>${idx + 1} · ${escape(label)}</option>`).join('') + `</select>`;
  }

  // Haut de carte (Antoine, 12/11/2026) : bulle avec le nom du programme, et une marque propre aux projets en
  // convention de reversement ; un clic sur la marque ouvre la modale projet sur l'onglet Convention.
  function cardTop(project) {
    const programme = programmeLabel(field(project, ['Programme', 'Programme_Axe_InnovationS']));
    const convention = project.Convention_de_reversement === true;
    if (!programme && !convention) return '';
    return `<div class="install-card-top">` +
      (programme ? `<span class="install-chip install-chip-programme" title="Programme">${escape(programme)}</span>` : '') +
      (convention ? `<button type="button" class="install-chip install-chip-convention" data-open-convention="${escape(project.id)}" title="Ouvrir le projet, onglet Convention">${ICON_CONVENTION}Convention</button>` : '') +
      `</div>`;
  }

  function installCard(project, zone, idx) {
    const action = actionInfo(project);
    const ope = opeInfo(project);
    const alert = opeAlert(project, idx);
    const lieu = lieuForProject(project);
    const commentHelp = window.HelpTooltip?.markup('Projets', 'Commentaire_ligne_OPE') || '';
    const opeClasses = 'install-chip install-chip-ope' + (alert ? ' is-alert' : (ope.muted ? ' is-muted' : ''));
    return `<div class="install-card is-${lieu}${alert ? ' is-alert' : ''}" data-project-id="${escape(project.id)}" data-lieu="${lieu}">` +
      `<span class="install-drag-handle" draggable="true" data-drag-project="${escape(project.id)}" title="Glisser vers une autre étape">${ICON_GRIP}</span>` +
      cardTop(project) +
      `<button type="button" class="install-card-identity" data-open-project="${escape(project.id)}"><span class="install-acronym">${escape(project.Acronyme || project.Projet || 'Sans acronyme')}</span></button>` +
      `<div class="install-badges">` +
      (ope.id != null
        ? `<button type="button" class="${opeClasses}" data-open-ope="${escape(ope.id)}" title="Ouvrir la ligne OPE">${escape(ope.label)}</button>`
        : `<span class="${opeClasses}">${escape(ope.label)}</span>`) +
      (alert ? `<span class="install-chip install-chip-alert">OPE à compléter</span>` : '') +
      (action ? `<span class="install-chip install-chip-action">${escape(action.label)}</span>` : '') +
      `</div>` +
      `<div class="install-amount-row"><span class="install-amount-value">${escape(CoreUtils.formatCurrency(project.Montant_attribue_Total))}</span><span class="install-amount-label">attribués</span></div>` +
      `<div class="install-budget-row">` +
      `<div class="install-budget-item" title="Fonctionnement"><span class="install-budget-label">Fonct.</span><span class="install-budget-value">${escape(CoreUtils.formatCurrency(project.Total_Fonctionnement))}</span></div>` +
      `<div class="install-budget-item" title="Investissement"><span class="install-budget-label">Invest.</span><span class="install-budget-value">${escape(CoreUtils.formatCurrency(project.Total_investissement))}</span></div>` +
      `<div class="install-budget-item" title="Personnel"><span class="install-budget-label">Pers.</span><span class="install-budget-value">${escape(CoreUtils.formatCurrency(project.Total_Personnel))}</span></div>` +
      `</div>` +
      `<label class="install-comment"><span class="install-field-label">Commentaire OPE/installation${commentHelp}</span>` +
      `<textarea data-install-comment="${escape(project.id)}" rows="2" placeholder="Commentaire…">${escape(project.Commentaire_ligne_OPE)}</textarea></label>` +
      jalonSelect(project, zone, idx) +
      `</div>`;
  }

  function milestoneHtml(zone, idx, items, expanded) {
    const label = zone.labels[idx];
    const extra = idx >= FIRST_HIDDEN_INDEX;
    const empty = items.length === 0;
    const alert = items.some(p => opeAlert(p, idx));
    const jalonHelp = window.HelpTooltip?.markup('Projets', JALON_COLUMN.id) || '';
    const classes = ['install-ms', empty ? 'is-done' : 'has-items', alert ? 'has-alert' : '', extra ? 'is-extra' : '', idx >= FIRST_HIDDEN_INDEX - 1 ? 'is-dashed' : ''].filter(Boolean).join(' ');
    const key = `${zone.key}:${idx}`;
    return `<div class="${classes}" data-install-ms="${escape(key)}">` +
      `<div class="install-ms-head">` +
      `<span class="install-ms-dot"${empty ? ' role="img" aria-label="Rien en attente"' : ''}>${empty ? ICON_CHECK : idx + 1}</span>` +
      `<div class="install-ms-label-row"><h4 class="install-ms-label">${escape(label)}${jalonHelp}</h4>${empty ? '' : `<span class="install-ms-count">${items.length}</span>`}</div>` +
      `</div>` +
      `<div class="install-ms-body" data-drop-ms="${escape(key)}">${empty ? '<p class="install-ms-empty">Aucun projet</p>' : items.map(p => installCard(p, zone, idx)).join('')}</div>` +
      `</div>`;
  }

  function zoneHtml(zone, projects) {
    const expanded = expandedZones.has(zone.key);
    const shown = expanded ? JALONS.length : FIRST_HIDDEN_INDEX;
    const hiddenCount = projects.filter(p => jalonIndex(p) >= FIRST_HIDDEN_INDEX).length;
    const columns = [];
    for (let idx = 0; idx < shown; idx++) columns.push(milestoneHtml(zone, idx, projects.filter(p => jalonIndex(p) === idx), expanded));
    const plusLabel = expanded ? 'Masquer projet en cours, reliquats et clôture' : 'Afficher projet en cours, reliquats et clôture';
    const plus = `<div class="install-plus-col">` +
      `<button type="button" class="install-plus-btn" data-install-plus="${zone.key}" aria-expanded="${expanded}" aria-label="${plusLabel}" title="${plusLabel}">${expanded ? '−' : '+'}` +
      `${!expanded && hiddenCount ? `<span class="install-plus-badge">${hiddenCount}</span>` : ''}</button>` +
      `<span class="install-plus-cap">${expanded ? 'Masquer' : 'En cours, reliquats, clôture'}</span></div>`;
    return `<section class="install-zone" data-install-zone="${zone.key}" aria-label="${escape(zone.title)}">` +
      `<div class="install-zone-head"><h3>${escape(zone.title)}</h3><span class="install-zone-count">${projects.length} projet${projects.length > 1 ? 's' : ''}</span></div>` +
      `<div class="install-rail-scroll"><div class="install-rail ${expanded ? 'cols-6' : 'cols-3'}">${columns.join('')}${plus}</div></div></section>`;
  }

  function wireRootEvents(root) {
    root.querySelectorAll('[data-open-project]').forEach(btn => btn.addEventListener('click', () => {
      const project = projectById(btn.dataset.openProject);
      if (project && window.ProjectModal?.open) window.ProjectModal.open(project);
      else if (window.openProject) window.openProject(btn.dataset.openProject);
    }));
    root.querySelectorAll('[data-open-convention]').forEach(btn => btn.addEventListener('click', () => {
      const project = projectById(btn.dataset.openConvention);
      if (project && window.ProjectModal?.open) window.ProjectModal.open(project, { tab: 'conventions' });
    }));
    root.querySelectorAll('[data-open-ope]').forEach(btn => btn.addEventListener('click', () => {
      // Après enregistrement, le numéro ou la structure ont pu changer : la carte peut changer de lieu ou passer au rouge.
      if (window.openEditOpeModal) window.openEditOpeModal(btn.dataset.openOpe, () => render());
    }));
    root.querySelectorAll('[data-install-status]').forEach(select => select.addEventListener('change', () => {
      const project = projectById(select.dataset.installStatus);
      if (project) moveJalon(project.id, zoneForProject(project), Number(select.value));
    }));
    root.querySelectorAll('[data-install-plus]').forEach(btn => btn.addEventListener('click', () => {
      const zoneKey = btn.dataset.installPlus;
      if (expandedZones.has(zoneKey)) expandedZones.delete(zoneKey); else expandedZones.add(zoneKey);
      render();
      saveInstallationUserPreferences();
    }));
    root.querySelectorAll('[data-install-comment]').forEach(textarea => textarea.addEventListener('blur', async () => {
      // Non modifié depuis le dernier état enregistré : rien à écrire. `defaultValue` suit la valeur
      // enregistrée (pas de nouveau rendu après l'écriture) : sinon, revenir à la valeur affichée au
      // rendu (A → B enregistré, puis B → A) passerait pour « inchangé » et le B resterait dans Grist.
      if (textarea.value === textarea.defaultValue) return;
      const project = projectById(textarea.dataset.installComment);
      if (!project) return;
      const value = textarea.value;
      if (await saveComment(project, value)) textarea.defaultValue = value;
    }));
  }

  // Bascule DIESE / AUTRE du bandeau : état (pressé ou non) et compteur de chaque lieu, selon les autres filtres.
  function updateLieuToggle(base) {
    LIEUX.forEach(lieu => {
      const btn = document.querySelector(`[data-install-lieu="${lieu.key}"]`);
      if (!btn) return;
      const on = selectedLieux.has(lieu.key);
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', String(on));
      const count = btn.querySelector('.install-lieu-count');
      if (count) count.textContent = String(base.filter(p => lieuForProject(p) === lieu.key).length);
    });
  }

  function render() {
    if (!window.CoreState || !CoreState.getTable('Projets')) return;
    const root = document.getElementById('install-zones');
    if (!root) return;
    const base = filteredProjects();
    updateLieuToggle(base);
    const visible = base.filter(p => selectedLieux.has(lieuForProject(p)));
    root.innerHTML = ZONES.map(zone => zoneHtml(zone, visible.filter(p => zoneForProject(p) === zone.key))).join('') +
      (visible.length ? '' : '<p class="kanban-empty install-empty">Aucun projet ne correspond aux filtres.</p>');
    wireRootEvents(root);
  }

  // Délégation sur la racine persistante (#install-zones, dont seul le contenu est recréé à chaque rendu) —
  // même patron que initConvDelegation() dans page-administratif.js, type MIME propre à cette page pour ne
  // jamais accepter une carte glissée depuis Conventions.
  const DRAG_TYPE = 'application/x-suivi-installation';
  const carriesInstallCard = event => !!(event.dataTransfer && Array.from(event.dataTransfer.types || []).includes(DRAG_TYPE));
  function initInstallDelegation() {
    const root = document.getElementById('install-zones');
    if (!root) return;
    const closest = (event, selector) => (event.target && event.target.closest) ? event.target.closest(selector) : null;
    let draggingCard = null;
    let draggingZone = null; // la zone de la carte glissée (illisible dans dragover : seules les valeurs d'en-tête le sont)
    const clearDragFeedback = () => {
      draggingCard = null;
      draggingZone = null;
      root.querySelectorAll('.is-drop-target, .is-dragging').forEach(el => el.classList.remove('is-drop-target', 'is-dragging'));
    };
    const zoneOf = el => el.closest('[data-install-zone]')?.dataset.installZone;
    // Zone d'arrivée acceptée : celle de la carte glissée (une carte ne change pas de zone par glisser-déposer).
    const accepts = body => !!body && (draggingZone == null || zoneOf(body) === draggingZone);
    root.addEventListener('dragstart', event => {
      const handle = closest(event, '[data-drag-project]');
      if (!handle || !event.dataTransfer) return;
      const dt = event.dataTransfer;
      dt.effectAllowed = 'move';
      dt.setData(DRAG_TYPE, handle.dataset.dragProject);
      dt.setData('text/plain', handle.dataset.dragProject); // Firefox exige au moins une donnée standard
      const card = handle.closest('.install-card');
      if (card && dt.setDragImage) { try { dt.setDragImage(card, 14, 14); } catch (err) { /* aperçu par défaut */ } }
      draggingCard = card;
      draggingZone = card ? zoneOf(card) : null;
      if (card) setTimeout(() => { if (draggingCard === card) card.classList.add('is-dragging'); }, 0);
    });
    root.addEventListener('dragover', event => {
      const body = closest(event, '[data-drop-ms]');
      if (!body || !carriesInstallCard(event) || !accepts(body)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (!body.classList.contains('is-drop-target')) {
        root.querySelectorAll('.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
        body.classList.add('is-drop-target');
      }
    });
    root.addEventListener('dragleave', event => {
      const body = closest(event, '[data-drop-ms]');
      if (body && !body.contains(event.relatedTarget)) body.classList.remove('is-drop-target');
    });
    root.addEventListener('drop', event => {
      const body = closest(event, '[data-drop-ms]');
      if (!body || !carriesInstallCard(event)) return;
      event.preventDefault();
      const projectId = event.dataTransfer.getData(DRAG_TYPE);
      clearDragFeedback();
      if (projectId) {
        const [zoneKey, idxStr] = body.dataset.dropMs.split(':');
        moveJalon(projectId, zoneKey, Number(idxStr));
      }
    });
    root.addEventListener('dragend', clearDragFeedback);
  }

  function applyStoredInstallFilters(row) {
    const programmeInput = document.getElementById('install-filter-programme');
    if (programmeInput && row.Install_filtre_programme) programmeInput.dataset.selectedValues = row.Install_filtre_programme;
    const instanceInput = document.getElementById('install-filter-instance');
    if (instanceInput && row.Install_filtre_instance) instanceInput.dataset.selectedValues = row.Install_filtre_instance;
    const search = document.getElementById('install-filter-search');
    if (search && row.Install_filtre_recherche) search.value = row.Install_filtre_recherche;
  }

  // Projets restés sur l'ancienne colonne à 5 étapes : le jalon correspondant est écrit dans la nouvelle colonne
  // (une seule écriture groupée) et dans les données déjà chargées. Au mieux : sans droit d'écriture, la page lit
  // quand même l'ancienne colonne (rawJalonIndex), rien n'est perdu.
  async function migrateLegacyStatus() {
    const stale = getProjects().filter(p => !text(p[JALON_COLUMN.id]) && hasOwn(LEGACY_JALON_INDEX, text(p[LEGACY_COLUMN])));
    if (!stale.length) return;
    const nextOf = project => JALONS[LEGACY_JALON_INDEX[text(project[LEGACY_COLUMN])]];
    try {
      await CoreGrist.gristInstance.docApi.applyUserActions(stale.map(project => ['UpdateRecord', 'Projets', Number(project.id), { [JALON_COLUMN.id]: nextOf(project) }]));
      stale.forEach(project => { project[JALON_COLUMN.id] = nextOf(project); });
    } catch (err) {
      console.warn("Reprise des anciens statuts d'installation a échoué :", err.message);
    }
  }

  async function loadInstallationUserPreferences() {
    if (!window.CoreGrist || !CoreGrist.gristInstance) return;
    try {
      await CoreGrist.ensureColumns('Projets', [JALON_COLUMN]);
      await CoreGrist.ensureChoices('Projets', JALON_COLUMN.id, JALONS);
      await migrateLegacyStatus();
      await CoreGrist.ensureTable(PREFS_TABLE, [EMAIL_TRIGGER_COLUMN, ...INSTALL_PREFS_COLUMNS]);
      await CoreGrist.ensureColumns(PREFS_TABLE, INSTALL_PREFS_COLUMNS);
      const rows = await CoreGrist.getTable(PREFS_TABLE, { shared: true }); // lecture partagée au démarrage (js/app.js)
      const cachedId = getCachedPrefsRowId();
      const row = cachedId != null ? rows.find(r => r.id === cachedId) : null;
      if (!row) {
        // Première utilisation dans ce navigateur : nouvelle ligne, partagée
        // avec les autres pages (normalement déjà créée avant celle-ci, cf. js/app.js).
        const result = await CoreGrist.gristInstance.docApi.applyUserActions([['AddRecord', PREFS_TABLE, null, {}]]);
        CoreGrist.invalidateTable(PREFS_TABLE); // la ligne vient d'être ajoutée : la prochaine lecture partagée doit la contenir
        prefsRowId = CoreUtils.extractAddedRecordId(result);
        setCachedPrefsRowId(prefsRowId);
        return;
      }
      prefsRowId = row.id;
      const hasSavedPreferences = !!(text(row.Install_lieux) || text(row.Install_plus) ||
        text(row.Install_filtre_programme) || text(row.Install_filtre_instance) || text(row.Install_filtre_recherche));
      if (!hasSavedPreferences) return;
      const lieux = decodeList(row.Install_lieux).filter(key => LIEUX.some(l => l.key === key));
      if (lieux.length) { selectedLieux.clear(); lieux.forEach(key => selectedLieux.add(key)); }
      expandedZones.clear();
      decodeList(row.Install_plus).filter(key => ZONES.some(z => z.key === key)).forEach(key => expandedZones.add(key));
      applyStoredInstallFilters(row);
    } catch (err) {
      console.warn("Chargement des préférences Installation a échoué :", err.message);
    }
  }

  async function saveInstallationUserPreferences() {
    saveInstallationUserPreferencesSoon.cancel();
    if (!prefsRowId || !window.CoreGrist?.gristInstance) return;
    const fields = {
      Install_lieux: encodeList(LIEUX.map(l => l.key).filter(key => selectedLieux.has(key))), // ordre fixe, quel que soit l'ordre des clics
      Install_plus: encodeList([...expandedZones]),
      Install_filtre_programme: encodeList(multiComboValues('install-filter-programme')),
      Install_filtre_instance: encodeList(multiComboValues('install-filter-instance')),
      Install_filtre_recherche: document.getElementById('install-filter-search')?.value || ''
    };
    try {
      await CoreGrist.gristInstance.docApi.applyUserActions([['UpdateRecord', PREFS_TABLE, prefsRowId, fields]]);
    } catch (err) {
      console.warn("Enregistrement des préférences Installation a échoué :", err.message);
    }
  }
  // Frappe dans la recherche : écriture différée (une seule, après la dernière lettre) plutôt qu'à chaque touche.
  const saveInstallationUserPreferencesSoon = CoreUtils.debounce(() => saveInstallationUserPreferences(), 600);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveInstallationUserPreferencesSoon.flush(); }); // page masquée : on n'attend plus

  function init() {
    initInstallDelegation();
    renderFilters();
    setupMultiCombo('install-filter-programme', ['Programme', 'Programme_Axe_InnovationS'], 'Tous les programmes', 'programmes sélectionnés');
    setupMultiCombo('install-filter-instance', ['Instance_ratachee', 'Instance', 'Instances'], 'Toutes les instances', 'instances sélectionnées');
    render();
    document.getElementById('install-filter-search')?.addEventListener('input', () => { render(); saveInstallationUserPreferencesSoon(); });
    document.getElementById('install-clear-filters')?.addEventListener('click', () => {
      ['install-filter-programme', 'install-filter-instance'].forEach(id => {
        const input = document.getElementById(id);
        if (input) { input.value = ''; input.dataset.selectedValues = ''; }
      });
      const search = document.getElementById('install-filter-search');
      if (search) search.value = '';
      LIEUX.forEach(lieu => selectedLieux.add(lieu.key));
      renderFilters();
      render();
      saveInstallationUserPreferences();
    });
    document.querySelectorAll('[data-install-lieu]').forEach(btn => btn.addEventListener('click', () => {
      const key = btn.dataset.installLieu;
      // « OU » non exclusif : on peut activer l'un, l'autre ou les deux ; le dernier actif ne se désactive pas
      // (un « OU » vide n'afficherait rien).
      if (selectedLieux.has(key)) {
        if (selectedLieux.size === 1) return;
        selectedLieux.delete(key);
      } else {
        selectedLieux.add(key);
      }
      render();
      saveInstallationUserPreferences();
    }));
  }

  window.renderInstallation = function () { renderFilters(); render(); };
  window.loadInstallationUserPreferences = loadInstallationUserPreferences;
  // Exposé pour les tests et pour la page To Do (même colonne de jalons).
  window.InstallationLogic = { lieuForProject, zoneForProject, jalonIndex, rawJalonIndex, JALONS, ZONES };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
