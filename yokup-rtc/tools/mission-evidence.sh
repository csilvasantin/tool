#!/usr/bin/env bash
# Cliente común de evidencia para Desktop, CLI y subagentes.
#   heartbeat <misión>
#   progress  <misión> [--image <png|jpg>] [--final-fallback]
#   final     <misión> --report <texto> [--image <png|jpg>]
# Sin --image captura el pane tmux (CLI/subagente) o usa AgoraCapture (Desktop).
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API="${YOKUP_API:-https://yokup-rtc.csilvasantin.workers.dev}"
MODE="${1:?uso: mission-evidence.sh heartbeat|progress|final <misión> ...}"
MISSION="${2:?falta misión}"; shift 2
IMAGE=""; REPORT=""; FALLBACK=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --image) IMAGE="${2:-}"; shift 2 ;;
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

TMP_WORK="$(mktemp -d "${TMPDIR:-/tmp}/yokup-evidence.XXXXXX")"
trap 'rm -rf "$TMP_WORK"' EXIT

capture_image() {
  local out="$TMP_WORK/capture.png" nonce current payload fleet_dir
  if { [ -n "${TMUX:-}" ] || [ -n "${TMUX_CAPTURE_TARGET:-}" ]; } && command -v tmux >/dev/null 2>&1; then
    local target_args=()
    [ -z "${TMUX_CAPTURE_TARGET:-}" ] || target_args=(-t "$TMUX_CAPTURE_TARGET")
    tmux capture-pane -p "${target_args[@]}" > "$TMP_WORK/pane.txt"
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
    [ -s "$out" ] && { printf '%s\n' "$out"; return 0; }
  fi
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
  [ -s "$out" ] && printf '%s\n' "$out"
}

upload_image() {
  local file="$1" type response
  [ -f "$file" ] && [ -s "$file" ] || { echo "imagen inexistente o vacía: $file" >&2; return 1; }
  case "$file" in *.jpg|*.jpeg) type="image/jpeg";; *.webp) type="image/webp";; *) type="image/png";; esac
  response="$(curl -fsS -m 60 -X POST "$API/fleet/media" -H "Content-Type: $type" --data-binary "@$file")"
  printf '%s' "$response" | python3 -c 'import json,sys; print((json.load(sys.stdin).get("url") or "").strip())'
}

IMAGE_URL=""
[ -n "$IMAGE" ] || { [ "$MODE" = "heartbeat" ] || IMAGE="$(capture_image)" || { echo "no se pudo capturar evidencia" >&2; exit 1; }; }
[ -z "$IMAGE" ] || IMAGE_URL="$(upload_image "$IMAGE")"
if [ "$MODE" = "heartbeat" ]; then
  PAYLOAD="$(MISSION="$MISSION" OWNER="$OWNER" python3 -c 'import json,os; print(json.dumps({"mission":os.environ["MISSION"],"owner":os.environ["OWNER"]}))')"
  ENDPOINT="progress"
elif [ "$MODE" = "progress" ]; then
  [ -n "$IMAGE_URL" ] || { echo "progress exige --image" >&2; exit 2; }
  CAPTURED_AT="$(( $(date +%s) * 1000 ))"
  KIND="process"; [ "$FALLBACK" = false ] || KIND="final-fallback"
  PAYLOAD="$(MISSION="$MISSION" OWNER="$OWNER" IMAGE_URL="$IMAGE_URL" CAPTURED_AT="$CAPTURED_AT" KIND="$KIND" FALLBACK="$FALLBACK" python3 -c 'import json,os; print(json.dumps({"mission":os.environ["MISSION"],"owner":os.environ["OWNER"],"image":os.environ["IMAGE_URL"],"captured_at":int(os.environ["CAPTURED_AT"]),"evidence_kind":os.environ["KIND"],"degraded":os.environ["FALLBACK"]=="true"}))')"
  ENDPOINT="progress"
else
  [ -n "$REPORT" ] || { echo "final exige --report" >&2; exit 2; }
  [ -n "$IMAGE_URL" ] || { echo "final exige --image" >&2; exit 2; }
  PAYLOAD="$(MISSION="$MISSION" OWNER="$OWNER" IMAGE_URL="$IMAGE_URL" REPORT="$REPORT" HOST="$HOST" RUNTIME="$RUNTIME" python3 -c 'import json,os; print(json.dumps({"mission":os.environ["MISSION"],"owner":os.environ["OWNER"],"image":os.environ["IMAGE_URL"],"report":os.environ["REPORT"],"host":os.environ["HOST"],"runtime":os.environ["RUNTIME"]}))')"
  ENDPOINT="informe"
fi

printf '%s' "$PAYLOAD" | curl -fsS -m 30 -X POST "$API/fleet/$ENDPOINT" -H 'Content-Type: application/json' --data @-
printf '\n'
