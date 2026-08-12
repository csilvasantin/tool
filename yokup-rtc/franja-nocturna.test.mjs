import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const client=await readFile(new URL("./tools/onidle-hora.sh",import.meta.url),"utf8");
const source=await readFile(new URL("./src/index.js",import.meta.url),"utf8");

test("OnIDLE ya no depende de una franja horaria del Mac",()=>{
  assert.doesNotMatch(client,/date \+%H|NIGHT_START|NIGHT_END|franja|23|08/);
  assert.match(source,/madridDayKey\(now\)/);
  assert.match(source,/ONIDLE_DAILY_LIMIT = 8/);
});

test("el día y el cupo se deciden en servidor con zona Madrid",()=>{
  const body=source.slice(source.indexOf("async function operationalOnIdleState"),source.indexOf("__name(operationalOnIdleState"));
  assert.match(body,/missionDayRange\(madridDayKey\(now\)\)/);
  assert.match(body,/created_at>=\? AND created_at<\?/);
  assert.match(body,/windowsToday = usedRows\.length/);
});
