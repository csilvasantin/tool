import test from "node:test";
import assert from "node:assert/strict";
import {
  ackMatchesCommand,
  authorizeCliExecutor,
  canonicalCliMachine,
  canonicalCliTarget,
  cliAckTransition,
  desiredStateForAction,
  validateCliAckBody
} from "./src/cli-executor-contract.js";

const request = (authorization) => new Request("https://api.yokup.test/fleet/cli/pending?machine=MacMini", {
  headers:authorization ? { authorization } : {}
});

test("pending/ack fallan cerrado sin binding ni Bearer válido", async () => {
  assert.deepEqual(await authorizeCliExecutor({}, request("Bearer local-token")), {
    ok:false, status:503, code:"executor_auth_not_configured",
    error:"autenticación del ejecutor no configurada"
  });
  assert.equal((await authorizeCliExecutor({ YOKUP_CLI_EXECUTOR_TOKEN:"local-token" }, request())).status, 401);
  assert.equal((await authorizeCliExecutor({ YOKUP_CLI_EXECUTOR_TOKEN:"local-token" }, request("Bearer wrong"))).status, 401);
  assert.deepEqual(await authorizeCliExecutor(
    { YOKUP_CLI_EXECUTOR_TOKEN:"local-token" }, request("Bearer local-token")
  ), { ok:true });
});

test("machine/cli/action usan el catálogo cerrado y nombres canónicos", () => {
  assert.equal(canonicalCliMachine("macmini"), "MacMini");
  assert.equal(canonicalCliMachine("macbookairrosa"), "MacBookAirRosa");
  assert.equal(canonicalCliMachine("MACBOOKAIRCREMA"), "MacBookAirCrema");
  assert.deepEqual(canonicalCliTarget("MACMINI", "GROK"), {
    machine:"MacMini", cli:"grok", kind:"cli", label:"Grok · CLI"
  });
  assert.equal(canonicalCliTarget("MacMini; rm -rf /", "grok"), null);
  assert.equal(canonicalCliTarget("MacMini", "bash"), null);
  assert.equal(desiredStateForAction("start"), "running");
  assert.equal(desiredStateForAction("stop"), "stopped");
  assert.equal(desiredStateForAction("mission"), null);
});

test("heartbeat exige estado observado completo y ACK con id exige status", () => {
  const heartbeat = validateCliAckBody({ machine:"macmini", cli:"grok", alive:true, pid:321 });
  assert.equal(heartbeat.ok, true);
  assert.equal(heartbeat.machine, "MacMini");
  assert.equal(heartbeat.pid, 321);
  assert.equal(validateCliAckBody({ machine:"MacMini", cli:"bash", alive:true }).code, "invalid_target");
  assert.equal(validateCliAckBody({ machine:"MacMini", cli:"grok", alive:"yes" }).code, "invalid_alive");
  assert.equal(validateCliAckBody({ machine:"MacMini", cli:"grok", alive:true, id:"CLI-1" }).code, "invalid_ack_status");
  assert.equal(validateCliAckBody({ machine:"MacMini", cli:"grok", alive:true, status:"done" }).code, "ack_id_required");
});

test("ACK es monotónico e idempotente", () => {
  assert.deepEqual(cliAckTransition("queued", "running"), { ok:true, duplicate:false, status:"running" });
  assert.deepEqual(cliAckTransition("running", "done"), { ok:true, duplicate:false, status:"done" });
  assert.deepEqual(cliAckTransition("done", "done"), { ok:true, duplicate:true, status:"done" });
  assert.equal(cliAckTransition("done", "failed").code, "command_already_terminal");
  assert.equal(cliAckTransition("superseded", "done").code, "command_not_acknowledgeable");
});

test("un ACK no puede cambiar target ni declarar éxito contrario al proceso", () => {
  const command = { machine:"MacMini", cli:"grok", action:"start", status:"running" };
  assert.equal(ackMatchesCommand(command, { machine:"MacBookPro14", cli:"grok", status:"done", alive:true }).code,
    "command_target_mismatch");
  assert.equal(ackMatchesCommand(command, { machine:"MacMini", cli:"grok", status:"done", alive:false }).code,
    "command_state_mismatch");
  assert.deepEqual(ackMatchesCommand(command, { machine:"MacMini", cli:"grok", status:"done", alive:true }),
    { ok:true, action:"start" });
  assert.equal(ackMatchesCommand(
    { machine:"MacMini", cli:"grok", action:"mission" },
    { machine:"MacMini", cli:"grok", status:"done", alive:false }
  ).code, "command_state_mismatch");
});
