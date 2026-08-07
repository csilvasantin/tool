import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("../src/index.js",import.meta.url),"utf8");

test("/tasks/all selecciona live_shot y su timestamp como una pareja",()=>{
  const start=source.indexOf("async function listAllMissionTasks");
  const end=source.indexOf("__name(listAllMissionTasks",start);
  assert.ok(start>=0&&end>start,"falta listAllMissionTasks");
  const fn=source.slice(start,end);
  assert.match(fn,/t\.live_shot, t\.live_at/);
  assert.match(fn,/const rows = \(results \|\| \[\]\)\.map\(\(task\) => \{/);
  assert.match(fn,/return \{ \.\.\.task, visible_state:visible\.state/);
  assert.doesNotMatch(fn,/delete\s+task\.live_at|live_at:\s*0/);
});
