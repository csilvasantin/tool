import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { coachLessonForSlot } from "./src/academy-coach.js";

// FLT-1333 (Carlos, 2026-08-08): «lanzar cada hora en punto una ventana de formación
// para que se active una cápsula de conocimiento en admira.academy».
const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

function fuente(nombre){
  const i = source.indexOf("async function " + nombre + "(");
  assert.notEqual(i, -1, "falta " + nombre);
  const j = source.indexOf("\n}\n", i);
  return source.slice(i, j);
}

test("una hora, una cápsula: la clave primaria es la garantía, no un candado", () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS academy_capsulas \(hour_start INTEGER PRIMARY KEY/);
  const tick = fuente("runAcademyCapsuleTick");
  assert.match(tick, /Math\.floor\(ahora \/ ACADEMY_HORA_MS\) \* ACADEMY_HORA_MS/,
    "la hora se alinea en punto, no cuenta 3600 s desde la última");
  assert.match(tick, /SELECT \* FROM academy_capsulas WHERE hour_start=\?/);
  assert.match(tick, /if \(ya\) return \{ ok:true, nueva:false/, "reintentar la misma hora no crea otra");
  assert.match(tick, /INSERT OR IGNORE INTO academy_capsulas/);
  assert.match(source, /var ACADEMY_HORA_MS = 60 \* 60 \* 1000/);
});

test("la silla sale de la hora, sin estado que llevar", () => {
  // Nació rotando las ocho seguidas; desde FLT-1338 rota por temática (ver abajo).
  const tick = fuente("runAcademyCapsuleTick");
  assert.match(tick, /const horas = Math\.floor\(hourStart \/ COACH_HOUR\)/);
  assert.match(source, /const COUNCIL_ORDER = \["ceo", "cto", "coo", "cfo", "cco", "cdo", "cxo", "cso"\]/);
});

test("la cápsula se ELIGE de lo que existe, y #formacion manda", () => {
  const tick = fuente("runAcademyCapsuleTick");
  assert.match(tick, /seatKnowledgeFrom\(await stockIndex\(\), seat, 0\)/, "reutiliza el conocimiento del Consejo");
  assert.match(tick, /piezas\.filter\(\(p\) => p\.origin === "formado"\)/);
  assert.match(tick, /const pool = formacion\.length \? formacion : piezas/,
    "lo que le trajeron para formarse va primero; si no hay, lo que tenga");
});

test("pixeria caída no deja la hora en blanco: cae a una lección de la Academia", () => {
  const tick = fuente("runAcademyCapsuleTick");
  assert.match(tick, /catch \(e\) \{ \/\* pixeria caida no deja la hora sin capsula/);
  assert.match(tick, /if \(!elegida\)/);
  assert.match(tick, /source:"academia\/leccion"/);
  assert.match(source, /var ACADEMY_LECCIONES = \[/);
  for (const id of ["identity","ecosystem","mission","closure"]) assert.match(source, new RegExp('id:"' + id + '"'));
});

test("la Academia puede leerla sin sesión, y preguntar abre la hora", () => {
  assert.match(source, /url\.pathname === "\/academy\/capsula" && req\.method === "GET"/);
  const i = source.indexOf('url.pathname === "/academy/capsula"');
  const bloque = source.slice(i, i + 700);
  assert.match(bloque, /const r = await runAcademyCapsuleTick\(env\)/,
    "si nadie pasó por el worker a las HH:00, la visita de la Academia abre la hora");
  assert.match(bloque, /historia/);
  // Pública: no puede estar en el set de rutas con sesión de Google.
  const protegidas = source.slice(source.indexOf("var PROTECTED"), source.indexOf("var PROTECTED") + 900);
  assert.doesNotMatch(protegidas, /academy/);
});

test("la rutina del reloj la incluye, con su propio latido", () => {
  assert.match(source, /await step\("academyCapsule", \(\) => runAcademyCapsuleTick\(env\)\)/);
});

// FLT-1338 (Carlos, 2026-08-09): «las ventanas de formación tienen que ser de las 3
// temáticas del coach de admira.academy —tecnología, creatividad y negocio— una cada
// hora y vuelta a empezar, con lo que saldrán 24 ventanas de formación al día, 8 de
// cada tipología».
function temasApi(){
  const i = source.indexOf("var ACADEMY_TEMAS");
  const j = source.indexOf("__name(academyTemaDeFranja");
  assert.ok(i >= 0 && j > i, "falta el bloque de temáticas");
  return new Function("coachLessonForSlot", source.slice(i, j) + "\nreturn { ACADEMY_TEMAS, academyTemaDeFranja };")(coachLessonForSlot);
}

test("tres temáticas, una por hora: 24 al día y 8 de cada, sin llevar cuentas", () => {
  const { ACADEMY_TEMAS, academyTemaDeFranja } = temasApi();
  assert.deepEqual(ACADEMY_TEMAS.map(t => t.id), ["tecnologia", "creatividad", "negocio"]);
  const base = Math.floor(Date.UTC(2026, 7, 9, 0, 0, 0) / 3600000);
  const cuenta = {};
  for (let h = 0; h < 24; h++) { const { tema } = academyTemaDeFranja(base + h); cuenta[tema.id] = (cuenta[tema.id] || 0) + 1; }
  assert.deepEqual(cuenta, { tecnologia:8, creatividad:8, negocio:8 });
  // El día siguiente arranca donde toca, no se reinicia a mano.
  assert.equal(academyTemaDeFranja(base + 24).tema.id, academyTemaDeFranja(base).tema.id);
});

// Reutilizar, no duplicar: la rueda de temáticas ya la tenía el Coach de la Academia
// (src/academy-coach.js, del equipo de Admira). Si la cápsula llevara la suya, un día
// dejarían de decir lo mismo en la misma franja.
test("la temática y la lección salen del Coach, no de una copia", () => {
  assert.match(source, /import \{ validateCoachCompletion, coachLessonForSlot, COACH_HOUR \} from "\.\/academy-coach\.js"/);
  const { academyTemaDeFranja } = temasApi();
  for (const slot of [0, 1, 2, 3, 100, 1234567]) {
    const esperado = coachLessonForSlot(slot);
    const salida = academyTemaDeFranja(slot);
    assert.equal(salida.tema.id, esperado.dimension, "la temática es la del Coach en la franja " + slot);
    assert.equal(salida.lessonId, esperado.lessonId, "y la lección también");
  }
  const tick = fuente("runAcademyCapsuleTick");
  assert.match(tick, /Math\.floor\(hourStart \/ COACH_HOUR\)/, "misma franja horaria que el Coach, sin conversiones");
});

test("las ocho sillas se reparten entre las tres temáticas, sin repetirse ni faltar", () => {
  const { ACADEMY_TEMAS } = temasApi();
  const todas = ACADEMY_TEMAS.flatMap(t => t.seats);
  assert.equal(todas.length, 8, "las ocho sillas del Consejo, ni una más ni una menos");
  assert.equal(new Set(todas).size, 8, "ninguna silla en dos temáticas");
  for (const seat of ["ceo","cto","coo","cfo","cco","cdo","cxo","cso"]) assert.ok(todas.includes(seat), "falta " + seat);
  // El reparto sale del ÁREA declarada de cada silla, no de una opinión.
  assert.deepEqual(ACADEMY_TEMAS.find(t => t.id === "tecnologia").seats, ["cto","coo"]);
  assert.deepEqual(ACADEMY_TEMAS.find(t => t.id === "negocio").seats, ["ceo","cfo"]);
});

test("la hora manda la temática y la temática manda la silla", () => {
  const tick = fuente("runAcademyCapsuleTick");
  assert.match(tick, /const \{ tema, lessonId \} = academyTemaDeFranja\(horas\)/);
  assert.match(tick, /tema\.seats\[Math\.floor\(horas \/ ACADEMY_TEMAS\.length\) % tema\.seats\.length\]/,
    "dentro de la temática la silla también rota: no le toca siempre al mismo");
  assert.match(tick, /INSERT OR IGNORE INTO academy_capsulas \(hour_start,seat,tema,/);
  assert.match(source, /ALTER TABLE academy_capsulas ADD COLUMN tema TEXT/, "aditiva: las cápsulas de ayer no tenían temática");
});

// La ventana de formación: puntúa, rota entre los agentes de la Academia y NUNCA
// materializa misiones. Carlos eligió el reparto por turnos y no al responsable:
// 24 ventanas al día a una sola cuenta serían 192 puntos que no ha trabajado nadie.
test("la ventana rota entre los agentes declarados de la Academia, uno cada 4 horas", () => {
  const i = source.indexOf("var ACADEMY_TURNOS");
  const j = source.indexOf("var ACADEMY_DECISION_PARENT");
  const { ACADEMY_TURNOS } = new Function(source.slice(i, j) + "\nreturn { ACADEMY_TURNOS };")();
  assert.equal(ACADEMY_TURNOS.length, 4);
  assert.deepEqual(ACADEMY_TURNOS.map(t => t.agent), ["MorfeoMBA16","TrinityMBA16","NeoMBP14","TrinityMBP14"]);
  // Cada agente con SU máquina: sin identidad canónica el Highscore descarta la fila.
  for (const t of ACADEMY_TURNOS) assert.ok(t.machine, t.agent + " sin máquina");
  const abre = fuente("abreVentanaFormacion");
  assert.match(abre, /ACADEMY_TURNOS\[Math\.floor\(hourStart \/ COACH_HOUR\) % ACADEMY_TURNOS\.length\]/);
  assert.match(abre, /resolveDecisionIdentity\(turno\.agent, turno\.machine\)/);
  assert.match(abre, /if \(!identidad\.ok\) return \{ ok:false/, "sin identidad canónica no se abre: puntuaría a nadie");
});

test("una sola opción: la ventana no puede materializar misiones fantasma", () => {
  const abre = fuente("abreVentanaFormacion");
  assert.match(abre, /const opciones = \["Atender la cápsula de "/);
  // La garantía es la FORMA, no una bandera: ensureMissionBatchFromDecision corta si
  // las opciones no son de misión (inicial exige 5; continuación, 2 o 3 con salida).
  assert.match(abre, /JSON\.stringify\(opciones\)/);
  assert.doesNotMatch(abre, /volver atr/i, "ni de lejos la forma de una ventana de misión");
  assert.match(source, /function isInitialMissionDecision[\s\S]{0,200}options\.length === 5/);
});

test("no le quita a nadie su hueco: fuera del cupo horario y del censo de turnos", () => {
  const abre = fuente("abreVentanaFormacion");
  assert.match(source, /var ACADEMY_DECISION_PARENT = "FORMACION"/);
  assert.match(abre, /ACADEMY_DECISION_PARENT\)\.run\(\)/);
  // El cupo y el censo filtran (parent_decision IS NULL OR parent_decision=''), así
  // que con el marcador puesto esta ventana no entra en esas cuentas.
  assert.match(source, /parent_decision IS NULL OR parent_decision=''/);
});

test("si la ventana falla, la cápsula sigue en pie", () => {
  const tick = fuente("runAcademyCapsuleTick");
  assert.match(tick, /try \{ ventana = await abreVentanaFormacion\(env, \{ hourStart, tema, seat, capsula:elegida \}\); \}/);
  assert.match(tick, /catch \(e\) \{ ventana = \{ ok:false/);
  assert.match(tick, /UPDATE academy_capsulas SET agent=\?, decision_id=\? WHERE hour_start=\?/);
});
