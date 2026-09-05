import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import record from './highscore-daily-record.js';
const html=fs.readFileSync(new URL('./highscore.html',import.meta.url),'utf8');
function extract(name){const start=html.indexOf(`function ${name}(`),brace=html.indexOf('{',start);assert.ok(start>=0,name);let n=0,q='',e=false;for(let i=brace;i<html.length;i++){const c=html[i];if(q){if(e)e=false;else if(c==='\\')e=true;else if(c===q)q='';continue;}if(['"',"'",'`'].includes(c)){q=c;continue;}if(c==='{')n++;else if(c==='}'&&!--n)return html.slice(start,i+1);}throw Error(name);}
const top=(day,a,b)=>({day,top:[{agent:'OraculoMacMini',points:a},...(b==null?[]:[{agent:'TrinityMBP14',points:b}])]});
const payload={all_days:[top('2026-08-30',15),top('2026-08-31',30,40),top('2026-09-01',10,50),top('2026-09-05',20,5),top('2026-09-06',3,7),top('2026-09-07',999,999)]};
const rows=[{agent:'OraculoMacMini',points:7},{agent:'TrinityMBP14',points:12}];
test('records use Madrid calendar boundaries and closed comparable periods, retaining scope',()=>{
 const now=Date.parse('2026-09-06T22:30:00Z'); // Monday in Madrid, still Sunday UTC.
 const day=record.periodRecord(payload,'day',now,rows);assert.equal(day.record.agent,'TrinityMBP14');assert.equal(day.record.points,50);assert.equal(day.leader.points,12);
 const week=record.periodRecord(payload,'week',now,rows);assert.equal(week.record.points,102);assert.equal(week.record.day,'2026-08-31');
 const month=record.periodRecord(payload,'month',now,rows);assert.equal(month.record.points,45);assert.equal(month.record.agent,'OraculoMacMini');
 const scoped=record.periodRecord(payload,'week',now,[rows[0]]);assert.equal(scoped.record.points,63);assert.equal(scoped.record.agent,'OraculoMacMini');
});
test('hour comparison preserves both autumn repeated hours and excludes the open hour',()=>{
 const start=Date.parse('2026-10-25T00:00:00Z'),hour=3600000;
 const p={...payload,hour_records:{records:[{agent:rows[0].agent,start,end:start+hour,points:12},{agent:rows[0].agent,start:start+hour,end:start+2*hour,points:24},{agent:rows[0].agent,start:start+2*hour,end:start+3*hour,points:999}],coverage:{source:'retained_facts'}}};
 const r=record.periodRecord(p,'hour',start+2.5*hour,rows);assert.equal(r.record.points,24);assert.equal(r.record.start,start+hour);assert.equal(r.period,'hour');
 const unavailable=record.periodRecord(payload,'hour',start+2.5*hour,rows);assert.equal(unavailable.available,false);assert.equal(unavailable.sourceAvailable,false);assert.equal(unavailable.record,null,'daily facts never substitute for an unavailable hourly record');
});
test('Highscore selector redraws only its marker/podium without changing Ranking or live race',()=>{
 const calls=[],nodes={podio:{hidden:false},highscorePeriod:{dataset:{},setAttribute(){}},highscorePeriodValue:{textContent:''}};
 const ctx=vm.createContext({PODIUM_PERIOD:'day',RANKING_PERIOD:'month',listaCache:[{agente:'OraculoMacMini'}],document:{getElementById:id=>nodes[id]},rotuloPeriodoRanking:x=>({day:'Día',hour:'Hora',week:'Semana',month:'Mes'})[x],pintaRecordDiario:()=>calls.push('record'),pintaPodio:()=>calls.push('podium'),dibujaPodio:()=>calls.push('draw'),brazosBajos:false,actualizaCarreraPodio:()=>{throw Error('live race must not be changed');},localStorage:{setItem:()=>{throw Error('no preference mutation');}}});
 vm.runInContext(extract('actualizaPeriodoHighscore')+'\n'+extract('cambiaPeriodoHighscore'),ctx);
 ctx.cambiaPeriodoHighscore(-1);assert.equal(ctx.PODIUM_PERIOD,'hour');assert.equal(ctx.RANKING_PERIOD,'month');assert.equal(nodes.highscorePeriodValue.textContent,'HORA');
 ctx.cambiaPeriodoHighscore(0,'week');assert.equal(ctx.PODIUM_PERIOD,'week');assert.equal(ctx.RANKING_PERIOD,'month');assert.deepEqual(calls,['record','podium','draw','record','podium','draw']);
});
