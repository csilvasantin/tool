import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./yk-misiones.js", import.meta.url), "utf8");

function loadModule() {
  const windowObj = {};
  const documentObj = { addEventListener() {}, querySelector: () => null };
  const context = vm.createContext({
    window: windowObj, document: documentObj,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    Date, Math, JSON, Promise, RegExp, Object, Array, String, Number, Boolean,
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
    setTimeout, clearTimeout, console
  });
  vm.runInContext(source, context);
  windowObj.YkMisiones.init({ worker: "https://api.yokup.com", columnMode: "tasks", projectIdLayout: true });
  windowObj.YkMisiones.setProyectos([{ id: "yokup", name: "Yokup", web: "https://www.yokup.com" }]);
  return windowObj.YkMisiones;
}

const Yk = loadModule();

test("la prueba final real tiene prioridad sobre la captura de proceso", () => {
  const evidence = Yk.missionEvidenceOf({
    proof_image: "https://api.yokup.com/media/final.png",
    proof_kind: "final",
    live_shot: "https://api.yokup.com/media/process.png",
    live_kind: "process",
    live_at: Date.now()
  });
  assert.equal(evidence.src, "https://api.yokup.com/media/final.png");
  assert.equal(evidence.kind, "final");
});

test("una captura de proceso permanece visible aunque ya no esté fresca", () => {
  const evidence = Yk.missionEvidenceOf({
    live_shot: "https://api.yokup.com/media/process-old.png",
    live_kind: "process",
    live_at: Date.now() - 60 * 60 * 1000
  });
  assert.equal(evidence.src, "https://api.yokup.com/media/process-old.png");
  assert.equal(evidence.kind, "process");
  assert.equal(evidence.fresh, false);

  const html = Yk.rowHtml({
    id: "DCL-EVIDENCE", project: "yokup", project_name: "Yokup",
    subject: "Priorizar evidencia", status: "in_progress", created_at: Date.now(),
    live_shot: evidence.src, live_kind: "process", live_at: Date.now() - 60 * 60 * 1000
  });
  assert.match(html, /src="https:\/\/api\.yokup\.com\/media\/process-old\.png"/);
  assert.match(html, /class="shot-img process"/);
  assert.doesNotMatch(html, /www\.yokup\.com\/favicon\.ico|admiranext-logo\.svg/);
});

test("process_image derivada conserva prioridad aunque el payload omita live_kind", () => {
  const evidence = Yk.missionEvidenceOf({
    process_image: "https://api.yokup.com/media/derived-process.png",
    process_captured_at: Date.now() - 10_000,
    live_shot: "https://api.yokup.com/media/final-fallback.png",
    live_kind: "final-fallback"
  });
  assert.equal(evidence.src, "https://api.yokup.com/media/derived-process.png");
  assert.equal(evidence.kind, "process");
  assert.equal(evidence.fresh, true);
});

test("final-fallback y prueba declarada no final no desplazan el favicon", () => {
  const evidence = Yk.missionEvidenceOf({
    proof_image: "https://api.yokup.com/media/legacy.png",
    proof_kind: "legacy-unverified",
    live_shot: "https://api.yokup.com/media/final-fallback.png",
    live_kind: "final-fallback",
    live_at: Date.now()
  });
  assert.deepEqual({ ...evidence }, { src: "", kind: "fallback", fresh: false });

  const html = Yk.rowHtml({
    id: "DCL-FALLBACK", project: "yokup", project_name: "Yokup",
    subject: "Fallback honesto", status: "in_progress", created_at: Date.now(),
    proof_image: "https://api.yokup.com/media/legacy.png", proof_kind: "legacy-unverified",
    live_shot: "https://api.yokup.com/media/final-fallback.png", live_kind: "final-fallback"
  });
  assert.match(html, /src="https:\/\/yokup\.com\/favicon\.ico"/);
  assert.doesNotMatch(html, /legacy\.png|final-fallback\.png/);
});

test("fila y cajón comparten la selección canónica, sin proof_image || live_shot", () => {
  assert.match(source, /function missionEvidenceOf\(t\)/);
  assert.match(source, /function missionPreviewHtml\(t\)[\s\S]*var evidence = missionEvidenceOf\(t\)/);
  assert.match(source, /function detalleHtml\(id\)[\s\S]*var evidence = missionEvidenceOf\(t\)/);
  assert.doesNotMatch(source, /var img = t\.proof_image \|\| t\.live_shot/);
});
