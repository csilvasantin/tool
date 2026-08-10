import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const sourceRoot = resolve(new URL("../yokup-site/", import.meta.url).pathname);
const targetRoot = resolve(process.argv[2] || "");
const release = JSON.parse(process.env.RELEASE_JSON || "null");
if (!targetRoot || !release || !release.version) throw new Error("Uso: RELEASE_JSON='{...}' node build-assets.mjs <staging>");

function publicFilter(source) {
  const rel = relative(sourceRoot, source);
  if (!rel) return true;
  const parts = rel.split(sep);
  if (parts.some((part) => part.startsWith(".") || part === "node_modules" || part === "__pycache__" || part === "functions")) return false;
  const name = basename(rel);
  if (name === "_routes.json" || /\.test\.mjs$/i.test(name) || /\.(?:py|md)$/i.test(name) || /\.bak(?:-|$)/i.test(name)) return false;
  if (/^deploy(?:-[a-z-]+)?\.(?:m?js)$/i.test(name) || name === "pages-snapshots.mjs" || /^(?:package(?:-lock)?\.json|wrangler\.toml)$/i.test(name)) return false;
  return true;
}

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    const child = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await htmlFiles(child));
    else if (/\.html$/i.test(entry.name) && !/\.bak/i.test(entry.name)) out.push(child);
  }
  return out;
}

async function stamp(version) {
  const encoded = encodeURIComponent(version);
  for (const file of await htmlFiles(targetRoot)) {
    if (file.endsWith(sep + "trackandfield.html")) continue;
    const before = await readFile(file, "utf8");
    const favicon = [
      `<link rel="icon" href="/favicon.ico?v=${encoded}" sizes="any">`,
      `<link rel="icon" type="image/png" href="/favicon-32x32.png?v=${encoded}" sizes="32x32">`,
      `<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=${encoded}">`
    ].join("\n");
    let after = before
      .replace(/\/(yk-[a-z0-9-]+\.(?:js|css))(?:\?v=[A-Za-z0-9._%+-]+)?/g, "/$1?v=" + encoded)
      .replace(/\s*<link\b[^>]*\brel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]*>/gi, "");
    const anchor = /<meta\b[^>]*\bname=["']viewport["'][^>]*>/i.test(after)
      ? /(<meta\b[^>]*\bname=["']viewport["'][^>]*>)/i
      : /(<meta\b[^>]*\bcharset=["'][^"']+["'][^>]*>)/i;
    after = after.replace(anchor, `$1\n${favicon}`);
    if (after !== before) await writeFile(file, after);
  }
}

await mkdir(targetRoot, {recursive:true});
await cp(sourceRoot, targetRoot, {recursive:true, filter:publicFilter});
await writeFile(join(targetRoot, "version.json"), JSON.stringify(release, null, 2) + "\n");
await stamp(release.version);
console.log(`Assets canónicos preparados: ${release.version}`);
