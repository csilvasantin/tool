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
  assert.match(frame,/"\/fleet\/pty\/ticket"/);
  assert.match(frame,/new WebSocket\(body\.url\)/);
  assert.match(frame,/window\.Terminal/);
  assert.match(frame,/window\.FitAddon\.FitAddon/);
  assert.match(frame,/disableStdin:true/);
  assert.doesNotMatch(frame,/term\.onData/);
  assert.match(frame,/term\.onResize/);
  assert.match(frame,/ResizeObserver/);
  assert.match(frame,/machine:item\.machine,persona:item\.persona,runtime:item\.runtime,host:item\.host,session_id:item\.session_id/);
  assert.match(frame,/action === "stop" \|\| action === "read" \|\| action === "write" \|\| action === "focus" \|\| action === "unfocus"\)body\.pid=item\.pid/);
  assert.match(frame,/terminalAction\(item\.terminal_visible\?"unfocus":"focus"\)/);
  assert.match(frame,/focusQueued:""/);
  assert.match(frame,/action === "focus" \|\| action === "unfocus"/);
  assert.match(frame,/FLEET\.cliFocus\.disabled=!item\.active/);
  assert.match(frame,/tmux:"\+selected\.session_id/);
  assert.match(frame,/PTY en vivo con xterm\.js/);
  assert.match(frame,/"yk-cli-xterm"/);
  assert.match(frame,/cliInput:null, cliSend:null/);
  assert.match(frame,/"yk-cli-terminal-form"/);
});

test("Experto agrupa los agentes por equipo físico igual que Avanzado",()=>{
  assert.match(frame,/cliOpen:new Set\(\)/);
  assert.match(frame,/groups\[item\.machine\]/);
  assert.match(frame,/FLEET\.cliOpen\.has\(machine\)/);
  assert.match(frame,/"yk-cli-machine"/);
  assert.match(frame,/toggle\.setAttribute\("aria-expanded",String\(open\)\)/);
  assert.match(frame,/toggle\.setAttribute\("aria-controls",rowsId\)/);
  assert.match(frame,/rows\.hidden=!open/);
  assert.match(frame,/real\.length\?\(active\+"\/"\+real\.length\):"sin CLI"/);
  assert.match(css,/\.yk-cli-machine-rows\[hidden\]\{display:none\}/);
});

test("debajo de los equipos hay control global para Claude, Codex y Grok",()=>{
  assert.match(frame,/FLEET\.cliList=el\("div","yk-cli-list"\);side\.appendChild\(FLEET\.cliList\);[\s\S]*FLEET\.cliBulk=el\("section","yk-cli-bulk"\);/);
  assert.match(frame,/\["Claude","Codex","Grok"\]\.forEach/);
  assert.match(frame,/function bulkCliTargets\(runtime, action\)/);
  assert.match(frame,/function bulkCliGroups\(runtime\)/);
  assert.match(frame,/item\.host === "cli"&&!item\.placeholder&&item\.watcher&&item\.runtime===runtime/);
  assert.match(frame,/item\.machine\+"\|"\+persona\+"\|"\+runtime/);
  assert.match(frame,/bulkFleetControl\(runtime,"start"\)/);
  assert.match(frame,/bulkFleetControl\(runtime,"stop"\)/);
  assert.match(frame,/Detener los "\+targets\.length\+" agentes "\+runtime\+" activos en la flota/);
  assert.match(frame,/Promise\.allSettled\(targets\.map/);
  assert.match(frame,/órdenes aceptadas/);
  assert.match(frame,/function verifyBulkControl\(token,runtime,action,pass\)/);
  assert.match(frame,/pass<3/);
  assert.match(frame,/activos tras "\+pass\+" pasada/);
  assert.match(css,/\.yk-cli-bulk\{display:grid/);
});

test("las tres acciones viven compactas en la pestaña y la escritura queda separada bajo el visor",()=>{
  assert.match(frame,/cliExpanded:""/);
  assert.match(frame,/button\.setAttribute\("aria-expanded",String\(expanded\)\)/);
  assert.match(frame,/tab=el\("div","yk-cli-agent-tab"/);
  assert.match(frame,/isOpen=FLEET\.cliExpanded===key;[\s\S]*FLEET\.cliExpanded=isOpen\?"":key/);
  assert.match(frame,/controls\.appendChild\(FLEET\.cliPower\)/);
  assert.match(frame,/controls\.appendChild\(FLEET\.cliRead\)/);
  assert.match(frame,/controls\.appendChild\(FLEET\.cliFocus\)/);
  assert.match(frame,/terminal\.appendChild\(terminalHead\);[\s\S]*terminal\.appendChild\(FLEET\.cliMount\);[\s\S]*terminal\.appendChild\(form\);[\s\S]*section\.appendChild\(terminal\)/);
  assert.match(frame,/FLEET\.selected===targetKey/);
  assert.doesNotMatch(frame,/yk-cli-agent-form/);
  assert.match(frame,/Mensaje para "\+selected\.persona\+" en "\+selected\.machine/);
  assert.match(frame,/if\(action === "write"\)body\.text=sentText/);
  assert.match(frame,/terminalAction\("write",text\)/);
  assert.match(frame,/event\.metaKey\|\|event\.ctrlKey/);
  assert.match(frame,/event\.stopPropagation\(\);submitCliEditor\(\)/);
  assert.match(frame,/event\.code==="NumpadEnter"/);
  assert.doesNotMatch(frame,/form\.requestSubmit\(\)/);
  assert.match(css,/\.yk-cli-terminal-form\{display:grid/);
  assert.match(css,/\.yk-cli-console\{display:grid;grid-template-columns:minmax\(250px,28%\) minmax\(0,1fr\);gap:12px;height:100%;min-height:140px;flex:0 0 100%/);
  assert.match(css,/\.yk-cli-agent-tab\{display:flex/);
});

test("los equipos censados sin ranura CLI siguen visibles sin habilitar mandos falsos",()=>{
  assert.match(frame,/persona:"Equipo",runtime:"sin CLI"/);
  assert.match(frame,/placeholder:true/);
  assert.match(frame,/item\.placeholder\?"sin CLI anunciado"/);
  assert.match(frame,/if\(expanded&&!item\.placeholder\)/);
  assert.match(frame,/function cliCountLabel\(items\)/);
  assert.match(frame,/equipos sin CLI/);
});

test("los refrescos conservan el mismo xterm y nunca roban el foco",()=>{
  assert.match(frame,/function fleetStructureKey\(items\)/);
  assert.match(frame,/structure!==FLEET\.structureKey/);
  assert.match(frame,/if\(FLEET\.pty\.term\|\|!FLEET\.cliMount\)return/);
  assert.match(frame,/El PTY\/xterm no se reconstruye/);
  assert.match(frame,/FLEET\.busy=false;refreshFleetControls\(\)/);
  assert.doesNotMatch(frame,/FLEET\.busy=false;renderFleet\(\)/);
  assert.doesNotMatch(frame,/setInterval\(function\(\)\{if\(isOpen\("bottom"\)/);
  assert.match(frame,/if\(FLEET\.pty\.socket!==socket\)return/);
  assert.match(frame,/if\(FLEET\.pty\.term&&!sameSession\)/);
});

test("los controles CLI tienen iconos semánticos y dos toggles con estado",()=>{
  assert.match(frame,/function fleetIcon\(name\)/);
  assert.match(frame,/setFleetIcon\(FLEET\.cliPower,item\.active\?"power":"play"\)/);
  assert.match(frame,/setFleetIcon\(FLEET\.cliRead,"reconnect"\)/);
  assert.match(frame,/setFleetIcon\(FLEET\.cliFocus,item\.terminal_visible\?"displayOff":"display"\)/);
  assert.match(frame,/FLEET\.cliPower\.setAttribute\("role","switch"\)/);
  assert.match(frame,/FLEET\.cliFocus\.setAttribute\("role","switch"\)/);
  assert.match(frame,/FLEET\.cliFocus\.setAttribute\("aria-checked",String\(item\.terminal_visible\)\)/);
  assert.match(css,/\.yk-cli-power,.yk-cli-focus\)\[aria-checked="true"\]/);
  assert.match(css,/\.yk-cli-agent small\{flex:0 1 72px/);
  assert.match(css,/width:28px;min-width:28px/);
});

test("el espejo usa assets xterm fijados y un canvas terminal enfocado",()=>{
  assert.match(frame,/\/vendor\/xterm-6\.0\.0\.js/);
  assert.match(frame,/\/vendor\/xterm-addon-fit-0\.11\.0\.js/);
  assert.match(frame,/\/vendor\/xterm-6\.0\.0\.css/);
  assert.match(css,/\.yk-cli-xterm\{flex:1/);
  assert.match(css,/\.yk-cli-xterm:focus-within/);
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
