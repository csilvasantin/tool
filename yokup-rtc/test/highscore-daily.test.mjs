import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {DatabaseSync} from "node:sqlite";
import {readFile} from "node:fs/promises";
import {madridDayKey,madridDayStart} from "../src/display-ref.js";
import {machineSuffix} from "../src/agent-identity.js";

const source=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
const grab=name=>{
  const re=new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}\\n__name\\(${name}, "${name}"\\);`),m=re.exec(source);
  assert.ok(m,`no se pudo extraer ${name}`);return m[0];
};
const grabVar=name=>{
  const re=new RegExp(`var ${name} = [^\\n]+;`),m=re.exec(source);
  assert.ok(m,`no se pudo extraer ${name}`);return m[0];
};

function harness(){
  const db=new DatabaseSync(":memory:");
  db.exec("CREATE TABLE ideas(id TEXT PRIMARY KEY,title TEXT,author TEXT,status TEXT,project TEXT,decision_id TEXT,mission_id TEXT,created_at INTEGER,updated_at INTEGER)");
  db.exec("CREATE TABLE decisions(id TEXT PRIMARY KEY,machine TEXT,agent TEXT,question TEXT,status TEXT,project TEXT,mission TEXT,parent_decision TEXT,batch_id TEXT,created_at INTEGER,decided_at INTEGER)");
  db.exec("CREATE TABLE tickets(id TEXT PRIMARY KEY,subject TEXT,loc TEXT,source TEXT,status TEXT,assignee TEXT,project TEXT,created_at INTEGER,updated_at INTEGER)");
  db.exec("CREATE TABLE mission_batches(id TEXT PRIMARY KEY,decision_id TEXT)");
  db.exec("CREATE TABLE mission_batch_items(batch_id TEXT,position INTEGER,mission_id TEXT)");
  db.exec("CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,title TEXT,status TEXT,owner TEXT,created_at INTEGER,updated_at INTEGER)");
  db.exec("CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id TEXT,ts INTEGER,kind TEXT,author TEXT,text TEXT)");
  db.exec("CREATE TABLE highscore_snapshots(agent_key TEXT,agent TEXT,machine TEXT,sampled_at INTEGER,points INTEGER,PRIMARY KEY(agent_key,sampled_at))");
  const DB={prepare(sql){const stmt=db.prepare(sql);return{bind(...args){return{first:async()=>stmt.get(...args)||null,run:async()=>({meta:stmt.run(...args)}),all:async()=>({results:stmt.all(...args)})}},first:async()=>stmt.get()||null,all:async()=>({results:stmt.all()})}}};
  // machineSuffix entra en el sandbox como el resto: el marcador agrupa por el
  // APELLIDO canonico de la maquina, porque el mismo equipo llega escrito como
  // 'macmini', 'admira-macmini' o 'MacMini' segun quien escriba.
  const context=vm.createContext({Map,Set,Array,String,Number,Date,RegExp,Math,Object,madridDayKey,madridDayStart,machineSuffix,
    reportAgentIdentity:(agent)=>String(agent||""),
    scopedMissionOwner:(owner,_role,assignee)=>String(owner||assignee||""),
    __name:(fn)=>fn});
  vm.runInContext([
    grabVar("HIGHSCORE_WEIGHTS"),grabVar("HIGHSCORE_TASK_WEIGHTS"),grabVar("HIGHSCORE_RECENT_MS"),
    grabVar("HIGHSCORE_TREND_MS"),grabVar("HIGHSCORE_TREND_TOLERANCE_MS"),
    grabVar("HIGHSCORE_INTERNAL_YOKUP_TRANSITION_SQL"),grabVar("HIGHSCORE_MISSION_STARTED_SQL"),grabVar("HIGHSCORE_PERSONAS"),
    grabVar("AGENT_SOURCE_SQL"),grabVar("AGENT_SOURCE_SQL_T"),grab("highscoreAgent"),
    grab("highscoreTraceability"),grab("highscoreCurrentTotals"),grab("highscoreHourlyTrend"),grab("highscoreDaily")
  ].join("\n"),context);
  return{db,env:{DB},F:context};
}

const HOY=Date.now();
const AYER=madridDayStart(HOY)-1000;   // un segundo antes de la medianoche de Madrid

test("solo puntúan agentes de la flota: ni asientos del Consejo ni Carlos", () => {
  const {F}=harness();
  assert.equal(F.highscoreAgent("Oráculo"),"Oráculo");
  assert.equal(F.highscoreAgent("Neo16 (Claude)"),"Neo16","el runtime entre paréntesis no es parte del nombre");
  assert.equal(F.highscoreAgent("Carlos · Oraculo"),"Oraculo","firma compartida: puntúa el agente, no el humano");
  assert.equal(F.highscoreAgent("MorfeoAir16"),"MorfeoAir16");
  assert.equal(F.highscoreAgent("CEO · Steve Jobs"),"","un asiento del Consejo no es un agente");
  assert.equal(F.highscoreAgent("Carlos"),"");
  assert.equal(F.highscoreAgent(""),"");
});

test("el marcador diario suma objetivos, ventanas y misiones del día de Madrid", async () => {
  const {db,env,F}=harness();
  db.exec(`INSERT INTO ideas(id,title,author,status,created_at) VALUES
    ('I1','a','Oráculo','nueva',${HOY}),
    ('I2','b','Oráculo','nueva',${HOY}),
    ('I3','c','CEO · Steve Jobs','nueva',${HOY}),
    ('I4','d','Oráculo','nueva',${AYER})`);
  db.exec(`INSERT INTO decisions(id,machine,agent,question,status,created_at) VALUES
    ('D1','MacBookAirRosa','NeoMBARosa','¿?','live',${HOY}),
    ('D2','MacBookAirRosa','NeoMBARosa','¿?','live',${HOY}),
    ('D3','MacBookAirAzul','TrinityMBAAzul','¿?','live',${HOY}),
    ('D4','MacBookAirRosa','NeoMBARosa','¿?','decided',${AYER})`);
  db.exec(`INSERT INTO tickets(id,subject,loc,source,status,assignee,created_at,updated_at) VALUES
    ('FLT-1','x','MacBookAirRosa','fleet','in_progress','NeoMBARosa',${AYER},${HOY}),
    ('FLT-2','y','MacBookAirRosa','fleet','resolved','NeoMBARosa',${AYER},${HOY}),
    ('FLT-3','z','MacBookAirRosa','fleet','open','NeoMBARosa',${HOY},${HOY}),
    ('FLT-4','w','MacBookAirRosa','fleet','in_progress','NeoMBARosa',${AYER},${AYER}),
    ('FLT-5','cerrada hoy pero iniciada ayer','MacBookAirRosa','fleet','resolved','NeoMBARosa',${AYER},${HOY}),
    ('MIS-DEC-1-01','u','MacBookAirRosa','decision-batch','in_progress','NeoMBARosa',${HOY},${HOY}),
    ('INC-9','v','tienda','web','in_progress','tecnico',${HOY},${HOY})`);
  db.exec(`INSERT INTO events(ticket_id,ts,kind,author,text) VALUES
    ('FLT-1',${HOY},'status','yokup','Estado → in_progress'),
    ('FLT-2',${HOY},'log','yokup','Misión entregada al CLI de Neo en MacBookAirRosa; pasa a EN CURSO.'),
    ('FLT-4',${AYER},'status','yokup','Estado → in_progress'),
    ('FLT-5',${AYER},'status','yokup','Estado → in_progress')`);

  // El vm vive en otro realm: se cruza por JSON para comparar como lo verá el front.
  const d=JSON.parse(JSON.stringify(await F.highscoreDaily(env)));
  assert.equal(d.ok,true);
  assert.equal(d.day,madridDayKey(HOY));
  assert.deepEqual(d.weights,{objective:20,window:8,mission:40});

  const rosa=d.scores.find(s=>s.agent==="NeoMBARosa");
  assert.ok(rosa,"NeoMBARosa tiene que puntuar: abrió ventanas y trabajó misiones hoy");
  assert.equal(rosa.machine,"MacBookAirRosa");
  assert.equal(rosa.windows,2,"solo las ventanas abiertas HOY");
  assert.equal(rosa.window_points,16);
  assert.equal(rosa.missions,3,"cuentan las dos puertas: bandeja de encargos Y ventana de decisión");
  assert.equal(rosa.mission_points,120);
  assert.ok(!d.traceability.unlinked.some(x=>x.id==="FLT-5"),"cerrar hoy una misión iniciada ayer no vuelve a puntuar ni entra en la traza diaria");

  const oraculo=d.scores.find(s=>s.agent==="Oráculo");
  assert.equal(oraculo.objectives,2,"solo los objetivos creados hoy");
  assert.equal(oraculo.objective_points,40);
  assert.equal(oraculo.machine,"","el objetivo no trae máquina: lo funde el marcador");

  assert.ok(!d.scores.some(s=>/steve|carlos|tecnico/i.test(s.agent)),"nadie ajeno a la flota entra en la tabla");
  const azul=d.scores.find(s=>s.agent==="TrinityMBAAzul");
  assert.equal(azul.windows,1);
  assert.equal(azul.missions,0);
  assert.equal(d.traceability.version,1);
  assert.equal(d.traceability.coverage.objectives,3,"la cobertura conserva también el objetivo no atribuible; scores decide quién puntúa");
  assert.equal(d.traceability.coverage.windows,3);
  assert.equal(d.traceability.coverage.missions,3);
  const consejo=d.traceability.chains.find(c=>c.origin.id==="I3");
  assert.equal(consejo.origin.agent,"");
  assert.equal(consejo.points.objective,0,"un objetivo del Consejo se muestra como hecho real, pero no recibe puntos de agente");
  assert.equal(d.traceability.chains.filter(c=>c.origin.agent==="Oráculo").reduce((n,c)=>n+c.points.objective,0),oraculo.objective_points);
});

test("un día sin actividad devuelve un marcador vacío, no un error", async () => {
  const {env,F}=harness();
  const d=JSON.parse(JSON.stringify(await F.highscoreDaily(env)));
  assert.equal(d.ok,true);
  assert.deepEqual(d.scores,[]);
  assert.deepEqual(d.traceability.chains,[]);
  assert.deepEqual(d.traceability.unlinked,[]);
  assert.equal(d.day,madridDayKey(Date.now()));
});

test("la trazabilidad usa sólo llaves reales para objetivo → ventana → misión → tareas → puntos", async () => {
  const {db,env,F}=harness();
  db.exec(`INSERT INTO ideas(id,title,author,status,project,decision_id,mission_id,created_at,updated_at) VALUES
    ('OBJ-1','Mejorar Highscore','OraculoMacMini','mision','yokup','DEC-1','FLT-9',${HOY},${HOY})`);
  db.exec(`INSERT INTO decisions(id,machine,agent,question,status,project,mission,parent_decision,batch_id,created_at,decided_at) VALUES
    ('DEC-1','MacMini','OraculoMacMini','¿Qué mejora?','decided','yokup','','','B-1',${HOY},${HOY})`);
  db.exec(`INSERT INTO mission_batches(id,decision_id) VALUES ('B-1','DEC-1')`);
  db.exec(`INSERT INTO mission_batch_items(batch_id,position,mission_id) VALUES ('B-1',0,'FLT-9')`);
  db.exec(`INSERT INTO tickets(id,subject,loc,source,status,assignee,project,created_at,updated_at) VALUES
    ('FLT-9','Trazar progreso','MacMini','fleet','in_progress','OraculoMacMini','yokup',${HOY},${HOY})`);
  db.exec(`INSERT INTO events(ticket_id,ts,kind,author,text) VALUES
    ('FLT-9',${HOY},'status','yokup','Estado → in_progress')`);
  db.exec(`INSERT INTO mission_tasks(mission_id,code,title,status,owner,created_at,updated_at) VALUES
    ('FLT-9','a','Contrato','done','SubOraculoMacMini',${HOY},${HOY}),
    ('FLT-9','a1','Prueba','in_progress','InfraOraculoMacMini',${HOY},${HOY + 1}),
    ('FLT-9','b','UI','pending','SubOraculoMacMini',${HOY},${HOY})`);

  const d=JSON.parse(JSON.stringify(await F.highscoreDaily(env)));
  assert.equal(d.traceability.chains.length,1);
  const chain=d.traceability.chains[0];
  assert.equal(chain.origin.type,"objective");
  assert.equal(chain.origin.id,"OBJ-1");
  assert.deepEqual(chain.windows.map(x=>x.id),["DEC-1"]);
  assert.equal(chain.mission.id,"FLT-9");
  assert.deepEqual(chain.tasks.map(x=>x.id),["FLT-9:a","FLT-9:a1","FLT-9:b"]);
  assert.equal(chain.tasks.find(x=>x.id==="FLT-9:a1").scoring,true,"la microtarea más reciente representa a la familia A");
  assert.equal(chain.points.total,20+8+40+25);
  assert.equal(chain.agent,"OraculoMacMini");
  assert.equal(chain.project,"yokup");
  assert.deepEqual(d.traceability.unlinked,[]);
});

test("una FLT directa traza misión → tareas sin fabricar objetivo ni ventana", async () => {
  const {db,env,F}=harness();
  db.exec(`INSERT INTO tickets(id,subject,loc,source,status,assignee,project,created_at,updated_at) VALUES
    ('FLT-10','Misión directa','MacMini','fleet','resolved','NeoMacMini','pixeria',${HOY},${HOY})`);
  db.exec(`INSERT INTO events(ticket_id,ts,kind,author,text) VALUES
    ('FLT-10',${HOY},'status','yokup','Estado → in_progress')`);
  db.exec(`INSERT INTO mission_tasks(mission_id,code,title,status,owner,created_at,updated_at) VALUES
    ('FLT-X','a','Huérfana diaria','done','SubNeoMacMini',${HOY},${HOY})`);
  const d=JSON.parse(JSON.stringify(await F.highscoreDaily(env)));
  assert.equal(d.traceability.chains.length,1);
  assert.equal(d.traceability.chains[0].origin.type,"mission");
  assert.equal(d.traceability.chains[0].origin.id,"FLT-10");
  assert.equal(d.traceability.chains[0].mission.id,"FLT-10");
  assert.deepEqual(d.traceability.chains[0].windows,[]);
  assert.deepEqual(d.traceability.chains[0].tasks,[]);
  assert.equal(d.traceability.chains[0].points.total,40);
  assert.deepEqual(d.traceability.unlinked.map(x=>[x.type,x.id,x.reason]),[
    ["task","FLT-X:a","mission_outside_daily_trace"]
  ]);
});

test("MBP14: FLT-1204 enlaza una tarea done como inicio factual y suma misión + tarea", async () => {
  const {db,env,F}=harness();
  db.exec(`INSERT INTO tickets(id,subject,loc,source,status,assignee,project,created_at,updated_at) VALUES
    ('FLT-1204','Comprobar tareas','macbookpronegro14','fleet','in_progress','TrinityMBP14','yokup',${AYER},${HOY})`);
  db.exec(`INSERT INTO mission_tasks(mission_id,code,title,status,owner,created_at,updated_at) VALUES
    ('FLT-1204','a','Pendiente principal','pending','SubTrinityMBP14',${HOY},${HOY}),
    ('FLT-1204','a1','Comprobación realizada','done','TrinityMBP14',${HOY},${HOY + 1}),
    ('FLT-1204','b','Pendiente B','pending','SubTrinityMBP14',${HOY},${HOY}),
    ('FLT-1204','c','Pendiente C','pending','InfraTrinityMBP14',${HOY},${HOY})`);

  const d=JSON.parse(JSON.stringify(await F.highscoreDaily(env)));
  const trinity=d.scores.find(row=>row.agent==="TrinityMBP14");
  assert.ok(trinity,"la identidad operativa exacta de MBP14 debe aparecer");
  assert.equal(trinity.machine,"macbookpronegro14");
  assert.equal(trinity.missions,1);
  assert.equal(trinity.mission_points,40);

  const chain=d.traceability.chains.find(row=>row.mission && row.mission.id==="FLT-1204");
  assert.ok(chain,"la misión directa debe conservar la cadena factual ticket → tareas");
  assert.equal(chain.origin.type,"mission");
  assert.equal(chain.tasks.find(row=>row.id==="FLT-1204:a1").scoring,true);
  assert.equal(chain.points.mission,40);
  assert.equal(chain.points.tasks,15);
  assert.equal(chain.points.total,55);
  assert.ok(!d.traceability.unlinked.some(row=>row.id==="FLT-1204:a1"));
  assert.equal(d.hourly.scores.find(row=>row.agent==="TrinityMBP14").current,55,
    "la clasificación horaria une misión y tarea cuando comparten identidad exacta");
});

test("MBP16: FLT-1203 abierta CON PLAN sí puntúa — el marcador mide trabajo, no trámite", async () => {
  const {db,env,F}=harness();
  db.exec(`INSERT INTO tickets(id,subject,loc,source,status,assignee,project,created_at,updated_at) VALUES
    ('FLT-1203','Trabajo anunciado fuera del cierre canónico','macbookpro16','fleet','open','NeoMBP16','yokup',${HOY},${HOY})`);
  db.exec(`INSERT INTO mission_tasks(mission_id,code,title,status,owner,created_at,updated_at) VALUES
    ('FLT-1203','a','Implementación','pending','SubNeoMBP16',${HOY},${HOY}),
    ('FLT-1203','b','Despliegue','pending','SubNeoMBP16',${HOY},${HOY}),
    ('FLT-1203','c','QA e informe','pending','InfraNeoMBP16',${HOY},${HOY})`);
  db.exec(`INSERT INTO events(ticket_id,ts,kind,author,text) VALUES
    ('FLT-1203',${HOY},'log','NeoMBP16','Trabajo anunciado y despliegue comunicado')`);

  // Carlos, 5-ago-2026. Antes esta prueba exigia lo contrario: que una mision
  // ABIERTA no puntuara. El dia que se cambio, NeoMBP16 llevaba 11 misiones —mas
  // que nadie— todas con su plan a-b-c hecho, y no salia en el marcador porque
  // nadie habia movido un estado. El marcador media el tramite, no el trabajo.
  // Ahora una mision con PLAN GENERADO cuenta, este reclamada o no.
  const d=JSON.parse(JSON.stringify(await F.highscoreDaily(env)));
  const neo=d.scores.find(row=>row.agent==="NeoMBP16");
  assert.ok(neo, "una mision abierta CON plan tiene que puntuar");
  assert.equal(neo.missions,1);
  // Lo que NO cambia: las tareas pendientes siguen sin sumar. Puntua la mision
  // por tener plan, no el anuncio ni el updated_at.
  assert.equal(neo.objective_points,0);
});

test("MBP16: una mision abierta SIN plan NO puntúa — sin plan no hay trabajo que medir", async () => {
  const {db,env,F}=harness();
  db.exec(`INSERT INTO tickets(id,subject,loc,source,status,assignee,project,created_at,updated_at) VALUES
    ('FLT-1299','Anunciada y sin plan','macbookpro16','fleet','open','NeoMBP16','yokup',${HOY},${HOY})`);
  db.exec(`INSERT INTO events(ticket_id,ts,kind,author,text) VALUES
    ('FLT-1299',${HOY},'log','NeoMBP16','Trabajo anunciado en Agora')`);
  const d=JSON.parse(JSON.stringify(await F.highscoreDaily(env)));
  assert.ok(!d.scores.some(row=>row.agent==="NeoMBP16"),
    "anunciar trabajo sin plan no puede puntuar: seria inflar el marcador con mensajes");
});

test("logs genéricos y mensajes externos no son transiciones puntuables", async () => {
  const {db,env,F}=harness();
  db.exec(`INSERT INTO tickets(id,subject,loc,source,status,assignee,created_at,updated_at) VALUES
    ('FLT-G','Log libre','macbookpro16','fleet','in_progress','NeoMBP16',${HOY},${HOY}),
    ('FLT-E','Mensaje externo','macbookpronegro14','fleet','in_progress','TrinityMBP14',${HOY},${HOY})`);
  db.exec(`INSERT INTO events(ticket_id,ts,kind,author,text) VALUES
    ('FLT-G',${HOY},'log','yokup','Trabajo anunciado y ya en curso según el chat'),
    ('FLT-E',${HOY},'log','AgoraMatrix','Misión entregada al CLI de Trinity en macbookpronegro14; pasa a EN CURSO.')`);
  const d=JSON.parse(JSON.stringify(await F.highscoreDaily(env)));
  assert.ok(!d.scores.some(row=>row.agent==="NeoMBP16" || row.agent==="TrinityMBP14"));
  assert.ok(!d.traceability.chains.some(row=>row.mission && ["FLT-G","FLT-E"].includes(row.mission.id)));
});

test("el auto-claim deja evidencia canónica y el marcador sólo acepta tareas activas o hechas", () => {
  assert.match(source,/UPDATE tickets SET status='in_progress'.*WHERE id=\? AND status='open'/);
  assert.match(source,/Estado → in_progress · primer avance de tarea/);
  assert.match(source,/HIGHSCORE_INTERNAL_YOKUP_TRANSITION_SQL/);
  assert.match(source,/lower\(COALESCE\(e\.author,''\)\)='yokup'/);
  const transitionSql=source.split("var HIGHSCORE_INTERNAL_YOKUP_TRANSITION_SQL =")[1].split(";\n")[0];
  assert.doesNotMatch(transitionSql,/\b(?:LIKE|GLOB)\b/,
    "D1 limita la complejidad de patrones: las plantillas dinámicas usan prefijo y sufijo exactos");
  assert.match(transitionSql,/instr\(lower\(e\.text\)/);
  assert.match(transitionSql,/substr\(lower\(e\.text\),-length\(/);
  assert.match(source,/SELECT MIN\(mt\.updated_at\).*mt\.status IN \('in_progress','done'\)/);
  assert.match(source,/m\.status IN \('in_progress','done'\)/);
});

test("la tendencia de 60 minutos usa una referencia persistida y no memoria del navegador", async () => {
  const {db,env,F}=harness(),ahora=Date.UTC(2026,7,4,16,30,25);
  db.prepare("INSERT INTO highscore_snapshots VALUES(?,?,?,?,?)").run("oraculomacmini","OraculoMacMini","MacMini",ahora-65*60e3,40);
  db.prepare("INSERT INTO highscore_snapshots VALUES(?,?,?,?,?)").run("neomacmini","NeoMacMini","MacMini",ahora-62*60e3,20);
  db.prepare("INSERT INTO highscore_snapshots VALUES(?,?,?,?,?)").run("morfeomba14","MorfeoMBA14","MacBookAir14",ahora-30*60e3,5);

  const first=JSON.parse(JSON.stringify(await F.highscoreHourlyTrend(env,[
    {agent_key:"oraculomacmini",agent:"OraculoMacMini",machine:"MacMini",points:55},
    {agent_key:"neomacmini",agent:"NeoMacMini",machine:"MacMini",points:20},
    {agent_key:"morfeomba14",agent:"MorfeoMBA14",machine:"MacBookAir14",points:15},
  ],ahora)));
  assert.equal(first.window_ms,60*60e3);
  assert.deepEqual(first.scores.map(row=>[row.agent,row.current,row.reference,row.trend,row.reliable]),[
    ["OraculoMacMini",55,40,"up",true],
    ["NeoMacMini",20,20,"same",true],
    ["MorfeoMBA14",15,15,"same",false],
  ]);

  const sampledAt=Math.floor(ahora/6e4)*6e4;
  assert.deepEqual(JSON.parse(JSON.stringify(db.prepare("SELECT agent_key,points FROM highscore_snapshots WHERE sampled_at=? ORDER BY agent_key").all(sampledAt))),[
    {agent_key:"morfeomba14",points:15},{agent_key:"neomacmini",points:20},{agent_key:"oraculomacmini",points:55},
  ]);

  const later=JSON.parse(JSON.stringify(await F.highscoreHourlyTrend(env,[
    {agent_key:"oraculomacmini",agent:"OraculoMacMini",machine:"MacMini",points:75},
  ],ahora+65*60e3)));
  assert.deepEqual(later.scores[0],{
    agent:"OraculoMacMini",machine:"MacMini",current:75,reference:55,
    reference_at:sampledAt,trend:"up",reliable:true,
  },"una ejecución posterior recupera de D1 la muestra guardada por la anterior");
});

test("el payload horario nace de totales autoritativos e incluye las familias A/B/C", async () => {
  const {db,env,F}=harness(),inicio=madridDayStart(HOY),fin=inicio+864e5;
  db.exec(`INSERT INTO tickets(id,loc,source,status,assignee,created_at,updated_at) VALUES
    ('FLT-20','MacMini','fleet','in_progress','OraculoMacMini',${HOY},${HOY})`);
  db.exec(`INSERT INTO mission_tasks(mission_id,code,status,owner,created_at,updated_at) VALUES
    ('FLT-20','a','done','SubOraculoMacMini',${HOY},${HOY}),
    ('FLT-20','a1','in_progress','InfraOraculoMacMini',${HOY},${HOY+1}),
    ('FLT-20','b','done','SubOraculoMacMini',${HOY},${HOY}),
    ('FLT-20','c','pending','SubOraculoMacMini',${HOY},${HOY})`);
  const totals=JSON.parse(JSON.stringify(await F.highscoreCurrentTotals(env,[{
    agent:"OraculoMacMini",machine:"MacMini",objective_points:20,window_points:8,mission_points:40,
  }],inicio,fin)));
  assert.deepEqual(totals.map(row=>[row.agent,row.points]),[
    ["InfraOraculoMacMini",25],["OraculoMacMini",68],["SubOraculoMacMini",15],
  ]);
  assert.match(source,/const hourly = await highscoreHourlyTrend\(env, current, ahora\)/);
  assert.match(source,/return \{ ok: true,[^}]*scores, traceability, hourly \}/);
});

test("la ruta /highscore/daily existe y responde con el marcador", () => {
  assert.match(source,/url\.pathname === "\/highscore\/daily"/);
  assert.match(source,/if \(url\.pathname === "\/highscore\/daily"\) \{\s*await ensureSchema\(env\);\s*await ensureIdeasSchema\(env\);/);
  assert.match(source,/return json\(await highscoreDaily\(env\)\)/);
});

test("la medianoche del marcador es la de Madrid, no la de UTC", () => {
  // 4 de agosto de 2026, 00:30 en Madrid (CEST, UTC+2) = 3 de agosto 22:30 UTC.
  const madrugada=Date.UTC(2026,7,3,22,30);
  assert.equal(madridDayKey(madrugada),"2026-08-04");
  assert.equal(madridDayStart(madrugada),Date.UTC(2026,7,3,22,0),"el día empieza a las 22:00 UTC en verano");
  // Invierno (CET, UTC+1): el 15 de enero de 2026 empieza a las 23:00 UTC del 14.
  const invierno=Date.UTC(2026,0,15,10,0);
  assert.equal(madridDayStart(invierno),Date.UTC(2026,0,14,23,0));
});

test("el ámbito de flota incluye las misiones nacidas de una ventana de decisión", () => {
  // El trabajo de agente entra por tres puertas; el ámbito «fleet» tiene que verlas:
  // bandeja, ventana de decisión y declaración CLI con evidencia.
  assert.match(source, /var AGENT_SOURCE_SQL = "source IN \('fleet','decision-batch','cli-declare'\)"/);
  assert.match(source, /scope === "fleet" \? `WHERE \$\{AGENT_SOURCE_SQL_T\}`/);
  assert.match(source, /scope === "fleet" \? AGENT_SOURCE_SQL/);
  assert.doesNotMatch(source, /scope === "fleet" \? "WHERE t\.source='fleet'"/);
  assert.doesNotMatch(source, /scope === "fleet" \? "source='fleet'"/);
  // Y la bandeja de CAMPO deja de tragarse las misiones de los agentes.
  assert.match(source, /source NOT IN \('fleet','decision-batch','cli-declare'\)/);
  assert.doesNotMatch(source, /source IS NULL OR t\.source!='fleet'/);
});
