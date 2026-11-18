# Envoyer l'export financier dans Grist

Le script d'export envoie ses lignes **directement** dans un **formulaire Grist publié** : pas d'Excel, pas de
copier-coller, pas de clé API, seulement le lien du formulaire. Le formulaire reprend les **24 colonnes de l'export**
(feuille `Reporting` du classeur d'exemple), rien d'autre n'est demandé au script.

```
script d'export ──► envoi_grist.pousser(lignes) ──POST──► formulaire publié ──► table Import_Financements (ajout seul)
                                                                                         │ validation d'un clic
                                                                                         ▼
                                                                  formules de Lignes_OPE : dernier lot validé
```

**Statut : proposition, non validée en réel.** Le code est testé contre un faux Grist local
(`python -m unittest discover -s export-financier -v`). Il n'a jamais écrit dans un vrai document :
`grist.numerique.gouv.fr` n'est pas joignable depuis l'environnement de développement.

## Brancher le script

Le script a déjà ses lignes avant d'écrire l'Excel : une liste de dictionnaires dont les clés sont les en-têtes de
l'export (`"N° OPE"`, `"Consommé CP"`…). Il les passe à `pousser` :

```python
from envoi_grist import pousser
pousser(lignes)                     # lien lu dans la variable d'environnement GRIST_LIEN_FORMULAIRE_EXPORT
# avec pandas : pousser(df.to_dict("records"))   (cellules vides NaN/NaT acceptées)
```

- `pousser(lignes, dry_run=True)` prépare sans rien envoyer.
- `pousser(lignes, identifiant_lot="auto")` (CLI : `--avec-lot`) ajoute à chaque ligne une colonne `Lot` : la date et
  l'heure du lancement, la même pour toutes les lignes, pour que Grist reconnaisse un envoi. À utiliser dès que le
  widget a créé la table avec sa colonne `Lot` ; sans elle, un lot se déduit de la date d'arrivée.
- Depuis un classeur déjà produit (essais, reprise de l'historique) : `pousser_xlsx("fichier.xlsx")`, ou
  `python envoi_grist.py fichier.xlsx --dry-run`. Le classeur d'essai `exemple/financements_InnovationS_TEST.xlsx`
  (deux lignes fictives) sert à essayer.
- Le lien du formulaire donne le droit d'**ajouter** des lignes dans la table : à garder dans la variable
  d'environnement, pas dans le code ni dans le dépôt.

## Côté Grist : le widget prépare tout (proposition, non codée)

Rien n'est à créer à la main. Une fois, le bouton « Préparer Grist » du widget crée ce qui manque ; le relancer ne
casse rien et ne modifie ni ne convertit jamais une colonne existante (techniques de FormPlus : actions Grist
`AddTable`, `AddColumn`, `CreateViewSection`, partage du formulaire). Il crée :

- la table d'arrivée `Import_Financements` avec les 24 colonnes de l'export (identifiants exacts de `COLONNES`,
  sans accent) et `Lot` ; l'outil de reprise unique la crée déjà (avec `Cle_ligne` et `Exporte_le` en colonnes de
  données) et le widget ne complète que ce qui manque ; le modèle `exemple/Import_Financements_modele.csv` ne sert
  plus qu'à vérifier la liste ;
- ce que Grist calcule et que le script n'envoie jamais : `Cle_ligne` (formule appliquée aux nouveaux enregistrements,
  `$N_OPE + "|" + $Financeur + "|" + $Ligne_budgetaire`, **à confirmer sur le vrai export** ; la colonne de données
  créée par la reprise unique reçoit cette formule sans changer de type), `Exporte_le` (`NOW()` sur les nouveaux
  enregistrements), `Cle_OPE` et `Valide` ;
- la table `Import_Lots` (un lot = un envoi) pour l'historique et la validation ;
- les formules de `Lignes_OPE` qui lisent les envois **validés** (voir plus bas) ;
- une page avec le formulaire, **publié seulement après l'accord d'Antoine** : toute personne qui a le lien peut
  ajouter des lignes à la table d'arrivée.

La seule étape manuelle : copier le lien du formulaire (`https://…/forms/<clé>/<numéro>`) dans la variable
d'environnement du script. Pas de colonne Référence à double sens sur la table d'arrivée (Grist refuserait l'envoi
anonyme).

## Du journal vers `Lignes_OPE` (formules, voir le fil « Fusionner l'historique »)

Le formulaire publié ne peut **pas** modifier une ligne existante : il ne fait qu'ajouter au journal. Le montant d'une
ligne OPE vient donc de **formules Grist** sur `Lignes_OPE`, sans table de synthèse : elles lisent, avec
`lookupRecords`, les lignes du **dernier lot validé** de chaque clé (`max(..., key=lambda r: r.id)`). Un envoi ne
compte qu'une fois validé d'un clic. Colonnes visées : `Attribue_2022` à `Attribue_2026`, `Consomme_AE`,
`Date_maj_conso`, et une **nouvelle** colonne `Consomme_CP` : `totalCPConsomme` reste intacte et le Dashboard lit
`Consomme_CP` en priorité. Exemple de formule (non testée dans Grist) :
`SUM(r.Consomme_CP for r in Import_Financements.lookupRecords(Cle_OPE=$N_OPE, Valide=True))`. Une somme, parce qu'un
même N° OPE peut avoir plusieurs lignes (financeurs, lignes budgétaires) ; un filtre sur `r.Financeur` sépare
InnovationS des autres financeurs (IDEX…) selon ce qu'Antoine décidera de compter. Une ligne qui disparaît d'un envoi
reste comptée et signalée, jamais retirée toute seule.

**Règle `Valide`** : une ligne **sans `Lot`** vient de la reprise unique (import de fichier de Grist, sans formulaire) et
compte d'office ; une ligne avec `Lot` ne compte que si son lot est validé dans `Import_Lots`. Sans cette règle,
l'historique n'arriverait jamais sur `Lignes_OPE`. Comme `Cle_ligne` peut manquer sur ces lignes importées, les
formules recalculent la clé à partir de `N_OPE`, `Financeur` et `Ligne_budgetaire` quand elle est vide.

## Ce que fait chaque lancement

- Une ligne du journal par ligne de l'export. Relancer l'envoi ne crée aucun doublon utile : seule la dernière
  version validée de chaque clé compte.
- Une ligne sans N° OPE est ignorée (et comptée dans le message). Une valeur illisible arrête l'envoi, avec la
  colonne et la ligne en cause.
- Une colonne nouvelle dans l'export (par ex. `Attribué 2027`) n'est pas envoyée tant qu'elle n'est pas ajoutée à
  `COLONNES` dans `envoi_grist.py` et à la table Grist ; avec `pousser_xlsx`, le script le signale.
- En cas de panne passagère (réseau, 5xx), 3 essais ; sinon l'erreur est expliquée en français.
- Les lots partent par 100 lignes. Si un lot échoue en cours de route, les lots précédents restent dans le journal ;
  relancer l'envoi complet est sans danger.

## Limites connues

- Le formulaire publié n'accepte que l'ajout : le script ne peut ni relire ni corriger ce qu'il a envoyé.
  Le journal grossit à chaque lancement : la durée de conservation reste à décider avec Antoine.
- Le formulaire public peut être rempli par toute personne qui a le lien : ne pas le diffuser, et ne rien brancher de
  sensible sur le journal sans contrôle.
