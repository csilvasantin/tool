import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { madridDayKey } from "../src/display-ref.js";
import { missionDayRange } from "../src/mission-visible.js";
import {
  AGENT_IDENTITY_SPEC, baseAgentIdentity, identityKey, isKnownPersona, parseAgentIdentity
} from "../src/agent-identity.js";
import { AGENT_SOURCE_SQL_T } from "../src/mission-sources.js";

const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");

function grab(name) {
  const expression = new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}\\n__name\\(${name}, "${name}"\\);`);
  const match = expression.exec(source);
  assert.ok(match, `falta ${name}`);
  return match[0];
}

function grabVar(name) {
  const expression = new RegExp(`var ${name} = [^\\n]+;`);
  const match = expression.exec(source);
  assert.ok(match, `falta ${name}`);
  return match[0];
}

function harness(reverse = false) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE projects(id TEXT,name TEXT)");
  db.exec("CREATE TABLE tickets(id TEXT,source TEXT,role TEXT,status TEXT,assignee TEXT,loc TEXT,closure_reason TEXT,created_at,started_at,updated_at,live_at,resolved_at,subject TEXT,project TEXT,project_id TEXT,proof_image TEXT)");
  db.exec("CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,title TEXT,status TEXT,report TEXT,created_at,started_at,ended_at,updated_at)");
  db.exec("CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id TEXT,ts INTEGER,kind TEXT,author TEXT,text TEXT)");
  const DB = { prepare(sql) {
    const statement = db.prepare(sql);
    return { bind(...args) { return { all:async() => {
      const results = statement.all(...args);
      return { results:reverse ? results.reverse() : results };
    }, first:async() => statement.get(...args) }; } };
  } };
  const attachDisplayRefs = async (_env, _type, rows) => {
    rows.forEach((row) => { row.display_ref = `REF-${row.id}`; });
    return rows;
  };
  const selectIn = async (env, ids, sqlFor) => {
    const placeholders = ids.map(() => "?").join(",");
    return (await env.DB.prepare(sqlFor(placeholders)).bind(...ids).all()).results || [];
  };
  const context = vm.createContext({
    Array, Date, Map, Math, Number, Object, Promise, RegExp, Set, String,
    AGENT_IDENTITY_SPEC, AGENT_SOURCE_SQL_T, attachDisplayRefs, baseAgentIdentity, identityKey,
    isKnownPersona, madridDayKey, missionDayRange, parseAgentIdentity, selectIn,
    encodeURIComponent, __name:(value) => value
  });
  vm.runInContext([
    grabVar("HIGHSCORE_WEIGHTS"),
    grabVar("HIGHSCORE_INTERNAL_YOKUP_TRANSITION_SQL"),
    grabVar("HIGHSCORE_MISSION_STARTED_SQL"),
    grabVar("HIGHSCORE_WORK_STARTED_SQL"),
    grabVar("HIGHSCORE_MISSION_DETAIL_PERIODS"),
    grab("highscoreNaturalPeriods"),
    grab("highscoreActiveWorkMillis"),
    grab("highscoreMissionPeriodRange"),
    grab("highscorePublicTaskSummary"),
    grab("highscoreAgentMissions")
  ].join("\n"), context);
  return { db, env:{DB}, F:context };
}

function seed(db) {
  const now = Date.UTC(2026, 8, 18, 20, 45);
  const insertMission = db.prepare("INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  insertMission.run("M H&1","decision-batch","mission","resolved","LucasGrokBot","GrokBot",null,
    Date.UTC(2026,8,18,20),Date.UTC(2026,8,18,20),now,now,Date.UTC(2026,8,18,20,15),
    "Render final","Cine","cine","proof");
  insertMission.run("M-D","decision-batch","mission","in_progress","Lucas","Mac Mini",null,
    Date.UTC(2026,8,18,10),Date.UTC(2026,8,18,10),now,now,null,
    "Trabajo en curso","Robot","robot",null);
  insertMission.run("M-W","decision-batch","mission","resolved","LucasGrokBot","GrokBot",null,
    Date.UTC(2026,8,15,9),"invalid",now,now,"invalid",
    "Reloj incompleto","Cine","cine",null);
  insertMission.run("M-M","decision-batch","mission","resolved","Lucas","Mac Mini",null,
    Date.UTC(2026,8,1,8),Date.UTC(2026,8,1,8),now,now,Date.UTC(2026,8,1,9),
    "Inicio de mes","Robot","robot",null);
  insertMission.run("M-OLD","decision-batch","mission","resolved","Lucas","Mac Mini",null,
    Date.UTC(2026,7,31,21,59),Date.UTC(2026,7,31,21),now,now,Date.UTC(2026,7,31,22),
    "Fuera del mes Madrid","Robot","robot",null);
  insertMission.run("M-FUTURE","decision-batch","mission","resolved","Lucas","Mac Mini",null,
    now + 1,now + 1,now + 1,now + 1,now + 2,"Futura","Robot","robot",null);
  insertMission.run("M-WOZ","decision-batch","mission","resolved","WozniakGrokBot","GrokBot",null,
    Date.UTC(2026,8,18,20,20),Date.UTC(2026,8,18,20,20),now,now,Date.UTC(2026,8,18,20,30),
    "No mezclar","Apple","apple",null);
  db.exec("INSERT INTO projects VALUES ('cine','Proyecto Cine'),('robot','Proyecto Robot'),('apple','Proyecto Apple')");
  const insertTask = db.prepare("INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?)");
  const taskStart = Date.UTC(2026,8,18,20,1), taskEnd = Date.UTC(2026,8,18,20,11);
  insertTask.run("M H&1","a","Verificar","done","Hecho token=secreto https://private.test /Users/carlos/key 10.0.0.1",taskStart,taskStart,taskEnd,taskEnd);
  insertTask.run("M H&1","a","Verificar","done","Hecho token=secreto https://private.test /Users/carlos/key 10.0.0.1",taskStart,taskStart,taskEnd,taskEnd);
  insertTask.run("M H&1","b","Supervisar","in_progress","En curso",taskStart,taskStart,null,now);
  insertTask.run("M H&1","c","Sin reloj","done","Sin timestamps",taskStart,"invalid","invalid",now);
  insertTask.run("M-WOZ","a","Ajena","done","No debe salir",taskStart,taskStart,taskEnd,taskEnd);
  return now;
}

test("los cuatro periodos usan límites naturales de Europe/Madrid", () => {
  const {F} = harness(), now = Date.UTC(2026,8,18,20,45);
  const hour = F.highscoreMissionPeriodRange("hour", now);
  const day = F.highscoreMissionPeriodRange("day", now);
  const week = F.highscoreMissionPeriodRange("week", now);
  const month = F.highscoreMissionPeriodRange("month", now);
  assert.deepEqual([hour.start,hour.end],[Date.UTC(2026,8,18,20),now+1],
    "HORA empieza en :00 y no es una ventana móvil de 60 minutos");
  assert.equal(day.start,Date.UTC(2026,8,17,22),"día 18, 00:00 CEST");
  assert.equal(week.start,Date.UTC(2026,8,13,22),"lunes 14, 00:00 CEST");
  assert.equal(month.start,Date.UTC(2026,7,31,22),"1 de septiembre, 00:00 CEST");
  assert.deepEqual([month.start_day,month.end_day],["2026-09-01","2026-09-18"]);
  assert.equal(F.highscoreMissionPeriodRange("year",now),null);
});

test("el resumen público conserva estado y elimina secretos, rutas y contactos", () => {
  const {F} = harness();
  const summary = F.highscorePublicTaskSummary("Listo token=abc123 CF_API_TOKEN=supersecret sk-12345678901234567890 eyJabcdefghijkl.mnOpqrstuvwxyz.abcdefghijk user@example.com https://private.test /Users/carlos/key 10.0.0.1 `rm -rf x`");
  assert.match(summary,/^Listo /);
  assert.match(summary,/\[credencial\]/);
  assert.match(summary,/\[correo\]/);
  assert.match(summary,/\[enlace\]/);
  assert.match(summary,/\[ruta\]/);
  assert.match(summary,/\[ip\]/);
  assert.doesNotMatch(summary,/abc123|supersecret|sk-123|eyJabc|example\.com|private\.test|carlos|10\.0\.0\.1|rm -rf/);
});

test("Lucas reúne todas sus misiones y tareas sin duplicar ni mezclar Wozniak", async () => {
  const normal = harness(), reverse = harness();
  const now = seed(normal.db); seed(reverse.db);
  const periods = {
    hour:["M H&1"],
    day:["M H&1","M-D"],
    week:["M H&1","M-D","M-W"],
    month:["M H&1","M-D","M-W","M-M"]
  };
  for (const [period, expectedIds] of Object.entries(periods)) {
    const result = JSON.parse(JSON.stringify(await normal.F.highscoreAgentMissions(normal.env,"LucasGrokBot",period,now)));
    assert.equal(result.ok,true,period);
    assert.equal(result.scope,"agent-missions",period);
    assert.equal(result.agent,"Lucas",period);
    assert.equal(result.period,period);
    assert.equal(result.timezone,"Europe/Madrid");
    assert.equal(result.total,expectedIds.length,period);
    assert.deepEqual(result.missions.map((mission) => mission.id),expectedIds,period);
    assert.ok(result.missions.every((mission) => mission.agent === "Lucas"),period);
    assert.ok(result.missions.every((mission) => mission.id !== "M-WOZ"),period);
  }

  const month = JSON.parse(JSON.stringify(await normal.F.highscoreAgentMissions(normal.env,"Lucas","month",now)));
  const inverted = JSON.parse(JSON.stringify(await reverse.F.highscoreAgentMissions(reverse.env,"LucasGrokBot","month",now)));
  assert.deepEqual(inverted,month,"la salida es estable aunque D1 entregue filas y tareas invertidas");
  assert.deepEqual([month.range.from,month.range.to],[month.range.start_day,month.range.end_day]);
  const closed = month.missions[0], ongoing = month.missions[1], invalid = month.missions[2];
  assert.equal(closed.display_ref,"REF-M H&1");
  assert.equal(closed.title,"Render final");
  assert.equal(closed.project_name,"Proyecto Cine");
  assert.equal(closed.duration_ms,15*60*1000);
  assert.equal(closed.ongoing,false);
  assert.equal(closed.report_url,"/ticket?id=M%20H%261");
  assert.equal(closed.task_count,3);
  assert.deepEqual(closed.tasks.map((task) => task.code),["a","b","c"],"una tarea repetida sale una vez");
  assert.equal(closed.tasks[0].duration_ms,10*60*1000);
  assert.equal(closed.tasks[0].status,"done");
  assert.doesNotMatch(closed.tasks[0].summary,/secreto|private\.test|\/Users|10\.0\.0\.1/);
  assert.equal(closed.tasks[1].ongoing,true);
  assert.equal(closed.tasks[1].duration_ms,now-Date.UTC(2026,8,18,20,1));
  assert.equal(closed.tasks[2].duration_ms,null);
  assert.equal(invalid.started_at,null);
  assert.equal(invalid.finished_at,null);
  assert.equal(invalid.duration_ms,null);
  assert.equal(ongoing.ongoing,true);
  assert.equal(ongoing.duration_ms,now-Date.UTC(2026,8,18,10));
});

test("el router comparte /highscore/history y valida agente y periodo", () => {
  const route = source.slice(source.indexOf('url.pathname === "/highscore/history"'));
  const block = route.slice(0, route.indexOf('url.pathname === "/highscore/active-work"'));
  assert.match(block, /searchParams\.get\("detail"\)[\s\S]*=== "missions"/);
  assert.match(block, /searchParams\.get\("agent"\)/);
  assert.match(block, /searchParams\.get\("period"\)/);
  assert.match(block, /highscoreAgentMissions/);
  assert.match(block, /json\(detail, detail\.ok \? 200 : 400\)/);
  assert.doesNotMatch(source, /"\/highscore\/missions"/,
    "no se inventa una ruta paralela para el mismo histórico");
});

test("rechaza periodos e identidades que sólo comparten prefijo", async () => {
  const {env,F} = harness(), now = Date.UTC(2026,8,18,20,45);
  assert.deepEqual(JSON.parse(JSON.stringify(await F.highscoreAgentMissions(env,"Lucas","year",now))).code,"invalid_period");
  assert.deepEqual(JSON.parse(JSON.stringify(await F.highscoreAgentMissions(env,"Lucas-cualquier-cosa","month",now))).code,"unknown_agent");
  assert.deepEqual(JSON.parse(JSON.stringify(await F.highscoreAgentMissions(env,"","month",now))).code,"agent_required");
});
