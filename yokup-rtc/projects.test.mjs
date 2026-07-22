// FLT-984 — censo de proyectos y su asignación a máquinas y agentes.
// Pruebas de FORMA sobre el fuente (mismo estilo que el resto del repo): que el
// esquema, los endpoints y el carril público sigan donde se acordó.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');

test('el esquema crea projects, project_members y la columna project de tickets', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS projects \(id TEXT PRIMARY KEY/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS project_members \(project_id TEXT, kind TEXT, ref TEXT/);
  assert.match(source, /ALTER TABLE tickets ADD COLUMN project TEXT/);
});

test('un proyecto se asigna a máquinas Y a agentes, por los ids de admira-fleet', () => {
  assert.match(source, /for \(const kind of \["machine", "agent"\]\)/);
  assert.match(source, /kind === "machine" \? "machines" : "agents"/);
});

test('están los cinco endpoints: listar, alta/edición, baja, asignar y misión', () => {
  assert.match(source, /url\.pathname === "\/projects" && req\.method === "GET"/);
  assert.match(source, /url\.pathname === "\/projects" && req\.method === "POST"/);
  assert.match(source, /url\.pathname === "\/projects\/delete" && req\.method === "POST"/);
  assert.match(source, /url\.pathname === "\/projects\/assign" && req\.method === "POST"/);
  assert.match(source, /url\.pathname === "\/projects\/mission" && req\.method === "POST"/);
});

test('/projects va por el carril ABIERTO: los agentes no cruzan la verja', () => {
  const protegidas = source.match(/var PROTECTED = [^;]+;/)[0];
  assert.ok(!/\/projects/.test(protegidas), 'PROTECTED no debe incluir /projects');
});

test('la baja no deja misiones apuntando a un proyecto que ya no existe', () => {
  assert.match(source, /UPDATE tickets SET project='' WHERE project=\?/);
});

test('asignar una misión a un proyecto exige que el proyecto esté dado de alta', () => {
  assert.match(source, /no está dado de alta; créalo en \/equipo/);
});

test('las listas de misiones llevan el proyecto y su nombre humano', () => {
  assert.match(source, /SELECT id,screen,subject,loc,project,role,status/);
  assert.match(source, /project_name: resolveProject\(pidx, r\.project \|\| ""\)\.name/);
});

// ── FLT-985 b — orden de las fichas y responsable de carbono ────────────────
test('el esquema añade owner (responsable de carbono) y sort_order', () => {
  assert.match(source, /ALTER TABLE projects ADD COLUMN owner TEXT/);
  assert.match(source, /ALTER TABLE projects ADD COLUMN sort_order INTEGER/);
});

test('el orden manual manda y lo no colocado cae detrás con el orden de siempre', () => {
  assert.match(source, /ORDER BY \(sort_order IS NULL\), sort_order, \(status='activo'\) DESC, name COLLATE NOCASE/);
});

test('owner viaja en la lista y se guarda en el alta/edición', () => {
  assert.match(source, /owner: p\.owner \|\| ""/);
  assert.match(source, /owner: val\("owner", 80\)/);
  assert.match(source, /INSERT INTO projects \(id,name,blurb,web,status,color,owner,/);
  assert.match(source, /owner=excluded\.owner/);
});

test('/projects/order guarda el orden y va por el carril ABIERTO', () => {
  assert.match(source, /url\.pathname === "\/projects\/order" && req\.method === "POST"/);
  assert.match(source, /UPDATE projects SET sort_order=\? WHERE id=\?/);
  const protegidas = source.match(/var PROTECTED = [^;]+;/)[0];
  assert.ok(!/\/projects\/order/.test(protegidas), 'PROTECTED no debe incluir /projects/order');
});

test('colocar una ficha NO cuenta como editarla: updated_at no se toca', () => {
  const bloque = source.match(/\/projects\/order[\s\S]{0,1400}?\n    \}/)[0];
  assert.ok(!/updated_at/.test(bloque), 'el endpoint de orden no debe tocar updated_at');
});

test('un id que ya no está en el censo no tumba el guardado del orden', () => {
  assert.match(source, /const orden = \[\.\.\.new Set\(ids\)\]\.filter\(\(id\) => vivos\.has\(id\)\)/);
});
