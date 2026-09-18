// Prueba de la permanencia (dwell): paradas por invitado y zonas calientes agregadas.
// FLT-100569 · Carlos, 18-09-2026 · MorfeoMacMini · MacMini.
import { test } from "node:test";
import assert from "node:assert/strict";
import { paradas, zonasCalientes, metros, PARADA_MIN_MS } from "./src/ubicacion.js";

// ~metros por grado a esta latitud (Madrid ≈ 40.4): sirve para fabricar puntos a X metros.
const LAT0 = 40.4168, LNG0 = -3.7038;
const dLat = (m) => m / 111320;                 // 1º lat ≈ 111.32 km
const dLng = (m) => m / (111320 * Math.cos(LAT0 * Math.PI / 180));
const P = (mNorte, mEste, ts) => [LAT0 + dLat(mNorte), LNG0 + dLng(mEste), ts, 5];
const S = (s) => s * 1000;

test("metros: dos puntos a ~100 m dan ~100 m", () => {
  const d = metros(LAT0, LNG0, LAT0 + dLat(100), LNG0);
  assert.ok(Math.abs(d - 100) < 2, `esperaba ~100, salió ${d}`);
});

test("paradas: quieto 60 s en un sitio = una parada; de paso no cuenta", () => {
  // Sitio A: quieto de 0 a 60 s (jitter de 3 m). Luego camina lejos. Sitio B: solo 20 s (de paso).
  const pts = [
    P(0, 0, S(0)), P(2, 1, S(15)), P(1, 2, S(30)), P(0, 3, S(45)), P(2, 0, S(60)),
    P(150, 0, S(120)),                       // salto: nuevo sitio
    P(150, 2, S(135)), P(151, 0, S(140)),    // sitio B: solo 20 s → de paso
    P(400, 0, S(300)),
  ];
  const ps = paradas(pts);
  assert.equal(ps.length, 1, "solo el sitio A supera los 45 s");
  assert.ok(ps[0].ms >= PARADA_MIN_MS, "la parada dura >= 45 s");
  assert.ok(metros(ps[0].lat, ps[0].lng, LAT0, LNG0) < 8, "la parada se centra en el sitio A");
});

test("paradas: un paseo lento sin pararse no genera parada gigante", () => {
  // Avanza 15 m cada 20 s: cada punto se sale del radio del anterior, nunca hay tiempo quieto.
  const pts = [];
  for (let i = 0; i < 20; i++) pts.push(P(i * 15, 0, S(i * 20)));
  const ps = paradas(pts);
  assert.equal(ps.length, 0, "caminar continuo no es una parada");
});

test("zonasCalientes: dos invitados que coinciden en el stand suman permanencia y salen primero", () => {
  const rows = [];
  const push = (invitado, p) => rows.push({ evento: "x", invitado, nombre: invitado, vip: 0, lat: p[0], lng: p[1], acc: p[3], ts: p[2] });
  // Stand popular (sitio A): invitado 1 quieto 90 s, invitado 2 quieto 120 s.
  for (const t of [0, 30, 60, 90]) push("g1", P(0, 0, S(t)));
  for (const t of [200, 230, 260, 290, 320]) push("g2", P(3, 2, S(t)));
  // Rincón poco visitado (sitio B, a 200 m): solo invitado 1, 50 s.
  for (const t of [400, 425, 450]) push("g1", P(200, 0, S(400 + (t - 400))));
  for (const t of [400, 430, 450]) push("g1", P(200, 0, S(t)));

  const z = zonasCalientes(rows);
  assert.ok(z.length >= 2, "al menos dos zonas");
  // La zona más "gustada" es el stand A: la de mayor permanencia_ms y con 2 invitados.
  assert.ok(z[0].permanencia_ms >= z[1].permanencia_ms, "ordenadas por permanencia desc");
  assert.equal(z[0].invitados, 2, "el stand A lo visitan 2 invitados");
  assert.ok(metros(z[0].lat, z[0].lng, LAT0, LNG0) < 15, "la zona top se centra en el sitio A");
});

test("zonasCalientes: sin filas → sin zonas (no revienta)", () => {
  assert.deepEqual(zonasCalientes([]), []);
  assert.deepEqual(zonasCalientes(null), []);
});
