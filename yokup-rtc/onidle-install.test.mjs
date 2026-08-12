import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const installer=await readFile(new URL("./tools/install-onidle-hora.sh",import.meta.url),"utf8");
const client=await readFile(new URL("./tools/onidle-hora.sh",import.meta.url),"utf8");

test("el instalador retira sólo la unidad OnIDLE propia y no instala otra",()=>{
  assert.match(installer,/com\.admira\.onidle\.\$AGENT/);
  assert.match(installer,/launchctl bootout/);
  assert.match(installer,/retired-server-scheduled/);
  assert.doesNotMatch(installer,/bootstrap|StartCalendarInterval|RunAtLoad/);
});

test("la fuente local queda sólo como observador sin opciones ni publicación",()=>{
  assert.match(client,/fleet\/onidle-state/);
  assert.doesNotMatch(client,/onidle-proposals|\/decisions|Volver atrás|Custom|-X POST|afplay/);
});
