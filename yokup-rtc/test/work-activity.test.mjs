import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { WORK_ACTIVITY_TABLE_SQL, normalizeWorkActivity, recordWorkActivity, evaluateWorkActivity, workActivityProcessKey } from '../src/work-activity.js';
const now=1788597000000;
const activity=normalizeWorkActivity({kind:'coordination',detail:'Reviso pruebas de los agentes antes del cierre'}, {runtime:'Codex',host:'app',session_id:'desktop:codex'});
function fixture(){
 const db=new DatabaseSync(':memory:'); db.exec("CREATE TABLE tickets(id TEXT PRIMARY KEY,assignee TEXT,loc TEXT,status TEXT); INSERT INTO tickets VALUES ('M','OraculoMacMini','MacMini','in_progress')"); db.exec(WORK_ACTIVITY_TABLE_SQL);
 const env={DB:{prepare(sql){return {bind(...args){return {run:async()=>({meta:{changes:db.prepare(sql).run(...args).changes}})}}}}}};
 return {db,env,ticket:{id:'M',assignee:'OraculoMacMini',loc:'MacMini'}};
}
test('actividad opcional no convierte heartbeat en avance y exige sesión explícita',()=>{
 assert.equal(normalizeWorkActivity(undefined),null);
 assert.throws(()=>normalizeWorkActivity({kind:'coordination',detail:'Coordinación real en curso'}),/session_required/);
 assert.throws(()=>normalizeWorkActivity({kind:'heartbeat',detail:'Presencia del proceso'},activity),/invalid/);
});
test('persistencia requiere vínculo exacto, dueño, estado vigente y es inmune a cierre durante bind',async()=>{
 const {db,env,ticket}=fixture();
 assert.equal((await recordWorkActivity(env,ticket,ticket.assignee,null,{bound:true},now)).accepted,false);
 assert.equal((await recordWorkActivity(env,ticket,ticket.assignee,activity,{bound:false,reason:'ambiguous_session'},now)).accepted,false);
 assert.equal((await recordWorkActivity(env,ticket,'TrinityMacMini',activity,{bound:true},now)).accepted,false);
 assert.equal(db.prepare('SELECT count(*) n FROM fleet_work_activity').get().n,0);
 assert.equal((await recordWorkActivity(env,ticket,ticket.assignee,activity,{bound:true},now)).accepted,true);
 const previous=db.prepare('SELECT activity_json FROM fleet_work_activity').get().activity_json;
 db.exec("UPDATE tickets SET status='resolved'");
 assert.equal((await recordWorkActivity(env,ticket,ticket.assignee,activity,{bound:true},now+100)).accepted,false);
 assert.equal(db.prepare('SELECT activity_json FROM fleet_work_activity').get().activity_json,previous);
});
test('actividad requiere proceso, sesión, familia y nacimiento correctos y caduca sin cambiar relojes',()=>{
 const signal={...activity,family_key:'oraculo@macmini',observed_at:now,basis:'explicit_bound_progress'};
 const base={signal,status:'in_progress',family_key:signal.family_key,linked:{state:'open',surface:'app',runtime:'Codex',session_id:'desktop:codex',started_at:now-1000},exact_processes:new Map([[workActivityProcessKey(signal.family_key,'Codex','app','desktop:codex'),now]]),now};
 assert.equal(evaluateWorkActivity(base).activity_at,now);
 for(const delta of [{status:'resolved'},{ended_at:now},{family_key:'trinity@macmini'},{linked:{...base.linked,started_at:now+1}},{linked:{...base.linked,surface:'cli'}},{exact_processes:new Map()},{now:now+120001},{signal:{...signal,observed_at:now+5001}}]) assert.equal(evaluateWorkActivity({...base,...delta}),null);
 for(const delta of [{session_id:'another'},{runtime:'Claude'},{host:'cli'}]) assert.equal(evaluateWorkActivity({...base,signal:{...signal,...delta}}),null);
 assert.deepEqual(Object.keys(evaluateWorkActivity(base)),['activity_at','activity_kind','activity_text','activity_basis']);
});
