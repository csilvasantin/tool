import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const helper=fs.readFileSync(new URL("./highscore-detail.js",import.meta.url),"utf8");
const page=fs.readFileSync(new URL("./highscore-detail-page.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("./highscoreDetail.html",import.meta.url),"utf8");
const identity=fs.readFileSync(new URL("./yk-agent-identity.js",import.meta.url),"utf8");
const context=vm.createContext({Intl,Date,URL,URLSearchParams,sessionStorage:{getItem:()=>null}});vm.runInContext(identity,context);vm.runInContext(helper,context);
const D=context.YkHighscoreDetail;
const evolution={labels:[{label:"10:00",at:1},{label:"11:00",at:2}],series:[
  {agent:"OraculoMini",position:1,current:true,values:[10,25]},
  {agent:"NeoMini",position:2,current:false,values:[0,20]},
  {agent:"Morfeo14",position:3,current:false,values:[0,0]}
]};

test("punto deriva total, delta del bucket, cuota y brecha simultáneos",()=>{
  assert.deepEqual(JSON.parse(JSON.stringify(D.comparisonMarkerPoint(evolution,1,1))),{
    agent:"NeoMini",position:2,label:"11:00",at:2,cumulative:20,delta:20,share:.8,leaderGap:5,
    seriesIndex:1,pointIndex:1,current:false
  });
  assert.deepEqual(JSON.parse(JSON.stringify(D.comparisonMarkerPoint(evolution,2,0))),{
    agent:"Morfeo14",position:3,label:"10:00",at:1,cumulative:0,delta:0,share:0,leaderGap:10,
    seriesIndex:2,pointIndex:0,current:false
  });
  assert.equal(D.comparisonMarkerPoint(evolution,9,0),null);
  const zero={labels:[{label:"00:00",at:1}],series:[{agent:"OraculoMini",position:1,current:true,values:[0]},{agent:"NeoMini",position:2,current:false,values:[0]}]};
  const zeroPoint=D.comparisonMarkerPoint(zero,1,0);assert.equal(zeroPoint.share,0);assert.equal(zeroPoint.leaderGap,0);
});

test("cada marcador tiene hit 24, rol botón, roving tabindex y copy factual",()=>{
  assert.match(page,/marker\.setAttribute\("role","button"\)/);
  assert.match(page,/hit\.setAttribute\("r","12"\)/);
  assert.match(page,/row\.current&&valueIndex===points\.length-1\?"0":"-1"/);
  assert.match(page,/marker\.setAttribute\("aria-label",markerCopy\(fact\)\)/);
  assert.match(page,/puntos en este intervalo/);
  assert.doesNotMatch(page,/markerCopy[\s\S]{0,500}misi[oó]n|markerCopy[\s\S]{0,500}tarea/i);
});

test("hover y foco previsualizan; click, tap, Enter y Space fijan; Escape restaura",()=>{
  assert.match(page,/addEventListener\("pointerenter",function\(\)\{preview\(fact,marker\)/);
  assert.match(page,/addEventListener\("pointerleave",restore\)/);
  assert.match(page,/addEventListener\("focus",function\(\)\{preview\(fact,marker\)/);
  assert.match(page,/addEventListener\("click",function\(\)\{pin\(fact,marker\)/);
  assert.match(page,/event\.key==="Enter"\|\|event\.key===" "/);
  assert.match(page,/event\.key==="Escape"[\s\S]*pinned=null[\s\S]*restore\(\)/);
});

test("flechas recorren puntos y series sin convertir hasta 372 puntos en tabs",()=>{
  for(const key of ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"])assert.match(page,new RegExp('event\\.key==="'+key+'"'));
  assert.match(page,/targets\.forEach\(function\(targetNode\)\{targetNode\.setAttribute\("tabindex","-1"\)/);
  assert.match(page,/next\.setAttribute\("tabindex","0"\);next\.focus\(\)/);
});

test("tooltip SVG queda clamped y la pastilla dedicada vive inmediatamente bajo el gráfico",()=>{
  assert.match(page,/Math\.max\(4,Math\.min\(width-274,x-135\)\)/);
  assert.match(page,/tooltip\.setAttribute\("transform","translate\("\+tx\+" "\+ty\+"\)"\)/);
  assert.match(page,/tooltip\.setAttribute\("role","tooltip"\)/);
  assert.match(page,/panel\.append\(wrap,inspector\)/);
  assert.match(page,/inspector\.setAttribute\("aria-live","polite"\)/);
  assert.match(page,/Último punto del agente actual/);
  assert.doesNotMatch(page,/series-point-inspector[\s\S]{0,500}latest-work/);
});

test("selección se reinicia honestamente al cargar otro periodo; empty no fabrica inspector",()=>{
  assert.match(page,/function selectPeriod\(period\)[\s\S]*load\(value\)/);
  assert.match(page,/var pinned=null,defaultPoint=null/);
  assert.match(page,/if\(!evolution\.series\.length\)\{panel\.append\(el\("p","empty"/);
  assert.match(html,/\.series-point-inspector\{/);
  assert.match(html,/@media\(max-width:470px\)[\s\S]*\.series-point-inspector\{/);
  assert.doesNotMatch(page,/setAttribute\("style"/);
});
