import test from "node:test";
import assert from "node:assert/strict";
import { AUTH_COOKIE_NAMES, handleAuthRequest, safeReturnPath, sessionCookie, verifyGoogleCredential, withCredentialCors } from "./src/auth-flow.js";

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
        if (sql.startsWith("UPDATE auth_challenges")) {
          const [usedAt, state, now] = this.args; const row = db.rows.get(state);
          if (!row || row.used_at || row.expires_at < now) return { meta:{ changes:0 } };
          row.used_at = usedAt; return { meta:{ changes:1 } };
        }
        throw new Error("SQL no soportado: " + sql);
      },
      async first() {
        if (sql.startsWith("SELECT state,nonce")) return db.rows.get(this.args[0]) || null;
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
  assert.equal(safeReturnPath("https://evil.example/x"), "/");
  assert.equal(safeReturnPath("//evil.example/x"), "/");
  assert.equal(safeReturnPath("/ok\nSet-Cookie:x"), "/");
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
