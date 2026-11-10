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
        { id: 2, Seance: 2, Ordre: 2, Titre: 'INNOVX — jalon', Nature: 'Discussion', Duree_min: 30, Projets: ['L', 10], Invites: ['L', 1, 3], Lien_type: 'Fichier GFS', Lien: 'GFS-001' },
        { id: 3, Seance: 2, Ordre: 3, Titre: 'Notifications prêtes', Nature: 'Validation', Duree_min: 25, Projets: ['L', 11, 12], Invites: ['L'], Lien_type: '', Lien: '' },
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
      assertIncludes(point(2).textContent, 'INNOVX - dossier', 'le dossier GFS lié est nommé');
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

    it('ajouter une personne (invitée « sur un point ») et la retirer ; les permanents ne se retirent pas ici', async function () {
      await setup();
      step('invites');
      assertFalse(!!row('Alice').querySelector('[data-act="g-del"]'));
      click('menu', { v: 'addGuest' });
      assertEqual(qa('.in-menu .in-mi[data-ft]').length, 1, 'seule Dana n\'est pas encore invitée');
      click('g-add', { v: 4 });
      const added = await waitCall('AddRecord', 'Instance_Invites');
      assertEqual(added.Origine, 'Ajouté sur un point');
      await waitFor(() => !!row('Dana'), 'Dana affichée');
      click('g-del', { id: 3 });
      assertEqual(calls('RemoveRecord', 'Instance_Invites')[0].id, 3);
      assertDeepEqual(lastFields('UpdateRecord', 'Instance_Points', 2).Invites, ['L', 1], 'Chloé est retirée du point');
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

    it('compte rendu : V0, relecture à trois états (à relire / modifs demandées en bleu / validé), validation seulement quand tous ont validé', async function () {
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
      click('rel-set', { id: 2, v: 'valide' });
      assertEqual(lastFields('UpdateRecord', 'Instance_Relectures', 2).Statut, 'Validée', 'la ligne du relecteur est mise à jour, pas dupliquée');
      assertFalse(q('[data-act="validate"]').disabled);
      click('validate');
      assertEqual((await waitCall('AddRecord', 'Instance_Validations')).Etape, 'Compte rendu');
      click('rel-set', { id: 1, v: 'none' });
      assertEqual(calls('RemoveRecord', 'Instance_Relectures').length, 1, 'retour à « à relire » supprime la ligne');
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
