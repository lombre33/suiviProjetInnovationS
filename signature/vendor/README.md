# Bibliothèques embarquées de l'outil de signature

Aucune bibliothèque n'est chargée depuis un autre site : la page `signature/` (qui manipule l'image de la
signature du Vice-Président) ne contacte que le document Grist. Les fichiers ci-dessous sont copiés tels quels,
sans modification, depuis les paquets npm indiqués, et leur empreinte est contrôlée par un test
(`tests/suite-signature.js`, « bibliothèques : embarquées dans le dépôt… ») : modifier un fichier sans mettre à
jour ce document fait échouer la suite.

| Fichier | Paquet npm (version) | Licence | Rôle | SHA-256 |
|---|---|---|---|---|
| `pdf-lib/pdf-lib.min.js` | `pdf-lib@1.17.1`, `dist/pdf-lib.min.js` | MIT (`pdf-lib/LICENSE.md`) | incruster l'image et la date dans le PDF | `0f9a5cad07941f0826586c94e089d89b918c46e5c17cf2d5a3c6f666e3bc694f` |
| `pdfjs/pdf.min.mjs` | `pdfjs-dist@4.10.38`, `legacy/build/pdf.min.mjs` | Apache-2.0 (`pdfjs/LICENSE`) | lire le texte du PDF (repère) et dessiner les pages | `44ec6f011027ee77791386b66c14876a5fc29e20bf0433c07c6726fff7212b72` |
| `pdfjs/pdf.worker.min.mjs` | `pdfjs-dist@4.10.38`, `legacy/build/pdf.worker.min.mjs` | Apache-2.0 | analyse du PDF (dans un worker) | `bd88805178a26c729db8c0107a5b630cb900ec070f4d8c7529a3e45530afd41d` |

La variante `legacy` de pdf.js est choisie pour tourner sur des navigateurs un peu anciens (postes de
l'administration). pdf.js 4.10.38 est postérieure au correctif de la faille d'exécution de code par police
(CVE-2024-4367, corrigée en 4.2.67) ; la page ouvre en plus les PDF avec `isEvalSupported: false`.

## Reproduire ou mettre à jour

```sh
npm pack pdfjs-dist@4.10.38 pdf-lib@1.17.1
tar -xzf pdfjs-dist-4.10.38.tgz && tar -xzf pdf-lib-1.17.1.tgz   # chacun dans un dossier vide
sha256sum package/legacy/build/pdf.min.mjs package/legacy/build/pdf.worker.min.mjs package/dist/pdf-lib.min.js
```

Pour changer de version : remplacer les fichiers, mettre à jour ce tableau (version et empreintes), relancer
`node tests/run-headless.js`. Les polices standard et les tables de caractères de pdf.js ne sont pas
embarquées : un PDF qui n'embarque pas ses polices s'affiche avec une police de remplacement du navigateur, le
repère de texte se lit quand même.
