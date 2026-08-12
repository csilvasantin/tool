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

test("el tiempo aparece en negrita junto a la misión sólo al llegar a meta",()=>{
  assert.match(html,/<span class="refresh-mission-title">[^\n]+<\/span>' \+\s*'<strong class="refresh-mission-duration"/);
  assert.match(html,/\.refresh-mission-duration\{display:none[^}]*font-weight:950/);
  assert.match(html,/\.refresh-lane\.finished \.refresh-mission\{display:flex;[^}]*justify-content:center;[^}]*gap:6px\}/);
  assert.match(html,/\.refresh-lane\.finished \.refresh-mission-duration\{display:block;flex:0 0 auto\}/);
  assert.match(html,/\.refresh-lane\.finished \.refresh-mission-title\{display:block;width:auto;min-width:0;overflow:hidden;text-overflow:ellipsis\}/,
    "en móvil el título cede espacio con elipsis, pero el reloj factual permanece visible");
  assert.match(html,/Tiempo dedicado factual/);
  assert.match(html,/aria-label="Puesto '[\s\S]*Tiempo dedicado/);
});

test("la UI consume work_progress_at y dedicated_ms sin calcularlos con Date.now",()=>{
  assert.match(html,/at:Number\(item\.work_progress_at \|\| item\.active_at\)/);
  assert.match(html,/dedicatedMs:Number\.isFinite\(Number\(item\.dedicated_ms\)\)/);
  assert.doesNotMatch(html,/dedicatedMs:[^\n]*Date\.now/);
});
