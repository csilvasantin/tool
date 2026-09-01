// FLT-1373 lo destapó: la misión quedó «resolved» con su tarea «a» en pending
// aunque a1, a2 y a3 estaban hechas. El bloque de done al cerrar sólo corría para
// standalone, y después ya no hay vuelta atrás: /fleet/task-status rechaza tocar
// una misión cerrada y su convergencia exacta también es sólo de standalone.
// Un padre no puede contradecir a sus hijas — pero tampoco puede darse por hecho
// un trabajo que nadie hizo. Estas pruebas fijan las dos mitades.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const grab = (name) => {
  const re = new RegExp(`function ${name}\\([^]*?\\n\\}\\n__name\\(${name}, "${name}"\\);`);
  const match = re.exec(source);
  assert.ok(match, `no se pudo extraer ${name}`);
  return match[0];
};

function harness(filas) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,status TEXT,report TEXT,ended_at INTEGER,updated_at INTEGER,PRIMARY KEY(mission_id,code))");
  const insert = db.prepare("INSERT INTO mission_tasks(mission_id,code,status,report,ended_at,updated_at) VALUES(?,?,?,?,NULL,0)");
  for (const [code, status, report] of filas) insert.run("FLT-1373", code, status,
    report === undefined && status === "done" ? "Informe " + code : (report || null));
  const env = { DB: { prepare(sql) { const stmt = db.prepare(sql); return {
    bind(...args) { return { run: async () => ({ meta: stmt.run(...args) }) }; }
  }; } } };
  const context = vm.createContext({ __name: (fn) => fn });
  vm.runInContext(grab("convergeParentTasksStmt"), context);
  return { db, env, converge: vm.runInContext("convergeParentTasksStmt", context) };
}

const estado = (db) => Object.fromEntries(
  db.prepare("SELECT code,status FROM mission_tasks ORDER BY code").all().map((r) => [r.code, r.status]));

test("un padre con TODAS sus subtareas hechas deja de estar pendiente", async () => {
  const { db, env, converge } = harness([
    ["a", "pending"], ["a1", "done"], ["a2", "done"], ["a3", "done"],
    ["b", "done"], ["b1", "done"], ["z1", "done"],
  ]);
  await converge(env, "FLT-1373", 1786392987543).run();
  const e = estado(db);
  assert.equal(e.a, "done", "a1+a2+a3 hechas: «a» no puede seguir diciendo lo contrario");
  assert.match(db.prepare("SELECT report FROM mission_tasks WHERE code='a'").get().report,/a1: Informe a1/,
    "el padre conserva un parte factual compuesto por sus hijas");
  assert.equal(e.z1, "done");
  assert.equal(db.prepare("SELECT ended_at FROM mission_tasks WHERE code='a'").get().ended_at,1786392987543);
});

test("un padre con UNA subtarea sin terminar NO se da por hecho", async () => {
  const { db, env, converge } = harness([
    ["c", "pending"], ["c1", "done"], ["c2", "in_progress"], ["c3", "done"],
  ]);
  await converge(env, "FLT-1373", 1786392987543).run();
  assert.equal(estado(db).c, "pending", "convergir aquí sería fingir trabajo");
});

test("un padre no converge si una hija hecha carece de informe", async () => {
  const { db, env, converge } = harness([
    ["a", "pending"], ["a1", "done"], ["a2", "done", ""], ["a3", "done"],
  ]);
  await converge(env, "FLT-1373", 1786392987543).run();
  assert.equal(estado(db).a, "pending");
});

test("una hoja suelta y sin hijas se queda como está", async () => {
  const { db, env, converge } = harness([["a", "pending"], ["b", "in_progress"]]);
  await converge(env, "FLT-1373", 1786392987543).run();
  const e = estado(db);
  assert.equal(e.a, "pending");
  assert.equal(e.b, "in_progress");
});

test("z1 no es padre de nadie y la convergencia no lo toca", async () => {
  const { db, env, converge } = harness([["z1", "pending"], ["a", "pending"], ["a1", "done"]]);
  await converge(env, "FLT-1373", 1786392987543).run();
  const e = estado(db);
  assert.equal(e.z1, "pending", "el informe se cierra por su propia vía, no de rebote");
  assert.equal(e.a, "done");
});

test("la convergencia entra en el cierre y también en el reintento seguro", () => {
  assert.ok((source.match(/convergeParentTasksStmt\(env,mid,now\)/g)||[]).length >= 1,
    "el cierre canónico converge los padres");
  assert.match(source, /sólo admite reintentar exactamente el mismo cierre[^]{0,400}convergeParentTasksStmt\(env, mid, Date\.now\(\)\)\.run\(\)/,
    "el reintento repara un cierre que dejó un padre a medias");
});
