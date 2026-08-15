import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("./highscore.html", import.meta.url), "utf8");

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp("(?:^|\\n)" + escaped + "\\{([^}]*)\\}"));
  assert.ok(match, `falta la regla ${selector}`);
  return match[1];
}
function porcentaje(rule, prop) {
  const m = rule.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([0-9.]+)%`));
  assert.ok(m, `falta ${prop} en ${rule}`);
  return Number(m[1]);
}

// Carlos, 15-ago-2026: el podio enseñaba tres cifras y ninguna decía cuánto
// había hecho el equipo entero. El sumador va arriba a la izquierda, en espejo
// de la bandera que el arte lleva pintada a la derecha.
test("el sumador se coloca en espejo de la bandera, no en cualquier hueco", () => {
  const total = cssRule(".podio-total");
  const plata = cssRule(".plaza.p2");
  // Arriba: por encima de las tres plazas, que arrancan en el 59% de altura.
  assert.ok(porcentaje(total, "top") < 20, "el sumador vive en la franja alta de la escena");
  assert.ok(porcentaje(total, "top") < porcentaje(plata, "top"), "nunca por debajo de las plazas");
  // A la izquierda y a la MISMA distancia del borde que la bandera del arte,
  // que está pegada al borde derecho: si se separara, dejaría de ser simétrico.
  assert.equal(porcentaje(total, "left"), 9, "el espejo de la bandera cae en el 9% por la izquierda");
  assert.match(total, /position:absolute/);
});

test("hereda la caja de las plazas: es el mismo tipo de dato y se lee igual", () => {
  const total = cssRule(".podio-total"), plaza = cssRule(".plaza");
  for (const prop of ["background", "border-radius", "backdrop-filter", "padding"]) {
    const uno = total.match(new RegExp(`${prop}:([^;]*)`));
    const otro = plaza.match(new RegExp(`${prop}:([^;]*)`));
    assert.ok(uno && otro, `falta ${prop}`);
    assert.equal(uno[1].trim(), otro[1].trim(), `${prop} debe coincidir con .plaza`);
  }
});

test("suma TODA la lista, no los tres del podio", () => {
  assert.match(html, /function totalPodioHtml\(todos\)/);
  assert.match(html, /function pintaPodio\(top, todos\)/);
  // Los tres puntos de llamada tienen que pasar la lista completa; si uno se
  // olvidara, el total desaparecería en esa vista sin avisar.
  // El argumento lleva un slice(0, 3) dentro, así que el paréntesis anida: una
  // clase [^)]* corta en el cierre del slice y no ve la lista que viene detrás.
  const llamadas = html.match(/pintaPodio\((?:[^()]|\([^()]*\))*\)/g)
    .filter((c) => !c.includes("top, todos"));
  assert.equal(llamadas.length, 3, "hay exactamente tres puntos de llamada");
  for (const c of llamadas) {
    assert.match(c, /,\s*(listaCache|l)\)/, `${c} no pasa la lista completa`);
  }
});

test("el total sale de las MISMAS cifras que pinta cada fila", () => {
  // Recalcularlo por otra vía acabaría discrepando con la tabla de debajo, y un
  // total que no cuadra con lo que hay debajo es peor que no poner total.
  const fn = html.slice(html.indexOf("function totalPodioHtml"), html.indexOf("function pintaPodio"));
  assert.match(fn, /metricaHoraDia\(a, "points"\)/);
  assert.doesNotMatch(fn, /a\.total/, "no se suma por una vía distinta a la de la tabla");
});

test("declara cuántos agentes ha contado, para que el filtro no lo vuelva engañoso", () => {
  const fn = html.slice(html.indexOf("function totalPodioHtml"), html.indexOf("function pintaPodio"));
  assert.match(fn, /lista\.length \+ \(lista\.length === 1 \? " agente" : " agentes"\)/);
  assert.match(fn, /toda la flota/);
  // Sin nadie a quien sumar no se pinta un cero: no se pinta nada.
  assert.match(fn, /if \(!lista\.length\) return "";/);
});
