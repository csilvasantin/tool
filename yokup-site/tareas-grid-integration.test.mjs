import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const [html,columns,deploy]=await Promise.all([
  readFile(new URL("./tareas.html",import.meta.url),"utf8"),
  readFile(new URL("./yk-tareas-columns.js",import.meta.url),"utf8"),
  readFile(new URL("./deploy.mjs",import.meta.url),"utf8")
]);

test("cada cabezal une botón sort y handle resize como controles hermanos",()=>{
  assert.match(html,/function taskSortHead\(key,label\)/);
  assert.match(html,/<button type="button" class="task-sort-head" data-task-sort="'\+key\+'"[\s\S]*?<\/button><span class="task-col-resize" data-task-resize="'\+resize\+'"/);
  assert.doesNotMatch(html,/<button[^>]*data-task-sort[^>]*data-task-resize/);
  assert.equal((html.match(/role="columnheader"/g)||[]).length,1,"el helper genera semánticamente los cinco cabezales");
  assert.match(html,/TASK_SORT_COLUMNS\.map\(\(\[key,label\]\)=>taskSortHead\(key,label\)\)/);
});

test("click de orden y gestos de resize no comparten destino ni propagación",()=>{
  assert.match(html,/querySelectorAll\("\.task-sort-head"\)[\s\S]*button\.onclick=/);
  assert.match(columns,/pointerdown[\s\S]*event\.preventDefault\(\);event\.stopPropagation\(\)/);
  assert.match(columns,/container\.addEventListener\("click"[\s\S]*if\(handle\)event\.stopPropagation\(\)/);
  assert.match(columns,/container\.addEventListener\("keydown"[\s\S]*event\.preventDefault\(\);event\.stopPropagation\(\)/);
});

test("orden, anchos y apertura usan persistencias independientes",()=>{
  assert.match(html,/TASK_SORT_KEY="yk_tareas_sort_v1"/);
  assert.match(columns,/"yokup\.tareas\.columnWidths\.v1"/);
  assert.match(html,/localStorage\.getItem\("yk_tareas_open"\)/);
  assert.match(html,/TASK_COLUMNS\.apply\(\);[\s\S]*TASK_SORT=YkTareasSort\.next/);
});

test("ordenar mueve siempre section con ficha, plegado y árbol juntos",()=>{
  assert.match(html,/const gs=sortedVisibleGroups\(\)/);
  assert.match(html,/gs\.map\(g=>\{[\s\S]*<section class="taskmission[\s\S]*YkMisiones\.rowHtml\(mission\)[\s\S]*class="taskfold"[\s\S]*class="taskdetail"[\s\S]*YkMisiones\.stepsHtml\(g\.tasks\)[\s\S]*<\/section>/);
  assert.match(html,/\.taskmission\{width:max-content;min-width:100%/);
});

test("deploy sella los dos módulos nuevos",()=>{
  // Desde el 7-ago el deploy sella por PATRÓN y no por lista: la lista se quedaba
  // corta cada vez que nacía un fichero (yk-cabezal y otros cinco pasaron meses sin
  // sellar, sirviéndose de caché hasta 4 h). Lo que este test debe garantizar es que
  // estos dos módulos SE SELLAN, no la línea concreta que lo hace; así que se
  // comprueba el efecto: aplicar la regla del deploy a su ruta le pone el sello.
  const SELLA = `.replace(/\\/(yk-[a-z0-9-]+\\.(?:js|css))(?:\\?v=[A-Za-z0-9._%+-]+)?/g, "/$1?v=" + stamp)`;
  const sella = (r) => r.replace(/\/(yk-[a-z0-9-]+\.(?:js|css))(?:\?v=[A-Za-z0-9._%+-]+)?/g, "/$1?v=SELLO");
  assert.ok(deploy.includes(SELLA), "el deploy sella el marco por patrón");
  for (const f of ["yk-tareas-sort.js","yk-tareas-columns.js"]) {
    assert.equal(sella("/"+f), "/"+f+"?v=SELLO", `${f} recibe el sello`);
    assert.equal(sella("/"+f+"?v=r9"), "/"+f+"?v=SELLO", `${f} se RE-sella`);
  }
});
