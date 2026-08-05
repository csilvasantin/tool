#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MISSION="${1:?uso: mission-proof.sh <misión> [informe]}"
REPORT="${2:-Trabajo terminado y verificado.}"
RESPONSE="$(YOKUP_ROLE=infra "$HERE/mission-evidence.sh" final "$MISSION" --report "$REPORT")"
printf '%s' "$RESPONSE" | python3 -c 'import json,sys
r=json.load(sys.stdin)
if not (r.get("ok") and r.get("resolved") and r.get("proof_image")): raise SystemExit(1)
print(r["proof_image"])'
