import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const source=await readFile(new URL("./highscore.html",import.meta.url),"utf8");

function missionApi(missions){
  const start=source.indexOf("function instanteMisionActiva(");
  const end=source.indexOf("\n\n  function filasConMisionEnCurso",start);
  assert.ok(start>=0&&end>start,"faltan los helpers de misión activa");
  const functions=source.slice(start,end);
  return new Function("datos","normaliza","claveAgenteCarrera","agenteDeMision",`${functions}\nreturn {list:misionesEnCurso,pick:misionActivaDeAgente,title:tituloMisionActiva,summary:resumenMisionActiva};`)(
    {misiones:missions},value=>String(value==null?"":value).trim(),
    value=>String(value||"").toLowerCase().replace(/[^a-z0-9]/g,""),mission=>mission&&mission.assignee||"",
  );
}

function renderRace(rows,missions){
  const start=source.indexOf("function instanteMisionActiva(");
  const end=source.indexOf("\n\n  function pintaFormula",start);
  const nodes={
    refreshLanes:{innerHTML:""},
    refreshRace:{attrs:{},setAttribute(key,value){this.attrs[key]=String(value);},classList:{toggle(){}}},
  };
  const context=vm.createContext({
    listaCache:rows,datos:{misiones:missions},document:{getElementById:id=>nodes[id]},
    normaliza:value=>String(value==null?"":value).trim(),
    esc:value=>String(value==null?"":value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;"),
    claveAgenteCarrera:value=>String(value||"").toLowerCase().replace(/[^a-z0-9]/g,""),
    agenteDeMision:mission=>mission&&mission.assignee||"",Number,String,Math,Date,
  });
  vm.runInContext(`${source.slice(start,end)}\nactualizaCarreraPodio();`,context);
  return {html:nodes.refreshLanes.innerHTML,lanes:Number(nodes.refreshRace.attrs["data-lanes"]||0)};
}

test("Running Man consume la misma fuente canónica que /misiones",()=>{
  assert.equal((source.match(/seguroYokup\("\/tickets\?scope=fleet"/g)||[]).length,2,
    "carga inicial y refresco deben compartir /tickets?scope=fleet");
  assert.doesNotMatch(source,/seguroYokup\("\/fleet\/missions"/);
  assert.match(source,/function \(d\) \{ return d\.tickets \|\| \[\]; \}/);
});

test("elige de forma determinista la misión activa más reciente de cada agente",()=>{
  const missions=[
    {id:"FLT-Z",assignee:"OraculoMacMini",status:"in_progress",updated_at:1000},
    {id:"FLT-B",assignee:"OraculoMacMini",status:"in_progress",live_at:3000,updated_at:2000},
    {id:"FLT-A",assignee:"OraculoMacMini",status:"in_progress",live_at:3000,updated_at:2500},
    {id:"FLT-X",assignee:"NeoMacMini",status:"resolved",live_at:9999},
  ];
  const api=missionApi(missions),active=api.list();
  assert.deepEqual(active.map(mission=>mission.id),["FLT-A","FLT-B","FLT-Z"]);
  assert.equal(api.pick(active,"oraculomacmini").id,"FLT-A");
});

test("display_ref, título, estado y proyecto salen de campos canónicos y legibles",()=>{
  const mission={
    id:"FLT-1175",display_ref:"0231.04/08/2026.19:22",assignee:"OraculoMacMini",status:"in_progress",
    subject:"[ALTA] **Mejorar Running Man** → flecha editorial del objetivo | texto de ventana que no pertenece al título",
    project_name:"Yokup",updated_at:3000,
  };
  const api=missionApi([mission]);
  assert.deepEqual(api.summary(mission),{
    reference:"0231.04/08/2026.19:22",title:"Mejorar Running Man",state:"EN CURSO",project:"Yokup",
  });
  assert.equal(api.title({subject:"Título visible. Editorial posterior."}),"Título visible.");
  const longTitle="Título factual "+"muy largo ".repeat(35).trim();
  assert.equal(api.title({subject:longTitle}),longTitle,"el dato no se trunca en JavaScript");
  assert.deepEqual(api.summary(null),{reference:"",title:"Sin misión activa",state:"Sin misión activa",project:""});
});

test("la calle muestra misión y agente completos, sin fragmentos editoriales",()=>{
  const race=renderRace([{agente:"OraculoMacMini",vivo:true,posicion:1,total:80}],[{
    id:"FLT-1175",display_ref:"0231.04/08/2026.19:22",assignee:"OraculoMacMini",status:"in_progress",
    subject:"Mejorar Running Man → flecha editorial del objetivo | ventana de decisión",project:"yokup",updated_at:3000,
  }]);
  assert.equal(race.lanes,1);
  for(const expected of ["0231.04/08/2026.19:22","Mejorar Running Man","EN CURSO","yokup","OraculoMacMini"])
    assert.match(race.html,new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.doesNotMatch(race.html,/flecha|editorial|objetivo|ventana de decisión/i);

  const empty=renderRace([{agente:"OraculoMacMini",vivo:true}],[]);
  assert.equal(empty.lanes,0);
  assert.match(empty.html,/class="refresh-empty">Sin misión activa<\/div>/);
});

test("texto y agente se adaptan sin clipping ni marquee ilegible",()=>{
  assert.match(source,/\.refresh-mission-title\{[^}]*white-space:normal[^}]*overflow-wrap:anywhere/);
  assert.match(source,/\.refresh-mission-project\{[^}]*white-space:normal[^}]*overflow-wrap:anywhere/);
  assert.match(source,/\.refresh-agent\{[^}]*overflow-wrap:anywhere/);
  assert.match(source,/\.refresh-agent\{[^}]*white-space:normal/);
  assert.match(source,/@media \(max-width:620px\)[\s\S]*?\.refresh-mission-title\{font-size:9px\}/);
  assert.doesNotMatch(source,/<marquee|function estelaMision|class="refresh-word"|mision\.style\.left/);
  assert.doesNotMatch(source,/\.refresh-mission-title\{[^}]*text-overflow:ellipsis|\.refresh-mission-title\{[^}]*white-space:nowrap/);
});

test("Running Man convive con filtros, tendencia y detalle plegable",()=>{
  assert.match(source,/data-yk-slot="right"[^>]*id="advancedMenu"/);
  assert.match(source,/function aplicaAgentScope\(/);
  assert.match(source,/class="score-trend ' \+ \(up \? "up" : "same"\)/);
  assert.match(source,/<button class="score-toggle" type="button" aria-expanded="false"/);
  assert.match(source,/\.score-progress\[hidden\]\{display:none\}/);
});
