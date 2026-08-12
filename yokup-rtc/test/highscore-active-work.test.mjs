import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {DatabaseSync} from "node:sqlite";
import {readFile} from "node:fs/promises";
import {
  baseAgentIdentity, parseAgentIdentity, reportAgentFamily, reportAgentIdentity,
  scopedAgentIdentity, sameAgentFamily,
} from "../src/agent-identity.js";

const source=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
const grab=name=>{
  const re=new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}\\n__name\\(${name}, "${name}"\\);`),m=re.exec(source);
  assert.ok(m,`no se pudo extraer ${name}`); return m[0];
};
const grabVar=name=>{const m=new RegExp(`var ${name} = [^\\n]+;`).exec(source);assert.ok(m,name);return m[0];};

function harness(presence={ok:true,presence:[],now:NOW/1000}){
  const db=new DatabaseSync(":memory:");
  db.exec("CREATE TABLE tickets(id TEXT PRIMARY KEY,subject TEXT,loc TEXT,source TEXT,role TEXT,status TEXT,assignee TEXT,closure_reason TEXT,created_at INTEGER,started_at INTEGER,updated_at INTEGER,live_at INTEGER,resolved_at INTEGER)");
  db.exec("CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,title TEXT,status TEXT,owner TEXT,started_at INTEGER,created_at INTEGER,updated_at INTEGER,executor TEXT)");
  db.exec("CREATE TABLE ideas(id TEXT PRIMARY KEY,title TEXT,status TEXT,author TEXT,author_identity TEXT,created_at INTEGER,updated_at INTEGER)");
  db.exec("CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id TEXT,ts INTEGER,kind TEXT,author TEXT,text TEXT)");
  const DB={prepare(sql){const stmt=db.prepare(sql);return{bind(...args){return{all:async()=>({results:stmt.all(...args)})}},all:async()=>({results:stmt.all()})}}};
  const TELEGRAM=presence===null?undefined:{fetch:async()=>({ok:true,json:async()=>presence})};
  const context=vm.createContext({Map,Set,Array,String,Number,Date,RegExp,Math,Object,Promise,Request,
    baseAgentIdentity,parseAgentIdentity,reportAgentFamily,reportAgentIdentity,scopedAgentIdentity,sameAgentFamily,__name:(fn)=>fn});
  vm.runInContext([
    grabVar("HIGHSCORE_PERSONAS"),grabVar("MISSION_SCOPE_SQL_T"),grabVar("PRESENCE_URL"),
    grabVar("HIGHSCORE_INTERNAL_YOKUP_TRANSITION_SQL"),grabVar("HIGHSCORE_MISSION_STARTED_SQL"),grabVar("HIGHSCORE_WORK_STARTED_SQL"),grabVar("HIGHSCORE_MISSION_PROGRESS_SQL"),
    grabVar("HIGHSCORE_ACTIVE_WORK_MS"),grabVar("HIGHSCORE_LANE_WORK_MS"),grabVar("HIGHSCORE_PROCESS_FRESH_MS"),grabVar("HIGHSCORE_CLOCK_SKEW_MS"),
    grab("highscoreAgent"),grab("scopedMissionOwner"),grab("highscoreActiveWorkMillis"),grab("highscoreActiveWorkFamily"),
    grab("highscoreElapsedTiming"),grab("highscoreVerifiedPresence"),grab("highscoreActiveWork"),
  ].join("\n"),context);
  return {db,env:{DB,TELEGRAM},F:context};
}

const NOW=1_786_460_000_000, MIN=60_000;
const processRow=(persona,machine,updated=NOW)=>({persona,machine,updated:Math.floor(updated/1000),verified:1,source:"process_snapshot",online:null,pid:42,host:"cli"});
function mission(db,{id="M1",agent="OraculoMacMini",machine="MacMini",at=NOW-5*MIN,startedAt,status="in_progress",title="Misión"}={}){
  const start=startedAt===undefined?at:startedAt;
  db.prepare("INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id,title,machine,"fleet","mission",status,agent,null,at,start,at,at,status==="resolved"?at:null);
}

test("frontera exacta 20m: running hasta el límite y assigned_stale un milisegundo después",async()=>{
  const {db,env,F}=harness();
  mission(db,{id:"M1",agent:"OraculoMacMini",at:NOW-20*MIN});
  mission(db,{id:"M2",agent:"NeoMBP14",machine:"MacBook Pro 14",at:NOW-20*MIN-1});
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.mode,"active"); assert.equal(result.running_count,1); assert.equal(result.count,2);
  assert.deepEqual(Object.fromEntries(result.participants.map(row=>[row.agent,row.state])),{
    OraculoMacMini:"running",NeoMBP14:"assigned_stale",
  });
});

test("presence rescata la calle stale, pero no la convierte en running",async()=>{
  const {db,env,F}=harness({presence:[processRow("Neo","MacBook Pro 14")],now:NOW/1000});
  mission(db,{id:"M1",agent:"OraculoMacMini",at:NOW-2*MIN});
  mission(db,{id:"M2",agent:"NeoMBP14",machine:"MacBook Pro 14",at:NOW-8*60*MIN});
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  const neo=result.participants.find(row=>row.agent==="NeoMBP14");
  assert.equal(neo.state,"assigned_stale"); assert.equal(neo.reachable,true); assert.equal(neo.presence_at,NOW);
  assert.equal(result.participants.find(row=>row.agent==="OraculoMacMini").state,"running");
});

test("cuatro familias factuales conservan cuatro lanes aunque sólo dos avancen",async()=>{
  const {db,env,F}=harness();
  mission(db,{id:"M1",agent:"OraculoMacMini",at:NOW-MIN});
  mission(db,{id:"M2",agent:"MorfeoMacMini",at:NOW-20*MIN});
  mission(db,{id:"M3",agent:"NeoMBP14",machine:"MacBook Pro 14",at:NOW-21*MIN});
  mission(db,{id:"M4",agent:"TrinityMBP16",machine:"MacBook Pro 16",at:NOW-40*MIN});
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.count,4); assert.equal(result.running_count,2);
  assert.deepEqual(result.participants.map(row=>row.state).sort(),["assigned_stale","assigned_stale","running","running"]);
});

test("asignación de más de 60m sin proceso verificado no fabrica carril",async()=>{
  const {db,env,F}=harness();
  mission(db,{id:"M1",agent:"NeoMBACrema",machine:"MacBookAirCrema",at:NOW-60*MIN-1});
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.count,0);
  assert.equal(result.mode,"recent");
});

test("la frontera de elegibilidad incluye 60m exactos sin declarar movimiento",async()=>{
  const {db,env,F}=harness();
  mission(db,{id:"M1",agent:"OraculoMacMini",at:NOW-60*MIN});
  mission(db,{id:"M2",agent:"NeoMBP14",machine:"MacBook Pro 14",at:NOW-MIN});
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.count,2);
  assert.equal(result.participants.find(row=>row.agent==="OraculoMacMini").state,"assigned_stale");
});

test("elapsed activo usa generated_at-start, separado del último progreso material",async()=>{
  const {db,env,F}=harness();
  mission(db,{at:NOW-5*MIN,startedAt:NOW-45*MIN});
  db.prepare("INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?)")
    .run("M1","a","Avance","in_progress","SubOraculoMini",NOW-45*MIN,NOW-45*MIN,NOW-5*MIN,"SubOraculoMini");
  const row=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW))).participants[0];
  assert.equal(row.work_started_at,NOW-45*MIN); assert.equal(row.work_progress_at,NOW-5*MIN);
  assert.equal(row.elapsed_ms,45*MIN); assert.equal(row.timing_basis,"start_to_generated_at");
});

test("task gana por prioridad dentro del mismo state y Sub/Infra colapsan por familia",async()=>{
  const {db,env,F}=harness();
  mission(db,{agent:"OraculoMini",at:NOW-10*MIN});
  db.exec(`INSERT INTO mission_tasks VALUES
    ('M1','a','Implementar','in_progress','OraculoMini',${NOW-35*MIN},${NOW-40*MIN},${NOW-6*MIN},'SubOraculoMini'),
    ('M1','a1','QA','doing','OraculoMini',${NOW-30*MIN},${NOW-35*MIN},${NOW-5*MIN},'InfraOraculoMini')`);
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.count,1); assert.equal(result.participants[0].agent,"OraculoMacMini");
  assert.equal(result.participants[0].kind,"task"); assert.equal(result.participants[0].executor,"InfraOraculoMini");
});

test("sin running devuelve top3 finalizados deduplicados, no presencia ni asignaciones stale",async()=>{
  const {db,env,F}=harness({presence:[processRow("Smith","MacBookAirAzul")],now:NOW/1000});
  mission(db,{id:"S",agent:"NeoMBP14",machine:"MacBook Pro 14",at:NOW-8*60*MIN});
  for(const [id,agent,machine,end] of [["R1","OraculoMacMini","MacMini",NOW-MIN],["R2","MorfeoMacMini","MacMini",NOW-2*MIN],["R3","TrinityMBP16","MacBook Pro 16",NOW-3*MIN],["R4","NeoMBP14","MacBook Pro 14",NOW-4*MIN]]){
    mission(db,{id,agent,machine,at:end,startedAt:end-30*MIN,status:"resolved",title:`Final ${id}`});
  }
  // Un task más antiguo y de mayor prioridad no puede sustituir al último
  // trabajo real de la misma familia durante el dedupe del histórico.
  db.prepare("INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?)")
    .run("R1","a","Task antiguo","done","SubOraculoMini",NOW-40*MIN,NOW-40*MIN,NOW-10*MIN,"SubOraculoMini");
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.mode,"recent"); assert.equal(result.running_count,0); assert.equal(result.count,3);
  assert.ok(result.participants.every(row=>row.state==="last_work" && row.ended_at && row.elapsed_ms===30*MIN));
  assert.deepEqual(result.participants.map(row=>row.agent),["OraculoMacMini","MorfeoMacMini","TrinityMBP16"]);
  assert.equal(result.participants[0].kind,"mission");
  assert.equal(result.participants[0].title,"Final R1");
});

test("presence sin trabajo no sintetiza lane",async()=>{
  const {env,F}=harness({presence:[processRow("Smith","MacBookAirAzul")],now:NOW/1000});
  const result=await F.highscoreActiveWork(env,NOW);
  assert.equal(result.count,0); assert.equal(result.mode,"recent");
});

test("endpoint agregado expone sólo señales mínimas y ningún payload privado",()=>{
  assert.match(source,/url\.pathname === "\/highscore\/active-work" && req\.method === "GET"/);
  assert.match(grab("highscoreActiveWork"),/state === "running"/);
  for(const secret of ["report","body","proof_image","image","runtime","session_id"])
    assert.equal(source.includes(`participants.${secret}`),false);
});
