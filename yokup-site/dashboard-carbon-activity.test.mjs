// FLT-1596 · «en qué está» cada agente de carbono junto a su nombre (MCP Yarigai).
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

function build(state){
  return new Function("CARBON_ACTIVITY","esc",`${functionSource("paCarbonNowMarkup")}
return paCarbonNowMarkup;`)(state,(v)=>String(v).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])));
}

test("el dashboard consulta api.yokup.com/carbon/activity al cargar y cada minuto",()=>{
  assert.match(source,/CARBON_ACTIVITY_PATH="\/carbon\/activity"/);assert.match(source,/fetch\(PROJECTS_API\+CARBON_ACTIVITY_PATH,\{cache:"no-store"\}\)/);
  assert.match(source,/CARBON_ACTIVITY_EVERY_MS=60\*1000/);
  assert.match(source,/setInterval\(paCarbonActivityRefresh,CARBON_ACTIVITY_EVERY_MS\)/);
  assert.match(source,/function paLoad\([^)]*\)\s*\{paCarbonActivityRefresh\(\);/);
});

test("la actividad se pinta junto al nombre del responsable, no en otra columna",()=>{
  assert.match(source,/<b>'\+esc\(agent\.name\)\+'<\/b>'\+paCarbonNowMarkup\(agent\.key\)\+'<span>Responsable Carbono/);
});

test("con tarea en curso: «en: …» con hora y oficina en el title",()=>{
  const people=new Map([["carlos3.0",{name:"Carlos3.0",now:{task:"conectar yarig.ai con el player de la taza",office:"Carlos está fichado en Madrid"},checked_at:Date.UTC(2026,8,4,9,30),error:""}]]);
  const html=build({loaded:true,token_configured:true,people})("carlos3.0");
  assert.match(html,/class="pa-carbon-now" data-carbon-now="carlos3\.0"/);
  assert.match(html,/>en: conectar yarig\.ai con el player de la taza</);
  assert.match(html,/title="En Yarigai desde las \d\d:\d\d · Carlos está fichado en Madrid"/);
});

test("sin tarea, sin token o sin mapeo: tres estados honestos y nunca una tarea inventada",()=>{
  const idle=build({loaded:true,token_configured:true,people:new Map([["carlos3.0",{now:{task:"",office:""},checked_at:1,error:""}]])})("carlos3.0");
  assert.match(idle,/is-idle/);assert.match(idle,/>sin tarea en curso</);
  const noToken=build({loaded:true,token_configured:false,people:new Map([["carlos3.0",{now:null,error:"sin token"}]])})("carlos3.0");
  assert.match(noToken,/is-empty/);assert.match(noToken,/>sin datos</);assert.match(noToken,/title="sin token"/);
  const unmapped=build({loaded:true,token_configured:true,people:new Map([["moises3.0",{now:null,error:"sin mapeo a Yarigai"}]])})("moises3.0");
  assert.match(unmapped,/title="sin mapeo a Yarigai"/);
  const rejected=build({loaded:true,token_configured:true,people:new Map([["carlos3.0",{now:{task:"",office:""},error:"token"}]])})("carlos3.0");
  assert.match(rejected,/rechazó el token/);
  const loading=build({loaded:false,token_configured:false,people:new Map()})("carlos3.0");
  assert.match(loading,/Consultando Yarigai/);
  for(const html of [idle,noToken,unmapped,rejected,loading])assert.doesNotMatch(html,/>en: /);
});

test("el texto de Yarigai se escapa antes de entrar en el DOM",()=>{
  const html=build({loaded:true,token_configured:true,people:new Map([["x",{now:{task:"<img src=x onerror=1>",office:""},checked_at:1,error:""}]])})("x");
  assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);
});
