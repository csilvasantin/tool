import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AgentStopError, dispatchAgentStop, normalizeAgentStopTarget,
  sanitizeAgentStopResult, selectLiveAgentSession
} from "./src/fleet-agent-stop.js";

const target = {
  machine:"MacMini", persona:"Oráculo", runtime:"Codex", host:"app",
  session_id:"desktop:codex", pid:4321
};
const now = 1_785_800_000;
const live = { ...target, verified:1, source:"process_snapshot", online:1, updated:now - 2 };
const workerSource = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

test("el target exige los seis identificadores y un PID de proceso", () => {
  assert.deepEqual(normalizeAgentStopTarget(target), target);
  assert.throws(() => normalizeAgentStopTarget({ ...target, session_id:"" }), /invalid-session_id/);
  assert.throws(() => normalizeAgentStopTarget({ ...target, pid:1 }), /invalid-pid/);
  assert.throws(() => normalizeAgentStopTarget({ ...target, host:"web" }), /invalid-host/);
});

test("sólo selecciona una sesión de snapshot verificada y fresca", () => {
  assert.equal(selectLiveAgentSession([live], target, now), live);
  assert.throws(() => selectLiveAgentSession([{ ...live, verified:0 }], target, now), /agent-offline-or-stale/);
  assert.throws(() => selectLiveAgentSession([{ ...live, updated:now - 31 }], target, now), /agent-offline-or-stale/);
  assert.throws(() => selectLiveAgentSession([live, { ...live }], target, now), /ambiguous-agent-target/);
});

test("acepta la identidad completa sólo cuando el apellido coincide con la máquina", () => {
  assert.equal(selectLiveAgentSession([live], { ...target, persona:"OraculoMacMini" }, now), live);
  assert.throws(() => selectLiveAgentSession([live], { ...target, persona:"OraculoMacBook" }, now), /agent-offline-or-stale/);
});

test("el puente usa exclusivamente hostname telegram y reenvía la identidad confirmada", async () => {
  const calls = [];
  const env = { TELEGRAM:{ async fetch(request) {
    calls.push(request);
    if (new URL(request.url).pathname === "/api/presence") {
      return Response.json({ ok:true, now, presence:[live] });
    }
    return Response.json({ ok:true, command_id:"stop_abc-123", status:"queued", internal:"secret" }, { status:202 });
  } } };
  const out = await dispatchAgentStop(env, { ...target, persona:"OraculoMacMini" });
  assert.deepEqual(calls.map(request => new URL(request.url).hostname), ["telegram", "telegram"]);
  assert.equal(new URL(calls[1].url).pathname, "/api/fleet/agent/stop");
  assert.deepEqual(JSON.parse(await calls[1].clone().text()), target);
  assert.deepEqual(out.result, { ok:true, command_id:"stop_abc-123", status:"queued" });
});

test("respuesta pública sanea estado y rechaza ids no trazables", () => {
  assert.deepEqual(sanitizeAgentStopResult({ command_id:42, status:"queued" }), {
    ok:true, command_id:42, status:"queued"
  });
  assert.deepEqual(sanitizeAgentStopResult({ id:"cmd:9", status:"valor-interno", secret:"x" }), {
    ok:true, command_id:"cmd:9", status:"accepted"
  });
  assert.throws(() => sanitizeAgentStopResult({ command_id:"id con espacios", status:"queued" }), AgentStopError);
});

test("la ruta pública queda tras el perímetro Google y audita cada intento válido", () => {
  assert.match(workerSource, /PROTECTED[^\n]+"\/fleet\/agent\/stop"/);
  const gate = workerSource.indexOf("if (PROTECTED.has(url.pathname)");
  const route = workerSource.indexOf('if (url.pathname === "/fleet/agent/stop")');
  assert.ok(gate >= 0 && route > gate, "la ruta debe ejecutarse después del gate");
  assert.match(workerSource, /CREATE TABLE IF NOT EXISTS fleet_agent_commands/);
  assert.match(workerSource, /INSERT INTO fleet_agent_commands/);
  assert.match(workerSource, /requested_by/);
});
