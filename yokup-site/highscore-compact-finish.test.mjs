import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html=fs.readFileSync(new URL("./highscore.html",import.meta.url),"utf8");
const identitySource=fs.readFileSync(new URL("./yk-agent-identity.js",import.meta.url),"utf8");
const identitySandbox={};
vm.runInNewContext(identitySource,identitySandbox);
const raceHelperSource=fs.readFileSync(new URL("./highscore-race.js",import.meta.url),"utf8");
const raceHelperSandbox={module:{exports:{}},exports:{}};
vm.runInNewContext(raceHelperSource,raceHelperSandbox);
const start=html.indexOf("function claveAgenteCarrera(");
const end=html.indexOf("\n\n  function pintaFormula",start);
const raceSource=html.slice(start,end);

function render(agent,state,endedAt){
  const nodes={
    refreshLanes:{innerHTML:""},
    refreshRace:{attrs:{},setAttribute(name,value){this.attrs[name]=String(value)},
      classList:{toggle(){}}},
  };
  const work={family_key:agent.toLowerCase(),agent,executor:agent,kind:"mission",title:"Última misión factual",
    assignment_at:Date.parse("2026-09-01T12:00:00Z"),work_started_at:Date.parse("2026-09-01T12:30:00Z"),
    work_progress_at:Date.parse("2026-09-01T13:00:00Z"),ended_at:endedAt,state,
    session_state:"closed",session_dedicated_ms:15*60_000};
  const context=vm.createContext({
    listaCache:[],listaCompletaCache:[],
    datos:{trabajos:[work],trabajosAvailable:true,trabajosMode:state==="last_work"?"recent":"active",
      trabajosGeneratedAt:Date.parse("2026-09-01T13:10:00Z"),trabajosClientAt:0},
    document:{getElementById:id=>nodes[id]},normaliza:value=>String(value==null?"":value).trim(),
    esc:value=>String(value==null?"":value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;"),
    window:{ykAgentIdentity:identitySandbox.ykAgentIdentity},YkHighscoreRace:raceHelperSandbox.module.exports,
    Number,String,Math,Date,Intl,performance:{now:()=>0},
  });
  vm.runInContext(`${raceSource}\nactualizaCarreraPodio();`,context);
  return nodes.refreshLanes.innerHTML;
}

test("el nombre visible pierde el apellido de máquina y el hover/foco conservan el dato",()=>{
  const rendered=render("NiobeMacMini","last_work",Date.parse("2026-09-01T13:04:05Z"));
  assert.match(rendered,/class="refresh-agent"[^>]*tabindex="0"[^>]*title="MacMini"[^>]*aria-label="Niobe · máquina MacMini">Niobe<\/span>/);
  assert.doesNotMatch(rendered,/>NiobeMacMini<\/span>/);
  assert.match(html,/\.refresh-agent:focus-visible\{[^}]*outline:/);

  const mbp=render("NeoMBP14","running",0);
  assert.match(mbp,/title="MBP14"[^>]*aria-label="Neo · máquina MBP14">Neo<\/span>/);
});

test("la cabecera izquierda ordena agente, inicio factual y fin factual en hora Madrid",()=>{
  const ended=Date.parse("2026-09-01T13:04:05Z");
  const rendered=render("NiobeMacMini","last_work",ended);
  assert.match(rendered,/class="refresh-agent"[^>]*>Niobe<\/span>/);
  assert.match(rendered,/class="refresh-started" data-race-time="start"[^>]*>14:30:00<\/time>/);
  assert.match(rendered,new RegExp(`<time class="refresh-ended" data-race-time="end" datetime="${new Date(ended).toISOString()}"[^>]*>15:04:05<\\/time>`));
  assert.ok(rendered.indexOf('class="refresh-agent"') < rendered.indexOf('data-race-time="start"'));
  assert.ok(rendered.indexOf('data-race-time="start"') < rendered.indexOf('data-race-time="end"'));
  assert.doesNotMatch(rendered,/>FINALIZADO<|>EN CURSO</);
  assert.match(rendered,/aria-label="Responsable Niobe\. Hora de inicio 14:30:00\. Hora de finalización 15:04:05/);
});

test("sin ended_at no inventa hora y el activo usa el hueco final como contador",()=>{
  const missing=render("TrinityMBP14","last_work",0);
  assert.match(missing,/class="refresh-ended" data-race-time="end" title="Hora de finalización no disponible">—<\/span>/);
  assert.doesNotMatch(missing,/class="refresh-ended" datetime=/);

  const running=render("NeoMBP14","running",0);
  assert.doesNotMatch(running,/>EN CURSO<|>FINALIZADO</);
  assert.match(running,/class="refresh-ended refresh-elapsed" data-race-time="elapsed" data-work-state="running"[^>]*>00:40:00<\/strong>/);
  assert.doesNotMatch(running,/data-race-time="end"/);
});

test("el layout gana pista al integrar contador y hora final junto al agente",()=>{
  assert.match(html,/grid-template-columns:minmax\(220px,300px\) minmax\(0,1fr\)/);
  assert.doesNotMatch(html,/class="refresh-time"|class="refresh-work-state"/);
  assert.match(html,/@media \(max-width:620px\)[\s\S]*\.refresh-agent-meta\{[^}]*flex-wrap:wrap/);
  assert.match(html,/@media \(max-width:620px\)[\s\S]*\.refresh-started,\.refresh-ended\{font-size:7px/);
  assert.match(html,/@media \(max-width:340px\)\{\.refresh-lane\{grid-template-columns:minmax\(146px,168px\) minmax\(54px,1fr\)/);
});
