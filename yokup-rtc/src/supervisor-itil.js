import { publicCi } from "../../api/src/itil-model.js";

// Lectura del maestro ITIL por el binding existente. La sesión de agentes ya
// puede consultar fichas (/ticket/equipo); aquí recibe sólo el contrato Galaxia.
export async function handleSupervisorItil(req, env, { session, access, json }) {
  const reply = (body, status = 200) => {
    const response = json(body, status);
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  if (req.method !== "GET") return reply({ ok:false, error:"method_not_allowed" }, 405);
  const agent = session?.email === "agentes@silicio.admiranext.com";
  if (!agent && !(access?.allowed === true && access?.canChangeProject === true)) {
    return reply({ ok:false, error:"inventory_forbidden" }, 403);
  }
  const store = new URL(req.url).searchParams.get("xpacio") || "";
  if (!/^[A-Za-z0-9][\w.:-]{0,159}$/.test(store)) return reply({ ok:false, error:"invalid_xpacio" }, 400);
  if (!env.INCIDENT_DESK?.fetch) return reply({ ok:false, error:"inventory_unavailable" }, 503);
  try {
    const response = await env.INCIDENT_DESK.fetch(new Request(
      "https://yokup-api.internal/internal/itil/xpacios/" + encodeURIComponent(store),
      { headers:{ accept:"application/json" } }
    ));
    const data = await response.json();
    if (response.status === 404) return reply({ ok:false, error:"xpacio_not_found" }, 404);
    if (data.xpacio?.removed_at) return reply({ ok:false, error:"xpacio_not_found" }, 404);
    if (!response.ok || data.ok !== true || data.xpacio?.admira_store_id !== store || !Array.isArray(data.cis)) {
      return reply({ ok:false, error:"inventory_unavailable" }, 502);
    }
    const cis = data.cis.filter(ci => ci.lifecycle?.status !== "retired").map(ci => ({
      ...publicCi({ ...ci, parent_code:ci.parent_itil_code, status:ci.lifecycle?.status || "unknown",
        warranty:ci.lifecycle?.warranty, maintenance_due:ci.lifecycle?.maintenance_due }),
      open_incidents:Math.max(0, Number(ci.open_incidents) || 0)
    }));
    return reply({ ok:true, schema:"supervisor.itil/1", generated_at:new Date().toISOString(),
      xpacio:{ id:store, name:data.site?.name || store, city:data.site?.city || "", brand:data.xpacio?.brand_key || "" },
      managed_by:data.managed_by, cis });
  } catch {
    return reply({ ok:false, error:"inventory_unavailable" }, 502);
  }
}
