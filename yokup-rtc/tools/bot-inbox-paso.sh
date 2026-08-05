#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API="${YOKUP_API:-https://yokup-rtc.csilvasantin.workers.dev}"
MISSION="${1:?uso: bot-inbox-paso.sh <misión> <code> <status> [report] [image-url]}"
CODE="${2:?falta code}"; STATUS="${3:?falta status}"; REPORT="${4:-}"; IMAGE="${5:-}"
read -r _PERSONA _HOST OWNER _RUNTIME <<<"$(YOKUP_ROLE=sub bash "$HERE/quien-ejecuta.sh")"
PAYLOAD="$(MISSION="$MISSION" CODE="$CODE" STATUS="$STATUS" REPORT="$REPORT" IMAGE="$IMAGE" OWNER="$OWNER" python3 -c 'import json,os
d={"mission":os.environ["MISSION"],"code":os.environ["CODE"],"status":os.environ["STATUS"],"owner":os.environ["OWNER"]}
if os.environ["REPORT"]: d["report"]=os.environ["REPORT"]
if os.environ["IMAGE"]: d["image"]=os.environ["IMAGE"]
print(json.dumps(d))')"
printf '%s' "$PAYLOAD" | curl -fsS -m 20 -X POST "$API/fleet/task-status" -H 'Content-Type: application/json' --data @-
printf '\n'
