"""Données fictives du document de démo (aucune personne, aucun projet ni aucun numéro n'existe).

Tout est calculé à partir de `today` : les dates (début de projet, séances, dates de convention…) suivent
la date du jour, de sorte que les codes d'urgence (rouge / orange / vert) et les séances « à venir » restent
cohérents le jour où la démo est ouverte. Les institutions (UB, CNRS, Inserm…) sont de vrais noms d'organismes ;
les laboratoires, les personnes, les projets, les montants et les numéros d'OPE sont inventés.

`build(today)` renvoie `{tableId: {rowId: {colId: valeur}}}` : seules les colonnes renseignées sont données,
les autres prendront la valeur par défaut de leur type. Les colonnes formule ne sont jamais renseignées ici.
"""
import datetime as dt
import unicodedata
import zoneinfo

PARIS = zoneinfo.ZoneInfo('Europe/Paris')


def _ascii(text):
    return unicodedata.normalize('NFD', text).encode('ascii', 'ignore').decode('ascii').lower().replace(' ', '')


class Store(object):
    def __init__(self):
        self.t = {}

    def add(self, table, **cols):
        rows = self.t.setdefault(table, {})
        row_id = len(rows) + 1
        rows[row_id] = cols
        return row_id

    def set(self, table, row_id, **cols):
        self.t[table][row_id].update(cols)


def build(today):
    S = Store()

    def day(n):
        return today + dt.timedelta(days=n)

    def weekday(n):
        d = day(n)
        while d.weekday() >= 5:
            d += dt.timedelta(days=1)
        return d

    def paris(date, hh, mm=0):
        return int(dt.datetime(date.year, date.month, date.day, hh, mm, tzinfo=PARIS).timestamp())

    # ------------------------------------------------------------------ Grands programmes, programmes
    GP = {name: S.add('Grands_Programmes', Nom=name) for name in ['InnovationS', 'France 2030 – Transfert']}

    # ------------------------------------------------------------------ Établissements
    E = {}
    for key, nom, statut, ville in [
        ('UB', 'Université de Bordeaux', 'Membre', 'Talence'),
        ('CNRS', 'Centre national de la recherche scientifique', 'Partenaire', 'Paris'),
        ('Inserm', "Institut national de la santé et de la recherche médicale", 'Partenaire', 'Paris'),
        ('INRAE', "Institut national de recherche pour l'agriculture, l'alimentation et l'environnement", 'Partenaire', 'Paris'),
        ('Bordeaux INP', 'Bordeaux INP', 'Membre', 'Talence'),
        ('CHU Bordeaux', 'Centre hospitalier universitaire de Bordeaux', 'Associé', 'Bordeaux'),
    ]:
        E[key] = S.add('Etablissements', Nom_complet=nom, Acronyme=key, Statut_PUI=statut,
                       Membre_Consortium_InnovationS='Oui' if statut != 'Associé' else 'Associé',
                       Etablissement_enseignement_superieur=key in ('UB', 'Bordeaux INP'),
                       Adresse_ligne_1='1 place de la Démo', CP='33400', Ville=ville)

    # ------------------------------------------------------------------ Structures
    ST = {}

    def structure(key, nom, typ, mere, tutelle, **kw):
        ST[key] = S.add('Structures', Acronyme=key, Nom_Complet=nom, Type=typ,
                        Directon_Structure_mere=ST.get(mere, 0), Etablissement_Tutuelle_gestionaire=E[tutelle], **kw)

    structure('DIESE', "Direction de l'innovation et de l'entrepreneuriat", 'Direction', None, 'UB', Pole='Pilotage')
    structure('Service Dev_Valo', 'Service développement – valorisation', 'Service', 'DIESE', 'UB', Pole='Pilotage')
    structure('Grands Programmes', 'Pôle grands programmes', 'Service', 'DIESE', 'UB', Pole='Pilotage')
    structure('VP Recherche', 'Vice-présidence recherche', 'Direction', None, 'UB', Pole='Recherche')
    structure('VP Innovation', 'Vice-présidence innovation', 'Direction', None, 'UB', Pole='Pilotage')
    structure('DR Gestion', 'Délégation régionale – gestion des fonds', 'Service Hors UB', None, 'CNRS', Pole='Pilotage')
    structure('LMTC', 'Laboratoire matériaux et transitions climatiques', 'Labo', 'VP Recherche', 'UB',
              Co_tutuelle_1_Principale=E['CNRS'], N_='UMR 0001', Label='UMR', Pole='Recherche')
    structure('IBN', 'Institut de biologie numérique', 'Labo', 'VP Recherche', 'UB',
              Co_tutuelle_1_Principale=E['Inserm'], N_='UMR 0002', Label='UMR', Pole='Recherche')
    structure('LISA', "Laboratoire d'informatique et systèmes autonomes", 'Labo', 'VP Recherche', 'UB',
              N_='EA 0003', Label='EA', Pole='Recherche')
    structure('CREO', "Centre de recherche en électronique organique", 'Labo', 'VP Recherche', 'UB',
              Co_tutuelle_1_Principale=E['CNRS'], Co_tutuelle_2_principales=E['Bordeaux INP'], N_='UMR 0004', Label='UMR', Pole='Recherche')
    structure('ISSO', 'Institut santé et société', 'Labo', 'VP Recherche', 'UB',
              Co_tutuelle_1_Principale=E['Inserm'], N_='UMR 0005', Label='UMR', Pole='Recherche', ZRR=True)
    structure('LCN', 'Laboratoire de chimie des nanomatériaux', 'Labo', 'VP Recherche', 'UB',
              Co_tutuelle_1_Principale=E['CNRS'], Tutuelle_Secondaire_1=E['INRAE'], N_='UMR 0006', Label='UMR', Pole='Recherche', Carnot=True)
    structure('Dir Bordeaux INP', "Direction de Bordeaux INP", 'Direction', None, 'Bordeaux INP', Pole='Formation')

    # ------------------------------------------------------------------ Postes et annuaire (un poste par personne)
    PEOPLE = [
        # clé, prénom, NOM, intitulé du poste, précisions, structure, employeur, type de poste, grade
        ('Camille', 'Camille', 'Marchand', 'Professeure des universités', 'Chimie des matériaux', 'LMTC', 'UB', 'Enseignant-chercheur', 'Agent'),
        ('Julien', 'Julien', 'Roche', 'Directeur de recherche', 'Neurosciences', 'IBN', 'Inserm', 'Chercheur', 'Agent'),
        ('Sofia', 'Sofia', 'Benali', 'Maîtresse de conférences', 'Systèmes autonomes', 'LISA', 'UB', 'Enseignant-chercheur', 'Agent'),
        ('Thomas', 'Thomas', 'Lefèvre', 'Chargé de recherche', 'Photonique', 'CREO', 'CNRS', 'Chercheur', 'Agent'),
        ('Ines', 'Inès', 'Moreau', 'Professeure des universités', 'Santé publique', 'ISSO', 'UB', 'Enseignant-chercheur', 'Agent'),
        ('Karim', 'Karim', 'Haddad', 'Directeur de recherche', 'Nanomatériaux', 'LCN', 'CNRS', 'Chercheur', 'Agent'),
        ('Elise', 'Élise', 'Fontaine', 'Gestionnaire notifications', '', 'Service Dev_Valo', 'UB', 'Administratif', 'Agent'),
        ('Mathieu', 'Mathieu', 'Garnier', 'Chargé de mission conventions', '', 'Service Dev_Valo', 'UB', 'Administratif', 'Agent'),
        ('Nadia', 'Nadia', 'Perrin', 'Responsable grands programmes', '', 'Grands Programmes', 'UB', 'Direction', 'Direction service'),
        ('Hugo', 'Hugo', 'Delmas', 'Gestionnaire financier', 'Installation des fonds', 'DR Gestion', 'CNRS', 'Administratif', 'Agent'),
        ('Claire', 'Claire', 'Vasseur', 'Vice-présidente recherche', '', 'VP Recherche', 'UB', 'Direction', 'VP'),
        ('Olivier', 'Olivier', 'Brun', 'Vice-président innovation', '', 'VP Innovation', 'UB', 'Direction', 'VP'),
        ('Laurence', 'Laurence', 'Giraud', 'Directrice', "Établissement", 'Dir Bordeaux INP', 'Bordeaux INP', 'Direction', 'Directeur.trice etablissement'),
        ('Paul', 'Paul', 'Navarro', "Chargé d'accompagnement de l'innovation", '', 'DIESE', 'UB', 'Administratif', 'Agent'),
        ('Maelle', 'Maëlle', 'Chevrier', 'Gestionnaire OPE', '', 'DIESE', 'UB', 'Administratif', 'Agent'),
        ('Samuel', 'Samuel', 'Aubert', 'Maître de conférences', 'Matériaux', 'LMTC', 'UB', 'Enseignant-chercheur', 'Agent'),
        ('Lea', 'Léa', 'Girard', "Chargée d'accompagnement de l'innovation", '', 'DIESE', 'UB', 'Administratif', 'Agent'),
    ]
    PO, A = {}, {}
    for n, (key, prenom, nom, titre, prec, struct, employeur, tpe, grade) in enumerate(PEOPLE, 1):
        PO[key] = S.add('Postes2', Titre=titre, Precisions_Poste=prec, Structure2=ST[struct], Employeur_tutelle=E[employeur],
                        type_de_contrat='Titulaire' if tpe in ('Enseignant-chercheur', 'Chercheur') else 'CDI', Type_de_poste=tpe,
                        Categorie='A', grade=grade)
    for n, (key, prenom, nom, titre, prec, struct, employeur, tpe, grade) in enumerate(PEOPLE, 1):
        accompagnateur = key in ('Paul', 'Lea')
        A[key] = S.add('Annuaire', NOM=nom, Prenom=prenom, Email='%s.%s@demo-innovations.example' % (_ascii(prenom), _ascii(nom)),
                       Telephone='+33 5 00 00 00 %02d' % n, Poste2=PO[key],
                       Type=['Gestionnaire'] if struct in ('Service Dev_Valo', 'Grands Programmes', 'DR Gestion') else
                            (['Direction'] if tpe == 'Direction' else (['Accompagnement'] if accompagnateur else ['Porteur'])),
                       Accompagnateur_de_l_innovation_=accompagnateur)
    S.set('Etablissements', E['Bordeaux INP'], Responsable_legal_de_la_structure=A['Laurence'])
    S.set('Etablissements', E['UB'], Responsable_legal_de_la_structure=A['Olivier'])
    S.set('Annuaire', A['Camille'], email_Assitant_e_le_cas_echeant=A['Lea'])

    # ------------------------------------------------------------------ Programmes
    PG = {}
    for key, ax, gp, actions in [
        ('Prématuration', 'Axe 1 · Détecter et maturer', 'InnovationS', ['Prématuration']),
        ('Maturation', 'Axe 1 · Détecter et maturer', 'InnovationS', ['Maturation']),
        ('Preuve de concept', 'Axe 2 · Valider et protéger', 'InnovationS', ['Preuve de concept']),
        ('Ingénierie de projet', 'Axe 2 · Valider et protéger', 'France 2030 – Transfert', ['Ingénierie']),
        ('MyPhD+', 'Axe 3 · Accompagner les talents', 'France 2030 – Transfert', ['Formation']),
    ]:
        PG[key] = S.add('Programmes', Programme=key, Grands_Programmes=GP[gp], Responsable=A['Nadia'],
                        Axe_InnovationS=ax, Actions_InnovationS=actions)

    # ------------------------------------------------------------------ Lieux, instances, composition
    LX = {name: S.add('Lieux', Nom=name, Capacite=cap, Adresse=adr) for name, cap, adr in [
        ('Salle du Conseil – bât. A', 24, 'Campus de démonstration, bât. A'),
        ('Salle 204 – Pôle innovation', 12, 'Campus de démonstration, bât. C'),
        ('Amphi Pasteur', 120, 'Campus de démonstration, bât. B')]}

    IN = {}
    IN['CTO'] = S.add('Instances', Instances='CTO Innovation', Heure_debut='09:00', Duree_min=105,
                      Relecteurs_CR=[A['Nadia'], A['Paul']], Invites_permanents=[A['Claire'], A['Olivier']],
                      Modele_invitation='Invitation CTO', Modele_CR='Compte rendu CTO')
    IN['COMITE'] = S.add('Instances', Instances='Comité innovation', Heure_debut='14:00', Duree_min=180,
                         Relecteurs_CR=[A['Nadia']], Invites_permanents=[A['Claire'], A['Olivier'], A['Laurence']],
                         Modele_invitation="Invitation Comité", Modele_CR='Compte rendu Comité')
    for inst, members in [('CTO', [('Claire', 'VP recherche'), ('Olivier', 'VP innovation'), ('Nadia', 'Grands programmes'), ('Paul', 'Accompagnement')]),
                          ('COMITE', [('Claire', 'VP recherche'), ('Olivier', 'VP innovation'), ('Laurence', 'Directrice Bordeaux INP'), ('Nadia', 'Grands programmes')])]:
        for who, fonction in members:
            S.add('Composition_instances', Instance=IN[inst], Personne=A[who], Fonction=fonction)

    # ------------------------------------------------------------------ Séances
    SE = {}
    for key, inst, num, off, salle, heure in [
        ('cto12', 'CTO', '12', -54, 'Salle du Conseil – bât. A', (10, 45)),
        ('cto13', 'CTO', '13', -26, 'Salle du Conseil – bât. A', None),
        ('cto14', 'CTO', '14', 3, 'Salle du Conseil – bât. A', (9, 0)),
        ('cto15', 'CTO', '15', 31, 'Salle 204 – Pôle innovation', None),
        ('com4', 'COMITE', '4', -33, 'Amphi Pasteur', None),
        ('com5', 'COMITE', '5', 10, 'Amphi Pasteur', None),
    ]:
        d = weekday(off)
        row = dict(Instance=IN[inst], Numero=num, date=d, Salle=LX[salle])
        if heure:
            row['Heure'] = paris(d, *heure)
        SE[key] = S.add('Suivi_Instance', **row)
    DEC = {}
    for key, num, text_ in [('cto12', 'CTO-2026-12/01', 'Avis favorable à la poursuite de HYDROGEN-LAB, sous réserve du budget 2027.'),
                            ('cto13', 'CTO-2026-13/01', "Avis favorable pour ECOPACK et LEXIA ; reprendre la propriété intellectuelle de LEXIA."),
                            ('com4', 'COM-2026-04/01', 'Validation du calendrier 2027 des appels.')]:
        DEC[key] = S.add('Suivi_Descisions_Instances', Numero=num, Edition_de_l_instance=SE[key], Decision=text_)

    # ------------------------------------------------------------------ Lignes OPE
    OPE = {}
    for key, n_ope, chez, cp in [
        ('biosensor', '', 'DIESE', 0), ('cardiowear', '26-0412', 'DIESE', 0), ('forestscan', '25-0388', None, 0),
        ('archidata', '33-2210', 'DR Gestion', 0), ('smartgrid', '25-0151', 'DIESE', 61400), ('ceramix', '25-0170', 'DIESE', 38250),
        ('pharmachip', '26-0099', 'DR Gestion', 22800), ('myphd', '26-0120', 'DIESE', 15600), ('oldproj', '23-0044', 'DIESE', 118000),
        ('reliquat', '24-0207', 'DIESE', 94200), ('aeroflow', '', 'DR Gestion', 0)]:
        OPE[key] = S.add('Lignes_OPE', N_OPE=n_ope, installe_chez=ST[chez] if chez else 0, totalCPConsomme=cp)

    # ------------------------------------------------------------------ Projets
    P, NOTIF = {}, {}
    NS = ['1) Information projet saisies', '2) Notification_relecture', '3) Prette pour CTO', '4) complète',
          '5) envoyée pour signature VP', '6) Signée', '7) Transmise au porteur', '8) Archivee']
    C1, C2, C3, C4 = ['1) Convention en redaction', '2) Convention en relecture', '3) Convention en signature',
                      '4) Convention signée de toutes les parties']

    def ronde(x):
        return int(round(x / 100.0)) * 100

    def project(acr, titre, prog, porteur, *, notif=None, start=0, months=24, inst=None, bud=(0, 0, 0), desc='',
                statut='En attente des dispo des fonds', fin=None, typ='Projet', vp='Claire', p2=None, p3=None, **extra):
        f, i, p = bud
        row = dict(
            Acronyme=acr, Projet=titre, Programme=PG[prog], Porteur_1=A[porteur], Porteur_2=A[p2] if p2 else 0,
            Porteur_3=A[p3] if p3 else 0, VP_porteur_signataire_notif=A[vp], Accompagnateur=A['Paul' if len(P) % 2 == 0 else 'Lea'],
            Date_debut_Projet=day(start), Date_de_fin_Projet=day(start + int(months * 30.4)),
            Date_limite_financement=day(start + int(months * 30.4) + 90),
            Type_projet=typ, Statut_operationnel_projet=statut, Description_rapide_projet=desc,
            Instance_ratachee=SE[inst] if inst else 0, Statut_Financier=fin or '',
            Details_depense_s_Fonctionnement='Depenses de fonctionnement', Details_depense_s_Investissement="Dépenses d'investissement",
            Details_depense_s_Personnel='Depenses de personnel', Action_Ligne_OPE_a_faire='à determiner',
            c2026_M10_Fonctionnement=f, c2026_M20_Investissement=i, c2026_M30_Personnel=p,
            c2027_M10_Fonctionnement=f, c2027_M20_Investissement=ronde(i / 2), c2027_M30_Personnel=p,
            c2028_M10_Fonctionnement=ronde(f / 2), c2028_M20_Investissement=0, c2028_M30_Personnel=ronde(p / 2),
        )
        row.update(extra)
        P[acr] = S.add('Projets', **row)
        if notif is not None:
            NOTIF[acr] = S.add('Notifications', Projet=P[acr], notifications_Statut=NS[notif])
        return P[acr]

    # -- Instruction (aucune notification, ou étapes 1 à 3)
    project('NEUROSCAN', 'Imagerie fonctionnelle portable pour le suivi post-AVC', 'Maturation', 'Julien', start=120, inst='cto15',
            bud=(42000, 31000, 60000), desc="Casque d'imagerie portable pour suivre la récupération après un AVC.",
            vp='Olivier', comentaire_general_Suivi_projet='Dossier déposé, aucune notification encore ouverte.')
    project('BIOFILM+', 'Revêtements antibactériens biosourcés', 'Prématuration', 'Karim', notif=0, start=75, inst='com5',
            bud=(18000, 12000, 0), desc='Revêtements à base de chitosane pour surfaces hospitalières.', vp='Claire')
    project('SOLARCITY', 'Cartographie solaire urbaine par apprentissage', 'Preuve de concept', 'Sofia', notif=1, start=50, inst='cto15',
            bud=(25000, 8000, 45000), desc="Estimer le potentiel solaire des toitures d'une ville à partir d'images aériennes.")
    project('AGRIDRONE', 'Pulvérisation de précision par drone', 'Maturation', 'Camille', notif=1, start=30, inst='com5', p2='Samuel',
            bud=(36000, 52000, 30000), desc="Réduire les intrants de 30 % grâce à une pulvérisation ciblée.")
    project('MEDIPATCH', 'Patch intelligent de suivi glycémique', 'Maturation', 'Ines', notif=2, start=40, inst='cto14',
            bud=(54000, 38000, 72000), desc='Patch cutané et application mobile pour le suivi du diabète.', vp='Olivier')
    project('QUANTSENS', 'Capteurs quantiques compacts', 'Preuve de concept', 'Thomas', notif=2, start=95, inst='cto14',
            bud=(30000, 66000, 40000), desc="Magnétomètre à centres NV de la taille d'une carte de crédit.")

    # -- Notifications (4 à 7)
    project('ECOPACK', 'Emballages compostables à base d\'algues', 'Prématuration', 'Camille', notif=3, start=5, inst='cto13',
            bud=(22000, 9000, 38000), desc='Films alimentaires compostables à partir de macro-algues.', p2='Samuel',
            comentaire_general_Suivi_projet='Notification complète, en attente du signalement au VP.')
    project('LEXIA', 'Assistant juridique pour contrats de licence', 'Preuve de concept', 'Sofia', notif=4, start=14, inst='cto13',
            bud=(28000, 12000, 51000), desc='Aide à la relecture de contrats de licence logicielle.', vp='Olivier')
    project('HYDROGEN-LAB', 'Électrolyseur à membrane bas coût', 'Maturation', 'Karim', notif=5, start=45, inst='cto12',
            bud=(48000, 76000, 35000), desc='Membrane céramique réduisant le coût de production de l\'hydrogène.')
    project('VINOTRACE', 'Traçabilité moléculaire des vins', 'Prématuration', 'Camille', notif=6, start=20, inst='cto12',
            bud=(15000, 11000, 0), desc="Marqueurs moléculaires pour authentifier l'origine d'un vin.",
            comentaire_general_Suivi_projet="Notification transmise au porteur (étape 7) : le projet n'est dans aucune colonne du Kanban, mais reste visible dans la page Administratif.")

    # -- Conventions
    conv = dict(Convention_de_reversement=True)
    project('NANOCAT', 'Catalyseurs nanostructurés', 'Maturation', 'Karim', notif=7, start=28, inst='cto12',
            bud=(40000, 35000, 28000), desc='Catalyseurs à base de nickel pour la chimie verte.',
            Conventions_statut=C1, convention_statut_UB='Non relu', convention_statut_partenaire_1='Non relu',
            Partenaire_s_convention_reversement=[E['Bordeaux INP']], Convention_montant_partenaire_1=12000,
            Montant_convention_reversement_M10=9000, Montant_Convention_Reversement_M20=3000,
            next_step='Rédiger le premier jet de la convention', next_step_responsable=[A['Mathieu']],
            convention_Date_derniere_modification=day(-4), **conv)
    project('OPTILINK', 'Liaisons optiques intra-puce', 'Maturation', 'Thomas', notif=7, start=10, inst='cto13',
            bud=(60000, 45000, 52000), desc='Guides optiques pour relier des puces sans fil de cuivre.',
            Conventions_statut=C2, convention_statut_UB='Relu', convention_statut_partenaire_1='Relu',
            Partenaire_s_convention_reversement=[E['CNRS']], Convention_montant_partenaire_1=25000,
            Montant_convention_reversement_M10=18000, Montant_Convention_Reversement_M20=7000,
            convention_UB_v1_le=day(-9), convention_UB_relu_le=day(-3),
            next_step="Retour du CNRS sur l'article 4 (propriété intellectuelle)", next_step_responsable=[A['Mathieu'], A['Nadia']],
            convention_Date_derniere_modification=day(-3), Lien_convention='https://example.org/demo/convention-optilink', **conv)
    project('GENOMEDIA', 'Plateforme de génomique ciblée', 'Maturation', 'Julien', notif=7, start=45, inst='com4',
            bud=(70000, 82000, 66000), desc='Séquençage ciblé pour le diagnostic de maladies rares.', vp='Olivier',
            Conventions_statut=C3, convention_statut_UB='en cours de signature', convention_statut_partenaire_1='Signé',
            convention_statut_partenaire_2='en cours de signature',
            Partenaire_s_convention_reversement=[E['Inserm'], E['CHU Bordeaux']], Convention_montant_partenaire_1=30000,
            Convention_montant_partenaire_2=18000, Montant_convention_reversement_M10=36000, Montant_Convention_Reversement_M20=12000,
            convention_UB_visa_le=day(-12), convention_UB_parapheur_le=day(-6),
            next_step='Signature du CHU en attente', next_step_responsable=[A['Elise']],
            convention_Date_derniere_modification=day(-6), **conv)
    project('TERRALAB', 'Capteurs de sol connectés', 'Prématuration', 'Sofia', notif=7, start=90, inst='com4',
            bud=(52000, 48000, 20000), desc='Réseau de capteurs bas coût pour piloter la fertilisation.',
            Conventions_statut=C3, convention_statut_UB='Signé', convention_statut_partenaire_1='en cours de signature',
            Partenaire_s_convention_reversement=[E['INRAE']], Convention_montant_partenaire_1=35000,
            Montant_convention_reversement_M10=30000, Montant_Convention_Reversement_M20=5000,
            next_step='Relancer INRAE pour la signature', next_step_responsable=[A['Mathieu']],
            convention_Date_derniere_modification=day(-2), **conv)
    project('SOCIOCARE', 'Parcours de soins coordonnés', 'Ingénierie de projet', 'Ines', notif=7, start=-6, inst='cto13', typ='Ingenierie_creation',
            bud=(20000, 0, 48000), desc='Outil de coordination entre médecins de ville et hôpital.',
            Conventions_statut=C1, convention_statut_UB='Non relu', convention_statut_partenaire_1='Non relu',
            Partenaire_s_convention_reversement=[E['Inserm']], Convention_montant_partenaire_1=9000,
            Montant_convention_reversement_M10=9000, next_step='Premier jet à rédiger (démarrage imminent)',
            next_step_responsable=[A['Mathieu'], A['Elise']], convention_Date_derniere_modification=day(-10), **conv)
    project('AEROFLOW', 'Simulation aéroacoustique', 'Maturation', 'Thomas', notif=7, start=35, inst='cto12',
            bud=(33000, 40000, 25000), desc='Simulation du bruit aérodynamique de pales de drones.', fin='Finance_Ouverture demandée à la DF',
            Conventions_statut=C4, convention_statut_UB='Signé', convention_statut_partenaire_1='Signé',
            Partenaire_s_convention_reversement=[E['Bordeaux INP']], Convention_montant_partenaire_1=14000,
            Montant_convention_reversement_M10=11000, Montant_Convention_Reversement_M20=3000,
            Transmise_signee_au_porteur_le=day(-4), convention_Date_derniere_modification=day(-4),
            next_step='Convention signée : aucune action', Ligne_OPE=[OPE['aeroflow']],
            Action_Ligne_OPE_a_faire='Creation de ligne', Jalon_installation_fonds='2) En attente DF (ou OPE sur UBInvest)', **conv)

    # -- Installation des fonds
    project('PHOTOVOLT', 'Cellules pérovskites stables', 'Maturation', 'Thomas', notif=7, start=40, inst='cto12',
            bud=(38000, 58000, 30000), desc='Cellules solaires pérovskites avec 10 ans de durée de vie.',
            fin='Finance_En Attente Gestionnaire', Action_Ligne_OPE_a_faire='Creation de ligne',
            Commentaire_ligne_OPE='Ligne à créer dès réception des pièces du porteur.')
    project('BIOSENSOR', 'Biocapteurs jetables', 'Prématuration', 'Julien', notif=7, start=60, inst='com4',
            bud=(20000, 17000, 36000), desc='Bandelettes jetables pour doser un marqueur sanguin.', vp='Olivier',
            fin='Finance_Ouverture demandée à la DF', Ligne_OPE=[OPE['biosensor']], Action_Ligne_OPE_a_faire='Creation de ligne',
            Jalon_installation_fonds='2) En attente DF (ou OPE sur UBInvest)')
    project('CARDIOWEAR', 'Textile connecté ECG', 'Preuve de concept', 'Ines', notif=7, start=55, inst='com4',
            bud=(26000, 30000, 44000), desc="Chemise connectée pour l'électrocardiogramme au quotidien.",
            fin='Finance_Fonds installés', Ligne_OPE=[OPE['cardiowear']], Action_Ligne_OPE_a_faire='Creation de ligne',
            Jalon_installation_fonds='3) OPE disponible UB Invest')
    project('FORESTSCAN', 'Inventaire forestier par LiDAR', 'Maturation', 'Camille', notif=7, start=48, inst='com4', typ='prolongation',
            bud=(31000, 27000, 33000), desc='Inventaire des forêts par scan laser aéroporté.',
            fin='Finance_Fonds installés', Ligne_OPE=[OPE['forestscan']], Action_Ligne_OPE_a_faire='Prolongation de ligne',
            Jalon_installation_fonds='3) OPE disponible UB Invest', prolongation_DateCTOInitial=day(-400),
            Commentaire_ligne_OPE="Structure d'installation à préciser (numéro reçu, structure manquante).")
    project('ARCHIDATA', 'Archivage de données moléculaires', 'Maturation', 'Julien', notif=7, start=66, inst='cto13',
            bud=(24000, 52000, 18000), desc='Stockage longue durée de données de séquençage.', typ='reattribution',
            fin='Finance_Ouverture demandée à la DF', Ligne_OPE=[OPE['archidata']], Action_Ligne_OPE_a_faire='re-Abondement de ligne',
            Jalon_installation_fonds='2) En attente DF (ou OPE sur UBInvest)')

    # -- Projets en cours / terminés (Statut_Macro = statut opérationnel)
    project('SMARTGRID', 'Pilotage de réseaux électriques locaux', 'Maturation', 'Sofia', notif=7, start=-220, inst='cto12', typ='prolongation',
            bud=(46000, 33000, 58000), statut='en cours', fin='Finance_Fonds installés', desc="Pilotage d'un réseau de quartier avec stockage.",
            Ligne_OPE=[OPE['smartgrid']], Action_Ligne_OPE_a_faire='Prolongation de ligne', Jalon_installation_fonds='4) Projet en cours',
            c2025_M10_Fonctionnement=20000, c2025_M30_Personnel=25000)
    project('CERAMIX', 'Céramiques haute température', 'Maturation', 'Karim', notif=7, start=-260, inst='cto12',
            bud=(40000, 60000, 40000), statut='En retard', fin='Finance_Fonds installés', desc='Céramiques pour échangeurs thermiques à 1 200 °C.',
            Ligne_OPE=[OPE['ceramix']], Action_Ligne_OPE_a_faire='Creation de ligne', Jalon_installation_fonds='4) Projet en cours',
            comentaire_general_Suivi_projet='Retard de livraison du four ; décalage de 3 mois accepté.',
            c2025_M10_Fonctionnement=15000, c2025_M20_Investissement=30000)
    project('PHARMACHIP', 'Laboratoire sur puce', 'Prématuration', 'Ines', notif=7, start=-180, inst='com4',
            bud=(35000, 40000, 22000), statut='en cours', fin='Finance_Fonds installés', desc='Tests pharmacologiques sur micro-puce fluidique.',
            Conventions_statut=C4, convention_statut_UB='Signé', convention_statut_partenaire_1='Signé',
            Partenaire_s_convention_reversement=[E['CNRS']], Convention_montant_partenaire_1=20000,
            Montant_convention_reversement_M10=15000, Montant_Convention_Reversement_M20=5000,
            Transmise_signee_au_porteur_le=day(-120), Ligne_OPE=[OPE['pharmachip']], Action_Ligne_OPE_a_faire='Creation de ligne',
            Jalon_installation_fonds='4) Projet en cours', **conv)
    project('MYPHD-AI', "MyPhD+ : thèse IA et santé", 'MyPhD+', 'Sofia', notif=7, start=-60, inst='com4', typ='myphd+',
            bud=(8000, 0, 52000), statut='en cours', fin='Finance_Fonds installés', desc='Contrat doctoral sur le diagnostic assisté par IA.',
            Ligne_OPE=[OPE['myphd']], Action_Ligne_OPE_a_faire='Creation de ligne', Jalon_installation_fonds='4) Projet en cours')
    project('OLDPROJ', 'Capteurs historiques', 'Maturation', 'Camille', notif=7, start=-900, months=30, typ='Projet',
            bud=(0, 0, 0), statut='Cloturé et reliquat traités', fin='Finance_Fonds installés', desc="Projet clos, conservé pour l'historique.",
            Ligne_OPE=[OPE['oldproj']], Action_Ligne_OPE_a_faire='Creation de ligne', Jalon_installation_fonds='6) Projet clôturé (reliquat inclus)',
            c2023_M10_Fonctionnement=40000, c2023_M20_Investissement=55000, c2023_M30_Personnel=30000,
            c2024_M10_Fonctionnement=35000, c2024_M30_Personnel=30000, c2025_M10_Fonctionnement=10000, c2025_M30_Personnel=12000)
    project('RELIQUAT', "Banc d'essai mécanique", 'Maturation', 'Samuel', notif=7, start=-640, months=24, typ='Projet',
            bud=(0, 0, 0), statut='cloturé avec Reliquat à traiter', fin='Finance_Fonds installés', desc="Reste un reliquat à rembourser ou à réaffecter.",
            Ligne_OPE=[OPE['reliquat']], Action_Ligne_OPE_a_faire='Creation de ligne', Jalon_installation_fonds='5) Reliquats à traiter',
            c2024_M10_Fonctionnement=30000, c2024_M20_Investissement=46000, c2024_M30_Personnel=20000,
            c2025_M10_Fonctionnement=18000, c2025_M30_Personnel=15000, comentaire_general_Suivi_projet='Reliquat de 5 800 € à traiter avec la DF.')

    S.set('Projets', P['HYDROGEN-LAB'], numero_decision=DEC['cto12'])
    S.set('Projets', P['ECOPACK'], numero_decision=DEC['cto13'])
    S.set('Projets', P['LEXIA'], numero_decision=DEC['cto13'])

    # ------------------------------------------------------------------ Instances : séances (invités, ordre du jour…)
    def invite(seance, who, origine, reponse='', appel='', ecrit=None, passage=None, heure='', dispo_de='', dispo_a='', commentaire=''):
        return S.add('Instance_Invites', Seance=SE[seance], Personne=A[who], Origine=origine, Reponse=reponse, Appel=appel,
                     Ecrit_le=ecrit, Passage_envoye_le=passage, Passage_envoye_heure=heure, Dispo_de=dispo_de, Dispo_a=dispo_a,
                     Commentaire=commentaire)

    def point(seance, ordre, titre, nature, duree, projets=(), presentateurs=(), invites=(), parent=0, **kw):
        return S.add('Instance_Points', Seance=SE[seance], Ordre=ordre, Titre=titre, Nature=nature, Duree_min=duree,
                     Projets=[P[a] for a in projets], Presentateurs=[A[w] for w in presentateurs], Invites=list(invites),
                     Parent=parent, **kw)

    PERM, PTS = 'Liste permanente', 'Ajouté sur un point'
    VIENDRA, ATT, EXC = 'Viendra', 'À confirmer', 'Excusé(e)'

    # CTO #12 : séance terminée, toutes les étapes validées
    for who, rep, appel in [('Claire', VIENDRA, 'Présent(e)'), ('Olivier', VIENDRA, 'Présent(e)'), ('Nadia', VIENDRA, 'Présent(e)'), ('Paul', VIENDRA, 'Présent(e)')]:
        invite('cto12', who, PERM, rep, appel, ecrit=day(-62))
    i_karim = invite('cto12', 'Karim', PTS, VIENDRA, 'Présent(e)', ecrit=day(-60), passage=day(-56), heure='10:55')
    p1 = point('cto12', 1, 'HYDROGEN-LAB — avis sur la poursuite', 'Validation', 20, ['HYDROGEN-LAB'], ['Karim'], [i_karim])
    point('cto12', 2, 'NANOCAT et AEROFLOW — instruction', 'Validation', 30, ['NANOCAT', 'AEROFLOW'], ['Thomas'])
    point('cto12', 3, 'Point sur les lignes OPE', 'Information', 15, [], ['Paul'])
    S.set('Suivi_Instance', SE['cto12'], Mail_invitation_le=day(-62), CR_V0_le=day(-52), CR_V0_par=A['Paul'], Mail_CR_le=day(-48))
    for who in ('Nadia', 'Paul'):
        S.add('Instance_Relectures', Seance=SE['cto12'], Personne=A[who], Statut='Validée', Relu_le=day(-50))
    for etape, off in [('Ordre du jour', -64), ('Invités', -63), ('Compte rendu', -50)]:
        S.add('Instance_Validations', Seance=SE['cto12'], Etape=etape, Date=day(off), Par=A['Paul'])

    # CTO #13 : séance passée, compte rendu en relecture
    for who, rep, appel in [('Claire', VIENDRA, 'Présent(e)'), ('Olivier', EXC, 'Absent(e)'), ('Nadia', VIENDRA, 'Présent(e)'), ('Paul', VIENDRA, 'Présent(e)')]:
        invite('cto13', who, PERM, rep, appel, ecrit=day(-34))
    i_camille = invite('cto13', 'Camille', PTS, VIENDRA, 'Présent(e)', ecrit=day(-33), passage=day(-30), heure='10:00')
    i_sofia = invite('cto13', 'Sofia', PTS, VIENDRA, 'Présent(e)', ecrit=day(-33), passage=day(-30), heure='10:30')
    point('cto13', 1, "ECOPACK — notification", 'Validation', 15, ['ECOPACK'], ['Camille'], [i_camille])
    point('cto13', 2, 'LEXIA — notification', 'Validation', 15, ['LEXIA'], ['Sofia'], [i_sofia])
    point('cto13', 3, 'OPTILINK et SOCIOCARE — conventions', 'Discussion', 25, ['OPTILINK', 'SOCIOCARE'], ['Paul'])
    point('cto13', 4, 'Questions diverses', 'Information', 10)
    S.set('Suivi_Instance', SE['cto13'], Mail_invitation_le=day(-34), CR_V0_le=day(-22), CR_V0_par=A['Paul'])
    S.add('Instance_Relectures', Seance=SE['cto13'], Personne=A['Nadia'], Statut='Validée', Relu_le=day(-20))
    S.add('Instance_Relectures', Seance=SE['cto13'], Personne=A['Paul'], Statut='Modifs demandées', Relu_le=day(-19))
    S.add('Instance_Validations', Seance=SE['cto13'], Etape='Ordre du jour', Date=day(-35), Par=A['Paul'])
    S.add('Instance_Validations', Seance=SE['cto13'], Etape='Invités', Date=day(-31), Par=A['Paul'])

    # CTO #14 : prochaine séance (c'est la séance à montrer pendant la démo)
    for who, rep in [('Claire', VIENDRA), ('Olivier', ATT), ('Nadia', VIENDRA), ('Paul', VIENDRA)]:
        extra = dict(dispo_de='10:00') if who == 'Olivier' else {}
        S_inv = invite('cto14', who, PERM, rep, ecrit=day(-5), **extra)
        if who == 'Olivier':
            i_olivier = S_inv
    i_ines = invite('cto14', 'Ines', PTS, VIENDRA, ecrit=day(-2), passage=day(-1), heure='09:00')
    i_thomas = invite('cto14', 'Thomas', PTS, ATT, ecrit=day(-2))
    i_olivier_pt = i_olivier
    p_a = point('cto14', 1, 'MEDIPATCH — notification (avis du CTO)', 'Validation', 15, ['MEDIPATCH'], ['Ines'], [i_ines],
                Lien_type='Lien externe', Lien='https://example.org/demo/medipatch-dossier')
    p_b = point('cto14', 2, 'QUANTSENS — preuve de concept', 'Validation', 15, ['QUANTSENS'], ['Thomas'], [i_thomas])
    p_c = point('cto14', 3, 'Point d\'étape du programme Prématuration', 'Discussion', 20, [], ['Nadia'], [i_olivier_pt])
    point('cto14', 1, 'Calendrier des appels 2027', 'Discussion', 10, [], ['Nadia'], parent=p_c)
    point('cto14', 2, 'Budget consommé 2026', 'Information', 10, [], ['Paul'], parent=p_c)
    point('cto14', 4, 'Bilan des projets en cours (SMARTGRID, CERAMIX)', 'Information', 15, ['SMARTGRID', 'CERAMIX'], ['Paul'])
    point('cto14', 5, 'Questions diverses', 'Information', 10)
    S.add('Instance_Validations', Seance=SE['cto14'], Etape='Ordre du jour', Date=day(-3), Par=A['Paul'])

    # CTO #15 : séance à venir, vide (point de départ)
    for who in ('Claire', 'Olivier'):
        invite('cto15', who, PERM, ATT)

    # Comité innovation #4 (passée) et #5 (à venir)
    for who, rep, appel in [('Claire', VIENDRA, 'Présent(e)'), ('Olivier', VIENDRA, 'Présent(e)'), ('Laurence', VIENDRA, 'Présent(e)')]:
        invite('com4', who, PERM, rep, appel, ecrit=day(-40))
    point('com4', 1, 'GENOMEDIA et TERRALAB — instruction', 'Validation', 40, ['GENOMEDIA', 'TERRALAB'], ['Julien', 'Sofia'])
    point('com4', 2, 'Calendrier 2027 des appels', 'Validation', 30, [], ['Nadia'])
    point('com4', 3, 'Bilan à mi-parcours', 'Information', 30, ['PHARMACHIP', 'MYPHD-AI'], ['Ines'])
    S.set('Suivi_Instance', SE['com4'], Mail_invitation_le=day(-40), CR_V0_le=day(-28), CR_V0_par=A['Nadia'])
    S.add('Instance_Relectures', Seance=SE['com4'], Personne=A['Nadia'], Statut='Validée', Relu_le=day(-27))
    for etape, off in [('Ordre du jour', -41), ('Invités', -38), ('Compte rendu', -27)]:
        S.add('Instance_Validations', Seance=SE['com4'], Etape=etape, Date=day(off), Par=A['Nadia'])
    for who in ('Claire', 'Olivier', 'Laurence'):
        invite('com5', who, PERM, ATT if who != 'Claire' else VIENDRA, ecrit=day(-3))
    point('com5', 1, 'AGRIDRONE — premier examen', 'Discussion', 30, ['AGRIDRONE'], ['Camille'])
    point('com5', 2, 'Retour sur le plan de communication', 'Information', 20, [], ['Lea'])

    # Mise à disposition du VP : une ligne déjà faite (LEXIA), une à faire (ECOPACK)
    S.add('Export_VP', Seance=SE['cto13'], Projet=P['LEXIA'], A_envoyer=True, Mis_a_dispo_le=day(-18), Mis_a_dispo_par=A['Nadia'])
    S.add('Export_VP', Seance=SE['cto13'], Projet=P['ECOPACK'], A_envoyer=True)
    return S.t
