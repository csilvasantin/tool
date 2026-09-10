import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');

// ELECCIÓN TARDÍA Y AVISO DE CADUCIDAD (Carlos, 10-sep-2026, ventana 0020): contrato en la fuente.
test('elegir acepta ventanas pending o expired, por id o por referencia humana, y solo rechaza las ya decididas', () => {
  const choose = source.slice(source.indexOf('/^\\/decisions\\/[^/]+\\/choose$/'), source.indexOf('/^\\/decisions\\/[^/]+$/'));
  assert.match(choose, /FROM display_refs WHERE entity_type='window' AND display_ref=\?/, 'la referencia humana (0020.10/09/2026.06:37) vale como id: se resuelve en display_refs');
  assert.match(choose, /d\.status !== "pending" && d\.status !== "expired"/, 'expired ya no es un muro');
  assert.match(choose, /relabelBatchContainerAfterLateChoice\(env, chosen, idx, o\)/, 'tras caducar, el contenedor pasa a la opción elegida');
});

test('el contenedor de la ★ se renombra a la opción elegida sin tocar misiones cerradas', () => {
  const fn = source.slice(source.indexOf('async function relabelBatchContainerAfterLateChoice'), source.indexOf('__name(relabelBatchContainerAfterLateChoice'));
  assert.match(fn, /Number\(item\.option_index\) === Number\(idx\)\) return null/, 'si ya representa la elegida, nada que hacer');
  assert.match(fn, /ticket\.status === "resolved" \|\| ticket\.status === "cancelled"\) return null/, 'una misión cerrada no se renombra');
  assert.match(fn, /UPDATE tickets SET subject=\?, updated_at=\? WHERE id=\?/);
  assert.match(fn, /Elección tardía/, 'y lo cuenta en el historial de la misión');
});

test('una ventana que caduca sin elección avisa por Telegram y deja la puerta abierta', () => {
  const fn = source.slice(source.indexOf('async function expireDecisions'), source.indexOf('__name(expireDecisions, "expireDecisions")'));
  assert.match(fn, /status='pending' AND deadline < \? AND COALESCE\(parent_decision,''\) <> 'FORMACION'/, 'solo las de trabajo, no las de formación');
  assert.match(fn, /avisarCaducidadPorTelegram\(env, d\)/);
  const aviso = source.slice(source.indexOf('async function avisarCaducidadPorTelegram'), source.indexOf('__name(avisarCaducidadPorTelegram'));
  assert.match(aviso, /VENTANA CADUCADA SIN ELECCION/); assert.match(aviso, /Aun puedes elegir otra/);
});
