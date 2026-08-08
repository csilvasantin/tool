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

test("el resultado enseña la imagen Y los puntos del encargo", () => {
  assert.match(html, /\$\{shot\}\$\{puntosHTML\(t\)\}/,
    "los puntos van junto a la miniatura, en la misma celda");
  assert.match(html, /t\.points_start/);
  assert.match(html, /t\.points_end/);
});

test("sin datos no se inventa un cero", () => {
  // Un 0 se lee como «no produjo nada»; no saberlo no es lo mismo que saber que
  // fue cero. Es la regla 17 aplicada a la interfaz.
  assert.match(html, /if\(!Number\.isFinite\(b\)\) return "";/);
  assert.match(html, /sin punto de partida registrado/);
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
