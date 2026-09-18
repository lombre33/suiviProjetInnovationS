(function (global) {
  'use strict';

  const tableRows = name => {
    const tables = global.CoreState && typeof global.CoreState.getTable === 'function'
      ? global.CoreState.getTable(name)
      : undefined;
    return Array.isArray(tables) ? tables : [];
  };

  const text = value => value == null ? '' : String(value);
  const escapeHtml = value => global.CoreUtils.escapeHtml(value);

  const label = (row, fields) => {
    for (const field of fields) {
      if (row && row[field] != null && text(row[field])) return text(row[field]);
    }
    return row?.id == null ? '' : text(row.id);
  };

  function addRecord(fields) {
    const api = global.CoreGrist?.gristInstance;
    if (!api) throw new Error('API Grist indisponible. Rechargez la page puis réessayez.');
    return api.docApi.applyUserActions([['AddRecord', 'Annuaire', null, fields]]);
  }

  function updateRecord(id, fields) {
    const api = global.CoreGrist?.gristInstance;
    if (!api) throw new Error('API Grist indisponible. Rechargez la page puis réessayez.');
    return api.docApi.applyUserActions([['UpdateRecord', 'Annuaire', Number(id), fields]]);
  }

  // Champ de recherche générique (utilisé ici pour le Poste). Le "+Créer" ouvrant une
  // seconde modale a été retiré : la création à la volée se fait désormais en ligne dans
  // l'onglet Poste (cf. buildPosteTab ci-dessous). Cliquer un poste déjà sélectionné ouvre
  // toujours sa fiche complète (modale autonome) pour le modifier — un geste plus rare,
  // qui n'a pas besoin d'être en ligne.
  function searchableField(parent, id, labelText, rows, fields, initialValue, initialId) {
    const wrap = document.createElement('div');
    wrap.className = 'cp-field cp-ref cp-full';
    wrap.innerHTML = `<label for="${id}">${escapeHtml(labelText)}</label><input id="${id}" autocomplete="off" placeholder="Rechercher…"><div class="cp-ref-list cp-hidden"></div>`;
    const input = wrap.querySelector('input'), list = wrap.querySelector('.cp-ref-list');
    if (initialValue) input.value = initialValue;
    if (initialId != null && initialId !== '') input.dataset.id = String(initialId);
    if (id === 'cpp-poste') input.dataset.ref = 'poste';

    const render = () => {
      const query = input.value.trim().toLowerCase();
      const matches = rows().filter(row => label(row, fields).toLowerCase().includes(query)).slice(0, 30);
      list.innerHTML = matches.map(row => `<button type="button" data-id="${escapeHtml(row.id)}">${escapeHtml(label(row, fields))}</button>`).join('');
      list.classList.toggle('cp-hidden', !list.innerHTML);
      list.querySelectorAll('button').forEach(button => button.onclick = () => {
        input.value = button.textContent;
        input.dataset.id = button.dataset.id;
        list.classList.add('cp-hidden');
      });
    };

    input.oninput = () => { delete input.dataset.id; render(); };
    input.onfocus = render;
    input.onclick = event => {
      if (id === 'cpp-poste' && input.dataset.id && typeof global.openEditPosteModal === 'function') {
        const selected = rows().find(row => String(row.id) === String(input.dataset.id));
        if (selected) {
          event.preventDefault();
          event.stopPropagation();
          list.classList.add('cp-hidden');
          global.openEditPosteModal(selected, input);
        }
      }
    };
    // Comme pour les champs référence de la modale projet : du texte tapé sans
    // sélectionner de suggestion ne doit pas rester affiché comme si un poste avait
    // été retenu, alors qu'aucun id n'est associé (dataset.id vide).
    input.onblur = () => setTimeout(() => {
      list.classList.add('cp-hidden');
      if (!input.dataset.id) input.value = '';
    }, 150);
    parent.appendChild(wrap);
    return input;
  }

  function fieldValue(row, names) {
    for (const name of names) if (row?.[name] != null) return row[name];
    return '';
  }

  // Onglet Poste : recherche d'un poste existant + bascule "+" vers un mini-formulaire de
  // création affiché sous le champ (jamais une 2e modale — 9 ajouts de personne sur 10
  // s'accompagnent d'un nouveau poste, autant rester dans le même flux).
  function buildPosteTab(panel, person) {
    const posteValue = fieldValue(person, ['Poste2', 'Poste']);
    const refLabel = (value, table, fields) => {
      const id = value && typeof value === 'object' ? value.id : value;
      const row = tableRows(table).find(item => String(item.id) === String(id));
      return value && typeof value === 'object' ? label(value, fields) : (row ? label(row, fields) : '');
    };
    const refId = value => value && typeof value === 'object' ? value.id : value;
    const posteInput = searchableField(
      panel, 'cpp-poste', 'Poste (nom du poste)', () => tableRows('Postes2'), ['Nom_du_poste', 'Titre'],
      refLabel(posteValue, 'Postes2', ['Nom_du_poste', 'Titre']), refId(posteValue)
    );
    const posteFieldWrap = posteInput.closest('.cp-field');

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'cp-add-toggle';
    toggleBtn.textContent = '+ Créer un nouveau poste';
    panel.appendChild(toggleBtn);

    const inlineWrap = document.createElement('div');
    inlineWrap.className = 'cp-grid cp-inline-panel cp-hidden';
    panel.appendChild(inlineWrap);

    let fieldset = null;

    const closeInline = () => {
      fieldset = null;
      inlineWrap.classList.add('cp-hidden');
      inlineWrap.innerHTML = '';
      posteFieldWrap.classList.remove('cp-hidden');
      toggleBtn.classList.remove('cp-hidden');
    };

    const openInline = () => {
      posteFieldWrap.classList.add('cp-hidden');
      toggleBtn.classList.add('cp-hidden');
      inlineWrap.classList.remove('cp-hidden');
      inlineWrap.innerHTML = '';
      const backBtn = document.createElement('button');
      backBtn.type = 'button';
      backBtn.className = 'cp-inline-back';
      backBtn.textContent = '← Utiliser un poste existant';
      backBtn.onclick = closeInline;
      inlineWrap.appendChild(backBtn);
      fieldset = global.PosteModal.buildFieldset(inlineWrap, null, 'cppi');
      fieldset.focus();
    };

    toggleBtn.onclick = openInline;

    return {
      posteInput,
      isCreatingInline: () => !!fieldset,
      validateInline: () => fieldset && fieldset.validate(),
      getInlineFields: () => fieldset && fieldset.getFields()
    };
  }

  function openPersonModal({ mode = 'create', person = null, originInput = null, initialName = '' } = {}) {
    const existing = document.getElementById('cp-person-modal');
    if (existing) existing.remove();
    const editing = mode === 'edit';
    const modal = document.createElement('div');
    modal.id = 'cp-person-modal';
    modal.className = 'cp-modal cp-person-modal';
    const TABS = [{ key: 'identite', label: 'Identité' }, { key: 'poste', label: 'Poste' }];
    modal.innerHTML = `<div class="cp-box" role="dialog" aria-modal="true">` +
      `<div class="cp-head"><h2 id="cpp-title">${editing ? 'Modifier une personne' : 'Créer une personne'}</h2><button type="button" data-cp-close aria-label="Fermer">×</button></div>` +
      `<div class="cp-tabbar" role="tablist">${TABS.map(t => `<button type="button" class="cp-tab" data-cp-tab="${t.key}" role="tab">${escapeHtml(t.label)}</button>`).join('')}</div>` +
      `<div class="cp-body"></div>` +
      `<p class="cp-error" role="alert"></p>` +
      `<div class="cp-actions"><button type="button" data-cp-cancel>Annuler</button><button type="button" data-cp-save>${editing ? 'Enregistrer les modifications' : 'Créer la personne'}</button></div>` +
      `</div>`;
    document.body.appendChild(modal);

    const body = modal.querySelector('.cp-body');
    const panels = {};
    TABS.forEach(t => {
      const panel = document.createElement('div');
      panel.className = 'cp-panel cp-grid cp-hidden';
      panel.dataset.cpPanel = t.key;
      body.appendChild(panel);
      panels[t.key] = panel;
    });

    const nom = document.createElement('div');
    nom.className = 'cp-field';
    nom.innerHTML = '<label for="cpp-nom">Nom *</label><input id="cpp-nom" type="text" required>';
    panels.identite.appendChild(nom);
    const prenom = document.createElement('div');
    prenom.className = 'cp-field';
    prenom.innerHTML = '<label for="cpp-prenom">Prénom *</label><input id="cpp-prenom" type="text" required>';
    panels.identite.appendChild(prenom);
    const email = document.createElement('div');
    email.className = 'cp-field';
    email.innerHTML = '<label for="cpp-email">Email</label><input id="cpp-email" type="email">';
    panels.identite.appendChild(email);
    const tel = document.createElement('div');
    tel.className = 'cp-field';
    tel.innerHTML = '<label for="cpp-tel">Tel</label><input id="cpp-tel" type="text">';
    panels.identite.appendChild(tel);

    const nomInput = modal.querySelector('#cpp-nom'), prenomInput = modal.querySelector('#cpp-prenom');
    if (editing) {
      nomInput.value = text(fieldValue(person, ['NOM', 'Nom']));
      prenomInput.value = text(fieldValue(person, ['Prenom', 'Prénom']));
    } else {
      const parts = text(initialName).trim().split(/\s+/);
      if (parts.length > 1) {
        nomInput.value = parts.pop();
        prenomInput.value = parts.join(' ');
      } else {
        nomInput.value = text(initialName).trim();
      }
    }
    modal.querySelector('#cpp-email').value = text(fieldValue(person, ['Email']));
    modal.querySelector('#cpp-tel').value = text(fieldValue(person, ['Telephone', 'Tel']));

    const posteTab = buildPosteTab(panels.poste, person);

    const tabButtons = {};
    modal.querySelectorAll('.cp-tab').forEach(btn => {
      tabButtons[btn.dataset.cpTab] = btn;
      btn.onclick = () => setActiveTab(btn.dataset.cpTab);
    });
    function setActiveTab(key) {
      if (!panels[key]) return;
      TABS.forEach(t => {
        panels[t.key].classList.toggle('cp-hidden', t.key !== key);
        tabButtons[t.key].classList.toggle('active', t.key === key);
      });
    }
    setActiveTab('identite');

    const close = () => modal.remove();
    modal.querySelector('[data-cp-close]').onclick = close;
    modal.querySelector('[data-cp-cancel]').onclick = close;
    modal.querySelector('[data-cp-save]').onclick = async () => {
      const error = modal.querySelector('.cp-error'), n = nomInput.value.trim(), p = prenomInput.value.trim();
      if (!n || !p) {
        error.textContent = 'Le nom et le prénom sont obligatoires.';
        setActiveTab('identite');
        return;
      }
      let posteId = Number(posteTab.posteInput.dataset.id) || null;
      if (posteTab.isCreatingInline()) {
        const posteError = posteTab.validateInline();
        if (posteError) {
          error.textContent = posteError;
          setActiveTab('poste');
          return;
        }
      } else if (!editing && !posteId) {
        error.textContent = 'Le poste est obligatoire.';
        setActiveTab('poste');
        return;
      }

      const button = modal.querySelector('[data-cp-save]');
      button.disabled = true;
      error.textContent = '';
      try {
        if (posteTab.isCreatingInline()) {
          const createdPoste = await global.PosteModal.persist('create', null, posteTab.getInlineFields());
          posteId = createdPoste.id;
        }
        const fields = {
          NOM: n,
          Prenom: p,
          Email: modal.querySelector('#cpp-email').value.trim(),
          Telephone: modal.querySelector('#cpp-tel').value.trim(),
          Poste2: posteId
        };
        let id;
        if (editing) {
          if (person?.id == null) throw new Error('Identifiant de la personne indisponible.');
          await updateRecord(person.id, fields);
          id = person.id;
        } else {
          const result = await addRecord(fields);
          id = global.CoreUtils.extractAddedRecordId(result);
          if (!id) {
            const found = tableRows('Annuaire').filter(row => row.NOM === n && row.Prenom === p).pop();
            id = found?.id;
          }
          if (!id) throw new Error('La personne a été créée mais son identifiant n’a pas pu être retrouvé.');
        }
        if (originInput) {
          originInput.value = `${p} ${n}`;
          originInput.dataset.id = String(id);
        }
        const annuaire = tableRows('Annuaire');
        const updated = { ...(person || {}), ...fields, id: Number(id) };
        if (global.CoreState?.setTable) {
          global.CoreState.setTable('Annuaire', editing
            ? annuaire.map(row => Number(row.id) === Number(id) ? updated : row)
            : [...annuaire, updated]);
        }
        close();
      } catch (e) {
        button.disabled = false;
        error.textContent = `${editing ? 'Modification' : 'Création'} impossible : ${e?.message || 'erreur inconnue'}`;
      }
    };
    nomInput.focus();
    return modal;
  }

  function openCreatePersonModal(initialName = '', originInput) {
    return openPersonModal({ mode: 'create', initialName, originInput });
  }

  function openEditPersonModal(person, originInput) {
    return openPersonModal({ mode: 'edit', person, originInput });
  }

  global.openCreatePersonModal = openCreatePersonModal;
  global.openEditPersonModal = openEditPersonModal;

  // Legacy fallback: refField() (project-modal.js) already renders its own "+ Créer"
  // button whenever an Annuaire search has no matches, so in practice this global
  // listener's own button is always pre-empted by the bail-out checks below before it
  // would run. Left in place defensively (e.g. an Annuaire field rendered by a future
  // component that doesn't implement that same fallback itself).
  const personRefKeys = new Set(['Porteur_1', 'Porteur_2', 'Porteur_3', 'VP_porteur_2', 'Accompagnateur']);

  function ensureCreateAction(input) {
    if (!input || !personRefKeys.has(input.dataset.ref)) return;
    const list = input.parentElement?.querySelector('.cp-ref-list');
    if (!list || list.querySelector('[data-create-person], [data-cp-create-person]') || list.querySelector('button[data-id]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.cpCreatePerson = 'true';
    button.textContent = `+ Créer "${input.value.trim()}"`;
    button.onclick = () => global.openCreatePersonModal(input.value.trim(), input);
    list.appendChild(button);
    list.classList.remove('cp-hidden');
  }

  document.addEventListener('input', event => setTimeout(() => ensureCreateAction(event.target), 0));
  document.addEventListener('focusin', event => setTimeout(() => ensureCreateAction(event.target), 0));
}(window));
