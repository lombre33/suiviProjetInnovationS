/**
 * Non-regression suite : plusieurs OPE par projet (demande d'Antoine du 24/11/2026, maquette validée le jour même).
 *
 * Onglet « Dates & OPE » → « Instance et dates » ; onglet « Budget » → « Budget et OPE » : une carte repliable par OPE (jusqu'à 4)
 * avec ligne OPE, installée chez, action, commentaire et répartition 2026-2029, un total croisé du projet dès 2 OPE.
 * Aucune nouvelle table : l'OPE 1 garde les colonnes de Projets, les OPE 2 à 4 ont les mêmes colonnes suffixées _2/_3/_4 (15 chacune),
 * créées par le widget (CoreGrist.ensureColumns) au premier enregistrement qui en a besoin.
 *
 * Couvre : CoreOpes (noms, lecture, totaux, colonnes manquantes), la modale (onglets, ajout/retrait/renumérotation, saisie, enregistrement,
 * création des colonnes, vidage des rangs retirés, convention, validation, bulles d'aide), le Dashboard et le Budget du Kanban.
 */
(function () {
  'use strict';

  const O = () => window.CoreOpes;
  const modalEl = () => document.getElementById('cp-project-modal');
  const refInput = key => modalEl().querySelector(`[data-ref="${key}"]`);
  const cards = () => Array.from(modalEl().querySelectorAll('.cp-ope'));
  const card = rank => modalEl().querySelector(`.cp-ope[data-ope-rank="${rank}"]`);
  const addButton = () => modalEl().querySelector('[data-ope-add]');
  const totalBlock = () => modalEl().querySelector('.cp-total');
  const summary = () => modalEl().querySelector('[data-fin-summary]').textContent;
  const calls = type => window.__TEST_CALLS__.filter(call => call.type === type);
  const flat = text => text.replace(/[\s\u00a0\u202f]+/g, ' ').trim();
  // Nombre comme les cellules des tableaux l'affichent (espace fine insécable entre les milliers), ramené à une espace simple.
  const nb = value => flat(Number(value).toLocaleString('fr-FR'));

  function pickRef(key, query, matchText) {
    const input = refInput(key);
    setValue(input, query);
    fire(input, 'input');
    const button = Array.from(input.parentElement.querySelector('.cp-ref-list').querySelectorAll('button')).find(b => b.textContent === matchText);
    assertTrue(!!button, `aucune option "${matchText}" pour ${key}`);
    button.click();
  }
  async function loadFixtureState() {
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    return tables;
  }
  const setFin = (column, value) => {
    const input = modalEl().querySelector(`[data-fin="${column}"]`);
    assertTrue(!!input, `champ de montant ${column} introuvable`);
    setValue(input, String(value));
    fire(input, 'input');
  };
  const addOpe = () => { addButton().click(); };
  const comment = rank => card(rank).querySelector('textarea');
  const setComment = (rank, value) => { setValue(comment(rank), value); fire(comment(rank), 'input'); };
  const chip = (rank, value) => card(rank).querySelector(`.cp-chip-row [data-value="${value}"]`);

  // Même base que suite-project-modal.js : tous les champs obligatoires remplis, Fonctionnement 2026 de l'OPE 1 = 1 000 €.
  async function fillMinimalValidProject() {
    window.ProjectModal.open();
    pickRef('Programme', 'Programme A', 'Programme A');
    setValue(modalEl().querySelector('#cp-Projet'), 'Mon nouveau projet');
    setValue(modalEl().querySelector('#cp-Acronyme'), 'MNP');
    pickRef('Porteur_1', 'Alice', 'Alice Martin');
    pickRef('VP_porteur_signataire_notif', 'Bob', 'Bob Durand');
    pickRef('Accompagnateur', 'Bob', 'Bob Durand');
    pickRef('Instance_ratachee', 'Comité', 'Comité innovation#3 - 2026-03-15');
    setValue(modalEl().querySelector('#cp-Date_limite_financement'), '2027-01-15');
    chip(1, 'Creation de ligne').click();
    setFin('c2026_M10_Fonctionnement', '1000');
  }

  // Ajoute à Projets (magasin du mock) les colonnes des OPE 2 à `upTo`, comme après un premier enregistrement, et remplit la ligne `id`.
  async function giveProjectOpes(id, upTo, valuesByColumn) {
    const table = await window.grist.docApi.fetchTable('Projets');
    const at = table.id.indexOf(id);
    for (let rank = 2; rank <= upTo; rank += 1) {
      O().columnsOf(rank).forEach(col => { table[col] = table.id.map(() => (col.startsWith('Ligne_OPE') ? ['L'] : (/^c\d{4}_/.test(col) ? 0 : ''))); });
    }
    Object.entries(valuesByColumn || {}).forEach(([col, value]) => { table[col][at] = value; });
    window.__mockSetTable('Projets', table);
  }
  const projectRecord = id => window.CoreState.getTable('Projets').find(p => p.id === id);

  // ===========================================================================================================
  describe('Plusieurs OPE par projet — CoreOpes : noms de colonnes, lecture et totaux', function () {
    it('l\'OPE 1 garde les colonnes historiques, les OPE 2 à 4 portent le suffixe _2/_3/_4', function () {
      assertEqual(O().ligneColumn(1), 'Ligne_OPE');
      assertEqual(O().actionColumn(1), 'Action_Ligne_OPE_a_faire');
      assertEqual(O().commentColumn(1), 'Commentaire_ligne_OPE');
      assertEqual(O().amountColumn(1, 2026, 'F'), 'c2026_M10_Fonctionnement');
      assertEqual(O().ligneColumn(3), 'Ligne_OPE_3');
      assertEqual(O().actionColumn(2), 'Action_Ligne_OPE_a_faire_2');
      assertEqual(O().commentColumn(4), 'Commentaire_ligne_OPE_4');
      assertEqual(O().amountColumn(2, 2027, 'I'), 'c2027_M20_Investissement_2');
      assertEqual(O().amountColumn(4, 2029, 'P'), 'c2029_M30_Personnel_4');
      assertEqual(O().amountColumn(2, 2026, 'M10_Fonctionnement'), 'c2026_M10_Fonctionnement_2', 'la masse (M10_…) est aussi acceptée');
    });

    it('15 colonnes par OPE (ligne, action, commentaire, 12 montants), 45 pour les OPE 2 à 4, sans doublon', function () {
      [1, 2, 3, 4].forEach(rank => assertEqual(O().columnsOf(rank).length, 15, `OPE ${rank}`));
      const extra = [2, 3, 4].flatMap(rank => O().columnsOf(rank));
      assertEqual(extra.length, 45);
      assertEqual(new Set(extra).size, 45, 'aucun doublon');
      assertEqual(window.RedactionVariables.OPE_EXTRA_COLUMNS.length, 45);
    });

    it('baseColumn ramène une colonne d\'OPE 2 à 4 à celle de l\'OPE 1 (bulles d\'aide), et laisse les autres telles quelles', function () {
      assertEqual(O().baseColumn('Ligne_OPE_2'), 'Ligne_OPE');
      assertEqual(O().baseColumn('Action_Ligne_OPE_a_faire_4'), 'Action_Ligne_OPE_a_faire');
      assertEqual(O().baseColumn('Commentaire_ligne_OPE_3'), 'Commentaire_ligne_OPE');
      assertEqual(O().baseColumn('Ligne_OPE_installe_chez_2'), 'Ligne_OPE_installe_chez');
      assertEqual(O().baseColumn('c2028_M30_Personnel_3'), 'c2028_M30_Personnel');
      assertEqual(O().baseColumn('Ligne_OPE'), 'Ligne_OPE');
      assertEqual(O().baseColumn('Convention_montant_partenaire_2'), 'Convention_montant_partenaire_2', 'une colonne sans rapport avec les OPE n\'est jamais ramenée');
      assertEqual(O().baseColumn('Porteur_2'), 'Porteur_2');
    });

    it('définitions des colonnes à créer : liste de références, choix de l\'action, texte, montants Numeric, description reprise de l\'OPE 1', function () {
      const defs = O().columnDefinitions(2, col => (col === 'Ligne_OPE' ? 'Ligne de l\'opération' : ''));
      assertEqual(defs.length, 15);
      const byId = Object.fromEntries(defs.map(def => [def.id, def]));
      assertEqual(byId.Ligne_OPE_2.type, 'RefList:Lignes_OPE');
      assertEqual(byId.Ligne_OPE_2.description, 'Ligne de l\'opération');
      assertEqual(byId.Action_Ligne_OPE_a_faire_2.type, 'Choice');
      assertDeepEqual(JSON.parse(byId.Action_Ligne_OPE_a_faire_2.widgetOptions).choices, ['Creation de ligne', 'Prolongation de ligne', 're-Abondement de ligne', 'à determiner']);
      assertEqual(byId.Commentaire_ligne_OPE_2.type, 'Text');
      assertEqual(byId.c2026_M10_Fonctionnement_2.type, 'Numeric');
      assertEqual(defs.filter(def => def.type === 'Numeric').length, 12);
      assertTrue(defs.every(def => def.isFormula === false), 'jamais une colonne calculée');
      assertEqual(byId.Commentaire_ligne_OPE_2.description, undefined, 'pas de description inventée quand la colonne d\'origine n\'en a pas');
    });

    it('missingColumns ne rend que les colonnes absentes, et rien pour l\'OPE 1', function () {
      assertEqual(O().missingColumns(new Set(), 1).length, 0, 'l\'OPE 1 existe toujours');
      assertEqual(O().missingColumns(new Set(), 2).length, 15);
      assertEqual(O().missingColumns(new Set(), 4).length, 45);
      const existing = new Set(O().columnsOf(2));
      assertEqual(O().missingColumns(existing, 3).length, 15, 'seules celles de l\'OPE 3');
      existing.delete('c2027_M20_Investissement_2');
      assertDeepEqual(O().missingColumns(existing, 2).map(def => def.id), ['c2027_M20_Investissement_2']);
    });

    it('read lit une OPE (ligne, action, commentaire, 3 natures × 4 années) ; un montant absent vaut 0', function () {
      const project = { Ligne_OPE_2: ['L', 5, 6], Action_Ligne_OPE_a_faire_2: 'Prolongation de ligne', Commentaire_ligne_OPE_2: 'note', c2026_M10_Fonctionnement_2: 100, c2028_M30_Personnel_2: '40' };
      const ope = O().read(project, 2);
      assertDeepEqual(ope.ligneIds, [5, 6]);
      assertEqual(ope.action, 'Prolongation de ligne');
      assertEqual(ope.comment, 'note');
      assertDeepEqual(ope.amounts.F, [100, 0, 0, 0]);
      assertDeepEqual(ope.amounts.P, [0, 0, 40, 0]);
      assertEqual(O().total(ope), 140);
      assertEqual(O().total(O().read({}, 3)), 0, 'colonnes absentes : 0');
      assertDeepEqual(O().read(null, 2).ligneIds, []);
    });

    it('count : le plus haut rang réellement utilisé ; une action « à déterminer » seule n\'est pas une OPE', function () {
      assertEqual(O().count(null), 1);
      assertEqual(O().count({}), 1);
      assertEqual(O().count({ Action_Ligne_OPE_a_faire_2: 'à determiner' }), 1, 'valeur par défaut d\'une OPE tout juste ajoutée');
      assertEqual(O().count({ Commentaire_ligne_OPE_2: 'x' }), 2);
      assertEqual(O().count({ Ligne_OPE_3: ['L', 2] }), 3);
      assertEqual(O().count({ c2029_M20_Investissement_4: 10 }), 4);
      assertEqual(O().count({ Action_Ligne_OPE_a_faire_2: 'Creation de ligne' }), 2);
    });

    it('ligneIds : les lignes de toutes les OPE, sans doublon, OPE 1 d\'abord', function () {
      assertDeepEqual(O().ligneIds({ Ligne_OPE: ['L', 3], Ligne_OPE_2: ['L', 1, 3], Ligne_OPE_4: ['L', 7] }), [3, 1, 7]);
      assertDeepEqual(O().ligneIds({ Ligne_OPE: ['L'] }), []);
    });

    it('yearAmount et totals additionnent les OPE demandées', function () {
      const project = { c2026_M10_Fonctionnement: 100, c2026_M20_Investissement: 50, c2026_M10_Fonctionnement_2: 10, c2026_M30_Personnel_3: 5, c2027_M10_Fonctionnement_2: 1 };
      assertEqual(O().yearAmount(project, 2026), 165);
      assertEqual(O().yearAmount(project, 2026, [2, 3, 4]), 15);
      assertEqual(O().yearAmount(project, 2023), 0);
      const totals = O().totals(project);
      assertEqual(totals.grand, 166);
      assertDeepEqual(totals.byRank, [150, 11, 5, 0]);
      assertDeepEqual(totals.byNature.F, [110, 1, 0, 0]);
      assertDeepEqual(totals.byYear, [165, 1, 0, 0]);
      assertEqual(O().totals(project, 2).grand, 161, 'limité aux OPE 1 et 2');
    });
  });

  // ===========================================================================================================
  describe('Plusieurs OPE par projet — onglets et contenu de la modale', function () {
    it('les onglets s\'appellent « Instance et dates » et « Budget et OPE » ; les clés des onglets ne changent pas', function () {
      window.ProjectModal.open();
      const labels = Object.fromEntries(Array.from(modalEl().querySelectorAll('.cp-tab')).map(tab => [tab.dataset.cpTab, tab.firstChild.textContent]));
      assertEqual(labels.dates, 'Instance et dates');
      assertEqual(labels.budget, 'Budget et OPE');
      assertEqual(labels.general, 'Général');
      assertEqual(labels.conventions, 'Convention');
    });

    it('« Instance et dates » ne garde que l\'instance, les trois dates et la période : les champs OPE sont passés dans « Budget et OPE »', function () {
      window.ProjectModal.open();
      const dates = modalEl().querySelector('[data-cp-panel="dates"]'), budget = modalEl().querySelector('[data-cp-panel="budget"]');
      ['[data-ref="Instance_ratachee"]', '#cp-Date_limite_financement', '#cp-Date_debut_Projet', '#cp-Date_de_fin_Projet', '#cp-Periode'].forEach(selector => assertTrue(!!dates.querySelector(selector), `${selector} dans Instance et dates`));
      ['[data-ref="Ligne_OPE"]', '#cp-Ligne_OPE_installe_chez', '#cp-Action_Ligne_OPE_a_faire', '#cp-Commentaire_ligne_OPE'].forEach(selector => {
        assertFalse(!!dates.querySelector(selector), `${selector} n'est plus dans Instance et dates`);
        assertTrue(!!budget.querySelector(selector), `${selector} est dans Budget et OPE`);
      });
      assertEqual(budget.querySelectorAll('[data-fin]').length, 12, 'la répartition de l\'OPE 1');
      assertTrue(!!(budget.querySelector('.cp-ope').compareDocumentPosition(budget.querySelector('.cp-cofin')) & Node.DOCUMENT_POSITION_FOLLOWING), 'Co-financements reste sous les OPE');
    });

    it('à l\'ouverture : une seule carte (OPE 1, déployée, non supprimable), le bouton « Ajouter l\'OPE 2 », ni total croisé ni pastille', function () {
      window.ProjectModal.open();
      assertEqual(cards().length, 1);
      assertTrue(card(1).classList.contains('open'));
      assertFalse(card(1).querySelector('.cp-ope-body').hidden, 'corps déployé');
      assertFalse(!!card(1).querySelector('.cp-ope-del'), 'l\'OPE 1 ne se retire pas');
      assertIncludes(addButton().textContent, 'Ajouter l’OPE 2');
      assertTrue(totalBlock().hidden, 'pas de total croisé avec une seule OPE');
      assertTrue(modalEl().querySelector('[data-cp-tab="budget"] .cp-tab-count').hidden, 'pas de pastille avec une seule OPE');
      assertEqual(modalEl().querySelector('[data-ope-count]').textContent, '', 'le bandeau reste « Prévisionnel 2026–2029 »');
    });

    it('le panneau Budget et OPE colle le bandeau du prévisionnel en haut (corps sans marge haute)', function () {
      window.ProjectModal.open();
      modalEl().querySelector('[data-cp-tab="budget"]').click();
      assertTrue(modalEl().querySelector('#cp-project-form').classList.contains('is-budget'));
      modalEl().querySelector('[data-cp-tab="general"]').click();
      assertFalse(modalEl().querySelector('#cp-project-form').classList.contains('is-budget'));
    });

    it('la feuille de style définit les cartes OPE, le bandeau collant et le total croisé', async function () {
      const css = await (await fetch('../css/creation-projet.css', { cache: 'no-store' })).text();
      ['.cp-ope-head', '.cp-ope-add', '.cp-total', '.cp-conv.ok', '.cp-conv.ko', '--ope-4'].forEach(token => assertTrue(css.includes(token), `${token} dans creation-projet.css`));
      assertTrue(/\.cp-fin-summary\s*\{[^}]*position\s*:\s*sticky/.test(css), 'le bandeau du prévisionnel est collant');
      assertTrue(/\.cp-body\.is-budget\s*\{[^}]*padding-top\s*:\s*0/.test(css));
    });
  });

  // ===========================================================================================================
  describe('Plusieurs OPE par projet — ajouter, remplir et retirer une OPE', function () {
    it('« + Ajouter » crée l\'OPE suivante : déployée, action « À déterminer », sans replier les autres ; au plus 4', function () {
      window.ProjectModal.open();
      addOpe();
      assertEqual(cards().length, 2);
      assertTrue(card(1).classList.contains('open'), 'l\'OPE 1 reste déployée');
      assertTrue(card(2).classList.contains('open'));
      assertEqual(card(2).querySelector('select').value, 'à determiner');
      assertTrue(chip(2, 'à determiner').classList.contains('active'));
      assertIncludes(addButton().textContent, 'Ajouter l’OPE 3');
      assertEqual(modalEl().querySelectorAll('[data-fin]').length, 24);
      addOpe(); addOpe();
      assertEqual(cards().length, 4);
      assertFalse(!!addButton(), 'plus de bouton à 4 OPE');
      assertIncludes(modalEl().querySelector('.cp-ope-max').textContent, '4 OPE');
      assertEqual(modalEl().querySelectorAll('[data-fin]').length, 48);
    });

    it('chaque carte a ses propres identifiants et colonnes (_2, _3, _4) ; l\'OPE 1 garde les historiques', function () {
      window.ProjectModal.open();
      addOpe(); addOpe(); addOpe();
      ['', '_2', '_3', '_4'].forEach((suffix, i) => {
        const el = card(i + 1);
        assertTrue(!!el.querySelector(`[data-ref="Ligne_OPE${suffix}"]`), `Ligne_OPE${suffix}`);
        assertTrue(!!el.querySelector(`#cp-Ligne_OPE_installe_chez${suffix}`), `installée chez ${suffix}`);
        assertTrue(!!el.querySelector(`#cp-Action_Ligne_OPE_a_faire${suffix}`), `action ${suffix}`);
        assertTrue(!!el.querySelector(`#cp-Commentaire_ligne_OPE${suffix}`), `commentaire ${suffix}`);
        assertTrue(!!el.querySelector(`[data-fin="c2029_M30_Personnel${suffix}"]`), `montant 2029 personnel ${suffix}`);
      });
      assertEqual(modalEl().querySelectorAll('[data-fin]').length, 48);
      assertEqual(new Set(Array.from(modalEl().querySelectorAll('[data-fin]')).map(i => i.dataset.fin)).size, 48, 'aucune colonne en double');
    });

    it('les montants d\'une OPE alimentent son total, le bandeau du projet, la pastille de l\'onglet et le total croisé', function () {
      window.ProjectModal.open();
      setFin('c2026_M10_Fonctionnement', 1000);
      assertEqual(flat(summary()), '1 000 €');
      addOpe();
      setFin('c2026_M10_Fonctionnement_2', 500);
      setFin('c2027_M30_Personnel_2', 250);
      assertEqual(flat(card(2).querySelector('[data-ope-sum]').textContent), '750 €');
      assertEqual(flat(card(1).querySelector('[data-ope-sum]').textContent), '1 000 €');
      assertEqual(flat(summary()), '1 750 €');
      assertEqual(modalEl().querySelector('[data-ope-count]').textContent, ' · 2 OPE');
      const badge = modalEl().querySelector('[data-cp-tab="budget"] .cp-tab-count');
      assertFalse(badge.hidden);
      assertEqual(badge.textContent, '2');
      assertEqual(card(2).querySelector('[data-grand-total]').textContent, '750');
      assertEqual(card(2).querySelector('[data-total="2027"]').textContent, '250');
      assertEqual(card(2).querySelector('[data-row-total="Details_depense_s_Personnel"]').textContent, '250');
      assertEqual(card(1).querySelector('[data-grand-total]').textContent, (1000).toLocaleString('fr-FR'));
    });

    it('total croisé « Par nature » (défaut) : une ligne par nature, les OPE réunies, et « Total projet » en pied', function () {
      window.ProjectModal.open();
      setFin('c2026_M10_Fonctionnement', 1000);
      addOpe();
      setFin('c2026_M10_Fonctionnement_2', 500);
      setFin('c2026_M20_Investissement_2', 70);
      assertFalse(totalBlock().hidden, 'visible dès 2 OPE');
      const rows = Array.from(totalBlock().querySelectorAll('tbody tr')).map(tr => Array.from(tr.children).map(td => flat(td.textContent)));
      assertEqual(rows.length, 3);
      assertEqual(rows[0][0], 'Fonctionnement');
      assertEqual(rows[0][1], nb(1500), 'Fonctionnement 2026 = 1 000 + 500');
      assertEqual(rows[1][0], 'Investissement');
      assertEqual(rows[1][1], '70');
      assertEqual(rows[2][0], 'Personnel');
      const foot = Array.from(totalBlock().querySelectorAll('tfoot td')).map(td => flat(td.textContent));
      assertEqual(foot[0], nb(1570), 'total 2026 du projet');
      assertEqual(foot[foot.length - 1], nb(1570), 'total général du projet');
      assertEqual(totalBlock().querySelector('[data-total-mode="nature"]').getAttribute('aria-pressed'), 'true');
    });

    it('« Par OPE » : une ligne par OPE (avec la ligne choisie), barre et légende proportionnelles', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      setFin('c2026_M10_Fonctionnement', 3000);
      pickRef('Ligne_OPE', 'OPE-2026-001', 'OPE-2026-001');
      addOpe();
      setFin('c2027_M10_Fonctionnement_2', 1000);
      totalBlock().querySelector('[data-total-mode="ope"]').click();
      assertEqual(totalBlock().querySelector('[data-total-mode="ope"]').getAttribute('aria-pressed'), 'true');
      const rows = Array.from(totalBlock().querySelectorAll('tbody tr'));
      assertEqual(rows.length, 2);
      assertIncludes(flat(rows[0].children[0].textContent), 'OPE 1 · OPE-2026-001');
      assertEqual(flat(rows[1].children[0].textContent), 'OPE 2', 'OPE 2 sans ligne choisie : seulement son numéro d\'ordre');
      assertEqual(flat(rows[1].lastElementChild.textContent), nb(1000));
      const bars = totalBlock().querySelectorAll('.cp-total-bar i');
      assertEqual(bars.length, 2);
      assertEqual(bars[0].style.flexGrow, '3000');
      assertEqual(bars[1].style.flexGrow, '1000');
      const legend = flat(totalBlock().querySelector('.cp-total-legend').textContent);
      assertIncludes(legend, '75 %');
      assertIncludes(legend, '25 %');
    });

    it('une OPE sans montant n\'a pas de segment dans la barre', function () {
      window.ProjectModal.open();
      setFin('c2026_M10_Fonctionnement', 100);
      addOpe();
      assertEqual(totalBlock().querySelectorAll('.cp-total-bar i').length, 1);
    });

    it('choisir la ligne OPE ou l\'action met à jour l\'en-tête de la carte (numéro et action) et « Installée chez »', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      addOpe();
      assertEqual(card(2).querySelector('[data-ope-name]').textContent, 'Ligne OPE à choisir');
      assertTrue(card(2).querySelector('[data-ope-name]').classList.contains('is-empty'));
      assertEqual(card(2).querySelector('[data-ope-act]').textContent, 'À déterminer');
      pickRef('Ligne_OPE_2', 'OPE-2026-002', 'OPE-2026-002');
      assertEqual(card(2).querySelector('[data-ope-name]').textContent, 'OPE-2026-002');
      assertEqual(card(2).querySelector('#cp-Ligne_OPE_installe_chez_2').value, 'DIR1', 'recalculée depuis la ligne choisie, comme pour l\'OPE 1');
      assertEqual(card(1).querySelector('#cp-Ligne_OPE_installe_chez').value, '', 'l\'OPE 1 n\'est pas touchée');
      chip(2, 'Prolongation de ligne').click();
      assertEqual(card(2).querySelector('[data-ope-act]').textContent, 'Prolongation');
      fireMouse(refInput('Ligne_OPE_2').parentElement.querySelector('.cp-ref-clear'), 'mousedown');
      assertEqual(card(2).querySelector('[data-ope-name]').textContent, 'Ligne OPE à choisir');
      assertEqual(card(2).querySelector('#cp-Ligne_OPE_installe_chez_2').value, '');
    });

    it('un clic sur l\'en-tête replie et déplie la carte', function () {
      window.ProjectModal.open();
      const head = card(1).querySelector('.cp-ope-head');
      head.click();
      assertTrue(card(1).querySelector('.cp-ope-body').hidden);
      assertEqual(head.getAttribute('aria-expanded'), 'false');
      head.click();
      assertFalse(card(1).querySelector('.cp-ope-body').hidden);
      assertEqual(head.getAttribute('aria-expanded'), 'true');
    });

    it('retirer une OPE vide : aucune confirmation, retirée tout de suite, le bouton « Ajouter » revient', function () {
      window.ProjectModal.open();
      addOpe();
      card(2).querySelector('.cp-ope-del').click();
      assertEqual(cards().length, 1);
      assertIncludes(addButton().textContent, 'Ajouter l’OPE 2');
      assertTrue(totalBlock().hidden);
    });

    it('retirer une OPE qui contient des données demande confirmation : « Garder » la conserve, « Retirer » la supprime', function () {
      window.ProjectModal.open();
      addOpe();
      setFin('c2026_M10_Fonctionnement_2', 500);
      card(2).querySelector('.cp-ope-del').click();
      assertEqual(cards().length, 2, 'pas retirée avant confirmation');
      const confirm = card(2).querySelector('.cp-ope-confirm');
      assertFalse(confirm.hidden);
      assertIncludes(confirm.textContent, 'Retirer l’OPE 2');
      confirm.querySelector('[data-ope-confirm-keep]').click();
      assertTrue(confirm.hidden);
      assertEqual(cards().length, 2);
      card(2).querySelector('.cp-ope-del').click();
      card(2).querySelector('[data-ope-confirm-go]').click();
      assertEqual(cards().length, 1);
      assertEqual(flat(summary()), '0 €', 'les montants de l\'OPE retirée ne comptent plus');
    });

    it('retirer l\'OPE 2 fait remonter l\'OPE 3 au rang 2 avec toutes ses valeurs (ligne, action, commentaire, montants)', async function () {
      await loadFixtureState();
      window.ProjectModal.open();
      addOpe();
      setFin('c2026_M10_Fonctionnement_2', 111);
      addOpe();
      pickRef('Ligne_OPE_3', 'OPE-2026-003', 'OPE-2026-003');
      chip(3, 'Creation de ligne').click();
      setComment(3, 'Troisième OPE');
      setFin('c2027_M20_Investissement_3', 333);
      card(2).querySelector('.cp-ope-del').click();
      card(2).querySelector('[data-ope-confirm-go]').click();
      assertEqual(cards().length, 2);
      assertEqual(refInput('Ligne_OPE_2').value, 'OPE-2026-003');
      assertEqual(card(2).querySelector('select').value, 'Creation de ligne');
      assertEqual(comment(2).value, 'Troisième OPE');
      assertEqual(modalEl().querySelector('[data-fin="c2027_M20_Investissement_2"]').value, '333');
      assertEqual(modalEl().querySelector('[data-fin="c2026_M10_Fonctionnement_2"]').value, '0', 'les montants de l\'ancienne OPE 2 ont disparu');
      assertEqual(flat(card(2).querySelector('[data-ope-sum]').textContent), '333 €');
      assertEqual(card(2).querySelector('.cp-ope-badge').textContent.trim(), 'OPE 2');
    });

    // Demande d'Antoine du 24/11/2026 : « quand plusieurs OPE, ne pas replier l'OPE 2, laisser tous les volets OPE dépliés par défaut ».
    it('ajouter une 2e, 3e et 4e OPE ne replie aucune carte : les quatre restent dépliées, corps visibles', function () {
      window.ProjectModal.open();
      addOpe(); addOpe(); addOpe();
      assertEqual(cards().length, 4);
      cards().forEach(c => {
        assertTrue(c.classList.contains('open'), `${c.dataset.opeRank} déployée`);
        assertFalse(c.querySelector('.cp-ope-body').hidden, `corps de l'OPE ${c.dataset.opeRank} visible`);
        assertEqual(c.querySelector('.cp-ope-head').getAttribute('aria-expanded'), 'true');
      });
    });

    it('une carte repliée à la main le reste quand on ajoute une OPE (rien ne bouge tout seul, dans un sens comme dans l\'autre)', function () {
      window.ProjectModal.open();
      card(1).querySelector('.cp-ope-head').click();
      assertFalse(card(1).classList.contains('open'));
      addOpe();
      assertFalse(card(1).classList.contains('open'), 'l\'OPE 1 repliée par l\'utilisateur reste repliée');
      assertTrue(card(2).classList.contains('open'));
    });

    it('retirer une OPE laisse les autres cartes dépliées, et garde pliée celle que l\'utilisateur avait pliée', function () {
      window.ProjectModal.open();
      addOpe(); addOpe(); addOpe();
      card(4).querySelector('.cp-ope-head').click(); // pliée à la main
      card(2).querySelector('.cp-ope-del').click(); // OPE 2 vide : retirée tout de suite
      assertEqual(cards().length, 3);
      assertTrue(card(1).classList.contains('open'));
      assertTrue(card(2).classList.contains('open'), 'l\'ancienne OPE 3, remontée au rang 2');
      assertFalse(card(3).classList.contains('open'), 'l\'ancienne OPE 4 pliée à la main le reste');
    });

    it('un montant saisi accepte uniquement chiffres et un point décimal (comme pour l\'OPE 1)', function () {
      window.ProjectModal.open();
      addOpe();
      const input = modalEl().querySelector('[data-fin="c2026_M10_Fonctionnement_2"]');
      setValue(input, '12a3.4.5e');
      fire(input, 'input');
      assertEqual(input.value, '123.45');
    });
  });

  // ===========================================================================================================
  describe('Plusieurs OPE par projet — enregistrement et création des colonnes dans Projets', function () {
    it('projet à une seule OPE : aucune colonne créée, aucune colonne _2/_3/_4 écrite (comportement d\'avant inchangé)', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertEqual(calls('AddColumn').length, 0);
      const add = calls('AddRecord')[0];
      assertTrue(!!add, 'projet créé');
      assertEqual(Object.keys(add.fields).filter(key => O().columnsOf(2).concat(O().columnsOf(3), O().columnsOf(4)).includes(key)).length, 0);
    });

    it('création à 2 OPE : les 15 colonnes de l\'OPE 2 sont créées AVANT l\'ajout, avec le bon type, puis les valeurs partent dans les bonnes colonnes', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      addOpe();
      pickRef('Ligne_OPE_2', 'OPE-2026-002', 'OPE-2026-002');
      chip(2, 'Prolongation de ligne').click();
      setComment(2, '  Deuxième OPE  ');
      setFin('c2026_M10_Fonctionnement_2', 500);
      setFin('c2027_M20_Investissement_2', 70);
      await modalEl().querySelector('[data-cp-save]').onclick();

      assertEqual(modalEl().querySelector('#cp-project-error').textContent, '');
      const added = calls('AddColumn');
      assertEqual(added.length, 15);
      assertDeepEqual(added.map(call => call.colId).sort(), O().columnsOf(2).slice().sort());
      const typeOf = colId => added.find(call => call.colId === colId).colInfo.type;
      assertEqual(typeOf('Ligne_OPE_2'), 'RefList:Lignes_OPE');
      assertEqual(typeOf('Action_Ligne_OPE_a_faire_2'), 'Choice');
      assertEqual(typeOf('Commentaire_ligne_OPE_2'), 'Text');
      assertEqual(typeOf('c2026_M10_Fonctionnement_2'), 'Numeric');
      assertTrue(added.every(call => call.table === 'Projets' && call.colInfo.isFormula === false));
      const order = window.__TEST_CALLS__.map(call => call.type);
      assertTrue(order.lastIndexOf('AddColumn') < order.indexOf('AddRecord'), 'colonnes créées avant l\'enregistrement du projet');

      const fields = calls('AddRecord')[0].fields;
      assertDeepEqual(fields.Ligne_OPE_2, ['L', 2]);
      assertEqual(fields.Action_Ligne_OPE_a_faire_2, 'Prolongation de ligne');
      assertEqual(fields.Commentaire_ligne_OPE_2, 'Deuxième OPE', 'commentaire nettoyé des espaces en bout');
      assertEqual(fields.c2026_M10_Fonctionnement_2, 500);
      assertEqual(fields.c2027_M20_Investissement_2, 70);
      assertEqual(fields.c2026_M30_Personnel_2, 0, 'tous les montants de l\'OPE sont écrits, à 0 par défaut');
      assertEqual(fields.c2026_M10_Fonctionnement, 1000, 'les colonnes de l\'OPE 1 sont inchangées');
      assertEqual(fields.Action_Ligne_OPE_a_faire, 'Creation de ligne');
      assertTrue(!('Ligne_OPE_3' in fields), 'rien pour une OPE 3 absente');
    });

    it('une OPE sans ligne choisie s\'écrit [\'L\'] (liste vide), jamais 0 ni null', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      addOpe();
      setFin('c2026_M10_Fonctionnement_2', 5);
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertDeepEqual(calls('AddRecord')[0].fields.Ligne_OPE_2, ['L']);
    });

    it('une OPE ajoutée par un clic de trop et laissée vide n\'est pas enregistrée : aucune colonne créée, rien d\'écrit pour elle', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      addOpe();
      assertEqual(cards().length, 2);
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertEqual(calls('AddColumn').length, 0, 'une OPE vide ne justifie pas 15 colonnes');
      assertEqual(Object.keys(calls('AddRecord')[0].fields).filter(field => O().columnsOf(2).includes(field)).length, 0);
    });

    it('une OPE vide entre deux OPE remplies est conservée (le rang compte), seules les vides de fin sont ignorées', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      addOpe(); // OPE 2 laissée vide
      addOpe();
      setFin('c2026_M10_Fonctionnement_3', 9);
      addOpe(); // OPE 4 laissée vide
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertEqual(calls('AddColumn').length, 30, 'colonnes des OPE 2 et 3 seulement');
      const fields = calls('AddRecord')[0].fields;
      assertEqual(fields.c2026_M10_Fonctionnement_3, 9);
      assertDeepEqual(fields.Ligne_OPE_2, ['L']);
      assertTrue(!('Ligne_OPE_4' in fields) && !('c2026_M10_Fonctionnement_4' in fields), 'rien pour l\'OPE 4 vide');
    });

    it('4 OPE : 45 colonnes créées en une seule fois', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      addOpe(); addOpe(); addOpe();
      setFin('c2029_M30_Personnel_4', 9);
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertEqual(calls('AddColumn').length, 45);
      assertEqual(calls('AddRecord')[0].fields.c2029_M30_Personnel_4, 9);
    });

    it('colonnes déjà présentes (relues de Grist) : aucune création, l\'enregistrement part directement', async function () {
      await loadFixtureState();
      await giveProjectOpes(11, 2, { Commentaire_ligne_OPE_2: 'déjà là', c2026_M10_Fonctionnement_2: 40 });
      await loadFixtureState();
      window.ProjectModal.open(projectRecord(11));
      assertEqual(cards().length, 2);
      setFin('c2026_M10_Fonctionnement_2', 41);
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertEqual(calls('AddColumn').length, 0);
      const update = calls('UpdateRecord')[0];
      assertEqual(update.fields.c2026_M10_Fonctionnement_2, 41);
      assertEqual(update.fields.Commentaire_ligne_OPE_2, 'déjà là');
    });

    it('colonnes d\'un autre rang déjà créées (OPE 2) mais OPE 3 ajoutée : seules les 15 colonnes de l\'OPE 3 sont créées', async function () {
      await loadFixtureState();
      await giveProjectOpes(11, 2, { Commentaire_ligne_OPE_2: 'x' });
      await loadFixtureState();
      window.ProjectModal.open(projectRecord(11));
      addOpe();
      setFin('c2026_M10_Fonctionnement_3', 7);
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertDeepEqual(calls('AddColumn').map(call => call.colId).sort(), O().columnsOf(3).slice().sort());
    });

    it('création des colonnes impossible : message clair, le projet n\'est pas enregistré à moitié, le bouton se réarme', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      addOpe();
      setFin('c2026_M10_Fonctionnement_2', 5);
      const original = window.CoreGrist.ensureColumns;
      window.CoreGrist.ensureColumns = async () => { throw new Error('droits insuffisants'); };
      try {
        await modalEl().querySelector('[data-cp-save]').onclick();
      } finally {
        window.CoreGrist.ensureColumns = original;
      }
      const error = modalEl().querySelector('#cp-project-error').textContent;
      assertIncludes(error, 'Création impossible');
      assertIncludes(error, 'de l\'OPE 2');
      assertIncludes(error, 'droits insuffisants');
      assertEqual(calls('AddRecord').length, 0, 'aucun projet créé');
      assertFalse(modalEl().querySelector('[data-cp-save]').disabled, 'le bouton est de nouveau utilisable');
      assertFalse(modalEl().classList.contains('cp-hidden'), 'la modale reste ouverte avec la saisie intacte');
      assertEqual(modalEl().querySelector('[data-fin="c2026_M10_Fonctionnement_2"]').value, '5');
    });

    it('les nouvelles colonnes reprennent la description de la colonne de l\'OPE 1 (bulles « ? »)', async function () {
      await loadFixtureState();
      const original = window.CoreGrist.getColumnDescription;
      window.CoreGrist.getColumnDescription = (table, col) => (table === 'Projets' && col === 'Ligne_OPE' ? 'Ligne budgétaire de l\'OPE' : original.call(window.CoreGrist, table, col));
      let ensured = null;
      const ensure = window.CoreGrist.ensureColumns;
      window.CoreGrist.ensureColumns = async (table, defs) => { ensured = defs; return ensure.call(window.CoreGrist, table, defs); };
      try {
        await fillMinimalValidProject();
        addOpe();
        setFin('c2026_M10_Fonctionnement_2', 5);
        await modalEl().querySelector('[data-cp-save]').onclick();
      } finally {
        window.CoreGrist.getColumnDescription = original;
        window.CoreGrist.ensureColumns = ensure;
      }
      assertEqual(ensured.find(def => def.id === 'Ligne_OPE_2').description, 'Ligne budgétaire de l\'OPE');
    });

    it('MODAL_FIELDS : un projet à 2 OPE écrit exactement les colonnes de la liste + celles de l\'OPE 2 (jamais une colonne inconnue)', async function () {
      await loadFixtureState();
      await giveProjectOpes(11, 2, { c2026_M10_Fonctionnement_2: 40 });
      await loadFixtureState();
      window.ProjectModal.open(projectRecord(11));
      await modalEl().querySelector('[data-cp-save]').onclick();
      const written = Object.keys(calls('UpdateRecord')[0].fields);
      const RV = window.RedactionVariables;
      assertEqual(written.filter(field => !RV.MODAL_FIELDS.includes(field)).length, 0, 'colonne écrite absente de MODAL_FIELDS');
      O().columnsOf(2).forEach(col => assertTrue(written.includes(col), `${col} écrite`));
      [3, 4].forEach(rank => assertFalse(written.some(field => O().columnsOf(rank).includes(field)), `rien pour l'OPE ${rank} (colonnes absentes)`));
    });
  });

  // ===========================================================================================================
  describe('Plusieurs OPE par projet — ouvrir et modifier un projet qui en a plusieurs', function () {
    it('un projet à 3 OPE s\'ouvre avec 3 cartes remplies, toutes déployées, pastille « 3 »', async function () {
      await loadFixtureState();
      await giveProjectOpes(11, 3, {
        Ligne_OPE_2: ['L', 2], Action_Ligne_OPE_a_faire_2: 'Prolongation de ligne', Commentaire_ligne_OPE_2: 'Deuxième',
        c2026_M10_Fonctionnement_2: 500, c2028_M30_Personnel_2: 100,
        Ligne_OPE_3: ['L', 3], Action_Ligne_OPE_a_faire_3: 're-Abondement de ligne', c2027_M20_Investissement_3: 25
      });
      await loadFixtureState();
      window.ProjectModal.open(projectRecord(11));
      assertEqual(cards().length, 3);
      assertTrue(card(1).classList.contains('open'));
      assertTrue(card(2).classList.contains('open'), 'l\'OPE 2 n\'est plus repliée');
      assertTrue(card(3).classList.contains('open'));
      assertEqual(refInput('Ligne_OPE_2').value, 'OPE-2026-002');
      assertEqual(refInput('Ligne_OPE_3').value, 'OPE-2026-003');
      assertEqual(card(2).querySelector('#cp-Ligne_OPE_installe_chez_2').value, 'DIR1');
      assertEqual(card(3).querySelector('#cp-Ligne_OPE_installe_chez_3').value, 'DIESE');
      assertEqual(card(2).querySelector('select').value, 'Prolongation de ligne');
      assertTrue(chip(3, 're-Abondement de ligne').classList.contains('active'));
      assertEqual(comment(2).value, 'Deuxième');
      assertEqual(modalEl().querySelector('[data-fin="c2026_M10_Fonctionnement_2"]').value, '500');
      assertEqual(modalEl().querySelector('[data-fin="c2027_M20_Investissement_3"]').value, '25');
      assertEqual(card(2).querySelector('[data-ope-name]').textContent, 'OPE-2026-002');
      assertEqual(flat(card(2).querySelector('[data-ope-sum]').textContent), '600 €');
      assertEqual(modalEl().querySelector('[data-cp-tab="budget"] .cp-tab-count').textContent, '3');
      assertFalse(totalBlock().hidden);
    });

    it('rouvrir la modale sur un projet à 1 OPE, puis en création, retire les cartes du projet précédent', async function () {
      await loadFixtureState();
      await giveProjectOpes(11, 2, { c2026_M10_Fonctionnement_2: 500, Ligne_OPE_2: ['L', 2] });
      await loadFixtureState();
      window.ProjectModal.open(projectRecord(11));
      assertEqual(cards().length, 2);
      window.ProjectModal.open(projectRecord(10));
      assertEqual(cards().length, 1, 'le projet 10 n\'a qu\'une OPE');
      window.ProjectModal.open(projectRecord(11));
      assertEqual(cards().length, 2);
      window.ProjectModal.open();
      assertEqual(cards().length, 1, 'création : une seule OPE vide');
      assertEqual(refInput('Ligne_OPE').value, '');
      assertTrue(totalBlock().hidden);
    });

    it('retirer l\'OPE 3 d\'un projet qui en a 3 vide ses colonnes à l\'enregistrement (liste vide, action et commentaire vides, montants à 0)', async function () {
      await loadFixtureState();
      await giveProjectOpes(11, 3, {
        Ligne_OPE_2: ['L', 2], c2026_M10_Fonctionnement_2: 500,
        Ligne_OPE_3: ['L', 3], Action_Ligne_OPE_a_faire_3: 'Creation de ligne', Commentaire_ligne_OPE_3: 'à retirer', c2027_M20_Investissement_3: 25
      });
      await loadFixtureState();
      window.ProjectModal.open(projectRecord(11));
      card(3).querySelector('.cp-ope-del').click();
      card(3).querySelector('[data-ope-confirm-go]').click();
      assertEqual(cards().length, 2);
      await modalEl().querySelector('[data-cp-save]').onclick();
      const fields = calls('UpdateRecord')[0].fields;
      assertDeepEqual(fields.Ligne_OPE_3, ['L']);
      assertEqual(fields.Action_Ligne_OPE_a_faire_3, '');
      assertEqual(fields.Commentaire_ligne_OPE_3, '');
      assertEqual(fields.c2027_M20_Investissement_3, 0);
      assertEqual(fields.c2026_M10_Fonctionnement_2, 500, 'l\'OPE 2 est intacte');
      assertEqual(calls('AddColumn').length, 0);
    });

    it('retirer l\'OPE 2 d\'un projet à 3 OPE : l\'OPE 3 est réécrite dans les colonnes _2 et les colonnes _3 sont vidées', async function () {
      await loadFixtureState();
      await giveProjectOpes(11, 3, {
        Ligne_OPE_2: ['L', 2], Commentaire_ligne_OPE_2: 'ancienne OPE 2', c2026_M10_Fonctionnement_2: 500,
        Ligne_OPE_3: ['L', 3], Action_Ligne_OPE_a_faire_3: 'Creation de ligne', Commentaire_ligne_OPE_3: 'ancienne OPE 3', c2027_M20_Investissement_3: 25
      });
      await loadFixtureState();
      window.ProjectModal.open(projectRecord(11));
      card(2).querySelector('.cp-ope-del').click();
      card(2).querySelector('[data-ope-confirm-go]').click();
      await modalEl().querySelector('[data-cp-save]').onclick();
      const fields = calls('UpdateRecord')[0].fields;
      assertDeepEqual(fields.Ligne_OPE_2, ['L', 3]);
      assertEqual(fields.Commentaire_ligne_OPE_2, 'ancienne OPE 3');
      assertEqual(fields.Action_Ligne_OPE_a_faire_2, 'Creation de ligne');
      assertEqual(fields.c2027_M20_Investissement_2, 25);
      assertEqual(fields.c2026_M10_Fonctionnement_2, 0, 'les montants de l\'ancienne OPE 2 ne restent pas');
      assertDeepEqual(fields.Ligne_OPE_3, ['L']);
      assertEqual(fields.c2027_M20_Investissement_3, 0);
      assertEqual(fields.Commentaire_ligne_OPE_3, '');
    });

    it('retirer toutes les OPE 2 à 4 d\'un projet vide leurs colonnes ; sans colonne dans Grist, rien n\'est écrit pour elles', async function () {
      await loadFixtureState();
      window.ProjectModal.open(projectRecord(11));
      await modalEl().querySelector('[data-cp-save]').onclick();
      const written = Object.keys(calls('UpdateRecord')[0].fields);
      assertEqual(written.filter(field => [2, 3, 4].some(rank => O().columnsOf(rank).includes(field))).length, 0);
    });

    it('en création, retirer une OPE n\'écrit aucune colonne vide pour elle', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      addOpe();
      card(2).querySelector('.cp-ope-del').click();
      await modalEl().querySelector('[data-cp-save]').onclick();
      const fields = calls('AddRecord')[0].fields;
      assertEqual(Object.keys(fields).filter(field => O().columnsOf(2).includes(field)).length, 0);
      assertEqual(calls('AddColumn').length, 0);
    });

    it('le montant de convention proposé à l\'ouverture ajoute les années 2026-2028 des OPE 2 à 4 à Montant_attribue_Total', async function () {
      await loadFixtureState();
      await giveProjectOpes(11, 2, { Montant_attribue_Total: 1000, c2026_M10_Fonctionnement_2: 300, c2028_M30_Personnel_2: 200, c2029_M10_Fonctionnement_2: 999 });
      await loadFixtureState();
      window.ProjectModal.open(projectRecord(11));
      assertEqual(modalEl().querySelector('#cp-Convention_montant_partenaire_1').value, '1500', '1 000 + 300 + 200 (2029 hors formule Grist)');
    });
  });

  // ===========================================================================================================
  describe('Plusieurs OPE par projet — convention de reversement et champs obligatoires', function () {
    function setPartners(p1, p2) {
      const a = modalEl().querySelector('#cp-Convention_montant_partenaire_1'), b = modalEl().querySelector('#cp-Convention_montant_partenaire_2');
      setValue(a, String(p1)); fire(a, 'input');
      setValue(b, String(p2)); fire(b, 'input');
    }
    function addPartner() {
      const partner = refInput('Partenaire_s_convention_reversement');
      fire(partner, 'focus');
      partner.parentElement.querySelector('.cp-ref-list button').click();
    }
    async function prepare(f1, f2, amount) {
      await loadFixtureState();
      await fillMinimalValidProject();
      setFin('c2026_M10_Fonctionnement', f1);
      addOpe();
      setFin('c2026_M10_Fonctionnement_2', f2);
      const checkbox = modalEl().querySelector('#cp-Convention_de_reversement');
      checkbox.checked = true;
      fire(checkbox, 'change');
      document.getElementById('cp-convention-notice').classList.add('cp-hidden');
      document.getElementById('cp-convention-7030-notice')?.classList.add('cp-hidden');
      addPartner();
      setPartners(amount, 0);
      document.getElementById('cp-convention-7030-notice')?.classList.add('cp-hidden');
    }

    it('le Fonctionnement de TOUTES les OPE réunies couvre la convention : 600 + 500 couvrent 1 000 €, l\'enregistrement passe', async function () {
      await prepare(600, 500, 1000);
      assertFalse(totalBlock().querySelector('.cp-conv').hidden, 'la ligne de contrôle est visible quand la convention est active');
      assertTrue(totalBlock().querySelector('.cp-conv').classList.contains('ok'));
      assertIncludes(flat(totalBlock().querySelector('.cp-conv').textContent), 'couverte');
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertEqual(modalEl().querySelector('#cp-project-error').textContent, '');
      assertEqual(calls('AddRecord').length, 1);
    });

    it('si les OPE réunies ne couvrent pas la convention : enregistrement refusé, message « de toutes les OPE réunies », ligne de contrôle rouge', async function () {
      await prepare(600, 100, 1000);
      assertTrue(totalBlock().querySelector('.cp-conv').classList.contains('ko'));
      assertIncludes(flat(totalBlock().querySelector('.cp-conv').textContent), 'doit couvrir');
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertIncludes(modalEl().querySelector('#cp-project-error').textContent, 'de toutes les OPE réunies');
      assertEqual(modalEl().dataset.activeTab, 'budget');
      assertEqual(calls('AddRecord').length, 0);
    });

    it('l\'Investissement et le Personnel d\'une OPE 2 ne couvrent jamais la convention', async function () {
      await prepare(600, 0, 1000);
      setFin('c2026_M20_Investissement_2', 900);
      setFin('c2026_M30_Personnel_2', 900);
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertEqual(calls('AddRecord').length, 0);
      assertIncludes(modalEl().querySelector('#cp-project-error').textContent, 'Fonctionnement');
    });

    it('la ligne de contrôle suit la saisie des montants et disparaît quand la convention est décochée', async function () {
      await prepare(600, 100, 1000);
      assertTrue(totalBlock().querySelector('.cp-conv').classList.contains('ko'));
      setFin('c2026_M10_Fonctionnement_2', 400);
      assertTrue(totalBlock().querySelector('.cp-conv').classList.contains('ok'));
      const checkbox = modalEl().querySelector('#cp-Convention_de_reversement');
      checkbox.checked = false;
      fire(checkbox, 'change');
      assertTrue(totalBlock().querySelector('.cp-conv').hidden);
    });

    it('le message permanent de l\'onglet parle de toutes les OPE', async function () {
      window.ProjectModal.open();
      assertIncludes(document.getElementById('cp-budget-convention-notice').textContent, 'toutes OPE réunies');
    });

    it('le budget total (obligatoire à la création) additionne toutes les OPE : OPE 1 à 0 mais OPE 2 renseignée suffit', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      setFin('c2026_M10_Fonctionnement', 0);
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertIncludes(modalEl().querySelector('#cp-project-error').textContent, 'Budget');
      addOpe();
      setFin('c2026_M10_Fonctionnement_2', 10);
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertEqual(calls('AddRecord').length, 1);
    });

    it('« Action ligne OPE » (OPE 1) est obligatoire à la création et bascule sur l\'onglet Budget et OPE en déployant la carte ; celle des autres OPE ne l\'est pas', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      chip(1, 'Creation de ligne').click(); // décoche
      card(1).querySelector('.cp-ope-head').click(); // replie la carte 1
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertIncludes(modalEl().querySelector('#cp-project-error').textContent, 'Action ligne OPE');
      assertEqual(modalEl().dataset.activeTab, 'budget', 'l\'action est maintenant dans l\'onglet Budget et OPE');
      assertTrue(card(1).classList.contains('open'), 'la carte de l\'OPE 1 est redéployée pour montrer le champ manquant');
      chip(1, 'Creation de ligne').click();
      addOpe();
      chip(2, 'à determiner').click(); // l'action de l'OPE 2 est vide : jamais bloquant
      setFin('c2026_M10_Fonctionnement_2', 1);
      await modalEl().querySelector('[data-cp-save]').onclick();
      assertEqual(calls('AddRecord').length, 1);
    });
  });

  // ===========================================================================================================
  describe('Plusieurs OPE par projet — bulles d\'aide', function () {
    it('« ? » sur les champs de chaque OPE : la description de la colonne de l\'OPE 1 sert aux OPE 2 à 4', async function () {
      const metaTables = { id: [1], tableId: ['Projets'] };
      const colIds = ['Ligne_OPE', 'Action_Ligne_OPE_a_faire', 'Commentaire_ligne_OPE', 'Ligne_OPE_installe_chez'];
      window.__mockSetTable('_grist_Tables', metaTables);
      window.__mockSetTable('_grist_Tables_column', {
        id: colIds.map((_, i) => i + 1), parentId: colIds.map(() => 1), colId: colIds, description: colIds.map(col => `Aide ${col}`)
      });
      await window.CoreGrist.loadColumnDescriptions();
      window.ProjectModal.open();
      addOpe();
      [['Ligne_OPE', '[data-ref="Ligne_OPE_2"]'], ['Action_Ligne_OPE_a_faire', '#cp-Action_Ligne_OPE_a_faire_2'], ['Commentaire_ligne_OPE', '#cp-Commentaire_ligne_OPE_2'], ['Ligne_OPE_installe_chez', '#cp-Ligne_OPE_installe_chez_2']].forEach(([col, selector]) => {
        const field = card(2).querySelector(selector).closest('.cp-field');
        const icon = field.querySelector('.help-icon');
        assertTrue(!!icon, `${selector} : icône « ? »`);
        assertEqual(icon.dataset.helpText, `Aide ${col}`);
      });
      const first = card(1).querySelector('[data-ref="Ligne_OPE"]').closest('.cp-field').querySelector('.help-icon');
      assertEqual(first.dataset.helpText, 'Aide Ligne_OPE');
    });
  });

  // ===========================================================================================================
  describe('Plusieurs OPE par projet — Dashboard et Kanban additionnent toutes les OPE', function () {
    const PROGRAMMES = [{ id: 1, Programme: 'FARE' }];
    const LIGNES = [{ id: 1, N_OPE: 'OPE 001', totalCPConsomme: 100 }, { id: 2, N_OPE: 'OPE 002', totalCPConsomme: 200 }, { id: 3, N_OPE: 'OPE 003', totalCPConsomme: 400 }];
    const PROJET = {
      id: 10, Acronyme: 'MULTI', Projet: 'Projet multi-OPE', Programme: 1, Statut_operationnel_projet: 'en cours',
      Ligne_OPE: ['L', 1], Ligne_OPE_2: ['L', 2], Ligne_OPE_3: ['L', 3, 1],
      c2026_M10_Fonctionnement: 1000, c2026_M10_Fonctionnement_2: 200, c2026_M30_Personnel_3: 50, c2027_M10_Fonctionnement_2: 999
    };
    const DEPENSES = [
      { id: 1, Exercice: 2026, Code_operation: 'OPE002', CP_consomme: 150, AE_consomme: 150 },
      { id: 2, Exercice: 2026, Code_operation: 'OPE003', CP_consomme: 70, AE_consomme: 70 }
    ];
    const dataset = () => window.DashboardLogic.buildDataset({ projets: [PROJET], programmes: PROGRAMMES, lignes: LIGNES, depenses: DEPENSES });

    it('l\'attribué 2026 additionne les OPE 1 à 4 (2027 n\'existe pas au bilan 2023-2026 : ignoré)', function () {
      const multi = dataset().projects[0];
      assertEqual(multi.att[2026], 1250);
      assertEqual(multi.att[2025], 0);
    });

    it('les lignes OPE de toutes les OPE rattachent leurs dépenses au projet, sans compter deux fois une ligne présente deux fois', function () {
      const multi = dataset().projects[0];
      assertDeepEqual(multi.ope, ['OPE 001', 'OPE 002', 'OPE 003'], 'la ligne 1, déjà dans l\'OPE 1, n\'est pas répétée par l\'OPE 3');
      assertEqual(multi.cons.CP[2026], 220, 'dépenses de la ligne de l\'OPE 2 (150) et de l\'OPE 3 (70)');
      assertEqual(multi.totalCP, 700);
    });

    it('un projet à une seule OPE donne les mêmes chiffres qu\'avant', function () {
      const single = window.DashboardLogic.buildDataset({ projets: [{ id: 5, Acronyme: 'SOLO', Ligne_OPE: ['L', 1], c2026_M10_Fonctionnement: 10 }], programmes: PROGRAMMES, lignes: LIGNES, depenses: [] });
      assertEqual(single.projects[0].att[2026], 10);
      assertDeepEqual(single.projects[0].ope, ['OPE 001']);
    });

    it('Budget du Kanban : Total_2026 + le 2026 des OPE 2 à 4 ; sans OPE supplémentaire la valeur d\'origine est conservée telle quelle', async function () {
      const table = await window.grist.docApi.fetchTable('Projets');
      const at = table.id.indexOf(11);
      table.Total_2026 = table.id.map(() => 0);
      table.Total_2026[at] = 400;
      table.c2026_M10_Fonctionnement_2 = table.id.map(() => 0);
      table.c2026_M10_Fonctionnement_2[at] = 100;
      table.c2026_M30_Personnel_3 = table.id.map(() => 0);
      table.c2026_M30_Personnel_3[at] = 20;
      table.Montant_annuel_charge_attribue = table.id.map(() => 0);
      const other = table.id.indexOf(10);
      table.Montant_annuel_charge_attribue[other] = 777;
      window.__mockSetTable('Projets', table);
      const projets = (await window.CoreGrist.loadAllTables()).Projets;
      assertEqual(projets.find(p => p.id === 11).Budget, 520);
      assertEqual(projets.find(p => p.id === 10).Budget, 777, 'repli sur Montant_annuel_charge_attribue inchangé');
    });
  });
}());
