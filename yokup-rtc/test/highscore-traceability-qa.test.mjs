import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const grab = (name) => {
  const match = new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}\\n__name\\(${name}, "${name}"\\);`).exec(source);
  assert.ok(match, `no se pudo extraer ${name}`);
  return match[0];
};
const grabVar = (name) => {
  const match = new RegExp(`var ${name} = [^\\n]+;`).exec(source);
  assert.ok(match, `no se pudo extraer ${name}`);
  return match[0];
};

function harness() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE ideas(id TEXT,title TEXT,author TEXT,project TEXT,decision_id TEXT,mission_id TEXT,created_at INTEGER,updated_at INTEGER)");
  db.exec("CREATE TABLE decisions(id TEXT,agent TEXT,machine TEXT,question TEXT,project TEXT,mission TEXT,parent_decision TEXT,batch_id TEXT,created_at INTEGER,decided_at INTEGER)");
  db.exec("CREATE TABLE tickets(id TEXT,subject TEXT,assignee TEXT,loc TEXT,project TEXT,source TEXT,status TEXT,created_at INTEGER,updated_at INTEGER)");
  db.exec("CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,title TEXT,status TEXT,owner TEXT,created_at INTEGER,updated_at INTEGER)");
  db.exec("CREATE TABLE mission_batches(id TEXT,decision_id TEXT)");
  db.exec("CREATE TABLE mission_batch_items(batch_id TEXT,mission_id TEXT)");
  db.exec("CREATE TABLE events(ticket_id TEXT,kind TEXT,author TEXT,text TEXT,ts INTEGER)");
  const DB = { prepare(sql) {
    const statement = db.prepare(sql);
    const result = (...args) => ({ results:statement.all(...args) });
    return { bind(...args) { return { all:async () => result(...args) }; }, all:async () => result() };
  } };
  const context = vm.createContext({ Map, Set, Array, String, Number, Date, RegExp, Math, Object, __name:(fn) => fn });
  vm.runInContext(["HIGHSCORE_WEIGHTS", "HIGHSCORE_TASK_WEIGHTS", "HIGHSCORE_RECENT_MS", "HIGHSCORE_INTERNAL_YOKUP_TRANSITION_SQL", "HIGHSCORE_MISSION_STARTED_SQL", "HIGHSCORE_PERSONAS", "AGENT_SOURCE_SQL_T"]
    .map(grabVar).concat(grab("highscoreAgent"), grab("highscoreTraceability")).join("\n"), context);
  return { db, env:{DB}, trace:context.highscoreTraceability };
}

const START = Date.UTC(2026, 7, 4);
const END = START + 86_400_000;
const NOW = START + 18 * 3_600_000;

test("los puntos explicados coinciden con los atribuibles: Consejo no recibe puntos de objetivo", async () => {
  const { db, env, trace } = harness();
  db.prepare("INSERT INTO ideas VALUES(?,?,?,?,?,?,?,?)").run("OBJ-C","Consejo","CEO · Steve Jobs","yokup","DEC-C","",NOW-5000,NOW-5000);
  db.prepare("INSERT INTO decisions VALUES(?,?,?,?,?,?,?,?,?,?)").run("DEC-C","OraculoMacMini","macmini","¿Qué hacemos?","yokup","","","",NOW-4000,NOW-3000);
  const result = structuredClone(await trace(env, START, END, NOW));
  assert.equal(result.chains.length, 1);
  assert.equal(result.chains[0].origin.agent, "");
  assert.equal(result.chains[0].points.objective, 0, "una idea sin agente de la flota no puede explicar +20 inexistentes");
  assert.equal(result.chains[0].points.windows, 8);
  assert.equal(result.chains[0].points.total, 8);
});

test("una cadena nacida en Ventana conserva origen único, orden cronológico y tareas de su misión", async () => {
  const { db, env, trace } = harness();
  db.prepare("INSERT INTO decisions VALUES(?,?,?,?,?,?,?,?,?,?)").run("DEC-W","NeoMini","macmini","Elegir","pixeria","","","B-W",NOW-9000,NOW-8000);
  db.prepare("INSERT INTO mission_batches VALUES(?,?)").run("B-W","DEC-W");
  db.prepare("INSERT INTO mission_batch_items VALUES(?,?)").run("B-W","FLT-W");
  db.prepare("INSERT INTO tickets VALUES(?,?,?,?,?,?,?,?,?)").run("FLT-W","Entrega","NeoMini","macmini","pixeria","fleet","in_progress",NOW-7000,NOW-1000);
  db.prepare("INSERT INTO events VALUES(?,?,?,?,?)").run("FLT-W","status","yokup","Estado → in_progress",NOW-6500);
  db.prepare("INSERT INTO mission_tasks VALUES(?,?,?,?,?,?,?)").run("FLT-W","b","Segundo","done","SubNeoMini",NOW-3000,NOW-2000);
  db.prepare("INSERT INTO mission_tasks VALUES(?,?,?,?,?,?,?)").run("FLT-W","a","Primero","done","SubNeoMini",NOW-6000,NOW-5000);
  const result = structuredClone(await trace(env, START, END, NOW));
  const chain = result.chains[0];
  assert.equal(chain.origin.type, "window");
  assert.equal(chain.origin.id, "DEC-W");
  assert.deepEqual(chain.windows, [], "la ventana de origen no se debe repetir como segunda etapa");
  assert.equal(chain.mission.id, "FLT-W");
  assert.deepEqual(chain.tasks.map((task) => task.code), ["a","b"]);
  assert.equal(chain.latest_at, NOW-2000);
  assert.equal(chain.points.total, 8 + 40 + 30);
});

test("el corte diario y las relaciones ausentes son explícitos, no aproximados", async () => {
  const { db, env, trace } = harness();
  db.prepare("INSERT INTO ideas VALUES(?,?,?,?,?,?,?,?)").run("AYER","Viejo","OraculoMini","yokup","","",START-1,START-1);
  db.prepare("INSERT INTO tickets VALUES(?,?,?,?,?,?,?,?,?)").run("FLT-U","Directa","OraculoMini","macmini","yokup","fleet","resolved",NOW-5000,NOW-1000);
  db.prepare("INSERT INTO events VALUES(?,?,?,?,?)").run("FLT-U","status","yokup","Estado → in_progress",NOW-4500);
  db.prepare("INSERT INTO mission_tasks VALUES(?,?,?,?,?,?,?)").run("FLT-X","a","Huérfana","done","SubOraculoMini",NOW-4000,NOW-2000);
  const result = structuredClone(await trace(env, START, END, NOW));
  assert.equal(result.chains.length, 1);
  assert.equal(result.chains[0].origin.type, "mission");
  assert.equal(result.chains[0].origin.id, "FLT-U");
  assert.equal(result.chains[0].points.total, 40);
  assert.deepEqual(result.unlinked.map((item) => [item.type,item.id,item.reason]), [
    ["task","FLT-X:a","mission_outside_daily_trace"]
  ]);
  assert.deepEqual(result.coverage, { objectives:0, windows:0, missions:1, tasks:1, linked_missions:1, unlinked:1 });
});
