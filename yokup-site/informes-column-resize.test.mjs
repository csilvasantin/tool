import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const html=await readFile(new URL("./informes.html",import.meta.url),"utf8");
const source=await readFile(new URL("./yk-informes-columns.js",import.meta.url),"utf8");

function harness(saved={}){
  const rootListeners={},containerListeners={},values=new Map(Object.entries(saved));
  const styleValues={},handles=[];
  const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  const container={
    style:{setProperty:(key,value)=>{styleValues[key]=value;}},
    querySelectorAll:()=>handles,
    addEventListener:(type,handler)=>{containerListeners[type]=handler;}
  };
  const context=vm.createContext({
    addEventListener:(type,handler)=>{rootListeners[type]=handler;},
    globalThis:null
  });
  context.globalThis=context;
  vm.runInContext(source,context);
  const specs={agente:{label:"Agente",default:138,min:100,max:260}};
  const api=context.YkInformesColumns.mount(container,specs,{storage,storageKey:"widths"});
  const classes=new Set();
  const handle={dataset:{resize:"agente"},attrs:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},
    closest:()=>handle,setAttribute:(key,value)=>{handle.attrs[key]=value;},setPointerCapture:()=>{}};
  handles.push(handle);api.apply();
  const event=(extra={})=>({target:handle,preventDefault(){},stopPropagation(){},...extra});
  return {api,storage,values,styleValues,handle,classes,containerListeners,rootListeners,event};
}

test("Agente encabeza tanto cabeceras como celdas y la ordenación sigue intacta",()=>{
  assert.match(html,/const SORT_COLUMNS=\[\s*\["agente","Agente"\],\["mision","Misión"\]/);
  const row=html.slice(html.indexOf('return `<div class="grow item"'),html.indexOf('}).join("");',html.indexOf('return `<div class="grow item"')));
  assert.ok(row.indexOf("ykAvatar.html(agent)")<row.indexOf('class="gc mis"'));
  assert.match(html,/role="columnheader" aria-sort=/);
  assert.match(html,/class="sort-head" type="button" data-sort=/);
});

test("anchos restaurados se validan, aplican y persisten por columna",()=>{
  const h=harness({widths:JSON.stringify({agente:999})});
  assert.equal(h.api.widths.agente,260,"un valor persistido nunca supera el máximo");
  assert.equal(h.styleValues["--col-agente"],"260px");
  assert.equal(h.handle.attrs["aria-valuenow"],"260");
  h.api.set("agente",172);
  assert.equal(JSON.parse(h.values.get("widths")).agente,172);
});

test("flechas redimensionan y teclado accesible restaura el ancho por defecto",()=>{
  const h=harness();
  h.containerListeners.keydown(h.event({key:"ArrowRight",shiftKey:false}));
  assert.equal(h.api.widths.agente,146);
  assert.equal(h.handle.attrs["aria-valuetext"],"146 píxeles");
  assert.match(h.handle.attrs["aria-label"],/Flechas cambian el ancho/);
  h.containerListeners.keydown(h.event({key:"Enter",shiftKey:false}));
  assert.equal(h.api.widths.agente,138);
});

test("pointer unifica ratón y touch, persiste al soltar y doble clic restaura",()=>{
  const h=harness();
  h.containerListeners.pointerdown(h.event({clientX:100,pointerId:4}));
  assert.ok(h.classes.has("dragging"));
  h.rootListeners.pointermove(h.event({clientX:150}));
  assert.equal(h.api.widths.agente,188);
  h.rootListeners.pointerup(h.event());
  assert.equal(JSON.parse(h.values.get("widths")).agente,188);
  assert.ok(!h.classes.has("dragging"));
  h.containerListeners.dblclick(h.event());
  assert.equal(h.api.widths.agente,138);
});

test("la hoja conserva scroll móvil, tirador táctil y límites razonables",()=>{
  assert.match(html,/\.sheet-wrap\{overflow-x:auto/);
  assert.match(html,/\.sheet\{width:max-content;min-width:100%\}/);
  assert.match(html,/\.col-resize\{[^}]*touch-action:none/);
  assert.match(html,/@media\(max-width:640px\)[\s\S]*?\.col-resize\{width:16px/);
  assert.match(html,/role="separator" aria-orientation="vertical" tabindex="0"/);
});
