#!/usr/bin/env bash
# Compatibilidad de observación para instalaciones antiguas. Desde server-scheduled-v1
# este cliente JAMÁS publica decisiones ni reproduce sonidos: el único productor es
# runOnIdleTick dentro del lease D1 del Worker.
set -euo pipefail

API="${YOKUP_API:-https://api.yokup.com}"
AGENT="${ONIDLE_AGENT:-OraculoMini}"
MACHINE="${ONIDLE_MACHINE:-admira-macmini}"

case "${1:-}" in
  ""|--status) ;;
  *) printf '{"ok":false,"error":"publisher_local_retirado"}\n'; exit 64 ;;
esac

curl -fsS -m 20 -G "$API/fleet/onidle-state" \
  --data-urlencode "agent=$AGENT" --data-urlencode "machine=$MACHINE"
printf '\n'
