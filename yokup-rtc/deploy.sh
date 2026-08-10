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
# del repo. En producción no hay escape: main remoto exacto, limpio y verificable.
echo "→ Rama…"
rama="$(git rev-parse --abbrev-ref HEAD)"
git fetch -q origin main
if [ "$rama" != "main" ]; then
  adelante="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo '?')"
  detras="$(git rev-list --count HEAD..origin/main 2>/dev/null || echo '?')"
  echo "Deploy bloqueado: produccion es main y esto no es main."
  echo "  estas en   : $rama ($(git rev-parse --short HEAD))"
  echo "  origin/main: $(git rev-parse --short origin/main 2>/dev/null || echo '?')"
  echo "  tienes $adelante commit(s) que main no tiene y te faltan $detras que main si tiene."
  echo "  Funde tu rama en main y publica desde ahi."
  exit 1
fi
HEAD_COMMIT="$(git rev-parse HEAD)"
MAIN_COMMIT="$(git rev-parse origin/main)"
if [ "$HEAD_COMMIT" != "$MAIN_COMMIT" ]; then
  echo "Deploy bloqueado: main local no coincide con origin/main."
  echo "  HEAD       : ${HEAD_COMMIT:0:12}"
  echo "  origin/main: ${MAIN_COMMIT:0:12}"
  echo "  Actualiza el checkout canónico antes de publicar."
  exit 1
fi
if [ -n "$(git status --porcelain --untracked-files=all)" ]; then
  echo "Deploy bloqueado: el worktree tiene cambios sin commit."
  git status --short
  exit 1
fi
echo "  ✓ $(git rev-parse --show-toplevel) · main exacto y limpio"

echo "→ Rutas canónicas…"
node scripts/assert-canonical-routes.mjs src/index.js

# El detector anterior buscaba «failing tests:» en la salida, que sólo imprime
# `node --test`; corriendo `node "$t"` a pelo, un fichero en rojo pasaba por verde.
# El código de salida sí lo dice siempre.
# TOPE DE CUATRO PUBLICACIONES POR HORA (Carlos, 2026-08-10).
# La noche del 9 al 10 se sellaron cinco releases de madrugada que nadie pidió:
# el bucle OnIdle proponía mejoras, los agentes las publicaban, y por la mañana
# el sitio había cambiado solo y el aviso de «versión nueva» repicaba sin parar.
# Se cuenta contra el historial de git —publican varias máquinas— y se puede
# saltar declarando el motivo, nunca en silencio. Ver scripts/ritmo-publicacion.mjs.
echo "→ Ritmo de publicación…"
node ../scripts/ritmo-publicacion.mjs --proyecto yokup-rtc || exit 1

echo "→ Pruebas…"
fallos=0
for t in *.test.mjs test/*.test.mjs; do
  [ -f "$t" ] || continue
  if ! node "$t" >/tmp/yrtc-test.txt 2>&1; then echo "  ✖ $t"; fallos=$((fallos+1)); fi
done
[ "$fallos" -eq 0 ] || echo "  ⚠ $fallos fichero(s) de prueba en rojo — revisa antes de fiarte del despliegue"

# EL SELLO, ANTES DE PUBLICAR (Morfeo, 2026-08-09). Un worker no tiene portada donde
# poner el <meta>, y por eso salía como «sin portada» en el Webmaster. Sí puede
# servirlo: se escribe aquí, se empaqueta con el código y se sirve en /version.json.
# Se genera, no se teclea, y se firma con quien publica — norma 08: no se firma por
# otro ni se hereda la firma anterior.
echo "→ Sello y firma…"
: "${ADMIRA_RELEASE_AGENT:?Define ADMIRA_RELEASE_AGENT (ej. MorfeoMBA16)}"
: "${ADMIRA_RELEASE_MACHINE:?Define ADMIRA_RELEASE_MACHINE (ej. MacBookAir16plata)}"
HOY="$(date +%d.%m.%Y)"; AHORA="$(date +%H:%M)"
PREVIA="$(curl -fsS --max-time 10 https://api.yokup.com/version.json 2>/dev/null | jq -r '.version // empty' || true)"
case "$PREVIA" in
  v.$HOY.r*) R=$(( $(printf '%s' "${PREVIA#v.$HOY.r}" | cut -d. -f1) + 1 ));;
  *) R=1;;
esac
SELLO="v.${HOY}.r${R}.${AHORA}"
GIT="$(git rev-parse HEAD)"
SUCIO=true; [ -z "$(git status --porcelain)" ] && SUCIO=false
{
  echo "// Generado por deploy.sh en cada publicación. No editar a mano."
  echo "export const SELLO_WORKER = $(jq -n --arg v "$SELLO" --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      --arg a "$ADMIRA_RELEASE_AGENT" --arg m "$ADMIRA_RELEASE_MACHINE" \
      --arg g "$GIT" --arg gs "${GIT:0:7}" --argjson d "$SUCIO" \
      '{version:$v,deployedAt:$t,deployer:$a,machine:$m,signature:($a+" · "+$m),git:$g,gitShort:$gs,gitFull:$g,dirty:$d}');"
} > src/version-stamp.js
echo "  ✓ $SELLO · $ADMIRA_RELEASE_AGENT · $ADMIRA_RELEASE_MACHINE"

echo "→ Cloudflare Workers…"
# `npx wrangler` a secas resuelve la ÚLTIMA versión publicada, así que el
# despliegue de producción depende de lo que npm publique esa mañana: el 07-08-2026
# la 4.120.0 devolvía 404 en el registro y no se podía desplegar nada. Se fija una
# versión probada; subirla es un cambio consciente (WRANGLER_VERSION=x.y.z ./deploy.sh).
WRANGLER="wrangler@${WRANGLER_VERSION:-4.119.0}"
DRYRUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/yokup-rtc-dryrun.XXXXXX")"
trap 'rm -rf -- "$DRYRUN_DIR"' EXIT
npx "$WRANGLER" deploy --dry-run --outdir "$DRYRUN_DIR"
node scripts/assert-canonical-routes.mjs "$DRYRUN_DIR/index.js"
npx "$WRANGLER" deploy
echo "✓ yokup-rtc publicado · api.yokup.com"
