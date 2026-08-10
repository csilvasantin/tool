import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
const functionSource = name => {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const end = source.indexOf(`__name(${name}, "${name}");`, start);
  assert.notEqual(end, -1, `falta cierre de ${name}`);
  return source.slice(start, end);
};
const activeSelect = block => {
  const match = block.match(/SELECT id FROM tickets WHERE screen=\? AND ([^"\n]+)/);
  assert.ok(match, "falta consulta activa por screen");
  return `SELECT id FROM tickets WHERE screen=? AND ${match[1]}`;
};

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE tickets(id TEXT PRIMARY KEY, screen TEXT, status TEXT)");
  const match = source.match(/CREATE UNIQUE INDEX IF NOT EXISTS idx_active_screen ON tickets\(screen\) WHERE status NOT IN \('resolved','cancelled'\)/);
  assert.ok(match, "falta el índice parcial de incidencias realmente activas");
  db.exec(match[0]);
  return db;
}

test("cancelled deja libre el recurso para una caída nueva con id distinto", () => {
  const db = database();
  db.prepare("INSERT INTO tickets VALUES(?,?,?)").run("SVC-OLD", "svc:https://www.yokup.com", "cancelled");
  db.prepare("INSERT INTO tickets VALUES(?,?,?)").run("SVC-NEW", "svc:https://www.yokup.com", "open");
  const rows = db.prepare("SELECT id,status FROM tickets ORDER BY id").all().map(({ id, status }) => ({ id, status }));
  assert.deepEqual(rows, [
    { id: "SVC-NEW", status: "open" },
    { id: "SVC-OLD", status: "cancelled" }
  ]);
});

test("recuperar un recurso cancelado no añade actividad a la cancelada", () => {
  const db = database();
  db.prepare("INSERT INTO tickets VALUES(?,?,?)").run("SVC-CANCELLED", "svc:https://www.yokup.com", "cancelled");
  const query = activeSelect(functionSource("resolveIncident"));
  assert.equal(db.prepare(query).get("svc:https://www.yokup.com"), undefined);
});

test("open e in_progress aún deduplican y dos activas violan UNIQUE", () => {
  for (const status of ["open", "in_progress"]) {
    const db = database(), screen = `svc:${status}`;
    db.prepare("INSERT INTO tickets VALUES(?,?,?)").run(`SVC-${status}`, screen, status);
    const query = activeSelect(functionSource("createIncident"));
    assert.equal(db.prepare(query).get(screen).id, `SVC-${status}`);
    assert.throws(() => db.prepare("INSERT INTO tickets VALUES(?,?,?)").run(`SVC-${status}-2`, screen, "open"), /UNIQUE constraint failed/);
  }
});

test("las cuatro vías comparten exactamente el predicado de incidencia activa", () => {
  for (const name of ["createTicket", "createIncident", "resolveIncident", "reconcile"]) {
    assert.match(functionSource(name), /status NOT IN \('resolved','cancelled'\)/, name);
  }
});
