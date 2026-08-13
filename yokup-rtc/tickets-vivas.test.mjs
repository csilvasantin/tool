// El recorte por estado se prueba contra SQL de verdad, no contra una promesa:
// lo que importa es que «vivas» deje fuera el historial PERO conserve las
// misiones de flota cerradas hace menos de 3 h (Carlos, 17-jul-2026).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const src = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

test("el universo «vivas» recorta el historial en SQL", () => {
  assert.match(src, /const soloVivas = String\(filters\.state \|\| ""\) === "vivas"/);
  assert.match(src, /t\.status NOT IN \('resolved','cancelled'\)/);
});

test("«vivas» conserva toda misión de agente cerrada hace menos de 3 h", () => {
  assert.match(src, /t\.status='resolved' AND " \+ MISSION_SCOPE_SQL_T/,
    "sin esta excepcion el tablero por defecto pierde los handON declarados desde CLI");
  assert.doesNotMatch(src, /t\.status='resolved' AND t\.source='fleet'/);
  assert.match(src, /3 \* 3600 \* 1000/);
});

test("los contadores siguen contando TODO el universo, se traiga o no", () => {
  assert.match(src, /if \(universe\.soloVivas\) \{[\s\S]*?sqlSinEstado/,
    "lo cerrado se cuenta con una agregada, no bajandose las filas");
  assert.match(src, /bindsSinEstado/);
});
