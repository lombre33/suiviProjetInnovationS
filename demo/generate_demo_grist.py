#!/usr/bin/env python3
"""Génère un document Grist de démonstration (.grist) pour le widget « suivi Projet InnovationS ».

    python3 demo/generate_demo_grist.py --out demo/demo-innovations.grist

Rien à installer : seule la bibliothèque standard de Python est utilisée. Un fichier .grist est une base SQLite
(schemaVersion 47) : ce script écrit directement les tables système `_grist_*`, les tables utilisateur typées,
les colonnes d'affichage des références (`gristHelper_Display`), les pages (dont une page « Widget personnalisé »
posée sur `Projets`) et les valeurs déjà calculées des colonnes formule (moteur de formules de `formula_engine.py`).

Options :
    --out FICHIER         fichier .grist à écrire (défaut : demo-innovations.grist)
    --today AAAA-MM-JJ    date de référence des données (défaut : aujourd'hui)
    --widget-url URL      adresse du widget (défaut : celle du site publié du dépôt)
    --no-widget           ne pas créer la page du widget (tables seules)
    --dump-json FICHIER   écrit aussi les tables au format du simulateur de Grist des tests (tests/mock-grist.js)
"""
import argparse
import datetime as dt
import json
import marshal
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import demo_data  # noqa: E402
import demo_schema  # noqa: E402
import formula_engine as fe  # noqa: E402
from grist_meta_ddl import DDL, SCHEMA_VERSION, USER_VERSION  # noqa: E402

DEFAULT_WIDGET_URL = 'https://lombre33.github.io/suiviProjetInnovationS/'
PAGE_TITLE = 'Suivi InnovationS'

SQL_TYPES = {'Bool': 'BOOLEAN', 'Choice': 'TEXT', 'Text': 'TEXT', 'ChoiceList': 'TEXT', 'RefList': 'TEXT', 'Attachments': 'TEXT',
             'Date': 'DATE', 'DateTime': 'DATETIME', 'Int': 'INTEGER', 'Ref': 'INTEGER', 'Numeric': 'NUMERIC'}
SQL_DEFAULTS = {'Bool': '0', 'Choice': "''", 'Text': "''", 'ChoiceList': 'NULL', 'RefList': 'NULL', 'Attachments': 'NULL', 'Date': 'NULL',
                'DateTime': 'NULL', 'Int': '0', 'Ref': '0', 'Numeric': '0', 'Any': 'NULL'}


def sql_type(col_type):
    """Type SQL de la colonne, comme DocStorage._getSqlType : le type complet est examiné (« DateTime:Europe/Paris »
    n'est pas reconnu et tombe sur BLOB, comme dans les fichiers écrits par Grist)."""
    if col_type in SQL_TYPES:
        return SQL_TYPES[col_type]
    if col_type.startswith('Ref:'):
        return 'INTEGER'
    if col_type.startswith('RefList:'):
        return 'TEXT'
    return 'BLOB'


def q(name):
    return '"%s"' % name.replace('"', '""')


def default_sql(col_type):
    return SQL_DEFAULTS[fe.base_type(col_type)]


class HelperCol(demo_schema.Col):
    """Colonne d'affichage d'une référence (créée par Grist quand on choisit la colonne à afficher)."""


def add_display_helpers(tables):
    """Ajoute, pour chaque Ref / RefList qui désigne une colonne à afficher, la colonne `gristHelper_DisplayN`."""
    for table in tables:
        n = 0
        extra = []
        for col in table.cols:
            kind = fe.base_type(col.type)
            if kind in ('Ref', 'RefList') and col.visible:
                n += 1
                helper_id = 'gristHelper_Display' + ('' if n == 1 else str(n))
                helper = HelperCol(helper_id, 'Any', formula='$%s.%s' % (col.id, col.visible))
                col.display_helper = helper
                extra.append(helper)
        table.cols.extend(extra)


def encode_cell(col_type, value):
    """Valeur Python -> valeur stockée dans SQLite, comme DocStorage._encodeValue."""
    kind = fe.base_type(col_type)
    if kind in ('Text', 'Choice'):
        return '' if value is None else str(value)
    if kind in ('Numeric',):
        return 0 if value is None else value
    if kind == 'Int':
        return 0 if value is None else int(value)
    if kind == 'Bool':
        return 1 if value else 0
    if kind == 'Ref':
        return int(value or 0)
    if kind in ('RefList', 'ChoiceList', 'Attachments'):
        if value is None or value == []:
            return None
        return json.dumps(list(value), ensure_ascii=False, separators=(',', ':'))
    if kind == 'Date':
        if value is None:
            return None
        return fe.date_to_epoch(value) if isinstance(value, dt.date) else value
    if kind == 'DateTime':
        return value
    if kind == 'Any':
        if isinstance(value, list):
            return marshal.dumps(value, 2)
        if isinstance(value, dt.date):
            return fe.date_to_epoch(value)
        return value
    raise ValueError('type non géré : %s' % col_type)


class Meta(object):
    """Écrit dans les tables système avec les valeurs par défaut du schéma pour les colonnes non données."""

    def __init__(self, db):
        self.db = db
        self.cols = {}

    def insert(self, table, row):
        if table not in self.cols:
            self.cols[table] = [r[1] for r in self.db.execute('PRAGMA table_info(%s)' % q(table))]
        unknown = set(row) - set(self.cols[table])
        if unknown:
            raise ValueError('%s : colonnes inconnues %s' % (table, sorted(unknown)))
        names = list(row)
        self.db.execute('INSERT INTO %s (%s) VALUES (%s)' % (q(table), ','.join(q(n) for n in names), ','.join('?' * len(names))),
                        [row[n] for n in names])


def generate(out, today, widget_url=DEFAULT_WIDGET_URL, with_widget=True, dump_json=None):
    tables = demo_schema.build_tables()
    add_display_helpers(tables)
    data = demo_data.build(today)
    for table in tables:
        data.setdefault(table.id, {})

    # --- valeurs calculées des colonnes formule --------------------------------------------------
    engine = fe.Engine({t.id: {'cols': t.cols, 'rows': data[t.id]} for t in tables})
    computed = engine.compute_all()

    if os.path.exists(out):
        os.remove(out)
    db = sqlite3.connect(out)
    db.isolation_level = None          # transactions explicites
    db.execute('BEGIN')
    for statement in DDL:
        db.execute(statement)
    meta = Meta(db)

    # --- identifiants des métadonnées -------------------------------------------------------------
    table_ref = {t.id: i for i, t in enumerate(tables, 1)}
    col_ref, next_col = {}, 1
    for t in tables:
        col_ref[(t.id, 'manualSort')] = next_col
        next_col += 1
        for c in t.cols:
            col_ref[(t.id, c.id)] = next_col
            next_col += 1
    raw_section = {t.id: 2 * i - 1 for i, t in enumerate(tables, 1)}
    card_section = {t.id: 2 * i for i, t in enumerate(tables, 1)}
    page_section = 2 * len(tables) + 1

    # --- _grist_DocInfo ---------------------------------------------------------------------------
    meta.insert('_grist_DocInfo', {'id': 1, 'schemaVersion': SCHEMA_VERSION, 'timezone': 'Europe/Paris',
                                   'documentSettings': json.dumps({'locale': 'fr-FR', 'currency': 'EUR'}, separators=(',', ':'))})

    # --- _grist_Tables, _grist_Tables_column ------------------------------------------------------
    for t in tables:
        meta.insert('_grist_Tables', {'id': table_ref[t.id], 'tableId': t.id, 'primaryViewId': 0,
                                      'rawViewSectionRef': raw_section[t.id], 'recordCardViewSectionRef': card_section[t.id]})
        meta.insert('_grist_Tables_column', {'id': col_ref[(t.id, 'manualSort')], 'parentId': table_ref[t.id], 'parentPos': 1.0,
                                             'colId': 'manualSort', 'type': 'ManualSortPos', 'label': 'manualSort'})
        for pos, c in enumerate(t.cols, 2):
            options = c.widget_options()
            if fe.base_type(c.type) == 'Date' and not options:
                options = json.dumps({'dateFormat': 'DD/MM/YYYY', 'isCustomDateFormat': False}, separators=(',', ':'))
            row = {'id': col_ref[(t.id, c.id)], 'parentId': table_ref[t.id], 'parentPos': float(pos), 'colId': c.id,
                   'type': c.type, 'widgetOptions': options, 'isFormula': 1 if c.is_formula else 0, 'formula': c.formula,
                   'label': c.label, 'description': c.description}
            helper = getattr(c, 'display_helper', None)
            if helper is not None:
                target = fe.target_table(c.type)
                row['displayCol'] = col_ref[(t.id, helper.id)]
                row['visibleCol'] = col_ref[(target, c.visible)]
            meta.insert('_grist_Tables_column', row)

    # --- sections de données brutes et fiches ---------------------------------------------------
    field_id = 0

    def add_fields(section_id, table):
        nonlocal field_id
        pos = 0
        for c in table.cols:
            if isinstance(c, HelperCol):
                continue
            pos += 1
            field_id += 1
            meta.insert('_grist_Views_section_field', {'id': field_id, 'parentId': section_id, 'parentPos': float(pos),
                                                       'colRef': col_ref[(table.id, c.id)]})

    for t in tables:
        meta.insert('_grist_Views_section', {'id': raw_section[t.id], 'tableRef': table_ref[t.id], 'parentId': 0,
                                             'parentKey': 'record', 'title': '', 'defaultWidth': 100, 'borderWidth': 1})
        meta.insert('_grist_Views_section', {'id': card_section[t.id], 'tableRef': table_ref[t.id], 'parentId': 0,
                                             'parentKey': 'single', 'title': '', 'defaultWidth': 100, 'borderWidth': 1})
        add_fields(raw_section[t.id], t)
        add_fields(card_section[t.id], t)

    # --- page du widget ---------------------------------------------------------------------------
    if with_widget:
        projets = next(t for t in tables if t.id == 'Projets')
        custom = {'mode': 'url', 'url': widget_url, 'widgetDef': None, 'access': 'full', 'pluginId': '', 'sectionId': '',
                  'renderAfterReady': False}
        options = {'verticalGridlines': True, 'horizontalGridlines': True, 'zebraStripes': False,
                   'customView': json.dumps(custom, separators=(',', ':')), 'numFrozen': 0}
        meta.insert('_grist_Views', {'id': 1, 'name': PAGE_TITLE, 'type': 'empty',
                                     'layoutSpec': json.dumps({'children': [{'leaf': page_section}], 'collapsed': []}, separators=(',', ':'))})
        meta.insert('_grist_Views_section', {'id': page_section, 'tableRef': table_ref['Projets'], 'parentId': 1,
                                             'parentKey': 'custom', 'title': '', 'defaultWidth': 100, 'borderWidth': 1,
                                             'sortColRefs': '[]', 'options': json.dumps(options, separators=(',', ':'))})
        add_fields(page_section, projets)
        meta.insert('_grist_Pages', {'id': 1, 'viewRef': 1, 'pagePos': 1.0, 'indentation': 0})
        meta.insert('_grist_TabBar', {'id': 1, 'viewRef': 1, 'tabPos': 1.0})

    # --- tables utilisateur --------------------------------------------------------------------------
    for t in tables:
        defs = ['id INTEGER PRIMARY KEY', '"manualSort" NUMERIC DEFAULT 1e999']
        for c in t.cols:
            defs.append('%s %s DEFAULT %s' % (q(c.id), sql_type(c.type), default_sql(c.type)))
        db.execute('CREATE TABLE %s (%s)' % (q(t.id), ', '.join(defs)))
        names = ['id', 'manualSort'] + [c.id for c in t.cols]
        insert = 'INSERT INTO %s (%s) VALUES (%s)' % (q(t.id), ','.join(q(n) for n in names), ','.join('?' * len(names)))
        for row_id in sorted(data[t.id]):
            values = [row_id, float(row_id)]
            for c in t.cols:
                if c.is_formula:
                    value = computed[(t.id, row_id, c.id)]
                else:
                    value = data[t.id][row_id].get(c.id)
                values.append(encode_cell(c.type, value))
            db.execute(insert, values)

    # --- historique : branches vides, informations de fichier --------------------------------------
    for name in ('shared', 'local_sent', 'local_unsent'):
        db.execute('INSERT INTO _gristsys_ActionHistoryBranch(name) VALUES(?)', (name,))
    db.execute('INSERT INTO _gristsys_FileInfo (id) VALUES (0)')
    db.execute('COMMIT')
    db.execute('PRAGMA user_version=%d' % USER_VERSION)
    db.close()

    if dump_json:
        write_mock_json(dump_json, tables, data, computed)
    return tables, data, computed


# --- export pour le simulateur de Grist (tests/mock-grist.js) ------------------------------------------
def mock_value(col, value):
    kind = fe.base_type(col.type)
    if kind in ('Date',):
        return None if value is None else fe.date_to_epoch(value)
    if kind in ('RefList', 'ChoiceList'):
        return ['L'] + list(value or [])
    if kind == 'Attachments':
        return ['L'] if not value else ['L'] + list(value)
    if kind == 'Ref':
        return int(value or 0)
    if kind == 'Bool':
        return bool(value)
    if value is None:
        return {'Text': '', 'Choice': '', 'Numeric': 0, 'Int': 0}.get(kind)
    return value


def write_mock_json(path, tables, data, computed):
    out = {}
    for t in tables:
        rows = []
        for row_id in sorted(data[t.id]):
            rec = {'id': row_id}
            for c in t.cols:
                if isinstance(c, HelperCol):
                    continue
                value = computed[(t.id, row_id, c.id)] if c.is_formula else data[t.id][row_id].get(c.id)
                rec[c.id] = mock_value(c, value)
            rows.append(rec)
        out[t.id] = rows
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--out', default='demo-innovations.grist')
    parser.add_argument('--today', default=None, help='AAAA-MM-JJ')
    parser.add_argument('--widget-url', default=DEFAULT_WIDGET_URL)
    parser.add_argument('--no-widget', action='store_true')
    parser.add_argument('--dump-json', default=None)
    args = parser.parse_args(argv)
    today = dt.date.fromisoformat(args.today) if args.today else dt.date.today()
    tables, data, _ = generate(args.out, today, args.widget_url, not args.no_widget, args.dump_json)
    total = sum(len(data[t.id]) for t in tables)
    print('%s : %d tables, %d lignes (date de référence %s)' % (args.out, len(tables), total, today.isoformat()))
    return 0


if __name__ == '__main__':
    sys.exit(main())
