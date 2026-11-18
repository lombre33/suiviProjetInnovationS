# Envoyer l'export financier dans Grist

Le script d'export envoie ses lignes **directement** dans un **formulaire Grist publié** : pas d'Excel, pas de
copier-coller, pas de clé API, seulement le lien du formulaire. Le formulaire reprend les **24 colonnes de l'export**
(feuille `Reporting` du classeur d'exemple), rien d'autre n'est demandé au script.

```
script d'export ──► envoi_grist.pousser(lignes) ──POST──► formulaire publié ──► table Import_Financements (ajout seul)
                                                                                         │ formules Grist
                                                                                         ▼
                                                                  synthèse : dernière version de chaque ligne
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
- Depuis un classeur déjà produit (essais, reprise de l'historique) : `pousser_xlsx("fichier.xlsx")`, ou
  `python envoi_grist.py fichier.xlsx --dry-run`. Le classeur d'essai `exemple/financements_InnovationS_TEST.xlsx`
  (deux lignes fictives) sert à essayer.
- Le lien du formulaire donne le droit d'**ajouter** des lignes dans la table : à garder dans la variable
  d'environnement, pas dans le code ni dans le dépôt.

## Côté Grist (à faire une fois)

1. **Créer la table** `Import_Financements` en important `exemple/Import_Financements_modele.csv` (Ajouter une
   nouvelle table, Importer depuis un fichier) : les en-têtes sont les identifiants exacts attendus, sans accent, et
   Grist devine les types (Date pour `Date_debut`/`Date_fin`, Numérique pour les montants). Supprimer ensuite les
   2 lignes d'exemple. Le CSV se régénère avec `python envoi_grist.py <classeur> --modele-csv sortie.csv`.
2. **Deux colonnes calculées par Grist**, que le script n'envoie jamais :
   - `Cle_ligne` : colonne formule `$N_OPE + "|" + $Financeur + "|" + $Ligne_budgetaire` (clé d'une ligne d'un envoi
     à l'autre, **à confirmer sur le vrai export**) ;
   - `Exporte_le` : colonne de données, type Date et heure, formule `NOW()` appliquée aux **nouveaux enregistrements**
     seulement. Si elle restait vide sur un envoi anonyme, rien ne casse : l'ordre des lignes (`id`) fait foi.
3. Ajouter un widget **Formulaire** sur cette table, y mettre les 24 colonnes de l'export (pas les deux colonnes
   calculées), **publier**, copier le lien (`https://…/forms/<clé>/<numéro>`).
4. Pas de colonne Référence à double sens sur cette table (Grist refuserait l'envoi anonyme).
5. Table de synthèse de `Import_Financements` groupée par `Cle_ligne`, puis, dans la synthèse :
   `Derniere` = `max($group, key=lambda r: r.id)`, et chaque colonne utile en `=$Derniere.<colonne>`
   (remplacer les `SUM($group.…)` créées d'office pour les colonnes numériques ; ne pas oublier `Financeur`,
   `N_OPE`, `Exporte_le`).

## Du journal vers `Lignes_OPE` (formules, voir le fil « Fusionner l'historique »)

Le formulaire publié ne peut **pas** modifier une ligne existante : il ne fait qu'ajouter au journal. Le montant d'une
ligne OPE vient donc de **formules Grist** sur `Lignes_OPE`, qui lisent la synthèse par N° OPE : rien d'autre à lancer
que le script. Colonnes visées : `Attribue_2022` à `Attribue_2026`, `Consomme_AE`, `Date_maj_conso` et
`totalCPConsomme` (Consommé CP, lu par le Dashboard, qui devient une formule). Par exemple, sur `Lignes_OPE`
(nom de la synthèse à adapter, formule non testée dans Grist) :
`SUM(r.Consomme_CP for r in Import_Financements_summary_Cle_ligne.lookupRecords(N_OPE=$N_OPE)) if $N_OPE else None`.
Une somme, parce qu'un même N° OPE peut avoir plusieurs lignes (financeurs, lignes budgétaires). La synthèse porte
`Financeur` : un filtre `if r.Financeur == "InnovationS"` sépare ce financeur des autres (IDEX…) pour les totaux,
selon les financeurs qu'Antoine décidera de compter.

## Ce que fait chaque lancement

- Une ligne du journal par ligne de l'export. Relancer l'envoi ne crée aucun doublon utile : la synthèse ne garde
  que la dernière version de chaque clé.
- Une ligne sans N° OPE est ignorée (et comptée dans le message). Une valeur illisible arrête l'envoi, avec la
  colonne et la ligne en cause.
- Une colonne nouvelle dans l'export (par ex. `Attribué 2027`) n'est pas envoyée tant qu'elle n'est pas ajoutée à
  `COLONNES` dans `envoi_grist.py` et à la table Grist ; avec `pousser_xlsx`, le script le signale.
- En cas de panne passagère (réseau, 5xx), 3 essais ; sinon l'erreur est expliquée en français.
- Les lots partent par 100 lignes. Si un lot échoue en cours de route, les lots précédents restent dans le journal ;
  relancer l'envoi complet est sans danger.

## Limites connues

- Le formulaire publié n'accepte que l'ajout : le script ne peut ni relire ni corriger ce qu'il a envoyé.
  Le journal grossit à chaque lancement (une purge se fait à la main dans Grist).
- Le formulaire public peut être rempli par toute personne qui a le lien : ne pas le diffuser, et ne rien brancher de
  sensible sur le journal sans contrôle.
