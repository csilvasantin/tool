import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("./highscore.html",import.meta.url),"utf8");
const state=fs.readFileSync(new URL("./highscore-runner-state.css",import.meta.url),"utf8");

test("highscore carga la capa aislada de estado después del CSS base",()=>{
  assert.match(html,/<\/style>\s*<link rel="stylesheet" href="\/highscore-runner-state\.css\?v=20260901-static-last-work-runner">/);
});

test("last_work usa zancada gris estática y nunca el idle erguido",()=>{
  assert.match(state,/data-work-state="last_work"\] \.runner-standing[\s\S]*display:none!important/);
  assert.match(state,/data-work-state="last_work"\] \.runner-run-a[\s\S]*display:block!important[\s\S]*animation:none!important[\s\S]*opacity:1!important/);
  assert.match(html,/data-work-state\]:not\(\[data-work-state="running"\]\) \.refresh-runner\{[\s\S]*--runner-skin:#b8c0c5/,
    "el estado terminado conserva la paleta gris factual ya compartida con stale");
});
