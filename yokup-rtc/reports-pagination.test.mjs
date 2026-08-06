import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { reportAgentFamily } from "./src/agent-identity.js";
import { buildReportsPageFilter, decodeReportsCursor, encodeReportsCursor, parseReportsPageOptions } from "./src/reports-pagination.js";

const worker = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

function options(query = "") {
  const parsed = parseReportsPageOptions(new URLSearchParams(query));
  assert.equal(parsed.ok, true, parsed.error);
  return parsed;
}

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE tickets(id TEXT PRIMARY KEY,source TEXT,project TEXT)");
  db.exec("CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,report TEXT,updated_at INTEGER,PRIMARY KEY(mission_id,code))");
  db.exec("CREATE INDEX idx_mtasks_reports_page ON mission_tasks(updated_at DESC,mission_id DESC,code DESC) WHERE report IS NOT NULL AND TRIM(report)<>''");
  const ticket = db.prepare("INSERT INTO tickets VALUES(?,?,?)");
  for (const row of [["M1","fleet","yokup"],["M2","decision-batch","admira"],["M3","cli-declare","yokup"],["WEB","field","yokup"]]) ticket.run(...row);
  const task = db.prepare("INSERT INTO mission_tasks VALUES(?,?,?,?)");
  for (const row of [
    ["M3","c","tres-c",300],["M3","b","tres-b",300],["M2","a","dos-a",300],
    ["M1","a","uno-a",200],["M1","b","",400],["WEB","a","campo",350]
  ]) task.run(...row);
  return db;
}

function page(db, parsed, scope = "t.source IN ('fleet','decision-batch','cli-declare')") {
  const filter = buildReportsPageFilter(parsed, scope);
  const rows = db.prepare(`SELECT m.* FROM mission_tasks m JOIN tickets t ON t.id=m.mission_id
    WHERE ${filter.page_sql} ORDER BY COALESCE(m.updated_at,0) DESC,m.mission_id DESC,m.code DESC LIMIT ?`)
    .all(...filter.page_binds, parsed.limit + 1);
  const hasMore = rows.length > parsed.limit, tasks = rows.slice(0, parsed.limit);
  return { tasks, hasMore, cursor:hasMore ? encodeReportsCursor(tasks.at(-1)) : null };
}

test("cursor estable recorre empates sin duplicados ni huecos", () => {
  const db = fixture(), seen = [];
  let parsed = options("limit=2");
  for (;;) {
    const current = page(db, parsed);
    seen.push(...current.tasks.map((row) => `${row.mission_id}/${row.code}`));
    if (!current.hasMore) break;
    assert.deepEqual(decodeReportsCursor(current.cursor), {
      updated_at:current.tasks.at(-1).updated_at,
      mission_id:current.tasks.at(-1).mission_id,
      code:current.tasks.at(-1).code
    });
    parsed = options(`limit=2&cursor=${encodeURIComponent(current.cursor)}`);
  }
  assert.deepEqual(seen, ["M3/c", "M3/b", "M2/a", "M1/a"]);
  assert.equal(new Set(seen).size, seen.length);
});

test("fecha, scope y report no vacío se filtran en SQL antes del límite", () => {
  const db = fixture();
  const current = page(db, options("limit=30&updated_from=250&updated_to=301"));
  assert.deepEqual(current.tasks.map((row) => row.report), ["tres-c", "tres-b", "dos-a"]);
  assert.equal(current.hasMore, false);
  const filter = buildReportsPageFilter(options("updated_from=250&updated_to=301"));
  assert.match(filter.page_sql, /m\.report IS NOT NULL/);
  assert.match(filter.page_sql, /COALESCE\(m\.updated_at,0\)>=\?/);
  assert.match(filter.page_sql, /COALESCE\(m\.updated_at,0\)<\?/);
});

test("proyecto se filtra en SQL antes del límite, total y cursor", () => {
  const db = fixture();
  const first = page(db, options("limit=1&project=yokup"));
  assert.deepEqual(first.tasks.map((row) => row.mission_id), ["M3"]);
  assert.equal(first.hasMore, true);
  const parsed = options(`limit=1&project=yokup&cursor=${encodeURIComponent(first.cursor)}`);
  assert.deepEqual(page(db, parsed).tasks.map((row) => row.mission_id), ["M3"]);
  const filter = buildReportsPageFilter(parsed, "t.source IN ('fleet','decision-batch','cli-declare')");
  assert.match(filter.count_sql, /t\.project=\?/);
  assert.deepEqual(filter.count_binds, ["yokup"]);
});

test("total cuenta el filtro completo pero nunca queda recortado por el cursor", () => {
  const db = fixture();
  const first = page(db, options("limit=2&updated_from=100&updated_to=301"));
  const parsed = options(`limit=2&updated_from=100&updated_to=301&cursor=${encodeURIComponent(first.cursor)}`);
  const filter = buildReportsPageFilter(parsed, "t.source IN ('fleet','decision-batch','cli-declare')");
  const total = db.prepare(`SELECT COUNT(*) total FROM mission_tasks m JOIN tickets t ON t.id=m.mission_id WHERE ${filter.count_sql}`)
    .get(...filter.count_binds).total;
  assert.equal(total, 4);
  assert.doesNotMatch(filter.count_sql, /m\.mission_id<\?/);
  assert.match(filter.page_sql, /m\.mission_id<\?/);
});

test("límite inicial 30, máximo 100, cursor y rango inválidos fallan cerrado", () => {
  assert.equal(options().limit, 30);
  assert.equal(options("limit=100").limit, 100);
  for (const query of ["limit=0", "limit=101", "limit=x", "cursor=basura", "updated_from=20&updated_to=10", "updated_from=hoy", `project=${"x".repeat(161)}`]) {
    assert.equal(parseReportsPageOptions(new URLSearchParams(query)).ok, false, query);
  }
});

test("Sub e Infra comparten familia sólo con la misma persona y máquina", () => {
  const sub = reportAgentFamily("SubMorfeo16", "MacBook Pro 16");
  const infra = reportAgentFamily("InfraMorfeoMBP16", "admira-macbookpro16");
  assert.deepEqual(sub, { executor:"SubMorfeoMBP16", role:"sub", family_key:"morfeo@mbp16", family_name:"MorfeoMBP16" });
  assert.deepEqual(infra, { executor:"InfraMorfeoMBP16", role:"infra", family_key:"morfeo@mbp16", family_name:"MorfeoMBP16" });
  assert.notEqual(reportAgentFamily("SubMorfeo", "MacBook Pro 14").family_key, sub.family_key);
  assert.notEqual(reportAgentFamily("SubOraculo", "MacBook Pro 16").family_key, sub.family_key);
});

test("paginación es opt-in y legacy conserva {tasks}", () => {
  const start = worker.indexOf('if (url.pathname === "/tasks/all")');
  const end = worker.indexOf('if (url.pathname === "/ticket")', start);
  const route = worker.slice(start, end);
  assert.match(route, /url\.searchParams\.get\("paginated"\) === "1"/);
  assert.match(route, /return json\(await listMissionReportsPage/);
  assert.match(route, /return json\(\{ tasks: await listAllMissionTasks/);
  assert.match(worker, /idx_mtasks_reports_page/);
  assert.match(worker, /next_cursor:hasMore/);
  assert.match(worker, /total\s*\n?\s*\}/);
});
