import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./src/index.js",import.meta.url),"utf8");
const client=await readFile(new URL("./tools/onidle-hora.sh",import.meta.url),"utf8");

test("la persistencia vive en D1 y no en jobs efímeros del Mac",()=>{
  assert.match(source,/PRIMARY KEY\(identity_key,day,ordinal\)/);
  assert.match(source,/decision_id TEXT NOT NULL UNIQUE/);
  assert.match(source,/INSERT OR IGNORE INTO onidle_ticks/);
  assert.doesNotMatch(client,/launchctl|nohup|watch_decision|ONIDLE_WATCH/);
});

test("cron y piggyback comparten el mismo lease",()=>{
  assert.equal((source.match(/tryAcquireBeatLease\(env, "__scheduled", 120000\)/g)||[]).length,2);
  assert.equal((source.match(/runScheduledRoutine\(env,/g)||[]).length,3);
});
