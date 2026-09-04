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

function pagerApi() {
  return new Function(`
    function normaliza(value) { return String(value == null ? "" : value).trim(); }
    var SCORE_MISSION_FILTERS=["all","open","in_progress","closed"];
    ${functionSource("scoreMissionStatusBucket")}
    ${functionSource("scoreMissionFilter")}
    ${functionSource("scoreMissionVisibleMissions")}
    ${functionSource("scoreMissionPage")}
    ${functionSource("scoreMissionPageModel")}
    return {scoreMissionPage,scoreMissionPageModel};
  `)();
}

function pagerHtml(model) {
  return new Function("model", `
    function esc(value) { return String(value == null ? "" : value).replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
    ${functionSource("scoreMissionPagerHtml")}
    return scoreMissionPagerHtml(model,"missions-content");
  `)(model);
}

const payload = {missions:[
  {id:"open",status:"open",title:"Abierta"},
  {id:"unknown",status:"future",title:"Desconocida"},
  {id:"run",status:"doing",title:"En curso"},
  {id:"closed",status:"resolved",title:"Cerrada"},
  {id:"same",status:"pending",title:"Duplicada antigua"},
  {id:"same",status:"completed",title:"Duplicada cerrada"}
]};

test("el índice 0-based clampa límites y acepta delta, first y last", () => {
  const {scoreMissionPage:page} = pagerApi();
  assert.equal(page(0,-1,3),0);
  assert.equal(page(0,1,3),1);
  assert.equal(page(2,1,3),2);
  assert.equal(page(2,-1,3),1);
  assert.equal(page(1,"first",3),0);
  assert.equal(page(0,"last",3),2);
  assert.equal(page(9,0,3),2);
  assert.equal(page(-5,0,3),0);
  assert.equal(page(2,0,0),0);
});

test("Total y cada segmento muestran exactamente una misión con indicador X/N", () => {
  const {scoreMissionPageModel:model} = pagerApi();
  const all = model(payload,"all",2), open = model(payload,"open",1);
  const running = model(payload,"in_progress",0), closed = model(payload,"closed",1);
  assert.deepEqual([all.missions.length,all.total,all.position],[5,5,3]);
  assert.equal(all.mission.id,"run");
  assert.deepEqual([open.total,open.position,open.mission.id],[2,2,"unknown"]);
  assert.deepEqual([running.total,running.position,running.mission.id],[1,1,"run"]);
  assert.deepEqual([closed.total,closed.position,closed.mission.id],[2,2,"same"]);
  for (const entry of [all,open,running,closed]) {
    assert.equal(entry.position >= 1,true);
    assert.equal(entry.mission == null,false);
  }
});

test("anterior se desactiva al inicio y siguiente al final", () => {
  const {scoreMissionPageModel:model} = pagerApi();
  const first = model(payload,"all",0), last = model(payload,"all",99);
  assert.deepEqual([first.canPrevious,first.canNext],[false,true]);
  assert.deepEqual([last.canPrevious,last.canNext],[true,false]);
  let out = pagerHtml(first);
  assert.match(out,/data-score-mission-page="-1"[^>]*disabled/);
  assert.doesNotMatch(out,/data-score-mission-page="1"[^>]*disabled/);
  assert.match(out,/Misión 1 de 5/);
  out = pagerHtml(last);
  assert.doesNotMatch(out,/data-score-mission-page="-1"[^>]*disabled/);
  assert.match(out,/data-score-mission-page="1"[^>]*disabled/);
  assert.match(out,/Misión 5 de 5/);
});

test("N=0 produce 0/0, dos controles disabled y vacío contextual", () => {
  const {scoreMissionPageModel:model} = pagerApi();
  const empty = model({missions:[]},"closed",7), out = pagerHtml(empty);
  assert.deepEqual({total:empty.total,index:empty.index,position:empty.position,mission:empty.mission},
    {total:0,index:0,position:0,mission:null});
  assert.equal((out.match(/disabled/g) || []).length,2);
  assert.match(out,/Misión 0 de 0/);
  const items = functionSource("scoreMissionItemsHtml"), explorer = functionSource("scoreMissionExplorerHtml");
  assert.match(items,/No hay misiones cerradas en este periodo/);
  assert.match(explorer,/pageModel\s*=\s*scoreMissionPageModel/,
    "el explorador deriva la página visible del segmento deduplicado");
  assert.match(explorer,/pager\s*=\s*scoreMissionPagerHtml/,
    "el explorador integra el paginador sin sustituir el resumen global");
  assert.match(explorer,/<\/div>'\s*\+\s*pager\s*\+\s*'<\/div>'[\s\S]*score-mission-content/,
    "selector, paginador y mensaje vacío comparten el panel");
});

test("navegar página no hace fetch; cambiar filtro o periodo reinicia índice", () => {
  const setPage = functionSource("scoreMissionSetPage"), setFilter = functionSource("scoreMissionSetFilter");
  const load = functionSource("scoreMissionLoad");
  assert.match(setPage,/state\.page\s*=\s*scoreMissionPage/);
  assert.match(setPage,/scoreMissionPaint/);
  assert.doesNotMatch(setPage,/\bfetch\s*\(/);
  assert.match(setFilter,/state\.page\s*=\s*0/);
  assert.match(load,/periodChanged\s*=\s*state\.period\s*!==\s*selected/);
  assert.match(load,/if\s*\(periodChanged\)\s*state\.page\s*=\s*0;\s*state\.period\s*=\s*selected/);
  assert.equal((load.match(/state\.page\s*=\s*0/g) || []).length,1,
    "sólo el cambio síncrono de periodo reinicia la página; caché y respuesta tardía no lo hacen");
});

test("contadores siguen globales y página usa lista deduplicada/aliases/unknown", () => {
  const summary = functionSource("scoreMissionSummaryHtml"), model = functionSource("scoreMissionPageModel");
  assert.match(summary,/scoreMissionSummary\(payload && payload\.missions\)/,
    "los contadores no se recalculan sobre la página visible");
  assert.match(model,/scoreMissionVisibleMissions\(payload,\s*filter\)/);
  const {scoreMissionPageModel:make} = pagerApi();
  const open = make(payload,"open",0), closed = make(payload,"closed",0);
  assert.equal(open.total,2,"unknown se incluye prudentemente entre abiertas");
  assert.equal(closed.total,2,"la misión repetida sólo cuenta una vez y gana el alias terminal");
});

test("clic y teclado cambian misión con controles distintos a los del periodo", () => {
  const click = functionSource("iniciaProgresionToggle"), keyboard = functionSource("iniciaScoreMissionKeyboard");
  assert.match(click,/closest\("\[data-score-mission-page\]"\)/);
  assert.match(click,/scoreMissionSetPage\(/);
  assert.match(keyboard,/closest\("\[data-score-mission-page\]"\)/);
  assert.match(keyboard,/ArrowLeft[\s\S]*ArrowRight/);
  assert.match(keyboard,/evento\.key === "Home"[\s\S]*"first"/);
  assert.match(keyboard,/evento\.key === "End"[\s\S]*"last"/);
  assert.match(keyboard,/evento\.key === "Enter"[\s\S]*evento\.key === " "/);
  assert.match(html,/data-score-mission-page="-1"/);
  assert.match(html,/data-score-mission-step="-1"/);
  assert.doesNotMatch(html,/data-score-mission-page="-1"[^>]*aria-label="Periodo anterior"/);
});

test("estado, caché y respuestas tardías quedan aislados por agente y conservan foco móvil", () => {
  const state = functionSource("scoreMissionState"), load = functionSource("scoreMissionLoad");
  const paint = functionSource("scoreMissionPaint"), setPage = functionSource("scoreMissionSetPage");
  assert.match(state,/claveAgentePeriodo\(a && a\.agente\)/);
  assert.match(state,/page\s*:\s*0/);
  assert.match(load,/state\.request !== request \|\| state\.period !== selected/);
  assert.match(load,/claveAgentePeriodo\(payload\.agent\)\s*!==\s*expectedKey/);
  assert.match(paint,/data-score-mission-page/);
  assert.match(setPage,/preventScroll:true/);
  assert.match(html,/class="score-mission-pager"[^>]*role="group"/);
  assert.match(html,/class="score-mission-page-value"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html,/\.score-mission-page-button\{[^}]*min-height:(?:24|44)px/);
  assert.match(html,/@media \(max-width:620px\)\{[\s\S]{0,4500}\.score-mission-pager\{/,
    "el paginador conserva una regla específica para 390 px");
});
