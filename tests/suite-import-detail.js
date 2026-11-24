/**
 * Non-regression suite : import mensuel du détail des dépenses (export FD02 « Consommation détaillée des AE ») — 24/11/2026.
 * Règles pures : js/pages/import-detail-logic.js ; page : boîte « Détail des dépenses » de la page Import financier. Fichiers et montants fictifs.
 *
 *  - le fichier se lit tel que l'exporte FD02 : titre, « Données au », en-têtes sur plusieurs lignes, colonnes vides, dates Excel ;
 *  - une ligne de Grist se retrouve par sa clé (pas par sa position) : ajoutée, modifiée (seul ce qui change), inchangée ; une ligne de Grist
 *    absente du fichier est gardée et comptée à part ;
 *  - rien n'est écrit avant la relecture ; l'écriture est journalisée et se défait ; une valeur illisible arrête tout.
 */
(function () {
  'use strict';

  const D = () => window.ImportDetailLogic;
  const L = () => window.ImportHistoriqueLogic;
  const UTC = (y, m, d) => Date.UTC(y, m - 1, d) / 1000;
  const serial = (y, m, d) => Date.UTC(y, m - 1, d) / 86400000 + 25569;

  // En-têtes tels qu'ils sont dans le fichier réel (retours à la ligne compris, colonnes vides en 4, 9, 10 et 14).
  const HEAD = ['Exercice', 'CRB', 'SO', null, 'Sous SO', 'Nature Dépenses', 'Code Opération', 'Référence Externe Opération', null, null, 'Code Analytique', 'Destination', 'Libellé Destination', null,
    'N° EJ\nN° EJX\nN° Mission\nN° DPC\nN° Virement \nN° Réimputation Budgétaire', 'Type Objet', 'Libellé objet de gestion', 'Date création Objet', 'Fournisseur', 'Etat', 'Date validation',
    'EJ-Montant Budgetaire', 'Montant Budgétaire SF', 'AE consommé hors \nvirement/réimputation budgétaire', 'AE Consommé sur\nvirement/réimputation budgétaire', 'Total AE Consommé', 'Total CP consommé', 'Domaine'];
  const TITLE = [null, null, null, 'Consommation détaillée AE', null, null, null, null, null, 'Données au 16/06/2026 11:08:42 GMT+02:00'];
  const dataRow = (extra) => {
    const values = Object.assign({
      Exercice: 2026, CRB: '101 SG', SO: '1028R DIPE', 'Sous SO': '1028R-3', 'Nature Dépenses': 'FCT', 'Code Opération': 'OPE-FICT-001', Destination: 'D115', 'Libellé Destination': 'Pilotage',
      'N° EJ': 'CDE-0001', 'Type Objet': 'EJ', 'Libellé objet de gestion': 'Achat fictif', 'Date création Objet': { excelDate: serial(2025, 9, 10) }, Fournisseur: 'FOURNISSEUR FICTIF', Etat: 'CLOS',
      'Total AE Consommé': 1200, 'Total CP consommé': 800, Domaine: 'Recherche'
    }, extra || {});
    return HEAD.map(h => {
      if (h == null) return null;
      const label = h.startsWith('N° EJ') ? 'N° EJ' : h.startsWith('AE consommé hors') ? 'AE consommé hors' : h.startsWith('AE Consommé sur') ? 'AE Consommé sur' : h;
      return values[label] === undefined ? null : values[label];
    });
  };
  const sheet = rows => [[], TITLE, HEAD].concat(rows);
  const read = rows => D().readFd02(sheet(rows), XlsxReader.excelDateToUnix);

  // ===========================================================================================================
  describe('Détail des dépenses (FD02) — lecture du fichier', function () {
    it('lit le fichier tel que FD02 l\'exporte : en-têtes sur plusieurs lignes, colonnes vides, date Excel, « Données au »', function () {
      const out = read([dataRow()]);
      assertEqual(out.missing.length, 0); assertEqual(out.errorCount, 0);
      assertEqual(out.headerRow, 3);
      assertEqual(out.donneesAu, UTC(2026, 6, 16));
      assertEqual(out.records.length, 1);
      const r = out.records[0];
      assertEqual(r.Exercice, 2026); assertEqual(r.Code_operation, 'OPE-FICT-001'); assertEqual(r.Sous_SO, '1028R-3'); assertEqual(r.Num_EJ, 'CDE-0001');
      assertEqual(r.Date_creation, UTC(2025, 9, 10)); assertEqual(r.AE_consomme, 1200); assertEqual(r.CP_consomme, 800); assertEqual(r.Donnees_au, UTC(2026, 6, 16));
      assertFalse('Fournisseur' in r && !r.Fournisseur);
      assertDeepEqual(out.exercices, [2026]);
    });

    it('les lignes vides sont sautées, une ligne sans code opération est ignorée et comptée', function () {
      const out = read([dataRow(), [], dataRow({ 'Code Opération': null }), dataRow({ 'N° EJ': 'CDE-0002' })]);
      assertEqual(out.records.length, 2); assertEqual(out.ignored, 1); assertEqual(out.total, 3);
    });

    it('un en-tête obligatoire absent : rien n\'est lu et la colonne manquante est nommée', function () {
      const rows = [[], TITLE, HEAD.map(h => (h === 'Total CP consommé' ? 'Total CP' : h)), dataRow()];
      const out = D().readFd02(rows, XlsxReader.excelDateToUnix);
      assertDeepEqual(out.missing, ['Total CP consommé']); assertEqual(out.records.length, 0);
      assertIncludes(out.unknown.join(' '), 'Total CP');
    });

    it('pas d\'en-tête reconnaissable (autre fichier) : tout manque', function () {
      const out = D().readFd02([['a', 'b'], [1, 2]], XlsxReader.excelDateToUnix);
      assertTrue(out.noHeader); assertTrue(out.missing.includes('Code Opération'));
    });

    it('une valeur illisible arrête la ligne : colonne, ligne du fichier et valeur sont dites ; rien n\'est lu à moitié', function () {
      const out = read([dataRow(), dataRow({ 'N° EJ': 'CDE-0002', 'Total CP consommé': 'beaucoup' })]);
      assertEqual(out.errorCount, 1); assertEqual(out.records.length, 1);
      assertEqual(out.errors[0].line, 5); assertEqual(out.errors[0].column, 'Total CP consommé'); assertEqual(out.errors[0].value, 'beaucoup');
    });

    it('montants avec virgule et espaces, dates en texte jj/mm/aaaa ou ISO', function () {
      const out = read([dataRow({ 'Total CP consommé': '1 234,50', 'Date création Objet': '10/09/2025', 'Date validation': '2025-09-12 00:00:00' })]);
      assertEqual(out.records[0].CP_consomme, 1234.5); assertEqual(out.records[0].Date_creation, UTC(2025, 9, 10)); assertEqual(out.records[0].Date_validation, UTC(2025, 9, 12));
    });

    it('un fichier sans « Données au » n\'invente pas de date', function () {
      const out = D().readFd02([[], [], HEAD, dataRow()], XlsxReader.excelDateToUnix);
      assertEqual(out.donneesAu, null); assertFalse('Donnees_au' in out.records[0]);
    });
  });

  // ===========================================================================================================
  describe('Détail des dépenses (FD02) — comparaison avec Depenses_OPE', function () {
    const rec = extra => read([dataRow(extra)]).records[0];
    const grist = (id, extra) => Object.assign({ id }, rec(extra));

    it('une ligne absente de Grist est ajoutée ; identique, elle ne fait rien ; modifiée, seul ce qui change est écrit (avec la valeur d\'avant)', function () {
      const news = rec({ 'N° EJ': 'CDE-NEW' });
      const unchanged = rec({ 'N° EJ': 'CDE-0002' });
      const changed = rec({ 'N° EJ': 'CDE-0003', 'Total CP consommé': 900, Etat: 'SOLDE' });
      const existing = [grist(1, { 'N° EJ': 'CDE-0002' }), grist(2, { 'N° EJ': 'CDE-0003' })];
      const plan = D().planDetail({ records: [news, unchanged, changed], existing });
      assertEqual(plan.counts.ajoutees, 1); assertEqual(plan.counts.modifiees, 1); assertEqual(plan.counts.inchangees, 1);
      const add = plan.phase1.find(op => op.kind === 'add'), upd = plan.phase1.find(op => op.kind === 'update');
      assertEqual(add.fields.Num_EJ, 'CDE-NEW'); assertEqual(add.fields.Donnees_au, UTC(2026, 6, 16));
      assertEqual(upd.id, 2);
      assertDeepEqual(Object.keys(upd.fields).sort(), ['CP_consomme', 'Donnees_au', 'Etat']);
      assertEqual(upd.before.CP_consomme, 800); assertEqual(upd.before.Etat, 'CLOS');
      assertEqual(plan.actionCount, 2);
    });

    it('les lignes sont retrouvées par leur clé, pas par leur position : un fichier trié autrement donne le même résultat', function () {
      const a = { 'N° EJ': 'A' }, b = { 'N° EJ': 'B' };
      const plan = D().planDetail({ records: [rec(b), rec(a)], existing: [grist(1, a), grist(2, b)] });
      assertEqual(plan.actionCount, 0); assertEqual(plan.counts.inchangees, 2);
    });

    it('une ligne de Grist qui n\'est plus dans le fichier est gardée et comptée à part, seulement pour les exercices du fichier', function () {
      const existing = [grist(1, { 'N° EJ': 'GONE' }), grist(2, { 'N° EJ': 'OLD', Exercice: 2025 }), grist(3, { 'N° EJ': 'STAYS' })];
      const plan = D().planDetail({ records: [rec({ 'N° EJ': 'STAYS' })], existing });
      assertEqual(plan.counts.absentes, 1); assertDeepEqual(plan.absent, [1]);
      assertFalse(plan.phase1.some(op => op.kind === 'update' && op.id === 1), 'une ligne absente n\'est jamais modifiée ni supprimée');
    });

    it('une clé répétée dans le fichier : les lignes sont numérotées dans l\'ordre, signalées, et retrouvées de même d\'un mois à l\'autre', function () {
      const twice = [rec({ 'Total CP consommé': 10 }), rec({ 'Total CP consommé': 20 })];
      const first = D().planDetail({ records: twice, existing: [] });
      assertEqual(first.counts.ajoutees, 2); assertEqual(first.counts.cles, 1);
      const again = D().planDetail({ records: twice, existing: [grist(1, { 'Total CP consommé': 10 }), grist(2, { 'Total CP consommé': 20 })] });
      assertEqual(again.actionCount, 0);
    });

    it('un montant à un demi-centime près n\'est pas une modification ; un champ vidé dans le fichier est vidé dans Grist', function () {
      const existing = [grist(1, { 'Total CP consommé': 800.004, Fournisseur: 'ANCIEN' })];
      const plan = D().planDetail({ records: [rec({ Fournisseur: null })], existing });
      const upd = plan.phase1[0];
      assertEqual(upd.fields.Fournisseur, ''); assertFalse('CP_consomme' in upd.fields);
    });

    it('les dépenses dont le N° OPE n\'est dans aucune ligne OPE sont signalées (sans rien bloquer)', function () {
      const plan = D().planDetail({ records: [rec(), rec({ 'N° EJ': 'X', 'Code Opération': 'OPE-INCONNUE' })], existing: [], opeKeys: new Set(['OPE-FICT-001']) });
      assertDeepEqual(plan.noOpe, ['OPE-INCONNUE']); assertEqual(plan.counts.ajoutees, 2);
    });

    it('écrire puis annuler : les lignes ajoutées sont supprimées, les modifiées reviennent à leur valeur d\'avant, une ligne retouchée à la main est laissée', async function () {
      const existing = [grist(2, { 'N° EJ': 'CDE-0003' })];
      const plan = D().planDetail({ records: [rec({ 'N° EJ': 'CDE-NEW' }), rec({ 'N° EJ': 'CDE-0003', 'Total CP consommé': 900 })], existing });
      const journal = [], applied = [];
      const result = await L().execute(plan, { apply: async actions => { applied.push(...actions); return actions.map((a, i) => (a[0] === 'AddRecord' ? 700 + i : null)); }, addJournal: async rows => { journal.push(...rows); }, now: () => new Date(Date.UTC(2026, 10, 24, 15)) });
      assertEqual(result.error, null);
      assertEqual(result.ajouts.Depenses_OPE.length, 1); assertEqual(result.modifs.Depenses_OPE.length, 1);
      const rows = journal.map((r, i) => Object.assign({ id: i + 1 }, r));
      const added = Object.assign({ id: result.ajouts.Depenses_OPE[0] }, applied.find(a => a[0] === 'AddRecord')[3]);
      const modified = Object.assign({}, existing[0], applied.find(a => a[0] === 'UpdateRecord')[3]);
      const undo = L().planUndo(rows, result.lot, { Depenses_OPE: [added, modified] });
      assertEqual(undo.skipped.length, 0);
      assertTrue(undo.actions.some(a => a[0] === 'RemoveRecord' && a[1] === 'Depenses_OPE' && a[2] === added.id));
      assertEqual(undo.actions.find(a => a[0] === 'UpdateRecord')[3].CP_consomme, 800);
      const touched = L().planUndo(rows, result.lot, { Depenses_OPE: [Object.assign({}, added, { Libelle_objet: 'retouché' }), modified] });
      assertEqual(touched.skipped.length, 1); assertEqual(touched.skipped[0].why, 'modifiée depuis l\'import');
    });
  });

  // ===========================================================================================================
  describe('Détail des dépenses (FD02) — la page Import financier', function () {
    const P = () => window.ImportHistoriquePage;
    const byId = id => document.getElementById(id);
    const click = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const grist = name => CoreGrist.getTable(name);

    async function open() {
      window.__mockSetTable('Import_Financements', { id: [], N_OPE: [] });
      window.__mockSetTable('Projets', { id: [] }); window.__mockSetTable('Lignes_OPE', { id: [], N_OPE: [] });
      P().resetState();
      await P().open();
      click(document.querySelector('[data-ih-tab="bo"]'));   // le détail est l'import BO : son onglet, pas celui d'UB Invest
    }
    // Le classeur est « lu » par un faux XlsxReader : les lignes sont celles du faux export FD02.
    async function pick(rows, name = 'fd02-fictif.xlsx') {
      const original = window.XlsxReader.read;
      window.XlsxReader.read = async () => ({ sheetNames: ['Consommation détaillée AE'], sheetName: 'Consommation détaillée AE', rows });
      try {
        const input = byId('ih-file-fd02'), dt = new DataTransfer();
        dt.items.add(new File(['x'], name)); input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await waitFor(() => !/Lecture de/.test(byId('ih-root').textContent), 'fichier lu');
      } finally { window.XlsxReader.read = original; }
    }
    const box = () => document.querySelector('[data-ih-box="detail"]');
    const ack = () => { const check = byId('ih-fd-ack'); check.checked = true; fire(check, 'change'); };

    it('choisir un fichier ne modifie rien : la relecture dit ce qui sera ajouté', async function () {
      await open();
      window.__TEST_CALLS__.length = 0;
      await pick(sheet([dataRow(), dataRow({ 'N° EJ': 'CDE-0002', 'Total CP consommé': 50 })]));
      assertTrue(box().open, 'la boîte s\'ouvre sur la relecture');
      assertIncludes(box().textContent, '+2'); assertIncludes(box().textContent, 'données au 16/06/2026'); assertIncludes(box().textContent, 'exercice 2026');
      assertFalse(window.__TEST_CALLS__.some(call => call.table === 'Depenses_OPE' && ['AddRecord', 'UpdateRecord', 'AddTable'].includes(call.type)), 'rien n\'est écrit avant l\'accord');
      assertTrue(byId('ih-fd-write').disabled, 'le bouton attend la relecture');
    });

    it('écrire : Depenses_OPE reçoit les lignes, un lot « Détail » est enregistré (données au, comptes), le journal permet d\'annuler', async function () {
      await open();
      await pick(sheet([dataRow(), dataRow({ 'N° EJ': 'CDE-0002', 'Total CP consommé': 50 })]));
      ack(); click(byId('ih-fd-write'));
      await waitFor(() => document.querySelector('.ih-banner.is-ok'), 'résultat de l\'écriture');
      assertIncludes(document.querySelector('.ih-banner').textContent, '2 lignes ajoutées');
      const rows = await grist('Depenses_OPE');
      assertEqual(rows.length, 2);
      assertEqual(rows.find(r => r.Num_EJ === 'CDE-0002').CP_consomme, 50); assertEqual(rows[0].Donnees_au, UTC(2026, 6, 16)); assertEqual(rows[0].Code_operation, 'OPE-FICT-001');
      const lots = await grist('Import_Lots');
      assertEqual(lots.length, 1);
      assertEqual(lots[0].Type, 'Détail'); assertEqual(lots[0].Source, 'Fichier'); assertEqual(lots[0].Statut, 'Valide'); assertEqual(lots[0].Ajoutees, 2); assertEqual(lots[0].Donnees_au, UTC(2026, 6, 16));
      assertTrue(!!lots[0].Lot_journal);
      const journal = await grist('Import_Journal');
      assertEqual(journal.filter(r => r.Table_modifiee === 'Depenses_OPE' && r.Operation === 'ajout').length, 2);
    });

    it('le mois suivant : les lignes déjà là sont reconnues, seul ce qui change est écrit, une ligne qui n\'est plus dans le fichier reste', async function () {
      await open();
      await pick(sheet([dataRow(), dataRow({ 'N° EJ': 'CDE-0002' })]));
      ack(); click(byId('ih-fd-write'));
      await waitFor(() => document.querySelector('.ih-banner.is-ok'), 'premier import');
      await pick(sheet([dataRow({ 'Total CP consommé': 900 }), dataRow({ 'N° EJ': 'CDE-0003' })]));
      assertIncludes(box().textContent, '+1'); assertIncludes(box().textContent, '1 modifiée'); assertIncludes(box().textContent, 'Total CP consommé');
      assertIncludes(box().textContent, '1 ligne de Grist n\'est plus dans ce fichier');
      ack(); click(byId('ih-fd-write'));
      await waitFor(() => /1 ligne modifiée/.test(document.querySelector('.ih-banner').textContent), 'second import');
      const rows = await grist('Depenses_OPE');
      assertEqual(rows.length, 3, 'rien n\'est supprimé');
      assertEqual(rows.find(r => r.Num_EJ === 'CDE-0001').CP_consomme, 900);
      assertEqual(rows.find(r => r.Num_EJ === 'CDE-0002').CP_consomme, 800);
      assertEqual((await grist('Import_Lots')).length, 2);
    });

    it('un fichier identique à ce qui est déjà dans Grist : rien à écrire', async function () {
      await open();
      await pick(sheet([dataRow()]));
      ack(); click(byId('ih-fd-write'));
      await waitFor(() => document.querySelector('.ih-banner.is-ok'), 'import');
      await pick(sheet([dataRow()]));
      assertIncludes(box().textContent, 'Rien à écrire'); assertTrue(byId('ih-fd-write').disabled);
    });

    it('un fichier qui n\'est pas un FD02 ou qui a une valeur illisible n\'est pas chargé, et la raison est dite', async function () {
      await open();
      await pick([['a', 'b'], [1, 2]]);
      assertIncludes(box().textContent, 'ce n\'est pas un export FD02'); assertFalse(!!byId('ih-fd-write'));
      await pick(sheet([dataRow({ 'Total CP consommé': 'beaucoup' })]));
      assertIncludes(box().textContent, '1 valeur illisible'); assertIncludes(box().textContent, 'Total CP consommé'); assertIncludes(box().textContent, 'beaucoup');
    });

    it('annuler le lot écrit : les lignes ajoutées sont retirées et le lot passe en Annulé', async function () {
      await open();
      await pick(sheet([dataRow(), dataRow({ 'N° EJ': 'CDE-0002' })]));
      ack(); click(byId('ih-fd-write'));
      await waitFor(() => document.querySelector('.ih-banner.is-ok'), 'import');
      assertEqual((await grist('Depenses_OPE')).length, 2);
      click(document.querySelector('[data-ih-undo]'));
      await waitFor(() => document.querySelector('[data-ih-undo-confirm]'), 'confirmation');
      click(document.querySelector('[data-ih-undo-confirm]'));
      await waitFor(() => /Lot annulé/.test(document.querySelector('.ih-banner').textContent), 'annulation');
      assertEqual((await grist('Depenses_OPE')).length, 0);
      assertEqual((await grist('Import_Lots'))[0].Statut, 'Annule');
    });
    it('deux onglets distincts : UB Invest (totaux par OPE) par défaut, BO (détail par OPE) à part, chacun avec ses propres boîtes', async function () {
      window.__mockSetTable('Import_Financements', { id: [], N_OPE: [] });
      window.__mockSetTable('Projets', { id: [] }); window.__mockSetTable('Lignes_OPE', { id: [], N_OPE: [] });
      P().resetState();
      await P().open();
      const tab = id => document.querySelector(`[data-ih-tab="${id}"]`);
      assertEqual(tab('ubinvest').getAttribute('aria-selected'), 'true', 'UB Invest est l\'onglet par défaut');
      assertTrue(!!document.querySelector('[data-ih-box="formulaire"]'), 'UB Invest : le formulaire du script');
      assertFalse(!!document.querySelector('[data-ih-box="detail"]'), 'le détail BO n\'est pas dans l\'onglet UB Invest');
      assertIncludes(tab('ubinvest').textContent, 'totaux par OPE'); assertIncludes(tab('bo').textContent, 'détail par OPE');
      click(tab('bo'));
      assertEqual(tab('bo').getAttribute('aria-selected'), 'true');
      assertTrue(!!document.querySelector('[data-ih-box="detail"]'), 'BO : le détail des dépenses');
      assertFalse(!!document.querySelector('[data-ih-box="formulaire"]'), 'le formulaire du script n\'est pas dans l\'onglet BO');
      assertFalse(!!byId('ih-pick'), 'le chargement du fichier UB Invest n\'est pas dans l\'onglet BO');
      click(tab('ubinvest'));
      assertTrue(!!document.querySelector('[data-ih-box="formulaire"]'), 'retour sur UB Invest');
    });

    it('le résultat d\'une écriture BO et ses lots restent dans l\'onglet BO, jamais dans celui d\'UB Invest', async function () {
      await open();
      await pick(sheet([dataRow()]));
      ack(); click(byId('ih-fd-write'));
      await waitFor(() => document.querySelector('.ih-banner.is-ok'), 'résultat de l\'écriture');
      assertTrue(!!document.querySelector('[data-ih-box="lots"]'), 'le lot BO est listé dans l\'onglet BO');
      assertIncludes(document.querySelector('[data-ih-box="lots"] summary').textContent, 'Lots BO');
      click(document.querySelector('[data-ih-tab="ubinvest"]'));
      assertFalse(!!document.querySelector('.ih-banner.is-ok'), 'le résultat BO ne s\'affiche pas dans l\'onglet UB Invest');
      assertFalse(!!document.querySelector('[data-ih-box="lots"]'), 'le lot BO n\'est pas listé parmi les lots UB Invest');
    });
  });
})();
