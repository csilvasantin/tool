import { CLI_POLICY } from '../src/cli-policy.js';
import { WORK_ACTIVITY_TABLE_SQL, evaluateWorkActivity, workActivityProcessKey } from '../src/work-activity.js';
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {DatabaseSync} from "node:sqlite";
import {readFile} from "node:fs/promises";
import {
  machineSuffix, canonicalMachineSuffix, baseAgentIdentity, parseAgentIdentity, reportAgentFamily, reportAgentIdentity,
  scopedAgentIdentity, sameAgentFamily,
} from "../src/agent-identity.js";
import {resolveDecisionIdentity} from "../src/decision-project.js";
import {MISSION_SCOPE_SQL_T} from "../src/mission-sources.js";

const source=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
const grab=name=>{
  const re=new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}\\n__name\\(${name}, "${name}"\\);`),m=re.exec(source);
  assert.ok(m,`no se pudo extraer ${name}`); return m[0];
};
const grabVar=name=>{const m=new RegExp(`var ${name} = [^\\n]+;`).exec(source);assert.ok(m,name);return m[0];};

function harness(presence={ok:true,presence:[],now:NOW/1000},workSessions=[]){
  const db=new DatabaseSync(":memory:");
  db.exec("CREATE TABLE tickets(id TEXT PRIMARY KEY,subject TEXT,loc TEXT,source TEXT,role TEXT,status TEXT,assignee TEXT,closure_reason TEXT,created_at INTEGER,started_at INTEGER,updated_at INTEGER,live_at INTEGER,resolved_at INTEGER,proof_image TEXT,project TEXT,project_id TEXT)");
  db.exec("CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,title TEXT,status TEXT,owner TEXT,started_at INTEGER,created_at INTEGER,updated_at INTEGER,executor TEXT,ended_at INTEGER)");
  db.exec("CREATE TABLE decisions(id TEXT PRIMARY KEY,question TEXT,agent TEXT,machine TEXT,status TEXT,project TEXT,created_at INTEGER,deadline INTEGER,parent_decision TEXT,mission TEXT)");
  db.exec("CREATE TABLE ideas(id TEXT PRIMARY KEY,title TEXT,status TEXT,author TEXT,author_identity TEXT,project TEXT,created_at INTEGER,updated_at INTEGER)");
  db.exec("CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id TEXT,ts INTEGER,kind TEXT,author TEXT,text TEXT)");
  db.exec("CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT)");
  db.exec("CREATE TABLE fleet_hourly_work(run_id TEXT,mission_id TEXT); CREATE TABLE fleet_agent_mode_runs(id TEXT,status TEXT)");
  db.exec(WORK_ACTIVITY_TABLE_SQL);
  const DB={prepare(sql){const stmt=db.prepare(sql);return{bind(...args){return{all:async()=>({results:stmt.all(...args)})}},all:async()=>({results:stmt.all()})}}};
  const TELEGRAM=presence===null?undefined:{fetch:async(request)=>({ok:true,json:async()=>
    String(request.url).includes("work-sessions") ? {ok:true,sessions:workSessions} : presence})};
  const context=vm.createContext({CLI_POLICY,evaluateWorkActivity,workActivityProcessKey,Map,Set,Array,String,Number,Date,RegExp,Math,Object,Promise,Request,
    machineSuffix,canonicalMachineSuffix,baseAgentIdentity,parseAgentIdentity,reportAgentFamily,reportAgentIdentity,scopedAgentIdentity,sameAgentFamily,resolveDecisionIdentity,MISSION_SCOPE_SQL_T,__name:(fn)=>fn});
  vm.runInContext([
    grabVar("HIGHSCORE_PERSONAS"),grabVar("PRESENCE_URL"),
    grabVar("HIGHSCORE_INTERNAL_YOKUP_TRANSITION_SQL"),grabVar("HIGHSCORE_MISSION_STARTED_SQL"),grabVar("HIGHSCORE_WORK_STARTED_SQL"),grabVar("HIGHSCORE_MISSION_PROGRESS_SQL"),grabVar("HIGHSCORE_RACE_PROGRESS_SQL"),grabVar("HIGHSCORE_ASSIGNMENT_EVENT_SQL"),
    grabVar("HIGHSCORE_ACTIVE_WORK_MS"),grabVar("HIGHSCORE_LANE_WORK_MS"),grabVar("HIGHSCORE_RECENT_WORK_MS"),grabVar("HIGHSCORE_PROCESS_FRESH_MS"),grabVar("HIGHSCORE_CLOCK_SKEW_MS"),
    grab("projectSlug"),grab("projectIndex"),grab("resolveProject"),grab("hash"),grab("highscoreAgent"),grab("scopedMissionOwner"),grab("highscoreActiveWorkMillis"),grab("highscoreActiveWorkFamily"),
    grab("highscoreElapsedTiming"),grab("highscoreAssignmentTiming"),grab("highscoreVerifiedPresence"),grab("highscoreLinkedSession"),grab("highscoreDedicatedTiming"),grab("highscoreActiveWork"),
  ].join("\n"),context);
  return {db,env:{DB,TELEGRAM},F:context};
}

const NOW=1_788_600_382_483, MIN=60_000;
const processRow=(persona,machine,updated=NOW)=>({persona,machine,updated:Math.floor(updated/1000),verified:1,source:"process_snapshot",online:null,pid:42,host:"cli"});
function appSession(ref,persona='OraculoMacMini',machine='MacMini') { return {persona,machine,work_ref:ref,surface:'app',runtime:'Codex',session_id:'desktop:codex',started_at:NOW-60*MIN,state:'open',basis:'process_birth'}; }
function appHarness(...sessions) { return harness({presence:sessions.map(row=>({...processRow(row.persona,row.machine),host:'app',runtime:row.runtime,session_id:row.session_id}))},sessions); }
function mission(db,{id="M1",agent="OraculoMacMini",machine="MacMini",at=NOW-5*MIN,startedAt,status="in_progress",title="Misión"}={}){
  const start=startedAt===undefined?at:startedAt;
  db.prepare("INSERT INTO tickets(id,subject,loc,source,role,status,assignee,closure_reason,created_at,started_at,updated_at,live_at,resolved_at,proof_image) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id,title,machine,"fleet","mission",status,agent,null,at,start,at,at,status==="resolved"?at:null,status==="resolved"?"https://proof.test/evidence.png":null);
}
function decision(db,{id="DEC-1",agent="OraculoMacMini",machine="admira-macmini",at=NOW-MIN,
  deadline=NOW+4*MIN,status="pending",project="yokup",title="¿Qué mejora hacemos?"}={}){
  db.prepare("INSERT INTO decisions(id,question,agent,machine,status,project,created_at,deadline) VALUES (?,?,?,?,?,?,?,?)")
    .run(id,title,agent,machine,status,project,at,deadline);
}

const MID='FLT-1827', START=1788596199778, CHILD_START=1788597432261, CHILD_END=1788598045627;
function morfeo(ref=MID){const session={...appSession(ref,'MorfeoMacMini'),runtime:'Claude',session_id:'desktop:claude',started_at:1788578952000};const h=appHarness(session);mission(h.db,{id:MID,agent:'MorfeoMacMini',at:START,startedAt:START});h.db.prepare('INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?,?)').run(MID,'b','Trabajo finalizado','done','MorfeoMacMini',CHILD_START,START,NOW-1000,'MorfeoMacMini',CHILD_END);return h;}
function activity(db,{host='app',at=NOW}={}){const signal={kind:'implementation',detail:'Verificación aislada de actividad explícita en misión actual',runtime:'Claude',host,session_id:host==='app'?'desktop:claude':'morfeo',family_key:'morfeo@macmini',observed_at:at,basis:'explicit_bound_progress'};db.prepare('INSERT INTO fleet_work_activity VALUES (?,?,?)').run(MID,JSON.stringify(signal),at);}
const result=async h=>JSON.parse(JSON.stringify(await h.F.highscoreActiveWork(h.env,NOW)));
test('real FLT1827 shape: a fresh APP bound to finished child b does not activate parent or borrow the child end',async()=>{
 const h=morfeo(MID+':b');const out=await result(h);const rows=out.participants.filter(x=>x.agent==='MorfeoMacMini');assert.equal(rows.length,1);assert.equal(rows[0].reference,MID);assert.equal(rows[0].state,'assigned_stale');assert.equal(rows[0].activity_at,undefined);assert.equal(rows[0].session_surface,undefined);assert.equal(rows[0].work_started_at,START);assert.notEqual(rows[0].ended_at,CHILD_END);
});
test('explicit same-owner APP activity restores one runner and preserves start and race revision',async()=>{
 const h=morfeo();const before=(await result(h)).participants.find(x=>x.agent==='MorfeoMacMini');activity(h.db);const out=await result(h);const rows=out.participants.filter(x=>x.agent==='MorfeoMacMini');assert.equal(rows.length,1);assert.equal(rows[0].state,'running');assert.equal(rows[0].activity_at,NOW);assert.equal(rows[0].session_surface,'app');assert.equal(rows[0].work_started_at,before.work_started_at);assert.equal(rows[0].race_revision,before.race_revision);assert.equal(out.running_count,1);
});
test('expired activity and canonical closure cannot keep Morfeo running; CLI policy remains effective',async()=>{
 const h=morfeo();activity(h.db,{at:NOW-120001});assert.equal((await result(h)).participants.find(x=>x.agent==='MorfeoMacMini').state,'assigned_stale');h.db.prepare('UPDATE tickets SET status=?,resolved_at=? WHERE id=?').run('resolved',NOW-1000,MID);assert.equal((await result(h)).running_count,0);
 const cli=morfeo();activity(cli.db,{host:'cli'});assert.equal((await result(cli)).running_count,0);assert.equal(CLI_POLICY.cli_paused,true);
});
