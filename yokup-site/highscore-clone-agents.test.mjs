import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const highscore=await readFile(new URL("./highscore.html",import.meta.url),"utf8");
const dashboard=await readFile(new URL("./dashboard.html",import.meta.url),"utf8");
const identitySource=await readFile(new URL("./yk-agent-identity.js",import.meta.url),"utf8");
const HIGH_KEY="yokup.highscore.agents.v1";
const DASHBOARD_KEY="yokup.dashboard.teams.v1";

function functionSource(name){
  const start=highscore.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`falta ${name}`);
  const brace=highscore.indexOf("{",start);
  let depth=0,quote="",escaped=false;
  for(let index=brace;index<highscore.length;index++){
    const char=highscore[index];
    if(quote){
      if(escaped)escaped=false;
      else if(char==="\\")escaped=true;
      else if(char===quote)quote="";
      continue;
    }
    if(char==='"'||char==="'"||char==='`'){quote=char;continue;}
    if(char==="{")depth++;
    else if(char==="}"&&--depth===0)return highscore.slice(start,index+1);
  }
  throw new Error(`función ${name} incompleta`);
}

function storage(initial={}){
  const values=new Map(Object.entries(initial));
  return {
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),
    value:key=>values.get(key),
  };
}

function cloneApi(){
  const context=vm.createContext({});
  vm.runInContext(identitySource,context);
  const functions=["hsDashboardTeamSuffix","hsCloneAgentScopeToDashboard","hsCloneAgentScopeMessage"]
    .map(functionSource).join("\n");
  const build=new Function("identity",`
    var DASHBOARD_TEAM_SCOPE_KEY=${JSON.stringify(DASHBOARD_KEY)};
    var window={ykAgentIdentity:identity};
    function normaliza(value){return String(value==null?"":value).trim();}
    function hsAgentKey(value){return normaliza(value).normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"");}
    ${functions}
    return {clone:hsCloneAgentScopeToDashboard,message:hsCloneAgentScopeMessage,suffix:hsDashboardTeamSuffix};
  `);
  return build(context.ykAgentIdentity);
}

const rows=[
  {agente:"OraculoMini",suffix:"",maquinas:["Mac Mini"]},
  {agente:"NeoMacMini",suffix:"MacMini",maquinas:["Mac Mini"]},
  {agente:"MorfeoMBP14",suffix:"MBP14",maquinas:["MacBookProNegro14"]},
  {agente:"Fantasma",suffix:"",maquinas:["Equipo desconocido"]},
];

test("Avanzado ofrece Clonar agentes sin alterar el slot del menú superior",()=>{
  assert.match(highscore,/data-yk-slot="right"[^>]*id="advancedMenu"/);
  assert.equal((highscore.match(/id="advancedMenu"/g)||[]).length,1);
  assert.match(highscore,/<button class="agent-scope-clone" id="agentScopeClone" type="button" aria-describedby="agentScopeCloneStatus">Clonar agentes<\/button>/);
  assert.match(highscore,/id="agentScopeCloneStatus" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(highscore,/id="agentScopeBody" hidden/);
  assert.match(highscore,/class="agent-scope-body"[^>]*hidden/);
  assert.match(highscore,/<script src="\/yk-frame\.js/);
});

test("origen y destino usan las claves persistentes reales de cada pantalla",()=>{
  assert.match(highscore,new RegExp(`AGENT_SCOPE_KEY = "${HIGH_KEY.replace(/\./g,"\\.")}"`));
  assert.match(highscore,new RegExp(`DASHBOARD_TEAM_SCOPE_KEY = "${DASHBOARD_KEY.replace(/\./g,"\\.")}"`));
  assert.match(dashboard,new RegExp(`TEAM_SCOPE_KEY="${DASHBOARD_KEY.replace(/\./g,"\\.")}"`));
  assert.doesNotMatch(highscore,/yokup\.dashboard\.agents/);
});

test("un agente reemplaza exactamente la selección anterior del Dashboard",()=>{
  const api=cloneApi(),localStorage=storage({[DASHBOARD_KEY]:JSON.stringify(["MBP16","obsoleto"])});
  const result=api.clone(new Set(["oraculomini"]),rows,localStorage,api.identity);
  assert.deepEqual(JSON.parse(localStorage.value(DASHBOARD_KEY)),["MacMini"]);
  assert.deepEqual(result,{all:false,agents:1,teams:["MacMini"]});
});

test("varios agentes deduplican equipos y persisten tras recargar Dashboard",()=>{
  const api=cloneApi(),localStorage=storage();
  const result=api.clone(new Set(["oraculomini","neomacmini","morfeombp14"]),rows,localStorage);
  assert.deepEqual(result.teams,["MacMini","MBP14"]);
  const dashboardReload=JSON.parse(localStorage.getItem(DASHBOARD_KEY));
  assert.deepEqual(dashboardReload,["MacMini","MBP14"]);
  assert.match(api.message(result),/3 agentes clonados · 2 equipos físicos/);
});

test("Todos elimina el filtro destino y una selección vacía escribe el vacío exacto",()=>{
  const api=cloneApi(),localStorage=storage({[DASHBOARD_KEY]:JSON.stringify(["MacMini"])});
  const all=api.clone(null,rows,localStorage);
  assert.equal(localStorage.getItem(DASHBOARD_KEY),null);
  assert.equal(all.all,true);
  assert.match(api.message(all),/todos los equipos físicos/);

  const empty=api.clone(new Set(),rows,localStorage);
  assert.equal(localStorage.getItem(DASHBOARD_KEY),"[]");
  assert.deepEqual(empty,{all:false,agents:0,teams:[]});
  assert.match(api.message(empty),/selección vacía/);
});

test("alias histórico se canoniza y un agente sin equipo de Dashboard no inventa claves",()=>{
  const api=cloneApi(),localStorage=storage();
  assert.equal(api.suffix(rows[0]),"MacMini","OraculoMini debe leerse como alias de MacMini");
  assert.equal(api.suffix(rows[3]),"");
  const result=api.clone(new Set(["oraculomini","fantasma"]),rows,localStorage);
  assert.deepEqual(result.teams,["MacMini"]);
  assert.doesNotMatch(localStorage.getItem(DASHBOARD_KEY),/Fantasma|desconocido|SINMAQ/i);
});

test("la acción reemplaza destino y publica confirmación o error accesible",()=>{
  assert.match(highscore,/hsCloneAgentScopeToDashboard\(AGENT_SCOPE, listaCompletaCache \|\| \[\], localStorage, window\.ykAgentIdentity\)/);
  assert.match(highscore,/status\.textContent = hsCloneAgentScopeMessage\(result\)/);
  assert.match(highscore,/status\.textContent = "No se pudo guardar la selección del Dashboard"/);
  assert.match(highscore,/function hsClearCloneStatus\(\)/);
});
