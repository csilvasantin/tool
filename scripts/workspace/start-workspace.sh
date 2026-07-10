#!/usr/bin/env bash
# start-workspace.sh — arranca el espacio de trabajo en macOS con yabai.
#
# Layout (4 Spaces, un solo monitor):
#   Space 1: Chrome (perfil admira) [izq]  +  CLI Claude [der]
#   Space 2: Chrome (perfil gmail)  [izq]  +  CLI Codex  [der]
#   Space 3: Firefox                [izq]  +  CLI Grok   [der]
#   Space 4: Safari a pantalla completa
#
# Requisitos: yabai + jq. Ver scripts/workspace/README.md (incluye nota de SIP:
# mover ventanas entre Spaces y crear Spaces necesita el scripting addition de yabai).
#
# Nada de esto es específico de este repo: es un arranque de entorno reproducible
# para cualquiera de tus Macs (mismo resultado empezando de cero).
set -euo pipefail

# ── Config (AJUSTA a tu máquina) ───────────────────────────────────────────
# Nombre de carpeta del perfil de Chrome (NO el email). Míralo en chrome://version
# → "Profile Path": usa el último componente (p.ej. "Default", "Profile 1", ...).
CHROME_PROFILE_ADMIRA="${CHROME_PROFILE_ADMIRA:-Default}"     # csilva@admira.com
CHROME_PROFILE_GMAIL="${CHROME_PROFILE_GMAIL:-Profile 1}"     # csilvasantin@gmail.com

# App de terminal (yabai la identifica por este nombre). "Terminal" o "iTerm2".
TERMINAL_APP="${TERMINAL_APP:-Terminal}"

# Comandos que arrancan cada CLI en su terminal.
CLAUDE_CMD="${CLAUDE_CMD:-claude}"
CODEX_CMD="${CODEX_CMD:-codex}"
GROK_CMD="${GROK_CMD:-grok}"

# ── Helpers ────────────────────────────────────────────────────────────────
die() { echo "✗ $*" >&2; exit 1; }

preflight() {
  command -v yabai >/dev/null || die "yabai no está instalado (ver README)."
  command -v jq    >/dev/null || die "jq no está instalado: brew install jq"
  yabai -m query --spaces >/dev/null 2>&1 || die "yabai no responde: yabai --start-service"
}

max_id_for_app() {  # $1=app -> mayor window id de esa app (0 si ninguna)
  yabai -m query --windows | jq -r --arg app "$1" \
    '[.[] | select(.app==$app) | .id] | max // 0'
}

wait_new_window() {  # $1=app $2=id_previo -> id de la ventana nueva (espera)
  local app="$1" before="$2" tries=50 id
  while [ "$tries" -gt 0 ]; do
    id=$(yabai -m query --windows | jq -r --arg app "$app" --argjson before "$before" \
      '[.[] | select(.app==$app and .id>$before) | .id] | max // empty')
    [ -n "$id" ] && { printf '%s' "$id"; return 0; }
    sleep 0.3; tries=$((tries-1))
  done
  return 1
}

ensure_float() {  # deja la ventana flotante (idempotente)
  local id="$1" f
  f=$(yabai -m query --windows --window "$id" | jq -r '."is-floating"')
  [ "$f" = "false" ] && yabai -m window "$id" --toggle float || true
}

place() {  # $1=id $2=left|right|full $3=space
  local id="$1" side="$2" space="$3"
  yabai -m window "$id" --space "$space" 2>/dev/null || true
  ensure_float "$id"
  case "$side" in
    left)  yabai -m window "$id" --grid 1:2:0:0:1:1 ;;   # mitad izquierda
    right) yabai -m window "$id" --grid 1:2:1:0:1:1 ;;   # mitad derecha
    full)  yabai -m window "$id" --grid 1:1:0:0:1:1 ;;   # pantalla completa (dentro del Space)
  esac
}

ensure_spaces() {  # garantiza 4 Spaces
  local have
  have=$(yabai -m query --spaces | jq 'length')
  while [ "$have" -lt 4 ]; do yabai -m space --create; have=$((have+1)); done
}

open_chrome_profile() {  # $1=perfil -> id de la ventana nueva
  local before after
  before=$(max_id_for_app "Google Chrome")
  open -na "Google Chrome" --args --profile-directory="$1" --new-window
  after=$(wait_new_window "Google Chrome" "$before") || die "Chrome no abrió (perfil $1)"
  printf '%s' "$after"
}

open_term() {  # $1=comando -> id de la ventana nueva de terminal
  local before after
  before=$(max_id_for_app "$TERMINAL_APP")
  osascript -e "tell application \"$TERMINAL_APP\" to do script \"$1\"" >/dev/null
  after=$(wait_new_window "$TERMINAL_APP" "$before") || die "Terminal no abrió ($1)"
  printf '%s' "$after"
}

# ── Arranque ───────────────────────────────────────────────────────────────
preflight
ensure_spaces

echo "· Space 1: Chrome ($CHROME_PROFILE_ADMIRA) + Claude"
place "$(open_chrome_profile "$CHROME_PROFILE_ADMIRA")" left  1
place "$(open_term "$CLAUDE_CMD")"                       right 1

echo "· Space 2: Chrome ($CHROME_PROFILE_GMAIL) + Codex"
place "$(open_chrome_profile "$CHROME_PROFILE_GMAIL")"   left  2
place "$(open_term "$CODEX_CMD")"                        right 2

echo "· Space 3: Firefox + Grok"
ff_before=$(max_id_for_app "Firefox")
open -na "Firefox"
place "$(wait_new_window "Firefox" "$ff_before" || max_id_for_app "Firefox")" left 3
place "$(open_term "$GROK_CMD")"                         right 3

echo "· Space 4: Safari (pantalla completa)"
sf_before=$(max_id_for_app "Safari")
open -a "Safari"
place "$(wait_new_window "Safari" "$sf_before" || max_id_for_app "Safari")" full 4

yabai -m space --focus 1
echo "✓ Espacio de trabajo montado."
