import {cliPolicyBlocked,CLI_POLICY} from './src/cli-policy.js';
import test from 'node:test';
import {automationAllowed} from './src/fleet-automation-control.js';
import assert from 'node:assert/strict';
import { assignedWorkBlockers, legacyAcademyAvailability } from './src/automatic-work-priority.js';
import { evaluateModeOpportunity } from './src/fleet-hourly-modes.js';

const target = {agent:'MorfeoMacMini',machine:'admira-macmini',runtime:'Claude',host:'app'};
const mission = {id:'DCL-human',assignee:'MorfeoMini',loc:'MacMini',status:'in_progress',updated_at:1,live_at:0};

test('an assigned human mission blocks both interfaces without a heartbeat expiry', () => {
  for (const host of ['app','cli']) for (const status of ['open','pending','assigned','in_progress','unconcluded']) {
    const blockers = assignedWorkBlockers({...target,host},{missions:[{...mission,status}]});
    assert.equal(blockers.length,1);
    assert.equal(blockers[0].id,mission.id);
    for (const mode of ['learning','training']) {
      const actual = evaluateModeOpportunity({...target,host,mode},{},{busy:blockers.length>0,reason:'human_mission_assigned'});
      assert.equal(actual.eligible,false);
      assert.equal(actual.reason,host==='cli'?'cli_paused_by_carlos':'human_mission_assigned');
      assert.notEqual(actual.status,'completed');
    }
  }
});

test('a delegated executor blocks even when the parent belongs to another family', () => {
  const rows = [{mission_id:'DCL-delegated',code:'b',status:'in_progress',executor:'SubMorfeoMacMini',owner:'TrinityMacMini',loc:'macmini',parent_status:'in_progress'}];
  assert.equal(assignedWorkBlockers(target,{tasks:rows})[0].id,'DCL-delegated');
  assert.equal(assignedWorkBlockers(target,{tasks:[{...rows[0],executor:'InfraMorfeoMini'}]}).length,1);
  assert.equal(assignedWorkBlockers(target,{tasks:[{...rows[0],executor:'SubTrinityMacMini'}]}).length,0);
});

test('another agent or another physical machine is not blocked by this assignment', () => {
  assert.equal(assignedWorkBlockers({...target,agent:'TrinityMacMini'},{missions:[mission]}).length,0);
  assert.equal(assignedWorkBlockers({agent:'MorfeoMBP14',machine:'MacBookProNegro14'},{missions:[mission]}).length,0);
  assert.equal(assignedWorkBlockers(target,{missions:[{...mission,assignee:'MorfeoMBP14',loc:'MacBookProNegro14'}]}).length,0);
});

test('only the explicitly linked automatic mission is exempt; prefixes grant no exemption', () => {
  const automatic={...mission,id:'HWR-linked'};
  assert.equal(assignedWorkBlockers(target,{missions:[automatic],ownMissionId:automatic.id}).length,0);
  assert.equal(assignedWorkBlockers(target,{missions:[automatic]}).length,1);
  const blockers=assignedWorkBlockers(target,{missions:[automatic,mission],ownMissionId:automatic.id});
  assert.deepEqual(blockers.map(x=>x.id),[mission.id]);
});

test('resolved and cancelled work releases priority, without modifying source records', () => {
  const input={missions:[{...mission,status:'resolved'},{...mission,id:'cancelled',status:'cancelled'}],tasks:[{mission_id:'DCL-ended',executor:'SubMorfeoMacMini',loc:'MacMini',status:'in_progress',parent_status:'resolved'}]};
  const before=structuredClone(input);
  assert.deepEqual(assignedWorkBlockers(target,input),[]);
  assert.deepEqual(input,before);
});

test('unknown legacy consumer remains paused, never claimed or credited as completed', () => {
  const actual=legacyAcademyAvailability();
  assert.equal(actual.allowed,false);
  assert.equal(actual.status,'paused');
  assert.equal(actual.reason,'consumer_unverified');
  assert.notEqual(actual.status,'completed');
});

import { DatabaseSync } from 'node:sqlite';
import { pauseAutomaticRun, pauseLegacyAcademy } from './src/automatic-work-priority.js';
import { ensureHourlyModeSchema } from './src/fleet-hourly-modes.js';
function database(){const raw=new DatabaseSync(':memory:');return {raw,exec:async sql=>raw.exec(sql),batch:async statements=>Promise.all(statements.map(s=>s.run())),prepare(sql){let args=[];const s={bind(...values){args=values;return s;},run:async()=>({meta:{changes:Number(raw.prepare(sql).run(...args).changes)}}),first:async()=>raw.prepare(sql).get(...args)||null,all:async()=>({results:raw.prepare(sql).all(...args)})};return s;}};}

test('preemption pauses the active run and preserves transcript, partial report and verified history',async()=>{
 const db=database();await ensureHourlyModeSchema({DB:db});
 db.raw.exec("CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,status TEXT,report TEXT,updated_at INTEGER);CREATE TABLE tickets(id TEXT,status TEXT,updated_at INTEGER);INSERT INTO tickets VALUES('HWR-own','in_progress',1),('HWR-done','resolved',1);INSERT INTO mission_tasks VALUES('HWR-own','a','in_progress','Actual research retained',1),('HWR-done','a','done','Verified report',1);");
 for(const [id,mid,status]of [['HMODE-active','HWR-own','awaiting_delivery'],['HMODE-done','HWR-done','completed']]){
  db.raw.prepare('INSERT INTO fleet_agent_mode_runs(id,identity_key,hour_start,mode,project_id,status,created_at,updated_at) VALUES(?,?,?,\'learning\',\'yokup\',?,1,1)').run(id,id,1,status);
  db.raw.prepare('INSERT INTO fleet_hourly_work(run_id,mission_id,transcript,publish_claim,created_at) VALUES(?,?,\'Original transcript\',1,1)').run(id,mid);
  db.raw.prepare('INSERT INTO fleet_hourly_family_leases VALUES(?,?,99999)').run(id,id);
 }
 const blockers=assignedWorkBlockers(target,{missions:[mission]});
 await pauseAutomaticRun(db,'HMODE-active',blockers,200);
 assert.deepEqual({...db.raw.prepare("SELECT status,reason FROM fleet_agent_mode_runs WHERE id='HMODE-active'").get()},{status:'paused',reason:'human_mission_assigned'});
 assert.equal(db.raw.prepare("SELECT transcript FROM fleet_hourly_work WHERE run_id='HMODE-active'").get().transcript,'Original transcript');
 const task=db.raw.prepare("SELECT status,report FROM mission_tasks WHERE mission_id='HWR-own'").get();assert.equal(task.status,'unconcluded');assert.match(task.report,/Actual research retained/);assert.match(task.report,/DCL-human/);
 assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM fleet_hourly_family_leases WHERE run_id='HMODE-active'").get().n,0);
 await pauseAutomaticRun(db,'HMODE-active',blockers,300);assert.equal(db.raw.prepare("SELECT report FROM mission_tasks WHERE mission_id='HWR-own'").get().report,task.report);
 await pauseAutomaticRun(db,'HMODE-done',blockers,400);
 assert.equal(db.raw.prepare("SELECT status FROM fleet_agent_mode_runs WHERE id='HMODE-done'").get().status,'completed');
 assert.equal(db.raw.prepare("SELECT status FROM tickets WHERE id='HWR-done'").get().status,'resolved');
 assert.equal(db.raw.prepare("SELECT report FROM mission_tasks WHERE mission_id='HWR-done'").get().report,'Verified report');
});

test('legacy pause retains decided/expired history and verified deliveries, auditing pending work once',async()=>{
 const db=database();db.raw.exec("CREATE TABLE academy_capsulas(hour_start INTEGER,smith_status TEXT,smith_stage TEXT,smith_detail TEXT,smith_updated_at INTEGER,decision_id TEXT);CREATE TABLE decisions(id TEXT,status TEXT,parent_decision TEXT);INSERT INTO decisions VALUES('pending','pending','FORMACION'),('decided','decided','FORMACION'),('expired','expired','FORMACION'),('human','pending','HUMAN'),('verified','pending','FORMACION');INSERT INTO academy_capsulas VALUES(1,'running','research','draft',1,'pending'),(2,'verified','verified','actual delivery',2,'verified');");
 await pauseLegacyAcademy(db,200);const rows=Object.fromEntries(db.raw.prepare('SELECT id,status FROM decisions').all().map(r=>[r.id,r.status]));
 assert.deepEqual(rows,{pending:'paused',decided:'decided',expired:'expired',human:'pending',verified:'pending'});
 const verified={...db.raw.prepare('SELECT * FROM academy_capsulas WHERE hour_start=2').get()};assert.equal(verified.smith_status,'verified');assert.equal(verified.smith_detail,'actual delivery');assert.equal(verified.smith_updated_at,2);
 const audit=db.raw.prepare('SELECT * FROM automatic_work_pauses ORDER BY kind,ref').all();assert.equal(audit.length,2);assert.ok(audit.every(r=>r.reason==='consumer_unverified'));
 await pauseLegacyAcademy(db,300);assert.deepEqual(db.raw.prepare('SELECT * FROM automatic_work_pauses ORDER BY kind,ref').all(),audit);
});

import fs from 'node:fs';
import vm from 'node:vm';
import { normalizeModeTarget, modeTargetKey, saveAgentMode } from './src/fleet-hourly-modes.js';
const backend=fs.readFileSync(new URL('./src/index.js',import.meta.url),'utf8');
function workerFunction(name){const start=backend.indexOf('async function '+name+'(');assert.ok(start>=0,name);const end=backend.indexOf('\nasync function ',start+1);assert.ok(end>start);return backend.slice(start,end);}
async function activeDatabase(){
 const db=database();db.raw.exec("CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT);INSERT INTO projects VALUES('yokup','Yokup');CREATE TABLE tickets(id TEXT,assignee TEXT,loc TEXT,status TEXT,updated_at INTEGER);CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,status TEXT,owner TEXT,executor TEXT,report TEXT,updated_at INTEGER);CREATE TABLE decisions(agent TEXT,machine TEXT,status TEXT,deadline INTEGER,parent_decision TEXT);");
 const now=Date.UTC(2026,8,5,5);const exact=normalizeModeTarget(target);const env={DB:db};
 await saveAgentMode(env,{...exact,mode:'learning'},'owner@example.invalid',async()=>({id:'yokup'}),now-1000);
 const pref=db.raw.prepare('SELECT * FROM fleet_agent_modes').get(),id='HMODE-'+ 'a'.repeat(28);
 db.raw.prepare("INSERT INTO fleet_agent_mode_runs(id,identity_key,hour_start,mode,project_id,status,created_at,updated_at) VALUES(?,?,?,'learning','yokup','awaiting_delivery',?,?)").run(id,pref.identity_key,now,now,now);
 db.raw.prepare("INSERT INTO fleet_hourly_work VALUES(?,'HWR-self','Actual transcript',0,?)").run(id,now);
 db.raw.prepare("INSERT INTO fleet_hourly_family_leases VALUES('morfeo|macmini',?,?)").run(id,now+3600000);
 db.raw.exec("INSERT INTO tickets VALUES('HWR-self','MorfeoMacMini','MacMini','in_progress',1);INSERT INTO mission_tasks VALUES('HWR-self','a','in_progress','MorfeoMacMini','SubMorfeoMacMini','Actual partial result',1)");
 return {db,env,now,id,pref,exact};
}

test('the production guard revokes a live delivery when a human assignment arrives and leaves preferences intact',async()=>{
 const {db,env,now,id,pref,exact}=await activeDatabase();
 const ctx={cliPolicyBlocked,CLI_POLICY,automationAllowed,ensureHourlyModeSchema,modeTargetKey,normalizeModeTarget,assignedWorkBlockers,pauseAutomaticRun,AGENT_SOURCE_SQL:'1=1',Set,URL,hourlyModeProject:async()=>({id:'yokup',web:'https://yokup.com'}),matchesOnIdleIdentity:()=>false};
 vm.runInNewContext(['assignedWorkSnapshot','hourlyModeActivity','hourlyModeGuard'].map(workerFunction).join('\n')+'\nthis.guard=hourlyModeGuard;',ctx);
 assert.equal((await ctx.guard(env,id,now,exact)).allowed,true);
 db.raw.exec("INSERT INTO tickets VALUES('DCL-human','MorfeoMini','MacMini','in_progress',1)");
 const denied=await ctx.guard(env,id,now,exact);assert.equal(denied.allowed,false);assert.equal(denied.reason,'human_mission_assigned');
 assert.equal(db.raw.prepare('SELECT status FROM fleet_agent_mode_runs WHERE id=?').get(id).status,'paused');
 assert.deepEqual({...db.raw.prepare('SELECT * FROM fleet_agent_modes').get()},{...pref,status:'paused',reason:'human_mission_assigned'});
 assert.equal(db.raw.prepare('SELECT publish_claim FROM fleet_hourly_work').get().publish_claim,0);
});

test('the production publish claim rechecks priority after initial permission and does not consume the claim',async()=>{
 const {db,env,now,id,exact}=await activeDatabase();let guards=0;
 const ctx={normalizeModeTarget,modeTargetKey,Date:{now:()=>now},hourlyModeGuard:async()=>++guards===1?{allowed:true}:{allowed:false,reason:'human_mission_assigned'}};
 vm.runInNewContext(workerFunction('hourlyModeWork')+'\nthis.work=hourlyModeWork;',ctx);
 await assert.rejects(ctx.work(env,{run_id:id,target:exact,stage:'publish_claim'},now),/human_mission_assigned/);
 assert.equal(guards,2);assert.equal(db.raw.prepare('SELECT publish_claim FROM fleet_hourly_work').get().publish_claim,0);
 assert.equal(db.raw.prepare('SELECT status FROM fleet_agent_mode_runs').get().status,'awaiting_delivery');
});
