import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Carlos, 3-sep-2026: «que no solo aparezcan en yokup.com sino tambien que se me envien a
// Telegram». Una ventana que solo vive en una pantalla que nadie mira no es una pregunta.
// Con el tope de 10 minutos caduca antes de que la vea — hoy le paso con la que pidio.
const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const fn = source.slice(source.indexOf('async function avisarVentanaPorTelegram'),
                        source.indexOf('__name(avisarVentanaPorTelegram'));

// El aviso se construye de verdad: se ejecuta la funcion con un TELEGRAM de mentira.
const avisar = new Function('__name', `${fn}\nreturn avisarVentanaPorTelegram;`)(() => {});

test('el aviso lleva pregunta, opciones, la recomendada marcada y el plazo', async () => {
  let enviado = null;
  const env = { ADMIRA_TELEGRAM_PANEL_KEY: 'x', TELEGRAM: { fetch: async (req) => { enviado = await req.json(); return { ok: true, status: 200 }; } } };
  const r = await avisar(env, { agent: 'MorfeoMacMini', machine: 'MacMini', question: '¿por donde tiramos?',
    options: ['arreglar la flota', 'la ultima milla', '13rue'], recommended: 0,
    deadline: Date.now() + 10 * 60000, display_ref: '0065.03/09/2026.07:55', projectId: 'yokup' });
  assert.equal(r.enviado, true);
  assert.match(enviado.text, /VENTANA DE DECISION · 0065/);
  assert.match(enviado.text, /MorfeoMacMini · MacMini · yokup/);
  assert.match(enviado.text, /¿por donde tiramos\?/);
  assert.match(enviado.text, /★ 1\) arreglar la flota/);   // la recomendada, marcada
  assert.match(enviado.text, /  2\) la ultima milla/);
  assert.match(enviado.text, /Caduca en 10 min/);
  assert.match(enviado.text, /yokup\.com\/decisiones/);
  // y dice que pasa si no contesta: es la mitad que hace util la ventana
  assert.match(enviado.text, /ejecuta la ★/);
});

test('marca la recomendada aunque no sea la primera', async () => {
  let enviado = null;
  const env = { ADMIRA_TELEGRAM_PANEL_KEY: 'x', TELEGRAM: { fetch: async (req) => { enviado = await req.json(); return { ok: true, status: 200 }; } } };
  await avisar(env, { agent: 'Neo', options: ['a', 'b', 'c'], recommended: 2, deadline: Date.now() + 60000 });
  assert.match(enviado.text, /★ 3\) c/);
});

test('si Telegram falla, la ventana NO se cae', async () => {
  const env = { ADMIRA_TELEGRAM_PANEL_KEY: 'x', TELEGRAM: { fetch: async () => { throw new Error('boom'); } } };
  const r = await avisar(env, { agent: 'Neo', options: ['a'], deadline: Date.now() + 60000 });
  assert.equal(r.enviado, false);
  assert.match(r.motivo, /boom/);
});

test('sin clave no se intenta, y se dice por que', async () => {
  const r = await avisar({ TELEGRAM: {} }, { agent: 'Neo', options: [], deadline: Date.now() });
  assert.equal(r.enviado, false);
  assert.match(r.motivo, /sin binding o sin clave/);
});

test('la ventana avisa al crearse, y el resultado viaja en la respuesta', () => {
  assert.match(source, /const telegram = await avisarVentanaPorTelegram\(env, \{ agent, machine, question: q, options: opts,/);
  assert.match(source, /ok: true, id, display_ref, trabajo_id, telegram,/);
});
