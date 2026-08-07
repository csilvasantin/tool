import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const installer=new URL('./tools/install-onidle-hora.sh',import.meta.url).pathname;
const source=new URL('./tools/onidle-hora.sh',import.meta.url).pathname;

async function installInSandbox() {
  const root=await mkdtemp(join(tmpdir(),'onidle-install-'));
  const vault=join(root,'vault');
  const agents=join(root,'LaunchAgents');
  const morfeoScript=join(vault,'onidle-hora.sh');
  const morfeoPlist=join(agents,'com.admira.onidle.MorfeoMacMini.plist');
  await import('node:fs/promises').then(({mkdir})=>Promise.all([
    mkdir(vault,{recursive:true}),mkdir(agents,{recursive:true})
  ]));
  await writeFile(morfeoScript,'legacy-morfeo\n',{mode:0o755});
  await writeFile(morfeoPlist,'morfeo-plist\n',{mode:0o644});
  const env={...process.env,ADMIRA_VAULT_DIR:vault,ONIDLE_LAUNCH_AGENTS_DIR:agents};
  const run=()=>spawnSync('bash',[installer,'--no-load'],{encoding:'utf8',env});
  return {root,vault,agents,morfeoScript,morfeoPlist,run};
}

test('instala unidad propia con identidad y proyecto granular completos',async()=>{
  const box=await installInSandbox();
  const first=box.run();
  assert.equal(first.status,0,first.stderr);
  const script=join(box.vault,'onidle-hora-OraculoMacMini.sh');
  const plist=join(box.agents,'com.admira.onidle.OraculoMacMini.plist');
  assert.equal(await readFile(script,'utf8'),await readFile(source,'utf8'));
  assert.equal((await stat(script)).mode&0o777,0o755);
  assert.equal((await stat(plist)).mode&0o777,0o644);
  const xml=await readFile(plist,'utf8');
  for (const value of ['com.admira.onidle.OraculoMacMini','OraculoMacMini','yokup','Yokup','YOKUP']) {
    assert.match(xml,new RegExp(value));
  }
  assert.match(xml,/<key>RunAtLoad<\/key><false\/>/);
});

test('es idempotente y no toca la instalación de Morfeo',async()=>{
  const box=await installInSandbox();
  const beforeScript=await readFile(box.morfeoScript,'utf8');
  const beforePlist=await readFile(box.morfeoPlist,'utf8');
  assert.equal(box.run().status,0);
  const target=join(box.vault,'onidle-hora-OraculoMacMini.sh');
  const plist=join(box.agents,'com.admira.onidle.OraculoMacMini.plist');
  const hashes1=[await readFile(target,'utf8'),await readFile(plist,'utf8')];
  assert.equal(box.run().status,0);
  assert.deepEqual([await readFile(target,'utf8'),await readFile(plist,'utf8')],hashes1);
  assert.equal(await readFile(box.morfeoScript,'utf8'),beforeScript);
  assert.equal(await readFile(box.morfeoPlist,'utf8'),beforePlist);
});

test('la fuente A conserva exactamente tres mejoras, back y custom una vez',async()=>{
  const text=await readFile(source,'utf8');
  assert.match(text,/fleet\/onidle-proposals/);
  assert.match(text,/if len\(rows\)!=3/);
  assert.doesNotMatch(text,/ONIDLE_OPTIONS_FILE|onidle-opciones|head -3|head -5/);
  assert.equal(text.match(/ops \+= \["↩ Volver atrás", "✍️ Custom · Escribe la mejora que quieras a mano"\]/g)?.length,1);
  assert.match(text,/"option_targets":targets/);
});
