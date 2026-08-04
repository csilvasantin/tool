import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("./highscore.html", import.meta.url), "utf8");

function functionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `falta ${name}`);
  let depth = 0, opened = false;
  for (let i = start; i < html.length; i += 1) {
    if (html[i] === "{") { depth += 1; opened = true; }
    if (html[i] === "}") depth -= 1;
    if (opened && depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`función incompleta: ${name}`);
}

test("cada agente tiene una línea inferior de progresión accesible", () => {
  assert.match(html, /<tr class="score-progress' \+ alterna \+ '" id="' \+ esc\(progressId\) \+ '" hidden><td colspan="9">' \+ progresionHtml\(a\)/);
  assert.match(html, /<button class="score-toggle" type="button" aria-expanded="false" aria-controls="' \+ esc\(progressId\)/);
  assert.match(html, /class="progression" role="list" aria-label=/);
  assert.match(html, /class="progression-step ' \+ s\.state[\s\S]*role="listitem"[\s\S]*data-stage=/);
  for (const stage of ["Objetivo", "Ventana", "Misión", "Tareas", "Puntos"]) assert.match(html, new RegExp(`label:\"${stage}\"`));
});

test("nuevo, activo, completado y futuro se distinguen también sin animación", () => {
  assert.match(html, /\.progression-step\.new\{color:var\(--accent\)\}/);
  assert.match(html, /\.progression-step\.active\{color:var\(--good\)\}/);
  assert.match(html, /\.progression-step\.completed\{color:var\(--brand\)\}/);
  assert.match(html, /\.progression-step\.future\{opacity:\.55\}/);
  assert.match(html, /prefers-reduced-motion:reduce[^}]*progression-step\.new \.progression-dot[^}]*\{animation:none!important/);
  assert.match(html, /@media \(max-width:620px\)[\s\S]*\.progression\{grid-template-columns:88px repeat\(5,76px\);min-width:500px/);
});

test("traceability.chains enlaza por identidad y gana al fallback compatible", () => {
  assert.match(html, /datos\.actividadMeta && datos\.actividadMeta\.traceability/);
  assert.match(html, /Array\.isArray\(traceability\.chains\)/);
  assert.match(html, /claveAgenteTrazabilidad\(chain\.agent\) !== agentKey/);
  assert.match(html, /chainMachine === machineKey/);
  assert.match(html, /progresionTrazada === "function" && progresionTrazada\(a\)\)[\s\S]*a\.progression \|\| a\.journey \|\| a\.lifecycle/);

  const context = vm.createContext({
    datos: { actividadMeta: { traceability: { chains: [{
      id:"FLT-1170", agent:"OraculoMacMini", machine:"Mac Mini", project:"yokup.com", latest_at:"2026-08-04T12:00:00Z",
      origin:{type:"objective", id:"OBJ-1", title:"Mejorar Highscore", is_new:false},
      windows:[{id:"DEC-1", at:"2026-08-04T10:00:00Z"}],
      mission:{id:"FLT-1170", title:"Trazabilidad", is_new:true},
      tasks:[{id:"T-1", status:"in_progress", is_new:false}], points:{total:40}
    }] } } },
    window: { ykAgentIdentity: {
      parse(value) { return {persona:String(value).replace(/MacMini$/, "")}; },
      key(value) { return String(value).toLowerCase(); }
    } },
    ETAPAS_PROGRESO: [
      {key:"objetivo", aliases:["objective", "objetivo"]}, {key:"ventana", aliases:["window", "ventana"]},
      {key:"mision", aliases:["mission", "mision"]}, {key:"tareas", aliases:["tasks", "tareas"]},
      {key:"puntos", aliases:["points", "puntos"]}
    ],
    Date, Number, String, Array, Object
  });
  for (const name of ["normaliza", "claveTrazabilidad", "claveAgenteTrazabilidad", "instanteTrazabilidad", "tipoEtapa", "progresionTrazada"])
    vm.runInContext(functionSource(name), context);
  vm.runInContext('globalThis.resultado=progresionTrazada({agent:"Oraculo",machine:"Mac Mini",project:"yokup.com"});', context);
  assert.equal(context.resultado.linked, true);
  assert.equal(context.resultado.origin, "objetivo");
  assert.equal(context.resultado.stages[2].state, "new");
  assert.equal(context.resultado.stages[4].value, "40 pts");
});

test("sin cadena enlazada el fallback se identifica como agregado y no inventa relación", () => {
  assert.match(html, /linked:false, origin:origen, label:"Resumen del día · cadena sin enlazar"/);
  assert.match(html, /progreso\.linked \? progreso\.label : "Resumen no enlazado"/);
  assert.match(html, /data-linked="' \+ \(progreso\.linked \? "true" : "false"\)/);
});
