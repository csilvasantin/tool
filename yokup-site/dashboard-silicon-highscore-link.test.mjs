// FLT-1516 · Responsable Silicio enlaza a su detalle factual en Highscore.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source=await readFile(new URL("./dashboard.html",import.meta.url),"utf8");
const identitySource=await readFile(new URL("./yk-agent-identity.js",import.meta.url),"utf8");
const detailSource=await readFile(new URL("./highscore-detail.js",import.meta.url),"utf8");
const window={};
new Function("window",identitySource+"\n"+detailSource)(window);
const familySource=source.slice(source.indexOf("function paFamilyId(value,machine)"),source.indexOf("function paAgentRole(value)"));
const helperSource=source.slice(source.indexOf("function paHighscoreAgent(value,machine)"),source.indexOf("function paProjectResponsibles(project,silicon)"));
const api=new Function("window","ykAgentIdentity","YkHighscoreDetail",familySource+helperSource+";return {paHighscoreAgent,paHighscoreDetailUrl};")(window,window.ykAgentIdentity,window.YkHighscoreDetail);

test("canoniza el responsable principal y no fabrica agentes desde un equipo",()=>{
  assert.equal(api.paHighscoreAgent("NeoMini","Mac Mini"),"NeoMacMini");
  assert.equal(api.paHighscoreAgent("SubNeoMini","Mac Mini"),"NeoMacMini");
  assert.equal(api.paHighscoreAgent("OraculoMBP16","Mac Mini"),"OraculoMBP16");
  assert.equal(api.paHighscoreAgent("","Mac Mini"),"");
  assert.equal(api.paHighscoreAgent("Persona desconocida","Mac Mini"),"");
});

test("construye el destino completo que exige Highscore Detail",()=>{
  assert.equal(api.paHighscoreDetailUrl("NeoMacMini","pixeria"),"/highscoreDetail?agent=NeoMacMini&project_id=pixeria&period=today&type=all&order=desc");
  assert.equal(api.paHighscoreDetailUrl("NeoMacMini","proyecto con espacio"),"/highscoreDetail?agent=NeoMacMini&project_id=proyecto+con+espacio&period=today&type=all&order=desc");
});

test("renderiza enlace accesible sólo con identidad canónica válida",()=>{
  assert.match(source,/<a class="pa-silicon-link" data-pa-silicon-link href=/);
  assert.match(source,/aria-label="Abrir detalle de Highscore de /);
  assert.match(source,/siliconMarkup=agent\?[\s\S]*?:'<span>👤 '\+esc\(silicon\|\|"Sin asignar"\)/);
  assert.match(source,/const primaryId=paHighscoreAgent\(silicon,assignedTeams\[0\]\|\|""\)/);
});

test("el enlace conserva navegación nativa y no pliega ni arrastra la ficha",()=>{
  assert.match(source,/querySelectorAll\("\[data-pa-silicon-link\]"\)/);
  assert.match(source,/link\.onclick=event=>event\.stopPropagation\(\)/);
  assert.match(source,/link\.onpointerdown=event=>event\.stopPropagation\(\)/);
  assert.match(source,/link\.onkeydown=event=>event\.stopPropagation\(\)/);
  assert.match(source,/link\.ondragstart=event=>event\.preventDefault\(\)/);
  assert.match(source,/\.pa-silicon-link:focus-visible\{[^}]*outline:2px solid var\(--brand\)/);
});
