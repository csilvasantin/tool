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

echo "→ Publicación independiente…"
npx "wrangler@${WRANGLER_VERSION:-4.119.0}" deploy

echo "→ Verificación pública…"
for intento in $(seq 1 20); do
  if curl -fsS --max-time 10 https://www.yokup.com/__yokup-gate | jq -e '.ok == true and (.mode == "primary" or .mode == "fallback")' >/dev/null; then
    curl -fsS --max-time 10 https://www.yokup.com/__yokup-gate | jq .
    echo "✓ guardián de Yokup publicado y operativo"
    exit 0
  fi
  sleep 2
done
echo "Publicación no confirmada: /__yokup-gate no responde con el contrato esperado"
exit 1
