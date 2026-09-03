import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

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
    function metricaHoraDia(row) { return row.metric; }
    function normaliza(value) { return String(value || ""); }
    ${functionSource("clasificacionPodio")}
    return clasificacionPodio(rows).map(function (row) { return row.agente; });
  `)(rows, period);
}

test("el podio arranca por día y permite escoger día u hora junto a la bandera", () => {
  assert.match(html, /var PODIUM_PERIOD = "day"/);
  assert.match(html, /class="podio-period" role="group" aria-label="Periodo del ranking del podio"/);
  assert.match(html, /data-podium-period="day"/);
  assert.match(html, /data-podium-period="hour"/);
  assert.match(html, /\.podio-period\{[^}]*right:9%;top:7%/s);
});

test("Día ordena por el total diario y Hora por los puntos de la hora", () => {
  assert.deepEqual(ranking("day"), ["Alfa", "Gamma", "Beta"]);
  assert.deepEqual(ranking("hour"), ["Beta", "Alfa", "Gamma"]);
});

test("cambiar el periodo repinta sólo el podio con la lista filtrada actual", () => {
  assert.match(html, /PODIUM_PERIOD = periodo\.getAttribute\("data-podium-period"\) === "hour" \? "hour" : "day"/);
  assert.match(html, /pintaPodio\(listaCache\.slice\(0, 3\), listaCache\)/);
  assert.doesNotMatch(functionSource("clasificacionPodio"), /pintaTabla|listaCache\s*=/);
});
