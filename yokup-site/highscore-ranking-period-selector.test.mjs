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

function periodMetrics(period) {
  const rows = [
    { agente:"Alfa", metrics:{
      objectives:{hour:1,day:3}, windows:{hour:0,day:2}, missions:{hour:0,day:1},
      tasks:{hour:1,day:4}, points:{hour:20,day:140}
    }},
    { agente:"Beta", metrics:{
      objectives:{hour:0,day:1}, windows:{hour:2,day:2}, missions:{hour:1,day:1},
      tasks:{hour:1,day:2}, points:{hour:75,day:110}
    }},
    { agente:"Gamma", metrics:{
      objectives:{hour:1,day:2}, windows:{hour:0,day:1}, missions:{hour:0,day:1},
      tasks:{hour:0,day:2}, points:{hour:20,day:100}
    }}
  ];
  const history = {
    periods:{week:{start:"2026-08-31",end:"2026-09-03"}},
    all_days:[
      {day:"2026-08-31",top:[
        {agent:"AlfaMacMini",objectives:1,windows:0,missions:1,tasks:1,points:75},
        {agent:"BetaMBP14",objectives:0,windows:1,missions:0,tasks:0,points:10}
      ]},
      {day:"2026-09-02",top:[
        {agent:"AlfaMBP16",objectives:0,windows:1,missions:0,tasks:1,points:25},
        {agent:"BetaMBP14",objectives:1,windows:0,missions:0,tasks:0,points:20},
        {agent:"GammaMBAAzul",objectives:2,windows:1,missions:1,tasks:2,points:120}
      ]},
      {day:"2026-08-30",top:[{agent:"BetaMBP14",points:999}]}
    ]
  };
  return new Function("rows", "history", "period", `
    var RANKING_PERIODS = ["hour", "day", "week"];
    var datos = { historial:history };
    var window = { ykAgentIdentity:{ base:function (value) {
      return String(value || "").replace(/^(?:Sub|Infra)/, "")
        .replace(/(?:MacMini|Mini|MBP14|MBP16|MBAAzul)$/, "");
    } } };
    function normaliza(value) { return String(value || ""); }
    function claveAgenteCarrera(value) { return normaliza(value).toLowerCase().replace(/[^a-z0-9]/g, ""); }
    function metricaHoraDia(row, field) { return row.metrics[field] || {hour:0,day:0}; }
    ${functionSource("claveAgentePeriodo")}
    ${functionSource("metricasRanking")}
    return rows.map(function (row) { return {agent:row.agente,metrics:metricasRanking(row,period)}; });
  `)(rows, history, period);
}

function periodCycle(start, steps) {
  return new Function("start", "steps", `
    var RANKING_PERIODS = ["hour", "day", "week"], RANKING_PERIOD = start;
    function actualizaPeriodoRanking() {}
    function pintaVistaFiltrada() {}
    ${functionSource("cambiaPeriodoRanking")}
    return steps.map(function (step) { cambiaPeriodoRanking(step); return RANKING_PERIOD; });
  `)(start, steps);
}

function rankingOrder(period, direction = "") {
  const rows = periodMetrics(period).map(row=>({agente:row.agent,periodMetrics:row.metrics}));
  return new Function("rows", "period", "direction", `
    var RANKING_PERIOD = period;
    var ordenTabla = direction ? {campo:"puntos",direccion:direction} : {campo:null,direccion:null};
    function normaliza(value) { return String(value || ""); }
    function ordenadorPrincipal() { return ""; }
    function metricasRanking(row) { return row.periodMetrics; }
    ${functionSource("valorOrden")}
    ${functionSource("listaOrdenada")}
    return listaOrdenada(rows).map(function (row) { return row.agente; });
  `)(rows, period, direction);
}

function storedPeriod(value, throws = false) {
  const localStorage = { getItem() { if (throws) throw new Error("denied"); return value; } };
  return new Function("localStorage", `
    var RANKING_PERIODS = ["hour", "day", "week"], RANKING_PERIOD_KEY = "test";
    ${functionSource("leePeriodoRanking")}
    return leePeriodoRanking();
  `)(localStorage);
}

test("hora, día y semana usan sus puntos factuales y reúnen alias de máquina", () => {
  const hour = periodMetrics("hour"), day = periodMetrics("day"), week = periodMetrics("week");
  assert.deepEqual(hour.map(row=>[row.agent,row.metrics.points]).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])), [
    ["Beta",75],["Alfa",20],["Gamma",20]
  ]);
  assert.deepEqual(day.map(row=>[row.agent,row.metrics.points]).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])), [
    ["Alfa",140],["Beta",110],["Gamma",100]
  ]);
  assert.deepEqual(week.map(row=>[row.agent,row.metrics.points]).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])), [
    ["Gamma",120],["Alfa",100],["Beta",30]
  ]);
  assert.deepEqual(week.find(row=>row.agent==="Alfa").metrics,
    {objectives:1,windows:1,missions:1,tasks:2,points:100},
    "la semana agrega MacMini y MBP16 sin contar el día fuera de rango");
  assert.deepEqual(rankingOrder("hour"),["Beta","Alfa","Gamma"]);
  assert.deepEqual(rankingOrder("day"),["Alfa","Beta","Gamma"]);
  assert.deepEqual(rankingOrder("week"),["Gamma","Alfa","Beta"]);
  assert.deepEqual(rankingOrder("week","asc"),["Beta","Alfa","Gamma"],
    "el orden manual por puntos también lee el periodo activo");
});

test("las flechas recorren un ciclo cerrado HORA ↔ DÍA ↔ SEMANA", () => {
  assert.deepEqual(periodCycle("day", [1,1,1,-1,-1,-1]),
    ["week","hour","day","hour","week","day"]);
  assert.equal(functionSource("rotuloPeriodoRanking").includes('month'),false,
    "Mes no pertenece al selector operativo de la tabla");
});

test("el periodo está visible a la derecha de RANKING y anuncia el cambio", () => {
  const band = html.slice(html.indexOf('id="rankDivider"'), html.indexOf('id="rankingScroll"'));
  assert.ok(band.indexOf('id="rankingToggle"') < band.indexOf('id="rankingPeriod"'));
  assert.match(band, /id="rankingPeriod"[^>]*role="group"[^>]*aria-label="Periodo del ranking: Día"/);
  assert.match(band, /data-ranking-period-step="-1"[^>]*aria-label="[^"]+"[^>]*aria-controls="rankingTable"/);
  assert.match(band, /id="rankingPeriodValue"[^>]*role="status"[^>]*aria-live="polite"[^>]*>DÍA</);
  assert.match(band, /data-ranking-period-step="1"[^>]*aria-label="[^"]+"[^>]*aria-controls="rankingTable"/);
  assert.match(functionSource("actualizaPeriodoRanking"), /table\.dataset\.period = RANKING_PERIOD/);
});

test("ratón y teclado ofrecen el mismo ciclo con límites explícitos", () => {
  assert.match(html, /querySelectorAll\("\[data-ranking-period-step\]"\)/);
  assert.match(html, /getAttribute\("data-ranking-period-step"\)/);
  assert.match(html, /ArrowLeft[\s\S]*ArrowRight[\s\S]*ArrowUp[\s\S]*ArrowDown/);
  assert.match(html, /evento\.key === "Home"[\s\S]*RANKING_PERIOD = "hour"/);
  assert.match(html, /evento\.key === "End"[\s\S]*RANKING_PERIOD = "week"/);
  assert.match(html, /evento\.preventDefault\(\)/);
});

test("la preferencia valida el patrón del producto y el control cabe en móvil", () => {
  assert.match(html, /RANKING_PERIOD_KEY\s*=\s*"yokup\.highscore\.[^"]+"/);
  assert.match(html, /localStorage\.getItem\(RANKING_PERIOD_KEY\)/);
  assert.match(html, /localStorage\.setItem\(RANKING_PERIOD_KEY, RANKING_PERIOD\)/);
  assert.match(html, /RANKING_PERIODS\.indexOf\([^)]*\)\s*>=\s*0[^;]*:\s*"day"/);
  assert.deepEqual([storedPeriod("hour"),storedPeriod("day"),storedPeriod("week")],["hour","day","week"]);
  assert.equal(storedPeriod("month"),"day");
  assert.equal(storedPeriod("garbage"),"day");
  assert.equal(storedPeriod(null),"day");
  assert.equal(storedPeriod("week",true),"day","storage bloqueado no rompe la carga");
  assert.match(html, /@media \(max-width:620px\)\{[\s\S]{0,1800}\.ranking-period\{/);
});
