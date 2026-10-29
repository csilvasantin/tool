# Ecommerce de mantenimiento · admira.app

`/ecommerce` gestiona material asociado a una incidencia de mantenimiento. Usa las cuentas, sesiones y permisos de los portales de instalador y comercio. No crea una tienda independiente ni una nueva identidad.

## Recorrido

1. Desde la ficha de intervención, **Solicitar material** abre `/ecommerce?role=installer&incident=<id>`. La ficha del comercio ofrece el mismo acceso con `role=retailer`.
2. El técnico asignado indica artículos, cantidades, compatibilidad, justificación, urgencia e indicaciones de entrega. El servidor obtiene comercio, equipo y destino de la incidencia; no acepta la titularidad que envíe el navegador.
3. El titular, un miembro `manager` o un superusuario de esa cuenta registra proveedor, referencia, precios unitarios, envío e impuestos. El catálogo sólo describe categorías; no presupone precio, stock ni disponibilidad de un proveedor.
4. El comercio aprueba el total completo. Sólo después puede registrar la referencia de un pedido realizado al proveedor.
5. El comercio o el técnico actualmente asignado registran recepción completa e instalación. Un pedido no cierra la incidencia ni modifica automáticamente el inventario ITIL. El cierre técnico y sus evidencias siguen en la ficha de mantenimiento.

Categorías iniciales: pantallas, cámaras, regletas/alimentación, altavoces/audio, players/conectividad, cables/soportes y otros repuestos. Importes en EUR, en céntimos enteros. Hasta 20 líneas y 100 unidades por línea. Sin integración de pago, compra automática, catálogo externo o correo a proveedores. La recepción parcial, devoluciones e incorporación al inventario quedan fuera de esta entrega.

## Estados y permisos

`requested → approved → ordered → received → installed`. Una solicitud pendiente puede rechazarse; una pendiente o aprobada puede cancelarse antes de registrar pedido. El técnico sólo puede cancelar su propia solicitud aún pendiente. Cancelación, rechazo, recepción e instalación requieren una nota. No se puede aprobar ni pedir material para una incidencia cerrada.

Sólo el técnico actualmente asignado ve las compras de sus incidencias. El comercio sólo ve las de sus establecimientos. La reasignación revoca el acceso del técnico anterior; el cambio de titularidad o vinculación del equipo invalida el acceso a la solicitud previa. Los lectores no escriben. La aprobación se decide en servidor, nunca por un parámetro de URL o el botón visible.

`request_key` y hash del contenido evitan duplicados en reintentos. Las actualizaciones requieren `version`; el cambio y su evento se guardan en el mismo lote transaccional. El historial se ordena por versión, incluso si varios eventos comparten milisegundo. El frontend conserva únicamente identificadores y hashes de operaciones pendientes en `sessionStorage`, no textos de incidencias ni presupuestos.

## API

Las rutas existen bajo `/api/installer` y `/api/retailer`, tras la autenticación y controles de origen/rol existentes:

- `GET /ecommerce/catalog`
- `GET /ecommerce/context?incident=<id>`
- `GET /ecommerce/requests?status=<estado>&incident=<id>&offset=<n>` (50 por página)
- `POST /ecommerce/requests` (incidencia, artículos, motivo, prioridad, entrega, clave de operación)
- `GET /ecommerce/requests/<id>` (detalle e historial)
- `POST /ecommerce/requests/<id>` (`action`, `version`, `request_key`, campos de presupuesto/pedido o nota)

Una URL de proveedor sólo se guarda como enlace HTTPS; el servidor nunca la descarga. No se incorporan claves nuevas.

## Publicación y validación

El cambio necesita **migración 0027, API y web**. Orden de despliegue:

1. Aplicar `api/migrations/0027_ecommerce.sql` a `yokup-db` por el procedimiento autorizado. Es aditiva y no modifica las tablas existentes.
2. Desplegar `yokup-api` con los handlers actualizados. La web de App usa `data.admira.app`, conservando cookies del mismo sitio.
3. Publicar los assets de `yokup-site`, las rutas limpias y el gate por el flujo existente. El build canónico incluye HTML, CSS y JS. No sustituir el deploy de App por el de Biz.
4. Con cuentas de prueba autorizadas: técnico asignado → solicitud → presupuesto y aprobación del comercio → registro de pedido de prueba → recepción → instalación. Verificar aislamiento entre comercios, reintentos, móvil y que la incidencia no se cierre. No realizar compras reales para probar.

Si se retira la función, quitar sus enlaces/handlers conservando las tablas e historial; no borrar solicitudes.

Pruebas nuevas: `node --test api/ecommerce.test.mjs yokup-site/ecommerce.test.mjs`. Se ejecutan con SQLite en memoria y cuentas sintéticas; no escriben producción. Las suites existentes de portales, evidencias, autenticación y gate cubren las integraciones afectadas. La comprobación visual y la validación autenticada en producción requieren un entorno de preview/despliegue disponible; no se sustituyen por pruebas estáticas.
