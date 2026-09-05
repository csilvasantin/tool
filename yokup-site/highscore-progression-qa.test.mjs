import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("./highscore.html", import.meta.url), "utf8");

function grabFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `falta ${name}`);
  const open = html.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < html.length; i += 1) {
    if (html[i] === "{") depth += 1;
    else if (html[i] === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  assert.fail(`función ${name} sin cierre`);
}

function progressionApi(meta, now = Date.UTC(2026, 7, 4, 16, 30)) {
  const stagesStart = html.indexOf("var ETAPAS_PROGRESO = [");
  const stagesEnd = html.indexOf("\n\n  function tipoEtapa", stagesStart);
  assert.ok(stagesStart >= 0 && stagesEnd > stagesStart, "falta el catálogo de etapas");
  const context = vm.createContext({
    datos: { actividadMeta: meta },
    window: { ykAgentIdentity:null },
    Date: class extends Date { static now() { return now; } },
    esc: (value) => String(value == null ? "" : value)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;")
  });
  const names = ["normaliza", "claveTrazabilidad", "claveAgenteTrazabilidad", "instanteTrazabilidad", "progresionTrazada",
    "tipoEtapa", "estadoEtapa", "etapaEnriquecida", "progresionAgregada", "normalizaProgresion",
    // el bloque de la SIGUIENTE VENTANA vive dentro de progresionHtml: sin su
    // reloj la fila desplegada no se puede pintar
    "comoMs", "mismoAgenteVentana", "ventanaHoraria", "faltaTexto", "horaCorta", "tituloVentana",
    "turnoDeAgente", "proximaVentana", "textoProximaVentana", "tituloProximaVentana",
    "etiquetaProximaVentana", "proximaVentanaHtml", "progresionHtml"];
  const constantes = ["var TIME_ZONE = ", "var RELOJ_FMT = ", "var VENTANA_MS = "].map((declaracion) => {
    const inicio = html.indexOf(declaracion);
    assert.ok(inicio >= 0, `falta ${declaracion}`);
    return html.slice(inicio, html.indexOf(";", inicio) + 1);
  });
  vm.runInContext([
    ...names.slice(0, 5).map(grabFunction),
    html.slice(stagesStart, stagesEnd),
    ...constantes,
    ...names.slice(5).map(grabFunction)
  ].join("\n"), context);
  return context;
}

test("una cadena real gana al resumen y respeta agente, máquina, proyecto y fecha más reciente", () => {
  const base = { agent:"OraculoMacMini", machine:"macmini", project:"yokup" };
  const chains = [
    { id:"vieja", ...base, latest_at:100, origin:{type:"window", id:"DEC-1", at:80}, windows:[{id:"DEC-1",at:80}], points:{total:8} },
    { id:"otra-maquina", agent:base.agent, machine:"mbp16", project:"yokup", latest_at:900,
      origin:{type:"objective",id:"OBJ-X"}, points:{total:999} },
    { id:"real", ...base, latest_at:300, origin:{type:"objective", id:"OBJ-2", title:"Mejorar Highscore", at:200, is_new:true},
      windows:[{id:"DEC-2",at:220}], mission:{id:"FLT-1170",title:"Línea de progreso",at:240,is_new:true},
      tasks:[{id:"FLT-1170:c",mission_id:"FLT-1170",code:"c",status:"in_progress",at:300,is_new:true}], points:{total:83} }
  ];
  const api = progressionApi({ traceability:{ version:1, chains } });
  api.result = api.progresionTrazada(base);
  assert.equal(api.result.linked, true);
  assert.equal(api.result.origin, "objetivo");
  assert.match(api.result.label, /Cadena real/);
  assert.deepEqual(Array.from(api.result.stages, (stage) => [stage.type, stage.state]), [
    ["objetivo","new"], ["ventana","completed"], ["mision","new"], ["tareas","new"], ["puntos","completed"]
  ]);
  assert.equal(api.result.stages.at(-1).value, "83 pts");
});

test("una misión nacida en Ventana no inventa Objetivo y la línea comienza en su origen real", () => {
  const score = { agent:"NeoMini", machine:"macmini", project:"pixeria" };
  const chain = { id:"window-chain", ...score, latest_at:500,
    origin:{type:"window",id:"DEC-9",title:"Elegir mejora",at:100,is_new:false},
    windows:[{id:"DEC-9",at:100}], mission:{id:"FLT-9",title:"Entrega",at:200},
    tasks:[{id:"FLT-9:a",mission_id:"FLT-9",status:"done",at:300}], points:{total:63} };
  const api = progressionApi({ traceability:{ version:1, chains:[chain] } });
  const traced = api.progresionTrazada(score);
  assert.equal(traced.origin, "ventana");
  assert.equal(traced.stages[0].state, "future");
  assert.equal(traced.stages[0].value, "No fue origen");
  const rendered = api.progresionHtml({ progresion:traced });
  assert.match(rendered, /data-stage="objetivo" data-state="future"/);
  assert.match(rendered, /progression-step future pre-origin/);
  assert.match(rendered, /progression-step completed origin/);
  assert.match(rendered, /Origen · Ventana/);
});

test("sin relación explícita se declara resumen no enlazado y no se fabrica una cadena", () => {
  const api = progressionApi({ traceability:{ version:1, chains:[], unlinked:[
    {type:"mission",id:"FLT-HUERFANA",reason:"missing_decision_relation"}
  ] } });
  assert.equal(api.progresionTrazada({agent:"SmithMini",machine:"macmini"}), null);
  const fallback = api.normalizaProgresion({ objetivos:0, ventanas:0, misiones:1, tareas:2, total:70, actividad:"tareas", actividadAt:1 });
  assert.equal(fallback.linked, false);
  assert.equal(fallback.origin, "");
  assert.equal(fallback.label, "Resumen del día · cadena sin enlazar");
  assert.match(api.progresionHtml({ objetivos:0, ventanas:0, misiones:1, tareas:2, total:70 }), /Resumen no enlazado/);
});

test("la aparición se anuncia sin depender solo del cuadrado, del color o de la animación", () => {
  assert.match(html, /\.progression-step\.new\{color:var\(--accent\)\}/);
  assert.match(html, /\.progression-step\.new \.progression-dot\{[^}]*border-radius:4px[^}]*animation:new-arrival/s);
  assert.match(html, /progression-step ' \+ s\.state[\s\S]*data-state="' \+ s\.state/);
  assert.match(html, /role="list" aria-label="' \+ esc\(descripcion\)/);
  assert.match(html, /role="listitem"[\s\S]*aria-label="' \+ esc\(title\)/);
  assert.match(html, /prefers-reduced-motion:reduce[^}]*progression-step\.new \.progression-dot[^}]*\{animation:none!important/);
});

test("móvil conserva las cinco etapas y la siguiente ventana con scroll horizontal, sin alterar las nueve columnas", () => {
  assert.match(html, /\.table-scroll\{[^}]*overflow-x:auto[^}]*overflow-y:hidden/);
  assert.match(html, /@media \(max-width:620px\)[\s\S]*\.progression\{grid-template-columns:88px repeat\(6,76px\);min-width:580px/);
  assert.match(html, /<tr class="score-progress' \+ alterna \+ '" id="' \+ esc\(progressId\) \+ '" hidden><td colspan="9">' \+ progresionHtml\(a\)/);
  assert.match(html, /<tr class="score-main' \+ alterna \+ '" data-agent-key="' \+ esc\(agentKey\) \+ '"><td class="n">' \+ posicionHtml/);
  assert.equal((html.match(/class="sort-head"/g) || []).length, 8);
});

test("la trazabilidad es aditiva: ranking y puntos siguen usando los totales históricos", () => {
  assert.match(html, /f\.progresion = \(typeof progresionTrazada === "function" && progresionTrazada\(a\)\) \|\|\s*a\.progression/);
  assert.match(html, /f\.ptsObjetivos \+= Number\(a\.objective_points\) \|\| 0/);
  assert.match(html, /f\.ptsVentanas \+= Number\(a\.window_points\) \|\| 0/);
  assert.match(html, /f\.ptsMisiones \+= Number\(a\.mission_points\) \|\| 0/);
  assert.match(html, /f\.total = f\.ptsObjetivos \+ f\.ptsVentanas \+ f\.ptsMisiones \+ f\.ptsTareas/);
  assert.match(html, /if \(campo === "puntos"\) return Number\(fila\.total\) \|\| 0/);
  assert.doesNotMatch(html, /f\.total\s*\+=\s*[^;]*(?:traceability|progresion|progression)/);
});
