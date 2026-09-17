// La cookie de sesión pasó a SameSite=None el 17-09-2026 para que www.admira.live pueda
// usar la misma sesión que yokup.com (la mudanza del sitio). Lax nos daba protección CSRF
// gratis: con None, CUALQUIER página puede hacer que el navegador mande esa cookie a
// api.yokup.com. La protección se muda a requireAuth, que es por donde pasa toda la
// autenticación por sesión del worker. Esto fija que ahí sigue cerrada.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

// Misma técnica que turn-grifo.test.mjs: se recorta la función del bundle y se ejecuta
// con dependencias de mentira, sin levantar el worker entero.
function fuente(nombre) {
  const inicio = source.indexOf(`async function ${nombre}(`);
  assert.notEqual(inicio, -1, `falta ${nombre}`);
  const llave = source.indexOf("{", inicio);
  let nivel = 0, comilla = "", escapado = false;
  for (let i = llave; i < source.length; i += 1) {
    const c = source[i];
    if (comilla) {
      if (escapado) escapado = false;
      else if (c === "\\") escapado = true;
      else if (c === comilla) comilla = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { comilla = c; continue; }
    if (c === "{") nivel += 1;
    else if (c === "}" && --nivel === 0) return source.slice(inicio, i + 1);
  }
  throw new Error(`${nombre} incompleta`);
}

const NUESTRAS = new Set(["https://www.yokup.com", "https://yokup.com", "https://www.admira.live", "https://admira.live"]);
const ctx = vm.createContext({
  String, Boolean,
  // Las de verdad viven en auth-flow.js; aquí basta con que se comporten igual.
  authOrigin: (req) => { const o = String(req.headers.get("origin") || "").toLowerCase(); return NUESTRAS.has(o) ? o : ""; },
  sessionTokenFromRequest: (req) => String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")
    || (String(req.headers.get("cookie") || "").match(/__Host-yk_session=([^;]+)/) || [])[1] || "",
  readSession: async (_env, token) => (token === "buena" ? { email: "csilva@admira.com" } : null),
});
vm.runInContext(fuente("requireAuth") + "\nglobalThis.requireAuth = requireAuth;", ctx);

const conCookie = (extra = {}) => new Request("https://api.yokup.com/tasks/all", {
  headers: new Headers({ cookie: "__Host-yk_session=buena", ...extra }),
});

test("desde nuestras casas la sesión vale", async () => {
  for (const origen of [...NUESTRAS]) {
    const sesion = await ctx.requireAuth({}, conCookie({ origin: origen }));
    assert.ok(sesion, origen + " debería poder usar la sesión");
    assert.equal(sesion.email, "csilva@admira.com");
  }
});

test("desde una página ajena la cookie llega pero NO vale: eso es el CSRF cerrado", async () => {
  // Este es el caso que Lax impedía solo y que ahora hay que impedir a mano: una página
  // cualquiera hace un POST a api.yokup.com y el navegador adjunta la cookie del usuario.
  for (const ajeno of ["https://evil.example", "https://admira.live.evil.net", "http://www.admira.live",
                       "https://yokup.com.evil.net", "null"]) {
    assert.equal(await ctx.requireAuth({}, conCookie({ origin: ajeno })), null, ajeno + " no debería colarse");
  }
});

test("sin Origin se sigue entrando: ahí no hay navegador al que engañar", async () => {
  // Un CLI, un curl o otro worker no mandan Origin y ponen el Bearer a mano. Cerrarles la
  // puerta aquí habría roto la flota entera sin ganar nada: el CSRF necesita un navegador.
  const sesion = await ctx.requireAuth({}, conCookie());
  assert.ok(sesion);
  const conBearer = await ctx.requireAuth({}, new Request("https://api.yokup.com/tasks/all", {
    headers: new Headers({ authorization: "Bearer buena" }),
  }));
  assert.ok(conBearer);
});

test("un token que no vale sigue sin valer, venga de donde venga", async () => {
  assert.equal(await ctx.requireAuth({}, new Request("https://api.yokup.com/tasks/all", {
    headers: new Headers({ origin: "https://www.admira.live", cookie: "__Host-yk_session=falsa" }),
  })), null);
});
