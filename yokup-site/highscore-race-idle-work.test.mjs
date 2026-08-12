/* La pista no puede afirmar trabajo que no está ocurriendo.
   Carlos, 12-ago-2026, mirando yokup.com/highscore: «los agentes del MBP14 están
   parados y aparecen con una misión; la información tiene que ser veraz — podrían
   llegar a aparecer, pero al correr no debería mostrar que están haciendo algo
   porque no lo están haciendo».
   La causa: la calle daba por trabajo en curso todo lo que traía
   /highscore/active-work, y ese censo marca operational_basis=verified_process
   cuando el PROCESO del agente está vivo — que es cierto y no dice nada sobre si
   la tarea avanza. Los números de aquel momento están abajo tal cual. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const moduleSource = await readFile(new URL("./highscore-race.js", import.meta.url), "utf8");
const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(moduleSource, sandbox);
const race = sandbox.module.exports;
const html = await readFile(new URL("./highscore.html", import.meta.url), "utf8");

const MIN = 60 * 1000;
const AHORA = 1_760_000_000_000;

test("el umbral son cuatro pulsos de cinco minutos, no una cifra suelta", () => {
  assert.equal(race.IDLE_AFTER_MS, 20 * MIN);
});

test("avanza hace poco corre; parado horas no, aunque el proceso siga vivo", () => {
  // Los cuatro participantes reales de las 16:58 del 12-ago-2026.
  const reales = [
    { agent: "OraculoMacMini", activeAt: AHORA - 2 * MIN, basis: "recent_work", esperado: false },
    { agent: "MorfeoMacMini", activeAt: AHORA - 131 * MIN, basis: "verified_process", esperado: true },
    { agent: "NeoMBP14", activeAt: AHORA - 330 * MIN, basis: "verified_process", esperado: true },
    { agent: "TrinityMBP14", activeAt: AHORA - 499 * MIN, basis: "verified_process", esperado: true },
  ];
  for (const fila of reales) {
    assert.equal(race.workIdle(fila.activeAt, AHORA), fila.esperado,
      `${fila.agent} (basis=${fila.basis}) debería estar ${fila.esperado ? "parado" : "corriendo"}`);
  }
});

test("el proceso vivo no rescata a un trabajo parado: sólo cuenta la marca de avance", () => {
  // Mismo agente, mismo verified_process, distinta marca de avance.
  assert.equal(race.workIdle(AHORA - 19 * MIN, AHORA), false);
  assert.equal(race.workIdle(AHORA - 21 * MIN, AHORA), true);
});

test("sin marca de avance se considera parado, nunca corriendo", () => {
  for (const vacio of [0, null, undefined, "", NaN]) {
    assert.equal(race.workIdle(vacio, AHORA), true, `${String(vacio)} no puede pintarse avanzando`);
  }
  assert.equal(race.sinceLabel(0, AHORA), "sin marca de avance");
});

test("la etiqueta dice desde cuándo está parado, en minutos y en horas", () => {
  assert.equal(race.sinceLabel(AHORA - 7 * MIN, AHORA), "hace 7 min");
  assert.equal(race.sinceLabel(AHORA - 59 * MIN, AHORA), "hace 59 min");
  assert.equal(race.sinceLabel(AHORA - 120 * MIN, AHORA), "hace 2 h");
  assert.equal(race.sinceLabel(AHORA - 330 * MIN, AHORA), "hace 5 h 30 min");
  assert.equal(race.sinceLabel(AHORA - 499 * MIN, AHORA), "hace 8 h 19 min");
});

test("la calle parada se marca, no corre y no afirma trabajo en curso", () => {
  assert.match(html, /resumenTrabajoActivo\(trabajo, ahora\)/);
  assert.match(html, /state:parado \? "SIN AVANCE" : "EN CURSO"/);
  assert.match(html, /resumen\.idle \? " refresh-lane-idle" : ""/);
  assert.match(html, /resumen\.idle \? 'data-race-idle="true" ' : ''/);
  // Parado manda sobre el fundamento operativo en la etiqueta.
  assert.match(html, /resumen\.idle \? "parado · sin avance " \+ resumen\.since/);
  // Y el corredor se queda en la salida.
  assert.match(html, /carril\.getAttribute\("data-race-idle"\) === "true"/);
  assert.match(html, /if \(parado\) progresoAtleta = 0;/);
  assert.match(html, /carril\.classList\.remove\("place-revealed", "cruzando", "finished", "race-winner", "race-loser"\)/);
});

test("el rótulo del parado se lee sin depender de que la carrera arranque", () => {
  // .refresh-mission nace invisible y sólo se enseña con .race-started, que la
  // calle parada nunca recibe: sin esto el parado saldría mudo.
  assert.match(html, /\.refresh-lane-idle \.refresh-mission\{[^}]*opacity:1;visibility:visible/);
  assert.match(html, /phase-go \.refresh-lane-idle \.refresh-mission\{opacity:1;visibility:visible\}/);
  assert.match(html, /PARADO · sin avance/);
});
