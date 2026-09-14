# Integración de Xtanco y CanalKiosk con mantenimiento Yokup

Fecha: 14 septiembre 2026. Responsable: OraculoMacMini.
Misión de diseño: DCL-7f208e9a4f007158a79acb96 · Hoy #293.
Estado: propuesta de implementación; no acredita integración operativa.

## Objetivo y responsabilidades

Un mismo expediente debe acompañar al comercio desde la detección hasta la recuperación del servicio y su confirmación. Las intervenciones de varios técnicos son parte de ese expediente; no deben hacer desaparecer el problema del panel del circuito.

- Admira mantiene la identidad y pertenencia de circuitos, establecimientos y dispositivos, y aporta su telemetría disponible.
- Xtanco y CanalKiosk incorporan una sección «Equipos y asistencia»: estado, comunicar problema, seguimiento, cita, confirmación y valoración. Presentan datos del mismo servicio Yokup, conservando el diseño del portal.
- Yokup mantiene expedientes, intervenciones, asignaciones, compromisos de atención, historial y avisos.
- El instalador/mantenedor/reparador es un profesional con especialidades, disponibilidad y autorizaciones. Cada trabajo indica si es instalación, mantenimiento preventivo o reparación.
- Un operador identificado del circuito atiende excepciones: falta de técnico, piezas, presupuesto, incumplimiento de plazo o desacuerdo con el cierre.

## Flujo objetivo

1. **Detectar:** fallo recibido de Admira, ausencia de latido fuera de tolerancia, aviso manual del comercio o mantenimiento programado. Registrar todos los eventos relevantes; convertir en incidencia únicamente problemas accionables. Un mantenimiento preventivo genera una orden planificada y no se cuenta como avería.
2. **Evaluar:** identificar equipo y titular, severidad, horario de servicio y posible causa común. Descartar desconexiones programadas y cortes breves según política del tipo de equipo. Diagnóstico remoto con acciones expresamente autorizadas; sin ejecutar controles arbitrarios desde un agente.
3. **Despachar:** si necesita visita, ofrecer a profesionales disponibles, cualificados y a distancia estrictamente menor de 40 km. La aceptación es exclusiva. Registrar responsable, cita y compromiso de atención. Si nadie acepta o no hay cobertura, escalar al operador; no ampliar el radio ni comprometer costes automáticamente.
4. **Intervenir:** el técnico confirma cita/llegada, diagnóstico, trabajo realizado, piezas y evidencias. Las esperas de acceso, repuestos o autorización conservan responsable y próxima revisión.
5. **Verificar:** el parte cambia a «resuelto técnicamente / pendiente de conformidad». Comprobar recuperación estable con las señales disponibles para ese equipo. Estar conectado no prueba que la pantalla muestre imagen, el audio suene o la climatización funcione.
6. **Cerrar:** el comercio confirma funcionamiento y satisfacción; la valoración por estrellas se registra por separado. Si sigue fallando, se crea una intervención de revisión bajo el mismo expediente. Si no responde, recordar y escalar; el silencio nunca equivale a satisfacción.

Estados del expediente propuestos: `abierto → diagnóstico → pendiente de técnico → asignado → en intervención → pendiente de conformidad → cerrado satisfactorio`.
Ramas explícitas: `en espera`, `escalado`, `revisión requerida` y `cancelado con motivo`. La cancelación no cuenta como cierre satisfactorio. Conservar los estados actuales de las intervenciones para compatibilidad, añadiendo el expediente superior y sus transiciones controladas.

Separar confirmación de funcionamiento, satisfacción con el servicio y puntuación del técnico. Un equipo reparado con una reclamación de servicio requiere seguimiento del operador. La asistencia no debe depender de otorgar estrellas.

## Arquitectura y contrato

```text
Admira (inventario y eventos) ── adaptador autenticado ── Yokup
                                                        │
                           expediente + intervenciones + historial
                                                        │
                  ┌─────────────────┬───────────────────┴───────────┐
             Xtanco/CanalKiosk   Portal del técnico           Control Admira
                  └─────────────────┴───────────────────────────────┘
                              misma referencia de expediente
```

El backend central verifica la titularidad y enlaza `(circuit_id, admira_store_id, admira_device_id)` con los UUID locales existentes. Ningún navegador puede reclamar dispositivos con solo conocer un ID público. La sesión unificada entre circuitos y Yokup requiere diseñar federación o intercambio de identidad; no existe SSO implícito.

Mantener los endpoints firmados existentes de enlace, eventos y consulta. Crear una cola de salida persistente para cambios de expediente y notificaciones: escritura del cambio y de su evento en la misma transacción, reintentos con espera creciente, recibos y revisión de entregas agotadas. El receptor deduplica por `event_id`; reconciliar por consulta/cursor tras una interrupción.

Contrato de eventos ampliado propuesto, pendiente de implementar: versión de esquema, `event_id`, fuente, circuito, establecimiento, dispositivo, hora de origen, hora de recepción, tipo, severidad y correlación. Incluir `case_id`, `intervention_id` y versión del expediente cuando existan. No confundir este contrato futuro con el formato `fault/heartbeat` actualmente aceptado.

Deduplicar eventos y mantener un expediente activo por equipo/episodio. Repeticiones actualizan su historial. Correlacionar fallos comunes de un establecimiento, por ejemplo red caída que afecta pantalla y audio, para coordinar una visita sin perder el estado individual. Los eventos antiguos no pueden revertir un estado nuevo; una recuperación solo se atribuye al episodio correspondiente.

El MCP sirve para consultar y ejecutar acciones autorizadas de los agentes. La entrega automática de eventos y los plazos se apoyan en procesamiento persistente, no dependen de que un agente permanezca conectado. Extender MCP con acciones de cita, avance, escalado y conformidad solo cuando existan sus reglas en la API.

Documentación y esquemas públicos; acceso a datos y acciones autenticado. Tokens individuales, revocables y limitados a rol/circuito/titular y función; secretos de servicios exclusivamente en backend. La autorización se valida en cada operación. No distribuir el secreto central de Admira a los circuitos ni a profesionales. El MCP actual usa Bearer por cuenta; OAuth/SSO y cuentas de servicio por circuito siguen pendientes.

## Notificaciones y compromisos

| Suceso | Comercio | Técnico | Operador del circuito |
|---|---|---|---|
| Apertura | Referencia, problema y siguiente paso | Oferta a candidatos elegibles | Nueva incidencia y severidad |
| Aceptación y cita | Profesional y franja acordada | Trabajo confirmado | Responsable y plazo |
| Cambio importante o espera | Motivo y próxima actualización | Acción que le corresponde | Dependencia y vencimiento |
| Resolución técnica | Solicitud de comprobación | Parte recibido | Pendiente de conformidad |
| Desacuerdo o plazo incumplido | Seguimiento y nuevo compromiso | Revisión o reasignación | Escalado obligatorio |
| Cierre satisfactorio | Confirmación e historial | Resultado y valoración | Resultado y métricas |

Propuesta de canales: bandeja persistente en el portal para todos, más Web Push y correo para cambios accionables. WhatsApp/SMS pueden añadirse según canal aceptado por los destinatarios y proveedor disponible. No están implementados ni contratados en esta propuesta. Diferenciar envío, entrega, lectura y aceptación; un aviso enviado no asigna un técnico.

Configurar por circuito prioridad, horario y zona horaria, tiempo para aceptar, cita, resolución y respuesta del comercio, responsable de guardia y reglas de espera. No asumir asistencia 24/7 ni tiempos de reparación sin cobertura acordada. Registrar cada escalado y sus reintentos. Fallos de telemetría o de entrega también deben aparecer como problemas operativos del servicio.

## Base existente y trabajo pendiente

Comprobado en el código y contratos locales actuales:

- Portales autenticados, equipos del comercio, alta manual de incidencias, avisos internos a menos de 40 km, aceptación exclusiva, parte y valoración.
- Enlace y eventos firmados preparados; un aviso manual y uno automático utilizan las mismas incidencias.
- Una valoración insatisfactoria conserva la intervención original y enlaza una revisión. El estado actual `resolved` corresponde al parte técnico; falta un expediente con cierre satisfactorio explícito.
- MCP de ambos portales con tokens y documentación pública; sin OAuth automático.

Pendiente: productor real de Admira y credenciales, inventario con titularidad verificada, adaptadores de Xtanco/CanalKiosk, autenticación entre productos, avisos externos, citas, escalados y expediente con conformidad separada. La referencia a Xtanco en `data.js` es un ejemplo; no demuestra un conector operativo. No se han localizado repositorios con esos nombres bajo la cuenta consultada; eso no demuestra que no existan en otra organización o repositorio.

Los documentos históricos que mencionan Supabase o flujos demo no describen por sí solos el backend vigente. Base de este diseño: `docs/installer-portal.md`, `docs/retailer-portal.md`, `docs/portal-mcp.md` y `api/src/retailer-portal.js`. El contrato del retailer incorpora HVAC.

## Orden de ejecución y aceptación del piloto

1. Identificar con el responsable de Admira el backend real y su repositorio, un circuito, un establecimiento, un equipo y su titular. Elegir Xtanco o CanalKiosk por disponibilidad de esa conexión. Mantener la conexión real en la tarea #183c; esta misión #293 entrega su diseño.
2. Implementar expediente y conformidad separada con permisos y migración compatible, incorporando citas y responsables de excepciones. No convertir intervenciones históricas sin conformidad en cierres satisfechos.
3. Conectar inventario y eventos de ese piloto; añadir consultas de expediente dentro del circuito y propagación de cambios. Probar primero con cuentas de prueba aisladas.
4. Activar el canal externo acordado con destinatarios verificados y probar entrega, reintentos, escalado y enlace autenticado al expediente.
5. Recorrer un fallo controlado: detectar, abrir una sola vez, ofrecer, aceptar, intervenir, comprobar y cerrar con el comercio. Repetir el caso de disconformidad y conservar el expediente abierto con su revisión. Después conectar el segundo circuito mediante el mismo contrato.

Criterios mínimos: aislamiento entre circuitos y titulares; dos aceptaciones simultáneas con un único ganador; evento duplicado y fuera de orden; caída y recuperación del receptor; indisponibilidad de técnicos; plazo vencido; entrega fallida; recuperación técnica sin respuesta del comercio; disconformidad y revisión; cierre satisfactorio visible con la misma referencia en las tres superficies. Los fallos controlados deben acordarse sobre un equipo piloto, sin provocar averías en la flota general.

Medir detección, aceptación, tiempo sin servicio, resolución a la primera, revisiones, entregas fallidas y satisfacción confirmada. Mantener visible el denominador de casos sin respuesta; no excluirlos ni contarlos como satisfechos.
