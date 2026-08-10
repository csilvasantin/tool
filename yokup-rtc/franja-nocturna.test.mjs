import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const script = fileURLToPath(new URL("./tools/onidle-hora.sh", import.meta.url));

// Se prueba la función de franja aislada, sin red: se carga el script hasta la
// definición y se pregunta por cada hora del día.
function deNoche(hora, extra = {}) {
  const env = { ...process.env, ...extra };
  // Se extrae la función a un fichero y se sourcea: la sustitución de procesos
  // no es fiable en todos los bash de la flota y aquí lo que se prueba es la
  // franja, no el shell.
  const frag = execFileSync("sed", ["-n", "/^es_de_noche()/,/^}/p", script], { encoding: "utf8" });
  const tmp = join(tmpdir(), `franja-${process.pid}-${hora}.sh`);
  writeFileSync(tmp, frag);
  let out;
  try {
    out = execFileSync("bash", ["-c",
      `: "\${ONIDLE_NOCHE_DESDE:=23}"; : "\${ONIDLE_NOCHE_HASTA:=8}"; ` +
      `source "${tmp}"; if es_de_noche ${hora}; then echo SI; else echo NO; fi`
    ], { encoding: "utf8", env });
  } finally { rmSync(tmp, { force: true }); }
  return out.trim() === "SI";
}

// Las horas reales de la noche del 9 al 10 de agosto de 2026, cuando se abrieron
// ventanas de mejora que acabaron publicadas sin que nadie las pidiera.
test("las horas de la madrugada del incidente quedan cerradas", () => {
  for (const h of [0, 1, 2, 3, 4, 5, 6, 7, 23]) {
    assert.equal(deNoche(h), true, `las ${h}:00 deberían ser noche`);
  }
});

test("la jornada sigue abierta", () => {
  for (const h of [8, 9, 12, 15, 18, 20, 22]) {
    assert.equal(deNoche(h), false, `las ${h}:00 deberían ser jornada`);
  }
});

test("los bordes son los que se anuncian: entra a las 23, sale a las 8", () => {
  assert.equal(deNoche(22), false);
  assert.equal(deNoche(23), true);
  assert.equal(deNoche(7), true);
  assert.equal(deNoche(8), false);
});

test("la franja se puede mover sin tocar el código", () => {
  const env = { ONIDLE_NOCHE_DESDE: "21", ONIDLE_NOCHE_HASTA: "9" };
  assert.equal(deNoche(21, env), true);
  assert.equal(deNoche(20, env), false);
  assert.equal(deNoche(8, env), true);
  assert.equal(deNoche(9, env), false);
});

test("una franja que NO cruza medianoche también funciona", () => {
  const env = { ONIDLE_NOCHE_DESDE: "13", ONIDLE_NOCHE_HASTA: "16" };
  assert.equal(deNoche(14, env), true);
  assert.equal(deNoche(12, env), false);
  assert.equal(deNoche(16, env), false);
});
