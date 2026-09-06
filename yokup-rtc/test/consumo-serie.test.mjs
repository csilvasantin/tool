import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source=await readFile(new URL("../src/index.js",import.meta.url),"utf8");

test("cada parte de consumo deja un punto en consumo_serie y /fleet/consumo devuelve la serie de 24 h (marcador vivo, última hora real)", () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS consumo_serie \(id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT, machine TEXT, dia TEXT, ts INTEGER, total INTEGER, entrada INTEGER, cache INTEGER, salida INTEGER\)/);
  assert.match(source, /INSERT INTO consumo_serie\(owner,machine,dia,ts,total,entrada,cache,salida\)/);
  assert.match(source, /Number\(last\.total\) !== total \|\| now - Number\(last\.ts\) >= 240000/, "no se repite un punto idéntico reciente");
  assert.equal((source.match(/if \(esConsumo\) await registraSerieConsumo\(env, owner, machine, dia, b\.datos, now\);/g)||[]).length, 2, "las dos ramas (fila viva y nueva) registran el punto");
  assert.match(source, /SELECT owner,machine,dia,ts,total,entrada,cache,salida FROM consumo_serie WHERE ts>=\? ORDER BY ts ASC/);
  assert.match(source, /partes, por_agente: Object\.values\(porAgente\)[^\n]*, serie \}\)/);
});
