# Sensores de incidencias · #4210 / FLT-100941

Cada tick de dos minutos ejecuta `incidentSensors` antes del planificador de misiones, para evitar que sus llamadas IA retrasen la detección.
No modifica el score ni el despacho, avisos o cierre con evidencia de Yokup Desk.

| Señal | Condición | Clasificación |
| --- | --- | --- |
| Player | Feed fresco, `online === false`, al menos 300 segundos sin emisión | `campo`, `player_offline` |
| Agente | Misión en curso; máquina con telemetría fresca; agente previamente verificado y sin proceso durante 20 minutos | `digital`, `agent_offline` |

La ausencia de telemetría, una pausa explícita o un agente sin trabajo en curso no
constituyen una avería de agente. La identidad agrupa persona y máquina: otra
superficie viva de la misma persona evita el falso positivo. Las recuperaciones
registran un evento; este sensor no resuelve el expediente del Desk.

El ticket canónico conserva la deduplicación por recurso activo. La tabla
`incident_sensor_outbox` guarda clasificación, causa, payload, intentos y último
error. `external_id=rtc:<ticket_id>` hace idempotente el envío a
`POST https://data.yokup.com/api/desk/incidents`. El destinatario es fijo y la
credencial se obtiene del secreto existente `ADMIRA_TELEGRAM_PANEL_KEY`.
Se reintentan hasta 20 pendientes por tick. Los tickets ya cerrados que todavía
no se entregaron se marcan obsoletos; las entregas aceptadas no se repiten.

El contrato enviado es `{external_id,channel,title,description,triage,device}`.
`device` incluye id, nombre, especialidad y dirección; campo requiere coordenadas
numéricas reales. Si el feed no aporta coordenadas, el ticket existe y el envío
queda pendiente con `player_coordinates_required`; nunca se inventa una ubicación.
El estado comercial y su evidencia siguen perteneciendo a Desk:
**Abierta → En ruta → Resuelta**.

Verificación: `node --test incident-sensors.test.mjs` cubre ambos sensores, pausa,
telemetría antigua, 20 minutos de ausencia, recuperación, idempotencia y reintentos.
En producción, `/worker/beats` expone el latido `incidentSensors`; los errores de
entrega quedan allí y en la outbox. Para inspección administrativa:
`SELECT ticket_id,channel,kind,status,attempts,last_error,desk_id FROM incident_sensor_outbox`.
