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
const request={agent:"TrinityMBP14",projectId:"yokup",period:"month"};
const source={project_id:"yokup",period:"month",current_index:2,ordered:[
  {agent:"OraculoMacMini",points:500,position:1},{agent:"NeoMBP14",points:375,position:2},
  {agent:"TrinityMBP14",points:250,position:3},{agent:"MorfeoMacMini",points:125,position:4}
]};

test("comparación deriva proporciones de todos los puntuados y destaca el actual",()=>{
  const ranking=D.rankingFromHistory(source,request,ID),rows=D.rankingComparisonRows(ranking);
  assert.deepEqual(Array.from(rows,row=>[row.agent,row.position,row.points,row.ratio,row.current]),[
    ["OraculoMacMini",1,500,1,false],["NeoMBP14",2,375,.75,false],
    ["TrinityMBP14",3,250,.5,true],["MorfeoMacMini",4,125,.25,false]
  ]);
});

test("agente sin puntos conserva comparación pero no inventa posición ni navegación",()=>{
  const ranking=D.rankingFromHistory({...source,current_index:null},{...request,agent:"NeoMBP16"},ID);
  assert.ok(ranking);assert.equal(ranking.currentIndex,null);assert.equal(D.rankingComparisonRows(ranking).length,4);
  assert.equal(D.previousRankedAgent(ranking),null);assert.equal(D.nextRankedAgent(ranking),null);
});

test("empty y singleton son estados factuales válidos y puntos cero fallan cerrado",()=>{
  const empty=D.rankingFromHistory({project_id:"yokup",period:"month",current_index:null,ordered:[]},{...request,agent:"NeoMBP16"},ID);
  assert.ok(empty);assert.deepEqual(Array.from(D.rankingComparisonRows(empty)),[]);
  const singleton=D.rankingFromHistory({project_id:"yokup",period:"month",current_index:0,ordered:[{agent:"TrinityMBP14",points:9,position:1}]},request,ID);
  assert.equal(D.rankingComparisonRows(singleton)[0].ratio,1);assert.equal(D.previousRankedAgent(singleton),null);assert.equal(D.nextRankedAgent(singleton),null);
  assert.equal(D.rankingFromHistory({...source,ordered:source.ordered.map((row,index)=>index?row:{...row,points:0})},request,ID),null);
});

test("gráfico usa ranking completo, no type, y DOM seguro con semántica accesible",()=>{
  assert.match(page,/function rankingSeriesChart\(data,stateValue\)/);
  assert.match(page,/var evolution=data\.comparisonEvolution/);
  assert.match(page,/if\(!evolution\)[\s\S]*evolución comparada factual no está disponible/);
  assert.match(page,/document\.createElementNS\(SVG_NS,"polyline"\)/);
  assert.match(page,/item\.setAttribute\("aria-current","true"\)/);
  assert.match(page,/Evolución comparada · "\+LABELS\[data\.period\]/);
  assert.doesNotMatch(page,/rankingSeriesChart\([^)]*type/);
  assert.doesNotMatch(page,/ranking-series[\s\S]{0,600}innerHTML/);
});

test("flechas muestran puesto destino sólo cuando existe y conservan blancos de 44px",()=>{
  assert.match(page,/neighbor\?symbol\+" #"\+neighbor\.position:symbol/);
  assert.match(page,/neighbor\?"#"\+neighbor\.position\+" "\+symbol:symbol/);
  assert.match(page,/rankButton\("←","previous-agent",previous/);
  assert.match(page,/rankButton\("→","next-agent",next/);
  assert.match(html,/\.rank-agent\{[^}]*min-width:44px[^}]*height:44px/);
  assert.match(html,/\.series-legend\{[^}]*display:flex/);
  assert.match(html,/@media\(max-width:470px\)[\s\S]*\.series-chart-wrap\{/);
});

test("periodo recarga comparación; type y order sólo rerenderizan el mismo ranking",()=>{
  assert.match(page,/function selectPeriod\(period\)[\s\S]*load\(value\)/);
  assert.match(page,/function selectType\(type\)[\s\S]*render\(activeData,value\)/);
  assert.match(page,/function selectOrder\(\)[\s\S]*render\(activeData,value\)/);
  assert.match(page,/target\.append\(hero\(data,stateValue\),periodNav\(stateValue\.period,selectPeriod\),rankingSeriesChart\(data,stateValue\)\)/);
});
