# Portal del instalador · primera entrega funcional

Responsable: OraculoMacMini (Codex APP). Revisión técnica: WozniakGrokBot.
Misión: DCL-e628ddbe6676afff86d0b307 · Hoy #183, 14-sep-2026.
Antecedentes de Woz: FLT-100423 y FLT-100427; revisión recibida en bandejas #3297 y #3306, coordinación FLT-100433.

## Producto publicado

`https://www.yokup.com/portal` y `/instalador` sirven el mismo portal. El alias
`/alta-instalador` también conduce al nuevo formulario. Alta internacional,
ES/EN, país y ciudad, coordenadas elegidas en mapa o geolocalización, seis
especialidades, disponibilidad editable, bandeja privada, aceptación exclusiva
y parte de reparación. D1 persiste cuentas, dispositivos, eventos, incidencias,
avisos y sesiones. Las tablas están aisladas de las tablas demo antiguas.

Los avisos persistidos en el portal son reales. Las notificaciones del navegador
requieren permiso y mantener la página abierta; no hay Web Push en segundo plano
ni correo/SMS/Telegram al instalador en esta versión. No hay equipos, instaladores,
avisos, valoraciones ni contadores de demostración en producción.

## Estado de la conexión Admira

**Pendiente de identificar el emisor de producción y configurar su secreto.**
Tanto Carlos como Woz han sido consultados. Woz confirma que su entrega anterior
era un stub en memoria y no dispone de credenciales de la flota real.
La API responde 503 a la ingesta mientras falte `INSTALLER_ADMIRA_SECRET`.
El portal muestra claramente ese estado. No se ha conectado una flota ni se ha
presentado una simulación como incidencia de un dispositivo real.

## Contrato de integración propuesto, aún por conectar al emisor Admira

`POST https://data.yokup.com/api/installer/events`

Headers:
- `X-Admira-Timestamp`: segundos Unix, ventana absoluta de 300 segundos.
- `X-Admira-Signature`: HMAC-SHA256 hexadecimal minúsculo de
  `<timestamp>.<cuerpo JSON exacto>`, con `INSTALLER_ADMIRA_SECRET`.
- `Content-Type: application/json`.

```json
{
  "event_id": "admira-event-unique-id",
  "type": "fault",
  "occurred_at": "2026-09-14T15:00:00.000Z",
  "title": "Pantalla sin señal",
  "device": {
    "id": "admira-device-stable-id",
    "name": "Pantalla del establecimiento",
    "address": "Dirección de intervención",
    "latitude": 41.3874,
    "longitude": 2.1686,
    "skill": "screen",
    "timeout_seconds": 900
  }
}
```

`type` es `heartbeat` o `fault`. `skill` es `screen`, `player`, `network`, `audio`,
`sensor` o `kiosk`. Coordenadas numéricas WGS84. La fecha del ejemplo debe
sustituirse por la real; se rechazan fechas de más de 24 horas o más de 60 segundos
hacia el futuro. El timeout admite 120–86400 segundos, 900 por defecto. El emisor
debe enviar latidos más frecuentes que el timeout. El cron cada dos minutos abre
una incidencia cuando falta el latido de un dispositivo previamente conocido.
El retraso de detección incluye hasta dos minutos del barrido y la cola del runtime.

Sin `heartbeat`/`fault` inicial no se descubre un equipo. El alta de inventario,
pausas por mantenimiento, retirada de dispositivos y monitorización operativa de
la cola requieren completar el adaptador real de Admira.

## Garantías y estados

- Radio **estrictamente menor de 40 km**, conforme a la frase de Carlos; distancia
  geodésica Haversine, radio terrestre 6371.0088 km. No es distancia de conducción.
- Prefiltro SQL por caja geográfica e índice `(available,latitude,longitude)`;
  después círculo exacto. Polos y antimeridiano cubiertos por pruebas.
- Solo instaladores disponibles y con especialidad coincidente reciben avisos.
- Incidencia `open → assigned → resolved`. Índice parcial único por dispositivo
  mientras `status != 'resolved'`, con CHECK de los tres estados permitidos.
- `UPDATE ... WHERE status='open'` exige una fila afectada; el segundo aceptante
  recibe 409. El servidor vuelve a comprobar distancia/especialidad/disponibilidad.
- Solo el titular puede resolver, con parte de 20–2000 caracteres. La dirección
  y coordenadas del equipo se muestran únicamente al instalador asignado.
- UNIQUE `(incident_id,installer_id)` evita avisos repetidos. El barrido repara
  avisos pendientes sin reabrir incidencias resueltas de un mismo episodio.
- `event_id` inmutable con hash del cuerpo: contenido distinto devuelve 409.
  Registro de recepción más lote atómico de efectos; reintentos tras una caída
  pueden finalizar efectos pendientes. Un evento ya aplicado no los repite.
- `last_seen` es monotónico por dispositivo. Una fecha anterior no pisa ubicación,
  timeout ni latido, ni crea una incidencia de fallo retrasada. El barrido vuelve
  a comprobar el mismo latido antes de abrir una desconexión.
- Cuentas con PBKDF2-SHA256 (100000 iteraciones, salt aleatorio), token de sesión
  aleatorio de 256 bits, solo hash en D1 y cookie Secure/HttpOnly/SameSite=Strict.
  Limitación por IP y correo, validación de origen en mutaciones, consultas SQL
  parametrizadas, sin datos privados en endpoints públicos ni localStorage.
- Bandeja: 100 avisos recientes; los contadores se calculan sobre todo el histórico.

## Operación

Aplicar la migración aditiva antes de publicar el Worker:

```sh
cd api
npx wrangler@4.119.0 d1 execute yokup-db --remote --file migrations/0001_installer_portal.sql
npx wrangler@4.119.0 deploy
```

Configurar el secreto únicamente cuando esté identificado el emisor:
`wrangler secret put INSTALLER_ADMIRA_SECRET`, por stdin. No guardar valores en
Git ni en informes. La rotación es coordinada con el emisor (un secreto activo);
reintentar eventos con el mismo `event_id` y cuerpo, firmados con timestamp actual.
Sincronizar reloj del emisor. Una firma caducada no se considera un fallo del equipo.

Pruebas: `node --test api/installer-portal.test.mjs` y suite del gate. El despliegue
del sitio usa `yokup-site/deploy.mjs`, desde origin/main limpio, con la identidad
OraculoMacMini/MacMini. Las migraciones no borran ni modifican las tablas antiguas.

## Evidencia y siguientes entregas

Verificados en SQLite: auth/CSRF, privacidad, límites, geografía, duplicados,
claim concurrente, cierre por titular, retransmisiones, latidos, firmas,
polos/antimeridiano y revocación de elegibilidad al editar perfil.
En navegador con base **local**: alta, persistencia tras recarga, recepción de
fallo firmado a 0,3 km, aceptación, dirección privada, parte, estado resuelto,
ES/EN y diseño móvil de 390 px. El ensayo no tocó datos de producción.

Antes de operar con freelancers y dispositivos reales: conectar el emisor Admira,
validar su payload con un equipo piloto, elegir proveedor de avisos externos,
verificar correo y recuperación de acceso, definir verificación profesional,
condiciones de trabajo y remuneración, y cerrar el flujo de inventario/retirada.
La primera entrega no afirma resolver esos pasos de operación.
