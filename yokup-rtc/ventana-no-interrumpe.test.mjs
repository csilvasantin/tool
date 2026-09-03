import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Carlos, 3-sep-2026: «es una a la hora por defecto y si hemos hecho trabajar al agente
// esa hora no se ejecuta la ventana de decision». La ventana horaria existe por el
// mandamiento 10 —«si NO tienes trabajo, tira millas»—: a quien esta trabajando no hay
// nada que preguntarle. El guarda de OnIdle no servia porque solo mira las decisiones
// marcadas «OnIdle horario»; la automatica de la hora nace como «Ventana automatica» y
// se saltaba el guarda entero: hoy saltaron quince mientras yo trabajaba.
const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const fn = source.slice(source.indexOf('async function agenteTrabajoLaUltimaHora'),
                        source.indexOf('__name(agenteTrabajoLaUltimaHora'));

test('existe el guarda y mira la ULTIMA HORA', () => {
  assert.match(fn, /const desde = now - 60 \* 60 \* 1000;/);
});

test('trabajar es ACTIVIDAD, no tener algo abierto', () => {
  // una mision olvidada desde el martes no puede contar como hora ocupada
  for (const campo of ['created_at>=?', 'started_at>=?', 'updated_at>=?', 'resolved_at>=?'])
    assert.ok(fn.includes(campo), campo);
  assert.doesNotMatch(fn, /status IN \('open','in_progress'/);
});

test('cuenta lo del agente, no lo de su equipo entero', () => {
  assert.match(fn, /matchesOnIdleIdentity\(row, identity\)/);
  assert.match(fn, /AGENT_SOURCE_SQL/);
});

test('mira tambien los PASOS, no solo las misiones', () => {
  assert.match(fn, /FROM mission_tasks m JOIN tickets t/);
});

test('el guarda corta la automatica antes de crearla, y lo dice claro', () => {
  const puerta = source.slice(source.indexOf('LA VENTANA HORARIA NO INTERRUMPE'),
                              source.indexOf('if (!continuation && !userOverride && !onIdle)'));
  assert.match(puerta, /code: "agente_ocupado"/);
  assert.match(puerta, /ha trabajado en la ultima hora/);
  assert.match(puerta, /mandamiento 10/);
});

test('no estorba a quien decide: manual, continuacion y override entran igual', () => {
  const puerta = source.slice(source.indexOf('LA VENTANA HORARIA NO INTERRUMPE'),
                              source.indexOf('if (!continuation && !userOverride && !onIdle)'));
  assert.match(puerta, /if \(!continuation && !userOverride && !manual\)/);
});

// «agrupa las ventanas de decision y que aparezcan». Puntuaban (8 puntos cada una) pero
// no constaban como trabajo en /misiones. Una fila por ventana serian ~56 al dia entre
// toda la flota: se agrupan en UNA mision por agente y jornada.
const agrupa = source.slice(source.indexOf('async function anotarVentanaComoTrabajo'),
                            source.indexOf('__name(anotarVentanaComoTrabajo'));

test('las ventanas se agrupan por agente y jornada, no una fila por ventana', () => {
  assert.match(agrupa, /source='decision-window' AND assignee=\? AND created_at>=\? AND created_at<\?/);
  assert.match(agrupa, /UPDATE tickets SET subject=\?, updated_at=\? WHERE id=\?/);
});

test('la agrupada cuenta cuantas lleva el dia', () => {
  // lee el numero del propio asunto y le suma uno
  assert.match(agrupa, /exec\(String\(previa\.subject \|\| ""\)\)/);
  assert.match(agrupa, /\|\| 1\) \+ 1/);
  assert.match(agrupa, /ventanas · ultima:/);
});

test('anotar el trabajo NUNCA puede tumbar la ventana', () => {
  assert.match(agrupa, /catch \(e\) \{ return null; \}/);
});

test('la ventana devuelve con que trabajo quedo anotada', () => {
  assert.match(source, /const trabajo_id = await anotarVentanaComoTrabajo\(env, agent, machine, dproject, q, now\);/);
  assert.match(source, /ok: true, id, display_ref, trabajo_id/);
});
