import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GlobeRotation, worldStyle} from './home-globe.mjs';

function rig(reducedMotion = false) {
  let center = {lng: -20, lat: 18}, next = 0;
  const pending = new Map(), writes = [];
  const rotation = new GlobeRotation({
    readCenter: () => center,
    writeCenter: ([lng, lat]) => { center = {lng, lat}; writes.push(center); },
    requestFrame: fn => { pending.set(++next, fn); return next; },
    cancelFrame: id => pending.delete(id), reducedMotion
  });
  return {rotation, pending, writes, center: () => center,
    advance(time) { const entry = pending.entries().next().value; assert.ok(entry, 'animation frame queued'); pending.delete(entry[0]); entry[1](time); }};
}
test('starts stationary and rotates only after explicit activation', () => {
  const r = rig(); assert.equal(r.rotation.enabled, false); assert.equal(r.pending.size, 0);
  r.rotation.update({ready: true, enabled: true}); r.advance(0); r.advance(100);
  assert.ok(Math.abs(r.center().lng - (-19.76)) < .00001);
  assert.equal(r.center().lat, 18); assert.equal(r.pending.size, 1);
});
test('rotation uses elapsed time rather than display refresh rate', () => {
  const a = rig(), b = rig(); a.rotation.update({ready: true, enabled: true}); b.rotation.update({ready: true, enabled: true});
  for (let t=0;t<=1000;t+=20) a.advance(t);
  for (let t=0;t<=1000;t+=10) b.advance(t);
  assert.ok(Math.abs(a.center().lng-b.center().lng) < .00001);
});
test('pause cancels frames; resume and background-tab return do not jump', () => {
  const r = rig(); r.rotation.update({ready: true, enabled: true}); r.advance(0); r.advance(100);
  const before = r.center().lng;
  r.rotation.update({enabled: false}); assert.equal(r.pending.size, 0);
  r.rotation.update({enabled: true}); r.advance(60000); assert.equal(r.center().lng, before);
  r.rotation.update({visible: false}); assert.equal(r.pending.size, 0);
  r.rotation.update({visible: true}); r.advance(120000); assert.equal(r.center().lng, before);
  r.advance(120100); assert.ok(r.center().lng > before);
});
test('reduced motion starts still, but the user can explicitly resume', () => {
  const r = rig(true); r.rotation.update({ready: true}); assert.equal(r.pending.size, 0);
  r.rotation.update({enabled: true}); r.advance(0); r.advance(100); assert.equal(r.writes.length, 1);
});
test('slow frames are bounded and dispose cancels animation', () => {
  const r = rig(); r.rotation.update({ready: true, enabled: true}); r.advance(0); r.advance(1000000);
  assert.ok(r.center().lng < -19); r.rotation.dispose(); assert.equal(r.pending.size, 0);
});
test('longitude wraps around the world without changing latitude', () => {
  const r = rig(); r.rotation.update({ready: true, enabled: true});
  for(let t=0;t<=200000;t+=100)r.advance(t);
  assert.ok(r.writes.every(c => c.lng >= -180 && c.lng < 180 && c.lat === 18));
});
test('initial globe has only world geography, no selected circuits or customer markers', async () => {
  const style = worldStyle(); assert.deepEqual(style.projection, {type:'globe'});
  assert.deepEqual(Object.keys(style.sources), ['land']);
  assert.deepEqual(style.layers.map(l => l.type), ['background','fill']);
  const land = JSON.parse(await readFile(new URL('./assets/world-land.geojson', import.meta.url),'utf8'));
  assert.equal(land.type,'FeatureCollection'); assert.ok(land.features.length > 100);
  assert.ok(land.features.every(f => Object.keys(f.properties).length === 0));
});
