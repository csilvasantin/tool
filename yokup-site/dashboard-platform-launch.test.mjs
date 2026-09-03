import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./dashboard.html",import.meta.url),"utf8");

test("cada ordenador asociado separa Desktop App de CLI y enseña el catálogo pedido",()=>{
  for(const token of ["Desktop App","CLI · modelo LLM","Claude","Codex","OpenCode","Grok","Nemotron","Qwen"]){
    assert.ok(source.includes(token),`falta ${token}`);
  }
  assert.match(source,/function paLaunchPanel\(team,project\)/);
  assert.match(source,/paProjectHasTeam\(project,team\.key\)/);
  assert.match(source,/data-pa-associate-team/);
  assert.match(source,/pa-team-agents pa-team-platforms[^;]+paLaunchPanel\(team,selectedProject\)/);
  assert.match(source,/\.pa-launch-groups\{display:grid;grid-template-columns:1fr 1fr/);
  assert.match(source,/details\.pa-team-node:not\(\[open\]\)>\.pa-team-agents/);
  assert.doesNotMatch(source,/\n\.pa-team-node:not\(\[open\]\)>\.pa-team-agents/);
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
  assert.match(source,/kind:"machine",ref:team\.machine,remove:false/);
  assert.match(source,/proyecto principal de hoy/);
});

test("Qwen aparece sin fingir disponibilidad mientras ningún watcher lo demuestre",()=>{
  assert.match(source,/choice\.selection==="Qwen"/);
  assert.match(source,/candidates=candidates\.filter\(slot=>\/qwen\/i\.test\(slot\.model\)\)/);
  assert.match(source,/watcher sin modelo Qwen/);
  assert.match(source,/no instalado/);
});
