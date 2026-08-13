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
  assert.match(source,/operationalOnIdleState\(env, decisionIdentity, requestedProjectId\)/);
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
  assert.ok(post.indexOf('operationalOnIdleState(env, decisionIdentity, requestedProjectId)') < post.indexOf('!continuation && !userOverride && !onIdle'),
    'OnIdle debe pasar primero por su guard canónico');
});

test('cliente versionado queda retirado como productor y sólo observa el guard',()=>{
  assert.match(script,/ONIDLE_AGENT:-OraculoMini/);
  assert.match(script,/fleet\/onidle-state/);
  assert.doesNotMatch(script,/fleet\/onidle-proposals|\/decisions|afplay|Glass|Ping|-X POST|--watch/);
});

test('el fallo anterior se reproduce como contexto granular ausente',()=>{
  const assignment={id:'yokup',name:'Yokup',web:'www.yokup.com'};
  const oldPayload={agent:'OraculoMacMini',machine:'admira-macmini',project_id:'yokup'};
  assert.deepEqual(resolveDecisionProject(oldPayload,assignment),{
    ok:false,error:'project y project_slug granulares requeridos'
  });
  assert.match(source,/code: "exact_project_required"/);
});

async function runObserver(args=[]) {
  const dir=await mkdtemp(join(tmpdir(),'onidle-project-'));
  const curl=join(dir,'curl');
  const trace=join(dir,'trace');
  await writeFile(curl,`#!/bin/sh
printf '%s\\n' "$*" >> "$TRACE"
printf '{"ok":true,"can_open":false,"reason":"active_mission","quota":{"used":3}}'
`,{mode:0o755});
  const result=spawnSync('bash',[new URL('./tools/onidle-hora.sh',import.meta.url).pathname,...args],{
    encoding:'utf8',env:{...process.env,PATH:`${dir}:${process.env.PATH}`,TRACE:trace}
  });
  let calls=''; try { calls=await readFile(trace,'utf8'); } catch {}
  return {result,calls};
}

test('observador hace un único GET y jamás intenta publicar',async()=>{
  const {result,calls}=await runObserver(['--status']);
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),{
    ok:true,can_open:false,reason:'active_mission',quota:{used:3}
  });
  assert.match(calls,/fleet\/onidle-state/);
  assert.doesNotMatch(calls,/decisions|onidle-proposals|-X POST/);
});

test('cualquier antiguo modo de publicación falla antes de tocar red',async()=>{
  const {result,calls}=await runObserver(['--watch']);
  assert.equal(result.status,64);
  assert.equal(calls,'');
  assert.match(result.stdout,/publisher_local_retirado/);
});

test('started_at se fija una vez y los reportes no reinician el reloj',()=>{
  assert.match(source,/ALTER TABLE tickets ADD COLUMN started_at INTEGER/);
  assert.match(source,/status='in_progress',started_at=COALESCE\(started_at,\?\)/);
  assert.match(source,/ALTER TABLE mission_tasks ADD COLUMN started_at INTEGER/);
  assert.match(source,/COALESCE\(started_at,\?\)/);
  assert.match(source,/m\.created_at, m\.started_at, m\.updated_at/);
  assert.match(source,/visible_state:visible\.state/);
});
