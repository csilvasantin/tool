import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const publisher = new URL("./tools/onidle-hora.sh", import.meta.url).pathname;
const source = await readFile(publisher, "utf8");
const installer = await readFile(new URL("./tools/install-onidle-hora.sh", import.meta.url), "utf8");
const persistentContract = source.includes("ONIDLE_LAUNCHCTL");

function functionBody(name) {
  const start = source.indexOf(`${name}()`);
  assert.ok(start >= 0, `falta ${name}()`);
  const end = source.indexOf("\n}\n", start) + 3;
  assert.ok(end > start, `no se pudo acotar ${name}()`);
  return source.slice(start, end);
}

test("en Darwin la publicación entrega el seguimiento a launchd, no al nohup efímero", () => {
  assert.match(source, /ONIDLE_LAUNCHCTL/);
  assert.match(source, /ONIDLE_NOHUP/,
    "nohup sólo puede quedar como fallback explícito fuera de Darwin");
  assert.match(source + installer, /Darwin[\s\S]{0,2000}launchctl|launchctl[\s\S]{0,2000}Darwin/i,
    "el seguimiento en macOS debe sobrevivir al publicador mediante launchd");
  assert.match(source, /launchctl[^\n]*(?:submit|bootstrap)|(?:submit|bootstrap)[^\n]*launchctl|["']?\$LAUNCHCTL["']?\s+(?:submit|bootstrap)/i);
  assert.match(source, /--watch/, "el proceso persistente debe ejecutar el modo watcher canónico");
});

test("el supervisor usa una identidad estable por decision_id y evita dos watchers de la misma DEC", () => {
  assert.match(source, /com\.admira\.onidle\.(?:watch|watcher)/,
    "cada watcher necesita un label launchd propio y auditable");
  assert.match(source, /decision_id|watch_label|watcher_label/,
    "el label estable debe derivarse del DEC-id, no de un pid ni de Math.random");
  assert.match(source, /launchctl[^\n]*(?:print|list)|(?:print|list)[^\n]*launchctl|["']?\$LAUNCHCTL["']?\s+(?:print|list)/i,
    "antes de arrancar hay que comprobar la instancia única");
  assert.match(source, /submit[\s\S]{0,1000}(?:print|watcher[^\n]*(?:already|exist|dedup))/i,
    "si dos submit compiten, el segundo debe converger con la unidad ya existente");
});

test("Ping sólo pertenece a decided, cancelled o expired", () => {
  const watch = functionBody("watch_decision");
  assert.match(watch, /decided\|expired\|cancelled|decided\|cancelled\|expired/);
  assert.equal((watch.match(/sound Ping/g) || []).length, 1);
  const pingCase = watch.slice(Math.max(0, watch.lastIndexOf("case")));
  assert.doesNotMatch(pingCase, /pending[^\n]*\)[\s\S]{0,160}sound Ping/);
  assert.doesNotMatch(pingCase, /(?:open|resolved|error|invalid)[^\n]*\)[\s\S]{0,160}sound Ping/);
});

test("el watcher elimina su unidad y artefactos al terminar cualquier estado terminal", () => {
  const watch = functionBody("watch_decision");
  assert.match(source, /watch_cleanup|cleanup_watch|bootout/,
    "el watcher terminal debe retirar su unidad persistente");
  assert.match(source, /trap[^\n]*(?:EXIT|TERM|INT)|bootout[\s\S]{0,500}(?:rm|unlink|result)/,
    "la limpieza debe cubrir salida normal o retirar explícitamente la unidad antes de terminar");
  assert.match(watch, /decided\|expired\|cancelled|decided\|cancelled\|expired/);
});

async function runtimeSandbox(status="decided") {
  const dir=await mkdtemp(join(tmpdir(),"onidle-watch-qa-"));
  const launchLog=join(dir,"launch.log"),soundLog=join(dir,"sound.log"),marker=join(dir,"loaded");
  const launchctl=join(dir,"launchctl"),curl=join(dir,"curl"),afplay=join(dir,"afplay"),nohup=join(dir,"nohup");
  await writeFile(launchctl,`#!/bin/sh
printf '%s\n' "$*" >> "$ONIDLE_LAUNCH_LOG"
case "$1" in
  print) [ -f "$ONIDLE_LAUNCH_MARKER" ] ;;
  submit) : > "$ONIDLE_LAUNCH_MARKER" ;;
  bootout) rm -f "$ONIDLE_LAUNCH_MARKER" ;;
esac
`,{mode:0o755});
  await writeFile(curl,`#!/bin/sh
case "$*" in
  *fleet/onidle-state*) printf '%s\n' '{"ok":true,"can_open":true,"quota":{"used":0},"reason":"ready"}' ;;
  */projects*) printf '%s\n' '{"projects":[{"id":"yokup","name":"Yokup","status":"activo","agents":["OraculoMini"],"machines":["admira-macmini"]}]}' ;;
  *fleet/onidle-proposals*) printf '%s\n' '{"title":"Uno","target_mission_id":"INC-1"}' '{"title":"Dos","target_mission_id":"INC-2"}' '{"title":"Tres","target_mission_id":"INC-3"}'; printf '200' ;;
  *'/decisions/DEC-ONCE'*) printf '%s\n' '{"ok":true,"status":"${status}"}' ;;
  *'-X POST'*'/decisions'*) printf '%s\n%s' '{"ok":true,"id":"DEC-ONCE"}' '200' ;;
  *) exit 91 ;;
esac
`,{mode:0o755});
  await writeFile(afplay,`#!/bin/sh
basename "$1" .aiff >> "$ONIDLE_SOUND_LOG"
`,{mode:0o755});
  await writeFile(nohup,`#!/bin/sh
echo forbidden-nohup >> "$ONIDLE_LAUNCH_LOG"
exit 99
`,{mode:0o755});
  const env={...process.env,PATH:`${dir}:${process.env.PATH}`,ONIDLE_LAUNCHCTL:launchctl,
    ONIDLE_NOHUP:nohup,ONIDLE_LAUNCH_LOG:launchLog,ONIDLE_LAUNCH_MARKER:marker,
    ONIDLE_AFPLAY:afplay,ONIDLE_SOUND_LOG:soundLog,ONIDLE_WATCH_INTERVAL:"0.01"};
  const run=(args=[])=>spawnSync("bash",[publisher,...args],{encoding:"utf8",env});
  return {run,launchLog,soundLog,marker};
}

test("dos publicaciones de la misma DEC registran una sola unidad persistente",{skip:!persistentContract},async()=>{
  const box=await runtimeSandbox();
  const first=box.run(),second=box.run();
  assert.equal(first.status,0,first.stderr);
  assert.equal(second.status,0,second.stderr);
  const log=await readFile(box.launchLog,"utf8");
  assert.equal((log.match(/^submit\b/gm)||[]).length,1,log);
  assert.doesNotMatch(log,/forbidden-nohup/);
  assert.match(log,/com\.admira\.onidle\.watch\.dec-once/);
});

for (const terminal of ["decided","cancelled","expired"]) {
  test(`watcher ${terminal}: Ping una vez, bootout y ninguna unidad programada`,{skip:!persistentContract},async()=>{
    const box=await runtimeSandbox(terminal);
    await writeFile(box.marker,"loaded");
    const label="com.admira.onidle.watch.dec-once";
    const run=box.run(["--watch","DEC-ONCE",label]);
    assert.equal(run.status,0,run.stderr);
    assert.equal(await readFile(box.soundLog,"utf8"),"Ping\n");
    const log=await readFile(box.launchLog,"utf8");
    assert.equal((log.match(/^bootout\b/gm)||[]).length,1,log);
    const probe=spawnSync("/bin/sh",["-c",`test -e '${box.marker}'`]);
    assert.notEqual(probe.status,0,"el job/marker debe desaparecer para no relanzar ni repetir Ping");
  });
}
