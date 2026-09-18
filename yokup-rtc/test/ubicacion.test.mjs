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
