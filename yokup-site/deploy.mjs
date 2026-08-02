import { open, readFile, writeFile, unlink, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { nextDeployVersion, versionFromPayload } from "./deploy-version.js";

const lockPath = new URL("./.yokup-deploy.lock", import.meta.url);
const versionPath = new URL("./version.json", import.meta.url);
const deployer = String(process.env.YOKUP_DEPLOY_AGENT || "").trim();

if (!deployer) {
  console.error("Falta YOKUP_DEPLOY_AGENT. Ejemplo: YOKUP_DEPLOY_AGENT=Oraculo node deploy.mjs");
  process.exit(2);
}

let lock;
let previousVersion = null;
let previousHtml = new Map();
try {
  lock = await open(lockPath, "wx");
  await lock.writeFile(JSON.stringify({ deployer, pid:process.pid, startedAt:new Date().toISOString() }, null, 2));
} catch (error) {
  if (error && error.code === "EEXIST") {
    console.error("Deploy bloqueado: otro agente ya está publicando Yokup (.yokup-deploy.lock).");
    process.exit(3);
  }
  throw error;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd:new URL(".", import.meta.url), stdio:"inherit", shell:false });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} terminó con ${code}`)));
  });
}

async function htmlFiles(dirUrl) {
  const out = [];
  for (const entry of await readdir(dirUrl, { withFileTypes:true })) {
    if (entry.name === "node_modules" || entry.name === ".wrangler" || entry.name.startsWith(".")) continue;
    const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dirUrl);
    if (entry.isDirectory()) out.push(...await htmlFiles(child));
    else if (/\.html$/i.test(entry.name) && !/\.bak/i.test(entry.name)) out.push(child);
  }
  return out;
}

async function testFiles(dirUrl) {
  return (await readdir(dirUrl, { withFileTypes:true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
    .map((entry) => entry.name).sort();
}

async function stampFrameReferences(version) {
  const changed = new Map();
  for (const file of await htmlFiles(new URL("./", import.meta.url))) {
    const before = await readFile(file, "utf8");
    const stamp = encodeURIComponent(version);
    const favicon = [
      `<link rel="icon" href="/favicon.ico?v=${stamp}" sizes="any">`,
      `<link rel="icon" type="image/png" href="/favicon-32x32.png?v=${stamp}" sizes="32x32">`,
      `<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=${stamp}">`
    ].join("\n");
    let after = before
      // El valor de ?v termina en el primer carácter ajeno a una versión. Antes
      // `[^"']*` podía atravesar un comentario CSS sin comillas hasta el siguiente
      // atributo HTML y tragarse la etiqueta <body> completa.
      .replace(/\/yk-frame\.js(?:\?v=[A-Za-z0-9._%+-]+)?/g, "/yk-frame.js?v=" + stamp)
      .replace(/\/yk-agent-identity\.js(?:\?v=[A-Za-z0-9._%+-]+)?/g, "/yk-agent-identity.js?v=" + stamp)
      .replace(/\/yk-misiones\.js(?:\?v=[A-Za-z0-9._%+-]+)?/g, "/yk-misiones.js?v=" + stamp)
      .replace(/\/yk-misiones\.css(?:\?v=[A-Za-z0-9._%+-]+)?/g, "/yk-misiones.css?v=" + stamp)
      .replace(/\s*<link\b[^>]*\brel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]*>/gi, "");
    const anchor = /<meta\b[^>]*\bname=["']viewport["'][^>]*>/i.test(after)
      ? /(<meta\b[^>]*\bname=["']viewport["'][^>]*>)/i
      : /(<meta\b[^>]*\bcharset=["'][^"']+["'][^>]*>)/i;
    after = after.replace(anchor, `$1\n${favicon}`);
    if (after !== before) { changed.set(file, before); await writeFile(file, after); }
  }
  return changed;
}

try {
  previousVersion = await readFile(versionPath, "utf8").catch(() => null);
  const now = new Date();
  // La revisión diaria se coordina contra producción además del fichero local.
  // El lock evita dos deploys simultáneos en este checkout; consultar el sello
  // público evita reutilizar rN tras clonar/actualizar desde otra máquina.
  const publicVersion = await fetch("https://www.yokup.com/version.json?deploy=" + Date.now(), { cache:"no-store" })
    .then((r) => r.ok ? r.json() : null).then(versionFromPayload).catch(() => "");
  const version = nextDeployVersion(now, [versionFromPayload(previousVersion), publicVersion]);
  const git = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding:"utf8" }).trim();
  const dirty = !!execFileSync("git", ["status", "--porcelain"], { encoding:"utf8" }).trim();
  const payload = {
    version,
    deployedAt:now.toISOString(),
    deployer,
    git,
    dirty
  };
  await writeFile(versionPath, JSON.stringify(payload, null, 2) + "\n");
  previousHtml = await stampFrameReferences(payload.version);
  console.log(`Sello ${payload.version} · ${deployer}`);
  const tests = await testFiles(new URL("./", import.meta.url));
  if (!tests.length) throw new Error("Deploy bloqueado: no se encontraron pruebas *.test.mjs");
  await run(process.execPath, ["--test", ...tests]);
  await run("npx", ["wrangler", "pages", "deploy", ".", "--project-name", "yokup", "--branch", "main", "--commit-dirty=true"]);
  console.log(`Yokup publicado: ${payload.version}`);
} catch (error) {
  if (previousVersion != null) await writeFile(versionPath, previousVersion);
  for (const [file, content] of previousHtml) await writeFile(file, content);
  console.error(error && error.message || error);
  process.exitCode = 1;
} finally {
  await lock.close().catch(() => {});
  await unlink(lockPath).catch(() => {});
}
