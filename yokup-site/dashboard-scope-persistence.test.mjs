import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./dashboard.html",import.meta.url),"utf8");
const PROJECT_KEY="yokup.dashboard.projects.v1";
const TEAM_KEY="yokup.dashboard.teams.v1";

function functionSource(name){
  const start=source.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`falta ${name}`);
  const brace=source.indexOf("{",start);
  let depth=0,quote="",escaped=false;
  for(let index=brace;index<source.length;index++){
    const char=source[index];
    if(quote){
      if(escaped)escaped=false;
      else if(char==="\\")escaped=true;
      else if(char===quote)quote="";
      continue;
    }
    if(char==='"'||char==="'"||char==='`'){quote=char;continue;}
    if(char==="{")depth++;
    else if(char==="}"&&--depth===0)return source.slice(start,index+1);
  }
  throw new Error(`funcion ${name} incompleta`);
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

function scopeApi(localStorage){
  const functions=[
    "paReadScope","paWriteScope","paReadProjectScope","paWriteProjectScope",
    "paNormalizeScope","paNormalizeExactScope",
  ].map(functionSource).join("\n");
  return new Function("localStorage",`const PROJECT_SCOPE_KEY=${JSON.stringify(PROJECT_KEY)};\n${functions}\nreturn {paReadScope,paWriteScope,paReadProjectScope,paWriteProjectScope,paNormalizeScope,paNormalizeExactScope};`)(localStorage);
}

test("proyectos y equipos sobreviven una recarga con preferencias independientes",()=>{
  const localStorage=storage(),first=scopeApi(localStorage);
  first.paWriteProjectScope(new Set(["pixeria","xpaceos"]));
  first.paWriteScope(TEAM_KEY,new Set(["macmini","macbookpro16"]));

  const reopened=scopeApi(localStorage);
  assert.deepEqual([...reopened.paReadProjectScope()],["pixeria","xpaceos"]);
  assert.deepEqual([...reopened.paReadScope(TEAM_KEY)],["macmini","macbookpro16"]);
  assert.equal(localStorage.value(PROJECT_KEY),'["pixeria","xpaceos"]');
  assert.equal(localStorage.value(TEAM_KEY),'["macmini","macbookpro16"]');
});

test("la ausencia de preferencia se distingue de Todos y del vacio intencional",()=>{
  const localStorage=storage(),api=scopeApi(localStorage);
  assert.equal(api.paReadProjectScope(),undefined);
  assert.equal(api.paReadScope(TEAM_KEY),null);

  api.paWriteProjectScope(null);
  api.paWriteScope(TEAM_KEY,new Set());
  const reopened=scopeApi(localStorage);
  assert.equal(reopened.paReadProjectScope(),null);
  assert.deepEqual([...reopened.paReadScope(TEAM_KEY)],[]);
  assert.equal(localStorage.value(PROJECT_KEY),'{"mode":"all"}');
  assert.equal(localStorage.value(TEAM_KEY),'[]');
});

test("la seleccion vacia de proyectos tambien persiste entre sesiones",()=>{
  const localStorage=storage(),api=scopeApi(localStorage);
  api.paWriteProjectScope(new Set());

  const reopened=scopeApi(localStorage).paReadProjectScope();
  assert.ok(reopened instanceof Set);
  assert.equal(reopened.size,0);
  assert.equal(localStorage.value(PROJECT_KEY),'[]');
});

test("las claves obsoletas se descartan sin contaminar el otro filtro",()=>{
  const localStorage=storage({
    [PROJECT_KEY]:'["pixeria","proyecto-retirado"]',
    [TEAM_KEY]:'["macmini","equipo-retirado"]',
  }),api=scopeApi(localStorage);
  const projects=api.paNormalizeScope(api.paReadProjectScope(),["pixeria","xpaceos"]);
  const teams=api.paNormalizeExactScope(api.paReadScope(TEAM_KEY),["macmini","macbookpro16"]);
  api.paWriteProjectScope(projects);
  api.paWriteScope(TEAM_KEY,teams);

  const reopened=scopeApi(localStorage);
  assert.deepEqual([...reopened.paReadProjectScope()],["pixeria"]);
  assert.deepEqual([...reopened.paReadScope(TEAM_KEY)],["macmini"]);
});

test("la migracion de censo no borra preferencias guardadas",()=>{
  const migration=source.slice(source.indexOf("let SCOPE_DEFAULTS_PENDING"),source.indexOf("let PROJECT_SCOPE="));
  assert.doesNotMatch(migration,/removeItem\(PROJECT_SCOPE_KEY\)/);
  assert.doesNotMatch(migration,/removeItem\(TEAM_SCOPE_KEY\)/);
  assert.match(source,/if\(PROJECT_SCOPE===undefined\)PROJECT_SCOPE=new Set\(PROJECT_ROWS\.map/);
});
