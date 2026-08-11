import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {DatabaseSync} from "node:sqlite";
import {readFile} from "node:fs/promises";
import {madridDayKey,madridDayStart} from "../src/display-ref.js";
import {missionDayRange} from "../src/mission-visible.js";
import {parseAgentIdentity,reportAgentFamily,scopedAgentIdentity} from "../src/agent-identity.js";

const source=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
const grab=name=>{
  const re=new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}\\n__name\\(${name}, "${name}"\\);`),match=re.exec(source);
  assert.ok(match,`no se pudo extraer ${name}`); return match[0];
};
const grabVar=name=>{
  const re=new RegExp(`var ${name} = [^\\n]+;`),match=re.exec(source);
  assert.ok(match,`no se pudo extraer ${name}`); return match[0];
};

function harness(){
  const db=new DatabaseSync(":memory:");
  db.exec("CREATE TABLE ideas(id TEXT PRIMARY KEY,author TEXT,created_at INTEGER)");
  db.exec("CREATE TABLE decisions(id TEXT PRIMARY KEY,agent TEXT,machine TEXT,created_at INTEGER)");
  db.exec("CREATE TABLE tickets(id TEXT PRIMARY KEY,source TEXT,status TEXT,assignee TEXT,loc TEXT,closure_reason TEXT,created_at INTEGER)");
  db.exec("CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,status TEXT,owner TEXT,updated_at INTEGER)");
  db.exec("CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id TEXT,ts INTEGER,kind TEXT,author TEXT,text TEXT)");
  const DB={prepare(sql){const stmt=db.prepare(sql);return{bind(...args){return{all:async()=>({results:stmt.all(...args)})}}}}};
  const scopedMissionOwner=(owner,role,assignee,machine)=>scopedAgentIdentity(owner||assignee,machine,role);
  const context=vm.createContext({Map,Set,Array,String,Number,Date,RegExp,Math,Object,Promise,
    madridDayKey,madridDayStart,missionDayRange,parseAgentIdentity,reportAgentFamily,scopedMissionOwner,__name:(fn)=>fn});
  vm.runInContext([
    grabVar("HIGHSCORE_WEIGHTS"),grabVar("HIGHSCORE_TASK_WEIGHTS"),grabVar("HIGHSCORE_INTERNAL_YOKUP_TRANSITION_SQL"),
    grabVar("HIGHSCORE_MISSION_STARTED_SQL"),grabVar("HIGHSCORE_PERSONAS"),grabVar("AGENT_SOURCE_SQL_T"),
    grab("highscoreAgent"),grab("highscoreNaturalPeriods"),grab("highscoreHistory")
  ].join("\n"),context);
  return {db,env:{DB},F:context};
}

test("semana y mes son naturales de Madrid, incluidos medianoche y DST",()=>{
  const {F}=harness();
  const summer=JSON.parse(JSON.stringify(F.highscoreNaturalPeriods(Date.UTC(2026,7,11,12))));
  assert.equal(summer.today,"2026-08-11");
  assert.equal(summer.week_key,"2026-08-10");
  assert.equal(summer.month_key,"2026-08-01");
  assert.equal(summer.week_start,Date.UTC(2026,7,9,22),"lunes 00:00 CEST");
  const winter=JSON.parse(JSON.stringify(F.highscoreNaturalPeriods(Date.UTC(2026,0,15,12))));
  assert.equal(winter.week_key,"2026-01-12");
  assert.equal(winter.month_start,Date.UTC(2025,11,31,23),"día 1 00:00 CET");
});

test("histórico usa hechos canónicos, identidad exacta y deduplicación diaria A/B/C",async()=>{
  const {db,env,F}=harness(),now=Date.UTC(2026,7,11,12),aug1=Date.UTC(2026,7,1,8),aug10=Date.UTC(2026,7,10,8);
  db.exec(`INSERT INTO ideas VALUES ('I1','MorfeoMBP16',${aug10}),('I2','MorfeoMBP14',${aug10})`);
  db.exec(`INSERT INTO decisions VALUES
    ('D1','MorfeoMBP16','MacBook Pro 16',${aug1}),('D2','MorfeoMBP16','MacBook Pro 16',${aug10}),
    ('D3','MorfeoMBP14','MacBook Pro 14',${aug10}),('DF','MorfeoMBP16','MacBook Pro 16',${now+60000})`);
  db.exec(`INSERT INTO tickets VALUES
    ('M1','decision-batch','in_progress','MorfeoMBP16','MacBook Pro 16',NULL,${aug10}),
    ('EQ','fleet','cancelled','MorfeoMBP16','MacBook Pro 16','equivalent_mission',${aug10})`);
  db.exec(`INSERT INTO mission_tasks VALUES
    ('M1','a','done','SubMorfeoMBP16',${aug10+1000}),('M1','a1','in_progress','SubMorfeoMBP16',${aug10+2000}),
    ('M1','b','done','SubMorfeoMBP16',${aug10+3000}),('EQ','c','done','SubMorfeoMBP16',${aug10+4000})`);
  const result=JSON.parse(JSON.stringify(await F.highscoreHistory(env,"MorfeoMBP16",now)));
  assert.equal(result.ok,true);
  assert.equal(result.agent,"MorfeoMBP16");
  assert.deepEqual(result.periods.week,{start:"2026-08-10",end:"2026-08-11",objectives:1,windows:1,missions:1,tasks:2,points:108});
  assert.deepEqual(result.periods.month,{start:"2026-08-01",end:"2026-08-11",objectives:1,windows:2,missions:1,tasks:2,points:116});
  assert.deepEqual(result.periods.total,{start:"2026-08-01",end:"2026-08-11",objectives:1,windows:2,missions:1,tasks:2,points:116});
  assert.equal(result.evolution.days.at(-2).day,"2026-08-10");
  assert.equal(result.evolution.days.at(-2).points,108);
  assert.equal(result.evolution.days.at(-1).day,"2026-08-11");
  assert.equal(result.evolution.days.at(-1).points,0);
  assert.ok(Number.isInteger(result.sampled_at)&&result.sampled_at>0);
  assert.equal(result.sampled_at,result.generated_at);
});

test("identidad sin apellido o de ejecución se rechaza y la ruta es GET explícito",async()=>{
  const {env,F}=harness();
  assert.equal((await F.highscoreHistory(env,"Morfeo",Date.now())).ok,false);
  assert.equal((await F.highscoreHistory(env,"SubMorfeoMBP16",Date.now())).ok,false);
  assert.match(source,/url\.pathname === "\/highscore\/history" && req\.method === "GET"/);
  assert.match(source,/return json\(history, history\.ok \? 200 : 400\)/);
});
