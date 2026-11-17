# Performances du widget — audit du 10/11/2026

Constat d'Antoine : le chargement du widget et l'affichage des projets étaient longs. L'audit a porté sur
**tout** le widget (démarrage, Kanban, Administratif, Installation, To Do, Instances, modales), pas
seulement l'onglet Projets.

Pas d'accès à un vrai Grist depuis l'environnement de développement : tout a été mesuré sur le mock
(`tests/mock-grist.js`) avec un jeu de données à l'échelle réelle (300 projets de ~230 colonnes,
800 personnes, 700 postes…) et un temps de réponse artificiel de 80 ms par appel Grist plus 1 ms par
millier de cellules lues. Les chiffres ci-dessous sont donc des **ordres de grandeur** ; le nombre
d'appels, lui, est exact. Dans le vrai Grist, chaque lecture de `Projets` (230 colonnes, calculées
côté serveur) coûte probablement bien plus que dans le mock : supprimer des lectures y rapporte plus.

## Causes trouvées

| Cause | Avant | Après |
|---|---|---|
| Appels Grist au démarrage, **enchaînés les uns après les autres** | 29 appels, ~25 allers-retours en série | 13 appels, tous lancés en parallèle (1 aller-retour) |
| `Projets` lue en entier | 3 fois (vérif. des colonnes Administratif, vérif. de `Statut_installation_fonds`, chargement) | 1 fois |
| `Preferences_Widget` lue en entier | 9 fois (une ou deux par page) | 1 fois |
| `listTables` | 5 fois (une par page, pour savoir si la table existe) | 0 |
| Cellules lues au démarrage | ~227 000 | ~83 000 |
| Les 5 pages étaient rendues au démarrage et à **chaque enregistrement de projet**, une seule est visible | 5 rendus | 1 rendu (les autres à l'ouverture ou en temps mort) |
| Recherches d'une ligne par id en parcourant la table (`rows.find(...)`) à chaque étiquette de carte | O(projets × lignes) | O(1) via `CoreUtils.findById` |
| Étape de chaque projet recalculée une fois par colonne / par volet | 5 à 8 fois | 1 fois |
| Page Instances : vérification du schéma table par table, en série | 21 appels, 1,07 s | 9 appels, 0,10 s |
| Frappe dans une recherche : une écriture Grist **par lettre** | 6 écritures pour « innovx » | 1 écriture, 600 ms après la dernière lettre |
| Modale projet : `_grist_Attachments` lue deux fois par ouverture (Notification + Convention) | 2 lectures | 1 lecture |
| Script de l'API Grist bloquant l'affichage de la page | bloquant | `defer` |
| Changement d'onglet Notifications / Conventions : tout reconstruit | ~100 ms | bascule d'affichage seule |

Mesures (mock, 80 ms par appel, médiane de 5 lancements) :

- premières cartes du Kanban : **2,05 s → 0,30 s** ;
- navigation utilisable : **2,08 s → 0,37 s** ;
- blocage du fil principal au démarrage : 59 ms → 0 ;
- rendu JS seul : Kanban 21 → 6 ms, Administratif 60 → 38 ms, Installation 24 → 19 ms, To Do 8 → 4 ms ;
- première ouverture de la page Instances : **1,07 s → 0,10 s**.

Ce qui n'a pas bougé : les changements de page restent à ~100 ms pour Administratif et Installation. Ce
temps est de la mise en page du navigateur (12 000 nœuds DOM pour Administratif), pas du JavaScript.

## Comment le démarrage fonctionne maintenant (`js/app.js`)

1. `CoreGrist.ready()`.
2. **En parallèle** : les 10 tables (`loadAllTables`), le schéma + les descriptions de colonnes
   (`loadColumnDescriptions`, mêmes métadonnées `_grist_Tables*`), et `Preferences_Widget` (lecture
   partagée).
3. `ensureAdministratifColumns()` : n'appelle plus Grist, il lit le schéma de l'étape 2. Seulement au
   **premier lancement** (colonnes manquantes) : les colonnes sont créées puis tables et descriptions
   sont relues.
4. Chargeurs de préférences des 5 pages, l'un après l'autre mais **sans aucun appel** en régime normal
   (table et colonnes déjà connues, lecture partagée).
5. Rendu de la page affichée seulement ; les autres sont « à refaire » (`staleViews`) et rendues quand
   la vue devient visible (`showView` ou apparition de la vue, par exemple le retour de Rédaction) ou
   en temps mort (`requestIdleCallback`).

## Règles pour les prochains développements

- **Jamais de `fetchTable` complet pour savoir si une colonne ou une table existe** : utiliser
  `CoreGrist.ensureTable` / `ensureColumns` (ils s'appuient sur le schéma connu, `knownColumns`).
- Une page qui lit `Preferences_Widget` au démarrage : `CoreGrist.getTable(PREFS_TABLE, { shared: true })`
  (lecture seule), et `CoreGrist.invalidateTable(PREFS_TABLE)` après avoir ajouté la ligne.
- Chercher une ligne par id : `CoreUtils.findById(rows, id)` ; par une autre clé :
  `CoreUtils.indexBy(rows, 'nom-de-l-index', ligne => cle)`. Jamais `rows.find(...)` dans une boucle
  sur les projets.
- Nouvelle page : l'ajouter à `VIEW_RENDERERS` dans `js/app.js` (rendue à l'ouverture, pas au démarrage).
- Champ de recherche qui enregistre une préférence : `CoreUtils.debounce` (voir `saveUserPreferencesSoon`).
- Ne pas faire écrire dans Grist à chaque frappe ou à chaque survol.

## Mesurer

```
node tests/perf/bench.js                 # 80 ms par appel Grist, 3 lancements
node tests/perf/bench.js --rtt=150 --runs=5 --label=apres --out=/tmp/apres.json
```

Charge le vrai `index.html` dans Chromium avec le mock Grist, un jeu de données déterministe
(`tests/perf/synthetic-data.js`) et un premier lancement d'« échauffement » qui crée tables, colonnes et
préférences (on mesure l'état normal d'un utilisateur qui revient). Il affiche le nombre d'appels Grist,
le temps jusqu'aux premières cartes, le blocage du fil principal et le coût de chaque interaction.
Non lancé par la CI. Les tests de non-régression des correctifs sont dans `tests/suite-performance.js`.

## Deuxième vague — 17/11/2026 (ouverture et navigation)

Constat d'Antoine : l'ouverture reste un peu longue et la navigation entre pages a de petits délais. Même méthode
(mock Grist, 80 ms par appel, 300 projets × 230 colonnes) ; le banc a été corrigé : il rouvrait le widget **sur la page
Instances** (la dernière page ouverte est retrouvée depuis le 12/11, l'échauffement finissait sur Instances), donc il ne
chronométrait plus le Kanban. Option `--start=` (défaut `view-projects`).

| Cause | Avant | Après |
|---|---|---|
| `@import` de Google Fonts dans `style.css` : s'enchaîne après le téléchargement de `style.css`, **bloque le rendu et l'exécution des scripts** tant que Google n'a pas répondu | premières cartes 607 ms (Google Fonts à 300 ms ; le banc ne simulait pas cette latence avant) | 335 ms ; plus rien de bloquant : `<link>` en `media="print"` basculé au chargement + préconnexion, `font-display: swap` conservé |
| Fondu d'ouverture de chaque page : `.view { animation: fadeIn .2s }` avec glissement de 6 px | ~200 ms **perçus** en plus à chaque changement de page (page complète visible après 330 ms) | 90 ms, opacité seule, rien si le système demande de réduire les animations (page visible après ~125-140 ms) |
| Mise en page de toutes les cartes à chaque affichage d'une page (display:none → block repasse tout le style + la mise en page) | Administratif 126 ms, Installation 136 ms, onglet Conventions 109 ms | Administratif 28 ms, Installation 38 ms, onglet Conventions 44 ms : `content-visibility:auto` sur `.admin-card` (hors To Do), `.install-card`, `.project-card` |
| Kanban : frappe dans la recherche, déplier une colonne, retour sur Projets | 38 à 61 ms | 26 à 28 ms ; retour sur Projets 51 → 26 ms |
| Page Instances, 1re ouverture : la composition des instances n'était lue qu'**après** les 9 autres tables (2 à 3 allers-retours en série) | 178 ms | 98 ms (1 aller-retour) |
| Table `Etablissement` (singulier, inexistante) demandée à chaque lecture générale | 1 requête en erreur par lecture | supprimée (12 appels au démarrage au lieu de 13) |
| Rien à l'écran pendant la lecture des tables | page vide | pastille « Chargement des données… » en bas à gauche, ne prend aucune place, n'apparaît qu'après 0,4 s |

Chiffres du mock, médiane de 5 lancements ; le rendu JS direct d'Administratif varie de 45 à 78 ms d'un lancement à
l'autre sur la machine de test, avec ou sans ces correctifs (pas de lien).

### `content-visibility:auto` : ce qui a été vérifié, ce qu'il faut garder en tête

- Capture d'écran à quatre positions de défilement, avant/après, pour Kanban (1400 et 820 px), Administratif
  (Notifications / Conventions, lignes / cartes), Installation, To Do : Administratif et Kanban à 820 px sont
  **identiques** à l'œil (écart maximal de 5/255 sur quelques centaines de pixels), To Do au pixel près. Sur
  Installation et sur le Kanban à 1400 px, seul le rendu des bords de caractères change (la peinture d'une carte
  s'aligne sur le pixel) : rien ne bouge, vérifié en agrandissant.
- `contain-intrinsic-size` donne la taille du **contenu** : padding et bordure s'y ajoutent. Les hauteurs de repli
  sont les hauteurs mesurées moins padding et bordure ; sinon un saut de défilement apparaît. Elles ne servent qu'avant
  qu'une carte ait été vue (`auto` retient ensuite la vraie hauteur) ; elles sont justes pour les cartes de hauteur
  fixe (Notifications), approximatives pour les autres (Conventions, Installation, Kanban : la hauteur dépend de la
  largeur du widget). Un saut de la barre de défilement est donc possible en la tirant d'un coup très loin.
- Le rognage du contenu (paint containment) coupe tout ce qui dépasse de la carte. **Règle : un popover, une bulle
  ou un menu ouvert depuis une carte se pose dans `<body>`** (c'est le cas : `.admin-popover`, `HelpTooltip`, modales),
  jamais dans la carte (`position:fixed` y serait aussi relatif à la carte). Un test le garde pour le popover de date.
- Les cartes de la page To Do (`.todo-card`) en sont exclues (hauteurs non mesurées, peu nombreuses).

### Mesurer la deuxième vague

```
node tests/perf/bench.js --fonts-ms=300        # latence simulée de Google Fonts (0 = requête refusée tout de suite)
node tests/perf/bench.js --profile             # ventile chaque interaction : script / calcul des styles / mise en page
```

Chaque interaction donne `ms` (jusqu'à 2 images après l'action) et `settledMs` (jusqu'à la fin des animations en cours :
ce que l'œil perçoit). Tests de non-régression : `tests/suite-performance.js` (sections « Ouverture » et « Navigation »).

## Troisième vague — 17/11/2026 (le « Chargement des données… » de 2 à 3 s dans le vrai Grist)

Le banc ne reproduit pas les 2 à 3 s d'Antoine : il fallait d'abord **savoir où elles passent**, puis afficher le Kanban sans
attendre le reste.

### Panneau « Diagnostic de chargement » (`js/core/perf-trace.js`)

- Ouverture : **Alt+Maj+D** (cliquer d'abord dans le widget) ou **double-clic sur la pastille « S »** du bandeau ; le même rapport est écrit
  dans la console du navigateur à la fin du démarrage. Bouton **Copier** : le rapport se colle dans la conversation.
- Contenu : jalons (HTML reçu, scripts exécutés, `grist.ready`, Projets/Annuaire/préférences lus, Kanban affiché, tout lu,
  première page affichée), durée de **chaque lecture Grist** (départ, durée, nombre de cellules), cumul comparé à la durée réelle
  (cumul ≈ durée réelle : le serveur traite les lectures l'une après l'autre ; cumul ≫ durée réelle : en parallèle), téléchargement des
  fichiers du widget (Resource Timing, servis par le cache ou non). **Aucune donnée de projet** : noms de tables, durées, tailles.
- Nouveau jalon à ajouter = `PerfTrace.mark('…')` ; nouvelle lecture Grist hors `CoreGrist` = `PerfTrace.track(label, () => …)`.

### Démarrage en deux temps (`js/app.js`, `CoreGrist.loadAllTablesStaged`)

1. **Temps 1** : `Projets`, `Annuaire` et les préférences de l'utilisateur (lues en tête) → le Kanban s'affiche. Les 6 autres tables et le
   schéma sont déjà demandés dans la même vague.
2. **Temps 2** : tout le reste arrive ; les autres pages se construisent comme avant (celles restées « à refaire » le sont à l'ouverture).
- Tant que le temps 2 n'est pas fini (`dataComplete` faux) : `renderView` ne construit que le Kanban (une autre page se ferait avec des tables
  absentes) ; les clics sur la navigation, les cartes, « Nouveau projet » et `[data-open-project]` sont **mis de côté puis rejoués**
  (garde en phase de capture) ; les filtres et le repli des colonnes restent utilisables. Message : « Chargement des autres tables… ».
- Si la page retrouvée au rechargement n'est pas le Kanban, rien n'est verrouillé : on attend tout, comme avant.
- Échec à n'importe quel moment : `finally` déverrouille et retire la garde.
- Colonnes **apprises des lectures** (`seenColumns`, privé à `grist-api.js`) : `ensureTable` / `ensureColumns` n'ont plus besoin du schéma
  des métadonnées pour savoir qu'une table lue existe et quelles colonnes elle a, donc plus d'appel avant le premier affichage.
  **`knownColumns` / `knownTableIds` ne les voient pas** : ils restent `null` / vides quand les métadonnées sont illisibles (sinon on
  créerait des colonnes déjà présentes). Une lecture en échec efface ce qu'on savait de la table.

### Mesures du mock (`node tests/perf/bench.js --serial`)

`--serial` simule un serveur qui traite les lectures l'une après l'autre (100 ms par appel) :

| | avant | après |
|---|---|---|
| premières cartes du Kanban | 1500 ms | **551 ms** |
| navigation utilisable | 1575 ms | 1589 ms (clics mis de côté jusque-là) |

Avec un serveur qui traite tout **en parallèle** (le mock par défaut), le gain est nul (388 → 403 ms) : c'est le rapport du panneau de
diagnostic qui dira dans quel cas on est dans le vrai Grist.

### Premier rapport réel (17/11/2026, 19:33, Firefox 160 sous Windows, chargement à froid : 1 fichier sur 35 servi par le cache, 281 ko transférés)

| ms depuis le début du chargement | étape |
|---|---|
| 260 | HTML reçu |
| 726 | tous les scripts du widget exécutés (`app.js`) |
| 1118 | **fin du téléchargement de `grist-plugin-api.js`** (266 → 1118 = 852 ms, depuis `docs.getgrist.com`) |
| 1146 | DOMContentLoaded, `grist.ready` : l'initialisation démarre |
| 1349 / 1353 | Projets, Annuaire et préférences lus (147 ms) ; **Kanban affiché** |
| 1581 | toutes les tables et le schéma lus ; première page complète |

- Les 12 lectures Grist partent ensemble et finissent en **435 ms** (cumul 2784 ms : le serveur les traite en parallèle). Les plus lentes :
  `Notifications` 434 ms, `Structures` 256, `Postes2` 215, `Annuaire` 202. La lecture de `Projets` (14 062 cellules) ne dure que 147 ms.
- **Les lectures ne sont pas le problème** : 1146 des 1353 ms avant le Kanban passent *avant* la première lecture, à attendre le script de
  l'API Grist (`<script defer>` : DOMContentLoaded, donc `initializeApp`, l'attend). Les 28 fichiers du widget sont prêts à 726 ms.
- Conséquences : un cache persistant des données gagnerait au mieux ~200 ms (le temps de lire Projets) et n'est pas recommandé ;
  réduire les colonnes de `Projets` n'aurait presque aucun effet ; la seule piste qui agit sur le chemin critique est le téléchargement du
  script Grist (héberger une copie avec le widget : le source compilé est dans `tests/vendor/`, voir son README ; risque : version de
  l'API figée, non testable sans vrai Grist). À décider après un 2e rapport pris sur une ouverture **à chaud** (F5 ou retour sur le widget,
  pas Ctrl+Maj+R) : si le script est alors servi par le cache, le gain disparaît.
- Hors chemin critique : les fichiers du widget finissent à 726 ms ; `page-redaction.js` (454 ms), `pdf-viewer.js`, `project-modal.js`
  pourraient se charger après l'affichage du Kanban, mais cela ne raccourcit rien tant que le script Grist arrive plus tard.

## Pistes restantes (non faites)

- **Cache persistant des données entre deux ouvertures** (afficher tout de suite le dernier état connu, puis rafraîchir) :
  le plus gros gain d'ouverture possible, mais il laisserait des données de projets dans le navigateur (localStorage /
  IndexedDB) et un autre utilisateur du même poste verrait brièvement celles du précédent : décision d'Antoine.
- Après l'enregistrement d'un projet, les 9 tables sont relues. Seules `Projets` et `Notifications` changent à coup sûr
  (formules Grist) ; à restreindre seulement si la relecture complète se sent.
- Animations de la modale projet (fondu de 0,15 s à l'ouverture, 0,22 s à chaque changement d'onglet, flou d'arrière-plan) :
  conservées, ce sont des choix de présentation ; ~0,2 s perçu à chaque ouverture / changement d'onglet.
- Si le nombre de projets dépasse largement le millier : virtualiser les listes de cartes.
