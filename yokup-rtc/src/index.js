import puppeteer from "@cloudflare/puppeteer";
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
var PROTECTED = /* @__PURE__ */ new Set(["/copilot", "/tickets", "/tasks/all", "/ticket", "/ticket/note", "/ticket/status", "/ticket/simulate", "/incidents", "/stats", "/agents", "/ai-triage", "/ai-summary", "/ai-suggest", "/kb-search", "/push/subscribe", "/fleet/nudge"]);
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
async function ensureSchema(env) {
  await env.DB.exec("CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, screen TEXT, subject TEXT, loc TEXT, role TEXT, status TEXT, priority TEXT, assignee TEXT, source TEXT, ai_triage TEXT, created_at INTEGER, updated_at INTEGER, resolved_at INTEGER)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT, ts INTEGER, kind TEXT, author TEXT, text TEXT)");
  await env.DB.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_open_screen ON tickets(screen) WHERE status != 'resolved'");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_ev_tkt ON events(ticket_id)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS subs (endpoint TEXT PRIMARY KEY, created_at INTEGER)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS mission_tasks (mission_id TEXT, code TEXT, title TEXT, status TEXT DEFAULT 'pending', owner TEXT, report TEXT, updated_at INTEGER, PRIMARY KEY (mission_id, code))");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_mtasks_mission ON mission_tasks(mission_id)");
  // image: URL pública de la captura de prueba del informe (R2 /media/…). La tabla
  // ya existe en prod, así que la columna se añade idempotente (ignora "duplicate").
  await env.DB.exec("ALTER TABLE mission_tasks ADD COLUMN image TEXT").catch(() => {});
}
__name(ensureSchema, "ensureSchema");

// ---- MODELO MISIONES · TAREAS ----------------------------------------------
// Una MISIÓN es el ticket/incidencia. Sus TAREAS son los pasos para concluirla:
// 3 pasos (a,b,c), cada uno con hasta 3 subtareas (a1..a3, b1..b3, c1..c3) → máx 9.
var TASK_CODE = /^[abc]([1-3])?$/;
var TASK_STATUS = ["pending", "in_progress", "done"];
function validTaskCode(c) {
  return typeof c === "string" && TASK_CODE.test(c);
}
__name(validTaskCode, "validTaskCode");
// Capa sugerida: los pasos (a/b/c) los ejecuta un subagente; las subtareas de
// verificación/reporte las cubre un infraagente.
function ownerFor(code, title) {
  if (/^[abc]$/.test(code)) return "subagente";
  if (/verif|comprueb|report|valida|confirm|document|registr|informe|notific|cierr|cerra/i.test(title || "")) return "infraagente";
  return "subagente";
}
__name(ownerFor, "ownerFor");
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
    `SELECT m.mission_id, m.code, m.title, m.status, m.owner, m.report, m.image, m.updated_at,
            t.subject, t.screen, t.loc, t.source, t.assignee,
            t.status AS mission_status, t.created_at AS mission_created
       FROM mission_tasks m JOIN tickets t ON t.id = m.mission_id
       ${where}
       ORDER BY m.mission_id, m.code`
  ).all();
  return results || [];
}
__name(listAllMissionTasks, "listAllMissionTasks");
// Guarda el plan completo (reemplaza el anterior). Valida codes y tope de 3
// subtareas por paso (→ máx 9 subtareas). Devuelve el plan resultante.
async function saveMissionPlan(env, mid, tasks) {
  const clean = [];
  const seen = /* @__PURE__ */ new Set();
  const subCount = { a: 0, b: 0, c: 0 };
  const now = Date.now();
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
    const owner = t && t.owner ? String(t.owner).slice(0, 40) : ownerFor(code, title);
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
async function setTaskStatus(env, mid, code, status, report, owner) {
  const cur = await env.DB.prepare("SELECT * FROM mission_tasks WHERE mission_id=? AND code=?").bind(mid, code).first();
  if (!cur) return null;
  const st = TASK_STATUS.includes(status) ? status : cur.status;
  const rp = report != null ? String(report).slice(0, 2e3) : cur.report;
  const ow = owner != null ? String(owner).slice(0, 40) : cur.owner;
  await env.DB.prepare("UPDATE mission_tasks SET status=?, report=?, owner=?, updated_at=? WHERE mission_id=? AND code=?").bind(st, rp, ow, Date.now(), mid, code).run();
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
function flattenSteps(steps) {
  const letters = ["a", "b", "c"];
  const tasks = [];
  (steps || []).slice(0, 3).forEach((step, si) => {
    const code = letters[si];
    const title = String((step && (step.title || step.titulo || step.step || step.name || step.paso || step.descripcion || step.description)) || "").slice(0, 60) || "Paso " + code.toUpperCase();
    tasks.push({ code, title });
    const subsRaw = step && (step.subtasks || step.subtareas || step.tasks || step.tareas || step.pasos || step.items || step.steps);
    const subs = Array.isArray(subsRaw) ? subsRaw : [];
    subs.slice(0, 3).forEach((s, i) => {
      const st = typeof s === "string" ? s : s && (s.title || s.text || s.name) || "";
      if (st) tasks.push({ code: code + (i + 1), title: String(st).slice(0, 60) });
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
    { code: "a", title: "Entender el encargo y su alcance", subtasks: ["Leer el encargo completo en el bot-inbox", "Localizar el proyecto y los ficheros implicados", "Acusar recibo (ACK) del encargo"] },
    { code: "b", title: "Ejecutar el encargo", subtasks: ["Hacer el cambio en la m\xE1quina que corresponde", "Desplegar a la URL p\xFAblica"] },
    { code: "c", title: "Verificar y reportar", subtasks: ["Verificar en real, con captura por el camino del usuario", "Reportar a Carlos y al grupo, y marcar el encargo hecho"] }
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

Descomp\xF3n el encargo en un PLAN de EXACTAMENTE 3 pasos con c\xF3digos "a", "b", "c", cada uno con hasta 3 subtareas. Doctrina del equipo: los pasos los ejecuta un subagente y la verificaci\xF3n/reporte la cubre un infraagente; nada se da por hecho sin verificarlo en real y publicarlo a su URL p\xFAblica. Pasos concretos y accionables SOBRE ESTE ENCARGO (no inventes averías de hardware ni pantallas: esto es trabajo de software), en espa\xF1ol, cada title de m\xE1ximo 60 caracteres.

Responde SOLO con un array JSON v\xE1lido, sin texto adicional, con esta forma exacta:
[{"code":"a","title":"...","subtasks":["...","..."]},{"code":"b","title":"...","subtasks":["..."]},{"code":"c","title":"...","subtasks":["..."]}]`;
  } else {
    prompt = `Eres el agente principal del helpdesk Yokup (mantenimiento de pantallas DOOH de admira.tv). Descomp\xF3n la RESOLUCI\xD3N de esta incidencia en un PLAN de EXACTAMENTE 3 pasos con c\xF3digos "a", "b", "c". Cada paso puede tener hasta 3 subtareas concretas (verificaci\xF3n o ejecuci\xF3n). Pasos concretos y accionables para resolver la aver\xEDa, en espa\xF1ol, cada title de m\xE1ximo 60 caracteres.

INCIDENCIA: ${subject}${screen ? " — pantalla " + screen : ""}${loc ? " (" + loc + ")" : ""}.
${triage ? "TRIAJE IA:\n" + triage : ""}

Responde SOLO con un array JSON v\xE1lido, sin texto adicional, con esta forma exacta:
[{"code":"a","title":"...","subtasks":["...","..."]},{"code":"b","title":"...","subtasks":["..."]},{"code":"c","title":"...","subtasks":["..."]}]`;
  }
  const raw = await aiRun(env, prompt, 500);
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
async function listTickets(env, scope) {
  const where = scope === "fleet" ? "WHERE source='fleet'" : scope === "todas" ? "" : "WHERE source IS NULL OR source!='fleet'";
  const { results } = await env.DB.prepare(
    `SELECT * FROM tickets ${where} ORDER BY (status='open') DESC, (status='in_progress') DESC, created_at DESC LIMIT 100`
  ).all();
  return results || [];
}
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
var FLEET_INBOX = "https://admira-telegram.csilvasantin.workers.dev/api/public/inbox?limit=200";
// Estado del encargo → estado de la misión. 'ack' es acuse de recibo, no avance.
var FLEET_ST = { pending: "open", ack: "open", in_progress: "in_progress", done: "resolved" };

function fleetSubject(text) {
  const line = String(text || "").split("\n")[0].trim();
  if (!line) return "Encargo de la flota";
  return line.length > 120 ? line.slice(0, 117) + "…" : line;
}
__name(fleetSubject, "fleetSubject");
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
    const id = "FLT-" + it.id;
    const st = FLEET_ST[it.status] || "open";
    const ts = epochMs(it.ts, now);
    const prev = await env.DB.prepare("SELECT id,status,assignee,loc FROM tickets WHERE id=?").bind(id).first();
    if (!prev) {
      // ANTI-RESURRECCIÓN: un encargo ya cerrado que nunca fue ticket NO nace como
      // ticket resuelto (la ventana de done de 7 días del public/inbox revivía como
      // lápidas los encargos limpiados a mano — p.ej. las máquinas fantasma Luna).
      if (st === "resolved") continue;
      await env.DB.prepare(
        "INSERT OR IGNORE INTO tickets(id,screen,subject,loc,role,status,priority,assignee,source,ai_triage,created_at,updated_at,resolved_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)"
      ).bind(
        id, fleetScreen(it), fleetSubject(it.text), it.target_machine || "", it.from_name || "",
        st, "normal", it.target_persona || "", "fleet", "", ts, now,
        st === "resolved" ? epochMs(it.done_at, now) : null
      ).run();
      // El texto íntegro del encargo queda como primer evento de la misión.
      await addEvent(env, id, "log", it.from_name || "Carlos", String(it.text || ""));
      created++;
    } else {
      // Propaga también los cambios de ASIGNACIÓN (reasignar agente/máquina desde
      // la vista detalle actualiza el encargo; el ticket debe reflejarlo).
      const asig = it.target_persona || "", loc = it.target_machine || "";
      if (prev.status !== st || prev.assignee !== asig || (prev.loc || "") !== loc) {
        await env.DB.prepare("UPDATE tickets SET status=?, assignee=?, loc=?, screen=?, updated_at=?, resolved_at=? WHERE id=?")
          .bind(st, asig, loc, fleetScreen(it), now, st === "resolved" ? now : null, id).run();
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
  if (!machine || !text) return { ok: false, error: "machine y text requeridos" };
  if (!env.NAV_CMD_TOKEN) return { ok: false, error: "sin secreto NAV_CMD_TOKEN" };
  if (!env.NAVEGADORES) return { ok: false, error: "sin binding NAVEGADORES" };
  const deviceId = "local-" + machine.toLowerCase().replace(/[^a-z0-9]/g, "");
  const r = await env.NAVEGADORES.fetch(new Request("https://admira-navegadores.csilvasantin.workers.dev/api/cmd", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + env.NAV_CMD_TOKEN },
    body: JSON.stringify({ deviceId, action: "prompt", text, persona })
  }));
  const d = await r.json().catch(() => ({}));
  return { ok: !!(r.ok && d.ok), id: d.id || null, deviceId, error: d.error || null };
}
__name(fleetNudge, "fleetNudge");

function fleetInboxId(mid) {
  const m = /^FLT-(\d+)$/.exec(String(mid || ""));
  return m ? m[1] : null;
}
__name(fleetInboxId, "fleetInboxId");

async function fleetPushStatus(env, ticket, status) {
  const id = fleetInboxId(ticket.id);
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
  const t = await env.DB.prepare("SELECT id,source,status,assignee,loc FROM tickets WHERE id=?").bind(mid).first();
  if (!t || t.source !== "fleet") return null;
  const tasks = await listMissionTasks(env, mid);
  if (!tasks.length) return null;
  const allDone = tasks.every((x) => x.status === "done");
  const started = tasks.some((x) => x.status !== "pending");
  const next = allDone ? "resolved" : started ? "in_progress" : "open";
  // No DEGRADAR una misión FINALIZADA a mano: el reconciliador por árbol solo PROMUEVE
  // (open→in_progress→resolved). El árbol se auto-genera y nadie marca sus subtareas
  // (queda 0/N), así que sin esta guarda reabría cada 2 min el FINALIZAR humano. Reabrir
  // es acción manual (botón REABRIR → /ticket/status), nunca del cron.
  if (t.status === "resolved" && next !== "resolved") return null;
  if (next === t.status) return null;            // sin cambio → ni escribe ni avisa al grupo
  const now = Date.now();
  await env.DB.prepare("UPDATE tickets SET status=?, updated_at=?, resolved_at=? WHERE id=?")
    .bind(next, now, next === "resolved" ? now : null, mid).run();
  const inboxStatus = next === "resolved" ? "done" : next === "in_progress" ? "in_progress" : "pending";
  const pushed = await fleetPushStatus(env, t, inboxStatus);
  await addEvent(env, mid, next === "resolved" ? "recover" : "log", "yokup",
    `La misión pasa a ${next} por su árbol de tareas. Encargo #${fleetInboxId(mid)} → ${inboxStatus.toUpperCase()}${pushed ? "" : " (no se pudo avisar al bot-inbox)"}.`);
  return { mission: mid, status: next, inbox: inboxStatus, pushed };
}
__name(fleetReconcileMission, "fleetReconcileMission");

// Barrido: deriva el estado de TODAS las misiones de flota con plan y baja al
// bot-inbox las que hayan cambiado. Va en el cron para que la vuelta no dependa de
// que el cambio haya pasado por el endpoint (un chip marcado, un UPDATE, otro
// cliente). Una sola consulta agregada — no una por misión.
async function fleetReconcileAll(env) {
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.status, t.assignee, t.loc,
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
    const next = r.done === r.total ? "resolved" : r.started > 0 ? "in_progress" : "open";
    // No reabrir un FINALIZAR humano desde el árbol auto-generado (ver fleetReconcileMission):
    // el barrido solo promueve, nunca degrada un resolved. Reabrir = botón REABRIR manual.
    if (r.status === "resolved" && next !== "resolved") continue;
    if (next === r.status) continue;
    await env.DB.prepare("UPDATE tickets SET status=?, updated_at=?, resolved_at=? WHERE id=?")
      .bind(next, now, next === "resolved" ? now : null, r.id).run();
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

// Lectura PÚBLICA para admira.live/status. El árbol de tareas va EMBEBIDO: los
// /mission/* viven tras el perímetro (Google) y status no pasa el gate. No
// expone nada que el bot-inbox público no publique ya.
async function fleetMissions(env) {
  const { results } = await env.DB.prepare(
    "SELECT id,screen,subject,loc,role,status,assignee,created_at,updated_at FROM tickets WHERE source='fleet' ORDER BY (status='open') DESC,(status='in_progress') DESC, created_at DESC LIMIT 120"
  ).all();
  const rows = results || [];
  if (!rows.length) return [];
  const ph = rows.map(() => "?").join(",");
  const { results: tks } = await env.DB.prepare(
    `SELECT mission_id,code,title,status,owner FROM mission_tasks WHERE mission_id IN (${ph}) ORDER BY code`
  ).bind(...rows.map((r) => r.id)).all();
  const byMission = {};
  for (const t of tks || []) (byMission[t.mission_id] = byMission[t.mission_id] || []).push(t);
  return rows.map((r) => {
    const tasks = byMission[r.id] || [];
    return Object.assign({}, r, {
      machine: r.loc,
      persona: r.assignee,
      source: "fleet",
      tasks,
      progress: { done: tasks.filter((t) => t.status === "done").length, total: tasks.length }
    });
  });
}
__name(fleetMissions, "fleetMissions");
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
var index_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    // ── MEDIA (imágenes de misiones) ──────────────────────────────────────────
    // GET /media/<key> → PÚBLICO: sirve la imagen de R2 (el LLM la ve por URL).
    if (url.pathname.startsWith("/media/") && req.method === "GET") {
      if (!env.MEDIA) return json({ error: "sin bucket MEDIA" }, 500);
      const key = decodeURIComponent(url.pathname.slice("/media/".length));
      const obj = await env.MEDIA.get(key);
      if (!obj) return json({ error: "not found" }, 404);
      const h = new Headers(CORS);
      h.set("content-type", obj.httpMetadata?.contentType || "application/octet-stream");
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
          await page.goto(target, { waitUntil: "networkidle0", timeout: 15e3 });
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
      const real = buf && buf.byteLength > 3500 && /^image\//i.test(ct);
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
    if (url.pathname === "/fleet/missions") {
      await ensureSchema(env);
      return json({ missions: await fleetMissions(env) });
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
      if (!/^image\//i.test(ct)) return json({ ok: false, error: "solo imágenes" }, 415);
      const buf = await req.arrayBuffer();
      if (!buf.byteLength) return json({ ok: false, error: "vacío" }, 400);
      if (buf.byteLength > 12 * 1024 * 1024) return json({ ok: false, error: "máx 12MB" }, 413);
      const ext = (ct.split("/")[1] || "png").split(";")[0].replace(/[^a-z0-9]/gi, "") || "png";
      const rand = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, "0")).join("");
      const key = `fleet/${rand}.${ext}`;
      await env.MEDIA.put(key, buf, { httpMetadata: { contentType: ct } });
      return json({ ok: true, url: `${url.origin}/media/${key}`, key });
    }
    // VÍA PARA AGENTES (sin gate Google): deja el INFORME del InfraAgente en yokup, para
    // que aparezca en /informes. Cierra la doctrina «toda tarea acaba en un informe».
    // Se guarda como una mission_task 'done' (code z1) con el report. Acepta FLT-<id> o el
    // número de encargo pelado. Carlos, 2026-07-15 (los agentes no cruzan el perímetro).
    if (url.pathname === "/fleet/informe" && req.method === "POST") {
      await ensureSchema(env);
      let b; try { b = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
      let mid = String(b.mission || b.id || "").trim();
      if (/^#?\d+$/.test(mid)) mid = "FLT-" + mid.replace(/^#/, "");
      const report = String(b.report || "").slice(0, 2000).trim();
      const owner = String(b.owner || "infraagente").slice(0, 24);
      // Captura de prueba opcional: solo aceptamos una URL http(s) (idealmente del
      // propio /media de la flota). Cierra la doctrina «reportar = captura real».
      let image = String(b.image || "").trim().slice(0, 500);
      if (image && !/^https?:\/\//i.test(image)) image = "";
      if (!mid || !report) return json({ ok: false, error: "mission y report requeridos" }, 400);
      const t = await env.DB.prepare("SELECT id FROM tickets WHERE id=?").bind(mid).first();
      if (!t) return json({ ok: false, error: "la misión " + mid + " no existe" }, 404);
      const now = Date.now();
      await env.DB.prepare(
        "INSERT INTO mission_tasks(mission_id,code,title,status,owner,report,image,updated_at) VALUES(?,?,?,?,?,?,?,?) " +
        "ON CONFLICT(mission_id,code) DO UPDATE SET report=excluded.report, status='done', owner=excluded.owner, image=COALESCE(excluded.image, mission_tasks.image), updated_at=excluded.updated_at"
      ).bind(mid, "z1", "Informe del InfraAgente", "done", owner, report, image || null, now).run();
      await addEvent(env, mid, "log", owner, "📝 Informe: " + report.slice(0, 240));
      return json({ ok: true, mission: mid });
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
    if (url.pathname === "/fleet/reconcile" && req.method === "POST") {
      await ensureSchema(env);
      return json(await fleetReconcileAll(env));
    }
    if (PROTECTED.has(url.pathname) || url.pathname.startsWith("/mission/")) {
      const sess = await requireAuth(env, req);
      if (!sess) return json({ error: "unauthorized" }, 401);
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
        await ensureSchema(env);
        const scope = url.searchParams.get("scope") || "campo";
        // La bandeja de campo reconcilia pantallas; la de flota se nutre del sync
        // del bot-inbox (cron cada 2 min), no de las pantallas DOOH.
        if (scope !== "fleet") await reconcile(env);
        return json({ tickets: await listTickets(env, scope), stats: await stats(env, scope), roster: ROSTER });
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
    if (url.pathname === "/ticket/status" && req.method === "POST") {
      try {
        const b = await req.json();
        await ensureSchema(env);
        const now = Date.now();
        const resolvedAt = b.status === "resolved" ? now : null;
        await env.DB.prepare("UPDATE tickets SET status=?, updated_at=?, resolved_at=? WHERE id=?").bind(b.status, now, resolvedAt, b.id).run();
        await addEvent(env, b.id, "status", b.author || "T\xE9cnico", `Estado \u2192 ${b.status}${b.note ? ": " + b.note : ""}`);
        // Cerrar (o reabrir) a mano una misi\u00f3n de FLOTA baja tambi\u00e9n al encargo.
        {
          const t = await env.DB.prepare("SELECT id,source,assignee,loc FROM tickets WHERE id=?").bind(b.id).first();
          if (t && t.source === "fleet") {
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
        return json({ ok: true });
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
    if (url.pathname === "/push/subscribe" && req.method === "POST") {
      try {
        const b = await req.json();
        await ensureSchema(env);
        if (b.endpoint) await env.DB.prepare("INSERT OR IGNORE INTO subs(endpoint,created_at) VALUES(?,?)").bind(b.endpoint, Date.now()).run();
        return json({ ok: true, count: (await env.DB.prepare("SELECT COUNT(*) c FROM subs").first())?.c || 0 });
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
    try {
      await ensureSchema(env);
    } catch (e) {
      return;
    }
    try {
      await reconcile(env);
    } catch (e) {
    }
    // Monitor de servicios/webs (~cada 10 min; el cron dispara cada 2).
    try {
      const min = new Date(event.scheduledTime || Date.now()).getUTCMinutes();
      if (min % 10 < 2) { await checkWebs(env); await checkMachines(env); }
    } catch (e) {
    }
    try {
      await fleetSync(env);
    } catch (e) {
    }
    // Las misiones nuevas van cogiendo su árbol de tareas solas, en tandas cortas
    // para no disparar el gasto de IA en un tick.
    try {
      await fleetPlanPending(env, 3);
    } catch (e) {
    }
    // …y el avance del árbol baja al encargo del bot-inbox. Va DESPUÉS del sync:
    // el sync trae lo que dice el buzón, esto devuelve lo que dice el plan.
    try {
      await fleetReconcileAll(env);
    } catch (e) {
    }
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