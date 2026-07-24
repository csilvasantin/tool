import puppeteer from "@cloudflare/puppeteer";
import { resolveDecisionIdentity, resolveDecisionProject, selectDecisionProjectAssignment, projectSlug as decisionProjectSlug } from "./decision-project.js";
import { baseAgentIdentity, parseAgentIdentity, scopedAgentIdentity, sameAgentFamily } from "./agent-identity.js";
import { parseDecideOptions, ideaDeliberationText, buildDecideDecisionOptions } from "./ideas-decide.js";
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// index.js
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type,authorization"
};
var json = /* @__PURE__ */ __name((o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "content-type": "application/json" } }), "json");
var AUTH_CLIENT_ID = "861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com";
var WL_API = "https://admira-whitelist.csilvasantin.workers.dev";
var WL_FALLBACK = ["csilva@admira.com", "csilvasantin@gmail.com", "mzavaleta@admira.com", "agonzalez@admira.com", "jsedano@admira.com"];
var PROTECTED = /* @__PURE__ */ new Set(["/copilot", "/tickets", "/tickets/status", "/tickets/delete", "/tasks/all", "/ticket", "/ticket/note", "/ticket/status", "/ticket/simulate", "/incidents", "/stats", "/agents", "/ai-triage", "/ai-summary", "/ai-suggest", "/kb-search", "/push/subscribe", "/fleet/nudge", "/equipo/machine", "/equipo/silicon"]);
var _wl = { at: 0, set: null };
async function whitelist() {
  if (_wl.set && Date.now() - _wl.at < 3e5) return _wl.set;
  try {
    const r = await fetch(WL_API + "/list", { cf: { cacheTtl: 60 } });
    const d = await r.json();
    const s = new Set((d.emails || []).map((e) => String(e).toLowerCase().trim()));
    if (s.size) {
      _wl = { at: Date.now(), set: s };
      return s;
    }
  } catch (e) {
  }
  return new Set(WL_FALLBACK.map((e) => e.toLowerCase()));
}
__name(whitelist, "whitelist");
var b64u = /* @__PURE__ */ __name((buf) => {
  const u = new Uint8Array(buf);
  let s = "";
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}, "b64u");
var b64uJson = /* @__PURE__ */ __name((o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), "b64uJson");
async function hmac(env, data) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.YK_SESSION_SECRET || "yokup-dev-secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
}
__name(hmac, "hmac");
async function makeSession(env, email) {
  const p = b64uJson({ email, exp: Date.now() + 12 * 3600 * 1e3 });
  return p + "." + b64u(await hmac(env, p));
}
__name(makeSession, "makeSession");
async function readSession(env, token) {
  if (!token || token.indexOf(".") < 0) return null;
  const [p, sig] = token.split(".");
  if (b64u(await hmac(env, p)) !== sig) return null;
  try {
    const body = JSON.parse(decodeURIComponent(escape(atob(p.replace(/-/g, "+").replace(/_/g, "/")))));
    if (!body.exp || Date.now() > body.exp) return null;
    return body;
  } catch (e) {
    return null;
  }
}
__name(readSession, "readSession");
async function requireAuth(env, req) {
  const h = req.headers.get("authorization") || "";
  return readSession(env, h.replace(/^Bearer\s+/i, ""));
}
__name(requireAuth, "requireAuth");
async function verifyGoogle(cred) {
  try {
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(cred));
    if (!r.ok) return null;
    const d = await r.json();
    if (d.aud !== AUTH_CLIENT_ID) return null;
    if (d.email_verified !== "true" && d.email_verified !== true) return null;
    if (!d.email) return null;
    return d;
  } catch (e) {
    return null;
  }
}
__name(verifyGoogle, "verifyGoogle");
var AI_MODELS = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "@cf/meta/llama-3.2-3b-instruct"
];
async function aiRun(env, prompt, maxTokens = 200) {
  for (const model of AI_MODELS) {
    try {
      const r = await env.AI.run(model, { messages: [{ role: "user", content: prompt }], max_tokens: maxTokens });
      const text = r && (r.response || r.result && r.result.response) || "";
      if (text) return text.trim();
    } catch (e) {
    }
  }
  return "";
}
__name(aiRun, "aiRun");
var EMB_MODEL = "@cf/google/embeddinggemma-300m";
async function embed(env, text) {
  try {
    const r = await env.AI.run(EMB_MODEL, { text: [String(text).slice(0, 2e3)] });
    return r && r.data && r.data[0] || null;
  } catch (e) {
    return null;
  }
}
__name(embed, "embed");
var b64uStr = /* @__PURE__ */ __name((s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), "b64uStr");
function b64uBytes(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(b64uBytes, "b64uBytes");
async function vapidJWT(env, aud) {
  const data = b64uStr(JSON.stringify({ typ: "JWT", alg: "ES256" })) + "." + b64uStr(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1e3) + 43200, sub: "mailto:soporte@yokup.com" }));
  const key = await crypto.subtle.importKey("jwk", JSON.parse(env.VAPID_PRIVATE), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(data));
  return data + "." + b64uBytes(new Uint8Array(sig));
}
__name(vapidJWT, "vapidJWT");
async function notifySubs(env) {
  if (!env.VAPID_PRIVATE) return;
  try {
    const { results } = await env.DB.prepare("SELECT endpoint FROM subs").all();
    for (const s of results || []) {
      try {
        const jwt = await vapidJWT(env, new URL(s.endpoint).origin);
        const r = await fetch(s.endpoint, { method: "POST", headers: { TTL: "3600", Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC}` } });
        if (r.status === 404 || r.status === 410) await env.DB.prepare("DELETE FROM subs WHERE endpoint=?").bind(s.endpoint).run();
      } catch (e) {
      }
    }
  } catch (e) {
  }
}
__name(notifySubs, "notifySubs");
var ROSTER = [
  { name: "Javier M.", skills: "climatizaci\xF3n, LED", zone: "Madrid" },
  { name: "Laura R.", skills: "redes, players", zone: "Barcelona" },
  { name: "Dani K.", skills: "redes, sens\xF3rica", zone: "Valencia" },
  { name: "Sof\xEDa P.", skills: "retail, DOOH", zone: "Bilbao" },
  { name: "Construcciones Oria", skills: "obra, instalaci\xF3n", zone: "Barcelona" }
];
function hash(s) {
  let h = 0;
  for (const c of String(s)) h = h * 31 + c.charCodeAt(0) >>> 0;
  return h;
}
__name(hash, "hash");
async function applySchema(env) {
  await env.DB.exec("CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, screen TEXT, subject TEXT, loc TEXT, role TEXT, status TEXT, priority TEXT, assignee TEXT, source TEXT, ai_triage TEXT, created_at INTEGER, updated_at INTEGER, resolved_at INTEGER)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT, ts INTEGER, kind TEXT, author TEXT, text TEXT)");
  await env.DB.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_open_screen ON tickets(screen) WHERE status != 'resolved'");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_ev_tkt ON events(ticket_id)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS subs (endpoint TEXT PRIMARY KEY, created_at INTEGER)");
  // NOTIFICACIONES DEL SISTEMA (FLT-1020, Carlos 24-jul-2026): «si algún equipo de
  // AdmiraNeXT tiene una notificación del sistema hay que avisar». Un diálogo modal
  // (permiso TCC, Gatekeeper, contraseña…) DETIENE a ese equipo y nadie se entera
  // hasta que alguien mira su pantalla. El vigilante de cada máquina publica aquí
  // lo que ve, con captura. `fingerprint` = máquina+dueño del diálogo: mientras el
  // mismo diálogo siga en pantalla se ACTUALIZA la fila, no se acumulan copias.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS notifs (id TEXT PRIMARY KEY, fingerprint TEXT, machine TEXT, owner TEXT, titulo TEXT, kind TEXT, image TEXT, status TEXT DEFAULT 'abierta', first_at INTEGER, last_at INTEGER, closed_at INTEGER, seen_count INTEGER DEFAULT 1)");
  await env.DB.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_fp ON notifs(fingerprint) WHERE status='abierta'");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_notif_st ON notifs(status, last_at)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS prefs (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)");
  // RELOJES DE DECISIÓN (Carlos, 2026-07-21): un equipo de silicio publica aquí
  // lo que tiene pendiente de decidir, con sus 3 opciones y una cuenta atrás.
  // Si Carlos no elige antes del deadline, el agente tira con la recomendada.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, machine TEXT, agent TEXT, surface TEXT, question TEXT, options TEXT, recommended INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', chosen INTEGER, chosen_by TEXT, created_at INTEGER, deadline INTEGER, decided_at INTEGER)");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_dec_status ON decisions(status, deadline)");
  // Contexto que engloba la decisión. `project` es el nombre humano canónico;
  // `mission` y `url` permiten resolver decisiones antiguas sin inferir nunca
  // el proyecto desde la pregunta operativa.
  await env.DB.exec("ALTER TABLE decisions ADD COLUMN url TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE decisions ADD COLUMN mission TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE decisions ADD COLUMN project TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE decisions ADD COLUMN project_slug TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE decisions ADD COLUMN parent_decision TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE decisions ADD COLUMN batch_id TEXT").catch(() => {});
  // Una decisión de misiones es una tanda, no cinco trabajos independientes.
  // Se persiste la cola, pero cada cierre deja la tanda en
  // `awaiting_continuation`: la siguiente misión sólo puede salir de una nueva
  // ventana enlazada de cinco minutos.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS mission_batches (id TEXT PRIMARY KEY, decision_id TEXT UNIQUE, agent TEXT, machine TEXT, status TEXT DEFAULT 'active', pause_reason TEXT, active_mission_id TEXT, created_at INTEGER, updated_at INTEGER)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS mission_batch_items (batch_id TEXT, position INTEGER, option_index INTEGER, title TEXT, mission_id TEXT, status TEXT DEFAULT 'queued', created_at INTEGER, updated_at INTEGER, PRIMARY KEY (batch_id, position))");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_batch_items_active ON mission_batch_items(batch_id, status, position)");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_batch_items_mission ON mission_batch_items(mission_id)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS mission_tasks (mission_id TEXT, code TEXT, title TEXT, status TEXT DEFAULT 'pending', owner TEXT, report TEXT, updated_at INTEGER, PRIMARY KEY (mission_id, code))");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_mtasks_mission ON mission_tasks(mission_id)");
  // image: URL pública de la captura de prueba del informe (R2 /media/…). La tabla
  // ya existe en prod, así que la columna se añade idempotente (ignora "duplicate").
  await env.DB.exec("ALTER TABLE mission_tasks ADD COLUMN image TEXT").catch(() => {});
  // Llave de lectura del service worker (ver /push/subscribe). Idempotente.
  await env.DB.exec("ALTER TABLE subs ADD COLUMN peek_key TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN proof_image TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN note TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN agent_runtime TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN agent_host TEXT").catch(() => {});
  // CAPTURA EN VIVO del CLI mientras trabaja (Carlos, 2026-07-18: «no hay nada
  // peor que no tener feedback de cómo trabaja el equipo»). live_shot = última
  // captura del terminal (R2), live_at = cuándo se tomó → la tarjeta enseña que
  // el agente NO está parado, con halo si la captura es fresca.
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN live_shot TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN live_at INTEGER").catch(() => {});
  // PROYECTOS (Carlos, 2026-07-22: «en equipo tenemos que poder dar de alta
  // proyectos y asignárselos a ordenadores o agentes»). Antes el proyecto era
  // texto libre repetido en tres sitios —la lista fija de equipo.html, el
  // adivinador por palabras de yk-misiones.js y la columna `project` de
  // decisions—, así que /decisiones acababa enseñando «Proyecto sin identificar».
  // Aquí vive el censo REAL, con su alta, su baja y sus asignaciones.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT, blurb TEXT, web TEXT, status TEXT DEFAULT 'activo', color TEXT, created_at INTEGER, updated_at INTEGER, updated_by TEXT)");
  // Un proyecto toca VARIAS máquinas y VARIOS agentes. `kind` distingue los dos
  // planos que la sección Equipo ya separa (átomos/bits) y `ref` es el id que
  // usa admira-fleet (machines[].id / silicon[].id): NO se inventa censo nuevo.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS project_members (project_id TEXT, kind TEXT, ref TEXT, added_at INTEGER, PRIMARY KEY (project_id, kind, ref))");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_pmembers_ref ON project_members(kind, ref)");
  // RESPONSABLE DE CARBONO (Carlos, 2026-07-22): la persona HUMANA que responde
  // del proyecto, por oposición al equipo de silicio. Texto libre — es un nombre,
  // no un id: quien responde de un proyecto puede no estar en ningún censo. Si
  // está vacío la ficha no enseña nada; no se rellena con suposiciones.
  await env.DB.exec("ALTER TABLE projects ADD COLUMN owner TEXT").catch(() => {});
  // ORDEN de las fichas, el que Carlos deja al arrastrarlas. Va en la tabla y no
  // en el navegador a propósito: el orden es del proyecto, no del portátil desde
  // el que se miró. NULL = nunca se ha tocado → cae al orden de siempre.
  await env.DB.exec("ALTER TABLE projects ADD COLUMN sort_order INTEGER").catch(() => {});
  // El proyecto de una MISIÓN. No se reutiliza `loc`: en las misiones de flota
  // `loc` es la MÁQUINA destino (fleetSync la escribe ahí), no el proyecto.
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN project TEXT").catch(() => {});
  // MISIÓN MADRE → HIJAS (FLT-990 b1). Aditivo y NULLABLE: las misiones planas de
  // hoy quedan con parent_id NULL y se ven EXACTELY igual que antes. Solo cuelga
  // quien se enganche a una madre por /fleet/parent.
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN parent_id TEXT").catch(() => {});
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_tickets_parent ON tickets(parent_id)").catch(() => {});
  // REPARTO DE IDS DE FLOTA A PRUEBA DE COLISIONES (FLT-990 a2). Mapea el rowid del
  // encargo del bot-inbox al mission_id que se le repartió, para que sea ESTABLE
  // entre syncs aunque el id natural FLT-<rowid> ya estuviera cogido por otra misión.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS fleet_ids (inbox_id INTEGER PRIMARY KEY, mission_id TEXT UNIQUE, created_at INTEGER)").catch(() => {});
}
__name(applySchema, "applySchema");
// FLT-1015 · El esquema no cambia entre dos requests del mismo isolate. La
// implementación anterior repetía todas las CREATE/ALTER/INDEX (más de treinta
// round-trips D1) en cada lectura dinámica. Las escrituras y el cron conservan
// el guard, pero comparten una sola promesa; si falla se libera para reintentar.
var schemaReady = null;
async function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = applySchema(env).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}
__name(ensureSchema, "ensureSchema");

// ── IDEAS / OBJETIVOS ─────────────────────────────────────────────────────────
// Las 8 sillas del Consejo AdmiraNeXT (== array CONSEJO de yokup-site/objetivos.html):
// CEO·CTO·COO·CFO (racional) / CCO·CDO·CXO·CSO (creativo). Una idea puede colgar de
// una silla (`seat`, opcional) para que su progreso se pinte en /objetivos.
const IDEA_SEATS = /* @__PURE__ */ new Set(["ceo", "cto", "coo", "cfo", "cco", "cdo", "cxo", "cso"]);
// Asegura la tabla `ideas` y su columna `seat` (migración ADITIVA e idempotente:
// las ideas viejas quedan con seat NULL y no se rompe nada). Se llama en cada ruta
// /ideas* porque estas rutas NO pasan por ensureSchema (escritura sin login).
async function ensureIdeasSchema(env) {
  await env.DB.exec("CREATE TABLE IF NOT EXISTS ideas (id TEXT PRIMARY KEY, title TEXT, body TEXT, author TEXT, tag TEXT, status TEXT, created_at INTEGER, updated_at INTEGER, mission_id TEXT)");
  await env.DB.exec("ALTER TABLE ideas ADD COLUMN seat TEXT").catch(() => {});
  // Deliberación del Consejo (FLT-1005 «En estudio»): JSON {pros:[{seat,by,text}×3],
  // cons:[{seat,by,text}×3], at}. Migración ADITIVA e idempotente igual que `seat`.
  await env.DB.exec("ALTER TABLE ideas ADD COLUMN review TEXT").catch(() => {});
  // Kit de venta (FLT-1007): adjuntos de NotebookLM. JSON {audio:{url,at}?,
  // video:{url,at}?, pdf:{url,at}?}. Migración ADITIVA e idempotente igual que arriba.
  await env.DB.exec("ALTER TABLE ideas ADD COLUMN media TEXT").catch(() => {});
  // Proyecto del censo sobre el que gira la idea (FLT-1009): slug de `projects`
  // (p. ej. "pixeria", "admiranext"). Las ideas del Consejo sin tema explícito nacen
  // centradas en un proyecto AL AZAR del censo con web. Migración ADITIVA e idempotente.
  await env.DB.exec("ALTER TABLE ideas ADD COLUMN project TEXT").catch(() => {});
  // Vínculo idea → reloj de decisión (POST /ideas/decide): id de la decisión (DEC-…)
  // que se abrió al convertir la idea en misión. Traza el ciclo Idea→Decisión→Misión
  // sin abrir dos ventanas para la misma idea. Migración ADITIVA e idempotente.
  await env.DB.exec("ALTER TABLE ideas ADD COLUMN decision_id TEXT").catch(() => {});
}
__name(ensureIdeasSchema, "ensureIdeasSchema");

// ── CONSEJO GENERADOR DE IDEAS DIARIAS (FLT-1005) ─────────────────────────────
// Cada día las 8 sillas aportan una idea/objetivo para mejorar AdmiraNeXT, UNA
// CADA 3 HORAS en rotación (8 huecos × 3h = ciclo 24h), firmada por el consejero
// de turno desde su punto fuerte. Y a demanda («✨ Idea nueva»), silla aleatoria.
// El orden y los alias son los del array CONSEJO de objetivos.html.
const COUNCIL_ORDER = ["ceo", "cto", "coo", "cfo", "cco", "cdo", "cxo", "cso"];
const COUNCIL = {
  ceo: { role: "CEO", alias: "Steve Jobs", side: "rac", fuerte: "la visi\xF3n de producto: no sumar funciones, sino decidir qu\xE9 se queda fuera para que lo que salga lleve nuestro nombre con orgullo" },
  cto: { role: "CTO", alias: "Steve Wozniak", side: "rac", fuerte: "la tecnolog\xEDa como cimiento: que lo que se construya sea s\xF3lido, real y sostenible en el tiempo" },
  coo: { role: "COO", alias: "Tim Cook", side: "rac", fuerte: "la operaci\xF3n: que la m\xE1quina gire —cadena, flota de agentes, entregas y SLA—, que lo prometido se cumpla" },
  cfo: { role: "CFO", alias: "Warren Buffett", side: "rac", fuerte: "el negocio y el coste a largo plazo: qu\xE9 renta, qu\xE9 cuesta y qu\xE9 aguanta" },
  cco: { role: "CCO", alias: "Walt Disney", side: "cre", fuerte: "la creatividad y la marca: magia y experiencias que se recuerdan toda la vida" },
  cdo: { role: "CDO", alias: "Dieter Rams", side: "cre", fuerte: "el dise\xF1o: menos, pero mejor; quitar hasta que solo quede lo esencial, y hacerlo bello" },
  cxo: { role: "CXO", alias: "Howard Schultz", side: "cre", fuerte: "la experiencia y el espacio vivido: c\xF3mo se siente estar dentro del producto" },
  cso: { role: "CSO", alias: "George Lucas", side: "cre", fuerte: "el relato: la historia que explica la idea y la hace contagiosa dentro y fuera de la casa" }
};
// Rotación SIN estado: silla de turno = Math.floor(horaUTC/3) sobre COUNCIL_ORDER.
// Determinista, sin persistencia. Hora 0-2→ceo, 3-5→cto … 21-23→cso.
function councilSeatForHour(h) {
  return COUNCIL_ORDER[Math.floor((((h % 24) + 24) % 24) / 3)] || "ceo";
}
__name(councilSeatForHour, "councilSeatForHour");
// Runner de IA para el Consejo. OJO: Workers AI ya NO siempre devuelve `response`
// como string — cuando el modelo emite JSON, la plataforma lo entrega YA PARSEADO
// como objeto. El aiRun genérico hace text.trim() y peta con esos objetos (los
// salta en silencio); por eso el Consejo tiene el suyo, que acepta objeto O string.
async function aiRunRaw(env, prompt, maxTokens = 400) {
  for (const model of AI_MODELS) {
    try {
      const r = await env.AI.run(model, { messages: [{ role: "user", content: prompt }], max_tokens: maxTokens });
      const resp = r && (r.response !== void 0 ? r.response : r.result && r.result.response);
      if (resp && typeof resp === "object") return resp;
      if (typeof resp === "string" && resp.trim()) return resp.trim();
    } catch (e) {
    }
  }
  return null;
}
__name(aiRunRaw, "aiRunRaw");
// Extrae {titulo,cuerpo} de lo que devuelva el modelo: un objeto ya parseado, un
// objeto JSON embebido en texto, o —último recurso— «primera línea = título».
function parseIdeaJSON(raw) {
  let title = "", body = "";
  if (raw && typeof raw === "object") {
    title = String(raw.titulo || raw.title || raw.t || "").trim();
    body = String(raw.cuerpo || raw.body || raw.detalle || raw.description || "").trim();
    return { title: title.slice(0, 200), body: body.slice(0, 4000) };
  }
  const s = String(raw || "").trim();
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const o = JSON.parse(m[0]);
      title = String(o.titulo || o.title || o.t || "").trim();
      body = String(o.cuerpo || o.body || o.detalle || o.description || "").trim();
    } catch (e) {
    }
  }
  if (!title) {
    const lines = s.split("\n").map((x) => x.trim()).filter(Boolean);
    if (lines.length) {
      title = lines[0].replace(/^["'#*\-\s]+|["']+$/g, "").replace(/^(t[\xEDi]tulo|title)\s*[:：]\s*/i, "").trim();
      body = lines.slice(1).join(" ").replace(/^(cuerpo|body|detalle)\s*[:：]\s*/i, "").trim();
    }
  }
  return { title: title.slice(0, 200), body: body.slice(0, 4000) };
}
__name(parseIdeaJSON, "parseIdeaJSON");
// Genera UNA idea del Consejo para `seat` con Workers AI, la firma «ROL · alias»,
// tag «consejo», status «nueva», y la guarda en `ideas`. Devuelve la fila creada,
// o null si la IA no dio nada usable (el llamador decide; nunca insertamos basura).
// FLT-1017: con `persist=false` la idea NO se guarda ni se delibera — sale sólo como
// borrador para que /objetivos rellene el formulario. Quien la da de alta es el
// formulario (POST /ideas), tras el minuto de cortesía o a mano. Así una idea que
// nadie quiso no deja rastro en la base.
async function generateCouncilIdea(env, seat, topic, projectHint, persist = true) {
  await ensureIdeasSchema(env);
  if (!IDEA_SEATS.has(seat)) seat = "ceo";
  const c = COUNCIL[seat];
  // FLT-1009: tema opcional (bajo demanda; el cron nunca lo pasa). Un string corto
  // que CENTRA la idea sin cambiar la voz del punto fuerte de la silla ni nada mas.
  const topicClean = String(topic || "").replace(/\s+/g, " ").trim().slice(0, 240);
  // FLT-1009: proyecto sobre el que gira la idea. Un `projectHint` VÁLIDO (slug del
  // censo) manda. Sin tema y sin hint, se elige un proyecto AL AZAR del censo que
  // tenga web, para que la idea hable de algo NUESTRO y enlazable. Con tema explícito
  // el tema manda: el proyecto solo se guarda si se pidió a mano (no se sortea).
  const idx = await projectIndex(env);
  let proj = null;
  const hint = String(projectHint || "").trim();
  if (hint) { const p = idx.get(hint); if (p) proj = p; }
  if (!proj && !topicClean) {
    const withWeb = (idx.rows || []).filter((p) => p && p.web && String(p.web).trim());
    if (withWeb.length) proj = withWeb[Math.floor(Math.random() * withWeb.length)];
  }
  const projSlug = proj ? proj.id : "";
  // El tema manda sobre el proyecto: si hay tema, no metemos el foco del proyecto en
  // el prompt (aunque el slug se guarde). Sin tema, centramos la idea en el proyecto.
  const focoProyecto = (!topicClean && proj) ? "\n\nCENTRA tu idea en un proyecto CONCRETO nuestro: \xAB" + proj.name + "\xBB (" + proj.web + "). Piensa una mejora REAL y accionable para ESE proyecto, mir\xE1ndola desde tu punto fuerte." : "";
  let recent = [];
  try {
    recent = (await env.DB.prepare("SELECT title FROM ideas ORDER BY created_at DESC LIMIT 15").all()).results || [];
  } catch (e) {
  }
  const previos = recent.map((r) => "- " + r.title).join("\n") || "(ninguna todav\xEDa)";
  const focoTema = topicClean ? "\n\nCENTRA tu idea EXCLUSIVAMENTE en este tema: " + topicClean + "\nHabla de ese tema de verdad, en concreto; no lo cambies por otro. Manten tu voz de " + c.role + " (" + c.fuerte + "), pero la idea DEBE ser sobre ese tema." : "";
  const prompt = `Eres ${c.role} del Consejo de AdmiraNeXT, con el esp\xEDritu de ${c.alias}. Tu punto fuerte es ${c.fuerte}.

AdmiraNeXT es un ecosistema de se\xF1alizaci\xF3n digital (DOOH) construido por agentes de IA: yokup.com (FSM de misiones y tareas del equipo), admira.live (cockpit de la flota de agentes de IA), pixeria (creatividad con IA), xpaceos (gemelo digital de la red de pantallas) y admira.tv (emisi\xF3n del canal).

Propón UNA idea u objetivo CONCRETO y accionable para MEJORAR AdmiraNeXT, mir\xE1ndolo desde tu punto fuerte (${c.role}).${focoTema}${focoProyecto} Que sea DISTINTA de estas ideas ya propuestas:
${previos}

Responde SOLO con un objeto JSON v\xE1lido, sin texto alrededor ni markdown, con esta forma exacta:
{"titulo":"<frase corta, m\xE1x 90 caracteres>","cuerpo":"<2 o 3 frases: el porqu\xE9, el c\xF3mo y para qui\xE9n>"}
Todo en espa\xF1ol.`;
  const raw = await aiRunRaw(env, prompt, 400);
  const { title, body } = parseIdeaJSON(raw);
  if (!title) return null;
  const author = c.role + " \xB7 " + c.alias;
  const now = Date.now();
  const id = "IDEA-" + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  // Borrador (FLT-1017): ni INSERT ni deliberación. Sin `id`, para que nadie lo
  // confunda con una fila viva; el alta real la hará POST /ideas con estos textos.
  if (!persist) {
    return { id: "", title, body, author, tag: "consejo", status: "", created_at: now, updated_at: now, mission_id: "", seat, project: projSlug, review: null, preview: true };
  }
  // FLT-1007: las ideas del Consejo NACEN «estudio» (a debatir de inmediato). Las
  // humanas (POST /ideas) siguen naciendo «nueva» — este automatismo es solo del Consejo.
  await env.DB.prepare("INSERT INTO ideas (id,title,body,author,tag,status,created_at,updated_at,mission_id,seat,project) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, title, body, author, "consejo", "estudio", now, now, "", seat, projSlug).run();
  // Deliberación INLINE al nacer (mismo best-effort que /ideas/status → estudio):
  // el estado ya quedó guardado arriba; si la IA falla, la idea queda en estudio sin
  // review y POST /ideas/review la regenera bajo demanda. Nunca tumba la creación.
  let review = null;
  try { review = await generateCouncilReview(env, { id, title, body, author, seat }); } catch (e) { review = null; }
  return { id, title, body, author, tag: "consejo", status: "estudio", created_at: now, updated_at: now, mission_id: "", seat, project: projSlug, review };
}
__name(generateCouncilIdea, "generateCouncilIdea");

// ── DELIBERACIÓN DEL CONSEJO (FLT-1005) ──────────────────────────────────────
// Al pasar una idea a «estudio», el resto del Consejo la debate: 3 puntos A FAVOR
// y 3 EN CONTRA, cada uno firmado por un consejero DISTINTO (6 sillas distintas
// entre sí y distintas del seat/autor de la idea), opinando desde su punto fuerte.
// Firma «ROL · alias» (by) y color por lado (seat → rac/cre en el front).
// Devuelve {pros,cons,at} o null si la IA no dio 6 textos usables (no guardamos
// deliberaciones a medias: la idea queda en estudio sin review y se puede regenerar).
function pickCouncilSeats(authorSeat) {
  const avail = COUNCIL_ORDER.filter((s) => s !== authorSeat);
  return avail.slice(0, 6); // 6 distintas (quedan 7 al quitar la del autor)
}
__name(pickCouncilSeats, "pickCouncilSeats");
// Normaliza lo que devuelva el modelo (objeto ya parseado, JSON embebido en texto,
// array de strings o de {text}) a un array de textos limpios de longitud n.
function textsFromAI(arr, n) {
  const out = [];
  const src = Array.isArray(arr) ? arr : [];
  for (let i = 0; i < n; i++) {
    const it = src[i];
    let t = "";
    if (typeof it === "string") t = it;
    else if (it && typeof it === "object") t = String(it.text || it.punto || it.motivo || it.razon || it.t || "");
    out.push(t.trim().replace(/^["'\-•\s]+/, "").slice(0, 320));
  }
  return out;
}
__name(textsFromAI, "textsFromAI");
function parseReviewJSON(raw) {
  let o = null;
  if (raw && typeof raw === "object") o = raw;
  else {
    const m = String(raw || "").match(/\{[\s\S]*\}/);
    if (m) { try { o = JSON.parse(m[0]); } catch (e) {} }
  }
  if (!o) return { pros: [], cons: [] };
  const pros = o.pros || o.favor || o.aFavor || o.a_favor || [];
  const cons = o.cons || o.contra || o.enContra || o.en_contra || [];
  return { pros, cons };
}
__name(parseReviewJSON, "parseReviewJSON");
async function generateCouncilReview(env, idea) {
  await ensureIdeasSchema(env);
  const authorSeat = IDEA_SEATS.has(String(idea.seat || "").toLowerCase()) ? String(idea.seat).toLowerCase() : "";
  const seats = pickCouncilSeats(authorSeat);          // 6 sillas distintas
  const proSeats = seats.slice(0, 3), conSeats = seats.slice(3, 6);
  const line = (s) => { const c = COUNCIL[s]; return `${c.role} (${c.alias}) — su punto fuerte: ${c.fuerte}`; };
  const prompt = `Eres la secretaría del Consejo de AdmiraNeXT (ecosistema de señalización digital DOOH hecho por agentes de IA: yokup.com, admira.live, pixeria, xpaceos, admira.tv). El Consejo debate esta idea que acaba de pasar a ESTUDIO:

TÍTULO: ${idea.title}
DETALLE: ${idea.body || "(sin detalle)"}
${idea.author ? "PROPONE: " + idea.author : ""}

Tres consejeros la defienden (un punto A FAVOR cada uno) y tres la cuestionan (un punto EN CONTRA cada uno). Cada consejero opina EXCLUSIVAMENTE desde su punto fuerte:
A FAVOR:
1) ${line(proSeats[0])}
2) ${line(proSeats[1])}
3) ${line(proSeats[2])}
EN CONTRA:
4) ${line(conSeats[0])}
5) ${line(conSeats[1])}
6) ${line(conSeats[2])}

Responde SOLO con un objeto JSON válido, sin texto alrededor ni markdown, con esta forma EXACTA (respeta el orden 1..3 a favor, 4..6 en contra):
{"pros":["<punto a favor del consejero 1, 1 frase>","<del 2>","<del 3>"],"cons":["<punto en contra del consejero 4, 1 frase>","<del 5>","<del 6>"]}
Cada frase concreta y en español, sin nombrar al consejero ni su rol dentro del texto.`;
  const raw = await aiRunRaw(env, prompt, 700);
  const { pros: rp, cons: rc } = parseReviewJSON(raw);
  const proTx = textsFromAI(rp, 3), conTx = textsFromAI(rc, 3);
  if (proTx.some((t) => !t) || conTx.some((t) => !t)) return null; // nada a medias
  const sign = (s) => COUNCIL[s].role + " \xB7 " + COUNCIL[s].alias;
  const review = {
    pros: proSeats.map((s, i) => ({ seat: s, by: sign(s), text: proTx[i] })),
    cons: conSeats.map((s, i) => ({ seat: s, by: sign(s), text: conTx[i] })),
    at: Date.now()
  };
  await env.DB.prepare("UPDATE ideas SET review=?, updated_at=? WHERE id=?")
    .bind(JSON.stringify(review), Date.now(), idea.id).run();
  return review;
}
__name(generateCouncilReview, "generateCouncilReview");
// Bitácora del cron del Consejo (auto-curación + observabilidad, FLT-1016): UNA fila
// por hueco de 3h (slot_start PRIMARY KEY, upsert por intento) con el resultado del
// último intento — para auditar franjas perdidas. Aditiva e idempotente; GET
// /council/ticks la expone. Antes el fallo del tick era MUDO: una franja perdida no
// dejaba rastro. Ahora sí.
async function ensureCouncilTicksSchema(env) {
  await env.DB.exec("CREATE TABLE IF NOT EXISTS council_ticks (slot_start INTEGER PRIMARY KEY, seat TEXT, ok INTEGER, error TEXT, at INTEGER)");
}
__name(ensureCouncilTicksSchema, "ensureCouncilTicksSchema");
// Anota el resultado de un intento del tick (upsert por hueco). Conserva solo los ~50
// huecos más recientes. Best-effort ABSOLUTO: la bitácora NUNCA tumba el tick.
async function recordCouncilTick(env, { slotStart, seat, ok, error }) {
  try {
    await ensureCouncilTicksSchema(env);
    const err = ok ? "" : String(error || "").slice(0, 300);
    await env.DB.prepare(
      "INSERT INTO council_ticks (slot_start,seat,ok,error,at) VALUES (?,?,?,?,?)" +
      " ON CONFLICT(slot_start) DO UPDATE SET seat=excluded.seat, ok=excluded.ok, error=excluded.error, at=excluded.at"
    ).bind(slotStart, seat || "", ok ? 1 : 0, err, Date.now()).run();
    await env.DB.prepare(
      "DELETE FROM council_ticks WHERE slot_start NOT IN (SELECT slot_start FROM council_ticks ORDER BY slot_start DESC LIMIT 50)"
    ).run();
  } catch (e) { /* la bitácora nunca tumba el tick */ }
}
__name(recordCouncilTick, "recordCouncilTick");
// Tick del cron (FLT-1016 · AUTOCURACIÓN): corre en CADA tick del scheduled (*/2). La
// idempotencia por hueco (SELECT tag='consejo' AND created_at>=slotStart) garantiza
// UNA sola idea por hueco de 3h y hace GRATIS el reintento: un fallo a las HH:07 se
// recupera en el siguiente */2 (HH:08/HH:10…). Coste extra cuando la idea ya existe:
// un SELECT por tick — aceptable. Cada intento (éxito ok=1 o fallo ok=0 con su error)
// queda en council_ticks para poder auditar franjas perdidas.
async function runCouncilTick(env) {
  const slotMs = 3 * 60 * 60 * 1e3;
  const now = Date.now();
  const slotStart = Math.floor(now / slotMs) * slotMs;
  const seat = councilSeatForHour(new Date(now).getUTCHours());
  try {
    await ensureIdeasSchema(env);
    const existing = await env.DB.prepare(
      "SELECT id FROM ideas WHERE tag='consejo' AND created_at >= ? LIMIT 1"
    ).bind(slotStart).first();
    if (existing) {
      // El hueco ya tiene idea: nada que generar. Deja rastro de que está cubierto.
      await recordCouncilTick(env, { slotStart, seat, ok: 1, error: "" });
      return null;
    }
    const idea = await generateCouncilIdea(env, seat);
    if (!idea) {
      const msg = "IA no dio idea usable (hueco " + new Date(slotStart).toISOString() + ", silla " + seat + ")";
      console.log("[consejo] cron: " + msg);
      await recordCouncilTick(env, { slotStart, seat, ok: 0, error: msg });
      return null;
    }
    await recordCouncilTick(env, { slotStart, seat, ok: 1, error: "" });
    return idea;
  } catch (e) {
    const msg = String(e && e.message || e);
    console.log("[consejo] cron error:", msg);
    await recordCouncilTick(env, { slotStart, seat, ok: 0, error: msg });
    return null;
  }
}
__name(runCouncilTick, "runCouncilTick");

// ── LATIDO DE LA RUTINA PROGRAMADA (FLT-1016 c · OBSERVABILIDAD + CERROJO) ─────
// La plataforma NO dispara scheduled() en esta cuenta (verificado FLT-1016: tail
// sin cron, council_ticks sólo se llenaba a demanda). El Consejo ya se autocuraba
// enganchado al fetch; ahora se generaliza a TODA la rutina del tick. worker_beats
// es aditiva e idempotente: UNA fila por rutina (routine PK, upsert) con el último
// resultado, más la fila-cerrojo '__scheduled' que sirve de throttle GLOBAL por D1.
// GET /worker/beats la expone para auditar que la rutina corre por latido HTTP.
async function ensureWorkerBeatsSchema(env) {
  await env.DB.exec("CREATE TABLE IF NOT EXISTS worker_beats (routine TEXT PRIMARY KEY, ok INTEGER, error TEXT, at INTEGER)");
}
__name(ensureWorkerBeatsSchema, "ensureWorkerBeatsSchema");
// Anota el resultado de una rutina (upsert por nombre). Best-effort ABSOLUTO: la
// bitácora NUNCA tumba la rutina. Poda de seguridad a 100 filas (hoy son ~9).
async function recordBeat(env, routine, ok, error) {
  try {
    await ensureWorkerBeatsSchema(env);
    const err = ok ? "" : String((error && error.message) || error || "").slice(0, 300);
    await env.DB.prepare(
      "INSERT INTO worker_beats (routine,ok,error,at) VALUES (?,?,?,?)" +
      " ON CONFLICT(routine) DO UPDATE SET ok=excluded.ok, error=excluded.error, at=excluded.at"
    ).bind(routine, ok ? 1 : 0, err, Date.now()).run();
    await env.DB.prepare(
      "DELETE FROM worker_beats WHERE routine NOT IN (SELECT routine FROM worker_beats ORDER BY at DESC LIMIT 100)"
    ).run();
  } catch (e) { /* la bitácora nunca tumba la rutina */ }
}
__name(recordBeat, "recordBeat");
// Cerrojo temporal GLOBAL por D1 (compare-and-swap ATÓMICO): sólo UN isolate corre
// la rutina por ventana de minGapMs. Sin esto, dos isolates con tráfico simultáneo
// dispararían dos veces reconcile/fleetPlan/fleetReconcile/… y duplicarían
// incidencias, planes de IA y eventos (esas rutinas leen-y-luego-escriben). El
// upsert condicional (DO UPDATE … WHERE at <= now-gap) sólo escribe si venció la
// ventana; meta.changes>0 ⇒ este isolate ganó el turno. Es el MISMO D1 que serializa
// escrituras: la carrera se decide en el motor SQLite, no en JS. El mismo cerrojo lo
// piden el fetch y scheduled(): si el cron revive, no se solapan → cero duplicación.
async function tryAcquireBeatLease(env, name, minGapMs) {
  const now = Date.now();
  try {
    await ensureWorkerBeatsSchema(env);
    const res = await env.DB.prepare(
      "INSERT INTO worker_beats (routine,ok,error,at) VALUES (?,1,'',?)" +
      " ON CONFLICT(routine) DO UPDATE SET at=excluded.at WHERE worker_beats.at <= ?"
    ).bind(name, now, now - minGapMs).run();
    return Number((res && res.meta && res.meta.changes) || 0) > 0;
  } catch (e) { return false; }
}
__name(tryAcquireBeatLease, "tryAcquireBeatLease");
// Edad (ms) del último latido de una rutina, o Infinity si nunca corrió. Para que las
// rutinas caras (checkWebs/checkMachines: fetch externos) se autolimiten a su propio
// ritmo (~10 min) con independencia de cada cuánto llegue tráfico HTTP.
async function beatAge(env, routine) {
  try {
    await ensureWorkerBeatsSchema(env);
    const r = await env.DB.prepare("SELECT at FROM worker_beats WHERE routine=?").bind(routine).first();
    return (r && r.at) ? Date.now() - r.at : Infinity;
  } catch (e) { return Infinity; }
}
__name(beatAge, "beatAge");
// Cuerpo ÚNICO de la rutina programada. Lo llaman IGUAL el latido HTTP y el cron
// scheduled(): cero duplicación de código. Cada sub-rutina va en su try/catch con su
// latido en worker_beats; ninguna tumba a la siguiente ni a la respuesta HTTP (corre
// en ctx.waitUntil, en 2º plano). Todas son idempotentes o inofensivas en repetición;
// el cerrojo D1 evita además el solape entre isolates de las que leen-y-escriben.
async function runScheduledRoutine(env, event) {
  const out = {};
  const step = async (name, fn) => {
    try { await fn(); await recordBeat(env, name, true, ""); out[name] = { ok: true }; }
    catch (e) { await recordBeat(env, name, false, e); out[name] = { ok: false, error: String((e && e.message) || e) }; }
  };
  try { await ensureSchema(env); } catch (e) { return out; }   // sin esquema no seguimos
  // Relojes de decisión vencidos → recomendada + materialización de su tanda.
  await step("expireDecisions", () => expireDecisionsAndStartBatches(env));
  // Incidencias DOOH: pantallas caídas/recuperadas.
  await step("reconcile", () => reconcile(env));
  // Monitor de webs y máquinas 24/7: caro (fetch externos) → ~cada 10 min por su
  // propia edad de latido, con independencia del ritmo del tráfico HTTP.
  if (await beatAge(env, "checkWebs") >= 9.5 * 60000) {
    await step("checkWebs", async () => { await checkWebs(env); await checkMachines(env); });
  }
  // Buzón de la flota → misiones/tareas (INSERT OR IGNORE: converge, no duplica).
  await step("fleetSync", () => fleetSync(env));
  // Árbol de tareas de las misiones nuevas, en tandas cortas (coste IA).
  await step("fleetPlan", () => fleetPlanPending(env, 3));
  // Avance del árbol → estado de la misión y del encargo del bot-inbox.
  await step("fleetReconcile", () => fleetReconcileAll(env));
  // Consejo generador (idempotente por hueco de 3h; su propia bitácora council_ticks).
  await step("council", () => runCouncilTick(env));
  return out;
}
__name(runScheduledRoutine, "runScheduledRoutine");
// Throttle por isolate del enganche HTTP de la rutina (ver fetch): último disparo (ms).
var scheduledPiggybackAt = 0;

// ── PROYECTOS ───────────────────────────────────────────────────────────────
// Slug estable a partir del nombre. «Admira Live» → «admira-live».
function projectSlug(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}
__name(projectSlug, "projectSlug");
// Índice de proyectos para resolver un valor suelto (id, nombre o dominio) al
// proyecto canónico. Una sola consulta; quien lo necesite varias veces lo pasa.
async function projectIndex(env) {
  // Tolerante a que la tabla aún no exista (hay rutas que leen tickets sin haber
  // pasado por ensureSchema): sin censo, el proyecto se devuelve tal cual.
  let rows = [];
  try { rows = (await env.DB.prepare("SELECT * FROM projects").all()).results || []; } catch (e) { rows = []; }
  const byKey = new Map();
  const key = (x) => String(x || "").trim().toLowerCase();
  for (const p of rows) {
    byKey.set(key(p.id), p);
    if (p.name) byKey.set(key(p.name), p);
    if (p.name) byKey.set(projectSlug(p.name), p);
    if (p.web) byKey.set(key(String(p.web).replace(/^https?:\/\//, "").replace(/\/.*$/, "")), p);
  }
  return { rows, get: (v) => byKey.get(key(v)) || byKey.get(projectSlug(v)) || null };
}
__name(projectIndex, "projectIndex");
// Lista completa con sus asignaciones (2 consultas, sin N+1) y cuántas misiones
// vivas cuelgan de cada uno.
async function listProjects(env) {
  await ensureSchema(env);
  // El orden manual manda; lo que nadie ha colocado todavía (sort_order NULL) cae
  // detrás, con el orden de siempre: activos primero y por nombre.
  const { results } = await env.DB.prepare(
    "SELECT * FROM projects ORDER BY (sort_order IS NULL), sort_order, (status='activo') DESC, name COLLATE NOCASE"
  ).all();
  const rows = results || [];
  if (!rows.length) return [];
  const mem = (await env.DB.prepare("SELECT project_id, kind, ref FROM project_members").all()).results || [];
  // VIVA = EN CURSO (Carlos, FLT-985 c1). Hasta aquí `missions` sumaba también las
  // `open` —encargadas y sin empezar— y una ficha con cinco misiones en la cola
  // decía «5 vivas» sin que nadie estuviera trabajando en ninguna. Se separan: lo
  // que cuenta como viva es `in_progress`, y lo `open` viaja aparte para poder
  // decirlo sin mentir en vez de esconderlo.
  const mis = (await env.DB.prepare("SELECT project, status, COUNT(*) c FROM tickets WHERE project IS NOT NULL AND project!='' AND status IN ('in_progress','open') GROUP BY project, status").all()).results || [];
  const misBy = {}, pendBy = {};
  for (const m of mis) {
    const k = String(m.project).toLowerCase();
    if (m.status === "in_progress") misBy[k] = m.c; else pendBy[k] = m.c;
  }
  return rows.map((p) => ({
    id: p.id, name: p.name || p.id, blurb: p.blurb || "", web: p.web || "",
    status: p.status || "activo", color: p.color || "",
    owner: p.owner || "", sort_order: p.sort_order == null ? null : Number(p.sort_order),
    machines: mem.filter((m) => m.project_id === p.id && m.kind === "machine").map((m) => m.ref),
    agents: mem.filter((m) => m.project_id === p.id && m.kind === "agent").map((m) => m.ref),
    missions: misBy[String(p.id).toLowerCase()] || 0,               // vivas = en curso
    missions_pending: pendBy[String(p.id).toLowerCase()] || 0,      // encargadas y sin empezar
    created_at: p.created_at, updated_at: p.updated_at, updated_by: p.updated_by || ""
  }));
}
__name(listProjects, "listProjects");
// Alta o edición. Devuelve la fila guardada. `machines`/`agents`, si vienen,
// REEMPLAZAN la asignación entera (es lo que manda el formulario de Equipo).
async function upsertProject(env, b) {
  await ensureSchema(env);
  const name = String((b && b.name) || "").trim().slice(0, 80);
  let id = projectSlug((b && b.id) || name);
  if (!id) return { ok: false, error: "name (o id) requerido", status: 400 };
  const now = Date.now();
  const prev = await env.DB.prepare("SELECT * FROM projects WHERE id=?").bind(id).first();
  if (!prev && !name) return { ok: false, error: "name requerido para dar de alta", status: 400 };
  const val = (k, max, def) => {
    if (b && b[k] !== undefined && b[k] !== null) return String(b[k]).trim().slice(0, max);
    return prev ? (prev[k] || "") : (def || "");
  };
  const status = ["activo", "pausado", "archivado"].includes(String((b && b.status) || "").toLowerCase())
    ? String(b.status).toLowerCase() : (prev ? (prev.status || "activo") : "activo");
  const row = {
    id, name: name || (prev && prev.name) || id,
    blurb: val("blurb", 240), web: val("web", 160).replace(/\/+$/, ""),
    status, color: val("color", 24), owner: val("owner", 80),
    created_at: prev ? prev.created_at : now, updated_at: now,
    updated_by: String((b && b.by) || "").slice(0, 60)
  };
  await env.DB.prepare(
    "INSERT INTO projects (id,name,blurb,web,status,color,owner,created_at,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?)" +
    " ON CONFLICT(id) DO UPDATE SET name=excluded.name, blurb=excluded.blurb, web=excluded.web, status=excluded.status, color=excluded.color, owner=excluded.owner, updated_at=excluded.updated_at, updated_by=excluded.updated_by"
  ).bind(row.id, row.name, row.blurb, row.web, row.status, row.color, row.owner, row.created_at, row.updated_at, row.updated_by).run();
  for (const kind of ["machine", "agent"]) {
    const campo = kind === "machine" ? "machines" : "agents";
    if (!b || !Array.isArray(b[campo])) continue;
    const refs = [...new Set(b[campo].map((r) => String(r || "").trim().slice(0, 80)).filter(Boolean))].slice(0, 60);
    await env.DB.prepare("DELETE FROM project_members WHERE project_id=? AND kind=?").bind(id, kind).run();
    for (const ref of refs) {
      await env.DB.prepare("INSERT OR IGNORE INTO project_members (project_id,kind,ref,added_at) VALUES (?,?,?,?)")
        .bind(id, kind, ref, now).run();
    }
  }
  return { ok: true, created: !prev, project: (await listProjects(env)).find((p) => p.id === id) || row };
}
__name(upsertProject, "upsertProject");
// Resuelve el proyecto de una decisión/misión a su NOMBRE canónico. Si el valor
// guardado no está en el censo se devuelve tal cual (no se inventa nada): es un
// proyecto viejo escrito a mano, y mentir sobre él sería peor que enseñarlo.
function resolveProject(idx, raw) {
  const v = String(raw || "").trim();
  if (!v) return { id: "", name: "" };
  const p = idx.get(v);
  return p ? { id: p.id, name: p.name || p.id } : { id: "", name: v };
}
__name(resolveProject, "resolveProject");

// Fuente canónica de un reloj: intersección en D1 del MISMO proyecto activo
// para el agente y la máquina. Cero o más de uno son ambiguos y fallan cerrado.
async function exactDecisionProjectAssignment(env, agent, machine, requestedProjectId = "") {
  const idx = await projectIndex(env);
  const members = (await env.DB.prepare("SELECT project_id,kind,ref FROM project_members").all()).results || [];
  return selectDecisionProjectAssignment(idx.rows, members, agent, machine, requestedProjectId);
}
__name(exactDecisionProjectAssignment, "exactDecisionProjectAssignment");

// Un reloj de decisión pesa: se permite uno por agente y día natural de Madrid.
// `user_override:true` sólo lo usa el coordinador cuando Carlos lo pide de forma
// explícita (como en la ventana manual); queda visible en la respuesta del API.
function madridDayKey(ms) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(ms);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
__name(ensureSchema, "ensureSchema");

// La PRUEBA en un solo formato, decidida en un solo sitio (FLT-988 b2). Antes cada
// endpoint aplicaba su propio /^https?:\/\//: /fleet/informe devolvía 400 y
// /fleet/task-status TIRABA la imagen en silencio (ok:true con image:null), de ahí
// que el pantallazo hubiera que escribirlo aparte en D1. Ahora hay una función:
// devuelve {value} si vale, {error} con el motivo si no. Se aceptan URL http(s) y
// data:image/… en base64 (una captura pegada tal cual).
function normalizeProofImage(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s) return { value: null, error: "vacía" };
  if (/^https?:\/\/\S+$/i.test(s)) {
    if (s.length > 500) return { value: null, error: "la URL pasa de 500 caracteres; acórtala" };
    return { value: s, error: null };
  }
  if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(s)) {
    // Sin recorte mudo: una captura embebida cortada a 500 caracteres sería una
    // imagen rota que dice ser una prueba. O entra entera, o se rechaza con motivo.
    if (s.length > 2e5) return { value: null, error: "la captura embebida pesa " + Math.round(s.length / 1024) + " KB y el máximo son 195 KB: súbela y manda su URL http(s)" };
    return { value: s, error: null };
  }
  if (/^\//.test(s) || /^[a-z]:\\/i.test(s) || /^file:/i.test(s)) {
    return { value: null, error: "es una ruta local («" + s.slice(0, 80) + "»), y una ruta del disco de un agente no la puede ver nadie más: sube la captura y manda su URL http(s), o pega un data:image/…;base64" };
  }
  return { value: null, error: "no es una URL http(s) ni un data:image/…;base64 («" + s.slice(0, 80) + "»)" };
}
__name(normalizeProofImage, "normalizeProofImage");

// FLT-1007 c — La tubería de /fleet/media solo tragaba image/* («solo imágenes»), así
// que el Kit de venta del Consejo (audio de la charla, vídeo y briefing en PDF) se
// quedaba fuera. Aquí, en UN único sitio testeable, se decide qué content-type entra y
// con qué extensión coherente se guarda el objeto R2. Se admite imagen, audio de m4a
// (audio/mp4 y audio/x-m4a, con el alias audio/m4a por si acaso), vídeo mp4 y PDF; el
// resto se rechaza con motivo (no en silencio). Devuelve {ok, ext} o {ok:false, error}.
var FLEET_MEDIA_MAX = 80 * 1024 * 1024;
function fleetMediaKind(ct) {
  const t = String(ct == null ? "" : ct).split(";")[0].trim().toLowerCase();
  if (!t) return { ok: false, error: "sin content-type: mándalo en la cabecera (image/*, audio/mp4|x-m4a, video/mp4 o application/pdf)" };
  if (/^image\//.test(t)) {
    const ext = (t.split("/")[1] || "png").replace(/[^a-z0-9]/g, "") || "png";
    return { ok: true, ext, ct: t };
  }
  if (t === "audio/mp4" || t === "audio/x-m4a" || t === "audio/m4a") return { ok: true, ext: "m4a", ct: t };
  if (t === "video/mp4") return { ok: true, ext: "mp4", ct: t };
  if (t === "application/pdf") return { ok: true, ext: "pdf", ct: t };
  return { ok: false, error: "content-type no admitido («" + t + "»): solo image/*, audio/mp4|x-m4a, video/mp4 o application/pdf" };
}
__name(fleetMediaKind, "fleetMediaKind");

// Las referencias numéricas históricas siguen entrando como FLT-<n>, pero los ids
// alfanuméricos de tandas (MIS-DEC-...) son opacos: cambiarles el case rompe la
// clave primaria y hace que una misión existente parezca ausente.
function normalizeMissionReference(raw) {
  const value = String(raw == null ? "" : raw).trim();
  if (/^#?\d+$/.test(value)) return "FLT-" + value.replace(/^#/, "");
  const fleet = /^flt-(\d+)$/i.exec(value);
  return fleet ? "FLT-" + fleet[1] : value;
}
__name(normalizeMissionReference, "normalizeMissionReference");

async function hasMissionProof(env, mid) {
  const row = await env.DB.prepare(
    "SELECT proof_image FROM tickets WHERE id=?"
  ).bind(mid).first();
  if (row && row.proof_image) return true;
  const task = await env.DB.prepare(
    "SELECT image FROM mission_tasks WHERE mission_id=? AND image IS NOT NULL AND image<>'' ORDER BY updated_at DESC LIMIT 1"
  ).bind(mid).first();
  return !!(task && task.image);
}
__name(hasMissionProof, "hasMissionProof");

// EL ÚNICO PUNTO DONDE LA PRUEBA ASCIENDE (FLT-989 a3/b1). Da igual por dónde se
// cierre la misión —agente (/fleet/task-status), web (chips de /misiones) o cron
// (fleetReconcile*/fleetSync)—: si la ficha aún no tiene proof_image y hay captura
// de RESPALDO en algún paso (mission_tasks.image, el mismo criterio que acepta
// hasMissionProof: la más reciente), se sube a tickets.proof_image. Así una misión
// cerrada por respaldo NO sale finalizada con el logotipo de relleno (nacían las
// huérfanas FLT-826/830). Idempotente: si ya hay prueba no la pisa, y hay un único
// criterio de qué imagen asciende. Devuelve la imagen vigente (o null).
async function ascendMissionProof(env, mid) {
  const t = await env.DB.prepare("SELECT proof_image FROM tickets WHERE id=?").bind(mid).first();
  if (t && t.proof_image) return t.proof_image;   // ya tiene prueba propia → no se toca
  const task = await env.DB.prepare(
    "SELECT image FROM mission_tasks WHERE mission_id=? AND image IS NOT NULL AND image<>'' ORDER BY updated_at DESC LIMIT 1"
  ).bind(mid).first();
  if (!(task && task.image)) return null;         // no hay respaldo que subir
  await env.DB.prepare(
    "UPDATE tickets SET proof_image=?, updated_at=? WHERE id=? AND (proof_image IS NULL OR proof_image='')"
  ).bind(task.image, Date.now(), mid).run();
  return task.image;
}
__name(ascendMissionProof, "ascendMissionProof");

// ---- TANDAS DE MISIONES DESDE RELOJES DE DECISIÓN -------------------------
// La decisión inicial (cinco misiones + «Volver atrás») crea una única tanda.
// Las continuaciones sólo reordenan sus 1..5 elementos aún queued. Nunca se
// materializan pendientes como tickets ni se recuperan elementos completados.
function isBackOption(option) {
  return /volver\s+atr[aá]s|no\s+iniciar/i.test(String(option || ""));
}
__name(isBackOption, "isBackOption");
function isInitialMissionDecision(options) {
  return Array.isArray(options) && options.length === 6 && isBackOption(options[5]);
}
__name(isInitialMissionDecision, "isInitialMissionDecision");
function isContinuationMissionDecision(options, decision) {
  // parent_decision es el discriminante persistente. La decisión inicial recibe
  // batch_id al resolverse, pero nunca debe convertirse por ello en continuación.
  return !!(decision && decision.parent_decision) &&
    Array.isArray(options) && options.length >= 2 && options.length <= 6 && isBackOption(options[options.length - 1]);
}
__name(isContinuationMissionDecision, "isContinuationMissionDecision");
function isMissionDecision(options, decision) {
  return isInitialMissionDecision(options) || isContinuationMissionDecision(options, decision);
}
__name(isMissionDecision, "isMissionDecision");
function batchIdForDecision(decisionId) {
  return "BATCH-" + String(decisionId || "").replace(/[^A-Za-z0-9_-]/g, "-");
}
__name(batchIdForDecision, "batchIdForDecision");
function missionIdForBatchItem(batchId, position) {
  return "MIS-" + String(batchId || "").replace(/^BATCH-/, "").slice(0, 42) + "-" + String(position + 1).padStart(2, "0");
}
__name(missionIdForBatchItem, "missionIdForBatchItem");
function orderedMissionOptions(options, chosen) {
  const count = options.length - 1; // la última es siempre «Volver atrás»
  const out = [];
  for (let position = 0; position < count; position++) {
    const optionIndex = (chosen + position) % count;
    out.push({ position, option_index: optionIndex, title: String(options[optionIndex] || "").slice(0, 200) });
  }
  return out;
}
__name(orderedMissionOptions, "orderedMissionOptions");
function continuationMissionOrder(options, chosen, queuedItems) {
  if (!Array.isArray(queuedItems) || !isContinuationMissionDecision(options, { parent_decision: "linked" })) return [];
  const byTitle = new Map();
  for (const item of queuedItems) {
    const key = String(item && item.title || "").trim().toLocaleLowerCase("es");
    if (!key || byTitle.has(key)) return [];
    byTitle.set(key, item);
  }
  const ordered = [];
  for (const option of orderedMissionOptions(options, chosen)) {
    const key = String(option.title || "").trim().toLocaleLowerCase("es");
    const item = byTitle.get(key);
    if (!item || ordered.includes(item)) return [];
    ordered.push(item);
  }
  return ordered.length === queuedItems.length ? ordered : [];
}
__name(continuationMissionOrder, "continuationMissionOrder");
function remainingBatchItems(items) {
  return (items || []).filter((item) => item.status === "queued" && item.ticket_status !== "resolved" && item.ticket_status !== "cancelled");
}
__name(remainingBatchItems, "remainingBatchItems");
async function reconcileQueuedBatchItems(env, batchId) {
  const rows = await env.DB.prepare(
    "SELECT i.*,t.status AS ticket_status FROM mission_batch_items i LEFT JOIN tickets t ON t.id=i.mission_id WHERE i.batch_id=? AND i.status='queued' ORDER BY i.position"
  ).bind(batchId).all();
  const stale = (rows.results || []).filter((item) => item.ticket_status === "resolved" || item.ticket_status === "cancelled");
  if (stale.length) {
    await env.DB.batch(stale.map((item) => env.DB.prepare(
      "UPDATE mission_batch_items SET status=?,updated_at=? WHERE batch_id=? AND position=? AND status='queued'"
    ).bind(item.ticket_status === "cancelled" ? "cancelled" : "completed", Date.now(), batchId, item.position)));
  }
  return remainingBatchItems(rows.results || []);
}
__name(reconcileQueuedBatchItems, "reconcileQueuedBatchItems");
function batchMissionPlan(title, agent, machine) {
  const short = String(title || "Misión").slice(0, 70);
  const base = baseAgentIdentity(agent) || "Agente";
  return [
    { code: "a", title: "Implementar: " + short, owner: scopedAgentIdentity(base, machine, "sub") },
    { code: "b", title: "Verificar y entregar evidencia: " + short, owner: scopedAgentIdentity(base, machine, "sub") },
    { code: "c", title: "Documentar informe factual autorizado", owner: scopedAgentIdentity(base, machine, "infra") }
  ];
}
__name(batchMissionPlan, "batchMissionPlan");
async function missionBatchSnapshot(env, batchId) {
  await reconcileQueuedBatchItems(env, batchId);
  const batch = await env.DB.prepare("SELECT * FROM mission_batches WHERE id=?").bind(batchId).first();
  if (!batch) return null;
  const { results } = await env.DB.prepare(
    "SELECT batch_id,position,option_index,title,mission_id,status,created_at,updated_at FROM mission_batch_items WHERE batch_id=? ORDER BY position"
  ).bind(batchId).all();
  return { ...batch, items: results || [] };
}
__name(missionBatchSnapshot, "missionBatchSnapshot");
// HISTÓRICO DE DECISIONES EN BLOQUE (FLT-1015). /decisions puede enseñar 40
// relojes de misión por página. Resolver cada carrusel con
// missionBatchSnapshot() hacía 3 consultas D1 por ficha (JOIN de reconciliación
// + batch + items): 38 fichas reales = 114 round-trips y 3–6 s de espera.
// Esta variante conserva la reconciliación, pero agrupa toda la página en tres
// lecturas y un único batch de escrituras sólo cuando encuentra filas obsoletas.
async function missionBatchSnapshots(env, batchIds) {
  const ids = [...new Set((batchIds || []).map((id) => String(id || "")).filter(Boolean))];
  const out = new Map();
  if (!ids.length) return out;
  const joined = await selectIn(env, ids, (ph) =>
    `SELECT i.batch_id,i.position,i.status,t.status AS ticket_status
     FROM mission_batch_items i LEFT JOIN tickets t ON t.id=i.mission_id
     WHERE i.batch_id IN (${ph}) AND i.status='queued'`
  );
  const stale = joined.filter((item) => item.ticket_status === "resolved" || item.ticket_status === "cancelled");
  if (stale.length) {
    const now = Date.now();
    await env.DB.batch(stale.map((item) => env.DB.prepare(
      "UPDATE mission_batch_items SET status=?,updated_at=? WHERE batch_id=? AND position=? AND status='queued'"
    ).bind(item.ticket_status === "cancelled" ? "cancelled" : "completed", now, item.batch_id, item.position)));
  }
  const batches = await selectIn(env, ids, (ph) =>
    `SELECT * FROM mission_batches WHERE id IN (${ph})`
  );
  const items = await selectIn(env, ids, (ph) =>
    `SELECT batch_id,position,option_index,title,mission_id,status,created_at,updated_at
     FROM mission_batch_items WHERE batch_id IN (${ph}) ORDER BY batch_id,position`
  );
  const byBatch = new Map();
  for (const item of items) {
    if (!byBatch.has(item.batch_id)) byBatch.set(item.batch_id, []);
    byBatch.get(item.batch_id).push(item);
  }
  for (const batch of batches) out.set(batch.id, { ...batch, items: byBatch.get(batch.id) || [] });
  return out;
}
__name(missionBatchSnapshots, "missionBatchSnapshots");
async function batchClosureAccepted(env, missionId) {
  const row = await env.DB.prepare(
    "SELECT 1 AS accepted FROM events WHERE ticket_id=? AND kind='accept' LIMIT 1"
  ).bind(missionId).first();
  return !!row;
}
__name(batchClosureAccepted, "batchClosureAccepted");
async function pauseMissionBatch(env, batchId, reason) {
  const now = Date.now();
  await env.DB.prepare("UPDATE mission_batches SET status='paused', pause_reason=?, updated_at=? WHERE id=? AND status='active'")
    .bind(String(reason || "Pausada por decisión del Agente").slice(0, 300), now, batchId).run();
  return missionBatchSnapshot(env, batchId);
}
__name(pauseMissionBatch, "pauseMissionBatch");
async function batchForMission(env, missionId) {
  const row = await env.DB.prepare("SELECT batch_id FROM mission_batch_items WHERE mission_id=? LIMIT 1").bind(missionId).first();
  return row ? row.batch_id : null;
}
__name(batchForMission, "batchForMission");
async function completeBatchMissionAndAwaitContinuation(env, batchId, missionId) {
  const item = await env.DB.prepare(
    "SELECT * FROM mission_batch_items WHERE batch_id=? AND mission_id=? LIMIT 1"
  ).bind(batchId, missionId).first();
  if (!item || item.status === "completed") return missionBatchSnapshot(env, batchId);
  if (item.status !== "active") return missionBatchSnapshot(env, batchId);
  const ticket = await env.DB.prepare("SELECT status FROM tickets WHERE id=?").bind(missionId).first();
  if (!ticket || ticket.status !== "resolved" || !(await batchClosureAccepted(env, missionId))) {
    return missionBatchSnapshot(env, batchId);
  }
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE mission_batch_items SET status='completed',updated_at=? WHERE batch_id=? AND mission_id=? AND status='active'"
    ).bind(now, batchId, missionId),
    env.DB.prepare(
      "UPDATE mission_batches SET active_mission_id=NULL,updated_at=? WHERE id=? AND active_mission_id=?"
    ).bind(now, batchId, missionId)
  ]);
  const remaining = await reconcileQueuedBatchItems(env, batchId);
  if (!remaining.length) {
    await env.DB.prepare(
      "UPDATE mission_batches SET status='completed',pause_reason=NULL,active_mission_id=NULL,updated_at=? WHERE id=?"
    ).bind(Date.now(), batchId).run();
  } else {
    await env.DB.prepare(
      "UPDATE mission_batches SET status='awaiting_continuation',pause_reason=?,active_mission_id=NULL,updated_at=? WHERE id=?"
    ).bind("Esperando una nueva decisión de 5 minutos con las misiones restantes.", Date.now(), batchId).run();
  }
  return missionBatchSnapshot(env, batchId);
}
__name(completeBatchMissionAndAwaitContinuation, "completeBatchMissionAndAwaitContinuation");
async function requeuePristineBatchMission(env, missionId) {
  const row = await env.DB.prepare(
    "SELECT i.batch_id,i.position,i.status AS item_status,b.status AS batch_status,b.active_mission_id," +
    "t.id AS ticket_id,t.status AS ticket_status,t.source,t.proof_image,t.live_shot,t.live_at,t.resolved_at " +
    "FROM mission_batch_items i JOIN mission_batches b ON b.id=i.batch_id " +
    "LEFT JOIN tickets t ON t.id=i.mission_id WHERE i.mission_id=? LIMIT 1"
  ).bind(missionId).first();
  if (!row) return { ok: false, status: 404, error: "La misión no pertenece a una tanda." };
  if (row.item_status === "queued" && !row.ticket_id && row.batch_status === "awaiting_continuation") {
    return { ok: true, requeued: false, already_queued: true, batch: await missionBatchSnapshot(env, row.batch_id) };
  }
  if (row.item_status !== "active" || row.batch_status !== "active" || row.active_mission_id !== missionId) {
    return { ok: false, status: 409, error: "La misión ya no es la activa de una tanda." };
  }
  if (row.ticket_status !== "in_progress" || row.source !== "decision-batch") {
    return { ok: false, status: 409, error: "La misión activa ya no conserva el estado inicial reencolable." };
  }
  if (row.proof_image || row.live_shot || row.live_at || row.resolved_at) {
    return { ok: false, status: 409, error: "La misión tiene progreso o prueba y no puede reencolarse." };
  }
  const pendingDecision = await env.DB.prepare(
    "SELECT id FROM decisions WHERE batch_id=? AND status='pending' LIMIT 1"
  ).bind(row.batch_id).first();
  if (pendingDecision) {
    return { ok: false, status: 409, error: "Ya existe una decisión de continuación pendiente." };
  }
  const taskAudit = await env.DB.prepare(
    "SELECT COUNT(*) AS total,SUM(CASE WHEN status!='pending' OR COALESCE(TRIM(report),'')<>'' OR COALESCE(TRIM(image),'')<>'' THEN 1 ELSE 0 END) AS dirty " +
    "FROM mission_tasks WHERE mission_id=?"
  ).bind(missionId).first();
  if (Number(taskAudit && taskAudit.dirty || 0) > 0) {
    return { ok: false, status: 409, error: "La misión tiene tareas iniciadas, completadas o informadas." };
  }
  const eventAudit = await env.DB.prepare(
    "SELECT COUNT(*) AS dirty FROM events WHERE ticket_id=? AND NOT(kind='log' AND text LIKE 'Misión activada desde la cola %')"
  ).bind(missionId).first();
  if (Number(eventAudit && eventAudit.dirty || 0) > 0) {
    return { ok: false, status: 409, error: "La misión tiene actividad real registrada." };
  }
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM events WHERE ticket_id=? AND kind='log' AND text LIKE 'Misión activada desde la cola %'").bind(missionId),
    env.DB.prepare("DELETE FROM mission_tasks WHERE mission_id=?").bind(missionId),
    env.DB.prepare("DELETE FROM tickets WHERE id=? AND status='in_progress' AND source='decision-batch'").bind(missionId),
    env.DB.prepare(
      "UPDATE mission_batch_items SET status='queued',updated_at=? WHERE batch_id=? AND mission_id=? AND status='active'"
    ).bind(now, row.batch_id, missionId),
    env.DB.prepare(
      "UPDATE mission_batches SET status='awaiting_continuation',pause_reason=?,active_mission_id=NULL,updated_at=? " +
      "WHERE id=? AND status='active' AND active_mission_id=?"
    ).bind("Reencolada sin trabajo real; esperando una nueva decisión de 5 minutos.", now, row.batch_id, missionId)
  ]);
  return { ok: true, requeued: true, already_queued: false, batch: await missionBatchSnapshot(env, row.batch_id) };
}
__name(requeuePristineBatchMission, "requeuePristineBatchMission");
async function acceptBatchInformeClosure(env, ticket, missionId, owner, report) {
  if (!ticket || ticket.source !== "decision-batch") return null;
  const agent = String(ticket.assignee || owner || "Agente").trim();
  if (!(await batchClosureAccepted(env, missionId))) {
    await addEvent(env, missionId, "accept", agent, "Cierre aceptado por el Agente mediante informe con prueba. " + String(report || "").slice(0, 180));
  }
  const batchId = await batchForMission(env, missionId);
  return batchId ? completeBatchMissionAndAwaitContinuation(env, batchId, missionId) : null;
}
__name(acceptBatchInformeClosure, "acceptBatchInformeClosure");
async function activateNextMissionBatchItem(env, batchId) {
  const batch = await env.DB.prepare("SELECT * FROM mission_batches WHERE id=?").bind(batchId).first();
  if (!batch || batch.status !== "active") return missionBatchSnapshot(env, batchId);
  const active = await env.DB.prepare(
    "SELECT * FROM mission_batch_items WHERE batch_id=? AND status='active' ORDER BY position LIMIT 1"
  ).bind(batchId).first();
  if (active) {
    const ticket = active.mission_id && await env.DB.prepare("SELECT status FROM tickets WHERE id=?").bind(active.mission_id).first();
    if (ticket && ticket.status === "cancelled") return pauseMissionBatch(env, batchId, "La misión activa fue cancelada expresamente.");
    if (!ticket || ticket.status !== "resolved" || !(await batchClosureAccepted(env, active.mission_id))) {
      return missionBatchSnapshot(env, batchId); // sin evidencia aceptada, no se avanza
    }
    const now = Date.now();
    await env.DB.prepare("UPDATE mission_batch_items SET status='completed', updated_at=? WHERE batch_id=? AND position=?")
      .bind(now, batchId, active.position).run();
    await env.DB.prepare("UPDATE mission_batches SET active_mission_id=NULL, updated_at=? WHERE id=?")
      .bind(now, batchId).run();
  }
  const remaining = await reconcileQueuedBatchItems(env, batchId);
  const next = remaining[0] || null;
  if (!next) {
    await env.DB.prepare("UPDATE mission_batches SET status='completed', active_mission_id=NULL, updated_at=? WHERE id=?")
      .bind(Date.now(), batchId).run();
    return missionBatchSnapshot(env, batchId);
  }
  const missionId = next.mission_id || missionIdForBatchItem(batchId, next.position);
  const now = Date.now();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO tickets(id,screen,subject,loc,role,status,priority,assignee,source,ai_triage,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(missionId, "decision-batch:" + batch.decision_id, next.title, batch.machine || "", "mission", "in_progress", "normal", batch.agent || "", "decision-batch", "", now, now).run();
  const existingTasks = await listMissionTasks(env, missionId);
  if (!existingTasks.length) await saveMissionPlan(env, missionId, batchMissionPlan(next.title, batch.agent, batch.machine));
  await env.DB.prepare("UPDATE mission_batch_items SET mission_id=?, status='active', updated_at=? WHERE batch_id=? AND position=?")
    .bind(missionId, now, batchId, next.position).run();
  await env.DB.prepare("UPDATE mission_batches SET active_mission_id=?, updated_at=? WHERE id=?")
    .bind(missionId, now, batchId).run();
  await addEvent(env, missionId, "log", "Agente", "Misión activada desde la cola " + batch.decision_id + ". Requiere evidencia y aceptación del Agente antes de avanzar.");
  return missionBatchSnapshot(env, batchId);
}
__name(activateNextMissionBatchItem, "activateNextMissionBatchItem");
async function ensureMissionBatchFromDecision(env, decision) {
  let options = [];
  try { options = JSON.parse(decision && decision.options || "[]"); } catch (e) {}
  if (!decision || !isMissionDecision(options, decision)) return null;
  const effective = decision.status === "decided" ? Number(decision.chosen) : decision.status === "expired" ? Number(decision.recommended) : null;
  if (!Number.isInteger(effective)) return null;
  // «Volver atrás» no es una misión: descarta el lote de forma terminal.
  if (effective === options.length - 1) return null;
  const continuation = isContinuationMissionDecision(options, decision);
  const batchId = continuation ? String(decision.batch_id || "") : batchIdForDecision(decision.id);
  const now = Date.now();
  if (continuation) {
    const batch = batchId && await env.DB.prepare("SELECT id,status FROM mission_batches WHERE id=?").bind(batchId).first();
    if (!batch || batch.status !== "awaiting_continuation") return missionBatchSnapshot(env, batchId);
    const queued = await reconcileQueuedBatchItems(env, batchId);
    const ordered = continuationMissionOrder(options, effective, queued);
    if (!ordered.length) return missionBatchSnapshot(env, batchId);
    const positions = queued.map((item) => item.position).sort((a, b) => a - b);
    const statements = [];
    for (let i = 0; i < ordered.length; i++) {
      statements.push(env.DB.prepare("UPDATE mission_batch_items SET position=? WHERE batch_id=? AND position=?")
        .bind(-1000 - i, batchId, ordered[i].position));
    }
    for (let i = 0; i < ordered.length; i++) {
      statements.push(env.DB.prepare("UPDATE mission_batch_items SET position=?, updated_at=? WHERE batch_id=? AND position=?")
        .bind(positions[i], now, batchId, -1000 - i));
    }
    statements.push(env.DB.prepare(
      "UPDATE mission_batches SET status='active',pause_reason=NULL,updated_at=? WHERE id=? AND status='awaiting_continuation'"
    ).bind(now, batchId));
    await env.DB.batch(statements);
    return activateNextMissionBatchItem(env, batchId);
  }
  await env.DB.prepare(
    "INSERT OR IGNORE INTO mission_batches(id,decision_id,agent,machine,status,created_at,updated_at) VALUES(?,?,?,?, 'active',?,?)"
  ).bind(batchId, decision.id, decision.agent || "", decision.machine || "", now, now).run();
  await env.DB.prepare("UPDATE decisions SET batch_id=? WHERE id=? AND (batch_id IS NULL OR batch_id='')").bind(batchId, decision.id).run();
  const existing = await env.DB.prepare("SELECT 1 AS x FROM mission_batch_items WHERE batch_id=? LIMIT 1").bind(batchId).first();
  if (!existing) {
    for (const item of orderedMissionOptions(options, effective)) {
      await env.DB.prepare(
        "INSERT INTO mission_batch_items(batch_id,position,option_index,title,status,created_at,updated_at) VALUES(?,?,?,?, 'queued',?,?)"
      ).bind(batchId, item.position, item.option_index, item.title, now, now).run();
    }
  }
  return activateNextMissionBatchItem(env, batchId);
}
__name(ensureMissionBatchFromDecision, "ensureMissionBatchFromDecision");
async function expireDecisionsAndStartBatches(env) {
  await expireDecisions(env);
  return startDecisionBatches(env);
}
__name(expireDecisionsAndStartBatches, "expireDecisionsAndStartBatches");
async function expireDecisions(env) {
  const now = Date.now();
  await env.DB.prepare("UPDATE decisions SET status='expired' WHERE status='pending' AND deadline < ?").bind(now).run();
}
__name(expireDecisions, "expireDecisions");
async function startDecisionBatches(env) {
  // Sólo decisiones que todavía no han actualizado su tanda. Antes se
  // recorrían las 100 últimas en CADA GET, aunque 98 ya estuvieran procesadas.
  // Para una continuación, updated_at posterior al cierre/vencimiento certifica
  // que el orden restante ya se aplicó; para una raíz basta decision_id.
  const { results } = await env.DB.prepare(
    `SELECT d.* FROM decisions d
     LEFT JOIN mission_batches own ON own.decision_id=d.id
     LEFT JOIN mission_batches shared ON shared.id=d.batch_id
     WHERE d.status IN ('decided','expired') AND (
       ((d.parent_decision IS NULL OR d.parent_decision='') AND own.id IS NULL)
       OR
       (d.parent_decision IS NOT NULL AND d.parent_decision<>'' AND
        (shared.id IS NULL OR COALESCE(shared.updated_at,0) < COALESCE(d.decided_at,d.deadline,0)))
     )
     ORDER BY d.created_at DESC LIMIT 100`
  ).all();
  for (const decision of results || []) await ensureMissionBatchFromDecision(env, decision);
}
__name(startDecisionBatches, "startDecisionBatches");

// ── IDEAS → DECISIÓN (POST /ideas/decide) ────────────────────────────────────
// Al convertir una idea/objetivo en misión NO se crea ya un FLT a mano: se abre un
// reloj de decisión de 3 minutos con las 5 MEJORES opciones para EJECUTARLA. Si
// nadie elige en la ventana, la maquinaria de siempre tira con la recomendada (la
// 1ª, la más adecuada) y materializa su misión. El reloj corre bajo el agente de
// ideas (NeoMini · Mac Mini) y su proyecto de respaldo censado y asignado.
var DECIDE_AGENT = "NeoMini";
var DECIDE_MACHINE = "admira-macmini";
var DECIDE_FALLBACK_PROJECT = "yokup-ideas-objetivos";  // «Yokup · ideas-objetivos»
var DECIDE_URL = "https://www.yokup.com/decisiones";
// Genera con Workers AI las 5 mejores opciones CONCRETAS para ejecutar la idea,
// ordenadas de más a menos adecuada (la 1ª es la recomendada). Alimenta el prompt
// con el título, el detalle, el proyecto y la deliberación del Consejo. Devuelve un
// array de 5 strings, o null si la IA no dio 5 usables (con un reintento). Nunca
// inventa relleno: sin 5 opciones reales, el handler responde 502 y se reintenta.
async function generateDecideOptions(env, idea, projName) {
  const delib = ideaDeliberationText(idea.review);
  const prompt = `Eres el jefe de operaciones de AdmiraNeXT (ecosistema de se\xF1alizaci\xF3n digital DOOH hecho por agentes de IA: yokup.com, admira.live, pixeria, xpaceos, admira.tv). Hay que EJECUTAR esta idea/objetivo:

T\xCDTULO: ${idea.title}
DETALLE: ${idea.body || "(sin detalle)"}${projName ? "\nPROYECTO: " + projName : ""}${delib ? "\nDELIBERACI\xD3N DEL CONSEJO:\n" + delib : ""}

Propon las 5 MEJORES maneras CONCRETAS y accionables de EJECUTAR esta idea, ordenadas de M\xC1S a MENOS adecuada (la 1\xAA es la recomendada). Cada opci\xF3n: una acci\xF3n clara en 1 frase (m\xE1x 140 caracteres), distinta de las otras, sin numerar ni repetir el t\xEDtulo.
Responde SOLO con un objeto JSON v\xE1lido, sin texto alrededor ni markdown, con esta forma EXACTA:
{"opciones":["<la m\xE1s adecuada>","<2\xAA>","<3\xAA>","<4\xAA>","<5\xAA>"]}
Todo en espa\xF1ol.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await aiRunRaw(env, prompt, 700);
    const opts = parseDecideOptions(raw, 5);
    if (opts.length >= 5) return opts.slice(0, 5);
  }
  return null;
}
__name(generateDecideOptions, "generateDecideOptions");
// Abre un reloj de decisión INICIAL (5 misiones + «Volver atrás») reutilizando los
// MISMOS guardas del handler POST /decisions: identidad canónica (agent+machine),
// intersección de proyecto asignado en projects+project_members y el candado de UN
// reloj vivo por agente. No cubre continuaciones (eso vive en POST /decisions): sólo
// la tanda inicial, que es justo lo que /ideas/decide necesita. Devuelve {ok:true,
// id, deadline, project…} o {ok:false, status, error, code?} para que el handler
// traduzca a HTTP igual que el alta normal.
async function openInitialMissionDecision(env, input) {
  await ensureSchema(env);
  const rawOpts = Array.isArray(input.options) ? input.options : [];
  const opts = rawOpts.slice(0, 6).map((o) => String(o).slice(0, 160));
  const q = String(input.question || "").trim().slice(0, 400);
  if (!q || rawOpts.length !== opts.length || !isInitialMissionDecision(opts)) {
    return { ok: false, status: 400, error: "Se requieren exactamente 5 misiones y \xABVolver atr\xE1s\xBB como sexta opci\xF3n" };
  }
  const identity = resolveDecisionIdentity(input.agent, input.machine);
  if (!identity.ok) return { ok: false, status: 400, code: "exact_identity_required", error: identity.error };
  const requestedProjectId = String(input.project_id || "").trim().slice(0, 120);
  const assignment = await exactDecisionProjectAssignment(env, identity.agent, identity.machine, requestedProjectId);
  const projectContext = resolveDecisionProject({ ...input, agent: identity.agent, machine: identity.machine }, assignment, null);
  if (!projectContext.ok) return { ok: false, status: 400, code: "exact_project_required", error: projectContext.error };
  const mins = Math.min(60, Math.max(1, +input.minutes || 3));
  const now = Date.now();
  const agent = projectContext.agent, machine = projectContext.machine;
  const live = await env.DB.prepare(
    "SELECT id,deadline FROM decisions WHERE lower(agent)=lower(?) AND status='pending' AND deadline > ? ORDER BY created_at DESC LIMIT 1"
  ).bind(agent, now).first();
  if (live && input.user_override !== true) {
    return { ok: false, status: 409, error: "live_decision", existing: live.id, deadline: live.deadline,
             secondsLeft: Math.max(0, Math.round((live.deadline - now) / 1000)) };
  }
  const id = "DEC-" + now.toString(36) + Math.random().toString(36).slice(2, 6);
  await env.DB.prepare("INSERT INTO decisions (id,machine,agent,surface,question,options,recommended,status,created_at,deadline,url,mission,project,project_slug,parent_decision,batch_id) VALUES (?,?,?,?,?,?,?,'pending',?,?,?,?,?,?,?,?)")
    .bind(id, machine, agent, String(input.surface || "").slice(0, 20), q, JSON.stringify(opts),
          Math.max(0, Math.min(opts.length - 1, +input.recommended || 0)), now, now + mins * 60000,
          String(input.url || "").slice(0, 300), String(input.mission || "").slice(0, 120),
          projectContext.project_id, projectContext.project_slug, "", "").run();
  return { ok: true, id, deadline: now + mins * 60000, project: projectContext.project,
           project_id: projectContext.project_id, project_slug: projectContext.project_slug };
}
__name(openInitialMissionDecision, "openInitialMissionDecision");
// Sincroniza una idea con su reloj de decisión (si lo tiene). Cuando la decisión se
// resolvió (elegida o vencida→recomendada) y su tanda materializó la misión, la idea
// pasa a «mision» con el mission_id de la misión activa del batch. READ-MOSTLY: sólo
// escribe cuando hay una misión materializada; «Volver atrás» (o cancelada) no
// convierte. La materialización en sí la hace el ciclo de /decisions (cron o GET).
async function syncIdeaFromDecision(env, idea) {
  const out = { status: idea.status, mission_id: idea.mission_id || "" };
  if (!idea.decision_id || idea.status === "mision" || out.mission_id) return out;
  const d = await env.DB.prepare("SELECT id,status,chosen,recommended,options,batch_id FROM decisions WHERE id=?").bind(idea.decision_id).first();
  if (!d || d.status === "pending") return out;       // sin decisión, o ventana aún abierta
  let options = []; try { options = JSON.parse(d.options || "[]"); } catch (e) {}
  const effective = d.status === "decided" ? Number(d.chosen) : d.status === "expired" ? Number(d.recommended) : null;
  // «Volver atrás» (o cancelada) → la idea NO se convierte en misión.
  if (!Number.isInteger(effective) || effective === options.length - 1 || d.status === "cancelled") return out;
  const batchId = d.batch_id || batchIdForDecision(d.id);
  const batch = await env.DB.prepare("SELECT active_mission_id FROM mission_batches WHERE id=?").bind(batchId).first();
  let mid = batch && batch.active_mission_id ? batch.active_mission_id : "";
  if (!mid) {
    const it = await env.DB.prepare(
      "SELECT mission_id FROM mission_batch_items WHERE batch_id=? AND mission_id IS NOT NULL AND mission_id!='' ORDER BY position LIMIT 1"
    ).bind(batchId).first();
    mid = it && it.mission_id ? it.mission_id : "";
  }
  if (!mid) return out;                                 // la tanda aún no materializó ninguna misión
  await env.DB.prepare("UPDATE ideas SET status='mision', mission_id=?, updated_at=? WHERE id=? AND status!='mision'")
    .bind(mid, Date.now(), idea.id).run();
  out.status = "mision"; out.mission_id = mid;
  return out;
}
__name(syncIdeaFromDecision, "syncIdeaFromDecision");

// ---- MODELO MISIONES · TAREAS ----------------------------------------------
// Una MISIÓN es el ticket/incidencia. Sus TAREAS son los pasos para concluirla.
// JORNADA COMPLETA (Carlos, 2026-07-21): 8 pasos (a..h), cada uno con hasta 3
// subtareas (a1..a3 … h1..h3) → máx 24. Así una sola misión asignada a un
// ordenador da trabajo para todo el día al agente que la ejecuta. Los planes
// antiguos de 3 pasos (a/b/c) siguen siendo válidos: a-h los incluye.
var TASK_CODE = /^[a-h]([1-3])?$/;
var TASK_STATUS = ["pending", "in_progress", "done"];
function validTaskCode(c) {
  return typeof c === "string" && TASK_CODE.test(c);
}
__name(validTaskCode, "validTaskCode");
// Capa sugerida: los pasos (a/b/c) los ejecuta un subagente; las subtareas de
// verificación/reporte las cubre un infraagente.
function ownerFor(code, title) {
  if (/^[a-h]$/.test(code)) return "subagente";
  if (/verif|comprueb|report|valida|confirm|document|registr|informe|notific|cierr|cerra/i.test(title || "")) return "infraagente";
  return "subagente";
}
__name(ownerFor, "ownerFor");
function scopedMissionOwner(raw, fallbackRole, assignee, machine) {
  const value = String(raw || "").trim();
  const generic = /^infra(?:agente)?$/i.test(value) ? "infra"
    : /^sub(?:agente)?$/i.test(value) ? "sub" : "";
  const missionBase = baseAgentIdentity(assignee);
  if (!missionBase) return value;
  const parsed = parseAgentIdentity(value);
  if (generic || !value || sameAgentFamily(value, assignee)) {
    return scopedAgentIdentity(missionBase, machine, generic || parsed.role || fallbackRole || "sub");
  }
  return value;
}
__name(scopedMissionOwner, "scopedMissionOwner");
async function listMissionTasks(env, mid) {
  const { results } = await env.DB.prepare(
    "SELECT mission_id, code, title, status, owner, report, image, updated_at FROM mission_tasks WHERE mission_id=? ORDER BY code"
  ).bind(mid).all();
  return results || [];
}
__name(listMissionTasks, "listMissionTasks");
// TODAS las tareas de TODAS las misiones en UNA query (JOIN con tickets), para
// que /tareas e /informes no hagan N+1 (un /mission/<id>/tasks por misión, cada
// 15 s). Cada fila trae adjuntos los datos de su misión (subject/screen/loc/…)
// para agrupar/filtrar en cliente sin más peticiones. `scope` filtra igual que
// listTickets/stats. Sin LIMIT: recoge todas (evita el corte de 100 de /tickets).
async function listAllMissionTasks(env, scope) {
  const where = scope === "fleet" ? "WHERE t.source='fleet'"
    : scope === "todas" ? ""
    : "WHERE t.source IS NULL OR t.source!='fleet'";
  const { results } = await env.DB.prepare(
    // ADITIVO (Carlos, 2026-07-23 · /informes): además de la hora de inicio de la
    // misión (t.created_at → mission_created) traemos la de FIN (t.resolved_at →
    // mission_resolved) y la PRUEBA de cierre de la misión (t.proof_image →
    // mission_proof) para que la columna Captura tenga un fallback real cuando la
    // tarea no dejó imagen propia. No rompe a /tareas: sólo añade campos.
    `SELECT m.mission_id, m.code, m.title, m.status, m.owner, m.report, m.image, m.updated_at,
            t.subject, t.screen, t.loc, t.project, t.source, t.assignee, t.live_shot,
            t.status AS mission_status, t.created_at AS mission_created,
            t.resolved_at AS mission_resolved, t.proof_image AS mission_proof
       FROM mission_tasks m JOIN tickets t ON t.id = m.mission_id
       ${where}
       ORDER BY m.mission_id, m.code`
  ).all();
  return results || [];
}
__name(listAllMissionTasks, "listAllMissionTasks");
// Guarda el plan completo (reemplaza el anterior). Valida codes y tope de 3
// subtareas por paso sobre 8 pasos (a..h) → máx 24 subtareas: la jornada
// completa de un agente (Carlos, 2026-07-21). Devuelve el plan resultante.
async function saveMissionPlan(env, mid, tasks) {
  const clean = [];
  const seen = /* @__PURE__ */ new Set();
  const subCount = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0, h: 0 };
  const now = Date.now();
  const mission = await env.DB.prepare("SELECT assignee,loc FROM tickets WHERE id=?").bind(mid).first();
  for (const t of tasks || []) {
    const code = String((t && t.code) || "").trim().toLowerCase();
    if (!validTaskCode(code) || seen.has(code)) continue;
    if (code.length === 2) {
      const step = code[0];
      if (subCount[step] >= 3) continue;
      subCount[step]++;
    }
    seen.add(code);
    const title = String((t && t.title) || "").slice(0, 120);
    const status = TASK_STATUS.includes(t && t.status) ? t.status : "pending";
    const suggested = t && t.owner ? String(t.owner).slice(0, 40) : ownerFor(code, title);
    const owner = mission
      ? scopedMissionOwner(suggested, /^infra/i.test(suggested) ? "infra" : "sub", mission.assignee, mission.loc)
      : suggested;
    const report = t && t.report != null ? String(t.report).slice(0, 2e3) : null;
    clean.push({ mission_id: mid, code, title, status, owner, report, updated_at: now });
  }
  await env.DB.prepare("DELETE FROM mission_tasks WHERE mission_id=?").bind(mid).run();
  for (const r of clean) {
    await env.DB.prepare(
      "INSERT INTO mission_tasks(mission_id,code,title,status,owner,report,updated_at) VALUES(?,?,?,?,?,?,?)"
    ).bind(r.mission_id, r.code, r.title, r.status, r.owner, r.report, r.updated_at).run();
  }
  return listMissionTasks(env, mid);
}
__name(saveMissionPlan, "saveMissionPlan");
async function setTaskStatus(env, mid, code, status, report, owner, image) {
  const cur = await env.DB.prepare("SELECT * FROM mission_tasks WHERE mission_id=? AND code=?").bind(mid, code).first();
  if (!cur) return null;
  const st = TASK_STATUS.includes(status) ? status : cur.status;
  const rp = report != null ? String(report).slice(0, 2e3) : cur.report;
  let ow = owner != null ? String(owner).slice(0, 40) : cur.owner;
  if (owner != null) {
    const mission = await env.DB.prepare("SELECT assignee,loc FROM tickets WHERE id=?").bind(mid).first();
    if (mission) ow = scopedMissionOwner(ow, parseAgentIdentity(ow).role, mission.assignee, mission.loc);
  }
  // Captura PROPIA del paso: cada paso deja constancia con su enlace/miniatura. (954)
  const im = image != null && normalizeProofImage(image).value ? normalizeProofImage(image).value : cur.image;
  await env.DB.prepare("UPDATE mission_tasks SET status=?, report=?, owner=?, image=?, updated_at=? WHERE mission_id=? AND code=?").bind(st, rp, ow, im, Date.now(), mid, code).run();
  return env.DB.prepare("SELECT * FROM mission_tasks WHERE mission_id=? AND code=?").bind(mid, code).first();
}
__name(setTaskStatus, "setTaskStatus");
function parsePlanJson(raw) {
  if (!raw) return null;
  const s = String(raw);
  const i = s.indexOf("[");
  const j = s.lastIndexOf("]");
  if (i >= 0 && j > i) {
    try {
      const arr = JSON.parse(s.slice(i, j + 1));
      if (Array.isArray(arr) && arr.length) return arr;
    } catch (e) {
    }
  }
  // Tolerante: los LLM a veces emiten JSON con un fallo al final. Recupera los
  // objetos {...} de nivel superior bien formados por balance de llaves.
  const objs = [];
  let depth = 0, from = -1;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === "{") {
      if (depth === 0) from = k;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && from >= 0) {
        try {
          objs.push(JSON.parse(s.slice(from, k + 1)));
        } catch (e) {
        }
        from = -1;
      }
    }
  }
  return objs.length ? objs : null;
}
__name(parsePlanJson, "parsePlanJson");
// Aplana pasos (del LLM o del plan por defecto) a filas de tareas. Mapea los 3
// primeros pasos a los códigos a/b/c POR POSICIÓN (el "code" del LLM no es fiable)
// y sus subtareas a a1..a3/b1..b3/c1..c3. Titles recortados a 60 caracteres.
// Pasos/subtareas de pura CEREMONIA (no son trabajo, son proceso): «Recibir
// encargo», «Leer instrucciones», «Verificar prioridad», «Asignar subagente»…
// Se filtran para que el plan se ajuste al encargo y no infle 24 pasos de nada.
// (Carlos, 21/22-jul-2026)
var CEREMONY_RE = /recibir\s+(el\s+)?encargo|leer\s+(las\s+|el\s+)?instrucci|verificar\s+(la\s+)?prioridad|asignar\s+(el\s+)?subagente|acceder\s+al?\s+(sistema|encargo|panel)|reclamar\s+(el\s+)?encargo|ponerse\s+con\s+la\s+misi/i;
function stepTitle(step) {
  return String((step && (step.title || step.titulo || step.step || step.name || step.paso || step.descripcion || step.description)) || "");
}
function flattenSteps(steps) {
  const letters = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const tasks = [];
  const clean = (steps || []).filter((s) => { const t = stepTitle(s); return t && !CEREMONY_RE.test(t); });
  clean.slice(0, 3).forEach((step, si) => {   // REGLA DE LOS TERCIOS: 3 pasos a/b/c (963)
    const code = letters[si];
    const title = String((step && (step.title || step.titulo || step.step || step.name || step.paso || step.descripcion || step.description)) || "").slice(0, 60) || "Paso " + code.toUpperCase();
    tasks.push({ code, title });
    const subsRaw = step && (step.subtasks || step.subtareas || step.tasks || step.tareas || step.pasos || step.items || step.steps);
    const subs = (Array.isArray(subsRaw) ? subsRaw : [])
      .map((s) => typeof s === "string" ? s : (s && (s.title || s.text || s.name)) || "")
      .filter((st) => st && !CEREMONY_RE.test(st));   // fuera la ceremonia también en subtareas
    subs.slice(0, 3).forEach((st, i) => {
      tasks.push({ code: code + (i + 1), title: String(st).slice(0, 60) });
    });
  });
  return tasks;
}
__name(flattenSteps, "flattenSteps");
function defaultPlan() {
  return [
    { code: "a", title: "Diagn\xF3stico remoto de la incidencia", subtasks: ["Revisar proof-of-play y logs del player", "Verificar conectividad de red", "Confirmar alcance del fallo"] },
    { code: "b", title: "Intervenci\xF3n correctiva", subtasks: ["Reiniciar player y servicios de emisi\xF3n", "Restablecer la reproducci\xF3n de contenido"] },
    { code: "c", title: "Verificaci\xF3n y cierre", subtasks: ["Confirmar emisi\xF3n estable (proof-of-play)", "Reportar la resoluci\xF3n y cerrar el ticket"] }
  ];
}
__name(defaultPlan, "defaultPlan");
// Plan de respaldo para una misión de FLOTA (encargo a un agente), cuando la IA
// no devuelve un JSON usable.
function defaultFleetPlan() {
  return [
    { code: "a", title: "Preparar: alcance y punto de partida", subtasks: ["Localizar el proyecto y los ficheros implicados", "Reproducir el estado actual", "Definir el resultado esperado"] },
    { code: "b", title: "Ejecutar el encargo", subtasks: ["Hacer el cambio en la m\xE1quina que corresponde", "Desplegar a la URL p\xFAblica", "Ajustar hasta que quede como se pide"] },
    { code: "c", title: "Verificar y reportar", subtasks: ["Verificar en real, con captura por el camino del usuario", "Reportar a Carlos y al grupo", "Marcar el encargo hecho"] }
  ];
}
__name(defaultFleetPlan, "defaultFleetPlan");

// Propone el plan 3×(≤3) con Workers AI a partir del ticket (misión) y lo guarda.
// OJO: hay DOS mundos y no se planifican igual. Una misión de CAMPO es una avería
// de una pantalla DOOH; una de FLOTA es un encargo de Carlos a un agente de
// software. Con el prompt de campo, la IA planificaba los encargos como si fueran
// pantallas rotas («verificar si la pantalla Morfeo está encendida»).
async function proposePlan(env, mid) {
  const t = await env.DB.prepare("SELECT * FROM tickets WHERE id=?").bind(mid).first();
  const subject = t ? t.subject : "Incidencia";
  const screen = t ? t.screen || "" : "";
  const loc = t ? t.loc || "" : "";
  const triage = t ? t.ai_triage || "" : "";
  const isFleet = !!t && t.source === "fleet";
  let prompt;
  if (isFleet) {
    // El texto íntegro del encargo es el primer evento de la misión (fleetSync).
    const ev = await env.DB.prepare("SELECT text FROM events WHERE ticket_id=? ORDER BY id ASC LIMIT 1").bind(mid).first();
    const full = (ev && ev.text) || subject;
    prompt = `Eres el agente principal de AdmiraNeXT, un equipo de agentes de IA que desarrolla software (webs, workers de Cloudflare, players de se\xF1alizaci\xF3n). Carlos, el arquitecto, ha hecho este ENCARGO al agente "${t.assignee || "un agente"}"${loc ? ' que corre en el ordenador "' + loc + '"' : ""}.

ENCARGO:
${String(full).slice(0, 900)}

Descomp\xF3n el encargo en un PLAN AJUSTADO A SU TAMA\xD1O: usa SOLO los pasos que el encargo REALMENTE necesite (EXACTAMENTE 3 pasos a/b/c, cada uno con EXACTAMENTE 3 subtareas (REGLA DE LOS TERCIOS de la casa: la misi\xF3n es SIEMPRE 3 tareas x 3 subtareas, para todos los agentes por igual; lo que no quepa va al TEXTO del paso o baja a microtarea, NO se ensancha el plan)), con c\xF3digos correlativos desde "a" (a, b, c…), cada uno con EXACTAMENTE 3 subtareas. Una tarea peque\xF1a (p.ej. dibujar algo, un cambio de una l\xEDnea) son 1-3 pasos, NO ocho: no rellenes con ceremonia (recibir encargo, leer instrucciones, verificar prioridad, asignar subagente). El array tendr\xE1 TANTOS objetos como pasos reales, no ocho por defecto. Doctrina del equipo: los pasos los ejecuta un subagente y la verificaci\xF3n/reporte la cubre un infraagente; nada se da por hecho sin verificarlo en real y publicarlo a su URL p\xFAblica. Pasos concretos y accionables SOBRE ESTE ENCARGO (no inventes averías de hardware ni pantallas: esto es trabajo de software), en espa\xF1ol, cada title de m\xE1ximo 60 caracteres.

Responde SOLO con un array JSON v\xE1lido, sin texto adicional, con esta forma exacta:
[{"code":"a","title":"<paso a: concreto, dice el trabajo real>","subtasks":["<sub a1>","<sub a2>","<sub a3>"]},{"code":"b","title":"<paso b: concreto>","subtasks":["<sub b1>","<sub b2>","<sub b3>"]},{"code":"c","title":"<paso c: verificar y reportar>","subtasks":["<sub c1>","<sub c2>","<sub c3>"]}]
(EXACTAMENTE 3 objetos a/b/c, cada uno con EXACTAMENTE 3 subtareas: 3x3. Nunca 8.)`;
  } else {
    prompt = `Eres el agente principal del helpdesk Yokup (mantenimiento de pantallas DOOH de admira.tv). Descomp\xF3n la RESOLUCI\xD3N de esta incidencia en un PLAN AJUSTADO A SU TAMA\xD1O: SOLO los pasos que de verdad haga falta (EXACTAMENTE 3 pasos a/b/c, cada uno con EXACTAMENTE 3 subtareas (REGLA DE LOS TERCIOS de la casa: la misi\xF3n es SIEMPRE 3 tareas x 3 subtareas, para todos los agentes por igual; lo que no quepa va al TEXTO del paso o baja a microtarea, NO se ensancha el plan)), con c\xF3digos correlativos desde "a" (a, b, c…). Una incidencia sencilla son 1-3 pasos, NO ocho: no rellenes con ceremonia. Cada paso lleva EXACTAMENTE 3 subtareas concretas (verificaci\xF3n o ejecuci\xF3n). El array tendr\xE1 TANTOS objetos como pasos reales. Pasos concretos y accionables para resolver la aver\xEDa, en espa\xF1ol, cada title de m\xE1ximo 60 caracteres.

INCIDENCIA: ${subject}${screen ? " — pantalla " + screen : ""}${loc ? " (" + loc + ")" : ""}.
${triage ? "TRIAJE IA:\n" + triage : ""}

Responde SOLO con un array JSON v\xE1lido, sin texto adicional, con esta forma exacta:
[{"code":"a","title":"<paso a: concreto, dice el trabajo real>","subtasks":["<sub a1>","<sub a2>","<sub a3>"]},{"code":"b","title":"<paso b: concreto>","subtasks":["<sub b1>","<sub b2>","<sub b3>"]},{"code":"c","title":"<paso c: verificar y reportar>","subtasks":["<sub c1>","<sub c2>","<sub c3>"]}]
(EXACTAMENTE 3 objetos a/b/c, cada uno con EXACTAMENTE 3 subtareas: 3x3. Nunca 8.)`;
  }
  // 8 pasos × 3 subtareas no caben en 500 tokens: el JSON se cortaba y el
  // parser sólo rescataba los 3 primeros pasos (Carlos, 2026-07-21).
  const raw = await aiRun(env, prompt, 1800);
  let tasks = flattenSteps(parsePlanJson(raw));
  if (!tasks.length) tasks = flattenSteps(isFleet ? defaultFleetPlan() : defaultPlan());
  return saveMissionPlan(env, mid, tasks);
}
__name(proposePlan, "proposePlan");
async function missionRoute(req, env, url) {
  await ensureSchema(env);
  const seg = url.pathname.split("/").filter(Boolean);
  const mid = decodeURIComponent(seg[1] || "");
  const sub = seg[2] || "";
  if (!mid) return json({ error: "mission id requerido" }, 400);
  if (sub === "tasks" && req.method === "GET") {
    return json({ tasks: await listMissionTasks(env, mid) });
  }
  if (sub === "tasks" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const arr = Array.isArray(b) ? b : b && b.tasks || [];
    return json({ tasks: await saveMissionPlan(env, mid, arr) });
  }
  if (sub === "task" && seg[3] && seg[4] === "status" && req.method === "POST") {
    const code = decodeURIComponent(seg[3]).toLowerCase();
    if (!validTaskCode(code)) return json({ error: "code inv\xE1lido" }, 400);
    const b = await req.json().catch(() => ({}));
    const row = await setTaskStatus(env, mid, code, b.status, b.report, b.owner);
    if (!row) return json({ error: "not-found" }, 404);
    // El árbol manda: si con esta tarea la misión arranca o queda concluida, el
    // encargo del bot-inbox se entera (solo en las transiciones reales).
    const fleet = await fleetReconcileMission(env, mid);
    return json({ ok: true, task: row, fleet });
  }
  if (sub === "plan" && req.method === "POST") {
    return json({ tasks: await proposePlan(env, mid) });
  }
  return json({ error: "not-found" }, 404);
}
__name(missionRoute, "missionRoute");
async function addEvent(env, ticketId, kind, author, text) {
  await env.DB.prepare("INSERT INTO events(ticket_id,ts,kind,author,text) VALUES(?,?,?,?,?)").bind(ticketId, Date.now(), kind, author, text).run();
}
__name(addEvent, "addEvent");
// La cronología es texto legible, no un almacén de imágenes: una captura pegada
// (data:image/…;base64) puede pesar ~195 KB y addEvent NO recorta, así que se
// duplicaría entera en events.text además de en proof_image/mission_tasks.image
// (FLT-988 fleco). En el evento va una ETIQUETA corta; la imagen sigue completa
// donde toca. Una URL http(s) sí se muestra entera: es corta y útil de pinchar.
function proofLabel(img) {
  const s = String(img == null ? "" : img);
  const m = /^data:image\/([a-z0-9+.-]+);base64,/i.exec(s);
  if (m) return "captura " + m[1] + " embebida (" + Math.round(s.length / 1024) + " KB)";
  return s;
}
__name(proofLabel, "proofLabel");
async function lastEventKind(env, ticketId) {
  const r = await env.DB.prepare("SELECT kind FROM events WHERE ticket_id=? ORDER BY id DESC LIMIT 1").bind(ticketId).first();
  return r ? r.kind : null;
}
__name(lastEventKind, "lastEventKind");
async function createTicket(env, s) {
  const existing = await env.DB.prepare("SELECT id FROM tickets WHERE screen=? AND status!='resolved'").bind(s.screen).first();
  if (existing) return existing.id;
  const now = Date.now();
  const id = ("INC-" + now.toString(36).slice(-5) + Math.floor(Math.random() * 36).toString(36)).toUpperCase();
  const tech = ROSTER[hash(s.screen) % ROSTER.length];
  const loc = s.loc || "";
  const triage = await aiRun(env, `Eres el copiloto de soporte de Yokup (mantenimiento de pantallas DOOH). Incidencia: la pantalla "${s.screen}"${loc ? " en " + loc : ""} lleva ${s.age || 300} segundos sin se\xF1al de emisi\xF3n (proof-of-play ca\xEDdo). Responde SOLO en espa\xF1ol, \xFAtil y concreto (m\xE1x 55 palabras), EXACTAMENTE en 3 l\xEDneas:
\u{1F50D} Causa probable: ...
\u{1F6E0}\uFE0F Acci\xF3n inmediata: ...
\u{1F477} T\xE9cnico: s\xED/no \u2014 motivo`, 170);
  await env.DB.prepare("INSERT OR IGNORE INTO tickets(id,screen,subject,loc,role,status,priority,assignee,source,ai_triage,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, s.screen, "Pantalla sin se\xF1al de emisi\xF3n", loc, s.role || "", "open", "urgente", tech.name, s.source || "agent-iot", triage, now, now).run();
  await addEvent(env, id, "log", "Agente IoT", "Incidencia detectada autom\xE1ticamente: pantalla sin se\xF1al de emisi\xF3n (proof-of-play ca\xEDdo).");
  await addEvent(env, id, "assign", "IA", `Auto-asignado a ${tech.name} (${tech.zone} \xB7 ${tech.skills}) por skills y zona.`);
  if (triage) await addEvent(env, id, "ai", "Copiloto IA", triage);
  await notifySubs(env);
  return id;
}
__name(createTicket, "createTicket");
// Incidencia GENÉRICA (Carlos, 2026-07-17: «todas las incidencias pasan por yokup»).
// Reutiliza la tabla tickets; source distingue el origen (monitor/presence/agent/
// external) y kind el tipo. 1 incidencia ABIERTA por recurso (índice idx_open_screen);
// el `resource` va prefijado por tipo (svc:/maq:/agt:) para no chocar con pantallas DOOH.
async function createIncident(env, inc) {
  await ensureSchema(env);
  const resource = String((inc && (inc.resource || inc.screen)) || "").slice(0, 160);
  if (!resource) return null;
  const existing = await env.DB.prepare("SELECT id FROM tickets WHERE screen=? AND status!='resolved'").bind(resource).first();
  if (existing) return existing.id;   // ya hay una abierta para este recurso
  const now = Date.now();
  const kind = String((inc && inc.kind) || "external").toLowerCase();
  const pref = { service: "SVC", svc: "SVC", machine: "MAQ", maquina: "MAQ", agent: "AGT", agente: "AGT" }[kind] || "INC";
  const id = (pref + "-" + now.toString(36).slice(-5) + Math.floor(Math.random() * 36).toString(36)).toUpperCase();
  const subject = String((inc && inc.subject) || "Incidencia").slice(0, 200);
  const project = String((inc && (inc.project || inc.loc)) || "").slice(0, 80);
  const prio = ["urgente", "alta", "normal", "baja"].includes(inc && inc.severity) ? inc.severity : "alta";
  const source = String((inc && inc.source) || "external").slice(0, 24);
  const assignee = (String((inc && inc.assignee) || "").slice(0, 60)) || (ROSTER[hash(resource) % ROSTER.length].name);
  await env.DB.prepare("INSERT OR IGNORE INTO tickets(id,screen,subject,loc,role,status,priority,assignee,source,ai_triage,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, resource, subject, project, kind, "open", prio, assignee, source, "", now, now).run();
  await addEvent(env, id, "log", (inc && inc.by) || "Monitor", (inc && inc.detail) || subject);
  await notifySubs(env);
  return id;
}
__name(createIncident, "createIncident");
// Marca la incidencia ABIERTA de un recurso como recuperada (misma semántica que el
// reconcile DOOH: evento 'recover', pendiente de verificación y cierre).
async function resolveIncident(env, resource, by, note) {
  await ensureSchema(env);
  const open = await env.DB.prepare("SELECT id FROM tickets WHERE screen=? AND status!='resolved'").bind(String(resource || "")).first();
  if (!open) return null;
  if (await lastEventKind(env, open.id) !== "recover") {
    await env.DB.prepare("UPDATE tickets SET updated_at=? WHERE id=?").bind(Date.now(), open.id).run();
    await addEvent(env, open.id, "recover", by || "Monitor", note || "Recurso recuperado. Pendiente de verificaci\xF3n y cierre.");
  }
  return open.id;
}
__name(resolveIncident, "resolveIncident");
// Monitor de SERVICIOS/webs de la flota (Carlos, 2026-07-17): el cron comprueba
// cada web; 5xx o sin respuesta = incidencia; al recuperar, la cierra.
var FLEET_WEBS = [
  "https://www.pixeria.com", "https://www.xpaceos.com", "https://www.clearchannel.tv",
  "https://www.admira.live", "https://www.admira.tv", "https://admiranext.com",
  "https://www.yokup.com", "https://ainimation.studio", "https://api.admira.store/signage/screens"
];
async function checkWebs(env) {
  for (const web of FLEET_WEBS) {
    let down = false, code = 0;
    try {
      const r = await fetch(web, { method: "GET", redirect: "manual", cf: { cacheTtl: 0 }, signal: AbortSignal.timeout(12e3) });
      code = r.status;
      down = code >= 500 || code === 0;   // 5xx o inalcanzable = caída (3xx/4xx = vivo)
    } catch (e) { down = true; }
    const resource = "svc:" + web;
    const dom = web.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");
    if (down) {
      await createIncident(env, {
        resource, kind: "service", source: "monitor", severity: "urgente", project: dom,
        subject: "Servicio caído: " + dom + (code ? " (HTTP " + code + ")" : " (sin respuesta)"),
        detail: "El monitor detectó que " + web + " no responde" + (code ? " (HTTP " + code + ")" : "") + ".",
        by: "Monitor de servicios"
      });
    } else {
      await resolveIncident(env, resource, "Monitor de servicios", dom + " responde de nuevo (HTTP " + code + ").");
    }
  }
}
__name(checkWebs, "checkWebs");

// Máquinas de la flota que DEBEN estar 24/7. Sólo se vigilan las que laten
// presencia de forma fiable (canónico: minúsculas sin símbolos). Los players
// Linux (dgx-spark, lenovo-thinkstation) NO laten presencia estable y viven tras
// Tailscale (inalcanzables desde el Worker) → NO se incluyen aquí para no generar
// falsos positivos permanentes; se añadirán cuando tengan heartbeat propio.
// Ampliar la lista es la única palanca para vigilar más equipos. Carlos 2026-07-17.
var CRITICAL_MACHINES = [
  { canon: "macmini", name: "Mac Mini" }
];
// Umbral de caída: si el latido más fresco de la máquina supera estos minutos, se
// considera offline. La presencia late ~cada 3 min; 20 min = varios latidos perdidos.
var MACHINE_OFFLINE_MIN = 20;
var PRESENCE_URL = "https://admira-telegram.csilvasantin.workers.dev/api/presence";

function canonMachine(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
__name(canonMachine, "canonMachine");

async function checkMachines(env) {
  if (!env.TELEGRAM) return;
  let rows = [];
  try {
    const r = await env.TELEGRAM.fetch(new Request(PRESENCE_URL, { headers: { accept: "application/json" } }));
    const d = await r.json();
    rows = Array.isArray(d) ? d : (d.rows || d.presence || []);
  } catch (e) { return; }   // sin presencia no inventamos incidencias
  // Latido más fresco por máquina (canónico).
  const fresh = {};
  for (const row of rows) {
    const c = canonMachine(row && row.machine);
    if (!c) continue;
    let u = (row && (row.updated || row.updated_at || row.ts)) || 0;
    if (u && u < 4102444800) u *= 1000;   // s → ms
    if (!fresh[c] || u > fresh[c]) fresh[c] = u;
  }
  const now = Date.now();
  for (const m of CRITICAL_MACHINES) {
    const last = fresh[m.canon] || 0;
    const ageMin = last ? (now - last) / 60000 : Infinity;
    const resource = "maq:" + m.canon;
    if (ageMin > MACHINE_OFFLINE_MIN) {
      const hace = last ? "hace " + Math.round(ageMin) + " min" : "sin latido registrado";
      await createIncident(env, {
        resource, kind: "machine", source: "monitor", severity: "urgente", project: m.name,
        subject: "Máquina offline: " + m.name + " (" + hace + ")",
        detail: m.name + " es un equipo 24/7 y ha dejado de latir presencia (" + hace + "). Revisa que esté encendido, con red y con sus agentes arrancados.",
        by: "Monitor de flota"
      });
    } else {
      await resolveIncident(env, resource, "Monitor de flota", m.name + " vuelve a latir (hace " + Math.round(ageMin) + " min).");
    }
  }
}
__name(checkMachines, "checkMachines");

async function reconcile(env) {
  let screens = [];
  try {
    const r = await fetch("https://api.admira.store/signage/screens", { cf: { cacheTtl: 5 } });
    const d = await r.json();
    screens = d.screens || [];
  } catch (e) {
  }
  const now = Date.now();
  for (const s of screens) {
    const open = await env.DB.prepare("SELECT id FROM tickets WHERE screen=? AND status!='resolved'").bind(s.screen).first();
    if (!s.online) {
      if (!open) await createTicket(env, { screen: s.screen, loc: s.locName || s.loc || "", role: s.role, age: s.age_seconds });
    } else if (open) {
      if (await lastEventKind(env, open.id) !== "recover") {
        await env.DB.prepare("UPDATE tickets SET updated_at=? WHERE id=?").bind(now, open.id).run();
        await addEvent(env, open.id, "recover", "Agente IoT", "La pantalla ha recuperado la se\xF1al de emisi\xF3n. Pendiente de verificaci\xF3n y cierre.");
      }
    }
  }
  return screens;
}
__name(reconcile, "reconcile");
// scope: 'campo' (incidencias DOOH, por defecto) | 'fleet' (misiones de los agentes)
// | 'todas'. Sin esta separación las misiones de flota inundaban la bandeja de
// incidencias de Clear Channel, que comparte tabla.
// PAGINACIÓN (Carlos, 2026-07-17): las misiones de flota RESUELTAS se acumulan (con el
// arreglo de misiones rápidas nacen aún más) y el viejo LIMIT 100 fijo cortaba las más
// antiguas en «Todas»/«Finalizadas». Ahora el defecto sube a 300 (las activas siempre
// caben, van ordenadas primero) y se acepta ?limit (cap 1000) y ?offset para paginar.
function pageLimit(v) { const n = parseInt(v, 10); return n > 0 ? Math.min(1000, n) : 300; }
function pageOffset(v) { const n = parseInt(v, 10); return n > 0 ? n : 0; }
async function listTickets(env, scope, limit, offset) {
  const where = scope === "fleet" ? "WHERE source='fleet'" : scope === "todas" ? "" : "WHERE source IS NULL OR source!='fleet'";
  const { results } = await env.DB.prepare(
    `SELECT * FROM tickets ${where} ORDER BY (status='open') DESC, (status='in_progress') DESC, created_at DESC LIMIT ? OFFSET ?`
  ).bind(pageLimit(limit), pageOffset(offset)).all();
  const rows = results || [];
  await attachImgCount(env, rows);
  // Nombre humano del proyecto junto al id, para que la lista no tenga que
  // cruzar /projects sólo para pintar un rótulo.
  const pidx = await projectIndex(env);
  for (const r of rows) r.project_name = resolveProject(pidx, r.project || "").name;
  return rows;
}

// Nº de IMÁGENES adjuntas de cada misión, para que la tarjeta de la bandeja
// avise (📎 3) sin abrir el ticket. Las fotos viajan como URLs /media/ dentro
// del TEXTO de los eventos, así que se cuentan ahí — con UNA sola consulta
// agregada sobre los ids de la página (nada de N+1).
// Los eventos kind='proof' quedan FUERA: el pantallazo de cierre ya tiene su
// propia miniatura en la tarjeta, y contarlo sacaba un 📎 en toda misión
// terminada — señal duplicada, no información nueva.
// D1 admite como MUCHO 100 parámetros por consulta. Cualquier `IN (?,?,…)`
// construido sobre una lista de ids revienta el worker (error 1101) en cuanto
// la lista crece — y crece sola, con cada misión nueva. Pasó de verdad: al
// llegar a 101 misiones de flota, /fleet/missions empezó a dar 500 y tumbó el
// visor de admira.live/status. Este helper trocea en lotes y junta.
const D1_MAX_VARS = 90;   // margen sobre el límite real de 100
async function selectIn(env, ids, sqlFor) {
  const out = [];
  for (let i = 0; i < ids.length; i += D1_MAX_VARS) {
    const lote = ids.slice(i, i + D1_MAX_VARS);
    const ph = lote.map(() => "?").join(",");
    const { results } = await env.DB.prepare(sqlFor(ph)).bind(...lote).all();
    for (const r of results || []) out.push(r);
  }
  return out;
}
__name(selectIn, "selectIn");

async function attachImgCount(env, rows) {
  if (!rows.length) return;
  try {
    const ids = rows.map((r) => r.id);
    const results = await selectIn(env, ids, (ph) =>
      `SELECT ticket_id, GROUP_CONCAT(text, ' ') t FROM events WHERE ticket_id IN (${ph}) AND text LIKE '%/media/%' AND (kind IS NULL OR kind != 'proof') GROUP BY ticket_id`
    );
    const map = {};
    for (const r of results || []) map[r.ticket_id] = ((r.t || "").match(/\/media\//g) || []).length;
    for (const r of rows) r.img_count = map[r.id] || 0;
  } catch (e) {
    // contador cosmético: si falla, la bandeja sigue funcionando sin el 📎
  }
}
__name(attachImgCount, "attachImgCount");
__name(listTickets, "listTickets");

// ---- MISIONES DE FLOTA (agentes AdmiraNeXT) --------------------------------
// Doctrina (Carlos, 14-07-2026): yokup.com es el GESTOR ÚNICO del trabajo. Los
// encargos del bot-inbox de la flota (worker admira-telegram) se ingieren aquí
// como MISIONES source='fleet' con su mismo árbol de tareas abc/123, y
// admira.live/status deja de inventarse la misión: pasa a ser el VISOR que las
// lee de /fleet/missions.
// Se pide por el service binding TELEGRAM (ver wrangler.toml): un fetch normal a
// este host hace loopback contra el propio yokup-rtc (mismo subdominio
// workers.dev) y devuelve su 404. El host se conserva porque admira-telegram
// enruta por hostname: con "https://admira-telegram/" a secas también da 404.
var FLEET_API = "https://admira-fleet.csilvasantin.workers.dev";
var FLEET_INBOX = "https://admira-telegram.csilvasantin.workers.dev/api/public/inbox?limit=200";
// Estado del encargo → estado de la misión. 'ack' es acuse de recibo, no avance.
var FLEET_ST = { pending: "open", ack: "open", in_progress: "in_progress", done: "resolved", cancelled: "cancelled" };
// La captura pasa a ser contrato de cierre desde este despliegue. Las misiones
// históricas terminadas antes no se reabren: no existe forma honesta de fabricar
// hoy un pantallazo retroactivo de aquel trabajo.
var PROOF_REQUIRED_AFTER = 1784313450000; // 2026-07-17T18:37:30Z

function fleetSubject(text) {
  const line = String(text || "").split("\n")[0].trim();
  if (!line) return "Encargo de la flota";
  return line.length > 120 ? line.slice(0, 117) + "…" : line;
}
__name(fleetSubject, "fleetSubject");
// Prioridad derivada del marcador [PRIORIDAD X] del texto del encargo (el mismo
// que la tarjeta saca del título y pinta como etiqueta). Sincroniza la etiqueta
// con el campo real (el punto de color). Carlos, 2026-07-18.
function fleetPriority(text) {
  const m = /\[\s*prioridad\s+(absoluta|urgente|alta|normal|media|baja)\s*\]/i.exec(String(text || ""));
  if (!m) return "normal";
  const p = m[1].toLowerCase();
  return p === "absoluta" ? "urgente" : p === "media" ? "normal" : p;
}
__name(fleetPriority, "fleetPriority");
// OJO: `screen` tiene un índice ÚNICO entre las no resueltas (idx_open_screen),
// así que NO puede ser la máquina a secas — dos encargos abiertos del mismo
// ordenador chocarían al insertar. Se firma con el id del encargo: único y
// legible en la bandeja. La máquina va en `loc` y la persona en `assignee`.
function fleetScreen(it) {
  return `${it.target_persona || "?"}\xB7${it.target_machine || "?"} #${it.id}`;
}
__name(fleetScreen, "fleetScreen");

// ¿Es un encargo DE VERDAD o charla de Telegram que se coló en el inbox?
// Una MISIÓN exige destinatario; y aun con destinatario se descarta el ruido
// típico del grupo: saludos de identidad («Soy X y estoy corriendo en…»),
// acuses/relés («ACK…», «Relé en verde…», «Busco contexto…») y despliegues
// anunciados por bot-say («DEPLOY …»). Pedido por Carlos (2026-07-15): los
// mensajes de Telegram que no son misiones NO se elevan a misión ni a tarea.
function fleetEsMision(it) {
  // Destinatario = persona O máquina («solo máquina: quien esté allí» del alta
  // de yokup.com/misiones). Sin ninguno de los dos, es charla.
  if (!it.target_persona && !it.target_machine) return false;
  const t = String(it.text || "").trim();
  if (!t) return false;
  if (/^soy\s+.{2,60}?(corriendo en|en el ordenador)/i.test(t)) return false;
  if (/^(ack\b|✓|✅|rel[eé] en verde|busco contexto|deploy\b|desplegado\b|recibido\b)/i.test(t)) return false;
  // Auto-anuncios de PRESENCIA de un agente (no son encargos): un bot que avisa de
  // que está disponible («… en <máquina> operativo · llamadme», «vuelvo a conectar»,
  // «sigo vivo», «a la orden»). Se distinguen del encargo por estos marcadores, que
  // no aparecen en una orden de trabajo. Pedido por Carlos (2026-07-15).
  if (/\b(llamadme|avisadme si (me )?necesit\w*|a la orden|vuelvo a (conectar|estar)|reconectad\w*|sigo (vivo|aqu[ií]|operativ\w*|online)|estoy (de vuelta|online|operativ\w*|aqu[ií] y listo))\b/i.test(t)) return false;
  if (/\ben\s+\S+\s+(ya\s+)?operativ[oa]\b/i.test(t)) return false;   // «X en <máquina> operativo»
  return true;
}
__name(fleetEsMision, "fleetEsMision");

// El bot-inbox ha mandado ts unas veces en segundos y otras ya en milisegundos;
// multiplicar a ciegas por 1000 metió created_at en MICROsegundos y el MTTR
// salió negativo de miles de millones de minutos. Normaliza cualquier época a ms.
function epochMs(v, fallback) {
  let n = Number(v);
  if (!n || !isFinite(n)) return fallback;
  while (n > 1e14) n = n / 1e3;
  return Math.round(n > 1e11 ? n : n * 1e3);
}
__name(epochMs, "epochMs");

// ── REPARTO DE IDS DE FLOTA A PRUEBA DE COLISIONES (FLT-990 a) ───────────────
// El número de una misión de flota (FLT-<n>) era, sin más, el rowid del encargo en
// el bot-inbox de admira-telegram. Ese contador vive en OTRA base y se desincroniza
// del espacio REAL de misiones: si una misión nace en yokup con un FLT-<n> por otra
// vía (alta directa en D1, reloj de Oráculo), cuando el rowid del inbox alcanza ese
// mismo <n> el sync PISABA la misión ajena — le pasó a FLT-973 y FLT-974 de Oráculo,
// que amanecieron reasignadas a Neo. Ahora el id natural sigue siendo FLT-<rowid>
// mientras esté LIBRE (las 167 misiones existentes ya valen su rowid y se adoptan
// tal cual, sin duplicar); si ya está cogido por OTRA misión, el encargo recibe el
// SIGUIENTE id realmente libre (MAX real de tickets + 1) y la ajena NO se toca.
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
__name(nextFreeFleetId, "nextFreeFleetId");

// ¿El ticket FLT-<rowid> que YA existe es el MISMO encargo que este item del inbox,
// o es una misión AJENA con la que colisiona el número? El asunto guardado en las
// misiones históricas venía a veces SIN truncar (139 chars) y otras con el recorte
// de fleetSubject (…), así que una igualdad estricta daba falsos negativos y
// duplicaba. Regla robusta al truncado: son el MISMO encargo si, quitado el «…»,
// el asunto más corto es PREFIJO del más largo (dos misiones distintas divergen
// pronto aunque compartan un «MISIÓN PRIORITARIA:» de cabecera).
function fleetSameEncargo(storedSubject, text) {
  const norm = (s) => String(s || "").replace(/…+$/, "").trim();
  const a = norm(storedSubject), b = norm(fleetSubject(text));
  if (a.length < 12 || b.length < 12) return a === b;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  return long.startsWith(short);
}
__name(fleetSameEncargo, "fleetSameEncargo");

// mission_id ESTABLE y sin colisiones para un encargo del inbox. Idempotente:
// una vez repartido queda persistido en fleet_ids y se reusa en cada sync.
async function fleetMissionId(env, it) {
  const rowid = Number(it.id);
  if (!Number.isFinite(rowid)) return "FLT-" + it.id;
  const mapped = await env.DB.prepare("SELECT mission_id FROM fleet_ids WHERE inbox_id=?").bind(rowid).first();
  if (mapped && mapped.mission_id) return mapped.mission_id;
  const candidate = "FLT-" + rowid;
  const prev = await env.DB.prepare("SELECT subject FROM tickets WHERE id=?").bind(candidate).first();
  let missionId, collided = false;
  if (!prev) {
    missionId = candidate;                              // libre → id natural = rowid
  } else if (fleetSameEncargo(prev.subject, it.text)) {
    missionId = candidate;                              // el MISMO encargo ya sincronizado → adoptar (no duplica)
  } else {
    missionId = await nextFreeFleetId(env, rowid);      // COLISIÓN con misión ajena → no pisar, siguiente libre
    collided = true;
  }
  await env.DB.prepare("INSERT OR IGNORE INTO fleet_ids(inbox_id,mission_id,created_at) VALUES(?,?,?)")
    .bind(rowid, missionId, Date.now()).run();
  const confirmed = await env.DB.prepare("SELECT mission_id FROM fleet_ids WHERE inbox_id=?").bind(rowid).first();
  const finalId = confirmed && confirmed.mission_id ? confirmed.mission_id : missionId;
  if (collided && finalId !== candidate) {
    await addEvent(env, finalId, "log", "yokup", `Reparto de ids: ${candidate} ya pertenecía a otra misión; este encargo (#${rowid}) recibió ${finalId} para no pisarla.`).catch(() => {});
  }
  return finalId;
}
__name(fleetMissionId, "fleetMissionId");

async function fleetSync(env) {
  let items = [];
  try {
    if (!env.TELEGRAM) return { ok: false, error: "no-telegram-binding", created: 0, updated: 0 };
    const r = await env.TELEGRAM.fetch(new Request(FLEET_INBOX, { headers: { accept: "application/json" } }));
    if (!r.ok) return { ok: false, error: "inbox-http-" + r.status, created: 0, updated: 0 };
    const d = await r.json();
    items = d.items || [];
  } catch (e) {
    return { ok: false, error: "inbox-unreachable: " + (e && e.message || e), created: 0, updated: 0 };
  }
  const now = Date.now();
  let created = 0, updated = 0;
  for (const it of items) {
    if (!it || !it.id) continue;
    if (!fleetEsMision(it)) continue;   // charla de Telegram: ni misión ni tarea
    const id = await fleetMissionId(env, it);   // id estable y a prueba de colisiones (FLT-990 a2)
    let st = FLEET_ST[it.status] || "open";
    const ts = epochMs(it.ts, now);
    const prev = await env.DB.prepare("SELECT id,status,assignee,loc,proof_image FROM tickets WHERE id=?").bind(id).first();
    // Un DONE del agente no basta: Yokup sólo finaliza cuando el cierre incluye
    // un pantallazo real del trabajo. El bot puede haber terminado, pero la misión
    // permanece EN CURSO hasta que /fleet/informe registre proof_image.
    const proofRequired = st === "resolved" && epochMs(it.done_at, now) >= PROOF_REQUIRED_AFTER;
    if (proofRequired && !(prev && (prev.proof_image || await hasMissionProof(env, id)))) {
      st = "in_progress";
    }
    if (!prev) {
      // Una CANCELADA sin ticket no genera lápida: cancelar es reconocer que algo no
      // se hará, no crear una misión nueva para enterrarla. (Carlos, 2026-07-21)
      if (st === "cancelled") continue;
      // ANTI-RESURRECCIÓN, pero SIN perder misiones rápidas (Carlos, 2026-07-17):
      // un encargo cerrado hace MUCHO que nunca fue ticket es una lápida (limpieza
      // manual revivida por la ventana de done de 7 días del public/inbox — p.ej. las
      // máquinas fantasma Luna) → no nace. PERO una misión REAL que se completa rápido
      // (la desktop app cierra en segundos, ANTES de que el cron de 2 min la pille
      // activa) llega ya 'resolved' y SÍ debe nacer, o nunca aparecería en /misiones.
      // Umbral: solo saltamos las cerradas hace más de 6 h.
      if (st === "resolved" && (now - epochMs(it.done_at, ts)) > 6 * 3600 * 1e3) continue;
      await env.DB.prepare(
        "INSERT OR IGNORE INTO tickets(id,screen,subject,loc,role,status,priority,assignee,source,ai_triage,created_at,updated_at,resolved_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)"
      ).bind(
        id, fleetScreen(it), fleetSubject(it.text), it.target_machine || "", it.from_name || "",
        st, fleetPriority(it.text), it.target_persona || "", "fleet", "", ts, now,
        st === "resolved" ? epochMs(it.done_at, now) : null
      ).run();
      // El texto íntegro del encargo queda como primer evento de la misión.
      await addEvent(env, id, "log", it.from_name || "Carlos", String(it.text || ""));
      created++;
    } else {
      // ANTI-RESURRECCIÓN de CANCELADAS: si la misión ya está cancelada en yokup, el
      // encargo del inbox NO la revive (aunque siga 'pending' en su ventana). Solo un
      // cancelled explícito la mantiene cancelada. (Carlos, 2026-07-21)
      if (prev.status === "cancelled" && st !== "cancelled") continue;
      // Propaga también los cambios de ASIGNACIÓN (reasignar agente/máquina desde
      // la vista detalle actualiza el encargo; el ticket debe reflejarlo).
      const asig = it.target_persona || "", loc = it.target_machine || "";
      if (prev.status !== st || prev.assignee !== asig || (prev.loc || "") !== loc) {
        await env.DB.prepare("UPDATE tickets SET status=?, assignee=?, loc=?, screen=?, updated_at=?, resolved_at=? WHERE id=?")
          .bind(st, asig, loc, fleetScreen(it), now, st === "resolved" ? now : null, id).run();
        // Al FINALIZAR una misión, su árbol a/b/c no puede quedarse en «pending»
        // para siempre (pasó con FLT-804: misión resuelta con informe y proof, y
        // las 9 subtareas colgadas como pendientes). El cierre con informe ES la
        // ejecución del plan: las subtareas aún pendientes se marcan hechas por
        // cierre, con owner explícito para no fingir que alguien las trabajó
        // una a una. Carlos, 2026-07-18.
        if (st === "resolved" && prev.status !== "resolved") {
          await env.DB.prepare(
            "UPDATE mission_tasks SET status='done', owner=COALESCE(NULLIF(owner,''),'auto-cierre'), updated_at=? WHERE mission_id=? AND status='pending'"
          ).bind(now, id).run();
          // Si finaliza apoyándose en la captura de un paso, asciende por el punto único (FLT-989 b1).
          await ascendMissionProof(env, id);
        }
        updated++;
      }
    }
  }
  return { ok: true, seen: items.length, created, updated };
}
__name(fleetSync, "fleetSync");

// ---- VUELTA: yokup → bot-inbox ---------------------------------------------
// El estado viajaba en un solo sentido (encargo → misión). Ahora, cuando el árbol
// de tareas avanza en yokup, el ENCARGO del bot-inbox se entera: así el agente ve
// en su buzón lo que Carlos ha marcado aquí.
//
// OJO: /api/bot-inbox/:id/status publica un mensaje en el grupo de Telegram cada
// vez que se llama. Por eso NO se propaga cada clic en una subtarea: solo las
// transiciones REALES del encargo (pendiente → en curso → hecho), comparando
// antes contra el estado que ya tenía. Si no cambia nada, no se escribe ni se
// avisa.
// ⚡ NUDGE inmediato al CLI del agente (Carlos, 2026-07-15: «mundo en real time,
// sin retrasos gratuitos»): encola un cmd `prompt` en admira-navegadores
// (deviceId local-<máquina>, misma convención que el executor y que el Directo
// de admira.live/status); el executor de esa máquina lo inyecta en su sesión
// viva (~5s de poll) — tmux «claude» o app Claude. PROTEGIDO por la sesión del
// perímetro; el Bearer del worker de navegadores va en el secreto NAV_CMD_TOKEN.
async function fleetNudge(env, b) {
  const machine = String(b.machine || "").trim();
  const text = String(b.text || "").trim().slice(0, 1500);
  const persona = String(b.persona || "").trim().slice(0, 40);
  const priority = b.priority === true;
  const runtime = String(b.runtime || "").trim().slice(0, 20);
  const host = /^(app|cli)$/.test(String(b.host || "").trim()) ? String(b.host).trim() : "";
  const missionId = /^FLT-\d+$/.test(String(b.missionId || "").trim())
    ? String(b.missionId).trim()
    : "";
  if (!machine || !text) return { ok: false, error: "machine y text requeridos" };
  if (!env.NAV_CMD_TOKEN) return { ok: false, error: "sin secreto NAV_CMD_TOKEN" };
  if (!env.NAVEGADORES) return { ok: false, error: "sin binding NAVEGADORES" };
  const deviceId = "local-" + machine.toLowerCase().replace(/[^a-z0-9]/g, "");
  // admira-navegadores conserva `url` en su cola, pero descarta campos nuevos.
  // Lo usamos como sobre de control interno: el texto que ve el LLM queda limpio.
  const control = priority
    ? "agent-focus://foreground?runtime=" + encodeURIComponent(runtime) + "&host=" + encodeURIComponent(host)
    : "";
  const r = await env.NAVEGADORES.fetch(new Request("https://admira-navegadores.csilvasantin.workers.dev/api/cmd", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + env.NAV_CMD_TOKEN },
    body: JSON.stringify({ deviceId, action: "prompt", url: control, text, persona })
  }));
  const d = await r.json().catch(() => ({}));
  const ok = !!(r.ok && d.ok);
  if (ok && missionId && (runtime || host)) {
    await env.DB.prepare(
      "UPDATE tickets SET agent_runtime=?,agent_host=?,updated_at=? WHERE id=?"
    ).bind(runtime, host, Date.now(), missionId).run();
  }
  let started = false;
  let statusPushed = false;
  // La cola del executor es el primer hecho fiable de que el agente ya recibió
  // el trabajo. No esperamos al cron: así incluso una misión que termina en menos
  // de dos minutos pasa por EN CURSO antes de llegar a FINALIZADA.
  if (ok && missionId) {
    const ticket = await env.DB.prepare(
      "SELECT id,source,status,assignee,loc FROM tickets WHERE id=?"
    ).bind(missionId).first();
    if (ticket && ticket.source === "fleet" && ticket.status === "open") {
      const updated = await env.DB.prepare(
        "UPDATE tickets SET status='in_progress',updated_at=? WHERE id=? AND status='open'"
      ).bind(Date.now(), missionId).run();
      started = Number(updated.meta?.changes || 0) > 0;
      if (started) {
        statusPushed = await fleetPushStatus(env, ticket, "in_progress");
        await addEvent(env, missionId, "log", "yokup",
          `Misión entregada al CLI de ${persona || "su agente"} en ${machine}; pasa a EN CURSO${statusPushed ? "" : " (sincronización del bot-inbox pendiente)"}.`);
      }
    }
  }
  return { ok, id: d.id || null, deviceId, started, statusPushed, foreground: priority, error: d.error || null };
}
__name(fleetNudge, "fleetNudge");

function fleetInboxId(mid) {
  const m = /^FLT-(\d+)$/.exec(String(mid || ""));
  return m ? m[1] : null;
}
__name(fleetInboxId, "fleetInboxId");
// El nº de encargo del bot-inbox va EMBEBIDO en el `screen` del ticket como «#<n>»
// (fleetScreen: «persona·máquina #<inbox_id>»). Ese es el dato REAL: desde el reparto
// anticolisión (FLT-990 a2) el id FLT-<n> puede diferir del encargo —FLT-1005 nació
// del encargo #991— y pelar «FLT-» apuntaba a un encargo que no existía. (FLT-990 c)
function inboxIdFromScreen(screen) {
  const m = /#(\d+)\b/.exec(String(screen || ""));
  return m ? m[1] : null;
}
__name(inboxIdFromScreen, "inboxIdFromScreen");
// Nº de encargo REAL de una misión de flota, del dato más fiable al menos fiable:
//   1) fleet_ids (mapa canónico inbox_id↔mission_id que dejó el propio reparto),
//   2) el «#<n>» embebido en el `screen` del ticket,
//   3) último recurso: pelar «FLT-» del id (roto tras el reparto, pero mejor que nada).
async function fleetEncargoId(env, mid, screen) {
  try {
    const row = await env.DB.prepare("SELECT inbox_id FROM fleet_ids WHERE mission_id=?").bind(mid).first();
    if (row && row.inbox_id != null && /^\d+$/.test(String(row.inbox_id))) return String(row.inbox_id);
  } catch (e) {}
  return inboxIdFromScreen(screen) || fleetInboxId(mid);
}
__name(fleetEncargoId, "fleetEncargoId");

async function fleetPushStatus(env, ticket, status) {
  // Dato REAL del encargo (fleet_ids → screen → pelar FLT). Antes pelaba «FLT-» a
  // secas y, tras el reparto anticolisión, empujaba el estado a OTRO encargo. (FLT-990 c)
  const id = await fleetEncargoId(env, ticket.id, ticket.screen);
  if (!id || !env.TELEGRAM) return false;
  try {
    const r = await env.TELEGRAM.fetch(new Request(
      `https://admira-telegram.csilvasantin.workers.dev/api/bot-inbox/${id}/status`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status,
          persona: ticket.assignee || "",
          machine: ticket.loc || "",
          verification: "Estado marcado en yokup.com/misiones (plan de tareas abc/123)."
        })
      }
    ));
    return r.ok;
  } catch (e) {
    return false;
  }
}
__name(fleetPushStatus, "fleetPushStatus");

// Deriva el estado de la MISIÓN a partir de su árbol y, si ha cambiado de verdad,
// lo baja al encargo del bot-inbox. Idempotente.
async function fleetReconcileMission(env, mid) {
  const t = await env.DB.prepare("SELECT id,source,status,assignee,loc,screen FROM tickets WHERE id=?").bind(mid).first();
  if (!t || t.source !== "fleet") return null;
  // Una CANCELADA no la revive el reconciliador por árbol (sus subtareas quedan
  // 'pending' y recalcularían 'open'). Cancelar es definitivo salvo reabrir manual.
  if (t.status === "cancelled") return { mission: mid, status: "cancelled" };
  const tasks = await listMissionTasks(env, mid);
  if (!tasks.length) return null;
  const allDone = tasks.every((x) => x.status === "done");
  const started = tasks.some((x) => x.status !== "pending");
  const proof = allDone ? await hasMissionProof(env, mid) : false;
  const next = allDone && proof ? "resolved" : started || allDone ? "in_progress" : "open";
  // ÁRBOL COMPLETO PERO SIN PRUEBA: antes esto era una degradación MUDA — la misión
  // se quedaba «en curso» y nadie sabía por qué (FLT-982/983/984 hubo que rematarlas
  // a mano en D1). Ahora lo dice, en su propia cronología y en la respuesta del API.
  if (allDone && !proof && t.status !== "resolved") {
    const txt = "⏸ El árbol está al 100% pero la misión NO puede finalizar: falta el pantallazo. Manda la captura con la última tarea (`image` en /fleet/task-status) o cierra con /fleet/informe.";
    const last = await env.DB.prepare("SELECT text FROM events WHERE ticket_id=? ORDER BY id DESC LIMIT 1").bind(mid).first();
    if (!last || last.text !== txt) await addEvent(env, mid, "log", "yokup", txt);
    // Si además no había cambio de estado que escribir, se responde aquí con el motivo.
    if (next === t.status) return { mission: mid, status: t.status, blocked: "sin-prueba", reason: txt };
  }
  // No DEGRADAR una misión FINALIZADA a mano: el reconciliador por árbol solo PROMUEVE
  // (open→in_progress→resolved). El árbol se auto-genera y nadie marca sus subtareas
  // (queda 0/N), así que sin esta guarda reabría cada 2 min el FINALIZAR humano. Reabrir
  // es acción manual (botón REABRIR → /ticket/status), nunca del cron.
  if (t.status === "resolved" && next !== "resolved") return null;
  if (next === t.status) return null;            // sin cambio → ni escribe ni avisa al grupo
  const now = Date.now();
  await env.DB.prepare("UPDATE tickets SET status=?, updated_at=?, resolved_at=? WHERE id=?")
    .bind(next, now, next === "resolved" ? now : null, mid).run();
  // Si esta misión FINALIZA por respaldo (árbol al 100% + captura en algún paso),
  // la prueba asciende por el punto único para que no salga con el logotipo (FLT-989 b1).
  if (next === "resolved") await ascendMissionProof(env, mid);
  const inboxStatus = next === "resolved" ? "done" : next === "in_progress" ? "in_progress" : "pending";
  const pushed = await fleetPushStatus(env, t, inboxStatus);
  await addEvent(env, mid, next === "resolved" ? "recover" : "log", "yokup",
    `La misión pasa a ${next} por su árbol de tareas. Encargo #${fleetInboxId(mid)} → ${inboxStatus.toUpperCase()}${pushed ? "" : " (no se pudo avisar al bot-inbox)"}.`);
  return { mission: mid, status: next, inbox: inboxStatus, pushed, blocked: allDone && !proof ? "sin-prueba" : null };
}
__name(fleetReconcileMission, "fleetReconcileMission");

// Barrido: deriva el estado de TODAS las misiones de flota con plan y baja al
// bot-inbox las que hayan cambiado. Va en el cron para que la vuelta no dependa de
// que el cambio haya pasado por el endpoint (un chip marcado, un UPDATE, otro
// cliente). Una sola consulta agregada — no una por misión.
async function fleetReconcileAll(env) {
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.status, t.assignee, t.loc, t.screen,
            COUNT(m.code) AS total,
            SUM(CASE WHEN m.status='done' THEN 1 ELSE 0 END) AS done,
            SUM(CASE WHEN m.status<>'pending' THEN 1 ELSE 0 END) AS started
       FROM tickets t JOIN mission_tasks m ON m.mission_id = t.id
      WHERE t.source='fleet'
      GROUP BY t.id`
  ).all();
  const now = Date.now();
  const changed = [];
  for (const r of results || []) {
    if (!r.total) continue;
    if (r.status === "cancelled") continue;   // el barrido no revive una cancelada
    const allDone = r.done === r.total;
    const proof = allDone ? await hasMissionProof(env, r.id) : false;
    const next = allDone && proof ? "resolved" : r.started > 0 || allDone ? "in_progress" : "open";
    // No reabrir un FINALIZAR humano desde el árbol auto-generado (ver fleetReconcileMission):
    // el barrido solo promueve, nunca degrada un resolved. Reabrir = botón REABRIR manual.
    if (r.status === "resolved" && next !== "resolved") continue;
    if (next === r.status) continue;
    await env.DB.prepare("UPDATE tickets SET status=?, updated_at=?, resolved_at=? WHERE id=?")
      .bind(next, now, next === "resolved" ? now : null, r.id).run();
    // Cierre por respaldo en el barrido: la prueba asciende por el punto único (FLT-989 b1).
    if (next === "resolved") await ascendMissionProof(env, r.id);
    const inboxStatus = next === "resolved" ? "done" : next === "in_progress" ? "in_progress" : "pending";
    const pushed = await fleetPushStatus(env, r, inboxStatus);
    await addEvent(env, r.id, "status", "yokup",
      `La misión pasa a ${next} por su árbol de tareas (${r.done}/${r.total}). Encargo #${fleetInboxId(r.id)} → ${inboxStatus.toUpperCase()}${pushed ? "" : " (no se pudo avisar al bot-inbox)"}.`);
    changed.push({ id: r.id, status: next, inbox: inboxStatus, pushed });
  }
  return { ok: true, changed, count: changed.length };
}
__name(fleetReconcileAll, "fleetReconcileAll");

// Planifica en bloque las misiones de flota VIVAS que aún no tienen árbol de
// tareas. Idempotente: solo toca las que están sin plan, así que repetir la
// llamada no regenera nada ni duplica coste de IA. Se limita por tanda porque
// cada plan es una llamada a Workers AI.
async function fleetPlanPending(env, limit) {
  const n = Math.max(1, Math.min(+limit || 5, 20));
  const { results } = await env.DB.prepare(
    `SELECT t.id FROM tickets t
      WHERE t.source='fleet' AND t.status!='resolved'
        AND NOT EXISTS (SELECT 1 FROM mission_tasks m WHERE m.mission_id = t.id)
      ORDER BY t.created_at DESC LIMIT ?`
  ).bind(n).all();
  const ids = (results || []).map((r) => r.id);
  const planned = [];
  for (const id of ids) {
    try {
      const tasks = await proposePlan(env, id);
      if (tasks && tasks.length) planned.push(id);
    } catch (e) {
    }
  }
  // pendientes que quedan tras esta tanda
  const left = (await env.DB.prepare(
    `SELECT COUNT(*) c FROM tickets t WHERE t.source='fleet' AND t.status!='resolved'
       AND NOT EXISTS (SELECT 1 FROM mission_tasks m WHERE m.mission_id = t.id)`
  ).first())?.c || 0;
  return { ok: true, planned, count: planned.length, pending: left };
}
__name(fleetPlanPending, "fleetPlanPending");

// PROGRESO EN TERCIOS (FLT-982 b1). El contador crudo `COUNT(*)` de mission_tasks
// mezclaba peras y manzanas: pasos a..h, subtareas a1..h3 y la fila z1 de CIERRE
// que genera el propio worker — de ahí los «1/13» y «0/32» que nadie podía
// comparar. Mismo criterio que el front (yokup-site/yk-misiones.js, función
// `tercios`), copiado a propósito para que worker y navegador no diverjan:
//   · tareas a·b·c        → sobre 3 (denominador FIJO)
//   · subtareas a1..c3    → sobre 9 (denominador FIJO)
//   · z1/z2 (cierre)      → NO cuenta, ni suma ni resta
//   · pasos d..h y sus subtareas → aparte, en extra/extraDone
// Denominadores fijos (Carlos, 22-jul-2026): un plan con 2 tareas no es un plan
// de 2, es un plan de 3 INCOMPLETO — y eso se dice (incompleto/topN/subN), no se
// disimula bajando el denominador. Nunca se inventan filas.
function tercios(tasks) {
  const top = [], sub = [];
  let extra = 0, extraDone = 0;
  for (const t of tasks || []) {
    const c = String((t && t.code) || "").trim().toLowerCase();
    if (/^[a-c]$/.test(c)) top.push(t);
    else if (/^[a-c][1-3]$/.test(c)) sub.push(t);
    else if (c && !/^z\d*$/.test(c)) { extra++; if (t.status === "done") extraDone++; }
  }
  // Sin plan NO hay chip: igual que el front, una misión sin ninguna fila útil
  // devuelve null en vez de un «0/3» que aparentaría un plan que no existe.
  if (!top.length && !sub.length && !extra) return null;
  const hecho = (a) => a.filter((t) => t.status === "done").length;
  return {
    done: hecho(top), total: 3,
    sdone: hecho(sub), stotal: 9,
    topN: top.length, subN: sub.length,
    incompleto: top.length < 3 || sub.length < 9,
    extra, extraDone
  };
}
__name(tercios, "tercios");

// Lectura PÚBLICA para admira.live/status. El árbol de tareas va EMBEBIDO: los
// /mission/* viven tras el perímetro (Google) y status no pasa el gate. No
// expone nada que el bot-inbox público no publique ya.
async function fleetMissions(env) {
  const { results } = await env.DB.prepare(
    "SELECT id,screen,subject,loc,project,role,status,assignee,agent_runtime,agent_host,proof_image,live_shot,live_at,created_at,updated_at,note,parent_id FROM tickets WHERE source='fleet' ORDER BY (status='open') DESC,(status='in_progress') DESC, created_at DESC LIMIT 120"
  ).all();
  const rows = results || [];
  if (!rows.length) return [];
  // Troceado obligatorio: con LIMIT 120 y el tope de 100 variables de D1, esta
  // consulta reventaba en cuanto había más de 100 misiones de flota.
  // `has_report` en vez del texto del parte: quien pinta necesita saber SI existe
  // informe (para señalar el que falta), no arrastrar 120 partes por la red.
  const tks = await selectIn(env, rows.map((r) => r.id), (ph) =>
    `SELECT mission_id,code,title,status,owner,
            CASE WHEN report IS NOT NULL AND TRIM(report)!='' THEN 1 ELSE 0 END has_report
     FROM mission_tasks WHERE mission_id IN (${ph}) ORDER BY code`
  );
  const byMission = {};
  for (const t of tks || []) (byMission[t.mission_id] = byMission[t.mission_id] || []).push(t);
  // `project` viaja como ID del censo; quien pinta (status, /misiones) quiere el
  // nombre humano y no tiene por qué conocer la tabla.
  const pidx = await projectIndex(env);
  return rows.map((r) => {
    const tasks = byMission[r.id] || [];
    return Object.assign({}, r, {
      machine: r.loc,
      project_name: resolveProject(pidx, r.project || "").name,
      persona: r.assignee,
      source: "fleet",
      tasks,
      // Una misión terminada SIN parte es deuda visible (Carlos, 24-jul-2026).
      has_report: tasks.some((t) => t.has_report),
      progress: tercios(tasks)
    });
  });
}
__name(fleetMissions, "fleetMissions");
// Cuelga una misión HIJA de una MADRE (FLT-990 b2 → DOS niveles, FLT-990 c). El
// modelo es madre → misión → submisión y NADA más: profundidad máxima 2. Se permite
// colgar bajo una hija SOLO si esa hija no es a su vez nieta (su madre debe ser
// raíz); el 3er nivel se rechaza con mensaje claro. Aditivo y reversible.
async function fleetSetParent(env, b) {
  const child = String(b && b.child || "").trim();
  const parent = b && (b.parent == null || b.parent === "") ? null : String(b.parent || "").trim();
  if (!/^FLT-\d+$/.test(child)) return { ok: false, error: "child debe ser FLT-<n>" };
  const cRow = await env.DB.prepare("SELECT id FROM tickets WHERE id=?").bind(child).first();
  if (!cRow) return { ok: false, error: "child no existe: " + child };
  if (parent === null) {
    await env.DB.prepare("UPDATE tickets SET parent_id=NULL, updated_at=? WHERE id=?").bind(Date.now(), child).run();
    await addEvent(env, child, "log", "flota", "Misión desenganchada de su madre (vuelve a plana).").catch(() => {});
    return { ok: true, child, parent: null };
  }
  if (!/^FLT-\d+$/.test(parent)) return { ok: false, error: "parent debe ser FLT-<n> o null" };
  if (parent === child) return { ok: false, error: "una misión no puede ser su propia madre" };
  const pRow = await env.DB.prepare("SELECT id,parent_id FROM tickets WHERE id=?").bind(parent).first();
  if (!pRow) return { ok: false, error: "parent no existe: " + parent };
  // PROFUNDIDAD MÁXIMA 2. Si el parent ya es hija (tiene madre), se admite —el child
  // sería submisión (nivel 2)— salvo que esa madre cuelgue a su vez de otra: entonces
  // el parent ya es nieto y colgarle algo abriría un 3er nivel. Rechazo explícito.
  if (pRow.parent_id) {
    const gRow = await env.DB.prepare("SELECT parent_id FROM tickets WHERE id=?").bind(pRow.parent_id).first();
    if (gRow && gRow.parent_id) return { ok: false, error: "profundidad máxima 2 (madre → misión → submisión): " + parent + " ya es una submisión, no puede tener las suyas" };
  }
  const hasKids = await env.DB.prepare("SELECT 1 x FROM tickets WHERE parent_id=?").bind(child).first();
  // El child ya es madre: colgarlo empuja a SUS hijas un nivel más abajo. Solo cabe
  // si aterriza como nivel 1 (bajo una madre raíz); bajo una hija crearía el 3er nivel.
  if (hasKids && pRow.parent_id) return { ok: false, error: child + " ya es madre; colgarlo de " + parent + " (que ya es hija) empujaría a sus hijas a un 3er nivel" };
  await env.DB.prepare("UPDATE tickets SET parent_id=?, updated_at=? WHERE id=?").bind(parent, Date.now(), child).run();
  const rotulo = pRow.parent_id ? "misión " + parent + " (como submisión)" : "misión madre " + parent;
  await addEvent(env, child, "log", "flota", "Colgada de la " + rotulo + ".").catch(() => {});
  return { ok: true, child, parent };
}
__name(fleetSetParent, "fleetSetParent");
async function stats(env, scope) {
  // Mismos ámbitos que listTickets: los KPIs de la bandeja de campo no pueden
  // contar las misiones de flota (dispararían «abiertas» a decenas).
  const sc = scope === "fleet" ? "source='fleet'" : scope === "todas" ? "1=1" : "(source IS NULL OR source!='fleet')";
  const open = (await env.DB.prepare(`SELECT COUNT(*) c FROM tickets WHERE ${sc} AND status='open'`).first())?.c || 0;
  const prog = (await env.DB.prepare(`SELECT COUNT(*) c FROM tickets WHERE ${sc} AND status='in_progress'`).first())?.c || 0;
  const res = (await env.DB.prepare(`SELECT COUNT(*) c FROM tickets WHERE ${sc} AND status='resolved'`).first())?.c || 0;
  // Solo deltas cuerdos: ni negativos ni >1 año (un timestamp corrupto no debe reventar el KPI).
  const mttrRow = await env.DB.prepare(`SELECT AVG(resolved_at-created_at) m FROM tickets WHERE ${sc} AND status='resolved' AND resolved_at IS NOT NULL AND resolved_at >= created_at AND resolved_at - created_at < 31536000000`).first();
  const mttr = mttrRow && mttrRow.m ? Math.round(mttrRow.m / 6e4) : null;
  return { open, in_progress: prog, resolved: res, mttr };
}
__name(stats, "stats");
// CONTADORES DEL MENÚ SUPERIOR (Carlos, 2026-07-23): un solo agregado para que
// la barra (yk-frame.js) rotule «MISIONES 2/50» = 2 en curso / 50 esperando.
// Semántica UNIFORME por sección: curso = «en ello ahora» (in_progress/estudio);
// pend = «esperando» (open/pending/nueva). Lo FINALIZADO no se cuenta (no es un
// pendiente ni un en-curso). Cada sección lee de la MISMA fuente que su página:
//   · objetivos   → ideas            curso=estudio        pend=nueva
//   · misiones    → tickets fleet    curso=in_progress    pend=open
//   · tareas      → mission_tasks    curso=in_progress    pend=pending   (scope=todas, como /tareas)
//   · incidencias → tickets !fleet   curso=in_progress    pend=open      (scope=campo, como /incidencias)
//   · informes    → mission_tasks con report, de misiones fleet (como /informes?scope=fleet)
//                                    curso=in_progress    pend=pending
async function menuCounters(env) {
  const zero = () => ({ curso: 0, pend: 0 });
  const out = { objetivos: zero(), misiones: zero(), tareas: zero(), incidencias: zero(), informes: zero() };
  // Tickets: misiones (fleet) e incidencias (campo) de una sola pasada.
  const tk = (await env.DB.prepare(
    "SELECT CASE WHEN source='fleet' THEN 'f' ELSE 'c' END sc, status, COUNT(*) n " +
    "FROM tickets WHERE status IN ('open','in_progress') GROUP BY sc, status"
  ).all()).results || [];
  for (const r of tk) {
    const dst = r.sc === "f" ? out.misiones : out.incidencias;
    if (r.status === "in_progress") dst.curso = r.n; else if (r.status === "open") dst.pend = r.n;
  }
  // Objetivos = ideas.
  const id = (await env.DB.prepare(
    "SELECT status, COUNT(*) n FROM ideas WHERE status IN ('nueva','estudio') GROUP BY status"
  ).all()).results || [];
  for (const r of id) { if (r.status === "estudio") out.objetivos.curso = r.n; else if (r.status === "nueva") out.objetivos.pend = r.n; }
  // Tareas = mission_tasks (todas).
  const ta = (await env.DB.prepare(
    "SELECT status, COUNT(*) n FROM mission_tasks WHERE status IN ('pending','in_progress') GROUP BY status"
  ).all()).results || [];
  for (const r of ta) { if (r.status === "in_progress") out.tareas.curso = r.n; else if (r.status === "pending") out.tareas.pend = r.n; }
  // INFORMES no tienen estado: o están escritos o no están (Carlos, 24-jul-2026).
  // Antes se contaban «en curso/pendientes» las tareas CON parte que seguían abiertas
  // — doblemente falso: le inventaba un ciclo de vida al informe e ignoraba justo los
  // partes ya escritos (los de tareas cerradas), que son casi todos. De ahí el «1/18».
  // El número honesto es la COBERTURA: de las misiones de flota ya terminadas, cuántas
  // tienen su parte. Toda misión finalizada lo debe, así que total−hechos es la deuda.
  const inf = await env.DB.prepare(
    "SELECT COUNT(*) total, SUM(CASE WHEN EXISTS (" +
    "  SELECT 1 FROM mission_tasks m WHERE m.mission_id=t.id AND m.report IS NOT NULL AND TRIM(m.report)!=''" +
    ") THEN 1 ELSE 0 END) hechos FROM tickets t WHERE t.source='fleet' AND t.status='resolved'"
  ).first();
  out.informes = { hechos: (inf && inf.hechos) | 0, total: (inf && inf.total) | 0 };
  // NOTIFICACIONES (FLT-1020): un diálogo del sistema en cualquier equipo de la
  // flota es un equipo PARADO. Sólo cuenta lo abierto — o hay que ir o no hay nada.
  const nt = await env.DB.prepare("SELECT COUNT(*) n FROM notifs WHERE status='abierta'").first();
  out.notificaciones = { abiertas: (nt && nt.n) | 0 };
  // DECISIONES: relojes VIVOS = pending con deadline futuro (honesto: deadline>now,
  // no me fío del barrido de expiración que sólo corre en GET /decisions). El menú
  // pinta la cuenta atrás hacia el más próximo; sin ninguna viva, DECISIONES limpia.
  const now = Date.now();
  const dec = await env.DB.prepare(
    "SELECT COUNT(*) n, MIN(deadline) nearest FROM decisions WHERE status='pending' AND deadline > ?"
  ).bind(now).first();
  out.decisiones = { vivas: (dec && dec.n) | 0, deadline: (dec && dec.n) ? dec.nearest : null };
  return out;
}
__name(menuCounters, "menuCounters");
var index_default = {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    // ── AUTOCURACIÓN DE LA RUTINA PROGRAMADA, INDEPENDIENTE DEL CRON (FLT-1016 c) ─
    // DIAGNÓSTICO (23/24-jul-2026): el cron scheduled() de este worker NO se invoca
    // en esta cuenta —schedule "*/2 * * * *" registrado y confirmado por API, pero
    // wrangler tail no ve NINGUNA ejecución de cron en varias franjas y council_ticks
    // quedaba vacío—. Antes sólo el Consejo se autocuraba aquí; ahora enganchamos
    // TODA la rutina del tick (reconcile, fleetSync, fleetPlan, fleetReconcile,
    // monitores y Consejo): en 2º plano (ctx.waitUntil, sin latencia), con throttle
    // por isolate (>=120s, la cadencia del viejo */2 con margen) + cerrojo GLOBAL por
    // D1 (un isolate por ventana → sin dobles incidencias/planes). Si el cron revive,
    // scheduled() usa el MISMO cuerpo y cerrojo → cero duplicación. Best-effort: nunca
    // afecta a la respuesta.
    try {
      const _now = Date.now();
      if (ctx && typeof ctx.waitUntil === "function" && _now - scheduledPiggybackAt > 120000) {
        scheduledPiggybackAt = _now;
        ctx.waitUntil((async () => {
          if (await tryAcquireBeatLease(env, "__scheduled", 120000)) await runScheduledRoutine(env, null);
        })().catch(() => {}));
      }
    } catch (e) {}
    // ── MEDIA (imágenes de misiones) ──────────────────────────────────────────
    // GET /media/<key> → PÚBLICO: sirve la imagen de R2 (el LLM la ve por URL).
    if (url.pathname.startsWith("/media/") && req.method === "GET") {
      if (!env.MEDIA) return json({ error: "sin bucket MEDIA" }, 500);
      const key = decodeURIComponent(url.pathname.slice("/media/".length));
      const obj = await env.MEDIA.get(key);
      if (!obj) return json({ error: "not found" }, 404);
      const h = new Headers(CORS);
      // FLT-1007 c: se sirve el content-type REAL guardado. Los objetos viejos de fleet/
      // se subieron sin metadata y hoy son TODO imágenes (las pruebas), así que su caída
      // es image/png —no octet-stream— para que las capturas existentes sigan pintándose.
      h.set("content-type", obj.httpMetadata?.contentType || "image/png");
      h.set("cache-control", "public, max-age=31536000, immutable");
      return new Response(obj.body, { headers: h });
    }
    // POST /media → PROTEGIDO (sesión del perímetro): sube una imagen a R2 y
    // devuelve su URL pública. Body = bytes de la imagen; content-type = el suyo.
    if (url.pathname === "/media" && req.method === "POST") {
      const sess = await requireAuth(env, req);
      if (!sess) return json({ error: "unauthorized" }, 401);
      if (!env.MEDIA) return json({ error: "sin bucket MEDIA" }, 500);
      const ct = req.headers.get("content-type") || "application/octet-stream";
      if (!/^image\//i.test(ct)) return json({ error: "solo imágenes" }, 415);
      const buf = await req.arrayBuffer();
      if (!buf.byteLength) return json({ error: "vacío" }, 400);
      if (buf.byteLength > 12 * 1024 * 1024) return json({ error: "máx 12MB" }, 413);
      const ext = (ct.split("/")[1] || "png").split(";")[0].replace(/[^a-z0-9]/gi, "") || "png";
      const rand = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
      const key = `m/${rand}.${ext}`;
      await env.MEDIA.put(key, buf, { httpMetadata: { contentType: ct } });
      const publicUrl = `${url.origin}/media/${key}`;
      return json({ ok: true, url: publicUrl, key });
    }
    // GET /shot?url=<web del proyecto> → PÚBLICO: miniatura de la web (referencia
    // visual de la misión). Captura vía mShots y la CACHEA en R2 (sin token ni
    // puppeteer). Anti-SSRF: solo dominios de la flota. (Carlos, 2026-07-16)
    if (url.pathname === "/shot" && req.method === "GET") {
      if (!env.MEDIA) return json({ error: "sin bucket MEDIA" }, 500);
      const target = url.searchParams.get("url") || "";
      const ALLOW = /^https?:\/\/(www\.)?(pixeria\.com|xpaceos\.com|yokup\.com|admira\.live|admira\.tv|admira\.store|clearchannel\.tv|admiranext\.com|carlossilva\.info)(\/|$|\?)/i;
      if (!ALLOW.test(target)) return json({ error: "dominio no permitido" }, 400);
      const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(target));
      const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
      const key = "shot/" + hash + ".png";
      const FRESH = 12 * 3600 * 1000;   // 12h de caché por web
      const cached = await env.MEDIA.get(key);
      if (cached) {
        const age = Date.now() - parseInt((cached.customMetadata && cached.customMetadata.ts) || "0", 10);
        if (age < FRESH) {
          const h = new Headers(CORS); h.set("content-type", "image/png"); h.set("cache-control", "public, max-age=3600");
          return new Response(cached.body, { headers: h });
        }
      }
      let buf = null, ct = "image/png";
      // 1) Captura PROPIA con Browser Rendering (SIN marca de agua): 960×600 de la
      //    parte superior de la web. Si no está disponible o falla, cae a thum.io.
      try {
        const browser = await puppeteer.launch(env.BROWSER);
        try {
          const page = await browser.newPage();
          await page.setViewport({ width: 960, height: 600, deviceScaleFactor: 1 });
          // networkidle0 NO sirve para nuestras propias webs: tienen sondeos y
          // widgets (el avatar 3D) que mantienen la red viva, así que nunca
          // llegaba a reposo, saltaba el timeout y caía al respaldo externo.
          // Se espera al DOM y se dan 2,5 s para que pinte.
          await page.goto(target, { waitUntil: "domcontentloaded", timeout: 2e4 });
          await new Promise((r) => setTimeout(r, 2500));
          buf = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 960, height: 600 } });
          ct = "image/png";
        } finally { await browser.close(); }
      } catch (e) { buf = null; }
      // 2) Fallback: thum.io (con marca de agua) si Browser Rendering no dio imagen.
      if (!buf || buf.byteLength < 3500) {
        try {
          const r = await fetch("https://image.thum.io/get/width/480/crop/300/" + target, { cf: { cacheTtl: 0 } });
          buf = await r.arrayBuffer();
          ct = r.headers.get("content-type") || "image/png";
        } catch (e) { /* sin captura */ }
      }
      // Solo cachear si es una imagen real (no un HTML de error ~pequeño).
      // Y NUNCA un GIF: thum.io devuelve un GIF animado de «cargando» cuando aún
      // no tiene la captura, pesa >3500 bytes y colaba como buena — quedaba
      // cacheada 12 h y servida con content-type PNG. Las capturas de verdad
      // (Browser Rendering o thum.io) son PNG o JPEG.
      const real = buf && buf.byteLength > 3500 && /^image\/(png|jpe?g)/i.test(ct);
      if (real) await env.MEDIA.put(key, buf, { httpMetadata: { contentType: ct }, customMetadata: { ts: String(Date.now()), ct: ct } });
      else if (cached) { const h = new Headers(CORS); h.set("content-type", (cached.customMetadata && cached.customMetadata.ct) || "image/png"); h.set("cache-control", "public, max-age=600"); return new Response(cached.body, { headers: h }); }
      const h = new Headers(CORS); h.set("content-type", real ? ct : "image/png"); h.set("cache-control", real ? "public, max-age=3600" : "no-store");
      return new Response(real ? buf : new ArrayBuffer(0), { headers: h, status: real ? 200 : 502 });
    }
    if (url.pathname === "/auth/login" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      const g = await verifyGoogle(b.credential || "");
      if (!g) return json({ ok: false, error: "token inv\xE1lido" }, 401);
      const email = String(g.email).toLowerCase();
      const wl = await whitelist();
      if (!wl.has(email)) return json({ ok: false, error: "no autorizado" }, 403);
      return json({ ok: true, token: await makeSession(env, email), email });
    }
    // Misiones de FLOTA: lectura pública (la consume admira.live/status, que no
    // pasa el gate Google) y sync idempotente. Van ANTES del perímetro.
    // Latido de PROGRESO del CLI: marca la misión en curso y guarda la última
    // captura del terminal. Público como /fleet/informe (lo llama progreso-cli.sh
    // desde la máquina del agente). Body: {mission, image} — image = URL /media.
    if (url.pathname === "/fleet/progress" && req.method === "POST") {
      try {
        await ensureSchema(env);
        const b = await req.json();
        let mid = String(b.mission || b.id || "").trim();
        if (/^#?\d+$/.test(mid)) mid = "FLT-" + mid.replace(/^#/, "");
        const img = String(b.image || "").trim().slice(0, 500);
        if (!mid) return json({ ok: false, error: "mission requerida" }, 400);
        // No pisa una misión ya resuelta; solo abre→en curso y refresca la captura.
        await env.DB.prepare(
          "UPDATE tickets SET status=CASE WHEN status='open' THEN 'in_progress' ELSE status END, live_shot=COALESCE(NULLIF(?,''),live_shot), live_at=?, updated_at=? WHERE id=? AND status!='resolved'"
        ).bind(img, Date.now(), Date.now(), mid).run();
        return json({ ok: true, mission: mid });
      } catch (e) {
        return json({ ok: false, error: String(e) }, 500);
      }
    }
    if (url.pathname === "/fleet/missions") {
      await ensureSchema(env);
      return json({ missions: await fleetMissions(env) });
    }
    // ── NOTIFICACIONES DEL SISTEMA DE LA FLOTA (FLT-1020) ────────────────────
    // Sin perímetro, como el resto de /fleet/*: quien publica es un vigilante que
    // corre en cada máquina, sin navegador ni login. POST = «esto sigue en pantalla»
    // (idempotente por fingerprint: refresca la fila viva en vez de duplicarla).
    if (url.pathname === "/fleet/notificacion" && req.method === "POST") {
      await ensureSchema(env);
      let b; try { b = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
      const machine = String(b.machine || "").trim().slice(0, 60);
      const owner = String(b.owner || "").trim().slice(0, 80);
      if (!machine || !owner) return json({ ok: false, error: "machine y owner requeridos" }, 400);
      const titulo = String(b.titulo || b.title || "").trim().slice(0, 300);
      const kind = String(b.kind || "sistema").trim().slice(0, 40);
      const image = String(b.image || "").trim().slice(0, 400) || null;
      // CIERRE: el vigilante avisa de que el diálogo ya no está. Se cierra la fila
      // viva de esa huella; no se borra, para que quede el rastro de cuánto duró.
      const fp = machine.toLowerCase() + "|" + owner.toLowerCase();
      const now = Date.now();
      if (b.cerrada === true || b.resuelta === true) {
        const r = await env.DB.prepare(
          "UPDATE notifs SET status='cerrada', closed_at=?, last_at=? WHERE fingerprint=? AND status='abierta'"
        ).bind(now, now, fp).run();
        return json({ ok: true, cerradas: (r.meta && r.meta.changes) | 0 });
      }
      const viva = await env.DB.prepare("SELECT id FROM notifs WHERE fingerprint=? AND status='abierta'").bind(fp).first();
      if (viva) {
        // Ya avisada: se refresca (y se queda la PRIMERA captura, que es la del
        // momento en que apareció; sustituirla sólo si antes no había ninguna).
        await env.DB.prepare(
          "UPDATE notifs SET last_at=?, seen_count=seen_count+1, titulo=COALESCE(NULLIF(?,''),titulo), image=COALESCE(image,?) WHERE id=?"
        ).bind(now, titulo, image, viva.id).run();
        return json({ ok: true, id: viva.id, nueva: false });
      }
      const id = "NOTIF-" + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
      await env.DB.prepare(
        "INSERT INTO notifs (id,fingerprint,machine,owner,titulo,kind,image,status,first_at,last_at,seen_count) VALUES (?,?,?,?,?,?,?,'abierta',?,?,1)"
      ).bind(id, fp, machine, owner, titulo, kind, image, now, now).run();
      return json({ ok: true, id, nueva: true });
    }
    // Lectura para la sección /notificaciones. Abiertas primero, más recientes arriba.
    if (url.pathname === "/fleet/notificaciones" && req.method === "GET") {
      await ensureSchema(env);
      const todas = url.searchParams.get("todas") === "1";
      const { results } = await env.DB.prepare(
        "SELECT * FROM notifs" + (todas ? "" : " WHERE status='abierta'") +
        " ORDER BY (status='abierta') DESC, last_at DESC LIMIT 200"
      ).all();
      const abiertas = (results || []).filter((n) => n.status === "abierta").length;
      return json({ ok: true, abiertas, notificaciones: results || [] });
    }
    // Cierre a mano desde la propia sección (ya lo he atendido / no era nada).
    if (url.pathname === "/fleet/notificacion/cerrar" && req.method === "POST") {
      await ensureSchema(env);
      let b; try { b = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
      const id = String(b.id || "").trim().slice(0, 40);
      if (!id) return json({ ok: false, error: "id requerido" }, 400);
      const now = Date.now();
      const r = await env.DB.prepare("UPDATE notifs SET status='cerrada', closed_at=?, last_at=? WHERE id=? AND status='abierta'").bind(now, now, id).run();
      return json({ ok: true, cerradas: (r.meta && r.meta.changes) | 0 });
    }
    // DEUDA DE INFORMES (FLT-1018): misiones de flota TERMINADAS sin un solo parte.
    // Consulta propia y NO la lista de /fleet/missions, que va capada a 120 y saca
    // primero las abiertas: la deuda vieja —justo la que hay que perseguir— caía
    // fuera de esa ventana. Sin tope de fecha: una deuda vieja sigue siendo deuda.
    if (url.pathname === "/fleet/informes-deuda") {
      await ensureSchema(env);
      const { results } = await env.DB.prepare(
        "SELECT t.id, t.subject, t.assignee, t.loc, t.updated_at FROM tickets t " +
        "WHERE t.source='fleet' AND t.status='resolved' AND NOT EXISTS (" +
        "  SELECT 1 FROM mission_tasks m WHERE m.mission_id=t.id AND m.report IS NOT NULL AND TRIM(m.report)!=''" +
        ") ORDER BY t.updated_at DESC"
      ).all();
      return json({ ok: true, missions: results || [] });
    }
    if (url.pathname === "/fleet/sync" && req.method === "POST") {
      await ensureSchema(env);
      return json(await fleetSync(env));
    }
    // VÍA PARA AGENTES (sin gate Google): sube la CAPTURA DE PRUEBA a R2 y devuelve su
    // URL pública, para adjuntarla luego al informe (/fleet/informe con {image}). Espejo
    // de POST /media pero sin perímetro, como el resto de /fleet/* (los agentes no lo cruzan).
    // Body = bytes de la imagen; content-type = el suyo. Carlos, 2026-07-17.
    if (url.pathname === "/fleet/media" && req.method === "POST") {
      if (!env.MEDIA) return json({ ok: false, error: "sin bucket MEDIA" }, 500);
      const ct = req.headers.get("content-type") || "application/octet-stream";
      // FLT-1007 c: ya no solo image/*; el Kit de venta trae audio, vídeo y PDF.
      const kind = fleetMediaKind(ct);
      if (!kind.ok) return json({ ok: false, error: kind.error }, 415);
      const buf = await req.arrayBuffer();
      if (!buf.byteLength) return json({ ok: false, error: "vacío" }, 400);
      if (buf.byteLength > FLEET_MEDIA_MAX) return json({ ok: false, error: "máx 80MB" }, 413);
      const rand = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, "0")).join("");
      const key = `fleet/${rand}.${kind.ext}`;
      // Se guarda el content-type REAL como metadata del objeto: GET /media/<key> lo
      // devuelve tal cual, así el navegador reproduce el audio/vídeo y abre el PDF.
      await env.MEDIA.put(key, buf, { httpMetadata: { contentType: kind.ct } });
      return json({ ok: true, url: `${url.origin}/media/${key}`, key, contentType: kind.ct });
    }
    // MANTENIMIENTO (sin gate, como el resto de /fleet/*): purga un objeto de R2 para
    // limpiar restos de prueba. Se acepta la URL pública, «/media/<key>», «media/<key>»
    // o el key pelado; y —salvaguarda del radio de daño en una operación irreversible—
    // solo se permite dentro de fleet/ (las pruebas/kit), nunca m/ (subidas de usuario)
    // ni shot/ (caché de miniaturas). Honesto: informa si el objeto existía o no.
    if (url.pathname === "/fleet/media/delete" && req.method === "POST") {
      if (!env.MEDIA) return json({ ok: false, error: "sin bucket MEDIA" }, 500);
      let b; try { b = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
      let key = String(b.path || b.key || "").trim();
      if (!key) return json({ ok: false, error: "path requerido" }, 400);
      try { if (/^https?:\/\//i.test(key)) key = new URL(key).pathname; } catch (e) {}
      key = key.replace(/^\/+/, "").replace(/^media\//, "");
      if (!/^fleet\//.test(key)) return json({ ok: false, error: "solo se purga dentro de fleet/<hash> (m/ y shot/ quedan fuera)" }, 400);
      const existed = await env.MEDIA.head(key);
      await env.MEDIA.delete(key);
      return json({ ok: true, key, existed: !!existed });
    }
    // Reparación quirúrgica para una misión que el contrato antiguo activó de
    // forma automática. Sólo desmonta el cascarón sintético si sigue intacto:
    // sin tareas iniciadas, eventos reales, progreso, informe ni prueba. La
    // segunda llamada es un no-op y nunca reencola trabajo ya ejecutado.
    if (url.pathname === "/fleet/batch/requeue-pristine" && req.method === "POST") {
      await ensureSchema(env);
      let b; try { b = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
      const mid = normalizeMissionReference(b.mission || b.id);
      if (!mid) return json({ ok: false, error: "mission requerida" }, 400);
      const result = await requeuePristineBatchMission(env, mid);
      if (!result.ok) return json(result, result.status || 409);
      return json(result);
    }
    // VÍA PARA AGENTES (sin gate Google): deja el INFORME del InfraAgente en yokup, para
    // que aparezca en /informes. Cierra la doctrina «toda tarea acaba en un informe».
    // Se guarda como una mission_task 'done' (code z1) con el report. Acepta FLT-<id> o el
    // número de encargo pelado. Carlos, 2026-07-15 (los agentes no cruzan el perímetro).
    if (url.pathname === "/fleet/informe" && req.method === "POST") {
      await ensureSchema(env);
      let b; try { b = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
      const mid = normalizeMissionReference(b.mission || b.id);
      const report = String(b.report || "").slice(0, 2000).trim();
      const owner = String(b.owner || "infraagente").slice(0, 24);
      const runtime = String(b.runtime || "").trim().slice(0, 20);
      const host = /^(app|cli)$/.test(String(b.host || "").trim()) ? String(b.host).trim() : "";
      // Captura de prueba OBLIGATORIA: una misión de flota no puede finalizar
      // sin el pantallazo real del trabajo realizado.
      const rawImage = String(b.image || "").trim();
      const normImage = normalizeProofImage(rawImage);
      if (!mid || !report) return json({ ok: false, error: "mission y report requeridos" }, 400);
      // Mismo criterio de prueba que /fleet/task-status, y con el motivo concreto:
      // «image requerido» no decía si faltaba o si el formato no valía (FLT-988 b2).
      if (!normImage.value) {
        return json({ ok: false, field: "image", error: rawImage
          ? "image no válida: " + normImage.error
          : "pantallazo image requerido para cerrar: manda la URL http(s) de la captura o un data:image/…;base64" }, 400);
      }
      const image = normImage.value;
      const t = await env.DB.prepare("SELECT id, assignee, status, source, screen FROM tickets WHERE id=?").bind(mid).first();
      if (!t) return json({ ok: false, error: "la misión " + mid + " no existe" }, 404);
      // AUTO-CLAIM en el ORIGEN: que llegue un informe prueba que se está trabajando;
      // una misión que seguía «open» (Pendiente rezagado) pasa YA a in_progress, aunque
      // luego resuelva o quede en firma cruzada. Cura de raíz del dato, no del rastro.
      if (t.source === "fleet" && t.status === "open") {
        await env.DB.prepare("UPDATE tickets SET status='in_progress', updated_at=? WHERE id=? AND status='open'").bind(Date.now(), mid).run().catch(() => {});
        t.status = "in_progress";
      }
      // GUARDIA anti-firma-cruzada (Carlos, 2026-07-21): el informe lo firma quien
      // EJECUTA (owner: subX/infraX) y debe ser la MISMA persona que el assignee de
      // la misión. Se compara la persona BASE, quitando el prefijo sub/infra. Si no
      // coincide, se MARCA como firma cruzada y NO se auto-cierra la misión.
      const _pbase = s => canonMachine(String(s || "").replace(/^(sub|infra)/i, ""));
      const assignee = String((t && t.assignee) || "").trim();
      const crossSign = !!(assignee && owner && _pbase(owner) !== _pbase(assignee));
      const now = Date.now();
      await env.DB.prepare(
        "INSERT INTO mission_tasks(mission_id,code,title,status,owner,report,image,updated_at) VALUES(?,?,?,?,?,?,?,?) " +
        "ON CONFLICT(mission_id,code) DO UPDATE SET report=excluded.report, status='done', owner=excluded.owner, image=COALESCE(excluded.image, mission_tasks.image), updated_at=excluded.updated_at"
      ).bind(mid, "z1", "Informe del InfraAgente", "done", owner, report, image || null, now).run();
      await env.DB.prepare(
        "UPDATE tickets SET proof_image=?,agent_runtime=COALESCE(NULLIF(?,''),agent_runtime),agent_host=COALESCE(NULLIF(?,''),agent_host),updated_at=? WHERE id=?"
      ).bind(image, runtime, host, now, mid).run();
      await addEvent(env, mid, "log", owner, "📝 Informe: " + report.slice(0, 240));
      await addEvent(env, mid, "proof", owner, "📸 Pantallazo final: " + proofLabel(image));
      let batch = null;
      if (crossSign) {
        // Firma cruzada: se conserva el informe pero se avisa y NO se cierra sola.
        await addEvent(env, mid, "log", owner, "⚠️ FIRMA CRUZADA: informe firmado por «" + owner + "» pero la misión es de «" + assignee + "». No se cierra automáticamente; requiere revisión.");
      } else {
        // El estado de la misión debe REFLEJAR su informe: al informar (con proof
        // obligatorio) la misión pasa a RESUELTA, y se avanza también el encargo del
        // bot-inbox (fuente del estado vía fleetSync) para que no reabra en el
        // siguiente sync. Antes quedaban descuadrados: informe hecho pero misión en
        // curso porque el ack era un segundo paso aparte. (Carlos, 2026-07-21)
        await env.DB.prepare("UPDATE tickets SET status='resolved', resolved_at=COALESCE(resolved_at,?), updated_at=? WHERE id=? AND status!='resolved'").bind(now, now, mid).run().catch(() => {});
        batch = await acceptBatchInformeClosure(env, t, mid, owner, report);
        // Nº de encargo REAL (fleet_ids → screen → FLT), no el pelado ingenuo: tras el
        // reparto anticolisión FLT-1005 podía cerrar el encargo #1005 inexistente en vez
        // del #991 del que nació, y el push «done» se perdía en silencio. (FLT-990 c)
        const numId = await fleetEncargoId(env, mid, t.screen);
        if (/^\d+$/.test(numId) && env.TELEGRAM) {
          try {
            await env.TELEGRAM.fetch(new Request("https://admira-telegram.csilvasantin.workers.dev/api/bot-inbox/bulk-status", {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ ids: [Number(numId)], status: "done", by: assignee || owner, note: "auto: informe con proof en yokup" })
            }));
          } catch (e) {}
        }
      }
      return json({ ok: true, mission: mid, resolved: !crossSign, cross_signed: crossSign, batch });
    }
    // CANCELAR una misión: reconocer que NO se hará. No exige pantallazo (no se finge
    // trabajo, se retira). Marca el ticket cancelled + nota, y cancela el encargo del
    // bot-inbox para que no se re-inyecte ni resucite. (Carlos, 2026-07-21)
    if (url.pathname === "/fleet/cancel" && req.method === "POST") {
      await ensureSchema(env);
      let b; try { b = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
      let mid = String(b.mission || b.id || "").trim();
      if (/^#?\d+$/.test(mid)) mid = "FLT-" + mid.replace(/^#/, "");
      const note = String(b.note || b.reason || "").slice(0, 300).trim();
      const by = String(b.by || "yokup").slice(0, 40);
      if (!mid) return json({ ok: false, error: "mission requerida" }, 400);
      const t = await env.DB.prepare("SELECT id,status,screen FROM tickets WHERE id=?").bind(mid).first();
      if (!t) return json({ ok: false, error: "la misión " + mid + " no existe" }, 404);
      const now = Date.now();
      await env.DB.prepare("UPDATE tickets SET status='cancelled', note=?, updated_at=?, resolved_at=NULL WHERE id=?").bind(note || null, now, mid).run();
      await addEvent(env, mid, "log", by, "🚫 Cancelada" + (note ? ": " + note : "") + ".");
      // Nº de encargo REAL (fleet_ids → screen → FLT): sin esto una cancelación cancelaba
      // el encargo equivocado tras el reparto anticolisión y la misión resucitaba. (FLT-990 c)
      const numId = await fleetEncargoId(env, mid, t.screen);
      if (/^\d+$/.test(numId) && env.TELEGRAM) {
        try {
          await env.TELEGRAM.fetch(new Request("https://admira-telegram.csilvasantin.workers.dev/api/bot-inbox/bulk-status", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ ids: [Number(numId)], status: "cancelled", by: by, note: note || "cancelada desde yokup" })
          }));
        } catch (e) {}
      }
      return json({ ok: true, mission: mid, cancelled: true });
    }
    // AVANCE POR PASOS visible: el agente marca su propia subtarea (a/b/c…) conforme
    // trabaja, para que el árbol se pinte SOLO y se vea la evolución. Igual que
    // /mission/<id>/task/<code>/status pero PÚBLICO (vía /fleet/*), porque los agentes
    // no cruzan la verja Google. El árbol recalcula si la misión arranca/concluye. (951)
    if (url.pathname === "/fleet/task-status" && req.method === "POST") {
      await ensureSchema(env);
      let b; try { b = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
      let mid = String(b.mission || b.id || "").trim();
      if (/^#?\d+$/.test(mid)) mid = "FLT-" + mid.replace(/^#/, "");
      const code = String(b.code || "").toLowerCase().trim();
      if (!mid || !validTaskCode(code)) return json({ ok: false, error: "mission y code válidos requeridos" }, 400);
      // 1) LA PRUEBA SE ACEPTA EN EL MISMO MOVIMIENTO DEL CIERRE (FLT-988 b2). Si el
      // formato no vale se dice, con 400 y motivo; nunca se descarta en silencio.
      let img = null;
      if (b.image != null && String(b.image).trim() !== "") {
        const norm = normalizeProofImage(b.image);
        if (!norm.value) {
          // applied:false como el otro 400 de este endpoint (FLT-988): un formato
          // inválido NO cambia nada, y quien llama debe saber que su marca no cuajó.
          return json({ ok: false, error: "image no válida: " + norm.error, field: "image", mission: mid, code, applied: false }, 400);
        }
        img = norm.value;
      }
      const tk = await env.DB.prepare("SELECT id,source,proof_image,status FROM tickets WHERE id=?").bind(mid).first();
      if (!tk) return json({ ok: false, error: "la misión " + mid + " no existe" }, 404);
      // AUTO-CLAIM en el ORIGEN: marcar un paso ES trabajar. Una misión que seguía «open»
      // (Pendiente rezagado) pasa YA a in_progress al primer task-status, sin esperar a
      // que el reconciliador por árbol la promueva. Cura de raíz del dato. (FLT-990 b/c)
      if (tk.source === "fleet" && tk.status === "open") {
        await env.DB.prepare("UPDATE tickets SET status='in_progress', updated_at=? WHERE id=? AND status='open'").bind(Date.now(), mid).run().catch(() => {});
        tk.status = "in_progress";
      }
      // La misión puede no tener árbol todavía (los planes se generan al abrirla en el
      // navegador). Para que la evolución se vea DESDE EL PRIMER paso, se siembra aquí
      // el plan por defecto (sin IA, instantáneo). (951)
      let tasks = await listMissionTasks(env, mid);
      if (!tasks.length && tk.source === "fleet") {
        await saveMissionPlan(env, mid, flattenSteps(defaultFleetPlan()));
        tasks = await listMissionTasks(env, mid);
      }
      const cur = tasks.find((t) => t.code === code);
      if (!cur) return json({ ok: false, error: "la misión " + mid + " no tiene la tarea «" + code + "» en su plan" }, 404);
      // 2) EL RECHAZO SE EXPLICA (FLT-988 b3). Si este marcado deja el árbol al 100%
      // y no hay prueba por ningún lado, se responde 400 con el motivo y NO se aplica.
      // Degradar la misión a «en curso» sin decir nada era la respuesta por defecto y
      // dejaba el tablero mintiendo (FLT-982/983/984, rematadas a mano en D1).
      const nextSt = TASK_STATUS.includes(b.status) ? b.status : cur.status;
      const cierraArbol = nextSt === "done" && tasks.every((t) => t.code === code || t.status === "done");
      if (cierraArbol && !img && !(tk.proof_image || await hasMissionProof(env, mid))) {
        return json({
          ok: false,
          error: "falta la prueba: con esta tarea el árbol de " + mid + " queda al 100%, y una misión de flota no finaliza sin pantallazo del trabajo.",
          hint: "repite esta misma llamada añadiendo «image» (URL http(s) de la captura o data:image/…;base64), o cierra con POST /fleet/informe.",
          field: "image", mission: mid, code, applied: false
        }, 400);
      }
      const row = await setTaskStatus(env, mid, code, b.status, b.report, b.owner || b.by, img);
      if (!row) return json({ ok: false, error: "no se pudo actualizar la tarea «" + code + "» de " + mid }, 500);
      // 3) LA PRUEBA DEL PASO ES LA PRUEBA DE LA MISIÓN. Sin este ascenso la captura se
      // quedaba en mission_tasks.image y la ficha salía sin prueba, así que había que
      // escribir tickets.proof_image aparte. Al cerrar manda la captura del cierre; en
      // un paso intermedio solo rellena el hueco si aún no había ninguna.
      if (img) {
        if (cierraArbol) {
          await env.DB.prepare("UPDATE tickets SET proof_image=?, updated_at=? WHERE id=?").bind(img, Date.now(), mid).run();
        } else {
          await env.DB.prepare("UPDATE tickets SET proof_image=COALESCE(NULLIF(proof_image,''),?), updated_at=? WHERE id=?").bind(img, Date.now(), mid).run();
        }
        await addEvent(env, mid, "proof", String(b.owner || b.by || "agente").slice(0, 40), "📸 Prueba de «" + code + "»: " + proofLabel(img));
      }
      const fleet = await fleetReconcileMission(env, mid);
      // CIERRE POR RESPALDO (FLT-989 b1): si el árbol cerró SIN «image» en esta
      // llamada pero hay captura en un paso anterior, la ficha se quedaría con el
      // logotipo de relleno. Se sube por el punto único, con el mismo criterio.
      if (!img && cierraArbol) await ascendMissionProof(env, mid);
      return json({ ok: true, task: row, proof: img, fleet });
    }
    // Ingesta UNIVERSAL de incidencias (Carlos, 2026-07-17): cualquier sistema,
    // monitor o agente reporta aquí y aparece en /incidencias. PÚBLICO (como
    // /fleet/informe). Body: {subject, resource, kind, project, severity, source,
    // detail, by}. Con {resolve:true, resource} cierra (recupera) la del recurso.
    if (url.pathname === "/incident" && req.method === "POST") {
      try {
        const b = await req.json().catch(() => ({}));
        if (b && b.resolve) {
          const rid = await resolveIncident(env, b.resource, b.by, b.detail);
          return json({ ok: true, resolved: rid });
        }
        if (!b || (!b.subject && !b.resource)) return json({ ok: false, error: "subject o resource requerido" }, 400);
        const id = await createIncident(env, b);
        return json({ ok: !!id, id });
      } catch (e) {
        return json({ ok: false, error: String(e) }, 500);
      }
    }
    if (url.pathname === "/fleet/plan" && req.method === "POST") {
      await ensureSchema(env);
      return json(await fleetPlanPending(env, url.searchParams.get("limit")));
    }
    // CARRIL DE AGENTE (abierto, como el resto de /fleet/*) para colgar una misión
    // HIJA de una misión MADRE existente — lo que por la web exige la verja Google
    // (FLT-990 b2). No crea misiones ni inventa agrupaciones: sólo enlaza dos que YA
    // existen. Body { child:"FLT-x", parent:"FLT-y" } cuelga x de y; parent:null la
    // desengancha y vuelve a plana.
    if (url.pathname === "/fleet/parent" && req.method === "POST") {
      await ensureSchema(env);
      let b; try { b = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
      try { return json(await fleetSetParent(env, b)); } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    if (url.pathname === "/fleet/reconcile" && req.method === "POST") {
      await ensureSchema(env);
      return json(await fleetReconcileAll(env));
    }
    // ── PROYECTOS ─────────────────────────────────────────────────────────────
    // Censo de proyectos y a qué máquinas/agentes toca cada uno. ABIERTO, en el
    // mismo carril que /fleet/* y /decisions y por el mismo motivo: los agentes
    // escriben desde el CLI y NO cruzan la verja de Google. El front de Equipo
    // lee y escribe por aquí igual que ellos.
    //   GET  /projects                  lista + asignaciones + misiones vivas
    //   POST /projects                  alta y edición (machines[]/agents[] reemplazan)
    //   POST /projects/delete           baja  {id}
    //   POST /projects/assign           asignar/quitar uno {project,kind,ref,remove?}
    //   POST /projects/order            orden de las fichas {ids:[...]} (arrastrar)
    //   POST /projects/mission          proyecto de una misión {mission,project}
    if (url.pathname === "/projects" && req.method === "GET") {
      try { return json({ ok: true, projects: await listProjects(env) }); }
      catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    if (url.pathname === "/projects" && req.method === "POST") {
      try {
        const b = await req.json().catch(() => ({}));
        const r = await upsertProject(env, b);
        return json(r, r.ok ? 200 : (r.status || 400));
      } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    if (url.pathname === "/projects/delete" && req.method === "POST") {
      try {
        await ensureSchema(env);
        const b = await req.json().catch(() => ({}));
        const id = projectSlug((b && b.id) || "");
        if (!id) return json({ ok: false, error: "id requerido" }, 400);
        const prev = await env.DB.prepare("SELECT id FROM projects WHERE id=?").bind(id).first();
        if (!prev) return json({ ok: false, error: "no existe" }, 404);
        await env.DB.prepare("DELETE FROM project_members WHERE project_id=?").bind(id).run();
        await env.DB.prepare("DELETE FROM projects WHERE id=?").bind(id).run();
        // Las misiones NO se quedan apuntando a un proyecto que ya no existe.
        await env.DB.prepare("UPDATE tickets SET project='' WHERE project=?").bind(id).run();
        return json({ ok: true, deleted: id });
      } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    if (url.pathname === "/projects/assign" && req.method === "POST") {
      try {
        await ensureSchema(env);
        const b = await req.json().catch(() => ({}));
        const idx = await projectIndex(env);
        const p = idx.get((b && b.project) || "");
        if (!p) return json({ ok: false, error: "project no existe en el censo" }, 404);
        const kind = String((b && b.kind) || "").toLowerCase() === "agent" ? "agent" : "machine";
        const ref = String((b && b.ref) || "").trim().slice(0, 80);
        if (!ref) return json({ ok: false, error: "ref requerido (id de máquina o de agente)" }, 400);
        if (b && b.remove) {
          await env.DB.prepare("DELETE FROM project_members WHERE project_id=? AND kind=? AND ref=?").bind(p.id, kind, ref).run();
        } else {
          await env.DB.prepare("INSERT OR IGNORE INTO project_members (project_id,kind,ref,added_at) VALUES (?,?,?,?)")
            .bind(p.id, kind, ref, Date.now()).run();
        }
        return json({ ok: true, project: (await listProjects(env)).find((x) => x.id === p.id) || null });
      } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    // ORDEN de las fichas. Llega la lista COMPLETA de ids tal y como han quedado
    // en pantalla y se numera 0,1,2… Se ignoran los ids que no existan (una ficha
    // borrada desde otra pestaña no debe tumbar el guardado entero), y si no queda
    // ninguno válido no se toca nada: mejor dejar el orden viejo que vaciarlo.
    if (url.pathname === "/projects/order" && req.method === "POST") {
      try {
        await ensureSchema(env);
        const b = await req.json().catch(() => ({}));
        const ids = Array.isArray(b && b.ids) ? b.ids.map((x) => projectSlug(x)).filter(Boolean) : [];
        if (!ids.length) return json({ ok: false, error: "ids requerido (array)" }, 400);
        const vivos = new Set(((await env.DB.prepare("SELECT id FROM projects").all()).results || []).map((r) => r.id));
        const orden = [...new Set(ids)].filter((id) => vivos.has(id));
        if (!orden.length) return json({ ok: false, error: "ningún id del censo" }, 404);
        // updated_at NO se toca: colocar una ficha no es editarla, y si se tocara
        // la ficha diría «editada ahora» cada vez que alguien la arrastra.
        for (let i = 0; i < orden.length; i++) {
          await env.DB.prepare("UPDATE projects SET sort_order=? WHERE id=?").bind(i, orden[i]).run();
        }
        return json({ ok: true, order: orden, projects: await listProjects(env) });
      } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    if (url.pathname === "/projects/mission" && req.method === "POST") {
      try {
        await ensureSchema(env);
        const b = await req.json().catch(() => ({}));
        const mid = normalizeMissionReference(b && b.mission);
        if (!mid) return json({ ok: false, error: "mission requerida" }, 400);
        const t = await env.DB.prepare("SELECT id FROM tickets WHERE id=?").bind(mid).first();
        if (!t) return json({ ok: false, error: "la misión " + mid + " no existe" }, 404);
        const raw = String((b && b.project) || "").trim();
        if (!raw) {   // quitar el proyecto es legítimo: mejor vacío que inventado
          await env.DB.prepare("UPDATE tickets SET project='' , updated_at=? WHERE id=?").bind(Date.now(), mid).run();
          return json({ ok: true, mission: mid, project: "", project_name: "" });
        }
        const idx = await projectIndex(env);
        const p = idx.get(raw);
        if (!p) return json({ ok: false, error: "el proyecto «" + raw + "» no está dado de alta; créalo en /equipo" }, 404);
        await env.DB.prepare("UPDATE tickets SET project=?, updated_at=? WHERE id=?").bind(p.id, Date.now(), mid).run();
        return json({ ok: true, mission: mid, project: p.id, project_name: p.name || p.id });
      } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    // CONTADORES DEL MENÚ SUPERIOR — PÚBLICO (agregados, sin dato sensible) para
    // que la barra los pinte en TODA página, con o sin sesión. Cache ~30s.
    if (url.pathname === "/menu/contadores" && req.method === "GET") {
      try {
        await ensureSchema(env);
        const c = await menuCounters(env);
        return new Response(JSON.stringify(Object.assign({ ok: true }, c)), {
          headers: { ...CORS, "content-type": "application/json", "Cache-Control": "public, max-age=30" }
        });
      } catch (e) {
        return json({ ok: false, error: String(e) }, 500);
      }
    }
    if (PROTECTED.has(url.pathname) || url.pathname.startsWith("/mission/")) {
      const sess = await requireAuth(env, req);
      if (!sess) return json({ error: "unauthorized" }, 401);
    }

    // ── EQUIPO: puente de ESCRITURA hacia admira-fleet ───────────────────────
    // La fuente de verdad del equipo (fichas de máquina + personas de silicio)
    // es el worker admira-fleet, compartido con admira.live/control. Su escritura
    // exige FLEET_TOKEN, que NO puede viajar al navegador → yokup-rtc firma en su
    // nombre después de validar la sesión Google del perímetro (rutas PROTECTED).
    if (url.pathname === "/equipo/machine" || url.pathname === "/equipo/silicon") {
      if (req.method !== "POST") return json({ error: "method" }, 405);
      const destino = url.pathname === "/equipo/machine" ? "/machines/profile" : "/silicon";
      try {
        const body = await req.json();
        // borrado: {delete:true, id} → DELETE en el registro remoto
        const del = body && body.delete === true;
        const ruta = del
          ? (destino === "/silicon" ? "/silicon/" : "/machines/profile/") + encodeURIComponent(String(body.id || ""))
          : destino;
        const r = await env.FLEET_SVC.fetch(new Request(FLEET_API + ruta, {
          method: del ? "DELETE" : "POST",
          headers: { "content-type": "application/json", authorization: "Bearer " + env.FLEET_TOKEN,
                     // admira-fleet va tras Cloudflare y RECHAZA user-agents no navegador (error 1010)
                     "user-agent": "Mozilla/5.0 (compatible; yokup-rtc)" },
          body: del ? undefined : JSON.stringify(body)
        }));
        const d = await r.json().catch(() => ({}));
        return json(d, r.status);
      } catch (e) {
        return json({ ok: false, error: String(e) }, 500);
      }
    }
    if (url.pathname.startsWith("/mission/")) {
      try {
        return await missionRoute(req, env, url);
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/fleet/nudge" && req.method === "POST") {
      let b; try { b = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
      try { return json(await fleetNudge(env, b)); } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    if (url.pathname === "/turn") {
      try {
        const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate`, {
          method: "POST",
          headers: { Authorization: `Bearer ${env.TURN_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ttl: 3600 })
        });
        return new Response(await r.text(), { headers: { ...CORS, "content-type": "application/json" } });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/incidents") {
      try {
        const r = await fetch("https://api.admira.store/signage/screens", { cf: { cacheTtl: 5 } });
        return new Response(await r.text(), { headers: { ...CORS, "content-type": "application/json" } });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/ai-triage") {
      const screen = url.searchParams.get("screen") || "una pantalla";
      const age = url.searchParams.get("age") || "?";
      const loc = url.searchParams.get("loc") || "";
      const text = await aiRun(env, `Eres el copiloto de soporte de Yokup (mantenimiento de pantallas DOOH). Incidencia: la pantalla "${screen}"${loc ? " en " + loc : ""} lleva ${age} segundos sin se\xF1al de emisi\xF3n (proof-of-play ca\xEDdo). Responde SOLO en espa\xF1ol, \xFAtil y concreto (m\xE1x 55 palabras), EXACTAMENTE en 3 l\xEDneas:
\u{1F50D} Causa probable: ...
\u{1F6E0}\uFE0F Acci\xF3n inmediata: ...
\u{1F477} T\xE9cnico: s\xED/no \u2014 motivo`, 170);
      return text ? json({ text }) : json({ error: "sin respuesta" }, 500);
    }
    if (url.pathname === "/tickets") {
      try {
        const scope = url.searchParams.get("scope") || "campo";
        // La bandeja de campo reconcilia pantallas; la de flota se nutre del sync
        // del bot-inbox (cron cada 2 min), no de las pantallas DOOH.
        if (scope !== "fleet") await reconcile(env);
        const limit = url.searchParams.get("limit"), offset = url.searchParams.get("offset");
        return json({ tickets: await listTickets(env, scope, limit, offset), stats: await stats(env, scope), roster: ROSTER });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/tasks/all") {
      try {
        await ensureSchema(env);
        const scope = url.searchParams.get("scope") || "todas";
        return json({ tasks: await listAllMissionTasks(env, scope) });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/ticket") {
      try {
        await ensureSchema(env);
        const id = url.searchParams.get("id");
        const t = await env.DB.prepare("SELECT * FROM tickets WHERE id=?").bind(id).first();
        if (!t) return json({ error: "not-found" }, 404);
        t.project_name = resolveProject(await projectIndex(env), t.project || "").name;
        const { results } = await env.DB.prepare("SELECT * FROM events WHERE ticket_id=? ORDER BY id ASC").bind(id).all();
        return json({ ticket: t, events: results || [] });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/ticket/note" && req.method === "POST") {
      try {
        const b = await req.json();
        await ensureSchema(env);
        await addEvent(env, b.id, "note", b.author || "T\xE9cnico", String(b.text || "").slice(0, 2e3));
        await env.DB.prepare("UPDATE tickets SET updated_at=?, status=CASE WHEN status='open' THEN 'in_progress' ELSE status END WHERE id=?").bind(Date.now(), b.id).run();
        return json({ ok: true });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    // CAMBIO DE ESTADO EN BLOQUE (Carlos, 2026-07-17): varias/todas las misiones a la vez
    // desde yokup.com/misiones, con UN SOLO aviso al grupo (no uno por misión). Actualiza
    // los tickets + baja el estado a los encargos de flota en bloque (/bot-inbox/bulk-status).
    if (url.pathname === "/tickets/status" && req.method === "POST") {
      try {
        const b = await req.json();
        await ensureSchema(env);
        const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map((x) => String(x)).filter(Boolean))] : [];
        const status = b.status;
        if (!ids.length || !["open", "in_progress", "resolved"].includes(status)) {
          return json({ ok: false, error: "ids (array) y status (open|in_progress|resolved) requeridos" }, 400);
        }
        if (status === "resolved") {
          const missing = [];
          const batchMissions = [];
          for (const id of ids) {
            const t = await env.DB.prepare("SELECT source FROM tickets WHERE id=?").bind(id).first();
            if (t && t.source === "fleet" && !(await hasMissionProof(env, id))) missing.push(id);
            if (t && t.source === "decision-batch") batchMissions.push(id);
          }
          if (missing.length) return json({
            ok: false,
            error: "No se puede finalizar sin pantallazo del trabajo realizado",
            missing_proof: missing
          }, 409);
          if (batchMissions.length) return json({
            ok: false,
            error: "Una misión de cola exige evidencia y aceptación del Agente; ciérrala individualmente.",
            requires_acceptance: batchMissions
          }, 409);
        }
        const now = Date.now();
        const resolvedAt = status === "resolved" ? now : null;
        const author = String(b.author || "Misiones (bloque)").slice(0, 40);
        const fleetInboxIds = [];
        let updated = 0;
        for (const id of ids) {
          await env.DB.prepare("UPDATE tickets SET status=?, updated_at=?, resolved_at=? WHERE id=?").bind(status, now, resolvedAt, id).run();
          await addEvent(env, id, "status", author, `Estado → ${status} (cambio en bloque)`);
          // La vía WEB sigue el MISMO criterio que la de agente (FLT-989 b2): al finalizar,
          // la prueba de respaldo asciende por el punto único (arriba ya se exigió, con
          // hasMissionProof, que la haya). Si no, la ficha saldría con el logotipo.
          if (status === "resolved") await ascendMissionProof(env, id);
          // Nº de encargo REAL (fleet_ids → screen → FLT): el cambio en bloque tocaba
          // el encargo equivocado tras el reparto anticolisión. (FLT-990 c)
          const iid = await fleetEncargoId(env, id);
          if (iid) fleetInboxIds.push(iid);
          updated++;
        }
        // UNA sola notificación al grupo + estados de encargo actualizados en bloque.
        if (fleetInboxIds.length && env.TELEGRAM) {
          const inboxStatus = status === "resolved" ? "done" : status === "in_progress" ? "in_progress" : "pending";
          try {
            await env.TELEGRAM.fetch(new Request("https://admira-telegram.csilvasantin.workers.dev/api/bot-inbox/bulk-status", {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ ids: fleetInboxIds, status: inboxStatus, by: author, note: "Cambio en bloque desde yokup.com/misiones." })
            }));
          } catch (e) {}
        }
        return json({ ok: true, updated });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    // PERSONALIZACIÓN del perímetro (Carlos, 2026-07-19): iconos/fotos por
    // agente y por ordenador, editados desde AJUSTES → Panel de control.
    // Un único doc JSON en prefs('customize'): {agents:{slug:{icon,img}},
    // machines:{slug:{icon,img}}}. LECTURA abierta (la consumen las listas);
    // ESCRITURA con sesión del perímetro (requireAuth inline: PROTECTED es por
    // ruta y capa los dos métodos, y el GET debe seguir abierto).
    // ── IDEAS / OBJETIVOS ──────────────────────────────────────────────────
    // Bandeja de ideas que consume www.yokup.com/objetivos (yokup-site/ideas.html).
    // Tabla D1 `ideas` (ya existente): id,title,body,author,tag,status,created_at,
    // updated_at,mission_id. Estados: nueva|estudio|hecha|mision|descartada.
    // RESCATE FLT (23-jul-2026): estas 4 rutas eran un deploy-sin-versionar y un
    // redeploy del repo las pisó; reimplementadas contra la tabla real y versionadas.
    // Lectura y escritura abiertas a propósito (el panel escribe sin login), igual
    // que /decisions. CORS lo aporta json()/CORS global.
    // GET /council/ticks — bitácora del cron del Consejo (FLT-1016), pública, JSON,
    // últimos 20 huecos. Para auditar franjas perdidas: cada fila dice si el hueco de
    // 3h parió idea (ok) o falló (con su error recortado). Lectura abierta, igual que
    // /ideas. `ok` viaja como booleano y `slot` como ISO para leerlo de un vistazo.
    if (url.pathname === "/council/ticks" && req.method === "GET") {
      try {
        await ensureCouncilTicksSchema(env);
        const r = await env.DB.prepare(
          "SELECT slot_start,seat,ok,error,at FROM council_ticks ORDER BY slot_start DESC LIMIT 20"
        ).all();
        const ticks = (r.results || []).map((t) => ({
          slot_start: t.slot_start,
          slot: new Date(t.slot_start).toISOString(),
          seat: t.seat || "",
          ok: !!t.ok,
          error: t.error || "",
          at: t.at
        }));
        return json({ ticks });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    // GET /worker/beats — bitácora de las rutinas del scheduled (FLT-1016 c), pública,
    // JSON. Una fila por rutina con su último resultado (ok/error/at/edad) + la fila
    // '__scheduled' (último disparo del cerrojo). Para auditar que la rutina corre por
    // latido HTTP aunque el cron esté muerto.
    if (url.pathname === "/worker/beats" && req.method === "GET") {
      try {
        await ensureWorkerBeatsSchema(env);
        const r = await env.DB.prepare(
          "SELECT routine,ok,error,at FROM worker_beats ORDER BY at DESC LIMIT 100"
        ).all();
        const beats = (r.results || []).map((b) => ({
          routine: b.routine,
          ok: !!b.ok,
          error: b.error || "",
          at: b.at,
          at_iso: b.at ? new Date(b.at).toISOString() : null,
          age_s: b.at ? Math.round((Date.now() - b.at) / 1e3) : null
        }));
        return json({ beats });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    if (url.pathname === "/ideas" && (req.method === "GET" || req.method === "POST")) {
      const IDEA_STATUS = /* @__PURE__ */ new Set(["nueva", "estudio", "hecha", "mision", "descartada"]);
      try {
        await ensureIdeasSchema(env);
        if (req.method === "GET") {
          const r = await env.DB.prepare("SELECT id,title,body,author,tag,status,created_at,updated_at,mission_id,seat,review,media,project,decision_id FROM ideas ORDER BY created_at DESC").all();
          const rows = r.results || [];
          // `review` y `media` viajan YA PARSEADOS como objeto (o null): el front los pinta directo.
          for (const it of rows) {
            if (it.review) { try { it.review = JSON.parse(it.review); } catch (e) { it.review = null; } } else it.review = null;
            if (it.media) { try { it.media = JSON.parse(it.media); } catch (e) { it.media = null; } } else it.media = null;
            it.project = it.project || "";
            it.decision_id = it.decision_id || "";
            // Idea→Decisión→Misión (LAZY): si la idea abrió un reloj y su tanda ya
            // materializó la misión, aquí pasa a «mision» con su mission_id. Sólo se
            // consulta para las que tienen decision_id y aún no son misión.
            if (it.decision_id && it.status !== "mision" && !it.mission_id) {
              try { const s = await syncIdeaFromDecision(env, it); it.status = s.status; it.mission_id = s.mission_id; } catch (e) {}
            }
          }
          return json({ ideas: rows });
        }
        const b = await req.json();
        const title = String(b.title || "").trim().slice(0, 200);
        if (!title) return json({ ok: false, error: "title requerido" }, 400);
        const body = String(b.body || "").trim().slice(0, 4000);
        const author = String(b.author || "").trim().slice(0, 60);
        const tag = String(b.tag || "").trim().slice(0, 40);
        // Silla del Consejo (opcional). Un valor fuera de las 8 se ignora → seat "".
        const seatIn = String(b.seat || "").trim().toLowerCase();
        const seat = IDEA_SEATS.has(seatIn) ? seatIn : "";
        // Proyecto del censo (opcional, FLT-1009). Se VALIDA contra el censo: un valor
        // suelto (id, nombre o dominio) se resuelve a su slug canónico; inválido → "".
        const projIn = String(b.project || b.projectSlug || "").trim();
        let project = "";
        if (projIn) { try { const p = (await projectIndex(env)).get(projIn); if (p) project = p.id; } catch (e) { project = ""; } }
        const now = Date.now();
        const id = "IDEA-" + (crypto.randomUUID().replace(/-/g, "").slice(0, 8));
        await env.DB.prepare("INSERT INTO ideas (id,title,body,author,tag,status,created_at,updated_at,mission_id,seat,project) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
          .bind(id, title, body, author, tag, "nueva", now, now, "", seat, project).run();
        return json({ ok: true, idea: { id, title, body, author, tag, status: "nueva", created_at: now, updated_at: now, mission_id: "", seat, project } });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    // (Re)asigna la silla del Consejo a una idea. seat "" (o inválido) la desasigna.
    if (url.pathname === "/ideas/seat" && req.method === "POST") {
      try {
        await ensureIdeasSchema(env);
        const b = await req.json();
        const id = String(b.id || "").trim();
        if (!id) return json({ ok: false, error: "id requerido" }, 400);
        const seatIn = String(b.seat || "").trim().toLowerCase();
        const seat = IDEA_SEATS.has(seatIn) ? seatIn : "";
        const r = await env.DB.prepare("UPDATE ideas SET seat=?, updated_at=? WHERE id=?").bind(seat, Date.now(), id).run();
        if (!r.meta || r.meta.changes === 0) return json({ ok: false, error: "not_found" }, 404);
        return json({ ok: true, id, seat });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    // POST /ideas/media {id, kind:audio|video|pdf|presentacion, url} — adjunta al Kit
    // de venta (FLT-1007) un activo generado en NotebookLM (audio/vídeo/PDF) o una
    // presentación del Generador de Presentaciones de AdmiraNeXT (FLT-1008, url del
    // deck compartible). Valida kind y url http(s). Fusiona sobre el media existente
    // (no pisa los otros). Devuelve la idea con media parseada.
    if (url.pathname === "/ideas/media" && req.method === "POST") {
      const MEDIA_KINDS = /* @__PURE__ */ new Set(["audio", "video", "pdf", "presentacion"]);
      try {
        await ensureIdeasSchema(env);
        const b = await req.json();
        const id = String(b.id || "").trim();
        if (!id) return json({ ok: false, error: "id requerido" }, 400);
        const kind = String(b.kind || "").trim().toLowerCase();
        if (!MEDIA_KINDS.has(kind)) return json({ ok: false, error: "kind inválido (audio|video|pdf|presentacion)" }, 400);
        const murl = String(b.url || "").trim().slice(0, 2000);
        if (!/^https?:\/\/\S+$/i.test(murl)) return json({ ok: false, error: "url http(s) requerida" }, 400);
        const idea = await env.DB.prepare("SELECT id,title,body,author,tag,status,created_at,updated_at,mission_id,seat,review,media FROM ideas WHERE id=?").bind(id).first();
        if (!idea) return json({ ok: false, error: "not_found" }, 404);
        let media = {};
        if (idea.media) { try { media = JSON.parse(idea.media) || {}; } catch (e) { media = {}; } }
        media[kind] = { url: murl, at: Date.now() };
        await env.DB.prepare("UPDATE ideas SET media=?, updated_at=? WHERE id=?").bind(JSON.stringify(media), Date.now(), id).run();
        idea.media = media;
        if (idea.review) { try { idea.review = JSON.parse(idea.review); } catch (e) { idea.review = null; } } else idea.review = null;
        return json({ ok: true, id, idea });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    // Progreso por silla: para cada una de las 8, sus ideas y —para las promovidas
    // (mission_id no vacío)— el progreso REAL de la misión leyendo tickets +
    // mission_tasks. Null-safe con las ideas viejas sin seat (caen en "" → sin silla).
    if (url.pathname === "/objetivos/progreso" && req.method === "GET") {
      try {
        await ensureIdeasSchema(env);
        const rows = (await env.DB.prepare("SELECT id,title,status,mission_id,seat FROM ideas ORDER BY created_at DESC").all()).results || [];
        // Cache de progreso por misión para no repetir consultas si dos ideas
        // apuntaran a la misma misión.
        const misCache = new Map();
        async function missionProgress(mid) {
          if (!mid) return { tasks_total: 0, tasks_done: 0, mission_status: null };
          if (misCache.has(mid)) return misCache.get(mid);
          let tasks_total = 0, tasks_done = 0, mission_status = null;
          try {
            const t = await env.DB.prepare("SELECT COUNT(*) total, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) done FROM mission_tasks WHERE mission_id=?").bind(mid).first();
            tasks_total = (t && t.total) || 0;
            tasks_done = (t && t.done) || 0;
          } catch (e) {}
          try {
            const tk = await env.DB.prepare("SELECT status FROM tickets WHERE id=?").bind(mid).first();
            mission_status = tk ? (tk.status || null) : null;
          } catch (e) {}
          const out = { tasks_total, tasks_done, mission_status };
          misCache.set(mid, out);
          return out;
        }
        const bySeat = new Map();
        for (const s of IDEA_SEATS) bySeat.set(s, []);
        const unseated = [];
        for (const it of rows) {
          const seat = IDEA_SEATS.has(String(it.seat || "").toLowerCase()) ? String(it.seat).toLowerCase() : "";
          const mid = String(it.mission_id || "");
          const prog = mid ? await missionProgress(mid) : { tasks_total: 0, tasks_done: 0, mission_status: null };
          const entry = { id: it.id, title: it.title, status: it.status, mission_id: mid,
            tasks_total: prog.tasks_total, tasks_done: prog.tasks_done, mission_status: prog.mission_status };
          (seat ? bySeat.get(seat) : unseated).push(entry);
        }
        const seats = [...IDEA_SEATS].map((seat) => {
          const ideas = bySeat.get(seat) || [];
          const missions = ideas.filter((x) => x.mission_id).length;
          const tasks_total = ideas.reduce((a, x) => a + (x.tasks_total || 0), 0);
          const tasks_done = ideas.reduce((a, x) => a + (x.tasks_done || 0), 0);
          return { seat, ideas, ideas_count: ideas.length, missions, tasks_total, tasks_done };
        });
        return json({ ok: true, seats, unseated, unseated_count: unseated.length });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    if (url.pathname === "/ideas/status" && req.method === "POST") {
      const IDEA_STATUS = /* @__PURE__ */ new Set(["nueva", "estudio", "hecha", "mision", "descartada"]);
      try {
        const b = await req.json();
        const id = String(b.id || "").trim();
        const status = String(b.status || "").trim();
        if (!id) return json({ ok: false, error: "id requerido" }, 400);
        if (!IDEA_STATUS.has(status)) return json({ ok: false, error: "status inválido" }, 400);
        await ensureIdeasSchema(env);
        // El cambio de estado es lo prioritario: se hace SIEMPRE y primero.
        const r = await env.DB.prepare("UPDATE ideas SET status=?, updated_at=? WHERE id=?").bind(status, Date.now(), id).run();
        if (!r.meta || r.meta.changes === 0) return json({ ok: false, error: "not_found" }, 404);
        // Al pasar a «estudio», el Consejo delibera UNA vez (idempotente: solo si la
        // idea no tiene ya review). El handler `fetch(req,env)` NO recibe ctx, así que
        // no hay waitUntil: generamos INLINE con aiRunRaw (una sola llamada, rápida) y
        // devolvemos la review en la respuesta. Es best-effort — el estado ya quedó
        // guardado arriba; si la IA falla, la idea queda en estudio sin review y
        // POST /ideas/review la regenera bajo demanda. Nunca tumba el cambio de estado.
        let review = null;
        if (status === "estudio") {
          try {
            const idea = await env.DB.prepare("SELECT id,title,body,author,seat,review FROM ideas WHERE id=?").bind(id).first();
            if (idea && !idea.review) review = await generateCouncilReview(env, idea);
            else if (idea && idea.review) { try { review = JSON.parse(idea.review); } catch (e) {} }
          } catch (e) { review = null; }
        }
        return json({ ok: true, id, status, review });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    // POST /ideas/review {id} — (re)genera la deliberación del Consejo bajo demanda.
    // Sirve cuando la IA falló al pasar a estudio, o para refrescarla. Regenera aunque
    // ya exista (así el botón «regenerar» tiene sentido). Devuelve la review creada.
    if (url.pathname === "/ideas/review" && req.method === "POST") {
      try {
        await ensureIdeasSchema(env);
        const b = await req.json();
        const id = String(b.id || "").trim();
        if (!id) return json({ ok: false, error: "id requerido" }, 400);
        const idea = await env.DB.prepare("SELECT id,title,body,author,seat FROM ideas WHERE id=?").bind(id).first();
        if (!idea) return json({ ok: false, error: "not_found" }, 404);
        const review = await generateCouncilReview(env, idea);
        if (!review) return json({ ok: false, error: "la IA no devolvió una deliberación usable; reintenta" }, 502);
        return json({ ok: true, id, review });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    // Borra una idea DE VERDAD (la cruz de las fichas de /objetivos·/ideas).
    // Destructivo e irreversible por diseño: el panel muestra un confirm() con el
    // título antes de llamar. 404 si el id no existe. Mismo estilo json()/CORS.
    if (url.pathname === "/ideas/delete" && req.method === "POST") {
      try {
        const b = await req.json();
        const id = String(b.id || "").trim();
        if (!id) return json({ ok: false, error: "id requerido" }, 400);
        const r = await env.DB.prepare("DELETE FROM ideas WHERE id=?").bind(id).run();
        if (!r.meta || r.meta.changes === 0) return json({ ok: false, error: "not_found" }, 404);
        return json({ ok: true, id, deleted: true });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    if (url.pathname === "/ideas/promote" && req.method === "POST") {
      try {
        const b = await req.json();
        const id = String(b.id || "").trim();
        const mission_id = String(b.mission_id || "").trim().slice(0, 40);
        if (!id) return json({ ok: false, error: "id requerido" }, 400);
        if (!mission_id) return json({ ok: false, error: "mission_id requerido" }, 400);
        const r = await env.DB.prepare("UPDATE ideas SET mission_id=?, status='mision', updated_at=? WHERE id=?").bind(mission_id, Date.now(), id).run();
        if (!r.meta || r.meta.changes === 0) return json({ ok: false, error: "not_found" }, 404);
        return json({ ok: true, id, mission_id, status: "mision" });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    // POST /ideas/decide {id} — convierte la idea/objetivo en una VENTANA DE DECISIÓN
    // de 3 minutos con las 5 MEJORES opciones para EJECUTARLA (generadas por Workers
    // AI, ordenadas de más a menos adecuada) + «Volver atrás». Si nadie elige, la
    // maquinaria de relojes tira con la recomendada (la 1ª). Abre la decisión por la
    // función interna openInitialMissionDecision (mismos guardas que POST /decisions),
    // bajo el agente de ideas NeoMini·Mac Mini y el proyecto de la idea si está
    // censado Y asignado, o el de respaldo «Yokup · ideas-objetivos». IDEMPOTENTE: si
    // la idea ya tiene una decisión VIVA (pending sin vencer), devuelve esa. NO rompe
    // POST /ideas/promote (sigue existiendo para enlazar una misión a mano).
    if (url.pathname === "/ideas/decide" && req.method === "POST") {
      try {
        await ensureIdeasSchema(env);
        const b = await req.json();
        const id = String(b.id || "").trim();
        if (!id) return json({ ok: false, error: "id requerido" }, 400);
        const idea = await env.DB.prepare("SELECT id,title,body,author,seat,review,project,status,mission_id,decision_id FROM ideas WHERE id=?").bind(id).first();
        if (!idea) return json({ ok: false, error: "not_found" }, 404);
        // Idempotencia: una decisión viva (pending sin vencer) → devolvemos la existente.
        if (idea.decision_id) {
          const prev = await env.DB.prepare("SELECT id,status,deadline FROM decisions WHERE id=?").bind(idea.decision_id).first();
          if (prev && prev.status === "pending" && prev.deadline > Date.now()) {
            return json({ ok: true, id, decision_id: prev.id, existing: true, deadline: prev.deadline,
                          secondsLeft: Math.max(0, Math.round((prev.deadline - Date.now()) / 1000)), url: DECIDE_URL });
          }
        }
        // Proyecto del reloj: el de la idea SÓLO si está censado Y asignado a
        // NeoMini+Mac Mini; si no (o la idea no tiene proyecto), el de respaldo.
        const idx = await projectIndex(env);
        let proj = idea.project ? idx.get(idea.project) : null;
        if (proj) {
          const a = await exactDecisionProjectAssignment(env, DECIDE_AGENT, DECIDE_MACHINE, proj.id);
          if (!a || String(a.id) !== String(proj.id)) proj = null;   // censado pero no asignado → respaldo
        }
        if (!proj) proj = idx.get(DECIDE_FALLBACK_PROJECT);
        if (!proj) return json({ ok: false, error: "falta el proyecto de respaldo censado (yokup-ideas-objetivos)" }, 500);
        // 5 mejores opciones para EJECUTAR la idea (IA), ordenadas de más a menos adecuada.
        const options = await generateDecideOptions(env, idea, proj.name);
        if (!options) return json({ ok: false, error: "la IA no devolvió 5 opciones usables; reintenta" }, 502);
        const res = await openInitialMissionDecision(env, {
          question: idea.title,
          options: buildDecideDecisionOptions(options),   // 5 opciones + «Volver atrás»
          recommended: 0,                                 // la 1ª es la más adecuada
          minutes: 3,
          url: DECIDE_URL,
          surface: "web",
          mission: idea.id,                               // traza reversa decisión→idea
          agent: DECIDE_AGENT, machine: DECIDE_MACHINE,
          project: proj.name, project_slug: decisionProjectSlug(proj.name),
          project_id: proj.id, project_web: proj.web || ""
        });
        if (!res.ok) {
          // Candado del modelo: un reloj vivo del agente de ideas → no se abre otro.
          if (res.error === "live_decision") {
            return json({ ok: false, error: "live_decision", existing: res.existing, deadline: res.deadline,
                          secondsLeft: res.secondsLeft, url: DECIDE_URL }, 409);
          }
          return json({ ok: false, error: res.error, code: res.code }, res.status || 400);
        }
        await env.DB.prepare("UPDATE ideas SET decision_id=?, updated_at=? WHERE id=?").bind(res.id, Date.now(), id).run();
        return json({ ok: true, id, decision_id: res.id, options, recommended: 0,
                      deadline: res.deadline, secondsLeft: Math.max(0, Math.round((res.deadline - Date.now()) / 1000)),
                      project: res.project, url: DECIDE_URL });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    // POST /ideas/generate {seat?,topic?,project?} — genera una idea del Consejo BAJO
    // DEMANDA (el botón «✨ Idea nueva»). Sin seat → silla ALEATORIA; con seat válido → esa.
    // `topic` opcional (string corto): si viene, la idea nace CENTRADA en ese tema,
    // manteniendo la voz del punto fuerte de la silla. `project` opcional (slug del
    // censo): fuerza el proyecto de la idea. Sin tema NI project, se sortea un proyecto
    // del censo con web (FLT-1009). El cron NO pasa nada (libre → proyecto al azar).
    // Misma generación, firma «ROL · alias», tag=consejo y guardado que el cron.
    // Devuelve la idea creada. Mismo estilo json()/CORS.
    if (url.pathname === "/ideas/generate" && req.method === "POST") {
      try {
        await ensureIdeasSchema(env);
        let b = {}; try { b = await req.json(); } catch (e) {}
        let seat = String(b && b.seat || "").trim().toLowerCase();
        if (!IDEA_SEATS.has(seat)) seat = COUNCIL_ORDER[Math.floor(Math.random() * COUNCIL_ORDER.length)];
        const topic = String(b && b.topic || "").trim();
        const projectHint = String(b && b.project || "").trim();
        // FLT-1017: `preview` devuelve el borrador sin guardarlo (lo pide /objetivos
        // para rellenar el formulario). Sin la bandera, todo sigue igual que antes.
        const preview = !!(b && (b.preview || b.dry_run));
        const idea = await generateCouncilIdea(env, seat, topic, projectHint, !preview);
        if (!idea) return json({ ok: false, error: "la IA no devolvió una idea usable; reintenta" }, 502);
        return json({ ok: true, idea });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    // ── RELOJES DE DECISIÓN ────────────────────────────────────────────────
    // POST /decisions            (agente) publica una única tanda diaria: 5 misiones + volver atrás
    // GET  /decisions            (panel /misiones) lista las vivas + recién cerradas
    // POST /decisions/<id>/choose (Carlos) elige una opción
    // GET  /decisions/<id>       (agente) consulta el desenlace
    // Lectura abierta (el panel la pinta); publicar y elegir NO piden sesión a
    // propósito: los agentes publican desde el CLI sin login de navegador.
    if (url.pathname === "/decisions" && req.method === "POST") {
      try {
        await ensureSchema(env);
        const b = await req.json();
        // La ventana inicial mantiene cinco caminos + salida. Una continuación
        // enlazada al mismo batch acepta únicamente las 1..5 misiones que aún
        // quedan en cola + la salida terminal.
        const rawOpts = Array.isArray(b.options) ? b.options : [];
        const opts = rawOpts.slice(0, 6).map((o) => String(o).slice(0, 160));
        const q = String(b.question || "").trim().slice(0, 400);
        let dparent = String(b.parent_decision || "").trim().slice(0, 80);
        let dbatch = String(b.batch_id || "").trim().slice(0, 80);
        let parent = null;
        const continuation = !!(dparent || dbatch);
        if (!q || rawOpts.length !== opts.length || (continuation ? !isContinuationMissionDecision(opts, { parent_decision: dparent || "linked" }) : !isInitialMissionDecision(opts))) {
          return json({ ok: false, error: continuation ? "La continuación requiere entre 1 y 5 misiones restantes y «Volver atrás» al final" : "La decisión inicial requiere exactamente 5 misiones y «Volver atrás» como sexta opción" }, 400);
        }
        if (continuation) {
          parent = dparent ? await env.DB.prepare("SELECT id,batch_id,options,agent,machine,project,project_slug FROM decisions WHERE id=?").bind(dparent).first() : null;
          if (dparent && !parent) return json({ ok: false, error: "parent_decision no existe" }, 404);
          const inferredBatch = parent && (parent.batch_id || batchIdForDecision(parent.id));
          if (dbatch && inferredBatch && dbatch !== inferredBatch) return json({ ok: false, error: "parent_decision y batch_id no coinciden" }, 400);
          dbatch = dbatch || inferredBatch || "";
          const batch = dbatch && await env.DB.prepare("SELECT id,decision_id,status FROM mission_batches WHERE id=?").bind(dbatch).first();
          if (!batch || batch.status !== "awaiting_continuation") {
            return json({ ok: false, error: "batch_id awaiting_continuation requerido" }, 400);
          }
          dparent = dparent || batch.decision_id || "";
          if (!parent && dparent) parent = await env.DB.prepare("SELECT id,batch_id,options,agent,machine,project,project_slug FROM decisions WHERE id=?").bind(dparent).first();
          const open = await env.DB.prepare("SELECT id FROM decisions WHERE batch_id=? AND status='pending' LIMIT 1").bind(dbatch).first();
          if (open) return json({ ok: false, error: "continuation_pending", existing: open.id }, 409);
          const queued = await reconcileQueuedBatchItems(env, dbatch);
          if (!continuationMissionOrder(opts, 0, queued).length) {
            return json({ ok: false, error: "Las opciones deben coincidir exactamente con las misiones restantes del batch, sin completadas ni duplicados" }, 400);
          }
        }
        const rawAgent = String(b.agent || "").trim().slice(0, 40);
        const rawMachine = String(b.machine || "").trim().slice(0, 60);
        const decisionIdentity = resolveDecisionIdentity(rawAgent, rawMachine);
        if (!decisionIdentity.ok) {
          return json({ ok: false, error: decisionIdentity.error, code: "exact_identity_required" }, 400);
        }
        const decisionInput = { ...b, agent: decisionIdentity.agent, machine: decisionIdentity.machine };
        // Cuando agent+machine participa en varios proyectos, la raíz debe
        // seleccionar uno por id. Las continuaciones heredan el id ya
        // autorizado de su decisión raíz. Una selección ajena falla cerrado.
        const requestedProjectId = String(b.project_id || (continuation && parent ? parent.project : "")).trim().slice(0, 120);
        const assignment = await exactDecisionProjectAssignment(
          env, decisionIdentity.agent, decisionIdentity.machine, requestedProjectId
        );
        let inherited = null;
        if (continuation && parent) {
          const pidx = await projectIndex(env);
          const rootProject = resolveProject(pidx, parent.project || "");
          inherited = { agent: parent.agent, machine: parent.machine, project_id: rootProject.id, project: rootProject.name, project_slug: parent.project_slug || "" };
        }
        const projectContext = resolveDecisionProject(decisionInput, assignment, inherited);
        if (!projectContext.ok) return json({ ok: false, error: projectContext.error, code: "exact_project_required" }, 400);
        const mins = Math.min(60, Math.max(1, +b.minutes || 3));   // por defecto 3 min
        const now = Date.now();
        const agent = projectContext.agent;
        const machine = projectContext.machine;
        // UN RELOJ VIVO A LA VEZ POR AGENTE (FLT-982 b3, sustituye a `daily_limit`).
        // La regla vieja era «uno al día por agente»: el segundo reloj de la jornada
        // se rechazaba con {error:"daily_limit"}. Eso hacía IMPOSIBLE el protocolo
        // que fijó Carlos —abrir una ventana de 5 minutos al cerrar CADA misión—,
        // porque la segunda misión del día ya no podía preguntar nada.
        // Ahora sólo estorba un reloj que siga VIVO: pending y sin vencer. Vencido
        // (deadline pasado, lo marque o no el cron), decidido o cancelado → vía libre.
        const live = await env.DB.prepare(
          "SELECT id,deadline FROM decisions WHERE lower(agent)=lower(?) AND status='pending' AND deadline > ? ORDER BY created_at DESC LIMIT 1"
        ).bind(agent, now).first();
        const userOverride = b.user_override === true;
        if (live && !userOverride && !continuation) {
          return json({ ok: false, error: "live_decision", existing: live.id, deadline: live.deadline,
                        secondsLeft: Math.max(0, Math.round((live.deadline - now) / 1000)) }, 409);
        }
        const id = "DEC-" + now.toString(36) + Math.random().toString(36).slice(2, 6);
        // mission/url son metadatos. El proyecto ya fue validado contra la
        // intersección canónica projects+project_members; jamás se hereda del
        // último ticket o trabajo.
        const durl = String(b.url || "").slice(0, 300);
        const dmission = String(b.mission || "").slice(0, 120);
        const dproject = projectContext.project_id;
        const dprojectSlug = projectContext.project_slug;
        await env.DB.prepare("INSERT INTO decisions (id,machine,agent,surface,question,options,recommended,status,created_at,deadline,url,mission,project,project_slug,parent_decision,batch_id) VALUES (?,?,?,?,?,?,?,'pending',?,?,?,?,?,?,?,?)")
          .bind(id, machine, agent,
                String(b.surface || "").slice(0, 20), q, JSON.stringify(opts),
                Math.max(0, Math.min(opts.length - 1, +b.recommended || 0)), now, now + mins * 60000,
                durl, dmission, dproject, dprojectSlug, dparent, dbatch).run();
        return json({ ok: true, id, deadline: now + mins * 60000, project: projectContext.project, project_id: dproject, project_slug: dprojectSlug, parent_decision: dparent, batch_id: dbatch, continuation, user_override: userOverride });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    if (url.pathname === "/decisions" && req.method === "GET") {
      try {
        const now = Date.now();
        // El cambio de estado es una sola query y debe verse en esta respuesta.
        // Materializar/reordenar tandas puede tocar decenas de filas: sigue
        // garantizado por cron y se completa en background, sin bloquear la UI.
        await expireDecisions(env);
        if (ctx && typeof ctx.waitUntil === "function") {
          ctx.waitUntil(startDecisionBatches(env).catch(() => {}));
        }
        // HISTÓRICO (FLT-982 b2). Hasta ahora esto sólo devolvía las vivas y las
        // cerradas de la última hora, e IGNORABA cualquier parámetro: la página
        // /decisiones tenía que guardarse el pasado en localStorage de cada
        // navegador. Parámetros admitidos (todos opcionales; sin ninguno el
        // comportamiento es EXACTAMENTE el de antes, para no romper a nadie):
        //   ?all=1            → sin la ventana de 1 h: todo el histórico
        //   ?since=<ms>       → sólo desde ese epoch (implica all)
        //   ?until=<ms>       → sólo hasta ese epoch (paginación hacia atrás)
        //   ?limit=<1..500>   → tamaño de página (40 por defecto)
        //   ?agent=<nombre>   → filtra por agente (case-insensitive)
        //   ?status=<a,b>     → pending|decided|expired|cancelled, coma-separados
        const qp = url.searchParams;
        const num = (k) => { const v = qp.get(k); return v == null || v === "" ? null : (Number.isFinite(+v) ? +v : null); };
        const since = num("since");
        const until = num("until");
        const all = qp.get("all") === "1" || qp.get("all") === "true" || since !== null || until !== null;
        const limit = Math.min(500, Math.max(1, num("limit") || 40));
        const agentQ = String(qp.get("agent") || "").trim().slice(0, 40);
        const statusQ = String(qp.get("status") || "").split(",").map((s) => s.trim().toLowerCase())
          .filter((s) => ["pending", "decided", "expired", "cancelled"].includes(s));
        const where = [], binds = [];
        // Ventana por defecto: vivas + cerradas de la última hora (lo de siempre).
        if (!all) { where.push("(status='pending' OR decided_at > ? OR deadline > ?)"); binds.push(now - 3600000, now - 3600000); }
        if (since !== null) { where.push("created_at >= ?"); binds.push(since); }
        if (until !== null) { where.push("created_at <= ?"); binds.push(until); }
        if (agentQ) { where.push("lower(agent)=lower(?)"); binds.push(agentQ); }
        if (statusQ.length) { where.push(`status IN (${statusQ.map(() => "?").join(",")})`); binds.push(...statusQ); }
        const sql = "SELECT * FROM decisions" + (where.length ? " WHERE " + where.join(" AND ") : "")
          + " ORDER BY created_at DESC LIMIT ?";
        const r = await env.DB.prepare(sql).bind(...binds, limit).all();
        // Proyecto: se resuelve al NOMBRE del censo (una consulta para toda la
        // página). Una decisión sin proyecto propio hereda el de su misión —de
        // ahí salía el «Proyecto sin identificar» de la ficha— y si no hay
        // ninguno se devuelve vacío, para que el front diga «Sin proyecto».
        const pidxG = await projectIndex(env);
        const misIds = [...new Set((r.results || []).map((d) => String(d.mission || "").toUpperCase()).filter(Boolean))];
        const misProj = {};
        if (misIds.length) {
          const tks = await selectIn(env, misIds, (ph) => `SELECT id, project FROM tickets WHERE id IN (${ph})`);
          for (const t of tks || []) if (t.project) misProj[t.id] = t.project;
        }
        const parsed = (r.results || []).map((d) => {
          let options = []; try { options = JSON.parse(d.options || "[]"); } catch (e) {}
          return { d, options };
        });
        const batchIds = parsed.slice(0, 40)
          .filter(({ d, options }) => isMissionDecision(options, d))
          .map(({ d }) => d.batch_id || batchIdForDecision(d.id));
        const batchMap = await missionBatchSnapshots(env, batchIds);
        const items = parsed.map(({ d, options: o }, i) => {
          const legacyProject = d.status === "pending" ? (d.project || "")
            : (d.project || misProj[String(d.mission || "").toUpperCase()] || "");
          const resolvedProject = resolveProject(pidxG, legacyProject);
          // El carrusel sigue limitado a las primeras 40 fichas, pero sale del
          // mapa precargado de la página, no de 3 queries por decisión.
          const batch = (i < 40 && isMissionDecision(o, d))
            ? (batchMap.get(d.batch_id || batchIdForDecision(d.id)) || null) : null;
          return { id: d.id, machine: d.machine, agent: d.agent, surface: d.surface, question: d.question,
                   options: o, recommended: d.recommended, status: d.status, chosen: d.chosen,
                   // QUIÉN decidió: lo escribe /decisions/<id>/choose desde siempre,
                   // pero nunca salía por aquí, así que el histórico no podía
                   // distinguir «lo eligió Carlos» de «venció y tiró la recomendada».
                   chosen_by: d.chosen_by || "",
                   url: d.url || "", mission: d.mission || "",
                   project: resolvedProject.name, project_id: resolvedProject.id,
                   project_slug: d.project_slug || "",
                   parent_decision: d.parent_decision || "", batch_id: d.batch_id || "",
                   batch,
                   created_at: d.created_at, deadline: d.deadline, decided_at: d.decided_at,
                   secondsLeft: Math.max(0, Math.round((d.deadline - now) / 1000)) };
        });
        // `query` devuelve lo que REALMENTE se aplicó (un ?limit=9999 se recorta a
        // 500) y `next_until` da el cursor para pedir la página siguiente hacia
        // atrás: &until=<next_until-1>. null = no hay más.
        return json({ ok: true, items, count: items.length,
                      query: { all, since, until, limit, agent: agentQ || null, status: statusQ.length ? statusQ : null },
                      next_until: items.length === limit ? items[items.length - 1].created_at : null });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    if (/^\/decisions\/[^/]+\/choose$/.test(url.pathname) && req.method === "POST") {
      try {
        await ensureSchema(env);
        const id = decodeURIComponent(url.pathname.split("/")[2]);
        const b = await req.json();
        const idx = +b.choice;
        const d = await env.DB.prepare("SELECT * FROM decisions WHERE id=?").bind(id).first();
        if (!d) return json({ ok: false, error: "not_found" }, 404);
        if (d.status !== "pending") return json({ ok: false, error: "decision_closed", status: d.status, chosen: d.chosen }, 409);
        let o = []; try { o = JSON.parse(d.options || "[]"); } catch (e) {}
        if (!(idx >= 0 && idx < o.length)) return json({ ok: false, error: "choice fuera de rango" }, 400);
        const back = idx === o.length - 1 && isMissionDecision(o, d);
        await env.DB.prepare("UPDATE decisions SET status=?, chosen=?, chosen_by=?, decided_at=? WHERE id=?")
          .bind(back ? "cancelled" : "decided", idx, String(b.by || "Carlos").slice(0, 40), Date.now(), id).run();
        const chosen = await env.DB.prepare("SELECT * FROM decisions WHERE id=?").bind(id).first();
        const batch = back ? null : await ensureMissionBatchFromDecision(env, chosen);
        return json({ ok: true, id, chosen: idx, option: o[idx], cancelled: back, batch });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    if (/^\/decisions\/[^/]+$/.test(url.pathname) && req.method === "GET") {
      try {
        await ensureSchema(env);
        const id = decodeURIComponent(url.pathname.split("/")[2]);
        let d = await env.DB.prepare("SELECT * FROM decisions WHERE id=?").bind(id).first();
        if (!d) return json({ ok: false, error: "not_found" }, 404);
        if (d.status === "pending" && d.deadline < Date.now()) {
          await env.DB.prepare("UPDATE decisions SET status='expired' WHERE id=? AND status='pending'").bind(id).run();
          d = await env.DB.prepare("SELECT * FROM decisions WHERE id=?").bind(id).first();
        }
        let o = []; try { o = JSON.parse(d.options || "[]"); } catch (e) {}
        const now = Date.now();
        const batch = await ensureMissionBatchFromDecision(env, d);
        const expired = d.status === "expired";
        const pOne = resolveProject(await projectIndex(env), d.project || "");
        return json({ ok: true, id: d.id, status: d.status,
                      chosen: d.chosen, recommended: d.recommended, options: o,
                      project: pOne.name, project_id: pOne.id, project_slug: d.project_slug || "", mission: d.mission || "", url: d.url || "",
                      parent_decision: d.parent_decision || "", batch_id: d.batch_id || "",
                      // si venció sin respuesta, el agente tira con la recomendada
                      effective: d.status === "decided" || d.status === "cancelled" ? d.chosen : (expired ? d.recommended : null),
                      batch,
                      secondsLeft: Math.max(0, Math.round((d.deadline - now) / 1000)) });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    if (url.pathname === "/prefs/customize" && req.method === "GET") {
      try {
        await ensureSchema(env);
        const row = await env.DB.prepare("SELECT value FROM prefs WHERE key='customize'").first();
        let c = {};
        try { c = row && row.value ? JSON.parse(row.value) : {}; } catch (e) {}
        return json({ ok: true, customize: c });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/prefs/customize" && req.method === "POST") {
      try {
        const sess = await requireAuth(env, req);
        if (!sess) return json({ error: "unauthorized" }, 401);
        const b = await req.json();
        const c = b && b.customize && typeof b.customize === "object" ? b.customize : null;
        if (!c) return json({ ok: false, error: "customize (objeto) requerido" }, 400);
        const v = JSON.stringify(c);
        if (v.length > 1e5) return json({ ok: false, error: "customize demasiado grande" }, 413);
        await ensureSchema(env);
        await env.DB.prepare("INSERT INTO prefs (key,value,updated_at) VALUES ('customize',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(v, Date.now()).run();
        return json({ ok: true });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    // ELIMINAR misiones (Carlos, 2026-07-19): borrado REAL de ticket + eventos +
    // tareas, en bloque. La UI exige doble confirmación; aquí el cinturón es el
    // campo confirm:"ELIMINAR" obligatorio. Si la misión venía de FLOTA, su
    // encargo del bot-inbox se marca done (nota «eliminada») para que
    // /fleet/sync no la resucite en el siguiente ciclo.
    if (url.pathname === "/tickets/delete" && req.method === "POST") {
      try {
        const b = await req.json();
        await ensureSchema(env);
        const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map((x) => String(x)).filter(Boolean))] : [];
        if (!ids.length || b.confirm !== "ELIMINAR") {
          return json({ ok: false, error: 'ids (array) y confirm:"ELIMINAR" requeridos' }, 400);
        }
        const author = String(b.author || "Misiones (bloque)").slice(0, 40);
        const fleetInboxIds = [];
        let deleted = 0;
        for (const id of ids) {
          const t = await env.DB.prepare("SELECT id,source,screen FROM tickets WHERE id=?").bind(id).first();
          if (!t) continue;
          // Nº de encargo REAL (fleet_ids → screen → FLT) antes de borrar el ticket. (FLT-990 c)
          const iid = await fleetEncargoId(env, id, t.screen);
          if (t.source === "fleet" && iid) fleetInboxIds.push(iid);
          await env.DB.prepare("DELETE FROM events WHERE ticket_id=?").bind(id).run();
          await env.DB.prepare("DELETE FROM mission_tasks WHERE mission_id=?").bind(id).run();
          await env.DB.prepare("DELETE FROM tickets WHERE id=?").bind(id).run();
          deleted++;
        }
        if (fleetInboxIds.length && env.TELEGRAM) {
          try {
            await env.TELEGRAM.fetch(new Request("https://admira-telegram.csilvasantin.workers.dev/api/bot-inbox/bulk-status", {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ ids: fleetInboxIds, status: "done", by: author, note: "Misi\u00f3n ELIMINADA desde yokup.com/misiones." })
            }));
          } catch (e) {}
        }
        return json({ ok: true, deleted });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/ticket/status" && req.method === "POST") {
      try {
        const b = await req.json();
        await ensureSchema(env);
        const current = await env.DB.prepare("SELECT id,source,assignee,loc,screen FROM tickets WHERE id=?").bind(b.id).first();
        if (b.status === "resolved" && current && current.source === "fleet" && !(await hasMissionProof(env, b.id))) {
          return json({ ok: false, error: "No se puede finalizar sin pantallazo del trabajo realizado", missing_proof: [b.id] }, 409);
        }
        const isBatchMission = !!(current && current.source === "decision-batch");
        const evidence = String(b.evidence || "").trim().slice(0, 2000);
        const acceptedBy = String(b.accepted_by || "").trim().slice(0, 80);
        if (isBatchMission && b.status === "resolved" && (!evidence || !acceptedBy)) {
          return json({
            ok: false,
            error: "La cola sólo avanza con evidencia y aceptación explícita del Agente.",
            requires: ["evidence", "accepted_by"]
          }, 409);
        }
        const now = Date.now();
        const resolvedAt = b.status === "resolved" ? now : null;
        await env.DB.prepare("UPDATE tickets SET status=?, updated_at=?, resolved_at=? WHERE id=?").bind(b.status, now, resolvedAt, b.id).run();
        await addEvent(env, b.id, "status", b.author || "T\xE9cnico", `Estado \u2192 ${b.status}${b.note ? ": " + b.note : ""}`);
        let batch = null;
        if (isBatchMission) {
          const batchId = await batchForMission(env, b.id);
          if (b.status === "resolved") {
            if (!(await batchClosureAccepted(env, b.id))) {
              await addEvent(env, b.id, "accept", acceptedBy, "Cierre aceptado por el Agente. Evidencia: " + evidence);
            }
            if (/^https?:\/\//i.test(evidence)) {
              await env.DB.prepare("UPDATE tickets SET proof_image=COALESCE(NULLIF(proof_image,''),?) WHERE id=?").bind(evidence, b.id).run();
            }
          }
          if (batchId) {
            const pauseReason = b.status === "cancelled" ? "La misión activa fue cancelada expresamente."
              : b.status === "blocked" && b.requires_carlos === true ? "Bloqueada: requiere decisión de Carlos."
              : b.new_priority === true || b.pause_batch === true ? "Pausada por nueva prioridad explícita del Agente."
              : "";
            batch = pauseReason ? await pauseMissionBatch(env, batchId, pauseReason)
              : b.status === "resolved" ? await completeBatchMissionAndAwaitContinuation(env, batchId, b.id)
              : await missionBatchSnapshot(env, batchId);
          }
        }
        // Cerrar (o reabrir) a mano una misi\u00f3n de FLOTA baja tambi\u00e9n al encargo.
        {
          const t = current;
          if (t && t.source === "fleet") {
            // Vía WEB, mismo criterio que la de agente (FLT-989 b2): al finalizar una
            // misión de flota, la prueba de respaldo asciende por el punto único.
            if (b.status === "resolved") await ascendMissionProof(env, b.id);
            const inboxStatus = b.status === "resolved" ? "done" : b.status === "in_progress" ? "in_progress" : "pending";
            await fleetPushStatus(env, t, inboxStatus);
          }
        }
        if (b.status === "resolved" && env.VECTORIZE) {
          const t = await env.DB.prepare("SELECT * FROM tickets WHERE id=?").bind(b.id).first();
          const ev = await env.DB.prepare("SELECT text FROM events WHERE ticket_id=?").bind(b.id).all();
          const vec = await embed(env, `${t.subject} (${t.screen}). ${(ev.results || []).map((e) => e.text).join(" ")}`);
          if (vec) {
            try {
              await env.VECTORIZE.upsert([{ id: b.id, values: vec, metadata: { id: b.id, subject: t.subject, screen: t.screen } }]);
            } catch (e) {
            }
          }
        }
        return json({ ok: true, batch });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/stats") {
      try {
        await ensureSchema(env);
        return json(await stats(env));
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    // Resumen MÍNIMO para el aviso del móvil. Público a propósito pero inútil sin
    // la llave del dispositivo: sólo devuelve el titular de la última incidencia
    // abierta, nunca la bandeja entera. Va ANTES del guardia: el service worker
    // no puede autenticarse con la sesión Google.
    if (url.pathname === "/push/peek") {
      try {
        await ensureSchema(env);
        const k = url.searchParams.get("k") || "";
        if (!k) return json({ error: "sin llave" }, 401);
        const ok = await env.DB.prepare("SELECT 1 AS x FROM subs WHERE peek_key=?").bind(k).first();
        if (!ok) return json({ error: "llave no válida" }, 401);
        const t = await env.DB.prepare(
          "SELECT id, subject, screen, assignee FROM tickets WHERE status='open' ORDER BY created_at DESC LIMIT 1"
        ).first();
        return json({ ok: true, ticket: t || null });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/push/subscribe" && req.method === "POST") {
      try {
        const b = await req.json();
        await ensureSchema(env);
        // LLAVE DE LECTURA DEL SERVICE WORKER. El push va SIN payload (evita la
        // criptografía de RFC8291), así que el sw.js tiene que preguntar QUÉ
        // incidencia anunciar. Pero /tickets está tras el perímetro Google y un
        // service worker no lleva sesión: ese fetch daba 401 y el aviso salía
        // siempre genérico ("se ha abierto un ticket"), sin decir cuál.
        // Se emite aquí —esta ruta YA exige sesión— una clave aleatoria por
        // dispositivo, que el SW usa contra /push/peek. No abre el perímetro:
        // es por dispositivo, inadivinable, y muere con la suscripción.
        let key = "";
        if (b.endpoint) {
          const prev = await env.DB.prepare("SELECT peek_key FROM subs WHERE endpoint=?").bind(b.endpoint).first();
          key = (prev && prev.peek_key) || crypto.randomUUID().replace(/-/g, "");
          await env.DB.prepare("INSERT INTO subs(endpoint,created_at,peek_key) VALUES(?,?,?) ON CONFLICT(endpoint) DO UPDATE SET peek_key=excluded.peek_key")
            .bind(b.endpoint, Date.now(), key).run();
        }
        return json({ ok: true, key, count: (await env.DB.prepare("SELECT COUNT(*) c FROM subs").first())?.c || 0 });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/agents") {
      try {
        await ensureSchema(env);
        const { results } = await env.DB.prepare("SELECT assignee, status, COUNT(*) n, AVG(CASE WHEN status='resolved' AND resolved_at >= created_at AND resolved_at - created_at < 31536000000 THEN resolved_at-created_at END) mttr FROM tickets GROUP BY assignee,status").all();
        const map = {};
        for (const r of results || []) {
          const a = map[r.assignee] || (map[r.assignee] = { open: 0, in_progress: 0, resolved: 0, mttr: null });
          a[r.status] = r.n;
          if (r.status === "resolved" && r.mttr) a.mttr = Math.round(r.mttr / 6e4);
        }
        const agents = ROSTER.map((t) => Object.assign({}, t, map[t.name] || { open: 0, in_progress: 0, resolved: 0, mttr: null }));
        return json({ agents });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/ticket/simulate" && req.method === "POST") {
      try {
        await ensureSchema(env);
        let screen, loc = "", role = "", age = 300;
        try {
          const r = await fetch("https://api.admira.store/signage/screens");
          const d = await r.json();
          const s = (d.screens || []).find((x) => x.online);
          if (s) {
            screen = s.screen;
            loc = s.locName || s.loc || "";
            role = s.role || "";
          }
        } catch (e) {
        }
        if (!screen) {
          const c = ["Gr\xE0cia \xB7 Barcelona", "Madrid Centro", "Eixample \xB7 Barcelona", "Sant Andreu \xB7 Barcelona", "Sants \xB7 Barcelona"];
          screen = "demo-" + Math.random().toString(36).slice(2, 7);
          loc = c[Math.floor(Math.random() * c.length)];
          role = "DOOH";
        }
        const id = await createTicket(env, { screen, loc, role, age, source: "agent-iot" });
        return json({ ok: true, id });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/ai-summary" && req.method === "POST") {
      try {
        const b = await req.json();
        await ensureSchema(env);
        const { results } = await env.DB.prepare("SELECT kind,author,text FROM events WHERE ticket_id=? ORDER BY id ASC").bind(b.id).all();
        const convo = (results || []).map((e) => `[${e.author}] ${e.text}`).join("\n");
        const text = await aiRun(env, `Resume esta incidencia de soporte t\xE9cnico (pantallas DOOH) en 2 frases en espa\xF1ol, clara para un responsable. Di el estado y lo pendiente.

${convo}`, 140);
        return json({ text });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/ai-suggest" && req.method === "POST") {
      try {
        const b = await req.json();
        await ensureSchema(env);
        const { results } = await env.DB.prepare("SELECT kind,author,text FROM events WHERE ticket_id=? ORDER BY id ASC").bind(b.id).all();
        const convo = (results || []).map((e) => `[${e.author}] ${e.text}`).join("\n");
        const text = await aiRun(env, `Eres el copiloto del t\xE9cnico en una incidencia de pantallas DOOH. Sugiere el SIGUIENTE PASO concreto (una nota breve, m\xE1x 40 palabras, en espa\xF1ol, en primera persona como si fuera el t\xE9cnico) seg\xFAn la conversaci\xF3n:

${convo}`, 120);
        return json({ text });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/kb-search") {
      try {
        await ensureSchema(env);
        const q = url.searchParams.get("q") || "";
        let ids = [], semantic = false;
        if (env.VECTORIZE) {
          const vec = await embed(env, q);
          if (vec) {
            try {
              const m = await env.VECTORIZE.query(vec, { topK: 5, returnMetadata: true });
              ids = (m.matches || []).filter((x) => x.score > 0.3).map((x) => x.id);
              semantic = ids.length > 0;
            } catch (e) {
            }
          }
        }
        let rows;
        if (ids.length) {
          const ph = ids.map(() => "?").join(",");
          rows = (await env.DB.prepare(`SELECT t.id,t.subject,t.screen, GROUP_CONCAT(e.text,' | ') notes FROM tickets t LEFT JOIN events e ON e.ticket_id=t.id WHERE t.id IN (${ph}) GROUP BY t.id`).bind(...ids).all()).results || [];
        } else {
          rows = (await env.DB.prepare("SELECT t.id,t.subject,t.screen, GROUP_CONCAT(e.text,' | ') notes FROM tickets t LEFT JOIN events e ON e.ticket_id=t.id WHERE t.status='resolved' GROUP BY t.id ORDER BY t.resolved_at DESC LIMIT 8").all()).results || [];
        }
        const kb = rows.map((r) => `#${r.id} (${r.screen}): ${r.subject}. ${String(r.notes || "").slice(0, 400)}`).join("\n\n");
        const text = await aiRun(env, `Eres la base de conocimiento de soporte de Yokup (pantallas DOOH). Bas\xE1ndote SOLO en estas incidencias resueltas anteriores, responde a la consulta del t\xE9cnico en espa\xF1ol (m\xE1x 70 palabras): pasos recomendados y, si aplica, cita el #id de la incidencia similar. Si no hay nada parecido, dilo.

INCIDENCIAS RESUELTAS:
${kb || "(a\xFAn no hay incidencias resueltas)"}

CONSULTA: ${q}`, 180);
        return json({ text, semantic, sources: rows.map((r) => ({ id: r.id, screen: r.screen, subject: r.subject })) });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/copilot" && req.method === "POST") {
      try {
        const b = await req.json();
        await ensureSchema(env);
        const q = String(b.question || "").slice(0, 500);
        const open = (await env.DB.prepare("SELECT id,screen,subject,assignee,priority,status FROM tickets WHERE status!='resolved' ORDER BY created_at DESC LIMIT 8").all()).results || [];
        let kb = [];
        if (env.VECTORIZE) {
          const v = await embed(env, q);
          if (v) {
            try {
              const m = await env.VECTORIZE.query(v, { topK: 3, returnMetadata: true });
              const ids = (m.matches || []).map((x) => x.id);
              if (ids.length) {
                const ph = ids.map(() => "?").join(",");
                kb = (await env.DB.prepare(`SELECT t.id,t.subject, GROUP_CONCAT(e.text,' ') notes FROM tickets t LEFT JOIN events e ON e.ticket_id=t.id WHERE t.id IN (${ph}) GROUP BY t.id`).bind(...ids).all()).results || [];
              }
            } catch (e) {
            }
          }
        }
        const s = await stats(env);
        const ctx = `ESTADO: ${s.open} abiertas, ${s.in_progress} en curso, ${s.resolved} resueltas, MTTR ${s.mttr ?? "\u2014"} min.
TICKETS ACTIVOS:
${open.map((t) => `#${t.id} ${t.subject} (${t.screen}) \xB7 ${t.assignee} \xB7 ${t.priority} \xB7 ${t.status}`).join("\n") || "(ninguno)"}
CONOCIMIENTO (incidencias resueltas parecidas):
${kb.map((k) => `#${k.id}: ${k.subject}. ${String(k.notes || "").slice(0, 280)}`).join("\n") || "(nada)"}`;
        const text = await aiRun(env, `Eres "Admira", el copiloto con avatar del helpdesk Yokup (mantenimiento de pantallas DOOH de admira.tv). Hablas con el t\xE9cnico. Responde en espa\xF1ol, natural y MUY BREVE (m\xE1x 45 palabras, se lee en voz alta), usando el contexto. Si preguntan el estado, res\xFAmelo. Si es una aver\xEDa, da el paso concreto y cita #id si hay uno parecido. Nada de markdown.

${ctx}

T\xC9CNICO: ${q}`, 160);
        return json({ text: text || "Ahora mismo no puedo responder, int\xE9ntalo de nuevo." });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname.startsWith("/room/")) {
      const id = url.pathname.split("/")[2] || "default";
      const stub = env.ROOM.get(env.ROOM.idFromName(id));
      return stub.fetch(req);
    }
    return new Response("yokup-rtc \xB7 helpdesk API + realtime", { headers: CORS });
  },
  // Cron cada 2 min: reconcilia pantallas→tickets y encargos de la flota→misiones,
  // aunque nadie mire la bandeja. Un fallo en uno no debe tumbar al otro.
  async scheduled(event, env, ctx) {
    // MISMO cuerpo que el latido HTTP y el MISMO cerrojo D1 (FLT-1016 c): si el cron
    // revive, no se solapa con el latido (idempotencia total, cero duplicación de
    // código). runScheduledRoutine hace ensureSchema y envuelve cada sub-rutina en su
    // try/catch con su latido en worker_beats. La platafoma HOY no dispara esto —el
    // latido HTTP lo cubre—, pero queda listo para cuando el cron vuelva.
    try {
      if (await tryAcquireBeatLease(env, "__scheduled", 120000)) await runScheduledRoutine(env, event);
    } catch (e) {}
  }
};
var Room = class {
  static {
    __name(this, "Room");
  }
  constructor(state, env) {
    this.peers = /* @__PURE__ */ new Map();
  }
  async fetch(req) {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();
    const id = crypto.randomUUID().slice(0, 8);
    server.send(JSON.stringify({ type: "welcome", id, peers: [...this.peers.keys()] }));
    for (const s of this.peers.values()) {
      try {
        if (s.readyState === 1) s.send(JSON.stringify({ type: "peer-joined", id }));
      } catch (e) {
      }
    }
    this.peers.set(id, server);
    server.addEventListener("message", (evt) => {
      let m;
      try {
        m = JSON.parse(evt.data);
      } catch (e) {
        return;
      }
      const target = this.peers.get(m.to);
      if (target && target.readyState === 1) {
        m.from = id;
        try {
          target.send(JSON.stringify(m));
        } catch (e) {
        }
      }
    });
    const bye = /* @__PURE__ */ __name(() => {
      this.peers.delete(id);
      for (const s of this.peers.values()) {
        try {
          if (s.readyState === 1) s.send(JSON.stringify({ type: "peer-left", id }));
        } catch (e) {
        }
      }
    }, "bye");
    server.addEventListener("close", bye);
    server.addEventListener("error", bye);
    return new Response(null, { status: 101, webSocket: client });
  }
};
export {
  Room,
  index_default as default
};
//# sourceMappingURL=index.js.map
