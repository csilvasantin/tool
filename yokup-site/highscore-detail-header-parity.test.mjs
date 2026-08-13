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

test("el único APP_NAV conserva YO KUP + Dashboard…Highscore y activa Highscore",()=>{
  const nav=frame.match(/var APP_NAV = \[([\s\S]*?)\n  \];/);
  assert.ok(nav);const labels=Array.from(nav[1].matchAll(/\["([A-Z]+)",\s+"([^"]+)"\]/g),match=>[match[1],match[2]]);
  assert.deepEqual(labels,[
    ["DASHBOARD","/dashboard"],["OBJETIVOS","/objetivos"],["DECISIONES","/decisiones"],
    ["MISIONES","/misiones"],["TAREAS","/tareas"],["INCIDENCIAS","/incidencias"],
    ["INFORMES","/informes"],["NOTIFICACIONES","/notificaciones"],["HIGHSCORE","/highscore"]
  ]);
  assert.match(frame,/if \(it\.active\) a\.setAttribute\("aria-current", "page"\)/);
  assert.match(frame,/var logo = el\("a", "yk-logo",[\s\S]*Yo<b>kup<\/b>/);
});
