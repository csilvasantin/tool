// FLT-1596 · «en qué está» cada agente de carbono, vía MCP de Yarigai.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { carbonId } from "./src/carbon-members.js";
import { CARBON_YARIGAI_SEED, carbonActivity, clearCarbonActivityCache, mcpClient, mcpToolText, normalizeCarbonYarigai, parseMcpBody, summarizeActivity, yarigaiUser } from "./src/carbon-activity.js";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

function fakeYarigai({ token = "ymcp_ok", tarea = "Tarea en curso de Carlos: conectar yarig.ai con el player de la taza", oficina = "Carlos está fichado en Madrid" } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ method: body.method, auth: init.headers.authorization || "", session: init.headers["mcp-session-id"] || "", args: body.params && body.params.arguments });
    const headers = new Map([["mcp-session-id", "sess-1"], ["content-type", "text/event-stream"]]);
    const res = (rpc) => ({ status: 200, headers: { get: (k) => headers.get(k.toLowerCase()) || "" }, text: async () => "event: message\ndata: " + JSON.stringify(rpc) + "\n\n" });
    if (body.method === "initialize") return res({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18", serverInfo: { name: "Yarigai" } } });
    if (body.method === "notifications/initialized") return { status: 202, headers: { get: () => "" }, text: async () => "" };
    const authorized = (init.headers.authorization || "") === "Bearer " + token;
    const text = !authorized ? "Falta el token MCP. Configura tu cliente con la cabecera Authorization: Bearer <tu-token>, generado en el portal."
      : body.params.name === "tareas" ? tarea : oficina;
    return res({ jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text }], structuredContent: { result: text }, isError: false } });
  };
  return { fetchImpl, calls };
}

test("Carlos es csilva@admira.com en los dos: la semilla del puente y el usuario que se pasa a Yarigai", () => {
  assert.deepEqual(CARBON_YARIGAI_SEED, [{ carbon_id: "carlos3-0", name: "Carlos3.0", email: "csilva@admira.com" }]);
  assert.equal(carbonId("Carlos3.0"), "carlos3-0");
  assert.equal(yarigaiUser("csilva@admira.com"), "csilva");
  assert.equal(yarigaiUser("  CSILVA@ADMIRA.COM "), "csilva");
});

test("el alta del puente exige nombre y un email real, y deriva el id igual que el censo", () => {
  const bad = normalizeCarbonYarigai({ name: "Moises3.0", email: "moises" }, carbonId, 1);
  assert.equal(bad.ok, false); assert.equal(bad.code, "email_invalid");
  const ok = normalizeCarbonYarigai({ name: " Moises3.0 ", email: "Moises@Admira.com", author: "NeoMBP14" }, carbonId, 5);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.row, { carbon_id: "moises3-0", name: "Moises3.0", email: "moises@admira.com", updated_at: 5, updated_by: "NeoMBP14" });
});

test("el cliente MCP lee SSE y JSON y conserva la sesión que le da el servidor", () => {
  const sse = parseMcpBody("text/event-stream", "event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"x\":1}}\n\n");
  assert.deepEqual(sse.result, { x: 1 });
  assert.deepEqual(parseMcpBody("application/json", "{\"jsonrpc\":\"2.0\",\"id\":1,\"error\":{\"code\":-32600,\"message\":\"Missing session ID\"}}").error.message, "Missing session ID");
  assert.equal(mcpToolText({ result: { content: [{ type: "text", text: "hola" }] } }).text, "hola");
  assert.equal(mcpToolText({ result: { isError: true, content: [{ type: "text", text: "mal" }] } }).ok, false);
});

test("con token: initialize → initialized → tareas+presencia por usuario, y la respuesta va junto al nombre", async () => {
  clearCarbonActivityCache();
  const y = fakeYarigai();
  const out = await carbonActivity({ people: [{ carbon_id: "carlos3-0", name: "Carlos3.0", email: "csilva@admira.com" }, { carbon_id: "moises3-0", name: "Moises3.0", email: "" }], token: "ymcp_ok", now: 1000, fetchImpl: y.fetchImpl });
  assert.equal(out.token_configured, true);
  const carlos = out.people[0];
  assert.equal(carlos.mapped, true);
  assert.equal(carlos.now.task, "conectar yarig.ai con el player de la taza");
  assert.equal(carlos.now.office, "Carlos está fichado en Madrid");
  assert.equal(carlos.error, "");
  assert.equal(out.people[1].mapped, false);
  assert.equal(out.people[1].now, null);
  assert.equal(out.people[1].error, "sin mapeo a Yarigai");
  assert.deepEqual(y.calls.map((c) => c.method), ["initialize", "notifications/initialized", "tools/call", "tools/call"]);
  assert.deepEqual(y.calls.slice(2).map((c) => c.args), [{ de: "csilva" }, { de: "csilva" }]);
  assert.ok(y.calls.slice(2).every((c) => c.session === "sess-1" && c.auth === "Bearer ymcp_ok"));
});

test("la caché evita repetir la consulta durante 60 s y caduca después", async () => {
  clearCarbonActivityCache();
  const y = fakeYarigai();
  const people = [{ carbon_id: "carlos3-0", name: "Carlos3.0", email: "csilva@admira.com" }];
  await carbonActivity({ people, token: "ymcp_ok", now: 1000, fetchImpl: y.fetchImpl });
  const cached = await carbonActivity({ people, token: "ymcp_ok", now: 30000, fetchImpl: y.fetchImpl });
  assert.equal(cached.people[0].checked_at, 1000);
  assert.equal(y.calls.filter((c) => c.method === "tools/call").length, 2);
  await carbonActivity({ people, token: "ymcp_ok", now: 70000, fetchImpl: y.fetchImpl });
  assert.equal(y.calls.filter((c) => c.method === "tools/call").length, 4);
});

test("sin token no se inventa nada: token_configured false, now null y el motivo", async () => {
  clearCarbonActivityCache();
  const y = fakeYarigai();
  const out = await carbonActivity({ people: [{ carbon_id: "carlos3-0", name: "Carlos3.0", email: "csilva@admira.com" }], token: "", fetchImpl: y.fetchImpl });
  assert.equal(out.token_configured, false);
  assert.equal(out.people[0].now, null);
  assert.equal(out.people[0].error, "sin token");
  assert.equal(y.calls.length, 0);
});

test("token rechazado por Yarigai: la prosa «Falta el token» se marca como error de token, no como tarea", async () => {
  clearCarbonActivityCache();
  const y = fakeYarigai({ token: "ymcp_otro" });
  const out = await carbonActivity({ people: [{ carbon_id: "carlos3-0", name: "Carlos3.0", email: "csilva@admira.com" }], token: "ymcp_malo", now: 5, fetchImpl: y.fetchImpl });
  assert.equal(out.people[0].now.task, "");
  assert.equal(out.people[0].error, "token");
  assert.equal(summarizeActivity({ ok: true, text: "Carlos no tiene ninguna tarea en curso." }, null).task, "");
});

test("el worker publica /carbon/activity (GET), /carbon/yarigai (GET) y el alta con fleet token", () => {
  assert.match(source, /url\.pathname === "\/carbon\/activity" && req\.method === "GET"/);
  assert.match(source, /url\.pathname === "\/carbon\/yarigai" && req\.method === "GET"/);
  assert.match(source, /url\.pathname === "\/carbon\/yarigai" && req\.method === "POST"/);
  assert.match(source, /fleet_token_required/);
  assert.match(source, /env\.YARIGAI_MCP_TOKEN/);
  assert.match(source, /CARBON_YARIGAI_TABLE_SQL/);
  assert.equal(typeof mcpClient, "function");
});
