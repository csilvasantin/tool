import test from "node:test";
import assert from "node:assert/strict";
import {
  analysisScopeMatches, boxToPixels, computeFrameMetrics, normalizeStationId, scaleCaptureSize,
  normalizeScreenIdentity, safeRemoteControlUrl, screenIdentityLabel, screenStateConfidence,
  screenRemoteActionPlan, screenTargetAnnouncement, screenTargetId, screenTargetPlan, screenTargetSemanticKey,
  nextAnalysisDelay, voiceEventKey
} from "./yk-supervisor.js";

test("la captura conserva proporción y nunca supera 960 px", () => {
  assert.deepEqual(scaleCaptureSize(1920, 1080), {width:960, height:540});
  assert.deepEqual(scaleCaptureSize(1200, 1600), {width:720, height:960});
  assert.deepEqual(scaleCaptureSize(640, 480), {width:640, height:480});
});

test("el ciclo de análisis mide de inicio a inicio sin solapar lecturas", () => {
  assert.equal(nextAnalysisDelay(1_000, 2_200), 10_800);
  assert.equal(nextAnalysisDelay(1_000, 13_000), 250);
  assert.equal(nextAnalysisDelay(1_000, 19_000), 250);
  assert.equal(nextAnalysisDelay(2_000, 1_000), 12_000, "un reloj inválido conserva la cadencia completa");
  assert.equal(nextAnalysisDelay(1_000, 2_000, 8_000, 500), 7_000);
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
    identity:{status:"unavailable", source:null, confidence:null, verified:false, project:null, player:null, content:null, evidence:[], remote:null},
    box:{x:100, y:331.25, width:500, height:225}
  });
  assert.equal(plan[1].id, "SCREEN-08");
  assert.equal(plan[1].tone, "critical");
  assert.equal(screenTargetId(0), "SCREEN-01");
  assert.equal(screenTargetId(7), "SCREEN-08");
  assert.equal(screenTargetId(1, {target_id:"etiqueta no valida"}), "SCREEN-02");
});

test("la identidad sólo se considera verificada si procede de Admira MCP", () => {
  const screen = {identity:{
    status:"matched", source:"admira-mcp", confidence:.94,
    project:{id:"admira-tv", name:"admira.tv"},
    player:{id:"dgx-01", name:"DGX · Player Windows"},
    content:{title:"Huey Lewis · The Power of Love", type:"video"},
    evidence:["Claim visual DGX", "Claim visual DGX", "Canal activo"],
    remote:{url:"https://admira.tv/remotecontrol/?screen=dgx-01&solo=1", label:"Abrir mando DGX"}
  }};
  assert.deepEqual(normalizeScreenIdentity(screen), {
    status:"matched", source:"admira-mcp", confidence:.94, verified:true,
    project:{id:"admira-tv", name:"admira.tv"}, player:{id:"dgx-01", name:"DGX · Player Windows"},
    content:{title:"Huey Lewis · The Power of Love", type:"video"},
    evidence:["Claim visual DGX", "Canal activo"],
    remote:{url:"https://admira.tv/remotecontrol/?screen=dgx-01&solo=1", label:"Abrir mando DGX"}
  });
  assert.equal(screenIdentityLabel(normalizeScreenIdentity(screen)), "Verificado por Admira MCP");
  assert.match(screenTargetAnnouncement([screen]), /proyecto admira\.tv, player DGX · Player Windows/);
  assert.match(screenTargetAnnouncement([screen]), /emitiendo Huey Lewis · The Power of Love/);

  const invented = normalizeScreenIdentity({identity:{
    status:"matched", source:"vision-model", project:{id:"p", name:"Inventado"},
    player:{id:"x", name:"Inventado"}, remote:{url:"https://admira.tv/remotecontrol/?screen=x&solo=1"}
  }});
  assert.equal(invented.verified, false);
  assert.equal(invented.project, null);
  assert.equal(invented.player, null);
  assert.equal(invented.content, null);
  assert.equal(invented.remote, null);
  assert.equal(screenIdentityLabel(invented), "Sin verificar");
});

test("sólo un target verificado y con mando exacto se convierte en enlace pulsable", () => {
  const verified = {target_id:"SCREEN-04", state:"playing", confidence:.96, bbox:[.2,.1,.5,.6], identity:{
    status:"matched", source:"admira-mcp", confidence:.95,
    project:{id:"grandegracia", name:"GrandeGracia"},
    player:{id:"dgx-spark", name:"dgx-spark"},
    content:{title:"The Power of Love", type:"video"},
    remote:{url:"https://admira.tv/remotecontrol/?screen=dgx-spark&solo=1"}
  }};
  const actions = screenRemoteActionPlan([verified], 1600, 900, 1000, 1000);
  assert.deepEqual(actions, [{
    id:"SCREEN-04", href:"https://admira.tv/remotecontrol/?screen=dgx-spark&solo=1",
    project:"GrandeGracia", player:"dgx-spark", playerId:"dgx-spark", content:"The Power of Love",
    box:{x:200, y:275, width:500, height:337.5}
  }]);
  assert.deepEqual(screenRemoteActionPlan([{...verified, identity:{...verified.identity, status:"ambiguous"}}], 1600, 900, 1000, 1000), []);
  assert.deepEqual(screenRemoteActionPlan([{...verified, identity:{...verified.identity,
    remote:{url:"https://admira.tv/remotecontrol/?screen=otro&solo=1"}}}], 1600, 900, 1000, 1000), []);
});

test("los mandos pequeños conservan 44 px, respetan bordes y fallan cerrado si se solapan", () => {
  const identity = (player) => ({
    status:"matched", source:"admira-mcp", project:{id:"grandegracia", name:"GrandeGracia"},
    player:{id:player, name:player}, remote:{url:`https://admira.tv/remotecontrol/?screen=${player}&solo=1`}
  });
  const edge = screenRemoteActionPlan([{
    target_id:"SCREEN-01", bbox:[.99,.99,.01,.01], identity:identity("edge-player")
  }], 1000, 1000, 1000, 1000);
  assert.deepEqual(edge[0].box, {x:956, y:956, width:44, height:44});

  const close = screenRemoteActionPlan([
    {target_id:"SCREEN-01", bbox:[.1,.1,.01,.01], identity:identity("player-a")},
    {target_id:"SCREEN-02", bbox:[.13,.1,.01,.01], identity:identity("player-b")}
  ], 1000, 1000, 1000, 1000);
  assert.deepEqual(close, [], "dos zonas ampliadas que se pisan no deben poder abrir el player equivocado");
});

test("el mando remoto sólo admite HTTPS en dominios controlados por Admira", () => {
  assert.equal(safeRemoteControlUrl("https://admira.tv/remotecontrol/?screen=dgx-01&solo=1"), "https://admira.tv/remotecontrol/?screen=dgx-01&solo=1");
  assert.equal(safeRemoteControlUrl("https://www.admira.tv/remotecontrol/?solo=1&screen=dgx_02"), "https://www.admira.tv/remotecontrol/?solo=1&screen=dgx_02");
  assert.equal(safeRemoteControlUrl("https://admira.tv/remotecontrol/?screen=dgx-01&solo=1", "dgx-01"), "https://admira.tv/remotecontrol/?screen=dgx-01&solo=1");
  assert.equal(safeRemoteControlUrl("https://admira.tv/remotecontrol/?screen=player-b&solo=1", "player-a"), "");
  for (const unsafe of [
    "javascript:alert(1)", "http://admira.tv/remotecontrol/?screen=dgx&solo=1",
    "https://admira.tv.evil.example/remotecontrol/?screen=dgx&solo=1",
    "https://panel.admira.tv/remotecontrol/?screen=dgx&solo=1",
    "https://admira.live/remotecontrol/?screen=dgx&solo=1",
    "https://evil.example/?next=admira.tv", "https://user:pass@admira.tv/remotecontrol/?screen=dgx&solo=1",
    "/remotecontrol/?screen=dgx&solo=1", "https://admira.tv:443/remotecontrol/?screen=dgx&solo=1",
    "https://admira.tv:8443/remotecontrol/?screen=dgx&solo=1",
    "https://admira.tv/remotecontrol?screen=dgx&solo=1", "https://admira.tv/remotecontrol/?screen=DGX&solo=1",
    "https://admira.tv/remotecontrol/?screen=-dgx&solo=1", "https://admira.tv/remotecontrol/?screen=dgx&solo=0",
    "https://admira.tv/remotecontrol/?screen=dgx&solo=1&next=https://evil.example",
    "https://admira.tv/remotecontrol/?screen=dgx&screen=other&solo=1",
    "https://admira.tv/remotecontrol/?screen=dgx&solo=1#override"
  ]) assert.equal(safeRemoteControlUrl(unsafe), "", unsafe);
});

test("ambigua o no encontrada nunca expone candidato ni mando", () => {
  for (const status of ["ambiguous", "unmatched", "unavailable"]) {
    const identity = normalizeScreenIdentity({identity:{
      status, source:"admira-mcp", project:{id:"admira-tv", name:"admira.tv"},
      player:{id:"DGX", name:"DGX"}, evidence:["texto parcial"], remote:{url:"https://admira.tv/remotecontrol/?screen=dgx&solo=1"}
    }});
    assert.equal(identity.verified, false);
    assert.equal(identity.project, null);
    assert.equal(identity.player, null);
    assert.equal(identity.remote, null);
    assert.deepEqual(identity.evidence, ["texto parcial"]);
  }
});

test("el mando debe pertenecer al mismo player que acredita la identidad", () => {
  const identity = normalizeScreenIdentity({identity:{
    status:"matched", source:"admira-mcp", confidence:.97,
    project:{id:"grandegracia", name:"GrandeGracia"},
    player:{id:"player-a", name:"Player A"},
    evidence:["coincidencia única"],
    remote:{url:"https://admira.tv/remotecontrol/?screen=player-b&solo=1", label:"Mando B"}
  }});
  assert.equal(identity.verified, true);
  assert.equal(identity.remote, null);
});

test("un nombre sin identificador estable nunca acredita proyecto ni player", () => {
  const identity = normalizeScreenIdentity({identity:{
    status:"matched", source:"admira-mcp",
    project:{name:"GrandeGracia"}, player:{name:"DGX"},
    remote:{url:"https://admira.tv/remotecontrol/?screen=dgx&solo=1"}
  }});
  assert.equal(identity.verified, false);
  assert.equal(identity.project, null);
  assert.equal(identity.player, null);
  assert.equal(identity.remote, null);
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
