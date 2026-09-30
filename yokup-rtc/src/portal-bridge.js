// INCIDENCIAS UNIFICADAS (FLT-101298 · MorfeoMacMini · 30-sep-2026) — lado bandeja Yokup (A).
// Carlos: «Yokup es fundamental para la Galaxia Admira al encargarse de la gestión de todas las incidencias».
// El portal del comercio y el Desk (yokup-api, B) son la fuente de verdad del ciclo de CAMPO (técnico, cita,
// cierre con evidencia, valoración); esta bandeja es la única de TODO. Cada incidencia de B tiene aquí su
// ticket (espejo `portal:<id>` o el ticket del que nació) enlazado en portal_links. Diseño completo y
// reglas de estados en docs/incidencias-unificadas.md.
//  · B → A: POST https://yokup-rtc.internal/internal/portal/sync (service binding RTC de yokup-api).
//  · A → B: solo los cierres, por el binding INCIDENT_DESK; con técnico asignado B los rechaza y aquí se reabre.
//  · Anti-bucle: lo que viene de B se guarda como portal_state y nunca se devuelve; A solo empuja un cierre
//    que B aún no tiene. Reintentos con espera exponencial desde la rutina programada.
export const PORTAL_INTERNAL_HOST = "yokup-rtc.internal";
export const PORTAL_INTERNAL_PREFIX = "/internal/portal/";
export const PORTAL_STATUS_URL = "https://yokup-api.internal/internal/incident-links/rtc-status";
export const PORTAL_AUTHOR = "Portal del comercio";
export const PORTAL_LINKS_SQL = "CREATE TABLE IF NOT EXISTS portal_links (ticket_id TEXT PRIMARY KEY, portal_incident_id TEXT NOT NULL UNIQUE, origin TEXT NOT NULL, site_name TEXT, establishment TEXT, portal_url TEXT, portal_state TEXT, technician_name TEXT, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, next_attempt_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)";
const STATES = ["open", "assigned", "resolved", "rated"], CLOSED = ["resolved", "cancelled"];
const PORTAL_ID = /^[\w:.-]{1,180}$/, TICKET = /^[A-Za-z0-9][\w:-]{2,79}$/, BATCH = 25, MAX_BACKOFF_MIN = 60;
const run = (env, sql, ...v) => env.DB.prepare(sql).bind(...v).run();
const first = (env, sql, ...v) => env.DB.prepare(sql).bind(...v).first();
const all = async (env, sql, ...v) => (await env.DB.prepare(sql).bind(...v).all()).results || [];
const clip = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : "");
const fail = (status, message) => Object.assign(new Error(message), { status });

/** Solo un service binding llega con este host y sin las cabeceras que el borde pone a todo el tráfico público. */
export function viaBinding(req, host = PORTAL_INTERNAL_HOST) {
  try { return new URL(req.url).hostname === host && !req.headers.get("cf-connecting-ip") && !req.headers.get("cf-ray"); } catch { return false; }
}

// Ticket espejo de una incidencia nacida en el portal: recurso `portal:<id>` (idx_active_screen impide el
// duplicado) y proyecto = establecimiento con el MISMO slug que las pantallas del censo.
async function createMirror(env, p, deps, now) {
  const site = p.site && typeof p.site === "object" ? p.site : null;
  const project = site && deps.ensureEstablishmentProject ? await deps.ensureEstablishmentProject(env, clip(site.establishment, 160), clip(site.name, 120), now) : null;
  // createIncident reparte ids INC-<5 del reloj><1 azar>: dos altas en el mismo ms chocan 1 de cada 36 veces
  // (el lote del portal crea varias seguidas). El choque no crea nada: se reintenta con otro id.
  let id = null;
  for (let attempt = 0; !id && attempt < 4; attempt++) {
    try { id = await deps.createIncident(env, mirrorIncident(p, site, project)); }
    catch (e) { if (e && e.code !== "incident_insert_conflict" || attempt === 3) throw e; }
  }
  return id ? first(env, "SELECT id,status FROM tickets WHERE id=?", id) : null;
}
function mirrorIncident(p, site, project) {
  return {
    resource: "portal:" + p.portal_incident_id, kind: "screen", source: "portal-comercio",
    severity: p.priority === "urgent" ? "urgente" : "alta",
    subject: clip(p.title, 200) || "Incidencia del portal del comercio",
    detail: [site ? PORTAL_AUTHOR + " · " + clip(site.name, 120) : "Yokup Desk", p.device && clip(p.device.name, 120) ? "equipo " + clip(p.device.name, 120) : "", clip(p.description, 500)].filter(Boolean).join(" · "),
    ...(project ? { project_id: project.id, loc: clip(site.name, 80) } : site ? { loc: clip(site.establishment, 80), loc_name: clip(site.name, 80) } : { project_id: "yokup" }),
    by: PORTAL_AUTHOR, assignee: "Yokup Desk"
  };
}

/** Aplica el estado de una incidencia de B. Crea o enlaza el ticket la primera vez. Idempotente. */
export async function applyPortalSync(env, p, deps, now = Date.now()) {
  if (!p || typeof p !== "object" || !PORTAL_ID.test(String(p.portal_incident_id || "")) || !STATES.includes(p.state))
    throw fail(400, "portal_incident_id y state (open|assigned|resolved|rated) requeridos");
  const pid = p.portal_incident_id, site = p.site && typeof p.site === "object" ? p.site : null;
  let link = await first(env, "SELECT * FROM portal_links WHERE portal_incident_id=?", pid);
  let ticket = link && await first(env, "SELECT id,status FROM tickets WHERE id=?", link.ticket_id);
  if (link && !ticket) { await run(env, "DELETE FROM portal_links WHERE ticket_id=?", link.ticket_id); link = null; } // ticket borrado a mano: se recrea
  let created = false;
  if (!link) {
    const own = TICKET.test(String(p.rtc_ticket_id || "")) ? await first(env, "SELECT id,status FROM tickets WHERE id=?", p.rtc_ticket_id) : null;
    ticket = own || await createMirror(env, p, deps, now);
    if (!ticket) throw fail(409, "ticket_not_created");
    created = !own;
    await run(env, "INSERT OR IGNORE INTO portal_links(ticket_id,portal_incident_id,origin,created_at,updated_at) VALUES(?,?,?,?,?)", ticket.id, pid, p.origin === "rtc" ? "rtc" : "portal", now, now);
    link = await first(env, "SELECT * FROM portal_links WHERE portal_incident_id=?", pid);
    if (!link) throw fail(409, "ticket_already_linked");
    await deps.addEvent(env, ticket.id, "portal", PORTAL_AUTHOR, `Enlazada con la incidencia ${pid} del portal` + (site ? " · " + clip(site.name, 120) : " (Yokup Desk, sin comercio)") + ".");
    // Revisión que pide el comercio tras una valoración mala: ticket nuevo enlazado con el del padre.
    const parent = PORTAL_ID.test(String(p.parent_portal_incident_id || "")) ? await first(env, "SELECT ticket_id FROM portal_links WHERE portal_incident_id=?", p.parent_portal_incident_id) : null;
    if (parent) {
      await deps.addEvent(env, ticket.id, "portal", PORTAL_AUTHOR, `Revisión de ${parent.ticket_id}: el comercio indicó que sigue fallando.`);
      await deps.addEvent(env, parent.ticket_id, "portal", PORTAL_AUTHOR, `El comercio pidió revisión: ticket ${ticket.id}.`);
    }
  }
  const prev = ticket.status, state = p.state, before = link.portal_state || "", tech = clip(p.technician_name, 80) || link.technician_name || "";
  // B manda en el campo: técnico asignado ⇒ en curso (reabre si aquí se había cerrado); resuelta ⇒ resuelta
  // salvo que aquí se eliminara; «open» nunca baja un estado de A.
  const next = state === "assigned" ? "in_progress" : state === "open" ? prev : prev === "cancelled" ? "cancelled" : "resolved";
  if (next !== prev) await run(env, "UPDATE tickets SET status=?,updated_at=?,resolved_at=? WHERE id=?", next, now, next === "resolved" ? now : null, ticket.id);
  if (next !== prev && CLOSED.includes(prev))
    await deps.addEvent(env, ticket.id, "status", PORTAL_AUTHOR, `Estado → ${next}: sigue en curso en el portal del comercio` + (tech ? ` (técnico ${tech})` : "") + "; se cierra allí con evidencia.");
  else if (state !== before && state === "assigned")
    await deps.addEvent(env, ticket.id, next !== prev ? "status" : "portal", PORTAL_AUTHOR, `Técnico asignado en el portal: ${tech || "técnico"}.`);
  if ((state === "resolved" || state === "rated") && !["resolved", "rated"].includes(before)) {
    const evidence = /^https:\/\//.test(p.evidence_url || "") ? " Evidencia: " + p.evidence_url.slice(0, 800) : "";
    await deps.addEvent(env, ticket.id, next !== prev ? "status" : "portal", PORTAL_AUTHOR, "Resuelta en el portal" + (tech ? " por " + tech : "") + (clip(p.resolution, 500) ? ": " + clip(p.resolution, 500) : ".") + evidence);
  }
  if (state === "rated" && before !== "rated" && p.rating && Number.isInteger(p.rating.stars))
    await deps.addEvent(env, ticket.id, "rating", PORTAL_AUTHOR, `Valoración del comercio: ${p.rating.stars}★ · ` + (p.rating.satisfied ? "funciona." : "sigue fallando" + (p.followup_id ? `, revisión ${clip(p.followup_id, 180)} abierta.` : ".")));
  await run(env, "UPDATE portal_links SET portal_state=?,site_name=?,establishment=?,portal_url=?,technician_name=?,attempts=0,last_error=NULL,next_attempt_at=0,updated_at=? WHERE ticket_id=?",
    state, site ? clip(site.name, 120) || null : link.site_name, site ? clip(site.establishment, 160) || null : link.establishment,
    /^https:\/\/www\.yokup\.com\//.test(p.portal_url || "") ? p.portal_url.slice(0, 300) : link.portal_url, tech || null, now, ticket.id);
  return { ok: true, ticket_id: ticket.id, status: next, created };
}

/** Empuja a B los cierres de A que B aún no tiene. La respuesta trae el estado de B y se aplica igual que un empuje. */
export async function pushPortalChanges(env, deps, now = Date.now()) {
  const out = { pushed: 0, failed: 0 };
  if (!env.INCIDENT_DESK) return { ...out, skipped: "portal_binding_missing" };
  const due = await all(env, "SELECT k.*,t.status FROM portal_links k JOIN tickets t ON t.id=k.ticket_id WHERE t.status IN ('resolved','cancelled') AND COALESCE(k.portal_state,'') NOT IN ('resolved','rated') AND k.next_attempt_at<=? ORDER BY k.updated_at,k.ticket_id LIMIT ?", now, BATCH);
  for (const row of due) {
    let error = "";
    try {
      const res = await env.INCIDENT_DESK.fetch(new Request(PORTAL_STATUS_URL, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ portal_incident_id: row.portal_incident_id, rtc_ticket_id: row.ticket_id, status: row.status, by: "Yokup" }) }));
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok !== true || !STATES.includes(data.state)) error = "portal_rejected_" + res.status;
      else { await applyPortalSync(env, { ...data, portal_incident_id: row.portal_incident_id }, deps, now); out.pushed++; }
    } catch (e) { error = e && e.status ? "portal_apply_" + e.status : "portal_unreachable"; }
    if (error) {
      await run(env, "UPDATE portal_links SET attempts=attempts+1,last_error=?,next_attempt_at=?,updated_at=? WHERE ticket_id=?", error, now + Math.min(MAX_BACKOFF_MIN, 2 ** Math.min(Number(row.attempts) || 0, 6)) * 60000, now, row.ticket_id);
      out.failed++;
    }
  }
  return out;
}

/** Técnico asignado en el portal: A no puede cerrar (ni el reconcile auto-cerrar) ese ticket. Sin tabla, nada. */
export async function portalAssigned(env, ticketId) {
  try { const r = await first(env, "SELECT technician_name FROM portal_links WHERE ticket_id=? AND portal_state='assigned'", ticketId); return r ? { technician_name: r.technician_name || "" } : null; }
  catch { return null; }
}

/** Marca «Portal del comercio · establecimiento» de cada ticket, para /tickets y /ticket. Nunca rompe la lista. */
export async function portalLinksFor(env, ids) {
  const map = new Map();
  try {
    for (let i = 0; i < ids.length; i += 90) {
      const chunk = ids.slice(i, i + 90);
      for (const r of await all(env, `SELECT ticket_id,portal_incident_id,origin,site_name,portal_url,portal_state,technician_name FROM portal_links WHERE ticket_id IN (${chunk.map(() => "?").join(",")})`, ...chunk))
        map.set(r.ticket_id, { incident_id: r.portal_incident_id, origin: r.origin, site_name: r.site_name || null, url: r.portal_url || null, state: r.portal_state || null, technician_name: r.technician_name || null });
    }
  } catch {}
  return map;
}

export async function handlePortalInternal(req, env, deps) {
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  if (!viaBinding(req)) return reply({ error: "not-found" }, 404);
  try {
    if (new URL(req.url).pathname !== "/internal/portal/sync" || req.method !== "POST") return reply({ error: "not-found" }, 404);
    const raw = await req.text();
    if (raw.length > 32768) return reply({ ok: false, error: "too-large" }, 413);
    let p; try { p = JSON.parse(raw); } catch { p = null; }
    if (!p || typeof p !== "object" || Array.isArray(p)) return reply({ ok: false, error: "bad-json" }, 400);
    if (deps.ensureSchema) await deps.ensureSchema(env);
    return reply(await applyPortalSync(env, p, deps));
  } catch (e) {
    return reply({ ok: false, error: String(e && e.message || e).slice(0, 200) }, Number(e && e.status) || 500);
  }
}
