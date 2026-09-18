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

test("un fallo de delimitación nunca se presenta como ausencia física de la pantalla", () => {
  assert.match(js, /missing_screen:"Objetivo no delimitado"/);
  assert.doesNotMatch(js, /missing_screen:"Falta una pantalla"/);
  assert.match(html, /src="\/yk-supervisor\.js\?v=r8"/);
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
  assert.match(js, /if \(!dom\.voice\.checked \|\| !\("speechSynthesis" in window\) \|\| document\.hidden\) return false/);
  assert.match(js, /window\.speechSynthesis\.speak\(utterance\);[\s\S]*?state\.pendingSpeech = null;[\s\S]*?sessionStorage\.setItem\(storageKey, "1"\)/,
    "el once_key sólo se consume después de entregar la voz");
  assert.match(js, /presentDeferredVisual\(\);\s*spe[a-zA-Z]*PendingAlert\(\)/,
    "volver a la pestaña presenta el resultado vigente y después reintenta la alarma");
  assert.match(js, /pending\.scope && !analysisScopeMatches\(pending\.scope, currentAnalysisScope\(\)\)/,
    "una voz diferida tampoco cruza de puesto o proyecto");
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

test("cada pantalla se convierte en un objetivo identificado sobre la previsualización", () => {
  assert.match(html, /<canvas id="visionOverlay"[^>]*aria-hidden="true"/);
  assert.match(html, /id="targetActions" class="sv-target-actions" role="group"/);
  assert.match(html, /id="targetStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="detections" role="list" aria-label="Pantallas identificadas"/);
  assert.match(js, /export function screenTargetPlan\(/);
  assert.match(js, /screenTargetId\(index, screen\)/, "el HUD prefiere el identificador devuelto por visión");
  assert.match(js, /drawTargetCorners\(context, box, palette\.color\)/);
  assert.match(js, /drawTargetReticle\(context, box, palette\.color\)/);
  assert.match(js, /drawTargetLabel\(context, target, box, palette\.color/);
  assert.match(js, /TARGET LOCK \/\/ \$\{target\.id\}/);
  assert.match(js, /classList\.toggle\("has-targets", painted > 0\)/);
  assert.match(js, /dom\.targetActions\.clientWidth/);
  assert.match(js, /renderTargetActions\(targets, viewportWidth, viewportHeight\)/);
  assert.match(js, /existing = new Map\(\[\.\.\.dom\.targetActions\.children\]/, "cada repintado reutiliza los enlaces estables");
  assert.match(js, /restored\.focus\(\{preventScroll:true\}\)/, "el foco se conserva durante un nuevo análisis");
  assert.match(css, /\.sv-stage\.has-targets \.sv-overlay\{animation:sv-target-acquire/);
  assert.match(css, /prefers-reduced-motion:reduce[^}]*\.sv-stage\.has-targets \.sv-overlay/);
  assert.match(js, /STATE \$\{target\.stateConfidence\}%/);
  assert.match(js, /ESTADO —/);
  assert.match(js, /screens:\$\{screenTargetSemanticKey\(state\.lastScreens\)\}/);
  assert.match(js, /if \(!dom\.targetStatus \|\| state\.targetStatusKey === key\) return false/,
    "el live region no reanuncia el mismo estado semántico");
});

test("la ficha contrasta proyecto y player y sólo expone mandos Admira verificados", () => {
  assert.match(js, /export function normalizeScreenIdentity\(/);
  assert.match(js, /status === "matched" && source === "admira-mcp"/);
  assert.match(js, /ADMIRA_REMOTE_HOSTS = new Set\(\["admira\.tv", "www\.admira\.tv"\]\)/);
  assert.match(js, /ADMIRA_REMOTE_PATH = "\/remotecontrol\/"/);
  assert.match(js, /ADMIRA_SCREEN_ID = \/\^\[a-z0-9\]/);
  assert.match(js, /!ADMIRA_REMOTE_HOSTS\.has\(hostname\).*parsed\.pathname !== ADMIRA_REMOTE_PATH/);
  assert.match(js, /remote\.rel = "noopener noreferrer"/);
  assert.match(js, /remote\.referrerPolicy = "no-referrer"/);
  assert.match(js, /appendIdentityField\(fields, "Emitiendo ahora", identity\.content/);
  assert.match(js, /MANDO ADMIRA VERIFICADO/);
  assert.match(js, /Playlist · primero\/anterior\/siguiente\/último · pausa · mute · volumen · HUD/);
  assert.match(js, /El mando aparecerá sólo después de verificar proyecto y player/);
  assert.doesNotMatch(js, /\.innerHTML\s*=/, "la identidad y sus evidencias se insertan como texto, no HTML remoto");
});

test("el target verificado es un enlace nativo al mando oficial con contexto accesible", () => {
  assert.match(js, /export function screenRemoteActionPlan\(/);
  assert.match(js, /link\.className = "sv-target-action"/);
  assert.match(js, /link\.target = "_blank"/);
  assert.match(js, /link\.rel = "noopener noreferrer"/);
  assert.match(js, /link\.referrerPolicy = "no-referrer"/);
  assert.match(js, /link\.setAttribute\("aria-label", `Abrir mando de \$\{action\.id\}: proyecto \$\{action\.project\}, player \$\{action\.player\}/);
  assert.match(css, /\.sv-target-actions\{position:absolute;z-index:11;inset:0;pointer-events:none\}/);
  assert.match(css, /\.sv-target-action\{position:absolute;[^}]*pointer-events:auto/);
  assert.match(css, /\.sv-target-action\{position:absolute;min-width:44px;min-height:44px/);
  assert.match(css, /\.sv-target-action:hover,\.sv-target-action:focus-visible/);
});

test("el visor adopta el HUD Matrix sin sacrificar movimiento reducido", () => {
  assert.match(html, /class="sv-matrix-grid"/);
  assert.match(html, /class="sv-matrix-rain"/);
  assert.match(html, /OPTICAL FEED \/\/ TARGET ACQUISITION/);
  assert.match(css, /--matrix:#72ff62/);
  assert.match(css, /@keyframes sv-code-rain/);
  assert.match(css, /-webkit-mask-image:/);
  assert.match(css, /\.sv-overlay\{z-index:8/);
  assert.match(css, /prefers-reduced-motion:reduce[^}]*\.sv-matrix-rain span/);
});

test("el HUD y el fondo se publican atómicamente desde el mismo fotograma", () => {
  const captureStart = js.indexOf("function captureDrawable");
  const captureEnd = js.indexOf("function screenTone", captureStart);
  const capture = js.slice(captureStart, captureEnd);
  assert.match(capture, /document\.createElement\("canvas"\)/, "la captura usa un canvas fuera del DOM");
  assert.match(capture, /const image = buffer\.toDataURL\("image\/jpeg", JPEG_QUALITY\)/);
  assert.match(capture, /return \{image, metrics, width:size\.width, height:size\.height, buffer\}/,
    "la copia enviada y la que después se presenta nacen del mismo buffer");
  assert.doesNotMatch(capture, /dom\.frame/, "capturar vídeo no modifica el still visible");

  const videoStart = js.indexOf("async function analyzeVideo");
  const videoEnd = js.indexOf("async function startMonitoring", videoStart);
  const video = js.slice(videoStart, videoEnd);
  assert.match(video, /captureDrawable\(dom\.camera, dom\.camera\.videoWidth, dom\.camera\.videoHeight\)/);
  assert.doesNotMatch(video, /presentCapturedFrame|dom\.frame|has-still/,
    "durante la inferencia conserva el último still+lock y nunca superpone cajas sobre vídeo vivo");

  const visualStart = js.indexOf("function renderAnalysisVisual");
  const visualEnd = js.indexOf("function deferAnalysisVisual", visualStart);
  const visual = js.slice(visualStart, visualEnd);
  assert.ok(visual.indexOf("presentCapturedFrame(frame)") >= 0);
  assert.ok(visual.indexOf("presentCapturedFrame(frame)") < visual.indexOf("renderScreens(result.screens || [])"),
    "el frame vigente se presenta antes de pintar su HUD en la misma tarea");

  const uploadStart = js.indexOf("async function analyzeUpload");
  const uploadEnd = js.indexOf("async function pauseForVisibility", uploadStart);
  const upload = js.slice(uploadStart, uploadEnd);
  const uploadPresent = upload.indexOf("presentCapturedFrame(frame)");
  const uploadSubmit = upload.indexOf("await submitFrame(frame, false)");
  assert.ok(uploadPresent >= 0 && uploadPresent < uploadSubmit,
    "upload puede mostrar su copia pendiente y envía exactamente ese mismo frame");
  assert.match(js, /function releaseCapturedFrame[\s\S]*?frame\.image = "";[\s\S]*?frame\.buffer\.width = 0/);
  assert.match(js, /function invalidateAnalysis[\s\S]*?discardPendingFrame\(\)/);
});

test("ocultar pausa la cámara sin abortar el POST y limpia también un still manual", () => {
  const pauseStart = js.indexOf("async function pauseForVisibility");
  const pauseEnd = js.indexOf("async function resumeAfterVisibility", pauseStart);
  const pause = js.slice(pauseStart, pauseEnd);
  assert.match(pause, /clearTimer\(\)/);
  assert.match(pause, /stopTracks\(\)/);
  assert.match(pause, /clearPresentedFrame\(\)/, "también limpia un upload ya completado aunque no haya monitorización");
  assert.doesNotMatch(pause, /invalidateAnalysis|\.abort\(/, "visibilitychange no cancela una inferencia válida");
  assert.match(js, /deferVisual:document\.hidden \|\| state\.hiddenPaused/);
  assert.match(js, /analysisScopeMatches\(deferred\.scope, current\)/,
    "el resultado diferido sólo puede volver al mismo scope");
});

test("el análisis tiene timeout menor que el lease y se reprograma sin confundir stop con timeout", () => {
  const timeout = Number(js.match(/const ANALYSIS_TIMEOUT_MS = ([\d_]+);/)[1].replaceAll("_", ""));
  assert.ok(timeout > 10_000 && timeout < 120_000);
  assert.match(js, /timeoutTriggered = true;\s*controller\.abort\(\)/);
  assert.match(js, /window\.clearTimeout\(timeout\)/);
  assert.match(js, /if \(timeoutTriggered && isCurrent\(\)\)/,
    "sólo el temporizador vigente muestra tiempo agotado");
  assert.match(js, /if \(continuous && state\.monitoring && !state\.hiddenPaused && !document\.hidden\) scheduleNext\(state\.nextDelay\)/);
  assert.match(js, /state\.nextDelay = nextAnalysisDelay\(analysisStartedAt, analysisCompletedAt\)/,
    "la cadencia se descuenta desde el inicio del análisis, no desde su respuesta");
  assert.doesNotMatch(js, /await refreshState\(\{quiet:true\}\);[\s\S]{0,300}finally/,
    "la sincronización histórica no bloquea el siguiente ciclo");
  assert.match(js, /if \(shouldRefreshState && isCurrent\(\)\) void refreshState\(\{quiet:true\}\)/);
  assert.match(js, /function invalidateAnalysis[\s\S]*?state\.abort\.abort\(\)/,
    "stop y cambio de scope siguen usando el mismo AbortController");
  assert.match(js, /transientLiveState = presentation\.liveState/);
  assert.match(js, /if \(isCurrent\(\) && transientLiveState\) setLiveState\(transientLiveState\.status, transientLiveState\.label\);\s*else if \(isCurrent\(\) && state\.lastStation\)/,
    "station_busy conserva Lectura en curso y no recupera el diagnóstico anterior en finally");
});

test("la lectura auxiliar de estado tiene timeout y nunca puede congelar la cámara", () => {
  assert.match(js, /const STATE_REFRESH_TIMEOUT_MS = 5_000/);
  assert.match(js, /timeoutTriggered = true;\s*controller\.abort\(\);[\s\S]*STATE_REFRESH_TIMEOUT_MS/);
  assert.match(js, /window\.clearTimeout\(timeout\)/);
  assert.match(html, /CICLO OBJETIVO <b>12 s<\/b>/);
});

test("probar una imagen es un control de teclado nativo", () => {
  assert.match(html, /<button class="sv-btn upload" id="uploadButton" type="button">/);
  assert.match(html, /<input id="uploadInput" type="file"[^>]*hidden>/);
  assert.match(js, /dom\.uploadButton\.addEventListener\("click", \(\) => dom\.upload\.click\(\)\)/);
  assert.match(js, /dom\.uploadButton\.disabled = dom\.upload\.disabled/);
  assert.doesNotMatch(html, /<label class="sv-btn upload"/);
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
  const paint = js.indexOf("handleAnalysis(result, frame,", staleGuard);
  assert.ok(staleGuard >= 0 && paint > staleGuard, "la vigencia se comprueba antes de pintar y hablar");
  assert.match(js, /error\.name !== "AbortError" && isCurrent\(\)/,
    "un fallo tardío tampoco sustituye el mensaje del alcance actual");
  assert.match(js, /function invalidateAnalysis[\s\S]*?state\.analysisSeq \+= 1;[\s\S]*?state\.abort\.abort\(\)/);
  assert.match(js, /input\.disabled = state\.monitoring \|\| state\.analyzing/,
    "el puesto y su configuración no cambian desde el formulario durante el POST");
});
