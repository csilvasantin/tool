// ── CIRCUITOS DE CARTELERÍA DIGITAL · GET/POST /circuits ────────────────────
// Carlos, 14-sep-2026: «los circuitos tienen que alimentarse también de yokup.com».
// Admira es la dueña de la identidad de los circuitos (docs/integracion-circuitos-
// mantenimiento.md), así que Yokup NO guarda su propia lista: da de alta en el
// registro único de admira (api.admira.store/grid/circuits) y lo creado aparece
// en admira.tv/digitalsignage/#circuitos en el siguiente refresco.
//
// Ambos métodos exigen la sesión del perímetro. La clave de servicio
// ADMIRA_CIRCUIT_SERVICE_KEY vive solo en el Worker: el navegador nunca la ve.

export const ADMIRA_CIRCUITS_API = "https://api.admira.store/grid";

const ID_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/;

function cleanLabel(value, max) {
  return String(value || "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

// Valida lo que llega del formulario. Un id que no cumple se rechaza tal cual:
// nunca se «arregla» en otro circuito distinto del que la persona escribió.
export function parseCircuitForm(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "bad-request" };
  const circuit = String(body.circuit || "").trim().toLowerCase();
  if (!ID_RE.test(circuit)) return { error: "bad-circuit" };
  const project = String(body.project || "").trim().toLowerCase();
  if (project && !ID_RE.test(project)) return { error: "bad-project" };
  const out = { circuit, name: cleanLabel(body.name, 60) || circuit, project };
  const projectName = cleanLabel(body.project_name, 60);
  if (project && projectName) out.project_name = projectName;
  return out;
}

// Canales + registro → una sola lista para pintar: cada circuito con su canal
// (o «sin canal») y su origen. Pura, para probarla sin red.
export function mergeCircuits(projects, registry) {
  const byId = new Map();
  for (const p of Array.isArray(projects) ? projects : []) {
    for (const c of Array.isArray(p.circuits) ? p.circuits : []) {
      if (!byId.has(c)) byId.set(c, { id: c, name: c, projects: [], source: "admira" });
      byId.get(c).projects.push({ id: p.id, name: p.name });
    }
  }
  for (const r of Array.isArray(registry) ? registry : []) {
    if (!r || !r.id) continue;
    const row = byId.get(r.id) || { id: r.id, name: r.id, projects: [], source: r.source || "api" };
    row.name = r.name || row.name;
    row.source = r.source || row.source;
    row.created_at = r.created_at || "";
    byId.set(r.id, row);
  }
  return [...byId.values()].sort((a, b) => (a.projects.length ? 0 : -1) - (b.projects.length ? 0 : -1) || a.id.localeCompare(b.id));
}

async function readAdmira(fetcher, path) {
  const r = await fetcher(ADMIRA_CIRCUITS_API + path, { headers: { "user-agent": "yokup-rtc/circuits" } });
  if (!r.ok) throw Object.assign(new Error("admira_unavailable"), { status: 502 });
  return r.json();
}

export async function handleCircuits(req, env, { json, requireAuth, fetcher = fetch }) {
  const session = await requireAuth(env, req);
  if (!session) return json({ ok: false, error: "unauthorized" }, 401);
  try {
    if (req.method === "GET") {
      const [projects, registry] = await Promise.all([readAdmira(fetcher, "/projects"), readAdmira(fetcher, "/circuits")]);
      return json({ ok: true, projects: projects.projects || [], circuits: mergeCircuits(projects.projects, registry.circuits) });
    }
    if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
    if (!env.ADMIRA_CIRCUIT_SERVICE_KEY) return json({ ok: false, error: "admira_circuits_not_configured" }, 503);
    let body;
    try { body = await req.json(); } catch { return json({ ok: false, error: "bad-json" }, 400); }
    const form = parseCircuitForm(body);
    if (form.error) return json({ ok: false, error: form.error }, 400);
    const r = await fetcher(ADMIRA_CIRCUITS_API + "/circuits", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + env.ADMIRA_CIRCUIT_SERVICE_KEY, "user-agent": "yokup-rtc/circuits" },
      body: JSON.stringify({ ...form, source: "yokup", actor: String(session.email || "").slice(0, 120) })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok !== true) return json({ ok: false, error: d.error || "admira_rejected" }, r.status >= 400 && r.status < 500 ? 409 : 502);
    return json({ ok: true, circuit: d.circuit, created: !!d.created, project: d.project || null, project_created: !!d.project_created,
      admira_url: "https://admira.tv/digitalsignage/#circuitos" });
  } catch (error) {
    return json({ ok: false, error: String(error.message || "circuits_failed").slice(0, 80) }, Number(error.status) || 500);
  }
}
