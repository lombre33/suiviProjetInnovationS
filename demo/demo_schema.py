"""Schéma du document de démo : tables, colonnes, types, formules, listes de choix, descriptions.

Les noms de tables et de colonnes sont ceux que lit et écrit le widget (voir docs/grist_structure et
docs/grist_usage.md), orthographe d'origine comprise (`Directon_Structure_mere`, `Instance_ratachee`,
`comentaire_general_Suivi_projet`, `Suivi_Descisions_Instances`…). Les tables que le widget crée lui-même
à la première ouverture (Instance_*, Export_VP) et les colonnes qu'il ajoute (Jalon_installation_fonds,
next_step_responsable, convention_UB_*…) sont déjà là : le widget constate qu'elles existent et n'y touche pas.

`Preferences_Widget` n'est volontairement pas créée : le widget la fabrique lui-même (avec sa formule
déclenchée `user.Email`) au premier lancement.
"""
import json


class Col(object):
    def __init__(self, col_id, col_type, formula=None, choices=None, options=None, description='',
                 visible=None, label=None):
        self.id = col_id
        self.type = col_type
        self.is_formula = formula is not None
        self.formula = formula or ''
        self.choices = choices
        self.options = options or {}
        self.description = description
        self.visible = visible          # colId (dans la table cible) affiché pour une référence
        self.label = label or col_id

    def widget_options(self):
        opts = dict(self.options)
        if self.choices is not None:
            opts['choices'] = list(self.choices)
            opts.setdefault('choiceOptions', {})
        return json.dumps(opts, ensure_ascii=False, separators=(',', ':')) if opts else ''


class Table(object):
    def __init__(self, table_id, cols):
        self.id = table_id
        self.cols = cols


# --- constructeurs courts ------------------------------------------------------------------------
def text(i, **kw): return Col(i, 'Text', **kw)
def num(i, **kw): return Col(i, 'Numeric', **kw)
def integer(i, **kw): return Col(i, 'Int', **kw)
def boolean(i, **kw): return Col(i, 'Bool', **kw)
def date(i, **kw): return Col(i, 'Date', **kw)
def dtime(i, **kw): return Col(i, 'DateTime:Europe/Paris', **kw)
def choice(i, values, **kw): return Col(i, 'Choice', choices=values, **kw)
def chlist(i, values, **kw): return Col(i, 'ChoiceList', choices=values, **kw)
def ref(i, table, visible=None, **kw):
    kw.setdefault('options', {'widget': 'Reference'})
    return Col(i, 'Ref:' + table, visible=visible, **kw)
def reflist(i, table, visible=None, **kw): return Col(i, 'RefList:' + table, visible=visible, **kw)
def att(i, **kw): return Col(i, 'Attachments', **kw)
def f(i, col_type, formula, **kw): return Col(i, col_type, formula=formula, **kw)


EURO = {'widget': 'TextBox', 'alignment': 'right', 'numMode': 'currency', 'currency': 'EUR',
        'decimals': 0, 'maxDecimals': 0}


def money(i, **kw):
    kw.setdefault('options', dict(EURO))
    return Col(i, 'Numeric', **kw)


# --- valeurs de listes de choix (libellés exacts, préfixes « N) » compris) ---------------------------
NOTIF_STAGES = ['1) Information projet saisies', '2) Notification_relecture', '3) Prette pour CTO', '4) complète',
                '5) envoyée pour signature VP', '6) Signée', '7) Transmise au porteur', '8) Archivee']
CONV_STAGES = ['1) Convention en redaction', '2) Convention en relecture', '3) Convention en signature',
               '4) Convention signée de toutes les parties']
PARTNER_STATUSES = ['Non relu', 'Relu', 'en cours de signature', 'Signé']
JALONS = ['1) Création / prolongation de ligne', '2) En attente DF (ou OPE sur UBInvest)', '3) OPE disponible UB Invest',
          '4) Projet en cours', '5) Reliquats à traiter', '6) Projet clôturé (reliquat inclus)']
TYPE_PROJET = ['Projet', 'Ingenierie_creation', 'Ingenierie_renouvellement', 'reattribution', 'prolongation', 'myphd+']
STATUT_OP = ['en cours', 'Brouillon', 'En retard', 'cloturé avec Reliquat à traiter', 'Cloturé et reliquat traités',
             'En attente des dispo des fonds', 'Suposé cloturé sans information sur ...']
ACTION_OPE = ['Creation de ligne', 'Prolongation de ligne', 're-Abondement de ligne', 'à determiner', 'ligne validée']
STATUT_FIN = ['Finance_En Attente Gestionnaire', 'Finance_Ouverture demandée à la DF', 'Finance_Fonds installés']
GRADES = ['VP', 'Directeur.trice etablissement', 'Agent', 'Direction service', 'assitant.e']
STEPS = ['Ordre du jour', 'Invités', "Mail d'invitation", 'Compte rendu', 'Envoi du compte rendu', 'Notifications liées']
NATURES = ['Validation', 'Discussion', 'Information']
REPONSES = ['À confirmer', 'Viendra', 'Excusé(e)']
APPELS = ['Présent(e)', 'Absent(e)']
ORIGINES = ['Liste permanente', 'Ajouté sur un point']
RELECTURES = ['Modifs demandées', 'Validée']
LIENS = ['Fichier GFS', 'Lien externe']

# --- descriptions (elles alimentent les bulles d'aide « ? » du widget) --------------------------------
UB_STEP_DESC = {
    'convention_UB_v1_le': "Date à laquelle la V1 de la convention est disponible pour la relecture de l'UB. Sous-étape du statut UB (page Administratif, onglet Conventions).",
    'convention_UB_relu_le': "Date à laquelle la convention a été relue par Hélène et Antoine. Sous-étape du statut UB (page Administratif, onglet Conventions).",
    'convention_UB_visa_le': "Date de la demande de visa pour la signature de la convention par l'UB. Sous-étape du statut UB (page Administratif, onglet Conventions).",
    'convention_UB_parapheur_le': "Date d'envoi de la convention dans le parapheur pour signature de l'UB. Sous-étape du statut UB (page Administratif, onglet Conventions).",
}


def _projets():
    c = []
    c += [
        text('Acronyme', description="Nom court du projet, utilisé partout dans le widget (cartes, filtres, recherche)."),
        text('Projet', description="Intitulé complet du projet."),
        ref('Programme', 'Programmes', 'Programme', description="Programme InnovationS qui finance le projet."),
        text('comentaire_general_Suivi_projet', description="Commentaire libre de suivi (orthographe d'origine : un seul « m »)."),
        ref('Porteur_1', 'Annuaire', 'nom_et_Prenom', description="Porteur principal du projet (personne de l'Annuaire)."),
        ref('Porteur_2', 'Annuaire', 'nom_et_Prenom', description="Deuxième porteur (facultatif)."),
        ref('Porteur_3', 'Annuaire', 'nom_et_Prenom', description="Troisième porteur (facultatif)."),
        ref('VP_porteur_signataire_notif', 'Annuaire', 'nom_et_Prenom', description="Vice-président porteur : signataire de la notification."),
        ref('VP_porteur_2', 'Annuaire', 'nom_et_Prenom', description="Deuxième vice-président porteur (facultatif)."),
        ref('Accompagnateur', 'Annuaire', 'nom_et_Prenom', description="Accompagnateur de l'innovation qui suit le projet."),
        date('Date_debut_Projet', description="Date de début du projet. Sert aux codes d'urgence (rouge / orange / vert) des pages Administratif."),
        date('Date_de_fin_Projet', description="Date de fin prévue du projet."),
        date('Date_limite_financement', description="Date limite d'utilisation du financement."),
        reflist('Ligne_OPE', 'Lignes_OPE', 'N_OPE', description="Ligne OPE (opération budgétaire) ouverte pour le projet. En pratique une seule."),
        text('numero_descisions_OLD'),
        choice('Type_projet', TYPE_PROJET, description="Nature du projet : projet, ingénierie, réattribution, prolongation, MyPhD+."),
        choice('Statut_operationnel_projet', STATUT_OP, description="Statut opérationnel. « En attente des dispo des fonds » tant que les fonds ne sont pas installés ; « en cours » / « En retard » ensuite."),
        choice('Statut_Financier', STATUT_FIN, description="Avancement financier une fois la notification archivée (alimente la colonne « Installation des fonds » du Kanban)."),
        choice('Conventions_statut', CONV_STAGES, description="Étape de la convention de reversement (4 étapes). Valeur par défaut : « 1) Convention en redaction »."),
        choice('Renouvellement_ou_Creation', ['Création', 'Renouvellement']),
        ref('Poste_Associe', 'Postes2', 'Nom_du_poste', description="Poste financé par le projet, le cas échéant."),
        ref('Instance_ratachee', 'Suivi_Instance', 'Nom', description="Séance d'instance (CTO, Comité innovation…) à laquelle le projet est rattaché (orthographe d'origine : un seul « t »)."),
        ref('numero_decision', 'Suivi_Descisions_Instances', 'Numero'),
        text('Description_rapide_projet', description="Description courte du projet (une ou deux phrases)."),
        date('prolongation_DateCTOInitial'),
        text('prolongation_numeroDecisionInitial'),
        choice('Action_Ligne_OPE_a_faire', ACTION_OPE, description="Action à mener sur la ligne OPE : création, prolongation, ré-abondement. Détermine la zone de la page Installation des fonds."),
        text('Commentaire_ligne_OPE', description="Commentaire sur la ligne OPE et l'installation des fonds."),
        boolean('Convention_de_reversement', description="Cocher quand une convention de reversement est nécessaire : le projet entre alors dans l'onglet Conventions."),
        reflist('Partenaire_s_convention_reversement', 'Etablissements', 'Acronyme', description="Établissements partenaires de la convention (l'UB signe toujours)."),
        money('Convention_montant_partenaire_1', description="Montant reversé au premier partenaire."),
        money('Convention_montant_partenaire_2', description="Montant reversé au deuxième partenaire."),
        money('Montant_convention_reversement_M10'),
        money('Montant_Convention_Reversement_M20'),
        money('Montant_Convention_reversement_M30'),
        date('convention_Date_derniere_modification', description="Date de la dernière action sur la convention (modifiable depuis la page Administratif)."),
        choice('Details_depense_s_Fonctionnement', ['Depenses de fonctionnement']),
        choice('Details_depense_s_Investissement', ["Dépenses d'investissement"]),
        choice('Details_depense_s_Personnel', ['Depenses de personnel']),
    ]
    for year in range(2023, 2030):
        c += [money('c%d_M10_Fonctionnement' % year, description="Budget de fonctionnement attribué en %d." % year if year == 2026 else ''),
              money('c%d_M20_Investissement' % year),
              money('c%d_M30_Personnel' % year)]
    c += [
        money('Reattribution_montant'),
        num('Duree_financement_mois_'),
        money('Montant_annuel_charge_attribue'),
        num('IMN'),
        num('Duree_Premiere_attribution_mm_poste'),
        text('Affichage_IMN'),
        text('notifications_Elements_specifiques'),
        att('Convention_de_reversement_le_cas_echeant', description="Convention de reversement signée (pièce jointe)."),
        att('Notifications_Signees', description="Notification signée (pièce jointe)."),
        att('Slides_ou_dossier_presentation_projet'),
        # Colonnes de la page Administratif (créées par le widget au premier lancement dans un document vierge)
        text('next_step', description="Prochaine étape de la convention, en une phrase."),
        text('Lien_convention', description="Lien vers le document de la convention (http ou https)."),
        date('Transmise_signee_au_porteur_le', description="Date à laquelle la convention signée a été transmise au porteur par e-mail."),
        date('Transmise_signee_au_porteur_papier_le', description="Date à laquelle la convention signée a été transmise au porteur par courrier papier. Son équivalent par e-mail est Transmise_signee_au_porteur_le."),
        reflist('next_step_responsable', 'Annuaire', 'nom_et_Prenom', description="Personnes (Annuaire) qui doivent réaliser la prochaine étape de la convention. Renseignée depuis la page Administratif du widget ; sert aussi à la page To Do."),
        choice('convention_statut_UB', PARTNER_STATUSES, description="Statut de signature de la convention pour l'UB."),
        choice('convention_statut_partenaire_1', PARTNER_STATUSES, description="Statut de signature de la convention pour le premier partenaire."),
        choice('convention_statut_partenaire_2', PARTNER_STATUSES, description="Statut de signature de la convention pour le deuxième partenaire."),
    ]
    for col_id, desc in UB_STEP_DESC.items():
        c.append(date(col_id, description=desc))
    c.append(choice('Jalon_installation_fonds', JALONS, description="Étape de la page Installation des fonds. Valeur vide = première étape."))
    # --- formules ---
    for year in range(2023, 2030):
        c.append(f('Total_%d' % year, 'Numeric',
                   '$c%d_M10_Fonctionnement + $c%d_M20_Investissement + $c%d_M30_Personnel' % (year, year, year), options=dict(EURO)))
    c += [
        f('Total_Fonctionnement', 'Numeric', '$c2026_M10_Fonctionnement + $c2027_M10_Fonctionnement + $c2028_M10_Fonctionnement', options=dict(EURO)),
        f('Total_investissement', 'Numeric', '$c2026_M20_Investissement + $c2027_M20_Investissement + $c2028_M20_Investissement', options=dict(EURO)),
        f('Total_Personnel', 'Numeric', '$c2026_M30_Personnel + $c2027_M30_Personnel + $c2028_M30_Personnel', options=dict(EURO)),
        f('Montant_attribue_Total', 'Numeric', '$Total_2026 + $Total_2027 + $Total_2028', options=dict(EURO),
          description="Montant attribué 2026-2028 (les autres années ont leur colonne Total_AAAA)."),
        f('montant_total_convention_reversement', 'Numeric',
          '$Montant_convention_reversement_M10 + $Montant_Convention_Reversement_M20 + $Montant_Convention_reversement_M30', options=dict(EURO)),
        f('Instance_ratache_date', 'Date', '$Instance_ratachee.date'),
        f('Periode', 'Text',
          'debut = $prolongation_DateCTOInitial or $Instance_ratache_date\n'
          'fin = $Date_limite_financement\n'
          'if not debut or not fin:\n'
          '  return ""\n'
          'return debut.strftime("%d/%m/%Y") + " au " + fin.strftime("%d/%m/%Y")'),
        f('Ligne_OPE_installe_chez', 'RefList:Structures', '[r.installe_chez.id for r in $Ligne_OPE if r.installe_chez]', visible='Acronyme'),
        f('Employeur_porteur_1', 'Text', '$Porteur_1.Service_Etablissement.Acronyme'),
        f('Statut_Macro', 'Text',
          'statut = $Statut_operationnel_projet\n'
          'if statut != "En attente des dispo des fonds":\n'
          '  return statut\n'
          'notif = Notifications.lookupOne(Projet=$id).notifications_Statut\n'
          'if not notif:\n'
          '  return "En attente statut Notifications"\n'
          'if notif != "8) Archivee":\n'
          '  return notif\n'
          'if $Convention_de_reversement and $Conventions_statut != "4) Convention signée de toutes les parties":\n'
          '  return $Conventions_statut\n'
          'return $Statut_Financier',
          description="Statut global qui range le projet dans les colonnes du Kanban (formule)."),
    ]
    return c


def _instances_cols():
    return [
        text('Instances', description="Nom de l'instance (CTO Innovation, Comité innovation…)."),
        text('Heure_debut', description="Heure de début habituelle des séances de cette instance (HH:MM). Préremplie dans chaque nouvelle séance."),
        integer('Duree_min', description="Durée habituelle d'une séance, en minutes. L'heure de fin se calcule à partir de l'heure de début et sert aux créneaux de présence des invités."),
        chlist('Etapes_actives', STEPS, description="Étapes suivies par cette instance dans la page Instances (ordre du jour, invités, mail d'invitation, compte rendu, envoi du compte rendu, notifications liées). Vide : toutes les étapes."),
        reflist('Relecteurs_CR', 'Annuaire', 'nom_et_Prenom', description="Personnes qui relisent chaque compte rendu de cette instance avant sa validation."),
        reflist('Invites_permanents', 'Annuaire', 'nom_et_Prenom', description="Listing de base de l'instance, repris dans chaque nouvelle séance. Les personnes ajoutées sur un point restent propres à leur séance."),
        text('Modele_invitation', description="Nom du modèle de mail d'invitation (modèle de type e-mail de Publipostage+, rangé dans GFS)."),
        text('Modele_CR', description="Nom du modèle de mail d'envoi du compte rendu (modèle de type e-mail de Publipostage+, rangé dans GFS)."),
    ]


def build_tables(widget_hint=None):
    """Liste ordonnée des tables du document de démo."""
    t = []
    t.append(Table('Grands_Programmes', [text('Nom')]))
    t.append(Table('Etablissements', [
        text('Nom_complet'), text('Acronyme'),
        choice('Statut_PUI', ['Membre', 'Partenaire', 'Associé']),
        choice('Membre_Consortium_InnovationS', ['Oui', 'Non', 'Associé']),
        ref('Responsable_legal_de_la_structure', 'Annuaire', 'nom_et_Prenom'),
        boolean('Etablissement_enseignement_superieur'),
        text('Adresse_ligne_1'), text('CP'),
        choice('Ville', ['Bordeaux', 'Talence', 'Pessac', 'Paris']),
        f('Responsable_legal_de_la_structure_Email', 'Text', '$Responsable_legal_de_la_structure.Email'),
    ]))
    t.append(Table('Structures', [
        text('Acronyme'), text('Nom_Complet'),
        choice('Type', ['Direction', 'Service', 'Labo', 'Service Hors UB']),
        ref('Directon_Structure_mere', 'Structures', 'Acronyme'),
        ref('Etablissement_Tutuelle_gestionaire', 'Etablissements', 'Acronyme'),
        ref('Co_tutuelle_1_Principale', 'Etablissements', 'Acronyme'),
        ref('Co_tutuelle_2_principales', 'Etablissements', 'Acronyme'),
        ref('Tutuelle_Secondaire_1', 'Etablissements', 'Acronyme'),
        ref('Tutuelle_Secondaire_2', 'Etablissements', 'Acronyme'),
        text('N_'), choice('Label', ['UMR', 'UPR', 'EA', 'Équipe-projet']),
        choice('Pole', ['Recherche', 'Pilotage', 'Formation']),
        boolean('ZRR'), boolean('Carnot'),
        choice('Statut_Synchro', ['Nouveau', 'Synchronisé']),
        f('Toutes_les_tutelles', 'RefList:Etablissements',
          'tutelles = [$Etablissement_Tutuelle_gestionaire, $Co_tutuelle_1_Principale, $Co_tutuelle_2_principales, $Tutuelle_Secondaire_1, $Tutuelle_Secondaire_2]\n'
          'return [t.id for t in tutelles if t]', visible='Acronyme'),
    ]))
    t.append(Table('Postes2', [
        text('Titre'), text('Precisions_Poste'),
        ref('Structure2', 'Structures', 'Acronyme'),
        ref('Employeur_tutelle', 'Etablissements', 'Acronyme'),
        choice('type_de_contrat', ['Titulaire', 'CDI', 'CDD']),
        choice('Type_de_poste', ['Enseignant-chercheur', 'Chercheur', 'ITA', 'Administratif', 'Direction']),
        choice('Categorie', ['A', 'B', 'C']),
        choice('grade', GRADES, description="Grade du poste. Seuls « VP » et « Directeur.trice etablissement » sont mis en valeur dans la page Instances."),
        text('Mission_Principale'),
        date('Date_de_fin'),
        f('ID2', 'Text', 'str($id)'),
        f('Direction_du_service', 'Ref:Structures', '$Structure2.Directon_Structure_mere', visible='Acronyme'),
        f('Nom_du_poste', 'Text',
          '$Titre + "  " + $Precisions_Poste + " - " + $Structure2.Acronyme + " - " + $Direction_du_service.Acronyme + " - " + $Employeur_tutelle.Acronyme + " " + $ID2'),
    ]))
    t.append(Table('Annuaire', [
        text('NOM'), text('Prenom'), text('Email'), text('Telephone'),
        ref('Poste2', 'Postes2', 'Nom_du_poste'),
        text('Commentaire_poste'),
        chlist('Type', ['Porteur', 'Gestionnaire', 'Direction', 'Accompagnement']),
        ref('email_Assitant_e_le_cas_echeant', 'Annuaire', 'nom_et_Prenom'),
        boolean('Accompagnateur_de_l_innovation_'),
        chlist('Communaute_metier', ['Valorisation', 'Finance', 'Juridique', 'Recherche']),
        f('nom_et_Prenom', 'Text',
          'prenom = $Prenom\n'
          'nom = $NOM\n'
          'prenom_trait = prenom.capitalize() if prenom else ""\n'
          'nom_trait = nom.upper() if nom else ""\n'
          '(prenom_trait + " " + nom_trait).strip()'),
        f('Service', 'Ref:Structures', '$Poste2.Structure2', visible='Acronyme'),
        f('Service_Etablissement', 'Ref:Etablissements', '$Service.Etablissement_Tutuelle_gestionaire', visible='Acronyme'),
    ]))
    t.append(Table('Programmes', [
        text('Programme', description="Nom du programme InnovationS."),
        ref('Grands_Programmes', 'Grands_Programmes', 'Nom'),
        ref('Responsable', 'Annuaire', 'nom_et_Prenom'),
        choice('Axe_InnovationS', ['Axe 1 · Détecter et maturer', 'Axe 2 · Valider et protéger', 'Axe 3 · Accompagner les talents']),
        chlist('Actions_InnovationS', ['Prématuration', 'Maturation', 'Preuve de concept', 'Ingénierie', 'Formation']),
    ]))
    t.append(Table('Lieux', [
        text('Nom'), integer('Capacite', description="Nombre de places."), text('Adresse'),
    ]))
    t.append(Table('Instances', _instances_cols()))
    t.append(Table('Suivi_Instance', [
        ref('Instance', 'Instances', 'Instances'),
        text('Numero'),
        date('date'),
        ref('Option_de_salle', 'Lieux', 'Nom'),
        ref('Salle', 'Lieux', 'Nom'),
        text('Commentaire'),
        dtime('Heure'),
        num('Axe_PUI'),
        reflist('Liste_des_present_es', 'Postes2', 'Nom_du_poste'),
        reflist('listes_des_excuses', 'Postes2', 'Nom_du_poste'),
        date('Mail_invitation_le', description="Date d'envoi du mail d'invitation à la séance. Une date renseignée vaut validation de l'étape « Mail d'invitation »."),
        date('CR_V0_le', description="Date à laquelle la première version (V0) du compte rendu a été rédigée."),
        ref('CR_V0_par', 'Annuaire', 'nom_et_Prenom', description="Personne qui a coché « V0 rédigée »."),
        att('CR_PDF', description="Version PDF du compte rendu, exportée à la main depuis GFS une fois le texte bien relu. Alimente le bouton « Télécharger le CR » de la page Instances (c'est le dernier fichier de la cellule qui est proposé)."),
        date('Mail_CR_le', description="Date d'envoi du mail du compte rendu. Une date renseignée vaut validation de l'étape « Envoi du compte rendu »."),
        f('Nom', 'Text', '"%s#%s - %s" % ($Instance.Instances, $Numero, $date)'),
    ]))
    t.append(Table('Suivi_Descisions_Instances', [
        text('Numero'), ref('Edition_de_l_instance', 'Suivi_Instance', 'Nom'), text('Decision'),
    ]))
    t.append(Table('Lignes_OPE', [
        text('N_OPE', description="Numéro de la ligne OPE (peut être vide tant que la ligne n'est pas ouverte)."),
        ref('installe_chez', 'Structures', 'Acronyme', description="Structure chez laquelle la ligne OPE est installée (DIESE ou ailleurs)."),
        money('totalCPConsomme'),
    ]))
    t.append(Table('Projets', _projets()))
    t.append(Table('Notifications', [
        ref('Projet', 'Projets', 'Acronyme'),
        choice('notifications_Statut', NOTIF_STAGES, description="Étape de la notification (8 étapes, de « 1) Information projet saisies » à « 8) Archivee »)."),
    ]))
    t.append(Table('Composition_instances', [
        ref('Instance', 'Instances', 'Instances'),
        ref('Personne', 'Annuaire', 'nom_et_Prenom'),
        text('Fonction'),
    ]))
    t.append(Table('GFS_Fichiers', [
        text('Identifiant'), text('Nom'), att('Contenu'), dtime('SupprimeLe'),
    ]))
    # --- tables de la page Instances (créées par le widget dans un document vierge) ---
    t.append(Table('Instance_Invites', [
        ref('Seance', 'Suivi_Instance', 'Nom'), ref('Personne', 'Annuaire', 'nom_et_Prenom'),
        choice('Origine', ORIGINES), date('Ecrit_le'), date('Passage_envoye_le'), text('Passage_envoye_heure'),
        choice('Reponse', REPONSES), text('Dispo_de'), text('Dispo_a'), text('Commentaire'), choice('Appel', APPELS),
    ]))
    t.append(Table('Instance_Points', [
        ref('Seance', 'Suivi_Instance', 'Nom'), integer('Ordre'), text('Titre'), choice('Nature', NATURES),
        integer('Duree_min'), reflist('Projets', 'Projets', 'Acronyme'), reflist('Invites', 'Instance_Invites'),
        reflist('Presentateurs', 'Annuaire', 'nom_et_Prenom', description="Personnes qui présentent ce point à la séance (une ou plusieurs). Indépendant de la liste des invités du point : choisir un présentateur ne l'invite pas."),
        choice('Lien_type', LIENS), text('Lien'),
        ref('Parent', 'Instance_Points', 'Titre', description="Point de l'ordre du jour dont cette ligne est un sous-point (vide pour un point). Un sous-point a les mêmes propriétés qu'un point et se découpe dans la durée de son parent."),
    ]))
    t.append(Table('Instance_Relectures', [
        ref('Seance', 'Suivi_Instance', 'Nom'), ref('Personne', 'Annuaire', 'nom_et_Prenom'),
        choice('Statut', RELECTURES), date('Relu_le'),
    ]))
    t.append(Table('Instance_Validations', [
        ref('Seance', 'Suivi_Instance', 'Nom'), text('Etape'), date('Date'), ref('Par', 'Annuaire', 'nom_et_Prenom'),
    ]))
    t.append(Table('Export_VP', [
        ref('Seance', 'Suivi_Instance', 'Nom'), ref('Projet', 'Projets', 'Acronyme'), boolean('A_envoyer'),
        date('Mis_a_dispo_le'), ref('Mis_a_dispo_par', 'Annuaire', 'nom_et_Prenom'),
        f('Instance', 'Text', 'getattr($Seance.Instance, "Instances", "") if $Seance else ""'),
        f('Date_instance', 'Date', '$Seance.date if $Seance else None'),
        f('Acronyme', 'Text', '$Projet.Acronyme if $Projet else ""'),
        f('Porteur', 'Text', 'getattr($Projet.Porteur_1, "nom_et_Prenom", "") if $Projet else ""'),
        f('Labo_porteur', 'Text',
          'try:\n  return getattr($Projet.Porteur_1.Poste2.Structure2, "Nom_Complet", "") if $Projet else ""\nexcept Exception:\n  return ""'),
        f('Montant', 'Numeric', 'getattr($Projet, "Montant_attribue_Total", 0) or 0 if $Projet else 0', options=dict(EURO)),
        att('PDF_notification'), boolean('Signee'), dtime('Signee_le'), att('PDF_signe'),
    ]))
    return t
