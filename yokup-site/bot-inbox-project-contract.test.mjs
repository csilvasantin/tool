import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=name=>readFile(new URL(name,import.meta.url),"utf8");
const [head,missions,ideas,objectives,status,rtc]=await Promise.all([
  read("./yk-cabezal.js"),read("./misiones.html"),read("./ideas.html"),
  read("./objetivos.html"),read("./status.html"),read("../yokup-rtc/src/index.js")
]);

test("inventario completo de altas bot-inbox no deja productores ocultos",()=>{
  const literal=[...head.matchAll(/fetch\([^\n]+\/api\/bot-inbox["']/g),...missions.matchAll(/fetch\([^\n]+\/api\/bot-inbox["']/g),
    ...ideas.matchAll(/fetch\([^\n]+\/api\/bot-inbox["']/g),...objectives.matchAll(/fetch\([^\n]+\/api\/bot-inbox["']/g)];
  assert.equal(literal.length,3,"cabezal + formalizar + hija; ideas/objetivos ya usan decisiones");
  assert.equal((status.match(/fetch\(TG_INBOX_POST/g)||[]).length,1,"status conserva un único compositor explícitamente no-misión");
  assert.doesNotMatch(ideas,/\/api\/bot-inbox/); assert.doesNotMatch(objectives,/\/api\/bot-inbox/);
});

test("toda alta de misión lleva proyecto exacto y comprueba su rechazo de sync",()=>{
  assert.match(head,/project_id: projectId/); assert.match(head,/sync\.rejected[\s\S]*item\.inbox_id[\s\S]*d\.id/);
  const formalize=missions.slice(missions.indexOf('const texto="[misión formalizada'),missions.indexOf("// ====",missions.indexOf('const texto="[misión formalizada')));
  assert.match(formalize,/project_id:PROJECT_SCOPE/); assert.match(formalize,/sd\.rejected[\s\S]*item\.inbox_id[\s\S]*d\.id/);
  const child=missions.slice(missions.indexOf('const kind=b.dataset.childKind'),missions.indexOf("// ----",missions.indexOf('const kind=b.dataset.childKind')+20));
  assert.match(child,/project_id:projectId,parent_id:madre/); assert.match(child,/sd\.rejected[\s\S]*item\.inbox_id[\s\S]*d\.id/);
});

test("status declara conversación no materializable y backend respeta la marca",()=>{
  assert.match(status,/from:'status-web',materialize_mission:false/);
  assert.match(rtc,/if \(it && it\.materialize_mission === false\) return false/);
});
