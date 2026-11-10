/**
 * Non-regression suite: page « par instance » (js/pages/instances-logic.js, instances-data.js, page-instances.js).
 *
 * Jeu de données (reconstruit à chaque test par setup()) : instance « CTO Innovation » (id 1, 3 h, toutes les étapes,
 * relecteurs Alice et Bob) avec 2 séances — n°13 (id 1, passée) et n°14 (id 2, 23/11/2026 09:30, salle Condorcet) —,
 * instance « Comité innovation » (id 2, Etapes_actives vide : 4 étapes par défaut) avec la séance n°22 (id 3) et une
 * instance « COPIL » (id 3, séance id 4) que la page ne présente pas (seules CTO Innovation et Comité innovation le sont). « Aujourd'hui » vaut 09/11/2026 (_setToday), donc la
 * séance affichée par défaut est la prochaine, n°14. Séance n°14 : 3 points (09:30 Approbation 10 min, 09:40 INNOVX
 * 30 min avec Alice et Chloé, 10:10 Notifications 25 min avec les projets NOTIFY et CONVENTIX) ; invités Alice
 * (viendra, écrite), Bob (à confirmer), Chloé (ajoutée sur un point, dispo 09:30–09:50 donc en conflit sur le point
 * de 09:40–10:10). Projets : INNOVX (10, notification « 1) »), NOTIFY (11, « 5) »), CONVENTIX (12, « 6) Signée »).
 */
(function () {
  'use strict';

  const L = window.InstancesLogic;
  const TODAY = '2026-11-09';
  const gd = iso => Math.floor(Date.parse(iso + 'T00:00:00Z') / 1000);

  // Colonnes -> tableau de lignes (objets) -> table colonne par colonne, comme fetchTable.
  function mk(rows, columns) {
    const cols = columns || Array.from(rows.reduce((set, r) => { Object.keys(r).forEach(k => set.add(k)); return set; }, new Set(['id'])));
    const table = {};
    cols.forEach(c => { table[c] = rows.map(r => (r[c] === undefined ? null : r[c])); });
    return table;
  }

  function dataset() {
    const heure = (iso, t) => L.parisToEpoch(iso, t);
    return {
      Instances: [
        { id: 1, Instances: 'CTO Innovation', Heure_debut: '09:30', Duree_min: 180, Etapes_actives: null, Relecteurs_CR: ['L', 1, 2], Invites_permanents: ['L', 1, 2], Modele_invitation: 'Invitation CTO', Modele_CR: '' },
        { id: 2, Instances: 'Comité innovation', Heure_debut: '09:00', Duree_min: 120, Etapes_actives: null, Relecteurs_CR: ['L', 2], Invites_permanents: ['L', 2], Modele_invitation: '', Modele_CR: '' },
        { id: 3, Instances: 'COPIL', Heure_debut: '14:00', Duree_min: 90, Etapes_actives: null, Relecteurs_CR: ['L'], Invites_permanents: ['L'], Modele_invitation: '', Modele_CR: '' }
      ],
      Suivi_Instance: [
        { id: 1, Nom: 'CTO Innovation#13', Instance: 1, Numero: '13', date: gd('2026-10-19'), Heure: heure('2026-10-19', '09:30'), Salle: 1, Mail_invitation_le: null, Mail_CR_le: null, CR_V0_le: null, CR_V0_par: 0, CR_PDF: null },
        { id: 2, Nom: 'CTO Innovation#14', Instance: 1, Numero: '14', date: gd('2026-11-23'), Heure: heure('2026-11-23', '09:30'), Salle: 1, Mail_invitation_le: null, Mail_CR_le: null, CR_V0_le: null, CR_V0_par: 0, CR_PDF: null },
        { id: 3, Nom: 'Comité innovation#22', Instance: 2, Numero: '22', date: gd('2026-11-30'), Heure: heure('2026-11-30', '09:00'), Salle: 0, Mail_invitation_le: null, Mail_CR_le: null, CR_V0_le: null, CR_V0_par: 0, CR_PDF: null },
        { id: 4, Nom: 'COPIL#5', Instance: 3, Numero: '5', date: gd('2026-12-07'), Heure: heure('2026-12-07', '14:00'), Salle: 0, Mail_invitation_le: null, Mail_CR_le: null, CR_V0_le: null, CR_V0_par: 0, CR_PDF: null }
      ],
      Lieux: [{ id: 1, Nom: 'Salle Condorcet', Capacite: 40 }, { id: 2, Nom: 'Salle Pasteur', Capacite: 25 }],
      Instance_Points: [
        { id: 1, Seance: 2, Ordre: 1, Titre: 'Approbation du compte rendu', Nature: 'Validation', Duree_min: 10, Projets: ['L'], Invites: ['L'], Lien_type: '', Lien: '' },
        { id: 2, Seance: 2, Ordre: 2, Titre: 'INNOVX — jalon', Nature: 'Discussion', Duree_min: 30, Projets: ['L', 10], Invites: ['L', 1, 3], Presentateurs: ['L', 1], Lien_type: 'Fichier GFS', Lien: 'GFS-001' },
        { id: 3, Seance: 2, Ordre: 3, Titre: 'Notifications prêtes', Nature: 'Validation', Duree_min: 25, Projets: ['L', 11, 12], Invites: ['L'], Presentateurs: ['L', 1, 2], Lien_type: '', Lien: '' },
        { id: 4, Seance: 1, Ordre: 1, Titre: 'Ancien point (séance 13)', Nature: 'Information', Duree_min: 15, Projets: ['L'], Invites: ['L'], Lien_type: '', Lien: '' }
      ],
      Instance_Invites: [
        { id: 1, Seance: 2, Personne: 1, Origine: 'Liste permanente', Ecrit_le: gd('2026-11-02'), Passage_envoye_le: null, Passage_envoye_heure: '', Reponse: 'Viendra', Dispo_de: '', Dispo_a: '', Commentaire: '', Appel: '' },
        { id: 2, Seance: 2, Personne: 2, Origine: 'Liste permanente', Ecrit_le: null, Passage_envoye_le: null, Passage_envoye_heure: '', Reponse: 'À confirmer', Dispo_de: '', Dispo_a: '', Commentaire: '', Appel: '' },
        { id: 3, Seance: 2, Personne: 3, Origine: 'Ajouté sur un point', Ecrit_le: null, Passage_envoye_le: gd('2026-11-09'), Passage_envoye_heure: '09:40', Reponse: 'À confirmer', Dispo_de: '09:30', Dispo_a: '09:50', Commentaire: 'Part tôt', Appel: '' },
        { id: 4, Seance: 1, Personne: 1, Origine: 'Liste permanente', Ecrit_le: null, Passage_envoye_le: null, Passage_envoye_heure: '', Reponse: 'Viendra', Dispo_de: '', Dispo_a: '', Commentaire: '', Appel: '' }
      ],
      Instance_Relectures: [],
      Instance_Validations: [],
      Export_VP: [],
      GFS_Fichiers: [
        { id: 1, Identifiant: 'GFS-001', Nom: 'INNOVX - dossier.pdf', Type: 'pdf', Contenu: ['L', 77], SupprimeLe: null },
        { id: 2, Identifiant: 'GFS-CR', Nom: 'CR CTO n°13.pdf', Type: 'pdf', Contenu: ['L', 78], SupprimeLe: null },
        { id: 3, Identifiant: 'GFS-DEL', Nom: 'Supprimé.pdf', Type: 'pdf', Contenu: ['L', 79], SupprimeLe: 1760000000 }
      ]
    };
  }
  // Table « Composition instances » : une ligne par membre (Instance = Instances, Personne = Annuaire). Les personnes 1 et 4 siègent au CTO.
  const COMPOSITION = () => [
    { id: 1, Instance: 1, Personne: 1 }, { id: 2, Instance: 1, Personne: 4 }, { id: 3, Instance: 2, Personne: 3 }, { id: 4, Instance: 3, Personne: 2 }
  ];
  const EMPTY_COLUMNS = {
    Instance_Relectures: ['id', 'Seance', 'Personne', 'Statut', 'Relu_le'],
    Instance_Validations: ['id', 'Seance', 'Etape', 'Date', 'Par'],
    Export_VP: ['id', 'Seance', 'Projet', 'A_envoyer', 'Mis_a_dispo_le', 'Mis_a_dispo_par', 'Signee', 'Signee_le']
  };

  // opts.rows(data) : retouche le jeu de données avant installation ; opts.noPrefs : saute le chargement des préférences.
  async function setup(opts) {
    opts = opts || {};
    window.InstancesPage._reset();
    window.InstancesPage._setToday(TODAY);
    const tables = await window.CoreGrist.loadAllTables();
    tables.Annuaire.push({ id: 3, NOM: 'Petit', Prenom: 'Chloé', nom_et_Prenom: 'Chloé Petit', Email: 'chloe@example.org', Poste2: 0 });
    tables.Annuaire.push({ id: 4, NOM: 'Roy', Prenom: 'Dana', nom_et_Prenom: 'Dana Roy', Email: '', Poste2: 0 });
    (opts.people || []).forEach(person => tables.Annuaire.push(person));
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    const data = dataset();
    if (opts.rows) opts.rows(data);
    Object.keys(data).forEach(name => {
      if (opts.skip && opts.skip.indexOf(name) >= 0) return;
      window.__mockSetTable(name, mk(data[name], data[name].length ? undefined : EMPTY_COLUMNS[name]));
    });
    if (!opts.noPrefs) await window.loadInstancesUserPreferences();
    await window.InstancesPage.open();
  }

  // Pour les captures d'écran de revue (hors tests) : installe le même jeu de données que les tests.
  window.__instancesTestSetup = setup;

  const root = () => document.getElementById('instances-root');
  const q = sel => root().querySelector(sel);
  const qa = sel => Array.from(root().querySelectorAll(sel));
  const bySel = (act, attrs) => `[data-act="${act}"]` + Object.keys(attrs || {}).map(k => `[data-${k}="${attrs[k]}"]`).join('');
  function click(act, attrs) {
    const el = q(bySel(act, attrs));
    if (!el) throw new Error(`Bouton introuvable : ${act} ${JSON.stringify(attrs || {})}`);
    fireMouse(el, 'click');
  }
  const step = key => click('step', { v: key });
  function change(chg, attrs, value) {
    const el = q(`[data-chg="${chg}"]` + Object.keys(attrs || {}).map(k => `[data-${k}="${attrs[k]}"]`).join(''));
    if (!el) throw new Error(`Champ introuvable : ${chg}`);
    el.value = value;
    fire(el, 'change');
  }
  const calls = (type, table) => window.__TEST_CALLS__.filter(c => c.type === type && c.table === table);
  const lastFields = (type, table, id) => { const list = calls(type, table).filter(c => id == null || c.id === id); return list.length ? list[list.length - 1].fields : null; };
  const waitCall = (type, table, id, label) => waitFor(() => lastFields(type, table, id), label || `écriture ${type} ${table}`);
  const text = sel => (q(sel) ? q(sel).textContent.replace(/\s+/g, ' ').trim() : '');
  const point = id => q(`.in-pt[data-pt="${id}"]`);
  // Les tests ne chargent aucun CSS et gardent #app-dom masqué (voir tests/index.html). Pour vérifier une mise en page réelle
  // (titre jamais coupé, initiales, corbeille décollée de la bordure), on injecte css/instances.css et on affiche le conteneur
  // le temps du test, puis on remet tout comme avant.
  async function withLayout(fn) {
    const css = await (await fetch('../css/instances.css', { cache: 'no-store' })).text();
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    const host = document.getElementById('app-dom'), before = host.getAttribute('style');
    host.style.cssText = 'display:block;position:absolute;left:0;top:0;width:2000px';
    const view = document.getElementById('view-instances'), wasHidden = view.classList.contains('hidden');
    view.classList.remove('hidden'); // la page Instances est celle qu'on regarde (sinon « plein cadre » ne s'applique pas)
    try { await fn(); } finally {
      view.classList.toggle('hidden', wasHidden);
      if (before == null) host.removeAttribute('style'); else host.setAttribute('style', before);
      style.remove();
    }
  }
  const settleResize = () => { window.dispatchEvent(new Event('resize')); return new Promise(r => setTimeout(r, 220)); };

  // -------------------------------------------------------------------------------------------------
  describe('Instances — règles pures (instances-logic.js)', function () {
    it('heure de Paris : lecture et écriture de Suivi_Instance.Heure, y compris autour du changement d\'heure', function () {
      assertEqual(L.parisToEpoch('2026-11-23', '09:30'), Date.UTC(2026, 10, 23, 8, 30) / 1000, 'hiver = UTC+1');
      assertEqual(L.parisToEpoch('2026-07-14', '14:00'), Date.UTC(2026, 6, 14, 12, 0) / 1000, 'été = UTC+2');
      assertDeepEqual(L.parisParts(L.parisToEpoch('2026-11-23', '09:30')), { date: '2026-11-23', time: '09:30' });
      ['2026-03-29', '2026-03-28', '2026-10-25'].forEach(day => {
        ['00:30', '09:30', '23:45'].forEach(time => {
          assertDeepEqual(L.parisParts(L.parisToEpoch(day, time)), { date: day, time }, `aller-retour ${day} ${time}`);
        });
      });
      assertEqual(L.parisToEpoch('', '09:30'), null);
      assertEqual(L.parisParts(0), null);
    });

    it('composition des instances : la table est retrouvée par son nom, quelle que soit la casse ou la ponctuation', function () {
      assertEqual(L.findCompositionTable(['Projets', 'COMPOSITION_INSTANCES', 'Instances']), 'COMPOSITION_INSTANCES');
      assertEqual(L.findCompositionTable(['Composition_instances']), 'Composition_instances');
      assertEqual(L.findCompositionTable(['CompositionInstances', 'Instances']), 'CompositionInstances');
      assertEqual(L.findCompositionTable(['Composition_des_instances', 'Instances']), 'Composition_des_instances');
      assertEqual(L.findCompositionTable(['Composition']), 'Composition');
      assertEqual(L.findCompositionTable(['Instances', 'Projets', 'Annuaire']), null, 'aucune table de composition');
      assertEqual(L.findCompositionTable([]), null);
    });

    it('composition des instances : colonnes « instance » et « personne » retrouvées par leurs valeurs (références, textes, e-mails, listes)', function () {
      const ctx = {
        instances: [{ id: 1, nom: 'CTO Innovation' }, { id: 2, nom: 'Comité innovation' }],
        people: [{ id: 1, name: 'Alice Martin', email: 'alice@x.org' }, { id: 2, name: 'Bob Durand', email: 'bob@x.org' }, { id: 30, name: 'Chloé Petit', email: '' }]
      };
      // références de ligne
      let r = L.detectComposition([{ id: 1, Instance: 1, Membre: 30 }, { id: 2, Instance: 1, Membre: 2 }, { id: 3, Instance: 2, Membre: 1 }], ctx);
      assertTrue(r.ok);
      assertEqual(r.instanceCol, 'Instance');
      assertEqual(r.personCol, 'Membre');
      assertDeepEqual(r.byInstance, { 1: [30, 2], 2: [1] });
      assertEqual(r.resolved, 3);
      // textes : nom de l'instance (casse/accents ignorés, avec un suffixe) et nom ou e-mail de la personne
      r = L.detectComposition([{ id: 1, Instance: 'cto innovation', Personne: 'ALICE MARTIN' }, { id: 2, Instance: 'Comite Innovation', Personne: 'bob@x.org' }, { id: 3, Instance: 'CTO Innovation 2026', Personne: 'Chloé Petit' }, { id: 4, Instance: 'COPIL', Personne: 'Alice Martin' }], ctx);
      assertTrue(r.ok);
      assertDeepEqual(r.byInstance, { 1: [1, 30], 2: [2] });
      assertEqual(r.unresolved, 1, 'COPIL n\'est pas une instance connue : ligne ignorée');
      // liste de personnes sur une ligne
      r = L.detectComposition([{ id: 1, Instance: 1, Personnes: ['L', 1, 2] }, { id: 2, Instance: 2, Personnes: ['L', 30] }], ctx);
      assertTrue(r.ok);
      assertDeepEqual(r.byInstance, { 1: [1, 2], 2: [30] });
      // colonne d'instance qui est une liste d'instances (une personne siège dans plusieurs)
      r = L.detectComposition([{ id: 1, Instances: ['L', 1, 2], Membre: 1 }], ctx);
      assertDeepEqual(r.byInstance, { 1: [1], 2: [1] });
      // le nom de la colonne départage deux colonnes numériques ambiguës (ids communs aux deux tables)
      r = L.detectComposition([{ id: 1, Truc: 1, Instance: 2 }, { id: 2, Truc: 2, Instance: 1 }], ctx);
      assertEqual(r.instanceCol, 'Instance');
      assertEqual(r.personCol, 'Truc');
      assertDeepEqual(r.byInstance, { 2: [1], 1: [2] });
      // sans doublon
      r = L.detectComposition([{ id: 1, Instance: 1, Membre: 1 }, { id: 2, Instance: 1, Membre: 1 }], ctx);
      assertDeepEqual(r.byInstance, { 1: [1] });
      // diagnostics
      assertEqual(L.detectComposition([], ctx).ok, false);
      assertIncludes(L.detectComposition([], ctx).reason, 'vide');
      r = L.detectComposition([{ id: 1, Libelle: 'abc', Autre: 'def' }], ctx);
      assertEqual(r.ok, false);
      assertIncludes(r.reason, 'instance');
      assertDeepEqual(r.columns, ['Libelle', 'Autre']);
      r = L.detectComposition([{ id: 1, Instance: 1, Libelle: 'abc' }], ctx);
      assertEqual(r.ok, false);
      assertIncludes(r.reason, 'personne');
    });

    it('composition des instances : une colonne n\'est lue comme « instance » que selon son TYPE (jamais un numéro de ligne d\'une autre table), sinon le COPIL se retrouvait avec les invités du Comité', function () {
      const ctx = {
        instances: [{ id: 1, nom: 'CTO Innovation' }, { id: 2, nom: 'Comité innovation' }, { id: 3, nom: 'COPIL' }],
        people: [{ id: 1, name: 'Alice Martin', email: '' }, { id: 2, name: 'Bob Durand', email: '' }, { id: 4, name: 'Dana Roy', email: '' }]
      };
      const types = { Instance: 'Ref:Types_instance', Membre: 'Ref:Annuaire' };
      // Les numéros de Types_instance (1 = COPIL, 2 = CTO, 3 = Comité) n'ont aucun rapport avec ceux de Instances (1 = CTO, 2 = Comité, 3 = COPIL).
      const rows = [{ id: 1, Instance: 1, Membre: 2 }, { id: 2, Instance: 2, Membre: 1 }, { id: 3, Instance: 2, Membre: 4 }, { id: 4, Instance: 3, Membre: 4 }];
      let r = L.detectComposition(rows, Object.assign({ types, refNames: { Types_instance: { 1: 'COPIL', 2: 'CTO Innovation', 3: 'Comité innovation' } } }, ctx));
      assertTrue(r.ok);
      assertDeepEqual(r.byInstance, { 3: [2], 1: [1, 4], 2: [4] }, 'chaque ligne rejoint l\'instance NOMMÉE dans l\'autre table (COPIL : Bob ; CTO : Alice, Dana ; Comité : Dana)');
      assertEqual(r.instanceType, 'Ref:Types_instance');
      assertDeepEqual(r.perInstance.map(x => x.nom + ' ' + x.n), ['CTO Innovation 2', 'Comité innovation 1', 'COPIL 1'], 'le décompte par instance sert au contrôle visuel');
      // table visée illisible : la colonne est écartée, AUCUN invité n'est deviné à partir de numéros sans rapport
      r = L.detectComposition(rows, Object.assign({ types }, ctx));
      assertFalse(r.ok);
      assertDeepEqual(r.byInstance, {});
      assertIncludes(r.reason, 'instance');
      // référence vers la table Instances elle-même : les numéros sont ceux de Instances
      r = L.detectComposition(rows, Object.assign({ types: { Instance: 'Ref:Instances', Membre: 'Ref:Annuaire' } }, ctx));
      assertDeepEqual(r.byInstance, { 1: [2], 2: [1, 4], 3: [4] });
      // un nombre ordinaire (rang, ordre…) n'est jamais une instance, même s'il vaut 1, 2 ou 3 ; l'instance est lue par son nom
      r = L.detectComposition([{ id: 1, Rang: 2, Nom_instance: 'COPIL', Membre: 2 }, { id: 2, Rang: 1, Nom_instance: 'Comité innovation', Membre: 4 }],
        Object.assign({ types: { Rang: 'Int', Nom_instance: 'Text', Membre: 'Ref:Annuaire' } }, ctx));
      assertEqual(r.instanceCol, 'Nom_instance');
      assertDeepEqual(r.byInstance, { 3: [2], 2: [4] });
      // sans métadonnées : un numéro n'est admis que dans une colonne dont le nom évoque l'instance
      r = L.detectComposition([{ id: 1, Rang: 2, Membre: 1 }, { id: 2, Rang: 1, Membre: 2 }], ctx);
      assertFalse(r.ok, 'une colonne « Rang » n\'est pas une instance');
      // texte : nom exact, ou l\'UNIQUE instance nommée dans le texte ; deux instances nommées = ambigu, donc ignoré
      r = L.detectComposition([{ id: 1, Instance: 'COPIL', Membre: 2 }, { id: 2, Instance: 'Comité innovation', Membre: 4 }, { id: 3, Instance: 'COPIL du comité innovation', Membre: 1 }, { id: 4, Instance: 'CTO Innovation 2026', Membre: 1 }], ctx);
      assertDeepEqual(r.byInstance, { 3: [2], 2: [4], 1: [1] }, '« COPIL du comité innovation » nomme deux instances : ni l\'une ni l\'autre');
      assertEqual(r.unresolved, 1);
    });

    it('créneaux de l\'ordre du jour et conflits de disponibilité', function () {
      const sched = L.schedule([{ id: 1, duree: 10, invites: [] }, { id: 2, duree: 30, invites: [7, 8] }], 9 * 60 + 30);
      assertEqual(L.hhmm(sched[1].start), '09:40');
      assertEqual(L.hhmm(sched[1].end), '10:10');
      const guests = { 7: { reponse: 'viendra', dispoDe: '', dispoA: '09:50', personneId: 1 }, 8: { reponse: 'excuse', dispoDe: '', dispoA: '', personneId: 2 } };
      const conf = L.computeConflicts(sched, guests, id => 'P' + id);
      assertDeepEqual(Object.keys(conf), ['2']);
      assertEqual(conf[2].length, 2);
      assertIncludes(conf[2][0], 'disponible …–09:50');
      assertIncludes(conf[2][1], 'excusé(e)');
      assertEqual(L.firstStartOf(sched, 7), '09:40');
      assertEqual(L.firstStartOf(sched, 99), '');
    });

    it('horaire de passage : aucun / à envoyer / envoyé / modifié depuis l\'envoi', function () {
      assertEqual(L.horaireState({ passageLe: '' }, ''), 'none');
      assertEqual(L.horaireState({ passageLe: '2026-11-01', passageHeure: '09:40' }, ''), 'sent');
      assertEqual(L.horaireState({ passageLe: '' }, '09:40'), 'todo');
      assertEqual(L.horaireState({ passageLe: '2026-11-01', passageHeure: '09:40' }, '09:40'), 'sent');
      assertEqual(L.horaireState({ passageLe: '2026-11-01', passageHeure: '09:40' }, '09:50'), 'stale');
    });

    it('statut VP d\'une notification : non mise à disposition / en attente / signée (Export_VP ou statut Grist)', function () {
      assertEqual(L.vpState(undefined, 3).key, 'none');
      assertEqual(L.vpState({ aEnvoyer: false }, 3).key, 'none');
      const wait = L.vpState({ aEnvoyer: true, le: '2026-11-02', signee: false }, 3);
      assertEqual(wait.key, 'wait');
      assertEqual(wait.label, 'En attente de signature');
      const signed = L.vpState({ aEnvoyer: true, le: '2026-11-02', signee: true, signeeLe: '2026-11-05' }, 3);
      assertEqual(signed.label, 'Signée le 05/11');
      assertEqual(L.vpState(undefined, 6).key, 'signed', 'statut Grist « 6) Signée » sans ligne Export_VP');
    });

    it('conditions d\'une étape : bloquantes ou simples alertes', function () {
      const seance = { heure: '09:30', points: [], v0: null, crPdf: [], mailInvitationLe: '', mailCrLe: '' };
      const ctx = { seance, cfg: { duree: 180, relecteurs: [1, 2] }, sched: [], conflicts: {}, guests: [], relectures: { 1: { statut: 'valide' }, 2: { statut: 'modifs' } }, validations: {}, endMin: 12 * 60 + 30, personName: id => 'Prénom N' + id, projectIds: [], projectVp: {} };
      const odj = L.stepConditions('odj', ctx);
      assertFalse(odj[0].ok, 'au moins un point');
      assertFalse(!!odj[0].warn);
      const cr = L.stepConditions('cr', ctx);
      assertFalse(cr[0].ok, 'V0 à rédiger');
      assertFalse(cr[1].ok, 'un relecteur n\'a pas validé');
      assertTrue(cr[2].warn && !cr[2].ok, 'une demande de modification est une alerte');
      assertTrue(cr[3].warn && !cr[3].ok, 'le PDF pas encore exporté est une simple alerte');
      assertIncludes(cr[3].text, 'PDF du compte rendu pas encore exporté');
      ctx.seance.crPdf = [90];
      assertTrue(L.stepConditions('cr', ctx)[3].ok, 'PDF exporté dans CR_PDF');
      assertEqual(L.isValid('invitation', ctx), false);
      ctx.seance.mailInvitationLe = '2026-11-12';
      assertTrue(L.isValid('invitation', ctx), 'une date d\'envoi renseignée vaut validation');
      assertEqual(L.validatedInfo('invitation', ctx), 'Envoyé le 12/11/2026');
    });
  });

  describe('Instances — instances présentées et séances (règles pures)', function () {
    it('seules CTO Innovation et Comité innovation sont reconnues (casse, accents et ponctuation ignorés)', function () {
      assertTrue(!!L.instanceRule('CTO Innovation'));
      assertTrue(!!L.instanceRule('cto  INNOVATION'));
      assertTrue(!!L.instanceRule('Comité innovation'));
      assertTrue(!!L.instanceRule('COMITE INNOVATION'));
      assertTrue(!!L.instanceRule('Comité Innovation 2026'));
      ['CTO FARE', 'COPIL', 'COT', 'CTO', 'Comité de pilotage', '', null].forEach(name => assertEqual(L.instanceRule(name), null, String(name)));
      assertDeepEqual(L.instanceRule('Comité innovation').steps, ['odj', 'invites', 'invitation', 'cr'], 'ni envoi du CR ni notifications');
      assertEqual(L.instanceRule('CTO Innovation').steps.length, 6);
    });

    it('séances : la prochaine et la dernière épinglées, puis « à venir » (la plus proche d\'abord) et « passées » (la plus récente d\'abord)', function () {
      const se = (id, date) => ({ id, date });
      const list = [se(1, '2026-08-31'), se(2, '2026-09-21'), se(3, '2026-10-19'), se(4, '2026-11-23'), se(5, '2026-12-21'), se(6, '2027-01-18'), se(7, '')];
      const g = L.groupSeances(list, '2026-11-09');
      assertEqual(g.next.id, 4, 'la plus proche à partir d\'aujourd\'hui');
      assertEqual(g.last.id, 3, 'la plus récente avant aujourd\'hui');
      assertDeepEqual(g.upcoming.map(x => x.id), [5, 6, 7], 'à venir : dates croissantes, sans date à la fin, sans la prochaine');
      assertDeepEqual(g.past.map(x => x.id), [2, 1], 'passées : la plus récente d\'abord, sans la dernière');
      assertEqual(L.groupSeances(list, '2026-11-23').next.id, 4, 'une séance aujourd\'hui est la prochaine');
      assertEqual(L.groupSeances(list, '2026-11-24').next.id, 5);
      const none = L.groupSeances([se(1, '2026-01-01')], '2026-11-09');
      assertEqual(none.next, null);
      assertEqual(none.last.id, 1);
      assertDeepEqual(L.groupSeances([], '2026-11-09'), { next: null, last: null, upcoming: [], past: [] });
    });
  });

  // -------------------------------------------------------------------------------------------------
  describe('Instances — données Grist (instances-data.js)', function () {
    it('première ouverture : crée les 5 tables et les colonnes manquantes, sans jamais écrire les colonnes formule', async function () {
      window.InstancesPage._reset();
      window.__mockSetTable('Instances', mk([{ id: 1, Instances: 'CTO' }]));
      window.__mockSetTable('Suivi_Instance', mk([], ['id', 'Nom', 'Instance', 'Numero', 'date', 'Heure', 'Salle']));
      await window.CoreGrist.loadAllTables();
      await window.InstancesPage.open();
      const created = window.__TEST_CALLS__.filter(c => c.type === 'AddTable').map(c => c.table);
      assertDeepEqual(created, ['Instance_Invites', 'Instance_Points', 'Instance_Relectures', 'Instance_Validations', 'Export_VP']);
      const exportCols = window.__TEST_CALLS__.find(c => c.type === 'AddTable' && c.table === 'Export_VP').colDefs;
      ['Instance', 'Date_instance', 'Acronyme', 'Porteur', 'Labo_porteur', 'Montant'].forEach(id => {
        const col = exportCols.find(c => c.id === id);
        assertTrue(!!col && col.isFormula === true && !!col.formula, `${id} doit être une colonne formule`);
      });
      ['PDF_notification', 'PDF_signe'].forEach(id => assertEqual(exportCols.find(c => c.id === id).type, 'Attachments'));
      assertEqual(exportCols.find(c => c.id === 'Signee_le').type, 'DateTime:Europe/Paris');
      const addedInstances = window.__TEST_CALLS__.filter(c => c.type === 'AddColumn' && c.table === 'Instances').map(c => c.colId);
      assertDeepEqual(addedInstances, ['Heure_debut', 'Duree_min', 'Etapes_actives', 'Relecteurs_CR', 'Invites_permanents', 'Modele_invitation', 'Modele_CR']);
      const addedSeance = window.__TEST_CALLS__.filter(c => c.type === 'AddColumn' && c.table === 'Suivi_Instance').map(c => c.colId);
      assertDeepEqual(addedSeance, ['Mail_invitation_le', 'CR_V0_le', 'CR_V0_par', 'CR_PDF', 'Mail_CR_le']);
      assertEqual(window.__TEST_CALLS__.find(c => c.type === 'AddColumn' && c.table === 'Suivi_Instance' && c.colId === 'CR_PDF').colInfo.type, 'Attachments', 'la version PDF du compte rendu est une colonne de pièces jointes');
      assertIncludes(text('.in-band'), 'Aucune séance pour cette instance');
    });

    it('Instance_Points déjà créée avant « Présenté par » : la colonne Presentateurs est ajoutée (RefList vers Annuaire, avec sa description)', async function () {
      window.InstancesPage._reset();
      const data = dataset();
      Object.keys(data).forEach(name => window.__mockSetTable(name, mk(data[name], data[name].length ? undefined : EMPTY_COLUMNS[name])));
      window.__mockSetTable('Instance_Points', mk([{ id: 1, Seance: 2, Ordre: 1, Titre: 'Ancien', Nature: 'Discussion', Duree_min: 10, Projets: ['L'], Invites: ['L'], Lien_type: '', Lien: '' }]));
      await window.CoreGrist.loadAllTables();
      await window.InstancesPage.open();
      const added = window.__TEST_CALLS__.filter(c => c.type === 'AddColumn' && c.table === 'Instance_Points');
      assertDeepEqual(added.map(c => c.colId), ['Presentateurs']);
      assertEqual(added[0].colInfo.type, 'RefList:Annuaire');
      assertDeepEqual(window.InstancesPage.state.model.seanceById[2].points[0].presentateurs, [], 'ancien point : aucun présentateur');
      const col = window.InstancesData.NEW_TABLES.find(t => t.id === 'Instance_Points').cols.find(c => c.id === 'Presentateurs');
      assertTrue(!!col.description, 'la colonne porte une description (bulle d\'aide)');
    });

    it('modèle : séances triées par date décroissante, points par Ordre, valeurs par défaut quand les colonnes sont vides', async function () {
      await setup();
      const model = window.InstancesPage.state.model;
      assertDeepEqual(model.instances.map(i => i.nom), ['CTO Innovation', 'Comité innovation'], 'seules ces deux instances, les plus complètes d\'abord (COPIL est écartée)');
      assertEqual(model.instancesFiltered, true);
      assertEqual(model.seanceById[4], undefined, 'les séances d\'une instance écartée ne sont pas chargées');
      const cto = model.instById[1];
      assertDeepEqual(cto.seances.map(s => s.num), ['14', '13']);
      assertDeepEqual(cto.seances[0].points.map(p => p.id), [1, 2, 3]);
      assertEqual(cto.seances[0].heure, '09:30');
      assertEqual(cto.cfg.steps.length, 6, 'Etapes_actives vide : toutes les étapes');
      assertDeepEqual(model.instById[2].cfg.steps, ['odj', 'invites', 'invitation', 'cr'], 'Comité innovation : ni envoi du CR ni notifications par défaut');
      assertDeepEqual(cto.cfg.relecteurs, [1, 2]);
      assertEqual(model.seanceById[2].guests.find(g => g.id === 3).origine, 'point');
      assertEqual(model.seanceById[2].guests.find(g => g.id === 1).reponse, 'viendra');
      assertEqual(model.gfs.length, 2, 'le fichier GFS supprimé est écarté');
      assertEqual(model.lieux[0].sub, '40 places');
    });

    it('un paramétrage enregistré l\'emporte sur les étapes par défaut du Comité innovation', async function () {
      await setup({ rows: d => { d.Instances[1].Etapes_actives = ['L', 'Ordre du jour', 'Invités', 'Compte rendu', 'Notifications liées']; } });
      assertDeepEqual(window.InstancesPage.state.model.instById[2].cfg.steps, ['odj', 'invites', 'cr', 'notifs']);
    });

    it('aucune instance ne porte l\'un des deux noms : tout est gardé plutôt qu\'une page vide', async function () {
      await setup({ rows: d => { d.Instances[0].Instances = 'CTO'; d.Instances[1].Instances = 'COT'; } });
      const model = window.InstancesPage.state.model;
      assertEqual(model.instancesFiltered, false);
      assertDeepEqual(model.instances.map(i => i.nom), ['COPIL', 'COT', 'CTO']);
      assertTrue(text('.in-inst-badge').length > 0);
    });

    it('une écriture qui échoue recharge l\'écran et le signale (aucune erreur silencieuse)', async function () {
      await setup();
      step('odj');
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async () => { throw new Error('droits insuffisants'); };
      try {
        click('pt-nat', { id: 3, v: 'information' });
        await waitFor(() => document.getElementById('toast').textContent.includes('Enregistrement impossible'), 'message d\'échec');
        assertIncludes(document.getElementById('toast').textContent, 'droits insuffisants');
      } finally {
        window.grist.docApi.applyUserActions = original;
      }
      await waitFor(() => point(3) && point(3).querySelector('.in-seg-i .in-on.in-validation'), 'rechargement : la nature d\'origine revient');
    });
  });

  // -------------------------------------------------------------------------------------------------
  describe('Instances — bandeau, séances et vue d\'ensemble', function () {
    it('affiche la prochaine séance par défaut, l\'heure de fin et la salle (table Lieux)', async function () {
      await setup();
      assertEqual(text('.in-inst-badge'), 'CTO Innovation');
      assertIncludes(text('.in-band .in-sel'), 'n°14 · 23/11/2026');
      assertIncludes(text('.in-band .in-sel'), 'à venir');
      assertIncludes(text('.in-band .in-tp'), '09:30');
      assertIncludes(text('.in-band .in-tp'), '→ 12:30');
      assertIncludes(root().textContent, 'Salle Condorcet');
      assertEqual(qa('.in-chip').length, 7, 'puce « vue d\'ensemble » + 6 étapes');
      assertEqual(qa('.in-chip.in-off').length, 0, 'le CTO Innovation suit les 6 étapes');
      assertEqual(text('.in-chip.in-macro'), '0/6');
    });

    it('Comité innovation : « Envoi du CR » et « Notifications » grisées en haut, absentes de la frise, compteur sur 4 étapes', async function () {
      await setup({ noPrefs: true });
      await window.loadInstancesUserPreferences();
      await window.grist.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', 1, { Inst_instance: '2', Inst_etape: 'macro', Inst_vue: 'C', Inst_seances: '{}' }]]);
      window.InstancesPage._reset();
      await window.loadInstancesUserPreferences();
      await window.InstancesPage.open();
      assertEqual(text('.in-inst-badge'), 'Comité innovation');
      assertEqual(qa('.in-chip').length, 7, 'les 6 étapes restent visibles + la vue d\'ensemble');
      const off = qa('.in-chip.in-off');
      assertDeepEqual(off.map(c => c.textContent.replace(/[–\s]+/g, ' ').trim()), ['Envoi CR', 'Notifs']);
      assertTrue(off.every(c => c.tagName !== 'BUTTON' && !c.hasAttribute('data-act') && c.getAttribute('aria-disabled') === 'true'), 'grisées et sans action');
      assertIncludes(off[0].title, 'non suivie par cette instance');
      assertDeepEqual(qa('.in-chip:not(.in-off):not(.in-macro)').map(c => c.textContent.replace(/\s+/g, ' ').trim().replace(/^[\d]+\s*/, '')), ['ODJ', 'Invités', 'Invitation', 'CR'], 'les puces actives sont numérotées de 1 à 4');
      assertEqual(text('.in-chip.in-macro'), '0/4');
      assertEqual(qa('.in-thread .in-ms').length, 4, 'variante C : la frise ne compte que les 4 étapes suivies');
      assertDeepEqual(qa('.in-thread .in-msl').map(e => e.textContent.trim()), ['Ordre du jour', 'Invités', "Mail d'invitation", 'Compte rendu']);
      assertFalse(root().textContent.includes('Notifications liées'));
    });

    it('vue d\'ensemble : 4 carrés, tuiles ODJ et invités, fil de 4 jalons (variante A) ou 6 (variante C), choix retenu', async function () {
      await setup();
      const kpis = qa('.in-ksq').map(k => k.textContent.replace(/\s+/g, ' ').trim());
      assertEqual(kpis.length, 4);
      assertIncludes(kpis[0], '3');
      assertIncludes(kpis[0], 'invités');
      assertIncludes(kpis[1], '1/3');
      assertIncludes(kpis[1], 'horaires de passage 1/2');
      assertEqual(qa('.in-tile').length, 2);
      assertIncludes(text('.in-tile .in-alert-pill'), '1', 'le conflit de Chloé alerte sur la tuile ODJ');
      assertEqual(qa('.in-thread .in-ms').length, 4);
      click('vue', { v: 'C' });
      assertEqual(qa('.in-thread .in-ms').length, 6);
      assertTrue(!!q('.in-dash.in-vc'));
      await waitFor(() => (lastFields('UpdateRecord', 'Preferences_Widget') || {}).Inst_vue === 'C', 'variante enregistrée');
    });

    it('changer de séance ouvre la vue d\'ensemble de cette séance et retient le choix par utilisateur', async function () {
      await setup();
      click('menu', { v: 'seance' });
      assertEqual(qa('.in-menu .in-mi').length, 3, 'deux séances + « Nouvelle séance »');
      assertDeepEqual(qa('.in-menu .in-mi').slice(0, 2).map(b => b.textContent.replace(/\s+/g, ' ').trim().replace(/\s*\d\/\d$/, '')), ['n°14 · 23/11/2026Prochaine', 'n°13 · 19/10/2026Dernière'], 'la prochaine puis la dernière, épinglées');
      click('seance-pick', { id: 1 });
      assertIncludes(text('.in-band .in-sel'), 'n°13 · 19/10/2026');
      assertIncludes(text('.in-band .in-sel'), 'passée');
      await waitFor(() => (lastFields('UpdateRecord', 'Preferences_Widget') || {}).Inst_seances === '{"1":1}', 'séance retenue');
    });

    it('menu des séances : prochaine et dernière épinglées en haut, puis « À venir » et « Passées » séparées', async function () {
      const extra = (id, num, iso) => ({ id, Nom: 'CTO Innovation#' + num, Instance: 1, Numero: String(num), date: gd(iso), Heure: L.parisToEpoch(iso, '09:30'), Salle: 1, Mail_invitation_le: null, Mail_CR_le: null, CR_V0_le: null, CR_V0_par: 0, CR_PDF: null });
      await setup({ rows: d => { d.Suivi_Instance.push(extra(5, 12, '2026-09-21'), extra(6, 11, '2026-08-31'), extra(7, 15, '2026-12-21'), extra(8, 16, '2027-01-18')); } });
      click('menu', { v: 'seance' });
      const menu = q('.in-menu');
      const labels = Array.from(menu.children).map(el => el.classList.contains('in-mi-sep') ? '---' : (el.classList.contains('in-mh') ? '[' + el.textContent.trim() + ']' : el.textContent.replace(/\s+/g, ' ').trim().replace(/\s*\d\/\d$/, '')));
      assertDeepEqual(labels, [
        'n°14 · 23/11/2026Prochaine', 'n°13 · 19/10/2026Dernière', '---',
        '[À venir]', 'n°15 · 21/12/2026', 'n°16 · 18/01/2027',
        '[Passées]', 'n°12 · 21/09/2026', 'n°11 · 31/08/2026',
        '---', 'Nouvelle séance'
      ]);
      assertEqual(qa('.in-menu .in-mi .in-ic').length, 3, 'une punaise pour chaque séance épinglée (2) + le « + » de « Nouvelle séance »');
      assertTrue(qa('.in-menu .in-mi')[0].classList.contains('in-on'), 'la séance affichée est repérée');
      click('seance-pick', { id: 6 });
      assertIncludes(text('.in-band .in-sel'), 'n°11 · 31/08/2026');
      assertIncludes(text('.in-band .in-sel'), 'passée');
      click('menu', { v: 'seance' });
      assertEqual(qa('.in-menu .in-mi')[0].textContent.includes('n°14'), true, 'la prochaine reste en haut quelle que soit la séance affichée');
    });

    it('les préférences enregistrées sont rejouées : instance Comité innovation, étape et vue', async function () {
      await setup({ noPrefs: true });
      await window.loadInstancesUserPreferences();
      await window.grist.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', 1, { Inst_instance: '2', Inst_etape: 'invites', Inst_vue: 'B', Inst_seances: '{}' }]]);
      window.InstancesPage._reset();
      await window.loadInstancesUserPreferences();
      await window.InstancesPage.open();
      assertEqual(text('.in-inst-badge'), 'Comité innovation');
      assertEqual(qa('.in-chip:not(.in-off)').length, 5, 'Comité innovation : 4 étapes suivies + vue d\'ensemble');
      assertIncludes(text('.in-panel h2'), 'Invités');
    });

    it('heure de début, date et salle de la séance s\'écrivent dans Suivi_Instance (heure de Paris)', async function () {
      await setup();
      click('menu', { v: 'heure' });
      click('time-pick', { s: 'heure', v: '10:15' });
      let fields = await waitCall('UpdateRecord', 'Suivi_Instance', 2);
      assertEqual(fields.Heure, L.parisToEpoch('2026-11-23', '10:15'));
      assertIncludes(text('.in-band .in-tp'), '10:15');
      click('menu', { v: 'heure' });
      change('seance-date', null, '2026-11-24');
      await waitFor(() => lastFields('UpdateRecord', 'Suivi_Instance', 2).date === gd('2026-11-24'), 'date de la séance');
      assertEqual(lastFields('UpdateRecord', 'Suivi_Instance', 2).Heure, L.parisToEpoch('2026-11-24', '10:15'), 'l\'heure suit la nouvelle date');
      click('menu', { v: 'salle' });
      click('salle-pick', { id: 2 });
      assertEqual(lastFields('UpdateRecord', 'Suivi_Instance', 2).Salle, 2);
      assertIncludes(root().textContent, 'Salle Pasteur');
    });

    it('nouvelle séance : Suivi_Instance (+28 jours, numéro suivant, heure habituelle) et invités permanents repris', async function () {
      await setup();
      click('menu', { v: 'seance' });
      click('seance-new');
      const added = await waitCall('AddRecord', 'Suivi_Instance');
      assertEqual(added.Instance, 1);
      assertEqual(added.Numero, '15');
      assertEqual(added.date, gd('2026-12-21'));
      assertEqual(added.Heure, L.parisToEpoch('2026-12-21', '09:30'));
      assertEqual(added.Salle, 1);
      await waitFor(() => calls('AddRecord', 'Instance_Invites').length === 2, 'invités permanents');
      const newGuests = calls('AddRecord', 'Instance_Invites');
      assertDeepEqual(newGuests.map(c => c.fields.Personne), [1, 2]);
      assertTrue(newGuests.every(c => c.fields.Seance === 5 && c.fields.Origine === 'Liste permanente'));
      await waitFor(() => text('.in-band .in-sel').includes('n°15'), 'nouvelle séance affichée');
      assertIncludes(text('.in-panel h2'), 'Ordre du jour');
    });

    it('nouvelle séance : les invités par défaut = liste permanente + composition de l\'instance (table Composition instances), sans doublon', async function () {
      await setup({ rows: d => { d.COMPOSITION_INSTANCES = COMPOSITION(); } });
      click('menu', { v: 'seance' });
      click('seance-new');
      await waitCall('AddRecord', 'Suivi_Instance');
      await waitFor(() => calls('AddRecord', 'Instance_Invites').length === 3, 'invités par défaut');
      assertDeepEqual(calls('AddRecord', 'Instance_Invites').map(c => c.fields.Personne), [1, 2, 4], 'Alice et Bob (permanents), Dana (composition) ; Alice une seule fois');
      assertTrue(calls('AddRecord', 'Instance_Invites').every(c => c.fields.Origine === 'Liste permanente'));
    });

    it('nouvelle séance : la composition lue par une référence vers une AUTRE table donne ses invités à la bonne instance (pas à celle dont les numéros coïncident)', async function () {
      const meta = (tables, cols) => {
        window.__mockSetTable('_grist_Tables', { id: tables.map((_, i) => i + 1), tableId: tables });
        window.__mockSetTable('_grist_Tables_column', { id: cols.map((_, i) => i + 1), parentId: cols.map(c => tables.indexOf(c.table) + 1), colId: cols.map(c => c.col), type: cols.map(c => c.type), description: cols.map(() => '') });
        return window.CoreGrist.loadColumnDescriptions();
      };
      await meta(['COMPOSITION_INSTANCES', 'Types_instance'], [
        { table: 'COMPOSITION_INSTANCES', col: 'Instance', type: 'Ref:Types_instance' }, { table: 'COMPOSITION_INSTANCES', col: 'Personne', type: 'Ref:Annuaire' }, { table: 'Types_instance', col: 'Nom', type: 'Text' }
      ]);
      try {
        // Types_instance : 1 = COPIL, 2 = CTO Innovation, 3 = Comité innovation (autres numéros que la table Instances)
        await setup({ rows: d => {
          d.Types_instance = [{ id: 1, Nom: 'COPIL' }, { id: 2, Nom: 'CTO Innovation' }, { id: 3, Nom: 'Comité innovation' }];
          d.COMPOSITION_INSTANCES = [{ id: 1, Instance: 1, Personne: 2 }, { id: 2, Instance: 2, Personne: 1 }, { id: 3, Instance: 2, Personne: 4 }, { id: 4, Instance: 3, Personne: 3 }];
        } });
        click('menu', { v: 'seance' });
        click('seance-new');
        await waitCall('AddRecord', 'Suivi_Instance');
        await waitFor(() => calls('AddRecord', 'Instance_Invites').length === 3, 'invités par défaut du CTO');
        assertDeepEqual(calls('AddRecord', 'Instance_Invites').map(c => c.fields.Personne), [1, 2, 4], 'CTO : Alice et Bob (permanents) + Dana (composition du CTO, pas celle du COPIL)');
        // et le paramétrage montre le contrôle : colonnes, types, nombre de personnes par instance
        click('settings-open');
        await waitFor(() => !!q('.in-dlg'), 'paramétrage');
        const block = qa('.in-dlg .in-fgrp').find(g => g.textContent.includes('Composition de l\'instance'));
        assertIncludes(block.textContent, 'Ref:Types_instance');
        assertIncludes(block.textContent, 'Personnes par instance : CTO Innovation 2 · Comité innovation 1 · COPIL 1');
      } finally {
        await meta([], []); // ne pas laisser ces métadonnées aux autres suites
      }
    });

    it('menu « Instances » de la barre de navigation : CTO Innovation et Comité innovation seulement, la page s\'ouvre sur l\'instance choisie', async function () {
      window.InstancesPage._reset();
      window.InstancesPage._setToday(TODAY);
      const tables = await window.CoreGrist.loadAllTables();
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      const data = dataset();
      Object.keys(data).forEach(name => window.__mockSetTable(name, mk(data[name], data[name].length ? undefined : EMPTY_COLUMNS[name])));
      const views = Array.from(document.querySelectorAll('.view'));
      const hiddenBefore = views.map(v => v.classList.contains('hidden'));
      try {
        const menu = document.getElementById('instances-menu');
        fireMouse(document.getElementById('btn-instances'), 'click');
        await waitFor(() => !menu.hidden && menu.querySelectorAll('[data-inst]').length === 2, 'menu des instances');
        assertDeepEqual(Array.from(menu.querySelectorAll('[data-inst]')).map(b => b.firstChild.textContent), ['CTO Innovation', 'Comité innovation'], 'COPIL n\'est pas proposée');
        fireMouse(menu.querySelector('[data-inst="2"]'), 'click');
        await waitFor(() => text('.in-inst-badge') === 'Comité innovation', 'instance Comité innovation affichée');
        assertTrue(menu.hidden, 'le menu se referme');
        assertFalse(document.getElementById('view-instances').classList.contains('hidden'), 'la vue Instances est affichée');
      } finally {
        views.forEach((v, i) => v.classList.toggle('hidden', hiddenBefore[i]));
        document.getElementById('instances-menu').hidden = true;
      }
    });

    it('table Instances introuvable : message clair plutôt qu\'une page vide', async function () {
      window.InstancesPage._reset();
      await window.CoreGrist.loadAllTables();
      await window.InstancesPage.open();
      assertIncludes(text('.in-loading'), 'Page Instances indisponible');
    });
  });

  // -------------------------------------------------------------------------------------------------
  describe('Instances — étape Ordre du jour', function () {
    it('affiche les créneaux calculés depuis l\'heure de début et signale le conflit de Chloé', async function () {
      await setup();
      step('odj');
      assertEqual(qa('.in-pt').length, 3, 'seuls les points de la séance affichée');
      assertEqual(text('.in-pt[data-pt="1"] .in-ptime'), '09:30–09:40');
      assertEqual(text('.in-pt[data-pt="2"] .in-ptime'), '09:40–10:10');
      assertEqual(text('.in-pt[data-pt="3"] .in-ptime'), '10:10–10:35');
      assertTrue(point(2).classList.contains('in-flag'), 'point 2 en conflit');
      assertFalse(point(1).classList.contains('in-flag'));
      assertEqual(text('.in-toolbar .in-total'), '3 points · 1 h 05 · fin 10:35');
    });

    it('ajouter, renommer, changer la durée (les heures suivantes se recalculent) et supprimer un point', async function () {
      await setup();
      step('odj');
      click('pt-add');
      const added = await waitCall('AddRecord', 'Instance_Points');
      assertEqual(added.Seance, 2);
      assertEqual(added.Ordre, 4);
      assertEqual(added.Duree_min, 15);
      assertDeepEqual(added.Projets, ['L']);
      assertDeepEqual(added.Presentateurs, ['L'], 'aucun présentateur au départ');
      await waitFor(() => qa('.in-pt').length === 4, 'quatrième point affiché');

      const row = point(1);
      change('pt-titre', { id: 1 }, 'Approbation du CR n°13');
      assertTrue(row.isConnected, 'le rendu est repoussé : un clic qui suit la saisie ne doit pas tomber dans le vide');
      assertEqual(lastFields('UpdateRecord', 'Instance_Points', 1).Titre, 'Approbation du CR n°13');
      await waitFor(() => !row.isConnected, 'rendu après la saisie');

      change('pt-duree', { id: 1 }, '20');
      await waitFor(() => text('.in-pt[data-pt="2"] .in-ptime') === '09:50–10:20', 'heures recalculées');
      assertEqual(lastFields('UpdateRecord', 'Instance_Points', 1).Duree_min, 20);

      click('pt-del', { id: 3 });
      assertEqual(calls('RemoveRecord', 'Instance_Points').length, 1);
      assertEqual(calls('RemoveRecord', 'Instance_Points')[0].id, 3);
      assertEqual(qa('.in-pt').length, 3);
    });

    it('nature du point : trois états exclusifs', async function () {
      await setup();
      step('odj');
      click('pt-nat', { id: 3, v: 'information' });
      assertEqual(lastFields('UpdateRecord', 'Instance_Points', 3).Nature, 'Information');
      assertTrue(!!point(3).querySelector('.in-seg-i .in-on.in-information'));
      assertFalse(!!point(3).querySelector('.in-seg-i .in-on.in-validation'));
    });

    it('monter / descendre un point réécrit uniquement les Ordre qui changent', async function () {
      await setup();
      step('odj');
      click('pt-down', { id: 1 });
      const updates = calls('UpdateRecord', 'Instance_Points').map(c => [c.id, c.fields.Ordre]).sort((a, b) => a[0] - b[0]);
      assertDeepEqual(updates, [[1, 2], [2, 1]], 'le point 3 garde son rang : pas d\'écriture inutile');
      assertEqual(qa('.in-pt .in-ptitle')[0].value, 'INNOVX — jalon', 'le point 2 passe en tête');
      assertEqual(text('.in-pt:nth-child(1) .in-ptime'), '09:30–10:00');
    });

    it('glisser-déposer : le point déposé prend la place de la cible (une seule écriture groupée)', async function () {
      await setup();
      step('odj');
      const grip = point(3).querySelector('[data-drag]');
      const dt = new DataTransfer();
      grip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
      assertTrue(point(3).classList.contains('in-dragging'));
      point(1).dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      assertTrue(point(1).classList.contains('in-drop'));
      point(1).dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      const updates = calls('UpdateRecord', 'Instance_Points').map(c => [c.id, c.fields.Ordre]).sort((a, b) => a[0] - b[0]);
      assertDeepEqual(updates, [[1, 2], [2, 3], [3, 1]]);
      assertEqual(qa('.in-pt .in-ptitle')[0].value, 'Notifications prêtes');
      assertEqual(qa('.in-dragging,.in-drop').length, 0);
    });

    it('relier un projet : RefList écrite en [\'L\', ...ids]', async function () {
      await setup();
      step('odj');
      click('menu', { v: 'proj:1' });
      click('pt-proj', { id: 1, v: 13 });
      assertDeepEqual(lastFields('UpdateRecord', 'Instance_Points', 1).Projets, ['L', 13]);
      assertTrue(!!point(1).querySelector('.in-tag.in-proj'), 'le projet relié apparaît en étiquette');
      click('pt-proj', { id: 1, v: 13 });
      assertDeepEqual(lastFields('UpdateRecord', 'Instance_Points', 1).Projets, ['L']);
    });

    it('présenté par : une ou plusieurs personnes par point, RefList vers Annuaire, sans inviter la personne', async function () {
      await setup();
      step('odj');
      const names = id => qa('.in-pt[data-pt="' + id + '"] .in-tag.in-pres').map(t => t.firstChild.textContent);
      assertDeepEqual(names(1), [], 'point sans présentateur');
      assertDeepEqual(names(2), ['A. Martin']);
      assertDeepEqual(names(3), ['A. Martin', 'B. Durand'], 'plusieurs présentateurs sur un même point');
      assertIncludes(q('.in-pt[data-pt="2"] .in-tag.in-pres').title, 'Présenté par Alice Martin');
      click('menu', { v: 'pres:1' });
      assertTrue(!!q('.in-menu input[data-filter]'), 'recherche dans la liste des personnes');
      click('pt-pres', { id: 1, v: 2 });
      assertDeepEqual(lastFields('UpdateRecord', 'Instance_Points', 1).Presentateurs, ['L', 2]);
      click('pt-pres', { id: 1, v: 3 }); // le menu reste ouvert : plusieurs personnes à la suite
      assertDeepEqual(lastFields('UpdateRecord', 'Instance_Points', 1).Presentateurs, ['L', 2, 3]);
      await waitFor(() => names(1).length === 2, 'deux présentateurs affichés');
      assertDeepEqual(names(1), ['B. Durand', 'C. Petit']);
      assertEqual(qa('.in-menu .in-mi.in-on').length, 2, 'les présentateurs sont repérés dans la liste');
      click('pt-pres', { id: 1, v: 2 }); // recliquer retire
      assertDeepEqual(lastFields('UpdateRecord', 'Instance_Points', 1).Presentateurs, ['L', 3]);
      click('menu', { v: 'pres:1' });
      click('pt-pres', { id: 1, v: 3 });
      assertDeepEqual(lastFields('UpdateRecord', 'Instance_Points', 1).Presentateurs, ['L'], 'dernier présentateur retiré par sa croix');
      assertEqual(calls('AddRecord', 'Instance_Invites').length, 0, 'choisir un présentateur n\'invite personne');
      assertTrue(calls('UpdateRecord', 'Instance_Points').every(c => !('Invites' in c.fields)), 'la liste des invités du point n\'est pas touchée');
    });

    it('présenté par : la vue d\'ensemble nomme les présentateurs de chaque point', async function () {
      await setup();
      const rows = qa('.in-tile .in-mrow').map(r => ({ title: r.querySelector('.in-mtitle').textContent, pres: r.querySelector('.in-mpres') ? r.querySelector('.in-mpres').textContent.trim() : '' }));
      assertEqual(rows.find(r => r.title.startsWith('Approbation')).pres, '');
      assertEqual(rows.find(r => r.title.startsWith('INNOVX')).pres, 'A. Martin');
      assertEqual(rows.find(r => r.title.startsWith('Notifications')).pres, 'A. Martin, B. Durand');
      assertIncludes(qa('.in-mpres').pop().title, 'Présenté par Alice Martin, Bob Durand');
    });

    it('couleurs : en vue Timing (par défaut), chaque heure de la séance a sa teinte ; les points d\'une même heure partagent la leur', async function () {
      await setup();
      step('odj');
      const band = id => (point(id).className.match(/in-b(\d)/) || [])[1];
      assertEqual(band(1), '1', '09:30');
      assertEqual(band(2), '1', '09:40 : même heure que le premier point');
      assertEqual(band(3), '2', '10:10 : l\'heure suivante');
      assertTrue(qa('.in-pt').every(r => !/in-t-/.test(r.className)), 'pas de couleur de type en vue Timing');
      assertDeepEqual(qa('.in-pt').map(r => r.dataset.pt), ['1', '2', '3'], 'ordre de passage');
      assertTrue(q('.in-toolbar .in-seg button.in-on').textContent.indexOf('Timing') >= 0, 'Timing est la vue par défaut');
      assertEqual(qa('.in-grph').length, 0, 'pas de titres de groupe en vue Timing');
      assertEqual(L.timeBand(9 * 60 + 30, 9 * 60 + 30), 1);
      assertEqual(L.timeBand(10 * 60, 9 * 60 + 30), 2);
      assertEqual(L.timeBand(12 * 60 + 10, 9 * 60 + 30), 4);
      assertEqual(L.timeBand(13 * 60, 9 * 60 + 30), 1, 'les teintes reviennent après quatre heures');
    });

    it('vue « par type de décision » : tous les points, pour validation puis discussion puis information — un tri, pas un filtre', async function () {
      await setup({ rows: d => { d.Instance_Points.push({ id: 5, Seance: 2, Ordre: 4, Titre: 'Point d\'information', Nature: 'Information', Duree_min: 10, Projets: ['L'], Invites: ['L'], Presentateurs: ['L'], Lien_type: '', Lien: '' }); } });
      step('odj');
      click('odj-vue', { v: 'type' });
      assertEqual(qa('.in-pt').length, 4, 'aucun point masqué');
      assertDeepEqual(qa('.in-pts > *').map(e => e.classList.contains('in-grph') ? 'G:' + e.childNodes[1].textContent + ':' + e.querySelector('.in-tag-soft').textContent : e.dataset.pt),
        ['G:Pour validation:2', '1', '3', 'G:Pour discussion:1', '2', 'G:Pour information:1', '5'], 'validation (1, 3), discussion (2), information (5), ordre de passage conservé dans chaque groupe');
      assertEqual(point(1).classList.contains('in-t-validation'), true);
      assertEqual(point(2).classList.contains('in-t-discussion'), true);
      assertEqual(point(5).classList.contains('in-t-information'), true);
      assertTrue(qa('.in-pt').every(r => !/in-b\d/.test(r.className)), 'les teintes d\'heure laissent la place à celles du type');
      assertEqual(text('.in-pt[data-pt="3"] .in-ptime'), '10:10–10:35', 'les horaires restent ceux de l\'ordre de passage');
      assertEqual(text('.in-toolbar .in-total'), '4 points · 1 h 15 · fin 10:45');
      assertTrue(q('.in-toolbar .in-seg button.in-on').textContent.indexOf('Par type') >= 0);
      await waitFor(() => (lastFields('UpdateRecord', 'Preferences_Widget') || {}).Inst_odj_vue === 'type', 'vue retenue pour l\'utilisateur');
    });

    it('vue par type : l\'ordre de passage ne se change pas (déplacement verrouillé, rien n\'est écrit), la vue Timing le redonne', async function () {
      await setup();
      step('odj');
      click('odj-vue', { v: 'type' });
      assertTrue(qa('.in-pt [data-act="pt-up"], .in-pt [data-act="pt-down"]').every(b => b.disabled), 'flèches désactivées');
      assertEqual(qa('.in-pt .in-gripbtn[draggable="true"]').length, 0, 'plus de glisser-déposer');
      assertEqual(qa('.in-pt .in-gripbtn.in-locked').length, 3);
      const before = calls('UpdateRecord', 'Instance_Points').length;
      fireMouse(q('[data-act="pt-up"][data-id="3"]'), 'click');
      await new Promise(r => setTimeout(r, 50));
      assertEqual(calls('UpdateRecord', 'Instance_Points').length, before, 'aucun changement d\'ordre');
      click('odj-vue', { v: 'timing' });
      assertEqual(qa('.in-pt .in-gripbtn[draggable="true"]').length, 3, 'glisser-déposer de retour');
      assertTrue(q('[data-act="pt-up"][data-id="1"]').disabled && !q('[data-act="pt-up"][data-id="3"]').disabled, 'flèches de nouveau actives, sauf en haut de liste');
      click('pt-up', { id: 3 });
      await waitFor(() => calls('UpdateRecord', 'Instance_Points').length > before, 'ordre de passage modifié en vue Timing');
    });

    it('la vue de l\'ordre du jour est retenue par utilisateur (Preferences_Widget.Inst_odj_vue) ; une valeur inconnue retombe sur Timing', async function () {
      await setup({ noPrefs: true });
      await window.loadInstancesUserPreferences();
      await window.grist.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', 1, { Inst_odj_vue: 'type' }]]);
      window.InstancesPage._reset();
      await window.loadInstancesUserPreferences();
      await window.InstancesPage.open();
      step('odj');
      assertTrue(qa('.in-grph').length > 0, 'vue Par type restaurée');
      await window.grist.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', 1, { Inst_odj_vue: 'n\'importe quoi' }]]);
      window.InstancesPage._reset();
      await window.loadInstancesUserPreferences();
      await window.InstancesPage.open();
      step('odj');
      assertEqual(qa('.in-grph').length, 0, 'valeur inconnue : vue Timing');
    });

    it('titres lisibles en entier : zone de texte qui prend la hauteur du titre, jamais coupé', async function () {
      const long = 'Revue détaillée du jalon INNOVX : budget, calendrier, risques, dépendances avec les autres projets du programme et décision attendue sur la trajectoire de déploiement pour la rentrée prochaine';
      await withLayout(async () => {
        await setup({ rows: d => { d.Instance_Points[1].Titre = long; } });
        step('odj');
        q('.in-pts').style.width = '900px';
        await settleResize();
        const title = id => q('.in-pt[data-pt="' + id + '"] .in-ptitle');
        assertEqual(title(2).tagName, 'TEXTAREA', 'le titre n\'est plus un champ d\'une seule ligne');
        assertEqual(title(2).value, long, 'le titre complet est dans la zone');
        assertTrue(title(2).offsetHeight >= title(2).scrollHeight, 'rien n\'est coupé (hauteur ≥ contenu) : ' + title(2).offsetHeight + ' / ' + title(2).scrollHeight);
        assertTrue(title(2).offsetHeight > title(1).offsetHeight + 10, 'le long titre est sur plusieurs lignes, le court reste compact');
        title(1).value = long + ' ' + long + ' ' + long;
        fire(title(1), 'input');
        assertTrue(title(1).offsetHeight >= title(1).scrollHeight && title(1).offsetHeight > title(2).offsetHeight, 'la zone grandit pendant la saisie');
        q('.in-pts').style.width = '520px';
        await settleResize();
        assertTrue(title(2).offsetHeight >= title(2).scrollHeight, 'toujours rien de coupé quand la ligne rétrécit');
      });
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      q('.in-pt[data-pt="1"] .in-ptitle').focus();
      q('.in-pt[data-pt="1"] .in-ptitle').dispatchEvent(enter);
      assertTrue(enter.defaultPrevented, 'Entrée valide au lieu d\'insérer un retour à la ligne');
      change('pt-titre', { id: 1 }, 'Nouveau titre');
      assertEqual((await waitCall('UpdateRecord', 'Instance_Points', 1)).Titre, 'Nouveau titre');
    });

    it('les noms de personnes passent en initiales quand la ligne est étroite, et le nom complet reste dans l\'infobulle', async function () {
      assertEqual(L.initials('Alice Martin'), 'AM');
      assertEqual(L.initials('Chloé Petit'), 'CP');
      assertEqual(L.initials('éric de la Fontaine'), 'ÉF');
      assertEqual(L.initials('Madonna'), 'M');
      assertEqual(L.initials(''), '');
      await withLayout(async () => {
        await setup();
        step('odj');
        const tag = q('.in-pt[data-pt="3"] .in-tag.in-pres');
        assertEqual(tag.querySelector('.in-nm').textContent, 'A. Martin');
        assertEqual(tag.querySelector('.in-ini').textContent, 'AM');
        assertIncludes(tag.title, 'Alice Martin');
        const shown = el => getComputedStyle(el).display !== 'none';
        q('.in-pts').style.width = '1700px';
        await waitFor(() => shown(tag.querySelector('.in-nm')) && !shown(tag.querySelector('.in-ini')), 'ligne large : noms complets');
        q('.in-pts').style.width = '1200px';
        await waitFor(() => !shown(tag.querySelector('.in-nm')) && shown(tag.querySelector('.in-ini')), 'ligne étroite : initiales');
      });
    });

    it('un point reste TOUJOURS sur une seule ligne (jamais de repli sous le titre), et la corbeille garde une marge à droite', async function () {
      await withLayout(async () => {
        await setup();
        step('odj');
        // 1232 px = la liste dans le conteneur de l'appli (1280 px moins ses marges) ; 1700 px = plein cadre ou grand écran.
        for (const w of [1700, 1232, 1154, 1100, 1000, 800]) {
          q('.in-pts').style.width = w + 'px';
          await new Promise(r => setTimeout(r, 30));
          qa('.in-pt').forEach(row => {
            const box = row.getBoundingClientRect();
            const kids = Array.from(row.children).map(c => c.getBoundingClientRect());
            const centers = kids.map(k => k.top + k.height / 2);
            assertTrue(Math.max.apply(null, centers) - Math.min.apply(null, centers) <= 4, 'tous les éléments du point sur la même ligne à ' + w + ' px (écart ' + Math.round(Math.max.apply(null, centers) - Math.min.apply(null, centers)) + ' px)');
            // Sous ~1100 px, une ligne très chargée peut faire passer ses ÉTIQUETTES à la ligne dans leur zone ; jamais la ligne du point.
            if (w >= 1100) assertTrue(box.height < 70, 'ligne de hauteur normale à ' + w + ' px (' + Math.round(box.height) + ' px)');
            if (w >= 1000) {
              const trash = row.querySelector('.in-ptrash').getBoundingClientRect();
              assertTrue(box.right - trash.right >= 12, 'corbeille décollée de la bordure à ' + w + ' px (' + Math.round(box.right - trash.right) + ' px)');
              assertTrue(trash.left >= box.left, 'corbeille dans la ligne à ' + w + ' px');
              Array.from(row.children).forEach(child => assertTrue(child.getBoundingClientRect().right <= box.right + 1, 'aucun élément ne déborde à ' + w + ' px : ' + child.className));
            }
          });
        }
        q('.in-pts').style.width = '1232px';
        await new Promise(r => setTimeout(r, 30));
        const title = point(2).querySelector('.in-ptitle').getBoundingClientRect();
        assertTrue(title.width >= 240, 'le titre garde de la place à 1232 px (' + Math.round(title.width) + ' px)');
      });
    });

    it('le titre prend tout l\'espace laissé par les projets et les personnes : la colonne de droite s\'adapte à la ligne la plus chargée, sans bouger tant qu\'on reste dans sa réserve', async function () {
      await withLayout(async () => {
        await setup({ rows: d => { d.Instance_Points.forEach(p => { p.Projets = ['L']; p.Invites = ['L']; p.Presentateurs = ['L', 1]; }); } });
        step('odj');
        const setW = async w => { q('.in-pts').style.width = w + 'px'; await settleResize(); };
        await setW(1154); // la liste dans le conteneur de l'appli
        const rowW = point(1).getBoundingClientRect().width;
        const title = id => point(id).querySelector('.in-ptitle').getBoundingClientRect();
        const groups = id => { const r = point(id).querySelector('.in-pgroups').getBoundingClientRect(); return { left: r.left - point(id).getBoundingClientRect().left, width: r.width }; }; // relatif à la ligne : la page peut défiler
        assertTrue(title(1).width >= 0.38 * rowW, 'le titre occupe l\'espace libre : ' + Math.round(title(1).width) + ' px sur ' + Math.round(rowW) + ' px');
        assertTrue(groups(1).width < 0.3 * rowW, 'la colonne de droite ne garde pas de place inutile (' + Math.round(groups(1).width) + ' px)');
        const w0 = Math.round(title(1).width), g0 = Math.round(groups(1).left);
        // Un invité de plus tient dans la réserve : ni le titre ni la colonne ne bougent.
        click('menu', { v: 'inv:1' });
        click('pt-inv', { id: 1, v: 2 });
        await waitFor(() => point(1).querySelectorAll('.in-g-inv .in-tag').length === 1, 'invité affiché');
        click('menu-close');
        await setW(1154);
        assertEqual(Math.round(title(1).width), w0, 'le titre n\'a pas bougé');
        assertEqual(Math.round(groups(1).left), g0, 'la colonne de droite n\'a pas bougé (pas de décrochage vers la gauche)');
        // Beaucoup de monde sur un point : la colonne s'élargit pour TOUTES les lignes (colonnes alignées), le titre cède la place,
        // et chaque ligne reste sur une seule ligne.
        click('menu', { v: 'pres:1' });
        [2, 3, 4].forEach(v => click('pt-pres', { id: 1, v }));
        await waitFor(() => point(1).querySelectorAll('.in-g-pres .in-tag').length === 4, 'quatre présentateurs affichés');
        click('menu-close');
        await setW(1154);
        assertTrue(title(1).width < w0, 'le titre cède la place à la colonne de droite');
        [2, 3].forEach(id => {
          assertEqual(Math.round(title(id).width), Math.round(title(1).width), 'titre de la ligne ' + id + ' aligné sur la ligne 1');
          assertEqual(Math.round(groups(id).left), Math.round(groups(1).left), 'colonne de droite de la ligne ' + id + ' alignée sur la ligne 1');
        });
        qa('.in-pt').forEach(row => assertTrue(row.getBoundingClientRect().height < 70, 'ligne unique malgré la colonne élargie (' + Math.round(row.getBoundingClientRect().height) + ' px)'));
      });
    });

    it('recherche d\'une personne : sans casse ni accents ni ponctuation, mots dans n\'importe quel ordre, aussi par prénom, nom, e-mail ou poste (des gens de l\'Annuaire n\'étaient pas trouvés)', async function () {
      assertEqual(L.normName('André LÉGER'), 'andre leger');
      assertTrue(L.matchesSearch('andre leger', 'leger andre'), 'ordre libre');
      assertTrue(L.matchesSearch('andre leger', ''), 'recherche vide : tout');
      assertFalse(L.matchesSearch('andre leger', 'andre dupont'), 'chaque mot doit être trouvé');
      await setup({ people: [
        { id: 5, NOM: 'LÉGER', Prenom: 'André', nom_et_Prenom: 'LÉGER André', Email: '', Poste2: 0 },
        { id: 6, NOM: 'DUPONT-MARTIN', Prenom: 'Jean-Pierre', nom_et_Prenom: 'DUPONT-MARTIN Jean-Pierre', Email: 'jp.dm@example.org', Poste2: 0 }
      ] });
      step('invites');
      click('menu', { v: 'addGuest' });
      const input = q('.in-menu input[data-filter]');
      const shown = () => qa('.in-menu .in-mi[data-ft]').filter(b => b.style.display !== 'none').map(b => b.querySelector('.in-mi-main span').textContent);
      const search = value => { input.value = value; fire(input, 'input'); return shown(); };
      assertDeepEqual(shown().sort(), ['DUPONT-MARTIN Jean-Pierre', 'Dana Roy', 'LÉGER André'].sort(), 'les trois personnes non invitées sont proposées');
      assertDeepEqual(search('andre'), ['LÉGER André'], 'sans accent');
      assertDeepEqual(search('ANDRÉ'), ['LÉGER André'], 'avec accent et majuscules');
      assertDeepEqual(search('andre leger'), ['LÉGER André'], 'prénom puis nom, alors que la fiche s\'écrit nom puis prénom');
      assertDeepEqual(search('leger'), ['LÉGER André']);
      assertDeepEqual(search('jean dupont'), ['DUPONT-MARTIN Jean-Pierre'], 'tiret, ordre inversé, nom partiel');
      assertDeepEqual(search('jean-pierre'), ['DUPONT-MARTIN Jean-Pierre'], 'avec le tiret');
      assertDeepEqual(search('jp.dm@example'), ['DUPONT-MARTIN Jean-Pierre'], 'par e-mail');
      assertDeepEqual(search('  roy   dana '), ['Dana Roy'], 'espaces en trop');
      assertDeepEqual(search('zzz'), [], 'aucun résultat');
      assertEqual(search('').length, 3, 'recherche vidée : tout le monde revient');
      // Entrée choisit le premier résultat de la recherche tolérante
      search('andre');
      fireKey(input, 'Enter');
      const added = await waitCall('AddRecord', 'Instance_Invites');
      assertEqual(added.Personne, 5);
    });

    it('protection contre la perte de saisie : tant qu\'on travaille dans GFS (focus dans l\'iframe, ou geste récent), recharger la page demande confirmation', async function () {
      await withLayout(async () => { // le conteneur doit être affiché pour que l'iframe puisse prendre le focus
      await setup();
      window.InstancesPage._setGfsTarget({ url: 'about:blank#gfs', origin: '*' });
      step('cr');
      const frame = await waitFor(() => q('iframe.in-gframe'), 'iframe GFS');
      const unload = () => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
      assertFalse(window.GristBridge.isEditing(), 'GFS ouvert mais pas touché : rien à perdre');
      assertFalse(unload(), 'aucune confirmation tant qu\'on n\'a rien tapé dans GFS');
      frame.focus();
      assertTrue(document.activeElement === frame, 'le focus est dans GFS');
      assertTrue(unload(), 'on tape dans GFS : le rechargement demande confirmation');
      // sorti de l\'iframe : la confirmation reste demandée 10 minutes après le dernier geste, puis cesse
      frame.blur();
      await new Promise(r => setTimeout(r, 30));
      window.GristBridge._touch(frame);
      assertTrue(unload(), 'geste récent dans GFS (enregistrement, focus) : confirmation demandée');
      const realNow = Date.now;
      Date.now = () => realNow() + 11 * 60 * 1000;
      try { assertFalse(unload(), 'plus de geste depuis 11 minutes : plus de confirmation'); } finally { Date.now = realNow; }
      // une iframe retirée de la page ne retient plus personne
      window.GristBridge._touch(frame);
      assertTrue(unload());
      window.InstancesPage._reset();
      assertFalse(unload(), 'GFS fermé : plus de confirmation');
      });
    });

    it('GFS qui écrit dans le document : seule une écriture de CR_PDF fait relire (la table Suivi_Instance seulement) ; une sauvegarde pendant la frappe ne relit rien', async function () {
      await setup();
      const api = window.grist.docApi, original = api.fetchTable, reads = [];
      api.fetchTable = function (name) { reads.push(name); return original.apply(api, arguments); };
      try {
        window.InstancesPage._onGfsWrite([['UpdateRecord', 'Suivi_Instance', 3, { Nom: 'CR en cours de saisie' }]]);
        window.InstancesPage._onGfsWrite([['UpdateRecord', 'GFS_Fichiers', 1, { Nom: 'autre table' }]]);
        window.InstancesPage._onGfsWrite([['BulkUpdateRecord', 'Suivi_Instance', [3], { Nom: ['texte'] }]]);
        await new Promise(r => setTimeout(r, 1600));
        assertDeepEqual(reads, [], 'aucune relecture : ni CR_PDF ni la table Suivi_Instance n\'ont changé pour la page');
        window.InstancesPage._onGfsWrite([['UpdateRecord', 'Suivi_Instance', 3, { CR_PDF: ['L', 78] }]]);
        await waitFor(() => reads.length > 0, 'relecture du PDF exporté');
        await new Promise(r => setTimeout(r, 300));
        assertDeepEqual(reads, ['Suivi_Instance'], 'une seule table relue, pas les dix de la page');
      } finally { api.fetchTable = original; }
    });

    it('menus de recherche (projets, présentateurs, invités) : flèches pour surligner, Entrée pour choisir, comme dans les autres listes', async function () {
      await setup();
      step('odj');
      const input = () => q('.in-menu input[data-filter]');
      const active = () => qa('.in-menu .in-mi.in-active').map(b => b.textContent.replace(/\s+/g, ' ').trim());
      // présentateurs : liste de personnes
      click('menu', { v: 'pres:1' });
      assertTrue(document.activeElement === input() || !!input(), 'le champ de recherche est là');
      assertDeepEqual(active(), [], 'rien de surligné à l\'ouverture');
      fireKey(input(), 'ArrowDown');
      assertEqual(active().length, 1);
      assertIncludes(active()[0], 'Alice Martin', 'la première ligne est surlignée');
      fireKey(input(), 'ArrowDown');
      assertIncludes(active()[0], 'Bob Durand');
      fireKey(input(), 'ArrowUp');
      fireKey(input(), 'ArrowUp');
      assertIncludes(active()[0], 'Dana Roy', 'la liste boucle : au-dessus de la première, la dernière');
      fireKey(input(), 'ArrowDown');
      assertIncludes(active()[0], 'Alice Martin', 'et inversement');
      fireKey(input(), 'ArrowDown');
      fireKey(input(), 'Enter');
      assertDeepEqual(lastFields('UpdateRecord', 'Instance_Points', 1).Presentateurs, ['L', 2], 'Entrée choisit Bob Durand');
      // recherche : seul le résultat visible est parcouru, le premier est surligné d'office
      await waitFor(() => !!input(), 'menu toujours ouvert');
      input().value = 'chlo';
      fire(input(), 'input');
      assertIncludes(active()[0], 'Chloé Petit', 'le premier résultat est surligné dès la saisie');
      assertEqual(active().length, 1);
      fireKey(input(), 'ArrowDown');
      assertIncludes(active()[0], 'Chloé Petit', 'une seule ligne visible : on y reste');
      fireKey(input(), 'Enter');
      assertDeepEqual(lastFields('UpdateRecord', 'Instance_Points', 1).Presentateurs, ['L', 2, 3]);
      // Entrée sans ligne surlignée choisit le premier résultat d'une recherche, et ne fait rien sans recherche
      await waitFor(() => !!input(), 'menu toujours ouvert');
      const before = calls('UpdateRecord', 'Instance_Points').length;
      fireKey(input(), 'Enter');
      assertEqual(calls('UpdateRecord', 'Instance_Points').length, before, 'Entrée sans recherche ni surbrillance ne choisit rien');
      input().value = 'dana';
      fire(input(), 'input');
      qa('.in-menu .in-mi.in-active').forEach(b => b.classList.remove('in-active'));
      fireKey(input(), 'Enter');
      assertDeepEqual(lastFields('UpdateRecord', 'Instance_Points', 1).Presentateurs, ['L', 2, 3, 4], 'premier résultat choisi');
      // Échap referme
      await waitFor(() => !!input(), 'menu toujours ouvert');
      fireKey(input(), 'Escape');
      assertEqual(qa('.in-menu').length, 0, 'Échap referme le menu');
      // projets
      click('menu', { v: 'proj:1' });
      fireKey(input(), 'ArrowDown');
      assertEqual(active().length, 1);
      fireKey(input(), 'Enter');
      assertEqual(lastFields('UpdateRecord', 'Instance_Points', 1).Projets.length, 2, 'un projet relié au clavier');
      // invités
      await waitFor(() => !!input(), 'menu projets toujours ouvert');
      fireKey(input(), 'Escape');
      click('menu', { v: 'inv:1' });
      fireKey(input(), 'ArrowDown');
      fireKey(input(), 'ArrowDown');
      fireKey(input(), 'Enter');
      await waitCall('UpdateRecord', 'Instance_Points', 1);
      assertTrue(lastFields('UpdateRecord', 'Instance_Points', 1).Invites.length >= 2, 'un invité ajouté au clavier');
    });

    it('invités du point : ajouter quelqu\'un ne décale que ce qui est à sa droite (titre, nature, durée, projets et présentateurs restent en place)', async function () {
      await withLayout(async () => {
        await setup();
        step('odj');
        q('.in-pts').style.width = '1300px';
        await settleResize();
        // Positions mesurées depuis le bord gauche de la ligne (la page peut défiler à l'ouverture d'un menu).
        const left = sel => Math.round(point(1).querySelector(sel).getBoundingClientRect().left - point(1).getBoundingClientRect().left);
        const keys = ['.in-ptime', '.in-ptitle', '.in-seg-i', '.in-pdur', '.in-g-proj', '.in-g-pres', '.in-g-inv'];
        // Les lignes aux contenus différents ont les mêmes colonnes de gauche (titre, nature, durée).
        [1, 2, 3].forEach(id => {
          ['.in-ptitle', '.in-seg-i', '.in-pdur'].forEach(sel => {
            const rel = r => Math.round(r.querySelector(sel).getBoundingClientRect().left - r.getBoundingClientRect().left);
            assertEqual(rel(point(id)), rel(point(1)), sel + ' de la ligne ' + id + ' aligné sur la ligne 1');
          });
          assertEqual(Math.round(point(id).querySelector('.in-ptitle').getBoundingClientRect().width), Math.round(point(1).querySelector('.in-ptitle').getBoundingClientRect().width), 'la largeur du titre ne dépend pas du contenu de la ligne');
        });
        const before = {}; keys.forEach(k => { before[k] = left(k); });
        const docLeft = () => Math.round(point(1).querySelector('.in-g-doc').getBoundingClientRect().left - point(1).getBoundingClientRect().left);
        const dossierBefore = docLeft();
        click('menu', { v: 'inv:1' });
        click('pt-inv', { id: 1, v: 1 }); // Alice : première invitée de ce point
        await waitFor(() => point(1).querySelectorAll('.in-g-inv .in-tag').length === 1, 'invitée affichée');
        click('menu-close');
        q('.in-pts').style.width = '1300px'; // le rendu a recréé la liste : même largeur qu'avant
        await settleResize();
        keys.forEach(k => { assertEqual(left(k), before[k], k + ' n\'a pas bougé (pas de décrochage vers la gauche)'); });
        assertTrue(docLeft() >= dossierBefore, 'seul ce qui est à droite peut se décaler, et vers la droite');
      });
    });

    it('étape Invités : les états actifs sont pleins et vifs (vert viendra/présent/écrit/envoyé, rouge excusé/absent, orange à confirmer/horaire modifié)', async function () {
      await withLayout(async () => {
        await setup();
        step('invites');
        const rgb = el => getComputedStyle(el).backgroundColor.match(/\d+/g).slice(0, 3).map(Number);
        const white = el => getComputedStyle(el).color === 'rgb(255, 255, 255)';
        const vivid = (el, name, test) => { const c = rgb(el); assertTrue(test(c[0], c[1], c[2]), name + ' : fond ' + c.join(','));  assertTrue(white(el), name + ' : icône blanche'); };
        const green = (r, g, b) => g > 140 && r < 60 && b < 110, red = (r, g, b) => r > 200 && g < 60 && b < 70, orange = (r, g, b) => r > 200 && g > 100 && g < 150 && b < 40;
        const row = name => qa('.in-grow').filter(r => r.querySelector('.in-pname') && r.querySelector('.in-pname').textContent.indexOf(name) >= 0)[0];
        const rep = (name, cls) => row(name).querySelector('.in-seg-i[aria-label^="Réponse"] button.in-on.' + cls);
        // Alice : « viendra » ; Chloé : « à confirmer » (données du test)
        vivid(rep('Alice', 'in-ok'), 'viendra', green);
        vivid(rep('Chloé', 'in-ask'), 'à confirmer', orange);
        // excusé
        click('g-rep', { id: 3, v: 'excuse' });
        await waitFor(() => qa('.in-seg-i button.in-on.in-no').length > 0, 'réponse « excusé » affichée');
        vivid(q('.in-seg-i[aria-label^="Réponse"] button.in-on.in-no'), 'excusé', red);
        // appel du jour
        click('g-appel', { id: 1, v: 'present' });
        await waitFor(() => !!q('.in-seg-i[aria-label="Appel du jour"] button.in-on.in-ok'), 'appel « présent » affiché');
        vivid(q('.in-seg-i[aria-label="Appel du jour"] button.in-on.in-ok'), 'présent', green);
        click('g-appel', { id: 2, v: 'absent' });
        await waitFor(() => !!q('.in-seg-i[aria-label="Appel du jour"] button.in-on.in-no'), 'appel « absent » affiché');
        vivid(q('.in-seg-i[aria-label="Appel du jour"] button.in-on.in-no'), 'absent', red);
        // invitation écrite / horaire envoyé : pastille verte pleine
        const written = qa('.in-grow .in-ib.in-on').filter(b => b.closest('.in-dispo') === null);
        assertTrue(written.length > 0, 'au moins une invitation écrite ou un horaire envoyé dans les données du test');
        written.forEach(b => vivid(b, 'envoyé / écrit', green));
        // pas encore fait : bouton cerclé, sans fond plein
        const idle = qa('.in-grow .in-ib:not(.in-on):not(.in-warn):not(:disabled)').filter(b => b.closest('.in-dispo') === null)[0];
        assertTrue(!!idle && getComputedStyle(idle).boxShadow !== 'none', 'un bouton pas encore fait est cerclé');
      });
    });

    it('inviter sur un point : une personne déjà dans la liste est simplement reliée, une nouvelle est d\'abord ajoutée « sur un point »', async function () {
      await setup();
      step('odj');
      click('menu', { v: 'inv:3' });
      click('pt-inv', { id: 3, v: 2 }); // Bob, déjà permanent
      assertEqual(calls('AddRecord', 'Instance_Invites').length, 0);
      assertDeepEqual(lastFields('UpdateRecord', 'Instance_Points', 3).Invites, ['L', 2]);
      click('pt-inv', { id: 3, v: 4 }); // Dana, nouvelle (le menu reste ouvert)
      const added = await waitCall('AddRecord', 'Instance_Invites');
      assertEqual(added.Origine, 'Ajouté sur un point');
      assertEqual(added.Personne, 4);
      assertEqual(added.Seance, 2);
      await waitFor(() => { const f = lastFields('UpdateRecord', 'Instance_Points', 3); return f && f.Invites.length === 3; }, 'lien vers la nouvelle invitée');
      assertDeepEqual(lastFields('UpdateRecord', 'Instance_Points', 3).Invites, ['L', 2, 5]);
    });

    it('retirer le dernier point d\'un invité « sur un point » jamais écrit le retire de la liste, mais pas s\'il a déjà reçu son horaire', async function () {
      await setup({ rows: d => { d.Instance_Invites[2].Passage_envoye_le = null; d.Instance_Invites[2].Passage_envoye_heure = ''; } });
      step('odj');
      click('pt-del', { id: 2 });
      assertDeepEqual(calls('RemoveRecord', 'Instance_Invites').map(c => c.id), [3]);
      window.__TEST_CALLS__.length = 0;
      await setup(); // Chloé a déjà reçu son horaire : elle reste dans la liste
      step('odj');
      click('pt-del', { id: 2 });
      assertEqual(calls('RemoveRecord', 'Instance_Invites').length, 0);
    });

    it('dossier du point : lien externe ou PDF GFS (fichiers supprimés écartés), retrait du lien', async function () {
      await setup();
      step('odj');
      assertIncludes(point(2).querySelector('.in-g-doc .in-addb').title, 'INNOVX - dossier', 'le dossier GFS lié est nommé (au survol : le bouton ne garde que l\'icône, pour que la ligne reste sur une seule ligne)');
      assertTrue(point(2).querySelector('.in-g-doc .in-addb').classList.contains('in-on'), 'icône teintée quand un dossier est lié');
      click('menu', { v: 'lien:3' });
      click('pt-link-type', { id: 3, v: 'gfs' });
      assertEqual(lastFields('UpdateRecord', 'Instance_Points', 3).Lien_type, 'Fichier GFS');
      const files = qa('.in-menu .in-mi[data-ft]').map(b => b.textContent);
      assertDeepEqual(files, ['CR CTO n°13.pdf', 'INNOVX - dossier.pdf'].sort((a, b) => a.localeCompare(b, 'fr')));
      click('pt-link-file', { id: 3, v: 'GFS-CR' });
      assertEqual(lastFields('UpdateRecord', 'Instance_Points', 3).Lien, 'GFS-CR');
      click('menu', { v: 'lien:3' });
      click('pt-link-type', { id: 3, v: 'externe' });
      change('pt-url', { id: 3 }, 'https://exemple.fr/dossier');
      assertEqual(lastFields('UpdateRecord', 'Instance_Points', 3).Lien_type, 'Lien externe');
      assertEqual(lastFields('UpdateRecord', 'Instance_Points', 3).Lien, 'https://exemple.fr/dossier');
      await waitFor(() => q(bySel('pt-link-clear', { id: 3 })), 'menu rendu avec le lien');
      click('pt-link-clear', { id: 3 });
      assertEqual(lastFields('UpdateRecord', 'Instance_Points', 3).Lien, '');
    });

    it('la recherche dans un menu masque les lignes sans re-rendre (le champ garde le focus)', async function () {
      await setup();
      step('odj');
      click('menu', { v: 'proj:1' });
      const input = q('.in-menu [data-filter]');
      assertTrue(!!input);
      input.value = 'conventix';
      fire(input, 'input');
      const visible = qa('.in-menu .in-mi[data-ft]').filter(b => b.style.display !== 'none').map(b => b.textContent);
      assertEqual(visible.length, 1);
      assertIncludes(visible[0], 'CONVENTIX');
      assertTrue(input.isConnected, 'le champ n\'a pas été re-rendu');
    });

    it('un titre contenant du HTML n\'est jamais interprété', async function () {
      await setup({ rows: d => { d.Instance_Points[0].Titre = '<img src=x onerror="window.__pwned=1">'; } });
      step('odj');
      assertEqual(qa('.in-pt img').length, 0);
      assertEqual(window.__pwned, undefined);
      assertEqual(qa('.in-pt .in-ptitle')[0].value, '<img src=x onerror="window.__pwned=1">');
    });

    it('valider l\'étape écrit Instance_Validations (date du jour, étape), et la rouvrir supprime la ligne', async function () {
      await setup();
      step('odj');
      click('validate');
      const added = await waitCall('AddRecord', 'Instance_Validations');
      assertEqual(added.Seance, 2);
      assertEqual(added.Etape, 'Ordre du jour');
      assertEqual(added.Date, gd(TODAY));
      assertEqual(added.Par, 0);
      await waitFor(() => q('.in-chip.in-done'), 'puce validée');
      assertEqual(text('.in-chip.in-macro'), '1/6');
      assertIncludes(text('.in-panel .in-stt'), 'Validé le 09/11/2026');
      click('reopen');
      assertEqual(calls('RemoveRecord', 'Instance_Validations').length, 1);
      assertEqual(text('.in-chip.in-macro'), '0/6');
    });

    it('« Par » : la personne validant est retrouvée par son e-mail (Annuaire.Email)', async function () {
      await setup();
      await window.grist.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', 1, { Email_utilisateur: 'bob.durand@example.org' }]]);
      window.InstancesPage._reset();
      await window.loadInstancesUserPreferences();
      await window.InstancesPage.open();
      window.InstancesPage._setToday(TODAY);
      step('odj');
      click('validate');
      assertEqual((await waitCall('AddRecord', 'Instance_Validations')).Par, 2);
    });

    it('sans point, la validation reste bloquée (mode souple : l\'alerte, pas de verrou sur les autres étapes)', async function () {
      await setup({ rows: d => { d.Instance_Points = d.Instance_Points.filter(p => p.Seance !== 2); } });
      step('odj');
      assertTrue(q('[data-act="validate"]').disabled, 'au moins un point est exigé');
      step('invitation');
      assertFalse(q('[data-act="inv-today"]').disabled, 'l\'étape suivante reste accessible');
      assertIncludes(q('.in-panel .in-alert-pill').title, 'Étapes précédentes à valider');
    });
  });

  // -------------------------------------------------------------------------------------------------
  describe('Instances — étape Invités', function () {
    function row(name) { return qa('.in-grow:not(.in-head)').find(r => r.querySelector('.in-pname').textContent.includes(name)); }

    it('liste d\'abord les invités ajoutés sur un point, avec le rappel de leur sujet et le conflit de créneau', async function () {
      await setup();
      step('invites');
      const names = qa('.in-grow:not(.in-head) .in-pname').map(e => e.textContent.trim());
      assertDeepEqual(names, ['Chloé Petit', 'Alice Martin', 'Bob Durand'], 'invités spéciaux en tête');
      assertTrue(!!row('Chloé').querySelector('.in-pname svg'), 'étoile des invités spéciaux');
      assertIncludes(row('Chloé').querySelector('.in-sj').textContent, '09:40 · INNOVX — jalon');
      assertTrue(row('Chloé').classList.contains('in-flag'));
      assertTrue(row('Chloé').querySelector('.in-sj').classList.contains('in-warn'));
      assertFalse(row('Alice').classList.contains('in-flag'));
    });

    it('composition : les membres de l\'instance absents de la séance sont proposés, un bouton les ajoute comme invités de la liste permanente', async function () {
      await setup({ rows: d => { d.COMPOSITION_INSTANCES = COMPOSITION(); } });
      step('invites');
      const banner = q('.in-compo');
      assertTrue(!!banner, 'bandeau de rappel');
      assertIncludes(banner.textContent, '1 membre de la composition n\'est pas invité');
      assertIncludes(banner.textContent, 'D. Roy', 'Dana est la seule absente (Alice est déjà invitée)');
      click('g-compo-add');
      const added = await waitCall('AddRecord', 'Instance_Invites');
      assertEqual(added.Seance, 2);
      assertEqual(added.Personne, 4);
      assertEqual(added.Origine, 'Liste permanente');
      await waitFor(() => !q('.in-compo'), 'bandeau disparu une fois tout le monde invité');
      assertEqual(calls('AddRecord', 'Instance_Invites').length, 1, 'une seule personne ajoutée');
    });

    it('composition : pas de bandeau sans table de composition, ni quand tous les membres sont déjà invités', async function () {
      await setup();
      step('invites');
      assertFalse(!!q('.in-compo'), 'document sans table Composition instances');
      await setup({ rows: d => { d.COMPOSITION_INSTANCES = [{ id: 1, Instance: 1, Personne: 1 }, { id: 2, Instance: 1, Personne: 3 }]; } });
      step('invites');
      assertFalse(!!q('.in-compo'), 'Alice et Chloé sont déjà invitées à la séance');
    });

    it('invitation écrite : cliquer pose la date du jour, recliquer l\'efface', async function () {
      await setup();
      step('invites');
      click('g-ecrit', { id: 2 });
      assertEqual(lastFields('UpdateRecord', 'Instance_Invites', 2).Ecrit_le, gd(TODAY));
      assertTrue(row('Bob').querySelector('[data-act="g-ecrit"]').classList.contains('in-on'));
      click('g-ecrit', { id: 2 });
      assertEqual(lastFields('UpdateRecord', 'Instance_Invites', 2).Ecrit_le, null);
    });

    it('horaire de passage : à envoyer, envoyé, modifié depuis l\'envoi (orange) ; désactivé sans point', async function () {
      await setup();
      step('invites');
      assertTrue(row('Bob').querySelector('[data-act="g-hor"]').disabled, 'Bob n\'a aucun point : pas d\'horaire');
      assertTrue(row('Chloé').querySelector('[data-act="g-hor"]').classList.contains('in-on'), '09:40 déjà envoyé à Chloé');
      assertFalse(row('Alice').querySelector('[data-act="g-hor"]').classList.contains('in-on'));
      click('g-hor', { id: 1 });
      const fields = lastFields('UpdateRecord', 'Instance_Invites', 1);
      assertEqual(fields.Passage_envoye_le, gd(TODAY));
      assertEqual(fields.Passage_envoye_heure, '09:40');
      // L'horaire de Chloé bouge (le premier point dure 20 min) : le bouton passe en orange.
      step('odj');
      change('pt-duree', { id: 1 }, '20');
      await waitFor(() => text('.in-pt[data-pt="2"] .in-ptime').startsWith('09:50'), 'heures recalculées');
      step('invites');
      assertTrue(row('Chloé').querySelector('[data-act="g-hor"]').classList.contains('in-warn'), 'horaire modifié depuis l\'envoi');
      click('g-hor', { id: 3 });
      assertEqual(lastFields('UpdateRecord', 'Instance_Invites', 3).Passage_envoye_heure, '09:50', 'le nouvel horaire est marqué envoyé');
      click('g-hor', { id: 3 });
      assertEqual(lastFields('UpdateRecord', 'Instance_Invites', 3).Passage_envoye_heure, '', 'recliquer efface');
    });

    it('réponse à l\'invitation et appel du jour sont deux colonnes distinctes ; l\'appel se décoche en recliquant', async function () {
      await setup();
      step('invites');
      click('g-rep', { id: 2, v: 'viendra' });
      assertEqual(lastFields('UpdateRecord', 'Instance_Invites', 2).Reponse, 'Viendra');
      click('g-rep', { id: 2, v: 'excuse' });
      assertEqual(lastFields('UpdateRecord', 'Instance_Invites', 2).Reponse, 'Excusé(e)');
      click('g-appel', { id: 2, v: 'present' });
      assertEqual(lastFields('UpdateRecord', 'Instance_Invites', 2).Appel, 'Présent(e)');
      assertFalse('Reponse' in lastFields('UpdateRecord', 'Instance_Invites', 2), 'l\'appel n\'écrit pas la réponse');
      assertEqual(window.InstancesPage.state.model.seanceById[2].guests.find(g => g.id === 2).reponse, 'excuse', 'la réponse à l\'invitation reste « excusé(e) »');
      click('g-appel', { id: 2, v: 'present' });
      assertEqual(lastFields('UpdateRecord', 'Instance_Invites', 2).Appel, '');
    });

    it('créneau de présence : boutons « début » / « fin » en un clic, sélecteurs d\'heure à 15 minutes, effacement', async function () {
      await setup();
      step('invites');
      click('g-start', { id: 2 });
      assertEqual(lastFields('UpdateRecord', 'Instance_Invites', 2).Dispo_de, '09:30');
      click('g-end', { id: 2 });
      assertEqual(lastFields('UpdateRecord', 'Instance_Invites', 2).Dispo_a, '12:30');
      click('menu', { v: 't:2:de' });
      const options = qa('.in-menu.in-tgrid .in-mi').map(b => b.textContent);
      assertEqual(options[0], '09:30');
      assertEqual(options[1], '09:45');
      assertEqual(options[options.length - 2], '12:30', 'jusqu\'à l\'heure de fin de la séance');
      click('time-pick', { s: 'g-de', id: 2, v: '10:00' });
      assertEqual(lastFields('UpdateRecord', 'Instance_Invites', 2).Dispo_de, '10:00');
      click('menu', { v: 't:2:de' });
      click('time-clear', { s: 'g-de', id: 2 });
      assertEqual(lastFields('UpdateRecord', 'Instance_Invites', 2).Dispo_de, '');
    });

    it('excusée : tous ses points passent en conflit ; le commentaire libre s\'enregistre', async function () {
      await setup();
      step('invites');
      click('g-rep', { id: 1, v: 'excuse' });
      step('odj');
      assertIncludes(point(2).querySelector('.in-ptime span').title, 'Alice Martin : excusé(e)');
      step('invites');
      change('g-comm', { id: 2 }, 'En déplacement');
      assertEqual(lastFields('UpdateRecord', 'Instance_Invites', 2).Commentaire, 'En déplacement');
    });

    it('étape Invités : chaque invité tient TOUJOURS sur une seule ligne, de la grande largeur au petit écran (nom + poste côte à côte, sujets en rang, heures vides sans gonfler la ligne)', async function () {
      await withLayout(async () => {
        const sujet = (id, ordre, titre) => ({ id, Seance: 2, Ordre: ordre, Titre: titre, Nature: 'Discussion', Duree_min: 10, Projets: ['L'], Invites: ['L', 1], Presentateurs: ['L'], Lien_type: '', Lien: '' });
        await setup({ rows: d => {
          d.Instance_Points.push(sujet(5, 4, 'Un sujet au titre vraiment très long pour la place disponible dans la colonne'), sujet(6, 5, 'Deuxième sujet long lui aussi'), sujet(7, 6, 'Troisième'));
        } });
        step('invites');
        for (const w of [1500, 1150, 1000, 940, 900, 860]) {
          q('.in-gwrap').style.width = w + 'px';
          await new Promise(r => setTimeout(r, 40));
          qa('.in-grow').forEach(row => {
            const box = row.getBoundingClientRect(), name = (row.querySelector('.in-pname') || row).textContent.trim() || 'en-tête';
            assertTrue(box.height < 52, 'ligne « ' + name + ' » sur une seule ligne à ' + w + ' px (' + Math.round(box.height) + ' px)');
            const kids = Array.from(row.children).map(c => c.getBoundingClientRect());
            const centers = kids.map(k => k.top + k.height / 2);
            assertTrue(Math.max.apply(null, centers) - Math.min.apply(null, centers) <= 6, 'tous les éléments de « ' + name + ' » à la même hauteur à ' + w + ' px');
            assertTrue(row.scrollWidth <= row.clientWidth + 1, 'rien ne déborde à ' + w + ' px (' + row.scrollWidth + ' > ' + row.clientWidth + ')');
          });
        }
        const alice = row('Alice');
        assertIncludes(alice.querySelector('.in-pcell').title, 'Alice Martin — ', 'nom et poste complets au survol');
        assertIncludes(alice.querySelector('.in-sjrow').title, 'Un sujet au titre vraiment très long', 'tous les sujets au survol');
        assertEqual(alice.querySelectorAll('.in-sj').length, 4, 'les quatre sujets sont là, en rang');
        // sous ~830 px, la ligne garde sa largeur minimale (la page défile) plutôt que de se replier
        q('.in-gwrap').style.width = '700px';
        await new Promise(r => setTimeout(r, 40));
        assertTrue(alice.getBoundingClientRect().height < 52, 'toujours une seule ligne à 700 px');
      });
    });

    it('étape Invités : tri par clic sur les en-têtes Personne / Réponse / Appel du jour (croissant, décroissant, ordre d\'origine), retenu par utilisateur', async function () {
      // logique pure : présents d'abord en croissant, nom de A à Z à égalité
      const names = { 1: 'Alice', 2: 'Bob', 3: 'Chloé', 4: 'Dana' };
      const guests = [
        { id: 1, personneId: 3, origine: 'permanent', reponse: 'attente', appel: '' }, { id: 2, personneId: 1, origine: 'permanent', reponse: 'excuse', appel: 'absent' },
        { id: 3, personneId: 2, origine: 'permanent', reponse: 'viendra', appel: 'present' }, { id: 4, personneId: 4, origine: 'point', reponse: 'viendra', appel: '' }
      ];
      const nameOf = g => names[g.personneId], order = tri => L.sortGuests(guests, tri, nameOf).map(g => nameOf(g));
      assertDeepEqual(order(''), ['Dana', 'Chloé', 'Alice', 'Bob'], 'ordre d\'origine : invités ajoutés sur un point d\'abord');
      assertDeepEqual(order('reponse:asc'), ['Bob', 'Dana', 'Chloé', 'Alice'], 'viendra, puis à confirmer, puis excusé ; A→Z à égalité');
      assertDeepEqual(order('reponse:desc'), ['Alice', 'Chloé', 'Bob', 'Dana'], 'excusé d\'abord');
      assertDeepEqual(order('appel:asc'), ['Bob', 'Chloé', 'Dana', 'Alice'], 'présent, pas encore appelé, absent');
      assertDeepEqual(order('appel:desc'), ['Alice', 'Chloé', 'Dana', 'Bob']);
      assertDeepEqual(order('nom:asc'), ['Alice', 'Bob', 'Chloé', 'Dana']);
      assertDeepEqual(order('nom:desc'), ['Dana', 'Chloé', 'Bob', 'Alice']);
      assertDeepEqual(order('n\'importe quoi'), order(''), 'valeur inconnue : ordre d\'origine');
      assertEqual(L.nextGuestTri('', 'appel'), 'appel:asc');
      assertEqual(L.nextGuestTri('appel:asc', 'appel'), 'appel:desc');
      assertEqual(L.nextGuestTri('appel:desc', 'appel'), '');
      assertEqual(L.nextGuestTri('appel:desc', 'nom'), 'nom:asc', 'un autre en-tête repart en croissant');
      // page
      await setup({ noPrefs: true });
      await window.loadInstancesUserPreferences();
      step('invites');
      const shown = () => qa('.in-grow:not(.in-head) .in-pn').map(n => n.textContent.trim());
      assertDeepEqual(shown(), ['Chloé Petit', 'Alice Martin', 'Bob Durand'], 'ordre d\'origine (Chloé, ajoutée sur un point, d\'abord)');
      click('g-appel', { id: 2, v: 'present' }); // Bob est présent
      await waitFor(() => !!row('Bob').querySelector('.in-on.in-ok[aria-label="Présent(e)"]'), 'Bob présent');
      click('g-sort', { v: 'appel' });
      assertDeepEqual(shown(), ['Bob Durand', 'Alice Martin', 'Chloé Petit'], 'les présents d\'abord');
      assertTrue(q('.in-hsort.in-on[data-v="appel"]') !== null, 'l\'en-tête trié est mis en évidence');
      await waitFor(() => (lastFields('UpdateRecord', 'Preferences_Widget') || {}).Inst_tri_invites === 'appel:asc', 'tri retenu pour l\'utilisateur');
      click('g-sort', { v: 'appel' });
      assertDeepEqual(shown(), ['Alice Martin', 'Chloé Petit', 'Bob Durand'], 'les absents / non appelés d\'abord');
      click('g-sort', { v: 'appel' });
      assertDeepEqual(shown(), ['Chloé Petit', 'Alice Martin', 'Bob Durand'], 'retour à l\'ordre d\'origine');
      click('g-sort', { v: 'reponse' });
      assertDeepEqual(shown(), ['Alice Martin', 'Bob Durand', 'Chloé Petit'], 'Alice viendra ; Bob et Chloé à confirmer');
      // restauré à la réouverture ; valeur inconnue = ordre d'origine
      await window.grist.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', 1, { Inst_tri_invites: 'reponse:asc' }]]);
      window.InstancesPage._reset();
      await window.loadInstancesUserPreferences();
      await window.InstancesPage.open();
      step('invites');
      assertDeepEqual(shown(), ['Alice Martin', 'Bob Durand', 'Chloé Petit'], 'tri restauré');
      await window.grist.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', 1, { Inst_tri_invites: 'n\'importe quoi' }]]);
      window.InstancesPage._reset();
      await window.loadInstancesUserPreferences();
      await window.InstancesPage.open();
      step('invites');
      assertDeepEqual(shown(), ['Chloé Petit', 'Alice Martin', 'Bob Durand'], 'valeur inconnue : ordre d\'origine');
    });

    it('ajouter une personne (invitée « sur un point ») et la retirer ; un invité repris de la liste permanente se retire aussi, de cette séance seulement', async function () {
      await setup();
      step('invites');
      assertTrue(!!row('Alice').querySelector('[data-act="g-del"]'), 'corbeille aussi pour un invité de la liste permanente (repris par erreur de la composition, par exemple)');
      assertIncludes(row('Alice').querySelector('[data-act="g-del"]').title, 'cette séance');
      click('menu', { v: 'addGuest' });
      assertEqual(qa('.in-menu .in-mi[data-ft]').length, 1, 'seule Dana n\'est pas encore invitée');
      click('g-add', { v: 4 });
      const added = await waitCall('AddRecord', 'Instance_Invites');
      assertEqual(added.Origine, 'Ajouté sur un point');
      await waitFor(() => !!row('Dana'), 'Dana affichée');
      click('g-del', { id: 3 });
      assertEqual(calls('RemoveRecord', 'Instance_Invites')[0].id, 3);
      assertDeepEqual(lastFields('UpdateRecord', 'Instance_Points', 2).Invites, ['L', 1], 'Chloé est retirée du point');
      // un invité de la liste permanente : retiré de la séance, la liste permanente de l'instance n'est pas modifiée
      const before = calls('RemoveRecord', 'Instance_Invites').length;
      click('g-del', { id: 1 });
      assertEqual(calls('RemoveRecord', 'Instance_Invites').length, before + 1);
      assertEqual(calls('RemoveRecord', 'Instance_Invites')[before].id, 1);
      assertEqual(calls('UpdateRecord', 'Instances').length, 0, 'la liste permanente de l\'instance (Invites_permanents) n\'est pas touchée');
    });
  });

  // -------------------------------------------------------------------------------------------------
  describe('Instances — mails, compte rendu, notifications', function () {
    it('mail d\'invitation : la date d\'envoi vaut validation et marque les invités non écrits', async function () {
      await setup();
      step('invitation');
      assertIncludes(text('.in-card .in-tag'), 'Invitation CTO', 'modèle choisi dans le paramétrage');
      click('inv-today');
      assertEqual(lastFields('UpdateRecord', 'Suivi_Instance', 2).Mail_invitation_le, gd(TODAY));
      assertEqual(lastFields('UpdateRecord', 'Instance_Invites', 2).Ecrit_le, gd(TODAY));
      assertEqual(lastFields('UpdateRecord', 'Instance_Invites', 3).Ecrit_le, gd(TODAY));
      assertEqual(calls('UpdateRecord', 'Instance_Invites').filter(c => c.id === 1).length, 0, 'Alice était déjà écrite');
      assertTrue(!!q('.in-chip.in-done'));
      assertIncludes(text('.in-panel .in-stt'), 'Envoyé le 09/11/2026');
      click('reopen');
      assertEqual(lastFields('UpdateRecord', 'Suivi_Instance', 2).Mail_invitation_le, null);
      change('inv-date', null, '2026-11-12');
      await waitFor(() => lastFields('UpdateRecord', 'Suivi_Instance', 2).Mail_invitation_le === gd('2026-11-12'), 'date saisie');
    });

    it('compte rendu : V0, relecture à trois états (à relire / modifs demandées en bleu / validé), validé tout seul quand tous ont validé', async function () {
      await setup();
      step('cr');
      assertTrue(q('[data-act="validate"]').disabled);
      click('v0-toggle');
      assertEqual(lastFields('UpdateRecord', 'Suivi_Instance', 2).CR_V0_le, gd(TODAY));
      assertTrue(q('.in-tchip').classList.contains('in-on'));
      click('rel-set', { id: 1, v: 'valide' });
      const first = await waitCall('AddRecord', 'Instance_Relectures');
      assertEqual(first.Statut, 'Validée');
      assertEqual(first.Personne, 1);
      click('rel-set', { id: 2, v: 'modifs' });
      await waitFor(() => calls('AddRecord', 'Instance_Relectures').length === 2, 'deuxième relecteur');
      assertEqual(calls('AddRecord', 'Instance_Relectures')[1].fields.Statut, 'Modifs demandées');
      await waitFor(() => qa('.in-rvw.in-modifs').length === 1, 'relecteur en bleu');
      assertEqual(qa('.in-rvw.in-valide').length, 1);
      assertTrue(q('[data-act="validate"]').disabled, 'des modifications sont demandées');
      assertIncludes(q('.in-panel .in-alert-pill').title, 'a demandé des modifications');
      assertEqual(calls('AddRecord', 'Instance_Validations').length, 0, 'pas validé tant que tout le monde n\'a pas validé');
      click('rel-set', { id: 2, v: 'valide' });
      assertEqual(lastFields('UpdateRecord', 'Instance_Relectures', 2).Statut, 'Validée', 'la ligne du relecteur est mise à jour, pas dupliquée');
      const auto = await waitCall('AddRecord', 'Instance_Validations');
      assertEqual(auto.Etape, 'Compte rendu', 'l\'étape se valide toute seule avec le dernier relecteur');
      assertEqual(auto.Seance, 2);
      assertEqual(auto.Date, gd(TODAY));
      await waitFor(() => !q('[data-act="validate"]') && !!q('[data-act="reopen"]'), 'étape validée');
      click('rel-set', { id: 1, v: 'none' });
      assertEqual(calls('RemoveRecord', 'Instance_Relectures').length, 1, 'retour à « à relire » supprime la ligne');
    });

    it('compte rendu : validation automatique dans l\'autre ordre (relecteurs d\'abord, V0 en dernier), en une seule écriture', async function () {
      await setup();
      step('cr');
      click('rel-set', { id: 1, v: 'valide' });
      await waitCall('AddRecord', 'Instance_Relectures');
      click('rel-set', { id: 2, v: 'valide' });
      await waitFor(() => calls('AddRecord', 'Instance_Relectures').length === 2, 'deux relecteurs');
      assertEqual(calls('AddRecord', 'Instance_Validations').length, 0, 'sans V0, pas validé');
      const actionsBefore = window.__TEST_CALLS__.length;
      click('v0-toggle');
      const auto = await waitCall('AddRecord', 'Instance_Validations');
      assertEqual(auto.Etape, 'Compte rendu');
      assertEqual(lastFields('UpdateRecord', 'Suivi_Instance', 2).CR_V0_le, gd(TODAY));
      assertEqual(window.__TEST_CALLS__.length - actionsBefore, 2, 'V0 + validation : deux actions, une seule demande à Grist');
      await waitFor(() => !!q('[data-act="reopen"]'), 'étape validée');
      assertEqual(calls('AddRecord', 'Instance_Validations').length, 1, 'une seule validation');
    });

    it('compte rendu : jamais validé tout seul sans V0, avec une demande de modifications, ou sans relecteur défini', async function () {
      await setup();
      step('cr');
      click('rel-set', { id: 1, v: 'valide' });
      await waitCall('AddRecord', 'Instance_Relectures');
      click('rel-set', { id: 2, v: 'valide' });
      await waitFor(() => calls('AddRecord', 'Instance_Relectures').length === 2, 'deux relecteurs');
      await new Promise(r => setTimeout(r, 200));
      assertEqual(calls('AddRecord', 'Instance_Validations').length, 0, 'tous les relecteurs ont validé, mais pas de V0');
      click('rel-set', { id: 2, v: 'modifs' });
      click('v0-toggle');
      await waitFor(() => !!lastFields('UpdateRecord', 'Suivi_Instance', 2), 'V0 posée');
      await new Promise(r => setTimeout(r, 200));
      assertEqual(calls('AddRecord', 'Instance_Validations').length, 0, 'un relecteur demande des modifications');
      // sans relecteur défini sur l'instance : la V0 seule ne valide pas (le bouton ✓ reste disponible)
      await setup({ rows: d => { d.Instances[0].Relecteurs_CR = ['L']; } });
      step('cr');
      click('v0-toggle');
      await waitFor(() => lastFields('UpdateRecord', 'Suivi_Instance', 2), 'V0 posée');
      await new Promise(r => setTimeout(r, 200));
      assertEqual(calls('AddRecord', 'Instance_Validations').length, 0, 'aucun relecteur défini');
      assertFalse(q('[data-act="validate"]').disabled, 'validation manuelle toujours possible');
    });

    it('compte rendu : « Rouvrir l\'étape » après une validation automatique n\'est pas défait tout seul', async function () {
      await setup({ rows: d => { d.Suivi_Instance[1].CR_V0_le = gd('2026-11-10'); } });
      step('cr');
      click('rel-set', { id: 1, v: 'valide' });
      await waitCall('AddRecord', 'Instance_Relectures');
      click('rel-set', { id: 2, v: 'valide' });
      await waitCall('AddRecord', 'Instance_Validations');
      await waitFor(() => !!q('[data-act="reopen"]'), 'étape validée');
      click('reopen');
      await waitFor(() => calls('RemoveRecord', 'Instance_Validations').length === 1, 'validation supprimée');
      await waitFor(() => !!q('[data-act="validate"]'), 'étape rouverte');
      await new Promise(r => setTimeout(r, 300));
      assertEqual(calls('AddRecord', 'Instance_Validations').length, 1, 'pas de nouvelle validation automatique à la réouverture');
      assertFalse(q('[data-act="validate"]').disabled, 'toujours validable à la main');
    });

    // GFS est chargé dans une iframe vide (about:blank) : aucune connexion réseau pendant les tests ; origin '*' = le pont ne
    // vérifie que la fenêtre de l'iframe (comme ?bridgeOrigin=* en réel).
    const gfsTarget = { url: 'about:blank#gfs-test', origin: '*' };
    function fromGfs(frame, message) { window.dispatchEvent(new MessageEvent('message', { data: message, source: frame.contentWindow, origin: 'null' })); }

    it('compte rendu : GFS est intégré sous la carte, relié à la ligne de la séance, et son iframe n\'est jamais recréée par un clic voisin', async function () {
      await setup();
      window.InstancesPage._setGfsTarget(gfsTarget);
      assertEqual(qa('iframe.in-gframe').length, 0, 'GFS ne se charge qu\'à l\'ouverture de l\'étape Compte rendu');
      step('cr');
      const frame = await waitFor(() => q('iframe.in-gframe'), 'iframe GFS');
      assertEqual(frame.getAttribute('src'), 'about:blank#gfs-test');
      const bridge = window.InstancesPage._gfs.bridge;
      assertTrue(!!bridge, 'le pont Grist est branché');
      assertEqual(bridge.getState().tableId, 'Suivi_Instance');
      assertEqual(bridge.getState().rowId, 2, 'la ligne de la séance n°14 est l\'enregistrement sélectionné de GFS');
      assertIncludes(text('.in-vbar'), 'Rédiger dans GFS');
      assertTrue(q('.in-vbar .in-seg button.in-on').textContent.includes('Rédiger dans GFS'));
      assertIncludes(text('.in-vbar [data-gfs-status]'), 'Connexion à GFS');
      click('v0-toggle');
      click('rel-set', { id: 1, v: 'valide' });
      await waitCall('AddRecord', 'Instance_Relectures');
      assertTrue(frame.isConnected && q('iframe.in-gframe') === frame, 'l\'iframe n\'est pas recréée par un clic voisin (ni par le rendu qui suit une écriture)');
      assertEqual(qa('iframe.in-gframe').length, 1);
      // GFS annonce qu'il est prêt : le pont le dit dans la barre.
      fromGfs(frame, { mtype: 5 });
      await waitFor(() => text('.in-vbar [data-gfs-status]').includes('GFS connecté'), 'GFS connecté');
      // Hors de l'étape, la région est masquée mais l'iframe reste en vie (GFS garde son état) ; au retour c'est la même.
      step('macro');
      assertTrue(q('[data-region="viewer"]').hidden, 'région masquée hors de l\'étape');
      assertTrue(frame.isConnected && window.InstancesPage._gfs.frame === frame);
      step('cr');
      assertFalse(q('[data-region="viewer"]').hidden);
      assertTrue(q('iframe.in-gframe') === frame, 'même iframe au retour');
      // Changer de séance : GFS reçoit l'autre ligne sans être rechargé.
      click('menu', { v: 'seance' });
      click('seance-pick', { id: 1 });
      step('cr');
      assertEqual(window.InstancesPage._gfs.bridge.getState().rowId, 1, 'le « select by » suit la séance affichée');
      assertTrue(q('iframe.in-gframe') === frame);
    });

    it('compte rendu : ce que GFS écrit dans Suivi_Instance (le PDF exporté) est relu, et le bouton « Télécharger le CR » s\'active', async function () {
      await setup();
      window.InstancesPage._setGfsTarget(gfsTarget);
      step('cr');
      const frame = await waitFor(() => q('iframe.in-gframe'), 'iframe GFS');
      const dl = () => q('[data-act="cr-download"]');
      assertTrue(dl().disabled, 'pas de PDF : bouton inactif');
      assertIncludes(dl().title, 'CR_PDF');
      fromGfs(frame, { mtype: 5 });
      await waitFor(() => window.InstancesPage._gfs.bridge.getState().ready, 'pont prêt');
      // GFS (ou publipostage+ dedans) range le PDF exporté dans la cellule CR_PDF de la séance, via le pont.
      fromGfs(frame, { mtype: 1, iface: 'GristDocAPI', meth: 'applyUserActions', args: [[['UpdateRecord', 'Suivi_Instance', 2, { CR_PDF: ['L', 90] }]]], reqId: 1 });
      await waitCall('UpdateRecord', 'Suivi_Instance', 2);
      await waitFor(() => !dl().disabled, 'bouton « Télécharger le CR » actif après la relecture des tables');
      assertDeepEqual(window.InstancesPage.state.model.seanceById[2].crPdf, [90]);
      assertTrue(q('iframe.in-gframe') === frame, 'la relecture ne recrée pas l\'iframe de GFS');
      assertIncludes(text('.in-vbar [data-gfs-status]'), 'GFS connecté');
      assertTrue(dl().title.indexOf('Pas encore') < 0);
    });

    it('compte rendu : une écriture de GFS dans une autre table ne relit rien', async function () {
      await setup();
      window.InstancesPage._setGfsTarget(gfsTarget);
      step('cr');
      const frame = await waitFor(() => q('iframe.in-gframe'), 'iframe GFS');
      fromGfs(frame, { mtype: 5 });
      await waitFor(() => window.InstancesPage._gfs.bridge.getState().ready, 'pont prêt');
      const model = window.InstancesPage.state.model;
      fromGfs(frame, { mtype: 1, iface: 'GristDocAPI', meth: 'applyUserActions', args: [[['AddRecord', 'GFS_Rangement', null, { Nom: 'x' }]]], reqId: 2 });
      await new Promise(resolve => setTimeout(resolve, 1600));
      assertTrue(window.InstancesPage.state.model === model, 'le modèle n\'a pas été reconstruit');
    });

    it('télécharger le CR : ouvre le dernier PDF de la cellule CR_PDF de la séance dans un nouvel onglet', async function () {
      await setup({ rows: d => { d.Suivi_Instance[1].CR_PDF = ['L', 90, 91]; } });
      window.InstancesPage._setGfsTarget(gfsTarget);
      step('cr');
      const btn = q('[data-act="cr-download"]');
      assertFalse(btn.disabled);
      const original = window.grist.docApi.getAccessToken;
      window.grist.docApi.getAccessToken = async () => ({ token: 'jeton-de-test', baseUrl: 'https://grist.exemple/api/docs/doc1', ttlMsecs: 60000 });
      const opened = [], fakeWin = { location: {}, close() {} };
      const originalOpen = window.open;
      window.open = (...args) => { opened.push(args); return fakeWin; };
      try {
        click('cr-download');
        await waitFor(() => fakeWin.location.href, 'adresse du PDF');
      } finally { window.open = originalOpen; window.grist.docApi.getAccessToken = original; }
      const url = fakeWin.location.href;
      assertIncludes(url, '/attachments/91/download', 'le dernier fichier de la cellule');
      assertIncludes(url, 'auth=jeton-de-test');
      assertIncludes(url, 'tableId=Suivi_Instance');
      assertIncludes(url, 'colId=CR_PDF');
      assertIncludes(url, 'rowId=2');
    });

    it('place pour GFS : le bandeau se replie (heure et salle masquées), la préférence est retenue par utilisateur', async function () {
      await withLayout(async () => {
        await setup();
        window.InstancesPage._setGfsTarget(gfsTarget);
        step('cr');
        const shown = sel => qa(sel).every(el => getComputedStyle(el).display !== 'none');
        assertEqual(qa('.in-band .in-bhide').length, 2, 'heure et salle sont les deux éléments repliables');
        assertTrue(shown('.in-band .in-bhide'), 'bandeau déplié par défaut');
        assertEqual(q('[data-act="fold"][data-v="bandeau"]').getAttribute('aria-expanded'), 'true');
        click('fold', { v: 'bandeau' });
        assertTrue(q('.in-band').classList.contains('in-fold'));
        assertFalse(qa('.in-band .in-bhide').some(el => getComputedStyle(el).display !== 'none'), 'heure et salle masquées');
        assertTrue(!!q('.in-band .in-sel') && !!q('.in-band .in-stepper'), 'la séance et les étapes restent');
        assertEqual(q('[data-act="fold"][data-v="bandeau"]').getAttribute('aria-expanded'), 'false');
        await waitFor(() => JSON.parse((lastFields('UpdateRecord', 'Preferences_Widget') || {}).Inst_cadre || '{}').bandeau === true, 'bandeau replié retenu');
        click('fold', { v: 'bandeau' });
        assertFalse(q('.in-band').classList.contains('in-fold'));
        assertTrue(shown('.in-band .in-bhide'), 'rouvert');
      });
    });

    it('place pour GFS : la carte de relecture se replie en « V0 · 1/2 validé » avec le téléchargement dans l\'en-tête', async function () {
      await setup({ rows: d => { d.Suivi_Instance[1].CR_PDF = ['L', 90]; d.Suivi_Instance[1].CR_V0_le = gd('2026-11-10'); } });
      window.InstancesPage._setGfsTarget(gfsTarget);
      step('cr');
      assertTrue(!!q('.in-card .in-rvw'), 'carte dépliée par défaut');
      assertEqual(qa('[data-cr-summary]').length, 0);
      click('rel-set', { id: 1, v: 'valide' });
      await waitCall('AddRecord', 'Instance_Relectures');
      await waitFor(() => qa('.in-rvw.in-valide, .in-rvw.in-ok').length >= 0 && q('.in-card'), 'rendu');
      click('fold', { v: 'cr' });
      assertEqual(qa('.in-card').length, 0, 'carte masquée');
      assertEqual(text('[data-cr-summary]'), 'V0 rédigée · 1/2 validé');
      assertTrue(!!q('.in-ph [data-act="cr-download"]') && !q('.in-ph [data-act="cr-download"]').disabled, 'le téléchargement reste à portée (PDF présent)');
      assertEqual(q('[data-act="fold"][data-v="cr"]').getAttribute('aria-expanded'), 'false');
      assertTrue(!!q('iframe.in-gframe'), 'GFS n\'est pas touché');
      await waitFor(() => JSON.parse((lastFields('UpdateRecord', 'Preferences_Widget') || {}).Inst_cadre || '{}').cr === true, 'relecture repliée retenue');
      click('fold', { v: 'cr' });
      assertTrue(!!q('.in-card .in-rvw'), 'carte de nouveau dépliée');
      assertEqual(qa('[data-cr-summary]').length, 0);
    });

    it('place pour GFS : relecture repliée sans PDF, le téléchargement de l\'en-tête est désactivé', async function () {
      await setup();
      window.InstancesPage._setGfsTarget(gfsTarget);
      step('cr');
      click('fold', { v: 'cr' });
      assertEqual(text('[data-cr-summary]'), 'V0 à rédiger · 0/2 validé');
      assertTrue(q('.in-ph [data-act="cr-download"]').disabled);
    });

    it('plein cadre : l\'en-tête de l\'appli et les panneaux disparaissent, GFS prend toute la hauteur, sans être recréé ; Échap revient', async function () {
      await withLayout(async () => {
        await setup();
        window.InstancesPage._setGfsTarget(gfsTarget);
        // tests/index.html n'a pas l'en-tête de l'appli : on en pose un le temps du test.
        const header = document.createElement('header');
        header.id = 'header';
        document.getElementById('app-dom').appendChild(header);
        try {
        step('cr');
        const frame = await waitFor(() => q('iframe.in-gframe'), 'iframe GFS');
        assertFalse(root().classList.contains('in-plein'));
        assertTrue(!!q('[data-act="cr-hauteur"]'), 'bouton de hauteur hors plein cadre');
        assertEqual(q('[data-act="cr-plein"]').getAttribute('aria-pressed'), 'false');
        click('cr-plein');
        assertTrue(root().classList.contains('in-plein'));
        assertTrue(document.body.classList.contains('in-plein-body'));
        assertEqual(getComputedStyle(header).display, 'none', 'en-tête de l\'appli masqué');
        assertEqual(getComputedStyle(q('[data-region="main"]')).display, 'none', 'bandeau et panneaux masqués');
        assertTrue(q('iframe.in-gframe') === frame && frame.isConnected, 'GFS n\'est pas recréé');
        assertEqual(Math.round(frame.getBoundingClientRect().height), window.innerHeight - 46, 'GFS occupe la hauteur de l\'écran moins la fine barre');
        assertEqual(Math.round(q('.in-vbar').getBoundingClientRect().height), 46);
        assertIncludes(text('.in-vbar .in-vsub'), 'CTO Innovation · n°14 · 23/11/2026', 'la barre rappelle l\'instance et la séance');
        assertIncludes(text('.in-vbar'), 'V0 à rédiger · 0/2 validé');
        assertEqual(qa('[data-act="cr-hauteur"]').length, 0, 'pas de réglage de hauteur en plein cadre');
        assertEqual(q('[data-act="cr-plein"]').getAttribute('aria-pressed'), 'true');
        assertIncludes(text('[data-act="cr-plein"]'), 'Quitter le plein cadre');
        await waitFor(() => JSON.parse((lastFields('UpdateRecord', 'Preferences_Widget') || {}).Inst_cadre || '{}').plein === true, 'plein cadre retenu');
        // Hors de l'étape Compte rendu, la page reprend son aspect habituel (la préférence est gardée pour le retour).
        window.InstancesPage.state.prefs.etape = 'odj'; window.InstancesPage.render();
        assertFalse(root().classList.contains('in-plein'), 'pas de plein cadre sur une autre étape');
        assertFalse(document.body.classList.contains('in-plein-body'));
        assertTrue(getComputedStyle(header).display !== 'none');
        window.InstancesPage.state.prefs.etape = 'cr'; window.InstancesPage.render();
        assertTrue(root().classList.contains('in-plein'), 'de retour sur le compte rendu : plein cadre');
        // Échap quitte le plein cadre.
        const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
        q('[data-act="cr-plein"]').dispatchEvent(esc);
        assertFalse(root().classList.contains('in-plein'), 'Échap quitte le plein cadre');
        assertFalse(document.body.classList.contains('in-plein-body'));
        assertTrue(getComputedStyle(header).display !== 'none');
        assertTrue(q('iframe.in-gframe') === frame, 'toujours la même iframe');
        await waitFor(() => JSON.parse((lastFields('UpdateRecord', 'Preferences_Widget') || {}).Inst_cadre || '{}').plein === false, 'sortie retenue');
        } finally { header.remove(); }
      });
    });

    it('plein cadre : quitter par le bouton, et la page Instances masquée ne laisse jamais l\'en-tête caché', async function () {
      await setup();
      window.InstancesPage._setGfsTarget(gfsTarget);
      const view = document.getElementById('view-instances'), wasHidden = view.classList.contains('hidden');
      view.classList.remove('hidden');
      try {
        step('cr');
        click('cr-plein');
        assertTrue(document.body.classList.contains('in-plein-body'));
        view.classList.add('hidden'); // l'utilisateur est parti sur un autre onglet
        await waitFor(() => !document.body.classList.contains('in-plein-body'), 'en-tête de l\'appli rendu');
        view.classList.remove('hidden');
        await waitFor(() => document.body.classList.contains('in-plein-body'), 'plein cadre de retour avec la page');
        click('cr-plein');
        assertFalse(root().classList.contains('in-plein'));
        assertFalse(document.body.classList.contains('in-plein-body'));
      } finally { view.classList.toggle('hidden', wasHidden); document.body.classList.remove('in-plein-body'); }
    });

    it('hauteur de GFS : trois tailles (écran, 1,5 fois, 2,5 fois), le défilement de la page déplie GFS ; retenu par utilisateur', async function () {
      await withLayout(async () => {
        await setup();
        window.InstancesPage._setGfsTarget(gfsTarget);
        step('cr');
        const frame = await waitFor(() => q('iframe.in-gframe'), 'iframe GFS');
        const heights = [];
        for (const expected of ['ajustee', 'haute', 'tres-haute', 'ajustee']) {
          assertEqual(q('.in-viewer').dataset.h, expected);
          heights.push(Math.round(frame.getBoundingClientRect().height));
          if (expected !== 'ajustee' || heights.length === 1) click('cr-hauteur');
        }
        assertTrue(heights[0] < heights[1] && heights[1] < heights[2], 'de plus en plus haut : ' + heights.join(', '));
        assertEqual(heights[3], heights[0]);
        assertTrue(heights[1] >= 760 && heights[2] >= 1100, 'la page dépasse l\'écran : le défilement déplie GFS');
        assertTrue(q('iframe.in-gframe') === frame, 'GFS n\'est pas recréé');
        await waitFor(() => JSON.parse((lastFields('UpdateRecord', 'Preferences_Widget') || {}).Inst_cadre || '{}').hauteur === 'ajustee', 'hauteur retenue');
      });
    });

    it('les réglages de place sont lus dans Preferences_Widget.Inst_cadre ; une valeur illisible retombe sur les réglages par défaut', async function () {
      await setup({ noPrefs: true });
      await window.loadInstancesUserPreferences();
      await window.grist.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', 1, { Inst_etape: 'cr', Inst_cadre: '{"bandeau":true,"cr":true,"plein":false,"hauteur":"haute"}' }]]);
      window.InstancesPage._reset();
      window.InstancesPage._setGfsTarget(gfsTarget);
      await window.loadInstancesUserPreferences();
      await window.InstancesPage.open();
      assertTrue(q('.in-band').classList.contains('in-fold'), 'bandeau replié restauré');
      assertEqual(qa('.in-card').length, 0, 'relecture repliée restaurée');
      assertEqual(q('.in-viewer').dataset.h, 'haute');
      await window.grist.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', 1, { Inst_cadre: '{pas du json' }]]);
      window.InstancesPage._reset();
      window.InstancesPage._setGfsTarget(gfsTarget);
      await window.loadInstancesUserPreferences();
      await window.InstancesPage.open();
      assertFalse(q('.in-band').classList.contains('in-fold'));
      assertTrue(!!q('.in-card'));
      assertEqual(q('.in-viewer').dataset.h, 'ajustee');
      assertFalse(root().classList.contains('in-plein'));
    });

    it('PDF exporté : affiché dans la page (iframe sur la pièce jointe), message clair sans PDF ; basculer ne recrée pas GFS', async function () {
      await setup({ rows: d => { d.Suivi_Instance[1].CR_PDF = ['L', 90]; } });
      window.InstancesPage._setGfsTarget(gfsTarget);
      step('cr');
      const gfsFrame = await waitFor(() => q('iframe.in-gframe'), 'iframe GFS');
      const original = window.grist.docApi.getAccessToken;
      // about:blank#… : l'iframe n'ouvre aucune connexion réseau pendant le test, l'adresse construite reste vérifiable.
      window.grist.docApi.getAccessToken = async () => ({ token: 'jeton-de-test', baseUrl: 'about:blank#', ttlMsecs: 60000 });
      try {
        click('cr-mode', { v: 'pdf' });
        const pdf = await waitFor(() => q('iframe.in-vframe'), 'visionneuse du PDF');
        assertIncludes(pdf.src, '/attachments/90/download');
        assertIncludes(pdf.src, 'tableId=Suivi_Instance');
        assertIncludes(pdf.src, 'colId=CR_PDF');
        assertIncludes(pdf.src, 'rowId=2');
        assertTrue(q('[data-pane="gfs"]').hidden && !q('[data-pane="pdf"]').hidden);
        assertTrue(gfsFrame.isConnected && q('iframe.in-gframe') === gfsFrame, 'GFS reste en vie derrière');
        click('v0-toggle');
        assertTrue(q('iframe.in-vframe') === pdf, 'l\'iframe du PDF n\'est pas recréée par un clic voisin');
        click('cr-mode', { v: 'edit' });
        assertFalse(q('[data-pane="gfs"]').hidden);
        assertTrue(q('iframe.in-gframe') === gfsFrame);
        step('macro');
        assertEqual(qa('iframe.in-vframe').length, 0, 'le PDF ne reste pas chargé hors de l\'étape');
        // Séance sans PDF : message qui dit où l'exporter.
        click('menu', { v: 'seance' });
        click('seance-pick', { id: 1 });
        step('cr');
        click('cr-mode', { v: 'pdf' });
        assertIncludes(text('[data-pane="pdf"]'), 'Pas encore de PDF');
        assertIncludes(text('[data-pane="pdf"]'), 'CR_PDF');
        assertTrue(q('[data-act="cr-download"]').disabled);
      } finally {
        window.grist.docApi.getAccessToken = original;
      }
    });

    it('GFS : si le document a déjà une vue GFS, la page reprend son adresse ; sinon l\'adresse publique ; ?gfs= non http(s) refusé', async function () {
      await setup();
      window.__mockSetTable('_grist_Views_section', {
        id: [1, 2], options: [JSON.stringify({ customView: JSON.stringify({ url: 'https://exemple.github.io/mon-gfs/' }) }), JSON.stringify({ customView: JSON.stringify({ url: 'https://lombre33.github.io/suiviProjetInnovationS/' }) })]
      });
      step('cr');
      const frame = await waitFor(() => q('iframe.in-gframe'), 'iframe GFS');
      assertEqual(frame.getAttribute('src'), 'https://exemple.github.io/mon-gfs/', 'vue GFS du document (pas celle de ce widget)');
      assertEqual(window.InstancesPage._gfs.url, 'https://exemple.github.io/mon-gfs/');
    });

    it('GFS : sans vue GFS dans le document, l\'adresse publique de GFS est utilisée', async function () {
      await setup();
      window.__mockSetTable('_grist_Views_section', { id: [1], options: [JSON.stringify({ customView: JSON.stringify({ url: 'https://lombre33.github.io/publipostageGrist/' }) })] });
      step('cr');
      const frame = await waitFor(() => q('iframe.in-gframe'), 'iframe GFS');
      assertEqual(frame.getAttribute('src'), 'https://lombre33.github.io/grist-widget-GFS/prototype/');
    });

    it('mail du compte rendu : une date d\'envoi renseignée vaut validation', async function () {
      await setup();
      step('crmail');
      click('crm-today');
      assertEqual(lastFields('UpdateRecord', 'Suivi_Instance', 2).Mail_CR_le, gd(TODAY));
      assertIncludes(text('.in-panel .in-stt'), 'Envoyé le 09/11/2026');
    });

    it('notifications liées : statut par projet (Grist + Export_VP), jamais de lecture de PDF_signe', async function () {
      await setup({ rows: d => {
        d.Export_VP.push({ id: 1, Seance: 2, Projet: 10, A_envoyer: true, Mis_a_dispo_le: gd('2026-11-02'), Mis_a_dispo_par: 0, Signee: true, Signee_le: L.parisToEpoch('2026-11-05', '10:00') });
        d.Export_VP.push({ id: 2, Seance: 2, Projet: 11, A_envoyer: false, Mis_a_dispo_le: null, Mis_a_dispo_par: 0, Signee: false, Signee_le: null });
      } });
      step('notifs');
      const rows = qa('.in-nrow:not(.in-head)').map(r => r.textContent.replace(/\s+/g, ' ').trim());
      assertEqual(rows.length, 3, 'un projet par ligne, une seule fois');
      assertIncludes(rows[0], 'INNOVX');
      assertIncludes(rows[0], 'Signée le 05/11');
      assertIncludes(rows[1], 'NOTIFY');
      assertIncludes(rows[1], 'Non mise à disposition');
      assertIncludes(rows[2], 'CONVENTIX');
      assertIncludes(rows[2], 'Signée (statut Grist)');
      assertIncludes(text('.in-pillbtn'), 'Mettre à disposition du VP (1)');
      assertFalse(root().innerHTML.includes('PDF_signe'), 'le widget n\'ouvre jamais la pièce signée');
    });

    it('« Mettre à disposition du VP » : jamais automatique, confirmation, écrit Export_VP sans toucher Notifications ni les colonnes formule', async function () {
      await setup({ rows: d => { d.Export_VP.push({ id: 1, Seance: 2, Projet: 11, A_envoyer: false, Mis_a_dispo_le: null, Mis_a_dispo_par: 0, Signee: false, Signee_le: null }); } });
      step('notifs');
      assertEqual(calls('AddRecord', 'Export_VP').length + calls('UpdateRecord', 'Export_VP').length, 0, 'ouvrir l\'étape n\'écrit rien');
      assertIncludes(text('.in-pillbtn'), 'Mettre à disposition du VP (2)');
      click('vp-toggle');
      assertIncludes(text('.in-menu'), 'INNOVX, NOTIFY');
      assertIncludes(text('.in-menu .in-alert-pill'), '1 n\'est pas encore au statut « complète »', 'INNOVX est au statut 1');
      click('vp-cancel');
      assertEqual(calls('AddRecord', 'Export_VP').length, 0, 'annuler n\'écrit rien');
      click('vp-toggle');
      click('vp-confirm');
      await waitCall('AddRecord', 'Export_VP');
      const added = calls('AddRecord', 'Export_VP')[0].fields;
      assertEqual(added.Seance, 2);
      assertEqual(added.Projet, 10);
      assertEqual(added.A_envoyer, true);
      assertEqual(added.Mis_a_dispo_le, gd(TODAY));
      const updated = lastFields('UpdateRecord', 'Export_VP', 1);
      assertEqual(updated.A_envoyer, true, 'la ligne existante de NOTIFY est mise à jour, pas dupliquée');
      const written = calls('AddRecord', 'Export_VP').concat(calls('UpdateRecord', 'Export_VP')).reduce((all, c) => all.concat(Object.keys(c.fields)), []);
      ['Instance', 'Date_instance', 'Acronyme', 'Porteur', 'Labo_porteur', 'Montant', 'PDF_notification', 'Signee', 'Signee_le', 'PDF_signe'].forEach(col => {
        assertFalse(written.indexOf(col) >= 0, `${col} ne doit jamais être écrit par le widget`);
      });
      assertEqual(calls('UpdateRecord', 'Notifications').length + calls('AddRecord', 'Notifications').length, 0, 'notifications_Statut n\'est pas modifié');
      await waitFor(() => text('.in-pillbtn').includes('Tout est à disposition du VP'), 'bouton mis à jour');
      assertTrue(q('.in-pillbtn').disabled);
      assertTrue(qa('.in-nrow:not(.in-head)').some(r => r.textContent.includes('En attente de signature')));
    });
  });

  // -------------------------------------------------------------------------------------------------
  describe('Instances — paramétrage de l\'instance', function () {
    it('composition : le paramétrage montre la table lue, les colonnes reconnues et les membres de l\'instance', async function () {
      await setup({ rows: d => { d.COMPOSITION_INSTANCES = COMPOSITION(); } });
      click('settings-open');
      const block = qa('.in-dlg .in-fgrp').find(g => g.textContent.includes('Composition de l\'instance'));
      assertTrue(!!block, 'section Composition');
      assertDeepEqual(Array.from(block.querySelectorAll('.in-tag')).map(t => t.textContent.trim()), ['A. Martin', 'D. Roy'], 'les membres du CTO (pas ceux des autres instances)');
      assertIncludes(block.textContent, 'COMPOSITION_INSTANCES');
      assertIncludes(block.textContent, 'colonne instance « Instance »');
      assertIncludes(block.textContent, 'colonne personne « Personne »');
      assertIncludes(block.textContent, '4 lignes reconnues');
      assertIncludes(block.textContent, 'invitées d\'office à chaque nouvelle séance');
    });

    it('composition : table absente ou illisible, le paramétrage le dit clairement et rien ne casse', async function () {
      await setup();
      click('settings-open');
      let block = qa('.in-dlg .in-fgrp').find(g => g.textContent.includes('Composition de l\'instance'));
      assertIncludes(block.textContent, 'Table « Composition instances » introuvable');
      assertEqual(block.querySelectorAll('.in-tag').length, 0);
      await setup({ rows: d => { d.Composition_instances = [{ id: 1, Libelle: 'abc', Autre: 'def' }]; } });
      click('settings-open');
      block = qa('.in-dlg .in-fgrp').find(g => g.textContent.includes('Composition de l\'instance'));
      assertIncludes(block.textContent, 'Table « Composition_instances » lue');
      assertIncludes(block.textContent, 'Libelle, Autre', 'les colonnes vues sont listées pour corriger');
      click('settings-close');
      step('invites');
      assertFalse(!!q('.in-compo'));
    });

    it('durée, heure habituelle : écrites sur Instances ; l\'heure de fin de la séance suit', async function () {
      await setup();
      click('settings-open');
      assertTrue(!!q('.in-dlg'));
      click('menu', { v: 'dur' });
      click('cfg-dur', { v: 240 });
      assertEqual(lastFields('UpdateRecord', 'Instances', 1).Duree_min, 240);
      click('menu', { v: 'cfgtime' });
      click('time-pick', { s: 'cfg', v: '10:00' });
      assertEqual(lastFields('UpdateRecord', 'Instances', 1).Heure_debut, '10:00');
      click('settings-close');
      assertIncludes(text('.in-band .in-tp'), '→ 13:30', '09:30 + 4 h');
    });

    it('étapes actives : ChoiceList écrite en [\'L\', ...libellés], « Ordre du jour » ne se décoche pas ; la puce disparaît de la page', async function () {
      await setup();
      click('settings-open');
      click('cfg-step', { v: 'odj' });
      assertEqual(calls('UpdateRecord', 'Instances').length, 0, 'l\'ordre du jour est verrouillé');
      click('cfg-step', { v: 'crmail' });
      assertDeepEqual(lastFields('UpdateRecord', 'Instances', 1).Etapes_actives, ['L', 'Ordre du jour', 'Invités', "Mail d'invitation", 'Compte rendu', 'Notifications liées']);
      click('settings-close');
      assertEqual(qa('.in-chip').length, 7, 'les 6 étapes restent visibles + la vue d\'ensemble');
      assertEqual(qa('.in-chip.in-off').length, 1, 'l\'étape retirée est grisée, plus cliquable');
      assertEqual(text('.in-chip.in-macro'), '0/5');
    });

    it('relecteurs et invités permanents : RefList vers Annuaire', async function () {
      await setup();
      click('settings-open');
      click('menu', { v: 'relpick' });
      click('cfg-rel-add', { v: 3 });
      assertDeepEqual(lastFields('UpdateRecord', 'Instances', 1).Relecteurs_CR, ['L', 1, 2, 3]);
      click('cfg-rel-del', { v: 1 });
      assertDeepEqual(lastFields('UpdateRecord', 'Instances', 1).Relecteurs_CR, ['L', 2, 3]);
      click('menu', { v: 'permpick' });
      click('cfg-perm-add', { v: 4 });
      assertDeepEqual(lastFields('UpdateRecord', 'Instances', 1).Invites_permanents, ['L', 1, 2, 4]);
      click('cfg-perm-del', { v: 2 });
      assertDeepEqual(lastFields('UpdateRecord', 'Instances', 1).Invites_permanents, ['L', 1, 4]);
    });

    it('modèles de mail : proposés depuis GFS, enregistrés dans Instances', async function () {
      await setup();
      click('settings-open');
      assertEqual(qa('#in-modeles option').length, 2);
      change('cfg-mod', { f: 'Modele_CR' }, 'Envoi du compte rendu');
      assertEqual(lastFields('UpdateRecord', 'Instances', 1).Modele_CR, 'Envoi du compte rendu');
    });

    it('bulles d\'aide : l\'icône « ? » apparaît sur les champs dont la colonne Grist a une Description', async function () {
      await setup();
      window.__mockSetTable('_grist_Tables', { id: [1], tableId: ['Instances'] });
      window.__mockSetTable('_grist_Tables_column', { id: [1], parentId: [1], colId: ['Duree_min'], description: ['Durée habituelle d\'une séance, en minutes.'] });
      await window.CoreGrist.loadColumnDescriptions();
      click('settings-open');
      const icons = qa('.in-dlg .help-icon');
      assertEqual(icons.length, 1, 'seule Duree_min est décrite');
      assertIncludes(icons[0].dataset.helpText, 'Durée habituelle');
      assertFalse(root().innerHTML.includes('@@HELP'), 'aucun marqueur d\'icône ne doit rester dans la page');
    });

    it('les colonnes de Instances créées par la page portent une description (source des bulles d\'aide)', function () {
      const cols = window.InstancesData.INSTANCES_COLUMNS;
      assertEqual(cols.length, 7);
      assertTrue(cols.every(c => !!c.description), 'chaque colonne ajoutée à Instances a sa description');
    });
  });
})();
