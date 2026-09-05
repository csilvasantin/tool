import { grokbotServicePresence, grokbotTaskActivity } from '../src/grokbot-work.js';
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
  const context=vm.createContext({grokbotServicePresence,grokbotTaskActivity,desktopTurnParticipants,CLI_POLICY,evaluateWorkActivity,workActivityProcessKey,Map,Set,Array,String,Number,Date,RegExp,Math,Object,Promise,Request,
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

const NOW=1_786_460_000_000, MIN=60_000;
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

test("una ventana pendiente conserva su asignación visible sin acreditar ejecución",async()=>{
  const {db,env,F}=harness();
  db.exec("INSERT INTO projects VALUES ('yokup','Yokup')");
  decision(db,{id:"DEC-VIVA",title:"¿Qué entrenamiento conectamos con Pixeria?"});
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.mode,"recent"); assert.equal(result.running_count,0); assert.equal(result.count,1);
  const row=result.participants[0];
  assert.equal(row.agent,"OraculoMacMini"); assert.equal(row.kind,"task");
  assert.equal(row.reference,"DEC-VIVA"); assert.equal(row.state,"assigned_stale");
  assert.equal(row.activity_reason,"awaiting_decision");
  assert.equal(row.title,"¿Qué entrenamiento conectamos con Pixeria?");
  assert.equal(row.work_started_at,NOW-MIN); assert.equal(row.elapsed_ms,MIN);
  assert.equal(row.project_name,"Yokup");
  assert.equal(row.detail_url,"/decisiones?project_id=yokup");
});

test("Morfeo con ventana automática y APP abierta sin turno no corre ni hereda interfaz",async()=>{
  for(const row of [
    {persona:'Morfeo',machine:'MacMini',runtime:'Claude',host:'app',updated:NOW/1000,source:'heartbeat',verified:0},
    {...processRow('Morfeo','MacMini'),runtime:'Claude',host:'app',session_id:'desktop:claude',app_turn:null},
  ]) {
    const {db,env,F}=harness({presence:[row]});
    decision(db,{id:'DEC-mtoivh1mfzvo',agent:'MorfeoMacMini',machine:'MacMini',title:'Ventana automatica de la hora · opciones de hace 598 h'});
    const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
    assert.equal(result.running_count,0);
    const actual=result.participants.find(p=>p.agent==='MorfeoMacMini');
    assert.equal(actual.state,'assigned_stale');assert.equal(actual.activity_reason,'awaiting_decision');
    assert.equal(actual.reference,'DEC-mtoivh1mfzvo');
    assert.equal(actual.activity_at,undefined);assert.equal(actual.host,undefined);assert.equal(actual.session_surface,undefined);
    assert.equal(db.prepare("SELECT status FROM decisions WHERE id='DEC-mtoivh1mfzvo'").get().status,'pending');
  }
});

test("una decisión pendiente no esquiva la política CLI ni desplaza una misión APP en ejecución",async()=>{
  const cli={...appSession('DEC-CLI'),surface:'cli',session_id:'oraculo'};
  const {db,env,F}=harness({presence:[{...processRow('Oraculo','MacMini'),runtime:'Codex',session_id:'oraculo'}]},[cli]);
  decision(db,{id:'DEC-CLI'});
  const paused=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(paused.running_count,0);assert.equal(paused.participants[0].cli_paused,true);
  assert.equal(paused.participants[0].activity_reason,CLI_POLICY.reason);
  const app=appHarness(appSession('M1'));mission(app.db);decision(app.db);
  const running=JSON.parse(JSON.stringify(await app.F.highscoreActiveWork(app.env,NOW)));
  assert.equal(running.running_count,1);assert.equal(running.participants[0].reference,'M1');
});

test("una ventana decidida o vencida deja libre la pista para la misión materializada",async()=>{
  const {db,env,F}=harness();
  decision(db,{id:"DEC-VENCIDA",deadline:NOW-1});
  decision(db,{id:"DEC-DECIDIDA",status:"decided"});
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.count,0); assert.equal(result.running_count,0); assert.equal(result.mode,"recent");
});

test("frontera exacta 20m: running hasta el límite y assigned_stale un milisegundo después",async()=>{
  const {db,env,F}=appHarness(appSession('M1'));
  mission(db,{id:"M1",agent:"OraculoMacMini",at:NOW-20*MIN});
  mission(db,{id:"M2",agent:"NeoMBP14",machine:"MacBook Pro 14",at:NOW-20*MIN-1});
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.mode,"active"); assert.equal(result.running_count,1); assert.equal(result.count,2);
  assert.deepEqual(Object.fromEntries(result.participants.map(row=>[row.agent,row.state])),{
    OraculoMacMini:"running",NeoMBP14:"assigned_stale",
  });
});

test("handON cli-declare legado aparece inmediatamente aunque no persistiera started_at",async()=>{
  const {db,env,F}=appHarness(appSession('DCL-HANDON'));
  db.prepare("INSERT INTO tickets(id,subject,loc,source,role,status,assignee,closure_reason,created_at,started_at,updated_at,live_at,resolved_at,proof_image) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("DCL-HANDON","handON de OraculoMini, saludo y reporte","MacMini","cli-declare","mission","in_progress","OraculoMini",null,NOW-MIN,null,NOW-MIN,NOW-MIN,null,null);
  db.prepare("INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run("DCL-HANDON","a","Saludar","in_progress","OraculoMini",null,NOW-MIN,NOW-MIN,"SubOraculoMini",null);
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.mode,"active"); assert.equal(result.running_count,1);
  assert.equal(result.participants[0].title,"handON de OraculoMini, saludo y reporte");
  assert.equal(result.participants[0].reference,"DCL-HANDON");
  assert.equal(result.participants[0].work_started_at,NOW-MIN);
});

test("handON fleet resuelto sin started_at sustituye el trabajo viejo del carril",async()=>{
  const {db,env,F}=harness();
  mission(db,{id:"OLD",agent:"MorfeoMacMini",at:NOW-40*MIN,startedAt:NOW-60*MIN,status:"resolved",title:"Trabajo viejo"});
  db.prepare("INSERT INTO tickets(id,subject,loc,source,role,status,assignee,closure_reason,created_at,started_at,updated_at,live_at,resolved_at,proof_image) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("FLT-HANDON","handON del jueves, Morfeo","MacMini","fleet","mission","resolved","MorfeoMacMini",null,NOW-2*MIN,null,NOW-MIN,NOW-MIN,NOW-MIN,"https://proof.test/handon.png");
  db.prepare("INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run("FLT-HANDON","z1","Informe del agente","done","MorfeoMacMini",null,NOW-MIN,NOW-MIN,"MorfeoMacMini",NOW-MIN);
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.mode,"recent"); assert.equal(result.count,1);
  assert.equal(result.participants[0].title,"handON del jueves, Morfeo");
  assert.equal(result.participants[0].reference,"FLT-HANDON");
});

test("FLT-1419 cerrado conserva el inicio de asignación aunque el primer progreso llegara al final",async()=>{
  const {db,env,F}=harness();
  const assigned=NOW-10*MIN, closed=NOW-5_000;
  db.prepare("INSERT INTO tickets(id,subject,loc,source,role,status,assignee,closure_reason,created_at,started_at,updated_at,live_at,resolved_at,proof_image) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("FLT-1419","Galería pública","MacMini","fleet","mission","resolved","MorfeoMacMini",null,
      assigned-5_000,null,closed,closed,closed,"https://proof.test/gallery.png");
  db.prepare("INSERT INTO events(ticket_id,ts,kind,author,text) VALUES (?,?,?,?,?)")
    .run("FLT-1419",assigned,"assign","Carlos","Asignado a MorfeoMacMini en macmini.");
  // Reproduce el sello tardío de producción: el informe hizo aparecer una
  // transición interna apenas antes del resolved, pero no puede borrar los
  // diez minutos que ya acredita la asignación de una misión cerrada con prueba.
  db.prepare("INSERT INTO events(ticket_id,ts,kind,author,text) VALUES (?,?,?,?,?)")
    .run("FLT-1419",closed,"status","yokup","Estado → in_progress");
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.mode,"recent"); assert.equal(result.count,1);
  const row=result.participants[0];
  assert.equal(row.reference,"FLT-1419"); assert.equal(row.state,"last_work");
  assert.equal(row.work_started_at,assigned); assert.equal(row.ended_at,closed);
  assert.equal(row.elapsed_ms,closed-assigned); assert.ok(row.elapsed_ms>0);
});

test("un handON resuelto rellena una calle libre mientras otra familia sigue activa",async()=>{
  const {db,env,F}=appHarness(appSession('DCL-ACTIVA'));
  mission(db,{id:"DCL-ACTIVA",agent:"OraculoMacMini",at:NOW-MIN,title:"QA activa"});
  db.prepare("INSERT INTO tickets(id,subject,loc,source,role,status,assignee,closure_reason,created_at,started_at,updated_at,live_at,resolved_at,proof_image) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("FLT-1413","handON del jueves, Morfeo","MacMini","fleet","mission","resolved","MorfeoMacMini",null,NOW-4*MIN,null,NOW-2*MIN,NOW-2*MIN,NOW-2*MIN,"https://proof.test/handon.png");
  db.prepare("INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run("FLT-1413","z1","Informe del agente","done","MorfeoMacMini",null,NOW-3*MIN,NOW-2*MIN,"MorfeoMacMini",NOW-2*MIN);
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.mode,"active"); assert.equal(result.running_count,1); assert.equal(result.count,2);
  assert.deepEqual(result.participants.map(row=>[row.reference,row.state]),[
    ["DCL-ACTIVA","running"],["FLT-1413","last_work"],
  ]);
});

test("un finalizado nunca sustituye el trabajo activo de su propia familia",async()=>{
  const {db,env,F}=appHarness(appSession('DCL-ACTIVA'));
  mission(db,{id:"DCL-ACTIVA",agent:"OraculoMacMini",at:NOW-5*MIN,title:"QA activa"});
  mission(db,{id:"DCL-CERRADA",agent:"OraculoMacMini",at:NOW-MIN,startedAt:NOW-20*MIN,status:"resolved",title:"Cerrada"});
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.count,1); assert.equal(result.participants[0].reference,"DCL-ACTIVA");
  assert.equal(result.participants[0].state,"running");
});

test("presence familiar no resucita una asignación vieja sin sesión exacta",async()=>{
  const {db,env,F}=harness({presence:[processRow("Neo","MacBook Pro 14")],now:NOW/1000},[appSession("M1")]);
  mission(db,{id:"M1",agent:"OraculoMacMini",at:NOW-2*MIN});
  mission(db,{id:"M2",agent:"NeoMBP14",machine:"MacBook Pro 14",at:NOW-8*60*MIN});
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.participants.some(row=>row.agent==="NeoMBP14"),false);
  assert.equal(result.participants.find(row=>row.agent==="OraculoMacMini").state,"running");
});

test("sesión abierta con work_ref exacto conserva la calle stale sin fingir avance",async()=>{
  const sessions=[{persona:"SubNeo",machine:"MacBookProNegro14",work_ref:"M2",surface:"cli",
    started_at:(NOW-8*60*MIN)/1000,ended_at:null,state:"open",basis:"process_birth"}];
  const {db,env,F}=harness({presence:[processRow("SubNeo","MacBookProNegro14")],now:NOW/1000},sessions);
  mission(db,{id:"M1",agent:"OraculoMacMini",at:NOW-2*MIN});
  mission(db,{id:"M2",agent:"NeoMBP14",machine:"MacBookProNegro14",at:NOW-8*60*MIN});
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  const neo=result.participants.find(row=>row.agent==="NeoMBP14");
  assert.equal(neo.state,"assigned_stale"); assert.equal(neo.reachable,true);
  assert.equal(neo.executor,"NeoMBP14"); assert.equal(neo.dedicated_basis,"process_birth");
});

test("cuatro familias factuales conservan cuatro lanes aunque sólo dos avancen",async()=>{
  const {db,env,F}=appHarness(appSession('M1'),appSession('M2','MorfeoMacMini'));
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

test("elapsed activo usa generated_at-start y report updated_at no compra progreso",async()=>{
  const {db,env,F}=harness();
  mission(db,{at:NOW-45*MIN,startedAt:NOW-45*MIN});
  mission(db,{id:"M2",agent:"NeoMBP14",machine:"MacBook Pro 14",at:NOW-MIN});
  db.prepare("INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run("M1","a","Avance","in_progress","SubOraculoMini",NOW-45*MIN,NOW-45*MIN,NOW-5*MIN,"SubOraculoMini",null);
  const row=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW))).participants.find(item=>item.agent==="OraculoMacMini");
  assert.equal(row.state,"assigned_stale");
  assert.equal(row.work_started_at,NOW-45*MIN); assert.equal(row.work_progress_at,NOW-45*MIN);
  assert.equal(row.elapsed_ms,45*MIN); assert.equal(row.timing_basis,"start_to_generated_at");
  assert.equal(Object.hasOwn(row,"session_dedicated_ms"),false,
    "sin sesión vinculada el extremo derecho no puede copiar los 45 min del trabajo");
  assert.equal(Object.hasOwn(row,"dedicated_basis"),false);
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
  mission(db,{agent:"OraculoMini",at:NOW-40*MIN});
  mission(db,{id:"M2",agent:"NeoMBP14",machine:"MacBook Pro 14",at:NOW-MIN});
  db.exec(`INSERT INTO mission_tasks VALUES
    ('M1','a','Implementar','in_progress','OraculoMini',${NOW-35*MIN},${NOW-40*MIN},${NOW-6*MIN},'SubOraculoMini',NULL),
    ('M1','a1','QA','doing','OraculoMini',${NOW-30*MIN},${NOW-35*MIN},${NOW-5*MIN},'InfraOraculoMini',NULL)`);
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.count,2);
  const oraculo=result.participants.find((row)=>row.agent==="OraculoMacMini");
  assert.equal(oraculo.kind,"task"); assert.equal(oraculo.executor,"InfraOraculoMini");
});

test("SubNeo y subTrinity ejecutan pero las calles visibles son NeoMBP14 y TrinityMBP14",async()=>{
  const {db,env,F}=harness({presence:[
    processRow("SubNeo","MacBookProNegro14"),processRow("subTrinity","MacBookProNegro14")
  ],now:NOW/1000});
  mission(db,{id:"DCL-NEO",agent:"NeoMBP14",machine:"MacBookProNegro14",at:NOW-3*MIN,title:"Misión de Neo"});
  mission(db,{id:"FLT-TRINITY",agent:"subTrinity",machine:"MacBookProNegro14",at:NOW-2*MIN,title:"HandON de Trinity"});
  db.exec(`INSERT INTO mission_tasks VALUES
    ('DCL-NEO','a','Ejecutar Neo','in_progress','NeoMBP14',${NOW-3*MIN},${NOW-3*MIN},${NOW-MIN},'SubNeo',NULL),
    ('FLT-TRINITY','a','Ejecutar Trinity','in_progress','subTrinity',${NOW-2*MIN},${NOW-2*MIN},${NOW-MIN},'subTrinity',NULL)`);
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.deepEqual(result.participants.map(row=>row.agent).sort(),["NeoMBP14","TrinityMBP14"]);
  const neo=result.participants.find(row=>row.agent==="NeoMBP14");
  const trinity=result.participants.find(row=>row.agent==="TrinityMBP14");
  assert.equal(neo.executor,"SubNeoMBP14"); assert.equal(neo.family_key,"neo@mbp14");
  assert.equal(trinity.executor,"SubTrinityMBP14"); assert.equal(trinity.family_key,"trinity@mbp14");
  assert.equal(neo.reachable,true); assert.equal(trinity.reachable,true);
});

test("el carril Trinity expone el proyecto exacto y nunca hereda Pixeria del ranking",async()=>{
  const {db,env,F}=harness();
  db.exec("INSERT INTO projects VALUES ('pixeria','Pixeria'),('admira-tv','Admira TV')");
  mission(db,{id:"DCL-msrt8i1zu0ky",agent:"TrinityMBP14",machine:"MacBookProNegro14",at:NOW-MIN,
    title:"Status integral del player remoto"});
  db.exec("UPDATE tickets SET project='Admira TV',project_id='admira-tv' WHERE id='DCL-msrt8i1zu0ky'");
  const row=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW))).participants[0];
  assert.equal(row.agent,"TrinityMBP14");
  assert.equal(row.project_id,"admira-tv");
  assert.equal(row.project_name,"Admira TV");
  assert.match(row.detail_url,/agent=TrinityMBP14.*project_id=admira-tv/);
});

test("el dedupe por familia ocurre después de leer los cierres y no oculta a NeoMBP14",async()=>{
  const {db,env,F}=harness();
  mission(db,{id:"ACTIVA",agent:"OraculoMacMini",at:NOW-MIN,title:"QA activa"});
  for(let i=0;i<16;i++) mission(db,{id:`MORFEO-${i}`,agent:"MorfeoMacMini",machine:"MacMini",
    at:NOW-(i+2)*MIN,startedAt:NOW-(i+7)*MIN,status:"resolved",title:`Cierre Morfeo ${i}`});
  mission(db,{id:"NEO-HOY",agent:"SubNeo",machine:"MacBookProNegro14",at:NOW-30*MIN,
    startedAt:NOW-40*MIN,status:"resolved",title:"Misión puntuada de Neo"});
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.count,3,JSON.stringify(result));
  const neo=result.participants.find(row=>row.agent==="NeoMBP14");
  assert.equal(neo.reference,"NEO-HOY"); assert.equal(neo.state,"last_work");
  assert.equal(neo.executor,"SubNeoMBP14");
});

test("sin running devuelve top3 finalizados deduplicados, no presencia ni asignaciones stale",async()=>{
  const {db,env,F}=harness({presence:[processRow("Smith","MacBookAirAzul")],now:NOW/1000});
  mission(db,{id:"S",agent:"NeoMBP14",machine:"MacBook Pro 14",at:NOW-8*60*MIN});
  for(const [id,agent,machine,end] of [["R1","OraculoMacMini","MacMini",NOW-MIN],["R2","MorfeoMacMini","MacMini",NOW-2*MIN],["R3","TrinityMBP16","MacBook Pro 16",NOW-3*MIN],["R4","NeoMBP14","MacBook Pro 14",NOW-4*MIN]]){
    mission(db,{id,agent,machine,at:end,startedAt:end-30*MIN,status:"resolved",title:`Final ${id}`});
  }
  // Un task más antiguo y de mayor prioridad no puede sustituir al último
  // trabajo real de la misma familia durante el dedupe del histórico.
  db.prepare("INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run("R1","a","Task antiguo","done","SubOraculoMini",NOW-40*MIN,NOW-40*MIN,NOW-10*MIN,"SubOraculoMini",NOW-10*MIN);
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
  db.prepare("INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run("FLT-1409","a","Pendiente","pending","MorfeoMacMini",null,NOW-MIN,NOW-MIN,null,null);
  let result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.count,0,"presence no inventa actividad para FLT-1409");
  db.prepare("UPDATE tickets SET status='in_progress' WHERE id='FLT-1409'").run();
  db.prepare("UPDATE mission_tasks SET status='in_progress',executor='SubMorfeoMacMini',started_at=?,updated_at=? WHERE mission_id='FLT-1409' AND code='a'")
    .run(NOW-MIN,NOW-MIN);
  result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.count,1); assert.equal(result.participants[0].state,"assigned_stale");
  assert.equal(result.participants[0].activity_reason,"session_unverified");
});

test("report o retítulo no renuevan race_revision de tarea o misión activa",async()=>{
  const {db,env,F}=harness({presence:[processRow("Morfeo","MacMini")],now:NOW/1000});
  mission(db,{id:"M1",agent:"MorfeoMacMini",at:NOW-30*MIN,startedAt:NOW-30*MIN});
  mission(db,{id:"M2",agent:"NeoMBP14",machine:"MacBook Pro 14",at:NOW-MIN});
  db.prepare("INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run("M1","a","Original","in_progress","MorfeoMacMini",NOW-30*MIN,NOW-31*MIN,NOW-25*MIN,"SubMorfeoMacMini",null);
  const beforePayload=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(beforePayload.count,2,JSON.stringify(beforePayload));
  const before=beforePayload.participants.find((row)=>row.agent==="MorfeoMacMini");
  db.prepare("UPDATE mission_tasks SET title=?,updated_at=? WHERE mission_id='M1' AND code='a'")
    .run("Retitulada con informe nuevo",NOW-MIN);
  const afterPayload=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(afterPayload.count,2,JSON.stringify(afterPayload));
  const after=afterPayload.participants.find((row)=>row.agent==="MorfeoMacMini");
  assert.equal(after.race_revision,before.race_revision);
  assert.equal(after.work_progress_at,before.work_progress_at);
  assert.equal(after.state,before.state);
  assert.match(after.race_revision,/^r1:[a-z0-9]+$/);
});

test("un task finalizado sin ended_at factual no usa report updated_at como fin",async()=>{
  const {db,env,F}=harness();
  mission(db,{id:"R1",agent:"OraculoMacMini",at:NOW-10*MIN,startedAt:NOW-30*MIN,status:"resolved"});
  db.prepare("INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run("R1","a","Informe tardío","done","OraculoMacMini",NOW-25*MIN,NOW-25*MIN,NOW-MIN,"InfraOraculoMini",null);
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.count,1,JSON.stringify(result));
  assert.equal(result.participants[0].kind,"mission");
  assert.equal(result.participants[0].ended_at,NOW-10*MIN);
  assert.equal(result.participants[0].elapsed_ms,20*MIN);
});

test("última tarea conserva referencia título proyecto y ended_at factuales",async()=>{
  const {db,env,F}=harness();
  mission(db,{id:"FLT-TAREA",agent:"NiobeMacMini",at:NOW-3*60*MIN,status:"open",title:"Misión contenedora"});
  db.exec("INSERT INTO projects VALUES ('yokup','Yokup')");
  db.prepare("UPDATE tickets SET project='Yokup',project_id='yokup' WHERE id='FLT-TAREA'").run();
  db.prepare("INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run("FLT-TAREA","b","Integrar referencias visuales","done","NiobeMacMini",NOW-15*MIN,
      NOW-20*MIN,NOW-MIN,"SubNiobeMini",NOW-5*MIN);
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.mode,"recent"); assert.equal(result.count,1,JSON.stringify(result));
  const row=result.participants[0];
  assert.equal(row.state,"last_work"); assert.equal(row.kind,"task");
  assert.equal(row.reference,"FLT-TAREA:b"); assert.equal(row.title,"Integrar referencias visuales");
  assert.equal(row.executor,"SubNiobeMacMini"); assert.equal(row.project_id,"yokup");
  assert.equal(row.project_name,"Yokup"); assert.equal(row.ended_at,NOW-5*MIN);
  assert.equal(row.elapsed_ms,10*MIN);
});

test("tarea done sin ended_at queda fuera aunque updated_at sea reciente",async()=>{
  const {db,env,F}=harness();
  mission(db,{id:"FLT-SIN-FIN",agent:"NiobeMacMini",at:NOW-3*60*MIN,status:"open"});
  db.prepare("INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run("FLT-SIN-FIN","b","Informe retocado","done","NiobeMacMini",NOW-30*MIN,
      NOW-40*MIN,NOW-MIN,"SubNiobeMini",null);
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.count,0,JSON.stringify(result));
  assert.equal(result.mode,"recent");
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
  const payload=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(payload.count,1,JSON.stringify(payload));
  const row=payload.participants[0];
  assert.equal(row.session_dedicated_ms,15*MIN);
  assert.equal(row.session_state,"open"); assert.equal(row.dedicated_basis,"process_birth");
  assert.equal(row.session_surface,"cli");
  for(const forbidden of ["pid","session_id","incarnation_id"])
    assert.equal(Object.hasOwn(row,forbidden),false);
  assert.equal(Object.hasOwn(row,"work_ref"),false);
  assert.equal(row.reference,"M1");
  assert.match(row.race_revision,/^r1:[a-z0-9]+$/);
  assert.doesNotMatch(row.race_revision,/M1|oraculo|mission/i);
});

test("sesión ambigua o silenciosa queda desconocida y nunca copia el reloj de trabajo",async()=>{
  const exact={persona:"Oraculo",machine:"MacMini",work_ref:"M1",surface:"app",
    started_at:(NOW-20*MIN)/1000,ended_at:null,state:"open",basis:"process_birth"};
  const ambiguous=harness(undefined,[exact,{...exact,surface:"cli",started_at:(NOW-10*MIN)/1000}]);
  mission(ambiguous.db,{id:"M1",at:NOW-MIN});
  let row=JSON.parse(JSON.stringify(await ambiguous.F.highscoreActiveWork(ambiguous.env,NOW))).participants[0];
  assert.equal(row.elapsed_ms,MIN);
  assert.equal(Object.hasOwn(row,"session_dedicated_ms"),false);
  assert.equal(Object.hasOwn(row,"dedicated_basis"),false);
  const unknown=harness(undefined,[{...exact,state:"unknown"}]);
  mission(unknown.db,{id:"M1",at:NOW-MIN});
  row=JSON.parse(JSON.stringify(await unknown.F.highscoreActiveWork(unknown.env,NOW))).participants[0];
  assert.equal(row.elapsed_ms,MIN);
  assert.equal(Object.hasOwn(row,"session_state"),false);
  assert.equal(Object.hasOwn(row,"session_dedicated_ms"),false);
});

test("reproduce screenshot: sin sesión el reloj derecho no repite el mismo valor del izquierdo",async()=>{
  const {db,env,F}=harness();
  mission(db,{id:"M1",at:NOW-18*MIN,startedAt:NOW-18*MIN});
  const row=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW))).participants[0];
  assert.equal(row.elapsed_ms,18*MIN);
  assert.equal(Object.hasOwn(row,"session_dedicated_ms"),false);
});

test("trabajo y sesión exacta publican valores distintos sin inflar ni capar la sesión abierta",async()=>{
  const sessions=[{persona:"Oraculo",machine:"MacMini",work_ref:"M1",surface:"cli",
    started_at:(NOW-42*MIN)/1000,ended_at:null,state:"open",basis:"process_birth"}];
  const {db,env,F}=harness(undefined,sessions);
  mission(db,{id:"M1",at:NOW-12*MIN,startedAt:NOW-12*MIN});
  const row=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW))).participants[0];
  assert.equal(row.elapsed_ms,12*MIN);
  assert.equal(row.session_dedicated_ms,42*MIN);
  assert.equal(row.session_state,"open");
  assert.equal(row.dedicated_basis,"process_birth");
});

test("una sesión abierta se congela exactamente al fin factual del trabajo",()=>{
  const {F}=harness();
  const timing={work_started_at:NOW-30*MIN,ended_at:NOW-5*MIN,elapsed_ms:25*MIN};
  const result=F.highscoreDedicatedTiming({state:"open",started_at:NOW-20*MIN,ended_at:null,basis:"process_birth",surface:"cli"},timing,NOW);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{session_dedicated_ms:15*MIN,session_state:"closed",
    dedicated_basis:"exact_session_capped_at_work_end",session_surface:"cli"});
});

test("sin inicio factual no publica ninguna de las dos duraciones",()=>{
  const {F}=harness();
  assert.equal(F.highscoreElapsedTiming({work_progress_at:NOW-MIN},"mission",NOW),null);
  assert.equal(F.highscoreDedicatedTiming(null,null,NOW),null);
});

test("born-assigned sin started ni transición no se convierte en inicio de trabajo",()=>{
  const {F}=harness();
  const item={assignment_born_at:NOW-MIN,created_at:NOW-MIN,work_progress_at:NOW-MIN};
  assert.deepEqual(JSON.parse(JSON.stringify(F.highscoreAssignmentTiming(item,"mission",NOW))),
    {assignment_at:NOW-MIN,assignment_basis:"born_assigned"});
  assert.equal(F.highscoreElapsedTiming(item,"mission",NOW),null);
  assert.equal(F.highscoreDedicatedTiming(null,null,NOW),null);
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

test('misión humana factual prevalece sobre HWR reciente y pausa excluye tareas reabiertas',async()=>{
  const {db,env,F}=harness();
  mission(db,{id:'HUMAN',agent:'MorfeoMacMini',at:NOW-25*MIN});
  mission(db,{id:'HWR-linked',agent:'MorfeoMacMini',at:NOW-MIN});
  mission(db,{id:'OTHER-MACHINE',agent:'MorfeoMBP14',machine:'MacBookProNegro14',at:NOW-MIN});
  db.exec("INSERT INTO fleet_hourly_work VALUES('run1','HWR-linked');INSERT INTO fleet_agent_mode_runs VALUES('run1','dispatched')");
  let result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.participants.find(row=>row.agent==='MorfeoMacMini').reference,'HUMAN');
  assert.equal(result.participants.find(row=>row.agent==='MorfeoMacMini').state,'assigned_stale');
  assert.equal(result.participants.find(row=>row.agent==='MorfeoMBP14').reference,'OTHER-MACHINE');
  db.exec("UPDATE fleet_agent_mode_runs SET status='paused';DELETE FROM tickets WHERE id='HUMAN'");
  db.prepare('INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?,?)').run('HWR-linked','a','Investigación pausada','in_progress','MorfeoMacMini',NOW-MIN,NOW-MIN,NOW-MIN,'SubMorfeoMacMini',null);
  result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.participants.some(row=>row.agent==='MorfeoMacMini'),false);
});

test('executor delegado no presta su trabajo a la familia ni máquina del coordinador',async()=>{
  const {db,env,F}=harness();
  mission(db,{id:'HUMAN-TEAM',agent:'TrinityMacMini',at:NOW-MIN});
  db.prepare('INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?,?)').run('HUMAN-TEAM','b','Ejecución remota','in_progress','SubMorfeoMBP14',NOW-MIN,NOW-MIN,NOW-MIN,'SubMorfeoMBP14',null);
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  const executor=result.participants.find(row=>row.agent==='MorfeoMBP14');
  assert.equal(executor.reference,'HUMAN-TEAM:b');assert.equal(executor.machine,'MBP14');
  assert.equal(result.participants.find(row=>row.agent==='TrinityMacMini').kind,'mission');
});

test("aplicación abierta sin trabajo se observa sin fabricar actividad ni puntos",async()=>{
  const row={...processRow("MorfeoMacMini","admira-macmini"),host:"app",runtime:"Claude",
    focus:"private conversation",task:"old closed work",busy:true};
  const {env,F}=harness({presence:[row]});
  const payload=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(payload.count,0); assert.equal(payload.running_count,0); assert.deepEqual(payload.participants,[]);
  assert.equal(payload.observations.length,1);
  const observation=payload.observations[0];
  assert.equal(observation.agent,"MorfeoMacMini"); assert.equal(observation.machine,"MacMini");
  assert.equal(observation.host,"app"); assert.equal(observation.runtime,"Claude");
  assert.equal(observation.activity_state,"unverified"); assert.equal(observation.reason,"no_linked_work");
  assert.equal(observation.process_state,"open"); assert.equal(observation.observed_at,NOW);
  for(const forbidden of ["pid","focus","task","busy","points","reference","session_id"])
    assert.equal(Object.hasOwn(observation,forbidden),false);
});

test("observaciones rechazan procesos sin prueba, antiguos, futuros, cerrados e identidad contradictoria",async()=>{
  const base={...processRow("MorfeoMacMini","MacMini"),host:"app",runtime:"Claude"};
  const invalid=[{verified:0},{source:"heartbeat"},{updated:(NOW-31000)/1000},
    {updated:(NOW+6000)/1000},{online:0},{pid:0},{host:"unknown"},
    {process_state:"closed"},{process_state:"unknown"},{machine:"MBP14"}];
  for(const override of invalid){
    const {env,F}=harness({presence:[{...base,...override}]});
    const payload=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
    assert.deepEqual(payload.observations,[],JSON.stringify(override));
  }
});

test("claim real elimina gap familiar entre superficies y conserva otra máquina",async()=>{
  const rows=[{...processRow("MorfeoMacMini","MacMini"),host:"app",runtime:"Claude"},
    {...processRow("MorfeoMini","admira-macmini"),host:"cli",runtime:"Claude"},
    {...processRow("MorfeoMBP14","MBP14"),host:"cli",runtime:"Claude"}];
  const sessions=[];
  const {db,env,F}=harness({presence:rows},sessions);
  mission(db,{agent:"MorfeoMacMini",machine:"MacMini",status:"open",at:NOW-2*MIN});
  let payload=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(payload.observations.length,3); assert.equal(payload.count,0);
  db.exec("UPDATE tickets SET status='in_progress'");
  sessions.push({...appSession("M1","MorfeoMacMini"),runtime:"Claude",session_id:"desktop:claude"});
  payload=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(payload.running_count,1); assert.equal(payload.observations.length,1);
  assert.equal(payload.observations[0].agent,"MorfeoMBP14");
});

test("última misión cerrada no oculta hueco y aliases del mismo proceso no duplican observación",async()=>{
  const rows=[{...processRow("MorfeoMacMini","MacMini"),host:"app",runtime:"Claude"},
    {...processRow("MorfeoMini","admira-macmini",NOW-1000),host:"app",runtime:"Claude"}];
  const {db,env,F}=harness({presence:rows});
  mission(db,{agent:"MorfeoMacMini",status:"resolved",at:NOW-2*MIN});
  const payload=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(payload.participants[0].state,"last_work");
  assert.equal(payload.observations.length,1); assert.equal(payload.observations[0].observed_at,NOW);
});

test('coordinación exacta renueva movimiento sin reiniciar reloj y vence tarea inicializada de la misma familia', async()=>{
  const family='oraculo@macmini', start=NOW-40*MIN;
  const process={...processRow('OraculoMacMini','MacMini'),runtime:'Codex',host:'app',session_id:'desktop:codex'};
  const sessions=[{persona:'OraculoMacMini',machine:'MacMini',work_ref:'COORD',surface:'app',runtime:'Codex',session_id:'desktop:codex',started_at:start-1000,state:'open'}];
  const {db,env,F}=harness({presence:[process]},sessions);
  mission(db,{id:'COORD',at:start});
  db.prepare('INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?,?)').run('COORD','a','Implementar','in_progress','OraculoMacMini',NOW-MIN,start,NOW-MIN,'SubOraculoMacMini',null);
  const signal={family_key:family,kind:'coordination',detail:'Contrasto los resultados reales de los tres agentes',runtime:'Codex',host:'app',session_id:'desktop:codex',observed_at:NOW-1000,basis:'explicit_bound_progress'};
  db.prepare('INSERT INTO fleet_work_activity VALUES (?,?,?)').run('COORD',JSON.stringify(signal),signal.observed_at);
  let row=(await F.highscoreActiveWork(env,NOW)).participants[0];
  assert.equal(row.reference,'COORD'); assert.equal(row.state,'running');
  assert.equal(row.activity_text,signal.detail); assert.equal(row.work_started_at,start);
  const revision=row.race_revision;
  signal.observed_at=NOW;
  db.prepare('UPDATE fleet_work_activity SET activity_json=?').run(JSON.stringify(signal));
  row=(await F.highscoreActiveWork(env,NOW)).participants[0];
  assert.equal(row.race_revision,revision); assert.equal(row.work_started_at,start);
  db.prepare("UPDATE mission_tasks SET status='done', started_at=?").run(start);
  mission(db,{id:'OTHER',agent:'NeoMBP14',machine:'MBP14',at:NOW});
  const stale=(await F.highscoreActiveWork(env,NOW+120001)).participants.find(row=>row.reference==='COORD');
  assert.equal(stale.state,'assigned_stale'); assert.equal(stale.activity_at,undefined);
  db.prepare("UPDATE tickets SET status='resolved', resolved_at=?,proof_image='https://proof.test/closed.png' WHERE id='COORD'").run(NOW);
  row=(await F.highscoreActiveWork(env,NOW)).participants.find(row=>row.reference==='COORD');
  assert.equal(row.state,'last_work'); assert.equal(row.activity_at,undefined); assert.equal(row.ended_at,NOW);
});

 test('CLI vinculado queda pausado por política y conserva trabajo e inicio; no afirma proceso cerrado',async()=>{
 const sessions=[{...appSession('M1'),surface:'cli',session_id:'oraculo'}];
 const {db,env,F}=harness({presence:[{...processRow('OraculoMacMini','MacMini'),runtime:'Codex',session_id:'oraculo'}]},sessions);
 mission(db,{id:'M1',at:NOW-MIN});
 const row=(await F.highscoreActiveWork(env,NOW)).participants[0];
 assert.equal(row.state,'assigned_stale');assert.equal(row.cli_paused,true);assert.equal(row.operational_state,'paused_by_policy');
 assert.equal(row.session_state,'open');assert.equal(row.work_started_at,NOW-MIN);assert.equal(row.activity_reason,'cli_paused_by_carlos');
 });

const serviceRow=(persona='Lucas')=>({persona,machine:'GrokBot',runtime:'Grok',host:'app',source:'heartbeat',verified:0,updated:NOW/1000});
function grokTask(db,{status='in_progress',ended=null,started=NOW-5*MIN}={}){
  mission(db,{id:'GROK',agent:'LucasGrokBot',machine:'GrokBot',at:NOW-10*MIN});
  db.prepare('INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?,?)').run('GROK','b','Página drag-and-drop',status,'LucasGrokBot',started,NOW-10*MIN,started,'LucasGrokBot',ended);
}
test('GrokBot active task and fresh service presence run without a fabricated Desktop session',async()=>{
 const {db,env,F}=harness({presence:[null,serviceRow()]});grokTask(db);
 const out=await F.highscoreActiveWork(env,NOW),row=out.participants.find(r=>r.agent==='LucasGrokBot');
 assert.equal(out.running_count,1);assert.equal(row.reference,'GROK:b');assert.equal(row.title,'Página drag-and-drop');
 assert.equal(row.activity_basis,'grokbot_task_progress');assert.equal(row.activity_expires_at,NOW+120000);assert.equal(row.host,'app');
 assert.equal(row.session_id,undefined);assert.equal(row.session_surface,undefined);assert.equal(row.session_dedicated_ms,undefined);
});
test('service heartbeat alone, completed task and closed parent cannot start a GrokBot runner',async()=>{
 for(const mode of ['heartbeat','done','closed','cancelled','ended']){
  const {db,env,F}=harness({presence:[serviceRow()]});
  if(mode!=='heartbeat'){grokTask(db,{status:mode==='done'?'done':'in_progress',ended:mode==='ended'?NOW-1000:null});
   if(['closed','cancelled'].includes(mode))db.prepare('UPDATE tickets SET status=?,resolved_at=? WHERE id=?').run(mode==='closed'?'resolved':'cancelled',NOW-1000,'GROK');}
  assert.equal((await F.highscoreActiveWork(env,NOW)).running_count,0,mode);
 }
});
test('service evidence expires and never borrows another agent, machine, or a future/stale heartbeat',async()=>{
 for(const patch of [{persona:'Jobs'},{machine:'MacMini'},{persona:'LucasMacMini'},{host:'cli'},{focus:'misión FLT-1234 cerrada'},{focus:'misión FLT-1234 · paso a in_progress'},{updated:(NOW-120000)/1000},{updated:(NOW+6000)/1000}]){
  const {db,env,F}=harness({presence:[{...serviceRow(),...patch}]});grokTask(db);
  assert.equal((await F.highscoreActiveWork(env,NOW)).running_count,0,JSON.stringify(patch));
 }
 const {db,env,F}=harness({presence:[serviceRow()]});grokTask(db,{started:NOW-20*MIN});
 assert.equal((await F.highscoreActiveWork(env,NOW)).running_count,0,'old active task is not renewed by heartbeat');
});
test('a canonical completion removes a previously running service task at the next read',async()=>{
 const {db,env,F}=harness({presence:[serviceRow()]});grokTask(db);
 assert.equal((await F.highscoreActiveWork(env,NOW)).running_count,1);
 db.prepare('UPDATE mission_tasks SET status=?,ended_at=? WHERE mission_id=?').run('done',NOW,'GROK');
 assert.equal((await F.highscoreActiveWork(env,NOW+1)).running_count,0);
});

test('GrokBot task-start service event remains valid for its exact active task beyond heartbeat TTL',async()=>{
 for(const [focus,expected] of [['misión FLT-1234 · paso b in_progress',1],['misión FLT-1234 · paso a in_progress',0],['misión FLT-1234 cerrada',0]]){
  const {db,env,F}=harness({presence:[{...serviceRow(),focus,updated:(NOW-8*MIN)/1000}]});
  grokTask(db,{started:NOW-8*MIN});db.exec("UPDATE tickets SET id='FLT-1234'; UPDATE mission_tasks SET mission_id='FLT-1234'");
  const out=await F.highscoreActiveWork(env,NOW);assert.equal(out.running_count,expected,focus);
  if(expected){const row=out.participants[0];assert.equal(row.service_work_ref,'FLT-1234:b');assert.equal(row.activity_expires_at,NOW+12*MIN);
   db.exec("UPDATE mission_tasks SET status='done'");assert.equal((await F.highscoreActiveWork(env,NOW+1)).running_count,0);}
 }
});

test('contradictory GrokBot task events at the same instant are ambiguous in either order',async()=>{
 const active={...serviceRow(),focus:'misión FLT-1234 · paso b in_progress'};
 const other={...serviceRow(),focus:'misión FLT-1234 · paso a in_progress'};
 for(const rows of [[active,other],[other,active]]){
  const {db,env,F}=harness({presence:rows});grokTask(db);
  db.exec("UPDATE tickets SET id='FLT-1234'; UPDATE mission_tasks SET mission_id='FLT-1234'");
  assert.equal((await F.highscoreActiveWork(env,NOW)).running_count,0);
 }
});
