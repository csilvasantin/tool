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
const grabVar=name=>{
  const re=new RegExp(`var ${name} = [^\\n]+;`),m=re.exec(source);
  assert.ok(m,`no se pudo extraer ${name}`); return m[0];
};

function harness(){
  const db=new DatabaseSync(":memory:");
  db.exec("CREATE TABLE tickets(id TEXT PRIMARY KEY,subject TEXT,loc TEXT,source TEXT,role TEXT,status TEXT,assignee TEXT,closure_reason TEXT,created_at INTEGER,updated_at INTEGER,live_at INTEGER)");
  db.exec("CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,title TEXT,status TEXT,owner TEXT,updated_at INTEGER)");
  db.exec("CREATE TABLE ideas(id TEXT PRIMARY KEY,title TEXT,status TEXT,author TEXT,author_identity TEXT,created_at INTEGER,updated_at INTEGER)");
  const DB={prepare(sql){const stmt=db.prepare(sql);return{bind(...args){return{all:async()=>({results:stmt.all(...args)})}},all:async()=>({results:stmt.all()})}}};
  const context=vm.createContext({Map,Set,Array,String,Number,Date,RegExp,Math,Object,Promise,
    baseAgentIdentity,parseAgentIdentity,reportAgentFamily,reportAgentIdentity,scopedAgentIdentity,sameAgentFamily,
    __name:(fn)=>fn});
  vm.runInContext([
    grabVar("HIGHSCORE_PERSONAS"),grabVar("MISSION_SCOPE_SQL_T"),grab("highscoreAgent"),
    grab("scopedMissionOwner"),grab("highscoreActiveWork"),
  ].join("\n"),context);
  return {db,env:{DB},F:context};
}

test("la carrera factual devuelve las cuatro familias aunque no haya presencia ni puntos",async()=>{
  const {db,env,F}=harness(),now=1_786_460_000_000;
  db.exec(`INSERT INTO tickets VALUES
    ('M-MOR','Misión Morfeo','MacMini','fleet','mission','in_progress','MorfeoMacMini',NULL,1,100,101),
    ('M-NEO','Misión Neo','MacBook Pro 14','fleet','mission','in_progress','NeoMBP14',NULL,1,110,111),
    ('M-ORA','Misión Oráculo','MacMini','fleet','mission','in_progress','OraculoMacMini',NULL,1,120,121),
    ('M-TRI','Misión Trinity','MacBook Pro 14','fleet','mission','in_progress','TrinityMBP14',NULL,1,130,131)`);
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,now)));
  assert.equal(result.ok,true);
  assert.equal(result.count,4);
  assert.deepEqual(result.participants.map(row=>row.agent).sort(),
    ["MorfeoMacMini","NeoMBP14","OraculoMacMini","TrinityMBP14"]);
  assert.equal(result.generated_at,now);
});

test("principal, Sub e Infra colapsan por familia y gana la tarea real más reciente",async()=>{
  const {db,env,F}=harness();
  db.exec(`INSERT INTO tickets VALUES
    ('M1','Misión principal','MacMini','fleet','mission','in_progress','OraculoMacMini',NULL,1,10,11)`);
  db.exec(`INSERT INTO mission_tasks VALUES
    ('M1','a','Implementación','in_progress','SubOraculoMacMini',20),
    ('M1','a1','QA factual','doing','InfraOraculoMacMini',30)`);
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,40)));
  assert.equal(result.count,1);
  assert.equal(result.participants[0].agent,"OraculoMacMini");
  assert.equal(result.participants[0].executor,"InfraOraculoMacMini");
  assert.equal(result.participants[0].kind,"task");
  assert.equal(result.participants[0].title,"QA factual");
});

test("owner genérico se resuelve con assignee+loc y un relanzamiento factual no depende del latido",async()=>{
  const {db,env,F}=harness();
  db.exec(`INSERT INTO tickets VALUES
    ('M1','Misión','MacBook Pro 14','fleet','mission','resolved','MorfeoMBP14',NULL,1,10,11)`);
  db.exec(`INSERT INTO mission_tasks VALUES ('M1','b','Ejecutar','active','subagente',20)`);
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,30)));
  assert.equal(result.count,1);
  assert.equal(result.participants[0].agent,"MorfeoMBP14");
  assert.equal(result.participants[0].executor,"SubMorfeoMBP14");
});

test("sólo estudio atribuible a AdmiraNeXT entra como objetivo",async()=>{
  const {db,env,F}=harness();
  db.exec(`INSERT INTO ideas VALUES
    ('I1','Objetivo activo','estudio','OraculoMacMini','OraculoMacMini',1,50),
    ('I2','Borrador','nueva','NeoMacMini','NeoMacMini',1,60),
    ('I3','Consejo','estudio','CEO · Steve Jobs','',1,70),
    ('I4','Sin máquina','estudio','Morfeo','Morfeo',1,80)`);
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,90)));
  assert.equal(result.count,1);
  assert.equal(result.participants[0].agent,"OraculoMacMini");
  assert.equal(result.participants[0].kind,"objective");
});

test("misión canónica por role entra aunque sea importada y el título conserva la limpieza visual",async()=>{
  const {db,env,F}=harness();
  db.exec(`INSERT INTO tickets VALUES
    ('M1','[ALTA] **Mejorar Running Man** → texto editorial','MacMini','imported','mission','in_progress','OraculoMacMini',NULL,1,10,11)`);
  const result=JSON.parse(JSON.stringify(await F.highscoreActiveWork(env,20)));
  assert.equal(result.count,1);
  assert.equal(result.participants[0].agent,"OraculoMacMini");
  assert.equal(result.participants[0].title,"Mejorar Running Man");
});

test("el endpoint es GET, usa fuente sin LIMIT y no expone reportes ni cuerpos privados",async()=>{
  assert.match(source,/url\.pathname === "\/highscore\/active-work" && req\.method === "GET"/);
  const fn=grab("highscoreActiveWork");
  assert.doesNotMatch(fn,/\bLIMIT\b|\/tasks\/all|\/fleet\/missions/);
  assert.doesNotMatch(fn,/\breport\b|\bbody\b|proof_image|image/);
  assert.match(fn,/priority = \{ objective:1, mission:2, task:3 \}/);
});
