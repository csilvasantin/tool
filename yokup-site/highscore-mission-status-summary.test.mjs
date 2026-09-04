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

function summary(missions) {
  return new Function("missions", `
    function normaliza(value) { return String(value == null ? "" : value).trim(); }
    ${functionSource("scoreMissionStatusBucket")}
    ${functionSource("scoreMissionSummary")}
    return scoreMissionSummary(missions);
  `)(missions);
}

function summaryHtml(payload, status, agent = "Lucas", period = "day") {
  return new Function("payload", "status", "agent", "period", `
    function normaliza(value) { return String(value == null ? "" : value).trim(); }
    function esc(value) { return String(value == null ? "" : value).replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
    function rotuloPeriodoRanking(value) { return ({hour:"Hora",day:"Día",week:"Semana",month:"Mes"})[value] || "Día"; }
    ${functionSource("scoreMissionStatusBucket")}
    ${functionSource("scoreMissionSummary")}
    ${functionSource("scoreMissionCount")}
    ${functionSource("scoreMissionSummaryHtml")}
    return scoreMissionSummaryHtml(payload,status,agent,period);
  `)(payload, status, agent, period);
}

test("mapea estados canónicos, aliases y desconocidos sin afirmar cierres", () => {
  const bucket = new Function(`function normaliza(value) { return String(value == null ? "" : value).trim(); }
    ${functionSource("scoreMissionStatusBucket")}; return scoreMissionStatusBucket;`)();
  for (const value of ["open", "pending"]) assert.equal(bucket(value), "open", value);
  for (const value of ["in_progress", "IN PROGRESS", "doing", "active"]) assert.equal(bucket(value), "in_progress", value);
  for (const value of ["resolved", "done", "completed", "cancelled", "NO-APLICA"]) assert.equal(bucket(value), "closed", value);
  for (const value of ["desconocido", ""]) assert.equal(bucket(value), "unknown", value);
});

test("total, abiertas, en curso y cerradas son estables y no duplican misión", () => {
  const missions = [
    {id:"o1",status:"open"}, {id:"o2",status:"pending"}, {id:"o3",status:"future"},
    {id:"r1",status:"in_progress"}, {id:"r2",status:"doing"}, {id:"r3",status:"active"},
    {id:"c1",status:"resolved"}, {id:"c2",status:"done"}, {id:"c3",status:"completed"},
    {id:"c4",status:"cancelled"}, {id:"c5",status:"no_aplica"},
    {id:"same",status:"open"}, {id:"same",status:"done"}
  ];
  const expected = {total:12,open:3,in_progress:3,closed:6,unknown:1};
  assert.deepEqual(summary(missions), expected);
  assert.deepEqual(summary([...missions].reverse()), expected, "el orden del feed no cambia el resumen");
  assert.equal(expected.total, expected.open + expected.in_progress + expected.closed);
});

test("HORA, DÍA, SEMANA y MES cuentan exclusivamente su payload", () => {
  const byPeriod = {
    hour:[{id:"h-open",status:"open"}],
    day:[{id:"d-run",status:"active"},{id:"d-done",status:"done"}],
    week:[{id:"w-open",status:"pending"},{id:"w-run",status:"doing"},{id:"w-closed",status:"resolved"}],
    month:[{id:"m1",status:"open"},{id:"m2",status:"in_progress"},{id:"m3",status:"done"},{id:"m4",status:"completed"}]
  };
  assert.deepEqual(summary(byPeriod.hour),{total:1,open:1,in_progress:0,closed:0,unknown:0});
  assert.deepEqual(summary(byPeriod.day),{total:2,open:0,in_progress:1,closed:1,unknown:0});
  assert.deepEqual(summary(byPeriod.week),{total:3,open:1,in_progress:1,closed:1,unknown:0});
  assert.deepEqual(summary(byPeriod.month),{total:4,open:1,in_progress:1,closed:2,unknown:0});
  for (const [period, missions] of Object.entries(byPeriod)) {
    const out = summaryHtml({missions,period,agent:"Lucas"},"ready","Lucas",period);
    assert.match(out,new RegExp(`aria-label="[^"]*${period === "hour" ? "hora" : period === "day" ? "día" : period === "week" ? "semana" : "mes"}`,"i"));
  }
});

test("singular y plural son visibles y los cuatro valores tienen clases inequívocas", () => {
  const singular = summaryHtml({missions:[{id:"one",status:"open"}]},"ready");
  assert.match(singular,/class="score-mission-summary-total"[^>]*>1 misión</);
  assert.match(singular,/class="score-mission-summary-open"[^>]*>1 abierta</);
  assert.match(singular,/class="score-mission-summary-running"[^>]*>0 en curso</);
  assert.match(singular,/class="score-mission-summary-closed"[^>]*>0 cerradas</);
  const plural = summaryHtml({missions:[{id:"a",status:"done"},{id:"b",status:"resolved"}]},"ready");
  assert.match(plural,/class="score-mission-summary-total"[^>]*>2 misiones</);
  assert.match(plural,/class="score-mission-summary-closed"[^>]*>2 cerradas</);
});

test("idle, loading, vacío y error mantienen una salida honesta y anunciable", () => {
  const idle = summaryHtml(null,"idle"), loading = summaryHtml(null,"loading");
  const empty = summaryHtml({missions:[]},"empty"), error = summaryHtml(null,"error");
  assert.match(idle,/Resumen pendiente/i);
  assert.match(loading,/Cargando/i);
  assert.match(error,/No disponible|No se pudo/i);
  for (const className of ["total","open","running","closed"]) {
    assert.match(empty,new RegExp(`score-mission-summary-${className}[^>]*>0`));
  }
  assert.match(summaryHtml({missions:[{id:"u",status:"future"}]},"ready"),/1 sin estado reconocido/i);
});

test("el resumen vive junto al nombre, anuncia cambios y cabe en el encabezado móvil", () => {
  const explorer = functionSource("scoreMissionExplorerHtml");
  assert.match(explorer,/summary\s*=\s*scoreMissionSummaryHtml/);
  assert.match(explorer,/class="score-mission-heading"[\s\S]*<h3 class="score-mission-title"[\s\S]*' \+ summary \+ '<\/div>'/);
  assert.match(html,/class="score-mission-summary"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(html,/\.score-mission-heading\{[^}]*min-width:0/);
  assert.match(html,/\.score-mission-summary\{[^}]*flex-wrap:wrap/);
  assert.match(html,/@media \(max-width:620px\)\{[\s\S]{0,3500}\.score-mission-summary\{/,
    "la regla móvil incluye el resumen para una anchura de 390 px");
});

test("flechas y caché repintan el resumen del agente y periodo correctos", () => {
  const load = functionSource("scoreMissionLoad"), paint = functionSource("scoreMissionPaint");
  assert.match(load,/cached && !force[\s\S]*scoreMissionPaint\(a,\s*progressId\)/);
  assert.match(load,/payload\.period\s*!==\s*selected/);
  assert.match(load,/claveAgentePeriodo\(payload\.agent\)\s*!==\s*expectedKey/);
  assert.match(load,/payload\.missions\.some[\s\S]*mission[\s\S]*\.agent[\s\S]*!==\s*expectedKey/);
  assert.match(load,/state\.periods\[selected\]\s*=\s*payload/);
  assert.match(paint,/scoreMissionExplorerHtml\(a,\s*progressId\)/,
    "cada respuesta y cada hit de caché reconstruyen el encabezado del mismo explorador");
  assert.match(html,/data-score-mission-step="-1"[\s\S]*data-score-mission-step="1"/);
});
