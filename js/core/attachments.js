/* =========================================================
   CORE — PIÈCES JOINTES GRIST (colonnes de type Attachments)
   =========================================================
   Partagé par la modale projet (liste en lecture) et la page Administratif
   (téléverser / afficher / télécharger / retirer la convention en PDF).

   Une colonne Attachments est une ReferenceList vers la table système _grist_Attachments :
   valeur brute ['L', id1, id2, ...], 0 ou absente quand elle est vide. Le nom du fichier
   vient de _grist_Attachments.fileName ; le contenu se lit et s'envoie par l'API REST du
   document, avec un jeton d'accès (getAccessToken).

   readOnly:false est VOLONTAIRE, pas un oubli : un jeton readOnly:true est plafonné côté
   serveur Grist au rôle Lecteur (AccessTokenCredential.docAuth, grist-core), quel que soit
   le vrai rôle de la personne. Une règle d'accès qui limite une pièce jointe à
   Éditeur/Propriétaire faisait alors échouer son propre téléchargement ("Cannot access
   attachment"), et l'envoi d'un fichier exige de toute façon le droit d'édition. Le jeton
   porte le vrai rôle, dure quelques minutes et n'est jamais stocké en dehors de la mémoire. */
(function (global) {
  'use strict';

  const text = value => value == null ? '' : String(value);

  // Numéros des pièces jointes d'une cellule : ['L', 3, 4] → [3, 4] ; 0, null ou vide → [].
  function ids(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(v => v !== 'L' && Number.isFinite(Number(v)) && Number(v) > 0).map(Number);
  }
  // Forme attendue par Grist pour une colonne Attachments / ReferenceList.
  const encode = list => ['L', ...list];

  // ── Noms de fichier ────────────────────────────────────────────────────────────────
  // Lus à la demande dans la table système _grist_Attachments, jamais chargée par
  // CoreGrist.loadAllTables() (qui ne couvre que les tables métier). loadMeta() ne garde rien
  // au-delà de l'appel en cours : la modale projet veut une table toujours à jour à chaque
  // ouverture, et les deux champs (Notification, Convention) la demandent au même instant.
  let metaInFlight = null;
  function loadMeta() {
    if (metaInFlight) return metaInFlight;
    const request = (async () => {
      const api = global.CoreGrist?.gristInstance;
      const meta = new Map();
      if (api) {
        try {
          const table = await api.docApi.fetchTable('_grist_Attachments');
          (table.id || []).forEach((id, i) => meta.set(id, text(table.fileName?.[i])));
        } catch (err) {
          // Déjà consigné par le diagnostic d'accès (fetchTable instrumenté) : les noms de fichiers ne s'afficheront pas.
          console.warn('Lecture des pièces jointes impossible :', global.CoreAccess ? global.CoreAccess.reason(err, { op: 'read', table: '_grist_Attachments' }) : err.message);
        }
      }
      return meta;
    })();
    metaInFlight = request;
    const release = () => { if (metaInFlight === request) metaInFlight = null; };
    request.then(release, release);
    return request;
  }

  // Cache des noms pour la page Administratif, qui redessine toutes ses cartes à chaque
  // interaction : sans lui, chaque rendu relirait _grist_Attachments. Un numéro de pièce jointe
  // ne change jamais de nom ; seuls les numéros inconnus déclenchent une lecture, et un numéro
  // introuvable (pièce jointe supprimée) n'est pas redemandé avant une minute.
  const names = new Map();
  const missingSince = new Map();
  const MISSING_RETRY_MS = 60 * 1000;
  const nameOf = id => names.get(Number(id)) || '';
  const rememberName = (id, name) => { if (text(name)) names.set(Number(id), text(name)); };
  async function ensureNames(wanted) {
    const now = Date.now();
    const unknown = ids(['L', ...wanted]).filter(id => !names.has(id) && !(missingSince.has(id) && now - missingSince.get(id) < MISSING_RETRY_MS));
    if (!unknown.length) return false;
    const meta = await loadMeta();
    unknown.forEach(id => {
      if (meta.get(id)) { names.set(id, meta.get(id)); missingSince.delete(id); }
      else missingSince.set(id, Date.now());
    });
    return true;
  }

  // ── Jeton d'accès à l'API REST du document ─────────────────────────────────────────
  let tokenCache = null;
  const TOKEN_REUSE_MS = 10 * 60 * 1000;
  async function getToken() {
    const api = global.CoreGrist?.gristInstance;
    if (!api) throw new Error('Grist non disponible');
    if (tokenCache && Date.now() < tokenCache.until) return tokenCache.value;
    const value = await api.docApi.getAccessToken({ readOnly: false });
    const ttl = Number(value && value.ttlMsecs);
    tokenCache = { value, until: Date.now() + Math.min(TOKEN_REUSE_MS, Number.isFinite(ttl) && ttl > 0 ? Math.max(0, ttl - 60 * 1000) : TOKEN_REUSE_MS) };
    return value;
  }

  // Adresse d'une pièce jointe. `cell` ({ tableId, colId, rowId }) permet à Grist de prouver
  // l'accès directement sur cette cellule plutôt que de chercher dans tout le document.
  // `inline` : affichage dans le navigateur (le PDF s'ouvre) au lieu d'un téléchargement forcé.
  function downloadUrl(token, id, cell, { inline = false } = {}) {
    const cellParams = cell ? `&tableId=${encodeURIComponent(cell.tableId)}&colId=${encodeURIComponent(cell.colId)}&rowId=${encodeURIComponent(cell.rowId)}` : '';
    return `${token.baseUrl}/attachments/${id}/download?auth=${encodeURIComponent(token.token)}${cellParams}${inline ? '&inline=1' : ''}`;
  }

  // Dirige la fenêtre déjà ouverte vers `url` ; si elle n'existe pas (fenêtre bloquée) ou refuse la
  // navigation (autre origine), en ouvre une nouvelle.
  function go(win, url) {
    if (win) { try { win.location.href = url; return; } catch (err) { /* navigation refusée : nouvelle fenêtre */ } }
    global.open(url, '_blank');
  }
  // La fenêtre est ouverte tout de suite (geste de la personne) pour que le navigateur ne la bloque
  // pas ; le jeton et le fichier n'arrivent qu'ensuite.
  function openWindow(message) {
    const win = global.open('', '_blank');
    if (win) {
      try { win.opener = null; } catch (err) { /* fenêtre d'une autre origine : sans importance */ }
      try { win.document.title = message; win.document.body.textContent = message; } catch (err) { /* fenêtre d'une autre origine */ }
    }
    return win;
  }
  const fail = (win, err) => {
    if (win) win.close();
    if (global.CoreUtils) global.CoreUtils.toastFailure(err, 'Ouverture impossible', { what: 'ouverture d\'une pièce jointe', table: '_grist_Attachments' });
  };

  // Télécharge une pièce jointe : nouvel onglet dirigé vers l'adresse de Grist, qui force le
  // téléchargement (Content-Disposition: attachment) sous le vrai nom du fichier.
  function open(id, cell, options) {
    const win = openWindow('Téléchargement en cours… vous pouvez fermer cet onglet.');
    return getToken().then(token => go(win, downloadUrl(token, id, cell, options))).catch(err => fail(win, err));
  }

  // Octets d'une pièce jointe (GET avec le jeton). L'API répond en CORS à toute origine non Grist
  // (Access-Control-Allow-Origin: *), à condition de ne pas envoyer de cookie : credentials:'omit'.
  // Sert à la visionneuse de PDF du widget (js/components/pdf-viewer.js) : une adresse de pièce jointe
  // de Grist ne s'affiche pas dans le navigateur (en-tête « Content-Security-Policy: sandbox », et
  // téléchargement forcé selon la version), il faut donc lire le fichier soi-même pour l'afficher.
  // Les erreurs disent ce qui s'est passé (réseau, droits, introuvable) : elles sont affichées telles
  // quelles dans la visionneuse. Grist répond 404 quand la règle d'accès refuse la lecture.
  async function fetchBytes(id, cell) {
    const token = await getToken();
    let response;
    try {
      response = await global.fetch(downloadUrl(token, id, cell), { credentials: 'omit' });
    } catch (err) {
      throw new Error('lecture impossible, vérifiez la connexion');
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status === 404) throw new Error(`pièce jointe introuvable ou accès refusé (HTTP ${response.status})`);
      throw new Error(`HTTP ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  // Envoie un fichier dans le document (POST multipart, champ « upload », droit d'édition requis) :
  // numéros des pièces jointes créées. Le fichier n'est rattaché à aucune cellule ici : c'est à
  // l'appelant d'écrire ces numéros dans la colonne.
  async function upload(file) {
    const { token, baseUrl } = await getToken();
    const form = new FormData();
    form.append('upload', file, file.name);
    let response;
    try {
      response = await global.fetch(`${baseUrl}/attachments?auth=${encodeURIComponent(token)}`, {
        method: 'POST', body: form, credentials: 'omit', headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
    } catch (err) {
      throw new Error('envoi impossible, vérifiez la connexion');
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('droit d\'édition requis pour ajouter un fichier');
      if (response.status === 413) throw new Error('fichier trop volumineux');
      throw new Error(`HTTP ${response.status}`);
    }
    let created;
    try { created = await response.json(); } catch (err) { created = null; }
    if (!Array.isArray(created) || !created.length || !created.every(id => Number.isInteger(id) && id > 0)) throw new Error('réponse inattendue de Grist');
    return created;
  }

  // Remet à zéro les mémoires (noms, jeton) : utilisé par les tests entre deux cas, et sans danger ailleurs
  // (la prochaine demande relit simplement la table / redemande un jeton).
  function resetCaches() { names.clear(); missingSince.clear(); tokenCache = null; metaInFlight = null; }

  global.CoreAttachments = { ids, encode, loadMeta, nameOf, rememberName, ensureNames, getToken, downloadUrl, open, fetchBytes, upload, resetCaches };
}(window));
