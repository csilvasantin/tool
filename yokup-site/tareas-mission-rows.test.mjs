import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const [page,missionsSource,styles]=await Promise.all([
  "tareas.html","yk-misiones.js","yk-misiones.css"
].map(name=>readFile(new URL(`./${name}`,import.meta.url),"utf8")));

function loadMissions(){
  const window={fetch:async()=>({json:async()=>({customize:{}})})};
  const context=vm.createContext({
    window,document:{addEventListener(){},querySelector(){return null}},
    localStorage:{getItem(){return null},setItem(){},removeItem(){}},
    Intl,Date,Math,JSON,Promise,RegExp,Object,Array,String,Number,Boolean,
    CustomEvent:function(){},setTimeout,clearTimeout,setInterval,clearInterval,console
  });
  vm.runInContext(missionsSource,context);
  return window.YkMisiones;
}

test("/tareas sustituye la parrilla compacta por filas completas compartidas",()=>{
  assert.match(page,/class="list taskboard" id="grid"/);
  assert.match(page,/YkMisiones\.init\(\{worker:WORKER, columnMode:"tasks", projectIdLayout:true\}\)/);
  assert.match(page,/YkMisiones\.rowHtml\(mission\)/);
  assert.match(page,/Agente\/Plataforma[\s\S]*Proyecto[\s\S]*Misión[\s\S]*Tareas A·B·C[\s\S]*Estado \/ acciones/);
  assert.doesNotMatch(page,/repeat\(auto-fill|minmax\(min\(320px|class="mcard/);
});

test("el detalle mantiene apertura persistente, chips y foco por mission_id + code",()=>{
  assert.match(page,/OPEN_CARDS\.has\(g\.mission\.id\)/);
  assert.match(page,/class="taskfold"[^>]*aria-expanded/);
  assert.match(page,/YkMisiones\.stepsHtml\(g\.tasks\)/);
  assert.match(page,/YkMisiones\.postStatus\(mid, ch\.dataset\.code/);
  assert.match(page,/querySelector\('\.node\[data-code="'\+code\+'"\]'/);
  assert.match(page,/html\[data-yk-view="list"\] \.taskfold,html\[data-yk-view="list"\] \.taskdetail/);
});

test("presets y día concreto viven en un solo control temporal",()=>{
  assert.match(page,/id="rangePreset"[\s\S]*value="hoy"[\s\S]*value="ayer"[\s\S]*value="7d"[\s\S]*value="todas"[\s\S]*value="dia"/);
  assert.match(page,/id="rangeDay"[^>]*hidden/);
  assert.match(page,/showDay:false/);
  assert.match(page,/rangeDay\.hidden=mode!=="dia"/);
  assert.doesNotMatch(page,/querySelectorAll\("\.tf"\)/);
});

test("el agrupador no pierde los datos necesarios para la fila de misión",()=>{
  const Yk=loadMissions();
  const [group]=Yk.groupByMission([{
    mission_id:"FLT-1225",mission_display_ref:"1225.05/08/2026.12:00",
    subject:"xpaceos.com · Publicar",screen:"svc:xpaceos.com",loc:"MacMini",
    project:"xpaceos",source:"fleet",role:"mission",assignee:"OraculoMacMini",
    mission_status:"in_progress",mission_created:1,mission_resolved:2,
    mission_proof:"https://img.test/proof.png",live_shot:"https://img.test/live.png",live_at:123,
    code:"a",title:"Estructura",status:"in_progress"
  }]);
  assert.deepEqual(
    [group.mission.project,group.mission.project_name,group.mission.loc,group.mission.proof_image,group.mission.resolved_at,group.mission.live_at],
    ["xpaceos","xpaceos","MacMini","https://img.test/proof.png",2,123]
  );
  Yk.init({worker:"https://api.yokup.com",columnMode:"tasks",projectIdLayout:true});
  const model={...group.mission,_tasks:group.tasks,_prog:Yk.tercios(group.tasks,false)};
  const html=Yk.rowHtml(model);
  assert.match(html,/class="cel agc"/);
  assert.match(html,/class="project-id-cell"/);
  assert.match(html,/class="mission-col"/);
  assert.match(html,/class="cel ord tasks-col"/);
  assert.match(html,/class="cel est"/);
  assert.match(html,/href="\/tareas\?mission=FLT-1225#a"/);
});

test("live_at fresco pinta EN VIVO y un latido caduco vuelve al icono estático",()=>{
  const Yk=loadMissions();
  Yk.init({worker:"https://api.yokup.com",columnMode:"tasks",projectIdLayout:true});
  const base={id:"FLT-LIVE",subject:"xpaceos · Revisión",screen:"svc:xpaceos.com",loc:"MacMini",
    project:"xpaceos",source:"fleet",assignee:"OraculoMacMini",status:"in_progress",
    priority:"normal",created_at:Date.now()-60_000,live_shot:"https://img.test/live.png",_tasks:[]};
  const fresh=Yk.rowHtml({...base,live_at:Date.now()});
  const stale=Yk.rowHtml({...base,id:"FLT-STALE",live_at:Date.now()-181_000});
  assert.match(fresh,/class="shot-img working"[^>]*src="https:\/\/img\.test\/live\.png"/);
  assert.doesNotMatch(stale,/shot-img working|https:\/\/img\.test\/live\.png/);
  assert.match(stale,/class="shot-img shot-icon"/);
});

test("720/520/390 colapsan sin scroll y conservan blancos táctiles 44x44",()=>{
  assert.match(page,/@media\(max-width:1100px\)/);
  assert.match(page,/@media\(max-width:720px\)\{\.hd\.project-id-layout\{grid-template-columns:8px 1fr\}/);
  assert.match(styles,/@media\(max-width:720px\)\{\.hd,\.hd\.project-id-layout\{grid-template-columns:8px 1fr/);
  assert.doesNotMatch(page,/overflow-x\s*:\s*auto|min-width\s*:\s*1100px/);
  assert.match(page,/:is\(\.chip,\.tkopen,\.substog\)\{display:inline-flex;min-width:44px;min-height:44px;align-items:center;justify-content:center\}/);
});

test("la fila selecciona y sólo el botón explícito despliega el árbol",()=>{
  assert.match(page,/YkMisiones\.bindRows\(box\)/);
  assert.match(page,/const fold=card\.querySelector\("\.taskfold"\);if\(fold\)fold\.onclick=toggle/);
  assert.doesNotMatch(page,/row\.addEventListener\("click"[\s\S]*toggle\(\)/);
});
