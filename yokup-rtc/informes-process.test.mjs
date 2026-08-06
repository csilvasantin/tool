import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
const page = await readFile(new URL("../yokup-site/informes.html", import.meta.url), "utf8");
const pdf = await readFile(new URL("../yokup-site/informe-pdf.js", import.meta.url), "utf8");
const sorter = await readFile(new URL("../yokup-site/yk-informes-sort.js", import.meta.url), "utf8");
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
  assert.match(pdf, /loadJPEG\(t\.process_image\)/);
  assert.doesNotMatch(pdf, /loadJPEG\(t\.live_shot\)/);
  assert.match(sorter, /row\.process_image\?1:0/);
  assert.doesNotMatch(sorter, /row\.live_shot\?1:0/);
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

test("el cliente conserva captured_at real y rechaza proceso caducado antes de subir", () => {
  assert.match(client, /--captured-at/);
  assert.match(client, /--process-captured-at/);
  assert.match(client, /stat -f '%m'/);
  assert.match(client, /captured_at tiene más de 2 minutos; no se falsea como proceso vivo/);
  const progress = client.slice(client.indexOf('elif [ "$MODE" = "progress" ]'), client.indexOf('else\n  [ -n "$REPORT" ]'));
  assert.ok(progress.indexOf('capture_time "$IMAGE"') < progress.indexOf('upload_image "$IMAGE"'));
  assert.ok(progress.indexOf('validate_process_time "$CAPTURED_AT"') < progress.indexOf('upload_image "$IMAGE"'));
  const finalBranch = client.slice(client.indexOf('else\n  [ -n "$REPORT" ]'));
  assert.ok(finalBranch.indexOf('capture_time "$PROCESS_IMAGE"') < finalBranch.indexOf('upload_image "$PROCESS_IMAGE"'));
  assert.ok(finalBranch.indexOf('validate_process_time "$PROCESS_CAPTURED_AT"') < finalBranch.indexOf('upload_image "$PROCESS_IMAGE"'));
});
