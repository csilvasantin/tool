import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');

test('la tanda conserva el orden circular desde la misión elegida', () => {
  assert.match(source, /const optionIndex = \(chosen \+ position\) % count/);
  assert.match(source, /const count = options\.length - 1/);
});

test('OnIdle exige tres misiones y Volver atrás, con límite por hora de Madrid', () => {
  assert.match(source, /options\.length === 4/);
  assert.match(source, /isBackOption\(options\[3\]\)/);
  assert.match(source, /function madridHourKey/);
  assert.match(source, /error: "hourly_limit"/);
  assert.doesNotMatch(source, /error: "daily_limit"/);
});

test('el plan canónico tiene sólo tres tareas delegables: Terra, Terra y Luna', () => {
  const body = source.match(/function batchMissionPlan\(title\) \{([\s\S]*?)\n\}/)?.[1] || '';
  const owners = [...body.matchAll(/owner: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(owners, ['subagente', 'subagente', 'infraagente']);
});

test('la cola no avanza sin evento de aceptación del Agente', () => {
  assert.match(source, /ticket\.status !== "resolved" \|\| !\(await batchClosureAccepted/);
  assert.match(source, /requires: \["evidence", "accepted_by"\]/);
});
