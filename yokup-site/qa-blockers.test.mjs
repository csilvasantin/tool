import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
const read=p=>readFile(new URL(p,import.meta.url),"utf8");

test("Informes recompone identidad física y respeta identidad del worker",async()=>{
  const html=await read("./informes.html"),pdf=await read("./informe-pdf.js"),id=await read("./yk-agent-identity.js"),ctx={window:{}};
  ctx.window.window=ctx.window;vm.runInNewContext(id,ctx);ctx.ykAgentIdentity=ctx.window.ykAgentIdentity;
  const f=ctx.window.ykAgentIdentity.reportDisplay;
  assert.equal(f("Morfeo","MacBook Pro 16"),"MorfeoMBP16");
  assert.equal(f("Oraculo","Mac Mini"),"OraculoMacMini");
  assert.equal(f("SubOraculo","Mac Mini"),"SubOraculoMacMini");
  assert.equal(f("InfraMorfeo","MacBook Pro 16"),"InfraMorfeoMBP16");
  assert.equal(f("Neo","MacBook Pro 14"),"Neo14");
  assert.equal(f("Smith","MacBook Air Azul"),"Agente Smith Azul");
  assert.equal(f("SubSmith","MacBook Air Rosa"),"SubAgente Smith Rosa");
  assert.equal(f("InfraSmith","MacBook Air Crema"),"InfraAgente Smith Crema");
  assert.equal(f("Smith","MacBook Air Plata"),"Agente Smith Plata");
  assert.equal(f("Smith","MacBookAir16plata"),"Agente Smith Plata16");
  assert.equal(f("Externo","Mac Mini"),"Externo");
  assert.equal(f("Oraculo",""),"Oraculo");
  assert.match(html,/if\(t\.agent_identity\) return t\.agent_identity/);
  assert.match(html,/t\.mission&&t\.mission\.machine/);
  assert.match(html,/yk-agent-identity\.js/);
  assert.match(pdf,/reportDisplay\(t\.owner/);
});
test("Objetivos conserva creación diaria y bulk canónico en ambas vistas",async()=>{const s=await read("./objetivos.html");assert.match(s,/scheduled_for:\$\("#boardDay"\)\.value\|\|TODAY/);assert.match(s,/body:JSON\.stringify\(\{ids,status\}\)/);assert.match(s,/confirm\("Cambiar "/);assert.match(s,/function listRow[\s\S]*data-bulk-id/);});
test("A-B-C vive sólo en la columna Tareas de Misiones",async()=>{const js=await read("./yk-misiones.js"),html=await read("./misiones.html"),css=await read("./yk-misiones.css");assert.match(js,/CFG\.columnMode === "tasks" \? tasksAbcHtml\(t\)/);assert.doesNotMatch(js,/progHtml\(t\._prog\) \+\s*tasksAbcHtml/);assert.match(js,/closest\("\.abc-task"\)/);assert.match(html,/columnMode:"tasks"/);assert.match(html,/col\("ordenador","Tareas"\)/);assert.match(css,/\.abc-task/);});
