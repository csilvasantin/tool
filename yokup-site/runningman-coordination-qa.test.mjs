import test from 'node:test';
import assert from 'node:assert/strict';
import clock from './highscore-work-clock.js';
import fs from 'node:fs';
import vm from 'node:vm';
import identity from './yk-agent-identity.js';
import race from './highscore-race.js';
import {installRaceView} from './highscore-race-test-support.mjs';
const html=fs.readFileSync(new URL('./highscore.html',import.meta.url),'utf8');

// Actual mission0970 timings, independently read from D1 after canonical close.
const start=1788594891766,end=1788596144650;

test('0970 final duration is20m52s, never its10:15:44 wall clock; later refresh cannot extend it',()=>{
  for(const elapsed of [0,45000,3600000]){
    const value=clock.clock({state:'last_work',work_started_at:start,ended_at:end,elapsed_ms:end-start},end+60000,elapsed);
    assert.equal(value.label,'00:20:52');assert.equal(value.missionDurationMs,1252884);assert.equal(value.running,false);assert.equal(value.closed,true);
  }
});

test('active clock advances only from server sample while stale clock stays sampled',()=>{
  const row={state:'running',work_started_at:start,ended_at:null,elapsed_ms:60000};
  assert.equal(clock.clock(row,start+60000,2500).missionDurationMs,62500);
  assert.equal(clock.clock({...row,state:'assigned_stale'},start+60000,999999).missionDurationMs,60000);
  assert.equal(clock.clock({state:'running',elapsed_ms:60000},null,999999).missionDurationMs,null);
});

test('unknown start/end/duration do not invent zero or a completion duration',()=>{
  for(const missing of [undefined,null,'']){
    const value=clock.clock({state:'last_work',work_started_at:start,ended_at:missing,elapsed_ms:missing},end,5000);
    assert.equal(value.label,'—');assert.equal(value.missionDurationMs,null);
  }
  assert.equal(clock.clock({state:'last_work',work_started_at:start,ended_at:start-1},end,0).missionDurationMs,null);
});

test('seconds normalize as epochs while elapsed values remain milliseconds',()=>{
  const value=clock.clock({state:'last_work',work_started_at:Math.floor(start/1000),ended_at:Math.floor(end/1000)},end,0);
  assert.equal(value.label,'00:20:53');assert.equal(clock.durationMs(1200),1200);
  assert.equal(clock.label(1200),'00:00:01');
});

function render(work){
  const nodes={refreshLanes:{innerHTML:''},refreshRace:{setAttribute(){},classList:{toggle(){}}}};
  const ctx=vm.createContext({listaCache:[],listaCompletaCache:[],datos:{trabajos:[work],trabajosAvailable:true,trabajosMode:'recent',trabajosGeneratedAt:end+60000,trabajosClientAt:0},document:{getElementById:id=>nodes[id]},normaliza:v=>String(v??'').trim(),esc:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),window:{ykAgentIdentity:identity},YkHighscoreRace:race,YkWorkClock:clock,Number,String,Math,Date,Intl,performance:{now:()=>0}});
  installRaceView(html,ctx);
  const first=html.indexOf('function claveAgenteCarrera('),last=html.indexOf('\n\n  function pintaFormula',first);
  vm.runInContext(html.slice(first,last)+'\nactualizaCarreraPodio();',ctx);return nodes.refreshLanes.innerHTML;
}
const historical={agent:'OraculoMacMini',executor:'InfraOraculoMacMini',family_key:'oraculo@macmini',kind:'mission',title:'Verificación final0970',project_id:'yokup',project_name:'Yokup',state:'last_work',work_started_at:start,ended_at:end,elapsed_ms:end-start};
test('productive renderer shows the actual end clock and retains duration in accessible detail',()=>{
  const result=render(historical);
  assert.match(result,/data-race-time="end"[^>]*>10:15:44<\/strong>/);
  assert.match(result,/title="Duración final · Inicio 09:54:51 · Final 10:15:44"/);
  assert.match(result,/aria-label="Finalizó a las 10:15:44 · Duración 00:20:52"/);
  assert.match(result,/data-race-role="agent"[\s\S]*data-race-role="project"/);
});
test('productive mapping keeps missing end time missing instead of coercing null to midnight',()=>{
  const result=render({...historical,ended_at:null,elapsed_ms:null});
  assert.match(result,/data-race-time="end"[^>]*>—<\/strong>/);
  assert.doesNotMatch(result,/>00:00:00<\//);
});
