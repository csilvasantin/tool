import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./highscore.html", import.meta.url), "utf8");

// El realce «.activity-now» de la tabla late sobre una cifra viva. Las dos
// señales de la fila NO comparten fuente: la columna cuenta lo que ha puntuado
// HOY y el realce marca lo que está en curso AHORA, así que pueden discrepar de
// forma legítima —una misión in_progress que aún no ha puntuado—. Cuando eso
// pasaba, la celda salía a 0 y latiendo: el agente parecía trabajar y marcar
// cero a la vez (OraculoMBAPlata, cazado por Carlos el 2026-08-05).
function numeroActividad(fila, tipo, valor, singular) {
  const start = source.indexOf("function numeroActividad(");
  const end = source.indexOf("\n\n  function numeroVentanas", start);
  assert.ok(start >= 0 && end > start, "falta numeroActividad en highscore.html");
  return new Function("normaliza", "esc", `${source.slice(start, end)}\nreturn numeroActividad;`)(
    (v) => String(v == null ? "" : v).trim(),
    (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"),
  )(fila, tipo, valor, singular);
}

const enCurso = { actividad: "misiones", actividadDetalle: "Reordenar el catálogo" };

test("una cifra viva se realza con su detalle", () => {
  const salida = String(numeroActividad(enCurso, "misiones", 1, "misión en curso"));
  assert.match(salida, /class="activity-now"/);
  assert.match(salida, /Reordenar el catálogo/);
  assert.match(salida, />1</);
});

test("un 0 NUNCA late, aunque el agente tenga actividad de ese tipo", () => {
  const salida = numeroActividad(enCurso, "misiones", 0, "misión en curso");
  assert.equal(salida, 0, "la celda a cero debe salir limpia, sin envoltorio");
  assert.doesNotMatch(String(salida), /activity-now/);
});

test("las cuatro columnas comparten la guarda: ninguna late en cero", () => {
  for (const tipo of ["objetivos", "ventanas", "misiones", "tareas"]) {
    const fila = { actividad: tipo, actividadDetalle: "" };
    assert.doesNotMatch(String(numeroActividad(fila, tipo, 0, tipo)), /activity-now/,
      `${tipo} no debe realzar un cero`);
    assert.match(String(numeroActividad(fila, tipo, 2, tipo)), /activity-now/,
      `${tipo} sí debe realzar una cifra viva`);
  }
});

test("valores no numéricos o vacíos tampoco fabrican un realce", () => {
  for (const valor of ["", "—", null, undefined, "0", NaN, -1]) {
    assert.doesNotMatch(String(numeroActividad(enCurso, "misiones", valor, "misión en curso")),
      /activity-now/, `«${String(valor)}» no debe realzarse`);
  }
  assert.match(String(numeroActividad(enCurso, "misiones", "3", "misión en curso")), /activity-now/,
    "una cifra en texto sí cuenta como viva");
});

test("sin actividad de ese tipo la celda va limpia aunque tenga cifra", () => {
  const otra = { actividad: "tareas", actividadDetalle: "algo" };
  assert.equal(numeroActividad(otra, "misiones", 7, "misión en curso"), 7);
});
