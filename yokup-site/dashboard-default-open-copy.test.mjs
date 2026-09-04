import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./dashboard.html", import.meta.url), "utf8");

function openingTag(id) {
  const match = source.match(new RegExp(`<details\\b[^>]*\\bid=["']${id}["'][^>]*>`));
  assert.ok(match, `falta #${id}`);
  return match[0];
}

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`(?:^|\\n)${escaped}\\{([^}]*)\\}`, "m"));
  assert.ok(match, `falta la regla ${selector}`);
  return match[1];
}

function px(rule, property) {
  const match = rule.match(new RegExp(`${property}\\s*:\\s*([0-9.]+)(?:px)?(?:;|$)`));
  assert.ok(match, `falta ${property} en ${rule}`);
  return Number(match[1]);
}

test("Proyectos y Equipos nacen abiertos pero las demás secciones siguen cerradas", () => {
  for (const id of ["projectAgentSection", "projectAgentProjectsPane", "projectAgentTeamsPane"])
    assert.match(openingTag(id), /\sopen(?:\s|>)/, `#${id} debe nacer abierto`);
  for (const id of ["pulseSection", "liveExperiencesSection", "modulesSection"])
    assert.doesNotMatch(openingTag(id), /\sopen(?:\s|>)/, `#${id} debe seguir cerrado`);
});

test("el h1 permanece intacto y la antigua subfrase desaparece por completo", () => {
  assert.equal((source.match(/<h1>Plataforma agéntica de gestión de Xperiencias<\/h1>/g) || []).length, 1);
  assert.doesNotMatch(source, /<p class="sub">/);
  assert.doesNotMatch(source, /Agentes que\s*(?:<[^>]+>)*\s*ven cada Xpace/i);
  assert.doesNotMatch(source, /(?:^|\n)\.sub(?:\b|\s|\{|\.)/m,
    "no debe quedar CSS muerto reservando espacio para la subfrase");
});

test("el título enlaza directamente con el ritmo de récord sin un hueco residual", () => {
  assert.match(source,
    /<h1>Plataforma agéntica de gestión de Xperiencias<\/h1>\s*<section class="record-pace"/);
  const h1 = cssRule("h1");
  const h1Margin = h1.match(/margin\s*:\s*([0-9.]+)px\s+[^;]+\s+([0-9.]+)px/);
  assert.ok(h1Margin, "el h1 conserva márgenes explícitos");
  const titleBottom = Number(h1Margin[2]);
  const recordTop = px(cssRule(".record-pace"), "margin-top");
  assert.ok(titleBottom + recordTop <= 18,
    `el hueco combinado hasta la tarjeta sigue siendo ${titleBottom + recordTop}px`);
});
