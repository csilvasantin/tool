import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import {
  planProjectNumbers,
  publishedProjectNumber,
  backfillProjectNumbers,
  allocateProjectNumber,
  PROJECT_NUMBER_COLUMN_SQL
} from "./src/project-number.js";

const indexSource = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
const upsertSource = await readFile(new URL("./src/project-responsibles.js", import.meta.url), "utf8");

function wrap(db) {
  return {
    async exec(sql) { db.exec(sql); },
    prepare(sql) {
      const statement = (params) => ({
        bind(...next) { return statement(next); },
        async run() { return db.prepare(sql).run(...params); },
        async first() { return db.prepare(sql).get(...params) || null; },
        async all() { return { results: db.prepare(sql).all(...params) }; }
      });
      return statement([]);
    },
    async batch(statements) {
      for (const statement of statements) await statement.run();
    }
  };
}

test("los 39 actuales salen 1..39 por created_at y el empate lo rompe el id", () => {
  const rows = [];
  for (let i = 0; i < 37; i++) rows.push({ id: "p" + String(i).padStart(2, "0"), created_at: 1000 + i, number: null });
  rows.push({ id: "zeta", created_at: 5000, number: null });
  rows.push({ id: "alfa", created_at: 5000, number: null });
  const plan = planProjectNumbers(rows);
  const ordered = [...plan.entries()].sort((a, b) => a[1] - b[1]);
  assert.equal(ordered.length, 39);
  assert.deepEqual(ordered.map(([, n]) => n), Array.from({ length: 39 }, (_, i) => i + 1));
  assert.equal(plan.get("alfa"), 38);
  assert.equal(plan.get("zeta"), 39);
});

test("un número ya escrito no se mueve y el hueco no se rellena", () => {
  const plan = planProjectNumbers([
    { id: "viejo", created_at: 1, number: 2 },
    { id: "nuevo", created_at: 2, number: null }
  ]);
  assert.equal(plan.get("viejo"), 2);
  assert.equal(plan.get("nuevo"), 3);
  assert.equal(publishedProjectNumber(0), null);
  assert.equal(publishedProjectNumber("4"), 4);
});

test("el alta siguiente reserva max+1 y repetir el relleno no renumera", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE projects(id TEXT PRIMARY KEY, created_at INTEGER, number INTEGER)");
  const insert = db.prepare("INSERT INTO projects(id, created_at, number) VALUES(?,?,?)");
  insert.run("b", 20, null);
  insert.run("a", 10, null);
  const env = { DB: wrap(db) };
  assert.equal(await backfillProjectNumbers(env), 2);
  assert.equal(db.prepare("SELECT number FROM projects WHERE id='a'").get().number, 1);
  assert.equal(db.prepare("SELECT number FROM projects WHERE id='b'").get().number, 2);
  assert.equal(await backfillProjectNumbers(env), 0);
  assert.equal(await allocateProjectNumber(env), 3);
  db.prepare("DELETE FROM projects WHERE id='b'").run();
  assert.equal(await allocateProjectNumber(env), 4);
  db.close();
});

test("el censo publica number y el upsert no lo reescribe", () => {
  assert.match(indexSource, /PROJECT_NUMBER_COLUMN_SQL/);
  assert.match(indexSource, /backfillProjectNumbers\(env\)/);
  assert.match(indexSource, /number: publishedProjectNumber\(p\.number\)/);
  assert.match(indexSource, /url\.pathname\.match\(\/\^\\\/projects\\\/\(\[\^\/\]\+\)\$\/\)/);
  assert.match(upsertSource, /created_at,updated_at,updated_by,number\)/);
  assert.doesNotMatch(upsertSource, /DO UPDATE SET[^;]*\bnumber=/);
  assert.match(PROJECT_NUMBER_COLUMN_SQL, /ADD COLUMN number INTEGER/);
});
