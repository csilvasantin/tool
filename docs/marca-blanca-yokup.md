# Marca blanca en Yokup / White label (FLT-101338)

Yokup (yokup.com, la pata «Yokup mantiene») puede vestirse con la marca de un cliente del **catálogo único** de https://www.admiranext.com/marcablanca (semillas Admira, Lumbre, BRUMELLE y Frescaria, y las marcas guardadas después, p. ej. `starbucks`), con la plataforma `yokup`. Sigue el mismo diseño, textos y reglas que admira.app (FLT-101331), Pixeria (FLT-101333) y XpaceOS (FLT-101337).

Estado: implementado en la rama `morfeo/shell-marca-yokup` (pendiente de push y despliegue por el coordinador).

## Cómo se activa

| Cómo | Efecto |
|---|---|
| `?marca=<id>` en cualquier página con el marco (`/retailer?marca=starbucks`, `/incidencias?marca=starbucks`…) | Aplica la marca y la recuerda en la pestaña (`sessionStorage` `mb:marca`, la misma clave que el cargador común, admira.app, Pixeria y XpaceOS). |
| ⌘ Experto → `/marca <id>` (alias `/brand`) | Igual, sin recargar. Tab completa el verbo, los ids del catálogo y `off`. |
| `?modo=marca\|nativo\|claro\|oscuro\|auto` | Modo de color (por defecto `marca`: el del cliente). |

La marca se mantiene al navegar entre páginas de la misma pestaña. Una pestaña nueva empieza sin marca.

## Cómo se vuelve a Admira

`/marca off` (o `/marca admira`), **«Volver a Admira»** arriba de ☰ Opciones (sólo aparece con marca activa) o `?marca=admira` en la URL. Se deshace en el sitio, sin recargar: variables, atributos, logo, «powered by», favicon, theme-color, título y hojas cargadas; también se quitan `?marca=`/`?modo=` de la URL.

## El verbo /marca y la consola local

El ⌘ Experto de Yokup escribe en el **tmux remoto** del agente seleccionado (consola de CLIs de la flota). Los verbos con barra del sitio son otra cosa, así que el marco trae un **intérprete local mínimo** (la «consola local», arriba del Experto y la única que ve quien entra sin sesión de flota): `/help` (`/ayuda`), `/limpiar` (`/clear`) y `/marca` (`/brand`) se ejecutan en el navegador y **nunca llegan a un agente**. Si alguien escribe `/marca …` en la caja de un CLI remoto, también se resuelve en local y no se envía; el resto del texto de esa caja (incluido el `/help` del propio CLI) se envía como siempre.

| Orden | Respuesta |
|---|---|
| `/marca` | La marca activa (o «Sin marca blanca: ves el aspecto de Admira.») y las disponibles del catálogo. |
| `/marca <id>` | «Aplicando la marca <id>…» y, si existe, «Marca <Nombre> (<id>) activa. Se mantiene al navegar en esta pestaña; /marca off vuelve a Admira.» Una propuesta automática o una marca de ejemplo se avisan. Si no existe: «No está en el catálogo de admiranext.com. No se ha aplicado nada.» |
| `/marca off` | «Marca <Nombre> desactivada: vuelve Admira.» |
| `/marca <web>` | Abre `https://www.admiranext.com/marcablanca/?web=<url>` en otra pestaña: allí se analiza la web y se guarda en el catálogo; después `/marca <id>`. |

Los textos son los de admira.app, Pixeria y XpaceOS. Historial con ↑/↓ (`yk_local_cli_history_v1`).

## Cómo se carga (un solo enganche)

- **`yk-frame.js`** es el único punto de entrada (lo cargan todas las páginas servidas). Si la pestaña pide marca (`?marca=` o `mb:marca` recordada) inserta **`/yk-marca.js` con su mismo sello** (`?v=`); si no, no carga nada: una visita normal no descarga ni un byte nuevo ni habla con admiranext.com. `/marca` lo carga al usarlo. Ninguna página lo enlaza a mano.
- `yk-marca.js`, con marca:
  1. **Comprueba primero** que existe: `GET https://www.admiranext.com/marcablanca/api/marcas/<id>` (8 s como mucho). 404 → no existe. Si la API no responde, prueba `clientes/<id>.json`.
  2. Sólo entonces carga `marcablanca.css` y `marcablanca.js` de admiranext.com (`data-mb-plataforma="yokup"`, `data-mb-auto="false"`) y `/yk-marca.css` (con el mismo sello) y llama a `MarcaBlanca.aplicar(id, {plataforma: 'yokup'})`.
  3. Si algo falla, no queda nada a medias: Yokup sigue igual y sólo hay un aviso en la consola del navegador (en el CLI, un mensaje claro).
- El catálogo completo sólo se pide con una marca activa o al usar `/marca`.

## Qué cambia

- **Barra**: fondo de la marca casi opaco con borde inferior. Composición: [☰] **logo del cliente** **│ powered by Yokup** (el logo yokup● pasa a ese «powered by», pequeño y en el gris de la marca); el logo del cliente lleva al inicio. Bajo 600 px sólo queda el logo. Si la marca no tiene logo, su nombre. El `title` del logo avisa si es una **propuesta automática** («no es la marca oficial», p. ej. `starbucks`) o una **marca ficticia de ejemplo**.
- **☰ Opciones, ▤ Avanzado y ⌘ Experto**: superficies, bordes, radios, tipografía y textos de la marca; iconos ☰ ▤ ⌘ con el color de la marca.
- **Páginas**: los tokens de Yokup viven en `<body>` (`body.yk-light`, `body.inc-portal`, `body.yk-claro`) y en `:root` (paleta del portal, portales). El puente común de `marcablanca.css` va en `<html>` y pierde frente a `<body>`, así que `yk-marca.css` declara en `html[data-mb-marca][data-mb-plataforma="yokup"] body` los del marco (`--yk-*`), la paleta del portal (`--p-*`), los de las páginas de la flota (`--bg --card --card2 --ink --mut --dim --brand --accent --good --warn --violet --line --line2 --sans`) y los de los portales (`--ink --muted --paper --line --lime --dark --red --olive --green --soft`). También viste los acentos escritos a mano del portal (punto vivo, segunda línea verde de los títulos, tarjetas suaves) y los botones rellenos (texto `--mbx-on-brand`).
- **Legibilidad (AA)**: `yk-marca.js` calcula tokens `--mbx-*` (texto, texto suave, marca, acento, ok, aviso, error, info, texto sobre marca y sobre acento): toma el color de la marca si contrasta ≥ 4,5:1 con el fondo y las superficies; si no, el siguiente candidato y, en último caso, negro o blanco. Starbucks es una marca clara: su verde `#006241` y su gris `#576061` se mantienen; el dorado `#C58800` no llega a AA sobre blanco y cede.
- **Pestaña**: favicon y theme-color de la marca y título «Nombre del cliente · título de la página».

## Qué no cambia

- Vídeos, lienzos, fotos, mapas e iframes (sin filtros ni mezclas); el terminal xterm de los CLIs y el visor de cámara del supervisor.
- Las excepciones sin marco (`docs/shell-cuadratico-yokup.md`) y la sala de `/llamadas?room=…` (sin barra; si la pestaña trae marca, la página se viste pero no hay barra).
- Detalles escritos a mano fuera de los tokens conservan su color; la barra y los raíles sí llevan la marca.

## Ayuda y MCP

La marca blanca es una funcionalidad del **site**, no del servidor MCP: no hay herramienta nueva ni cambia `MCP_VERSION`. Está escrita en `yokup-site/help/index.html` (personas), `yokup-site/mcp/index.html` y `mcp/llms.txt` (agentes) y `yokup-site-gate/MCP.md`: para enseñar Yokup con marca, un agente entrega el enlace con `?marca=<id>`.

## Ficheros

| Fichero | Papel |
|---|---|
| `yokup-site/yk-frame.js` | Único enganche (`wantsBrand`, `cargarMarca`), consola local y verbo `/marca` (`runMarca`, textos del canon), intercepción de `/marca` en la caja del CLI remoto. |
| `yokup-site/yk-marca.js` | Decide la marca, comprueba el catálogo, carga lo necesario, aplica, deshace y expone `window.AdmiraMarca` (`actual`, `conocidas`, `listar`, `activar`, `desactivar`, `analizar`). |
| `yokup-site/yk-marca.css` | Todo bajo `html[data-mb-marca][data-mb-plataforma="yokup"]`. Sólo se descarga con marca. |
| `yokup-site/marca-blanca.test.mjs` | Sin marca no se carga nada; un solo enganche con el mismo sello; catálogo antes que nada; AA; hoja acotada; verbo, alias, Tab, consola local que no envía nada; ayuda y MCP. |

## Límites conocidos

- `POST /marcablanca/api/analizar` exige mismo origen: `/marca <web>` abre el analizador de admiranext.com en otra pestaña.
- La marca por dominio (`<cliente>.yokup.com`) del cargador común no se usa aquí: Yokup sólo se viste con `?marca=` o `/marca`.

---

**English.** Yokup can wear a client brand from the admiranext.com/marcablanca catalogue, platform `yokup`. Turn it on with `?marca=<id>` on any page with the frame or with `/marca <id>` (alias `/brand`) in ⌘ Expert; it stays for the tab. `/marca off`, `?marca=admira` or “Back to Admira” at the top of ☰ Options undo it in place. `yk-frame.js` is the single hook: it inserts `/yk-marca.js` with its own stamp only when the tab asks for a brand or `/marca` is used, so a normal visit loads nothing new and never contacts admiranext.com. The catalogue entry is checked first (8 s max); only then the common stylesheet and loader (platform `yokup`, no auto start) plus `/yk-marca.css` are loaded. The bar shows the client logo │ “powered by Yokup”, with a title that warns about automatic proposals and samples; rails, Expert, the portal palette and page tokens take the brand colours with WCAG AA text. Since Yokup's Expert panel talks to a remote tmux, `/help` and `/marca` run in a small local console in the browser and never reach an agent. It is a site feature, documented in /help, /mcp, llms.txt and MCP.md, not a new MCP tool.
