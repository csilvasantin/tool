import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source=await readFile(new URL("../src/index.js",import.meta.url),"utf8");

test("cada parte de consumo deja un punto en consumo_serie y /fleet/consumo devuelve la serie de 24 h (marcador vivo, última hora real)", () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS consumo_serie \(id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT, machine TEXT, dia TEXT, ts INTEGER, total INTEGER, entrada INTEGER, cache INTEGER, salida INTEGER\)/);
  assert.match(source, /INSERT INTO consumo_serie\(owner,machine,dia,ts,total,entrada,cache,salida\)/);
  assert.match(source, /Number\(last\.total\) !== total \|\| now - Number\(last\.ts\) >= 240000/, "no se repite un punto idéntico reciente");
  assert.equal((source.match(/if \(esConsumo\) \{ await registraSerieConsumo\(env, owner, machine, dia, b\.datos, now\); await vigilaConsumo/g)||[]).length, 2, "las dos ramas (fila viva y nueva) registran el punto");
  assert.match(source, /SELECT owner,machine,dia,ts,total,entrada,cache,salida FROM consumo_serie WHERE ts>=\? ORDER BY ts ASC/);
  assert.match(source, /partes, por_agente: Object\.values\(porAgente\)[^\n]*, serie \}\)/);
});

test("✋ levantar la mano: cuando un parte pasa los topes, el agente avisa al CEO en Agora con cifras y medidas y deja un aviso consumo-alerta, como mucho cada 2 h", () => {
  assert.match(source, /var CONSUMO_LIMITE = \{ hora: 30e6, dia: 250e6, porLlamada: 150e3, duplicados: 20 \};/);
  assert.match(source, /var CONSUMO_ALERTA_CADA_MS = 2 \* 60 \* 60 \* 1000;/);
  assert.match(source, /async function vigilaConsumo\(env, owner, machine, dia, datos, now\)/);
  assert.equal((source.match(/await vigilaConsumo\(env, owner, machine, dia, b\.datos, now\)/g)||[]).length, 2, "vigila en las dos ramas del parte");
  assert.match(source, /if \(!motivos\.length\) return null;/, "sin exceso no hay mano");
  assert.match(source, /'consumo-alerta',NULL,'abierta'/);
  assert.match(source, /body: JSON\.stringify\(\{ persona: owner, text: texto \}\)/, "habla el propio agente, no Admirito");
  assert.match(source, /CEO: dime si tomo la primera medida ahora o prefieres otra/);
  assert.match(source, /now - Number\(viva\.last_at \|\| 0\) < CONSUMO_ALERTA_CADA_MS/, "no repite el aviso antes de 2 h");
  assert.match(source, /d\.agora = agora;/, "el aviso guarda si Agora aceptó el mensaje: no se da por enviado lo que no llegó");
});
