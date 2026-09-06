import test from "node:test";
import assert from "node:assert/strict";
import { annotateMissionDuplicates, duplicateStateClass, missionDuplicateDescriptor } from "./src/mission-duplicates.js";

function mission(index, overrides = {}) {
  return {
    id:"FLT-" + (2200 + index),
    subject:index >= 16
      ? "TG2264 " + (index === 16 ? "lote " : "") + "Oráculo trono Superman"
      : "TG" + (index === 15 ? "2264" : String(2100 + index)) + " eco Oráculo trono Superman story FLT-1893",
    project_id:"admira-live",
    status:index === 0 ? "open" : "in_progress",
    assignee:index === 0 ? "OraculoMacMini" : "WozniakGrokBot",
    loc:index === 0 ? "MacMini" : "grokbot",
    ...overrides
  };
}

test("18 ecos activos de la misma story producen una firma accionable única", () => {
  const rows = annotateMissionDuplicates(Array.from({length:18}, (_, index) => mission(index)));
  assert.equal(new Set(rows.map((row) => row.duplicate.key)).size, 1);
  assert.equal(rows[0].duplicate.basis, "story");
  assert.equal(rows[0].duplicate.reference, "FLT-1893");
  assert.equal(rows[0].duplicate.key, "story|admira-live|active|root|flt-1893");
  assert.equal(rows[0].duplicate.count, 18);
  assert.equal(rows[0].duplicate.member_ids.length, 18);
  assert.deepEqual(rows[0].duplicate.states, {open:1,in_progress:17});
  assert.ok(rows.every((row) => row.duplicate === rows[0].duplicate),
    "todos los miembros comparten el mismo descriptor canónico");
});

test("proyecto y clase de estado aíslan historias iguales", () => {
  const active = missionDuplicateDescriptor(mission(1));
  const otherProject = missionDuplicateDescriptor(mission(2, {project_id:"pixeria"}));
  const resolved = missionDuplicateDescriptor(mission(3, {status:"resolved"}));
  const cancelled = missionDuplicateDescriptor(mission(4, {status:"cancelled"}));
  assert.equal(active.state_class, "active");
  assert.equal(duplicateStateClass(mission(0, {visible_state:"unconcluded"})), "active");
  assert.equal(new Set([active.key, otherProject.key, resolved.key, cancelled.key]).size, 4);
});

test("la historia estructurada prevalece sobre TG y tolera referencias posteriores", () => {
  const row = mission(9, {subject:"TG2264/2263 eco Superman FLT-2171 · story FLT-1893 · refs FLT-2200"});
  assert.equal(missionDuplicateDescriptor(row).reference, "FLT-1893");
  const bare = mission(10, {subject:"TG2264 eco Superman FLT-2171 / FLT-1893"});
  assert.equal(missionDuplicateDescriptor(bare).reference, "FLT-1893");
});

test("sin story, Telegram y tema exigen igualdad estricta y agente/equipo", () => {
  const tgA = mission(5, {subject:"TG #2092 Entregar asset", assignee:"NeoMBP14", loc:"MacBook Pro 14"});
  const tgB = mission(6, {subject:"TG #2092 Entregar asset distinto", assignee:"NeoMBP14", loc:"MacBookProNegro14"});
  const tgOtherAgent = mission(7, {subject:"TG #2092 Entregar asset", assignee:"TrinityMBP14", loc:"MacBook Pro 14"});
  assert.equal(missionDuplicateDescriptor(tgA).key, missionDuplicateDescriptor(tgB).key,
    "el TG explícito manda sobre variaciones del texto");
  assert.notEqual(missionDuplicateDescriptor(tgA).key, missionDuplicateDescriptor(tgOtherAgent).key);

  const topicA = mission(8, {subject:"Revisar  panel Superman", assignee:"NeoMBP14"});
  const topicSame = mission(9, {subject:"revisar panel supermán", assignee:"NeoMBP14"});
  const topicDifferent = mission(10, {subject:"Revisar panel Superman final", assignee:"NeoMBP14"});
  assert.equal(missionDuplicateDescriptor(topicA).key, missionDuplicateDescriptor(topicSame).key);
  assert.notEqual(missionDuplicateDescriptor(topicA).key, missionDuplicateDescriptor(topicDifferent).key,
    "no se infiere similitud temática");
});

test("un TG compartido no fusiona dos stories canónicas distintas", () => {
  const rows=annotateMissionDuplicates([
    mission(12,{subject:"TG999 story FLT-100 · trabajo A"}),
    mission(13,{subject:"TG999 story FLT-200 · trabajo B"}),
    mission(14,{subject:"TG999 eco sin story"})
  ]);
  assert.equal(new Set(rows.map((row) => row.duplicate.key)).size,3,
    "el eco ambiguo tampoco se adjudica a una de las stories");
  assert.deepEqual(rows.slice(0,2).map((row)=>row.duplicate.reference),["FLT-100","FLT-200"]);
});

test("sin proyecto no se declara duplicado", () => {
  assert.equal(missionDuplicateDescriptor(mission(11, {project_id:"", project:""})), null);
});
