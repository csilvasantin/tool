import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {
  DAILY_MISSION_CLOSE_AUTHOR,
  DAILY_MISSION_CLOSE_EVENT_KIND,
  DAILY_MISSION_CLOSE_LEASE_MS,
  DAILY_MISSION_CLOSE_REASON,
  MISSION_UNCONCLUDED_AFTER_MS,
  dailyMissionCloseEventText,
  dailyMissionClosePlan
} from './src/daily-mission-close.js';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const pick = (re) => {
  const match = source.match(re);
  if (!match) throw new Error('función no encontrada: ' + re);
  return match[0];
};
const context = vm.createContext({
  crypto:globalThis.crypto, Math, Date, String, Number,
  DAILY_MISSION_CLOSE_AUTHOR, DAILY_MISSION_CLOSE_EVENT_KIND,
  DAILY_MISSION_CLOSE_LEASE_MS, DAILY_MISSION_CLOSE_REASON,
  MISSION_UNCONCLUDED_AFTER_MS,
  dailyMissionCloseEventText, dailyMissionClosePlan,
  MISSION_SCOPE_SQL_T:"(t.role='mission' OR t.source IN ('fleet','decision-batch','cli-declare'))"
});
vm.runInContext([
  pick(/async function acquireDailyMissionClose\(env, plan, now\) \{[^]*?\n\}/),
  pick(/async function runDailyMissionClose\(env, now = Date\.now\(\)\) \{[^]*?\n\}/),
  'globalThis.api={acquireDailyMissionClose,runDailyMissionClose};'
].join('\n'), context);
const {runDailyMissionClose} = context.api;

function makeEnv({failBatchOnce=false}={}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE tickets(id TEXT PRIMARY KEY,role TEXT,source TEXT,status TEXT,created_at INTEGER,updated_at INTEGER,live_at INTEGER,resolved_at INTEGER,closure_reason TEXT,closed_at INTEGER);
    CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id TEXT,ts INTEGER,kind TEXT,author TEXT,text TEXT);
    CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,status TEXT,updated_at INTEGER,PRIMARY KEY(mission_id,code));
    CREATE TABLE mission_daily_closures(day TEXT PRIMARY KEY,closed_at INTEGER NOT NULL,active_after INTEGER NOT NULL,status TEXT NOT NULL,lease_token TEXT,started_at INTEGER,finished_at INTEGER,cancelled_count INTEGER DEFAULT 0,error TEXT);
  `);
  const statement = (sql, args=[]) => ({sql,args,
    bind(...next) { return statement(sql,next); },
    async run() { const info=db.prepare(sql).run(...args); return {meta:{changes:info.changes}}; },
    async first() { return db.prepare(sql).get(...args) ?? null; },
    async all() { return {results:db.prepare(sql).all(...args)}; }
  });
  let fail = failBatchOnce;
  const DB = {
    prepare:(sql)=>statement(sql),
    async batch(statements) {
      if (fail) { fail=false; throw new Error('fallo simulado antes del lote'); }
      db.exec('BEGIN IMMEDIATE');
      try {
        const out=[];
        for (const item of statements) {
          const info=db.prepare(item.sql).run(...item.args);
          out.push({meta:{changes:info.changes}});
        }
        db.exec('COMMIT');
        return out;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  };
  return {_db:db,DB};
}

function addTicket(env, id, {role='mission',source='fleet',status='open',createdAt,updatedAt=createdAt,liveAt=null}) {
  env._db.prepare('INSERT INTO tickets(id,role,source,status,created_at,updated_at,live_at) VALUES(?,?,?,?,?,?,?)')
    .run(id,role,source,status,createdAt,updatedAt,liveAt);
}

test('el día cerrado y su medianoche son Europe/Madrid también con DST', () => {
  const summer=dailyMissionClosePlan(Date.UTC(2026,7,7,22,5));
  assert.deepEqual(summer,{day:'2026-08-07',closedAt:Date.UTC(2026,7,7,22)});
  const winter=dailyMissionClosePlan(Date.UTC(2026,0,14,23,5));
  assert.deepEqual(winter,{day:'2026-01-14',closedAt:Date.UTC(2026,0,14,23)});
});

test('sólo visible-v1 no concluidas pasan a cancelled con causa, fecha y evento exactos', async () => {
  const env=makeEnv(), now=Date.UTC(2026,7,7,22,5), plan=dailyMissionClosePlan(now);
  const activeAfter=now-MISSION_UNCONCLUDED_AFTER_MS, old=activeAfter-1, recent=activeAfter+1;
  addTicket(env,'old-progress',{status:'in_progress',createdAt:old});
  addTicket(env,'old-open',{source:'decision-batch',status:'open',createdAt:old});
  addTicket(env,'old-role',{source:'imported',status:'blocked',createdAt:old});
  addTicket(env,'old-legacy',{source:'fleet',status:'unconcluded',createdAt:old});
  addTicket(env,'old-seconds',{source:'cli-declare',status:'open',createdAt:Math.floor(old/1000)});
  addTicket(env,'recent-real',{status:'in_progress',createdAt:recent});
  addTicket(env,'recent-live',{status:'in_progress',createdAt:old,liveAt:now-5000});
  addTicket(env,'recent-task',{status:'in_progress',createdAt:old});
  env._db.prepare("INSERT INTO mission_tasks VALUES('recent-task','a','in_progress',?)").run(now-5000);
  addTicket(env,'recent-event',{status:'in_progress',createdAt:old});
  env._db.prepare("INSERT INTO events(ticket_id,ts,kind,author,text) VALUES('recent-event',?,'note','Agente','avance real')").run(now-5000);
  addTicket(env,'resolved',{status:'resolved',createdAt:old});
  addTicket(env,'already-cancelled',{status:'cancelled',createdAt:old});
  addTicket(env,'field-ticket',{role:'screen',source:null,status:'open',createdAt:old});

  const result=await runDailyMissionClose(env,now);
  assert.equal(result.ok,true);
  assert.equal(result.cancelled_count,5);
  const changed=env._db.prepare("SELECT id,status,closure_reason,closed_at FROM tickets WHERE closure_reason='daily_cleanup' ORDER BY id").all();
  assert.deepEqual(changed.map((r)=>r.id),['old-legacy','old-open','old-progress','old-role','old-seconds']);
  assert.ok(changed.every((r)=>r.status==='cancelled' && r.closure_reason==='daily_cleanup' && r.closed_at===plan.closedAt));
  assert.equal(env._db.prepare("SELECT status FROM tickets WHERE id='recent-real'").get().status,'in_progress');
  assert.equal(env._db.prepare("SELECT status FROM tickets WHERE id='recent-live'").get().status,'in_progress');
  assert.equal(env._db.prepare("SELECT status FROM tickets WHERE id='recent-task'").get().status,'in_progress');
  assert.equal(env._db.prepare("SELECT status FROM tickets WHERE id='recent-event'").get().status,'in_progress');
  assert.equal(env._db.prepare("SELECT status FROM tickets WHERE id='resolved'").get().status,'resolved');
  assert.equal(env._db.prepare("SELECT status FROM tickets WHERE id='field-ticket'").get().status,'open');
  const events=env._db.prepare("SELECT kind,author,text FROM events WHERE author='yokup' AND text LIKE '%cierre_diario%' ORDER BY ticket_id").all();
  assert.equal(events.length,5);
  assert.ok(events.every((e)=>e.kind==='status' && e.author==='yokup' && e.text==='Estado → cancelled · cierre_diario · día 2026-08-07'));
});

test('repetir el mismo día es no-op y el reciente puede cerrarse al día siguiente', async () => {
  const env=makeEnv(), firstNow=Date.UTC(2026,7,7,22,5), first=dailyMissionClosePlan(firstNow);
  addTicket(env,'late',{status:'in_progress',createdAt:first.closedAt-5*60000});
  await runDailyMissionClose(env,firstNow);
  const repeated=await runDailyMissionClose(env,firstNow+3600000);
  assert.equal(repeated.skipped,true);
  assert.equal(env._db.prepare('SELECT COUNT(*) n FROM events').get().n,0);
  const next=await runDailyMissionClose(env,Date.UTC(2026,7,8,22,5));
  assert.equal(next.cancelled_count,1);
  assert.equal(env._db.prepare("SELECT status FROM tickets WHERE id='late'").get().status,'cancelled');
  assert.equal(env._db.prepare('SELECT COUNT(*) n FROM events').get().n,1);
});

test('un fallo queda auditable y el siguiente tick recupera sin duplicar', async () => {
  const env=makeEnv({failBatchOnce:true}), now=Date.UTC(2026,7,7,22,5), plan=dailyMissionClosePlan(now);
  addTicket(env,'retry',{status:'open',createdAt:now-MISSION_UNCONCLUDED_AFTER_MS-1});
  addTicket(env,'retry-active',{status:'in_progress',createdAt:now-MISSION_UNCONCLUDED_AFTER_MS-1});
  await assert.rejects(runDailyMissionClose(env,now),/fallo simulado/);
  assert.equal(env._db.prepare('SELECT status FROM mission_daily_closures').get().status,'error');
  const retryNow=now+45*60000;
  env._db.prepare("UPDATE tickets SET live_at=? WHERE id='retry-active'").run(retryNow-5*60000);
  const recovered=await runDailyMissionClose(env,retryNow);
  assert.equal(recovered.ok,true);
  assert.equal(recovered.cancelled_count,1);
  assert.equal(env._db.prepare("SELECT status FROM tickets WHERE id='retry-active'").get().status,'in_progress');
  assert.equal(env._db.prepare('SELECT COUNT(*) n FROM events').get().n,1);
});

test('un lease fresco no se pisa y uno huérfano se recupera al caducar', async () => {
  const env=makeEnv(), now=Date.UTC(2026,7,7,22,5), plan=dailyMissionClosePlan(now);
  addTicket(env,'orphan',{status:'open',createdAt:now-MISSION_UNCONCLUDED_AFTER_MS-1});
  env._db.prepare("INSERT INTO mission_daily_closures(day,closed_at,active_after,status,lease_token,started_at,cancelled_count,error) VALUES(?,?,?,'running','dead',?,0,'')")
    .run(plan.day,plan.closedAt,now-MISSION_UNCONCLUDED_AFTER_MS,now);
  const fresh=await runDailyMissionClose(env,now+1000);
  assert.equal(fresh.skipped,true);
  assert.equal(fresh.status,'running');
  assert.equal(env._db.prepare("SELECT status FROM tickets WHERE id='orphan'").get().status,'open');
  env._db.prepare('UPDATE mission_daily_closures SET started_at=? WHERE day=?').run(now-DAILY_MISSION_CLOSE_LEASE_MS-1,plan.day);
  const recovered=await runDailyMissionClose(env,now+2000);
  assert.equal(recovered.ok,true);
  assert.equal(env._db.prepare("SELECT status FROM tickets WHERE id='orphan'").get().status,'cancelled');
});

test('dos isolates concurrentes sólo conceden un lease para el mismo día', async () => {
  const env=makeEnv(), now=Date.UTC(2026,7,7,22,5), plan=dailyMissionClosePlan(now);
  addTicket(env,'race',{status:'open',createdAt:now-MISSION_UNCONCLUDED_AFTER_MS-1});
  const results=await Promise.all([runDailyMissionClose(env,now),runDailyMissionClose(env,now)]);
  assert.equal(results.filter((r)=>r.skipped===false).length,1);
  assert.equal(env._db.prepare('SELECT COUNT(*) n FROM events').get().n,1);
  assert.equal(env._db.prepare('SELECT COUNT(*) n FROM mission_daily_closures').get().n,1);
});

test('schema, cron y endpoint exponen el contrato sin hard-delete', () => {
  assert.match(source,/ALTER TABLE tickets ADD COLUMN closure_reason TEXT/);
  assert.match(source,/ALTER TABLE tickets ADD COLUMN closed_at INTEGER/);
  assert.match(source,/await step\("dailyMissionClose", \(\) => runDailyMissionClose\(env\)\)/);
  assert.match(source,/url\.pathname === "\/fleet\/daily-close"/);
  const fn=pick(/async function runDailyMissionClose\(env, now = Date\.now\(\)\) \{[^]*?\n\}/);
  assert.doesNotMatch(fn,/DELETE FROM tickets/);
});
