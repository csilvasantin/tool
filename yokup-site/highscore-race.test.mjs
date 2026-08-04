import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const moduleSource = await readFile(new URL("./highscore-race.js", import.meta.url), "utf8");
const sandbox = { module:{exports:{}}, exports:{} };
vm.runInNewContext(moduleSource, sandbox);
const race = sandbox.module.exports;
const html = await readFile(new URL("./highscore.html", import.meta.url), "utf8");

test("la carrera exige a la vez latido reciente y misión en curso", () => {
  const rows = Array.from({length:7}, (_, i) => ({agente:"Agente "+i, vivo:i !== 4}));
  assert.deepEqual(race.activeMissionRows(rows, ["agente0","agente4","agente6"]).map(x => x.agente), ["Agente 0","Agente 6"]);
  assert.match(html, /YkHighscoreRace\.activeMissionRows\(lista \|\| \[\], claves\)/);
  assert.doesNotMatch(html, /listaCache \|\| \[\]\)\.slice\(0, 3\)/);
});

test("un latido sin misión no crea calle y deja un fallback legible", () => {
  assert.match(html, /var mision = misionActivaDeAgente\(activas, clave\), resumen = resumenMisionActiva\(mision\)/);
  assert.doesNotMatch(html, /misionDesdePresencia|presencia viva, sin foco declarado/);
  assert.match(html, /class="refresh-empty">Sin misión activa<\/div>/);
});

test("variante de piel estable y dos corredores visibles con bigote", () => {
  const dark = race.runnerVariant({agente:"MorfeoMBP16"});
  assert.equal(race.runnerVariant({agente:"MorfeoMBP16"}), dark);
  assert.ok(["dark","light"].includes(dark));
  const variants = new Set(Array.from({length:30}, (_, i) => race.runnerVariant({agente:"runner-"+i})));
  assert.deepEqual([...variants].sort(), ["dark","light"]);
  assert.match(html, /runner-dark/);
  assert.match(html, /runner-light/);
  assert.match(html, /runner-mustache/);
});

test("meta: ganador levanta brazo y perdedores se rascan la cabeza", () => {
  assert.equal(race.finishPose(1, true), "winner-arm-up");
  assert.equal(race.finishPose(2, true), "loser-head-scratch");
  assert.equal(race.finishPose(8, true), "loser-head-scratch");
  assert.equal(race.finishPose(1, false), "running");
  assert.match(html, /runnerWinner/);
  assert.match(html, /runnerLoser/);
  assert.match(html, /race-winner/);
  assert.match(html, /race-loser/);
  assert.match(html, /id="refreshLanes" role="list"/);
  assert.match(html, /role=\\?"listitem/);
});

test("las calles 4+ tienen temporización acotada y la música concurrente se conserva", () => {
  assert.equal(race.finishAdvanceMs(1, 2000), 4000);
  assert.equal(race.finishAdvanceMs(2, 2000), 2000);
  assert.equal(race.finishAdvanceMs(3, 2000), 0);
  assert.equal(race.finishAdvanceMs(12, 2000), 0);
  // El presite conserva música de fondo en bucle. El corte cambió el 3-ago-2026
  // (90 s desde el 17:22 en vez de los 9,1 MB del anterior), pero el contrato
  // es el mismo: hay banda sonora y se repite.
  assert.match(html, /trackfield-1722\.mp3/);
  assert.match(html, /bgm\.loop = true/);
  assert.match(html, /if \(REDUCE_MOTION\)[\s\S]*?pintaMomentoCarrera\(SALIDA_MS \+ REFRESCO_MS\);[\s\S]*?return;/);
});
