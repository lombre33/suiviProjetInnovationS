(function (global) {
  'use strict';

  const text = value => value == null ? '' : String(value);
  const rows = name => global.CoreState?.getTable ? (global.CoreState.getTable(name) || []) : [];
  const esc = value => global.CoreUtils.escapeHtml(value);

  const refId = value => {
    if (value && typeof value === 'object') return value.id ?? value.rowId;
    return value;
  };

  const ids = value => Array.isArray(value)
    ? value.flatMap(item => {
        const id = refId(item);
        return Array.isArray(id) ? id : (id == null ? [] : [id]);
      })
    : (value == null || value === '' ? [] : [refId(value)]);

  const label = (row, fields) => {
    for (const field of fields) if (row?.[field] != null && text(row[field])) return text(row[field]);
    return row?.id == null ? '' : text(row.id);
  };

  const api = () => {
    const value = global.CoreGrist?.gristInstance;
    if (!value) throw new Error('API Grist indisponible. Rechargez la page puis réessayez.');
    return value;
  };

  const fieldValue = (row, names) => {
    for (const name of names) if (row?.[name] != null) return row[name];
    return '';
  };

  const recordFromTable = (table, id) => {
    if (!table?.id) return null;
    const i = table.id.findIndex(value => Number(value) === Number(id));
    if (i < 0) return null;
    const record = { id: table.id[i] };
    Object.keys(table).filter(k => k !== 'id').forEach(k => { record[k] = table[k]?.[i]; });
    return record;
  };

  const extractAddedRecordId = response => global.CoreUtils.extractAddedRecordId(response);
  const acronym = (row) => text(row?.Acronyme);

  function calculatedPosteName({ titre, precisions, structureRow, employeurRow, id }) {
    const directionRow = structureRow
      ? rows('Structures').find(row => Number(row.id) === Number(structureRow.Directon_Structure_mere))
      : null;
    return `${text(titre)}  ${text(precisions)} - ${acronym(structureRow)} - ${acronym(directionRow)} - ${acronym(employeurRow)} ${id == null || id === '' ? '(nouveau)' : text(id)}`;
  }

  async function nextPosteId() {
    const table = await api().docApi.fetchTable('Postes2');
    const values = Array.isArray(table?.ID2) ? table.ID2 : [];
    const max = values.reduce((highest, value) => {
      const id = Number(value);
      return Number.isFinite(id) ? Math.max(highest, id) : highest;
    }, 0);
    return max + 1;
  }

  function refSelect(parent, id, labelText, table, fields, value) {
    const wrap = document.createElement('div');
    wrap.className = 'cp-field';
    wrap.innerHTML = `<label for="${id}">${esc(labelText)}</label><select id="${id}"><option value="">— Sélectionner —</option></select>`;
    const select = wrap.querySelector('select');
    parent.appendChild(wrap);
    const render = (items, selected) => {
      select.innerHTML = '<option value="">— Sélectionner —</option>' +
        items.map(row => `<option value="${esc(row.id)}">${esc(label(row, fields))}</option>`).join('');
      if (selected != null && selected !== '') select.value = String(refId(selected));
    };
    render(rows(table), value);
    return { wrap, select, render };
  }

  async function save(mode, poste, fields) {
    const action = mode === 'edit'
      ? ['UpdateRecord', 'Postes2', Number(poste.id), fields]
      : ['AddRecord', 'Postes2', null, fields];
    return api().docApi.applyUserActions([action]);
  }

  // Construit le jeu de champs Structure / Tutelle-Employeur / Titre / Précisions / Nom
  // calculé dans `parent`, avec le filtrage dynamique des tutelles et l'aperçu en direct
  // du nom de poste. Réutilisé tel quel par la modale autonome (openPosteModal) et par
  // l'onglet "Poste" de la fiche Personne (création à la volée, sans ouvrir de 2e modale) —
  // seul `idPrefix` change pour ne jamais dupliquer un id sur la page.
  function buildPosteFieldset(parent, poste, idPrefix) {
    const editing = !!poste;
    const id = suffix => `${idPrefix}-${suffix}`;

    const structure = refSelect(parent, id('structure'), 'Structure *', 'Structures', ['Acronyme', 'Nom_Complet'], fieldValue(poste, ['Structure2']));
    const employeur = refSelect(parent, id('employeur'), 'Tutelle / Employeur *', 'Etablissements', ['Acronyme', 'Nom_complet'], fieldValue(poste, ['Employeur_tutelle']));

    const titreWrap = document.createElement('div');
    titreWrap.className = 'cp-field cp-full';
    titreWrap.innerHTML = `<label for="${id('titre')}">Titre du poste *</label><input id="${id('titre')}" type="text" required>`;
    parent.appendChild(titreWrap);

    const precisionWrap = document.createElement('div');
    precisionWrap.className = 'cp-field cp-full';
    precisionWrap.innerHTML = `<label for="${id('precisions')}">Précisions du poste</label><textarea id="${id('precisions')}" rows="3"></textarea>`;
    parent.appendChild(precisionWrap);

    const nameWrap = document.createElement('div');
    nameWrap.className = 'cp-field cp-full';
    nameWrap.innerHTML = `<label for="${id('nom-poste')}">Nom du poste (calculé)</label><input id="${id('nom-poste')}" type="text" readonly aria-readonly="true" class="cp-readonly">`;
    parent.appendChild(nameWrap);

    const titreInput = titreWrap.querySelector('input');
    const precisionsInput = precisionWrap.querySelector('textarea');
    const nameInput = nameWrap.querySelector('input');

    titreInput.value = text(fieldValue(poste, ['Titre']));
    precisionsInput.value = text(fieldValue(poste, ['Precisions_Poste']));
    nameInput.value = text(fieldValue(poste, ['Nom_du_poste']));

    let estimatedId = editing ? poste?.id : null;

    const refreshPreview = () => {
      const structureRow = rows('Structures').find(row => Number(row.id) === Number(structure.select.value));
      const employeurRow = rows('Etablissements').find(row => Number(row.id) === Number(employeur.select.value));
      nameInput.value = calculatedPosteName({
        titre: titreInput.value,
        precisions: precisionsInput.value,
        structureRow, employeurRow,
        id: editing ? poste?.id : estimatedId
      });
    };

    const refreshEmployeurs = () => {
      const structureRow = rows('Structures').find(row => Number(row.id) === Number(structure.select.value));
      const allowed = ids(structureRow?.Toutes_les_tutelles);
      const all = rows('Etablissements');
      const primaryId = refId(structureRow?.Etablissement_Tutuelle_gestionaire);
      const filtered = allowed.length
        ? all.filter(row => allowed.some(id => Number(id) === Number(row.id)) || Number(row.id) === Number(primaryId))
        : [];
      employeur.render(filtered, primaryId);
      refreshPreview();
    };

    structure.select.addEventListener('change', refreshEmployeurs);
    employeur.select.addEventListener('change', refreshPreview);
    titreInput.addEventListener('input', refreshPreview);
    precisionsInput.addEventListener('input', refreshPreview);
    refreshEmployeurs();

    if (!editing) {
      nextPosteId().then(newId => { estimatedId = newId; refreshPreview(); }).catch(() => {});
    }

    return {
      structureSelect: structure.select,
      employeurSelect: employeur.select,
      titreInput, precisionsInput, nameInput,
      focus() { structure.select.focus(); },
      getFields() {
        return {
          Structure2: Number(structure.select.value.trim()) || 0,
          Employeur_tutelle: Number(employeur.select.value.trim()) || 0,
          Titre: titreInput.value.trim(),
          Precisions_Poste: precisionsInput.value.trim()
        };
      },
      validate() {
        const fields = this.getFields();
        if (!fields.Structure2 || !fields.Employeur_tutelle || !fields.Titre) {
          return 'Structure, tutelle/employeur et titre sont obligatoires.';
        }
        return null;
      }
    };
  }

  // Enregistre un poste (Create ou Update), calcule son nom d'affichage et reflète le
  // changement dans CoreState.Postes2 — factorisé pour que le bouton "Créer le poste" de
  // la modale autonome et le flux de création à la volée (fiche Personne) partagent
  // exactement la même logique plutôt que de la dupliquer.
  async function persistPoste(mode, poste, fields) {
    const result = await save(mode, poste, fields);
    let id = mode === 'edit' ? poste.id : extractAddedRecordId(result);
    if (!id && mode !== 'edit') {
      const found = rows('Postes2').filter(row => row.Titre === fields.Titre && row.Precisions_Poste === fields.Precisions_Poste).pop();
      id = found?.id;
    }
    if (!id) throw new Error('Le poste a été enregistré mais son identifiant n’a pas pu être retrouvé.');

    let calculated = '';
    try {
      calculated = text(recordFromTable(await api().docApi.fetchTable('Postes2'), id)?.Nom_du_poste);
    } catch (_) {}
    if (!calculated) {
      const structureRow = rows('Structures').find(row => Number(row.id) === Number(fields.Structure2));
      const employeurRow = rows('Etablissements').find(row => Number(row.id) === Number(fields.Employeur_tutelle));
      calculated = calculatedPosteName({ titre: fields.Titre, precisions: fields.Precisions_Poste, structureRow, employeurRow, id });
    }

    const updated = { ...(poste || {}), ...fields, id: Number(id), ...(calculated ? { Nom_du_poste: calculated } : {}) };
    const current = rows('Postes2');
    if (global.CoreState?.setTable) {
      global.CoreState.setTable('Postes2', mode === 'edit'
        ? current.map(row => Number(row.id) === Number(id) ? updated : row)
        : [...current, updated]);
    }
    return updated;
  }

  function openPosteModal({ mode = 'create', poste = null, initialName = '', originInput = null } = {}) {
    const old = document.getElementById('cp-poste-modal');
    if (old) old.remove();
    const editing = mode === 'edit', modal = document.createElement('div');
    modal.id = 'cp-poste-modal';
    modal.className = 'cp-modal cp-person-modal cp-poste-modal';
    modal.innerHTML = `<div class="cp-box" role="dialog" aria-modal="true">` +
      `<div class="cp-head"><h2>${editing ? 'Modifier un poste' : 'Créer un poste'}</h2><button type="button" data-cp-close aria-label="Fermer">×</button></div>` +
      `<div class="cp-body"><div class="cp-grid" id="cpp-poste-form"></div></div>` +
      `<p class="cp-error" role="alert"></p>` +
      `<div class="cp-actions"><button type="button" data-cp-cancel>Annuler</button><button type="button" data-cp-save>${editing ? 'Enregistrer les modifications' : 'Créer le poste'}</button></div>` +
      `</div>`;
    document.body.appendChild(modal);
    const form = modal.querySelector('#cpp-poste-form');
    const fieldset = buildPosteFieldset(form, poste, 'cpp');
    if (!editing && initialName) fieldset.nameInput.value = initialName;

    const close = () => modal.remove();
    modal.querySelector('[data-cp-close]').onclick = close;
    modal.querySelector('[data-cp-cancel]').onclick = close;

    modal.querySelector('[data-cp-save]').onclick = async () => {
      const error = modal.querySelector('.cp-error'), button = modal.querySelector('[data-cp-save]');
      const validationError = fieldset.validate();
      if (validationError) {
        error.textContent = validationError;
        return;
      }
      button.disabled = true;
      error.textContent = '';
      try {
        const updated = await persistPoste(mode, poste, fieldset.getFields());
        if (originInput) {
          originInput.value = updated.Nom_du_poste || text(poste?.Nom_du_poste) || '';
          originInput.dataset.id = String(updated.id);
        }
        close();
      } catch (e) {
        button.disabled = false;
        error.textContent = `${editing ? 'Modification' : 'Création'} impossible : ${e?.message || 'erreur inconnue'}`;
      }
    };

    fieldset.focus();
    return modal;
  }

  global.openPosteModal = openPosteModal;
  global.openCreatePosteModal = (initialName = '', originInput) => openPosteModal({ mode: 'create', initialName, originInput });
  global.openEditPosteModal = (poste, originInput) => openPosteModal({ mode: 'edit', poste, originInput });
  global.PosteModal = { open: openPosteModal, buildFieldset: buildPosteFieldset, persist: persistPoste };
}(window));
