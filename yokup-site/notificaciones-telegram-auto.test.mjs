import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// Encargo #2717 (Carbono→Jobs→Woz→Morfeo, 6-sep-2026 · FLT-100009): un interruptor visible en
// /notificaciones que PARA o ACTIVA la escritura automática a Telegram. El flag vive en el
// worker admira-telegram; la página lo lee por api.yokup.com y lo cambia con sesión.
const html = await readFile(new URL("./notificaciones.html", import.meta.url), "utf8");
test("el interruptor existe en la zona de Consumo de tokens con estado claro ON/OFF", () => {
  assert.match(html, /<button class="tgauto dud" id="tgAuto" type="button" aria-pressed="true"/);
  assert.match(html, /Telegram automático: "\+\(on\?"ON":"OFF"\)/);
  assert.match(html, /\.cons \.tgauto\.on\{/);
  assert.match(html, /\.cons \.tgauto\.off\{/);
});
test("lee el flag del worker y sólo lo cambia con sesión (credentials include) y confirmación", () => {
  assert.match(html, /fetch\(WORKER\+"\/fleet\/telegram-auto",\{cache:"no-store"\}\)/);
  assert.match(html, /fetch\(WORKER\+"\/fleet\/telegram-auto",\{method:"POST",credentials:"include"/);
  assert.match(html, /confirm\(on\?"¿PARAR la escritura automática a Telegram\?/);
  assert.match(html, /Hace falta la sesión de Google del perímetro/);
});
test("OFF explica que se sigue midiendo y guardando, sin publicar", () => {
  assert.match(html, /nada se publica en Telegram \(se mide y se guarda\)/);
  assert.match(html, /mensajes suprimidos: /);
});
