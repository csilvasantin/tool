// node --test redirecciones-admira-live.test.mjs — Carlos, 17-09-2026 · FLT-100557.
// La verja redirige a admira.live las páginas de empresa mudadas, conserva el producto de
// incidencias y /auth en yokup, y respeta la querystring. Sin red: env.ASSETS es un doble.
import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "./src/index.js";

const signed = { version:"v.17.09.2026.r9.20:00", gitShort:"abc1234", ok:true };
const env = (assetFetch = async () => new Response("asset", { status:200 })) => ({ RELEASE_JSON:JSON.stringify(signed), ASSETS:{ fetch:assetFetch } });
const get = (path) => handleRequest(new Request("https://www.yokup.com" + path), env(), {});

test("cada página de empresa mudada redirige 302 a la misma ruta en admira.live", async () => {
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
    ["/incidencias","https://www.admira.live/incidencias"],
    ["/equipo","https://www.admira.live/equipo"],
    ["/asistencia","https://www.admira.live/asistencia"],
    ["/status","https://www.admira.live/status"],
  ];
  for (const [ruta, destino] of casos) {
    const r = await get(ruta);
    assert.equal(r.status, 302, ruta + " debe ser 302");
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
  for (const ruta of ["/retailer","/instalador","/alta-punto","/llamadas","/contactanos","/app","/ticket","/circuitos"]) {
    const r = await get(ruta);
    assert.notEqual(r.status, 302, ruta + " no debe redirigir a admira.live");
    assert.equal(await r.text(), "asset", ruta + " lo sigue sirviendo yokup");
  }
});

test("/auth, /version.json y /__yokup-gate siguen intactos (no redirigen)", async () => {
  assert.equal((await get("/version.json")).status, 200);
  assert.equal((await get("/__yokup-gate")).status, 200);
  // /auth/callback lo maneja authProxy, no la redirección
  const cb = await handleRequest(new Request("https://www.yokup.com/auth/callback", { method:"POST" }), env(), {});
  assert.notEqual(cb.status, 302);
});

test("una redirección no toca ASSETS (no sirve la página antes de redirigir)", async () => {
  let tocado = false;
  await handleRequest(new Request("https://www.yokup.com/dashboard"), { RELEASE_JSON:JSON.stringify(signed), ASSETS:{ fetch:async()=>{ tocado=true; return new Response("x"); } } }, {});
  assert.equal(tocado, false, "no debe pedir el asset de una página que redirige");
});
