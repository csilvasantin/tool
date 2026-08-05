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

const api=new Function(["paScopeIsAll","paScopeValues","paNormalizeExactScope","paSetExactScopeItem"].map(functionSource).join("\n")+";return {paNormalizeExactScope,paSetExactScopeItem};")();

test("Equipos empieza siempre en Todos, también tras una selección legacy parcial o vacía",()=>{
  assert.match(source,/paClearLegacyScopes\(\);\s*let PROJECT_SCOPE=null;\s*let TEAM_SCOPE=null;/);
  assert.doesNotMatch(source,/let TEAM_SCOPE=paReadScope/);
  assert.match(functionSource("paReadScope"),/return null/);
});

test("Equipos conserva una selección exacta solamente durante el documento",()=>{
  const keys=["macmini","macbookpro16","macbookpro14"];
  const selected=api.paSetExactScopeItem(null,"macbookpro16",false,keys);
  assert.deepEqual([...selected],["macmini","macbookpro14"]);
  assert.deepEqual([...api.paNormalizeExactScope(selected,[...keys,"macbookairnuevo"])],["macmini","macbookpro14"]);
});

test("Equipos en Todos incorpora una alta nueva del censo automáticamente",()=>{
  assert.equal(api.paNormalizeExactScope(null,["macmini","macbookpro14","nuevo"]),null);
  assert.match(source,/const visibleTeams=paVisibleTeams\(teams,TEAM_SCOPE,TEAM_FILTER,PROJECT_ROWS\)/);
  assert.match(source,/visibleTeams\.length\+"\/"\+teams\.length/);
});

test("Todos y Sin proyecto siguen siendo controles separados",()=>{
  assert.match(source,/projectAgentTeamsAll[^\n]+TEAM_SCOPE=null/);
  assert.match(source,/projectAgentTeamsUnassigned[^\n]+TEAM_FILTER="unassigned"/);
  assert.match(source,/filter==="unassigned"\?!paTeamHasProject/);
});
