#!/usr/bin/env bash
# Fuente versionada del launchd OnIdle. El worker decide si el agente está libre;
# el cliente sólo aporta tres mejoras reales y nunca puede saltarse el cupo 8/día.
set -uo pipefail

API="${YOKUP_API:-https://api.yokup.com}"
AGENT="${ONIDLE_AGENT:-OraculoMacMini}"
MACHINE="${ONIDLE_MACHINE:-admira-macmini}"
PROJECT_ID="${ONIDLE_PROJECT_ID:-yokup}"
PROJECT_OVERRIDE="${ONIDLE_PROJECT:-}"
PROJECT_SLUG_OVERRIDE="${ONIDLE_PROJECT_SLUG:-}"
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

# El API exige el contexto granular completo. El id es configurable, pero el
# nombre y slug se derivan del censo canónico; un override sólo vale si coincide.
projects="$(curl -fsS -m 20 "$API/projects" 2>/dev/null)" || {
  log "sin censo canónico de proyectos; no abro ventana"; exit 0;
}
project_context="$(printf '%s' "$projects" | PI="$PROJECT_ID" PO="$PROJECT_OVERRIDE" PSO="$PROJECT_SLUG_OVERRIDE" AG="$AGENT" MQ="$MACHINE" python3 -c '
import json,os,sys,unicodedata,re
d=json.load(sys.stdin); pid=os.environ["PI"]
p=next((x for x in d.get("projects",[]) if str(x.get("id"))==pid and str(x.get("status","activo")).lower()=="activo"),None)
if not p or not str(p.get("name","")).strip(): raise SystemExit(2)
if os.environ["AG"].lower() not in [str(x).lower() for x in p.get("agents",[])]: raise SystemExit(5)
if os.environ["MQ"].lower() not in [str(x).lower() for x in p.get("machines",[])]: raise SystemExit(6)
name=" ".join(str(p["name"]).split())
slug=re.sub(r"^-+|-+$","",re.sub(r"[^A-Z0-9]+","-",unicodedata.normalize("NFD",name).encode("ascii","ignore").decode().upper()))
if os.environ.get("PO") and " ".join(os.environ["PO"].split())!=name: raise SystemExit(3)
if os.environ.get("PSO") and os.environ["PSO"].strip().upper()!=slug: raise SystemExit(4)
print(pid); print(name); print(slug)
' 2>/dev/null)" || { log "contexto granular inválido para project_id=$PROJECT_ID; no abro ventana"; exit 0; }
PROJECT="$(printf '%s\n' "$project_context" | sed -n '2p')"
PROJECT_SLUG="$(printf '%s\n' "$project_context" | sed -n '3p')"
[ -n "$PROJECT" ] && [ -n "$PROJECT_SLUG" ] || { log "proyecto sin nombre/slug; no abro ventana"; exit 0; }

[ -s "$OPTIONS_FILE" ] || { log "faltan tres mejoras en $OPTIONS_FILE"; exit 0; }
options="$(grep -v '^[[:space:]]*$' "$OPTIONS_FILE" | head -3)"
count="$(printf '%s\n' "$options" | awk 'NF{n++} END{print n+0}')"
[ "$count" -eq 3 ] || { log "hay $count mejoras; hacen falta exactamente 3"; exit 0; }

body="$(printf '%s' "$options" | AG="$AGENT" MQ="$MACHINE" PI="$PROJECT_ID" PJ="$PROJECT" PS="$PROJECT_SLUG" python3 -c '
import json,os,re,sys
ops=[]; targets=[]
for line in [x.strip() for x in sys.stdin.read().splitlines() if x.strip()]:
  if line.startswith("{"):
    item=json.loads(line)
    if set(item)-{"title","target_mission_id"} or not str(item.get("title","")).strip(): raise SystemExit(7)
    target=str(item.get("target_mission_id","")).strip()
    if target and not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,119}",target): raise SystemExit(8)
    ops.append(str(item["title"]).strip()); targets.append({"target_mission_id":target} if target else None)
  else:
    ops.append(line); targets.append(None)
ops += ["↩ Volver atrás", "✍️ Custom · Escribe la mejora que quieras a mano"]
targets += [None,None]
print(json.dumps({"agent":os.environ["AG"],"machine":os.environ["MQ"],
  "project_id":os.environ["PI"],"project":os.environ["PJ"],"project_slug":os.environ["PS"],
  "surface":"admiranext","minutes":5,
  "mission":"OnIdle horario","onidle":True,"recommended":0,
  "question":"Ventana OnIDLE: elige una mejora.","options":ops,"option_targets":targets},ensure_ascii=False))
')" || { log "opciones estructuradas inválidas; no abro ventana"; exit 0; }

if [ "${ONIDLE_DRY_RUN:-0}" = "1" ]; then printf '%s\n' "$body"; exit 0; fi

response="$(curl -sS -m 25 -X POST "$API/decisions" -H 'Content-Type: application/json' -d "$body" 2>&1)"
case "$response" in
  *'"ok":true'*) log "Ventana OnIDLE $((used+1))/8 publicada" ;;
  *) log "ventana rechazada: $(printf '%s' "$response" | head -c 200)" ;;
esac
