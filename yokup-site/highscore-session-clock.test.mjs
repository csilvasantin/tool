import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("./highscore-race.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("./highscore.html",import.meta.url),"utf8");
const sandbox={module:{exports:{}},exports:{}};
vm.runInNewContext(source,sandbox);
const race=sandbox.module.exports;

test("reloj triple usa segundos y la sesión abierta avanza sólo desde el ancla",()=>{
  const row={state:"running",work_started_at:1_000,session_state:"open",session_dedicated_ms:4_000};
  const before=structuredClone(row);
  const clock=race.workClock(row,11_000,2_500);
  assert.equal(race.clockDurationLabel(clock.missionDurationMs),"00:00:12");
  assert.equal(race.clockDurationLabel(clock.sessionDurationMs),"00:00:06");
  assert.deepEqual(row,before,"el tick no muta progreso, estado ni dedicación factual");
});

test("sesión cerrada queda congelada y unknown o ausente se muestra como guion",()=>{
  assert.equal(race.workClock({state:"last_work",work_started_at:1_000,ended_at:8_000,
    session_state:"closed",session_dedicated_ms:5_000},20_000,99_000).sessionDurationMs,5_000);
  assert.equal(race.workClock({state:"running",work_started_at:1_000,
    session_state:"unknown",session_dedicated_ms:5_000},20_000,99_000).sessionDurationMs,null);
  assert.equal(race.clockDurationLabel(null),"—");
});

test("DOM deja un único reloj visible y nunca expone sesión, estado ni PID",()=>{
  assert.doesNotMatch(html,/data-session-duration=/);
  assert.doesNotMatch(html,/data-session-state=/);
  assert.doesNotMatch(html,/data-dedicated-basis=/);
  assert.match(html,/Horas operando del agente/);
  assert.match(html,/Horas operando no disponibles/);
  assert.doesNotMatch(html,/Tiempo de trabajo; sin sesión medida|work_interval_fallback/);
  assert.match(html,/refresh-ended refresh-elapsed/);
  assert.doesNotMatch(html,/refresh-work-state|refresh-session-elapsed|class="refresh-time"/);
  assert.doesNotMatch(html,/class="refresh-now"/);
  assert.doesNotMatch(html,/data-(?:pid|session-id|incarnation)/);
  assert.doesNotMatch(html,/data-work-ref/);
});

test("caso screenshot: ambos relojes nunca se igualan mediante fallback de presentación",()=>{
  const row={state:"running",work_started_at:1_000,session_state:"unknown",session_dedicated_ms:null};
  const clock=race.workClock(row,19_000,0);
  assert.equal(race.clockDurationLabel(clock.missionDurationMs),"00:00:18");
  assert.equal(race.clockDurationLabel(clock.sessionDurationMs),"—");
  assert.notEqual(clock.missionDurationMs,clock.sessionDurationMs);
});
