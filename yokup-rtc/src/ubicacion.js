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

// ── HISTORIAL de recorridos (Carlos, 18-09-2026 · FLT-100567) ──────────────────────────────────────
// Un invitado manda una posición cada 4 s; guardarlas todas sería ~900 filas/hora por persona sin
// decir nada nuevo. Se guarda un punto SOLO si se ha movido más de HISTORIAL_MIN_M metros desde el
// último guardado o han pasado HISTORIAL_MIN_MS (para que un invitado quieto siga constando cada 30 s).
export const HISTORIAL_MIN_M = 8;
export const HISTORIAL_MIN_MS = 30000;
export const HISTORIAL_RETENCION_MS = 30 * 24 * 3600 * 1000;   // 30 días y se purga
export const HISTORIAL_VENTANA_MAX_MS = 7 * 24 * 3600 * 1000;  // una consulta no abarca más de 7 días
export const HISTORIAL_MAX_FILAS = 20000;

/** Distancia en metros entre dos coordenadas (haversine). */
export function metros(lat1, lng1, lat2, lng2) {
  const r = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** ¿Merece guardarse este punto en el historial? `ultimo` = último punto guardado del invitado o null. */
export function debeGuardarHistorial(ultimo, nuevo, now = Date.now(), { minM = HISTORIAL_MIN_M, minMs = HISTORIAL_MIN_MS } = {}) {
  if (!ultimo) return true;
  if (now - (Number(ultimo.ts) || 0) >= minMs) return true;
  return metros(Number(ultimo.lat), Number(ultimo.lng), nuevo.lat, nuevo.lng) >= minM;
}

/** Normaliza la ventana temporal pedida: {desde, hasta} en ms, acotada a HISTORIAL_VENTANA_MAX_MS. */
export function ventanaHistorial(q, now = Date.now()) {
  const parse = (v) => { if (v == null || v === "") return NaN; const n = Number(v); if (Number.isFinite(n)) return n > 4102444800 ? n : n * 1000; const t = Date.parse(String(v)); return Number.isFinite(t) ? t : NaN; };
  let hasta = parse(q && q.hasta); if (!Number.isFinite(hasta)) hasta = now;
  let desde = parse(q && q.desde); if (!Number.isFinite(desde)) desde = hasta - 3600 * 1000;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  if (hasta - desde > HISTORIAL_VENTANA_MAX_MS) desde = hasta - HISTORIAL_VENTANA_MAX_MS;
  return { desde: Math.floor(desde), hasta: Math.floor(hasta) };
}

/** Filas del historial (cualquier orden) → recorridos por invitado: puntos ordenados, metros y tiempos. */
export function recorridos(rows) {
  const por = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const k = String(r.invitado || ""); if (!k) continue;
    if (!por.has(k)) por.set(k, { invitado: k, nombre: r.nombre || k, vip: !!r.vip, puntos: [] });
    const g = por.get(k); if (r.nombre) g.nombre = r.nombre; if (r.vip) g.vip = true;
    g.puntos.push([Number(r.lat), Number(r.lng), Number(r.ts) || 0, r.acc == null ? null : Number(r.acc)]);
  }
  const out = [];
  for (const g of por.values()) {
    g.puntos.sort((a, b) => a[2] - b[2]);
    let m = 0; for (let i = 1; i < g.puntos.length; i++) m += metros(g.puntos[i - 1][0], g.puntos[i - 1][1], g.puntos[i][0], g.puntos[i][1]);
    out.push({ ...g, metros: Math.round(m), desde: g.puntos[0][2], hasta: g.puntos[g.puntos.length - 1][2], n: g.puntos.length });
  }
  out.sort((a, b) => b.hasta - a.hasta);
  return out;
}
