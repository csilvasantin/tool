import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./dashboard.html",import.meta.url),"utf8");

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

function scopeApi(localStorage){
  return new Function("localStorage",[
    "paScopeIsAll","paScopeValues","paReadScope","paWriteScope","paNormalizeExactScope","paSetExactScopeItem",
  ].map(functionSource).join("\n")+"\nreturn {paReadScope,paWriteScope,paNormalizeExactScope,paSetExactScopeItem};")(localStorage);
}

test("Equipos restaura exactamente la selección persistida entre sesiones",()=>{
  const key="yokup.dashboard.teams.v1",firstStorage=storage();
  const first=scopeApi(firstStorage);
  const selected=first.paSetExactScopeItem(null,"macbookpro16",false,["macmini","macbookpro16","macbookpro14"]);
  first.paWriteScope(key,selected);

  const reopened=scopeApi(firstStorage).paReadScope(key);
  assert.deepEqual([...reopened],["macmini","macbookpro14"]);
});

test("Equipos conserva una selección vacía intencional",()=>{
  const key="yokup.dashboard.teams.v1",localStorage=storage();
  const api=scopeApi(localStorage);
  api.paWriteScope(key,new Set());

  const reopened=api.paReadScope(key);
  assert.ok(reopened instanceof Set);
  assert.equal(reopened.size,0);
  assert.equal(localStorage.value(key),"[]");
});

test("Equipos elimina claves obsoletas sin convertir el conjunto exacto en Todos",()=>{
  const localStorage=storage({"yokup.dashboard.teams.v1":'["macmini","retirado"]'}),api=scopeApi(localStorage);
  const restored=api.paReadScope("yokup.dashboard.teams.v1");
  const normalized=api.paNormalizeExactScope(restored,["macmini"]);

  assert.deepEqual([...normalized],["macmini"]);
  assert.notEqual(normalized,null,"un conjunto explícito no debe incluir futuros equipos automáticamente");
});

test("Equipos usa Todos sólo cuando no existe una preferencia",()=>{
  const api=scopeApi(storage());
  assert.equal(api.paReadScope("yokup.dashboard.teams.v1"),null);
  const migration=source.slice(source.indexOf("let SCOPE_DEFAULTS_PENDING"),source.indexOf("let PROJECT_SCOPE="));
  assert.doesNotMatch(migration,/localStorage\.removeItem\(PROJECT_SCOPE_KEY\)/);
  assert.doesNotMatch(migration,/localStorage\.removeItem\(TEAM_SCOPE_KEY\)/);
});
