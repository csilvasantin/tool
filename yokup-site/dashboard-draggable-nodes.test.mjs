import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./dashboard.html",import.meta.url),"utf8");

function functionSource(name){
  const start=source.indexOf(`function ${name}(`);assert.notEqual(start,-1,`falta ${name}`);
  const brace=source.indexOf("{",start);let depth=0,quote="",escaped=false;
  for(let index=brace;index<source.length;index++){
    const char=source[index];
    if(quote){if(escaped)escaped=false;else if(char==="\\")escaped=true;else if(char===quote)quote="";continue;}
    if(char==='"'||char==="'"||char==='`'){quote=char;continue;}
    if(char==="{")depth++;else if(char==="}"&&--depth===0)return source.slice(start,index+1);
  }
  throw new Error(`función ${name} incompleta`);
}

const geometry=new Function(`${functionSource("paNodeKey")}
${functionSource("paNodeBounds")}
${functionSource("paClampNodeOffset")}
return {paNodeKey,paNodeBounds,paClampNodeOffset};`)();

test("las claves separan proyectos, Silicio y Carbono entre repintados",()=>{
  assert.equal(geometry.paNodeKey("project","yokup"),"project|yokup");
  assert.equal(geometry.paNodeKey("silicon-agent","family|NeoMacMini"),"silicon-agent|family|NeoMacMini");
  assert.equal(geometry.paNodeKey("carbon-agent","carlos"),"carbon-agent|carlos");
  assert.match(source,/const NODE_OFFSETS=new Map\(\);[\s\S]*function paRender\(\)/);
  assert.match(source,/paNodeKey\("silicon-agent",agent\.instanceId\)/);
  assert.match(source,/paNodeKey\("carbon-agent",agent\.key\)/);
});

test("el desplazamiento se limita de forma determinista al mapa visible",()=>{
  const bounds=geometry.paNodeBounds(
    {left:120,right:220,top:80,bottom:130},
    {left:100,right:300,top:50,bottom:200},
    {x:20,y:-10}
  );
  assert.deepEqual(bounds,{minX:0,maxX:100,minY:-40,maxY:60});
  assert.deepEqual(geometry.paClampNodeOffset({x:500,y:-500},bounds),{x:100,y:-40});
  assert.deepEqual(geometry.paClampNodeOffset({x:45.6,y:20.4},bounds),{x:46,y:20});
});

test("proyectos y agentes visibles reciben asa propia sin reutilizar enlaces ni acciones",()=>{
  const render=functionSource("paRender"),carbon=functionSource("paCarbonAgentsMarkup");
  assert.match(render,/paNodeMoveHandle\(nodeKey,project\.name\|\|project\.id\)/);
  assert.match(render,/paNodeMoveHandle\(nodeKey,agent\.id\)/);
  assert.match(carbon,/paNodeMoveHandle\(nodeKey,agent\.name\)/);
  assert.match(render,/data-pa-node-key="'\+esc\(nodeKey\)\+'" style="'\+paNodeVars\(nodeKey\)/);
  assert.match(carbon,/data-pa-node-key="'\+esc\(nodeKey\)\+'"/);
});

test("el puntero mueve sólo su gesto y recalcula nexos durante y después",()=>{
  const start=functionSource("paStartNodeMove"),move=functionSource("paMoveNode"),end=functionSource("paEndNodeMove");
  assert.match(start,/event\.preventDefault\(\);event\.stopPropagation\(\)/);
  assert.match(start,/event\.button!==0/);
  assert.match(move,/event\.pointerId!==NODE_DRAG\.pointerId/);
  assert.match(move,/paSetNodeOffset\([\s\S]*paDrawLinks\(\)/);
  assert.match(end,/event&&event\.pointerId!==NODE_DRAG\.pointerId/);
  assert.match(end,/requestAnimationFrame\(paRefreshNodeLayout\)/);
  assert.match(source,/handle\.onclick=event=>\{event\.preventDefault\(\);event\.stopPropagation\(\);\}/);
  assert.match(source,/handle\.onlostpointercapture=paEndNodeMove/);
});

test("teclado y lector de pantalla ofrecen movimiento y centrado equivalentes",()=>{
  const handle=functionSource("paNodeMoveHandle"),keyboard=functionSource("paKeyNodeMove");
  assert.match(handle,/aria-describedby="projectAgentMoveHelp"/);
  assert.match(handle,/aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home"/);
  assert.match(source,/id="projectAgentMoveHelp"[^>]*>Mueve la ficha con las flechas/);
  assert.match(keyboard,/event\.key==="Home"/);
  assert.match(keyboard,/event\.shiftKey\?30:10/);
  assert.match(keyboard,/paMessage\(handle\.dataset\.paNodeLabel/);
});

test("refresh, resize y scroll conservan posiciones y vuelven a unir los extremos",()=>{
  const reconcile=functionSource("paConstrainVisibleNodes"),refresh=functionSource("paRefreshNodeLayout");
  assert.match(reconcile,/querySelectorAll\("\[data-pa-node-key\]"\)/);
  assert.match(reconcile,/paClampNodeOffset\(base,paNodeBounds/);
  assert.match(refresh,/paConstrainVisibleNodes\(\);paDrawLinks\(\)/);
  assert.match(source,/requestAnimationFrame\(paRefreshNodeLayout\)/);
  assert.match(source,/window\.addEventListener\("resize",\(\)=>requestAnimationFrame\(paRefreshNodeLayout\)\)/);
  assert.match(source,/projectAgentScroll"\)\.addEventListener\("scroll",\(\)=>requestAnimationFrame\(paDrawLinks\)\)/);
  assert.match(source,/new ResizeObserver\(\(\)=>requestAnimationFrame\(paRefreshNodeLayout\)\)/);
});

test("en móvil se conserva el orden lógico sin transformaciones ni asas",()=>{
  assert.match(source,/\.pa-col,\.pa-project-node,\.pa-team-node,\.pa-agent-node,\.pa-carbon-node\{transform:none!important\}/);
  assert.match(source,/\.pa-move,\.pa-card-move\{display:none\}/);
  assert.match(functionSource("paConstrainVisibleNodes"),/matchMedia\("\(max-width:900px\)"\)\.matches\)return/);
});
