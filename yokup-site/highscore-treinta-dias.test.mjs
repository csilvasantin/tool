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
  assert.match(html, /La flota rinde <b>más<\/b>/);
  assert.match(html, /La flota rinde <b>menos<\/b>/);
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
  assert.match(fn, /var previo = primero && x\.day < primero/);
  assert.match(fn, /antes de que hubiera registro/);
  assert.match(html, /\.dias-graf \.previo\{/);
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
