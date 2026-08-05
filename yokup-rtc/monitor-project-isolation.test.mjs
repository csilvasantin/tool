import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./src/index.js",import.meta.url),"utf8");
const start=source.indexOf("var FLEET_WEBS ="),end=source.indexOf('__name(checkWebs, "checkWebs");',start);
const block=source.slice(start,end+'__name(checkWebs, "checkWebs");'.length);

test("un mapping/incidente fallido se reporta y no corta los monitores siguientes",async()=>{
  const attempted=[];
  const context=vm.createContext({String,AbortSignal,
    fetch:async()=>new Response("down",{status:503}),
    createIncident:async(_env,inc)=>{attempted.push(inc.project_id);if(attempted.length===1)throw new Error("mapping ausente");return "INC-"+attempted.length;},
    resolveIncident:async()=>null,__name:fn=>fn
  });
  vm.runInContext(block,context);
  const report=await context.checkWebs({});
  assert.equal(report.ok,false); assert.equal(report.checks[0].ok,false);
  assert.match(report.checks[0].error,/mapping ausente/);
  assert.equal(attempted.length,8,"todos los servicios posteriores se comprueban");
  assert.ok(attempted.includes("clearchannel-tv"));
  assert.ok(!attempted.includes("clearchannel")); assert.ok(!attempted.includes("admira-store"));
});

test("el cron comprueba máquinas antes de elevar el fallo parcial al beat",()=>{
  const routine=source.slice(source.indexOf("async function runScheduledRoutine"),source.indexOf('__name(runScheduledRoutine, "runScheduledRoutine");'));
  assert.ok(routine.indexOf("await checkMachines(env)")<routine.indexOf("throw new Error(\"monitor web parcial:"));
});
