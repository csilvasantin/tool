// El aviso «VERSIÓN NUEVA · RECARGAR» no puede volver a mentir.
//
// Carlos, 7-ago-2026: «cuando pulso versión nueva · recargar vuelve a salir»
// (incidencia SVC-5FSKZH). Comparaba el ?v= del <script> —escrito en el HTML y
// congelado: r31 en /objetivos, v.2026.08.02.224605 en /misiones— contra el
// sello de /version.json, que iba por su cuenta. Dos fuentes que sólo casan si
// todos los caminos de publicación las escriben a la vez, y yokup.com se publica
// por dos que no sellan. La condición era verdadera siempre: el aviso aparecía en
// cada carga y recargar no lo quitaba.
//
// Esto vigila la regla que lo evita: cada fuente se compara CONSIGO MISMA a lo
// largo de la vida de la pestaña. Nunca el ?v= contra el sello.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const frame = await readFile(new URL("./yk-frame.js", import.meta.url), "utf8");

test("el aviso compara el sello publicado contra el que se leyó al cargar", () => {
  assert.match(frame, /var SELLO_AL_CARGAR = null/);
  assert.match(frame, /if \(SELLO_AL_CARGAR === null\) \{ SELLO_AL_CARGAR = sello; return; \}/);
  assert.match(frame, /if \(sello !== SELLO_AL_CARGAR\) marcaPestanaCaduca\(sello\)/);
});

test("nunca se contrasta el ?v= del script contra el sello publicado", () => {
  // La forma exacta del fallo: BUILD_VERSION (el ?v=) enfrentado a d.version.
  assert.doesNotMatch(frame, /!==\s*BUILD_VERSION/);
  assert.doesNotMatch(frame, /BUILD_VERSION\s*!==\s*String\(d\.version\)/);
});

test("la huella del propio frame detecta un despliegue aunque el sello esté congelado", () => {
  assert.match(frame, /var HUELLA_AL_CARGAR = null/);
  assert.match(frame, /method:"HEAD", cache:"no-store"/);
  assert.match(frame, /headers\.get\("etag"\) \|\| r\.headers\.get\("last-modified"\)/);
  assert.match(frame, /if \(h !== HUELLA_AL_CARGAR\) marcaPestanaCaduca/);
});

test("la referencia se toma al cargar: por eso recargar limpia el aviso", () => {
  // Sin este primer sondeo, la referencia no existiría hasta los 2 minutos.
  assert.match(frame, /refreshPublicVersion\(\);\n\s*\/\/ Cada 2 min basta/);
});

test("una sola vez: el aviso no se apila si se dispara por las dos vías", () => {
  assert.match(frame, /function marcaPestanaCaduca\(publicada\) \{\s*\n\s*if \(_stale\) return;/);
});
