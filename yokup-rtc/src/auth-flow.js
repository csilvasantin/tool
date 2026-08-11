const AUTH_ORIGINS = new Set(["https://www.yokup.com", "https://yokup.com"]);
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const CHALLENGE_COOKIE = "__Host-yk_challenge";
const SESSION_COOKIE = "__Host-yk_session";
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_GOOGLE_TOKEN_AGE_MS = 2 * 60 * 60 * 1000;
export const AUTH_CALLBACK_URI = "https://api.yokup.com/auth/callback";
const PUBLIC_ORIGIN = "https://www.yokup.com";

function randomToken(bytes = 24) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  let raw = "";
  for (const byte of value) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function parseCookies(header) {
  const out = Object.create(null);
  for (const item of String(header || "").split(";")) {
    const at = item.indexOf("=");
    if (at < 1) continue;
    const key = item.slice(0, at).trim();
    try { out[key] = decodeURIComponent(item.slice(at + 1).trim()); } catch (_) {}
  }
  return out;
}

export function safeReturnPath(value) {
  const path = String(value || "/");
  if (/[\u0000-\u001f\u007f]/.test(path)) return "/";
  try {
    if (path.startsWith("//")) return "/";
    const parsed = new URL(path, PUBLIC_ORIGIN);
    if (!AUTH_ORIGINS.has(parsed.origin.toLowerCase())) return "/";
    return parsed.pathname + parsed.search + parsed.hash;
  } catch (_) { return "/"; }
}

export function authOrigin(request) {
  const origin = String(request.headers.get("origin") || "").toLowerCase();
  return AUTH_ORIGINS.has(origin) ? origin : "";
}

export function withCredentialCors(response, request) {
  const origin = authOrigin(request);
  if (!origin || response.status === 101) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  const vary = headers.get("Vary");
  if (!vary || !vary.toLowerCase().split(/\s*,\s*/).includes("origin")) headers.set("Vary", vary ? vary + ", Origin" : "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function sessionCookie(token, maxAge = 12 * 60 * 60) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function challengeCookie(state, maxAge = CHALLENGE_TTL_MS / 1000, sameSite = "Lax") {
  return `${CHALLENGE_COOKIE}=${encodeURIComponent(state)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=${sameSite}`;
}

function clearChallengeCookie(sameSite = "Lax") {
  return `${CHALLENGE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=${sameSite}`;
}

export function sessionTokenFromRequest(request) {
  const auth = String(request.headers.get("authorization") || "");
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  return bearer || parseCookies(request.headers.get("cookie"))[SESSION_COOKIE] || "";
}

async function ensureChallengeSchema(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS auth_challenges (state TEXT PRIMARY KEY, nonce TEXT NOT NULL, return_path TEXT NOT NULL, flow TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER)").run();
}

export async function issueChallenge(env, returnPath, flow = "popup", now = Date.now()) {
  await ensureChallengeSchema(env);
  const state = randomToken();
  const nonce = randomToken();
  const path = safeReturnPath(returnPath);
  await env.DB.prepare("INSERT INTO auth_challenges(state,nonce,return_path,flow,expires_at,used_at) VALUES(?,?,?,?,?,NULL)")
    .bind(state, nonce, path, flow, now + CHALLENGE_TTL_MS).run();
  return { state, nonce, returnPath: path, cookie: challengeCookie(state, CHALLENGE_TTL_MS / 1000, flow === "redirect" ? "None" : "Lax"), expiresAt: now + CHALLENGE_TTL_MS };
}

export async function consumeChallenge(env, request, state, flow, now = Date.now()) {
  const cookieState = parseCookies(request.headers.get("cookie"))[CHALLENGE_COOKIE] || "";
  if (!state || !cookieState || state !== cookieState) return null;
  await ensureChallengeSchema(env);
  const row = await env.DB.prepare("SELECT state,nonce,return_path,flow,expires_at,used_at FROM auth_challenges WHERE state=?").bind(state).first();
  if (!row || row.flow !== flow || row.used_at || Number(row.expires_at) < now) return null;
  const result = await env.DB.prepare("UPDATE auth_challenges SET used_at=? WHERE state=? AND used_at IS NULL AND expires_at>=?")
    .bind(now, state, now).run();
  if (!result || !result.meta || Number(result.meta.changes) !== 1) return null;
  return { nonce: String(row.nonce), returnPath: safeReturnPath(row.return_path) };
}

export async function verifyGoogleCredential(credential, expectedNonce, clientId, fetchFn = fetch, now = Date.now()) {
  if (!credential || typeof credential !== "string" || credential.length > 16384 || !expectedNonce) return null;
  try {
    const response = await fetchFn("https://oauth2.googleapis.com/tokeninfo", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: credential }).toString()
    });
    if (!response.ok) return null;
    const data = await response.json();
    const exp = Number(data.exp) * 1000;
    const iat = Number(data.iat) * 1000;
    if (!GOOGLE_ISSUERS.has(String(data.iss || ""))) return null;
    if (String(data.aud || "") !== clientId) return null;
    if (!Number.isFinite(exp) || exp <= now) return null;
    if (!Number.isFinite(iat) || iat > now + MAX_CLOCK_SKEW_MS || iat < now - MAX_GOOGLE_TOKEN_AGE_MS) return null;
    if (data.email_verified !== true && String(data.email_verified) !== "true") return null;
    if (String(data.nonce || "") !== expectedNonce) return null;
    if (!data.email) return null;
    return data;
  } catch (_) { return null; }
}

function authJson(body, status, request, extraHeaders = {}) {
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store", "Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'; base-uri 'none'", ...extraHeaders });
  const response = new Response(body == null ? null : JSON.stringify(body), { status, headers });
  return withCredentialCors(response, request);
}

function constantTimeTextEqual(left, right) {
  const a = String(left || ""), b = String(right || "");
  if (!a || a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

export function googleCsrfValid(request, form) {
  const cookie = parseCookies(request.headers.get("cookie")).g_csrf_token || "";
  return constantTimeTextEqual(cookie, form && form.g_csrf_token);
}

export async function readGoogleCallbackForm(request) {
  const type = String(request.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (type !== "application/x-www-form-urlencoded") return null;
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 20000) return null;
  const raw = await request.text();
  if (raw.length > 20000) return null;
  const form = new URLSearchParams(raw);
  return {
    credential:form.get("credential") || "",
    g_csrf_token:form.get("g_csrf_token") || "",
    state:form.get("state") || ""
  };
}

function redirectResponse(path, token) {
  const headers = new Headers({
    "location":PUBLIC_ORIGIN + safeReturnPath(path),
    "cache-control":"no-store",
    "Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    "Referrer-Policy":"no-referrer"
  });
  headers.append("Set-Cookie", sessionCookie(token));
  headers.append("Set-Cookie", clearChallengeCookie("None"));
  return new Response(null, { status:303, headers });
}

export async function handleAuthRequest(request, env, deps) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/auth/")) return null;
  if (request.method === "OPTIONS") {
    if (!authOrigin(request)) return new Response(null, { status: 403, headers: { "cache-control":"no-store" } });
    return withCredentialCors(new Response(null, { status: 204, headers: {
      "Access-Control-Allow-Methods":"GET,POST,OPTIONS", "Access-Control-Allow-Headers":"content-type,authorization", "Access-Control-Max-Age":"600"
    } }), request);
  }
  if (url.pathname === "/auth/challenge" && request.method === "POST") {
    if (!authOrigin(request)) return authJson({ ok:false, error:"origin_not_allowed" }, 403, request);
    const body = await request.json().catch(() => ({}));
    const flow = body.flow === "redirect" ? "redirect" : "popup";
    // return_to queda en D1, nunca viaja a Google ni comparte URL con el token.
    const challenge = await issueChallenge(env, flow === "redirect" ? body.return_to : "/", flow);
    return authJson({ ok:true, state:challenge.state, nonce:challenge.nonce, expires_at:challenge.expiresAt, login_uri:flow === "redirect" ? AUTH_CALLBACK_URI : undefined }, 200, request, { "Set-Cookie":challenge.cookie });
  }
  if (url.pathname === "/auth/session" && request.method === "GET") {
    if (!authOrigin(request)) return authJson({ ok:false, error:"origin_not_allowed" }, 403, request);
    const token = sessionTokenFromRequest(request);
    const session = await deps.readSession(env, token);
    if (!session) return authJson({ ok:false }, 401, request, { "Set-Cookie":clearSessionCookie() });
    const headers = {};
    if (/^Bearer\s+/i.test(String(request.headers.get("authorization") || ""))) {
      headers["Set-Cookie"] = sessionCookie(await deps.makeSession(env, session.email, session.name || ""));
    }
    return authJson({ ok:true, email:session.email, name:session.name || "" }, 200, request, headers);
  }
  if (url.pathname === "/auth/logout" && request.method === "POST") {
    if (!authOrigin(request)) return authJson({ ok:false, error:"origin_not_allowed" }, 403, request);
    if (deps.revokeSession) await deps.revokeSession(env, sessionTokenFromRequest(request));
    return authJson({ ok:true }, 200, request, { "Set-Cookie":clearSessionCookie() });
  }
  if (url.pathname === "/auth/login" && request.method === "POST") {
    const origin = authOrigin(request);
    if (!origin) return authJson({ ok:false, error:"origin_not_allowed" }, 403, request, { "Set-Cookie":clearChallengeCookie() });
    const body = await request.json().catch(() => ({}));
    const challenge = await consumeChallenge(env, request, String(body.state || ""), "popup");
    if (!challenge) return authJson({ ok:false, error:"challenge_invalid" }, 401, request, { "Set-Cookie":clearChallengeCookie() });
    const google = await verifyGoogleCredential(body.credential, challenge.nonce, deps.clientId, deps.fetchFn || fetch);
    if (!google) return authJson({ ok:false, error:"credential_invalid" }, 401, request, { "Set-Cookie":clearChallengeCookie() });
    const email = String(google.email).toLowerCase();
    if (!(await deps.whitelist()).has(email)) return authJson({ ok:false, error:"not_allowed" }, 403, request, { "Set-Cookie":clearChallengeCookie() });
    const token = await deps.makeSession(env, email, google.name || "");
    const headers = new Headers({ "content-type":"application/json", "cache-control":"no-store" });
    headers.append("Set-Cookie", sessionCookie(token)); headers.append("Set-Cookie", clearChallengeCookie());
    return withCredentialCors(new Response(JSON.stringify({ ok:true, email, name:String(google.name || "").trim() }), { status:200, headers }), request);
  }
  if (url.pathname === "/auth/callback" && request.method === "POST") {
    const form = await readGoogleCallbackForm(request);
    if (!form || !googleCsrfValid(request, form)) {
      return authJson({ ok:false, error:"csrf_invalid" }, 403, request, { "Set-Cookie":clearChallengeCookie("None") });
    }
    const challenge = await consumeChallenge(env, request, form.state, "redirect");
    if (!challenge) return authJson({ ok:false, error:"challenge_invalid" }, 401, request, { "Set-Cookie":clearChallengeCookie("None") });
    const google = await verifyGoogleCredential(form.credential, challenge.nonce, deps.clientId, deps.fetchFn || fetch);
    if (!google) return authJson({ ok:false, error:"credential_invalid" }, 401, request, { "Set-Cookie":clearChallengeCookie("None") });
    const email = String(google.email).toLowerCase();
    if (!(await deps.whitelist()).has(email)) return authJson({ ok:false, error:"not_allowed" }, 403, request, { "Set-Cookie":clearChallengeCookie("None") });
    const token = await deps.makeSession(env, email, google.name || "");
    return redirectResponse(challenge.returnPath, token);
  }
  return authJson({ ok:false, error:"not_found" }, 404, request);
}

export const AUTH_COOKIE_NAMES = { challenge: CHALLENGE_COOKIE, session: SESSION_COOKIE };
