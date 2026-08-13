import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const helper=fs.readFileSync(new URL("./highscore-detail.js",import.meta.url),"utf8");
const page=fs.readFileSync(new URL("./highscore-detail-page.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("./highscoreDetail.html",import.meta.url),"utf8");
const identity=fs.readFileSync(new URL("./yk-agent-identity.js",import.meta.url),"utf8");
const context=vm.createContext({Intl,Date,URLSearchParams,sessionStorage:{getItem:()=>null}});
vm.runInContext(identity,context);vm.runInContext(helper,context);
const D=context.YkHighscoreDetail,ID=context.ykAgentIdentity;

test("la cuenta atrás selecciona sólo la familia exacta y llega a ahora",()=>{
  const now=Date.now(),payload={ok:true,agentes:3,pasoMin:20,turnos:[
    {agent:"NeoMBP14",proxima:now+1000,turno:1},{agent:"TrinityMBP14",proxima:now+65000,turno:2}
  ]};
  const value=D.nextWindow(payload,"TrinityMBP14",ID);assert.equal(value.turn,2);assert.equal(value.at,now+65000);
  assert.equal(D.windowCountdown(now+65000,now),"1 min 05 s");assert.equal(D.windowCountdown(now-1,now),"ahora");
});

test("el control vive a la derecha del nombre y es accesible",()=>{
  assert.match(page,/titleRow\.append\(title,onIdleControl\(stateValue\)\)/);
  assert.match(html,/\.identity-title-row\{display:flex;[^}]*justify-content:space-between/);
  assert.match(page,/aria-label","Próxima ventana OnIDLE de /);assert.match(page,/status\.setAttribute\("role","status"\)/);
  assert.match(page,/button\.setAttribute\("aria-busy","true"\)/);assert.match(page,/button\.disabled=true/);
});

test("la UI sólo solicita al scheduler autenticado y jamás crea decisiones",()=>{
  assert.match(page,/fetch\(API\+"\/fleet\/onidle-request",\{method:"POST",credentials:"include"/);
  assert.match(page,/JSON\.stringify\(\{request_id:id,agent:stateValue\.agent,project_id:stateValue\.projectId\}\)/);
  assert.doesNotMatch(page,/fetch\([^\n]*\/decisions[^\n]*method:"POST"/);
  assert.doesNotMatch(page,/options:|machine:/);
});

test("created/existing sólo navegan tras validar la decisión exacta",()=>{
  assert.match(page,/payload\.status==="created"\|\|payload\.status==="existing"/);
  assert.match(page,/D\.onIdleDecisionError\(decision,stateValue,ID,payload\.decision_id\)/);
  assert.match(page,/window\.location\.assign\(D\.decisionUrl\(payload,stateValue\)\)/);
  assert.match(page,/La ventana recibida no es válida/);
  assert.match(page,/payload\.status==="blocked"/);assert.match(page,/La sesión ha caducado/);
  assert.match(page,/No se pudo contactar con el scheduler/);
});

test("la ruta focal conserva decision_id, agent y project_id",()=>{
  const state={agent:"TrinityMBP14",projectId:"gran-de-gracia"};
  assert.equal(D.decisionUrl({status:"created",decision_id:"DCL-form-5"},state),
    "/decisiones?decision_id=DCL-form-5&agent=TrinityMBP14&project_id=gran-de-gracia");
  assert.equal(D.decisionUrl({status:"existing",decision_id:""},state),"");
});

test("la prevalidación rechaza ventanas ajenas, cerradas o sin cinco opciones canónicas",()=>{
  const state={agent:"TrinityMBP14",projectId:"gran-de-gracia"};
  const valid={ok:true,id:"DCL-5",agent:"TrinityMBP14",status:"pending",project_id:"gran-de-gracia",recommended:0,
    options:["Mejora A","Mejora B","Mejora C","↩ Volver atrás","✍️ Custom · Escribe la mejora"]};
  assert.equal(D.onIdleDecisionError(valid,state,ID,"DCL-5"),"");
  assert.match(D.onIdleDecisionError({...valid,options:valid.options.slice(0,3)},state,ID,"DCL-5"),/cinco opciones/);
  assert.match(D.onIdleDecisionError({...valid,project_id:"admira-academy"},state,ID,"DCL-5"),/otro proyecto/);
  assert.match(D.onIdleDecisionError({...valid,status:"expired"},state,ID,"DCL-5"),/ya no está pendiente/);
  assert.match(D.onIdleDecisionError({...valid,options:["A","B","C","Custom","Volver atrás"]},state,ID,"DCL-5"),/orden canónico/);
});
