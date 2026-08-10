import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { newSimulationTicket, ticketEvidenceFor } from "./src/simulation-evidence.js";

const worker = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
const routeStart = worker.indexOf('if (url.pathname === "/ticket/simulate"');
const routeEnd = worker.indexOf('if (url.pathname === "/ai-summary"', routeStart);
const route = worker.slice(routeStart, routeEnd);

test("el simulador genera siempre un recurso demo trazable", () => {
  const input = newSimulationTicket(() => 0.5);
  assert.match(input.screen, /^demo-[a-z0-9]{5}$/);
  assert.equal(input.source, "simulation");
  assert.equal(input.role, "DOOH");
  assert.equal(input.age, 300);
  assert.ok(input.loc);
  assert.match(route, /createTicket\(env, newSimulationTicket\(\)\)/);
  assert.doesNotMatch(route, /signage\/screens|\.screens|\.online/,
    "una pantalla real online nunca puede convertirse en material de simulación");
});

test("la evidencia simulada se declara como tal en asunto, autor, evento y triaje", () => {
  const evidence = ticketEvidenceFor("simulation");
  assert.match(evidence.subject, /^SIMULACIÓN ·/);
  assert.equal(evidence.eventAuthor, "Simulador Yokup");
  assert.match(evidence.eventText, /^SIMULACIÓN:/);
  assert.match(evidence.triageContext, /SIMULACIÓN operativa/);
  assert.doesNotMatch(evidence.eventText, /detectada automáticamente/);
  assert.match(worker, /ticketEvidenceFor\(source\)/);
  assert.match(worker, /evidence\.subject/);
  assert.match(worker, /evidence\.eventAuthor, evidence\.eventText/);
});

test("la monitorización real conserva agent-iot y su evidencia automática", () => {
  const evidence = ticketEvidenceFor("agent-iot");
  assert.equal(evidence.subject, "Pantalla sin señal de emisión");
  assert.equal(evidence.eventAuthor, "Agente IoT");
  assert.equal(evidence.eventText,
    "Incidencia detectada automáticamente: pantalla sin señal de emisión (proof-of-play caído).");
  assert.equal(evidence.triageContext, "");
  assert.match(worker, /const source = s\.source \|\| "agent-iot"/);
});
