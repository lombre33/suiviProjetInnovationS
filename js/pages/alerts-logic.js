/**
 * Alertes financières — règles de calcul (pures : aucun accès au DOM ni à Grist, testées dans tests/suite-alerts.js).
 *
 * Maquette v3 du 24/11/2026 (« Alertes et dashboard financiers »), règle d'Antoine du 23/11 : sur InnovationS tous les crédits sont
 * pluriannuels ; une alerte = un projet dont la date limite de financement approche alors que le rythme d'engagement est trop faible ;
 * ensuite les projets clos et leurs reliquats. S'ajoute (24/11) l'alerte « OPE non renseignée ».
 *
 * Trois familles, calculées sur un jeu de données de DashboardLogic.buildDataset (rien n'est relu dans Grist) :
 *  - À compléter : un projet suivi (en cours, en retard, en attente des fonds) dont l'OPE n'est pas exploitable — aucune ligne OPE,
 *    ligne sans N° OPE, montants saisis sur l'OPE 2 à 4 sans ligne reliée, ou N° OPE absent de tout envoi validé (seulement quand on
 *    connaît les codes reçus : `knownCodes`, sinon on ne peut pas savoir) ;
 *  - Échéances : un projet « en cours » ou « En retard » avec une Projets.Date_limite_financement. Rythme = part engagée (AE) de l'attribué
 *    comparée à la part du temps écoulé entre le début du financement et la date limite ; retard = temps écoulé − part engagée, en points :
 *    ≥ LAG_HIGH risque élevé, ≥ LAG_MID risque moyen (seuils proposés, à valider par Antoine). Échéance dépassée = « échue ». Un projet n'entre
 *    dans l'alerte que si sa date limite tombe dans l'horizon choisi (3, 6 ou 12 mois), sauf les échues qui restent ;
 *  - Clôtures : « cloturé avec Reliquat à traiter » (reliquat = attribué − consommé CP) et « Suposé cloturé sans information… » (à confirmer).
 *
 * Attribué = somme de TOUTES les années 2023-2029 et de toutes les OPE (les colonnes cAAAA_*, plus leurs suffixes _2 à _4) : le financement est
 * pluriannuel, on ne le coupe pas au bilan 2023-2026 du Dashboard. Engagé (AE) d'un projet = pour chaque ligne OPE le plus élevé de Consomme_AE
 * (import macro) et du détail FD02 (Depenses_OPE), car l'un des deux peut ne pas être encore importé.
 * Début du financement : Date_debut_Projet, à défaut prolongation_DateCTOInitial, à défaut Instance_ratache_date (formule), à défaut le 1er janvier
 * de la première année du budget.
 */
(function (global) {
  'use strict';

  const L = global.DashboardLogic;
  const DAY_MS = 86400000;
  const HORIZONS = [3, 6, 12];
  const HORIZON_DEFAULT = 6;
  const LAG_HIGH = 0.30; // retard de rythme (points de pourcentage) à partir duquel le risque est élevé
  const LAG_MID = 0.15;
  const ECH_STATUSES = ['en cours', 'En retard'];
  const OPE_STATUSES = ECH_STATUSES.concat(['En attente des dispo des fonds']);
  const REL_STATUS = 'cloturé avec Reliquat à traiter';
  const BUDGET_YEARS = [2023, 2024, 2025, 2026, 2027, 2028, 2029];
  const REASONS = {
    none: 'Aucune ligne OPE', rank: 'sans ligne OPE', nonum: 'N° OPE manquant', unknown: 'N° inconnu de l\'export'
  };
  const REASON_ORDER = ['none', 'rank', 'nonum', 'unknown'];
  const RISK_ORDER = { late: 0, high: 1, mid: 2, ok: 3 };

  const num = value => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
  const fold = value => L.fold(value);
  const statusIs = (value, list) => list.some(item => fold(item) === fold(value));
  const isConfirm = statut => /^supp?ose\s+clotur/.test(fold(statut));

  // --- Dates : tout se compte en jours entiers UTC, AAAA-MM-JJ ---------------------------------------------
  function toIso(value) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const date = value instanceof Date ? value : new Date();
    return date.toISOString().slice(0, 10);
  }
  const dayNumber = iso => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
  const daysBetween = (from, to) => dayNumber(to) - dayNumber(from);
  const horizonDays = months => Math.round(months * 30.4);

  // --- Attribué, engagé, consommé d'un projet -------------------------------------------------------------
  function totalBudget(project) {
    const opes = global.CoreOpes;
    return BUDGET_YEARS.reduce((sum, year) => {
      if (opes) return sum + opes.yearAmount(project.row, year);
      return sum + L.MASSES.reduce((total, mass) => total + num(project.row[`c${year}_${mass}`]), 0);
    }, 0);
  }
  // Engagé (AE) : par ligne OPE, le plus élevé du macro (Consomme_AE) et du détail FD02 ; une ligne n'est comptée qu'une fois.
  function engaged(project) {
    const seen = new Set();
    let total = 0;
    project.opeLines.forEach(line => {
      const id = line.key || `#${seen.size}`;
      if (seen.has(id)) return;
      seen.add(id);
      const detail = line.key ? project.detailByKey.get(line.key) : null;
      total += Math.max(line.AE, detail ? detail.AE : 0);
    });
    return total;
  }
  function startOf(project, budgetFirstYear) {
    const row = project.row;
    const picks = [row.Date_debut_Projet, row.prolongation_DateCTOInitial, row.Instance_ratache_date].map(L.isoDate).filter(Boolean);
    return picks[0] || (budgetFirstYear ? `${budgetFirstYear}-01-01` : '');
  }
  function firstBudgetYear(project) {
    const opes = global.CoreOpes;
    return BUDGET_YEARS.find(year => (opes ? opes.yearAmount(project.row, year) : L.MASSES.reduce((total, mass) => total + num(project.row[`c${year}_${mass}`]), 0)) !== 0) || 0;
  }

  // Tout ce que les trois familles d'alertes lisent d'un projet, calculé une fois.
  function metrics(project, today) {
    const total = totalBudget(project);
    const ae = engaged(project);
    const deadline = L.isoDate(project.row.Date_limite_financement);
    const start = startOf(project, firstBudgetYear(project));
    const days = deadline ? daysBetween(today, deadline) : null;
    const span = deadline && start ? daysBetween(start, deadline) : 0;
    const elapsed = deadline && start ? Math.min(1, Math.max(0, span > 0 ? daysBetween(start, today) / span : (days <= 0 ? 1 : 0))) : null;
    const aePct = total > 0 ? ae / total : 0;
    const lag = elapsed === null ? null : elapsed - aePct;
    // Dernier engagement et engagé des 30 derniers jours, d'après le détail daté (vide tant que Depenses_OPE n'est pas importée).
    const dated = project.expenses.filter(expense => expense.date);
    const lastIso = dated.length ? dated[0].date : '';
    const last30 = dated.filter(expense => daysBetween(expense.date, today) <= 30 && daysBetween(expense.date, today) >= 0).reduce((sum, expense) => sum + expense.AE, 0);
    return {
      total, ae, aePct, cp: project.totalCP, reste: Math.max(0, total - ae), deadline, days, start, elapsed, lag,
      lastIso, sinceLast: lastIso ? daysBetween(lastIso, today) : null, last30: dated.length ? last30 : null
    };
  }
  function riskOf(m) {
    if (m.days === null) return 'ok';
    if (m.days < 0) return 'late';
    if (m.lag === null) return 'ok';
    return m.lag >= LAG_HIGH ? 'high' : (m.lag >= LAG_MID ? 'mid' : 'ok');
  }

  // --- À compléter : l'OPE n'est pas (bien) renseignée ----------------------------------------------------
  // issues : [{ kind: 'none' | 'rank' | 'nonum' | 'unknown', rank, code?, amount }], dans l'ordre de REASON_ORDER.
  function opeIssues(project, knownCodes) {
    const out = [];
    const known = knownCodes instanceof Set ? knownCodes : null;
    project.opes.forEach(ope => {
      if (!ope.ligneIds.length) {
        if (ope.rank === 1) out.push({ kind: 'none', rank: 1, amount: ope.budget });
        else if (ope.budget !== 0) out.push({ kind: 'rank', rank: ope.rank, amount: ope.budget });
        return;
      }
      if (ope.lines.some(line => !line.code)) out.push({ kind: 'nonum', rank: ope.rank, amount: ope.budget });
      if (known) {
        ope.lines.filter(line => line.code && !known.has(line.key)).forEach(line => out.push({ kind: 'unknown', rank: ope.rank, code: line.code, amount: ope.budget }));
      }
    });
    return out.sort((a, b) => REASON_ORDER.indexOf(a.kind) - REASON_ORDER.indexOf(b.kind) || a.rank - b.rank);
  }

  // --- Calcul d'ensemble ---------------------------------------------------------------------------------
  // options : { today: 'AAAA-MM-JJ' | Date, horizon: 3 | 6 | 12 (mois), knownCodes: Set des N° OPE vus dans un envoi validé, normalisés par opeKey, ou null }
  function compute(dataset, options) {
    const opts = options || {};
    const today = toIso(opts.today);
    const horizon = HORIZONS.includes(opts.horizon) ? opts.horizon : HORIZON_DEFAULT;
    const limit = horizonDays(horizon);

    const ope = [], ech = [], rel = [], conf = [];
    let noDate = 0;
    dataset.projects.forEach(project => {
      const status = project.statut;
      const tracked = statusIs(status, ECH_STATUSES);
      const closing = statusIs(status, [REL_STATUS]);
      const confirm = isConfirm(status);
      if (!tracked && !closing && !confirm && !statusIs(status, OPE_STATUSES)) return;
      const m = metrics(project, today);

      if (statusIs(status, OPE_STATUSES) && (m.total > 0 || tracked)) {
        const issues = opeIssues(project, opts.knownCodes);
        if (issues.length) {
          ope.push({
            project, metrics: m, issues, reason: issues[0].kind, reasonLabel: REASONS[issues[0].kind],
            amount: Array.from(new Map(issues.map(issue => [issue.rank, issue.amount])).values()).reduce((sum, value) => sum + value, 0),
            action: String(project.row.Action_Ligne_OPE_a_faire || '').trim()
          });
        }
      }
      if (tracked) {
        if (m.days === null) { noDate += 1; return; }
        const risk = riskOf(m);
        if (risk === 'late' || (m.days <= limit && risk !== 'ok')) ech.push({ project, metrics: m, risk });
      } else if (closing) {
        rel.push({ project, metrics: m, reliquat: m.total - m.cp });
      } else if (confirm) {
        conf.push({ project, metrics: m, reliquat: m.total - m.cp });
      }
    });

    ope.sort((a, b) => b.amount - a.amount || a.project.acronyme.localeCompare(b.project.acronyme, 'fr'));
    ech.sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || a.metrics.days - b.metrics.days);
    rel.sort((a, b) => b.reliquat - a.reliquat);
    conf.sort((a, b) => a.metrics.days - b.metrics.days);

    const upcoming = ech.filter(item => item.metrics.days >= 0).map(item => item.metrics.days);
    return {
      today, horizon, horizons: HORIZONS.slice(),
      ope: { items: ope, amount: ope.reduce((sum, item) => sum + item.amount, 0) },
      ech: { items: ech, reste: ech.reduce((sum, item) => sum + item.metrics.reste, 0), nextDays: upcoming.length ? Math.min.apply(null, upcoming) : null, noDate },
      clo: { rel, conf, reliquat: rel.reduce((sum, item) => sum + item.reliquat, 0) },
      counts: { ope: ope.length, ech: ech.length, clo: rel.length + conf.length, total: ope.length + ech.length }
    };
  }

  // Alerte d'un projet pour la puce de la liste du Dashboard : { tab: 'ope' | 'ech', kind, label } ou null.
  function chipFor(result, projectId) {
    const echItem = result.ech.items.find(item => item.project.id === projectId);
    if (echItem) return { tab: 'ech', kind: echItem.risk, label: echItem.risk === 'late' ? 'échue' : `${echItem.metrics.days} j` };
    const opeItem = result.ope.items.find(item => item.project.id === projectId);
    if (opeItem) return { tab: 'ope', kind: 'ope', label: 'OPE ?' };
    return null;
  }

  global.AlertsLogic = {
    HORIZONS, HORIZON_DEFAULT, LAG_HIGH, LAG_MID, ECH_STATUSES, OPE_STATUSES, REL_STATUS, REASONS,
    compute, chipFor, metrics, riskOf, opeIssues, totalBudget, engaged, toIso, daysBetween
  };
})(window);
