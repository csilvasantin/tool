# Duración e informe de incidencia (Yokup)

Encargo de Carlos (01-10-2026) sobre la ficha `/ticket?id=INC-…` (p. ej. XpaceOS ·
Starbucks Alsea · Paseo de Gracia 103).

## 1. Duración

- **Qué es**: de la creación (`created_at`) al cierre (`resolved_at`; en una eliminada,
  `closed_at`). Mientras la incidencia sigue abierta, es el tiempo transcurrido **en vivo**.
- **Dónde se ve**:
  - Ficha `/ticket`: tarjeta **Fechas** → «⏱ Duración 31 s» si está finalizada (antes ponía
    «Abierta hace 31s», que hacía parecer viva una incidencia cerrada) o «⏱ Abierta hace
    4 min 12 s», que corre cada segundo. Además, píldora «⏱ Duró 31 s» / «⏱ Abierta …» junto
    a estado y gravedad.
  - Bandeja `/incidencias`: chip «⏱ Duró 2 h 14 min» / «⏱ Abierta 25 min» en cada tarjeta y
    línea «Duración» en el detalle desplegable.
  - Informe `/informe-incidencia`: KPI principal.
- **Formato**: `31 s` · `4 min 12 s` · `25 min` · `2 h 14 min` · `2 d 4 h`.
- **Fuente única**: `yokup-site/yk-duracion.js` (`window.YkDuracion`; CommonJS en pruebas).
  Acepta marcas en ms o en segundos (umbral 4102444800, igual que `fecha()`).

## 2. «Enviar informe»

- **Botón** «📄 Enviar informe» en **Acciones** de la ficha. Abre una hoja con: Abrir informe,
  Imprimir / PDF, Enviar por correo, Copiar enlace y (si el sistema lo permite) Compartir….
- **Nada se envía automáticamente.** «Enviar por correo» abre un `mailto:` **sin destinatarios**
  con asunto, resumen, duración y enlace; quien lo envía elige a quién.
- **Vista compartible**: `https://www.yokup.com/informe-incidencia?id=INC-…` (tras el acceso
  con Google de Yokup, como el resto del helpdesk). `&print=1` abre directamente el diálogo
  de impresión cuando el informe está compuesto.
- **Contenido**: cabecera AdmiraNeXT · yokup con nº de informe, sello de estado, proyecto,
  establecimiento y gravedad; KPIs (duración total, primera respuesta, SLA de 2 h con anillo,
  actividad); datos (proyecto · establecimiento, origen, gravedad, equipo, estado, duración);
  **Resumen IA** (mismo `POST /ai-summary` que el botón «Resumen IA»; si la ficha lo generó en
  los últimos 30 min se reutiliza vía `localStorage`); línea de tiempo con barra proporcional
  y el **Historial** completo (adjuntos incluidos); resolución; responsable; fechas clave y firma.
- **En pantalla**: revelado animado escalonado, sello que «cae», contadores, barra que crece y
  Resumen IA con efecto de escritura. Respeta `prefers-reduced-motion`.
- **Impresión / PDF**: hoja A4 (`@page`), colores exactos, sin barra ni animaciones; el cuerpo
  fluye en una columna para no partir rejillas entre páginas (un caso típico cabe en 2 páginas).
- **Descargar HTML**: copia autónoma del informe ya pintado (sin scripts), útil para quien no
  tiene acceso a Yokup.

## 3. Equipo · inventario ITIL (01-10-2026)

La sección de datos del informe añade «Equipo · inventario ITIL»: enlace a la ficha
(`/equipo-inventario?ticket=`), nº de serie, modelo, insignia y detalle de la garantía, fecha de
compra y proveedor, con «sin dato» si falta; si el equipo no está en el inventario, lo dice. El
correo (`mailto:` sin destinatarios) lleva una línea «🗂 Equipo: …». Datos: `GET
api.yokup.com/ticket/equipo?id=` (ver `docs/itil-yokup.md`).

## Contratos y límites

- Datos: `GET api.yokup.com/ticket?id=` y `POST /ai-summary` (ambos con sesión). No hay
  endpoint nuevo ni cambio de backend.
- Todo dato del ticket entra con `textContent`/`esc()`; nada se interpreta como HTML.
- Pruebas: `yokup-site/informe-incidencia.test.mjs`.
- Pendiente / no incluido: el enlace no es público (requiere la sesión de Yokup); no hay
  envío de correo desde el servidor (deliberado).
