import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker from "./src/index.js";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
function extract(name) {
  const match = new RegExp(`(?:async\\s+)?function ${name}\\(`).exec(source);
  assert.ok(match, `falta ${name}`);
  const start = match.index, brace = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if ('"\'`'.includes(char)) { quote = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`función incompleta: ${name}`);
}

const build = new Function(`
  ${extract("normalizeProofImage")}
  ${extract("embeddedImageMatchesMime")}
  ${extract("imageBytesMatchMime")}
  ${extract("unsafeEvidenceHost")}
  ${extract("validateProofImage")}
  return {embeddedImageMatchesMime,imageBytesMatchMime,unsafeEvidenceHost,validateProofImage};
`);
const { embeddedImageMatchesMime, imageBytesMatchMime, unsafeEvidenceHost, validateProofImage } = build();

test("data:image exige magic bytes coherentes con el MIME", () => {
  assert.equal(embeddedImageMatchesMime("data:image/png;base64,iVBORw0KGgo="), true);
  assert.equal(embeddedImageMatchesMime("data:image/png;base64,AAAAAAAAAAA="), false);
  assert.equal(embeddedImageMatchesMime("data:image/jpeg;base64,/9j/"), true);
});

test("/fleet/media no acepta HTML disfrazado de image/png", () => {
  const png = Uint8Array.from([137,80,78,71,13,10,26,10]);
  const html = new TextEncoder().encode("<html>falso</html>");
  assert.equal(imageBytesMatchMime("image/png", png), true);
  assert.equal(imageBytesMatchMime("image/png", html), false);
  assert.match(source, /image_content_mismatch/);
  assert.match(source, /imageBytesMatchMime\(kind\.ct, buf\)/);
});

test("handler /fleet/media devuelve 400 y no escribe R2 para HTML disfrazado", async () => {
  let puts = 0;
  const env = { MEDIA: { async put() { puts += 1; } } };
  const response = await worker.fetch(new Request("https://yokup-rtc.test/fleet/media", {
    method: "POST", headers: { "content-type": "image/png" }, body: "<html>no es png</html>"
  }), env, {});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "image_content_mismatch");
  assert.equal(puts, 0);
});

test("rechaza destinos locales y privados", () => {
  for (const host of ["localhost", "127.0.0.1", "10.0.0.2", "172.20.1.2", "192.168.1.2", "box.local", "::1"]) {
    assert.equal(unsafeEvidenceHost(host), true, host);
  }
  assert.equal(unsafeEvidenceHost("cdn.example.com"), false);
});

test("la media propia debe existir en R2 y ser image/*", async () => {
  const url = "https://api.yokup.test/media/fleet/0123456789abcdef.png";
  const good = { MEDIA: { head: async () => ({ httpMetadata: { contentType: "image/png" } }) } };
  const bad = { MEDIA: { head: async () => ({ httpMetadata: { contentType: "text/html" } }) } };
  assert.equal((await validateProofImage(good, url, "https://api.yokup.test")).value, url);
  assert.equal((await validateProofImage(bad, url, "https://api.yokup.test")).value, null);
});

test("una URL externa sólo vale si responde realmente como imagen", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, headers: { get: () => "image/png" }, arrayBuffer: async () => Uint8Array.from([137,80,78,71,13,10,26,10]).buffer });
    assert.equal((await validateProofImage({}, "https://cdn.example.com/proof", "https://api.yokup.test")).value, "https://cdn.example.com/proof");
    globalThis.fetch = async () => ({ ok: true, headers: { get: () => "text/html" }, arrayBuffer: async () => new ArrayBuffer(0) });
    assert.equal((await validateProofImage({}, "https://cdn.example.com/fake.png", "https://api.yokup.test")).value, null);
    globalThis.fetch = async () => ({ ok: true, headers: { get: () => "image/png" }, arrayBuffer: async () => new TextEncoder().encode("html").buffer });
    assert.equal((await validateProofImage({}, "https://cdn.example.com/fake-content.png", "https://api.yokup.test")).value, null);
  } finally { globalThis.fetch = originalFetch; }
});
