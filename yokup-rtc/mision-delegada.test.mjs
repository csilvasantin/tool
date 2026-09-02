import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Una peticion de un agente a otro por Telegram TIENE que verse en yokup como mision
// delegada. No se veia: bot-say.sh antepone «Soy <Agente> y estoy corriendo en el
// ordenador <Equipo>.» y fleetEsMision descartaba por ese prefijo, asi que ninguna
// peticion entre agentes llegaba a mision. Comprobado en vivo con el encargo #1517.
const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');

function extraer(nombre) {
  const i = source.indexOf(`function ${nombre}(`);
  assert.ok(i > 0, `falta ${nombre}`);
  return source.slice(i, source.indexOf('\n}\n', i) + 2);
}

const banco = new Function('cleanMissionAttributions', '__name', `
  ${extraer('quitarPreambuloDeAgente')}
  ${extraer('fleetEsMision')}
  ${extraer('fleetSubject')}
  return { quitarPreambuloDeAgente, fleetEsMision, fleetSubject };
`)((v) => v, () => {});

const PREAMBULO = 'Soy MorfeoMacMini y estoy corriendo en el ordenador MacMini.\n';
const encargo = (texto) => ({ text: texto, target_persona: 'Neo', target_machine: 'macbookpronegro14' });

test('una peticion de agente a agente SI es mision', () => {
  const real = PREAMBULO + 'Neo: en MacBookProNegro14, haz git pull y reinicia los vigilantes de bandeja.';
  assert.equal(banco.fleetEsMision(encargo(real)), true);
});

test('el asunto es la peticion, no el saludo', () => {
  const real = PREAMBULO + 'Neo: en MacBookProNegro14, haz git pull y reinicia los vigilantes.';
  const asunto = banco.fleetSubject(real);
  assert.doesNotMatch(asunto, /estoy corriendo en/);
  assert.match(asunto, /^Neo: en MacBookProNegro14/);
});

test('un saludo de presencia se sigue descartando', () => {
  assert.equal(banco.fleetEsMision(encargo('Soy Neo y estoy corriendo en el ordenador MacBookProNegro14.')), false);
  assert.equal(banco.fleetEsMision(encargo(PREAMBULO + 'Llamadme cuando querais.')), false);
  assert.equal(banco.fleetEsMision(encargo(PREAMBULO + 'Sigo vivo.')), false);
});

test('lo que ya se filtraba se sigue filtrando', () => {
  for (const ruido of ['ACK #1234', '✅ desplegado', 'Recibido', 'Neo en MacMini operativo'])
    assert.equal(banco.fleetEsMision(encargo(ruido)), false, ruido);
});

test('sin destinatario sigue siendo charla', () => {
  assert.equal(banco.fleetEsMision({ text: PREAMBULO + 'Neo: haz git pull' }), false);
});

test('un encargo de carbono, sin preambulo, no cambia', () => {
  assert.equal(banco.fleetEsMision(encargo('Rehacer PlayerTaza desde el MacBook Pro 16.')), true);
  assert.equal(banco.fleetSubject('Rehacer PlayerTaza desde el MacBook Pro 16.'), 'Rehacer PlayerTaza desde el MacBook Pro 16.');
});
