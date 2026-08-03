import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html=fs.readFileSync(new URL("./highscoreDetail.html",import.meta.url),"utf8");
const helper=fs.readFileSync(new URL("./highscore-detail.js",import.meta.url),"utf8");
const identity=fs.readFileSync(new URL("./yk-agent-identity.js",import.meta.url),"utf8");
const context=vm.createContext({Intl,Date,sessionStorage:{getItem:()=>null}});
vm.runInContext(identity,context);vm.runInContext(helper,context);
const D=context.YkHighscoreDetail,ID=context.ykAgentIdentity;

test("el número de tareas es un conteo factual y nunca se deriva dividiendo puntos",()=>{
  const now=Date.UTC(2026,7,3,10),tasks=[
    {mission_id:"M1",code:"a",status:"done",owner:"SubMorfeoMBP16",loc:"MacBook Pro 16",updated_at:now},
    {mission_id:"M2",code:"b",status:"in_progress",owner:"SubMorfeoMBP16",loc:"MacBook Pro 16",updated_at:now}
  ];
  const score=D.scoreFor("MorfeoMBP16",{scores:[]},tasks,ID,now);
  assert.equal(score.tasks,40,"los puntos de tarea siguen siendo 15 + 25");
  assert.equal(score.taskCount,2,"la vista necesita el número real de familias A/B/C");
  assert.doesNotMatch(html,/Math\.round\(calculated\.tasks\s*\/\s*15\)/);
});

test("un fallo de API no se presenta como ausencia factual de logros, pendientes o eventos",()=>{
  assert.doesNotMatch(html,/\.then\(pick\)\.catch\(function \(\) \{ return \[\]; \}\)/,
    "la disponibilidad de cada fuente debe conservarse, no convertirse silenciosamente en []");
  assert.match(html,/datos (?:no disponibles|incompletos)|fuente (?:no disponible|incompleta)/i,
    "la vista debe explicar el estado indisponible o parcial");
});

test("una identidad existente sólo en tareas o incidencias no se declara inexistente",()=>{
  const knownBlock=html.slice(html.indexOf("var known ="),html.indexOf("if (!known)"));
  assert.match(knownBlock,/data\.tasks/);
  assert.match(knownBlock,/data\.incidents/);
});
