// El «latido» del censo de admira-fleet nunca fue un latido: /machines devuelve
// en lastSeen la hora en que se escribió la ficha, así que diez equipos comparten
// el mismo sello al minuto y cinco llevan 43 días con el suyo. La tarjeta lo
// esquivaba con «vivo · por agente» —honesto, pero mudo sobre la máquina cuando
// nadie corre encima—. Estas pruebas fijan que Equipo decide con /api/fleet-census,
// el mismo veredicto sondeado que ya usan /status y el dashboard.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const equipo = await readFile(new URL('./equipo.html', import.meta.url), 'utf8');

// La página es un HTML de una pieza: se extrae la función y se corre de verdad,
// que es la única forma de probar la resolución y no sólo el texto.
function resolver(censo) {
  const start = equipo.indexOf('function veredictoCenso(');
  assert.notEqual(start, -1, 'falta veredictoCenso');
  const end = equipo.indexOf('\n}', start) + 2;
  const contexto = vm.createContext({
    CEN: censo,
    norm: (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''),
    canon: (s) => String(s || ''),
  });
  vm.runInContext(equipo.slice(start, end) + '\nveredictoCenso;', contexto);
  return vm.runInContext('veredictoCenso', contexto);
}

const CENSO = [
  {id: 'admira-macmini', host: 'MacMini', online: true, ssh: true, lastSeen: 1786388317},
  {id: null, host: 'MacBookAir16plata', online: false, ssh: false, lastSeen: 0},
  {id: 'admira-asuszenbook', host: 'asuszenbook', online: false, ssh: false, lastSeen: 1783000000},
];

test('el veredicto se encuentra por el id del registro', () => {
  const v = resolver(CENSO)({id: 'admira-macmini', name: 'Mac Mini (Carlos)'});
  assert.equal(v.online, true);
  assert.equal(v.ssh, true);
  assert.equal(v.lastSeen, 1786388317);
});

test('sin id en el censo, vale el nombre del nodo', () => {
  const v = resolver(CENSO)({id: 'admira-macbookair16', name: 'MacBookAir16plata'});
  assert.equal(v.online, false);
  assert.equal(v.host, 'MacBookAir16plata');
});

test('lo que el censo no conoce devuelve null: no saber es un resultado, no un cero', () => {
  assert.equal(resolver(CENSO)({id: 'admira-pc-bot-01', name: 'PC Bot 01'}), null);
  assert.equal(resolver([])({id: 'admira-macmini', name: 'MacMini'}), null,
    'sin censo no hay veredicto que aplicar');
});

test('el veredicto manda sobre la ficha y sobre el agente que corre encima', () => {
  // Un agente vivo no resucita un equipo que no responde, y una ficha rancia no
  // mata uno que sí: ésa es toda la regla, y se lee en una línea.
  assert.match(equipo, /const on=cen\?cen\.online:\(onMaq\|\|onAg\)/);
  assert.match(equipo, /const cen=veredictoCenso\(m\)/);
});

test('sin censo se conserva exactamente la regla anterior', () => {
  assert.match(equipo, /onAg\?"vivo · por agente":"reposo"/,
    'el respaldo por agente sigue en pie cuando nadie ha comprobado nada');
  assert.match(equipo, /fetch\(CENSO,\{cache:"no-store"\}\)\.then\(r=>r\.ok\?r\.json\(\):null\)\.catch\(\(\)=>null\)/,
    'si el Mini que sondea está caído, la página no puede romperse ni inventar');
  assert.match(equipo, /CEN=\(ce&&ce\.ok&&Array\.isArray\(ce\.machines\)\)\?ce\.machines:\[\]/);
});

test('el rótulo deja de llamar latido a lo que es la hora de escribir la ficha', () => {
  assert.ok(!/"Latido propio"/.test(equipo), 'fuera el rótulo que engañaba');
  assert.match(equipo, /fila\("Ficha escrita"/);
  assert.match(equipo, /fila\("Comprobado"/);
  assert.match(equipo, /"vivo · comprobado"/);
  assert.match(equipo, /"apagado · comprobado"/);
});

test('la página deja de prometer que las máquinas se auto-registran y laten solas', () => {
  assert.ok(!/auto-registra y late/.test(equipo),
    'ninguna máquina late sola: el estado se comprueba desde fuera');
  assert.match(equipo, /un estado que se COMPRUEBA — Tailscale más un SSH real/);
  assert.match(equipo, /el estado de encendido no se edita, se comprueba/);
});
