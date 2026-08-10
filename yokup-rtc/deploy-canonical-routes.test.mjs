import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const deploy = await readFile(new URL("./deploy.sh", import.meta.url), "utf8");
const gate = new URL("./scripts/assert-canonical-routes.mjs", import.meta.url);
const worker = new URL("./src/index.js", import.meta.url);

test("el gate acepta el worker canónico y rechaza el fallback sin handlers", async () => {
  const canonical = spawnSync(process.execPath, [gate.pathname, worker.pathname], { encoding: "utf8" });
  assert.equal(canonical.status, 0, canonical.stderr);
  assert.match(canonical.stdout, /rutas canónicas presentes/);

  const dir = await mkdtemp(join(tmpdir(), "yokup-stale-worker-"));
  const stale = join(dir, "index.js");
  await writeFile(stale, 'return new Response("yokup-rtc · helpdesk API + realtime");\n');
  const rejected = spawnSync(process.execPath, [gate.pathname, stale], { encoding: "utf8" });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /GET \/fleet\/onidle-state/);
  assert.match(rejected.stderr, /GET \/fleet\/cli/);
});

test("deploy exige main exacto, limpio y valida fuente más bundle dry-run", () => {
  assert.match(deploy, /git fetch -q origin main\n/);
  assert.doesNotMatch(deploy, /git fetch[^\n]+\|\| true/,
    "sin red no se puede fingir que origin/main cacheado es canónico");
  assert.match(deploy, /git rev-parse HEAD/);
  assert.match(deploy, /git rev-parse origin\/main/);
  assert.match(deploy, /git status --porcelain --untracked-files=all/);
  assert.match(deploy, /assert-canonical-routes\.mjs src\/index\.js/);
  assert.match(deploy, /deploy --dry-run --outdir/);
  assert.match(deploy, /assert-canonical-routes\.mjs "\$DRYRUN_DIR\/index\.js"/);
  const dryRun = deploy.indexOf("deploy --dry-run --outdir");
  const bundleGate = deploy.indexOf('assert-canonical-routes.mjs "$DRYRUN_DIR/index.js"');
  const realDeploy = deploy.lastIndexOf('" deploy');
  assert.ok(dryRun > 0 && bundleGate > dryRun && realDeploy > bundleGate,
    "el bundle se valida antes del único deploy real");
});
