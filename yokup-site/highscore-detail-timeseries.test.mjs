import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const helper=fs.readFileSync(new URL("./highscore-detail.js",import.meta.url),"utf8");
const page=fs.readFileSync(new URL("./highscore-detail-page.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("./highscoreDetail.html",import.meta.url),"utf8");
const identity=fs.readFileSync(new URL("./yk-agent-identity.js",import.meta.url),"utf8");
const context=vm.createContext({Intl,Date,URL,URLSearchParams,sessionStorage:{getItem:()=>null}});vm.runInContext(identity,context);vm.runInContext(helper,context);
const D=context.YkHighscoreDetail,ID=context.ykAgentIdentity;
const request={agent:"TrinityMBP14",projectId:"yokup",period:"week"};
const ranking=D.rankingFromHistory({project_id:"yokup",period:"week",current_index:2,ordered:[
  {agent:"OraculoMacMini",position:1,points:100},{agent:"NeoMBP14",position:2,points:80},
  {agent:"TrinityMBP14",position:3,points:60},{agent:"MorfeoMacMini",position:4,points:40}
]},request,ID);
const evolution={project_id:"yokup",period:"week",timezone:"Europe/Madrid",mode:"cumulative",granularity:"day",labels:[
  {key:"2026-08-11",label:"11 ago",at:1786406400000},{key:"2026-08-12",label:"12 ago",at:1786492800000},{key:"2026-08-13",label:"13 ago",at:1786579200000}
],series:[
  {agent:"OraculoMacMini",position:1,points:100,current:false,values:[20,55,100]},
  {agent:"NeoMBP14",position:2,points:80,current:false,values:[10,40,80]},
  {agent:"TrinityMBP14",position:3,points:60,current:true,values:[0,15,60]},
  {agent:"MorfeoMacMini",position:4,points:40,current:false,values:[0,20,40]}
]};

test("normaliza más de tres series acumuladas alineadas con ranking y periodo",()=>{
  const value=D.comparisonEvolutionFromHistory(evolution,ranking,request,ID);
  assert.equal(value.granularity,"day");assert.equal(value.labels.length,3);assert.equal(value.series.length,4);
  assert.deepEqual(Array.from(value.series,row=>[row.agent,row.position,row.points,Array.from(row.values),row.current]),[
    ["OraculoMacMini",1,100,[20,55,100],false],["NeoMBP14",2,80,[10,40,80],false],
    ["TrinityMBP14",3,60,[0,15,60],true],["MorfeoMacMini",4,40,[0,20,40],false]
  ]);
});

test("fail-closed: no inventa serie ausente, desalineada, decreciente o con total distinto",()=>{
  assert.equal(D.comparisonEvolutionFromHistory(null,ranking,request,ID),null);
  assert.equal(D.comparisonEvolutionFromHistory({...evolution,series:evolution.series.slice(0,3)},ranking,request,ID),null);
  assert.equal(D.comparisonEvolutionFromHistory({...evolution,series:evolution.series.map((row,index)=>index?row:{...row,values:[20,10,100]})},ranking,request,ID),null);
  assert.equal(D.comparisonEvolutionFromHistory({...evolution,series:evolution.series.map((row,index)=>index?row:{...row,values:[20,55,99]})},ranking,request,ID),null);
});

test("empty y singleton son válidos sin fabricar líneas",()=>{
  const emptyRanking={projectId:"yokup",period:"week",ordered:[],currentIndex:null};
  const empty=D.comparisonEvolutionFromHistory({...evolution,labels:[evolution.labels[0]],series:[]},emptyRanking,{...request,agent:"NeoMBP16"},ID);
  assert.ok(empty);assert.equal(empty.series.length,0);
  const singleRanking={projectId:"yokup",period:"week",ordered:[{agent:"TrinityMBP14",position:1,points:5}],currentIndex:0};
  const single=D.comparisonEvolutionFromHistory({...evolution,labels:[evolution.labels[0]],series:[{agent:"TrinityMBP14",position:1,points:5,current:true,values:[5]}]},singleRanking,request,ID);
  assert.equal(single.series.length,1);assert.equal(single.series[0].current,true);
});

test("Site usa SVG seguro, ejes, líneas, marcadores, leyenda y detalle accesible",()=>{
  assert.match(page,/createElementNS\(SVG_NS,"svg"\)/);assert.match(page,/createElementNS\(SVG_NS,"polyline"\)/);assert.match(page,/createElementNS\(SVG_NS,"circle"\)/);
  assert.match(page,/svg\.setAttribute\("role","img"\)/);assert.match(page,/svg\.setAttribute\("aria-labelledby",titleId\+" "\+descId\)/);
  assert.match(page,/el\("ul","series-legend"\)/);assert.match(page,/el\("table","series-data-table"\)/);
  assert.doesNotMatch(page,/rankingSeriesChart[\s\S]{0,1500}innerHTML/);assert.doesNotMatch(html,/chart\.js|d3\.js|canvas/i);
});

test("responsive y CSP: viewBox escala sin scripts/style SVG inline",()=>{
  assert.match(page,/svg\.setAttribute\("viewBox","0 0 900 360"\)/);assert.match(page,/line\.classList\.add\("series-line-"\+index\)/);
  assert.match(html,/\.series-chart-svg\{[^}]*width:100%[^}]*height:auto/);assert.match(html,/@media\(max-width:470px\)[\s\S]*\.series-chart-wrap\{/);
  assert.doesNotMatch(page,/setAttribute\("style"/);assert.doesNotMatch(page,/createElementNS[^\n]*foreignObject/);
});

test("periodo/agente recargan series; type y order no cambian su fuente",()=>{
  assert.match(page,/function selectPeriod\(period\)[\s\S]*load\(value\)/);assert.match(page,/function selectAgent\(agent\)[\s\S]*load\(value\)/);
  assert.match(page,/function selectType\(type\)[\s\S]*render\(activeData,value\)/);assert.match(page,/function selectOrder\(\)[\s\S]*render\(activeData,value\)/);
  assert.match(page,/rankingSeriesChart\(data,stateValue\)/);assert.doesNotMatch(page,/rankingSeriesChart\([^)]*type/);
});
