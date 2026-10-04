import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { atajoDePagina, marcaCuerpoTexto, marcaDocumento, FLOTA_A_LIVE } from "./functions/_shared/espejo-puertas.mjs";
import { debeProxy, proxyAlGuardian, responderMcp, GUARDIAN } from "./functions/_shared/mcp-espejo.mjs";
import { onRequest } from "./functions/_middleware.js";

const redirects = await readFile(new URL("./_redirects", import.meta.url), "utf8");
const manifest = await readFile(new URL("./mcp/manifest.json", import.meta.url), "utf8");
const llms = await readFile(new URL("./mcp/llms.txt", import.meta.url), "utf8");
const rutas = JSON.parse(await readFile(new URL("./_routes.json", import.meta.url), "utf8"));

function lineas() {
  return redirects.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).map((l) => l.trim().split(/\s+/));
}

test("la flota de _redirects salta a admira.live antes del catch-all, como yokup.com", () => {
  const reglas = lineas();
  const catchAll = reglas.findIndex(([desde]) => desde === "/*");
  assert.ok(catchAll > 0);
  const casos = [
    ["/highscore", "https://www.admira.live/highscore"],
    ["/highscore.html", "https://www.admira.live/highscore"],
    ["/misiones", "https://www.admira.live/misiones"],
    ["/normativa", "https://www.admira.live/normativa"],
    ["/tareas", "https://www.admira.live/tareas"],
    ["/objetivos", "https://www.admira.live/objetivos"],
    ["/notificaciones", "https://www.admira.live/notificaciones"],
    ["/decisiones", "https://www.admira.live/decisiones"],
    ["/informes", "https://www.admira.live/informes-flota"],
    ["/informes.html", "https://www.admira.live/informes-flota"],
    ["/dashboard", "https://www.admira.live/dashboard"],
    ["/asistencia", "https://www.admira.live/asistencia"],
    ["/ayuda", "/help"],
    ["/ayuda/", "/help/"],
  ];
  for (const [desde, hacia] of casos) {
    const i = reglas.findIndex(([d]) => d === desde);
    assert.ok(i >= 0, "falta " + desde);
    assert.ok(i < catchAll, desde + " después del catch-all no sirve");
    assert.equal(reglas[i][1], hacia, desde);
    assert.equal(reglas[i][2], "301", desde);
  }
  for (const ruta of Object.keys(FLOTA_A_LIVE)) assert.ok(reglas.some(([d]) => d === ruta), ruta);
});

test("el middleware hace el 301 de la flota y de /ayuda, y no pide el asset", async () => {
  let pedidas = 0;
  const next = async () => { pedidas += 1; return new Response("portada", { headers: { "content-type": "text/html" } }); };
  const alta = await onRequest({ request: new Request("https://admira.biz/highscore?e2e=1"), next, env: {} });
  assert.equal(alta.status, 301);
  assert.equal(alta.headers.get("location"), "https://www.admira.live/highscore?e2e=1");
  const ayuda = await onRequest({ request: new Request("https://www.admira.biz/ayuda/?q=1"), next, env: {} });
  assert.equal(ayuda.status, 301);
  assert.equal(ayuda.headers.get("location"), "https://www.admira.biz/help/?q=1");
  const informes = await onRequest({ request: new Request("https://yokup.pages.dev/informes.html"), next, env: {} });
  assert.equal(informes.headers.get("location"), "https://www.admira.live/informes-flota");
  assert.equal(pedidas, 0);
});

test("/llms.txt, /robots.txt y /.well-known no son la portada", async () => {
  for (const path of ["/llms.txt", "/robots.txt", "/.well-known", "/.well-known/security.txt", "/.well-known/acme-challenge/x"]) {
    const r = atajoDePagina(new Request("https://admira.biz" + path));
    assert.equal(r.status, 404, path);
    assert.match(r.headers.get("content-type"), /text\/plain/);
    assert.equal(await r.text(), "Not Found");
  }
  const post = atajoDePagina(new Request("https://admira.biz/robots.txt", { method: "POST" }));
  assert.equal(post.status, 404);
  assert.equal(atajoDePagina(new Request("https://admira.biz/mcp/llms.txt")), null, "el contrato real sigue en /mcp/llms.txt");
  assert.equal(atajoDePagina(new Request("https://admira.biz/help")), null);
  assert.equal(atajoDePagina(new Request("https://admira.biz/auth/callback", { method: "POST" })), null, "el login no se toca");
});

test("POST /mcp y la galaxia se reenvían al guardián; el GET de la documentación no", async () => {
  assert.equal(debeProxy(new Request("https://admira.biz/mcp", { method: "POST" })), true);
  assert.equal(debeProxy(new Request("https://www.admira.biz/mcp/", { method: "OPTIONS" })), true);
  assert.equal(debeProxy(new Request("https://admira.biz/mcp/galaxia.json")), true);
  assert.equal(debeProxy(new Request("https://admira.biz/mcp/galaxia.json?sitio=www.xpaceos.com")), true);
  assert.equal(debeProxy(new Request("https://admira.biz/mcp")), false);
  assert.equal(debeProxy(new Request("https://admira.biz/mcp", { headers: { accept: "text/event-stream" } })), true);
  assert.equal(debeProxy(new Request("https://admira.biz/auth/callback", { method: "POST" })), false);
  let visto;
  const r = await proxyAlGuardian(new Request("https://admira.biz/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", origin: "https://admira.biz", authorization: "Bearer x" },
    body: '{"jsonrpc":"2.0","id":1,"method":"ping"}',
  }), async (url, init) => {
    visto = { url: String(url), method: init.method, origin: init.headers.get("origin"), auth: init.headers.get("authorization") };
    return Response.json({ error: "invalid_token", help: "https://www.yokup.com/help#mcp" }, { status: 401, headers: { "www-authenticate": 'Bearer realm="yokup-mcp"' } });
  });
  assert.equal(visto.url, GUARDIAN + "/mcp");
  assert.equal(visto.method, "POST");
  assert.equal(visto.origin, null, "el origen del espejo no debe provocar origin_not_allowed en el guardián");
  assert.equal(visto.auth, "Bearer x");
  assert.equal(r.status, 401);
  assert.equal(r.headers.get("access-control-allow-origin"), "https://admira.biz");
  assert.deepEqual(await r.json(), { error: "invalid_token", help: "https://www.yokup.com/help#mcp" });
});

test("en admira.biz manifest.json y llms.txt se marcan; en yokup.com no", async () => {
  const next = async () => new Response(manifest, { status: 200, headers: { "content-type": "application/json", "cache-control": "public, max-age=0" } });
  const biz = await responderMcp(new Request("https://www.admira.biz/mcp/manifest.json"), { next });
  const cuerpo = await biz.json();
  assert.equal(cuerpo.site, "https://www.admira.biz");
  assert.equal(cuerpo.llms_txt, "https://www.admira.biz/mcp/llms.txt");
  assert.equal(cuerpo.help_humans, "https://www.admira.biz/help");
  assert.equal(cuerpo.http_api.base_url, "https://api.yokup.com", "el API técnico no cambia de casa");
  assert.equal(cuerpo.name, "yokup-fleet");
  assert.equal(biz.headers.get("cache-control"), "no-store");
  const yokup = await responderMcp(new Request("https://www.yokup.com/mcp/manifest.json"), { next });
  assert.equal((await yokup.json()).site, "https://www.yokup.com");
  const texto = marcaCuerpoTexto(llms, "admira.biz");
  assert.match(texto, /https:\/\/admira\.biz\/mcp/);
  assert.match(texto, /https:\/\/api\.yokup\.com/);
  assert.doesNotMatch(texto, /https:\/\/www\.yokup\.com/);
});

test("la galaxia del espejo es el JSON del guardián, no la portada", async () => {
  const r = await responderMcp(new Request("https://admira.biz/mcp/galaxia.json?sitio=www.yokup.com"), {
    next: async () => { throw new Error("no debe servir el asset"); },
    fetchImpl: async (url) => {
      assert.equal(String(url), GUARDIAN + "/mcp/galaxia.json?sitio=www.yokup.com");
      return Response.json({ ok: true, sitios: ["www.yokup.com"] });
    },
  });
  assert.equal(r.headers.get("content-type"), "application/json");
  assert.equal((await r.json()).ok, true);
});

test("json y txt entran en Functions: si no, la galaxia y la marca no corren", () => {
  assert.equal(rutas.include.includes("/*"), true);
  assert.ok(!rutas.exclude.includes("/*.json"), "/*.json dejaría /mcp/galaxia.json y el manifiesto fuera");
  assert.ok(!rutas.exclude.includes("/*.txt"), "/*.txt dejaría /llms.txt y /mcp/llms.txt fuera");
  for (const patron of ["/*.js", "/*.css", "/*.png"]) assert.ok(rutas.exclude.includes(patron), patron);
});

test("el HTML del espejo lleva la marca y el gancho de la casa", () => {
  const html = '<!doctype html><html lang="es"><head><title>Yokup · MCP</title><link rel="canonical" href="https://www.yokup.com/mcp/"></head><body><b>Yokup 1.4.0</b> <a href="https://www.yokup.com/help">ayuda</a></body></html>';
  const out = marcaDocumento(html, "www.admira.biz", "/mcp/", "v.04.10.2026.r1");
  assert.match(out, /data-casa="admira-biz"/);
  assert.match(out, /src="\/yk-casa\.js\?v=v\.04\.10\.2026\.r1"/);
  assert.match(out, /<title>admira\.biz · MCP<\/title>/);
  assert.match(out, /admira\.biz 1\.4\.0/);
  assert.match(out, /href="https:\/\/www\.admira\.biz\/help"/);
  assert.match(out, /canonical" href="https:\/\/www\.admira\.biz\/mcp\/"/);
  assert.equal(marcaDocumento(html, "www.yokup.com", "/mcp/"), html);
});
