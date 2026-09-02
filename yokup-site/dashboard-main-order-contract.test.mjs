import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source = await readFile(new URL("./dashboard.html", import.meta.url), "utf8");

function occurrences(pattern) {
  return [...source.matchAll(pattern)].length;
}

test("Plataforma agéntica es el primer contenido principal del Dashboard", () => {
  assert.match(
    source,
    /<div class="wrap">\s*<h1>Plataforma agéntica de gestión de Xperiencias<\/h1>\s*<details class="dash-section" id="projectAgentSection" open>/,
  );
  const titleAt = source.indexOf("<h1>Plataforma agéntica de gestión de Xperiencias</h1>");
  const projectsAt = source.indexOf('id="projectAgentSection"');
  assert.ok(titleAt >= 0 && titleAt < projectsAt, "el título precede directamente a Proyectos y agentes");
});

test("desaparece totalmente YOKUP · XPACE OS", () => {
  assert.doesNotMatch(source, /YOKUP\s*·\s*XPACE\s+OS/i);
  assert.doesNotMatch(source, /<div class="eyebrow">/i);
});

test("la reordenación conserva todos los bloques y su jerarquía", () => {
  const ordered = [
    "projectAgentSection", "pulseSection", "liveExperiencesSection", "modulesSection",
  ];
  const positions = ordered.map((id) => {
    assert.equal(occurrences(new RegExp(`id=["']${id}["']`, "g")), 1, `#${id} se conserva una sola vez`);
    return source.indexOf(`id="${id}"`);
  });
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.equal(occurrences(/<h1>Plataforma agéntica de gestión de Xperiencias<\/h1>/g), 1);
  assert.match(source, /id="projectAgentSection" open/);
  for (const id of ordered.slice(1)) {
    const tag = source.match(new RegExp(`<details\\b[^>]*id=["']${id}["'][^>]*>`));
    assert.ok(tag, `se conserva #${id}`);
    assert.doesNotMatch(tag[0], /\sopen(?:\s|>)/, `#${id} sigue compactado`);
  }
});

test("la cabecera global del producto permanece intacta", () => {
  assert.match(source, /<body data-yk-title="DASHBOARD" data-yk-zone="app">/);
  assert.match(source, /<link rel="stylesheet" href="\/yk-frame\.css\?[^"']+">/);
  assert.match(source, /<script src="\/yk-frame\.js\?[^"']+"><\/script>/);
  assert.match(source, /<script src="\/acceso\.js\?v=20260811-r4-d77633add752"><\/script>/);
});
