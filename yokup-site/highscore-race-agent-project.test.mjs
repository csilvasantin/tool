import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {installRaceView} from "./highscore-race-test-support.mjs";

const html=fs.readFileSync(new URL("./highscore.html",import.meta.url),"utf8");
const identitySource=fs.readFileSync(new URL("./yk-agent-identity.js",import.meta.url),"utf8");
const identitySandbox={};
vm.runInNewContext(identitySource,identitySandbox);
const helperSource=fs.readFileSync(new URL("./highscore-race.js",import.meta.url),"utf8");
const helperSandbox={module:{exports:{}},exports:{}};
vm.runInNewContext(helperSource,helperSandbox);
const start=html.indexOf("function claveAgenteCarrera(");
const end=html.indexOf("\n\n  function pintaFormula",start);
const raceSource=html.slice(start,end);

function render({agent="MorfeoMacMini",principal="admira.live/control",workProject="Yokup"}={}){
  const nodes={refreshLanes:{innerHTML:""},refreshRace:{setAttribute(){},classList:{toggle(){}}}};
  const started=Date.parse("2026-09-01T16:22:34Z");
  const work={family_key:agent.toLowerCase(),agent,executor:agent,kind:"mission",title:"Faena puntual",
    project_id:"yokup",project_name:workProject,detail_url:"/highscoreDetail?agent=MorfeoMacMini",
    work_started_at:started,work_progress_at:started+60_000,
    elapsed_ms:60_000,state:"running",session_dedicated_ms:null};
  const row={agente:agent,proyecto:principal,posicion:1,total:0,vivo:true,maquinas:[],maquinasVivas:[]};
  const context=vm.createContext({
    listaCache:[row],listaCompletaCache:[row],
    datos:{trabajos:[work],trabajosAvailable:true,trabajosMode:"active",trabajosGeneratedAt:started+60_000,trabajosClientAt:0},
    document:{getElementById:id=>nodes[id]},normaliza:v=>String(v==null?"":v).trim(),
    esc:v=>String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;"),
    window:{ykAgentIdentity:identitySandbox.ykAgentIdentity},YkHighscoreRace:helperSandbox.module.exports,
    Number,String,Math,Date,Intl,performance:{now:()=>0},
  });
  installRaceView(html, context);
  vm.runInContext(`${raceSource}\nactualizaCarreraPodio();`,context);
  return nodes.refreshLanes.innerHTML;
}

test("el bloque izquierdo muestra agente // proyecto responsable canónico",()=>{
  const rendered=render();
  assert.match(rendered,/data-race-role="agent"[^>]*>MorfeoMacMini<\/span><span class="refresh-agent-machine">MacMini<\/span><span class="refresh-agent-project" data-race-role="project"[^>]*>\/\/ admira\.live\/control<\/span>/);
  assert.match(rendered,/Proyecto responsable admira\.live\/control\. Hora de inicio/);
  assert.match(rendered,/class="refresh-mission-title">Faena puntual · Yokup<\/span>/,
    "la faena puntual conserva su propio proyecto dentro de la pista");
  assert.doesNotMatch(rendered,/\/\/ MacMini/);
});

test("fila.proyecto gana al proyecto puntual y la ausencia queda explícita",()=>{
  assert.match(render(),/>\/\/ admira\.live\/control<\/span>/);
  assert.match(render({principal:"",workProject:"Yokup"}),/>\/\/ Yokup<\/span>/);
  assert.match(render({principal:"",workProject:""}),/>\/\/ —<\/span>/);
});

test("proyecto y hora de inicio comparten color y el texto puede truncarse",()=>{
  assert.match(html,/\.refresh-agent-project\{[^}]*overflow:hidden[^}]*text-overflow:ellipsis[^}]*white-space:nowrap[^}]*color:var\(--ink\)[^}]*font-size:9px/);
  assert.match(html,/\.refresh-started,\.refresh-ended\{[^}]*color:var\(--ink\)[^}]*font-size:9px/);
  assert.match(html,/@media \(max-width:620px\)[\s\S]*\.refresh-agent-project\{font-size:7px/);
  assert.match(html,/@media \(max-width:340px\)[\s\S]*\.refresh-agent-project\{font-size:6\.5px/);
});

test("la nueva etiqueta no altera las tres columnas ni la pista",()=>{
  const rendered=render();
  const agent=rendered.indexOf('class="refresh-agent-meta"');
  const track=rendered.indexOf('class="refresh-lane-center"');
  const timing=rendered.indexOf('class="refresh-timing"');
  assert.ok(agent>=0 && track>agent && timing>track);
  assert.match(rendered,/class="refresh-track">[\s\S]*data-race-role="mission"[\s\S]*data-race-role="runner"/);
  assert.match(rendered,/class="refresh-timing"[\s\S]*data-race-time="start"[\s\S]*data-race-time="elapsed"/);
});
