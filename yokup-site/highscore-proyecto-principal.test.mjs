import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// La columna PROYECTO del Highscore se derivaba SÓLO del trabajo reciente: un
// agente sin misión ni objetivo con proyecto en las últimas horas salía con «—»
// aunque el censo lo declare responsable de uno (Carlos, 2026-08-05: «¿por qué
// se ha perdido el proyecto principal?»). Ahora la cascada es:
//   1. el proyecto principal DECLARADO para hoy — la asignación de Carlos,
//   2. lo que está haciendo ahora (derivado del trabajo), si no hay declaración,
//   3. su proyecto estructural del censo (projects + agents/primary_responsible),
//   4. Galaxia Admira — default de la flota cuando no hay proyecto concreto.
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

function diario(proyectos, declaraciones, id = identity) {
  const helpers = corte("function claveProyecto(", "function fichaProyecto(") +
    corte("function proyectoDeclaradoHoy(", "var lista = Object.keys(por)");
  return new Function("datos", "id", "normaliza",
    `${helpers}\nreturn proyectoDeclaradoHoy;`)({ proyectos, declaracionesPrincipales:declaraciones }, id,
      (v) => String(v == null ? "" : v).trim());
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

test("la declaración diaria exacta gana al proyecto estructural del censo", () => {
  const resolver = diario(PROYECTOS, [{
    day:"2026-08-10", agent_key:"trinitymbp14", agent:"TrinityMBP14",
    project_id:"admira-academy", project_name:"Admira Academy",
    project_web:"https://admira.academy", project_status:"activo"
  }]);
  assert.equal(resolver({ base:"Trinity", suffix:"MBP14" }).label, "admira.academy");
  assert.equal(resolver({ base:"Trinity", suffix:"MBP16" }), null,
    "la declaración de TrinityMBP14 no se hereda en otra máquina");
});

test("la cascada declarado → trabajo → censo → Galaxia Admira está en el código", () => {
  assert.match(source, /if \(f\.proyecto\) \{\s*f\.proyectoOrigen = "trabajo";/);
  assert.match(source, /f\.proyectoOrigen = "declarado"/);
  assert.match(source, /f\.proyectoOrigen = "principal"/);
  assert.match(source, /f\.proyecto = "Galaxia Admira"; f\.proyectoUrl = "https:\/\/www\.admiranext\.com"/);
  assert.match(source, /f\.proyectoOrigen = "defecto"/);
  assert.match(source, /f\.proyectoId = "galaxia-admira"/);
  assert.match(source, /principal_declarations \|\| \[\]/);
});

test("una tarea activa gana a un heartbeat posterior con otro proyecto", () => {
  assert.match(source, /prioridad < anterior/);
  assert.match(source, /marcaProyecto\(f, proyecto, comoMs\(at\), contextoProyecto \|\| detalle, PRIORIDAD_ACTIVIDAD\[tipo\]\)/);
  assert.match(source, /marcaProyecto\(f, p\.project, t \* 1000, p\.focus, 0\)/);
});

test("el chip dice de dónde sale el proyecto y marca en ámbar el que falta", () => {
  const html = new Function("esc", `${corte("var TITULO_PROYECTO", "\n\n")}\n${corte("function proyectoHtml(", "\n\n")}\nreturn proyectoHtml;`)(
    (v) => String(v == null ? "" : v).replaceAll("&", "&amp;").replaceAll('"', "&quot;"));
  assert.match(html({ proyecto:"xpaceos.com", proyectoUrl:"https://www.xpaceos.com", proyectoOrigen:"trabajo" }),
    /class="project-chip"[\s\S]*Proyecto en curso/);
  assert.match(html({ proyecto:"clearchannel.tv", proyectoUrl:"https://www.clearchannel.tv", proyectoOrigen:"principal" }),
    /class="project-chip principal"[\s\S]*Proyecto principal/);
  assert.match(html({ proyecto:"admira.academy", proyectoUrl:"https://admira.academy", proyectoOrigen:"declarado" }),
    /class="project-chip principal"[\s\S]*Proyecto principal de hoy/);
  const falta = html({ proyecto:"Galaxia Admira", proyectoUrl:"https://www.admiranext.com", proyectoOrigen:"defecto" });
  assert.match(falta, /class="project-chip defecto"/);
  assert.match(falta, /Sin proyecto concreto del día · Galaxia Admira/);
  assert.match(source, /\.project-chip\.defecto\{color:#ffb454/);
});

// ── la asignación manda sobre la faena ──────────────────────────────────────
// El 10 de agosto de 2026 Carlos tuvo que decirlo DOS VECES el mismo día: «no
// identificas bien el proyecto que te he dicho al que nos vamos a dedicar hoy,
// que es admira.live, aparece admiranext.com». No era un dato perdido: la
// columna daba prioridad al trabajo reciente, y ese día el agente asignado a
// admira.live tocó de paso admiranext.com. El panel contaba en qué tecleaba en
// vez de a qué se le había mandado.
test("lo que Carlos declara para hoy gana al trabajo de hoy", () => {
  const fuente = source;
  const i = fuente.indexOf("LA ASIGNACIÓN DE CARLOS MANDA SOBRE LA FAENA");
  assert.ok(i > 0, "debe quedar escrito por qué la declaración manda");
  const bloque = fuente.slice(i, i + 2000);
  // La declaración se consulta ANTES de aceptar el proyecto derivado del trabajo.
  const posDeclarado = bloque.indexOf("proyectoDeclaradoHoy(f)");
  const posTrabajo = bloque.indexOf('f.proyectoOrigen = "trabajo"');
  assert.ok(posDeclarado >= 0 && posTrabajo > posDeclarado,
    "la declaración diaria debe evaluarse antes que el proyecto del trabajo");
});

test("la faena distinta no se borra: viaja como detalle", () => {
  const i = source.indexOf("LA ASIGNACIÓN DE CARLOS MANDA SOBRE LA FAENA");
  const bloque = source.slice(i, i + 2000);
  assert.match(bloque, /proyectoFaena = f\.proyecto/,
    "si el trabajo apunta a otro proyecto debe conservarse, no perderse");
  assert.match(source, /hoy además ha tocado/,
    "la pastilla debe poder decir qué más se ha tocado hoy");
});

test("sin declaración diaria sigue mandando el trabajo, y luego el censo", () => {
  const i = source.indexOf("LA ASIGNACIÓN DE CARLOS MANDA SOBRE LA FAENA");
  const bloque = source.slice(i, i + 2200);
  assert.match(bloque, /\} else if \(f\.proyecto\) \{/, "el trabajo sigue siendo el segundo criterio");
  assert.match(bloque, /proyectoDeCenso\(f\)/, "el censo sigue siendo el respaldo");
  assert.match(bloque, /Galaxia Admira/, "y el default de la flota sigue al final");
});
