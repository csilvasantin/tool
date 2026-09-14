# Recuperación y superusuario de portales

Misiones #341 y #366 · DCL-ea2a760d10a0e56c485fee08 · 14 septiembre 2026.

## Acceso Google

Ambos portales ofrecen «Continuar con Google» en Crear cuenta y Entrar. `/api/portal-access/google/login` verifica Google y resuelve el rol en el servidor. La dirección `csilva@admira.com` (con `hd=admira.com`) es la cuenta principal. Las otras cuentas necesitan una autorización activa en `portal_superusers`; quedan vinculadas al `sub` de Google en el primer acceso. No se acepta un rol ni un email declarados por el cliente. `/superusuario` es el destino tras autenticarse, no otro formulario de acceso.

Solo la cuenta principal puede dar o revocar permisos desde la sección Superusuarios. Los cambios se auditan en `portal_role_audit`. Revocar elimina sus sesiones y cada petición administrativa vuelve a comprobar la autorización. No se permite revocar la cuenta principal. Las cuentas autorizadas deben usar Gmail o Google Workspace, con titularidad acreditada por Google.

Para un usuario habitual, Google inicia una sesión del portal elegido. Una cuenta existente se vincula por dirección acreditada a un `sub` estable; no se duplican perfiles ni se permite vincular otra identidad Google a la misma cuenta. Una cuenta nueva completa su perfil: nombre para retailer; ubicación y especialidades para instalador. No se pide contraseña durante el alta Google. Un ticket de 15 minutos, ligado al navegador y al portal, permite guardar el perfil una sola vez. Las cuentas nuevas no tienen una contraseña compartida o predeterminada: pueden usar recuperación para establecer una si lo desean. Se conservan las cuentas de ambos portales separadas.

Rutas nuevas: `POST /api/portal-access/google/login` recibe `credential`, `kind` e `intent` (`login` o `register`); devuelve `role:superuser` y destino `/superusuario`, el perfil autenticado, o `needs_profile` con ticket. `POST /api/portal-access/google/register` recibe ticket, kind y perfil; ignora cualquier email o rol de esos datos. `GET /api/portal-admin/superusers` lista autorizaciones y `POST` aplica `grant|revoke` con email, únicamente desde la sesión principal. Nunca hay un endpoint público para concederse permisos.

Cada login solicita un challenge aleatorio de cinco minutos ligado a cookie HttpOnly y nonce. Se verifica RS256 mediante las claves JWK oficiales de Google (cacheadas cinco minutos), issuer, audience, expiración, antigüedad, email_verified y nonce. El challenge se consume una vez. La sesión administrativa se guarda con hash del token, caduca a la hora y usa cookie Secure/HttpOnly/SameSite=Strict. Las escrituras exigen un Origin permitido. SDK de Google cargado solo al pedir acceso, no al abrir enlaces de recuperación.

Referencia: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token . Para recuperación con Google, solo se aceptan emails cuyo control acredita Google: Gmail o cuentas Workspace con `hd`; `email_verified` aislado en un correo externo no basta.

Rutas de acceso: `GET /api/portal-access/config`, `POST /google/challenge`, `POST /google/admin`, `POST /google/recover` (bajo esa misma base). Los POST de Google reciben credential; el backend nunca toma el email del formulario como identidad autenticada. El secreto OAuth de cliente no es necesario para este flujo GIS de ID token; no es un flujo OAuth para delegar acceso MCP.

## Recuperación

Ambos portales enlazan a `/recuperar?portal=installer|retailer`. El usuario puede verificar con Google la misma dirección de una cuenta existente. Eso emite un token de recuperación para ese titular y ese portal; no da acceso de superusuario. `POST /password/complete` recibe kind, token y password (12–128 caracteres).

El token tiene 256 bits aleatorios, solo se persiste su hash, dura 15 minutos y se consume atómicamente. Un cambio de contraseña invalida todas las sesiones del portal, revoca sus tokens MCP e invalida otros enlaces de recuperación del mismo titular. Dos cambios concurrentes no consumen el mismo enlace. La creación de sesiones de login comprueba que el hash de contraseña no haya cambiado durante la autenticación.

El enlace de correo usa el fragmento `#token=...`, se retira del historial al cargar y la página usa `no-referrer`. La contraseña nueva no se guarda en el navegador ni se imprime en logs. No se cambia ninguna contraseña durante el despliegue.

### Envío por correo pendiente de configurar

Adaptador implementado para Resend: `POST /api/portal-access/password/request` con kind/email. Requiere secretos `RESEND_API_KEY` y `PORTAL_MAIL_FROM` (por ejemplo, `Yokup <acceso@yokup.com>` una vez verificado el dominio). No hay valores de estos secretos en el repositorio. Referencia del proveedor: https://resend.com/docs/api-reference/emails/send-email . Es necesario activar una cuenta, verificar el dominio remitente y crear una clave privada de envío. No se ha contratado servicio ni configurado DNS como parte de esta entrega.

Mientras falte configuración, config devuelve `email_recovery:false`, el botón de envío está deshabilitado y la interfaz indica que el correo está pendiente de activar. No se simula ningún email enviado. La vía Google funciona de forma independiente para cuentas compatibles. Los correos que no usan Google requieren activar Resend para completar la recuperación autónoma.

Una vez configurado, el endpoint devuelve el mismo mensaje para cuentas existentes e inexistentes; nunca devuelve el token. Las solicitudes se limitan a 3/hora por correo/portal y 30 operaciones de acceso por IP en 15 minutos. Los errores del proveedor se registran como un código fijo sin cuerpos ni tokens y no revelan la existencia de una cuenta. Una respuesta genérica no acredita entrega efectiva al buzón. Se deben vigilar los errores de entrega y probar el remitente con un correo autorizado antes de declarar el canal operativo.

## Vista conjunta y asignación

`GET /api/portal-admin/dashboard` lista instaladores, retailers, establecimientos e incidencias en curso, con búsqueda y páginas de hasta 50 filas por bloque. Solo selecciona campos operativos; no devuelve contraseñas, salts, sesiones ni tokens de agentes. `GET /candidates?site_id=...&skill=...` busca profesionales próximos a un establecimiento; `?incident_id=...` aplica la especialidad del dispositivo. Se muestran los 100 más cercanos cuando hay más candidatos.

`POST /api/portal-admin/assign` recibe incident_id, installer_id y request_key. Solo asigna incidencias abiertas a técnicos disponibles, de la especialidad y a distancia estrictamente menor de 40 km. La transacción vuelve a comprobar que disponibilidad, coordenadas y especialidad no hayan cambiado. La asignación, el aviso al instalador y la auditoría se guardan en una operación atómica. El identificador de la asignación impide atribuir a un intento perdedor el resultado de otro concurrente. Reintentos con la misma clave recuperan el recibo; cambiar sus argumentos devuelve 409.

El aviso queda en el portal del técnico y la asignación aparece en el portal del comercio por los mismos datos de incidencia. No se inventa confirmación del técnico, reparación ni valoración del cliente. El superusuario no elimina esas validaciones y no tiene herramientas MCP administrativas en esta entrega.

## Despliegue y verificación

Aplicar migraciones aditivas 0007 y 0009 (con 0008 de radio de instaladores) antes de desplegar el Worker; preserva las cuentas existentes. El cron limpia challenges/sesiones caducadas y tokens de recuperación antiguos. Publicar los enlaces y las nuevas páginas mediante el script oficial de Yokup.

Pruebas: `node --test api/*.test.mjs`; verifican firma y claims Google, rechazo de otros correos, challenges de un solo uso, caducidad, recuperación de ambos tipos de cuenta, revocación de sesiones/MCP, aislamiento entre portales, acceso privado, candidatos y asignación concurrente/auditada. Vista conjunta y asignación comprobadas con datos ficticios en SQLite local. La prueba positiva en Google real debe hacerse con la cuenta autorizada del usuario; una sesión local de prueba no acredita un login real de csilva@admira.com.

Pruebas de #366: registro/login Google de ambos portales, permisos concedidos y revocados, protección de cuenta principal, identidad inmutable, rechazo de rol/email manipulados, alta incompleta, tickets robados/caducados/reutilizados y creación concurrente. La UI se prueba con Google simulado únicamente en SQLite local; producción verifica el botón real sin suplantar al usuario.
