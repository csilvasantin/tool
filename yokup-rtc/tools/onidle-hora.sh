#!/usr/bin/env bash
# Fuente versionada del launchd OnIdle. El worker decide si el agente está libre;
# el cliente sólo aporta tres mejoras reales y nunca puede saltarse el cupo 8/día.
set -uo pipefail

API="${YOKUP_API:-https://api.yokup.com}"
AGENT="${ONIDLE_AGENT:-OraculoMacMini}"
MACHINE="${ONIDLE_MACHINE:-admira-macmini}"
PROJECT_ID="${ONIDLE_PROJECT_ID:-yokup}"
OPTIONS_FILE="${ONIDLE_OPTIONS_FILE:-${AGENTS_COMMS_DIR:-$HOME/.agents-comms}/onidle-opciones-$AGENT.txt}"

log() { printf '%s · %s\n' "$(date '+%Y-%m-%d %H:%M')" "$*"; }

state="$(curl -fsS -m 20 -G "$API/fleet/onidle-state" \
  --data-urlencode "agent=$AGENT" --data-urlencode "machine=$MACHINE" 2>/dev/null)" || {
  log "sin estado canónico de Yokup; no abro ventana"; exit 0;
}
decision="$(printf '%s' "$state" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("OPEN" if d.get("ok") and d.get("can_open") else "BLOCK")
print((d.get("quota") or {}).get("used",0))
print(d.get("reason", "unknown"))
' 2>/dev/null)" || { log "estado inválido; no abro ventana"; exit 0; }
can="$(printf '%s\n' "$decision" | sed -n '1p')"
used="$(printf '%s\n' "$decision" | sed -n '2p')"
reason="$(printf '%s\n' "$decision" | sed -n '3p')"
[ "$can" = "OPEN" ] || { log "OnIdle bloqueado: $reason · cupo ${used}/8"; exit 0; }

[ -s "$OPTIONS_FILE" ] || { log "faltan tres mejoras en $OPTIONS_FILE"; exit 0; }
options="$(grep -v '^[[:space:]]*$' "$OPTIONS_FILE" | head -3)"
count="$(printf '%s\n' "$options" | awk 'NF{n++} END{print n+0}')"
[ "$count" -eq 3 ] || { log "hay $count mejoras; hacen falta exactamente 3"; exit 0; }

body="$(printf '%s' "$options" | AG="$AGENT" MQ="$MACHINE" PI="$PROJECT_ID" python3 -c '
import json,os,sys
ops=[line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
ops += ["↩ Volver atrás", "✍️ Custom · Escribe la mejora que quieras a mano"]
print(json.dumps({"agent":os.environ["AG"],"machine":os.environ["MQ"],
  "project_id":os.environ["PI"],"surface":"admiranext","minutes":5,
  "mission":"OnIdle horario","onidle":True,"recommended":0,
  "question":"Ventana OnIDLE: elige una mejora.","options":ops},ensure_ascii=False))
')"

response="$(curl -sS -m 25 -X POST "$API/decisions" -H 'Content-Type: application/json' -d "$body" 2>&1)"
case "$response" in
  *'"ok":true'*) log "Ventana OnIDLE $((used+1))/8 publicada" ;;
  *) log "ventana rechazada: $(printf '%s' "$response" | head -c 200)" ;;
esac
