/**
 * yokup-api — Cloudflare Worker
 * API entre el frontend estático de Yokup y Cloudflare D1 (SQLite).
 *
 * El frontend (web/tool/data.js, modo 'api') habla SOLO con este worker; el worker
 * lee/escribe D1 con el binding `env.DB`. No hay Supabase: D1 es la fuente de verdad.
 * (Supabase queda como rollback: revertir config.js a BACKEND:'supabase'.)
 *
 * Binding (wrangler.toml):
 *   DB   -> D1 database 'yokup-db'
 * Secret opcional (wrangler secret put):
 *   ADMIRA_WEBHOOK_SECRET  HMAC del webhook de Admira (sin él: modo dev, acepta)
 *
 * Rutas (todas bajo /api):
 *   GET    /api/health
 *   GET    /api/interventions
 *   POST   /api/interventions                 {store_id,surface,type,...}
 *   PATCH  /api/interventions/:id             {status, technician_id, ...}
 *   GET    /api/technicians
 *   POST   /api/technicians                   {name,kind,zones,skills,...}
 *   PATCH  /api/technicians/:id               {status, rating_avg, ...}
 *   GET    /api/stores                         (puntos dados de alta en Yokup)
 *   POST   /api/stores                         {name,kind,addr,equipment,...}
 *   GET    /api/ratings?intervention_id=...
 *   POST   /api/ratings                        {intervention_id,technician_id,stars,...}
 *   POST   /api/ingest/admira                  webhook firmado de Admira (idempotente)
 */

const ALLOWED_ORIGINS = new Set([
  // Producción: la web vive en https://www.yokup.com/tool/ (el Origin es solo host).
  "https://www.yokup.com",
  "https://yokup.com",
  "https://csilvasantin.github.io",   // fallback github.io mientras se monta el DNS
  // Desarrollo local.
  "http://localhost:8788",
  "http://localhost:8770",
  "http://127.0.0.1:8788",
]);

// Columnas que en el frontend son arrays (se guardan como JSON TEXT en D1).
const JSON_ARRAY_COLS = {
  technicians: ["zones", "skills"],
  stores: ["equipment"],
};
// Columnas booleanas (INTEGER 0/1 en D1).
const BOOL_COLS = { stores: ["from_admira"] };

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors(request) });

    const url = new URL(request.url);
    const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/"); // ["api","interventions",":id"]
    try {
      if (parts[0] !== "api") return json(request, { error: "not found" }, 404);
      const res = await route(parts.slice(1), request, env, url);
      return json(request, res.body, res.status || 200);
    } catch (e) {
      return json(request, { error: String((e && e.message) || e) }, e.status || 500);
    }
  },
};

async function route(p, request, env, url) {
  const [resource, id] = p;
  const m = request.method;

  if (resource === "health") return { body: { ok: true, ts: Date.now() } };

  // ---- interventions ----
  if (resource === "interventions") {
    if (m === "GET") return { body: await listAll(env, "interventions") };
    if (m === "POST") return { body: await insert(env, "interventions", await body(request)), status: 201 };
    if (m === "PATCH" && id) return { body: await patch(env, "interventions", id, await body(request)) };
  }

  // ---- technicians ----
  if (resource === "technicians") {
    if (m === "GET") return { body: await listAll(env, "technicians") };
    if (m === "POST") return { body: await insert(env, "technicians", await body(request)), status: 201 };
    if (m === "PATCH" && id) return { body: await patch(env, "technicians", id, await body(request)) };
  }

  // ---- stores (altas manuales de puntos en Yokup) ----
  if (resource === "stores") {
    if (m === "GET") return { body: await listAll(env, "stores") };
    if (m === "POST") return { body: await insert(env, "stores", await body(request)), status: 201 };
  }

  // ---- ratings ----
  if (resource === "ratings") {
    if (m === "GET") {
      const iv = url.searchParams.get("intervention_id");
      if (iv) {
        const r = await env.DB.prepare(
          "SELECT * FROM ratings WHERE intervention_id = ? ORDER BY created_at DESC"
        ).bind(iv).all();
        return { body: hydrateRows("ratings", r.results) };
      }
      return { body: await listAll(env, "ratings") };
    }
    if (m === "POST") return { body: await addRating(env, await body(request)), status: 201 };
  }

  // ---- ingesta webhook Admira (idempotente vía webhook_inbox) ----
  if (resource === "ingest" && id === "admira" && m === "POST")
    return { body: await ingestAdmira(env, request), status: 202 };

  return { body: { error: "not found", path: p }, status: 404 };
}

// --- CRUD genérico sobre D1 -------------------------------------------------

// Defaults por tabla (equivalen a los DEFAULT del esquema demo y a lo que hace data.js).
function withDefaults(table, row) {
  const now = new Date().toISOString();
  const r = { ...row };
  if (r.created_at == null) r.created_at = now;
  if (table === "interventions") {
    r.id = r.id || "iv-" + Date.now();
    r.type = r.type || "incidencia";
    r.origin = r.origin || "manual";
    r.status = r.status || "nueva";
    r.priority = r.priority || "media";
    if (r.title == null) r.title = "Intervención";
  } else if (table === "technicians") {
    r.id = r.id || "tech-" + Date.now();
    r.status = r.status || "pendiente";
    if (r.rating_avg == null) r.rating_avg = 0;
    if (r.rating_n == null) r.rating_n = 0;
    if (r.zones == null) r.zones = [];
    if (r.skills == null) r.skills = [];
  } else if (table === "ratings") {
    r.id = r.id || "rt-" + Date.now();
  } else if (table === "stores") {
    r.id = r.id || "store-" + Date.now();
    if (r.equipment == null) r.equipment = [];
    if (r.from_admira == null) r.from_admira = false;
  }
  return r;
}

// Serializa un valor de app -> valor de D1 (arrays/bools/objetos a TEXT).
function toDb(table, col, val) {
  if ((JSON_ARRAY_COLS[table] || []).includes(col))
    return JSON.stringify(Array.isArray(val) ? val : val == null ? [] : [val]);
  if ((BOOL_COLS[table] || []).includes(col)) return val ? 1 : 0;
  if (val != null && typeof val === "object") return JSON.stringify(val);
  return val;
}

// Deserializa una fila de D1 -> forma de app (TEXT JSON -> arrays, INTEGER -> bool).
function hydrateRow(table, row) {
  if (!row) return row;
  const out = { ...row };
  for (const col of JSON_ARRAY_COLS[table] || []) {
    if (typeof out[col] === "string") { try { out[col] = JSON.parse(out[col]); } catch { out[col] = []; } }
    else if (out[col] == null) out[col] = [];
  }
  for (const col of BOOL_COLS[table] || []) out[col] = !!out[col];
  return out;
}
function hydrateRows(table, rows) { return (rows || []).map((r) => hydrateRow(table, r)); }

async function listAll(env, table) {
  const r = await env.DB.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC`).all();
  return hydrateRows(table, r.results);
}

async function insert(env, table, payload) {
  const row = withDefaults(table, payload);
  const cols = Object.keys(row);
  const placeholders = cols.map(() => "?").join(", ");
  const vals = cols.map((c) => toDb(table, c, row[c]));
  await env.DB.prepare(
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`
  ).bind(...vals).run();
  const back = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(row.id).first();
  return [hydrateRow(table, back)]; // el frontend espera un array (PostgREST return=representation)
}

async function patch(env, table, id, payload) {
  const cols = Object.keys(payload).filter((c) => c !== "id");
  if (!cols.length) {
    const cur = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
    return cur ? [hydrateRow(table, cur)] : [];
  }
  const setClause = cols.map((c) => `${c} = ?`).join(", ");
  const vals = cols.map((c) => toDb(table, c, payload[c]));
  await env.DB.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`).bind(...vals, id).run();
  const back = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  return back ? [hydrateRow(table, back)] : [];
}

// --- Lógica de negocio que toca varias tablas -------------------------------

// Inserta valoración y recalcula rating_avg/rating_n del técnico (media incremental).
async function addRating(env, payload) {
  const rows = await insert(env, "ratings", payload);
  const r = Array.isArray(rows) ? rows[0] : rows;
  if (r && r.technician_id) {
    const t = await env.DB.prepare(
      "SELECT rating_avg, rating_n FROM technicians WHERE id = ?"
    ).bind(r.technician_id).first();
    if (t) {
      const n = (t.rating_n || 0) + 1;
      const avg = Math.round((((t.rating_avg || 0) * (t.rating_n || 0)) + r.stars) / n * 100) / 100;
      await env.DB.prepare("UPDATE technicians SET rating_avg = ?, rating_n = ? WHERE id = ?")
        .bind(avg, n, r.technician_id).run();
    }
  }
  return r;
}

// Webhook de Admira: guarda en webhook_inbox (dedupe por event_id) y crea la intervención.
async function ingestAdmira(env, request) {
  const payload = await body(request);
  const eventId = payload.event_id || payload.id || null;

  // Idempotencia: si ya existe ese event_id procesado, no duplicar.
  if (eventId) {
    const seen = await env.DB.prepare(
      "SELECT id, processed FROM webhook_inbox WHERE source = 'admira' AND event_id = ?"
    ).bind(eventId).first();
    if (seen) return { duplicate: true, event_id: eventId };
  }

  const signatureOk = await verifySignature(env, request, payload);
  const inboxId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO webhook_inbox (id, source, event_id, signature_ok, payload_raw, processed)
     VALUES (?, 'admira', ?, ?, ?, 0)`
  ).bind(inboxId, eventId, signatureOk ? 1 : 0, JSON.stringify(payload)).run();

  if (!signatureOk) {
    await env.DB.prepare("UPDATE webhook_inbox SET error = 'bad signature' WHERE id = ?")
      .bind(inboxId).run();
    const err = new Error("invalid signature"); err.status = 401; throw err;
  }

  // Mapea el evento Admira -> intervención (esquema demo: id de texto, campos planos).
  const ivRows = await insert(env, "interventions", {
    id: "iv-adm-" + (eventId || crypto.randomUUID()),
    store_id: payload.store_id || null,
    store_name: payload.store_name || null,
    region: payload.region || null,
    surface: payload.surface || null,
    surface_type: payload.surface_type || null,
    type: payload.type || "incidencia", origin: "admira", status: "nueva",
    priority: payload.priority || "media",
    title: payload.title || "Incidencia detectada en " + (payload.surface || payload.store_id || "punto de venta"),
    description: payload.description || "",
    source_event: eventId,
  });
  await env.DB.prepare("UPDATE webhook_inbox SET processed = 1 WHERE id = ?").bind(inboxId).run();
  return { created: Array.isArray(ivRows) ? ivRows[0] : ivRows, event_id: eventId };
}

// HMAC-SHA256 de la firma de Admira (cabecera X-Yokup-Signature). Si no hay secret, acepta (dev).
async function verifySignature(env, request, payload) {
  const secret = env.ADMIRA_WEBHOOK_SECRET;
  if (!secret) return true; // modo dev: sin secret configurado
  const sig = request.headers.get("X-Yokup-Signature") || "";
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(JSON.stringify(payload)));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(hex, sig.replace(/^sha256=/, ""));
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// --- helpers ---------------------------------------------------------------

async function body(request) { try { return await request.json(); } catch { return {}; } }

function cors(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://www.yokup.com";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Yokup-Signature",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function json(request, obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(request) },
  });
}
