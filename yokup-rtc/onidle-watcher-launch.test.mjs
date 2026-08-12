import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const client=await readFile(new URL("./tools/onidle-hora.sh",import.meta.url),"utf8");
const installer=await readFile(new URL("./tools/install-onidle-hora.sh",import.meta.url),"utf8");

test("no queda supervisor local de decisiones",()=>{
  assert.doesNotMatch(client,/launchctl|nohup|watch|lock|Ping/);
  assert.doesNotMatch(installer,/bootstrap|submit|StartCalendarInterval/);
});

test("modos heredados fallan cerrados antes de publicar",()=>{
  assert.match(client,/publisher_local_retirado/);
  assert.match(client,/exit 64/);
});
