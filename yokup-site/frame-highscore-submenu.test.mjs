import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// FLT-1426 · El submenú de vistas del HIGHSCORE en la barra del marco.
// Contratos: HIGHSCORE no enseña el tooltip de contadores sino un submenú
// CLICABLE (Marcador + podio del día → Detalle), los datos se piden al abrir
// —nunca al cargar la página— con caché de 60 s, y todo degrada en silencio.

const frame = fs.readFileSync(new URL("./yk-frame.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("./yk-frame.css", import.meta.url), "utf8");

test("HIGHSCORE abre su submenú, no el tooltip de contadores", () => {
  // El cableado del nav solo corre para secciones con contador (más DECISIONES):
  // HIGHSCORE no tiene contador y sin esta línea el hover quedaba mudo — pasó
  // en la primera prueba local del 14-ago.
  assert.match(frame, /COUNTER_KEY\[it\.label\] \|\| it\.label === "DECISIONES" \|\| it\.label === "HIGHSCORE"/);
  assert.match(frame, /if \(label === "HIGHSCORE"\) \{ wireHsSubmenu\(a\); return; \}/);
  assert.match(frame, /a\.setAttribute\("aria-haspopup", "menu"\)/);
  assert.match(frame, /a\.setAttribute\("aria-controls", "yk-hs-submenu"\)/);
});

test("el submenú lleva al Marcador y al Detalle de cada puesto del podio", () => {
  assert.match(frame, /hsSubRow\("\/highscore", "Marcador", null\)/);
  assert.match(frame, /\/highscoreDetail\?agent=" \+ encodeURIComponent\(s\.agent\)/);
  // El podio se recorta a tres y se ordena por puntos totales de las tres patas.
  assert.match(frame, /objective_points[\s\S]*?window_points[\s\S]*?mission_points/);
  assert.match(frame, /yesterday_points/);
  assert.match(frame, /day_comparison/);
  assert.match(frame, /\.slice\(0, 3\)/);
});

test("los datos se piden al ABRIR y se cachean 60 s — nunca al cargar la página", () => {
  assert.match(frame, /HS_SUB_TTL_MS = 60000/);
  assert.match(frame, /sessionStorage\.getItem\(HS_SUB_KEY/);
  const aperturas = frame.match(/hsSubTop\(\)\.then/g) || [];
  assert.equal(aperturas.length, 1, "hsSubTop se consume solo desde hsSubShow");
  assert.match(frame, /ykFetch\("\/highscore\/daily", \{ cache: "no-store" \}\)/);
});

test("degrada en silencio, se cierra con Escape y no se esfuma al cruzar al menú", () => {
  assert.match(frame, /podio no disponible/);
  assert.match(frame, /sin puntos aún/);
  assert.match(frame, /e\.key === "Escape"\) hsSubHide\(\)/);
  assert.match(frame, /_hsSubClose = setTimeout\(hsSubHide, 220\)/);
  assert.match(frame, /_hsSub\.addEventListener\("mouseenter", function \(\) \{ clearTimeout\(_hsSubClose\); \}\)/);
});

test("el CSS del submenú existe, sus filas son enlaces y solo se toca cuando está abierto", () => {
  assert.match(css, /\.yk-submenu\{[\s\S]*?pointer-events:none/);
  assert.match(css, /\.yk-submenu\.on\{[\s\S]*?pointer-events:auto/);
  assert.match(css, /\.yk-submenu a\{/);
  assert.match(css, /\.yk-submenu a:hover, \.yk-submenu a:focus-visible\{/);
  assert.match(css, /\.yk-submenu \.yk-sub-score\.sube\{ color:#88ffaa/);
  assert.match(css, /\.yk-submenu \.yk-sub-score\.baja\{ color:#ff7f87/);
  assert.match(css, /\.yk-submenu \.yk-sub-score\.igual\{ color:#ffd45e/);
  assert.match(frame, /simbolo = estado === "sube" \? "▲" : estado === "baja" \? "▼" : "="/,
    "la comparación no depende solamente del color");
});
