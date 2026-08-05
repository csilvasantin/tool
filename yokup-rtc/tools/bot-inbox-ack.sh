#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ID="${1:?uso: bot-inbox-ack.sh <id> [estado] [nota]}"; STATUS="${2:-ack}"
shift; [ "$#" -eq 0 ] || shift; NOTE="$*"
read -r PERSONA _HOST _OWNER _RUNTIME <<<"$(YOKUP_ROLE=main bash "$HERE/quien-ejecuta.sh")"
. "$HERE/persona-id.sh"
if [ "$STATUS" = done ]; then
  PROOF_URL="$(bash "$HERE/mission-proof.sh" "$ID" "${NOTE:-Trabajo terminado y verificado.}")"
  NOTE="${NOTE:+$NOTE · }📸 $PROOF_URL"
fi
BASE="${ADMIRA_TG_API:-https://admira-telegram.csilvasantin.workers.dev}"
if [ "$STATUS" = ack ]; then ENDPOINT="$BASE/api/bot-inbox/$ID/ack"; else ENDPOINT="$BASE/api/bot-inbox/$ID/status"; fi
PAYLOAD="$(PERSONA="$PERSONA" MACHINE="$MACHINE" STATUS="$STATUS" NOTE="$NOTE" python3 -c 'import json,os
d={"persona":os.environ["PERSONA"],"machine":os.environ["MACHINE"]}
if os.environ["STATUS"]!="ack": d["status"]=os.environ["STATUS"]
if os.environ["NOTE"]: d["verification"]=os.environ["NOTE"]
print(json.dumps(d))')"
printf '%s' "$PAYLOAD" | curl -fsS -m 20 -X POST "$ENDPOINT" -H 'Content-Type: application/json' --data @-
printf '\n'
