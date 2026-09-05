import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {htmlFunction} from './highscore-race-test-support.mjs';
const html=fs.readFileSync(new URL('./highscore.html',import.meta.url),'utf8');
const c=vm.createContext({});vm.runInContext(['hsWorkEvidenceStatus','hsRankingScopeSummary','hsRankingSourceWarning'].map(n=>htmlFunction(html,n)).join('\n'),c);
test('an unavailable work feed cannot masquerade as a verified empty or inactive fleet',()=>{
 const r=c.hsWorkEvidenceStatus(false,0,0,'active');assert.equal(r.label,'TRABAJO NO DISPONIBLE');assert.match(r.text,/No se pudo consultar/);assert.match(r.text,/no indica inactividad/);assert.doesNotMatch(r.label,/INACTIV|SIN TRABAJO ASIGNADO/);
});
test('a manual scope hiding every verified participant explains the filter rather than declaring no work',()=>{
 const r=c.hsWorkEvidenceStatus(true,7,0,'active');assert.equal(r.label,'TRABAJO FUERA DE LA SELECCIÓN');assert.match(r.text,/0 de 7/);assert.match(r.text,/filtro de agentes/);assert.doesNotMatch(r.text,/No hay trabajo|inactivo/);
});
test('empty verified data acknowledges unlinked sessions, while recent history is never called current work',()=>{
 const empty=c.hsWorkEvidenceStatus(true,0,0,'active');assert.equal(empty.label,'SIN TRABAJO VERIFICADO');assert.match(empty.text,/actividad todavía sin vincular/);
 const recent=c.hsWorkEvidenceStatus(true,2,2,'recent');assert.match(recent.text,/finalizados/);assert.match(recent.text,/actividad actual.*no está verificada/);
 const active=c.hsWorkEvidenceStatus(true,2,2,'active');assert.match(active.text,/ausencia.*no confirma inactividad/);
});
test('scope count, life filter, and compact display remain distinguishable with stale source warnings',()=>{
 const summary=c.hsRankingScopeSummary('manual',4,39,true,2);assert.match(summary,/Selección manual.*4\/39/);assert.match(summary,/filtro con vida/);assert.match(summary,/2 filas visibles \(compacto\)/);
 assert.equal(c.hsRankingSourceWarning('week',true,false),'Histórico sin actualizar; pueden faltar agentes o puntos.');assert.equal(c.hsRankingSourceWarning('day',true,false),'');assert.match(c.hsRankingSourceWarning('day',false,true),/Puntuación del día sin actualizar/);
});
test('real 20s scheduling refreshes work across a paused 42s score cycle, hiding and resuming safely',async()=>{
 let now=0,seq=0,fetches=0,paints=0;const timers=new Map(),listeners={};
 const timer=(cb,ms,interval=false)=>{const id=++seq;timers.set(id,{cb,at:now+ms,ms,interval});return id;};
 const ctx=vm.createContext({Promise,AbortController,datos:{},workRequest:null,workRequestSequence:0,WORK_TIMEOUT_MS:8000,WORK_POLL_MS:20000,YK:'https://qa.invalid',carreraPausada:true,document:{hidden:false,addEventListener:(event,fn)=>listeners[event]=fn},window:{setInterval:(cb,ms)=>timer(cb,ms,true)},setTimeout:(cb,ms)=>timer(cb,ms),clearTimeout:id=>timers.delete(id),performance:{now:()=>now},normaliza:v=>String(v||''),fetch:async()=>{fetches++;return{ok:true,json:async()=>({ok:true,participants:[{agent:'Work'+fetches}],generated_at:now})};},hsPaintWorkUpdate:()=>paints++});
 vm.runInContext(['hsApplyWorkSnapshot','hsRefreshWork','hsPollWork'].map(n=>htmlFunction(html,n)).join('\n'),ctx);
 const scheduling=html.match(/window\.setInterval\(hsPollWork, WORK_POLL_MS\);\s*document\.addEventListener\("visibilitychange", function \(\) \{ if \(!document\.hidden\) hsPollWork\(\); \}\);/);assert.ok(scheduling);vm.runInContext(scheduling[0],ctx);
 async function advance(ms){const end=now+ms;for(;;){const next=[...timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;const[id,t]=next;now=t.at;if(t.interval)t.at+=t.ms;else timers.delete(id);t.cb();for(let n=0;n<12;n++)await Promise.resolve();}now=end;}
 await advance(42000);assert.equal(fetches,2);assert.equal(paints,2);assert.equal(ctx.carreraPausada,true);assert.equal(ctx.datos.trabajos[0].agent,'Work2');
 ctx.document.hidden=true;await advance(20000);assert.equal(fetches,2);
 ctx.document.hidden=false;listeners.visibilitychange();await ctx.workRequest;assert.equal(fetches,3);assert.equal(paints,3);
});
