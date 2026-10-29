# Ecommerce de mantenimiento · admira.app

`/ecommerce` presenta el catálogo público de Elipsys con la identidad visual de Admira y gestiona material asociado a una incidencia de mantenimiento. La consulta de productos es pública; las solicitudes usan las cuentas, sesiones y permisos de los portales de instalador y comercio.

## Catálogo importado

Snapshot del 29 de octubre de 2026, 19:49 UTC, de `https://clientes.elipsys.es/`, enlazado desde `https://www.elipsys.es/`. Se capturaron 24 páginas públicas, 1.056 filas y **968 referencias únicas por SKU**. La paginación del proveedor puede variar; no se presenta como inventario completo ni sincronizado en tiempo real.

| Familia | Referencias únicas |
| --- | ---: |
| Monitores | 174 |
| Televisores | 273 |
| LED | 37 |
| Audio | 96 |
| Soportes | 358 |
| Videoconferencia | 30 |

`yokup-site/ecommerce-elipsys.json` conserva fecha, páginas de origen, referencia, marca, nombre, atributos técnicos e imagen. Duplicados por SKU se unifican y se conservan sus familias. Los nombres que sólo indicaban la marca se completan con tipo, referencia y atributos presentes en origen. No se importan cuentas, precios ni existencias: en origen requieren registro. La interfaz indica **Bajo presupuesto** y disponibilidad pendiente.

El catálogo permite buscar por referencia, marca y características; filtrar por familia, marca, tamaño y funcionamiento; consultar una ficha; y preparar una selección. Las imágenes se cargan directamente del dominio público del proveedor, con `no-referrer` y alternativa si fallan. Los enlaces externos sólo llevan el SKU, nunca datos de la incidencia. El snapshot no se actualiza automáticamente.

La selección guarda únicamente identificadores públicos y cantidades en `sessionStorage`. Al entrar en mantenimiento se recupera y se convierte en líneas editables con proveedor, SKU y especificaciones. No se envía una solicitud hasta que el usuario elige una incidencia, completa la justificación y pulsa enviar. Crear una solicitud elimina de la selección sólo las referencias utilizadas. Regletas, cables y otros materiales ausentes se pueden añadir manualmente.

## Recorrido

1. Desde la ficha de intervención, **Solicitar material** abre `/ecommerce?role=installer&incident=<id>`. La ficha del comercio ofrece el mismo acceso con `role=retailer`.
2. El técnico asignado indica artículos, cantidades, compatibilidad, justificación, urgencia e indicaciones de entrega. El servidor obtiene comercio, equipo y destino de la incidencia; no acepta la titularidad que envíe el navegador.
3. El titular, un miembro `manager` o un superusuario de esa cuenta registra proveedor, referencia, precios unitarios, envío e impuestos. Las referencias importadas no presuponen precio, stock ni disponibilidad.
4. El comercio aprueba el total completo. Sólo después puede registrar la referencia de un pedido realizado al proveedor.
5. El comercio o el técnico actualmente asignado registran recepción completa e instalación. Un pedido no cierra la incidencia ni modifica automáticamente el inventario ITIL. El cierre técnico y sus evidencias siguen en la ficha de mantenimiento.

Categorías de material: pantallas, cámaras, regletas/alimentación, altavoces/audio, players/conectividad, cables/soportes y otros repuestos. Importes en EUR, en céntimos enteros. Hasta 20 líneas y 100 unidades por línea. Sin integración de pago, compra automática, API comercial de Elipsys ni correo a proveedores. La recepción parcial, devoluciones e incorporación al inventario quedan fuera de esta entrega.

## Estados y permisos

`requested → approved → ordered → received → installed`. Una solicitud pendiente puede rechazarse; una pendiente o aprobada puede cancelarse antes de registrar pedido. El técnico sólo puede cancelar su propia solicitud aún pendiente. Cancelación, rechazo, recepción e instalación requieren una nota. No se puede aprobar ni pedir material para una incidencia cerrada.

Sólo el técnico actualmente asignado ve las compras de sus incidencias. El comercio sólo ve las de sus establecimientos. La reasignación revoca el acceso del técnico anterior; el cambio de titularidad o vinculación del equipo invalida el acceso a la solicitud previa. Los lectores no escriben. La aprobación se decide en servidor, nunca por un parámetro de URL o el botón visible.

`request_key` y hash del contenido evitan duplicados en reintentos. Las actualizaciones requieren `version`; el cambio y su evento se guardan en el mismo lote transaccional. El historial se ordena por versión, incluso si varios eventos comparten milisegundo. Además de la selección pública, el frontend conserva únicamente identificadores y hashes de operaciones pendientes en `sessionStorage`, no textos de incidencias ni presupuestos.

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
3. Publicar los assets de `yokup-site` y las rutas limpias por el flujo existente de App. El build incluye HTML, CSS, JS, MJS y `ecommerce-elipsys.json`. El gate contiene el mismo enrutamiento para sus dominios; no sustituir el deploy de App por el de Biz.
4. Con cuentas de prueba autorizadas: técnico asignado → solicitud → presupuesto y aprobación del comercio → registro de pedido de prueba → recepción → instalación. Verificar aislamiento entre comercios, reintentos, móvil y que la incidencia no se cierre. No realizar compras reales para probar.

Si se retira la función, quitar sus enlaces/handlers conservando las tablas e historial; no borrar solicitudes.

Pruebas nuevas: `node --test api/ecommerce.test.mjs yokup-site/ecommerce.test.mjs yokup-site/ecommerce-catalogue.test.mjs`. Incluyen referencia real importada → solicitud → consulta por el comercio, con especificaciones conservadas y precio pendiente. Se ejecutan con SQLite en memoria y cuentas sintéticas; no escriben producción. Las suites existentes de portales, evidencias, autenticación y gate cubren las integraciones afectadas. La comprobación visual y la validación autenticada en producción requieren un entorno de preview/despliegue disponible; no se sustituyen por pruebas estáticas.


## Admira Shop y Stripe (preparación, pendiente de activación)

La misma página y el mismo catálogo se sirven en `admira.app/ecommerce` y, cuando se conecte el dominio, en `admira.shop/ecommerce`. No se mantiene otra copia del catálogo. En Shop, `/` lleva a `/ecommerce`; los portales operativos siguen en Admira App.

Shop usa `/ecommerce-api/{retailer|installer}` como proxy del mismo backend. Solo permite las rutas de acceso, contexto, solicitudes y pago necesarias; conserva cookies HttpOnly, Secure y SameSite=Strict en el propio dominio. No copia cookies entre App y Shop. El acceso por correo/contraseña conserva la selección de productos. Google y el acceso delegado de administradores permanecen en App en esta primera versión.

### Contrato de cobro

1. La solicitud conserva los precios pendientes hasta registrar un presupuesto real.
2. Un superusuario de Admira, autenticado con procedencia `superuser`, verifica el presupuesto. Un presupuesto introducido por el comprador no habilita cobros por sí solo.
3. El titular o administrador del comercio aprueba el importe y abre Stripe Checkout con tarjeta. El servidor usa el total verificado, incluidos impuestos y transporte; ignora importes y URLs de retorno del navegador.
4. Una sesión persistente e idempotente bloquea cambios incompatibles y evita pagos duplicados. Un fallo de red conserva la misma operación. Solo se abre otra sesión tras confirmar su expiración con Stripe.
5. El webhook firmado confirma el pago y deja registro auditable. Volver desde Stripe no cambia el estado de pago. Importe, moneda, modo, sesión y referencias deben coincidir.
6. Cobrar no encarga material a Elipsys, no genera un envío y no cierra la incidencia. La referencia del pedido y el enlace de seguimiento se registran en el flujo existente. Los pagos de prueba no permiten avanzar al pedido.

### Activación

El código preparado no equivale a una pasarela operativa. Faltan cuenta comercial activa de Stripe, configuración segura de secretos y conexión de DNS de Shop.

- Aplicar `api/migrations/0028_ecommerce_payments.sql` antes del Worker actualizado. Conservar las tablas y el flujo anterior.
- Configurar como secretos de servidor `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET`. No incluirlos en Git, páginas, logs ni conversaciones.
- Configurar `ECOMMERCE_PAYMENT_MODE=test` para pruebas o `live` para cobros reales. El tipo de clave debe coincidir y ambos secretos son obligatorios. La nueva cuenta Stripe y su titularidad bancaria se activan por su titular.
- Crear en Stripe el endpoint `https://data.admira.app/api/ecommerce/stripe/webhook`, con eventos `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded` y `checkout.session.async_payment_failed`. Usar el secreto de ese endpoint y del mismo modo.
- Verificar en sandbox un pago, cancelación, reintento, evento repetido, firma inválida y retorno antes del webhook. Los tests locales usan dobles de Stripe y no demuestran un cobro real.
- Publicar API y Pages, conservando el runtime de Functions. Añadir `admira.shop` y opcionalmente `www.admira.shop` como dominios de Pages. Para el dominio raíz en Pages debe conectarse su zona a Cloudflare; verificar primero todos los registros de GoDaddy y conservar los de correo antes de cualquier cambio de servidores de nombres.
- Comprobar HTTPS, catálogo, acceso y un presupuesto verificado desde ambos dominios. Activar `live` solo con cuenta habilitada y webhook verificado. No realizar un cargo real como prueba sin autorización específica.

Las operaciones que quedan en `creating` tras un resultado incierto no se eliminan ni se recrean: deben conciliarse en Stripe con su clave idempotente. Después de 23 horas el sistema bloquea el reintento automático para evitar que Stripe cree otro cobro tras caducar la retención de idempotencia.
Los reembolsos se gestionan en Stripe; esta versión no inicia reembolsos ni sincroniza disputas. El estado «pago confirmado» acredita el cobro original y no representa un saldo neto tras devoluciones.
