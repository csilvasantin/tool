import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {missionDayRange, missionVisibleCounts, missionVisibleDetails, missionVisibleState,
  onIdleEligibility, taskVisibleDetails} from './src/mission-visible.js';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');

test('sólo el trabajo activo cruza a no concluido; el backlog pendiente no envejece', () => {
  const now = Date.UTC(2026, 7, 7, 8);
  const old = now - 61 * 60 * 1000;
  const rows = [
    ...Array.from({length:200}, (_, index) => ({id:'P'+index, status:'in_progress', created_at:old})),
    ...Array.from({length:94}, (_, index) => ({id:'O'+index, status:'open', assignee:'Agente', created_at:old}))
  ].map((row) => ({...row, visible_state:missionVisibleState(row, now)}));
  const counts = missionVisibleCounts(rows);
  assert.equal(rows.filter((row) => row.status === 'in_progress').length, 200);
  assert.equal(counts.in_progress, 0);
  assert.equal(counts.pending, 94);
  assert.equal(counts.unconcluded, 200);
  assert.equal(counts.total, rows.length);
});

test('estado visible tiene una única precedencia y cuenta exactamente las filas', () => {
  const now = Date.UTC(2026, 7, 7, 10);
  const recent = now - 5 * 60 * 1000;
  const rows = [
    {status:'open', created_at:recent},
    {status:'open', assignee:'NeoMacMini', created_at:recent},
    {status:'open', assignee:'NeoMacMini', created_at:recent, touched:true},
    {status:'in_progress', created_at:recent},
    {status:'resolved', created_at:1},
    {status:'cancelled', created_at:1}
  ].map((row) => ({...row, visible_state:missionVisibleState(row, now, row.touched)}));
  assert.deepEqual(rows.map((row) => row.visible_state), [
    'unassigned', 'pending', 'in_progress', 'in_progress', 'resolved', 'cancelled'
  ]);
  assert.deepEqual(missionVisibleCounts(rows), {
    unassigned:1, pending:1, in_progress:2, unconcluded:0, resolved:1, cancelled:1, total:6
  });
});

test('el reloj duro no se renueva con heartbeats y el corte exacto es 60:00', () => {
  const now=Date.UTC(2026,7,7,10), old=now-24*3600000, recent=now-5000;
  assert.equal(missionVisibleState({status:'in_progress',created_at:old,updated_at:recent},now),'unconcluded');
  assert.equal(missionVisibleState({status:'in_progress',created_at:old,live_at:recent},now),'unconcluded');
  assert.equal(missionVisibleState({status:'in_progress',created_at:now-3599999},now),'in_progress');
  assert.equal(missionVisibleState({status:'in_progress',created_at:now-3600000},now),'unconcluded');
  assert.equal(missionVisibleState({status:'in_progress',created_at:old,started_at:recent},now),'in_progress');
  assert.equal(missionVisibleState({status:'open',created_at:old},now,{activity_at:recent,active_since:recent}),'in_progress');
  assert.equal(missionVisibleState({status:'unconcluded',created_at:old},now),'unconcluded');
  assert.match(source,/MIN\(CASE WHEN status IN \('in_progress','done','resolved'\)/);
  assert.match(source,/SELECT ticket_id mission_id,MAX\(ts\) activity_at FROM events/);
});

test('tarea activa comparte 59:59, 60:00, repetición y estados terminales', () => {
  const now=Date.UTC(2026,7,7,10), at=now-3600000;
  assert.equal(taskVisibleDetails({status:'in_progress',started_at:now-3599999},now).state,'in_progress');
  const first=taskVisibleDetails({status:'in_progress',started_at:at,updated_at:now-1},now);
  assert.equal(first.state,'unconcluded');
  assert.deepEqual(taskVisibleDetails({status:'in_progress',started_at:at,updated_at:now},now),first);
  assert.equal(taskVisibleDetails({status:'done',started_at:1},now).state,'done');
  assert.equal(taskVisibleDetails({status:'cancelled',started_at:1},now).state,'cancelled');
});

test('OnIdle bloquea sólo trabajo visible fresco, decisión viva o cupo 8/día', () => {
  const now=Date.UTC(2026,7,7,10), fresh=now-3599999, expired=now-3600000;
  assert.equal(onIdleEligibility({missions:[{status:'in_progress',created_at:fresh}],now}).reason,'active_mission');
  assert.equal(onIdleEligibility({tasks:[{status:'in_progress',started_at:fresh}],now}).reason,'active_task');
  const ready=onIdleEligibility({missions:[{status:'in_progress',created_at:expired}],
    tasks:[{status:'in_progress',started_at:expired}],windows_today:7,now});
  assert.equal(ready.can_open,true);
  assert.deepEqual(ready.unconcluded,{missions:1,tasks:1});
  assert.equal(onIdleEligibility({live_decisions:1,now}).reason,'live_decision');
  assert.equal(onIdleEligibility({windows_today:8,now}).reason,'daily_limit');
});

test('day usa medianoche real de Madrid y es opcional', () => {
  const summer = missionDayRange('2026-08-07');
  assert.equal(new Date(summer.start).toISOString(), '2026-08-06T22:00:00.000Z');
  assert.equal(new Date(summer.end).toISOString(), '2026-08-07T22:00:00.000Z');
  const winter = missionDayRange('2026-12-07');
  assert.equal(new Date(winter.start).toISOString(), '2026-12-06T23:00:00.000Z');
  assert.equal(missionDayRange('07/08/2026'), null);
  assert.equal(missionDayRange(''), null);
});

test('/tickets devuelve contrato aditivo sobre el mismo universo y página', () => {
  const endpoint = source.slice(source.indexOf('if (url.pathname === "/tickets")'), source.indexOf('if (url.pathname === "/tasks/all")'));
  assert.match(endpoint, /day:url\.searchParams\.get\("day"\) \|\| ""/);
  assert.match(endpoint, /project_id:url\.searchParams\.get\("project_id"\) \|\| ""/);
  assert.match(endpoint, /tickets:page\.rows/);
  assert.match(endpoint, /visible_counts:page\.visible_counts, universe:page\.universe/);
  assert.match(source, /visible_state = visible\.state/);
  assert.match(source, /returned:rows\.length, total, has_more:/);
  assert.match(source, /state_semantics:"visible-v1", source_semantics:"mission-role-or-agent-source-v1"/);
});

test('scope visible incluye role mission sin cambiar el contrato del highscore', () => {
  assert.match(source, /var MISSION_SCOPE_SQL = "\(role='mission' OR source IN \('fleet','decision-batch','cli-declare'\)\)"/);
  assert.match(source, /var MISSION_SCOPE_SQL_T = "\(t\.role='mission' OR t\.source IN \('fleet','decision-batch','cli-declare'\)\)"/);
  assert.match(source, /var AGENT_SOURCE_SQL = "source IN \('fleet','decision-batch','cli-declare'\)"/);
  assert.match(source, /COALESCE\(t\.role,''\)!='mission'/);
});

test('menú declara explícitamente alcance global y la misma semántica visible', () => {
  const menu = source.slice(source.indexOf('async function menuCounters'), source.indexOf('__name(menuCounters'));
  assert.match(menu, /universe:"all_backlog", state_semantics:"visible-v1"/);
  assert.match(menu, /no_concluidas:0, sin_asignar:0/);
  assert.match(menu, /t\.status NOT IN \('resolved','cancelled'\)/);
  assert.match(menu, /mission_tasks m WHERE m\.mission_id=t\.id AND m\.status IN \('in_progress','done','resolved'\)/);
  assert.match(menu, /COALESCE\(t\.started_at,t\.created_at\)<4102444800/);
  assert.match(menu, /COALESCE\(started_at,updated_at,created_at\)<4102444800/);
});
