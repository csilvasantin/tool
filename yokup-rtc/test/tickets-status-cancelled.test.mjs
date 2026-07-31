import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const worker = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');

test('el cambio en bloque acepta cancelled y lo propaga a Telegram', () => {
  assert.match(worker, /\["open", "in_progress", "resolved", "cancelled"\]\.includes\(status\)/);
  assert.match(worker, /status === "cancelled" \? "cancelled" : "pending"/);
  assert.match(worker, /b\.status === "cancelled" \? "cancelled" : "pending"/);
  assert.match(worker, /bulk-status/);
});

test('la sincronización de flota no resucita una misión eliminada', () => {
  assert.match(worker, /prev\.status === "cancelled" && st !== "cancelled"/);
  assert.match(worker, /if \(r\.status === "cancelled"\) continue/);
});
