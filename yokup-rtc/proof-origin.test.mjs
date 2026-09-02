import test from 'node:test';
import assert from 'node:assert/strict';
import {missionProofOrigin,RTC_MEDIA_ORIGIN} from './src/proof-origin.js';

test('api.yokup.com y el worker reconocen media propia de flota',()=>{
  assert.equal(missionProofOrigin('https://api.yokup.com/media/fleet/proof.png'),'https://api.yokup.com');
  assert.equal(missionProofOrigin(`${RTC_MEDIA_ORIGIN}/media/fleet/proof.png`),RTC_MEDIA_ORIGIN);
});

test('host parecido, protocolo o ruta ajenos no obtienen trato de media propia',()=>{
  for (const url of ['https://api.yokup.com.evil.test/media/fleet/x.png','http://api.yokup.com/media/fleet/x.png','https://api.yokup.com/otro/x.png','basura'])
    assert.equal(missionProofOrigin(url),RTC_MEDIA_ORIGIN);
});

// La captura se sube a api.yokup.com y el cierre se pide por el nombre de workers.dev:
// el worker tiene que reconocerse a si mismo en los dos, o intenta verificarse por fetch
// contra si mismo y devuelve «no se pudo verificar el contenido» con una imagen buena.
test('los dos nombres del worker cuentan como media propia',async()=>{
  const {OWN_MEDIA_ORIGINS}=await import('./src/proof-origin.js');
  assert.ok(OWN_MEDIA_ORIGINS.has('https://api.yokup.com'));
  assert.ok(OWN_MEDIA_ORIGINS.has(RTC_MEDIA_ORIGIN));
});
