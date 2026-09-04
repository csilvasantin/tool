const LIVE_MAX_AGE_SECONDS = 30;
const STATUS_VALUES = new Set(["queued", "accepted", "running", "stopping", "stopped", "done", "failed", "rejected", "already_running", "already_stopped"]);

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
  const runtime = requiredText(input && input.runtime, "runtime", 30);
  const session_id = requiredText(input && input.session_id, "session_id", 80);
  if (host === "app" && session_id !== "desktop:" + runtime.toLowerCase()) {
    throw new AgentStopError("desktop-session-runtime-mismatch", 400);
  }
  if (host === "cli" && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(session_id)) {
    throw new AgentStopError("unsafe-cli-session", 400);
  }
  return {
    machine: requiredText(input && input.machine, "machine", 60),
    persona: requiredText(input && input.persona, "persona", 60),
    runtime,
    host,
    session_id,
    pid,
  };
}

export function normalizeAgentStartTarget(input) {
  const host = requiredText(input && input.host, "host", 8).toLowerCase();
  if (host !== "app" && host !== "cli") throw new AgentStopError("invalid-host", 400);
  const runtime = requiredText(input && input.runtime, "runtime", 30);
  const session_id = requiredText(input && input.session_id, "session_id", 80);
  if (host === "app" && session_id !== "desktop:" + runtime.toLowerCase()) {
    throw new AgentStopError("desktop-session-runtime-mismatch", 400);
  }
  if (host === "cli" && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(session_id)) {
    throw new AgentStopError("unsafe-cli-session", 400);
  }
  return {
    machine:requiredText(input && input.machine, "machine", 60),
    persona:requiredText(input && input.persona, "persona", 60),
    runtime, host, session_id, pid:0
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
  // D1 serializa un Number enlazado a una columna TEXT como "2367.0". Si el
  // navegador consulta después "2367", la auditoría no encuentra la orden y el
  // panel termina en control-failed aunque el watcher ya la haya completado.
  // Los ids son identificadores opacos: se normalizan siempre a texto antes de
  // devolverlos y persistirlos.
  if (Number.isSafeInteger(value) && value > 0) return String(value);
  const id = String(value == null ? "" : value).trim();
  return id && id.length <= 100 && /^[A-Za-z0-9._:-]+$/.test(id) ? id : "";
}

function publicExecutionError(value) {
  const detail = String(value == null ? "" : value).trim().toLowerCase();
  if (detail === "watcher lease expired") return "agent-control-watcher-timeout";
  if (detail.startsWith("desktop stop failed:")) return "desktop-stop-failed";
  return detail ? "agent-control-execution-failed" : "";
}

export function sanitizeAgentStopResult(input) {
  const commandId = safeCommandId(input && (input.command_id || input.id));
  if (!commandId) throw new AgentStopError("invalid-upstream-command", 502);
  const rawStatus = String(input && input.status || "").trim().toLowerCase();
  return { ok:true, command_id:commandId, status:STATUS_VALUES.has(rawStatus) ? rawStatus : "accepted" };
}

export async function readAgentControlResult(env, id) {
  if (!env || !env.TELEGRAM || typeof env.TELEGRAM.fetch !== "function") {
    throw new AgentStopError("telegram-binding-unavailable", 503);
  }
  const safeId = safeCommandId(id);
  if (!safeId) throw new AgentStopError("invalid-upstream-command", 400);
  let response;
  try {
    response = await env.TELEGRAM.fetch(new Request("https://telegram/api/fleet/agent/commands/" + encodeURIComponent(safeId), {
      headers:{ accept:"application/json" }
    }));
  } catch {
    throw new AgentStopError("agent-control-status-unavailable", 502);
  }
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) throw new AgentStopError(response.status === 404 ? "agent-control-command-not-found" : "agent-control-status-unavailable", response.status === 404 ? 404 : 502);
  const command = payload.command || payload;
  const status = String(command.status || "").trim().toLowerCase();
  const action = String(command.action || "").trim().toLowerCase();
  if (!STATUS_VALUES.has(status)) throw new AgentStopError("agent-control-status-invalid", 502);
  if (action !== "start" && action !== "stop") throw new AgentStopError("agent-control-command-mismatch", 409);
  return {
    ok:status !== "failed" && status !== "rejected", command_id:safeId, action, status,
    error:publicExecutionError(command.error || command.detail), updated_at:Number(command.updated_at || 0) || null
  };
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

export async function dispatchAgentStart(env, input) {
  if (!env || !env.TELEGRAM || typeof env.TELEGRAM.fetch !== "function") {
    throw new AgentStopError("telegram-binding-unavailable", 503);
  }
  const target = normalizeAgentStartTarget(input);
  let response;
  try {
    response = await env.TELEGRAM.fetch(new Request("https://telegram/api/fleet/agent/control", {
      method:"POST", headers:{ "content-type":"application/json", accept:"application/json" },
      body:JSON.stringify({ ...target, action:"start" })
    }));
  } catch {
    throw new AgentStopError("start-service-unavailable", 502);
  }
  let result = {};
  try { result = await response.json(); } catch {}
  if (!response.ok) {
    const status = response.status === 400 || response.status === 403 ? response.status : response.status === 409 ? 409 : 502;
    const upstream = String(result && result.error || "").trim().toLowerCase();
    const publicCode = new Set(["desktop-session-runtime-mismatch", "unsafe-cli-session", "machine_watcher_stale", "start_target_not_advertised"]);
    throw new AgentStopError(publicCode.has(upstream) ? upstream.replaceAll("_", "-") : "start-command-rejected", status);
  }
  if (String(result.status || "") === "already_running") {
    return { target, result:{ ok:true, command_id:"already-running", status:"already_running" } };
  }
  return { target, result:sanitizeAgentStopResult(result) };
}
