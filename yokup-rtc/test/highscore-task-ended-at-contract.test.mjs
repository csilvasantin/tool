import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
const activeStart=source.indexOf("async function highscoreActiveWork");
const active=source.slice(activeStart,source.indexOf("__name(highscoreActiveWork,",activeStart));
const statusStart=source.indexOf("async function setTaskStatus");
const status=source.slice(statusStart,source.indexOf("__name(setTaskStatus,",statusStart));

test("mission_tasks persiste un fin factual separado de updated_at",()=>{
  assert.match(source,/ALTER TABLE mission_tasks ADD COLUMN ended_at INTEGER/);
  assert.match(status,/ended_at=CASE WHEN \?='done' AND status!='done' THEN COALESCE\(ended_at,\?\)/);
  assert.match(status,/WHEN \? IN \('pending','in_progress'\) AND status='done' THEN NULL/);
});

test("last_work de tarea exige ended_at y conserva su contrato visible",()=>{
  assert.match(active,/m\.started_at work_started_at,m\.started_at work_progress_at,NULL assignment_event_at/);
  assert.match(active,/m\.status='done'[\s\S]*m\.ended_at IS NOT NULL[\s\S]*ORDER BY m\.ended_at DESC/);
  assert.match(active,/row\.kind === "task"[\s\S]*row\.title[\s\S]*row\.assignee, "last_work"/);
  assert.match(active,/`\$\{String\(row\.mission_id \|\| ""\)\}:\$\{String\(row\.code \|\| ""\)\}`/);
  assert.doesNotMatch(active,/m\.updated_at\s+ended_at/);
});

test("los cierres masivos también sellan ended_at sin reescribir uno previo",()=>{
  assert.match(source,/UPDATE mission_tasks SET status='done',ended_at=COALESCE\(ended_at,\?\),updated_at=\?/);
  assert.match(source,/status='done', owner=COALESCE\(NULLIF\(owner,''\),'auto-cierre'\), ended_at=COALESCE\(ended_at,\?\)/);
  assert.match(source,/ended_at=COALESCE\(mission_tasks\.ended_at,excluded\.ended_at\)/);
});
