/**
 * Signer ou retirer la signature d'une notification : enchaîne lecture de la signature (protégée),
 * lecture du PDF d'origine, incrustation, envoi du PDF signé et mise à jour de la ligne.
 * Le PDF d'origine n'est jamais modifié : on signe toujours à partir de lui, jamais d'une copie
 * déjà signée, et le PDF signé est un nouveau fichier.
 */
(function (global) {
  'use strict';

  const { SigError, signedName } = global.SigUtil;

  // io : SigIO.create(...) ; pdf : SigPdf ; now : horloge (injectable pour les tests).
  function create({ io, pdf = global.SigPdf, now = () => new Date() }) {
    // `row` : { id, acronyme, signee, notifIds } ; `cols` : identifiants des colonnes de la table (réponse du mappage).
    async function signRow(row, cols) {
      if (row.signee) throw new SigError('already-signed', 'Déjà signée');
      const source = row.notifIds[0];
      if (!source) throw new SigError('no-pdf', 'Aucun PDF à signer');
      // La signature d'abord : sans protection en place, rien d'autre n'est lu ni envoyé.
      const signature = await io.loadSignature();
      if (!signature.bytes) throw new SigError('no-signature', 'Aucune signature enregistrée');
      const tableId = await io.mainTableId();
      const pdfBytes = await io.download(source, { tableId, colId: cols.PDF_notification, rowId: row.id });
      const when = now();
      const signed = await pdf.sign({ pdfBytes, imageBytes: signature.bytes, anchorText: signature.anchor, when });
      const attachmentId = await io.upload(signed, signedName(`Notification_${row.acronyme || row.id}`), 'application/pdf');
      const fields = { [cols.Signee]: true, [cols.PDF_signe]: ['L', attachmentId] };
      if (cols.Signee_le) fields[cols.Signee_le] = Math.floor(when.getTime() / 1000);
      await io.updateRow(row.id, fields);
      return { attachmentId, when };
    }

    // Retire la signature : la ligne redevient « à signer », le PDF d'origine reste en place.
    async function unsignRow(row, cols) {
      const fields = { [cols.Signee]: false, [cols.PDF_signe]: ['L'] };
      if (cols.Signee_le) fields[cols.Signee_le] = null;
      await io.updateRow(row.id, fields);
    }

    return { signRow, unsignRow };
  }

  global.SigSigner = { create };
})(window);
