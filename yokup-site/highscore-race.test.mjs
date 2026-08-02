import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const moduleSource = await readFile(new URL("./highscore-race.js", import.meta.url), "utf8");
const sandbox = { module:{exports:{}}, exports:{} };
vm.runInNewContext(moduleSource, sandbox);
const race = sandbox.module.exports;
const html = await readFile(new URL("./highscore.html", import.meta.url), "utf8");

test("la carrera incluye todos los agentes vivos, no sólo el top 3", () => {
  const rows = Array.from({length:7}, (_, i) => ({agente:"Agente "+i, vivo:i !== 4}));
  assert.deepEqual(race.liveRows(rows).map(x => x.agente), ["Agente 0","Agente 1","Agente 2","Agente 3","Agente 5","Agente 6"]);
  assert.match(html, /YkHighscoreRace\.liveRows\(listaCache \|\| \[\]\)/);
  assert.doesNotMatch(html, /listaCache \|\| \[\]\)\.slice\(0, 3\)/);
});

test("un vivo sin misión conserva calle y usa su foco sólo cuando existe", () => {
  assert.match(html, /var asunto = mision[\s\S]*?: misionDesdePresencia\(fila\);/);
  assert.doesNotMatch(html, /if \(!asunto\) return ""/);
  assert.match(html, /asunto \? estelaMision\(asunto\) : ""/);
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
  assert.match(html, /runnerFinishWin/);
  assert.match(html, /runnerFinishLose/);
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
  assert.match(html, /track-and-field\.mp3/);
  assert.match(html, /bgm\.loop = true/);
  assert.match(html, /if \(REDUCE_MOTION\)[\s\S]*?pintaMomentoCarrera\(SALIDA_MS \+ REFRESCO_MS\);[\s\S]*?return;/);
});
