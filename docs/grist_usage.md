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
| `Lignes_OPE` | ligne OPE d'un projet (lecture) |

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
| `Instance_Points` | `Seance` (→ `Suivi_Instance`), `Ordre`, `Titre`, `Nature` (Validation / Discussion / Information), `Duree_min`, `Projets` (RefList → `Projets`), `Invites` (RefList → `Instance_Invites`), `Presentateurs` (RefList → `Annuaire` : qui présente le point, indépendant des invités ; ajoutée à la table existante par `ensureColumns`), `Lien_type`, `Lien` |
| `Instance_Invites` | `Seance`, `Personne` (→ `Annuaire`), `Origine` (Liste permanente / Ajouté sur un point), `Ecrit_le`, `Passage_envoye_le`, `Passage_envoye_heure`, `Reponse` (À confirmer / Viendra / Excusé(e)), `Dispo_de`, `Dispo_a`, `Commentaire`, `Appel` (Présent(e) / Absent(e)) |
| `Instance_Relectures` | `Seance`, `Personne`, `Statut` (Modifs demandées / Validée ; pas de ligne = à relire), `Relu_le` |
| `Instance_Validations` | `Seance`, `Etape`, `Date`, `Par` (→ `Annuaire`) — une ligne par étape validée (les étapes « Mail d'invitation » et « Envoi du CR » se valident par leur date dans `Suivi_Instance`) |
| `Export_VP` | table plate lue par Sync+ vers l'outil de signature du VP (`signature/`). Écrites par le widget : `Seance`, `Projet`, `A_envoyer`, `Mis_a_dispo_le`, `Mis_a_dispo_par`. Formules : `Instance`, `Date_instance`, `Acronyme`, `Porteur`, `Labo_porteur`, `Montant`. `PDF_notification` (Attachments) : à alimenter côté Grist. Retour de Sync+ : `Signee`, `Signee_le`, `PDF_signe` |

Le bouton « Mettre à disposition du VP » n'est jamais automatique : il demande confirmation puis
écrit `Export_VP` ; il **ne modifie pas** `Notifications.notifications_Statut`, et le widget
n'ouvre jamais `PDF_signe`. Préférences par utilisateur dans `Preferences_Widget` :
`Inst_instance`, `Inst_seances` (JSON), `Inst_etape`, `Inst_vue`, `Inst_odj_vue` (`timing` par défaut
ou `type` : affichage de l'ordre du jour), `Inst_cadre` (JSON : `bandeau`, `cr`, `plein`, `hauteur` — voir
ci-dessous). Les deux dernières colonnes sont ajoutées à la table existante par `ensureColumns`.

**Composition des instances (10/11/2026).** Les invités par défaut d'une instance viennent de la table
« Composition instances » du document (en lecture seule, jamais modifiée par le widget). La table est retrouvée par son
nom (casse et ponctuation ignorées : `Composition_instances`, `COMPOSITION_INSTANCES`…) ; ses colonnes sont
retrouvées par leurs **valeurs** : une colonne qui désigne une instance (référence vers `Instances` ou nom de
l'instance) et une colonne qui désigne une personne (référence vers `Annuaire`, liste de références, nom ou e-mail),
le nom de la colonne départageant les cas ambigus. Une ligne par membre ; une liste de personnes ou d'instances sur
une même ligne est acceptée. Usage : (1) une **nouvelle séance** reprend la liste permanente + la composition (sans
doublon, origine « Liste permanente ») ; (2) à l'étape **Invités**, un bandeau propose d'ajouter les membres de la
composition qui ne sont pas invités à la séance ; (3) le **paramétrage** de l'instance affiche la table lue, les
colonnes reconnues et les membres (ou la raison pour laquelle rien n'est reconnu). Aucun filtre (membre actif,
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

**Ordre du jour (10/11/2026).** Vue *Timing* : ordre de passage, une teinte par heure de la séance
(4 teintes qui reviennent). Vue *Par type* : tous les points (jamais un filtre), regroupés pour
validation, puis discussion, puis information ; l'ordre de passage n'est pas modifiable dans cette vue.
Le titre d'un point s'affiche toujours en entier (zone de texte qui grandit). Les noms de
personnes (présentateurs, invités) passent en initiales quand la ligne est étroite (< 1560 px), puis
les infos se replient sous le titre ; le nom complet reste dans l'infobulle.

**Instances présentées (10/11/2026).** Seules les instances dont le nom (colonne `Instances` de la
table `Instances`) est « CTO Innovation » ou « Comité innovation » (casse, accents et ponctuation
ignorés, mots entiers) apparaissent dans le menu et dans la page ; leurs séances seules sont
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

## Lignes_OPE

Table renommée côté Grist par Antoine (confirmé le 22/10/2026) ; s'appelait
`EcritureComptables` jusque-là, d'où le nom encore utilisé dans les entrées de
`VERSION.md` antérieures à cette date.

Lecture seule : `N_OPE` (Text), étiquette de la ligne OPE dans la modale projet.
`totalCPConsomme`, `installe_chez` et la formule `N_OPE_LibelleOperation` ne sont pas
lus par le widget — c'est la formule `Projets.Ligne_OPE_installe_chez` qui fournit la
structure d'installation.

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

### Divergences sans effet

Trois clés lues par le code n'existent dans aucune table ; elles sont toujours suivies
d'un repli valide et n'ont pas d'impact visible :

- `Projets.Progression` — l'alias `Progression` vaut toujours `0` ;
- `Etablissements.acronyme` (minuscule) — `Acronyme` prend le relais ;
- `Suivi_Instance.name` (minuscule) — la formule `Nom` prend le relais.

Enfin, le nom de table `Etablissement` au singulier dans `CoreGrist.TABLE_NAMES` ne
correspond à rien : son chargement échoue et est ignoré.
