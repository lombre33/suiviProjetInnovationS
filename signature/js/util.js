/**
 * Outils communs de l'outil de signature : erreurs typées, dates, montants, pièces jointes Grist,
 * reconnaissance des fichiers. Aucune dépendance, rien ne touche au DOM ni au réseau.
 */
(function (global) {
  'use strict';

  // Erreur dont `code` dit la cause (l'interface en tire un message précis) ; `message` reste lisible dans la console.
  class SigError extends Error {
    constructor(code, message, extra) {
      super(message || code);
      this.name = 'SigError';
      this.code = code;
      if (extra) Object.assign(this, extra);
    }
  }

  // Texte réduit à ses lettres et chiffres, en minuscules et sans accents : la forme comparée pour
  // retrouver le repère de la signature dans un PDF, quelle que soit la ponctuation, la casse ou la
  // façon dont le texte est découpé en morceaux.
  function normalizeText(value) {
    return String(value == null ? '' : value)
      .normalize('NFD').replace(/\p{M}/gu, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  // Date Grist (secondes depuis 1970 pour les colonnes Date et DateTime), millisecondes, texte ISO ou Date.
  function toDate(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return null;
      return new Date(Math.abs(value) < 1e11 ? value * 1000 : value);
    }
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? null : new Date(parsed);
    }
    return null;
  }

  // « jj/mm/aaaa », ou « jj/mm/aaaa à hh:mm » avec `time`. Une colonne Date est à minuit UTC : `utc` évite de reculer d'un jour.
  function formatDate(value, { time = false, utc = false } = {}) {
    const date = toDate(value);
    if (!date) return '';
    const zone = utc ? { timeZone: 'UTC' } : {};
    const day = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', ...zone }).format(date);
    if (!time) return day;
    const hour = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', ...zone }).format(date);
    return `${day} à ${hour}`;
  }

  function formatMoney(value) {
    const number = typeof value === 'number' ? value : Number(String(value == null ? '' : value).replace(/\s/g, '').replace(',', '.'));
    if (value == null || value === '' || !Number.isFinite(number)) return '';
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(number).replace(/\s/g, ' ');
  }

  // Numéros des pièces jointes d'une cellule : ['L', 3, 4], [3, 4], 3 ou vide.
  function attachmentIds(value) {
    const list = Array.isArray(value) ? (value[0] === 'L' ? value.slice(1) : value) : (value == null || value === '' ? [] : [value]);
    return list.map(Number).filter(id => Number.isInteger(id) && id > 0);
  }

  const encodeAttachments = ids => ['L', ...ids];

  // Colonne booléenne Grist : vrai pour true, 1, "true"… jamais pour du texte quelconque.
  const toBool = value => value === true || value === 1 || value === 'true' || value === 'True';

  // Type d'une image d'après ses premiers octets (jamais d'après son nom ni son type annoncé).
  function sniffImage(bytes) {
    if (!bytes || bytes.length < 8) return null;
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
    return null;
  }

  function isPdf(bytes) {
    if (!bytes || bytes.length < 8) return false;
    // Certains PDF ont quelques octets avant « %PDF- » : la norme en tolère 1024.
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
    return head.includes('%PDF-');
  }

  // « Notification_AERIS.pdf » -> « Notification_AERIS_signe.pdf » ; nom sans caractère de chemin.
  function signedName(name) {
    const clean = String(name || 'notification').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
    const base = clean.replace(/\.pdf$/i, '').replace(/_signe$/i, '');
    return `${base}_signe.pdf`;
  }

  // Lignes d'une table Grist renvoyée par fetchTable (colonnes en tableaux) ; [] si la table est vide ou absente.
  function tableRows(table) {
    if (!table || !Array.isArray(table.id)) return [];
    const columns = Object.keys(table).filter(key => key !== 'id');
    return table.id.map((id, index) => {
      const row = { id };
      columns.forEach(column => { row[column] = table[column] ? table[column][index] : undefined; });
      return row;
    });
  }

  global.SigError = SigError;
  global.SigUtil = {
    SigError, normalizeText, toDate, formatDate, formatMoney, attachmentIds, encodeAttachments,
    toBool, sniffImage, isPdf, signedName, tableRows,
  };
})(window);
