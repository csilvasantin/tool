# Marco cuadrático de Yokup y tema claro / Yokup four-band frame (FLT-101338)

**Regla: toda página que sirve www.yokup.com usa el marco común `yk-frame` y el tema claro del Portal del comercio.** Ninguna página trae su propia cabecera ni su propia navegación. Es la misma interfaz que ya tienen admira.app (`galaxy-shell`), Pixeria (`shell-cuadratico`) y XpaceOS (`xpace-shell`): Yokup es la cuarta pata de la Galaxia («Yokup mantiene»).

Estado: implementado en la rama `morfeo/shell-marca-yokup` (pendiente de push y despliegue por el coordinador).

## Qué es

- **Barra superior** (`.yk-bar`, 46 px, blanca con borde del portal): a la izquierda **☰ Opciones** + el logo **yokup●** (el wordmark del Portal del comercio, enlace a `/`) + la sección discreta de la página (`data-yk-title`); a la derecha **▤ Avanzado** y **⌘ Experto**. Con sesión de flota, entre medias van además el menú de secciones (con sus contadores y su referencia lumínica) y el selector de proyecto.
- **☰ Opciones** (raíl izquierdo): la navegación general. En las páginas públicas, lo que la página trae y los enlaces comunes de Yokup (Inicio, Mi comercio, Instaladores, Llamadas, Entrenamiento, Ayuda, Para agentes · MCP, Contáctanos), sin repetir un destino que la página ya trae. Con sesión de flota, además AJUSTES, Nuevo proyecto, Equipo, Status, Panel de control y el sello de versión.
- **▤ Avanzado** (raíl derecho): las acciones de la página (Entrar, Salir, ver como, idioma, imprimir, enviar…) y, con sesión de flota, Highscore y DesktopAPP.
- **⌘ Experto** (abajo, redimensionable): la **consola local** (`/help`, `/limpiar`, `/marca`), que se ejecuta en el navegador y nunca llega a un agente y, sólo con sesión de flota, la consola de CLIs de la flota (xterm + escritura al tmux del agente).

Los tres paneles empiezan cerrados en cada carga (decisión de Yokup desde el 12-jul: una superficie operativa no se reabre sola). **Esc cierra el panel que tiene el foco** y devuelve el foco a su icono (el mismo teclado que `responsive-shell` de admira.app y el shell de XpaceOS); un diálogo propio que ya atendió el Esc gana. Los iconos llevan `aria-pressed` y `aria-controls`.

## Dos modos: flota y público

| Modo | Cuándo | Qué monta |
|---|---|---|
| **flota** | La página carga `acceso.js` (la verja de Google de la flota): no se ve nada sin sesión. | Menú de secciones con contadores, selector de proyecto, AJUSTES, DesktopAPP, Highscore y la consola de CLIs en ⌘ Experto. |
| **público** | Sin `acceso.js` (portada, portales del comercio y del instalador con su propio login, ayuda, MCP, contacto, llamadas…) o con `body[data-yk-public]`. | Barra canónica pura, enlaces comunes en ☰ y sólo la consola local en ⌘. **No pide nada al API ni empuja al login de la flota, y la consola de CLIs nunca se monta para un anónimo.** |

## Tema claro («todo claro», Carlos 1-oct-2026)

- La **paleta del portal** (`--p-ink #173632`, `--p-muted #667a75`, `--p-paper #f6f8f3`, `--p-line #dbe3d9`, `--p-lime #d8f36a`, `--p-dark #133d32`, `--p-green #4f6e4c`, `--p-live #7aab49`, `--p-red #ac3838`…, DM Sans y Manrope) vive **una sola vez** en `yk-frame.css` (`:root`). La usan el marco, las pieles `incidencias-portal.css`, `yk-portal-light.css` y `ticket-portal.css`, y las páginas.
- El marco ya **no lee los tokens de cada página**: tiene los suyos (`--yk-*`, textos AA sobre blanco y papel) y se ve igual sobre cualquier contenido. Los cian escritos a mano pasaron a tokens.
- **Contenido**: `:is(body.yk-claro, body.yk-light, body.inc-portal)` reasigna los tokens de siempre de las páginas (`--bg --card --card2 --ink --mut --dim --brand --accent --good --warn --violet --line --line2 --sans`) a la paleta del portal. Las páginas de la flota que eran oscuras (supervisor, carbono, agente, intervención, ideas, estrategia, circuitos, contáctanos, ayuda, MCP y la app) llevan `body.yk-claro` y su CSS escrito a mano se pasó a tokens del portal.
- **Excepciones de color deliberadas**: el **xterm** de la consola de CLIs y el **visor de cámara** del supervisor (`.sv-stage` y su HUD) se quedan oscuros porque son monitores (salida ANSI, vídeo); el mapa de Átomos de /estrategia conserva su estilo de mapa oscuro.
- `theme-color` `#f6f8f3` (o `#ffffff` en la portada).

## Cómo la adopta una página

```html
<head>
  …CSS propio…
  <link rel="stylesheet" href="/yk-frame.css?v=…">
</head>
<body data-yk-title="SECCIÓN" class="yk-claro"><!-- yk-claro sólo si su CSS era oscuro -->
  <header class="topbar" data-yk-replace>
    <nav data-yk-slot="left" data-yk-links>…enlaces a otras páginas…</nav>
    <button id="…" data-yk-slot="right">…acción…</button>
  </header>
  …
  <script src="/yk-frame.js?v=…"></script>
</body>
```

| Atributo | Efecto |
|---|---|
| `data-yk-slot="left\|right\|bottom"` | Mueve (no copia) el nodo, con sus manejadores, a ☰ / ▤ / ⌘. |
| `data-yk-links` | Una navegación movida se pinta como lista de enlaces del raíl. |
| `data-yk-stack` | Un bloque de acciones movido a ▤ se apila en columna. |
| `data-yk-replace` | La cabecera propia: se elimina después de mover lo marcado. |
| `data-yk-title` | La sección junto al logo. |
| `data-yk-zone="app"` (+ `data-yk-parent`) | Menú de secciones de la flota (`APP_NAV`), con el activo deducido. |
| `html[data-yk-no-frame]` | El marco no pinta nada (la sala de `/llamadas?room=…#token=…`, que se abre a terceros). |
| `body[data-yk-public]` | Fuerza el modo público aunque la página cargue `acceso.js`. |

El `?v=` lo sella `deploy.mjs` (patrón `/yk-*.js|css`). El marco se oculta al imprimir (`@media print`).

**Reparto**: lo que lleva a otra página o a otro sitio va a ☰ Opciones; lo que trabaja sobre la página va a ▤ Avanzado; los filtros de uso diario se quedan en el contenido.

## Marca blanca

El marco es el único enganche de la marca blanca del catálogo de admiranext.com/marcablanca (plataforma `yokup`): con `?marca=<id>` o `/marca <id>` carga `/yk-marca.js` con su mismo sello; sin marca no carga nada. Detalles en `docs/marca-blanca-yokup.md`.

## Inventario ITIL dentro del marco

`retailer` y `equipo-inventario` (`data-inventory-host="yokup"`) llevan el adaptador `inventory-frame.mjs` (+ `inventory-frame.css`), que espera a `yk:frame-ready` y monta en los raíles canónicos de `yk-frame`: las vistas del inventario (Catálogo, Conjunto 3D, Starbucks 3D, Referencias reales, ITIL · Yokup), el idioma y los enlaces en el contenedor de ☰ Opciones; el puente XpaceOS ↔ Yokup, la ayuda (`/help#inventory-frame`) y la Xperience en ▤ Avanzado; y los verbos `/inventario`, `/starbucks`, `/referencias`, `/ref`, `/equipo`, `/xpaceos` y `/yokup` en la consola local (`YkFrame.registerVerb`). Los paneles empiezan plegados. No hay un segundo shell: la copia de `xpace-shell` que traía el merge (`inventory-shell.js/.css`) se retiró y el guardián rechaza cualquier shell paralelo.

## APP_NAV y las rutas mudadas a admira.live

`APP_NAV` (Dashboard, Objetivos, Decisiones, Misiones, Tareas, Incidencias, Supervisor, Informes, Notificaciones, Highscore) es la fuente única del menú de la flota y la sigue usando el espejo de Pages, donde esas páginas existen. En **www.yokup.com** el guardián redirige con 301 a admira.live 16 de ellas (`MUDADAS_A_ADMIRA_LIVE` en `yokup-site-gate/src/index.js`): allí el menú de la barra sólo enseña lo que se sirve (Incidencias, Supervisor) y lo mudado pasa a ☰ Opciones, plegado en «EN ADMIRA.LIVE ↗», con enlace directo a `https://www.admira.live/…` (sin el salto del 301). Highscore, Equipo, Status y Panel de control hacen lo mismo. `yk-frame.js` lleva su copia (`MUDADAS_A_LIVE`) y el guardián del test comprueba que coincide con la del worker.

Las 16 páginas redirigidas no se adoptan ni se aclaran (no se ven en yokup.com); en el espejo reciben la barra clara nueva y su contenido de siempre.

## Páginas

Guardián: `yokup-site/shell-cuadratico.test.mjs` recorre todas las `.html`, descarta las 16 redirigidas leyéndolas del guardián y exige que cada una cargue `/yk-frame.css` (en el `<head>`) y `/yk-frame.js` una sola vez, sin `theme-color` oscuro, sin tokens oscuros sin `yk-claro` y sin alturas `100vh - Npx`; o que figure en `SHELL_EXCEPTIONS` con su motivo. Falla con una página nueva sin marco (lo prueba con una inventada) y con una excepción que ya no existe o que sí carga el marco. También vigila los glifos, el logo, el orden de la barra, el Esc, el modo público, la copia de `MUDADAS_A_LIVE`, el tema claro, la sala sin barra y que las cabeceras propias conservan sus ids.

**Con marco (27)**:
- Flota (con `acceso.js`): `incidencias`, `ticket`, `supervisor`, `agentes` (y `/carbono`), `agentDetail`, `intervencion`, `ideas`, `estrategia`, `circuitos`, `equipo-inventario`, `informe-incidencia`.
- Públicas: `index` (el globo sigue siendo el héroe; sus enlaces van a ☰ y «Entrar» a ▤), `retailer` y `retailer-incidencia` (login de portal y «Ver como» en ▤), `instalador` (Entrar/Salir e idioma en ▤), `superusuario`, `llamadas` (salvo la sala), `entrenamiento`, `demo-llamadas`, `contactanos`, `recuperar`, `help/`, `mcp/`, `mcp/portales`, `mcp/smith-instaladores`, `llamadas-mcp`, `app`.

**Decisiones sobre las públicas**: todas llevan el marco en modo público, que no carga `acceso.js` (las puertas de la regla 24 siguen sin él, `mcp-help-puertas.test.mjs`), no pide datos al API ni empuja al login y no expone la consola de la flota. `contactanos` dejó de montar la consola de CLIs para anónimos.

### Excepciones

| Página | Motivo |
|---|---|
| `trackandfield.html` | Juego a pantalla completa; excluido también del sellado por contrato. |
| `alta-punto.html`, `alta-instalador.html` | Inalcanzables: el guardián sirve `retailer.html` e `instalador.html` en esas rutas. |
| `entrar.html` | Huérfana: selector de rol antiguo que nada enlaza; candidata a retirarse. |
| `pruebas/*` | Evidencias congeladas de misiones antiguas. |
| `highscore-<sha>.html` | Artefacto ligado a un commit (lo redirige el guardián). |
| `/llamadas?room=…` | La sala para terceros va sin barra ni cabecera (`data-yk-no-frame`). |

## Pendiente conocido

- Las 16 páginas mudadas conservan su contenido oscuro en el espejo de Pages (fuera de alcance).
- `ticket`, `intervencion` (flota sin zona app) llevan en la barra las secciones de yokup.com (`NAV`), no el menú de la flota.
- La consola de CLIs de la flota sigue siendo densa (monoespaciada, 8–10 px): se aclaró, no se rediseñó.

---

**English.** **Rule: every page served by www.yokup.com uses the shared `yk-frame` and the light theme of the retailer portal.** The bar is the Galaxy canon (☰ Options + yokup● + section on the left, ▤ Advanced and ⌘ Expert on the right), with Options as the left rail, Advanced as the right rail and Expert at the bottom; panels start closed and Esc closes the focused panel. With a fleet session (pages that load `acceso.js`) the frame also mounts the section menu with counters, the project picker and the fleet CLI console; public pages (home, portals, help, MCP, contact, calls…) get the pure canonical bar, common Yokup links in Options and only the local console in Expert, with no API calls and never the fleet console. The portal palette lives once in `yk-frame.css`; `body.yk-claro` turns the old dark page tokens into the portal palette. Pages move their own controls with `data-yk-slot` / `data-yk-links` / `data-yk-stack` and drop their header with `data-yk-replace`. On www.yokup.com, menu entries the gate redirects to admira.live move to Options as direct ↗ links. `shell-cuadratico.test.mjs` fails when a served page skips the frame; 27 pages carry it and the exceptions are listed above.
