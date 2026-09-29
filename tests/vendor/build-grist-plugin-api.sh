#!/usr/bin/env bash
# Reconstruit tests/vendor/grist-plugin-api.iife.min.js : le client "grist-plugin-api" que Grist sert aux widgets
# (https://docs.getgrist.com/grist-plugin-api.js), compilé depuis les sources de grist-core à un commit figé.
# Les tests du pont Grist -> widget imbriqué (js/core/grist-bridge.js) chargent CE client réel dans une iframe : ils
# vérifient ainsi le vrai protocole (grain-rpc), pas une imitation écrite à la main.
#
# Usage : bash tests/vendor/build-grist-plugin-api.sh   (réseau requis : GitHub + registre npm)
# Pour changer de version : modifier GRIST_CORE_COMMIT, relancer, relire le diff, relancer node tests/run-headless.js.
set -euo pipefail

GRIST_CORE_COMMIT=2c46edd39c7bbf6c59cef0cd48a0ab92e2500a9c   # gristlabs/grist-core, 2026-09-29
GRAIN_RPC_VERSION=0.1.7                                       # même version que celle qu'utilise grist-core
OUT="$(cd "$(dirname "$0")" && pwd)/grist-plugin-api.iife.min.js"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$WORK"
git clone --quiet --filter=blob:none --no-checkout --sparse https://github.com/gristlabs/grist-core.git core
git -C core sparse-checkout set app/plugin
git -C core checkout --quiet "$GRIST_CORE_COMMIT"

mkdir build && cd build
npm init -y >/dev/null
npm install --no-audit --no-fund esbuild "grain-rpc@$GRAIN_RPC_VERSION" lodash ts-interface-checker mousetrap events >/dev/null
echo '{ "compilerOptions": { "baseUrl": "../core" } }' > tsconfig.json   # les sources importent "app/plugin/..."

# window.grist = les exports du module, comme le fichier servi par Grist.
NODE_PATH="$PWD/node_modules" npx esbuild ../core/app/plugin/grist-plugin-api.ts \
  --tsconfig=tsconfig.json --bundle --format=iife --global-name=grist --platform=browser --target=es2019 --minify --legal-comments=eof \
  --banner:js="/*! grist-plugin-api : client des widgets Grist, compilé depuis gristlabs/grist-core@${GRIST_CORE_COMMIT:0:7} (app/plugin/grist-plugin-api.ts) avec grain-rpc ${GRAIN_RPC_VERSION}. Apache-2.0 (grist-core, grain-rpc, ts-interface-checker, mousetrap), MIT (lodash, events). Ne pas modifier à la main : bash tests/vendor/build-grist-plugin-api.sh */" \
  --outfile="$OUT"

echo "OK : $OUT ($(wc -c < "$OUT") octets)"
