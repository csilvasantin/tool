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

function filterApi() {
  return new Function(`
    function normaliza(value) { return String(value == null ? "" : value).trim(); }
    var SCORE_MISSION_FILTERS=["all","open","in_progress","closed"];
    ${functionSource("scoreMissionStatusBucket")}
    ${functionSource("scoreMissionFilter")}
    ${functionSource("scoreMissionVisibleMissions")}
    return {scoreMissionFilter,scoreMissionVisibleMissions};
  `)();
}

function renderSummary(payload, status = "ready", filter = "all", agent = "Lucas", period = "day") {
  return new Function("payload", "status", "agent", "period", "filter", `
    function normaliza(value) { return String(value == null ? "" : value).trim(); }
    function esc(value) { return String(value == null ? "" : value).replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
    function rotuloPeriodoRanking(value) { return ({hour:"Hora",day:"Día",week:"Semana",month:"Mes"})[value] || "Día"; }
    var SCORE_MISSION_FILTERS=["all","open","in_progress","closed"];
    ${functionSource("scoreMissionStatusBucket")}
    ${functionSource("scoreMissionSummary")}
    ${functionSource("scoreMissionCount")}
    ${functionSource("scoreMissionFilter")}
    ${functionSource("scoreMissionSummaryHtml")}
    return scoreMissionSummaryHtml(payload,status,agent,period,filter,"missions-content");
  `)(payload,status,agent,period,filter);
}

test("Total es el filtro por defecto y el ciclo recorre los cuatro segmentos", () => {
  const {scoreMissionFilter} = filterApi();
  assert.equal(scoreMissionFilter(undefined,undefined),"all");
  assert.equal(scoreMissionFilter("all",1),"open");
  assert.equal(scoreMissionFilter("open",1),"in_progress");
  assert.equal(scoreMissionFilter("in_progress",1),"closed");
  assert.equal(scoreMissionFilter("closed",1),"all");
  assert.equal(scoreMissionFilter("all",-1),"closed");
  assert.equal(scoreMissionFilter("closed","open"),"open");
  assert.equal(scoreMissionFilter("invalid","invalid"),"all");
  assert.match(functionSource("scoreMissionState"),/filter\s*:\s*"all"/);
});

test("cada segmento filtra una lista única; unknown es abierta y el feed inverso no cambia", () => {
  const {scoreMissionVisibleMissions:visible} = filterApi();
  const missions = [
    {id:"o",status:"open"},{id:"p",status:"pending"},{id:"u",status:"future"},
    {id:"r",status:"doing"},{id:"a",status:"active"},
    {id:"c",status:"resolved"},{id:"d",status:"done"},{id:"x",status:"completed"},
    {id:"same",status:"open"},{id:"same",status:"done"}
  ];
  const ids = (filter, rows = missions) => visible({missions:rows},filter).map((mission) => mission.id).sort();
  assert.deepEqual(ids("all"),["a","c","d","o","p","r","same","u","x"]);
  assert.deepEqual(ids("open"),["o","p","u"]);
  assert.deepEqual(ids("in_progress"),["a","r"]);
  assert.deepEqual(ids("closed"),["c","d","same","x"]);
  for (const filter of ["all","open","in_progress","closed"]) {
    assert.deepEqual(ids(filter,[...missions].reverse()),ids(filter),`${filter}: feed inverso estable`);
  }
  assert.equal(visible({missions},"all").find((mission) => mission.id === "same").status,"done");
  assert.equal(visible({missions:[...missions].reverse()},"all").find((mission) => mission.id === "same").status,"done");
});

test("los contadores son globales aunque cambie el segmento y aria-pressed es único", () => {
  const payload = {missions:[{id:"o",status:"open"},{id:"r",status:"active"},{id:"c",status:"done"}]};
  for (const selected of ["all","open","in_progress","closed"]) {
    const out = renderSummary(payload,"ready",selected);
    assert.match(out,/class="score-mission-summary-total"[^>]*>3 misiones</);
    assert.match(out,/class="score-mission-summary-open"[^>]*>1 abierta</);
    assert.match(out,/class="score-mission-summary-running"[^>]*>1 en curso</);
    assert.match(out,/class="score-mission-summary-closed"[^>]*>1 cerrada</);
    assert.equal((out.match(/aria-pressed="true"/g) || []).length,1,selected);
    assert.equal((out.match(/aria-pressed="false"/g) || []).length,3,selected);
    assert.match(out,new RegExp(`data-score-mission-filter="${selected}"[^>]*aria-pressed="true"`));
  }
});

test("clic y teclado seleccionan segmento sin convertir el control en navegación", () => {
  const click = functionSource("iniciaProgresionToggle"), keyboard = functionSource("iniciaScoreMissionKeyboard");
  assert.match(click,/closest\("\[data-score-mission-filter\]"\)/);
  assert.match(click,/scoreMissionSetFilter\(/);
  assert.match(keyboard,/closest\("\[data-score-mission-filter\]"\)/);
  assert.match(keyboard,/ArrowLeft[\s\S]*ArrowRight[\s\S]*ArrowUp[\s\S]*ArrowDown/);
  assert.match(keyboard,/evento\.key === "Home"[\s\S]*"all"/);
  assert.match(keyboard,/evento\.key === "End"[\s\S]*"closed"/);
  assert.match(keyboard,/evento\.key === "Enter"[\s\S]*evento\.key === " "/);
  assert.match(keyboard,/evento\.preventDefault\(\)/);
});

test("el filtro sobrevive a periodo, caché y respuesta tardía sin hacer fetch propio", () => {
  const setter = functionSource("scoreMissionSetFilter"), loader = functionSource("scoreMissionLoad");
  assert.match(setter,/selected\s*=\s*scoreMissionFilter\(state\.filter,\s*filter\)/);
  assert.match(setter,/state\.filter\s*=\s*selected/);
  assert.match(setter,/scoreMissionPaint\(a,\s*progressId\)/);
  assert.doesNotMatch(setter,/\bfetch\s*\(/);
  assert.doesNotMatch(loader,/state\.filter\s*=/,
    "resolver caché o red no pisa la selección local del agente");
  assert.match(loader,/cached && !force[\s\S]*scoreMissionPaint/);
  assert.match(loader,/state\.request !== request \|\| state\.period !== selected/,
    "una respuesta tardía de otro periodo no repinta el estado vigente");
  assert.match(loader,/claveAgentePeriodo\(payload\.agent\)\s*!==\s*expectedKey/,
    "el payload no puede mezclar otra familia");
});

test("un segmento vacío explica el contexto sin retirar selector ni contadores", () => {
  const items = functionSource("scoreMissionItemsHtml"), explorer = functionSource("scoreMissionExplorerHtml");
  assert.match(items,/scoreMissionVisibleMissions\(payload,\s*selected\)/);
  assert.match(items,/No hay misiones[^"']*(abiertas|en curso|cerradas)/i);
  assert.match(explorer,/state\.filter\s*=\s*scoreMissionFilter\("all",\s*state\.filter\)/);
  assert.match(explorer,/filter\s*=\s*state\.filter/);
  assert.match(explorer,/scoreMissionSummaryHtml\([^;]*period,\s*filter,\s*contentId\)/);
  assert.match(explorer,/scoreMissionItemsHtml\(state\.payload,\s*filter,\s*state\.page\)/);
  assert.match(explorer,/summary \+ '<\/div>'[\s\S]*score-mission-content/,
    "el selector permanece en el encabezado aunque el contenido filtrado quede vacío");
});

test("el selector es accesible, responsive a 390 px y conserva el foco lógico", () => {
  const paint = functionSource("scoreMissionPaint"), setter = functionSource("scoreMissionSetFilter");
  assert.match(html,/class="score-mission-summary-filters"[^>]*role="group"[^>]*aria-label=/);
  assert.match(html,/data-score-mission-filter="all"/);
  assert.match(html,/data-score-mission-filter="open"/);
  assert.match(html,/data-score-mission-filter="in_progress"/);
  assert.match(html,/data-score-mission-filter="closed"/);
  assert.match(html,/\.score-mission-summary-filter\{[^}]*min-height:(?:24|44)px/);
  assert.match(html,/\.score-mission-summary-filters\{[^}]*flex-wrap:wrap/);
  assert.match(html,/@media \(max-width:620px\)\{[\s\S]{0,4000}\.score-mission-summary-filters\{/,
    "el selector conserva una regla móvil para 390 px");
  assert.match(paint,/data-score-mission-filter/);
  assert.match(setter,/focus/);
  assert.match(setter,/preventScroll:true/);
});
