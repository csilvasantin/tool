/*
 * Clave de máquina de SOLO LECTURA (Carlos, 6-oct-2026: «Haz la clave de máquina
 * de solo lectura para tu navegador»). Sirve para que el navegador de Merovingio
 * grabe la demo 365 Barcelona sin Google y sin poder cambiar nada.
 *
 * La clave vive en la Cúpula como MEROVINGIO_BOX_LECTURA y como secreto del
 * worker (el mismo nombre). Nunca se escribe en el repo, en logs ni en respuestas.
 * Formato: mbl_ + aleatorio, 40 caracteres como mínimo.
 *
 * Un enlace de un solo uso es HMAC de {v, aud:'lectura', site, nonce, exp} con
 * esa clave. Caduca a las 8 h. Canjearlo (GET) crea una sesión visor. Un segundo
 * canje responde 410. POST, PUT, PATCH o DELETE con la clave o con la cookie
 * responden 403.
 *
 * Revocar en el acto: bash ~/Claude/admira-vault/revocar-lectura-box.sh
 * (borra el secreto del worker, marca las sesiones y retira la clave de la Cúpula).
 * Sin secreto, la huella no coincide y las cookies ya emitidas dejan de valer.
 */

export const LECTURA_SITES = new Set(['store', 'xpaceos', 'yokup', 'tv']);
export const LECTURA_PREFIX = 'mbl_';
export const LECTURA_MIN = 40;
export const LECTURA_TTL_SECONDS = 8 * 60 * 60;
export const LECTURA_COOKIE = '__Host-yk_lectura';
export const LECTURA_EMAIL = 'lectura@merovingio.box';
export const LECTURA_BRAND = '365';
const DEST = {
  store: '/admira-xp/?autostart=cafeteria&visual=better&marca=365&loc=365-demo-bcn-tetuan&store=365-demo-bcn-tetuan',
  xpaceos: '/admira-xp/?autostart=cafeteria&visual=better&marca=365&loc=365-demo-bcn-tetuan&store=365-demo-bcn-tetuan',
  yokup: 'https://www.yokup.com/retailer',
  tv: 'https://www.admira.tv/playlists/?marca=365',
};
const enc = new TextEncoder();

export function configuredLecturaKey(env) {
  const key = String(env && env.MEROVINGIO_BOX_LECTURA || '').trim();
  return key.startsWith(LECTURA_PREFIX) && key.length >= LECTURA_MIN && key.length <= 200 ? key : '';
}

function bytesToB64url(bytes) {
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64url(text) {
  return bytesToB64url(enc.encode(String(text)));
}
function decodeB64url(value) {
  const raw = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = raw + '='.repeat((4 - raw.length % 4) % 4);
  const bin = atob(padded);
  return new Uint8Array([...bin].map((char) => char.charCodeAt(0)));
}
async function hmac(key, message) {
  const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(key), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  return bytesToB64url(new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message))));
}
async function sha256hex(value) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(value))));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function same(left, right) {
  left = String(left || '');
  right = String(right || '');
  if (!left || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}
function randomHex(size) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function lecturaFingerprint(key) {
  return (await sha256hex(`lectura-fp:${key}`)).slice(0, 22);
}

/** Enlace de un solo uso. Lo emite el Mac Mini; no hay alta pública. */
export async function mintLecturaToken(key, site, now = Date.now()) {
  if (!configuredLecturaKey({MEROVINGIO_BOX_LECTURA: key}) || !LECTURA_SITES.has(site)) throw new Error('no se puede emitir');
  const exp = Math.floor(now / 1000) + LECTURA_TTL_SECONDS;
  const payload = b64url(JSON.stringify({v:1, aud:'lectura', site, nonce:randomHex(16), exp}));
  return {token:`${payload}.${await hmac(key, payload)}`, exp, site};
}

export async function verifyLecturaToken(key, token, now = Date.now()) {
  const configured = configuredLecturaKey({MEROVINGIO_BOX_LECTURA: key});
  const raw = String(token || '');
  const dot = raw.indexOf('.');
  if (!configured || dot < 10 || raw.length > 2500) return null;
  const payloadPart = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!same(sig, await hmac(configured, payloadPart))) return null;
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(decodeB64url(payloadPart))); } catch { return null; }
  const exp = Number(payload && payload.exp);
  if (!payload || payload.v !== 1 || payload.aud !== 'lectura' || !LECTURA_SITES.has(payload.site)) return null;
  if (!/^[a-f0-9]{32}$/.test(payload.nonce || '') || !Number.isFinite(exp) || exp <= Math.floor(now / 1000)) return null;
  if (exp > Math.floor(now / 1000) + LECTURA_TTL_SECONDS + 60) return null;
  return {site:payload.site, nonce:payload.nonce, exp};
}

export function suppliedLecturaKey(request) {
  const header = String(request.headers.get('X-Admira-Machine-Key') || '').trim();
  if (header.startsWith(LECTURA_PREFIX)) return header.slice(0, 200);
  const match = /^Bearer\s+(\S+)$/i.exec(String(request.headers.get('Authorization') || ''));
  return match && match[1].startsWith(LECTURA_PREFIX) ? match[1].slice(0, 200) : '';
}

export async function lecturaKeyMatches(env, supplied) {
  const expected = configuredLecturaKey(env);
  if (!expected || !supplied) return false;
  return same(await sha256hex(supplied), await sha256hex(expected));
}

function cookieValue(request) {
  const jar = String(request.headers.get('cookie') || request.headers.get('Cookie') || '');
  const part = jar.split(';').map((item) => item.trim()).find((item) => item.startsWith(LECTURA_COOKIE + '='));
  return part ? decodeURIComponent(part.slice(LECTURA_COOKIE.length + 1)) : '';
}

async function ensureTables(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS lectura_nonces (nonce TEXT PRIMARY KEY, site TEXT NOT NULL, exp INTEGER NOT NULL, used_at INTEGER NOT NULL)').bind().run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS lectura_sessions (sid_hash TEXT PRIMARY KEY, site TEXT NOT NULL, exp INTEGER NOT NULL, fp TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)').bind().run();
}

function json(body, status, extra = {}) {
  return new Response(JSON.stringify(body), {status, headers:{'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'referrer-policy':'no-referrer', ...extra}});
}

async function redeem(env, token, expectSite) {
  const key = configuredLecturaKey(env);
  if (!key) return json({error:'acceso de lectura no configurado'}, 503);
  if (!LECTURA_SITES.has(expectSite)) return json({error:'sitio no válido'}, 400);
  const parsed = await verifyLecturaToken(key, token);
  if (!parsed || parsed.site !== expectSite) return json({error:'enlace no válido o caducado'}, 401);
  await ensureTables(env);
  try {
    await env.DB.prepare('INSERT INTO lectura_nonces (nonce, site, exp, used_at) VALUES (?,?,?,?)').bind(parsed.nonce, parsed.site, parsed.exp, Date.now()).run();
  } catch (error) {
    if (String(error && error.message || error).includes('UNIQUE')) return json({error:'enlace ya usado'}, 410);
    throw error;
  }
  const sid = randomHex(32);
  await env.DB.prepare('INSERT INTO lectura_sessions (sid_hash, site, exp, fp, revoked, created_at) VALUES (?,?,?,?,0,?)').bind(await sha256hex(sid), parsed.site, parsed.exp, await lecturaFingerprint(key), Date.now()).run();
  return json({ok:true, sid, exp:parsed.exp, site:parsed.site, role:'viewer'}, 200);
}

async function sessionRow(env, sid) {
  const key = configuredLecturaKey(env);
  if (!key || !/^[a-f0-9]{64}$/.test(sid || '')) return null;
  await ensureTables(env);
  const row = await env.DB.prepare('SELECT site, exp, fp, revoked FROM lectura_sessions WHERE sid_hash=?').bind(await sha256hex(sid)).first();
  if (!row || row.revoked || Number(row.exp) <= Math.floor(Date.now() / 1000)) return null;
  if (!same(row.fp, await lecturaFingerprint(key))) return null;
  return row;
}

export async function handleLectura(request, env) {
  const url = new URL(request.url);
  if (request.method !== 'GET') {
    if (cookieValue(request) || await lecturaKeyMatches(env, suppliedLecturaKey(request))) {
      return json({error:'Clave de solo lectura.'}, 403);
    }
    return json({error:'usa GET'}, 405);
  }
  if (url.pathname === '/api/lectura/reconocer') {
    return json({lectura: await lecturaKeyMatches(env, suppliedLecturaKey(request))}, 200);
  }
  if (url.pathname === '/api/lectura/sesion') {
    const row = await sessionRow(env, url.searchParams.get('sid') || '');
    return row ? json({ok:true, site:row.site, exp:row.exp, role:'viewer'}, 200) : json({ok:false}, 401);
  }
  if (url.pathname === '/api/lectura/canjear') {
    return redeem(env, url.searchParams.get('t') || '', url.searchParams.get('site') || '');
  }
  if (url.pathname === '/api/lectura/entrar') {
    const redeemed = await redeem(env, url.searchParams.get('t') || '', 'yokup');
    if (redeemed.status !== 200) return redeemed;
    const data = await redeemed.json();
    const maxAge = Math.max(0, Number(data.exp) - Math.floor(Date.now() / 1000));
    return new Response(null, {status:302, headers:{
      location: DEST.yokup,
      'cache-control':'no-store',
      'referrer-policy':'no-referrer',
      'set-cookie': `${LECTURA_COOKIE}=${data.sid}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
    }});
  }
  return json({error:'no encontrado'}, 404);
}

/** true si esta escritura trae la clave o la cookie de lectura. */
export async function lecturaWriteForbidden(request, env) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return false;
  if (cookieValue(request)) return true;
  return lecturaKeyMatches(env, suppliedLecturaKey(request));
}

/**
 * Sesión visor de la marca 365 para el panel ITIL, o bloqueo si intenta escribir.
 * null si la petición no trae esta cookie.
 */
export async function lecturaRetailerGate(request, env) {
  const sid = cookieValue(request);
  if (!sid) return null;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return {blocked:true};
  const row = await sessionRow(env, sid);
  if (!row || row.site !== 'yokup') return {blocked:true};
  const account = await env.DB.prepare(`SELECT a.id, a.name, a.email FROM brand_accounts b JOIN retailer_accounts a ON a.id = b.retailer_id WHERE b.brand_key = ?`).bind(LECTURA_BRAND).first();
  if (!account) return {missing:true};
  account.access = {delegated:true, role:'viewer', actor_email:LECTURA_EMAIL, actor_kind:'lectura'};
  return {account};
}

export {DEST as LECTURA_DEST};
