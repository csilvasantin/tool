import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tool = async (name) => readFile(new URL(`./tools/${name}`, import.meta.url), "utf8");

async function validateDesktopApp(runtime, name, bundle) {
  const client = await tool("mission-evidence.sh");
  const start = client.indexOf("normalize_desktop_runtime()");
  const end = client.indexOf("frontmost_desktop_app()");
  assert.ok(start >= 0 && end > start, "no se encontraron los validadores Desktop");
  return spawnSync("bash", ["-c", `${client.slice(start, end)}\nvalidate_desktop_app "$1" "$2" "$3"`, "_", runtime, name, bundle], { encoding:"utf8" });
}

async function validateDesktopWindow(name, bundle, title, width = "1200", height = "800") {
  const client = await tool("mission-evidence.sh");
  const start = client.indexOf("validate_desktop_window()");
  const end = client.indexOf("frontmost_desktop_app()");
  assert.ok(start >= 0 && end > start, "no se encontró el validador de ventana Desktop");
  return spawnSync("bash", ["-c", `${client.slice(start, end)}\nvalidate_desktop_window "$1" "$2" "$3" 0 0 "$4" "$5"`, "_", name, bundle, title, width, height], { encoding:"utf8" });
}

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
  assert.match(client, /CAPTURED_AT="\$\(capture_time "\$IMAGE" "\$CAPTURED_AT"\)"/);
  assert.match(client, /"evidence_kind":"process"/);
  assert.match(client, /"evidence_kind":"final-fallback"/);
  assert.match(client, /"degraded"/);
  assert.match(client, /"capture_surface"/);
  assert.match(client, /"capture_context"/);
  assert.doesNotMatch(client, /PREVIO=.*IMAGE_URL/,
    "la captura final no puede convertirse silenciosamente en proceso");
});

test("el cliente no rejuvenece un fichero histórico como proceso vivo", async () => {
  const client = await tool("mission-evidence.sh");
  assert.match(client, /capture_time\(\)/);
  assert.match(client, /validate_process_time\(\)/);
  assert.match(client, /stat -f '%m'.*stat -c '%Y'/s);
  assert.match(client, /now - 120000/);
});

test("progress rechaza cualquier imagen manual antes de intentar subirla", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "yokup-old-process-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const image = join(dir, "old.png");
  await writeFile(image, Buffer.from("captura histórica"));
  const script = new URL("./tools/mission-evidence.sh", import.meta.url);
  const result = spawnSync("bash", [script.pathname, "progress", "DCL-test", "--image", image], {
    encoding: "utf8",
    env: { ...process.env, YOKUP_RUNTIME: "Codex", YOKUP_PERSONA: "Oraculo", YOKUP_ROLE: "sub", YOKUP_HOST: "app", YOKUP_API: "http://127.0.0.1:1" }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--image manual no puede declararse como process/);
  assert.doesNotMatch(result.stderr, /curl:/, "debe fallar antes de tocar la red");
});

test("heartbeat lleva captura desde el inicio y la procedencia canónica", async () => {
  const client = await tool("mission-evidence.sh");
  const progress = await tool("progreso-cli.sh");
  const claim = await tool("bot-inbox-claim.sh");
  const initial = client.slice(client.indexOf('if [ "$MODE" = "heartbeat" ] ||'));
  assert.match(initial, /IMAGE="\$\(capture_process_image\)"/);
  assert.match(initial, /"evidence_kind":"process"/);
  assert.match(initial, /"capture_surface":os\.environ\["CAPTURE_SURFACE"\]/);
  assert.match(initial, /"capture_context":os\.environ\["CAPTURE_CONTEXT"\]/);
  assert.match(client, /cli\) CAPTURE_SURFACE="cli"; CAPTURE_CONTEXT="command_output"/);
  assert.match(client, /app\) CAPTURE_SURFACE="desktop"; CAPTURE_CONTEXT="request"/);
  assert.match(progress, /YOKUP_HOST=cli TMUX_CAPTURE_TARGET="\$SESSION:0" "\$HERE\/mission-evidence\.sh" heartbeat/);
  assert.ok(progress.indexOf('mission-evidence.sh" heartbeat') < progress.indexOf("while tmux has-session"));
  assert.ok(claim.indexOf('mission-evidence.sh" heartbeat') < claim.indexOf('bot-inbox-paso.sh"'));
});

test("cada superficie usa sólo su capturador y falla si no puede validarlo", async () => {
  const client = await tool("mission-evidence.sh");
  const cli = client.slice(client.indexOf("capture_cli_image()"), client.indexOf("capture_desktop_image()"));
  const desktop = client.slice(client.indexOf("capture_desktop_image()"), client.indexOf("capture_process_image()"));
  assert.match(cli, /tmux capture-pane -p -S -80 -t/);
  assert.match(cli, /el pane no muestra comando y salida suficientes/);
  assert.doesNotMatch(cli, /AgoraCapture|capture\.req/);
  assert.match(desktop, /validate_desktop_app/);
  assert.match(desktop, /validate_desktop_window/);
  assert.match(client, /app frontal/);
  assert.match(desktop, /AgoraCapture\.app/);
  assert.match(desktop, /capture\.req/);
  assert.doesNotMatch(desktop, /tmux capture-pane/);
});

test("Desktop acepta únicamente Codex y Claude con nombre, bundle y runtime coherentes", async () => {
  for (const accepted of [
    ["Codex", "Codex", "com.openai.codex"],
    ["Codex", "ChatGPT", "com.openai.codex"],
    ["Codex Desktop", "Codex Desktop", "com.openai.codex.desktop"],
    ["Claude", "Claude", "com.anthropic.claudefordesktop"],
    ["Claude Desktop", "Claude Desktop", "com.anthropic.claudefordesktop"]
  ]) {
    const result = await validateDesktopApp(...accepted);
    assert.equal(result.status, 0, `${accepted.join(" / ")}: ${result.stderr}`);
  }
});

test("Desktop rechaza navegadores, web y apps parecidas indicando la app frontal", async () => {
  for (const rejected of [
    ["Claude", "Firefox", "org.mozilla.firefox"],
    ["Claude", "Google Chrome", "com.google.Chrome"],
    ["Codex", "Codex Web", "com.google.Chrome"],
    ["Codex", "ChatGPT", "com.openai.chat"],
    ["Codex", "ChatGPT", "com.openai.chatgpt"],
    ["Codex", "ChatGPT", "com.example.codex"],
    ["Claude", "ChatGPT", "com.openai.codex"],
    ["Codex", "ChatGPT Desktop", "com.openai.codex"],
    ["Claude", "Claude Notes", "com.example.claude-notes"],
    ["Claude", "Codex", "com.openai.codex"]
  ]) {
    const result = await validateDesktopApp(...rejected);
    assert.notEqual(result.status, 0, rejected.join(" / "));
    assert.ok(result.stderr.includes(`app frontal=${rejected[1]}`), result.stderr);
    assert.ok(result.stderr.includes(`bundle=${rejected[2]}`), result.stderr);
    assert.match(result.stderr, /petición visible/);
  }
});

test("Desktop exige una ventana completa identificable antes de pedir la captura", async () => {
  const visible = await validateDesktopWindow("Claude", "com.anthropic.claudefordesktop", "Claude — DCL-mshtsh3q");
  assert.equal(visible.status, 0, visible.stderr);
  for (const [title, width, height] of [["", "1200", "800"], ["Claude", "0", "800"], ["Codex", "1200", "0"]]) {
    const result = await validateDesktopWindow("Claude", "com.anthropic.claudefordesktop", title, width, height);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /app frontal=Claude/);
    assert.match(result.stderr, /ventana completa con la petición legible/);
  }
  const client = await tool("mission-evidence.sh");
  assert.match(client, /AgoraCapture entrega la pantalla completa, no un recorte elegido por el/);
  assert.match(client, /No se afirma OCR del contenido/);
  const desktop = client.slice(client.indexOf("capture_desktop_image()"), client.indexOf("capture_process_image()"));
  assert.equal([...desktop.matchAll(/validate_desktop_app/g)].length, 2, "valida la app antes y después de AgoraCapture");
  assert.equal([...desktop.matchAll(/validate_desktop_window/g)].length, 2, "valida la ventana antes y después de AgoraCapture");
});

test("el cierre canónico intenta capturar proceso sin reciclar la prueba final", async () => {
  const client = await tool("mission-evidence.sh");
  const finalBranch = client.slice(client.indexOf('else\n  [ -n "$REPORT" ]'));
  assert.match(finalBranch, /PROCESS_IMAGE="\$\(capture_process_image\)"/);
  assert.match(finalBranch, /PROCESS_URL="\$\(upload_image "\$PROCESS_IMAGE"\)"/);
  assert.match(finalBranch, /\$API\/fleet\/progress/);
  assert.match(finalBranch, /IMAGE_URL="\$\(upload_image "\$IMAGE"\)"/);
  assert.match(finalBranch, /IMAGE="\$\(capture_process_image\)"/);
  assert.doesNotMatch(finalBranch, /PROCESS_URL="\$IMAGE_URL"|PROCESS_IMAGE="\$IMAGE"/);
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
