import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const moduleSource=await readFile(new URL("./highscore-race.js",import.meta.url),"utf8");
const sandbox={module:{exports:{}},exports:{}};
vm.runInNewContext(moduleSource,sandbox);
const race=sandbox.module.exports;
const html=await readFile(new URL("./highscore.html",import.meta.url),"utf8");

test("formatea únicamente duraciones factuales válidas",()=>{
  assert.equal(race.durationLabel(null),"—");
  assert.equal(race.durationLabel(-1),"—");
  assert.equal(race.durationLabel(0),"<1 min");
  assert.equal(race.durationLabel(35*60_000),"35 min");
  assert.equal(race.durationLabel((2*60+7)*60_000),"2 h 7 min");
});

test("el tiempo factual ocupa una columna fija a la derecha de la pista",()=>{
  assert.match(html,/grid-template-columns:minmax\(112px,160px\) minmax\(0,1fr\) minmax\(118px,160px\)/);
  assert.match(html,/class="refresh-time"[\s\S]*class="refresh-now"[\s\S]*\/\/[\s\S]*class="refresh-elapsed"/);
  assert.match(html,/\.refresh-time\{[^}]*font-variant-numeric:tabular-nums[^}]*text-align:right/);
  assert.match(html,/<span class="refresh-agent"[^>]*>[\s\S]*<div class="refresh-lane-center">/,
    "el nombre queda antes de la pista, no montado sobre la meta");
  assert.match(html,/<div class="refresh-status"><strong>' \+ esc\(resumen\.state\) \+ '<\/strong><time>/);
  assert.match(html,/<span class="refresh-mission"[^>]*><span class="refresh-mission-title">/);
  assert.match(html,/Tiempo transcurrido factual/);
  assert.match(html,/aria-label="Carril de la familia '[\s\S]*Tiempo transcurrido/);
  assert.doesNotMatch(html,/Tiempo dedicado factual|dedicated_ms/);
});

test("la UI consume work_progress_at y elapsed_ms sin calcular el estado con Date.now",()=>{
  assert.match(html,/at:Number\(item\.work_progress_at\) \|\| 0/);
  assert.match(html,/elapsedMs:Number\.isFinite\(Number\(item\.elapsed_ms\)\)/);
  assert.match(html,/state:item\.state \|\| "assigned_stale"/);
  assert.doesNotMatch(html,/elapsedMs:[^\n]*Date\.now/);
});
