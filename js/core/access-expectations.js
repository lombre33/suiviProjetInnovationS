/**
 * Ce que chaque écran attend de Grist (colonnes lues), pour le diagnostic d'accès (js/core/access-diagnostic.js).
 *
 * Quand Grist cache une colonne à un compte (règle d'accès par colonne) ou qu'une colonne est renommée, le widget ne reçoit tout
 * simplement pas la colonne : l'écran s'affiche vide ou incomplet, sans erreur. En comparant les colonnes REÇUES à celles-ci, le
 * diagnostic dit quelle colonne manque, quel écran en souffre et ce qui s'affichera mal — sans aucun appel Grist de plus.
 *
 * expect(table, [colonnes], { label : écran concerné, effect : ce qui s'affiche mal si elles manquent })
 * `label` doit être l'un des libellés de PAGES (js/core/access-diagnostic.js) pour que la pastille ⚠ de l'écran s'allume ;
 * « Modale projet », « Instances »… n'ont pas de barre de filtres : leurs manques figurent dans le panneau Alt+Maj+D et la pastille de l'en-tête.
 *
 * À TENIR À JOUR : quand un écran se met à lire une nouvelle colonne dont l'absence casse l'affichage, l'ajouter ici (le test
 * « access-expectations » vérifie que chaque colonne citée figure bien dans le code de l'écran).
 */
(function (global) {
  'use strict';
  const A = global.CoreAccess;
  if (!A) return;
  const K = 'Kanban', ADM = 'Administratif', INS = 'Installation des fonds', TODO = 'To Do', DASH = 'Dashboard', ANNU = 'Annuaire', INST = 'Instances', MOD = 'Modale projet';

  // --- Projets -----------------------------------------------------------------------------------------------------------------------
  A.expect('Projets', ['Acronyme', 'Projet'], { label: K, effect: 'nom et titre des cartes projet' });
  A.expect('Projets', ['Statut_Macro'], { label: K, effect: 'classement des projets dans les colonnes : sans elle aucun projet n\'apparaît (repli sur Statut_operationnel_projet)' });
  A.expect('Projets', ['Statut_operationnel_projet', 'Statut_Financier'], { label: K, effect: 'sous-statut affiché sur les cartes' });
  A.expect('Projets', ['Conventions_statut', 'Convention_de_reversement'], { label: K, effect: 'colonne « Conventions » du Kanban (projets à convention non signée)' });
  A.expect('Projets', ['Porteur_1', 'Accompagnateur', 'Programme', 'Instance_ratachee'], { label: K, effect: 'porteur, accompagnateur, programme et instance des cartes, et filtres Programme / Instance' });
  A.expect('Projets', ['Acronyme', 'Projet', 'Programme', 'Porteur_1', 'Instance_ratachee', 'Date_debut_Projet', 'comentaire_general_Suivi_projet'], { label: ADM, effect: 'cartes des volets Notifications et Conventions' });
  A.expect('Projets', ['Conventions_statut', 'Convention_de_reversement', 'Partenaire_s_convention_reversement', 'Convention_de_reversement_le_cas_echeant', 'convention_Date_derniere_modification'], { label: ADM, effect: 'onglet Conventions : volets par étape, partenaires, convention en PDF, dernière action' });
  A.expect('Projets', ['Statut_Macro', 'Programme_Axe_InnovationS'], { label: ADM, effect: 'étape des projets et programme affichés' });
  A.expect('Projets', ['Acronyme', 'Projet', 'Programme', 'Instance_ratachee', 'Convention_de_reversement', 'Programme_Axe_InnovationS'], { label: INS, effect: 'cartes de l\'Installation des fonds et filtres' });
  A.expect('Projets', ['Ligne_OPE', 'Commentaire_ligne_OPE', 'Action_Ligne_OPE_a_faire', 'Montant_attribue_Total', 'Total_Fonctionnement', 'Total_investissement', 'Total_Personnel'], { label: INS, effect: 'lignes OPE, actions à faire et montants des cartes' });
  A.expect('Projets', ['Acronyme', 'Projet', 'Date_debut_Projet', 'Conventions_statut', 'Convention_de_reversement', 'Action_Ligne_OPE_a_faire'], { label: TODO, effect: 'tâches (notifications, conventions, installation) de chaque personne' });
  A.expect('Projets', ['Ligne_OPE_installe_chez'], { label: TODO, effect: 'rôle « installation » : structure d\'installation des projets' });
  A.expect('Projets', ['Acronyme', 'Projet', 'Programme', 'Ligne_OPE', 'Statut_operationnel_projet', 'Statut_Macro', 'Montant_attribue_Total'], { label: DASH, effect: 'lignes du tableau de bord (attribué, consommé, statut)' });
  A.expect('Projets', ['Porteur_1', 'Porteur_2', 'Porteur_3', 'Accompagnateur', 'VP_porteur_signataire_notif'], { label: ANNU, effect: 'projets rattachés à chaque personne (nombre de projets, fiche personne)' });
  A.expect('Projets', ['Statut_Macro', 'Notifications_Signees', 'Porteur_1', 'Montant_attribue_Total'], { label: INST, effect: 'ordre du jour, notifications signées et montants des séances' });
  A.expect('Projets', ['Type_projet', 'Date_de_fin_Projet', 'Date_limite_financement', 'Porteur_2', 'Porteur_3', 'VP_porteur_signataire_notif', 'Convention_montant_partenaire_1', 'Convention_montant_partenaire_2'], { label: MOD, effect: 'champs de la fiche projet (type, dates, porteurs, convention)' });
  A.expect('Projets', ['Details_depense_s_Fonctionnement', 'Details_depense_s_Investissement', 'Details_depense_s_Personnel', 'Periode'], { label: MOD, effect: 'onglet Budget et OPE de la fiche projet' });

  // --- Annuaire, postes, structures, programmes, établissements -----------------------------------------------------------------
  A.expect('Annuaire', ['NOM', 'Prenom', 'nom_et_Prenom'], { label: K, effect: 'noms des porteurs et accompagnateurs sur les cartes' });
  A.expect('Annuaire', ['NOM', 'Prenom', 'nom_et_Prenom', 'Email'], { label: ADM, effect: 'noms des personnes, responsables de la prochaine étape, mail de demande de visa' });
  A.expect('Annuaire', ['nom_et_Prenom', 'Email', 'Poste2', 'Service'], { label: TODO, effect: 'identification de « vous » (adresse Grist ↔ fiche Annuaire), rôles et structures' });
  A.expect('Annuaire', ['NOM', 'Prenom', 'Email', 'Telephone', 'Poste2', 'Poste_secondaire', 'Type', 'Communaute_metier', 'Matricule_le_cas_echeant_', 'email_Assitant_e_le_cas_echeant', 'Accompagnateur_de_l_innovation_'], { label: ANNU, effect: 'fiches personnes (coordonnées, poste, type, communauté)' });
  A.expect('Postes2', ['Titre', 'Structure2', 'Nom_du_poste'], { label: ANNU, effect: 'poste et structure de chaque personne' });
  A.expect('Postes2', ['Employeur_tutelle', 'Type_de_poste', 'type_de_contrat', 'Date_de_fin', 'Precisions_Poste'], { label: ANNU, effect: 'employeur, contrat et fin de poste (alertes « à vérifier »)' });
  A.expect('Postes2', ['Structure2'], { label: TODO, effect: 'structure d\'une personne (rôle des tâches)' });
  A.expect('Structures', ['Acronyme', 'Nom_Complet'], { label: ANNU, effect: 'noms des structures' });
  A.expect('Structures', ['Directon_Structure_mere', 'Etablissement_Tutuelle_gestionaire', 'Type'], { label: ANNU, effect: 'structure mère, tutelle et type (filtres et regroupement « par structure »)' });
  A.expect('Structures', ['Acronyme', 'Nom_Complet'], { label: INS, effect: 'structure d\'installation affichée sur les cartes' });
  A.expect('Structures', ['Acronyme', 'Nom_Complet'], { label: TODO, effect: 'structure d\'installation des tâches' });
  A.expect('Programmes', ['Programme'], { label: K, effect: 'libellé du programme des cartes et filtre Programme' });
  A.expect('Programmes', ['Programme'], { label: ADM, effect: 'libellé du programme et filtre Programme' });
  A.expect('Programmes', ['Programme'], { label: INS, effect: 'libellé du programme et filtre Programme' });
  A.expect('Programmes', ['Programme'], { label: DASH, effect: 'regroupement des projets par programme' });
  A.expect('Etablissements', ['Acronyme', 'Nom_complet'], { label: ADM, effect: 'partenaires de convention (noms des établissements)' });
  A.expect('Etablissements', ['Acronyme', 'Nom_complet'], { label: ANNU, effect: 'employeurs et tutelles' });

  // --- Instances, lignes OPE, notifications -------------------------------------------------------------------------------------
  A.expect('Suivi_Instance', ['Instance', 'Nom', 'date'], { label: K, effect: 'filtre Instance et instance des cartes' });
  A.expect('Suivi_Instance', ['Instance', 'Nom', 'date', 'Commentaire'], { label: ADM, effect: 'instance affichée sur les cartes et filtre Instance' });
  A.expect('Suivi_Instance', ['Instance', 'Nom', 'Commentaire'], { label: INS, effect: 'instance affichée sur les cartes et filtre Instance' });
  A.expect('Suivi_Instance', ['Instance', 'Numero', 'date', 'Heure', 'Salle', 'Nom'], { label: INST, effect: 'liste des séances (date, heure, salle) de la page Instances' });
  A.expect('Lignes_OPE', ['N_OPE', 'installe_chez'], { label: INS, effect: 'numéro d\'OPE et structure d\'installation (DIESE / AUTRE)' });
  A.expect('Lignes_OPE', ['N_OPE', 'totalCPConsomme'], { label: DASH, effect: 'consommé des lignes OPE' });
  A.expect('Lignes_OPE', ['N_OPE', 'installe_chez'], { label: MOD, effect: 'champ « Ligne OPE » de la fiche projet' });
  A.expect('Notifications', ['Projet', 'notifications_Statut'], { label: ADM, effect: 'onglet Notifications : volets par étape (sans elles, aucun projet n\'y apparaît)' });
})(window);
