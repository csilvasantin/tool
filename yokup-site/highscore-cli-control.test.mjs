import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const highscore=await readFile(new URL("./highscore.html",import.meta.url),"utf8");
const frame=await readFile(new URL("./yk-frame.js",import.meta.url),"utf8");
const css=await readFile(new URL("./yk-frame.css",import.meta.url),"utf8");

test("Highscore no mezcla de nuevo CLI y DesktopAPP",()=>{
  assert.doesNotMatch(highscore,/id="cliControl"/);
  assert.doesNotMatch(highscore,/data-yk-slot="right" id="cliControl"/);
});

test("Avanzado contiene sólo el control global de DesktopAPP",()=>{
  assert.match(frame,/buildDesktopControl\(\)/);
  assert.match(frame,/"DesktopAPP"/);
  assert.match(frame,/Codex\/OpenAI · Claude Code · OpenCode/);
  assert.match(frame,/item\.host === "app"/);
});

test("Experto contiene CLIs y la sesión remota real",()=>{
  assert.match(frame,/buildCliConsole\(\)/);
  assert.match(frame,/item\.host === "cli"/);
  assert.match(frame,/"\/fleet\/cli\/terminal"/);
  assert.match(frame,/action === "write"/);
  assert.match(frame,/FLEET\.cliOutput\.textContent=result\.output/);
  assert.match(frame,/machine:item\.machine,persona:item\.persona,runtime:item\.runtime,host:item\.host,session_id:item\.session_id/);
  assert.match(frame,/body\.pid=item\.pid/);
});

test("el panel Experto ocupa el viewport completo sin tapar el avatar",()=>{
  assert.match(css,/\.yk-rail-bottom\{[\s\S]*?left:0; right:0; bottom:0/);
  assert.match(css,/padding:14px calc\(var\(--yk-avatar-safe\) \+ 16px\) 16px 16px/);
  assert.match(css,/\.yk-cli-console\{display:grid/);
});

test("sin una sección local no reaparece el falso mensaje vacío",()=>{
  assert.match(frame,/name !== "right" && !slot\.children\.length/);
});
