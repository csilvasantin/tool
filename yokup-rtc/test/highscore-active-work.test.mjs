import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {DatabaseSync} from "node:sqlite";
import {readFile} from "node:fs/promises";
import {
  baseAgentIdentity, parseAgentIdentity, reportAgentFamily, reportAgentIdentity,
  scopedAgentIdentity, sameAgentFamily,
} from "../src/agent-identity.js";
import {missionVisibleDetails,taskVisibleDetails} from "../src/mission-visible.js";

const source=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
const grab=name=>{
  const re=new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}\\n__name\\(${name}, "${name}"\\);`),m=re.exec(source);
  assert.ok(m,`no se pudo extraer ${name}`); return m[0];
};
const grabVar=name=>{
  const re=new RegExp(`var ${name} = [^\\n]+;`),m=re.exec(source);
  assert.ok(m,`no se pudo extraer ${name}`); return m[0];
};

function harness(presence){
  const db=new DatabaseSync(":memory:");
  db.exec("CREATE TABLE tickets(id TEXT PRIMARY KEY,subject TEXT,loc TEXT,source TEXT,role TEXT,status TEXT,assignee TEXT,closure_reason TEXT,created_at INTEGER,updated_at INTEGER,live_at INTEGER)");
  db.exec("CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,title TEXT,status TEXT,owner TEXT,updated_at INTEGER,executor TEXT)");
  db.exec("CREATE TABLE ideas(id TEXT PRIMARY KEY,title TEXT,status TEXT,author TEXT,author_identity TEXT,created_at INTEGER,updated_at INTEGER)");
  const DB={prepare(sql){const stmt=db.prepare(sql);return{bind(...args){return{all:async()=>({results:stmt.all(...args)})}},all:async()=>({results:stmt.all()})}}};
  const TELEGRAM=presence===undefined?undefined:{fetch:async()=>({ok:presence!==null,json:async()=>presence||{}})};
  const context=vm.createContext({Map,Set,Array,String,Number,Date,RegExp,Math,Object,Promise,Request,
    baseAgentIdentity,parseAgentIdentity,reportAgentFamily,reportAgentIdentity,scopedAgentIdentity,sameAgentFamily,
    missionVisibleDetails,taskVisibleDetails,__name:(fn)=>fn});
  vm.runInContext([
    grabVar("HIGHSCORE_PERSONAS"),grabVar("MISSION_SCOPE_SQL_T"),grabVar("PRESENCE_URL"),
    grabVar("HIGHSCORE_ACTIVE_WORK_MS"),grabVar("HIGHSCORE_PROCESS_FRESH_MS"),grabVar("HIGHSCORE_CLOCK_SKEW_MS"),
    grab("highscoreAgent"),grab("scopedMissionOwner"),grab("highscoreActiveWorkMillis"),
    grab("highscoreActiveWorkFamily"),grab("highscoreVerifiedPresence"),grab("highscoreActiveWork"),
  ].join("\n"),context);
  return {db,env:{DB,TELEGRAM},F:context};
}

const NOW=1_786_460_000_000, MIN=60_000;
const processRow=(persona,machine,updated=NOW)=>({
  persona,machine,updated:Math.floor(updated/1000),verified:1,source:"process_snapshot",
  online:1,pid:42,host:"cli",
});
function mission(db,{id="M1",agent="OraculoMacMini",machine="MacMini",at=NOW-5*MIN,status="in_progress",title="Misión"}={}){
  db.prepare("INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(
    id,title,machine,"fleet","mission",status,agent,null,at,at,at);
}

test("stale sin process_snapshot exacto se excluye aunque conserve status in_progress",async()=>{
  const {db,env,F}=harness({ok:true,presence:[],now:NOW/1000});
  mission(db,{agent:"NeoMBACrema",machine:"MacBookAirCrema",at:NOW-8*60*MIN});
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.count,0,"NeoMBACrema no puede revivir por una misión de hace ocho horas");
  assert.equal(result.presence_available,true);
});

test("stale con process_snapshot fresco de la misma familia+máquina sí participa",async()=>{
  const {db,env,F}=harness({presence:[{...processRow("Neo","MacBook Pro 14"),online:null}],now:NOW/1000});
  mission(db,{agent:"NeoMBP14",machine:"MacBook Pro 14",at:NOW-8*60*MIN});
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.count,1);
  assert.equal(result.participants[0].agent,"NeoMBP14");
  assert.equal(result.participants[0].operational_basis,"verified_process");
  assert.equal(result.participants[0].presence_at,NOW);
});

test("trabajo visible-v1 reciente participa sin presencia",async()=>{
  const {db,env,F}=harness(null);
  mission(db,{agent:"OraculoMacMini",machine:"MacMini",at:NOW-20*MIN});
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.count,1);
  assert.equal(result.participants[0].operational_basis,"recent_work");
  assert.equal("presence_at" in result.participants[0],false);
  assert.equal(result.presence_available,false,"fallo presence no borra trabajo reciente");
});

test("presence sin misión, tarea u objetivo activo nunca sintetiza una calle",async()=>{
  const {env,F}=harness({presence:[processRow("Smith","MacBookAirAzul")],now:NOW/1000});
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.count,0);
});

test("presence debe ser process_snapshot verificado, con PID, host y timestamp frescos",async()=>{
  const invalid=[
    {...processRow("Neo","MacBookAirCrema"),verified:0},
    {...processRow("Neo","MacBookAirCrema"),source:"heartbeat"},
    {...processRow("Neo","MacBookAirCrema"),pid:1},
    {...processRow("Neo","MacBookAirCrema"),pid:"no-numérico"},
    {...processRow("Neo","MacBookAirCrema"),pid:2.5},
    {...processRow("Neo","MacBookAirCrema"),host:"ssh"},
    {...processRow("Neo","MacBookAirCrema"),online:0},
    {...processRow("Neo","MacBookAirCrema"),online:false},
    processRow("Neo","MacBookAirCrema",NOW-31_000),
    processRow("Neo","MacBookAirCrema",NOW+6_000),
  ];
  const {db,env,F}=harness({presence:invalid,now:NOW/1000});
  mission(db,{agent:"NeoMBACrema",machine:"MacBookAirCrema",at:NOW-8*60*MIN});
  assert.equal((await F.highscoreActiveWork(env,NOW)).count,0);
});

test("apellido explícito discordante con machine no rescata otra máquina",async()=>{
  const {db,env,F}=harness({presence:[processRow("NeoMBP14","MacBookAirCrema")],now:NOW/1000});
  mission(db,{agent:"NeoMBP14",machine:"MacBook Pro 14",at:NOW-8*60*MIN});
  assert.equal((await F.highscoreActiveWork(env,NOW)).count,0);
});

test("misma persona en otra máquina no rescata el trabajo stale",async()=>{
  const {db,env,F}=harness({presence:[processRow("Neo","MacBook Pro 14")],now:NOW/1000});
  mission(db,{agent:"NeoMBACrema",machine:"MacBookAirCrema",at:NOW-8*60*MIN});
  assert.equal((await F.highscoreActiveWork(env,NOW)).count,0);
});

test("trabajo con timestamp futuro no entra por frescura aparente",async()=>{
  const {db,env,F}=harness({presence:[],now:NOW/1000});
  mission(db,{agent:"OraculoMacMini",machine:"MacMini",at:NOW+6_000});
  assert.equal((await F.highscoreActiveWork(env,NOW)).count,0);
});

test("el límite exacto de 60 minutos sigue incluido y un milisegundo más queda fuera",async()=>{
  const {db,env,F}=harness({presence:[],now:NOW/1000});
  mission(db,{id:"M1",agent:"OraculoMacMini",machine:"MacMini",at:NOW-60*MIN});
  mission(db,{id:"M2",agent:"NeoMBP14",machine:"MacBook Pro 14",at:NOW-60*MIN-1});
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.deepEqual(result.participants.map(row=>row.agent),["OraculoMacMini"]);
});

test("task stale se descarta antes de priorizar y gana la misión reciente elegible",async()=>{
  const {db,env,F}=harness({presence:[],now:NOW/1000});
  mission(db,{agent:"OraculoMacMini",machine:"MacMini",at:NOW-10*MIN,title:"Misión reciente"});
  db.prepare("INSERT INTO mission_tasks(mission_id,code,title,status,owner,updated_at) VALUES (?,?,?,?,?,?)").run("M1","a","Tarea stale","in_progress","SubOraculoMacMini",NOW-3*60*MIN);
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.count,1);
  assert.equal(result.participants[0].kind,"mission");
  assert.equal(result.participants[0].executor,"OraculoMacMini");
});

test("presence rescata task stale y conserva prioridad task y ejecutor Sub/Infra",async()=>{
  const {db,env,F}=harness({presence:[processRow("Oraculo","MacMini")],now:NOW/1000});
  mission(db,{agent:"OraculoMacMini",machine:"MacMini",at:NOW-3*60*MIN});
  db.exec(`INSERT INTO mission_tasks(mission_id,code,title,status,owner,updated_at) VALUES
    ('M1','a','Implementación','in_progress','SubOraculoMacMini',${NOW-3*60*MIN}),
    ('M1','a1','QA','doing','InfraOraculoMacMini',${NOW-2*60*MIN})`);
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.count,1);
  assert.equal(result.participants[0].kind,"task");
  assert.equal(result.participants[0].executor,"InfraOraculoMacMini");
  assert.equal(result.participants[0].operational_basis,"verified_process");
});

test("Mini y MacMini colapsan con process_snapshot y owner genérico",async()=>{
  const {db,env,F}=harness({presence:[processRow("Oraculo","MacMini")],now:NOW/1000});
  mission(db,{id:"M1",agent:"OraculoMini",machine:"admira-macmini",at:NOW-3*60*MIN});
  db.prepare("INSERT INTO mission_tasks(mission_id,code,title,status,owner,updated_at) VALUES (?,?,?,?,?,?)").run("M1","b","Ejecutar","active","subagente",NOW-3*60*MIN);
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.equal(result.count,1);
  assert.equal(result.participants[0].agent,"OraculoMacMini");
  assert.equal(result.participants[0].executor,"SubOraculoMini");
});

test("process_snapshot main, Sub o Infra resuelve a la misma familia canónica",async()=>{
  for (const persona of ["OraculoMini","SubOraculoMini","InfraOraculoMini"]) {
    const {db,env,F}=harness({presence:[processRow(persona,"MacMini")],now:NOW/1000});
    mission(db,{agent:"OraculoMacMini",machine:"MacMini",at:NOW-3*60*MIN});
    const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
    assert.equal(result.count,1,persona);
    assert.equal(result.participants[0].agent,"OraculoMacMini",persona);
  }
});

test("objetivo estudio reciente entra; Consejo, nueva y sin máquina no",async()=>{
  const {db,env,F}=harness({presence:[],now:NOW/1000});
  db.exec(`INSERT INTO ideas VALUES
    ('I1','Objetivo activo','estudio','OraculoMacMini','OraculoMacMini',${NOW-10*MIN},${NOW-10*MIN}),
    ('I2','Borrador','nueva','NeoMacMini','NeoMacMini',${NOW},${NOW}),
    ('I3','Consejo','estudio','CEO · Steve Jobs','',${NOW},${NOW}),
    ('I4','Sin máquina','estudio','Morfeo','Morfeo',${NOW},${NOW})`);
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,NOW)));
  assert.deepEqual(result.participants.map(row=>row.agent),["OraculoMacMini"]);
});

test("endpoint GET agregado no expone payload de presence ni datos privados",()=>{
  assert.match(source,/url\.pathname === "\/highscore\/active-work" && req\.method === "GET"/);
  const fn=grab("highscoreActiveWork");
  assert.doesNotMatch(fn,/\bLIMIT\b|\/tasks\/all|\/fleet\/missions|\breport\b|\bbody\b|proof_image|image|pid|host|runtime/);
  assert.match(fn,/priority = \{ objective:1, mission:2, task:3 \}/);
  assert.match(fn,/missionVisibleDetails/);
  assert.match(fn,/taskVisibleDetails/);
});
