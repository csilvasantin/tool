import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
const page = await readFile(new URL("../yokup-site/informes.html", import.meta.url), "utf8");
const client = await readFile(new URL("./tools/mission-evidence.sh", import.meta.url), "utf8");

test("/tasks/all sirve Proceso sólo cuando la evidencia está tipada como process", () => {
  assert.match(worker, /CASE WHEN t\.live_kind='process' THEN t\.live_shot ELSE NULL END AS process_image/);
  assert.match(worker, /CASE WHEN t\.live_kind='process' THEN t\.live_at ELSE NULL END AS process_captured_at/);
});

test("/informes consume el campo tipado y conserva el guion para el histórico", () => {
  const render = page.slice(page.indexOf("function render(list)"), page.indexOf('// Adjunto PDF'));
  assert.match(render, /shotHTML\(t\.process_image/);
  assert.doesNotMatch(render, /shotHTML\(t\.live_shot/);
  assert.match(page, /: `<span class="shot-none"[^>]*>—<\/span>`/);
});

test("el cierre común captura proceso y final por separado y publica proceso primero", () => {
  const finalBranch = client.slice(client.indexOf('else\n  [ -n "$REPORT" ]'));
  assert.match(client, /--process-image/);
  assert.match(finalBranch, /PROCESS_IMAGE="\$\(capture_image\)"/);
  assert.match(finalBranch, /PROCESS_URL="\$\(upload_image "\$PROCESS_IMAGE"\)"/);
  assert.match(finalBranch, /"evidence_kind":"process"/);
  assert.match(finalBranch, /IMAGE="\$\(capture_image\)"/);
  assert.match(finalBranch, /IMAGE_URL="\$\(upload_image "\$IMAGE"\)"/);
  assert.ok(finalBranch.indexOf('$API/fleet/progress') < finalBranch.indexOf('ENDPOINT="informe"'));
  assert.doesNotMatch(finalBranch, /PROCESS_URL="\$IMAGE_URL"|PROCESS_IMAGE="\$IMAGE"/);
});
