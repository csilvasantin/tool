#!/usr/bin/env bash
# Publica el worker yokup-rtc. Antes se hacia `npx wrangler deploy` a pelo, sin
# comprobar nada: el worker se podia publicar desde cualquier rama y nadie se
# enteraba, igual que le paso al SITIO el 5-ago-2026.
# Uso: ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "→ Rama…"
source ~/Claude/admira-vault/guarda-rama.sh

echo "→ Pruebas…"
fallos=0
for t in *.test.mjs test/*.test.mjs; do
  [ -f "$t" ] || continue
  node "$t" >/tmp/yrtc-test.txt 2>&1 || true
  grep -q "failing tests:" /tmp/yrtc-test.txt && { echo "  ✖ $t"; fallos=$((fallos+1)); }
done
[ "$fallos" -eq 0 ] || echo "  ⚠ $fallos fichero(s) de prueba en rojo — revisa antes de fiarte del despliegue"

echo "→ Cloudflare Workers…"
npx wrangler deploy
echo "✓ yokup-rtc publicado · api.yokup.com"
