/**
 * Fixture tables, in Grist's columnar fetchTable() shape: { id: [...], Col: [...] }.
 * Values follow real Grist wire conventions so the mock behaves like the real docApi:
 *  - empty single Reference  -> 0
 *  - empty/populated ReferenceList -> ['L', id1, id2, ...] (the 'L' tag is real, see
 *    project-modal.js normaliseRefList() and page-projets.js refLabel() which both
 *    special-case it).
 * Column names and formula results mirror docs/grist_structure (the real Grist schema
 * export) for: Annuaire.nom_et_Prenom, Postes2.Nom_du_poste/ID2/Direction_du_service,
 * Structures.Toutes_les_tutelles, Suivi_Instance.Nom.
 */
(function (global) {
  'use strict';

  const FIXTURES = {
    Programmes: {
      id: [1, 2],
      Programme: ['Programme A', 'Programme B']
    },
    Etablissements: {
      id: [1, 2, 3],
      Acronyme: ['UBX', 'CNRS', 'INSERM'],
      Nom_complet: [
        'Université de Bordeaux',
        'Centre National de la Recherche Scientifique',
        'Institut National de la Santé et de la Recherche Médicale'
      ]
    },
    Structures: {
      id: [1, 2],
      Acronyme: ['LAB1', 'DIR1'],
      Nom_Complet: ['Laboratoire Un', 'Direction Générale'],
      Etablissement_Tutuelle_gestionaire: [1, 1],
      Co_tutuelle_1_Principale: [2, 0],
      Co_tutuelle_2_principales: [0, 0],
      Tutuelle_Secondaire_1: [0, 0],
      Tutuelle_Secondaire_2: [0, 0],
      Directon_Structure_mere: [2, 0],
      // LAB1 (id 1) has two tutelles (UBX + CNRS); DIR1 (id 2) has one (UBX only).
      Toutes_les_tutelles: [['L', 1, 2], ['L', 1]]
    },
    Postes2: {
      id: [1, 2],
      Titre: ['Responsable innovation', 'Chargé de mission'],
      Precisions_Poste: ['Pôle valorisation', ''],
      Structure2: [1, 1],
      Employeur_tutelle: [1, 1],
      Direction_du_service: [2, 2],
      ID2: [1, 2],
      Nom_du_poste: [
        'Responsable innovation  Pôle valorisation - LAB1 - DIR1 - UBX 1',
        'Chargé de mission   - LAB1 - DIR1 - UBX 2'
      ]
    },
    Annuaire: {
      id: [1, 2],
      NOM: ['Martin', 'Durand'],
      Prenom: ['Alice', 'Bob'],
      Email: ['alice.martin@example.org', 'bob.durand@example.org'],
      Telephone: ['0600000001', '0600000002'],
      Poste2: [1, 0],
      nom_et_Prenom: ['Alice Martin', 'Bob Durand']
    },
    Suivi_Instance: {
      id: [1],
      Nom: ['Comité innovation#3 - 2026-03-15']
    },
    EcritureComptables: {
      id: [1],
      N_OPE: ['OPE-2026-001']
    },
    // Etablissement (singular) intentionally absent: the live app never loads this
    // table name (see project_dead_code_inventory memory) and code must fall back
    // to 'Etablissements' when it is missing.
    Projets: {
      id: [10, 11, 12, 13, 14, 15, 16],
      Projet: ['Projet Instruction', 'Projet Notif', 'Projet Convention', 'Projet Finance', 'Projet EnCours', 'Projet Inconnu', 'Projet ConventionSignee'],
      Acronyme: ['INNOVX', 'NOTIFY', 'CONVENTIX', 'FINANCX', 'COURSIX', 'INCONNUX', 'SIGNEX'],
      Programme: [1, 2, 1, 1, 2, 1, 1],
      Porteur_1: [1, 1, 1, 1, 1, 1, 1],
      Porteur_2: [0, 0, 0, 0, 0, 0, 0],
      Porteur_3: [0, 0, 0, 0, 0, 0, 0],
      VP_porteur_2: [0, 0, 0, 0, 0, 0, 0],
      Accompagnateur: [2, 2, 2, 2, 2, 2, 2],
      Instance_ratachee: [1, 0, 1, 0, 1, 0, 0],
      Type_projet: ['Projet', 'Projet', 'Projet', 'Projet', 'Projet', 'Projet', 'Projet'],
      Statut_operationnel_projet: [
        'En attente des dispo des fonds', 'En attente des dispo des fonds', 'En attente des dispo des fonds',
        'En attente des dispo des fonds', 'En attente des dispo des fonds', 'En attente des dispo des fonds',
        'En attente des dispo des fonds'
      ],
      Statut_Macro: [
        '1) Information projet saisies',
        '5) envoyée pour signature VP',
        'En cours',
        'Finance_En Attente Gestionnaire',
        'En cours',
        'Statut totalement inconnu',
        'En cours'
      ],
      Conventions_statut: [
        'Convention en redaction', 'Convention en redaction', '3) en cours de signature',
        'Convention en redaction', 'Convention en redaction', 'Convention en redaction',
        '5) Convention signée de toutes les parties'
      ],
      Convention_de_reversement: [false, false, true, false, false, false, true],
      Statut_Financier: [
        'Finance_En Attente Gestionnaire', 'Finance_En Attente Gestionnaire', 'Finance_En Attente Gestionnaire',
        'Finance_En Attente Gestionnaire', 'Finance_En Attente Gestionnaire', 'Finance_En Attente Gestionnaire',
        'Finance_En Attente Gestionnaire'
      ],
      c2026_M10_Fonctionnement: [1000, 0, 0, 0, 0, 0, 0],
      c2026_M20_Investissement: [0, 0, 0, 0, 0, 0, 0],
      c2026_M30_Personnel: [0, 0, 0, 0, 0, 0, 0],
      c2027_M10_Fonctionnement: [0, 0, 0, 0, 0, 0, 0],
      c2027_M20_Investissement: [0, 0, 0, 0, 0, 0, 0],
      c2027_M30_Personnel: [0, 0, 0, 0, 0, 0, 0],
      c2028_M10_Fonctionnement: [0, 0, 0, 0, 0, 0, 0],
      c2028_M20_Investissement: [0, 0, 0, 0, 0, 0, 0],
      c2028_M30_Personnel: [0, 0, 0, 0, 0, 0, 0],
      Details_depense_s_Fonctionnement: ['Depenses de fonctionnement', 'Depenses de fonctionnement', 'Depenses de fonctionnement', 'Depenses de fonctionnement', 'Depenses de fonctionnement', 'Depenses de fonctionnement', 'Depenses de fonctionnement'],
      Details_depense_s_Investissement: ["Dépenses d'investissement", "Dépenses d'investissement", "Dépenses d'investissement", "Dépenses d'investissement", "Dépenses d'investissement", "Dépenses d'investissement", "Dépenses d'investissement"],
      Details_depense_s_Personnel: ['Depenses de personnel', 'Depenses de personnel', 'Depenses de personnel', 'Depenses de personnel', 'Depenses de personnel', 'Depenses de personnel', 'Depenses de personnel'],
      Montant_attribue_Total: [1000, 0, 0, 0, 0, 0, 0],
      Convention_montant_partenaire_1: [0, 0, 0, 0, 0, 0, 0],
      Convention_montant_partenaire_2: [0, 0, 0, 0, 0, 0, 0],
      Partenaire_s_convention_reversement: [['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L']],
      Date_debut_Projet: [null, null, null, null, null, null, null],
      Date_de_fin_Projet: [null, null, null, null, null, null, null],
      Date_limite_financement: [null, null, null, null, null, null, null],
      Ligne_OPE: [0, 0, 0, 0, 0, 0, 0],
      Ligne_OPE_installe_chez: ['', '', '', '', '', '', ''],
      Action_Ligne_OPE_a_faire: ['', '', '', '', '', '', ''],
      Commentaire_ligne_OPE: ['', '', '', '', '', '', ''],
      comentaire_general_Suivi_projet: ['', '', '', '', '', '', ''],
      Description_rapide_projet: ['', '', '', '', '', '', '']
    }
  };

  global.__FIXTURES__ = FIXTURES;
})(window);
