# Version 0.4 - Stable

Date : 2026-09-02

## Statut : Stable ✅

Cette version stabilise complètement le flux Annuaire dans le formulaire projet et la fiche personne.

### Corrections validées et fonctionnelles
- Un seul bouton « + Créer [texte] » est affiché dans les champs Annuaire ; il ouvre la fiche de création d’une personne.
- Un clic sur un champ Annuaire déjà rempli — Porteur 1/2/3, Accompagnateur ou VP porteur — ouvre la fiche personne existante en édition.
- La création d’une nouvelle personne depuis la fiche est correctement validée : extraction robuste de l’identifiant Grist après `AddRecord`, avec gestion des différents formats de réponse ; le champ Annuaire du formulaire projet est ensuite correctement renseigné.
- Correction de l’erreur Grist `KeyError 'Structure'` à la validation : le champ `Structure`, absent de la table Annuaire, est retiré du payload.

### Fichiers concernés et commits de référence
- `js/components/person-modal.js` — `6d8c2bfa2f4f794c4afa89939a163ee76390a6a7` (dédoublonnage du bouton « Créer » et payload Grist valide), `2a96d4c7fa61ef4cb4f7d6a11d0d17db9e271479` (conservation du correctif `refField`), `121dc1f6f652eb296aadb3e0069a68af56450bda` (extraction de l’identifiant après `AddRecord` et formats de réponse), ainsi que `eb3381acc9c2f446644bb88cdb03de5ced6579`, `ba6b1735db359386458682dcc2e5ecedc6fed03a` et `b3ed3d1ad6cb7bc9c1d55029c13a9249e1bbf34d` pour les évolutions création/édition et le raccordement de la modale.
- `js/components/project-modal.js` — `d451d24b84d7d4d163b350c20284837535088154` et `327b4dfc9f3c8cd01f86c3c14140c98601d2803b` (ouverture de la fiche personne existante en édition depuis les champs Annuaire).
- `index.html` — non modifié dans cette itération ; le dernier commit Annuaire antérieur associé est `9cdfe840c902495c920286d7590afbe7817a9d3b`.
- `grist-api.js` — non modifié dans cette itération.
- `cf3fd7e2b7ae1b2d9176593928ddfcabbaacaf24` — suppression du fichier placeholder indésirable ; aucun fichier applicatif conservé dans cette version.

### Derniers commits de référence
- `121dc1f6f652eb296aadb3e0069a68af56450bda` — correctif final d’extraction de l’identifiant Grist.
- `d451d24b84d7d4d163b350c20284837535088154` — ouverture de l’édition depuis les champs Annuaire.
- `6d8c2bfa2f4f794c4afa89939a163ee76390a6a7` — dédoublonnage de « Créer » et payload Grist valide.

---

# Version 0.35 - Stable

Date : 2026-09-01

## Statut : Stable ✅

Cette version stabilise les dernières corrections de l’interface projets, du Kanban et des affichages de références.

### Corrections validées et fonctionnelles
- Kanban : le clic sur une carte rouvre correctement le formulaire d’édition `ProjectModal`.
- Ajout et affichage des badges Programme / Convention.
- Affichage du nom et du prénom du porteur et de l’accompagnateur.
- Renommage de « Sous-statut » en « Statut macro ».
- Affichage des noms des Programmes et des Instances à la place de leurs identifiants (ID).

### Dernier commit de référence
Version 0.35 stable.

---

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
