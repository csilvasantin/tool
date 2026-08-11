import test from "node:test";
import assert from "node:assert/strict";
import { AUTH_CALLBACK_URI, AUTH_HANDOFF_URI, AUTH_COOKIE_NAMES, handleAuthRequest, handoffOriginAllowed, safeReturnPath, sessionCookie, verifyGoogleCredential, withCredentialCors } from "./src/auth-flow.js";

class FakeDB {
  constructor() { this.rows = new Map(); }
  prepare(sql) {
    const db = this;
    return { args: [], bind(...args) { this.args = args; return this; },
      async run() {
        if (sql.startsWith("CREATE TABLE")) return { meta:{ changes:0 } };
        if (sql.startsWith("INSERT INTO auth_challenges")) {
          const [state, nonce, returnPath, flow, expiresAt] = this.args;
          db.rows.set(state, { state, nonce, return_path:returnPath, flow, expires_at:expiresAt, used_at:null });
          return { meta:{ changes:1 } };
        }
        if (sql.startsWith("INSERT INTO auth_handoffs")) {
          const [code, email, name, returnPath, expiresAt] = this.args;
          db.rows.set("handoff:" + code, { code, email, name, return_path:returnPath, expires_at:expiresAt, used_at:null });
          return { meta:{ changes:1 } };
        }
        if (sql.startsWith("UPDATE auth_challenges")) {
          const [usedAt, state, now] = this.args; const row = db.rows.get(state);
          if (!row || row.used_at || row.expires_at < now) return { meta:{ changes:0 } };
          row.used_at = usedAt; return { meta:{ changes:1 } };
        }
        if (sql.startsWith("UPDATE auth_handoffs")) {
          const [usedAt, code, now] = this.args; const row = db.rows.get("handoff:" + code);
          if (!row || row.used_at || row.expires_at < now) return { meta:{ changes:0 } };
          row.used_at = usedAt; return { meta:{ changes:1 } };
        }
        throw new Error("SQL no soportado: " + sql);
      },
      async first() {
        if (sql.startsWith("SELECT state,nonce")) return db.rows.get(this.args[0]) || null;
        if (sql.startsWith("SELECT code,email")) return db.rows.get("handoff:" + this.args[0]) || null;
        throw new Error("SQL no soportado: " + sql);
      }
    };
  }
}

const origin = "https://www.yokup.com";
const clientId = "client.apps.googleusercontent.com";
function request(path, init = {}) {
  const headers = new Headers(init.headers || {}); if (!headers.has("origin")) headers.set("origin", origin);
  return new Request("https://api.yokup.com" + path, { ...init, headers });
}
function deps(nonceRef = { value:"" }) {
  return { clientId, whitelist:async () => new Set(["allowed@example.com"]), revokeSession:async (_env, token) => { nonceRef.revoked=token; },
    makeSession:async (_env, email) => "session-for-" + email + "-" + crypto.randomUUID(),
    readSession:async (_env, token) => token.startsWith("session-for-") ? { email:"allowed@example.com", name:"Allowed" } : null,
    fetchFn:async (url, init) => { nonceRef.url=url; nonceRef.init=init; return new Response(JSON.stringify({
      iss:"https://accounts.google.com", aud:clientId, exp:String(Math.floor(Date.now()/1000)+300),
      iat:String(Math.floor(Date.now()/1000)-2), email_verified:"true", email:"allowed@example.com", name:"Allowed", nonce:nonceRef.value
    }), { status:200, headers:{ "content-type":"application/json" } }); }
  };
}

test("return_path sólo conserva rutas del sitio", () => {
  assert.equal(safeReturnPath("/misiones?q=1#x"), "/misiones?q=1#x");
  assert.equal(safeReturnPath("https://www.yokup.com/highscore?q=1"), "/highscore?q=1");
  assert.equal(safeReturnPath("https://yokup.com/tareas"), "/tareas");
  assert.equal(safeReturnPath("https://evil.example/x"), "/");
  assert.equal(safeReturnPath("//evil.example/x"), "/");
  assert.equal(safeReturnPath("/ok\nSet-Cookie:x"), "/");
});

test("redirect GIS valida CSRF, crea handoff opaco y sólo el backend emite sesión", async () => {
  const env = { DB:new FakeDB() };
  const issued = await handleAuthRequest(request("/auth/challenge", {
    method:"POST", headers:{"content-type":"application/json"},
    body:JSON.stringify({flow:"redirect",return_to:"https://www.yokup.com/misiones?scope=active#top"})
  }), env, deps());
  assert.equal(issued.status, 200);
  const challenge = await issued.json();
  assert.equal(challenge.login_uri, AUTH_CALLBACK_URI);
  assert.match(issued.headers.get("set-cookie"), /SameSite=None/);
  const ownCookie = issued.headers.get("set-cookie").split(";", 1)[0];
  const csrf = "gis-csrf-value";
  const callback = () => new Request(AUTH_CALLBACK_URI, {
    method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded","cookie":`${ownCookie}; g_csrf_token=${csrf}`},
    body:new URLSearchParams({credential:"id-token-secret",g_csrf_token:csrf,state:challenge.state})
  });
  const seen = { value:challenge.nonce };
  const response = await handleAuthRequest(callback(), env, deps(seen));
  assert.equal(response.status, 200);
  assert.doesNotMatch(response.headers.get("set-cookie") || "", /__Host-yk_session=/);
  const html = await response.text();
  assert.doesNotMatch(html, /credential|id-token|state=/i);
  assert.match(html, new RegExp(`action="${AUTH_HANDOFF_URI.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  const code = html.match(/name="code" value="([A-Za-z0-9_-]+)"/)[1];
  const handoffRequest = () => request("/auth/handoff", { method:"POST", headers:{origin:"null",cookie:"__Host-yk_session=stale","content-type":"application/x-www-form-urlencoded"}, body:new URLSearchParams({code}) });
  const attempts = await Promise.all([handleAuthRequest(handoffRequest(), env, deps(seen)), handleAuthRequest(handoffRequest(), env, deps(seen))]);
  assert.deepEqual(attempts.map(item => item.status).sort(), [303, 401], "dos canjes concurrentes sólo permiten un éxito");
  const completed = attempts.find(item => item.status === 303);
  assert.equal(completed.headers.get("location"), "https://www.yokup.com/misiones?scope=active#top");
  assert.match(completed.headers.get("set-cookie"), /__Host-yk_session=/);
  assert.equal((await handleAuthRequest(handoffRequest(), env, deps(seen))).status, 401, "handoff no admite replay");
  assert.equal((await handleAuthRequest(callback(), env, deps(seen))).status, 401, "state no admite replay");
});

test("handoff Yokup acepta www o null opaco, ignora cookie vieja y rechaza credenciales", () => {
  const req = (headers) => new Request("https://api.yokup.com/auth/handoff", {method:"POST", headers, body:"code=" + "a".repeat(43)});
  assert.equal(handoffOriginAllowed(req({origin:"https://www.yokup.com"})), true);
  assert.equal(handoffOriginAllowed(req({origin:"null",cookie:"__Host-yk_session=stale"})), true);
  assert.equal(handoffOriginAllowed(req({origin:"null",authorization:"Bearer x"})), false);
  assert.equal(handoffOriginAllowed(req({origin:"https://evil.example"})), false);
  assert.equal(handoffOriginAllowed(req({})), false);
});

test("callback redirect rechaza CSRF ausente o distinto antes de verificar Google", async () => {
  const env = { DB:new FakeDB() };
  const issued = await handleAuthRequest(request("/auth/challenge", {
    method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({flow:"redirect",return_to:"//evil.example/x"})
  }), env, deps());
  const challenge = await issued.json();
  const ownCookie = issued.headers.get("set-cookie").split(";", 1)[0];
  let googleCalls = 0;
  const badDeps = deps({value:challenge.nonce});
  badDeps.fetchFn = async () => { googleCalls += 1; throw new Error("no debe llamarse"); };
  const bad = new Request(AUTH_CALLBACK_URI, {
    method:"POST", headers:{"content-type":"application/x-www-form-urlencoded",cookie:`${ownCookie}; g_csrf_token=cookie`},
    body:new URLSearchParams({credential:"secret",g_csrf_token:"body",state:challenge.state})
  });
  const response = await handleAuthRequest(bad, env, badDeps);
  assert.equal(response.status, 403);
  assert.equal(googleCalls, 0);
  assert.doesNotMatch(await response.text(), /secret/);
});

test("token Google viaja por POST y exige issuer, audience, expiry, verificación y nonce", async () => {
  const seen = { value:"nonce-1" };
  const ok = await verifyGoogleCredential("id-token-secret", "nonce-1", clientId, deps(seen).fetchFn);
  assert.equal(ok.email, "allowed@example.com");
  assert.equal(seen.url, "https://oauth2.googleapis.com/tokeninfo");
  assert.equal(seen.init.method, "POST"); assert.doesNotMatch(seen.url, /id-token-secret/); assert.match(seen.init.body, /^id_token=/);
  seen.value = "otro";
  assert.equal(await verifyGoogleCredential("id-token-secret", "nonce-1", clientId, deps(seen).fetchFn), null);
  const missingIat = deps({value:"nonce-1"}).fetchFn;
  assert.equal(await verifyGoogleCredential("id-token-secret", "nonce-1", clientId, async (url, init) => {
    const response = await missingIat(url, init); const body = await response.json(); delete body.iat;
    return Response.json(body);
  }), null, "iat ausente falla cerrado");
});

test("challenge y nonce son single-use; login rota cookie HttpOnly sin devolver token", async () => {
  const env = { DB:new FakeDB() };
  const challengeResponse = await handleAuthRequest(request("/auth/challenge", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({return_path:"/highscore"}) }), env, deps());
  assert.equal(challengeResponse.status, 200); assert.equal(challengeResponse.headers.get("access-control-allow-origin"), origin);
  assert.equal(challengeResponse.headers.get("access-control-allow-credentials"), "true");
  assert.equal(challengeResponse.headers.get("content-security-policy"), "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  const challenge = await challengeResponse.json(); const challengeCookie = challengeResponse.headers.get("set-cookie").split(";")[0];
  assert.match(challengeCookie, new RegExp("^" + AUTH_COOKIE_NAMES.challenge + "="));
  const seen = { value:challenge.nonce };
  const loginRequest = () => request("/auth/login", { method:"POST", headers:{"content-type":"application/json",cookie:challengeCookie}, body:JSON.stringify({credential:"id-token-secret",state:challenge.state}) });
  const response = await handleAuthRequest(loginRequest(), env, deps(seen));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), {ok:true,email:"allowed@example.com",name:"Allowed"});
  const cookies = response.headers.get("set-cookie");
  assert.match(cookies, new RegExp(AUTH_COOKIE_NAMES.session + "=")); assert.match(cookies, /HttpOnly/); assert.match(cookies, /Secure/); assert.match(cookies, /SameSite=Lax/);
  assert.doesNotMatch(cookies, /id-token-secret/);
  assert.equal((await handleAuthRequest(loginRequest(), env, deps(seen))).status, 401, "replay rechazado");
});

test("origin, preflight y logout fallan cerrados", async () => {
  const env = { DB:new FakeDB() };
  const evil = new Request("https://api.yokup.com/auth/challenge", {method:"POST",headers:{origin:"https://evil.example","content-type":"application/json"},body:"{}"});
  assert.equal((await handleAuthRequest(evil, env, deps())).status, 403);
  const preflight = await handleAuthRequest(request("/auth/login", {method:"OPTIONS"}), env, deps());
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  const revoked={value:""};
  const logout = await handleAuthRequest(request("/auth/logout", {method:"POST",headers:{cookie:"__Host-yk_session=session-for-owner"}}), env, deps(revoked));
  assert.equal(logout.status, 200); assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(revoked.revoked, "session-for-owner");
});

test("cookie __Host- y CORS no conceden credenciales a orígenes ajenos", () => {
  assert.match(sessionCookie("abc"), /^__Host-yk_session=abc; Path=\/;/); assert.match(sessionCookie("abc"), /HttpOnly; Secure; SameSite=Lax/);
  const evil = new Request("https://api.yokup.com/x", {headers:{origin:"https://evil.example"}});
  const response = withCredentialCors(new Response("ok", {headers:{"Access-Control-Allow-Origin":"*"}}), evil);
  assert.equal(response.headers.get("access-control-allow-origin"), "*"); assert.equal(response.headers.get("access-control-allow-credentials"), null);
});
