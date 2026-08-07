import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Carlos, 2026-08-07: «si hay 4 agentes que se dispare uno cada 15 minutos, si
// hay 6 uno cada 10». Con el reloj movil a secas cada agente abria cuando le
// tocaba a el y la flota se apelotonaba: el 07-08 seis ventanas cayeron entre
// las 10:45 y las 10:59 y luego cincuenta minutos de silencio.
const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

function cuerpo(nombre) {
  const i = source.indexOf(`async function ${nombre}(`);
  assert.notEqual(i, -1, `falta ${nombre}`);
  const llave = source.indexOf("{", i);
  let nivel = 0, comilla = "", esc = false;
  for (let k = llave; k < source.length; k += 1) {
    const c = source[k];
    if (comilla) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === comilla) comilla = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { comilla = c; continue; }
    if (c === "{") nivel += 1;
    else if (c === "}" && --nivel === 0) return source.slice(i, k + 1);
  }
  throw new Error(`${nombre} incompleta`);
}

const HORA = 3600000;

// Se ejecuta la funcion real contra un D1 de mentira que devuelve el censo dado.
function turnoCon(agentes) {
  const env = {
    DB: {
      prepare() {
        return { bind() { return this; },
          all: async () => ({ results: agentes.map((a) => ({ agent: a })) }) };
      },
    },
  };
  const fn = new Function("HOURLY_WINDOW_MS", "__name",
    `${cuerpo("ventanaTurno")}\nreturn ventanaTurno;`)(HORA, () => {});
  return (agente, now) => fn(env, agente, now);
}

test("con 4 agentes la franja es de 15 minutos; con 6, de 10", async () => {
  const cuatro = turnoCon(["A", "B", "C", "D"]);
  const seis = turnoCon(["A", "B", "C", "D", "E", "F"]);
  assert.equal((await cuatro("A", 0)).paso, 15 * 60000);
  assert.equal((await seis("A", 0)).paso, 10 * 60000);
});

test("cada agente cae en una franja distinta, en orden canonico", async () => {
  const t = turnoCon(["Zeta", "Alfa", "Mika"]);
  const orden = [];
  for (const a of ["Alfa", "Mika", "Zeta"]) orden.push((await t(a, 0)).offset);
  assert.deepEqual(orden, [0, 20 * 60000, 40 * 60000], "ordenados por nombre, 20 min de paso");
  // ninguno comparte franja
  assert.equal(new Set(orden).size, 3);
});

test("el que pregunta SIEMPRE entra en el censo, aunque sea nuevo", async () => {
  const t = turnoCon(["A", "B"]);
  const nuevo = await t("Nuevo", 0);
  assert.equal(nuevo.n, 3, "A, B y el nuevo");
  assert.ok(nuevo.censo.includes("Nuevo"));
});

test("enTurno sólo dentro de su franja", async () => {
  const t = turnoCon(["A", "B", "C", "D"]);   // 15 min cada uno
  const b = (m) => t("B", m * 60000);         // B es el segundo: 15..30
  assert.equal((await b(14)).enTurno, false);
  assert.equal((await b(15)).enTurno, true);
  assert.equal((await b(29)).enTurno, true);
  assert.equal((await b(30)).enTurno, false);
});

test("la proxima franja se calcula sin saltarse la de este ciclo", async () => {
  const t = turnoCon(["A", "B", "C", "D"]);
  // antes de su franja → la de este ciclo
  assert.equal((await t("B", 5 * 60000)).proximo, 15 * 60000);
  // dentro → ahora mismo
  assert.equal((await t("B", 20 * 60000)).proximo, 20 * 60000);
  // pasada → la del ciclo siguiente
  assert.equal((await t("B", 40 * 60000)).proximo, HORA + 15 * 60000);
});

test("la franja nunca baja de un minuto por muchos agentes que haya", async () => {
  const muchos = turnoCon(Array.from({ length: 500 }, (_, i) => "A" + i));
  assert.ok((await muchos("A0", 0)).paso >= 60000);
});

// ── enganche con la guarda ────────────────────────────────────────────────

test("el turno gobierna las AUTOMATICAS y nunca a una persona", () => {
  assert.match(source, /if \(!manual\) \{\s*const turno = await ventanaTurno\(env, agent, now\);/);
  assert.match(source, /error: "fuera_de_turno"/);
  assert.match(source, /nextAt: turno\.proximo/);
  // el cupo sigue evaluandose ANTES: hay que cumplir las dos cosas
  assert.ok(source.indexOf('error: "hourly_limit"') < source.indexOf('error: "fuera_de_turno"'));
});

test("/fleet/turnos es publico y dice cuanto falta a cada uno", () => {
  assert.match(source, /url\.pathname === "\/fleet\/turnos"/);
  const protegidas = source.slice(source.indexOf("var PROTECTED"), source.indexOf("\n", source.indexOf("var PROTECTED")));
  assert.doesNotMatch(protegidas, /"\/fleet\/turnos"/);
  assert.match(source, /faltanMs: Math\.max\(0, proxima - now\)/);
  // manda la MAS TARDIA de las dos condiciones: su hora y su turno
  assert.match(source, /const proxima = Math\.max\(t\.proximo, desdeUltima\)/);
  assert.match(source, /salida\.sort\(\(x, y\) => x\.proxima - y\.proxima\)/);
});

// ── la interfaz: cuenta atras en el detalle del agente ────────────────────
test("el detalle del Highscore dice cuanto falta para su proxima ventana", async () => {
  const pagina = await readFile(new URL("../yokup-site/highscoreDetail.html", import.meta.url), "utf8");
  assert.match(pagina, /function turnoPanel\(agent\)/);
  assert.match(pagina, /fleet\/turnos\?agent=/);
  assert.match(pagina, /target\.appendChild\(turnoPanel\(agent\)\)/);
  // cuenta atras viva y estado «puede abrir YA»
  assert.match(pagina, /window\.setInterval\(tic,1000\)/);
  assert.match(pagina, /puede abrir YA/);
  // degrada en silencio: si el endpoint falla, el detalle se pinta igual
  assert.match(pagina, /\.catch\(function\(\)\{ pinta\(null\); \}\)/);
  assert.match(pagina, /No se pudo consultar el reparto de turnos/);
  // y dice de cuantos es el reparto, que es lo que explica la espera
  assert.match(pagina, /"Turno "\+mio\.turno\+" de "\+d\.agentes\+" · una cada "\+d\.pasoMin\+" min/);
});
