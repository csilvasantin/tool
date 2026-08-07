import { open, readFile, writeFile, unlink, readdir, cp, mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { nextDeployVersion, versionFromPayload } from "./deploy-version.js";
import { validateDeployIdentity, wranglerCommitArgs } from "./deploy-signature.mjs";

// Lock estable por proyecto, fuera del directorio publicado. Un lock dentro de
// yokup-site entra en el manifest de Pages y expone metadatos de coordinación.
const lockPath = join(tmpdir(), "yokup-pages-deploy.lock");
const versionPath = new URL("./version.json", import.meta.url);
const sourceRoot = fileURLToPath(new URL("./", import.meta.url));
let deployIdentity;
try {
  deployIdentity = validateDeployIdentity(process.env.YOKUP_DEPLOY_AGENT, process.env.YOKUP_DEPLOY_MACHINE);
} catch (error) {
  console.error(error.message + ". Ejemplo: YOKUP_DEPLOY_AGENT=OraculoMacMini YOKUP_DEPLOY_MACHINE=MacMini node deploy.mjs");
  process.exit(2);
}
const { deployer, machine, signature } = deployIdentity;

let lock;
let stagingPath = "";
try {
  lock = await open(lockPath, "wx");
  await lock.writeFile(JSON.stringify({ deployer, machine, signature, pid:process.pid, startedAt:new Date().toISOString() }, null, 2));
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

async function stampFrameReferences(version, rootUrl) {
  for (const file of await htmlFiles(rootUrl)) {
    // Recuperación canónica e inmutable: su hash forma parte del contrato público.
    // No usa yk-frame, y tampoco debe recibir el sello de favicon del resto del shell.
    if (file.pathname.endsWith("/trackandfield.html")) continue;
    const before = await readFile(file, "utf8");
    const stamp = encodeURIComponent(version);
    const favicon = [
      `<link rel="icon" href="/favicon.ico?v=${stamp}" sizes="any">`,
      `<link rel="icon" type="image/png" href="/favicon-32x32.png?v=${stamp}" sizes="32x32">`,
      `<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=${stamp}">`
    ].join("\n");
    let after = before
      // TODO el marco se sella con UNA regla, no con una lista a mano.
      //
      // La lista se quedaba corta cada vez que nacía un fichero: el 5-ago fue
      // yk-frame.css, que arrastraba sellos congelados mientras su .js sí se
      // resellaba, y el 7-ago eran SEIS —yk-cabezal.js y .css, yk-adjuntos,
      // yk-avatar, yk-display-ref, yk-maquina—. Con `max-age=14400` en Pages, un
      // fichero sin resellar puede tardar hasta 4 h en verse, o verse a medias:
      // el JS nuevo con la hoja vieja. Se publicó el cambio del cabezal y en
      // producción seguía sirviéndose el anterior, pidiendo ?v=r4.
      //
      // Añadir el que falta arregla el caso y deja la trampa puesta para el
      // siguiente. Esto sella cualquier /yk-*.js|css, exista hoy o se cree mañana.
      //
      // El valor de ?v termina en el primer carácter ajeno a una versión: antes
      // `[^"']*` podía atravesar un comentario CSS sin comillas hasta el siguiente
      // atributo HTML y tragarse la etiqueta <body> completa.
      .replace(/\/(yk-[a-z0-9-]+\.(?:js|css))(?:\?v=[A-Za-z0-9._%+-]+)?/g, "/$1?v=" + stamp)
      .replace(/\s*<link\b[^>]*\brel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]*>/gi, "");
    const anchor = /<meta\b[^>]*\bname=["']viewport["'][^>]*>/i.test(after)
      ? /(<meta\b[^>]*\bname=["']viewport["'][^>]*>)/i
      : /(<meta\b[^>]*\bcharset=["'][^"']+["'][^>]*>)/i;
    after = after.replace(anchor, `$1\n${favicon}`);
    if (after !== before) await writeFile(file, after);
  }
}

// El checkout contiene contratos, herramientas y documentación que deben seguir
// versionados, pero Pages sólo recibe runtime y assets públicos. El staging vive
// fuera del árbol y desaparece al terminar, sin tocar ni publicar el lock.
function publicArtifactFilter(source) {
  const rel = relative(sourceRoot, source);
  if (!rel) return true;
  const parts = rel.split(sep);
  if (parts.some((part) => part.startsWith(".") || part === "node_modules" || part === "__pycache__")) return false;
  const name = basename(rel);
  if (/\.test\.mjs$/i.test(name) || /\.py$/i.test(name) || /\.md$/i.test(name) || /\.bak(?:-|$)/i.test(name)) return false;
  if (/^deploy(?:-[a-z-]+)?\.(?:m?js)$/i.test(name) || name === "pages-snapshots.mjs" || /^(?:package(?:-lock)?\.json|wrangler\.toml)$/i.test(name)) return false;
  return true;
}

try {
  const previousVersion = await readFile(versionPath, "utf8").catch(() => null);
  const now = new Date();
  // La revisión diaria se coordina contra producción además del fichero local.
  // El lock evita dos deploys simultáneos en este checkout; consultar el sello
  // público evita reutilizar rN tras clonar/actualizar desde otra máquina.
  const publicVersion = await fetch("https://www.yokup.com/version.json?deploy=" + Date.now(), { cache:"no-store" })
    .then((r) => r.ok ? r.json() : null).then(versionFromPayload).catch(() => "");
  const version = nextDeployVersion(now, [versionFromPayload(previousVersion), publicVersion]);
  // ── PRODUCCION ES MAIN, SIEMPRE ─────────────────────────────────────────
  // Este script publica a `--branch main`, que en Pages ES produccion, sea cual
  // sea el arbol que tengas delante. El 5-ago-2026 eso llevo a que yokup.com
  // sirviera durante horas la rama codex/yokup-standalone-tasks: los 11 commits
  // de la mañana estaban en main y nadie los veia, y encima produccion enseñaba
  // una funcion que main no tenia. Nada se perdio, pero nadie se entero.
  //
  // Asi que antes de publicar se comprueba que lo que hay delante es EXACTAMENTE
  // origin/main. Si no lo es, se para y se dice en que se diferencia. Publicar
  // una rama a produccion tiene que costar una decision explicita, no ser el
  // camino por defecto.
  execFileSync("git", ["fetch", "--quiet", "origin", "main"], { encoding:"utf8" });
  const headSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding:"utf8" }).trim();
  const mainSha = execFileSync("git", ["rev-parse", "origin/main"], { encoding:"utf8" }).trim();
  if (headSha !== mainSha && process.env.YOKUP_DEPLOY_FORCE !== "1") {
    const delante = execFileSync("git", ["rev-list", "--count", "origin/main..HEAD"], { encoding:"utf8" }).trim();
    const detras = execFileSync("git", ["rev-list", "--count", "HEAD..origin/main"], { encoding:"utf8" }).trim();
    const rama = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding:"utf8" }).trim();
    throw new Error(
      "Deploy bloqueado: produccion es main y esto no es main.\n" +
      `  estas en   : ${rama} (${headSha.slice(0, 7)})\n` +
      `  origin/main: ${mainSha.slice(0, 7)}\n` +
      `  tienes ${delante} commit(s) que main no tiene y te faltan ${detras} que main si tiene.\n` +
      "  Funde tu rama en main y publica desde ahi. Si de verdad quieres publicar\n" +
      "  este arbol tal cual, hazlo consciente: YOKUP_DEPLOY_FORCE=1."
    );
  }
  // Se recalcula igual que siempre: hay un test que fija esta linea literal
  // como contrato del sello, y no la voy a cambiar por un atajo mio.
  const gitFull = execFileSync("git", ["rev-parse", "HEAD"], { encoding:"utf8" }).trim();
  const gitShort = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding:"utf8" }).trim();
  const dirty = !!execFileSync("git", ["status", "--porcelain"], { encoding:"utf8" }).trim();
  const payload = {
    version,
    deployedAt:now.toISOString(),
    deployer,
    machine,
    signature,
    git:gitShort,
    gitShort,
    gitFull,
    dirty
  };
  console.log(`Sello ${payload.version} · ${signature}`);
  const tests = await testFiles(new URL("./", import.meta.url));
  if (!tests.length) throw new Error("Deploy bloqueado: no se encontraron pruebas *.test.mjs");
  await run(process.execPath, ["--test", ...tests]);
  // Las pruebas validan la fuente canónica (baseline de versión y artefactos
  // inmutables) antes de crear cambios efímeros destinados exclusivamente al deploy.
  stagingPath = await mkdtemp(join(tmpdir(), "yokup-pages-artifact-"));
  await cp(sourceRoot, stagingPath, { recursive:true, filter:publicArtifactFilter });
  await writeFile(join(stagingPath, "version.json"), JSON.stringify(payload, null, 2) + "\n");
  await stampFrameReferences(payload.version, pathToFileURL(stagingPath + sep));
  const commitArgs = wranglerCommitArgs({ gitFull, signature, version:payload.version });
  // `npx wrangler` a secas resuelve la ÚLTIMA versión publicada: el 07-08-2026 la
  // 4.120.0 devolvía 404 en el registro de npm y no se podía desplegar nada. Se fija
  // una versión probada; subirla es consciente (WRANGLER_VERSION=x.y.z node deploy.mjs).
  const wrangler = `wrangler@${process.env.WRANGLER_VERSION || "4.119.0"}`;
  await run("npx", [wrangler, "pages", "deploy", stagingPath, "--project-name", "yokup", "--branch", "main", "--commit-dirty=" + dirty, ...commitArgs]);
  console.log(`Yokup publicado: ${payload.version}`);
} catch (error) {
  console.error(error && error.message || error);
  process.exitCode = 1;
} finally {
  await lock.close().catch(() => {});
  await unlink(lockPath).catch(() => {});
  if (stagingPath && stagingPath.startsWith(tmpdir() + sep + "yokup-pages-artifact-")) {
    await rm(stagingPath, { recursive:true, force:true }).catch(() => {});
  }
}
