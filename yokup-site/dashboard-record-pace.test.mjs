import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./dashboard.html",import.meta.url),"utf8");

test("el Dashboard carga la lógica compartida de récord y expone la tarjeta viva",()=>{
  assert.match(source,/src="\/highscore-daily-record\.js\?v=/);
  assert.match(source,/id="recordPace"[^>]*aria-live="polite"/);
  assert.match(source,/id="recordPaceCurrent"/);
  assert.match(source,/id="recordPaceTarget"/);
  assert.match(source,/id="recordPaceRequired"/);
  assert.match(source,/id="recordPaceProjection"/);
  assert.match(source,/id="recordPaceSignal"/);
});

test("la meta usa récord previo + 1 y la lectura se refresca sin caché",()=>{
  assert.match(source,/api\.dailyRecord\(RECORD_PACE_HISTORY,api\.zoneDateKey\(Date\.now\(\),"Europe\/Madrid"\)\)/);
  assert.match(source,/api\.recordPace\(chase,Date\.now\(\),"Europe\/Madrid"\)/);
  assert.match(source,/\/highscore\/history\?scope=global/);
  assert.match(source,/cache:"no-store"/);
  assert.match(source,/const RECORD_PACE_REFRESH_MS=30000/);
  assert.match(source,/setInterval\(refreshRecordPace,RECORD_PACE_REFRESH_MS\)/);
});

test("el semáforo comunica por encima, por debajo y nuevo récord",()=>{
  assert.match(source,/pace\.won\?"● nuevo récord":\(pace\.ahead\?"● por encima del ritmo":"● por debajo del ritmo"\)/);
  assert.match(source,/\.record-pace\[data-state="ahead"\]/);
  assert.match(source,/\.record-pace\[data-state="behind"\]/);
  assert.match(source,/\.record-pace\[data-state="won"\]/);
});
