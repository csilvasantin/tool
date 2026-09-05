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
function view(initialRows=[stale]){
  const storage=new Map([[race.staleRaceStorageKey('morfeomacmini'),JSON.stringify({revision:stale.race_revision,server_started_at:sampled-42000,cycles:3})]]);
  const nodes={refreshLanes:{innerHTML:''},refreshRace:{setAttribute(){},classList:{toggle(){}}}};
  const ctx=vm.createContext({datos:{trabajos:initialRows,trabajosAvailable:true,trabajosGeneratedAt:sampled,trabajosClientAt:0},
    listaCompletaCache:initialRows.map(w=>({agente:w.agent,total:0,proyecto:w.project_name,proyectoOrigen:"declarado"})),listaCache:[],document:{getElementById:id=>nodes[id]},window:{ykAgentIdentity:identity},
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


// Two-agent fixture exercises the unchanged public contract. Neo's initial
// fields are factual; Trinity's future bound row is a test fixture, not a claim
// that its emitter has registered real production work.
const dualAt=1788601544980;
const neo={agent:'NeoMBP14',executor:'SubNeoMBP14',family_key:'neo@mbp14',machine:'MBP14',kind:'task',
  reference:'DCL-f57e68d410b06c04e758e7bc:a',title:'Hero y posicionamiento XpaceOS',project_id:'xpaceos',project_name:'XpaceOS',
  state:'assigned_stale',activity_reason:'session_unverified',reachable:true,race_revision:'r1:1y15afp',
  work_started_at:1788601475881,work_progress_at:1788601475881,ended_at:null,elapsed_ms:69099};
const trinity={...neo,agent:'TrinityMBP14',executor:'SubTrinityMBP14',family_key:'trinity@mbp14',
  reference:'FIXTURE-TRINITY:a',title:'Fixture de verificación de contrato APP',project_id:'yokup',project_name:'Yokup',
  race_revision:'fixture-trinity-r1',work_started_at:dualAt-120000,work_progress_at:dualAt-120000,elapsed_ms:120000};
function appWork(row,runtime){return {...row,state:'running',activity_reason:'',session_surface:'app',session_state:'open',
  dedicated_basis:'process_birth',runtime,activity_at:dualAt,activity_kind:'implementation',activity_basis:'explicit_bound_progress'};}

test('dual MBP14 polling recovers exactly Neo and Trinity, preserving each project, start clock and APP hover',async()=>{
  const {ctx,render}=view([neo,trinity]);
  const initial=render([neo],dualAt);
  assert.doesNotMatch(initial,/data-work-state="running"/);
  assert.doesNotMatch(initial,/data-agent-key="trinitymbp14"/,'an open app observation is not a work lane');
  const fresh=[appWork(neo,'Claude'),appWork(trinity,'Codex')];
  const requests=[];
  Object.assign(ctx,{workRequest:null,workRequestSequence:0,WORK_TIMEOUT_MS:8000,YK:'https://fixture.invalid',
    AbortController,setTimeout,clearTimeout,fetch:(_url,options)=>new Promise(resolve=>requests.push({resolve,options})),
    hsPaintWorkUpdate:()=>ctx.actualizaCarreraPodio()});
  ctx.document.hidden=false;
  const first=ctx.hsPollWork();assert.equal(ctx.hsPollWork(),first,'overlapping light refresh coalesces');
  requests[0].resolve({ok:true,json:async()=>({ok:true,participants:[neo,...fresh,fresh[1]],generated_at:dualAt})});
  await first;
  const works=ctx.trabajosCarrera();
  assert.equal(works.length,2);assert.ok(works.every(w=>w.state==='running'&&w.sessionSurface==='app'));
  for(const [row,name,project,duration] of [[fresh[0],'Neo','XpaceOS','00:01:09'],[fresh[1],'Trinity','Yokup','00:02:00']]){
    const result=render([row],dualAt);
    assert.equal((result.match(new RegExp('data-agent-key="'+name.toLowerCase()+'mbp14"','g'))||[]).length,1);
    assert.match(result,new RegExp('data-race-role="agent"[^>]*>'+name+'<'));
    assert.match(result,new RegExp('data-race-role="project"[^>]*>\\/\\/ '+project+'<'));
    assert.match(result,/MBP14 · APP/);
    assert.match(result,new RegExp('data-race-time="duration"[^>]*>'+duration+'<'));
    assert.equal(ctx.trabajosEnCurso()[0].startedAt,row.work_started_at);
  }
  const again=render(fresh,dualAt+20000);
  assert.equal((again.match(/data-agent-key=/g)||[]).length,2);
  assert.match(again,/>00:01:29</);assert.match(again,/>00:02:20</);
});

test('dual APP expiration or absence removes active status; CLI and another machine cannot fill the missing bound session',()=>{
  const {ctx,render}=view([neo,trinity]);
  const fresh=[appWork(neo,'Claude'),appWork(trinity,'Codex')];
  assert.equal((render(fresh,dualAt).match(/data-work-state="running"/g)||[]).length,4,'lane and clock for both');
  const expired=fresh.map(row=>({...row,state:'assigned_stale',activity_reason:'',activity_at:dualAt}));
  const result=render(expired,dualAt+120001);
  assert.doesNotMatch(result,/data-work-state="running"/);
  assert.ok(ctx.trabajosEnCurso().every(w=>w.state==='assigned_stale'));
  const missing=render([],dualAt+140000);assert.doesNotMatch(missing,/data-agent-key=/);
  const wrongSurface=render([{...fresh[0],session_surface:'cli'},{...fresh[1],session_surface:'',session_state:'unknown'}],dualAt+140000);
  assert.doesNotMatch(wrongSurface,/data-work-state="running"/);
  assert.equal((wrongSurface.match(/data-race-held="true"/g)||[]).length,2);
  const foreign=render([{...fresh[0],agent:'NeoMacMini',machine:'MacMini',family_key:'neo@macmini'}],dualAt);
  assert.doesNotMatch(foreign,/data-agent-key="neombp14"/);
});

function sessionWork(row,runtime){return {...appWork(row,runtime),kind:'session',reference:'',title:'Actividad Desktop APP',
  session_basis:'verified_app_turn',dedicated_basis:'',activity_expires_at:dualAt+30000,
  activity_basis:runtime==='Claude'?'claude_desktop_transcript':'codex_desktop_turn_store'};}
test('verified Desktop-only turns show two neutral rows and zero synthetic score metrics without work references',()=>{
 const {ctx,render}=view([neo,trinity]);
 const sessions=[sessionWork(neo,'Claude'),sessionWork(trinity,'Codex')];
 const result=render(sessions,dualAt);
 assert.equal((result.match(/data-agent-key=/g)||[]).length,2);
 assert.match(result,/>Neo</);assert.match(result,/>Trinity</);
 assert.equal((result.match(/>Descripción del trabajo pendiente<\/span>/g)||[]).length,2);
 assert.match(result,/MBP14 · APP/);assert.match(result,/>\/\/ XpaceOS</);assert.match(result,/>\/\/ Yokup</);
 assert.ok(ctx.trabajosCarrera().every(w=>w.reference===''&&w.kind==='session'));
 assert.ok(ctx.listaCompletaCache.every(row=>row.total===0));
 const metric=html.slice(html.indexOf('function numeroActividad('),html.indexOf('\n\n  function metricaRankingHtml'));
 vm.runInContext(metric,ctx);
 for(const type of ['objetivos','misiones','tareas','ventanas'])assert.equal(ctx.numeroActividad({workState:'running',workKind:'session'},type,8,type),8);
});
test('linked mission wins over a Desktop-only turn, independent of order, while ended/expired sessions have no stale tail',()=>{
 const {ctx,render}=view([neo,trinity]);const session=sessionWork(neo,'Claude'),mission={...appWork(neo,'Claude'),state:'assigned_stale'};
 for(const rows of [[session,mission],[mission,session]]){render(rows,dualAt);assert.equal(ctx.trabajosCarrera().length,1);assert.equal(ctx.trabajosCarrera()[0].kind,'task');assert.equal(ctx.trabajosCarrera()[0].reference,neo.reference);}
 for(const patch of [{state:'last_work',ended_at:dualAt},{state:'assigned_stale'},{activity_expires_at:dualAt},{session_surface:'cli'},{activity_basis:'heartbeat'},{session_basis:''}])assert.doesNotMatch(render([{...session,...patch}],dualAt),/data-agent-key=/);
 render([session],dualAt);ctx.performance.now=()=>30200;
 assert.equal(ctx.trabajosCarrera().length,0,'client clock also expires the turn while waiting for next poll');
});

test('client clock removes an expired standalone turn and stops a linked mission without losing its record',()=>{
 const {ctx,render}=view([neo,trinity]);
 const session=sessionWork(neo,'Claude'),linked={...appWork(trinity,'Codex'),activity_basis:'verified_app_turn',activity_expires_at:dualAt+30000};
 render([session,linked],dualAt);
 ctx.performance.now=()=>30200;
 let paints=0;ctx.hsPaintWorkUpdate=()=>{paints++;};ctx.document.querySelectorAll=()=>[];
 ctx.actualizaRelojesCarrera();
 assert.equal(paints,1);assert.equal(ctx.datos.trabajos.length,1);
 assert.equal(ctx.datos.trabajos[0].reference,trinity.reference);assert.equal(ctx.datos.trabajos[0].state,'assigned_stale');
 assert.equal(ctx.datos.trabajos[0].work_started_at,trinity.work_started_at);
 ctx.actualizaRelojesCarrera();assert.equal(paints,1,'expiry does not loop or revive a finished turn');
});

test('GrokBot service task runs with real description and expires without becoming Desktop or reviving a closed task',()=>{
 const service={...neo,agent:'LucasGrokBot',executor:'LucasGrokBot',machine:'GrokBot',family_key:'lucas@grokbot',
  reference:'GROK:b',title:'Página drag-and-drop',state:'running',host:'app',runtime:'Grok',service_surface:'app',
  activity_basis:'grokbot_task_progress',activity_at:dualAt-60000,service_observed_at:dualAt,activity_expires_at:dualAt+120000};
 const {ctx,render}=view([service]);const output=render([service],dualAt);
 assert.match(output,/data-work-state="running"/);assert.match(output,/GrokBot · APP/);assert.match(output,/>Página drag-and-drop</);
 assert.equal(ctx.trabajosCarrera()[0].sessionSurface,'');assert.equal(ctx.trabajosCarrera()[0].reference,'GROK:b');
 for(const patch of [{machine:'MacMini',agent:'LucasMacMini',family_key:'lucas@macmini'},{host:'cli'},{runtime:'Codex'},{ended_at:dualAt},{activity_expires_at:dualAt},{service_observed_at:dualAt-120001},{activity_expires_at:dualAt+120001}])assert.doesNotMatch(render([{...service,...patch}],dualAt),/data-work-state="running"/);
 render([service],dualAt);ctx.performance.now=()=>120200;ctx.document.querySelectorAll=()=>[];let paints=0;ctx.hsPaintWorkUpdate=()=>paints++;
 ctx.actualizaRelojesCarrera();assert.equal(paints,1);assert.equal(ctx.datos.trabajos[0].state,'assigned_stale');
});
