import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const box={module:{exports:{}}};vm.runInNewContext(readFileSync(new URL('./highscore-work-clock.js',import.meta.url),'utf8'),box);const clock=box.module.exports;
const html=readFileSync(new URL('./highscore.html',import.meta.url),'utf8');

test('caso0970: hora cierre10:15:44 corresponde a duración00:20:52; no crece tras terminar',()=>{const row={state:'last_work',work_started_at:1788594891766,ended_at:1788596144650,elapsed_ms:1252884};assert.equal(clock.clock(row,1788596200000,0).label,'00:20:52');assert.equal(clock.clock(row,1788596200000,86400000).missionDurationMs,1252884);assert.equal(clock.clock(row,1788696200000,86400000).label,'00:20:52');});

test('mismo intervalo real en epoch segundos, milisegundos o mezcla, sin normalizar duración como epoch',()=>{const start=1788594891766,end=1788596144650;for(const a of [start,start/1000])for(const b of [end,end/1000])assert.equal(clock.clock({state:'last_work',work_started_at:a,ended_at:b},end/1000,0).label,'00:20:52');assert.equal(clock.durationMs(37433),37433);});

test('Oraculo activo avanza desde muestra servidor y delta monotónico, sin usar hora local',()=>{const start=1788596378040,anchor=start+37433,row={state:'running',work_started_at:start,ended_at:null,elapsed_ms:37433};assert.equal(clock.clock(row,anchor,0).label,'00:00:37');assert.equal(clock.clock(row,anchor/1000,1000).label,'00:00:38');assert.equal(row.elapsed_ms,37433);});

test('Jobs sin señal mantiene el último transcurrido medido; no se llama finalizado ni sigue el tick',()=>{const row={state:'assigned_stale',work_started_at:1788594717069,ended_at:null,elapsed_ms:1698404};for(const delta of [0,1000,600000]){const out=clock.clock(row,1788596415473,delta);assert.equal(out.label,'00:28:18');assert.equal(out.closed,false);assert.equal(out.running,false);assert.equal(out.basis,'sampled');}});

test('null, ausencia, intervalo inverso y futuro no fabrican cero o una duración desde medianoche',()=>{for(const value of [null,undefined,'',NaN,-1,Infinity])assert.equal(clock.durationMs(value),null);assert.equal(clock.clock({state:'last_work',ended_at:1788596415473},1788596415473,1).label,'—');assert.equal(clock.clock({state:'running',elapsed_ms:null},1788596415473,1).label,'—');assert.equal(clock.clock({state:'running',work_started_at:1788696415473},1788596415473,1).label,'—');assert.equal(clock.clock({state:'last_work',work_started_at:1788696415473,ended_at:1788596415473},1788796415473,1).label,'—');assert.equal(clock.label(0),'00:00:00');});

test('cambio de día o DST mide intervalo UTC real y no una hora de pared',()=>{for(const [start,end] of [['2026-03-29T00:30:00Z','2026-03-29T01:30:00Z'],['2026-10-25T00:30:00Z','2026-10-25T01:30:00Z'],['2026-09-04T23:50:00Z','2026-09-05T00:10:00Z']]){const out=clock.clock({state:'last_work',work_started_at:Date.parse(start),ended_at:Date.parse(end)},Date.parse(end),12345);assert.equal(out.missionDurationMs,Date.parse(end)-Date.parse(start));}});

test('estructura alinea proyecto con nombre, preserva contexto hover/foco y pone avisos al pie',()=>{assert.ok(html.indexOf('id="raceEvidenceStatus"')>html.indexOf('id="formula"'));assert.ok(html.indexOf('id="raceEvidenceStatus"')<html.indexOf('id="workObservations"'));assert.match(html,/\.refresh-agent-meta\{display:flex;align-items:baseline;gap:5px;flex-wrap:nowrap\}/);assert.match(html,/data-race-time="duration"/);assert.match(html,/Duración final/);assert.match(html,/Transcurrido hasta la última consulta; actividad sin verificar/);assert.match(html,/tabindex="0" title="'\+esc\(timingTitle\)/);assert.match(html,/refresh-agent-tooltip/);assert.match(html,/@media\(max-width:340px\)[^\n]*minmax\(110px,130px\)/);});

test('fin futuro y running con cierre contradictorio no producen un reloj que siga contando',()=>{const at=1788596415473;for(const row of [{state:'last_work',work_started_at:at-1000,ended_at:at+60000},{state:'running',work_started_at:at-1000,ended_at:at}]){const out=clock.clock(row,at,1000);assert.equal(out.label,'—');assert.equal(out.running,false);assert.equal(out.invalid,true);}});

test('epoch fuera del rango Date se descarta antes de renderizar datetime',()=>{assert.equal(clock.epochMs(1e20),null);assert.equal(clock.epochMs(Infinity),null);assert.equal(clock.epochMs(true),null);});
