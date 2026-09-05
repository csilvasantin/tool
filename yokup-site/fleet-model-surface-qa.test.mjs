import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import groups from "./presence-groups.js";
import control from "./agent-control.js";
import identity from "./yk-agent-identity.js";

const dashboard = await readFile(new URL("./dashboard.html", import.meta.url), "utf8");
const highscore = await readFile(new URL("./highscore.html", import.meta.url), "utf8");
const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
function dashboardApi(saved = null) {
  const context = { localStorage: { getItem: () => saved }, window: {}, esc: escape,
    paRuntimeSurface: row => row.runtime || "" };
  const start = dashboard.indexOf('const PULSE_VIEW_KEY=');
  const end = dashboard.indexOf('function pulseRender()', start);
  assert.ok(start >= 0 && end > start);
  vm.runInNewContext(dashboard.slice(start, end) + '\nthis.api={pulseDefaultView,pulseReadView,pulseCard,pulseControlledGroups,pulseGroupMarkup};', context);
  return context.api;
}
function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const brace = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false;
  for (let i = brace; i < source.length; i++) {
    const char = source[i];
    if (quote) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === quote) quote = ""; continue; }
    if ('"\'`'.includes(char)) { quote = char; continue; }
    if (char === "{") depth++; else if (char === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`función ${name} incompleta`);
}
function scoreApi() {
  const context = { esc: escape, adoptaActividad(){}, marcaProyecto(){} };
  vm.runInNewContext(["normaliza", "adoptaRuntimeCandidato", "adoptaRuntime", "modeloLegible", "viaComunicacion", "viaYModeloHtml", "suma"].map(name => functionSource(highscore, name)).join("\n") + '\nthis.api={adoptaRuntime,viaYModeloHtml,suma};', context);
  return context.api;
}

test("ambas franjas nacen compactas y una preferencia explícita de ampliar se conserva", () => {
  for (const saved of [null, "{}", "{invalid"]) {
    const state = dashboardApi(saved).pulseReadView();
    for (const key of ["cli", "app"]) { assert.equal(state[key].compact, true); assert.equal(state[key].hidden, false); }
  }
  const state = dashboardApi('{"cli":{"compact":false},"app":{"hidden":true}}').pulseReadView();
  assert.equal(state.cli.compact, false);
  assert.equal(state.app.compact, true);
  assert.equal(state.app.hidden, true);
});

test("clasificación y controles preservan el modelo real de cada superficie de la misma identidad", () => {
  const now = 2_000_000_000;
  const presence = ["cli", "app"].map((host, index) => ({ persona:"Oraculo", machine:"MacMini", runtime:"Codex", host,
    model:index ? "gpt-5.6" : "gpt-5.5", updated:now, pid:100 + index, session_id:host === "cli" ? "oraculo" : "desktop:codex",
    verified:true, source:"process_snapshot", online:true }));
  const classified = groups.classify(presence, { identity });
  const inventory = control.inventory({ presence }, { identity, now:now * 1000 });
  const result = dashboardApi().pulseControlledGroups(classified, inventory);
  for (const [key, model] of [["cli", "gpt-5.5"], ["app", "gpt-5.6"]]) {
    assert.equal(result.by_key[key].items.length, 1);
    assert.equal(result.by_key[key].items[0].model, model);
    assert.equal(result.by_key[key].items[0].host, key);
  }
});

test("tarjeta muestra LLM junto al nombre y CLI junto a máquina, según host y sin adivinar por runtime", () => {
  const api = dashboardApi();
  for (const host of ["cli", "app", "unknown"]) {
    const html = api.pulseCard({ agent:"OraculoMini", machine:"MacMini", runtime:"Codex", host, model:"GPT-5.6 <real>", state:"active" });
    const top = html.match(/<div class="top">([\s\S]*?)<\/div>/)?.[1];
    const machine = html.match(/<div class="mach">([\s\S]*?)<\/div>/)?.[1];
    assert.ok(top && machine);
    assert.match(top, /OraculoMini[\s\S]*GPT-5\.6 &lt;real&gt;/);
    assert.doesNotMatch(top, /<real>/);
    assert.equal(/>CLI<\/span>/.test(machine), host === "cli");
  }
  for (const model of ["", "/Applications/Codex.app", "com.apple.metadata.mdbulkimport", "de"]) {
    const html = api.pulseCard({ agent:"OraculoMini", machine:"MacMini", runtime:"Codex", host:"app", model });
    assert.doesNotMatch(html, /class="(?:llm|pulse-llm)"/);
  }
});

test("Highscore cambia modelo junto con runtime al resolver empates, independientemente del orden del censo", () => {
  const api = scoreApi();
  for (const rows of [ [["OpenCode", "Qwen3"], ["Codex", "GPT-5.6"]], [["Codex", "GPT-5.6"], ["OpenCode", "Qwen3"]] ]) {
    const row = { runtime:"", runtimePeso:0, runtimeAt:0, via:"", modelo:"" };
    rows.forEach(([runtime, model]) => api.adoptaRuntime(row, runtime, "app", 1000, true, model));
    assert.equal(row.runtime, "Codex");
    assert.equal(row.modelo, "GPT-5.6");
  }
});

test("Highscore no coloca una etiqueta CLI ni runtime entre el nombre y su modelo", () => {
  const api = scoreApi();
  const html = api.viaYModeloHtml({ runtime:"Codex", via:"cli", modelo:"GPT-5.6" });
  assert.match(html, /GPT-5\.6/);
  assert.doesNotMatch(html, /CLI|Codex/);
  assert.equal(api.viaYModeloHtml({ runtime:"Codex", via:"cli", modelo:"" }), "");
});

test("una lectura sin runtime no introduce una vía ni un LLM sin propietario", () => {
  const row = { runtime:"", runtimePeso:0, runtimeAt:0, via:"", modelo:"" };
  scoreApi().adoptaRuntime(row, "", "cli", 1000, true, "GPT-5.6");
  assert.equal(row.runtime, ""); assert.equal(row.via, ""); assert.equal(row.modelo, "");
});

test("al fusionar filas Highscore el LLM y la vía acompañan únicamente al runtime ganador", () => {
  const api = scoreApi();
  const row = (runtime, modelo, via, runtimePeso) => ({ runtime, modelo, via, runtimePeso, runtimeAt:1000,
    maquinas:[], maquinasVivas:[], objetivos:0, ptsObjetivos:0, ventanas:0, ptsVentanas:0,
    misiones:0, ptsMisiones:0, tareas:0, ptsTareas:0 });
  const target = row("OpenCode", "Qwen3", "cli", 110);
  api.suma(target, row("Codex", "GPT-5.6", "app", 120));
  assert.equal(target.runtime, "Codex"); assert.equal(target.modelo, "GPT-5.6"); assert.equal(target.via, "app");
  api.suma(target, row("OpenCode", "Qwen3", "cli", 110));
  assert.equal(target.runtime, "Codex"); assert.equal(target.modelo, "GPT-5.6"); assert.equal(target.via, "app");
});
