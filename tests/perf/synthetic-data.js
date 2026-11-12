/**
 * Jeu de données synthétique à l'échelle d'un vrai document InnovationS, pour mesurer
 * les performances du widget (tests/perf/bench.js). Mêmes noms de tables et de
 * colonnes que tests/fixtures.js, mais ~300 projets très larges (≈ 250 colonnes,
 * comme la vraie table Projets), un annuaire de 800 personnes, etc.
 *
 * Données déterministes (PRNG à graine fixe) : deux exécutions donnent exactement le
 * même jeu, donc des mesures comparables avant / après une optimisation.
 */
'use strict';

function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSyntheticFixtures(sizes = {}) {
  const N = Object.assign({
    projets: 300, projetsExtraColumns: 200, annuaire: 800, postes: 700, structures: 250,
    programmes: 8, etablissements: 30, suiviInstance: 120, lignesOpe: 250, notifications: 300
  }, sizes);
  const rand = makeRng(20261110);
  const int = max => Math.floor(rand() * max);
  const pick = list => list[int(list.length)];
  const ids = n => Array.from({ length: n }, (_, i) => i + 1);

  const NOTIF_STAGES = ['1) Information projet saisies', '2) Notification_relecture', '3) Prette pour CTO', '4) complète',
    '5) envoyée pour signature VP', '6) Signée', '7) Transmise au porteur', '8) Archivee'];
  const CONV_STAGES = ['1) Convention en redaction', '2) Convention en relecture', '3) Convention en signature', '4) Convention signée de toutes les parties'];
  const INSTALL_STAGES = ['1) En attente DR', '2) Ouverture demandée à la DF', '3) Installé', '4) Reliquat à traiter', '5) Clôturer', ''];
  const MACRO = ['1) Information projet saisies', '2) Notification_relecture', '3) Prette pour CTO', '4) complète', '5) envoyée pour signature VP',
    '6) Signée', 'Finance_En Attente Gestionnaire', 'En cours', 'En cours', 'En cours', 'En retard', 'En attente statut Notifications'];

  const F = {};
  F.Programmes = { id: ids(N.programmes), Programme: ids(N.programmes).map(i => `Programme ${i}`) };
  F.Etablissements = { id: ids(N.etablissements), Acronyme: ids(N.etablissements).map(i => `ETAB${i}`), Nom_complet: ids(N.etablissements).map(i => `Établissement numéro ${i}`) };
  F.Structures = {
    id: ids(N.structures),
    Acronyme: ids(N.structures).map(i => i === 1 ? 'DIESE' : pick(['Service Dev_', 'Grands Programmes ', 'DR ', 'LAB ', 'UMR ']) + i),
    Nom_Complet: ids(N.structures).map(i => `Structure complète ${i}`),
    Etablissement_Tutuelle_gestionaire: ids(N.structures).map(() => 1 + int(N.etablissements)),
    Toutes_les_tutelles: ids(N.structures).map(() => ['L', 1 + int(N.etablissements)])
  };
  F.Postes2 = {
    id: ids(N.postes),
    Titre: ids(N.postes).map(i => `Poste ${i}`),
    Structure2: ids(N.postes).map(() => 1 + int(N.structures)),
    Nom_du_poste: ids(N.postes).map(i => `Poste ${i} - LAB - DIR - UBX ${i}`)
  };
  F.Annuaire = {
    id: ids(N.annuaire),
    NOM: ids(N.annuaire).map(i => `NOM${i}`),
    Prenom: ids(N.annuaire).map(i => `Prenom${i}`),
    Email: ids(N.annuaire).map(i => `personne${i}@example.org`),
    Poste2: ids(N.annuaire).map(() => 1 + int(N.postes)),
    nom_et_Prenom: ids(N.annuaire).map(i => `Prenom${i} NOM${i}`)
  };
  F.Instances = { id: [1, 2, 3], Instances: ['CTO Innovation', 'CTO FARE', 'Comité innovation'] };
  F.Suivi_Instance = { id: ids(N.suiviInstance), Nom: ids(N.suiviInstance).map(i => `${pick(['CTO Innovation', 'CTO FARE', 'Comité innovation'])}#${i} - 2026-0${1 + int(9)}-1${int(9)}`) };
  F.Lignes_OPE = { id: ids(N.lignesOpe), N_OPE: ids(N.lignesOpe).map(i => `OPE-2026-${String(i).padStart(3, '0')}`), installe_chez: ids(N.lignesOpe).map(() => 1 + int(N.structures)) };

  const P = ids(N.projets);
  const projets = {
    id: P.map(i => 1000 + i),
    Projet: P.map(i => `Projet de recherche numéro ${i}`),
    Acronyme: P.map(i => `ACR${i}`),
    Programme: P.map(() => 1 + int(N.programmes)),
    Porteur_1: P.map(() => 1 + int(N.annuaire)),
    Porteur_2: P.map(() => 0),
    Accompagnateur: P.map(() => 1 + int(N.annuaire)),
    Instance_ratachee: P.map(() => int(3) === 0 ? 0 : 1 + int(N.suiviInstance)),
    Statut_operationnel_projet: P.map(() => 'En attente des dispo des fonds'),
    Statut_Macro: P.map(() => pick(MACRO)),
    Conventions_statut: P.map(() => pick(CONV_STAGES)),
    Convention_de_reversement: P.map(() => int(10) < 3),
    Statut_Financier: P.map(() => 'Finance_En Attente Gestionnaire'),
    Statut_installation_fonds: P.map(() => pick(INSTALL_STAGES)),
    Partenaire_s_convention_reversement: P.map(() => ['L', ...Array.from({ length: int(3) }, () => 1 + int(N.etablissements))]),
    convention_statut_UB: P.map(() => pick([null, 'Relu', 'Signé'])),
    convention_statut_partenaire_1: P.map(() => pick([null, 'en cours de signature', 'Signé'])),
    convention_statut_partenaire_2: P.map(() => null),
    Date_debut_Projet: P.map(() => 1780000000 + int(40000000)),
    Date_de_fin_Projet: P.map(() => null),
    Ligne_OPE: P.map(() => int(4) === 0 ? ['L'] : ['L', 1 + int(N.lignesOpe)]),
    Ligne_OPE_installe_chez: P.map(() => ''),
    Action_Ligne_OPE_a_faire: P.map(() => pick(['', 'Creation de ligne', 'à determiner'])),
    next_step: P.map(i => i % 3 ? '' : `Prochaine étape du projet ${i}`),
    next_step_responsable: P.map(() => ['L', ...Array.from({ length: int(3) }, () => 1 + int(N.annuaire))]),
    Transmise_signee_au_porteur_le: P.map(() => null),
    Lien_convention: P.map(() => ''),
    comentaire_general_Suivi_projet: P.map(() => ''),
    Description_rapide_projet: P.map(i => `Description rapide du projet ${i}`),
    Total_Fonctionnement: P.map(() => int(50000)), Total_investissement: P.map(() => int(50000)), Total_Personnel: P.map(() => int(50000))
  };
  for (let c = 0; c < N.projetsExtraColumns; c++) projets[`Colonne_budget_${c}`] = P.map(() => int(100000));
  F.Projets = projets;

  const notifProjects = P.slice(0, N.notifications).map(i => 1000 + i);
  F.Notifications = { id: ids(notifProjects.length), Projet: notifProjects, notifications_Statut: notifProjects.map(() => pick(NOTIF_STAGES)) };

  // Table de préférences déjà présente avec quelques lignes (autres utilisateurs), comme dans un document en service.
  const prefsRows = 12;
  F.Preferences_Widget = {
    id: ids(prefsRows),
    Email_utilisateur: ids(prefsRows).map(i => `utilisateur${i}@example.org`),
    Kanban_colonnes_repliees: ids(prefsRows).map(() => 'Projet en cours'),
    Kanban_colonnes_masquees: ids(prefsRows).map(() => ''),
    Filtre_programme: ids(prefsRows).map(() => ''), Filtre_instance: ids(prefsRows).map(() => ''), Filtre_recherche: ids(prefsRows).map(() => '')
  };
  // Les métadonnées lues par les bulles d'aide (colonnes avec Description).
  F._grist_Tables = { id: [1, 2], tableId: ['Projets', 'Notifications'] };
  F._grist_Tables_column = { id: [1, 2, 3], parentId: [1, 1, 2], colId: ['Acronyme', 'Statut_Macro', 'notifications_Statut'], description: ['Acronyme du projet', 'Statut calculé', 'Statut de la notification'] };
  F._grist_Attachments = { id: [] };
  return F;
}

module.exports = { buildSyntheticFixtures };
