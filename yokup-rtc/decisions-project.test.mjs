import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');

test('el esquema de decisiones migra project de forma idempotente', () => {
  assert.match(source, /ALTER TABLE decisions ADD COLUMN project TEXT/);
});

test('POST decisions acepta, limita, persiste y devuelve project', () => {
  assert.match(source, /let dproject = String\(b\.project \|\| ""\)\.trim\(\)\.slice\(0, 120\)/);
  assert.match(source, /INSERT INTO decisions \([^)]*url,mission,project,parent_decision,batch_id\)/);
  assert.match(source, /durl, dmission, dproject, dparent, dbatch\)\.run\(\)/);
  assert.match(source, /deadline: now \+ mins \* 60000, project: dproject/);
});

// FLT-984: lo que se guarda es el ID del censo y lo que se lee es el NOMBRE
// humano, para que la ficha de /decisiones no tenga que adivinar nada.
test('POST decisions resuelve el proyecto contra el censo y lo hereda de la misión', () => {
  assert.match(source, /const pmatch = dproject && pidx\.get\(dproject\)/);
  assert.match(source, /if \(pmatch\) dproject = pmatch\.id/);
  assert.match(source, /if \(!dproject && dmission\)/);
});

test('GET lista y detalle devuelven el nombre del proyecto y su id', () => {
  assert.match(source, /project: resolveProject\(pidxG, d\.project \|\| misProj\[/);
  assert.match(source, /project_id: resolveProject\(pidxG, d\.project/);
  assert.match(source, /project: pOne\.name, project_id: pOne\.id/);
});
