/**
 * Démarrage de la page : branche l'API des widgets Grist sur l'application. Dernier script chargé.
 * (Les tests chargent les mêmes fichiers sans celui-ci et construisent l'application avec un faux Grist.)
 */
(function (global) {
  'use strict';

  const root = global.document.getElementById('sig-root');
  if (!global.grist || !global.grist.docApi) {
    const note = global.document.createElement('p');
    note.className = 'boot-note';
    note.textContent = 'Cette page est un widget Grist : ajoutez-la à un document Grist (widget personnalisé, accès complet au document) pour l’utiliser.';
    root.append(note);
    return;
  }
  const io = global.SigIO.create({ grist: global.grist });
  const signer = global.SigSigner.create({ io });
  global.SigApp.create({ grist: global.grist, root, io, signer }).start();
})(window);
