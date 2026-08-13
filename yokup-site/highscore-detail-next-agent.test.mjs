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

function ranking(extra={}){return {project_id:"pixeria",period:"today",current_index:1,ordered:[
  {agent:"NeoMBP14",points:190,position:1},{agent:"OraculoMacMini",points:170,position:2},
  {agent:"TrinityMBP16",points:120,position:3},{agent:"MorfeoMBP14",points:80,position:4}
],...extra};}

test("valida ranking factual del mismo proyecto y periodo sin aceptar otro scope",()=>{
  const request={agent:"OraculoMacMini",projectId:"pixeria",period:"today"};
  const value=D.rankingFromHistory(ranking(),request,ID);
  assert.equal(value.currentIndex,1);assert.deepEqual(Array.from(value.ordered,row=>[row.agent,row.points,row.position]),[
    ["NeoMBP14",190,1],["OraculoMacMini",170,2],["TrinityMBP16",120,3],["MorfeoMBP14",80,4]
  ]);
  assert.equal(D.rankingFromHistory(ranking({project_id:"galaxia-admira"}),request,ID),null);
  assert.equal(D.rankingFromHistory(ranking({period:"month"}),request,ID),null);
  assert.equal(D.rankingFromHistory(ranking({current_index:0}),request,ID),null,"current_index debe señalar al agente solicitado");
});

test("rechaza orden parcial, duplicado, subagentes, puntos inventados y posiciones rotas",()=>{
  const request={agent:"OraculoMacMini",projectId:"pixeria",period:"today"};
  assert.equal(D.rankingFromHistory(ranking({ordered:ranking().ordered.slice(0,1)}),request,ID),null);
  assert.equal(D.rankingFromHistory(ranking({ordered:[ranking().ordered[1],ranking().ordered[1]],current_index:0}),request,ID),null);
  assert.equal(D.rankingFromHistory(ranking({ordered:[...ranking().ordered.slice(0,2),{agent:"SubTrinityMBP16",points:120,position:3}]}),request,ID),null);
  assert.equal(D.rankingFromHistory(ranking({ordered:[...ranking().ordered.slice(0,2),{agent:"TrinityMBP16",points:-1,position:3}]}),request,ID),null);
  assert.equal(D.rankingFromHistory(ranking({ordered:ranking().ordered.map((row,index)=>({...row,position:index+2}))}),request,ID),null);
});

test("anterior y siguiente recorren más de tres agentes sin wrap artificial",()=>{
  const request={agent:"OraculoMacMini",projectId:"pixeria",period:"today"},value=D.rankingFromHistory(ranking(),request,ID);
  assert.equal(D.previousRankedAgent(value).agent,"NeoMBP14");
  assert.equal(D.nextRankedAgent(value).agent,"TrinityMBP16");
  const third=D.rankingFromHistory(ranking({current_index:2}),{...request,agent:"TrinityMBP16"},ID);
  assert.equal(D.previousRankedAgent(third).agent,"OraculoMacMini");
  assert.equal(D.nextRankedAgent(third).agent,"MorfeoMBP14");
});

test("los extremos se detienen: primero sin anterior y último sin siguiente",()=>{
  const request={projectId:"pixeria",period:"today"};
  const first=D.rankingFromHistory(ranking({current_index:0}),{...request,agent:"NeoMBP14"},ID);
  const last=D.rankingFromHistory(ranking({current_index:3}),{...request,agent:"MorfeoMBP14"},ID);
  assert.equal(D.previousRankedAgent(first),null);assert.equal(D.nextRankedAgent(first).agent,"OraculoMacMini");
  assert.equal(D.previousRankedAgent(last).agent,"TrinityMBP16");assert.equal(D.nextRankedAgent(last),null);
  assert.equal(D.previousRankedAgent({ordered:[{agent:"NeoMBP14"}],currentIndex:0}),null);
  assert.equal(D.nextRankedAgent({ordered:[{agent:"NeoMBP14"}],currentIndex:0}),null);
  const unranked=D.rankingFromHistory(ranking({current_index:null}),{...request,agent:"NeoMBP14"},ID);
  assert.equal(unranked,null,"sin posición factual ambos controles se degradan a disabled");
  assert.equal(D.previousRankedAgent(unranked),null);assert.equal(D.nextRankedAgent(unranked),null);
});

test("dos flechas bajo avatar conservan URL completa y usan pushState+load",()=>{
  assert.match(page,/avatarStack\.append\(avatar,rankNavigation\(data,stateValue\)\)/);
  assert.match(page,/function selectAgent\(agent\)[\s\S]*value\.agent=agent[\s\S]*setUrl\(value,false\)[\s\S]*load\(value\)/);
  assert.match(page,/D\.previousRankedAgent\(data\.ranking\)/);
  assert.match(page,/D\.nextRankedAgent\(data\.ranking\)/);
  assert.match(page,/Subir una posición en la clasificación:/);
  assert.match(page,/Bajar una posición en la clasificación:/);
  assert.match(page,/No hay una posición superior/);assert.match(page,/No hay una posición inferior/);
  assert.match(page,/window\.addEventListener\("popstate",function\(\)\{boot\(false\);\}\)/);
  assert.equal(D.detailUrl({agent:"NeoMBP14",projectId:"pixeria",period:"month",type:"task",order:"asc"}),
    "/highscoreDetail?agent=NeoMBP14&project_id=pixeria&period=month&type=task&order=asc");
});

test("botones nativos conservan teclado, ARIA, blanco táctil 44px y responsive móvil",()=>{
  assert.match(page,/rankButton\("←","previous-agent"/);assert.match(page,/rankButton\("→","next-agent"/);
  assert.match(page,/button\.type="button"/);assert.doesNotMatch(page,/rankButton[\s\S]*keydown/);
  assert.match(html,/\.avatar-stack\{[^}]*display:flex[^}]*flex-direction:column/);
  assert.match(html,/\.rank-navigation\{[^}]*display:flex/);
  assert.match(html,/\.rank-agent\{[^}]*min-width:44px[^}]*height:44px/);
  assert.match(html,/@media\(max-width:470px\)[\s\S]*\.avatar-stack\{margin:auto\}/);
});
