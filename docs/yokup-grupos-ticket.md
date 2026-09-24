# Un grupo de Telegram por incidencia

Fecha: 24 de septiembre de 2026. Misión `DCL-40b60d310c0a326c782cc821` (#357).

## Petición y estado de esta entrega

Carlos propone que cada ticket tenga un grupo privado con propietario del retail,
instalador y project manager. El PM será de silicio por defecto y podrá ser de
carbono. El grupo termina su actividad cuando se resuelve la incidencia.

Este documento define el contrato de implementación. **La funcionalidad de grupos
no está implementada ni desplegada.** Existe un ensayo privado por Telegram del
reinicio del router; no equivale a un PM conversacional para tickets reales.
Falta elegir el mecanismo de creación de grupos: cuenta de servicio de Telegram
conectada a Yokup o grupos creados manualmente y vinculados al ticket.

## Las tres partes

| Parte | Responsabilidad | Identidad necesaria |
| --- | --- | --- |
| Propietario del retail | Confirma el problema, facilita acceso y valida el resultado | Cuenta autorizada sobre el establecimiento e identidad de Telegram vinculada |
| Project manager | Coordina diagnóstico, cita, intervención y conformidad | Bot de Yokup por defecto; usuario autorizado y nombrado cuando asume un humano |
| Instalador | Acepta la intervención, informa y aporta evidencias de reparación | Instalador asignado al ticket e identidad de Telegram vinculada |

Son tres roles de negocio. En modalidad humana el bot permanece como integración
técnica, por lo que pueden aparecer cuatro participantes, además de la cuenta que
crea el grupo. No se debe prometer un grupo con exactamente tres cuentas.

Un nombre visible o un número de teléfono no acredita un rol de Telegram. La
vinculación requiere una sesión de Yokup autorizada y una comprobación de la
identidad de Telegram. Cambiar de instalador o PM revoca la participación anterior
según la política del expediente; se registra quién hizo el cambio.

## Flujo del ticket

1. Detección o alta de incidencia: Yokup conserva el expediente canónico y solicita
   un grupo privado exclusivo, con nombre `Yokup · <referencia>`. Una misma petición
   repetida debe recuperar el grupo existente.
2. Incorporación: propietario y PM entran primero. Si aún no hay instalador
   asignado, se muestra «pendiente de instalador»; no se invita a todos los candidatos.
   Se incorpora únicamente al profesional finalmente asignado.
3. Inicio: mensaje fijado con síntoma, equipo, responsables, estado, siguiente paso
   y enlace al expediente autorizado. Nunca contraseñas, credenciales ni datos de
   otros establecimientos.
4. Coordinación: diagnóstico, propuesta y aceptación de cita por ambas partes.
   Mensajes o notas de voz pueden aportar contexto; una interpretación del bot no
   sustituye la aceptación explícita de una cita, coste o actuación.
5. Resolución técnica: el instalador registra reparación y evidencia. El ticket
   queda **pendiente de conformidad** y el grupo continúa abierto.
6. Validación: el propietario confirma que funciona. Solo entonces se cierra el
   ticket y se solicita el cierre operativo del grupo. El silencio no confirma.
7. Cierre: resumen final, revocación de invitaciones emitidas por Yokup y restricción
   de escritura para miembros ordinarios; se conserva el historial. Telegram no
   garantiza solo lectura para propietarios y administradores. No se elimina el grupo.
8. Disconformidad o recurrencia: se mantiene abierto o se reabre, según el estado
   del ticket. Si Yokup genera un ticket de seguimiento, este tendrá su propio
   grupo enlazado al anterior, sin reutilizarlo para otra incidencia.

El backend ya distingue `awaiting_rating`, `closed` y `reopened` en `syncCalls`.
La implementación debe consumir esos estados y la valoración real; no mantener
un segundo estado de resolución independiente en Telegram.

## PM de silicio y relevo a carbono

La ficha del ticket mostrará `PM: Silicio · Asistente Yokup` y la acción
«Asignar PM humano». Un operador autorizado elige a la persona, que acepta el
relevo. Hasta esa aceptación el bot conserva la coordinación; después registra
resumen, decisiones, evidencias y pendientes y deja de emitir instrucciones
autónomas. Puede seguir registrando mensajes y enviando avisos deterministas.

La acción «Devolver al PM de silicio» también es explícita y queda auditada. Debe
existir un solo responsable vigente y una revisión de asignación para evitar que
una respuesta antigua del bot se publique después de un relevo.

El primer bot puede coordinar estados, recordatorios y enlaces. Diagnóstico libre,
comprensión de notas de voz de grupo y consulta de procedimientos requieren una
integración conversacional adicional. Las cápsulas de Pixeria etiquetadas como
formación no son automáticamente procedimientos aprobados para intervenir equipos.

## Creación de grupos: decisión pendiente

Telegram reserva `messages.createChat` y `channels.createChannel` a cuentas de
usuario. El token de @YokupSoporteBot permite administrar grupos existentes, pero
no crearlos mediante Bot API.

- **Creación automática:** cuenta de servicio de Yokup conectada mediante MTProto,
  con sesión custodiada en backend y permisos del bot establecidos al crear cada
  grupo. Alta de cuenta y autenticación por su responsable, límites de Telegram y
  recuperación de creación incierta antes de reintentar.
- **Arranque manual:** un responsable crea el grupo, añade el bot como administrador
  y lo vincula mediante un código temporal emitido desde el expediente autorizado.
  El sistema valida tipo de chat, administrador que vincula, permisos del bot y
  exclusividad de grupo/ticket antes de publicar información.

Los temas de un grupo compartido no proporcionan aislamiento de miembros por
ticket y no sustituyen los grupos privados solicitados.

## Contrato técnico y aceptación

Ampliar el backend de incidencias y el centro `/llamadas`, no el ensayo privado
del router. Reutilizar el único consumidor de `getUpdates` y su bloqueo en
`api/src/installer-telegram.js`; un segundo consumidor perdería o duplicaría eventos.

Persistir relación única ticket/grupo, roles con identidad verificada, PM vigente
y revisión, estado de aprovisionamiento, estado de cierre y último error. Mantener
una bandeja persistente con deduplicación por actualización de Telegram y una cola
de acciones recuperables. No acreditar un envío o una restricción si Telegram no
los confirma; mostrar «cierre pendiente» cuando falle el cierre operativo.

Los comandos del chat deben pasar las mismas reglas de autorización y transición
del expediente que el portal. El texto libre no autoriza asignaciones, gastos,
acceso a otro ticket ni cambios de responsable. Auditar origen, actor, versión y
resultado de cada transición. Una respuesta incierta al crear un grupo necesita
reconciliación antes de lanzar otra creación.

Antes de activar el circuito, comprobar:

- Un ticket tiene un solo grupo y un grupo no sirve para dos tickets.
- No se filtran datos entre retailers; invitaciones caducan y se revocan al cerrar.
- Un tercero no puede reclamar un rol, enlazar un grupo o cerrar una incidencia.
- Resolver como instalador conserva el grupo abierto hasta conformidad del retail.
- Un PM humano puede tomar y devolver control sin respuestas simultáneas del bot.
- Reintentos, reinicios y actualizaciones repetidas no duplican transiciones.
- Fallos de permisos, expulsión del bot, migración de grupo y cambio de instalador
  quedan visibles y no se interpretan como éxito.
- Prueba real con participantes autorizados: creación/vinculación, conversación,
  reparación, conformidad y cierre con historial conservado.

Fuentes verificadas el 24 de septiembre de 2026:

- https://core.telegram.org/method/messages.createChat
- https://core.telegram.org/method/channels.createChannel
- https://core.telegram.org/bots/api#setchatpermissions
- https://core.telegram.org/bots/api#createchatinvitelink
- https://core.telegram.org/bots/api#revokechatinvitelink
