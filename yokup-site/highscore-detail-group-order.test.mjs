import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const helper=fs.readFileSync(new URL("./highscore-detail.js",import.meta.url),"utf8");
const page=fs.readFileSync(new URL("./highscore-detail-page.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("./highscoreDetail.html",import.meta.url),"utf8");
const identity=fs.readFileSync(new URL("./yk-agent-identity.js",import.meta.url),"utf8");
const context=vm.createContext({Intl,Date,URLSearchParams,sessionStorage:{getItem:()=>null}});
vm.runInContext(identity,context);vm.runInContext(helper,context);
const D=context.YkHighscoreDetail,ID=context.ykAgentIdentity;

function day(day,points,{objectives=0,windows=0,missions=0,tasks=0}={}){
  return {day,points,objectives,windows,missions,tasks};
}

test("Año agrega sólo los días recibidos por meses y nace más nuevo primero",()=>{
  const source=[day("2026-01-31",5,{tasks:1}),day("2026-02-01",8,{windows:1}),day("2026-02-02",40,{missions:1})];
  const groups=D.evolutionGroups(source,"year","desc");
  assert.deepEqual(Array.from(groups,row=>row.key),["2026-02","2026-01"]);
  assert.deepEqual(JSON.parse(JSON.stringify(groups[0])),{
    key:"2026-02",start:"2026-02-01",end:"2026-02-02",label:"Febrero de 2026",grain:"month",
    rows:[source[1],source[2]],objectives:0,windows:1,missions:1,tasks:0,points:48,day:"2026-02",count:2
  });
  assert.equal(groups[1].points,5);assert.equal(groups.length,2,"no sintetiza los otros diez meses");
});

test("Mes usa semanas naturales lunes-domingo de Madrid sin sumar fuera del scope",()=>{
  const source=[day("2026-08-01",8,{windows:1}),day("2026-08-02",40,{missions:1}),day("2026-08-03",15,{tasks:1}),day("2026-08-09",5,{objectives:1})];
  const groups=D.evolutionGroups(source,"month","asc");
  assert.deepEqual(Array.from(groups,row=>row.key),["2026-07-27","2026-08-03"]);
  assert.equal(groups[0].naturalStart,"2026-07-27");assert.equal(groups[0].naturalEnd,"2026-08-02");
  assert.equal(groups[0].start,"2026-08-01");assert.equal(groups[0].end,"2026-08-02");assert.equal(groups[0].points,48);
  assert.match(groups[0].label,/Semana 27\/07–02\/08 · datos 01\/08–02\/08/);
  assert.equal(groups[1].points,20);
});

test("Orden asc/desc invierte grupos y hechos sin perder eventos ni filtro type",()=>{
  const events=[{type:"mission",id:"M2",day:"2026-08-09",at:300,points:40},{type:"task",id:"T1",day:"2026-08-03",at:200,points:15},{type:"mission",id:"M1",day:"2026-08-02",at:100,points:40}];
  const missions=D.timelineForType(events,"mission");
  const descending=D.timelineGroups(missions,"month","desc"),ascending=D.timelineGroups(missions,"month","asc");
  assert.deepEqual(Array.from(descending.flatMap(group=>group.events),event=>event.id),["M2","M1"]);
  assert.deepEqual(Array.from(ascending.flatMap(group=>group.events),event=>event.id),["M1","M2"]);
  assert.equal(events.length,3);assert.equal(events[0].id,"M2","los datos factuales de entrada no se mutan");
});

test("order vive en URL/back-forward y alternar no vuelve a consultar el histórico",()=>{
  assert.deepEqual(JSON.parse(JSON.stringify(D.queryState("?agent=TrinityMBP14&project_id=yokup.com&period=year&type=task"))),
    {agent:"TrinityMBP14",projectId:"yokup.com",period:"year",type:"task",order:"desc"});
  assert.equal(D.queryState("?agent=A&project_id=P&order=asc").order,"asc");
  assert.equal(D.detailUrl({agent:"A",projectId:"P",period:"month",type:"mission",order:"asc"}),
    "/highscoreDetail?agent=A&project_id=P&period=month&type=mission&order=asc");
  assert.match(page,/function selectOrder\(\)[\s\S]*value\.order=value\.order==="desc"\?"asc":"desc"[\s\S]*render\(activeData,value\)/);
  assert.doesNotMatch(page,/function selectOrder\(\)[^}]*load\(/);
  assert.match(page,/order:next\.order/);assert.match(page,/popstate/);
});

test("contrato rechaza métricas diarias ausentes en vez de inventar cero",()=>{
  const now=Date.UTC(2026,7,13,10),request={agent:"TrinityMBP14",projectId:"yokup.com",period:"month"};
  const payload={ok:true,agent:"TrinityMBP14",project_id:"yokup.com",period:"month",timezone:"Europe/Madrid",generated_at:now,
    range:{start_day:"2026-08-01",end_day:"2026-08-13"},metrics:{objectives:0,windows:0,missions:1,tasks:0,points:40},
    evolution:{days:[{day:"2026-08-13",objectives:0,windows:0,missions:1,points:40}]},timeline:[]};
  assert.equal(D.periodHistory(payload,request,ID,now),null,"falta tasks; no puede normalizarse a 0");
  payload.evolution.days[0].tasks=0;assert.ok(D.periodHistory(payload,request,ID,now));
});

test("cabeceras y fechas son botones de orden accesibles y responsive",()=>{
  assert.match(page,/orderButton\(order,onOrder,"Ordenar evolución por fecha"\)/);
  assert.match(page,/orderButton\(order,onOrder,"Ordenar cronología por fecha"\)/);
  assert.match(page,/Orden actual: "\+orderText\(order\)\+"\. Pulsar para invertir/);
  assert.match(page,/dateButton\(row\.label,order,onOrder\)/);assert.match(page,/dateButton\(group\.label,order,onOrder\)/);
  assert.match(html,/\.group-date,.chronology-order/);assert.match(html,/@media\(max-width:470px\)[\s\S]*\.score-day/);
});
