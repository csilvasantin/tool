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
  assert.match(html, /<body[^>]*data-yk-title="SUPERVISOR"[^>]*data-yk-zone="app"/);
  assert.match(html, /data-yk-project-default="admira-tv"/);
  assert.match(html, /data-yk-project-default-label="admira\.tv"/);
  assert.match(html, /data-yk-project-switch="superuser"/);
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

test("admira-tv es el proyecto efectivo normal y sólo una capacidad firmada permite cambiarlo", () => {
  for (const field of ["observation_id", "captured_at", "project_id", "station_id", "canonical_screen", "expected_screens", "metrics", "image"]) {
    assert.match(js, new RegExp(`${field}:`), `falta ${field}`);
  }
  assert.match(html, /<strong id="projectName">admira\.tv<\/strong>/);
  assert.match(html, /Activa la cámara para observar las pantallas de admira\.tv\./);
  assert.match(js, /const defaultProjectId = String\([^\n]+\|\| "admira-tv"\)\.trim\(\)/);
  assert.match(js, /projectId:defaultProjectId, projectName:defaultProjectLabel/);
  assert.match(js, /capabilities\.supervisor_project_switch === true/);
  assert.match(js, /const next = canChangeProject\(\) \? requested : defaultProjectId/,
    "un usuario normal no puede sustituir el proyecto ni mediante eventos del navegador");
  assert.match(js, /if \(!state\.projectId\) throw new Error\("El proyecto del Supervisor no está disponible\."\)/);
  assert.match(js, /window\.YkProjectScope[\s\S]*\.get\(\)/);
  assert.match(js, /"yk:project-change"/);
  assert.doesNotMatch(js, /yk_email|csilva@admira\.com|localStorage[^\n]+superuser/i,
    "los permisos no se deducen del correo ni del storage");
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
  assert.match(js, /new SpeechSynthesisUtterance\(pending\.text\)/);
  assert.match(js, /utterance\.rate = 0\.78/);
  assert.match(js, /utterance\.pitch = 0\.45/);
});

test("una alarma confirmada mientras la pestaña está oculta se conserva hasta poder hablar", () => {
  assert.match(js, /pendingSpeech:null/);
  assert.match(js, /state\.pendingSpeech = \{key, text:String\(text\), lang:/);
  assert.match(js, /function speakPendingAlert\(\)/);
  assert.match(js, /if \(!pending \|\| !dom\.voice\.checked \|\| !\("speechSynthesis" in window\) \|\| document\.hidden\) return false/);
  assert.match(js, /window\.speechSynthesis\.speak\(utterance\);[\s\S]*?state\.pendingSpeech = null;[\s\S]*?sessionStorage\.setItem\(storageKey, "1"\)/,
    "el once_key sólo se consume después de entregar la voz");
  assert.match(js, /else \{ speakPendingAlert\(\); resumeAfterVisibility\(\); \}/,
    "volver a la pestaña reintenta la alarma antes de reabrir la cámara");
});

test("el fallback manual y la privacidad forman parte visible del producto", () => {
  assert.match(html, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(html, /no se archivan en el navegador ni en Yokup/i);
  assert.match(js, /new URLSearchParams\(\{station:stationId, project_id:projectId\}\)/);
  assert.match(js, /\/supervisor\/state\?\$\{params\}/,
    "la lectura de estado también lleva el scope que autoriza el backend");
  assert.match(js, /\/supervisor\/analyze/);
  assert.match(js, /drawBoxes/);
  assert.doesNotMatch(js, /indexedDB|caches\.open|localStorage\.setItem\([^,]+,\s*(?:frame|image)/i);
  assert.match(css, /\.sv-stage\.analyzing \.sv-scanline/);
  assert.match(css, /\.sv-ticket\[hidden\]\{display:none\}/, "un ticket inexistente no deja una tarjeta fantasma");
});

test("una lectura antigua de estado no puede repintar otro puesto o proyecto", () => {
  assert.match(js, /refreshAbort:null, refreshSeq:0/);
  assert.match(js, /if \(state\.refreshAbort\) state\.refreshAbort\.abort\(\)/);
  assert.match(js, /const isCurrent = \(\) => sequence === state\.refreshSeq && projectId === state\.projectId/);
  assert.match(js, /signal:controller\.signal/);
  assert.match(js, /if \(!isCurrent\(\)\) return null/);
  assert.match(js, /error\.name !== "AbortError" && isCurrent\(\)/);
});

test("una respuesta POST antigua no puede pintar estado, ticket ni alarma en otro alcance", () => {
  assert.match(js, /abort:null, analysisSeq:0/);
  assert.match(js, /const scope = Object\.freeze\(\{[\s\S]*?sequence:\+\+state\.analysisSeq,[\s\S]*?projectId:state\.projectId,[\s\S]*?stationId:config\.station_id/);
  assert.match(js, /project_id:scope\.projectId,[\s\S]*?station_id:scope\.stationId/,
    "el POST usa el alcance capturado, no el estado mutable posterior");
  const staleGuard = js.indexOf("if (!isCurrent()) return;", js.indexOf("async function submitFrame"));
  const paint = js.indexOf("handleAnalysis(result, frame);", staleGuard);
  assert.ok(staleGuard >= 0 && paint > staleGuard, "la vigencia se comprueba antes de pintar y hablar");
  assert.match(js, /error\.name !== "AbortError" && isCurrent\(\)/,
    "un fallo tardío tampoco sustituye el mensaje del alcance actual");
  assert.match(js, /function invalidateAnalysis[\s\S]*?state\.analysisSeq \+= 1;[\s\S]*?state\.abort\.abort\(\)/);
  assert.match(js, /input\.disabled = state\.monitoring \|\| state\.analyzing/,
    "el puesto y su configuración no cambian desde el formulario durante el POST");
});
