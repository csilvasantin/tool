#!/usr/bin/env bash
# Compatibilidad con la interfaz histórica, sin fallback mudo de final→proceso.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MISSION="${1:?uso: bot-inbox-informe.sh <misión> <informe> [--img fichero]}"; shift
REPORT="${1:?falta informe}"; shift
ARGS=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --img) ARGS+=(--image "${2:-}"); shift 2 ;;
    # Cierre de un agente sin GUI: la evidencia de proceso sale de su transcript.
    --transcript) ARGS+=(--transcript "${2:-}"); shift 2 ;;
    --no-shot|--nosho|--sin-captura) echo "el cierre sin captura ya no está permitido" >&2; exit 2 ;;
    *) echo "opción desconocida: $1" >&2; exit 2 ;;
  esac
done
# `"${ARGS[@]}"` sobre un array VACÍO revienta con set -u en el bash 3.2 que trae
# macOS («ARGS[@]: unbound variable»), así que un cierre sin --img ni --transcript
# —el caso más normal— no llegaba a ejecutarse. La expansión de abajo deja el array
# fuera cuando no hay nada que pasar.
YOKUP_ROLE=infra "$HERE/mission-evidence.sh" final "$MISSION" --report "$REPORT" ${ARGS[@]+"${ARGS[@]}"}
