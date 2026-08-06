#!/usr/bin/env bash
# Cliente común de evidencia para Desktop, CLI y subagentes.
#   heartbeat <misión>
#   progress  <misión> [--image <png|jpg> --final-fallback]
#   final     <misión> --report <texto> [--image <png|jpg>]
# heartbeat/progress capturan siempre la superficie real: pane tmux para CLI o
# AgoraCapture con la petición visible para Desktop. Una imagen manual nunca se
# acepta como process; --image sigue disponible para la prueba final.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API="${YOKUP_API:-https://yokup-rtc.csilvasantin.workers.dev}"
MODE="${1:?uso: mission-evidence.sh heartbeat|progress|final <misión> ...}"
MISSION="${2:?falta misión}"; shift 2
IMAGE=""; PROCESS_IMAGE=""; CAPTURED_AT=""; PROCESS_CAPTURED_AT=""; REPORT=""; FALLBACK=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --image) IMAGE="${2:-}"; shift 2 ;;
    --process-image) PROCESS_IMAGE="${2:-}"; shift 2 ;;
    --captured-at) CAPTURED_AT="${2:-}"; shift 2 ;;
    --process-captured-at) PROCESS_CAPTURED_AT="${2:-}"; shift 2 ;;
    --report) REPORT="${2:-}"; shift 2 ;;
    --final-fallback) FALLBACK=true; shift ;;
    *) echo "opción desconocida: $1" >&2; exit 2 ;;
  esac
done

case "$MODE" in
  heartbeat|progress) export YOKUP_ROLE="${YOKUP_ROLE:-sub}" ;;
  final) export YOKUP_ROLE="${YOKUP_ROLE:-infra}" ;;
  *) echo "modo inválido: $MODE" >&2; exit 2 ;;
esac
read -r PERSONA HOST OWNER RUNTIME <<<"$(bash "$HERE/quien-ejecuta.sh")"

case "$HOST" in
  cli) CAPTURE_SURFACE="cli"; CAPTURE_CONTEXT="command_output" ;;
  app) CAPTURE_SURFACE="desktop"; CAPTURE_CONTEXT="request" ;;
  *) echo "superficie de ejecución no válida para evidencia: $HOST" >&2; exit 2 ;;
esac

# La procedencia de process no puede confiarse a una declaración del llamador.
# Se obtiene aquí de la superficie capturada. Sólo final-fallback (degradado y no
# presentado como Proceso) conserva una imagen manual por compatibilidad.
if [ -n "$PROCESS_IMAGE" ] || [ -n "$PROCESS_CAPTURED_AT" ]; then
  echo "--process-image/--process-captured-at no se aceptan: process se captura automáticamente desde su superficie" >&2
  exit 2
fi
if [ "$MODE" = "heartbeat" ] && { [ -n "$IMAGE" ] || [ -n "$CAPTURED_AT" ] || [ "$FALLBACK" = true ]; }; then
  echo "heartbeat no acepta evidencia manual" >&2; exit 2
fi
if [ "$MODE" = "progress" ] && [ -n "$IMAGE" ] && [ "$FALLBACK" = false ]; then
  echo "--image manual no puede declararse como process; usa captura automática o --final-fallback" >&2; exit 2
fi
if [ "$MODE" = "progress" ] && [ "$FALLBACK" = false ] && [ -n "$CAPTURED_AT" ]; then
  echo "--captured-at no se acepta para process automático; se usa la hora real del capturador" >&2; exit 2
fi
if [ "$MODE" = "progress" ] && [ "$FALLBACK" = true ] && [ -z "$IMAGE" ]; then
  echo "--final-fallback exige --image" >&2; exit 2
fi

TMP_WORK="$(mktemp -d "${TMPDIR:-/tmp}/yokup-evidence.XXXXXX")"
trap 'rm -rf "$TMP_WORK"' EXIT

validate_image_file() {
  local file="$1" bytes mime
  [ -f "$file" ] && [ -s "$file" ] || return 1
  bytes="$(wc -c < "$file" | tr -d ' ')"
  [ "$bytes" -gt 1000 ] || { echo "captura demasiado pequeña para acreditar la superficie" >&2; return 1; }
  mime="$(file -b --mime-type "$file" 2>/dev/null || true)"
  case "$mime" in image/png|image/jpeg|image/webp) return 0;; esac
  echo "el capturador no devolvió una imagen válida ($mime)" >&2; return 1
}

capture_cli_image() {
  local out="$TMP_WORK/process-cli.png" target="${TMUX_CAPTURE_TARGET:-}" nonempty
  command -v tmux >/dev/null 2>&1 || { echo "CLI exige tmux para capturar comando y salida" >&2; return 1; }
  if [ -z "$target" ] && [ -n "${TMUX:-}" ]; then
    target="$(tmux display-message -p '#{session_name}:#{window_index}.#{pane_index}' 2>/dev/null || true)"
  fi
  [ -n "$target" ] || { echo "CLI exige TMUX_CAPTURE_TARGET o un pane tmux actual" >&2; return 1; }
  tmux capture-pane -p -S -80 -t "$target" > "$TMP_WORK/pane.txt" || {
    echo "no se pudo leer el pane tmux $target" >&2; return 1;
  }
  nonempty="$(awk 'NF{n++} END{print n+0}' "$TMP_WORK/pane.txt")"
  [ "$nonempty" -ge 2 ] || { echo "el pane no muestra comando y salida suficientes" >&2; return 1; }
    python3 - "$TMP_WORK/pane.txt" "$out" <<'PY'
import os,sys
from PIL import Image,ImageDraw,ImageFont
lines=open(sys.argv[1],encoding="utf-8",errors="replace").read().replace("\t","    ").splitlines()[-34:]
img=Image.new("RGB",(900,20*max(1,len(lines))+24),(2,8,13)); draw=ImageDraw.Draw(img)
font_path=next((p for p in ("/System/Library/Fonts/Menlo.ttc","/System/Library/Fonts/Monaco.ttf") if os.path.exists(p)),None)
font=ImageFont.truetype(font_path,14) if font_path else ImageFont.load_default()
for index,line in enumerate(lines): draw.text((12,12+20*index),line[:150],fill=(200,240,255),font=font)
img.save(sys.argv[2],"PNG")
PY
  validate_image_file "$out" && printf '%s\n' "$out"
}

capture_desktop_image() {
  local out="$TMP_WORK/process-desktop.png" nonce current="" payload fleet_dir front expected
  [ "$(uname -s)" = "Darwin" ] || { echo "Desktop requiere AgoraCapture en macOS" >&2; return 1; }
  command -v osascript >/dev/null 2>&1 || { echo "no se puede verificar la app Desktop visible" >&2; return 1; }
  front="$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true' 2>/dev/null || true)"
  case "$RUNTIME" in
    Codex) expected="Codex" ;;
    Claude) expected="Claude" ;;
    Grok) expected="Grok" ;;
    *) echo "runtime Desktop sin aplicación verificable: $RUNTIME" >&2; return 1 ;;
  esac
  printf '%s' "$front" | grep -Fqi "$expected" || {
    echo "la petición no está visible en $expected Desktop (app frontal: ${front:-desconocida})" >&2; return 1;
  }
  [ -d "${AGORA_CAPTURE_APP:-${HOME}/Applications/AgoraCapture.app}" ] || {
    echo "AgoraCapture no está instalado; no se puede acreditar Desktop/request" >&2; return 1;
  }
  fleet_dir="${FLEET_CAPTURE_DIR:-${HOME}/.fleet}"
  [ -d "$fleet_dir" ] || return 1
  nonce="yokup-${MISSION}-$(date +%s)-$$"
  printf '%s\n' "$nonce" > "$fleet_dir/capture.req"
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    current="$(sed -n '1p' "$fleet_dir/capture.out" 2>/dev/null || true)"
    [ "$current" = "$nonce" ] && break
    sleep 0.25
  done
  [ "${current:-}" = "$nonce" ] || return 1
  payload="$(sed -n '2p' "$fleet_dir/capture.out" 2>/dev/null || true)"
  [ -n "$payload" ] && [ "$payload" != "ERR_NO_CAPTURE" ] || return 1
  printf '%s' "$payload" | python3 -c 'import base64,sys; sys.stdout.buffer.write(base64.b64decode(sys.stdin.buffer.read()))' > "$out"
  validate_image_file "$out" && printf '%s\n' "$out"
}

capture_process_image() {
  case "$CAPTURE_SURFACE/$CAPTURE_CONTEXT" in
    cli/command_output) capture_cli_image ;;
    desktop/request) capture_desktop_image ;;
    *) echo "pareja de procedencia inválida: $CAPTURE_SURFACE/$CAPTURE_CONTEXT" >&2; return 1 ;;
  esac
}

upload_image() {
  local file="$1" type response
  [ -f "$file" ] && [ -s "$file" ] || { echo "imagen inexistente o vacía: $file" >&2; return 1; }
  case "$file" in *.jpg|*.jpeg) type="image/jpeg";; *.webp) type="image/webp";; *) type="image/png";; esac
  response="$(curl -fsS -m 60 -X POST "$API/fleet/media" -H "Content-Type: $type" --data-binary "@$file")"
  printf '%s' "$response" | python3 -c 'import json,sys; print((json.load(sys.stdin).get("url") or "").strip())'
}

# La hora pertenece a la captura, no a su subida. Para un fichero aportado se usa
# su mtime (o el epoch-ms del fallback degradado); para la captura automática, el
# mtime acaba de nacer. Así un pantallazo histórico nunca rejuvenece al adjuntarlo.
capture_time() {
  local file="$1" explicit="${2:-}" seconds
  if [ -n "$explicit" ]; then
    case "$explicit" in *[!0-9]*|'') echo "captured_at debe ser epoch ms" >&2; return 1;; esac
    printf '%s\n' "$explicit"
    return 0
  fi
  seconds="$(stat -f '%m' "$file" 2>/dev/null || stat -c '%Y' "$file" 2>/dev/null || true)"
  case "$seconds" in *[!0-9]*|'') echo "no se pudo leer la hora de captura: $file" >&2; return 1;; esac
  printf '%s000\n' "$seconds"
}

validate_process_time() {
  local captured="$1" now
  now="$(( $(date +%s) * 1000 ))"
  if [ "$captured" -gt "$((now + 30000))" ]; then
    echo "captured_at está en el futuro" >&2; return 1
  fi
  if [ "$captured" -lt "$((now - 120000))" ]; then
    echo "captured_at tiene más de 2 minutos; no se falsea como proceso vivo" >&2; return 1
  fi
}

if [ "$MODE" = "heartbeat" ] || { [ "$MODE" = "progress" ] && [ "$FALLBACK" = false ]; }; then
  IMAGE="$(capture_process_image)" || { echo "no se pudo capturar evidencia de proceso $CAPTURE_SURFACE/$CAPTURE_CONTEXT" >&2; exit 1; }
  CAPTURED_AT="$(capture_time "$IMAGE" "$CAPTURED_AT")"
  validate_process_time "$CAPTURED_AT"
  IMAGE_URL="$(upload_image "$IMAGE")"
  [ -n "$IMAGE_URL" ] || { echo "no se pudo subir evidencia de proceso" >&2; exit 1; }
  PAYLOAD="$(MISSION="$MISSION" OWNER="$OWNER" IMAGE_URL="$IMAGE_URL" CAPTURED_AT="$CAPTURED_AT" CAPTURE_SURFACE="$CAPTURE_SURFACE" CAPTURE_CONTEXT="$CAPTURE_CONTEXT" python3 -c 'import json,os; print(json.dumps({"mission":os.environ["MISSION"],"owner":os.environ["OWNER"],"image":os.environ["IMAGE_URL"],"captured_at":int(os.environ["CAPTURED_AT"]),"evidence_kind":"process","degraded":False,"capture_surface":os.environ["CAPTURE_SURFACE"],"capture_context":os.environ["CAPTURE_CONTEXT"]}))')"
  ENDPOINT="progress"
elif [ "$MODE" = "progress" ]; then
  CAPTURED_AT="$(capture_time "$IMAGE" "$CAPTURED_AT")"
  IMAGE_URL="$(upload_image "$IMAGE")"
  [ -n "$IMAGE_URL" ] || { echo "no se pudo subir final-fallback" >&2; exit 1; }
  PAYLOAD="$(MISSION="$MISSION" OWNER="$OWNER" IMAGE_URL="$IMAGE_URL" CAPTURED_AT="$CAPTURED_AT" python3 -c 'import json,os; print(json.dumps({"mission":os.environ["MISSION"],"owner":os.environ["OWNER"],"image":os.environ["IMAGE_URL"],"captured_at":int(os.environ["CAPTURED_AT"]),"evidence_kind":"final-fallback","degraded":True}))')"
  ENDPOINT="progress"
else
  [ -n "$REPORT" ] || { echo "final exige --report" >&2; exit 2; }
  # El cierre común toma DOS evidencias distintas. Primero captura y publica el
  # CLI mientras todavía está ejecutando el flujo; sólo después obtiene/usa la
  # prueba final. Nunca recicla IMAGE_URL como proceso y el cierre falla si no
  # puede acreditar la superficie/contexto real de ejecución.
  PROCESS_IMAGE="$(capture_process_image)" || { echo "no se pudo capturar evidencia de proceso $CAPTURE_SURFACE/$CAPTURE_CONTEXT" >&2; exit 1; }
  PROCESS_CAPTURED_AT="$(capture_time "$PROCESS_IMAGE")"
  validate_process_time "$PROCESS_CAPTURED_AT"
  PROCESS_URL="$(upload_image "$PROCESS_IMAGE")"
  [ -n "$PROCESS_URL" ] || { echo "no se pudo subir la captura de proceso" >&2; exit 1; }
  PROCESS_PAYLOAD="$(MISSION="$MISSION" OWNER="$OWNER" PROCESS_URL="$PROCESS_URL" PROCESS_AT="$PROCESS_CAPTURED_AT" CAPTURE_SURFACE="$CAPTURE_SURFACE" CAPTURE_CONTEXT="$CAPTURE_CONTEXT" python3 -c 'import json,os; print(json.dumps({"mission":os.environ["MISSION"],"owner":os.environ["OWNER"],"image":os.environ["PROCESS_URL"],"captured_at":int(os.environ["PROCESS_AT"]),"evidence_kind":"process","degraded":False,"capture_surface":os.environ["CAPTURE_SURFACE"],"capture_context":os.environ["CAPTURE_CONTEXT"]}))')"
  printf '%s' "$PROCESS_PAYLOAD" | curl -fsS -m 30 -X POST "$API/fleet/progress" -H 'Content-Type: application/json' --data @- >/dev/null
  [ -n "$IMAGE" ] || IMAGE="$(capture_process_image)" || { echo "no se pudo capturar evidencia final" >&2; exit 1; }
  IMAGE_URL="$(upload_image "$IMAGE")"
  [ -n "$IMAGE_URL" ] || { echo "final exige --image" >&2; exit 2; }
  PAYLOAD="$(MISSION="$MISSION" OWNER="$OWNER" IMAGE_URL="$IMAGE_URL" REPORT="$REPORT" HOST="$HOST" RUNTIME="$RUNTIME" python3 -c 'import json,os; print(json.dumps({"mission":os.environ["MISSION"],"owner":os.environ["OWNER"],"image":os.environ["IMAGE_URL"],"report":os.environ["REPORT"],"host":os.environ["HOST"],"runtime":os.environ["RUNTIME"]}))')"
  ENDPOINT="informe"
fi

printf '%s' "$PAYLOAD" | curl -fsS -m 30 -X POST "$API/fleet/$ENDPOINT" -H 'Content-Type: application/json' --data @-
printf '\n'
