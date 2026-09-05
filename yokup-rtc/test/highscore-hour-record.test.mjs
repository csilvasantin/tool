import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/index.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('async function highscoreDailyRows('),source.indexOf('__name(highscoreDailyRows'));
const key=ms=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
async function run(facts,now){
 let queries=0;
 const env={DB:{prepare(sql){queries++; const rows=sql.includes('FROM ideas')?facts.ideas:sql.includes('FROM decisions')?facts.decisions:sql.includes('FROM mission_tasks m')?facts.tasks:sql.includes("kind='race_bonus'")?facts.bonuses:facts.missions;return{bind(){return{all:async()=>({results:rows||[]})}}};}}};
 const c=vm.createContext({Date,Map,Number,String,Math,highscoreNaturalPeriods:()=>({day_end:now+1}),madridDayKey:key,
 highscoreAgent:x=>x,highscoreCanonicalHistoryFamily:(agent,machine)=>({family_name:agent.replace(/^(Sub|Infra)/,'')+(machine||'')}),
 HIGHSCORE_WEIGHTS:{objective:20,window:10,mission:40},HIGHSCORE_TASK_WEIGHTS:{task:15,active_bonus:10},HIGHSCORE_MISSION_STARTED_SQL:'started_at',AGENT_SOURCE_SQL_T:'1'});
 vm.runInContext(fn,c);const data=await c.highscoreDailyRows(env,()=>true,now);return {data:JSON.parse(JSON.stringify(data)),queries};
}
test('closed hour uses only factual events in that hour, not the daily total; one query per scoring source',async()=>{
 const now=Date.parse('2026-09-05T10:30:00Z');
 const {data,queries}=await run({decisions:[{agent:'Neo',machine:'14',created_at:Date.parse('2026-09-05T08:20:00Z')},{agent:'Neo',machine:'14',created_at:Date.parse('2026-09-05T09:20:00Z')},{agent:'Neo',machine:'14',created_at:now-1}]},now);
 assert.equal(queries,5);assert.equal(data.allDays[0].points,30);assert.equal(data.hourRecords.records[0].points,10);
 assert.equal(data.hourRecords.records[0].start,Date.parse('2026-09-05T08:00:00Z'));
 assert.ok(data.hourRecords.records.every(r=>r.end<=Math.floor(now/3600000)*3600000));
});
test('hourly task representative is deduplicated within each hour without changing daily representative',async()=>{
 const at=s=>Date.parse('2026-09-05T'+s+'Z');
 const {data}=await run({tasks:[{mission_id:'M1',code:'a1',status:'done',assignee:'Neo',loc:'14',updated_at:at('08:10:00')},{mission_id:'M1',code:'a2',status:'done',assignee:'Neo',loc:'14',updated_at:at('08:20:00')},{mission_id:'M1',code:'a3',status:'in_progress',assignee:'Neo',loc:'14',updated_at:at('09:20:00')}]},at('10:30:00'));
 assert.equal(data.allDays[0].tasks,1);assert.equal(data.allDays[0].points,25);
 assert.equal(data.hourRecords.records[0].points,25);assert.equal(data.hourRecords.records[0].start,at('09:00:00'));
});
test('same persona on different machines stays distinct, layers on the same machine aggregate',async()=>{
 const now=Date.parse('2026-09-05T10:00:00Z'),at=now-3600000;
 const {data}=await run({decisions:[{agent:'Neo',machine:'14',created_at:at},{agent:'SubNeo',machine:'14',created_at:at},{agent:'Neo',machine:'Mini',created_at:at}]},now);
 assert.deepEqual(data.hourRecords.records.map(r=>[r.agent,r.points]),[['Neo14',20],['NeoMini',10]]);
});
test('repeated Madrid autumn hour is two hours, midnight excludes the new hour',async()=>{
 const at=Date.parse,now=at('2026-10-25T02:01:00Z');
 const {data}=await run({decisions:[{agent:'Neo',created_at:at('2026-10-25T00:10:00Z')},{agent:'Neo',created_at:at('2026-10-25T01:10:00Z')}]},now);
 assert.equal(data.hourRecords.records[0].points,10,'two 02:00 hours must not become 20 points');
 const midnight=await run({decisions:[{agent:'Neo',created_at:at('2026-09-04T21:59:59Z')},{agent:'Neo',created_at:at('2026-09-04T22:00:00Z')}]},at('2026-09-04T22:00:01Z'));
 assert.equal(midnight.data.hourRecords.records[0].end,at('2026-09-04T22:00:00Z'));
});
