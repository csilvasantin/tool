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

test("el h1 permanece intacto y la descripción corta conserva las dos ideas esenciales", () => {
  assert.equal((source.match(/<h1>Plataforma agéntica de gestión de Xperiencias<\/h1>/g) || []).length, 1);
  const match = source.match(/<p class="sub">([\s\S]*?)<\/p>/);
  assert.ok(match, "falta la descripción principal");
  const plain = match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  assert.match(plain, /ven cada Xpace y actúan solos/i);
  assert.match(plain, /irreducible/i);
  const previous = "Agentes que ven cada Xpace y actúan solos: vigilan la emisión, abren la misión, la descomponen en tareas y reportan — el humano entra solo donde es irreducible.";
  assert.ok(plain.length <= previous.length * 0.7,
    `la descripción debe reducir sustancialmente sus ${previous.length} caracteres; conserva ${plain.length}`);
});

test("la descripción usa una línea compacta en escritorio y recupera lectura normal en móvil", () => {
  const sub = cssRule(".sub");
  const fontSize = sub.match(/font-size\s*:\s*(?:clamp\(\s*([0-9.]+)px[^)]*?,\s*([0-9.]+)px\)|([0-9.]+)px)/);
  assert.ok(fontSize, "la descripción debe fijar una tipografía compacta");
  const minFont = Number(fontSize[1] || fontSize[3]), maxFont = Number(fontSize[2] || fontSize[3]);
  assert.ok(minFont < 15 && maxFont <= 15, "la tipografía debe reducir los 15px anteriores");
  assert.ok(px(sub, "margin-bottom") < 26, "el margen debe ser menor que los 26px anteriores");
  const lineHeight = sub.match(/line-height\s*:\s*([0-9.]+)(px)?/);
  assert.ok(lineHeight, "la descripción debe fijar una altura de línea compacta");
  assert.ok(lineHeight[2] ? Number(lineHeight[1]) <= 18 : Number(lineHeight[1]) <= 1.4);
  const width = sub.match(/max-width\s*:\s*([0-9.]+)px/);
  assert.ok(/max-width\s*:\s*(?:none|100%)/.test(sub) || (width && Number(width[1]) >= 1000),
    "la copia corta debe poder usar ancho suficiente para una línea de escritorio");
  assert.match(source, /@media\s*\(max-width:\s*(?:620|900)px\)\{[\s\S]*?\.sub\{[^}]*(?:font-size|line-height|max-width|white-space)[^}]*\}/,
    "en móvil debe existir un override de lectura para la descripción");
});

test("se reduce de forma material el espacio entre el título y Proyectos y agentes", () => {
  const h1 = cssRule("h1"), sub = cssRule(".sub");
  const h1Margin = h1.match(/margin\s*:\s*([0-9.]+)px\s+[^;]+\s+([0-9.]+)px/);
  assert.ok(h1Margin, "el h1 conserva márgenes explícitos");
  const titleBottom = Number(h1Margin[2]), copyBottom = px(sub, "margin-bottom");
  const projectRule = source.match(/(?:^|\n)#projectAgentSection\{([^}]*)\}/m)?.[1];
  const sectionTop = projectRule ? px(projectRule, "margin-top") : px(cssRule(".dash-section"), "margin-top");
  assert.ok(titleBottom + copyBottom + sectionTop <= 36,
    `el hueco combinado hasta projectAgentSection sigue siendo ${titleBottom + copyBottom + sectionTop}px`);
});
