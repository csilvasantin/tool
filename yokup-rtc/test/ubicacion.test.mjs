// node --test test/ubicacion.test.mjs — FLT-100564 · ubicación en tiempo real de invitados. Sin red.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarUbicacion, invitadosVivos, UBICACION_TTL_MS } from "../src/ubicacion.js";

test("valida y normaliza un reporte correcto (redondea coords, nombre por defecto, vip a 0/1)", () => {
  const v = validarUbicacion({ evento: "xperience-2026", invitado: "vip-007", lat: "41.3873912345", lng: 2.1699812345, acc: 12.7, vip: "1" });
  assert.equal(v.ok, true);
  assert.deepEqual([v.evento, v.invitado, v.nombre, v.vip, v.lat, v.lng, v.acc], ["xperience-2026", "vip-007", "vip-007", 1, 41.387391, 2.169981, 13]);
  assert.equal(validarUbicacion({ evento: "e", invitado: "i", lat: 0, lng: 0, nombre: "  Ana  " }).nombre, "Ana");
  assert.equal(validarUbicacion({ evento: "e", invitado: "i", lat: 0, lng: 0 }).acc, null);
});

test("rechaza lo inválido con motivo: sin evento/invitado, coords fuera de rango, ids con caracteres raros", () => {
  assert.match(validarUbicacion(null).error, /JSON/);
  assert.match(validarUbicacion({ invitado: "i", lat: 0, lng: 0 }).error, /evento/);
  assert.match(validarUbicacion({ evento: "e", lat: 0, lng: 0 }).error, /invitado/);
  assert.match(validarUbicacion({ evento: "e", invitado: "i", lat: 91, lng: 0 }).error, /lat/);
  assert.match(validarUbicacion({ evento: "e", invitado: "i", lat: 0, lng: -181 }).error, /lng/);
  assert.match(validarUbicacion({ evento: "e", invitado: "i", lat: "x", lng: 0 }).error, /lat/);
  assert.match(validarUbicacion({ evento: "e", invitado: "i", lat: 0, lng: 0, acc: -1 }).error, /acc/);
  assert.match(validarUbicacion({ evento: "e e", invitado: "i", lat: 0, lng: 0 }).error, /evento/);
  assert.match(validarUbicacion({ evento: "e", invitado: "<b>", lat: 0, lng: 0 }).error, /invitado/);
});

test("recorta textos largos a 80 y nunca acepta claves fuera del contrato como datos", () => {
  const v = validarUbicacion({ evento: "e", invitado: "i", lat: 1, lng: 2, nombre: "N".repeat(200), foto: "data:...", extra: 1 });
  assert.equal(v.nombre.length, 80);
  assert.deepEqual(Object.keys(v).sort(), ["acc", "evento", "invitado", "lat", "lng", "nombre", "ok", "vip"]);
});

test("invitadosVivos descarta las posiciones caducadas, añade edad y ordena por frescura", () => {
  const now = 1_000_000_000_000;
  const rows = [
    { invitado: "a", nombre: "Ana", vip: 1, lat: 1, lng: 2, acc: 5, ts: now - 10_000 },
    { invitado: "b", nombre: null, vip: 0, lat: 3, lng: 4, acc: null, ts: now - (UBICACION_TTL_MS + 1) },
    { invitado: "c", nombre: "Cé", vip: 0, lat: 5, lng: 6, acc: 9, ts: now - 1_000 },
  ];
  const v = invitadosVivos(rows, now);
  assert.deepEqual(v.map((x) => x.invitado), ["c", "a"], "b caducó; c es más fresca que a");
  assert.deepEqual(v[1], { invitado: "a", nombre: "Ana", vip: true, lat: 1, lng: 2, acc: 5, ts: now - 10_000, age_s: 10 });
  assert.equal(v[0].age_s, 1);
  assert.deepEqual(invitadosVivos([], now), []);
  assert.deepEqual(invitadosVivos(null, now), []);
});

import { metros, debeGuardarHistorial, ventanaHistorial, recorridos, HISTORIAL_MIN_M, HISTORIAL_MIN_MS, HISTORIAL_VENTANA_MAX_MS } from "../src/ubicacion.js";

test("metros: haversine con valores conocidos (Plaça Catalunya → Sagrada Família ≈ 2,3 km)", () => {
  assert.equal(Math.round(metros(41.3870, 2.1700, 41.4036, 2.1744) / 100) * 100, 1900);
  assert.equal(metros(41.3870, 2.1700, 41.3870, 2.1700), 0);
  assert.ok(Math.abs(metros(0, 0, 0, 0.0001) - 11.1) < 0.2, "0,0001° de longitud en el ecuador ≈ 11 m");
});

test("debeGuardarHistorial: el primero siempre; luego solo si se movió ≥ 8 m o pasaron ≥ 30 s", () => {
  const now = 1_000_000_000_000;
  const ult = { lat: 41.3870, lng: 2.1700, ts: now - 5000 };
  assert.equal(debeGuardarHistorial(null, { lat: 1, lng: 1 }, now), true);
  assert.equal(debeGuardarHistorial(ult, { lat: 41.38701, lng: 2.17001 }, now), false, "1 m y 5 s: no");
  assert.equal(debeGuardarHistorial(ult, { lat: 41.3871, lng: 2.1700 }, now), true, "~11 m: sí");
  assert.equal(debeGuardarHistorial({ ...ult, ts: now - HISTORIAL_MIN_MS }, { lat: 41.3870, lng: 2.1700 }, now), true, "quieto pero 30 s: sí");
  assert.equal(HISTORIAL_MIN_M, 8);
});

test("ventanaHistorial: por defecto la última hora; acepta ms, segundos e ISO; acota a 7 días; ordena", () => {
  const now = 1_700_000_000_000;
  assert.deepEqual(ventanaHistorial({}, now), { desde: now - 3600000, hasta: now });
  assert.deepEqual(ventanaHistorial({ desde: now - 1000, hasta: now }, now), { desde: now - 1000, hasta: now });
  assert.deepEqual(ventanaHistorial({ desde: 1700000000, hasta: 1700000100 }, now), { desde: 1700000000000, hasta: 1700000100000 }, "segundos → ms");
  assert.deepEqual(ventanaHistorial({ desde: "2023-11-14T22:13:20.000Z" }, now).desde, 1700000000000);
  assert.deepEqual(ventanaHistorial({ hasta: now - 1000, desde: now }, now), { desde: now - 1000, hasta: now }, "invertida se ordena");
  const v = ventanaHistorial({ desde: now - 30 * 24 * 3600000, hasta: now }, now);
  assert.equal(v.hasta - v.desde, HISTORIAL_VENTANA_MAX_MS, "más de 7 días se recorta por el principio");
  assert.equal(ventanaHistorial({ desde: "basura" }, now).desde, now - 3600000);
});

test("recorridos: agrupa por invitado, ordena por tiempo, suma metros y ordena por actividad reciente", () => {
  const t = 1_000_000_000_000;
  const rows = [
    { invitado: "ana", nombre: "Ana", vip: 1, lat: 41.3870, lng: 2.1700, acc: 5, ts: t + 60000 },
    { invitado: "ana", nombre: "Ana", vip: 1, lat: 41.3860, lng: 2.1700, acc: 5, ts: t },
    { invitado: "luis", nombre: null, vip: 0, lat: 41.4, lng: 2.2, acc: null, ts: t + 10000 },
    { invitado: "", lat: 0, lng: 0, ts: t },
  ];
  const r = recorridos(rows);
  assert.deepEqual(r.map((x) => x.invitado), ["ana", "luis"]);
  assert.equal(r[0].n, 2); assert.equal(r[0].puntos[0][2], t, "ordenado por ts aunque llegara al revés");
  assert.ok(r[0].metros >= 105 && r[0].metros <= 118, "0,001° de latitud ≈ 111 m (" + r[0].metros + ")");
  assert.deepEqual([r[0].desde, r[0].hasta, r[0].vip], [t, t + 60000, true]);
  assert.deepEqual([r[1].nombre, r[1].metros, r[1].puntos[0][3]], ["luis", 0, null]);
  assert.deepEqual(recorridos(null), []);
});
