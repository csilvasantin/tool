const LIVE_MAX_AGE_SECONDS = 30;
const STATUS_VALUES = new Set(["queued", "accepted", "running", "stopping", "stopped", "failed", "rejected"]);

export class AgentStopError extends Error {
  constructor(code, status) {
    super(code);
    this.name = "AgentStopError";
    this.code = code;
    this.status = status;
  }
}

function requiredText(value, field, max) {
  const text = String(value == null ? "" : value).trim();
  if (!text || text.length > max) throw new AgentStopError(`invalid-${field}`, 400);
  return text;
}

export function normalizeAgentStopTarget(input) {
  const host = requiredText(input && input.host, "host", 8).toLowerCase();
  if (host !== "app" && host !== "cli") throw new AgentStopError("invalid-host", 400);
  const pid = Number(input && input.pid);
  if (!Number.isSafeInteger(pid) || pid <= 1) throw new AgentStopError("invalid-pid", 400);
  return {
    machine: requiredText(input && input.machine, "machine", 60),
    persona: requiredText(input && input.persona, "persona", 60),
    runtime: requiredText(input && input.runtime, "runtime", 30),
    host,
    session_id: requiredText(input && input.session_id, "session_id", 80),
    pid,
  };
}

function epochSeconds(value) {
  const n = Number(value || 0);
  return n > 4102444800 ? Math.floor(n / 1000) : Math.floor(n);
}

function lookupName(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function personaMatches(row, target) {
  const requested = lookupName(target.persona);
  const base = lookupName(row && row.persona);
  // El panel presenta la identidad operativa completa (OraculoMacMini), mientras
  // el snapshot de procesos conserva la persona base (Oráculo). La forma completa
  // sólo es alias válido si su sufijo es EXACTAMENTE la máquina de esa misma fila.
  return requested === base || requested === base + lookupName(row && row.machine);
}

export function selectLiveAgentSession(rows, target, nowSeconds = Math.floor(Date.now() / 1000)) {
  const exact = (rows || []).filter((row) => {
    const updated = epochSeconds(row && (row.updated || row.updated_at || row.ts));
    return row && row.verified === 1 && row.source === "process_snapshot" && row.online !== 0 &&
      updated >= nowSeconds - LIVE_MAX_AGE_SECONDS && updated <= nowSeconds + 5 &&
      String(row.machine || "").trim() === target.machine &&
      personaMatches(row, target) &&
      String(row.runtime || "").trim() === target.runtime &&
      String(row.host || "").trim().toLowerCase() === target.host &&
      String(row.session_id || "").trim() === target.session_id &&
      Number(row.pid) === target.pid;
  });
  if (!exact.length) throw new AgentStopError("agent-offline-or-stale", 409);
  if (exact.length !== 1) throw new AgentStopError("ambiguous-agent-target", 409);
  return exact[0];
}

function safeCommandId(value) {
  if (Number.isSafeInteger(value) && value > 0) return value;
  const id = String(value == null ? "" : value).trim();
  return id && id.length <= 100 && /^[A-Za-z0-9._:-]+$/.test(id) ? id : "";
}

export function sanitizeAgentStopResult(input) {
  const commandId = safeCommandId(input && (input.command_id || input.id));
  if (!commandId) throw new AgentStopError("invalid-upstream-command", 502);
  const rawStatus = String(input && input.status || "").trim().toLowerCase();
  return { ok:true, command_id:commandId, status:STATUS_VALUES.has(rawStatus) ? rawStatus : "accepted" };
}

export async function dispatchAgentStop(env, input) {
  if (!env || !env.TELEGRAM || typeof env.TELEGRAM.fetch !== "function") {
    throw new AgentStopError("telegram-binding-unavailable", 503);
  }
  const target = normalizeAgentStopTarget(input);
  let presenceResponse;
  try {
    presenceResponse = await env.TELEGRAM.fetch(new Request("https://telegram/api/presence", {
      headers:{ accept:"application/json" }
    }));
  } catch {
    throw new AgentStopError("presence-unavailable", 502);
  }
  if (!presenceResponse.ok) throw new AgentStopError("presence-unavailable", 502);
  let presence;
  try { presence = await presenceResponse.json(); }
  catch { throw new AgentStopError("presence-invalid", 502); }
  const now = epochSeconds(presence && presence.now) || Math.floor(Date.now() / 1000);
  const session = selectLiveAgentSession(Array.isArray(presence) ? presence : (presence.presence || presence.rows || []), target, now);
  const confirmedTarget = {
    machine:String(session.machine || "").trim(), persona:String(session.persona || "").trim(),
    runtime:String(session.runtime || "").trim(), host:String(session.host || "").trim().toLowerCase(),
    session_id:String(session.session_id || "").trim(), pid:Number(session.pid)
  };

  let stopResponse;
  try {
    stopResponse = await env.TELEGRAM.fetch(new Request("https://telegram/api/fleet/agent/stop", {
      method:"POST",
      headers:{ "content-type":"application/json", accept:"application/json" },
      body:JSON.stringify(confirmedTarget)
    }));
  } catch {
    throw new AgentStopError("stop-service-unavailable", 502);
  }
  let result = {};
  try { result = await stopResponse.json(); } catch {}
  if (!stopResponse.ok) {
    const status = stopResponse.status === 400 ? 400 : stopResponse.status === 404 || stopResponse.status === 409 ? 409 : 502;
    throw new AgentStopError(status === 409 ? "agent-changed-before-stop" : "stop-command-rejected", status);
  }
  return { target:confirmedTarget, result:sanitizeAgentStopResult(result) };
}
