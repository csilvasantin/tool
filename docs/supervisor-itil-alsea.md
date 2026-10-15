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
