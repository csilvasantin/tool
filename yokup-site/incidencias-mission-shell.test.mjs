import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./incidencias.html", import.meta.url), "utf8");
const shared = readFileSync(new URL("./yk-misiones.js", import.meta.url), "utf8");
const frame = readFileSync(new URL("./yk-frame.js", import.meta.url), "utf8");
const renderer = html.slice(html.indexOf("function incidenceRowHtml"), html.indexOf("async function askKb"));

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
  // FLT-101292 · sólo vivas en la carga y el refresco; las cerradas bajo demanda.
  assert.match(html, /\/tickets\?scope=campo&state=vivas&limit=1000/);
  assert.match(html, /\/tickets\?scope=campo&status=resolved,cancelled&limit=300/);
  assert.doesNotMatch(html, /\/tickets\?scope=campo&limit=500/);
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

// FLT-101292 · piel «Portal del comercio»: esta rejilla base sigue en el <style>
// de la página (fallback sin incidencias-portal.css); la tarjeta clara la
// reordena con grid-template-areas — ver incidencias-portal.test.mjs.
test("rejilla base: 1440 px mantiene cuatro columnas; 720 px refluye a dos", () => {
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

test("la precarga no espera al scope; yk_seen y los avisos sí lo esperan", () => {
  assert.match(html, /SCOPE_READY=false/);
  // La petición sale en el <head>, justo tras acceso.js (fetch con sesión) y antes del marco.
  const head = html.slice(0, html.indexOf("</head>"));
  assert.ok(head.indexOf("/acceso.js") < head.indexOf("window.__ykIncPrefetch="), "la precarga va tras acceso.js");
  assert.match(head, /window\.__ykIncPrefetch=[\s\S]*fetch\("https:\/\/api\.yokup\.com\/tickets\?scope=campo&state=vivas&limit=1000"/);
  assert.doesNotMatch(html, /async function load\(\)\{\s*if\(!SCOPE_READY\)return;/);
  assert.match(html, /let PREFETCH=window\.__ykIncPrefetch\|\|null/);
  assert.match(html, /aplicaFiltro\("activas"\); load\(\); setInterval\(load,12000\);/);
  assert.match(html, /if\(SCOPE_READY\)\{\s*tks\.filter\(t=>t\.status==="open"&&!seen\.has\(t\.id\)\)/);
  assert.match(html, /return SCOPE_READY&&PROJECT_SCOPE\?all\.filter/);
  assert.match(html, /yk_seen:"\+\(PROJECT_SCOPE\|\|"todos"\)/);
  assert.match(html, /window\.addEventListener\("yk:project-change"[\s\S]*SCOPE_READY=true;[\s\S]*seen=new Set/);
  assert.doesNotMatch(html, /new Set\(JSON\.parse\(localStorage\.getItem\("yk_seen"\)/);
  assert.match(frame, /project_id:PROJECT_SCOPE,project:activeProject\(\),ready:true/);
  assert.match(frame, /project_id:PROJECT_SCOPE,project:null,ready:true,error:true,can_change_project:policy\.canChange/);
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

test("filas esqueleto mientras carga, no un «Cargando…» plano", () => {
  assert.match(html, /<div class="list" id="list" aria-live="polite" aria-busy="true">[\s\S]*?class="tk inc-skel" aria-hidden="true"/);
  assert.doesNotMatch(html, /<div class="empty">Cargando incidencias…<\/div>/);
  assert.match(html, /function skeleton\(el,n\)\{/);
  assert.match(html, /\.inc-skel i\{[^}]*animation:inc-shimmer/);
  assert.match(html, /@media\(prefers-reduced-motion:reduce\)\{[^\n]*\.inc-skel i\{animation:none\}/);
});

test("«Ver resueltas» carga las cerradas bajo demanda y el refresco sólo pide vivas", () => {
  assert.match(html, /id="verResueltas" type="button"/);
  assert.match(html, /\$\("verResueltas"\)\.onclick=\(\)=>aplicaFiltro\("resolved"\)/);
  assert.match(html, /const wantsClosed=FILTER==="resolved"\|\|FILTER==="todas"/);
  assert.match(html, /CLOSED_LOADING=fetchTickets\(TICKETS_CLOSED\)/);
  // El refresco periódico usa load(), que sólo pide TICKETS_LIVE.
  const load = html.slice(html.indexOf("async function load(){"), html.indexOf("function loadClosed("));
  assert.match(load, /fetchTickets\(TICKETS_LIVE\)/);
  assert.doesNotMatch(load, /TICKETS_CLOSED/);
});

test("«Cerrar todas las abiertas» sólo para superusuario, con confirmación, lotes y nota", () => {
  assert.match(html, /id="closeAllBtn" type="button" hidden/);
  assert.match(html, /ACCESS\.capabilities\.supervisor_project_switch===true/);
  assert.match(html, /btn\.hidden=!isSuperuser\(\)/);
  assert.match(html, /btn\.textContent="Cerrar todas las abiertas \("\+n\+"\)"/);
  assert.match(html, /if\(!confirm\(text\)\)return;/);
  assert.match(html, /Por origen:[\s\S]*Por equipo:/);
  assert.match(html, /const CLOSE_ALL_BATCH=100;/);
  assert.match(html, /fetch\(WORKER\+"\/tickets\/status",\{method:"POST"[^\n]*ids:lote,status:"cancelled",author,note:CLOSE_ALL_NOTE/);
  assert.match(html, /CLOSE_ALL_NOTE="Cierre en bloque para probar de cero \(Carlos, 30-sep-2026\)"/);
  assert.match(html, /t\.status==="open"\|\|t\.status==="in_progress"/);
});
