import test from "node:test";
import assert from "node:assert/strict";
import {
  analysisScopeMatches, boxToPixels, computeFrameMetrics, normalizeStationId, scaleCaptureSize, voiceEventKey
} from "./yk-supervisor.js";

test("la captura conserva proporción y nunca supera 960 px", () => {
  assert.deepEqual(scaleCaptureSize(1920, 1080), {width:960, height:540});
  assert.deepEqual(scaleCaptureSize(1200, 1600), {width:720, height:960});
  assert.deepEqual(scaleCaptureSize(640, 480), {width:640, height:480});
});

test("luminancia y proporción oscura salen de los píxeles, no de la IA", () => {
  assert.deepEqual(computeFrameMetrics(new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255])), {luminance:0, dark_ratio:1});
  assert.deepEqual(computeFrameMetrics(new Uint8ClampedArray([255, 255, 255, 255])), {luminance:1, dark_ratio:0});
  assert.deepEqual(computeFrameMetrics(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255])), {luminance:0.5, dark_ratio:0.5});
});

test("las cajas normalizadas respetan el letterbox de la imagen", () => {
  const box = boxToPixels([0.1, 0.2, 0.5, 0.5], 1600, 900, 1000, 1000);
  assert.equal(box.x, 100);
  assert.equal(box.y, 331.25);
  assert.equal(box.width, 500);
  assert.equal(box.height, 281.25);
  assert.equal(boxToPixels(null, 1, 1, 1, 1), null);
});

test("identidad de puesto estable y alarma de voz ligada a ticket persistido", () => {
  assert.equal(normalizeStationId("  Jardínets / Kiosk 01 "), "jardinets-kiosk-01");
  assert.equal(voiceEventKey({alert:true, voice:"Pantalla apagada", ticket:{id:"FLT-1"}, observation_id:"obs-1"}), "FLT-1:obs-1:Pantalla apagada");
  assert.equal(voiceEventKey({alert:true, voice:"fallback", speech:{once_key:"FLT-1:once",text:"Pantalla apagada"}, ticket:{id:"FLT-1"}}), "FLT-1:once");
  assert.equal(voiceEventKey({alert:false, voice:"Pantalla apagada", ticket:{id:"FLT-1"}}), "");
  assert.equal(voiceEventKey({alert:true, voice:"Pantalla apagada", ticket:null}), "");
});

test("una respuesta de análisis sólo pertenece al proyecto y puesto capturados", () => {
  const scope = {sequence:7, projectId:"admira-tv", stationId:"jardinets-kiosk-01"};
  assert.equal(analysisScopeMatches(scope, {...scope}), true);
  assert.equal(analysisScopeMatches(scope, {...scope, sequence:8}), false);
  assert.equal(analysisScopeMatches(scope, {...scope, projectId:"xpaceos"}), false);
  assert.equal(analysisScopeMatches(scope, {...scope, stationId:"otro-puesto"}), false);
  assert.equal(analysisScopeMatches(null, scope), false);
});
