/** Page « par instance » — schéma Grist, lecture/écriture et normalisation des lignes.
 *
 * Aucun DOM ici : js/pages/page-instances.js rend ce que ce fichier prépare, et
 * js/pages/instances-logic.js porte les règles pures (créneaux, conflits, validations).
 *
 * Tables créées à la première ouverture de la page (CoreGrist.ensureTable/ensureColumns, comme
 * Preferences_Widget et les colonnes de la page Administratif) : Instance_Invites, Instance_Points,
 * Instance_Relectures, Instance_Validations, Export_VP ; colonnes ajoutées à Instances et à
 * Suivi_Instance (une ligne de Suivi_Instance = une séance). Règles Grist respectées partout :
 * colonnes formule jamais écrites, références écrites en identifiants (RefList en ['L', ...ids]),
 * dates en secondes UTC à minuit.
 */
(function (global) {
  'use strict';
  const L = global.InstancesLogic;
  const text = v => v == null ? '' : String(v);
  const refId = v => (v && typeof v === 'object') ? (Number(v.id) || 0) : (Number(v) || 0);
  // RefList brute Grist : ['L', 1, 2] (ou null) ; ChoiceList : ['L', 'a', 'b'].
  const refList = v => Array.isArray(v) ? v.filter(x => typeof x === 'number' && x > 0) : [];
  const choiceList = v => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x !== 'L') : [];
  const toList = ids => ['L'].concat(ids);

  function choiceCol(id, values) { return { id, type: 'Choice', isFormula: false, widgetOptions: JSON.stringify({ choices: values }) }; }
  const col = (id, type, extra) => Object.assign({ id, type, isFormula: false }, extra || {});
  const C = L.CHOICES;
  const values = map => Object.keys(map).map(k => map[k]);

  // --- Colonnes ajoutées aux tables existantes (description = bulle d'aide, voir HelpTooltip) ---
  const INSTANCES_COLUMNS = [
    col('Heure_debut', 'Text', { description: "Heure de début habituelle des séances de cette instance (HH:MM). Préremplie dans chaque nouvelle séance." }),
    col('Duree_min', 'Int', { description: "Durée habituelle d'une séance, en minutes. L'heure de fin se calcule à partir de l'heure de début et sert aux créneaux de présence des invités." }),
    col('Etapes_actives', 'ChoiceList', { description: "Étapes suivies par cette instance dans la page Instances (ordre du jour, invités, mail d'invitation, compte rendu, envoi du compte rendu, notifications liées). Vide : toutes les étapes.", widgetOptions: JSON.stringify({ choices: L.STEPS.map(s => s.stored) }) }),
    col('Relecteurs_CR', 'RefList:Annuaire', { description: "Personnes qui relisent chaque compte rendu de cette instance avant sa validation." }),
    col('Invites_permanents', 'RefList:Annuaire', { description: "Listing de base de l'instance, repris dans chaque nouvelle séance. Les personnes ajoutées sur un point restent propres à leur séance." }),
    col('Modele_invitation', 'Text', { description: "Nom du modèle de mail d'invitation (modèle de type e-mail de Publipostage+, rangé dans GFS)." }),
    col('Modele_CR', 'Text', { description: "Nom du modèle de mail d'envoi du compte rendu (modèle de type e-mail de Publipostage+, rangé dans GFS)." })
  ];
  const SEANCE_COLUMNS = [
    col('Mail_invitation_le', 'Date', { description: "Date d'envoi du mail d'invitation à la séance. Une date renseignée vaut validation de l'étape « Mail d'invitation »." }),
    col('CR_V0_le', 'Date', { description: "Date à laquelle la première version (V0) du compte rendu a été rédigée." }),
    col('CR_V0_par', 'Ref:Annuaire', { description: "Personne qui a coché « V0 rédigée »." }),
    col('CR_PDF', 'Attachments', { description: "Version PDF du compte rendu, exportée à la main depuis GFS une fois le texte bien relu. Alimente le bouton « Télécharger le CR » de la page Instances (c'est le dernier fichier de la cellule qui est proposé)." }),
    col('Mail_CR_le', 'Date', { description: "Date d'envoi du mail du compte rendu. Une date renseignée vaut validation de l'étape « Envoi du compte rendu »." })
  ];
  const PREFS_COLUMNS = [
    col('Inst_instance', 'Text'), col('Inst_seances', 'Text'), col('Inst_etape', 'Text'), col('Inst_vue', 'Text'), col('Inst_odj_vue', 'Text'), col('Inst_cadre', 'Text'), col('Inst_tri_invites', 'Text')
  ];

  // --- Tables propres à la page (ordre = ordre de création : les références doivent exister) ---
  const NEW_TABLES = [
    { id: 'Instance_Invites', cols: [
      col('Seance', 'Ref:Suivi_Instance'), col('Personne', 'Ref:Annuaire'), choiceCol('Origine', values(C.origine)),
      col('Ecrit_le', 'Date'), col('Passage_envoye_le', 'Date'), col('Passage_envoye_heure', 'Text'),
      choiceCol('Reponse', values(C.reponse)), col('Dispo_de', 'Text'), col('Dispo_a', 'Text'), col('Commentaire', 'Text'), choiceCol('Appel', values(C.appel))
    ] },
    { id: 'Instance_Points', cols: [
      col('Seance', 'Ref:Suivi_Instance'), col('Ordre', 'Int'), col('Titre', 'Text'), choiceCol('Nature', values(C.nature)),
      col('Duree_min', 'Int'), col('Projets', 'RefList:Projets'), col('Invites', 'RefList:Instance_Invites'),
      col('Presentateurs', 'RefList:Annuaire', { description: "Personnes qui présentent ce point à la séance (une ou plusieurs). Indépendant de la liste des invités du point : choisir un présentateur ne l'invite pas." }),
      choiceCol('Lien_type', values(C.lien)), col('Lien', 'Text'),
      col('Parent', 'Ref:Instance_Points', { description: "Point de l'ordre du jour dont cette ligne est un sous-point (vide pour un point). Un sous-point a les mêmes propriétés qu'un point et se découpe dans la durée de son parent." })
    ] },
    { id: 'Instance_Relectures', cols: [
      col('Seance', 'Ref:Suivi_Instance'), col('Personne', 'Ref:Annuaire'), choiceCol('Statut', values(C.relecture)), col('Relu_le', 'Date')
    ] },
    { id: 'Instance_Validations', cols: [
      col('Seance', 'Ref:Suivi_Instance'), col('Etape', 'Text'), col('Date', 'Date'), col('Par', 'Ref:Annuaire')
    ] },
    // Table plate lue par Sync+ vers le document du VP (outil de signature). Écrites par le widget : Seance, Projet,
    // A_envoyer, Mis_a_dispo_le, Mis_a_dispo_par. Formules : jamais écrites. Retour de Sync+ : Signee, Signee_le, PDF_signe.
    { id: 'Export_VP', cols: [
      col('Seance', 'Ref:Suivi_Instance'), col('Projet', 'Ref:Projets'), col('A_envoyer', 'Bool'),
      col('Mis_a_dispo_le', 'Date'), col('Mis_a_dispo_par', 'Ref:Annuaire'),
      col('Instance', 'Text', { isFormula: true, formula: 'getattr($Seance.Instance, "Instances", "") if $Seance else ""' }),
      col('Date_instance', 'Date', { isFormula: true, formula: '$Seance.date if $Seance else None' }),
      col('Acronyme', 'Text', { isFormula: true, formula: '$Projet.Acronyme if $Projet else ""' }),
      col('Porteur', 'Text', { isFormula: true, formula: 'getattr($Projet.Porteur_1, "nom_et_Prenom", "") if $Projet else ""' }),
      col('Labo_porteur', 'Text', { isFormula: true, formula: 'try:\n  return getattr($Projet.Porteur_1.Poste2.Structure2, "Nom_Complet", "") if $Projet else ""\nexcept Exception:\n  return ""' }),
      col('Montant', 'Numeric', { isFormula: true, formula: 'getattr($Projet, "Montant_attribue_Total", 0) or 0 if $Projet else 0' }),
      col('PDF_notification', 'Attachments'),
      col('Signee', 'Bool'), col('Signee_le', 'DateTime:Europe/Paris'), col('PDF_signe', 'Attachments')
    ] }
  ];

  const READ_TABLES = ['Instances', 'Suivi_Instance', 'Lieux', 'GFS_Fichiers', 'Instance_Invites', 'Instance_Points', 'Instance_Relectures', 'Instance_Validations', 'Export_VP'];

  async function ensureSchema() {
    const api = global.CoreGrist;
    for (const table of NEW_TABLES) {
      const created = await api.ensureTable(table.id, table.cols.map(c => { const { description, ...info } = c; return info; }));
      if (!created) await api.ensureColumns(table.id, table.cols);
    }
    await api.ensureColumns('Instances', INSTANCES_COLUMNS);
    await api.ensureColumns('Suivi_Instance', SEANCE_COLUMNS);
  }

  // Lit les tables de la page ; une table absente (Lieux, GFS_Fichiers) donne [] plutôt qu'une erreur.
  async function fetchAll() {
    const raw = {};
    await Promise.all(READ_TABLES.map(async name => {
      try { raw[name] = await global.CoreGrist.getTable(name); } catch (err) { raw[name] = []; if (name === 'Instances' || name === 'Suivi_Instance') raw[name + '__error'] = err.message; }
    }));
    await fetchComposition(raw);
    return raw;
  }
  // Table « Composition instances » (invités par défaut des instances) : retrouvée par son nom, lue sans jamais bloquer la page.
  async function fetchComposition(raw) {
    raw.Composition = []; raw.Composition__id = ''; raw.Composition__types = {}; raw.Composition__refNames = {};
    try {
      // Schéma déjà connu d'abord (aucun appel) ; une absence ne prouve rien (voir CoreGrist) : on interroge alors Grist.
      let id = L.findCompositionTable(global.CoreGrist.knownTableIds ? global.CoreGrist.knownTableIds() : []);
      if (!id && global.CoreGrist.gristInstance) id = L.findCompositionTable(await global.CoreGrist.gristInstance.docApi.listTables());
      if (!id) return;
      raw.Composition__id = id; raw.Composition = await global.CoreGrist.getTable(id);
      // Types de colonnes (cache des métadonnées) : une référence ne désigne une instance que si elle pointe vers la table Instances.
      raw.Composition__types = (global.CoreGrist.columnTypes && global.CoreGrist.columnTypes(id)) || {};
      // Référence vers une AUTRE table (ni Instances ni Annuaire) : on lit son libellé, jamais son numéro (numéros sans rapport avec Instances).
      const targets = [];
      Object.keys(raw.Composition__types).forEach(col => { const m = /^Ref(?:List)?:(.+)$/.exec(raw.Composition__types[col]); if (m && ['Instances', 'Annuaire'].indexOf(m[1]) < 0 && targets.indexOf(m[1]) < 0) targets.push(m[1]); });
      await Promise.all(targets.slice(0, 3).map(async table => {
        try {
          const names = {}; (await global.CoreGrist.getTable(table)).forEach(row => { const label = refRowLabel(row); if (label) names[row.id] = label; });
          raw.Composition__refNames[table] = names;
        } catch (err) { /* table illisible : sa colonne sera ignorée */ }
      }));
    } catch (err) { raw.Composition__error = err.message; }
  }
  const REF_LABEL_KEYS = ['Instances', 'Instance', 'Nom', 'Nom_Complet', 'Libelle', 'Intitule', 'Name', 'Acronyme'];
  function refRowLabel(row) {
    for (const key of REF_LABEL_KEYS) if (text(row[key]).trim()) return text(row[key]).trim();
    const other = Object.keys(row).find(k => k !== 'id' && typeof row[k] === 'string' && row[k].trim() && !k.startsWith('gristHelper'));
    return other ? row[other].trim() : '';
  }

  // --- Écritures : commit([{ op:'add'|'update'|'remove', table, id?, fields? }]) ---
  // Mises à jour et suppressions s'appliquent tout de suite au cache local (l'écran suit sans attendre Grist) ;
  // un lot qui contient un ajout attend la réponse de Grist (pour connaître l'identifiant créé). Un échec recharge tout.
  function createStore(raw, hooks) {
    const rows = name => raw[name] || (raw[name] = []);
    async function commit(ops) {
      const api = global.CoreGrist && global.CoreGrist.gristInstance;
      if (!api) throw new Error('Grist non disponible');
      const hasAdd = ops.some(o => o.op === 'add');
      const apply = () => ops.forEach(o => {
        if (o.op === 'update') { const row = rows(o.table).find(r => r.id === o.id); if (row) Object.assign(row, o.fields); }
        if (o.op === 'remove') { const list = rows(o.table); const i = list.findIndex(r => r.id === o.id); if (i >= 0) list.splice(i, 1); }
      });
      const actions = ops.map(o => o.op === 'add' ? ['AddRecord', o.table, null, o.fields] : (o.op === 'update' ? ['UpdateRecord', o.table, o.id, o.fields] : ['RemoveRecord', o.table, o.id]));
      if (!hasAdd) { apply(); if (hooks && hooks.changed) hooks.changed(); }
      try {
        const result = await api.docApi.applyUserActions(actions);
        const ids = [];
        if (hasAdd) {
          apply();
          const ret = (result && result.retValues) || [];
          ops.forEach((o, i) => {
            if (o.op !== 'add') return;
            const id = typeof ret[i] === 'number' ? ret[i] : (ops.filter(x => x.op === 'add').length === 1 ? global.CoreUtils.extractAddedRecordId(result) : null);
            ids.push(id);
            rows(o.table).push(Object.assign({ id }, o.fields));
          });
          if (hooks && hooks.changed) hooks.changed();
        }
        return ids;
      } catch (err) {
        if (hooks && hooks.failed) hooks.failed(err);
        throw err;
      }
    }
    return { commit, rows };
  }

  // --- Normalisation ---
  const LIEU_LABEL_KEYS = ['Nom', 'Nom_Complet', 'Libelle', 'Lieu', 'Salle', 'Name', 'Intitule', 'Acronyme'];
  const LIEU_SUB_KEYS = ['Capacite', 'Nb_places', 'Places', 'Description'];
  function lieuLabel(row) {
    for (const key of LIEU_LABEL_KEYS) if (text(row[key]).trim()) return text(row[key]).trim();
    const other = Object.keys(row).find(k => k !== 'id' && typeof row[k] === 'string' && row[k].trim() && !k.startsWith('gristHelper'));
    return other ? row[other].trim() : 'Lieu ' + row.id;
  }
  function lieuSub(row) {
    for (const key of LIEU_SUB_KEYS) {
      const v = text(row[key]).trim();
      if (v) return key === 'Capacite' || key === 'Nb_places' || key === 'Places' ? v + ' places' : v;
    }
    return '';
  }
  function instanceName(row) {
    for (const key of ['Instances', 'Nom', 'Instance', 'Nom_Complet', 'Acronyme']) if (text(row[key]).trim()) return text(row[key]).trim();
    return 'Instance ' + row.id;
  }
  function personName(row) {
    return text(row.nom_et_Prenom).trim() || [row.Prenom, row.NOM].map(text).filter(Boolean).join(' ') || 'Personne ' + row.id;
  }
  const keyOfStep = {};
  L.STEPS.forEach(s => { keyOfStep[s.stored] = s.key; });

  // env = { annuaire, postes, projets, notifications } : tables déjà chargées par le widget (CoreState).
  function buildModel(raw, env) {
    const postesById = new Map((env.postes || []).map(p => [p.id, text(p.Nom_du_poste).replace(/\s+/g, ' ').trim()]));
    const people = (env.annuaire || []).map(a => { const name = personName(a), poste = postesById.get(refId(a.Poste2)) || '', email = text(a.Email); return { id: a.id, name, poste, email, search: [name, [a.Prenom, a.NOM].map(text).join(' '), poste, email].join(' ') }; })
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const peopleById = {}; people.forEach(p => { peopleById[p.id] = p; });
    const notifByProject = {};
    (env.notifications || []).forEach(n => { notifByProject[refId(n.Projet)] = text(n.notifications_Statut); });
    const projects = (env.projets || []).filter(p => text(p.Acronyme).trim()).map(p => ({ id: p.id, acro: text(p.Acronyme).trim(), titre: text(p.Projet).trim(), notif: notifByProject[p.id] || text(p.Statut_Macro) }))
      .sort((a, b) => a.acro.localeCompare(b.acro, 'fr'));
    const projectsById = {}; projects.forEach(p => { projectsById[p.id] = p; });
    const lieux = (raw.Lieux || []).map(r => ({ id: r.id, nom: lieuLabel(r), sub: lieuSub(r) })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    const lieuxById = {}; lieux.forEach(l => { lieuxById[l.id] = l; });
    const gfs = (raw.GFS_Fichiers || []).filter(f => !f.SupprimeLe && text(f.Nom).trim())
      .map(f => ({ id: f.id, ident: text(f.Identifiant) || String(f.id), nom: text(f.Nom).trim(), attachmentIds: refList(f.Contenu) }))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    const gfsByIdent = {}; gfs.forEach(f => { gfsByIdent[f.ident] = f; });

    const bySeance = name => { const out = {}; (raw[name] || []).forEach(r => { (out[refId(r.Seance)] = out[refId(r.Seance)] || []).push(r); }); return out; };
    const pointsBy = bySeance('Instance_Points'), guestsBy = bySeance('Instance_Invites'), relBy = bySeance('Instance_Relectures'),
      valBy = bySeance('Instance_Validations'), expBy = bySeance('Export_VP');

    // Composition des instances : colonnes retrouvées par leurs valeurs (voir L.detectComposition).
    const composition = L.detectComposition(raw.Composition || [], { instances: (raw.Instances || []).map(row => ({ id: row.id, nom: instanceName(row) })), people, types: raw.Composition__types || {}, refNames: raw.Composition__refNames || {} });
    composition.tableId = raw.Composition__id || '';
    const everyInstance = (raw.Instances || []).map(row => {
      const steps = choiceList(row.Etapes_actives).map(label => keyOfStep[label]).filter(Boolean);
      const nom = instanceName(row), rule = L.instanceRule(nom);
      const cfg = {
        heureDebut: /^\d{1,2}:\d{2}$/.test(text(row.Heure_debut).trim()) ? text(row.Heure_debut).trim() : '09:30',
        duree: Number(row.Duree_min) > 0 ? Number(row.Duree_min) : 180,
        // Paramétrage enregistré d'abord ; sinon les étapes propres au type d'instance (Comité innovation : sans envoi du CR ni notifications).
        steps: steps.length ? L.ALL_STEP_KEYS.filter(k => k === 'odj' || steps.indexOf(k) >= 0) : (rule ? rule.steps.slice() : L.ALL_STEP_KEYS.slice()),
        relecteurs: refList(row.Relecteurs_CR), permanents: refList(row.Invites_permanents),
        composition: (composition.byInstance[row.id] || []).slice(),
        modInvitation: text(row.Modele_invitation), modCr: text(row.Modele_CR)
      };
      return { id: row.id, nom, cfg, seances: [], known: !!rule };
    });
    // Seules les instances CTO Innovation et Comité innovation sont présentées (10/11/2026). Si aucune ne porte l'un de ces
    // noms (nom différent dans Grist), on garde tout plutôt que d'afficher une page vide : `filtered` le dit.
    const known = everyInstance.filter(i => i.known);
    const filtered = known.length > 0;
    // Les plus complètes d'abord (le CTO a toutes les étapes), puis par nom : même ordre que dans la maquette.
    const instances = (filtered ? known : everyInstance).slice().sort((a, b) => (b.cfg.steps.length - a.cfg.steps.length) || a.nom.localeCompare(b.nom, 'fr'));
    const instById = {}; instances.forEach(i => { instById[i.id] = i; });

    const seanceById = {};
    (raw.Suivi_Instance || []).forEach(row => {
      const inst = instById[refId(row.Instance)];
      if (!inst) return;
      const hp = L.parisParts(row.Heure);
      const date = L.gristDateToIso(row.date) || (hp ? hp.date : '');
      const rows = (pointsBy[row.id] || []).slice().sort((a, b) => (Number(a.Ordre) || 0) - (Number(b.Ordre) || 0) || a.id - b.id).map(p => ({
        id: p.id, ordre: Number(p.Ordre) || 0, titre: text(p.Titre), nature: L.choiceKey(C.nature, p.Nature, 'discussion'),
        duree: Number(p.Duree_min) || 0, projets: refList(p.Projets), invites: refList(p.Invites), presentateurs: refList(p.Presentateurs),
        lienType: L.choiceKey(C.lien, p.Lien_type, ''), lien: text(p.Lien), parent: refId(p.Parent), subs: []
      }));
      // Les sous-points (Parent renseigné) se rangent sous leur point ; un parent absent, ou qui est lui-même un sous-point, laisse la ligne au premier niveau.
      const rowById = {}; rows.forEach(r => { rowById[r.id] = r; });
      const isSub = r => !!r.parent && !!rowById[r.parent] && !rowById[r.parent].parent && r.parent !== r.id;
      rows.filter(isSub).forEach(r => rowById[r.parent].subs.push(r));
      const points = rows.filter(r => !isSub(r));
      const guests = (guestsBy[row.id] || []).map(g => ({
        id: g.id, personneId: refId(g.Personne), origine: L.choiceKey(C.origine, g.Origine, 'permanent'),
        ecritLe: L.gristDateToIso(g.Ecrit_le), passageLe: L.gristDateToIso(g.Passage_envoye_le), passageHeure: text(g.Passage_envoye_heure).trim(),
        reponse: L.choiceKey(C.reponse, g.Reponse, 'attente'), dispoDe: text(g.Dispo_de).trim(), dispoA: text(g.Dispo_a).trim(),
        commentaire: text(g.Commentaire), appel: L.choiceKey(C.appel, g.Appel, '')
      }));
      const relectures = {};
      (relBy[row.id] || []).forEach(r => {
        const statut = L.choiceKey(C.relecture, r.Statut, '');
        if (statut) relectures[refId(r.Personne)] = { id: r.id, statut, le: L.gristDateToIso(r.Relu_le) };
      });
      const validations = {};
      (valBy[row.id] || []).forEach(v => { const key = keyOfStep[text(v.Etape)]; if (key) validations[key] = { id: v.id, le: L.gristDateToIso(v.Date), par: refId(v.Par) }; });
      const exports = {};
      (expBy[row.id] || []).forEach(e => {
        const signeeLe = e.Signee_le ? (L.parisParts(e.Signee_le) || {}).date || '' : '';
        exports[refId(e.Projet)] = { id: e.id, aEnvoyer: !!e.A_envoyer, le: L.gristDateToIso(e.Mis_a_dispo_le), par: refId(e.Mis_a_dispo_par), signee: !!e.Signee, signeeLe };
      });
      const seance = {
        id: row.id, instId: inst.id, num: text(row.Numero).trim(), date, heure: hp ? hp.time : inst.cfg.heureDebut, heureSet: !!hp,
        salleId: refId(row.Salle), mailInvitationLe: L.gristDateToIso(row.Mail_invitation_le), mailCrLe: L.gristDateToIso(row.Mail_CR_le),
        v0: row.CR_V0_le ? { le: L.gristDateToIso(row.CR_V0_le), par: refId(row.CR_V0_par) } : null,
        crPdf: refList(row.CR_PDF),
        points, guests, relectures, validations, exports
      };
      inst.seances.push(seance);
      seanceById[seance.id] = seance;
    });
    instances.forEach(inst => inst.seances.sort((a, b) => (a.date < b.date ? 1 : (a.date > b.date ? -1 : b.id - a.id))));
    return { people, peopleById, projects, projectsById, lieux, lieuxById, gfs, gfsByIdent, instances, instById, seanceById, instancesFiltered: filtered, composition };
  }

  global.InstancesData = {
    INSTANCES_COLUMNS, SEANCE_COLUMNS, PREFS_COLUMNS, NEW_TABLES, READ_TABLES,
    ensureSchema, fetchAll, createStore, buildModel, refId, refList, toList, text
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.InstancesData;
})(typeof window !== 'undefined' ? window : globalThis);
