import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// Contrato del SELECTOR DE PROYECTO de la esquina del gráfico (Carlos, 14-ago-2026):
// el detalle se abre contra un proyecto, pero un agente reparte el día entre varios y
// tiene que poder saltar entre ellos para leer su registro de misiones. Lo que se
// protege aquí es que la lista salga del periodo —no del histórico entero—, que el
// proyecto abierto NUNCA falte y que la vista aguante un backend que todavía no manda
// el campo (pestaña abierta desde antes del despliegue del worker).
//
// Los arrays se comparan con Array.from a propósito: los que salen del vm pertenecen a
// otro realm y deepStrictEqual los rechaza aunque tengan la misma forma.

const helper = fs.readFileSync(new URL("./highscore-detail.js", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("./highscore-detail-page.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./highscoreDetail.html", import.meta.url), "utf8");
const identity = fs.readFileSync(new URL("./yk-agent-identity.js", import.meta.url), "utf8");
const context = vm.createContext({ Intl, Date, URLSearchParams, sessionStorage: { getItem: () => null } });
vm.runInContext(identity, context); vm.runInContext(helper, context);
const D = context.YkHighscoreDetail;

const AHORA = Date.UTC(2026, 7, 14, 10, 0, 0);
const base = (extra = {}) => ({
  ok: true, agent: "NeoMBP14", project_id: "admira-tv", project_name: "Admira TV",
  generated_at: AHORA, sampled_at: AHORA,
  timezone: "Europe/Madrid", period: "today",
  range: { start: 1, end: 2, start_day: "2026-08-14", end_day: "2026-08-14", from: "2026-08-14", to: "2026-08-14" },
  metrics: { objectives: 0, windows: 0, missions: 0, tasks: 0, points: 0 },
  evolution: { start: "2026-08-14", end: "2026-08-14", days: [] }, timeline: [], ...extra,
});

test("la lista respeta el orden del backend y conserva nombre y recuento de misiones", () => {
  const worked = D.periodHistory(base({
    projects_worked: [
      { project_id: "yokup", project_name: "Yokup", missions: 3, last_at: 300 },
      { project_id: "admira-tv", project_name: "Admira TV", missions: 1, last_at: 100 },
    ],
  }), { agent: "NeoMBP14", projectId: "admira-tv", period: "today" }, context.ykAgentIdentity, AHORA).projectsWorked;
  assert.deepEqual(Array.from(worked, (row) => [row.projectId, row.projectName, row.missions]),
    [["yokup", "Yokup", 3], ["admira-tv", "Admira TV", 1]]);
});

test("el proyecto abierto entra aunque no tenga misiones en el periodo", () => {
  const worked = D.periodHistory(base({
    projects_worked: [{ project_id: "yokup", project_name: "Yokup", missions: 2, last_at: 300 }],
  }), { agent: "NeoMBP14", projectId: "admira-tv", period: "today" }, context.ykAgentIdentity, AHORA).projectsWorked;
  assert.equal(worked.length, 2);
  assert.equal(worked[0].projectId, "admira-tv");
  assert.equal(worked[0].missions, 0, "no se inventa actividad para el proyecto abierto");
});

test("sin el campo, o con basura dentro, la vista no se queda sin ámbito", () => {
  for (const value of [undefined, null, [], "yokup", [{}, { project_id: "" }]]) {
    const worked = D.periodHistory(base({ projects_worked: value }),
      { agent: "NeoMBP14", projectId: "admira-tv", period: "today" }, context.ykAgentIdentity, AHORA).projectsWorked;
    assert.deepEqual(Array.from(worked, (row) => row.projectId), ["admira-tv"], String(JSON.stringify(value)));
    assert.equal(worked[0].projectName, "Admira TV");
  }
});

test("un proyecto repetido no duplica la opción del selector", () => {
  const worked = D.periodHistory(base({
    projects_worked: [
      { project_id: "yokup", project_name: "Yokup", missions: 2, last_at: 300 },
      { project_id: "yokup", project_name: "Yokup", missions: 9, last_at: 900 },
    ],
  }), { agent: "NeoMBP14", projectId: "admira-tv", period: "today" }, context.ykAgentIdentity, AHORA).projectsWorked;
  // El proyecto abierto encabeza cuando el backend no lo mandó (mismo criterio que el
  // test anterior): lo que se está mirando no puede quedar escondido en la lista.
  assert.deepEqual(Array.from(worked, (row) => row.projectId), ["admira-tv", "yokup"]);
  assert.equal(worked[1].missions, 2, "del repetido gana la primera, que es la que el backend ordenó");
});

test("la esquina del gráfico monta el selector y cambiar de proyecto RELEE el ámbito", () => {
  assert.match(page, /projectScopePicker\(data,stateValue\)/, "la cabecera del panel usa el selector");
  assert.doesNotMatch(page, /stateValue\.projectId\+" · periodo completo"/, "ya no queda la etiqueta muerta");
  // Con un solo proyecto no se pinta un desplegable de una sola opción.
  assert.match(page, /if\(lista\.length<2\)/);
  // Cambiar de proyecto NO puede reutilizar los datos en memoria: enseñaría el
  // registro del proyecto anterior bajo el nombre del nuevo.
  const scope = page.match(/function selectProject\([^)]*\)\{[\s\S]*?load\(value\);\}/);
  assert.ok(scope, "selectProject existe");
  assert.match(scope[0], /activeData=null/);
  assert.match(scope[0], /activeScope=""/);
  assert.match(scope[0], /load\(value\)/);
});

test("el selector tiene estilo propio y área táctil suficiente", () => {
  assert.match(html, /\.project-scope-select\{[^}]*min-height:28px/);
  assert.match(html, /\.project-scope-label\{/);
});
