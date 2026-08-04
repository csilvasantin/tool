import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("./highscore.html", import.meta.url), "utf8");
const moduleSource = fs.readFileSync(new URL("./highscore-race.js", import.meta.url), "utf8");
const sandbox = { module:{exports:{}}, exports:{} };
vm.runInNewContext(moduleSource, sandbox);
const race = sandbox.module.exports;

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp("(?:^|\\n)" + escaped + "\\{([^}]*)\\}"));
  assert.ok(match, `falta la regla ${selector}`);
  return match[1];
}

function functionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `falta ${name}`);
  let depth = 0, opened = false;
  for (let i = start; i < html.length; i += 1) {
    if (html[i] === "{") { depth += 1; opened = true; }
    if (html[i] === "}") depth -= 1;
    if (opened && depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`función incompleta: ${name}`);
}

test("la pista nace cerca del borde izquierdo bajo MISIÓN, no en el antiguo margen de 36px", () => {
  const raceRule = cssRule(".refresh-race");
  const start = Number(raceRule.match(/--track-start:([0-9.]+)px/)?.[1]);
  assert.ok(Number.isFinite(start), "falta --track-start numérico");
  assert.ok(start >= 0 && start <= 12, `inicio demasiado alejado del borde: ${start}px`);
  assert.notEqual(start, 36);
  assert.match(cssRule(".refresh-track::before"), /left:var\(--track-start\)/);
  assert.match(cssRule(".refresh-fill"), /left:var\(--track-start\)/);
  assert.match(cssRule(".refresh-mission"), /left:0/);
});

test("el dorsal empieza oculto bajo la línea y aparece sólo cuando el corredor lo rebasa", () => {
  const place = cssRule(".refresh-place");
  const line = cssRule(".refresh-track::before");
  const placeBottom = Number(place.match(/bottom:(-?[0-9.]+)(?:px)?/)?.[1]);
  const lineBottom = Number(line.match(/bottom:(-?[0-9.]+)(?:px)?/)?.[1]);
  assert.ok(Number.isFinite(placeBottom) && Number.isFinite(lineBottom));
  assert.ok(placeBottom < lineBottom, `dorsal ${placeBottom}px debe quedar bajo línea ${lineBottom}px`);
  assert.match(place, /opacity:0/);
  assert.match(place, /visibility:hidden/);
  assert.match(html, /\.refresh-lane\.place-revealed \.refresh-place\{[^}]*opacity:(?:\.88|1)[^}]*visibility:visible/);

  const paint = functionSource("pintaCarrera");
  assert.match(paint, /dorsal\s*=\s*carril\.querySelector\(["']\.refresh-place["']\)/);
  const rearEdge = /centroAtleta\s*-\s*RADIO_CORREDOR_PX\s*>\s*dorsalX/;
  const rectEdge = /rectCorredor\.left\s*>=?\s*rectDorsal\.right/;
  if (rectEdge.test(paint)) {
    assert.match(paint, /rectCorredor\s*=\s*corredor\.getBoundingClientRect\(\)/);
    assert.match(paint, /rectDorsal\s*=\s*dorsal\.getBoundingClientRect\(\)/);
    assert.match(paint, /carril\.classList\.toggle\("place-revealed",\s*rectCorredor\.left\s*>=?\s*rectDorsal\.right\)/);
  } else {
    assert.match(paint, /dorsalX\s*=\s*dorsal\s*\?\s*dorsal\.offsetLeft/);
    assert.match(paint, rearEdge, "debe pasar el borde trasero completo del corredor");
    const namedCondition = paint.match(new RegExp(`(?:var|let|const)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${rearEdge.source}`));
    if (namedCondition) {
      assert.match(paint, new RegExp(`carril\\.classList\\.toggle\\("place-revealed",\\s*${namedCondition[1]}\\)`));
    } else {
      assert.match(paint, new RegExp(`carril\\.classList\\.toggle\\("place-revealed",\\s*${rearEdge.source}\\)`));
    }
  }
});

test("el sorteo puro de llegada acepta RNG inyectable y devuelve una permutación determinista", () => {
  assert.equal(typeof race.randomFinishOrder, "function");
  const sequence = [0.75, 0.1, 0.5];
  function draw() {
    let cursor = 0;
    return Array.from(race.randomFinishOrder(4, () => sequence[cursor++ % sequence.length]));
  }
  const first = draw(), second = draw();
  assert.deepEqual(first, second, "el mismo RNG debe producir el mismo orden");
  assert.deepEqual([...first].sort((a, b) => a - b), [1, 2, 3, 4]);
  assert.notDeepEqual(first, [1, 2, 3, 4], "la secuencia de prueba debe ejercer el barajado");
  assert.deepEqual(Array.from(race.randomFinishOrder(0, () => 0.5)), []);
});

test("reiniciar cambia de ganador aunque el RNG repita el mismo sorteo", () => {
  const keys = ["oraculo", "neo", "morfeo"];
  const repeated = [1, 3, 2];
  const next = Array.from(race.avoidRepeatedWinner(repeated, keys, "oraculo"));
  assert.deepEqual([...next].sort((a, b) => a - b), [1, 2, 3]);
  assert.notEqual(keys[next.indexOf(1)], "oraculo");
  assert.deepEqual(Array.from(race.avoidRepeatedWinner(repeated, keys, "neo")), repeated,
    "si el ganador ya cambió, no debe alterarse el sorteo");
  assert.deepEqual(Array.from(race.avoidRepeatedWinner([1], ["oraculo"], "oraculo")), [1]);
});

test("data-race-order decide ventaja y ganador sin sustituir el dorsal data-place", () => {
  const render = functionSource("actualizaCarreraPodio");
  assert.match(render, /data-place="' \+ puesto \+ '"/);
  assert.match(render, /refresh-place refresh-place-track[^>]*>' \+ puesto \+ '<\/span>/);

  const draw = functionSource("sorteaOrdenLlegada");
  assert.match(draw, /if \(forzar \|\| firma !== ordenLlegadaFirma \|\| !ordenLlegadaPorAgente\)/,
    "un repintado del mismo censo debe conservar el sorteo del ciclo");
  assert.match(draw, /YkHighscoreRace\.randomFinishOrder\(carriles\.length,\s*Math\.random\)/);
  assert.match(draw, /YkHighscoreRace\.avoidRepeatedWinner\(orden,\s*claves,\s*ganadorAnterior\)/,
    "un reinicio con rivales evita repetir ganador");
  assert.match(draw, /carril\.setAttribute\("data-race-order",\s*String\(orden\)\)/);
  assert.match(draw, /classList\.toggle\("race-winner",\s*orden\s*===\s*1\)/);
  assert.match(draw, /classList\.toggle\("race-loser",\s*orden\s*!==\s*1\)/);

  const progress = functionSource("progresoCarril");
  assert.match(progress, /function progresoCarril\(progresoCiclo,\s*ordenLlegada\)/);
  assert.match(progress, /finishAdvanceMs\(ordenLlegada,\s*DIFERENCIA_META_MS\)/);

  const paint = functionSource("pintaCarrera");
  assert.match(paint, /ordenLlegada\s*=\s*Number\(carril\.getAttribute\("data-race-order"\)\)\s*\|\|\s*puesto/);
  assert.match(paint, /progresoCarril\(progreso,\s*ordenLlegada\)/);
  assert.match(paint, /classList\.toggle\("race-winner",\s*ordenLlegada\s*===\s*1\)/);
  assert.match(paint, /classList\.toggle\("race-loser",\s*ordenLlegada\s*!==\s*1\)/);
  assert.doesNotMatch(paint, /progresoCarril\(progreso,\s*puesto\)/);

  assert.match(render, /sorteaOrdenLlegada\(false\)/,
    "repintar calles conserva el orden ya sorteado");
  assert.match(functionSource("iniciaCarrera"), /sorteaOrdenLlegada\(true\)/,
    "sólo un nuevo ciclo fuerza un nuevo sorteo");
  assert.equal((html.match(/sorteaOrdenLlegada\(true\)/g) || []).length, 1);
});
