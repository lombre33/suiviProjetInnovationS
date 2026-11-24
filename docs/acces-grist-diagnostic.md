# Règles d'accès Grist : pourquoi un élément ne s'affiche pas (24/11/2026)

Quand un administrateur pose des règles d'accès dans Grist (« Règles d'accès » du document), le widget ne reçoit plus
que ce que Grist autorise au compte connecté. **Grist ne signale presque rien** : une table refusée lève une erreur, mais une
ligne cachée par une règle « par ligne » ou une colonne cachée par une règle « par colonne » disparaît simplement des
données. Le résultat à l'écran : une liste vide, un porteur affiché « 12 », un projet absent du Kanban, un consommé trop bas.

`js/core/access-diagnostic.js` (`window.CoreAccess`) rend ces situations lisibles, partout dans le widget, **sans aucun appel
Grist de plus au démarrage** (règle de `docs/performance.md`).

## Ce que voit l'utilisateur

| Où | Quoi |
| --- | --- |
| En-tête, à droite du nom du widget | Pastille ⚠ + nombre de points à vérifier. **Masquée** tant qu'il n'y a aucun problème. Infobulle : la liste, clic : le détail. |
| Fin de la barre de filtres de chaque page (Kanban, Administratif, Installation, To Do, Dashboard, Annuaire) | Même pastille, limitée aux problèmes qui touchent cette page. Aucune ligne ajoutée. |
| Toast d'erreur après une écriture ratée | « Échec de l'écriture : Modification refusée par une règle d'accès de Grist sur la table Notifications. Cliquez pour le détail. » Infobulle = explication complète, clic = ouvre le panneau. |
| Bandeau d'erreur d'une modale (projet, OPE, personne, poste) | Titre + détail repliable « Pourquoi, et que vérifier » (replié : aucune place prise). |
| Champ référence, carte, étiquette | « Personne (id 12) non lisible » au lieu du numéro brut, avec la raison probable en infobulle. |
| Alt+Maj+D, onglet **Accès** | Le rapport complet (copiable) : tables lues (OK / REFUSÉE / ABSENTE), colonnes manquantes, références pendantes, contrôles par page, identité, journal des refus. Bouton **Tester les accès**. |

## Ce qui est expliqué

Pour chaque cas : **Où** (table, ligne, colonnes écrites), **Pourquoi**, **Conséquence dans le widget** (les pages qui lisent
la table, d'après `js/core/access-expectations.js`), **À vérifier** (où regarder dans Grist, « Voir en tant que »), **Message de Grist** tel quel.

- **Écriture ou lecture refusée par une règle** : `Blocked by table|column read|update|create|delete|structure access rules`
  (texte réel de grist-core), `Blocked by access rules: 'X' actions need full access`, `Only owners…`, `No write access, document is read-only`,
  `document needs reload`, `Access not granted. Current access level …` (niveau d'accès du widget), pièces jointes, colonne formule, table verrouillée.
- **Table absente**, **colonne absente** (renommée, supprimée, ou cachée : le diagnostic distingue « connue du schéma mais non envoyée » de « introuvable »).
- **Table lue mais vide** (Projets, Annuaire) : vide, ou toutes les lignes cachées.
- **Référence non résolue** (porteur, programme, ligne OPE, poste, structure, établissement, instance) : ligne cachée par une règle par ligne, ou supprimée.
- **Contrôles propres à une page** : Kanban (projets qui ne tombent dans aucune colonne : `Statut_Macro` absent, vide ou inconnu), Dashboard (lignes OPE ou
  programmes cachés : consommé sous-estimé, projets « Sans programme »), Installation (ligne OPE ou structure illisible : pas de fausse alerte « OPE à compléter »),
  Annuaire (poste illisible : pas de fausse alerte « personne sans poste »).
- **Identité** (page To Do) : adresse introuvable (ligne-sonde, écriture dans `Preferences_Widget` refusée, formule `user.Email`), adresse sans fiche
  Annuaire (colonne `Email` cachée ? ligne cachée par une règle ?). L'adresse est **masquée** dans le rapport (`al***@domaine.fr`).

## Comment c'est fait (sans appel de plus)

1. `CoreGrist.ready()` appelle `CoreAccess.instrument(docApi)` : `fetchTable` et `applyUserActions` sont enveloppés **en place**. L'enveloppe
   transmet l'appel et **rend la promesse d'origine** (même objet, aucun tour de plus : l'ordre des continuations de l'appelant ne change pas, certains
   tests en dépendent). L'enregistrement se fait sur une branche à part ; une erreur est annotée d'une propriété **non énumérable** `gristAccess`
   `{op, table, actions}` (jamais dans un JSON ni un message).
2. `fetchRaw` (CoreGrist) note, pour chaque table lue, le nombre de lignes et **les colonnes reçues** : comparées aux attentes de
   `js/core/access-expectations.js` (`CoreAccess.expect(table, colonnes, {label, effect})`), elles disent quelle colonne manque et quel écran en souffre.
3. Les références pendantes se calculent à la demande (affichage de la pastille, ouverture du panneau) à partir des tables déjà en mémoire et des types
   de colonnes déjà connus (`CoreGrist.columnTypes`).
4. **Tester les accès** (bouton du panneau, jamais automatique) relit chaque table du widget, `Preferences_Widget` et les métadonnées, puis lit
   `_grist_ACLResources` / `_grist_ACLRules` (réservé aux propriétaires : sinon le dit). Les règles lues complètent « À vérifier » avec la règle probable.

## Pour développer

- Une écriture qui peut échouer : `CoreUtils.toastFailure(err, 'Échec de …', { what: 'ce que faisait l\'utilisateur', table })` (toast) ou
  `CoreUtils.showErrorBox(elementErreur, err, 'Enregistrement impossible', { what, table })` (modale). Jamais `err.message` brut.
- Un texte qui doit contenir la raison d'une erreur : `CoreUtils.failureReason(err, { op: 'read', table })`.
- Une erreur du widget qui en enveloppe une de Grist : `Object.assign(new Error('…'), { cause: err })` (le classement suit `cause`).
- Une référence qu'une page ne sait pas résoudre : `CoreAccess.unresolvedRef(table, id, 'Personne')` → `{label, title}` (jamais le numéro brut, jamais « Aucune … »
  qui ferait croire à un oubli de saisie). Une valeur texte (liste de choix) reste telle quelle : `unresolvedRef` renvoie `null`.
- Un nouvel écran qui lit une colonne dont l'absence casse l'affichage : la déclarer dans `js/core/access-expectations.js` (le test
  « attentes déclarées » vérifie que chaque colonne citée figure dans le code de l'écran).
- Un contrôle propre à un écran : `CoreAccess.addCheck('Kanban', () => [{ headline, effect: [], detail, level, table }])` (calculé à la demande, sans appel Grist).
- Un test qui simule un refus : faire échouer `docApi.fetchTable` / `applyUserActions` avec le **message réel de Grist** (voir `tests/suite-access-diagnostic.js`).

## Bon à savoir côté Grist

- La modale projet réécrit **toutes** les colonnes à l'enregistrement : une seule colonne en lecture seule pour un rôle suffit à refuser tout l'enregistrement
  (le message le dit quand plus de 12 colonnes sont écrites). Si un rôle doit modifier un projet, ne lui retirer le droit d'écriture d'aucune colonne de `Projets`.
- Le widget crée lui-même ses tables et colonnes (préférences, instances, colonnes OPE 2 à 4…) : cela demande « Modifier la structure ». Un propriétaire qui ouvre
  le widget une fois crée ce qui manque.
- « Voir en tant que » (menu Partager de Grist) est la meilleure vérification : le widget affiche alors exactement ce que Grist autorise à cette adresse, et la pastille ⚠ se met à jour.
