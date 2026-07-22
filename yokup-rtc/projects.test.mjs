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
