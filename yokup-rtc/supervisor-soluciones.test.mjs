import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { handleSolucionesIngest, sanearSoluciones } from "./src/supervisor-soluciones.js";

function json(o, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
}

function db() {
  const rows = new Map();
  return {
    async exec() {},
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              if (sql.startsWith("INSERT")) rows.set(args[0], { payload: args[1], updated_at: args[2] });
            },
            async first() {
              return rows.get(args[0]) || null;
            }
          };
        }
      };
    }
  };
}

const env = { DB: db() };
const foto = "https://api.yokup.com/media/fleet/08663f8645b12172.jpg";

function post(body, ua = "Mozilla/5.0 (supervisor-soluciones; MacMini)") {
  return new Request("https://api.yokup.com/supervisor/soluciones", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": ua },
    body: JSON.stringify(body)
  });
}

test("rechaza foto ajena, html e id raro", () => {
  assert.equal(sanearSoluciones({ id: "macmini-insta360", posiciones: [{ id: "sala", foto: "javascript:alert(1)" }] }).error, "foto");
  assert.equal(sanearSoluciones({ id: "../etc", posiciones: [{ id: "sala" }] }).error, "id");
  assert.equal(sanearSoluciones({ id: "macmini-insta360", posiciones: [{ id: "sala", estado: "<b>" }] }).payload.posiciones[0].estado, "sin-dato");
});

test("el POST sin la marca del bucle no pisa el tablero", async () => {
  const res = await handleSolucionesIngest(post({ id: "macmini-insta360", posiciones: [{ id: "sala" }] }, "curl/8"), env, new URL("https://api.yokup.com/supervisor/soluciones"), json);
  assert.equal(res.status, 403);
});

test("guarda y devuelve el recorrido sin sesión", async () => {
  const body = {
    id: "macmini-insta360",
    ciclo: 21,
    en: "sala",
    cuando: "2026-10-14T19:04:00Z",
    posiciones: [{ id: "sala", luz: 0.49, estado: "encendida", foto, cuando: "2026-10-14T19:04:00Z", incidencia: { id: "INC-NOPE<script>", url: "https://evil.example/x" } }],
    abiertas: [{ id: "INC-9M0LWB", posicion: "sala", url: "https://evil.example/ticket", cuando: "2026-10-14T19:03:00Z" }],
    cerradas: [{ id: "no-es-ticket" }]
  };
  const saved = await handleSolucionesIngest(post(body), env, new URL("https://api.yokup.com/supervisor/soluciones"), json);
  assert.equal(saved.status, 200);
  const read = await handleSolucionesIngest(
    new Request("https://api.yokup.com/supervisor/soluciones?id=macmini-insta360"),
    env,
    new URL("https://api.yokup.com/supervisor/soluciones?id=macmini-insta360"),
    json
  );
  const data = await read.json();
  assert.equal(data.en, "sala");
  assert.equal(data.posiciones[0].foto, foto);
  assert.equal(data.posiciones[0].incidencia, null);
  assert.equal(data.abiertas[0].url, "https://www.admira.app/ticket?id=INC-9M0LWB");
  assert.deepEqual(data.cerradas, []);
});

test("la ingesta queda antes de la verja y el supervisor de sesión sigue autenticado", async () => {
  const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
  const ingest = source.indexOf('url.pathname === "/supervisor/soluciones"');
  const gate = source.indexOf('url.pathname.startsWith("/supervisor/")');
  assert.ok(ingest >= 0 && gate > ingest);
  const between = source.slice(gate, gate + 400);
  assert.match(between, /requireAuth\(/);
  assert.doesNotMatch(source.slice(ingest, gate), /handleSupervisorRequest/);
});
