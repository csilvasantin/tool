import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const frame=await readFile(new URL("./yk-frame.js",import.meta.url),"utf8");
const missions=await readFile(new URL("./misiones.html",import.meta.url),"utf8");
const css=await readFile(new URL("./yk-frame.css",import.meta.url),"utf8");
const start=frame.indexOf("/* YK_MISSION_NOVELTY_CORE_START"),end=frame.indexOf("/* YK_MISSION_NOVELTY_CORE_END */")+"/* YK_MISSION_NOVELTY_CORE_END */".length;
const coreSource=frame.slice(start,end);

function memory(initial={}){const values=new Map(Object.entries(initial));return {values,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};}
function core(storage,publish){const context=vm.createContext({globalThis:null});context.globalThis=context;vm.runInContext(coreSource,context);return context.YkMissionNovelty.create({storage,publish});}
function payload(cursor,extra={}){return {created_cursor:cursor,latest_created_at:cursor*1000,newest_id:"FLT-"+cursor,curso:extra.curso??1,pend:extra.pend??1,events:extra.events||[{cursor,mission_id:"FLT-"+cursor,created_at:cursor*1000,source:"decision-batch",decision_id:"DEC-1",batch_id:"B-1"}]};}

test("primera carga fija baseline silencioso aunque ya existan misiones",()=>{
  const store=memory(),tracker=core(store),result=tracker.observe(payload(40));
  assert.equal(result.first,true);assert.equal(result.added,0);assert.equal(result.state.unread,0);
  assert.equal(result.state.seen_cursor,40);assert.equal(result.state.observed_cursor,40);
});

test("cursor detecta +1 y saltos múltiples aunque cambien los totales",()=>{
  const tracker=core(memory());tracker.observe(payload(10,{curso:2,pend:3}));
  let result=tracker.observe(payload(11,{curso:3,pend:2}));
  assert.equal(result.added,1,"crear y reclamar mantiene total 5 pero no oculta la misión");assert.equal(result.state.unread,1);
  result=tracker.observe(payload(14,{curso:1,pend:0,events:[12,13,14].map(cursor=>({cursor,mission_id:"FLT-"+cursor,created_at:cursor*1000}))}));
  assert.equal(result.added,3);assert.equal(result.state.unread,4);assert.equal(result.state.newest_id,"FLT-14");
  assert.equal(tracker.observe(payload(14,{curso:0,pend:0})).added,0,"un polling repetido no genera ruido");
});

test("huecos de AUTOINCREMENT no inventan misiones y polling tardío no regresa",()=>{
  const tracker=core(memory());tracker.observe(payload(10));
  let result=tracker.observe(payload(14,{events:[{cursor:14,mission_id:"FLT-14",created_at:14000}]}));
  assert.equal(result.added,1,"un retry ignorado puede dejar huecos en sqlite_sequence");
  result=tracker.observe(payload(12,{events:[{cursor:12,mission_id:"FLT-12",created_at:12000}]}));
  assert.equal(result.added,0,"una respuesta anterior que llega tarde no vuelve a notificar");
  assert.equal(result.state.observed_cursor,14);assert.equal(result.state.unread,1);
});

test("unread persiste tras reload y sólo ack explícito lo consume",()=>{
  const store=memory();let publishes=0,first=core(store,()=>publishes++);first.observe(payload(7));first.observe(payload(9,{events:[8,9].map(cursor=>({cursor,mission_id:"FLT-"+cursor,created_at:cursor*1000}))}));
  const reload=core(store);assert.equal(reload.snapshot().unread,2);assert.equal(reload.snapshot().newest_id,"FLT-9");
  reload.ack(payload(9));assert.equal(reload.snapshot().unread,0);assert.equal(reload.snapshot().seen_cursor,9);
  assert.equal(core(store).snapshot().unread,0);
  const quiet=core(store,()=>publishes++),before=publishes;quiet.ack(payload(9));assert.equal(publishes,before,"ACK repetido no publica ruido cross-tab");
});

test("estado se sincroniza entre pestañas y el ack remoto apaga ambas",()=>{
  const store=memory();let tabB=null;
  const tabA=core(store,state=>{if(tabB)tabB.sync(state);});tabA.observe(payload(20));
  tabB=core(store);tabA.observe(payload(21));assert.equal(tabB.snapshot().unread,1);
  const acked=tabA.ack(payload(21));tabB.sync(acked);assert.equal(tabA.snapshot().unread,0);assert.equal(tabB.snapshot().unread,0);
});

test("un broadcast viejo no revive un ACK y uno nuevo conserva sólo lo posterior",()=>{
  const tracker=core(memory());tracker.observe(payload(20));const stale=tracker.observe(payload(21)).state;
  tracker.ack(payload(21));tracker.sync(stale);
  assert.equal(tracker.snapshot().unread,0,"el mensaje previo al ACK no puede reencender la luz");
  tracker.sync({version:2,seen_cursor:20,observed_cursor:22,unread:2,newest_id:"FLT-22",events:[{cursor:22,mission_id:"FLT-22"},{cursor:21,mission_id:"FLT-21"}]});
  assert.equal(tracker.snapshot().seen_cursor,21,"se conserva el ACK local más avanzado");
  assert.equal(tracker.snapshot().unread,1,"sólo queda la misión posterior al ACK");
});

test("fallback tolera rollout sin cursor y reconoce newest_id con total estable",()=>{
  const tracker=core(memory());tracker.observe({curso:1,pend:1,newest_id:"FLT-A",latest_created_at:100});
  const result=tracker.observe({curso:2,pend:0,newest_id:"FLT-B",latest_created_at:200});
  assert.equal(result.added,1);assert.equal(result.state.unread,1);
});

test("integración no consume por hover/click y espera render real de /misiones",()=>{
  assert.match(frame,/if\(label!=="MISIONES"\)consumeSection\(label\)/);
  assert.match(frame,/window\.addEventListener\("yk:missions-rendered"/);
  assert.match(frame,/canAckMissionRender\(state,ids\)/);
  assert.match(frame,/state\.newest_id[\s\S]*ids\.indexOf\(String\(state\.newest_id\)\)>=0/);
  assert.match(missions,/function notifyMissionsRendered\(list\)/);
  assert.match(missions,/notifyMissionsRendered\(\[\]\)/);
  assert.match(missions,/wireBulk\(el, list\);[\s\S]*notifyMissionsRendered\(list\)/);
});

test("cross-tab y popover accesible muestran delta sin anuncios repetidos",()=>{
  assert.match(frame,/new window\.BroadcastChannel\("yokup-nav-missions-v2"\)/);
  assert.match(frame,/window\.addEventListener\("storage"/);
  assert.match(frame,/MISSION_ANNOUNCED_SS/);assert.match(frame,/result\.added/);
  assert.match(frame,/role","status"/);assert.match(frame,/aria-live","polite"/);
  assert.match(frame,/misión nueva":" misiones nuevas"/);assert.match(frame,/data-yk-newest/);
  assert.match(css,/\.yk-nav-live\{/);assert.match(css,/\.yk-pop-r\.nuevo b/);
});
