// FLT-1018 — «los informes no tienen estado: o están hechos o no están, y todas las
// misiones finalizadas tienen que tener su informe» (Carlos, 24-jul-2026).
// El contador del menú decía «1/18» porque contaba tareas CON parte que seguían
// abiertas: le inventaba un ciclo de vida al informe e ignoraba justo los partes ya
// escritos. Ahora informes = COBERTURA {hechos,total} sobre misiones resueltas.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const SRC = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');

function menuBody() {
  const i = SRC.indexOf('async function menuCounters(');
  assert.ok(i > 0, 'existe menuCounters');
  return SRC.slice(i, SRC.indexOf('__name(menuCounters', i));
}

test('el contador de informes ya no habla de curso/pendiente', () => {
  const b = menuBody();
  assert.ok(!/out\.informes\.curso/.test(b), 'nada de «informes en curso»');
  assert.ok(!/out\.informes\.pend/.test(b), 'nada de «informes pendientes»');
});

test('informes = cobertura {hechos,total} sobre misiones de flota resueltas', () => {
  const b = menuBody();
  assert.match(b, /out\.informes = \{ hechos:/, 'expone hechos');
  assert.match(b, /total:/, 'expone total');
  const q = b.slice(b.indexOf('SELECT COUNT(*) total'), b.indexOf('out.informes ='));
  assert.match(q, /t\.source='fleet'/, 'sólo misiones de flota');
  assert.match(q, /t\.status='resolved'/, 'el universo son las TERMINADAS: son las que deben parte');
  assert.match(q, /TRIM\(m\.report\)!=''/, 'un parte vacío no cuenta como informe');
});

test('una misión resuelta con parte en CUALQUIER tarea cuenta como cubierta', () => {
  const b = menuBody();
  const q = b.slice(b.indexOf('SELECT COUNT(*) total'), b.indexOf('out.informes ='));
  assert.match(q, /EXISTS \(/, 'EXISTS: basta un parte, no uno por tarea');
  assert.match(q, /m\.mission_id=t\.id/, 'ata el parte a su misión');
});

test('/fleet/missions publica has_report para poder señalar la que falta', () => {
  const i = SRC.indexOf('async function fleetMissions(');
  const b = SRC.slice(i, SRC.indexOf('__name(fleetMissions', i));
  assert.match(b, /CASE WHEN report IS NOT NULL AND TRIM\(report\)!='' THEN 1 ELSE 0 END has_report/,
    'la tarea viaja con la bandera, no con el texto del parte');
  assert.match(b, /has_report: tasks\.some\(/, 'la misión hereda la bandera de sus tareas');
  assert.ok(!/SELECT mission_id,code,title,status,owner,report FROM/.test(b),
    'no se arrastra el texto de 120 partes por la red');
});
