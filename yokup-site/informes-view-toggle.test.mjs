import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const html=await readFile(new URL("./informes.html",import.meta.url),"utf8");

test("Cuadrícula nace seleccionada y el selector expone dos botones accesibles",()=>{
  assert.match(html,/id="reportView" role="group" aria-label="Presentación de los informes"/);
  assert.match(html,/data-report-view="grid" aria-pressed="true">Cuadrícula<\/button>/);
  assert.match(html,/data-report-view="list" aria-pressed="false">Lista<\/button>/);
  assert.match(html,/id="reportsSurface" data-view="grid"/);
  assert.match(html,/id="reps" role="list" aria-label="Informes de misiones en cuadrícula"/);
  assert.match(html,/let REPORT_VIEW="grid"/);
  assert.match(html,/\.view-option:focus-visible\{outline:2px solid var\(--brand\)/);
});

test("la cuadrícula recupera la tarjeta histórica y conserva todas las evidencias actuales",()=>{
  assert.match(html,/hoja de cálculo \(14d9820\)/);
  assert.match(html,/\.sheet\[data-view="grid"\]\{display:grid;grid-template-columns:repeat\(auto-fit/);
  assert.match(html,/\.sheet\[data-view="grid"\]>.rep\{[^}]*border:1px solid var\(--line\)[^}]*border-radius:13px[^}]*background:var\(--card\)[^}]*padding:15px 17px/);
  assert.match(html,/class="rhd"/);
  assert.match(html,/class="rbody">\$\{esc\(t\.report\)\}<\/div>/);
  assert.match(html,/class="rep-proof"><span>Petición<\/span>\$\{proc\}/);
  assert.match(html,/class="rep-proof"><span>Resultado<\/span>\$\{shot\}/);
  assert.match(html,/class="rep-proof"><span>Tiempo<\/span>\$\{tiempoHTML\(t\)\}/);
  assert.match(html,/class="rep-proof pts-cell"><span>Puntos<\/span>\$\{puntosHTML\(t\)\}/);
  assert.match(html,/class="rep-pdf" data-pdf=/);
});

test("cambiar de vista sincroniza semántica, informes y anomalías sin recargar datos",()=>{
  const start=html.indexOf("function normalizeReportView");
  const end=html.indexOf("function reportHeadHTML",start);
  assert.ok(start>0&&end>start);
  const buttons=[
    {dataset:{reportView:"grid"},attrs:{},setAttribute(k,v){this.attrs[k]=v;}},
    {dataset:{reportView:"list"},attrs:{},setAttribute(k,v){this.attrs[k]=v;},focus(){this.focused=true;}}
  ];
  const elements={
    reps:{dataset:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;}},
    reportsSurface:{dataset:{}},debe:{dataset:{}},
    reportView:{querySelectorAll(){return buttons;},querySelector(selector){return selector.includes('"list"')?buttons[1]:buttons[0];}}
  };
  const context=vm.createContext({});
  vm.runInContext(`let REPORT_VIEW="grid";const $=id=>elements[id];let renders=0;function applyFilter(){renders++;}${html.slice(start,end)}this.api={normalizeReportView,setReportView,syncReportView};this.elements=elements;this.buttons=buttons;this.getState=()=>({REPORT_VIEW,renders});`,
    Object.assign(context,{elements,buttons}));
  context.api.setReportView("list",true);
  assert.deepEqual(JSON.parse(JSON.stringify(context.getState())),{REPORT_VIEW:"list",renders:1});
  assert.equal(elements.reps.attrs.role,"table");
  assert.equal(elements.reps.attrs["aria-label"],"Informes de misiones en lista");
  assert.equal(elements.reportsSurface.dataset.view,"list");
  assert.equal(elements.debe.dataset.view,"list");
  assert.equal(buttons[0].attrs["aria-pressed"],"false");
  assert.equal(buttons[1].attrs["aria-pressed"],"true");
  assert.equal(buttons[1].focused,true);
  context.api.setReportView("grid");
  assert.deepEqual(JSON.parse(JSON.stringify(context.getState())),{REPORT_VIEW:"grid",renders:2});
  assert.equal(elements.reps.attrs.role,"list");
  assert.equal(context.api.normalizeReportView("desconocida"),"grid");
  const setter=html.slice(html.indexOf("function setReportView"),html.indexOf("function reportHeadHTML"));
  assert.doesNotMatch(setter,/\bload(?:Page|More)?\s*\(/);
  assert.doesNotMatch(setter,/DFILTER|PROJECT_SCOPE|PAGE\s*=/);
});

test("Lista conserva íntegra la hoja actual con grupos, sort y columnas",()=>{
  const list=html.slice(html.indexOf("function renderList(list)"),html.indexOf("$('reps').addEventListener",html.indexOf("function renderList(list)")));
  assert.match(list,/headHTML\(\)\+groups\.map/);
  assert.match(list,/class="grow item" role="row"/);
  assert.match(list,/class="family-group" role="rowgroup"/);
  assert.match(list,/COLUMN_RESIZE\.apply\(\);updatePageState\(\)/);
  assert.match(html,/REPORT_VIEW==="grid"\?renderGrid\(list\):renderList\(list\)/);
});

test("filtros, paginación y detalle operan sobre los mismos informes en ambas vistas",()=>{
  assert.match(html,/const filtered=ALL\.filter\(t=>!PROJECT_SCOPE/);
  assert.match(html,/render\(YkInformesSort\.sort\(filtered,SORT\.key,SORT\.dir/);
  assert.match(html,/function loadMore\(\)/);
  assert.match(html,/class="mid" href="\/ticket\?id=\$\{encodeURIComponent\(mission\.id\)\}"/);
  assert.match(html,/REPORT_VIEW_CONTROL\.addEventListener\("click"/);
  assert.match(html,/\$\("tfilter"\)\.querySelectorAll\("\.tf"\)\.forEach/);
  assert.ok(html.indexOf('id="reportView"')<html.indexOf('id="reps"'),"el selector vive fuera del renderer y sobrevive a filtros y paginación");
});

test("anomalías comparten presentación pero siguen separadas de informes y contadores",()=>{
  assert.match(html,/id="debe" hidden data-view="grid" role="region" aria-label="Anomalías de informe"/);
  assert.match(html,/\.debe\[data-view="grid"\] \.debe-list\{display:grid/);
  assert.match(html,/debt\.dataset\.view=REPORT_VIEW/);
  assert.match(html,/fetch\(WORKER\+"\/fleet\/informes-deuda"/);
  const debt=html.slice(html.indexOf("async function loadDebe"),html.indexOf("// RESULTADO",html.indexOf("async function loadDebe")));
  assert.doesNotMatch(debt,/\bALL\b|RENDERED_GROUPS|puntosHTML|inRange|PROJECT_SCOPE/);
  const count=html.slice(html.indexOf("function updatePageState"),html.indexOf("function pageUrl"));
  assert.match(count,/RENDERED_GROUPS\.reduce/);
  assert.doesNotMatch(count,/debe|debt|anomal/);
  assert.ok(html.indexOf('id="debe"')<html.indexOf('id="reportsSurface"'),"la deuda permanece como región previa independiente");
});
