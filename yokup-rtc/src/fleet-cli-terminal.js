import { AgentStopError, normalizeAgentStopTarget, selectLiveAgentSession } from "./fleet-agent-stop.js";

const TERMINAL_STATUSES = new Set(["queued", "running", "done", "failed"]);
const MAX_WRITE = 4000;
const MAX_OUTPUT = 65536;

function terminalText(value) {
  const text = String(value == null ? "" : value);
  if (!text || text.length > MAX_WRITE || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    throw new AgentStopError("invalid-terminal-text", 400);
  }
  return text;
}

function commandId(value) {
  const id = String(value == null ? "" : value).trim();
  if (!id || id.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(id)) {
    throw new AgentStopError("invalid-terminal-command", 400);
  }
  return id;
}

function rowsFromPresence(payload) {
  return Array.isArray(payload) ? payload : (payload && (payload.presence || payload.rows)) || [];
}

function epochSeconds(value) {
  const n = Number(value || 0);
  return n > 4102444800 ? Math.floor(n / 1000) : Math.floor(n);
}

function requireBinding(env) {
  if (!env || !env.TELEGRAM || typeof env.TELEGRAM.fetch !== "function") {
    throw new AgentStopError("telegram-binding-unavailable", 503);
  }
}

export function normalizeCliTerminalRequest(input) {
  const action = String(input && input.action || "").trim().toLowerCase();
  if (action !== "read" && action !== "write") throw new AgentStopError("invalid-terminal-action", 400);
  const target = normalizeAgentStopTarget(input);
  if (target.host !== "cli") throw new AgentStopError("terminal-requires-cli", 400);
  return { ...target, action, text:action === "write" ? terminalText(input && input.text) : "" };
}

export async function dispatchCliTerminal(env, input) {
  requireBinding(env);
  const request = normalizeCliTerminalRequest(input);
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
  const session = selectLiveAgentSession(rowsFromPresence(presence), request, now);
  const confirmed = {
    machine:String(session.machine || "").trim(), persona:String(session.persona || "").trim(),
    runtime:String(session.runtime || "").trim(), host:"cli",
    session_id:String(session.session_id || "").trim(), pid:Number(session.pid),
    action:request.action, text:request.text
  };
  let response;
  try {
    response = await env.TELEGRAM.fetch(new Request("https://telegram/api/fleet/cli/terminal", {
      method:"POST", headers:{ "content-type":"application/json", accept:"application/json" },
      body:JSON.stringify(confirmed)
    }));
  } catch {
    throw new AgentStopError("terminal-service-unavailable", 502);
  }
  let result = {};
  try { result = await response.json(); } catch {}
  if (!response.ok) {
    const status = response.status === 400 ? 400 : response.status === 404 || response.status === 409 ? 409 : 502;
    throw new AgentStopError(String(result && result.error || "terminal-command-rejected"), status);
  }
  return {
    target:{ ...confirmed, text:undefined },
    result:{ ok:true, command_id:commandId(result.command_id || result.id), status:"queued" }
  };
}

export async function readCliTerminalResult(env, id) {
  requireBinding(env);
  const safeId = commandId(id);
  let response;
  try {
    response = await env.TELEGRAM.fetch(new Request("https://telegram/api/fleet/agent/commands/" + encodeURIComponent(safeId), {
      headers:{ accept:"application/json" }
    }));
  } catch {
    throw new AgentStopError("terminal-service-unavailable", 502);
  }
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const status = response.status === 404 ? 404 : 502;
    throw new AgentStopError(status === 404 ? "terminal-command-not-found" : "terminal-status-unavailable", status);
  }
  const command = payload.command || payload;
  const status = String(command.status || "").trim().toLowerCase();
  if (!TERMINAL_STATUSES.has(status)) throw new AgentStopError("terminal-status-invalid", 502);
  const action = String(command.action || "").trim().toLowerCase();
  if (action !== "terminal_read" && action !== "terminal_write") {
    throw new AgentStopError("terminal-command-mismatch", 409);
  }
  return {
    ok:status !== "failed", command_id:safeId, action:action === "terminal_write" ? "write" : "read",
    status, output:String(command.output || command.result || "").slice(-MAX_OUTPUT),
    error:String(command.error || "").slice(0, 300), updated_at:Number(command.updated_at || 0) || null
  };
}
