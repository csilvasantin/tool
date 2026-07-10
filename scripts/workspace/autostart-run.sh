#!/usr/bin/env bash
# autostart-run.sh — lo que ejecuta el LaunchAgent al iniciar sesión.
# Espera a que yabai esté operativo (el login es una carrera) y luego lanza handon.
set -euo pipefail

# PATH mínimo del login: asegura brew (yabai, jq) y utilidades del sistema.
BREW_BIN="$( { command -v brew >/dev/null 2>&1 && brew --prefix; } 2>/dev/null)/bin"
export PATH="${BREW_BIN}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Espera hasta ~40s a que yabai responda antes de colocar ventanas.
for _ in $(seq 1 80); do
  yabai -m query --spaces >/dev/null 2>&1 && break
  sleep 0.5
done

exec "$DIR/handon"
