import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const model=await readFile(new URL("./highscore-detail.js",import.meta.url),"utf8");
const page=await readFile(new URL("./highscore-detail-page.js",import.meta.url),"utf8");
const html=await readFile(new URL("./highscoreDetail.html",import.meta.url),"utf8");
const context=vm.createContext({console,URL,window:{},globalThis:{}});context.window=context;
vm.runInContext(model,context);
const D=context.YkHighscoreDetail;

function week(){return {period:"week",evolution:[{day:"2026-08-17",points:0},{day:"2026-08-18",points:60},{day:"2026-08-19",points:0}],
  ranking:{currentIndex:1,ordered:[{agent:"NeoMBP16",points:75,position:1},{agent:"TrinityMBP16",points:60,position:2},{agent:"SmithMBP16",points:30,position:3}]},
  comparisonEvolution:{labels:[{label:"17/08"},{label:"18/08"},{label:"19/08"}],series:[
    {agent:"NeoMBP16",current:false,values:[25,50,75]},
    {agent:"TrinityMBP16",current:true,values:[0,60,60]},
    {agent:"SmithMBP16",current:false,values:[30,30,30]}]}};}

test("control semanal detecta ceros, caída y brecha sin reconstruir puntos",()=>{
  const result=D.weeklyControl(week());
  assert.deepEqual(Array.from(result.zeroDays),["2026-08-17","2026-08-19"]);
  assert.equal(result.previousPosition,1);
  assert.equal(result.currentPosition,2);
  assert.equal(result.rankChange,-1);
  assert.equal(result.rankFell,true);
  assert.equal(result.leaderAgent,"NeoMBP16");
  assert.equal(result.leaderGap,15);
});

test("fuera del periodo semana el control no inventa una lectura",()=>{
  const value=week();value.period="month";assert.equal(D.weeklyControl(value),null);
});

test("la página sitúa el control antes del gráfico y expone las tres señales",()=>{
  assert.match(page,/function weeklyControlPanel\(data\)/);
  assert.match(page,/Días a cero/);
  assert.match(page,/Brecha líder/);
  assert.match(page,/var weekly=weeklyControlPanel\(data\);if\(weekly\)target\.append\(weekly\);target\.append\(rankingSeriesChart/);
  assert.match(html,/\.weekly-control-grid\{display:grid;grid-template-columns:repeat\(3/);
  assert.match(html,/@media\(max-width:760px\)\{\.weekly-control-grid\{grid-template-columns:1fr\}/);
});
