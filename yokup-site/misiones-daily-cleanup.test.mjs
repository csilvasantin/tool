import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const source = await readFile(new URL("./yk-misiones.js", import.meta.url), "utf8");
const board = await readFile(new URL("./misiones.html", import.meta.url), "utf8");
const css = await readFile(new URL("./yk-misiones.css", import.meta.url), "utf8");

function loadModule() {
  const windowObj = {};
  const ctx = vm.createContext({
    window:windowObj, document:{addEventListener(){},querySelector(){return null;}},
    localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
    Date, Intl, Math, JSON, Promise, RegExp, Object, Array, String, Number, Boolean,
    setTimeout, clearTimeout, console
  });
  vm.runInContext(source, ctx);
  return windowObj.YkMisiones;
}

const Yk = loadModule();
const daily = {
  id:"FLT-DIARIA", subject:"Cierre de muestra", priority:"normal",
  status:"cancelled", visible_state:"cancelled", closure_reason:"daily_cleanup",
  // 08/08/2026 00:00 Europe/Madrid (CEST).
  closed_at:Date.UTC(2026, 7, 7, 22, 0), created_at:Date.UTC(2026, 7, 7, 8, 0)
};

test("consume únicamente el contrato canónico de cierre diario", () => {
  const meta = Yk.dailyClosureMeta(daily);
  assert.equal(meta.date, "08/08/2026 00:00 (Madrid)");
  assert.match(meta.text, /Eliminada automáticamente al cierre del día/);
  assert.match(meta.text, /Cierre recuperable; no es un borrado físico/);

  assert.equal(Yk.dailyClosureMeta({...daily, closure_reason:null, note:"cierre diario"}), null,
    "una nota legacy no fabrica la causa");
  assert.equal(Yk.dailyClosureMeta({...daily, status:"open"}), null);
  assert.equal(Yk.dailyClosureMeta({...daily, visible_state:"unconcluded"}), null);
});

test("la fila sigue compacta pero su estado diario es accesible", () => {
  const html = Yk.rowHtml(daily);
  assert.match(html, /aria-label="Eliminada automáticamente al cierre del día · 08\/08\/2026 00:00 \(Madrid\)\./);
  assert.match(html, />Eliminada<\/span>/);
  assert.doesNotMatch(html, /class="cancel-note"/, "no añade prosa a la cuadrícula");

  const manual = Yk.rowHtml({...daily, id:"FLT-MANUAL", closure_reason:null, closed_at:null, note:"Retirada por Carlos"});
  assert.doesNotMatch(manual, /aria-label="Eliminada automáticamente/);
  assert.match(manual, /class="cancel-note"[^>]*>Retirada por Carlos<\/small>/,
    "la cancelación manual conserva el comportamiento previo");
});

test("la ayuda explica transición, recuperación y ausencia de borrado", () => {
  assert.match(board, /<details class="mission-policy">[\s\S]*<summary>¿Qué ocurre al cerrar el día\?<\/summary>/);
  assert.match(board, /<b>No concluidas<\/b> pasan automáticamente a <b>Eliminadas<\/b>/);
  assert.match(board, /no borra la misión, sus tareas, pruebas ni historial/);
});

test("el detalle muestra causa y fecha sin inferir aliases", () => {
  assert.match(source, /dailyClose \? '<div class="mdet-policy" role="note" aria-label="'/);
  assert.match(source, /Cierre diario · '[\s\S]*Pasó automáticamente de No concluida a Eliminada/);
  assert.match(source, /Se puede reabrir; la misión, sus tareas, pruebas e historial siguen conservados/);
  assert.doesNotMatch(source, /closure_reason \|\||closed_reason|cancel_reason/);
});

test("contadores cambian de No concluidas a Eliminadas según visible_counts", () => {
  assert.match(board, /nNoCon=Number\(vc\.unconcluded\)\|\|0/);
  assert.match(board, /nDel=Number\(vc\.cancelled\)\|\|0/);
  assert.match(board, /\$\("kNoCon"\)\.textContent=nNoCon/);
  assert.match(board, /\$\("kDel"\)\.textContent=nDel/);
});

test("ayuda y detalle conservan lectura y blancos táctiles en móvil", () => {
  assert.match(board, /@media\(max-width:560px\)\{\.mission-policy summary\{min-height:44px;display:flex;align-items:center\}/);
  assert.match(css, /\.mdet-policy\{[\s\S]*overflow-wrap:anywhere\}/);
  assert.match(css, /@media\(max-width:520px\)\{\.mdet-policy\{padding:8px;font-size:11px\}/);
});
