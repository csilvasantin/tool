import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const source=await readFile(new URL("./dashboard.html",import.meta.url),"utf8");

test("el Pulso se presenta como Flota de Agentes Silicio con dos grupos principales",()=>{
  assert.match(source,/<summary class="shd">Flota de Agentes Silicio /);
  assert.doesNotMatch(source,/<summary class="shd">Pulso de la flota /);
  assert.match(source,/<h3 id="pulseCliTitle">Agentes CLI<\/h3>/);
  assert.match(source,/<h3 id="pulseAppTitle">Agentes Desktop App<\/h3>/);
  assert.match(source,/data-pulse-group="\$\{esc\(key\)\}" aria-labelledby="\$\{esc\(id\)\}"/);
});

test("el renderer consume la clasificación compartida y no vuelve a decidir el host",()=>{
  assert.match(source,/src="\/presence-groups\.js\?v=/);
  assert.match(source,/YkPresenceGroups\.classify\(fresh,\{identity:window\.ykAgentIdentity,detailUrl:window\.YkAgentDetail&&YkAgentDetail\.detailUrl\}\)/);
  assert.match(source,/const byKey=classified&&classified\.by_key\|\|\{\}/);
  assert.match(source,/unknown\.items\.length\?pulseGroupMarkup\(unknown,unavailable\):""/);
  assert.doesNotMatch(source,/fresh\.filter\([^\n]*host/);
});

test("cada grupo tiene contador accesible y un vacío específico y honesto",()=>{
  assert.match(source,/aria-live="polite" aria-atomic="true" aria-label="\$\{count\} agente/);
  assert.match(source,/No hay agentes CLI con señal reciente\./);
  assert.match(source,/No hay agentes Desktop App con señal reciente\./);
  assert.match(source,/Sin superficie identificada/);
  assert.match(source,/No se pudo comprobar esta superficie; se reintentará automáticamente\./);
});

test("las tarjetas y enlaces de detalle son únicos y se reutilizan en todos los grupos",()=>{
  assert.match(source,/function pulseCard\(p\)/);
  assert.match(source,/items\.map\(pulseCard\)\.join\(""\)/);
  assert.match(source,/class="ag ag-link"/);
  assert.match(source,/p\.detail_url\|\|/);
  assert.match(source,/setInterval\(pulse,AGENT_REFRESH_MS\)/);
});

test("un pulso idéntico no reconstruye el nodo enfocado",()=>{
  const paint=source.match(/const PA_PAINTED=\{\};\s*function paPaint\(box,html\)\{[^}]+\}/)?.[0];
  assert.ok(paint,"debe existir el pintado idempotente compartido");
  const context={};vm.runInNewContext(`${paint}\nthis.paint=paPaint;`,context);
  let writes=0,node=null;
  const box={id:"pulse"};Object.defineProperty(box,"innerHTML",{set(){writes+=1;node={write:writes,focused:false};}});
  assert.equal(context.paint(box,"<a>Oraculo</a>"),true);
  const focused=node;focused.focused=true;
  assert.equal(context.paint(box,"<a>Oraculo</a>"),false);
  assert.equal(writes,1);assert.equal(node,focused);assert.equal(node.focused,true);
  assert.match(source,/catch\(e\)\{[^}]*paPaint\(box,pulseGroupsMarkup\(null,true\)\)/);
  assert.match(source,/if\(!classified\)\{paPaint\(box,pulseGroupsMarkup\(null,true\)\)/);
  assert.match(source,/paPaint\(box,pulseGroupsMarkup\(classified\)\)/);
  assert.doesNotMatch(source,/box\.innerHTML=pulseGroupsMarkup/);
});

test("los grupos se apilan en móvil sin alterar sus tarjetas",()=>{
  assert.match(source,/\.fleet-pulse-groups\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(source,/@media\(max-width:760px\)\{\.fleet-pulse-groups\{grid-template-columns:1fr\}/);
  assert.match(source,/\.pulse\{grid-template-columns:1fr\}/);
});
