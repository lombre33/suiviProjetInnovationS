# Document Grist de démonstration

`demo-innovations.grist` est un document Grist **entièrement fictif** (aucune vraie personne, aucun vrai projet, aucun vrai
montant ni numéro d'OPE) qui remplit toutes les vues du widget : 20 tables, 27 projets, 17 personnes, 6 séances d'instance.
Les noms d'organismes (UB, CNRS, Inserm, INRAE, Bordeaux INP, CHU) sont de vrais noms ; les laboratoires sont inventés.

## Ouvrir la démo (2 minutes)

1. Dans Grist : **Ajouter un nouveau → Importer un document**, puis choisir `demo-innovations.grist`.
2. Ouvrir la page **Suivi InnovationS** : elle contient déjà le widget (widget personnalisé posé sur `Projets`,
   accès complet au document), à l'adresse `https://lombre33.github.io/suiviProjetInnovationS/`.
3. Si le widget doit venir d'une autre adresse (version de développement) : dans la page, clic sur l'engrenage de la
   section → **Widget personnalisé** → coller l'URL ; le niveau d'accès doit rester **Accès complet au document**.

Pour poser le widget à la main dans un document vierge ou dans une autre copie : **Ajouter une page → Widget →
Personnalisé**, table **Projets**, saisir l'URL, accès complet.

Au premier lancement le widget crée tout seul `Preferences_Widget` (préférences par personne). Il faut donc pouvoir
modifier le document (propriétaire ou éditeur).

## Ce que chaque vue montre

| Vue | Contenu de la démo |
| --- | --- |
| **Projets** (Kanban) | 24 projets rangés : 6 Instruction, 3 Notifications, 5 Conventions, 6 Installation des fonds, 4 Projet en cours (colonne repliée par défaut). Les 3 autres sont volontairement hors Kanban (notification « 7) Transmise au porteur », projets clôturés). |
| **Administratif · Notifications** | 26 projets sur les 8 étapes, avec les couleurs d'urgence rouge / orange / neutre / vert (dates de début calculées par rapport à aujourd'hui). |
| **Administratif · Conventions** | 7 conventions sur les 4 volets, 1 ou 2 partenaires, statuts de signature, sous-étapes datées de l'UB (V1, relu, visa, parapheur), prochaine étape et responsables tagués, un montant > 20 000 €. |
| **Installation des fonds** | Zones Création et Prolongation / réabondement, lieux DIESE et AUTRE, jalons 1 à 6, une ligne OPE sans numéro (« N° à venir »), une ligne OPE incomplète (rouge « OPE à compléter »). |
| **To Do** | Rôles déduits de l'Annuaire : Élise FONTAINE (Notifications + Conventions), Hugo DELMAS (Installation), tags « next step » sur les conventions. |
| **Instances** | CTO Innovation n°14 dans 3 jours (ordre du jour avec sous-points, invités habituels et spécifiques, VP en magenta, conflit de disponibilité) ; CTO n°12 et n°13 passés (compte rendu et relectures) ; Comité innovation n°4 et n°5. |

## À savoir

- **To Do** : l'adresse de la personne connectée ne correspond à aucune fiche de l'Annuaire de démo. Le widget propose
  alors « Qui êtes-vous ? » : choisir Élise FONTAINE (Notifications / Conventions) ou, dans « Voir : », Hugo DELMAS
  (Installation). Pour être reconnu automatiquement, remplacer l'`Email` d'une fiche de l'Annuaire par le sien.
- **Dashboard** : cette page n'existe pas encore dans le widget, donc rien à montrer ; la démo contient déjà les
  montants attribués par année (`Total_2026` à `Total_2029`) et `Lignes_OPE.totalCPConsomme`.
- **Rédaction / GFS / publipostage+** : ces outils sont hébergés ailleurs ; la démo ne contient que les données que le
  widget leur transmet.
- **Pièces jointes** (notification signée, convention signée, PDF du compte rendu) : colonnes présentes, mais vides.
- Les 3 colonnes `c2029_*` sont de vraies colonnes numériques (dans le document réel elles sont encore des formules).
- Les dates sont fixées au jour de génération du fichier ; pour recaler la démo, la régénérer.

## Régénérer ou adapter

Rien à installer (Python 3 standard) :

```
python3 demo/generate_demo_grist.py --out demo-innovations.grist [--today 2026-11-16] [--widget-url https://…/] [--no-widget]
python3 demo/check_demo_grist.py demo-innovations.grist [--reference Hello.grist] [--dump-mock tables.json]
node demo/render_previews.js --tables tables.json --out previews/ [--scale 2]
```

- `demo_schema.py` : tables et colonnes (noms et orthographe du vrai document : `comentaire_general_Suivi_projet`,
  `Instance_ratachee`, `Directon_Structure_mere`…), types, formules, listes de choix, descriptions (elles alimentent les
  bulles d'aide « ? »).
- `demo_data.py` : les données fictives.
- `generate_demo_grist.py` : écrit le fichier SQLite `.grist` (version de schéma 47) ; `grist_meta_ddl.py` en contient les
  tables système.
- `formula_engine.py` : petit moteur de formules (syntaxe `$Colonne`, `lookupRecords`) pour écrire les valeurs calculées.
- `check_demo_grist.py` : contrôle de structure, d'intégrité et de formules ; `render_previews.js` : ouvre le vrai widget
  dans Chromium avec le simulateur de Grist des tests et photographie chaque vue.

## Ce qui a été vérifié, et ce qui ne l'a pas été

Vérifié : structure des tables système identique à celle d'un document créé par Grist (même DDL, même `schemaVersion`),
cohérence métadonnées / tables SQL (types et valeurs par défaut comme `DocStorage`), références, listes de choix,
recalcul de toutes les formules (1 458 cellules), rendu de chaque vue du widget avec les données relues dans le fichier.

**Non vérifié : l'ouverture dans un vrai Grist** (le bac à sable de développement n'y accède pas et n'a pas pu installer
grist-core). Si Grist refuse le fichier ou signale une colonne, le générateur est là pour corriger vite.
