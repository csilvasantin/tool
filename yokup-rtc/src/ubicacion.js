// src/ubicacion.js — UBICACIÓN EN TIEMPO REAL de invitados (AdmiraXperience). Lógica pura, sin red ni DB.
// Carlos, 18-09-2026 · FLT-100564 · MorfeoMacMini · MacMini.
//
// La FUENTE de la posición es el teléfono del invitado (geolocalización del navegador): el badge
// MiLi MiTag Duo trabaja con Apple Find My / Android Find Hub, redes cerradas sin API de terceros y
// sin tiempo real, así que no puede alimentar el mapa. El contrato es agnóstico de la fuente: mañana
// un lector BLE propio puede reportar por el mismo camino.
//
// Contrato de una posición: {evento, invitado, nombre?, vip?, lat, lng, acc?}. Una fila por
// evento+invitado (la última posición pisa a la anterior). Sin renovar en UBICACION_TTL_MS deja de
// pintarse: nadie queda «congelado» en el mapa donde ya no está.
export const UBICACION_TTL_MS = 90000;
export const UBICACION_MAX_TXT = 80;

const txt = (v, max = UBICACION_MAX_TXT) => String(v == null ? "" : v).trim().slice(0, max);
const num = (v) => (v === "" || v == null ? NaN : Number(v));

/** Valida y normaliza un reporte de posición. Devuelve {ok:true, ...campos} o {ok:false, error}. */
export function validarUbicacion(b) {
  if (!b || typeof b !== "object") return { ok: false, error: "cuerpo JSON requerido" };
  const evento = txt(b.evento), invitado = txt(b.invitado);
  if (!evento) return { ok: false, error: "evento requerido" };
  if (!invitado) return { ok: false, error: "invitado requerido" };
  if (!/^[A-Za-z0-9._:-]+$/.test(evento)) return { ok: false, error: "evento: solo letras, números, . _ : -" };
  if (!/^[A-Za-z0-9._:-]+$/.test(invitado)) return { ok: false, error: "invitado: solo letras, números, . _ : -" };
  const lat = num(b.lat), lng = num(b.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { ok: false, error: "lat inválida (-90..90)" };
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return { ok: false, error: "lng inválida (-180..180)" };
  let acc = b.acc == null || b.acc === "" ? null : num(b.acc);
  if (acc != null && (!Number.isFinite(acc) || acc < 0)) return { ok: false, error: "acc inválida" };
  if (acc != null) acc = Math.round(acc);
  const nombre = txt(b.nombre) || invitado;
  const vip = b.vip === true || b.vip === 1 || b.vip === "1" || b.vip === "true" ? 1 : 0;
  return { ok: true, evento, invitado, nombre, vip, lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, acc };
}

/** Filas de la tabla → invitados vivos para el mapa (descarta las caducadas y añade la edad). */
export function invitadosVivos(rows, now = Date.now(), ttl = UBICACION_TTL_MS) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const ts = Number(r.ts) || 0;
    if (now - ts > ttl) continue;
    out.push({ invitado: r.invitado, nombre: r.nombre || r.invitado, vip: !!r.vip, lat: Number(r.lat), lng: Number(r.lng),
      acc: r.acc == null ? null : Number(r.acc), ts, age_s: Math.max(0, Math.round((now - ts) / 1000)) });
  }
  out.sort((a, b) => b.ts - a.ts);
  return out;
}
