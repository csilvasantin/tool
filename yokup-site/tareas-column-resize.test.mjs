import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const html=await readFile(new URL("./tareas.html",import.meta.url),"utf8");
const source=await readFile(new URL("./yk-tareas-columns.js",import.meta.url),"utf8");

function harness(saved={}){
  const rootListeners={},containerListeners={},stored=new Map(Object.entries(saved));
  const styleValues={},handles=[];
  const storage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)};
  const container={
    style:{setProperty:(key,value)=>{styleValues[key]=value;}},
    querySelectorAll:()=>handles,
    addEventListener:(type,handler)=>{containerListeners[type]=handler;}
  };
  const context=vm.createContext({addEventListener:(type,handler)=>{rootListeners[type]=handler;},globalThis:null});
  context.globalThis=context;vm.runInContext(source,context);
  const specs={
    who:{label:"Agente/Plataforma",default:170,min:120,max:340},
    mis:{label:"Misión",default:296,min:220,max:640}
  };
  const api=context.YkTareasColumns.mount(container,specs,{storage,storageKey:"widths"});
  const classes=new Set();
  const handle={dataset:{taskResize:"who"},attrs:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},
    closest:()=>handle,setAttribute:(key,value)=>{handle.attrs[key]=value;},setPointerCapture:()=>{}};
  handles.push(handle);api.apply();
  const calls={prevent:0,stop:0};
  const event=(extra={})=>({target:handle,preventDefault(){calls.prevent++;},stopPropagation(){calls.stop++;},...extra});
  return {api,stored,styleValues,handle,classes,containerListeners,rootListeners,event,calls};
}

test("los cinco cabezales tienen un separador propio y separado del futuro sort",()=>{
  assert.match(html,/const _columnHead=/);
  for(const key of ["who","id","mis","ord","est"]){
    assert.match(html,new RegExp('_columnHead\\("'+key+'","'));
  }
  assert.match(html,/class="task-col-label">'\+label\+'<\/span><span class="task-col-resize"/);
  assert.match(html,/data-task-resize="'\+key\+'" role="separator" aria-orientation="vertical" tabindex="0"/);
  assert.doesNotMatch(html,/data-task-resize[^>]*data-sort/);
});

test("anchos restaurados se limitan, aplican al tablero completo y persisten",()=>{
  const h=harness({widths:JSON.stringify({who:999,mis:20})});
  assert.equal(h.api.widths.who,340);assert.equal(h.api.widths.mis,220);
  assert.equal(h.styleValues["--c-who"],"340px");assert.equal(h.styleValues["--c-mis"],"220px");
  assert.equal(h.handle.attrs["aria-valuemin"],"120");assert.equal(h.handle.attrs["aria-valuemax"],"340");
  assert.equal(h.handle.attrs["aria-valuenow"],"340");assert.equal(h.handle.attrs["aria-valuetext"],"340 píxeles");
  assert.match(h.handle.attrs["aria-label"],/Redimensionar columna Agente\/Plataforma/);
  h.api.set("who",184);assert.equal(JSON.parse(h.stored.get("widths")).who,184);
  assert.match(html,/TASK_COLUMNS\.apply\(\);[\s\S]*YkMisiones\.bindRows\(box\)/);
});

test("pointer cubre ratón y touch, pointercancel cierra y el gesto no propaga",()=>{
  const h=harness();
  h.containerListeners.pointerdown(h.event({clientX:100,pointerId:7}));
  assert.ok(h.classes.has("dragging"));assert.ok(h.calls.stop>0);
  h.rootListeners.pointermove(h.event({clientX:150}));assert.equal(h.api.widths.who,220);
  h.rootListeners.pointercancel(h.event());assert.ok(!h.classes.has("dragging"));
  assert.equal(JSON.parse(h.stored.get("widths")).who,220);
  const before=h.calls.stop;h.containerListeners.click(h.event());assert.ok(h.calls.stop>before);
});

test("teclado ajusta con paso normal o Shift y Home/Intro/Espacio restauran",()=>{
  const h=harness();
  h.containerListeners.keydown(h.event({key:"ArrowRight",shiftKey:false}));assert.equal(h.api.widths.who,178);
  h.containerListeners.keydown(h.event({key:"ArrowRight",shiftKey:true}));assert.equal(h.api.widths.who,202);
  h.containerListeners.keydown(h.event({key:"ArrowLeft",shiftKey:false}));assert.equal(h.api.widths.who,194);
  for(const key of ["Home","Enter"," "]){h.api.set("who",210);h.containerListeners.keydown(h.event({key,shiftKey:false}));assert.equal(h.api.widths.who,170);}
});

test("doble clic restaura y el tablero mantiene scroll y colapso responsive",()=>{
  const h=harness();h.api.set("who",220);h.containerListeners.dblclick(h.event());assert.equal(h.api.widths.who,170);
  assert.match(html,/\.taskboard\{overflow:auto\}/);
  assert.match(html,/\.hd\.project-id-layout\{width:max-content;min-width:100%;grid-template-columns:8px var\(--c-who/);
  assert.match(html,/\.task-col-resize\{[^}]*touch-action:none/);
  assert.match(html,/@media\(max-width:720px\)\{\.hd\.project-id-layout\{grid-template-columns:8px 1fr\}\.hd\.project-id-layout\{width:auto;min-width:0\}\.taskboard\{overflow-x:hidden\}/);
  assert.match(html,/\.taskboard \.tk \.rz\{display:none\}/);
});
