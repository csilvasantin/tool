import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const html=await readFile(new URL("./informes.html",import.meta.url),"utf8");

test("Detalle nace seleccionado y el selector expone tres botones accesibles",()=>{
  assert.match(html,/href="\/yk-informes-view\.css\?v=r3"/);
  assert.match(html,/src="\/yk-informes-view\.js\?v=r3"/);
  assert.match(html,/id="reportView"><\/div>/);
  assert.match(html,/YkInformesView\.mount\(\$\("reportView"\)/);
  assert.match(html,/targets:\[\$\("reportsSurface"\),\$\("reps"\),\$\("debe"\)\]/);
  assert.match(html,/id="reps" role="table" aria-label="Detalle de informes de misiones y tareas"/);
  assert.match(html,/let REPORT_VIEW=YkInformesView\.DETAIL/);
});

test("la cuadrícula recupera la tarjeta histórica y conserva todas las evidencias actuales",()=>{
  assert.match(html,/hoja de cálculo \(14d9820\)/);
  assert.match(html,/\.sheet\[data-informes-view="grid"\]\{display:grid;grid-template-columns:repeat\(auto-fit/);
  assert.match(html,/\.sheet\[data-informes-view="grid"\]>.rep\{[^}]*border:1px solid var\(--line\)[^}]*border-radius:13px[^}]*background:var\(--card\)[^}]*padding:15px 17px/);
  assert.match(html,/class="rhd"/);
  assert.match(html,/class="rbody">\$\{esc\(t\.report\)\}<\/div>/);
  assert.match(html,/class="rep-proof"><span>Petición<\/span>\$\{proc\}/);
  assert.match(html,/class="rep-proof"><span>Resultado<\/span>\$\{shot\}/);
  assert.match(html,/class="rep-proof"><span>Tiempo<\/span>\$\{tiempoHTML\(t\)\}/);
  assert.match(html,/class="rep-proof pts-cell"><span>Puntos<\/span>\$\{puntosHTML\(t\)\}/);
  assert.match(html,/class="rep-pdf" data-pdf=/);
});

test("cambiar de vista usa el contrato persistente sin recargar datos",()=>{
  const mount=html.slice(html.indexOf("const REPORT_VIEW_CONTROL=YkInformesView.mount"),html.indexOf("function headHTML"));
  assert.match(mount,/onChange:view=>\{REPORT_VIEW=view;syncReportSemantics\(\);applyFilter\(\);\}/);
  assert.doesNotMatch(mount,/\bload(?:Page|More)?\s*\(/);
  assert.doesNotMatch(mount,/DFILTER|PROJECT_SCOPE|PAGE\s*=/);
  assert.match(html,/REPORT_VIEW=REPORT_VIEW_CONTROL\.getView\(\);syncReportSemantics\(\)/);
});

test("Detalle conserva íntegra la hoja histórica con retrato, misiones, sort y columnas",()=>{
  const detail=html.slice(html.indexOf("function renderDetail(list)"),html.indexOf("$('reps').addEventListener",html.indexOf("function renderDetail(list)")));
  assert.match(detail,/headHTML\(\)\+groups\.map/);
  assert.match(detail,/ykAvatar\.html\(agent\)/);
  assert.match(detail,/class="grow item" role="row"/);
  assert.match(detail,/class="mission-group" role="rowgroup"/);
  assert.match(detail,/YkInformesView\.missionGroups\(list\)/);
  assert.match(detail,/COLUMN_RESIZE\.apply\(\);updatePageState\(\)/);
  assert.match(html,/YkInformesView\.rowsForView\(list,REPORT_VIEW\)/);
  assert.match(html,/if\(REPORT_VIEW===YkInformesView\.GRID\)return renderGrid\(rows\)/);
  assert.match(html,/if\(REPORT_VIEW===YkInformesView\.LIST\)return renderList\(rows\)/);
  assert.match(html,/return renderDetail\(rows\)/);
});

test("Lista es el resumen compacto y no duplica la hoja Detalle",()=>{
  const list=html.slice(html.indexOf("function renderList(list)"),html.indexOf("function renderDetail(list)"));
  assert.match(list,/class="report-list-row"/);
  assert.match(list,/class="report-list-agent"/);
  assert.doesNotMatch(list,/class="grow item"/);
});

test("la interfaz usa Misión antes de Tarea y conserva FLT sólo como ID técnico",()=>{
  assert.match(html,/return \(number\?"Misión "\+number\+" · ":""\)\+"Tarea"\+\(taskCode\?" "\+taskCode:""\)/);
  assert.match(html,/return "Misión"\+\(number\?" "\+number:""\)/);
  assert.match(html,/title="Abrir misión · ID técnico /);
  assert.match(html,/humanWorkLabel\(m,m\.debt_kind==="task_without_report"\?"task":"mission"\)/);
});

test("Bandeja desaparece de Informes",()=>{
  assert.doesNotMatch(html,/← Bandeja/);
});

test("filtros, paginación y detalle operan sobre los mismos informes en ambas vistas",()=>{
  assert.match(html,/const filtered=ALL\.filter\(t=>!PROJECT_SCOPE/);
  assert.match(html,/const sorted=YkInformesSort\.sort\(filtered,SORT\.key,SORT\.dir/);
  assert.match(html,/YkInformesView\.canonicalMissionRows\(sorted\)/);
  assert.match(html,/function loadMore\(\)/);
  assert.match(html,/const detail=YkInformesView\.detailHref\(t\),kind=YkInformesView\.reportKind\(t\)/);
  assert.match(html,/href="\$\{esc\(detail\)\}"/);
  assert.match(html,/\$\("tfilter"\)\.querySelectorAll\("\.tf"\)\.forEach/);
  assert.ok(html.indexOf('id="reportView"')<html.indexOf('id="reps"'),"el selector vive fuera del renderer y sobrevive a filtros y paginación");
});

test("anomalías comparten presentación pero siguen separadas de informes y contadores",()=>{
  assert.match(html,/id="debe" hidden role="region" aria-label="Anomalías de informe"/);
  assert.match(html,/\.debe\[data-informes-view="grid"\] \.debe-list\{display:grid/);
  assert.match(html,/YkInformesView\.anomalyContract\(d\.debts\|\|d\.missions\|\|\[\]\)/);
  assert.match(html,/data-debt-key=/);
  assert.match(html,/fetch\(WORKER\+"\/fleet\/informes-deuda"/);
  const debt=html.slice(html.indexOf("async function loadDebe"),html.indexOf("// RESULTADO",html.indexOf("async function loadDebe")));
  assert.doesNotMatch(debt,/\bALL\b|RENDERED_GROUPS|puntosHTML|inRange|PROJECT_SCOPE/);
  const count=html.slice(html.indexOf("function updatePageState"),html.indexOf("function pageUrl"));
  assert.match(count,/LAST_VIEW_ROWS\.length/);
  assert.doesNotMatch(count,/debe|debt|anomal/);
  assert.ok(html.indexOf('id="debe"')<html.indexOf('id="reportsSurface"'),"la deuda permanece como región previa independiente");
});
