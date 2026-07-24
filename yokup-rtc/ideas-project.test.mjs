// FLT-1009 — ideas centradas en un PROYECTO del censo.
// Pruebas de FORMA sobre el fuente (mismo estilo que projects.test.mjs): que la
// columna `project` existe, que el generador del Consejo sortea un proyecto del
// censo con web cuando NO hay tema, que POST /ideas valida el project contra el
// censo, y que GET /ideas lo devuelve. Además, un test de comportamiento sobre la
// lógica de selección de proyecto extraída del generador.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const SRC = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');

test('el esquema de ideas añade la columna project (migración aditiva e idempotente)', () => {
  assert.match(SRC, /ALTER TABLE ideas ADD COLUMN project TEXT"\)\.catch\(\(\) => \{\}\)/);
});

test('generateCouncilIdea acepta projectHint y guarda el slug en la fila', () => {
  assert.ok(SRC.includes("async function generateCouncilIdea(env, seat, topic, projectHint)"), "firma con projectHint");
  // La inserción del Consejo incluye la columna project y liga projSlug.
  assert.match(SRC, /INSERT INTO ideas \(id,title,body,author,tag,status,created_at,updated_at,mission_id,seat,project\)/);
  assert.ok(SRC.includes(', seat, projSlug).run();'), "liga projSlug en el INSERT del Consejo");
});

test('sin tema y sin hint se sortea un proyecto del censo CON web', () => {
  // Filtra el censo por los que tienen web y elige uno al azar solo si no hay tema.
  assert.ok(SRC.includes("if (!proj && !topicClean) {"), "solo sortea sin tema y sin hint");
  assert.match(SRC, /filter\(\(p\) => p && p\.web && String\(p\.web\)\.trim\(\)\)/);
  assert.ok(SRC.includes("withWeb[Math.floor(Math.random() * withWeb.length)]"), "elige al azar entre los que tienen web");
});

test('un projectHint válido manda; el tema explícito no mete el foco de proyecto', () => {
  assert.ok(SRC.includes('const hint = String(projectHint || "").trim();'), "lee el hint");
  assert.ok(SRC.includes("if (hint) { const p = idx.get(hint); if (p) proj = p; }"), "resuelve el hint contra el censo");
  // focoProyecto solo entra en el prompt cuando NO hay tema (el tema manda).
  assert.ok(SRC.includes("const focoProyecto = (!topicClean && proj)"), "el tema manda sobre el proyecto");
  assert.ok(SRC.includes("${focoTema}${focoProyecto}"), "el prompt inserta ambos focos en orden");
});

test('POST /ideas/generate lee {project} y lo pasa como hint', () => {
  assert.ok(SRC.includes('const projectHint = String(b && b.project || "").trim();'), "extrae project del body");
  assert.ok(SRC.includes("await generateCouncilIdea(env, seat, topic, projectHint)"), "lo pasa al generador");
});

test('POST /ideas (humano) valida project contra el censo (inválido → "")', () => {
  assert.ok(SRC.includes('const projIn = String(b.project || b.projectSlug || "").trim();'), "acepta project o projectSlug");
  assert.ok(SRC.includes("(await projectIndex(env)).get(projIn)"), "valida contra el censo");
  assert.match(SRC, /INSERT INTO ideas \(id,title,body,author,tag,status,created_at,updated_at,mission_id,seat,project\) VALUES \(\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?\)/);
});

test('GET /ideas devuelve project (columna en el SELECT + normalizado)', () => {
  assert.match(SRC, /SELECT id,title,body,author,tag,status,created_at,updated_at,mission_id,seat,review,media,project FROM ideas/);
  assert.ok(SRC.includes("it.project = it.project || \"\";"), "normaliza project a cadena");
});

// ── Comportamiento: réplica FIEL de la selección de proyecto del generador. ──
// Reproduce la lógica de resolución (hint > sorteo con web, salvo con tema) sobre
// un censo de juguete, para blindar el contrato sin levantar Workers.
function pickProject(rows, {topicClean = '', projectHint = ''} = {}) {
  const key = (x) => String(x || '').trim().toLowerCase();
  const byKey = new Map();
  for (const p of rows) { byKey.set(key(p.id), p); if (p.web) byKey.set(key(String(p.web).replace(/^https?:\/\//, '').replace(/\/.*$/, '')), p); }
  const get = (v) => byKey.get(key(v)) || null;
  let proj = null;
  const hint = String(projectHint || '').trim();
  if (hint) { const p = get(hint); if (p) proj = p; }
  if (!proj && !topicClean) {
    const withWeb = rows.filter((p) => p && p.web && String(p.web).trim());
    if (withWeb.length) proj = withWeb[Math.floor(Math.random() * withWeb.length)];
  }
  return proj ? proj.id : '';
}

test('comportamiento: sin tema, siempre sale un proyecto con web', () => {
  const rows = [
    {id: 'pixeria', web: 'https://www.pixeria.com'},
    {id: 'xpaceos', web: 'www.xpaceos.com'},
    {id: 'sin-web', web: ''},
  ];
  for (let i = 0; i < 40; i++) {
    const got = pickProject(rows, {});
    assert.ok(got === 'pixeria' || got === 'xpaceos', 'nunca elige el que no tiene web: ' + got);
  }
});

test('comportamiento: con tema NO se sortea proyecto (queda "")', () => {
  const rows = [{id: 'pixeria', web: 'https://www.pixeria.com'}];
  assert.equal(pickProject(rows, {topicClean: 'gamificación'}), '');
});

test('comportamiento: hint válido manda incluso con tema; inválido → ""/sorteo', () => {
  const rows = [{id: 'pixeria', web: 'https://www.pixeria.com'}, {id: 'xpaceos', web: 'www.xpaceos.com'}];
  assert.equal(pickProject(rows, {topicClean: 'gamificación', projectHint: 'pixeria'}), 'pixeria', 'hint válido manda con tema');
  assert.equal(pickProject(rows, {topicClean: 'gamificación', projectHint: 'no-existe'}), '', 'hint inválido con tema → ""');
  assert.equal(pickProject(rows, {projectHint: 'www.pixeria.com'}), 'pixeria', 'hint por dominio resuelve al slug');
});
