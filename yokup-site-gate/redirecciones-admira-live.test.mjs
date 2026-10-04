// node --test redirecciones-admira-live.test.mjs — Carlos, 17-09-2026 · FLT-100557.
// La verja redirige a admira.live las páginas de empresa mudadas, conserva el producto de
// incidencias y /auth en yokup, y respeta la querystring. Sin red: env.ASSETS es un doble.
import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "./src/index.js";

const signed = { version:"v.17.09.2026.r9.20:00", gitShort:"abc1234", ok:true };
const env = (assetFetch = async () => new Response("asset", { status:200 })) => ({ RELEASE_JSON:JSON.stringify(signed), ASSETS:{ fetch:assetFetch } });
const get = (path) => handleRequest(new Request("https://www.yokup.com" + path), env(), {});

test("cada página de empresa mudada redirige 301 permanente a la misma ruta en admira.live", async () => {
  const casos = [
    ["/dashboard","https://www.admira.live/dashboard"],
    ["/dashboard.html","https://www.admira.live/dashboard"],
    ["/highscore","https://www.admira.live/highscore"],
    ["/consumos","https://www.admira.live/consumos"],
    ["/decisiones","https://www.admira.live/decisiones"],
    ["/tareas","https://www.admira.live/tareas"],
    ["/misiones","https://www.admira.live/misiones"],
    ["/notificaciones","https://www.admira.live/notificaciones"],
    ["/objetivos","https://www.admira.live/objetivos"],
    ["/normativa","https://www.admira.live/normativa"],
    ["/admira-live","https://www.admira.live/admira-live"],
    ["/consumo","https://www.admira.live/consumo"],
    ["/espejos","https://www.admira.live/espejos"],
    ["/flota","https://www.admira.live/highscore"],
    ["/score","https://www.admira.live/highscore"],
    ["/equipo","https://www.admira.live/equipo"],
    ["/asistencia","https://www.admira.live/asistencia"],
    ["/status","https://www.admira.live/status"],
  ];
  for (const [ruta, destino] of casos) {
    const r = await get(ruta);
    assert.equal(r.status, 301, ruta + " debe ser 301");
    assert.equal(r.headers.get("location"), destino, ruta + " → " + destino);
  }
});

test("informes se renombra a informes-flota; asignaciones lleva barra final", async () => {
  assert.equal((await get("/informes")).headers.get("location"), "https://www.admira.live/informes-flota");
  assert.equal((await get("/informes.html")).headers.get("location"), "https://www.admira.live/informes-flota");
  assert.equal((await get("/asignaciones")).headers.get("location"), "https://www.admira.live/asignaciones/");
});

test("la querystring se conserva en la redirección", async () => {
  assert.equal((await get("/highscore?e2e=nuevo&x=1")).headers.get("location"), "https://www.admira.live/highscore?e2e=nuevo&x=1");
});

test("el PRODUCTO de incidencias y app NO redirigen: los sirve yokup", async () => {
  // FLT-100883: /incidencias vuelve a yokup (gestor agentic). No vive en admira.live.
  for (const ruta of ["/retailer","/retailer/incidencia","/comercio/incidencia","/instalador","/alta-punto","/llamadas","/contactanos","/app","/ticket","/circuitos","/incidencias","/incidencias.html"]) {
    const r = await get(ruta);
    assert.notEqual(r.status, 301, ruta + " no debe redirigir a admira.live");
    assert.equal(await r.text(), "asset", ruta + " lo sigue sirviendo yokup");
  }
});

test("/auth, /version.json y /__yokup-gate siguen intactos (no redirigen)", async () => {
  assert.equal((await get("/version.json")).status, 200);
  assert.equal((await get("/__yokup-gate")).status, 200);
  // /auth/callback lo maneja authProxy, no la redirección
  const cb = await handleRequest(new Request("https://www.yokup.com/auth/callback", { method:"POST" }), env(), {});
  assert.notEqual(cb.status, 301);
});

test("/ayuda salta a /help; /llms.txt, /robots.txt y /.well-known no son la portada", async () => {
  let tocado = false;
  const ciego = { RELEASE_JSON:JSON.stringify(signed), ASSETS:{ fetch:async()=>{ tocado=true; return new Response("<html>portada</html>", {headers:{"content-type":"text/html"}}); } } };
  const ayuda = await handleRequest(new Request("https://www.yokup.com/ayuda?q=1"), ciego, {});
  assert.equal(ayuda.status, 301);
  assert.equal(ayuda.headers.get("location"), "https://www.yokup.com/help?q=1");
  for (const path of ["/llms.txt", "/robots.txt", "/.well-known/security.txt"]) {
    const r = await handleRequest(new Request("https://www.yokup.com" + path), ciego, {});
    assert.equal(r.status, 404, path);
    assert.match(r.headers.get("content-type"), /text\/plain/);
  }
  const biz = await handleRequest(new Request("https://admira.biz/ayuda/"), ciego, {});
  assert.equal(biz.headers.get("location"), "https://admira.biz/help/");
  assert.equal(tocado, false);
});

test("en admira.biz el manifiesto y el HTML de /mcp salen con la marca de la casa", async () => {
  const envBiz = (body, type) => ({ RELEASE_JSON:JSON.stringify(signed), ASSETS:{ fetch:async()=>new Response(body, {headers:{"content-type":type}}) } });
  const manifiesto = await handleRequest(new Request("https://www.admira.biz/mcp/manifest.json"), envBiz('{"site":"https://www.yokup.com","title":"Yokup","name":"yokup-fleet","api":"https://api.yokup.com"}', "application/json"), {});
  const json = await manifiesto.json();
  assert.equal(json.site, "https://www.admira.biz");
  assert.equal(json.title, "admira.biz");
  assert.equal(json.name, "yokup-fleet");
  assert.equal(json.api, "https://api.yokup.com");
  assert.equal(manifiesto.headers.get("cache-control"), "no-store");
  const igual = await handleRequest(new Request("https://www.yokup.com/mcp/manifest.json"), envBiz('{"site":"https://www.yokup.com","title":"Yokup"}', "application/json"), {});
  assert.equal((await igual.json()).title, "Yokup");
  const html = await handleRequest(new Request("https://admira.biz/mcp/"), envBiz('<html><head><title>Yokup · MCP</title></head><body>Yokup 1.4.0</body></html>', "text/html; charset=utf-8"), {});
  const texto = await html.text();
  assert.match(texto, /data-casa="admira-biz"/);
  assert.match(texto, /yk-casa\.js/);
  assert.match(texto, /admira\.biz · MCP/);
  assert.match(texto, /admira\.biz 1\.4\.0/);
});

test("una redirección no toca ASSETS (no sirve la página antes de redirigir)", async () => {
  let tocado = false;
  await handleRequest(new Request("https://www.yokup.com/dashboard"), { RELEASE_JSON:JSON.stringify(signed), ASSETS:{ fetch:async()=>{ tocado=true; return new Response("x"); } } }, {});
  assert.equal(tocado, false, "no debe pedir el asset de una página que redirige");
});
