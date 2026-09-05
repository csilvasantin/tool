import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

await import("./yk-agent-identity.js");
const html = readFileSync(new URL("./highscore.html", import.meta.url), "utf8");

function functionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const brace = html.indexOf("{", start);
  let depth = 0, quote = "", escaped = false;
  for (let i = brace; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`${name} incompleta`);
}

function ranking(period) {
  const rows = [
    {agente:"Alfa", metric:{hour:5, day:100}},
    {agente:"Beta", metric:{hour:20, day:90}},
    {agente:"Gamma", metric:{hour:5, day:100}},
  ];
  return new Function("rows", "period", `
    var PODIUM_PERIOD = period;
    var window = {ykAgentIdentity:{base:function (value) { return String(value || ""); }}};
    var datos = {historial:{
      periods:{week:{start:"2026-08-31",end:"2026-09-03"},month:{start:"2026-09-01",end:"2026-09-03"}},
      all_days:[
        {day:"2026-08-31",top:[{agent:"Alfa",points:500}]},
        {day:"2026-09-01",top:[{agent:"Alfa",points:30},{agent:"Beta",points:80},{agent:"Gamma",points:10}]},
        {day:"2026-09-02",top:[{agent:"Alfa",points:20},{agent:"Beta",points:5},{agent:"Gamma",points:100}]},
        {day:"2026-09-03",top:[{agent:"Alfa",points:100},{agent:"Beta",points:90},{agent:"Gamma",points:100}]}
      ]
    }};
    function metricaHoraDia(row) { return row.metric; }
    function normaliza(value) { return String(value || ""); }
    function claveAgenteCarrera(value) { return normaliza(value).toLowerCase().replace(/[^a-z0-9]/g, ""); }
    ${functionSource("claveAgentePeriodo")}
    ${functionSource("puntosPodioPeriodo")}
    ${functionSource("clasificacionPodio")}
    return clasificacionPodio(rows).map(function (row) { return row.agente; });
  `)(rows, period);
}

test("Highscore arranca por día y comparte el selector de cabecera con récord y podio", () => {
  assert.match(html, /var PODIUM_PERIOD = "day"/);
  assert.match(html, /id="highscorePeriod" role="group" aria-label="Periodo de Highscore: Día"/);
  assert.match(html, /data-highscore-period-step="-1"/);
  assert.match(html, /data-highscore-period-step="1"/);
  assert.match(functionSource("cambiaPeriodoHighscore"), /\["hour",\s*"day",\s*"week",\s*"month"\]/);
  assert.doesNotMatch(html, /data-podium-period="/);
  assert.match(html, /\.podio-total\{[^}]*top:4%;width:19\.8%/s);
});

test("cada periodo ordena por sus puntos naturales", () => {
  assert.deepEqual(ranking("day"), ["Alfa", "Gamma", "Beta"]);
  assert.deepEqual(ranking("hour"), ["Beta", "Alfa", "Gamma"]);
  assert.deepEqual(ranking("week"), ["Alfa", "Gamma", "Beta"]);
  assert.deepEqual(ranking("month"), ["Gamma", "Beta", "Alfa"]);
});

test("cambiar el periodo repinta récord y podio sin alterar ranking ni carrera", () => {
  const change = functionSource("cambiaPeriodoHighscore");
  assert.match(change, /pintaRecordDiario\(\)/);
  assert.match(change, /pintaPodio\(listaCache\.slice\(0,\s*3\),\s*listaCache\)/);
  assert.doesNotMatch(change, /RANKING_PERIOD\s*=|actualizaCarreraPodio|pintaTabla/);
  assert.doesNotMatch(functionSource("clasificacionPodio"), /pintaTabla|listaCache\s*=/);
});

test("semana y mes usan el histórico real por agente y abren su mismo periodo", () => {
  assert.match(html, /\/highscore\/history\?scope=global/);
  assert.match(functionSource("puntosPodioPeriodo"), /history\.all_days/);
  assert.match(html, /PODIUM_PERIOD === "week" \|\| PODIUM_PERIOD === "month" \? PODIUM_PERIOD : "today"/);
});

test("semana y mes reúnen alias de la misma máquina y separan equipos", () => {
  const rows = [
    {agente:"MorfeoMacMini", metric:{hour:0, day:0}},
    {agente:"MorfeoMBA16", metric:{hour:0, day:0}},
    {agente:"OraculoMacMini", metric:{hour:0, day:0}},
  ];
  const result = new Function("rows", "identity", `
    var PODIUM_PERIOD = "week";
    var window = {ykAgentIdentity:identity};
    var datos = {historial:{periods:{week:{start:"2026-08-31",end:"2026-09-03"}},all_days:[
      {day:"2026-08-31",top:[{agent:"MorfeoMini",points:170},{agent:"MorfeoMBA16",points:50}]},
      {day:"2026-09-01",top:[{agent:"MorfeoMacMini",points:540},{agent:"OraculoMini",points:85}]}
    ]}};
    function metricaHoraDia() { return {hour:0,day:0}; }
    function normaliza(value) { return String(value || ""); }
    function claveAgenteCarrera(value) { return normaliza(value).toLowerCase().replace(/[^a-z0-9]/g, ""); }
    ${functionSource("claveAgentePeriodo")}
    ${functionSource("puntosPodioPeriodo")}
    return rows.map(function (row) { return puntosPodioPeriodo(row); });
  `)(rows, globalThis.ykAgentIdentity);
  assert.deepEqual(result, [710, 50, 85]);
});
