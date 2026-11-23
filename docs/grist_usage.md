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
| `Lignes_OPE` | ligne OPE d'un projet (lecture ; création depuis la modale projet, modification depuis la page Installation des fonds) |

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

## Bulles d'aide (descriptions de colonnes)

`CoreGrist.loadColumnDescriptions()` (`js/core/grist-api.js`), appelée une fois au
démarrage par `js/app.js`, lit `_grist_Tables` et `_grist_Tables_column` (mêmes
tables de métadonnées que `js/core/grist-bridge.js`, colonne `description` en
plus) pour toutes les tables du document — lecture seule, jamais d'écriture.
`js/components/help-tooltip.js` l'utilise pour poser une icône d'aide à côté
d'un libellé de champ : sur toutes les modales (projet, personne, poste, ligne
OPE) et sur les en-têtes de volet Notifications/Conventions de la page
Administratif — aucune icône quand la colonne n'a pas de description dans
Grist, ou quand les métadonnées sont illisibles (droits d'accès) — le widget
reste alors utilisable, simplement sans bulles d'aide.

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
| `Porteur_2`, `Porteur_3`, `VP_porteur_signataire_notif`, `Accompagnateur` | Reference → `Annuaire` | |
| `Instance_ratachee` | Reference → `Suivi_Instance` | orthographe réelle, un seul `t` |
| `Date_debut_Projet`, `Date_de_fin_Projet`, `Date_limite_financement` | Date | |
| `Ligne_OPE` | **ReferenceList** → `Lignes_OPE` | écrite au format `['L', id]`, voir écart 2 ci-dessous |
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
| `Part_Idex`, `Part_recette_RNA_PREMAT_MAT` | au choix d'Antoine (Bool attendu) | volet « Co-financements » de l'onglet Budget, ajoutées à la main le 17/11/2026 (absentes de l'export ci-dessus) ; le champ suit le type lu dans les métadonnées, voir ci-dessous |
| `Commentaire_budget` | Text | même volet |

**Co-financements** (`Part_Idex`, `Part_recette_RNA_PREMAT_MAT`, `Commentaire_budget`) : le type de ces
colonnes n'est pas imposé, la modale s'y adapte (`Bool` : interrupteur Oui/Non ; `Numeric`/`Int` : montant ;
`Choice` : liste de choix de Grist ; `Text` : texte). Une colonne absente de `Projets` n'est jamais écrite (le champ
l'indique, et le volet disparaît si les trois manquent) ; une colonne calculée (formule) ou d'un autre type reste en
lecture seule ; une colonne encore « vide » (type `Any`, sans valeur) n'est écrite qu'une fois le champ modifié, pour ne
pas figer son type par un simple enregistrement.

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
| `Convention_de_reversement_le_cas_echeant` | Attachments | présence testée pour le badge « Convention » ; liste de fichiers de la fiche projet. **Écrite** (hors fiche projet) par l'onglet Conventions de la page Administratif : section 10 des écarts |

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
| `Type` | ChoiceList (BIATSS, C, EC, Doctorant.e, Fonction) | ✓ (page Annuaire) | — |
| `Communaute_metier` | ChoiceList | ✓ (page Annuaire) | — |
| `Accompagnateur_de_l_innovation_` | Bool | ✓ (page Annuaire) | — |
| `email_Assitant_e_le_cas_echeant` | Reference → `Annuaire` | ✓ (page Annuaire) | — |
| `Poste_secondaire` | Reference → `Postes2` | ✓ (page Annuaire) | — |
| `Matricule_le_cas_echeant_` | Text | ✓ (page Annuaire) | — |

`nom_et_Prenom` est l'étiquette privilégiée partout (Kanban, champs de recherche de
personne) ; `Prenom` + `NOM` ne servent que de repli quand la formule est vide.
Les colonnes `Poste_secondaire`, `Type`, `Communaute_metier`, `Accompagnateur_de_l_innovation_`,
`email_Assitant_e_le_cas_echeant` et `Matricule_le_cas_echeant_` ne sont que **lues** (page Annuaire, 17/11/2026) :
aucune modale ne les écrit, contrairement à ce qu'annonçait le brief de `docs/SPEC.mdd` pour `Poste_secondaire`.
Les autres colonnes de l'`Annuaire` ne sont pas touchées.

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
| `grade` | Choice (VP, Directeur.trice etablissement, Agent, Direction service, assitant.e, DU) | ✓ (pages Instances et Annuaire) | — |
| `type_de_contrat` | Choice | ✓ (page Annuaire) | — |
| `Date_de_fin` | Date | ✓ (page Annuaire) | — |
| `Type_de_poste` | Choice | ✓ (page Annuaire) | — |

`grade` (ajoutée par Antoine le 12/11/2026) n'est lue que par la page Instances : voir « Grade du poste » plus bas.

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

**Page Instances (9 novembre 2026).** Une ligne de `Suivi_Instance` = une séance de la page
« par instance » (`js/pages/page-instances.js`). Colonnes lues : `Instance`, `Numero` (Text),
`date` (Date), `Heure` (DateTime, Europe/Paris), `Salle` (Reference → `Lieux`). Le widget écrit
`date`, `Heure` et `Salle`, et crée les colonnes suivantes à la première ouverture de la page :
`Mail_invitation_le` (Date), `CR_V0_le` (Date), `CR_V0_par` (→ `Annuaire`), `CR_PDF`
(Attachments : version PDF du compte rendu, exportée à la main depuis GFS une fois le texte relu),
`Mail_CR_le` (Date). Depuis le 10/11/2026, `CR_lien_type` et `CR_lien` ne sont plus lues ni créées
(le compte rendu se rédige dans GFS, intégré à la page) ; si elles existent déjà dans le document,
elles sont simplement ignorées. Voir la section « Page Instances » plus bas.

## Page Instances

Tables et colonnes créées par le widget à la première ouverture de la page (`ensureTable` /
`ensureColumns`, droit d'édition requis). Les colonnes formule ne sont **jamais** écrites ; les
références sont écrites en identifiants (`['L', …]` pour les RefList) ; les dates en secondes UTC.

| Table | Colonnes |
| --- | --- |
| `Instances` (ajouts) | `Heure_debut` (Text, HH:MM), `Duree_min` (Int), `Etapes_actives` (ChoiceList, vide = toutes), `Relecteurs_CR` / `Invites_permanents` (RefList → `Annuaire`), `Modele_invitation` / `Modele_CR` (Text) — chacune avec une description (bulles d'aide du paramétrage) |
| `Instance_Points` | `Seance` (→ `Suivi_Instance`), `Ordre`, `Titre`, `Nature` (Validation / Discussion / Information), `Duree_min`, `Projets` (RefList → `Projets`), `Invites` (RefList → `Instance_Invites`), `Presentateurs` (RefList → `Annuaire` : qui présente le point, indépendant des invités ; ajoutée à la table existante par `ensureColumns`), `Parent` (Ref → `Instance_Points`, vide pour un point ; ajoutée par `ensureColumns` : fait de la ligne un sous-point), `Lien_type`, `Lien` |
| `Instance_Invites` | `Seance`, `Personne` (→ `Annuaire`), `Origine` (Liste permanente / Ajouté sur un point), `Ecrit_le`, `Passage_envoye_le`, `Passage_envoye_heure`, `Reponse` (À confirmer / Viendra / Excusé(e)), `Dispo_de`, `Dispo_a`, `Commentaire`, `Appel` (Présent(e) / Absent(e)) |
| `Instance_Relectures` | `Seance`, `Personne`, `Statut` (Modifs demandées / Validée ; pas de ligne = à relire), `Relu_le` |
| `Instance_Validations` | `Seance`, `Etape`, `Date`, `Par` (→ `Annuaire`) — une ligne par étape validée (les étapes « Mail d'invitation » et « Envoi du CR » se valident par leur date dans `Suivi_Instance`) |
| `Export_VP` | table plate lue par Sync+ vers l'outil de signature du VP (`signature/`). Écrites par le widget : `Seance`, `Projet`, `A_envoyer`, `Mis_a_dispo_le`, `Mis_a_dispo_par`. Formules : `Instance`, `Date_instance`, `Acronyme`, `Porteur`, `Labo_porteur`, `Montant`. `PDF_notification` (Attachments) : à alimenter côté Grist. Retour de Sync+ : `Signee`, `Signee_le`, `PDF_signe` |

Le bouton « Mettre à disposition du VP » n'est jamais automatique : il demande confirmation puis
écrit `Export_VP` ; il **ne modifie pas** `Notifications.notifications_Statut`, et le widget
n'ouvre jamais `PDF_signe`. Préférences par utilisateur dans `Preferences_Widget` :
`Inst_instance`, `Inst_seances` (JSON), `Inst_etape`, `Inst_vue_ensemble` (variante de la vue d'ensemble, `C` par défaut ; l'ancienne colonne `Inst_vue` n'est plus lue), `Inst_odj_vue` (`timing` par défaut
ou `type` : affichage de l'ordre du jour), `Inst_cadre` (JSON : `bandeau`, `cr`, `plein`, `hauteur` — voir
ci-dessous). Les deux dernières colonnes sont ajoutées à la table existante par `ensureColumns`.

**Composition des instances (10/11/2026).** Les invités par défaut d'une instance viennent de la table
« Composition instances » du document (en lecture seule, jamais modifiée par le widget). La table est retrouvée par son
nom (casse et ponctuation ignorées : `Composition_instances`, `COMPOSITION_INSTANCES`…) ; ses colonnes sont
retrouvées par leurs **types** (métadonnées Grist) puis leurs valeurs : une colonne qui désigne une instance (référence
vers `Instances`, ou texte portant le nom de l'instance) et une colonne qui désigne une personne (référence vers
`Annuaire`, liste de références, nom ou e-mail), le nom de la colonne départageant les cas ambigus. **Un numéro n'est
jamais lu comme une instance sans que la colonne soit une référence vers `Instances`** (une référence vers une autre table
est lue par le libellé de sa ligne ; un nombre ordinaire est ignoré) : sinon les numéros d'une autre table donnaient
les invités d'une instance à une autre (bug du 10/11, COPIL / Comité innovation). Un texte qui nomme deux instances
(« COPIL du comité innovation ») est ambigu, donc ignoré. Une ligne par membre ; une liste de personnes ou d'instances
sur une même ligne est acceptée. À l'étape Invités, **la corbeille retire n'importe quel invité de la séance** (liste
permanente comprise ; la liste permanente de l'instance n'est pas modifiée). Usage : (1) une **nouvelle séance** reprend la liste permanente + la composition (sans
doublon, origine « Liste permanente ») ; (2) à l'étape **Invités**, un bandeau propose d'ajouter les membres de la
composition qui ne sont pas invités à la séance ; (3) le **paramétrage** de l'instance affiche la table lue, les
colonnes reconnues avec leur type, le nombre de personnes retenues par instance et les membres (ou la raison pour laquelle rien n'est reconnu). Aucun filtre (membre actif,
suppléant, dates de mandat…) : toutes les lignes de l'instance comptent.

**Compte rendu validé automatiquement (10/11/2026).** Dès que la V0 est rédigée et que tous les relecteurs de
l'instance ont validé, l'étape Compte rendu se valide d'elle-même (ligne `Instance_Validations`, date du jour,
« Par » = la personne qui a fait le dernier geste). Seul ce dernier geste (V0 cochée ou dernier relecteur validé)
déclenche la validation : « Rouvrir l'étape » n'est jamais défait tout seul, et sans relecteur défini la V0 seule ne
valide pas (le bouton ✓ reste disponible). Une demande de modifications bloque la validation automatique.

**Ordre du jour : clavier et alignement (10/11/2026).** Les menus de recherche (projets, présentateurs, invités,
relecteurs…) se parcourent aux flèches (↓/↑, en boucle), Entrée choisit la ligne surlignée (à défaut le premier
résultat d'une recherche), Échap referme. La largeur du titre d'un point est fixe (proportionnelle à la liste) :
ajouter un projet, un présentateur ou un invité ne décale que ce qui est à sa droite, jamais vers la gauche.

**Place pour GFS (10/11/2026).** Étape Compte rendu : le bandeau du haut se replie (heure et salle
masquées), la carte relecteurs/téléchargement se replie en « V0 rédigée · 1/2 validé » + icône de
téléchargement dans l'en-tête de l'étape, la hauteur de GFS a trois tailles (écran, 1,5 fois, 2,5 fois :
le défilement de la page déplie alors GFS) et « Plein cadre » masque l'en-tête de l'appli et tous les
panneaux (GFS = hauteur de l'écran moins une barre de 46 px ; Échap ou le bouton pour revenir). Le plein
cadre ne s'applique que sur l'étape Compte rendu et tant que la page Instances est affichée ; l'iframe
de GFS n'est jamais recréée.

**Ordre du jour (10/11/2026).** Vue *Timing* : ordre de passage. Couleurs (12/11/2026, plus de
couleur par heure) : par priorité, la validation ressort franchement (bleu franc, fond teinté), la discussion
reste discrète (lavande pâle, 12/11 : le violet plein ressortait trop), l'information garde la
couleur par défaut, dans les deux vues. Vue *Par type* : tous les points (jamais un filtre), regroupés pour
validation, puis discussion, puis information ; l'ordre de passage n'est pas modifiable dans cette vue.
Le titre d'un point s'affiche toujours en entier (zone de texte qui grandit, dans sa propre colonne :
c'est lui qui prend des lignes, jamais le reste) et **prend tout l'espace libre**. **Un point tient
toujours sur une seule ligne** : la liste est une grille dont les colonnes sont communes à toutes les
lignes ; la colonne de droite (projets, présentateurs, invités, dossier) fait la largeur de la ligne la
plus chargée (au moins 300 px, au plus 45 % de la liste), le titre reçoit le reste. Tant qu'on ajoute
quelqu'un dans la réserve de 300 px, rien ne bouge ; au-delà, seule cette colonne s'élargit (le titre
cède la place pour toutes les lignes, colonnes alignées). Les noms de personnes passent en initiales
quand la liste est étroite (< 1560 px) ; le nom complet reste dans l'infobulle. Le bouton « Dossier du
point » est une icône seule (le nom du dossier lié est dans l'infobulle).

**Étape Invités : états vifs (10/11/2026).** Réponse et appel du jour : pastille pleine, verte
(viendra / présent), rouge (excusé / absent) ou orange (à confirmer), icône blanche. Invitation écrite
et horaire de passage envoyés : pastille verte pleine ; horaire modifié depuis l'envoi : orange ; pas
encore fait : bouton cerclé. Les boutons « dès le début / jusqu'à la fin » du créneau actifs sont bleus
pleins. Couleurs dans la fin de `css/instances.css` (bloc « Étape Invités »).

**Instances présentées (10/11/2026).** Seules les instances dont le nom (colonne `Instances` de la
table `Instances`) est « CTO Innovation » ou « Comité innovation » (casse, accents et ponctuation
ignorés, mots entiers) apparaissent dans la page (boutons du bandeau) ; leurs séances seules sont
chargées. Si aucune instance ne porte l'un de ces noms, tout est affiché plutôt qu'une page vide.
Les règles sont dans `INSTANCE_RULES` (`js/pages/instances-logic.js`). Tant que
`Instances.Etapes_actives` est vide, « Comité innovation » suit 4 étapes (ordre du jour, invités,
mail d'invitation, compte rendu : ni envoi du CR ni notifications) ; les deux étapes écartées
restent visibles, grisées, dans la barre du haut, et absentes de la frise. Un paramétrage enregistré
l'emporte.

**Compte rendu (10/11/2026).** L'étape Compte rendu intègre GFS dans la page, par le même pont Grist
que publipostage+ dans la page Rédaction (`js/core/grist-bridge.js`) : GFS reçoit la ligne de la
séance (`Suivi_Instance`) comme enregistrement sélectionné ; ses réglages sont rangés sous la clé
`gfs` des options de ce widget. Adresse : celle d'une vue GFS déjà présente dans le document
(`_grist_Views_section`), sinon `https://lombre33.github.io/grist-widget-GFS/prototype/`, ou
`?gfs=<url>` sur l'URL du widget. Le bouton « Télécharger le CR » ouvre le **dernier** fichier de la
cellule `Suivi_Instance.CR_PDF` ; quand GFS écrit dans `Suivi_Instance`, la page relit ses tables.
L'onglet « PDF exporté » affiche ce même PDF dans la page.

**Sous-points de l'ordre du jour (10/11/2026).** Un point peut avoir des sous-points : même table
`Instance_Points`, `Parent` renseigné, mêmes propriétés (titre, nature, durée, projets, présentateurs,
invités, dossier). Un seul niveau : une ligne dont le parent est absent ou est déjà un sous-point reste
un point. Repliés par défaut (bouton à droite du titre, avec le nombre ; état non retenu, seulement
pour la session) ; sous le dernier, une ligne « + Sous-point » et un rappel de durée. `Ordre` des
sous-points = rang parmi leurs frères ; les flèches ne déplacent qu'entre frères (pas de glisser-déposer).
Durée (demande d'Antoine) : tant qu'**un** sous-point reste vide (durée 0), le point **garde sa durée**
et les sous-points renseignés s'y découpent (le premier commence avec le point, les autres s'enchaînent) ;
dès que **tous** ont une durée, le point **prend leur total** (champ grisé, la durée saisie n'est jamais
réécrite : elle revient si un sous-point est vidé). Renseignés au-delà de la durée du point avec un
sous-point encore vide : bouton orange et alerte non bloquante. Un sous-point neuf a une durée vide et la
nature de son point ; le curseur arrive dans son titre. Supprimer un point qui en porte demande
confirmation et emporte ses sous-points. Les invités (sujets, premier horaire de passage), les conflits
de disponibilité et les notifications liées comptent aussi les sous-points. Code : `L.dureeOf`,
`L.scheduleWithSubs` (`instances-logic.js`), `pointBlockHtml` (`page-instances.js`), fin de `css/instances.css`.

**Ordre du jour : clavier et glisser-déposer (12/11/2026).** Dans le titre d'un point, **Entrée**
enregistre le titre et ajoute un point juste après (un sous-point sous le même point si l'on édite un
sous-point ; rangs suivants décalés dans la même écriture), le curseur arrive dans le nouveau titre ;
rien si le titre est encore vide (pas de lignes vides en rafale). **Maj+Entrée** ou **Ctrl/Cmd+Entrée** :
retour à la ligne (comme GFS et publipostage+). Dans les autres champs (durée…), Entrée enregistre
seulement. Glisser-déposer : moitié haute d'une ligne = avant, moitié basse = après (le trait de dépôt
l'indique) ; une zone « Déposer ici pour mettre en dernier » apparaît en bas de la liste pendant le
glissement (aucune place perdue sinon) ; déposer sur un sous-point place le point après son point.
Code : `onEnter`, `addPoint`, `dropTarget`, `movePoint` (`page-instances.js`).

**Grade du poste (12/11/2026).** `Postes2.grade` (lu seulement ; la fiche Poste ne l'écrit pas) :
`L.gradeKind` ne retient que « VP » (aussi « vice-président ») et « Directeur.trice etablissement »
(accents, casse et ponctuation ignorés) ; Agent, Direction service et assitant.e n'ont aucune couleur.
Un VP ressort en magenta plein (étiquette d'invité sur un point, pastille « VP » dans l'étape Invités ;
pas de bandeau sur la ligne, Antoine 12/11), un.e directeur.trice d'établissement en bleu-vert (pastille « Dir. »). Parmi les invités
**spécifiques** (ceux ajoutés sur un point ; ex-« spéciaux », renommés), les VP passent en premier, puis
les directeur.trice.s d'établissement (voir « Deux listes d'invités » ci-dessous).
Sans colonne `grade` (ou sans valeur), rien n'est coloré. Code : `gradeKind`, `sortGuests`
(`instances-logic.js`), `buildModel` (`instances-data.js`), `gradeClass` (`page-instances.js`), fin de
`css/instances.css`.

**Heure de début du CTO (12/11/2026).** `Suivi_Instance.Heure` est vide dans la plupart des séances
(la page affiche alors l'heure habituelle `Instances.Heure_debut`). Pour « CTO Innovation »
(`INSTANCE_RULES[].heures`, `instances-logic.js`), deux boutons **9h00 / 10h45** dans le bandeau
(à côté de l'heure ; masqués avec lui quand le bandeau est replié) écrivent l'heure choisie dans
`Suivi_Instance.Heure`, sur la date de la séance (message si elle n'a pas de date). Le bouton n'est mis en valeur que
quand l'heure est enregistrée dans la séance ; le sélecteur d'heure existant reste pour une autre
heure. Les autres instances n'ont pas ces boutons. Tout (points, invités, conflits) repart de la
nouvelle heure.

**Deux listes d'invités (12/11/2026).** L'étape Invités sépare, par défaut et toujours, les **invités
spécifiques** (ajoutés sur un point), en tête sous leur titre violet, des **invités habituels** (liste
permanente, composition) ; les titres de section n'apparaissent que s'il y a des invités spécifiques.
Ordre par défaut dans chaque liste : (spécifiques seulement : VP, puis directeur.trice.s d'établissement)
puis les **excusés**, puis ceux qui **viennent**, puis les **à confirmer** (réponse à l'invitation, pas
l'appel du jour) ; un invité qui change de réponse change donc de rang. Le tri choisi par clic sur un
en-tête (Personne, Réponse, Appel du jour) s'applique ensuite DANS chaque liste, jamais entre les deux.
Code : `L.sortGuests`, `DEFAULT_REPONSE_RANK` (`instances-logic.js`), classes `gsec` (fin de `css/instances.css`).

**VP d'abord dans chaque liste (23/11/2026).** À critère de présence égal (le rang de réponse par défaut, ou le tri choisi
Réponse / Appel du jour), les **VP passent en premier**, puis l'**ordre alphabétique** sur le nom affiché (prénom d'abord), puis
l'ordre d'origine ; vaut pour la liste habituelle comme pour les spécifiques (où les directeur.trice.s viennent juste après les VP).
Le critère de présence reste au-dessus : un excusé passe avant un VP qui vient ; le tri « Personne » reste purement
alphabétique. Le grade vient de `Postes2.grade` : un VP dont le poste n'a pas la valeur « VP » dans cette colonne n'est pas
reconnu (ni pastille, ni tri).

**Durée de l'instance (12/11/2026).** Le sélecteur de durée du paramétrage (`Instances.Duree_min`)
propose tous les quarts d'heure de 30 min à 6 h, puis 7 h et 8 h (`L.DUREES` ; 1 h 45 pour un CTO) ;
une durée déjà enregistrée hors de cette liste reste affichée et cochée. Tant que `Duree_min` est vide,
« CTO Innovation » dure **1 h 45** (`INSTANCE_RULES[].duree`) et les autres instances 3 h ; une durée
enregistrée l'emporte. Le sélecteur d'heure de début, lui, est déjà au quart d'heure.

**Couleur des lignes d'invités (12/11/2026).** Dans l'étape Invités, la couleur d'une ligne suit la
**présence prévue** (réponse à l'invitation) : fond vert = viendra, rouge = excusé, blanc par défaut
(à confirmer). Un conflit de créneau reste signalé par une barre orange à gauche de la ligne et par
les sujets orange, sans changer cette couleur. Le grade (VP, directeur.trice) ne colore plus la ligne :
seulement sa pastille. Classes `rep-ok` / `rep-no` / `flag` (fin de `css/instances.css`).

**Présentateur = aussi invité (12/11/2026).** Choisir un présentateur sur un point qui n'est PAS dans la liste par
défaut de l'instance (`Instances.Invites_permanents` + composition) l'ajoute aux invités de la séance
(`Instance_Invites`, origine « Ajouté sur un point », donc dans la liste des invités spécifiques) et le relie au
point (`Instance_Points.Invites`). Une personne déjà invitée sur la séance (ajoutée ailleurs) est seulement reliée au
point, sans seconde fiche. Retirer un présentateur ne le retire PAS des invités (il peut être invité sans présenter) ;
le rechoisir ne recrée rien. Le menu « Présenté par » affiche « ajout aux invités » sous les personnes concernées.

**Vue d'ensemble : rail complet par défaut (12/11/2026).** Le fil de jalons de la vue d'ensemble montre par défaut
les 6 étapes (variante C « Rail complet », choix retenu dans `Preferences_Widget.Inst_vue_ensemble`) ; les variantes A
(fil horizontal) et B (fil vertical) restent proposées et omettent les jalons 1 et 2 (déjà en tuiles). Jalons :
**1 · ODJ validé** (étape Ordre du jour : points, durée, conflits), **2 · Présence invités confirmée** (étape Invités :
`réponses reçues/invités`, viendra · excusés · à confirmer ; la validation reste manuelle), **3 · Mail d'invitation**
(date d'envoi, invitations écrites), puis le jalon **Timing envoyé aux invités** (sans numéro, horloge : horaires de
passage envoyés/à envoyer d'après `Instance_Invites.Passage_envoye_*`, « à renvoyer » quand l'horaire a changé ; un clic
ouvre l'étape Invités où se trouvent les boutons d'envoi), puis 4 · Compte rendu, 5 · Envoi du CR, 6 · Notifications.
L'étape Invités signale (alerte non bloquante) les invités qui n'ont pas encore répondu.

**Mail d'invitation : GFS intégré (12/11/2026).** L'étape « Mail d'invitation » porte maintenant GFS sous la carte de
la date d'envoi, comme l'étape Compte rendu : même pont Grist que publipostage+ dans la page Rédaction
(`js/core/grist-bridge.js`), même iframe (une seule, jamais rechargée en passant du compte rendu à l'invitation et
retour ; masquée, pas détruite, sur les autres étapes), enregistrement sélectionné = la ligne de la séance dans
`Suivi_Instance` (publipostage+ y retrouve ses colonnes ; ses invités passent par « Tables liées » vers
`Instance_Invites`). La barre indique le modèle à ouvrir dans l'explorateur de GFS (`Instances.Modele_invitation`,
modèle de type e-mail) : le widget ne peut pas piloter l'explorateur de GFS, c'est la personne qui ouvre le modèle.
Pas de bascule PDF (un mail n'a pas de PDF), mais « Hauteur » et « Plein cadre » comme pour le compte rendu ; en plein
cadre (panneau masqué) la barre garde la date d'envoi (`Suivi_Instance.Mail_invitation_le`, qui valide l'étape),
le bouton « Envoyé aujourd'hui » et le compteur d'invitations écrites. Quand GFS écrit dans `Suivi_Instance`, la page ne
relit que si une des colonnes `CR_PDF`, `Mail_invitation_le` ou `Mail_CR_le` est touchée (publipostage+ peut renseigner
la date d'envoi après l'envoi). Non validé dans un vrai Grist (le proxy de ce projet n'atteint pas GFS).

**Choix de l'instance dans la page (16/11/2026).** Le menu déroulant « Instances » de la barre de navigation est
supprimé : « Instances » est un simple bouton qui ouvre la page. Le choix d'instance est dans le bandeau de la page,
à la place de l'ancien badge (même ligne, aucune place verticale en plus) : un bouton radio par **instance principale**
(`principal: true` dans `INSTANCE_RULES` : CTO Innovation, Comité innovation), l'instance affichée en bleu, et une icône
« ⋯ Autres instances » qui ouvre le menu des autres (vide pour l'instant : COPIL et COT seront ajoutées plus tard,
en les déclarant dans `INSTANCE_RULES`). Une instance non principale choisie prend la place d'un bouton. Flèches
gauche/droite = instance voisine (focus conservé). Sans aucune instance principale reconnue (noms différents dans
Grist), les deux premières font les boutons. Le choix reste retenu par utilisateur (`Preferences_Widget.Inst_instance`).
`tests/index.html` reproduit le bouton de la barre : à garder identique à `index.html`.

**Étape Invités : la réponse disparaît après l'appel (17/11/2026).** La colonne « Réponse » (À confirmer / Viendra /
Excusé) n'a plus d'objet une fois l'appel du jour fait : elle disparaît **pour la personne** dont `Instance_Invites.Appel`
est renseigné (case vide, grille alignée), et **toute la colonne** disparaît quand l'appel est fait pour tout le monde
(la grille perd une colonne). La réponse reste lisible au survol des boutons d'appel (« avait répondu : viendra ») et un
**œil** dans l'en-tête « Appel du jour » (visible dès qu'un appel est fait) la réaffiche pour tous, puis la recache
(état de session, non retenu). Effacer un appel (re-clic) ramène la réponse de la personne et la colonne. Conséquences :
la couleur de la ligne suit la présence constatée une fois l'appel fait (présent vert, absent rouge ; avant : la
réponse) ; un tri par réponse enregistré ne s'applique pas tant que la colonne est masquée ; l'appel vaut réponse pour
l'alerte « n'ont pas encore répondu » de l'étape et pour le jalon « Présence invités confirmée » (« x/y confirmés »).

**Étape Notifications : vue « Relecture & envoi » (23/11/2026).** Dans l'en-tête du panneau de l'étape 6, un sélecteur
**Suivi | Relecture & envoi (n)** (n = notifications pas encore transmises ; aucune ligne de plus) ; « Suivi » reste la vue par
défaut, le choix est retenu par utilisateur (`Preferences_Widget.Inst_notif_vue`). La relecture a trois volets : la liste des
projets de la séance à notifier | le **mail** | le **courrier**. **Lecture seule** : le widget n'écrit rien dans `Notifications`
ni dans `Projets` (« Transmise au porteur » se pose à la main dans Grist) ; seuls un toast et les préférences sont écrits.
- **État d'une notification** (`L.notifReviewState`) : « Transmise » si `notifications_Statut` est « 7) » ou plus ; « Signée » si la
  colonne PJ **`Projets.Notifications_Signees`** est remplie (c'est ce critère, pas le statut : « 6) Signée » sans fichier reste
  « À signer ») ; sinon « À signer ». Seules les notifications « À signer » ont une case à cocher.
- **Mail** : modèle de type e-mail de Publipostage+ choisi dans le paramétrage de l'instance (`Instances.Modele_notification`),
  lu par `VisaMail.prepare` (même moteur que l'enveloppe « Demande de visa ») : À, Cc, objet, corps, points à vérifier. Aucune
  pièce jointe n'est prévisualisée : la ligne dit « À glisser manuellement dans l'email depuis Zimbra » (`mailto:` ne joint rien).
  « Ouvrir dans ma messagerie » et « Copier » sont grisés tant que la notification n'est pas signée. Case **Zimbra** (retenue par
  utilisateur, `Inst_messagerie`) : adapte le lien pour Zimbra. Bouton « Relire » : relit `Projets`, `Notifications`, le modèle
  (une notification signée déposée entre-temps passe alors de « À signer » à « Signée »).
- **Courrier** : tant que la notification n'est pas signée, aperçu du modèle de type « document » de Publipostage+ choisi dans
  `Instances.Modele_courrier_notification` (`VisaMail.prepareDocument` : variables remplacées, HTML nettoyé, Shadow DOM ; ce que le
  widget n'évalue pas — conditions, boucles, calculs — est signalé, jamais deviné : le PDF officiel reste celui de Publipostage+).
  **Dès que `Notifications_Signees` est remplie**, le volet n'ouvre plus la version Publipostage+ mais la pièce jointe (visionneuse
  pdf.js du widget, `PdfViewer.mount`, lue avec la preuve d'accès sur la cellule `Projets/Notifications_Signees/<ligne>`) ; le
  volet n'est pas relu à chaque rendu (case cochée, clic).
- **« Tout générer (n) »** (sous la liste, pour les courriers cochés) ouvre les courriers dans **une page à imprimer, un par feuille**
  (impression ou « Enregistrer en PDF ») : le widget ne pilote pas l'export PDF de Publipostage+. Il n'enregistre ni ne marque rien.
- **Noms de Publipostage+ (23/11/2026)** : l'app passe ses tables et ses colonnes à l'anglais (traducteur `js/schema-columns.js` de son dépôt, qui
  renomme les documents à la première lecture). Le widget lit **les deux jeux de noms, colonne par colonne, l'anglais d'abord** (`visa-mail.js` :
  `MODELS_TABLES`, `LINKS_TABLES`, `readFirst`, `field` ; `page-redaction.js` : `readFirstTable`, `column`) : `Publipostage_Templates` ou
  `Publipostage_Modeles` (`Name`/`Nom`, `Content`/`Contenu`, `TemplateType`/`TypeModele`, `Subject`/`Objet`, `To`/`Destinataires`, `Cc`, `Bcc`/`Cci`,
  `HeaderFooter`) ; `Publipostage_TableLinks` ou `Publipostage_LiensTables` (`TargetTable`/`TableCible`, `TargetColumn`/`ColonneCible`,
  `SourceColumn`/`ColonneSource`, `SourceTable`/`TableSource`, `Mode`). Les valeurs de type (`email`, `document`, `reglages`) ne changent pas. Quand
  aucune table des modèles ne se lit, l'erreur `models-table-missing` porte `detail` : le nom de chaque table essayée et la cause de chaque lecture,
  affichée dans le paramétrage et dans le popover de la demande de visa.
- **Choix des modèles (23/11/2026, correction)** : les quatre modèles du paramétrage de l'instance (invitation, envoi du CR, mail et
  courrier de notification) se choisissent dans une **liste déroulante lue dans la table des modèles de Publipostage+** (`VisaMail.modelOverview` :
  type `email` pour les trois mails, `document` pour le courrier, ligne `reglages` exclue) ; la liste native (`datalist`) ne s'ouvrait pas
  au clic et l'ancienne source (`GFS_Fichiers`, les PDF que GFS garde) ne contient pas de modèles. Un modèle enregistré mais absent de la
  table reste affiché « (introuvable dans Publipostage+) ». Table absente ou aucun modèle de ce type : champ libre, et sous les champs le
  widget dit ce qu'il a vu (« la table des modèles de Publipostage+ n'a pas pu être lue (Publipostage_Templates : … ; Publipostage_Modeles : …) » ou « Aucun modèle de type e-mail trouvé
  (4 modèles lus : document 3, presentation 1) »).
- **Macro-modèles (23/11/2026)** : un modèle de type `macro` (un document assemblé : page de garde, annexes) est proposé pour le **courrier**, rangé
  à part (« Macro-modèles ») dans la liste. Sa colonne `Content` porte du JSON `{ slots: [...] }` (`js/macro-templates.js` de Publipostage+) : une
  position est `fixed` (un modèle, `modeleId` = id de ligne de la table des modèles) ou `conditional` (le modèle de la **première règle**
  `{ column, operator, value, modeleId }` qui convient, sinon `defaultModeleId`) ; `hiddenModeleIds` écarte un modèle ; les fragments sont séparés
  par un saut de page. Règles évaluées par `visa-mail.js` (`compareValues`, port réduit de `js/condition-rules.js`) : `=`, `≠`, `>`, `<`, `≥`, `≤`,
  `contient`, `vide`, `non vide` sur texte, nombre (virgule décimale), date (jj/mm/aaaa ou aaaa-mm-jj), booléen (oui/non), liste (`=` = contient) ;
  colonne nue (fiche Notifications d'abord, puis le projet) ou `Table.Colonne`. **Signalé, jamais deviné** : comparaison à une autre colonne
  (`valueColumn`), annexe qui n'est pas un document, annexe dont le modèle n'existe plus, colonne de règle introuvable (la règle ne convient pas).
- **Page du courrier (23/11/2026)** : la feuille garde la forme de la page du modèle (colonne `Margins` : marges en mm, `orientation`, `format`
  A3 à A6 ou libre ; A4 portrait et marge de 28 pt sans réglage ; un macro-modèle prend ses propres marges) à sa taille réelle (794 px pour l'A4) ;
  un **zoom CSS** l'ajuste à la largeur du volet (`fitSheet`, `ResizeObserver`), donc élargir le volet ne recompose rien. Les éléments en position
  absolue du modèle (logo) restent dans la feuille (`position:relative; overflow:hidden`). Le volet courrier est plus large par défaut.
- **Agrandir le mail ou le courrier (23/11/2026)** : bouton `rev-big` dans l'en-tête de chaque volet ; la classe `in-big-mail` / `in-big-doc` du
  conteneur masque l'autre volet (la liste reste) : **aucun rendu, aucune relecture** (le courrier garde son nœud), la feuille se re-zoome seule.
  Retenu par utilisateur : `Preferences_Widget.Inst_notif_large` (`''`, `mail` ou `doc`).
- **Vitesse (23/11/2026)** : changer de projet relisait tout Grist (métadonnées, modèles, tables liées, projets), deux fois (mail et courrier). Avec
  l'option `cache: true` (celle de cette vue), `VisaMail` garde 2 minutes les lectures de tables (réussies ou en échec) et les résultats prêts
  (`peek(kind, args)` les rend sur-le-champ : pas de « Lecture du modèle… » entre deux projets) ; `clearCache()` les jette : bouton « Relire »,
  données du widget rechargées (`renderInstances`), retour sur la fenêtre (`focus`, `visibilitychange`). Les lectures d'une préparation partent en
  parallèle (avant : à la suite), et après l'affichage du projet courant les autres notifications de la séance se préparent en arrière-plan, une à
  la fois (`warmReview`). Sans `cache`, tout se relit comme avant (Administratif, demande de visa).
- Colonnes ajoutées par `ensureColumns` : `Instances.Modele_notification`, `Instances.Modele_courrier_notification`,
  `Preferences_Widget.Inst_notif_vue`, `Preferences_Widget.Inst_messagerie`, `Preferences_Widget.Inst_notif_large`. Non validé dans un vrai Grist (le proxy de ce projet
  n'atteint ni Publipostage+ ni les pièces jointes). Code : `notifReviewState`, `pickReviewItem` (`instances-logic.js`), `reviewHtml`,
  `ensureMail`, `syncReviewDoc`, `generateLetters` (`page-instances.js`), `prepareDocument`, `listDocumentModels` (`visa-mail.js`),
  `PdfViewer.mount` (`pdf-viewer.js`), bloc « Étape Notifications — vue Relecture & envoi » de `css/instances.css`, tests
  `tests/suite-instances-relecture.js`.

## Lignes_OPE

Table renommée côté Grist par Antoine (confirmé le 22/10/2026) ; s'appelait
`EcritureComptables` jusque-là, d'où le nom encore utilisé dans les entrées de
`VERSION.md` antérieures à cette date.

`N_OPE` (Text) : étiquette de la ligne OPE dans la modale projet. `installe_chez`
(Reference → `Structures`) : lue par la page Installation des fonds pour ranger un
projet dans la colonne DIESE / Ailleurs. Ces deux colonnes sont les seules que le widget
écrit : à la création (`AddRecord`, champ « Ligne OPE » de la modale projet) et à la
modification (`UpdateRecord`, clic sur le nom de l'OPE d'une carte de la page Installation
des fonds, ou clic sur le champ « Ligne OPE » déjà renseigné de la modale projet : même modale).
`N_OPE` peut être vide (12/11/2026) : une ligne dont on sait seulement la structure où elle
sera ouverte (`installe_chez`) est acceptée ; le widget l'affiche « N° à venir · structure »
(`CoreUtils.opeLabel`) et « N° OPE à venir — chez … » sur la page Installation. `totalCPConsomme` et la formule `N_OPE_LibelleOperation` ne sont pas
lues par le widget ; `Projets.Ligne_OPE_installe_chez` (formule) sert encore à l'onglet
Installation de la page To Do.

## Installation des fonds (12/11/2026)

Page en **frise de jalons**, deux zones empilées : **Création** puis **Prolongation/réabondement**, et une bascule
**DIESE / AUTRE** (« OU » non exclusif, au moins un lieu reste actif) dans le bandeau de filtres.

- **Lieu** d'un projet : DIESE si `Lignes_OPE.installe_chez` est la structure d'acronyme `DIESE` ; tout le reste (autre
  structure, aucune ligne OPE) = AUTRE. **Zone** : déduite de `Projets.Action_Ligne_OPE_a_faire` (« Prolongation de ligne »
  et « re-Abondement de ligne » -> Prolongation ; tout le reste, y compris vide et « à determiner » -> Création).
  Jamais modifiée par la page (la carte affiche l'action, le glisser inter-zones est refusé).
- **Jalon** : `Projets.Jalon_installation_fonds`, Choice créée par le widget au premier lancement (`ensureColumns`), six
  valeurs : `1) Création / prolongation de ligne`, `2) En attente DF (ou OPE sur UBInvest)`, `3) OPE disponible UB Invest`,
  `4) Projet en cours`, `5) Reliquats à traiter`, `6) Projet clôturé (reliquat inclus)`. Les trois premiers sont visibles ;
  les trois derniers sont derrière le petit « + » de chaque zone (déplié = `Preferences_Widget.Install_plus`). Libellés
  affichés propres à la zone (Prolongation : « Prolongation/réattribution », « En attente DF »). Valeur vide ou inconnue =
  1er jalon. Changement par glisser-déposer ou par le menu de la carte.
- **Reprise de l'ancienne colonne** `Statut_installation_fonds` (jamais modifiée ni supprimée) : `1) En attente
  ouverture`/`1) En attente DR` -> 1, `2) Ouverture demandée à la DF` -> 2, `3) Installé` -> 3, `4) Reliquat à traiter` -> 5,
  `5) Clôturer` -> 6. La page la lit tant que `Jalon_installation_fonds` est vide ; au chargement le widget recopie ces
  valeurs dans la nouvelle colonne (une écriture groupée, une seule fois) et complète la liste de choix de la colonne
  (`CoreGrist.ensureChoices`, couleurs conservées). La page To Do (onglet Installation) lit la même colonne.
- **Rouge** : un projet au jalon 3 (« OPE disponible UB Invest ») dont la ligne OPE n'est pas complète (numéro **et**
  structure) est affiché en rouge (carte, pastille OPE, rond du jalon), avec « OPE à compléter ».
- **Préférences** (`Preferences_Widget`, 5 colonnes `Install_*` auto-créées) : `Install_lieux` (lieux actifs),
  `Install_plus` (zones dépliées), `Install_filtre_programme`, `Install_filtre_instance`, `Install_filtre_recherche`.
  Les anciennes colonnes des volets (`Install_vue`, `Install_repliees`, `Install_masquees`) ne sont plus lues.
- Un clic sur « Convention » ouvre la modale projet sur l'onglet Convention (`ProjectModal.open(record, {tab:'conventions'})`).

## Page Annuaire (17/11/2026)

Septième bouton de la barre. Deux onglets dans un bandeau d'une seule ligne : **Personnes** et **Postes** (le nombre est affiché,
« filtrées/total » quand un filtre est actif). **V1 en lecture seule** : aucun champ n'est écrit par la page ; créer et modifier
passent par les modales Personne et Poste existantes (`openCreatePersonModal` / `openEditPersonModal`, `openCreatePosteModal` /
`openEditPosteModal`), inchangées. Code : `js/pages/page-annuaire.js`, `css/annuaire.css`, tests `tests/suite-annuaire.js`.

- **Personnes** : trois présentations (liste, par structure avec groupes repliables, cartes). Colonnes de la liste : Nom (★ =
  accompagnateur de l'innovation), Poste, Structure (+ direction), Employeur, Type, Contact (+ copier l'e-mail), Projets, alerte,
  modifier. En-têtes Nom / Structure / Employeur triables. Un clic sur le nom ouvre la **fiche latérale** (coordonnées, assistant·e,
  matricule, schéma Tutelle > Direction > Structure > Poste, poste secondaire, contrat, employeur, projets par rôle, étiquettes,
  alertes) ; Échap, la croix ou le voile la ferment, changer de page aussi.
- **Chaîne de rattachement** : poste = `Annuaire.Poste2` ; structure = `Postes2.Structure2` ; direction =
  `Structures.Directon_Structure_mere` ; tutelle = `Structures.Etablissement_Tutuelle_gestionaire` ; **employeur** =
  `Postes2.Employeur_tutelle` (peut différer de la tutelle de la structure : chercheur CNRS dans une structure UB). À confirmer par
  Antoine : « Employeur » = employeur du poste.
- **Projets d'une personne** : `Porteur_1/2/3`, `VP_porteur_signataire_notif` (VP porteur), `Accompagnateur`. Comptés une seule fois
  (porteuse **et** accompagnatrice d'un même projet = 1). Chaque puce de la fiche ouvre la modale projet
  (`ProjectModal.open(ligne du projet)`) ; la fiche reste dessous.
- **À vérifier** (bouton + compteur) : personnes — nom en doublon, e-mail en doublon (accents et casse ignorés), e-mail manquant,
  aucun poste ; la fiche relie vers l'autre fiche du doublon. Postes — vacant (aucune personne en poste principal **ou**
  secondaire) ou contrat qui se termine dans moins de 90 jours (déjà terminé compris, `Postes2.Date_de_fin`).
- **Filtre Type** : les choix sont lus dans Grist (`CoreGrist.columnChoices('Annuaire', 'Type')`, ordre de Grist), complétés par
  les valeurs présentes dans les données ; jamais une liste en dur. Valeurs réelles (17/11/2026) : BIATSS, C, EC, Doctorant.e,
  Fonction. Le filtre Type n'existe que sur l'onglet Personnes ; employeur et structure (listes à sélection multiple, choix =
  valeurs des postes) servent aux deux onglets.
- **Préférences** (`Preferences_Widget`, 9 colonnes `Annu_*` auto-créées) : `Annu_onglet`, `Annu_vue`, `Annu_recherche`,
  `Annu_filtre_employeur`, `Annu_filtre_structure`, `Annu_filtre_type` (listes via `CoreUtils.encodeList/decodeList` : un libellé
  peut contenir une virgule), `Annu_a_verifier` (`1` ou vide), `Annu_tri` (`clé:sens`, ex. `nom:1`), `Annu_repliees` (groupes
  repliés). Recherche écrite une seule fois après la frappe (600 ms, ou à la mise en arrière-plan de la page).
- **Mise à jour après une modale** : les modales Personne et Poste envoient l'évènement `directory-changed` (`{table, id, created}`)
  après l'enregistrement ; la page relit `Annuaire` et `Postes2` dans Grist (le nom calculé `nom_et_Prenom` et le nom de poste
  sont des formules), redessine, et ouvre la fiche d'une personne créée depuis la page. Les autres pages profitent de la relecture.
- **Bulles d'aide** : en-têtes de colonnes et libellés de la fiche (`HelpTooltip.markup`) pour les colonnes qui ont une
  Description dans Grist ; aucune icône sinon.
- Pas dans la V1 : photos (`Annuaire.photos`), `Actions_PUI`, suppression de personne, champs d'étiquettes éditables.

## Page Dashboard (18/11/2026)

Premier bouton de la barre. Maquette validée le 10/11/2026 (Artifact Design), mise en œuvre le 18/11/2026. « Bilan » 2023-2026 pour
l'instant. Code : `js/pages/dashboard-logic.js` (règles de calcul, pures), `js/pages/page-dashboard.js` (rendu, interactions,
préférences), `css/dashboard.css`, tests `tests/suite-dashboard.js`.

- **Page** : bandeau d'une seule ligne (années en pastilles, Programme et Statut à cases multiples, recherche de projet, mesure CP/AE,
  icône « Réinitialiser » visible seulement quand un filtre est actif, bouton « Graphiques »). En dessous : total attribué / consommé,
  deux graphiques à détail progressif (années > programmes > projets et l'inverse, un clic sur une barre filtre, le fil d'Ariane
  remonte), puis un **volet par programme** (replié par défaut) qui contient ses projets (attribué, consommé, **statut modifiable**),
  puis, sous chaque projet, un volet **Dépenses** (replié par défaut) avec les lignes de l'export FD02.
- **Attribué par année** : `Projets.cAAAA_M10_Fonctionnement + cAAAA_M20_Investissement + cAAAA_M30_Personnel` (AAAA = 2023…2026).
  Jamais `Montant_attribue_Total` (il ne somme que 2026-2028) ni `Total_AAAA` (formules qui renvoient « » à 0). **À revoir** : pour les
  projets de l'historique importé, ces colonnes resteront vides ; l'attribué viendra des `Lignes_OPE` (`Attribue_AAAA`), voir l'outil de
  fusion. Tout passe par la seule fonction `buildDataset` (dashboard-logic.js) : changer de source ne touche qu'elle.
- **Consommé par année** : table `Depenses_OPE` (export FD02 « Consommation détaillée des AE », une ligne par objet de gestion),
  **créée à la première ouverture de la page si elle manque** (`CoreGrist.ensureTable`, 25 colonnes : `Exercice` Int, `Code_operation`,
  `CRB`, `SO`, `Sous_SO`, `Nature_depense`, `Code_analytique`, `Reference_externe_operation`, `Destination`, `Libelle_destination`,
  `Num_EJ`, `Type_objet`, `Libelle_objet`, `Date_creation`, `Fournisseur`, `Etat`, `Date_validation`, `EJ_montant_budgetaire`,
  `Montant_budgetaire_SF`, `AE_consomme_hors_virement`, `AE_consomme_sur_virement`, `AE_consomme`, `CP_consomme`, `Domaine`,
  `Donnees_au`). **Le widget ne l'écrit jamais** (alimentée par l'import). Une dépense est rattachée à un projet quand son
  `Code_operation` (espaces et casse ignorés) est le `N_OPE` d'une ligne OPE du projet (`Projets.Ligne_OPE`). CP = `CP_consomme`,
  AE = `AE_consomme` ; le choix est retenu par utilisateur (CP par défaut).
- **« Sans année »** : `Lignes_OPE.totalCPConsomme` (un seul cumul par ligne OPE) moins les CP déjà détaillés dans `Depenses_OPE`, quand
  il est positif. CP seulement (pas de total AE). Sert de repli tant que le détail n'est pas importé : sans lui, un projet afficherait 0.
  Jamais signalé comme un dépassement (il est cumulé depuis l'origine, l'attribué ne couvre que 2023-2026).
- **Sans projet rattaché** : volet à part pour les dépenses dont le code opération ne correspond à aucune ligne OPE de projet (visible
  seulement sans filtre de projet). **Hors 2023-2026** : un exercice en dehors n'est compté nulle part, une note en bas de page le signale
  avec son montant. Une ligne OPE portée par deux projets : ses dépenses vont au premier (jamais comptées deux fois).
- **Pastille « écart »** (18/11/2026, demandée par Antoine via le fil de fusion de l'historique) : sur un projet, elle signale que le
  consommé de ses lignes OPE (`Lignes_OPE.totalCPConsomme`, et `Consomme_AE` quand cette colonne existe) ne correspond pas à la somme du
  détail `Depenses_OPE` de ces mêmes lignes. Même règle que le contrôle des totaux de l'outil d'import historique
  (`ImportHistoriqueLogic.checkTotals`) : tolérance 0,50 € (`DashboardLogic.GAP_TOLERANCE`), **tous exercices confondus** (donc
  indépendante des années et de la mesure choisies), et un projet dont aucune ligne OPE n'a de détail est **« sans détail »** plutôt
  qu'en écart chiffré (sauf s'il n'a rien consommé). Rien n'est signalé tant que `Depenses_OPE` est vide. Un clic sur la pastille ouvre
  le volet Dépenses, qui explique l'écart (ligne OPE, détail, différence, ligne par ligne s'il y en a plusieurs) ; le nombre de projets
  concernés est rappelé en bas de page. Une ligne OPE portée par deux projets n'est évaluée que par le premier. Lecture seule : rien
  n'est écrit dans Grist.
- **Écrit dans Grist** : seulement `Projets.Statut_operationnel_projet` (liste déroulante d'un projet : écriture optimiste, rétablie
  avec un message si Grist refuse ; `Statut_Macro` est une formule, donc non modifiable ; relecture groupée des autres pages 2,5 s
  après) et la ligne de préférences de l'utilisateur.
- **Préférences** (`Preferences_Widget`, 6 colonnes `Dash_*` auto-créées) : `Dash_annees` (années cochées, vide = toutes ; `0` = « Sans
  année »), `Dash_programmes`, `Dash_statuts` (listes via `CoreUtils.encodeList/decodeList`), `Dash_recherche`, `Dash_mesure` (`CP`/`AE`),
  `Dash_graphiques` (`1` = graphiques ouverts ; repliés par défaut depuis le 18/11/2026). Les volets ouverts ne sont jamais retenus (repliés à chaque ouverture).
- **Lecture paresseuse** : `Depenses_OPE` n'est lue qu'à l'ouverture de la page (pas au démarrage du widget) et relue à chaque retour sur
  l'onglet si la dernière lecture a plus d'une minute (l'import se fait ailleurs). Une table illisible est signalée en bas de page sans
  bloquer le reste.
- **Bulles d'aide** : en-tête « Statut du projet » (`HelpTooltip.markup('Projets', 'Statut_operationnel_projet')`) quand la colonne a une
  Description dans Grist.
- Pas dans cette version : Grist-BI à la place des graphiques faits main, filtre sur le financeur, export.

## Dernière page ouverte (12/11/2026)

Le widget revient sur la dernière page ouverte (Dashboard, Projets, Administratif, Installation des fonds, Suivi opérationnel, To Do,
Instances, Annuaire) après un rechargement (Ctrl+Maj+R), une fermeture/réouverture ou un changement de page dans Grist. Avant, il
repartait toujours sur le Kanban. Code : `js/app.js` (section « Dernière page ouverte »).

- **Où** : colonne `Preferences_Widget.Page_courante` (Text, auto-créée avec `CoreGrist.ensureColumns`, aucune écriture
  tant que la colonne existe déjà), sur la ligne de préférences de l'utilisateur (même id de ligne en cache que les autres
  pages). Valeur : l'id de la page, par ex. `view-todo`. Une écriture à chaque changement de page, aucune au démarrage.
- **Copie locale** : `localStorage` clé `suiviProjetInnovationS:lastView` = `{"view":"view-todo","pending":false}`, écrite
  tout de suite. `pending: true` = Grist n'a pas (encore) confirmé l'écriture (rechargement lancé juste après le clic,
  droits insuffisants…) : la copie, plus récente, fait alors foi. Sinon Grist a le dernier mot. La copie sert aussi à
  afficher la page retenue **avant** la fin de la lecture des tables (pas d'éclair du Kanban).
- **Quelles pages** : toutes celles qui ont un bouton `.nav-btn[data-view]` dans la barre — une page ajoutée à la barre est
  donc retenue sans rien toucher. Les écrans passagers (fiche projet, Rédaction) ne le sont pas : après un rechargement
  depuis la Rédaction, on retrouve Administratif. Une valeur inconnue (page supprimée, texte illisible) est ignorée : Kanban.
- **Instances** : page retrouvée = `InstancesPage.open()` appelé au démarrage (elle ne chargeait ses données qu'au clic sur
  la barre). L'instance affichée est déjà retenue séparément (`Inst_instance`).
- **Sous-menus** (12/11/2026) : chaque page retrouve aussi son onglet / son étape — Administratif : Notifications ou
  Conventions (`Admin_onglet_actif`, auto-créée, seul l'onglet est écrit au clic ; avant ce jour il n'était pas retenu) ;
  To Do : onglet et vue (`Todo_onglet_actif`, `Todo_vue`) ; Installation des fonds : lieux actifs et zones dépliées (`Install_lieux`, `Install_plus`) ; Instances :
  instance, séance, étape (ODJ, Invités, CR…) et vue (`Inst_*`). Non retenu : l'affichage tableau / cartes d'Administratif.
- Limite connue : comme les autres préférences, la ligne est propre à un navigateur (id de ligne en cache) ; vider les
  données du site fait repartir sur le Kanban.

## Écarts entre le code et le schéma

L'export `docs/grist_structure` est conforme : les huit tables existent et toutes les
colonnes que le widget manipule y figurent.

### 1. Les trois colonnes 2029 sont encore des formules côté Grist (dépendance externe)

`project-modal.js` construit sa grille budgétaire sur les années 2026 à 2029 et envoie
`c2029_M10_Fonctionnement`, `c2029_M20_Investissement` et `c2029_M30_Personnel` dans
chaque `AddRecord` / `UpdateRecord` — jamais les colonnes de total (`Total_2026`…
`Total_2029`, `Montant_attribue_Total`), qui restent recalculées en direct côté JS
(`updateFinancialTotals()`) et ne sont jamais poussées vers Grist. C'est le comportement
voulu (confirmé le 18 septembre 2026) : seules les 3 masses de données par année
partent vers Grist, jamais un total qui est une formule.

Mais dans le schéma actuel, `c2029_M10_Fonctionnement`, `c2029_M20_Investissement` et
`c2029_M30_Personnel` sont eux-mêmes déclarés comme formules
(`def c2029_M10_Fonctionnement(rec, table): return None`), au même titre que
`Total_2029`. Grist refuse une écriture sur une colonne formule : tant que ces trois
colonnes ne sont pas converties en `Numeric` côté Grist, l'enregistrement d'un projet
échoue dès que l'utilisateur touche au budget 2029. Rien à corriger côté widget ici — la
conversion des colonnes est une action Grist, pas un changement de code.

### 2. `Ligne_OPE` — corrigé le 18 septembre 2026

`Projets.Ligne_OPE` est déclarée `grist.ReferenceList('Lignes_OPE')`. Le widget
la traitait comme une référence simple : il écrivait un identifiant numérique au lieu du
format `['L', id…]` attendu, et à la relecture `setRef()` recevait un tableau dont il
lisait `.id`, ce qui laissait le champ vide même quand une ligne OPE était rattachée.
`setRef()` déballe maintenant le tableau à la lecture et `collectFields()` pousse le
même format que `Partenaire_s_convention_reversement` (`['L', id]` ou `['L']` à vide).

### 3. Champs référence : texte libre bloqué au blur — corrigé le 18 septembre 2026

Les champs référence de la modale projet (`Porteur_1/2/3`, `VP_porteur_signataire_notif`,
`Accompagnateur`, `Instance_ratachee`, `Ligne_OPE`) et le champ Poste de la fiche
Personne laissaient du texte tapé affiché même sans clic sur une suggestion : l'id
interne restait vide mais le champ semblait renseigné, et rien n'empêchait de croire
qu'une valeur libre serait enregistrée. Au blur, si aucune suggestion n'a été
sélectionnée, le champ est maintenant vidé : seul un objet réellement choisi dans la
liste peut être poussé vers Grist.

### 4. `Conventions_statut` redéfini à 4 étapes — la formule `Statut_Macro` reste à aligner côté Grist (29 septembre 2026)

Les étapes de `Projets.Conventions_statut` sont désormais « 1) Convention en redaction »,
« 2) Convention en relecture », « 3) Convention en signature » et « 4) Convention signée
de toutes les parties » (avant : 5 étapes, dont « 5) Convention signée de toutes les
parties »). Le widget accepte encore les anciens libellés en lecture et n'écrit que les
nouveaux ; le classement du Kanban compare le libellé sans son numéro.

En revanche la formule Grist `Statut_Macro` (export `docs/grist_structure`) compare encore
`rec.Conventions_statut` au littéral `"5) Convention signée de toutes les parties"` : tant
qu'elle n'est pas mise à jour vers `"4) …"`, un projet à convention signée reçoit le
libellé de convention comme `Statut_Macro` et disparaît du Kanban. Action Grist (les
formules ne sont jamais écrites par le widget), pas un changement de code. Les colonnes
`next_step`, `Transmise_signee_au_porteur_le` et `Lien_convention` (page Administratif,
onglet Conventions) ne figurent pas non plus dans l'export ; le widget déduit leur table
(`Projets` par défaut, sinon la fiche `Notifications` du projet) des colonnes chargées.

### 5. Date de début du projet et code d'urgence (page Administratif, 1er octobre 2026)

`Projets.Date_debut_Projet` (Date, déjà documentée) est affichée en lecture seule sur les
cartes Notifications (avec les badges) et Conventions (sous l'acronyme) ; colonne vide : rien
ne s'affiche. La couleur dépend de l'écart en jours entre aujourd'hui (jour calendaire local)
et la date, avec des seuils propres à chaque onglet :

| Couleur | Notifications | Conventions |
|---|---|---|
| rouge | date passée, ou début dans moins de 7 jours | date passée, ou début dans moins de 14 jours |
| orange | 7 à 21 jours | 14 à 29 jours |
| neutre | 22 à 60 jours | 30 à 60 jours |
| vert | plus de 60 jours | plus de 60 jours |

Étape terminée (Archivée, Convention signée) : date visible mais neutre. Les seuils sont dans
`URGENCY_RULES` (`js/pages/page-administratif.js`). Aucune écriture dans Grist.

### 6. L'onglet Conventions ne liste que les projets avec une convention (1er octobre 2026)

`Conventions_statut` vaut « Convention en redaction » par défaut pour TOUTE ligne de `Projets`
(`_default_Conventions_statut`), convention ou non. L'onglet Conventions de la page
Administratif ne retient donc que les projets dont `Convention_de_reversement` est coché, comme
le Kanban Projets et la formule `Statut_Macro`. Décocher la case retire le projet de l'onglet
(son statut de convention est conservé et reparaît si on recoche).

### 7. Onglet Conventions : volet automatique, transmission au porteur, responsables, dernière action (3 novembre 2026)

**Volet automatique.** Chaque clic sur la pastille d'un signataire (UB, partenaire 1, partenaire 2)
écrit le statut de signature ET `Projets.Conventions_statut` dans la même `UpdateRecord` ; la carte
change donc de volet sans glisser-déposer. Règle : tous les signataires « Signée » → « 4) Convention
signée de toutes les parties » ; sinon le volet suit le signataire le plus avancé (relecture, puis
signature). Un clic qui fait avancer ne recule jamais une carte placée plus loin à la main ; un clic
qui fait reculer ne la fait jamais avancer ; le glisser-déposer reste possible.
`convention_statut_UB/partenaire_1/partenaire_2` et `Conventions_statut` sont donc écrites ensemble.

**Saisie des dates de transmission.** Un choix fait à la souris (calendrier, « Aujourd'hui », « Effacer »)
est enregistré tout de suite. Une date tapée au clavier l'est à Entrée ou quand on quitte le popover
(clic à côté, Tab) ; Échap l'abandonne : le champ date de Chrome déclenche « change » à chaque segment
complet, taper 15 passerait sinon par le 01. Seules les années 1900 à 2100 sont enregistrées.

**Colonnes.** Deux colonnes sont nouvelles et créées par le widget au premier lancement qui suit la
mise à jour (`ensureAdministratifColumns`, avec une description pour les bulles d'aide) :

| Colonne | Type | Usage |
| --- | --- | --- |
| `Projets.next_step_responsable` | **ReferenceList** → `Annuaire` | personnes taguées sur la prochaine étape, écrite au format `['L', id…]` |
| `Projets.Transmise_signee_au_porteur_papier_le` | Date | date de transmission du document papier au porteur |

Colonnes déjà existantes réutilisées : `Transmise_signee_au_porteur_le` (lue comme la date de
transmission **par e-mail**), `convention_Date_derniere_modification` (affichée et modifiable comme
« Dernière action »), `next_step`, `comentaire_general_Suivi_projet`. Les colonnes de `Notifications`
ne sont pas doublonnées : une colonne déjà présente dans `Projets` ou `Notifications` n'est pas recréée.
Si le widget n'a pas les droits de modifier le schéma (ou si Grist refuse), un message liste les
colonnes à créer à la main ; les cartes restent utilisables sans.

**Réglage Grist conseillé.** Sur `next_step_responsable`, régler « Colonne à afficher » sur
`nom_et_Prenom` pour une lecture lisible dans Grist (le widget résout lui-même les noms depuis
`Annuaire`). La future page To Do filtre sur cette colonne.

### 8. Onglet Conventions : sous-étapes du statut de l'UB (10 novembre 2026)

Sous la pastille de statut de **l'UB uniquement** (jamais sous un partenaire), de petites pastilles
datées suivent l'avancement fin de la relecture puis de la signature. Elles apparaissent selon le statut
de l'UB : « Relu » → *V1 disponible* et *Relu par Hélène & Antoine* ; « en cours de signature » →
*Demande de visa* et *Parapheur envoyé* ; « Non relu » et « Signé » → aucune. Une pastille est grise et
pointillée sans date, bleue avec « jj/mm » une fois datée ; un clic ouvre le même popover de date que la
transmission au porteur (mêmes règles de saisie). Une sous-étape ne change jamais le statut ni le volet :
seule la pastille de statut le fait, et les dates déjà saisies restent quand on change de statut.

Quatre colonnes **Date** sont créées par le widget au premier lancement qui suit la mise à jour (dans
`Projets`, avec une description pour les bulles d'aide ; jamais des formules) :

| Colonne | Sous-étape | Visible quand le statut de l'UB est |
| --- | --- | --- |
| `Projets.convention_UB_v1_le` | V1 disponible | Relu |
| `Projets.convention_UB_relu_le` | Relu par Hélène & Antoine (une seule date) | Relu |
| `Projets.convention_UB_visa_le` | Demande de visa | en cours de signature |
| `Projets.convention_UB_parapheur_le` | Parapheur envoyé | en cours de signature |

Comme pour les autres colonnes de cet onglet, une colonne déjà présente dans `Projets` ou `Notifications`
n'est pas recréée ; si le schéma n'est pas modifiable, le message de démarrage les liste.

### 9. Onglet Conventions : mail « Demande de visa » (17 novembre 2026)

Sur la ligne de la sous-étape *Demande de visa* (statut de l'UB « en cours de signature »), une petite enveloppe
ouvre un brouillon rempli dans la messagerie (`mailto:`), d'après un **modèle e-mail de Publipostage+** (GFS
n'est pas ouvert). Code : `js/pages/visa-mail.js` (logique) et `js/pages/page-administratif.js` (bouton, fenêtre).

- **Lecture seule** : table des modèles de Publipostage+ (lignes de type `email` ; noms d'avant `Publipostage_Modeles` :
  `Nom`, `Contenu`, `Objet`, `Destinataires`, `Cc`, `Cci`, ou noms anglais `Publipostage_Templates` : `Name`, `Content`,
  `Subject`, `To`, `Cc`, `Bcc` — les deux sont lus, voir « Noms de Publipostage+ » plus haut) et table des règles de
  liaison (`Publipostage_LiensTables` ou `Publipostage_TableLinks`). Rien n'y est écrit ; elles ne sont
  lues qu'au clic (aucun appel de plus au démarrage).
- **Modèle retenu par utilisateur** : `Preferences_Widget.Mail_visa_modele` (nom du modèle, pas un identifiant ;
  même principe que `Instances.Modele_invitation`) et `Mail_visa_client` (`zimbra` ou vide), colonnes auto-créées.
  Sans modèle retenu, le premier clic ouvre le choix ; le lien « Mail de demande de visa » de la fenêtre de date de
  *Visa* permet de le changer.
- **Contexte de résolution** : la ligne `Notifications` du projet, puis la ligne `Projets`. Les variables suivent
  Publipostage+ : colonne affichée des références, listes, rebonds `Réf.Colonne`, règles de liaison, dates / nombres /
  booléens, texte avant / après.
- **Limites du mailto** : texte brut (la mise en forme saute), aucune pièce jointe, lien de 2 000 caractères au
  plus. Les conditions, boucles et calculs de Publipostage+ ne sont **pas** rejoués : le widget le signale. Toute
  variable sans valeur, adresse invalide, absence de destinataire ou lien trop long est dite dans une fenêtre avant
  l'ouverture (« Ouvrir quand même » reste possible). Option « Ma messagerie est Zimbra » : mêmes contournements
  que Publipostage+.
- Rien n'est écrit dans `Projets` à l'envoi ; la date de *Visa* reste saisie à la main.

### 10. Onglet Conventions : la convention en PDF, pièce jointe (17 novembre 2026)

À partir de l'étape **« en signature »** (étapes 3 et 4, anciens libellés compris), la cellule du lien
(`Lien_convention`) devient la colonne pièce jointe `Projets.Convention_de_reversement_le_cas_echeant`
(Attachments, déjà dans l'export) : même place sur la carte, aucune ligne en plus. Avant (rédaction,
relecture), le lien reste, puisque c'est le Word partagé pour la relecture. Un lien déjà saisi reste
ouvrable à l'étape de signature (petite icône), rien n'est caché.

Dans la cellule : le nom du PDF (clic = **affichage** dans la visionneuse du widget, voir ci-dessous), une icône de
téléchargement (téléchargement forcé par Grist, sous le vrai nom du fichier), une croix au survol pour **retirer le fichier de la
cellule** (il reste dans les pièces jointes du document), et un trombone pour **joindre** un PDF.
Téléverser = `POST {baseUrl}/attachments?auth=<jeton>` (champ multipart `upload`, droit d'édition requis),
puis écriture `['L', …numéros]` sur la ligne de `Projets` — la liste lue après l'envoi, donc les fichiers
déjà là sont conservés. Seuls les PDF sont acceptés (type ou extension). Le jeton est `readOnly:false` :
un jeton `readOnly:true` est plafonné au rôle Lecteur et ne peut ni lire une pièce jointe réservée aux
éditeurs ni en envoyer une. Code partagé avec la fiche projet : `js/core/attachments.js`
(`CoreAttachments`) ; les noms de fichier (`_grist_Attachments`) ne sont relus que pour un numéro inconnu.
Colonne `Lien_convention` et fiche projet inchangées.

**Afficher plutôt que télécharger : visionneuse intégrée au widget.** Une adresse `…/attachments/<n>/download`
de Grist ne s'affiche pas dans le navigateur (`Content-Security-Policy: sandbox`, téléchargement forcé selon
la version, même avec `?inline=1`) ; un `blob:` ouvert dans un nouvel onglet est lui aussi téléchargé quand
le navigateur — ou une règle du poste — est réglé pour télécharger les PDF (cas constaté chez Antoine le
17/11). Le clic sur le nom ouvre donc **une fenêtre du widget** (`js/components/pdf-viewer.js`,
`PdfViewer.open`), sans nouvel onglet : le fichier est lu avec le jeton (`CoreAttachments.fetchBytes`, l'API
répond `Access-Control-Allow-Origin: *` aux origines non Grist, sans cookie : `credentials:'omit'`) et dessiné
par pdf.js, **déjà embarqué** pour l'outil de signature (`signature/vendor/pdfjs`, aucune bibliothèque de
plus). L'API des widgets Grist n'expose pas l'aperçu des pièces jointes de Grist, et GFS est trop lourd.
Pensée pour être légère et immédiate : la fenêtre s'ouvre aussitôt (« Chargement du PDF… »), pdf.js se charge
pendant la lecture du fichier et n'est jamais chargé au démarrage ; la première page est dessinée dès que
possible, les autres sont demandées à l'approche de l'écran (marge de 900 px) et libérées en s'en éloignant
(un PDF de 60 pages ne garde que 2 ou 3 toiles) ; au repos, une fois qu'une carte a un fichier, le module et
le worker (1,4 Mo) sont préchargés (`PdfViewer.preload`, une seule fois). Zoom −/+ (40 à 300 %), « Télécharger »
(adresse Grist, fichier enregistré sous son vrai nom), Échap / croix / clic hors fenêtre pour fermer, focus
rendu au nom du fichier. Pas de texte sélectionnable ni de lien actif. Diagnostic : une lecture refusée
(403/404 = règle d'accès, réseau), un contenu qui n'est pas un PDF ou un PDF illisible affichent leur cause
dans la fenêtre (et dans la console) ; « Télécharger » reste le recours. Mesuré avec un vrai PDF de 12 pages :
fenêtre en ~0,1 s, première page en ~0,3 s (en local).

**Fiche projet (même jour).** Les noms de pièces jointes de la fiche (« Notification signée », « Convention de
reversement (pièce jointe) », onglet Général) s'ouvrent aussi dans cette visionneuse : un écouteur par
conteneur (`wireAttachmentViewer`, `js/components/project-modal.js`) intercepte le clic sur `a.cp-attachment-link`.
Le lien garde son `href` Grist : Ctrl/Cmd/Maj/clic milieu, un fichier dont l'extension n'est pas `.pdf`, ou une
visionneuse absente retombent sur le comportement du navigateur (onglet / téléchargement). Un fichier sans nom
connu (« Pièce jointe #n ») passe par la visionneuse, qui dit si ce n'est pas un PDF. La cellule
(`tableId/colId/rowId`) est relue à chaque ouverture de la fiche (la fiche est réutilisée d'un projet à l'autre).

### Divergences sans effet

Trois clés lues par le code n'existent dans aucune table ; elles sont toujours suivies
d'un repli valide et n'ont pas d'impact visible :

- `Projets.Progression` — l'alias `Progression` vaut toujours `0` ;
- `Etablissements.acronyme` (minuscule) — `Acronyme` prend le relais ;
- `Suivi_Instance.name` (minuscule) — la formule `Nom` prend le relais.

Enfin, le nom de table `Etablissement` au singulier dans `CoreGrist.TABLE_NAMES` ne
correspond à rien : son chargement échoue et est ignoré.

**Recherche de personnes dans les menus de la page Instances (10/11/2026).** La recherche (invités, présentateurs,
relecteurs, projets…) ignore casse, accents et ponctuation, et chaque mot tapé doit se trouver quelque part (nom,
prénom, e-mail, poste), dans n'importe quel ordre : « jean dupont » trouve « DUPONT-MARTIN Jean-Pierre ».

**Protection contre la perte de saisie dans GFS / publipostage+ (10/11/2026).** Le widget ne recharge jamais la page
Grist (aucun `location.reload`) et ne vérifie plus à chaque ouverture que le schéma est modifiable : la formule de
`Preferences_Widget.Email_utilisateur` n'est réécrite (`ModifyColumn`) que si elle n'est pas déjà `user.Email`.
Quand GFS écrit dans `Suivi_Instance`, la page ne relit (cette seule table) que si la colonne `CR_PDF` est touchée ;
auparavant toute écriture de GFS (enregistrement pendant la frappe) relisait les dix tables de la page. Enfin, le pont
(`js/core/grist-bridge.js`) demande **confirmation avant de recharger ou fermer la page** (`beforeunload`) tant que
l'utilisateur travaille dans une iframe reliée : focus dans l'iframe, ou geste (focus, écriture dans le document par
l'iframe) depuis moins de 10 minutes. Limites : un rechargement décidé par Grist (reconnexion, mise à jour du serveur)
peut ne pas laisser le temps de la confirmation, certains navigateurs ne l'affichent pas, et le widget ne voit pas ce
que contient une iframe d'un autre site (il ne peut pas savoir si du texte n'est pas enregistré) : la vraie sécurité
reste une sauvegarde de brouillon côté GFS.

**Étape Invités : une seule ligne et tri (10/11/2026).** Chaque invité tient toujours sur une seule ligne, quelle que
soit la largeur (les colonnes s'adaptent à la largeur du cadre ; nom et poste côte à côte, le poste se tronque et se lit
au survol ; sujets en rang, tous listés au survol ; en dessous d'environ 830 px la page défile horizontalement au lieu de
replier la ligne). Un clic sur l'en-tête **Personne**, **Réponse** ou **Appel du jour** trie : croissant (A → Z ; viendra
puis à confirmer puis excusé ; présent puis pas appelé puis absent), puis décroissant, puis retour à l'ordre d'origine
(invités ajoutés sur un point d'abord) ; à égalité, nom de A à Z. Le tri est retenu par utilisateur
(`Preferences_Widget.Inst_tri_invites`, auto-créée, valeur `clé:sens`).
