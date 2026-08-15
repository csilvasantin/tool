import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("./highscore.html", import.meta.url), "utf8");

// Carlos, 15-ago-2026: al pulsar el sumador hay que ver los últimos 30 días
// globales, para saber si los agentes rinden más cada día.
test("el sumador es un botón de verdad y abre los 30 días", () => {
  assert.match(html, /<button type="button" class="podio-total" id="podioTotal"/,
    "un div con onclick no se alcanza con el teclado");
  assert.match(html, /pulsa para ver los últimos 30 días/);
  assert.match(html, /highscore\/history\?scope=global/);
});

test("el clic se delega en el contenedor, no se ata al nodo", () => {
  // El sumador se repinta con el podio; un manejador atado al nodo se lo
  // llevaría por delante el primer repintado, sin avisar.
  assert.match(html, /getElementById\("podio"\)\.addEventListener\("click", function \(e\) \{/);
  assert.match(html, /closest\("#podioTotal"\)\) abreDias\(\)/);
});

test("el veredicto va en PALABRAS y antes que las barras", () => {
  // Quien mira treinta barras a ojo no sabe si sube, cree que sabe.
  const cuerpo = html.slice(html.indexOf("function pintaDias(d)"));
  assert.match(cuerpo.slice(0, 700), /diasVeredictoHtml\(d\) \+ diasGraficoHtml\(d\)/,
    "primero el veredicto, después el gráfico");
  assert.match(html, /El Equipo de Silicio rinde <b>más<\/b>/);
  assert.match(html, /El Equipo de Silicio rinde <b>menos<\/b>/);
});

test("sin base suficiente NO se inventa un porcentaje", () => {
  const fn = html.slice(html.indexOf("function diasVeredictoHtml"), html.indexOf("function diasGraficoHtml"));
  assert.match(fn, /if \(!t\.comparable\)/);
  assert.match(fn, /no hay base/);
  // Y se dice cuántos días con actividad tiene cada tramo, que es lo que
  // permite juzgar si la cifra vale.
  assert.match(fn, /con_dato/);
});

test("los días anteriores al primer registro se marcan, no se pintan como flojos", () => {
  // Días en los que esto no existía salen a cero como cualquier otro: una curva
  // que arranca en cero y sube dibuja un mérito que nadie hizo.
  const fn = html.slice(html.indexOf("function diasGraficoHtml"), html.indexOf("function abreDias"));
  assert.match(fn, /var previo = primero && x\.clave < primero/);
  assert.match(fn, /antes de que hubiera registro/);
  assert.match(html, /\.dias-graf \.dg-previo\{/);
});

test("un fallo de lectura se dice, no se disfraza de mes vacío", () => {
  const fn = html.slice(html.indexOf("function abreDias"), html.indexOf("function pintaDias"));
  assert.match(fn, /No se pudo leer el histórico/);
});

test("el panel se cierra por botón, por fondo y por Escape", () => {
  assert.match(html, /getElementById\("diasCerrar"\)\.addEventListener\("click", cierraDias\)/);
  assert.match(html, /if \(e\.target === document\.getElementById\("diasMod"\)\) cierraDias\(\)/);
  assert.match(html, /e\.key === "Escape" && document\.getElementById\("diasMod"\)\.classList\.contains\("on"\)/);
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="diasTit"/);
});

// Carlos, 15-ago-2026: el gráfico agrupa por días, semanas o meses.
test("las tres lupas salen del MISMO dato, sin volver a preguntar", () => {
  // Tres consultas distintas podrían discrepar entre sí; y cambiar de lupa
  // tiene que ser instantáneo, no un viaje a la red.
  assert.match(html, /var GRANOS = \[\["dia", "días", 30\], \["semana", "semanas", 12\], \["mes", "meses", 12\]\]/);
  assert.match(html, /function agrupaDias\(todos, grano, tope\)/);
  const clic = html.slice(html.indexOf('closest(".grano")'));
  assert.match(clic.slice(0, 200), /pintaDias\(diasCache\)/);
  assert.doesNotMatch(clic.slice(0, 200), /fetch/);
});

test("las semanas se agrupan por su LUNES, no por número de semana", () => {
  // El número se reinicia cada año y ordenaría diciembre antes que enero.
  assert.match(html, /function lunesDe\(dia\)/);
  const fn = html.slice(html.indexOf("function lunesDe"), html.indexOf("function agrupaDias"));
  assert.match(fn, /f\.setUTCDate\(f\.getUTCDate\(\) - \(d - 1\)\)/);
  assert.match(fn, /var f = new Date\(dia \+ "T12:00:00Z"\), d = f\.getUTCDay\(\) \|\| 7/,
    "el domingo es 0 en JS y sin el ||7 caería en la semana siguiente");
});

test("semanas y meses necesitan MÁS de 30 días, y el worker los manda", () => {
  // Agrupar por meses una ventana de 30 días daría dos barras: eso no es un eje
  // de meses, es un adorno.
  assert.match(html, /agrupaDias\(d\.all_days, diasGrano, conf\[2\]\)/);
});

test("por días se conservan los vacíos; por semanas y meses no se inventan", () => {
  // Un día a cero es información (la flota estuvo parada). Una semana sin
  // ningún día con actividad no llegó a existir.
  const fn = html.slice(html.indexOf("function diasGraficoHtml"), html.indexOf("function abreDias"));
  assert.match(fn, /diasGrano === "dia"\s*\?\s*\(\(d\.evolution && d\.evolution\.days\)/);
  // Y una barra agrupada dice sobre cuántos días se calculó.
  assert.match(fn, /x\.dias > 1 \? " \(" \+ x\.dias \+ " días con actividad\)" : ""/);
});

// La avería que costó una captura (15-ago-2026): las 30 barras salían como 30
// rayas horizontales de 3px. El SVG emitido era CORRECTO; lo que fallaba era el
// nombre de la clase. La página ya tenía .barra{width:100%;height:3px} para la
// barra de vida, y en SVG `width` y `height` son PROPIEDADES CSS de geometría:
// una regla con ese nombre pisa los atributos de cada <rect>.
test("las clases del gráfico no colisionan con ninguna regla de geometría", () => {
  const svg = html.slice(html.indexOf("function diasGraficoHtml"), html.indexOf("function abreDias"));
  assert.doesNotMatch(svg, /class="' \+ \(previo \? "previo"/,
    "«previo» y «barra» son nombres del resto de la página");
  assert.match(svg, /"dg-previo" : x\.clave === hoy \? "dg-barra dg-hoy" : "dg-barra"/);
  // Y ninguna regla que alcance a las barras puede fijar width o height.
  const reglas = [...html.matchAll(/\.dg-(?:barra|previo|hoy)[^{]*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(reglas.length >= 2, "las clases del gráfico tienen estilo propio");
  for (const r of reglas) {
    assert.doesNotMatch(r, /(?:^|;)\s*(?:width|height)\s*:/,
      "en SVG width/height son geometría: una regla así deforma las barras");
  }
});
