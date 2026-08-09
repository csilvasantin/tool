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
AFPLAY="${ONIDLE_AFPLAY:-/usr/bin/afplay}"
WATCH_INTERVAL="${ONIDLE_WATCH_INTERVAL:-5}"

# Contrato para cualquier orquestador (launchd, heartbeat o ejecución manual):
#   0  = published: Yokup confirmó ok:true + id y sólo entonces sonó Glass.
#   10 = blocked: no se intentó/publicó por guard, cupo, decisión viva o dry-run.
#   20 = error: transporte, datos canónicos inválidos o rechazo inesperado.
# Ningún camino que no publique puede devolver 0: así `script && afplay Glass`
# deja de producir el falso positivo que originó esta incidencia.
EXIT_PUBLISHED=0
EXIT_BLOCKED=10
EXIT_ERROR=20

log() { printf '%s · %s\n' "$(date '+%Y-%m-%d %H:%M')" "$*" >&2; }

result() {
  local kind="$1" reason="${2:-}" id="${3:-}" window="${4:-}" payload="${5:-}"
  ONIDLE_KIND="$kind" ONIDLE_REASON="$reason" ONIDLE_ID="$id" \
    ONIDLE_WINDOW="$window" ONIDLE_PAYLOAD="$payload" python3 -c '
import json,os
out={"result":os.environ["ONIDLE_KIND"],"published":os.environ["ONIDLE_KIND"]=="published"}
for key,env in (("reason","ONIDLE_REASON"),("decision_id","ONIDLE_ID"),("window","ONIDLE_WINDOW")):
  if os.environ.get(env): out[key]=os.environ[env]
if os.environ.get("ONIDLE_PAYLOAD"):
  out["payload"]=json.loads(os.environ["ONIDLE_PAYLOAD"])
print(json.dumps(out,ensure_ascii=False,separators=(",",":")))
'
}

blocked() { log "$1"; result blocked "${2:-blocked}"; exit "$EXIT_BLOCKED"; }
failed() { log "$1"; result error "${2:-error}"; exit "$EXIT_ERROR"; }

sound() {
  [ -x "$AFPLAY" ] || return 0
  "$AFPLAY" "/System/Library/Sounds/$1.aiff" >/dev/null 2>&1 || true
}

watch_decision() {
  local id="$1" response status
  while :; do
    response="$(curl -fsS -m 20 "$API/decisions/$id" 2>/dev/null || true)"
    status="$(printf '%s' "$response" | python3 -c '
import json,sys
try:
  d=json.load(sys.stdin)
  print(d.get("status","") if d.get("ok") is True else "")
except Exception: print("")
' 2>/dev/null)"
    case "$status" in
      decided|expired|cancelled)
        # Cancelled es una respuesta explícita (Volver atrás); expired es el
        # vencimiento. No hay ningún otro camino que reproduzca Ping.
        sound Ping
        result resolved "$status" "$id"
        exit 0
        ;;
      *) sleep "$WATCH_INTERVAL" ;;
    esac
  done
}

case "${1:-}" in
  --watch)
    [ -n "${2:-}" ] || failed "watch sin decision_id" "watch_id_required"
    watch_decision "$2"
    ;;
  "") ;;
  *) failed "argumento no reconocido: $1" "bad_argument" ;;
esac

state="$(curl -fsS -m 20 -G "$API/fleet/onidle-state" \
  --data-urlencode "agent=$AGENT" --data-urlencode "machine=$MACHINE" 2>/dev/null)" || {
  failed "sin estado canónico de Yokup; no abro ventana" "state_unavailable";
}
decision="$(printf '%s' "$state" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("OPEN" if d.get("ok") and d.get("can_open") else "BLOCK")
print((d.get("quota") or {}).get("used",0))
print(d.get("reason", "unknown"))
' 2>/dev/null)" || failed "estado inválido; no abro ventana" "state_invalid"
can="$(printf '%s\n' "$decision" | sed -n '1p')"
used="$(printf '%s\n' "$decision" | sed -n '2p')"
reason="$(printf '%s\n' "$decision" | sed -n '3p')"
[ "$can" = "OPEN" ] || blocked "OnIdle bloqueado: $reason · cupo ${used}/8" "$reason"

# El API exige el contexto granular completo. El id es configurable, pero el
# nombre y slug se derivan del censo canónico; un override sólo vale si coincide.
projects="$(curl -fsS -m 20 "$API/projects" 2>/dev/null)" || {
  failed "sin censo canónico de proyectos; no abro ventana" "projects_unavailable";
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
' 2>/dev/null)" || failed "contexto granular inválido para project_id=$PROJECT_ID; no abro ventana" "project_context_invalid"
PROJECT="$(printf '%s\n' "$project_context" | sed -n '2p')"
PROJECT_SLUG="$(printf '%s\n' "$project_context" | sed -n '3p')"
[ -n "$PROJECT" ] && [ -n "$PROJECT_SLUG" ] || failed "proyecto sin nombre/slug; no abro ventana" "project_context_invalid"

proposal_wire="$(curl -sS -m 20 -G "$API/fleet/onidle-proposals" \
  --data-urlencode "agent=$AGENT" --data-urlencode "machine=$MACHINE" \
  --data-urlencode "project_id=$PROJECT_ID" -w $'\n%{http_code}' 2>/dev/null)" || \
  failed "no se pudo consultar las propuestas canónicas" "proposals_transport"
proposal_http="${proposal_wire##*$'\n'}"
options="${proposal_wire%$'\n'*}"
if ! [[ "$proposal_http" =~ ^2[0-9][0-9]$ ]]; then
  proposal_reason="$(printf '%s' "$options" | python3 -c '
import json,sys
try:
  d=json.load(sys.stdin); print(str(d.get("code") or d.get("error") or ""))
except Exception: print("")
' 2>/dev/null)"
  if [ "$proposal_reason" = "onidle_proposals_insufficient" ]; then
    blocked "sin tres propuestas canónicas vigentes; no abro ventana" "$proposal_reason"
  fi
  failed "consulta de propuestas rechazada: $(printf '%s' "$options" | head -c 200)" "proposals_rejected"
fi

body="$(printf '%s' "$options" | AG="$AGENT" MQ="$MACHINE" PI="$PROJECT_ID" PJ="$PROJECT" PS="$PROJECT_SLUG" python3 -c '
import json,os,re,sys,unicodedata
rows=[x.strip() for x in sys.stdin.read().splitlines() if x.strip()]
if len(rows)!=3: raise SystemExit(6)
ops=[]; targets=[]; seen_titles=set(); seen_targets=set()
for line in rows:
  item=json.loads(line)
  if not isinstance(item,dict) or set(item)-{"title","target_mission_id","explicit_new"} or "target_mission_id" not in item: raise SystemExit(7)
  title=" ".join(str(item.get("title","")).split())
  target="" if item.get("target_mission_id") is None else str(item["target_mission_id"]).strip()
  explicit=item.get("explicit_new") is True
  key=re.sub(r"[^a-z0-9]+"," ",unicodedata.normalize("NFD",title).encode("ascii","ignore").decode().lower()).strip()
  if not title or not key or key in seen_titles: raise SystemExit(8)
  if target:
    if explicit or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,119}",target) or target in seen_targets: raise SystemExit(9)
    seen_targets.add(target); targets.append({"target_mission_id":target})
  else:
    if not explicit: raise SystemExit(10)
    targets.append(None)
  seen_titles.add(key); ops.append(title)
ops += ["↩ Volver atrás", "✍️ Custom · Escribe la mejora que quieras a mano"]
targets += [None,None]
print(json.dumps({"agent":os.environ["AG"],"machine":os.environ["MQ"],
  "project_id":os.environ["PI"],"project":os.environ["PJ"],"project_slug":os.environ["PS"],
  "surface":"admiranext","minutes":5,
  "mission":"OnIdle horario","onidle":True,"recommended":0,
  "question":"Ventana OnIDLE: elige una mejora.","options":ops,"option_targets":targets},ensure_ascii=False))
')" || failed "propuestas canónicas inválidas o incompletas; no abro ventana" "proposals_invalid"

if [ "${ONIDLE_DRY_RUN:-0}" = "1" ]; then
  log "dry-run verificado; no se publica ni se reproduce Glass"
  result blocked dry_run "" "" "$body"
  exit "$EXIT_BLOCKED"
fi

wire="$(curl -sS -m 25 -X POST "$API/decisions" -H 'Content-Type: application/json' \
  -d "$body" -w $'\n%{http_code}' 2>/dev/null)" || failed "falló el POST de la ventana" "publish_transport"
http="${wire##*$'\n'}"
response="${wire%$'\n'*}"
confirmation="$(printf '%s' "$response" | HTTP="$http" python3 -c '
import json,os,re,sys
try: d=json.load(sys.stdin)
except Exception: raise SystemExit(20)
http=int(os.environ.get("HTTP","0") or 0)
if 200 <= http < 300 and d.get("ok") is True:
  ident=str(d.get("id","")).strip()
  if not re.fullmatch(r"DEC-[A-Za-z0-9._:-]+",ident): raise SystemExit(20)
  print("published"); print(ident); raise SystemExit(0)
if d.get("error") in ("onidle_blocked","live_decision") or d.get("code") in (
  "live_decision","daily_quota","mission_active","fresh_work","decision_pending"
):
  print("blocked"); print(str(d.get("code") or d.get("error"))); raise SystemExit(0)
raise SystemExit(20)
' 2>/dev/null)" || {
  failed "ventana rechazada: $(printf '%s' "$response" | head -c 200)" "publish_rejected"
}
kind="$(printf '%s\n' "$confirmation" | sed -n '1p')"
value="$(printf '%s\n' "$confirmation" | sed -n '2p')"
if [ "$kind" = "blocked" ]; then
  blocked "ventana bloqueada al confirmar el POST: $value" "$value"
fi
[ "$kind" = "published" ] && [ -n "$value" ] || failed "confirmación de publicación inválida" "publish_confirmation_invalid"

decision_id="$value"
window="$((used+1))/8"
# Glass ocurre dentro del contrato y DESPUÉS de confirmar ok:true + DEC-id.
sound Glass
if [ "${ONIDLE_NO_WATCH:-0}" != "1" ]; then
  nohup "$0" --watch "$decision_id" >/dev/null 2>&1 &
fi
log "Ventana OnIDLE $window publicada · $decision_id"
result published "" "$decision_id" "$window"
exit "$EXIT_PUBLISHED"
