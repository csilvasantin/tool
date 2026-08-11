import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const frame=await readFile(new URL("./yk-frame.js",import.meta.url),"utf8");
const css=await readFile(new URL("./yk-frame.css",import.meta.url),"utf8");

test("Experto separa los tres controles y los crea plegados",()=>{
  assert.match(frame,/function buildExpertFold\(title, count\)/);
  assert.match(frame,/head\.setAttribute\("aria-expanded","false"\)/);
  assert.match(frame,/body\.hidden=true/);
  assert.match(frame,/buildExpertFold\("Control de CLIs",FLEET\.cliCount\)/);
  assert.match(frame,/buildExpertFold\("Control global por agente"\)/);
  assert.match(frame,/buildExpertFold\("Control de Desktop Apps",FLEET\.expertAppCount\)/);
  assert.match(css,/\.yk-expert-fold-body\[hidden\]\{display:none\}/);
});

test("Desktop Apps conserva el censo apagado y sólo selecciona por clic explícito",()=>{
  assert.match(frame,/function renderExpertApps\(\)/);
  assert.match(frame,/item\.host === "app"/);
  assert.doesNotMatch(frame,/FLEET\.selectedApp=fleetKey\(apps\.find/);
  assert.match(frame,/disconnectSelectedPty\(true\);FLEET\.selectedApp=key/);
  assert.match(frame,/FLEET\.expertAppOpen\.has\(machine\)/);
  assert.match(frame,/item\.active\?\("PID "\+item\.pid\):"apagada · enciéndela para enviar"/);
  assert.match(frame,/power\.setAttribute\("role","switch"\)/);
  assert.match(frame,/fleetControl\(item,item\.active\?"stop":"start"\)/);
});

test("el compositor ofrece misión, tarea y objetivo sin fingir una PTY",()=>{
  assert.match(frame,/\[\["mission","Misión"\],\["task","Tarea"\],\["objective","Objetivo"\]\]/);
  assert.match(frame,/ykFetch\("\/fleet\/desktop\/write"/);
  assert.match(frame,/function desktopCommandTarget\(item\)/);
  assert.match(frame,/machine:item\.machine,persona:item\.persona,runtime:item\.runtime,host:"app",session_id:item\.session_id,pid:item\.pid/);
  assert.match(frame,/text:"\["\+label\.toUpperCase\(\)\+" · DESKTOPAPP\]\\n"\+text/);
  assert.match(frame,/ready=!!\(item&&item\.active\)/);
  assert.match(frame,/FLEET\.appDispatchInput\.disabled=!ready\|\|FLEET\.dispatchBusy/);
  assert.match(frame,/FLEET\.appDispatchSend\.disabled=!ready\|\|!hasText\|\|FLEET\.dispatchBusy/);
  assert.match(frame,/aria-live","polite/);
  assert.match(frame,/event\.metaKey\|\|event\.ctrlKey/);
  assert.doesNotMatch(frame,/\/fleet\/cli"[^\n]*DesktopAPP/);
});

test("el panel conserva feedback visible de envío y de encendido",()=>{
  assert.match(frame,/\/\/ enviando "\+label\.toLowerCase\(\)\+" a "/);
  assert.match(frame,/\/\/ "\+label\.toLowerCase\(\)\+" entregada a "/);
  assert.match(frame,/FLEET\.expertAppStatus/);
  assert.match(frame,/\[FLEET\.appStatus,FLEET\.cliStatus,FLEET\.cliBulkStatus,FLEET\.expertAppStatus\]/);
  assert.match(css,/\.yk-app-dispatch-status\.error\{color:#ff7f87\}/);
});

test("la vista Desktop captura ahora y después serializa cada 10 s con lifecycle seguro",()=>{
  assert.match(frame,/function startDesktopCapture\(item,label\)/);
  assert.match(frame,/requestDesktopCapture\(token,key\)/);
  assert.match(frame,/setTimeout\(function\(\)\{state\.timer=null;requestDesktopCapture\(token,key\);\},10000\)/);
  assert.match(frame,/state\.inFlight=true/);
  assert.match(frame,/FLEET\.desktopCapture\.token!==token\|\|FLEET\.desktopCapture\.key!==key/);
  assert.match(frame,/controller\.abort\(\)/);
  assert.match(frame,/visibilitychange/);
  assert.match(frame,/pagehide/);
  assert.match(frame,/stopDesktopCapture\(true,"Vista detenida: Experto está compactado\."\)/);
  assert.match(frame,/fleetKey\(item\)!==state\.key/);
  assert.match(frame,/Captura fallida: /);
  assert.match(frame,/Capturada /);
  assert.match(css,/\.yk-app-capture-meta\.stale/);
});

test("un reinicio con el mismo slot y PID nuevo corta la captura sin reintentar",()=>{
  assert.match(frame,/function sameDesktopCommandTarget\(item,target\)/);
  assert.match(frame,/Number\(item\.pid\)===Number\(target\.pid\)/);
  assert.match(frame,/fleetKey\(item\)!==state\.key\|\|!sameDesktopCommandTarget\(item,state\.target\)\)stopDesktopCapture/);
  assert.match(frame,/desktopCaptureTarget\(token,key\)[\s\S]*sameDesktopCommandTarget\(item,FLEET\.desktopCapture\.target\)\?item:null/);
});

test("un fallo terminal del watcher desconecta la captura y exige reconectar",()=>{
  assert.match(frame,/terminalError\.desktopCaptureTerminal=true/);
  assert.match(frame,/if\(error&&error\.desktopCaptureTerminal\)/);
  assert.match(frame,/stopDesktopCapture\(true,"Captura detenida: "/);
  assert.match(frame,/reconecta la Desktop App/);
});

test("el interruptor de DesktopApp pinta progreso hasta verificar el proceso real",()=>{
  assert.match(frame,/appActions:\{\}/);
  assert.match(frame,/function verifyFleetAppStart\(key, token\)/);
  assert.match(frame,/function verifyFleetAppStop\(key,token,stable\)/);
  assert.match(frame,/function pollFleetAgentControl\(id, deadline\)/);
  assert.match(frame,/"\/fleet\/agent\/control\?id="\+encodeURIComponent\(id\)/);
  assert.match(frame,/response\.status===404&&body\.error==="agent-control-command-not-found"/);
  assert.match(frame,/status:"lookup_pending"/);
  assert.match(frame,/body\.status === "failed" \|\| body\.status === "rejected"/);
  assert.match(frame,/Number\(current\.updated\)\*1000>=state\.orderAt/);
  assert.match(frame,/pollFleetAgentControl\(result\.command_id/);
  assert.match(frame,/proof_kind!=="absence_card"/);
  assert.match(frame,/stable_samples\)<3/);
  assert.match(frame,/action\.setAttribute\("aria-busy",String\(!!progress&&progress\.phase==="pending"\)\)/);
  assert.match(frame,/progress\.action==="start"\?"Abriendo…":"Cerrando…"/);
  assert.match(css,/@property --yk-app-progress/);
  assert.match(css,/conic-gradient\(from -90deg,var\(--yk-app-progress-color\) var\(--yk-app-progress\)/);
  assert.match(css,/@keyframes yk-app-border-progress\{to\{--yk-app-progress:360deg\}\}/);
  assert.match(css,/\.is-pending\.is-stop\{--yk-app-progress-color:#ff8a83\}/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});

test("Experto nace neutral y ninguna selección Desktop abre o conserva un PTY",()=>{
  assert.match(frame,/selected:"", selectedApp:""/);
  assert.doesNotMatch(frame,/FLEET\.selected=fleetKey\(clis\.find/);
  assert.match(frame,/Sin conexión · ningún PTY seleccionado/);
  assert.match(frame,/FLEET\.cliDisconnect=fleetButton\("Desconectar"/);
  assert.match(frame,/FLEET\.pty\.explicit=true/);
  assert.match(frame,/!FLEET\.pty\.explicit/);
  assert.doesNotMatch(frame,/if\(v\)setTimeout\(function\(\)\{connectSelectedPty/);
});
