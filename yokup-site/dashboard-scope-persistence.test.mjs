import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./dashboard.html",import.meta.url),"utf8");
const PROJECT_KEY="yokup.dashboard.projects.v1";
const TEAM_KEY="yokup.dashboard.teams.v1";
const DEFAULTS_KEY="yokup.dashboard.census-defaults.v1";

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

function storage(initial={}){
  const values=new Map(Object.entries(initial));
  return {getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),value:key=>values.get(key)};
}

function scopeApi(localStorage,sessionStorage){
  const body=["paClearLegacyScopes","paScopeIsAll","paScopeValues","paReadScope","paWriteScope","paReadProjectScope","paWriteProjectScope","paNormalizeScope","paNormalizeExactScope","paSetScopeItem","paSetExactScopeItem"].map(functionSource).join("\n");
  return new Function("localStorage","sessionStorage",`const PROJECT_SCOPE_KEY=${JSON.stringify(PROJECT_KEY)},TEAM_SCOPE_KEY=${JSON.stringify(TEAM_KEY)},SCOPE_DEFAULTS_KEY=${JSON.stringify(DEFAULTS_KEY)};${body};return {paClearLegacyScopes,paReadScope,paWriteScope,paReadProjectScope,paWriteProjectScope,paNormalizeScope,paNormalizeExactScope,paSetScopeItem,paSetExactScopeItem};`)(localStorage,sessionStorage);
}

test("cada documento limpia las tres preferencias legacy en localStorage y sessionStorage",()=>{
  const stale={[PROJECT_KEY]:'["pixeria"]',[TEAM_KEY]:'[]',[DEFAULTS_KEY]:"1"};
  const local=storage(stale),session=storage(stale),api=scopeApi(local,session);
  api.paClearLegacyScopes();
  for(const key of [PROJECT_KEY,TEAM_KEY,DEFAULTS_KEY]){
    assert.equal(local.value(key),undefined);assert.equal(session.value(key),undefined);
  }
  assert.match(source,/paClearLegacyScopes\(\);\s*let PROJECT_SCOPE=null;\s*let TEAM_SCOPE=null;/);
});

test("leer, escribir o reabrir no restaura selección parcial ni vacía",()=>{
  const local=storage({[PROJECT_KEY]:'["pixeria"]',[TEAM_KEY]:"[]"}),session=storage();
  const first=scopeApi(local,session);first.paClearLegacyScopes();
  first.paWriteProjectScope(new Set(["xpaceos"]));first.paWriteScope(TEAM_KEY,new Set());
  const reopened=scopeApi(local,session);
  assert.equal(reopened.paReadProjectScope(),null);assert.equal(reopened.paReadScope(TEAM_KEY),null);
  assert.equal(local.value(PROJECT_KEY),undefined);assert.equal(local.value(TEAM_KEY),undefined);
});

test("Todos absorbe altas nuevas; un filtro manual conserva su scope durante el documento",()=>{
  const api=scopeApi(storage(),storage()),before=["pixeria","xpaceos"],after=[...before,"nuevo"];
  assert.equal(api.paNormalizeScope(null,after),null,"Todos incorpora el proyecto nuevo");
  const manual=api.paSetScopeItem(null,"pixeria",false,before);
  assert.deepEqual([...api.paNormalizeScope(manual,after)],["xpaceos"],"el refresco no ensancha un filtro manual");
  assert.equal(api.paNormalizeExactScope(null,["macmini","mbp14","nuevo-equipo"]),null,"Todos incorpora equipos nuevos");
  const teamManual=api.paSetExactScopeItem(null,"mbp14",false,["macmini","mbp14"]);
  assert.deepEqual([...api.paNormalizeExactScope(teamManual,["macmini","mbp14","nuevo-equipo"])],["macmini"]);
});

test("el catálogo inicial usa todos los proyectos activos y el denominador total",()=>{
  const load=source.slice(source.indexOf("async function paLoad"),source.indexOf('pa("projectAgentRefresh").onclick'));
  assert.match(load,/PROJECT_CATALOG=sourceProjects\.filter\([^\n]+status[^\n]+archivado/);
  assert.match(load,/PROJECT_ROWS=paProjectsForScope\(\)/);
  assert.doesNotMatch(load,/paLaunchProjects|PROJECT_SCOPE===undefined/);
  assert.match(functionSource("paRender"),/const active=PROJECT_CATALOG\.filter\(p=>p\.status!=="archivado"\)\.length/);
  assert.match(functionSource("paRender"),/visibleActive\+"\/"\+active/);
});

test("el scope no se restaura desde URL, localStorage ni sessionStorage",()=>{
  const setup=source.slice(source.indexOf("const PROJECT_SCOPE_KEY"),source.indexOf("let PROJECT_FILTER"));
  assert.doesNotMatch(setup,/URLSearchParams|location\.search|\.getItem\(/);
  assert.match(setup,/removeItem\(key\)/);
  assert.match(setup,/let PROJECT_SCOPE=null/);assert.match(setup,/let TEAM_SCOPE=null/);
});
