/**
 * Formulaire Grist du script UB Invest (24/11/2026) : le widget le crée et le publie lui-même (technique de Form+, vérifiée sur un vrai Grist),
 * pour que le script envoie ses lignes dans Import_Financements sans aucune étape à la main, sauf la copie du lien.
 *
 * Un formulaire public ne sait qu'AJOUTER des lignes à sa table ; son lien donne ce droit à qui le possède. Le widget le crée donc sans le publier,
 * et ne le publie que sur l'accord explicite de la personne (case cochée dans la page). Seule la clé du lien reste hors de portée d'un widget
 * (elle n'est lisible nulle part dans le document) : la personne la copie dans Grist (Partager → Copier le lien) pour le fichier de secrets du script.
 *
 * Tout passe par `io` ({ fetch(table) -> données en colonnes, apply(actions) -> valeurs renvoyées }) : testable sans Grist
 * (tests/suite-import-form.js). Une erreur de Grist n'est jamais avalée, sauf le renommage de la page (cosmétique).
 */
(function (global) {
  'use strict';

  const PAGE_NAME = 'Import financier : formulaire du script';
  // Champs d'aucun intérêt pour le script (le widget les calcule) : ils sont retirés du formulaire, qui ne garde que les colonnes de l'export, Lot et Lignes du lot.
  const HIDDEN_COLUMNS = ['Cle_ligne', 'Exporte_le', 'Retire_de_la_file'];

  const rowsOf = table => {
    if (!table || !table.id) return [];
    const keys = Object.keys(table).filter(key => key !== 'id');
    return table.id.map((id, i) => { const row = { id }; keys.forEach(key => { row[key] = table[key][i]; }); return row; });
  };
  const optionsOf = text => { try { return JSON.parse(text || '{}') || {}; } catch (err) { return {}; } };
  const isPublished = section => { const options = optionsOf(section.shareOptions); return !!(options.publish && options.form); };

  async function tableRefOf(io, tableId) {
    const table = rowsOf(await io.fetch('_grist_Tables')).find(item => item.tableId === tableId);
    return table ? table.id : null;
  }

  // État du formulaire de la table : { exists, sectionId, viewRef, pageName, published, count } ; { exists: false } quand il n'y en a pas.
  // Plusieurs formulaires sur la table : celui de la page du widget, sinon le premier publié, sinon le premier.
  async function read(io, tableId) {
    const tref = await tableRefOf(io, tableId);
    if (tref == null) return { exists: false, tableMissing: true };
    const sections = rowsOf(await io.fetch('_grist_Views_section')).filter(section => section.tableRef === tref && section.parentKey === 'form');
    if (!sections.length) return { exists: false };
    const views = rowsOf(await io.fetch('_grist_Views'));
    const found = sections.map(section => {
      const view = views.find(item => item.id === section.parentId);
      return { sectionId: section.id, viewRef: section.parentId, pageName: view ? view.name || '' : '', published: isPublished(section) };
    });
    const chosen = found.find(item => item.pageName === PAGE_NAME) || found.find(item => item.published) || found[0];
    return Object.assign({ exists: true, count: found.length }, chosen);
  }

  // Crée le formulaire (NON publié) sur une page neuve, retire les champs techniques et nomme la page. Ne crée rien s'il existe déjà un formulaire sur la table.
  async function create(io, tableId) {
    const current = await read(io, tableId);
    if (current.tableMissing) throw new Error(`la table ${tableId} n'existe pas encore`);
    if (current.exists) return Object.assign({ created: false }, current);
    const tref = await tableRefOf(io, tableId);
    const result = await io.apply([['CreateViewSection', tref, 0, 'form', null, tableId]]);
    const made = result && result[0];
    if (!made || made.sectionRef == null || made.viewRef == null) throw new Error('CreateViewSection : identifiant de section ou de page absent de la réponse de Grist');
    // CreateViewSection met un champ par colonne : on retire ceux des colonnes techniques.
    const hidden = rowsOf(await io.fetch('_grist_Tables_column')).filter(col => col.parentId === tref && HIDDEN_COLUMNS.includes(col.colId)).map(col => col.id);
    const fields = rowsOf(await io.fetch('_grist_Views_section_field')).filter(field => field.parentId === made.sectionRef && hidden.includes(field.colRef));
    if (fields.length) await io.apply(fields.map(field => ['RemoveRecord', '_grist_Views_section_field', field.id]));
    let renamed = true;
    try { await io.apply([['UpdateRecord', '_grist_Views', made.viewRef, { name: PAGE_NAME }]]); } catch (err) { renamed = false; }
    return { created: true, exists: true, sectionId: made.sectionRef, viewRef: made.viewRef, pageName: renamed ? PAGE_NAME : 'New page', published: false, renamed, removed: fields.length, count: 1 };
  }

  // Publie le formulaire : les mêmes écritures que le bouton « Publier » de Grist (une ligne de partage rattachée à la page, puis la section publiée).
  // Le serveur tire la clé au hasard : le formulaire répond tout de suite, mais seule la personne peut copier le lien.
  async function publish(io, form) {
    if (!form || !form.exists) throw new Error('aucun formulaire à publier : crée-le d\'abord');
    const pages = rowsOf(await io.fetch('_grist_Pages')), page = pages.find(item => item.viewRef === form.viewRef);
    if (!page) throw new Error('page du formulaire introuvable');
    let shareRef = page.shareRef || 0;
    // Un partage déjà rattaché à d'autres pages ne sert pas à celle-ci : un formulaire ne repart jamais avec la clé d'un autre.
    if (shareRef && pages.some(item => item.id !== page.id && item.shareRef === shareRef)) shareRef = 0;
    if (!shareRef) {
      const linkId = (global.crypto && global.crypto.randomUUID) ? global.crypto.randomUUID() : `ih-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const added = await io.apply([['AddRecord', '_grist_Shares', null, { linkId, options: JSON.stringify({ publish: true }) }]]);
      shareRef = added && added[0];
      if (!Number.isInteger(shareRef)) throw new Error('AddRecord _grist_Shares : identifiant du partage absent de la réponse de Grist');
      await io.apply([['UpdateRecord', '_grist_Pages', page.id, { shareRef }]]);
    } else await io.apply([['UpdateRecord', '_grist_Shares', shareRef, { options: JSON.stringify({ publish: true }) }]]);
    await io.apply([['UpdateRecord', '_grist_Views_section', form.sectionId, { shareOptions: JSON.stringify({ publish: true, form: true }) }]]);
    return Object.assign({}, form, { published: true });
  }

  // Dépublie : le lien cesse de fonctionner tout de suite (le script reçoit une erreur, rien ne se perd). Le formulaire et la page restent.
  async function unpublish(io, form) {
    if (!form || !form.exists) return form;
    await io.apply([['UpdateRecord', '_grist_Views_section', form.sectionId, { shareOptions: '{}' }]]);
    return Object.assign({}, form, { published: false });
  }

  global.ImportForm = { PAGE_NAME, HIDDEN_COLUMNS, read, create, publish, unpublish };
})(window);
