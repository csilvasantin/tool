import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resolveDecisionProject} from './src/decision-project.js';

const source=await readFile(new URL('./src/index.js',import.meta.url),'utf8');
const script=await readFile(new URL('./tools/onidle-hora.sh',import.meta.url),'utf8');

test('API publica elegibilidad y aplica el mismo guard al alta OnIdle',()=>{
  assert.match(source,/ONIDLE_DAILY_LIMIT = 8/);
  assert.match(source,/url\.pathname === "\/fleet\/onidle-state"/);
  assert.match(source,/operationalOnIdleState\(env, decisionIdentity\)/);
  assert.match(source,/pauseTimedOutOnIdleBatches/);
  assert.match(source,/WHERE id=\? AND status='active'/);
  assert.match(source,/operational_limit_ms:MISSION_UNCONCLUDED_AFTER_MS/);
  const post=source.slice(source.indexOf('if (url.pathname === "/decisions" && req.method === "POST")'));
  assert.match(post,/if \(!continuation && !userOverride && !onIdle\)/,
    'el cupo horario residual sólo se aplica a decisiones no-OnIdle');
  assert.ok(post.indexOf('operationalOnIdleState(env, decisionIdentity)') < post.indexOf('!continuation && !userOverride && !onIdle'),
    'OnIdle debe pasar primero por su guard canónico');
});

test('script versionado consulta el guard y publica exactamente 3 + atrás + custom',()=>{
  assert.match(script,/ONIDLE_AGENT:-OraculoMacMini/);
  assert.match(script,/fleet\/onidle-state/);
  assert.match(script,/head -3/);
  assert.match(script,/\["↩ Volver atrás", "✍️ Custom · Escribe la mejora que quieras a mano"\]/);
  assert.match(script,/"onidle":True/);
  assert.match(script,/"option_targets":targets/);
  assert.match(script,/\$\(\(used\+1\)\)\/8/);
  assert.doesNotMatch(script,/head -5/);
});

test('el fallo anterior se reproduce como contexto granular ausente',()=>{
  const assignment={id:'yokup',name:'Yokup',web:'www.yokup.com'};
  const oldPayload={agent:'OraculoMacMini',machine:'admira-macmini',project_id:'yokup'};
  assert.deepEqual(resolveDecisionProject(oldPayload,assignment),{
    ok:false,error:'project y project_slug granulares requeridos'
  });
  assert.match(source,/code: "exact_project_required"/);
});

async function dryRun(extra={},optionsText='Mejora uno\nMejora dos\nMejora tres\n') {
  const dir=await mkdtemp(join(tmpdir(),'onidle-project-'));
  const curl=join(dir,'curl'), options=join(dir,'options.txt');
  await writeFile(curl,`#!/bin/sh
case "$*" in
  *fleet/onidle-state*) echo '{"ok":true,"can_open":true,"quota":{"used":2},"reason":"ready"}' ;;
  */projects*) echo '{"projects":[{"id":"yokup","name":"Yokup","status":"activo","agents":["OraculoMacMini"],"machines":["admira-macmini"]}]}' ;;
  *) exit 91 ;;
esac
`,{mode:0o755});
  await writeFile(options,optionsText);
  return spawnSync('bash',[new URL('./tools/onidle-hora.sh',import.meta.url).pathname],{
    encoding:'utf8',env:{...process.env,PATH:`${dir}:${process.env.PATH}`,
      ONIDLE_OPTIONS_FILE:options,ONIDLE_DRY_RUN:'1',...extra}
  });
}

test('dry-run deriva Yokup/YOKUP y conserva 3 + back + custom sin POST real',async()=>{
  const result=await dryRun();
  assert.equal(result.status,0,result.stderr);
  const payload=JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.deepEqual([payload.project_id,payload.project,payload.project_slug],['yokup','Yokup','YOKUP']);
  assert.deepEqual(payload.options,['Mejora uno','Mejora dos','Mejora tres','↩ Volver atrás','✍️ Custom · Escribe la mejora que quieras a mano']);
  assert.deepEqual(payload.option_targets,[null,null,null,null,null]);
  assert.equal(payload.onidle,true);
});

test('dry-run conserva target_mission_id como metadato, separado del título',async()=>{
  const lines=[
    JSON.stringify({title:'Resolver la misión real',target_mission_id:'INC-OMPEIL'}),
    'Mejora libre dos','Mejora libre tres'
  ].join('\n')+'\n';
  const result=await dryRun({},lines);
  assert.equal(result.status,0,result.stderr);
  const payload=JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.equal(payload.options[0],'Resolver la misión real');
  assert.deepEqual(payload.option_targets,[{target_mission_id:'INC-OMPEIL'},null,null,null,null]);
});

test('override de nombre o slug inconsistente falla cerrado antes del POST',async()=>{
  for (const env of [{ONIDLE_PROJECT:'Otro'},{ONIDLE_PROJECT_SLUG:'OTRO'},{ONIDLE_PROJECT_ID:'no-asignado'}]) {
    const result=await dryRun(env);
    assert.equal(result.status,0);
    assert.match(result.stdout,/contexto granular inválido/);
    assert.doesNotMatch(result.stdout,/"options"/);
  }
});

test('started_at se fija una vez y los reportes no reinician el reloj',()=>{
  assert.match(source,/ALTER TABLE tickets ADD COLUMN started_at INTEGER/);
  assert.match(source,/status='in_progress',started_at=COALESCE\(started_at,\?\)/);
  assert.match(source,/ALTER TABLE mission_tasks ADD COLUMN started_at INTEGER/);
  assert.match(source,/COALESCE\(started_at,\?\)/);
  assert.match(source,/m\.created_at, m\.started_at, m\.updated_at/);
  assert.match(source,/visible_state:visible\.state/);
});
