import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { handleCircuits, mergeCircuits, parseCircuitForm } from "./src/admira-circuits.js";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
const signedIn = async () => ({ email: "operador@admira.com" });
const anonymous = async () => null;

test("el formulario rechaza ids que habría que inventar", () => {
  assert.deepEqual(parseCircuitForm({ circuit: " Farmacias-BCN ", name: " Farmacias  BCN " }), { circuit: "farmacias-bcn", name: "Farmacias BCN", project: "" });
  assert.equal(parseCircuitForm({ circuit: "farmacias!" }).error, "bad-circuit");
  assert.equal(parseCircuitForm({ circuit: "f" }).error, "bad-circuit");
  assert.equal(parseCircuitForm({ circuit: "farma", project: "canal farma" }).error, "bad-project");
  assert.equal(parseCircuitForm({ circuit: "farma", project: "canal-farma", project_name: "Canal Farma" }).project_name, "Canal Farma");
});

test("la lista junta canales y registro, y lo que no tiene canal va primero", () => {
  const rows = mergeCircuits(
    [{ id: "kiosk", name: "CanalKiosk", circuits: ["kiosko"] }],
    [{ id: "farmacias", name: "Farmacias", source: "yokup", created_at: "t" }, { id: "kiosko", name: "Kioskos BCN", source: "yokup" }]
  );
  assert.deepEqual(rows.map(r => r.id), ["farmacias", "kiosko"]);
  assert.deepEqual(rows[1].projects, [{ id: "kiosk", name: "CanalKiosk" }]);
  assert.equal(rows[1].name, "Kioskos BCN");
  assert.equal(rows[0].source, "yokup");
});

test("sin sesión del perímetro no se lee ni se escribe", async () => {
  const r = await handleCircuits(new Request("https://x/circuits"), {}, { json, requireAuth: anonymous, fetcher: () => { throw new Error("no debe llamar"); } });
  assert.equal(r.status, 401);
});

test("el alta va a admira con la clave de servicio y firma con el email de la sesión", async () => {
  let call;
  const fetcher = async (url, init) => { call = { url, init }; return json({ ok: true, circuit: { id: "farmacias" }, created: true, project: null }); };
  const req = new Request("https://x/circuits", { method: "POST", body: JSON.stringify({ circuit: "farmacias", name: "Farmacias" }) });
  const r = await handleCircuits(req, { ADMIRA_CIRCUIT_SERVICE_KEY: "svc" }, { json, requireAuth: signedIn, fetcher });
  const d = await r.json();
  assert.equal(r.status, 200);
  assert.equal(d.created, true);
  assert.equal(call.url, "https://api.admira.store/grid/circuits");
  assert.equal(call.init.headers.authorization, "Bearer svc");
  assert.deepEqual(JSON.parse(call.init.body), { circuit: "farmacias", name: "Farmacias", project: "", source: "yokup", actor: "operador@admira.com" });
  assert.doesNotMatch(JSON.stringify(d), /svc/, "la clave nunca vuelve al navegador");
});

test("sin clave configurada el alta falla cerrada", async () => {
  const req = new Request("https://x/circuits", { method: "POST", body: JSON.stringify({ circuit: "farmacias" }) });
  const r = await handleCircuits(req, {}, { json, requireAuth: signedIn, fetcher: () => { throw new Error("no debe llamar"); } });
  assert.equal(r.status, 503);
});

test("el worker enruta /circuits al módulo", () => {
  assert.match(source, /from "\.\/admira-circuits\.js"/);
  assert.match(source, /url\.pathname === "\/circuits"/);
});
