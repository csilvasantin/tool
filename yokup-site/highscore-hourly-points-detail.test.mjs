import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./highscore.html", import.meta.url), "utf8");

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

function hourlyApi(hourly) {
  const datos = { actividadMeta:{ hourly } };
  return new Function("datos", [
    functionSource("normaliza"), functionSource("tendenciaHoraria"), functionSource("puntuacionHoraria"),
    "return { trend:tendenciaHoraria, score:puntuacionHoraria };"
  ].join("\n"))(datos);
}

function esc(value) {
  return String(value == null ? "" : value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
}

function renderHourly(hourly, row) {
  const datos = { actividadMeta:{ hourly } };
  const normalizaProgresion = () => ({ linked:false, origin:"", label:"Resumen", stages:[] });
  return new Function("datos", "esc", "normalizaProgresion", [
    functionSource("normaliza"), functionSource("tendenciaHoraria"), functionSource("puntuacionHoraria"),
    functionSource("progresionHtml"), "return progresionHtml;"
  ].join("\n"))(datos, esc, normalizaProgresion)(row);
}

test("calcula los puntos exactos de la ventana factual de 60 minutos", () => {
  const api = hourlyApi({ window_ms:3600000, scores:[
    { agent:"OraculoMacMini", current:75, reference:55, reliable:true, trend:"up" },
  ] });
  const row = { agente:"OraculoMacMini", total:75 };
  assert.deepEqual({ ...api.score(row) }, {
    available:true, points:20, state:"up", current:75, reference:55,
  });
  assert.deepEqual(row, { agente:"OraculoMacMini", total:75 }, "el cálculo no muta el total diario");
});

test("un dato fiable estacionario o decreciente muestra cero y estado igual", () => {
  const stationary = hourlyApi({ window_ms:3600000, scores:[
    { agent:"NeoMacMini", current:20, reference:20, reliable:true, trend:"same" },
  ] }).score({ agente:"NeoMacMini", total:20 });
  assert.deepEqual({ ...stationary }, { available:true, points:0, state:"same", current:20, reference:20 });

  const decreasing = hourlyApi({ window_ms:3600000, scores:[
    { agent:"NeoMacMini", current:15, reference:20, reliable:true, trend:"same" },
  ] }).score({ agente:"NeoMacMini", total:15 });
  assert.deepEqual({ ...decreasing }, { available:true, points:0, state:"same", current:15, reference:20 });
});

test("ventana incorrecta, referencia no fiable o valores ausentes no inventan una cifra", () => {
  const cases = [
    { window_ms:3599999, scores:[{ agent:"A", current:99, reference:10, reliable:true, trend:"up" }] },
    { window_ms:3600000, scores:[{ agent:"A", current:99, reference:10, reliable:false, trend:"up" }] },
    { window_ms:3600000, scores:[{ agent:"A", current:null, reference:10, reliable:true, trend:"up" }] },
    { window_ms:3600000, scores:[] },
  ];
  for (const hourly of cases) {
    assert.deepEqual({ ...hourlyApi(hourly).score({ agente:"A", total:99 }) }, {
      available:false, points:null, state:"unavailable", current:null, reference:null,
    });
  }
});

test("el desplegable pinta subida verde, igualdad amarilla y ausencia sin símbolo", () => {
  const up = renderHourly({ window_ms:3600000, scores:[
    { agent:"OraculoMacMini", current:75, reference:55, reliable:true, trend:"up" },
  ] }, { agente:"OraculoMacMini", total:75 });
  assert.match(up, /class="hourly-points up"/);
  assert.match(up, /Puntuación por hora/);
  assert.match(up, /class="hourly-points-value">20 puntos/);
  assert.match(up, /class="hourly-points-trend up" aria-hidden="true">↑/);
  assert.match(source, /\.hourly-points-trend\.up\{color:var\(--good\)/);

  const same = renderHourly({ window_ms:3600000, scores:[
    { agent:"NeoMacMini", current:20, reference:20, reliable:true, trend:"same" },
  ] }, { agente:"NeoMacMini", total:20 });
  assert.match(same, /class="hourly-points same"/);
  assert.match(same, /class="hourly-points-value">0 puntos/);
  assert.match(same, /class="hourly-points-trend same" aria-hidden="true">=/);
  assert.match(source, /\.hourly-points-trend\.same\{color:var\(--accent\)/);

  const unavailable = renderHourly({ window_ms:3600000, scores:[] }, { agente:"SinDato", total:99 });
  assert.match(unavailable, /class="hourly-points unavailable"/);
  assert.match(unavailable, /class="hourly-points-value">—/);
  assert.match(unavailable, /Sin referencia factual fiable/);
  assert.doesNotMatch(unavailable, /hourly-points-trend|>↑<|>=</);
  assert.doesNotMatch(unavailable, />99 puntos</);
});

test("Puntuación por hora nace contraída y el total diario sigue siendo el marcador", () => {
  assert.match(source, /<button class="score-toggle" type="button" aria-expanded="false" aria-controls="' \+ esc\(progressId\)/);
  assert.match(source, /<tr class="score-progress' \+ alterna \+ '" id="' \+ esc\(progressId\) \+ '" hidden><td colspan="9">' \+ progresionHtml\(a\)/);
  assert.match(source, /return resumenHora \+ '<div class="progression"/);

  const datos = { actividadMeta:{ hourly:{ window_ms:3600000, scores:[
    { agent:"OraculoMacMini", current:75, reference:55, reliable:true, trend:"up" },
  ] } } };
  const daily = new Function("datos", "esc", [
    functionSource("normaliza"), functionSource("tendenciaHoraria"), functionSource("puntosHtml"), "return puntosHtml;"
  ].join("\n"))(datos, esc)({ agente:"OraculoMacMini", total:75, haLatido:true }, "hourly-detail");
  assert.match(daily, /class="score-value">75<\/span>/);
  assert.doesNotMatch(daily, /class="score-value">20<\/span>/);
  assert.match(source, /<div class="pts"><span class="podium-score">' \+ total \+ '<\/span>/);
});
