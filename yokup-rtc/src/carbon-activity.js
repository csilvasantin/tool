// «EN QUÉ ESTÁ» CADA AGENTE DE CARBONO — puente yokup ⇄ MCP de Yarigai.
//
// Carlos (4-sep-2026): «la idea es que ponga en los agentes de carbono en qué
// están en cada momento, al lado del nombre». La fuente de verdad de lo que hace
// una persona NO es yokup (aquí sólo consta el responsable de cada proyecto): es
// Yarigai, el portal interno de Admira, que expone un servidor MCP de solo lectura
// en https://mcp.eui.ai/mcp con la tool «tareas de=<compañero>» (tarea en curso)
// y «presencia de=<compañero>» (en qué oficina está).
//
// Tres decisiones que conviene entender antes de tocar esto:
//
//  1) EL TOKEN ES DE SERVICIO Y VIVE EN EL WORKER (secreto YARIGAI_MCP_TOKEN).
//     Yarigai emite tokens personales «ymcp_…» desde yarigai.eui.ai/mcp; el que
//     usa yokup lo genera Carlos y no viaja nunca al navegador. Sin token el
//     endpoint responde `token_configured:false` y `now:null` para todos: un panel
//     que dice «sin datos» es honesto; uno que inventa tareas, no (mandamiento 2).
//
//  2) EL NOMBRE DEL RESPONSABLE (Carlos3.0) NO ES UN USUARIO DE YARIGAI. El puente
//     es la tabla carbon_yarigai: id de carbono (carbonId del nombre) → email de
//     Yarigai. Semilla: carlos3-0 → csilva@admira.com, que es Carlos «en los dos».
//     A Yarigai se le pasa la parte local del email (`de=csilva`), que es lo que
//     su tool acepta («nombre o usuario del email»). Quien no tenga mapeo sale
//     como `mapped:false`, no se adivina por el nombre de pila.
//
//  3) UNA SESIÓN MCP POR CONSULTA Y CACHÉ DE 60 s. El servidor es Streamable HTTP
//     con Mcp-Session-Id: initialize → notifications/initialized → tools/call.
//     El dashboard refresca cada minuto y hay ~10 responsables: sin caché serían
//     30 llamadas/min a Yarigai por pestaña abierta. La caché es por isolate
//     (Map en memoria), suficiente para un panel.

export const YARIGAI_MCP_URL = "https://mcp.eui.ai/mcp";
export const CARBON_ACTIVITY_TTL_MS = 60 * 1e3;

export const CARBON_YARIGAI_TABLE_SQL =
  "CREATE TABLE IF NOT EXISTS carbon_yarigai (" +
  "carbon_id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, " +
  "updated_at INTEGER NOT NULL, updated_by TEXT)";

// Carlos es csilva@admira.com «en los dos» (yokup y Yarigai). Es la única
// correspondencia que se ha afirmado; el resto se da de alta con POST /carbon/yarigai.
export const CARBON_YARIGAI_SEED = [
  { carbon_id: "carlos3-0", name: "Carlos3.0", email: "csilva@admira.com" }
];

export function yarigaiUser(email) {
  const e = String(email == null ? "" : email).trim().toLowerCase();
  const at = e.indexOf("@");
  return at > 0 ? e.slice(0, at) : e;
}

export function normalizeCarbonYarigai(body, carbonIdFn, now) {
  const b = body || {};
  const name = String(b.name == null ? "" : b.name).trim().slice(0, 80);
  const email = String(b.email == null ? "" : b.email).trim().toLowerCase().slice(0, 120);
  if (!name) return { ok: false, code: "carbon_name_required", error: "hace falta el nombre del responsable tal y como figura en los proyectos" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, code: "email_invalid", error: "hace falta el email de Yarigai de esa persona" };
  const carbon_id = carbonIdFn(name);
  if (!carbon_id) return { ok: false, code: "carbon_id_invalid", error: "el nombre no produce un identificador válido" };
  return { ok: true, row: { carbon_id, name, email, updated_at: now, updated_by: String(b.author || b.updated_by || "").trim().slice(0, 80) } };
}

// Lee UNA respuesta JSON-RPC del servidor, venga como JSON o como SSE.
export function parseMcpBody(contentType, text) {
  const ct = String(contentType || "");
  const raw = String(text || "");
  if (ct.includes("text/event-stream")) {
    const messages = raw.split(/\n\n+/).map((chunk) => chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("")).filter(Boolean);
    for (const m of messages) { try { const d = JSON.parse(m); if (d && (d.result !== undefined || d.error)) return d; } catch {} }
    return null;
  }
  try { return JSON.parse(raw); } catch { return null; }
}

// El texto útil de una respuesta de tools/call, o el error con el que vino.
export function mcpToolText(rpc) {
  if (!rpc) return { ok: false, error: "respuesta MCP vacía" };
  if (rpc.error) return { ok: false, error: String(rpc.error.message || rpc.error.code || "error MCP") };
  const r = rpc.result || {};
  const structured = r.structuredContent && typeof r.structuredContent.result === "string" ? r.structuredContent.result : "";
  const content = Array.isArray(r.content) ? r.content.filter((c) => c && c.type === "text").map((c) => String(c.text || "")).join("\n") : "";
  const text = (structured || content).trim();
  if (r.isError) return { ok: false, error: text || "tool con isError" };
  return { ok: true, text };
}

async function readFirstSse(body) {
  const reader = body.getReader(); const dec = new TextDecoder(); let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buf += dec.decode(value, { stream: true });
      if (parseMcpBody("text/event-stream", buf)) { try { await reader.cancel(); } catch {} return buf; }
      if (done) return buf;
    }
  } catch { return buf; }
}

// Un cliente MCP mínimo: abre sesión, la inicializa y llama tools. Sin
// dependencias, porque el worker no puede cargar el SDK de MCP.
export function mcpClient({ url = YARIGAI_MCP_URL, token, fetchImpl = fetch, timeoutMs = 12000 } = {}) {
  let session = "";
  const headers = () => {
    const h = { "content-type": "application/json", accept: "application/json, text/event-stream", "user-agent": "Mozilla/5.0 (compatible; yokup-rtc)" };
    if (token) h.authorization = "Bearer " + token;
    if (session) h["mcp-session-id"] = session;
    return h;
  };
  const post = async (body) => {
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      const r = await fetchImpl(url, { method: "POST", headers: headers(), body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined });
      const sid = r.headers && r.headers.get ? r.headers.get("mcp-session-id") : "";
      if (sid) session = sid;
      const ct = r.headers && r.headers.get ? r.headers.get("content-type") || "" : "";
      // Un stream SSE puede quedarse abierto tras el mensaje: se lee hasta la primera
      // respuesta JSON-RPC completa y se cancela el resto, en vez de esperar a que el
      // servidor cierre (en Workers eso acababa en «The operation was aborted»).
      const text = ct.includes("text/event-stream") && r.body && typeof r.body.getReader === "function" ? await readFirstSse(r.body) : await r.text();
      return { status: r.status, rpc: parseMcpBody(ct, text) };
    } finally { if (timer) clearTimeout(timer); }
  };
  return {
    async init() {
      const r = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "yokup-rtc", version: "1" } } });
      if (r.status >= 400 || !r.rpc || r.rpc.error) throw new Error("initialize " + r.status + (r.rpc && r.rpc.error ? " " + r.rpc.error.message : ""));
      await post({ jsonrpc: "2.0", method: "notifications/initialized" });
      return r.rpc.result;
    },
    async call(name, args) {
      const r = await post({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args || {} } });
      if (r.status === 401 || r.status === 403) return { ok: false, error: "token rechazado por Yarigai (" + r.status + ")", unauthorized: true };
      return mcpToolText(r.rpc);
    },
    get session() { return session; }
  };
}

// Yarigai contesta en prosa castellana («Falta el token MCP…», «Carlos no tiene
// ninguna tarea en curso», «Tarea en curso de Carlos: …»). Se conserva el texto tal
// cual y se marca lo que es evidente sin inventar estructura.
export function summarizeActivity(tareas, presencia) {
  const out = { task: "", office: "", raw_task: "", raw_presence: "", error: "" };
  if (tareas) {
    if (tareas.ok) {
      out.raw_task = tareas.text;
      const t = tareas.text.replace(/\s+/g, " ").trim();
      if (/falta el token/i.test(t)) out.error = "token";
      else if (/no tiene (ninguna )?tarea|sin tarea|no hay tarea/i.test(t)) out.task = "";
      else out.task = t.replace(/^tarea en curso de [^:]+:\s*/i, "").slice(0, 200);
    } else out.error = tareas.error || "error";
  }
  if (presencia && presencia.ok) {
    out.raw_presence = presencia.text;
    const p = presencia.text.replace(/\s+/g, " ").trim();
    if (!/falta el token/i.test(p)) out.office = p.slice(0, 160);
  }
  return out;
}

const CACHE = new Map();

// La actividad de una lista de responsables. `people` = [{carbon_id,name,email}].
export async function carbonActivity({ people, token, now = Date.now(), fetchImpl = fetch, ttlMs = CARBON_ACTIVITY_TTL_MS, url = YARIGAI_MCP_URL }) {
  const rows = [];
  const configured = !!token;
  let client = null, initError = "";
  for (const p of people || []) {
    const base = { carbon_id: p.carbon_id, name: p.name, email: p.email || "", user: yarigaiUser(p.email), mapped: !!p.email, now: null, checked_at: 0, error: "" };
    if (!configured) { base.error = "sin token"; rows.push(base); continue; }
    if (!base.mapped) { base.error = "sin mapeo a Yarigai"; rows.push(base); continue; }
    const key = base.user;
    const hit = CACHE.get(key);
    if (hit && now - hit.at < ttlMs) { rows.push({ ...base, now: hit.now, checked_at: hit.at, error: hit.error }); continue; }
    try {
      if (!client && !initError) { client = mcpClient({ url, token, fetchImpl }); await client.init(); }
      if (initError) throw new Error(initError);
      // En serie, no en paralelo: una sesión MCP atiende una petición cada vez.
      const tareas = await client.call("tareas", { de: key });
      const presencia = await client.call("presencia", { de: key });
      const s = summarizeActivity(tareas, presencia);
      const entry = { at: now, now: { task: s.task, office: s.office, raw_task: s.raw_task, raw_presence: s.raw_presence }, error: s.error };
      CACHE.set(key, entry);
      rows.push({ ...base, now: entry.now, checked_at: now, error: entry.error });
    } catch (e) {
      initError = String(e && e.message || e);
      rows.push({ ...base, error: initError });
    }
  }
  return { ok: true, token_configured: configured, source: url, ttl_ms: ttlMs, people: rows };
}

export function clearCarbonActivityCache() { CACHE.clear(); }
