import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pkg=JSON.parse(await readFile(new URL("./package.json",import.meta.url),"utf8"));
const lock=JSON.parse(await readFile(new URL("./package-lock.json",import.meta.url),"utf8"));
const deploy=await readFile(new URL("./deploy.mjs",import.meta.url),"utf8");

test("xterm y FitAddon están fijados sin rangos flotantes",()=>{
  assert.equal(pkg.dependencies["@xterm/xterm"],"6.0.0");
  assert.equal(pkg.dependencies["@xterm/addon-fit"],"0.11.0");
  assert.equal(lock.packages["node_modules/@xterm/xterm"].version,"6.0.0");
  assert.equal(lock.packages["node_modules/@xterm/addon-fit"].version,"0.11.0");
});

test("el artefacto público copia sólo los tres runtime assets versionados",()=>{
  for(const asset of ["vendor/xterm-6.0.0.js","vendor/xterm-6.0.0.css","vendor/xterm-addon-fit-0.11.0.js"]){
    assert.match(deploy,new RegExp(asset.replace(/[.]/g,"\\.")));
  }
  assert.doesNotMatch(deploy,/copyFile\([^\n]+sourceRoot, "node_modules"/);
});
