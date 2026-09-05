# Dashboard: automatismos por destino

El apartado **Módulos** ofrece dos controles: ventanas de mejora/decisión (`training`) y cápsulas de conocimiento (`learning`). La instalación no modifica preferencias ni activa o detiene trabajos: la ausencia de registros de control conserva la política anterior. Sólo una acción autenticada cambia los controles.

## Contrato

`GET /fleet/automation-modules` requiere la misma sesión que `/fleet/agent/mode`. Devuelve `items` con destino exacto, proyecto, estado, disponibilidad, última ejecución y entrega; `categories` con revisión y habilitación; y el estado separado de los productores anteriores.

`POST` utiliza esa misma autenticación, sin autorización de executor para configurar:

- `{action:"activate", mode, targets:[{persona,machine,runtime,host}], revision, scope:"all"|"individual"}`. Exige interfaces APP/CLI registradas, consumidor verificado y proyecto principal. Una sola interfaz por familia y máquina. Resultados por destino; los fallidos no se activan. La siguiente oportunidad es la próxima hora, sujeta a ocupación, señal fresca y prioridad de misiones humanas. No arranca trabajos al pulsar.
- `{action:"stop", mode, target?:{persona,machine,runtime,host}}`. Sin destino detiene toda la categoría, aunque sus equipos ya no tengan señal. Con destino detiene ese automatismo. No cierra aplicaciones ni misiones humanas.

`ok:false` con `results` es un lote parcial o sin destinos activados. Un error de revisión HTTP409 exige leer estado de nuevo. La UI mantiene el motivo por fila. El endpoint previo `/fleet/agent/mode` pasa por el mismo mecanismo de selección y parada.

## Alcance y límites de parada

La barrera persistente precede la búsqueda de trabajos. Pausa runs horarios y conserva sus investigaciones, informes y entregables; pausa exclusivamente ventanas automáticas pendientes identificadas como Training/OnIdle o FORMACION. No altera decisiones históricas decididas ni misiones adoptadas antes del corte.

Detener ventanas bloquea también el productor OnIdle anterior, sus solicitudes y la adopción automática al vencer. Activar destinos del panel **no reanuda** ese productor sin interfaz exacta: sólo programa el nuevo Training. Academy anterior permanece bloqueado por `consumer_unverified`; sus rutas de lanzamiento, claim, progreso y resultado no tienen un consumidor habilitado. No se anuncia como compatible.

Las guardas de consumidor, claim y entrega revisan la barrera. La inserción de ventanas y la materialización de misiones comprueban el corte dentro de su transacción. Las ventanas guardan su relación exacta con el run/destino. Una decisión elegida explícitamente por Carlos conserva su tratamiento humano.

Una orden ya enviada al consumidor puede seguir en ejecución hasta que observe la revocación. `execution_stop:"unconfirmed"` significa **parada solicitada**, no proceso terminado. No se puede retirar una publicación externa que ya hubiera salido hacia Stock: el panel no promete revertirla. Nuevos lanzamientos y confirmaciones de entrega en Yokup quedan bloqueados. Las aplicaciones permanecen abiertas. El estado no se presenta como detenido sin evidencia.

## Concurrencia

Cada activación usa revisión de categoría y nonce de operación en todas las escrituras. Un perdedor no modifica preferencias, gates ni índices. La selección por familia consulta un índice transaccional, no sólo el snapshot previo: activaciones concurrentes entre categorías mantienen una sola interfaz efectiva. Un stop incrementa revisión y conserva un corte temporal incluso al reactivar. Reactivar una sola ficha después de una parada global mantiene detenidas las restantes.

CLI con autenticación/verificación pendiente y adaptadores no compatibles no se habilitan. Los registros sin interfaz no crean tarjetas ni controles; quedan en el diagnóstico compacto de cobertura.

## Verificación

Pruebas SQLite sin red ni trabajos reales: carreras de revisión, stop/activate, categoría cruzada, publicación y rollback de materialización, conservación de decisiones humanas y entregas. Pruebas UI: selección explícita, solicitud exacta, errores parciales, interfaz desconocida excluida y parada sin ACK. No se activan preferencias ni se crean cápsulas/decisiones reales durante QA.
