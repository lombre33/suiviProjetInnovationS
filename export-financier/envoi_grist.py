#!/usr/bin/env python3
"""Envoi de l'export financier InnovationS vers Grist, sans copier-coller.

Le script d'export produit un classeur Excel (feuille « Reporting », une ligne par OPE
et par financeur). Ce module dépose ces mêmes lignes dans un FORMULAIRE GRIST PUBLIÉ,
comme le fait FormPlus : pas de clé API, seulement le lien du formulaire.

  - Le formulaire n'accepte que l'AJOUT : chaque lancement ajoute des lignes dans le
    journal `Export_Financier` ; Grist garde ensuite, par formules, la dernière version
    de chaque ligne (voir LISEZMOI.md).
  - Rien n'est jamais modifié ni supprimé dans Grist par ce module.

Deux façons de l'utiliser.

1. À la fin de ton script d'export, une ligne :

       from envoi_grist import pousser_xlsx
       pousser_xlsx("financements_InnovationS_2026-11-18.xlsx")

   Le lien du formulaire est lu dans la variable d'environnement
   GRIST_LIEN_FORMULAIRE_EXPORT (ou passé avec lien="...").

2. En ligne de commande :

       python envoi_grist.py financements_InnovationS_2026-11-18.xlsx --dry-run
       python envoi_grist.py financements_InnovationS_2026-11-18.xlsx --lien "https://.../forms/<clé>/<section>"

Bibliothèque standard seulement, plus openpyxl pour lire le classeur (déjà utilisé par
le script d'export).
"""
import argparse
import calendar
import datetime as dt
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request

VARIABLE_LIEN = "GRIST_LIEN_FORMULAIRE_EXPORT"
FEUILLE_PAR_DEFAUT = "Reporting"
TAILLE_LOT = 100

# (en-tête dans l'Excel, identifiant de la colonne Grist, type Grist)
# Les identifiants Grist sont écrits ici sans accent ni espace : la table `Export_Financier`
# doit porter exactement ces identifiants (voir LISEZMOI.md).
COLONNES = [
    ("Programme", "Programme", "Text"),
    ("Projet", "Projet", "Text"),
    ("Financeur", "Financeur", "Text"),
    ("Financeurs du projet", "Financeurs_du_projet", "Text"),
    ("N° OPE", "N_OPE", "Text"),
    ("Libellé opération", "Libelle_operation", "Text"),
    ("Ligne budgétaire", "Ligne_budgetaire", "Text"),
    ("Date début", "Date_debut", "Date"),
    ("Date fin", "Date_fin", "Date"),
    ("Montant attribué", "Montant_attribue", "Numeric"),
    ("Part du projet", "Part_du_projet", "Numeric"),
    ("Attribué 2022", "Attribue_2022", "Numeric"),
    ("Attribué 2023", "Attribue_2023", "Numeric"),
    ("Attribué 2024", "Attribue_2024", "Numeric"),
    ("Attribué 2025", "Attribue_2025", "Numeric"),
    ("Attribué 2026", "Attribue_2026", "Numeric"),
    ("Consommé AE", "Consomme_AE", "Numeric"),
    ("Consommé CP", "Consomme_CP", "Numeric"),
    ("Disponible AE", "Disponible_AE", "Numeric"),
    ("Disponible CP", "Disponible_CP", "Numeric"),
    ("Statuts", "Statuts", "Text"),
    ("N° décision", "N_decision", "Text"),
    ("Structure", "Structure", "Text"),
    ("Établissement", "Etablissement", "Text"),
]

# Colonnes ajoutées par ce module (absentes de l'Excel).
COLONNE_CLE = "Cle_ligne"        # Text : identifie une ligne d'une exportation à l'autre
COLONNE_DATE_ENVOI = "Exporte_le"  # DateTime : l'instant du lancement, le même pour toutes les lignes

# Ce qui identifie une ligne d'un export à l'autre (en-têtes Excel). À confirmer sur
# l'export réel : si un même N° OPE peut porter plusieurs lignes budgétaires ou plusieurs
# financeurs, ils doivent faire partie de la clé.
CLE_LIGNE = ("N° OPE", "Financeur", "Ligne budgétaire")

# En-tête qui doit être rempli pour qu'une ligne soit envoyée.
ENTETE_OBLIGATOIRE = "N° OPE"


class EnvoiGristError(Exception):
    """Erreur d'envoi : le message est écrit pour être lu tel quel par l'utilisateur."""


# ---------------------------------------------------------------------------
# Lecture et conversion des valeurs
# ---------------------------------------------------------------------------

def _norme(texte):
    """Compare des en-têtes sans se soucier des accents composés, des espaces insécables
    ni de la variante « º » du signe « ° »."""
    t = unicodedata.normalize("NFC", str(texte))
    t = t.replace(" ", " ").replace("º", "°")
    return re.sub(r"\s+", " ", t).strip()


def _en_texte(valeur):
    if valeur is None:
        return None
    if isinstance(valeur, float) and valeur.is_integer():
        valeur = int(valeur)
    t = str(valeur).strip()
    return t or None


def _en_nombre(valeur, contexte):
    if valeur is None or isinstance(valeur, bool):
        return None
    if isinstance(valeur, (int, float)):
        return valeur
    t = str(valeur).replace(" ", "").replace(" ", "").replace("€", "").replace(",", ".").strip()
    if not t:
        return None
    try:
        return float(t)
    except ValueError:
        raise EnvoiGristError("Nombre illisible dans %s : %r" % (contexte, valeur))


def _en_secondes_utc(d):
    return calendar.timegm(dt.datetime(d.year, d.month, d.day).timetuple())


def _en_date(valeur, contexte):
    """Une colonne Date de Grist attend des secondes depuis 1970, à minuit UTC."""
    if valeur is None:
        return None
    if isinstance(valeur, (dt.datetime, dt.date)):
        return _en_secondes_utc(valeur)
    t = str(valeur).strip()
    if not t:
        return None
    for modele in ("%Y-%m-%d", "%d/%m/%Y", "%Y-%m-%d %H:%M:%S"):
        try:
            return _en_secondes_utc(dt.datetime.strptime(t, modele))
        except ValueError:
            continue
    raise EnvoiGristError("Date illisible dans %s : %r" % (contexte, valeur))


def _maintenant():
    return int(time.time())


def champs_pour_grist(ligne, exporte_le, numero=None):
    """Transforme une ligne de l'export (dict { en-tête Excel : valeur }) en champs Grist.

    Les valeurs vides ne sont pas envoyées. Renvoie None pour une ligne sans N° OPE.
    """
    ligne = {_norme(k): v for k, v in ligne.items()}
    ou = " (ligne %d)" % numero if numero else ""
    if _en_texte(ligne.get(_norme(ENTETE_OBLIGATOIRE))) is None:
        return None
    champs = {}
    for entete, col, type_ in COLONNES:
        brut = ligne.get(_norme(entete))
        contexte = "la colonne « %s »%s" % (entete, ou)
        if type_ == "Numeric":
            valeur = _en_nombre(brut, contexte)
        elif type_ == "Date":
            valeur = _en_date(brut, contexte)
        else:
            valeur = _en_texte(brut)
        if valeur is not None:
            champs[col] = valeur
    cle = "|".join(_en_texte(ligne.get(_norme(e))) or "" for e in CLE_LIGNE)
    champs[COLONNE_CLE] = cle
    champs[COLONNE_DATE_ENVOI] = exporte_le
    return champs


def lire_xlsx(chemin, feuille=FEUILLE_PAR_DEFAUT):
    """Lit la feuille de l'export : renvoie (liste de dicts { en-tête : valeur }, en-têtes inconnus)."""
    try:
        import openpyxl
    except ImportError:
        raise EnvoiGristError("Il manque openpyxl pour lire le classeur : pip install openpyxl")
    try:
        classeur = openpyxl.load_workbook(chemin, data_only=True, read_only=True)
    except FileNotFoundError:
        raise EnvoiGristError("Fichier introuvable : %s" % chemin)
    try:
        if feuille not in classeur.sheetnames:
            raise EnvoiGristError("La feuille « %s » n'existe pas dans %s (feuilles : %s)"
                                  % (feuille, chemin, ", ".join(classeur.sheetnames)))
        lignes = classeur[feuille].iter_rows(values_only=True)
        entetes = next(lignes, None)
        if not entetes:
            raise EnvoiGristError("La feuille « %s » est vide." % feuille)
        entetes = [_norme(e) if e is not None else None for e in entetes]
        connus = {_norme(e) for e, _, _ in COLONNES}
        manquants = [e for e, _, _ in COLONNES if _norme(e) not in entetes]
        if manquants:
            raise EnvoiGristError("Colonnes absentes de l'export : %s" % ", ".join(manquants))
        inconnus = [e for e in entetes if e and e not in connus]
        resultat = []
        for valeurs in lignes:
            if all(v is None or (isinstance(v, str) and not v.strip()) for v in valeurs):
                continue
            resultat.append({e: v for e, v in zip(entetes, valeurs) if e})
        return resultat, inconnus
    finally:
        classeur.close()


# ---------------------------------------------------------------------------
# Lien du formulaire et appels HTTP
# ---------------------------------------------------------------------------

def analyser_lien(lien):
    """Le lien d'un formulaire publié : https://<hôte>[/o/<org>]/forms/<clé>/<section>."""
    m = re.match(r"^(https?://[^/]+)(?:/o/([^/]+))?/forms/([^/]+)/(\d+)", (lien or "").strip())
    if not m:
        raise EnvoiGristError(
            "Lien de formulaire non reconnu : %r. Il doit ressembler à "
            "https://<instance>/o/<équipe>/forms/<clé>/<numéro>." % (lien,))
    hote, org, cle, section = m.groups()
    api = "%s/o/%s/api/s/%s" % (hote, org, cle) if org else "%s/api/s/%s" % (hote, cle)
    return {"hote": hote, "api": api, "section": int(section)}


def _http(methode, url, corps=None, delai=60):
    donnees = json.dumps(corps).encode("utf-8") if corps is not None else None
    en_tetes = {"User-Agent": "export-financier/1.0"}
    if donnees is not None:
        en_tetes["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=donnees, method=methode, headers=en_tetes)
    try:
        with urllib.request.urlopen(req, timeout=delai) as rep:
            return rep.status, rep.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except (urllib.error.URLError, OSError) as e:
        return 0, str(e)


def _http_avec_reprises(methode, url, corps=None, essais=3, pause=2.0):
    """Reprend sur les pannes passagères (réseau coupé, 429, 5xx), jamais sur une erreur 4xx."""
    for n in range(essais):
        statut, texte = _http(methode, url, corps)
        passager = statut == 0 or statut == 429 or statut >= 500
        if not passager or n == essais - 1:
            return statut, texte
        time.sleep(pause * (2 ** n))
    return statut, texte


def _expliquer(statut, texte, action):
    detail = (texte or "").strip().replace("\n", " ")[:300]
    if statut == 0:
        return "%s : Grist est injoignable (%s). Vérifie le réseau ou le VPN." % (action, detail)
    if statut in (401, 403):
        return ("%s : refusé par Grist (HTTP %d). Le formulaire est-il toujours publié, et la table "
                "n'a-t-elle pas une colonne Référence à double sens ? %s" % (action, statut, detail))
    if statut == 404:
        return "%s : lien de formulaire inconnu de Grist (HTTP 404). Vérifie qu'il est publié." % action
    if statut == 400:
        return ("%s : Grist refuse les données (HTTP 400) : %s. Une colonne de la table "
                "`Export_Financier` manque ou n'a pas le bon identifiant." % (action, detail))
    return "%s : HTTP %d %s" % (action, statut, detail)


def table_du_formulaire(api, section):
    """Lit la définition du formulaire publié : renvoie (identifiant de la table, colonnes du formulaire)."""
    statut, texte = _http_avec_reprises("GET", "%s/forms/%d" % (api, section))
    if statut != 200:
        raise EnvoiGristError(_expliquer(statut, texte, "Lecture du formulaire"))
    try:
        formulaire = json.loads(texte)
        table = formulaire["formTableId"]
        colonnes = [c["colId"] for c in formulaire.get("formFieldsById", {}).values()]
    except (ValueError, KeyError, TypeError):
        raise EnvoiGristError("Réponse inattendue de Grist pour la définition du formulaire.")
    return table, colonnes


# ---------------------------------------------------------------------------
# Envoi
# ---------------------------------------------------------------------------

def preparer(lignes, exporte_le=None):
    """Renvoie (champs prêts pour Grist, nombre de lignes ignorées faute de N° OPE)."""
    exporte_le = exporte_le or _maintenant()
    prets, ignorees = [], 0
    for i, ligne in enumerate(lignes, start=2):  # la ligne 1 de la feuille porte les en-têtes
        champs = champs_pour_grist(ligne, exporte_le, numero=i)
        if champs is None:
            ignorees += 1
        else:
            prets.append(champs)
    return prets, ignorees


def pousser(lignes, lien=None, *, exporte_le=None, taille_lot=TAILLE_LOT, dry_run=False, journal=print):
    """Dépose les lignes de l'export (dicts { en-tête Excel : valeur }) dans le formulaire Grist.

    Renvoie un petit compte rendu { envoyees, ignorees, lots, table }.
    """
    lien = lien or os.environ.get(VARIABLE_LIEN)
    if not lien and not dry_run:
        raise EnvoiGristError("Pas de lien de formulaire : passe lien=... ou renseigne la variable %s."
                              % VARIABLE_LIEN)
    prets, ignorees = preparer(lignes, exporte_le)
    if ignorees:
        journal("Attention : %d ligne(s) sans N° OPE ignorée(s)." % ignorees)
    if not prets:
        raise EnvoiGristError("Aucune ligne à envoyer.")
    lots = [prets[i:i + taille_lot] for i in range(0, len(prets), taille_lot)]

    if dry_run:
        journal("[essai à blanc] %d ligne(s) en %d envoi(s), rien n'est envoyé. Première ligne :" %
                (len(prets), len(lots)))
        journal(json.dumps(prets[0], ensure_ascii=False, indent=2))
        return {"envoyees": 0, "ignorees": ignorees, "lots": len(lots), "table": None}

    cible = analyser_lien(lien)
    table, colonnes_formulaire = table_du_formulaire(cible["api"], cible["section"])
    attendues = [c for _, c, _ in COLONNES] + [COLONNE_CLE, COLONNE_DATE_ENVOI]
    absentes = [c for c in attendues if c not in colonnes_formulaire]
    if absentes:
        journal("Remarque : le formulaire n'affiche pas %s ; Grist les accepte si la table les contient."
                % ", ".join(absentes))
    url = "%s/tables/%s/records" % (cible["api"], table)
    envoyees = 0
    for n, lot in enumerate(lots, start=1):
        statut, texte = _http_avec_reprises("POST", url, {"records": [{"fields": c} for c in lot]})
        if statut != 200:
            raise EnvoiGristError(
                _expliquer(statut, texte, "Envoi du lot %d/%d" % (n, len(lots))) +
                " %d ligne(s) déjà envoyée(s) avant cet échec ; relancer l'envoi complet est sans "
                "danger (Grist garde la dernière version de chaque ligne)." % envoyees)
        envoyees += len(lot)
        journal("Lot %d/%d envoyé (%d/%d lignes)." % (n, len(lots), envoyees, len(prets)))
    return {"envoyees": envoyees, "ignorees": ignorees, "lots": len(lots), "table": table}


def pousser_xlsx(chemin, lien=None, *, feuille=FEUILLE_PAR_DEFAUT, **options):
    """Lit le classeur produit par le script d'export puis l'envoie à Grist."""
    lignes, inconnus = lire_xlsx(chemin, feuille)
    journal = options.get("journal", print)
    if inconnus:
        journal("Attention : colonne(s) de l'export non envoyée(s) à Grist : %s. "
                "Ajoute-les à COLONNES dans envoi_grist.py et à la table Export_Financier." % ", ".join(inconnus))
    return pousser(lignes, lien, **options)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Envoie l'export financier InnovationS dans Grist (formulaire publié).")
    ap.add_argument("fichier", help="classeur Excel produit par le script d'export")
    ap.add_argument("--lien", help="lien du formulaire publié (sinon variable %s)" % VARIABLE_LIEN)
    ap.add_argument("--feuille", default=FEUILLE_PAR_DEFAUT)
    ap.add_argument("--lot", type=int, default=TAILLE_LOT, help="lignes par envoi (défaut %d)" % TAILLE_LOT)
    ap.add_argument("--dry-run", action="store_true", help="prépare les lignes sans rien envoyer")
    a = ap.parse_args(argv)
    try:
        bilan = pousser_xlsx(a.fichier, a.lien, feuille=a.feuille, taille_lot=a.lot, dry_run=a.dry_run)
    except EnvoiGristError as e:
        print("ERREUR : %s" % e, file=sys.stderr)
        return 1
    if not a.dry_run:
        print("Terminé : %d ligne(s) déposée(s) dans %s." % (bilan["envoyees"], bilan["table"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
