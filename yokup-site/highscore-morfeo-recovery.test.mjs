import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import identity from './yk-agent-identity.js';
import race from './highscore-race.js';
import clock from './highscore-work-clock.js';
import {installRaceView} from './highscore-race-test-support.mjs';
const html=fs.readFileSync(new URL('./highscore.html',import.meta.url),'utf8');
// Factual public FLT-1827 fields captured during the 0675 regression.
const sampled=1788600397956;
const stale={agent:'MorfeoMacMini',executor:'MorfeoMacMini',family_key:'morfeo@macmini',machine:'MacMini',
  reference:'FLT-1827',kind:'mission',title:'Control remoto de admira.live',state:'assigned_stale',reachable:true,
  project_id:'admira-live',project_name:'Admira Live · Consejo',race_revision:'r1:1xtnz3v',
  work_started_at:1788596199778,work_progress_at:1788597432261,ended_at:null,elapsed_ms:4198178};
function view(){
  const storage=new Map([[race.staleRaceStorageKey('morfeomacmini'),JSON.stringify({revision:stale.race_revision,server_started_at:sampled-42000,cycles:3})]]);
  const nodes={refreshLanes:{innerHTML:''},refreshRace:{setAttribute(){},classList:{toggle(){}}}};
  const ctx=vm.createContext({datos:{trabajos:[stale],trabajosAvailable:true,trabajosGeneratedAt:sampled,trabajosClientAt:0},
    listaCompletaCache:[],listaCache:[],document:{getElementById:id=>nodes[id]},window:{ykAgentIdentity:identity},
    normaliza:v=>String(v??'').trim(),esc:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    performance:{now:()=>100},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    YkHighscoreRace:race,YkWorkClock:clock,Number,String,Math,Date,Intl});
  installRaceView(html,ctx);
  const start=html.indexOf('function claveAgenteCarrera('),end=html.indexOf('\n\n  function pintaFormula',start);
  vm.runInContext(html.slice(start,end),ctx);
  const render=(participants,at=sampled)=>{ctx.hsApplyWorkSnapshot({ok:true,participants,generated_at:at,mode:'active'});ctx.actualizaCarreraPodio();return nodes.refreshLanes.innerHTML;};
  return {ctx,render,storage};
}
const bound={...stale,state:'running',session_surface:'app',session_state:'open',dedicated_basis:'process_birth',session_dedicated_ms:60000,
  activity_at:sampled,activity_kind:'implementation',activity_basis:'explicit_bound_progress'};

test('Morfeo expired stale lane recovers on a bound APP snapshot without resetting time or duplicating identity',()=>{
  const {ctx,render,storage}=view();
  assert.doesNotMatch(render([stale]),/data-agent-key="morfeomacmini"/);
  const before=storage.get(race.staleRaceStorageKey('morfeomacmini'));
  const result=render([stale,bound]);
  assert.equal((result.match(/data-agent-key="morfeomacmini"/g)||[]).length,1);
  assert.match(result,/data-work-state="running"/);
  assert.match(result,/data-race-role="agent"[^>]*>Morfeo<\//);
  assert.match(result,/data-race-role="project"[^>]*>\/\/ Admira Live · Consejo<\//);
  assert.match(result,/MacMini · APP/);
  assert.match(result,/data-race-time="duration"[^>]*>01:09:58<\//);
  assert.equal(ctx.trabajosEnCurso()[0].startedAt,stale.work_started_at);
  assert.equal(ctx.trabajosEnCurso()[0].raceRevision,stale.race_revision);
  assert.equal(storage.get(race.staleRaceStorageKey('morfeomacmini')),before,'activity does not reset stale history');
  assert.equal((render([bound,bound],sampled+20000).match(/data-agent-key="morfeomacmini"/g)||[]).length,1);
});

test('reachability and activity text cannot resurrect an expired lane or manufacture an APP binding',()=>{
  const {render}=view();
  assert.doesNotMatch(render([{...stale,activity_at:sampled,activity_kind:'implementation',activity_text:'Working'}]),/data-agent-key="morfeomacmini"/);
  const unbound=render([{...stale,state:'running'}]);
  assert.match(unbound,/data-race-held="true"/);
  assert.match(unbound,/Trabajo registrado · sesión sin vincular/i);
  assert.doesNotMatch(unbound,/data-work-state="running"/);
  const cli=render([{...bound,session_surface:'cli'}]);
  assert.match(cli,/CLI pausado por Carlos/i);assert.match(cli,/data-race-held="true"/);
  assert.doesNotMatch(cli,/data-work-state="running"/);
});

test('a later expired or failed source cannot retain a previously running Morfeo lane',()=>{
  const {ctx,render}=view();
  assert.match(render([bound]),/data-work-state="running"/);
  assert.doesNotMatch(render([stale],sampled+120001),/data-agent-key="morfeomacmini"/);
  ctx.hsApplyWorkSnapshot(null);ctx.actualizaCarreraPodio();
  assert.equal(ctx.datos.trabajosAvailable,false);assert.equal(ctx.trabajosCarrera().length,0);
});
