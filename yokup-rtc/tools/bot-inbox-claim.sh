#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ID="${1:?uso: bot-inbox-claim.sh <id>}"
TG_API="${ADMIRA_TG_API:-https://admira-telegram.csilvasantin.workers.dev}"
read -r PERSONA _HOST OWNER _RUNTIME <<<"$(YOKUP_ROLE=sub bash "$HERE/quien-ejecuta.sh")"
. "$HERE/persona-id.sh"
CLAIM="$(PERSONA="$PERSONA" MACHINE="$MACHINE" python3 -c 'import json,os; print(json.dumps({"persona":os.environ["PERSONA"],"machine":os.environ["MACHINE"]}))')"
RESPONSE="$(printf '%s' "$CLAIM" | curl -fsS -m 15 -X POST "$TG_API/api/bot-inbox/$ID/claim" -H 'Content-Type: application/json' --data @-)"
printf '%s' "$RESPONSE" | python3 -c 'import json,sys; raise SystemExit(0 if json.load(sys.stdin).get("claimed") else 1)'
"$HERE/mission-evidence.sh" heartbeat "FLT-$ID" >/dev/null
"$HERE/bot-inbox-paso.sh" "FLT-$ID" a in_progress >/dev/null
printf '✓ claim #%s — %s\n' "$ID" "$OWNER"
