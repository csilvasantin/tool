import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const SELLA_MARCO = `.replace(/\\/(yk-[a-z0-9-]+\\.(?:js|css))(?:\\?v=[A-Za-z0-9._%+-]+)?/g, "/$1?v=" + stamp)`;
const sellado = (ruta) => ruta.replace(/\/(yk-[a-z0-9-]+\.(?:js|css))(?:\?v=[A-Za-z0-9._%+-]+)?/g, "/$1?v=SELLO");

const html=await readFile(new URL("./informes.html",import.meta.url),"utf8");
const deploy=await readFile(new URL("./deploy.mjs",import.meta.url),"utf8");
const start=html.indexOf("function compactMissionRef");
const end=html.indexOf("function render(list)",start);
assert.ok(start>0&&end>start,"no se encontró el presentador de misión");
const context=vm.createContext({});
vm.runInContext(html.slice(start,end)+"\nthis.compactMissionRef=compactMissionRef;this.missionPresentation=missionPresentation;",context);

test("DCL usa Misión como lenguaje visible y conserva el id copiable",()=>{
  const row={mission_id:"DCL-mshrt2y9ekot",mission_display_ref:"0047.06/08/2026.19:09"};
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.missionPresentation(row))),
    {id:"DCL-mshrt2y9ekot",primary:"Misión 0047",secondary:"06/08 · 19:09",copy:true}
  );
  assert.match(html,/data-copy-mission=/);
  assert.match(html,/navigator\.clipboard\.writeText\(id\)/);
  assert.match(html,/title="Abrir \$\{kind==="mission"\?"misión":"tarea"\} · ID técnico/);
});

test("FLT deja de ser visible y se presenta como Misión",()=>{
  const row={mission_id:"FLT-1234",mission_display_ref:"0048.06/08/2026.19:10"};
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.missionPresentation(row))),
    {id:"FLT-1234",primary:"Misión 1234",secondary:"06/08 · 19:10",copy:true}
  );
});

test("sin display_ref no expone un id opaco como título",()=>{
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.missionPresentation({mission_id:"MIS-DEC-opaca"}))),
    {id:"MIS-DEC-opaca",primary:"Misión",secondary:"",copy:true}
  );
});

test("la tarea se rotula explícitamente y móvil no usa elipsis para la referencia",()=>{
  assert.match(html,/\$\{kind==="mission"\?"Informe de misión":"Tarea"\} \$\{esc\(taskCode\)\}/);
  assert.match(html,/\.mid\{[^}]*overflow-wrap:anywhere/);
  assert.match(html,/\.mref\{[^}]*overflow-wrap:anywhere/);
  assert.doesNotMatch(html,/\.mid\{[^}]*text-overflow:ellipsis/);
  assert.doesNotMatch(html,/\.mref\{[^}]*text-overflow:ellipsis/);
});

test("el deploy sella el sorter para que producción no conserve el orden antiguo",()=>{
  // El deploy sella por PATRÓN desde el 7-ago (la lista a mano dejaba fuera
  // ficheros enteros). Se comprueba el EFECTO: la regla del deploy pone y
  // repone el sello en estas rutas.
  assert.ok(deploy.includes(SELLA_MARCO), "el deploy sella el marco por patrón");
  assert.equal(sellado("/yk-informes-sort.js"), "/yk-informes-sort.js?v=SELLO", "yk-informes-sort.js recibe el sello");
  assert.equal(sellado("/yk-informes-sort.js?v=r9"), "/yk-informes-sort.js?v=SELLO", "yk-informes-sort.js se RE-sella");
  assert.equal(sellado("/yk-informes-columns.js"), "/yk-informes-columns.js?v=SELLO", "yk-informes-columns.js recibe el sello");
  assert.equal(sellado("/yk-informes-columns.js?v=r9"), "/yk-informes-columns.js?v=SELLO", "yk-informes-columns.js se RE-sella");
  assert.equal(sellado("/yk-informes-groups.js"), "/yk-informes-groups.js?v=SELLO", "yk-informes-groups.js recibe el sello");
  assert.equal(sellado("/yk-informes-groups.js?v=r9"), "/yk-informes-groups.js?v=SELLO", "yk-informes-groups.js se RE-sella");
      });
