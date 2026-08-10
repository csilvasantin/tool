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
  assert.match(source,/url\.pathname === "\/fleet\/onidle-proposals"/);
  assert.match(source,/canonicalOnIdleProposals\(env, identity/);
  assert.match(source,/project_id=\? OR \(COALESCE\(project_id,''\)='' AND lower\(project\)=lower\(\?\)\)/);
  assert.match(source,/NOT IN \('resolved','cancelled','closed'\)/);
  assert.match(source,/application\/x-ndjson/);
  const post=source.slice(source.indexOf('if (url.pathname === "/decisions" && req.method === "POST")'));
  assert.match(post,/if \(!continuation && !userOverride && !onIdle\)/,
    'el cupo horario residual sólo se aplica a decisiones no-OnIdle');
  assert.ok(post.indexOf('operationalOnIdleState(env, decisionIdentity)') < post.indexOf('!continuation && !userOverride && !onIdle'),
    'OnIdle debe pasar primero por su guard canónico');
});

test('script versionado consulta el guard y publica exactamente 3 + atrás + custom',()=>{
  assert.match(script,/ONIDLE_AGENT:-OraculoMini/);
  assert.match(script,/OraculoMacMini\) AGENT="OraculoMini"/);
  assert.match(script,/fleet\/onidle-state/);
  assert.match(script,/fleet\/onidle-proposals/);
  assert.match(script,/\["↩ Volver atrás", "✍️ Custom · Escribe la mejora que quieras a mano"\]/);
  assert.match(script,/"onidle":True/);
  assert.match(script,/"option_targets":targets/);
  assert.match(script,/\$\(\(used\+1\)\)\/8/);
  assert.match(script,/EXIT_PUBLISHED=0/);
  assert.match(script,/EXIT_BLOCKED=10/);
  assert.match(script,/EXIT_ERROR=20/);
  assert.match(script,/sound Glass/);
  assert.match(script,/decided\|expired\|cancelled/);
  assert.match(script,/sound Ping/);
  assert.doesNotMatch(script,/ONIDLE_OPTIONS_FILE|onidle-opciones|head -3|head -5/);
});

test('el fallo anterior se reproduce como contexto granular ausente',()=>{
  const assignment={id:'yokup',name:'Yokup',web:'www.yokup.com'};
  const oldPayload={agent:'OraculoMacMini',machine:'admira-macmini',project_id:'yokup'};
  assert.deepEqual(resolveDecisionProject(oldPayload,assignment),{
    ok:false,error:'project y project_slug granulares requeridos'
  });
  assert.match(source,/code: "exact_project_required"/);
});

const canonicalLines=[
  JSON.stringify({title:'Mejora uno',target_mission_id:'INC-ONE'}),
  JSON.stringify({title:'Mejora dos',target_mission_id:'DCL-TWO'}),
  JSON.stringify({title:'Mejora tres',target_mission_id:'FLT-THREE'})
].join('\n')+'\n';

async function dryRun(extra={},proposalLines=canonicalLines,censusAgent='OraculoMini') {
  const dir=await mkdtemp(join(tmpdir(),'onidle-project-'));
  const curl=join(dir,'curl');
  await writeFile(curl,`#!/bin/sh
case "$*" in
  *fleet/onidle-state*) echo '{"ok":true,"can_open":true,"quota":{"used":2},"reason":"ready"}' ;;
  */projects*) echo '{"projects":[{"id":"yokup","name":"Yokup","status":"activo","agents":["${censusAgent}"],"machines":["admira-macmini"]}]}' ;;
  *fleet/onidle-proposals*) cat <<'JSONL'
${proposalLines.trimEnd()}
JSONL
    printf '200'
  ;;
  *) exit 91 ;;
esac
`,{mode:0o755});
  return spawnSync('bash',[new URL('./tools/onidle-hora.sh',import.meta.url).pathname],{
    encoding:'utf8',env:{...process.env,PATH:`${dir}:${process.env.PATH}`,ONIDLE_DRY_RUN:'1',...extra}
  });
}

test('dry-run deriva Yokup/YOKUP y conserva 3 + back + custom sin POST real',async()=>{
  const result=await dryRun();
  assert.equal(result.status,10,result.stderr);
  const contract=JSON.parse(result.stdout.trim());
  assert.equal(contract.result,'blocked');
  assert.equal(contract.reason,'dry_run');
  assert.equal(contract.published,false);
  const payload=contract.payload;
  assert.deepEqual([payload.project_id,payload.project,payload.project_slug],['yokup','Yokup','YOKUP']);
  assert.equal(payload.agent,'OraculoMini');
  assert.deepEqual(payload.options,['Mejora uno','Mejora dos','Mejora tres','↩ Volver atrás','✍️ Custom · Escribe la mejora que quieras a mano']);
  assert.deepEqual(payload.option_targets,[{target_mission_id:'INC-ONE'},{target_mission_id:'DCL-TWO'},{target_mission_id:'FLT-THREE'},null,null]);
  assert.equal(payload.onidle,true);
});

test('dry-run acepta OraculoMini contra un censo histórico stale',async()=>{
  const result=await dryRun({ONIDLE_AGENT:'OraculoMini'},canonicalLines,'OraculoMacMini');
  assert.equal(result.status,10,result.stderr);
  const contract=JSON.parse(result.stdout.trim());
  assert.equal(contract.reason,'dry_run');
  assert.equal(contract.payload.agent,'OraculoMini');
});

test('dry-run convierte ONIDLE_AGENT histórico antes de emitir',async()=>{
  const result=await dryRun({ONIDLE_AGENT:'OraculoMacMini'});
  assert.equal(result.status,10,result.stderr);
  const contract=JSON.parse(result.stdout.trim());
  assert.equal(contract.reason,'dry_run');
  assert.equal(contract.payload.agent,'OraculoMini');
});

test('dry-run rechaza cualquier mejora sin misión y evidencia canónica',async()=>{
  const lines=[
    JSON.stringify({title:'Mejora nueva explícita',target_mission_id:null,explicit_new:true}),
    JSON.stringify({title:'Resolver misión real',target_mission_id:'INC-OMPEIL'}),
    JSON.stringify({title:'Resolver otra misión',target_mission_id:'DCL-REAL'})
  ].join('\n')+'\n';
  const result=await dryRun({},lines);
  assert.equal(result.status,20,result.stderr);
  assert.equal(JSON.parse(result.stdout.trim()).reason,'proposals_invalid');
});

test('script ignora cualquier fichero manual stale y usa sólo la respuesta canónica',async()=>{
  const result=await dryRun({ONIDLE_OPTIONS_FILE:'/tmp/no-debe-leerse'});
  assert.equal(result.status,10,result.stderr);
  const payload=JSON.parse(result.stdout.trim()).payload;
  assert.equal(payload.options[0],'Mejora uno');
  assert.doesNotMatch(script,/ONIDLE_OPTIONS_FILE/);
});

test('menos de tres, duplicadas o null ambiguo fallan cerrado antes del POST',async()=>{
  const invalid=[
    canonicalLines.trim().split('\n').slice(0,2).join('\n')+'\n',
    [JSON.stringify({title:'Igual',target_mission_id:'INC-1'}),JSON.stringify({title:'igual',target_mission_id:'INC-2'}),JSON.stringify({title:'Tres',target_mission_id:'INC-3'})].join('\n')+'\n',
    [JSON.stringify({title:'Sin origen',target_mission_id:null}),JSON.stringify({title:'Dos',target_mission_id:'INC-2'}),JSON.stringify({title:'Tres',target_mission_id:'INC-3'})].join('\n')+'\n'
  ];
  for (const lines of invalid) {
    const result=await dryRun({},lines);
    assert.equal(result.status,20);
    assert.match(result.stderr,/propuestas canónicas inválidas o incompletas/);
    assert.deepEqual(JSON.parse(result.stdout),{
      result:'error',published:false,reason:'proposals_invalid'
    });
  }
});

test('override de nombre o slug inconsistente falla cerrado antes del POST',async()=>{
  for (const env of [{ONIDLE_PROJECT:'Otro'},{ONIDLE_PROJECT_SLUG:'OTRO'},{ONIDLE_PROJECT_ID:'no-asignado'}]) {
    const result=await dryRun(env);
    assert.equal(result.status,20);
    assert.match(result.stderr,/contexto granular inválido/);
    assert.deepEqual(JSON.parse(result.stdout),{
      result:'error',published:false,reason:'project_context_invalid'
    });
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
