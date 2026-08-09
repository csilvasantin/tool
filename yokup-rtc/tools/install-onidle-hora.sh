#!/usr/bin/env bash
# Instala el OnIdle horario de OraculoMacMini sin compartir unidad ni script con
# otras identidades. No ejecuta la ventana al cargar: RunAtLoad queda desactivado.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$HERE/onidle-hora.sh"
VAULT="${ADMIRA_VAULT_DIR:-$HOME/Claude/admira-vault}"
LAUNCH_AGENTS="${ONIDLE_LAUNCH_AGENTS_DIR:-$HOME/Library/LaunchAgents}"
AGENT="OraculoMacMini"
LABEL="com.admira.onidle.$AGENT"
DEST="$VAULT/onidle-hora-$AGENT.sh"
PLIST="$LAUNCH_AGENTS/$LABEL.plist"
SCRIPT_BACKUP="$DEST.bak-before-$AGENT"
PLIST_BACKUP="$PLIST.bak-before-$AGENT"
LOAD=1

if [ "${1:-}" = "--no-load" ]; then
  LOAD=0
elif [ "$#" -ne 0 ]; then
  echo "uso: $0 [--no-load]" >&2
  exit 64
fi

[ -f "$SOURCE" ] || { echo "falta la fuente versionada: $SOURCE" >&2; exit 2; }

# Falla cerrado si alguien intenta reinstalar el lector de fichero stale, el
# heredado de cuatro opciones o un cliente sin contexto granular de Yokup.
SOURCE="$SOURCE" python3 - <<'PY'
from pathlib import Path
import os

source = Path(os.environ["SOURCE"]).read_text()
required = (
    'AGENT="${ONIDLE_AGENT:-OraculoMacMini}"',
    'PROJECT_ID="${ONIDLE_PROJECT_ID:-yokup}"',
    'PROJECT_OVERRIDE="${ONIDLE_PROJECT:-}"',
    'PROJECT_SLUG_OVERRIDE="${ONIDLE_PROJECT_SLUG:-}"',
    'fleet/onidle-proposals',
    'if len(rows)!=3',
    '"target_mission_id" not in item',
    '"↩ Volver atrás", "✍️ Custom · Escribe la mejora que quieras a mano"',
    '"option_targets":targets',
    '"project":os.environ["PJ"]',
    '"project_slug":os.environ["PS"]',
    'EXIT_PUBLISHED=0',
    'EXIT_BLOCKED=10',
    'EXIT_ERROR=20',
    'sound Glass',
    'decided|expired|cancelled',
    'sound Ping',
)
missing = [token for token in required if token not in source]
if missing:
    raise SystemExit("fuente OnIdle no canónica; faltan: " + ", ".join(missing))
for stale in ("ONIDLE_OPTIONS_FILE", "onidle-opciones", "head -3", "head -5"):
    if stale in source:
        raise SystemExit("fuente OnIdle heredada: todavía contiene " + stale)
PY

mkdir -p "$VAULT" "$LAUNCH_AGENTS"

backup_once() {
  local current="$1" backup="$2"
  if [ -e "$current" ] && [ ! -e "$backup" ]; then
    cp -p "$current" "$backup"
  fi
}

if [ ! -f "$DEST" ] || ! cmp -s "$SOURCE" "$DEST"; then
  backup_once "$DEST" "$SCRIPT_BACKUP"
  install -m 0755 "$SOURCE" "$DEST"
fi
chmod 0755 "$DEST"
cmp -s "$SOURCE" "$DEST" || { echo "copia del script no verificable" >&2; exit 3; }

plist_tmp="$(mktemp "${TMPDIR:-/tmp}/onidle-oraculo.XXXXXX")"
trap 'rm -f "$plist_tmp"' EXIT
cat >"$plist_tmp" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$DEST</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ONIDLE_AGENT</key><string>$AGENT</string>
    <key>ONIDLE_MACHINE</key><string>admira-macmini</string>
    <key>ONIDLE_PROJECT_ID</key><string>yokup</string>
    <key>ONIDLE_PROJECT</key><string>Yokup</string>
    <key>ONIDLE_PROJECT_SLUG</key><string>YOKUP</string>
    <key>PATH</key><string>$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><false/>
  <key>StartCalendarInterval</key>
  <dict><key>Minute</key><integer>13</integer></dict>
  <key>StandardOutPath</key><string>/tmp/onidle-$AGENT.log</string>
  <key>StandardErrorPath</key><string>/tmp/onidle-$AGENT.log</string>
</dict>
</plist>
PLIST

plutil -lint "$plist_tmp" >/dev/null
if [ ! -f "$PLIST" ] || ! cmp -s "$plist_tmp" "$PLIST"; then
  backup_once "$PLIST" "$PLIST_BACKUP"
  install -m 0644 "$plist_tmp" "$PLIST"
fi
chmod 0644 "$PLIST"
plutil -lint "$PLIST" >/dev/null

if [ "$LOAD" -eq 1 ]; then
  domain="gui/$(id -u)"
  launchctl bootout "$domain/$LABEL" >/dev/null 2>&1 || true
  launchctl bootstrap "$domain" "$PLIST"
  launchctl enable "$domain/$LABEL"
fi

printf 'OnIdle instalado: %s -> %s (project=yokup/Yokup/YOKUP)\n' "$LABEL" "$DEST"
[ "$LOAD" -eq 1 ] || printf 'launchd no cargado (--no-load)\n'
