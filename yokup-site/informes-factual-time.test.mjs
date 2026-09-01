import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html=fs.readFileSync(new URL("./informes.html",import.meta.url),"utf8");
const worker=fs.readFileSync(new URL("../yokup-rtc/src/index.js",import.meta.url),"utf8");
const match=/function tiempoHTML\(t\)\{[\s\S]*?\n\}/.exec(html);
assert.ok(match,"falta tiempoHTML");
const context=vm.createContext({_ms:value=>Number(value)||0,esHoy:()=>true,
  hhmm:value=>String(value),ddmm:value=>String(value),durTxt:(start,end)=>String(end-start)});
vm.runInContext(match[0],context);

test("Informes usa inicio factual y generated/end, nunca created/report/latest",()=>{
  assert.match(worker,/AS mission_started/);
  assert.match(worker,/mission_timing_basis:[\s\S]*start_to_end[\s\S]*start_to_generated_at/);
  assert.match(html,/const start=_ms\(t\.mission_started\)/);
  assert.match(html,/const generated=_ms\(t\.mission_generated_at\)/);
  assert.doesNotMatch(match[0],/mission_created|updated_at|MLAST/);
  assert.match(context.tiempoHTML({mission_started:100,mission_generated_at:160,mission_status:"in_progress"}),/100 → 160/);
  assert.match(context.tiempoHTML({mission_started:100,mission_resolved:150,mission_generated_at:999,mission_status:"resolved"}),/100 → 150/);
});

test("Informes falla cerrado si el inicio falta o el fin precede al inicio",()=>{
  assert.match(context.tiempoHTML({mission_created:100,mission_generated_at:160}),/>—<\/span>/);
  assert.doesNotMatch(context.tiempoHTML({mission_started:200,mission_resolved:100,mission_status:"resolved"}),/100 · <span class="tdur">/);
});

test("legacy y paginado publican started_at de tarea y la misma expresión de misión",()=>{
  assert.match(worker,/SELECT mission_id, code, title, status, owner, executor, report, image, image_kind, created_at, started_at, ended_at, updated_at/);
  assert.match(worker,/SELECT m\.mission_id,m\.code,m\.title,m\.status,m\.owner,m\.executor,m\.report,m\.image,m\.image_kind,m\.created_at,m\.started_at,m\.ended_at,m\.updated_at/);
  assert.ok((worker.match(/\$\{HIGHSCORE_WORK_STARTED_SQL\} AS mission_started/g)||[]).length>=2);
});
