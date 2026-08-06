import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const html=await readFile(new URL("./informes.html",import.meta.url),"utf8");
const deploy=await readFile(new URL("./deploy.mjs",import.meta.url),"utf8");
const start=html.indexOf("function compactMissionRef");
const end=html.indexOf("function render(list)",start);
assert.ok(start>0&&end>start,"no se encontró el presentador de misión");
const context=vm.createContext({});
vm.runInContext(html.slice(start,end)+"\nthis.compactMissionRef=compactMissionRef;this.missionPresentation=missionPresentation;",context);

test("DCL usa display_ref compacto como título y conserva el id copiable",()=>{
  const row={mission_id:"DCL-mshrt2y9ekot",mission_display_ref:"0047.06/08/2026.19:09"};
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.missionPresentation(row))),
    {id:"DCL-mshrt2y9ekot",primary:"0047 · 06/08 · 19:09",secondary:"",copy:true}
  );
  assert.match(html,/data-copy-mission=/);
  assert.match(html,/navigator\.clipboard\.writeText\(id\)/);
  assert.match(html,/title="Abrir misión · ID técnico/);
});

test("FLT conserva FLT-1234 como referencia principal y añade la humana",()=>{
  const row={mission_id:"FLT-1234",mission_display_ref:"0048.06/08/2026.19:10"};
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.missionPresentation(row))),
    {id:"FLT-1234",primary:"FLT-1234",secondary:"0048 · 06/08 · 19:10",copy:false}
  );
});

test("sin display_ref no inventa una referencia y mantiene el id",()=>{
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.missionPresentation({mission_id:"MIS-DEC-opaca"}))),
    {id:"MIS-DEC-opaca",primary:"MIS-DEC-opaca",secondary:"",copy:true}
  );
});

test("la tarea se rotula explícitamente y móvil no usa elipsis para la referencia",()=>{
  assert.match(html,/>Tarea \$\{esc\(taskCode\)\}/);
  assert.match(html,/\.mid\{[^}]*overflow-wrap:anywhere/);
  assert.match(html,/\.mref\{[^}]*overflow-wrap:anywhere/);
  assert.doesNotMatch(html,/\.mid\{[^}]*text-overflow:ellipsis/);
  assert.doesNotMatch(html,/\.mref\{[^}]*text-overflow:ellipsis/);
});

test("el deploy sella el sorter para que producción no conserve el orden antiguo",()=>{
  assert.match(deploy,/\\\/yk-informes-sort\\\.js/);
  assert.match(deploy,/"\/yk-informes-sort\.js\?v=" \+ stamp/);
});
