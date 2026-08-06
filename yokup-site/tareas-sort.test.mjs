import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const [sortSource,page]=await Promise.all([
  readFile(new URL("./yk-tareas-sort.js",import.meta.url),"utf8"),
  readFile(new URL("./tareas.html",import.meta.url),"utf8")
]);
const window={};
vm.runInContext(sortSource,vm.createContext({window,Intl,Date,Math,Number,String,Array,Object,JSON}));
const Sort=window.YkTareasSort;
const group=(id,mission={},tasks=[])=>({mission:{id,subject:id,created_at:1,...mission},tasks});
const ids=rows=>rows.map(row=>row.mission.id);
const plain=value=>JSON.parse(JSON.stringify(value));

test("Agente/Plataforma ordena identidad canónica y máquina",()=>{
  const rows=[group("o",{assignee:"Oraculo",loc:"Mac Mini"}),group("n",{assignee:"Neo",loc:"MacBook Pro 16"})];
  const options={agentIdentity:(agent,machine)=>`${agent}@${machine}`};
  assert.deepEqual(ids(Sort.sort(rows,"agent","asc",options)),["n","o"]);
  assert.deepEqual(ids(Sort.sort(rows,"agent","desc",options)),["o","n"]);
});

test("Proyecto ordena nombre visible y referencia",()=>{
  const rows=[group("b",{project_name:"Zeta",project:"p1"}),group("a",{project_name:"Ágora",project:"p9"})];
  assert.deepEqual(ids(Sort.sort(rows,"project","asc")),["a","b"]);
});

test("Misión ordena display_ref, fecha y título",()=>{
  const rows=[
    group("late-title",{display_ref:"0010.06/08/2026.10:00",created_at:200,subject:"Zulu"}),
    group("early-title",{display_ref:"0010.06/08/2026.10:00",created_at:200,subject:"Alfa"}),
    group("first-ref",{display_ref:"0009.06/08/2026.09:00",created_at:300,subject:"Última"})
  ];
  assert.deepEqual(ids(Sort.sort(rows,"mission","asc")),["first-ref","early-title","late-title"]);
});

test("Tareas ordena avance done/total y estado semántico",()=>{
  const rows=[
    group("none",{},[{code:"a",status:"pending"}]),
    group("half",{},[{code:"a",status:"done"},{code:"b",status:"in_progress"}]),
    group("done",{},[{code:"a",status:"done"},{code:"b",status:"done"},{code:"c",status:"done"}])
  ];
  assert.deepEqual(ids(Sort.sort(rows,"tasks","asc")),["none","half","done"]);
  assert.deepEqual(plain(Sort._test.taskProgress(rows[1])),{done:1,total:3,ratio:1/3,state:1});
});

test("Estado ordena misión y desempata por tiempo reciente",()=>{
  const rows=[
    group("pending",{status:"open",assignee:"Neo"},[{updated_at:100}]),
    group("run-old",{status:"in_progress"},[{updated_at:200}]),
    group("run-new",{status:"in_progress"},[{updated_at:300}]),
    group("done",{status:"resolved",resolved_at:400})
  ];
  assert.deepEqual(ids(Sort.sort(rows,"state","asc")),["pending","run-old","run-new","done"]);
});

test("alternancia, normalización y sort son estables",()=>{
  assert.deepEqual(plain(Sort.next({key:"agent",dir:"asc"},"agent")),{key:"agent",dir:"desc"});
  assert.deepEqual(plain(Sort.next({key:"agent",dir:"desc"},"project")),{key:"project",dir:"asc"});
  assert.deepEqual(plain(Sort.normalize({key:"basura",dir:"asc"})),{key:"mission",dir:"desc"});
  const a=group("same",{project_name:"Igual"}),b=group("same",{project_name:"Igual"});
  assert.deepEqual(Sort.sort([a,b],"project","asc"),[a,b]);
});

test("un filtro conserva grupos enteros y el orden se reaplica sólo al subconjunto",()=>{
  const rows=[
    group("z",{project:"keep",project_name:"Zulu"},[{code:"a",status:"done"}]),
    group("drop",{project:"other",project_name:"Alfa"},[{code:"a",status:"pending"}]),
    group("a",{project:"keep",project_name:"Ágora"},[{code:"a",status:"in_progress"}])
  ];
  const filtered=rows.filter(row=>row.mission.project==="keep");
  const sorted=Sort.sort(filtered,"project","asc");
  assert.deepEqual(ids(sorted),["a","z"]);
  assert.equal(sorted[0].tasks[0].status,"in_progress");
  assert.deepEqual(ids(rows),["z","drop","a"],"no muta GROUPS durante filtros o refrescos");
});

test("cabeceras accesibles, persistencia y filtros reaplican el orden al grupo completo",()=>{
  assert.match(page,/\["agent","Agente\/Plataforma"\][\s\S]*\["project","Proyecto"\][\s\S]*\["mission","Misión"\][\s\S]*\["tasks","Tareas A·B·C"\][\s\S]*\["state","Estado \/ acciones"\]/);
  assert.match(page,/role="columnheader" aria-sort=/);
  assert.match(page,/class="task-sort-head"[^>]*data-task-sort/);
  assert.match(page,/task-sort-arrow" aria-hidden="true"/);
  assert.match(page,/\.task-sort-head:focus-visible/);
  assert.match(page,/localStorage\.setItem\(TASK_SORT_KEY,JSON\.stringify\(TASK_SORT\)\)/);
  assert.match(page,/function sortedVisibleGroups\(\)\{return YkTareasSort\.sort\(visibles\(\),TASK_SORT\.key,TASK_SORT\.dir\);\}/);
  assert.match(page,/const gs=sortedVisibleGroups\(\)/);
  assert.match(page,/TASK_SORT=YkTareasSort\.next[\s\S]*saveTaskSort\(\);render\(\)[\s\S]*active\.focus\(\)/);
  assert.match(page,/gs\.map\(g=>\{[\s\S]*<section class="taskmission[\s\S]*YkMisiones\.stepsHtml\(g\.tasks\)/);
});
