// FICHA DE INVENTARIO DESDE LA INCIDENCIA (01-oct-2026 · GrokBot executor · MacMini, por encargo de Carlos).
// El «Equipo» de un ticket (screen, p. ej. 'demo:starbucks-alsea-paseo-de-gracia:tpv:manual:<uuid>') se resuelve
// contra el inventario ITIL de Yokup (yokup-api · D1 yokup-db) por el service binding INCIDENT_DESK, a
// /internal/itil/equipo (solo por binding; sin secretos). Lo pide la ficha /ticket y el informe con la sesión
// del helpdesk (ruta protegida). Docs: docs/itil-yokup.md · «Equipo de la incidencia → ficha de inventario».
export const EQUIPO_PATH = "/ticket/equipo";
export const EQUIPO_URL = "https://yokup-api.internal/internal/itil/equipo";
const TICKET_ID = /^[A-Za-z0-9][\w:-]{0,79}$/, CODE = /^[A-Z0-9]{2,12}(-[A-Z0-9]{2,12}){1,3}$/;
const clip = (v, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** Parámetros para yokup-api a partir del ticket (y su enlace al Portal, si lo tiene). */
export function equipoQuery(ticket, portal) {
  const q = new URLSearchParams();
  const ref = clip(ticket && ticket.screen), loc = clip(ticket && ticket.loc, 160);
  if (ref) q.set("ref", ref);
  if (loc) q.set("loc", loc);
  const pid = clip(portal && portal.incident_id, 180) || (/^portal:(.+)$/.exec(ref) || [])[1] || "";
  if (pid) q.set("portal_incident", pid);
  return q;
}

export async function handleEquipoInventario(req, env, { json, portalLinksFor }) {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url), id = clip(url.searchParams.get("id"), 80), code = clip(url.searchParams.get("code"), 51);
  if (!id && !code) return json({ ok: false, error: "id-or-code-required" }, 400);
  if (id && !TICKET_ID.test(id)) return json({ ok: false, error: "bad-id" }, 400);
  if (code && !CODE.test(code)) return json({ ok: false, error: "bad-code" }, 400);
  let q = new URLSearchParams(), ticket = null;
  if (id) {
    ticket = await env.DB.prepare("SELECT id, screen, loc, project, subject FROM tickets WHERE id=?").bind(id).first();
    if (!ticket) return json({ ok: false, error: "not-found" }, 404);
    const portal = portalLinksFor ? (await portalLinksFor(env, [ticket.id])).get(ticket.id) : null;
    q = equipoQuery(ticket, portal);
  }
  if (code) q.set("code", code);
  const out = { ticket: ticket ? { id: ticket.id, screen: ticket.screen || null, loc: ticket.loc || null } : null };
  if (!env.INCIDENT_DESK) return json({ ok: false, error: "inventory_unavailable", ...out }, 503);
  try {
    const res = await env.INCIDENT_DESK.fetch(new Request(EQUIPO_URL + "?" + q, { headers: { accept: "application/json" } }));
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok !== true) return json({ ok: false, error: "inventory_unavailable", status: res.status, ...out }, 502);
    return json({ ...data, ...out });
  } catch {
    return json({ ok: false, error: "inventory_unavailable", ...out }, 502);
  }
}
