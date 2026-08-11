import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";

const root = new URL("./", import.meta.url);
const frame = await readFile(new URL("./yk-frame.js", root), "utf8");
const css = await readFile(new URL("./yk-frame.css", root), "utf8");
const deploy = await readFile(new URL("./deploy.mjs", root), "utf8");

const assets = new Map([
  ["apple-touch-icon.png", "45f44cd5a46513ed909d967c382fce920441d68aa3d5537b95965a75a61a9b9e"],
  ["favicon-16x16.png", "e00ee294efcdc66cf2f38b08436f6be0522eed5110e23c80786aa4a452add719"],
  ["favicon-192x192.png", "d9f5262692f4316c9a2f3a188b86bfc17b42ccbfca650a3181f0ecb6fb489f0c"],
  ["favicon-32x32.png", "c004ee1969887ddd2844078d17b0c6a5f6c3a8754c0c4e5139ae1756da118def"],
  ["favicon-512x512.png", "28becbbb5968d69481898cd1d81d331e32b0f9c7ebc761555251edfba3e3df6f"],
  ["favicon-96x96.png", "a683c720afdddd4f8ae1ca0f6b1e16c9e4f6de4ac2cf97198759e398fe734b6b"],
  ["favicon.ico", "7bc4e860d075b39f80a12eaa93bafd592db70670fb4e322d2685e1c8f63c992e"],
  ["img/yokup-isotipo.svg", "a7e5ad454af17b7aeca73c82e06f64f2bc3ead15f0a36e96b2f039e3dbf8e5a9"],
  ["img/yokup-logo.svg", "63c1aaf2a20b50a85ae5c8c1271e6d2278f9d0a871ffac43eb78de63945775a6"],
  ["img/trackandfield-scoreboard-ref.png", "b1b4b88cf3fde71d3985be6706701a6d5e2f44a6ccb1d7be4cbda9a37b54ae8a"],
  ["img/trackandfield-scoreboard.png", "b1b4b88cf3fde71d3985be6706701a6d5e2f44a6ccb1d7be4cbda9a37b54ae8a"],
  ["media/lympic.mp3", "eb5986e12712ba2888ded3bcf3eaed0dc74d6909a8b61da24790c64f3c69a6c6"],
  ["media/lympic.wav", "ba13a7d8869fc669684fb111979b47f124fcdb170f02c07c4eaa7f6ee9b92237"],
  ["yokup-lympic-composer.py", "1a7678a75a90c2a56e5089572f10f89425297f93360e2792aaf485b5d651d746"]
]);

test("los activos recuperados conservan los bytes de los deployments inmutables", async () => {
  for (const [path, expected] of assets) {
    const bytes = await readFile(new URL(path, root));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected, path);
  }
});

test("cada asset público enlazado por el shell existe", async () => {
  for (const path of ["favicon.ico", "favicon-32x32.png", "apple-touch-icon.png", "img/trackandfield-scoreboard.png", "media/track-and-field.mp3"]) {
    await access(new URL(path, root));
  }
});

test("Opciones recupera el alta canónica y Avanzado conserva Highscore sin Normativa", () => {
  assert.match(frame, /NUEVO PROYECTO/);
  assert.match(frame, /function openNewProject\(\)/);
  assert.match(frame, /function projectResponsibles\(raw\)/);
  assert.match(frame, /function normalizeProjectWeb\(rawValue\)/);
  assert.match(frame, /https:\/\/api\.yokup\.com\/projects/);
  assert.doesNotMatch(frame, /normativa\.href = "\/normativa"/);
  assert.doesNotMatch(frame, /> NORMATIVA/);
  assert.match(css, /\.yk-project-modal/);
});

test("los contadores reaccionan y se reconcilian cada 12 segundos", () => {
  assert.match(frame, /addEventListener\("yk:decisions-changed", fetchCounters\)/);
  assert.match(frame, /addEventListener\("yk:work-changed", fetchCounters\)/);
  assert.match(frame, /setInterval\(fetchCounters, 12000\)/);
});

test("el lock de deploy vive fuera del artefacto público", () => {
  assert.match(deploy, /join\(tmpdir\(\), "yokup-pages-deploy\.lock"\)/);
  assert.doesNotMatch(deploy, /new URL\("\.\/\.yokup-deploy\.lock"/);
  assert.match(deploy, /mkdtemp\(join\(tmpdir\(\), "yokup-pages-artifact-"\)\)/);
  assert.match(deploy, /cp\(sourceRoot, stagingPath, \{ recursive:true, filter:publicArtifactFilter \}\)/);
  assert.match(deploy, /\/\\\.test\\\.mjs\$\/i/);
  assert.match(deploy, /\/\\\.py\$\/i/);
  assert.match(deploy, /pages", "deploy", stagingPath/);
  assert.doesNotMatch(deploy, /pages", "deploy", "\."/);
});
