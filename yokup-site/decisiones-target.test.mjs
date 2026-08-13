import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("./yk-decisions.js",import.meta.url),"utf8");
const page=fs.readFileSync(new URL("./decisiones.html",import.meta.url),"utf8");
const context=vm.createContext({window:{location:{search:""}},URLSearchParams,Intl,Date});
vm.runInContext(source,context);
const T=context.window.YkDecisions._test;
const options=["Primera","Segunda","Tercera","↩ Volver atrás","✍️ Custom · Escribe la mejora"];

test("decision_id activa un alcance focal exacto con agente y proyecto",()=>{
  assert.deepEqual({...T.targetSpec("?decision_id=DCL-5&agent=TrinityMBP14&project_id=gran-de-gracia")},
    {id:"DCL-5",agent:"TrinityMBP14",projectId:"gran-de-gracia"});
  assert.equal(T.targetSpec("?agent=TrinityMBP14"),null);
});

test("la decisión focal exige identidad, proyecto, estado y cinco opciones en orden",()=>{
  const target={id:"DCL-5",agent:"TrinityMBP14",projectId:"gran-de-gracia"};
  const valid={id:"DCL-5",agent:"TrinityMBP14",machine:"MBP14",project_id:"gran-de-gracia",status:"pending",recommended:1,options};
  assert.equal(T.targetDecisionError(valid,target),"");
  assert.match(T.targetDecisionError({...valid,id:"otra"},target),/no coincide/);
  assert.match(T.targetDecisionError({...valid,agent:"NeoMBP14"},target),/otro agente/);
  assert.match(T.targetDecisionError({...valid,project_id:"admira-academy"},target),/otro proyecto/);
  assert.match(T.targetDecisionError({...valid,options:options.slice(0,3)},target),/cinco opciones/);
  assert.match(T.targetDecisionError({...valid,options:["A","B","C","Custom","Volver atrás"]},target),/orden canónico/);
});

test("el contrato focal tiene loading y error accesibles y nunca cae al empty genérico",()=>{
  assert.match(source,/error\?'alert':'status'/);
  assert.match(source,/error\?'assertive':'polite'/);
  assert.match(source,/Cargando la decisión solicitada/);
  assert.match(source,/No se encontró la decisión solicitada/);
  assert.match(source,/targetDecisionError\(item,target\)/);
  assert.match(page,/id="decsList"[^>]*aria-live="polite"/);
});

test("las cinco opciones válidas se conservan accionables y en el orden recibido",()=>{
  const html=T.card({id:"DCL-5",agent:"TrinityMBP14",machine:"MBP14",project:"Gran de Gràcia",project_slug:"GRAN-DE-GRACIA",project_id:"gran-de-gracia",question:"¿Qué mejora hacemos?",status:"pending",recommended:1,secondsLeft:120,created_at:1,deadline:120001,options});
  const rendered=html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)||[];
  assert.equal(rendered.length,5);
  options.forEach((option,index)=>assert.match(rendered[index],new RegExp(option.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"))));
  rendered.forEach(button=>assert.doesNotMatch(button,/\bdisabled\b/));
});
