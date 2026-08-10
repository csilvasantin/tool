import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const release = {
  version:"v.10.08.2026.r8.10:01", deployedAt:"2026-08-10T08:01:59.443Z",
  deployer:"TrinityMBP14", machine:"MacBookPro14", signature:"TrinityMBP14 · MacBookPro14",
  git:"d8a4ce0", gitShort:"d8a4ce0", gitFull:"d8a4ce0ad3ea1232a9701a1b94483bdd1a99d581", dirty:false
};
const deploy = await readFile(new URL("./deploy.sh", import.meta.url), "utf8");

test("el artefacto Worker contiene sólo runtime público y el sello exacto", async () => {
  const target = await mkdtemp(join(tmpdir(), "yokup-worker-assets-test-"));
  try {
    const result = spawnSync(process.execPath, [new URL("./build-assets.mjs", import.meta.url).pathname, target], {
      encoding:"utf8", env:{...process.env, RELEASE_JSON:JSON.stringify(release)}
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(await readFile(join(target, "version.json"), "utf8")), release);
    await assert.rejects(access(join(target, "deploy.mjs")));
    await assert.rejects(access(join(target, "functions", "api", "fleet-census.js")));
    await assert.rejects(access(join(target, "deploy-version.test.mjs")));
    await assert.rejects(access(join(target, "_redirects")));
    assert.match(await readFile(join(target, "dashboard.html"), "utf8"), /yk-frame\.js\?v=v\.10\.08\.2026\.r8\.10%3A01/);
  } finally {
    await rm(target, {recursive:true, force:true});
  }
});

test("deploy genera config efímera con ASSETS y nunca publica el árbol fuente", () => {
  assert.match(deploy, /directory = \$\{JSON\.stringify\(process\.env\.STAGING\)\}/);
  assert.match(deploy, /binding = "ASSETS"/);
  assert.match(deploy, /run_worker_first = true/);
  assert.match(deploy, /html_handling = "none"/);
  assert.match(deploy, /deploy --config "\$CONFIG_FILE"/);
  assert.doesNotMatch(deploy, /deploy --assets "\.\.\/yokup-site"/);
});

test("el guardián recibe el mismo artefacto y sello que Pages, sin carrera contra el dominio", async()=>{
  const source=await mkdtemp(join(tmpdir(),"yokup-pages-same-release-"));
  const target=await mkdtemp(join(tmpdir(),"yokup-gate-same-release-"));
  try{
    await writeFile(join(source,"version.json"),JSON.stringify(release));
    await writeFile(join(source,"dashboard.html"),'<meta name="viewport" content="width=device-width"><script src="/yk-frame.js?v=old"></script><p>artefacto-r11</p>');
    await writeFile(join(source,"yk-frame.js"),"window.release='r11';");
    const result=spawnSync(process.execPath,[new URL("./build-assets.mjs",import.meta.url).pathname,target],{
      encoding:"utf8",env:{...process.env,RELEASE_JSON:JSON.stringify(release),YOKUP_ASSET_SOURCE:source}
    });
    assert.equal(result.status,0,result.stderr);
    assert.match(await readFile(join(target,"dashboard.html"),"utf8"),/artefacto-r11/);
    assert.equal(await readFile(join(target,"yk-frame.js"),"utf8"),"window.release='r11';");
    assert.match(deploy,/YOKUP_RELEASE_JSON/);
    assert.match(deploy,/YOKUP_ASSET_SOURCE/);
    assert.match(deploy,/if \[ -n "\$\{YOKUP_RELEASE_JSON:-\}" \] && \[ -n "\$\{YOKUP_ASSET_SOURCE:-\}" \]; then/);
  }finally{await rm(source,{recursive:true,force:true});await rm(target,{recursive:true,force:true});}
});
