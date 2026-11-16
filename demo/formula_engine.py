"""Mini-moteur de formules à la Grist, pour le générateur du document de démo.

Il ne remplace pas le vrai moteur de données de Grist (qui recalcule de toute façon toutes les
formules à l'ouverture du document) : il sert à deux choses.

  1. écrire dans le fichier .grist des valeurs déjà calculées pour les colonnes formule (le fichier
     est lisible tel quel par n'importe quel outil SQLite, et cohérent avec ce que Grist recalculera) ;
  2. vérifier que les formules écrites dans le document ne plantent pas et donnent ce qu'on attend
     (le même texte de formule est exécuté ici, avec la syntaxe `$Colonne` de Grist).

Fonctionne avec la seule bibliothèque standard de Python.

Sémantique reprise de Grist : une référence vide (id 0) est un enregistrement « vide » dont tous les
champs valent la valeur par défaut de leur type ; une liste de références est un ensemble
d'enregistrements dont l'attribut donne la liste des valeurs ; `Table.lookupRecords(col=valeur)` et
`Table.lookupOne(...)` ; la dernière expression d'une formule est son résultat.
"""
import ast
import datetime
import math
import re
import textwrap

EPOCH = datetime.date(1970, 1, 1)


def date_to_epoch(d):
    return (d - EPOCH).days * 86400


def epoch_to_date(seconds):
    return EPOCH + datetime.timedelta(days=int(seconds) // 86400)


def base_type(col_type):
    return col_type.split(':', 1)[0]


def target_table(col_type):
    return col_type.split(':', 1)[1] if ':' in col_type else None


DEFAULTS = {
    'Text': '', 'Choice': '', 'Numeric': 0, 'Int': 0, 'Bool': False, 'Ref': 0,
    'RefList': None, 'ChoiceList': None, 'Attachments': None, 'Date': None, 'DateTime': None, 'Any': None,
}


class FormulaError(Exception):
    pass


class Rec(object):
    """Un enregistrement (ligne) d'une table, vu depuis une formule."""

    def __init__(self, engine, table_id, row_id):
        object.__setattr__(self, '_e', engine)
        object.__setattr__(self, '_t', table_id)
        object.__setattr__(self, '_id', row_id)

    @property
    def id(self):
        return self._id

    def __bool__(self):
        return self._id != 0

    def __eq__(self, other):
        return isinstance(other, Rec) and other._t == self._t and other._id == self._id

    def __hash__(self):
        return hash((self._t, self._id))

    def __getattr__(self, name):
        if name.startswith('_'):
            raise AttributeError(name)
        return self._e.cell(self._t, self._id, name)

    def __repr__(self):
        return '%s[%s]' % (self._t, self._id)


class RecSet(object):
    """Un ensemble d'enregistrements (liste de références, résultat de lookupRecords)."""

    def __init__(self, engine, table_id, ids):
        self._e = engine
        self._t = table_id
        self._ids = list(ids)

    def __iter__(self):
        return (Rec(self._e, self._t, i) for i in self._ids)

    def __len__(self):
        return len(self._ids)

    def __bool__(self):
        return bool(self._ids)

    def __getitem__(self, i):
        return Rec(self._e, self._t, self._ids[i])

    def __getattr__(self, name):
        if name.startswith('_'):
            raise AttributeError(name)
        return [self._e.cell(self._t, i, name) for i in self._ids]


class TableProxy(object):
    def __init__(self, engine, table_id):
        self._e = engine
        self._t = table_id

    def lookupRecords(self, **kwargs):
        rows = self._e.rows(self._t)
        out = []
        for row_id in sorted(rows):
            ok = True
            for col, wanted in kwargs.items():
                value = self._e.raw(self._t, row_id, col)
                if col == 'id':
                    value = row_id
                if isinstance(wanted, Rec):
                    wanted = wanted.id
                if value != wanted:
                    ok = False
                    break
            if ok:
                out.append(row_id)
        return RecSet(self._e, self._t, out)

    def lookupOne(self, **kwargs):
        found = self.lookupRecords(**kwargs)
        return found[0] if len(found) else Rec(self._e, self._t, 0)

    @property
    def all(self):
        return RecSet(self._e, self._t, sorted(self._e.rows(self._t)))


class Engine(object):
    """tables : {tableId: {'cols': [ColSpec…], 'rows': {rowId: {colId: valeur}}}}.

    Les valeurs sont celles de Python : int, float, str, bool, datetime.date (Date), datetime.datetime
    (DateTime), liste d'int (RefList), liste de str (ChoiceList), None.
    ColSpec : objet avec .id, .type, .is_formula, .formula.
    """

    def __init__(self, tables):
        self.tables = tables
        self._spec = {t: {c.id: c for c in info['cols']} for t, info in tables.items()}
        self._cache = {}
        self._stack = []
        self._compiled = {}
        self.ns = {name: TableProxy(self, name) for name in tables}
        self.ns.update({'datetime': datetime, 'math': math, 're': re, 'len': len, 'sum': sum, 'max': max,
                        'min': min, 'str': str, 'int': int, 'float': float, 'round': round, 'abs': abs,
                        'sorted': sorted, 'list': list, 'set': set, 'getattr': getattr, 'any': any, 'all': all,
                        'enumerate': enumerate, 'zip': zip, 'range': range, 'isinstance': isinstance,
                        'Exception': Exception, 'bool': bool, 'dict': dict, 'tuple': tuple})

    def rows(self, table_id):
        return self.tables[table_id]['rows']

    # --- lecture d'une cellule --------------------------------------------------------------
    def raw(self, table_id, row_id, col_id):
        """Valeur stockée, ou calculée pour une colonne formule, sans enveloppe (id, listes d'id…)."""
        if col_id == 'id':
            return row_id
        spec = self._spec[table_id].get(col_id)
        if spec is None:
            raise AttributeError("%s n'a pas de colonne %s" % (table_id, col_id))
        if row_id == 0:
            return self._default(spec)
        if spec.is_formula:
            key = (table_id, row_id, col_id)
            if key in self._cache:
                return self._cache[key]
            if key in self._stack:
                raise FormulaError('Dépendance circulaire : %s' % ' -> '.join('%s[%s].%s' % k for k in self._stack + [key]))
            self._stack.append(key)
            try:
                value = self._convert(spec, self._run(spec, table_id, row_id))
            finally:
                self._stack.pop()
            self._cache[key] = value
            return value
        row = self.tables[table_id]['rows'].get(row_id)
        if row is None:
            return self._default(spec)
        value = row.get(col_id, self._default(spec))
        return self._default(spec) if value is None and spec.type.split(':')[0] in ('Text', 'Choice', 'Numeric', 'Int', 'Bool', 'Ref') else value

    def _default(self, spec):
        return DEFAULTS.get(base_type(spec.type))

    def cell(self, table_id, row_id, col_id):
        """Valeur vue depuis une formule (références enveloppées)."""
        if col_id == 'id':
            return row_id
        spec = self._spec[table_id].get(col_id)
        if spec is None:
            raise AttributeError("%s n'a pas de colonne %s" % (table_id, col_id))
        value = self.raw(table_id, row_id, col_id)
        kind = base_type(spec.type)
        if kind == 'Ref':
            return Rec(self, target_table(spec.type), value or 0)
        if kind == 'RefList':
            return RecSet(self, target_table(spec.type), value or [])
        if kind == 'ChoiceList':
            return list(value or [])
        return value

    # --- exécution d'une formule -------------------------------------------------------------
    def _compile(self, spec):
        key = (id(spec), spec.formula)
        if key in self._compiled:
            return self._compiled[key]
        body = re.sub(r'\$(?=[A-Za-z_])', 'rec.', spec.formula)
        source = 'def _formula(rec):\n' + textwrap.indent(body.rstrip('\n'), '    ') + '\n'
        tree = ast.parse(source)
        fn = tree.body[0]
        if fn.body and isinstance(fn.body[-1], ast.Expr):
            fn.body[-1] = ast.copy_location(ast.Return(value=fn.body[-1].value), fn.body[-1])
        ast.fix_missing_locations(tree)
        scope = dict(self.ns)
        exec(compile(tree, '<formule %s>' % spec.id, 'exec'), scope)
        self._compiled[key] = scope['_formula']
        return self._compiled[key]

    def _run(self, spec, table_id, row_id):
        fn = self._compile(spec)
        try:
            return fn(Rec(self, table_id, row_id))
        except FormulaError:
            raise
        except Exception as err:
            raise FormulaError('%s[%s].%s : %s: %s' % (table_id, row_id, spec.id, type(err).__name__, err))

    def _convert(self, spec, value):
        """Conversion du résultat selon le type de la colonne (comme le moteur de Grist)."""
        kind = base_type(spec.type)
        if kind in ('Text', 'Choice'):
            return '' if value is None else str(value)
        if kind in ('Numeric', 'Int'):
            if value is None or value == '':
                return 0
            if isinstance(value, bool):
                return int(value)
            if not isinstance(value, (int, float)):
                raise FormulaError('%s : résultat non numérique %r' % (spec.id, value))
            return value
        if kind == 'Bool':
            return bool(value)
        if kind == 'Ref':
            if isinstance(value, Rec):
                return value.id
            return int(value or 0)
        if kind == 'RefList':
            ids = []
            for item in (value or []):
                ids.append(item.id if isinstance(item, Rec) else int(item))
            return ids
        if kind == 'ChoiceList':
            return [str(v) for v in (value or [])]
        if kind == 'Date':
            if value is None or value == '':
                return None
            if isinstance(value, datetime.datetime):
                return value.date()
            if isinstance(value, datetime.date):
                return value
            raise FormulaError('%s : résultat non date %r' % (spec.id, value))
        return value

    def compute_all(self):
        """Évalue toutes les colonnes formule de toutes les lignes ; renvoie {(table, row, col): valeur}."""
        out = {}
        for table_id, info in self.tables.items():
            for spec in info['cols']:
                if not spec.is_formula:
                    continue
                for row_id in sorted(info['rows']):
                    out[(table_id, row_id, spec.id)] = self.raw(table_id, row_id, spec.id)
        return out
