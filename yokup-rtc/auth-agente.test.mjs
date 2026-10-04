import test from "node:test";
import assert from "node:assert/strict";
import { handleAuthRequest } from "./src/auth-flow.js";

const TOKEN = "t".repeat(64);
const env = { ADMIRA_AGENT_LOGIN_TOKEN: TOKEN };
const deps = {
  clientId: "x",
  whitelist: async () => new Set(),
  makeSession: async (_e, email, name) => `sess:${email}:${name}`,
  readSession: async () => null
};

test("auth/agente GET pinta la entrada", async () => {
  const r = await handleAuthRequest(new Request("https://api.admira.biz/auth/agente"), env, deps);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Entrada de agentes/);
});

test("auth/agente Bearer malo → 401", async () => {
  const r = await handleAuthRequest(new Request("https://api.admira.biz/auth/agente", {
    method: "POST", headers: { Authorization: "Bearer malo", "X-Agente": "Woz" }
  }), env, deps);
  assert.equal(r.status, 401);
  assert.equal((await r.json()).ok, false);
});

test("auth/agente Bearer bueno → 200", async () => {
  const r = await handleAuthRequest(new Request("https://api.admira.biz/auth/agente", {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "X-Agente": "WozSmith" }
  }), env, deps);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.ok, true);
  assert.equal(body.agent, true);
  assert.equal(body.name, "WozSmith");
  assert.match(r.headers.get("set-cookie") || "", /__Host-yk_session=/);
});

test("auth/agente Bearer sin X-Agente → 400 (no «sin nombre»)", async () => {
  const r = await handleAuthRequest(new Request("https://api.admira.app/auth/agente", {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }
  }), env, deps);
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "falta X-Agente");
  assert.notEqual(body.name, "sin nombre");
});
