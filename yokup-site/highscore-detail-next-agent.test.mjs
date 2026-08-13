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
  {agent:"NeoMBP14",points:190,position:1},{agent:"OraculoMacMini",points:170,position:2},{agent:"TrinityMBP16",points:120,position:3}
],...extra};}

test("valida ranking factual del mismo proyecto y periodo sin aceptar otro scope",()=>{
  const request={agent:"OraculoMacMini",projectId:"pixeria",period:"today"};
  const value=D.rankingFromHistory(ranking(),request,ID);
  assert.equal(value.currentIndex,1);assert.deepEqual(Array.from(value.ordered,row=>[row.agent,row.points,row.position]),[
    ["NeoMBP14",190,1],["OraculoMacMini",170,2],["TrinityMBP16",120,3]
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

test("siguiente usa orden visible y hace wrap del último al número uno",()=>{
  const request={agent:"OraculoMacMini",projectId:"pixeria",period:"today"},value=D.rankingFromHistory(ranking(),request,ID);
  assert.equal(D.nextRankedAgent(value).agent,"TrinityMBP16");
  const last=D.rankingFromHistory(ranking({current_index:2}),{...request,agent:"TrinityMBP16"},ID);
  assert.equal(D.nextRankedAgent(last).agent,"NeoMBP14");
  assert.equal(D.nextRankedAgent({ordered:[{agent:"NeoMBP14"}],currentIndex:0}),null,"un único agente no navega a sí mismo");
});

test("flecha bajo avatar conserva URL completa y usa pushState+load",()=>{
  assert.match(page,/avatarStack\.append\(avatar,nextAgentControl\(data,stateValue\)\)/);
  assert.match(page,/function selectAgent\(agent\)[\s\S]*value\.agent=agent[\s\S]*setUrl\(value,false\)[\s\S]*load\(value\)/);
  assert.match(page,/D\.nextRankedAgent\(data\.ranking\)/);
  assert.match(page,/Siguiente agente en la clasificación:/);
  assert.match(page,/button\.disabled=true/);
  assert.match(page,/window\.addEventListener\("popstate",function\(\)\{boot\(false\);\}\)/);
  assert.equal(D.detailUrl({agent:"NeoMBP14",projectId:"pixeria",period:"month",type:"task",order:"asc"}),
    "/highscoreDetail?agent=NeoMBP14&project_id=pixeria&period=month&type=task&order=asc");
});

test("botón nativo conserva teclado, ARIA, blanco táctil y responsive móvil",()=>{
  assert.match(page,/el\("button","next-agent","→"\)/);assert.match(page,/button\.type="button"/);
  assert.match(page,/button\.setAttribute\("aria-label"/);assert.doesNotMatch(page,/nextAgentControl[\s\S]*keydown/);
  assert.match(html,/\.avatar-stack\{[^}]*display:flex[^}]*flex-direction:column/);
  assert.match(html,/\.next-agent\{[^}]*min-height:44px/);
  assert.match(html,/@media\(max-width:470px\)[\s\S]*\.avatar-stack\{margin:auto\}/);
});
