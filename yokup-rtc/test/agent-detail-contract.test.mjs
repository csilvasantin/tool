import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import {
  agentFamilySqlKey, identityKey, identitySqlKey, machineIdentitySqlKey,
} from "../src/agent-identity.js";
import {
  matchAgentDetailPresence, parseAgentDetailQuery, safeAgentDetailText,
} from "../src/agent-detail-contract.js";
import { MISSION_SCOPE_SQL_T } from "../src/mission-sources.js";

const NOW = 1_788_500_000_000;

const params = (values) => new URLSearchParams(values);

test("el selector exige identidad de superficie completa y detecta equipo incoherente", () => {
  assert.equal(parseAgentDetailQuery(params({ agent:"Oraculo", machine:"MacMini", surface:"cli" })).code, "invalid_runtime");
  assert.equal(parseAgentDetailQuery(params({ agent:"OraculoMacMini", machine:"MacBook Pro 14", runtime:"Codex", surface:"cli" })).code, "agent_machine_mismatch");
  assert.equal(parseAgentDetailQuery(params({ agent:"Oraculo", machine:"inventada", runtime:"Codex", surface:"cli" })).code, "invalid_machine");
  assert.equal(parseAgentDetailQuery(params({ agent:"Oraculo", machine:"MacMini", runtime:"Codex", surface:"web" })).code, "invalid_surface");
});

test("el selector canoniza identidad, limita página y no incorpora session_id visible", () => {
  const query = parseAgentDetailQuery(params({ agent:"SubOraculo", machine:"admira-macmini",
    runtime:"Codex Desktop", surface:"CLI", session_id:"session-secret-42", limit:"999", offset:"3" }));
  assert.equal(query.ok, true);
  assert.equal(query.family.executor, "SubOraculoMacMini");
  assert.equal(query.parsed.role, "sub");
  assert.equal(query.machine_key, "macmini");
  assert.equal(query.limit, 100);
  assert.equal(query.offset, 3);
  assert.match(query.surface_key, /^surface:[a-z0-9]+$/);
  assert.doesNotMatch(query.surface_key, /session-secret/);
});

test("presencia discrimina runtime, surface y session_id sin confundir App con CLI", () => {
  const query = parseAgentDetailQuery(params({ agent:"SubOraculo", machine:"MacMini", runtime:"Codex",
    surface:"cli", session_id:"wanted" }));
  const base = { persona:"SubOraculo", machine:"MacMini", runtime:"Codex", verified:1,
    source:"process_snapshot", online:true, pid:42, updated:NOW / 1000 };
  const result = matchAgentDetailPresence([
    { ...base, host:"app", session_id:"wanted", focus:"App" },
    { ...base, host:"cli", session_id:"other", focus:"Otro CLI" },
    { ...base, host:"cli", session_id:"wanted", focus:"Tarea exacta" },
  ], query, NOW);
  assert.equal(result.matched, true);
  assert.equal(result.fresh, true);
  assert.equal(result.ambiguous, false);
  assert.equal(result.focus, "Tarea exacta");
});

test("el texto de fallback redacta credenciales y se acota", () => {
  const clean = safeAgentDetailText("Llamando API_KEY=abc123 Authorization:xyz Bearer very.secret/token https://user:pass@example.com/ " + "x".repeat(300));
  assert.doesNotMatch(clean, /abc123|xyz|very\.secret|user:pass/);
  assert.match(clean, /\[redactado\]/);
  assert.ok(clean.length <= 200);
});

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

function harness(presenceRows) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE tickets(id TEXT PRIMARY KEY,subject TEXT,loc TEXT,source TEXT,role TEXT,status TEXT,
      assignee TEXT,project TEXT,project_id TEXT,created_at INTEGER,started_at INTEGER,updated_at INTEGER,resolved_at INTEGER);
    CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,title TEXT,status TEXT,owner TEXT,executor TEXT,
      created_at INTEGER,started_at INTEGER,updated_at INTEGER,ended_at INTEGER);
    CREATE TABLE display_refs(entity_type TEXT,entity_key TEXT,display_ref TEXT);
    CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT);
  `);
  const DB = { prepare(sql) {
    const statement = db.prepare(sql);
    const result = {
      bind(...args) { return {
        all:async () => ({ results:statement.all(...args) }),
        first:async () => statement.get(...args) || null,
      }; },
      all:async () => ({ results:statement.all() }),
      first:async () => statement.get() || null,
    };
    return result;
  } };
  const TELEGRAM = { fetch:async () => ({ ok:true, json:async () => ({ ok:true, presence:presenceRows }) }) };
  const context = vm.createContext({ Map, Array, String, Number, Date, Math, Object, Promise, Request,
    encodeURIComponent, identityKey, identitySqlKey, machineIdentitySqlKey, agentFamilySqlKey,
    MISSION_SCOPE_SQL_T, matchAgentDetailPresence, safeAgentDetailText, __name:(fn) => fn });
  vm.runInContext([
    grabVar("PRESENCE_URL"), grab("projectSlug"), grab("projectIndex"), grab("resolveProject"),
    grab("highscoreActiveWorkMillis"), grab("agentDetailRoleSql"), grab("agentDetailActivitySql"),
    grab("agentDetailPresence"), grab("agentDetailPublicItem"), grab("agentDetail"),
  ].join("\n"), context);
  return { db, env:{ DB, TELEGRAM }, F:context };
}

function seed(db) {
  db.exec("INSERT INTO projects VALUES ('yokup','Yokup')");
  db.prepare("INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
    "DCL-1", "Ficha por agente", "MacMini", "fleet", "mission", "in_progress",
    "OraculoMacMini", "yokup", "yokup", NOW - 60_000, NOW - 50_000, NOW - 40_000, null);
  db.prepare("INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?,?)").run(
    "DCL-1", "a", "Crear API", "in_progress", "OraculoMacMini", "SubOraculoMacMini",
    NOW - 55_000, NOW - 50_000, NOW - 45_000, null);
  db.prepare("INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?,?)").run(
    "DCL-1", "b", "Preparar fixture", "done", "OraculoMacMini", "SubOraculoMacMini",
    NOW - 54_000, NOW - 49_000, NOW - 20_000, NOW - 20_000);
  db.prepare("INSERT INTO mission_tasks VALUES (?,?,?,?,?,?,?,?,?,?)").run(
    "DCL-1", "c", "QA independiente", "done", "OraculoMacMini", "InfraOraculoMacMini",
    NOW - 52_000, NOW - 48_000, NOW - 10_000, NOW - 10_000);
  db.exec("INSERT INTO display_refs VALUES ('mission','DCL-1','0048.04/09/2026.06:03')");
  db.exec("INSERT INTO display_refs VALUES ('task','DCL-1:a','0049.04/09/2026.06:04')");
}

test("la API devuelve sólo la tarea del ejecutor exacto, actividad actual y paginación", async () => {
  const presence = [{ persona:"SubOraculo", machine:"MacMini", runtime:"Codex", host:"cli",
    session_id:"exact-session", verified:1, source:"process_snapshot", online:true, pid:77,
    updated:NOW / 1000, focus:"API token=do-not-leak" }];
  const { db, env, F } = harness(presence);
  seed(db);
  const query = parseAgentDetailQuery(params({ agent:"SubOraculo", machine:"MacMini", runtime:"Codex",
    surface:"cli", session_id:"exact-session", limit:"1", offset:"0" }));
  const response = JSON.parse(JSON.stringify(await F.agentDetail(env, query, NOW)));
  assert.equal(response.contract, "agent-detail-v1");
  assert.equal(response.identity.agent, "SubOraculoMacMini");
  assert.equal(response.current.kind, "task");
  assert.equal(response.current.state, "running");
  assert.equal(response.current.title, "Crear API");
  assert.equal(response.current.mission_id, "DCL-1");
  assert.equal(response.current.task_code, "a");
  assert.equal(response.current.project_name, "Yokup");
  assert.equal(response.current.detail_url, "/tareas?mission=DCL-1#a");
  assert.equal(response.history.total, 2);
  assert.equal(response.history.items.length, 1);
  assert.equal(response.history.has_more, true);
  assert.equal(response.history.items[0].task_code, "b");
  const serialized = JSON.stringify(response);
  assert.doesNotMatch(serialized, /exact-session|do-not-leak|report|note|pid/);
});

test("offset entrega la página cronológica siguiente sin cambiar el total", async () => {
  const { db, env, F } = harness([]);
  seed(db);
  const query = parseAgentDetailQuery(params({ agent:"SubOraculo", machine:"MacMini", runtime:"Codex",
    surface:"cli", limit:"1", offset:"1" }));
  const response = JSON.parse(JSON.stringify(await F.agentDetail(env, query, NOW)));
  assert.equal(response.history.total, 2);
  assert.equal(response.history.items.length, 1);
  assert.equal(response.history.items[0].task_code, "a");
  assert.equal(response.history.has_more, false);
});

test("principal, sub e infra no colisionan aunque compartan persona y máquina", async () => {
  const presence = [{ persona:"Oraculo", machine:"MacMini", runtime:"Codex", host:"app",
    session_id:"main", verified:1, source:"process_snapshot", online:true, pid:88, updated:NOW / 1000 }];
  const { db, env, F } = harness(presence);
  seed(db);
  const main = parseAgentDetailQuery(params({ agent:"Oraculo", machine:"MacMini", runtime:"Codex", surface:"app", session_id:"main" }));
  const infra = parseAgentDetailQuery(params({ agent:"InfraOraculo", machine:"MacMini", runtime:"Codex", surface:"cli" }));
  const mainResult = JSON.parse(JSON.stringify(await F.agentDetail(env, main, NOW)));
  const infraResult = JSON.parse(JSON.stringify(await F.agentDetail(env, infra, NOW)));
  assert.deepEqual(mainResult.history.items.map((row) => row.kind), ["mission"]);
  assert.deepEqual(infraResult.history.items.map((row) => [row.kind, row.task_code]), [["task", "c"]]);
  assert.equal(infraResult.current, null);
  assert.equal(infraResult.presence.matched, false);
});

test("la ruta pública fija no-store y valida antes de consultar", () => {
  const start = source.indexOf('url.pathname === "/fleet/agent-detail"');
  assert.notEqual(start, -1);
  const block = source.slice(start, start + 650);
  assert.match(block, /parseAgentDetailQuery\(url\.searchParams\)/);
  assert.match(block, /return json\(\{ ok:false, code:query\.code, error:query\.error \}, 400\)/);
  assert.match(block, /cache-control", "no-store"/);
});
