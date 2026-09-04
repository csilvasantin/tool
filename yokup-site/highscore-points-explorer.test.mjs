import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("./highscore.html", import.meta.url), "utf8");

function functionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const brace = html.indexOf("{", start);
  let depth = 0, quote = "", escaped = false;
  for (let index = brace; index < html.length; index += 1) {
    const char = html[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`${name} incompleta`);
}

function invoke(name, args, declarations = "") {
  return new Function("args", `${declarations}\n${functionSource(name)}\nreturn ${name}.apply(null,args);`)(args);
}

function renderMissionItems(payload) {
  return new Function("payload", `
    function normaliza(value) { return String(value == null ? "" : value).trim(); }
    function esc(value) { return String(value == null ? "" : value).replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
    ${functionSource("scoreMissionDuration")}
    ${functionSource("scoreMissionStatusLabel")}
    ${functionSource("scoreMissionItemsHtml")}
    return scoreMissionItemsHtml(payload);
  `)(payload);
}

test("pulsar Puntos abre el explorador de esa fila sin perder el botón accesible", () => {
  const points = functionSource("puntosHtml");
  const toggle = functionSource("iniciaProgresionToggle");
  assert.match(points, /<button class="score-toggle"[^>]*aria-expanded="false"[^>]*aria-controls=/);
  assert.match(toggle, /closest\("\.score-toggle"\)/);
  assert.match(toggle, /detalle\.hidden = !abrir/);
  assert.match(toggle, /scoreMissionLoad\([^;]*false\)/,
    "la primera apertura carga las misiones del agente representado por esa fila");
  assert.match(html, /scoreMissionExplorerHtml\(a,\s*progressId\)/,
    "cada subfila contiene su explorador, no uno global que mezcle agentes");
});

test("el explorador recorre HORA, DÍA, SEMANA y MES con flechas y límites de teclado", () => {
  const declarations = 'var SCORE_MISSION_PERIODS=["hour","day","week","month"];';
  assert.equal(invoke("scoreMissionPeriod", ["hour", -1], declarations), "month");
  assert.equal(invoke("scoreMissionPeriod", ["month", 1], declarations), "hour");
  assert.equal(invoke("scoreMissionPeriod", ["day", 1], declarations), "week");
  assert.equal(invoke("scoreMissionPeriod", ["week", "month"], declarations), "month");
  assert.equal(invoke("scoreMissionPeriod", ["invalid", "invalid"], declarations), "day");
  assert.match(html, /data-score-mission-step="-1"[\s\S]*data-score-mission-step="1"/);
  assert.match(html, /ArrowLeft[\s\S]*ArrowRight[\s\S]*ArrowUp[\s\S]*ArrowDown/);
  assert.match(html, /event(?:o)?\.key === "Home"[\s\S]*"hour"/);
  assert.match(html, /event(?:o)?\.key === "End"[\s\S]*"month"/);
});

test("la región anuncia periodo, carga y resultado, y mantiene controles táctiles", () => {
  assert.match(html, /class="score-missions"[^>]*id="score-missions-/);
  assert.match(html, /role="region"[^>]*aria-labelledby=/);
  assert.match(html, /class="score-mission-period"[^>]*role="group"/);
  assert.match(html, /class="score-mission-period-value"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /class="score-mission-content"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /aria-busy/);
  assert.match(html, /\.score-mission-period button\{[^}]*min-width:24px;[^}]*min-height:24px/);
  assert.match(html, /@media \(max-width:620px\)\{[\s\S]{0,2600}\.score-missions\{/,
    "el panel tiene una regla específica que cabe a 390 px");
});

test("endpoint y enlaces codifican entradas y nunca interpolan HTML inseguro", () => {
  const url = invoke("scoreMissionEndpoint", ["Lucas & Wozniak/GrokBot", "month"],
    'var SCORE_MISSION_PERIODS=["hour","day","week","month"];');
  assert.equal(url,
    "/highscore/history?scope=global&detail=missions&agent=Lucas%20%26%20Wozniak%2FGrokBot&period=month");
  const renderer = functionSource("scoreMissionExplorerHtml");
  assert.match(renderer, /esc\(/);
  const rendered = renderMissionItems({missions:[{id:'M 1&"><script>',display_ref:"0514",status:"resolved",tasks:[]}]});
  assert.match(rendered, /class="score-mission-report" href="\/ticket\?id=M%201%26%22%3E%3Cscript%3E"/);
  assert.match(rendered, /score-mission-report[^>]*aria-label="Abrir informe detallado de 0514"/);
  assert.doesNotMatch(rendered, /<script>/);
  assert.doesNotMatch(renderer, /session_id|token|pid|command_id/i);
});

test("duraciones cerradas, en curso, ausentes e inválidas se muestran honestamente", () => {
  assert.equal(invoke("scoreMissionDuration", [30_000]), "<1 min");
  assert.equal(invoke("scoreMissionDuration", [120_000]), "2 min");
  assert.equal(invoke("scoreMissionDuration", [3_900_000]), "1 h 05 min");
  assert.equal(invoke("scoreMissionDuration", [null]), "—");
  assert.equal(invoke("scoreMissionDuration", [Number.NaN]), "—");
  assert.equal(invoke("scoreMissionDuration", [-10]), "—");
  const renderer = functionSource("scoreMissionItemsHtml");
  assert.match(renderer, /ongoing/);
  assert.match(renderer, /duration_ms/);
});

test("loading, vacío y error son estados explícitos y el error ofrece reintento", () => {
  const loader = functionSource("scoreMissionLoad");
  const renderer = functionSource("scoreMissionExplorerHtml");
  ["loading","ready","empty","error"].forEach((state) => {
    assert.match(loader, new RegExp(`state\\.status[^;]*"${state}"`));
  });
  assert.match(renderer, /data-state="' \+ esc\(state\.status\)/);
  assert.match(renderer, /state\.status === "loading"/);
  assert.match(renderer, /state\.status === "ready"/);
  assert.match(renderer, /state\.status === "empty"/);
  assert.match(renderer, /state\.status === "error"/);
  assert.match(html, /data-score-mission-retry/);
  assert.match(loader, /force/);
  assert.doesNotMatch(loader, /innerHTML\s*=\s*(?:error|err|e)\b/,
    "los errores remotos no se copian crudos al DOM");
});

test("un repintado asíncrono conserva el foco lógico sin mover el scroll", () => {
  const paint = functionSource("scoreMissionPaint");
  assert.match(paint, /document\.activeElement/);
  assert.match(paint, /current\.contains\(active\)/);
  assert.match(paint, /data-score-mission-step/);
  assert.match(paint, /data-score-mission-retry/);
  assert.match(paint, /target\.focus\(\{\s*preventScroll:true\s*\}\)/,
    "flechas y reintento recuperan foco después de loading/ready/error");
});

test("la carga falla cerrada si payload o misiones pertenecen a otra familia", () => {
  const loader = functionSource("scoreMissionLoad");
  assert.match(loader, /expectedKey\s*=\s*claveAgentePeriodo\(a\s*&&\s*a\.agente\)/);
  assert.match(loader, /claveAgentePeriodo\(payload\.agent\)\s*!==\s*expectedKey/);
  assert.match(loader, /payload\.missions\.some[\s\S]*mission[\s\S]*\.agent[\s\S]*!==\s*expectedKey/);
  assert.match(loader, /La respuesta no corresponde al agente solicitado/);
});
