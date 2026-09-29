# tests/vendor

`grist-plugin-api.iife.min.js` est le client que Grist charge dans chaque widget personnalisé
(`https://docs.getgrist.com/grist-plugin-api.js`), compilé depuis les sources de
[gristlabs/grist-core](https://github.com/gristlabs/grist-core) (`app/plugin/grist-plugin-api.ts`, commit figé dans
`build-grist-plugin-api.sh`) avec `grain-rpc`, la bibliothèque de protocole utilisée des deux côtés par Grist.

Les tests du pont Grist -> widget imbriqué (`js/core/grist-bridge.js`) chargent ce client réel dans une iframe
(`tests/fake-publipostage.html`) : on vérifie ainsi le vrai protocole, pas une imitation écrite à la main. Ce
fichier ne fait pas partie du widget livré : il ne sert que pour `node tests/run-headless.js`.

- **Reconstruire / mettre à jour** : `bash tests/vendor/build-grist-plugin-api.sh` (réseau requis), puis relancer
  les tests.
- **Licences** : grist-core, grain-rpc, ts-interface-checker, mousetrap : Apache-2.0 ; lodash, events : MIT (les
  mentions de licence sont conservées en fin de fichier).
