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

test("Desktop Apps conserva el censo apagado y selecciona una identidad exacta",()=>{
  assert.match(frame,/function renderExpertApps\(\)/);
  assert.match(frame,/item\.host === "app"/);
  assert.match(frame,/FLEET\.selectedApp=fleetKey\(apps\.find/);
  assert.match(frame,/FLEET\.expertAppOpen\.has\(machine\)/);
  assert.match(frame,/item\.active\?\("PID "\+item\.pid\):"apagada · enciéndela para enviar"/);
  assert.match(frame,/power\.setAttribute\("role","switch"\)/);
  assert.match(frame,/fleetControl\(item,item\.active\?"stop":"start"\)/);
});

test("el compositor ofrece misión, tarea y objetivo sin fingir una PTY",()=>{
  assert.match(frame,/\[\["mission","Misión"\],\["task","Tarea"\],\["objective","Objetivo"\]\]/);
  assert.match(frame,/ykFetch\("\/fleet\/nudge"/);
  assert.match(frame,/machine:item\.machine,persona:item\.persona,runtime:item\.runtime,host:"app",priority:true/);
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
  assert.match(frame,/\/\/ "\+label\.toLowerCase\(\)\+" encolada para "/);
  assert.match(frame,/FLEET\.expertAppStatus/);
  assert.match(frame,/\[FLEET\.appStatus,FLEET\.cliStatus,FLEET\.cliBulkStatus,FLEET\.expertAppStatus\]/);
  assert.match(css,/\.yk-app-dispatch-status\.error\{color:#ff7f87\}/);
});

test("el interruptor de DesktopApp pinta progreso hasta verificar el proceso real",()=>{
  assert.match(frame,/appActions:\{\}/);
  assert.match(frame,/function verifyFleetAppControl\(key, token\)/);
  assert.match(frame,/function pollFleetAgentControl\(id, deadline\)/);
  assert.match(frame,/"\/fleet\/agent\/control\?id="\+encodeURIComponent\(id\)/);
  assert.match(frame,/response\.status===404&&body\.error==="agent-control-command-not-found"/);
  assert.match(frame,/status:"lookup_pending"/);
  assert.match(frame,/if\(action === "stop" \|\| result\.status === "already_running"/);
  assert.match(frame,/body\.status === "failed" \|\| body\.status === "rejected"/);
  assert.match(frame,/current\.active===\(state\.action==="start"\)/);
  assert.match(frame,/setTimeout\(function\(\)\{verifyFleetAppControl\(key,token\);\},900\)/);
  assert.match(frame,/action\.setAttribute\("aria-busy",String\(!!progress&&progress\.phase==="pending"\)\)/);
  assert.match(frame,/progress\.action==="start"\?"Abriendo…":"Cerrando…"/);
  assert.match(css,/@property --yk-app-progress/);
  assert.match(css,/conic-gradient\(from -90deg,var\(--yk-app-progress-color\) var\(--yk-app-progress\)/);
  assert.match(css,/@keyframes yk-app-border-progress\{to\{--yk-app-progress:360deg\}\}/);
  assert.match(css,/\.is-pending\.is-stop\{--yk-app-progress-color:#ff8a83\}/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});
