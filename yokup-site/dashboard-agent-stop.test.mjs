import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./dashboard.html",import.meta.url),"utf8");

function functionSource(name){
  const start=source.indexOf(`function ${name}(`);assert.notEqual(start,-1,`falta ${name}`);
  const brace=source.indexOf("{",start);let depth=0,quote="",escaped=false;
  for(let i=brace;i<source.length;i++){
    const char=source[i];
    if(quote){if(escaped)escaped=false;else if(char==="\\")escaped=true;else if(char===quote)quote="";continue;}
    if(char==='"'||char==="'"||char==='`'){quote=char;continue;}
    if(char==="{")depth++;else if(char==="}"&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`función ${name} incompleta`);
}

const {paIsStoppableSurface}=new Function(
  "const AGENT_STOP_FRESH_SECONDS=30;\n"+functionSource("paIsStoppableSurface")+"\nreturn {paIsStoppableSurface};"
)();
const stopRenderApi=new Function(
  "const AGENT_STOP_FRESH_SECONDS=30,PROJECT_STOP_STATES=new Map();let PROJECT_STOP_BUSY='';const esc=value=>String(value);\n"+
  ["paHost","paRuntimeSurface","paStopKey","paIsStoppableSurface","paStoppableSurfaces","paStopControls"].map(functionSource).join("\n")+
  "\nreturn {paStopControls};"
)();

test("la parada sólo se habilita para un process_snapshot exacto, verificado y de 30 segundos",()=>{
  const now=10_000,exact={online:true,verified:true,source:"process_snapshot",updated:9_980,machine:"MacMini",persona:"Oráculo",runtime:"Codex",host:"app",session_id:"session-1",pid:314};
  assert.equal(paIsStoppableSurface(exact,now),true);
  for(const broken of [
    {...exact,online:false},{...exact,verified:false},{...exact,source:"browser"},{...exact,updated:9_969},
    {...exact,host:""},{...exact,session_id:""},{...exact,pid:0},{...exact,persona:""},{...exact,machine:""}
  ])assert.equal(paIsStoppableSurface(broken,now),false);
  assert.match(source,/const AGENT_STOP_FRESH_SECONDS=30/);
  assert.match(source,/source:p\.source\|\|"",session_id:p\.session_id\|\|"",pid:Number\(p\.pid\|\|0\)\|\|0/);
});

test("cada superficie APP o CLI exacta recibe su propia cruz roja en la cabecera del agente",()=>{
  const updated=Date.now()/1000-2,base={online:true,verified:true,source:"process_snapshot",updated,machine:"MacMini",persona:"Oráculo",runtime:"Codex",session_id:"s-app",pid:101};
  const html=stopRenderApi.paStopControls({id:"OraculoMacMini",surfaces:[{...base,host:"app"},{...base,host:"cli",session_id:"s-cli",pid:102}]});
  assert.equal((html.match(/data-pa-stop=/g)||[]).length,2);
  assert.match(html,/× Codex APP/);
  assert.match(html,/× Codex CLI/);
  assert.match(html,/Detener OraculoMacMini · Codex APP en MacMini/);
  assert.match(stopRenderApi.paStopControls({id:"OraculoMacMini",surfaces:[{...base,updated:updated-60}]}),/class="pa-stop" disabled/);
  assert.match(source,/function paStopKey\(row\)/);
  assert.match(source,/row&&row\.session_id,row&&row\.pid/);
  assert.match(source,/const uniqueSlots=list=>\[\.\.\.new Map\(list\.map\(slot=>\[paStopKey\(slot\),slot\]\)\)\.values\(\)\]/);
  assert.match(source,/function paStopControls\(agent\)/);
  assert.match(source,/exact\.map\(slot=>/);
  assert.match(source,/data-pa-stop=/);
  assert.match(source,/>× '\+esc\(label\)\+'<\/button>/);
  assert.match(source,/paStopControls\(agent\)/);
  assert.match(source,/class="pa-stop" disabled aria-label="No se puede detener/);
  assert.match(source,/\.pa-stop\{[^}]*border:1px solid rgba\(255,92,92/);
  assert.match(source,/\.pa-stop:hover,\.pa-stop:focus-visible/);
});

test("la confirmación y el POST protegido identifican la superficie sin inferencias",()=>{
  const stop=functionSource("paStopSurface");
  assert.match(stop,/prompt="Detener "\+family\.id\+" · "\+label\+" en "\+slot\.machine/);
  assert.match(stop,/if\(!confirm\(prompt\)\)return/);
  assert.match(stop,/const body=\{machine:slot\.machine,persona:slot\.persona,runtime:slot\.runtime,host:slot\.host,session_id:slot\.session_id,pid:slot\.pid\}/);
  assert.match(stop,/paJson\("\/fleet\/agent\/stop",\{method:"POST"/);
  assert.match(stop,/PROJECT_STOP_STATES\.set\(surfaceKey,"sending"\)/);
  assert.match(stop,/\^\(queued\|accepted\|running\|stopped\)\$/);
  assert.match(stop,/PROJECT_STOP_STATES\.set\(surfaceKey,"failed"\)/);
  assert.match(stop,/await paLoad\("stop"\)/);
  assert.match(source,/class="pa-stop-status /);
  assert.match(source,/role="status" aria-live="polite"/);
});

test("la cruz de parada no se confunde con las cruces que sólo quitan asociaciones",()=>{
  assert.match(source,/class="pa-mini" data-pa-family-remove=/);
  assert.match(source,/aria-label="Retirar la familia /);
  assert.match(source,/class="pa-stop" data-pa-stop=/);
  assert.match(source,/aria-label="'\+esc\(prompt\)/);
  assert.doesNotMatch(functionSource("paStopSurface"),/projects\/assign|remove:true/);
});

test("cada pareja agente-proyecto conserva una ventana con copy inequívoco",()=>{
  assert.match(source,/assignedProjects\.map\(project=>/);
  assert.match(source,/>⏳ Decidir mejoras · '\+esc\(project\.name\|\|project\.id\)\+'<\/button>/);
  assert.match(source,/aria-label="Decidir mejoras · '\+esc\(project\.name\|\|project\.id\)\+' con '\+esc\(agent\.id\)/);
  assert.match(source,/data-pa-decision="'\+esc\(project\.id\)/);
  assert.match(source,/data-pa-decision-agent="'\+esc\(agent\.id\)/);
  assert.match(source,/paJson\("\/projects\/decision"/);
});
