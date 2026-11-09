/**
 * Accès au document Grist : pièces jointes (REST, jeton d'accès), mises à jour de lignes, et table
 * privée de la signature. Rien ne touche au DOM ici.
 *
 * Sécurité : TOUT accès à l'image de la signature passe par `requireSecured()`, qui relit l'état réel
 * de la protection (la table et sa règle d'accès existent, et on peut lire les règles du document,
 * donc on est propriétaire) avant de lire ou d'écrire quoi que ce soit. Jamais de lecture de l'image
 * « au cas où » : sans protection en place, l'image n'est ni téléchargée ni importée.
 */
(function (global) {
  'use strict';

  const { SigError, tableRows, attachmentIds, encodeAttachments, sniffImage } = global.SigUtil;
  const A = global.SigAcl;

  const MAX_IMAGE = 2 * 1024 * 1024; // une signature n'a pas besoin de plus
  const MAX_PDF = 30 * 1024 * 1024;
  const MIME = { png: 'image/png', jpeg: 'image/jpeg' };

  function create({ grist, fetchImpl, clock = Date.now } = {}) {
    const docApi = grist.docApi;
    const doFetch = fetchImpl || ((...args) => global.fetch(...args));
    let tokenCache = null;
    let tablePromise = null;

    // Jeton d'accès à l'API REST du document. readOnly:false est voulu : un jeton readOnly:true est
    // plafonné au rôle Lecteur côté Grist, que la règle de la table de la signature refuse. Le jeton
    // dure quelques minutes, n'est jamais stocké ni affiché, seulement joint aux requêtes.
    async function getToken() {
      if (tokenCache && tokenCache.until > clock()) return tokenCache.value;
      const value = await docApi.getAccessToken({ readOnly: false });
      tokenCache = { value, until: clock() + Math.max(0, (value.ttlMsecs || 0) - 60000) };
      return value;
    }

    // Table à laquelle ce widget est lié (celle des notifications).
    function mainTableId() {
      if (!tablePromise) {
        tablePromise = Promise.resolve(grist.selectedTable.getTableId());
        tablePromise.catch(() => { tablePromise = null; });
      }
      return tablePromise;
    }

    async function request(path, { query, ...init } = {}) {
      const { token, baseUrl } = await getToken();
      const params = new URLSearchParams(query || {});
      params.set('auth', token);
      let response;
      try {
        response = await doFetch(`${baseUrl}${path}?${params}`, { credentials: 'omit', ...init });
      } catch (err) {
        throw new SigError('network', err && err.message);
      }
      if (!response.ok) {
        const code = response.status === 401 || response.status === 403 ? 'denied' : response.status === 404 ? 'attachment-missing' : 'http';
        throw new SigError(code, `HTTP ${response.status} sur ${path}`, { status: response.status });
      }
      return response;
    }

    // Octets d'une pièce jointe. `cell` ({ tableId, colId, rowId }) dit à Grist où prouver l'accès.
    async function download(attachmentId, cell) {
      const query = cell ? { tableId: cell.tableId, colId: cell.colId, rowId: String(cell.rowId) } : undefined;
      const response = await request(`/attachments/${attachmentId}/download`, { query });
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > MAX_PDF) throw new SigError('too-big', 'Fichier trop volumineux');
      return bytes;
    }

    // Envoie un fichier dans le document : numéro de la pièce jointe créée.
    async function upload(bytes, fileName, mime) {
      const form = new FormData();
      form.append('upload', new Blob([bytes], { type: mime }), fileName);
      const response = await request('/attachments', { method: 'POST', body: form, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      const ids = await response.json();
      if (!Array.isArray(ids) || !Number.isInteger(ids[0])) throw new SigError('upload-failed', 'Réponse inattendue de Grist');
      return ids[0];
    }

    // Retire du document les pièces jointes qu'aucune cellule n'utilise plus (propriétaire seul) : une
    // signature remplacée ou supprimée ne doit pas rester dans le document. Au mieux : un échec ne
    // doit pas faire échouer l'opération, il est signalé par la valeur rendue.
    async function purgeUnused() {
      try {
        await request('/attachments/removeUnused', { method: 'POST', query: { expiredOnly: 'false' }, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        return true;
      } catch (err) {
        return false;
      }
    }

    async function updateRow(rowId, fields) {
      await docApi.applyUserActions([['UpdateRecord', await mainTableId(), rowId, fields]]);
    }

    // --------------------------------------------------------- table privée de la signature

    // État réel du document : règles d'accès, table de la signature et sa ligne. Grist ne montre les
    // règles d'accès qu'aux propriétaires (aux autres, ces tables arrivent VIDES, sans erreur) : on ne
    // s'en sert donc jamais pour dire qui est propriétaire. C'est la règle elle-même qui le dit : la
    // table de la signature refuse sa lecture à qui ne l'est pas, et ce refus veut dire « pas propriétaire ».
    async function loadMeta() {
      const none = { owner: false, resources: [], rules: [], columns: null, row: null };
      let resources;
      let rules;
      let tables;
      try {
        resources = tableRows(await docApi.fetchTable('_grist_ACLResources'));
        rules = tableRows(await docApi.fetchTable('_grist_ACLRules'));
        tables = tableRows(await docApi.fetchTable('_grist_Tables')).map(row => row.tableId);
      } catch (err) {
        global.console.warn('Lecture des règles d’accès impossible', err);
        return none;
      }
      let columns = null;
      let row = null;
      if (tables.includes(A.TABLE)) {
        let data;
        try {
          data = await docApi.fetchTable(A.TABLE);
        } catch (err) {
          return none; // refusé par la règle : pas propriétaire (ou Grist injoignable : refuser reste le bon réflexe)
        }
        columns = Object.keys(data);
        const first = tableRows(data)[0];
        if (first) row = { id: first.id, imageIds: attachmentIds(first[A.COL.image]), anchor: String(first[A.COL.anchor] || '').trim() || A.DEFAULT_ANCHOR };
      }
      return { owner: true, resources, rules, columns, row };
    }

    // 'not-owner' | 'no-table' | 'no-rules' | 'ok', plus la ligne de la signature et l'avertissement « éditeurs ».
    async function readSetup() {
      const meta = await loadMeta();
      if (!meta.owner) return { status: 'not-owner', row: null, editorsEditStructure: false };
      return {
        status: A.status(meta),
        row: meta.row,
        anchor: meta.row ? meta.row.anchor : A.DEFAULT_ANCHOR,
        editorsEditStructure: A.editorsEditStructure(meta.resources, meta.rules),
      };
    }

    async function requireSecured() {
      const setup = await readSetup();
      if (setup.status === 'not-owner') throw new SigError('not-owner', 'Réservé au propriétaire du document');
      if (setup.status !== 'ok') throw new SigError('not-secured', 'La table de la signature n’est pas protégée');
      return setup;
    }

    // Crée la table (ou ses colonnes manquantes) PUIS pose la règle. Poser une règle fait recharger le
    // document : la table existe donc avant, et aucune image n'y entre tant que la règle n'est pas là.
    async function secure() {
      const meta = await loadMeta();
      if (!meta.owner) throw new SigError('not-owner', 'Réservé au propriétaire du document');
      try {
        const tableActions = A.tableActions(meta.columns);
        if (tableActions.length) await docApi.applyUserActions(tableActions);
        const resources = tableRows(await docApi.fetchTable('_grist_ACLResources'));
        const rules = tableRows(await docApi.fetchTable('_grist_ACLRules'));
        const ruleActions = A.ruleActions(resources, rules);
        if (ruleActions.length) await docApi.applyUserActions(ruleActions);
      } catch (err) {
        // Un éditeur peut lire la table (rien ne la protège encore) mais Grist lui refuse de poser des règles.
        if (/owner|access|permission|denied|not allowed|forbidden/i.test(String(err && err.message))) throw new SigError('not-owner', err.message);
        throw err;
      }
    }

    async function writeRow(row, fields) {
      await docApi.applyUserActions([row ? ['UpdateRecord', A.TABLE, row.id, fields] : ['AddRecord', A.TABLE, null, fields]]);
    }

    // Image de la signature et repère de texte. `bytes` est null tant qu'aucune image n'est importée.
    async function loadSignature() {
      const setup = await requireSecured();
      const anchor = setup.anchor;
      const imageId = setup.row && setup.row.imageIds[0];
      if (!imageId) return { anchor, bytes: null, imageId: null };
      const bytes = await download(imageId, { tableId: A.TABLE, colId: A.COL.image, rowId: setup.row.id });
      if (!sniffImage(bytes)) throw new SigError('image-invalid', 'L’image enregistrée est illisible');
      return { anchor, bytes, imageId };
    }

    // `bytes` : PNG ou JPEG, jamais autre chose (le type se lit dans les octets).
    async function saveSignature(bytes) {
      const kind = sniffImage(bytes);
      if (!kind) throw new SigError('image-invalid', 'Image PNG ou JPEG attendue');
      if (bytes.length > MAX_IMAGE) throw new SigError('image-too-big', 'Image trop volumineuse');
      const setup = await requireSecured();
      const id = await upload(bytes, kind === 'png' ? 'signature.png' : 'signature.jpg', MIME[kind]);
      await writeRow(setup.row, { [A.COL.image]: encodeAttachments([id]) });
      await purgeUnused();
    }

    async function removeSignature() {
      const setup = await requireSecured();
      if (!setup.row) return;
      await writeRow(setup.row, { [A.COL.image]: encodeAttachments([]) });
      await purgeUnused();
    }

    async function saveAnchor(text) {
      const setup = await requireSecured();
      await writeRow(setup.row, { [A.COL.anchor]: String(text || '').trim() || A.DEFAULT_ANCHOR });
    }

    return {
      getToken, mainTableId, download, upload, purgeUnused, updateRow,
      readSetup, requireSecured, secure, loadSignature, saveSignature, removeSignature, saveAnchor,
    };
  }

  global.SigIO = { create, MAX_IMAGE };
})(window);
