import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { reportAgentFamily } from "../src/agent-identity.js";

const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const fn = source.slice(source.indexOf("async function highscoreFleetHistory"),
  source.indexOf('__name(highscoreFleetHistory, "highscoreFleetHistory");'));

// Carlos, 15-ago-2026: al pulsar el sumador del podio hay que ver los últimos 30
// días de TODA la flota, para saber si el equipo rinde más cada día. Hasta hoy
// esa pregunta no tenía respuesta en ninguna pantalla: /highscore/history exigía
// un agente y devolvía 400 sin él.
test("el histórico global sale de la MISMA agregación que el de un agente", () => {
  // Si global y por-agente sumaran por vías distintas dirían cosas diferentes
  // del mismo día, y una curva que se contradice con la tabla no sirve para
  // decidir nada.
  assert.match(fn, /highscoreDailyRows\(env, \(\) => true, ahora\)/,
    "el global es el mismo recuento sin filtro de familia");
  assert.match(fn, /highscoreHistoryPayload\(periods, allDays/,
    "y la misma forma de payload");
  assert.match(source, /async function highscoreDailyRows\(env, pertenece, ahora\)/,
    "la agregación tiene que aceptar el filtro inyectado");
});

test("declara el primer día REAL, para que la curva no dibuje un progreso inexistente", () => {
  // Los días anteriores a que esto existiera salen a cero como cualquier otro.
  // Una gráfica que arranca en cero y sube pinta un mérito que nadie hizo: es
  // el sistema naciendo. Quien la pinte necesita poder sombrear esa zona.
  assert.match(fn, /payload\.first_day = allDays\.length \? allDays\[0\]\.day : null/);
});

test("la tendencia compara 7 contra 7 y admite no tener base", () => {
  assert.match(fn, /const reciente = tramo\(dias\.length - 7, dias\.length\)/);
  assert.match(fn, /const previo = tramo\(dias\.length - 14, dias\.length - 7\)/);
  // Un +300% calculado sobre dos días sueltos no es tendencia, es ruido con
  // signo. Sin base suficiente el porcentaje va a null y la dirección lo dice.
  assert.match(fn, /previo\.con_dato >= 3 && reciente\.con_dato >= 3 && previo\.points > 0/);
  assert.match(fn, /variacion_pct: comparable \? .* : null/);
  assert.match(fn, /direccion: !comparable \? "sin-base"/);
  // Cada tramo declara cuántos de sus días tienen dato: sin eso, quien lee el
  // porcentaje no puede saber sobre cuánto se calculó.
  assert.match(fn, /con_dato: conDato/);
});

test("scope=global no exige agente y no abre una segunda ruta para el mismo dato", () => {
  const ruta = source.slice(source.indexOf('url.pathname === "/highscore/history"'));
  const bloque = ruta.slice(0, ruta.indexOf('if (url.pathname === "/highscore/active-work"'));
  // El guard de scope tiene que ir ANTES del 400 por agente ausente, o el global
  // nunca se alcanza.
  assert.ok(bloque.indexOf('scope") || "").toLowerCase() === "global"') <
    bloque.indexOf('error:"agent requerido"'),
    "scope=global se resuelve antes de exigir agente");
  assert.doesNotMatch(source, /"\/highscore\/history\/global"/,
    "es el mismo dato con otro alcance: dos rutas acabarían en dos recuentos");
});

// Carlos, 15-ago-2026: al seleccionar una barra hay que ver debajo todas las
// misiones de ese periodo y de quién son.
const detalle = source.slice(source.indexOf("async function highscoreFleetMissions"),
  source.indexOf('__name(highscoreFleetMissions, "highscoreFleetMissions");'));

test("el detalle lista por el MISMO scored_at que puntúa la barra", () => {
  // Listar por created_at o resolved_at —que es lo cómodo— haría que la lista y
  // la barra hablaran de conjuntos distintos: el detalle contradiría al total
  // que dice explicar.
  assert.match(detalle, /\$\{HIGHSCORE_MISSION_STARTED_SQL\} scored_at/);
  assert.match(detalle, /AND scored_at>=\? AND scored_at<\?/);
  assert.match(detalle, /ORDER BY scored_at ASC/,
    "día, semana y mes deben leerse desde la primera hora hasta la última");
  // Y el mismo filtro de alcance y de estados que la agregación.
  assert.match(detalle, /\$\{AGENT_SOURCE_SQL_T\}/);
  assert.match(detalle, /status IN \('in_progress','resolved'\) OR \(status='open' AND con_plan=1\)/);
});

test("la jornada usa inicio y cierre factuales, no updated_at", () => {
  const jornada = source.slice(source.indexOf("function highscoreFleetWorkday"),
    source.indexOf('__name(highscoreFleetWorkday, "highscoreFleetWorkday");'));
  assert.match(detalle, /\$\{HIGHSCORE_WORK_STARTED_SQL\} work_started_at/);
  assert.match(detalle, /t\.resolved_at finished_at/);
  assert.match(jornada, /row\.work_started_at \|\| row\.scored_at/);
  assert.match(jornada, /row\.finished_at/);
  assert.doesNotMatch(jornada, /updated_at/,
    "una sincronización tardía no puede convertir al agente en Night Owl");
  assert.match(jornada, /early_bird/);
  assert.match(jornada, /night_owl/);
  assert.match(jornada, /ongoing_missions:ongoing/,
    "si queda trabajo abierto, la API no puede fingir una hora de salida");
});

test("Early Bird es el primer inicio y Night Owl el último cierre aunque lleguen desordenados", () => {
  const millis = source.slice(source.indexOf("function highscoreActiveWorkMillis"),
    source.indexOf('__name(highscoreActiveWorkMillis, "highscoreActiveWorkMillis");') +
      '__name(highscoreActiveWorkMillis, "highscoreActiveWorkMillis");'.length);
  const jornada = source.slice(source.indexOf("function highscoreFleetWorkday"),
    source.indexOf('__name(highscoreFleetWorkday, "highscoreFleetWorkday");') +
      '__name(highscoreFleetWorkday, "highscoreFleetWorkday");'.length);
  const context = vm.createContext({ reportAgentFamily, Number, String, Array,
    __name:(value) => value });
  vm.runInContext(`${millis}\n${jornada}`, context);
  const base = 1_786_800_000_000;
  const result = JSON.parse(JSON.stringify(context.highscoreFleetWorkday([
    {id:"M-TARDE",assignee:"TrinityMBP16",loc:"MacBookPro16",work_started_at:base + 30_000,finished_at:base + 90_000},
    {id:"M-TEMPRANO",assignee:"NeoMBP16",loc:"MacBookPro16",work_started_at:base + 10_000,finished_at:null},
    {id:"M-NOCHE",assignee:"MorfeoMacMini",loc:"MacMini",work_started_at:base + 20_000,finished_at:base + 120_000},
  ])));
  assert.equal(result.early_bird.agent, "NeoMBP16");
  assert.equal(result.early_bird.at, base + 10_000);
  assert.equal(result.night_owl.agent, "MorfeoMacMini");
  assert.equal(result.night_owl.at, base + 120_000);
  assert.equal(result.ongoing_missions, 1);
  assert.equal(result.state, "open");
});

test("el rango va en días de Madrid, no en UTC", () => {
  // Un cierre de las 00:30 pertenece al día que la persona vivió.
  assert.match(detalle, /missionDayRange\(desdeDia\), hasta = missionDayRange\(hastaDia \|\| desdeDia\)/);
  assert.match(detalle, /\.bind\(desde\.start, hasta\.end\)/);
});

test("un rango inválido se rechaza antes de consultar", () => {
  assert.match(detalle, /if \(!desde \|\| !hasta \|\| hasta\.end < desde\.start\)/);
  assert.match(detalle, /rango inválido/);
});

test("cada misión sale con su autor canónico y su referencia legible", () => {
  // El assignee crudo puede venir con apellido de máquina o sin él; la familia
  // es lo que se enseña en el resto de la plataforma.
  assert.match(detalle, /reportAgentFamily\(r\.assignee, r\.loc \|\| ""\)/);
  assert.match(detalle, /attachDisplayRefs\(env, "mission", filas/);
  assert.match(detalle, /workday: highscoreFleetWorkday\(filas\)/);
  assert.match(detalle, /started_at: highscoreActiveWorkMillis/);
  assert.match(detalle, /finished_at: highscoreActiveWorkMillis/);
});

test("el detalle comparte ruta con el agregado y no abre una tercera", () => {
  assert.match(source, /const desde = String\(url\.searchParams\.get\("desde"\) \|\| ""\)\.trim\(\)/);
  assert.doesNotMatch(source, /"\/highscore\/day"/);
});
