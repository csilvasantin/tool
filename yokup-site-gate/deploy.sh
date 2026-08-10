#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

git fetch -q origin main
HEAD_SHA="$(git rev-parse HEAD)"
MAIN_SHA="$(git rev-parse origin/main)"
if [ "$HEAD_SHA" != "$MAIN_SHA" ]; then
  echo "Deploy bloqueado: el guardián debe salir exactamente de origin/main."
  echo "  HEAD:        $HEAD_SHA"
  echo "  origin/main: $MAIN_SHA"
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "Deploy bloqueado: el árbol contiene cambios sin registrar."
  exit 1
fi

echo "→ Pruebas del guardián…"
node --test ./*.test.mjs

echo "→ Sello y assets canónicos…"
if [ -n "${YOKUP_RELEASE_JSON:-}" ] && [ -n "${YOKUP_ASSET_SOURCE:-}" ]; then
  RELEASE_JSON="$YOKUP_RELEASE_JSON"
  ASSET_SOURCE="$YOKUP_ASSET_SOURCE"
  [ -d "$ASSET_SOURCE" ] || { echo "Artefacto Pages ausente: $ASSET_SOURCE"; exit 1; }
  [ -f "$ASSET_SOURCE/version.json" ] || { echo "El artefacto Pages no contiene version.json"; exit 1; }
  printf '%s' "$RELEASE_JSON" | jq -e --slurpfile artifact "$ASSET_SOURCE/version.json" '. == $artifact[0]' >/dev/null || {
    echo "El sello entregado no coincide con el artefacto Pages"; exit 1;
  }
else
  RELEASE_JSON="$(curl -fsS --max-time 15 https://yokup.pages.dev/version.json)"
  ASSET_SOURCE="$(cd ../yokup-site && pwd)"
fi
export RELEASE_JSON
node --input-type=module - <<'NODE'
import { signedVersionFromPayload } from "../yokup-site/deploy-history.js";
import { execFileSync } from "node:child_process";
const release = JSON.parse(process.env.RELEASE_JSON);
if (!signedVersionFromPayload(release)) throw new Error("Pages no expone un sello firmado y limpio");
execFileSync("git", ["merge-base", "--is-ancestor", release.gitFull, "HEAD"]);
execFileSync("git", ["diff", "--quiet", release.gitFull, "HEAD", "--", "yokup-site"]);
NODE
STAGING="$(mktemp -d "${TMPDIR:-/tmp}/yokup-site-assets.XXXXXX")"
CONFIG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/yokup-site-config.XXXXXX")"
trap 'rm -rf -- "$STAGING" "$CONFIG_DIR"' EXIT
YOKUP_ASSET_SOURCE="$ASSET_SOURCE" node build-assets.mjs "$STAGING"
RELEASE_COMPACT="$(printf '%s' "$RELEASE_JSON" | jq -c .)"
export STAGING CONFIG_DIR
node --input-type=module - <<'NODE'
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
let config = await readFile("wrangler.toml", "utf8");
config = config.replace(/^main\s*=.*$/m, `main = ${JSON.stringify(resolve("src/index.js"))}`);
config += `\n[assets]\ndirectory = ${JSON.stringify(process.env.STAGING)}\nbinding = "ASSETS"\nrun_worker_first = true\nhtml_handling = "none"\nnot_found_handling = "none"\n`;
await writeFile(resolve(process.env.CONFIG_DIR, "wrangler.toml"), config);
NODE
CONFIG_FILE="$CONFIG_DIR/wrangler.toml"

echo "→ Publicación independiente con assets propios…"
npx "wrangler@${WRANGLER_VERSION:-4.119.0}" deploy --config "$CONFIG_FILE" --var "RELEASE_JSON:$RELEASE_COMPACT"

echo "→ Verificación pública…"
for intento in $(seq 1 20); do
  if curl -fsS --max-time 10 https://www.yokup.com/__yokup-gate | jq -e '.ok == true and .mode == "worker-assets"' >/dev/null; then
    curl -fsS --max-time 10 https://www.yokup.com/__yokup-gate | jq .
    echo "✓ guardián de Yokup publicado y operativo"
    exit 0
  fi
  sleep 2
done
echo "Publicación no confirmada: /__yokup-gate no responde con el contrato esperado"
exit 1
