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

test("los cinco periodos son canónicos y URL conserva agente, proyecto y periodo",()=>{
  assert.deepEqual(Array.from(D.periods),["today","yesterday","week","month","year"]);
  assert.deepEqual(JSON.parse(JSON.stringify(D.queryState("?agent=TrinityMBP14&project_id=yokup.com&period=week"))),
    {agent:"TrinityMBP14",projectId:"yokup.com",period:"week",type:"all",order:"desc"});
  assert.equal(D.detailUrl({agent:"TrinityMBP14",projectId:"yokup.com",period:"year"}),
    "/highscoreDetail?agent=TrinityMBP14&project_id=yokup.com&period=year&type=all&order=desc");
  assert.equal(D.queryState("?agent=TrinityMBP14&project_id=yokup.com&period=unknown").period,"today");
});

test("el contrato periodizado valida scope exacto, métricas, serie y cronología descendente",()=>{
  const now=Date.UTC(2026,7,13,10),request={agent:"TrinityMBP14",projectId:"yokup.com",period:"week"};
  const payload={ok:true,agent:"TrinityMBP14",project_id:"yokup.com",period:"week",timezone:"Europe/Madrid",
    range:{start:Date.UTC(2026,7,9,22),end:Date.UTC(2026,7,13,22),start_day:"2026-08-10",end_day:"2026-08-13"},generated_at:now,
    metrics:{objectives:1,windows:2,missions:3,tasks:4,points:180},
    evolution:{days:[{day:"2026-08-10",objectives:1,windows:1,missions:1,tasks:1,points:63},{day:"2026-08-13",objectives:0,windows:1,missions:2,tasks:3,points:117}]},
    timeline:[{type:"mission",id:"M2",title:"Cierre",at:Date.UTC(2026,7,13,9),day:"2026-08-13",project_id:"yokup.com",points:40},
      {type:"task",id:"M1:a",title:"Trabajo",at:Date.UTC(2026,7,10,9),day:"2026-08-10",project_id:"yokup.com",points:15}]};
  const value=D.periodHistory(payload,request,ID,now);
  assert.equal(value.metrics.points,180);assert.equal(value.evolution.length,2);assert.equal(value.timeline[0].id,"M2");
  assert.equal(D.periodHistory({...payload,project_id:"otro"},request,ID,now),null);
  assert.equal(D.periodHistory({...payload,period:"month"},request,ID,now),null);
  assert.equal(D.periodHistory({...payload,timeline:payload.timeline.slice().reverse()},request,ID,now),null);
});

test("la UI consulta al servidor por periodo y restaura back-forward sin recorte local",()=>{
  assert.match(page,/\/highscore\/history\?agent="\+encodeURIComponent\(stateValue\.agent\)\+"&project_id="\+encodeURIComponent\(stateValue\.projectId\)\+"&period="\+encodeURIComponent\(stateValue\.period\)/);
  assert.match(page,/history\[replace\?"replaceState":"pushState"\]/);
  assert.match(page,/window\.addEventListener\("popstate",function\(\)\{boot\(false\);\}\)/);
  assert.match(page,/D\.periods\.forEach/);
  assert.match(page,/D\.periodHistory\(payload,stateValue,ID,Date\.now\(\)\)/);
  assert.match(page,/No se aplicará un filtro local parcial ni se mostrarán ceros inventados/);
  assert.doesNotMatch(page,/\.filter\(function\([^)]*\)\{[^}]*period/);
});

test("métricas, gráfica y cronología completa son accesibles y responsive",()=>{
  assert.match(html,/class="period-nav"|\.period-nav/);
  assert.match(page,/aria-label","Periodo del detalle/);
  assert.match(page,/aria-pressed/);
  assert.match(page,/role","list/);
  assert.match(page,/Cronología factual completa/);
  assert.match(page,/más reciente primero/);
  assert.match(html,/@media\(max-width:470px\)[\s\S]*\.event/);
});
