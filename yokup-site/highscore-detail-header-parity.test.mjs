import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const frame=fs.readFileSync(new URL("./yk-frame.js",import.meta.url),"utf8");
const highscore=fs.readFileSync(new URL("./highscore.html",import.meta.url),"utf8");
const detail=fs.readFileSync(new URL("./highscoreDetail.html",import.meta.url),"utf8");

test("HighscoreDetail hereda la ruta Highscore del frame canónico sin copiar el menú",()=>{
  assert.match(highscore,/<body data-yk-title="HIGHSCORE" data-yk-zone="app">/);
  assert.match(detail,/<body data-yk-title="HIGHSCORE" data-yk-zone="app" data-yk-parent="\/highscore">/);
  assert.doesNotMatch(detail,/data-yk-title="DETALLE HIGHSCORE"/);
  assert.match(frame,/var parentPath = document\.body\.getAttribute\("data-yk-parent"\)/);
  assert.match(frame,/var path = \(parentPath \|\| location\.pathname/);
});

test("el único APP_NAV conserva yokup● + Dashboard…Highscore y activa Highscore",()=>{
  const nav=frame.match(/var APP_NAV = \[([\s\S]*?)\n  \];/);
  assert.ok(nav);const labels=Array.from(nav[1].matchAll(/\["([A-Z]+)",\s+"([^"]+)"\]/g),match=>[match[1],match[2]]);
  assert.deepEqual(labels,[
    ["DASHBOARD","/dashboard"],["OBJETIVOS","/objetivos"],["DECISIONES","/decisiones"],
    ["MISIONES","/misiones"],["TAREAS","/tareas"],["INCIDENCIAS","/incidencias"],
    ["SUPERVISOR","/supervisor"],["INFORMES","/informes"],["NOTIFICACIONES","/notificaciones"],["HIGHSCORE","/highscore"]
  ]);
  assert.match(frame,/if \(it\.active\) a\.setAttribute\("aria-current", "page"\)/);
  // Logo: el wordmark yokup● del Portal del comercio (FLT-101338, canon de la
  // Galaxia: cada web lleva su marca). Antes, el de Admira pixelado (17-09-2026).
  assert.match(frame,/var logo = el\("a", "yk-logo",\s*'<span class="yk-logo-word">yokup<\/span><span class="yk-logo-dot" aria-hidden="true">●<\/span>'\)/);
  assert.match(frame,/logo\.setAttribute\("aria-label", "Yokup · volver al inicio"\)/);
  assert.doesNotMatch(frame,/admira-logo-retro\.svg/);
});
