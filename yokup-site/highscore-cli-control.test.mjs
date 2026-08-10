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
  assert.match(frame,/FLEET\.appsExpanded/);
  assert.match(frame,/FLEET\.appOpen\.has\(machine\)/);
  assert.match(frame,/groups\[item\.machine\]/);
  assert.match(css,/\.yk-app-body\[hidden\],\.yk-app-rows\[hidden\]\{display:none\}/);
});

test("todo el JavaScript inline de Highscore compila antes de publicar",()=>{
  const scripts=[...highscore.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match=>match[1]);
  assert.ok(scripts.length>0,"Highscore debe conservar al menos un script inline");
  scripts.forEach((script,index)=>assert.doesNotThrow(()=>new Function(script),`script inline ${index+1}`));
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

test("las acciones del CLI se despliegan bajo el agente y la derecha queda para su terminal",()=>{
  assert.match(frame,/cliExpanded:""/);
  assert.match(frame,/button\.setAttribute\("aria-expanded",String\(expanded\)\)/);
  assert.match(frame,/actions=el\("div","yk-cli-agent-actions"\);actions\.hidden=!expanded/);
  assert.match(frame,/controls\.appendChild\(FLEET\.cliPower\)/);
  assert.match(frame,/form=el\("form","yk-cli-agent-form"\)/);
  assert.match(frame,/terminal\.appendChild\(terminalHead\);[\s\S]*terminal\.appendChild\(FLEET\.cliOutput\);[\s\S]*section\.appendChild\(terminal\)/);
  assert.match(frame,/FLEET\.selected===targetKey/);
  assert.doesNotMatch(frame,/terminalHead\.appendChild\(FLEET\.cliPower\)/);
  assert.doesNotMatch(frame,/terminal\.appendChild\(form\)/);
  assert.match(css,/\.yk-cli-console\{display:grid;grid-template-columns:minmax\(250px,28%\) minmax\(0,1fr\)/);
  assert.match(css,/\.yk-cli-agent-actions\[hidden\]\{display:none\}/);
});

test("el panel Experto usa todo el viewport sin reservar una franja lateral",()=>{
  assert.match(css,/\.yk-rail-bottom\{[\s\S]*?left:0; right:0; bottom:0/);
  assert.match(css,/\.yk-rail-bottom\{[\s\S]*?padding:14px 16px 16px/);
  assert.doesNotMatch(css,/\.yk-rail-bottom\{[\s\S]*?padding:[^;}]*--yk-avatar-safe/);
  assert.match(css,/\.yk-cli-console\{display:grid/);
});

test("el sello del perímetro está arriba a la derecha de Experto",()=>{
  assert.match(frame,/expertHead = el\("div", "yk-hd yk-expert-hd"\)/);
  assert.match(frame,/expertHead\.appendChild\(expertVer\)/);
  assert.match(expertHeader(frame),/EXPERTO[\s\S]*yokup · perímetro de seguridad/);
  assert.match(css,/\.yk-expert-ver\{margin-left:auto;text-align:right;white-space:nowrap/);
  assert.doesNotMatch(frame,/expertHost\.appendChild\(ver\)/);
});

function expertHeader(source){
  const start=source.indexOf('var expertHead =');
  const end=source.indexOf('expert.appendChild(expertHead)',start);
  return source.slice(start,end);
}

test("sin una sección local no reaparece el falso mensaje vacío",()=>{
  assert.match(frame,/name !== "right" && !slot\.children\.length/);
});
