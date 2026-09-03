import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./dashboard.html",import.meta.url),"utf8");

test("cada ordenador asociado separa Desktop App de CLI y enseña el catálogo pedido",()=>{
  for(const token of ["Desktop App","CLI · modelo LLM","Claude","Codex","OpenCode","Grok","Nemotron","Muse Spark"]){
    assert.ok(source.includes(token),`falta ${token}`);
  }
  assert.match(source,/function paLaunchPanel\(team,project\)/);
  assert.match(source,/paProjectHasTeam\(project,team\.key\)/);
  assert.match(source,/data-pa-associate-team/);
});

test("la flecha del proyecto se arrastra sobre una plataforma concreta",()=>{
  assert.match(source,/data-project-port=/);
  assert.match(source,/data-pa-launch-target=/);
  assert.match(source,/LINK_DRAG=\{kind:project\?"project":"agent"/);
  assert.match(source,/launch\.dataset\.paLaunchTarget/);
  assert.match(source,/paLaunchProject\(drag\.project,launch\.dataset\.paLaunchTarget\)/);
});

test("el lanzamiento persiste el proyecto-máquina y espera confirmación remota",()=>{
  assert.match(source,/paJson\("\/projects\/launch"/);
  assert.match(source,/project:project\.id,machine:target\.machine,persona:target\.persona,runtime:target\.runtime,host:target\.host/);
  assert.match(source,/function paPollLaunch\(commandId,deadline\)/);
  assert.match(source,/\/fleet\/agent\/control\?id=/);
  assert.match(source,/already_running/);
});

test("Muse Spark aparece sin fingir disponibilidad mientras ningún watcher lo demuestre",()=>{
  assert.match(source,/choice\.selection==="Muse Spark"/);
  assert.match(source,/muse\\s\*\[-_ \]\?spark/i);
  assert.match(source,/watcher sin modelo Muse/);
  assert.match(source,/no instalado/);
});
