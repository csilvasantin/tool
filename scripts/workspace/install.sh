#!/usr/bin/env bash
# install.sh — prepara el Mac para `handon` (yabai + skhd + jq) en un comando.
# Automatiza todo lo automatizable. Lo ÚNICO manual es SIP (Apple no deja
# desactivarlo por script: hay que hacerlo desde Recovery). Se explica al final.
set -euo pipefail

echo "▶ Instalador del espacio de trabajo (yabai)"

# 1) Homebrew
if ! command -v brew >/dev/null 2>&1; then
  echo "✗ Homebrew no está instalado. Instálalo primero:"
  echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  exit 1
fi

# 2) Paquetes
echo "· Instalando yabai, skhd y jq…"
brew install koekeishiya/formulae/yabai koekeishiya/formulae/skhd jq

# 3) Servicios
echo "· Arrancando servicios…"
yabai --start-service || true
skhd  --start-service || true

# 4) Comando `handon` en el PATH
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$(brew --prefix)/bin"
if [ -w "$BIN" ]; then
  ln -sf "$DIR/handon" "$BIN/handon"
  echo "· Comando 'handon' enlazado en $BIN/handon"
else
  echo "· No pude escribir en $BIN; enlaza a mano:  ln -sf \"$DIR/handon\" \"$BIN/handon\""
fi

cat <<'EOF'

✓ Software instalado.

⚠ FALTA UN PASO MANUAL (obligatorio, no automatizable): habilitar el
  scripting addition de yabai, que necesita SIP parcialmente desactivado.
  Sin esto, las ventanas NO saltan entre Spaces.

  1) Reinicia en modo Recovery (Apple Silicon: mantén el botón de encendido
     al arrancar → "Opciones"). Abre Terminal (Utilidades → Terminal) y:
        csrutil enable --without fs --without debug --without nvram
     (o `csrutil disable` si tu macOS no acepta lo anterior). Reinicia.
  2) Ya en tu sesión normal:
        sudo yabai --load-sa
     y añade eso al arranque de yabai (guía oficial):
     https://github.com/koekeishiya/yabai/wiki/Disabling-System-Integrity-Protection

Después, ajusta los perfiles de Chrome (ver README) y ejecuta:  handon
EOF
