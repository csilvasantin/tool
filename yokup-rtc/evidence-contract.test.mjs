import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

function route(path, nextComment) {
  const start = source.indexOf(`url.pathname === "${path}"`);
  const end = source.indexOf(nextComment, start);
  assert.ok(start > 0 && end > start, `no se encontró ${path}`);
  return source.slice(start, end);
}

test("la captura de proceso lleva identidad, tipo y hora de captura frescos", () => {
  const progress = route("/fleet/progress", "// ESTRATEGIA");
  assert.match(progress, /validateMissionActor\(t, b\.owner \|\| b\.by \|\| b\.agent\)/);
  assert.match(progress, /normalizeLiveCaptureTime\(b\.captured_at\)/);
  assert.match(progress, /evidence_kind.*process.*final-fallback/s);
  assert.match(progress, /String\(b\.evidence_kind \|\| ""\)/,
    "no puede asumir process si el capturador omitió el tipo");
  assert.match(progress, /final-fallback[\s\S]*?b\.degraded !== true/);
  assert.match(progress, /live_shot=\?,live_at=\?,live_kind=\?/);
  assert.match(progress, /await validateProofImage\(env, rawImage, url\.origin\)/);
  assert.match(progress, /validateProcessCaptureProvenance\(liveKind, b\.capture_surface, b\.capture_context\)/);
  assert.match(progress, /live_surface=\?,live_context=\?/);
});

test("process exige procedencia visible y final-fallback conserva compatibilidad", () => {
  assert.match(source, /process_provenance_missing/);
  assert.match(source, /\['desktop','cli'\]/);
  assert.match(source, /surface === "desktop" \? "request" : "command_output"/);
  assert.match(source, /web\/result_page no son proceso/);
  assert.match(source, /if \(kind !== "process"\) return \{ ok:true, surface:null, context:null \}/);
});

test("todo cierre nuevo exige proceso canónico dentro de la vida de la misión", () => {
  const informe = route("/fleet/informe", "// CANCELAR una misión");
  const task = route("/fleet/task-status", "// Ingesta UNIVERSAL");
  assert.match(source, /function validateMissionProcessEvidence/);
  assert.match(source, /ticket\.live_kind !== "process"/);
  assert.match(source, /capturedAt < createdAt \|\| capturedAt > now \+ 3e4/);
  assert.match(informe, /t\.status !== "resolved"[\s\S]*validateMissionProcessEvidence\(t\)/);
  assert.match(task, /if \(cierraArbol\) \{\s*const processEvidence = validateMissionProcessEvidence\(tk\)/);
});

test("task-status rechaza un cierre sin proceso antes de cualquier mutación de negocio", () => {
  const task = route("/fleet/task-status", "// Ingesta UNIVERSAL");
  const preflight = task.indexOf("const processEvidence = validateMissionProcessEvidence(tk)");
  const rejection = task.indexOf("applied:false", preflight);
  const autoClaim = task.indexOf("UPDATE tickets SET status='in_progress'", rejection);
  const event = task.indexOf("Estado → in_progress · primer avance de tarea", rejection);
  const seed = task.indexOf("saveMissionPlan(env, mid", rejection);
  const taskWrite = task.indexOf("setTaskStatus(env, mid", rejection);
  assert.ok(preflight > 0 && rejection > preflight, "falta el rechazo preflight sin proceso");
  for (const [name, index] of [["auto-claim", autoClaim], ["evento", event], ["plan", seed], ["tarea", taskWrite]]) {
    assert.ok(index > rejection, `${name} muta antes del rechazo applied:false`);
  }
});

test("informe y tarea también verifican contenido, no sólo forma de URL", () => {
  const informe = route("/fleet/informe", "// CANCELAR una misión");
  const task = route("/fleet/task-status", "// Ingesta UNIVERSAL");
  assert.match(informe, /await validateProofImage\(env, rawImage, url\.origin\)/);
  assert.match(task, /await validateProofImage\(env, b\.image, url\.origin\)/);
  assert.match(source, /env\.MEDIA\.head\(key\)/);
  assert.match(source, /content-type[\s\S]*?image\/\*/);
  assert.match(source, /unsafeEvidenceHost\(parsed\.hostname\)/);
  assert.match(source, /embeddedImageMatchesMime\(norm\.value\)/);
});

test("un heartbeat sin imagen no hace pasar una captura vieja por reciente", () => {
  const progress = route("/fleet/progress", "// ESTRATEGIA");
  const heartbeatWrite = progress.match(/else \{\s*await env\.DB\.prepare\(\s*"([^"]+)"/s)?.[1] || "";
  assert.match(heartbeatWrite, /status=CASE WHEN status='open'/);
  assert.doesNotMatch(heartbeatWrite, /live_at|live_shot|live_kind/);
  assert.match(progress, /evidence_updated: !!img/);
});

test("ninguna firma cruzada muta informe, prueba, live shot ni estado", () => {
  for (const [path, end] of [
    ["/fleet/progress", "// ESTRATEGIA"],
    ["/fleet/informe", "// CANCELAR una misión"],
    ["/fleet/task-status", "// Ingesta UNIVERSAL"],
  ]) {
    const body = route(path, end);
    const guard = body.indexOf("validateMissionActor(");
    const mismatch = body.indexOf("owner_mismatch", guard);
    const firstWrite = Math.min(...["UPDATE tickets", "INSERT INTO mission_tasks", "saveMissionPlan(", "setTaskStatus("]
      .map((needle) => body.indexOf(needle, mismatch + 1)).filter((index) => index >= 0));
    assert.ok(guard >= 0 && mismatch > guard, `${path} no valida identidad`);
    assert.ok(firstWrite > mismatch, `${path} escribe antes de rechazar la firma cruzada`);
    assert.match(body.slice(guard, firstWrite), /applied: false/);
  }
});

test("la firma pertenece también al equipo físico, no sólo a la persona base", () => {
  assert.match(source, /if \(!expected\).*assignee validable/);
  assert.match(source, /expectedSuffix && actorId\.suffix !== expectedSuffix/);
  assert.match(source, /equipo físico asignado/);
  assert.match(source, /expectedId\.suffix \|\| machineSuffix\(ticket && ticket\.loc\)/,
    "un assignee legacy sin sufijo debe quedar ligado a tickets.loc");
});

test("resolved/cancelled se rechazan antes de tocar informe, tarea o prueba", () => {
  for (const [path, end] of [["/fleet/informe", "// CANCELAR una misión"], ["/fleet/task-status", "// Ingesta UNIVERSAL"]]) {
    const body = route(path, end);
    const guard = body.indexOf('code: "mission_closed"');
    const write = Math.min(...["UPDATE tickets SET status='in_progress'", "INSERT INTO mission_tasks", "saveMissionPlan(", "setTaskStatus("]
      .map((needle) => body.indexOf(needle)).filter((index) => index >= 0));
    assert.ok(guard > 0 && write > guard, `${path} muta un estado terminal`);
  }
});

test("el cierre no declara éxito si D1 o bot-inbox quedan parciales", () => {
  const informe = route("/fleet/informe", "// CANCELAR una misión");
  assert.match(informe, /notifyFleetInformeClosure[\s\S]*?if \(!inbox\.updated\)[\s\S]*?env\.DB\.batch/);
  assert.match(informe, /writes\[1\]\.meta[\s\S]*?changes/);
  assert.match(informe, /closure_partial/);
  assert.match(informe, /resolved: false[\s\S]*?sync_required: true/);
  assert.match(informe, /proof_image: image/);
});

test("una proof heredada no cierra silenciosamente una misión nueva", () => {
  assert.match(source, /proof_kind='legacy-unverified'/);
  assert.match(source, /row\.proof_kind === "final"/);
  assert.match(source, /validateProofImage\(env, row\.proof_image/);
  assert.doesNotMatch(source, /tk\.proof_image \|\| await hasMissionProof/);
});

test("la evidencia intermedia no asciende a proof_image", () => {
  const task = route("/fleet/task-status", "// Ingesta UNIVERSAL");
  assert.match(task, /cierraArbol \? "final" : "task"/);
  assert.match(task, /if \(cierraArbol\) \{\s*await env\.DB\.prepare\("UPDATE tickets SET proof_image=/s);
  assert.doesNotMatch(task, /proof_image=COALESCE\(NULLIF\(proof_image,''\),\?\)/);
  assert.match(source, /image_kind='final'/);
});

test("los cierres fallan con una lista explícita de evidencias ausentes", () => {
  const informe = route("/fleet/informe", "// CANCELAR una misión");
  const task = route("/fleet/task-status", "// Ingesta UNIVERSAL");
  assert.match(informe, /closure_evidence_missing/);
  assert.match(informe, /missing\.push\("report"\)/);
  assert.match(informe, /missing\.push\("owner"\)/);
  assert.match(informe, /missing\.push\("final_image"\)/);
  assert.match(task, /closure_evidence_missing/);
  assert.match(task, /missing: \["final_image"\]/);
});
