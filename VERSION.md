# Version 0.5 - Stable

Date : 2026-09-02

## Statut : Stable ✅

Cette version stabilise les évolutions récentes de la fiche poste et de la fiche personne.

### Changements notables
- Correction de la validation obligatoire des champs de la fiche poste : Structure, Tutelle, Employeur et Titre.
- Ajout de l’aperçu du prochain ID2 sur la fiche poste, calculé comme `max(ID2) + 1`.
- Correction de la présélection de la tutelle principale par défaut lors du choix d’une structure.
- Suppression du champ « Structure (acronyme) » de la fiche personne ; cette information est désormais gérée via la fiche poste.

### Fichiers modifiés récemment
- `js/components/poste-modal.js`
- `js/components/person-modal.js`

### Commits de référence
- `fd34a7c9007fb6499f8a754aec4425456bb42fb6` — validation obligatoire de la fiche poste et aperçu du prochain ID2.
- `160a78d94481a710b70d9de6eb85bdf9941cf9e7` — présélection de la tutelle principale.
- `f22a118d312e800e37808fc5d564e4ad4e4ae735` — retrait du champ Structure de la fiche personne.

---

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
- `js/components/person-modal.js` — `6d8c2bfa2f4f794c4afa89939a163ee76390a6a7` (dédoublonnage du bouton « Créer » et payload Grist valide), `2a96d4c7fa61ef4cb4f7d6a11d0d17db9e271479` (conservation du correctif `refField`), `121dc1f6f652eb296aadb3e0069a68af56450bda` (extraction de l’identifiant après `AddRecord` et formats de réponse), ainsi que `eb3381acc9c2f446644bbfb88cdb03de5ced6579`, `ba6b1735db359386458682dcc2e5ecedc6fed03a` et `b3ed3d1ad6cb7bc9c1d55029c13a9249e1bbf34d` pour les évolutions création/édition et le raccordement de la modale.
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

### Corrections validées et fonctionnelles
- Ajout et affichage des badges Programme / Convention.
- Renommage de « Sous-statut » en « Statut macro ».

### Dernier commit de référence
Version 0.35 stable.

---

# Version 0.3 - Stable

Date : 2026-09-01

## Statut : Stable ✅

### Fonctionnalités validées et fonctionnelles
- Formulaire de création de projet complet :
  - sélection du porteur, de l’accompagnateur et du VP porteur ;
  - saisie des informations générales du projet ;
  - gestion des statuts, programmes et conventions ;
  - ajout des partenaires et des informations de suivi.
- Affichage du Kanban projet.
- Kanban non impacté et toujours fonctionnel.

### Dernier commit de référence

---
