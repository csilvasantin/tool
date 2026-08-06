import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const html=await readFile(new URL("./informes.html",import.meta.url),"utf8");
const main=html.match(/<script>\s*(const WORKER="https:\/\/api\.yokup\.com";[\s\S]*?)<\/script>/)?.[1];
assert.ok(main);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(ok=>{resolve=ok;});return {promise,resolve};}
function element(){return {innerHTML:"",hidden:false,disabled:false,textContent:"",value:"",dataset:{},style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},setAttribute(k,v){this[k]=v;},getAttribute(k){return this[k];},addEventListener(){},querySelector(){return null;},querySelectorAll(){return []}};}
function row(n,extra={}){return {mission_id:"M"+n,code:"a",report:"informe "+n,updated_at:Date.now()-n,executor:"OraculoMacMini",role:"main",family_key:"oraculo::macmini",family_name:"OraculoMacMini",...extra};}

function setup(taskResponses){
  const listeners={},intervals=[],calls=[];
  const elements={reps:element(),tfilter:element(),tfDate:element(),debe:element(),lb:element(),pageStatus:element(),loadMore:element()};
  elements.lb.querySelector=()=>element();
  let taskIndex=0;
  const fetch=url=>{calls.push(url);if(url.includes("/fleet/informes-deuda"))return Promise.resolve({ok:true,json:async()=>({missions:[]})});return taskResponses[taskIndex++];};
  const window={ykAvatar:{ready:Promise.resolve(),html:()=>"avatar"},ykAgentIdentity:null,addEventListener:(type,fn)=>{listeners[type]=fn;}};
  const document={getElementById:id=>elements[id],addEventListener(){},querySelector(){return null;}};
  const context=vm.createContext({window,document,fetch,Date,Promise,AbortController,encodeURIComponent,console,ykAvatar:window.ykAvatar,
    YkInformesSort:{sort:rows=>rows},YkInformesColumns:{mount:()=>({apply(){}})},
    YkInformesGroups:{group:rows=>[{key:"family",name:"Familia",rows:rows.map(r=>({...r,_executor:r.executor,_agent_role:r.role}))}]},
    setInterval:fn=>{intervals.push(fn);},setTimeout(){},localStorage:{getItem(){return null;},setItem(){}}});
  vm.runInContext(main,context);
  listeners["yk:project-change"]({detail:{project_id:null,ready:true}});
  return {context,elements,calls,intervals,listeners};
}

test("primera tanda pide 30, fechas, total y expone cursor para Cargar más",async()=>{
  const first=Promise.resolve({ok:true,json:async()=>({tasks:Array.from({length:30},(_,i)=>row(i)),next_cursor:"c-30",has_more:true,total:61})});
  const h=setup([first]);await tick();await tick();
  assert.match(h.calls[0],/\/tasks\/all\?scope=fleet&paginated=1&limit=30/);
  assert.match(h.calls[0],/&updated_from=\d+&updated_to=\d+/);
  assert.match(h.calls[0],/&include_total=1/);
  assert.equal(vm.runInContext("ALL.length",h.context),30);
  assert.equal(h.elements.pageStatus.textContent,"30 cargados de 61");
  assert.equal(h.elements.loadMore.hidden,false);
  assert.equal(h.elements.loadMore.textContent,"Cargar más");
});

test("un proyecto seleccionado reinicia el snapshot y viaja al servidor",async()=>{
  const first=Promise.resolve({ok:true,json:async()=>({tasks:[row(1)],next_cursor:null,has_more:false,total:1})});
  const scoped=Promise.resolve({ok:true,json:async()=>({tasks:[row(2,{project:"yokup"})],next_cursor:null,has_more:false,total:1})});
  const h=setup([first,scoped]);await tick();await tick();
  h.listeners["yk:project-change"]({detail:{project_id:"yokup",ready:true}});
  await tick();await tick();
  const taskCalls=h.calls.filter(url=>url.includes("/tasks/all"));
  assert.equal(taskCalls.length,2);
  assert.match(taskCalls[1],/&project=yokup/);
  assert.match(taskCalls[1],/&include_total=1/);
  assert.equal(vm.runInContext("ALL.length",h.context),1);
});

test("Cargar más añade 30, usa cursor y deduplica misión+tarea",async()=>{
  const first=Promise.resolve({ok:true,json:async()=>({tasks:Array.from({length:30},(_,i)=>row(i)),next_cursor:"opaque",has_more:true,total:59})});
  const second=Promise.resolve({ok:true,json:async()=>({tasks:[row(0,{report:"actualizado",updated_at:Date.now()+10}),...Array.from({length:29},(_,i)=>row(30+i))],next_cursor:null,has_more:false,total:null})});
  const h=setup([first,second]);await tick();await tick();
  await vm.runInContext("loadMore()",h.context);await tick();
  const taskCalls=h.calls.filter(url=>url.includes("/tasks/all"));
  assert.match(taskCalls[1],/&cursor=opaque/);
  assert.doesNotMatch(taskCalls[1],/include_total/);
  assert.equal(vm.runInContext("ALL.length",h.context),59);
  assert.equal(vm.runInContext('ALL.find(x=>x.mission_id==="M0").report',h.context),"actualizado");
  assert.equal(h.elements.pageStatus.textContent,"59 cargados de 59");
  assert.equal(h.elements.loadMore.hidden,true);
});

test("fallback legacy limita a 30 y sirve el resto sin reconsultar",async()=>{
  const legacy=Promise.resolve({ok:true,json:async()=>({tasks:Array.from({length:45},(_,i)=>row(i))})});
  const h=setup([legacy]);await tick();await tick();
  assert.equal(vm.runInContext("ALL.length",h.context),30);
  await vm.runInContext("loadMore()",h.context);
  assert.equal(vm.runInContext("ALL.length",h.context),45);
  assert.equal(h.calls.filter(url=>url.includes("/tasks/all")).length,1);
  await h.intervals[0]();
  assert.equal(h.calls.filter(url=>url.includes("/tasks/all")).length,1,"legacy no reconsulta el payload completo");
});

test("refresco sólo consulta primera página y el control de secuencia ignora solapes",()=>{
  assert.match(html,/function refresh\(\)\{if\(LOAD_INFLIGHT\|\|PAGE\.legacy/);
  assert.match(html,/return loadPage\(\{refresh:true\}\)/);
  assert.match(html,/if\(reset&&LOAD_ABORT\)LOAD_ABORT\.abort\(\)/);
  assert.match(html,/if\(seq!==LOAD_SEQ\)return false/);
  assert.match(html,/ALL=mergeTasks\(ALL,reports\)/);
});
