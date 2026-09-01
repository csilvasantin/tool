import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("./highscore.html", import.meta.url), "utf8");
const moduleSource = fs.readFileSync(new URL("./highscore-race.js", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../yokup-rtc/src/index.js", import.meta.url), "utf8");
const sandbox = { module:{ exports:{} }, exports:{} };
vm.runInNewContext(moduleSource, sandbox);
const race = sandbox.module.exports;

function functionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `falta ${name}`);
  const next = html.indexOf("\n  function ", start + 12);
  return html.slice(start, next < 0 ? html.length : next);
}

test("un trabajo abierto usa generated_at más performance elapsed sin mutar el hecho", () => {
  const row = { state:"assigned_stale", work_started_at:1_000, work_progress_at:9_000 };
  const before = structuredClone(row);
  assert.deepEqual({ ...race.workClock(row, 11_000, 2_500) }, { at:13_500, durationMs:12_500,
    missionDurationMs:12_500, sessionDurationMs:null, sessionState:"unknown", closed:false });
  assert.deepEqual(row, before);
});

test("el reloj abierto cruza minuto desde el ancla del servidor aunque el reloj local tenga skew", () => {
  const serverAt = Date.parse("2026-08-12T19:59:30.000Z");
  const start = serverAt - 90_000;
  const row = { state:"running", work_started_at:start, work_progress_at:serverAt - 5_000 };
  const first = race.workClock(row, serverAt, 0);
  const after = race.workClock(row, serverAt, 61_000);
  assert.equal(after.at - first.at, 61_000);
  assert.equal(after.durationMs - first.durationMs, 61_000);
  assert.equal(row.work_progress_at, serverAt - 5_000, "el tick no refresca el progreso factual");
});

test("Madrid resuelve correctamente ambos lados del cambio DST", () => {
  const format = at => new Intl.DateTimeFormat("es-ES", {
    timeZone:"Europe/Madrid", hour:"2-digit", minute:"2-digit", hourCycle:"h23"
  }).format(new Date(at));
  assert.equal(format(Date.parse("2026-03-29T00:30:00Z")), "01:30");
  assert.equal(format(Date.parse("2026-03-29T01:30:00Z")), "03:30");
  assert.equal(format(Date.parse("2026-10-25T00:30:00Z")), "02:30");
  assert.equal(format(Date.parse("2026-10-25T01:30:00Z")), "02:30");
});

test("un trabajo finalizado congela hora y duración en ended_at", () => {
  const row = { state:"last_work", work_started_at:2_000, ended_at:8_000 };
  assert.deepEqual({ ...race.workClock(row, 40_000, 99_000) }, { at:8_000, durationMs:6_000,
    missionDurationMs:6_000, sessionDurationMs:null, sessionState:"unknown", closed:true });
  assert.equal(race.workClock({ state:"running" }, 40_000, 5_000).durationMs, null);
  assert.equal(race.workClock({ state:"last_work", work_started_at:9_000, ended_at:8_000 }, 40_000, 5_000).durationMs, null);
  assert.equal(race.workClock({ state:"running", work_started_at:50_000 }, 40_000, 5_000).durationMs, null);
});

test("el tick sólo actualiza duraciones y aria; nunca reloj, progreso ni estado", () => {
  const tick = functionSource("actualizaRelojesCarrera");
  assert.match(tick, /performance\.now\(\) - datos\.trabajosClientAt/);
  assert.doesNotMatch(tick, /\.refresh-now|horaMadrid/);
  assert.match(tick, /\.refresh-elapsed/);
  assert.doesNotMatch(tick, /work_progress_at\s*=|data-work-state[^\n]*setAttribute|classList|pintaCarrera|elapsed\s*\+=/);
  assert.match(html, /visibilitychange[\s\S]*actualizaRelojesCarrera\(\)[\s\S]*actualizaMarcador\(\)/);
});

test("la derecha muestra estado // misión // sesión y reserva ancho responsive", () => {
  assert.match(html, /class="refresh-time"[\s\S]*class="refresh-work-state"[\s\S]*class="refresh-elapsed"[\s\S]*class="refresh-session-elapsed"[\s\S]*class="refresh-ended"/);
  assert.doesNotMatch(html, /class="refresh-now"/);
  assert.match(html, /grid-template-columns:minmax\(106px,158px\) minmax\(0,1fr\) minmax\(218px,260px\)/);
  assert.match(html, /@media \(max-width:620px\)[\s\S]*grid-template-columns:minmax\(70px,96px\) minmax\(0,1fr\) minmax\(126px,142px\)/);
});

test("dorsal y toda su mecánica desaparecen de CSS DOM y JS", () => {
  assert.doesNotMatch(html, /refresh-place|place-revealed|rectDorsal|\bdorsal\b/i);
  assert.match(html, /data-place="' \+ puesto/,
    "data-place puede conservarse únicamente como orden interno de carrera");
});

test("stale corre sólo B/N cosmético y last_work conserva pose quieta", () => {
  assert.match(html, /data-work-state\]:not\(\[data-work-state="running"\]\) \.refresh-runner\{[\s\S]*--runner-skin:#b8c0c5;--runner-hair:#737f86;--runner-shirt:#a7b1b6;--runner-stripe:#e0e5e8/);
  assert.match(html, /data-work-state="last_work"\] \.runner-standing\{display:block;animation:none\}/);
  assert.match(html, /data-work-state="last_work"\] \.runner-run-a[\s\S]*display:none;animation:none/);
  assert.match(html, /carreraCosmetica = estadoTrabajo === "assigned_stale"/);
  assert.match(html, /Math\.min\(1, progresoCarril/);
  assert.match(html, /toggle\("cruzando", centroAtleta \+ RADIO_CORREDOR_PX >= metaLinea\)/);
  assert.match(html, /toggle\("cosmetic-finished", carreraCosmetica && progresoAtleta >= 1\)/);
  assert.doesNotMatch(html, /refresh-lane-idle \.refresh-runner\{filter:grayscale|refresh-lane-last \.refresh-runner\{filter:grayscale/);
  assert.match(html, /\.runner-standing,\.refresh-runner \.runner-standing use\{fill:#b8c0c5;stroke:none\}/);
  assert.match(html, /id="runnerStanding"[\s\S]*?class="runner-skin" fill="#b8c0c5"[\s\S]*?class="runner-hair" fill="#737f86"[\s\S]*?class="runner-shirt" fill="#a7b1b6"[\s\S]*?class="runner-accent" fill="#e0e5e8"/);
  assert.match(html, /class="runner-standing"[^>]*fill="#b8c0c5"[^>]*><use href="#runnerStanding" fill="#b8c0c5">/);
});

test("active-work se entrega no-store para que un tick no tape un snapshot nuevo", () => {
  const route = worker.slice(worker.indexOf('url.pathname === "/highscore/active-work"'),
    worker.indexOf("// ── NOTIFICACIONES", worker.indexOf('url.pathname === "/highscore/active-work"')));
  assert.match(route, /response\.headers\.set\("cache-control", "no-store"\)/);
});
