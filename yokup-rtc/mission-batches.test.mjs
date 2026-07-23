import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');

test('la tanda conserva el orden circular desde la misión elegida', () => {
  assert.match(source, /const optionIndex = \(chosen \+ position\) % count/);
  assert.match(source, /const count = options\.length - 1/);
});

test('el plan canónico tiene sólo tres tareas delegables y owners ligados al equipo', () => {
  const body = source.match(/function batchMissionPlan\(title, agent, machine\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.equal([...body.matchAll(/\{ code:/g)].length, 3);
  assert.equal([...body.matchAll(/scopedAgentIdentity\(base, machine, "sub"\)/g)].length, 2);
  assert.equal([...body.matchAll(/scopedAgentIdentity\(base, machine, "infra"\)/g)].length, 1);
});

test('la cola no avanza sin evento de aceptación del Agente', () => {
  assert.match(source, /ticket\.status !== "resolved" \|\| !\(await batchClosureAccepted/);
  assert.match(source, /requires: \["evidence", "accepted_by"\]/);
});
