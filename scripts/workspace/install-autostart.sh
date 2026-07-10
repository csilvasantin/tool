#!/usr/bin/env bash
# install-autostart.sh — instala un LaunchAgent que ejecuta `handon` al iniciar sesión.
# Genera el plist con la ruta real del repo (por eso no es un plist estático).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LABEL="com.csilvasantin.handon"
AGENTS="$HOME/Library/LaunchAgents"
PLIST="$AGENTS/$LABEL.plist"

mkdir -p "$AGENTS"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$DIR/autostart-run.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>StandardOutPath</key>
    <string>/tmp/handon.out.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/handon.err.log</string>
</dict>
</plist>
PLIST

# (Re)cargar el agente. load/unload funciona en todas las versiones; en macOS
# recientes el equivalente moderno sería `launchctl bootstrap gui/$UID "$PLIST"`.
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "✓ Auto-arranque instalado: $PLIST"
echo "  Se ejecutará en cada inicio de sesión."
echo "  Probarlo ahora sin reiniciar:  launchctl start $LABEL"
echo "  Logs:                          /tmp/handon.out.log  /tmp/handon.err.log"
echo "  Desinstalar:                   launchctl unload \"$PLIST\" && rm \"$PLIST\""
