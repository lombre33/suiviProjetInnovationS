/**
 * Non-regression suite: page Installation des fonds (js/pages/page-installation.js) — frise de jalons en deux zones
 * (Création / Prolongation-réabondement), bascule DIESE / AUTRE, validée par Antoine le 12/11/2026.
 *
 * Fixtures (tests/fixtures.js) : INNOVX -> Lignes_OPE#1 (installée chez LAB1) => lieu AUTRE ; NOTIFY -> Lignes_OPE#3
 * (installée chez DIESE) => lieu DIESE ; CONVENTIX/FINANCX/COURSIX/INCONNUX/SIGNEX n'ont aucune ligne OPE => lieu AUTRE.
 * Action_Ligne_OPE_a_faire : NOTIFY « à determiner », les autres vides => tous en zone Création. Jalons : l'ancienne colonne
 * Statut_installation_fonds est reprise (INNOVX « 2) Ouverture demandée à la DF » → 2e jalon, NOTIFY « 3) Installé » →
 * 3e jalon, les autres vides → 1er jalon).
 *
 * L'état de la page (bascule DIESE / AUTRE, parties cachées dépliées) vit dans le module et traverse les tests :
 * loadFixtureState() le remet à zéro par l'interface, et chaque test laisse la page comme il l'a trouvée.
 */
(function () {
  'use strict';

  const JALON = 'Jalon_installation_fonds';
  const J = ['1) Création / prolongation de ligne', '2) En attente DF (ou OPE sur UBInvest)', '3) OPE disponible UB Invest',
    '4) Projet en cours', '5) Reliquats à traiter', '6) Projet clôturé (reliquat inclus)'];

  async function loadFixtureState() {
    const tables = await window.CoreGrist.loadAllTables();
    Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
    window.renderInstallation();
    // Remet la page à zéro (parties cachées repliées, DIESE et AUTRE actifs) sans laisser d'écriture de préférences.
    document.querySelectorAll('[data-install-plus][aria-expanded="true"]').forEach(btn => btn.click());
    document.querySelectorAll('[data-install-lieu]:not(.is-on)').forEach(btn => btn.click());
    await wait(0);
    window.__TEST_CALLS__.length = 0;
  }

  const project = acronym => window.CoreState.getTable('Projets').find(p => p.Acronyme === acronym);
  const zoneEl = key => document.querySelector(`[data-install-zone="${key}"]`);
  const msEl = (zone, idx) => document.querySelector(`[data-install-ms="${zone}:${idx}"]`);
  const msBody = (zone, idx) => document.querySelector(`[data-drop-ms="${zone}:${idx}"]`);
  const cardIn = (container, acronym) => container && Array.from(container.querySelectorAll('.install-card'))
    .find(card => card.querySelector('.install-acronym')?.textContent === acronym);
  const cardAt = (zone, idx, acronym) => cardIn(msBody(zone, idx), acronym);
  const anyCard = acronym => cardIn(document.getElementById('install-zones'), acronym);
  const msLabels = zone => Array.from(zoneEl(zone).querySelectorAll('.install-ms-label')).map(el => el.textContent);
  const plusBtn = zone => zoneEl(zone).querySelector('[data-install-plus]');
  const lieuBtn = key => document.querySelector(`[data-install-lieu="${key}"]`);
  const jalonWrites = () => window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && c.table === 'Projets' && JALON in c.fields);
  const click = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));

  describe('Installation des fonds — lieu, zone et jalon d\'un projet', function () {
    it('lieu : DIESE seulement si la ligne OPE est installée chez la structure DIESE ; tout le reste (autre structure, sans ligne OPE) est AUTRE', async function () {
      await loadFixtureState();
      const logic = window.InstallationLogic;
      assertEqual(logic.lieuForProject(project('NOTIFY')), 'diese');
      assertEqual(logic.lieuForProject(project('INNOVX')), 'autre', 'installée chez LAB1');
      assertEqual(logic.lieuForProject(project('CONVENTIX')), 'autre', 'sans ligne OPE : rangé avec AUTRE');
    });

    it('zone : prolongation et ré-abondement vont dans Prolongation/réabondement ; tout le reste (création, à déterminer, vide, valeur inconnue) dans Création', async function () {
      await loadFixtureState();
      const zone = action => window.InstallationLogic.zoneForProject({ Action_Ligne_OPE_a_faire: action });
      assertEqual(zone('Prolongation de ligne'), 'prolongation');
      assertEqual(zone('re-Abondement de ligne'), 'prolongation');
      ['Creation de ligne', 'à determiner', '', undefined, 'ligne validée'].forEach(value => assertEqual(zone(value), 'creation', `« ${value} » → Création`));
    });

    it('jalon : les 6 valeurs de la colonne Jalon_installation_fonds ; la nouvelle colonne l\'emporte sur l\'ancienne, vide ou inconnu = 1er jalon', async function () {
      await loadFixtureState();
      const logic = window.InstallationLogic;
      assertDeepEqual(logic.JALONS, J);
      assertEqual(logic.rawJalonIndex(project('INNOVX')), 1, 'ancienne colonne reprise : « 2) Ouverture demandée à la DF »');
      assertEqual(logic.rawJalonIndex(project('NOTIFY')), 2, 'ancienne colonne reprise : « 3) Installé »');
      assertEqual(logic.rawJalonIndex(project('CONVENTIX')), -1, 'aucun jalon renseigné');
      assertEqual(logic.jalonIndex(project('CONVENTIX')), 0, 'mais la page le range au 1er jalon');
      assertEqual(logic.rawJalonIndex({ [JALON]: J[3], Statut_installation_fonds: '1) En attente DR' }), 3, 'la nouvelle colonne gagne');
      assertEqual(logic.rawJalonIndex({ [JALON]: 'valeur inconnue' }), -1);
      assertEqual(logic.rawJalonIndex({ Statut_installation_fonds: '5) Clôturer' }), 5);
      assertEqual(logic.rawJalonIndex({ Statut_installation_fonds: '4) Reliquat à traiter' }), 4);
    });

    it('chaque projet est rangé dans la zone et le jalon qui correspondent', async function () {
      await loadFixtureState();
      assertTrue(!!cardAt('creation', 1, 'INNOVX'), 'INNOVX : Création, 2e jalon');
      assertTrue(!!cardAt('creation', 2, 'NOTIFY'), 'NOTIFY : Création, 3e jalon');
      ['CONVENTIX', 'FINANCX', 'COURSIX', 'INCONNUX', 'SIGNEX'].forEach(acr =>
        assertTrue(!!cardAt('creation', 0, acr), `${acr} (sans ligne OPE, aucun jalon) doit être au 1er jalon de Création`));
    });

    it('un projet dont l\'action est une prolongation passe dans la zone Prolongation/réabondement, au même jalon', async function () {
      await loadFixtureState();
      project('INNOVX').Action_Ligne_OPE_a_faire = 'Prolongation de ligne';
      window.renderInstallation();
      assertTrue(!!cardAt('prolongation', 1, 'INNOVX'));
      assertFalse(!!cardAt('creation', 1, 'INNOVX'));
    });
  });

  describe('Installation des fonds — la frise : deux zones, jalons, petit « + »', function () {
    it('deux zones empilées, Création puis Prolongation/réabondement, avec le nombre de projets', async function () {
      await loadFixtureState();
      const zones = Array.from(document.querySelectorAll('#install-zones > [data-install-zone]'));
      assertDeepEqual(zones.map(z => z.dataset.installZone), ['creation', 'prolongation']);
      assertDeepEqual(zones.map(z => z.querySelector('h3').textContent), ['Création', 'Prolongation/réabondement']);
      assertEqual(zones[0].querySelector('.install-zone-count').textContent, '7 projets');
      assertEqual(zones[1].querySelector('.install-zone-count').textContent, '0 projet');
    });

    it('trois jalons visibles par zone, aux libellés d\'Antoine ; « En attente DF » seul dans Prolongation (pas de « OPE sur UBInvest »)', async function () {
      await loadFixtureState();
      assertDeepEqual(msLabels('creation'), ['Création de ligne', 'En attente DF ou OPE sur UBInvest', 'OPE disponible UB Invest']);
      assertDeepEqual(msLabels('prolongation'), ['Prolongation/réattribution', 'En attente DF', 'OPE disponible UB Invest']);
    });

    it('le « + » déplie Projet en cours, Reliquats à traiter et Projet clôturé, et se referme ; chaque zone a le sien', async function () {
      await loadFixtureState();
      const plus = plusBtn('creation');
      assertEqual(plus.getAttribute('aria-expanded'), 'false');
      assertEqual(plus.textContent, '+');
      click(plus);
      assertDeepEqual(msLabels('creation'), ['Création de ligne', 'En attente DF ou OPE sur UBInvest', 'OPE disponible UB Invest',
        'Projet en cours', 'Reliquats à traiter', 'Projet clôturé (reliquat inclus)']);
      assertEqual(plusBtn('creation').getAttribute('aria-expanded'), 'true');
      assertEqual(plusBtn('creation').textContent, '−');
      assertEqual(msLabels('prolongation').length, 3, 'l\'autre zone reste repliée');
      click(plusBtn('creation'));
      assertEqual(msLabels('creation').length, 3);
      assertEqual(plusBtn('creation').getAttribute('aria-expanded'), 'false');
    });

    it('un badge sur le « + » compte les projets cachés (en cours, reliquats, clôturés) ; pas de badge sans projet caché', async function () {
      await loadFixtureState();
      assertFalse(!!plusBtn('creation').querySelector('.install-plus-badge'), 'rien de caché : pas de badge');
      project('INNOVX')[JALON] = J[3];
      project('NOTIFY')[JALON] = J[5];
      window.renderInstallation();
      assertEqual(plusBtn('creation').querySelector('.install-plus-badge').textContent, '2');
      click(plusBtn('creation'));
      assertFalse(!!plusBtn('creation').querySelector('.install-plus-badge'), 'déplié : plus de badge, les cartes sont visibles');
      assertTrue(!!cardAt('creation', 3, 'INNOVX') && !!cardAt('creation', 5, 'NOTIFY'));
      click(plusBtn('creation'));
    });

    it('un jalon sans projet passe au vert avec une coche (sans compteur) ; un jalon avec projets garde son numéro et son compteur', async function () {
      await loadFixtureState();
      ['prolongation'].forEach(zone => [0, 1, 2].forEach(idx => {
        const ms = msEl(zone, idx);
        assertTrue(ms.classList.contains('is-done'), `${zone} jalon ${idx + 1} vide : validé`);
        assertTrue(!!ms.querySelector('.install-ms-dot svg'), 'coche dans le rond');
        assertEqual(ms.querySelector('.install-ms-dot').getAttribute('aria-label'), 'Rien en attente');
        assertFalse(!!ms.querySelector('.install-ms-count'), 'pas de compteur à zéro');
      }));
      const first = msEl('creation', 0);
      assertTrue(first.classList.contains('has-items'));
      assertFalse(first.classList.contains('is-done'));
      assertEqual(first.querySelector('.install-ms-dot').textContent, '1');
      assertEqual(first.querySelector('.install-ms-count').textContent, '5', 'CONVENTIX, FINANCX, COURSIX, INCONNUX, SIGNEX');
      assertEqual(msEl('creation', 1).querySelector('.install-ms-count').textContent, '1');
    });

    it('un jalon qui se vide passe au vert dès que sa dernière carte part', async function () {
      await loadFixtureState();
      assertFalse(msEl('creation', 1).classList.contains('is-done'));
      project('INNOVX')[JALON] = J[2];
      window.renderInstallation();
      assertTrue(msEl('creation', 1).classList.contains('is-done'), 'INNOVX est parti du 2e jalon : coche verte');
    });

    it('les jalons cachés sont reliés en pointillés ; la frise reste reliée jusqu\'au « + »', async function () {
      await loadFixtureState();
      assertFalse(msEl('creation', 0).classList.contains('is-dashed'));
      assertTrue(msEl('creation', 2).classList.contains('is-dashed'), 'le trait vers le « + » est en pointillés');
      click(plusBtn('creation'));
      [3, 4, 5].forEach(idx => assertTrue(msEl('creation', idx).classList.contains('is-extra')));
      click(plusBtn('creation'));
    });
  });

  describe('Installation des fonds — bascule DIESE / AUTRE (« OU » non exclusif, dans le bandeau de filtres)', function () {
    const visibleAcronyms = () => Array.from(document.querySelectorAll('#install-zones .install-acronym')).map(el => el.textContent).sort();

    it('la bascule loge dans le bandeau de filtres existant ; les deux lieux sont actifs par défaut, avec leur compteur', async function () {
      await loadFixtureState();
      assertTrue(!!lieuBtn('diese').closest('.install-filters'), 'dans le bandeau de filtres, pas dans une nouvelle ligne');
      ['diese', 'autre'].forEach(key => {
        assertEqual(lieuBtn(key).getAttribute('aria-pressed'), 'true');
        assertTrue(lieuBtn(key).classList.contains('is-on'));
      });
      assertEqual(lieuBtn('diese').querySelector('.install-lieu-count').textContent, '1', 'NOTIFY');
      assertEqual(lieuBtn('autre').querySelector('.install-lieu-count').textContent, '6', 'INNOVX et les 5 projets sans ligne OPE');
      assertEqual(visibleAcronyms().length, 7);
    });

    it('désactiver DIESE ne laisse que AUTRE ; les compteurs ne bougent pas avec la bascule', async function () {
      await loadFixtureState();
      click(lieuBtn('diese'));
      assertEqual(lieuBtn('diese').getAttribute('aria-pressed'), 'false');
      assertFalse(!!anyCard('NOTIFY'), 'NOTIFY (DIESE) disparaît');
      assertEqual(visibleAcronyms().length, 6);
      assertEqual(lieuBtn('diese').querySelector('.install-lieu-count').textContent, '1');
      click(lieuBtn('diese')); // reset
      assertTrue(!!anyCard('NOTIFY'));
    });

    it('désactiver AUTRE ne laisse que DIESE', async function () {
      await loadFixtureState();
      click(lieuBtn('autre'));
      assertDeepEqual(visibleAcronyms(), ['NOTIFY']);
      click(lieuBtn('autre')); // reset
      assertEqual(visibleAcronyms().length, 7);
    });

    it('le dernier lieu actif ne se désactive pas : un « OU » vide n\'afficherait rien', async function () {
      await loadFixtureState();
      click(lieuBtn('diese'));
      click(lieuBtn('autre'));
      assertTrue(lieuBtn('autre').classList.contains('is-on'), 'AUTRE reste actif');
      assertEqual(lieuBtn('autre').getAttribute('aria-pressed'), 'true');
      assertEqual(visibleAcronyms().length, 6);
      click(lieuBtn('diese')); // reset
    });

    it('chaque carte porte la couleur de son lieu (bleu DIESE, orange AUTRE) pour les distinguer quand les deux sont affichés', async function () {
      await loadFixtureState();
      const notify = anyCard('NOTIFY'), innovx = anyCard('INNOVX'), sans = anyCard('CONVENTIX');
      assertTrue(notify.classList.contains('is-diese'));
      assertEqual(notify.dataset.lieu, 'diese');
      assertTrue(innovx.classList.contains('is-autre'));
      assertTrue(sans.classList.contains('is-autre'), 'sans ligne OPE : couleur AUTRE');
      assertTrue(lieuBtn('diese').classList.contains('is-diese') && lieuBtn('autre').classList.contains('is-autre'), 'les boutons ont la même couleur que les cartes');
    });

    it('Réinitialiser remet les deux lieux', async function () {
      await loadFixtureState();
      click(lieuBtn('autre'));
      assertEqual(visibleAcronyms().length, 1);
      click(document.getElementById('install-clear-filters'));
      assertEqual(visibleAcronyms().length, 7);
      assertTrue(lieuBtn('autre').classList.contains('is-on'));
    });

    it('les compteurs tiennent compte des autres filtres (recherche), pas de la bascule', async function () {
      await loadFixtureState();
      const search = document.getElementById('install-filter-search');
      setValue(search, 'notif');
      fire(search, 'input');
      assertEqual(lieuBtn('diese').querySelector('.install-lieu-count').textContent, '1');
      assertEqual(lieuBtn('autre').querySelector('.install-lieu-count').textContent, '0');
      setValue(search, '');
      fire(search, 'input');
    });
  });

  describe('Installation des fonds — contenu de la carte (programme, convention, action OPE, ligne OPE/structure, commentaire, montant, budget par masse)', function () {
    it('affiche la pastille ligne OPE/structure', async function () {
      await loadFixtureState();
      assertEqual(cardAt('creation', 1, 'INNOVX').querySelector('.install-chip-ope').textContent, 'OPE n°OPE-2026-001 — chez LAB1');
      assertEqual(cardAt('creation', 2, 'NOTIFY').querySelector('.install-chip-ope').textContent, 'OPE n°OPE-2026-003 — chez DIESE');
    });

    it('pas de pastille d\'action en zone Création sauf « Action à déterminer » (sobre, jamais en alerte)', async function () {
      await loadFixtureState();
      assertFalse(!!cardAt('creation', 1, 'INNOVX').querySelector('.install-chip-action'), 'action vide : rien');
      const notify = cardAt('creation', 2, 'NOTIFY').querySelector('.install-chip-action');
      assertEqual(notify.textContent, 'Action à déterminer');
      project('INNOVX').Action_Ligne_OPE_a_faire = 'Creation de ligne';
      window.renderInstallation();
      assertFalse(!!cardAt('creation', 1, 'INNOVX').querySelector('.install-chip-action'), '« Création de ligne » : la zone le dit déjà');
    });

    it('en zone Prolongation/réabondement, la pastille dit lequel : Prolongation ou Ré-abondement', async function () {
      await loadFixtureState();
      project('INNOVX').Action_Ligne_OPE_a_faire = 'Prolongation de ligne';
      project('NOTIFY').Action_Ligne_OPE_a_faire = 're-Abondement de ligne';
      window.renderInstallation();
      assertEqual(cardAt('prolongation', 1, 'INNOVX').querySelector('.install-chip-action').textContent, 'Prolongation');
      assertEqual(cardAt('prolongation', 2, 'NOTIFY').querySelector('.install-chip-action').textContent, 'Ré-abondement');
    });

    it('sans ligne OPE, pastille sobre « Aucune ligne OPE » (jamais aucune pastille)', async function () {
      await loadFixtureState();
      const card = cardAt('creation', 0, 'FINANCX');
      const opeChip = card.querySelector('.install-chip-ope');
      assertEqual(opeChip.textContent, 'Aucune ligne OPE');
      assertTrue(opeChip.classList.contains('is-muted'));
      assertEqual(opeChip.tagName, 'SPAN', 'rien à ouvrir sans ligne OPE');
    });

    it('une ligne OPE sans numéro mais avec sa structure reste classée et s\'affiche « N° OPE à venir — chez … »', async function () {
      await loadFixtureState();
      const lignes = window.CoreState.getTable('Lignes_OPE').map(l => l.id === 3 ? { ...l, N_OPE: '' } : l);
      window.CoreState.setTable('Lignes_OPE', lignes);
      window.renderInstallation();
      const card = cardAt('creation', 2, 'NOTIFY');
      assertEqual(card.dataset.lieu, 'diese', 'la structure suffit à classer la carte côté DIESE');
      assertEqual(card.querySelector('.install-chip-ope').textContent, 'N° OPE à venir — chez DIESE');
      assertTrue(!!card.querySelector('[data-open-ope]'), 'la pastille ouvre toujours la modale OPE, pour y renseigner le numéro');
    });

    it('affiche en haut de la carte la bulle du programme, avant l\'acronyme', async function () {
      await loadFixtureState();
      const card = cardAt('creation', 1, 'INNOVX');
      const bubble = card.querySelector('.install-card-top .install-chip-programme');
      assertTrue(!!bubble, 'la carte doit afficher une bulle avec le nom du programme');
      assertEqual(bubble.textContent, 'Programme A');
      assertTrue(!!(bubble.compareDocumentPosition(card.querySelector('.install-card-identity')) & Node.DOCUMENT_POSITION_FOLLOWING), 'la bulle précède l\'acronyme');
    });

    it('marque d\'une pastille « Convention » les seuls projets en convention de reversement', async function () {
      await loadFixtureState();
      const mark = cardAt('creation', 0, 'CONVENTIX').querySelector('.install-card-top .install-chip-convention');
      assertTrue(!!mark, 'CONVENTIX (Convention_de_reversement cochée) doit porter la marque convention');
      assertEqual(mark.textContent, 'Convention');
      assertEqual(mark.tagName, 'BUTTON', 'cliquable');
      assertFalse(!!cardAt('creation', 1, 'INNOVX').querySelector('.install-chip-convention'), 'INNOVX (sans convention) ne porte pas la marque');
    });

    it('un clic sur « Convention » ouvre la modale du projet sur l\'onglet Convention', async function () {
      await loadFixtureState();
      const opened = [];
      const original = window.ProjectModal.open;
      window.ProjectModal.open = (record, options) => { opened.push({ record, options }); };
      try {
        click(cardAt('creation', 0, 'CONVENTIX').querySelector('[data-open-convention]'));
      } finally { window.ProjectModal.open = original; }
      assertEqual(opened.length, 1);
      assertEqual(opened[0].record.Acronyme, 'CONVENTIX');
      assertDeepEqual(opened[0].options, { tab: 'conventions' });
    });

    it('la vraie modale projet s\'affiche sur l\'onglet Convention', async function () {
      await loadFixtureState();
      click(cardAt('creation', 0, 'CONVENTIX').querySelector('[data-open-convention]'));
      const modal = document.getElementById('cp-project-modal');
      try {
        assertEqual(modal.dataset.activeTab, 'conventions');
        assertFalse(modal.classList.contains('cp-hidden'), 'la modale est ouverte');
        assertTrue(modal.querySelector('[data-cp-tab="conventions"]').classList.contains('active'));
      } finally { modal.classList.add('cp-hidden'); }
    });

    it('sans programme ni convention, la carte n\'a pas de ligne de tête vide', async function () {
      await loadFixtureState();
      project('INNOVX').Programme = 0;
      window.renderInstallation();
      assertFalse(!!cardAt('creation', 1, 'INNOVX').querySelector('.install-card-top'), 'ni bulle ni marque => pas de ligne de tête');
    });

    it('affiche le montant total et le rappel budget par grande masse (Fonctionnement/Investissement/Personnel)', async function () {
      await loadFixtureState();
      const card = cardAt('creation', 2, 'NOTIFY');
      assertEqual(card.querySelector('.install-amount-value').textContent, window.CoreUtils.formatCurrency(5000));
      assertDeepEqual(Array.from(card.querySelectorAll('.install-budget-label')).map(el => el.textContent), ['Fonct.', 'Invest.', 'Pers.']);
      assertDeepEqual(Array.from(card.querySelectorAll('.install-budget-value')).map(el => el.textContent),
        [window.CoreUtils.formatCurrency(3000), window.CoreUtils.formatCurrency(1500), window.CoreUtils.formatCurrency(500)]);
    });

    it('enregistre le commentaire OPE/installation sur Commentaire_ligne_OPE (Projets) au blur', async function () {
      await loadFixtureState();
      const textarea = cardAt('creation', 1, 'INNOVX').querySelector('[data-install-comment]');
      setValue(textarea, 'Relance DF le 10/11.');
      fire(textarea, 'blur');
      await wait(0);
      const call = window.__TEST_CALLS__.find(c => c.type === 'UpdateRecord' && c.table === 'Projets' && 'Commentaire_ligne_OPE' in c.fields);
      assertTrue(!!call, 'doit écrire Commentaire_ligne_OPE sur Projets');
      assertEqual(call.fields.Commentaire_ligne_OPE, 'Relance DF le 10/11.');
    });

    // Revue de bugs du 10/11/2026 : la garde « inchangé » comparait à la valeur du dernier RENDU, que l'écriture ne
    // refait pas : A → B (enregistré) puis B → A passait pour « inchangé » et B restait dans Grist.
    it('revenir à la valeur d\'origine après un premier enregistrement est bien enregistré (A → B → A)', async function () {
      await loadFixtureState();
      const textarea = cardAt('creation', 1, 'INNOVX').querySelector('[data-install-comment]');
      assertEqual(textarea.value, '', 'départ : commentaire vide');
      setValue(textarea, 'Relance DF');
      fire(textarea, 'blur');
      await wait(0);
      setValue(textarea, '');
      fire(textarea, 'blur');
      await wait(0);
      const writes = window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && c.table === 'Projets' && 'Commentaire_ligne_OPE' in c.fields);
      assertDeepEqual(writes.map(c => c.fields.Commentaire_ligne_OPE), ['Relance DF', ''], 'le retour à vide doit s\'écrire aussi');
    });

    it('un simple passage dans le champ sans modification n\'écrit rien', async function () {
      await loadFixtureState();
      const textarea = cardAt('creation', 1, 'INNOVX').querySelector('[data-install-comment]');
      fire(textarea, 'blur');
      await wait(0);
      assertEqual(window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && 'Commentaire_ligne_OPE' in c.fields).length, 0);
    });
  });

  describe('Installation des fonds — en rouge : « OPE disponible UB Invest » sans ligne OPE complète (12/11/2026)', function () {
    const incompleteLine = () => window.CoreState.setTable('Lignes_OPE', window.CoreState.getTable('Lignes_OPE').map(l => l.id === 3 ? { ...l, N_OPE: '' } : l));

    it('une ligne OPE complète (numéro et structure) à ce jalon n\'a rien de rouge', async function () {
      await loadFixtureState();
      const card = cardAt('creation', 2, 'NOTIFY');
      assertFalse(card.classList.contains('is-alert'));
      assertFalse(!!card.querySelector('.install-chip-alert'));
      assertFalse(msEl('creation', 2).classList.contains('has-alert'));
    });

    it('sans numéro de ligne OPE, la carte, sa pastille OPE et le jalon passent au rouge, avec « OPE à compléter »', async function () {
      await loadFixtureState();
      incompleteLine();
      window.renderInstallation();
      const card = cardAt('creation', 2, 'NOTIFY');
      assertTrue(card.classList.contains('is-alert'));
      assertTrue(card.querySelector('.install-chip-ope').classList.contains('is-alert'));
      assertEqual(card.querySelector('.install-chip-alert').textContent, 'OPE à compléter');
      assertTrue(msEl('creation', 2).classList.contains('has-alert'));
    });

    it('sans structure d\'installation non plus (numéro seul), c\'est incomplet', async function () {
      await loadFixtureState();
      window.CoreState.setTable('Lignes_OPE', window.CoreState.getTable('Lignes_OPE').map(l => l.id === 3 ? { ...l, installe_chez: 0 } : l));
      window.renderInstallation();
      assertTrue(cardAt('creation', 2, 'NOTIFY').classList.contains('is-alert'));
    });

    it('un projet sans aucune ligne OPE basculé à ce jalon passe au rouge ; il ne l\'est pas au 1er jalon', async function () {
      await loadFixtureState();
      assertFalse(cardAt('creation', 0, 'FINANCX').classList.contains('is-alert'), 'au 1er jalon, pas encore d\'attente d\'OPE');
      const select = cardAt('creation', 0, 'FINANCX').querySelector('[data-install-status]');
      select.value = '2';
      fire(select, 'change');
      await wait(0);
      const card = cardAt('creation', 2, 'FINANCX');
      assertTrue(card.classList.contains('is-alert'));
      assertEqual(card.querySelector('.install-chip-ope').textContent, 'Aucune ligne OPE');
      assertTrue(card.querySelector('.install-chip-ope').classList.contains('is-alert'));
    });

    it('à un autre jalon, une ligne incomplète n\'est pas rouge (2e jalon)', async function () {
      await loadFixtureState();
      window.CoreState.setTable('Lignes_OPE', window.CoreState.getTable('Lignes_OPE').map(l => l.id === 1 ? { ...l, N_OPE: '' } : l));
      window.renderInstallation();
      assertFalse(cardAt('creation', 1, 'INNOVX').classList.contains('is-alert'), 'INNOVX est au 2e jalon');
    });

    it('compléter la ligne OPE depuis la carte ramène la carte à la normale', async function () {
      await loadFixtureState();
      incompleteLine();
      window.renderInstallation();
      click(cardAt('creation', 2, 'NOTIFY').querySelector('[data-open-ope]'));
      const modal = document.getElementById('cp-ope-modal');
      setValue(modal.querySelector('#cpo-nope'), 'OPE-2026-003');
      await modal.querySelector('[data-cp-save]').onclick();
      assertFalse(cardAt('creation', 2, 'NOTIFY').classList.contains('is-alert'), 'numéro renseigné : plus rouge');
      assertFalse(msEl('creation', 2).classList.contains('has-alert'));
    });
  });

  function dragEvent(type, dataTransfer) {
    return new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer });
  }
  // Simule un glisser-déposer complet : poignée de la carte → corps du jalon cible.
  async function dragCardTo(card, body) {
    const handle = card.querySelector('[data-drag-project]');
    const dt = new DataTransfer();
    handle.dispatchEvent(dragEvent('dragstart', dt));
    body.dispatchEvent(dragEvent('dragover', dt));
    body.dispatchEvent(dragEvent('drop', dt));
    handle.dispatchEvent(dragEvent('dragend', dt));
    await wait(0);
  }

  describe('Installation des fonds — glisser-déposer entre jalons d\'une même zone', function () {
    it('glisser une carte vers un autre jalon écrit Jalon_installation_fonds et déplace la carte', async function () {
      await loadFixtureState();
      await dragCardTo(cardAt('creation', 1, 'INNOVX'), msBody('creation', 2));
      const writes = jalonWrites();
      assertEqual(writes.length, 1, 'une seule écriture');
      assertEqual(writes[0].id, 10);
      assertEqual(writes[0].fields[JALON], '3) OPE disponible UB Invest', 'valeur Grist exacte, avec le préfixe "3) "');
      assertTrue(!!cardAt('creation', 2, 'INNOVX'), 'INNOVX doit être au nouveau jalon');
      assertFalse(!!cardAt('creation', 1, 'INNOVX'), 'et plus à l\'ancien');
      assertTrue(msEl('creation', 1).classList.contains('is-done'), 'le jalon qu\'il quitte est vide : coche verte');
    });

    it('un dépôt dans l\'autre zone est ignoré : la zone vient de l\'action OPE, jamais d\'un glisser', async function () {
      await loadFixtureState();
      await dragCardTo(cardAt('creation', 1, 'INNOVX'), msBody('prolongation', 2));
      assertEqual(jalonWrites().length, 0, 'aucune écriture : le dépôt inter-zones doit être rejeté');
      assertTrue(!!cardAt('creation', 1, 'INNOVX'), 'INNOVX reste dans sa zone et à son jalon');
    });

    it('pendant le glisser, seuls les jalons de la zone de la carte acceptent le dépôt', async function () {
      await loadFixtureState();
      const handle = cardAt('creation', 1, 'INNOVX').querySelector('[data-drag-project]');
      const dt = new DataTransfer();
      handle.dispatchEvent(dragEvent('dragstart', dt));
      const same = dragEvent('dragover', dt), other = dragEvent('dragover', dt);
      msBody('creation', 2).dispatchEvent(same);
      msBody('prolongation', 2).dispatchEvent(other);
      assertTrue(same.defaultPrevented, 'jalon de la même zone : dépôt autorisé');
      assertFalse(other.defaultPrevented, 'jalon d\'une autre zone : dépôt refusé');
      handle.dispatchEvent(dragEvent('dragend', dt));
    });

    it('déposer une carte sur son propre jalon n\'écrit rien', async function () {
      await loadFixtureState();
      await dragCardTo(cardAt('creation', 1, 'INNOVX'), msBody('creation', 1));
      assertEqual(jalonWrites().length, 0, 'aucune écriture');
      assertFalse(!!document.querySelector('#install-zones .is-dragging, #install-zones .is-drop-target'), 'aucun état de glisser résiduel');
    });

    it('un glisser étranger (sans le type MIME propre à cette page) n\'est jamais accepté', async function () {
      await loadFixtureState();
      const body = msBody('creation', 2);
      const foreign = new DataTransfer();
      foreign.setData('text/plain', '10');
      const over = dragEvent('dragover', foreign);
      body.dispatchEvent(over);
      assertFalse(over.defaultPrevented, 'un glisser étranger ne doit pas être autorisé');
      body.dispatchEvent(dragEvent('drop', foreign));
      await wait(0);
      assertEqual(jalonWrites().length, 0, 'et un dépôt étranger n\'écrit rien');
    });

    it('glisser un projet sans ligne OPE vers « OPE disponible UB Invest » le passe au rouge', async function () {
      await loadFixtureState();
      await dragCardTo(cardAt('creation', 0, 'SIGNEX'), msBody('creation', 2));
      assertTrue(cardAt('creation', 2, 'SIGNEX').classList.contains('is-alert'));
    });
  });

  describe('Installation des fonds — menu d\'étape sur la carte (en plus du glisser-déposer)', function () {
    const statusSelect = (zone, idx, acronym) => cardAt(zone, idx, acronym).querySelector('[data-install-status]');

    it('chaque carte a un menu des 6 jalons de sa zone, sur le jalon actuel (aucun jalon = le 1er)', async function () {
      await loadFixtureState();
      const innovx = statusSelect('creation', 1, 'INNOVX');
      assertDeepEqual(Array.from(innovx.options).map(o => o.textContent), [
        '1 · Création de ligne', '2 · En attente DF ou OPE sur UBInvest', '3 · OPE disponible UB Invest',
        '4 · Projet en cours', '5 · Reliquats à traiter', '6 · Projet clôturé (reliquat inclus)']);
      assertEqual(innovx.value, '1');
      assertEqual(statusSelect('creation', 0, 'CONVENTIX').value, '0');
    });

    it('en zone Prolongation/réabondement, le menu porte les libellés de cette zone', async function () {
      await loadFixtureState();
      project('INNOVX').Action_Ligne_OPE_a_faire = 'Prolongation de ligne';
      window.renderInstallation();
      assertDeepEqual(Array.from(statusSelect('prolongation', 1, 'INNOVX').options).map(o => o.textContent).slice(0, 3),
        ['1 · Prolongation/réattribution', '2 · En attente DF', '3 · OPE disponible UB Invest']);
    });

    it('choisir un autre jalon écrit la valeur Grist exacte et déplace la carte aussitôt', async function () {
      await loadFixtureState();
      const select = statusSelect('creation', 1, 'INNOVX');
      select.value = '2';
      fire(select, 'change');
      await wait(0);
      const writes = jalonWrites();
      assertEqual(writes.length, 1, 'une seule écriture');
      assertEqual(writes[0].fields[JALON], '3) OPE disponible UB Invest');
      assertTrue(!!cardAt('creation', 2, 'INNOVX'));
      assertFalse(!!cardAt('creation', 1, 'INNOVX'));
      assertEqual(statusSelect('creation', 2, 'INNOVX').value, '2', 'le menu de la carte déplacée montre le nouveau jalon');
    });

    it('choisir un jalon caché déplie la partie cachée de la zone pour montrer la carte', async function () {
      await loadFixtureState();
      const select = statusSelect('creation', 1, 'INNOVX');
      select.value = '3';
      fire(select, 'change');
      await wait(0);
      assertEqual(jalonWrites()[0].fields[JALON], '4) Projet en cours');
      assertEqual(plusBtn('creation').getAttribute('aria-expanded'), 'true', 'la zone se déplie');
      assertTrue(!!cardAt('creation', 3, 'INNOVX'), 'la carte est visible à « Projet en cours »');
      click(plusBtn('creation'));
    });

    it('un projet sans ligne OPE change de jalon par le menu, dans sa zone', async function () {
      await loadFixtureState();
      const select = statusSelect('creation', 0, 'CONVENTIX');
      select.value = '1';
      fire(select, 'change');
      await wait(0);
      assertEqual(jalonWrites()[0].fields[JALON], '2) En attente DF (ou OPE sur UBInvest)');
      assertEqual(jalonWrites()[0].id, 12, 'CONVENTIX (id 12)');
      assertTrue(!!cardAt('creation', 1, 'CONVENTIX'));
    });

    it('rechoisir le jalon en cours n\'écrit rien', async function () {
      await loadFixtureState();
      const select = statusSelect('creation', 1, 'INNOVX');
      select.value = '1';
      fire(select, 'change');
      await wait(0);
      assertEqual(jalonWrites().length, 0);
    });

    it('un échec d\'écriture ramène la carte et son menu au jalon enregistré, et le dit', async function () {
      await loadFixtureState();
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async () => { throw new Error('boom'); };
      try {
        const select = statusSelect('creation', 1, 'INNOVX');
        select.value = '2';
        fire(select, 'change');
        await wait(0);
      } finally { window.grist.docApi.applyUserActions = original; }
      assertTrue(!!cardAt('creation', 1, 'INNOVX'), 'INNOVX doit rester à son jalon');
      assertEqual(statusSelect('creation', 1, 'INNOVX').value, '1', 'le menu ne doit pas afficher un jalon non enregistré');
      assertIncludes(document.getElementById('toast').textContent, 'boom');
    });
  });

  describe('Installation des fonds — clic sur le nom de l\'OPE : modale de la ligne OPE', function () {
    const opeModal = () => document.getElementById('cp-ope-modal');
    const innovxCard = () => cardAt('creation', 1, 'INNOVX');

    it('la pastille OPE est un bouton qui ouvre la modale de cette ligne, pré-remplie', async function () {
      await loadFixtureState();
      const chip = innovxCard().querySelector('[data-open-ope]');
      assertEqual(chip.tagName, 'BUTTON');
      assertEqual(chip.dataset.openOpe, '1', 'Lignes_OPE#1');
      fireMouse(chip, 'click');
      assertTrue(!!opeModal(), 'la modale OPE doit s\'ouvrir');
      assertEqual(opeModal().querySelector('h2').textContent, 'Modifier la ligne OPE');
      assertEqual(opeModal().querySelector('#cpo-nope').value, 'OPE-2026-001');
      assertEqual(opeModal().querySelector('#cpo-structure').value, '1', 'installée chez LAB1');
    });

    it('enregistrer met la carte à jour, et la passe côté DIESE si la ligne est désormais installée chez DIESE', async function () {
      await loadFixtureState();
      fireMouse(innovxCard().querySelector('[data-open-ope]'), 'click');
      setValue(opeModal().querySelector('#cpo-nope'), 'OPE-2026-001-bis');
      opeModal().querySelector('#cpo-structure').value = '3';
      await opeModal().querySelector('[data-cp-save]').onclick();

      const call = window.__TEST_CALLS__.find(c => c.type === 'UpdateRecord' && c.table === 'Lignes_OPE');
      assertTrue(!!call, 'doit écrire sur Lignes_OPE');
      assertEqual(call.id, 1);
      assertDeepEqual(call.fields, { N_OPE: 'OPE-2026-001-bis', installe_chez: 3 });
      assertFalse(!!opeModal(), 'la modale se ferme');
      const moved = cardAt('creation', 1, 'INNOVX');
      assertTrue(!!moved, 'INNOVX reste à son jalon');
      assertEqual(moved.dataset.lieu, 'diese', 'mais passe du côté DIESE (couleur bleue)');
      assertEqual(moved.querySelector('.install-chip-ope').textContent, 'OPE n°OPE-2026-001-bis — chez DIESE');
    });

    it('annuler ne change rien', async function () {
      await loadFixtureState();
      fireMouse(innovxCard().querySelector('[data-open-ope]'), 'click');
      setValue(opeModal().querySelector('#cpo-nope'), 'AUTRE');
      opeModal().querySelector('[data-cp-cancel]').onclick();
      assertFalse(!!opeModal());
      assertEqual(window.__TEST_CALLS__.length, 0, 'aucun appel Grist');
      assertEqual(innovxCard().querySelector('.install-chip-ope').textContent, 'OPE n°OPE-2026-001 — chez LAB1');
    });

    it('un projet sans ligne OPE n\'a pas de pastille à ouvrir', async function () {
      await loadFixtureState();
      const card = cardAt('creation', 0, 'CONVENTIX');
      assertFalse(!!card.querySelector('[data-open-ope]'), 'rien à ouvrir sans ligne OPE');
      assertEqual(card.querySelector('.install-chip-ope').tagName, 'SPAN');
    });
  });

  describe('Installation des fonds — colonne Jalon_installation_fonds créée par le widget, ancienne colonne reprise', function () {
    it('crée la colonne Choice sur Projets, puis reprend les anciennes valeurs dans la nouvelle (une seule écriture groupée, une seule fois)', async function () {
      await loadFixtureState();
      await window.loadInstallationUserPreferences();

      const columnCalls = window.__TEST_CALLS__.filter(c => c.type === 'AddColumn' && c.table === 'Projets' && c.colId === JALON);
      assertEqual(columnCalls.length, 1, 'la colonne est créée');
      assertEqual(columnCalls[0].colInfo.type, 'Choice');
      assertDeepEqual(JSON.parse(columnCalls[0].colInfo.widgetOptions).choices, J);

      assertEqual(jalonWrites().length, 2, 'INNOVX et NOTIFY avaient un ancien statut');
      const byId = Object.fromEntries(jalonWrites().map(c => [c.id, c.fields[JALON]]));
      assertEqual(byId[10], '2) En attente DF (ou OPE sur UBInvest)', 'INNOVX : « 2) Ouverture demandée à la DF »');
      assertEqual(byId[11], '3) OPE disponible UB Invest', 'NOTIFY : « 3) Installé »');
      assertEqual(project('INNOVX')[JALON], '2) En attente DF (ou OPE sur UBInvest)', 'données chargées à jour');
      assertEqual(project('INNOVX').Statut_installation_fonds, '2) Ouverture demandée à la DF', 'l\'ancienne colonne n\'est jamais modifiée');

      const before = jalonWrites().length;
      await window.loadInstallationUserPreferences();
      assertEqual(jalonWrites().length, before, 'plus rien à reprendre au chargement suivant');
    });

    it('chaque ancienne étape trouve son jalon : En attente DR/ouverture → 1, Ouverture demandée → 2, Installé → 3, Reliquat → 5, Clôturer → 6', async function () {
      await loadFixtureState();
      const expected = {
        '1) En attente ouverture': 0, '1) En attente DR': 0, '2) Ouverture demandée à la DF': 1,
        '3) Installé': 2, '4) Reliquat à traiter': 4, '5) Clôturer': 5
      };
      Object.entries(expected).forEach(([legacy, idx]) =>
        assertEqual(window.InstallationLogic.rawJalonIndex({ Statut_installation_fonds: legacy }), idx, `« ${legacy} »`));
    });

    it('sans droit d\'écriture, la page lit quand même l\'ancienne colonne : rien n\'est perdu', async function () {
      await loadFixtureState();
      const original = window.grist.docApi.applyUserActions;
      window.grist.docApi.applyUserActions = async () => { throw new Error('lecture seule'); };
      try { await window.loadInstallationUserPreferences(); } finally { window.grist.docApi.applyUserActions = original; }
      window.renderInstallation();
      assertTrue(!!cardAt('creation', 1, 'INNOVX'), 'INNOVX reste à son jalon');
      assertTrue(!!cardAt('creation', 2, 'NOTIFY'));
    });

    it('la liste de choix de la colonne dans Grist est complétée (couleurs conservées), une seule fois', async function () {
      window.__mockSetTable('_grist_Tables', { id: [1], tableId: ['Projets'] });
      window.__mockSetTable('_grist_Tables_column', {
        id: [5], parentId: [1], colId: [JALON], type: ['Choice'], description: [''],
        widgetOptions: [JSON.stringify({ choices: J.slice(0, 3), choiceOptions: { [J[2]]: { fillColor: '#00FF00' } } })]
      });
      await window.CoreGrist.loadColumnDescriptions();
      await loadFixtureState();

      await window.loadInstallationUserPreferences();

      const metaWrites = () => window.__TEST_CALLS__.filter(c => c.type === 'UpdateRecord' && c.table === '_grist_Tables_column');
      assertEqual(metaWrites().length, 1, 'une écriture sur la métadonnée de la colonne');
      assertEqual(metaWrites()[0].id, 5);
      const options = JSON.parse(metaWrites()[0].fields.widgetOptions);
      assertDeepEqual(options.choices, J);
      assertEqual(options.choiceOptions[J[2]].fillColor, '#00FF00', 'les couleurs déjà choisies sont conservées');

      await window.loadInstallationUserPreferences();
      assertEqual(metaWrites().length, 1, 'liste déjà à jour : pas de nouvelle écriture');
    });
  });

  describe('Installation des fonds — préférences utilisateur persistées (table Preferences_Widget, partagée)', function () {
    it('ajoute ses colonnes Install_* à la table Preferences_Widget si elle existe déjà (créée par une autre page)', async function () {
      await loadFixtureState();
      await window.loadKanbanUserPreferences();
      const before = await window.CoreGrist.getTable('Preferences_Widget');
      assertFalse('Install_lieux' in before[0], 'la colonne Install_lieux ne doit pas exister avant le chargement Installation');

      await window.loadInstallationUserPreferences();

      const after = await window.CoreGrist.getTable('Preferences_Widget');
      assertTrue('Install_lieux' in after[0], 'la colonne Install_lieux doit avoir été ajoutée');
      assertFalse('Install_repliees' in after[0], 'les anciennes colonnes des volets ne sont plus créées');
      const addColumnCalls = window.__TEST_CALLS__.filter(c => c.type === 'AddColumn' && c.table === 'Preferences_Widget');
      assertEqual(addColumnCalls.length, 5, 'les 5 colonnes Install_* (lieux, parties dépliées, 3 filtres) doivent être ajoutées');
      const addTableCalls = window.__TEST_CALLS__.filter(c => c.type === 'AddTable' && c.table === 'Preferences_Widget');
      assertEqual(addTableCalls.length, 1, 'la table ne doit pas être recréée, seulement complétée');
    });

    it('crée elle-même la table (avec ses colonnes) si aucune autre page ne l\'a encore fait', async function () {
      await loadFixtureState();
      const before = await window.CoreGrist.gristInstance.docApi.listTables();
      assertFalse(before.includes('Preferences_Widget'), 'la table ne doit pas exister avant tout chargement de préférences');

      await window.loadInstallationUserPreferences();

      const rows = await window.CoreGrist.getTable('Preferences_Widget');
      assertEqual(rows.length, 1, 'une ligne doit avoir été créée');
      assertTrue('Install_lieux' in rows[0], 'la table auto-créée doit inclure les colonnes Install_*');
    });

    it('réutilise la même ligne que les autres pages (id de ligne partagé via localStorage), sans doublon d\'AddRecord', async function () {
      await loadFixtureState();
      await window.loadKanbanUserPreferences();
      await window.loadInstallationUserPreferences();
      const addRecordCalls = window.__TEST_CALLS__.filter(c => c.type === 'AddRecord' && c.table === 'Preferences_Widget');
      assertEqual(addRecordCalls.length, 1, 'Kanban et Installation doivent partager la même ligne, pas en créer une seconde');
    });

    it('encode la bascule DIESE / AUTRE et les parties cachées dépliées, enregistrées par UpdateRecord', async function () {
      await loadFixtureState();
      await window.loadKanbanUserPreferences();
      await window.loadInstallationUserPreferences();

      click(plusBtn('creation'));
      await wait(0);
      click(lieuBtn('autre'));
      await wait(0);

      const rows = await window.CoreGrist.getTable('Preferences_Widget');
      assertEqual(rows.length, 1, 'toujours une seule ligne de préférences');
      assertEqual(rows[0].Install_lieux, 'diese', 'seul DIESE reste actif');
      assertEqual(rows[0].Install_plus, 'creation', 'la partie cachée de Création est dépliée');

      // Nettoyage : état par défaut pour ne pas polluer les tests suivants.
      click(lieuBtn('autre'));
      click(plusBtn('creation'));
      await wait(0);
    });

    it('restaure la bascule et les parties dépliées à un rechargement ultérieur, dans le même navigateur', async function () {
      await loadFixtureState();
      await window.loadKanbanUserPreferences();
      await window.loadInstallationUserPreferences();

      click(plusBtn('prolongation'));
      await wait(0);
      click(lieuBtn('diese'));
      await wait(0);
      // Simule un rechargement : on repart de l'état par défaut de la page, la ligne reste en cache (localStorage).
      click(plusBtn('prolongation'));
      click(lieuBtn('diese'));
      const rows = await window.CoreGrist.getTable('Preferences_Widget');
      await window.CoreGrist.gristInstance.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', rows[0].id, { Install_lieux: 'autre', Install_plus: 'prolongation' }]]);

      await window.loadInstallationUserPreferences();
      window.renderInstallation();

      assertTrue(lieuBtn('autre').classList.contains('is-on'));
      assertFalse(lieuBtn('diese').classList.contains('is-on'), 'seul AUTRE est restauré');
      assertEqual(plusBtn('prolongation').getAttribute('aria-expanded'), 'true', 'la partie cachée de Prolongation reste dépliée');
      assertEqual(plusBtn('creation').getAttribute('aria-expanded'), 'false');
      const addRecordCalls = window.__TEST_CALLS__.filter(c => c.type === 'AddRecord' && c.table === 'Preferences_Widget');
      assertEqual(addRecordCalls.length, 1, 'le rechargement ne doit pas créer de nouvelle ligne de préférences');

      // Nettoyage.
      click(document.getElementById('install-clear-filters'));
      click(plusBtn('prolongation'));
      await wait(0);
    });

    it('des préférences enregistrées invalides (lieu ou zone inconnus) retombent sur le défaut', async function () {
      await loadFixtureState();
      await window.loadKanbanUserPreferences();
      await window.loadInstallationUserPreferences();
      const rows = await window.CoreGrist.getTable('Preferences_Widget');
      await window.CoreGrist.gristInstance.docApi.applyUserActions([['UpdateRecord', 'Preferences_Widget', rows[0].id, { Install_lieux: 'nulle part', Install_plus: 'ailleurs' }]]);
      await window.loadInstallationUserPreferences();
      window.renderInstallation();
      assertTrue(lieuBtn('diese').classList.contains('is-on') && lieuBtn('autre').classList.contains('is-on'), 'les deux lieux restent actifs');
      assertEqual(msLabels('creation').length, 3, 'aucune zone dépliée');
    });
  });
})();
