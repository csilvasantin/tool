// FLT-1516 · el texto de versión alterna el orden visual por última actualización.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source=await readFile(new URL("./dashboard.html",import.meta.url),"utf8");
const start=source.indexOf("function paProjectUpdatedMs(project)");
const end=source.indexOf("function paSiliconResponsible(project)",start);
const api=new Function(`let PROJECT_VERSION_SORT="manual";${source.slice(start,end)};return {paProjectUpdatedMs,paSortProjectsByVersion,paProjectVersion};`)();

test("antes del primer clic conserva el orden manual y nunca muta la colección",()=>{
  const rows=[{id:"b",updated_at:200},{id:"a",updated_at:100}],copy=rows.slice();
  assert.deepEqual(api.paSortProjectsByVersion(rows,"manual").map(row=>row.id),["b","a"]);
  assert.deepEqual(rows,copy);
  assert.notEqual(api.paSortProjectsByVersion(rows,"manual"),rows);
});

test("ordena primero de reciente a antiguo y después al revés",()=>{
  const rows=[{id:"medio",updated_at:200},{id:"antiguo",updated_at:100},{id:"nuevo",updated_at:300}];
  assert.deepEqual(api.paSortProjectsByVersion(rows,"desc").map(row=>row.id),["nuevo","medio","antiguo"]);
  assert.deepEqual(api.paSortProjectsByVersion(rows,"asc").map(row=>row.id),["antiguo","medio","nuevo"]);
  assert.match(source,/PROJECT_VERSION_SORT=PROJECT_VERSION_SORT==="desc"\?"asc":"desc"/);
});

test("normaliza segundos, conserva empates y deja fechas ausentes al final",()=>{
  const rows=[{id:"sin",updated_at:0},{id:"uno",updated_at:1700000000},{id:"empate",updated_at:1700000000000},{id:"inválido",updated_at:"x"}];
  assert.equal(api.paProjectUpdatedMs(rows[1]),1700000000000);
  assert.deepEqual(api.paSortProjectsByVersion(rows,"desc").map(row=>row.id),["uno","empate","sin","inválido"]);
  assert.deepEqual(api.paSortProjectsByVersion(rows,"asc").map(row=>row.id),["uno","empate","sin","inválido"]);
});

test("el control es un botón factual con estado, flecha y foco restaurado",()=>{
  assert.match(source,/class="pa-project-version" data-pa-version-sort data-pa-project-version=/);
  assert.match(source,/data-pa-version-order=/);
  assert.match(source,/<time'\+\(version\.iso\?/);
  assert.match(source,/arrow=order==="desc"\?"↓":order==="asc"\?"↑":"↕"/);
  assert.match(source,/function paFocusProjectVersion\(projectId\)/);
  assert.match(source,/paRender\(\);paFocusProjectVersion\(projectId\)/);
});

test("el clic no pliega la ficha ni inicia arrastre y anuncia el sentido",()=>{
  assert.match(source,/querySelectorAll\("\[data-pa-version-sort\]"\)/);
  assert.match(source,/button\.onpointerdown=event=>event\.stopPropagation\(\)/);
  assert.match(source,/button\.onkeydown=event=>event\.stopPropagation\(\)/);
  assert.match(source,/button\.ondragstart=event=>event\.preventDefault\(\)/);
  assert.match(source,/paToggleProjectVersionSort\(button\.dataset\.paProjectVersion\)/);
  assert.match(source,/proyectos ordenados · /);
});

test("el render ordena sólo una copia de los proyectos ya filtrados",()=>{
  assert.match(source,/const visibleProjects=paSortProjectsByVersion\(PROJECT_ROWS\.filter\(/);
  assert.doesNotMatch(source,/PROJECT_ROWS\.sort\(/);
  assert.doesNotMatch(source,/PROJECT_CATALOG\.sort\(/);
});
