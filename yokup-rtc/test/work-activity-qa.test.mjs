import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {WORK_ACTIVITY_TABLE_SQL,evaluateWorkActivity,recordWorkActivity,normalizeWorkActivity,workActivityProcessKey} from '../src/work-activity.js';
const now=1788596500000,family='oraculo@macmini';
const signal={kind:'coordination',detail:'Coordinando las tareas reales y revisando sus pruebas',runtime:'Codex',host:'app',session_id:'desktop:codex',family_key:family,observed_at:now,basis:'explicit_bound_progress'};
function input(patch={}){return {signal,status:'in_progress',ended_at:null,family_key:family,linked:{state:'open',surface:'app',runtime:'Codex',session_id:'desktop:codex',started_at:now-3600000},exact_processes:new Map([[workActivityProcessKey(family,'Codex','app','desktop:codex'),now]]),now,...patch};}
test('fresh explicit coordination is accepted with exact process and bound work, without manufacturing start or revision',()=>{
  const result=evaluateWorkActivity(input());assert.equal(result.activity_kind,'coordination');assert.equal(result.activity_at,now);
  for(const key of ['work_started_at','ended_at','race_revision','points','elapsed_ms'])assert.equal(Object.hasOwn(result,key),false);
});
test('canonical close beats fresh activity and a plain heartbeat or PID never supplies activity',()=>{
  for(const patch of [{status:'resolved'},{status:'in_progress',ended_at:now},{signal:null},{signal:{...signal,basis:'heartbeat'}},{signal:{...signal,kind:'heartbeat'}}])assert.equal(evaluateWorkActivity(input(patch)),null);
});
test('expired, future, wrong family and process birth changes fail closed',()=>{
  for(const patch of [{now:now+120001},{signal:{...signal,observed_at:now+5001}},{family_key:'trinity@macmini'},{linked:{...input().linked,started_at:now+1}},{exact_processes:new Map([[workActivityProcessKey(family,'Codex','app','desktop:codex'),now-30001]])}])assert.equal(evaluateWorkActivity(input(patch)),null);
});
test('changing host, runtime or session cannot borrow the previous emitter process or ledger',()=>{
  for(const patch of [{signal:{...signal,host:'cli'}},{signal:{...signal,runtime:'Claude'}},{signal:{...signal,session_id:'other'}},{linked:{...input().linked,session_id:'other'}},{linked:{...input().linked,runtime:'Claude'}}])assert.equal(evaluateWorkActivity(input(patch)),null,JSON.stringify(patch));
});
function database(){
  const raw=new DatabaseSync(':memory:');raw.exec(WORK_ACTIVITY_TABLE_SQL);
  raw.exec("CREATE TABLE tickets(id TEXT PRIMARY KEY,status TEXT,assignee TEXT,loc TEXT,started_at INTEGER,resolved_at INTEGER);INSERT INTO tickets VALUES('m','in_progress','OraculoMacMini','admira-macmini',1000,NULL)");
  return {raw,prepare(sql){return {bind(...args){return {run:async()=>({meta:{changes:Number(raw.prepare(sql).run(...args).changes)}})};}};}};
}

test('SQLite final write rejects a concurrent close and never changes factual start/end',async()=>{
  const DB=database(),ticket={...DB.raw.prepare("SELECT * FROM tickets WHERE id='m'").get()};
  const activity=normalizeWorkActivity(signal,signal),original={...ticket};
  const accepted=await recordWorkActivity({DB},ticket,'InfraOraculoMacMini',activity,{bound:true},now);assert.equal(accepted.accepted,true);
  assert.deepEqual({...DB.raw.prepare("SELECT * FROM tickets WHERE id='m'").get()},original);
  DB.raw.exec("UPDATE tickets SET status='resolved',resolved_at=9999 WHERE id='m'");
  const before=DB.raw.prepare('SELECT * FROM fleet_work_activity').all();
  assert.equal((await recordWorkActivity({DB},ticket,'InfraOraculoMacMini',activity,{bound:true},now+100)).accepted,false);
  assert.deepEqual(DB.raw.prepare('SELECT * FROM fleet_work_activity').all(),before);
});
test('SQLite unbound session and unrelated owner cannot register an activity claim',async()=>{
  const DB=database(),ticket=DB.raw.prepare("SELECT * FROM tickets WHERE id='m'").get(),activity=normalizeWorkActivity(signal,signal);
  assert.equal((await recordWorkActivity({DB},ticket,'OraculoMacMini',activity,{bound:false},now)).accepted,false);
  assert.equal((await recordWorkActivity({DB},ticket,'TrinityMacMini',activity,{bound:true},now)).accepted,false);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM fleet_work_activity').get().n,0);
});
