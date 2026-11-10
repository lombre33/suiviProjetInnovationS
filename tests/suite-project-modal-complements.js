/**
 * Non-regression suite : compléments de la modale projet (js/components/project-modal.js) sur les deux règles de la
 * convention de reversement livrées les 02 et 03/11/2026 — garde-fou « le Fonctionnement doit couvrir le montant
 * reversé » (bloquant) et rappel versement 70 % / 30 % au-delà de 20 000 € (non bloquant). suite-project-modal.js couvre
 * les cas principaux ; ici les bornes et les cas limites : seuil strictement dépassé, remise à zéro en décochant, case
 * décochée, Fonctionnement cumulé sur plusieurs années, montants dans le message.
 */
(function () {
  'use strict';

  const modalEl = () => document.getElementById('cp-project-modal');
  const refInput = key => modalEl().querySelector(`[data-ref="${key}"]`);
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
  // Même base que suite-project-modal.js : tous les champs obligatoires, Fonctionnement 2026 = 1 000 €.
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
    modalEl().querySelector('.cp-chip-row [data-value="Creation de ligne"]').click();
    setFin('c2026_M10_Fonctionnement', '1000');
  }
  function setFin(key, value) {
    const input = modalEl().querySelector(`[data-fin="${key}"]`);
    setValue(input, value);
    fire(input, 'input');
  }
  function setPartners(p1, p2) {
    const a = modalEl().querySelector('#cp-Convention_montant_partenaire_1');
    const b = modalEl().querySelector('#cp-Convention_montant_partenaire_2');
    setValue(a, String(p1)); fire(a, 'input');
    setValue(b, String(p2)); fire(b, 'input');
  }
  function addPartner() {
    const partner = refInput('Partenaire_s_convention_reversement');
    fire(partner, 'focus');
    partner.parentElement.querySelector('.cp-ref-list button').click();
  }
  function setConvention(checked) {
    const checkbox = modalEl().querySelector('#cp-Convention_de_reversement');
    checkbox.checked = checked;
    fire(checkbox, 'change');
  }
  const save = () => modalEl().querySelector('[data-cp-save]').onclick();
  const errorText = () => modalEl().querySelector('#cp-project-error').textContent;
  const notice7030 = () => document.getElementById('cp-convention-7030-notice');
  const projectWrites = () => window.__TEST_CALLS__.filter(c => c.table === 'Projets' && (c.type === 'AddRecord' || c.type === 'UpdateRecord'));

  describe('Modale Projet — rappel 70/30 : bornes du seuil de 20 000 €', function () {
    it('le seuil est strictement dépassé : 20 000 € pile ne déclenche rien, 20 001 € oui (somme des deux partenaires)', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      setConvention(true);
      setPartners(20000, 0);
      assertTrue(notice7030().classList.contains('cp-hidden'), '20 000 € : pas de pop-up');
      setPartners(20000, 1);
      assertFalse(notice7030().classList.contains('cp-hidden'), '20 001 € : pop-up');
    });

    it('la somme des deux partenaires compte, pas chaque montant : 10 000 + 10 001 dépasse le seuil', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      setConvention(true);
      setPartners(10000, 10000);
      assertTrue(notice7030().classList.contains('cp-hidden'), '2 × 10 000 € = 20 000 €');
      setPartners(10000, 10001);
      assertFalse(notice7030().classList.contains('cp-hidden'), 'dès 20 001 €');
    });

    it('décocher la case rend la pop-up à nouveau possible : la recocher au-dessus du seuil la rouvre', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      setConvention(true);
      setPartners(15000, 10000);
      assertFalse(notice7030().classList.contains('cp-hidden'));
      notice7030().querySelector('[data-cp-convention-7030-close]').click();
      assertTrue(notice7030().classList.contains('cp-hidden'), 'fermée');

      setConvention(false);
      assertTrue(notice7030().classList.contains('cp-hidden'), 'case décochée : rien');
      setConvention(true);
      assertFalse(notice7030().classList.contains('cp-hidden'), 'recochée avec 25 000 € : la pop-up revient');
    });

    it('case décochée, un montant élevé ne déclenche jamais la pop-up', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      setPartners(30000, 30000);
      setFin('c2026_M20_Investissement', '50000');
      assertTrue(notice7030().classList.contains('cp-hidden'));
    });

    it('rouvrir la modale sur un autre projet repart de zéro : la pop-up fermée d\'un projet n\'empêche pas celle du suivant', async function () {
      const tables = await loadFixtureState();
      await fillMinimalValidProject();
      setConvention(true);
      setPartners(25000, 0);
      assertFalse(notice7030().classList.contains('cp-hidden'));
      window.ProjectModal.open(tables.Projets.find(p => p.Acronyme === 'CONVENTIX'));
      assertTrue(notice7030().classList.contains('cp-hidden'), 'la pop-up du projet précédent est fermée à l\'ouverture');
      setConvention(false);
      setConvention(true);
      setPartners(25000, 0);
      assertFalse(notice7030().classList.contains('cp-hidden'), 'et peut se rouvrir pour ce projet-ci');
    });
  });

  describe('Modale Projet — garde-fou Fonctionnement : cas limites', function () {
    it('case « Convention de reversement » décochée : aucun contrôle, même avec des montants partenaires supérieurs au Fonctionnement', async function () {
      await loadFixtureState();
      await fillMinimalValidProject(); // Fonctionnement 1 000 €
      setPartners(5000, 5000);
      assertEqual(modalEl().querySelector('#cp-Convention_de_reversement').checked, false);
      await save();
      assertEqual(errorText(), '', 'aucun message');
      assertEqual(projectWrites().length, 1, 'le projet est enregistré');
    });

    it('le Fonctionnement est cumulé sur toutes les années : 1 000 € + 500 € couvrent 1 500 €, pas 1 500,01 €', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      setFin('c2027_M10_Fonctionnement', '500'); // Fonctionnement : 1 000 (2026) + 500 (2027)
      setConvention(true);
      addPartner();
      setPartners(1000, 500.01);
      await save();
      assertIncludes(errorText(), 'Fonctionnement', 'bloqué à 1 500,01 €');
      assertEqual(projectWrites().length, 0);
      setPartners(1000, 500);
      await save();
      assertEqual(projectWrites().length, 1, 'passe à 1 500 € pile');
    });

    it('l\'Investissement et le Personnel ne comptent jamais pour couvrir la convention', async function () {
      await loadFixtureState();
      await fillMinimalValidProject(); // Fonctionnement 1 000 €
      setFin('c2026_M20_Investissement', '9000');
      setFin('c2026_M30_Personnel', '9000');
      setConvention(true);
      addPartner();
      setPartners(1001, 0);
      await save();
      assertIncludes(errorText(), 'Fonctionnement');
      assertEqual(projectWrites().length, 0, 'bloqué malgré 19 000 € d\'Investissement et de Personnel');
    });

    it('le message cite les deux montants (budget de Fonctionnement et convention) en euros lisibles', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      setConvention(true);
      addPartner();
      setPartners(1200, 300);
      await save();
      assertIncludes(errorText(), '1 000 €', 'le budget de Fonctionnement');
      assertIncludes(errorText(), '1 500 €', 'le montant de la convention');
      assertEqual(modalEl().dataset.activeTab, 'budget', 'la modale ouvre l\'onglet Budget');
    });

    it('corriger le budget lève le blocage : le message précédent n\'empêche pas l\'enregistrement suivant', async function () {
      await loadFixtureState();
      await fillMinimalValidProject();
      setConvention(true);
      addPartner();
      setPartners(1200, 300);
      await save();
      assertIncludes(errorText(), 'Fonctionnement');
      setFin('c2026_M10_Fonctionnement', '1500');
      await save();
      assertEqual(projectWrites().length, 1, 'enregistré après correction');
      assertTrue(modalEl().classList.contains('cp-hidden'), 'la modale se referme');
    });
  });
})();
