// FLT-1519 · proyección pública Carbono/Silicio del Dashboard.
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./dashboard.html",import.meta.url),"utf8");

function functionSource(name){
  const start=source.indexOf(`function ${name}(`);assert.notEqual(start,-1,`falta ${name}`);
  const brace=source.indexOf("{",start);let depth=0,quote="",escaped=false;
  for(let index=brace;index<source.length;index++){
    const char=source[index];
    if(quote){if(escaped)escaped=false;else if(char==="\\")escaped=true;else if(char===quote)quote="";continue;}
    if(char==='"'||char==="'"||char==='`'){quote=char;continue;}
    if(char==="{")depth++;else if(char==="}"&&--depth===0)return source.slice(start,index+1);
  }
  throw new Error(`función ${name} incompleta`);
}

function carbonApi(){
  return new Function(`${functionSource("paCarbonResponsible")}\n${functionSource("paCarbonKey")}\n${functionSource("paCarbonAgents")}\nreturn {paCarbonAgents};`)();
}

function countsApi(){
  return new Function(`${functionSource("paTeamRoleCounts")}\n${functionSource("paRoleCounts")}\nreturn {paTeamRoleCounts,paRoleCounts};`)();
}

const neo={id:"NeoMacMini",team:"macmini",surfaces:[{online:true}],helpers:[{id:"SubNeoMacMini",role:"sub",online:true,assigned:true}]};
const oraculo={id:"OraculoMacMini",team:"macmini",surfaces:[{online:false}],helpers:[]};

test("la cabecera pública solo ofrece Agentes de Silicio y Agentes de Carbono",()=>{
  const start=source.indexOf('id="projectAgentTeamsPane"'),header=source.slice(start,source.indexOf('</summary>',start));
  assert.match(header,/Agentes de Silicio <span class="pa-count" id="projectAgentSiliconN">/);
  assert.match(header,/Agentes de Carbono <span class="pa-count" id="projectAgentCarbonN">/);
  assert.doesNotMatch(header,/Agentes principales|Subagentes|Infraagentes|projectAgentAgentsN|projectAgentSubsN|projectAgentInfrasN/);
  assert.match(source,/projectAgentSiliconN"\)\.textContent=roleCounts\.main\.active\+"\/"\+roleCounts\.main\.total/);
  assert.match(source,/projectAgentCarbonN"\)\.textContent=String\(carbonAgents\.length\)/);
});

test("Carbono nace de los responsables de proyecto, deduplicado y asociado",()=>{
  const {paCarbonAgents}=carbonApi();
  const agents=paCarbonAgents([
    {id:"xpaceos",name:"XpaceOS",carbon_responsible:" Carlos3.0 "},
    {id:"playertaza",name:"PlayerTaza",carbon_responsible:"Carlos3.0"},
    {id:"telegram",name:"Telegram",carbon_responsible:"CARLOS3.0"},
    {id:"presentaciones",name:"Generador de Presentaciones",carbon_responsible:"Carlos"},
    {id:"vacio",name:"Sin responsable",carbon_responsible:""},
  ]);
  assert.equal(agents.length,2);
  assert.deepEqual(agents.find(agent=>agent.key==="carlos3.0").projects.map(project=>project.id),["playertaza","telegram","xpaceos"]);
  assert.equal(agents.find(agent=>agent.key==="carlos").projects[0].name,"Generador de Presentaciones");
});

test("la lista Carbono comunica responsables únicos y conserva edición por proyecto",()=>{
  assert.match(source,/class="pa-roster-group pa-roster-carbon"/);
  assert.match(source,/data-carbon-agent=/);
  assert.match(source,/Responsable Carbono · /);
  assert.match(source,/data-carbon-project=/);
  assert.match(source,/paCarbonAgents\(visibleProjects\.filter/);
  assert.match(source,/data-pa-carbon-input=/);
  assert.match(source,/carbon_responsible:next,expected_carbon_responsible:previous/);
});

test("Silicio mantiene familias y actividad real sin convertir assigned en online",()=>{
  const {paRoleCounts,paTeamRoleCounts}=countsApi();
  assert.equal(paRoleCounts([], [{key:"macmini",agents:[neo,oraculo]}]).main.total,2);
  assert.equal(paRoleCounts([], [{key:"macmini",agents:[neo,oraculo]}]).main.active,1);
  assert.equal(paTeamRoleCounts({key:"macmini",agents:[neo,oraculo]}).main.active,1);
  const body=functionSource("paRoleCounts")+functionSource("paTeamRoleCounts");
  assert.match(body,/agent\.surfaces\.some\(slot=>slot\.online===true\)/);
  assert.doesNotMatch(body,/main[^\n]*agent\.assigned|agent\.assigned[^\n]*main/);
});

test("Infra queda fuera de familias, proyectos, cables y contenido visible",()=>{
  assert.match(functionSource("paAgentFamilies"),/if\(role==="infra"\)return/);
  assert.match(functionSource("paProjectAgentRefs"),/filter\(ref=>paAgentRole\(ref\)!=="infra"\)/);
  const render=functionSource("paRender");
  assert.doesNotMatch(render,/projectAgentInfrasN|Infraagentes|infra · QA/);
  assert.match(render,/Silicio · ejecución/);
});

test("cada equipo y cada proyecto usan la nueva nomenclatura",()=>{
  const render=functionSource("paRender");
  assert.match(render,/Agentes de Silicio · '\+teamCarbons\.length\+' Agentes de Carbono/);
  assert.match(render,/assignedGroups\.length\+' agentes de Silicio/);
  assert.match(render,/Sin agentes de Silicio elegidos/);
  assert.doesNotMatch(render,/agentes principales|Subagentes|Infraagentes/);
});
