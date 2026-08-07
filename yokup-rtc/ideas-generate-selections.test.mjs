import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./src/index.js",import.meta.url),"utf8");

function functionSource(name){
  const asyncStart=source.indexOf(`async function ${name}(`);
  const start=asyncStart >= 0 ? asyncStart : source.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`falta ${name}`);
  const brace=source.indexOf("{",start);
  let depth=0,quote="",escaped=false;
  for(let i=brace;i<source.length;i++){
    const c=source[i];
    if(quote){if(escaped)escaped=false;else if(c==="\\")escaped=true;else if(c===quote)quote="";continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==="{")depth++; else if(c==="}"&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`${name} incompleta`);
}

const seats=new Set(["ceo","cto","coo","cfo","cco","cdo","cxo","cso"]);
const order=[...seats];
const types=new Set(["producto","flota","ia","diseño","negocio","proceso","meta"]);
const projects=[{id:"admiranext",name:"AdmiraNeXT",web:"https://www.admiranext.com"}];
const projectIndex=async()=>({rows:projects,get:value=>projects.find(p=>p.id===String(value).trim().toLowerCase())||null});

const resolveSelections=new Function("IDEA_SEATS","IDEA_TYPES","COUNCIL_ORDER","projectIndex",
  `${functionSource("resolveGenerateSelections")}; return resolveGenerateSelections;`)(seats,types,order,projectIndex);

test("las tres selecciones explícitas se conservan y canonizan por censo",async()=>{
  assert.deepEqual(await resolveSelections({}, {project_id:"admiranext",seat:"cfo",tag:"negocio"},()=>0.99),
    {ok:true,seat:"cfo",tag:"negocio",project:"admiranext"});
});

test("un valor explícito inválido falla; sólo vacío activa fallback",async()=>{
  assert.equal((await resolveSelections({}, {seat:"inventado",project_id:"admiranext",tag:"negocio"},()=>0)).code,"invalid_seat");
  assert.equal((await resolveSelections({}, {seat:"cfo",project_id:"no-existe",tag:"negocio"},()=>0)).code,"invalid_project_id");
  assert.equal((await resolveSelections({}, {seat:"cfo",project_id:"admiranext",tag:"decoración"},()=>0)).code,"invalid_tag");
  assert.deepEqual(await resolveSelections({}, {seat:"",project_id:"",tag:""},()=>0),
    {ok:true,seat:"ceo",tag:"",project:""});
});

const council={
  cfo:{role:"CFO",alias:"Warren Buffett",fuerte:"el negocio y el coste a largo plazo"},
  cdo:{role:"CDO",alias:"Dieter Rams",fuerte:"el diseño: menos, pero mejor"}
};
const criteria={
  negocio:"explica valor, coste, retorno y una métrica económica comprobable",
  "diseño":"prioriza jerarquía visual, usabilidad, accesibilidad y coherencia estética"
};
const prompts=[];
const aiRunRaw=async(_env,prompt)=>{prompts.push(prompt);return {titulo:`Objetivo ${prompts.length}`,cuerpo:"Detalle comprobable"};};
const ensureIdeasSchema=async()=>{};
const parseIdeaJSON=raw=>({title:raw.titulo,body:raw.cuerpo});
const ideaTypeCriteria=tag=>criteria[tag]||"criterio genérico";
// El conocimiento extra de la silla (pixeria) entra en el prompt; aquí se inyecta
// vacío para que este test siga midiendo SOLO rol, tipo y proyecto.
const seatKnowledge=async()=>[];
const seatKnowledgeText=()=>"";
const generate=new Function("IDEA_SEATS","IDEA_TYPES","COUNCIL","ensureIdeasSchema","projectIndex","ideaTypeCriteria","aiRunRaw","parseIdeaJSON","crypto","generateCouncilReview","seatKnowledge","seatKnowledgeText",
  `${functionSource("generateCouncilIdea")}; return generateCouncilIdea;`)(
    seats,types,council,ensureIdeasSchema,projectIndex,ideaTypeCriteria,aiRunRaw,parseIdeaJSON,globalThis.crypto,async()=>null,seatKnowledge,seatKnowledgeText);
const env={DB:{prepare:()=>({all:async()=>({results:[]})})}};

test("mismo proyecto produce perspectivas y criterios distintos por rol y tipo",async()=>{
  const negocio=await generate(env,"cfo","","admiranext",false,"negocio");
  const diseno=await generate(env,"cdo","","admiranext",false,"diseño");
  assert.deepEqual({seat:negocio.seat,tag:negocio.tag,project:negocio.project,project_id:negocio.project_id},
    {seat:"cfo",tag:"negocio",project:"admiranext",project_id:"admiranext"});
  assert.deepEqual({seat:diseno.seat,tag:diseno.tag,project:diseno.project,project_id:diseno.project_id},
    {seat:"cdo",tag:"diseño",project:"admiranext",project_id:"admiranext"});
  assert.match(prompts[0],/Eres CFO[\s\S]*PROYECTO OBLIGATORIO:[\s\S]*TIPO OBLIGATORIO: «negocio»[\s\S]*valor, coste, retorno/);
  assert.match(prompts[1],/Eres CDO[\s\S]*PROYECTO OBLIGATORIO:[\s\S]*TIPO OBLIGATORIO: «diseño»[\s\S]*jerarquía visual, usabilidad/);
  assert.notEqual(prompts[0],prompts[1]);
});

test("la ruta usa el payload validado y devuelve la selección en la idea",()=>{
  const route=source.slice(source.indexOf('url.pathname === "/ideas/generate"'),source.indexOf("// ── RELOJES DE DECISIÓN"));
  assert.match(route,/resolveGenerateSelections\(env, b\)/);
  assert.match(route,/generateCouncilIdea\(env, seat, topic, projectHint, !preview, tagHint\)/);
  assert.match(functionSource("generateCouncilIdea"),/tag: outputTag[\s\S]*project_id: projSlug/);
});
