// FLT-100480 · Consumo por proyecto (tokens + hosting map).
// Atribución: un agente en N proyectos → tokens repartidos a partes iguales.
// Hosting: solo lo declarado en hosting_cost_map (estimaciones, no factura CF).

import { memberRefMatches } from "./decision-project.js";

/** Tarifas ESTIMATE documentadas en UI (USD / millón de tokens). No son factura. */
export const TOKEN_USD_RATES = Object.freeze({
  entrada_per_mtok: 3,
  cache_per_mtok: 0.75,
  salida_per_mtok: 15,
  currency: "USD",
  label: "estimate",
  note: "Estimación interna FLT-100480 (input $3/MTok, cache $0.75/MTok, output $15/MTok). No es factura del proveedor.",
});

export const UNASSIGNED_PROJECT_ID = "_unassigned";
export const UNASSIGNED_PROJECT_NAME = "Sin asignar";

/** Semillas FLT-100478: valores 0; project_id best-guess o _unassigned. */
export const HOSTING_COST_MAP_SEED = Object.freeze([
  {
    id: "worker:admira-marketplace",
    kind: "worker",
    resource: "admira-marketplace",
    project_id: UNASSIGNED_PROJECT_ID,
    monthly_usd: 0,
    share_pct: 0,
    note: "FLT-100478 seed · sin proyecto xtanco en censo → _unassigned",
  },
  {
    id: "d1:admira-marketplace-db",
    kind: "d1",
    resource: "admira-marketplace-db",
    project_id: UNASSIGNED_PROJECT_ID,
    monthly_usd: 0,
    share_pct: 0,
    note: "FLT-100478 seed · marketplace D1 → _unassigned",
  },
  {
    id: "worker:yokup",
    kind: "worker",
    resource: "yokup",
    project_id: "yokup",
    monthly_usd: 0,
    share_pct: 0,
    note: "FLT-100478 seed · worker yokup → proyecto yokup",
  },
  {
    id: "d1:yokup-tickets",
    kind: "d1",
    resource: "yokup-tickets",
    project_id: "yokup",
    monthly_usd: 0,
    share_pct: 0,
    note: "FLT-100478 seed · D1 yokup-tickets → proyecto yokup",
  },
  {
    id: "worker:admira-telegram",
    kind: "worker",
    resource: "admira-telegram",
    project_id: "telegram",
    monthly_usd: 0,
    share_pct: 0,
    note: "FLT-100478 seed · worker admira-telegram → proyecto telegram",
  },
  {
    id: "d1:admira-telegram",
    kind: "d1",
    resource: "admira-telegram",
    project_id: "telegram",
    monthly_usd: 0,
    share_pct: 0,
    note: "FLT-100478 seed · D1 admira-telegram → proyecto telegram",
  },
]);

export const HOSTING_COST_MAP_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS hosting_cost_map (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  resource TEXT NOT NULL,
  project_id TEXT NOT NULL,
  monthly_usd REAL NOT NULL DEFAULT 0,
  share_pct REAL NOT NULL DEFAULT 0,
  note TEXT,
  updated_at INTEGER,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_hcm_project ON hosting_cost_map(project_id);
`;

export function tokensUsdEstimate(entrada, cache, salida, rates = TOKEN_USD_RATES) {
  const e = Number(entrada) || 0;
  const c = Number(cache) || 0;
  const s = Number(salida) || 0;
  return (e / 1e6) * rates.entrada_per_mtok
    + (c / 1e6) * rates.cache_per_mtok
    + (s / 1e6) * rates.salida_per_mtok;
}

/** Proyectos (ids) a los que pertenece un owner vía project_members kind=agent. */
export function projectIdsForOwner(owner, members) {
  const ids = [];
  const seen = new Set();
  for (const m of members || []) {
    if (!m || m.kind !== "agent") continue;
    if (!memberRefMatches("agent", m.ref, owner)) continue;
    const pid = String(m.project_id || "").trim();
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    ids.push(pid);
  }
  return ids;
}

function emptyTokens() {
  return { total: 0, entrada: 0, cache: 0, salida: 0, usd_estimate: 0 };
}

function addTokens(dst, src, factor = 1) {
  dst.total += (Number(src.total) || 0) * factor;
  dst.entrada += (Number(src.entrada) || 0) * factor;
  dst.cache += (Number(src.cache) || 0) * factor;
  dst.salida += (Number(src.salida) || 0) * factor;
}

function finalizeTokens(t, rates) {
  t.usd_estimate = tokensUsdEstimate(t.entrada, t.cache, t.salida, rates);
  return t;
}

/**
 * Agrega partes de consumo (mismo shape que /fleet/consumo) por proyecto.
 * Equal-split si el agente está en 2+ proyectos; sin proyecto → _unassigned.
 */
export function aggregateConsumoByProject({
  partes = [],
  members = [],
  projects = [],
  hostingRows = [],
  rates = TOKEN_USD_RATES,
  dias = 7,
} = {}) {
  const nameById = new Map();
  for (const p of projects || []) {
    if (p && p.id) nameById.set(String(p.id), String(p.name || p.id));
  }
  nameById.set(UNASSIGNED_PROJECT_ID, UNASSIGNED_PROJECT_NAME);

  const byProject = new Map();
  const ensure = (projectId) => {
    const id = projectId || UNASSIGNED_PROJECT_ID;
    if (!byProject.has(id)) {
      byProject.set(id, {
        project_id: id,
        name: nameById.get(id) || id,
        tokens: emptyTokens(),
        hosting: { monthly_usd: 0, share_pct_total: 0, resources: [] },
        agents: [],
        _agentMap: new Map(),
      });
    }
    return byProject.get(id);
  };

  // Pre-create rows for projects that only have hosting
  for (const h of hostingRows || []) {
    if (h && h.project_id) ensure(String(h.project_id));
  }

  for (const p of partes || []) {
    const d = p.datos || {};
    const tok = {
      total: Number(d.total || d.total_tokens || 0) || 0,
      entrada: Number(d.entrada || d.input_tokens || 0) || 0,
      cache: Number(d.cache || d.cached_input_tokens || 0) || 0,
      salida: Number(d.salida || d.output_tokens || 0) || 0,
    };
    const owner = String(p.owner || "").trim();
    const machine = String(p.machine || "").trim();
    const projectIds = projectIdsForOwner(owner, members);
    const targets = projectIds.length ? projectIds : [UNASSIGNED_PROJECT_ID];
    const factor = 1 / targets.length;
    for (const pid of targets) {
      const row = ensure(pid);
      addTokens(row.tokens, tok, factor);
      const ak = owner + " · " + machine;
      const ag = row._agentMap.get(ak) || (row._agentMap.set(ak, {
        owner, machine, total_tokens: 0, entrada: 0, cache: 0, salida: 0, share: factor,
      }), row._agentMap.get(ak));
      ag.total_tokens += tok.total * factor;
      ag.entrada += tok.entrada * factor;
      ag.cache += tok.cache * factor;
      ag.salida += tok.salida * factor;
    }
  }

  for (const h of hostingRows || []) {
    const pid = String(h.project_id || UNASSIGNED_PROJECT_ID);
    const row = ensure(pid);
    const monthly = Number(h.monthly_usd) || 0;
    const share = Number(h.share_pct) || 0;
    row.hosting.monthly_usd += monthly;
    row.hosting.share_pct_total += share;
    row.hosting.resources.push({
      id: h.id,
      kind: h.kind,
      resource: h.resource,
      monthly_usd: monthly,
      share_pct: share,
      note: h.note || "",
    });
  }

  const proyectos = [...byProject.values()].map((row) => {
    finalizeTokens(row.tokens, rates);
    row.agents = [...row._agentMap.values()]
      .map((a) => ({
        owner: a.owner,
        machine: a.machine,
        total_tokens: a.total_tokens,
        entrada: a.entrada,
        cache: a.cache,
        salida: a.salida,
        share: a.share,
      }))
      .sort((x, y) => y.total_tokens - x.total_tokens);
    delete row._agentMap;
    return row;
  }).sort((a, b) => (b.tokens.total - a.tokens.total) || a.name.localeCompare(b.name));

  const totales = {
    tokens: emptyTokens(),
    hosting_monthly_usd: 0,
    agents: 0,
  };
  const agentSeen = new Set();
  for (const p of proyectos) {
    addTokens(totales.tokens, p.tokens);
    totales.hosting_monthly_usd += p.hosting.monthly_usd;
    for (const a of p.agents) agentSeen.add(a.owner + "|" + a.machine);
  }
  finalizeTokens(totales.tokens, rates);
  totales.agents = agentSeen.size;
  totales.usd_estimate = totales.tokens.usd_estimate + totales.hosting_monthly_usd;

  return {
    ok: true,
    dias,
    rates: { ...rates },
    attribution: "equal_split",
    attribution_note: "Si un agente está en varios proyectos, sus tokens se parten a partes iguales entre esos proyectos.",
    proyectos,
    totales,
  };
}

export function normalizeHostingMapItem(raw, now = Date.now(), updatedBy = "") {
  const id = String((raw && raw.id) || "").trim().slice(0, 120);
  const kind = String((raw && raw.kind) || "other").trim().toLowerCase().slice(0, 40);
  const resource = String((raw && raw.resource) || "").trim().slice(0, 120);
  const project_id = String((raw && raw.project_id) || UNASSIGNED_PROJECT_ID).trim().slice(0, 80) || UNASSIGNED_PROJECT_ID;
  if (!id) return { ok: false, error: "id requerido" };
  if (!["worker", "d1", "kv", "r2", "do", "other"].includes(kind)) {
    return { ok: false, error: "kind debe ser worker|d1|kv|r2|do|other" };
  }
  if (!resource) return { ok: false, error: "resource requerido" };
  const monthly_usd = Number(raw && raw.monthly_usd);
  const share_pct = Number(raw && raw.share_pct);
  if (!Number.isFinite(monthly_usd) || monthly_usd < 0) return { ok: false, error: "monthly_usd inválido" };
  if (!Number.isFinite(share_pct) || share_pct < 0 || share_pct > 100) return { ok: false, error: "share_pct inválido" };
  return {
    ok: true,
    item: {
      id,
      kind,
      resource,
      project_id,
      monthly_usd,
      share_pct,
      note: String((raw && raw.note) || "").trim().slice(0, 400),
      updated_at: now,
      updated_by: String(updatedBy || "").slice(0, 80),
    },
  };
}
