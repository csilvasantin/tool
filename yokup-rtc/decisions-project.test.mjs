import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');

test('el esquema de decisiones migra project de forma idempotente', () => {
  assert.match(source, /ALTER TABLE decisions ADD COLUMN project TEXT/);
});

test('POST decisions acepta, limita, persiste y devuelve project', () => {
  assert.match(source, /const dproject = String\(b\.project \|\| ""\)\.trim\(\)\.slice\(0, 120\)/);
  assert.match(source, /INSERT INTO decisions \([^)]*url,mission,project,parent_decision,batch_id\)/);
  assert.match(source, /durl, dmission, dproject, dparent, dbatch\)\.run\(\)/);
  assert.match(source, /deadline: now \+ mins \* 60000, project: dproject/);
});

test('GET lista y detalle devuelven project junto a mission y url', () => {
  assert.match(source, /url: d\.url \|\| "", mission: d\.mission \|\| "", project: d\.project \|\| ""/);
  assert.match(source, /project: d\.project \|\| "", mission: d\.mission \|\| "", url: d\.url \|\| ""/);
});
