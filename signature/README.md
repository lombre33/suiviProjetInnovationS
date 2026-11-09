# Outil de signature des notifications (Vice-Président)

Widget Grist à part (URL dédiée : `…/suiviProjetInnovationS/signature/`), à ajouter dans le **document Grist du
Vice-Président**, dont il est le seul propriétaire. Il lui permet de signer les notifications en un clic : sa
signature (image) est posée **dans le PDF**, sous un repère de texte du modèle.

## Chaîne complète

1. publipostage+ (via gfs) range le PDF de chaque notification dans une colonne de pièces jointes du document principal.
2. Sur la page Instances du document principal, un bouton met les notifications d'une instance à disposition du VP
   (ce n'est pas automatique) : il remplit la table `Export_VP` ci-dessous.
3. Sync+ envoie `Export_VP` (PDF compris) vers le document du VP.
4. Le VP ouvre cet outil : instances à gauche, projets au milieu, PDF à droite ; un clic sur l'interrupteur signe.
5. Le PDF signé et l'état de signature repartent par Sync+ (sens retour, à venir côté Sync+) vers la colonne de départ.

L'outil ne connaît ni gfs ni Sync+ : il lit et écrit les colonnes d'une table de son document.

## Colonnes de la table `Export_VP`

Le widget fait associer ses colonnes par Grist, les noms sont donc libres ; ceux-ci sont ceux convenus avec le fil
de la page Instances.

| Colonne | Type | Sens | Obligatoire |
|---|---|---|---|
| `Instance` | Texte | reçue | oui |
| `Date_instance` | Date | reçue | non (sert au tri et à l'affichage) |
| `Acronyme` | Texte | reçue | oui |
| `Porteur`, `Labo_porteur` | Texte | reçues | non |
| `Montant` | Numérique | reçue | non |
| `PDF_notification` | Pièces jointes | reçue : le PDF à signer | oui |
| `Signee` | Booléen | **à renvoyer** | oui |
| `Signee_le` | Date et heure | **à renvoyer** | non |
| `PDF_signe` | Pièces jointes | **à renvoyer** : le PDF signé | oui |

Le PDF d'origine n'est jamais modifié : on signe toujours à partir de `PDF_notification`, et le résultat est un
nouveau fichier dans `PDF_signe`. Retirer une signature vide `PDF_signe` et remet `Signee` à faux.

## Mise en route dans le document du VP (une fois)

1. Ajouter une page avec un widget **personnalisé**, URL `https://lombre33.github.io/suiviProjetInnovationS/signature/`,
   niveau d'accès **Accès complet au document**, table `Export_VP`, puis associer les colonnes.
2. Dans le widget, ouvrir **Ma signature** : le bouton **Sécuriser maintenant** crée la table `Signature_VP` et la
   règle d'accès qui la réserve au propriétaire. Grist recharge alors le document (normal). **Tant que cette étape
   n'est pas faite, l'outil refuse d'importer ou de lire l'image.**
3. Toujours dans **Ma signature** : importer l'image (PNG ou JPEG, 2 Mo au plus, fond transparent de préférence) et
   vérifier le **repère de texte** (par défaut « Le Vice-Président, »).
4. Dans les règles d'accès du document, décocher « Permettre aux éditeurs de modifier la structure » (l'outil le
   rappelle tant que ce n'est pas fait).

## Exigence sur le modèle de notification

La signature est posée **juste sous** la dernière occurrence du repère dans le PDF (lue avec pdf.js, quelle que
soit la mise en page, même si le texte est coupé en plusieurs morceaux, avec d'autres accents ou une autre casse).
Il faut donc que le modèle garde de la place sous ce texte (environ 100 pt : la signature, 64 pt au plus, et la ligne de date). Repère introuvable ou pas de
place en dessous : l'outil **refuse de signer** et le dit, il ne devine jamais une position.

## Ce qui protège l'image de la signature

- Stockée en pièce jointe d'une table `Signature_VP` avec la règle `user.Access != OWNER` → `-CRUD`, posée **avant**
  toutes les autres règles. Grist ne sert une pièce jointe qu'à qui peut lire une cellule qui la contient : la règle
  protège donc aussi le fichier (et la route de téléchargement REST).
- Chaque accès à l'image **relit l'état réel** de la protection (table et règle en place, utilisateur propriétaire)
  et s'arrête sinon. Les jetons d'accès sont demandés au rôle réel de l'utilisateur, jamais stockés ni affichés.
- Remplacer ou supprimer la signature **purge** l'ancien fichier du document (pièces jointes inutilisées retirées).
- La page tourne sous une politique de sécurité stricte (`index.html`) : scripts du dossier seulement, pas de script
  ni de style en ligne, pas d'`eval`, aucun cadre ; les bibliothèques PDF sont embarquées (`vendor/`, empreintes
  contrôlées par un test) et aucune requête ne part ailleurs que vers le document Grist. Les données du document
  n'entrent jamais dans la page autrement que comme texte.

**Limite à connaître** : le PDF signé contient, par construction, la signature **visible** (c'est son but) ; il
repart vers le document principal par Sync+, et toute personne qui lit cette colonne peut en copier l'apparence.
Seul le fichier image d'origine reste réservé au propriétaire. La ligne « Signé électroniquement le … » posée sous
la signature date l'opération mais n'est pas une signature électronique qualifiée.

## Maintenance

- Tests : `node tests/run-headless.js` (suite `Signature — …` : PDF réels rendus pixel par pixel, faux document
  Grist, règles d'accès, CSP). Pas d'étape de build.
- Mise à jour des bibliothèques : voir `vendor/README.md`.
- Hypothèse non vérifiée sur un vrai document Grist (le conteneur de développement n'y accède pas) : le worker de
  pdf.js dans l'iframe du widget, et la pose de la règle d'accès par `_grist_ACLRules` (même méthode que Sync+).
