/**
 * Non-regression suite : outils communs (js/core/utils.js — CoreUtils). Ces fonctions servent à toutes les pages ;
 * extractAddedRecordId en particulier décide de l'identifiant retenu après CHAQUE création de ligne dans Grist
 * (projet, personne, ligne OPE, séance, point…).
 */
(function () {
  'use strict';

  const U = () => window.CoreUtils;

  describe('Outils communs — extractAddedRecordId (identifiant de la ligne créée, lu de la réponse de Grist)', function () {
    it('réponse réelle de Grist : { retValues: [id] }, le numéro simple d\'un AddRecord', function () {
      assertEqual(U().extractAddedRecordId({ actionNum: 5, retValues: [42] }), 42);
    });

    it('plusieurs actions dans la même requête : le premier identifiant valable, les valeurs vides (null, 0) sont sautées', function () {
      assertEqual(U().extractAddedRecordId({ retValues: [null, 0, 12, 13] }), 12);
      assertEqual(U().extractAddedRecordId({ retValues: [[], [null], [7]] }), 7);
    });

    it('formes tolérées : nombre seul, texte numérique, objet { id } / { rowId } / { rowID }, listes ids/results imbriquées', function () {
      assertEqual(U().extractAddedRecordId(9), 9);
      assertEqual(U().extractAddedRecordId('15'), 15);
      assertEqual(U().extractAddedRecordId({ id: 3 }), 3);
      assertEqual(U().extractAddedRecordId({ rowId: 4 }), 4);
      assertEqual(U().extractAddedRecordId({ rowID: 5 }), 5);
      assertEqual(U().extractAddedRecordId({ result: { ids: [6] } }), 6);
      assertEqual(U().extractAddedRecordId({ results: [{ id: 8 }] }), 8);
      assertEqual(U().extractAddedRecordId({ retValues: [{ id: 21 }] }), 21);
    });

    it('rien d\'exploitable : null (jamais 0, un nombre négatif, NaN, du texte non numérique, un booléen)', function () {
      [undefined, null, 0, -3, NaN, Infinity, '', '   ', 'abc', '0', '-2', true, false, {}, [], [[]], { retValues: [] }, { retValues: [null] }, { id: 0 }].forEach(value =>
        assertEqual(U().extractAddedRecordId(value), null, JSON.stringify(value) + ' ne désigne aucune ligne'));
    });

    it('une réponse très imbriquée ne fait pas boucler (profondeur limitée) et un objet circulaire ne plante pas', function () {
      let deep = 77;
      for (let i = 0; i < 20; i++) deep = [deep];
      assertEqual(U().extractAddedRecordId(deep), null, 'au-delà de la profondeur retenue');
      assertEqual(U().extractAddedRecordId([[[[77]]]]), 77, 'imbrication raisonnable');
      const circular = { retValues: [] };
      circular.retValues.push(circular);
      assertEqual(U().extractAddedRecordId(circular), null, 'circulaire');
    });
  });

  describe('Outils communs — dates, montants, texte', function () {
    it('gristDateToInput : secondes Grist → jj ISO (UTC), vide pour 0, null ou valeur illisible', function () {
      assertEqual(U().gristDateToInput(0), '');
      assertEqual(U().gristDateToInput(null), '');
      assertEqual(U().gristDateToInput(undefined), '');
      assertEqual(U().gristDateToInput(''), '');
      assertEqual(U().gristDateToInput('texte'), '');
      assertEqual(U().gristDateToInput(Date.UTC(2026, 10, 9) / 1000), '2026-11-09');
      assertEqual(U().gristDateToInput(String(Date.UTC(2026, 0, 1) / 1000)), '2026-01-01', 'texte numérique accepté');
      assertEqual(U().gristDateToInput(Date.UTC(2026, 11, 31, 23, 59, 59) / 1000), '2026-12-31', 'dernière seconde du jour : toujours le même jour');
      assertEqual(U().gristDateToInput(-86400), '1969-12-31', 'avant 1970');
    });

    it('gristDateToInput : une date hors plage ne ressemble jamais à jjjj-mm-jj (les pages s\'en servent pour ne rien afficher)', function () {
      const out = U().gristDateToInput(8e12);
      assertFalse(/^\d{4}-\d{2}-\d{2}$/.test(out), 'hors plage : ' + out);
    });

    it('formatCurrency : espace pour les milliers, virgule et deux décimales seulement si nécessaire, négatifs, valeurs illisibles = 0 €', function () {
      const f = v => U().formatCurrency(v);
      assertEqual(f(0), '0 €');
      assertEqual(f(999), '999 €');
      assertEqual(f(1000), '1 000 €');
      assertEqual(f(1234567), '1 234 567 €');
      assertEqual(f(1234.5), '1 234,50 €');
      assertEqual(f(12.05), '12,05 €');
      assertEqual(f('2500'), '2 500 €', 'texte numérique');
      assertEqual(f(-1500), '-1 500 €');
      [null, undefined, 'abc', NaN, Infinity].forEach(v => assertEqual(f(v), '0 €', String(v)));
    });

    it('escapeHtml : & < > " \' neutralisés, rien (null, undefined) = texte vide, un nombre devient du texte', function () {
      assertEqual(U().escapeHtml('<img src=x onerror="a()">'), '&lt;img src=x onerror=&quot;a()&quot;&gt;');
      assertEqual(U().escapeHtml('L\'été & l\'hiver'), 'L&#39;été &amp; l&#39;hiver');
      assertEqual(U().escapeHtml(null), '');
      assertEqual(U().escapeHtml(undefined), '');
      assertEqual(U().escapeHtml(0), '0');
      assertEqual(U().escapeHtml('&amp;'), '&amp;amp;', 'jamais d\'échappement « à moitié » : un & déjà échappé est ré-échappé');
    });
  });

  describe('Outils communs — listes de libellés des filtres (encodeList / decodeList)', function () {
    it('sans virgule dans les libellés : une simple liste « A,B », comme les préférences déjà enregistrées', function () {
      assertEqual(U().encodeList(['Programme A', 'Programme B']), 'Programme A,Programme B');
      assertEqual(U().encodeList([]), '');
      assertEqual(U().encodeList(undefined), '');
      assertDeepEqual(U().decodeList('Programme A,Programme B'), ['Programme A', 'Programme B']);
      assertDeepEqual(U().decodeList(' A , B ,, '), ['A', 'B'], 'espaces et éléments vides ignorés');
      assertDeepEqual(U().decodeList(''), []);
      assertDeepEqual(U().decodeList(null), []);
      assertDeepEqual(U().decodeList(undefined), []);
    });

    it('un libellé qui contient une virgule reste entier : tableau JSON à l\'écriture, relu à l\'identique', function () {
      const labels = ['Programme B, volet 2', 'Programme A', 'Comité "spécial", n°3'];
      const encoded = U().encodeList(labels);
      assertEqual(encoded.startsWith('['), true, 'tableau JSON');
      assertDeepEqual(U().decodeList(encoded), labels);
      assertDeepEqual(U().decodeList(U().encodeList(['Seul, avec virgule'])), ['Seul, avec virgule']);
    });

    it('un texte qui commence par « [ » sans être du JSON valide reste lu comme une liste séparée par des virgules', function () {
      assertDeepEqual(U().decodeList('[Pilote] A,B'), ['[Pilote] A', 'B']);
      assertDeepEqual(U().decodeList('[cassé'), ['[cassé']);
      assertDeepEqual(U().decodeList('[]'), [], 'tableau vide');
    });

    it('les clés de volets (« ailleurs:1 », « 3 ») passent par le même chemin sans changer de forme', function () {
      assertEqual(U().encodeList(['ailleurs:1', 'diese:2']), 'ailleurs:1,diese:2');
      assertDeepEqual(U().decodeList('ailleurs:1,diese:2'), ['ailleurs:1', 'diese:2']);
      assertEqual(U().encodeList([0, 3, 5]), '0,3,5', 'indices numériques');
    });
  });

  describe('Outils communs — index par identifiant (indexBy / findById)', function () {
    it('findById accepte un nombre ou un texte, rend undefined pour un identifiant absent ou une table absente', function () {
      const rows = [{ id: 1, n: 'a' }, { id: 2, n: 'b' }];
      assertEqual(U().findById(rows, 2).n, 'b');
      assertEqual(U().findById(rows, '2').n, 'b');
      assertEqual(U().findById(rows, 99), undefined);
      assertEqual(U().findById(rows, 0), undefined);
      assertEqual(U().findById(undefined, 1), undefined);
      assertEqual(U().findById(null, 1), undefined);
    });

    it('les lignes vides sont ignorées sans casser l\'index, et le premier gagne en cas de doublon', function () {
      const rows = [null, { id: 5, n: 'premier' }, undefined, { id: 5, n: 'second' }];
      assertEqual(U().findById(rows, 5).n, 'premier');
    });

    it('un tableau modifié sur place est relu : ligne ajoutée, ligne retirée, dernière ligne remplacée', function () {
      const rows = [{ id: 1, n: 'a' }, { id: 2, n: 'b' }];
      assertEqual(U().findById(rows, 3), undefined);
      rows.push({ id: 3, n: 'c' });
      assertEqual(U().findById(rows, 3).n, 'c', 'ajout vu');
      rows.pop();
      assertEqual(U().findById(rows, 3), undefined, 'retrait vu');
      rows[rows.length - 1] = { id: 2, n: 'b2' };
      assertEqual(U().findById(rows, 2).n, 'b2', 'dernière ligne remplacée vue');
    });

    it('indexBy avec une autre clé : « Projet » d\'une fiche Notifications, mémorisé séparément de l\'index par id', function () {
      const rows = [{ id: 1, Projet: 10 }, { id: 2, Projet: 11 }];
      const byProject = U().indexBy(rows, 'projet', row => row.Projet);
      assertEqual(byProject.get('11').id, 2);
      assertEqual(U().findById(rows, 2).Projet, 11);
      assertEqual(byProject.get('99'), undefined);
    });
  });
})();
