import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./yk-objetivos-grid.js",import.meta.url),"utf8");
const page=await readFile(new URL("./objetivos.html",import.meta.url),"utf8");
const deploy=await readFile(new URL("./deploy.mjs",import.meta.url),"utf8");
const keys=["advisor","project","objective","state","date","actions"];

function control(kind,key){
  const attrs={},classes=new Set(),dataKey=kind==="resize"?"objectiveResize":"objectiveSort";
  return {dataset:{[dataKey]:key},attrs,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},
    setAttribute:(name,value)=>{attrs[name]=String(value);},focus(){this.focused=true;},setPointerCapture(){},
    closest(selector){if(kind==="resize"&&selector.includes("objective-resize"))return this;if(kind==="sort"&&selector.includes("objective-sort"))return this;return null;},classes};
}
function harness(saved={}){
  const rootListeners={},listeners={},stored=new Map(Object.entries(saved)),styles={},cells={},handles={},buttons={},arrows={};
  keys.forEach(key=>{handles[key]=control("resize",key);buttons[key]=control("sort",key);arrows[key]={textContent:""};cells[key]={attrs:{},setAttribute(name,value){this.attrs[name]=String(value);},querySelector(selector){if(selector===".objective-sort-button")return buttons[key];if(selector===".objective-col-resize")return handles[key];if(selector===".objective-sort-arrow")return arrows[key];return null;}};});
  const head={attrs:{},setAttribute(name,value){this.attrs[name]=String(value);},querySelector(selector){const match=selector.match(/data-objective-col="([^"]+)/);return match?cells[match[1]]:null;}};
  const parent={children:[],appendChild(row){this.children=this.children.filter(x=>x!==row);this.children.push(row);}};
  const makeRow=(id,attrs)=>{const row={id,parentNode:parent,getAttribute:name=>attrs[name]||""};parent.children.push(row);return row;};
  const rows=[makeRow("z",{"data-sort-project":"zeta","data-sort-date":"20"}),makeRow("a1",{"data-sort-project":"alpha","data-sort-date":"10"}),makeRow("a2",{"data-sort-project":"alpha","data-sort-date":""})];
  const container={ownerDocument:null,style:{setProperty:(key,value)=>{styles[key]=value;}},addEventListener:(type,handler)=>{listeners[type]=handler;},contains:()=>false,
    querySelector:selector=>selector===".objective-grid-head"?head:null,
    querySelectorAll(selector){if(selector===".objective-grid-row")return parent.children.slice();if(selector==="[data-objective-resize]")return Object.values(handles);return [];}};
  const storage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)};
  const context=vm.createContext({addEventListener:(type,handler)=>{rootListeners[type]=handler;},globalThis:null,Intl,Promise});context.globalThis=context;vm.runInContext(source,context);
  const api=context.YkObjetivosGrid.mount(container,{storage,widthKey:"widths",sortKey:"sort"});
  const calls={prevent:0,stop:0};const event=(target,extra={})=>({target,preventDefault(){calls.prevent++;},stopPropagation(){calls.stop++;},...extra});
  return {api,stored,styles,cells,handles,buttons,arrows,parent,rows,listeners,rootListeners,event,calls};
}

test("módulo no-op fuera de Objetivos cuando falta #objectivesGrid",()=>{
  const context=vm.createContext({globalThis:null});context.globalThis=context;vm.runInContext(source,context);
  assert.equal(context.YkObjetivosGrid.mount(null),null);
  assert.match(page,/YkObjetivosGrid\.mount\(document\.getElementById\("objectivesGrid"\)\)/);
});

test("seis cabezales reciben variables, límites y ARIA completa",()=>{
  const h=harness({widths:JSON.stringify({advisor:999,objective:10})});
  assert.deepEqual(Object.keys(h.api.widths),keys);assert.equal(h.api.widths.advisor,340);assert.equal(h.api.widths.objective,220);
  for(const key of keys){assert.equal(h.styles["--objective-col-"+key],h.api.widths[key]+"px");assert.equal(h.handles[key].attrs.role,"separator");assert.equal(h.handles[key].attrs["aria-orientation"],"vertical");assert.equal(h.handles[key].attrs.tabindex,"0");assert.ok(h.handles[key].attrs["aria-valuemin"]);assert.ok(h.handles[key].attrs["aria-valuemax"]);assert.ok(h.handles[key].attrs["aria-valuenow"]);assert.ok(h.handles[key].attrs["aria-valuetext"]);assert.ok(h.handles[key].attrs["aria-label"]);}
  assert.equal(h.cells.advisor.attrs.role,"columnheader");assert.equal(h.cells.advisor.attrs["aria-sort"],"none");
});

test("sort asc/desc es estable, persiste y mantiene vacíos al final",()=>{
  const h=harness();h.listeners.click(h.event(h.buttons.project));
  assert.deepEqual(h.parent.children.map(row=>row.id),["a1","a2","z"]);assert.equal(h.cells.project.attrs["aria-sort"],"ascending");assert.equal(h.arrows.project.textContent,"▲");
  h.listeners.click(h.event(h.buttons.project));assert.deepEqual(h.parent.children.map(row=>row.id),["z","a1","a2"]);assert.equal(h.cells.project.attrs["aria-sort"],"descending");assert.deepEqual(JSON.parse(h.stored.get("sort")),{key:"project",dir:"desc"});
  h.listeners.click(h.event(h.buttons.date));assert.deepEqual(h.parent.children.map(row=>row.id),["a1","z","a2"],"fecha numérica ascendente y vacía al final");
});

test("pointer cubre ratón/touch, pointercancel limpia y handle no dispara sort",()=>{
  const h=harness(),handle=h.handles.advisor;h.listeners.pointerdown(h.event(handle,{clientX:100,pointerId:2}));assert.ok(handle.classes.has("dragging"));
  h.rootListeners.pointermove(h.event(handle,{clientX:150}));assert.equal(h.api.widths.advisor,210);
  h.rootListeners.pointercancel(h.event(handle));assert.ok(!handle.classes.has("dragging"));assert.equal(JSON.parse(h.stored.get("widths")).advisor,210);
  const before=h.calls.stop;h.listeners.click(h.event(handle));assert.ok(h.calls.stop>before);assert.equal(h.api.getSort(),null);
});

test("teclado con Shift y reset por Home/Intro/Espacio/doble clic",()=>{
  const h=harness(),handle=h.handles.advisor;h.listeners.keydown(h.event(handle,{key:"ArrowRight",shiftKey:false}));assert.equal(h.api.widths.advisor,168);
  h.listeners.keydown(h.event(handle,{key:"ArrowRight",shiftKey:true}));assert.equal(h.api.widths.advisor,192);h.listeners.keydown(h.event(handle,{key:"ArrowLeft",shiftKey:false}));assert.equal(h.api.widths.advisor,184);
  for(const key of ["Home","Enter"," "]){h.api.setWidth("advisor",220);h.listeners.keydown(h.event(handle,{key,shiftKey:false}));assert.equal(h.api.widths.advisor,160);}
  h.api.setWidth("advisor",230);h.listeners.dblclick(h.event(handle));assert.equal(h.api.widths.advisor,160);
});

test("MutationObserver reaplica tras filtros/rerender, conserva foco y respeta responsive",()=>{
  assert.match(source,/new root\.MutationObserver\(scheduleRefresh\)/);assert.match(source,/observer\.observe\(container,\{childList:true,subtree:true\}\)/);
  assert.match(source,/var restore=!!lastFocus&&\(!active\|\|active===doc\.body\);apply\(restore\)/);assert.match(source,/restoreFocus\(\)/);
  assert.match(source,/@media\(max-width:720px\)\{\.objective-col-resize/);assert.doesNotMatch(source,/\.objective-grid-row\{[^}]*min-width/);
  assert.match(source,/button\.dataset\.objectiveSort=key[\s\S]*cell\.appendChild\(button\)[\s\S]*cell\.appendChild\(handle\)/,"botón y tirador permanecen hermanos");
});

test("deploy cache-bustea los controles de la cuadrícula de Objetivos",()=>{
  assert.match(deploy,/\/yk-objetivos-grid\\\.js/);
  assert.match(deploy,/"\/yk-objetivos-grid\.js\?v=" \+ stamp/);
});
