import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./incidencias.html", import.meta.url), "utf8");
const shared = readFileSync(new URL("./yk-misiones.js", import.meta.url), "utf8");
const frame = readFileSync(new URL("./yk-frame.js", import.meta.url), "utf8");
const renderer = html.slice(html.indexOf("function incidenceRowHtml"), html.indexOf("async function askKb"));

function filterHarness() {
  const start = html.indexOf("function aplicaFiltro(f)");
  const end = html.indexOf('aplicaFiltro("activas")', start);
  assert.notEqual(start, -1, "falta aplicaFiltro");
  assert.notEqual(end, -1, "falta la inicialización de filtros");
  const script = html.slice(start, end);
  const element = f => ({
    dataset: { f },
    classList: { on: false, toggle(_name, on) { this.on = on; } },
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; },
    onclick: null
  });
  const tabs = [element("activas"), element("todas")];
  const kpis = [element("open"), element("in_progress"), element("resolved")];
  const document = {
    querySelectorAll(selector) {
      if (selector === ".tab") return tabs;
      if (selector === ".kpi[data-f]") return kpis;
      return [];
    }
  };
  let loads = 0;
  const api = new Function("document", "load", `
    let FILTER="activas";
    ${script}
    return {filter:()=>FILTER};
  `)(document, () => { loads++; });
  return { api, tabs, kpis, loads: () => loads };
}

test("Incidencias comparte shell y conserva una jerarquía horizontal propia", () => {
  assert.match(html, /href="\/yk-cabezal\.css\?v=r3"/);
  assert.match(html, /Proyecto \/ origen[\s\S]*Incidencia[\s\S]*Responsable \/ equipo[\s\S]*Estado \/ acciones/);
  assert.match(html, /\.inc-head,\.inc-main\{display:grid;grid-template-columns:minmax\(170px,\.9fr\) minmax\(260px,1\.65fr\) minmax\(190px,1fr\) minmax\(160px,\.85fr\)/);
  assert.match(renderer, /inc-origin-cell[\s\S]*inc-copy[\s\S]*inc-owner[\s\S]*inc-state/);
});

test("el renderer reutiliza infraestructura compartida sin adoptar rowHtml de misión", () => {
  assert.match(html, /YkMisiones\.cacheMission\(t\)/);
  assert.match(html, /YkMisiones\.whoHtml\(/);
  assert.match(html, /YkMisiones\.bindRows\(el\)/);
  assert.doesNotMatch(html, /list\.map\(t=>YkMisiones\.rowHtml\(t\)\)/);
  assert.match(shared, /function cacheMission\(t\)/);
  assert.match(shared, /rowHtml: rowHtml, cacheMission: cacheMission/);
  assert.match(renderer, /YkMisiones\.whoHtml\(t\.assignee\|\|"",machine,"",t\._agents,null\)/);
});

test("scope global es campo y el proyecto se aplica por id exacto", () => {
  assert.match(html, /\/tickets\?scope=campo&limit=500/);
  assert.match(html, /all\.filter\(t=>String\(t\.project\|\|""\)===PROJECT_SCOPE\)/);
  assert.match(html, /window\.addEventListener\("yk:project-change"/);
  assert.doesNotMatch(html, /subject[^\n]+includes\(PROJECT_SCOPE\)/);
});

test("alta, búsqueda, clasificación, severidad, estados y deep-links sobreviven", () => {
  assert.match(html, /id="incidentCreate"/);
  assert.match(html, /fetch\(WORKER\+"\/incident"/);
  assert.match(html, /\$\("incidentCreate"\)\.onsubmit=/);
  assert.match(html, /id="busca" type="search"/);
  assert.match(html, /\$\("busca"\)\.oninput=/);
  assert.match(html, /id="kindFilter"/);
  assert.match(html, /\$\("kindFilter"\)\.onchange=/);
  assert.match(html, /id="severityFilter"/);
  assert.match(html, /\$\("severityFilter"\)\.onchange=/);
  assert.match(html, /fetch\(WORKER\+"\/ticket\/status"/);
  assert.match(html, /el\.querySelectorAll\("\[data-status-id\]"\)/);
  assert.match(html, /list\.map\(incidenceRowHtml\)/);
  assert.match(html, /project_id:PROJECT_SCOPE/);
  assert.doesNotMatch(html, /fetch\(WORKER\+"\/projects\/mission"/);
  assert.match(html, /PARAMS\.get\("incident"\)\|\|PARAMS\.get\("id"\)\|\|HASH_FOCUS/);
  assert.match(html, /<details class="inc-detail"/);
});

test("1440 px mantiene cuatro columnas; 720 px refluye a dos", () => {
  assert.match(html, /\.inc-head,\.inc-main\{display:grid;grid-template-columns:[^}]+\}/);
  assert.match(html, /@media\(max-width:820px\)\{[\s\S]*?\.inc-main\{grid-template-columns:minmax\(0,1\.3fr\) minmax\(0,1fr\)\}/);
  assert.match(html, /@media\(max-width:820px\)\{[\s\S]*?\.inc-head\{display:none\}/);
});

test("390 px usa una columna, no fuerza ancho y conserva blancos táctiles", () => {
  assert.match(html, /@media\(max-width:520px\)\{[\s\S]*?\.inc-main\{grid-template-columns:1fr/);
  assert.match(html, /\.inc-action\{min-height:44px/);
  assert.match(html, /\.incident-create :is\(input,select,button\)\{min-height:44px/);
  assert.match(html, /@media\(max-width:520px\)\{[\s\S]*?\.tab\{min-height:44px\}/);
  assert.doesNotMatch(html, /\.inc-main[^}]*min-width:\s*[4-9]\d\dpx/);
});

test("los controles y el detalle exponen semántica accesible", () => {
  assert.match(html, /aria-label="Crear incidencia"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /aria-label="Filtros de incidencias"/);
  assert.match(html, /type="button" data-f="activas"/);
  assert.match(html, /setAttribute\("aria-pressed",String\(on\)\)/);
  assert.match(html, /aria-label="'\+state\.action\+' incidencia/);
  assert.match(renderer, /tabindex="0" role="group" aria-label="Incidencia/);
  assert.match(html, /querySelectorAll\("\.incident-row"\)[\s\S]*event\.key!=="Enter"&&event\.key!==" "/);
  assert.match(html, /\.incident-row:focus-visible\{outline:2px solid var\(--brand\)/);
  assert.match(html, /@media\(prefers-reduced-motion:reduce\)/);
});

test("una incidencia simulada muestra un distintivo y una real conserva su origen", () => {
  const start = html.indexOf("function incidentSourceHtml(source)");
  const end = html.indexOf("function incidenceRowHtml", start);
  const sourceFn = html.slice(start, end);
  const renderSource = new Function(`
    function esc(value){return String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;");}
    ${sourceFn}
    return incidentSourceHtml;
  `)();
  assert.equal(renderSource("simulation"), '<span class="inc-simulation">SIMULACIÓN</span>');
  assert.equal(renderSource("agent-iot"), "agent-iot");
  assert.equal(renderSource("<origen>"), "&lt;origen>");
  assert.match(html, /\.inc-simulation\{[^}]*color:var\(--accent\)/);
  assert.match(renderer, /esc\(simulation\?'SIMULACIÓN':source\)/,
    "el detalle también debe declarar la simulación sin HTML decorativo");
});

test("cada estado tiene un único control KPI y conserva filtrado accesible", () => {
  for (const state of ["open", "in_progress", "resolved"]) {
    assert.equal((html.match(new RegExp(`data-f="${state}"`, "g")) || []).length, 1, `${state} no se duplica en tabs`);
  }
  assert.match(html, /class="tab on" type="button" data-f="activas">Activas<\/button>/);
  assert.match(html, /class="tab" type="button" data-f="todas">Todas<\/button>/);

  const { api, tabs, kpis, loads } = filterHarness();
  kpis.forEach((kpi, index) => {
    kpi.onclick();
    assert.equal(api.filter(), kpi.dataset.f);
    assert.equal(kpi.attrs["aria-pressed"], "true");
    assert.equal(kpi.classList.on, true);
    assert.equal(kpis.filter(item => item.attrs["aria-pressed"] === "true").length, 1);
    assert.equal(tabs.filter(item => item.attrs["aria-pressed"] === "true").length, 0);
    assert.equal(loads(), index + 1, "cada click actualiza una sola vez el listado");
  });
});

test("el primer fetch y yk_seen esperan el scope canónico incluso en Todos", () => {
  assert.match(html, /SCOPE_READY=false/);
  assert.match(html, /async function load\(\)\{\s*if\(!SCOPE_READY\)return;/);
  assert.match(html, /yk_seen:"\+\(PROJECT_SCOPE\|\|"todos"\)/);
  assert.match(html, /window\.addEventListener\("yk:project-change"[\s\S]*SCOPE_READY=true;[\s\S]*seen=new Set/);
  assert.doesNotMatch(html, /new Set\(JSON\.parse\(localStorage\.getItem\("yk_seen"\)/);
  assert.match(frame, /project_id:PROJECT_SCOPE,project:activeProject\(\),ready:true/);
  assert.match(frame, /project_id:null,project:null,ready:true,error:true/);
  assert.doesNotMatch(frame, /if \(PROJECT_SCOPE\) window\.dispatchEvent\(new CustomEvent\("yk:project-change"/);
});

test("un deep-link selecciona la incidencia y puebla el árbol compartido", () => {
  assert.match(html, /if\(FOCUS\)\{[\s\S]*YkMisiones\.selectMission\(FOCUS\)/);
  assert.ok(html.indexOf("YkMisiones.bindRows(el)") < html.indexOf("YkMisiones.selectMission(FOCUS)"));
});

test("asuntos y tokens largos no pueden forzar scroll horizontal a 390", () => {
  assert.match(html, /\.incident-row\{cursor:default;overflow:hidden\}/);
  assert.match(html, /\.inc-main\{padding:12px 16px;min-width:0;width:100%\}/);
  assert.match(html, /\.inc-subject\{min-width:0;[^}]*overflow-wrap:anywhere;word-break:break-word;[^}]*line-clamp:3/);
  assert.match(html, /\.inc-owner\{overflow:hidden\}/);
  assert.match(html, /\.inc-machine\{max-width:100%;[^}]*overflow-wrap:anywhere/);
});

test("el alta nace con proyecto atómico y reintenta con recurso estable", () => {
  assert.match(html, /CREATE_PENDING_KEY="yk_incident_create_pending_v1"/);
  assert.match(html, /sessionStorage\.setItem\(CREATE_PENDING_KEY,JSON\.stringify\(value\)\)/);
  assert.match(html, /if\(!pending\|\|pending\.signature!==signature\)\{pending=\{signature,resource:newManualResource\(kind\),createdId:""\}/);
  assert.match(html, /if\(!pending\.createdId\)\{[\s\S]*fetch\(WORKER\+"\/incident"/);
  assert.match(html, /pending\.createdId=out\.id;writePendingCreate\(pending\)/);
  assert.match(html, /if\(!PROJECT_SCOPE\)throw new Error\("Selecciona un proyecto/);
  assert.match(html, /project_id:PROJECT_SCOPE/);
  assert.match(html, /writePendingCreate\(null\);\$\("newSubject"\)\.value=""/);
  assert.doesNotMatch(html, /resource="manual:"\+kind\+":"\+Date\.now\(\)/);
});
