// FLT-1009 — Prueba unitaria del parámetro {topic} de POST /ideas/generate.
// El generador de ideas del Consejo (generateCouncilIdea) acepta un tema opcional:
// si viene, la idea nace CENTRADA en ese tema manteniendo la voz del punto fuerte
// de la silla; si no viene (p.ej. el cron), sigue libre. Dos capas:
//   1) copia FIEL de la construcción del prompt (topicClean + focoTema) → comportamiento.
//   2) guarda sobre el propio src/index.js → que la firma y las llamadas no deriven.
// No toca producción. Ejecutar: `node --test ideas-generate-topic.test.mjs`.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, "src", "index.js"), "utf8");

// ── Copia FIEL de la lógica de tema dentro de generateCouncilIdea(env, seat, topic).
// Reproduce el saneado del tema, el bloque focoTema y su inserción en el prompt.
const COUNCIL = {
  ceo: { role: "CEO", alias: "Morfeo", fuerte: "la visión de negocio" },
  cto: { role: "CTO", alias: "Neo", fuerte: "la arquitectura técnica" },
};
function buildPrompt(seat, topic) {
  const c = COUNCIL[seat];
  const topicClean = String(topic || "").replace(/\s+/g, " ").trim().slice(0, 240);
  const previos = "(ninguna todavía)";
  const focoTema = topicClean ? "\n\nCENTRA tu idea EXCLUSIVAMENTE en este tema: " + topicClean + "\nHabla de ese tema de verdad, en concreto; no lo cambies por otro. Manten tu voz de " + c.role + " (" + c.fuerte + "), pero la idea DEBE ser sobre ese tema." : "";
  const prompt = `Eres ${c.role} del Consejo de AdmiraNeXT, con el espíritu de ${c.alias}. Tu punto fuerte es ${c.fuerte}.

AdmiraNeXT es un ecosistema de señalización digital (DOOH) construido por agentes de IA: yokup.com, admira.live, pixeria, xpaceos y admira.tv.

Propón UNA idea u objetivo CONCRETO y accionable para MEJORAR AdmiraNeXT, mirándolo desde tu punto fuerte (${c.role}).${focoTema} Que sea DISTINTA de estas ideas ya propuestas:
${previos}`;
  return { topicClean, focoTema, prompt };
}

// ── 1 · COMPORTAMIENTO: con tema, sin tema, saneado ──────────────────────────
test("sin topic: el prompt NO cambia (foco vacío, sigue libre como el cron)", () => {
  const { focoTema, prompt } = buildPrompt("ceo", undefined);
  assert.equal(focoTema, "");
  assert.ok(!prompt.includes("CENTRA tu idea EXCLUSIVAMENTE"));
  assert.ok(prompt.includes("desde tu punto fuerte (CEO). Que sea DISTINTA"));
});

test("topic vacío o solo espacios se trata como sin topic", () => {
  assert.equal(buildPrompt("ceo", "").focoTema, "");
  assert.equal(buildPrompt("ceo", "   \n  ").focoTema, "");
});

test("con topic: el prompt se CENTRA en el tema y conserva la voz de la silla", () => {
  const tema = "Generador de Créditos para admiranext.com";
  const { prompt } = buildPrompt("cto", tema);
  assert.ok(prompt.includes("CENTRA tu idea EXCLUSIVAMENTE en este tema: " + tema), "incluye el tema literal");
  assert.ok(prompt.includes("la idea DEBE ser sobre ese tema"), "obliga a no cambiar de tema");
  // La voz del punto fuerte de la silla se mantiene (rol + fuerte del CTO).
  assert.ok(prompt.includes("Eres CTO del Consejo"), "mantiene el rol de la silla");
  assert.ok(prompt.includes("Manten tu voz de CTO (la arquitectura técnica)"), "recuerda la voz de la silla");
});

test("topic se sanea: colapsa espacios y recorta a 240 caracteres", () => {
  assert.equal(buildPrompt("ceo", "  hola    mundo\n\ttema  ").topicClean, "hola mundo tema");
  const largo = "x".repeat(300);
  assert.equal(buildPrompt("ceo", largo).topicClean.length, 240);
});

// ── 2 · GUARDA sobre src/index.js (que la firma y las llamadas no deriven) ────
test("la firma de generateCouncilIdea acepta el 3er parámetro topic", () => {
  assert.ok(SRC.includes("async function generateCouncilIdea(env, seat, topic, projectHint)"));
});

test("la ruta POST /ideas/generate lee {topic} y lo pasa al generador", () => {
  assert.ok(SRC.includes('const topic = String(b && b.topic || "").trim();'), "extrae topic del body");
  assert.ok(SRC.includes("await generateCouncilIdea(env, seat, topic, projectHint)"), "lo pasa al generador");
});

test("el cron NO pasa topic (la generación programada sigue libre)", () => {
  assert.ok(SRC.includes("await generateCouncilIdea(env, seat);"), "llamada de 2 args intacta en el cron");
});
