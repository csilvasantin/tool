#!/usr/bin/env bash
# persona-id.sh — fija RUNTIME, PERSONA, ACCOUNT, MACHINE de la identidad activa.
# Sourcéalo:  . "$HERE/persona-id.sh"   (o ejecútalo para ver los valores).
# Mismo criterio que persona-wallpaper.sh (regla de flota s:PRIORIDAD_IDENTIDAD_FONDO):
# precedencia de runtime Claude > Codex > Grok; persona vía resolve-persona.py.
_PID_HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# Copia de yokup-rtc/tools: los helpers viven en el vault (mismo criterio que quien-ejecuta.sh).
[ -f "$_PID_HERE/detect-runtime.sh" ] || _PID_HERE="${ADMIRA_VAULT_DIR:-/Users/csilvasantin/Claude/admira-vault}"

# Detección de runtime: fuente única y endurecida (precedencia absoluta Claude>Codex>Grok,
# Grok solo por proceso grok real). Ver detect-runtime.sh.
# La identidad EXPLÍCITA de la sesión manda (YOKUP_RUNTIME / YOKUP_PERSONA, que el
# instalador de arranque mete en el tmux de cada persona). Sin ella, un agente de
# OpenCode en un Mac con Codex abierto firmaba como Trinity (3-sep-2026, Niobe en Rosa).
RUNTIME="${YOKUP_RUNTIME:-$(bash "$_PID_HERE/detect-runtime.sh" 2>/dev/null)}"

PERSONA="${YOKUP_PERSONA:-$(python3 "$_PID_HERE/resolve-persona.py" "$RUNTIME" persona 2>/dev/null)}"
ACCOUNT="$(python3 "$_PID_HERE/resolve-persona.py" "$RUNTIME" account 2>/dev/null)"
# Ruta absoluta a scutil: /usr/sbin no siempre está en el PATH (p.ej. launchd) → si no,
# MACHINE caía a hostname -s ("mac") y la presencia se posteaba con OTRO nombre de máquina.
MACHINE="$(/usr/sbin/scutil --get ComputerName 2>/dev/null || scutil --get ComputerName 2>/dev/null || hostname -s)"

# NOMBRE VISIBLE de la normativa (admiranext.com/normativa, reglas 01/02/04):
# persona + apellido ABREVIADO del modelo, tal cual está en el diccionario, y
# siempre en pareja con su máquina. Neo en el MacBookAirAzul es NeoMBAAzul, no
# NeoAzul ni Neo a secas. PERSONA se deja intacta: es la familia operativa y hay
# consumidores que la comparan (fondos, avatares, whitelists).
case "$(echo "$MACHINE" | tr 'A-Z' 'a-z' | tr -cd 'a-z0-9')" in
  *macmini*|macmini*)      MACHINE_SUFFIX="MacMini" ;;
  *macbookairazul*)        MACHINE_SUFFIX="MBAAzul" ;;
  *macbookairrosa*)        MACHINE_SUFFIX="MBARosa" ;;
  *macbookaircrema*)       MACHINE_SUFFIX="MBACrema" ;;
  *macbookairplata*)       MACHINE_SUFFIX="MBAPlata" ;;
  *macbookair16*)          MACHINE_SUFFIX="MBA16" ;;
  *macbookpro16*)          MACHINE_SUFFIX="MBP16" ;;
  *macbookpro*14*|*negro14*) MACHINE_SUFFIX="MBP14" ;;
  *dgx*)                   MACHINE_SUFFIX="DGX" ;;
  *thinkstation*)          MACHINE_SUFFIX="PGX" ;;
  *zenbook*)               MACHINE_SUFFIX="Zenbook" ;;
  *)                       MACHINE_SUFFIX="" ;;
esac
# Niobe se conserva como alias de lectura para el historial, pero desde FLT-1507
# este Mac Mini vuelve a escribir con la familia Oraculo. Esta barrera local evita
# que un resolver o una variable de entorno desactualizados vuelvan a firmar como
# Niobe mientras se propaga la tabla canónica de ai-workspace.
if [ "$PERSONA" = "Niobe" ] && [ "$MACHINE_SUFFIX" = "MacMini" ]; then
  PERSONA="Oraculo"
fi
# Sin apellido no hay identidad completa (regla 04): se marca SINMAQ en vez de
# publicar la persona pelada, para que el hueco se vea.
AGENT_NAME="${PERSONA}${MACHINE_SUFFIX:-SINMAQ}"
AGENT_PAIR="$AGENT_NAME · $MACHINE"

# Si se ejecuta directamente (no sourceado), muéstralos.
if [ "${BASH_SOURCE[0]:-$0}" = "$0" ]; then
  echo "RUNTIME=$RUNTIME  PERSONA=$PERSONA  ACCOUNT=$ACCOUNT  MACHINE=$MACHINE"
  echo "AGENT_NAME=$AGENT_NAME  AGENT_PAIR=$AGENT_PAIR"
fi
