import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker=await readFile(new URL("./src/index.js",import.meta.url),"utf8");
const room=await readFile(new URL("./src/pty-room.js",import.meta.url),"utf8");
const wrangler=await readFile(new URL("./wrangler.toml",import.meta.url),"utf8");

test("el visor usa ticket HMAC breve ligado a una sesión viva",()=>{
  assert.match(worker,/scope:"pty-view"/);
  assert.match(worker,/exp:Date\.now\(\) \+ 60 \* 1000/);
  assert.match(worker,/verifyCliTerminalTarget\(env, \{ \.\.\.body, action:"read" \}\)/);
  assert.match(worker,/yokupViewerOrigin\(req\)/);
  assert.match(worker,/readSession\(env, url\.searchParams\.get\("ticket"\)\)/);
});

test("el bridge es saliente, autenticado y revalida Presence",()=>{
  assert.match(worker,/url\.pathname === "\/fleet\/pty\/bridge"/);
  assert.match(worker,/authorizeCliExecutor\(env, req\)/);
  assert.match(worker,/verifyCliTerminalTarget\(env,/);
  assert.doesNotMatch(worker,/YOKUP_CLI_EXECUTOR_TOKEN[^\n]*json\(/);
});

test("la sala retransmite sólo entrada, resize, foco y salida PTY",()=>{
  assert.match(room,/message\.type === "input" \|\| message\.type === "resize" \|\| message\.type === "focus"/);
  assert.match(room,/message\.type === "output" \|\| message\.type === "status"/);
  assert.match(room,/viewer-left/);
  assert.match(room,/bridge replaced/);
});

test("PtyRoom queda migrado como Durable Object sqlite",()=>{
  assert.match(wrangler,/name = "PTY"\s+class_name = "PtyRoom"/);
  assert.match(wrangler,/tag = "v2"\s+new_sqlite_classes = \["PtyRoom"\]/);
});
