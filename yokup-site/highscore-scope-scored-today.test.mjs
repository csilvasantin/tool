import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./highscore.html",import.meta.url),"utf8");
function functionSource(name){
  const start=source.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`falta ${name}`);
  const brace=source.indexOf("{",start);
  let depth=0,quote="",escaped=false;
  for(let index=brace;index<source.length;index++){
    const char=source[index];
    if(quote){ if(escaped)escaped=false; else if(char==="\\")escaped=true; else if(char===quote)quote=""; continue; }
    if(char==='"'||char==="'"||char==='`'){quote=char;continue;}
    if(char==="{")depth++; else if(char==="}"&&--depth===0)return source.slice(start,index+1);
  }
  throw new Error(`funcion ${name} incompleta`);
}
function api(mode,scope){
  const functions=["normaliza","hsAgentKey","hsAgentScopeAllows","hsHaPuntuadoHoy","aplicaAgentScope"].map(functionSource).join("\n");
  return new Function(`
    var AGENT_SCOPE_MODE=${JSON.stringify(mode)};
    var AGENT_SCOPE=${scope===null?"null":"new Set("+JSON.stringify([...scope])+")"};
    function hsEffectiveAgentScope(){ return AGENT_SCOPE_MODE==="all"?null:(AGENT_SCOPE instanceof Set?new Set(Array.from(AGENT_SCOPE)):new Set()); }
    ${functions}
    return function(rows){ return aplicaAgentScope(rows); };
  `)();
}
const rows=[
  {agente:"NeoMBP14",total:785},
  {agente:"MorfeoMacMini",total:200},   // puntuó hoy desde una máquina sin presencia verificada
  {agente:"OraculoMacMini",total:60},
  {agente:"SmithMBA16",total:0},        // ni activo ni puntos: no sale
];
test("en «Activos» (por defecto) quien ha puntuado hoy sale aunque su máquina no tenga presencia verificada",()=>{
  const out=api("active",new Set(["neombp14"]))(rows).map(r=>[r.agente,r.posicion]);
  assert.deepEqual(out,[["NeoMBP14",1],["MorfeoMacMini",2],["OraculoMacMini",3]]);
});
test("una selección manual sigue mandando: fuera del ámbito no sale aunque haya puntuado",()=>{
  const out=api("manual",new Set(["neombp14"]))(rows).map(r=>r.agente);
  assert.deepEqual(out,["NeoMBP14"]);
});
test("Todos sigue mostrando a todos, con y sin puntos",()=>{
  assert.equal(api("all",null)(rows).length,4);
});
