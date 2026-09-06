# Números de misión y números de encargo

**Regla (Carlos, 6-sep-2026 · FLT-2705):** la misión y el encargo no tienen el mismo número.

- Un **encargo** es una fila del bot-inbox de admira-telegram: `#2702`. Su contador vive en esa base.
- Una **misión** es un ticket de Yokup: `FLT-100001`. Desde esta versión toda misión nueva
  recibe un número de la **serie propia de misiones**, que empieza en `FLT-100001`
  (`FLEET_MISSION_SERIES_START`). Seis cifras = misión; `#` de cuatro cifras = encargo.
- El **cruce** encargo↔misión es `fleet_ids (inbox_id ↔ mission_id)`, y el `#n` embebido en
  el `screen` del ticket. `resolveFleetMissionReference("#2702")` devuelve la misión mapeada;
  un número ≥ 100001 se toma directamente como misión.
- Las misiones **anteriores** conservan su número (`FLT-2702`, `FLT-1045`…): se leen, no se
  propagan (norma 3), y el sync las sigue adoptando sin duplicar cuando el asunto o el `#n`
  del screen prueban que son el mismo encargo.
- La referencia **humana** sigue siendo la del día (norma 5): `NNNN.DD/MM/AAAA.HH:MM`.

## Por qué
Hasta hoy el id natural de una misión sincronizada era el rowid del encargo (`FLT-2702 ← #2702`)
y las altas directas se colaban en la misma serie (`FLT-2704` junto a los encargos `#2700-#2703`).
Dos contadores de dos bases distintas acababan significando dos cosas con un mismo número:
FLT-973/974 pisadas (FLT-990), FLT-1515 nacida del #1487 mientras el #1515 era una consulta sin
misión, y hoy #2702 / FLT-2702 / FLT-2704 en la misma prueba. El parche anticolisión trataba el
síntoma; la serie propia quita la causa.

## Guiones de la flota
`bot-inbox-claim.sh` ya saca el FLT del mapa del worker. `bot-inbox-paso.sh` pasa `#n` tal cual
al worker (que resuelve por `fleet_ids`) en vez de fabricar `FLT-n` en local.

## Comprobación
`node fleet-mission-series.test.mjs` y, en producción, un encargo nuevo cuyo `FLT` no coincida
con su `#` en `GET /fleet/missions`.
