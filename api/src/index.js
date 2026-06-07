/**
 * yokup-api — Cloudflare Worker
 * API entre el frontend estático de Yokup y Supabase (PostgREST).
 *
 * La service_role key vive SOLO aquí (secret del worker), nunca en el navegador.
 * El frontend habla con este worker; el worker habla con Supabase con privilegios.
 *
 * Secrets (wrangler secret put):
 *   SUPABASE_URL           https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE  service_role key
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
 *   POST   /api/telegram/webhook                actualizaciones del bot de Telegram (Grok)
 */

import { handleUpdate } from "./bot.js";
import { tgSend, verifyTelegram } from "./telegram.js";
import { triageIntervention } from "./grok.js";

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
      return json(request, { error: String(e && e.message || e) }, e.status || 500);
    }
  },
};

async function route(p, request, env, url) {
  const [resource, id] = p;
  const m = request.method;

  if (resource === "health") return { body: { ok: true, ts: Date.now() } };

  // ---- interventions ----
  if (resource === "interventions") {
    if (m === "GET")   return { body: await sb(env, "GET", "intervention?order=created_at.desc") };
    if (m === "POST")  return { body: await sb(env, "POST", "intervention", await body(request)), status: 201 };
    if (m === "PATCH" && id)
      return { body: await sb(env, "PATCH", `intervention?id=eq.${enc(id)}`, await body(request)) };
  }

  // ---- technicians ----
  if (resource === "technicians") {
    if (m === "GET")  return { body: await sb(env, "GET", "technician?order=created_at.desc") };
    if (m === "POST") return { body: await sb(env, "POST", "technician", await body(request)), status: 201 };
    if (m === "PATCH" && id)
      return { body: await sb(env, "PATCH", `technician?id=eq.${enc(id)}`, await body(request)) };
  }

  // ---- stores (altas manuales de puntos en Yokup) ----
  if (resource === "stores") {
    if (m === "GET")  return { body: await sb(env, "GET", "store?order=synced_at.desc") };
    if (m === "POST") return { body: await sb(env, "POST", "store", await body(request)), status: 201 };
  }

  // ---- ratings ----
  if (resource === "ratings") {
    if (m === "GET") {
      const iv = url.searchParams.get("intervention_id");
      const q = iv ? `rating?intervention_id=eq.${enc(iv)}` : "rating?order=created_at.desc";
      return { body: await sb(env, "GET", q) };
    }
    if (m === "POST") return { body: await addRating(env, await body(request)), status: 201 };
  }

  // ---- ingesta webhook Admira (idempotente vía webhook_inbox) ----
  if (resource === "ingest" && id === "admira" && m === "POST")
    return { body: await ingestAdmira(env, request), status: 202 };

  // ---- webhook del bot de Telegram ----
  if (resource === "telegram" && id === "webhook" && m === "POST") {
    if (!verifyTelegram(env, request)) { const e = new Error("bad telegram secret"); e.status = 401; throw e; }
    const update = await body(request);
    // No bloqueamos la respuesta a Telegram con el procesado (evita reintentos).
    await handleUpdate(env, update, { sb }).catch(err => console.error("tg handleUpdate", err));
    return { body: { ok: true } };
  }

  return { body: { error: "not found", path: p }, status: 404 };
}

// --- Lógica de negocio que toca varias tablas -----------------------------

// Inserta valoración y recalcula rating_avg/rating_n del técnico (media incremental).
async function addRating(env, payload) {
  const rows = await sb(env, "POST", "rating", payload);
  const r = Array.isArray(rows) ? rows[0] : rows;
  if (r && r.technician_id) {
    const techs = await sb(env, "GET", `technician?id=eq.${enc(r.technician_id)}&select=rating_avg,rating_n`);
    const t = techs[0] || { rating_avg: 0, rating_n: 0 };
    const n = (t.rating_n || 0) + 1;
    const avg = Math.round((((t.rating_avg || 0) * (t.rating_n || 0)) + r.stars) / n * 100) / 100;
    await sb(env, "PATCH", `technician?id=eq.${enc(r.technician_id)}`, { rating_avg: avg, rating_n: n });
  }
  return r;
}

// Webhook de Admira: guarda en webhook_inbox (dedupe por event_id) y crea la intervención.
async function ingestAdmira(env, request) {
  const payload = await body(request);
  const eventId = payload.event_id || payload.id || null;

  // Idempotencia: si ya existe ese event_id procesado, no duplicar.
  if (eventId) {
    const seen = await sb(env, "GET",
      `webhook_inbox?source=eq.admira&event_id=eq.${enc(eventId)}&select=id,processed`);
    if (seen.length) return { duplicate: true, event_id: eventId };
  }

  const signatureOk = await verifySignature(env, request, payload);
  const inboxRows = await sb(env, "POST", "webhook_inbox", {
    source: "admira", event_id: eventId, signature_ok: signatureOk,
    payload_raw: payload, processed: false,
  });
  const inbox = Array.isArray(inboxRows) ? inboxRows[0] : inboxRows;

  if (!signatureOk) {
    await sb(env, "PATCH", `webhook_inbox?id=eq.${enc(inbox.id)}`, { error: "bad signature" });
    const err = new Error("invalid signature"); err.status = 401; throw err;
  }

  // Mapea el evento Admira -> intervención.
  const iv = await sb(env, "POST", "intervention", {
    store_id: payload.store_id, surface_id: payload.surface_id || null,
    type: payload.type || "incidencia", origin: "admira", status: "nueva",
    priority: payload.priority || "media",
    title: payload.title || "Incidencia detectada en " + (payload.surface || payload.store_id),
    description: payload.description || "",
    source_event: eventId,
  });
  await sb(env, "PATCH", `webhook_inbox?id=eq.${enc(inbox.id)}`, { processed: true });
  const created = Array.isArray(iv) ? iv[0] : iv;
  await notifyNewIntervention(env, created).catch(e => console.error("tg notify", e));
  return { created, event_id: eventId };
}

// Avisa al grupo GrokControl de una intervención nueva, con triaje de Grok.
// Degrada en silencio: si Telegram/Grok no están configurados, no rompe la ingesta.
async function notifyNewIntervention(env, iv) {
  const chat = env.TELEGRAM_CHAT_GROKCONTROL;
  if (!chat || !env.TELEGRAM_BOT_TOKEN || !iv) return;
  const tri = await triageIntervention(env, iv);
  const summary = tri?.summary || iv.title;
  const priority = tri?.priority || iv.priority;
  await tgSend(env, chat, [
    `🆕 *Nueva intervención* — ${iv.type}`,
    `[${priority}] ${summary}`,
    `Punto: ${iv.store_id}`,
    `\`${iv.id}\``,
  ].join("\n"));
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
  const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(hex, sig.replace(/^sha256=/, ""));
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// --- Cliente Supabase REST (PostgREST) ------------------------------------

async function sb(env, method, path, payload) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) {
    const e = new Error("worker sin SUPABASE_URL / SUPABASE_SERVICE_ROLE configurados"); e.status = 503; throw e;
  }
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE}`,
    "Content-Type": "application/json",
  };
  if (method === "POST" || method === "PATCH") headers["Prefer"] = "return=representation";
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method, headers, body: payload != null ? JSON.stringify(payload) : undefined,
  });
  const text = await r.text();
  if (!r.ok) { const e = new Error(`supabase ${r.status}: ${text}`); e.status = r.status; throw e; }
  return text ? JSON.parse(text) : null;
}

// --- helpers ---------------------------------------------------------------

const enc = encodeURIComponent;
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
