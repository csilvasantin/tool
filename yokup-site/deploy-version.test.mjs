import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { madridDay, madridTime, nextDeployVersion, versionFromPayload } from "./deploy-version.js";

const deploy = await readFile(new URL("./deploy.mjs", import.meta.url), "utf8");
const baseline = JSON.parse(await readFile(new URL("./version.json", import.meta.url), "utf8"));

test("el sello canónico usa día, hora de Madrid y revisión diaria", () => {
  const date = new Date("2026-08-02T20:45:00Z"); // 22:45 en Madrid
  assert.equal(madridDay(date), "02.08.2026");
  assert.equal(madridTime(date), "22:45");
  assert.equal(nextDeployVersion(date, []), "v.02.08.2026.r1.22:45");
  assert.equal(nextDeployVersion(date, ["v.02.08.2026.r3", "v.02.08.2026.r7.21:10"]), "v.02.08.2026.r8.22:45");
  assert.equal(nextDeployVersion(date, ["v.02.08.2026.r14"]), "v.02.08.2026.r15.22:45");
  assert.equal(nextDeployVersion(date, ["v.2026.08.02.r14"]), "v.02.08.2026.r15.22:45");
});

test("el baseline persistente conserva la revisión del día ante un deployment legacy posterior", () => {
  const date = new Date("2026-08-03T21:15:00Z");
  assert.equal(baseline.version, "v.03.08.2026.r1.18:27");
  assert.equal(nextDeployVersion(date, [versionFromPayload(baseline), "v.2026.08.03.202305"]), "v.03.08.2026.r2.23:15");
});

test("un día nuevo reinicia r1 y un timestamp legacy no se confunde con una revisión", () => {
  const date = new Date("2026-08-03T10:00:00Z");
  assert.equal(nextDeployVersion(date, ["v.02.08.2026.r99", "v.2026.08.03.120000"]), "v.03.08.2026.r1.12:00");
});

test("lee payload local/público y deploy consulta producción bajo no-store", () => {
  assert.equal(versionFromPayload('{"version":"v.02.08.2026.r4.10:05"}'), "v.02.08.2026.r4.10:05");
  assert.equal(versionFromPayload({version:"v.02.08.2026.r5.10:42"}), "v.02.08.2026.r5.10:42");
  assert.match(deploy, /www\.yokup\.com\/version\.json\?deploy=/);
  assert.match(deploy, /nextDeployVersion\(now, \[versionFromPayload\(previousVersion\), publicVersion\]\)/);
  assert.doesNotMatch(deploy, /v\.\$\{p\.year\}/);
});

test("el deploy ejecuta las pruebas existentes y no una lista obsoleta", () => {
  assert.match(deploy, /entry\.name\.endsWith\("\.test\.mjs"\)/);
  assert.match(deploy, /\["--test", \.\.\.tests\]/);
  assert.doesNotMatch(deploy, /versioning\.test\.mjs|app-nav-consistency\.test\.mjs/);
});
