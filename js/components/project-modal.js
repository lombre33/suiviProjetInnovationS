/* Création de projet — composant modal fonctionnel. */
(function (global) {
  'use strict';

  const text = v => v == null ? '' : String(v);
  const rows = name => tables()?.getTable(name) || [];
  const tables = () => global.CoreState && typeof global.CoreState.getTable === 'function'
    ? { getTable: name => global.CoreState.getTable(name) }
    : global.CoreGrist?.tables;
  const esc = v => global.CoreUtils.escapeHtml(v);
  // Bulle d'aide Grist (description de colonne) accolée au libellé d'un champ —
  // toujours la table Projets ici, seule table que cette modale écrit ; aucune
  // icône si la colonne n'a pas de description (cf. js/components/help-tooltip.js).
  const withHelp = (labelEl, colId) => global.HelpTooltip?.attach(labelEl, 'Projets', colId);
  const label = (r, fields) => fields.map(k => r?.[k]).find(v => v != null && v !== '') || '';
  const personLabel = r => label(r, ['nom_et_Prenom', 'Prenom', 'NOM']);
  const opeLabel = r => text(r?.N_OPE);
  const FIN = {
    2026: ['c2026_M10_Fonctionnement', 'c2026_M20_Investissement', 'c2026_M30_Personnel'],
    2027: ['c2027_M10_Fonctionnement', 'c2027_M20_Investissement', 'c2027_M30_Personnel'],
    2028: ['c2028_M10_Fonctionnement', 'c2028_M20_Investissement', 'c2028_M30_Personnel'],
    2029: ['c2029_M10_Fonctionnement', 'c2029_M20_Investissement', 'c2029_M30_Personnel']
  };
  const normaliseBudgetValue = value => value === '' || value == null || !Number.isFinite(Number(value)) ? 0 : Number(value);

  // Champs du prévisionnel budgétaire : type="text" plutôt que type="number" pour
  // ne plus avoir de flèches +/- natives (dont le retrait CSS seul, via
  // -webkit-appearance, laisse en pratique tous les caractères tapables), et pour
  // filtrer nous-mêmes la saisie à chaque frappe/collage : uniquement des chiffres
  // et un seul point décimal, jamais de lettre ("e" d'une notation scientifique
  // compris) ni de signe.
  function sanitizeNumericInput(input) {
    const cleaned = input.value.replace(/[^\d.]/g, '');
    const firstDot = cleaned.indexOf('.');
    input.value = firstDot === -1 ? cleaned : cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  }

  // Onglets de la modale — regroupent les ~30 champs par thème plutôt qu'un long
  // formulaire à plat (cf. maquette Option A). Chaque panneau reste un simple
  // conteneur DOM : refField()/multiRefField()/field() sont inchangés, seul le
  // parent auquel ils sont rattachés change.
  const TABS = [
    { key: 'general', label: 'Général' },
    { key: 'porteurs', label: 'Porteurs' },
    { key: 'dates', label: 'Dates & OPE' },
    { key: 'budget', label: 'Budget' },
    { key: 'conventions', label: 'Convention' }
  ];

  const TYPE_OPTIONS = [
    { value: 'Projet', label: 'Projet' },
    { value: 'Ingenierie_creation', label: 'Ingénierie création' },
    { value: 'Ingenierie_renouvellement', label: 'Ingénierie renouvellement' },
    { value: 'reattribution', label: 'Réattribution' },
    { value: 'prolongation', label: 'Prolongation' },
    { value: 'myphd+', label: 'MyPhD+' }
  ];

  const OPE_OPTIONS = [
    { value: '', label: 'Aucune' },
    { value: 'Creation de ligne', label: 'Création de ligne' },
    { value: 'Prolongation de ligne', label: 'Prolongation' },
    { value: 're-Abondement de ligne', label: 'Ré-abondement' },
    { value: 'à determiner', label: 'À déterminer' }
  ];

  function refField(parent, key, table, display, required = false) {
    const isPerson = table === 'Annuaire';
    const wrap = document.createElement('div');
    wrap.className = 'cp-field cp-ref' + (isPerson ? ' cp-ref-person' : '');
    // .cp-ref-list reste imbriquée dans .cp-ref-control (pas un simple sibling du wrap) :
    // input.parentElement.querySelector('.cp-ref-list') est le patron utilisé ailleurs
    // (ensureCreateAction() dans person-modal.js, pickRef() dans les tests) pour
    // retrouver la liste depuis l'input — la casser forcerait à toucher ces deux autres
    // endroits pour un simple changement de structure interne à refField().
    const control = `<div class="cp-ref-control"><input autocomplete="off" data-ref="${key}" placeholder="Rechercher…"><button type="button" class="cp-ref-clear" aria-label="Retirer la valeur" tabindex="-1">×</button><div class="cp-ref-list cp-hidden"></div></div>`;
    wrap.innerHTML = isPerson
      ? `<label>${esc(display.label)}${required ? ' *' : ''}</label><span class="cp-ref-avatar" aria-hidden="true"></span>${control}`
      : `<label>${esc(display.label)}${required ? ' *' : ''}</label>${control}`;
    const input = wrap.querySelector('input'), list = wrap.querySelector('.cp-ref-list'), avatar = wrap.querySelector('.cp-ref-avatar'), clearBtn = wrap.querySelector('.cp-ref-clear');
    const all = () => table === '__choice__' ? [] : rows(table);
    const displayValue = r => text(display.format ? display.format(r) : label(r, display.fields));
    const initials = str => (str || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    // Bascule l'affichage "bulle" (fond teinté + croix de suppression au survol) dès
    // qu'une valeur est retenue, pour tous les champs référence — avant ça, retirer une
    // valeur déjà choisie (un porteur par ex.) obligeait à effacer le texte affiché
    // caractère par caractère. _cpRefSync est exposé sur l'input pour que les modales de
    // création à la volée (personne, ligne OPE) puissent déclencher ce même rafraîchissement
    // une fois la nouvelle valeur poussée dans input.value/dataset.id.
    const refreshAvatar = () => {
      const idNum = Number(input.dataset.id);
      const hasValue = Number.isFinite(idNum) && idNum > 0;
      wrap.classList.toggle('cp-ref-has-value', hasValue);
      if (avatar) avatar.textContent = hasValue ? initials(input.value) : '';
    };
    input._cpRefSync = refreshAvatar;

    const render = (clearSelection = true) => {
      if (clearSelection) { input.dataset.id = ''; refreshAvatar(); }
      const q = input.value.trim().toLowerCase();
      const matches = all().filter(r => displayValue(r).toLowerCase().includes(q)).slice(0, 30);
      list.innerHTML = matches.map(r => `<button type="button" data-id="${esc(r.id)}">${esc(displayValue(r))}</button>`).join('');
      if (!matches.length && q) {
        if (table === 'Annuaire' && typeof window.openCreatePersonModal === 'function') {
          list.innerHTML = `<button type="button" data-create-person="${esc(input.value.trim())}">+ Créer "${esc(input.value.trim())}"</button>`;
        } else if (table === 'EcritureComptables' && typeof window.openCreateOpeModal === 'function') {
          list.innerHTML = `<button type="button" data-create-ope="${esc(input.value.trim())}">+ Créer la ligne OPE "${esc(input.value.trim())}"</button>`;
        }
      }
      list.classList.toggle('cp-hidden', !list.innerHTML);
      list.querySelectorAll('button').forEach(b => b.onclick = () => {
        if (b.dataset.createPerson !== undefined) {
          window.openCreatePersonModal(b.dataset.createPerson, input);
          return;
        }
        if (b.dataset.createOpe !== undefined) {
          window.openCreateOpeModal(b.dataset.createOpe, input);
          return;
        }
        input.value = b.textContent;
        input.dataset.id = b.dataset.id;
        refreshAvatar();
        list.classList.add('cp-hidden');
      });
    };

    input.oninput = () => { input.dataset.id = ''; refreshAvatar(); render(); };
    input.onfocus = () => render(false);
    input.onclick = event => {
      if (table === 'Annuaire' && input.value.trim() && input.dataset.id && typeof window.openEditPersonModal === 'function') {
        const person = all().find(r => String(r.id) === String(input.dataset.id));
        if (person) {
          event.preventDefault();
          event.stopPropagation();
          list.classList.add('cp-hidden');
          window.openEditPersonModal(person, input);
        }
      }
    };
    // Sans ce garde-fou, du texte tapé sans sélectionner de suggestion restait affiché
    // alors qu'aucun id n'était retenu (dataset.id vide) : le champ semblait renseigné
    // mais la valeur poussée dans Grist était vide. On aligne l'affichage sur ce qui
    // sera réellement enregistré : seul un objet existant, cliqué dans la liste, compte.
    input.onblur = () => setTimeout(() => {
      list.classList.add('cp-hidden');
      if (!input.dataset.id) input.value = '';
    }, 150);
    // mousedown (pas click) + preventDefault : évite que le blur de l'input (ci-dessus)
    // ne parte avant le clic sur la croix, ce qui ferait interférer son minuteur de
    // 150ms avec la suppression explicite demandée ici.
    clearBtn.onmousedown = event => {
      event.preventDefault();
      event.stopPropagation();
      input.value = '';
      input.dataset.id = '';
      refreshAvatar();
      render();
      input.focus();
    };
    withHelp(wrap.querySelector('label'), key);
    parent.appendChild(wrap);
    return { wrap, input, refreshAvatar };
  }

  function multiRefField(parent, key, table, display) {
    const wrap = document.createElement('div');
    wrap.className = 'cp-field cp-ref cp-multi-ref';
    wrap.innerHTML = `<label>${esc(display.label)}</label><div class="cp-ref-chips" data-ref-chips="${esc(key)}"></div><input autocomplete="off" data-ref="${esc(key)}" placeholder="Rechercher…"><div class="cp-ref-list cp-hidden"></div>`;
    const input = wrap.querySelector('input'), list = wrap.querySelector('.cp-ref-list'), chips = wrap.querySelector('.cp-ref-chips');
    const ids = [];
    const all = () => rows(table).length ? rows(table) : rows('Etablissements');
    const displayValue = r => text(display.format ? display.format(r) : label(r, display.fields));

    const render = () => {
      const q = input.value.trim().toLowerCase();
      list.innerHTML = all()
        .filter(r => !ids.includes(Number(r.id)) && displayValue(r).toLowerCase().includes(q))
        .slice(0, 30)
        .map(r => `<button type="button" data-id="${esc(r.id)}">${esc(displayValue(r))}</button>`).join('');
      list.classList.toggle('cp-hidden', !list.innerHTML);
      list.querySelectorAll('button').forEach(b => b.onclick = () => {
        const id = Number(b.dataset.id);
        if (!ids.includes(id)) ids.push(id);
        input.value = '';
        renderChips();
        list.classList.add('cp-hidden');
      });
    };

    const renderChips = () => {
      chips.innerHTML = ids.map(id => {
        const r = all().find(x => Number(x.id) === id);
        return `<span class="cp-ref-chip">${esc(r ? displayValue(r) : id)}<button type="button" data-remove="${id}" aria-label="Retirer">×</button></span>`;
      }).join('');
      chips.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => {
        ids.splice(ids.indexOf(Number(b.dataset.remove)), 1);
        renderChips();
        render();
      });
    };

    input.oninput = render;
    input.onfocus = render;
    // Une puce n'est ajoutée que par le clic sur une suggestion (ci-dessus), qui vide
    // déjà l'input ; si l'utilisateur tape puis quitte le champ sans cliquer, ce texte
    // ne correspond à aucun objet ajouté et ne doit pas rester affiché comme s'il l'était.
    input.onblur = () => setTimeout(() => { list.classList.add('cp-hidden'); input.value = ''; }, 150);
    wrap._ids = ids;
    wrap._setIds = values => { ids.splice(0, ids.length, ...normaliseRefList(values)); renderChips(); };
    withHelp(wrap.querySelector('label'), key);
    parent.appendChild(wrap);
    return { wrap, input, ids };
  }

  function normaliseRefList(value) {
    const values = Array.isArray(value) ? value : (value == null || value === '' ? [] : [value]);
    return values
      .filter(v => v !== null && v !== undefined && v !== '' && v !== 'L')
      .map(v => typeof v === 'object' ? v.id : v)
      .filter(v => Number.isFinite(Number(v)))
      .map(Number);
  }

  // Groupe de puces pour un choix fermé (Type de projet) : la valeur réelle vit
  // dans un <select> invisible (accessible au clavier/lecteur d'écran) que les
  // puces pilotent ; collectFields()/populateModal() continuent de lire/écrire
  // refs.type.input.value exactement comme avec l'ancien champ texte+datalist.
  function chipGroup(parent, id, labelText, options, initialValue, required = false) {
    const wrap = document.createElement('div');
    wrap.className = 'cp-field cp-full';
    wrap.innerHTML = `<label for="${id}">${esc(labelText)}${required ? ' *' : ''}</label><div class="cp-chip-row"></div>`;
    const select = document.createElement('select');
    select.id = id;
    select.className = 'cp-visually-hidden';
    select.innerHTML = options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
    select.value = initialValue;
    wrap.appendChild(select);
    const row = wrap.querySelector('.cp-chip-row');
    const render = () => {
      row.innerHTML = options.map(o => `<button type="button" class="cp-chip${o.value === select.value ? ' active' : ''}" data-value="${esc(o.value)}">${esc(o.label)}</button>`).join('');
      row.querySelectorAll('button').forEach(b => b.onclick = () => { select.value = b.dataset.value; select.dispatchEvent(new Event('change')); render(); });
    };
    select.addEventListener('change', render);
    render();
    withHelp(wrap.querySelector('label'), id.replace(/^cp-/, ''));
    parent.appendChild(wrap);
    return { wrap, input: select, render };
  }

  // Recalcule directement depuis les valeurs brutes des champs [data-fin], comme
  // updateFinancialTotals() : lire [data-grand-total].textContent (ex-implémentation)
  // ne marchait pas, car toLocaleString('fr-FR') y insère une espace insécable comme
  // séparateur de milliers et Number() ne sait pas reparser ça — silencieusement NaN,
  // donc 0, dès que le budget atteint 1000. Les deux totaux restent ainsi garantis
  // cohérents puisqu'ils font la somme des mêmes valeurs.
  function conventionTotal(m) {
    const table = m.querySelector('.cp-fin');
    if (table) return [...table.querySelectorAll('tbody [data-fin]')].reduce((sum, input) => sum + normaliseBudgetValue(input.value), 0);
    return Number(valueOf(m._projectRecord, ['Montant_attribue_Total'])) || 0;
  }

  function syncConventionAmounts(m, force = false) {
    const p1 = m.querySelector('#cp-Convention_montant_partenaire_1'), p2 = m.querySelector('#cp-Convention_montant_partenaire_2');
    if (!p1 || !p2) return;
    const total = conventionTotal(m);
    if (force || !m._conventionPartner1Manual) p1.value = String(total);
    if (force || !m._conventionPartner2Manual) p2.value = String(total - (Number(p1.value) || 0));
  }

  function field(parent, labelText, id, type = 'text', required = false) {
    const w = document.createElement('div');
    w.className = 'cp-field';
    w.innerHTML = `<label for="${id}">${esc(labelText)}${required ? ' *' : ''}</label><input id="${id}" type="${type}">`;
    withHelp(w.querySelector('label'), id.replace(/^cp-/, ''));
    parent.appendChild(w);
    return w.querySelector('input');
  }

  function createModal() {
    if (document.getElementById('cp-project-modal')) return document.getElementById('cp-project-modal');
    const m = document.createElement('div');
    m.id = 'cp-project-modal';
    m.className = 'cp-modal cp-hidden';
    m.innerHTML = `<div class="cp-box" role="dialog" aria-modal="true">` +
      `<div class="cp-head"><h2></h2><button type="button" data-cp-close aria-label="Fermer">×</button></div>` +
      `<div class="cp-tabbar" role="tablist">${TABS.map(t => `<button type="button" class="cp-tab" data-cp-tab="${t.key}" role="tab">${esc(t.label)}</button>`).join('')}</div>` +
      `<div id="cp-project-form" class="cp-body"></div>` +
      `<p id="cp-project-error" class="cp-error" role="alert"></p>` +
      `<p id="cp-project-warning" class="cp-warning-banner" role="status"></p>` +
      `<div class="cp-actions"><div class="cp-steps" id="cp-project-steps" aria-hidden="true"></div><button type="button" data-cp-cancel>Annuler</button><button type="button" data-cp-save>Créer le projet</button></div>` +
      `</div>`;
    document.body.appendChild(m);
    const f = m.querySelector('#cp-project-form');
    const refs = {};
    const panels = {};
    TABS.forEach(t => {
      const panel = document.createElement('div');
      const layout = t.key === 'budget' ? '' : (t.key === 'porteurs' ? ' cp-panel-list' : ' cp-grid');
      panel.className = `cp-panel${layout} cp-hidden`;
      panel.dataset.cpPanel = t.key;
      f.appendChild(panel);
      panels[t.key] = panel;
    });

    // Général
    refs.programme = refField(panels.general, 'Programme', 'Programmes', { label: 'Programme', fields: ['Programme'] }, true);
    refs.programme.wrap.classList.add('cp-full');
    field(panels.general, 'Projet', 'cp-Projet', 'text', true);
    field(panels.general, 'Acronyme', 'cp-Acronyme', 'text', true);
    refs.type = chipGroup(panels.general, 'cp-Type_projet', 'Type de projet', TYPE_OPTIONS, 'Projet', true);

    const statusWrap = document.createElement('div');
    statusWrap.className = 'cp-field';
    statusWrap.innerHTML = '<label for="cp-statut">Statut opérationnel</label><div class="cp-status-row"><select id="cp-statut"><option>en cours</option><option>Brouillon</option><option>En retard</option><option>cloturé avec Reliquat à traiter</option><option>Cloturé et reliquat traités</option><option selected>En attente des dispo des fonds</option><option>Suposé cloturé sans information sur ...</option></select><span class="cp-status-dot" id="cp-statut-dot"></span></div>';
    panels.general.appendChild(statusWrap);
    withHelp(statusWrap.querySelector('label'), 'Statut_operationnel_projet');
    const statutSelect = statusWrap.querySelector('#cp-statut'), statutDot = statusWrap.querySelector('#cp-statut-dot');
    const renderStatusDot = () => {
      const v = statutSelect.value.toLowerCase();
      statutDot.className = 'cp-status-dot' + (v.includes('retard') || v.includes('attente') ? ' warn' : (v.includes('clotur') ? ' ok' : ''));
      statutDot.title = statutSelect.value;
    };
    statutSelect.addEventListener('change', renderStatusDot);
    renderStatusDot();

    // Porteurs — liste verticale plutôt qu'une grille 2 colonnes : chaque champ
    // Annuaire porte son avatar (initiales) via refField(..., table:'Annuaire').
    // Porteur 1, VP porteur et Accompagnateur sont obligatoires à la création (demande
    // d'Antoine du 13/10/2026, cf. validateRequiredFields()) ; Porteur_2/Porteur_3 restent
    // optionnels.
    const REQUIRED_PORTEUR_KEYS = ['Porteur_1', 'VP_porteur_signataire_notif', 'Accompagnateur'];
    ['Porteur_1', 'Porteur_2', 'Porteur_3', 'VP_porteur_signataire_notif', 'Accompagnateur'].forEach(k => {
      refs[k] = refField(panels.porteurs, k, 'Annuaire', {
        label: k === 'VP_porteur_signataire_notif' ? 'VP porteur' : k.replace('_', ' '),
        fields: ['nom_et_Prenom', 'Prenom', 'NOM'],
        format: personLabel
      }, REQUIRED_PORTEUR_KEYS.includes(k));
    });

    const comment = document.createElement('div');
    comment.className = 'cp-field';
    comment.innerHTML = '<label>Commentaire général de suivi</label><textarea id="cp-comment" rows="3"></textarea>';
    withHelp(comment.querySelector('label'), 'comentaire_general_Suivi_projet');
    panels.porteurs.appendChild(comment);

    // Dates & OPE
    refs.Instance_ratachee = refField(panels.dates, 'Instance_ratachee', 'Suivi_Instance', { label: 'Instance rattachée', fields: ['Nom', 'name'] }, true);
    refs.Date_limite_financement = field(panels.dates, 'Date limite de financement', 'cp-Date_limite_financement', 'date', true);
    refs.Date_debut_Projet = field(panels.dates, 'Date de début du projet', 'cp-Date_debut_Projet', 'date');
    refs.Date_de_fin_Projet = field(panels.dates, 'Date de fin du projet', 'cp-Date_de_fin_Projet', 'date');
    refs.Periode = field(panels.dates, 'Période (calculée)', 'cp-Periode', 'text');
    refs.Periode.readOnly = true;
    refs.Periode.classList.add('cp-readonly');
    refs.Periode.setAttribute('aria-readonly', 'true');

    refs.Ligne_OPE = refField(panels.dates, 'Ligne_OPE', 'EcritureComptables', { label: 'Ligne OPE', fields: ['N_OPE'], format: opeLabel });
    refs.Ligne_OPE_installe_chez = field(panels.dates, 'Installée chez (rapporté)', 'cp-Ligne_OPE_installe_chez', 'text');
    refs.Ligne_OPE_installe_chez.readOnly = true;
    refs.Ligne_OPE_installe_chez.classList.add('cp-readonly');
    refs.Ligne_OPE_installe_chez.setAttribute('aria-readonly', 'true');

    const opeWrap = document.createElement('div');
    opeWrap.className = 'cp-field cp-full';
    opeWrap.innerHTML = '<label for="cp-Action_Ligne_OPE_a_faire">Action ligne OPE *</label><div class="cp-chip-row"></div>';
    withHelp(opeWrap.querySelector('label'), 'Action_Ligne_OPE_a_faire');
    panels.dates.appendChild(opeWrap);
    const opeSelect = document.createElement('select');
    opeSelect.id = 'cp-Action_Ligne_OPE_a_faire';
    opeSelect.className = 'cp-visually-hidden';
    opeSelect.innerHTML = OPE_OPTIONS.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
    opeWrap.appendChild(opeSelect);
    refs.Action_Ligne_OPE_a_faire = opeSelect;
    const opeChipsRow = opeWrap.querySelector('.cp-chip-row');
    const renderOpeChips = () => {
      opeChipsRow.innerHTML = OPE_OPTIONS.filter(o => o.value).map(o => {
        const variant = o.value === 'à determiner' ? ' warn' : '';
        return `<button type="button" class="cp-chip${variant}${o.value === opeSelect.value ? ' active' : ''}" data-value="${esc(o.value)}">${esc(o.label)}</button>`;
      }).join('');
      opeChipsRow.querySelectorAll('button').forEach(b => b.onclick = () => {
        opeSelect.value = opeSelect.value === b.dataset.value ? '' : b.dataset.value;
        opeSelect.dispatchEvent(new Event('change'));
      });
    };
    opeSelect.addEventListener('change', renderOpeChips);
    renderOpeChips();

    const opeComment = document.createElement('div');
    opeComment.className = 'cp-field cp-full';
    opeComment.innerHTML = '<label for="cp-Commentaire_ligne_OPE">Commentaire ligne OPE</label><textarea id="cp-Commentaire_ligne_OPE" rows="3"></textarea>';
    withHelp(opeComment.querySelector('label'), 'Commentaire_ligne_OPE');
    panels.dates.appendChild(opeComment);

    // Budget
    const finSummary = document.createElement('div');
    finSummary.className = 'cp-fin-summary';
    finSummary.innerHTML = '<span class="cp-fin-summary-label">Prévisionnel 2026–2029</span><span class="cp-fin-summary-value" data-fin-summary>0 €</span>';
    panels.budget.appendChild(finSummary);

    const table = document.createElement('table');
    table.className = 'cp-fin';
    table.innerHTML = '<thead><tr><th>Intitulé</th><th>2026</th><th>2027</th><th>2028</th><th>2029</th><th>Total</th></tr></thead><tbody><tr data-detail="Details_depense_s_Fonctionnement"><th><input value="Depenses de fonctionnement"></th><td></td><td></td><td></td><td></td><td class="cp-row-total" data-row-total="Details_depense_s_Fonctionnement">0</td></tr><tr data-detail="Details_depense_s_Investissement"><th><input value="Dépenses d&#39;investissement"></th><td></td><td></td><td></td><td></td><td class="cp-row-total" data-row-total="Details_depense_s_Investissement">0</td></tr><tr data-detail="Details_depense_s_Personnel"><th><input value="Depenses de personnel"></th><td></td><td></td><td></td><td></td><td class="cp-row-total" data-row-total="Details_depense_s_Personnel">0</td></tr></tbody><tfoot><tr><th>TOTAL</th><td data-total="2026">0</td><td data-total="2027">0</td><td data-total="2028">0</td><td data-total="2029">0</td><td data-grand-total>0</td></tr></tfoot>';
    Object.entries(FIN).forEach(([year, fs]) => table.querySelectorAll('tbody tr').forEach((tr, i) => {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.inputMode = 'decimal';
      inp.autocomplete = 'off';
      inp.value = '0';
      inp.dataset.fin = fs[i];
      tr.children[Number(year) - 2025].appendChild(inp);
      inp.oninput = () => { sanitizeNumericInput(inp); updateFinancialTotals(table); syncConventionAmounts(m); };
    }));
    panels.budget.appendChild(table);

    // Conventions
    const conventionField = document.createElement('div');
    conventionField.className = 'cp-field cp-full';
    conventionField.innerHTML = '<label class="cp-switch-row"><span class="cp-switch"><input id="cp-Convention_de_reversement" type="checkbox"><span class="cp-switch-track"></span></span><span class="cp-switch-text"><span class="cp-switch-title">Convention de reversement</span><span class="cp-switch-hint">Active le partage du montant attribué avec un ou plusieurs partenaires.</span></span></label>';
    // Le libellé entier est le <label> cliquable de l'interrupteur (cp-switch-row) :
    // withHelp() insérerait l'icône après tout le bloc, loin du texte. On la pose
    // ici juste après le titre, à l'intérieur de cp-switch-text.
    withHelp(conventionField.querySelector('.cp-switch-title'), 'Convention_de_reversement');
    panels.conventions.appendChild(conventionField);

    const partnersWrap = document.createElement('div');
    partnersWrap.className = 'cp-field cp-full';
    panels.conventions.appendChild(partnersWrap);
    refs.Partenaire_s_convention_reversement = multiRefField(
      partnersWrap, 'Partenaire_s_convention_reversement', 'Etablissements',
      { label: 'Partenaire(s) de convention de reversement', fields: ['acronyme', 'Acronyme'] }
    );

    const p1Wrap = document.createElement('div');
    p1Wrap.className = 'cp-field';
    p1Wrap.innerHTML = '<label for="cp-Convention_montant_partenaire_1">Montant partenaire 1</label><input id="cp-Convention_montant_partenaire_1" type="number" min="0" step="any">';
    withHelp(p1Wrap.querySelector('label'), 'Convention_montant_partenaire_1');
    panels.conventions.appendChild(p1Wrap);
    const p2Wrap = document.createElement('div');
    p2Wrap.className = 'cp-field';
    p2Wrap.innerHTML = '<label for="cp-Convention_montant_partenaire_2">Montant partenaire 2</label><input id="cp-Convention_montant_partenaire_2" type="number" min="0" step="any">';
    withHelp(p2Wrap.querySelector('label'), 'Convention_montant_partenaire_2');
    panels.conventions.appendChild(p2Wrap);
    const p1 = p1Wrap.querySelector('input'), p2 = p2Wrap.querySelector('input');
    p1.oninput = () => { m._conventionPartner1Manual = true; syncConventionAmounts(m); };
    p2.oninput = () => { m._conventionPartner2Manual = true; syncConventionAmounts(m); };

    // Onglets + indicateur d'étape (points, cf. maquette).
    const tabButtons = {};
    m.querySelectorAll('.cp-tab').forEach(btn => {
      tabButtons[btn.dataset.cpTab] = btn;
      btn.onclick = () => setActiveTab(btn.dataset.cpTab);
    });
    const stepsEl = m.querySelector('#cp-project-steps');
    const dots = TABS.map(() => {
      const dot = document.createElement('span');
      dot.className = 'cp-dot';
      stepsEl.appendChild(dot);
      return dot;
    });
    function setActiveTab(key) {
      if (!panels[key]) return;
      const changed = m.dataset.activeTab !== key;
      TABS.forEach((t, i) => {
        panels[t.key].classList.toggle('cp-hidden', t.key !== key);
        tabButtons[t.key].classList.toggle('active', t.key === key);
        dots[i].classList.toggle('active', t.key === key);
      });
      m.dataset.activeTab = key;
      // Rejoue l'animation d'entrée (cf. creation-projet.css) à chaque changement
      // d'onglet : on retire la classe puis on force un reflow (offsetWidth) avant
      // de la remettre, sans quoi une classe déjà présente ne redéclenche pas
      // l'animation CSS.
      if (changed) {
        const panel = panels[key];
        panel.classList.remove('cp-panel-enter');
        void panel.offsetWidth;
        panel.classList.add('cp-panel-enter');
      }
    }
    m._setActiveTab = setActiveTab;
    m._renderStatusDot = renderStatusDot;

    m.querySelector('[data-cp-cancel]').onclick = () => m.classList.add('cp-hidden');
    m.querySelector('[data-cp-close]').onclick = () => m.classList.add('cp-hidden');
    m.querySelector('[data-cp-save]').onclick = () => saveProject(m, refs);
    m._refs = refs;
    return m;
  }

  function updateFinancialTotals(table) {
    Object.entries(FIN).forEach(([year, keys]) => {
      const total = keys.reduce((sum, key) => sum + normaliseBudgetValue(table.querySelector(`[data-fin="${key}"]`)?.value), 0);
      table.querySelector(`[data-total="${year}"]`).textContent = total.toLocaleString("fr-FR");
    });
    table.querySelectorAll('tbody tr[data-detail]').forEach(tr => {
      const total = [...tr.querySelectorAll('[data-fin]')].reduce((sum, input) => sum + normaliseBudgetValue(input.value), 0);
      tr.querySelector('[data-row-total]').textContent = total.toLocaleString("fr-FR");
    });
    const grand = [...table.querySelectorAll('tbody [data-fin]')].reduce((sum, input) => sum + normaliseBudgetValue(input.value), 0);
    table.querySelector('[data-grand-total]').textContent = grand.toLocaleString("fr-FR");
    const summary = table.parentElement?.querySelector('[data-fin-summary]');
    if (summary) summary.textContent = global.CoreUtils.formatCurrency(grand);
  }

  async function addRecord(table, fields) {
    const api = global.CoreGrist?.gristInstance;
    if (!api) throw new Error('API Grist indisponible');
    await api.docApi.applyUserActions([['AddRecord', table, null, fields]]);
  }

  async function updateRecord(table, id, fields) {
    const api = global.CoreGrist?.gristInstance;
    if (!api) throw new Error('API Grist indisponible');
    await api.docApi.applyUserActions([['UpdateRecord', table, Number(id), fields]]);
  }

  function valueOf(record, names) {
    for (const name of names) {
      if (record?.[name] !== undefined && record[name] !== null) return record[name];
    }
    return '';
  }

  // Une colonne Grist Date() est un timestamp Unix en secondes (un nombre), jamais une
  // chaîne ISO — déléguer à CoreUtils.gristDateToInput (même convention que
  // js/core/utils.js) plutôt que de redécouper une chaîne : un ancien découpage naïf ici
  // affichait un champ vide en édition dès qu'une date réelle était enregistrée, les
  // fixtures de test n'ayant jamais couvert ce cas (toujours null) — bug signalé par
  // Antoine le 16/10/2026.
  function dateInputValue(value) {
    return global.CoreUtils.gristDateToInput(value);
  }

  function dateFieldValue(input) {
    if (!input || !input.value) return null;
    return Math.floor(new Date(`${input.value}T00:00:00Z`).getTime() / 1000);
  }

  // Un id de référence Grist vide vaut 0 (jamais null) : sans ce garde-fou, un
  // porteur non renseigné affichait littéralement "0" au lieu de rester vide
  // (la maquette montre un état vide explicite pour ces champs).
  //
  // Ligne_OPE est une ReferenceList côté Grist (valeur ['L'] ou ['L', id]) alors que
  // ce champ n'en propose qu'une seule à la fois côté UI : on déballe le tableau ici
  // pour en tirer le seul id utile, sans changer le comportement des références
  // simples (Programme, Porteur_1, ...) où value n'est jamais un tableau.
  function setRef(ref, value, tableName, displayFields) {
    if (!ref) return;
    const raw = Array.isArray(value) ? value.find(item => item !== 'L' && item != null) : value;
    const id = raw && typeof raw === 'object' ? raw.id : raw;
    const hasId = id != null && id !== '' && Number(id) !== 0;
    const found = hasId ? rows(tableName).find(r => String(r.id) === String(id)) : null;
    ref.input.dataset.id = hasId ? String(id) : '';
    ref.input.value = !hasId ? '' : (raw && typeof raw === 'object'
      ? personLabel(raw)
      : (found ? (tableName === 'Annuaire' ? personLabel(found) : label(found, displayFields || ['Nom', 'name', 'Acronyme', 'Nom_complet', 'Programme'])) : text(raw)));
    ref.refreshAvatar?.();
  }

  // Appelée aussi bien en édition (record renseigné) qu'à l'ouverture en création : dans
  // ce dernier cas record est null et valueOf()/setRef() (via l'enchaînement record?.[...])
  // renvoient alors systématiquement des valeurs vides, ce qui vide la modale au lieu de
  // laisser les champs du dernier projet ouvert (la modale est réutilisée, pas recréée).
  function populateModal(m, refs, record) {
    const set = (id, names) => { const el = m.querySelector('#' + id); if (el) el.value = text(valueOf(record, names)); };
    const setDate = (key) => { const el = m.querySelector('#cp-' + key); if (el) el.value = dateInputValue(valueOf(record, [key])); };

    set('cp-Projet', ['Projet']);
    set('cp-Acronyme', ['Acronyme']);
    set('cp-statut', ['Statut_operationnel_projet', 'Statut opérationnel', 'Statut']);
    m._renderStatusDot();
    set('cp-comment', ['comentaire_general_Suivi_projet', 'commentaire_general_Suivi_projet']);
    set('cp-Periode', ['Periode']);
    set('cp-Ligne_OPE_installe_chez', ['Ligne_OPE_installe_chez']);
    set('cp-Commentaire_ligne_OPE', ['Commentaire_ligne_OPE']);
    ['Date_limite_financement', 'Date_debut_Projet', 'Date_de_fin_Projet'].forEach(setDate);

    setRef(refs.programme, valueOf(record, ['Programme']), 'Programmes', ['Programme']);
    setRef(refs.type, valueOf(record, ['Type_projet']), '__choice__');
    refs.type.render();
    const refTables = { Porteur_1: 'Annuaire', Porteur_2: 'Annuaire', Porteur_3: 'Annuaire', VP_porteur_signataire_notif: 'Annuaire', Accompagnateur: 'Annuaire', Instance_ratachee: 'Suivi_Instance' };
    Object.keys(refTables).forEach(k => setRef(refs[k], valueOf(record, [k]), refTables[k], ['nom_et_Prenom', 'Prenom', 'NOM', 'Nom', 'name', 'Acronyme', 'Nom_complet']));
    setRef(refs.Ligne_OPE, valueOf(record, ['Ligne_OPE']), 'EcritureComptables', ['N_OPE']);
    refs.Action_Ligne_OPE_a_faire.value = text(valueOf(record, ['Action_Ligne_OPE_a_faire']));

    const conventionEnabled = valueOf(record, ['Convention_de_reversement']);
    const conventionCheck = m.querySelector('#cp-Convention_de_reversement');
    if (conventionCheck) conventionCheck.checked = Boolean(conventionEnabled === true || conventionEnabled === 1 || conventionEnabled === 'true');
    refs.Partenaire_s_convention_reversement.wrap._setIds(valueOf(record, ['Partenaire_s_convention_reversement']));

    const total = Number(valueOf(record, ['Montant_attribue_Total'])) || 0,
      savedP1 = valueOf(record, ['Convention_montant_partenaire_1']),
      savedP2 = valueOf(record, ['Convention_montant_partenaire_2']);
    // Un montant enregistré à exactement 0 est le cas par défaut (jamais renseigné) et
    // ne doit pas être traité comme une saisie manuelle, sans quoi le champ reste bloqué
    // à 0 au lieu de reprendre le total du budget à l'ouverture de la fiche.
    const hasP1 = savedP1 !== '' && savedP1 !== null && savedP1 !== undefined && Number(savedP1) !== 0,
      hasP2 = savedP2 !== '' && savedP2 !== null && savedP2 !== undefined && Number(savedP2) !== 0;
    m._conventionPartner1Manual = hasP1;
    m._conventionPartner2Manual = hasP2;
    m.querySelector('#cp-Convention_montant_partenaire_1').value = hasP1 ? text(savedP1) : String(total);
    m.querySelector('#cp-Convention_montant_partenaire_2').value = hasP2 ? text(savedP2) : String(total - (Number(m.querySelector('#cp-Convention_montant_partenaire_1').value) || 0));
    refs.Action_Ligne_OPE_a_faire.dispatchEvent(new Event('change'));

    m.querySelectorAll('[data-fin]').forEach(input => { input.value = normaliseBudgetValue(record?.[input.dataset.fin]); });
    updateFinancialTotals(m.querySelector('.cp-fin'));
  }

  function collectFields(m, refs) {
    const get = id => m.querySelector('#' + id)?.value.trim() || '';
    const fields = {
      Programme: Number(refs.programme.input.dataset.id),
      Projet: get('cp-Projet'),
      Acronyme: get('cp-Acronyme'),
      Type_projet: refs.type.input.value || 'Projet',
      Statut_operationnel_projet: get('cp-statut'),
      comentaire_general_Suivi_projet: get('cp-comment'),
      Porteur_1: Number(refs.Porteur_1.input.dataset.id),
      Porteur_2: Number(refs.Porteur_2.input.dataset.id) || null,
      Porteur_3: Number(refs.Porteur_3.input.dataset.id) || null,
      VP_porteur_signataire_notif: Number(refs.VP_porteur_signataire_notif.input.dataset.id) || null,
      Accompagnateur: Number(refs.Accompagnateur.input.dataset.id) || null,
      Instance_ratachee: Number(refs.Instance_ratachee.input.dataset.id) || null,
      Date_limite_financement: dateFieldValue(refs.Date_limite_financement),
      Date_debut_Projet: dateFieldValue(refs.Date_debut_Projet),
      Date_de_fin_Projet: dateFieldValue(refs.Date_de_fin_Projet),
      // Ligne_OPE est une ReferenceList côté Grist : même format que
      // Partenaire_s_convention_reversement ci-dessous (['L'] vide, ['L', id] renseigné),
      // jamais un id nu qui serait rejeté ou mal réinterprété à la relecture.
      Ligne_OPE: refs.Ligne_OPE.input.dataset.id ? ['L', Number(refs.Ligne_OPE.input.dataset.id)] : ['L'],
      Action_Ligne_OPE_a_faire: refs.Action_Ligne_OPE_a_faire.value,
      Commentaire_ligne_OPE: get('cp-Commentaire_ligne_OPE'),
      Convention_de_reversement: m.querySelector('#cp-Convention_de_reversement').checked,
      Partenaire_s_convention_reversement: ['L', ...refs.Partenaire_s_convention_reversement.ids],
      Convention_montant_partenaire_1: Number(m.querySelector('#cp-Convention_montant_partenaire_1').value) || 0,
      Convention_montant_partenaire_2: Number(m.querySelector('#cp-Convention_montant_partenaire_2').value) || 0
    };
    m.querySelectorAll('[data-fin]').forEach(i => fields[i.dataset.fin] = normaliseBudgetValue(i.value));
    m.querySelectorAll('tbody tr[data-detail]').forEach(tr => fields[tr.dataset.detail] = tr.querySelector('th input').value);
    return fields;
  }

  // Liste des champs obligatoires à la création (demande d'Antoine du 13/10/2026) — pas
  // à l'édition, pour ne jamais bloquer l'enregistrement d'une fiche déjà existante et
  // incomplète (beaucoup de projets réels n'ont pas encore ces champs renseignés).
  // L'ordre suit celui des onglets (TABS) : en cas de plusieurs champs manquants,
  // saveProject() bascule sur le premier onglet concerné en partant de la gauche.
  function validateRequiredFields(m, refs) {
    const get = id => m.querySelector('#' + id)?.value.trim() || '';
    const hasId = ref => !!(ref && ref.input && ref.input.dataset.id);
    const budgetTotal = () => [...m.querySelectorAll('[data-fin]')].reduce((sum, i) => sum + normaliseBudgetValue(i.value), 0);

    const checks = [
      { tab: 'general', label: 'Programme', ok: hasId(refs.programme) },
      { tab: 'general', label: 'Projet', ok: !!get('cp-Projet') },
      { tab: 'general', label: 'Acronyme', ok: !!get('cp-Acronyme') },
      { tab: 'general', label: 'Type de projet', ok: !!refs.type.input.value },
      { tab: 'porteurs', label: 'Porteur 1', ok: hasId(refs.Porteur_1) },
      { tab: 'porteurs', label: 'VP porteur', ok: hasId(refs.VP_porteur_signataire_notif) },
      { tab: 'porteurs', label: 'Accompagnateur', ok: hasId(refs.Accompagnateur) },
      { tab: 'dates', label: 'Instance rattachée', ok: hasId(refs.Instance_ratachee) },
      { tab: 'dates', label: 'Date limite de financement', ok: !!refs.Date_limite_financement.value },
      { tab: 'dates', label: 'Action ligne OPE', ok: !!refs.Action_Ligne_OPE_a_faire.value },
      { tab: 'budget', label: 'Budget (le total ne peut pas être à 0)', ok: budgetTotal() !== 0 }
    ];
    // Partenaire(s) et montant de convention ne sont exigés que si "Convention de
    // reversement" est activée — sinon ces champs n'ont pas de sens.
    if (m.querySelector('#cp-Convention_de_reversement').checked) {
      const conventionAmount = (Number(m.querySelector('#cp-Convention_montant_partenaire_1').value) || 0) +
        (Number(m.querySelector('#cp-Convention_montant_partenaire_2').value) || 0);
      checks.push({ tab: 'conventions', label: 'Partenaire(s) de convention', ok: refs.Partenaire_s_convention_reversement.ids.length >= 1 });
      checks.push({ tab: 'conventions', label: 'Montant de convention (ne peut pas être à 0)', ok: conventionAmount !== 0 });
    }
    return checks.filter(c => !c.ok);
  }

  // Édition d'un projet ancien incomplet (demande d'Antoine du 22/10/2026) : contrairement
  // à la création, l'enregistrement n'est jamais bloqué, mais un bandeau orange (non
  // bloquant, distinct du message d'erreur rouge) rappelle ce qu'il manque encore.
  function renderMissingBanner(m, refs) {
    const el = m.querySelector('#cp-project-warning');
    if (!el) return;
    const missing = validateRequiredFields(m, refs);
    el.textContent = missing.length ? `Champs obligatoires manquants : ${missing.map(c => c.label).join(', ')}.` : '';
  }

  async function saveProject(m, refs) {
    const mode = m.dataset.mode || 'create', record = m._projectRecord;
    if (mode === 'create') {
      const missing = validateRequiredFields(m, refs);
      if (missing.length) {
        m.querySelector('#cp-project-error').textContent = `Champs obligatoires manquants : ${missing.map(c => c.label).join(', ')}.`;
        m._setActiveTab(missing[0].tab);
        return;
      }
    } else {
      renderMissingBanner(m, refs);
    }
    try {
      const fields = collectFields(m, refs);
      if (mode === 'edit') await updateRecord('Projets', record.id, fields);
      else await addRecord('Projets', fields);
      m.classList.add('cp-hidden');
      global.dispatchEvent(new CustomEvent('project-created'));
    } catch (e) {
      m.querySelector('#cp-project-error').textContent = (mode === 'edit' ? 'Modification impossible : ' : 'Création impossible : ') + e.message;
    }
  }

  // Insensible aux accents/casse : la fiche Annuaire peut porter "Étienne" ou
  // "Etienne" selon la saisie d'origine côté Grist.
  function normaliseName(v) {
    return text(v).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  }

  // Pré-remplissage VP porteur (création uniquement) : ne renvoie une personne que
  // si elle est identifiée sans ambiguïté (nom+prénom exacts, une seule fiche) —
  // sinon le champ reste vide plutôt que de pousser une mauvaise référence.
  function findDefaultVpPorteur() {
    const matches = rows('Annuaire').filter(r => normaliseName(r.NOM) === 'duguet' && normaliseName(r.Prenom) === 'etienne');
    return matches.length === 1 ? matches[0] : null;
  }

  // Pré-remplissage Instance rattachée (création uniquement) : l'instance la plus
  // proche dans le temps — la prochaine à venir, sinon la plus récente passée.
  // Suivi_Instance.date est un Grist Date() (timestamp Unix en secondes), même
  // convention que js/core/utils.js (gristDateToInput) ; les instances sans date
  // sont ignorées.
  function findNearestInstance() {
    const now = Math.floor(Date.now() / 1000);
    const dated = rows('Suivi_Instance')
      .map(r => ({ row: r, date: Number(r.date) }))
      .filter(x => Number.isFinite(x.date) && x.date !== 0);
    if (!dated.length) return null;
    const upcoming = dated.filter(x => x.date >= now).sort((a, b) => a.date - b.date);
    if (upcoming.length) return upcoming[0].row;
    return dated.sort((a, b) => b.date - a.date)[0].row;
  }

  global.ProjectModal = {
    open(record) {
      const m = createModal();
      m.dataset.mode = record ? 'edit' : 'create';
      m._projectRecord = record || null;
      m.querySelector('.cp-head h2').textContent = record ? 'Modifier le projet' : 'Créer un projet';
      m.querySelector('[data-cp-save]').textContent = record ? 'Enregistrer les modifications' : 'Créer le projet';
      m.querySelector('#cp-project-error').textContent = '';
      m.querySelector('#cp-project-warning').textContent = '';
      populateModal(m, m._refs, record);
      if (!record) {
        m.querySelector('#cp-statut').value = 'En attente des dispo des fonds';
        m._renderStatusDot();
        m._refs.type.input.value = 'Projet';
        m._refs.type.render();
        m.querySelector('#cp-Convention_montant_partenaire_1').value = String(conventionTotal(m));
        syncConventionAmounts(m, true);
        const vp = findDefaultVpPorteur();
        if (vp) setRef(m._refs.VP_porteur_signataire_notif, vp.id, 'Annuaire', ['nom_et_Prenom', 'Prenom', 'NOM']);
        const instance = findNearestInstance();
        if (instance) setRef(m._refs.Instance_ratachee, instance.id, 'Suivi_Instance', ['Nom', 'name']);
      } else {
        renderMissingBanner(m, m._refs);
      }
      m.classList.remove('cp-hidden');
      m._setActiveTab('general');
      m._refs.Periode.oninput = () => {};
      return m;
    }
  };
}(window));
