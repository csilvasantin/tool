import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read = (name) => readFile(new URL(`./${name}`, import.meta.url), "utf8");
const [html, js, css, frame, redirects] = await Promise.all([
  "supervisor.html", "yk-supervisor.js", "yk-supervisor.css", "yk-frame.js", "_redirects"
].map(read));

test("/supervisor entra por la sesión común y por el marco canónico", () => {
  const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(scripts[0].split("?")[0], "/acceso.js", "acceso.js es el primer script ejecutable");
  assert.match(html, /<body data-yk-title="SUPERVISOR" data-yk-zone="app">/);
  assert.match(html, /src="\/yk-supervisor\.js\?[^\"]+"/);
  assert.match(html, /src="\/yk-frame\.js\?[^\"]+"/);
  assert.match(frame, /\["SUPERVISOR",\s+"\/supervisor"\]/);
  assert.match(frame, /supervisor: "SUPERVISOR"/);
  assert.match(redirects, /^\/supervisor\s+\/supervisor\.html\s+200$/m);
});

test("la captura es sólo vídeo, acotada y secuencial", () => {
  assert.match(html, /<video id="camera" muted playsinline/);
  assert.match(js, /getUserMedia\(\{[\s\S]*?video:\{[\s\S]*?audio:false[\s\S]*?\}\)/);
  assert.match(js, /const MAX_CAPTURE_EDGE = 960/);
  assert.match(js, /toDataURL\("image\/jpeg", JPEG_QUALITY\)/);
  assert.match(js, /state\.timer = window\.setTimeout\(\(\) => analyzeVideo\(\)/);
  assert.doesNotMatch(js, /setInterval\s*\(/, "no hay ciclos solapables");
  assert.doesNotMatch(js, /MediaRecorder|audioContext|getUserMedia\([^)]*audio:true/i);
});

test("cada lectura lleva identidad, tiempo y proyecto explícito", () => {
  for (const field of ["observation_id", "captured_at", "project_id", "station_id", "canonical_screen", "expected_screens", "metrics", "image"]) {
    assert.match(js, new RegExp(`${field}:`), `falta ${field}`);
  }
  assert.match(js, /if \(!state\.projectId\) throw new Error\("Selecciona un proyecto/);
  assert.match(js, /window\.YkProjectScope[\s\S]*\.get\(\)/);
  assert.match(js, /"yk:project-change"/);
  assert.doesNotMatch(js, /projectId\s*=\s*["']admira-tv["']/i, "no suplanta el selector global");
});

test("la cámara se cierra al ocultar o abandonar y una sola pestaña ocupa el puesto", () => {
  assert.match(js, /document\.addEventListener\("visibilitychange"/);
  assert.match(js, /window\.addEventListener\("pagehide"/);
  assert.match(js, /state\.stream\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(js, /navigator\.locks\.request\(`yokup-supervisor:\$\{stationId\}`/);
  assert.match(js, /\{ifAvailable:true\}/);
});

test("la alarma de voz sólo nace del ticket confirmado y no se repite", () => {
  assert.match(js, /result\.alert !== true \|\| !result\.ticket \|\| !result\.ticket\.id \|\| !text/);
  assert.match(js, /speech && speech\.once_key/);
  assert.match(js, /sessionStorage\.getItem\(storageKey\)/);
  assert.match(js, /new SpeechSynthesisUtterance\(String\(text\)\)/);
  assert.match(js, /utterance\.rate = 0\.78/);
  assert.match(js, /utterance\.pitch = 0\.45/);
});

test("el fallback manual y la privacidad forman parte visible del producto", () => {
  assert.match(html, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(html, /no se archivan en el navegador ni en Yokup/i);
  assert.match(js, /\/supervisor\/state\?station=/);
  assert.match(js, /\/supervisor\/analyze/);
  assert.match(js, /drawBoxes/);
  assert.doesNotMatch(js, /indexedDB|caches\.open|localStorage\.setItem\([^,]+,\s*(?:frame|image)/i);
  assert.match(css, /\.sv-stage\.analyzing \.sv-scanline/);
  assert.match(css, /\.sv-ticket\[hidden\]\{display:none\}/, "un ticket inexistente no deja una tarjeta fantasma");
});
