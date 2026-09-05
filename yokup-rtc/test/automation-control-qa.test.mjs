import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {pauseAutomaticRun} from '../src/automatic-work-priority.js';
import {ensureHourlyModeSchema,normalizeModeTarget,modeTargetKey} from '../src/fleet-hourly-modes.js';
import {AUTOMATIC_DECISIONS,automationFamily,activateAutomationTargets,stopAutomationGate,automationAllowed,automationControls} from '../src/fleet-automation-control.js';

async function setup() {
  const raw=new DatabaseSync(':memory:');
  function statement(sql,args=[]) { return {sql,args,bind(...values){return statement(sql,values);},async run(){return {meta:{changes:Number(raw.prepare(sql).run(...args).changes)}};},async all(){return {results:raw.prepare(sql).all(...args)};},async first(){return raw.prepare(sql).get(...args)||null;}}; }
  const DB={raw,exec:async sql=>raw.exec(sql),prepare:statement,async batch(statements){
    raw.exec('BEGIN');try { const results=statements.map(({sql,args})=>({meta:{changes:Number(raw.prepare(sql).run(...args).changes)}}));raw.exec('COMMIT');return results;}catch(error){raw.exec('ROLLBACK');throw error;}
  }};
  const env={DB};await ensureHourlyModeSchema(env);return env;
}
function prepared(persona='Morfeo',host='app') {
  const target=normalizeModeTarget({persona,machine:'MacMini',runtime:'Claude',host});
  return {target,key:modeTargetKey(target),project:{id:'yokup'}};
}
function snapshot(env) {
  return ['fleet_agent_modes','fleet_automation_controls','fleet_automation_target_families'].map(table=>env.DB.raw.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
}
const actor='owner@example.invalid',now=1788595200000;

test('SQLite: misma revisión sólo autoriza un batch; el perdedor no modifica ninguna selección ni gate',async()=>{
  const env=await setup(),a=prepared(),b=prepared('Neo');
  await activateAutomationTargets(env,'learning',[a],[],0,actor,now);
  const before=snapshot(env);
  await assert.rejects(activateAutomationTargets(env,'learning',[b],[{...b.target,identity_key:b.key,mode:'manual'}],0,actor,now+1),/configuration_changed/);
  assert.deepEqual(snapshot(env),before);
});

test('SQLite: una parada nueva gana a una activación con revisión anterior y no se reactiva indirectamente',async()=>{
  const env=await setup(),a=prepared();
  await activateAutomationTargets(env,'learning',[a],[],0,actor,now);
  await stopAutomationGate(env,'learning','',now+100);
  const before=snapshot(env);
  await assert.rejects(activateAutomationTargets(env,'learning',[a],[],1,actor,now+101),/configuration_changed/);
  assert.deepEqual(snapshot(env),before);
  assert.equal((await automationAllowed(env,'learning',a.key,now+101)).allowed,false);
});

test('SQLite: reactivación explícita conserva cutoff y nunca revive una entrega previa a detener',async()=>{
  const env=await setup(),a=prepared();
  await stopAutomationGate(env,'training','',now);
  await activateAutomationTargets(env,'training',[a],[],1,actor,now+10);
  assert.equal((await automationAllowed(env,'training',a.key,now)).allowed,false);
  assert.equal((await automationAllowed(env,'training',a.key,now+10)).allowed,true);
});

test('SQLite: activación CLI concurrente se rechaza y conserva APP de la familia',async()=>{
  const env=await setup(),app=prepared(),cli=prepared('Morfeo','cli');
  const results=await Promise.allSettled([
    activateAutomationTargets(env,'learning',[app],[],0,actor,now),
    activateAutomationTargets(env,'training',[cli],[],0,actor,now+1)
  ]);
  const rows=env.DB.raw.prepare("SELECT * FROM fleet_agent_modes WHERE mode<>'manual'").all();
  assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.match(results[1].reason.message,/cli_paused_by_carlos/);
  assert.equal(rows.length,1);assert.equal(rows[0].identity_key,app.key);
  const old=env.DB.raw.prepare('SELECT * FROM fleet_agent_modes WHERE identity_key=?').get(app.key);
  assert.equal(old.mode,'learning');assert.notEqual(old.reason,'interface_changed');
  assert.equal(env.DB.raw.prepare('SELECT * FROM fleet_agent_modes WHERE identity_key=?').get(cli.key),undefined);
});

test('SQLite: parada global Training también bloquea productores sin host ni clave de interfaz',async()=>{
  const env=await setup();await stopAutomationGate(env,'training','',now);
  assert.equal((await automationAllowed(env,'training','',now+10)).allowed,false);
  assert.equal((await automationAllowed(env,'learning','',now+10)).allowed,true);
  assert.equal((await automationControls(env)).find(row=>row.scope==='training').enabled,0);
});

const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
function workerFunction(name){const start=source.indexOf('async function '+name+'(');assert.ok(start>=0,name);const end=source.indexOf('\n}',start);return source.slice(start,end+2);}

test('parada productiva conserva trabajos y declara ejecución no confirmada cuando el consumidor ya recibió comando',async()=>{
  const env=await setup(),a=prepared();
  await activateAutomationTargets(env,'training',[a],[],0,actor,now);
  env.DB.raw.exec("CREATE TABLE decisions(id TEXT,agent TEXT,machine TEXT,mission TEXT,parent_decision TEXT,status TEXT);CREATE TABLE tickets(id TEXT,status TEXT,updated_at INTEGER);CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,status TEXT,report TEXT,updated_at INTEGER);");
  env.DB.raw.prepare("INSERT INTO fleet_agent_mode_runs(id,identity_key,hour_start,mode,project_id,status,command_id,created_at,updated_at) VALUES('run',?,?,'training','yokup','awaiting_delivery','actual-command',?,?)").run(a.key,now,now,now);
  env.DB.raw.exec("INSERT INTO fleet_hourly_work VALUES('run','HWR-own','Retained research',1,1);INSERT INTO tickets VALUES('HWR-own','in_progress',1);INSERT INTO mission_tasks VALUES('HWR-own','a','in_progress','Partial genuine result',1);");
  const ctx={modeTargetKey,stopAutomationGate,automationFamily,pauseAutomaticRun,AUTOMATIC_DECISIONS};
  vm.runInNewContext(workerFunction('stopAutomationModule')+';this.stop=stopAutomationModule;',ctx);
  const result=await ctx.stop(env,'training',a.target,now+100);
  assert.equal(result.ok,true);assert.equal(result.execution_stop,'unconfirmed');assert.equal(result.results[0].execution_stop,'unconfirmed');
  assert.equal(env.DB.raw.prepare('SELECT status FROM fleet_agent_mode_runs').get().status,'paused');
  assert.equal(env.DB.raw.prepare('SELECT transcript FROM fleet_hourly_work').get().transcript,'Retained research');
  const task=env.DB.raw.prepare('SELECT status,report FROM mission_tasks').get();assert.equal(task.status,'unconcluded');assert.match(task.report,/Partial genuine result/);
  assert.equal((await automationAllowed(env,'onidle',automationFamily({agent:'SubMorfeoMini',machine:'admira-macmini'}),now+200)).allowed,false);
  assert.equal((await automationAllowed(env,'onidle',automationFamily({agent:'MorfeoMBP14',machine:'MBP14'}),now+200)).allowed,true);
});
