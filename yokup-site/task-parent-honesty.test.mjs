import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [page, frame] = await Promise.all([
  readFile(new URL("./tareas.html", import.meta.url), "utf8"),
  readFile(new URL("./yk-frame.js", import.meta.url), "utf8")
]);

test("el hover TAREAS excluye archivo de la señal y lo muestra como deuda", () => {
  assert.match(frame, /if \(key === "tareas"\)/);
  assert.match(frame, /n: tc \+ tp \+ tn/);
  assert.match(frame, /\["archivadas incompletas", ta/);
  assert.match(frame, /no enciende la señal operativa/);
  assert.match(frame, /0 tareas operativas/);
});

test("la vista normal excluye archivo y Todas lo conserva", () => {
  assert.match(page, /if\(DFILTER\.mode!=="todas"&&!FOCUS\) scopedRows=scopedRows\.filter\(row=>!esDeudaArchivada\(row\)\)/);
  assert.match(page, /data-f="todas"|value="todas"/);
});

test("estado de tarea respeta done y sólo después el ciclo del padre", () => {
  const fn = page.slice(page.indexOf("function taskEstado"), page.indexOf("// Filtra los grupos", page.indexOf("function taskEstado")));
  const taskEstado = new Function(fn + "; return taskEstado;")();
  assert.equal(taskEstado({status:"done",mission_status:"cancelled"}), "Finalizada");
  assert.equal(taskEstado({status:"pending",mission_status:"resolved",owner:"SubOraculoMini"}), "Archivada incompleta");
  assert.equal(taskEstado({status:"in_progress",mission_status:"cancelled"}), "Archivada incompleta");
  assert.equal(taskEstado({status:"pending",operational_state:"orphaned",mission_status:null}), "Huérfana");
  assert.equal(taskEstado({status:"pending",mission_status:"unknown"}), "Padre inválido");
  assert.equal(taskEstado({status:"pending",mission_status:"unconcluded"}), "Padre inválido");
  assert.equal(taskEstado({status:"pending",mission_status:"open",owner:"SubOraculoMini"}), "Pendiente");
  assert.equal(taskEstado({status:"in_progress",mission_status:"in_progress"}), "En curso");
});

test("Todas etiqueta la deuda, desactiva acciones y conserva accesibilidad", () => {
  assert.match(page, /class="archive-note" role="status"/);
  assert.match(page, /badge\.className="archive-badge"/);
  assert.match(page, /chip\.disabled=true/);
  assert.match(page, /chip\.title=state\+" · misión padre "/);
  assert.match(page, /@media\(max-width:720px\)/);
});
