import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "./src/index.js";
import { sitiosDelCenso, endpointsDeManifiesto, hostDe } from "./src/galaxia.js";

const signed = { version:"v.07.09.2026.r1.08:00", gitShort:"abc1234", dirty:false };
const env = () => ({ RELEASE_JSON: JSON.stringify(signed), ASSETS: { fetch: async () => new Response("asset") } });
const ctx = { waitUntil() {} };

const rpc = (result) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200, headers: { "content-type": "application/json" } });
function fetchFalso(visitas) {
  return async (url, init = {}) => {
    const u = String(url); visitas.push((init.method || "GET") + " " + u);
    if (u === "https://api.yokup.com/projects") return Response.json({ projects: [
      { id: "yokup", name: "Yokup", web: "www.yokup.com" }, { id: "smith-ascii", name: "Laboratorio ASCII", web: "https://www.yokup.com/misiones" },
      { id: "xpaceos", name: "XpaceOS", web: "https://www.xpaceos.com" }, { id: "galaxia-admira", name: "Galaxia Admira", web: "" },
      { id: "pixeria", name: "Pixeria", web: "https://www.pixeria.com" } ] });
    if (u === "https://www.xpaceos.com/help") return new Response("<h1>Ayuda</h1>");
    if (u === "https://www.xpaceos.com/mcp") return new Response("<h1>MCP</h1>");
    if (u === "https://www.xpaceos.com/mcp/llms.txt") return new Response("# XpaceOS");
    if (u === "https://www.xpaceos.com/mcp/manifest.json") return Response.json({ name: "XpaceOS", version: "2.1.0", endpoint: "https://mcp.admira.store/mcp", docs: { llms_txt: "https://www.xpaceos.com/mcp/llms.txt" } });
    if (u === "https://mcp.admira.store/mcp" && init.method === "POST") {
      const body = JSON.parse(init.body);
      if (body.method === "initialize") return new Response("event: message\ndata: " + JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18", serverInfo: { name: "XpaceOS", version: "2.1.0" } } }) + "\n\n", { headers: { "content-type": "text/event-stream" } });
      if (body.method === "tools/list") return rpc({ tools: [{ name: "quien_soy" }, { name: "fleet_status" }] });
    }
    if (u.startsWith("https://www.pixeria.com/")) return new Response("verja", { status: 401 });
    if (u === "https://www.yokup.com/mcp/manifest.json") return Response.json({ name: "yokup", mcp_server: { endpoint: "https://yokup.com/mcp" } });
    if (u === "https://yokup.com/mcp" && init.method === "POST") return Response.json({ error: "invalid_token" }, { status: 401 });
    if (u.startsWith("https://www.yokup.com/")) return new Response("ok");
    return new Response("404 Not Found", { status: 404 });
  };
}

test("el censo agrupa un sitio por host y los proyectos con ruta heredan sus puertas", () => {
  const sitios = sitiosDelCenso([{ id: "yokup", name: "Yokup", web: "www.yokup.com" }, { id: "smith-ascii", name: "ASCII", web: "https://www.yokup.com/misiones" }, { id: "sin-web", name: "x", web: "" }]);
  assert.equal(sitios.length, 1);
  assert.deepEqual(sitios[0].proyectos.map((p) => p.id), ["yokup"]);
  assert.deepEqual(sitios[0].hereda.map((p) => p.id), ["smith-ascii"]);
  assert.deepEqual(hostDe("admira.tv/cms"), { host: "admira.tv", path: "/cms" });
  const tv = sitiosDelCenso([{ id: "generador-de-informes", name: "Informes", web: "admira.live/informes" }, { id: "admira-live", name: "Admira Live", web: "https://www.admira.live" }, { id: "admira-tv", name: "Admira TV", web: "admira.tv" }]);
  assert.deepEqual(tv.map((s) => s.host), ["admira.live", "admira.tv"].map((d) => (d === "admira.live" ? "www.admira.live" : d)), "www y raíz son el mismo sitio; se mide por el host que declare el censo");
  assert.deepEqual(tv[0].hereda.map((p) => p.id), ["generador-de-informes"]);
});

test("del manifiesto solo salen endpoints MCP de verdad, sin llms ni ficheros", () => {
  assert.deepEqual(endpointsDeManifiesto({ endpoint: "https://mcp.admira.store/mcp/", mcp_servers: [{ endpoint: "https://mcp.admira.live/mcp" }], llms_txt: "https://x/mcp/llms.txt", url: "https://x/mcp/manifest.json" }), ["https://mcp.admira.store/mcp", "https://mcp.admira.live/mcp"]);
});

test("GET /mcp/galaxia.json devuelve el censo de sitios desde api.yokup.com/projects", async () => {
  const visitas = [];
  const r = await handleRequest(new Request("https://www.yokup.com/mcp/galaxia.json"), env(), ctx, fetchFalso(visitas));
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.deepEqual(d.sitios.map((s) => s.host), ["www.pixeria.com", "www.xpaceos.com", "www.yokup.com"]);
  assert.equal(r.headers.get("cache-control"), "public, max-age=3600");
  assert.deepEqual(visitas, ["GET https://api.yokup.com/projects"]);
});

test("?sitio= mide las dos puertas, llms, manifest y cada servidor MCP declarado (abierto → herramientas)", async () => {
  const r = await handleRequest(new Request("https://www.yokup.com/mcp/galaxia.json?sitio=www.xpaceos.com"), env(), ctx, fetchFalso([]));
  const d = await r.json();
  assert.equal(d.ok, true); assert.equal(d.sitio, "www.xpaceos.com"); assert.deepEqual(d.proyectos, ["xpaceos"]);
  assert.equal(d.puertas.help.ok, true); assert.equal(d.puertas.mcp.ok, true); assert.equal(d.puertas.llms.ok, true);
  assert.equal(d.puertas.manifest.name, "XpaceOS"); assert.equal(d.verja, false);
  assert.equal(d.servidores.length, 1);
  assert.equal(d.servidores[0].estado, "abierto"); assert.deepEqual(d.servidores[0].servidor, { name: "XpaceOS", version: "2.1.0" }); assert.deepEqual(d.servidores[0].herramientas, ["quien_soy", "fleet_status"]);
});

test("un sitio tras la verja se dice tal cual, y un servidor con clave se distingue de uno que no es MCP", async () => {
  const pix = await (await handleRequest(new Request("https://www.yokup.com/mcp/galaxia.json?sitio=www.pixeria.com"), env(), ctx, fetchFalso([]))).json();
  assert.equal(pix.verja, true); assert.equal(pix.puertas.help.ok, false); assert.equal(pix.puertas.help.status, 401);
  const yk = await (await handleRequest(new Request("https://www.yokup.com/mcp/galaxia.json?sitio=www.yokup.com"), env(), ctx, fetchFalso([]))).json();
  assert.equal(yk.servidores[0].estado, "con clave"); assert.deepEqual(yk.hereda, ["smith-ascii"]);
});

test("no se mide nada fuera del censo", async () => {
  const visitas = [];
  const r = await handleRequest(new Request("https://www.yokup.com/mcp/galaxia.json?sitio=example.com"), env(), ctx, fetchFalso(visitas));
  assert.equal(r.status, 404);
  assert.deepEqual(visitas, ["GET https://api.yokup.com/projects"]);
});
