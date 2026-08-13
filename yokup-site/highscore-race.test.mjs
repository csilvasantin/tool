import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const moduleSource = await readFile(new URL("./highscore-race.js", import.meta.url), "utf8");
const sandbox = { module:{exports:{}}, exports:{} };
vm.runInNewContext(moduleSource, sandbox);
const race = sandbox.module.exports;
const html = await readFile(new URL("./highscore.html", import.meta.url), "utf8");

test("la carrera exige trabajo factual pero no latido reciente", () => {
  const rows = Array.from({length:7}, (_, i) => ({agente:"Agente "+i, vivo:i !== 4}));
  assert.deepEqual(race.activeMissionRows(rows, ["agente0","agente4","agente6"]).map(x => x.agente), ["Agente 0","Agente 4","Agente 6"]);
  assert.match(html, /trabajos = trabajosCarrera\(\), completas = listaCompletaCache \|\| \[\]/);
  assert.doesNotMatch(html, /listaCache \|\| \[\]\)\.slice\(0, 3\)/);
});

test("sin trabajo ni histórico queda una calle vacía honesta y sin corredor", () => {
  assert.match(html, /var trabajoNoDisponible = !datos\.trabajosAvailable && !trabajos\.length/);
  assert.doesNotMatch(html, /misionDesdePresencia|presencia viva, sin foco declarado/);
  assert.match(html, /class="refresh-lane refresh-lane-empty"/);
  assert.match(html, /SIN TRABAJO ASIGNADO/);
  assert.match(html, /TRABAJO NO DISPONIBLE/);
  assert.match(html, /data-race-empty="true"/);
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

test("las calles 4+ tienen temporización acotada y la música queda limitada al presite", () => {
  assert.equal(race.finishAdvanceMs(1, 2000), 4000);
  assert.equal(race.finishAdvanceMs(2, 2000), 2000);
  assert.equal(race.finishAdvanceMs(3, 2000), 0);
  assert.equal(race.finishAdvanceMs(12, 2000), 0);
  // El corte descargado el 3-ago-2026 suena en bucle mientras vive el presite.
  assert.match(html, /trackfield-1722\.mp3/);
  assert.match(html, /bgm\.loop = true/);
  assert.match(html, /function entra\(\)[\s\S]*?para\(true\);[\s\S]*?if \(window\.__YK_PRESITE__ !== false\) fanfarriaPodio\(\)/);
  assert.match(html, /if \(REDUCE_MOTION\)[\s\S]*?programaCarreraReducida\(0\);[\s\S]*?return;/);
  assert.match(html, /programaCarreraReducida[\s\S]*PASO_SALIDA_MS[\s\S]*2 \* PASO_SALIDA_MS[\s\S]*SALIDA_MS/);
});
