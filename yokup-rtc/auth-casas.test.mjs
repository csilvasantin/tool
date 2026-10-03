// admira.biz es el espejo de yokup.com (Carlos, 2-oct-2026): su login tiene que nacer y
// acabar en admira.biz, con la cookie en api.admira.biz, sin pasar por yokup.com.
import test from "node:test";
import assert from "node:assert/strict";
import { handleAuthRequest, houseForOrigin } from "./src/auth-flow.js";

class FakeDB {
  constructor() { this.rows = new Map(); }
  prepare(sql) {
    const db = this;
    return { args: [], bind(...args) { this.args = args; return this; },
      async run() {
        if (sql.startsWith("CREATE TABLE") || sql.startsWith("ALTER TABLE")) return { meta:{ changes:0 } };
        if (sql.startsWith("INSERT INTO auth_challenges")) {
          const [state, nonce, returnPath, flow, expiresAt, origin] = this.args;
          db.rows.set(state, { state, nonce, return_path:returnPath, flow, expires_at:expiresAt, used_at:null, origin });
          return { meta:{ changes:1 } };
        }
        if (sql.startsWith("INSERT INTO auth_handoffs")) {
          const [code, email, name, returnPath, expiresAt, origin] = this.args;
          db.rows.set("handoff:" + code, { code, email, name, return_path:returnPath, expires_at:expiresAt, used_at:null, origin });
          return { meta:{ changes:1 } };
        }
        const key = sql.startsWith("UPDATE auth_handoffs") ? "handoff:" + this.args[1] : this.args[1];
        const row = db.rows.get(key);
        if (!row || row.used_at || row.expires_at < this.args[2]) return { meta:{ changes:0 } };
        row.used_at = this.args[0]; return { meta:{ changes:1 } };
      },
      async first() {
        return db.rows.get(sql.startsWith("SELECT code,email") ? "handoff:" + this.args[0] : this.args[0]) || null;
      }
    };
  }
}

const clientId = "client.apps.googleusercontent.com";
const deps = (seen) => ({ clientId, whitelist:async () => new Set(["allowed@example.com"]),
  makeSession:async (_env, email) => "session-for-" + email,
  readSession:async (_env, token) => token.startsWith("session-for-") ? { email:"allowed@example.com", name:"Allowed" } : null,
  fetchFn:async () => new Response(JSON.stringify({
    iss:"https://accounts.google.com", aud:clientId, exp:String(Math.floor(Date.now()/1000)+300),
    iat:String(Math.floor(Date.now()/1000)-2), email_verified:"true", email:"allowed@example.com", name:"Allowed", nonce:seen.value
  }), { status:200, headers:{ "content-type":"application/json" } }) });

async function loginRedirect(env, web, api) {
  const issued = await handleAuthRequest(new Request(api + "/auth/challenge", {
    method:"POST", headers:{ "content-type":"application/json", origin:web },
    body:JSON.stringify({ flow:"redirect", return_to:"/incidencias?estado=abierta" })
  }), env, deps({}));
  assert.equal(issued.status, 200);
  const challenge = await issued.json();
  const cookie = issued.headers.get("set-cookie").split(";", 1)[0];
  const callback = await handleAuthRequest(new Request(web + "/auth/callback", {
    method:"POST", headers:{ "content-type":"application/x-www-form-urlencoded", cookie:`${cookie}; g_csrf_token=csrf` },
    body:new URLSearchParams({ credential:"id-token", g_csrf_token:"csrf", state:challenge.state })
  }), env, deps({ value:challenge.nonce }));
  return { challenge, callback };
}

test("cada casa conoce su web y su API; admira.live no tiene flujo de redirección", () => {
  assert.equal(houseForOrigin("https://admira.biz").api, "https://api.admira.biz");
  assert.equal(houseForOrigin("https://www.yokup.com").web, "https://www.yokup.com");
  assert.equal(houseForOrigin("https://www.admira.live"), null);
  assert.equal(houseForOrigin("https://evil.example"), null);
});

test("login desde admira.biz: Google vuelve a admira.biz, la cookie nace en api.admira.biz y se aterriza en admira.biz", async () => {
  const env = { DB:new FakeDB() };
  const { challenge, callback } = await loginRedirect(env, "https://www.admira.biz", "https://api.yokup.com");
  assert.equal(challenge.login_uri, "https://www.admira.biz/auth/callback");
  assert.equal(callback.status, 303);
  const handoff = new URL(callback.headers.get("location"));
  assert.equal(handoff.origin + handoff.pathname, "https://api.admira.biz/auth/handoff");
  const done = await handleAuthRequest(new Request(handoff, { method:"GET" }), env, deps({}));
  assert.equal(done.status, 303);
  assert.equal(done.headers.get("location"), "https://www.admira.biz/incidencias?estado=abierta");
  assert.match(done.headers.get("set-cookie"), /__Host-yk_session=/);
});

test("un relevo de admira.biz no se puede canjear en el API de yokup (la cookie caería en otra casa)", async () => {
  const env = { DB:new FakeDB() };
  const { callback } = await loginRedirect(env, "https://www.admira.biz", "https://api.yokup.com");
  const code = new URL(callback.headers.get("location")).searchParams.get("code");
  const wrong = await handleAuthRequest(new Request("https://api.yokup.com/auth/handoff?code=" + code, { method:"GET" }), env, deps({}));
  assert.equal(wrong.status, 401);
  assert.doesNotMatch(wrong.headers.get("set-cookie") || "", /__Host-yk_session=[^;]/);
});

test("yokup.com sigue igual: vuelve a yokup y su cookie nace en api.yokup.com", async () => {
  const env = { DB:new FakeDB() };
  const { challenge, callback } = await loginRedirect(env, "https://www.yokup.com", "https://api.yokup.com");
  assert.equal(challenge.login_uri, "https://www.yokup.com/auth/callback");
  const handoff = new URL(callback.headers.get("location"));
  assert.equal(handoff.origin, "https://api.yokup.com");
  const done = await handleAuthRequest(new Request(handoff, { method:"GET" }), env, deps({}));
  assert.equal(done.headers.get("location"), "https://www.yokup.com/incidencias?estado=abierta");
});

test("sesión y CORS con credenciales desde admira.biz; un origen ajeno, no", async () => {
  const ok = await handleAuthRequest(new Request("https://api.admira.biz/auth/session", { headers:{ origin:"https://www.admira.biz", cookie:"__Host-yk_session=session-for-x" } }), {}, deps({}));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://www.admira.biz");
  assert.equal(ok.headers.get("access-control-allow-credentials"), "true");
  const no = await handleAuthRequest(new Request("https://api.admira.biz/auth/session", { headers:{ origin:"https://evil.example", cookie:"__Host-yk_session=session-for-x" } }), {}, deps({}));
  assert.equal(no.status, 403);
});

// INTERCAMBIO DE DOMINIOS (Carlos, 4-oct-2026): admira.app pasará a ser la casa de Yokup y
// admira.biz la de negocio. Las dos casas conviven: cada una con su web, su API y su sesión.
test("admira.app es una casa más: su web y su API (api.admira.app); admira.biz no cambia", () => {
  assert.deepEqual(houseForOrigin("https://www.admira.app"), { web:"https://www.admira.app", api:"https://api.admira.app", origins:["https://www.admira.app", "https://admira.app"] });
  assert.equal(houseForOrigin("https://admira.app").api, "https://api.admira.app");
  assert.equal(houseForOrigin("https://www.admira.biz").api, "https://api.admira.biz");
  for (const o of ["https://admira.app.evil.example", "http://www.admira.app", "https://xadmira.app"]) assert.equal(houseForOrigin(o), null, o);
});

test("login desde admira.app: Google vuelve a admira.app, la cookie nace en api.admira.app y se aterriza en admira.app", async () => {
  const env = { DB:new FakeDB() };
  const { challenge, callback } = await loginRedirect(env, "https://www.admira.app", "https://api.yokup.com");
  assert.equal(challenge.login_uri, "https://www.admira.app/auth/callback");
  assert.equal(callback.status, 303);
  const handoff = new URL(callback.headers.get("location"));
  assert.equal(handoff.origin + handoff.pathname, "https://api.admira.app/auth/handoff");
  const done = await handleAuthRequest(new Request(handoff, { method:"GET" }), env, deps({}));
  assert.equal(done.status, 303);
  assert.equal(done.headers.get("location"), "https://www.admira.app/incidencias?estado=abierta");
  assert.match(done.headers.get("set-cookie"), /__Host-yk_session=/);
});

test("un relevo de admira.app no se canjea en el API de admira.biz (las casas no comparten sesión)", async () => {
  const env = { DB:new FakeDB() };
  const { callback } = await loginRedirect(env, "https://www.admira.app", "https://api.yokup.com");
  const code = new URL(callback.headers.get("location")).searchParams.get("code");
  const wrong = await handleAuthRequest(new Request("https://api.admira.biz/auth/handoff?code=" + code, { method:"GET" }), env, deps({}));
  assert.equal(wrong.status, 401);
  assert.doesNotMatch(wrong.headers.get("set-cookie") || "", /__Host-yk_session=[^;]/);
});

test("sesión y CORS con credenciales desde admira.app", async () => {
  const ok = await handleAuthRequest(new Request("https://api.admira.app/auth/session", { headers:{ origin:"https://www.admira.app", cookie:"__Host-yk_session=session-for-x" } }), {}, deps({}));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://www.admira.app");
  assert.equal(ok.headers.get("access-control-allow-credentials"), "true");
});

test("wrangler publica api.admira.app como dominio propio junto a api.admira.biz", async () => {
  const { readFile } = await import("node:fs/promises");
  const toml = await readFile(new URL("./wrangler.toml", import.meta.url), "utf8");
  for (const host of ["api.admira.biz", "api.admira.app"]) {
    assert.match(toml, new RegExp(`\\[\\[routes\\]\\]\\s*\\npattern = "${host.replace(/\./g, "\\.")}"\\s*\\ncustom_domain = true`), host);
  }
});
