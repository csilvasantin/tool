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
  assert.match(frame,/desktopAppName\(item\.runtime\)/);
  assert.match(frame,/setAttribute\("role","switch"\)/);
  assert.match(frame,/setAttribute\("aria-checked",String\(item\.active\)\)/);
  assert.match(frame,/item\.active\?"Abierta":"Cerrada"/);
  assert.match(css,/\.yk-app-switch\[aria-checked="true"\]/);
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
  assert.match(frame,/action === "stop" \|\| action === "read" \|\| action === "write" \|\| action === "focus"\)body\.pid=item\.pid/);
  assert.match(frame,/terminalAction\("focus"\)/);
  assert.match(frame,/focusQueued:false/);
  assert.match(frame,/if\(FLEET\.busy\)\{[\s\S]*action === "focus"[\s\S]*FLEET\.focusQueued=true/);
  assert.match(frame,/FLEET\.cliFocus\.disabled=!item\.active/);
  assert.match(frame,/tmux:"\+selected\.session_id/);
  assert.match(frame,/selected\.attached\?"Terminal conectada":"sin Terminal conectada"/);
  assert.match(frame,/cliTerminalInput:null/);
  assert.match(frame,/"yk-cli-terminal-form"/);
  assert.match(frame,/"Terminal remota de "\+selected\.persona/);
  assert.match(frame,/event\.key==="Enter"&&!event\.shiftKey&&!event\.isComposing/);
  assert.match(frame,/terminalForm\.requestSubmit\(\)/);
  assert.match(frame,/syncCliDraft\(fleetKey\(item\),FLEET\.cliTerminalInput\.value,FLEET\.cliTerminalInput\)/);
});

test("las acciones del CLI se despliegan bajo el agente y la derecha queda para su terminal",()=>{
  assert.match(frame,/cliExpanded:""/);
  assert.match(frame,/button\.setAttribute\("aria-expanded",String\(expanded\)\)/);
  assert.match(frame,/actions=el\("div","yk-cli-agent-actions"\);actions\.hidden=!expanded/);
  assert.match(frame,/isOpen=FLEET\.cliExpanded===key;[\s\S]*FLEET\.cliExpanded=isOpen\?"":key/);
  assert.match(frame,/Pulsa Leer para sincronizar esta sesión/);
  assert.match(frame,/controls\.appendChild\(FLEET\.cliPower\)/);
  assert.match(frame,/form=el\("form","yk-cli-agent-form"\)/);
  assert.match(frame,/terminal\.appendChild\(terminalHead\);[\s\S]*terminal\.appendChild\(FLEET\.cliOutput\);[\s\S]*terminal\.appendChild\(terminalForm\);[\s\S]*section\.appendChild\(terminal\)/);
  assert.match(frame,/FLEET\.selected===targetKey/);
  assert.doesNotMatch(frame,/terminalHead\.appendChild\(FLEET\.cliPower\)/);
  assert.doesNotMatch(frame,/terminal\.appendChild\(form\)/);
  assert.doesNotMatch(frame,/renderCli\(\);if\(item\.active/);
  assert.match(css,/\.yk-cli-console\{display:grid;grid-template-columns:minmax\(250px,28%\) minmax\(0,1fr\);gap:12px;height:100%;min-height:140px;flex:0 0 100%/);
  assert.match(css,/\.yk-cli-agent-actions\[hidden\]\{display:none\}/);
});

test("los refrescos conservan el foco y el mismo borrador en ambos editores",()=>{
  assert.match(frame,/function fleetStructureKey\(items\)/);
  assert.match(frame,/structure!==FLEET\.structureKey/);
  assert.match(frame,/function activeCliEditor\(\)/);
  assert.match(frame,/input\.focus\(\{preventScroll:true\}\)/);
  assert.match(frame,/input\.setSelectionRange\(state\.start,state\.end\)/);
  assert.match(frame,/function syncCliDraft\(key,value,source\)/);
  assert.match(frame,/String\(FLEET\.cliDrafts\[targetKey\] \|\| ""\)/);
  assert.match(frame,/FLEET\.busy=false;refreshFleetControls\(\)/);
  assert.doesNotMatch(frame,/FLEET\.busy=false;renderFleet\(\)/);
  assert.match(frame,/!FLEET\.busy && !activeCliEditor\(\)/);
});

test("la vista textual conserva la cuadrícula de tmux sin reenvolverla",()=>{
  assert.match(frame,/vista textual/);
  assert.match(css,/\.yk-cli-output\{[^}]*white-space:pre;word-break:normal;overflow-wrap:normal;tab-size:8/);
  assert.doesNotMatch(css,/\.yk-cli-output\{[^}]*white-space:pre-wrap/);
});

test("el panel Experto usa todo el viewport sin reservar una franja lateral",()=>{
  assert.match(css,/\.yk-rail-bottom\{[\s\S]*?left:0; right:0; bottom:0/);
  assert.match(css,/\.yk-rail-bottom\{[\s\S]*?padding:14px 16px 16px/);
  assert.doesNotMatch(css,/\.yk-rail-bottom\{[\s\S]*?padding:[^;}]*--yk-avatar-safe/);
  assert.match(css,/\.yk-cli-console\{display:grid/);
});

test("Experto se redimensiona hacia arriba y los tres raíles nacen compactados",()=>{
  assert.match(frame,/OPEN_PANELS = \{ left:false, right:false, bottom:false \}/);
  assert.match(frame,/setOpen\(panel, false\)/);
  assert.doesNotMatch(frame,/localStorage\.setItem\(LS \+ panel/);
  assert.match(frame,/yk-expert-resizer/);
  assert.match(frame,/window\.innerHeight-event\.clientY/);
  assert.match(frame,/event\.key==="ArrowUp"/);
  assert.match(frame,/event\.key==="End"/);
  assert.match(css,/\.yk-expert-resizer\{[^}]*cursor:ns-resize/);
  assert.match(css,/\.yk-rail-bottom\{[\s\S]*?display:flex;flex-direction:column;overflow:hidden/);
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
