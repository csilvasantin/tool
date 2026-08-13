import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {memberRefMatches,resolveDecisionIdentity} from "../src/decision-project.js";
import {sameAgentFamily} from "../src/agent-identity.js";
import {onIdleEligibility} from "../src/mission-visible.js";
import {selectCanonicalLiveOnIdleDecision} from "../src/onidle-decision-contract.js";

const source=fs.readFileSync(new URL("../src/index.js",import.meta.url),"utf8");
const MARKER="OnIdle horario";
const OPTIONS=["Mejora A","Mejora B","Mejora C","↩ Volver atrás","✍️ Custom · Escribe la mejora que quieras a mano"];

function body(name){
  const asyncStart=source.indexOf(`async function ${name}(`),syncStart=source.indexOf(`function ${name}(`);
  const start=asyncStart>=0?asyncStart:syncStart;assert.notEqual(start,-1,`falta ${name}`);
  const open=source.indexOf("{",start);let depth=0,quote="",escaped=false;
  for(let i=open;i<source.length;i++){const c=source[i];if(quote){if(escaped)escaped=false;else if(c==="\\")escaped=true;else if(c===quote)quote="";continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}if(c==="{")depth++;else if(c==="}"&&--depth===0)return source.slice(start,i+1);}
  throw new Error(`${name} incompleta`);
}

function operationalHarness(rows){
  const sqlCalls=[];
  const env={DB:{prepare(sql){sqlCalls.push(sql);return {bind(){return this;},async all(){
    if(sql.startsWith("SELECT id,status,assignee"))return {results:rows.missions||[]};
    if(sql.startsWith("SELECT m.mission_id"))return {results:rows.tasks||[]};
    if(sql.includes("FROM decisions"))return {results:rows.decisions||[]};
    if(sql.startsWith("SELECT agent,machine FROM decisions"))return {results:rows.used||[]};
    throw new Error(`SQL inesperado: ${sql}`);
  }};}}};
  const factory=new Function("selectCanonicalLiveOnIdleDecision","missionDayRange","madridDayKey","onIdleEligibility","ONIDLE_MISSION_MARKER","ONIDLE_DAILY_LIMIT","MISSION_UNCONCLUDED_AFTER_MS","sameAgentFamily","memberRefMatches",
    `${body("matchesOnIdleIdentity")}; ${body("operationalOnIdleState")}; return operationalOnIdleState;`);
  return {run:factory(selectCanonicalLiveOnIdleDecision,()=>({start:1,end:2}),()=>"2026-08-13",onIdleEligibility,MARKER,8,3600000,sameAgentFamily,memberRefMatches),env,sqlCalls};
}

const NOW=Date.UTC(2026,7,13,12);
function activeMission(id,assignee,loc){return {id,status:"in_progress",assignee,loc,created_at:NOW-1000,started_at:NOW-1000,updated_at:NOW-1000,live_at:NOW-1000};}
function activeTask(id,assignee,loc){return {mission_id:id,code:"a",status:"in_progress",assignee,loc,created_at:NOW-1000,started_at:NOW-1000,updated_at:NOW-1000};}
function decision(id,{agent="OraculoMini",machine="Mac Mini",project="yokup",surface="highscore",mission=MARKER,options=OPTIONS,status="pending"}={}){
  return {id,agent,machine,project,surface,mission,options:JSON.stringify(options),status,deadline:999999,created_at:1};
}

test("blockers de misión y tarea pertenecen sólo a agent+machine exactos",async()=>{
  const identity=resolveDecisionIdentity("OraculoMini","Mac Mini");assert.equal(identity.ok,true);
  const {run,env}=operationalHarness({
    missions:[activeMission("own-m","SubOraculoMini","Mac Mini"),activeMission("other-machine","OraculoMBP14","MacBook Pro 14"),activeMission("other-agent","NeoMini","Mac Mini"),activeMission("missing-loc","OraculoMini","")],
    tasks:[activeTask("own-t","InfraOraculoMini","Mac Mini"),activeTask("other-machine-t","OraculoMBP14","MacBook Pro 14"),activeTask("other-agent-t","NeoMini","Mac Mini"),activeTask("missing-loc-t","OraculoMini","")]
  });
  const state=await run(env,identity,"yokup",NOW);
  assert.deepEqual(state.blockers,{missions:1,tasks:1,decisions:0});
  assert.equal(state.reason,"active_task");
});

test("trabajo ajeno no bloquea y los alias históricos del Mini sí casan",async()=>{
  const identity=resolveDecisionIdentity("OraculoMacMini","Mac Mini");assert.equal(identity.agent,"OraculoMini");
  const {run,env}=operationalHarness({missions:[activeMission("foreign","NeoMini","Mac Mini"),activeMission("wrong-host","OraculoMBP14","MacBook Pro 14")],tasks:[activeTask("foreign-t","NeoMini","Mac Mini")]});
  const state=await run(env,identity,"yokup",NOW);assert.equal(state.can_open,true);assert.equal(state.reason,"ready");
  for(const owner of ["Oraculo","OraculoMacMini","SubOraculoMini","InfraOraculoMini"]){
    assert.equal(sameAgentFamily(owner,identity.agent)&&memberRefMatches("machine","Mac Mini",identity.machine),true,owner);
  }
  assert.equal(sameAgentFamily("NeoMini",identity.agent),false);
  assert.equal(memberRefMatches("machine","MacBook Pro 14",identity.machine),false);
  assert.equal(memberRefMatches("machine","",identity.machine),false);
});

test("Academy y OnIDLE concurrente ajeno nunca se presentan como decisión propia",async()=>{
  const scope={agent:"OraculoMini",machine:"Mac Mini",project_id:"yokup"};
  const academy=decision("academy",{agent:"TrinityMBA16",machine:"MacBook Air 16 DG",project:"admira-academy",surface:"academy",mission:"formacion:tecnologia",options:OPTIONS.slice(0,3)});
  const foreign=decision("foreign",{agent:"NeoMini"});const own=decision("own");
  assert.equal(selectCanonicalLiveOnIdleDecision([academy,foreign],scope,MARKER),null);
  assert.equal(selectCanonicalLiveOnIdleDecision([academy,foreign,own],scope,MARKER)?.id,"own");
  const {run,env}=operationalHarness({decisions:[academy,foreign,own]});
  assert.equal((await run(env,scope,"yokup",NOW)).blockers.decisions,1);
});

test("handler /fleet/onidle-state exige identidad resoluble y llama el guard con el scope",()=>{
  const route=source.slice(source.indexOf('url.pathname === "/fleet/onidle-state"'),source.indexOf('// Solicitud autenticada de ejecución inmediata'));
  assert.match(route,/resolveDecisionIdentity\(url\.searchParams\.get\("agent"\), url\.searchParams\.get\("machine"\)\)/);
  assert.match(route,/if \(!identity\.ok\) return json\(\{ ok:false, code:"exact_identity_required"/);
  assert.match(route,/operationalOnIdleState\(env, identity\)/);
  const mini=resolveDecisionIdentity("OraculoMacMini","Mac Mini");assert.deepEqual(mini,{ok:true,agent:"OraculoMini",machine:"Mac Mini"});
  assert.equal(resolveDecisionIdentity("OraculoMBP14","Mac Mini").ok,false);
  assert.equal(resolveDecisionIdentity("OraculoMini","").ok,false);
});

test("la implementación filtra ambos conjuntos antes de calcular elegibilidad",()=>{
  const fn=body("operationalOnIdleState"),predicate=body("matchesOnIdleIdentity");
  assert.match(fn,/missions\s*=\s*\(missionResult\.results \|\| \[\]\)\.filter/);
  assert.match(fn,/tasks\s*=\s*\(taskResult\.results \|\| \[\]\)\.filter/);
  assert.match(predicate,/sameAgentFamily\(row\.assignee, identity\.agent\)/);
  assert.match(predicate,/memberRefMatches\("machine", row\.loc, identity\.machine\)/);
});
