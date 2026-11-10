/**
 * Non-regression suite : compléments de la page « par instance » (js/pages/page-instances.js) — petits gestes que
 * suite-instances.js laissait de côté : ouvrir le dossier externe d'un point, créneau de fin d'un invité, heure sans
 * date de séance, date d'envoi du CR saisie à la main, rouvrir l'étape « Envoi du CR ».
 *
 * Même jeu de données que suite-instances.js (window.__instancesTestSetup) : séance n°14 (id 2, 23/11/2026 09:30),
 * points 1 à 3, invités Alice (id 1), Bob (id 2), Chloé (id 3).
 */
(function () {
  'use strict';

  const TODAY = '2026-11-09';
  const gd = iso => Math.floor(Date.parse(iso + 'T00:00:00Z') / 1000);
  const setup = opts => window.__instancesTestSetup(opts);
  const root = () => document.getElementById('instances-root');
  const q = sel => root().querySelector(sel);
  const attrs = a => Object.keys(a || {}).map(k => `[data-${k}="${a[k]}"]`).join('');
  function click(act, a) {
    const el = q(`[data-act="${act}"]` + attrs(a));
    if (!el) throw new Error(`Bouton introuvable : ${act} ${JSON.stringify(a || {})}`);
    fireMouse(el, 'click');
  }
  function change(chg, a, value) {
    const el = q(`[data-chg="${chg}"]` + attrs(a));
    if (!el) throw new Error(`Champ introuvable : ${chg}`);
    el.value = value;
    fire(el, 'change');
  }
  const step = key => click('step', { v: key });
  const calls = (type, table) => window.__TEST_CALLS__.filter(c => c.type === type && c.table === table);
  const lastFields = (type, table, id) => { const list = calls(type, table).filter(c => id == null || c.id === id); return list.length ? list[list.length - 1].fields : null; };
  const text = sel => (q(sel) ? q(sel).textContent.replace(/\s+/g, ' ').trim() : '');

  describe('Instances — gestes complémentaires', function () {
    it('dossier du point : « Ouvrir dans un nouvel onglet » ouvre le lien externe, sans transmettre la page d\'origine (noopener)', async function () {
      await setup({ rows: d => { const p = d.Instance_Points.find(x => x.id === 3); p.Lien_type = 'Lien externe'; p.Lien = 'https://exemple.fr/dossier'; } });
      step('odj');
      click('menu', { v: 'lien:3' });
      const opened = [];
      const original = window.open;
      window.open = (...args) => { opened.push(args); return null; };
      try {
        assertIncludes(text('.in-menu'), 'Ouvrir dans un nouvel onglet');
        click('pt-link-open', { id: 3 });
      } finally { window.open = original; }
      assertEqual(opened.length, 1, 'un seul onglet');
      assertEqual(opened[0][0], 'https://exemple.fr/dossier');
      assertEqual(opened[0][1], '_blank');
      assertIncludes(String(opened[0][2]), 'noopener');
    });

    it('créneau de présence : l\'heure de fin se choisit puis s\'efface, comme celle du début', async function () {
      await setup();
      step('invites');
      click('menu', { v: 't:2:a' });
      click('time-pick', { s: 'g-a', id: 2, v: '11:00' });
      assertEqual(lastFields('UpdateRecord', 'Instance_Invites', 2).Dispo_a, '11:00');
      click('menu', { v: 't:2:a' });
      click('time-clear', { s: 'g-a', id: 2 });
      assertEqual(lastFields('UpdateRecord', 'Instance_Invites', 2).Dispo_a, '');
    });

    it('heure de la séance choisie avant d\'en avoir fixé la date : message clair, rien n\'est écrit', async function () {
      await setup({ rows: d => { const s = d.Suivi_Instance.find(x => x.id === 2); s.date = null; s.Heure = null; } });
      click('menu', { v: 'seance' });
      click('seance-pick', { id: 2 }); // la séance sans date n'est pas celle affichée par défaut
      click('menu', { v: 'heure' });
      click('time-pick', { s: 'heure', v: '10:15' });
      assertIncludes(document.getElementById('toast').textContent, 'Renseignez d\'abord la date de la séance');
      assertTrue(document.getElementById('toast').classList.contains('error'), 'message d\'erreur');
      assertEqual(calls('UpdateRecord', 'Suivi_Instance').length, 0, 'aucune écriture');
    });

    it('mail du compte rendu : une date saisie à la main s\'enregistre, et « Rouvrir l\'étape » efface la date d\'envoi', async function () {
      await setup();
      step('crmail');
      change('crm-date', null, '2026-11-12');
      await waitFor(() => lastFields('UpdateRecord', 'Suivi_Instance', 2) && lastFields('UpdateRecord', 'Suivi_Instance', 2).Mail_CR_le === gd('2026-11-12'), 'date d\'envoi saisie');
      await waitFor(() => /Envoyé le 12\/11\/2026/.test(text('.in-panel .in-stt')), 'étape validée par la date saisie');
      click('reopen');
      assertEqual(lastFields('UpdateRecord', 'Suivi_Instance', 2).Mail_CR_le, null, 'la date d\'envoi est effacée');
      await waitFor(() => !/Envoyé le/.test(text('.in-panel .in-stt')), 'étape rouverte');
    });

    it('mail d\'invitation : rouvrir l\'étape efface la date d\'envoi mais laisse les invités déjà marqués « écrits »', async function () {
      await setup();
      step('invitation');
      click('inv-today');
      assertEqual(lastFields('UpdateRecord', 'Suivi_Instance', 2).Mail_invitation_le, gd(TODAY));
      click('reopen');
      assertEqual(lastFields('UpdateRecord', 'Suivi_Instance', 2).Mail_invitation_le, null);
      assertEqual(calls('UpdateRecord', 'Instance_Invites').filter(c => c.fields.Ecrit_le === null).length, 0, 'aucun invité n\'est « dé-écrit »');
    });
  });
})();
