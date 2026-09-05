import { resolveAgentPrincipalProject } from '../src/agent-principal-project.js';
import { desktopTurnParticipants } from '../src/desktop-turn-participant.js';
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
  const context=vm.createContext({desktopTurnParticipants,resolveAgentPrincipalProject,agentPrincipalSnapshot:async()=>({projects:[{id:"admiranext",name:"AdmiraNeXT",status:"activo"},{id:"yokup",name:"Yokup",status:"activo"}],declarations:[],missions:[],now:NOW}),CLI_POLICY,evaluateWorkActivity,workActivityProcessKey,Map,Set,Array,String,Number,Date,RegExp,Math,Object,Promise,Request,
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

const BIRTH=NOW-3600000,START=NOW-300000;
function turnRow(persona='Neo',machine='MBP14',runtime='Claude',patch={}){return {persona,machine,runtime,host:'app',session_id:runtime==='Claude'?'desktop:claude':'desktop:codex',verified:1,source:'process_snapshot',pid:runtime==='Claude'?558:589,updated:NOW/1000,process_birth:BIRTH/1000,app_turn:{state:'active',turn_key:'a'.repeat(64),started_at:START,observed_at:NOW-1000,ended_at:null,process_birth:BIRTH,basis:runtime==='Claude'?'claude_desktop_transcript':'codex_desktop_turn_store'},...patch};}
async function run(rows,sessions=[],setup=()=>{}){const h=harness({presence:rows},sessions);setup(h.db);const before=h.db.prepare('select count(*) n from tickets').get().n;const data=JSON.parse(JSON.stringify(await h.F.highscoreActiveWork(h.env,NOW)));assert.equal(h.db.prepare('select count(*) n from tickets').get().n,before,'projection cannot create missions');return data;}
test('two factual unlinked APP turns appear once each, retain their own start, default project and no fabricated work or points',async()=>{
 const out=await run([turnRow(),turnRow('Trinity','MBP14','Codex')]);assert.equal(out.running_count,2);assert.equal(out.participants.length,2);
 for(const r of out.participants){assert.equal(r.kind,'session');assert.equal(r.reference,'');assert.equal(r.project_id,'admiranext');assert.equal(r.state,'running');assert.equal(r.session_surface,'app');assert.equal(r.work_started_at,START);assert.equal(r.elapsed_ms,NOW-START);for(const k of ['points','mission_id','pid','session_id','turn_key','path','focus','content'])assert.equal(r[k],undefined,k);}
 assert.equal(out.observations.length,0);
});
test('reachability, CLI, stale evidence, ended turn and changed process birth cannot manufacture a session runner',async()=>{
 const base=turnRow();for(const row of [{...base,app_turn:undefined},{...base,host:'cli'},{...base,updated:(NOW-30001)/1000},{...base,app_turn:{...base.app_turn,observed_at:NOW-120001}},{...base,app_turn:{...base.app_turn,state:'ended',ended_at:NOW-500}},{...base,process_birth:(BIRTH+1000)/1000}]){const out=await run([row]);assert.equal(out.running_count,0);assert.equal(out.participants.filter(r=>r.kind==='session').length,0);}
});
test('a live APP turn replaces a finished historical lane without changing stored historical facts',async()=>{
 const out=await run([turnRow()],[],db=>mission(db,{id:'HISTORY',agent:'NeoMBP14',machine:'MBP14',at:NOW-10000,startedAt:NOW-600000,status:'resolved'}));assert.equal(out.participants.filter(r=>r.agent==='NeoMBP14').length,1);assert.equal(out.participants[0].kind,'session');assert.equal(out.participants[0].work_started_at,START);
});
test('two machines remain separate and two ambiguous active turns on one physical APP are not arbitrarily chosen',async()=>{
 const one=turnRow();let out=await run([one,turnRow('Neo','MacMini')]);assert.equal(out.running_count,2);
 out=await run([one,{...one,app_turn:{...one.app_turn,turn_key:'b'.repeat(64)}}]);assert.equal(out.running_count,0);
});
test('an exact active turn renews its stale linked mission without restarting mission time or race identity',async()=>{
 const row=turnRow(),linked={persona:'NeoMBP14',machine:'MBP14',work_ref:'REAL',surface:'app',runtime:'Claude',session_id:'desktop:claude',started_at:BIRTH,state:'open',basis:'process_birth'};
 const setup=db=>mission(db,{id:'REAL',agent:'NeoMBP14',machine:'MBP14',at:NOW-25*MIN,startedAt:NOW-25*MIN});
 const before=await run([{...row,app_turn:undefined}],[linked],setup);assert.equal(before.participants[0].state,'assigned_stale');
 const out=await run([row],[linked],setup);const r=out.participants.find(r=>r.agent==='NeoMBP14');assert.equal(out.running_count,1);assert.equal(r.reference,'REAL');assert.equal(r.kind,'mission');assert.equal(r.state,'running');assert.equal(r.work_started_at,before.participants[0].work_started_at);assert.equal(r.race_revision,before.participants[0].race_revision);
 for(const change of [{runtime:'Codex'},{session_id:'other-session'},{started_at:BIRTH-1000}]){const bad=await run([row],[{...linked,...change}],setup);const current=bad.participants.find(r=>r.agent==='NeoMBP14');assert.equal(current.kind,'session');assert.equal(current.reference,'');}
});
