# Version 0.3 - Stable

Date : 2026-09-01

## Statut : Stable ✅

Cette version marque un jalon stable du formulaire "Nouveau projet" et de ses fonctionnalités associées.

### Fonctionnalités validées et fonctionnelles
- Bouton "Nouveau projet" opérationnel (ouverture correcte du formulaire de création).
- Formulaire de création de projet complet :
  - Type de projet, statut opérationnel (valeurs par défaut correctes).
  - Champs Porteurs 1 à 3, Accompagnateur, VP porteur en référence avec autocomplétion (Annuaire).
  - Module Dates (date limite financement avec calendrier, dates début/fin, période en lecture seule).
  - Module OPE (référence ligne OPE avec autocomplétion sur EcritureComptables.N_OPE, ligne installée chez en lecture seule, actions à faire, commentaire).
  - Tableau budgétaire avec colonne de totaux par ligne, valeurs vides pré-remplies à 0.
  - Volet "Conventions" repliable (booléen, partenaires en référence multiple avec autocomplétion, montant partenaire 1 dynamique).
- UI modernisée et compacte (réduction de taille ~20-30%).
- Validation du formulaire fonctionnelle sans erreur (KeyError résolus : Details_depense_s_Fonctionnement_2026, Tutelle, Employeur_tutelle).
- Kanban non impacté et toujours fonctionnel.

### Dernier commit de référence
`ba4010ce2e9643dad0a6617a1607438dc132fb13` — Corriger l'ouverture de la modale Nouveau projet

---
*Ce fichier sert de marqueur de version stable en l'absence de création de tag Git natif via l'outillage actuel.*
