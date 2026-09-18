import test from "node:test";
import assert from "node:assert/strict";
import {
  analysisScopeMatches, boxToPixels, computeFrameMetrics, normalizeStationId, scaleCaptureSize,
  screenStateConfidence, screenTargetAnnouncement, screenTargetId, screenTargetPlan, screenTargetSemanticKey, voiceEventKey
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
  assert.deepEqual(boxToPixels([0.9, 0.9, 0.5, 0.5], 100, 100, 200, 200), {x:180, y:180, width:20, height:20});
  assert.equal(boxToPixels([0.2, 0.2, 0, 0.4], 100, 100, 200, 200), null);
});

test("el plan HUD identifica y sitúa cada objetivo sobre la imagen", () => {
  const screens = [
    {target_id:"SCREEN-07", state:"playing", confidence:.976, bbox:[.1,.2,.5,.4]},
    {id:"SCREEN-08", state:"off", confidence:.91, bbox:[.7,.1,.2,.7]},
    {target_id:"etiqueta no valida", state:"unknown", confidence:.4, bbox:null}
  ];
  const plan = screenTargetPlan(screens, 1600, 900, 1000, 1000);
  assert.equal(plan.length, 2);
  assert.deepEqual(plan[0], {
    id:"SCREEN-07", state:"playing", status:"Emitiendo", tone:"healthy", stateConfidence:98,
    box:{x:100, y:331.25, width:500, height:225}
  });
  assert.equal(plan[1].id, "SCREEN-08");
  assert.equal(plan[1].tone, "critical");
  assert.equal(screenTargetId(0), "SCREEN-01");
  assert.equal(screenTargetId(7), "SCREEN-08");
  assert.equal(screenTargetId(1, {target_id:"etiqueta no valida"}), "SCREEN-02");
});

test("el lector de pantalla recibe la misma identificación que el HUD", () => {
  const spoken = screenTargetAnnouncement([{target_id:"SCREEN-03", state:"no_signal", confidence:.87, bbox:[.2,.2,.4,.4]}]);
  assert.match(spoken, /^1 pantalla identificada\./);
  assert.match(spoken, /SCREEN-03, Sin señal, confianza del estado 87 por ciento, localizada/);
  assert.match(screenTargetAnnouncement([{state:"unknown", confidence:0, bbox:[.1,.1,.2,.2]}]), /estado sin confianza/);
  assert.equal(screenStateConfidence({confidence:0}), null);
  assert.equal(screenStateConfidence({confidence:true}), null);
  assert.equal(screenStateConfidence({confidence:"0.99"}), null);
  assert.equal(screenStateConfidence({confidence:99}), null);
  assert.match(screenTargetAnnouncement([]), /ninguna pantalla/);
});

test("el resumen semántico del live region ignora fluctuaciones visuales de confianza y posición", () => {
  const first = [{target_id:"SCREEN-01", state:"playing", confidence:.98, bbox:[.1,.1,.4,.4]}];
  const sameMeaning = [{target_id:"SCREEN-01", state:"playing", confidence:.71, bbox:[.2,.15,.42,.41]}];
  const changedState = [{target_id:"SCREEN-01", state:"off", confidence:.91, bbox:[.2,.15,.42,.41]}];
  assert.equal(screenTargetSemanticKey(first), screenTargetSemanticKey(sameMeaning));
  assert.notEqual(screenTargetSemanticKey(first), screenTargetSemanticKey(changedState));
  assert.notEqual(screenTargetSemanticKey(first), screenTargetSemanticKey([{...first[0], bbox:null}]));
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
