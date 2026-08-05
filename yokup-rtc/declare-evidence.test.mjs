import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// POST /declare es PÚBLICA a propósito: los agentes cierran su trabajo desde el
// CLI, igual que abren ventanas de decisión sin login. Lo único que impide que
// sea un grifo de marcador es la evidencia obligatoria, así que su validador y
// sus guardas se prueban aparte (Carlos, 2026-08-05).
const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

function fuente(nombre) {
  const inicio = source.indexOf(`function ${nombre}(`);
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

const declaredEvidence = new Function(`${fuente("declaredEvidence")}\nreturn declaredEvidence;`)();

test("sin nada que enseñar no hay evidencia", () => {
  for (const caso of [undefined, null, {}, "commit", 42, { commit:"", release:"", url:"" }]) {
    assert.equal(declaredEvidence(caso), null, `«${JSON.stringify(caso)}» no puede valer como evidencia`);
  }
});

test("un commit vale, pero tiene que parecerlo", () => {
  assert.equal(declaredEvidence({ commit:"5e20e24" }).commit, "5e20e24");
  assert.equal(declaredEvidence({ commit:"0e1568b9993c1e5f6e7e2a1b2c3d4e5f6a7b8c9d" }).commit.length, 40);
  for (const malo of ["abc", "zzzzzzz", "5e20e24!", "hecho ya"]) {
    assert.equal(declaredEvidence({ commit:malo }), null, `«${malo}» no es un commit`);
  }
});

test("el sello de despliegue sigue el formato de la norma 07", () => {
  assert.equal(declaredEvidence({ release:"v.05.08.2026.r2.10:17" }).release, "v.05.08.2026.r2.10:17");
  for (const malo of ["v.05.08.2026.r2", "v.5.8.2026.r2.10:17", "v.05.08.26.r2.10:17", "r2"]) {
    assert.equal(declaredEvidence({ release:malo }), null, `«${malo}» no es un sello canónico`);
  }
});

test("una URL vale sólo si es https y con dominio de verdad", () => {
  assert.equal(declaredEvidence({ url:"https://www.yokup.com/highscore" }).url, "https://www.yokup.com/highscore");
  for (const mala of ["http://www.yokup.com", "yokup.com", "https://localhost", "https://", "javascript:alert(1)"]) {
    assert.equal(declaredEvidence({ url:mala }), null, `«${mala}» no es una URL válida como evidencia`);
  }
});

test("basta con una de las tres, y el texto las junta todas", () => {
  const e = declaredEvidence({ commit:"5e20e24", release:"v.05.08.2026.r2.10:17", url:"https://www.yokup.com/highscore" });
  assert.match(e.text, /commit 5e20e24/);
  assert.match(e.text, /sello v\.05\.08\.2026\.r2\.10:17/);
  assert.match(e.text, /https:\/\/www\.yokup\.com\/highscore/);
  // una sola basta y no arrastra las otras
  assert.equal(declaredEvidence({ release:"v.05.08.2026.r2.10:17" }).commit, "");
});

// ── guardas de la ruta (a nivel de fuente: no hay D1 aquí) ─────────────────

const ruta = source.slice(source.indexOf('url.pathname === "/declare"'),
  source.indexOf('if (url.pathname === "/decisions" && req.method === "POST")'));

test("la ruta exige identidad y proyecto canónicos, como /decisions", () => {
  assert.match(ruta, /resolveDecisionIdentity\(b\.agent, b\.machine\)/);
  assert.match(ruta, /exact_identity_required/);
  assert.match(ruta, /exactDecisionProjectAssignment\(/);
  assert.match(ruta, /exact_project_required/);
});

test("una tarea hecha SIN evidencia se rechaza con 400", () => {
  assert.match(ruta, /if \(status === "done"\) \{[\s\S]*?evidence_required/);
  assert.doesNotMatch(ruta, /status === "done"[\s\S]{0,400}?return json\(\{ ok: true/,
    "no puede haber un camino que declare hecho sin pasar por la evidencia");
});

test("nadie declara trabajo en la misión de otro", () => {
  assert.match(ruta, /sameAgentFamily\(existing\.assignee/);
  assert.match(ruta, /memberRefMatches\("machine"/);
  assert.match(ruta, /not_your_mission/);
  assert.match(ruta, /\}, 403\)/);
});

test("una misión son entre 1 y 3 tareas con código único a, b o c", () => {
  assert.match(ruta, /!rawTasks\.length \|\| rawTasks\.length > 3/);
  assert.match(ruta, /\/\^\[abc\]\$\/\.test\(code\) \|\| codes\.has\(code\)/);
});

test("cerrar la misión exige TODAS las tareas hechas y su propia evidencia", () => {
  assert.match(ruta, /tasks_pending/);
  assert.match(ruta, /no se cierra una misión con tareas sin hacer/);
  assert.match(ruta, /const evidenciaMision = b\.resolve === true \? declaredEvidence\(b\.evidence\) : null/);
  assert.match(ruta, /cerrar la misión exige evidencia/);
  // el 'accept' es el que deja avanzar una tanda: no se firma sin evidencia
  assert.match(ruta, /addEvent\(env, missionId, "accept"/);
});

test("cada tarea declarada deja rastro auditable con su evidencia", () => {
  assert.match(ruta, /addEvent\(env, missionId, "log", identity\.agent/);
  assert.match(ruta, /declarada hecha desde el CLI/);
});

test("/declare NO entra en el conjunto protegido — ese es el punto", () => {
  const protegidas = source.slice(source.indexOf("var PROTECTED"), source.indexOf("\n", source.indexOf("var PROTECTED")));
  assert.doesNotMatch(protegidas, /"\/declare"/);
  // y no cuelga de /mission/, que el router protege por prefijo
  assert.match(source, /url\.pathname === "\/declare"/);
  assert.doesNotMatch(source, /url\.pathname === "\/mission\/declare"/);
});

// ── dos fallos reales cazados al declarar el trabajo del día ───────────────

test("NADA se escribe antes de validar el cierre", () => {
  const iValida = ruta.indexOf("tasks_pending");
  const iInsert = ruta.indexOf("INSERT INTO tickets");
  const iUpdate = ruta.indexOf("UPDATE tickets SET subject");
  assert.ok(iValida > 0 && iInsert > iValida,
    "validar el cierre DESPUES del INSERT deja misiones huerfanas cuando devuelve 400");
  assert.ok(iUpdate > iValida, "lo mismo con el UPDATE de una mision existente");
  assert.match(ruta, /const evidenciaMision = b\.resolve === true \? declaredEvidence\(b\.evidence\) : null/);
});

test("screen es unico por mision, no por proyecto", () => {
  // tickets lleva UNIQUE INDEX en screen entre los NO resueltos: sembrarlo con
  // el proyecto dejaba UNA sola mision declarable por proyecto y reventaba la
  // segunda con D1_ERROR.
  assert.match(ruta, /"declare:" \+ missionId/);
  assert.doesNotMatch(ruta, /"declare:" \+ projectContext\.project_id/);
  assert.match(source, /CREATE UNIQUE INDEX IF NOT EXISTS idx_open_screen ON tickets\(screen\)/);
});

test("el trabajo declarado ENTRA en el marcador: tercera puerta", () => {
  // El marcador solo miraba 'fleet' y 'decision-batch'. Una puerta nueva que
  // no se anade deja el trabajo a cero — el mismo fallo que ya se corrigio el
  // 2026-08-04 con las ventanas de decision, repetido.
  assert.match(source, /var AGENT_SOURCE_SQL = "source IN \('fleet','decision-batch','cli-declare'\)";/);
  assert.match(source, /var AGENT_SOURCE_SQL_T = "t\.source IN \('fleet','decision-batch','cli-declare'\)";/);
  // y no puede colarse en la bandeja de CAMPO, cuyo ambito es «todo lo que no es fleet»
  assert.match(source, /FIELD_SOURCE_SQL_T = "\(t\.source IS NULL OR t\.source NOT IN \('fleet','decision-batch','cli-declare'\)\)"/);
  assert.match(ruta, /"cli-declare"/);
});

test("una mision declarada es puntuable por su created_at", () => {
  // scored_at solo salia de created_at para 'decision-batch'; para el resto
  // exigia un evento de entrada en curso. Sin el, las misiones declaradas
  // tenian scored_at NULL y no contaban.
  assert.match(source, /CASE WHEN t\.source IN \('decision-batch','cli-declare'\) THEN t\.created_at/);
  // y ademas deja el evento de estado, como cualquier otra mision
  assert.match(ruta, /addEvent\(env, missionId, "status", identity\.agent/);
  assert.match(ruta, /pasa a en curso \(in_progress\)/);
});
