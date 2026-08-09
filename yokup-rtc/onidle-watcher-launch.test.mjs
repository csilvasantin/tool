import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const publisher=new URL('./tools/onidle-hora.sh',import.meta.url).pathname;
const label='com.admira.onidle.watch.dec-persist';
const proposals=[
  JSON.stringify({title:'Mejora uno',target_mission_id:'INC-ONE'}),
  JSON.stringify({title:'Mejora dos',target_mission_id:'DCL-TWO'}),
  JSON.stringify({title:'Mejora tres',target_mission_id:'FLT-THREE'}),
].join('\n');

async function sandbox({launchMode='submit',watchStatus='decided',platform='Darwin'}={}) {
  const dir=await mkdtemp(join(tmpdir(),'onidle-watch-launch-'));
  const launchLog=join(dir,'launchctl.log');
  const soundLog=join(dir,'sounds.log');
  const nohupLog=join(dir,'nohup.log');
  const launchCount=join(dir,'launch-count');
  const curl=join(dir,'curl');
  const launchctl=join(dir,'launchctl');
  const afplay=join(dir,'afplay');
  const nohup=join(dir,'nohup');

  await writeFile(curl,`#!/bin/sh
case "$*" in
  *fleet/onidle-state*) printf '%s\\n' '{"ok":true,"can_open":true,"quota":{"used":1},"reason":"ready"}' ;;
  */projects*) printf '%s\\n' '{"projects":[{"id":"yokup","name":"Yokup","status":"activo","agents":["OraculoMini"],"machines":["admira-macmini"]}]}' ;;
  *fleet/onidle-proposals*) cat <<'JSONL'
${proposals}
JSONL
    printf '200'
    ;;
  *'/decisions/DEC-PERSIST'*) printf '%s\\n' '${JSON.stringify({ok:true,status:watchStatus})}' ;;
  *'-X POST'*'/decisions'*) printf '%s\\n%s' '{"ok":true,"id":"DEC-PERSIST"}' '200' ;;
  *) exit 91 ;;
esac
`,{mode:0o755});

  await writeFile(launchctl,`#!/bin/sh
printf '%s\\n' "$*" >> '${launchLog}'
case '${launchMode}:'"$1" in
  existing:print) exit 0 ;;
  race:print)
    n=$(cat '${launchCount}' 2>/dev/null || printf 0); n=$((n+1)); printf '%s' "$n" > '${launchCount}'
    [ "$n" -ge 2 ] && exit 0 || exit 3
    ;;
  race:submit) exit 3 ;;
  submit:print) exit 3 ;;
  submit:submit) exit 0 ;;
  *:bootout|*:remove) exit 0 ;;
  *) exit 3 ;;
esac
`,{mode:0o755});
  await writeFile(afplay,`#!/bin/sh
basename "$1" .aiff >> '${soundLog}'
`,{mode:0o755});
  await writeFile(nohup,`#!/bin/sh
printf '%s\\n' "$*" >> '${nohupLog}'
sleep 2
`,{mode:0o755});

  const env={...process.env,PATH:`${dir}:${process.env.PATH}`,TMPDIR:dir,
    ONIDLE_LAUNCHCTL:launchctl,ONIDLE_AFPLAY:afplay,ONIDLE_NOHUP:nohup,
    ONIDLE_PLATFORM:platform,ONIDLE_WATCH_INTERVAL:'0.01'};
  const run=(args=[])=>spawnSync('bash',[publisher,...args],{encoding:'utf8',env});
  const contents=async(path)=>readFile(path,'utf8').catch(()=>"");
  return {run,launch:()=>contents(launchLog),sounds:()=>contents(soundLog),nohups:()=>contents(nohupLog)};
}

test('Darwin publica y separa el watcher con launchctl submit y label único por DEC',async()=>{
  const box=await sandbox();
  const run=box.run();
  assert.equal(run.status,0,run.stderr);
  assert.equal(JSON.parse(run.stdout).decision_id,'DEC-PERSIST');
  const calls=await box.launch();
  assert.match(calls,new RegExp(`^print gui/\\d+/${label}$`,'m'));
  assert.match(calls,new RegExp(`submit -l ${label} .* -- /bin/bash .*onidle-hora\\.sh --watch DEC-PERSIST ${label}`));
  assert.equal((calls.match(/ submit |^submit /gm)||[]).length,1);
  assert.equal(await box.nohups(),'');
  assert.equal(await box.sounds(),'Glass\n');
});

test('un job existente para el mismo DEC deduplica sin submit ni fallback',async()=>{
  const box=await sandbox({launchMode:'existing'});
  const run=box.run();
  assert.equal(run.status,0,run.stderr);
  const calls=await box.launch();
  assert.match(calls,new RegExp(`^print gui/\\d+/${label}$`,'m'));
  assert.doesNotMatch(calls,/^submit /m);
  assert.equal(await box.nohups(),'');
});

test('la carrera print→submit se resuelve adoptando el job que ganó',async()=>{
  const box=await sandbox({launchMode:'race'});
  const run=box.run();
  assert.equal(run.status,0,run.stderr);
  const calls=(await box.launch()).trim().split('\n');
  assert.equal(calls.filter((line)=>line.startsWith('print ')).length,2);
  assert.equal(calls.filter((line)=>line.startsWith('submit ')).length,1);
});

test('al llegar a terminal toca Ping y elimina el label exacto antes de salir',async()=>{
  const box=await sandbox({watchStatus:'cancelled'});
  const run=box.run(['--watch','DEC-PERSIST',label]);
  assert.equal(run.status,0,run.stderr);
  assert.deepEqual(JSON.parse(run.stdout),{
    result:'resolved',published:false,reason:'cancelled',decision_id:'DEC-PERSIST'
  });
  assert.equal(await box.sounds(),'Ping\n');
  assert.match(await box.launch(),new RegExp(`^bootout gui/\\d+/${label}$`,'m'));
});

test('fuera de Darwin usa nohup separado y el lock impide duplicar el DEC vivo',async()=>{
  const box=await sandbox({platform:'Linux'});
  const first=box.run();
  const second=box.run();
  assert.equal(first.status,0,first.stderr);
  assert.equal(second.status,0,second.stderr);
  await new Promise((resolve)=>setTimeout(resolve,100));
  const calls=(await box.nohups()).trim().split('\n').filter(Boolean);
  assert.equal(calls.length,1);
  assert.match(calls[0],/\/bin\/bash .*onidle-hora\.sh --watch DEC-PERSIST/);
  assert.equal(await box.launch(),'');
});
