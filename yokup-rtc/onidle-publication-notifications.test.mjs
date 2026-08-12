import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./src/index.js",import.meta.url),"utf8");
const client=await readFile(new URL("./tools/onidle-hora.sh",import.meta.url),"utf8");

test("publicación y resultado son observables por ledger y worker beat",()=>{
  assert.match(source,/CREATE TABLE IF NOT EXISTS onidle_ticks/);
  assert.match(source,/status='published',published_at=\?/);
  assert.match(source,/step\("onIdle", \(\) => runOnIdleTick\(env\)\)/);
  assert.match(source,/recordBeat\(env, name, true/);
});

test("el cliente local no reproduce notificaciones ni mantiene watchers",()=>{
  assert.doesNotMatch(client,/Glass|Ping|afplay|watch_decision|nohup|launchctl/);
  assert.doesNotMatch(client,/-X POST|\/decisions/);
});
