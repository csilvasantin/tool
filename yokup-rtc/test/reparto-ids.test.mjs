// FLT-990 a3 — Prueba unitaria del reparto de ids de flota.
// a1 (reproducir la colisión) + a3 (prueba) en un solo fichero, contra un motor
// SQL REAL (node:sqlite) con un shim que imita la API de D1 (.bind().first()/.run()).
// No toca producción: base en memoria. Ejecutar: `node test/reparto-ids.test.mjs`.
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert';

// ── Shim D1 sobre node:sqlite ───────────────────────────────────────────────
function mkEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE TABLE tickets (id TEXT PRIMARY KEY, subject TEXT, status TEXT, assignee TEXT, source TEXT, parent_id TEXT, created_at INTEGER, updated_at INTEGER)");
  db.exec("CREATE TABLE fleet_ids (inbox_id INTEGER PRIMARY KEY, mission_id TEXT UNIQUE, created_at INTEGER)");
  db.exec("CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT, ts INTEGER, kind TEXT, author TEXT, text TEXT)");
  const DB = {
    exec: (sql) => db.exec(sql),
    prepare: (sql) => ({
      bind: (...args) => ({
        first: () => db.prepare(sql).get(...args) ?? null,
        run: () => { db.prepare(sql).run(...args); return { meta: {} }; },
        all: () => ({ results: db.prepare(sql).all(...args) }),
      }),
      first: () => db.prepare(sql).get() ?? null,
    }),
  };
  return { DB, _db: db };
}

// ── Copias FIELES de las funciones bajo prueba (src/index.js) ────────────────
function fleetSubject(text) {
  const line = String(text || "").split("\n")[0].trim();
  if (!line) return "Encargo de la flota";
  return line.length > 120 ? line.slice(0, 117) + "…" : line;
}
async function addEvent(env, id, kind, author, text) {
  await env.DB.prepare("INSERT INTO events(ticket_id,ts,kind,author,text) VALUES(?,?,?,?,?)").bind(id, Date.now(), kind, author, text).run();
}
async function nextFreeFleetId(env, atLeast) {
  const a = await env.DB.prepare("SELECT MAX(CAST(SUBSTR(id,5) AS INTEGER)) mx FROM tickets WHERE id GLOB 'FLT-[0-9]*'").first();
  const b = await env.DB.prepare("SELECT MAX(inbox_id) mx FROM fleet_ids").first();
  let n = Math.max(Number(a && a.mx) || 0, Number(b && b.mx) || 0, Number(atLeast) || 0) + 1;
  for (let i = 0; i < 1e4; i++) {
    const taken = await env.DB.prepare("SELECT 1 x FROM tickets WHERE id=? UNION SELECT 1 x FROM fleet_ids WHERE mission_id=?").bind("FLT-" + n, "FLT-" + n).first();
    if (!taken) return "FLT-" + n;
    n++;
  }
  return "FLT-" + n;
}
function fleetSameEncargo(storedSubject, text) {
  const norm = (s) => String(s || "").replace(/…+$/, "").trim();
  const a = norm(storedSubject), b = norm(fleetSubject(text));
  if (a.length < 12 || b.length < 12) return a === b;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  return long.startsWith(short);
}
async function fleetMissionId(env, it) {
  const rowid = Number(it.id);
  if (!Number.isFinite(rowid)) return "FLT-" + it.id;
  const mapped = await env.DB.prepare("SELECT mission_id FROM fleet_ids WHERE inbox_id=?").bind(rowid).first();
  if (mapped && mapped.mission_id) return mapped.mission_id;
  const candidate = "FLT-" + rowid;
  const prev = await env.DB.prepare("SELECT subject FROM tickets WHERE id=?").bind(candidate).first();
  let missionId, collided = false;
  if (!prev) missionId = candidate;
  else if (fleetSameEncargo(prev.subject, it.text)) missionId = candidate;
  else { missionId = await nextFreeFleetId(env, rowid); collided = true; }
  await env.DB.prepare("INSERT OR IGNORE INTO fleet_ids(inbox_id,mission_id,created_at) VALUES(?,?,?)").bind(rowid, missionId, Date.now()).run();
  const confirmed = await env.DB.prepare("SELECT mission_id FROM fleet_ids WHERE inbox_id=?").bind(rowid).first();
  const finalId = confirmed && confirmed.mission_id ? confirmed.mission_id : missionId;
  if (collided && finalId !== candidate) await addEvent(env, finalId, "log", "yokup", `Reparto: ${candidate} ocupada; #${rowid} → ${finalId}`);
  return finalId;
}
// Modelo del sync ANTES del fix (para reproducir la colisión, a1).
function oldSyncId(it) { return "FLT-" + it.id; }

const seed = (env, id, subject, assignee) =>
  env.DB.prepare("INSERT INTO tickets(id,subject,status,assignee,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
    .bind(id, subject, "open", assignee, "fleet", 1, 1).run();
const ticket = (env, id) => env.DB.prepare("SELECT * FROM tickets WHERE id=?").bind(id).first();

let passed = 0;
const ok = (name, cond) => { assert.ok(cond, "FALLA: " + name); console.log("  ✓ " + name); passed++; };

// ── a1 · REPRODUCIR LA COLISIÓN (comportamiento viejo) ──────────────────────
{
  const env = mkEnv();
  await seed(env, "FLT-973", "Misión 1 de Oráculo", "Oraculo");
  const encargo = { id: 973, text: "Otra cosa de Neo\nsegunda línea", target_persona: "Neo" };
  const idViejo = oldSyncId(encargo);            // "FLT-973"
  // el sync viejo haría UPDATE sobre esa misma fila → pisa a Oráculo
  await env.DB.prepare("UPDATE tickets SET assignee=? WHERE id=?").bind(encargo.target_persona, idViejo).run();
  ok("a1: con el modelo viejo, el encargo #973 PISA la misión de Oráculo (assignee→Neo)", ticket(env, "FLT-973").assignee === "Neo");
}

// ── a2/a3 · EL FIX no pisa y reparte el siguiente libre ─────────────────────
{
  const env = mkEnv();
  await seed(env, "FLT-973", "Misión 1 de Oráculo", "Oraculo");
  await seed(env, "FLT-974", "Misión 3 de Oráculo", "Oraculo");
  await seed(env, "FLT-990", "Misión madre", "Neo");   // MAX real
  const encargo973 = { id: 973, text: "Otra cosa de Neo", target_persona: "Neo" };
  const nuevo = await fleetMissionId(env, encargo973);
  ok("a2: el encargo colisionado NO recibe FLT-973", nuevo !== "FLT-973");
  ok("a2: recibe el SIGUIENTE realmente libre = MAX(990)+1 = FLT-991", nuevo === "FLT-991");
  ok("a2: la misión de Oráculo FLT-973 queda INTACTA (Oraculo)", ticket(env, "FLT-973").assignee === "Oraculo");
  ok("a2: FLT-973 conserva su asunto", ticket(env, "FLT-973").subject === "Misión 1 de Oráculo");

  // idempotencia: repetir el reparto devuelve el MISMO id, sin duplicar
  const otra = await fleetMissionId(env, encargo973);
  ok("a2: reparto idempotente (mismo id en el 2º sync)", otra === "FLT-991");

  // un segundo encargo colisionado toma el siguiente al ya repartido
  const encargo974 = { id: 974, text: "Cosa distinta", target_persona: "Neo" };
  const nuevo2 = await fleetMissionId(env, encargo974);
  ok("a2: segundo colisionado no pisa 974 y coge FLT-992", nuevo2 === "FLT-992" && ticket(env, "FLT-974").assignee === "Oraculo");
}

// ── a2/a3 · ADOPCIÓN: un encargo ya sincronizado conserva su id (no duplica) ─
{
  const env = mkEnv();
  // 167 misiones históricas ya valen su rowid: FLT-985 nació del encargo #985.
  await seed(env, "FLT-985", "MISIÓN [MEJORAR YOKUP] fichas", "Neo");
  const encargo985 = { id: 985, text: "MISIÓN [MEJORAR YOKUP] fichas", target_persona: "Neo" };
  const id = await fleetMissionId(env, encargo985);
  ok("a2: el MISMO encargo ya sincronizado ADOPTA su id (FLT-985)", id === "FLT-985");
  const dups = env.DB.prepare("SELECT COUNT(*) c FROM tickets WHERE id GLOB 'FLT-*'").first();
  ok("a2: no se duplica la misión existente al adoptar", dups.c === 1);
}

// ── a2/a3 · ADOPCIÓN robusta al TRUNCADO (caso real que causó duplicados) ────
{
  const env = mkEnv();
  const full = "MISIÓN PRIORITARIA: Publicar en la home de Admira.tv el escaparate público de las 20 apps con vídeos y documentación, separándolo de la DMZ interna";
  // el asunto histórico se guardó SIN truncar (139 chars); el candidato SÍ trunca a 118
  await seed(env, "FLT-980", full, "Oraculo");
  const id = await fleetMissionId(env, { id: 980, text: full, target_persona: "Oraculo" });
  ok("a2: asunto histórico largo vs candidato truncado → ADOPTA FLT-980 (no duplica)", id === "FLT-980");
  const c = env.DB.prepare("SELECT COUNT(*) c FROM tickets WHERE id GLOB 'FLT-*'").first();
  ok("a2: sigue habiendo 1 sola misión (no se duplicó por el truncado)", c.c === 1);
}

// ── a2/a3 · DOS misiones distintas con la MISMA cabecera NO se funden ────────
{
  const env = mkEnv();
  const otra = "MISIÓN PRIORITARIA: Hacer inequívoco el proyecto principal en cada reloj de decisión";
  await seed(env, "FLT-977", otra, "Oraculo");                 // misión A ocupa FLT-977
  // encargo #977 con OTRA misión que comparte «MISIÓN PRIORITARIA:» → NO debe adoptar
  const id = await fleetMissionId(env, { id: 977, text: "MISIÓN PRIORITARIA: Publicar en la home el escaparate", target_persona: "Oraculo" });
  ok("a2: dos misiones con cabecera común NO se funden (reallocation)", id !== "FLT-977");
  ok("a2: la misión A en FLT-977 queda intacta", ticket(env, "FLT-977").subject === otra);
}

// ── caso libre: rowid nuevo sin colisión → id natural ───────────────────────
{
  const env = mkEnv();
  await seed(env, "FLT-990", "Madre", "Neo");
  const id = await fleetMissionId(env, { id: 995, text: "Encargo nuevo", target_persona: "Morfeo" });
  ok("a2: rowid libre (995) recibe su id natural FLT-995", id === "FLT-995");
}

console.log(`\nTODO OK — ${passed} aserciones.`);
