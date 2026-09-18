# Tables Grist utilisées par le widget

Ce document fait le pont entre `docs/grist_structure` (export brut du schéma Grist,
réduit aux 8 tables du widget) et le code de `js/`. Il répond à une seule question :
**quelles colonnes le widget lit-il et écrit-il réellement aujourd'hui ?**

Aucune donnée métier ni règle d'accès (ACL) ne figure ici : uniquement des noms de
tables, de colonnes et leurs types.

Vérifié le 18 septembre 2026 contre `docs/grist_structure` et les modules
`js/core/grist-api.js`, `js/pages/page-projets.js`, `js/components/project-modal.js`,
`js/components/person-modal.js`, `js/components/poste-modal.js`.

## Tables chargées

`CoreGrist.loadAllTables()` (`js/core/grist-api.js`) appelle `docApi.fetchTable()` sur
neuf noms. Les huit premiers correspondent exactement aux huit tables de
`docs/grist_structure` :

| Table | Rôle dans le widget |
| --- | --- |
| `Projets` | source du Kanban et de la fiche projet (lecture **et** écriture) |
| `Annuaire` | porteurs, VP porteur, accompagnateur ; fiche Personne (lecture **et** écriture) |
| `Postes2` | poste rattaché à une personne ; fiche Poste (lecture **et** écriture) |
| `Structures` | structure d'un poste et filtrage des tutelles possibles (lecture) |
| `Programmes` | programme d'un projet, filtre du Kanban (lecture) |
| `Etablissements` | tutelle/employeur d'un poste, partenaires de convention (lecture) |
| `Suivi_Instance` | instance rattachée à un projet, filtre du Kanban (lecture) |
| `EcritureComptables` | ligne OPE d'un projet (lecture) |

Le neuvième nom, `Etablissement` (au singulier), **n'existe pas dans le schéma**. Le
chargement échoue silencieusement (`loadAllTables()` intercepte l'erreur et renvoie un
tableau vide) et tout le code retombe sur `Etablissements`. C'est un reliquat sans
effet, pas une table manquante dans la documentation.

`Instances` est référencée par `Suivi_Instance.Instance` et sert de repli dans
`page-projets.js` (`valueLabel(..., 'Instances', ['Instances'])`), mais cette table
n'est jamais chargée : ce repli est donc toujours vide, l'étiquette d'instance vient en
pratique de la formule `Suivi_Instance.Nom`. Les autres tables citées par les formules
de l'export — `Notifications`, `Suivi_Descisions_Instances`, `Grands_Programmes`,
`Lieux`, `PUI_SousActions`, `Departement_de_Recherche`, `Institut_CNRS`,
`Suivi_Calendrier_AAP_Programme` — sont hors périmètre du widget : il n'en lit ni les
lignes ni les colonnes, seulement les valeurs déjà calculées côté Grist.

Les tables sont chargées en parallèle (`Promise.all`), contrairement à ce que laisse
entendre la note « Chargement séquentiel des tables → paralléliser » de `docs/SPEC.mdd`.

## Convention de lecture

- **Formule** = colonne calculée côté Grist : le widget peut la lire, jamais l'écrire.
- Une `Reference` vide vaut `0` (jamais `null`) sur le fil Grist ; une `ReferenceList`
  vide vaut `['L']`. Le code traite ces deux cas explicitement
  (`normaliseRefList()`, `setRef()`, `refLabel()`).
- Les dates sont transmises en secondes Unix (`inputDateToGrist()`,
  `dateFieldValue()`).

## Projets

Écrite par la modale projet (`AddRecord` en création, `UpdateRecord` en édition).

### Colonnes écrites

| Colonne | Type | Remarque |
| --- | --- | --- |
| `Projet` | Text | obligatoire côté widget |
| `Acronyme` | Text | obligatoire côté widget |
| `Programme` | Reference → `Programmes` | obligatoire côté widget |
| `Type_projet` | Choice | défaut `Projet` |
| `Statut_operationnel_projet` | Choice | défaut `En attente des dispo des fonds` |
| `comentaire_general_Suivi_projet` | Text | orthographe réelle, un seul `m` |
| `Porteur_1` | Reference → `Annuaire` | obligatoire côté widget |
| `Porteur_2`, `Porteur_3`, `VP_porteur_2`, `Accompagnateur` | Reference → `Annuaire` | |
| `Instance_ratachee` | Reference → `Suivi_Instance` | orthographe réelle, un seul `t` |
| `Date_debut_Projet`, `Date_de_fin_Projet`, `Date_limite_financement` | Date | |
| `Ligne_OPE` | **ReferenceList** → `EcritureComptables` | voir écart 2 ci-dessous |
| `Action_Ligne_OPE_a_faire` | Choice | défaut `à determiner` |
| `Commentaire_ligne_OPE` | Text | |
| `Convention_de_reversement` | Bool | |
| `Partenaire_s_convention_reversement` | ReferenceList → `Etablissements` | écrite au format `['L', id…]` |
| `Convention_montant_partenaire_1`, `_2` | Numeric | |
| `Details_depense_s_Fonctionnement` | Choice | défaut `Depenses de fonctionnement` |
| `Details_depense_s_Investissement` | Choice | défaut `Dépenses d'investissement` |
| `Details_depense_s_Personnel` | Choice | défaut `Depenses de personnel` |
| `c2026_M10_Fonctionnement`, `c2026_M20_Investissement`, `c2026_M30_Personnel` | Numeric | |
| `c2027_…`, `c2028_…` (mêmes trois suffixes) | Numeric | |
| `c2029_M10_Fonctionnement`, `c2029_M20_Investissement`, `c2029_M30_Personnel` | **Formule** | voir écart 1 ci-dessous |

L'export ne publie pas la liste des valeurs des colonnes `Choice` ; les listes proposées
par l'interface (`TYPE_OPTIONS`, `OPE_OPTIONS`, statuts opérationnels) sont donc
maintenues dans `project-modal.js` et ne sont pas validées contre Grist.

### Colonnes lues seulement

| Colonne | Type | Usage |
| --- | --- | --- |
| `Statut_Macro` | Formule | classement du projet dans les colonnes du Kanban |
| `Conventions_statut` | Choice | règle « convention non signée » du Kanban |
| `Statut_Financier` | Choice | sous-statut affiché sur la carte |
| `Programme_Axe_InnovationS` | Formule | repli du filtre Programme |
| `Periode` | Formule | champ en lecture seule de l'onglet Dates |
| `Ligne_OPE_installe_chez` | Formule | champ en lecture seule de l'onglet Dates |
| `Montant_attribue_Total` | Formule | montant repris par défaut dans les montants de convention |
| `Total_2026` | Formule | alias `Budget` construit par `mapProjects()` |
| `Montant_annuel_charge_attribue` | Numeric | repli de cet alias `Budget` |
| `Description_rapide_projet` | Text | vue projet de secours (`app.js`) |
| `Convention_de_reversement_le_cas_echeant` | Attachments | présence testée pour le badge « Convention » |

`mapProjects()` lit aussi `project.Progression`, colonne qui **n'existe dans aucune des
huit tables** : l'alias `Progression` vaut donc toujours `0`. Il n'est utilisé nulle part
dans le rendu actuel.

Sur les 70 colonnes de données de `Projets`, 39 sont écrites ou lues par le widget ; les
autres (notifications, visas, prolongations, historique 2023‑2025, pièces jointes…)
restent gérées uniquement dans Grist.

## Annuaire

Écrite par la fiche Personne (`AddRecord` / `UpdateRecord`).

| Colonne | Type | Lu | Écrit |
| --- | --- | :-: | :-: |
| `NOM` | Text | ✓ | ✓ |
| `Prenom` | Text | ✓ | ✓ |
| `Email` | Text | ✓ | ✓ |
| `Telephone` | Text | ✓ | ✓ |
| `Poste2` | Reference → `Postes2` | ✓ | ✓ |
| `nom_et_Prenom` | Formule | ✓ | — |

`nom_et_Prenom` est l'étiquette privilégiée partout (Kanban, champs de recherche de
personne) ; `Prenom` + `NOM` ne servent que de repli quand la formule est vide.
`Poste_secondaire`, `Type`, `Communaute_metier` et les autres colonnes de l'`Annuaire`
ne sont pas touchées par le widget, contrairement à ce qu'annonçait le brief de
`docs/SPEC.mdd` pour `Poste_secondaire`.

## Postes2

Écrite par la fiche Poste, en modale autonome comme en création à la volée depuis la
fiche Personne.

| Colonne | Type | Lu | Écrit |
| --- | --- | :-: | :-: |
| `Titre` | Text | ✓ | ✓ |
| `Precisions_Poste` | Text | ✓ | ✓ |
| `Structure2` | Reference → `Structures` | ✓ | ✓ |
| `Employeur_tutelle` | Reference → `Etablissements` | ✓ | ✓ |
| `Nom_du_poste` | Formule | ✓ | — |
| `ID2` | Formule | ✓ | — |

`Nom_du_poste` est relu depuis Grist après enregistrement ; le widget n'en recalcule un
aperçu localement (`calculatedPosteName()`) que tant que l'enregistrement n'a pas eu
lieu, ou si la relecture échoue. `ID2` sert uniquement à estimer l'identifiant du
prochain poste pour cet aperçu.

`Mission_Principale`, cité par `docs/SPEC.mdd` comme colonne utile, n'est pas utilisé
par le code actuel.

## Structures

Lecture seule.

| Colonne | Type | Usage |
| --- | --- | --- |
| `Acronyme` | Text | étiquette de la structure, et des tutelles dans le nom de poste calculé |
| `Nom_Complet` | Text | repli d'étiquette |
| `Directon_Structure_mere` | Reference → `Structures` | acronyme de la direction dans le nom de poste calculé (orthographe réelle, sans `i`) |
| `Toutes_les_tutelles` | Formule (ReferenceList → `Etablissements`) | liste des employeurs proposés pour un poste |
| `Etablissement_Tutuelle_gestionaire` | Reference → `Etablissements` | tutelle présélectionnée, et complément de la liste ci-dessus |

Le filtrage des employeurs repose désormais sur la formule `Toutes_les_tutelles`. Les
cinq colonnes de tutelle listées dans `docs/SPEC.mdd` (`Co_tutuelle_1_Principale`,
`Co_tutuelle_2_principales`, `Tutuelle_Secondaire_1`, `Tutuelle_Secondaire_2` et la
tutelle gestionnaire) ne sont plus lues une à une par le widget : elles alimentent la
formule côté Grist. Les fixtures de test les fournissent encore pour rester fidèles au
schéma.

## Programmes

Lecture seule : `Programme` (Text) uniquement, comme étiquette du programme dans la
modale projet, sur la carte Kanban et dans le filtre Programme.

## Etablissements

Lecture seule : `Acronyme` (Text) puis `Nom_complet` (Text, minuscule au `c`) en repli.

Le sélecteur de partenaires de convention essaie d'abord une clé `acronyme` en
minuscules, qui n'existe pas dans le schéma ; `Acronyme` prend le relais et l'affichage
est correct.

## Suivi_Instance

Lecture seule.

| Colonne | Type | Usage |
| --- | --- | --- |
| `Nom` | Formule | étiquette de l'instance (modale projet, filtre Kanban) |
| `Instance` | Reference → `Instances` | repli d'étiquette, sans effet : `Instances` n'est pas chargée |

Le code essaie aussi une clé `name` en minuscules, absente du schéma.

## EcritureComptables

Lecture seule : `N_OPE` (Text), étiquette de la ligne OPE dans la modale projet.
`totalCPConsomme`, `installe_chez` et la formule `N_OPE_LibelleOperation` ne sont pas
lus par le widget — c'est la formule `Projets.Ligne_OPE_installe_chez` qui fournit la
structure d'installation.

## Écarts entre le code et le schéma

L'export `docs/grist_structure` est conforme : les huit tables existent et toutes les
colonnes que le widget manipule y figurent. Deux écarts viennent du **code**, pas de la
documentation, et bloquent l'enregistrement d'un projet.

### 1. Les trois colonnes 2029 sont des formules

`project-modal.js` construit sa grille budgétaire sur les années 2026 à 2029 et envoie
`c2029_M10_Fonctionnement`, `c2029_M20_Investissement` et `c2029_M30_Personnel` dans
chaque `AddRecord` / `UpdateRecord`. Or ces trois colonnes sont déclarées comme formules
dans le schéma (`def c2029_M10_Fonctionnement(rec, table): return None`), au même titre
que `Total_2029`. Grist refuse une écriture sur une colonne formule, ce qui fait échouer
l'action entière.

Deux corrections possibles, au choix : convertir ces trois colonnes en colonnes de
données `Numeric` dans Grist (elles renvoient `None` aujourd'hui, donc rien n'est perdu),
ou limiter la grille budgétaire du widget à 2026‑2028.

### 2. `Ligne_OPE` est une ReferenceList, pas une Reference

`Projets.Ligne_OPE` est déclarée `grist.ReferenceList('EcritureComptables')`. Le widget
la traite comme une référence simple : il écrit un identifiant numérique
(`Ligne_OPE: Number(...) || null`) au lieu du format `['L', id…]` attendu, et à la
relecture `setRef()` reçoit un tableau dont il lit `.id`, ce qui laisse le champ vide
même quand une ligne OPE est rattachée.

Le format attendu est déjà correctement produit ailleurs, pour
`Partenaire_s_convention_reversement` : `['L', ...ids]`.

### Divergences sans effet

Trois clés lues par le code n'existent dans aucune table ; elles sont toujours suivies
d'un repli valide et n'ont pas d'impact visible :

- `Projets.Progression` — l'alias `Progression` vaut toujours `0` ;
- `Etablissements.acronyme` (minuscule) — `Acronyme` prend le relais ;
- `Suivi_Instance.name` (minuscule) — la formule `Nom` prend le relais.

Enfin, le nom de table `Etablissement` au singulier dans `CoreGrist.TABLE_NAMES` ne
correspond à rien : son chargement échoue et est ignoré.
