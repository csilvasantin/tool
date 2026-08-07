import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// El botón de /objetivos se llamaba «→ misión» y su confirmación decía «¿Convertir
// en misión?». NO es lo que hace: abre una ventana de decisión, tres consejeros
// miran el objetivo y de ahí salen 3 opciones; la misión llega después, con la
// opción elegida (Carlos, 2026-08-07: «no que vaya directamente a mision, es para
// trabajarla mas y que lo que se haga tenga mas sentido»).
//
// Un botón que anuncia el final del proceso invita a saltárselo. Por eso el
// nombre importa tanto como la máquina que hay detrás.
const source = await readFile(new URL("./objetivos.html", import.meta.url), "utf8");
const worker = await readFile(new URL("../yokup-rtc/src/index.js", import.meta.url), "utf8");

test("el botón nombra la ventana, no la misión", () => {
  assert.match(source, />→ ventana<\/button>/);
  assert.doesNotMatch(source, />→ misión<\/button>/, "el nombre viejo prometía saltarse el paso");
  assert.match(source, /title="Abrir ventana de decisión · 3 consejeros lo miran y salen 3 opciones \(3 min\)\. No pasa directo a misión"/);
});

test("la confirmación cuenta el proceso entero y no miente en el número de opciones", () => {
  const decide = source.slice(source.indexOf("async function decide(id){"),
    source.indexOf("toast(\"Abriendo ventana de decisión…\")"));
  const confirma = decide.match(/if\(!confirm\('([\s\S]*?)'\)\) return;/);
  assert.ok(confirma, "sigue habiendo confirmación antes de abrir la ventana");
  const texto = confirma[1];
  assert.match(texto, /¿Abrir ventana de decisión\?/);
  assert.match(texto, /Tres consejeros miran el objetivo y proponen 3 opciones/);
  assert.match(texto, /si no eliges, se toma la recomendada/);
  assert.match(texto, /La misión sale de esa opción, no de aquí/);
  assert.doesNotMatch(texto, /5 mejores opciones/, "el worker genera 3, no 5");
  assert.doesNotMatch(texto, /¿Convertir en misión\?/);
});

test("la etiqueta de orden y accesibilidad de la acción dice lo mismo que el botón", () => {
  assert.match(source, /"abrir ventana de decisión"/);
  assert.doesNotMatch(source, /"convertir en misión"/);
});

// Y la máquina tiene que sostener el nombre: si el objetivo nunca pasó por
// «estudio» no hay deliberación, y las 3 opciones salían a ciegas — un botón que
// promete tres consejeros y no los convoca.
test("el worker convoca al Consejo antes de generar las opciones", () => {
  const handler = worker.slice(worker.indexOf('url.pathname === "/ideas/decide"'),
    worker.indexOf("const options = await generateDecideOptions"));
  assert.match(handler, /if \(!idea\.review\) \{/);
  assert.match(handler, /generateCouncilReview\(env, idea\)/);
  assert.match(handler, /idea\.review = JSON\.stringify\(r\)/, "en el mismo formato que trae la fila");
  assert.match(handler, /catch \(e\) \{ \/\* la ventana no se cae por una deliberación \*\/ \}/,
    "best-effort: sin deliberación se decide peor, pero no decidir es peor");
  // y la deliberación sigue alimentando el prompt de las opciones
  assert.match(worker, /const delib = ideaDeliberationText\(idea\.review\);/);
});

// El alias delante (Carlos, 2026-08-07): en el Consejo nadie piensa «el CDO»,
// piensa «Dieter Rams». Y los alias tienen que ser LOS MISMOS que usa el worker
// para firmar y para escribir el prompt de la silla — si divergen, eliges a un
// consejero en pantalla y opina otro.
test("las ocho sillas se eligen por alias, no por siglas", () => {
  assert.match(source, /const SEATS=\[\["ceo","Steve Jobs","CEO"\]/);
  assert.match(source, /SEATS\.map\(\(\[v,a,r\]\)=>'<option value="'\+v\+'"'\+\(v===sel\?' selected':''\)\+'>'\+a\+' · '\+r\+'<\/option>'\)/,
    "el desplegable abre con el alias");
  assert.match(source, /objective-primary">'\+esc\(seatAlias\)/, "y la ficha también");
  assert.match(source, /const seatSub=\[seatRole,i\.author\|\|"anónimo"\]/, "el puesto baja con el autor");
});

test("los alias de la página son exactamente los del Consejo del worker", () => {
  const enWorker = [...worker.matchAll(/^\s{2}(ceo|cto|coo|cfo|cco|cdo|cxo|cso): \{ role: "([A-Z]+)", alias: "([^"]+)"/gm)]
    .map((m) => [m[1], m[3], m[2]]);
  assert.equal(enWorker.length, 8, "se leyeron las ocho sillas de COUNCIL");
  const enPagina = [...source.matchAll(/\["(ceo|cto|coo|cfo|cco|cdo|cxo|cso)","([^"]+)","([A-Z]+)"\]/g)]
    .map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(enPagina, enWorker,
    "silla, alias y puesto tienen que coincidir con COUNCIL de yokup-rtc");
});

// La constancia del conocimiento extra: sin el contador, un consejero con
// material de pixeria y otro sin él se ven exactamente igual en la ficha.
test("la ficha del consejero enseña de cuántas piezas sabe, y cuáles", () => {
  assert.match(source, /const r=await wfetch\("\/council\/knowledge",\{cache:"no-store"\}\)/);
  assert.match(source, /class="objective-badges">'\+saberBadge\(i\.seat\)/, "va la primera, antes de las que solo clasifican");
  assert.match(source, /if\(!s\|\|!s\.count\) return "";/, "sin material no se pinta una chapa vacía");
  assert.match(source, /pieza"\+\(s\.count===1\?"":"s"\)\+" que le dio Carlos en pixeria \(#"\+s\.tag\+"\)"/);
  assert.match(source, /\.slice\(0,6\)\.map\(p=>"· "\+\(p\.title\|\|p\.note\|\|p\.type\|\|"pieza"\)\)/,
    "un número suelto no se puede comprobar: el título dice cuáles son");
  assert.match(source, /catch\(e\)\{ \/\* silencioso \*\/ \}[\s\S]{0,400}function saberBadge/,
    "si el recuento no llega, la página queda como estaba");
  assert.match(source, /\.objective-badge\.saber\{color:var\(--brand\)/);
});
