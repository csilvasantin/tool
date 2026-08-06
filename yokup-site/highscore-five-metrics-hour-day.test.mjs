import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./highscore.html",import.meta.url),"utf8");

function functionSource(name){
  const start=source.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`falta ${name}`);
  const brace=source.indexOf("{",start);
  let depth=0,quote="",escaped=false;
  for(let i=brace;i<source.length;i++){
    const c=source[i];
    if(quote){if(escaped)escaped=false;else if(c==="\\")escaped=true;else if(c===quote)quote="";continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==="{")depth++; else if(c==="}"&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`${name} incompleta`);
}

function api(hourly){
  const datos={actividadMeta:{hourly}};
  const functions=["normaliza","claveHoraria","identidadFamiliaHoraria","filasFamiliaHoraria","tendenciaHoraria",
    "puntuacionHoraria","totalDiarioMetrica","metricaHoraDia","estadoPuntosDiarios","numeroActividad","parejaMetricaHtml"]
    .map(functionSource).join("\n");
  const declarations='var METRIC_LABELS={objectives:"objetivos",windows:"ventanas de decisión",missions:"misiones",tasks:"tareas",points:"puntos"};';
  const esc=value=>String(value==null?"":value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;");
  return new Function("datos","window","esc",`${declarations}\n${functions}\nreturn {metric:metricaHoraDia,html:parejaMetricaHtml};`)(datos,{},esc);
}

const metrics=(objectives,windows,missions,tasks,points)=>({
  objectives:{hour:objectives[0],day:objectives[1]},windows:{hour:windows[0],day:windows[1]},
  missions:{hour:missions[0],day:missions[1]},tasks:{hour:tasks[0],day:tasks[1]},points:{hour:points[0],day:points[1]}
});

test("suma el contrato horario de main/sub/infra por familia y equipo",()=>{
  const H={period:{timezone:"Europe/Madrid",hour_key:"2026-08-06T19"},scores:[
    {agent:"OraculoMacMini",machine:"MacMini",metrics:metrics([1,3],[0,2],[1,4],[2,8],[70,180])},
    {agent:"SubOraculoMacMini",machine:"Mac Mini",metrics:metrics([0,1],[1,1],[0,2],[3,6],[140,300])},
    {agent:"OraculoMBP16",machine:"MacBook Pro 16",metrics:metrics([9,9],[9,9],[9,9],[9,9],[999,999])}
  ]};
  const row={agente:"OraculoMacMini",base:"Oraculo",suffix:"MacMini",maquinas:["MacMini"],objetivos:4,ventanas:3,misiones:6,tareas:14,total:480};
  const A=api(H);
  assert.deepEqual(A.metric(row,"objectives"),{hour:1,day:4,source:"hourly-metrics",available:true});
  assert.deepEqual(A.metric(row,"windows"),{hour:1,day:3,source:"hourly-metrics",available:true});
  assert.deepEqual(A.metric(row,"missions"),{hour:1,day:6,source:"hourly-metrics",available:true});
  assert.deepEqual(A.metric(row,"tasks"),{hour:5,day:14,source:"hourly-metrics",available:true});
  assert.deepEqual(A.metric(row,"points"),{hour:210,day:480,source:"hourly-metrics",available:true});
});

test("primera hora activa muestra 210/210 y nunca un guion",()=>{
  const row={agente:"NeoMacMini",total:210,tendenciaDiaria:{state:"initial"}};
  const A=api({scores:[{agent:"NeoMacMini",metrics:metrics([1,1],[1,1],[1,1],[1,1],[210,210])}]});
  const html=A.html(row,"points");
  assert.match(html,/score-hour hour-positive">210<\/span>[\s\S]*score-separator[^>]*>\/<[\s\S]*score-day daily-initial">210<\/span>/);
  assert.doesNotMatch(html,/—/);
});

test("hora cero es amarilla y hora positiva es verde en las cinco métricas",()=>{
  const row={agente:"NeoMacMini",objetivos:2,ventanas:3,misiones:4,tareas:5,total:100};
  const A=api({scores:[{agent:"NeoMacMini",metrics:metrics([0,2],[1,3],[0,4],[2,5],[0,100])}]});
  for(const key of ["objectives","windows","missions","tasks","points"]){
    const html=A.html(row,key),hour=A.metric(row,key).hour;
    assert.match(html,new RegExp(`score-hour ${hour>0?"hour-positive":"hour-zero"}`),key);
    assert.doesNotMatch(html,/—/,key);
  }
  assert.match(source,/\.score-hour\.hour-positive\{color:var\(--good\)/);
  assert.match(source,/\.score-hour\.hour-zero\{color:var\(--accent\)/);
});

test("rollout sin metrics mantiene pares numéricos sin leer el DOM",()=>{
  const row={agente:"LegacyMacMini",objetivos:2,ventanas:3,misiones:4,tareas:5,total:100};
  const A=api({window_ms:3600000,scores:[]});
  for(const [key,total] of [["objectives",2],["windows",3],["missions",4],["tasks",5],["points",100]]){
    assert.deepEqual(A.metric(row,key),{hour:0,day:total,source:"daily-compat",available:false});
    assert.match(A.html(row,key),new RegExp(`>0<\\/span>[\\s\\S]*>${total}<\\/span>`));
  }
  assert.doesNotMatch(functionSource("metricaHoraDia"),/querySelector|getElementById|textContent|innerHTML/);
});

test("las cinco columnas usan el mismo renderer hora/día",()=>{
  const table=functionSource("pintaTabla");
  assert.match(table,/indicadorMetricaHtml\(a,"objectives"\)/);
  assert.match(table,/numeroVentanas\(a\)/);
  assert.match(table,/indicadorMetricaHtml\(a,"missions"\)/);
  assert.match(table,/indicadorMetricaHtml\(a,"tasks"\)/);
  assert.match(table,/puntosHtml\(a, progressId\)/);
  assert.match(source,/role="text" aria-label=/);
});
