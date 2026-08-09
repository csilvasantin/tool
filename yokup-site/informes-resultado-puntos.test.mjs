import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Carlos, 8-ago-2026: «al margen de la captura de Proceso, tenemos que capturar
// los puntos que lleva el agente al iniciar... y cambiamos CAPTURA por RESULTADO,
// y al margen de la imagen pondremos también los nuevos puntos del agente».
// El informe decía QUÉ se hizo; con esto dice CUÁNTO produjo.
const html = await readFile(new URL("./informes.html", import.meta.url), "utf8");

test("la columna se llama Resultado, no Captura", () => {
  assert.match(html, /\["captura","Resultado"\]/);
  assert.match(html, /data-label="Resultado"/);
  assert.doesNotMatch(html, /data-label="Captura"/);
});

// Carlos, 2026-08-08 (segunda vuelta): los puntos salen de la celda RESULTADO y
// se van AL FINAL de la fila, en columna propia. Dentro de RESULTADO competían con
// la miniatura y, sobre todo, no se podía ordenar por ellos.
test("los puntos cierran la fila, en su propia columna y ordenables", () => {
  assert.match(html, /<div class="gc pts-cell" role="cell" data-label="Puntos">\$\{highscoreHTML\(t\)\}\$\{puntosHTML\(t\)\}<\/div>/);
  assert.match(html, /data-label="Resultado">\$\{shot\}<\/div>/,
    "RESULTADO se queda SOLO con su pantallazo");
  assert.match(html, /\["puntos","Puntos"\]\s*\n?\s*\]/, "PUNTOS es la última columna");
  assert.match(html, /t\.points_start/);
  assert.match(html, /t\.points_end/);
});

test("sin datos no se inventa un cero", () => {
  // Un 0 se lee como «no produjo nada»; no saberlo no es lo mismo que saber que
  // fue cero. Es la regla 17 aplicada a la interfaz.
  //
  // La guarda vieja (`!Number.isFinite(b)`) NO protegía del `null` de la base:
  // Number(null) es 0 y es finito, así que 120 misiones que habían puntuado 40
  // salían como «0 pts · 0 total» (el sello venía roto del worker, 2026-08-08).
  assert.match(html, /const num=v=>\{const n=Number\(v\);return \(v===null\|\|v===undefined\|\|v===""\|\|!Number\.isFinite\(n\)\)\?null:n;\}/);
  assert.match(html, /if\(b===null\) return '<span class="pts-none"/);
  assert.match(html, /sin punto de partida registrado/);
});

// Carlos, 2026-08-08: «una captura de pantalla de yokup.com/highscore donde se vea
// cómo ha puntuado el agente en esa misión». Foto no se puede: /highscore está tras
// el perímetro de Google y el capturador del worker abre un navegador limpio, así
// que retrataría la pantalla de login. La evidencia se TRAE de la traza pública.
test("el resultado enseña cómo puntuó esa misión en el Highscore", () => {
  assert.match(html, /async function cargaHighscore\(\)/);
  assert.match(html, /fetch\(WORKER\+"\/highscore\/daily"/);
  assert.match(html, /d&&d\.traceability&&d\.traceability\.chains/);
  assert.match(html, /HS_CHAINS\[String\(t\.mission_id\|\|""\)\.trim\(\)\]/,
    "el recorte se busca por el id de ESTA misión, no por el agente");
  assert.match(html, /if\(!chain\)return"";/,
    "una misión fuera de la traza del día no inventa recorte");
  assert.match(html, /class="hs-ev" href="\/highscore"/, "el recorte lleva al Highscore");
  // Carlos, 2026-08-09: el recorte se va a PUNTOS. Es un dato de puntuación, no una
  // captura, y en RESULTADO competía con la foto — dos columnas de pantallazos
  // seguidas se leen de un vistazo; una foto y un recuadro de números, no.
  const celdaResultado = html.slice(html.indexOf('data-label="Resultado"'), html.indexOf("</div>", html.indexOf('data-label="Resultado"')));
  assert.doesNotMatch(celdaResultado, /highscoreHTML/, "el recorte ya no vive en RESULTADO");
  assert.match(html, /\.hs-ev\{/, "y tiene estilo propio");
});

test("el resultado dice también cuánto costó, no sólo cuánto valió", () => {
  // Carlos, 8-ago-2026: «hay que poner además de los puntos de la misión y el
  // total verificado, el tiempo dedicado». Puntos y tiempo juntos son lo que
  // mide la productividad; por separado, cada uno cuenta media historia.
  assert.match(html, /function dedicadoTxt\(t\)/);
  assert.match(html, /\$\{dedicadoTxt\(t\)\}/, "el tiempo va dentro del bloque de resultado");
  assert.match(html, /if\(!ini\|\|!fin\|\|fin<ini\) return "";/,
    "en curso no se declara tiempo dedicado: el reloj aún corre");
});
