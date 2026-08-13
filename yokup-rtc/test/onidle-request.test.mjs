import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../src/index.js",import.meta.url),"utf8");

function body(name){
  const start=source.indexOf(`function ${name}(`)>=0?source.indexOf(`function ${name}(`):source.indexOf(`async function ${name}(`);
  assert.notEqual(start,-1,`falta ${name}`);const open=source.indexOf("{",start);let depth=0,quote="",escaped=false;
  for(let index=open;index<source.length;index++){
    const char=source[index];if(quote){if(escaped)escaped=false;else if(char==="\\")escaped=true;else if(char===quote)quote="";continue;}
    if(char==='"'||char==="'"||char==='`'){quote=char;continue;}if(char==="{")depth++;else if(char==="}"&&--depth===0)return source.slice(start,index+1);
  }throw new Error(`${name} incompleta`);
}

test("la petición está dentro del perímetro y deja ledger durable idempotente",()=>{
  assert.match(source,/PROTECTED[^\n]+"\/fleet\/onidle-request"/);
  assert.match(source,/CREATE TABLE IF NOT EXISTS onidle_requests \(id TEXT PRIMARY KEY, requested_by TEXT NOT NULL/);
  const route=source.slice(source.indexOf('url.pathname === "/fleet/onidle-request"'),source.indexOf('// Fuente única de las tres alternativas OnIdle'));
  assert.match(route,/await requireAuth\(env, req\)/);assert.match(route,/requestImmediateOnIdle\(env, body, session\)/);
  assert.match(route,/cache-control", "no-store"/);
});

test("el cliente no puede suministrar máquina, opciones ni una decisión",()=>{
  const request=body("requestImmediateOnIdle");
  assert.match(request,/input && input\.agent/);assert.match(request,/input && input\.project_id/);assert.match(request,/input && input\.request_id/);
  assert.doesNotMatch(request,/input && input\.machine|input\.options|input\.decision/);
  assert.match(request,/requestedOnIdleAssignment\(env, requestedAgent, requestedProjectId\)/);
  assert.match(body("requestedOnIdleAssignment"),/exactDecisionProjectAssignment/);
});

test("la ejecución inmediata conserva guardas, lease y publicador del scheduler",()=>{
  const request=body("requestImmediateOnIdle");
  assert.match(request,/liveOnIdleDecision\(env\)/);
  assert.equal((request.match(/operationalOnIdleState\(env, identity, now\)/g)||[]).length,2,"guard antes y dentro del lease");
  assert.match(request,/tryAcquireBeatLease\(env, leaseName, 5000\)/);
  assert.match(request,/publishScheduledOnIdle\(env, candidate, now\)/);
  assert.doesNotMatch(request,/INSERT[^\n]+INTO decisions/);
  assert.match(body("publishScheduledOnIdle"),/INSERT OR IGNORE INTO onidle_ticks/);
});

test("una decisión viva devuelve existing y trabajo/cupo devuelve blocked honesto",()=>{
  const request=body("requestImmediateOnIdle");
  assert.match(request,/finishOnIdleRequest\(env, requestId, "existing"/);
  assert.match(request,/finishOnIdleRequest\(env, requestId, "blocked"/);
  assert.match(request,/blockers:operational\.blockers/);assert.match(request,/quota:operational\.quota/);
  assert.match(body("onIdleRequestResponse"),/publisher:"server-scheduled-v1"/);
});
