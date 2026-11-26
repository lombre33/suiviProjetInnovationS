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
  // Les colonnes des OPE 2 à 4 (Ligne_OPE_2…) n'ont pas de description propre à lire : celle de la colonne de l'OPE 1 leur sert.
  const withHelp = (labelEl, colId) => global.HelpTooltip?.attach(labelEl, 'Projets', global.CoreOpes.baseColumn(colId));
  const label = (r, fields) => fields.map(k => r?.[k]).find(v => v != null && v !== '') || '';
  const personLabel = r => label(r, ['nom_et_Prenom', 'Prenom', 'NOM']);
  // Numéro de la ligne OPE ; « N° à venir · structure » tant qu'elle n'en a pas (cf. CoreUtils.opeLabel).
  const opeLabel = r => global.CoreUtils.opeLabel(r);
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
    { key: 'dates', label: 'Instance et dates' },
    { key: 'budget', label: 'Budget et OPE' },
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

  const ICON_CHEVRON = '<svg class="cp-ope-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>';
  const ICON_TRASH = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6M14 11v6"></path></svg>';
  // Intitulés par défaut des trois lignes de l'OPE 1 (colonnes Details_depense_s_*, modifiables) : jamais écrits pour les OPE 2 à 4.
  const DEFAULT_DETAIL_LABELS = { F: 'Depenses de fonctionnement', I: 'Dépenses d\'investissement', P: 'Depenses de personnel' };
  const eur = value => global.CoreUtils.formatCurrency(value);
  const fmtNumber = value => Number(value).toLocaleString('fr-FR');

  const OPE_OPTIONS = [
    { value: '', label: 'Aucune' },
    { value: 'Creation de ligne', label: 'Création de ligne' },
    { value: 'Prolongation de ligne', label: 'Prolongation' },
    { value: 're-Abondement de ligne', label: 'Ré-abondement' },
    { value: 'à determiner', label: 'À déterminer' }
  ];

  // Structure du porteur 1 de la modale qui contient `fromInput` (Annuaire.Poste2 → Postes2.Structure2), id de Structures ou 0 :
  // proposée comme lieu d'installation d'une ligne OPE créée sans numéro (demande d'Antoine du 24/11/2026).
  function porteur1StructureId(fromInput) {
    const refId = value => {
      const raw = Array.isArray(value) ? value.find(item => item !== 'L') : (value && typeof value === 'object' ? value.id : value);
      const id = Number(raw);
      return Number.isFinite(id) && id > 0 ? id : 0;
    };
    const porteurId = refId(fromInput.closest('#cp-project-modal')?.querySelector('input[data-ref="Porteur_1"]')?.dataset.id);
    const person = porteurId ? rows('Annuaire').find(r => Number(r.id) === porteurId) : null;
    const poste = person ? rows('Postes2').find(r => Number(r.id) === refId(person.Poste2)) : null;
    const structureId = poste ? refId(poste.Structure2) : 0;
    return structureId && rows('Structures').some(r => Number(r.id) === structureId) ? structureId : 0;
  }

  const opeActionLabel = value => (OPE_OPTIONS.find(o => o.value === value) || { label: text(value) }).label;

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
    // caractère par caractère. _cpRefSync est appelé à chaque sélection/suppression
    // "commise" (clic sur une suggestion, croix de suppression, et par les modales de
    // création à la volée comme personne/ligne OPE une fois la nouvelle valeur poussée
    // dans input.value/dataset.id) — jamais pendant la simple frappe de recherche. Par
    // défaut il ne fait que rafraîchir la bulle, mais project-modal.js le surcharge pour
    // le champ Ligne_OPE afin de recalculer aussi "Installée chez (rapporté)".
    // Valeur retenue mais illisible pour cet utilisateur (cf. setRef) : pas d'initiales, et le drapeau tombe dès que la valeur change.
    const paintAvatar = () => {
      const idNum = Number(input.dataset.id);
      const hasValue = Number.isFinite(idNum) && idNum > 0;
      wrap.classList.toggle('cp-ref-has-value', hasValue);
      if (avatar) avatar.textContent = hasValue && !input.dataset.unreadable ? initials(input.value) : '';
    };
    const refreshAvatar = () => {
      if (input.dataset.unreadable) { delete input.dataset.unreadable; input.removeAttribute('title'); }
      paintAvatar();
    };
    input._cpRefSync = refreshAvatar;

    const render = (clearSelection = true) => {
      if (clearSelection) { input.dataset.id = ''; refreshAvatar(); }
      // Sélection conservée mais illisible (« Ligne OPE (id 17) non lisible ») : ce texte ne cherche rien, on propose toute la liste
      // (et surtout pas « + Créer … » avec ce libellé).
      const q = !clearSelection && input.dataset.unreadable ? '' : input.value.trim().toLowerCase();
      const matches = all().filter(r => displayValue(r).toLowerCase().includes(q)).slice(0, 30);
      list.innerHTML = matches.map(r => `<button type="button" data-id="${esc(r.id)}">${esc(displayValue(r))}</button>`).join('');
      if (!matches.length && q) {
        if (table === 'Annuaire' && typeof window.openCreatePersonModal === 'function') {
          list.innerHTML = `<button type="button" data-create-person="${esc(input.value.trim())}">+ Créer "${esc(input.value.trim())}"</button>`;
        } else if (table === 'Lignes_OPE' && typeof window.openCreateOpeModal === 'function') {
          list.innerHTML = `<button type="button" data-create-ope="${esc(input.value.trim())}">+ Créer la ligne OPE "${esc(input.value.trim())}"</button>`;
        }
      }
      // Ligne OPE sans numéro (Antoine, 12/11/2026) : même modale OPE, numéro laissé vide, on indique seulement où elle sera ouverte.
      // En tête de la liste (demande du 24/11/2026), pour la trouver sans la faire défiler ; Entrée ne la choisit jamais sans flèche.
      if (table === 'Lignes_OPE' && typeof window.openCreateOpeModal === 'function') {
        list.insertAdjacentHTML('afterbegin', '<button type="button" data-create-ope-tbd>+ Ligne OPE sans numéro (où elle sera ouverte)</button>');
      }
      list.classList.toggle('cp-hidden', !list.innerHTML);
      list.querySelectorAll('button').forEach(b => b.onclick = () => {
        if (b.dataset.createOpeTbd !== undefined) {
          window.openCreateOpeModal('', input, { installeChez: porteur1StructureId(input) });
          return;
        }
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
        input._cpRefSync();
        list.classList.add('cp-hidden');
      });
    };

    input.oninput = () => { input.dataset.id = ''; refreshAvatar(); render(); };
    input.onfocus = () => render(false);
    input.onclick = event => {
      // Ligne OPE déjà choisie : même modale OPE que sur la page Installation des fonds (numéro, installée chez), sans doublon.
      if (table === 'Lignes_OPE' && input.value.trim() && input.dataset.id && typeof window.openEditOpeModal === 'function') {
        const ligne = all().find(r => String(r.id) === String(input.dataset.id));
        if (ligne) {
          event.preventDefault();
          event.stopPropagation();
          list.classList.add('cp-hidden');
          window.openEditOpeModal(ligne.id, saved => {
            input.value = displayValue(saved);
            input._cpRefSync();
          });
          return;
        }
      }
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
      input._cpRefSync();
      render();
      input.focus();
    };
    global.CoreUtils.wireRefListKeyNav(input, list);
    withHelp(wrap.querySelector('label'), key);
    parent.appendChild(wrap);
    return { wrap, input, refreshAvatar, paintAvatar };
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
    global.CoreUtils.wireRefListKeyNav(input, list);
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
  // Plusieurs OPE par projet (24/11/2026) : la somme porte sur les montants de toutes les OPE.
  function conventionTotal(m) {
    const inputs = [...m.querySelectorAll('.cp-ope [data-fin]')];
    if (inputs.length) return inputs.reduce((sum, input) => sum + normaliseBudgetValue(input.value), 0);
    return Number(valueOf(m._projectRecord, ['Montant_attribue_Total'])) || 0;
  }

  // Demande d'Antoine du 02/11/2026 : le montant reversé via une convention doit être
  // intégralement couvert par le budget de Fonctionnement (M10), jamais l'Investissement
  // (M20) ni le Personnel (M30) — on isole donc ici le total de la seule ligne
  // "Fonctionnement" du tableau budgétaire, à comparer au montant de la convention.
  // Plusieurs OPE par projet : le Fonctionnement de TOUTES les OPE compte ensemble.
  function fonctionnementTotal(m) {
    return [...m.querySelectorAll('.cp-ope [data-fin][data-nature="F"]')].reduce((sum, input) => sum + normaliseBudgetValue(input.value), 0);
  }

  // Montant total de la convention de reversement (somme des deux partenaires),
  // partagé par le garde-fou Fonctionnement ci-dessous et par le rappel 70/30.
  function conventionAmount(m) {
    return (Number(m.querySelector('#cp-Convention_montant_partenaire_1').value) || 0) +
      (Number(m.querySelector('#cp-Convention_montant_partenaire_2').value) || 0);
  }

  // Bloque l'enregistrement (création ET édition, cf. saveProject()) tant que le
  // Fonctionnement ne couvre pas l'intégralité du montant reversé.
  function conventionFonctionnementIssue(m) {
    if (!m.querySelector('#cp-Convention_de_reversement').checked) return null;
    const amount = conventionAmount(m);
    const fonctionnement = fonctionnementTotal(m);
    if (amount > fonctionnement) {
      const scope = m.querySelectorAll('.cp-ope').length > 1 ? ' de toutes les OPE réunies' : '';
      return `Le budget de Fonctionnement${scope} (${global.CoreUtils.formatCurrency(fonctionnement)}) doit couvrir l'intégralité du montant de la convention de reversement (${global.CoreUtils.formatCurrency(amount)}).`;
    }
    return null;
  }

  // Demande d'Antoine du 03/11/2026 : seuil au-delà duquel le versement d'une
  // convention de reversement se fait en deux fois (70 % puis 30 %) plutôt qu'en
  // une fois — simple rappel non bloquant, à la différence du garde-fou Fonctionnement
  // ci-dessus qui bloque l'enregistrement.
  const CONVENTION_SEUIL_7030 = 20000;

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
    // Les dates sont des champs texte jj/mm/aaaa (DateInput) : le champ natif suivait la langue du navigateur (mm/jj/aaaa).
    const control = type === 'date' ? global.DateInput.markup({ id }) : `<input id="${id}" type="${type}">`;
    w.innerHTML = `<label for="${id}">${esc(labelText)}${required ? ' *' : ''}</label>${control}`;
    withHelp(w.querySelector('label'), id.replace(/^cp-/, ''));
    parent.appendChild(w);
    return w.querySelector('input');
  }

  // Co-financements (demande d'Antoine du 17/11/2026) : volet replié de l'onglet Budget et OPE pour les projets (co)financés
  // par Idex ou par une recette RNA Premat-mat, avec un commentaire libre. Colonnes ajoutées à la main dans Grist, dont le
  // type n'est pas imposé : le champ s'adapte à la colonne (case Oui/Non, montant, liste de choix ou texte) lue dans les
  // métadonnées (CoreGrist.columnTypes), ou à défaut aux valeurs déjà présentes ; une colonne absente n'est jamais écrite
  // (Grist refuserait tout l'enregistrement), une colonne calculée ou d'un type non géré reste en lecture seule.
  // `fallback` : widget d'une colonne dont le type n'est pas fixé (colonne « vide » d'un Grist neuf, type Any, sans valeur).
  const COFIN_FIELDS = [
    { col: 'Part_Idex', label: 'Part Idex', short: 'Idex', fallback: 'bool' },
    { col: 'Part_recette_RNA_PREMAT_MAT', label: 'Part recette RNA Premat-mat', short: 'Recette RNA Premat-mat', fallback: 'bool' },
    { col: 'Commentaire_budget', label: 'Commentaire budget', short: 'commentaire', fallback: 'text', multiline: true }
  ];
  const COFIN_KIND_BY_TYPE = { Bool: 'bool', Numeric: 'number', Int: 'number', Text: 'text', Choice: 'choice' };

  // Première valeur renseignée de la colonne parmi les projets : sert à deviner son type quand les métadonnées manquent.
  function firstFilledValue(col) {
    const found = rows('Projets').find(r => r && r[col] !== undefined && r[col] !== null && r[col] !== '');
    return found ? found[col] : undefined;
  }

  // {exists, kind, settled, type} : `settled` vaut false quand le type de la colonne n'est pas fixé (rien n'est alors
  // écrit tant que le champ n'a pas été touché, pour ne pas figer le type d'une colonne encore vide).
  function cofinColumn(def) {
    const col = def.col;
    const known = global.CoreGrist?.knownColumns?.('Projets');
    const first = rows('Projets')[0];
    if (!(known && known.has(col)) && !(first && Object.prototype.hasOwnProperty.call(first, col))) return { exists: false, kind: 'missing' };
    if (global.CoreGrist?.isFormulaColumn?.('Projets', col)) return { exists: true, kind: 'formula' };
    const type = global.CoreGrist?.columnTypes?.('Projets')?.[col];
    if (COFIN_KIND_BY_TYPE[type]) return { exists: true, kind: COFIN_KIND_BY_TYPE[type], settled: true, type };
    if (type && type !== 'Any') return { exists: true, kind: 'unsupported', type };
    const sample = firstFilledValue(col);
    if (typeof sample === 'boolean') return { exists: true, kind: 'bool', settled: true, type };
    if (typeof sample === 'number') return { exists: true, kind: 'number', settled: true, type };
    if (typeof sample === 'string') return { exists: true, kind: 'text', settled: true, type };
    return { exists: true, kind: def.fallback, settled: false, type };
  }

  function buildCofinancing(panel) {
    const details = document.createElement('details');
    details.className = 'cp-cofin';
    details.dataset.cpCofin = '';
    details.innerHTML = '<summary><span class="cp-cofin-title">Co-financements</span><span class="cp-cofin-sum" data-cp-cofin-sum></span></summary><div class="cp-cofin-body cp-grid"></div>';
    panel.appendChild(details);
    const body = details.querySelector('.cp-cofin-body');
    const sum = details.querySelector('[data-cp-cofin-sum]');
    const fields = COFIN_FIELDS.map(def => {
      const wrap = document.createElement('div');
      wrap.className = 'cp-field' + (def.multiline ? ' cp-full' : '');
      wrap.dataset.cofin = def.col;
      wrap.innerHTML = `<label for="cp-${def.col}">${esc(def.label)}</label><div class="cp-cofin-control"></div>`;
      withHelp(wrap.querySelector('label'), def.col);
      body.appendChild(wrap);
      return { def, wrap, control: wrap.querySelector('.cp-cofin-control'), info: null, read: null, active: null, dirty: false, guard: false };
    });

    // Une ligne de résumé reste visible volet replié : on voit d'un coup d'œil qu'un projet est co-financé.
    const refreshSummary = () => {
      const parts = fields.map(f => f.active && f.active()).filter(Boolean);
      sum.textContent = parts.join(' · ');
    };

    function renderField(f, record) {
      const { def } = f;
      const id = `cp-${def.col}`;
      const raw = record ? record[def.col] : undefined;
      const info = f.info = cofinColumn(def);
      f.read = null;
      f.active = null;
      f.dirty = false;
      // Valeur déjà enregistrée que le champ ne sait pas afficher (texte dans une colonne numérique…) : laissée telle quelle tant qu'on n'y touche pas.
      f.guard = false;
      const touched = () => { f.dirty = true; refreshSummary(); };
      const note = message => `<p class="cp-cofin-note">${esc(message)}</p>`;
      f.wrap.classList.toggle('cp-cofin-off', !info.exists);
      if (info.kind === 'missing') {
        f.control.innerHTML = note(`Colonne « ${def.col} » absente de la table Projets : rien n'est enregistré.`);
        return;
      }
      if (info.kind === 'formula' || info.kind === 'unsupported') {
        const readonly = document.createElement(def.multiline ? 'textarea' : 'input');
        readonly.id = id;
        readonly.readOnly = true;
        readonly.className = 'cp-readonly';
        readonly.setAttribute('aria-readonly', 'true');
        readonly.value = Array.isArray(raw) ? '' : text(raw);
        f.control.innerHTML = '';
        f.control.appendChild(readonly);
        f.control.insertAdjacentHTML('beforeend', note(info.kind === 'formula' ? 'Colonne calculée (formule) : lecture seule.' : `Type « ${info.type} » non géré : lecture seule.`));
        return;
      }
      if (info.kind === 'bool') {
        f.control.innerHTML = `<label class="cp-switch-row cp-cofin-switch"><span class="cp-switch"><input id="${id}" type="checkbox"><span class="cp-switch-track"></span></span><span class="cp-cofin-state"></span></label>`;
        const box = f.control.querySelector('input'), state = f.control.querySelector('.cp-cofin-state');
        const paint = () => { state.textContent = box.checked ? 'Oui' : 'Non'; };
        box.checked = raw === true || raw === 1 || raw === 'true';
        f.guard = raw !== undefined && raw !== null && raw !== '' && ![true, false, 0, 1, 'true', 'false'].includes(raw);
        paint();
        box.addEventListener('change', () => { paint(); touched(); });
        f.read = () => box.checked;
        f.active = () => box.checked ? def.short : '';
        return;
      }
      let control;
      if (info.kind === 'choice') {
        control = document.createElement('select');
        const current = text(raw);
        const choices = global.CoreGrist?.columnChoices?.('Projets', def.col) || [];
        // Valeur déjà enregistrée hors liste : conservée comme option, sinon la liste se vide et l'enregistrement l'effacerait.
        const options = [''].concat(choices, current && !choices.includes(current) ? [current] : []);
        control.innerHTML = options.map(v => `<option value="${esc(v)}">${esc(v || 'Aucune')}</option>`).join('');
        control.value = current;
        control.addEventListener('change', touched);
        f.read = () => control.value;
        f.active = () => control.value ? `${def.short} : ${control.value}` : '';
      } else if (info.kind === 'number') {
        control = document.createElement('input');
        control.type = 'text';
        control.inputMode = 'decimal';
        control.autocomplete = 'off';
        control.placeholder = '0';
        const blank = raw === null || raw === undefined || raw === '';
        f.guard = !blank && !Number.isFinite(Number(raw));
        control.value = blank || f.guard ? '' : String(raw);
        control.addEventListener('input', () => { sanitizeNumericInput(control); touched(); });
        f.read = () => normaliseBudgetValue(control.value);
        f.active = () => normaliseBudgetValue(control.value) ? `${def.short} ${global.CoreUtils.formatCurrency(normaliseBudgetValue(control.value))}` : '';
      } else {
        control = document.createElement(def.multiline ? 'textarea' : 'input');
        if (def.multiline) control.rows = 2; else control.type = 'text';
        control.value = Array.isArray(raw) ? '' : text(raw);
        control.addEventListener('input', touched);
        f.read = () => control.value.trim();
        f.active = () => control.value.trim() ? (def.multiline ? def.short : `${def.short} : ${control.value.trim()}`) : '';
      }
      control.id = id;
      f.control.innerHTML = '';
      f.control.appendChild(control);
    }

    return {
      details,
      fields,
      // À chaque ouverture de la modale (réutilisée d'un projet à l'autre) : champs reconstruits d'après la colonne, volet replié.
      render(record) {
        details.open = false;
        fields.forEach(f => renderField(f, record));
        details.classList.toggle('cp-hidden', fields.every(f => f.info.kind === 'missing'));
        refreshSummary();
      },
      // Colonnes à écrire : jamais celles d'une colonne absente, calculée ou non gérée ; une colonne au type non fixé
      // (ou une valeur que le champ ne sait pas afficher) seulement une fois le champ modifié.
      collect() {
        const out = {};
        fields.forEach(f => { if (f.read && ((f.info.settled && !f.guard) || f.dirty)) out[f.def.col] = f.read(); });
        return out;
      }
    };
  }

  function createModal() {
    if (document.getElementById('cp-project-modal')) return document.getElementById('cp-project-modal');
    const m = document.createElement('div');
    m.id = 'cp-project-modal';
    m.className = 'cp-modal cp-hidden';
    m.innerHTML = `<div class="cp-box" role="dialog" aria-modal="true">` +
      `<div class="cp-head"><h2></h2><button type="button" data-cp-close aria-label="Fermer">×</button></div>` +
      `<div class="cp-tabbar" role="tablist">${TABS.map(t => `<button type="button" class="cp-tab" data-cp-tab="${t.key}" role="tab">${esc(t.label)}${t.key === 'budget' ? '<span class="cp-tab-count" hidden></span>' : ''}</button>`).join('')}</div>` +
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

    // Documents (pièces jointes Grist), demande d'Antoine du 03/11/2026 : si elles
    // existent, un moyen de visualiser/télécharger la notification signée et la
    // convention de reversement. Lecture seule — ces deux colonnes Attachments ne
    // sont jamais écrites par cette modale, donc hors collectFields()/MODAL_FIELDS.
    function attachmentsField(labelText, colId) {
      const w = document.createElement('div');
      w.className = 'cp-field cp-full';
      w.innerHTML = `<label>${esc(labelText)}</label><div class="cp-attachments" data-cp-attachments="${esc(colId)}"></div>`;
      withHelp(w.querySelector('label'), colId);
      panels.general.appendChild(w);
      return w.querySelector('.cp-attachments');
    }
    refs._attachmentsEls = {
      Notifications_Signees: attachmentsField('Notification signée', 'Notifications_Signees'),
      Convention_de_reversement_le_cas_echeant: attachmentsField('Convention de reversement (pièce jointe)', 'Convention_de_reversement_le_cas_echeant')
    };

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

    // Instance et dates
    refs.Instance_ratachee = refField(panels.dates, 'Instance_ratachee', 'Suivi_Instance', { label: 'Instance rattachée', fields: ['Nom', 'name'] }, true);
    refs.Date_limite_financement = field(panels.dates, 'Date limite de financement', 'cp-Date_limite_financement', 'date', true);
    refs.Date_debut_Projet = field(panels.dates, 'Date de début du projet', 'cp-Date_debut_Projet', 'date');
    refs.Date_de_fin_Projet = field(panels.dates, 'Date de fin du projet', 'cp-Date_de_fin_Projet', 'date');
    refs.Periode = field(panels.dates, 'Période (calculée)', 'cp-Periode', 'text');
    refs.Periode.parentElement.classList.add('cp-full');
    refs.Periode.readOnly = true;
    refs.Periode.classList.add('cp-readonly');
    refs.Periode.setAttribute('aria-readonly', 'true');

    // Budget et OPE (demande d'Antoine du 24/11/2026) : un projet a de une à quatre OPE, une carte repliable chacune (ligne OPE,
    // installée chez, action, commentaire, répartition 2026-2029). Seule l'OPE 1 existe à la création de la modale : les suivantes
    // sont créées à la demande (« + Ajouter ») ou à l'ouverture d'un projet qui en a déjà (cf. populateModal). Les colonnes de
    // l'OPE 1 sont les colonnes historiques ; celles des OPE 2 à 4 portent le suffixe _2/_3/_4 (js/core/project-opes.js).
    refs._opes = [];
    const finSummary = document.createElement('div');
    finSummary.className = 'cp-fin-summary';
    finSummary.innerHTML = '<span class="cp-fin-summary-label">Prévisionnel 2026–2029<span class="cp-fin-summary-count" data-ope-count></span></span><span class="cp-fin-summary-value" data-fin-summary>0 €</span>';
    panels.budget.appendChild(finSummary);

    const opesWrap = document.createElement('div');
    opesWrap.className = 'cp-opes';
    panels.budget.appendChild(opesWrap);
    const addZone = document.createElement('div');
    addZone.className = 'cp-ope-add-zone';
    panels.budget.appendChild(addZone);

    // « Installée chez » est un champ rapporté en lecture seule : côté Grist c'est la
    // formule Ligne_OPE_installe_chez (ReferenceList, recalculée seulement après
    // enregistrement) — on ne peut pas s'y fier tant qu'on modifie la ligne OPE dans la
    // modale (jamais à jour avant sauvegarde, d'où le brut "L,43" affiché avant ce
    // correctif). On le recalcule donc nous-mêmes depuis la ligne OPE réellement
    // sélectionnée (CoreState), à chaque fois que cette sélection change (clic sur une
    // suggestion, croix de suppression, ou création d'une nouvelle ligne OPE à la volée).
    function refreshInstalleChez(card) {
      const ligneId = card.ref.input.dataset.id;
      const ligne = ligneId ? rows('Lignes_OPE').find(r => String(r.id) === String(ligneId)) : null;
      const structure = ligne?.installe_chez ? rows('Structures').find(r => String(r.id) === String(ligne.installe_chez)) : null;
      card.installe.value = structure ? label(structure, ['Acronyme', 'Nom_Complet']) : '';
    }

    function buildOpeCard(rank) {
      const sfx = rank > 1 ? `_${rank}` : '';
      const card = { rank, open: true };
      const el = document.createElement('article');
      el.className = 'cp-ope open';
      el.dataset.opeRank = String(rank);
      el.style.setProperty('--c', `var(--ope-${rank})`);
      const bodyId = `cp-ope-body-${rank}`;
      el.innerHTML =
        `<div class="cp-ope-top"><button type="button" class="cp-ope-head" aria-expanded="true" aria-controls="${bodyId}">` +
        `<span class="cp-ope-badge"><i></i>OPE ${rank}</span><span class="cp-ope-name is-empty" data-ope-name>Ligne OPE à choisir</span><span class="cp-ope-act" data-ope-act></span><span class="cp-ope-sum" data-ope-sum>0 €</span>${ICON_CHEVRON}</button>` +
        (rank > 1 ? `<button type="button" class="cp-ope-del" aria-label="Retirer l’OPE ${rank}" title="Retirer l’OPE ${rank}">${ICON_TRASH}</button>` : '') +
        '</div>' +
        (rank > 1 ? `<div class="cp-ope-confirm" role="alert" hidden><span>Retirer l’OPE ${rank} et ses montants ?</span><button type="button" data-ope-confirm-go>Retirer</button><button type="button" data-ope-confirm-keep>Garder</button></div>` : '') +
        `<div class="cp-ope-body" id="${bodyId}"></div>`;
      const body = el.querySelector('.cp-ope-body');
      const grid = document.createElement('div');
      grid.className = 'cp-grid';
      body.appendChild(grid);

      // Ligne OPE + Installée chez (rapporté)
      card.ref = refField(grid, 'Ligne_OPE' + sfx, 'Lignes_OPE', { label: 'Ligne OPE', fields: ['N_OPE'], format: opeLabel });
      card.installe = field(grid, 'Installée chez (rapporté)', 'cp-Ligne_OPE_installe_chez' + sfx, 'text');
      card.installe.readOnly = true;
      card.installe.classList.add('cp-readonly');
      card.installe.setAttribute('aria-readonly', 'true');
      const baseRefSync = card.ref.input._cpRefSync;
      card.refresh = () => { refreshInstalleChez(card); refreshOpeHeader(el); };
      card.ref.input._cpRefSync = () => { baseRefSync(); card.refresh(); };

      // Action ligne OPE (puces) : obligatoire pour l'OPE 1 seulement.
      const actionWrap = document.createElement('div');
      actionWrap.className = 'cp-field cp-full';
      actionWrap.innerHTML = `<label for="cp-Action_Ligne_OPE_a_faire${sfx}">Action ligne OPE${rank === 1 ? ' *' : ''}</label><div class="cp-chip-row"></div>`;
      withHelp(actionWrap.querySelector('label'), 'Action_Ligne_OPE_a_faire' + sfx);
      grid.appendChild(actionWrap);
      const select = document.createElement('select');
      select.id = 'cp-Action_Ligne_OPE_a_faire' + sfx;
      select.className = 'cp-visually-hidden';
      select.innerHTML = OPE_OPTIONS.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
      actionWrap.appendChild(select);
      card.select = select;
      const chipsRow = actionWrap.querySelector('.cp-chip-row');
      // Valeur de Grist hors OPE_OPTIONS (ex. « ligne validée ») : conservée comme option et puce
      // supplémentaires, sinon le <select> se vide à l'ouverture et l'enregistrement effacerait l'action.
      let extraValue = '';
      card.setAction = value => {
        value = text(value);
        select.querySelectorAll('option[data-cp-extra]').forEach(o => o.remove());
        extraValue = value.trim() && !OPE_OPTIONS.some(o => o.value === value) ? value : '';
        if (extraValue) {
          const extra = document.createElement('option');
          extra.value = extraValue;
          extra.textContent = extraValue;
          extra.dataset.cpExtra = '1';
          select.appendChild(extra);
        }
        select.value = value;
        renderChips();
        refreshOpeHeader(el);
      };
      const renderChips = () => {
        const chips = OPE_OPTIONS.filter(o => o.value);
        if (extraValue) chips.push({ value: extraValue, label: extraValue });
        chipsRow.innerHTML = chips.map(o => {
          const variant = o.value === 'à determiner' ? ' warn' : '';
          return `<button type="button" class="cp-chip${variant}${o.value === select.value ? ' active' : ''}" data-value="${esc(o.value)}">${esc(o.label)}</button>`;
        }).join('');
        chipsRow.querySelectorAll('button').forEach(b => b.onclick = () => {
          select.value = select.value === b.dataset.value ? '' : b.dataset.value;
          select.dispatchEvent(new Event('change'));
        });
      };
      select.addEventListener('change', () => { renderChips(); refreshOpeHeader(el); });
      renderChips();

      // Commentaire ligne OPE (une ligne, extensible)
      const commentWrap = document.createElement('div');
      commentWrap.className = 'cp-field cp-full';
      commentWrap.innerHTML = `<label for="cp-Commentaire_ligne_OPE${sfx}">Commentaire ligne OPE</label><textarea id="cp-Commentaire_ligne_OPE${sfx}" class="cp-ope-comment" rows="1"></textarea>`;
      withHelp(commentWrap.querySelector('label'), 'Commentaire_ligne_OPE' + sfx);
      grid.appendChild(commentWrap);
      card.comment = commentWrap.querySelector('textarea');

      // Répartition 2026-2029 × Fonctionnement / Investissement / Personnel
      const natures = global.CoreOpes.NATURES, years = global.CoreOpes.YEARS;
      const tableWrap = document.createElement('div');
      tableWrap.className = 'cp-fin-wrap';
      const table = document.createElement('table');
      table.className = 'cp-fin';
      table.innerHTML = `<thead><tr><th>Répartition</th>${years.map(y => `<th>${y}</th>`).join('')}<th>Total</th></tr></thead><tbody>` +
        natures.map(n => {
          const head = rank === 1
            ? `<th><input value="${esc(DEFAULT_DETAIL_LABELS[n.key])}" aria-label="Intitulé ${esc(n.label)}"></th>`
            : `<th scope="row">${esc(n.label)}</th>`;
          return `<tr data-nature="${n.key}"${rank === 1 ? ` data-detail="${n.detail}"` : ''}>${head}${years.map(() => '<td></td>').join('')}<td class="cp-row-total" data-row-total="${n.detail}">0</td></tr>`;
        }).join('') +
        `</tbody><tfoot><tr><th>Total OPE ${rank}</th>${years.map(y => `<td data-total="${y}">0</td>`).join('')}<td data-grand-total>0</td></tr></tfoot>`;
      table.querySelectorAll('tbody tr').forEach((tr, i) => {
        years.forEach((year, yi) => {
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.inputMode = 'decimal';
          inp.autocomplete = 'off';
          inp.value = '0';
          inp.dataset.fin = global.CoreOpes.amountColumn(rank, year, natures[i]);
          inp.dataset.nature = natures[i].key;
          inp.dataset.year = String(year);
          inp.setAttribute('aria-label', `${natures[i].label} ${year}, OPE ${rank}`);
          inp.oninput = () => { sanitizeNumericInput(inp); syncConventionAmounts(m); updateFinancialTotals(table); checkConvention7030(m); };
          tr.children[yi + 1].appendChild(inp);
        });
      });
      tableWrap.appendChild(table);
      body.appendChild(tableWrap);
      card.table = table;

      // Repli / dépli, retrait (OPE 2 à 4)
      const head = el.querySelector('.cp-ope-head');
      card.setOpen = open => {
        card.open = open;
        el.classList.toggle('open', open);
        head.setAttribute('aria-expanded', String(open));
        body.hidden = !open;
      };
      head.onclick = () => card.setOpen(!card.open);
      if (rank > 1) {
        const del = el.querySelector('.cp-ope-del'), confirm = el.querySelector('.cp-ope-confirm');
        del.onclick = () => {
          if (!global.CoreOpes.hasData(readCardState(card))) { removeOpe(rank); return; }
          confirm.hidden = false;
          confirm.querySelector('[data-ope-confirm-keep]').focus();
        };
        confirm.querySelector('[data-ope-confirm-keep]').onclick = () => { confirm.hidden = true; del.focus(); };
        confirm.querySelector('[data-ope-confirm-go]').onclick = () => removeOpe(rank);
      }
      card.el = el;
      return card;
    }

    // Ajoute la carte de l'OPE suivante (au plus quatre). `open` : déployée ou repliée.
    function addOpeCard(open) {
      if (refs._opes.length >= global.CoreOpes.MAX) return null;
      const card = buildOpeCard(refs._opes.length + 1);
      refs._opes.push(card);
      opesWrap.appendChild(card.el);
      card.setOpen(open !== false);
      return card;
    }
    // Retire les cartes des OPE 2 à 4 (OPE 1 reste toujours).
    function clearExtraCards() {
      refs._opes.splice(1).forEach(card => card.el.remove());
    }
    // Ce que dit la carte, sous la forme de CoreOpes.read() (+ le texte affiché de la ligne et l'état déployé).
    function readCardState(card) {
      const id = Number(card.ref.input.dataset.id) || 0;
      const amounts = {};
      global.CoreOpes.NATURES.forEach(n => {
        amounts[n.key] = global.CoreOpes.YEARS.map(year => normaliseBudgetValue(card.el.querySelector(`[data-fin][data-nature="${n.key}"][data-year="${year}"]`)?.value));
      });
      return { rank: card.rank, ligneIds: id ? [id] : [], ligneText: card.ref.input.value, action: card.select.value, comment: card.comment.value, amounts, open: card.open };
    }
    function applyCardState(card, state) {
      card.ref.input.dataset.id = state.ligneIds[0] ? String(state.ligneIds[0]) : '';
      card.ref.input.value = state.ligneText || '';
      card.ref.input._cpRefSync();
      card.setAction(state.action);
      card.comment.value = state.comment;
      global.CoreOpes.NATURES.forEach(n => global.CoreOpes.YEARS.forEach((year, yi) => {
        const input = card.el.querySelector(`[data-fin][data-nature="${n.key}"][data-year="${year}"]`);
        if (input) input.value = String(state.amounts[n.key][yi]);
      }));
      card.setOpen(state.open !== false);
    }
    // Retirer l'OPE `rank` : les suivantes remontent d'un rang (leurs colonnes sont réécrites à l'enregistrement, la dernière est vidée).
    function removeOpe(rank) {
      const kept = refs._opes.slice(1).map(readCardState).filter(state => state.rank !== rank);
      clearExtraCards();
      kept.forEach(state => applyCardState(addOpeCard(true), state)); // chaque carte garde l'état (déployée ou repliée) que l'utilisateur lui avait donné
      refreshOpeUi();
      const add = addZone.querySelector('[data-ope-add]');
      if (add) add.focus();
    }
    function addOpe() {
      if (refs._opes.length >= global.CoreOpes.MAX) return;
      // Les cartes déjà là restent comme l'utilisateur les a laissées : rien ne se replie tout seul (demande d'Antoine du 24/11/2026).
      const card = addOpeCard(true);
      card.setAction(global.CoreOpes.DEFAULT_ACTION);
      refreshOpeUi();
      if (card.el.scrollIntoView) card.el.scrollIntoView({ block: 'nearest' });
      card.ref.input.focus({ preventScroll: true });
    }
    function refreshAddZone() {
      const n = refs._opes.length;
      addZone.textContent = '';
      if (n >= global.CoreOpes.MAX) {
        const full = document.createElement('p');
        full.className = 'cp-ope-max';
        full.textContent = `${global.CoreOpes.MAX} OPE, c’est le maximum pour un projet.`;
        addZone.appendChild(full);
        return;
      }
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'cp-ope-add';
      add.dataset.opeAdd = '';
      add.innerHTML = `<span aria-hidden="true">+</span> Ajouter l’OPE ${n + 1} <small>(jusqu’à ${global.CoreOpes.MAX})</small>`;
      add.onclick = addOpe;
      addZone.appendChild(add);
    }
    function refreshOpeUi() { refreshAddZone(); refreshProjectTotals(m); }
    // Nombre d'OPE à enregistrer : jusqu'à la dernière qui contient quelque chose (au moins l'OPE 1). Une OPE ajoutée par un clic de trop et
    // laissée vide (action « à déterminer » par défaut, aucun montant) n'est donc pas écrite et ne fait créer aucune colonne.
    refs._opeCountToSave = () => refs._opes.reduce((last, card) => (card.rank > 1 && global.CoreOpes.hasData(readCardState(card)) ? card.rank : last), 1);
    refs._addOpeCard = addOpeCard;
    refs._clearExtraCards = clearExtraCards;
    refs._refreshOpeUi = refreshOpeUi;

    const firstCard = addOpeCard(true);
    // Alias de l'OPE 1 : les colonnes historiques, lues telles quelles par le reste de la modale.
    refs.Ligne_OPE = firstCard.ref;
    refs.Ligne_OPE_installe_chez = firstCard.installe;
    refs.Action_Ligne_OPE_a_faire = firstCard.select;
    refs._setOpeAction = firstCard.setAction;
    refs._refreshInstalleChez = firstCard.refresh;
    refreshAddZone();

    // Total croisé du projet (OPE 2 et suivantes seulement : avec une seule OPE il redirait le total déjà en haut de l'onglet) :
    // lecture par nature ou par OPE, barre de répartition, et contrôle de la convention de reversement.
    const totalBlock = document.createElement('section');
    totalBlock.className = 'cp-total';
    totalBlock.hidden = true;
    totalBlock.setAttribute('aria-labelledby', 'cp-total-title');
    totalBlock.innerHTML = '<div class="cp-total-head"><h3 id="cp-total-title">Total croisé du projet</h3>' +
      '<div class="cp-seg" role="group" aria-label="Lecture du total"><button type="button" data-total-mode="nature" aria-pressed="true">Par nature</button><button type="button" data-total-mode="ope" aria-pressed="false">Par OPE</button></div></div>' +
      '<div class="cp-total-bar" aria-hidden="true"></div><div class="cp-total-legend"></div>' +
      '<div class="cp-fin-wrap"><table class="cp-fin cp-fin-cross"></table></div>' +
      '<p class="cp-conv" role="status" hidden></p>';
    panels.budget.appendChild(totalBlock);
    m._totalMode = 'nature';
    totalBlock.querySelectorAll('[data-total-mode]').forEach(b => b.onclick = () => {
      m._totalMode = b.dataset.totalMode;
      refreshProjectTotals(m);
    });

    // Message permanent (demande d'Antoine du 02/11/2026), visible tant que la
    // convention de reversement est active, quel que soit le montant déjà saisi —
    // distinct du blocage rouge de saveProject() qui, lui, ne s'affiche que si le
    // Fonctionnement ne couvre pas déjà le montant reversé.
    const budgetConventionNotice = document.createElement('p');
    budgetConventionNotice.id = 'cp-budget-convention-notice';
    budgetConventionNotice.className = 'cp-budget-notice cp-hidden';
    budgetConventionNotice.textContent = 'Convention de reversement active : l’intégralité du montant reversé doit être couverte par le budget de Fonctionnement (toutes OPE réunies), jamais l’Investissement ni le Personnel.';
    panels.budget.appendChild(budgetConventionNotice);

    // Co-financements (volet replié, 17/11/2026) : sous les OPE et leur message, jamais dans le total [data-fin].
    refs._cofin = buildCofinancing(panels.budget);

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
    p1.oninput = () => { m._conventionPartner1Manual = true; syncConventionAmounts(m); checkConvention7030(m); refreshProjectTotals(m); };
    p2.oninput = () => { m._conventionPartner2Manual = true; syncConventionAmounts(m); checkConvention7030(m); refreshProjectTotals(m); };

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
      // Sur un écran étroit la barre d'onglets défile : l'onglet choisi reste visible.
      if (tabButtons[key].scrollIntoView) tabButtons[key].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      // Le bandeau du prévisionnel se colle au bord haut de l'onglet Budget et OPE : pas de marge au-dessus de lui.
      f.classList.toggle('is-budget', key === 'budget');
      // Rejoue l'animation d'entrée (cf. creation-projet.css) à chaque changement
      // d'onglet : on retire la classe puis on force un reflow (offsetWidth) avant
      // de la remettre, sans quoi une classe déjà présente ne redéclenche pas
      // l'animation CSS.
      if (changed) {
        // Chaque onglet s'ouvre en haut : l'onglet Budget et OPE est long, on ne reste pas coincé en bas en passant à un autre.
        f.scrollTop = 0;
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

    // Pop-up d'explication (demande d'Antoine du 02/11/2026), affichée seulement quand
    // l'utilisateur coche lui-même l'interrupteur — jamais à l'ouverture d'un projet où
    // la convention est déjà active, puisque conventionCheckbox.checked= (populateModal)
    // est une affectation directe et ne déclenche pas l'évènement 'change'.
    const conventionNotice = document.createElement('div');
    conventionNotice.id = 'cp-convention-notice';
    conventionNotice.className = 'cp-modal cp-person-modal cp-hidden';
    conventionNotice.innerHTML = `<div class="cp-box" role="dialog" aria-modal="true">` +
      `<div class="cp-head"><h2>Convention de reversement</h2><button type="button" data-cp-convention-close aria-label="Fermer">×</button></div>` +
      `<div class="cp-body"><p>L’intégralité du montant reversé via la convention doit être couverte par le budget de <strong>Fonctionnement</strong> — jamais l’Investissement ni le Personnel. Vérifiez la répartition dans l’onglet Budget et OPE avant d’enregistrer.</p></div>` +
      `<div class="cp-actions"><button type="button" data-cp-convention-close>Fermer</button><button type="button" data-cp-convention-review>Relire l’onglet Budget et OPE</button></div>` +
      `</div>`;
    document.body.appendChild(conventionNotice);
    const closeConventionNotice = () => conventionNotice.classList.add('cp-hidden');
    conventionNotice.querySelectorAll('[data-cp-convention-close]').forEach(b => b.onclick = closeConventionNotice);
    conventionNotice.querySelector('[data-cp-convention-review]').onclick = () => {
      closeConventionNotice();
      setActiveTab('budget');
    };

    // Rappel non bloquant (demande d'Antoine du 03/11/2026) : au-delà de
    // CONVENTION_SEUIL_7030, le versement se fait en deux fois (70 % puis 30 %).
    // Affiché une seule fois par franchissement du seuil (m._convention7030Shown) pour ne
    // pas réapparaître à chaque frappe tant que le montant reste au-dessus ; se réarme si
    // le montant repasse en dessous. Jamais à la seule ouverture de la modale — déclenché
    // uniquement par une saisie (budget, montants partenaires) ou la coche de
    // l'interrupteur, jamais par populateModal() qui réinitialise le drapeau sans ouvrir
    // la pop-up (cf. ProjectModal.open()).
    const convention7030Notice = document.createElement('div');
    convention7030Notice.id = 'cp-convention-7030-notice';
    convention7030Notice.className = 'cp-modal cp-person-modal cp-hidden';
    convention7030Notice.innerHTML = `<div class="cp-box" role="dialog" aria-modal="true">` +
      `<div class="cp-head"><h2>Montant supérieur à 20 000 €</h2><button type="button" data-cp-convention-7030-close aria-label="Fermer">×</button></div>` +
      `<div class="cp-body"><p>Le montant de cette convention de reversement dépasse 20 000 € : le versement se fera en deux fois, <strong>70 %</strong> puis <strong>30 %</strong>.</p></div>` +
      `<div class="cp-actions"><button type="button" data-cp-convention-7030-close>Fermer</button></div>` +
      `</div>`;
    document.body.appendChild(convention7030Notice);
    convention7030Notice.querySelectorAll('[data-cp-convention-7030-close]').forEach(b => b.onclick = () => convention7030Notice.classList.add('cp-hidden'));
    function checkConvention7030(modal) {
      if (!modal.querySelector('#cp-Convention_de_reversement').checked) { modal._convention7030Shown = false; return; }
      const aboveThreshold = conventionAmount(modal) > CONVENTION_SEUIL_7030;
      if (aboveThreshold && !modal._convention7030Shown) {
        modal._convention7030Shown = true;
        convention7030Notice.classList.remove('cp-hidden');
      } else if (!aboveThreshold) {
        modal._convention7030Shown = false;
      }
    }
    refs._convention7030Notice = convention7030Notice;

    const refreshBudgetConventionNotice = () => budgetConventionNotice.classList.toggle('cp-hidden', !conventionField.querySelector('#cp-Convention_de_reversement').checked);
    conventionField.querySelector('#cp-Convention_de_reversement').addEventListener('change', event => {
      refreshBudgetConventionNotice();
      if (event.target.checked) conventionNotice.classList.remove('cp-hidden');
      checkConvention7030(m);
      refreshProjectTotals(m);
    });
    refs._refreshBudgetConventionNotice = refreshBudgetConventionNotice;
    refs._conventionNotice = conventionNotice;

    m._refs = refs;
    return m;
  }

  // Totaux d'UNE répartition (par année, par ligne, général) ; rend le total général. Lit les champs [data-fin] de la table,
  // reconnus par data-nature (F/I/P) et data-year : ni l'ordre des colonnes ni le rang de l'OPE n'interviennent.
  function updateOpeTable(table) {
    const inputs = [...table.querySelectorAll('tbody [data-fin]')];
    const sumOf = list => list.reduce((sum, input) => sum + normaliseBudgetValue(input.value), 0);
    table.querySelectorAll('[data-total]').forEach(cell => {
      cell.textContent = sumOf(inputs.filter(input => input.dataset.year === cell.dataset.total)).toLocaleString('fr-FR');
    });
    table.querySelectorAll('tbody tr[data-nature]').forEach(tr => {
      const total = sumOf([...tr.querySelectorAll('[data-fin]')]);
      tr.querySelector('[data-row-total]').textContent = total.toLocaleString('fr-FR');
    });
    const grand = sumOf(inputs);
    table.querySelector('[data-grand-total]').textContent = grand.toLocaleString('fr-FR');
    return grand;
  }

  // Résumé d'une carte OPE : numéro de la ligne (ou invite) et action choisie.
  function refreshOpeHeader(card) {
    const input = card.querySelector('input[data-ref]');
    const hasLigne = !!(input && input.dataset.id);
    const name = card.querySelector('[data-ope-name]');
    name.textContent = hasLigne ? input.value : 'Ligne OPE à choisir';
    name.classList.toggle('is-empty', !hasLigne);
    const action = card.querySelector('select[id^="cp-Action_Ligne_OPE_a_faire"]')?.value || '';
    const chip = card.querySelector('[data-ope-act]');
    chip.textContent = action ? opeActionLabel(action) : '';
    chip.classList.toggle('warn', action === 'à determiner');
  }

  // Tout ce que le projet montre de ses montants : totaux de chaque OPE, bandeau du prévisionnel, pastille de l'onglet et, dès
  // deux OPE, le bloc « Total croisé du projet » (barre, légende, tableau par nature ou par OPE, contrôle de la convention).
  function refreshProjectTotals(m) {
    const CoreOpes = global.CoreOpes;
    const cards = [...m.querySelectorAll('.cp-ope')];
    const opes = cards.map(card => {
      const grand = updateOpeTable(card.querySelector('table.cp-fin'));
      card.querySelector('[data-ope-sum]').textContent = eur(grand);
      refreshOpeHeader(card);
      const amounts = {};
      CoreOpes.NATURES.forEach(n => {
        amounts[n.key] = CoreOpes.YEARS.map(year => normaliseBudgetValue(card.querySelector(`[data-fin][data-nature="${n.key}"][data-year="${year}"]`)?.value));
      });
      const ligne = card.querySelector('input[data-ref]');
      return { rank: Number(card.dataset.opeRank), amounts, name: ligne && ligne.dataset.id ? ligne.value : '' };
    });
    const combined = CoreOpes.combine(opes);
    const count = cards.length;

    const summary = m.querySelector('[data-fin-summary]');
    if (summary) summary.textContent = eur(combined.grand);
    const countEl = m.querySelector('[data-ope-count]');
    if (countEl) countEl.textContent = count > 1 ? ` · ${count} OPE` : '';
    const badge = m.querySelector('[data-cp-tab="budget"] .cp-tab-count');
    if (badge) {
      badge.hidden = count < 2;
      badge.textContent = String(count);
      badge.setAttribute('aria-label', `${count} OPE`);
    }

    const block = m.querySelector('.cp-total');
    if (!block) return;
    block.hidden = count < 2;
    if (count < 2) return;
    const mode = m._totalMode === 'ope' ? 'ope' : 'nature';
    block.querySelectorAll('[data-total-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.totalMode === mode)));
    const grand = combined.grand;
    block.querySelector('.cp-total-bar').innerHTML = opes.map((o, i) => (combined.byRank[i] ? `<i style="--c:var(--ope-${o.rank});flex-grow:${combined.byRank[i]}"></i>` : '')).join('');
    block.querySelector('.cp-total-legend').innerHTML = opes.map((o, i) => {
      const share = grand ? ` · ${Math.round(combined.byRank[i] / grand * 100)} %` : '';
      return `<span style="--c:var(--ope-${o.rank})"><i></i>OPE ${o.rank} <b>${esc(eur(combined.byRank[i]))}</b>${share}</span>`;
    }).join('');
    const cell = value => (value ? fmtNumber(value) : '<span class="cp-zero">0</span>');
    const years = CoreOpes.YEARS;
    const head = `<thead><tr><th>${mode === 'nature' ? 'Nature' : 'OPE'}</th>${years.map(y => `<th>${y}</th>`).join('')}<th>Total</th></tr></thead>`;
    const lines = mode === 'nature'
      ? CoreOpes.NATURES.map(n => `<tr><th scope="row">${esc(n.label)}</th>${combined.byNature[n.key].map(v => `<td>${cell(v)}</td>`).join('')}<td class="cp-row-total">${fmtNumber(combined.byNature[n.key].reduce((a, b) => a + b, 0))}</td></tr>`)
      : opes.map((o, i) => {
        const byYear = years.map((year, yi) => CoreOpes.NATURES.reduce((sum, n) => sum + o.amounts[n.key][yi], 0));
        return `<tr style="--c:var(--ope-${o.rank})"><th scope="row"><span class="cp-dot-ope"></span>OPE ${o.rank}${o.name ? ` · ${esc(o.name)}` : ''}</th>${byYear.map(v => `<td>${cell(v)}</td>`).join('')}<td class="cp-row-total">${fmtNumber(combined.byRank[i])}</td></tr>`;
      });
    const foot = `<tfoot><tr><th scope="row">Total projet</th>${combined.byYear.map(v => `<td>${fmtNumber(v)}</td>`).join('')}<td data-cross-grand>${fmtNumber(grand)}</td></tr></tfoot>`;
    block.querySelector('.cp-fin-cross').innerHTML = `${head}<tbody>${lines.join('')}</tbody>${foot}`;

    // Convention de reversement : le Fonctionnement de toutes les OPE réunies doit couvrir le montant reversé.
    const conv = block.querySelector('.cp-conv');
    const convOn = !!m.querySelector('#cp-Convention_de_reversement')?.checked && !!m.querySelector('#cp-Convention_montant_partenaire_1');
    conv.hidden = !convOn;
    if (convOn) {
      const amount = conventionAmount(m), fonctionnement = fonctionnementTotal(m);
      const ok = fonctionnement >= amount;
      conv.className = `cp-conv ${ok ? 'ok' : 'ko'}`;
      conv.textContent = ok
        ? `Convention de reversement de ${eur(amount)} : couverte par le Fonctionnement des OPE réunies (${eur(fonctionnement)}).`
        : `Le Fonctionnement des OPE réunies (${eur(fonctionnement)}) doit couvrir la convention de reversement de ${eur(amount)}. L’enregistrement serait refusé.`;
    }
  }

  // Appelée à chaque saisie d'un montant : recalcule la répartition modifiée puis tout ce qui en dépend (bandeau, total croisé…).
  function updateFinancialTotals(table) {
    const modal = table.closest('#cp-project-modal');
    if (modal) refreshProjectTotals(modal);
    else updateOpeTable(table);
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

  // Secondes epoch (minuit UTC) d'un champ DateInput ; null si le champ est vide (une saisie fausse est refusée avant, cf. invalidDateIssue).
  function dateFieldValue(input) {
    const iso = global.DateInput.iso(input);
    if (!iso) return null;
    return Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 1000);
  }

  // Une date à moitié tapée (« 19/11 ») est refusée plutôt que lue comme un champ vide : l'enregistrement
  // effacerait sinon la date déjà en base sans que rien ne le dise.
  const DATE_FIELDS = [
    ['Date_limite_financement', 'Date limite de financement'],
    ['Date_debut_Projet', 'Date de début du projet'],
    ['Date_de_fin_Projet', 'Date de fin du projet']
  ];
  function invalidDateIssue(m) {
    const bad = DATE_FIELDS.filter(([key]) => global.DateInput.iso(m.querySelector('#cp-' + key)) === null).map(([, label]) => label);
    return bad.length ? `Date non valide (jj/mm/aaaa attendu) : ${bad.join(', ')}.` : '';
  }

  // Référence vers une fiche que cet utilisateur ne peut pas lire (règle d'accès Grist : ligne ou table cachée, « voir en tant que » un
  // autre utilisateur — demande d'Antoine du 24/11/2026) : l'ancien repli affichait le numéro de ligne brut (« 17 »), pris pour un vrai
  // numéro d'OPE. On écrit à la place « Ligne OPE (id 17) non lisible », avec la raison en infobulle ; la valeur (dataset.id) n'est pas
  // touchée, donc enregistrer le projet garde la référence telle quelle.
  const REF_KINDS = { Lignes_OPE: 'Ligne OPE', Annuaire: 'Personne', Programmes: 'Programme', Structures: 'Structure', Suivi_Instance: 'Instance', Postes2: 'Poste' };
  const isRowId = id => /^\d+$/.test(String(id).trim()) && Number(id) > 0;
  const unreadableRefLabel = (tableName, id) => global.CoreAccess ? global.CoreAccess.unreadableLabel(tableName, id) : `${REF_KINDS[tableName] || 'Élément'} (id ${String(id).trim()}) non lisible`;
  function unreadableRefReason(tableName, id) {
    if (global.CoreAccess) return global.CoreAccess.unreadableReason(tableName, id);
    const failure = global.CoreGrist && typeof global.CoreGrist.readFailure === 'function' ? global.CoreGrist.readFailure(tableName) : '';
    return failure
      ? `La table ${tableName} n’a pas pu être lue avec vos droits d’accès (${failure}). La valeur reste rattachée au projet tant que vous ne la changez pas.`
      : 'Cette fiche existe dans Grist mais vos droits d’accès ne vous la montrent pas. La valeur reste rattachée au projet tant que vous ne la changez pas.';
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
    const unreadable = hasId && !found && !(raw && typeof raw === 'object') && tableName !== '__choice__' && isRowId(id);
    ref.input.dataset.id = hasId ? String(id) : '';
    ref.input.value = !hasId ? '' : (raw && typeof raw === 'object'
      ? personLabel(raw)
      : (found ? (tableName === 'Annuaire' ? personLabel(found) : (tableName === 'Lignes_OPE' ? opeLabel(found) : label(found, displayFields || ['Nom', 'name', 'Acronyme', 'Nom_complet', 'Programme']))) : (unreadable ? unreadableRefLabel(tableName, id) : text(raw))));
    if (ref.input.dataset.unreadable) { delete ref.input.dataset.unreadable; ref.input.removeAttribute('title'); }
    if (unreadable) { ref.input.dataset.unreadable = '1'; ref.input.title = unreadableRefReason(tableName, id); }
    (ref.paintAvatar || ref.refreshAvatar)?.();
  }

  // Pièces jointes Grist (Attachments) : valeur brute ['L', id1, id2, ...] (ReferenceList vers
  // la table système _grist_Attachments, cf. js/core/grist-bridge.js), 0 ou absente si aucun
  // fichier. Déballage des numéros et lecture des noms de fichier partagés avec la page
  // Administratif : js/core/attachments.js. Les deux champs (Notification, Convention) demandent
  // _grist_Attachments au même instant à chaque ouverture : une seule lecture est partagée
  // entre appels simultanés, jamais conservée ensuite (la table reste toujours à jour).
  const attachmentIds = value => global.CoreAttachments.ids(value);
  const loadAttachmentMeta = () => global.CoreAttachments.loadMeta();

  // Affiche dans `container` un lien de visualisation/téléchargement par pièce jointe
  // (nom réel si connu, sinon "Pièce jointe #id"), ou "Aucun fichier." si la colonne est
  // vide — demande d'Antoine du 03/11/2026. Le jeton d'accès (getAccessToken) et le nom de
  // fichier se chargent de façon asynchrone ; le numéro de génération est porté par
  // `container` (pas par la modale, réutilisée pour les DEUX champs pièces jointes à la
  // fois) pour qu'une réponse tardive du champ Notification n'invalide pas, à tort, un
  // rendu plus récent du champ Convention (et inversement) — et protège aussi contre une
  // réponse qui arriverait après la réouverture de la modale sur un AUTRE projet (la
  // modale est réutilisée, jamais recréée, cf. populateModal).
  //
  // readOnly:false est volontaire, pas un oubli : un jeton readOnly:true est plafonné
  // côté serveur Grist au rôle Lecteur (AccessTokenCredential.docAuth, grist-core),
  // quel que soit le vrai rôle de l'utilisateur. Sur le document d'Antoine, une règle
  // d'accès limite la lecture de la pièce jointe Convention à Éditeur/Propriétaire — un
  // jeton readOnly:true faisait donc échouer son propre téléchargement ("Cannot access
  // attachment") alors qu'il y a bien droit, Notification n'étant pas concerné par cette
  // règle. readOnly:false laisse le jeton porter le vrai rôle de l'utilisateur (ticket
  // valable 15 min, jamais stocké, seulement inséré dans ce lien de téléchargement).
  // cell (tableId/colId/rowId) est transmis quand connu : Grist peut alors prouver
  // l'accès directement sur cette cellule plutôt que de chercher dans tout le document.
  function renderAttachments(container, ids, cell) {
    if (!container) return;
    const gen = (container._cpAttachmentsGen = (container._cpAttachmentsGen || 0) + 1);
    container._cpAttachmentCell = cell;
    wireAttachmentViewer(container);
    if (!ids.length) {
      container.innerHTML = '<span class="cp-attachments-empty">Aucun fichier.</span>';
      return;
    }
    container.innerHTML = '<span class="cp-attachments-empty">Chargement…</span>';
    (async () => {
      const api = global.CoreGrist?.gristInstance;
      if (!api) return;
      let token, meta;
      try {
        [token, meta] = await Promise.all([api.docApi.getAccessToken({ readOnly: false }), loadAttachmentMeta()]);
      } catch (err) {
        if (container._cpAttachmentsGen === gen) container.innerHTML = '<span class="cp-attachments-empty">Pièces jointes indisponibles.</span>';
        return;
      }
      if (container._cpAttachmentsGen !== gen) return;
      const cellParams = cell ? `&tableId=${encodeURIComponent(cell.tableId)}&colId=${encodeURIComponent(cell.colId)}&rowId=${encodeURIComponent(cell.rowId)}` : '';
      container.innerHTML = ids.map(id => {
        const name = meta.get(id) || `Pièce jointe #${id}`;
        if (meta.get(id)) global.CoreAttachments.rememberName(id, meta.get(id)); // titre de la visionneuse
        const url = `${token.baseUrl}/attachments/${id}/download?auth=${encodeURIComponent(token.token)}${cellParams}`;
        return `<a href="${esc(url)}" class="cp-attachment-link" data-attachment-id="${id}" target="_blank" rel="noopener">${esc(name)}</a>`;
      }).join('');
    })();
  }

  // Un clic sur le nom d'une pièce jointe PDF l'affiche dans la visionneuse du widget
  // (js/components/pdf-viewer.js) au lieu d'ouvrir un onglet : l'adresse Grist de la pièce jointe
  // force le téléchargement. Le lien garde son href (clic droit « enregistrer », Ctrl/Maj/clic
  // milieu = comportement du navigateur) ; un fichier qui n'est visiblement pas un PDF, ou une
  // visionneuse absente, laissent le lien faire son travail habituel. Le fichier est lu avec le
  // jeton (CoreAttachments.fetchBytes) ; l'icône « télécharger » de la visionneuse garde le
  // téléchargement. Un seul écouteur par conteneur : la liste est redessinée à chaque ouverture.
  function wireAttachmentViewer(container) {
    if (container._cpViewerWired) return;
    container._cpViewerWired = true;
    container.addEventListener('click', event => {
      const link = event.target.closest && event.target.closest('a.cp-attachment-link[data-attachment-id]');
      if (!link || !container.contains(link) || event.defaultPrevented) return;
      if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (!global.PdfViewer || !global.CoreAttachments) return;
      const name = link.textContent.trim();
      const extension = /\.([a-z0-9]{1,6})$/i.exec(name);
      if (extension && extension[1].toLowerCase() !== 'pdf') return;
      event.preventDefault();
      const id = Number(link.dataset.attachmentId);
      const cell = container._cpAttachmentCell || null;
      global.PdfViewer.open({
        title: name,
        load: () => global.CoreAttachments.fetchBytes(id, cell),
        onDownload: () => global.CoreAttachments.open(id, cell),
        opener: link
      });
    });
  }

  // Appelée aussi bien en édition (record renseigné) qu'à l'ouverture en création : dans
  // ce dernier cas record est null et valueOf()/setRef() (via l'enchaînement record?.[...])
  // renvoient alors systématiquement des valeurs vides, ce qui vide la modale au lieu de
  // laisser les champs du dernier projet ouvert (la modale est réutilisée, pas recréée).
  function populateModal(m, refs, record) {
    const set = (id, names) => { const el = m.querySelector('#' + id); if (el) el.value = text(valueOf(record, names)); };
    const setDate = (key) => { const el = m.querySelector('#cp-' + key); if (el) global.DateInput.setIso(el, dateInputValue(valueOf(record, [key]))); };

    set('cp-Projet', ['Projet']);
    set('cp-Acronyme', ['Acronyme']);
    // Un statut absent de la liste fixe (valeur saisie dans Grist, ancienne valeur) doit rester
    // sélectionnable : sans option correspondante, la liste se vide et l'enregistrement effacerait le
    // statut du projet, même pour une simple correction de commentaire.
    const statutSelect = m.querySelector('#cp-statut');
    if (statutSelect) {
      statutSelect.querySelectorAll('option[data-cp-extra]').forEach(option => option.remove());
      const statut = text(valueOf(record, ['Statut_operationnel_projet', 'Statut opérationnel', 'Statut']));
      if (statut.trim() && !Array.from(statutSelect.options).some(option => option.value === statut)) {
        const extra = document.createElement('option');
        extra.value = statut;
        extra.textContent = statut;
        extra.dataset.cpExtra = '1';
        statutSelect.appendChild(extra);
      }
    }
    set('cp-statut', ['Statut_operationnel_projet', 'Statut opérationnel', 'Statut']);
    m._renderStatusDot();
    set('cp-comment', ['comentaire_general_Suivi_projet', 'commentaire_general_Suivi_projet']);
    set('cp-Periode', ['Periode']);
    set('cp-Commentaire_ligne_OPE', ['Commentaire_ligne_OPE']);
    ['Date_limite_financement', 'Date_debut_Projet', 'Date_de_fin_Projet'].forEach(setDate);

    setRef(refs.programme, valueOf(record, ['Programme']), 'Programmes', ['Programme']);
    setRef(refs.type, valueOf(record, ['Type_projet']), '__choice__');
    refs.type.render();
    const refTables = { Porteur_1: 'Annuaire', Porteur_2: 'Annuaire', Porteur_3: 'Annuaire', VP_porteur_signataire_notif: 'Annuaire', Accompagnateur: 'Annuaire', Instance_ratachee: 'Suivi_Instance' };
    Object.keys(refTables).forEach(k => setRef(refs[k], valueOf(record, [k]), refTables[k], ['nom_et_Prenom', 'Prenom', 'NOM', 'Nom', 'name', 'Acronyme', 'Nom_complet']));
    setRef(refs.Ligne_OPE, valueOf(record, ['Ligne_OPE']), 'Lignes_OPE', ['N_OPE']);
    refs._refreshInstalleChez();
    refs._setOpeAction(text(valueOf(record, ['Action_Ligne_OPE_a_faire'])));
    // OPE 2 à 4 : une carte par OPE que le projet porte déjà, toutes déployées comme l'OPE 1 (demande d'Antoine du 24/11/2026).
    refs._clearExtraCards();
    refs._opes[0].setOpen(true);
    for (let rank = 2; rank <= global.CoreOpes.count(record); rank += 1) {
      const card = refs._addOpeCard(true);
      const ope = global.CoreOpes.read(record, rank);
      setRef(card.ref, ope.ligneIds[0] || 0, 'Lignes_OPE', ['N_OPE']);
      card.refresh();
      card.setAction(ope.action);
      card.comment.value = ope.comment;
    }

    const conventionEnabled = valueOf(record, ['Convention_de_reversement']);
    const conventionCheck = m.querySelector('#cp-Convention_de_reversement');
    if (conventionCheck) conventionCheck.checked = Boolean(conventionEnabled === true || conventionEnabled === 1 || conventionEnabled === 'true');
    refs._refreshBudgetConventionNotice();
    refs.Partenaire_s_convention_reversement.wrap._setIds(valueOf(record, ['Partenaire_s_convention_reversement']));

    // 2026-2028 de toutes les OPE, lus dans les colonnes de montants : Montant_attribue_Total (formule Grist) n'est fiable que pour l'OPE 1 tant que
    // le widget ne l'a pas adaptée aux OPE 2 à 4 (js/core/ope-totals.js), et l'additionner ensuite compterait ces OPE deux fois.
    // Sans colonnes de montants lues (jeu de données réduit), on retombe sur la formule.
    const total = [2026, 2027, 2028].reduce((sum, year) => sum + global.CoreOpes.yearAmount(record, year), 0) ||
        (Number(valueOf(record, ['Montant_attribue_Total'])) || 0),
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
    refs._refreshOpeUi();
    refs._cofin.render(record);

    Object.entries(refs._attachmentsEls).forEach(([col, container]) => {
      const cell = record?.id ? { tableId: 'Projets', colId: col, rowId: record.id } : null;
      renderAttachments(container, attachmentIds(valueOf(record, [col])), cell);
    });
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
    const saved = refs._opeCountToSave();
    refs._opes.slice(0, saved).forEach(card => card.el.querySelectorAll('[data-fin]').forEach(i => { fields[i.dataset.fin] = normaliseBudgetValue(i.value); }));
    m.querySelectorAll('tbody tr[data-detail]').forEach(tr => fields[tr.dataset.detail] = tr.querySelector('th input').value);
    // OPE 2 à 4 : les montants viennent des [data-fin] ci-dessus ; la ligne, l'action et le commentaire se lisent sur chaque carte.
    refs._opes.slice(1, saved).forEach(card => {
      const id = Number(card.ref.input.dataset.id);
      fields[global.CoreOpes.ligneColumn(card.rank)] = id ? ['L', id] : ['L'];
      fields[global.CoreOpes.actionColumn(card.rank)] = card.select.value;
      fields[global.CoreOpes.commentColumn(card.rank)] = card.comment.value.trim();
    });
    // OPE retirée (ou remontée d'un rang) : si ses colonnes existent déjà dans Grist, on les vide pour qu'aucune donnée ne reste.
    if (m.dataset.mode === 'edit') {
      const existing = projectColumns(m._projectRecord);
      for (let rank = saved + 1; rank <= global.CoreOpes.MAX; rank += 1) {
        global.CoreOpes.columnsOf(rank).filter(col => existing.has(col) && !global.CoreGrist?.isFormulaColumn?.('Projets', col)).forEach(col => {
          fields[col] = col === global.CoreOpes.ligneColumn(rank) ? ['L'] : (/^c\d{4}_/.test(col) ? 0 : '');
        });
      }
    }
    Object.assign(fields, refs._cofin.collect());
    return fields;
  }

  // Colonnes de Projets qu'on sait exister : le schéma lu au démarrage, sinon les clés d'une ligne lue (celle qu'on modifie, ou la première).
  function projectColumns(record) {
    const known = new Set(global.CoreGrist?.knownColumns?.('Projets') || []);
    [record, rows('Projets')[0]].forEach(row => { if (row) Object.keys(row).forEach(key => known.add(key)); });
    return known;
  }

  // Crée dans Projets les colonnes des OPE 2 à `upTo` qui n'y sont pas encore (15 par OPE, bulles d'aide reprises de l'OPE 1).
  async function ensureOpeColumns(m, upTo) {
    const describe = col => global.CoreGrist?.getColumnDescription?.('Projets', col) || '';
    const missing = global.CoreOpes.missingColumns(projectColumns(m._projectRecord), upTo, describe);
    if (!missing.length) return;
    try {
      await global.CoreGrist.ensureColumns('Projets', missing);
    } catch (error) {
      // `cause` : le diagnostic d'accès classe l'erreur de Grist (droit « structure » refusé…) au lieu de ce texte d'enveloppe.
      throw Object.assign(new Error(`les colonnes ${upTo > 2 ? `des OPE 2 à ${upTo}` : 'de l\'OPE 2'} n'ont pas pu être créées dans la table Projets (${error.message}).`),
        { cause: error, gristAccess: { op: 'write', table: 'Projets', columns: missing.map(col => col.id), what: `création des colonnes ${upTo > 2 ? `des OPE 2 à ${upTo}` : 'de l\'OPE 2'} dans Projets` } });
    }
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
      { tab: 'dates', label: 'Date limite de financement', ok: !!global.DateInput.iso(refs.Date_limite_financement) },
      { tab: 'budget', label: 'Action ligne OPE', ok: !!refs.Action_Ligne_OPE_a_faire.value },
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
        // L'action de l'OPE 1 se choisit dans sa carte : on la déploie si elle était repliée.
        if (missing.some(c => c.label === 'Action ligne OPE')) refs._opes[0].setOpen(true);
        return;
      }
    } else {
      renderMissingBanner(m, refs);
    }
    // Bloque dans les deux modes (demande d'Antoine du 02/11/2026 : "ne pas laisser
    // valider"), contrairement aux champs obligatoires qui ne bloquent qu'à la création.
    const conventionIssue = conventionFonctionnementIssue(m);
    if (conventionIssue) {
      m.querySelector('#cp-project-error').textContent = conventionIssue;
      m._setActiveTab('budget');
      return;
    }
    const dateIssue = invalidDateIssue(m);
    if (dateIssue) {
      m.querySelector('#cp-project-error').textContent = dateIssue;
      m._setActiveTab('dates');
      return;
    }
    // Un seul enregistrement à la fois : un second clic (ou Entrée) avant la réponse de Grist créerait
    // le projet en double, sans que rien ne le signale.
    if (m._saving) return;
    m._saving = true;
    const saveButton = m.querySelector('[data-cp-save]');
    saveButton.disabled = true;
    try {
      // Les colonnes des OPE 2 à 4 sont créées par le widget au premier enregistrement qui en a besoin (jamais pour un projet à une OPE).
      const opeCount = refs._opeCountToSave();
      if (opeCount > 1) {
        await ensureOpeColumns(m, opeCount);
        // Colonne affichée des colonnes référence des OPE 2 à 4 (sinon Grist y montre des numéros de ligne), y compris celles créées avant.
        await global.CoreOpes.ensureDisplays(opeCount);
        // Totaux de Projets (formules Grist) : additionnés sur les OPE 2 à 4 existantes, au mieux (un refus ne bloque jamais l'enregistrement).
        if (global.CoreOpeTotals) await global.CoreOpeTotals.adaptAndNotify(opeCount);
      }
      const fields = collectFields(m, refs);
      if (mode === 'edit') await updateRecord('Projets', record.id, fields);
      else await addRecord('Projets', fields);
      m.classList.add('cp-hidden');
      global.dispatchEvent(new CustomEvent('project-created'));
    } catch (e) {
      global.CoreUtils.showErrorBox(m.querySelector('#cp-project-error'), e, mode === 'edit' ? 'Modification impossible' : 'Création impossible',
        { what: `${mode === 'edit' ? 'modification' : 'création'} du projet ${(m.querySelector('#cp-Acronyme') || {}).value || ''}`.trim(), table: 'Projets' });
    } finally {
      m._saving = false;
      saveButton.disabled = false;
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

  // Le type d'instance (CTO Innovation, CTO FARE, Comité...) n'est pas chargé
  // directement : Suivi_Instance.Instance référence la table Instances, jamais
  // chargée par le widget (docs/grist_usage.md). La formule Nom l'embarque en
  // préfixe ("<type>#<numero> - <date>"), seul moyen côté client de le retrouver.
  function suiviInstanceType(row) {
    const nom = text(row?.Nom ?? row?.name);
    const idx = nom.indexOf('#');
    return normaliseName(idx === -1 ? nom : nom.slice(0, idx));
  }

  // Demande du 03/11/2026 : ne retenir que les instances CTO Innovation / CTO FARE
  // pour le pré-remplissage ci-dessous, jamais les autres types de comité.
  function isEligibleInstanceType(row) {
    const type = suiviInstanceType(row);
    return type === 'cto innovation' || type === 'cto fare';
  }

  // Pré-remplissage Instance rattachée (création uniquement) : l'instance la plus
  // proche dans le temps — la prochaine à venir, sinon la plus récente passée —
  // parmi les seules instances de type CTO Innovation ou CTO FARE.
  // Suivi_Instance.date est un Grist Date() (timestamp Unix en secondes), même
  // convention que js/core/utils.js (gristDateToInput) ; les instances sans date
  // sont ignorées.
  function findNearestInstance() {
    const now = Math.floor(Date.now() / 1000);
    const dated = rows('Suivi_Instance')
      .filter(isEligibleInstanceType)
      .map(r => ({ row: r, date: Number(r.date) }))
      .filter(x => Number.isFinite(x.date) && x.date !== 0);
    if (!dated.length) return null;
    const upcoming = dated.filter(x => x.date >= now).sort((a, b) => a.date - b.date);
    if (upcoming.length) return upcoming[0].row;
    return dated.sort((a, b) => b.date - a.date)[0].row;
  }

  global.ProjectModal = {
    // Séance de Suivi_Instance de type CTO Innovation / CTO FARE : même règle que le pré-remplissage ci-dessus,
    // réutilisée par le filtre Instance du Kanban (prochain / dernier CTO épinglés, 24/11/2026).
    isCtoSeance: isEligibleInstanceType,
    // options.tab : onglet à afficher à l'ouverture (clé de TABS, ex. 'conventions') ; « Général » par défaut.
    open(record, options) {
      const m = createModal();
      m.dataset.mode = record ? 'edit' : 'create';
      m._projectRecord = record || null;
      m.querySelector('.cp-head h2').textContent = record ? 'Modifier le projet' : 'Créer un projet';
      m.querySelector('[data-cp-save]').textContent = record ? 'Enregistrer les modifications' : 'Créer le projet';
      m.querySelector('#cp-project-error').textContent = '';
      m.querySelector('#cp-project-warning').textContent = '';
      m._refs._conventionNotice.classList.add('cp-hidden');
      m._refs._convention7030Notice.classList.add('cp-hidden');
      m._convention7030Shown = false;
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
      m._setActiveTab(options && TABS.some(t => t.key === options.tab) ? options.tab : 'general');
      m.querySelector('#cp-project-form').scrollTop = 0;
      m._refs.Periode.oninput = () => {};
      return m;
    }
  };
}(window));
