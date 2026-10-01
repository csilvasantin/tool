import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleEquipoInventario, equipoQuery, EQUIPO_PATH, EQUIPO_URL } from "./src/equipo-inventario.js";

// Ficha de inventario desde la incidencia (01-oct-2026): /ticket/equipo resuelve el «Equipo» por el binding INCIDENT_DESK.
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const TICKET = { id: "INC-3EC933", screen: "demo:starbucks-alsea-paseo-de-gracia:tpv:manual:3ec933e9-0000", loc: "Starbucks Alsea · Paseo de Gracia 103", project: "xpaceos", subject: "TPV" };
function env({ ticket = TICKET, desk } = {}) {
  const calls = [];
  return { calls, DB: { prepare: (sql) => ({ bind: (...a) => ({ first: async () => (/FROM tickets/.test(sql) && a[0] === ticket?.id ? ticket : null) }) }) },
    INCIDENT_DESK: desk === null ? undefined : { fetch: async (r) => { calls.push(r); return desk ? desk(r) : json({ ok: true, found: true, match: "categoria", ci: { itil_code: "PDG103-TPV-01" } }); } } };
}
const get = (e, qs, method = "GET") => handleEquipoInventario(new Request("https://api.yokup.com" + EQUIPO_PATH + qs, { method }), e, { json, portalLinksFor: async () => new Map() });

test("equipoQuery: ref = screen, loc y la incidencia del Portal si la hay", () => {
  assert.equal(equipoQuery(TICKET).toString(), "ref=demo%3Astarbucks-alsea-paseo-de-gracia%3Atpv%3Amanual%3A3ec933e9-0000&loc=Starbucks+Alsea+%C2%B7+Paseo+de+Gracia+103");
  assert.equal(equipoQuery({ screen: "portal:inc-9" }).get("portal_incident"), "inc-9");
  assert.equal(equipoQuery({ screen: "x" }, { incident_id: "inc-7" }).get("portal_incident"), "inc-7");
  assert.equal(equipoQuery({}).toString(), "");
});

test("/ticket/equipo: llama a yokup-api por binding (host interno, sin cabeceras del borde) y devuelve la ficha", async () => {
  const e = env(); const r = await get(e, "?id=INC-3EC933"); const b = await r.json();
  assert.equal(r.status, 200); assert.equal(b.found, true); assert.equal(b.ci.itil_code, "PDG103-TPV-01"); assert.equal(b.ticket.id, "INC-3EC933");
  const u = new URL(e.calls[0].url); assert.equal(u.origin + u.pathname, EQUIPO_URL); assert.equal(u.hostname, "yokup-api.internal");
  assert.equal(u.searchParams.get("ref"), TICKET.screen); assert.equal(e.calls[0].headers.get("cf-connecting-ip"), null);
  const c = env(); await get(c, "?code=PDG103-TPV-01"); assert.equal(new URL(c.calls[0].url).searchParams.get("code"), "PDG103-TPV-01");
});

test("/ticket/equipo: validación, 404, sin binding y fallo de yokup-api sin filtrar detalles", async () => {
  assert.equal((await get(env(), "")).status, 400);
  assert.equal((await get(env(), "?id=" + encodeURIComponent("<x>"))).status, 400);
  assert.equal((await get(env(), "?code=pdg-1")).status, 400);
  assert.equal((await get(env(), "?id=INC-NOPE")).status, 404);
  assert.equal((await get(env(), "?id=INC-3EC933", "POST")).status, 405);
  assert.equal((await get(env({ desk: null }), "?id=INC-3EC933")).status, 503);
  const down = await get(env({ desk: () => json({ ok: false, error: "secreto interno" }, 500) }), "?id=INC-3EC933");
  assert.equal(down.status, 502); assert.doesNotMatch(await down.text(), /secreto interno/);
});

test("index.js: /ticket/equipo es ruta PROTEGIDA (sesión del helpdesk) y se atiende antes de /ticket", () => {
  const src = readFileSync(new URL("./src/index.js", import.meta.url), "utf8");
  assert.match(src, /var PROTECTED = [^\n]*"\/ticket\/equipo"/);
  assert.match(src, /import \{ EQUIPO_PATH, handleEquipoInventario \} from '\.\/equipo-inventario\.js';/);
  const at = src.indexOf("url.pathname === EQUIPO_PATH"), prot = src.indexOf("if (PROTECTED.has(url.pathname)");
  assert.ok(at > prot && prot > 0, "después de la puerta de sesión");
  assert.ok(at < src.indexOf('if (url.pathname === "/ticket") {'));
});
