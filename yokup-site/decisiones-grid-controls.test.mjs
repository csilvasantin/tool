import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./yk-decisiones-grid.js",import.meta.url),"utf8");
const page=await readFile(new URL("./decisiones.html",import.meta.url),"utf8");
const deploy=await readFile(new URL("./deploy.mjs",import.meta.url),"utf8");
const keys=["agent","project","decision","result","state","time"];

function control(kind,key){
  const attrs={},classes=new Set();
  return {dataset:{[kind==="resize"?"decisionResize":"decisionSort"]:key},attrs,
    classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},
    setAttribute:(name,value)=>{attrs[name]=String(value);},focus(){this.focused=true;},setPointerCapture(){},
    closest(selector){if(kind==="resize"&&selector.includes("decision-resize"))return this;if(kind==="sort"&&selector.includes("decision-sort"))return this;return null;},classes};
}
function harness(saved={}){
  const rootListeners={},listeners={},stored=new Map(Object.entries(saved)),styles={},cells={},handles={},buttons={},arrows={};
  keys.forEach(key=>{handles[key]=control("resize",key);buttons[key]=control("sort",key);arrows[key]={textContent:""};cells[key]={attrs:{},setAttribute(name,value){this.attrs[name]=String(value);},querySelector(selector){if(selector===".decision-sort-button")return buttons[key];if(selector===".decision-col-resize")return handles[key];if(selector===".decision-sort-arrow")return arrows[key];return null;}};});
  const head={attrs:{},setAttribute(name,value){this.attrs[name]=String(value);},querySelector(selector){const match=selector.match(/data-decision-col="([^"]+)/);return match?cells[match[1]]:null;}};
  const parent={children:[],appendChild(row){this.children=this.children.filter(x=>x!==row);this.children.push(row);}};
  const makeRow=(id,attrs)=>{const row={id,parentNode:parent,getAttribute:name=>attrs[name]||""};parent.children.push(row);return row;};
  const rows=[makeRow("z",{"data-sort-project":"zeta","data-sort-time":"20"}),makeRow("a1",{"data-sort-project":"alpha","data-sort-time":"10"}),makeRow("a2",{"data-sort-project":"alpha","data-sort-time":""})];
  const container={ownerDocument:null,style:{setProperty:(key,value)=>{styles[key]=value;}},
    addEventListener:(type,handler)=>{listeners[type]=handler;},contains:()=>false,
    querySelector(selector){return selector===".decision-grid-head"?head:null;},
    querySelectorAll(selector){if(selector===".decision-grid-row")return parent.children.slice();if(selector==="[data-decision-resize]")return Object.values(handles);return [];}};
  const storage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)};
  const context=vm.createContext({addEventListener:(type,handler)=>{rootListeners[type]=handler;},globalThis:null,Intl,Promise});context.globalThis=context;
  vm.runInContext(source,context);const api=context.YkDecisionesGrid.mount(container,{storage,widthKey:"widths",sortKey:"sort"});
  const calls={prevent:0,stop:0};const event=(target,extra={})=>({target,preventDefault(){calls.prevent++;},stopPropagation(){calls.stop++;},...extra});
  return {api,stored,styles,cells,handles,buttons,arrows,parent,rows,listeners,rootListeners,event,calls,context};
}

test("módulo no-op fuera de mode full cuando no existe #decisionGrid",()=>{
  const context=vm.createContext({globalThis:null});context.globalThis=context;vm.runInContext(source,context);
  assert.equal(context.YkDecisionesGrid.mount(null),null);
  assert.match(page,/YkDecisionesGrid\.mount\(document\.getElementById\("decisionGrid"\)\)/);
});

test("seis columnas reciben variables, límites y ARIA de resize",()=>{
  const h=harness({widths:JSON.stringify({agent:999,decision:10})});
  assert.deepEqual(Object.keys(h.api.widths),keys);assert.equal(h.api.widths.agent,320);assert.equal(h.api.widths.decision,200);
  for(const key of keys){assert.equal(h.styles["--decision-col-"+key],h.api.widths[key]+"px");assert.equal(h.handles[key].attrs.role,"separator");assert.equal(h.handles[key].attrs["aria-orientation"],"vertical");assert.equal(h.handles[key].attrs.tabindex,"0");assert.ok(h.handles[key].attrs["aria-valuenow"]);assert.ok(h.handles[key].attrs["aria-valuetext"]);assert.ok(h.handles[key].attrs["aria-label"]);}
  assert.equal(h.cells.agent.attrs.role,"columnheader");assert.equal(h.cells.agent.attrs["aria-sort"],"none");
});

test("sort asc/desc es estable, persiste y deja vacíos al final",()=>{
  const h=harness();
  h.listeners.click(h.event(h.buttons.project));
  assert.deepEqual(h.parent.children.map(row=>row.id),["a1","a2","z"]);
  assert.equal(h.cells.project.attrs["aria-sort"],"ascending");assert.equal(h.arrows.project.textContent,"▲");
  h.listeners.click(h.event(h.buttons.project));
  assert.deepEqual(h.parent.children.map(row=>row.id),["z","a1","a2"]);
  assert.equal(h.cells.project.attrs["aria-sort"],"descending");assert.deepEqual(JSON.parse(h.stored.get("sort")),{key:"project",dir:"desc"});
  h.listeners.click(h.event(h.buttons.time));
  assert.deepEqual(h.parent.children.map(row=>row.id),["a1","z","a2"],"tiempo numérico ascendente y vacío al final");
});

test("pointer unifica ratón/touch, cancela con limpieza y no propaga al sort",()=>{
  const h=harness(),handle=h.handles.agent;
  h.listeners.pointerdown(h.event(handle,{clientX:100,pointerId:2}));assert.ok(handle.classes.has("dragging"));
  h.rootListeners.pointermove(h.event(handle,{clientX:150}));assert.equal(h.api.widths.agent,200);
  h.rootListeners.pointercancel(h.event(handle));assert.ok(!handle.classes.has("dragging"));assert.equal(JSON.parse(h.stored.get("widths")).agent,200);
  const before=h.calls.stop;h.listeners.click(h.event(handle));assert.ok(h.calls.stop>before);assert.equal(h.api.getSort(),null);
});

test("teclado, Shift y doble clic ajustan o restauran sin perder accesibilidad",()=>{
  const h=harness(),handle=h.handles.agent;
  h.listeners.keydown(h.event(handle,{key:"ArrowRight",shiftKey:false}));assert.equal(h.api.widths.agent,158);
  h.listeners.keydown(h.event(handle,{key:"ArrowRight",shiftKey:true}));assert.equal(h.api.widths.agent,182);
  h.listeners.keydown(h.event(handle,{key:"ArrowLeft",shiftKey:false}));assert.equal(h.api.widths.agent,174);
  for(const key of ["Home","Enter"," "]){h.api.setWidth("agent",210);h.listeners.keydown(h.event(handle,{key,shiftKey:false}));assert.equal(h.api.widths.agent,150);}
  h.api.setWidth("agent",220);h.listeners.dblclick(h.event(handle));assert.equal(h.api.widths.agent,150);
});

test("el módulo observa rerender, conserva foco y no altera el responsive de A",()=>{
  assert.match(source,/new root\.MutationObserver\(scheduleRefresh\)/);
  assert.match(source,/if\(arrow&&arrow\.textContent!==mark\)arrow\.textContent=mark/,"el observer no se realimenta al reescribir la misma flecha");
  assert.match(source,/var restore=!!lastFocus&&\(!active\|\|active===doc\.body\);apply\(restore\)/);
  assert.match(source,/restoreFocus\(\)/);
  assert.match(source,/@media\(max-width:720px\)\{\.decision-col-resize/);
  assert.doesNotMatch(source,/\.decision-grid-row\{[^}]*min-width/);
  assert.match(source,/button\.dataset\.decisionSort=key[\s\S]*cell\.appendChild\(button\)[\s\S]*cell\.appendChild\(handle\)/,"botón y handle son hermanos");
});

test("el deploy cache-bustea renderer y controles de decisiones",()=>{
  assert.match(deploy,/\/yk-decisions\\\.js/);
  assert.match(deploy,/\/yk-decisiones-grid\\\.js/);
  assert.match(deploy,/"\/yk-decisions\.js\?v=" \+ stamp/);
  assert.match(deploy,/"\/yk-decisiones-grid\.js\?v=" \+ stamp/);
});
