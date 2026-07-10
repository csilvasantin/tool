# HandON

Un solo comando, **`handon`**, que enciende y gestiona tu espacio de trabajo en macOS
(4 escritorios con yabai). Sin scripts sueltos: todo vive en `HandON/handon`.

| Space | Izquierda | Derecha |
|------|-----------|---------|
| 1 | Chrome · perfil `csilva@admira.com` | CLI **Claude** |
| 2 | Chrome · perfil `csilvasantin@gmail.com` | CLI **Codex** |
| 3 | **Firefox** | CLI **Grok** |
| 4 | **Safari** a pantalla completa | — |

## Comandos

```
handon               coloca las ventanas (= handon up)
handon install       instala yabai + jq y enlaza 'handon' en el PATH
handon autostart     ejecuta HandON al iniciar sesión (LaunchAgent)
handon autostart off quita el auto-arranque
handon help
```

## Puesta en marcha en un equipo nuevo

```bash
git clone https://github.com/csilvasantin/tool.git && cd tool
HandON/handon install
```

`install` instala software y enlaza el comando. Luego, **paso manual obligatorio** (Apple
no lo deja por script): habilitar SIP + scripting addition de yabai —
Recovery → `csrutil enable --without fs --without debug --without nvram` (o `csrutil disable`),
reinicia, y `sudo yabai --load-sa`. Guía:
https://github.com/koekeishiya/yabai/wiki/Disabling-System-Integrity-Protection

## Config por-máquina: `~/.handon.conf`

El script `handon` es **idéntico en todos los equipos**; lo que cambia va en `~/.handon.conf`
(perfiles de Chrome, terminal, comandos de los CLI). Créalo así:

```bash
cat > ~/.handon.conf <<'EOF'
CHROME_PROFILE_ADMIRA="Default"      # csilva@admira.com  (ver chrome://version → Profile Path)
CHROME_PROFILE_GMAIL="Profile 1"     # csilvasantin@gmail.com
TERMINAL_APP="Terminal"              # o "iTerm2"
CLAUDE_CMD="claude"; CODEX_CMD="codex"; GROK_CMD="grok"
EOF
```

## Uso diario

```bash
handon                 # monta el espacio de trabajo (no hace falta reiniciar)
handon autostart       # que se monte solo al iniciar sesión
```

## Notas / límites

- Pensado para **un monitor** (el del portátil). Con externo, los Spaces se reparten por
  pantallas y habría que ajustar.
- "Pantalla completa" del Space 4 = llenar el Space (no el fullscreen nativo de macOS, que
  crea su propio Space).
- Los CLI se abren en `Terminal.app` vía AppleScript; para iTerm2 pon `TERMINAL_APP="iTerm2"`
  y acepta los permisos de automatización la primera vez.
- Auto-arranque: logs en `/tmp/handon.out.log` y `/tmp/handon.err.log`.
