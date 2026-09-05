import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import api from './highscore-daily-record.js';
const html=await readFile(new URL('./highscore.html',import.meta.url),'utf8');
const row=(day,agent,points)=>({day,top:[{agent,points}]});
const current=[{agent:'Neo14',points:120},{agent:'NeoMini',points:0}];
const now=Date.parse('2026-09-07T10:00:00Z');
test('records follow closed day, Monday week and calendar month, excluding the current period',()=>{
 const p={all_days:[row('2026-08-30','Neo14',70),row('2026-08-31','Neo14',80),row('2026-09-01','Neo14',60),row('2026-09-06','Neo14',30),row('2026-09-07','Neo14',9999)]};
 assert.equal(api.periodRecord(p,'day',now,current).record.points,80);
 assert.equal(api.periodRecord(p,'week',now,current).record.points,170);
 assert.equal(api.periodRecord(p,'week',now,current).record.day,'2026-08-31');
 assert.equal(api.periodRecord(p,'month',now,current).record.points,150);
 assert.equal(api.periodRecord(p,'month',now,current).record.day,'2026-08-01');
 assert.equal(api.periodRecord(p,'month',now,current).leader.points,120);
});
test('scope and physical identity match the podium; another machine cannot donate a record',()=>{
 const p={all_days:[{day:'2026-09-06',top:[{agent:'Neo14',points:40},{agent:'NeoMini',points:900}]}]};
 const a=api.periodRecord(p,'day',now,[current[0]]);
 assert.equal(a.record.points,40);assert.equal(a.remaining,0);assert.equal(a.beatenBy,80);
 assert.equal(api.periodRecord(p,'day',now,[]).available,false);
});
test('hour uses the exact factual hour record, never historical daily totals',()=>{
 const p={all_days:[row('2026-09-06','Neo14',9000)],hour_records:{coverage:{source:'retained_facts',start_at:now-86400000},records:[{agent:'Neo14',start:now-7200000,end:now-3600000,points:30},{agent:'Neo14',start:now,end:now+3600000,points:9999}]}};
 const a=api.periodRecord(p,'hour',now,current);
 assert.equal(a.record.points,30);assert.equal(a.target,31);assert.equal(a.coverage.source,'retained_facts');
 assert.equal(api.periodRecord({all_days:p.all_days},'hour',now,current).sourceAvailable,false);
});
test('Madrid midnight, week and DST use civil boundaries rather than browser timezone',()=>{
 const p={all_days:[row('2026-09-06','Neo14',60),row('2026-09-07','Neo14',999)]};
 assert.equal(api.periodRecord(p,'day',Date.parse('2026-09-06T22:01:00Z'),current).record.points,60);
 assert.equal(api.periodKey('2026-09-06','week'),'2026-08-31');
 assert.equal(api.periodKey('2026-09-07','week'),'2026-09-07');
 assert.equal(api.periodKey('2026-10-25','week'),'2026-10-19');
 const dst={hour_records:{records:[{agent:'Neo14',start:Date.parse('2026-10-25T00:00:00Z'),end:Date.parse('2026-10-25T01:00:00Z'),points:40}]}};
 assert.equal(api.periodRecord(dst,'hour',Date.parse('2026-10-25T01:30:00Z'),current).record.points,40);
});
test('header changes score and podium only, preserves ranking, race and selection on refresh',()=>{
 const start=html.indexOf('  function cambiaPeriodoHighscore('),end=html.indexOf('\n  function rotuloPeriodoPodio',start);
 const calls=[];const c=vm.createContext({PODIUM_PERIOD:'day',RANKING_PERIOD:'week',listaCache:current,
 actualizaPeriodoHighscore:()=>calls.push('control'),pintaRecordDiario:()=>calls.push('record'),pintaPodio:()=>calls.push('podium'),
 document:{getElementById:()=>({hidden:true})},actualizaCarreraPodio:()=>{throw Error('must not touch live race')},pintaTabla:()=>{throw Error('must not touch independent ranking')},dibujaPodio:()=>calls.push('art')});
 vm.runInContext(html.slice(start,end),c);
 c.cambiaPeriodoHighscore(1);assert.equal(c.PODIUM_PERIOD,'week');assert.equal(c.RANKING_PERIOD,'week');assert.deepEqual(calls,['control','record','podium']);
 c.cambiaPeriodoHighscore(0,'hour');assert.equal(c.PODIUM_PERIOD,'hour');
 c.cambiaPeriodoHighscore(-1);assert.equal(c.PODIUM_PERIOD,'month');
 const refreshStart=html.indexOf('  async function actualizaMarcador(');
 if(refreshStart>=0) assert.doesNotMatch(html.slice(refreshStart,html.indexOf('\n  function ',refreshStart+10)),/PODIUM_PERIOD\s*=/);
});
test('fresh page defaults day and only header owns the accessible selector',()=>{
 assert.match(html,/var PODIUM_PERIOD = "day"/);
 const header=html.slice(html.indexOf('<h1 class="score-divider"'),html.indexOf('</h1>',html.indexOf('<h1 class="score-divider"')));
 assert.match(header,/id="highscorePeriod"[^>]*role="group"/);assert.match(header,/aria-controls="dailyRecord podio"/);
 assert.equal((header.match(/data-highscore-period-step=/g)||[]).length,2);
 assert.doesNotMatch(html,/data-podium-period=/);
 assert.match(html,/event\.key==="Home"/);assert.match(html,/event\.key==="End"/);
});
