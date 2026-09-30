// FLT-101292 · Carlos: en las tarjetas de /incidencias salían «Javier M.SINMAQ»,
// «Laura R.SINMAQ», «Construcciones OriaSINMAQ» o «SINMAQ» a secas. Nacía en
// ykAgentIdentity.display(), que marca el hueco de máquina con el sufijo técnico
// SINMAQ (útil como clave de censo en highscore/dashboard), y whoHtml lo pintaba
// tal cual como rótulo. Ahora las pantallas usan ykAgentIdentity.label():
//   · con máquina  → identidad con apellido (OraculoMacMini);
//   · sin máquina  → sólo la persona («Javier M.», «Neo»);
//   · sin nadie    → «Sin asignar».
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const identSrc = await readFile(new URL("./yk-agent-identity.js", import.meta.url), "utf8");
const misSrc = await readFile(new URL("./yk-misiones.js", import.meta.url), "utf8");
const decSrc = await readFile(new URL("./yk-decisions.js", import.meta.url), "utf8");
const equipo = await readFile(new URL("./equipo.html", import.meta.url), "utf8");

function load({withIdentity = true} = {}) {
  const noop = () => {};
  const windowObj = {};
  const ctx = vm.createContext({
    window: windowObj, document: {addEventListener: noop, querySelector: () => null},
    localStorage: {getItem: () => null, setItem: noop, removeItem: noop},
    Date, Math, JSON, Promise, RegExp, Object, Array, String, Number, Boolean,
    setTimeout, clearTimeout, console
  });
  if (withIdentity) vm.runInContext(identSrc, ctx);
  vm.runInContext(misSrc, ctx);
  return windowObj;
}
const win = load();
const id = win.ykAgentIdentity;
const rotulo = (html) => (String(html).match(/<span>(?:\S+ )?([^<]*)<\/span><small/) || [, ""])[1];

test("label · CON máquina conserva la identidad con apellido (regla 02)", () => {
  assert.equal(id.label("Oraculo", "Mac Mini"), "OraculoMacMini");
  assert.equal(id.label("OraculoMacMini", ""), "OraculoMacMini", "el apellido ya viaja en el nombre");
  assert.equal(id.label("Oraculo", "Mac Mini", "sub"), "SubOraculoMacMini");
  assert.equal(id.label("Morfeo", "MacBook Pro 16"), "MorfeoMBP16");
});

test("label · SIN máquina muestra sólo la persona, nunca SINMAQ", () => {
  assert.equal(id.label("Javier M.", ""), "Javier M.");
  assert.equal(id.label("Laura R.", ""), "Laura R.");
  assert.equal(id.label("Construcciones Oria", ""), "Construcciones Oria");
  assert.equal(id.label("Neo", ""), "Neo");
  assert.equal(id.label("Javier M.", "equipo-desconocido"), "Javier M.");
  // Datos heredados que ya traían el marcador pegado.
  assert.equal(id.label("Javier M.SINMAQ", ""), "Javier M.");
  assert.equal(id.label("NeoSINMAQ", ""), "Neo");
});

test("label · SIN responsable ⇒ «Sin asignar»", () => {
  for (const vacio of ["", "   ", null, undefined, "SINMAQ"]) assert.equal(id.label(vacio, ""), "Sin asignar");
});

test("display() no cambia: SINMAQ sigue siendo la clave honesta del censo", () => {
  assert.equal(id.display("Oraculo", ""), "OraculoSINMAQ");
  assert.equal(id.display("Oraculo", "Mac Mini"), "OraculoMacMini");
});

test("whoHtml (tarjetas de /incidencias y /misiones) no pinta SINMAQ", () => {
  const YK = win.YkMisiones;
  const casos = [
    ["Javier M.", "", "Javier M."],
    ["Laura R.", "", "Laura R."],
    ["Construcciones Oria", "", "Construcciones Oria"],
    ["", "", "Sin asignar"],
    ["Oraculo", "Mac Mini", "OraculoMacMini"]
  ];
  for (const [nombre, maquina, esperado] of casos) {
    const html = YK.whoHtml(nombre, maquina, "", null, null);
    assert.doesNotMatch(html, /SINMAQ/, nombre || "(vacío)");
    assert.equal(rotulo(html), esperado, nombre || "(vacío)");
  }
});

test("whoHtml sin yk-agent-identity cargado también evita SINMAQ y el hueco vacío", () => {
  const YK = load({withIdentity: false}).YkMisiones;
  assert.equal(rotulo(YK.whoHtml("", "", "", null, null)), "Sin asignar");
  assert.equal(rotulo(YK.whoHtml("Laura R.SINMAQ", "", "", null, null)), "Laura R.");
});

test("decisiones y equipo rotulan con label() (con respaldo a display())", () => {
  assert.match(decSrc, /ykAgentIdentity\.label\s*\?\s*ykAgentIdentity\.label\(n, machine\)/);
  assert.match(equipo, /id\.label\?id\.label\(nombre,maquina\)/);
});
