# Arranque del espacio de trabajo (macOS + yabai)

Un comando deja los **4 escritorios** montados igual en cualquiera de tus Macs:

| Space | Izquierda | Derecha |
|------|-----------|---------|
| 1 | Chrome · perfil `csilva@admira.com` | CLI **Claude** |
| 2 | Chrome · perfil `csilvasantin@gmail.com` | CLI **Codex** |
| 3 | **Firefox** | CLI **Grok** |
| 4 | **Safari** a pantalla completa | — |

## 1. Instalar (una vez por Mac)

```bash
brew install koekeishiya/formulae/yabai koekeishiya/formulae/skhd jq
yabai --start-service
```

**SIP (importante):** mover ventanas entre Spaces y crear Spaces requiere el
*scripting addition* de yabai, que necesita **desactivar parcialmente SIP**. Sin eso,
yabai coloca ventanas dentro de un Space pero no las reparte entre los 4. Guía oficial:
https://github.com/koekeishiya/yabai/wiki/Disabling-System-Integrity-Protection
Tras habilitarlo: `sudo yabai --load-sa` (o reinicia el servicio).

> Si prefieres NO tocar SIP, dímelo y te hago una variante que crea los 4 Spaces a mano
> una vez y solo posiciona ventanas (sin el scripting addition).

## 2. Ajustar a tu máquina

Edita las variables al principio de `start-workspace.sh` (o expórtalas antes de correrlo):

- **Perfiles de Chrome** — NO es el email, es la carpeta del perfil. En cada perfil abre
  `chrome://version` y mira **Profile Path**; usa el último trozo de la ruta
  (p.ej. `Default`, `Profile 1`, `Profile 3`):
  ```bash
  export CHROME_PROFILE_ADMIRA="Default"
  export CHROME_PROFILE_GMAIL="Profile 1"
  ```
- **Terminal** — `Terminal` (por defecto) o `iTerm2`: `export TERMINAL_APP="iTerm2"`.
- **Comandos de los CLI** — por si el binario se llama distinto:
  ```bash
  export CLAUDE_CMD="claude"   # Claude Code CLI
  export CODEX_CMD="codex"     # Codex CLI
  export GROK_CMD="grok"       # Grok CLI
  ```

## 3. Arrancar con `handon`

El comando **`handon`** enciende el espacio de trabajo (es un lanzador de
`start-workspace.sh`, ejecutable desde cualquier carpeta).

Instálalo una vez en tu Mac (elige uno):

```bash
# a) symlink en un dir del PATH (Apple Silicon usa /opt/homebrew/bin)
ln -sf "$PWD/scripts/workspace/handon" /opt/homebrew/bin/handon      # o /usr/local/bin/handon

# b) alias en ~/.zshrc (ajusta la ruta del repo)
echo 'alias handon="$HOME/ruta/al/repo/scripts/workspace/handon"' >> ~/.zshrc && source ~/.zshrc
```

Luego, desde donde sea:

```bash
handon
```

(O directamente `scripts/workspace/start-workspace.sh` sin instalar nada.)

Abre Chrome (dos perfiles), Firefox, Safari y tres terminales con los CLIs, y los reparte
por mitades en los Spaces 1-4. Es idempotente en lo esencial: si lo relanzas, abre ventanas
nuevas y las recoloca (cierra las que sobren si no las quieres duplicadas).

## Notas / límites

- Pensado para **un solo monitor** (el del portátil). Con monitor externo, los Spaces se
  reparten por pantallas y habría que ajustar.
- El "pantalla completa" del Space 4 es *llenar el Space* (no el fullscreen nativo de macOS,
  que crea su propio Space y descoloca el conteo). Si quieres el fullscreen nativo, se cambia.
- Los CLIs se lanzan en `Terminal.app` vía AppleScript (`do script`). Para iTerm2, el script
  usa el mismo mecanismo; si tu iTerm pide permisos de automatización, acéptalos la 1ª vez.
