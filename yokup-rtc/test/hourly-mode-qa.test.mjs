import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateModeOpportunity,hourlySlot,modeTargetKey,normalizeModeTarget} from '../src/fleet-hourly-modes.js';
const now=Date.parse('2026-09-05T06:00:00Z');
const pref={agent:'MorfeoMacMini',persona:'Morfeo',machine:'MacMini',runtime:'Claude',host:'app',mode:'learning'};
const row={...pref,verified:1,online:true,source:'process_snapshot',session_id:'desktop:claude',pid:42,updated:now/1000-2};
const machine={machine:'MacMini',updated:now/1000-2,human_sampled_at:now/1000-2,human_idle_seconds:305,capabilities:['desktop_write','terminal_write','hourly_modes','hourly_desktop_claude'],slots:[row]};
const check=(p=pref,m=machine,rows=[row],activity={})=>evaluateModeOpportunity(p,{control_machines:[m],presence:rows},activity,now);
test('QA: Manual never becomes eligible despite a free machine',()=>assert.equal(check({...pref,mode:'manual'}).eligible,false));
test('QA: fresh idle verified exact app is eligible',()=>assert.equal(check().eligible,true));
test('QA: absent, stale, future and human activity telemetry fail closed',()=>{
 for(const mutation of [{human_idle_seconds:null},{human_idle_seconds:'500'},{human_idle_seconds:0},{human_sampled_at:now/1000-31},{human_sampled_at:now/1000+10},{updated:now/1000-31},{updated:now/1000+10}])assert.equal(check(pref,{...machine,...mutation}).eligible,false,JSON.stringify(mutation));
});
test('QA: busy family and duplicate live surface never dispatch',()=>{
 assert.equal(check(pref,machine,[row],{busy:true}).eligible,false);
 assert.equal(check(pref,machine,[row,{...row,pid:43,session_id:'second'}]).eligible,false);
});
test('QA: unavailable CLI composer does not accept automatic text',()=>{
 const cli={...pref,host:'cli'};assert.equal(check(cli,{...machine,slots:[{...row,host:'cli'}]},[{...row,host:'cli'}]).eligible,false);
});
test('QA: freshness failure cannot be treated as live ready process',()=>{
 for(const mutation of [{updated:now/1000-31},{verified:0},{source:'heartbeat'},{session_id:''},{pid:1}]){
 const result=check(pref,{...machine,slots:[]},[{...row,...mutation}]);assert.equal(result.eligible,false,JSON.stringify(mutation));
 }
});
test('QA: exact identity keys distinguish interfaces but retain machine aliases',()=>{
 assert.equal(modeTargetKey(pref),modeTargetKey({...pref,machine:'admira-macmini'}));
 assert.notEqual(modeTargetKey(pref),modeTargetKey({...pref,host:'cli'}));
 assert.notEqual(modeTargetKey(pref),modeTargetKey({...pref,runtime:'Codex'}));
 assert.throws(()=>normalizeModeTarget({...pref,host:''}));
});
test('QA: hourly slots use elapsed hours across repeated or missing local DST hours',()=>{
 for(const date of ['2026-10-25T00:30:00Z','2026-10-25T01:30:00Z','2026-03-29T00:30:00Z','2026-03-29T01:30:00Z']){
 const at=Date.parse(date);assert.equal(hourlySlot(at+3600000)-hourlySlot(at),3600000);
 assert.equal(hourlySlot(at),Math.floor(at/3600000)*3600000);
 }
});
