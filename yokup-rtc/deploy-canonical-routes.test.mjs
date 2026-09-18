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
  assert.match(rejected.stderr, /Supervisor autenticado/);
});

test("el gate tolera preparación autenticada larga y rechaza invertir auth y handler", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yokup-supervisor-gate-"));
  const canonicalRoutes = `
if (url.pathname === "/fleet/onidle-state" && req.method === "GET") return fleetState();
if (url.pathname === "/fleet/cli" && req.method === "GET") return fleetCli();
`;
  const authenticated = join(dir, "authenticated.js");
  await writeFile(authenticated, `${canonicalRoutes}
if (url.pathname.startsWith("/supervisor/")) {
  const session = await requireAuth(env, req);
  ${"const authenticatedSetup = true;\n".repeat(24)}
  return handleSupervisorRequest(req, env, url);
}
`);
  const accepted = spawnSync(process.execPath, [gate.pathname, authenticated], { encoding: "utf8" });
  assert.equal(accepted.status, 0, accepted.stderr);

  const inverted = join(dir, "inverted.js");
  await writeFile(inverted, `${canonicalRoutes}
if (url.pathname.startsWith("/supervisor/")) {
  const response = await handleSupervisorRequest(req, env, url);
  const session = await requireAuth(env, req);
  return response;
}
`);
  const rejected = spawnSync(process.execPath, [gate.pathname, inverted], { encoding: "utf8" });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Supervisor sin autenticación previa/);

  const crossed = join(dir, "crossed-routes.js");
  await writeFile(crossed, `${canonicalRoutes}
if (url.pathname.startsWith("/supervisor/")) {
  return handleSupervisorRequest(req, env, url);
}
if (url.pathname.startsWith("/supervisor/")) {
  const session = await requireAuth(env, req);
  return handleSupervisorRequest(req, env, url);
}
`);
  const crossedRejected = spawnSync(process.execPath, [gate.pathname, crossed], { encoding: "utf8" });
  assert.equal(crossedRejected.status, 1);
  assert.match(crossedRejected.stderr, /Supervisor sin autenticación previa/);
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
