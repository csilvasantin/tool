import {
  canonicalMachineSuffix,
  groupingIdentityKey,
  identityKey,
  machineSuffix,
  parseAgentIdentity,
  reportAgentFamily,
} from "./agent-identity.js";

export const AGENT_DETAIL_DEFAULT_LIMIT = 25;
export const AGENT_DETAIL_MAX_LIMIT = 100;
export const AGENT_DETAIL_PRESENCE_FRESH_MS = 30 * 1000;

function bounded(value, max) {
  const text = String(value == null ? "" : value).trim();
  return text && text.length <= max && !/[\u0000-\u001f\u007f]/.test(text) ? text : "";
}

function integerParam(value, fallback, maximum) {
  if (value == null || value === "") return { ok:true, value:fallback };
  if (!/^\d+$/.test(String(value))) return { ok:false };
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0
    ? { ok:true, value:Math.min(maximum, parsed) }
    : { ok:false };
}

// Contrato estable de la ficha. Acepta los mismos discriminantes que publica
// /api/presence; session_id sólo afina el match y nunca se devuelve al navegador.
export function parseAgentDetailQuery(params) {
  const agent = bounded(params.get("agent"), 100);
  const machine = bounded(params.get("machine"), 100);
  const runtime = bounded(params.get("runtime"), 100);
  const surface = bounded(params.get("surface"), 16).toLowerCase();
  const sessionIdRaw = params.get("session_id");
  const session_id = sessionIdRaw == null || sessionIdRaw === "" ? "" : bounded(sessionIdRaw, 200);
  if (!agent) return { ok:false, code:"invalid_agent", error:"agent requerido y válido" };
  if (!machine || !machineSuffix(machine)) return { ok:false, code:"invalid_machine", error:"machine canónica requerida" };
  if (!runtime) return { ok:false, code:"invalid_runtime", error:"runtime requerido y válido" };
  if (!['app','cli'].includes(surface)) return { ok:false, code:"invalid_surface", error:"surface debe ser app o cli" };
  if (sessionIdRaw != null && sessionIdRaw !== "" && !session_id) {
    return { ok:false, code:"invalid_session_id", error:"session_id inválido" };
  }
  const parsed = parseAgentIdentity(agent);
  const family = reportAgentFamily(agent, machine);
  const selectedSuffix = canonicalMachineSuffix(parsed.suffix || machineSuffix(machine));
  const physicalSuffix = canonicalMachineSuffix(machineSuffix(machine));
  if (!parsed.persona || !selectedSuffix || family.family_key.startsWith("external:")) {
    return { ok:false, code:"invalid_agent", error:"agent no pertenece al censo canónico" };
  }
  if (parsed.suffix && selectedSuffix !== physicalSuffix) {
    return { ok:false, code:"agent_machine_mismatch", error:"agent y machine no identifican el mismo equipo" };
  }
  const limit = integerParam(params.get("limit"), AGENT_DETAIL_DEFAULT_LIMIT, AGENT_DETAIL_MAX_LIMIT);
  const offset = integerParam(params.get("offset"), 0, Number.MAX_SAFE_INTEGER);
  if (!limit.ok || limit.value < 1) return { ok:false, code:"invalid_limit", error:"limit debe ser un entero entre 1 y 100" };
  if (!offset.ok) return { ok:false, code:"invalid_offset", error:"offset debe ser un entero positivo o cero" };
  const runtimeKey = runtime.toLowerCase();
  const surfaceKey = [family.family_key, identityKey(physicalSuffix), runtimeKey, surface, session_id]
    .join("\u001f");
  return { ok:true, agent, machine, runtime, runtime_key:runtimeKey, surface, session_id,
    limit:limit.value, offset:offset.value, parsed, family, machine_key:identityKey(physicalSuffix),
    grouping_key:groupingIdentityKey(agent, machine), surface_key:"surface:" + stableAgentDetailHash(surfaceKey) };
}

export function stableAgentDetailHash(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

// Los títulos de misión/tarea ya son públicos. `focus`, en cambio, nace en una
// línea de proceso y puede contener accidentalmente una credencial: se limpia y
// se recorta antes de usarlo como único fallback descriptivo.
export function safeAgentDetailText(value, fallback = "") {
  let text = String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [redactado]")
    .replace(/\b(api[-_ ]?key|token|password|passwd|secret|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[redactado]")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[redactado]@")
    .replace(/\s+/g, " ").trim();
  if (!text) text = String(fallback || "").trim();
  return text.slice(0, 200);
}

function millis(value) {
  let at = Number(value) || 0;
  if (at > 0 && at < 4_102_444_800) at *= 1000;
  return Number.isFinite(at) ? at : 0;
}

export function matchAgentDetailPresence(rows, query, now = Date.now()) {
  const matches = (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!row || row.verified !== 1 || row.source !== "process_snapshot" || row.online === 0 || row.online === false) return false;
    const pid = Number(row.pid);
    if (!Number.isSafeInteger(pid) || pid <= 1) return false;
    if (groupingIdentityKey(row.persona, row.machine) !== query.grouping_key) return false;
    if (String(row.runtime || "").trim().toLowerCase() !== query.runtime_key) return false;
    if (String(row.host || row.surface || "").trim().toLowerCase() !== query.surface) return false;
    return !query.session_id || String(row.session_id || "").trim() === query.session_id;
  }).sort((a, b) => millis(b.updated) - millis(a.updated));
  const selected = matches[0] || null;
  const liveAt = millis(selected && selected.updated);
  const fresh = !!selected && liveAt >= now - AGENT_DETAIL_PRESENCE_FRESH_MS && liveAt <= now + 5_000;
  return { matched:!!selected, fresh, ambiguous:!query.session_id && matches.length > 1,
    live_at:liveAt || null,
    focus:selected ? safeAgentDetailText(selected.focus) : "",
    mode:selected ? safeAgentDetailText(selected.mode) : "" };
}
