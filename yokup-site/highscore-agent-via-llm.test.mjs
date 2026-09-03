import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source=await readFile(new URL("./highscore.html",import.meta.url),"utf8");
function functionSource(name){
  const start=source.indexOf(`function ${name}(`); assert.notEqual(start,-1,`falta ${name}`);
  const brace=source.indexOf("{",start); let depth=0,quote="",escaped=false;
  for(let i=brace;i<source.length;i++){const c=source[i];
    if(quote){ if(escaped)escaped=false; else if(c==="\\")escaped=true; else if(c===quote)quote=""; continue; }
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==="{")depth++; else if(c==="}"&&--depth===0)return source.slice(start,i+1); }
  throw new Error(`funcion ${name} incompleta`);
}
const api=new Function(`
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  ${["normaliza","adoptaRuntimeCandidato","adoptaRuntime","viaComunicacion","viaYModeloHtml"].map(functionSource).join("\n")}
  return {adoptaRuntime,viaComunicacion,viaYModeloHtml};
`)();
function fila(){ return {runtime:"",runtimePeso:0,runtimeAt:0,via:"",modelo:""}; }
test("app de escritorio: la vía es el nombre de la app y a la derecha el LLM", ()=>{
  const f=fila(); api.adoptaRuntime(f,"OpenCode","app",1000,true,"Nemotron 3 Ultra");
  assert.equal(api.viaComunicacion(f),"OpenCode");
  assert.equal(api.viaYModeloHtml(f),' <span class="rt">· OpenCode <span class="llm">Nemotron 3 Ultra</span></span>');
});
test("sesión de terminal: la vía es CLI, y el LLM sigue a su derecha", ()=>{
  const f=fila(); api.adoptaRuntime(f,"Claude","cli",1000,true,"Fable 5.1");
  assert.equal(api.viaComunicacion(f),"CLI");
  assert.match(api.viaYModeloHtml(f),/· CLI <span class="llm">Fable 5\.1<\/span>/);
});
test("sin LLM conocido no se inventa: sólo la vía", ()=>{
  const f=fila(); api.adoptaRuntime(f,"Codex","cli",1000,true,"");
  assert.equal(api.viaYModeloHtml(f),' <span class="rt">· CLI</span>');
});
test("la vía y el LLM viajan con la lectura que manda (app viva pesa más que cli apagada)", ()=>{
  const f=fila();
  api.adoptaRuntime(f,"Claude","cli",900,false,"Opus 5");
  api.adoptaRuntime(f,"Claude","app",1000,true,"Fable 5.1");
  assert.equal(api.viaComunicacion(f),"Claude"); assert.equal(f.modelo,"Fable 5.1");
  api.adoptaRuntime(f,"Claude","cli",1100,false,"Opus 5");  // apagada: no manda
  assert.equal(api.viaComunicacion(f),"Claude"); assert.equal(f.modelo,"Fable 5.1");
});
test("la fila del ranking y el podio usan la vía y el LLM", ()=>{
  assert.match(source,/'<td class="ag">' \+ agentNameHtml\(a\) \+ viaYModeloHtml\(a\) \+/);
  assert.match(source,/'<div class="maq">' \+ \(viaComunicacion\(a\)/);
});
