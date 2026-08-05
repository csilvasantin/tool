import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// La hora sólo es factual cuando D1 aporta una referencia fiable de hace 60
// minutos. Sin ella la pareja es —/TOTAL: no se disfraza el acumulado diario de
// ritmo horario.
const source = await readFile(new URL("./highscore.html", import.meta.url), "utf8");
const identitySource = await readFile(new URL("./yk-agent-identity.js", import.meta.url), "utf8");
const identityContext = vm.createContext({});
vm.runInContext(identitySource, identityContext);
const identity = identityContext.ykAgentIdentity;

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const brace = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`función ${name} incompleta`);
}

function hourlyApi(hourly, identityApi = identity) {
  const datos = { actividadMeta:{ hourly } };
  return new Function("datos", "window", [
    functionSource("normaliza"), functionSource("claveHoraria"), functionSource("identidadFamiliaHoraria"),
    functionSource("filasFamiliaHoraria"), functionSource("tendenciaHoraria"), functionSource("puntuacionHoraria"),
    "return { trend:tendenciaHoraria, score:puntuacionHoraria };"
  ].join("\n"))(datos, { ykAgentIdentity:identityApi });
}

function esc(value) {
  return String(value == null ? "" : value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
}

function renderPuntos(hourly, row) {
  const datos = { actividadMeta:{ hourly } };
  return new Function("datos", "window", "esc", [
    functionSource("normaliza"), functionSource("claveHoraria"), functionSource("identidadFamiliaHoraria"),
    functionSource("filasFamiliaHoraria"), functionSource("tendenciaHoraria"), functionSource("puntuacionHoraria"),
    functionSource("estadoPuntosDiarios"), functionSource("tituloPuntosDiarios"), functionSource("parejaPuntosHtml"),
    functionSource("puntosHtml"), "return puntosHtml;"
  ].join("\n"))(datos, { ykAgentIdentity:identity }, esc)(row, "hourly-detail");
}

// ── el cálculo exacto sigue siendo el mismo cuando hay referencia ────────────

test("con referencia fiable calcula el delta exacto de la ventana de 60 minutos", () => {
  const api = hourlyApi({ window_ms:3600000, scores:[
    { agent:"OraculoMacMini", current:75, reference:55, reliable:true, trend:"up" },
  ] });
  const row = { agente:"OraculoMacMini", total:75 };
  assert.deepEqual({ ...api.score(row) }, {
    available:true, basis:"ventana", points:20, state:"up", current:75, reference:55,
  });
  assert.deepEqual(row, { agente:"OraculoMacMini", total:75 }, "el cálculo no muta el total diario");
});

test("la familia main sub infra suma deltas positivos sin cancelar avances", () => {
  const hourly = { window_ms:3600000, scores:[
    { agent:"Oraculo", machine:"Mac Mini", current:60, reference:60, reliable:true, reference_at:1000 },
    { agent:"SubOraculoMacMini", machine:"MacMini", current:725, reference:710, reliable:true, reference_at:1100 },
    { agent:"InfraOraculo", machine:"admira-macmini", current:370, reference:390, reliable:true, reference_at:1200 },
    { agent:"OraculoMBP16", machine:"MacBook Pro 16", current:500, reference:100, reliable:true, reference_at:1300 },
    { agent:"NeoMacMini", machine:"Mac Mini", current:900, reference:100, reliable:true, reference_at:1400 },
  ] };
  const row = { agente:"OraculoMacMini", base:"Oraculo", suffix:"MacMini", total:1155, maquinas:["Mac Mini"] };
  assert.deepEqual({ ...hourlyApi(hourly).trend(row) }, {
    state:"up", current:1155, reference:1160, points:15, referenceAt:1200, reliable:true,
  });
  assert.deepEqual({ ...hourlyApi(hourly).score(row) }, {
    available:true, basis:"ventana", points:15, state:"up", current:1155, reference:1160,
  });
});

test("la familia horaria nunca mezcla la misma persona en otro equipo", () => {
  const api = hourlyApi({ window_ms:3600000, scores:[
    { agent:"OraculoMacMini", machine:"Mac Mini", current:10, reference:5, reliable:true },
    { agent:"SubOraculoMBP16", machine:"MacBook Pro 16", current:400, reference:0, reliable:true },
  ] });
  assert.deepEqual({ ...api.score({ agente:"OraculoMacMini", base:"Oraculo", suffix:"MacMini", total:10 }) }, {
    available:true, basis:"ventana", points:5, state:"up", current:10, reference:5,
  });
});

test("un dato fiable estacionario o decreciente muestra cero, no el total", () => {
  const stationary = hourlyApi({ window_ms:3600000, scores:[
    { agent:"NeoMacMini", current:20, reference:20, reliable:true, trend:"same" },
  ] }).score({ agente:"NeoMacMini", total:20 });
  assert.deepEqual({ ...stationary },
    { available:true, basis:"ventana", points:0, state:"same", current:20, reference:20 });

  const decreasing = hourlyApi({ window_ms:3600000, scores:[
    { agent:"NeoMacMini", current:15, reference:20, reliable:true, trend:"same" },
  ] }).score({ agente:"NeoMacMini", total:15 });
  assert.deepEqual({ ...decreasing },
    { available:true, basis:"ventana", points:0, state:"same", current:15, reference:20 });
});

// ── SIN referencia: hora desconocida, total diario intacto ──────────────────

test("sin referencia fiable la puntuación por hora no reutiliza el total diario", () => {
  const casos = [
    { window_ms:3599999, scores:[{ agent:"A", current:99, reference:10, reliable:true, trend:"up" }] },
    { window_ms:3600000, scores:[{ agent:"A", current:99, reference:10, reliable:false, trend:"up" }] },
    { window_ms:3600000, scores:[{ agent:"A", current:null, reference:10, reliable:true, trend:"up" }] },
    { window_ms:3600000, scores:[] },
    undefined,
  ];
  for (const hourly of casos) {
    assert.deepEqual({ ...hourlyApi(hourly).score({ agente:"A", total:99 }) }, {
      available:false, basis:"unavailable", points:null, state:"same", current:99, reference:null,
    }, `caso ${JSON.stringify(hourly)}`);
  }
});

test("un miembro de la familia sin dato fiable invalida la cifra horaria", () => {
  const api = hourlyApi({ window_ms:3600000, scores:[
    { agent:"OraculoMacMini", machine:"Mac Mini", current:60, reference:60, reliable:true },
    { agent:"SubOraculoMacMini", machine:"Mac Mini", current:725, reference:710, reliable:false },
  ] });
  const row = { agente:"OraculoMacMini", base:"Oraculo", suffix:"MacMini", total:785 };
  assert.equal(api.trend(row).reliable, false);
  assert.deepEqual({ ...api.score(row) }, {
    available:false, basis:"unavailable", points:null, state:"same", current:785, reference:null,
  });
});

test("un agente a cero sin referencia da hora desconocida", () => {
  assert.deepEqual({ ...hourlyApi({ window_ms:3600000, scores:[] }).score({ agente:"A", total:0 }) }, {
    available:false, basis:"unavailable", points:null, state:"same", current:0, reference:null,
  });
});

// ── la cifra vive bajo el total, y la franja ya no existe ────────────────────

test("la franja «Puntuación por hora» se retiró de la fila desplegada", () => {
  assert.doesNotMatch(source, /hourly-points/);
  assert.doesNotMatch(source, /Sin referencia factual fiable/);
  assert.doesNotMatch(source, /resumenHora/);
  assert.match(source, /return '<div class="progression"/);
});

test("la columna PUNTOS pinta hora/día en una línea y con una sola base visual", () => {
  const up = renderPuntos({ window_ms:3600000, scores:[
    { agent:"OraculoMacMini", current:75, reference:55, reliable:true, trend:"up" },
  ] }, { agente:"OraculoMacMini", total:75, haLatido:true,
    tendenciaDiaria:{state:"up",current:75,previous:55} });
  assert.match(up, /score-number score-hour">20<\/span>[\s\S]*score-separator[^>]*>\/<[\s\S]*score-number score-day daily-up">75<\/span>/);
  assert.match(up, /aria-label="20 puntos en los últimos 60 minutos, 75 puntos hoy\./);

  const arranque = renderPuntos({ window_ms:3600000, scores:[] },
    { agente:"SinDato", total:48, haLatido:true });
  assert.match(arranque, /score-number score-hour">—<\/span>[\s\S]*score-number score-day daily-initial">48<\/span>/,
    "sin referencia el formato es —/48 y el diario nace neutro");
  assert.match(arranque, /Sin referencia D1 fiable/);
  assert.match(arranque, /aria-label="Sin referencia fiable para los últimos 60 minutos, 48 puntos hoy/);

  const ausente = renderPuntos({ window_ms:3600000, scores:[] },
    { agente:"SinDato", total:0, haLatido:false });
  assert.match(ausente, /score-number score-hour">—<\/span>[\s\S]*score-number score-day daily-initial">—<\/span>/,
    "ausencia y cero real no son equivalentes");
});

test("el desplegable sigue contraído y el podio comparte hora/día", () => {
  assert.match(source, /<button class="score-toggle" type="button" aria-expanded="false" aria-controls="' \+ esc\(progressId\)/);
  assert.match(source, /<tr class="score-progress' \+ alterna \+ '" id="' \+ esc\(progressId\) \+ '" hidden><td colspan="9">' \+ progresionHtml\(a\)/);
  assert.match(source, /<div class="pts">' \+ parejaPuntosHtml\(a, dailyValue\) \+ '<\/div>/);
});

test("hora y día comparten tamaño, peso y línea base; el diario tiene tres estados sin animación", () => {
  assert.match(source, /\.score-pair\{[^}]*align-items:baseline/s);
  assert.match(source, /\.score-number,\.score-separator\{font:inherit;font-size:inherit;font-weight:inherit;line-height:inherit;vertical-align:baseline\}/);
  assert.match(source, /\.score-day\.daily-up\{color:var\(--good\)/);
  assert.match(source, /\.score-day\.daily-down\{color:var\(--warn\)\}/);
  assert.match(source, /\.score-day\.daily-initial\{color:var\(--mut\)\}/);
});
