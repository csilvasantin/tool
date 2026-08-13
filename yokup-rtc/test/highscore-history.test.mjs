import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {DatabaseSync} from "node:sqlite";
import {readFile} from "node:fs/promises";
import {madridDayKey,madridDayStart} from "../src/display-ref.js";
import {missionDayRange} from "../src/mission-visible.js";
import {identityKey,parseAgentIdentity,reportAgentFamily,reportAgentIdentity,scopedAgentIdentity} from "../src/agent-identity.js";

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
  db.exec("CREATE TABLE tickets(id TEXT PRIMARY KEY,source TEXT,role TEXT,status TEXT,assignee TEXT,loc TEXT,closure_reason TEXT,created_at INTEGER,started_at INTEGER,updated_at INTEGER,live_at INTEGER,resolved_at INTEGER,subject TEXT,project TEXT,project_id TEXT,proof_image TEXT)");
  db.exec("CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,status TEXT,owner TEXT,updated_at INTEGER,title TEXT,executor TEXT,started_at INTEGER,created_at INTEGER)");
  db.exec("CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id TEXT,ts INTEGER,kind TEXT,author TEXT,text TEXT)");
  const DB={prepare(sql){const stmt=db.prepare(sql);return{bind(...args){return{
    all:async()=>({results:stmt.all(...args)}),first:async()=>stmt.get(...args)
  }}}}};
  const scopedMissionOwner=(owner,role,assignee,machine)=>scopedAgentIdentity(owner||assignee,machine,role);
  const context=vm.createContext({Map,Set,Array,String,Number,Date,RegExp,Math,Object,Promise,
    madridDayKey,madridDayStart,missionDayRange,identityKey,parseAgentIdentity,reportAgentFamily,reportAgentIdentity,scopedMissionOwner,__name:(fn)=>fn});
  vm.runInContext([
    grabVar("HIGHSCORE_WEIGHTS"),grabVar("HIGHSCORE_TASK_WEIGHTS"),grabVar("HIGHSCORE_INTERNAL_YOKUP_TRANSITION_SQL"),
    grabVar("HIGHSCORE_MISSION_STARTED_SQL"),grabVar("HIGHSCORE_WORK_STARTED_SQL"),grabVar("HIGHSCORE_MISSION_PROGRESS_SQL"),
    grabVar("HIGHSCORE_PERSONAS"),grabVar("AGENT_SOURCE_SQL_T"),grabVar("MISSION_SCOPE_SQL_T"),
    grabVar("HIGHSCORE_HISTORY_PERIODS"),grab("highscoreAgent"),grab("highscoreNaturalPeriods"),
    grab("highscoreHistoryRange"),grab("highscoreHistoryDayKeys"),grab("highscoreCanonicalHistoryFamily"),grab("highscoreProjectHistory"),grab("highscoreHistory")
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
  assert.deepEqual(todayResult.ranking,{project_id:"yokup",period:"today",
    ordered:[{agent:"MorfeoMBP16",points:83,position:1},{agent:"MorfeoMBP14",points:20,position:2}],current_index:0,
    previous:null,next:{agent:"MorfeoMBP14",points:20,position:2}});
  assert.equal(todayResult.latest_work,null,"sin cierre/progreso factual no inventa trabajo reciente");
  const yesterdayResult=JSON.parse(JSON.stringify(await F.highscoreProjectHistory(env,"MorfeoMBP16","yokup","yesterday",now)));
  assert.equal(yesterdayResult.range.end,todayResult.range.start);
  assert.equal(yesterdayResult.evolution.days.length,1);
});

test("pixeria permanece pura aunque el último trabajo de Trinity sea admira-tv",async()=>{
  const {db,env,F}=harness(),now=Date.UTC(2026,7,13,18),morning=Date.UTC(2026,7,13,9,28),evening=Date.UTC(2026,7,13,17,17);
  db.exec("INSERT INTO projects VALUES ('pixeria','Pixeria'),('admira-tv','Admira TV')");
  db.exec(`INSERT INTO tickets(id,source,status,assignee,loc,closure_reason,created_at,started_at,updated_at,live_at,resolved_at,subject,project,project_id,proof_image) VALUES
    ('PIX-1','fleet','resolved','TrinityMBP14','MacBookProNegro14',NULL,${morning},${morning},${morning},${morning},${morning},'Trabajo de Pixeria','Pixeria','pixeria','proof'),
    ('DCL-msrt8i1zu0ky','fleet','resolved','TrinityMBP14','MacBookProNegro14',NULL,${evening-617601},${evening-617601},${evening},${evening},${evening},'Status integral del player remoto','Admira TV','admira-tv','proof')`);
  db.exec(`INSERT INTO mission_tasks(mission_id,code,status,owner,updated_at,title,executor,started_at,created_at) VALUES
    ('PIX-1','a','done','TrinityMBP14',${morning},'Pixeria A','SubTrinityMBP14',${morning},${morning}),
    ('DCL-msrt8i1zu0ky','a','done','TrinityMBP14',${evening},'Player A','SubTrinityMBP14',${evening-617601},${evening-617601})`);
  const result=JSON.parse(JSON.stringify(await F.highscoreProjectHistory(env,"TrinityMBP14","pixeria","today",now)));
  assert.ok(result.timeline.every(row=>row.project_id==="pixeria"));
  assert.equal(result.metrics.points,55);
  assert.equal(result.ranking.project_id,"pixeria");
  assert.deepEqual(result.ranking.ordered,[{agent:"TrinityMBP14",points:55,position:1}]);
  assert.equal(result.latest_work.project_id,"admira-tv");
  assert.equal(result.latest_work.executor,"SubTrinityMBP14");
  assert.match(result.latest_work.detail_url,/project_id=admira-tv/);
});

test("ranking canonicaliza OraculoMacMini en OraculoMini, suma 875+40 y renumera",async()=>{
  const {db,env,F}=harness(),now=Date.UTC(2026,7,13,18),at=Date.UTC(2026,7,13,8);
  db.exec("INSERT INTO projects VALUES ('yokup','Yokup')");
  db.exec(`INSERT INTO ideas(id,author,created_at,title,author_identity,project) VALUES
    ('O-OBJ','OraculoMini',${at},'Objetivo','OraculoMini','yokup')`);
  for(let i=0;i<21;i++) db.prepare(
    "INSERT INTO tickets(id,source,role,status,assignee,loc,closure_reason,created_at,started_at,updated_at,live_at,resolved_at,subject,project,project_id,proof_image) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).run(`O-${i}`,'decision-batch','mission','resolved','OraculoMini','MacMini',null,at+i,at+i,at+i,at+i,at+i,`Misión ${i}`,'Yokup','yokup','proof');
  db.prepare("INSERT INTO mission_tasks(mission_id,code,status,owner,updated_at,title,executor,started_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .run('O-0','a','done','OraculoMini',at+100,'Tarea A','SubOraculoMini',at,at);
  db.prepare("INSERT INTO tickets(id,source,role,status,assignee,loc,closure_reason,created_at,started_at,updated_at,live_at,resolved_at,subject,project,project_id,proof_image) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run('O-LEGACY','decision-batch','mission','resolved','OraculoMacMini','MacMini',null,at+200,at+200,at+200,at+200,at+200,'Misión legacy','Yokup','yokup','proof');
  db.prepare("INSERT INTO tickets(id,source,role,status,assignee,loc,closure_reason,created_at,started_at,updated_at,live_at,resolved_at,subject,project,project_id,proof_image) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run('T-1','decision-batch','mission','resolved','TrinityMBP14','MacBookProNegro14',null,at+300,at+300,at+300,at+300,at+300,'Misión Trinity','Yokup','yokup','proof');

  const result=JSON.parse(JSON.stringify(await F.highscoreProjectHistory(env,'OraculoMini','yokup','today',now)));
  assert.equal(result.agent,'OraculoMini');
  assert.equal(result.metrics.points,915,"timeline y total también conservan los 40 puntos legacy");
  assert.deepEqual(result.ranking,{project_id:'yokup',period:'today',ordered:[
    {agent:'OraculoMini',points:915,position:1},{agent:'TrinityMBP14',points:40,position:2}
  ],current_index:0,previous:null,next:{agent:'TrinityMBP14',points:40,position:2}});
  assert.equal(result.ranking.ordered.some(row=>row.agent==='OraculoMacMini'),false);
  const legacyRequest=JSON.parse(JSON.stringify(await F.highscoreProjectHistory(env,'OraculoMacMini','yokup','today',now)));
  assert.equal(legacyRequest.agent,'OraculoMini');
  assert.equal(legacyRequest.ranking.current_index,0);
});

test("ranking devuelve todos los puntuados, excluye cero y corta navegación en los extremos",async()=>{
  const {db,env,F}=harness(),now=Date.UTC(2026,7,13,18),today=Date.UTC(2026,7,13,8),yesterday=Date.UTC(2026,7,12,8);
  db.exec("INSERT INTO projects VALUES ('scope','Scope'),('otro','Otro')");
  const agents=[
    ['OraculoMini','MacMini',5],['TrinityMBP14','MacBookProNegro14',4],['MorfeoMBP16','MacBookPro16',3],
    ['NeoMBAAzul','MacBookAirAzul',2],['SmithMBP14','MacBookProNegro14',1]
  ];
  for(const [agent,machine,count] of agents) for(let i=0;i<count;i++) db.prepare(
    "INSERT INTO tickets(id,source,role,status,assignee,loc,closure_reason,created_at,started_at,updated_at,live_at,resolved_at,subject,project,project_id,proof_image) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).run(`${agent}-${i}`,'decision-batch','mission','resolved',agent,machine,null,today+i,today+i,today+i,today+i,today+i,'Trabajo','Scope','scope','proof');
  // Mismo agente y fecha, pero otro proyecto: jamás entra en el ranking scope.
  db.prepare("INSERT INTO tickets(id,source,role,status,assignee,loc,closure_reason,created_at,started_at,updated_at,live_at,resolved_at,subject,project,project_id,proof_image) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run('SMITH-OTRO','decision-batch','mission','resolved','SmithMBP14','MacBookProNegro14',null,today,today,today,today,today,'Ajeno','Otro','otro','proof');

  for(const period of ['today','week','month','year']) {
    const result=JSON.parse(JSON.stringify(await F.highscoreProjectHistory(env,'SmithMBP14','scope',period,now)));
    assert.deepEqual(result.ranking.ordered.map(row=>[row.agent,row.points,row.position]),[
      ['OraculoMini',200,1],['TrinityMBP14',160,2],['MorfeoMBP16',120,3],['NeoMBAAzul',80,4],['SmithMBP14',40,5]
    ],period);
    assert.equal(result.ranking.current_index,4,period);
    assert.deepEqual(result.ranking.previous,{agent:'NeoMBAAzul',points:80,position:4},period);
    assert.equal(result.ranking.next,null,period);
    // Contrato suficiente para la gráfica comparativa: una sola verdad factual.
    // max y ratio son derivados exactos; no existe un segundo array comparison
    // que pueda divergir del ranking o reintroducir agentes sin puntos.
    const max=result.ranking.ordered[0].points;
    const bars=result.ranking.ordered.map((row,index)=>({
      agent:row.agent,points:row.points,position:row.position,
      ratio:row.points/max,current:index===result.ranking.current_index
    }));
    assert.deepEqual(bars,[
      {agent:'OraculoMini',points:200,position:1,ratio:1,current:false},
      {agent:'TrinityMBP14',points:160,position:2,ratio:.8,current:false},
      {agent:'MorfeoMBP16',points:120,position:3,ratio:.6,current:false},
      {agent:'NeoMBAAzul',points:80,position:4,ratio:.4,current:false},
      {agent:'SmithMBP14',points:40,position:5,ratio:.2,current:true}
    ],period);
    assert.equal('comparison' in result,false,"no duplica la fuente factual");
  }
  // Ayer conserva el mismo contrato completo con un conjunto factual distinto.
  for(const [index,[agent,machine]] of agents.entries()) db.prepare(
    "INSERT INTO decisions(id,agent,machine,created_at,question,status,project) VALUES(?,?,?,?,?,?,?)"
  ).run(`Y-${index}`,agent,machine,yesterday+index,'Ventana','decided','scope');
  const previousDay=JSON.parse(JSON.stringify(await F.highscoreProjectHistory(env,'SmithMBP14','scope','yesterday',now)));
  assert.equal(previousDay.ranking.ordered.length,5);
  assert.ok(previousDay.ranking.ordered.every(row=>row.points===8));
  assert.deepEqual(previousDay.ranking.ordered.map(row=>row.position),[1,2,3,4,5]);
  assert.deepEqual(previousDay.ranking.ordered.map(row=>row.agent),[
    'MorfeoMBP16','NeoMBAAzul','OraculoMini','SmithMBP14','TrinityMBP14'
  ],"empate estable por identidad canónica");

  const zero=JSON.parse(JSON.stringify(await F.highscoreProjectHistory(env,'TrinityMBA16','scope','today',now)));
  assert.equal(zero.metrics.points,0);
  assert.equal(zero.ranking.ordered.length,5);
  assert.equal(zero.ranking.ordered.some(row=>row.agent==='TrinityMBA16'),false);
  assert.equal(zero.ranking.current_index,null);
  assert.equal(zero.ranking.previous,null);assert.equal(zero.ranking.next,null);
  const first=JSON.parse(JSON.stringify(await F.highscoreProjectHistory(env,'OraculoMini','scope','today',now)));
  assert.equal(first.ranking.current_index,0);assert.equal(first.ranking.previous,null);
  assert.deepEqual(first.ranking.next,{agent:'TrinityMBP14',points:160,position:2});
  const singleton=JSON.parse(JSON.stringify(await F.highscoreProjectHistory(env,'SmithMBP14','otro','today',now)));
  assert.deepEqual(singleton.ranking,{project_id:'otro',period:'today',ordered:[
    {agent:'SmithMBP14',points:40,position:1}
  ],current_index:0,previous:null,next:null});
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
