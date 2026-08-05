import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tool = async (name) => readFile(new URL(`./tools/${name}`, import.meta.url), "utf8");

test("Desktop, CLI y subagentes atraviesan el mismo cliente", async () => {
  const client = await tool("mission-evidence.sh");
  const progress = await tool("progreso-cli.sh");
  const informe = await tool("bot-inbox-informe.sh");
  const proof = await tool("mission-proof.sh");
  assert.match(progress, /mission-evidence\.sh.*heartbeat/);
  assert.match(progress, /mission-evidence\.sh.*progress/);
  assert.match(informe, /mission-evidence\.sh.*final/);
  assert.match(proof, /mission-evidence\.sh.*final/);
  assert.match(client, /quien-ejecuta\.sh/);
});

test("el cliente distingue proceso y fallback final degradado", async () => {
  const client = await tool("mission-evidence.sh");
  assert.match(client, /CAPTURED_AT=.*date \+%s/);
  assert.match(client, /KIND="process"/);
  assert.match(client, /KIND="final-fallback"/);
  assert.match(client, /"degraded"/);
  assert.doesNotMatch(client, /PREVIO=.*IMAGE_URL/,
    "la captura final no puede convertirse silenciosamente en proceso");
});

test("la identidad nunca cae a un owner genérico", async () => {
  const identity = await tool("quien-ejecuta.sh");
  assert.match(identity, /identidad indeterminada/);
  assert.match(identity, /YOKUP_PERSONA/);
  assert.match(identity, /OWNER="\$\{PREFIX\}\$\{BASE\}\$\{SUFFIX\}"/);
  assert.doesNotMatch(identity, /OWNER:-infraagente|OWNER="infraagente"/);
});

test("MacBookProNegro14 resuelve MBP14 sin confundirse con MBP16", async (t) => {
  const vault = await mkdtemp(join(tmpdir(), "yokup-identity-"));
  t.after(() => rm(vault, { recursive: true, force: true }));
  await writeFile(join(vault, "persona-id.sh"), 'MACHINE="MacBookProNegro14"\n');
  const script = new URL("./tools/quien-ejecuta.sh", import.meta.url);
  const result = spawnSync("bash", [script.pathname], {
    encoding: "utf8",
    env: { ...process.env, ADMIRA_VAULT_DIR: vault, YOKUP_RUNTIME: "Codex", YOKUP_PERSONA: "Morfeo", YOKUP_ROLE: "infra", YOKUP_HOST: "app" }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "Morfeo app InfraMorfeoMBP14 Codex");

  await writeFile(join(vault, "persona-id.sh"), 'MACHINE="MacBookProNegro16"\n');
  const mbp16 = spawnSync("bash", [script.pathname], {
    encoding: "utf8",
    env: { ...process.env, ADMIRA_VAULT_DIR: vault, YOKUP_RUNTIME: "Codex", YOKUP_PERSONA: "Oraculo", YOKUP_ROLE: "infra", YOKUP_HOST: "app" }
  });
  assert.equal(mbp16.status, 0, mbp16.stderr);
  assert.equal(mbp16.stdout.trim(), "Oraculo app InfraOraculoMBP16 Codex");
});

test("el instalador distribuye el contrato completo en cada vault", async () => {
  const installer = await tool("install-evidence-tools.sh");
  for (const name of ["quien-ejecuta.sh", "mission-evidence.sh", "progreso-cli.sh", "bot-inbox-informe.sh", "mission-proof.sh", "bot-inbox-paso.sh", "bot-inbox-claim.sh", "bot-inbox-ack.sh"]) {
    assert.match(installer, new RegExp(name.replaceAll(".", "\\.")));
  }
  assert.match(installer, /install -m 0755/);
  assert.match(installer, /cmp -s/);
  assert.match(installer, /YOKUP_VERIFY_IDENTITY/);
});

test("el instalador puede verificar identidad después de copiar", async (t) => {
  const vault = await mkdtemp(join(tmpdir(), "yokup-install-"));
  t.after(() => rm(vault, { recursive: true, force: true }));
  await writeFile(join(vault, "persona-id.sh"), 'MACHINE="MacBookProNegro14"\n');
  const installer = new URL("./tools/install-evidence-tools.sh", import.meta.url);
  const result = spawnSync("bash", [installer.pathname], {
    encoding: "utf8",
    env: { ...process.env, ADMIRA_VAULT_DIR: vault, YOKUP_VERIFY_IDENTITY: "1", YOKUP_RUNTIME: "Claude", YOKUP_PERSONA: "Morfeo", YOKUP_ROLE: "infra", YOKUP_HOST: "cli" }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Identidad verificada: Morfeo cli InfraMorfeoMBP14 Claude/);
});

test("mission-proof conserva stdout URL para que ack no reciba JSON", async () => {
  const proof = await tool("mission-proof.sh");
  const ack = await tool("bot-inbox-ack.sh");
  assert.match(proof, /r\.get\("ok"\).*r\.get\("resolved"\).*r\.get\("proof_image"\)/s);
  assert.match(proof, /print\(r\["proof_image"\]\)/);
  assert.match(ack, /PROOF_URL=.*mission-proof\.sh/);
});
