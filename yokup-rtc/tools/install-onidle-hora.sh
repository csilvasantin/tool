#!/usr/bin/env bash
# Retira de forma acotada el publicador launchd heredado. No instala sustituto:
# cron y piggyback del Worker comparten el lease D1 y son el único productor.
set -euo pipefail

AGENT="${ONIDLE_AGENT:-OraculoMini}"
LABEL="com.admira.onidle.$AGENT"
LAUNCH_AGENTS="${ONIDLE_LAUNCH_AGENTS_DIR:-$HOME/Library/LaunchAgents}"
PLIST="$LAUNCH_AGENTS/$LABEL.plist"
DOMAIN="gui/$(id -u)"

if command -v launchctl >/dev/null 2>&1; then
  launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || \
    launchctl remove "$LABEL" >/dev/null 2>&1 || true
fi
if [ -f "$PLIST" ]; then
  mv "$PLIST" "$PLIST.retired-server-scheduled"
fi
printf 'OnIDLE local retirado: %s; publicación exclusiva del Worker (server-scheduled-v1)\n' "$LABEL"
