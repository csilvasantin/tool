import {automationAllowed,automationFenceSql} from './src/fleet-automation-control.js';
import {assignedWorkBlockers} from './src/automatic-work-priority.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {ensureHourlyModeSchema,saveAgentMode,runHourlyModes,hourlySlot,modeTargetKey,normalizeModeTarget,validateTrainingProposals} from './src/fleet-hourly-modes.js';

const HOUR=3600000, now=Date.UTC(2026,8,5,10,0), target={persona:'Morfeo',machine:'MacMini',runtime:'Claude',host:'app'};
function database() {
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT); INSERT INTO projects VALUES (\'yokup\',\'Yokup\');');
  return {raw:db,exec:async sql=>db.exec(sql),prepare(sql){return {bind(...args){return {run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}}),first:async()=>db.prepare(sql).get(...args) || null,all:async()=>({results:db.prepare(sql).all(...args)})};},all:async()=>({results:db.prepare(sql).all()}),run:async()=>({meta:{changes:Number(db.prepare(sql).run().changes)}}),first:async()=>db.prepare(sql).get() || null};}};
}
function telemetry(at=now) { return {control_machines:[{machine:'MacMini',updated:at/1000,human_idle_seconds:600,human_sampled_at:at/1000,capabilities:['desktop_write','hourly_modes','hourly_desktop_claude'],slots:[{...target,session_id:'desktop:claude'}]}],presence:[{...target,session_id:'desktop:claude',pid:321,source:'process_snapshot',verified:true,updated:at/1000}]}; }
const projectFor=async()=>({id:'yokup',name:'Yokup',web:'https://yokup.com'});
async function setup() { const env={DB:database()};await saveAgentMode(env,{...target,mode:'learning'},'carlos@example.test',projectFor,now-HOUR/2);return env; }

test('persistencia exacta y una única ejecución ante dos ticks concurrentes; no catchup al reconectar',async()=>{
  const env=await setup();let calls=0;
  const adapters={projectFor,readTelemetry:async()=>telemetry(now),activityFor:async()=>({busy:false}),execute:async()=>{calls++;return {status:'dispatched',reason:'awaiting_consumer',command_id:'1'};}};
  await Promise.all([runHourlyModes(env,adapters,now),runHourlyModes(env,adapters,now)]);
  assert.equal(calls,1);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM fleet_agent_mode_runs').get().n,1);
  env.DB.raw.exec("UPDATE fleet_agent_mode_runs SET status='completed'");
  await runHourlyModes(env,{...adapters,readTelemetry:async()=>telemetry(now+5*HOUR)},now+5*HOUR);
  assert.equal(calls,2);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM fleet_agent_mode_runs').get().n,2);
});

test('Manual durante una comprobación impide el despacho del snapshot de preferencias anterior',async()=>{
  const env=await setup();let calls=0;
  await runHourlyModes(env,{projectFor,readTelemetry:async()=>telemetry(),activityFor:async()=>{
    await saveAgentMode(env,{...target,mode:'manual'},'carlos@example.test',projectFor,now);return {busy:false};
  },execute:async()=>{calls++;return {status:'dispatched'};}},now);
  assert.equal(calls,0);
  assert.equal(env.DB.raw.prepare('SELECT reason FROM fleet_agent_mode_runs').get().reason,'preference_changed');
  assert.equal(env.DB.raw.prepare('SELECT mode FROM fleet_agent_modes').get().mode,'manual');
});

test('reservas huérfanas vencen sin reinyectar la hora antigua y ocupación deja motivo trazable',async()=>{
  const env=await setup();let calls=0;
  const adapters={projectFor,readTelemetry:async()=>telemetry(),activityFor:async()=>({busy:true,reason:'active_mission'}),execute:async()=>{calls++;return {status:'completed'};}};
  await runHourlyModes(env,adapters,now);
  assert.equal(env.DB.raw.prepare('SELECT status,reason FROM fleet_agent_mode_runs').get().reason,'active_mission');
  env.DB.raw.exec("UPDATE fleet_agent_mode_runs SET status='reserved'");
  await runHourlyModes(env,{...adapters,readTelemetry:async()=>telemetry(now+HOUR)},now+HOUR);
  assert.equal(calls,0);
  assert.equal(env.DB.raw.prepare('SELECT status,reason FROM fleet_agent_mode_runs ORDER BY hour_start LIMIT 1').get().reason,'delivery_timeout');
});

test('modo guardado es independiente por superficie y hora UTC distingue ambas 02h del cambio DST',async()=>{
  const env=await setup();
  await saveAgentMode(env,{...target,host:'cli',mode:'training'},'carlos@example.test',projectFor,now);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM fleet_agent_modes').get().n,2);
  assert.equal(modeTargetKey(normalizeModeTarget({...target,persona:'MorfeoMacMini',machine:'Mac Mini'})),modeTargetKey(normalizeModeTarget(target)));
  const first=Date.parse('2026-10-25T00:30:00Z'),second=Date.parse('2026-10-25T01:30:00Z');
  assert.equal(hourlySlot(second)-hourlySlot(first),HOUR);
});

const source=await readFile(new URL('./src/index.js',import.meta.url),'utf8');
function fn(name) {
  const start=source.indexOf(`async function ${name}(`);assert.ok(start>=0);
  const end=source.indexOf('\n}',start);return source.slice(start,end+2);
}
test('adaptador real Learning despacha al consumidor, y Training sin backlog encarga investigación en vez de simular ventana',async()=>{
  let writes=[],opened=0;
  const context={automationAllowed,automationFenceSql,Date,console,hourlyModeGuard:async()=>({allowed:true}),hourlyModeTelemetry:async()=>telemetry(),hourlyModeActivity:async()=>({busy:false}),evaluateModeOpportunity:()=>({eligible:true,target:{...target,pid:321,session_id:'desktop:claude'},start:false}),canonicalOnIdleProposals:async()=>({ok:false,proposals:[]}),dispatchDesktopWrite:async(_env,input)=>{writes.push(input);return {result:{command_id:'17'}};},academyTemaDeFranja:()=>({tema:{nombre:'Tecnología'},lessonId:'contratos-claros'}),COACH_HOUR:HOUR,learningPrompt:run=>'Learning '+run.id,trainingPrompt:run=>'Training '+run.id,openInitialMissionDecision:async()=>{opened++;return {ok:true,id:'DEC1'};}};
  vm.runInNewContext(fn('executeHourlyMode')+';this.execute=executeHourlyMode',context);
  for (const mode of ['learning','training']) {
    const result=await context.execute({}, {id:'HMODE-test',pref:{...target,mode},project:{id:'yokup'},hour_start:now,now});
    assert.equal(result.status,'dispatched');assert.equal(result.command_id,'17');
  }
  assert.equal(writes.length,2);assert.equal(opened,0);
});

test('Training rechaza propuestas genéricas, repos ajenos, repetidas o evidencia caducada',()=>{
  const titles=['Corregir /dashboard para eliminar 3 errores de navegación','Reducir /api a 200 ms para evitar 2 esperas','Añadir /highscore para verificar 4 estados pendientes'];
  const proposals=titles.map(title=>({title,evidence:'Se ha observado directamente el comportamiento actual del proyecto y se conserva evidencia concreta de la incidencia.',source_url:'https://yokup.com/dashboard',observed_at:now}));
  const project={web:'https://yokup.com'};
  assert.equal(validateTrainingProposals(proposals,project,now).length,3);
  assert.equal(validateTrainingProposals(proposals,{web:'www.yokup.com'},now).length,3);
  for (const patch of [{title:'Mejorar la aplicación'},{source_url:'https://github.com/otro/ajeno'},{observed_at:now-16*60000},{title:titles[1]}]) {
    assert.throws(()=>validateTrainingProposals([{...proposals[0],...patch},...proposals.slice(1)],project,now));
  }
});

test('callback Training publica una ventana real de cinco opciones y conserva evidencia una vez ante concurrencia',async()=>{
  const env=await setup();
  await ensureHourlyModeSchema(env);
  env.DB.raw.exec("CREATE TABLE tickets (subject TEXT,status TEXT,project_id TEXT); CREATE TABLE decisions(options TEXT,project TEXT,created_at INTEGER);");
  const pref=env.DB.raw.prepare('SELECT * FROM fleet_agent_modes').get();pref.mode='training';
  const run={id:'HMODE-training',identity_key:pref.identity_key,mode:'training',project_id:'yokup',status:'dispatched',created_at:now};
  env.DB.raw.prepare("INSERT INTO fleet_agent_mode_runs(id,identity_key,hour_start,mode,project_id,status,command_id,created_at,updated_at) VALUES(?,?,?,?,?,'dispatched','17',?,?)").run(run.id,pref.identity_key,now,'training','yokup',now,now);
  let publications=[];
  const context={automationAllowed,automationFenceSql,Date:{now:()=>now},AbortSignal,validateTrainingProposals,Set,URL,fetch:async()=>({ok:true}),hourlyModeProject:projectFor,onIdleProposalTitleKey:title=>title.toLowerCase(),hourlyModeGuard:async()=>({allowed:true}),evaluateModeOpportunity:()=>({eligible:true,start:false}),hourlyModeTelemetry:async()=>telemetry(),hourlyModeActivity:async()=>({busy:false}),ONIDLE_BACK_OPTION:'↩ Volver atrás',ONIDLE_CUSTOM_OPTION:'✍️ Custom',DECIDE_URL:'https://yokup.com/decisions',onIdleDecisionUrl:id=>'https://yokup.com/decisions?decision_id='+id,openInitialMissionDecision:async(_env,input)=>{publications.push(input);return {ok:true,id:'DEC-hourly'};}};
  vm.runInNewContext(fn('completeHourlyTraining')+';this.complete=completeHourlyTraining',context);
  const titles=['Corregir /dashboard para eliminar 3 errores de navegación','Reducir /api a 200 ms para evitar 2 esperas','Añadir /highscore para verificar 4 estados pendientes'];
  const body={proposals:titles.map(title=>({title,evidence:'Se ha observado directamente el comportamiento actual del proyecto y se conserva evidencia concreta de la incidencia.',source_url:'https://yokup.com/dashboard',observed_at:now}))};
  const responses=await Promise.all([context.complete(env,run,pref,body),context.complete(env,run,pref,body)]);
  assert.equal(responses.filter(row=>row.ok).length,1);
  assert.equal(publications.length,1);assert.equal(publications[0].options.length,5);
  assert.equal(publications[0].options[3],'↩ Volver atrás');assert.equal(publications[0].options[4],'✍️ Custom');
  const persisted=env.DB.raw.prepare('SELECT * FROM fleet_agent_mode_runs WHERE id=?').get(run.id);
  assert.equal(persisted.status,'completed');assert.equal(persisted.decision_id,'DEC-hourly');
  assert.equal(JSON.parse(persisted.evidence_json).length,3);
});

test('ACK real Desktop entregado conserva Learning pendiente hasta verificar cápsula',async()=>{
  const env=await setup(),pref=env.DB.raw.prepare('SELECT * FROM fleet_agent_modes').get();
  env.DB.raw.prepare("INSERT INTO fleet_agent_mode_runs(id,identity_key,hour_start,mode,project_id,status,command_id,created_at,updated_at) VALUES('HMODE-learning',?,?,'learning','yokup','dispatched','17',?,?)").run(pref.identity_key,now,now,now);
  const context={automationAllowed,automationFenceSql,readDesktopResult:async()=>({status:'done',delivered:true})};
  vm.runInNewContext(fn('resumeHourlyModes')+';this.resume=resumeHourlyModes',context);
  await context.resume(env,now);
  const result=env.DB.raw.prepare('SELECT status,reason FROM fleet_agent_mode_runs').get();
  assert.equal(result.status,'awaiting_delivery');assert.equal(result.reason,'capsule_pending');
});

test('guard consumidor vincula el run con agente, máquina, runtime y superficie exactos',async()=>{
  const env=await setup(),pref=env.DB.raw.prepare('SELECT * FROM fleet_agent_modes').get();
  env.DB.raw.prepare("INSERT INTO fleet_agent_mode_runs(id,identity_key,hour_start,mode,project_id,status,command_id,created_at,updated_at) VALUES('HMODE-guard',?,?,'learning','yokup','dispatched','17',?,?)").run(pref.identity_key,now,now,now);
  env.DB.raw.prepare("INSERT INTO fleet_hourly_family_leases VALUES('morfeo|macmini','HMODE-guard',?)").run(now+HOUR);
  const context={automationAllowed,automationFenceSql,URL,normalizeModeTarget,ensureHourlyModeSchema,modeTargetKey,hourlyModeProject:projectFor,hourlyModeActivity:async()=>({busy:false})};
  vm.runInNewContext(fn('hourlyModeGuard')+';this.guard=hourlyModeGuard',context);
  assert.equal((await context.guard(env,'HMODE-guard',now,normalizeModeTarget(target))).allowed,true);
  for (const change of [{persona:'Oraculo'},{machine:'MacBook Pro 16'},{runtime:'Codex'},{host:'cli'}]) {
    const result=await context.guard(env,'HMODE-guard',now,normalizeModeTarget({...target,...change}));
    assert.equal(result.allowed,false);assert.equal(result.reason,'target_mismatch');
  }
});

test('dos superficies de la misma familia no despachan simultáneamente aunque ambas estén seleccionadas',async()=>{
  const env=await setup();
  await saveAgentMode(env,{...target,runtime:'Codex',mode:'learning'},'carlos@example.test',projectFor,now-HOUR/2);
  const data=telemetry();data.control_machines[0].capabilities.push('hourly_desktop_codex');
  data.presence.push({...data.presence[0],runtime:'Codex',session_id:'desktop:codex',pid:322});
  let calls=0;
  await runHourlyModes(env,{projectFor,readTelemetry:async()=>data,activityFor:async()=>({busy:false}),execute:async()=>{calls++;return {status:'dispatched',reason:'awaiting_consumer',command_id:'17'};}},now);
  assert.equal(calls,1);
  const rows=env.DB.raw.prepare('SELECT status,reason FROM fleet_agent_mode_runs').all();
  assert.equal(rows.filter(row=>row.reason==='family_busy').length,1);
});

test('runner aislado usa capability por perfil exacto y despacha a cola sin inyectar ni abrir sesión',async()=>{
  const cli={...target,host:'cli'},data=telemetry();
  data.control_machines[0].capabilities.push('hourly_cli_claude');
  data.control_machines[0].hourly_targets=[cli];data.control_machines[0].slots.push(cli);
  const {evaluateModeOpportunity}=await import('./src/fleet-hourly-modes.js');
  assert.equal(evaluateModeOpportunity({...cli,mode:'learning'},data,{},now).eligible,true);
  assert.equal(evaluateModeOpportunity({...cli,persona:'Neo',mode:'learning'},data,{},now).eligible,false);
  let queued;
  const context={automationAllowed,automationFenceSql,Request,URL,Date,hourlyModeGuard:async()=>({allowed:true}),hourlyModeTelemetry:async()=>data,hourlyModeActivity:async()=>({busy:false}),evaluateModeOpportunity};
  vm.runInNewContext(fn('executeHourlyMode')+';this.execute=executeHourlyMode',context);
  // Live clock telemetry used by the adapter: independent of historical fixture.
  data.control_machines[0].updated=data.control_machines[0].human_sampled_at=Date.now()/1000;
  const env={ADMIRA_TELEGRAM_PANEL_KEY:'test',TELEGRAM:{fetch:async req=>{queued=await req.json();return Response.json({ok:true,command_id:88});}}};
  const result=await context.execute(env,{id:'HMODE-isolated',pref:{...cli,mode:'training'},project:{id:'yokup',web:'www.yokup.com'},now:Date.now()});
  assert.equal(result.status,'dispatched');assert.equal(queued.run_id,'HMODE-isolated');assert.equal(queued.project_url,'https://www.yokup.com/');assert.equal(queued.host,'cli');assert.equal(queued.text,undefined);
});

async function workContext() {
  const env=await setup();
  env.DB.raw.exec("CREATE TABLE tickets(id TEXT PRIMARY KEY,screen TEXT,subject TEXT,loc TEXT,role TEXT,status TEXT,priority TEXT,assignee TEXT,source TEXT,ai_triage TEXT,project TEXT,project_id TEXT,created_at INTEGER,started_at INTEGER,updated_at INTEGER,live_at INTEGER); CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,title TEXT,status TEXT,owner TEXT,executor TEXT,report TEXT,created_at INTEGER,started_at INTEGER,updated_at INTEGER);");
  env.DB.batch=async statements=>{env.DB.raw.exec('BEGIN');try {const results=[];for(const statement of statements)results.push(await statement.run());env.DB.raw.exec('COMMIT');return results;}catch(e){env.DB.raw.exec('ROLLBACK');throw e;}};
  const pref=env.DB.raw.prepare('SELECT * FROM fleet_agent_modes').get(),id='HMODE-'+'a'.repeat(28);
  env.DB.raw.prepare("INSERT INTO fleet_agent_mode_runs(id,identity_key,hour_start,mode,project_id,status,created_at,updated_at) VALUES(?,?,?,'learning','yokup','dispatched',?,?)").run(id,pref.identity_key,now,now,now);
  let allowed=true;
  const context={automationAllowed,automationFenceSql,URL,normalizeModeTarget,modeTargetKey,scopedAgentIdentity:(agent,machine,role)=>role+agent,hourlyModeGuard:async()=>({allowed,reason:allowed?'ready':'preference_changed'}),ensureEntityDisplayRef:async()=>{},hourlyModeProject:projectFor,validateTrainingProposals};
  vm.runInNewContext(fn('hourlyModeWork')+';this.work=hourlyModeWork',context);
  return {env,id,work:body=>context.work(env,{run_id:id,target,...body},now),revoke:()=>{allowed=false;}};
}

test('alta antes investigación crea misión+tarea exactas y CAS publica una sola vez',async()=>{
  const {env,work,id}=await workContext();
  const registered=await work({stage:'start'});assert.ok(registered.work_id.startsWith('HWR-'));
  const task=env.DB.raw.prepare('SELECT * FROM mission_tasks').get();assert.equal(task.status,'in_progress');assert.ok(task.report.includes(id));assert.match(task.owner,/sub/i);
  assert.equal((await work({stage:'start'})).reused,true);
  await work({stage:'report',result:{title:'Contratos verificables',comment:'Observación concreta y aplicación al proyecto: '.repeat(5),source_url:'https://yokup.com/'}});
  const attempts=await Promise.allSettled([work({stage:'publish_claim'}),work({stage:'publish_claim'})]);
  assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(env.DB.raw.prepare('SELECT publish_claim FROM fleet_hourly_work').get().publish_claim,1);
  await assert.rejects(()=>work({stage:'report',result:{title:'Un informe cambiado',comment:'Otra observación '.repeat(15),source_url:'https://yokup.com/'}}),/transcript_immutable/);
});

test('cancelación Manual permite registrar fallo honesto sin guard y nunca borra entrega ni reabre cierre',async()=>{
  const {env,work,revoke}=await workContext();
  await work({stage:'start'});revoke();
  const result=await work({stage:'fail',reason:'preference_changed'});assert.equal(result.status,'unconcluded');
  assert.equal(env.DB.raw.prepare('SELECT status FROM fleet_agent_mode_runs').get().status,'failed');
  assert.match(env.DB.raw.prepare('SELECT report FROM mission_tasks').get().report,/preference_changed/);
  env.DB.raw.exec("UPDATE fleet_agent_mode_runs SET status='completed',deliverable_url='https://www.pixeria.com/stock';UPDATE tickets SET status='resolved'");
  const closed=await work({stage:'fail',reason:'network_error'});assert.equal(closed.status,'resolved');
  assert.equal(env.DB.raw.prepare('SELECT status FROM tickets').get().status,'resolved');
  assert.equal(env.DB.raw.prepare('SELECT status FROM fleet_agent_mode_runs').get().status,'completed');
});

test('actividad excluye únicamente investigación enlazada al mismo run y destino',async()=>{
  const {env,work,id}=await workContext();await work({stage:'start'});
  env.DB.raw.exec('CREATE TABLE decisions(agent TEXT,machine TEXT,status TEXT,deadline INTEGER,parent_decision TEXT)');
  const context={automationAllowed,automationFenceSql,modeTargetKey,assignedWorkBlockers,ensureHourlyModeSchema,AGENT_SOURCE_SQL:"source='cli-declare'",matchesOnIdleIdentity:(row,t)=>row.assignee==='MorfeoMacMini'};
  vm.runInNewContext(fn('assignedWorkSnapshot')+fn('hourlyModeActivity')+';this.activity=hourlyModeActivity',context);
  assert.equal((await context.activity(env,target,{id:'yokup'},now,id)).busy,false);
  assert.equal((await context.activity(env,target,{id:'yokup'},now)).busy,true);
  env.DB.raw.exec("INSERT INTO tickets(id,assignee,loc,source,status) VALUES('OTHER','MorfeoMacMini','MacMini','cli-declare','in_progress')");
  assert.equal((await context.activity(env,target,{id:'yokup'},now,id)).busy,true);
});

test('reconcile hourly_run valida acción/destino y nunca pisa callback completado durante lectura',async()=>{
  const env=await setup();
  const pref=await saveAgentMode(env,{...target,host:'cli',mode:'learning'},'carlos@example.test',projectFor,now-HOUR/2);
  const id='HMODE-'+'b'.repeat(28);
  env.DB.raw.prepare("INSERT INTO fleet_agent_mode_runs(id,identity_key,hour_start,mode,project_id,status,command_id,created_at,updated_at) VALUES(?,?,?,'learning','yokup','dispatched','99',?,?)").run(id,pref.identity_key,now,now,now);
  const command={...target,host:'cli',action:'hourly_run',status:'done',input:JSON.stringify({run_id:id})};
  env.TELEGRAM={fetch:async()=>Response.json({command})};
  const readContext={Request,modeTargetKey};
  vm.runInNewContext(fn('readHourlyModeCommand')+';this.read=readHourlyModeCommand',readContext);
  assert.equal((await readContext.read(env,{id,command_id:'99'},pref)).status,'done');
  command.persona='Neo';await assert.rejects(()=>readContext.read(env,{id,command_id:'99'},pref),/hourly_command_mismatch/);command.persona='Morfeo';
  const context={automationAllowed,automationFenceSql,hourlySlot,readHourlyModeCommand:async()=>{env.DB.raw.prepare("UPDATE fleet_agent_mode_runs SET status='completed',deliverable_url='https://delivery.example/real' WHERE id=?").run(id);return {status:'done'};}};
  vm.runInNewContext(fn('resumeHourlyModes')+';this.resume=resumeHourlyModes',context);
  await context.resume(env,now);
  const run=env.DB.raw.prepare('SELECT * FROM fleet_agent_mode_runs WHERE id=?').get(id);
  assert.equal(run.status,'completed');assert.equal(run.deliverable_url,'https://delivery.example/real');
});

test('respuesta tardía del ejecutor no revive run pausado ni pisa su motivo',async()=>{
  const env=await setup();
  const result=await runHourlyModes(env,{
    readTelemetry:async()=>telemetry(),projectFor,activityFor:async()=>({busy:false}),
    execute:async({id})=>{
      env.DB.raw.prepare("UPDATE fleet_agent_mode_runs SET status='paused',reason='human_mission_assigned' WHERE id=?").run(id);
      return {status:'dispatched',reason:'awaiting_consumer',command_id:'late-command'};
    }
  },now);
  assert.equal(result.results[0].status,'paused');
  const run=env.DB.raw.prepare('SELECT status,reason,command_id FROM fleet_agent_mode_runs').get();
  assert.equal(run.status,'paused');assert.equal(run.reason,'human_mission_assigned');assert.equal(run.command_id,null);
  assert.equal(env.DB.raw.prepare('SELECT status FROM fleet_agent_modes').get().status,'paused');
});
