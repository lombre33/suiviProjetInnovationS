#!/usr/bin/env python3
"""Contrôle un fichier .grist de démo, sans Grist : structure, cohérence des métadonnées, intégrité des données,
recalcul des formules, puis (option) export au format du simulateur de Grist des tests.

    python3 demo/check_demo_grist.py demo-innovations.grist [--reference Hello.grist] [--dump-mock out.json]

Ce que le contrôle vérifie (chaque point est un échec s'il est faux) :
  1. conteneur : SQLite sain, PRAGMA user_version = 9, schemaVersion = 47, tables système identiques à celles d'un
     document créé par Grist (--reference : un .grist de grist-core, ex. test/fixtures/docs/Hello.grist) ;
  2. métadonnées <-> tables SQL : chaque table et chaque colonne déclarées existent avec le type SQL et la valeur par
     défaut que Grist leur donne (règles de DocStorage), et inversement ;
  3. colonnes d'affichage des références, listes de choix, types Ref/RefList vers des tables qui existent ;
  4. données : références qui pointent sur des lignes existantes, valeurs de Choice autorisées, dates à minuit UTC,
     codage des listes (JSON sans le « L »), colonnes texte sans NULL ;
  5. formules : chaque colonne formule est recalculée avec le moteur de formules à partir des seules colonnes de
     données, et le résultat doit égaler la valeur stockée ;
  6. pages : sections, champs, page du widget personnalisé (adresse et accès complet).
"""
import argparse
import datetime as dt
import json
import marshal
import os
import re
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import formula_engine as fe  # noqa: E402

DATA_TYPES = {'Text', 'Choice', 'ChoiceList', 'Numeric', 'Int', 'Bool', 'Date', 'DateTime', 'Ref', 'RefList', 'Attachments', 'Any'}


class Report(object):
    def __init__(self):
        self.failures, self.notes, self.checks = [], [], 0

    def check(self, ok, message):
        self.checks += 1
        if not ok:
            self.failures.append(message)
        return ok

    def note(self, message):
        self.notes.append(message)


def expected_sql_type(col_type):
    """Règle de DocStorage._getSqlType, réécrite à part du générateur."""
    simple = {'Bool': 'BOOLEAN', 'Choice': 'TEXT', 'Text': 'TEXT', 'ChoiceList': 'TEXT', 'RefList': 'TEXT', 'Attachments': 'TEXT',
              'Date': 'DATE', 'DateTime': 'DATETIME', 'Int': 'INTEGER', 'Id': 'INTEGER', 'Ref': 'INTEGER',
              'Numeric': 'NUMERIC', 'ManualSortPos': 'NUMERIC', 'PositionNumber': 'NUMERIC'}
    if col_type in simple:
        return simple[col_type]
    if col_type.startswith('Ref:'):
        return 'INTEGER'
    if col_type.startswith('RefList:'):
        return 'TEXT'
    return 'BLOB'


def expected_default(col_type):
    kind = col_type.split(':')[0]
    return {'Any': 'NULL', 'Attachments': 'NULL', 'Bool': '0', 'Choice': "''", 'ChoiceList': 'NULL', 'Date': 'NULL', 'DateTime': 'NULL',
            'Int': '0', 'ManualSortPos': '1e999', 'Numeric': '0', 'Ref': '0', 'RefList': 'NULL', 'Text': "''"}[kind]


def decode(col_type, value):
    """Valeur SQLite -> valeur vue par un client Grist (fetchTable)."""
    kind = col_type.split(':')[0]
    if isinstance(value, bytes):
        value = marshal.loads(value)
    if kind in ('RefList', 'ChoiceList', 'Attachments'):
        if isinstance(value, str) and value.startswith('['):
            return ['L'] + json.loads(value)
        return value
    if kind == 'Bool':
        return bool(value) if value in (0, 1) else value
    return value


def load(path):
    db = sqlite3.connect('file:%s?mode=ro' % path, uri=True)
    db.row_factory = sqlite3.Row
    return db


def run_checks(path, reference=None):
    rep = Report()
    db = load(path)

    # 1. conteneur -------------------------------------------------------------------------------
    rep.check(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'integrity_check')
    rep.check(db.execute('PRAGMA user_version').fetchone()[0] == 9, 'user_version doit valoir 9')
    rep.check(db.execute('SELECT schemaVersion FROM _grist_DocInfo').fetchone()[0] == 47, 'schemaVersion doit valoir 47')
    rep.check(db.execute('SELECT COUNT(*) FROM _grist_DocInfo').fetchone()[0] == 1, '_grist_DocInfo : une seule ligne')
    rep.check(db.execute('PRAGMA journal_mode').fetchone()[0] == 'delete', 'journal_mode delete (pas de fichiers -wal)')
    rep.check(not os.path.exists(path + '-wal') and not os.path.exists(path + '-journal'), 'pas de fichier -wal / -journal')
    system = {r['name']: r['sql'] for r in db.execute("SELECT name, sql FROM sqlite_master WHERE name LIKE '\\_grist\\_%' ESCAPE '\\' OR name LIKE '\\_gristsys\\_%' ESCAPE '\\'")}
    if reference:
        ref = sqlite3.connect('file:%s?mode=ro' % reference, uri=True)
        ref_system = {r[0]: r[1] for r in ref.execute("SELECT name, sql FROM sqlite_master WHERE (name LIKE '\\_grist\\_%' ESCAPE '\\' OR name LIKE '\\_gristsys\\_%' ESCAPE '\\') AND sql IS NOT NULL")}
        rep.check(set(system) == set(ref_system), 'tables système : différence avec la référence %s' % sorted(set(system) ^ set(ref_system)))
        for name in sorted(set(system) & set(ref_system)):
            rep.check(system[name] == ref_system[name], 'DDL différent de la référence pour %s' % name)
        rep.check(ref.execute('PRAGMA user_version').fetchone()[0] == db.execute('PRAGMA user_version').fetchone()[0], 'user_version != référence')
    branches = [r['name'] for r in db.execute('SELECT name FROM _gristsys_ActionHistoryBranch ORDER BY id')]
    rep.check(branches == ['shared', 'local_sent', 'local_unsent'], 'branches d\'historique')
    rep.check(db.execute('SELECT COUNT(*) FROM _gristsys_FileInfo').fetchone()[0] == 1, '_gristsys_FileInfo : une ligne')

    # 2. métadonnées <-> tables SQL ----------------------------------------------------------------
    tables = {r['id']: dict(r) for r in db.execute('SELECT * FROM _grist_Tables ORDER BY id')}
    cols_by_table = {}
    for r in db.execute('SELECT * FROM _grist_Tables_column ORDER BY parentId, parentPos, id'):
        cols_by_table.setdefault(r['parentId'], []).append(dict(r))
    col_by_id = {c['id']: (tables[tid]['tableId'], c) for tid, cols in cols_by_table.items() for c in cols}
    rep.check(set(cols_by_table) <= set(tables), 'colonnes rattachées à une table inexistante')
    table_names = {t['tableId'] for t in tables.values()}
    rep.check(len(table_names) == len(tables), 'tableId en double')
    sql_tables = {r['name'] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_grist%' ESCAPE '\\'")}
    rep.check(sql_tables == table_names, 'tables SQL != tables déclarées : %s' % sorted(sql_tables ^ table_names))

    for tid, table in tables.items():
        name = table['tableId']
        cols = cols_by_table.get(tid, [])
        ids = [c['colId'] for c in cols]
        rep.check(len(ids) == len(set(ids)), '%s : colId en double' % name)
        rep.check(ids[0] == 'manualSort' and cols[0]['type'] == 'ManualSortPos', '%s : manualSort doit être la première colonne' % name)
        rep.check(re.match(r'^[A-Za-z][A-Za-z0-9_]*$', name) is not None, '%s : identifiant de table invalide' % name)
        info = [dict(r) for r in db.execute('PRAGMA table_info(%s)' % ('"%s"' % name))]
        sql_cols = [i['name'] for i in info]
        rep.check(sql_cols == ['id'] + ids, '%s : colonnes SQL %s != métadonnées %s' % (name, sql_cols[:6], ids[:5]))
        by_name = {i['name']: i for i in info}
        for c in cols:
            i = by_name.get(c['colId'])
            if not i:
                continue
            rep.check(i['type'] == expected_sql_type(c['type']), '%s.%s : type SQL %s != %s' % (name, c['colId'], i['type'], expected_sql_type(c['type'])))
            rep.check(str(i['dflt_value']) == expected_default(c['type']), '%s.%s : défaut %s != %s' % (name, c['colId'], i['dflt_value'], expected_default(c['type'])))
            base = c['type'].split(':')[0]
            rep.check(base in DATA_TYPES or c['type'] == 'ManualSortPos', '%s.%s : type inconnu %s' % (name, c['colId'], c['type']))
            if base in ('Ref', 'RefList'):
                rep.check(':' in c['type'] and c['type'].split(':', 1)[1] in table_names, '%s.%s : table cible inconnue (%s)' % (name, c['colId'], c['type']))
            rep.check(bool(c['isFormula']) == bool(c['formula']), '%s.%s : isFormula incohérent avec la formule' % (name, c['colId']))
            if c['widgetOptions']:
                try:
                    json.loads(c['widgetOptions'])
                except ValueError:
                    rep.check(False, '%s.%s : widgetOptions illisible' % (name, c['colId']))
            # 3. colonnes d'affichage
            if c['displayCol']:
                tname, helper = col_by_id.get(c['displayCol'], (None, None))
                ok = helper is not None and tname == name and helper['isFormula'] and helper['type'] == 'Any' and helper['colId'].startswith('gristHelper_Display')
                rep.check(ok, '%s.%s : displayCol invalide' % (name, c['colId']))
                vt, vc = col_by_id.get(c['visibleCol'], (None, None))
                rep.check(vc is not None and vt == c['type'].split(':', 1)[1], '%s.%s : visibleCol n\'est pas dans la table cible' % (name, c['colId']))
                if ok and vc is not None:
                    rep.check(helper['formula'] == '$%s.%s' % (c['colId'], vc['colId']), '%s.%s : formule d\'affichage %s' % (name, c['colId'], helper['formula']))
        rep.check(table['rawViewSectionRef'] > 0 and table['recordCardViewSectionRef'] > 0, '%s : sections brute/fiche' % name)

    # 6. pages ----------------------------------------------------------------------------------------
    sections = {r['id']: dict(r) for r in db.execute('SELECT * FROM _grist_Views_section')}
    views = {r['id']: dict(r) for r in db.execute('SELECT * FROM _grist_Views')}
    for tid, table in tables.items():
        raw, card = sections.get(table['rawViewSectionRef']), sections.get(table['recordCardViewSectionRef'])
        rep.check(raw is not None and raw['tableRef'] == tid and raw['parentKey'] == 'record', '%s : section brute' % table['tableId'])
        rep.check(card is not None and card['tableRef'] == tid and card['parentKey'] == 'single', '%s : fiche' % table['tableId'])
    for sid, s in sections.items():
        rep.check(s['tableRef'] in tables, 'section %s : table inconnue' % sid)
        rep.check(s['parentId'] == 0 or s['parentId'] in views, 'section %s : page inconnue' % sid)
    for r in db.execute('SELECT * FROM _grist_Views_section_field'):
        section = sections.get(r['parentId'])
        ok = section is not None and col_by_id.get(r['colRef'], (None,))[0] == tables[section['tableRef']]['tableId']
        rep.check(ok, 'champ %s : colonne hors de la table de sa section' % r['id'])
    pages = [dict(r) for r in db.execute('SELECT * FROM _grist_Pages')]
    for p in pages:
        rep.check(p['viewRef'] in views, 'page %s : vue inconnue' % p['id'])
    customs = [s for s in sections.values() if s['parentKey'] == 'custom']
    for s in customs:
        options = json.loads(s['options'])
        view = json.loads(options['customView'])
        rep.check(view['mode'] == 'url' and view['access'] == 'full' and view['url'].startswith('https://'), 'section personnalisée : %s' % view)
        rep.check(tables[s['tableRef']]['tableId'] == 'Projets', 'le widget doit être posé sur Projets')
        layout = json.loads(views[s['parentId']]['layoutSpec'])
        rep.check(layout['children'][0]['leaf'] == s['id'], 'layoutSpec de la page du widget')
        rep.note('page du widget : « %s » -> %s (accès %s)' % (views[s['parentId']]['name'], view['url'], view['access']))

    # 4. données + 5. formules ------------------------------------------------------------------------
    class Spec(object):
        def __init__(self, c):
            self.id, self.type, self.is_formula, self.formula = c['colId'], c['type'], bool(c['isFormula']), c['formula']

    data, stored = {}, {}
    for tid, table in tables.items():
        name = table['tableId']
        specs = [Spec(c) for c in cols_by_table[tid] if c['colId'] != 'manualSort']
        rows, srows = {}, {}
        for r in db.execute('SELECT * FROM "%s" ORDER BY id' % name):
            row, srow = {}, {}
            for spec in specs:
                value = decode(spec.type, r[spec.id])
                (srow if spec.is_formula else row)[spec.id] = value
            rows[r['id']] = row
            srows[r['id']] = srow
        data[name] = {'cols': specs, 'rows': rows}
        stored[name] = srows
    # valeurs de données en types Python pour le moteur (Date -> date, listes sans « L »)
    for name, info in data.items():
        for row in info['rows'].values():
            for spec in info['cols']:
                if spec.is_formula:
                    continue
                v = row.get(spec.id)
                kind = spec.type.split(':')[0]
                if kind == 'Date' and v is not None:
                    row[spec.id] = fe.epoch_to_date(v)
                elif kind in ('RefList', 'ChoiceList', 'Attachments') and isinstance(v, list):
                    row[spec.id] = v[1:]
    engine = fe.Engine(data)
    try:
        computed = engine.compute_all()
    except fe.FormulaError as err:
        rep.check(False, 'formule en erreur : %s' % err)
        return rep, db, tables, cols_by_table
    except KeyError as err:
        rep.check(False, 'formule qui référence une colonne ou une table inconnue : %s' % err)
        return rep, db, tables, cols_by_table
    rep.note('%d cellules de formule recalculées' % len(computed))
    for (name, row_id, col_id), value in computed.items():
        spec = next(s for s in data[name]['cols'] if s.id == col_id)
        kind = spec.type.split(':')[0]
        got = stored[name][row_id][col_id]
        if kind == 'Date':
            expected = None if value is None else fe.date_to_epoch(value)
        elif kind in ('RefList', 'ChoiceList'):
            expected = ['L'] + list(value) if value else None
        elif kind == 'Any':
            expected = value
        else:
            expected = value
        if kind == 'Any' and isinstance(got, list):
            got = got  # liste marshalisée (affichage d'une RefList)
        same = (got == expected) or (kind == 'Bool' and bool(got) == bool(expected)) \
            or (isinstance(got, (int, float)) and isinstance(expected, (int, float)) and not isinstance(got, bool) and abs(got - expected) < 1e-9)
        if kind == 'Any' and isinstance(expected, list) and isinstance(got, list):
            same = [str(x) for x in got] == [str(x) for x in expected] or got == expected
        rep.check(same, '%s[%s].%s : stocké %r != recalculé %r' % (name, row_id, col_id, got, expected))

    choices = {}
    for tid, cols in cols_by_table.items():
        for c in cols:
            if c['type'] in ('Choice', 'ChoiceList') and c['widgetOptions']:
                choices[(tables[tid]['tableId'], c['colId'])] = set(json.loads(c['widgetOptions']).get('choices', []))
    row_ids = {name: set(info['rows']) for name, info in data.items()}
    for name, info in data.items():
        for row_id, row in info['rows'].items():
            for spec in info['cols']:
                if spec.is_formula:
                    continue
                v = row.get(spec.id)
                kind = spec.type.split(':')[0]
                where = '%s[%s].%s' % (name, row_id, spec.id)
                if kind == 'Ref':
                    rep.check(v == 0 or v in row_ids[spec.type.split(':', 1)[1]], '%s : référence cassée %r' % (where, v))
                elif kind == 'RefList' and v:
                    target = spec.type.split(':', 1)[1]
                    rep.check(all(isinstance(i, int) and i in row_ids[target] for i in v), '%s : liste de références cassée %r' % (where, v))
                elif kind == 'Choice' and v:
                    allowed = choices.get((name, spec.id))
                    rep.check(allowed is None or v in allowed, '%s : valeur %r hors de la liste de choix' % (where, v))
                elif kind == 'ChoiceList' and v:
                    allowed = choices.get((name, spec.id))
                    rep.check(allowed is None or all(x in allowed for x in v), '%s : valeurs %r hors de la liste de choix' % (where, v))
                elif kind == 'Date' and spec.type == 'Date':
                    rep.check(v is None or isinstance(v, dt.date), '%s : date invalide' % where)
                elif kind in ('Text', 'Choice'):
                    rep.check(isinstance(v, str), '%s : texte attendu, reçu %r' % (where, v))
                elif kind == 'Bool':
                    rep.check(v in (True, False), '%s : booléen attendu' % where)
    # dates à minuit UTC (Grist stocke un jour entier en secondes, multiple de 86400)
    for tid, cols in cols_by_table.items():
        for c in cols:
            if c['type'] == 'Date' and not c['isFormula']:
                tname = tables[tid]['tableId']
                bad = db.execute('SELECT id, "%s" v FROM "%s" WHERE "%s" IS NOT NULL AND "%s" %% 86400 != 0' % (c['colId'], tname, c['colId'], c['colId'])).fetchall()
                rep.check(not bad, '%s.%s : dates qui ne sont pas à minuit UTC' % (tname, c['colId']))
    rep.note('%d tables, %d colonnes, %d lignes' % (len(tables), sum(len(c) for c in cols_by_table.values()), sum(len(v) for v in row_ids.values())))
    return rep, db, tables, cols_by_table


def dump_mock(db, tables, cols_by_table, out):
    """Tables au format colonne par colonne de `grist.docApi.fetchTable`, plus les métadonnées lues par le widget."""
    result = {}
    for tid, table in tables.items():
        name = table['tableId']
        cols = cols_by_table[tid]
        rows = db.execute('SELECT * FROM "%s" ORDER BY id' % name).fetchall()
        tbl = {'id': [r['id'] for r in rows]}
        for c in cols:
            tbl[c['colId']] = [decode(c['type'], r[c['colId']]) for r in rows]
        result[name] = tbl
    result['_grist_Tables'] = {'id': list(tables), 'tableId': [t['tableId'] for t in tables.values()]}
    flat = [(tid, c) for tid, cols in cols_by_table.items() for c in cols]
    result['_grist_Tables_column'] = {
        'id': [c['id'] for _, c in flat], 'parentId': [tid for tid, _ in flat], 'colId': [c['colId'] for _, c in flat],
        'type': [c['type'] for _, c in flat], 'label': [c['label'] for _, c in flat], 'description': [c['description'] or '' for _, c in flat]}
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('file')
    parser.add_argument('--reference', default=None, help='un .grist créé par Grist, pour comparer les tables système')
    parser.add_argument('--dump-mock', default=None)
    args = parser.parse_args(argv)
    rep, db, tables, cols_by_table = run_checks(args.file, args.reference)
    for n in rep.notes:
        print('  ·', n)
    if args.dump_mock:
        dump_mock(db, tables, cols_by_table, args.dump_mock)
        print('  · export simulateur :', args.dump_mock)
    if rep.failures:
        print('ÉCHEC : %d anomalie(s) sur %d contrôles' % (len(rep.failures), rep.checks))
        for m in rep.failures[:60]:
            print('  ✗', m)
        return 1
    print('OK : %d contrôles réussis' % rep.checks)
    return 0


if __name__ == '__main__':
    sys.exit(main())
