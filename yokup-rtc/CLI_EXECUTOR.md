# Ejecutor CLI de Yokup

`GET /fleet/cli/pending` y `POST /fleet/cli/ack` son API privadas entre el
Worker y el servicio local de cada máquina. No abren aplicaciones Desktop ni
aceptan comandos de shell libres.

## Autenticación

Las dos rutas exigen:

```http
Authorization: Bearer <token>
```

El Worker lee el secreto `YOKUP_CLI_EXECUTOR_TOKEN`. El cliente local recibe el
mismo valor como `YOKUP_CLI_TOKEN`; durante la migración puede leer
`FLEET_TOKEN` como fallback. Ningún valor vive en Git, `wrangler.toml`, logs,
respuestas HTTP ni argumentos de proceso.

El contrato falla cerrado:

- `401 executor_unauthorized`: Bearer ausente o incorrecto;
- `503 executor_auth_not_configured`: el deploy no tiene el binding secreto;
- `400 invalid_machine` / `invalid_target`: máquina o CLI fuera del catálogo;
- `404 command_not_found`: id inexistente o perteneciente a otro target;
- `409`: ACK incompatible, contradictorio o regresivo.

El catálogo admite solamente `MacBookAir16plata`, `MacBookPro14` y `MacMini`,
con clientes `terminal`, `grok`, `smith-grok` y `whiterabbit`. Las acciones
persistidas se limitan a `start`, `stop` y `mission`.

## Recogida

```http
GET /fleet/cli/pending?machine=MacMini
Authorization: Bearer <token>
```

La respuesta conserva `items[]` para los clientes existentes. Cada item incluye
`id`, `cli`, `action`, `detail`, `created_at` y `status`; `detail` contiene el
texto literal saneado cuando `action=mission`. `start`/`stop` añaden `desired`.

Si existen varias órdenes de control pendientes para el mismo CLI, sólo se
entrega la intención más reciente y las anteriores pasan a `superseded`. Una
orden `start`/`stop` en `running` se vuelve a entregar tras 60 segundos para
recuperarse de una caída; ambas acciones deben ser idempotentes en el cliente.
Una misión en `running` nunca se reinyecta automáticamente, para no escribir dos
veces su texto en tmux.

## ACK y heartbeat

El ejecutor publica estado observado en cada ciclo, incluso sin orden:

```json
{
  "machine": "MacMini",
  "cli": "grok",
  "alive": true,
  "pid": 4321
}
```

Al procesar una orden añade `id`, `status` (`running`, `done` o `failed`) y
`detail`. `machine` y `cli` son siempre obligatorios: el Worker comprueba que el
id pertenece exactamente a ese target. Un `done` sólo es coherente si `start`
informa `alive=true`, `stop` informa `alive=false` y `mission` informa
`alive=true`.

Las transiciones son monotónicas: `queued → running → done|failed`. Repetir el
mismo ACK terminal devuelve éxito con `duplicate:true`; no regresa ni cambia el
resultado. El heartbeat actualiza `cli_state` en cada llamada. El texto original
de `mission` permanece en `detail`; el resultado del ejecutor se guarda aparte
en `result_detail`.

`GET /fleet/cli`, consumido por el Highscore, mantiene los campos históricos y
añade `desired`, `desired_command_id`, `desired_at` y `converged`. Por tanto, la
UI sigue mostrando `vivo`, `parado` o `sin noticias`, y además puede distinguir
la intención pendiente del estado observado.

## Migración y despliegue

1. Aplicar `migrations/0006_cli_executor_contract.sql` a D1. Las columnas son
   aditivas y `applySchema` también las asegura de forma idempotente.
2. Cargar el valor ya custodiado en la Cúpula como secret Worker
   `YOKUP_CLI_EXECUTOR_TOKEN`; no imprimirlo ni persistirlo.
3. Desplegar el Worker y comprobar que ambas rutas devuelven `401` sin Bearer y
   `200` con Bearer válido.
4. Instalar/reiniciar el servicio local con `YOKUP_CLI_TOKEN`, comprobar un
   heartbeat sin orden y después un ciclo `start → running → done`.
5. Verificar `GET /fleet/cli`: `seen_at` debe renovarse en cada ciclo y
   `converged=true` cuando estado real y deseado coinciden.

Rollback: volver a desplegar el Worker anterior. La migración es aditiva y puede
permanecer; no es necesario borrar columnas ni datos. El rollback reabre las
rutas internas sin Bearer, por lo que sólo debe usarse como medida temporal.

## Pruebas locales

```sh
node --test cli-executor-contract.test.mjs cli-executor-handler.test.mjs
node --check src/cli-executor-contract.js
node --check src/index.js
```
