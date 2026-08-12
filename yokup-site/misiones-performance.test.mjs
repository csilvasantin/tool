import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./misiones.html", import.meta.url), "utf8");
const load = source.match(/async function load\(\)\{([\s\S]*?)\n  \/\/ El tablero SÍ es crítico/);

test("Misiones arranca personalización, proyectos y tickets en paralelo", () => {
  assert.ok(load, "no se encontró load()");
  assert.match(load[1], /const customizeP=/);
  assert.match(load[1], /const projectsP=ykf\("\/projects"/);
  // Lo que importa es que arranque en el mismo tick, no su firma exacta: atar el
  // test a los argumentos hacía fallar la prueba cada vez que la función crecía.
  assert.match(load[1], /const ticketsP=fetchMissionUniverse\(SCOPE,requestedDay,scopeAtStart/);
  assert.match(load[1], /await Promise\.all\(\[customizeP,projectsP\]\)/);
  assert.doesNotMatch(load[1], /await \(YkMisiones\.customizeReady/);
});

// FLT-1015 · el tablero no se baja el historial para tirarlo en el navegador.
test("Misiones pide al servidor SOLO lo vivo cuando el filtro no necesita historial", () => {
  assert.match(source, /const FILTROS_SOLO_VIVAS=new Set\(\["activas","asignadas","in_progress","unconcluded"\]\)/,
    "los cuatro filtros que se pintan con misiones vivas deben pedir state=vivas");
  assert.match(source, /if\(soloVivas\)path\+="&state=vivas"/,
    "fetchMissionUniverse tiene que trasladar el recorte al servidor");
  assert.match(load[1], /fetchMissionUniverse\(SCOPE,requestedDay,scopeAtStart,FILTROS_SOLO_VIVAS\.has\(FILTER\)\)/,
    "la carga decide el recorte con el filtro activo");
  // «Finalizadas», «Eliminadas» y «Todas» enseñan justo el historial: si pidieran
  // solo lo vivo saldrían vacías, que es un fallo mucho peor que tardar.
  for (const f of ["resolved", "cancelled", "todas"]) {
    assert.doesNotMatch(source, new RegExp('FILTROS_SOLO_VIVAS=new Set\\(\\[[^\\]]*"' + f + '"'),
      `${f} no puede pedir state=vivas`);
  }
});
