import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const helper=fs.readFileSync(new URL("./highscore-detail.js",import.meta.url),"utf8");
const page=fs.readFileSync(new URL("./highscore-detail-page.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("./highscoreDetail.html",import.meta.url),"utf8");
const context=vm.createContext({Intl,Date,URLSearchParams,sessionStorage:{getItem:()=>null}});
vm.runInContext(helper,context);const D=context.YkHighscoreDetail;

test("type es canónico, conserva todo el scope URL y degrada a Todos",()=>{
  assert.deepEqual(Array.from(D.types),["all","objective","window","mission","task"]);
  assert.deepEqual(JSON.parse(JSON.stringify(D.queryState("?agent=TrinityMBP14&project_id=yokup.com&period=week&type=mission"))),
    {agent:"TrinityMBP14",projectId:"yokup.com",period:"week",type:"mission"});
  assert.equal(D.queryState("?agent=A&project_id=P&period=today&type=nope").type,"all");
  assert.equal(D.detailUrl({agent:"TrinityMBP14",projectId:"yokup.com",period:"year",type:"task"}),
    "/highscoreDetail?agent=TrinityMBP14&project_id=yokup.com&period=year&type=task");
});

test("cada pastilla filtra sólo su tipo factual y Puntos equivale a Todos",()=>{
  const events=[{type:"objective",id:"O"},{type:"decision",id:"W"},{type:"misión",id:"M"},{type:"task",id:"T"}];
  assert.deepEqual(Array.from(D.timelineForType(events,"all"),x=>x.id),["O","W","M","T"]);
  assert.deepEqual(Array.from(D.timelineForType(events,"objective"),x=>x.id),["O"]);
  assert.deepEqual(Array.from(D.timelineForType(events,"window"),x=>x.id),["W"]);
  assert.deepEqual(Array.from(D.timelineForType(events,"mission"),x=>x.id),["M"]);
  assert.deepEqual(Array.from(D.timelineForType(events,"task"),x=>x.id),["T"]);
  const day={points:78,objectives:2,windows:1,missions:1,tasks:3};
  assert.deepEqual(Array.from(D.types,type=>D.metricForType(day,type)),[78,2,1,1,3]);
});

test("cambiar tipo no consulta de nuevo y back-forward restaura filtro o periodo",()=>{
  assert.match(page,/function selectType\(type\)[\s\S]*setUrl\(value,false\);if\(activeData\)render\(activeData,value\)/);
  assert.doesNotMatch(page,/function selectType\(type\)[^}]*load\(/);
  assert.match(page,/activeScope=stateValue\.agent\+"\|"\+stateValue\.projectId\+"\|"\+stateValue\.period/);
  assert.match(page,/if\(activeData&&activeScope===scope\)render\(activeData,value\);else load\(value\)/);
  assert.match(page,/pushState"\]\(\{period:next\.period,type:next\.type\}/);
  assert.match(page,/window\.addEventListener\("popstate",function\(\)\{boot\(false\);\}\)/);
});

test("las cinco métricas son botones toggle accesibles con contador y vacío específico",()=>{
  assert.match(page,/D\.types\.forEach/);
  assert.match(page,/el\("button","metric"\)/);
  assert.match(page,/aria-pressed/);assert.match(page,/aria-controls","factual-timeline/);
  assert.match(page,/panel\.id="factual-timeline"/);assert.match(page,/aria-live","polite/);
  assert.match(page,/events\.length\+" eventos/);
  assert.match(page,/No hay eventos de "\+TYPE_LABELS\[type\]\.toLowerCase\(\)/);
  assert.match(html,/\.metric\[aria-pressed="true"\]/);
  assert.match(html,/@media\(max-width:760px\)[\s\S]*metric-grid/);
});
