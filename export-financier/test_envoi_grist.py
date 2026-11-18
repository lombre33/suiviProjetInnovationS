"""Tests de envoi_grist.py contre un FAUX Grist local (aucun vrai document touché).

Lancer :  python -m unittest discover -s export-financier -v
"""
import csv
import datetime as dt
import json
import os
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import envoi_grist as eg  # noqa: E402

try:
    import openpyxl
except ImportError:  # le test de lecture du classeur est alors sauté
    openpyxl = None

ICI = os.path.dirname(os.path.abspath(__file__))
EXEMPLE = os.path.join(ICI, "exemple", "financements_InnovationS_TEST.xlsx")
CLE = "AbCdEfGhIjKlMnOpQrStUv"


class FauxGrist:
    """Imite la partie « clé de partage d'un formulaire publié » de l'API Grist."""

    def __init__(self, org=None, table="Import_Financements", colonnes=None):
        self.requetes = []        # (méthode, chemin, corps)
        self.lignes = []          # champs reçus
        self.echecs = []          # statuts à renvoyer d'abord aux POST (ex. [503, 503])
        self.refus_post = None    # statut fixe pour tous les POST
        self.table = table
        self.colonnes = colonnes
        self.prefixe = "/o/%s" % org if org else ""
        faux = self

        class Gestionnaire(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _repondre(self, statut, corps):
                data = json.dumps(corps).encode("utf-8")
                self.send_response(statut)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                faux.requetes.append(("GET", self.path, None))
                if self.path == "%s/api/s/%s/forms/4" % (faux.prefixe, CLE):
                    cols = faux.colonnes if faux.colonnes is not None else [c for _, c, _ in eg.COLONNES]
                    self._repondre(200, {"formTableId": faux.table, "formTitle": "Export",
                                         "formFieldsById": {str(i): {"colId": c} for i, c in enumerate(cols)}})
                else:
                    self._repondre(404, {"error": "not found"})

            def do_POST(self):
                taille = int(self.headers.get("Content-Length", 0))
                corps = json.loads(self.rfile.read(taille).decode("utf-8"))
                faux.requetes.append(("POST", self.path, corps))
                if self.path != "%s/api/s/%s/tables/%s/records" % (faux.prefixe, CLE, faux.table):
                    return self._repondre(404, {"error": "not found"})
                if faux.echecs:
                    return self._repondre(faux.echecs.pop(0), {"error": "indisponible"})
                if faux.refus_post:
                    return self._repondre(faux.refus_post, {"error": "Blocked by table update access rules"})
                faux.lignes.extend(r["fields"] for r in corps["records"])
                self._repondre(200, {"records": [{"id": len(faux.lignes) - i} for i in range(len(corps["records"]))]})

        self.serveur = HTTPServer(("127.0.0.1", 0), Gestionnaire)
        self.hote = "http://127.0.0.1:%d" % self.serveur.server_address[1]
        self.fil = threading.Thread(target=self.serveur.serve_forever, daemon=True)

    def lien(self):
        return "%s%s/forms/%s/4" % (self.hote, self.prefixe, CLE)

    def __enter__(self):
        self.fil.start()
        return self

    def __exit__(self, *a):
        self.serveur.shutdown()
        self.serveur.server_close()


def ligne(**surcharge):
    base = {e: None for e, _, _ in eg.COLONNES}
    base.update({
        "Programme": "Programme fictif", "Projet": "PROJET FICTIF", "Financeur": "IDEX",
        "N° OPE": "FICTIF-0002", "Ligne budgétaire": "CRB / SO / SSO",
        "Date début": dt.datetime(2022, 1, 1), "Date fin": dt.datetime(2025, 12, 31),
        "Montant attribué": 30000, "Part du projet": 0.4, "Consommé CP": 30000,
    })
    base.update(surcharge)
    return base


class TestConversion(unittest.TestCase):
    def test_champs_texte_nombre_date(self):
        c = eg.champs_pour_grist(ligne())
        self.assertEqual(c["N_OPE"], "FICTIF-0002")
        self.assertEqual(c["Montant_attribue"], 30000)
        self.assertEqual(c["Part_du_projet"], 0.4)
        # 2022-01-01 à minuit UTC
        self.assertEqual(c["Date_debut"], 1640995200)
        self.assertEqual(c["Date_fin"], 1767139200)

    def test_valeurs_vides_non_envoyees(self):
        c = eg.champs_pour_grist(ligne())
        self.assertNotIn("Statuts", c)
        self.assertNotIn("Consomme_AE", c)

    def test_seules_les_24_colonnes_de_l_export_sont_envoyees(self):
        c = eg.champs_pour_grist(ligne(**{e: "x" for e, _, t in eg.COLONNES if t == "Text"}))
        self.assertEqual(len(eg.COLONNES), 24)
        self.assertLessEqual(set(c), {col for _, col, _ in eg.COLONNES})
        # la clé de ligne et la date d'envoi sont calculées par Grist, jamais par le script
        self.assertNotIn("Cle_ligne", c)
        self.assertNotIn("Exporte_le", c)

    def test_cellules_vides_des_tableaux_pandas_et_types_numpy(self):
        nan = float("nan")
        c = eg.champs_pour_grist(ligne(**{"Consommé AE": nan, "Statuts": nan, "Date fin": nan}))
        self.assertNotIn("Consomme_AE", c)
        self.assertNotIn("Statuts", c)
        self.assertNotIn("Date_fin", c)
        json.dumps(c, allow_nan=False)  # NaN n'est pas du JSON valide : jamais envoyé

        class Entier(int):  # imite numpy.int64, que json ne sait pas écrire
            pass

        from decimal import Decimal
        c = eg.champs_pour_grist(ligne(**{"Consommé AE": Decimal("12.5"), "Consommé CP": Entier(7)}))
        self.assertEqual(c["Consomme_AE"], 12.5)
        self.assertEqual(c["Consomme_CP"], 7)
        json.dumps(c, allow_nan=False)

    def test_ligne_sans_numero_ope_ignoree(self):
        self.assertIsNone(eg.champs_pour_grist(ligne(**{"N° OPE": "  "})))
        prets, ignorees = eg.preparer([ligne(), ligne(**{"N° OPE": None})])
        self.assertEqual((len(prets), ignorees), (1, 1))

    def test_numero_en_nombre_devient_texte_sans_decimale(self):
        c = eg.champs_pour_grist(ligne(**{"N° décision": 4521.0}))
        self.assertEqual(c["N_decision"], "4521")

    def test_nombres_a_la_francaise_et_dates_texte(self):
        c = eg.champs_pour_grist(ligne(**{"Montant attribué": "1 234,50 €", "Date fin": "31/12/2025"}))
        self.assertEqual(c["Montant_attribue"], 1234.5)
        self.assertEqual(c["Date_fin"], 1767139200)

    def test_valeur_illisible_signalee_avec_la_ligne(self):
        with self.assertRaises(eg.EnvoiGristError) as e:
            eg.preparer([ligne(**{"Consommé CP": "beaucoup"})])
        self.assertIn("Consommé CP", str(e.exception))
        self.assertIn("ligne 2", str(e.exception))

    def test_entetes_tolerants(self):
        # « º » à la place de « ° », espace insécable, accents décomposés
        autre = {"Nº OPE": "X-1", "Financeur": "IDEX", "Établissement": "Etab"}
        c = eg.champs_pour_grist(autre)
        self.assertEqual(c["N_OPE"], "X-1")
        self.assertEqual(c["Etablissement"], "Etab")


class TestLien(unittest.TestCase):
    def test_lien_avec_organisation(self):
        r = eg.analyser_lien("https://grist.exemple.fr/o/mon-equipe/forms/%s/12" % CLE)
        self.assertEqual(r["api"], "https://grist.exemple.fr/o/mon-equipe/api/s/%s" % CLE)
        self.assertEqual(r["section"], 12)

    def test_lien_sans_organisation(self):
        r = eg.analyser_lien("https://docs.exemple.org/forms/%s/4" % CLE)
        self.assertEqual(r["api"], "https://docs.exemple.org/api/s/%s" % CLE)

    def test_lien_invalide(self):
        with self.assertRaises(eg.EnvoiGristError):
            eg.analyser_lien("https://docs.exemple.org/doc/abc")


class TestEnvoi(unittest.TestCase):
    def setUp(self):
        self._pause = eg.time.sleep
        eg.time.sleep = lambda s: None  # pas d'attente réelle entre deux reprises

    def tearDown(self):
        eg.time.sleep = self._pause

    def test_envoi_par_lots_vers_la_table_du_formulaire(self):
        lignes = [ligne(**{"N° OPE": "FICTIF-%04d" % i}) for i in range(250)]
        with FauxGrist(org="equipe") as g:
            bilan = eg.pousser(lignes, g.lien(), taille_lot=100, journal=lambda *_: None)
            posts = [r for r in g.requetes if r[0] == "POST"]
            self.assertEqual([len(p[2]["records"]) for p in posts], [100, 100, 50])
            self.assertEqual(len(g.lignes), 250)
            self.assertEqual(bilan, {"envoyees": 250, "ignorees": 0, "lots": 3, "table": "Import_Financements"})

    def test_le_script_ne_fait_que_lire_la_definition_et_ajouter(self):
        with FauxGrist() as g:
            eg.pousser([ligne()], g.lien(), journal=lambda *_: None)
            self.assertEqual({r[0] for r in g.requetes}, {"GET", "POST"})
            self.assertEqual(sum(1 for r in g.requetes if r[0] == "GET"), 1)

    def test_reprise_apres_panne_passagere(self):
        with FauxGrist() as g:
            g.echecs = [503, 502]
            eg.pousser([ligne()], g.lien(), journal=lambda *_: None)
            self.assertEqual(len(g.lignes), 1)

    def test_refus_de_grist_message_clair_et_aucune_reprise(self):
        with FauxGrist() as g:
            g.refus_post = 403
            with self.assertRaises(eg.EnvoiGristError) as e:
                eg.pousser([ligne()], g.lien(), journal=lambda *_: None)
            self.assertIn("refusé par Grist", str(e.exception))
            self.assertEqual(sum(1 for r in g.requetes if r[0] == "POST"), 1)

    def test_colonne_manquante_dans_la_table(self):
        with FauxGrist() as g:
            g.refus_post = 400
            with self.assertRaises(eg.EnvoiGristError) as e:
                eg.pousser([ligne()], g.lien(), journal=lambda *_: None)
            self.assertIn("Import_Financements", str(e.exception))

    def test_lien_inconnu(self):
        with FauxGrist() as g:
            with self.assertRaises(eg.EnvoiGristError) as e:
                eg.pousser([ligne()], g.lien().replace(CLE, "autre"), journal=lambda *_: None)
            self.assertIn("404", str(e.exception))

    def test_grist_injoignable(self):
        with FauxGrist() as g:
            lien = g.lien()
        with self.assertRaises(eg.EnvoiGristError) as e:
            eg.pousser([ligne()], lien, journal=lambda *_: None)
        self.assertIn("injoignable", str(e.exception))

    def test_dry_run_n_appelle_pas_grist(self):
        sortie = []
        bilan = eg.pousser([ligne()], None, dry_run=True, journal=sortie.append)
        self.assertEqual(bilan["envoyees"], 0)
        self.assertTrue(any("rien n'est envoyé" in s for s in sortie))

    def test_lien_pris_dans_la_variable_d_environnement(self):
        with FauxGrist() as g:
            os.environ[eg.VARIABLE_LIEN] = g.lien()
            try:
                eg.pousser([ligne()], journal=lambda *_: None)
            finally:
                del os.environ[eg.VARIABLE_LIEN]
            self.assertEqual(len(g.lignes), 1)

    def test_sans_lien(self):
        os.environ.pop(eg.VARIABLE_LIEN, None)
        with self.assertRaises(eg.EnvoiGristError):
            eg.pousser([ligne()], journal=lambda *_: None)


@unittest.skipIf(openpyxl is None, "openpyxl absent")
class TestClasseur(unittest.TestCase):
    def test_export_d_exemple_de_bout_en_bout(self):
        with FauxGrist() as g:
            bilan = eg.pousser_xlsx(EXEMPLE, g.lien(), journal=lambda *_: None)
            self.assertEqual(bilan["envoyees"], 2)
            par_ope = {c["N_OPE"]: c for c in g.lignes}
            self.assertEqual(set(par_ope), {"FICTIF-0001", "FICTIF-0002"})
            self.assertEqual(par_ope["FICTIF-0001"]["Consomme_AE"], 37500)
            self.assertEqual(par_ope["FICTIF-0001"]["Disponible_CP"], 15000)
            self.assertEqual(par_ope["FICTIF-0002"]["Financeur"], "IDEX")

    def test_colonne_obligatoire_absente(self):
        with tempfile.TemporaryDirectory() as dossier:
            chemin = os.path.join(dossier, "export.xlsx")
            wb = openpyxl.Workbook()
            wb.active.title = "Reporting"
            wb.active.append(["Programme", "Projet"])
            wb.save(chemin)
            with self.assertRaises(eg.EnvoiGristError) as e:
                eg.lire_xlsx(chemin)
            self.assertIn("N° OPE", str(e.exception))

    def test_colonne_nouvelle_signalee_mais_pas_bloquante(self):
        with tempfile.TemporaryDirectory() as dossier:
            chemin = os.path.join(dossier, "export.xlsx")
            wb = openpyxl.load_workbook(EXEMPLE)
            wb["Reporting"]["Y1"] = "Attribué 2027"
            wb["Reporting"]["Y2"] = 1000
            wb.save(chemin)
            lignes, inconnus = eg.lire_xlsx(chemin)
            self.assertEqual(inconnus, ["Attribué 2027"])
            self.assertEqual(len(lignes), 2)

    def test_feuille_inexistante(self):
        with self.assertRaises(eg.EnvoiGristError) as e:
            eg.lire_xlsx(EXEMPLE, "Autre")
        self.assertIn("Reporting", str(e.exception))

    def test_ligne_de_commande_dry_run(self):
        self.assertEqual(eg.main([EXEMPLE, "--dry-run"]), 0)

    def test_modele_csv_a_jour_avec_les_colonnes_du_module(self):
        # Le CSV commité sert à créer la table dans Grist : ses en-têtes doivent être les identifiants du module.
        with open(os.path.join(ICI, "exemple", "Import_Financements_modele.csv"), encoding="utf-8", newline="") as f:
            lignes = list(csv.reader(f))
        self.assertEqual(lignes[0], [c for _, c, _ in eg.COLONNES])
        self.assertEqual(len(lignes), 3)
        # et il se régénère à l'identique depuis le classeur d'exemple
        with tempfile.TemporaryDirectory() as dossier:
            sortie = os.path.join(dossier, "modele.csv")
            self.assertEqual(eg.main([EXEMPLE, "--modele-csv", sortie]), 0)
            with open(sortie, encoding="utf-8", newline="") as f:
                self.assertEqual(list(csv.reader(f)), lignes)


if __name__ == "__main__":
    unittest.main()
