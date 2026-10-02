import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// Carlos, 01-10-2026 · el «Equipo» de la incidencia enlaza su ficha del inventario ITIL (CMDB de los Xpacios).
const require = createRequire(import.meta.url);
const E = require("./yk-equipo.js");
const read = f => readFileSync(new URL("./" + f, import.meta.url), "utf8");
const ticket = read("ticket.html"), ficha = read("equipo-inventario.html"), informe = read("informe-incidencia.html"), css = read("ticket-portal.css"), itil = read("retailer-itil.js"), retailer = read("retailer.html");
const CI = { itil_code: "PDG103-TPV-01", name: "TPV caja", category: "tpv", managed_by: "itil", lifecycle: { serial: "SN-PRUEBA-1", manufacturer: "Marca P", model: "Modelo P", purchase_date: "2026-02-01", warranty_months: 24, warranty_until: "2028-02-01", warranty_until_derived: true, warranty: "valid", warranty_days: 488, status: "degraded" } };

test("insignia de garantía: en garantía · vencida · sin dato (nunca vigente sin fechas)", () => {
  assert.equal(E.garantia(CI.lifecycle).estado, "en_garantia");
  assert.equal(E.garantia(CI.lifecycle).detalle, "hasta 01/02/2028 (calculado)");
  assert.equal(E.garantia({ warranty: "expiring", warranty_days: 5, warranty_end: "2026-10-06" }).pronto, true);
  assert.equal(E.garantia({ warranty: "expired", warranty_days: -3, warranty_end: "2026-09-28" }).estado, "vencida");
  assert.equal(E.garantia({}).estado, "sin_dato"); assert.equal(E.garantia(null).label, "Sin dato");
  assert.equal(E.garantia({ warranty_end: "2020-01-01" }, Date.parse("2026-10-01")).estado, "vencida", "sin estado del servidor se calcula con la fecha");
  assert.equal(E.garantia({ warranty: "none" }).estado, "sin_dato");
});

test("ficha: todos los campos pedidos y «sin dato» en los vacíos", () => {
  const c = E.campos(CI), get = k => c.find(x => x.k === k);
  for (const k of ["Modelo", "Fabricante", "Nº de serie", "Fecha de compra", "Proveedor", "Duración (meses)", "Fin de garantía", "Estado", "Estado de la garantía"]) assert.ok(get(k), k);
  assert.equal(get("Nº de serie").v, "SN-PRUEBA-1"); assert.equal(get("Fecha de compra").v, "01/02/2026"); assert.equal(get("Duración (meses)").v, "24 meses");
  assert.equal(get("Fin de garantía").v, "01/02/2028 (calculado)"); assert.equal(get("Estado").v, "Degradado (avería)");
  assert.equal(get("Proveedor").v, "sin dato"); assert.equal(get("Proveedor").vacio, true);
  const empty = E.campos({ itil_code: "AB-CD", name: "X", category: "pantalla", lifecycle: {} });
  for (const k of ["Nº de serie", "Fecha de compra", "Proveedor", "Modelo", "Duración (meses)", "Fin de garantía", "Estado de la garantía"]) assert.equal(empty.find(x => x.k === k).v, "sin dato", k);
  assert.match(E.resumen({ ok: true, found: true, ci: CI }), /PDG103-TPV-01 · Nº de serie SN-PRUEBA-1 · Garantía: En garantía, hasta 01\/02\/2028/);
  assert.equal(E.resumen({ ok: true, found: false, reason: "no_inventariado" }), "No está en el inventario");
});

test("enlaces: ficha por incidencia o código; alta prefijada sin datos inventados; edición en el Inventario ITIL", () => {
  assert.equal(E.fichaUrl({ ticket: "INC-1" }), "/equipo-inventario?ticket=INC-1");
  assert.equal(E.fichaUrl({ code: "PDG103-TPV-01" }), "/equipo-inventario?code=PDG103-TPV-01");
  const alta = E.altaUrl({ ok: true, found: false, reason: "no_inventariado", ref: "demo:starbucks-alsea-paseo-de-gracia:tpv:manual:x", create: { admira_store_id: "alsea-sbux-021", category: "tpv", name: "TPV" } }, "INC-1");
  assert.equal(alta, "/retailer?itil_alta=1&xpacio=alsea-sbux-021&categoria=tpv&nombre=TPV&ref=demo%3Astarbucks-alsea-paseo-de-gracia%3Atpv%3Amanual%3Ax&incidencia=INC-1#itil");
  assert.doesNotMatch(alta, /serial|serie=|garantia=|compra=/);
  assert.equal(E.inventarioUrl({ ci: CI, xpacio: { admira_store_id: "alsea-sbux-021" } }), "/retailer?xpacio=alsea-sbux-021&itil=PDG103-TPV-01#itil");
  assert.match(E.motivo({ reason: "no_inventariado" }), /^No está en el inventario/);
  assert.match(E.motivo({ reason: "ambiguo" }), /varios equipos posibles/);
});

test("ficha /ticket: el Equipo enlaza el inventario con serie e insignia, o «no está en el inventario» con alta", () => {
  assert.match(ticket, /<script src="\/yk-equipo\.js\?v=/);
  assert.match(ticket, /dato\(dl,"Equipo",t\.screen\?nodo\("span","scr",t\.screen\):"Sin equipo",t\.screen\?equipoInvNodo\(\):""\)/);
  assert.match(ticket, /fetch\(WORKER\+"\/ticket\/equipo\?id="\+encodeURIComponent\(t\.id\)/);
  assert.match(ticket, /E\.altaUrl\(r,t\.id\)/); assert.match(ticket, /E\.fichaUrl\(\{ticket:t\.id\}\)/); assert.match(ticket, /"Nº de serie: "\+E\.txt\(lc\.serial\)/);
  assert.match(ticket, /YkEquipo\.resumen\(EQUIPO_INV\)/, "el correo del informe lleva el equipo");
  const fn = ticket.slice(ticket.indexOf("async function cargaEquipoInv"), ticket.indexOf("async function render"));
  assert.doesNotMatch(fn, /innerHTML/, "datos del inventario por textContent");
  assert.match(ticket, /\/ticket-portal\.css\?v=3"/);
  assert.match(css, /body\.yk-ticket \.tk-war\[data-w="vencida"\]/);
});

test("ficha de inventario: protegida, por textContent, con «sin dato» y alta cuando no está", () => {
  assert.match(ficha, /<script src="\/acceso\.js\?v=20260811-r4-09349d26f146"><\/script>/);
  assert.match(ficha, /<script src="\/yk-equipo\.js\?v=/);
  assert.match(ficha, /fetch\(WORKER\+"\/ticket\/equipo\?"/);
  assert.match(ficha, /<meta name="robots" content="noindex, nofollow">/);
  const js = ficha.slice(ficha.indexOf("function ficha("));
  assert.doesNotMatch(js.replace(/\$\("root"\)\.innerHTML='<div class="err">Falta[^']*'/, ""), /innerHTML/);
  assert.match(ficha, /E\.altaUrl\(r,ticket\)/); assert.match(ficha, /E\.inventarioUrl\(r\)/); assert.match(ficha, /@media print\{/);
  assert.doesNotMatch(ficha, /yk-portal-light\.css/);
});

test("informe: sección de equipo con nº de serie y estado de garantía del inventario", () => {
  assert.match(informe, /<script src="\/yk-equipo\.js\?v=/);
  assert.match(informe, /dato\("Equipo · inventario ITIL"/);
  assert.match(informe, /fetch\(WORKER\+"\/ticket\/equipo\?id="\+encodeURIComponent\(id\)/);
  assert.match(informe, /"Nº de serie: "\+E\.txt\(lc\.serial\)/); assert.match(informe, /"Garantía · "\+g\.label/);
  assert.match(informe, /YkEquipo\.resumen\(INV\)/);
});

test("Inventario ITIL del portal: garantía en meses, datos clave en la tarjeta y enlaces desde la incidencia", () => {
  const itilForm = retailer.slice(retailer.indexOf('id="itil-form"'), retailer.indexOf('id="itil-retire-dialog"'));
  assert.match(itilForm, /name="warranty_months" min="1" max="600"/, "en el formulario del CI ITIL");
  assert.equal((retailer.match(/name="warranty_months"/g) || []).length, 1, "y solo ahí (Mis equipos no lo envía)");
  assert.match(retailer, /\/retailer-itil\.js\?v=3/);
  assert.match(itil, /'warranty_months'/); assert.match(itil, /NUM\.has\(f\)/);
  assert.match(itil, /Q\.get\('itil_alta'\)==='1'/); assert.match(itil, /function openDeep\(\)/);
  assert.match(itil, /Nº de serie: '\+val\(lc\.serial\)/); assert.match(itil, /SIN='sin dato'/);
  assert.match(itil, /valid:\['En garantía','chip-ok'\]/); assert.match(itil, /none:\['Garantía: sin dato','chip-none'\]/);
  assert.doesNotMatch(itil, /innerHTML|outerHTML|insertAdjacentHTML/);
});
