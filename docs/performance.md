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

## Pistes restantes (non faites)

- `content-visibility: auto` sur les cartes (`.project-card`, `.admin-card`, `.install-card`) : mesuré,
  la mise en page des pages Administratif / Installation passe de ~50-70 ms à ~8 ms. Non retenu pour
  l'instant : risque visuel (le contenu est rogné à la boîte de la carte, hauteurs estimées au
  défilement) à vérifier dans le vrai Grist avant de l'activer.
- `loadAllTables()` demande encore `Etablissement` (au singulier, table inexistante dans le document) :
  un appel en erreur, en parallèle donc sans coût de latence.
- Après l'enregistrement d'un projet, les 10 tables sont relues. Seules `Projets` et `Notifications`
  changent à coup sûr (formules Grist) ; à restreindre seulement si la relecture complète se sent.
- Si le nombre de projets dépasse largement le millier : virtualiser les listes de cartes.
