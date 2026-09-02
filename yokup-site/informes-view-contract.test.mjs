import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./yk-informes-view.js",import.meta.url),"utf8");
const css=await readFile(new URL("./yk-informes-view.css",import.meta.url),"utf8");
const context=vm.createContext({URLSearchParams,encodeURIComponent});
vm.runInContext(source,context);
const View=context.YkInformesView;

function storage(initial={}){
  const values=new Map(Object.entries(initial)),writes=[];
  return {values,writes,getItem:key=>values.has(key)?values.get(key):null,setItem(key,value){writes.push([key,value]);values.set(key,value);}};
}
function button(value){
  const attrs={"data-informes-view-option":value};
  return {attrs,setAttribute(k,v){attrs[k]=String(v);},getAttribute:k=>attrs[k],closest(selector){return selector.includes("data-informes-view-option")?this:null;}};
}
function harness(saved){
  const store=storage(saved),buttons=[button("detail"),button("grid"),button("list")],listeners={};
  const target={id:"reps",attrs:{},setAttribute(k,v){this.attrs[k]=v;}};
  const anomalies={id:"debe",attrs:{},setAttribute(k,v){this.attrs[k]=v;}};
  const container={innerHTML:"",querySelectorAll(){return buttons;},addEventListener(type,fn){listeners[type]=fn;},removeEventListener(){}};
  return {store,buttons,listeners,target,anomalies,container};
}

test("primera visita nace en Detalle sin grabar una preferencia implícita",()=>{
  const h=harness();
  const mounted=View.mount(h.container,{storage:h.store,target:h.target});
  assert.equal(mounted.getView(),"detail");
  assert.equal(h.target.attrs["data-informes-view"],"detail");
  assert.deepEqual(h.store.writes,[]);
  assert.equal(h.buttons[0].attrs["aria-pressed"],"true");
  assert.equal(h.buttons[1].attrs["aria-pressed"],"false");
  assert.equal(h.buttons[2].attrs["aria-pressed"],"false");
});

test("una elección posterior se restaura y sólo una activación explícita la cambia",()=>{
  const key=View.STORAGE_KEY,h=harness({[key]:"list"}),changes=[];
  const mounted=View.mount(h.container,{storage:h.store,target:h.target,onChange:view=>changes.push(view)});
  assert.equal(mounted.getView(),"list");
  assert.deepEqual(h.store.writes,[]);
  let prevented=0,stopped=0;
  h.listeners.click({target:h.buttons[1],preventDefault(){prevented++;},stopPropagation(){stopped++;}});
  assert.equal(mounted.getView(),"grid");
  assert.deepEqual(h.store.writes,[[key,"grid"]]);
  assert.deepEqual(changes,["grid"]);
  assert.equal(prevented,1);
  assert.equal(stopped,1);
});

test("preferencias inválidas o storage no disponible caen de forma segura a Detalle",()=>{
  assert.equal(View.read(storage({[View.STORAGE_KEY]:"cards"})),"detail");
  assert.equal(View.read({getItem(){throw new Error("blocked");}}),"detail");
  assert.equal(View.write({setItem(){throw new Error("quota");}},null,"list"),false);
});

test("el selector nombra las tres opciones en orden y expone estado inequívoco",()=>{
  const html=View.selectorMarkup("list","reps");
  assert.match(html,/role="group" aria-label="Vista de informes"/);
  assert.match(html,/>Detalle<\/button>/);
  assert.match(html,/>Cuadrícula<\/button>/);
  assert.match(html,/>Lista<\/button>/);
  assert.match(html,/data-informes-view-option="detail" aria-pressed="false" aria-label="Mostrar informes en detalle" aria-controls="reps"/);
  assert.match(html,/data-informes-view-option="grid" aria-pressed="false" aria-label="Mostrar informes en cuadrícula" aria-controls="reps"/);
  assert.match(html,/data-informes-view-option="list" aria-pressed="true" aria-label="Mostrar informes en lista" aria-controls="reps"/);
});

test("Detalle, Cuadrícula y Lista conservan exactamente filas, identidad, orden y conteos",()=>{
  const rows=[
    {mission_id:"FLT-20",code:"b",report:"segundo"},
    {mission_id:"FLT-20",code:"a",report:"primero"},
    {mission_id:"FLT-19",code:"z1",report:"cierre"}
  ];
  const meta={state:"ready",visible:2,loaded:30,total:61,hasMore:true};
  const grid=View.dataContract(View.rowsForView(rows,"grid"),meta);
  const list=View.dataContract(View.rowsForView(rows,"list"),meta);
  const detail=View.dataContract(View.rowsForView(rows,"detail"),meta);
  assert.deepEqual(grid,list);
  assert.deepEqual(detail,list);
  assert.deepEqual(Array.from(grid.keys),["FLT-20\u0000b","FLT-20\u0000a","FLT-19\u0000z1"]);
  assert.notEqual(grid.rows,rows,"la proyección no muta el array que posee el pipeline");
  assert.equal(grid.rows[0],rows[0],"no clona ni sustituye registros");
  assert.equal(grid.visible,2);
  assert.equal(grid.loaded,30);
  assert.equal(grid.total,61);
  assert.equal(grid.hasMore,true);
});

test("loading, vacío, error y paginación son estados de datos, no de vista",()=>{
  const cases=[
    [[],{state:"loading",loaded:0,hasMore:false},"loading"],
    [[],{state:"error",loaded:0,hasMore:false},"error"],
    [[],{state:"ready",loaded:0,total:0,hasMore:false},"empty"],
    [[{mission_id:"M",code:"a"}],{state:"ready",loaded:1,total:2,hasMore:true},"ready"]
  ];
  for(const [rows,meta,expected] of cases){
    const a=View.dataContract(View.rowsForView(rows,"detail"),meta);
    const b=View.dataContract(View.rowsForView(rows,"grid"),meta);
    const c=View.dataContract(View.rowsForView(rows,"list"),meta);
    assert.deepEqual(a,b);assert.deepEqual(b,c);
    assert.equal(a.state,expected);
  }
});

test("cada clase de informe abre su detalle canónico",()=>{
  const task={mission_id:"FLT-1516",code:"b2"};
  const mission={mission_id:"DCL-a/b",code:"z1"};
  assert.equal(View.reportKind(task),"task");
  assert.equal(View.detailHref(task),"/tareas?mission=FLT-1516#b2");
  assert.equal(View.reportKind(mission),"mission");
  assert.equal(View.detailHref(mission),"/ticket?id=DCL-a%2Fb");
  assert.equal(View.reportKind({mission_id:"M",code:"a",report_scope:"mission"}),"mission","el campo explícito prevalece durante una migración");
  assert.equal(View.detailHref({code:"a"}),"","sin misión no se inventa un destino");
});

test("anomalías comparte vista pero conserva dataset e identidad independientes",()=>{
  const h=harness(),reports=[{mission_id:"M1",code:"a",report:"real",points_end:40}];
  const debts=[
    {debt_kind:"task_without_report",id:"M2",code:"b",subject:"falta parte"},
    {debt_kind:"missing_final_report",id:"M1",code:"z1",subject:"falta cierre"}
  ];
  const mounted=View.mount(h.container,{storage:h.store,targets:[h.target,h.anomalies]});
  assert.equal(h.target.attrs["data-informes-view"],"detail");
  assert.equal(h.anomalies.attrs["data-informes-view"],"detail");
  const reportModel=View.dataContract(reports,{visible:1,loaded:1,total:1,hasMore:false});
  const anomalyModel=View.anomalyContract(debts);
  assert.deepEqual(Array.from(anomalyModel.keys),[
    "task_without_report\u0000M2\u0000b",
    "missing_final_report\u0000M1\u0000z1"
  ]);
  assert.equal(anomalyModel.rows[0],debts[0]);
  assert.equal(Object.hasOwn(anomalyModel.rows[0],"report"),false,"no inventa un informe para una deuda");
  assert.deepEqual(reportModel.keys,["M1\u0000a"]);
  assert.equal(reportModel.visible,1);
  assert.equal(reportModel.loaded,1);
  assert.equal(reportModel.total,1);
  h.listeners.click({target:h.buttons[2],preventDefault(){},stopPropagation(){}});
  assert.equal(mounted.getView(),"list");
  assert.equal(h.target.attrs["data-informes-view"],"list");
  assert.equal(h.anomalies.attrs["data-informes-view"],"list");
  assert.deepEqual(View.anomalyContract(debts).keys,anomalyModel.keys);
  assert.deepEqual(View.dataContract(reports,{visible:1,loaded:1,total:1,hasMore:false}),reportModel);
});

test("el contrato CSS limita anchos y reduce la cuadrícula a una columna móvil",()=>{
  assert.match(css,/max-width:100%/);
  assert.match(css,/minmax\(min\(100%,310px\),1fr\)/);
  assert.match(css,/@media\(max-width:520px\)/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
  assert.doesNotMatch(css,/overflow-x:\s*(auto|scroll)/,"la vista no delega el overflow al usuario");
});
