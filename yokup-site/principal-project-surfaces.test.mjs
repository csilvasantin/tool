import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const dashboard = await readFile(new URL("./dashboard.html", import.meta.url), "utf8");
const equipo = await readFile(new URL("./equipo.html", import.meta.url), "utf8");
const highscore = await readFile(new URL("./highscore.html", import.meta.url), "utf8");

test("Highscore declara y aplica la precedencia diaria antes del trabajo y del censo", () => {
  assert.match(highscore, /var declarado = proyectoDeclaradoHoy\(f\);/);
  assert.match(highscore, /f\.proyectoOrigen = "declarado"/);
  assert.match(highscore, /declarado:"Proyecto principal de hoy · declarado expresamente/);
  // La faena del día no se pierde: si difiere de lo declarado, viaja como detalle.
  assert.match(highscore, /f\.proyectoFaena = f\.proyecto/);
});

test("Equipo distingue Principal hoy de las membresías estables", () => {
  assert.match(equipo, /function proyectoPrincipalHoy\(agente, maquina\)/);
  assert.match(equipo, /fila\("Principal hoy"/);
  assert.match(equipo, /const ps=PRO\.filter\(x=>\(x\.agents\|\|\[\]\)\.indexOf\(a\.id\)>=0\)/,
    "la lista estable de proyectos sigue saliendo de project_members");
});

test("Dashboard propaga la declaración diaria sin convertirla en una acción de membresía", () => {
  assert.match(dashboard, /function paAgentDailyPrimary\(agent\)/);
  assert.match(dashboard, /<b>Principal hoy<\/b>/);
  const helper = dashboard.match(/function paAgentDailyPrimary\(agent\)\{[^\n]+\}/)?.[0];
  assert.ok(helper);
  assert.doesNotMatch(helper, /paProjectAgentRefs|paProjectHasFamily/,
    "la declaración diaria no se confunde con asignación estable");
});
