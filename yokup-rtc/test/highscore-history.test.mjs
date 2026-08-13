import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {DatabaseSync} from "node:sqlite";
import {readFile} from "node:fs/promises";
import {madridDayKey,madridDayStart} from "../src/display-ref.js";
import {missionDayRange} from "../src/mission-visible.js";
import {parseAgentIdentity,reportAgentFamily,reportAgentIdentity,scopedAgentIdentity} from "../src/agent-identity.js";

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
  db.exec("CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT)");
  db.exec("CREATE TABLE ideas(id TEXT PRIMARY KEY,author TEXT,created_at INTEGER,title TEXT,author_identity TEXT,project TEXT)");
  db.exec("CREATE TABLE decisions(id TEXT PRIMARY KEY,agent TEXT,machine TEXT,created_at INTEGER,question TEXT,status TEXT,project TEXT)");
  db.exec("CREATE TABLE tickets(id TEXT PRIMARY KEY,source TEXT,status TEXT,assignee TEXT,loc TEXT,closure_reason TEXT,created_at INTEGER,subject TEXT,project TEXT,project_id TEXT)");
  db.exec("CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,status TEXT,owner TEXT,updated_at INTEGER,title TEXT,executor TEXT)");
  db.exec("CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id TEXT,ts INTEGER,kind TEXT,author TEXT,text TEXT)");
  const DB={prepare(sql){const stmt=db.prepare(sql);return{bind(...args){return{
    all:async()=>({results:stmt.all(...args)}),first:async()=>stmt.get(...args)
  }}}}};
  const scopedMissionOwner=(owner,role,assignee,machine)=>scopedAgentIdentity(owner||assignee,machine,role);
  const context=vm.createContext({Map,Set,Array,String,Number,Date,RegExp,Math,Object,Promise,
    madridDayKey,madridDayStart,missionDayRange,parseAgentIdentity,reportAgentFamily,reportAgentIdentity,scopedMissionOwner,__name:(fn)=>fn});
  vm.runInContext([
    grabVar("HIGHSCORE_WEIGHTS"),grabVar("HIGHSCORE_TASK_WEIGHTS"),grabVar("HIGHSCORE_INTERNAL_YOKUP_TRANSITION_SQL"),
    grabVar("HIGHSCORE_MISSION_STARTED_SQL"),grabVar("HIGHSCORE_PERSONAS"),grabVar("AGENT_SOURCE_SQL_T"),
    grabVar("HIGHSCORE_HISTORY_PERIODS"),grab("highscoreAgent"),grab("highscoreNaturalPeriods"),
    grab("highscoreHistoryRange"),grab("highscoreHistoryDayKeys"),grab("highscoreProjectHistory"),grab("highscoreHistory")
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
  db.exec(`INSERT INTO ideas(id,author,created_at) VALUES ('I1','MorfeoMBP16',${aug10}),('I2','MorfeoMBP14',${aug10})`);
  db.exec(`INSERT INTO decisions(id,agent,machine,created_at) VALUES
    ('D1','MorfeoMBP16','MacBook Pro 16',${aug1}),('D2','MorfeoMBP16','MacBook Pro 16',${aug10}),
    ('D3','MorfeoMBP14','MacBook Pro 14',${aug10}),('DF','MorfeoMBP16','MacBook Pro 16',${now+60000})`);
  db.exec(`INSERT INTO tickets(id,source,status,assignee,loc,closure_reason,created_at) VALUES
    ('M1','decision-batch','in_progress','MorfeoMBP16','MacBook Pro 16',NULL,${aug10}),
    ('EQ','fleet','cancelled','MorfeoMBP16','MacBook Pro 16','equivalent_mission',${aug10})`);
  db.exec(`INSERT INTO mission_tasks(mission_id,code,status,owner,updated_at) VALUES
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

test("hoy, ayer, semana, mes y año usan rangos naturales y una sola fuente factual",async()=>{
  const {db,env,F}=harness(),now=Date.UTC(2026,7,13,12);
  const today=Date.UTC(2026,7,13,8),yesterday=Date.UTC(2026,7,12,8),monday=Date.UTC(2026,7,10,8);
  const month=Date.UTC(2026,7,2,8),year=Date.UTC(2026,1,2,8),old=Date.UTC(2025,11,31,12);
  db.exec("INSERT INTO projects VALUES ('yokup','Yokup'),('otro','Otro')");
  db.exec(`INSERT INTO ideas(id,author,created_at,title,author_identity,project) VALUES
    ('I-T','MorfeoMBP16',${today},'Objetivo hoy','MorfeoMBP16','yokup'),
    ('I-Y','MorfeoMBP16',${yesterday},'Objetivo ayer','MorfeoMBP16','yokup'),
    ('I-W','MorfeoMBP16',${monday},'Objetivo semana','MorfeoMBP16','yokup'),
    ('I-M','MorfeoMBP16',${month},'Objetivo mes','MorfeoMBP16','yokup'),
    ('I-A','MorfeoMBP16',${year},'Objetivo año','MorfeoMBP16','yokup'),
    ('I-OLD','MorfeoMBP16',${old},'Objetivo año anterior','MorfeoMBP16','yokup'),
    ('I-OTHER-ID','MorfeoMBP14',${today},'Otro equipo','MorfeoMBP14','yokup'),
    ('I-OTHER-P','MorfeoMBP16',${today},'Otro proyecto','MorfeoMBP16','otro'),
    ('I-GENERIC','Morfeo',${today},'Firma sin equipo','MorfeoMBP16','yokup')`);
  db.exec(`INSERT INTO decisions(id,agent,machine,created_at,question,status,project) VALUES
    ('D-T','SubMorfeoMBP16','MacBookPro16',${today+1000},'Ventana hoy','decided','yokup'),
    ('D-OTHER','MorfeoMBP16','MacBookPro16',${today+1000},'Ventana ajena','decided','otro')`);
  db.exec(`INSERT INTO tickets(id,source,status,assignee,loc,closure_reason,created_at,subject,project,project_id) VALUES
    ('M-T','decision-batch','resolved','SubMorfeoMBP16','MacBookPro16',NULL,${today+2000},'Misión hoy','Yokup','yokup'),
    ('M-OTHER','decision-batch','resolved','MorfeoMBP16','MacBookPro16',NULL,${today+2000},'Misión ajena','Otro','otro')`);
  db.exec(`INSERT INTO mission_tasks(mission_id,code,status,owner,updated_at,title,executor) VALUES
    ('M-T','a','done','MorfeoMBP16',${today+3000},'Principal A','SubMorfeo'),
    ('M-T','a1','done','MorfeoMBP16',${today+4000},'Subtarea A1','InfraMorfeo'),
    ('M-OTHER','a','done','MorfeoMBP16',${today+5000},'Tarea ajena','SubMorfeoMBP16')`);
  const expected={today:83,yesterday:20,week:123,month:143,year:163};
  for(const [period,points] of Object.entries(expected)){
    const result=JSON.parse(JSON.stringify(await F.highscoreProjectHistory(env,"MorfeoMBP16","yokup",period,now)));
    assert.equal(result.ok,true,period); assert.equal(result.period,period); assert.equal(result.metrics.points,points,period);
    assert.equal(result.timeline.reduce((sum,row)=>sum+row.points,0),points,period);
    assert.equal(result.evolution.days.reduce((sum,row)=>sum+row.points,0),points,period);
    assert.ok(result.timeline.every((row,i,all)=>!i||all[i-1].at>=row.at),period);
    assert.ok(result.timeline.every(row=>row.project_id==="yokup"&&row.agent==="MorfeoMBP16"),period);
  }
  const todayResult=JSON.parse(JSON.stringify(await F.highscoreProjectHistory(env,"MorfeoMBP16","yokup","today",now)));
  assert.deepEqual(todayResult.metrics,{objectives:1,windows:1,missions:1,tasks:1,points:83});
  assert.equal(todayResult.timeline.length,5,"incluye las dos tareas reales, aunque sólo A1 puntúe");
  assert.deepEqual(todayResult.timeline.filter(row=>row.type==="task").map(row=>[row.id,row.points,row.scoring,row.executor]),[
    ["M-T:a1",15,true,"InfraMorfeoMBP16"],["M-T:a",0,false,"SubMorfeoMBP16"]
  ]);
  assert.equal(todayResult.range.start,Date.UTC(2026,7,12,22),"00:00 CEST");
  assert.deepEqual([todayResult.range.from,todayResult.range.to],["2026-08-13","2026-08-13"]);
  const yesterdayResult=JSON.parse(JSON.stringify(await F.highscoreProjectHistory(env,"MorfeoMBP16","yokup","yesterday",now)));
  assert.equal(yesterdayResult.range.end,todayResult.range.start);
  assert.equal(yesterdayResult.evolution.days.length,1);
});

test("scope histórico falla cerrado ante proyecto, periodo o identidad no exactos",async()=>{
  const {db,env,F}=harness(),now=Date.UTC(2026,7,13,12);
  db.exec("INSERT INTO projects VALUES ('yokup','Yokup')");
  assert.equal((await F.highscoreProjectHistory(env,"SubMorfeoMBP16","yokup","today",now)).code,"exact_agent_required");
  assert.equal((await F.highscoreProjectHistory(env,"MorfeoMBP16","Yokup","today",now)).code,"invalid_project_id");
  assert.equal((await F.highscoreProjectHistory(env,"MorfeoMBP16","yokup","quarter",now)).code,"invalid_period");
  assert.match(source,/url\.searchParams\.get\("project_id"\)/);
  assert.match(source,/url\.searchParams\.get\("period"\) \|\| "today"/);
});

test("identidad sin apellido o de ejecución se rechaza y la ruta es GET explícito",async()=>{
  const {env,F}=harness();
  assert.equal((await F.highscoreHistory(env,"Morfeo",Date.now())).ok,false);
  assert.equal((await F.highscoreHistory(env,"SubMorfeoMBP16",Date.now())).ok,false);
  assert.match(source,/url\.pathname === "\/highscore\/history" && req\.method === "GET"/);
  assert.match(source,/return json\(history, history\.ok \? 200 : 400\)/);
});
