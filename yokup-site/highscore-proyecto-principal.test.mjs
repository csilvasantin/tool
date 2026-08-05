import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// La columna PROYECTO del Highscore se derivaba SÓLO del trabajo reciente: un
// agente sin misión ni objetivo con proyecto en las últimas horas salía con «—»
// aunque el censo lo declare responsable de uno (Carlos, 2026-08-05: «¿por qué
// se ha perdido el proyecto principal?»). Ahora la cascada es:
//   1. lo que está haciendo AHORA (derivado del trabajo),
//   2. su proyecto principal del censo (projects + agents/primary_responsible),
//   3. suscositas.com — comodín que debería verse casi nunca; si sale, es que a
//      ese agente no se le ha asignado proyecto.
const source = await readFile(new URL("./highscore.html", import.meta.url), "utf8");
const identitySource = await readFile(new URL("./yk-agent-identity.js", import.meta.url), "utf8");
const identityContext = vm.createContext({});
vm.runInContext(identitySource, identityContext);
const identity = identityContext.ykAgentIdentity;

function corte(desde, hasta) {
  const i = source.indexOf(desde), j = source.indexOf(hasta, i);
  assert.ok(i >= 0 && j > i, `no se encuentra el bloque ${desde}`);
  return source.slice(i, j);
}

function censo(proyectos, id = identity) {
  const helpers = corte("function claveProyecto(", "function fichaProyecto(") +
    corte("function maquinaDelProyecto(", "var lista = Object.keys(por)");
  return new Function("datos", "id", "normaliza",
    `${helpers}\nreturn proyectoDeCenso;`)({ proyectos }, id, (v) => String(v == null ? "" : v).trim());
}

// Censo recortado del real (GET /projects) con los casos que importan.
const PROYECTOS = [
  { id:"generador-de-presites", name:"Generador de Presites", web:"www.admiranext.com/presites",
    status:"activo", machines:["admira-macmini"], agents:["oraculo"] },
  { id:"fleetcontrol", name:"FleetControl", web:"https://www.admira.live/control",
    status:"activo", machines:["MacBookProNegro14","admira-macmini"], agents:["Morfeo Negro"] },
  { id:"clearchannel-tv", name:"ClearChannel TV", web:"https://www.clearchannel.tv",
    status:"activo", machines:["admira-macmini","MacBookAirPlata"], agents:["OraculoMBAPlata"] },
  { id:"pixeria", name:"Pixeria", web:"https://www.pixeria.com",
    status:"activo", machines:["admira-macmini","MacBookAirRosa"], agents:["SmithMacMini","MorfeoMBARosa"] },
  { id:"webmaster-admiranext", name:"Webmaster AdmiraNeXT", web:"https://www.admiranext.com/webmaster",
    status:"activo", machines:["MacBookProNegro14","MacBookAirCrema"], agents:["Neo"] },
  { id:"viejo", name:"Proyecto Cerrado", web:"https://cerrado.example",
    status:"archivado", machines:["MacBookAirCrema"], agents:["Neo"] },
];

test("un alta CON apellido sólo vale para ESE equipo", () => {
  const resolver = censo(PROYECTOS);
  assert.equal(resolver({ base:"Oraculo", suffix:"MBAPlata" }).label, "clearchannel.tv");
  assert.equal(resolver({ base:"Oraculo", suffix:"MBP16" }), null,
    "OraculoMBP16 no puede heredar el proyecto de OraculoMBAPlata");
});

test("un alta SIN apellido exige que el proyecto liste además su máquina", () => {
  const resolver = censo(PROYECTOS);
  // «Neo» a secas + MacBookAirCrema está en machines → vale
  assert.equal(resolver({ base:"Neo", suffix:"MBACrema" }).label, "admiranext.com/webmaster");
  // «oraculo» a secas es del Mini: MBAPlata no puede llevarse los presites…
  assert.notEqual(resolver({ base:"Oraculo", suffix:"MBAPlata" }).label, "admiranext.com/presites");
  // …ni «Morfeo Negro» arrastrar a MorfeoMBARosa a fleetcontrol
  assert.equal(resolver({ base:"Morfeo", suffix:"MBARosa" }).label, "pixeria.com");
  assert.equal(resolver({ base:"Neo", suffix:"MBP16" }), null,
    "un Neo de otra máquina no entra por la puerta del alta sin apellido");
});

test("ser el responsable pesa más que constar como miembro", () => {
  const resolver = censo([
    { id:"miembro", name:"Sólo Miembro", web:"https://miembro.example", status:"activo",
      machines:["MacBookAirRosa"], agents:["MorfeoMBARosa"] },
    { id:"suyo", name:"Suyo", web:"https://suyo.example", status:"activo",
      machines:["MacBookAirRosa"], primary_responsible:"MorfeoMBARosa", agents:[] },
  ]);
  assert.equal(resolver({ base:"Morfeo", suffix:"MBARosa" }).label, "suyo.example");
});

test("los proyectos archivados no cuentan", () => {
  const resolver = censo(PROYECTOS.filter((p) => p.id === "viejo"));
  assert.equal(resolver({ base:"Neo", suffix:"MBACrema" }), null);
});

test("la cascada trabajo → principal → suscositas está en el código", () => {
  assert.match(source, /if \(f\.proyecto\) \{\s*f\.proyectoOrigen = "trabajo";/);
  assert.match(source, /f\.proyectoOrigen = "principal"/);
  assert.match(source, /f\.proyecto = "suscositas\.com"; f\.proyectoUrl = "https:\/\/www\.suscositas\.com"/);
  assert.match(source, /f\.proyectoOrigen = "defecto"/);
});

test("el chip dice de dónde sale el proyecto y marca en ámbar el que falta", () => {
  const html = new Function("esc", `${corte("var TITULO_PROYECTO", "\n\n")}\n${corte("function proyectoHtml(", "\n\n")}\nreturn proyectoHtml;`)(
    (v) => String(v == null ? "" : v).replaceAll("&", "&amp;").replaceAll('"', "&quot;"));
  assert.match(html({ proyecto:"xpaceos.com", proyectoUrl:"https://www.xpaceos.com", proyectoOrigen:"trabajo" }),
    /class="project-chip"[\s\S]*Proyecto en curso/);
  assert.match(html({ proyecto:"clearchannel.tv", proyectoUrl:"https://www.clearchannel.tv", proyectoOrigen:"principal" }),
    /class="project-chip principal"[\s\S]*Proyecto principal/);
  const falta = html({ proyecto:"suscositas.com", proyectoUrl:"https://www.suscositas.com", proyectoOrigen:"defecto" });
  assert.match(falta, /class="project-chip defecto"/);
  assert.match(falta, /Sin proyecto asignado en el censo/);
  assert.match(source, /\.project-chip\.defecto\{color:#ffb454/);
});
