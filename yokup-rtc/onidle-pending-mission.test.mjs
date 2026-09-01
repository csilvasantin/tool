import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {AGENT_SOURCE_SQL_T} from './src/mission-sources.js';
import {ONIDLE_BACK_OPTION, ONIDLE_CUSTOM_OPTION, isCanonicalOnIdleDecision,
  isCanonicalOnIdleOptions} from './src/onidle-decision-contract.js';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const MARKER = 'OnIdle horario';

function body(name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} incompleta`);
}

function harness(raceTicket) {
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE TABLE tickets(id TEXT,source TEXT,status TEXT,assignee TEXT,loc TEXT)");
  db.exec("CREATE TABLE mission_tasks(mission_id TEXT,status TEXT)");
  db.exec("CREATE TABLE onidle_ticks(identity_key TEXT,day TEXT,ordinal INTEGER,agent TEXT,machine TEXT,project_id TEXT,decision_id TEXT UNIQUE,status TEXT,reserved_at INTEGER,published_at INTEGER,PRIMARY KEY(identity_key,day,ordinal))");
  db.exec("CREATE TABLE decisions(id TEXT PRIMARY KEY,machine TEXT,agent TEXT,surface TEXT,question TEXT,options TEXT,recommended INTEGER,status TEXT,created_at INTEGER,deadline INTEGER,url TEXT,mission TEXT,project TEXT,project_slug TEXT,parent_decision TEXT,batch_id TEXT,option_targets TEXT)");
  const bound = (sql, args) => ({
    run:async () => ({meta:db.prepare(sql).run(...args)}),
    first:async () => db.prepare(sql).get(...args) || null,
    all:async () => ({results:db.prepare(sql).all(...args)})
  });
  let raced = false;
  const DB = {
    prepare(sql) { return {bind(...args) { return bound(sql,args); }, ...bound(sql,[])}; },
    async batch(statements) {
      if (!raced && raceTicket) {
        raced = true;
        db.prepare('INSERT INTO tickets VALUES(?,?,?,?,?)').run(raceTicket.id,raceTicket.source,raceTicket.status,raceTicket.assignee,raceTicket.loc);
      }
      db.exec('BEGIN');
      try { const out=[]; for (const statement of statements) out.push(await statement.run()); db.exec('COMMIT'); return out; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  };
  let checks = 0;
  const operationalOnIdleState = async () => {
    checks += 1;
    if (checks === 1) return {can_open:true,reason:'ready',quota:{used:0,remaining:8}};
    return {can_open:false,reason:'pending_mission',quota:{used:0,remaining:8}};
  };
  const factory = new Function('operationalOnIdleState','canonicalOnIdleProposals','madridDayKey',
    'onIdleTickDecisionId','ONIDLE_DAILY_LIMIT','ONIDLE_BACK_OPTION','ONIDLE_CUSTOM_OPTION',
    'isCanonicalOnIdleOptions','DECIDE_URL','ONIDLE_MISSION_MARKER','decisionProjectSlug',
    'AGENT_SOURCE_SQL_T','isCanonicalOnIdleDecision','ensureEntityDisplayRef',
    `${body('publishScheduledOnIdle')}; return publishScheduledOnIdle;`);
  const publish = factory(operationalOnIdleState, async () => ({ok:true,proposals:[
    {title:'Mejora A',target_mission_id:'A'}, {title:'Mejora B',target_mission_id:'B'},
    {title:'Mejora C',target_mission_id:'C'}]}), () => '2026-09-01', () => 'DEC-RACE', 8,
    ONIDLE_BACK_OPTION, ONIDLE_CUSTOM_OPTION, isCanonicalOnIdleOptions, 'https://yokup.com/decide',
    MARKER, (value) => value, AGENT_SOURCE_SQL_T, isCanonicalOnIdleDecision, async () => {});
  return {db, env:{DB}, publish};
}

const candidate = {identity:{agent:'OraculoMini',machine:'Mac Mini'}, project:{id:'yokup',name:'Yokup',slug:'yokup'},
  identity_key:'oraculomini@macmini'};

test('carrera guard→batch: fleet open propia impide publicar y no consume cupo', async () => {
  const {db,env,publish} = harness({id:'FLT-PENDING',source:'fleet',status:'open',assignee:'SubOraculoMini',loc:'admira-macmini'});
  const result = await publish(env,candidate,Date.UTC(2026,8,1,10));
  assert.equal(result.published,false);assert.equal(result.reason,'pending_mission');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM decisions').get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM onidle_ticks WHERE status='published'").get().n,0);
});

test('guard atómico no bloquea fleet ajena, otra máquina ni field propia', async () => {
  for (const row of [
    {id:'OTHER',source:'fleet',status:'open',assignee:'NeoMini',loc:'Mac Mini'},
    {id:'HOST',source:'fleet',status:'open',assignee:'OraculoMBP14',loc:'MacBook Pro 14'},
    {id:'FIELD',source:'field',status:'open',assignee:'OraculoMini',loc:'Mac Mini'}
  ]) {
    const {db,env,publish} = harness(row);
    assert.equal((await publish(env,candidate,Date.UTC(2026,8,1,10))).published,true,row.id);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM decisions').get().n,1,row.id);
  }
});

test('scheduler y petición manual propagan pending_mission sin crear otra decisión', () => {
  const scheduled = body('publishScheduledOnIdle');
  const manual = body('requestImmediateOnIdle');
  assert.match(scheduled,/if \(!state\.can_open\) return \{ ok:true, published:false, reason:state\.reason \}/);
  assert.match(scheduled,/concurrent\.reason/);
  assert.match(manual,/finishOnIdleRequest\(env, requestId, "blocked", \{ reason:operational\.reason \}/);
  assert.match(manual,/reason:published\.reason \|\| "scheduler_rejected"/);
});
