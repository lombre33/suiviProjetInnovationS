/**
 * Non-regression suite: bulles d'aide sur les libellés de champs liés à une
 * colonne Grist (js/components/help-tooltip.js), et leur branchement dans
 * project-modal.js / page-administratif.js.
 *
 * Les descriptions de colonnes viennent des métadonnées _grist_Tables /
 * _grist_Tables_column (même source que js/core/grist-bridge.js) — absentes des
 * fixtures par défaut, donc CoreGrist.loadColumnDescriptions() n'y trouve rien
 * tant qu'un test n'installe pas lui-même ces tables via __mockSetTable. C'est ce
 * qui garantit qu'aucune autre suite (ouvrant la modale projet ou la page
 * Administratif sans jamais parler de descriptions) ne voit d'icône inattendue.
 */
(function () {
  'use strict';

  function installDescriptions(entries) {
    // entries: [{table, col, description}]
    const tableNames = [...new Set(entries.map(e => e.table))];
    const metaTables = { id: tableNames.map((_, i) => i + 1), tableId: tableNames };
    const metaCols = { id: [], parentId: [], colId: [], description: [] };
    entries.forEach((entry, i) => {
      metaCols.id.push(i + 1);
      metaCols.parentId.push(tableNames.indexOf(entry.table) + 1);
      metaCols.colId.push(entry.col);
      metaCols.description.push(entry.description);
    });
    window.__mockSetTable('_grist_Tables', metaTables);
    window.__mockSetTable('_grist_Tables_column', metaCols);
    return window.CoreGrist.loadColumnDescriptions();
  }

  function bubble() { return document.querySelector('.help-tooltip-bubble'); }
  function bubbleVisible() { const b = bubble(); return !!b && !b.hidden; }

  describe('Bulle d\'aide — icône absente/présente selon la description Grist', function () {
    it('sans description pour la colonne, aucune icône ; avec une description, une icône apparaît', async function () {
      // Acronyme n'a pas de description connue (métadonnées limitées à Projet) :
      // vérifie que l'absence est bien silencieuse, pas une icône vide.
      await installDescriptions([{ table: 'Projets', col: 'Projet', description: 'Nom complet du projet, tel qu\'il apparaît dans les communications officielles.' }]);
      const modal = window.ProjectModal.open();
      const acronymeField = modal.querySelector('#cp-Acronyme')?.closest('.cp-field');
      assertFalse(!!acronymeField?.querySelector('.help-icon'), 'Acronyme n\'a pas de description : aucune icône attendue');
      const projetField = modal.querySelector('#cp-Projet')?.closest('.cp-field');
      const icon = projetField?.querySelector('.help-icon');
      assertTrue(!!icon, 'Projet a une description : une icône est attendue à côté du libellé');
      assertEqual(icon.dataset.helpText, 'Nom complet du projet, tel qu\'il apparaît dans les communications officielles.');
    });

    it('un champ référence (Programme) et un champ construit par chipGroup (Type de projet) reçoivent aussi l\'icône', async function () {
      await installDescriptions([
        { table: 'Projets', col: 'Programme', description: 'Programme de rattachement du projet.' },
        { table: 'Projets', col: 'Type_projet', description: 'Catégorie du projet (création, renouvellement, etc.).' }
      ]);
      const modal = window.ProjectModal.open();
      const programmeIcon = Array.from(modal.querySelectorAll('.cp-ref label')).find(l => l.textContent.startsWith('Programme'))?.parentElement.querySelector('.help-icon');
      assertTrue(!!programmeIcon, 'le champ référence Programme doit porter l\'icône d\'aide');
      const typeIcon = Array.from(modal.querySelectorAll('label')).find(l => l.textContent === 'Type de projet')?.parentElement.querySelector('.help-icon');
      assertTrue(!!typeIcon, 'le champ Type de projet (chipGroup) doit porter l\'icône d\'aide');
    });
  });

  describe('Bulle d\'aide — survol, épinglage au clic, fermeture', function () {
    async function openWithAcronymeHelp() {
      await installDescriptions([{ table: 'Projets', col: 'Acronyme', description: 'Code court, unique, utilisé partout dans le widget.' }]);
      const modal = window.ProjectModal.open();
      const icon = modal.querySelector('#cp-Acronyme').closest('.cp-field').querySelector('.help-icon');
      assertTrue(!!icon, 'icône attendue pour Acronyme');
      return icon;
    }

    it('survol affiche la bulle avec le texte de la description, sortie la masque', async function () {
      const icon = await openWithAcronymeHelp();
      assertFalse(bubbleVisible(), 'aucune bulle visible avant le survol');
      fireMouse(icon, 'mouseover');
      assertTrue(bubbleVisible(), 'la bulle doit apparaître au survol');
      assertEqual(bubble().textContent, 'Code court, unique, utilisé partout dans le widget.');
      fireMouse(icon, 'mouseout');
      assertFalse(bubbleVisible(), 'la bulle doit disparaître à la sortie du survol');
    });

    it('un clic épingle la bulle (le survol d\'un autre élément ne la ferme plus)', async function () {
      const icon = await openWithAcronymeHelp();
      fireMouse(icon, 'click');
      assertTrue(bubbleVisible(), 'la bulle doit apparaître et rester visible après un clic');
      fireMouse(document.body, 'mouseover');
      fireMouse(icon, 'mouseout');
      assertTrue(bubbleVisible(), 'une bulle épinglée ne doit pas se fermer au survol/sortie d\'un autre élément');
    });

    it('un clic ailleurs referme la bulle épinglée ; Échap aussi', async function () {
      const icon = await openWithAcronymeHelp();
      fireMouse(icon, 'click');
      assertTrue(bubbleVisible(), 'épinglée après le premier clic');
      fireMouse(document.body, 'click');
      assertFalse(bubbleVisible(), 'un clic en dehors de la bulle doit la refermer');

      fireMouse(icon, 'click');
      assertTrue(bubbleVisible(), 'épinglée de nouveau');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assertFalse(bubbleVisible(), 'Échap doit refermer la bulle épinglée');
    });

    it('re-cliquer la même icône désépingle (bascule)', async function () {
      const icon = await openWithAcronymeHelp();
      fireMouse(icon, 'click');
      assertTrue(bubbleVisible(), 'épinglée après le premier clic');
      fireMouse(icon, 'click');
      assertFalse(bubbleVisible(), 'recliquer la même icône doit désépingler/refermer la bulle');
    });
  });

  describe('Bulle d\'aide — page Administratif (en-têtes de volet)', function () {
    async function renderWithStageHelp() {
      await installDescriptions([
        { table: 'Notifications', col: 'notifications_Statut', description: 'Étape de relecture/signature de la notification.' },
        { table: 'Projets', col: 'Conventions_statut', description: 'Étape de rédaction/signature de la convention de reversement.' }
      ]);
      const tables = await window.CoreGrist.loadAllTables();
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
    }

    it('chaque en-tête de volet Notifications porte l\'icône d\'aide de notifications_Statut', async function () {
      await renderWithStageHelp();
      const headers = Array.from(document.querySelectorAll('#admin-col-notif .admin-panel-header h4'));
      assertTrue(headers.length > 0, 'des volets Notifications doivent être rendus');
      headers.forEach(h4 => assertTrue(!!h4.querySelector('.help-icon'), `en-tête "${h4.textContent}" doit porter l'icône d'aide`));
    });

    it('chaque en-tête de volet Conventions porte l\'icône d\'aide de Conventions_statut', async function () {
      await renderWithStageHelp();
      const headers = Array.from(document.querySelectorAll('#admin-col-conv .admin-panel-header h4'));
      assertTrue(headers.length > 0, 'des volets Conventions doivent être rendus');
      headers.forEach(h4 => assertTrue(!!h4.querySelector('.help-icon'), `en-tête "${h4.textContent}" doit porter l'icône d'aide`));
    });

    it('sans description connue, les en-têtes ne portent aucune icône (comportement par défaut)', async function () {
      const tables = await window.CoreGrist.loadAllTables();
      Object.entries(tables).forEach(([name, data]) => window.CoreState.setTable(name, data));
      window.renderAdministratif();
      const headers = document.querySelectorAll('#admin-col-notif .admin-panel-header h4, #admin-col-conv .admin-panel-header h4');
      assertTrue(headers.length > 0, 'des volets doivent être rendus');
      headers.forEach(h4 => assertFalse(!!h4.querySelector('.help-icon'), `en-tête "${h4.textContent}" ne doit porter aucune icône sans description`));
    });
  });
})();
