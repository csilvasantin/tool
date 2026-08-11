import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./highscore.html",import.meta.url),"utf8");
const SCOPE_KEY="yokup.highscore.agents.v1";

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
    "normaliza","hsAgentKey","hsReadAgentScope","hsWriteAgentScope",
    "hsAgentScopeAllows","hsSetAgentScopeItem","aplicaAgentScope",
  ].map(functionSource).join("\n");
  return new Function("localStorage",`
    var AGENT_SCOPE_KEY=${JSON.stringify(SCOPE_KEY)};
    var AGENT_SCOPE=null;
    ${functions}
    return {
      read:hsReadAgentScope,
      write:hsWriteAgentScope,
      allows:hsAgentScopeAllows,
      setItem:hsSetAgentScopeItem,
      apply:function(rows,scope){AGENT_SCOPE=scope;return aplicaAgentScope(rows);}
    };
  `)(localStorage);
}

test("Avanzado ofrece el censo de agentes con Todos y multiseleccion accesible",()=>{
  assert.match(source,/data-yk-slot="right"[^>]*id="advancedMenu"/);
  assert.match(source,/id="agentScopeCount"/);
  assert.match(source,/id="agentScopeList"/);
  assert.match(source,/data-agent-scope-preset="all"/);
  assert.match(source,/data-agent-scope-preset="active"/);
  assert.match(source,/data-agent-scope-preset="none"/);
  assert.match(source,/data-agent-scope-item/);
  assert.match(source,/>Todos</);
  assert.match(source,/function hsRenderAgentScope\(/);
  assert.match(source,/listaCompletaCache\s*=\s*calcula\(\)/);
  assert.match(source,/hsRenderAgentScope\(listaCompletaCache(?:\s*\|\|\s*\[\])?\)/);
  assert.match(source,/id="agentScopeToggle"[^>]*aria-expanded="false"[^>]*aria-controls="agentScopeBody"/);
  assert.match(source,/id="agentScopeBody" hidden/);
  assert.match(source,/class="agent-scope-primary agent-scope-switch" type="button" role="switch"/);
  assert.match(source,/>Siguiendo<|No siguiendo/);
  assert.match(source,/\.agent-scope-switch-track::after/);
  assert.match(source,/toggle\.setAttribute\("aria-expanded", String\(open\)\); body\.hidden = !open/);
});

test("uno o varios agentes sobreviven al reabrir la sesion",()=>{
  const localStorage=storage(),first=scopeApi(localStorage);
  first.write(new Set(["oraculomacmini","neomacmini"]));

  const reopened=scopeApi(localStorage).read();
  assert.ok(reopened instanceof Set);
  assert.deepEqual([...reopened],["oraculomacmini","neomacmini"]);
  assert.match(localStorage.value(SCOPE_KEY),/oraculomacmini/);
  assert.match(localStorage.value(SCOPE_KEY),/neomacmini/);
});

test("la seleccion exacta limpia el ranking y lo renumera",()=>{
  const api=scopeApi(storage());
  const rows=[
    {agente:"OraculoMacMini",posicion:1,total:90},
    {agente:"NeoMacMini",posicion:2,total:80},
    {agente:"MorfeoMBA14",posicion:3,total:70},
  ];

  const one=api.apply(rows,new Set(["neomacmini"]));
  assert.deepEqual(one.map(row=>[row.agente,row.posicion]),[["NeoMacMini",1]]);

  const several=api.apply(rows,new Set(["oraculomacmini","morfeomba14"]));
  assert.deepEqual(several.map(row=>[row.agente,row.posicion]),[
    ["OraculoMacMini",1],["MorfeoMBA14",2],
  ]);
});

test("Todos restablece explicitamente el ranking completo y admite agentes futuros",()=>{
  const localStorage=storage(),api=scopeApi(localStorage);
  let scope=api.setItem(null,"neomacmini",false,["oraculomacmini","neomacmini"]);
  assert.deepEqual([...scope],["oraculomacmini"]);

  scope=api.setItem(scope,"neomacmini",true,["oraculomacmini","neomacmini"]);
  assert.equal(scope,null,"seleccionar de nuevo todo el censo equivale a Todos");
  api.write(scope);

  const reopened=scopeApi(localStorage);
  assert.equal(reopened.read(),null);
  const rows=[
    {agente:"OraculoMacMini",posicion:8},
    {agente:"NeoMacMini",posicion:9},
    {agente:"AgenteNuevoMacMini",posicion:10},
  ];
  assert.deepEqual(reopened.apply(rows,reopened.read()).map(row=>[row.agente,row.posicion]),[
    ["OraculoMacMini",1],["NeoMacMini",2],["AgenteNuevoMacMini",3],
  ]);
});

test("un agente retirado de la seleccion no vuelve por un refresco del censo",()=>{
  const localStorage=storage(),api=scopeApi(localStorage);
  api.write(new Set(["oraculomacmini"]));
  const reopened=scopeApi(localStorage),scope=reopened.read();

  assert.equal(reopened.allows(scope,"OraculoMacMini"),true);
  assert.equal(reopened.allows(scope,"NeoMacMini"),false);
  assert.deepEqual(reopened.apply([
    {agente:"OraculoMacMini",posicion:1},
    {agente:"NeoMacMini",posicion:2},
    {agente:"AgenteNuevoMacMini",posicion:3},
  ],scope).map(row=>row.agente),["OraculoMacMini"]);
});
