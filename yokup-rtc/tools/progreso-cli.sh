#!/usr/bin/env bash
# Watcher canónico: usa el mismo cliente de evidencia que Desktop/subagentes.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MISSION="${1:?uso: progreso-cli.sh <misión> <sesión_tmux>}"
SESSION="${2:?falta sesión tmux}"
INTERVAL="${PROGRESO_INTERVAL:-25}"
export YOKUP_ROLE="${YOKUP_ROLE:-sub}"
"$HERE/mission-evidence.sh" heartbeat "$MISSION" >/dev/null
while tmux has-session -t "$SESSION" 2>/dev/null; do
  TMUX="${TMUX:-watcher}" tmux capture-pane -p -t "$SESSION:0" > /dev/null 2>&1 || break
  # mission-evidence captura el pane de la sesión actual; se le pasa el target
  # al tmux mediante una variable estable para watchers externos.
  TMUX_CAPTURE_TARGET="$SESSION:0" "$HERE/mission-evidence.sh" progress "$MISSION" >/dev/null || break
  sleep "$INTERVAL"
done
