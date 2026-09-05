import { groupingIdentityKey } from './agent-identity.js';
// One shared race, selected by Yokup, with a permanent +1 event per victory.
// The browser cannot choose the winner, mission, timestamp or points.
export const RACE_MS = 42000;
export const WIN_MS = 23000; // 3 s READY/SET/GO + winner's 20 s sprint.
export const RACE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS highscore_running_rounds (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, roster TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS highscore_running_rounds_time ON highscore_running_rounds(started_at)`,
  `CREATE INDEX IF NOT EXISTS race_bonus_time ON events(ts,author,ticket_id) WHERE kind='race_bonus'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS race_bonus_once ON events(text) WHERE kind='race_bonus'`
];
export function raceRoster(participants, random = Math.random, previous = '') {
  const seen = new Set();
  const rows = (participants || []).filter(row => {
    if (row.state !== 'running' || !['mission','task'].includes(row.kind) || !row.reference || seen.has(row.family_key)) return false;
    seen.add(row.family_key); return true;
  }).map(row => ({agent:row.agent, machine:row.machine, family_key:row.family_key,
    reference:row.reference, mission_id:row.kind === 'task' ? row.reference.split(':')[0] : row.reference,
    project_id:row.project_id || '', kind:row.kind}));
  for (let i=rows.length-1;i>0;i--) { const j=Math.floor(random()*(i+1)); [rows[i],rows[j]]=[rows[j],rows[i]]; }
  if (rows.length>1 && rows[0].family_key===previous) [rows[0],rows[1]]=[rows[1],rows[0]];
  return rows;
}
export async function raceBonus(env, body, activeWork, now = Date.now()) {
  for (const sql of RACE_SCHEMA) await env.DB.prepare(sql).run();
  const action = body && body.action;
  const publicRace = row => ({id:row.id,started_at:row.started_at,finish_at:row.started_at+WIN_MS,
    ends_at:row.started_at+RACE_MS,server_now:now,roster:JSON.parse(row.roster),bonus_points:1});
  if (action === 'start') {
    let row = await env.DB.prepare('SELECT * FROM highscore_running_rounds ORDER BY started_at DESC LIMIT 1').first();
    if (!row || row.started_at+RACE_MS<=now) {
      const previous = row ? JSON.parse(row.roster)[0]?.family_key || '' : '';
      const roster = raceRoster((await activeWork()).participants, () => crypto.getRandomValues(new Uint32Array(1))[0]/4294967296, previous);
      // A single SQL statement arbitrates simultaneous starts in D1. Tabs never
      // create independent lotteries. Empty rounds also last the full 42 s.
      await env.DB.prepare(`INSERT INTO highscore_running_rounds(id,started_at,roster)
        SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM highscore_running_rounds WHERE started_at>?)`)
        .bind(crypto.randomUUID(),now,JSON.stringify(roster),now-RACE_MS).run();
      row = await env.DB.prepare('SELECT * FROM highscore_running_rounds ORDER BY started_at DESC LIMIT 1').first();
      await env.DB.prepare('DELETE FROM highscore_running_rounds WHERE started_at<?').bind(now-86400000).run();
    }
    return {ok:true,race:publicRace(row)};
  }
  if (action !== 'finish' || typeof body.race_id !== 'string' || body.race_id.length>80)
    return {ok:false,code:'invalid_request'};
  const race = await env.DB.prepare('SELECT * FROM highscore_running_rounds WHERE id=?').bind(body.race_id).first();
  if (!race) return {ok:false,code:'unknown_race'};
  const text = 'Bonus Track +1 · carrera ' + race.id;
  const receipt = async () => await env.DB.prepare("SELECT ticket_id mission_id,author agent,ts won_at FROM events WHERE kind='race_bonus' AND text=?").bind(text).first();
  const existing = await receipt();
  if (existing) return {ok:true,awarded:true,duplicate:true,points:1,race_id:race.id,...existing};
  if (now<race.started_at+WIN_MS) return {ok:false,code:'too_early'};
  if (now>race.started_at+RACE_MS*2) return {ok:false,code:'race_expired'};
  const winner = JSON.parse(race.roster)[0];
  if (!winner) return {ok:true,awarded:false,code:'no_eligible_runner'};
  const current = (await activeWork()).participants || [];
  if (!current.some(row=>row.state==='running' && row.family_key===winner.family_key && row.reference===winner.reference))
    return {ok:true,awarded:false,code:'work_changed'};
  const mission = await env.DB.prepare("SELECT assignee,loc FROM tickets WHERE id=? AND status='in_progress'").bind(winner.mission_id).first();
  if (!mission || groupingIdentityKey(mission.assignee,mission.loc) !== groupingIdentityKey(winner.agent,winner.machine))
    return {ok:true,awarded:false,code:'mission_changed'};
  // Do not touch updated_at, activity, task state, timers or execution evidence.
  // The partial unique index makes retries and competing tabs a single point.
  await env.DB.prepare(`INSERT OR IGNORE INTO events(ticket_id,ts,kind,author,text)
    SELECT id,?,'race_bonus',?,? FROM tickets WHERE id=? AND status='in_progress' AND assignee=? AND COALESCE(loc,'')=?
    AND (?='' OR EXISTS(SELECT 1 FROM mission_tasks WHERE mission_id=tickets.id AND code=? AND status IN ('in_progress','doing','active')))`)
    .bind(race.started_at+WIN_MS,winner.agent,text,winner.mission_id,mission.assignee,mission.loc || '',winner.kind === 'task' ? winner.reference.split(':')[1] : '',winner.kind === 'task' ? winner.reference.split(':')[1] : '').run();
  const award = await receipt();
  return award ? {ok:true,awarded:true,points:1,race_id:race.id,...award}
    : {ok:true,awarded:false,code:'mission_changed'};
}
