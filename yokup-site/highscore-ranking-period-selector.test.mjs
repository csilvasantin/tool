import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

await import("./yk-agent-identity.js");
const identity = globalThis.ykAgentIdentity;

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
    timezone:"Europe/Madrid",
    periods:{
      week:{start:"2026-08-31",end:"2026-09-03"},
      month:{start:"2026-09-01",end:"2026-09-30"}
    },
    all_days:[
      {day:"2026-08-31",top:[
        {agent:"Alfa",objectives:1,windows:0,missions:1,tasks:1,points:75},
        {agent:"Beta",objectives:0,windows:1,missions:0,tasks:0,points:10}
      ]},
      {day:"2026-09-02",top:[
        {agent:"Alfa",objectives:0,windows:1,missions:0,tasks:1,points:25},
        {agent:"Beta",objectives:1,windows:0,missions:0,tasks:0,points:20},
        {agent:"Gamma",objectives:2,windows:1,missions:1,tasks:2,points:120}
      ]},
      {day:"2026-09-30",top:[
        {agent:"Alfa",objectives:1,windows:1,missions:0,tasks:1,points:40},
        {agent:"Beta",objectives:0,windows:0,missions:1,tasks:1,points:35}
      ]},
      {day:"2026-08-30",top:[{agent:"Beta",points:999}]},
      {day:"2026-10-01",top:[{agent:"Gamma",points:888}]}
    ]
  };
  return new Function("rows", "history", "period", `
    var RANKING_PERIODS = ["hour", "day", "week", "month"];
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
    var RANKING_PERIODS = ["hour", "day", "week", "month"], RANKING_PERIOD = start;
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
    var RANKING_PERIODS = ["hour", "day", "week", "month"], RANKING_PERIOD_KEY = "test";
    ${functionSource("leePeriodoRanking")}
    return leePeriodoRanking();
  `)(localStorage);
}

function canonicalPeriodRows(rows, period = "week") {
  return new Function("rows", "period", "identity", `
    var window = { ykAgentIdentity:identity };
    var PRIORIDAD_ACTIVIDAD = { objetivos:1, misiones:2, ventanas:3, tareas:4 };
    function normaliza(value) { return String(value == null ? "" : value).trim(); }
    function claveAgenteCarrera(value) {
      return normaliza(value).normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "");
    }
    ${functionSource("hsAgentKey")}
    ${functionSource("claveAgentePeriodo")}
    ${functionSource("colapsaFilasRanking")}
    return colapsaFilasRanking(rows, period);
  `)(structuredClone(rows), period, identity);
}

function consolidatedPeriod(rows, history, period) {
  return new Function("rows", "history", "period", "identity", `
    var RANKING_PERIODS = ["hour", "day", "week", "month"];
    var datos = { historial:history };
    var window = { ykAgentIdentity:identity };
    var PRIORIDAD_ACTIVIDAD = { objetivos:1, misiones:2, ventanas:3, tareas:4 };
    function normaliza(value) { return String(value == null ? "" : value).trim(); }
    function claveAgenteCarrera(value) {
      return normaliza(value).normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "");
    }
    function metricaHoraDia(row, field) {
      return row && row.metrics && row.metrics[field] || {hour:0,day:0};
    }
    ${functionSource("hsAgentKey")}
    ${functionSource("claveAgentePeriodo")}
    ${functionSource("metricasRanking")}
    ${functionSource("colapsaFilasRanking")}
    return colapsaFilasRanking(rows, period).map(function (row) {
      return {
        agent:row.agente,
        metrics:metricasRanking(row, period),
        members:(row.rankingMembers || []).map(function (member) { return member.agente; }),
        machines:(row.maquinas || []).slice(),
        projects:(row.proyectos || []).map(function (project) { return project.id || project.label; })
      };
    });
  `)(structuredClone(rows), structuredClone(history), period, identity);
}

test("hora, día, semana y mes usan sus puntos factuales y límites naturales", () => {
  const hour = periodMetrics("hour"), day = periodMetrics("day"), week = periodMetrics("week");
  const month = periodMetrics("month");
  assert.deepEqual(hour.map(row=>[row.agent,row.metrics.points]).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])), [
    ["Beta",75],["Alfa",20],["Gamma",20]
  ]);
  assert.deepEqual(day.map(row=>[row.agent,row.metrics.points]).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])), [
    ["Alfa",140],["Beta",110],["Gamma",100]
  ]);
  assert.deepEqual(week.map(row=>[row.agent,row.metrics.points]).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])), [
    ["Gamma",120],["Alfa",100],["Beta",30]
  ]);
  assert.deepEqual(month.map(row=>[row.agent,row.metrics.points]).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])), [
    ["Gamma",120],["Alfa",65],["Beta",55]
  ], "MES incluye 1 y 30 de septiembre, pero no 30 de agosto ni 1 de octubre");
  assert.match(html, /var TIME_ZONE = "Europe\/Madrid"/);
  assert.deepEqual(week.find(row=>row.agent==="Alfa").metrics,
    {objectives:1,windows:1,missions:1,tasks:2,points:100},
    "la semana agrega días del mismo agente sin contar el día fuera de rango");
  assert.deepEqual(rankingOrder("hour"),["Beta","Alfa","Gamma"]);
  assert.deepEqual(rankingOrder("day"),["Alfa","Beta","Gamma"]);
  assert.deepEqual(rankingOrder("week"),["Gamma","Alfa","Beta"]);
  assert.deepEqual(rankingOrder("month"),["Gamma","Alfa","Beta"]);
  assert.deepEqual(rankingOrder("week","asc"),["Beta","Alfa","Gamma"],
    "el orden manual por puntos también lee el periodo activo");
});

test("la identidad canónica reúne exactamente los GrokBot del Consejo", () => {
  assert.equal(identity.base("Lucas"), "Lucas");
  assert.equal(identity.base("LucasGrokBot"), "Lucas");
  assert.equal(identity.base("Wozniak"), "Wozniak");
  assert.equal(identity.base("WozniakGrokBot"), "Wozniak");
  assert.notEqual(identity.key(identity.base("LucasGrokBot")), identity.key(identity.base("WozniakGrokBot")));
  assert.equal(identity.base("NeoMacMini"), "Neo", "un agente no relacionado permanece intacto");
});

test("las flechas recorren un ciclo cerrado HORA ↔ DÍA ↔ SEMANA ↔ MES", () => {
  assert.deepEqual(periodCycle("day", [1,1,1,1,-1,-1,-1,-1]),
    ["week","month","hour","day","hour","month","week","day"]);
  const label = new Function(`${functionSource("rotuloPeriodoRanking")}; return rotuloPeriodoRanking("month");`)();
  assert.equal(label,"Mes");
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
  assert.match(html, /evento\.key === "End"[\s\S]*RANKING_PERIOD = "month"/);
  assert.match(html, /evento\.preventDefault\(\)/);
});

test("la preferencia valida el patrón del producto y el control cabe en móvil", () => {
  assert.match(html, /RANKING_PERIOD_KEY\s*=\s*"yokup\.highscore\.[^"]+"/);
  assert.match(html, /localStorage\.getItem\(RANKING_PERIOD_KEY\)/);
  assert.match(html, /localStorage\.setItem\(RANKING_PERIOD_KEY, RANKING_PERIOD\)/);
  assert.match(html, /RANKING_PERIODS\.indexOf\([^)]*\)\s*>=\s*0[^;]*:\s*"day"/);
  assert.deepEqual([storedPeriod("hour"),storedPeriod("day"),storedPeriod("week"),storedPeriod("month")],
    ["hour","day","week","month"]);
  assert.equal(storedPeriod("garbage"),"day");
  assert.equal(storedPeriod(null),"day");
  assert.equal(storedPeriod("week",true),"day","storage bloqueado no rompe la carga");
  assert.match(html, /@media \(max-width:620px\)\{[\s\S]{0,1800}\.ranking-period\{/);
  assert.match(html, /\.ranking-period button\{width:24px;height:24px;/,
    "el área táctil de escritorio cumple al menos 24×24 px");
  assert.match(html, /@media \(max-width:620px\)\{[\s\S]{0,1800}\.ranking-period button\{width:24px;height:24px;/,
    "la vista móvil no reduce el área táctil por debajo de 24×24 px");
});

test("los cuatro periodos conservan cada equipo y normalizan alias físicos", () => {
  const rows = [
    {agente:"NeoMacMini",base:"Neo",suffix:"MacMini",maquinas:["Mac Mini"],maquinasVivas:["Mac Mini"],
      proyecto:"admira.live",runtime:"Codex",actividadAt:90,total:15},
    {agente:"NeoMBP16",base:"Neo",suffix:"MBP16",maquinas:["MacBook Pro 16"],maquinasVivas:[],
      proyecto:"yokup.com",runtime:"OpenCode",actividadAt:40,total:15},
    {agente:"OráculoMacMini",base:"Oraculo",suffix:"MacMini",maquinas:["Mac Mini"],maquinasVivas:[],
      proyecto:"yokup.com",runtime:"Codex",actividadAt:60,total:25},
    {agente:"OracleMBP16",base:"Oraculo",suffix:"MBP16",maquinas:["MacBook Pro 16"],maquinasVivas:["MacBook Pro 16"],
      proyecto:"admira.live",runtime:"Codex",actividadAt:80,total:25},
    {agente:"Agente Smith Azul",base:"Smith",suffix:"MBAAzul",maquinas:["MacBook Air Azul"],maquinasVivas:[],
      proyecto:"xpace.os",runtime:"Grok",actividadAt:30,total:30},
    {agente:"CypherDGX",base:"Smith",suffix:"DGX",maquinas:["DGX Spark"],maquinasVivas:["DGX Spark"],
      proyecto:"xpace.os",runtime:"OpenCode",actividadAt:70,total:30},
    {agente:"MorfeoMBP14",base:"Morfeo",suffix:"MBP14",maquinas:["MacBookPro14"],maquinasVivas:[],
      proyecto:"admira.live",runtime:"Claude",actividadAt:20,total:45},
    {agente:"MorpheusMBARosa",base:"Morfeo",suffix:"MBARosa",maquinas:["MacBook Air Rosa"],maquinasVivas:[],
      proyecto:"admira.live",runtime:"Claude",actividadAt:10,total:45},
    {agente:"MorfeoMBA16",base:"Morfeo",suffix:"MBA16",maquinas:["MacBookAir16plata"],maquinasVivas:[],
      proyecto:"admira.live",runtime:"Claude",actividadAt:5,total:45}
  ];
  const summarize = (input, period) => canonicalPeriodRows(input, period).map((row) => ({
    agent:identity.key(row.agente),
    machines:[...new Set([...(row.maquinas || []), ...(row.maquinasVivas || [])])].sort()
  })).sort((a,b) => a.agent.localeCompare(b.agent));
  const expectedAgents = ["morfeomba16","morfeombarosa","morfeombp14","neomacmini","neombp16","oraculomacmini","oraculombp16","smithdgx","smithmbaazul"].sort();
  ["hour","day","week","month"].forEach((period) => {
    const forward = summarize(rows, period), reverse = summarize([...rows].reverse(), period);
    assert.deepEqual(forward.map(row => row.agent), expectedAgents,
      `${period} mantiene las nueve identidades físicas distintas`);
    assert.deepEqual(reverse, forward, `${period} no depende del orden del feed`);
    assert.deepEqual(forward.find(row => row.agent === "neomacmini").machines,
      ["Mac Mini"]);
  });
  assert.match(functionSource("listaVisible"), /colapsaFilasRanking\(lista,\s*RANKING_PERIOD\)/,
    "el colapso ocurre antes de filtrar, ordenar y pintar");
});

test("Lucas y Wozniak conservan GrokBot separado y deduplican su fila repetida", () => {
  const metric = (objectives, windows, missions, tasks, points) => ({objectives,windows,missions,tasks,points});
  const rows = [
    {agente:"Lucas",base:"Lucas",suffix:"",maquinas:["Mac Mini"],maquinasVivas:[],proyecto:"cine.example",
      proyectoId:"cine",proyectoUrl:"https://cine.example",proyectoOrigen:"declarado",proyectoPeso:2,proyectoAt:20,
      metrics:{objectives:{hour:1,day:2},windows:{hour:1,day:1},missions:{hour:0,day:1},tasks:{hour:1,day:2},points:{hour:40,day:80}}},
    {agente:"LucasGrokBot",base:"Lucas",suffix:"GrokBot",maquinas:["GrokBot"],maquinasVivas:["GrokBot"],proyecto:"robot.example",
      proyectoId:"robot",proyectoUrl:"https://robot.example",proyectoOrigen:"actividad",proyectoPeso:1,proyectoAt:30,
      metrics:{objectives:{hour:2,day:3},windows:{hour:0,day:2},missions:{hour:1,day:1},tasks:{hour:1,day:2},points:{hour:60,day:120}}},
    {agente:"LucasGrokBot",base:"Lucas",suffix:"GrokBot",maquinas:["GrokBot"],maquinasVivas:["GrokBot"],proyecto:"robot.example",
      proyectoId:"robot",proyectoUrl:"https://robot.example",proyectoOrigen:"actividad",proyectoPeso:1,proyectoAt:30,
      metrics:{objectives:{hour:2,day:3},windows:{hour:0,day:2},missions:{hour:1,day:1},tasks:{hour:1,day:2},points:{hour:60,day:120}}},
    {agente:"Wozniak",base:"Wozniak",suffix:"",maquinas:["MacBookPro14"],maquinasVivas:[],proyecto:"apple.example",
      proyectoId:"apple",proyectoUrl:"https://apple.example",proyectoOrigen:"censo",proyectoPeso:1,proyectoAt:10,
      metrics:{objectives:{hour:0,day:1},windows:{hour:1,day:2},missions:{hour:0,day:0},tasks:{hour:1,day:2},points:{hour:25,day:65}}},
    {agente:"WozniakGrokBot",base:"Wozniak",suffix:"GrokBot",maquinas:["GrokBot"],maquinasVivas:[],proyecto:"robot.example",
      proyectoId:"robot",proyectoUrl:"https://robot.example",proyectoOrigen:"actividad",proyectoPeso:2,proyectoAt:40,
      metrics:{objectives:{hour:1,day:2},windows:{hour:0,day:1},missions:{hour:1,day:1},tasks:{hour:0,day:1},points:{hour:45,day:95}}},
    {agente:"NeoMacMini",base:"Neo",suffix:"MacMini",maquinas:["Mac Mini"],maquinasVivas:[],proyecto:"matrix.example",
      proyectoId:"matrix",proyectoUrl:"https://matrix.example",proyectoOrigen:"censo",proyectoPeso:1,proyectoAt:5,
      metrics:{objectives:{hour:1,day:1},windows:{hour:0,day:0},missions:{hour:0,day:0},tasks:{hour:0,day:0},points:{hour:20,day:20}}}
  ];
  const history = {
    timezone:"Europe/Madrid",
    periods:{week:{start:"2026-09-01",end:"2026-09-07"},month:{start:"2026-09-01",end:"2026-09-30"}},
    all_days:[
      {day:"2026-08-31",top:[{agent:"LucasGrokBot",...metric(9,9,9,9,900)}]},
      {day:"2026-09-01",top:[
        {agent:"Lucas",...metric(1,1,0,1,30)},{agent:"LucasGrokBot",...metric(2,0,1,1,45)},
        {agent:"Wozniak",...metric(0,1,0,1,25)},{agent:"WozniakGrokBot",...metric(1,0,1,0,35)},
        {agent:"NeoMacMini",...metric(1,0,0,0,20)}
      ]},
      {day:"2026-09-30",top:[
        {agent:"LucasGrokBot",...metric(1,1,0,1,25)},
        {agent:"Wozniak",...metric(0,0,1,1,30)},{agent:"NeoMacMini",...metric(0,1,0,0,10)}
      ]},
      {day:"2026-10-01",top:[{agent:"WozniakGrokBot",...metric(9,9,9,9,800)}]}
    ]
  };
  const byAgent = (period, input = rows) => Object.fromEntries(consolidatedPeriod(input, history, period)
    .map((row) => [row.agent,row]));
  const hour = byAgent("hour"), day = byAgent("day"), week = byAgent("week"), month = byAgent("month");
  assert.deepEqual(hour.LucasGrokBot.metrics, metric(2,0,1,1,60));
  assert.deepEqual(day.LucasGrokBot.metrics, metric(3,2,1,2,120));
  assert.deepEqual(week.LucasGrokBot.metrics, metric(2,0,1,1,45));
  assert.deepEqual(month.LucasGrokBot.metrics, metric(3,1,1,2,70));
  assert.deepEqual(hour.WozniakGrokBot.metrics, metric(1,0,1,0,45));
  assert.deepEqual(day.WozniakGrokBot.metrics, metric(2,1,1,1,95));
  assert.deepEqual(week.WozniakGrokBot.metrics, metric(1,0,1,0,35));
  assert.deepEqual(month.WozniakGrokBot.metrics, metric(1,0,1,0,35));
  assert.equal(month.LucasMacMini.metrics.points,0,"histórico sin máquina no se adjudica al Mac Mini");
  assert.deepEqual(month.NeoMacMini.metrics, metric(1,1,0,0,30));
  assert.deepEqual(hour.LucasGrokBot.members, ["LucasGrokBot"]);
  assert.deepEqual(hour.LucasGrokBot.machines, ["GrokBot"]);
  assert.deepEqual(hour.LucasGrokBot.projects, ["robot"]);
  assert.deepEqual(consolidatedPeriod([...rows].reverse(), history, "month"),
    consolidatedPeriod(rows, history, "month"), "el resultado completo es estable con el feed invertido");
});
