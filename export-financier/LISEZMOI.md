# Envoyer l'export financier dans Grist

Le script d'export produit `financements_InnovationS_AAAA-MM-JJ.xlsx`. `envoi_grist.py` dépose ses lignes
dans un **formulaire Grist publié** : pas de copier-coller, pas de clé API, seulement le lien du formulaire.

```
script d'export ──► .xlsx ──► envoi_grist.py ──POST──► formulaire publié ──► journal Import_Financements (ajout seul)
                                                                                     │ formules Grist
                                                                                     ▼
                                                              synthèse : dernière version de chaque ligne
```

**Statut : proposition, non validée en réel.** Le code est testé contre un faux Grist local
(`python -m unittest discover -s export-financier -v`). Il n'a jamais écrit dans un vrai document :
`grist.numerique.gouv.fr` n'est pas joignable depuis l'environnement de développement.

## Brancher le script

À la fin du script d'export :

```python
from envoi_grist import pousser_xlsx
pousser_xlsx("financements_InnovationS_2026-11-18.xlsx")   # lien lu dans GRIST_LIEN_FORMULAIRE_EXPORT
```

Ou en ligne de commande : `python envoi_grist.py fichier.xlsx --dry-run` (prépare sans rien envoyer), puis sans `--dry-run`.
Le classeur d'essai `exemple/financements_InnovationS_TEST.xlsx` (deux lignes fictives) sert à essayer.

Le lien du formulaire donne le droit d'**ajouter** des lignes dans la table : à garder dans la variable
d'environnement `GRIST_LIEN_FORMULAIRE_EXPORT`, pas dans le code ni dans le dépôt.

## Côté Grist (à faire une fois)

1. Créer la table **`Import_Financements`** avec ces colonnes (identifiants exacts, sans accent) :

| Texte | Date | Numérique | Autre |
|---|---|---|---|
| `Programme`, `Projet`, `Financeur`, `Financeurs_du_projet`, `N_OPE`, `Libelle_operation`, `Ligne_budgetaire`, `Statuts`, `N_decision`, `Structure`, `Etablissement`, `Cle_ligne` | `Date_debut`, `Date_fin` | `Montant_attribue`, `Part_du_projet`, `Attribue_2022` … `Attribue_2026`, `Consomme_AE`, `Consomme_CP`, `Disponible_AE`, `Disponible_CP` | `Exporte_le` : Date et heure |

2. Ajouter un widget **Formulaire** sur cette table, y mettre toutes les colonnes, **publier**, copier le lien
   (`https://…/forms/<clé>/<numéro>`).
3. Pas de colonne Référence à double sens sur cette table (Grist refuserait l'envoi anonyme).
4. Table de synthèse de `Import_Financements` groupée par `Cle_ligne`, puis, dans la synthèse :
   `Derniere` = `max($group, key=lambda r: (r.Exporte_le, r.id))`, et chaque colonne utile en `=$Derniere.<colonne>`
   (remplacer les `SUM($group.…)` créées d'office pour les colonnes numériques).

## Ce que fait chaque lancement

- Une ligne du journal par ligne de l'export, toutes datées du même `Exporte_le`. Relancer l'envoi ne crée
  aucun doublon utile : la synthèse ne garde que la dernière version.
- `Cle_ligne` = `N° OPE | Financeur | Ligne budgétaire`. **À confirmer sur le vrai export** (constante `CLE_LIGNE`).
- Une ligne sans N° OPE est ignorée (et comptée dans le message). Une valeur illisible arrête l'envoi, avec la
  colonne et la ligne du classeur.
- Une colonne nouvelle dans l'export (par ex. `Attribué 2027`) n'est pas envoyée tant qu'elle n'est pas ajoutée à
  `COLONNES` et à la table ; le script le signale.
- En cas de panne passagère (réseau, 5xx), 3 essais ; sinon l'erreur est expliquée en français.

## Limites connues

- Le formulaire publié n'accepte que l'ajout : le script ne peut ni relire ni corriger ce qu'il a envoyé.
  Le journal grossit à chaque lancement (une purge se fait à la main dans Grist).
- Le rattachement au projet (N° OPE → `Lignes_OPE.N_OPE`) et l'alimentation du widget ne sont pas faits ici.
