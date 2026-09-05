import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {raceBonus,raceRoster,RACE_MS,WIN_MS} from '../src/race-bonus.js';
function harness() {
  const db=new DatabaseSync(':memory:');
  db.exec("CREATE TABLE tickets(id TEXT PRIMARY KEY,status TEXT,assignee TEXT,loc TEXT,updated_at INTEGER); CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,status TEXT); CREATE TABLE events(id INTEGER PRIMARY KEY,ticket_id TEXT,ts INTEGER,kind TEXT,author TEXT,text TEXT)");
  db.prepare("INSERT INTO tickets VALUES(?,'in_progress',?,'admira-macmini',123)").run('DCL-test','OraculoMacMini');
  const DB={prepare(sql){const stmt=db.prepare(sql); const wrap=(args=[])=>({bind:(...args)=>wrap(args),run:async()=>({meta:stmt.run(...args)}),first:async()=>stmt.get(...args)||null,all:async()=>({results:stmt.all(...args)})});return wrap();}};
  let participants=[{family_key:'oraculo@macmini',agent:'OraculoMacMini',machine:'MacMini',kind:'mission',reference:'DCL-test',project_id:'yokup',state:'running'}];
  return {db,env:{DB},active:async()=>({participants}),set:rows=>participants=rows};
}
const NOW=1800000000000;
test('one shared race and exactly one persistent +1 across concurrent starts, finishes and reloads',async()=>{
  const h=harness();
  const starts=await Promise.all(Array.from({length:8},()=>raceBonus(h.env,{action:'start'},h.active,NOW)));
  assert.equal(new Set(starts.map(x=>x.race.id)).size,1);
  const race=starts[0].race;
  assert.equal((await raceBonus(h.env,{action:'finish',race_id:race.id},h.active,NOW+WIN_MS-1)).code,'too_early');
  const results=await Promise.all(Array.from({length:8},()=>raceBonus(h.env,{action:'finish',race_id:race.id,agent:'Neo',points:999,mission_id:'fake'},h.active,NOW+WIN_MS)));
  assert.ok(results.every(x=>x.awarded&&x.points===1&&x.mission_id==='DCL-test'));
  assert.equal(h.db.prepare("SELECT COUNT(*) c FROM events WHERE kind='race_bonus'").get().c,1);
  assert.equal(h.db.prepare('SELECT updated_at FROM tickets').get().updated_at,123);
  assert.equal((await raceBonus(h.env,{action:'start'},h.active,NOW+RACE_MS-1)).race.id,race.id);
  const next=(await raceBonus(h.env,{action:'start'},h.active,NOW+RACE_MS)).race;
  assert.notEqual(next.id,race.id);
  await raceBonus(h.env,{action:'finish',race_id:next.id},h.active,NOW+RACE_MS+WIN_MS);
  assert.equal(h.db.prepare('SELECT COUNT(*) c FROM events').get().c,2);
});
test('closed, reassigned, stale or changed work cannot receive the victory',async()=>{
  for(const change of ['closed','reassigned','stale','changed']){
    const h=harness(), race=(await raceBonus(h.env,{action:'start'},h.active,NOW)).race;
    if(change==='closed')h.db.exec("UPDATE tickets SET status='resolved'");
    if(change==='reassigned')h.db.exec("UPDATE tickets SET assignee='NeoMacMini'");
    if(change==='stale')h.set((await h.active()).participants.map(x=>({...x,state:'assigned_stale'})));
    if(change==='changed')h.set((await h.active()).participants.map(x=>({...x,reference:'DCL-other'})));
    assert.equal((await raceBonus(h.env,{action:'finish',race_id:race.id},h.active,NOW+WIN_MS)).awarded,false,change);
    assert.equal(h.db.prepare('SELECT COUNT(*) c FROM events').get().c,0);
  }
});
test('unknown, expired and empty races never mint points; body is validated',async()=>{
  const h=harness();
  assert.equal((await raceBonus(h.env,null,h.active,NOW)).code,'invalid_request');
  assert.equal((await raceBonus(h.env,{action:'finish',race_id:'fake'},h.active,NOW)).code,'unknown_race');
  const race=(await raceBonus(h.env,{action:'start'},h.active,NOW)).race;
  assert.equal((await raceBonus(h.env,{action:'finish',race_id:race.id},h.active,NOW+RACE_MS*2+1)).code,'race_expired');
  h.set([]);const empty=(await raceBonus(h.env,{action:'start'},h.active,NOW+RACE_MS*3)).race;
  assert.equal((await raceBonus(h.env,{action:'finish',race_id:empty.id},h.active,empty.finish_at)).code,'no_eligible_runner');
});
test('canonical machine aliases and task parent receive the bonus',async()=>{
  const h=harness();h.db.exec("UPDATE tickets SET assignee='OraculoMini'; INSERT INTO mission_tasks VALUES('DCL-test','a','in_progress')");
  h.set((await h.active()).participants.map(x=>({...x,kind:'task',reference:'DCL-test:a'})));
  const race=(await raceBonus(h.env,{action:'start'},h.active,NOW)).race;
  const result=await raceBonus(h.env,{action:'finish',race_id:race.id},h.active,race.finish_at);
  assert.equal(result.awarded,true);assert.equal(result.agent,'OraculoMacMini');assert.equal(result.mission_id,'DCL-test');
});
test('roster excludes grey/closed/session runners, deduplicates families and changes previous winner',()=>{
  const base={family_key:'a',agent:'A',kind:'mission',reference:'A',state:'running'};
  const roster=raceRoster([base,base,{...base,family_key:'b',kind:'session'},{...base,family_key:'c',state:'assigned_stale'}, {...base,family_key:'d',agent:'D'}],()=>0.999,'a');
  assert.deepEqual(roster.map(x=>x.family_key),['d','a']);
});
