# Supervisor de admira.app · Alsea

El centro operativo de `/supervisor?xpacio=alsea-sbux-021` lee el inventario maestro de Yokup. Lista los CIs activos, permite buscar por identidad y ubicación, filtrar por categoría o atención, consultar garantía, mantenimiento, dependencias e incidencias abiertas y exportar el inventario a CSV. «Ver equipo» abre un detalle y enlaza la ficha canónica y el portal de gestión. No crea, retira ni modifica equipos automáticamente.

El estado «Operativo» es el de la ficha ITIL: no acredita disponibilidad ni reproducción física. Cada tarjeta indica que no tiene observación vinculada. Un router con origen `simulated` lleva la indicación SIMULADO, tanto en tarjeta y detalle como en CSV. No se conecta un mando a un CI por coincidencia de nombre.

La Insta360 corresponde al laboratorio de Gran de Gràcia. Se presenta por separado, conserva sus enlaces a incidencias e imágenes y no se atribuye a los equipos de Alsea. La publicación o lectura con más de 90 segundos se marca caducada; un fallo de transporte retira la indicación de estado actual. Las fechas se presentan en Europe/Madrid. La hora de lectura no se atribuye al JPEG, que puede haberse publicado antes.

## Acceso y publicación

`GET /supervisor/itil?xpacio=<id>` exige sesión válida. La lectura saneada permite al supervisor autorizado en el directorio (capacidad de cambio de proyecto) y a la entrada oficial de agentes ya habilitada para las fichas ITIL. Usuarios ordinarios reciben 403 antes de consultar el maestro. El servidor utiliza el service binding `INCIDENT_DESK` y el contrato `publicCi`: no devuelve serie, facturas, correos ni claves. No hay credenciales ni permisos en localStorage.

Publicar el API con `yokup-rtc/deploy.sh` desde main limpio, tras contrastar el bundle vivo con el baseline. Para la web, `YOKUP_DEPLOY_AGENT=OraculoMacMini YOKUP_DEPLOY_MACHINE=MacMini node yokup-site/deploy.mjs --admira-app-only` publica Pages y verifica admira.app, sin republicar el guardián de yokup.com. El modo existente sin ese argumento conserva su comportamiento.

## English

The Supervisor reads Yokup's canonical ITIL inventory. Search, category and attention filters, asset details, dependencies, warranty and maintenance flags, incident counts and CSV export use the live inventory response. Registry status is explicitly separate from physical availability. Simulated network data is labeled. Camera evidence belongs to the Gran de Gràcia lab, with a 90-second freshness threshold and a connection-loss state. No remote control or automatic remediation is inferred from an inventory record.

The inventory endpoint enforces server-side session and supervisor authorization, with the existing official agent account allowed sanitized read access only. Private lifecycle fields remain in the canonical detail view. The app-only deployment option updates Pages while preserving yokup.com's independently pinned release.


## Verificación publicada · 15 octubre de 2026

PR #80 · centro operativo ITIL de Alsea integrada en `75a8880` · inventario y estados verificables. Web `v.15.10.2026.r5.20:15`, API `v.15.10.2026.r1.20:14`. El guardián independiente de yokup.com conserva el commit y versión previos.

Navegador headless de producción: 21 registros, siete pantallas y un TPV; filtros, búsqueda, detalle, CSV y móvil de 390 px sin errores de página. La ficha completa del TPV usa `PDG103-TPV-01`. API real: lectura oficial de agentes 200, anónimo 401, identificador inválido 400, tienda inexistente 404, POST 405. Usuarios ordinarios se verifican con pruebas unitarias de permiso cerrado antes de consultar el maestro. Pruebas: 1664 web pasan; 1057 API pasan y una omitida.

El laboratorio queda con observación caducada. El monitor y publicador no estaban ejecutándose. El preflight de reanudación verificó que no había marca STOP, pero detectó la inclinación de la cámara fuera de la calibración de esta mañana: no arrancó procesos ni movió el objetivo. Carlos debe elegir si restaurar el MBP16 o definir el nuevo objetivo. No se ejecutó Bugito ni se abrió/cerró ninguna incidencia física.

La demo demuestra gestión del inventario y acceso a fichas; el mando físico del TPV y la correlación automática de todos los CIs con telemetría siguen sin estar verificados. Evidencia saneada en `docs/evidence/supervisor-itil-2026-10-15/`.
