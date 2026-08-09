import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const publisher=new URL('./tools/onidle-hora.sh',import.meta.url).pathname;
const proposals=[
  JSON.stringify({title:'Mejora uno',target_mission_id:'INC-ONE'}),
  JSON.stringify({title:'Mejora dos',target_mission_id:'DCL-TWO'}),
  JSON.stringify({title:'Mejora tres',target_mission_id:'FLT-THREE'}),
].join('\n');

async function sandbox({
  state={ok:true,can_open:true,quota:{used:2},reason:'ready'},
  post={body:{ok:true,id:'DEC-CONFIRMED'},http:200},
  watch=['pending','decided'],
}={}) {
  const dir=await mkdtemp(join(tmpdir(),'onidle-notify-'));
  const sounds=join(dir,'sounds.log');
  const counter=join(dir,'watch-counter');
  const curl=join(dir,'curl');
  const afplay=join(dir,'afplay');
  await writeFile(afplay,`#!/bin/sh
basename "$1" .aiff >> "$ONIDLE_SOUND_LOG"
`,{mode:0o755});
  await writeFile(curl,`#!/bin/sh
args="$*"
case "$args" in
  *fleet/onidle-state*) printf '%s\\n' '${JSON.stringify(state)}' ;;
  */projects*) printf '%s\\n' '{"projects":[{"id":"yokup","name":"Yokup","status":"activo","agents":["OraculoMini"],"machines":["admira-macmini"]}]}' ;;
  *fleet/onidle-proposals*) cat <<'JSONL'
${proposals}
JSONL
    printf '200'
  ;;
  *'/decisions/DEC-WATCH'*)
    n=$(cat '${counter}' 2>/dev/null || printf 0)
    n=$((n+1)); printf '%s' "$n" > '${counter}'
    case "$n" in
${watch.map((status,index)=>`      ${index+1}) printf '%s\\n' '${status === 'invalid' ? 'not-json' : JSON.stringify({ok:true,status})}' ;;`).join('\n')}
      *) printf '%s\\n' '${JSON.stringify({ok:true,status:watch.at(-1)})}' ;;
    esac
    ;;
  *'-X POST'*'/decisions'*)
    printf '%s\\n%s' '${JSON.stringify(post.body)}' '${post.http}'
    ;;
  *) exit 91 ;;
esac
`,{mode:0o755});
  const env={...process.env,PATH:`${dir}:${process.env.PATH}`,
    ONIDLE_AFPLAY:afplay,ONIDLE_SOUND_LOG:sounds,ONIDLE_NO_WATCH:'1',
    ONIDLE_WATCH_INTERVAL:'0.01'};
  const run=(args=[])=>spawnSync('bash',[publisher,...args],{encoding:'utf8',env});
  const heard=async()=>readFile(sounds,'utf8').catch(()=>"");
  return {run,heard};
}

test('guard bloqueado devuelve 10 y jamás reproduce Glass',async()=>{
  const box=await sandbox({state:{ok:true,can_open:false,quota:{used:8},reason:'daily_quota'}});
  const run=box.run();
  assert.equal(run.status,10,run.stderr);
  assert.deepEqual(JSON.parse(run.stdout),{
    result:'blocked',published:false,reason:'daily_quota'
  });
  assert.equal(await box.heard(),'');
});

test('carrera con decisión viva devuelve blocked y no produce falso positivo',async()=>{
  const box=await sandbox({post:{body:{ok:false,error:'live_decision',existing:'DEC-OLD'},http:409}});
  const run=box.run();
  assert.equal(run.status,10,run.stderr);
  assert.deepEqual(JSON.parse(run.stdout),{
    result:'blocked',published:false,reason:'live_decision'
  });
  assert.equal(await box.heard(),'');
});

test('respuesta 2xx sin id verificable es error 20 y queda en silencio',async()=>{
  const box=await sandbox({post:{body:{ok:true},http:200}});
  const run=box.run();
  assert.equal(run.status,20,run.stderr);
  assert.deepEqual(JSON.parse(run.stdout),{
    result:'error',published:false,reason:'publish_rejected'
  });
  assert.equal(await box.heard(),'');
});

test('sólo ok:true + DEC-id devuelve published 0 y reproduce Glass una vez',async()=>{
  const box=await sandbox();
  const run=box.run();
  assert.equal(run.status,0,run.stderr);
  assert.deepEqual(JSON.parse(run.stdout),{
    result:'published',published:true,decision_id:'DEC-CONFIRMED',window:'3/8'
  });
  assert.equal(await box.heard(),'Glass\n');
});

test('el watcher ignora estados inválidos/pending y toca Ping sólo al expirar',async()=>{
  const box=await sandbox({watch:['invalid','pending','expired']});
  const run=box.run(['--watch','DEC-WATCH']);
  assert.equal(run.status,0,run.stderr);
  assert.deepEqual(JSON.parse(run.stdout),{
    result:'resolved',published:false,reason:'expired',decision_id:'DEC-WATCH'
  });
  assert.equal(await box.heard(),'Ping\n');
});
