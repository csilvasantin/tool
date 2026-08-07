#!/usr/bin/env bash
# Publica el worker yokup-rtc. Antes se hacia `npx wrangler deploy` a pelo, sin
# comprobar nada: el worker se podia publicar desde cualquier rama y nadie se
# enteraba, igual que le paso al SITIO el 5-ago-2026.
# Uso: ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

# La guarda vivía en ~/Claude/admira-vault/guarda-rama.sh, que NO existe en las
# máquinas de la flota: `source` de un fichero ausente tumbaba el script entero con
# set -e, así que este deploy llevaba tiempo sin poder ejecutarse. Ahora la guarda
# vive AQUÍ: el despliegue de un repo no puede depender de un fichero suelto fuera
# del repo. Mismo criterio y misma vía de escape que yokup-site/deploy.mjs.
echo "→ Rama…"
rama="$(git rev-parse --abbrev-ref HEAD)"
git fetch -q origin main 2>/dev/null || true
if [ "$rama" != "main" ] && [ "${YOKUP_DEPLOY_FORCE:-}" != "1" ]; then
  adelante="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo '?')"
  detras="$(git rev-list --count HEAD..origin/main 2>/dev/null || echo '?')"
  echo "Deploy bloqueado: produccion es main y esto no es main."
  echo "  estas en   : $rama ($(git rev-parse --short HEAD))"
  echo "  origin/main: $(git rev-parse --short origin/main 2>/dev/null || echo '?')"
  echo "  tienes $adelante commit(s) que main no tiene y te faltan $detras que main si tiene."
  echo "  Funde tu rama en main y publica desde ahi. Si de verdad quieres publicar"
  echo "  este arbol tal cual, hazlo consciente: YOKUP_DEPLOY_FORCE=1."
  exit 1
fi

# El detector anterior buscaba «failing tests:» en la salida, que sólo imprime
# `node --test`; corriendo `node "$t"` a pelo, un fichero en rojo pasaba por verde.
# El código de salida sí lo dice siempre.
echo "→ Pruebas…"
fallos=0
for t in *.test.mjs test/*.test.mjs; do
  [ -f "$t" ] || continue
  if ! node "$t" >/tmp/yrtc-test.txt 2>&1; then echo "  ✖ $t"; fallos=$((fallos+1)); fi
done
[ "$fallos" -eq 0 ] || echo "  ⚠ $fallos fichero(s) de prueba en rojo — revisa antes de fiarte del despliegue"

echo "→ Cloudflare Workers…"
npx wrangler deploy
echo "✓ yokup-rtc publicado · api.yokup.com"
