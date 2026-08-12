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

function harness(presence={ok:true,presence:[],now:NOW/1000},workSessions=[]){
  const db=new DatabaseSync(":memory:");
  db.exec("CREATE TABLE tickets(id TEXT PRIMARY KEY,subject TEXT,loc TEXT,source TEXT,role TEXT,status TEXT,assignee TEXT,closure_reason TEXT,created_at INTEGER,started_at INTEGER,updated_at INTEGER,live_at INTEGER,resolved_at INTEGER)");
  db.exec("CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,title TEXT,status TEXT,owner TEXT,started_at INTEGER,created_at INTEGER,updated_at INTEGER,executor TEXT)");
  db.exec("CREATE TABLE ideas(id TEXT PRIMARY KEY,title TEXT,status TEXT,author TEXT,author_identity TEXT,created_at INTEGER,updated_at INTEGER)");
  db.exec("CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id TEXT,ts INTEGER,kind TEXT,author TEXT,text TEXT)");
  const DB={prepare(sql){const stmt=db.prepare(sql);return{bind(...args){return{all:async()=>({results:stmt.all(...args)})}},all:async()=>({results:stmt.all()})}}};
  const TELEGRAM=presence===null?undefined:{fetch:async(request)=>({ok:true,json:async()=>
    String(request.url).includes("work-sessions") ? {ok:true,sessions:workSessions} : presence})};
  const context=vm.createContext({Map,Set,Array,String,Number,Date,RegExp,Math,Object,Promise,Request,
    baseAgentIdentity,parseAgentIdentity,reportAgentFamily,reportAgentIdentity,scopedAgentIdentity,sameAgentFamily,__name:(fn)=>fn});
  vm.runInContext([
    grabVar("HIGHSCORE_PERSONAS"),grabVar("MISSION_SCOPE_SQL_T"),grabVar("PRESENCE_URL"),
    grabVar("HIGHSCORE_INTERNAL_YOKUP_TRANSITION_SQL"),grabVar("HIGHSCORE_MISSION_STARTED_SQL"),grabVar("HIGHSCORE_WORK_STARTED_SQL"),grabVar("HIGHSCORE_MISSION_PROGRESS_SQL"),grabVar("HIGHSCORE_RACE_PROGRESS_SQL"),grabVar("HIGHSCORE_ASSIGNMENT_EVENT_SQL"),
    grabVar("HIGHSCORE_ACTIVE_WORK_MS"),grabVar("HIGHSCORE_LANE_WORK_MS"),grabVar("HIGHSCORE_PROCESS_FRESH_MS"),grabVar("HIGHSCORE_CLOCK_SKEW_MS"),
    grab("highscoreAgent"),grab("scopedMissionOwner"),grab("highscoreActiveWorkMillis"),grab("highscoreActiveWorkFamily"),
    grab("highscoreElapsedTiming"),grab("highscoreAssignmentTiming"),grab("highscoreVerifiedPresence"),grab("highscoreLinkedSession"),grab("highscoreActiveWork"),
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
  const row=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW))).participants.find(item=>item.agent==="OraculoMacMini");
  assert.equal(row.work_started_at,NOW-45*MIN); assert.equal(row.work_progress_at,NOW-5*MIN);
  assert.equal(row.elapsed_ms,45*MIN); assert.equal(row.timing_basis,"start_to_generated_at");
});

test("assignment_at es factual y separado de inicio, progreso, presencia y fin",async()=>{
  const {db,env,F}=harness({presence:[processRow("Oraculo","MacMini")],now:NOW/1000});
  mission(db,{at:NOW-5*MIN,startedAt:NOW-40*MIN});
  mission(db,{id:"M2",agent:"NeoMBP14",machine:"MacBook Pro 14",at:NOW-MIN,startedAt:NOW-2*MIN});
  db.prepare("INSERT INTO events(ticket_id,ts,kind,author,text) VALUES (?,?,?,?,?)")
    .run("M1",NOW-50*MIN,"assign","Carlos","Asignada");
  const row=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW))).participants.find(item=>item.agent==="OraculoMacMini");
  assert.equal(row.assignment_at,NOW-50*MIN); assert.equal(row.assignment_basis,"assignment_event");
  assert.notEqual(row.assignment_at,row.work_started_at); assert.notEqual(row.assignment_at,row.work_progress_at);
  assert.notEqual(row.assignment_at,row.presence_at);
});

test("assignment_at prioriza evento, luego started y born-assigned; futuro o ausente queda desconocido",()=>{
  const {F}=harness();
  assert.deepEqual(JSON.parse(JSON.stringify(F.highscoreAssignmentTiming({assignment_event_at:NOW-9*MIN,started_at:NOW-8*MIN,assignment_born_at:NOW-7*MIN},"mission",NOW))),
    {assignment_at:NOW-9*MIN,assignment_basis:"assignment_event"});
  assert.equal(F.highscoreAssignmentTiming({assignment_event_at:NOW+6_000},"mission",NOW),null);
  assert.equal(F.highscoreAssignmentTiming({},"mission",NOW),null);
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

test("misión open con tareas pending y presence queda fuera; claim in_progress sí entra",async()=>{
  const {db,env,F}=harness({presence:[processRow("Morfeo","MacMini")],now:NOW/1000});
  mission(db,{id:"FLT-1409",agent:"MorfeoMacMini",at:NOW-MIN,status:"open"});
  db.prepare("INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?)")
    .run("FLT-1409","a","Pendiente","pending","MorfeoMacMini",null,NOW-MIN,NOW-MIN,null);
  let result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.count,0,"presence no inventa actividad para FLT-1409");
  db.prepare("UPDATE tickets SET status='in_progress' WHERE id='FLT-1409'").run();
  db.prepare("UPDATE mission_tasks SET status='in_progress',executor='SubMorfeoMacMini',started_at=?,updated_at=? WHERE mission_id='FLT-1409' AND code='a'")
    .run(NOW-MIN,NOW-MIN);
  result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.count,1); assert.equal(result.participants[0].state,"running");
});

test("report o retítulo no renuevan race_revision de tarea o misión activa",async()=>{
  const {db,env,F}=harness({presence:[processRow("Morfeo","MacMini")],now:NOW/1000});
  mission(db,{id:"M1",agent:"MorfeoMacMini",at:NOW-30*MIN,startedAt:NOW-30*MIN});
  mission(db,{id:"M2",agent:"NeoMBP14",machine:"MacBook Pro 14",at:NOW-MIN});
  db.prepare("INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?)")
    .run("M1","a","Original","in_progress","MorfeoMacMini",NOW-30*MIN,NOW-31*MIN,NOW-25*MIN,"SubMorfeoMacMini");
  const beforePayload=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(beforePayload.count,2,JSON.stringify(beforePayload));
  const before=beforePayload.participants.find((row)=>row.agent==="MorfeoMacMini");
  db.prepare("UPDATE mission_tasks SET title=?,updated_at=? WHERE mission_id='M1' AND code='a'")
    .run("Retitulada con informe nuevo",NOW-MIN);
  const afterPayload=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(afterPayload.count,2,JSON.stringify(afterPayload));
  const after=afterPayload.participants.find((row)=>row.agent==="MorfeoMacMini");
  assert.equal(after.race_revision,before.race_revision);
  assert.match(after.race_revision,new RegExp(`\\|${NOW-30*MIN}$`));
});

test("endpoint agregado expone sólo señales mínimas y ningún payload privado",()=>{
  assert.match(source,/url\.pathname === "\/highscore\/active-work" && req\.method === "GET"/);
  assert.match(grab("highscoreActiveWork"),/state === "running"/);
  for(const secret of ["report","body","proof_image","image","runtime","session_id"])
    assert.equal(source.includes(`participants.${secret}`),false);
});

test("sesión dedicada requiere vínculo exacto y una sola encarnación",async()=>{
  const sessions=[{persona:"Oraculo",machine:"MacMini",work_ref:"M1",surface:"cli",
    started_at:(NOW-15*MIN)/1000,ended_at:null,state:"open",basis:"process_birth"}];
  const {db,env,F}=harness(undefined,sessions);
  mission(db,{id:"M1",at:NOW-5*MIN,startedAt:NOW-5*MIN});
  const row=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW))).participants[0];
  assert.equal(row.session_dedicated_ms,15*MIN);
  assert.equal(row.session_state,"open"); assert.equal(row.session_basis,"process_birth");
  assert.equal(row.session_surface,"cli");
  for(const forbidden of ["pid","session_id","incarnation_id"])
    assert.equal(Object.hasOwn(row,forbidden),false);
  assert.equal(row.work_ref,"M1");
  assert.match(row.race_revision,/oraculo.*\|mission\|M1\|/);
});

test("sesión ambigua o silenciosa nunca inventa dedicación",async()=>{
  const exact={persona:"Oraculo",machine:"MacMini",work_ref:"M1",surface:"app",
    started_at:(NOW-20*MIN)/1000,ended_at:null,state:"open",basis:"process_birth"};
  const ambiguous=harness(undefined,[exact,{...exact,surface:"cli",started_at:(NOW-10*MIN)/1000}]);
  mission(ambiguous.db,{id:"M1",at:NOW-MIN});
  let row=JSON.parse(JSON.stringify(await ambiguous.F.highscoreActiveWork(ambiguous.env,NOW))).participants[0];
  assert.equal(Object.hasOwn(row,"session_dedicated_ms"),false);
  const unknown=harness(undefined,[{...exact,state:"unknown"}]);
  mission(unknown.db,{id:"M1",at:NOW-MIN});
  row=JSON.parse(JSON.stringify(await unknown.F.highscoreActiveWork(unknown.env,NOW))).participants[0];
  assert.equal(row.session_state,"unknown"); assert.equal(row.session_dedicated_ms,null);
});

test("rollover conserva una única encarnación viva sin sumar la cerrada anterior",async()=>{
  const previous={persona:"Oraculo",machine:"MacMini",work_ref:"M1",surface:"cli",
    started_at:(NOW-40*MIN)/1000,ended_at:(NOW-20*MIN)/1000,state:"closed",basis:"process_absent"};
  const current={...previous,started_at:(NOW-10*MIN)/1000,ended_at:null,state:"open",basis:"process_birth"};
  const {db,env,F}=harness(undefined,[previous,current]);
  mission(db,{id:"M1",at:NOW-MIN});
  const row=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW))).participants[0];
  assert.equal(row.session_state,"open");
  assert.equal(row.session_dedicated_ms,10*MIN);
});

test("dos encarnaciones vivas o una viva más otra unknown siguen ambiguas",()=>{
  const {F}=harness();
  const open={state:"open",started_at:NOW-1000};
  assert.equal(F.highscoreLinkedSession([open,{...open,started_at:NOW-500}]),null);
  assert.equal(F.highscoreLinkedSession([open,{state:"unknown",started_at:NOW-2000}]),null);
});
