import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./dashboard.html",import.meta.url),"utf8");

function openingTag(id){
  const match=source.match(new RegExp(`<details\\b[^>]*\\bid=["']${id}["'][^>]*>`));
  assert.ok(match,`falta la sección accesible #${id}`);
  return match[0];
}

function functionSource(name){
  const start=source.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`falta ${name}`);
  const brace=source.indexOf("{",start);let depth=0,quote="",escaped=false;
  for(let i=brace;i<source.length;i++){
    const char=source[i];
    if(quote){if(escaped)escaped=false;else if(char==="\\")escaped=true;else if(char===quote)quote="";continue;}
    if(char==='"'||char==="'"||char==='`'){quote=char;continue;}
    if(char==="{")depth++;else if(char==="}"&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`función ${name} incompleta`);
}

test("la asociación principal nace abierta y precede al contenido secundario",()=>{
  const association=openingTag("projectAgentSection");
  assert.match(association,/\sopen(?:\s|>)/);
  const associationAt=source.indexOf(association);
  for(const id of ["pulseSection","liveExperiencesSection","modulesSection"]){
    assert.ok(associationAt<source.indexOf(openingTag(id)),`#${id} debe quedar debajo de la asociación`);
  }
});

test("Pulso, Xperiencias y Módulos nacen plegados y conservan un summary accesible",()=>{
  for(const [id,label] of [
    ["pulseSection","Pulso de la flota"],
    ["liveExperiencesSection","Xperiencias en vivo"],
    ["modulesSection","Módulos"]
  ]){
    const tag=openingTag(id);
    assert.doesNotMatch(tag,/\sopen(?:\s|>)/,`#${id} no debe ocupar espacio al cargar`);
    const section=source.slice(source.indexOf(tag),source.indexOf("</details>",source.indexOf(tag))+10);
    assert.match(section,new RegExp(`<summary\\b[^>]*>${label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}`));
  }
  assert.match(source,/\.dash-section>\.shd:focus-visible/);
});

test("el botón expone progreso y el ciclo sincroniza proyectos y presencia cada 60 segundos",()=>{
  assert.match(source,/id=["']projectAgentRefresh["'][^>]*aria-(?:label|describedby)=/);
  assert.match(source,/const\s+PROJECT_REFRESH_MS\s*=\s*60000/);
  const reset=functionSource("paResetRefreshCycle"),load=functionSource("paLoad");
  assert.match(reset,/clearTimeout\s*\(/);
  assert.match(reset,/setTimeout\s*\(\s*\(\)\s*=>\s*(?:\{[^}]*paLoad\(["']auto["']\);?[^}]*\}|paLoad\(["']auto["']\))\s*,\s*PROJECT_REFRESH_MS\s*\)/);
  assert.match(load,/paJson\(["']\/projects["']\)/);
  assert.match(load,/pulse\(false\)/);
  assert.match(source,/class=["'][^"']*pa-refresh-progress/);
});

test("un clic en actualizar reinicia el ciclo automático completo",()=>{
  assert.match(source,/pa\(["']projectAgentRefresh["']\)\.onclick\s*=\s*\(\)\s*=>\s*paLoad\(["']manual["']\)/);
  assert.match(functionSource("paLoad"),/paResetRefreshCycle\(\)/);
});

test("el refresco automático no vacía el mapa ni habla por la línea de estado",()=>{
  const load=functionSource("paLoad");
  assert.match(load,/const\s+firstPaint=!PROJECT_LOADED_ONCE/,"el ciclo debe distinguir la primera carga");
  assert.match(load,/if\(firstPaint\)\{[\s\S]*?pa\(["']projectAgentTeams["']\)\.innerHTML=/,"solo la primera carga pinta «cargando»");
  assert.match(load,/if\(reason!=="auto"\)paMessage\(/,"el ciclo automático no debe repetir mensajes de estado");
  assert.match(source,/let\s+PROJECT_LOADED_ONCE=false/);
});

test("los cables se reutilizan entre refrescos y el flujo no reinicia",()=>{
  const sync=functionSource("paSyncLink");
  assert.match(sync,/data-link-key|node\.dataset\.linkKey=key/,"cada unión necesita clave estable agente|proyecto");
  assert.match(sync,/node&&node\.dataset\.linkState!==state/,"solo se recrea el cable si cambia de estado");
  assert.match(sync,/for\(const path of node\.children\)\{path\.setAttribute\("d",curve\);path\.setAttribute\("stroke",color\)/,"redibujar = actualizar atributos, no recrear nodos");
  assert.match(source,/function paDrawLinks\(\)[\s\S]*?if\(!live\.has\(node\.dataset\.linkKey\)\)node\.remove\(\)/,"los cables que ya no existen se retiran uno a uno");
  assert.match(source,/const FLOW_CYCLE_MS=\d+/);
  assert.match(functionSource("paFlowDelay"),/animation-delay:.*FLOW_T0/s,"un cable nuevo entra en la fase del resto, no en el instante cero");
});

test("el pulso de 3 s no repinta fichas si nada ha cambiado",()=>{
  assert.match(functionSource("paPaint"),/PA_PAINTED\[box\.id\]===html/,"mismo HTML = no se toca el DOM");
  assert.match(source,/paPaint\(teamBox,/);
  assert.match(source,/paPaint\(siliconBox,/);
  assert.match(source,/paPaint\(carbonBox,/);
  assert.match(source,/paPaint\(projectsBox,/);
  assert.match(source,/data-pa-ago="/,"el tiempo relativo se rellena aparte para no ensuciar la firma del HTML");
  assert.match(functionSource("paTickAgo"),/data-pa-ago/);
});

test("reduced motion conserva el estado sin animar la barra",()=>{
  assert.match(source,/@media\s*\(prefers-reduced-motion\s*:\s*reduce\)[\s\S]{0,600}\.pa-refresh-progress[^}]*\{[^}]*(?:animation|transition)\s*:\s*none/i);
});
